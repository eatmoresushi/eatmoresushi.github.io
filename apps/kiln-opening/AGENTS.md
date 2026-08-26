# AGENTS.md — Kiln Opening

## Product

Kiln Opening / 开窑 is a 2–4 player synchronous online adaptation of a physical medium-weight Euro board game about Song Dynasty ceramic workshops.

Target session length for the physical design is approximately 90–120 minutes. The online version should reduce administration, not alter strategic decisions.

## Sources of truth

Priority order:

1. `docs/KILN_OPENING_v1.1.6_SOURCE.md` — the sole authoritative rules source; it incorporates owner-approved amendments to the supplied V1.1.6 Markdown.
2. `docs/RULEBOOK_AUDIT_V1.1.6.md` — recorded resolutions for contradictions inside that supplied source.
3. `docs/GAME_RULES.md` — source index and implementation note, not an independent rules authority.
4. `data/*.json` — machine-readable values derived from V1.1.6.
5. `docs/IMPLEMENTATION_DECISIONS.md` — digital interpretations of rules where necessary.
6. `docs/ONLINE_GAME_SPEC.md` — digital-only behaviour.
7. `docs/DESIGN_SPEC.md` — design intent and constraints.
8. `assets/print_reference/*` — visual direction only.

Never implement an older mechanic because it appears in historical discussion or art.


## Approved asset rule

Only `assets/current_v04/` is an approved visual-reference directory. The directory name remains unchanged as a stable legacy path; rules-bearing visuals must follow V1.1.6 data and localized gameplay text must come from structured data or the i18n layer.

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
- fixed Base Heat thresholds independent of contributor count
- numeric 0–3 Wood bidding instead of Bank/Tend/Stoke cards
- Kiln Yard Wood income
- Court Patronage inside the Office rather than its own uncapped Shifu-only location
- Imperial Progress Coin stipends
- Guan's extra Order-hand capacity
- penalties for exhibiting nothing at the End-game Exhibition
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

Contribution-card selections are secret until every eligible contributor has submitted. Do not expose other players' unrevealed cards in realtime payloads, logs visible to clients, browser state, or database rows readable under client credentials.

## Tests that must exist

At minimum:

- setup for 2/3/4 players
- reverse-order Kiln selection
- worker capacity by player count
- passing with unused workers
- Shifu vs Apprentice effects at all eight locations
- Shape costs and vessel supply
- Decoration costs
- Technique acquisition limit, printed Apprentice cost, and Shifu −1 Coin discount (minimum 0)
- every one of the 15 V1.1.6 Techniques
- all five Kiln abilities
- contributor-scaled Base Heat for 1–4 contributors
- secret simultaneous Contribution-card reveal
- all five Fire modifiers, the V1.1.6 1/3/4/3/1 deck distribution, reshuffling, and kiln-zone modifiers
- Quality assignment
- Jun/Ge/Protective Saggars/Test Pieces/Ru timing
- Market and Imperial Order validation, followed by the optional Apprentice 0–1 / Shifu 0–2 Flawed-sale step
- immediate display refill and the two-card left-edge Order-display rotation at the start of Rounds 2–5
- uniform Order hand limit
- every Imperial Order advancing +1, +2, or +3 Imperial Progress according to its required ceramic count, including multiple completions in one round and milestone-crossing jumps
- Apprentice unlock timing at spaces 1 and 3
- Imperial Seal first-arrival rule
- universal five-ceramic End-game Exhibition and its three-ceramic featured collection
- English/Simplified Chinese rendering from the same stable IDs without changing game state
- end-game Coin VP cap
- all tie breakers
- reconnect without changing player seat/state

## Change discipline

If a desired implementation requires changing the board-game rules:

1. stop,
2. explain the conflict,
3. propose the smallest rule change,
4. wait for user approval before modifying the checked-in V1.1.6 source, its recorded errata, or balance data.

Do not silently “improve” balance values.
