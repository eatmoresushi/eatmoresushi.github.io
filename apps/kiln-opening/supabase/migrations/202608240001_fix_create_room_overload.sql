-- Repair: 202608230003 broke room creation.
--
-- It added `p_content_digest text default null` to `server_create_room` with
-- `create or replace function`. Postgres identifies a function by name *and argument
-- types*, so that did not replace anything -- it created a second, nine-argument function
-- alongside the eight-argument one from 202608230001. PostgREST calls the RPC with eight
-- named arguments, which from then on matched both candidates (the nine-argument one via its
-- default), and Postgres refused the ambiguous call. Every attempt to create a room returned
-- a 500.
--
-- Dropping the superseded eight-argument signature leaves exactly one candidate. The
-- nine-argument definition from 202608230003 is already correct and is left untouched.
--
-- The lesson for any future RPC change: adding a parameter is not a replacement. Either keep
-- the signature identical, or drop the old signature explicitly in the same migration.

drop function if exists public.server_create_room(uuid, text, uuid, text, text, text, uuid, text);

-- Re-assert the grants on the surviving signature, so this migration is self-contained and
-- can be applied to a database where the drop happened to remove the granted one.
revoke all on function public.server_create_room(uuid, text, uuid, text, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.server_create_room(uuid, text, uuid, text, text, text, uuid, text, text) to service_role;
