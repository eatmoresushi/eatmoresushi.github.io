# AGENTS.md — Kiln Opening

## Product

Kiln Opening / 开窑 is a 2–4 player synchronous online adaptation of a physical medium-weight Euro board game about Song Dynasty ceramic workshops.

Target session length for the physical design is approximately 90–120 minutes. The online version should reduce administration, not alter strategic decisions.

## Sources of truth

Priority order:

1. `docs/KILN_OPENING_v1.6.2_EN_SOURCE.md` — the V1.6.2 Player Rulebook, designated by the owner on 2026-10-17 as the **only** mechanical source of truth. It replaces V1.6.1 (`docs/KILN_OPENING_v1.6.1_EN_SOURCE.md`, now history). The Chinese edition `docs/KILN_OPENING_v1.6.2_ZH.md` and the component text `docs/KILN_OPENING_v1.6.2_COMPONENT_TEXT.md` are the owner's matching files.
2. `docs/RULEBOOK_AUDIT_V1.6.2.md` — source checksums, owner amendments (A1, superseded by change 27; A2), owner rulings (R1–R25, B1–B3, as still valid under V1.6.2), editorial corrections and recorded interpretations. `docs/RULEBOOK_AUDIT_V1.6.1.md` is history.
3. `docs/GAME_RULES.md` — source index.
4. `data/*.json` — derived content.
5. `docs/IMPLEMENTATION_DECISIONS.md` — digital interpretations.
6. `docs/ONLINE_GAME_SPEC.md` — digital behaviour.
7. `docs/DESIGN_SPEC.md` — design intent.
8. `docs/GLOSSARY_ZH_V1.6.1.md` — fixed Simplified Chinese terminology.
9. `assets/current_v04/` — visual reference only.

V1.6.2 revises V1.6.1, which reworked V1.2.7 and superseded V1.4, every V1.4 owner amendment and the earlier V1.6 draft. Older sources and audits are history, not active rules.

V1.6.2 changes from V1.6.1 (rulebook changes 21–35; 23–24 are the owner's revision 2, 25–27 revision 3, 28–35 revision 4):

- **Commission Market** gives no resource and has no blind reservation. An Apprentice privately looks at the top 2 Main Orders and reserves 1 from the display or those 2; the Shifu looks at the top 3 and reserves up to 2 (at least 1) from the display and those 3. Revealed cards not reserved are **discarded** face down to the Main Order discard pile, as are the cards Colour Samples looks at and does not reserve (owner ruling R25, 2026-10-23, which reverses change 24's bottom-of-deck flow and makes R19 obsolete); when the Main Order deck is empty and a card is needed, its discard pile is shuffled into a new deck.
- **Materials Yard** Shifu gains 6 Clay/Wood (no 1-Coin option; 8 since change 34). **Guild Hall** Shifu takes up to 2 Techs (1 or 2) from different disciplines, face-up or revealed, each at printed cost (no Shifu discount); a placement there is legal only if you can afford 1 face-up Tech from a discipline you do not own. A taken Tech's display position stays empty until the taking player's turn ends, then each discipline refills to 2 (owner revision, 2026-10-17). **Canal Wharf** Shifu gains 4 Coins and takes the top Main Order card unseen into hand.
- **Techs:** Colour Samples adds a once-per-round swap before or after a worker action (discard 1 held Order, then Select 3: reserve 1 of the 3 or 1 face-up Order; the rest are discarded — change 25 and ruling R25). Canal Barge: once per round, when you complete an Order, gain 2 Coins (it no longer completes Orders). Protective Saggars (cost 3): your ceramics are never Flawed (Heat Difference 3+ counts as Standard), and once per round 1 of your Standard ceramics from this firing becomes Fine. Fuel Ledger (cost 2; 4 since change 30): your Bank and Stoke cost no Wood, and the tile brings the Fuel Ledger Bank (1 Wood, −2) and Fuel Ledger Stoke (1 Wood, +2) Contribution cards (change 26). Second Firing reveals 2 extra Fire cards and uses the one you choose. Senior Apprentice and Kiln Tending cost 3.
- **Orders (changes 23–24):** the Starting Order deck has **8** cards (S01–S08; S07 asks for Carved, Impressed or Painted); a 4-player game deals all 8. Nineteen Main Order values changed (O01–O05, O14, O15, O19, O20, O22, O26–O28, O30, O32–O34, O38, O39), per Appendix A.
- **Fire deck:** with Second Firing taking 2 cards, the 12-card deck can now run out mid-game. The discard is then shuffled and placed on top, and a card buried by Test Pieces is drawn last (L645; owner ruling R15: a deck holding only buried cards counts as run out).
- **Orders are completed only in the Order Phase.** Ru, Guan, Tribute Ware, Crackle wildcards and Canal Barge's 2 Coins trigger there; ruling R6 is obsolete.
- **Changes 25–27 (owner revision, 2026-10-18):** (25) keyword **Select N** — look at the top N Main Orders, reserve 1 of them or 1 face-up Main Order from the display, discard the rest (R25); Commission Market Apprentice Select 2, Shifu Select 3 reserving up to 2; Colour Samples Select 3 when acquired and for its once-a-round swap (so the swap now looks at 3, and both Colour Samples looks may take a face-up Order instead, refilled at the end of the turn). (26) **Fuel Ledger as cards** — the tile brings 2 Contribution cards, Fuel Ledger Bank (1 Wood, −2) and Fuel Ledger Stoke (1 Wood, +2); its owner chooses 1 of 5 cards and plain Bank/Stoke cost no Wood; 14 Contribution cards share one back; no Wood is set aside before the reveal. (27) **No Tech VP** — gaining an Advanced Tech scores nothing (this supersedes owner amendment A1); Connoisseur's Cabinet keeps its end-game VP; printed costs unchanged.

- **Changes 28–35 (owner revision 4, 2026-10-22/23):** (28, 31) **no player Heat marker** — no face-down marker, no marker step; the Glaze & Load Shifu just loads up to 2; Kiln Master's +1/−1 marker is placed face up when the ceramic is loaded (once per round); firing is Contributions (Base Heat) → Test Pieces (after Base Heat, before the Fire card) → Fire → Actual Heat (Jun) → Quality → after-Quality abilities. (29) **Ge**: once per round Crackle goes on 1 Fine or Standard ceramic from this firing (a Standard one becomes Fine); each Crackle ceramic delivered to complete an Order scores 1 VP; Saggars' Standard → Fine and Crackle may both apply to one ceramic. (30) Fuel Ledger costs **4**; **forming costs the Shape's Clay + 2 Coins with any Decoration** (no Decoration table; the Shifu's −1 Coin, Decorator's Kit and Ding's 1-Coin vessel are unchanged as reductions of a vessel's cost); an unused Jun adjustment may apply to a Second Firing recalculation; Form & Decorate legality counts reductions; **a Flawed ceramic may be sold for 2 Coins during its owner's turn** (R20; the firing-step salvage is gone); the Kiln Die is the day's weather (flavour). (32) **the starting Main Order is chosen**, not dealt: in reverse turn order during Setup each player chooses a Kiln Player Board and takes 1 face-up Main Order from the display (refilled after each take); only the 2 Starting Orders are dealt. (33) **Magistrate's Hall Shifu** pays 4 Coins, advances 1 step and may reserve 1 face-up Crown Order from the display (optional, R21; nothing if none shows; refilled at the end of the turn). (34, 35) **the kiln burns fuel**: a Glaze & Load action that loads into the Shared Kiln costs **1 Wood**, whether it loads 1 vessel or 2; an action that loads only into the Imperial Kiln (and Imperial Priority) costs no Wood; Materials Yard Apprentice **4**, Shifu **8**; players start with **2 Clay, 3 Wood, 3 Coins**. (35) There is **no seat Coin** (the reverse-order Main Order pick is the seat compensation).

`docs/ENGINE_V1.6.2_DELTA.md` lists what each change means for the engine, data and tests; `docs/RULEBOOK_AUDIT_V1.6.2.md` re-checks every ruling and records the open questions.

Key facts V1.6.1 introduced over V1.4 (V1.6.2 keeps them):

- **Locations:** five central locations (Materials Yard, Commission Market, Guild Hall, Canal Wharf, Magistrate's Hall) and two personal locations on each Kiln Player Board (Form & Decorate, Glaze & Load; 2 spaces each, the second under a Cover token until a Form & Decorate or Glazing & Loading Tech removes it; the Form & Decorate discipline's internal ID is `workshop`, owner amendment A2).
- **Capacities** are absolute; there is no Shifu overfill.
- **Kilns:** all five (Ru, Guan, Ge, Ding, Jun) are selectable.
- **Firing setup:** the Shared Kiln is 3 High / 3 Middle / 2 Low, covered 2-1-1 / 2-2-2 / 3-3-2. Base Heat starts at a public Kiln Die roll (faces 1,1,2,2,3,3) every round.
- **Decorations** are Plain, Carved, Impressed and Painted, chosen at forming; forming a vessel costs its Clay + 2 Coins whatever the Decoration (change 30). Glaze is chosen at loading.
- **Ge** (change 29) crackles 1 Fine or Standard ceramic from this firing per round after Quality (a Standard one becomes Fine; it keeps a Crackle marker). Each Crackle ceramic may count as any one Decoration when completing an Order and scores 1 VP when delivered.
- **Advanced Techs:** 18, 6 per discipline; at most 3 owned, 1 per discipline. There are no Starting Techs. Gaining a Tech scores no VP (change 27 supersedes owner amendment A1).
- **Orders:**
  - Setup deals 2 Starting Orders; each player takes 1 face-up Main Order with their Kiln, in reverse turn order (change 32, R23). The hand limit is 4 (5 with Colour Samples).
  - Only held Orders are completed, in a single First-Player-order pass.
  - A reserved face-up Order is refilled only after the reserving player's turn ends.

The Chinese UI uses a Song-dynasty kiln-workshop register, not literal translation (owner instruction, 2026-10-14). Use the glossary terms consistently. The period flavour lives in those fixed terms; sentences are plain modern Chinese, as in the owner's 2026-10-16 revision of the Chinese rulebook: 把, 在, 不能, 才可以, 空着, 装进, not 将, 于, 不得, 方可, 空置, 装入 (owner instruction, 2026-10-16).

Player-facing text never says lock or unlock (owner decision D7, `docs/ui-v1.6.1/OWNER_DECISIONS.md`): a second personal space is one you add by learning a Tech ("Learn a Form & Decorate Tech to add this space" / 习得坯作技艺即添此工位; "Added by ⟨Tech⟩" / 由「⟨技艺⟩」添设). Internal identifiers (`unlocked`, `unlocks`, `unlockedAtStart`, `PERSONAL_SPACE_LOCKED`, `PERSONAL_SPACE_UNLOCKED`) keep their names.

## Approved asset rule

Only `assets/current_v04/` is an approved visual-reference directory. The directory name remains unchanged as a stable legacy path. Rules-bearing visuals must follow V1.6.2 data, and localized gameplay text must come from structured data or the i18n layer.

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
- any VP for owning or gaining an Advanced Tech (owner amendment A1's 1 VP per Tech was removed by change 27; only Connoisseur's Cabinet scores, at game end)
- a secret Fuel Ledger Wood commitment beside a Contribution card (change 26 replaced it with the Fuel Ledger Bank and Fuel Ledger Stoke cards)

Removed by V1.6.2 (rulebook changes 21–35; changes 26–27 are the last two items of the list above):

- a resource (Clay, Wood or Coin) gained at the Commission Market, after each reservation or otherwise
- blind Commission Market reservations (the top card taken unseen); the Shifu's optional top-3 selection replacing one of two separate reservations; a Commission Market placement that reserves without first looking at the top 2 (Apprentice) or 3 (Shifu)
- the Materials Yard Shifu's 4 resources and its 1-Coin +1 Clay +1 Wood option (the Shifu gains 8 Clay/Wood since change 34)
- any Guild Hall Shifu discount (the Shifu takes 1–2 Techs at printed cost), a Shifu limited to 1 Tech, an immediate Tech display refill after a take (positions refill when the taker's turn ends), and a Canal Wharf Shifu that gains only Coins (it also takes the top Main Order)
- Canal Barge completing Orders, its before/after-action window, and any Order completion outside the Order Phase (ruling R6)
- Protective Saggars' Wood cost and its Flawed → Standard upgrade (its ceramics are never Flawed instead)
- Fuel Ledger without free Bank and Stoke
- a single extra Fire card for Second Firing (it reveals 2 and uses 1)
- the V1.6.1 costs Senior Apprentice 2, Kiln Tending 2, Protective Saggars 2, Fuel Ledger 3
- the V1.6.1 editorial note that the Fire deck never runs out or reshuffles mid-game
- the 16-card Starting Order deck (S01–S16) and its V1.6.1 values, and ruling R3 on S14 and S16 (change 23: 8 cards, S01–S08; S09–S16 are retired; a 4-player game deals all 8)
- the V1.6.1 values of the nineteen re-valued Main Orders (change 24, Appendix A)
- the bottom-of-deck flow for looked-at Orders not reserved, and ruling R19's random order there (change 24's flow, reversed by owner ruling R25: they are discarded); ruling R14 (the swap's 2-card look)
- a Colour Samples swap that looks at only the top 2, and Colour Samples looks that reserve only from the looked cards (change 25: both are a Select 3, which may reserve a face-up Order instead)
- the player Heat marker, its face-down placement by the Glaze & Load Shifu and the Heat-marker step (changes 28, 31)
- the firing-step salvage of a still-Flawed ceramic (change 30: a Flawed ceramic is sold for 2 Coins during its owner's turn, R20)
- a seat Coin for players after the first (change 35), a dealt starting Main Order (change 32), and 2 starting Wood
- the Decoration cost table and Decoration costs (change 30: a vessel costs its Clay + 2 Coins)
- the Magistrate's Hall Shifu at 3 Coins (change 33), Materials Yard 3 / 6 (change 34), Fuel Ledger at 2 (change 30)
- Ge crackling only a Standard ceramic, 'a Crackle ceramic is never a Masterpiece' as a separate rule, and revision 3's ban on Saggars' Standard → Fine step and Crackle on the same ceramic (change 29: both may apply to one ceramic, L641)
- free loading into the Shared Kiln (change 34: 1 Wood per Glaze & Load action into it)

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
- the chosen Imperial Kiln modifier, Kiln Furniture modifiers, Kiln Master's +1/−1 marker (face up from loading, change 31, R22), and Crackle markers.

An Imperial Kiln belongs to one player, but its contents are public. The Kiln Die result and the Fire discard pile are public.

The following are secret:

- **Orders in hand.** Hand counts are public. Only the authenticated owner's private response may include their hand. This includes the card the Canal Wharf Shifu takes unseen and every Order reserved from a look.
- **Contribution cards** (including Fuel Ledger Bank and Fuel Ledger Stoke), until every eligible contributor has submitted.
- **Private looks**, visible only to the actor:
  - the Test Pieces peek;
  - the Commission Market top 2 (Apprentice effect) and top 3 (Shifu effect, Senior Apprentice included);
  - the Colour Samples Select 3, when acquired and in its swap;
  - the Guild Hall Shifu inspection, including the bottom order chosen.
- **The Main Order discard pile**, which is face down; only its count is public. This includes the held Order discarded for a Colour Samples swap; a discarded Starting Order goes to the box.
- **Looked-at Orders not reserved**, which are discarded face down to the Main Order discard pile (R25): which cards they are is visible only to the looker; the discard count is public.

The number of cards each look shows, face-up reservations (including the Setup Main Order take and the Magistrate's Hall Shifu's Crown Order), Kiln Master's marker, the two Second Firing cards and the number of buried Fire cards are public.

Do not expose other players' secret information in realtime payloads, logs visible to clients, browser state, or database rows readable under client credentials.

## Tests that must exist

At minimum:

- **Setup**
  - setup for 2/3/4 players; reverse-order selection of all five Kilns
  - 2 Clay / 3 Wood / 3 Coins (no seat Coin, change 35); 1 Shifu + 3 Apprentices
  - secret deal of 2 Starting Orders from the 8-card Starting deck (a 4-player game deals all 8; otherwise the undealt ones go to the box), then the public reverse-order Kiln + face-up Main Order pick with a display refill after each take (change 32, R23)
  - 6-card Main display; 2 face-up Techs per discipline
- **Work Phase placement**
  - no passing; all four workers placed each round
  - absolute capacity at Materials Yard, Commission Market and Guild Hall (2/3/4) and Magistrate's Hall (1/1/2); Canal Wharf uncapped
  - the "at least 1 instance of the main action" legality rule at every location
- **Personal spaces:** once per round each; the second space starts covered; a Form & Decorate or Glazing & Loading Tech adds it, usable later the same round
- **Location effects:** Apprentice and Shifu effects at all seven locations
  - Materials Yard: Apprentice 4, Shifu 8 Clay/Wood in any split, no Coin option (Senior Apprentice too)
  - Form & Decorate: each vessel costs its Clay + 2 Coins whatever its Decoration; the Shifu −1 Coin when forming 2, Decorator's Kit and Ding as reductions; legality counts reductions (change 30)
  - Glaze & Load: Imperial modifier choice; 1 Wood per action that loads into the Shared Kiln, free for an action loading only into the Imperial Kiln (changes 34–35, R24); Kiln Master's marker at loading (R22); no Heat marker
  - Commission Market:
    - the Apprentice Selects 2 (a private look at the top 2), reserving exactly 1 from the display or those 2;
    - the Shifu (or Senior Apprentice) Selects 3, reserving 1 or 2 in any mix of the display and those 3;
    - unreserved looked cards are discarded face down to the Main Order discard pile (R25); which ones is private to the looker, the discard count public; the discard is shuffled into a new deck when the deck is empty and a card is needed;
    - no resource, no blind reservation;
    - deferred refill after the turn (once for two face-up reservations);
    - B1 looks: as many as remain, a reshuffle only at the start of a look, a 0-card look with a display choice
  - Guild Hall: private inspection, chosen bottom order, the Shifu taking 1 or 2 Techs from different disciplines (face-up or revealed) at printed cost, the end-of-turn display refill, placement legality (an affordable face-up Tech from a discipline you do not own)
  - Canal Wharf: Apprentice 2 Coins; Shifu 4 Coins and the top Main Order into the hand unseen (a reshuffle when the deck is empty, no card when both piles are empty, B1)
  - Magistrate's Hall: 4 Coins for either worker, Recognition 0–2 only, never to 4; the Shifu may reserve 1 face-up Crown Order (change 33, R21), refilled at the end of the turn
- **Shapes and Kilns**
  - Shape costs and non-limiting Vessel-card proxies
  - all five Kiln abilities:
    - Ru and Guan in the Order Phase;
    - Ge Crackle (change 29): 1 Fine or Standard ceramic from this firing (a Standard one becomes Fine), Saggars' Standard → Fine then Crackle on one ceramic allowed, wildcard Decoration, 1 VP per delivered Crackle ceramic;
    - Ding: 1 Clay + 1 Coin, outside discounts;
    - Jun: including during Second Firing per R7, after the chosen card
- **Advanced Techs**
  - all 18, including:
    - when-acquired Colour Samples: Select 3 (1 reservation, a looked card or a face-up Order refilled at the end of the turn; the unreserved looked cards discarded, R25);
    - the Colour Samples once-per-round swap: before or after a worker action; discard 1 held Order first (Main face down to the discard, Starting to the box), then Select 3 (a looked card or a face-up Order; the rest discarded, R25); B1 when the supply is short; either order with Imperial Priority; usable the round it is acquired;
    - Kiln Master (its +1/−1 marker placed face up at loading, R22), Inverted Firing stacks, Setter's Mark reservation;
    - Canal Barge: 2 Coins on the first Order completed each round, in the Order Phase only
  - the printed V1.6.2 costs (Senior Apprentice 3, Kiln Tending 3, Protective Saggars 3, Fuel Ledger 4), the 3-total / 1-per-discipline limit, the end-of-turn discipline refill and partial display
  - no VP for gaining a Tech (change 27, superseding amendment A1): the score ledger, the score preview, final scoring and events have no Tech line; Connoisseur's Cabinet still scores at game end
  - optional abilities (R4): declining keeps the once-per-round use (the Colour Samples swap, Saggars' Standard → Fine step, Second Firing); Canal Barge and Saggars' floor are automatic
- **Firing**
  - the Kiln Die every round (seeded, public)
  - Contribution eligibility from Shared Kiln ceramics only, including the zero-participant path
  - secret simultaneous Contribution reveal; Fuel Ledger (change 26): the owner's Bank and Stoke cost no Wood, and its Fuel Ledger Bank and Fuel Ledger Stoke cards cost 1 Wood each for −2/+2; the owner plays 1 of 5 cards, and a card not held is refused
  - Base Heat clamp 0–5
  - Test Pieces after Base Heat and before the Fire card (private peek, public bury)
  - no Heat-marker step (changes 28, 31); Kiln Master's marker in Actual Heat
  - Fire deck 1/3/4/3/1 and open discard; when the deck runs out, the shuffled discard goes on top and a buried Test Pieces card is drawn last (rev. 4 L636, R15), including a run-out caused by Second Firing
  - Actual Heat for Shared Kiln (zone or Kiln Furniture modifier + Kiln Master's marker) and court-fired Imperial Kiln ceramics
  - Quality assignment, including Protective Saggars: the owner's Shared and Imperial ceramics are never Flawed (Heat Difference 3+ counts as Standard)
  - after-Quality abilities in the owner's chosen order: Saggars (1 Standard → Fine once per round, no Wood, never Masterpiece), Second Firing (2 extra cards revealed, 1 chosen, both discarded), Ge
  - selling a Flawed ceramic for 2 Coins during its owner's turn (change 30, R20), not during another player's turn or the simultaneous Contribution choice; no firing-step salvage
  - skipping the firing when nothing is loaded
- **Orders**
  - all 8 Starting and 48 Main Orders at their V1.6.2 values (a content contract against Appendix A), including independent multi-ceramic matching, S07's Decoration alternative (Carved, Impressed or Painted; Plain refused) and Crackle wildcards
  - empty Main Order supply (B1)
  - round-start discard-2 / slide / reveal-2 rotation
  - single-pass Order Phase in First Player order, held Orders only; no Order is completed anywhere else
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
  - reconnect without changing player seat/state, including during the Setup Kiln + Main Order pick (the seat's own hand, its taken Main Order included), a Commission Market look, a Colour Samples swap look and a Second Firing choice
  - V1.6.1 rooms and saves, and V1.6.2 rooms from before owner revision 4 (schema 8, `r31-`, and earlier), refused by rules version and fingerprint (rules `1.6.2`, schema 9, `r32-`)

## Change discipline

If a desired implementation requires changing the board-game rules:

1. stop,
2. explain the conflict,
3. propose the smallest rule change,
4. wait for user approval before modifying the checked-in V1.6.2 source, its recorded rulings, or balance data.

Do not silently “improve” balance values.
