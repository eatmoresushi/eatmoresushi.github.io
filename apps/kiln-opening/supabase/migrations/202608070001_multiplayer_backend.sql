-- Kiln Opening V0.4 authoritative multiplayer storage.
-- Browser roles can read only allowlisted lobby/public projections for rooms they belong to.
-- Full state, RNG, credential hashes, command payloads, full events, and Wood values stay private.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
grant usage on schema private to service_role;

create table public.rooms (
  id uuid primary key,
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  host_seat_id uuid not null,
  rules_version text not null check (rules_version = '0.4'),
  content_version text not null check (content_version = '0.4'),
  latest_revision bigint not null default 0 check (latest_revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_players (
  seat_id uuid primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id text not null,
  seat_index smallint not null check (seat_index between 0 and 3),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  colour text not null,
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (room_id, player_id),
  unique (room_id, seat_index)
);

create table public.game_public_states (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  revision bigint not null check (revision >= 0),
  event_sequence bigint not null check (event_sequence >= 0),
  state_json jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.game_public_events (
  room_id uuid not null references public.rooms(id) on delete cascade,
  sequence bigint not null check (sequence > 0),
  revision bigint not null check (revision >= 0),
  command_id uuid not null,
  actor_player_id text not null,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (room_id, sequence)
);

create table private.room_seat_credentials (
  seat_id uuid primary key references public.room_players(seat_id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  token_hash text not null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (room_id, token_hash)
);

create table private.room_memberships (
  seat_id uuid primary key references public.room_players(seat_id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  auth_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (room_id, auth_user_id)
);

create table private.game_heads (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  revision bigint not null check (revision >= 0),
  state_json jsonb not null,
  rng_state bigint not null check (rng_state between 0 and 4294967295),
  root_seed bigint not null check (root_seed between 0 and 4294967295),
  state_hash text not null,
  updated_at timestamptz not null default now()
);

create table private.game_snapshots (
  room_id uuid not null references public.rooms(id) on delete cascade,
  revision bigint not null check (revision >= 0),
  state_json jsonb not null,
  rng_state bigint not null check (rng_state between 0 and 4294967295),
  state_hash text not null,
  created_at timestamptz not null default now(),
  primary key (room_id, revision)
);

create table private.game_commands (
  room_id uuid not null references public.rooms(id) on delete cascade,
  command_id uuid not null,
  actor_player_id text not null,
  revision bigint not null check (revision >= 0),
  command_json jsonb not null,
  is_private boolean not null default false,
  accepted_at timestamptz not null default now(),
  primary key (room_id, command_id),
  unique (room_id, revision)
);

create table private.game_events (
  room_id uuid not null references public.rooms(id) on delete cascade,
  sequence bigint not null check (sequence > 0),
  revision bigint not null check (revision >= 0),
  command_id uuid not null,
  actor_player_id text not null,
  event_type text not null,
  full_payload jsonb not null,
  public_payload jsonb not null,
  previous_hash text not null,
  event_hash text not null,
  state_hash text not null,
  created_at timestamptz not null default now(),
  primary key (room_id, sequence),
  unique (room_id, event_hash)
);

create table private.private_submissions (
  room_id uuid not null references public.rooms(id) on delete cascade,
  window_id text not null,
  player_id text not null,
  command_id uuid not null,
  contribution smallint not null check (contribution between 0 and 3),
  submitted_at timestamptz not null default now(),
  revealed_revision bigint,
  primary key (room_id, window_id, player_id),
  unique (room_id, command_id)
);

create table private.private_window_reveals (
  room_id uuid not null references public.rooms(id) on delete cascade,
  window_id text not null,
  revealed_revision bigint not null,
  revealed_at timestamptz not null default now(),
  primary key (room_id, window_id)
);

create table private.processed_commands (
  room_id uuid not null references public.rooms(id) on delete cascade,
  command_id uuid not null,
  actor_player_id text not null,
  resulting_revision bigint not null,
  response_json jsonb not null,
  response_hash text not null,
  processed_at timestamptz not null default now(),
  primary key (room_id, command_id)
);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.game_public_states enable row level security;
alter table public.game_public_events enable row level security;
alter table private.room_seat_credentials enable row level security;
alter table private.room_memberships enable row level security;
alter table private.game_heads enable row level security;
alter table private.game_snapshots enable row level security;
alter table private.game_commands enable row level security;
alter table private.game_events enable row level security;
alter table private.private_submissions enable row level security;
alter table private.private_window_reveals enable row level security;
alter table private.processed_commands enable row level security;

create or replace function public.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from private.room_memberships membership
    where membership.room_id = target_room_id
      and membership.auth_user_id = auth.uid()
  );
$$;

revoke all on function public.is_room_member(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated;

create policy room_member_read_rooms
on public.rooms for select to authenticated
using (public.is_room_member(id));

create policy room_member_read_seats
on public.room_players for select to authenticated
using (public.is_room_member(room_id));

create policy room_member_read_public_state
on public.game_public_states for select to authenticated
using (public.is_room_member(room_id));

create policy room_member_read_public_events
on public.game_public_events for select to authenticated
using (public.is_room_member(room_id));

-- No browser INSERT/UPDATE/DELETE policies exist. All mutations go through the Edge Function.
revoke all on public.rooms from anon, authenticated;
revoke all on public.room_players from anon, authenticated;
revoke all on public.game_public_states from anon, authenticated;
revoke all on public.game_public_events from anon, authenticated;
grant select on public.rooms to authenticated;
grant select on public.room_players to authenticated;
grant select on public.game_public_states to authenticated;
grant select on public.game_public_events to authenticated;
revoke insert, update, delete on public.rooms from anon, authenticated;
revoke insert, update, delete on public.room_players from anon, authenticated;
revoke insert, update, delete on public.game_public_states from anon, authenticated;
revoke insert, update, delete on public.game_public_events from anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
grant all on all tables in schema private to service_role;

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
    p_room_id, upper(p_code), 'lobby', p_seat_id, '0.4', '0.4', 0
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
    'latestRevision', r.latest_revision
  ) into v_room from public.rooms r where r.id = p_room_id;
  select jsonb_build_object(
    'seatId', rp.seat_id, 'roomId', rp.room_id, 'playerId', rp.player_id,
    'seatIndex', rp.seat_index, 'displayName', rp.display_name, 'colour', rp.colour,
    'isHost', rp.is_host, 'authUserId', p_auth_user_id
  ) into v_seat from public.room_players rp where rp.seat_id = p_seat_id;
  return jsonb_build_object('status', 'ok', 'value', jsonb_build_object('room', v_room, 'seat', v_seat));
exception
  when unique_violation then
    return jsonb_build_object('status', 'error', 'code', 'room_code_conflict');
end;
$$;

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
    'isHost', rp.is_host, 'authUserId', p_auth_user_id
  ) into v_seat from public.room_players rp where rp.seat_id = p_seat_id;
  return jsonb_build_object(
    'status', 'ok',
    'value', jsonb_build_object(
      'room', jsonb_build_object(
        'id', v_room.id, 'code', v_room.code, 'status', v_room.status,
        'hostSeatId', v_room.host_seat_id, 'rulesVersion', v_room.rules_version,
        'contentVersion', v_room.content_version, 'latestRevision', v_room.latest_revision
      ),
      'seat', v_seat
    )
  );
exception
  when unique_violation then
    return jsonb_build_object('status', 'error', 'code', 'seat_already_joined');
end;
$$;

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
      'latestRevision', r.latest_revision
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

create or replace function public.server_get_seats(p_room_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'seatId', rp.seat_id, 'roomId', rp.room_id, 'playerId', rp.player_id,
    'seatIndex', rp.seat_index, 'displayName', rp.display_name, 'colour', rp.colour,
    'isHost', rp.is_host, 'authUserId', null
  ) order by rp.seat_index), '[]'::jsonb)
  from public.room_players rp where rp.room_id = p_room_id;
$$;

create or replace function public.server_load_head(p_room_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = private, pg_temp
as $$
  select jsonb_build_object(
    'roomId', h.room_id, 'revision', h.revision, 'state', h.state_json,
    'rngState', h.rng_state, 'rootSeed', h.root_seed, 'stateHash', h.state_hash
  ) from private.game_heads h where h.room_id = p_room_id;
$$;

create or replace function public.server_load_public_state(p_room_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select gps.state_json from public.game_public_states gps where gps.room_id = p_room_id;
$$;

create or replace function public.server_get_processed(p_room_id uuid, p_command_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = private, pg_temp
as $$
  select jsonb_build_object(
    'roomId', pc.room_id, 'commandId', pc.command_id,
    'actorId', pc.actor_player_id, 'response', pc.response_json
  ) from private.processed_commands pc
  where pc.room_id = p_room_id and pc.command_id = p_command_id;
$$;

create or replace function public.server_load_private_submissions(p_room_id uuid, p_window_id text)
returns jsonb
language sql
stable
security definer
set search_path = private, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'roomId', ps.room_id, 'windowId', ps.window_id, 'playerId', ps.player_id,
    'commandId', ps.command_id, 'amount', ps.contribution,
    'revealedRevision', ps.revealed_revision
  ) order by ps.submitted_at), '[]'::jsonb)
  from private.private_submissions ps
  where ps.room_id = p_room_id and ps.window_id = p_window_id
    and ps.revealed_revision is null;
$$;

create or replace function public.server_find_own_pending(p_room_id uuid, p_player_id text)
returns jsonb
language sql
stable
security definer
set search_path = private, pg_temp
as $$
  select jsonb_build_object(
    'roomId', ps.room_id, 'windowId', ps.window_id, 'playerId', ps.player_id,
    'commandId', ps.command_id, 'amount', ps.contribution,
    'revealedRevision', ps.revealed_revision
  ) from private.private_submissions ps
  where ps.room_id = p_room_id and ps.player_id = p_player_id
    and ps.revealed_revision is null
  order by ps.submitted_at desc limit 1;
$$;

create or replace function public.server_list_public_events(p_room_id uuid, p_after_sequence bigint)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'roomId', e.room_id, 'sequence', e.sequence, 'revision', e.revision,
    'commandId', e.command_id, 'actorId', e.actor_player_id, 'event', e.payload
  ) order by e.sequence), '[]'::jsonb)
  from public.game_public_events e
  where e.room_id = p_room_id and e.sequence > p_after_sequence;
$$;

create or replace function public.server_commit_start(
  p_room_id uuid,
  p_command_id uuid,
  p_actor_id text,
  p_state jsonb,
  p_rng_state bigint,
  p_root_seed bigint,
  p_state_hash text,
  p_public_state jsonb,
  p_response jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_prior private.processed_commands%rowtype;
  v_count integer;
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
  select count(*) into v_count from public.room_players where room_id = p_room_id;
  if v_count < 2 then return jsonb_build_object('status', 'error', 'code', 'not_enough_players'); end if;

  insert into private.game_heads (
    room_id, revision, state_json, rng_state, root_seed, state_hash
  ) values (p_room_id, 0, p_state, p_rng_state, p_root_seed, p_state_hash);
  insert into private.game_snapshots (room_id, revision, state_json, rng_state, state_hash)
  values (p_room_id, 0, p_state, p_rng_state, p_state_hash);
  insert into private.game_commands (
    room_id, command_id, actor_player_id, revision, command_json, is_private
  ) values (p_room_id, p_command_id, p_actor_id, 0, '{"type":"START_GAME"}'::jsonb, false);
  insert into public.game_public_states (room_id, revision, event_sequence, state_json)
  values (p_room_id, 0, coalesce((p_public_state->>'eventSequence')::bigint, 0), p_public_state);
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
  p_room_id uuid,
  p_command_id uuid,
  p_actor_id text,
  p_expected_revision bigint,
  p_previous_state_hash text,
  p_next_revision bigint,
  p_next_state jsonb,
  p_rng_state bigint,
  p_root_seed bigint,
  p_state_hash text,
  p_command jsonb,
  p_full_events jsonb,
  p_public_events jsonb,
  p_public_state jsonb,
  p_response jsonb,
  p_private_submission jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_head private.game_heads%rowtype;
  v_prior private.processed_commands%rowtype;
  v_sequence bigint;
  v_previous_hash text;
  v_event_hash text;
  v_full_event jsonb;
  v_public_event jsonb;
  v_index integer;
  v_window_id text;
begin
  select * into v_head from private.game_heads where room_id = p_room_id for update;
  if not found then return jsonb_build_object('status', 'error', 'code', 'room_not_found'); end if;
  select * into v_prior from private.processed_commands
  where room_id = p_room_id and command_id = p_command_id;
  if found then
    return jsonb_build_object('status', 'duplicate', 'processed', jsonb_build_object(
      'roomId', v_prior.room_id, 'commandId', v_prior.command_id,
      'actorId', v_prior.actor_player_id, 'response', v_prior.response_json
    ));
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
    if exists (
      select 1 from private.private_submissions
      where room_id = p_room_id and window_id = v_window_id and player_id = p_actor_id
    ) then
      return jsonb_build_object('status', 'error', 'code', 'private_duplicate');
    end if;
    insert into private.private_submissions (
      room_id, window_id, player_id, command_id, contribution
    ) values (
      p_room_id, v_window_id, p_actor_id, p_command_id,
      (p_private_submission->>'amount')::smallint
    );
  end if;

  insert into private.game_commands (
    room_id, command_id, actor_player_id, revision, command_json, is_private
  ) values (
    p_room_id, p_command_id, p_actor_id, p_next_revision, p_command,
    p_private_submission is not null
  );

  select coalesce(max(sequence), 0), coalesce(
    (select event_hash from private.game_events
     where room_id = p_room_id order by sequence desc limit 1),
    'GENESIS'
  ) into v_sequence, v_previous_hash
  from private.game_events where room_id = p_room_id;

  if jsonb_array_length(p_full_events) > 0 then
    for v_index in 0..jsonb_array_length(p_full_events) - 1 loop
      v_sequence := v_sequence + 1;
      v_full_event := p_full_events->v_index;
      v_public_event := p_public_events->v_index;
      v_event_hash := encode(extensions.digest(
        concat_ws('|', v_previous_hash, p_next_revision::text, p_command_id::text,
          v_full_event::text, p_state_hash), 'sha256'
      ), 'hex');
      insert into private.game_events (
        room_id, sequence, revision, command_id, actor_player_id, event_type,
        full_payload, public_payload, previous_hash, event_hash, state_hash
      ) values (
        p_room_id, v_sequence, p_next_revision, p_command_id, p_actor_id,
        v_full_event->>'type', v_full_event, v_public_event,
        v_previous_hash, v_event_hash, p_state_hash
      );
      insert into public.game_public_events (
        room_id, sequence, revision, command_id, actor_player_id, event_type, payload
      ) values (
        p_room_id, v_sequence, p_next_revision, p_command_id, p_actor_id,
        v_public_event->>'type', v_public_event
      );
      v_previous_hash := v_event_hash;
    end loop;
  end if;

  update private.game_heads set
    revision = p_next_revision, state_json = p_next_state, rng_state = p_rng_state,
    root_seed = p_root_seed, state_hash = p_state_hash, updated_at = now()
  where room_id = p_room_id;
  insert into private.game_snapshots (room_id, revision, state_json, rng_state, state_hash)
  values (p_room_id, p_next_revision, p_next_state, p_rng_state, p_state_hash);
  insert into public.game_public_states (room_id, revision, event_sequence, state_json)
  values (
    p_room_id, p_next_revision,
    coalesce((p_public_state->>'eventSequence')::bigint, v_sequence), p_public_state
  ) on conflict (room_id) do update set
    revision = excluded.revision,
    event_sequence = excluded.event_sequence,
    state_json = excluded.state_json,
    updated_at = now();

  if p_private_submission is not null
     and coalesce((p_private_submission->>'revealed')::boolean, false) then
    insert into private.private_window_reveals (room_id, window_id, revealed_revision)
    values (p_room_id, v_window_id, p_next_revision);
    update private.private_submissions set revealed_revision = p_next_revision
    where room_id = p_room_id and window_id = v_window_id and revealed_revision is null;
  end if;

  insert into private.processed_commands (
    room_id, command_id, actor_player_id, resulting_revision, response_json, response_hash
  ) values (
    p_room_id, p_command_id, p_actor_id, p_next_revision, p_response,
    encode(extensions.digest(p_response::text, 'sha256'), 'hex')
  );
  update public.rooms set
    latest_revision = p_next_revision,
    status = case when p_next_state#>>'{phase,type}' = 'finished' then 'finished' else status end,
    updated_at = now()
  where id = p_room_id;
  return jsonb_build_object('status', 'ok', 'value', p_response);
end;
$$;

revoke all on function public.server_create_room(uuid, text, uuid, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.server_join_room(text, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.server_authenticate_seat(text, text) from public, anon, authenticated;
revoke all on function public.server_get_seats(uuid) from public, anon, authenticated;
revoke all on function public.server_load_head(uuid) from public, anon, authenticated;
revoke all on function public.server_load_public_state(uuid) from public, anon, authenticated;
revoke all on function public.server_get_processed(uuid, uuid) from public, anon, authenticated;
revoke all on function public.server_load_private_submissions(uuid, text) from public, anon, authenticated;
revoke all on function public.server_find_own_pending(uuid, text) from public, anon, authenticated;
revoke all on function public.server_list_public_events(uuid, bigint) from public, anon, authenticated;
revoke all on function public.server_commit_start(uuid, uuid, text, jsonb, bigint, bigint, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.server_commit_transition(uuid, uuid, text, bigint, text, bigint, jsonb, bigint, bigint, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;

grant execute on function public.server_create_room(uuid, text, uuid, text, text, text, uuid, text) to service_role;
grant execute on function public.server_join_room(text, uuid, text, uuid, text) to service_role;
grant execute on function public.server_authenticate_seat(text, text) to service_role;
grant execute on function public.server_get_seats(uuid) to service_role;
grant execute on function public.server_load_head(uuid) to service_role;
grant execute on function public.server_load_public_state(uuid) to service_role;
grant execute on function public.server_get_processed(uuid, uuid) to service_role;
grant execute on function public.server_load_private_submissions(uuid, text) to service_role;
grant execute on function public.server_find_own_pending(uuid, text) to service_role;
grant execute on function public.server_list_public_events(uuid, bigint) to service_role;
grant execute on function public.server_commit_start(uuid, uuid, text, jsonb, bigint, bigint, text, jsonb, jsonb) to service_role;
grant execute on function public.server_commit_transition(uuid, uuid, text, bigint, text, bigint, jsonb, bigint, bigint, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;

alter table public.rooms replica identity full;
alter table public.room_players replica identity full;
alter table public.game_public_states replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then alter publication supabase_realtime add table public.rooms; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_players'
  ) then alter publication supabase_realtime add table public.room_players; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_public_states'
  ) then alter publication supabase_realtime add table public.game_public_states; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_public_events'
  ) then alter publication supabase_realtime add table public.game_public_events; end if;
end;
$$;

comment on table private.private_submissions is
  'Service-only unrevealed Wood Contributions. Never expose this schema through PostgREST or Realtime.';
comment on table public.game_public_states is
  'Allowlisted projection only. Full authoritative GameState belongs in private.game_heads.';
