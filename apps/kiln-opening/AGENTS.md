# AGENTS.md — Kiln Opening

## Product

Kiln Opening / 开窑 is a 2–4 player synchronous online adaptation of a physical medium-weight Euro board game about Song Dynasty ceramic workshops.

Target session length for the physical design is approximately 90–120 minutes. The online version should reduce administration, not alter strategic decisions.

## Sources of truth

Priority order:

1. `docs/KILN_OPENING_v1.2.2_SOURCE.md` — the sole authoritative rules source; it is an exact copy of the owner-supplied V1.2.2 Markdown.
2. `docs/RULEBOOK_AUDIT_V1.2.2.md` — recorded owner resolutions for contradictions and ambiguities inside that supplied source.
3. `docs/GAME_RULES.md` — source index and implementation note, not an independent rules authority.
4. `data/*.json` — machine-readable values derived from V1.2.2.
5. `docs/IMPLEMENTATION_DECISIONS.md` — digital interpretations of rules where necessary.
6. `docs/ONLINE_GAME_SPEC.md` — digital-only behaviour.
7. `docs/DESIGN_SPEC.md` — design intent and constraints.
8. `assets/print_reference/*` — visual direction only.

Never implement an older mechanic because it appears in historical discussion or art.


## Approved asset rule

Only `assets/current_v04/` is an approved visual-reference directory. The directory name remains unchanged as a stable legacy path; rules-bearing visuals must follow V1.2.2 data and localized gameplay text must come from structured data or the i18n layer.

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
- starting with fewer than 1 Shifu + 3 Apprentices or unlocking additional workers
- numeric 0–3 Wood bidding instead of Bank/Tend/Stoke cards
- Kiln Yard Wood income
- separate Market and Imperial Order decks or displays
- Office, Court Patronage, or separate Imperial Order actions
- Imperial Progress, Apprentice-unlock, or Imperial Seal mechanics
- shared Potter's Wheel or Glaze Workshop action locations
- treating Tech effects as worker actions unless the Tech explicitly says so
- Guan's extra Order-hand capacity
- penalties for exhibiting nothing at the End-game Exhibition
- presenting Flawed ceramics
- direct VP printed on Techs

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
- all players starting with 1 Shifu + 3 Apprentices
- private Potter's Wheel and Glaze & Decoration capacity and both Advanced-Tech unlocks
- Shifu vs Apprentice effects at all five shared locations and both private workshop actions
- Shape costs and vessel supply
- Decoration costs
- all 4 Starting Techs and all 15 V1.2.2 Advanced Techs
- Advanced-Tech acquisition limit, discipline refresh, printed cost, Shifu discount, and station unlocks
- all five Kiln abilities
- Base Heat starting at 2, all contributions, and the 0–5 clamp
- secret simultaneous Contribution-card reveal
- Fuel Ledger's secret −2/+2 choices, two-Wood affordability, reveal, and payment
- all five Fire modifiers, the V1.2.2 1/3/4/3/1 deck distribution, reshuffling, and kiln-zone modifiers
- Quality assignment
- Jun/Ge/Protective Saggars/Test Pieces/Second Firing/Ru timing
- Workshop Seconds after firing
- all 16 Starting Orders and 48 Main Orders, including independent multi-ceramic attribute matching
- setup deal-four/keep-two Starting Orders
- Commission reservation benefits and immediate Main-display refill
- discard-three left-edge Main-display rotation at the start of Rounds 2–5
- reverse-Work-order completion circuits until a complete pass circuit
- uniform three-Order hand limit across Starting and reserved Main Orders
- Crown advancement, every crossed Recognition milestone, and the 0–5 cap
- Imperial Gift unlock, Imperial Priority's once-per-game additional Imperial-Kiln load, and Imperial Audience VP
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
4. wait for user approval before modifying the checked-in V1.2.2 source, its recorded rulings, or balance data.

Do not silently “improve” balance values.
