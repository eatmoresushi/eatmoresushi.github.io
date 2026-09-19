# V1.2.7 adoption audit

The owner requested adoption of both supplied V1.2.7 documents on 2026-09-19. This explicitly supersedes the V1.2.6 restrictions where V1.2.7 changes a rule, including Court Patronage. The source files below are unmodified copies; their draft headings do not supersede the owner's request to implement them.

- `KILN_OPENING_v1.2.7_EN_SOURCE.md` — SHA-256 `a0ec9271fba9be3583623d003683865aa649fdb39b288566c503da2b5c887253`
- `KILN_OPENING_v1.2.7_COMPONENT_TEXT_SOURCE.md` — SHA-256 `8679fb6c70e8763ff98abfc95866faefc29513ce04222c95d5ea79d8bf7d6db1`

## Owner amendment: Ge Kiln

On 2026-09-19, the owner explicitly replaced Ge's ability with the following text. This amendment supersedes Ge's firing-Quality rule and component copy in the two unchanged supplied sources.

<!-- GE_OWNER_ABILITY_START -->
When completing **Orders** or scoring the **Exhibition**, treat your **Standard-quality Crackle ceramics** as **Fine**.

**Once per round:** When completing an Order, you may treat **1 of your Crackle ceramics used** as having **any one Decoration** for all that Order’s Decoration requirements. Its actual Decoration stays Crackle.
<!-- GE_OWNER_ABILITY_END -->

The owner subsequently specified this shorter reminder. The full ability above retains the actual-Decoration clarification; this display-only edit does not change the rule or fingerprint.

<!-- GE_OWNER_SHORT_START -->
When completing **Orders** or scoring the **Exhibition**, treat your **Standard-quality Crackle ceramics** as **Fine**.

**Once per round:** When completing an Order, you may treat **1 of your Crackle ceramics used** as having **any one Decoration** for all that Order’s Decoration requirements.
<!-- GE_OWNER_SHORT_END -->

Ge does not change recorded firing Quality. A Standard Crackle ceramic remains Standard, including for Second Firing eligibility, and is evaluated as Fine only for its owner's Order completion and Exhibition scoring. The quality treatment also applies when its Decoration is virtually substituted for an Order; its actual Decoration remains Crackle. Fine and Masterpiece ceramics keep their Quality; Flawed ceramics do not become eligible.

## Complete change inventory

- Setup deals one Starting Order and one Main Order secretly to each player before reshuffling the remaining Main deck and revealing six. Undealt Starting Orders return to the box. There is no deal-four/keep-two choice.
- Main display is six cards; sequential removals shift left/refill right. Rounds 2–5 discard two, retain four, append two. A depleted Main deck reshuffles its discard only when another card is needed.
- Hand contents remain secret; counts are public. Completed Orders are revealed. Public snapshots, reservation events, cleanup events, pending decision metadata and computer observations must not reveal another player's held Orders. Seat-authenticated responses carry the owner's hand separately.
- Work has no passing. Every player places all four workers in every round.
- Court Patronage is an eighth, uncapped action: pay 4 Coins, advance Recognition one step only from 0/1/2, resolve the reached milestone. Both worker kinds have the same effect; repeated placements are allowed.
- Ge treats its Standard-quality Crackle ceramics as Fine when completing Orders or scoring the Exhibition, under the owner amendment above. Once per round it may substitute one consistent Decoration for one Crackle ceramic for all requirements of a completed Order; actual Quality and Decoration are unchanged.
- Kiln Tending gains both 1 Clay and 1 Wood. Large Throwing Wheel reduces the worker action's total Clay by 2, minimum zero, stacking with the Shifu discount; Ding's extra vessel still pays separately.
- Glaze Palette changes only a ceramic immediately before loading through Kiln Yard, Rapid Drying or Imperial Priority. Colour Samples adds an immediate, separate reservation when acquired, without a Commission resource reward and without exhausting its round use.
- S14: 3 VP. S16: 2 VP / 3 Coins. O11–O13: Masterpiece required / 9 VP. O30: 12 VP. O32: 13 VP. O36: 14 VP. All 64 rows were compared; other attributes and rewards are unchanged.
- Exhibition accepts any number of Standard-or-better undelivered ceramics. Each diversity bonus checks the entire Exhibition independently; no featured subset is selected.
- Clay, Wood and Coins are unlimited. Physical component counts do not cap gains. Finite bank counters and empty-bank UI states are removed; playtest fields and persistence also accept resource totals above the physical component counts. Player costs and the 5-VP end-game Coin scoring cap still apply.

## Source editorial interpretation

The full rulebook places “This reduction stacks with the Shifu’s two-vessel discount.” at the beginning of Measuring Calipers' row, immediately before “Once per round” without a space. The supplied component draft and the Tech Clarifications explicitly assign that sentence to Large Throwing Wheel. Structured full text places it there; the original source is preserved unchanged. This is a layout correction, not a balance change.

No V1.2.7 Chinese source was supplied. Existing Chinese terminology comes from the archived V1.2.6 Chinese source; changed ability/UI text is translated from V1.2.7 and is not represented as owner-supplied Chinese source text.

## Additional conformance repairs

Prepared Clay's forming can trigger Measuring Calipers/Standardised Moulds because those require forming, not a Potter's Wheel action. Decoration waivers apply to Drying Frames. Kiln Furniture is available on Rapid Drying loads into High/Low. A Guild display refills after unused inspected tiles return. Mandatory forming-Tech income is available to pay immediate White Slip/Drying Frames Decoration costs. These follow the unchanged full rules and are covered by regression tests.

## Compatibility

All players' undelivered ceramics and their attributes remain public, including pieces in Imperial Kilns. This is independent of held Order privacy and is covered by multiplayer reconnect and workshop-inspection regressions.

New games use rules version 1.2.7, schema 4 and behaviour revision 17. The Ge owner amendment advances the behaviour revision because firing retains actual Quality. Older fingerprints and existing 1.2.6 games are refused rather than reinterpreted. New SQL migrations preserve historical rows and install current version gates. Database migration and Edge Function deployment are required before this branch can run against production.


## Verification

- 399 Vitest tests, including legal five-round games for 2, 3 and 4 computer players, source/data contracts for all 64 Orders, all 19 supplied English Tech reminders, four supplied Kiln reminders and the owner's Ge amendment, seat-authenticated hand privacy/reconnect tests, public undelivered ceramic attributes, and unlimited resource gains, snapshots and playtest reporting.
- Ge regressions cover actual firing Quality, Second Firing eligibility, Protective Saggars, passive Fine requirements after the active ability is exhausted, combined Quality/Decoration treatment, Exhibition VP, English/Chinese action labels, computer decisions, and rejection of the superseded V1.2.7 fingerprint.
- Production build, strict client/engine TypeScript and Edge Function TypeScript checks pass.
- `python3 tools/validate_handoff.py` passes against V1.2.7 data and source.
- Original V1.2.7 browser smoke test (before the Ge amendment): revised setup, both Ge reminder effects, six-card market (O12 reservation shifted O42 left and appended O09), Court Patronage payment/milestone, opponent held-Order privacy, own-hand restoration after reconnect, English/Chinese rendering, and clean reload. Moved the Fire display above the action ring to avoid overlapping Court Patronage.
- SQL version/fingerprint contracts are tested; migrations have not been executed against a database. No Supabase/PostgreSQL runtime was available locally. Nothing has been deployed.
