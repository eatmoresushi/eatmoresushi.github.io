-- V1.2.6 Main Order queue amendment.
--
-- New rooms use behaviour fingerprint r15: face-up Main Orders slide left and refill on
-- the right, and the start of Rounds 2-5 rotates two Orders. Historical r14 rows remain
-- valid audit records, but current room/start/transition RPCs accept only r15 so an active
-- game is never silently reinterpreted under the amended rules.

alter table public.rooms drop constraint if exists rooms_v126_fingerprint_check;
alter table public.rooms add constraint rooms_v126_fingerprint_check
  check (
    rules_version <> '1.2.6'
    or (
      content_version = '1.2.6'
      and coalesce(content_digest, '') ~ '^r(14|15)-[0-9a-f]{16}$'
    )
  );

-- Preserve each latest RPC body (including the strategic-computer update) and advance
-- only its fingerprint gate. CREATE OR REPLACE retains the established privileges.
do $migration$
declare
  v_signature regprocedure;
  v_definition text;
begin
  foreach v_signature in array array[
    'public.server_add_computer_seat(uuid,uuid,uuid,text,bigint,uuid)'::regprocedure,
    'public.server_create_room(uuid,text,uuid,text,text,text,uuid,text,text)'::regprocedure,
    'public.server_commit_start(uuid,uuid,text,jsonb,bigint,bigint,text,jsonb,jsonb)'::regprocedure,
    'public.server_commit_transition(uuid,uuid,text,bigint,text,bigint,jsonb,bigint,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature::oid) into v_definition;
    if position('^r14-' in v_definition) = 0 then
      raise exception 'Expected r14 fingerprint gate in %', v_signature;
    end if;
    execute replace(v_definition, '^r14-', '^r15-');
  end loop;
end;
$migration$;
