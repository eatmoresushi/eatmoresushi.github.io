# AGENTS.md — Kiln Opening

## Product

Kiln Opening / 开窑 is a 2–4 player synchronous online adaptation of a physical medium-weight Euro board game about Song Dynasty ceramic workshops.

Target session length for the physical design is approximately 90–120 minutes. The online version should reduce administration, not alter strategic decisions.

## Sources of truth

Priority order:

1. `docs/KILN_OPENING_v1.6.2_EN_SOURCE.md` — the V1.6.2 Player Rulebook, designated by the owner on 2026-10-17 as the **only** mechanical source of truth. It replaces V1.6.1 (`docs/KILN_OPENING_v1.6.1_EN_SOURCE.md`, now history). The Chinese edition `docs/KILN_OPENING_v1.6.2_ZH.md` and the component text `docs/KILN_OPENING_v1.6.2_COMPONENT_TEXT.md` are the owner's matching files.
2. `docs/RULEBOOK_AUDIT_V1.6.2.md` — source checksums, owner amendments (A1, A2), owner rulings (R1–R14, B1–B3, as still valid under V1.6.2), editorial corrections and recorded interpretations. `docs/RULEBOOK_AUDIT_V1.6.1.md` is history.
3. `docs/GAME_RULES.md` — source index.
4. `data/*.json` — derived content.
5. `docs/IMPLEMENTATION_DECISIONS.md` — digital interpretations.
6. `docs/ONLINE_GAME_SPEC.md` — digital behaviour.
7. `docs/DESIGN_SPEC.md` — design intent.
8. `docs/GLOSSARY_ZH_V1.6.1.md` — fixed Simplified Chinese terminology.
9. `assets/current_v04/` — visual reference only.

V1.6.2 revises V1.6.1, which reworked V1.2.7 and superseded V1.4, every V1.4 owner amendment and the earlier V1.6 draft. Older sources and audits are history, not active rules.

V1.6.2 changes from V1.6.1 (rulebook changes 21–22):

- **Commission Market** gives no resource and has no blind reservation. An Apprentice privately looks at the top 2 Main Orders and reserves 1 from the display or those 2; the Shifu looks at the top 3 and reserves up to 2 (at least 1) from the display and those 3. Revealed cards not reserved go to the bottom of the Main Order deck (change 24), as do the cards Colour Samples looks at and does not reserve; when several go there together they go in **random order** (owner ruling R19, 2026-10-18 — it replaces the provisional 'order drawn' default P5; use the seeded RNG).
- **Materials Yard** Shifu gains 6 Clay/Wood (no 1-Coin option). **Guild Hall** Shifu takes up to 2 Techs (1 or 2) from different disciplines, face-up or revealed, each at printed cost (no Shifu discount); a placement there is legal only if you can afford 1 face-up Tech from a discipline you do not own. A taken Tech's display position stays empty until the taking player's turn ends, then each discipline refills to 2 (owner revision, 2026-10-17). **Canal Wharf** Shifu gains 4 Coins and takes the top Main Order card unseen into hand.
- **Techs:** Colour Samples adds a once-per-round swap before or after a worker action (discard 1 held Order, privately look at the top 2 Main Orders, reserve 1; the other goes to the bottom of the Main Order deck — rulebook change 24, which supersedes owner ruling R14).
- **Orders (changes 23–24):** the Starting Order deck has **8** cards (S01–S08; S07 asks for Carved, Impressed or Painted); a 4-player game deals all 8. Seventeen Main Order values changed (O01–O05, O14, O15, O19, O20, O22, O26–O28, O30, O32–O34, O38, O39), per Appendix A. Canal Barge: once per round, when you complete an Order, gain 2 Coins (it no longer completes Orders). Protective Saggars (cost 3): your ceramics are never Flawed (Heat Difference 3+ counts as Standard), and once per round 1 of your Standard ceramics from this firing becomes Fine. Fuel Ledger (cost 2): your Bank and Stoke cost no Wood; committing 1 Wood still makes them −2/+2. Second Firing reveals 2 extra Fire cards and uses the one you choose. Senior Apprentice and Kiln Tending cost 3.

Key V1.6.1 facts that differ from V1.4:

- **Locations:** five central locations (Materials Yard, Commission Market, Guild Hall, Canal Wharf, Magistrate's Hall) and two personal locations on each Kiln Player Board (Form & Decorate, Glaze & Load; 2 spaces each, the second locked until a Workshop or Glazing & Loading Tech unlocks it).
- **Capacities** are absolute; there is no Shifu overfill.
- **Kilns:** all five (Ru, Guan, Ge, Ding, Jun) are selectable.
- **Firing setup:** the Shared Kiln is 3 High / 3 Middle / 2 Low, covered 2-1-1 / 2-2-2 / 3-3-2. Base Heat starts at a public Kiln Die roll (faces 1,1,2,2,3,3) every round.
- **Decorations** are Plain, Carved, Impressed and Painted, all 2 Coins, chosen at forming. Glaze is chosen at loading.
- **Ge** crackles 1 Standard ceramic per round after Quality (it becomes Fine and keeps a Crackle marker). Each Crackle ceramic may count as any one Decoration when completing an Order, and is never a Masterpiece.
- **Advanced Techs:** 18, 6 per discipline; at most 3 owned, 1 per discipline. There are no Starting Techs. Each scores 1 VP immediately when gained (owner amendment A1, 2026-10-15), not at game end.
- **Orders:**
  - Setup deals 2 Starting Orders + 1 Main Order. The hand limit is 4 (5 with Colour Samples).
  - Only held Orders are completed, in a single First-Player-order pass.
  - A reserved face-up Order is refilled only after the reserving player's turn ends.

The Chinese UI uses a Song-dynasty kiln-workshop register, not literal translation (owner instruction, 2026-10-14). Use the glossary terms consistently. The period flavour lives in those fixed terms; sentences are plain modern Chinese, as in the owner's 2026-10-16 revision of the Chinese rulebook: 把, 在, 不能, 才可以, 空着, 装进, not 将, 于, 不得, 方可, 空置, 装入 (owner instruction, 2026-10-16).

Player-facing text never says lock or unlock (owner decision D7, `docs/ui-v1.6.1/OWNER_DECISIONS.md`): a second personal space is one you add by learning a Tech ("Learn a Form & Decorate Tech to add this space" / 习得坯作技艺即添此工位; "Added by ⟨Tech⟩" / 由「⟨技艺⟩」添设). Internal identifiers (`unlocked`, `unlocks`, `unlockedAtStart`, `PERSONAL_SPACE_LOCKED`, `PERSONAL_SPACE_UNLOCKED`) keep their names.

## Approved asset rule

Only `assets/current_v04/` is an approved visual-reference directory. The directory name remains unchanged as a stable legacy path. Rules-bearing visuals must follow V1.6.1 data, and localized gameplay text must come from structured data or the i18n layer.

Do not search conversation history or older images for missing boards/cards. Missing current assets are specified in `data/asset_specs.json` and must be rebuilt from current data.

A raster image with slightly different wording is considered obsolete even if the mechanic is similar.

## Explicitly obsolete mechanics

Do not reintroduce any of these unless the user explicitly changes the rules:

- trained vs untrained Apprentices; specialist workers; Hire or Train actions
- Refined Clay; Refining House
- five-player mode
- starting with fewer than 1 Shifu + 3 Apprentices, or unlocking additional workers
- numeric 0–3 Wood bidding instead of Bank/Tend/Stoke cards
- the Kiln Yard, Kiln Yard Wood income, Kiln Yard Shifu targeting, or Shifu ceramic movement or repositioning
- shared Potter's Wheel or Decoration Workshop locations; a separate Glazing step or a Glazed-but-unloaded state
- Starting Techs (including Prepared Clay, White Slip, Rapid Drying, Kiln Tending as Starting Techs)
- Shifu overfill of any location
- separate Market and Imperial Order decks or displays; Office or separate Imperial Order actions
- Imperial Progress, Apprentice-unlock, or Imperial Seal mechanics
- the V1.4 Imperial Court (5 Coins) or an Imperial Grant Coin/resource choice
- Crackle as a Decoration; the V1.4 permanent Ge Crackle with a virtual Glaze
- the V1.4 Glaze Palette, Dipping Vats, Measuring Calipers, White Slip, Drying Frames or Standardised Moulds
- reverse-Work-order Order completion circuits; completing face-up Orders; immediate Main display refill on reservation
- a fixed Base Heat start of 2
- treating Tech effects as worker actions unless the Tech explicitly says so
- Guan's extra Order-hand capacity
- penalties for exhibiting nothing at the End-game Exhibition; exhibiting Flawed ceramics
- fixed VP printed on Techs (each Tech's 1 VP, scored when gained per owner amendment A1, and Connoisseur's Cabinet are V1.6.1 rules)
- adding Tech VP at game end (owner amendment A1 records it when the Tech is gained; it must never be counted twice)

## Engineering principles

- TypeScript strict mode.
- Pure game engine separated from UI and networking.
- Server-authoritative multiplayer state.
- Clients submit typed commands; the server validates and applies them.
- Never trust client-calculated resources, legal moves, VP, card draws, or hidden information.
- Deterministic engine except explicit shuffle/draw randomness (including the Kiln Die).
- Prefer seeded RNG for tests and replay/debugging.
- Store stable IDs for every Order, Technique, Kiln, Vessel and player.
- Do not put core game rules in React components. The UI consumes engine selectors and view models.
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

All undelivered ceramics and their recorded attributes are public for every player, including:

- Shaped (workshop), loaded (Shared or Imperial Kiln) and Finished ceramics;
- the chosen Imperial Kiln modifier, Kiln Furniture modifiers, Heat markers once turned, and Crackle markers.

An Imperial Kiln belongs to one player, but its contents are public. The Kiln Die result and the Fire discard pile are public.

The following are secret:

- **Orders in hand.** Hand counts are public. Only the authenticated owner's private response may include their hand.
- **Contribution cards and Fuel Ledger commitments**, until every eligible contributor has submitted.
- **Private looks**, visible only to the actor: the Test Pieces peek, the Commission Market Shifu top-3, the Colour Samples top-3 and the Guild Hall Shifu inspection (including the bottom order chosen).
- **The Main Order discard pile**, which is face down; only its count is public.

Do not expose other players' secret information in realtime payloads, logs visible to clients, browser state, or database rows readable under client credentials.

## Tests that must exist

At minimum:

- **Setup**
  - setup for 2/3/4 players; reverse-order selection of all five Kilns
  - 2 Clay / 2 Wood / 3 Coins; 1 Shifu + 3 Apprentices
  - secret deal of 2 Starting + 1 Main Order
  - 6-card Main display; 2 face-up Techs per discipline
- **Work Phase placement**
  - no passing; all four workers placed each round
  - absolute capacity at Materials Yard, Commission Market and Guild Hall (2/3/4) and Magistrate's Hall (1/1/2); Canal Wharf uncapped
  - the "at least 1 instance of the main action" legality rule at every location
- **Personal spaces:** once per round each; the second space locked; unlocked by a Workshop or Glazing & Loading Tech, usable later the same round
- **Location effects:** Apprentice and Shifu effects at all seven locations
  - Materials Yard Shifu 1-Coin bonus
  - Form & Decorate Decoration costs and the Shifu −1 discount when forming 2
  - Glaze & Load: Imperial modifier choice and optional Heat-marker placement
  - Commission Market: deferred refill, blind reservation, private Shifu top-3, resource after each reservation
  - Guild Hall: private inspection and chosen bottom order
  - Canal Wharf
  - Magistrate's Hall: 4/3 Coins, Recognition 0–2 only, never to 4
- **Shapes and Kilns**
  - Shape costs and non-limiting Vessel-card proxies
  - all five Kiln abilities: Ru, Guan, Ge Crackle (including after Saggars, wildcard Decoration, never Masterpiece), Ding (1 Clay + 1 Coin, outside discounts), Jun (including during Second Firing per R7)
- **Advanced Techs**
  - all 18, including when-acquired Colour Samples, Kiln Master, Inverted Firing stacks, Setter's Mark reservation, and Canal Barge before/after a worker action
  - the 3-total / 1-per-discipline limit, discipline refill and partial display, printed cost, Shifu discount
  - 1 VP each recorded in the score ledger the moment the Tech is gained (owner amendment A1: Apprentice buy, Shifu inspected or face-up take, Colour Samples itself), shown by the score preview at once, and listed once — not re-added — in final scoring
  - optional abilities (R4): declining keeps the once-per-round use
- **Firing**
  - the Kiln Die every round (seeded, public)
  - Contribution eligibility from Shared Kiln ceramics only, including the zero-participant path
  - secret simultaneous Contribution reveal; Fuel Ledger −2/+2 with its extra Wood
  - Base Heat clamp 0–5
  - Test Pieces after Base Heat (private peek, public bury)
  - Heat-marker step in First Player order (+1/−1/return); Kiln Master
  - Fire deck 1/3/4/3/1, open discard, reshuffle only when empty
  - Actual Heat for Shared Kiln (zone or Kiln Furniture modifier + marker) and court-fired Imperial Kiln ceramics
  - Quality assignment
  - after-Quality abilities in the owner's chosen order: Saggars, Second Firing, Ge
  - optional 2-Coin salvage of a still-Flawed ceramic
  - skipping the firing when nothing is loaded
- **Orders**
  - all 16 Starting and 48 Main Orders, including independent multi-ceramic matching and Crackle wildcards
  - empty Main Order supply (B1)
  - round-start discard-2 / slide / reveal-2 rotation
  - single-pass Order Phase in First Player order, held Orders only
  - hand limit 4/5 at Cleanup
- **Recognition**
  - Crown advancement one at a time, every crossed milestone, the 0–4 cap and +1 VP per Crown beyond 4
  - fixed Imperial Grant (1 Clay + 1 Wood + 1 Coin), Imperial Kiln at 2, Imperial Priority at 3 (free, before or after a worker action, chooses the modifier), Imperial Audience 6 VP at 4
  - Tribute Ware's bonus Crown (R13)
- **Final scoring**
  - automatic unlimited Exhibition (2/3/5) with +3 for 3 Shapes and +3 for 3 Glazes, and Connoisseur's Cabinet (+1 per Fine or Masterpiece, max +5)
  - Coin VP (1 per 3, max 5); all tie-breakers
- **Platform**
  - English/Simplified Chinese rendering from the same stable IDs without changing game state
  - full random legal games for 2/3/4 players completing without error
  - reconnect without changing player seat/state

## Change discipline

If a desired implementation requires changing the board-game rules:

1. stop,
2. explain the conflict,
3. propose the smallest rule change,
4. wait for user approval before modifying the checked-in V1.6.1 source, its recorded rulings, or balance data.

Do not silently “improve” balance values.
