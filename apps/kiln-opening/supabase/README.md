# Supabase multiplayer backend

`migrations/202608070001_multiplayer_backend.sql` creates the authoritative storage, room-member RLS policies, service-only transaction RPCs, and Realtime publication entries.

`functions/game-action` exposes `create_room`, `join_room`, `reconnect`, `start_game`, and `game_action` operations. The function requires a valid Supabase JWT. The service derives the engine actor from the opaque seat credential; request bodies never establish actor identity.

Deployment requirements:

- configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only as Edge Function secrets;
- use Supabase anonymous or normal Auth for browser sessions so room-member RLS can protect Realtime subscriptions;
- store the returned raw seat token only in that browser's durable per-room storage;
- subscribe browsers only to `rooms`, `room_players`, `game_public_states`, and `game_public_events` under their authenticated session;
- never expose the `private` schema through the Data API.

Realtime is a notification path. Reconnect or revision gaps must refetch the latest public projection through the function. Unrevealed Wood values exist only in `private.private_submissions`, private command/audit rows, and the submitting seat's endpoint response.

`migrations/202609050001_playtest_submissions.sql` adds private, normalized playtest storage and workbook-shaped analysis views. `functions/playtest-submit` accepts authenticated anonymous submissions, validates them, and calls a service-role-only transaction that assigns the Game ID. See `docs/PLAYTEST_FORM.md` for the data model, deployment, and example analysis queries.
