# Kiln Opening / 开窑 — V1.4

A server-authoritative, 2–4 player online adaptation of the Song Dynasty ceramic workshop board game, built with TypeScript, React, Vite and Supabase.

## Rules authority

The [V1.4 Player Rulebook](docs/KILN_OPENING_v1.4_EN_SOURCE.md) is the source of truth. The [V1.4 audit](docs/RULEBOOK_AUDIT_V1.4.md) records the original source hash, owner-approved corrections and implementation validation. Earlier rulebooks, component copy and audits remain historical references. The archived Chinese source supplies terminology only; current English and Chinese gameplay text follows V1.4.

Read [AGENTS.md](AGENTS.md), the rulebook and audit before changing mechanics. Structured data in `data/` drives the engine and localized component reminders. Artwork in `assets/current_v04/` is visual reference only and never overrides rules.

## Development

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Use `npm run dev:local` for an in-memory multiplayer backend that requires no Supabase credentials. Its rooms last only as long as the development server.

```bash
npm test
npm run typecheck
npm run typecheck:edge
npm run build
```

The historical `test/v127/` directory name is retained; its active assertions now follow V1.4. Seeded full-game tests cover 2, 3 and 4 players.

## Implementation

- `src/game/`: pure, deterministic rules engine and explicit decision windows.
- `src/multiplayer/`: authenticated commands, private projections, persistence and computer players.
- `src/ui/`: English/Simplified Chinese interface using stable IDs.
- `supabase/`: server functions and ordered database migrations.
- [Implementation decisions](docs/IMPLEMENTATION_DECISIONS.md): digital timing and privacy details.
- [Online specification](docs/ONLINE_GAME_SPEC.md): multiplayer behavior.
- [Deployment](docs/DEPLOYMENT.md): separate backend and GitHub Pages rollout.

V1.4 uses Workshop → optional Decoration → paid Glaze & Load → Firing, 4/6/8 Shared-Kiln spaces, four starting Coins, updated Orders and Techs, and permanent Ge Crackle separate from Decoration. New rooms use schema 5 and the `r26` rules fingerprint. Older rooms are preserved but cannot continue under the new rules.
