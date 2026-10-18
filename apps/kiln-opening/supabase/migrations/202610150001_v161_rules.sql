-- V1.6.2 (state schema 8, rules behaviour revision 31): new rooms only.
--
-- Written for V1.6.1 (schema 6, r29) and edited in place for V1.6.2 before any deployment
-- (ENGINE_V1.6.2_DELTA.md §9), again for owner revision 3 (changes 25–27: schema 8, r31, the
-- five Contribution cards); the file keeps its name. No V1.6.1 room was ever stored.
--
-- Older rooms, saves, private submissions and events stay as readable history; they are
-- never rewritten or relabelled. Every write path refuses them by rules version, schema
-- and fingerprint (DIG: "V1.4 rooms are rejected, never migrated").
--
-- Every gate that hard-coded V1.4 in an earlier migration is rewritten here. Missing any
-- one would make every V1.6.2 commit fail with "unsupported rules or schema version":
--   constraints  rooms_rules_version_check, rooms_content_version_check,
--                room_ai_seats_policy_version_check,
--                private_submissions_contribution_card_check,
--                private_submissions_fuel_ledger_card_check (historical rows only)
--                (rooms_v14_fingerprint_check is kept for V1.4 rows; V1.6.2 adds its own)
--   functions    server_create_room, server_join_room, server_add_computer_seat,
--                server_commit_start, server_commit_transition (the five r23–r28 gates of
--                202609260001 … 202610020001), server_load_private_submissions,
--                server_find_own_pending (return shape)
--   new          server_list_private_events

-- ── Rooms: version allow-list and fingerprint ───────────────────────────────────────

alter table public.rooms drop constraint if exists rooms_rules_version_check;
alter table public.rooms drop constraint if exists rooms_content_version_check;

alter table public.rooms add constraint rooms_rules_version_check
  check (rules_version in (
    '0.4', '0.5', '0.6.1', '0.6.3', '0.6.5', '1.0.0', '1.0.1', '1.0.2',
    '1.0.4', '1.0.9', '1.1.1', '1.1.4', '1.1.5', '1.1.6', '1.2.2', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.4',
    '1.6.2'
  ));
alter table public.rooms add constraint rooms_content_version_check
  check (content_version in (
    '0.4', '0.5', '0.6.1', '0.6.3', '0.6.5', '1.0.0', '1.0.1', '1.0.2',
    '1.0.4', '1.0.9', '1.1.1', '1.1.4', '1.1.5', '1.1.6', '1.2.2', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.4',
    '1.6.2'
  ));

-- The V1.4 fingerprint check stays for V1.4 rows; V1.6.2 rooms carry an r31 fingerprint.
alter table public.rooms drop constraint if exists rooms_v162_fingerprint_check;
alter table public.rooms add constraint rooms_v162_fingerprint_check
  check (
    rules_version <> '1.6.2'
    or (
      content_version = '1.6.2'
      and coalesce(content_digest, '') ~ '^r31-[0-9a-f]{16}$'
    )
  );

-- ── Computer seats ───────────────────────────────────────────────────────────────────

-- V1.6.2 policies are labelled `rules-v1.6.2-<name>-<nnn>` and passed in by the service,
-- so a new policy needs no migration. Historical labels stay valid for old rows.
alter table private.room_ai_seats drop constraint if exists room_ai_seats_policy_version_check;
alter table private.room_ai_seats add constraint room_ai_seats_policy_version_check
  check (
    policy_version in (
      'selfplay-003', 'rules-v1.1.1-wood-001', 'rules-v1.1.4-contribution-001',
      'rules-v1.1.5-order-001', 'rules-v1.2.2-heuristic-001', 'rules-v1.2.4-heuristic-001', 'rules-v1.2.5-heuristic-001',
      'rules-v1.2.6-heuristic-001', 'rules-v1.2.6-strategic-002', 'rules-v1.2.7-strategic-002', 'rules-v1.4-strategic-001'
    )
    or policy_version ~ '^rules-v1\.6\.2-[a-z0-9]+(-[a-z0-9]+)*$'
  );

-- ── Private submissions: the V1.6.2 card set ─────────────────────────────────────────

-- V1.6.2 has five Contribution cards (change 26, v1.6.2 L93, L266, L634): Bank, Tend and Stoke,
-- and Fuel Ledger's own FUEL_LEDGER_BANK and FUEL_LEDGER_STOKE, which replaced the secret Wood
-- commitment. A V1.6.2 row stores only its card; `use_fuel_ledger` stays false. NOT VALID:
-- enforced on every new or changed row, while historical V1.4 BANK_2/STOKE_2 rows remain as
-- audit history. A null card is a pre-card numeric row
-- (`private_submissions_contribution_present_check`).
alter table private.private_submissions drop constraint if exists private_submissions_contribution_card_check;
alter table private.private_submissions add constraint private_submissions_contribution_card_check
  check (contribution_card is null or contribution_card in ('BANK', 'TEND', 'STOKE', 'FUEL_LEDGER_BANK', 'FUEL_LEDGER_STOKE')) not valid;

alter table private.private_submissions
  add column if not exists use_fuel_ledger boolean not null default false;

alter table private.private_submissions drop constraint if exists private_submissions_fuel_ledger_card_check;
alter table private.private_submissions add constraint private_submissions_fuel_ledger_card_check
  check (
    not use_fuel_ledger
    or contribution_card in ('BANK', 'STOKE')
    -- Historical numeric rows belong to old-version rooms and are never loaded.
    or (contribution_card is null and contribution is not null)
  );

comment on column private.private_submissions.use_fuel_ledger is
  'History only. Pre-V1.4 rows: the V1.2.2 Fuel Ledger commitment. V1.4 rows recorded BANK_2/STOKE_2 cards instead. V1.6.2 rows never set it: Fuel Ledger brings its own FUEL_LEDGER_BANK and FUEL_LEDGER_STOKE cards (change 26).';

create or replace function public.server_load_private_submissions(p_room_id uuid, p_window_id text)
returns jsonb language sql stable security definer set search_path = private, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'roomId', ps.room_id, 'windowId', ps.window_id, 'playerId', ps.player_id,
    'commandId', ps.command_id, 'card', ps.contribution_card,
    'revealedRevision', ps.revealed_revision
  ) order by ps.submitted_at), '[]'::jsonb)
  from private.private_submissions ps
  where ps.room_id = p_room_id and ps.window_id = p_window_id and ps.revealed_revision is null;
$$;

create or replace function public.server_find_own_pending(p_room_id uuid, p_player_id text)
returns jsonb language sql stable security definer set search_path = private, pg_temp
as $$
  select jsonb_build_object(
    'roomId', ps.room_id, 'windowId', ps.window_id, 'playerId', ps.player_id,
    'commandId', ps.command_id, 'card', ps.contribution_card,
    'revealedRevision', ps.revealed_revision
  ) from private.private_submissions ps
  where ps.room_id = p_room_id and ps.player_id = p_player_id and ps.revealed_revision is null
  order by ps.submitted_at desc limit 1;
$$;

-- ── Room creation and joining ────────────────────────────────────────────────────────

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
  if coalesce(p_content_digest, '') !~ '^r31-[0-9a-f]{16}$' then
    return jsonb_build_object('status', 'error', 'code', 'session_not_active');
  end if;
  insert into public.rooms (id, code, status, host_seat_id, rules_version, content_version, latest_revision, content_digest)
  values (p_room_id, upper(p_code), 'lobby', p_seat_id, '1.6.2', '1.6.2', 0, p_content_digest);
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

-- Joining rejects historical lobbies before assigning a seat.
create or replace function public.server_join_room(
  p_code text,
  p_seat_id uuid,
  p_display_name text,
  p_auth_user_id uuid,
  p_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_seat_index integer;
  v_player_id text;
  v_colour text;
  v_seat jsonb;
begin
  select * into v_room from public.rooms where code = upper(p_code) for update;
  if not found then return jsonb_build_object('status', 'error', 'code', 'room_not_found'); end if;
  if v_room.status <> 'lobby' then
    return jsonb_build_object('status', 'error', 'code', 'game_already_started');
  end if;
  if v_room.rules_version <> '1.6.2'
     or v_room.content_version <> '1.6.2'
     or coalesce(v_room.content_digest, '') !~ '^r31-[0-9a-f]{16}$' then
    return jsonb_build_object('status', 'error', 'code', 'session_not_active');
  end if;
  select candidate into v_seat_index
  from generate_series(0, 3) candidate
  where not exists (
    select 1 from public.room_players rp
    where rp.room_id = v_room.id and rp.seat_index = candidate
  )
  order by candidate
  limit 1;
  if v_seat_index is null then return jsonb_build_object('status', 'error', 'code', 'room_full'); end if;
  v_player_id := 'P' || (v_seat_index + 1)::text;
  v_colour := (array['cinnabar', 'celadon', 'ink', 'moon-white'])[v_seat_index + 1];
  insert into public.room_players (
    seat_id, room_id, player_id, seat_index, display_name, colour, is_host
  ) values (
    p_seat_id, v_room.id, v_player_id, v_seat_index, btrim(p_display_name), v_colour, false
  );
  if p_auth_user_id is not null then
    insert into private.room_memberships (seat_id, room_id, auth_user_id)
    values (p_seat_id, v_room.id, p_auth_user_id);
  end if;
  insert into private.room_seat_credentials (seat_id, room_id, token_hash)
  values (p_seat_id, v_room.id, p_token_hash);

  select jsonb_build_object(
    'seatId', rp.seat_id, 'roomId', rp.room_id, 'playerId', rp.player_id,
    'seatIndex', rp.seat_index, 'displayName', rp.display_name, 'colour', rp.colour,
    'isHost', rp.is_host, 'isComputer', rp.is_ai,
    'aiPolicyVersion', null, 'authUserId', p_auth_user_id,
    'aiSeed', null, 'aiCreatedCommandId', null
  ) into v_seat from public.room_players rp where rp.seat_id = p_seat_id;
  return jsonb_build_object(
    'status', 'ok',
    'value', jsonb_build_object(
      'room', jsonb_build_object(
        'id', v_room.id, 'code', v_room.code, 'status', v_room.status,
        'hostSeatId', v_room.host_seat_id, 'rulesVersion', v_room.rules_version,
        'contentVersion', v_room.content_version, 'contentDigest', v_room.content_digest,
        'latestRevision', v_room.latest_revision, 'endedAt', v_room.ended_at,
        'endedByPlayerId', v_room.ended_by_player_id
      ),
      'seat', v_seat
    )
  );
exception
  when unique_violation then
    return jsonb_build_object('status', 'error', 'code', 'seat_already_joined');
end;
$$;

-- The service passes its policy label, so the V1.4 six-argument form (which stamped
-- 'rules-v1.4-strategic-001') is replaced, not overloaded.
drop function if exists public.server_add_computer_seat(uuid, uuid, uuid, text, bigint, uuid);

create or replace function public.server_add_computer_seat(
  p_room_id uuid,
  p_host_seat_id uuid,
  p_seat_id uuid,
  p_display_name text,
  p_ai_seed bigint,
  p_command_id uuid,
  p_policy_version text
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_seat_index integer;
  v_player_id text;
  v_colour text;
  v_seat jsonb;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then return jsonb_build_object('status', 'error', 'code', 'room_not_found'); end if;
  if v_room.host_seat_id <> p_host_seat_id or not exists (
    select 1 from public.room_players rp
    where rp.room_id = p_room_id and rp.seat_id = p_host_seat_id and rp.is_host and not rp.is_ai
  ) then
    return jsonb_build_object('status', 'error', 'code', 'host_only');
  end if;
  if v_room.status <> 'lobby' then
    return jsonb_build_object('status', 'error', 'code', 'game_already_started');
  end if;
  if v_room.rules_version <> '1.6.2'
     or v_room.content_version <> '1.6.2'
     or coalesce(v_room.content_digest, '') !~ '^r31-[0-9a-f]{16}$'
     or coalesce(p_policy_version, '') !~ '^rules-v1\.6\.2-[a-z0-9]+(-[a-z0-9]+)*$' then
    return jsonb_build_object('status', 'error', 'code', 'session_not_active');
  end if;

  select jsonb_build_object(
    'seatId', rp.seat_id, 'roomId', rp.room_id, 'playerId', rp.player_id,
    'seatIndex', rp.seat_index, 'displayName', rp.display_name, 'colour', rp.colour,
    'isHost', rp.is_host, 'isComputer', rp.is_ai,
    'aiPolicyVersion', ai.policy_version, 'authUserId', null,
    'aiSeed', ai.ai_seed, 'aiCreatedCommandId', ai.created_command_id
  ) into v_seat
  from private.room_ai_seats ai
  join public.room_players rp on rp.seat_id = ai.seat_id
  where ai.room_id = p_room_id and ai.created_command_id = p_command_id;
  if found then return jsonb_build_object('status', 'ok', 'value', v_seat); end if;

  select candidate into v_seat_index
  from generate_series(0, 3) candidate
  where not exists (
    select 1 from public.room_players rp
    where rp.room_id = p_room_id and rp.seat_index = candidate
  )
  order by candidate
  limit 1;
  if v_seat_index is null then return jsonb_build_object('status', 'error', 'code', 'room_full'); end if;

  v_player_id := 'P' || (v_seat_index + 1)::text;
  v_colour := (array['cinnabar', 'celadon', 'ink', 'moon-white'])[v_seat_index + 1];
  insert into public.room_players (
    seat_id, room_id, player_id, seat_index, display_name, colour, is_host, is_ai
  ) values (
    p_seat_id, p_room_id, v_player_id, v_seat_index, btrim(p_display_name), v_colour, false, true
  );
  insert into private.room_ai_seats (
    seat_id, room_id, policy_version, ai_seed, created_command_id
  ) values (
    p_seat_id, p_room_id, p_policy_version, p_ai_seed, p_command_id
  );

  select jsonb_build_object(
    'seatId', rp.seat_id, 'roomId', rp.room_id, 'playerId', rp.player_id,
    'seatIndex', rp.seat_index, 'displayName', rp.display_name, 'colour', rp.colour,
    'isHost', rp.is_host, 'isComputer', rp.is_ai,
    'aiPolicyVersion', ai.policy_version, 'authUserId', null,
    'aiSeed', ai.ai_seed, 'aiCreatedCommandId', ai.created_command_id
  ) into v_seat
  from public.room_players rp
  join private.room_ai_seats ai on ai.seat_id = rp.seat_id
  where rp.seat_id = p_seat_id;
  return jsonb_build_object('status', 'ok', 'value', v_seat);
end;
$$;

-- ── Commits ──────────────────────────────────────────────────────────────────────────

-- The game start now persists createGame's events (GAME_CREATED, each seat's secret
-- ORDERS_DEALT, the setup display events), so public_states.event_sequence equals the
-- persisted event count. The V1.4 nine-argument form is replaced, not overloaded.
drop function if exists public.server_commit_start(uuid, uuid, text, jsonb, bigint, bigint, text, jsonb, jsonb);

create or replace function public.server_commit_start(
  p_room_id uuid,
  p_command_id uuid,
  p_actor_id text,
  p_state jsonb,
  p_rng_state bigint,
  p_root_seed bigint,
  p_state_hash text,
  p_public_state jsonb,
  p_response jsonb,
  p_full_events jsonb,
  p_public_events jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_prior private.processed_commands%rowtype;
  v_count integer;
  v_sequence bigint := 0;
  v_previous_hash text := 'GENESIS';
  v_event_hash text;
  v_full_event jsonb;
  v_public_event jsonb;
  v_index integer;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then return jsonb_build_object('status', 'error', 'code', 'room_not_found'); end if;
  select * into v_prior from private.processed_commands
  where room_id = p_room_id and command_id = p_command_id;
  if found then
    return jsonb_build_object('status', 'duplicate', 'processed', jsonb_build_object(
      'roomId', v_prior.room_id, 'commandId', v_prior.command_id,
      'actorId', v_prior.actor_player_id, 'response', v_prior.response_json
    ));
  end if;
  if v_room.status <> 'lobby' or exists (select 1 from private.game_heads where room_id = p_room_id) then
    return jsonb_build_object('status', 'error', 'code', 'game_already_started');
  end if;
  if coalesce(v_room.rules_version, '') <> '1.6.2'
     or coalesce(v_room.content_version, '') <> '1.6.2'
     or coalesce(v_room.content_digest, '') !~ '^r31-[0-9a-f]{16}$'
     or coalesce(p_state->>'rulesVersion', '') <> '1.6.2'
     or coalesce(p_public_state->>'rulesVersion', '') <> '1.6.2'
     or coalesce((p_state->>'schemaVersion')::integer, -1) <> 8
     or coalesce((p_public_state->>'schemaVersion')::integer, -1) <> 8 then
    return jsonb_build_object('status', 'error', 'code', 'session_not_active');
  end if;
  select count(*) into v_count from public.room_players where room_id = p_room_id;
  if v_count < 2 then return jsonb_build_object('status', 'error', 'code', 'not_enough_players'); end if;

  -- Hidden information never reaches a public row (DESIGN §4): no `hidden` (hands, decks,
  -- the face-down Main discard, looks, peeks) and no event `secret`.
  if p_public_state ? 'hidden' or not (p_public_state ? 'counts')
     or (p_response->'game') ? 'hidden' then
    raise exception 'public state carries hidden information';
  end if;
  if jsonb_typeof(p_full_events) <> 'array' or jsonb_typeof(p_public_events) <> 'array'
     or jsonb_array_length(p_full_events) <> jsonb_array_length(p_public_events) then
    raise exception 'full/public event arrays differ';
  end if;
  if exists (select 1 from jsonb_array_elements(p_public_events) e where e ? 'secret') then
    raise exception 'public event carries a secret';
  end if;
  if jsonb_array_length(p_full_events) <> coalesce((p_state->>'eventSequence')::bigint, -1) then
    raise exception 'event sequence mismatch';
  end if;

  insert into private.game_heads (
    room_id, revision, state_json, rng_state, root_seed, state_hash
  ) values (p_room_id, 0, p_state, p_rng_state, p_root_seed, p_state_hash);
  insert into private.game_snapshots (room_id, revision, state_json, rng_state, state_hash)
  values (p_room_id, 0, p_state, p_rng_state, p_state_hash);
  insert into private.game_commands (
    room_id, command_id, actor_player_id, revision, command_json, is_private
  ) values (p_room_id, p_command_id, p_actor_id, 0, '{"type":"START_GAME"}'::jsonb, false);
  if jsonb_array_length(p_full_events) > 0 then
    for v_index in 0..jsonb_array_length(p_full_events) - 1 loop
      v_sequence := v_sequence + 1;
      v_full_event := p_full_events->v_index; v_public_event := p_public_events->v_index;
      v_event_hash := encode(extensions.digest(concat_ws('|', v_previous_hash,
        '0', p_command_id::text, v_full_event::text, p_state_hash), 'sha256'), 'hex');
      insert into private.game_events (room_id, sequence, revision, command_id, actor_player_id,
        event_type, full_payload, public_payload, previous_hash, event_hash, state_hash)
      values (p_room_id, v_sequence, 0, p_command_id, p_actor_id,
        v_full_event->>'type', v_full_event, v_public_event, v_previous_hash, v_event_hash, p_state_hash);
      insert into public.game_public_events (room_id, sequence, revision, command_id, actor_player_id, event_type, payload)
      values (p_room_id, v_sequence, 0, p_command_id, p_actor_id, v_public_event->>'type', v_public_event);
      v_previous_hash := v_event_hash;
    end loop;
  end if;
  insert into public.game_public_states (room_id, revision, event_sequence, state_json)
  values (p_room_id, 0, v_sequence, p_public_state);
  insert into private.processed_commands (
    room_id, command_id, actor_player_id, resulting_revision, response_json, response_hash
  ) values (
    p_room_id, p_command_id, p_actor_id, 0, p_response,
    encode(extensions.digest(p_response::text, 'sha256'), 'hex')
  );
  update public.rooms set status = 'playing', latest_revision = 0, updated_at = now()
  where id = p_room_id;
  return jsonb_build_object('status', 'ok', 'value', p_response);
end;
$$;

create or replace function public.server_commit_transition(
  p_room_id uuid, p_command_id uuid, p_actor_id text, p_expected_revision bigint,
  p_previous_state_hash text, p_next_revision bigint, p_next_state jsonb,
  p_rng_state bigint, p_root_seed bigint, p_state_hash text, p_command jsonb,
  p_full_events jsonb, p_public_events jsonb, p_public_state jsonb,
  p_response jsonb, p_private_submission jsonb default null
) returns jsonb
language plpgsql security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_head private.game_heads%rowtype; v_prior private.processed_commands%rowtype;
  v_sequence bigint; v_previous_hash text; v_event_hash text;
  v_full_event jsonb; v_public_event jsonb; v_index integer; v_window_id text;
  v_card text;
begin
  select * into v_head from private.game_heads where room_id = p_room_id for update;
  if not found then return jsonb_build_object('status', 'error', 'code', 'room_not_found'); end if;
  select * into v_prior from private.processed_commands where room_id = p_room_id and command_id = p_command_id;
  if found then
    return jsonb_build_object('status', 'duplicate', 'processed', jsonb_build_object(
      'roomId', v_prior.room_id, 'commandId', v_prior.command_id,
      'actorId', v_prior.actor_player_id, 'response', v_prior.response_json));
  end if;
  if v_head.revision <> p_expected_revision or v_head.state_hash <> p_previous_state_hash then
    return jsonb_build_object('status', 'error', 'code', 'stale');
  end if;
  if p_next_revision <> p_expected_revision + 1
     or (p_next_state->>'revision')::bigint <> p_next_revision
     or (p_public_state->>'revision')::bigint <> p_next_revision then
    raise exception 'invalid revision transition';
  end if;
  if not exists (
       select 1 from public.rooms room
       where room.id = p_room_id
         and room.rules_version = '1.6.2'
         and room.content_version = '1.6.2'
         and coalesce(room.content_digest, '') ~ '^r31-[0-9a-f]{16}$'
     )
     or coalesce(v_head.state_json->>'rulesVersion', '') <> '1.6.2'
     or coalesce((v_head.state_json->>'schemaVersion')::integer, -1) <> 8
     or coalesce(p_next_state->>'rulesVersion', '') <> '1.6.2'
     or coalesce(p_public_state->>'rulesVersion', '') <> '1.6.2'
     or coalesce((p_next_state->>'schemaVersion')::integer, -1) <> 8
     or coalesce((p_public_state->>'schemaVersion')::integer, -1) <> 8 then
    raise exception 'unsupported rules or schema version';
  end if;
  -- Hidden information never reaches a public row (DESIGN §4).
  if p_public_state ? 'hidden' or not (p_public_state ? 'counts')
     or (p_response->'game') ? 'hidden' then
    raise exception 'public state carries hidden information';
  end if;
  if jsonb_typeof(p_full_events) <> 'array' or jsonb_typeof(p_public_events) <> 'array'
     or jsonb_array_length(p_full_events) <> jsonb_array_length(p_public_events) then
    raise exception 'full/public event arrays differ';
  end if;
  if exists (select 1 from jsonb_array_elements(p_public_events) e where e ? 'secret') then
    raise exception 'public event carries a secret';
  end if;
  if p_private_submission is not null then
    v_window_id := p_private_submission->>'windowId';
    v_card := p_private_submission->>'card';
    -- One of the five V1.6.2 cards, and no Fuel Ledger flag beside it (change 26).
    if coalesce(v_window_id, '') = ''
       or coalesce(v_card, '') not in ('BANK', 'TEND', 'STOKE', 'FUEL_LEDGER_BANK', 'FUEL_LEDGER_STOKE')
       or p_private_submission ? 'fuelLedger' then
      raise exception 'invalid private Contribution payload';
    end if;
    if exists (select 1 from private.private_submissions
      where room_id = p_room_id and window_id = v_window_id and player_id = p_actor_id) then
      return jsonb_build_object('status', 'error', 'code', 'private_duplicate');
    end if;
    insert into private.private_submissions (
      room_id, window_id, player_id, command_id, contribution_card
    ) values (
      p_room_id, v_window_id, p_actor_id, p_command_id, v_card);
  end if;
  insert into private.game_commands (room_id, command_id, actor_player_id, revision, command_json, is_private)
  values (p_room_id, p_command_id, p_actor_id, p_next_revision, p_command, p_private_submission is not null);
  select coalesce(max(sequence), 0), coalesce((select event_hash from private.game_events
    where room_id = p_room_id order by sequence desc limit 1), 'GENESIS')
  into v_sequence, v_previous_hash from private.game_events where room_id = p_room_id;
  if jsonb_array_length(p_full_events) > 0 then
    for v_index in 0..jsonb_array_length(p_full_events) - 1 loop
      v_sequence := v_sequence + 1;
      v_full_event := p_full_events->v_index; v_public_event := p_public_events->v_index;
      v_event_hash := encode(extensions.digest(concat_ws('|', v_previous_hash,
        p_next_revision::text, p_command_id::text, v_full_event::text, p_state_hash), 'sha256'), 'hex');
      insert into private.game_events (room_id, sequence, revision, command_id, actor_player_id,
        event_type, full_payload, public_payload, previous_hash, event_hash, state_hash)
      values (p_room_id, v_sequence, p_next_revision, p_command_id, p_actor_id,
        v_full_event->>'type', v_full_event, v_public_event, v_previous_hash, v_event_hash, p_state_hash);
      insert into public.game_public_events (room_id, sequence, revision, command_id, actor_player_id, event_type, payload)
      values (p_room_id, v_sequence, p_next_revision, p_command_id, p_actor_id,
        v_public_event->>'type', v_public_event);
      v_previous_hash := v_event_hash;
    end loop;
  end if;
  -- Every emitted event is persisted, so the state's counter equals the stored count; the
  -- seat-private event log and the client's event reload key on it (DESIGN §4.6).
  if v_sequence <> coalesce((p_next_state->>'eventSequence')::bigint, -1) then
    raise exception 'event sequence mismatch';
  end if;
  update private.game_heads set revision = p_next_revision, state_json = p_next_state,
    rng_state = p_rng_state, root_seed = p_root_seed, state_hash = p_state_hash, updated_at = now()
  where room_id = p_room_id;
  insert into private.game_snapshots (room_id, revision, state_json, rng_state, state_hash)
  values (p_room_id, p_next_revision, p_next_state, p_rng_state, p_state_hash);
  insert into public.game_public_states (room_id, revision, event_sequence, state_json)
  values (p_room_id, p_next_revision, v_sequence, p_public_state)
  on conflict (room_id) do update set revision = excluded.revision,
    event_sequence = excluded.event_sequence, state_json = excluded.state_json, updated_at = now();
  if p_private_submission is not null and coalesce((p_private_submission->>'revealed')::boolean, false) then
    insert into private.private_window_reveals (room_id, window_id, revealed_revision)
    values (p_room_id, v_window_id, p_next_revision);
    update private.private_submissions set revealed_revision = p_next_revision
    where room_id = p_room_id and window_id = v_window_id and revealed_revision is null;
  end if;
  insert into private.processed_commands (room_id, command_id, actor_player_id,
    resulting_revision, response_json, response_hash)
  values (p_room_id, p_command_id, p_actor_id, p_next_revision, p_response,
    encode(extensions.digest(p_response::text, 'sha256'), 'hex'));
  update public.rooms set latest_revision = p_next_revision,
    status = case when p_next_state#>>'{phase,type}' = 'finished' then 'finished' else status end,
    updated_at = now() where id = p_room_id;
  return jsonb_build_object('status', 'ok', 'value', p_response);
end;
$$;

-- ── Seat-private event log ───────────────────────────────────────────────────────────

-- The secrets addressed to one seat (its setup deal; its own private looks: the Commission
-- Market top 2 or 3, Colour Samples and its swap, the Guild Hall inspection; the Orders it
-- reserved from a look or took unseen at the Canal Wharf; the looked cards it put under the
-- Main deck; the held Order a swap gave up; its chosen Guild bottom order; own hand trims;
-- own Test Pieces peek), with the secret intact. The seat credential is checked here as well as in the
-- service, so this RPC can never return another seat's secrets.
create or replace function public.server_list_private_events(
  p_room_id uuid,
  p_player_id text,
  p_token_hash text,
  p_after_sequence bigint
) returns jsonb
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'roomId', e.room_id, 'sequence', e.sequence, 'revision', e.revision,
    'commandId', e.command_id, 'actorId', e.actor_player_id, 'event', e.full_payload
  ) order by e.sequence), '[]'::jsonb)
  from private.game_events e
  where e.room_id = p_room_id
    and e.sequence > coalesce(p_after_sequence, 0)
    and e.full_payload #>> '{secret,visibleTo}' = p_player_id
    and exists (
      select 1
      from private.room_seat_credentials c
      join public.room_players rp on rp.seat_id = c.seat_id and rp.room_id = c.room_id
      where c.room_id = p_room_id
        and c.token_hash = p_token_hash
        and c.revoked_at is null
        and rp.player_id = p_player_id
    );
$$;

-- ── Privileges: service role only ────────────────────────────────────────────────────

revoke all on function public.server_load_private_submissions(uuid, text) from public, anon, authenticated;
revoke all on function public.server_find_own_pending(uuid, text) from public, anon, authenticated;
revoke all on function public.server_create_room(uuid, text, uuid, text, text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.server_join_room(text, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.server_add_computer_seat(uuid, uuid, uuid, text, bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.server_commit_start(uuid, uuid, text, jsonb, bigint, bigint, text, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.server_commit_transition(uuid, uuid, text, bigint, text, bigint, jsonb, bigint, bigint, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.server_list_private_events(uuid, text, text, bigint) from public, anon, authenticated;

grant execute on function public.server_load_private_submissions(uuid, text) to service_role;
grant execute on function public.server_find_own_pending(uuid, text) to service_role;
grant execute on function public.server_create_room(uuid, text, uuid, text, text, text, uuid, text, text) to service_role;
grant execute on function public.server_join_room(text, uuid, text, uuid, text) to service_role;
grant execute on function public.server_add_computer_seat(uuid, uuid, uuid, text, bigint, uuid, text) to service_role;
grant execute on function public.server_commit_start(uuid, uuid, text, jsonb, bigint, bigint, text, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.server_commit_transition(uuid, uuid, text, bigint, text, bigint, jsonb, bigint, bigint, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.server_list_private_events(uuid, text, text, bigint) to service_role;
