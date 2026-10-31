-- V1.6.2 owner revision 5 (changes 36–42, 2026-10-28): state schema 10, rules behaviour
-- revision 33 (`r33-` fingerprints); rules version stays 1.6.2. ENGINE_V1.6.2_DELTA.md §16.3,
-- §16.18.
--
-- 202610150001_v161_rules.sql and 202610150002_playtest_v161.sql are applied to the live
-- database and stay exactly as they are; this migration only re-creates the gates that pin
-- the revision-4 room fingerprint (`^r32-…`) or state schema 9:
--   constraint   rooms_v162_fingerprint_check: accepts `^r3[23]-…`, so the existing r32 rows
--                stay valid as history; every write path below requires r33
--   functions    server_create_room, server_join_room, server_add_computer_seat,
--                server_commit_start, server_commit_transition: each body and signature
--                copied verbatim from 202610150001_v161_rules.sql, with only `^r32-` → `^r33-`
--                and, in the two commit functions, the schema check `<> 9` → `<> 10`. The
--                signatures are unchanged, so no overload is created.
-- server_load_private_submissions, server_find_own_pending, server_list_private_events and
-- the playtest functions pin neither r32 nor schema 9 and are not touched.
--
-- Older rooms, saves, private submissions and events stay as readable history; they are
-- never rewritten or relabelled (no update, delete or truncate here). An r32 room or a
-- schema-9 save is refused by every write path (DIG: rejected, never migrated).

-- ── Rooms: fingerprint ───────────────────────────────────────────────────────────────

-- The V1.4 fingerprint check stays for V1.4 rows. V1.6.2 rows carry an r32 (revision 4,
-- history) or r33 (revision 5) fingerprint; new rooms are r33 only (server_create_room).
alter table public.rooms drop constraint if exists rooms_v162_fingerprint_check;
alter table public.rooms add constraint rooms_v162_fingerprint_check
  check (
    rules_version <> '1.6.2'
    or (
      content_version = '1.6.2'
      and coalesce(content_digest, '') ~ '^r3[23]-[0-9a-f]{16}$'
    )
  );

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
  if coalesce(p_content_digest, '') !~ '^r33-[0-9a-f]{16}$' then
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

-- Joining rejects historical lobbies (r32 included) before assigning a seat.
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
     or coalesce(v_room.content_digest, '') !~ '^r33-[0-9a-f]{16}$' then
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

-- ── Computer seats ───────────────────────────────────────────────────────────────────

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
     or coalesce(v_room.content_digest, '') !~ '^r33-[0-9a-f]{16}$'
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
     or coalesce(v_room.content_digest, '') !~ '^r33-[0-9a-f]{16}$'
     or coalesce(p_state->>'rulesVersion', '') <> '1.6.2'
     or coalesce(p_public_state->>'rulesVersion', '') <> '1.6.2'
     or coalesce((p_state->>'schemaVersion')::integer, -1) <> 10
     or coalesce((p_public_state->>'schemaVersion')::integer, -1) <> 10 then
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
         and coalesce(room.content_digest, '') ~ '^r33-[0-9a-f]{16}$'
     )
     or coalesce(v_head.state_json->>'rulesVersion', '') <> '1.6.2'
     or coalesce((v_head.state_json->>'schemaVersion')::integer, -1) <> 10
     or coalesce(p_next_state->>'rulesVersion', '') <> '1.6.2'
     or coalesce(p_public_state->>'rulesVersion', '') <> '1.6.2'
     or coalesce((p_next_state->>'schemaVersion')::integer, -1) <> 10
     or coalesce((p_public_state->>'schemaVersion')::integer, -1) <> 10 then
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

-- ── Privileges (restated for the re-created functions) ───────────────────────────────

revoke all on function public.server_create_room(uuid, text, uuid, text, text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.server_join_room(text, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.server_add_computer_seat(uuid, uuid, uuid, text, bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.server_commit_start(uuid, uuid, text, jsonb, bigint, bigint, text, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.server_commit_transition(uuid, uuid, text, bigint, text, bigint, jsonb, bigint, bigint, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;

grant execute on function public.server_create_room(uuid, text, uuid, text, text, text, uuid, text, text) to service_role;
grant execute on function public.server_join_room(text, uuid, text, uuid, text) to service_role;
grant execute on function public.server_add_computer_seat(uuid, uuid, uuid, text, bigint, uuid, text) to service_role;
grant execute on function public.server_commit_start(uuid, uuid, text, jsonb, bigint, bigint, text, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.server_commit_transition(uuid, uuid, text, bigint, text, bigint, jsonb, bigint, bigint, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;
