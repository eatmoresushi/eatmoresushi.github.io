# V1.2.7 adoption audit

The owner requested adoption of both supplied V1.2.7 documents on 2026-09-19. This explicitly supersedes the V1.2.6 restrictions where V1.2.7 changes a rule, including Court Patronage. Their draft headings do not supersede the owner's request to implement them. The checked-in English rulebook now incorporates the owner's 2026-09-20 Starting Order, Tech and Shifu Glaze amendments below; the original component-text source remains an unmodified copy.

- Original supplied `KILN_OPENING_v1.2.7_EN_SOURCE.md` — SHA-256 `a0ec9271fba9be3583623d003683865aa649fdb39b288566c503da2b5c887253`. Supplied as `KILN OPENING 开窑 v1.2.7 — Player Rulebook.md` on 2026-09-19; the external original is not modified.
- Current checked-in `KILN_OPENING_v1.2.7_EN_SOURCE.md`, incorporating the eight-card Starting Order, optional-Tech and Shifu Glaze amendments — SHA-256 `a6a137d2d5216eb6848d145e2ceee6368c4e1aa7f3bbfd3597fd27007d603d4b`.
- `KILN_OPENING_v1.2.7_COMPONENT_TEXT_SOURCE.md` — SHA-256 `8679fb6c70e8763ff98abfc95866faefc29513ce04222c95d5ea79d8bf7d6db1`

- `KILN_OPENING_v1.2.7_TECH_SHORT_TEXT_SOURCE.md` — SHA-256 `40e55a475b535316dd5f78ab48b3c4e6057393474a41993351de78fe0af0a72b`

- `KILN_OPENING_v1.2.7_TECH_DETAIL_TEXT_SOURCE.md` — SHA-256 `1534701f5701b5caf2a45c65857d16dd9bdf7fdb78858515a6415c76e6c9f291`

## Owner amendment: eight Starting Orders

On 2026-09-20, the owner explicitly replaced the Starting Order deck with the following eight cards and requested that every current ruleset reference use the eight-card deck. This amendment updates the checked-in rulebook's component count, Setup, Order overview and Appendix A. There are now **56 Orders: 8 Starting + 48 Main**.

| ID | Requirements | Quality | VP | Coins |
|:--:|-------------|---------|:--:|:-----:|
| S01 | Bowl · any Glaze · any Decoration | Standard+ | 2 | 4 |
| S02 | Plate · any Glaze · any Decoration | Standard+ | 2 | 4 |
| S03 | Brush Washer · any Glaze · any Decoration | Standard+ | 2 | 4 |
| S04 | any Shape · White · any Decoration | Standard+ | 3 | 4 |
| S05 | any Shape · Celadon · any Decoration | Standard+ | 3 | 4 |
| S06 | any Shape · Grey-Green · any Decoration | Standard+ | 3 | 4 |
| S07 | any Shape · Moon White · any Decoration | Standard+ | 4 | 4 |
| S08 | Vase or Censer · any Glaze · any Decoration | Standard+ | 3 | 4 |

Each Starting Order requires one ceramic and awards no Crowns. Setup still deals one Starting Order and one Main Order secretly to each player, then returns all undealt Starting Orders to the box. The Main deck, rewards, six-card display and hand limit are unchanged. S04–S08 now identify the new definitions above; removed S09–S16 must not appear in new games. Archived older sources and experiments retain their historical decks and do not govern current play.

## Owner amendment: Tech text and optional benefits

On 2026-09-20, the owner supplied new reminders for all four Starting Techs and fifteen Advanced Techs, and a separate detailed appendix for clicked tiles. The short-text source is transcribed from that message; the detail-text source is a byte-identical copy of the pasted attachment. Tech faces and hover previews use the new reminders without acquisition/timing header duplicates or empty lines; the existing Once / round footer remains. Clicked Techs show their full effect, applicable clarifications, and the optional-use/cost rule.

The owner confirmed **Kiln Tending grants 1 Clay or 1 Wood**, superseding the pasted detail's both-resource wording. After loading at least one ceramic in a Kiln Yard action, the player chooses Clay, Wood or no use. All Tech abilities are optional unless explicitly required, and all stated costs must be paid. This includes declining Large Throwing Wheel's discount or Measuring Calipers/Standardised Moulds' income to preserve their use for later. Only opted-in income can fund immediate White Slip/Drying Frames costs. Colour Samples' immediate acquisition selection remains required; its once-per-round Commission Market effect is optional and separate.

The current rulebook incorporates the optional-use rule and corrected Kiln Tending effect. The original component draft and pasted detail attachment remain unchanged as provenance, with this amendment taking priority over their conflicting text. The existing editorial correction assigning the Shifu discount sentence to Large Throwing Wheel also applies to the pasted details. Chinese copy uses established terminology and translates the amended effects.

## Owner amendment: Ge Kiln

On 2026-09-19, the owner explicitly replaced Ge's ability with the following text. This amendment supersedes Ge's firing-Quality rule and component copy in the two supplied sources; their Ge wording has not been edited.

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

- The Starting deck contains eight cards, S01–S08, under the owner amendment above. Setup deals one Starting Order and one Main Order secretly to each player before reshuffling the remaining Main deck and revealing six. Undealt Starting Orders return to the box. There is no deal-four/keep-two choice.
- Main display is six cards; sequential removals shift left/refill right. Rounds 2–5 discard two, retain four, append two. A depleted Main deck reshuffles its discard only when another card is needed.
- Hand contents remain secret; counts are public. Completed Orders are revealed. Public snapshots, reservation events, cleanup events, pending decision metadata and computer observations must not reveal another player's held Orders. Seat-authenticated responses carry the owner's hand separately.
- Work has no passing. Every player places all four workers in every round.
- Court Patronage is an eighth, uncapped action: pay 4 Coins, advance Recognition one step only from 0/1/2, resolve the reached milestone. Both worker kinds have the same effect; repeated placements are allowed.
- Ge treats its Standard-quality Crackle ceramics as Fine when completing Orders or scoring the Exhibition, under the owner amendment above. Once per round it may substitute one consistent Decoration for one Crackle ceramic for all requirements of a completed Order; actual Quality and Decoration are unchanged.
- Kiln Tending optionally gains 1 Clay or 1 Wood under the owner amendment above. Large Throwing Wheel reduces the worker action's total Clay by 2, minimum zero, stacking with the Shifu discount; Ding's extra vessel still pays separately.
- Glaze Palette changes only a ceramic immediately before loading through Kiln Yard, Rapid Drying or Imperial Priority. Colour Samples adds an immediate, separate reservation when acquired, without a Commission resource reward and without exhausting its round use.
- The current Order set is the eight Starting Orders above and 48 Main Orders. V1.2.7's Main Order changes remain: O11–O13 require Masterpiece / award 9 VP; O30 awards 12 VP; O32 requires Fine+ each with at least 1 Masterpiece and awards 13 VP; O36 awards 14 VP. Other Main Order attributes and rewards are unchanged.
- Exhibition accepts any number of Standard-or-better undelivered ceramics. Each diversity bonus checks the entire Exhibition independently; no featured subset is selected.
- Clay, Wood and Coins are unlimited. Physical component counts do not cap gains. Finite bank counters and empty-bank UI states are removed; playtest fields and persistence also accept resource totals above the physical component counts. Player costs and the 5-VP end-game Coin scoring cap still apply.

## Source editorial interpretation

The full rulebook places “This reduction stacks with the Shifu’s two-vessel discount.” at the beginning of Measuring Calipers' row, immediately before “Once per round” without a space. The supplied component draft and the Tech Clarifications explicitly assign that sentence to Large Throwing Wheel. Structured full text places it there; the misplaced sentence is preserved in the source as provenance. This is a layout correction, not a balance change.

No V1.2.7 Chinese source was supplied. Existing Chinese terminology comes from the archived V1.2.6 Chinese source; changed ability/UI text is translated from V1.2.7 and is not represented as owner-supplied Chinese source text.

## Additional conformance repairs

Prepared Clay's forming can trigger Measuring Calipers/Standardised Moulds because those require forming, not a Potter's Wheel action. Decoration waivers apply to Drying Frames. Kiln Furniture is available on Rapid Drying loads into High/Low. A Guild display refills after unused inspected tiles return. Opted-in forming-Tech income is available to pay immediate White Slip/Drying Frames Decoration costs; declined benefits cannot fund them. These follow the full rules and optional-Tech owner amendment and are covered by regression tests.

## Compatibility

All players' undelivered ceramics and their attributes remain public, including pieces in Imperial Kilns. This is independent of held Order privacy and is covered by multiplayer reconnect and workshop-inspection regressions.

New games use rules version 1.2.7, schema 4 and behaviour revision 20. The Ge owner amendment advanced the behaviour revision to 17 because firing retains actual Quality; the eight-card Starting Order amendment advances it to 18 because S04–S08 change meaning and S09–S16 are removed. The optional-Tech amendment advances it to 19 for explicit forming-income choices and the single-resource Kiln Tending benefit. The Shifu Glaze amendment advances it to 20 because only a two-vessel action reduces the total Coin cost by 1, replacing the free Decoration. Older fingerprints and existing 1.2.6 games are refused rather than reinterpreted. New SQL migrations preserve historical rows and install current version gates. Database migration and Edge Function deployment are required before this branch can run against production.


## Original adoption verification (2026-09-19)

- 399 Vitest tests, including legal five-round games for 2, 3 and 4 computer players, source/data contracts for the then-current Order deck, all 19 supplied English Tech reminders, four supplied Kiln reminders and the owner's Ge amendment, seat-authenticated hand privacy/reconnect tests, public undelivered ceramic attributes, and unlimited resource gains, snapshots and playtest reporting. This is the original adoption record; the Starting Order amendment above supersedes that deck.
- Ge regressions cover actual firing Quality, Second Firing eligibility, Protective Saggars, passive Fine requirements after the active ability is exhausted, combined Quality/Decoration treatment, Exhibition VP, English/Chinese action labels, computer decisions, and rejection of the superseded V1.2.7 fingerprint.
- Production build, strict client/engine TypeScript and Edge Function TypeScript checks pass.
- `python3 tools/validate_handoff.py` passes against V1.2.7 data and source.
- Original V1.2.7 browser smoke test (before the Ge amendment): revised setup, both Ge reminder effects, six-card market (O12 reservation shifted O42 left and appended O09), Court Patronage payment/milestone, opponent held-Order privacy, own-hand restoration after reconnect, English/Chinese rendering, and clean reload. Moved the Fire display above the action ring to avoid overlapping Court Patronage.
- SQL version/fingerprint contracts are tested; migrations have not been executed against a database. No Supabase/PostgreSQL runtime was available locally. Nothing has been deployed.

## Eight-card Starting Order verification (2026-09-20)

- All 454 tests pass, including the exact eight-card requirements and rewards, every Shape/Glaze/Decoration/Quality combination, setup and legal five-round games for 2/3/4 players, and private opening hands.
- All 56 current Order rows match the amended rulebook; the 48 Main Orders are unchanged. The current rulebook checksum and original source provenance are verified separately.
- Production build, strict client/engine and Edge Function TypeScript, handoff validation, and diff checks pass. The local browser preview loads the revised deck and displays the owner's private opening hand.
- Revision 18 rejects earlier fingerprints before loading saved games. The new SQL migration preserves historical rows and advances active RPC gates; its contract is tested, but the migration has not been applied to a database and nothing has been deployed.

## Tech wording and optional-use verification (2026-09-20)

- All 495 tests pass, including 36 focused engine cases for opt-in forming rewards, declining and later use, selected-income affordability, illegal claims and Kiln Tending's Clay/Wood/skip choices, plus three new action-panel cases. Full five-round computer games for 2/3/4 players pass.
- All 19 English reminders match the new owner short-text source; existing Kiln reminder and full source/data contracts pass. The pasted detail attachment is preserved byte-for-byte and its applicable clarifications appear in clicked Tech panels.
- Production build, strict client/engine and Edge Function TypeScript, handoff validation and diff checks pass. Browser inspection verified the revised short faces, retained frequency footers, and full Starting/Advanced Tech details with clarifications and the optional-use/cost note. The detail grid aligns content at the top to avoid stretched gaps.
- Revision 19 rejects revision 18 games. The new SQL migration retains historical r17/r18/r19 rows and advances all four active RPC gates to r19. SQL contracts pass; migrations have not been applied and nothing has been deployed.

## Kiln reminder wording update (2026-09-20)

- The owner supplied single-paragraph reminders for all five Kilns, applied to hover previews and Your workshop. Ding’s action-limit/discount and Tech-targeting clarifications remain in the full clicked rules; Ge subsequently adopts the owner-approved concise wording below. No game mechanics or fingerprint changed.
- Current source: `KILN_OPENING_v1.2.7_KILN_SHORT_TEXT_SOURCE.md` — SHA-256 `98f148cc5e47980600ce482a21f22af59d6b2c168ee47cee1ab1649bd96b0570`. This supersedes the component draft and earlier short-copy formatting above for display purposes.
- All 57 focused copy, workshop, eligibility and UI-label tests pass. The five English reminders match the source exactly and both languages retain separate compact and full descriptions.

### Approved concise Ge reminder

The owner approved the following shorter reminder for hover and Your workshop. The two effects are separated by one line break, with no empty line. Full clicked rules retain their existing clarifications.

For Orders and Exhibition scoring, your Standard Crackle ceramics count as Fine.
Once per round, 1 of your Crackle ceramics used for an Order may count as any one Decoration for all that Order’s requirements.

## Final pre-commit verification (2026-09-20)

All 495 tests, the production build, Edge Function type checks, handoff validation and diff checks pass with the final Ge reminder and Once per round footer. The approved Ge reminder is 35 words (208 characters), down from 41 words (266 characters), and the local browser shows both effects without clipping in the hover card and workshop header. Backend migrations remain unapplied.

## Pre-merge Order reconciliation (2026-09-20)

- Compared all 56 rows in the owner's newly pasted Order table (SHA-256 `56dd3db06dc523125a33a1aec8123998eefeac745bdb57980e247ce17c5275d4`) with the current English rulebook and structured Order data. The pasted rows already match the rulebook exactly after Markdown and whitespace normalization.
- Repaired one gameplay-data omission: O32 lacked its additional requirement of at least 1 Masterpiece. It now requires a White Vase and White Bowl with different Decorations, Fine+ each and at least 1 Masterpiece, for 13 VP and 5 Coins. Earlier row checks covered the minimum Quality but missed this additional constraint; the contract now verifies every Order's additional Quality requirements too.
- Card faces, hover previews, clicked details and accessible descriptions now show the additional Masterpiece requirement for O32, O33, O34, O40, O41, O42, O47 and O48. O47 requires at least 2; the other seven require at least 1. Both languages derive these badges from the same gameplay relations. The inspector also explains independent attribute matching correctly.
- Confirmed Kiln Tending grants an optional choice of 1 Clay or 1 Wood after loading at least 1 ceramic during a Kiln Yard action. Short and detailed descriptions, the action choices and the engine agree; claiming both is rejected, and declining grants neither.
- All 537 tests pass, including eight new O32 completion cases and 34 card/hover/detail Quality cases, alongside the full source/data contract and existing Kiln Tending Clay/Wood/skip/invalid-claim coverage. Production build, Edge Function type checks, handoff validation and diff checks pass. Local browser inspection confirms O32's badge fits on the market card, hover preview and clicked details.
- The Order-data correction changes the content-derived rules fingerprint automatically; schema 4 and behaviour revision 19 are unchanged. Migrations remain unapplied and nothing has been deployed.


## Owner amendment: Shifu Glaze & Decoration (2026-09-20)

The owner replaced the Shifu effect with this final wording, including the two-vessel condition:

> Apply Glaze and Decoration to up to **2 shaped vessels**, if you glazed 2, reduce their total Coin cost by 1.

Glazing one vessel pays its normal Decoration cost. Glazing two reduces their combined Coin cost by 1 after any selected Tech waivers, with a minimum cost of zero. Each Decoration-waiver Tech still affects only one matching Decoration, remains optional, and is exhausted only when used. There is no longer a free-Decoration target to select.

The checked-in English rulebook, quick reference, structured action text, Chinese translation, engine, human cost previews and computer decisions use this amendment. Behaviour revision 20 and `202609200003_v127_shifu_glaze_discount.sql` distinguish new games from games with the old free-Decoration rule. This migration preserves historical rows and advances the active write gates; it has not been applied to a database.

Verification: all 567 tests pass, including 15 dedicated payment/waiver cases, eight new AI cases, five new UI cases, earlier-fingerprint rejection and the new SQL gate contract. The production build, client/engine and Edge Function type checks, handoff validation and diff checks pass. Browser checks confirm one Carved vessel costs 2 Coins, two Carved vessels cost 3 Coins, and removing the second vessel restores the full single-vessel cost. No backend migration or deployment was performed.
