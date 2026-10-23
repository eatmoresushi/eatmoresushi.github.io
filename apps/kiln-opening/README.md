# Kiln Opening / 开窑 — V1.6.2

A server-authoritative, 2–4 player online adaptation of the Song Dynasty ceramic workshop board game, built with TypeScript, React, Vite and Supabase.

- Game: `https://luyuan.me/kiln-opening/`
- Playtest form: `https://luyuan.me/kiln-opening/playtest/`

Browser floor: Safari and iOS 16.4, Chrome and Edge 111, Firefox 121. The UI relies on container queries, `@layer`, `dvh` and `inert` (UI architecture §7.1).

## Rules authority

The [V1.6.2 Player Rulebook](docs/KILN_OPENING_v1.6.2_EN_SOURCE.md) is the only mechanical source of truth. The [V1.6.2 audit](docs/RULEBOOK_AUDIT_V1.6.2.md) records its checksums, owner amendments, rulings and interpretations. Older rulebooks and audits are history.

Read [AGENTS.md](AGENTS.md), the rulebook and the audit before changing mechanics. Structured data in `data/` drives the engine and the localized component text. Artwork in `assets/current_v04/` is visual reference only and never overrides rules.

## Development

```bash
npm ci
cp .env.example .env.local   # Supabase URL and anon key, for online play
npm run dev                  # http://localhost:5173/kiln-opening/
```

`npm run dev:local` serves the app against an in-memory multiplayer backend (`tools/localBackendV161.ts`) that needs no Supabase credentials. Its rooms last only as long as the development server.

The gates that the Pages workflow runs:

```bash
npm run typecheck
npm run typecheck:edge
npm test
npm run build
```

Browser tests (Playwright, outside `npm test`): `npm run test:e2e` against `npm run dev:local`, and `npm run ci:ui` for the typecheck, unit and build gates plus a Chromium smoke test and a short full game against the built bundle.

## Implementation

- `index.html` → `src/app/main.tsx`: the game UI. `playtest/index.html` → `src/app/playtest/main.tsx`: the playtest form (Form V3). `gallery/index.html` → `src/app/dev/gallery-main.tsx`: the scenario gallery, served by the dev server at `/kiln-opening/gallery/` and never built.
- `src/game/`: the pure, deterministic V1.6.2 rules engine and its decision windows.
- `src/multiplayer/`: authenticated commands, private projections, persistence and computer players.
- `src/playtest/`: the Form V3 model, schema and client.
- `supabase/`: Edge Functions (`game-action`, `playtest-submit`) and ordered database migrations.
- `test/v161/`: the engine, platform and UI suites.
- [UI architecture](docs/UI_V1.6.1_ARCHITECTURE.md), [online specification](docs/ONLINE_GAME_SPEC.md), [implementation decisions](docs/IMPLEMENTATION_DECISIONS.md) and [deployment](docs/DEPLOYMENT.md).

Rooms are stamped rules `1.6.2`, schema 9 and an `r32-` rules fingerprint. Rooms and saves from older versions are refused.

The V1.4 UI and its pinned copies (`src/ui`, `src/main.tsx`, `src/playtest-main.tsx`, `src/game-v14`, `src/multiplayer-v14`, `src/playtest-v14`, `tools/localBackend.ts`) and their suites (`test/v14`, `test/v127`) are no longer built or served. They stay in the tree only until the deletion commit of the cutover (UI architecture §10.4 C2.2).
