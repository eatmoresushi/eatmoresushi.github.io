# AGENTS.md — Kiln Opening

## Product

Kiln Opening / 开窑 is a 2–4 player synchronous online adaptation of a physical medium-weight Euro board game about Song Dynasty ceramic workshops.

Target session length for the physical design is approximately 90–120 minutes. The online version should reduce administration, not alter strategic decisions.

## Sources of truth

Priority order:

1. `docs/KILN_OPENING_v1.4_EN_SOURCE.md` — latest owner-supplied V1.4 mechanical authority, with the confirmed Ge timing correction and retained non-conflicting clarifications recorded in the audit.
2. `docs/RULEBOOK_AUDIT_V1.4.md` — source checksums, approved clarifications and migration status.
3. `docs/GAME_RULES.md` — source index.
4. `data/*.json` — derived content.
5. `docs/IMPLEMENTATION_DECISIONS.md` — digital interpretations.
6. `docs/ONLINE_GAME_SPEC.md` — digital behaviour.
7. `docs/DESIGN_SPEC.md` — design intent.
8. `assets/current_v04/` — visual reference only.

V1.4 supersedes V1.2.7 and its owner amendments. Retain older sources as history,
not active rules. The approved four-player kiln allocation is 3 High / 2 Middle /
3 Low. Empty Main Order supply leaves a partial display and reservations require
an available card. Academy Shifu inspection and chosen return order are private.
Jun is once per round; an unused ability may be used during Second Firing, but a
previously used ability may not be used again. The Second Firing window follows the extra Fire-card reveal and recalculation of Actual Heat, before assigning new Quality.
All after-Quality abilities, including Ge, Protective Saggars and Second Firing, resolve in the owner's chosen order. Recheck current Quality, targets, costs and usage limits after each use; Ge is not required to resolve last.
The 2026-09-27 owner amendment deals two Starting Orders and no Main Order to each player at setup, and raises O01–O03 to 4 VP each; their other requirements and rewards are unchanged.
The 2026-09-28 owner amendment makes Imperial Court cost 5 Coins for either worker type. Each permanent Ge Crackle ceramic may use any one Glaze consistently for every requirement when completing an Order; it no longer substitutes Decoration. Actual Glaze and Decoration remain unchanged, and Exhibition uses actual Glaze.
The replacement rulebook supplied later on 2026-09-28 is the sole mechanical source: Measuring Calipers needs any other workshop vessel, including one formed by the same action; Shape does not matter. T03 is Dipping Vats (Forming, 2 Coins), replacing Standardised Moulds. Once per round it may waive Glazing costs for all Plain ceramics loaded by one Kiln Yard action into either kiln; specialised ceramics still pay. Rapid Drying and Imperial Priority cannot use the waiver. The owner reconfirmed player-chosen after-Quality ordering, correcting contradictory Ge wording in that replacement.
The 2026-09-30 owner economy amendment starts each player with 3 Coins, reduces the Coin reward of all 28 crownless Commercial Main Orders by 1, sets every Starting Order to 3 Coins, and removes Kiln Tending (ST04). The three Starting Tech choices are Prepared Clay, White Slip and Rapid Drying, with four physical copies each. Crown Order rewards, Order requirements and Shifu discounts are unchanged.
The 2026-10-02 owner amendment disables Ding Kiln for new online games. Ru, Guan, Ge and Jun are the four selectable Kilns; 2–4-player support and reverse-order selection are unchanged. Retain Ding’s stable `DI` ID, definition and ability as historical content, but reject it during current setup and exclude it from human and computer selection.

## Approved asset rule

Only `assets/current_v04/` is an approved visual-reference directory. The directory name remains unchanged as a stable legacy path; rules-bearing visuals must follow V1.4 data and localized gameplay text must come from structured data or the i18n layer.

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
- Kiln Tending (ST04), including its per-action Clay/Wood income
- selecting Ding Kiln in a new online game
- Kiln Yard Wood income
- Kiln Yard Shifu ceramic movement or neighbouring-zone repositioning
- separate Market and Imperial Order decks or displays
- Office or separate Imperial Order actions (Imperial Court remains in V1.4)
- Imperial Progress, Apprentice-unlock, or Imperial Seal mechanics
- private Potter's Wheel or Decoration Workshop action locations
- Tech-based worker spaces or workshop-location unlocks
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

All undelivered ceramics and their recorded attributes are public for every player, including Workshop, loaded (Shared or Imperial Kiln), and Finished ceramics. An Imperial Kiln belongs to one player but its contents are public.

Orders in hand are secret; hand counts are public. Only the authenticated owner's private response may include their hand. Contribution-card selections are secret until every eligible contributor has submitted. Do not expose other players' unrevealed cards in realtime payloads, logs visible to clients, browser state, or database rows readable under client credentials.

## Tests that must exist

At minimum:

- setup for 2/3/4 players
- reverse-order Kiln selection
- worker capacity by player count
- rejection of Work passing and all four workers placed each round
- all players starting with 1 Shifu + 3 Apprentices
- global 2/3/4-player capacity at Materials Yard, Potter's Wheel, Decoration Workshop, Commission Market, and Craft Academy
- Shifu over-capacity placement, including multiple Shifu overfilling the same shared location
- Shifu vs Apprentice effects at all eight shared locations
- Shape costs and non-limiting Vessel-card proxies
- Plain formation, optional Decoration costs and Shifu free Decoration, and paid Glaze & Load
- Ding Apprentice-only bonus, White Slip/Drying Frames costs and eligibility, and Rapid Drying
- private Craft Academy inspection and owner-chosen bottom order
- exhausted Main Order deck/discard fallback
- end-of-Work Glaze Palette window and permanent Ge Crackle independent of Glaze and Decoration, with one consistent virtual Glaze per marked ceramic for Orders only
- Decoration costs
- all 3 Starting Techs and all 15 V1.4 Advanced Techs
- 3-Coin setup, 3-Coin Starting Orders, all 28 reduced Commercial Main rewards, unchanged Crown rewards and rejection of removed Kiln Tending
- Advanced-Tech acquisition limit, discipline refresh, printed cost, Shifu discount, and end-game VP
- all four selectable Kiln abilities, retained historical Ding ability coverage, and rejection of disabled Ding selection
- Base Heat starting at 2, all contributions, and the 0–5 clamp
- secret simultaneous Contribution-card reveal
- Fuel Ledger's secret −2/+2 Contribution cards, two-Wood affordability, reveal, and payment
- Kiln Yard Shifu target commitment during the Work action, then optional +1/−1 Heat-marker selection in First Player order after Base Heat and before the Fire card, with no Wood cost and no movement
- Shifu Heat-marker effects on only the marked ceramic's Actual Heat, independent of Base Heat, Global Heat and other ceramics; fixed value through Second Firing; stacking with the applicable zone modifier or Kiln Furniture's zero; marker removal after firing and Shifu remaining used until Cleanup
- all five Fire modifiers, the V1.4 1/3/4/3/1 deck distribution, reshuffling, and kiln-zone modifiers
- Quality assignment
- Jun/Ge/Protective Saggars/Test Pieces/Second Firing/Ru timing
- the optional 2-Coin discard of a still-Flawed ceramic after firing
- all 8 Starting Orders and 48 Main Orders, including independent multi-ceramic attribute matching
- secret setup deal-two Starting Orders and no Main Order
- Commission reservation benefits and immediate Main-display refill
- ordered Main-display queue removal/refill and discard-two, retain-four rotation at the start of Rounds 2–5
- reverse-Work-order completion circuits until a complete pass circuit
- uniform three-Order hand limit across Starting and reserved Main Orders
- Crown advancement, every crossed Recognition milestone, the 0–4 cap, and immediate VP for Crowns beyond 4
- Imperial Gift at Recognition 2, Imperial Priority at Recognition 3 before or after a worker action, and Imperial Audience VP at Recognition 4
- unlimited End-game Exhibition with diversity across all exhibited ceramics
- English/Simplified Chinese rendering from the same stable IDs without changing game state
- end-game Coin VP cap
- all tie breakers
- reconnect without changing player seat/state

## Change discipline

If a desired implementation requires changing the board-game rules:

1. stop,
2. explain the conflict,
3. propose the smallest rule change,
4. wait for user approval before modifying either checked-in V1.4 source, its recorded rulings, or balance data.

Do not silently “improve” balance values.
