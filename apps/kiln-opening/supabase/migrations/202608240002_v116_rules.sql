-- Kiln Opening v1.1.6 authoritative rules/content transition.
--
-- Unstarted lobbies upgrade; started v1.1.5 games stay immutable and are rejected by the
-- Edge Function rather than reinterpreted. v1.1.6 changes End-game Exhibition capacity and
-- Quality values, halves the Round-5 Apprentice compensation, reprices three Techniques,
-- reworks Colour Samples and raises two Market Orders, so a serialized v1.1.5 game has no
-- faithful v1.1.6 reading.

alter table public.rooms drop constraint if exists rooms_rules_version_check;
alter table public.rooms drop constraint if exists rooms_content_version_check;

alter table public.rooms add constraint rooms_rules_version_check
  check (rules_version in ('0.4', '0.5', '0.6.1', '0.6.3', '0.6.5', '1.0.0', '1.0.1', '1.0.2', '1.0.4', '1.0.9', '1.1.1', '1.1.4', '1.1.5', '1.1.6'));
alter table public.rooms add constraint rooms_content_version_check
  check (content_version in ('0.4', '0.5', '0.6.1', '0.6.3', '0.6.5', '1.0.0', '1.0.1', '1.0.2', '1.0.4', '1.0.9', '1.1.1', '1.1.4', '1.1.5', '1.1.6'));

update public.rooms
set rules_version = '1.1.6', content_version = '1.1.6', updated_at = now()
where status = 'lobby';

-- 202608230003's definition with the stamped version moved to 1.1.6. The signature is
-- unchanged, so this replaces rather than overloads -- the fault that broke room creation
-- in 202608230003 and had to be repaired in 202608240001.
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
  values (p_room_id, upper(p_code), 'lobby', p_seat_id, '1.1.6', '1.1.6', 0, p_content_digest);
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

revoke all on function public.server_create_room(uuid, text, uuid, text, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.server_create_room(uuid, text, uuid, text, text, text, uuid, text, text) to service_role;
