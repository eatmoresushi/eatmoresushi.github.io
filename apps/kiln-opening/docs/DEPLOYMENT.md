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


## V1.4 rollout

Apply `202609260001_v14_rules.sql`, `202609260002_playtest_v14.sql`, `202609270001_v14_starting_orders.sql`, `202609280001_v14_court_ge_amendment.sql` and `202609280002_v14_forming_techs.sql` after the existing migrations, deploy the current `game-action` and `playtest-submit` Edge Functions, then rebuild/publish the client. New rooms require rules/content version 1.4, schema 5 and an `r26` fingerprint. Historical room and playtest rows remain intact; older games, including pre-amendment `r25` rooms, cannot resume under the updated rules.

The migrations add Fuel Ledger's separate `BANK_2`/`STOKE_2` card values and the V1.4 computer policy, and update playtest reporting. The old Fuel Ledger database column remains only for historical records. The 2026-09-28 amendment migration updates all five authoritative RPC write gates for the 5-Coin Imperial Court cost and Ge Glaze substitution. The later Forming Tech migration updates those gates again for Measuring Calipers and Dipping Vats. Both 2026-09-28 migrations are prepared locally and have not been deployed. Migration files do not deploy themselves.

The client also rejects successful multiplayer responses with older room rules or
game schemas. An older Edge Function can accept its own old rooms, including
ceramics with `decoration: "crackle"`, which the V1.4 artwork cannot render.
Starting another game on that older service does not upgrade its rules. Deploy
the matching server and client; do not relabel old snapshots or guess a replacement
Decoration. Current Ge preserves the actual Glaze and Decoration and adds the
separate permanent `crackle: true` property.

The public game projection contains only Order-hand counts. The authenticated seat response supplies its private hand and choices. Never persist that combined client view into public snapshots or Realtime events.
