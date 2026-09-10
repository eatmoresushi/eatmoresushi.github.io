# Kiln Opening — Codex Handoff Pack

This folder is the engineering handoff for **Kiln Opening / 开窑**, a 2–4 player medium-weight worker-placement game about Song Dynasty ceramic workshops.

## Start here

Codex should read files in this order:

1. `AGENTS.md`
2. `docs/KILN_OPENING_v1.2.5_EN_SOURCE.md` for mechanics
3. `docs/KILN_OPENING_v1.2.5_ZH_SOURCE.md` for Simplified Chinese localization
4. `docs/RULEBOOK_AUDIT_V1.2.5.md`
5. `docs/GAME_RULES.md`
6. `docs/DESIGN_SPEC.md`
7. `docs/ONLINE_GAME_SPEC.md`
8. `docs/ENGINEERING_ARCHITECTURE.md`
9. `data/*.json`
10. `docs/IMPLEMENTATION_DECISIONS.md`
11. `docs/DESIGN_HISTORY.md` only when historical context is useful

The **current mechanical source of truth is the owner-supplied V1.2.5 English rulebook** at `docs/KILN_OPENING_v1.2.5_EN_SOURCE.md`. The paired Chinese rulebook at `docs/KILN_OPENING_v1.2.5_ZH_SOURCE.md` is authoritative for Simplified Chinese terminology and player-facing wording. Their exact checksums and the cross-language review are recorded in `docs/RULEBOOK_AUDIT_V1.2.5.md`. English and Simplified Chinese player-facing rules derive from the same stable IDs. Visual references remain restricted to `assets/current_v04/`; that directory name is retained only as a legacy path. Older rules and simulations remain historical evidence and must not override V1.2.5.

## Important rule for Codex

Do **not** infer gameplay rules from the artwork. Print assets are visual references only. If image text, derived documentation, structured JSON, tests, saved games or UI copy conflict with `docs/KILN_OPENING_v1.2.5_EN_SOURCE.md`, the checked-in English source wins for mechanics. For Chinese labels and wording, `docs/KILN_OPENING_v1.2.5_ZH_SOURCE.md` wins.

Earlier Order-card, central-board, player-board, Tech and reference-card raster art is intentionally **not authoritative** where any text or component count differs from current V1.2.5 rules. See `docs/ASSET_MANIFEST.md`.

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

The V1.2.5 implementation includes the strict TypeScript engine, server-authoritative Supabase backend, React/Vite interface, reconnect handling, the 1/3/4/3/1 twelve-card Fire deck, secret Bank/Tend/Stoke Contributions with Fuel Ledger ±2 choices, a five-card unified Main Order display, separate Starting Orders, seven shared worker locations, Starting and Advanced Techs, Imperial Recognition 0–4 and the private Imperial Kiln, the 2-Coin discard of a still-Flawed ceramic, the universal five-item End-game Exhibition and three-item featured collection, and a persistent English / 简体中文 toggle.

Materials Yard, Potter's Wheel, Glaze & Decoration, Commission Market, and Guild & Academy have a global capacity of 2/3/4 spaces in 2/3/4-player games. Kiln Yard and Labour are uncapped. Workers may use any unoccupied printed space regardless of who occupies other spaces; a Shifu may overfill a full location. There are no private workshop actions or Tech-based worker-space unlocks.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Production configuration uses only the public Supabase project URL and anonymous/publishable key in the browser. See `docs/DEPLOYMENT.md` for the GitHub Pages folder layout and the separate Edge Function secret boundary.


## Audit

See `docs/RULEBOOK_AUDIT_V1.2.5.md` for the current rules audit and `docs/V0.4_HANDOFF_AUDIT.md` only for historical context. Run the TypeScript and Vitest checks to validate the current structured rules and implementation.
