begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_temp;
select plan(10);

insert into public.rooms (
  id, code, status, host_seat_id, rules_version, content_version, latest_revision
) values
  ('10000000-0000-4000-8000-000000000001', 'ROOM01', 'lobby',
   '20000000-0000-4000-8000-000000000001', '0.4', '0.4', 0),
  ('10000000-0000-4000-8000-000000000002', 'ROOM02', 'lobby',
   '20000000-0000-4000-8000-000000000002', '0.4', '0.4', 0);

insert into public.room_players (
  seat_id, room_id, player_id, seat_index, display_name, colour, is_host
) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   'P1', 0, 'Member One', 'cinnabar', true),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
   'P1', 0, 'Member Two', 'celadon', true);

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
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'secret-hash-two');

insert into private.private_submissions (
  room_id, window_id, player_id, command_id, contribution
) values
  ('10000000-0000-4000-8000-000000000001', 'window-1', 'P1',
   '40000000-0000-4000-8000-000000000001', 3);

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
