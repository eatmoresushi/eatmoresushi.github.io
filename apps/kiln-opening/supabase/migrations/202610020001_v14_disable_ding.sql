-- Owner-approved V1.4 amendment: disable Ding Kiln for new games.
-- Require r28 on active writes; preserve all historical room rows and fingerprints.
-- The service validates the exact current rules digest before applying commands.

alter table public.rooms drop constraint if exists rooms_v14_fingerprint_check;
alter table public.rooms add constraint rooms_v14_fingerprint_check
  check (
    rules_version <> '1.4'
    or (
      content_version = '1.4'
      and coalesce(content_digest, '') ~ '^r(23|24|25|26|27|28)-[0-9a-f]{16}$'
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
    if position('^r27-[0-9a-f]{16}$' in v_definition) = 0 then
      raise exception 'Expected r27 fingerprint gate in %', v_signature;
    end if;
    execute replace(v_definition, '^r27-[0-9a-f]{16}$', '^r28-[0-9a-f]{16}$');
  end loop;
end;
$migration$;
