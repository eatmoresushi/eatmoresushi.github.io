-- V1.2.7 owner amendment: eight Starting Orders, S01-S08.
--
-- The replacement deck changes both membership and existing Order IDs' meanings.
-- Preserve historical r17 rows for audit; do not relabel or rewrite their saved games.
-- New rooms and active write RPCs require r18, while the service checks the exact
-- fingerprint before loading a room or applying a command.

alter table public.rooms drop constraint if exists rooms_v127_fingerprint_check;
alter table public.rooms add constraint rooms_v127_fingerprint_check
  check (
    rules_version <> '1.2.7'
    or (
      content_version = '1.2.7'
      and coalesce(content_digest, '') ~ '^r(17|18)-[0-9a-f]{16}$'
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
    if position('^r17-' in v_definition) = 0 then
      raise exception 'Expected r17 fingerprint gate in %', v_signature;
    end if;
    execute replace(v_definition, '^r17-', '^r18-');
  end loop;
end;
$migration$;
