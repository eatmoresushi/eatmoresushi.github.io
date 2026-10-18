# Kiln Opening V1.6.2: engine, data and test delta

Branch `kiln-opening-v162-engine`. The design and records of the V1.6.2 engine track, written in stage 1 and kept current as the stages land.

- **Rules authority:** the [V1.6.2 Player Rulebook](./KILN_OPENING_v1.6.2_EN_SOURCE.md), designated by the owner on 2026-10-17, with its [Chinese edition](./KILN_OPENING_v1.6.2_ZH.md) and [component text](./KILN_OPENING_v1.6.2_COMPONENT_TEXT.md). [The V1.6.2 audit](./RULEBOOK_AUDIT_V1.6.2.md) records the checksums, the owner rulings (R1–R19, B1–B3; R15–R18 are the owner's confirmations of 2026-10-17; R19 of 2026-10-18 replaced provisional default P5; R3 is obsolete and R14 superseded since owner revision 2), the amendments (A1 superseded by owner revision 3's change 27, A2), interpretations (INT) and provisional defaults (P1–P3).
- **Owner revision 2026-10-17 (Guild Hall).** After stage 1 was written, the owner revised the Guild Hall in the English and Chinese rulebooks (changes 21, L31; L207, L209, L212, L714). The Shifu takes up to 2 Techs from different disciplines at printed cost, with no discount. A taken Tech's position stays empty until the end of the taker's turn, for Apprentice and Shifu takes alike. Placement legality is the same for both workers. This document describes the revised rules; §1 rows 6–8, §4.3 and §13 say what changed.
- **Owner revision 2, 2026-10-17 (changes 23–24, L33–34).** The owner then rebuilt the Starting Order deck as 8 cards (S01–S08, new values; S07 "Carved, Impressed or Painted"; a 4-player game deals all 8), re-valued nineteen Main Orders, and sent every looked-at Order not reserved to the **bottom of the Main Order deck** instead of the discard: the Commission Market's 2 or 3, Colour Samples' when-acquired 3 and the other card of its swap's 2. That supersedes ruling R14; the held Order a swap discards still goes to the discard (a Starting Order to the box). Several cards put on the bottom go there in random order (owner ruling R19, 2026-10-18, which replaced the provisional default P5, draw order). §1 rows 17–20, §3.5, §4.1–§4.4, §7 and §13 item 7 describe it.
- **Owner revision 3, 2026-10-18 (changes 25–27, L35–37).** The owner added the keyword **Select N** (look at the top N Main Orders, reserve 1 of them or 1 face-up Main Order, the rest to the deck bottom): the Commission Market Apprentice Selects 2, the Shifu Selects 3 reserving up to 2, and Colour Samples Selects 3 when acquired and for its swap, which therefore looks at 3 and, like the when-acquired Select, may take a face-up Order. **Fuel Ledger** became 2 Contribution cards, Fuel Ledger Bank (1 Wood, −2) and Fuel Ledger Stoke (1 Wood, +2), in place of the secret Wood commitment; its owner plays 1 of 5 cards and plain Bank and Stoke stay free. **Tech VP is removed** (owner amendment A1 superseded). §1 rows 21–23, §1.1, §14 and stage 7 describe it; the sections below are amended where revision 3 changed them.
- **Line numbers.** Revision 2 shortened Appendix A0 by 8 lines (revision-1 lines 540–756 became 532–748); revision 3 moved most lines down 5 or 6 (§1.1; the audit gives both maps). The `L` numbers in §1–§13 were written before revision 2 and are revision-1 numbers (for example L625 for Colour Samples, revision-2 L617, revision-3 L622) unless marked; §14 and the audit use revision-3 numbers. The clarifications and the line-pinned tests use revision-3 numbers; code comments keep the numbers they were written with until the renumbering pass (§1.1).
- **Base contract:** [ENGINE_V1.6.1_DESIGN.md](./ENGINE_V1.6.1_DESIGN.md) and `src/game/types.ts`. Everything this document does not change stays as that design says. Where the two disagree, this document wins.
- **Notation:** `L124` is a line of the V1.6.2 English source. `1.6.1:L124` is a line of the V1.6.1 source. `R4`, `B1`, `R15`, `P3` are audit entries. `DESIGN §x` is a section of the V1.6.1 engine design.
- **Versions after this track:** rules `1.6.2`, state schema `8`, `RULES_BEHAVIOUR_REVISION` `31` (schema 7 and revision 30 until owner revision 3, stage 7).

Nothing here changes a rule or a balance value. Every value below is printed in V1.6.2. §13 lists the cases the text left open and the owner's rulings on them (2026-10-17).

**Stage status.**

- **Stage 2 (landed): the locations and the version bump.**
  - Versions: rules `1.6.2`, schema 7, revision 30, `r30-` fingerprints (§3.6); the package version is `1.6.2`.
  - Data: every `rulesVersion`, the four Tech costs (§3.1 cost column) and the location effects and texts (§3.2).
  - Engine: Commission Market (§4.2), Materials Yard, Canal Wharf and Guild Hall (§4.3, with the owner's revision of 2026-10-17: up to 2 takes at printed cost, `GUILD_FINISH`, the deferred Tech refill and one placement rule for both workers), `reservable` and `lookCount` (§4.1), legality (§5) and the legal-action families, the rule errors `RESERVATION_REQUIRED`, `RESERVATION_LIMIT`, `TECH_TAKE_LIMIT` and `TECH_TAKE_REQUIRED` (§2.5), the Commission and Guild Hall step invariants and the deferred-refill check (§4.12), privacy (§7) and the events (§2.4).
  - Platform pins (§9): the service, client, stores and policy labels; Playtest Form V3; the two Supabase migrations edited in place.
  - Computer policy items 1–4 of §10, and the Commission and Guild Hall fallbacks of item 11.
  - Glossary: the location texts (the Guild Hall per the owner revision), the deferred Tech refill, the Tech costs and the error sentences.
- **Stage 3 (landed): the Tech behaviour, the Fire reshuffle and owner revision 2.**
  - Techs: the Colour Samples swap (§4.4), Canal Barge's 2 Coins in the Order Phase only (§4.6), Protective Saggars' floor and Standard → Fine step (§4.7, §4.8), Fuel Ledger's free Bank and Stoke (§4.9), Second Firing's 2 cards and choice with R7's Jun (§4.10), with their `params`, `ability` and short texts (§3.1, §3.3). The content contract checks all five against the V1.6.2 rows (`V162_TECHS`).
  - The Fire reshuffle above buried cards (§4.5, R15), `fireBuried` in the state and the public counts.
  - Owner revision 2 (changes 23–24): `data/orders.json` (8 Starting Orders with S07's Decoration alternative `decorations`, nineteen Main Order values), `components.json` and `asset_specs.json` counts, the Commission Market location texts and Colour Samples' texts; looked-at Orders not reserved go to the deck bottom (`putMainOrdersOnBottom`, event `LOOKED_ORDERS_TO_BOTTOM`, P5); the pinned checksums.
  - Rule errors: `ORDER_NOT_HELD` made general (§2.5); `INVALID_CHOICE` gains `cardIndex`; after-Quality `INVALID_TARGET` reasons `not_standard`, `not_flawed_or_standard`, `not_flawed`; a placement during a before-action swap is `WRONG_PHASE`.
  - Invariants (§4.12), selectors and legal-action families (§4.13), privacy (§7), computer policy items 5–10 and the fallbacks of item 11 (§10); the glossary rows of the changed texts.
- **Stage 3b (landed): owner revision 2 for Orders, checked against the rulebook (changes 23–24).**
  - Data re-checked row by row against Appendix A of both editions: all 56 requirement strings (EN, ZH), Qualities, VP, Coins and Crowns. The content contract now also parses the Chinese Appendix A (§11.1).
  - Tests: S07's Decoration alternative (each of Carved, Impressed and Painted, at every Quality; Plain refused with `decoration_mismatch`; a Crackle wildcard searched or declared as each listed Decoration, Plain and `[]` refused); the public deck count across a Commission look and its return under the deck.
  - Documents: the audit (Cleanup is L303; R16's note that a look takes out of the deck only the cards it reserves), `GAME_RULES.md`, the `AGENTS.md` lists (§12) and the glossary's Commission Market note.
  - Unchanged at the time: provisional default P5 (draw order). The `AGENTS.md` change list already named owner ruling R19 (random order, seeded RNG); stage 6 applied it (below).
- **Stage 4 (landed): content and its contract tests.**
  - Clarifications (§3.4): [KILN_OPENING_v1.6.2_CLARIFICATIONS.md](./KILN_OPENING_v1.6.2_CLARIFICATIONS.md) replaces the V1.6.1 file as the data source, 170 items (120 carried over and re-cited, 29 rewritten, 21 added; 7 retired). Every `L` tag cites a revision-2 line; `CLARIFICATION_TAG` accepts R1–R18. The contract resolves every tag against the V1.6.2 source and audit, refuses R3, R6 and R14 (obsolete or superseded) and the retired V1.6.1 wording, and checks that every carried-over item cites the same text or the line V1.6.2 rewrote. No item states the order of several cards put on the deck bottom (P5 is open).
  - Short text (§3.3): [KILN_OPENING_v1.6.2_COMPONENT_TEXT_SOURCE.md](./KILN_OPENING_v1.6.2_COMPONENT_TEXT_SOURCE.md), the owner's component text in the repository format (`### Name / 名 (ID)`, `- EN:` / `- ZH:`, bold removed); the contract checks it against the owner's file and the data, and that only T10, T11, T12, T14 and T23 changed from V1.6.1.
  - Rulebook text in data, now checked against both editions: location rows in Chinese too; the Components, Round Structure, Imperial Recognition Track and Chinese Contribution tables; the Chinese Appendix B rewrites the same five Techs. The Glaze & Load Shifu's Chinese text (`shifuTextZh`) is now the Chinese rulebook's row; it had carried R9, which stays in the clarifications. Recorded adaptations: the Kiln Player Boards and Cover token notes (D7, English only) and Imperial Audience's added "each further Crown" sentence.
  - Glossary: the header and §3 point at the V1.6.2 files, §4.3 follows the Chinese row, §8 is checked word for word against the Chinese Tech clarifications, 换单 is checked, §9 cites V1.6.2 lines.
- **Stage 5 (landed): computer players, multiplayer and privacy.**
  - Computer policy (§10): checked against every new or changed decision; items 1–11 were already in. Added item 12: a Fuel Ledger rival may Bank or Stoke with no Wood, a Saggars rival's ceramics are never Flawed, and the Contribution, the rival model and the Work-Phase target heat use the R15 Fire model (`nextFireDist`). The swap's look is valued without an overflow cost, since the swap keeps the hand size (item 5).
  - Tests: decisions for the swap (taken and declined, the other card under the deck), Second Firing's better card with and without R7's Jun, S07's Decoration at forming, the Guild Hall Shifu's 2 takes at printed cost with the bottom order, Fuel Ledger's free Bank and Stoke, Saggars without Wood, and Canal Barge's Order-Phase Coins (`computer_decisions`); every V1.6.2 step is now required in the zero-rejection suites (`computer_legality`); a privacy sweep over complete service games for 2, 3 and 4 players (`privacy_full_games`, §11.2); the retired Starting Orders S09–S16 refused by Playtest Form V3 (`playtest_form`).
  - Tools: the fixture descriptions m2, m16 and m17 say the looked cards not reserved go under the Main deck; `npm run fixtures` regenerates the outputs in the UI stage.
  - The `v1.6.2 L…` citations in `src/multiplayer` and the platform tests now use revision-2 line numbers.
- **Stage 6 (landed): review fixes, owner ruling R19 and the privacy oracle.**
  - Owner ruling R19 (2026-10-18, recorded in `AGENTS.md`; now in the audit, which retires P5 and its open question): several looked cards put under the Main deck go there in random order. `putMainOrdersOnBottom(draft, ids, ctx)` shuffles them with `ctx.rng` (a single card consumes no draw); `LOOKED_ORDERS_TO_BOTTOM.secret.orderIds` names them in look order, never in deck order. Tests: the 6 orders of 3 cards over seeds, the seeded shuffle, a single card without a draw (`market.test.ts`), and a Shifu look of 3 returned in random order with the secret in look order (`commission_market.test.ts`); the tests that had pinned the draw order compare the cards as sets. The changed RNG use moved one seeded game in `ui_selectors.test.ts`, whose trim check now compares players as a set (Cleanup lists them in First Player order).
  - Clarifications: `CLARIFICATION_TAG` accepts R1–R19; three items cite R19 (Colour Samples' deck-bottom item, the Commission Market's B3 item, the Main Orders' deck-bottom item); the count stays 170.
  - `tools/fixturePrivacy.ts` (§9): the oracle replays the log in order. An ID a seat saw and that then moved where only another seat saw it go (another seat's secret names it: a face-up Order later given up for a swap or a trim, a card put under the deck and later drawn) is `rehidden`: it may appear in event records, never in a current payload. `secretIdsFor` (the fixtures' `secrets.json`, the local backend's `e2e_secret_ids`) still lists only the IDs never shown, because a page shows past events. A response's `events` are checked to be projections. Tests: `fixture_privacy_oracle.test.ts`; the full-game sweep requires a rehidden moment.
  - Documents: `IMPLEMENTATION_DECISIONS.md` and `ONLINE_GAME_SPEC.md` now describe V1.6.2 (§12); `AGENTS.md`'s L648 citations are L640 (revision 2); the migration's private-events comment, the matcher header and the `discardMainOrders` test no longer describe removed mechanics.
- **Stage 7 (landed): owner revision 3 (changes 25–27, §14).**
  - Versions: schema 8, behaviour revision 31 (`r31-`), rules still `1.6.2`; schema-7 / `r30` rooms are refused, never migrated.
  - Select N (change 25): one model, `work/select.ts` (`openSelect`, `selectPicksError`, `resolveSelectPicks`, `selectReservable`), and one command, `SELECT_CHOOSE`, for the Commission Market, Colour Samples when acquired and the swap (`work/selectChoose.ts`). Every Select may reserve a face-up Order; the swap Selects 3. `COMMISSION_CHOOSE`, `COLOUR_SAMPLES_CHOOSE` and `COLOUR_SAMPLES_SWAP_CHOOSE` are gone.
  - Fuel Ledger cards (change 26): `PlayerState.contributionCards`, `CONTRIBUTION_CARDS_GAINED`, `SUBMIT_CONTRIBUTION { windowId, card }` without `fuelLedger`, `CONTRIBUTION_CARD_NOT_HELD`; the stores and the Supabase migration hold the 5-card set and refuse a payload carrying `fuelLedger`.
  - No Tech VP (change 27): `ScoreLedger.techs`, the final `techs` row, `TECH_ACQUIRED.vp` and `game_config.techs.vpEach` are gone; `tech_vp_on_gain.test.ts` is replaced by `tech_no_vp.test.ts`.
  - Data: T10 and T12 `params`, `ability`, `abilityZh` and short texts; the Commission Market `effects` (`select`) and texts; Contribution cards 14 (`components.json`, `firing.json`, `asset_specs.json`); clarifications re-cited to revision-3 lines (still 170 items); the component text source with the 2 Fuel Ledger cards; the pinned checksums.
  - Computer policy and fallback (§10 items 13–15), invariants, selectors and legal-action families, privacy, fuzz (seed base 7400), and the documents (audit, `GAME_RULES.md`, `IMPLEMENTATION_DECISIONS.md`, `ONLINE_GAME_SPEC.md`, the glossary).
- **Still to come:**
  - The renumbering pass of the remaining code and test comments (§1.1, now including revision 2's −8 after line 539 and revision 3's +5/+6) and the documents of §12.
  - `src/app` (the UI stage): the swap, the Second Firing choice, `LOOKED_ORDERS_TO_BOTTOM` in place of `LOOKED_ORDERS_DISCARDED`, S07's `decorations`, the 8-card Starting deck, and revision 3: `SELECT_CHOOSE` with `step.select` for all three Selects (a face-up pick in every one), the 5-card Contribution chooser from `contributionCards`, and no Tech VP line.
- **Line citations in code:** an unchanged rule keeps its V1.6.1 `L` number until the renumbering pass (§1.1); a rule V1.6.2 changed is cited `v1.6.2 L195`.

---

## 1. What V1.6.2 changes (rulebook changes 21–27, L31–37)

| # | Rule | V1.6.1 | V1.6.2 | Lines |
| --- | --- | --- | --- | --- |
| 1 | Commission Market, Apprentice | Reserve 1 (face-up or blind), then gain 1 Clay/Wood/Coin | Privately look at the top 2 Main Orders; reserve 1 from the display or those 2; put the rest of the 2 on the bottom of the Main deck (change 24). No resource | L191, L195, L713 |
| 2 | Commission Market, Shifu | Up to 2 separate reservations, one may be a top-3 selection; a resource after each | Privately look at the top 3; reserve up to 2 (at least 1) from the display and those 3; put the rest of the 3 on the bottom of the Main deck (change 24). No resource | L191, L196, L198, L713 |
| 3 | Blind reservation | Top card unseen, into the hand | Gone | L31 |
| 4 | Display refill | After the reserving turn | Unchanged: after the reserving turn; both Shifu reservations choose from the Orders showing now | L191, L198, L390 |
| 5 | Materials Yard, Shifu | 4 resources, then may pay 1 Coin for +1 Clay +1 Wood | 6 resources in any Clay/Wood split; no Coin option | L165, L710 |
| 6 | Guild Hall, Shifu | Take 1 face-up Tech of any discipline or 1 inspected Tech, 1 Coin less (min 0) | Take up to 2 Techs (1 or 2, L144) from different disciplines, face-up or inspected, paying the printed cost of each; no discount (owner revision 2026-10-17; the first V1.6.2 draft had 2 Coins less) | L31, L207, L714 |
| 7 | Tech display refill | Right after each take (1.6.1:L210) | A taken Tech's position stays empty until the end of the taker's turn; then each discipline refills to 2 if possible. A Shifu's second Tech is chosen from what shows now. Apprentice buys too (owner revision 2026-10-17) | L31, L209 |
| 8 | Guild Hall legality | An affordable face-up Tech of an unowned discipline; for the Shifu, after the discount (1.6.1:L213) | The same for both workers: an affordable face-up Tech of a discipline you do not own, at printed cost (owner revision 2026-10-17) | L212 |
| 9 | Canal Wharf, Shifu | 4 Coins | 4 Coins and the top Main Order card, unseen, into the hand | L220, L396, L715 |
| 10 | Colour Samples (T10) | When acquired: top-3 reservation; hand limit 5 | Adds: once per round, before or after one of your worker actions, you may discard 1 held Order (Main → face-down discard, Starting → box) to look at the top 2 Main Orders and reserve 1; the other goes on the bottom of the Main deck (change 24; it superseded owner ruling R14, which had it discarded). The when-acquired look's 2 other cards go on the bottom too | L34, L625, L649, L718 |
| 11 | Canal Barge (T23) | Once per round, before or after a worker action, complete 1 held Order (R6) | Once per round, when you complete an Order, gain 2 Coins. Orders are completed only in the Order Phase | L32, L402, L484, L630, L645 |
| 12 | Protective Saggars (T11) | Cost 2; once per round, 1 Wood: Flawed → Standard or Standard → Fine | Cost 3. Your ceramics are never Flawed: Heat Difference 3+ counts as Standard. Once per round, after Quality, 1 of your Standard ceramics from this firing becomes Fine. Never a Masterpiece | L636, L650, L653 |
| 13 | Fuel Ledger (T12) | Cost 3; secretly commit 1 additional Wood with Bank/Stoke for −2/+2 | Cost 2. Your Bank and Stoke cost no Wood. Committing 1 Wood still makes them −2/+2 | L637 |
| 14 | Second Firing (T14) | Reveal 1 extra Fire card | Reveal 2 extra Fire cards, choose 1, discard both | L639, L650 |
| 15 | Costs | Senior Apprentice 2, Kiln Tending 2 | Senior Apprentice 3, Kiln Tending 3. Test Pieces stays 3 | L32, L618, L626, L638 |
| 16 | Fire deck | Reshuffled only when empty; the audit said it never runs out | Unchanged text (L511, L648, L657). With Second Firing taking 2 cards, a firing can use 3 cards, so 5 firings can need 15 of 12: the reshuffle with a buried card (L648) is now reachable (owner ruling R15) | L22, L511, L648, L657 |
| 17 | Starting Order deck (change 23) | 16 cards, S01–S16 | 8 cards, S01–S08 with new requirements and values (four Glazes, the small Shapes, Vase or Censer, "Carved, Impressed or Painted", any); a 4-player game deals all 8. S09–S16 are retired | L33, L84, L103–104, L386, A0 |
| 18 | Main Order values (change 24) | As V1.6.1 printed | Nineteen cards re-valued: O01–O03 4 VP; O04 7 + 3; O05 6 + 3; O14 5 + 3; O15 5 + 4; O19, O20 6 VP; O22 9; O26 11; O27 12; O28 11; O30 13; O32 16; O33, O34 15 + 5; O38 12; O39 13 | L34, A1–A2 |
| 19 | Looked cards not reserved (change 24) | Discarded face down (V1.6.2 revision 1: Commission looks; R14: the swap) | Face down on the bottom of the Main deck, several in random order (owner ruling R19, which replaced provisional default P5); the discard receives only round-start rotations, Cleanup trims and swapped-out held Orders | L34, L191, L195–196, L396, L617 |
| 20 | Change 21's wording (L31) | — | Still says "revealed cards not reserved are discarded"; change 24 supersedes it (audit, editorial corrections) | L31, L34 |
| 21 | Select N (change 25, revision 3) | — | Keyword: look at the top N Main Orders, reserve 1 of them or 1 face-up Main Order, put the rest on the bottom. Rows 1–2 read as Select 2 and Select 3 (reserving up to 2), unchanged in effect. Row 10 changes: Colour Samples Selects 3 when acquired and for the swap, so the swap looks at 3, not 2, and both its Selects may reserve a face-up Order (position refilled at the end of the turn) | rev. 3 L35, L64, L197, L201–202, L622, L646, L710, L715–716 |
| 22 | Fuel Ledger as cards (change 26, revision 3) | Row 13: a secret 1-Wood commitment with Bank or Stoke | The tile brings 2 Contribution cards, Fuel Ledger Bank (1 Wood, −2) and Fuel Ledger Stoke (1 Wood, +2); its owner plays 1 of 5 cards; plain Bank and Stoke cost them no Wood. 14 Contribution cards, one back. Wood is paid on reveal only | rev. 3 L36, L93, L111, L266, L508, L634, L668–669, L734 |
| 23 | Tech VP (change 27, revision 3) | 1 VP per Tech when gained (owner amendment A1) | No VP for gaining or owning a Tech; A1 superseded. Connoisseur's Cabinet keeps its end-game VP; costs unchanged | rev. 3 L37, L496, L605, L616 |

Consequences that need no new text:

- Ru, Guan, Tribute Ware and Crackle wildcards trigger only in the Order Phase (L484, L402). Ruling R6 is obsolete.
- Senior Apprentice (L618, L652) gives an Apprentice the V1.6.2 Shifu effect: 6 resources at the Materials Yard; Select 3, reserving up to 2, at the Commission Market (R12 as re-checked).
- Ge (L653): with Saggars, a ceramic that would have been Flawed is Standard and may be crackled; Saggars' Standard → Fine step and Crackle never both apply to one ceramic. Both target Standard only, so each excludes the other without a special rule.
- Saggars and Second Firing are both Firing Techs (L210), so one player never owns both. Saggars' floor on a Second Firing recalculation is implemented but unreachable.
- Guild Hall Shifu (rows 6–7): "from different disciplines" is the 1-per-discipline limit (L210) applied to the second take, so at most 1 of the 2 takes is an inspected Tech (the inspected Techs share one discipline). The 3-total limit (L210) may leave room for only 1 take. Each gain resolves at once, before the second take (L213): its Cover token (L211) and any when-acquired effect, which for Colour Samples is a Select 3 and for Fuel Ledger its 2 Contribution cards (since revision 3 no VP is scored; before it, A1's 1 VP). Because the taken position stays empty and the second take must come from another discipline, the deferred refill never changes which second Techs are legal; it decides only when the new Tech is revealed, after the bottom order (B2) and after the after-action window.

### 1.1 Line map, V1.6.1 → V1.6.2

Every citation in code, data, tests and documents must be renumbered when the file moves to V1.6.2.

| V1.6.1 lines | V1.6.2 lines | Shift |
| --- | --- | --- |
| 1–30 | 1–30 | 0 (L1 and L9 reworded) |
| — | 31–32 | new changes 21–22 |
| 31–188 | 33–190 | +2 (1.6.1:L163 reworded → L165) |
| 189–192 | 191 | rewritten (one paragraph replaces the two reservation options) |
| 193–757 | 192–756 | −1 (changed lines: L195–196, L198, L207, L209, L212, L220, L390, L396, L402, L483–484, L618, L625–626, L630, L636–637, L639, L645, L649–650, L652–653, L710, L713–715, L718; L209 and L212 by the owner revision of 2026-10-17, which also rewrote L31, L207 and L714 again) |

The Chinese edition moves the same way: Chinese 1.6.1 lines 1–32 keep their numbers, 33–190 → 35–192, 191–194 → 193, 195–759 → 194–758.

Owner revision 2 (changes 23–24) then moved lines again. The `L` numbers in this document are revision-1 numbers; the audit uses revision-2 numbers.

| V1.6.2 revision-1 lines | Revision-2 lines | Shift |
| --- | --- | --- |
| 1–523 | 1–523 | 0 (33–34 now changes 23–24; reworded L84, L103–104, L191, L195–196, L386, L396, L514, L516, L518, L520) |
| 524–539 (16 Starting rows) | 524–531 (8 rows) | rebuilt |
| 540–756 | 532–748 | −8 (re-valued rows in A1–A2; Colour Samples L625 → L617) |

Chinese: revision-1 lines 1–34 keep their numbers, 35–36 are new, 35–525 → 37–527, the Starting rows 526–541 → 528–535, 542–758 → 536–752.

Owner revision 3 (changes 25–27, 2026-10-18) moved lines again. §14 and the audit use revision-3 numbers.

| V1.6.2 revision-2 lines | Revision-3 lines | Shift |
| --- | --- | --- |
| 1–34 | 1–34 | 0 (32 reworded: the swap looks at "the top 3") |
| — | 35–39 | new changes 25–27, a blank line and the restored note "Yours, from the doc comments" |
| 35–58 | 40–63 | +5 |
| — | 64 | new glossary row Select N |
| 59–377 | 65–383 | +6 (reworded L93, L111, L197, L201–202, L246, L266) |
| 378 | — | deleted (Tech VP) |
| 379–709 | 384–714 | +5 (reworded L401, L415, L496, L508, L605, L622, L634, L646, L649, L668–669, L710) |
| — | 715 | new quick-reference line Select N |
| 710–745 | 716–751 | +6 (reworded L716, L717, L734) |
| 746 | — | deleted (Tech VP) |
| 747–748 | 752–753 | +5 |

Chinese: revision-2 lines 1–36 keep their numbers; 37–39 are new; 37–62 → 40–65; 66 is new; 63–381 → 67–385; 382 is deleted; 383–713 → 386–716; 717 is new; 714–749 → 718–753; 750 is deleted; the rest +3. From line 40 on, each Chinese line is the English line plus 2. The component text keeps its line numbers up to line 102.

---

## 2. Contract changes (`src/game/types.ts`)

The header JSDoc names V1.6.2, `RULEBOOK_AUDIT_V1.6.2.md` and this delta. All `L` citations are renumbered (§1.1).

### 2.1 Versions and identifiers

```ts
export type RulesVersion = "1.6.2";
export type SchemaVersion = 8;   // 7 until owner revision 3 (§14)
/** Owner revision 3 (change 26): the 3 cards every player holds and Fuel Ledger's 2. */
export type ContributionCardId = "BANK" | "TEND" | "STOKE" | "FUEL_LEDGER_BANK" | "FUEL_LEDGER_STOKE";
```

The `TechId` table JSDoc gets the new costs: T18 3, T20 3, T11 3, T12 2. `GainResource` is deleted (no location gains a chosen resource any more).

### 2.2 State

```ts
export interface OwnedTechState {
  // JSDoc: Colour Samples (T10) now has a once-per-round allowance (the swap, L625).
  // Unused only for Fuel Ledger (T12) and Connoisseur's Cabinet (T19).
}

export interface CompletedOrderRecord {
  // `via` is deleted: Orders are completed only in the Order Phase (L296, L402).
  /** Canal Barge (T23, L630): 2 Coins on the first Order you complete each round (INT Canal Barge). */
  canalBargeCoins: 0 | 2;
  // other fields unchanged
}

export type PendingLook =
  | { /** Commission Market look: top 2 (Apprentice effect) or 3 (Shifu effect) (L195–196, B1, B3). */
      kind: "commission_market"; playerId: PlayerId; orderIds: OrderId[] }
  | { /** Colour Samples when acquired: top 3 (L625, R4, B1, B3). */
      kind: "colour_samples"; playerId: PlayerId; orderIds: OrderId[] }
  | { /** Colour Samples once-per-round swap: top 2 (L625, L649, change 24, B1, B3). */
      kind: "colour_samples_swap"; playerId: PlayerId; orderIds: OrderId[] }
  | { kind: "guild_inspection"; playerId: PlayerId; discipline: TechDiscipline; techIds: TechId[] };
  // "commission_top_three" is deleted. `guild_inspection.techIds` holds the inspected Techs not
  // yet taken (an inspected take leaves it). The `colour_samples` look gains
  //   inspection: { discipline: TechDiscipline; techIds: TechId[] } | null
  // (owner revision 2026-10-17): a Guild Hall Shifu who takes Colour Samples while its
  // inspection is open keeps the untaken Techs there, still private, until the reservation is
  // made; null after an Apprentice buy.

export interface HiddenState {
  /** Fire deck, top first. Its last `fireBuried` cards are Test Pieces cards buried at the
   * bottom (L638, L648, R15). */
  fireDeck: FireModifier[];
  /** 0 ≤ fireBuried ≤ fireDeck.length. */
  fireBuried: number;
  // other fields unchanged
}

export interface PublicCounts {
  /** Buried Fire cards still in the deck. Public: every bury is public (TEST_PIECES_USED).
   * Never shown by the UI (owner decision D4); the computer player reads it. */
  fireBuried: number;
  // other fields unchanged
}

export interface FiringCeramicRecord {
  /** Second Firing's two revealed cards in reveal order (T14, L639); null if not second-fired.
   * `second.fireModifier` is the chosen one. */
  secondFiringCards: [FireModifier, FireModifier] | null;
  /** Quality was assigned Standard by Protective Saggars from a Heat Difference of 3+ (L636). */
  saggarsFloor: boolean;
  // other fields unchanged
}

export interface FiringContext {
  /** Second Firing's two extra cards while the actor chooses (T14, L639). Non-null only during
   * `firing_second_firing_choice`; then both go to `fireDiscard` (DESIGN §8.3 conservation). */
  pendingExtraFire: { playerId: PlayerId; ceramicId: CeramicId; modifiers: [FireModifier, FireModifier] } | null;
  // other fields unchanged
}
```

`WorkTurnStep` (DESIGN §3.2):

```ts
export type WorkTurnStep =
  | { kind: "before_action" }       // USE_COLOUR_SAMPLES_SWAP, USE_IMPERIAL_PRIORITY or a PLACE_*
  | {
      /** The private look is in `hidden.pendingLook` (kind "commission_market"). Next: SELECT_CHOOSE. */
      kind: "commission_market";
      workerId: WorkerId;
      effect: WorkerEffect;
      /** Select 2 (Apprentice) or Select 3 reserving up to 2 (Shifu effect), owner revision 3. */
      select: SelectSpec;
    }
  | GuildInspectionStep                                         // owner revision 2026-10-17, below
  | {
      /** Colour Samples when acquired: Select 3. `resume` is the Guild Hall Shifu's inspection
       * step to return to after the reservation (Colour Samples was one of its takes); null after
       * an Apprentice buy. Next: SELECT_CHOOSE. */
      kind: "colour_samples";
      select: SelectSpec;
      resume: GuildInspectionStep | null;
    }
  | {
      /** The swap's Select 3 (kind "colour_samples_swap"). Next: SELECT_CHOOSE, then back to
       * `returnTo`. */
      kind: "colour_samples_swap";
      returnTo: "before_action" | "after_action";
      select: SelectSpec;
    }
  | { kind: "after_action" };       // USE_COLOUR_SAMPLES_SWAP, USE_IMPERIAL_PRIORITY, END_TURN

/** Owner revision 3 (change 25): one Select. `fromDisplay` is true for every Select (L64);
 * `lookedCount` is the cards the look showed, up to `n`, possibly 0 (B1). */
export interface SelectSpec { n: 2 | 3; maxReservations: 1 | 2; fromDisplay: boolean; lookedCount: number }
```

Owner revision 3 also adds `PlayerState.contributionCards: ContributionCardId[]` (public: Bank, Tend and Stoke, plus Fuel Ledger's 2 once T12 is owned) and removes `ScoreLedger.techs` (change 27).

```ts
export type GuildTake = { kind: "face_up"; techId: TechId } | { kind: "inspected"; techId: TechId };

export interface GuildInspectionStep {
  /** The untaken inspected Techs are in `hidden.pendingLook` (kind "guild_inspection").
   * Next: GUILD_TAKE (up to 2 in all) and, after at least 1 take, GUILD_FINISH. */
  kind: "guild_inspection";
  workerId: WorkerId;
  discipline: TechDiscipline;
  /** Techs the inspection drew: 2, or as many as remained (L207), possibly 0. */
  inspectedCount: number;
  /** The Techs taken so far, in order. Public: owned Techs are public. */
  takes: GuildTake[];
}
```

The Tech display (`GameState.techDisplay`) keeps its shape, `TechId[]` of 0–2 per discipline. Display positions carry no rule, so a taken Tech simply leaves the array; the refill at the end of the turn appends (L209).

`GamePhase`: `firing_second_firing_jun` is replaced by

```ts
  | {
      /** T14 (L639, R7): the actor chooses 1 of the 2 revealed cards, and, if Jun is unused and
       * affordable, Jun's ±1 on this ceramic. Cards in `FiringContext.pendingExtraFire`. */
      type: "firing_second_firing_choice";
      actorId: PlayerId;
      ceramicId: CeramicId;
    }
```

`decisionPrompt`: `firing_second_firing_choice` → `[actorId]`, mode `single`.

### 2.3 Commands

| Command | V1.6.2 shape | Notes |
| --- | --- | --- |
| `PLACE_MATERIALS_YARD` | `buyShifuBonus` deleted | clay + wood = 3 (Apprentice) or 6 (Shifu effect, incl. Senior Apprentice) |
| `PLACE_COMMISSION_MARKET` | `{ workerId, seniorApprentice? }` | `first` deleted: the look always comes first (L195–196, INT Commission Market looks) |
| `SELECT_CHOOSE` (owner revision 3; was `COMMISSION_CHOOSE`) | `{ reservations: SelectPick[] }` | every Select: 1 pick (Apprentice effect, Colour Samples) or 1–2 (Shifu effect); a face-up pick in any of them |
| `COMMISSION_RESERVE`, `COMMISSION_CHOOSE_LOOKED`, `COMMISSION_GAIN`, `COMMISSION_STOP` | deleted | `parseCommand` → `MALFORMED_ACTION` |
| `PLACE_CANAL_WHARF` | unchanged | the Shifu effect also draws (§4.3) |
| `PLACE_GUILD_HALL` | unchanged | one legality rule for both workers (§5); the Shifu still names the discipline to inspect |
| `GUILD_TAKE` | `{ take: GuildTake }` | `bottomOrder` moves to `GUILD_FINISH`. One Tech per command, up to 2 per action (owner revision 2026-10-17, §4.3) |
| `GUILD_FINISH` (new) | `{ bottomOrder: TechId[] }` | after at least 1 take: stop taking, put every untaken inspected Tech on the bottom in this order (B2) |
| `USE_CANAL_BARGE` | deleted | Canal Barge has no command (§4.6) |
| `USE_COLOUR_SAMPLES_SWAP` (new) | `{ discardOrderId: OrderId }` | before/after-action window |
| `COLOUR_SAMPLES_CHOOSE`, `COLOUR_SAMPLES_SWAP_CHOOSE` | deleted (owner revision 3) | `SELECT_CHOOSE` |
| `USE_PROTECTIVE_SAGGARS` | unchanged shape | target must be Standard; no Wood |
| `USE_SECOND_FIRING` | unchanged shape | reveals 2 cards, opens `firing_second_firing_choice` |
| `SECOND_FIRING_CHOOSE` (new) | `{ cardIndex: 0 \| 1; jun: { delta: HeatMarkerValue } \| null }` | the card and R7's Jun in one command (§4.10) |
| `RESOLVE_JUN` | unchanged shape | only in `firing_heat_adjustment` now |
| `SUBMIT_CONTRIBUTION` | `{ windowId, card }` (owner revision 3) | the `fuelLedger` flag is deleted; `card` must be one the player holds (§4.9, §14) |

```ts
/** One reservation of a Select (owner revision 3; was `CommissionPick`). */
export type SelectPick =
  | { kind: "face_up"; slotIndex: number; orderId: OrderId }   // must equal market.display[slotIndex]
  | { kind: "looked"; orderId: OrderId };                     // must be in own.pendingLook
// `CommissionReservationChoice` is deleted.
```

`ActionHandlerTable` follows the union. `actionGuard.ts` gets parsers for the new commands and drops the deleted ones (`reservations`: array of 1–3 picks, each shape-checked; `cardIndex` ∈ {0, 1}; `jun` null or `{delta: ±1}`; `GUILD_TAKE` with a `bottomOrder` field is `MALFORMED_ACTION`; `GUILD_FINISH.bottomOrder` is an array of Tech IDs, its permutation checked by the validator).

### 2.4 Events

| Event | Change |
| --- | --- |
| `ORDER_RESERVED` | `via: "commission_market" \| "colour_samples" \| "colour_samples_swap" \| "canal_wharf"`; `source: "face_up" \| "looked" \| "deck_top"`. `face_up` is public (`slotIndex`, `orderId`); `looked` and `deck_top` carry `orderId: null` and `secret: {orderId}` (B3). `blind`, `top_three` and the source `colour_samples` are deleted |
| `PRIVATE_LOOK_OPENED` | `kind` takes the new `PendingLook` kinds. Emitted for every look, a 0-card Commission look included |
| `LOOKED_ORDERS_TO_BOTTOM` (replaces `LOOKED_ORDERS_DISCARDED`, owner revision 2) | `{ playerId; count; secret: { orderIds } }`: a look's unreserved cards, put face down on the bottom of the Main deck in random order (change 24, R19); `orderIds` lists them in look order, never deck order. After every `SELECT_CHOOSE` (owner revision 3; before it, after `COMMISSION_CHOOSE`, `COLOUR_SAMPLES_CHOOSE` and `COLOUR_SAMPLES_SWAP_CHOOSE`); the count is public, the cards are the looker's (B3) |
| `HELD_ORDER_DISCARDED` (new) | `{ playerId; cause: "colour_samples_swap"; to: "main_discard" \| "box"; secret: Secret<{ orderId }> }`. Where the card goes is public (it changes `counts.mainDiscard`); which card is private |
| `RESOURCES_CHANGED.reason` | delete `materials_yard_bonus`, `commission_market`, `protective_saggars`; add `canal_barge` |
| `QUALITY_ASSIGNED` | add `saggarsFloor: boolean` |
| `SECOND_FIRING_REVEALED` | `{ playerId; ceramicId; modifiers: [FireModifier, FireModifier] }` (public, at the reveal) |
| `SECOND_FIRING_CHOSEN` (new) | `{ playerId; ceramicId; cardIndex: 0 \| 1; modifier; calculation: HeatCalculation }` (before any R7 Jun) |
| `FIRE_DECK_RESHUFFLED` | add `buriedBelow: number` (buried cards left under the new cards) |
| `JUN_ADJUSTED` | unchanged (`during: "second_firing"` now comes from `SECOND_FIRING_CHOOSE`) |
| `ORDER_COMPLETED` | the record carries `canalBargeCoins`, not `via` |
| `TECH_ACQUIRED` | `cost` is the printed cost for every take (owner revision 2026-10-17); `vp` is deleted (owner revision 3, change 27) |
| `CONTRIBUTION_CARDS_GAINED` (new, owner revision 3) | `{ playerId; techId: "T12"; cards: ["FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"] }`, public, right after `TECH_ACQUIRED{T12}` |
| `CONTRIBUTIONS_REVEALED` | each entry `{ card, heat, woodPaid }`; `fuelLedger` is deleted (owner revision 3) |
| `TECH_DISPLAY_REFILLED` | emitted when the taker's turn ends (after the after-action window, after the Main display refill), once per discipline that reveals a Tech, in `DISCIPLINES` order (L209); no longer right after the take |
| `TECHS_RETURNED_TO_BOTTOM` | at `GUILD_FINISH`, or when the inspection closes by itself (§4.3); before the end-of-turn refill (B2) |

Canal Barge's use is `TECH_USED{T23}` followed by `RESOURCES_CHANGED{reason: "canal_barge", coins: 2}`, after the Ru/Guan events of the same completion.

### 2.5 Rule errors (`GameRuleErrorCode`, `ruleErrorText.ts`)

- **New `RESERVATION_REQUIRED`:** "Reserve at least 1 Order." / 至少要承接1张委托. detailKeys: none.
- **`RESERVATION_LIMIT`:** "This action reserves at most {limit} Orders." / 此行动至多承接{limit}张. detailKeys `limit`, `requested`. The fallback stays.
- **`ORDER_NOT_HELD`:** made general for completion, the Cleanup trim and the swap: "That Order is not in your hand." / 这张委托不在你手中. detailKeys `orderId`.
- **`ORDER_SUPPLY_EMPTY`:** also returned when a swap's Select could reserve no Order. Since owner revision 3 that means no card to look at and no face-up Order; the text is "No Main Order shows on the display and the Main Order deck and discard pile are both empty; there is nothing to reserve." / 委托榜上没有主委托，主委托牌堆和弃牌堆也都空了，没有可承接的委托 (§14).
- **New `CONTRIBUTION_CARD_NOT_HELD`** (owner revision 3): "You do not hold that Contribution card; Fuel Ledger Bank and Fuel Ledger Stoke come with Fuel Ledger." / 你没有这张控火牌；柴簿压火与柴簿添柴随柴簿一起获得. detailKeys `card`.
- **`INVALID_CHOICE`:** detailKeys gain `slotIndex` and `cardIndex`.
- **New `TECH_TAKE_LIMIT`** (owner revision 2026-10-17): "This action takes at most {limit} Techs." / 此行动至多习得{limit}项技艺. detailKeys `limit`, `techId`; fallback "This action cannot take another Tech." / 此行动不能再习得技艺. A third Guild Hall take.
- **New `TECH_TAKE_REQUIRED`:** "Take at least 1 Tech." / 至少要习得1项技艺. detailKeys: none. `GUILD_FINISH` before any take (L144).
- A second take of the first take's discipline is `TECH_DISCIPLINE_OWNED`, an existing code: it is the 1-per-discipline limit (L210).

No other code is added. Errors still come from validators on views, so they cannot name hidden cards.

### 2.6 Content definitions

```ts
export interface LocationEffectsById {
  materials_yard: { apprentice: { resources: number }; shifu: { resources: number } };   // 3 / 6
  commission_market: {
    apprentice: { select: number; maxReservations: number };     // 2 / 1 (owner revision 3: `select`, was `lookSize`)
    shifu: { select: number; maxReservations: number };          // 3 / 2
  };
  guild_hall: { apprentice: { maxTechs: number }; shifu: { inspectCount: number; maxTechs: number } }; // 1 / 2, 2
  canal_wharf: {
    apprentice: { coins: number };                               // 2
    shifu: { coins: number; topMainOrders: number };             // 4, 1
  };
  // form_decorate, glaze_load, magistrates_hall unchanged
}

export interface TechParamsById {
  T10: { select: number; handLimit: number; swapDiscard: number; swapSelect: number };      // 3, 5, 1, 3 (owner revision 3; the swap looked at 2 before)
  T11: { floorQuality: "standard"; upgradeFrom: "standard"; upgradeTo: "fine" };
  T12: { freeCards: ContributionCardId[]; cards: ContributionCardId[] };                    // ["BANK", "STOKE"], ["FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"] (owner revision 3; was cardWood 0, extraWood 1, heat 1)
  T14: { extraCards: number; chosenCards: number };                                         // 2, 1
  T23: { coins: number };                                                                   // 2
  // others unchanged
}

/** Owner revision 3: the 5 Contribution cards in `firing.json`. */
export interface ContributionCardDefinition {
  id: ContributionCardId;
  woodCost: number;          // printed: Bank, Stoke and both Fuel Ledger cards 1, Tend 0
  heat: number;              // −1, 0, +1, −2, +2
  techId: TechId | null;     // "T12" for Fuel Ledger's cards
  name: string; nameZh: string;
  shortText: string | null; shortTextZh: string | null;   // the owner's text for Fuel Ledger's cards
}
```

`GameConfig.techs` loses `vpEach` (change 27).

### 2.7 View models and selector types (DESIGN §5.4)

```ts
/** Commission Market at placement time for one worker effect (public information only). */
export interface CommissionOptions {
  effect: WorkerEffect;
  n: 2 | 3;                  // owner revision 3: `n`, was `lookSize`
  /** Cards the look would show now: the deck's top n, or after the reshuffle the
   * empty deck forces (B1); 0 when the deck and the discard are both empty. */
  lookCount: number;
  maxReservations: 1 | 2;
  /** Display positions holding an Order. */
  faceUpSlots: number[];
  /** At least 1 reservation is possible (the placement's main action, L144). */
  reservable: boolean;
}

/** An order look awaiting its choice (own private look). */
export interface LookedOrderOptions {
  kind: "commission_market" | "colour_samples" | "colour_samples_swap";
  /** The Select's N (owner revision 3). */
  n: 2 | 3;
  orderIds: OrderId[];
  /** Display positions also reservable now, for every Select since owner revision 3 (it was
   * the Commission Market only). */
  faceUpSlots: number[];
  /** 1, or 2 for the Commission Market Shifu effect. At least 1 is always required. */
  maxReservations: 1 | 2;
}

export interface ColourSamplesSwapOptions {
  /** T10 owned and unused this round, in your before/after-action window, with a held Order. */
  usable: boolean;
  /** Per held Order, in hand order: the cards the look would show after discarding it;
   * `legal` also when the look shows none but a face-up Order can be reserved (owner revision 3). */
  discards: Array<{ orderId: OrderId; lookCount: number; legal: boolean }>;
  /** Display positions the Select 3 could reserve (owner revision 3). */
  faceUpSlots: number[];
}

export interface SecondFiringChoiceOptions {
  ceramicId: CeramicId;
  modifiers: [FireModifier, FireModifier];
  /** R7: Jun usable on this ceramic now (Jun Kiln, unused this round, 1 Wood). */
  jun: { ready: boolean; woodCost: number };
}
```

- `MaterialsYardOptions.shifuBonus` and `PreparedClayPair.withShifuBonus` are deleted.
- `OrderMatchOption.triggers` gains `canalBarge: boolean` (informational; it is never declined).
- `AfterQualityOption`: Saggars lists Standard ceramics only, with zero cost.
- `FiringStageView.extraFire` becomes `{ playerId; ceramicId; modifiers: FireModifier[] } | null` (non-null during `firing_second_firing_choice`). `FiringStageCeramic` gains `secondFireRevealed: FireModifier[] | null` and `saggarsFloor: boolean`. The key allow-list test (DESIGN §5.4) is updated with these keys. Both are physical facts on the table, not analysis (D3, D4).
- `GuildTechOption`: `price` and `printedCost` are replaced by `cost`, the printed cost every take pays (owner revision 2026-10-17). `reason` may be `TECH_TAKE_LIMIT`.
- `GuildInspectionOptions` (the viewer's open inspection): `discipline`; `inspected` (the untaken inspected Techs) and `faceUp` (the Techs showing now), each with the legality of taking it next; `takes`; `takesLeft` (2 − takes); `canFinish` (at least 1 take); `bottomOrderLength` (the untaken count). The `bottomOrderLengthIf…` fields are deleted.
- `CostLineKind` loses `guild_shifu_discount`.

---

## 3. Data changes (`data/*.json`)

Every file's `rulesVersion` becomes `"1.6.2"` (all ten files). `content.ts` (`RULES_VERSION`) and `roundStructure.ts` follow. Display text comes verbatim from the V1.6.2 files, as today. Ability cells come from Appendix B (L612–641), location cells from L164–229, and Chinese from the Chinese edition at the mapped lines.

### 3.1 `techniques.json`

| ID | Field | Value |
| --- | --- | --- |
| T18 Senior Apprentice | `cost` | 3 (L618) |
| T20 Kiln Tending | `cost` | 3 (L626) |
| T11 Protective Saggars | `cost`, `params` | 3; `{floorQuality: "standard", upgradeFrom: "standard", upgradeTo: "fine"}` (L636) |
| T12 Fuel Ledger | `cost`, `params` | 2; `{freeCards: ["BANK", "STOKE"], cards: ["FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"]}` (rev. 3 L634; owner revision 3 replaced `{cardWood: 0, extraWood: 1, heat: 1}`) |
| T10 Colour Samples | `oncePerRound`, `params` | `true`; `{select: 3, handLimit: 5, swapDiscard: 1, swapSelect: 3}` (rev. 3 L622; owner revision 3 replaced `lookSize` 3 and `swapLookSize` 2) |
| T14 Second Firing | `params` | `{extraCards: 2, chosenCards: 1}` (L639) |
| T23 Canal Barge | `timing`, `params` | `"order_completion"`; `{coins: 2}` (L630) |
| T10, T11, T12, T14, T23, T18, T20 | `ability`, `abilityZh` | V1.6.2 Appendix B cells (EN L618–639, ZH L620–641) |
| T10, T11, T12, T14, T23 | `shortText`, `shortTextZh` | V1.6.2 component text lines 42/44, 67/69, 74/76, 79/81, 89/91 with `**` removed (T10, T12 and T14 as owner revision 3 rewrote them) |

`timing` stays informational (DESIGN §6.5): T11 keeps `after_quality`, T10 keeps `when_acquired_and_ongoing`.

### 3.2 `action_locations.json`

| Location | `effects` | Text |
| --- | --- | --- |
| `materials_yard` | apprentice `{resources: 3}`; shifu `{resources: 6}` | Shifu L165 / ZH L167 |
| `commission_market` | apprentice `{select: 2, maxReservations: 1}`; shifu `{select: 3, maxReservations: 2}` | rev. 3 L201–202 / ZH L203–204 ("Select 2." / 精选2。; owner revision 3 renamed `lookSize` to `select`) |
| `guild_hall` | apprentice `{maxTechs: 1}`; shifu `{inspectCount: 2, maxTechs: 2}` | Shifu L207 / ZH L209 (owner revision 2026-10-17: no discount) |
| `canal_wharf` | shifu `{coins: 4, topMainOrders: 1}` | Shifu L220 / ZH L222 |

`content.ts` validation (DESIGN §6.9) checks these shapes. It adds Commission `select` ≥ `maxReservations` ≥ 1, and Guild Hall `maxTechs` 1 for the Apprentice and at least 1 for the Shifu. The Chinese location texts come from the glossary §4, which follows the Chinese rulebook (§4.5 陶工行 per the owner revision).

### 3.3 Short component text format

The V1.6.2 component text marks every timing clause in bold, including clauses after the first (T10 "Ongoing:" and "Once per round, before or after one of your worker actions:"; T11 "Once per round, after Quality is assigned:"; T12 "When you choose Bank or Stoke:"; GE "Orders:"). The data keeps plain text (bold removed, as today). `SHORT_TEXT_SECONDARY_LABELS` becomes exactly the set of non-first bold clauses of the V1.6.2 file:

- English: `Ongoing:`, `Orders:`, `Once per round, before or after one of your worker actions:`, `Once per round, after Quality is assigned:`, `When acquired:` (owner revision 3, T12; was `When you choose Bank or Stoke:`);
- Chinese: `持续：`, `完成委托时：`, `每轮一次，你的一次工人行动之前或之后：`, `每轮一次，定品后：`, `习得时：` (was `选控火时：`).

A contract test checks that `shortTextSegments(shortText)` reproduces the owner's bold spans for all 25 lines (23 before owner revision 3 added the 2 Fuel Ledger cards), in both languages. The header format of the component text also changed (`### Name / 中文名`, no IDs, no "- EN:" prefix), so the contract test's parser changes with it.

The Chinese T10 line was 82 characters after owner revision 2 (79 before), over the glossary's former 72-character cap; owner ruling R18 kept it and set the cap to 96 (§13). After owner revision 3 it is 53.

### 3.4 Clarifications (owner decision D10)

A new `docs/KILN_OPENING_v1.6.2_CLARIFICATIONS.md` replaces the V1.6.1 file as the data source (landed in stage 4; its "Revision notes (V1.6.2)" list what changed). Every `L` tag is renumbered (§1.1) to the revision-2 lines. `CLARIFICATION_TAG` accepts `R1`–`R19` (R19 since stage 6) and `P1`–`P3`. Content changes (the plan; the file records the result):

| Component | Change |
| --- | --- |
| `materials_yard` | R12 item: Senior Apprentice resolves the whole Shifu effect here, 6 resources (the 1-Coin option is gone) |
| `commission_market` | Delete `ED L714` (obsolete). Rewrite B1 (no blind reservation; looks see as many cards as remain, never completed from a reshuffle), B3 (top-2 and top-3 looks are private) and R12 · L652 (look at the top 3, reserve up to 2). INT Deferred refill: after any after-action Imperial Priority or Colour Samples swap. Add INT Commission Market looks (the look always happens) |
| `guild_hall` | B2 kept (bottom first, then the refill, which now comes at the end of the turn). Add L209 (a taken position stays empty until your turn ends; the Shifu's second Tech comes from what shows now), L212 (the same placement rule for both workers, at printed cost), L144 ("up to 2" is 1 or 2) and L213 (a when-acquired effect resolves before the second take) |
| `canal_wharf` | Add B1 (with both piles empty the Shifu takes no card but still gains 4 Coins) and B3 (the card goes to the hand, secret) |
| T10 | Delete `ED L391`. Add change 24 (the unreserved looked cards go to the deck bottom; it superseded R14), R17 (discard first, then look), INT Colour Samples swap (a Tech effect, L649), B1 and R16 for the swap look |
| T23 | Delete R6, INT Before/after-action window and INT Deferred refill. Add INT Canal Barge (automatic on your first completion each round) and L296 (Orders are completed only in the Order Phase) |
| T11 | L653 item rewritten (V1.6.2 Ge interplay); L280 item: your ceramics from this firing are never Flawed, so never salvaged; add INT Protective Saggars floor |
| T12 | No content change (renumber only) |
| T13 | L648 item: the reshuffle above a buried card now happens (R15) |
| T14 | R7 rewritten (Jun after the chosen card); L639: both extra cards are discarded |
| T18 | R12 and L198 · R12 items rewritten (V1.6.2 Shifu effects) |
| T25, RU, GU | Delete R6 references; completion is in the Order Phase only |
| GE | L653 item rewritten |

The clarification count test is re-baselined to the new file: 170 items. Owner revision 3 re-cited every `L` tag to revision-3 lines, added items for Select N (T10, `commission_market`) and the Fuel Ledger cards (T12), retired both A1 items and the T10 swap-look item, and rewrote the T10, T12, T18, `commission_market` and `guild_hall` items it changed; the count stays 170 (the file's revision notes list them).

### 3.5 Other data files

- `game_config.json`, `firing.json`, `kilns.json`, `imperial_progress.json`: only `rulesVersion` changes. The Fire deck and the Quality table are unchanged.
- `orders.json` (owner revision 2): the Starting deck is S01–S08 as A0 prints it (change 23; S09–S16 retired), and nineteen Main Orders take their Appendix A values (change 24). S07's "Carved, Impressed or Painted" is a new slot field, `decorations` (any one of, like `shapes`); the matcher, the content validator and the computer's Order model read it, and a Crackle ceramic's wildcard Decoration fills it (L470). `game_config.setupDeal` is unchanged: 2 Starting Orders each, so a 4-player game deals all 8.
- `components.json`: Starting Order Cards `qty` 8 (L84); Kiln Contribution Cards `qty` 14 (owner revision 3, L93). `round_structure.json`: `rulesVersion` only.
- `firing.json` (owner revision 3): `contributionCards` has the 5 cards with `techId` and the owner's short text for Fuel Ledger's. `game_config.json`: `techs.vpEach` is deleted (change 27).
- `asset_specs.json`: `orderCards` 8 Starting, 56 in all. Tech art briefs need no change (T23's barge still fits). Owner revision 3: `kilnContributionCards` lists `fuelLedgerCards`, 14 cards in all, one shared back.
- `action_locations.json`: the Commission Market texts take revision 2's "put the rest … on the bottom of the deck" (L195–196, Chinese L199–200). `techniques.json`: Colour Samples' `ability` and short texts likewise (L617; component text 42/44).

### 3.6 Fingerprint

`RULES_BEHAVIOUR_REVISION = 30`, with the history line: "30 -- V1.6.2: Commission Market looks (top 2 / top 3) with no resource and no blind reservation; Materials Yard Shifu 6; Guild Hall Shifu takes up to 2 Techs from different disciplines at printed cost, and Tech displays refill when the taker's turn ends (owner revision 2026-10-17); Canal Wharf Shifu draws the top Main Order; Colour Samples once-per-round swap; Canal Barge 2 Coins on completion; Protective Saggars floor and Standard → Fine; Fuel Ledger free Bank/Stoke; Second Firing best of 2; Fire reshuffle above buried cards (R15); owner revision 2 (changes 23–24): an 8-card Starting deck, nineteen re-valued Main Orders, and looked-at Orders not reserved go to the bottom of the Main deck instead of the discard (superseding R14). V1.6.1 (r29) rooms are rejected." The content digest moves with the data. Rooms store `r30-<digest>`. V1.6.2 is unreleased, so both owner revisions keep revision 30; their data changes (`guild_hall.effects`, `orders.json`) move the digest. The deck-bottom rule has no data field, so the history line records it.

Owner revision 3 changes the state and the commands, so it bumps the revision: `RULES_BEHAVIOUR_REVISION = 31`, `r31-<digest>`, with the history line "31 -- V1.6.2 owner revision 3 (changes 25–27, 2026-10-18), state schema 8: the keyword Select N …; Fuel Ledger as Contribution cards …; no Tech VP …" (`src/game/rulesFingerprint.ts`). `r30` rooms and schema-7 saves are refused, never migrated.

---

## 4. Module behaviour

### 4.1 `market.ts`

- `reservable(game)` returns `{ faceUpSlots: number[]; supply: boolean }`. `supply` is true when deck + discard > 0. The `blind` and `look` flags are deleted.
- New `lookCount(game: PublicGameState, size: number, extraDiscard = 0): number`: `counts.mainDeck > 0 ? min(size, mainDeck) : min(size, mainDiscard + extraDiscard)`. It mirrors `takeTopMainOrders` (B1, R16: reshuffle only when the deck is empty at the start of a look).
- New `discardHeldOrder(draft, playerId, orderId): "main_discard" | "box"`: removes the Order from the hand; a Main Order goes face down on the Main discard, a Starting Order goes to `startingBox` (L649, L303).
- New `putMainOrdersOnBottom(draft, ids, ctx)` (owner revision 2, change 24): puts a look's unreserved cards on the bottom of the Main deck in random order, shuffled with `ctx.rng` (owner ruling R19, which replaced provisional default P5, draw order); a single card consumes no draw. It refuses a Starting Order and a card already in the deck or the discard. `discardMainOrders` keeps the round-start rotation, the Cleanup trim and the swap's held Order.
- `takeTopMainOrders`, `drawMainOrder`, `refillMainDisplay`, `rotateMainDisplay`, `takeFaceUpOrder`: unchanged.

### 4.2 `work/commissionMarket.ts` (L191–200, L652, R12, B1, B3)

Owner revision 3: the look and the choice below are the shared Select model (`work/select.ts`, §14). The step records `select` (`n`, `maxReservations`, `fromDisplay`, `lookedCount`) in place of `lookSize`, `maxReservations` and `lookedCount`, and the choice is `SELECT_CHOOSE`.

`PLACE_COMMISSION_MARKET { workerId, seniorApprentice? }`

- **Validate:** `validatePlacement` (capacity, worker, Senior Apprentice only for an Apprentice with T18 ready). Then the main action (L144): `faceUpSlots.length > 0 || supply`, else `NO_MAIN_ACTION_POSSIBLE`.
- **Resolve:**
  1. `placeWorker`; `effect` from the placement.
  2. `orderIds = takeTopMainOrders(draft, EFFECTS[effect].select, ctx)`: may reshuffle (`MAIN_DECK_RESHUFFLED`) when the deck is empty; may return fewer cards, or none (B1).
  3. `hidden.pendingLook = { kind: "commission_market", playerId, orderIds }`. Emit `PRIVATE_LOOK_OPENED { kind, count, secret: { orderIds, techIds: [] } }`, even for 0 cards.
  4. `step = { kind: "commission_market", workerId, effect, select }`.

`SELECT_CHOOSE { reservations }` (was `COMMISSION_CHOOSE`)

- **Validate**, in this order:
  - the step and the active player;
  - 0 picks → `RESERVATION_REQUIRED`; more than `maxReservations` → `RESERVATION_LIMIT`;
  - two picks naming the same slot or the same looked card → `INVALID_CHOICE`;
  - a `face_up` pick: `display[slotIndex] === orderId`, else `ORDER_NOT_AVAILABLE`;
  - a `looked` pick: in `own.pendingLook.orderIds`, else `INVALID_CHOICE`.
- **Resolve**, picks in array order:
  - `face_up`: `takeFaceUpOrder` (position `null`, `refillPendingFor` set), `addToHand`, public `ORDER_RESERVED`;
  - `looked`: `addToHand`, secret `ORDER_RESERVED`.
  - Then the rest of the look goes face down to the bottom of the Main deck in random order (`putMainOrdersOnBottom`, change 24, R19), with `LOOKED_ORDERS_TO_BOTTOM` if any. `pendingLook = null`, then `ctx.flow.workerActionDone`.
- The deferred refill still runs in `endTurn` (DESIGN §3.2). Several face-up picks mean one refill (L390).
- No resource is gained.

### 4.3 `work/materialsYard.ts`, `work/centralSimple.ts`, `work/guildHall.ts`

- **Materials Yard:** the split must total `resources` (3 or 6). The quote order is split → Prepared Clay (L617 "after gaining resources"). `buyShifuBonus` and its cost line are deleted. Senior Apprentice gives 6.
- **Canal Wharf Shifu:**
  1. Gain 4 Coins (`canal_wharf`).
  2. `drawMainOrder` takes the top card, shuffling the discard first when the deck is empty (L510).
  3. If a card was drawn: `addToHand` and `ORDER_RESERVED { via: "canal_wharf", source: "deck_top", slotIndex: null, orderId: null, secret }`.
  4. With the deck and the discard both empty, no card is drawn and no event is emitted (B1).

  The placement stays always legal (L145). The Apprentice effect is unchanged.
- **Guild Hall** (owner revision 2026-10-17; L206–213, L714, B2):
  - **Price.** `techPrice(techId)` is the printed cost, for both workers. There is no discount in the data or the code.
  - **Legality** (`PLACE_GUILD_HALL`, L212). For the Apprentice and the Shifu alike, an affordable face-up Tech must show from a discipline the player does not own, within the 3-total limit; otherwise `NO_MAIN_ACTION_POSSIBLE`. A cheaper Tech the Shifu might find by inspecting does not count. The Apprentice names a face-up Tech (`buy_face_up`). The Shifu names any discipline to inspect, an owned or empty one included (B2).
  - **Apprentice:** pay, take the face-up Tech, grant it (Cover token, L211; Fuel Ledger's 2 Contribution cards; no VP since owner revision 3). Then Colour Samples' Select 3 if it was T10 and an Order can be reserved, else `workerActionDone`. No refill here.
  - **Shifu inspection:** `drawTechsForInspection` takes the top 2, or as many as remain, into `hidden.pendingLook`. The step is `guild_inspection` with `takes: []`.
  - **`GUILD_TAKE { take }`** checks, in this order:
    - the step;
    - fewer than 2 takes so far, else `TECH_TAKE_LIMIT`;
    - availability (a face-up Tech showing now, or an untaken inspected one), else `TECH_NOT_AVAILABLE`;
    - `acquisitionError`: the 3-total limit `TECH_LIMIT`, then 1 per discipline `TECH_DISCIPLINE_OWNED`, which enforces "different disciplines";
    - the printed cost, else `INSUFFICIENT_RESOURCES`.

    It resolves: pay; take (a face-up position stays empty, L209); grant (Cover token, Fuel Ledger's cards; no VP since owner revision 3); append to `step.takes`. Then the when-acquired effect. For Colour Samples, when an Order can be reserved, the Select 3 opens: the untaken inspected Techs move into the look's `inspection` and the step becomes `colour_samples` with `resume` = the inspection step. `SELECT_CHOOSE` reserves 1 (a looked card or a face-up Order), puts the rest under the deck, then restores the `guild_inspection` look and step. Otherwise the inspection continues.
  - **Closing by itself** (`decisionLeft`, public facts only, DESIGN §3.7, §4.5). After each take and after a resumed Colour Samples reservation, the action ends automatically when nothing is left to decide:
    - at least 1 Tech is taken;
    - at most 1 inspected Tech is untaken, so its bottom order is forced;
    - no second take can be legal on public facts: 2 takes made; or no affordable face-up Tech of an unowned discipline, and either no untaken inspected Tech or its discipline is owned (or 3 Techs are owned).

    When an untaken inspected Tech of an unowned discipline remains, the step stays open even if that Tech is too dear: its cost is private, so closing would reveal it. The player then sends `GUILD_FINISH`.
  - **`GUILD_FINISH { bottomOrder }`:** at least 1 take (`TECH_TAKE_REQUIRED`), and `bottomOrder` must list every untaken inspected Tech exactly once (`INVALID_BOTTOM_ORDER`). It puts them on the bottom in that order (`TECHS_RETURNED_TO_BOTTOM`, secret, B2), clears the look and ends the worker action.
  - **Deferred Tech refill** (`work/turn.endTurn`, L209). After the deferred Main display refill, every discipline is refilled to 2 as its deck allows, in `DISCIPLINES` order. Only a take this turn leaves a display short with cards in its deck, so this refills exactly the taker's disciplines. It runs after the after-action window and after the bottom order, which keeps B2's "return first, then refill". The Start of Round re-run stays, silent.
  - **Colour Samples when acquired** (L625, R4, B1; owner revision 3): a Select 3, mandatory when an Order can be reserved (a card to look at or a face-up Order), no resource. A face-up pick leaves its position empty until the end of the turn, then the Main display refills as usual. Its unreserved cards go to the bottom of the Main deck in random order (change 24, R19).

### 4.4 Colour Samples swap: `work/windowAbilities.ts` and `work/turn.ts`

`USE_COLOUR_SAMPLES_SWAP { discardOrderId }`, legal in `before_action` and `after_action` of your own Work turn.

- **Validate:**
  - `windowError` (the before/after window of your own turn);
  - T10 owned (`TECH_NOT_OWNED`) and unused this round (`TECH_ALREADY_USED`);
  - `discardOrderId` in `own.orderHand` (`ORDER_NOT_HELD`);
  - `selectReservable(game, swapSelect, isMain(discardOrderId) ? 1 : 0)`: a face-up Order shows or the look would show ≥ 1 card, else `ORDER_SUPPLY_EMPTY` (B1: the swap's reservation must take an available Order; owner revision 3 added the face-up option).
- **Resolve:**
  1. `markTechUsed(T10)`.
  2. `discardHeldOrder`; emit `HELD_ORDER_DISCARDED`.
  3. `openSelect(swapSelect = 3)`: `takeTopMainOrders(3)`, which may reshuffle a discard that now holds the Order just discarded (R17, INT Colour Samples swap); `pendingLook = { kind: "colour_samples_swap", … }`; emit `PRIVATE_LOOK_OPENED`.
  4. `step = { kind: "colour_samples_swap", returnTo: <the step it was used in>, select }`.

`SELECT_CHOOSE { reservations }` (owner revision 3; was `COLOUR_SAMPLES_SWAP_CHOOSE { orderId }`)

- **Validate:** the step; exactly 1 pick (`RESERVATION_REQUIRED`, `RESERVATION_LIMIT`); a looked pick in the look (`INVALID_CHOICE`) or a face-up pick still showing (`ORDER_NOT_AVAILABLE`).
- **Resolve:**
  1. `addToHand`; emit `ORDER_RESERVED { via: "colour_samples_swap", source: "looked", secret }`, or the public `source: "face_up"` one (the position stays empty until the turn ends).
  2. The rest of the 3 goes face down to the bottom of the Main deck in random order (change 24, R19); emit `LOOKED_ORDERS_TO_BOTTOM`.
  3. `pendingLook = null`; `step = { kind: returnTo }`.
  4. If `returnTo === "after_action"`, call `afterWindowAbilityUsed`, which rechecks the window and ends the turn when nothing is left.

The swap is a Tech effect, not a Commission Market action (L649). It never touches the worker or Senior Apprentice. Since owner revision 3 it may take a face-up Order, refilled at the end of the turn like any other.

`work/turn.ts`:

- `afterActionWindowOpen(game, pid) = imperialPriorityUsable(game, pid) || colourSamplesSwapUsable(game, pid)`.
- `colourSamplesSwapUsable = ownsTech(T10) && techReady(T10) && handCount(pid) ≥ 1`. Both facts are public; the hand's content and the supply are deliberately ignored, so opening the window reveals nothing (DESIGN §4.5). The validator decides whether a particular discard works.
- `CANAL_BARGE` is removed from `turn.ts`.
- `endTurn` still runs the deferred refill after the window. A swap after a Commission Market action may discard an Order that action reserved, and its look takes deck cards before the refill does (INT Deferred refill).

Window order: the swap and Imperial Priority may be used in either order, before or after the worker action. The swap is once per round across all of a player's windows.

### 4.5 `firing/fireDeck.ts`: the reshuffle with buried cards (L511, L648, L657, R15)

```ts
/** Before a card is needed (peek, round reveal, Second Firing reveal): if every card left is
 * buried (fireDeck.length === fireBuried, an empty deck included) and the discard is not
 * empty, shuffle the open discard and put it on top, above the buried cards. */
function prepareTop(draft, ctx): void {
  const hidden = draft.hidden;
  if (hidden.fireDeck.length > hidden.fireBuried || draft.fireDiscard.length === 0) return;
  const shuffled = shuffle(draft.fireDiscard, ctx.rng);
  hidden.fireDeck = [...shuffled, ...hidden.fireDeck];
  draft.fireDiscard = [];
  emit(ctx, { type: "FIRE_DECK_RESHUFFLED", cardCount: shuffled.length, buriedBelow: hidden.fireBuried });
}
```

- **`drawFire`:** `prepareTop`, then `shift`. If the drawn card was buried (only buried cards were left and the discard was empty), `fireBuried -= 1`. That case is unreachable in play: it needs 7 or more cards out of the deck and discard at once.
- **`peekFire`:** `prepareTop`, then read index 0.
- **`buryTopFire`:**
  - if the top card is not buried (`length > fireBuried` before the move), move it to the bottom and `fireBuried += 1`;
  - otherwise (every card is buried) move it to the bottom and leave the count unchanged.
- The invariant "deck and discard both empty" stays an engine bug. At most 3 cards are ever out (the round's card and two Second Firing cards), so 9 or more remain.
- The reshuffle is the only RNG use, as before.

Reachability: 1 card per firing plus 2 for Second Firing gives 3 a round. Rounds 1–3 can use 9 cards and round 4 the last 3, so round 5's reveal reshuffles. A bury in round 4 forces the reshuffle in round 4, when the buried card would otherwise be the only card left. The V1.6.1 editorial note "the bury clause can never apply" (1.6.1:L649) is retired.

### 4.6 Canal Barge: `orders/completion.ts` (L630, INT Canal Barge)

- `resolveOrderCompletion(draft, pid, spec, ctx)` loses `via`.
- `useBarge = techReady(owner, T23)`, computed before the record. `record.canalBargeCoins = useBarge ? 2 : 0`.
- After Ru/Guan: `markTechUsed(T23)`, then `gain(coins: T23.params.coins, reason: "canal_barge")`.
- It is automatic, never declined (INT Canal Barge: deferring it could only move the same 2 Coins to a later completion of the same Order-Phase turn).
- `completionTriggers` gains `canalBarge`. `orders/phase.ts` calls without `via`.
- `work/windowAbilities.ts` loses `USE_CANAL_BARGE`.

### 4.7 Quality with Protective Saggars: `firing/heat.ts`, `firing/pipeline.ts`

- New pure `qualityFor(heatDifference: number, neverFlawed: boolean): Quality`. It returns `qualityForDifference(d)`, except Standard when `neverFlawed` and the raw result is Flawed (L636). `content.ts` keeps `qualityForDifference` (the printed table).
- `saggarsProtects(game, ownerId) = ownsTech(player(game, ownerId), "T11")`. Owning the Tech is enough; the floor has no allowance.
- **Step 9:** each ceramic's Quality is `qualityFor(first.heatDifference, saggarsProtects(owner))`. It covers the Shared and Imperial Kilns (L650), after Jun. `record.saggarsFloor` and `QUALITY_ASSIGNED.saggarsFloor` record when the floor applied. `heatDifference` stays the real difference.
- The Second Firing recalculation uses the same function (unreachable for the Saggars owner, §1).
- Ceramics fired in earlier rounds keep their Quality (L650).
- `heatPreviews` (computer only, D3) applies the floor to the owner's ceramics.

### 4.8 `firing/afterQuality.ts`

- **Protective Saggars** (`USE_PROTECTIVE_SAGGARS`):
  - Validate: owned, unused (`TECH_ALREADY_USED`), your ceramic from this firing whose Quality is exactly Standard. Otherwise `INVALID_TARGET` with the message "Choose one of your Standard ceramics from this firing." No Wood.
  - Resolve: `markTechUsed`, Standard → Fine (`QUALITY_IMPROVED{cause: "protective_saggars"}`).
  - After-Quality queue eligibility: T11 ready and ≥ 1 own Standard ceramic.
  - The Wood check and `SAGGARS_STEP.flawed` are deleted. A floored Standard is a legal target.
- **Ge:** unchanged code. Tests prove both directions of L653.
- **Salvage:** a Saggars owner's ceramics from this firing are never Flawed, so they never enter `firing_salvage`.

### 4.9 `firing/contributions.ts`, `firing/heat.ts`: Fuel Ledger (L637; owner revision 3, rev. 3 L634)

Owner revision 3 (change 26) replaced the commitment with 2 cards. As landed in stage 7:

- `grantTech(T12)` adds `FUEL_LEDGER_BANK` and `FUEL_LEDGER_STOKE` to `PlayerState.contributionCards` and emits `CONTRIBUTION_CARDS_GAINED`.
- `validateContribution`: the card must be in `contributionCards` (`CONTRIBUTION_CARD_NOT_HELD`), then affordable (`INVALID_CONTRIBUTION`, details `card`, `needed`, `have`).
- `contributionWood(card, ownsFuelLedger)`: 0 for a card in `T12.params.freeCards` (Bank, Stoke) when the submitter owns T12, else the printed cost; Fuel Ledger's cards cost their printed 1 Wood. `contributionHeat(card)` is the printed heat: −1, 0, +1, −2, +2.
- `legalContributions` lists the held cards in the order Tend, Bank, Stoke, Fuel Ledger Bank, Fuel Ledger Stoke.
- `RevealedContribution` is `{ card, heat, woodPaid }`.
- The stores keep `card` only; a stored or submitted payload with a `fuelLedger` key is refused (§9).

Before revision 3: the card's cost was `cardWood` (0) for Bank and Stoke when the submitter owned T12, plus `extraWood` (1) with the secret `fuelLedger` commitment, which made them ±2.

### 4.10 Second Firing: `firing/afterQuality.ts` (L639, R7)

`USE_SECOND_FIRING { ceramicId }`

- **Validate:** unchanged: owned, unused, your Flawed or Standard ceramic from this firing.
- **Resolve:**
  1. `markTechUsed(T14)`.
  2. `a = drawFire()`, `b = drawFire()`, each through `prepareTop` (§4.5).
  3. `firing.pendingExtraFire = { playerId, ceramicId, modifiers: [a, b] }`; emit `SECOND_FIRING_REVEALED`.
  4. `phase = { type: "firing_second_firing_choice", actorId, ceramicId }`.

`SECOND_FIRING_CHOOSE { cardIndex, jun }` (phase `firing_second_firing_choice`, the actor only)

- **Validate:** when `jun` is non-null: Jun Kiln (`KILN_ABILITY_NOT_OWNED`), unused (`ABILITY_ALREADY_USED`), 1 Wood (`INSUFFICIENT_RESOURCES`).
- **Resolve:**
  1. `chosen = modifiers[cardIndex]`.
  2. `record.second = heatCalculation({ fireModifier: chosen, heatSource: (imperial ? kilnDie : baseHeat) + chosen, positionModifier: first.positionModifier, heatMarker: first.heatMarker, junAdjustment: 0 })`; `record.secondFiringCards = [a, b]`; emit `SECOND_FIRING_CHOSEN`.
  3. If `jun`: spend 1 Wood, `markKilnAbilityUsed`, `withJunAdjustment`, emit `JUN_ADJUSTED{during: "second_firing"}`.
  4. The new Quality is `qualityFor(second.heatDifference, saggarsProtects(owner))`. It replaces the old one even if worse (`QUALITY_ASSIGNED{cause: "second_firing"}`).
  5. Discard both cards face up, in reveal order (`a`, then `b`); `pendingExtraFire = null`.
  6. Return to `firing_after_quality` with `[actorId, ...later eligible players]`, as `resolveSecondFiringJun` does today, then `afterAbilityUsed`.

The choice step always opens: a card must be chosen even when Jun is not available. The rule order is reveal 2 → choose 1 → recalculate → R7 Jun → Quality → discard both. One command carries the card and Jun because the player knows everything at that point (DESIGN §1 principle 4). `firing_second_firing_jun` and `resolveSecondFiringJun` are deleted, and `RESOLVE_JUN` is legal only in `firing_heat_adjustment`.

### 4.11 Other engine modules

- **`setup.ts`:** `schemaVersion: 8` (7 before owner revision 3); `hidden.fireBuried: 0`; each player's `contributionCards` start as Bank, Tend and Stoke; the score ledger has no `techs`.
- **`round.ts`:** `readyAllAbilities` now readies T10's swap, through its `oncePerRound` flag.
- **`techs.ts`:** `handLimit` is unchanged. `techPrice(techId)` is the printed cost; its `WorkerEffect` parameter is deleted (owner revision 2026-10-17).
- **`work/turn.ts`:** `endTurn` refills the Tech displays after the Main display (§4.3, L209).
- **`market.ts`:** `takeFaceUpTech` no longer implies a refill; `refillTechDisplay` is called at setup, at each turn end and at the Start of Round.
- **`firing/pipeline.ts`:** `TEST_PIECES_BURY` uses the counting `buryTopFire`. The Fire reveal uses `prepareTop`.
- **`view.ts`:** `publicCounts` adds `fireBuried` and counts `orderIds` for every order-look kind.
- **`state.ts`:** `decisionPrompt` gets the new phase type. New `lookOrderIds(look)` and `lookTechIds(look)` give the cards a pending look holds, including the Guild inspection that waits in a Colour Samples look; conservation checks and test fixtures use them.
- **`engine.ts`:** the handler table follows §2.3.
- **`index.ts`:** the barrel exports `colourSamplesSwapOptions` and `secondFiringChoiceOptions` and drops `canalBargeOptions`.
- **`kilnLoading.ts`, `recognition.ts`, `scoring.ts`:** unchanged. Coins count at the end as before.

### 4.12 `invariants.ts` (DESIGN §8.3)

Changed or new checks:

- **Fire conservation:** deck + discard + `firing.fireModifier` + both `pendingExtraFire.modifiers` = the 12-card distribution. `0 ≤ hidden.fireBuried ≤ fireDeck.length`.
- `pendingExtraFire !== null` iff the phase is `firing_second_firing_choice`, with matching actor and ceramic. The Fire card is revealed in `firing_heat_adjustment`, `firing_after_quality`, `firing_second_firing_choice` and `firing_salvage`.
- **Order conservation:** Order zones include `pendingLook` of the kinds `commission_market`, `colour_samples` and `colour_samples_swap`.
- **Step and look agree:** `commission_market` ⇔ look kind `commission_market` with `select.lookedCount` cards; `colour_samples_swap` ⇔ look kind `colour_samples_swap`; `colour_samples` ⇔ look kind `colour_samples`. Owner revision 3: each Select step's `select` matches its source (`n`, `maxReservations`, `fromDisplay`).
- **Contribution cards** (owner revision 3): every player holds Bank, Tend and Stoke, plus Fuel Ledger's 2 exactly when they own T12; a revealed contribution names a held card with its printed heat and the Wood it cost. The score ledger has no `techs` line.
- **Guild Hall inspection** (owner revision 2026-10-17):
  - the look's discipline is the step's, and it holds `inspectedCount` less the inspected takes;
  - at most `maxTechs` (2) takes, of pairwise different disciplines, each owned by the active player, and an inspected take is of the inspected discipline;
  - the step's worker is the Shifu at the Guild Hall;
  - `colour_samples.resume !== null` ⇔ the look's `inspection !== null`; a resumed step's takes include Colour Samples, and its waiting Techs pass the same checks.
- **Tech conservation** counts the untaken inspected Techs wherever they wait (`lookTechIds`).
- **Deferred Tech refill** (L209): outside a Work turn's `guild_inspection`, `colour_samples` and `after_action` steps, every discipline shows min(2, display + deck) Techs.
- **Saggars floor:**
  - no firing record of a T11 owner has Quality Flawed;
  - no Finished ceramic has Quality Flawed when its owner acquired T11 in or before its `firedInRound`;
  - `saggarsFloor ⇒ owner owns T11 ∧ quality ∈ {standard, fine}`.
- **Canal Barge:** per player and round, at most one completed record with `canalBargeCoins: 2`, and only for a T23 owner.
- Removed: the `via` check and the `firing_second_firing_jun` checks.

### 4.13 Selectors and legal actions (DESIGN §5)

Selectors:

- `commissionOptions(view, effect)` follows §2.7.
- `lookedOrderOptions(view)` covers the three order looks.
- New `colourSamplesSwapOptions(view)` and `secondFiringChoiceOptions(view)`.
- `canalBargeOptions` is deleted.
- `materialsYardOptions` has no bonus. `afterQualityOptions` uses the Saggars rules (§4.8). `contributionOptions` gives Fuel Ledger's free cards.
- `firingStageView` and `firingRecapView` follow §2.7.
- `placementOptions` probes `PLACE_COMMISSION_MARKET{workerId}`.
- `guildOptions(view, effect)` prices every Tech at its printed cost for both effects; `guildInspectionOptions(view)` follows §2.7 (owner revision 2026-10-17).
- `heatPreviews` applies the floor.

No selector shows a Quality preview for the Second Firing choice or the Commission cards (D3). The UI shows the cards; the computer evaluates them.

`legalActions` families (canonical = exhaustive unless noted):

| Family | Candidates |
| --- | --- |
| `PLACE_MATERIALS_YARD` | splits 0..3 or 0..6 × Senior Apprentice × Prepared Clay (no bonus toggle) |
| `PLACE_COMMISSION_MARKET` | one per worker option (Shifu, Apprentice, Apprentice via Senior Apprentice) |
| `SELECT_CHOOSE` (was `COMMISSION_CHOOSE`) | every Select: every single pick (face-up slots ascending, then looked cards in look order) and, for `maxReservations` 2, every unordered pair in that order (≤ 9 + 36) |
| `GUILD_TAKE` | while fewer than 2 takes: each untaken inspected Tech, then each face-up Tech in `DISCIPLINES` order (≤ 2 + 6) |
| `GUILD_FINISH` | after at least 1 take: every permutation of the untaken inspected Techs (≤ 2) |
| `USE_COLOUR_SAMPLES_SWAP` | one per held Order, in hand order |
| `COLOUR_SAMPLES_CHOOSE`, `COLOUR_SAMPLES_SWAP_CHOOSE` | removed (owner revision 3): `SELECT_CHOOSE` |
| `SECOND_FIRING_CHOOSE` | `cardIndex` 0, 1 × `jun` {null, +1, −1 when ready} |
| `COMPLETE_ORDER` | unchanged; `triggers.canalBarge` is informational |
| removed | `USE_CANAL_BARGE`, `COMMISSION_RESERVE`, `COMMISSION_CHOOSE_LOOKED`, `COMMISSION_GAIN`, `COMMISSION_STOP` |

`sampleLegalAction` builds Select picks from `lookedOrderOptions`, Guild Hall takes and finishes from `guildInspectionOptions`, and Second Firing choices from `secondFiringChoiceOptions`. `legalActionFamilies` lists the new families. The agreement property (DESIGN §5.4) covers every new selector.

---

## 5. Legality: "at least 1 instance of the main action" (L144)

| Location | V1.6.2 placement is legal when |
| --- | --- |
| Materials Yard | always (3 or 6 resources) |
| Form & Decorate | unchanged (L174, R4) |
| Glaze & Load | unchanged (L185, R5) |
| Commission Market (either effect) | a display position holds an Order, or the Main deck plus discard is non-empty. Either way at least 1 reservation exists: a non-empty supply means the look shows at least 1 card (B1) |
| Guild Hall | Apprentice and Shifu alike: an affordable face-up Tech of a discipline you do not own, at printed cost, within the 3-total limit (L212; owner revision 2026-10-17). It also guarantees the Shifu's first take |
| Canal Wharf | always (L145); the Shifu's card is drawn only if one is available (B1) |
| Magistrate's Hall | unchanged |

Tech effects in the window (the swap, Imperial Priority) are not placements. Their validators are in §4.4 and DESIGN §3.2.

## 6. Progress guarantee and automatic steps (DESIGN §3.6, §3.7)

| Step | Always-legal exit |
| --- | --- |
| `commission_market` | `SELECT_CHOOSE` with one pick: placement legality guarantees a display Order or a looked card |
| `guild_inspection` | before a take: `GUILD_TAKE` of the face-up Tech placement legality guaranteed (the display does not change during the inspection); after a take: `GUILD_FINISH` with the untaken inspected Techs in any order |
| `colour_samples` | `SELECT_CHOOSE`: opened only when a looked card or a face-up Order can be reserved; then the worker action ends, or the Shifu's inspection resumes |
| `colour_samples_swap` | `SELECT_CHOOSE`: the validator guaranteed a looked card or a face-up Order |
| `after_action` | `END_TURN` (the window can open for the swap with no workable discard; the player ends the turn) |
| `firing_second_firing_choice` | `SECOND_FIRING_CHOOSE{cardIndex: 0, jun: null}` |

Automatic, never declined:

- Canal Barge's 2 Coins (INT Canal Barge);
- Saggars' floor (INT Protective Saggars floor);
- Fuel Ledger's free cards (a cost);
- the end of a Guild Hall Shifu's action when no decision is left on public facts (§4.3), with its forced bottom order of 0 or 1 Tech;
- the deferred Tech refill at the end of the taker's turn (L209).

The Commission look is mandatory (INT Commission Market looks). A Shifu's second Guild Hall take is optional (L207 "up to 2").

## 7. Hidden information (DESIGN §4)

Secret inventory, rows changed or added:

| Secret | Lives in | Visible to | Public projection |
| --- | --- | --- | --- |
| Commission Market look, top 2 or 3 (L195–196, B3) | `hidden.pendingLook` (`commission_market`); `PRIVATE_LOOK_OPENED.secret` | Actor | `counts.pendingLook {playerId, kind, count}` |
| Colour Samples swap look, top 3 since owner revision 3 (top 2 before; L625, B3) | same (`colour_samples_swap`) | Actor | same |
| The held Order discarded for the swap | Main discard (face down) or the box; `HELD_ORDER_DISCARDED.secret` | Owner | `to`, counts |
| Looked reservations (Commission, Colour Samples, swap) | hand; `ORDER_RESERVED.secret` | Owner | `via`, `source: "looked"` |
| Guild Hall inspection, untaken Techs (L207, B2), also while they wait behind the Shifu's Colour Samples look | `hidden.pendingLook` (`guild_inspection`, or `colour_samples.inspection`) | Actor | the step's discipline, `inspectedCount` and `takes`; `counts.pendingLook` |
| The Guild Hall bottom order (B2) | `TECHS_RETURNED_TO_BOTTOM.secret`; the `GUILD_FINISH` command | Actor | `count` |
| The Canal Wharf Shifu's card (L220) | hand; `ORDER_RESERVED{source: "deck_top"}.secret` | Owner | count |
| Unreserved looked cards (L195–196, L625, change 24) | the bottom of the Main deck; `LOOKED_ORDERS_TO_BOTTOM.secret` | Actor | count (and `counts.mainDeck`) |
| Commands carrying secrets | `private.game_commands` | Server | never published: `SELECT_CHOOSE` (owner revision 3; was `COMMISSION_CHOOSE` and `COLOUR_SAMPLES_SWAP_CHOOSE`), `USE_COLOUR_SAMPLES_SWAP` (names a held Order), `GUILD_FINISH` (the bottom order), `SUBMIT_CONTRIBUTION` |
| A sealed Contribution card, Fuel Ledger's included (owner revision 3) | the private submission row | Owner, until every participant has submitted | the submission count |

Rows that no longer exist: the blind reservation and the Commission Shifu's "top-3 selection".

Public: the number of Orders each look shows, the face-up picks (of every Select since owner revision 3), each player's `contributionCards` (owning Fuel Ledger is public), `fireBuried`, both Second Firing cards (they are revealed, L639), `saggarsFloor`, and `canalBargeCoins`.

Inference channels (DESIGN §4.5):

- **The after-action window** opens for the swap on public facts only (T10 ready, hand count ≥ 1). It reveals nothing about the hand or its Starting/Main mix.
- **The Commission look** always happens and always opens a step, whatever the cards, so neither its timing nor the step leaks.
- **The Guild Hall inspection closing by itself** (owner revision 2026-10-17) uses public facts only: the takes, Coins, owned Techs and the face-up display, never the cost of an untaken inspected Tech. Two tables that differ only in that cost close or stay open alike (`privacy_guild.test.ts`).
- **`HELD_ORDER_DISCARDED.to`** shows whether a Starting or a Main Order was discarded. This is public at the table too: the card goes to the box or the discard pile.

## 8. Determinism and randomness (DESIGN §7)

- The setup draw order is unchanged.
- New mid-game randomness:
  - Fire reshuffles (R15);
  - Main deck reshuffles at the start of more looks;
  - the Canal Wharf Shifu's draw;
  - the order of several looked cards put under the Main deck (R19).
- Each happens only when a card is needed or cards go under the deck, through `RandomSource`.
- Recorded command logs from V1.6.1 do not replay under V1.6.2. Determinism tests record their logs at run time, so they are unaffected.

## 9. Platform and versioning

- **`src/multiplayer/types.ts`:** `StoredRulesVersion` gains `"1.6.2"`; `CurrentRulesVersion = "1.6.2"`; `ComputerPolicyVersion = \`rules-v1.6.2-${string}\``; the legacy list keeps `rules-v1.6.1-…` labels as history.
- **`service.ts`:** `CURRENT_RULES_VERSION = "1.6.2"`, schema 8 (7 before owner revision 3). The messages say V1.6.2. A V1.6.1 room is refused by version (`UNSUPPORTED_RULES_VERSION`) and by its `r29` fingerprint (`RULES_FINGERPRINT_MISMATCH`); nothing is migrated.
- **`projection.ts`, `inMemoryStore.ts`, `client.ts`, `store.ts`:** the pins become `1.6.2`, schema 8, `^r31-[0-9a-f]{16}$` and `^rules-v1\.6\.2-…$` (schema 7 and `r30` before owner revision 3). Owner revision 3: the private-submission card set is the 5 cards, and a payload with a `fuelLedger` key is refused.
- **`computerPolicy.ts`:** `rules-v1.6.2-strategic-001` and `rules-v1.6.2-canonical-001`, labelled "V1.6.2 Strategic" and "V1.6.2 Canonical".
- **`src/playtest/*`:** Form V3 with `rulesVersion: "1.6.2"`. The form structure is unchanged: Fuel Ledger's −2/+2 is still recorded as `bank_2`/`stoke_2`.
- **Supabase, nothing deployed.** The pins are edited in place in the undeployed migrations, keeping their file names:
  - `202610150001_v161_rules.sql`: `'1.6.1'` → `'1.6.2'`, `^r29-` → `^r30-` (`^r31-` and schema 8 since owner revision 3), the policy regex → `rules-v1\.6\.2-`, comments; owner revision 3: the 5-card set, a payload with `fuelLedger` refused, and no `use_fuel_ledger` column use;
  - `202610150002_playtest_v161.sql`: `'1.6.1'` → `'1.6.2'` in the version list and the Form V3 check;
  - `supabase/tests/rls.test.sql`, `supabase/README.md` and `supabase/functions/_shared/supabaseStore.ts` comments follow.

  The private-submission card checks were unchanged until owner revision 3, which extended them to the 5 cards and dropped the commitment flag (`supabase/tests/rls.test.sql`, plan 29).
- **`tools/`** (platform config; must keep compiling):
  - `uiFixtures.ts`: fixture m1 drops `buyShifuBonus`; m2 places and then sends `COMMISSION_CHOOSE` (`SELECT_CHOOSE` since owner revision 3); the second-reservation steering is replaced; m12's description names the Shifu's 2 takes at printed cost and `GUILD_FINISH`; m17 steers to Colour Samples (T10) and the swap instead of Canal Barge; m18 becomes the Second Firing choice. `npm run fixtures` regenerates the outputs in the UI stage.
  - `fixturePrivacy.ts`: works for the new look kinds (it reads `orderIds`), and for a Guild inspection waiting in a Colour Samples look (`inspection.techIds`); the swap's discarded Order is a secret ID of every other seat even when it was reserved face up (stage 6: the oracle replays the log, so an ID that moved unseen is `rehidden`).
  - `localBackendV161.ts`: comments.
- **`src/app`:** not part of this track. `npm run typecheck` (app config) may fail until the UI stage.

## 10. Computer policy (`src/multiplayer/computerPlayer.ts`, `computerFallback.ts`)

The policy reads only its `ActorView` (unchanged). Changes:

1. **Materials Yard:** the Shifu or Senior Apprentice total is 6. Delete the bonus branch in `absApply` and `buildMaterialsYard`.
2. **Commission Market:**
   - `buildCommission` yields one `PLACE_COMMISSION_MARKET` per worker option.
   - The planner's `cmValue[effect]` = expected value of the best (Apprentice) or best two (Shifu) Orders among the display and `lookCount` unknown cards. Use `reservationValue` and `expectedBestOf`, counting the second only when it clears the overflow threshold (`reservationOverflows`: 2.2 / 1.2).
   - Delete `cmSecond`, `next.coins += 1` and `neededResource`'s Commission use.
   - A new `decideCommissionChoice` ranks display slots and looked cards by `reservationValue(k, orderId, pending)`: 1 pick, or for the Shifu a second pick that clears the threshold.
3. **Canal Wharf Shifu:** value = 4 Coins plus the expected value of a random unseen Main Order (`expectedBestOf(k, 1)`), less the overflow cost.
4. **Guild Hall** (owner revision 2026-10-17):
   - every price is the printed cost (`GuildTechOption.cost`); `shifuTechPrice` is deleted;
   - `guildShifuValue` values the visit as the better of 1 take and 2 takes from different disciplines that the Coins cover (at most one of them an estimate of the inspected deck), counting a second only above `SECOND_TECH_THRESHOLD` (0.5), and names the deck to inspect;
   - `decideGuildTake` ranks the first take with the best affordable second take of another discipline, takes a second Tech only above the threshold, and otherwise sends `GUILD_FINISH` with the untaken Techs in look order.
5. **Colour Samples swap:**
   - In both windows: if T10 is ready and the hand is non-empty, take the held Order with the lowest `reservationValue` under the current plan. Gain = `expectedBestOf(k, lookCount)` − its value − 0.1; swap when the gain > 0.3.
   - `decideColourSamplesSwap` reserves the best looked card.
   - `techValue(T10)` adds the per-round swap value.
6. **Canal Barge:**
   - delete the `windowAbility` branch and `bestCompletion(…, "USE_CANAL_BARGE")`;
   - `completionReward` adds `2 × coinValue` (or exact Coin VP after the last Work Phase) to the first completion of the round while T23 is ready;
   - `techValue(T23)` = 2 Coins × P(≥ 1 completion a round).
7. **Protective Saggars:**
   - `qualityAt` takes a `neverFlawed` flag for the seat's own ceramics (and rivals' when modelling them), floored at Standard;
   - `aimedQualityP` and `loadedQualityP` use it;
   - `decideAfterQuality` offers Saggars on Standard ceramics only, with no Wood term, and prefers a ceramic Ge will not crackle;
   - `techValue(T11)` is re-weighted for the floor.
8. **Fuel Ledger:** `contributionOptions` already carries the 0-Wood cost, so `decideContribution` follows. `techValue(T12)` is re-weighted.
9. **Second Firing:**
   - `decideAfterQuality` values T14 as the expectation over the next two cards, drawn without replacement, of the better card (with Jun ±1 when ready and affordable);
   - the distribution of the next card is the unseen deck (`unseenFire`, both pending modifiers removed). When no unburied card is left (`counts.fireDeck − counts.fireBuried < needed`), the remaining draws come from the discard multiset (R15);
   - a new `decideSecondFiringChoice` evaluates both cards × Jun options exactly and picks the best (Jun's Wood at `woodValue`).
10. **Test Pieces:** `nextFireDist` and `extraFireDist` apply the same R15 model.
11. **Fallback (`computerFallback.ts`):**
    - `commission_market` → the first `lookedOrderOptions` pick (the first face-up slot, else the first looked card);
    - `guild_inspection` → before a take, every legal `GUILD_TAKE` (placement legality guarantees one); after a take, `GUILD_FINISH` with the untaken inspected Techs in look order (always legal);
    - `colour_samples_swap` → the first looked card;
    - `firing_second_firing_choice` → `{cardIndex: 0, jun: null}`;
    - the `COMMISSION_GAIN`/`STOP`/`RESERVE` branches and `firing_second_firing_jun` are deleted.

12. **Rivals and the Fire model (stage 5):**
    - `rivalPushDist`: a Fuel Ledger rival may Bank or Stoke with 0 Wood and hesitates less to (its Wood cards are free, L629); a Protective Saggars rival's loads are valued floored at Standard (L628);
    - `decideContribution`, `rivalPushDist` and `targetBase` take the round's card from `nextFireDist` (R15), like Test Pieces and loading;
    - item 5's look is valued with `expectedBestOf(k, lookCount, −1)`: the swap keeps the hand size, so it carries no overflow cost.

13. **Select N (owner revision 3):** one `decideSelect` for the three Select steps ranks display slots and looked cards by `reservationValue`; the swap's Select is valued with `expectedBestWithDisplay` (the best of the display and the looked cards), and its pending discard counts −1 to the hand.
14. **Fuel Ledger cards (owner revision 3):** `decideContribution` chooses among the affordable held cards from `contributionOptions` (up to 5), with the small penalty (0.05) the commitment had now on a Fuel Ledger card, so a ±2 is played only when clearly better than the plain card; the rival model gives a Fuel Ledger rival with 1 Wood the ±2 cards; `techValue(T12)` is 0.4 a round (was 0.35).
15. **No Tech VP (owner revision 3):** `techValue` no longer adds `vpEach`; the fallback sends `SELECT_CHOOSE` for every Select step and `SUBMIT_CONTRIBUTION` with `TEND` and no flag.

AI weights are heuristics, not game data; changing them changes no rule. `computer_strength.test.ts` thresholds are re-baselined if needed, with the reason recorded.

---

## 11. Test plan

### 11.1 Engine (`test/v161/engine`)

| File | New or changed cases |
| --- | --- |
| `commission_market.test.ts` (rewrite) | Apprentice: a private top-2 look at placement; 1 face-up pick (position empty until the turn ends, one refill) or 1 looked pick (no refill); the rest of the 2 face down to the deck bottom in random order (change 24, R19); no resource; 0 picks `RESERVATION_REQUIRED`, 2 picks `RESERVATION_LIMIT`. Shifu: top-3 look; 1–2 picks in any mix (2 face-up → one refill, L390; 2 looked; 1 + 1); the rest of the 3 to the deck bottom. Senior Apprentice = Shifu effect, once per round, Apprentice only. Stale face-up pick `ORDER_NOT_AVAILABLE`; a pick outside the look or a duplicate `INVALID_CHOICE`. Privacy: the look and looked picks reach only the actor; the public sees counts and face-up IDs |
| `placement_legality_commission.test.ts` | legal with only display Orders, with only a supply, illegal with neither (`NO_MAIN_ACTION_POSSIBLE`); both effects and Senior Apprentice |
| `market.test.ts` | `reservable`, `lookCount` (deck > 0, deck 0 with discard, both empty, `extraDiscard`), `discardHeldOrder` (Main → discard face down, Starting → box), `putMainOrdersOnBottom` (random order from the seeded RNG, R19, and no draw for 1 card; refuses a Starting Order, a duplicate and a card already in the deck or the discard) |
| `order_matching.test.ts` | every one of the 8 Starting and 48 Main Orders: a passing set and a near miss. S07 (change 23): Carved, Impressed and Painted each fill it at every Quality; Plain is refused (`decoration_mismatch`); a printed-Plain Crackle ceramic fills it by search or by declaring any listed Decoration, never as Plain or undeclared |
| B1 cases (in `commission_market`) | deck empty with a discard → reshuffle at the start of the look; deck 1 + discard 5 → 1 card, no reshuffle; both empty → a 0-card look and a display pick |
| `materials_yard.test.ts`, `placement_legality_materials.test.ts` | Shifu 6 in every split 0–6; no bonus; Senior Apprentice 6; Prepared Clay after the 6 |
| `simple_locations.test.ts` | Canal Wharf Apprentice 2 Coins; Shifu 4 Coins + the top Main Order into the hand (hand +1, secret `deck_top` event); a reshuffle when the deck is empty; both empty → 4 Coins and no card; always legal |
| `guild_hall.test.ts`, `placement_legality_guild.test.ts` | Owner revision 2026-10-17. Apprentice: printed cost, Cover token at once, the position empty through the after-action window and refilled at `END_TURN`. Shifu: 1 take at printed cost (no discount); a face-up and an inspected take of different disciplines, the second from what shows now (the deck top is `TECH_NOT_AVAILABLE`, the first take's discipline `TECH_DISCIPLINE_OWNED`); two face-up takes then `GUILD_FINISH`; a third take `TECH_TAKE_LIMIT`; `GUILD_FINISH` first `TECH_TAKE_REQUIRED`; declining the second take; closing by itself; the 3-total limit across both takes; B2 bottom first, refill at the turn end; owned and exhausted decks; `INVALID_BOTTOM_ORDER`. Colour Samples as the Shifu's first take (look before the second take, inspection waiting) and second take (bottom order after the reservation). Placement: the same rule for both workers at printed cost (1 Coin and 0 Coins illegal, 2 legal; only 3-Coin face-up Techs; owned disciplines; inspection never counts) |
| `colour_samples_swap.test.ts` (new; rewritten for owner revision 3: a Select 3, a face-up pick refilled at the end of the turn, the rest under the deck in random order) | Before and after a worker action. Main discard face down (count +1) or Starting to the box. Private top-2 look (top 3 since revision 3); reserve 1; the other to the deck bottom (change 24). Once per round (`TECH_ALREADY_USED`); declining keeps it (R4). A Tech effect (no worker, no Senior Apprentice, display untouched). Usable after the Guild Hall action that acquired it, together with the when-acquired look. Either order with Imperial Priority. The window opens only on T10 ready and a held Order, whatever the hand holds. B1: deck 1 → 1 card; deck 0 → reshuffle (which may return the discarded Order); both empty with a Starting Order → `ORDER_SUPPLY_EMPTY`. Hand size unchanged. A swap after a Commission action runs before the deferred refill. Privacy |
| `canal_barge.test.ts` (rewrite) | Order Phase: the first completion each round +2 Coins (`canalBargeCoins: 2`), later ones +0; Starting Orders count; works the round T23 is acquired; with Guan (2 + 2 Coins) and Tribute Ware; never in the Work Phase (`USE_CANAL_BARGE` → `MALFORMED_ACTION`); the window never opens for T23 |
| `work_turn.test.ts`, `imperial_priority.test.ts` | the after-action window opens for Imperial Priority or the swap only; the deferred refill comes after the window |
| `after_quality.test.ts` | **Saggars:** the owner's Shared and Imperial ceramics with difference 3, 4, 5 are Standard (`saggarsFloor`), others' are not. Once per round, Standard → Fine without Wood, a floored ceramic included; never a Fine or Masterpiece target; optional (R4); no salvage for the owner. **Ge:** a floored Standard may be crackled; after Saggars' upgrade Ge cannot take that ceramic, and after Crackle Saggars cannot. **Second Firing:** 2 cards revealed publicly; choose 1; same Base Heat (Kiln Die for Imperial), position and marker; the new Quality replaces even if worse; both discarded in reveal order; earlier Jun not carried. **R7:** Jun on the chosen card's recalculation before Quality, 1 Wood; `jun` non-null when Jun is spent or unaffordable → errors; back to after-Quality for later players |
| `heat_adjustment.test.ts` | `RESOLVE_JUN` only in `firing_heat_adjustment` |
| `heat_quality.test.ts` | `qualityFor(d, neverFlawed)` for d = 0..6; `heatPreviews` floor |
| `contributions.test.ts`, `privacy_contributions.test.ts` | a Fuel Ledger owner with 0 Wood may Bank or Stoke (pays 0); owner revision 3: Fuel Ledger Bank and Fuel Ledger Stoke need and pay 1 Wood → ±2, a card not held is `CONTRIBUTION_CARD_NOT_HELD`, a `fuelLedger` key is malformed, the sealed card stays secret until every participant has submitted; a non-owner pays 1; `legalContributions` order |
| `fire_deck.test.ts` | R15: `fireBuried` counting; the reshuffle goes above buried cards when only buried cards remain; a buried card is drawn last; the plain reshuffle when the deck is empty; peek triggers `prepareTop`; burying a buried card; several buried cards; conservation; RNG used only by a reshuffle; `FIRE_DECK_RESHUFFLED.buriedBelow` |
| `test_pieces.test.ts`, `firing_flow.test.ts` | a seeded game where Second Firing runs every round and Test Pieces buries in round 4: the reshuffle happens in round 4 and the buried card comes last; without a bury, round 5 reshuffles |
| `tech_matrix.test.ts`, `ability_cases.ts` | new scenarios for T10 (swap), T11, T12, T14, T23; every `TechId` still covered |
| `optional_abilities.test.ts` | T10 swap, T11 upgrade and T14 are optional rows; T23 and Saggars' floor are listed as automatic |
| `techs_kilns.test.ts` | the new costs; `techPrice` is the printed cost for every Tech; T10 `oncePerRound` and readying; the hand limit |
| `kilns_orders.test.ts` | Ru, Guan and Tribute Ware only in the Order Phase; Canal Barge with Guan |
| `cleanup.test.ts` | the swap keeps the hand size; the Canal Wharf card counts toward the trim |
| `content_contract.test.ts` | V1.6.2 source and audit. Appendix A of both editions (owner revision 2): every Order's requirements, Quality, VP, Coins, Crowns, slots and relations against the English row, and its Chinese requirement text, Quality, VP, Coins and Crowns against the Chinese row; the 8-card Starting deck and the nineteen re-valued Main Orders. Costs (L612–641), location cells (L164–229), quick reference (L710–715). Printed numbers: T10 [3,1,5,1,2,1], T11 [3,1], T12 [1,2,2], T14 [1,2,1], T23 [2], MY Shifu [6], CM Apprentice [2,1,2,2], CM Shifu [3,2,3,3], GH Apprentice [1], GH Shifu [1,2,2], GH summary Shifu [2,1,2], CW Shifu [4]. The Guild Hall's L207, L209 and L212 text and no "discount" in its section (owner revision 2026-10-17). Short text and bold spans (§3.3); clarifications (§3.4) |
| `localization_content.test.ts` | Chinese sources V1.6.2; the new error codes in EN/ZH; the 96-character cap per R18 (§13) |
| `rules_fingerprint.test.ts` | revision 31 (30 before owner revision 3); data changes move the digest |
| `source_of_truth.test.ts` | documents: done in stage 1; the checksums of the revised English and Chinese rulebooks (owner revision 2026-10-17). Data `rulesVersion` 1.6.2 and the retired-ID scan (add `buyShifuBonus`, `blind`, `look_top_three`, `commission_top_three`, `USE_CANAL_BARGE`, and the Guild Hall Shifu discount) in the engine stage |
| `action_guard.test.ts`, `errors.test.ts` | the new commands parse (`GUILD_FINISH` included); the deleted ones, and a `GUILD_TAKE` carrying a `bottomOrder`, are `MALFORMED_ACTION`; `RESERVATION_REQUIRED`, `TECH_TAKE_LIMIT` and `TECH_TAKE_REQUIRED` text and `detailKeys` |
| `invariants.test.ts` | each new or changed check of §4.12 fails on a hand-built broken state |
| `projection_privacy.test.ts`, `privacy_guild.test.ts` | the new looks, the swap's discard and the Canal Wharf card never reach the public projection or another seat's view; a Guild inspection waiting behind Colour Samples stays private; the inspection's closing uses public facts only |
| `legal_actions.test.ts`, `selector_agreement.test.ts`, `legal_actions_perf.test.ts`, `ui_selectors.test.ts` | the new families and selectors agree with `validateAction`; the perf fixture keeps < 50 ms; the `firingStageView` allow-list |
| `fuzz.test.ts`, `determinism.test.ts` | full 2/3/4-player games reach `finished`; seeds that exhaust the Fire deck are part of the CI set |
| `setup.test.ts`, `support/fixtures.ts` | schema 8 (7 before owner revision 3); Bank, Tend and Stoke for every player; `fireBuried: 0`; `buildState` accepts `fireBuried`; `giveTech` with T10's flag; the 8-card Starting deck (change 23): 2 Starting + 1 Main each for 2, 3 and 4 players, the undealt Starting Orders in the box, none left at 4 players |
| `tech_no_vp.test.ts` (owner revision 3; replaces `tech_vp_on_gain.test.ts`), `scoring.test.ts`, `personal_spaces.test.ts` | Canal Barge flows replaced; no Tech VP on any acquisition path (Apprentice buy, Shifu inspected and face-up takes, a second take, Colour Samples before and after its Select, Fuel Ledger with its cards), in the ledger, `TECH_ACQUIRED`, the summary, the preview and final scoring; Connoisseur's Cabinet still scores; seeded full games (change 27) |
| `commission_market.test.ts`, `guild_hall.test.ts`, `legal_actions.test.ts`, `selector_agreement.test.ts`, `action_guard.test.ts` (owner revision 3) | `SELECT_CHOOSE` for every Select; Colour Samples' when-acquired Select with a face-up pick (also behind a Guild Hall Shifu's inspection); the retired choose commands are `MALFORMED_ACTION` |

### 11.2 Platform (`test/v161/platform`)

| File | Cases |
| --- | --- |
| `rules_fingerprint_gate.test.ts`, `client_compatibility.test.ts`, `supabase_contract.test.ts`, `local_backend_v161.test.ts`, `tsconfig_includes.test.ts` | `1.6.2`, schema 8, `r31` (schema 7, `r30` before owner revision 3); V1.6.1 rooms (`r29`), `r30` rooms and older saves are refused; the migration pins |
| `multiplayer_privacy.test.ts`, `reconnect.test.ts` | Commission look, swap look, a Guild Hall inspection between two takes and Second Firing choice survive reconnect for the actor only; other seats never get the looked cards, the inspected Techs or their bottom order, the swap's discarded Order or the Canal Wharf card; seat and state unchanged |
| `privacy_full_games.test.ts` (new, stage 5) | complete 2-, 3- and 4-player service games of human seats played by the strategic policy; after every command that opens, answers or follows a look or deals a secret, and every 10th revision, `tools/fixturePrivacy.ts` checks the actor's response, every seat's reconnect and the public state and rows (as a spectator) against the head and the full log; the seeded games reach every V1.6.2 look (Commission, Colour Samples, swap, Guild inspection), the Canal Wharf draw and the deck-bottom return; realtime notifications carry no game data |
| `computer_decisions.test.ts`, `computer_legality.test.ts`, `computer_fallback.test.ts` | the policy and the fallback act legally in `commission_market`, `colour_samples_swap`, `firing_second_firing_choice` and the after-action window; the zero-rejection suites require every V1.6.2 step (`guild_inspection`, `colour_samples`, `colour_samples_swap`, `firing_second_firing_choice`); clear-cut choices for the swap, Second Firing with and without Jun, S07, the Guild Hall Shifu's 2 takes, Fuel Ledger, Saggars and Canal Barge |
| `computer_hidden_independence.test.ts` | re-randomised hidden state (deck orders, other hands) with the same own view gives the same choice, a pending look included |
| `computer_full_games.test.ts`, `online_computer_player.test.ts`, `multiplayer_computer_turns.test.ts` | full all-computer games for 2/3/4 players |
| `fuel_ledger_store.test.ts`, `contribution_cas.test.ts` | owner revision 3: a sealed Fuel Ledger Stoke through the in-memory store, the Supabase rows and payloads and the RPCs, revealed as +2 for 1 Wood; a payload with `fuelLedger` refused; an owner's Bank pays 0 Wood |
| `playtest_form.test.ts` | Form V3 with `rulesVersion: "1.6.2"`; S01–S08 and O01–O48 accepted, the retired S09–S16 refused (change 23) |

---

## 12. Documents to update in later stages

- `docs/IMPLEMENTATION_DECISIONS.md`, `docs/ONLINE_GAME_SPEC.md`: the V1.6.2 commands, the window, privacy and versions (§2–§9). Done in stage 6.
- `docs/KILN_OPENING_v1.6.2_CLARIFICATIONS.md` (new, §3.4): done in stage 4, with `docs/KILN_OPENING_v1.6.2_COMPONENT_TEXT_SOURCE.md` (§3.3).
- `docs/GLOSSARY_ZH_V1.6.1.md`:
  - add 换单 (the Colour Samples swap, as in Chinese change 22 and L720);
  - update the Tech reminder table (lines 489–534) to the V1.6.2 component text.
  - Done in stage 2: the Commission wording 查看牌堆顶2张／3张 and 不看牌面拿取 (Canal Wharf); 盲接 and 看三取一 marked obsolete; §4.5 陶工行 per the owner revision (至多2项不同门类的技艺, 各按牌面价付费; the deferred refill); the error sentences of `RESERVATION_REQUIRED`, `TECH_TAKE_LIMIT` and `TECH_TAKE_REQUIRED`.
- `src/app` (the UI stage): the Guild Hall inspection chooser takes 1 Tech per `GUILD_TAKE` and ends with `GUILD_FINISH`; the Colour Samples window may resume an inspection; `GuildTechOption.cost` replaces `price`/`printedCost` (no "printed → price" display); a taken Tech's empty position shows until the turn ends.
- `AGENTS.md` (project instructions; the owner changes them): done. The Guild Hall and R15 items were updated with the owner's Guild Hall revision (commit `4dfd468`). Stage 3b updated the lists for owner revision 2: the change list names changes 21–24 and nineteen re-valued Main Orders (it said seventeen while listing nineteen IDs); "Removed by V1.6.2" adds the 16-card Starting deck and R3, the old values of the nineteen Main Orders, and discarding looked-at Orders not reserved (R14); "Hidden information" moves those cards from the discard to the deck bottom; "Tests that must exist" names the 8-card deal, S07 and the deck-bottom return.
- `supabase/README.md`, `docs/DESIGN_SPEC.md` (note), the `ENGINE_V1.6.1_DESIGN.md` header (point at this delta).
- Owner revision 3: the owner's commit `0bf32a0` updated `AGENTS.md`'s change list, the obsolete list and the hidden-information list. Its "V1.6.2 changes" swap item (top 2), the private-looks list (the swap's top 2) and "Tests that must exist" (the swap's top-2 look, Tech VP on gain, the Fuel Ledger commitment) still describe revision 2; they are the owner's to change (proposed wording in the stage-7 report).

---

## 13. Rule questions and the owner's rulings (2026-10-17)

Stage 1 recorded four cases the V1.6.2 text left open, each with a provisional default. On 2026-10-17 the owner confirmed all four defaults. They are now owner rulings R15–R18 in the audit; none changes a contract.

1. **R15 (was provisional default P4) — When a Fire deck holding only buried cards "runs out".** L511 and L657 reshuffle only when the deck "is empty". L648 says the discard is shuffled "and placed above" the buried card, "so the buried card is drawn last". The two only agree if the deck counts as run out once every card left in it is buried. **Ruling:** when a card is needed and every remaining card is buried, shuffle the discard and put it on top; a Test Pieces peek triggers it too. Without it, a card buried from a short deck would be revealed at once, and the bury would do nothing.
2. **R16 — B1 applies to every look.** B1 says a look sees "as many cards as remain" and is never completed from a reshuffled discard. V1.6.2 makes looks routine: every Commission Market visit and every swap. With 1 card in the deck and a large discard, an Apprentice sees only 1 card. **Ruling:** B1 as ruled, for every look; a look never reshuffles to complete itself. The discard is reshuffled only when the deck is empty as a look starts.
3. **R17 — The Colour Samples swap discards before it looks.** L625 reads "discard 1 held Order to look". If the deck is empty, the look's reshuffle includes the Order just discarded, which may come straight back. **Ruling:** the literal order (INT Colour Samples swap): the held Order is discarded, then the top 2 are looked at.
4. **R18 — The Chinese Colour Samples reminder is kept in full.** The owner's Chinese Colour Samples line is 79 characters; the glossary capped reminders at 72 (three printed lines of 24). **Ruling:** keep the owner's text verbatim; the test cap becomes 96 characters (four printed lines of 24).
5. **Recorded as interpretations, not open:** the Commission look always happens (the text is imperative and 1.6.1:L197's "may instead" is gone); Canal Barge is automatic (the Kiln Tending precedent); Saggars' floor is always on (the owner's component text says "Always:"); the Canal Wharf Shifu gains the Coins and then draws (L220's order).
6. **The Guild Hall revision (owner, 2026-10-17)** is rulebook text, not a ruling: L31, L207, L209, L212 and L714 of both editions. The engine's reading of what it leaves implicit is recorded in the audit as interpretations: each take is its own command and resolves fully before the next; "different disciplines" is the 1-per-discipline limit; the inspection closes by itself only on public facts; the refill at the turn end covers every discipline.
7. **Owner revision 2 (changes 23–24, 2026-10-17)** is rulebook text too. It retires R3 (S14 and S16 no longer exist) and supersedes R14 (the swap's other card goes to the deck bottom, as L617 now prints). One case was left open and recorded as provisional default P5: when a look puts 2 or 3 cards on the bottom, they kept the order they were drawn in.
8. **R19 (2026-10-18) — several looked cards go under the deck in random order.** The owner ruled on the P5 case: neither the draw order nor the looker's choice, but random order. The engine shuffles them with the seeded RNG before placing them under the deck; no command changes, and the looker's private record names the cards, not their deck order.
9. **Owner revision 3 (changes 25–27, 2026-10-18)** is rulebook text. It opens no question. One observation is recorded in the audit for the owner to confirm: change 25 calls itself "Wording only", yet as a Select 3 the Colour Samples swap now looks at 3 instead of 2, and both Colour Samples Selects may take a face-up Order. The engine follows the printed text (rev. 3 L32, L622, L646, L716 and the component text agree).

---

## 14. Owner revision 3 (changes 25–27), contract summary

Line numbers in this section are revision-3 lines.

- **Select N** (change 25; L35, L64, L197, L201–202, L622, L646, L649, L710, L715–716):
  - `work/select.ts`: `selectSpec(n, maxReservations, lookedCount)`; `selectReservable(game, n, extraDiscard)` (a face-up Order or a look of ≥ 1 card, B1, R16, R17); `openSelect` (the look, `PRIVATE_LOOK_OPENED` even for 0 cards); `selectPicksError` (`RESERVATION_REQUIRED`, `RESERVATION_LIMIT`, `INVALID_CHOICE` for duplicates and picks outside the look, `ORDER_NOT_AVAILABLE` for a stale face-up pick); `resolveSelectPicks` (face-up picks public, looked picks secret, the rest under the deck in random order with `LOOKED_ORDERS_TO_BOTTOM`).
  - `work/selectChoose.ts`: the `SELECT_CHOOSE` handler continues each step: the Commission Market ends the worker action; Colour Samples when acquired ends it or resumes the Guild Hall inspection; the swap returns to its window.
  - Step shape: `select: SelectSpec` on `commission_market`, `colour_samples` and `colour_samples_swap` (§2.2).
  - Data: `commission_market.effects` `{select, maxReservations}` (2/1, 3/2); T10 `{select: 3, handLimit: 5, swapDiscard: 1, swapSelect: 3}`.
  - Selectors: `commissionOptions.n`; `lookedOrderOptions` with `n` and `faceUpSlots` for every Select; `colourSamplesSwapOptions.faceUpSlots`, and a discard is legal when the look shows none but the display shows an Order.
- **Fuel Ledger cards** (change 26; L36, L93, L111, L266, L508, L634, L668–669, L734): `ContributionCardId` adds `FUEL_LEDGER_BANK` and `FUEL_LEDGER_STOKE`; `PlayerState.contributionCards`; `CONTRIBUTION_CARDS_GAINED`; T12 `{freeCards: ["BANK", "STOKE"], cards: ["FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"]}`; `SUBMIT_CONTRIBUTION { windowId, card }`; `CONTRIBUTION_CARD_NOT_HELD`; `contributionOptions` lists each held card; the stores and Supabase hold the 5-card set (§4.9, §9).
- **No Tech VP** (change 27; L37, L496, L605): `ScoreLedger.techs`, `FinalScoreBreakdown.techs`, `TECH_ACQUIRED.vp`, `GameConfig.techs.vpEach` and the score-breakdown row are gone; Connoisseur's Cabinet (L616) is unchanged.
- **Versions:** schema 8, `RULES_BEHAVIOUR_REVISION` 31, rules `1.6.2`; the policy labels are unchanged (`rules-v1.6.2-strategic-001`, `rules-v1.6.2-canonical-001`).
