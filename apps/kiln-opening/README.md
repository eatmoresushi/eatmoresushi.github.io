# Kiln Opening — Codex Handoff Pack

This folder is the engineering handoff for **Kiln Opening / 开窑**, a 2–4 player medium-weight worker-placement game about Song Dynasty ceramic workshops.

## Start here

Codex should read files in this order:

1. `AGENTS.md`
2. `docs/GAME_RULES.md`
3. `docs/DESIGN_SPEC.md`
4. `docs/ONLINE_GAME_SPEC.md`
5. `docs/ENGINEERING_ARCHITECTURE.md`
6. `data/*.json`
7. `docs/IMPLEMENTATION_DECISIONS.md`
8. `docs/DESIGN_HISTORY.md` only when historical context is useful

The **current V0.6.3 gameplay source of truth is `docs/GAME_RULES.md`**. Visual references remain restricted to `assets/current_v04/`; the legacy directory name is retained only for stable paths. Every rules-bearing visual must be regenerated from current V0.6.3 data. The V0.4 PDF/DOCX in `source_rulebook/` are historical human-readable backups and are superseded by `GAME_RULES.md`.

## Important rule for Codex

Do **not** infer gameplay rules from the artwork. Print assets are visual references only. If image text conflicts with `GAME_RULES.md` or structured JSON, the Markdown/JSON wins.

Earlier Order-card, central-board, player-board, Craft Technique and reference-card raster art is intentionally **not included** where any text or component count differs from current V0.6.3 rules. See `docs/ASSET_MANIFEST.md`.

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

The V0.6.3 implementation includes the strict TypeScript engine, server-authoritative Supabase backend, React/Vite interface, reconnect handling, and deterministic two-browser Playwright game tests.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Production configuration uses only the public Supabase project URL and anonymous/publishable key in the browser. See `docs/DEPLOYMENT.md` for the GitHub Pages folder layout and the separate Edge Function secret boundary.


## Audit

See `docs/V0.4_HANDOFF_AUDIT.md` for the historical component-by-component V0.4 audit. Run `python3 tools/validate_handoff.py` to validate the current V0.6.3 structured rules.
