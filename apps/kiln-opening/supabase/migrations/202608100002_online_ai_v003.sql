-- Server-authoritative V003 computer seats.
-- Only the non-sensitive is_ai marker is public; policy seeds remain in private.

alter table public.room_players
  add column if not exists is_ai boolean not null default false;

alter table public.room_players
  add constraint room_players_ai_not_host_check check (not is_ai or not is_host);

create table if not exists private.room_ai_seats (
  seat_id uuid primary key references public.room_players(seat_id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  policy_version text not null check (policy_version = 'selfplay-003'),
  ai_seed bigint not null check (ai_seed between 0 and 4294967295),
  created_command_id uuid not null,
  created_at timestamptz not null default now(),
  unique (room_id, created_command_id)
);

alter table private.room_ai_seats enable row level security;
revoke all on private.room_ai_seats from public, anon, authenticated;
grant all on private.room_ai_seats to service_role;

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

create or replace function public.server_get_seats(p_room_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'seatId', rp.seat_id, 'roomId', rp.room_id, 'playerId', rp.player_id,
    'seatIndex', rp.seat_index, 'displayName', rp.display_name, 'colour', rp.colour,
    'isHost', rp.is_host, 'isComputer', rp.is_ai,
    'aiPolicyVersion', ai.policy_version, 'authUserId', null,
    'aiSeed', ai.ai_seed, 'aiCreatedCommandId', ai.created_command_id
  ) order by rp.seat_index), '[]'::jsonb)
  from public.room_players rp
  left join private.room_ai_seats ai on ai.seat_id = rp.seat_id
  where rp.room_id = p_room_id;
$$;

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
    p_seat_id, p_room_id, 'selfplay-003', p_ai_seed, p_command_id
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

create or replace function public.server_remove_computer_seat(
  p_room_id uuid,
  p_host_seat_id uuid,
  p_computer_seat_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_is_ai boolean;
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

  select rp.is_ai into v_is_ai
  from public.room_players rp
  where rp.room_id = p_room_id and rp.seat_id = p_computer_seat_id
  for update;
  if not found then return jsonb_build_object('status', 'ok', 'value', true); end if;
  if not v_is_ai then return jsonb_build_object('status', 'error', 'code', 'not_computer_seat'); end if;
  delete from public.room_players where seat_id = p_computer_seat_id and room_id = p_room_id;
  return jsonb_build_object('status', 'ok', 'value', true);
end;
$$;

revoke all on function public.server_authenticate_seat(text, text) from public, anon, authenticated;
revoke all on function public.server_get_seats(uuid) from public, anon, authenticated;
revoke all on function public.server_add_computer_seat(uuid, uuid, uuid, text, bigint, uuid)
from public, anon, authenticated;
revoke all on function public.server_remove_computer_seat(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.server_authenticate_seat(text, text) to service_role;
grant execute on function public.server_get_seats(uuid) to service_role;
grant execute on function public.server_add_computer_seat(uuid, uuid, uuid, text, bigint, uuid)
to service_role;
grant execute on function public.server_remove_computer_seat(uuid, uuid, uuid)
to service_role;
