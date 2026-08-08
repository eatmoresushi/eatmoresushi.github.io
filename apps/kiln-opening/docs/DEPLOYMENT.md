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
3. Deploy the `game-action` Edge Function.
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

The workflow deliberately does not run the browser test because GitHub-hosted runners would need a separate Chromium download. Run `npm run test:e2e` from `apps/kiln-opening/` before publishing UI changes.
