# V1.6.1 rulebook audit and owner rulings

Branch: `kiln-opening-next-version`, created from `b4ae59e` (master, V1.4).

## Authority and provenance

On 2026-10-14 the owner designated the V1.6.1 Player Rulebook (Draft) as the
**only source of truth** for the online game. It supersedes V1.4, its
amendments, and the V1.6 draft supplied earlier the same day. V1.6.1 is a
rework of V1.2.7. The rulebook and its file name say "v1.6.1" (the title read "v1.61" until the
owner's 2026-10-16 edits); the engine uses the rules version string `1.6.1`.

- Original: `/Users/luyuan/Documents/kiln board game/v1.6/KILN OPENING 开窑 v1.6.1 — Player Rulebook (Draft).md`
- Checked-in copy (byte-identical to the original): [KILN_OPENING_v1.6.1_EN_SOURCE.md](./KILN_OPENING_v1.6.1_EN_SOURCE.md). Owner amendments A1 and A2 are applied in place in both files, as the owner asked that rules updates also update the original. The owner's own wording edits of 2026-10-16 ([below](#owner-wording-edits-2026-10-16)) were copied in unchanged.
- SHA-256: `1e9dfc81a70de67b48770b445b584a616e8fb060eb6b554fbbd77cdf3a881f5f`
- SHA-256 after the owner's first 2026-10-16 edits: `49bd80ced9cc194938e4b8bbd422a1c9e02439facfb477f6325a42f31c2d1372`
- SHA-256 after A1 and A2, before the owner's 2026-10-16 edits: `4c9923871218a12a5653cbc34cfa0817b0ab673030e11af27f7c0d7468406a7a`
- SHA-256 as supplied on 2026-10-14, before A1 and A2: `ce106f76d034291a942e6b9e9bb5a823f5e9af12cec3800c451c98b840457835`
- History: [V1.6 draft](./KILN_OPENING_v1.6_EN_SOURCE.md) (`8529c0ce…`) and its [review](./RULEBOOK_AUDIT_V1.6.md). These are records only, not rules.

V1.6.1 resolves these V1.6 questions in its own text:

- Painted replaces Crackle as the fourth Decoration (change 19);
- Ge is rebuilt (change 10, lines 466–470);
- locations are renamed (change 1);
- Ding is one of the five Kiln Player Boards (line 73).

## Owner amendments

Amendments change V1.6.1 text after it became the authority. At the owner's request (2026-10-15) each amendment is applied in place to both the checked-in source and the owner's original file, so the two stay byte-identical. A1 and A2 replaced text within lines; line numbers below are those of the current source, after the owner's 2026-10-16 edits.

| ID | Date | Amendment | Overrides |
| --- | --- | --- | --- |
| A1 | 2026-10-15 | **Tech VP on purchase.** Each Advanced Tech scores its 1 VP immediately when the player gains it, recorded like other in-game VP. It is no longer added at game end. This is bookkeeping only: no V1.6.1 effect removes a Tech, so final totals and tie-breakers are unchanged. Mid-game scores now include Tech VP. Applied in the source at lines 379, 492, 609 and 755. The owner's 2026-10-16 edits also list it as change 20 (line 30) fold the former "nothing more for Advanced Techs" scoring step into the first scoring item (line 492), and repeat it at the Guild Hall (lines 214 and 715). | Lines 379, 492, 609, 755 ("1 VP at game end" / "1 VP for each Advanced Tech you own" in final scoring) |
| A2 | 2026-10-15 | **Discipline name.** The "Workshop" Advanced Tech discipline is renamed **"Form & Decorate"**, matching the personal location whose second space it adds (owner decision D11). Applied in the source at lines 15, 51, 83, 103, 212, 374, 376, 609, 611 and 720. "Workshop Development" (line 362), "Local Workshop" (line 431) and the ordinary word "workshop" are unchanged. Wording only: no rule changes, and the internal ID stays `workshop`. | Lines 15, 51, 83, 103, 212, 374, 376, 609, 611, 720 |

## Owner wording edits (2026-10-16)

The owner revised the wording of their own files on 2026-10-16. None of the edits changes a rule. The checked-in copies were replaced with the owner's files, byte for byte.

English rulebook:

- The title and the version note say "v1.6.1" instead of "v1.61" (lines 1 and 9).
- Change 20 (line 30) records amendment A1 in the list of changes.
- The Shifu row of Form & Decorate (line 170) has its bold markup corrected.
- Final scoring (lines 492–494) lists three items: VP recorded during play (including each Tech's 1 VP, scored when gained), the end-game Exhibition, and Coins. The former separate item 2, "nothing more for Advanced Techs", was folded into item 1. Final totals are unchanged.

The new line 30 and the removed scoring line move old lines 30–491 down by one. Lines 1–29 and 493 onward keep their numbers. Every line citation in the repository was renumbered by this map: rulings, interpretations, clarification source tags, data, engine comments, tests and design documents. The citations in `src/app` and the UI tests are renumbered when the UI phase B work lands.

A second round of edits later the same day also changes no rule and keeps every line number:

- **Lock tokens become Cover tokens.** The English says a Tech "removes the Cover token" from a second personal space instead of "unlocking" it (lines 11, 15, 50–51, 73, 89, 107–108, 144, 155–156, 212, 366, 376, 609, 707 and 720). The printed rulebook now matches owner decision D7 too. The Chinese already used 第二工位盖片.
- **Tech VP at the Guild Hall.** "A newly acquired Advanced Tech **scores 1 VP immediately**" (line 214), and the Appendix E Apprentice cell adds "score 1 VP" (line 715). These restate amendment A1. The Chinese matches at lines 216 and 717.

Chinese edition (`docs/KILN_OPENING_v1.6.1_ZH.md`, SHA-256 `907d9aa1dbdb5c49414633cf301c5eddbfd8b32b4e55bc2a7c7af3727e72b755`; after the first 2026-10-16 edits `212cd84bc71e0bfe8d13d71dc2d5c0f13db745e11e9f9cf6604a3d0560c754e2`; before them `5d06268e93517896199088fc61a09203d3fe24b2859fb4b79785dc51f1b0e2a1`):

- The prose moves to a plainer register: 把, 在, 要, 不能, 才可以, 空着 and 装进 replace 将, 于, 须, 不得, 方可, 空置 and 装入.
- Several summaries now follow the English more closely:
  - the round table (lines 120–124);
  - the Imperial Kiln reward (line 435), which, like the English line 433, does not repeat the Heat marker;
  - the three-item scoring list (lines 494–496).
- It adds change 20.
- Terms: 施釉入窑 becomes 施釉装窑, 火标步骤 becomes 翻火标步骤, and 折扣 becomes 减免. The Work Phase rule reads 派工阶段不能跳过.

The glossary records these conventions. Data `abilityZh`, the location texts and the clarifications follow them.

Component text: the owner reworded 18 Chinese reminders. The English is unchanged. See the component text's review notes.

## Owner rulings (approved 2026-10-14)

The owner approved the recommendations made in the V1.6 review. They apply
unchanged to V1.6.1 and are binding clarifications, not balance changes. Line
numbers refer to the V1.6.1 source.

| ID | Ruling | Lines |
| --- | --- | --- |
| R1 | **Ding is selectable.** Five Kilns (Ru, Guan, Ge, Ding, Jun) are chosen in reverse turn order for 2–4 players. The 2026-10-02 Ding exclusion is withdrawn. Ding's ability works with either worker type. | 73, 108, 472–474 |
| R2 | **Printed values are final.** No V1.4-era amendment is reapplied: 2026-09-27 setup and O01–O03 values, 2026-09-28 Imperial Court cost and Ge virtual Glaze, 2026-09-30 economy. | 101, 223–233, 515–605 |
| R3 | S14 (3 VP / 3 Coins) and S16 (2 VP / 3 Coins) stand as printed. | 538, 540 |
| R4 | **Tech and Kiln Tradition abilities are optional** unless stated mandatory. Declining does not use a once-per-round allowance. Pay all costs in full and apply valid discounts before payment. Colour Samples' when-acquired reservation is mandatory whenever at least 1 Main Order can be looked at. | 142, 460–478, 613–642 |
| R5 | **Glaze & Load legality:** a placement is legal if at least 1 of your Shaped vessels has a legal destination. Legal destinations are: (a) an empty active Shared Kiln space not marked by another player's Setter's Mark; (b) your own empty Imperial Kiln; (c) for a Bowl, Plate or Brush Washer with Inverted Firing unused this round, an active space holding exactly 1 of your ceramics. | 65, 182–184, 629–630 |
| R6 | **Canal Barge** completes an Order for every completion effect, including Ru, Guan, Tribute Ware and Crackle wildcards. | 485, 631, 642, 646 |
| R7 | **Jun and Second Firing:** Jun is once per round. If already used it cannot be used again. If unused, it may be used on the Second Firing ceramic after the extra Fire card is revealed and Actual Heat recalculated, before the new Quality is assigned. | 478, 640, 679 |
| R8 | **Inverted Firing:** the newly loaded ceramic must be a Bowl, Plate or Brush Washer. It may join any active space holding exactly 1 of your ceramics, including one loaded earlier by the same action. Both ceramics use the space's printed modifier, or the Kiln Furniture modifier if Kiln Furniture is in that space. | 628–629 |
| R9 | **Glaze & Load Shifu Heat marker:** placing it is optional. It may go on any of your ceramics in the Shared Kiln or your Imperial Kiln that has no marker, including one loaded earlier this round or by Imperial Priority. | 180, 267 |
| R10 | **Imperial Priority** is free. Loading through it chooses the −1 / 0 / +1 Imperial modifier like any Imperial load. | 58, 289, 293 |
| R11 | The **Imperial modifier is public** when chosen. It is recorded on the ceramic. | 57, 289, 508 |
| R12 | **Senior Apprentice** resolves the whole Shifu effect, including the Materials Yard 1-Coin +1 Clay +1 Wood option and, at the Commission Market, 2 reservations with the top-3 selection. It never applies at the Magistrate's Hall. | 163, 619, 653 |
| R13 | **Tribute Ware's** bonus Crown advances Recognition (or scores past 4). It is not a printed Crown: it does not trigger Guan's "showing a Crown" and does not count for tie-breaker 2. | 464, 498, 642 |
| B1 | **Empty Main Order supply:** if the deck and discard are both empty, draw or inspect only the cards available and leave display positions empty. Every reservation must take an available Order; a blind reservation needs a card in the deck after any reshuffle. Top-3 looks see as many cards as remain; the discard is reshuffled only when the deck is empty, never to complete a look. The round-start rotation discards up to 2 and slides the rest. | 128–130, 191–197, 511, 626 |
| B2 | **Guild Hall Shifu inspection** is private. The acting player chooses the order in which untaken inspected Techs go to the bottom, and that order stays private. Return them to the bottom first, then refill the display. The Shifu may inspect any discipline, including one already owned. | 208, 210, 715 |
| B3 | **Hidden Orders:** top-3 looks (Commission Shifu, Colour Samples) are private to the acting player. The Main Order discard pile is face down; only its count is public. Display Orders discarded at round start were already public. | 197, 304, 626 |

### Editorial corrections (no rule change)

- Line 391: Colour Samples takes from the deck only, never from the display.
- Line 714: the Shifu's top-3 selection is optional ("may instead", line 197).
- Line 649: the bury clause can never apply because the 12-card Fire deck is never reshuffled mid-game. A buried card stays at the bottom of the deck array.
- Line 17's "2 + Fire" is superseded by change 15 (Kiln Die result).
- Malformed bold markup on line 432. (Line 170 was corrected in the owner's 2026-10-16 edits.)

### Interpretations of V1.6.1 text, recorded for implementers

- The **Kiln Die** is rolled publicly by the server at the start of every round, including Round 1, after Kiln selection. The result stays visible all round.
- **No Contribution participants** (only Imperial Kiln ceramics loaded): skip Contributions. Base Heat = Kiln Die result (clamped). The Fire card is still revealed.
- **Second Firing on an Imperial Kiln ceramic** (lines 63, 289, 640, 651) recalculates with the same Kiln Die result, the same Imperial modifier chosen at loading and the same Heat marker, plus the new Fire card. Line 651 allows Second Firing in the Imperial Kiln, and an Imperial ceramic's Actual Heat never uses Base Heat or a zone modifier, so these are the values it keeps. The engine implements this.
- **Test Pieces** eligibility counts any of your ceramics in this firing, Imperial Kiln included. The Wood payment and the bury are public; the peeked value is private to its owner.
- **Heat-marker step:** the +1 / −1 face is chosen in the step, in First Player order, so nothing hidden is committed at placement. Within a player's turn they choose the order of their own marker and Kiln Master. If their own marker is returned, Kiln Master may then go on that ceramic.
- **Ge Crackle** (lines 468–470, 484, 654):
  - Once per round, after Quality is assigned, it targets 1 of the owner's ceramics from this firing that is Standard at that moment. The ceramic becomes Fine and permanently carries a Crackle marker.
  - It may follow Protective Saggars on the same ceramic.
  - When completing an Order, each Crackle ceramic may count as having any one Decoration for that Order's Decoration requirements. Its printed Decoration is unchanged, and Exhibition and Ru use the printed Decoration.
  - A Crackle ceramic is never a Masterpiece.
- **Deferred Main display refill** happens when the reserving player's turn ends, after any after-action Imperial Priority or Canal Barge. Canal Barge used after a Commission Market action may complete an Order reserved by that action.
- **Before/after-action window:** Canal Barge and Imperial Priority may share the window in an order the player chooses. A token or Imperial Kiln gained during the window is usable within it.
- **Order Phase:** a single pass in First Player order. A player with nothing completable is skipped automatically.
- **Cleanup in Round 5:** the hand trim has no scoring effect and is skipped.
- **Exhibition:** every eligible undelivered ceramic is exhibited automatically. Exhibiting more never loses VP and helps tie-breaker 3.
- **Kiln Tending** resolves automatically on the first qualifying Glaze & Load action each round; saving it gains nothing.
- **Setter's Mark** placement is optional. A Setter's Mark bought mid-round is first placed at the next Work Phase start.
- **Decorator's Kit** may reduce the Decoration paid through Prepared Clay. It never applies to Ding's 1-Coin vessel.

### Provisional defaults (edge cases the text leaves open; owner may overrule)

These come from the engine design ([ENGINE_V1.6.1_DESIGN.md](./ENGINE_V1.6.1_DESIGN.md) §11). Each can be changed without changing the engine contract.

- **P1 — Reworking Table with Imperial Priority.** Allowed. It uses Reworking Table's once-per-round allowance. The tile triggers "when you glaze and load a Shaped vessel" and does not require the Glaze & Load action.
- **P2 — More than two empty display positions.** Possible only after the Main deck and discard both ran out (B1). Every refill compacts the display and fills all empty positions as cards allow, aiming at 6.
- **P3 — Reworking into Inverted Firing eligibility.** Glaze & Load placement legality (R5c) looks only at each vessel's current Shape. During a legal action, the Shape change applies before the Inverted Firing Shape check (line 617, "first").

## Digital decisions

- **Versioning:** rules `1.6.1`, state schema 6, behaviour revision 29. V1.4 rooms are not migrated: the rules fingerprint rejects them, and new rooms start on V1.6.1.
- **Stable IDs:** Orders S01–S16 and O01–O48 behind the version gate. Techs keep T01, T05 and T10–T15 where the tile carries the same idea. New tiles take T16–T25. Retired IDs (T02–T04, T06–T09, ST01–ST04) are never reused.
- **Chinese text (owner instruction, 2026-10-14):** a Song-dynasty kiln-workshop register rather than literal translation. Terms are fixed once in the [Chinese glossary](./GLOSSARY_ZH_V1.6.1.md) and used everywhere.
