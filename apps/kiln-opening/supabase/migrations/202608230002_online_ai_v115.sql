-- Promote online computer seats to the v1.1.5 Order-valuation policy.
--
-- The policy this replaces charged a multi-ceramic Order the product of single-attempt
-- Quality probabilities, as though every required ceramic had to land simultaneously on
-- one firing. A ceramic that fires to the wrong Quality is not destroyed -- it stays in
-- stock and the requirement can be attempted again while rounds remain -- so the model
-- was structurally pessimistic, and progressively more so the more ceramics an Order
-- needed. Measured over 360 games it predicted 25.6% for two-ceramic Orders that complete
-- 51.4% of the time, and ranked them below one-ceramic Orders worth roughly half as much.
--
-- The fix lifts each requirement to the chance of succeeding at least once within the
-- rounds remaining. Retry costs are untouched and still carried by the action-debt,
-- resource-debt and time terms. Against the frozen selfplay-003 baseline on fresh seeds
-- this is +8.75 pp win rate (95% CI [4.42, 13.17], 600 matched pairs) and lifts VP per
-- completed Order from 7.90 to 9.07. Denial modelling is present in the same lineage but
-- is disabled: it failed its own precommitted gates, and the configuration measured here
-- had it zeroed. See docs/experiments/v115-order-valuation-001.md.
--
-- Older policy values stay in the constraint only so already-stored rows remain readable;
-- the rules-version gate rejects rooms below v1.1.5 as a whole.
--
-- The function below is 202608220002's definition with one literal changed, so the host
-- check, seat indexing and colour assignment stay byte-identical.
alter table private.room_ai_seats drop constraint if exists room_ai_seats_policy_version_check;
alter table private.room_ai_seats add constraint room_ai_seats_policy_version_check
  check (policy_version in ('selfplay-003', 'rules-v1.1.1-wood-001', 'rules-v1.1.4-contribution-001', 'rules-v1.1.5-order-001'));

-- Lobby computer seats move to the new policy. Seats in started games keep the policy
-- they were created with; those games are pre-v1.1.4 and are rejected as a whole.
update private.room_ai_seats ai
set policy_version = 'rules-v1.1.5-order-001'
from public.rooms r
where r.id = ai.room_id and r.status = 'lobby';

create or replace function public.server_add_computer_seat(
  p_room_id uuid,
  p_host_seat_id uuid,
  p_seat_id uuid,
  p_display_name text,
  p_ai_seed bigint,
  p_command_id uuid
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
    p_seat_id, p_room_id, 'rules-v1.1.5-order-001', p_ai_seed, p_command_id
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

revoke all on function public.server_add_computer_seat(uuid, uuid, uuid, text, bigint, uuid) from public, anon, authenticated;
grant execute on function public.server_add_computer_seat(uuid, uuid, uuid, text, bigint, uuid) to service_role;
