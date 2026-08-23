-- Record the rules fingerprint a room was created under, and let the server reject a room
-- whose fingerprint no longer matches the deployed engine.
--
-- `rules_version` cannot do this. Twice a rules change has shipped inside an unchanged
-- version string -- Guan's Order hand limit, then Ding's extra-vessel cost and Jun's
-- activation price -- so a room created before the change and one created after both read
-- '1.1.5'. The version gate exists precisely to stop an old game being reinterpreted under
-- new rules, and it cannot see a difference here. The result is an in-progress game whose
-- rules change under its players mid-session, with nothing raised anywhere.
--
-- The fingerprint is computed by the engine (src/game/rulesFingerprint.ts) as
-- `r<behaviour-revision>-<content-digest>`: the digest is hashed from data/*.json, and the
-- revision is bumped by hand for changes that live in engine logic with no data behind them.
--
-- Nullable on purpose. Rooms created before this migration have no recorded fingerprint and
-- cannot have one reconstructed, so null means "created before fingerprinting" and is
-- accepted, leaving the existing rules-version gate as their only check. Backfilling them
-- with the current value would assert something we do not know.

alter table public.rooms add column if not exists content_digest text;

comment on column public.rooms.content_digest is
  'Rules fingerprint at room creation, r<revision>-<digest>. Null for rooms predating 202608230003.';

-- 202608230001's definition with the fingerprint threaded through; everything else is
-- byte-identical so room codes, seat indexing and colour assignment are untouched.
create or replace function public.server_create_room(
  p_room_id uuid, p_code text, p_seat_id uuid, p_player_id text,
  p_display_name text, p_colour text, p_auth_user_id uuid, p_token_hash text,
  p_content_digest text default null
) returns jsonb
language plpgsql security definer
set search_path = public, private, extensions, pg_temp
as $$
declare v_room jsonb; v_seat jsonb;
begin
  insert into public.rooms (id, code, status, host_seat_id, rules_version, content_version, latest_revision, content_digest)
  values (p_room_id, upper(p_code), 'lobby', p_seat_id, '1.1.5', '1.1.5', 0, p_content_digest);
  insert into public.room_players (seat_id, room_id, player_id, seat_index, display_name, colour, is_host)
  values (p_seat_id, p_room_id, p_player_id, 0, btrim(p_display_name), p_colour, true);
  if p_auth_user_id is not null then
    insert into private.room_memberships (seat_id, room_id, auth_user_id)
    values (p_seat_id, p_room_id, p_auth_user_id);
  end if;
  insert into private.room_seat_credentials (seat_id, room_id, token_hash)
  values (p_seat_id, p_room_id, p_token_hash);
  select jsonb_build_object(
    'id', r.id, 'code', r.code, 'status', r.status, 'hostSeatId', r.host_seat_id,
    'rulesVersion', r.rules_version, 'contentVersion', r.content_version,
    'contentDigest', r.content_digest,
    'latestRevision', r.latest_revision, 'endedAt', r.ended_at,
    'endedByPlayerId', r.ended_by_player_id
  ) into v_room from public.rooms r where r.id = p_room_id;
  select jsonb_build_object(
    'seatId', rp.seat_id, 'roomId', rp.room_id, 'playerId', rp.player_id,
    'seatIndex', rp.seat_index, 'displayName', rp.display_name, 'colour', rp.colour,
    'isHost', rp.is_host, 'isComputer', rp.is_ai,
    'aiPolicyVersion', null, 'authUserId', p_auth_user_id,
    'aiSeed', null, 'aiCreatedCommandId', null
  ) into v_seat from public.room_players rp where rp.seat_id = p_seat_id;
  return jsonb_build_object('status', 'ok', 'value', jsonb_build_object('room', v_room, 'seat', v_seat));
exception when unique_violation then
  return jsonb_build_object('status', 'error', 'code', 'room_code_conflict');
end;
$$;

-- 202608100002's definition with contentDigest added to the room payload.
create or replace function public.server_authenticate_seat(p_code text, p_token_hash text)
returns jsonb
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select jsonb_build_object(
    'room', jsonb_build_object(
      'id', r.id, 'code', r.code, 'status', r.status, 'hostSeatId', r.host_seat_id,
      'rulesVersion', r.rules_version, 'contentVersion', r.content_version,
      'contentDigest', r.content_digest,
      'latestRevision', r.latest_revision, 'endedAt', r.ended_at,
      'endedByPlayerId', r.ended_by_player_id
    ),
    'seat', jsonb_build_object(
      'seatId', rp.seat_id, 'roomId', rp.room_id, 'playerId', rp.player_id,
      'seatIndex', rp.seat_index, 'displayName', rp.display_name, 'colour', rp.colour,
      'isHost', rp.is_host, 'isComputer', rp.is_ai,
      'aiPolicyVersion', ai.policy_version, 'authUserId', null,
      'aiSeed', ai.ai_seed, 'aiCreatedCommandId', ai.created_command_id
    )
  )
  from public.rooms r
  join public.room_players rp on rp.room_id = r.id
  join private.room_seat_credentials c on c.seat_id = rp.seat_id and c.room_id = r.id
  left join private.room_ai_seats ai on ai.seat_id = rp.seat_id
  where r.code = upper(p_code) and c.token_hash = p_token_hash and c.revoked_at is null
  limit 1;
$$;

revoke all on function public.server_create_room(uuid, text, uuid, text, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.server_create_room(uuid, text, uuid, text, text, text, uuid, text, text) to service_role;
revoke all on function public.server_authenticate_seat(text, text) from public, anon, authenticated;
grant execute on function public.server_authenticate_seat(text, text) to service_role;
