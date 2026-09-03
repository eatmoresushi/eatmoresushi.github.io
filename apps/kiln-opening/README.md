# Kiln Opening — Codex Handoff Pack

This folder is the engineering handoff for **Kiln Opening / 开窑**, a 2–4 player medium-weight worker-placement game about Song Dynasty ceramic workshops.

## Start here

Codex should read files in this order:

1. `AGENTS.md`
2. `docs/KILN_OPENING_v1.2.2_SOURCE.md`
3. `docs/RULEBOOK_AUDIT_V1.2.2.md`
4. `docs/GAME_RULES.md`
5. `docs/DESIGN_SPEC.md`
6. `docs/ONLINE_GAME_SPEC.md`
7. `docs/ENGINEERING_ARCHITECTURE.md`
8. `data/*.json`
9. `docs/IMPLEMENTATION_DECISIONS.md`
10. `docs/DESIGN_HISTORY.md` only when historical context is useful

The **sole current gameplay source of truth is the adopted V1.2.2 Markdown** at `docs/KILN_OPENING_v1.2.2_SOURCE.md`. It began as the owner-supplied file and now incorporates the owner's later five-card-market amendment and approved conflict rulings. The original file checksum and every adopted resolution are recorded in `docs/RULEBOOK_AUDIT_V1.2.2.md`. English and Simplified Chinese player-facing rules derive from the same stable IDs. Visual references remain restricted to `assets/current_v04/`; that directory name is retained only as a legacy path. Older rules and simulations remain historical evidence and must not override V1.2.2.

## Important rule for Codex

Do **not** infer gameplay rules from the artwork. Print assets are visual references only. If image text, derived documentation, structured JSON, tests, saved games or UI copy conflict with `docs/KILN_OPENING_v1.2.2_SOURCE.md`, the checked-in V1.2.2 source wins, subject only to the recorded internal-conflict rulings in `docs/RULEBOOK_AUDIT_V1.2.2.md`.

Earlier Order-card, central-board, player-board, Tech and reference-card raster art is intentionally **not authoritative** where any text or component count differs from current V1.2.2 rules. See `docs/ASSET_MANIFEST.md`.

## Recommended workflow

Copy this folder into the root of a new Git repository, or copy its contents into your online-game repository. Then open that repository in Codex.

Do not ask Codex to build the whole multiplayer game in one pass. Start with `prompts/01_engineering_design.md`, review the proposal, then continue in order.

## Suggested repository layout after implementation

```text
kiln-opening-online/
├── AGENTS.md
├── README.md
├── docs/
├── data/
├── assets/
├── source_rulebook/
├── prompts/
├── src/
│   ├── game/          # pure rules engine; no React/Supabase
│   ├── ui/
│   └── multiplayer/
├── supabase/
│   ├── migrations/
│   └── functions/
└── tests/
```

## Deployment target

Recommended MVP:

- **Client:** React + TypeScript + Vite
- **Static hosting:** GitHub Pages, using the user's existing custom domain or a `play.` subdomain
- **Realtime/backend:** Supabase
- **Rules authority:** server-side validated actions
- **Testing:** Vitest for game logic; Playwright for end-to-end multiplayer flows

The architecture is intentionally replaceable: the game engine must not depend on React, Supabase, or browser APIs.

## Web client

The V1.2.2 implementation includes the strict TypeScript engine, server-authoritative Supabase backend, React/Vite interface, reconnect handling, the 1/3/4/3/1 twelve-card Fire deck, secret Bank/Tend/Stoke Contributions with Fuel Ledger ±2 choices, a five-card unified Main Order display, separate Starting Orders, private workshop stations, Starting and Advanced Techs, Imperial Recognition and the private Imperial Kiln, Workshop Seconds, the universal five-item End-game Exhibition and three-item featured collection, and a persistent English / 简体中文 toggle.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Production configuration uses only the public Supabase project URL and anonymous/publishable key in the browser. See `docs/DEPLOYMENT.md` for the GitHub Pages folder layout and the separate Edge Function secret boundary.


## Audit

See `docs/RULEBOOK_AUDIT_V1.2.2.md` for the current rules audit and `docs/V0.4_HANDOFF_AUDIT.md` only for historical context. Run the TypeScript and Vitest checks to validate the current structured rules and implementation.
