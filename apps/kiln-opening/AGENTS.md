# AGENTS.md — Kiln Opening

## Product

Kiln Opening / 开窑 is a 2–4 player synchronous online adaptation of a physical medium-weight Euro board game about Song Dynasty ceramic workshops.

Target session length for the physical design is approximately 90–120 minutes. The online version should reduce administration, not alter strategic decisions.

## Sources of truth

Priority order:

1. `docs/GAME_RULES.md` — authoritative gameplay rules.
2. `data/*.json` — machine-readable values derived from those rules.
3. `docs/IMPLEMENTATION_DECISIONS.md` — digital interpretations of rules where necessary.
4. `docs/ONLINE_GAME_SPEC.md` — digital-only behaviour.
5. `docs/DESIGN_SPEC.md` — design intent and constraints.
6. `source_rulebook/Kiln_Opening_v0.4_Full_Rulebook.pdf` — historical human backup; V1.0.1 `GAME_RULES.md` overrides it.
7. `assets/print_reference/*` — visual direction only.

Never implement an older mechanic because it appears in historical discussion or art.


## Approved asset rule

Only `assets/current_v04/` is an approved visual-reference directory. The directory name remains unchanged as a stable legacy path; rules-bearing visuals must follow V1.0.1 data.

Do not search conversation history or older images for missing boards/cards. Missing current assets are intentionally specified in `data/asset_specs.json` and `docs/V0.4_ASSETS_TO_REGENERATE.md` and must be rebuilt from current data.

A raster image with slightly different wording is considered obsolete even if the mechanic is similar.

## Explicitly obsolete mechanics

Do not reintroduce any of these unless the user explicitly changes the rules:

- trained vs untrained Apprentices
- specialist workers
- Hire or Train worker-placement actions
- Refined Clay
- Refining House
- five-player mode
- Shifu repositioning a loaded ceramic
- fixed Base Heat thresholds independent of contributor count
- penalties for having no Imperial Presentation
- presenting Flawed ceramics
- direct VP printed on Craft Techniques

## Engineering principles

- TypeScript strict mode.
- Pure game engine separated from UI and networking.
- Server-authoritative multiplayer state.
- Clients submit typed commands; the server validates and applies them.
- Never trust client-calculated resources, legal moves, VP, card draws, or hidden information.
- Deterministic engine except explicit shuffle/draw randomness.
- Prefer seeded RNG for tests and replay/debugging.
- Store stable IDs for every Order, Technique, Kiln, Vessel and player.
- Do not put core game rules in React components.
- Model timing windows explicitly, especially firing.
- Rule errors should return typed, user-readable failures.
- Every rule implementation requires tests.
- Avoid premature visual polish until a full legal game can be completed.

## Core engine shape

Prefer an API conceptually similar to:

```ts
type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: GameRuleError };

function applyAction(
  state: GameState,
  actorId: PlayerId,
  action: GameAction,
  rng: RandomSource
): ApplyResult;
```

`GameState` should be serialisable JSON.

## Hidden information

Wood Contribution selections are secret until every eligible contributor has submitted. Do not expose other players' unrevealed values in realtime payloads, logs visible to clients, browser state, or database rows readable under client credentials.

## Tests that must exist

At minimum:

- setup for 2/3/4 players
- reverse-order Kiln selection
- worker capacity by player count
- passing with unused workers
- Shifu vs Apprentice effects at all six locations
- Shape costs and vessel supply
- Decoration costs
- Technique acquisition limit, printed Apprentice cost, and Shifu −1 Coin discount (minimum 1)
- every one of the 15 V1.0.1 Techniques
- all five Kiln abilities
- contributor-scaled Base Heat for 1–4 contributors
- secret simultaneous Wood reveal
- all five Fire modifiers and kiln-zone modifiers
- Quality assignment
- Jun/Ge/Protective Saggars/Test Pieces/Ru timing
- Market and Imperial Order validation, followed by the optional Apprentice 0–1 / Shifu 0–2 Flawed-sale step
- immediate display refill
- Order hand limit and Guan exception
- every Imperial Order advancing +1 or +2 Imperial Progress as printed, including multiple completions in one round and milestone-crossing jumps
- Apprentice unlock timing at spaces 2 and 4
- Imperial Seal first-arrival rule
- Imperial Presentation eligibility and diversity bonuses
- end-game Coin VP cap
- all tie breakers
- reconnect without changing player seat/state

## Change discipline

If a desired implementation requires changing the board-game rules:

1. stop,
2. explain the conflict,
3. propose the smallest rule change,
4. wait for user approval before modifying `GAME_RULES.md` or balance data.

Do not silently “improve” balance values.
