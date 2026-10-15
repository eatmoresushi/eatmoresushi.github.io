begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_temp;
select plan(27);

insert into public.rooms (
  id, code, status, host_seat_id, rules_version, content_version, latest_revision
) values
  ('10000000-0000-4000-8000-000000000001', 'ROOM01', 'lobby',
   '20000000-0000-4000-8000-000000000001', '0.4', '0.4', 0),
  ('10000000-0000-4000-8000-000000000002', 'ROOM02', 'lobby',
   '20000000-0000-4000-8000-000000000002', '0.4', '0.4', 0);

insert into public.rooms (
  id, code, status, host_seat_id, rules_version, content_version, latest_revision, content_digest
) values
  ('10000000-0000-4000-8000-000000000003', 'ROOM03', 'playing',
   '20000000-0000-4000-8000-000000000003', '1.6.1', '1.6.1', 0, 'r29-0123456789abcdef');

insert into public.room_players (
  seat_id, room_id, player_id, seat_index, display_name, colour, is_host
) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   'P1', 0, 'Member One', 'cinnabar', true),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
   'P1', 0, 'Member Two', 'celadon', true),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003',
   'P1', 0, 'V161 Host', 'cinnabar', true),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003',
   'P2', 1, 'V161 Guest', 'celadon', false);

insert into private.room_memberships (seat_id, room_id, auth_user_id) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
   '30000000-0000-4000-8000-000000000002');

insert into public.game_public_states (room_id, revision, event_sequence, state_json) values
  ('10000000-0000-4000-8000-000000000001', 0, 0, '{"public":true}'::jsonb),
  ('10000000-0000-4000-8000-000000000002', 0, 0, '{"public":true}'::jsonb);

insert into private.room_seat_credentials (seat_id, room_id, token_hash) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'secret-hash-one'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'secret-hash-two'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'secret-hash-host'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 'secret-hash-guest');

insert into private.private_submissions (
  room_id, window_id, player_id, command_id, contribution
) values
  ('10000000-0000-4000-8000-000000000001', 'window-1', 'P1',
   '40000000-0000-4000-8000-000000000001', 3);

-- A V1.6.1 sealed Fuel Ledger commitment.
insert into private.private_submissions (
  room_id, window_id, player_id, command_id, contribution_card, use_fuel_ledger
) values
  ('10000000-0000-4000-8000-000000000003', 'v161-window', 'P1',
   '40000000-0000-4000-8000-000000000002', 'STOKE', true);

-- Two secret setup deals and one public event in the V1.6.1 room.
insert into private.game_events (
  room_id, sequence, revision, command_id, actor_player_id, event_type,
  full_payload, public_payload, previous_hash, event_hash, state_hash
) values
  ('10000000-0000-4000-8000-000000000003', 1, 0, '50000000-0000-4000-8000-000000000001', 'P1', 'GAME_CREATED',
   '{"type":"GAME_CREATED"}'::jsonb, '{"type":"GAME_CREATED"}'::jsonb, 'GENESIS', 'hash-1', 'state-0'),
  ('10000000-0000-4000-8000-000000000003', 2, 0, '50000000-0000-4000-8000-000000000001', 'P1', 'ORDERS_DEALT',
   '{"type":"ORDERS_DEALT","playerId":"P1","secret":{"visibleTo":"P1","startingOrderIds":["S01","S02"],"mainOrderIds":["O07"]}}'::jsonb,
   '{"type":"ORDERS_DEALT","playerId":"P1"}'::jsonb, 'hash-1', 'hash-2', 'state-0'),
  ('10000000-0000-4000-8000-000000000003', 3, 0, '50000000-0000-4000-8000-000000000001', 'P1', 'ORDERS_DEALT',
   '{"type":"ORDERS_DEALT","playerId":"P2","secret":{"visibleTo":"P2","startingOrderIds":["S03","S04"],"mainOrderIds":["O08"]}}'::jsonb,
   '{"type":"ORDERS_DEALT","playerId":"P2"}'::jsonb, 'hash-2', 'hash-3', 'state-0');

-- ── Function privileges ──────────────────────────────────────────────────────────────

select ok(
  not has_function_privilege('authenticated', 'public.server_load_head(uuid)', 'EXECUTE'),
  'authenticated cannot execute the full-head RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.server_load_private_submissions(uuid,text)', 'EXECUTE'),
  'authenticated cannot execute the private-submission RPC'
);
select ok(
  has_function_privilege('service_role', 'public.server_commit_transition(uuid,uuid,text,bigint,text,bigint,jsonb,bigint,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)', 'EXECUTE'),
  'service role can execute the transactional commit RPC'
);
select ok(
  has_function_privilege('service_role', 'public.server_commit_start(uuid,uuid,text,jsonb,bigint,bigint,text,jsonb,jsonb,jsonb,jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.server_commit_start(uuid,uuid,text,jsonb,bigint,bigint,text,jsonb,jsonb,jsonb,jsonb)', 'EXECUTE'),
  'only the service role can commit a game start with its events'
);
select ok(
  to_regprocedure('public.server_commit_start(uuid,uuid,text,jsonb,bigint,bigint,text,jsonb,jsonb)') is null,
  'the V1.4 event-less game start RPC is gone'
);
select ok(
  has_function_privilege('service_role', 'public.server_list_private_events(uuid,text,text,bigint)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.server_list_private_events(uuid,text,text,bigint)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.server_list_private_events(uuid,text,text,bigint)', 'EXECUTE'),
  'only the service role can read the seat-private event log'
);
select ok(
  has_function_privilege('service_role', 'public.server_add_computer_seat(uuid,uuid,uuid,text,bigint,uuid,text)', 'EXECUTE')
  and to_regprocedure('public.server_add_computer_seat(uuid,uuid,uuid,text,bigint,uuid)') is null,
  'computer seats take the service policy label; the V1.4 form is gone'
);

-- ── V1.6.1 constraints ───────────────────────────────────────────────────────────────

select throws_ok(
  $$ insert into public.rooms (id, code, status, host_seat_id, rules_version, content_version, latest_revision, content_digest)
     values ('10000000-0000-4000-8000-000000000009', 'ROOM09', 'lobby',
             '20000000-0000-4000-8000-000000000009', '1.6.1', '1.6.1', 0, 'r28-0123456789abcdef') $$,
  '23514',
  null,
  'a V1.6.1 room requires an r29 fingerprint'
);
select lives_ok(
  $$ insert into public.rooms (id, code, status, host_seat_id, rules_version, content_version, latest_revision, content_digest)
     values ('10000000-0000-4000-8000-000000000008', 'ROOM08', 'lobby',
             '20000000-0000-4000-8000-000000000008', '1.4', '1.4', 0, 'r28-0123456789abcdef') $$,
  'historical V1.4 rooms keep their own fingerprint check'
);
select throws_ok(
  $$ insert into private.private_submissions (room_id, window_id, player_id, command_id, contribution_card)
     values ('10000000-0000-4000-8000-000000000003', 'v161-window', 'P2',
             '40000000-0000-4000-8000-000000000003', 'BANK_2') $$,
  '23514',
  null,
  'new private submissions use only the three V1.6.1 Contribution cards'
);
select throws_ok(
  $$ insert into private.private_submissions (room_id, window_id, player_id, command_id, contribution_card, use_fuel_ledger)
     values ('10000000-0000-4000-8000-000000000003', 'v161-window', 'P2',
             '40000000-0000-4000-8000-000000000004', 'TEND', true) $$,
  '23514',
  null,
  'a Fuel Ledger commitment is only possible with BANK or STOKE'
);
select is(
  public.server_load_private_submissions('10000000-0000-4000-8000-000000000003', 'v161-window')->0->>'fuelLedger',
  'true',
  'loading a sealed submission keeps its Fuel Ledger commitment'
);
select is(
  public.server_find_own_pending('10000000-0000-4000-8000-000000000003', 'P1')->>'fuelLedger',
  'true',
  'the own-pending lookup returns the Fuel Ledger commitment'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'room_ai_seats_policy_version_check'
          and pg_get_constraintdef(oid) like '%rules-v1%6%1%'),
  'V1.6.1 computer policy labels are accepted'
);

-- ── The seat-private event log ───────────────────────────────────────────────────────

select is(
  jsonb_array_length(public.server_list_private_events(
    '10000000-0000-4000-8000-000000000003', 'P1', 'secret-hash-host', 0)),
  1,
  'a seat receives exactly its own secret events'
);
select is(
  public.server_list_private_events(
    '10000000-0000-4000-8000-000000000003', 'P1', 'secret-hash-host', 0)->0->'event'->'secret'->>'visibleTo',
  'P1',
  'the secret payload is intact for its own seat'
);
select is(
  jsonb_array_length(public.server_list_private_events(
    '10000000-0000-4000-8000-000000000003', 'P2', 'secret-hash-host', 0)),
  0,
  'one seat''s credential never reads another seat''s secrets'
);
select is(
  jsonb_array_length(public.server_list_private_events(
    '10000000-0000-4000-8000-000000000003', 'P1', 'not-a-credential', 0)),
  0,
  'an unknown credential reads nothing'
);
select is(
  jsonb_array_length(public.server_list_private_events(
    '10000000-0000-4000-8000-000000000003', 'P2', 'secret-hash-guest', 2)),
  1,
  'the private log pages by sequence'
);

-- ── Browser roles ────────────────────────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}';

select results_eq(
  $$ select code from public.rooms order by code $$,
  $$ values ('ROOM01'::text) $$,
  'member sees only their room'
);
select results_eq(
  $$ select display_name from public.room_players order by seat_index $$,
  $$ values ('Member One'::text) $$,
  'member sees only seats in their room'
);
select is(
  (select count(*) from public.game_public_states),
  1::bigint,
  'member sees only their public projection'
);
select throws_ok(
  $$ select count(*) from private.private_submissions $$,
  '42501',
  'permission denied for schema private',
  'member cannot read any private Contribution row'
);
select throws_ok(
  $$ select count(*) from private.game_events $$,
  '42501',
  'permission denied for schema private',
  'member cannot read full event payloads or secrets'
);
select throws_ok(
  $$ select count(*) from private.room_seat_credentials $$,
  '42501',
  'permission denied for schema private',
  'member cannot read credential hashes'
);
select throws_ok(
  $$ update public.rooms set latest_revision = 99 where code = 'ROOM01' $$,
  '42501',
  'permission denied for table rooms',
  'member cannot mutate their public room row'
);

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$ select count(*) from public.game_public_states $$,
  '42501',
  'permission denied for table game_public_states',
  'anon cannot directly read room state'
);

reset role;
select * from finish();
rollback;
