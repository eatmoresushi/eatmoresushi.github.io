-- Kiln Opening V0.6.3 room/content version transition.
-- Existing started V0.4/V0.5/V0.6.1 games retain their original versions and
-- are rejected by the V0.6.3 service. Unstarted lobbies contain no game state
-- and are safe to move to the current version.

alter table public.rooms drop constraint if exists rooms_rules_version_check;
alter table public.rooms drop constraint if exists rooms_content_version_check;

alter table public.rooms
  add constraint rooms_rules_version_check
  check (rules_version in ('0.4', '0.5', '0.6.1', '0.6.3'));
alter table public.rooms
  add constraint rooms_content_version_check
  check (content_version in ('0.4', '0.5', '0.6.1', '0.6.3'));

update public.rooms
set rules_version = '0.6.3', content_version = '0.6.3', updated_at = now()
where status = 'lobby';

create or replace function public.server_create_room(
  p_room_id uuid,
  p_code text,
  p_seat_id uuid,
  p_player_id text,
  p_display_name text,
  p_colour text,
  p_auth_user_id uuid,
  p_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_room jsonb;
  v_seat jsonb;
begin
  insert into public.rooms (
    id, code, status, host_seat_id, rules_version, content_version, latest_revision
  ) values (
    p_room_id, upper(p_code), 'lobby', p_seat_id, '0.6.3', '0.6.3', 0
  );
  insert into public.room_players (
    seat_id, room_id, player_id, seat_index, display_name, colour, is_host
  ) values (
    p_seat_id, p_room_id, p_player_id, 0, btrim(p_display_name), p_colour, true
  );
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
    'isHost', rp.is_host, 'authUserId', p_auth_user_id
  ) into v_seat from public.room_players rp where rp.seat_id = p_seat_id;
  return jsonb_build_object(
    'status', 'ok',
    'value', jsonb_build_object('room', v_room, 'seat', v_seat)
  );
exception
  when unique_violation then
    return jsonb_build_object('status', 'error', 'code', 'room_code_conflict');
end;
$$;

revoke all on function public.server_create_room(uuid, text, uuid, text, text, text, uuid, text)
from public, anon, authenticated;
grant execute on function public.server_create_room(uuid, text, uuid, text, text, text, uuid, text)
to service_role;
