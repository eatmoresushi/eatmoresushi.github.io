-- V1.2.7 owner amendment: the Glaze & Decoration Shifu reduces the total Coin
-- cost by 1 only when glazing two vessels. Single-vessel actions pay normally.
-- Preserve historical room rows; new rooms and active write RPCs require r20.
-- The service also validates the exact content fingerprint.

alter table public.rooms drop constraint if exists rooms_v127_fingerprint_check;
alter table public.rooms add constraint rooms_v127_fingerprint_check
  check (
    rules_version <> '1.2.7'
    or (
      content_version = '1.2.7'
      and coalesce(content_digest, '') ~ '^r(17|18|19|20)-[0-9a-f]{16}$'
    )
  );

-- Keep the latest RPC bodies and privileges; only advance the fingerprint gate.
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
    if position('^r19-' in v_definition) = 0 then
      raise exception 'Expected r19 fingerprint gate in %', v_signature;
    end if;
    execute replace(v_definition, '^r19-', '^r20-');
  end loop;
end;
$migration$;
