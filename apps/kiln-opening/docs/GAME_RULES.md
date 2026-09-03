# GAME_RULES.md — V1.2.4 source index

The sole gameplay source of truth is [KILN_OPENING_v1.2.4_SOURCE.md](./KILN_OPENING_v1.2.4_SOURCE.md), the owner-supplied V1.2.4 rulebook.

- Original supplied title: `KILN OPENING 开窑 v1.2.4.md`
- Original supplied SHA-256: `95ecf7625ab93c5ca98c32a6db61e02f071036e4c48921afda471f919a112dd9`
- Rules version: **V1.2.4**
- Languages: English rules with English / Simplified Chinese player-facing terminology

This file is an index, not an independent transcription. If prose here, structured data, tests, UI text, historical documents, experiments, saved games or visual assets disagree with the checked-in source, the checked-in source wins.

## Recorded source rulings

The source review is recorded in [RULEBOOK_AUDIT_V1.2.4.md](./RULEBOOK_AUDIT_V1.2.4.md). **V1.2.4 required no owner ruling**: it resolves, in its own text, every internal contradiction the V1.2.2 audit had to settle. The audit now records only two presentational deviations mandated by the owner's terminology brief -- an Order's printed requirements are headed **Requirements** rather than "Commission", and the Clay/Wood/Coin from reserving is a **reservation advance** -- plus notes where the source is deliberately terse.

Rules V1.2.4 changed from V1.2.2, all enforced by the engine:

- **Guan:** 2 Coins **and 1 VP** on a Crown Order, and **no Decoration waiver** -- every submitted ceramic faces every printed requirement.
- **Ding:** the additional matching vessel costs **no Clay**.
- **Guild & Academy Shifu:** inspect the **top 2 Techs of one discipline**, then buy either an inspected tile or any face-up tile at −1 Coin.
- **Kiln Yard Shifu:** reposition at the **end of the Work Phase**, before any Firing Phase ability, in First Player order.
- **Commission Market:** each reservation may take a face-up Order **or the top of the deck unseen**.
- **Colour Samples / Test Pieces:** both **once per round**; Colour Samples **discards** what it did not reserve.
- **Measuring Calipers / Standardised Moulds:** 2 Coins each.
- **Exhibition:** diversity bonuses are **+3 VP** each. **S16** pays 4 Coins. There are **50 Vessel cards**, ten per Shape.

Recognition 3 is titled **Imperial Gift** and grants the Imperial Kiln tile. Recognition 4 is titled **Imperial Priority**.

## Machine-readable implementation

`data/*.json` and `src/game/*` are derived implementations of V1.2.4. They do not outrank the source and recorded rulings. New rooms and saves must carry the current rules version and fingerprint; older saves must be rejected rather than translated silently.
