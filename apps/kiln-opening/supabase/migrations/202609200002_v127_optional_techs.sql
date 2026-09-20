-- V1.2.7 owner amendment: optional ST04, T02 and T03 Tech rewards.
--
-- ST04 may gain 1 Clay or 1 Wood. T02/T03 Coin rewards are optional; declining
-- preserves their once-per-round use. Preserve historical r17/r18 room rows for
-- audit, while requiring r19 for new rooms and all active write RPCs. The service
-- also checks the exact fingerprint before loading a room or applying a command.

alter table public.rooms drop constraint if exists rooms_v127_fingerprint_check;
alter table public.rooms add constraint rooms_v127_fingerprint_check
  check (
    rules_version <> '1.2.7'
    or (
      content_version = '1.2.7'
      and coalesce(content_digest, '') ~ '^r(17|18|19)-[0-9a-f]{16}$'
    )
  );

-- Preserve the latest RPC bodies and their established privileges, changing only
-- their active fingerprint gate. Fail if an expected predecessor is missing.
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
    if position('^r18-' in v_definition) = 0 then
      raise exception 'Expected r18 fingerprint gate in %', v_signature;
    end if;
    execute replace(v_definition, '^r18-', '^r19-');
  end loop;
end;
$migration$;
