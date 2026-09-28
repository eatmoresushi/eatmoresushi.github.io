-- Revised V1.4: Measuring Calipers accepts any other Workshop vessel and
-- Dipping Vats replaces Standardised Moulds. Active write RPCs require r26.
-- Preserve existing r23/r24/r25 rows and original fingerprints as history. The
-- service validates the exact content digest and rejects incompatible sessions.

alter table public.rooms drop constraint if exists rooms_v14_fingerprint_check;
alter table public.rooms add constraint rooms_v14_fingerprint_check
  check (
    rules_version <> '1.4'
    or (
      content_version = '1.4'
      and coalesce(content_digest, '') ~ '^r(23|24|25|26)-[0-9a-f]{16}$'
    )
  );

-- Keep the current RPC implementations, signatures, ownership and privileges.
-- Fail closed if any expected gate is missing instead of replacing unrelated SQL.
do $migration$
declare
  v_signature regprocedure;
  v_definition text;
begin
  foreach v_signature in array array[
    'public.server_add_computer_seat(uuid,uuid,uuid,text,bigint,uuid)'::regprocedure,
    'public.server_create_room(uuid,text,uuid,text,text,text,uuid,text,text)'::regprocedure,
    'public.server_commit_start(uuid,uuid,text,jsonb,bigint,bigint,text,jsonb,jsonb)'::regprocedure,
    'public.server_commit_transition(uuid,uuid,text,bigint,text,bigint,jsonb,bigint,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,
    'public.server_join_room(text,uuid,text,uuid,text)'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature::oid) into v_definition;
    if position('^r25-[0-9a-f]{16}$' in v_definition) = 0 then
      raise exception 'Expected r25 fingerprint gate in %', v_signature;
    end if;
    execute replace(v_definition, '^r25-[0-9a-f]{16}$', '^r26-[0-9a-f]{16}$');
  end loop;
end;
$migration$;
