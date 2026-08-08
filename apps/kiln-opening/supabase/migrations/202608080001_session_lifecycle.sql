-- Host-controlled session ending and bounded retention for authoritative game records.

alter table public.rooms drop constraint if exists rooms_status_check;
alter table public.rooms
  add constraint rooms_status_check check (status in ('lobby', 'playing', 'finished', 'abandoned'));

alter table public.rooms
  add column if not exists ended_at timestamptz,
  add column if not exists ended_by_player_id text,
  add column if not exists ended_command_id uuid;

alter table public.rooms
  add constraint rooms_abandoned_metadata_check check (
    status <> 'abandoned'
    or (ended_at is not null and ended_by_player_id is not null and ended_command_id is not null)
  );

create index if not exists rooms_abandoned_retention_idx
  on public.rooms (ended_at) where status = 'abandoned';
create index if not exists rooms_finished_retention_idx
  on public.rooms (updated_at) where status = 'finished';

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
      'isHost', rp.is_host, 'authUserId', null
    )
  )
  from public.rooms r
  join public.room_players rp on rp.room_id = r.id
  join private.room_seat_credentials c on c.seat_id = rp.seat_id and c.room_id = r.id
  where r.code = upper(p_code) and c.token_hash = p_token_hash and c.revoked_at is null
  limit 1;
$$;

create or replace function public.server_end_session(
  p_room_id uuid,
  p_host_seat_id uuid,
  p_actor_player_id text,
  p_command_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_public_room jsonb;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    return jsonb_build_object('status', 'error', 'code', 'room_not_found');
  end if;
  if v_room.host_seat_id <> p_host_seat_id or not exists (
    select 1 from public.room_players rp
    where rp.room_id = p_room_id
      and rp.seat_id = p_host_seat_id
      and rp.player_id = p_actor_player_id
      and rp.is_host
  ) then
    return jsonb_build_object('status', 'error', 'code', 'host_only');
  end if;
  if v_room.status = 'finished' then
    return jsonb_build_object('status', 'error', 'code', 'session_not_active');
  end if;
  if v_room.status <> 'abandoned' then
    update public.rooms
    set status = 'abandoned',
        ended_at = now(),
        ended_by_player_id = p_actor_player_id,
        ended_command_id = p_command_id,
        updated_at = now()
    where id = p_room_id
    returning * into v_room;
  end if;

  v_public_room := jsonb_build_object(
    'id', v_room.id, 'code', v_room.code, 'status', v_room.status,
    'hostSeatId', v_room.host_seat_id, 'rulesVersion', v_room.rules_version,
    'contentVersion', v_room.content_version, 'latestRevision', v_room.latest_revision,
    'endedAt', v_room.ended_at,
    'endedByPlayerId', v_room.ended_by_player_id
  );
  return jsonb_build_object(
    'status', 'ok',
    'value', v_public_room
  );
end;
$$;

-- Serialize accepted game commands against session ending. If ending wins the room-row
-- lock, the late command transaction is rolled back instead of mutating an ended game.
create or replace function private.guard_active_session_command()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_status text;
begin
  select status into v_status from public.rooms where id = new.room_id for update;
  if v_status in ('finished', 'abandoned') then
    raise exception using errcode = '55000', message = 'session_not_active';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_active_session_command on private.game_commands;
create trigger guard_active_session_command
before insert on private.game_commands
for each row execute function private.guard_active_session_command();

create or replace function private.cleanup_expired_game_sessions()
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_deleted integer;
begin
  with deleted as (
    delete from public.rooms
    where (status = 'abandoned' and ended_at < now() - interval '7 days')
       or (status = 'finished' and updated_at < now() - interval '30 days')
    returning id
  )
  select count(*)::integer into v_deleted from deleted;
  return v_deleted;
end;
$$;

revoke all on function public.server_authenticate_seat(text, text) from public, anon, authenticated;
revoke all on function public.server_end_session(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.server_authenticate_seat(text, text) to service_role;
grant execute on function public.server_end_session(uuid, uuid, text, uuid) to service_role;
revoke all on function private.cleanup_expired_game_sessions() from public, anon, authenticated;

create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'kiln-opening-session-retention';
  perform cron.schedule(
    'kiln-opening-session-retention',
    '17 3 * * *',
    'select private.cleanup_expired_game_sessions();'
  );
end;
$$;
