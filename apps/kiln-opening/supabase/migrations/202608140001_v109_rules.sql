-- Kiln Opening V1.0.9 authoritative rules/content transition.
-- Unstarted lobbies are safe to upgrade. Started older games remain immutable and
-- are rejected by the current Edge Function instead of being translated mid-game.

alter table public.rooms drop constraint if exists rooms_rules_version_check;
alter table public.rooms drop constraint if exists rooms_content_version_check;

alter table public.rooms add constraint rooms_rules_version_check
  check (rules_version in ('0.4', '0.5', '0.6.1', '0.6.3', '0.6.5', '1.0.0', '1.0.1', '1.0.2', '1.0.4', '1.0.9'));
alter table public.rooms add constraint rooms_content_version_check
  check (content_version in ('0.4', '0.5', '0.6.1', '0.6.3', '0.6.5', '1.0.0', '1.0.1', '1.0.2', '1.0.4', '1.0.9'));

update public.rooms
set rules_version = '1.0.9', content_version = '1.0.9', updated_at = now()
where status = 'lobby';

alter table private.private_submissions
  add column if not exists use_fuel_ledger boolean not null default false;

create or replace function public.server_create_room(
  p_room_id uuid, p_code text, p_seat_id uuid, p_player_id text,
  p_display_name text, p_colour text, p_auth_user_id uuid, p_token_hash text
) returns jsonb
language plpgsql security definer
set search_path = public, private, extensions, pg_temp
as $$
declare v_room jsonb; v_seat jsonb;
begin
  insert into public.rooms (id, code, status, host_seat_id, rules_version, content_version, latest_revision)
  values (p_room_id, upper(p_code), 'lobby', p_seat_id, '1.0.9', '1.0.9', 0);
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
    'latestRevision', r.latest_revision, 'endedAt', r.ended_at,
    'endedByPlayerId', r.ended_by_player_id
  ) into v_room from public.rooms r where r.id = p_room_id;
  select jsonb_build_object(
    'seatId', rp.seat_id, 'roomId', rp.room_id, 'playerId', rp.player_id,
    'seatIndex', rp.seat_index, 'displayName', rp.display_name, 'colour', rp.colour,
    'isHost', rp.is_host, 'isComputer', rp.is_computer,
    'aiPolicyVersion', rp.ai_policy_version, 'authUserId', p_auth_user_id,
    'aiSeed', null, 'aiCreatedCommandId', null
  ) into v_seat from public.room_players rp where rp.seat_id = p_seat_id;
  return jsonb_build_object('status', 'ok', 'value', jsonb_build_object('room', v_room, 'hostSeat', v_seat));
exception when unique_violation then
  return jsonb_build_object('status', 'error', 'code', 'room_code_conflict');
end;
$$;

create or replace function public.server_load_private_submissions(p_room_id uuid, p_window_id text)
returns jsonb language sql stable security definer set search_path = private, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'roomId', ps.room_id, 'windowId', ps.window_id, 'playerId', ps.player_id,
    'commandId', ps.command_id, 'amount', ps.contribution,
    'useFuelLedger', ps.use_fuel_ledger, 'revealedRevision', ps.revealed_revision
  ) order by ps.submitted_at), '[]'::jsonb)
  from private.private_submissions ps
  where ps.room_id = p_room_id and ps.window_id = p_window_id and ps.revealed_revision is null;
$$;

create or replace function public.server_find_own_pending(p_room_id uuid, p_player_id text)
returns jsonb language sql stable security definer set search_path = private, pg_temp
as $$
  select jsonb_build_object(
    'roomId', ps.room_id, 'windowId', ps.window_id, 'playerId', ps.player_id,
    'commandId', ps.command_id, 'amount', ps.contribution,
    'useFuelLedger', ps.use_fuel_ledger, 'revealedRevision', ps.revealed_revision
  ) from private.private_submissions ps
  where ps.room_id = p_room_id and ps.player_id = p_player_id and ps.revealed_revision is null
  order by ps.submitted_at desc limit 1;
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
  if jsonb_typeof(p_full_events) <> 'array' or jsonb_typeof(p_public_events) <> 'array'
     or jsonb_array_length(p_full_events) <> jsonb_array_length(p_public_events) then
    raise exception 'full/public event arrays differ';
  end if;
  if p_private_submission is not null then
    v_window_id := p_private_submission->>'windowId';
    if exists (select 1 from private.private_submissions
      where room_id = p_room_id and window_id = v_window_id and player_id = p_actor_id) then
      return jsonb_build_object('status', 'error', 'code', 'private_duplicate');
    end if;
    insert into private.private_submissions (
      room_id, window_id, player_id, command_id, contribution, use_fuel_ledger
    ) values (
      p_room_id, v_window_id, p_actor_id, p_command_id,
      (p_private_submission->>'amount')::smallint,
      coalesce((p_private_submission->>'useFuelLedger')::boolean, false));
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
  update private.game_heads set revision = p_next_revision, state_json = p_next_state,
    rng_state = p_rng_state, root_seed = p_root_seed, state_hash = p_state_hash, updated_at = now()
  where room_id = p_room_id;
  insert into private.game_snapshots (room_id, revision, state_json, rng_state, state_hash)
  values (p_room_id, p_next_revision, p_next_state, p_rng_state, p_state_hash);
  insert into public.game_public_states (room_id, revision, event_sequence, state_json)
  values (p_room_id, p_next_revision, coalesce((p_public_state->>'eventSequence')::bigint, v_sequence), p_public_state)
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

revoke all on function public.server_create_room(uuid, text, uuid, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.server_load_private_submissions(uuid, text) from public, anon, authenticated;
revoke all on function public.server_find_own_pending(uuid, text) from public, anon, authenticated;
revoke all on function public.server_commit_transition(uuid, uuid, text, bigint, text, bigint, jsonb, bigint, bigint, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.server_create_room(uuid, text, uuid, text, text, text, uuid, text) to service_role;
grant execute on function public.server_load_private_submissions(uuid, text) to service_role;
grant execute on function public.server_find_own_pending(uuid, text) to service_role;
grant execute on function public.server_commit_transition(uuid, uuid, text, bigint, text, bigint, jsonb, bigint, bigint, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;
