-- Promote the online computer player from frozen V003 to the V1.1.1 Wood candidate.
--
-- V003 was trained under V1.0.2, when the three kiln zones covered every Preferred Heat
-- at Base Heat 2 and bids of 1, 2 and 3 gave the same Base Heat against a table bidding
-- one each. "Always bid 1" was correct then; under V1.1.1 it leaves the 0-5 Base Heat
-- range unused. Over 300 matched pairs on seeds disjoint from the candidate's own
-- development, rules-v1.1.1-wood-001 scored +0.577 focal VP against frozen V003,
-- positive at 2P, 3P and 4P, with zero illegal actions and a 12.9 ms worst decision --
-- below V003's own 16.4 ms.
--
-- The higher-scoring joint loading candidate (+1.377) is deliberately NOT shipped. A
-- mirror match showed it wins by free-riding on opponents' Wood: an all-candidate table
-- loses 6.3 VP per player and Flawed rises from 1.4% to 13.1%. Rooms seat up to three
-- computers, so that table is reachable in ordinary play.
--
-- The function below is 202608100002's definition with one literal changed, so the host
-- check, seat indexing and colour assignment stay byte-identical.

alter table private.room_ai_seats drop constraint if exists room_ai_seats_policy_version_check;
alter table private.room_ai_seats add constraint room_ai_seats_policy_version_check
  check (policy_version in ('selfplay-003', 'rules-v1.1.1-wood-001'));

-- Lobby computer seats move to the new policy. Seats in started games keep the policy
-- they were created with, so opponent behaviour never changes mid-game.
update private.room_ai_seats ai
set policy_version = 'rules-v1.1.1-wood-001'
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
    p_seat_id, p_room_id, 'rules-v1.1.1-wood-001', p_ai_seed, p_command_id
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
