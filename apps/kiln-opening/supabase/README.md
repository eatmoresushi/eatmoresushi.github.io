# Supabase multiplayer backend

`migrations/202608070001_multiplayer_backend.sql` creates the authoritative storage, room-member RLS policies, service-only transaction RPCs, and Realtime publication entries.

`functions/game-action` exposes `create_room`, `join_room`, `reconnect`, `start_game`, `add_computer`, `remove_computer`, `advance_computers`, `end_session`, `list_private_events` and `game_action` operations. The function requires a valid Supabase JWT. The service derives the engine actor from the opaque seat credential; request bodies never establish actor identity.

Deployment requirements:

- configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only as Edge Function secrets;
- use Supabase anonymous or normal Auth for browser sessions so room-member RLS can protect Realtime subscriptions;
- store the returned raw seat token only in that browser's durable per-room storage;
- subscribe browsers only to `rooms`, `room_players`, `game_public_states`, and `game_public_events` under their authenticated session;
- never expose the `private` schema through the Data API.

Realtime is a notification path. Reconnect or revision gaps must refetch the latest public projection through the function. Unrevealed Wood values exist only in `private.private_submissions`, private command/audit rows, and the submitting seat's endpoint response.

`migrations/202609050001_playtest_submissions.sql` adds private, normalized playtest storage and workbook-shaped analysis views. `functions/playtest-submit` accepts authenticated anonymous submissions, validates them, and calls a service-role-only transaction that assigns the Game ID. See `docs/PLAYTEST_FORM.md` for the data model, deployment, and example analysis queries.

## V1.6.2

`migrations/202610150001_v161_rules.sql` moves every write gate to rules `1.6.2`, state schema 9 and `r32-` fingerprints; older rooms stay as history and are refused. It was written for V1.6.1 (schema 6, `r29-`) and edited in place for V1.6.2 before any deployment (schema 7, `r30-`), again for owner revision 3 (changes 25–27: schema 8, `r31-`, five Contribution cards) and again for owner revision 4 (changes 28–35 and rulings R20–R25: schema 9, `r32-`), so it keeps its file name (ENGINE_V1.6.2_DELTA.md §9, §15.16). It replaces the V1.4 signatures of `server_add_computer_seat` (now taking the service's `p_policy_version`, `rules-v1.6.2-…`) and `server_commit_start` (now persisting the game start's events), stores each sealed Contribution card, one of the five V1.6.2 cards (Fuel Ledger's `FUEL_LEDGER_BANK` and `FUEL_LEDGER_STOKE` replaced the secret Wood commitment, so `private_submissions.use_fuel_ledger` is history only), refuses public rows that carry `hidden` state or event `secret`s, and adds `server_list_private_events`, which returns only the calling seat's own secrets after re-checking its credential. `migrations/202610150002_playtest_v161.sql` accepts playtest Form V3 for V1.6.2 only.

Both files are applied to the live database and are never edited again. Owner revision 5 (changes 36–42) adds `migrations/202610300001_v162_rev5_rules.sql`: it re-creates the five fingerprint gates (`server_create_room`, `server_join_room`, `server_add_computer_seat`, `server_commit_start`, `server_commit_transition`), each copied verbatim from the applied file with only `^r32-` → `^r33-` and, in the two commits, the state schema check 9 → 10, and widens `rooms_v162_fingerprint_check` to `^r3[23]-…` so the existing `r32-` rows stay valid as history while every write path requires `r33-` and schema 10 (ENGINE_V1.6.2_DELTA.md §16.18). It rewrites no row.

Apply the migrations and deploy both Edge Functions together: a V1.4 function cannot call the V1.6.2 RPCs, and the revision-5 service (schema 10, `r33-`) needs the revision-5 gates. `supabase/tests/rls.test.sql` checks the privileges, constraints and the private event log.

Set `KILN_ENGINE_INVARIANTS=1` on the `game-action` function to run the engine's invariant checks after every command (development and staging).

