# IMPLEMENTATION_DECISIONS.md — V1.4

The [V1.4 Player Rulebook](./KILN_OPENING_v1.4_EN_SOURCE.md) governs mechanics. The [audit](./RULEBOOK_AUDIT_V1.4.md) records owner-approved corrections. This document describes their digital representation.

## Setup and production

- Each player starts with 2 Clay, 2 Wood, 4 Coins, 1 Shifu and 3 Apprentices. Resources have unlimited shared supplies. Stable ceramic instances represent physical Vessel cards; exhausted physical cards permit same-Shape proxies.
- Shared-Kiln allocations (High/Middle/Low) are 1/2/1, 2/2/2 and 3/2/3 at 2/3/4 players. The eighth space has stable ID `low_3`.
- Materials Yard, Potter's Wheel, Decoration Workshop, Commission Market and Craft Academy have 2/3/4 global worker spaces. Kiln Yard, Paid Work and Imperial Court are uncapped. Multiple Shifu may overfill a location. Internal location IDs remain stable across the label changes.
- A formed ceramic starts in `workshop`, Plain and without a Glaze. Optional Decoration changes it to Carved, Impressed or Painted without loading it. Decoration costs 2 Coins per ceramic; a Shifu may decorate one or two with one free Decoration.
- Every load chooses a Glaze and costs 1 Coin, including Rapid Drying and Imperial Priority. Payment and placement are atomic; an invalid multi-load changes nothing. Plain ceramics can skip Decoration.
- Tech use is optional unless explicitly required. Stated costs remain payable; waivers and selected income apply only at their printed timings. Ding's extra small ceramic belongs only to an Apprentice Potter's Wheel action. White Slip and Drying Frames decorate eligible newly formed Plain ceramics; neither is a Decoration Workshop action or triggers Rapid Drying.

## Orders and private Academy choices

- Players secretly receive one of eight Starting Orders and one Main Order. Both count toward the three-Order Cleanup hand limit.
- The six-card Main display is an ordered queue. Remove, slide left and append when reserving or completing a face-up Order. At the start of Rounds 2–5 discard the oldest two, retain the rest in order and refill. If both deck and discard are empty, draw only available cards and leave the display short. Every reservation must take a card.
- Shifu reservations resolve sequentially, including each chosen resource advance and display refill. Colour Samples inspection is private; untaken inspected Orders go to discard.
- A Craft Academy Shifu privately inspects up to two Techs of a discipline. The acquisition command explicitly supplies the bottom order of multiple untaken inspected Techs. The server validates the exact permutation; inspection, deck order and returned IDs remain private.
- Shape, Glaze and Decoration requirements on multi-ceramic Orders are independent unless expressly paired. Non-Plain requirements use Carved, Impressed and Painted alternatives.
- Each permanent Crackle ceramic may independently use one virtual Decoration consistently across all Decoration checks for that Order. This is unlimited across Orders and Crackle ceramics. It never changes the recorded Decoration or the Exhibition's attributes.
- Completion opportunities run in reverse Work order until a complete circuit without completion. The service can skip unchanged legal choices previously declined, but prompts again for newly available completable Orders. It never bypasses a new decision.

## Explicit firing windows

1. At the end of Work, offer Glaze Palette to change one owned loaded ceramic's Glaze. Then resolve private Test Pieces before Contributions. Skip Firing entirely when no ceramic is loaded.
2. Each eligible player secretly submits one Contribution card. Fuel Ledger adds the single cards `BANK_2` and `STOKE_2`, each costing 2 Wood; it is not a modifier attached to another card. Public state shows only submission status until all players submit. The server revalidates ownership and affordability for every contributor before atomic payment and reveal.
3. Base Heat starts at 2, applies Contributions and clamps to 0–5. Global and Actual Heat are not clamped.
4. A Kiln Yard Shifu marks exactly one ceramic loaded by that action, in either kiln. After Base Heat and before Fire, resolve each marked target in First Player order: choose +1, −1 or decline at no Wood cost. The marker affects only that ceramic and remains fixed through Second Firing. Kiln Furniture changes only its zone modifier to zero. Removed Shifu remain used until Cleanup.
5. The First Player confirms the initial Fire reveal as a pacing step. The server draws the card, calculates Global and Actual Heat, offers Jun, then assigns Quality.
6. Resolve after-Quality abilities in First Player order; each owner chooses their ability order. Second Firing affects only its selected Flawed or Standard ceramic, retains position/Furniture/Shifu marker, removes its earlier Jun adjustment, reveals the extra Fire card and calculates the new Actual Heat. Only then may unused Jun act, before new Quality is assigned. Jun can be used at most once per round. New Quality replaces old Quality even if worse. The extra card is discarded after its recalculation resolves.
7. Ge has a separate window after other after-Quality effects: upgrade one owned Standard ceramic to actual Fine and add permanent Crackle without replacing its Decoration. Protective Saggars can therefore create a Standard ceramic eligible for Ge.
8. Resolve the optional discard of one still-Flawed ceramic per player for 2 Coins, then finish the firing, clear markers/Furniture and return Contribution cards.

## Imperial Recognition and scoring

Recognition and every crossed milestone are server-authoritative. Imperial Priority is a separate once-per-game choice before or after a worker action, glazing and loading one Workshop ceramic into the empty Imperial Kiln for 1 Coin. It does not increase Kiln Yard's load allowance.

Ge records actual Fine Quality, so completion and Exhibition use recorded Quality normally. Exhibition accepts any number of Standard-or-better undelivered ceramics; its Shape and Glaze diversity bonuses check the entire exhibited collection independently. Every owned Advanced Tech scores 1 VP. Coin VP is capped at 5. Other printed values and tie breakers follow the source unchanged.

## Privacy, localization and compatibility

All undelivered ceramics and their recorded attributes are public. Hands, inspections, hidden deck order and unrevealed Contributions are private. Public projections redact them; authenticated private responses contain only the requesting seat's information. The same sanitized boundary applies to computer players. English and Simplified Chinese render identical stable IDs and never change game state.

V1.4 rooms use schema 5, behavior revision 22 and policy `rules-v1.4-strategic-001`. Older room rows and playtest reports are retained as history. Version/schema/fingerprint mismatches are rejected rather than reinterpreted. SQL migrations, both Edge Functions and the client must be rolled out together; checked-in migrations do not apply themselves.
