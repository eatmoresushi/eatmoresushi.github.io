# Deployment

## Repository placement

Keep the existing personal site at the root of `eatmoresushi.github.io` and put this complete application in one subfolder:

```text
eatmoresushi.github.io/
├── CNAME                         # remains luyuan.me
├── index.html                    # existing personal homepage
├── style.css                     # existing homepage styles
├── apps/
│   └── kiln-opening/             # this complete TypeScript project
└── .github/
    └── workflows/
        └── pages.yml
```

Do not copy only `dist/` into the source tree. The workflow builds `apps/kiln-opening/`, stages the existing root homepage unchanged, then publishes the generated game files at `/kiln-opening/`.

## Supabase

The static site is only the client. Before live multiplayer can work:

1. Create or link a Supabase project.
2. Apply every file in `supabase/migrations/` in timestamp order. `supabase db push` does this automatically. The session-lifecycle migration enables `pg_cron` and schedules the daily retention job.
3. Deploy the `game-action` and `playtest-submit` Edge Functions.
4. Enable anonymous Auth for browser sessions.
5. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as Edge Function secrets only.
6. Add these GitHub repository **Actions variables**:
   - `SUPABASE_URL`: the public project URL.
   - `SUPABASE_ANON_KEY`: the public anonymous/publishable key.

Never add the service-role key to GitHub Pages, Vite variables, source code, or client-visible logs. `VITE_` values are embedded into public JavaScript by design.

After applying migrations, confirm `kiln-opening-session-retention` appears under Supabase Cron Jobs. It runs daily, retaining abandoned sessions for 7 days and normally completed sessions for 30 days.

## GitHub Pages

In the repository settings, choose **GitHub Actions** as the Pages source. A push to `master` runs engine/backend tests and the production build, preserves the root `CNAME`, and deploys:

- Homepage: `https://luyuan.me/`
- Game: `https://luyuan.me/kiln-opening/`
- Playtest form: `https://luyuan.me/kiln-opening/playtest/`

The workflow deliberately does not run the browser test because GitHub-hosted runners would need a separate Chromium download. Use `npm run dev:local` for a browser smoke test before publishing UI changes.

## V1.6.2 rollout

The SQL migrations, both Edge Functions and the client are one release: the V1.6.2 server answers only with rooms of its own state schema and rules fingerprint, and each client refuses rooms of another rules version or schema.

### Owner revision 5 (changes 36–42): schema 10, `r33-` (not yet deployed)

Revision 5 adds one migration, `202610300001_v162_rev5_rules.sql`, and changes both Edge Functions and the client (state schema 10, `RULES_BEHAVIOUR_REVISION` 33, `r33-` fingerprints; rules version still `1.6.2`). The three parts depend on each other in both directions, so they go out together, in this order and in one sitting, once the UI stage has updated `src/app` and the Pages workflow's gates pass:

1. Apply `202610300001_v162_rev5_rules.sql` (`supabase db push`). It re-creates the five write gates with `^r33-` and schema 10 and widens `rooms_v162_fingerprint_check` to `^r3[23]-…`; it rewrites no row. The two applied files below are never edited again.
2. Deploy both Edge Functions from the same tree, at once:

   ```sh
   supabase functions deploy game-action
   supabase functions deploy playtest-submit
   ```

3. Publish the client: merge to `master`; the Pages workflow runs the gates and deploys the game at `/kiln-opening/`.
4. Open `https://luyuan.me/kiln-opening/`, create a room and start a game. The room code appears with no version error.

Why the order matters, both ways:

- **Migration before the Edge Functions:** between steps 1 and 2 the revision-4 `game-action` function still sends `r32-` digests and schema-9 states, which the new gates refuse: room creation fails with `session_not_active`, and every command in a revision-4 game fails its schema check. Keep that gap short.
- **Client before the server:** a revision-5 client requires schema 10 and refuses the live server's schema-9 responses ("does not match V1.6.2"), so merging to `master` first breaks every room until steps 1–2 are done. The Pages workflow deploys on every push to `master`, so do not merge the client early.
- **Rooms in progress:** revision-4 rooms (`r32-`, schema 9) stay in the database as history. The revision-5 service refuses them (`UNSUPPORTED_RULES_VERSION` / `RULES_FINGERPRINT_MISMATCH`) and never migrates them; finish or abandon them before the rollout.

After the rollout, new rooms carry rules/content version `1.6.2`, state schema 10 and an `r33-` rules fingerprint, and the client refuses a successful multiplayer response whose room or saved game is not rules `1.6.2` and schema 10. The playtest form still submits Form V3 for rules `1.6.2`.

### Revision 4 (schema 9, `r32-`): deployed

1. Apply `202610150001_v161_rules.sql` and `202610150002_playtest_v161.sql` after the existing migrations (`supabase db push`). Despite their names they are the V1.6.2 migrations: they were written for V1.6.1 and edited in place for V1.6.2 before their first deployment (`supabase/README.md`).
2. Deploy both Edge Functions from the same tree (as above).
3. Publish the client: merge to `master`, and the Pages workflow runs the gates and deploys the game at `/kiln-opening/` and the Form V3 playtest form at `/kiln-opening/playtest/`. The site has no `/kiln-opening/next/` page.
4. Open `https://luyuan.me/kiln-opening/` and create a room. The room code appears with no version error.

Those rooms carry rules/content version `1.6.2`, state schema 9 and an `r32-` rules fingerprint; the playtest form submits Form V3 for rules `1.6.2`. Older rooms (V1.4 and earlier) and Form V2 submissions stay in the database as readable history and cannot be resumed or resubmitted.

Status: by the owner's report of 2026-10-24, steps 1 and 2 are done on the live project. Until step 3 (the UI cutover, UI architecture §10.4 C2.1) is published, `/kiln-opening/` serves the V1.4 client, which fails against the V1.6.2 server with "does not match V1.4". Reverting the client alone does not bring V1.4 play back, because the V1.4 client cannot use the V1.6.2 server.

An older Edge Function still accepts its own older rooms, and starting another game on it does not upgrade its rules. Deploy the matching server and client; do not relabel old snapshots.

Earlier rollouts are history. V1.4 applied `202609260001_v14_rules.sql` … `202610020001_v14_disable_ding.sql` (rules 1.4, schema 5, `r28`); those files stay in `supabase/migrations/` because migrations apply in order.

The public game projection contains only Order-hand counts. The authenticated seat response supplies its private hand and choices. Never persist that combined client view into public snapshots or Realtime events.
