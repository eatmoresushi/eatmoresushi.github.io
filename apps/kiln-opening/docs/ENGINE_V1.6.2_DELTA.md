# Kiln Opening V1.6.2: engine, data and test delta

Branch `kiln-opening-v162-engine`. The design and records of the V1.6.2 engine track, written in stage 1 and kept current as the stages land.

- **Rules authority:** the [V1.6.2 Player Rulebook](./KILN_OPENING_v1.6.2_EN_SOURCE.md), designated by the owner on 2026-10-17, with its [Chinese edition](./KILN_OPENING_v1.6.2_ZH.md) and [component text](./KILN_OPENING_v1.6.2_COMPONENT_TEXT.md). [The V1.6.2 audit](./RULEBOOK_AUDIT_V1.6.2.md) records the checksums, the owner rulings (R1–R25, B1–B3; R15–R18 are the owner's confirmations of 2026-10-17; R19 of 2026-10-18 replaced provisional default P5; R20–R25 are of 2026-10-23; R3 is obsolete and R14 superseded since owner revision 2, R9 obsolete since owner revision 4, R19 obsolete since R25), the amendments (A1 superseded by owner revision 3's change 27, A2), interpretations (INT) and provisional defaults (P1–P3).
- **Owner revision 2026-10-17 (Guild Hall).** After stage 1 was written, the owner revised the Guild Hall in the English and Chinese rulebooks (changes 21, L31; L207, L209, L212, L714). The Shifu takes up to 2 Techs from different disciplines at printed cost, with no discount. A taken Tech's position stays empty until the end of the taker's turn, for Apprentice and Shifu takes alike. Placement legality is the same for both workers. This document describes the revised rules; §1 rows 6–8, §4.3 and §13 say what changed.
- **Owner revision 2, 2026-10-17 (changes 23–24, L33–34).** The owner then rebuilt the Starting Order deck as 8 cards (S01–S08, new values; S07 "Carved, Impressed or Painted"; a 4-player game deals all 8), re-valued nineteen Main Orders, and sent every looked-at Order not reserved to the **bottom of the Main Order deck** instead of the discard: the Commission Market's 2 or 3, Colour Samples' when-acquired 3 and the other card of its swap's 2. That supersedes ruling R14; the held Order a swap discards still goes to the discard (a Starting Order to the box). Several cards put on the bottom go there in random order (owner ruling R19, 2026-10-18, which replaced the provisional default P5, draw order). §1 rows 17–20, §3.5, §4.1–§4.4, §7 and §13 item 7 describe it.
- **Owner revision 3, 2026-10-18 (changes 25–27, L35–37).** The owner added the keyword **Select N** (look at the top N Main Orders, reserve 1 of them or 1 face-up Main Order, the rest to the deck bottom): the Commission Market Apprentice Selects 2, the Shifu Selects 3 reserving up to 2, and Colour Samples Selects 3 when acquired and for its swap, which therefore looks at 3 and, like the when-acquired Select, may take a face-up Order. **Fuel Ledger** became 2 Contribution cards, Fuel Ledger Bank (1 Wood, −2) and Fuel Ledger Stoke (1 Wood, +2), in place of the secret Wood commitment; its owner plays 1 of 5 cards and plain Bank and Stoke stay free. **Tech VP is removed** (owner amendment A1 superseded). §1 rows 21–23, §1.1, §14 and stage 7 describe it; the sections below are amended where revision 3 changed them.
- **Owner revision 4, 2026-10-22 and 2026-10-23 (changes 28–35, L38–45), and owner rulings R20–R25 (2026-10-23).** No player Heat marker (Kiln Master's marker is chosen at loading); Ge crackles a Fine or Standard ceramic and each delivered Crackle ceramic scores 1 VP; Fuel Ledger 4, forming at Clay + 2 Coins, an unused Jun on a Second Firing, a Flawed ceramic sold for 2 Coins; the starting Main Order taken face up with the Kiln; the Magistrate's Hall Shifu at 4 Coins with an optional Crown Order; 1 Wood per Glaze & Load action into the Shared Kiln, Materials Yard 4 / 8, 3 starting Wood and no seat Coin. R25 discards every Select's unreserved looked cards, reversing change 24's deck bottom and R19. **§15 is the design**; it supersedes the passages of §1–§14 on the Heat marker, salvage, the deck bottom (R19), the dealt starting Main Order, the Decoration cost table and the revision-3 values.
- **Line numbers.** Revision 2 shortened Appendix A0 by 8 lines (revision-1 lines 540–756 became 532–748); revision 3 moved most lines down 5 or 6 (§1.1; the audit gives both maps). The `L` numbers in §1–§13 were written before revision 2 and are revision-1 numbers (for example L625 for Colour Samples, revision-2 L617, revision-3 L622) unless marked; §14 and the audit use revision-3 numbers. The clarifications and the line-pinned content tests use revision-4 numbers since the content step of owner revision 4 (§15.20); other code comments keep the numbers they were written with until the renumbering pass (§1.1). §15 uses revision-4 numbers (the audit maps revision 3 to revision 4).
- **Base contract:** [ENGINE_V1.6.1_DESIGN.md](./ENGINE_V1.6.1_DESIGN.md) and `src/game/types.ts`. Everything this document does not change stays as that design says. Where the two disagree, this document wins.
- **Notation:** `L124` is a line of the V1.6.2 English source. `1.6.1:L124` is a line of the V1.6.1 source. `R4`, `B1`, `R15`, `P3` are audit entries. `DESIGN §x` is a section of the V1.6.1 engine design.
- **Versions after this track:** rules `1.6.2`, state schema `9`, `RULES_BEHAVIOUR_REVISION` `32` after owner revision 4 (§15.2); schema 8 and revision 31 from owner revision 3 (stage 7); schema 7 and revision 30 before.

Nothing here changes a rule or a balance value. Every value below is printed in V1.6.2. §13 lists the cases the text left open and the owner's rulings on them (2026-10-17); §15.21 the rulings of 2026-10-23.

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
  - Review fixes: `RESERVATION_LIMIT` names the Select and reads for a limit of 1 (§2.5; glossary §7); the audit records that change 25 makes R4, R19 and B1 reach further than approved, for the owner to confirm, and the owner's shorter Second Firing tile text; T12's L669 · L670 clarification says the same in both languages; the revision-2 passages left here (§1 rows 10 and 13, §2.2, §11.1, §12, §13), in `DESIGN_SPEC.md`, `UI_UX_SPEC.md` and `UI_V1.6.1_ARCHITECTURE.md` (Tech VP), the fixtures m16 and m20 and their `FIXTURES.md` rows, and the test headers that cited revision-2 lines are brought up to date. The `AGENTS.md` lines still to change are listed in §12.
- **Stage 8 (landed): design and records for owner revision 4 and rulings R20–R25** (§15). The audit gained the revision-4 section (checksums, line map, R20–R25, the re-check of every ruling and interpretation); `GAME_RULES.md` followed. That stage changed no code, data or test.
- **Stages 9–11 (landed): owner revision 4 and R25 in the engine, content, platform and computer players** (§15.20 and its three implementation notes): schema 9, revision 32 (`r32-`); Setup, the Work Phase, firing and scoring; R25's discards; the data texts, clarifications, component text source and glossary; the computer policy, privacy and the platform tests; `npm run test:fuzz:long`. A review step then removed the separate Crackle "never a Masterpiece" reason, corrected the sale's turn-passing text and added a Setup-pick reconnect test (§15.20, review note).
- **Still to come:**
  - The renumbering pass of the remaining code and test comments (§1.1, now including revision 2's −8 after line 539, revision 3's +5/+6 and revision 4's map in the audit) and the documents of §12 and §15.19.
  - `src/app` (the UI stage): the swap, the Second Firing choice, S07's `decorations`, the 8-card Starting deck, and revision 3: `SELECT_CHOOSE` with `step.select` for all three Selects (a face-up pick in every one), the 5-card Contribution chooser from `contributionCards`, and no Tech VP line; and revision 4: the Setup choice, Kiln Master at loading, the fuel line, the Magistrate's Hall Crown Order, the sale, Ge on Fine and Crackle VP, no Heat-marker step or salvage step, `LOOKED_ORDERS_DISCARDED` (R25) in place of `LOOKED_ORDERS_TO_BOTTOM`, and the glossary §2.16 button 装进御窑 for `verb.loadImperial`.
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
| 10 | Colour Samples (T10) | When acquired: top-3 reservation; hand limit 5 | Adds: once per round, before or after one of your worker actions, you may discard 1 held Order (Main → face-down discard, Starting → box) to look at the top 2 Main Orders and reserve 1; the other goes on the bottom of the Main deck (change 24; it superseded owner ruling R14, which had it discarded). The when-acquired look's 2 other cards go on the bottom too. **Revision 3 (row 21):** both are a Select 3, so the swap looks at 3, and either may reserve a face-up Order instead | L34, L625, L649, L718 |
| 11 | Canal Barge (T23) | Once per round, before or after a worker action, complete 1 held Order (R6) | Once per round, when you complete an Order, gain 2 Coins. Orders are completed only in the Order Phase | L32, L402, L484, L630, L645 |
| 12 | Protective Saggars (T11) | Cost 2; once per round, 1 Wood: Flawed → Standard or Standard → Fine | Cost 3. Your ceramics are never Flawed: Heat Difference 3+ counts as Standard. Once per round, after Quality, 1 of your Standard ceramics from this firing becomes Fine. Never a Masterpiece | L636, L650, L653 |
| 13 | Fuel Ledger (T12) | Cost 3; secretly commit 1 additional Wood with Bank/Stoke for −2/+2 | Cost 2. Your Bank and Stoke cost no Wood. Committing 1 Wood still makes them −2/+2. **Revision 3 (row 22):** the commitment is gone; the Fuel Ledger Bank and Fuel Ledger Stoke cards (1 Wood, −2 / +2) replace it | L637 |
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
  | { /** Commission Market look: the Apprentice effect's Select 2 or the Shifu effect's Select 3
       * (rev. 3 L201–202, change 25, B1, B3). */
      kind: "commission_market"; playerId: PlayerId; orderIds: OrderId[] }
  | { /** Colour Samples when acquired: Select 3 (rev. 3 L622, change 25, R4, B1, B3). */
      kind: "colour_samples"; playerId: PlayerId; orderIds: OrderId[] }
  | { /** Colour Samples once-per-round swap: Select 3, looked at after the held Order was
       * discarded (rev. 3 L622, L646, changes 24–25, R16, R17, B1, B3; top 2 before revision 3). */
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
- **`RESERVATION_LIMIT`:** "This Select reserves at most {limit}; you chose {requested} Orders." / 这次精选至多承接{limit}张，你选了{requested}张. detailKeys `limit`, `requested`. Fallbacks "This Select reserves at most {limit}." / 这次精选至多承接{limit}张 and "This Select cannot reserve another Order." / 这次精选不能再承接委托. Only a Select returns it (`selectPicksError`), and Colour Samples' Selects are Tech effects, not actions (rev. 3 L646), so the text names the Select; `requested` is always 2 or more, so "Orders" is always right. Until the stage-7 review it read "This action reserves at most {limit} Orders." / 此行动至多承接{limit}张, which a limit of 1 made ungrammatical.
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
| `colour_samples_swap.test.ts` (new; rewritten for owner revision 3) | Before and after a worker action. Main discard face down (count +1) or Starting to the box. The Select 3 (rev. 3 L622): a private look at the top 3; 1 reservation, a looked card (the other 2 to the deck bottom, change 24) or a face-up Order (its position empty until the turn ends, then one refill; all 3 looked cards to the deck bottom), several in random order (R19). Once per round (`TECH_ALREADY_USED`); declining keeps it (R4). A Tech effect (no worker, no Senior Apprentice). Usable after the Guild Hall action that acquired it, together with the when-acquired Select (`guild_hall.test.ts`, `work_turn.test.ts`). Either order with Imperial Priority. The window opens only on T10 ready and a held Order, whatever the hand holds. B1: deck 1 → 1 card; deck 0 → reshuffle (which may return the discarded Order); both piles empty with a Starting Order and an Order on the display → a 0-card look that reserves from the display (change 25); both piles and the display empty with a Starting Order → `ORDER_SUPPLY_EMPTY` (a Main Order discarded would refill the deck). Picks: 0 `RESERVATION_REQUIRED`, 2 `RESERVATION_LIMIT` (its text names the Select), a pick outside the look `INVALID_CHOICE`, a stale face-up pick `ORDER_NOT_AVAILABLE`. Hand size unchanged. A swap after a Commission action runs before the deferred refill. Privacy: the face-up reservation is public, the discarded Order and the looked cards private |
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
| `content_contract.test.ts` | V1.6.2 source and audit. Appendix A of both editions (owner revision 2): every Order's requirements, Quality, VP, Coins, Crowns, slots and relations against the English row, and its Chinese requirement text, Quality, VP, Coins and Crowns against the Chinese row; the 8-card Starting deck and the nineteen re-valued Main Orders. Costs (L612–641), location cells (L164–229), quick reference (L710–715). Printed numbers (owner revision 3): T10 [3,5,1,3] (`select`, `handLimit`, `swapDiscard`, `swapSelect`), T11 [3,1], T12 [1,2,1,2,5,1] (the two Fuel Ledger cards' Wood and Heat, the 5 cards, the 1 played), T14 [1,2,1], T23 [2], MY Shifu [6], CM Apprentice [2] ("Select 2."), CM Shifu [3,2,1,3], GH Apprentice [1], GH Shifu [1,2,2], GH summary Shifu [2,1,2], CW Shifu [4]. Before revision 3: T10 [3,1,5,1,2,1], T12 [1,2,2], CM Apprentice [2,1,2,2], CM Shifu [3,2,3,3]. The Guild Hall's L207, L209 and L212 text and no "discount" in its section (owner revision 2026-10-17). Short text and bold spans (§3.3); clarifications (§3.4) |
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
- Owner revision 3: the owner's commit `0bf32a0` updated `AGENTS.md`'s change list, the obsolete list and the hidden-information list, and commit `8dbbf9c` the "V1.6.2 changes" swap item, the private-looks list and the swap, Tech VP and Fuel Ledger items of "Tests that must exist". Still describing revision 2 or earlier, and the owner's to change (the stage-7 review report gives replacement lines): the "Techs" item's Fuel Ledger sentence ("committing 1 Wood still makes them −2/+2", the commitment change 26 removed, which the obsolete list names); the "Platform" test item's versions (schema 7, `r30-`; now schema 8, `r31-`); the change-list heading ("changes 21–24", though it lists 25–27) and "Removed by V1.6.2" heading; "owner amendments (A1, A2)" without A1's supersession; the Fire-deck citations L640 (revision 2; revision 3 is L645); and the swap test item, which dropped "either order with Imperial Priority; usable the round it is acquired" (the tests still exist: `colour_samples_swap.test.ts`, `guild_hall.test.ts`, `work_turn.test.ts`).

---

## 13. Rule questions and the owner's rulings (2026-10-17)

Stage 1 recorded four cases the V1.6.2 text left open, each with a provisional default. On 2026-10-17 the owner confirmed all four defaults. They are now owner rulings R15–R18 in the audit; none changes a contract.

1. **R15 (was provisional default P4) — When a Fire deck holding only buried cards "runs out".** L511 and L657 reshuffle only when the deck "is empty". L648 says the discard is shuffled "and placed above" the buried card, "so the buried card is drawn last". The two only agree if the deck counts as run out once every card left in it is buried. **Ruling:** when a card is needed and every remaining card is buried, shuffle the discard and put it on top; a Test Pieces peek triggers it too. Without it, a card buried from a short deck would be revealed at once, and the bury would do nothing.
2. **R16 — B1 applies to every look.** B1 says a look sees "as many cards as remain" and is never completed from a reshuffled discard. V1.6.2 makes looks routine: every Commission Market visit and every swap. With 1 card in the deck and a large discard, an Apprentice sees only 1 card. **Ruling:** B1 as ruled, for every look; a look never reshuffles to complete itself. The discard is reshuffled only when the deck is empty as a look starts.
3. **R17 — The Colour Samples swap discards before it looks.** L625 reads "discard 1 held Order to look". If the deck is empty, the look's reshuffle includes the Order just discarded, which may come straight back. **Ruling:** the literal order (INT Colour Samples swap): the held Order is discarded, then the top 2 are looked at. Since owner revision 3 the look is a Select 3 (rev. 3 L622, "discard 1 held Order to Select 3"), and R17 still puts the discard first.
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

---

## 15. Owner revision 4 (changes 28–35) and owner rulings R20–R25: design

Stage 8 (design and records; no engine code). Sources: the V1.6.2 rulebook as the owner left it on 2026-10-23 (changes 28–34 of 2026-10-22, change 35 and R25's text edit of 2026-10-23; checksums in the audit), owner rulings R20–R25 (audit, rulings table) and `AGENTS.md`'s "Changes 28–35" bullet.

**Line numbers in §15 are revision-4 lines**: lines of the English source as it stands now (737 lines). The Chinese edition is the English line plus 2 from English line 3 on; the component text keeps its numbering. The audit gives the revision-3 → revision-4 line map. `rev. 3 L…` marks a revision-3 line.

Everything below is printed in revision 4 or ruled by the owner; nothing here changes a rule or a balance value. Where §1–§14 describe the Heat marker, the salvage step, the deck-bottom flow (change 24, R19), the dealt starting Main Order, the Decoration cost table or the revision-3 values, §15 supersedes them.

### 15.1 What changes

| # | Rule | Revision 3 | Revision 4 | Lines |
| --- | --- | --- | --- | --- |
| 24 | Player Heat marker (changes 28, 31) | Each player's marker; the Glaze & Load Shifu places it face down; turned to ±1 or returned in the Heat-marker step (firing step 5); Kiln Master's marker placed in that step | Gone: no marker, no step. The Glaze & Load Shifu "simply loads up to 2" | L38, L41, L194, L251–256, L659–664 |
| 25 | Kiln Master (T24; change 31, R22) | In the Heat-marker step, on 1 of your ceramics without a Heat marker; "a Heat marker for all rules" | Once per round, **when you load a ceramic** (any loading: a Glaze & Load action or Imperial Priority, Shared or Imperial Kiln, R22), you may place a +1 or −1 marker on it, face up, public; it adds to that ceramic's Actual Heat, Jun on top; it stays for a Second Firing recalculation; it returns when the firing finishes | L628, L635, L664, L73, L78, L255, L292, L661, L719 |
| 26 | Firing sequence (changes 28, 31) | Contributions → Base Heat → Test Pieces → Heat markers → Fire → Actual Heat → Jun → Quality → after-Quality → salvage → finish | Contributions (Base Heat) → Test Pieces (end of step 1) → Fire → Actual Heat (Jun) → Quality → after-Quality abilities → finish (Appendix D, 6 steps) | L41, L134, L659–672, L680 |
| 27 | Test Pieces (T13) | After Base Heat, before Heat markers | After Base Heat is determined, before the Fire card is revealed. Engine: the same position in the flow | L626, L636 |
| 28 | Ge (change 29) | 1 Standard ceramic → Fine + Crackle; never a Masterpiece; Saggars' step and Crackle never on one ceramic | Once per round, after Quality, 1 of your **Fine or Standard** ceramics from this firing → Crackle and Fine (a Standard one becomes Fine). **Each Crackle ceramic you deliver to complete an Order scores 1 VP** (in the Order Phase). Saggars' Standard → Fine and Crackle may both apply to one ceramic | L39, L463, L465, L479–480, L641, L728 |
| 29 | Fuel Ledger cost (change 30) | 2 | **4** | L40, L625 |
| 30 | Forming cost (change 30) | Clay + a Decoration cost (every Decoration 2 Coins; a table) | The Shape's Clay + **2 Coins**, any Decoration; no table. Shifu −1 Coin when forming 2, Decorator's Kit −1 Coin on a Carved/Impressed/Painted vessel, Ding's 1 Clay + 1 Coin vessel unchanged; Prepared Clay pays Clay + 1 and 2 Coins. **Engine behaviour unchanged**; data and names change | L183–186, L336, L469, L603, L605, L639, L691 |
| 31 | Jun with Second Firing (change 30) | Owner ruling R7 | Rulebook text: "an unused Jun adjustment may be applied to the recalculated heat before the new Quality is assigned". Engine unchanged (`SECOND_FIRING_CHOOSE.jun`) | L478, L627 |
| 32 | Form & Decorate legality (change 30) | "Clay cost and a Decoration cost for at least 1 vessel" (engine already applied R4's discounts) | "the full cost of at least 1 vessel, after any reductions". Engine unchanged (`canFormAny`) | L186 |
| 33 | Flawed ceramics (change 30, R20) | Step 11: discard 1 still-Flawed ceramic from this firing for 2 Coins | A Flawed ceramic may be **sold for 2 Coins**, during its owner's turn (R20): Work turn windows, Order Phase turn, own after-Quality turn, pending Cleanup trim. The salvage step is gone | L282, L284, L729 |
| 34 | Kiln Die (change 30) | — | "the day's weather": flavour only | L140 |
| 35 | Starting Main Order (change 32, R23) | Dealt face down (2 Starting + 1 Main), then the Main deck reshuffled | Only 2 Starting Orders dealt; 6 Main Orders revealed (no reshuffle). In reverse turn order each player, in **one turn** (R23), chooses a Kiln and takes 1 face-up Main Order; the display is refilled to 6 after each take; the take is public | L42, L115–116, L122, L516 |
| 36 | Magistrate's Hall Shifu (change 33, R21) | Pay 3 Coins, +1 step | Pay **4 Coins**, +1 step, then **may** (R21) reserve 1 face-up Crown Order from the display; nothing if none shows; its position stays empty until the end of the turn, then the display refills as at the Commission Market | L43, L241, L245, L392, L696 |
| 37 | Kiln fuel (changes 34, 35, R24) | — | A Glaze & Load action that loads into the Shared Kiln costs **1 Wood**, whether it loads 1 vessel or 2 (Apprentice or Shifu); an action that loads only into the Imperial Kiln, and Imperial Priority, cost none. Legality adds "and 1 Wood if you load into the Shared Kiln" | L44–45, L92, L197–198, L291, L316, L692, L706 |
| 38 | Materials Yard (change 34) | Apprentice 3, Shifu 6 | Apprentice **4**, Shifu **8** (Senior Apprentice 8) | L176–177, L690 |
| 39 | Starting resources (changes 34, 35) | 2 Clay, 2 Wood, 3 Coins | **2 Clay, 3 Wood, 3 Coins**, the same for every seat: **no seat Coin** (change 30's seat Coin was withdrawn by change 35) | L45, L125 |
| 40 | Select N's unreserved looked cards (R25) | Face down to the bottom of the Main deck, several in random order (change 24, R19) | **Discarded** face down to the Main Order discard pile (Commission Market's Select 2/3, Colour Samples' Select 3 when acquired and in its swap). The discard is shuffled into a new deck when the deck is empty and a card is needed (L506); B1/R16 unchanged: a look never reshuffles to complete itself. R19 obsolete | L31, L35, L72, L203, L506, L698; component text 3, 5 |

### 15.2 Versions and fingerprint

- `SchemaVersion = 9` (`types.ts`; `setup.ts` writes 9). Rules version stays `1.6.2`.
- `RULES_BEHAVIOUR_REVISION = 32`, rooms `r32-<digest>`. History line in `src/game/rulesFingerprint.ts`: "32 -- V1.6.2 owner revision 4 (changes 28–35, 2026-10-22/23) and owner rulings R20–R25, state schema 9: no player Heat marker and no Heat-marker step (the `firing_heat_markers` phase, `RESOLVE_HEAT_MARKERS` and the Heat-marker events are gone); Kiln Master's ±1 marker chosen when a ceramic is loaded (`LoadedCeramic.kilnMasterMarker`, R22); Ge crackles a Fine or Standard ceramic and each Crackle ceramic delivered scores 1 VP (`CompletedOrderRecord.crackleVp`); a Flawed ceramic is sold for 2 Coins during its owner's turn (`SELL_FLAWED`, R20; the `firing_salvage` step is gone); the starting Main Order is taken face up with the Kiln in one Setup turn (`SELECT_KILN.mainOrder`, R23); the Magistrate's Hall Shifu pays 4 Coins and may reserve a face-up Crown Order (R21); 1 Wood per Glaze & Load action into the Shared Kiln (R24); Select N discards its unreserved looked cards (R25, replacing change 24's deck bottom and R19). Rules version stays 1.6.2; r31 rooms and schema-8 saves are rejected, never migrated."
- The content digest moves with the data (§15.8).

### 15.3 State (`src/game/types.ts`)

```ts
export type SchemaVersion = 9;

/** ±1: a Jun adjustment or the Kiln Master marker (renamed from `HeatMarkerValue`: there is no
 * Heat marker since revision 4). */
export type HeatDelta = 1 | -1;

// Deleted: `CeramicHeatMarker`.

export interface LoadedCeramic extends CeramicCore {
  // … unchanged fields …
  /**
   * Kiln Master's marker (T24, rev. 4 L628, L635, R22), chosen face up when this ceramic was
   * loaded, by a Glaze & Load action or Imperial Priority, into either kiln; public; null
   * without one. Replaces `heatMarker`.
   */
  kilnMasterMarker: HeatDelta | null;
}

export interface HeatCalculation {
  fireModifier: FireModifier;
  heatSource: number;
  positionModifier: number;
  /** The ceramic's Kiln Master marker, 0 without one (rev. 4 L255, L661); the same in a Second
   * Firing recalculation (L627). Replaces `heatMarker`. */
  kilnMasterMarker: -1 | 0 | 1;
  /** heatSource + positionModifier + kilnMasterMarker. */
  actualHeat: number;
  junAdjustment: -1 | 0 | 1;
  finalActualHeat: number;
  heatDifference: number;
}

export interface FiringCeramicRecord {
  // … unchanged fields …
  /** Sold during its owner's after-Quality turn (R20, rev. 4 L284): it left the kiln and the
   * game. Replaces `salvaged`. */
  sold: boolean;
}

export interface CompletedOrderRecord {
  // … unchanged fields …
  /** Ge (rev. 4 L465, L480): 1 VP for each Crackle ceramic delivered with this Order, else 0.
   * Automatic; counted in `ScoreLedger.kilnAbilities`. */
  crackleVp: number;
}
```

- `ScoreLedger.kilnAbilities` JSDoc: Ru 4 VP, Guan 1 VP and Crackle 1 VP per delivered Crackle ceramic (rev. 4 L465, L487).
- `FinishedQuality` / `DeliveredQuality`: unchanged shapes (`crackle: true ⇒ quality: "fine"`). JSDoc: Ge now targets a Fine or Standard ceramic and leaves it Fine; nothing raises a Crackle ceramic afterwards (Saggars' step and Second Firing take only Flawed or Standard ones), so a Crackle ceramic is exactly Fine.
- `PlayerState`, `ImperialState`, `MainOrderMarketState`, `HiddenState`, `PendingLook`, `FiringContext`: no new fields. `HiddenState.mainDeck` JSDoc: looked cards are no longer appended (R25). `HiddenState.mainDiscard` JSDoc: also receives every Select's unreserved looked cards (R25).
- No new stable IDs; none retired (the Heat marker had no ID).

### 15.4 Phases and windows

- **Deleted:** `firing_heat_markers` (and its `DecisionQueue`), `firing_salvage` (and its `openedAtRevision`). `decisionPrompt`, `PHASE_TEXT`, `roundStructure.ts`, `invariants.ts` (`FIRING_PHASES`, the Fire-revealed list, the queue checks) and the service's parallel-window code lose them; `cleanup_hand_limit` is the only `parallel` phase.
- **`setup_kiln_selection`:** same shape (`selectionOrder` in reverse turn order, `index`); its JSDoc becomes Setup step 9 (rev. 4 L122, R23): one turn = a Kiln and 1 face-up Main Order.
- **Firing flow** (`firing/pipeline.ts`): `firing_contributions` → `firing_test_pieces` (if any Test Pieces owner is eligible) → automatic Fire reveal and Actual Heat → `firing_heat_adjustment` (Jun) → automatic Quality → `firing_after_quality` (⇄ `firing_second_firing_choice`) → automatic finish → Order Phase. `openAfterBaseHeat` and `advanceTestPieces` call `revealFireAndCalculate` directly; `advanceAfterQuality` and `openAfterQuality` call `finishFiring` directly when the queue is done (no `openSalvage`).
- **Sale windows (R20)**, where `SELL_FLAWED` is legal for the player the game is waiting for: `work_turn` with `step.kind` `before_action` or `after_action` (the active player); `orders` (the current Order-turn player); `firing_after_quality` (the queue head); `cleanup_hand_limit` (a pending player). Never in `firing_contributions`, a Work sub-step (`commission_market`, `guild_inspection`, `colour_samples`, `colour_samples_swap`), `firing_test_pieces`, `firing_heat_adjustment`, `firing_second_firing_choice`, `round_start_setters_mark` or `setup_kiln_selection`. The command is free and is not a worker action: it never ends a Work turn or a Cleanup trim, or changes a Work step; in `firing_after_quality` and `orders` the turn passes automatically after a sale when nothing is left to do there, as after an ability use or a completion (§15.9.11, §15.9.12).
- **Order Phase skip (INT, §15.9.12):** a player is skipped automatically only when they have nothing completable **and** no sellable Flawed ceramic.
- `FiringStep = 1 | 2 | 3 | 4 | 5 | 6` (Appendix D, rev. 4 L659–664). `FiringStageView.step`: 1 for `firing_contributions` and `firing_test_pieces` (Test Pieces is "end of 1", L670), 3 for `firing_heat_adjustment`, 5 for `firing_after_quality` and `firing_second_firing_choice`, 6 for a finished firing (the recap). `FIRST_PLAYER_ORDER_STEPS = [1, 3, 5]` (Test Pieces at the end of step 1, Jun, after-Quality).

### 15.5 Commands

| Command | Revision-4 shape | Notes |
| --- | --- | --- |
| `SELECT_KILN` | `{ kilnId: KilnId; mainOrder: { slotIndex: number; orderId: OrderId } }` | One Setup turn (R23). `mainOrder` is required: the take is not optional (L122) |
| `PLACE_MATERIALS_YARD` | unchanged | clay + wood = 4 (Apprentice effect) or 8 (Shifu effect, Senior Apprentice included) |
| `PLACE_FORM_DECORATE` | unchanged | costs unchanged (§15.9.3) |
| `PLACE_GLAZE_LOAD` | `{ workerId; loads: LoadSpec[] }` | `heatMarkerCeramicId` deleted (`MALFORMED_ACTION` if sent). 1 Wood when any load goes into the Shared Kiln (§15.9.4) |
| `LoadSpec` | adds `kilnMaster?: HeatDelta` | Kiln Master's marker on this load (T24, R22); at most 1 load per command; omitted declines (R4) |
| `USE_IMPERIAL_PRIORITY` | adds `kilnMaster?: HeatDelta` | R22; free, no Wood (R10) |
| `PLACE_MAGISTRATES_HALL` | `{ workerId; crownOrder?: { slotIndex: number; orderId: OrderId } }` | Shifu effect only; omitted declines (R21) |
| `SELL_FLAWED` (new) | `{ ceramicId: CeramicId }` | R20; one ceramic per command; legal only in the sale windows (§15.4) |
| `RESOLVE_JUN` | `adjustment: { ceramicId; delta: HeatDelta } \| null` | type rename only |
| `SECOND_FIRING_CHOOSE` | `jun: { delta: HeatDelta } \| null` | type rename only; R7 is now text (L627) |
| `RESOLVE_HEAT_MARKERS`, `SALVAGE_FLAWED` | deleted | `parseCommand` → `MALFORMED_ACTION` |

`actionGuard.ts`: `SELECT_KILN` requires `mainOrder` (`slotIndex` a non-negative safe integer, `orderId` an Order ID; extra keys refused); `PLACE_GLAZE_LOAD` allows only `type`, `workerId`, `loads`; each load's optional `kilnMaster` ∈ {1, −1}; `USE_IMPERIAL_PRIORITY` optional `kilnMaster` ∈ {1, −1}; `PLACE_MAGISTRATES_HALL` optional `crownOrder` `{slotIndex, orderId}`; `SELL_FLAWED` requires `ceramicId`. `HEAT_MARKER_VALUES` becomes `HEAT_DELTAS`.

### 15.6 Events

| Event | Change |
| --- | --- |
| `ORDERS_DEALT` | `{ playerId; startingCount; secret: { visibleTo; startingOrderIds } }`: `mainCount` and `secret.mainOrderIds` deleted (nothing Main is dealt, L115) |
| `KILN_SELECTED` | unchanged; followed in the same command by `ORDER_RESERVED { via: "setup", source: "face_up", slotIndex, orderId }` (public) and `DISPLAY_REFILLED { cause: "setup" }` |
| `ORDER_RESERVED.via` | adds `"setup"` and `"magistrates_hall"` (both `source: "face_up"`, public, no `secret`) |
| `HEAT_MARKER_PLACED`, `HEAT_MARKER_TURNED`, `HEAT_MARKER_RETURNED` | deleted |
| `KILN_MASTER_PLACED` | same payload `{ playerId; ceramicId; value: HeatDelta }`, now emitted at loading (after the load's `CERAMIC_LOADED`, Setter's Mark and Kiln Furniture events, preceded by `TECH_USED{T24}`) |
| `LOOKED_ORDERS_TO_BOTTOM` | replaced by `LOOKED_ORDERS_DISCARDED { playerId; count; secret: { visibleTo; orderIds } }` (R25): after every `SELECT_CHOOSE` with unreserved looked cards; `count` public, `orderIds` in look order, private to the looker |
| `CERAMIC_SALVAGED` | replaced by `CERAMIC_SOLD { playerId; ceramicId; coins; from: "finished" \| "firing" }` (public), followed by `RESOURCES_CHANGED{reason: "flawed_sale"}` |
| `RESOURCES_CHANGED.reason` | `"salvage"` → `"flawed_sale"`; adds `"kiln_fuel"` (Glaze & Load, wood −1) |
| `QUALITY_IMPROVED{cause: "ge_crackle"}` | only when Ge turns a Standard ceramic Fine; on a Fine target only `CRACKLE_APPLIED` is emitted |
| `ACTUAL_HEAT_CALCULATED`, `SECOND_FIRING_CHOSEN` | `calculation.kilnMasterMarker` replaces `calculation.heatMarker` |
| `JUN_ADJUSTED` | `delta: HeatDelta` (type rename) |
| `ORDER_COMPLETED` | `record.crackleVp` |
| `MAIN_DECK_RESHUFFLED` | unchanged; now reachable in ordinary play (R25) |

### 15.7 Rule errors (`GameRuleErrorCode`, `ruleErrorText.ts`)

No new code. Plain modern Chinese, glossary terms.

- **Deleted:** `HEAT_MARKER_INVALID` (code, text and the `localization_content` entry).
- **`INVALID_TARGET`** (`REASON_TEXT`), new reasons:
  - `not_fine_or_standard`: "the ceramic is not Fine or Standard" / 器物不是上品或良品 (`USE_GE_CRACKLE`; the Ge message "Crackle needs one of your Fine or Standard ceramics from this firing.");
  - `no_crown`: "the Order shows no Crown" / 委托上没有御令 (`PLACE_MAGISTRATES_HALL.crownOrder`; message "The Magistrate's Hall Shifu reserves only a face-up Order that shows a Crown."; details `slotIndex`, `orderId`);
  - `not_flawed` (existing) for `SELL_FLAWED` ("Only a Flawed ceramic can be sold." / 只有瑕品才能卖出); `not_standard` stays for Protective Saggars only.
- **`INSUFFICIENT_RESOURCES`** for kiln fuel: details `{ resource: "wood", needed: 1, have, field: "loads[i].destination" }` (the first Shared load).
- **`NO_MAIN_ACTION_POSSIBLE`** at Glaze & Load: the English message names the fuel ("You have no Shaped vessel with a legal destination you can pay for: the Shared Kiln needs 1 Wood."); the catalogue sentence is unchanged.
- **`NOT_SHIFU_EFFECT`** for an Apprentice's `crownOrder` (details `field: "crownOrder"`).
- **`ORDER_NOT_AVAILABLE`** for a stale `mainOrder` or `crownOrder` (`display[slotIndex] !== orderId`).
- **`TECH_NOT_OWNED` / `TECH_ALREADY_USED`** for `kilnMaster` (owned, ready, at most 1 load per command; details `techId: "T24"`, `field`); a value outside ±1 is `MALFORMED_ACTION` (guard).
- **`WRONG_PHASE`** for `SELL_FLAWED` outside a sale window: the dispatcher's phase check, and in a Work sub-step the window message "Finish your worker action first."; `NOT_YOUR_DECISION` from the dispatcher otherwise.
- **`PHASE_TEXT`:** delete `firing_heat_markers` and `firing_salvage`; `setup_kiln_selection` becomes "Kiln and Main Order choice" / 选窑口和主委托.

### 15.8 Data (`data/*.json`) and content definitions

Mechanical values (engine stage); the display texts follow in the content stage from the revision-4 lines.

| File | Change |
| --- | --- |
| `game_config.json` | `startingResources` `{clay: 2, wood: 3, coins: 3}` (L125); `setupDeal` `{startingOrders: 2}` (L115; `mainOrders` deleted); new `setupFaceUpMainOrders: 1` (L122); `decorations` becomes the list `["plain", "carved", "impressed", "painted"]` and new `formingCoins: 2` (L336; the per-Decoration cost table is gone) |
| `action_locations.json` | `materials_yard` apprentice `{resources: 4}`, shifu `{resources: 8}` (L176–177); `form_decorate.shifu.twoVesselDiscount: 1` (renamed from `twoVesselDecorationDiscount`, L184); `glaze_load` apprentice and shifu add `sharedKilnWood: 1`, shifu loses `placesHeatMarker` (L193–194, L197); `magistrates_hall` shifu `{coins: 4, recognitionSteps: 1, crownOrders: 1}` (L241). Texts: MY L176–177, F&D L183–184, G&L L193–194, MH L241 (Chinese +2) |
| `techniques.json` | T12 `cost` 4 (L625); T24 `timing` `"when_loading"`; texts of T12, T13 (L626), T14 (L627), T16 (L603), T17 (L605), T24 (L628) and the short texts (component text lines 15/17, 25/27, 84/86, 94/96) |
| `kilns.json` | GE `params` `{fromQualities: ["fine", "standard"], toQuality: "fine", vpPerDeliveredCrackle: 1}` (L463, L465); GE ability and short texts (L463–465; component text 128/130); DI ability (L469; its short text, component text 133/135, is unchanged) |
| `firing.json` | `salvageCoins` → `flawedSaleCoins: 2` (L284) |
| `components.json` | Heat markers row deleted; Wood row note (L92) |
| `round_structure.json` | firing summary (L134) |
| `asset_specs.json` | `markers.heatMarkers` deleted; `kilnMasterMarker.note` "Placed face up on a ceramic when it is loaded" (not "a Heat marker for all rules") |
| `orders.json`, `imperial_progress.json` | unchanged |

Types: `GameConfigDefinition` (`setupDeal: { startingOrders: number }`, `setupFaceUpMainOrders: number`, `decorations: Decoration[]`, `formingCoins: number`); `LocationEffectsById` (`form_decorate.shifu.twoVesselDiscount`; `glaze_load.{apprentice,shifu}.sharedKilnWood`, no `placesHeatMarker`; `magistrates_hall.shifu.crownOrders`); `KilnParamsById.GE` `{ fromQualities: Quality[]; toQuality: Quality; vpPerDeliveredCrackle: number }`; `TechTiming` loses `"heat_marker_step"`, gains `"when_loading"`; `FiringDefinition.flawedSaleCoins`; `CostLineKind`: `"decoration"` → `"vessel_coins"`, `"shifu_decoration_discount"` → `"shifu_discount"`, adds `"kiln_fuel"`. `content.ts`: `decorationCost(d)` → `vesselCoins()` (= `formingCoins`); validation: Glaze & Load `sharedKilnWood` equal for both effects and ≥ 0; Magistrate's Hall `crownOrders` 0 for the Apprentice (absent) and 1 for the Shifu; GE `fromQualities` ⊆ {fine, standard}; `setupFaceUpMainOrders` ≥ 1.

### 15.9 Module behaviour

#### 15.9.1 `setup.ts` (change 32, R23; L115–116, L122, L125)

`createInitialState`, draw order (DESIGN §7, revised): 1. shuffle the Starting deck; 2. shuffle the Main deck; 3. deal 2 Starting Orders to each player in seat order (secret); 4. undealt Starting Orders to the box; 5. reveal 6 Main Orders from the top (**no reshuffle**, nothing Main was dealt); 6. Tech decks; 7. Fire deck; 8. First Player. Hands hold only the 2 Starting Orders. `ORDERS_DEALT` per seat without Main. Resources from `startingResources` for every seat (no seat Coin, change 35).

`SELECT_KILN { kilnId, mainOrder }` (phase `setup_kiln_selection`, the player at `index`):

- **Validate:** Kiln available (`KILN_UNAVAILABLE`); `market.display[mainOrder.slotIndex] === mainOrder.orderId` (`ORDER_NOT_AVAILABLE`).
- **Resolve:** set the Kiln, `KILN_SELECTED`; `takeFaceUpOrder` + `addToHand` + `ORDER_RESERVED{via: "setup", source: "face_up"}`; `refillMainDisplay(draft, "setup", ctx)` at once (slide left, reveal into the rightmost position, as L386 refills; clears `refillPendingFor`); next player, or `setup_done` after the last.

#### 15.9.2 `work/materialsYard.ts` (change 34)

The split must total `resources` (4 or 8); Senior Apprentice 8; Prepared Clay after the split pays Clay + 1 and `formingCoins` (2).

#### 15.9.3 Forming (change 30): `work/formDecorate.ts`, `work/materialsYard.ts`, `legalActions.ts`

No behaviour change. Each vessel costs its Shape's Clay + `formingCoins`; the Shifu's −1 (`twoVesselDiscount`) when forming 2, Decorator's Kit's −1 on a Carved/Impressed/Painted vessel (T16 `decorations`), Ding's extra vessel at 1 Clay + 1 Coin outside every reduction, Large Throwing Wheel's −2 Clay. Cost lines `vessel_coins` and `shifu_discount`. `canFormAny` already counts the reductions (L186). Messages and comments say "a vessel's cost", never "a Decoration cost".

#### 15.9.4 Glaze & Load: fuel and Kiln Master (changes 31, 34, 35; R22, R24) — `work/glazeLoad.ts`, `kilnLoading.ts`

- `kilnLoading.glazeLoadFuel(): number` = `LOCATIONS.glaze_load.effects.apprentice.sharedKilnWood` (1; content validation makes both effects equal).
- `actionFuel(loads, loadedBy)`: `loadedBy === "glaze_load" && loads.some(shared) ? glazeLoadFuel() : 0` (R24: 1 in total).
- `simulateLoad`, for a Shared destination when `loadedBy === "glaze_load"`: the player's Wood ≥ `glazeLoadFuel()`, else `INSUFFICIENT_RESOURCES` (§15.7). So `loadDestinationOptions` offers no Shared destination to a player without Wood, and the second load of a Shifu action needs no more Wood than the first.
- `simulateLoad`, step 5 (after Kiln Furniture): `kilnMaster` given → T24 owned (`TECH_NOT_OWNED`), ready and not used by an earlier load of this command (`TECH_ALREADY_USED`); the value is in `T24.params.values`.
- `hasAnyLegalLoad(game, pid)` (R5 as changed): a Shaped vessel exists, and either the player's Imperial Kiln is gained and empty, or the player has `glazeLoadFuel()` Wood and an open Shared space (R5a) or an Inverted Firing target with a stackable Shaped vessel (R5c, current Shapes, P3).
- `PLACE_GLAZE_LOAD` resolve: `placeWorker`; if `actionFuel > 0`, `spend(wood: 1, reason: "kiln_fuel")`; the loads in order (`loadCeramic`); Kiln Tending afterwards (it can never pay this action's fuel). The `heatMarkerCeramicId` branch is deleted.
- `loadCeramic`: the new ceramic gets `kilnMasterMarker: spec.kilnMaster ?? null`; when set, `markTechUsed(T24)` and `KILN_MASTER_PLACED` after the load's other events.
- `quoteGlazeLoad(view, action): CostQuote` (new, for the UI): a `kiln_fuel` line (wood 1) when any load goes into the Shared Kiln; `ok`/`error` from the validator.

#### 15.9.5 Imperial Priority (R10, R22) — `work/windowAbilities.ts`

`USE_IMPERIAL_PRIORITY` passes `kilnMaster` into its `LoadSpec`; no Wood (`loadedBy: "imperial_priority"` never pays fuel); Reworking Table as before (P1).

#### 15.9.6 Magistrate's Hall (change 33, R21) — `work/centralSimple.ts`

- **Validate:** unchanged placement and Recognition gate; cost 4 for both effects (data). With `crownOrder`: Shifu effect only (`NOT_SHIFU_EFFECT`; Senior Apprentice never applies here, R12); `display[slotIndex] === orderId` (`ORDER_NOT_AVAILABLE`); the Order shows ≥ 1 Crown (`INVALID_TARGET`, reason `no_crown`).
- **Resolve:** pay 4 Coins; advance 1 step (milestones resolve, `advanceRecognitionStep`); then, if `crownOrder`: `takeFaceUpOrder` (position empty, `refillPendingFor`), `addToHand`, `ORDER_RESERVED{via: "magistrates_hall", source: "face_up"}`; `workerActionDone`. The deferred refill runs in `endTurn` with any other face-up reservation of the turn (L386).
- One command: everything the choice depends on (the display, the Recognition step and its public milestone) is known when it is made (DESIGN §1 principle 4).

#### 15.9.7 Select N discards (R25) — `work/select.ts`, `market.ts`

- `resolveSelectPicks`: the looked cards not reserved go to `discardMainOrders(draft, rest)` (face down, in look order, the last on top; no RNG) and `LOOKED_ORDERS_DISCARDED` is emitted. Used by all three Selects through `SELECT_CHOOSE`.
- `putMainOrdersOnBottom` is deleted with its R19 shuffle and its tests. `discardMainOrders` JSDoc names the Selects. `takeTopMainOrders` unchanged (B1, R16: reshuffle only when the deck is empty as the look starts; R17 for the swap).
- `lookCount`, `selectReservable`, `swapLookCount` unchanged. `SELECT_CHOOSE` uses no randomness any more.

#### 15.9.8 Firing pipeline (changes 28, 31) — `firing/pipeline.ts`, `firing/heat.ts`

- Delete step 5: `ownFaceDownMarker`, `kilnMasterTargets`, `heatMarkerStepEligible`, `openHeatMarkerStep`, `advanceHeatMarkers`, `heatMarkerStepOptions`, the `RESOLVE_HEAT_MARKERS` handler and the face-down invariant before the Fire reveal.
- Test Pieces (`firing_test_pieces`) unchanged; it hands over to `revealFireAndCalculate`.
- `revealFireAndCalculate`: `kilnMasterMarker: ceramic.kilnMasterMarker ?? 0` in each `heatCalculation`; Shared: Global Heat + (Kiln Furniture ?? zone) + marker; Imperial: Kiln Die + Fire + Imperial modifier + marker.
- `heat.ts`: `HeatCalculationInput.kilnMasterMarker`; `markerValue` and `heatMarkerOf` deleted; new `state.kilnMasterCarrier(game, playerId): LoadedCeramic | null`; `heatPreviews` uses the marker (known since loading).
- Jun (`firing_heat_adjustment`), Quality and Saggars' floor unchanged.

#### 15.9.9 Ge (change 29) — `firing/afterQuality.ts`, `orders/completion.ts`

- After-Quality eligibility and `USE_GE_CRACKLE`: a ceramic of yours from this firing, not sold, whose Quality is in `GE.params.fromQualities` (Fine or Standard); else `INVALID_TARGET` `not_fine_or_standard`.
- Resolve: `markKilnAbilityUsed`; `record.crackle = true`; history `{cause: "ge_crackle", from, to: "fine"}`; `QUALITY_IMPROVED` only when `from === "standard"`; `CRACKLE_APPLIED`.
- With Protective Saggars: Saggars' Standard → Fine first, then Crackle on the same ceramic is legal (L641); Crackle first leaves no Standard for Saggars on that ceramic.
- `resolveOrderCompletion`: after the printed rewards, Crowns, Tribute Ware, Ru/Guan and Canal Barge, `crackleVp = (delivered ceramics with crackle) × GE.params.vpPerDeliveredCrackle`; `score.kilnAbilities += crackleVp`; `record.crackleVp`. Automatic, no allowance, no decline; it never counts as a Crown or a Masterpiece (tie-breakers unchanged).
- `completionTriggers` / `OrderMatchOption.triggers.crackleVp: number` (informational).

#### 15.9.10 Second Firing and Jun (change 30) — `firing/afterQuality.ts`

Unchanged behaviour: the recalculation keeps Base Heat (Kiln Die for the Imperial Kiln), the position modifier and `first.kilnMasterMarker`; Jun from the first calculation does not carry over; an unused Jun may be applied by `SECOND_FIRING_CHOOSE.jun` before the new Quality (L627, formerly R7). Comments and clarifications cite L627.

#### 15.9.11 Selling a Flawed ceramic (change 30, R20) — new `flawedSale.ts` (layer 3) and `flawedSaleHandler.ts` (layer 5)

`src/game/flawedSale.ts` (layer 3, state and firing-record helpers only):

- `sellableFlawed(game, playerId): CeramicId[]`, in sequence order: the player's `finished` ceramics with Quality Flawed; and, only while `game.phase.type === "firing_after_quality"`, the player's records of this firing with `quality === "flawed"` and `!sold`.
- `saleWindowError(view)`: `work_turn` with the viewer active and `step.kind` ∈ {`before_action`, `after_action`}; `orders` with the viewer's turn; `firing_after_quality` with the viewer at the queue head; `cleanup_hand_limit` with the viewer pending. Else `WRONG_PHASE` (in a Work sub-step "Finish your worker action first.").
- `sellFlawedCeramic(draft, playerId, ceramicId, ctx)`: a Finished ceramic is deleted from `ceramics` and its Vessel card returned; a ceramic of this firing gets `record.sold = true`, leaves its kiln space (Kiln Furniture beneath it moves to the ceramic left in a stacked space, or returns, as the salvage code did), is deleted and its Vessel card returned. Then `CERAMIC_SOLD` and `gain(coins: flawedSaleCoins, reason: "flawed_sale")`.
- `sellFlawedOptions(view): { ceramicIds: CeramicId[]; coins: number } | null` (replaces `salvageOptions`): non-null when the viewer is in a sale window with ≥ 1 sellable ceramic.

`src/game/flawedSaleHandler.ts` (layer 5, so it may call the layer-4 continuations; `engine.ts` adds its `handlers`): `SELL_FLAWED`, `phases: ["work_turn", "orders", "firing_after_quality", "cleanup_hand_limit"]`.

- **Validate:** `saleWindowError`; the ceramic exists (`CERAMIC_NOT_FOUND`), is the viewer's (`CERAMIC_NOT_OWNED`) and is in `sellableFlawed` (`INVALID_TARGET`, `not_flawed`).
- **Resolve:** `sellFlawedCeramic`, then by phase: `firing_after_quality` → `afterQuality.continueAfterSale(draft, actorId, ctx)` (exported wrapper of `afterAbilityUsed`: the turn passes when no after-Quality option is left); `orders` → `orders/phase.continueAfterSale(draft, actorId, ctx)` (ends the Order turn automatically when nothing is completable and nothing sellable is left); `work_turn` and `cleanup_hand_limit` → no change of step.

Deleted: `openSalvage`, `salvageable`, `salvageOptions`, `discardSalvagedCeramic` (moved into `sellFlawedCeramic`), the `SALVAGE_FLAWED` handler.

#### 15.9.12 Order Phase — `orders/phase.ts`

`startNextTurn` skips a player only when `!hasCompletableOrder && sellableFlawed(...).length === 0` (INT Order Phase, revision 4: R20 names the Order Phase turn as a sale window, and a Flawed ceramic fired in Round 5 can be sold only there or in its owner's after-Quality turn, since the Round 5 Cleanup trim is skipped). After `COMPLETE_ORDER` or `SELL_FLAWED`, the same test ends the turn automatically. Crackle VP is recorded in `resolveOrderCompletion` (§15.9.9).

#### 15.9.13 Cleanup — `round.ts`

Unchanged, except that a pending player may send `SELL_FLAWED` before `DISCARD_TO_HAND_LIMIT` (they stay pending).

#### 15.9.14 Other modules

- `work/turn.ts`: `endTurn`'s deferred refill also covers the Magistrate's Hall Shifu's Crown Order (it sets `refillPendingFor`). `afterActionWindowOpen` unchanged: a sellable Flawed ceramic opens no window (the sale waits for the next own turn).
- `state.ts`: `decisionPrompt` without the two phases; `kilnMasterCarrier`; `heatMarkerOf` deleted.
- `view.ts`: unchanged (the marker was public).
- `engine.ts`: handler table (§15.5), including `flawedSaleHandler.ts`. `index.ts`: barrel exports `sellFlawedOptions`, `setupChoiceOptions`, `kilnMasterOption`, `quoteGlazeLoad`; drops `heatMarkerStepOptions`, `heatMarkerTargets`, `salvageOptions`.
- `scoring.ts`: unchanged (Crackle VP is in the ledger).

### 15.10 Legality ("at least 1 instance of the main action", L156)

| Location | Revision 4 |
| --- | --- |
| Materials Yard | always (4 or 8) |
| Form & Decorate | the full cost of 1 vessel after reductions (L186): unchanged `canFormAny` |
| Glaze & Load | a Shaped vessel with a destination you can pay for: your own empty Imperial Kiln, or (with 1 Wood) an open Shared space or an Inverted Firing target (L198, R5 as changed) |
| Commission Market, Guild Hall, Canal Wharf | unchanged |
| Magistrate's Hall | unchanged gate (Recognition 0–2, capacity) and 4 Coins for both workers; the Crown Order is optional and never affects legality |

### 15.11 Progress guarantee and automatic steps

- `setup_kiln_selection`: always an available Kiln (5 ≥ 4) and 6 face-up Orders (the Main deck still holds at least 39 cards at the last take).
- `orders`: `END_ORDER_TURN` always legal; a turn opens only with something to complete or sell.
- `firing_after_quality`: `END_AFTER_QUALITY` always legal.
- `cleanup_hand_limit`: `DISCARD_TO_HAND_LIMIT` as before; `SELL_FLAWED` never blocks it.
- Automatic, never declined: kiln fuel (a cost); Crackle VP; the setup refill after each take.

### 15.12 Invariants (`invariants.ts`)

- **Markers:** replace `checkMarkers`: every `kilnMasterMarker` is ±1 and sits on a `loaded` ceramic; at most 1 loaded ceramic per owner carries one, the owner owns T24 and its allowance is used this round (the existing "used" check); a firing record's `first` (and `second`) has `kilnMasterMarker === (ceramic.kilnMasterMarker ?? 0)` while the ceramic is loaded.
- **Phases:** `FIRING_PHASES` without `firing_heat_markers` and `firing_salvage`; the Fire card is revealed exactly in `firing_heat_adjustment`, `firing_after_quality` and `firing_second_firing_choice`.
- **Sold:** `record.sold ⇒` no ceramic with that ID; the stacked-space exception names `sold` (a ceramic sold from beneath a stack).
- **Setup:** in `setup_kiln_selection`, the display has no empty position and `refillPendingFor === null`; a player who has chosen a Kiln holds 2 Starting Orders and 1 Main Order, one who has not holds 2 Starting Orders and no Main Order.
- **Crackle:** `record.crackleVp` = the delivered Crackle ceramics of that Order × `vpPerDeliveredCrackle`, and is 0 unless the player has the Ge Kiln; `score.kilnAbilities` = Σ `kilnAbility.vp` + Σ `crackleVp`; a Crackle ceramic is Fine (unchanged).
- Order conservation unchanged (the looked cards are now in the discard). Kiln fuel leaves no state to check.

### 15.13 Selectors and legal actions

Selectors:

- Deleted: `heatMarkerStepOptions`, `heatMarkerTargets`, `salvageOptions`; `HeatMarkerStepOptions`, `SalvageOptions`.
- New: `setupChoiceOptions(view): { kilns: KilnSelectionOption[]; faceUpSlots: number[] } | null` (the chooser only); `kilnMasterOption(view, playerId): { ready: boolean; values: HeatDelta[] } | null` (null without T24); `sellFlawedOptions(view)`; `quoteGlazeLoad(view, action)`.
- Changed: `magistratesHallQuote(view, effect)` adds `crownOrderSlots: number[]` (Shifu effect: display positions holding an Order with ≥ 1 Crown; `[]` for the Apprentice); `ImperialPriorityOptions.kilnMaster: boolean`; `materialsYardOptions.resources` 4 / 8; `afterQualityOptions` Ge lists Fine and Standard; `OrderMatchOption.triggers.crackleVp`; `PlayerSummary.heatMarkerCeramicId` deleted (`kilnMasterCeramicId` from `kilnMasterCarrier`); `FiringStageCeramic.kilnMasterMarker: HeatDelta | null` (was `marker`) and `sold` (was `salvaged`); `FiringStageView.step` / `firstPlayerOrder` per §15.4. The key allow-list test (D3) follows. `heatPreviews.heatBeforeFire`: known once Base Heat is.

`legalActions` families:

| Family | Candidates |
| --- | --- |
| `SELECT_KILN` | every available Kiln × every face-up slot |
| `PLACE_MATERIALS_YARD` | splits 0..4 or 0..8 × Senior Apprentice × Prepared Clay |
| `PLACE_GLAZE_LOAD` | as before (destinations already exclude the Shared Kiln without Wood); canonical: Kiln Master {none, +1, −1} on the first load of each candidate when T24 is ready; exhaustive: on any one load |
| `USE_IMPERIAL_PRIORITY` | × Kiln Master {none, +1, −1} when ready |
| `PLACE_MAGISTRATES_HALL` | per worker option; for the Shifu effect also × each `crownOrderSlots` entry |
| `USE_GE_CRACKLE` | each Fine or Standard target |
| `SELL_FLAWED` | each `sellFlawedOptions` ceramic, in the families of `work_turn` (`before_action`, `after_action`), `orders`, `firing_after_quality` and `cleanup_hand_limit` |
| removed | `RESOLVE_HEAT_MARKERS`, `SALVAGE_FLAWED` |

`sampleLegalAction` and `legalActionFamilies` follow; the agreement property covers the new selectors; the perf fixture stays under 50 ms.

### 15.14 Hidden information

| Item | Lives in | Visible to | Public |
| --- | --- | --- | --- |
| A Select's unreserved looked cards (R25) | Main discard, face down; `LOOKED_ORDERS_DISCARDED.secret` | the looker | `count`, `counts.mainDiscard` |
| The Setup Main Order take (L122) | hand; `ORDER_RESERVED{via: "setup"}` | everyone | the Order |
| The Magistrate's Hall Shifu's Crown Order | hand; `ORDER_RESERVED{via: "magistrates_hall"}` | everyone | the Order |
| Kiln Master's marker (L635) | the loaded ceramic | everyone | value |
| A sale (`CERAMIC_SOLD`) | — | everyone | all |

- `ORDERS_DEALT.secret` carries only the 2 Starting Orders; `privacy_setup` checks it.
- Deleted rows: the face-down Heat marker (it never held a value).
- Inference channels: the Order Phase now opens for a player with a Flawed ceramic (public) as well as one with something completable (hidden, as before; DESIGN §4.5 accepted the skip). The after-action window is unchanged. A card a seat saw in a look and then discarded may come back through a reshuffle into another seat's unseen draw or look, or face up on the display: `tools/fixturePrivacy.ts` treats it as `rehidden` (stage 6 logic), now with `LOOKED_ORDERS_DISCARDED`.

### 15.15 Determinism

- Setup consumes one shuffle fewer (the Main deck is not reshuffled at step 5); every seeded game moves, and seed-pinned tests are re-recorded. The design planned to re-baseline the fuzz seed base (7400 → 7700); it stays at 7400, because every fuzz coverage check passes there (§15.20 implementation notes).
- `SELECT_CHOOSE` consumes no randomness (R19's shuffle is gone). Main deck reshuffles (`MAIN_DECK_RESHUFFLED`) become reachable in long games (R25); the fuzz sets must include a game that reshuffles the Main discard, at the start of a look (R16) and at a Canal Wharf draw or display refill.

### 15.16 Platform

- `service.ts` (`CURRENT_SCHEMA_VERSION = 9`), `projection.ts`, `inMemoryStore.ts` (`^r32-`), `client.ts`, `store.ts`, `types.ts` comments: schema 9, `r32`; schema-8 saves and `r31` rooms are refused, never migrated (`UNSUPPORTED_RULES_VERSION` / `RULES_FINGERPRINT_MISMATCH`).
- `revisionAcceptance` and `computerAdvanceAccepted`: the parallel window is `cleanup_hand_limit` only. `SELL_FLAWED` in that window touches only the actor's own ceramic, so the tolerant revision rule applies to it as to the trim.
- Supabase (nothing deployed; pins edited in place): `202610150001_v161_rules.sql` `^r31-` → `^r32-`, schema 8 → 9, header comment for owner revision 4; `supabase/tests/rls.test.sql`: an `r31` fingerprint is refused; `supabase/README.md`, `supabase/functions/_shared/supabaseStore.ts` comments. `202610150002_playtest_v161.sql`: unchanged (Form V3 has no Heat-marker or salvage field; `kiln_master_used` still means a use).
- `tools/` (keep compiling): `uiFixtures.ts` — m3 (Heat-marker step) becomes "Glaze & Load with Kiln Master's marker" or is removed; m14 (salvage) becomes "Order Phase: sell a Flawed ceramic"; m15 shows the Setup choice with the display; m6 notes Crackle VP; m18 Second Firing keeps R7's Jun; the Heat-marker and salvage option fields go, `sellFlawedOptions`, `setupChoiceOptions`, `kilnMasterOption` come in; outputs regenerate in the UI stage. `fixturePrivacy.ts` — `LOOKED_ORDERS_DISCARDED`; `ORDERS_DEALT` without Main; the `setup` and `magistrates_hall` reservations are public. `localBackendV161.ts` — pins and comments.
- `src/app`, `e2e`, `test/v161/ui`: the UI stage (`npm run typecheck` may fail until then).

### 15.17 Computer policy (`computerPlayer.ts`, `computerFallback.ts`)

Heuristics, not rules; `computer_strength` thresholds may be re-baselined with the reason recorded.

1. **Setup (`decideSetup`, replaces `decideKiln`):** the Kiln by `KILN_PREFERENCE` among the available ones; the Main Order = the face-up slot with the highest `reservationValue`, valued as if that Kiln were taken (a copy of the view with `kilnId` set); ties → the lowest slot.
2. **Materials Yard:** totals 4 / 8 (from data); `materialsSplit` keeps 1 Wood per Glaze & Load action into the Shared Kiln it plans this round and the next, before Contribution, Jun and Test Pieces Wood; `resourceValue` raises Wood's weight accordingly.
3. **Glaze & Load:** the planner's `GL` step needs 1 Wood when any planned load goes into the Shared Kiln (`next.wood -= 1`; an Imperial-only action pays none) and returns null without it; `buildGlazeLoad` drops the Heat-marker branch and adds Kiln Master: when T24 is ready, the best of {none, +1, −1} on one load by the same expected-Quality model that picks Glaze and zone (the target-heat distribution), with a 0.01 bias to "none".
4. **Imperial Priority:** the same Kiln Master choice; no Wood.
5. **Magistrate's Hall:** cost 4 for both effects; the Shifu's value adds the best face-up Crown Order's `reservationValue` when it clears the overflow threshold (`reservationOverflows`); `buildPlacement("MH")` names it in `crownOrder`, else omits it.
6. **Firing:** delete `decideHeatMarkers` and every face-down "flexible" marker in `decideContribution`, `rivalPushDist` and the quality models; Actual Heat terms use `kilnMasterMarker`.
7. **Ge:** `decideAfterQuality` offers Ge on Fine and Standard ceramics: gain = (Fine − Standard utility if Standard) + the Crackle value (wildcard + 1 VP when delivered, ≈ 0.7 at the current plan's delivery odds); with Saggars it evaluates both orders. `completionReward` adds `crackleVp`; the Order planner prefers delivering Crackle ceramics.
8. **Sale:** `decideSellFlawed`: in `before_action`, the Order Phase turn and the Cleanup trim, sell every Finished Flawed ceramic (one command each) before any other choice; in the after-Quality turn sell nothing (Second Firing may still use the ceramic; the Order Phase turn always opens for a sale). `techValue(T11)` loses the salvage term.
9. **Select N (R25):** no change (`unknownMainOrders` never modelled the deck bottom).
10. **Fuel Ledger:** `techValue(T12)` accounts for the cost of 4.
11. **Fallback:** `setup_kiln_selection` → the first available Kiln with the first face-up slot; `firing_heat_markers` and `firing_salvage` branches deleted; the Order Phase still `END_ORDER_TURN` (no sale); `PLACE_GLAZE_LOAD` fallbacks come from `legalCommands`, which respect the fuel.

### 15.18 Test plan

Engine (`test/v161/engine`):

| File | Cases |
| --- | --- |
| `setup.test.ts`, `privacy_setup.test.ts`, `support/fixtures.ts` | schema 9; 2 Starting Orders each, no Main dealt; the undealt Starting Orders boxed (none at 4 players); 6 face-up, no reshuffle (draw order); every seat 2 Clay / 3 Wood / 3 Coins (no seat Coin); reverse turn order; one `SELECT_KILN` takes the Kiln and a face-up Order (R23), public `ORDER_RESERVED{via: "setup"}`, the display refilled before the next player (slide left); stale slot `ORDER_NOT_AVAILABLE`; missing `mainOrder` `MALFORMED_ACTION`; each player ends with 2 Starting + 1 Main; `ORDERS_DEALT` secret holds Starting Orders only |
| `materials_yard.test.ts`, `placement_legality_materials.test.ts` | Apprentice 4 and Shifu 8 in every split; Senior Apprentice 8; Prepared Clay after the 8 |
| `form_decorate.test.ts`, `vessels.test.ts` | Clay + 2 Coins for each Decoration; Shifu −1 forming 2; Decorator's Kit −1 on Carved/Impressed/Painted, not Plain; both on one vessel (0); Ding 1 + 1; legality after reductions; cost lines `vessel_coins`, `shifu_discount` |
| `glaze_load.test.ts`, `kiln_loading.test.ts`, `placement_legality_personal.test.ts` | Apprentice Shared 1 Wood, Imperial 0; Shifu 2 Shared 1 Wood, Shared + Imperial 1 (R24), Imperial only impossible twice (1 Imperial load); 0 Wood: Shared refused `INSUFFICIENT_RESOURCES`, Imperial allowed, `loadDestinationOptions` without Shared, placement illegal without an Imperial Kiln; Inverted Firing stack pays once; Kiln Tending after the fuel; `heatMarkerCeramicId` `MALFORMED_ACTION`; `RESOURCES_CHANGED{kiln_fuel}` |
| `kiln_master.test.ts` (replaces `heat_markers.test.ts`) | at a Glaze & Load load (Apprentice, Shifu either load), at Imperial Priority, into the Shared and the Imperial Kiln (R22); once per round (`TECH_ALREADY_USED` the second time, and on 2 loads of one command); optional; acquired the same round then used; ±1 in Actual Heat with zone, Kiln Furniture and Imperial modifier; Jun on top; kept in a Second Firing recalculation; public; returned at the finish |
| `imperial_priority.test.ts` | free (no Wood with 0 Wood); Kiln Master |
| `simple_locations.test.ts`, `recognition.test.ts` | Magistrate's Hall: Apprentice and Shifu 4 Coins; the Shifu reserves a Crown Order after the step (milestone first); optional (R21); no Crown Order showing → nothing; a non-Crown pick `INVALID_TARGET` `no_crown`; an Apprentice's pick `NOT_SHIFU_EFFECT`; stale slot; the position empty until the turn ends, then one refill with other face-up reservations; Senior Apprentice never applies |
| `commission_market.test.ts`, `colour_samples_swap.test.ts`, `guild_hall.test.ts`, `market.test.ts` | R25: the unreserved looked cards go to the Main discard (count +n, deck count unchanged by the return), `LOOKED_ORDERS_DISCARDED` secret to the looker in look order, no RNG used; a later look on an empty deck reshuffles the discard first (B1, R16) and never mid-look; the swap's discarded Order and looked cards may come back (R17); `putMainOrdersOnBottom` tests removed |
| `firing_flow.test.ts`, `test_pieces.test.ts`, `heat_quality.test.ts`, `heat_adjustment.test.ts` | no Heat-marker phase; Base Heat → Test Pieces → Fire → Actual Heat → Jun → Quality → after-Quality → finish; Test Pieces before the Fire reveal; calculations with `kilnMasterMarker` |
| `after_quality.test.ts` | Ge on Standard (→ Fine, `QUALITY_IMPROVED`) and on Fine (no `QUALITY_IMPROVED`, Crackle); not on Flawed or Masterpiece (`not_fine_or_standard`); Saggars then Ge on the same ceramic; Ge then Saggars refused; selling a Flawed ceramic of this firing in the own after-Quality turn (kiln space emptied, stacked case, Kiln Furniture moved), then Second Firing impossible on it; the turn passes when nothing is left |
| `flawed_sale.test.ts` (new) | each sale window (before/after action, Order turn, after-Quality head, pending Cleanup) accepts; refused during another player's turn (`NOT_YOUR_DECISION`), in the Contribution window, in Work sub-steps, Test Pieces, Jun, Second Firing choice, Setter's Mark, Setup (`WRONG_PHASE`); Finished Flawed only (Standard, delivered, other's refused); 2 Coins, Vessel card returned; Saggars owner never has one |
| `order_phase.test.ts`, `kilns_orders.test.ts`, `scoring.test.ts` | the Order turn opens for a Flawed ceramic with nothing completable and closes after the sale; Round 5 sale before scoring; Crackle VP: 1 per delivered Crackle ceramic, several in one Order, recorded in `crackleVp` and `kilnAbilities`, final breakdown, no tie-breaker effect |
| `cleanup.test.ts` | a pending player sells, stays pending, then trims |
| `content_contract.test.ts`, `source_of_truth.test.ts`, `localization_content.test.ts` | the revision-4 rows and numbers (MY [4]/[8], F&D, G&L, MH Shifu [4, 1, 1], T12 4, T24, GE, Setup L115–125, components, Appendix D, timing vocabulary, quick reference, the Decorations paragraph L336); the checksums; the new reasons and `PHASE_TEXT` |
| `rules_fingerprint.test.ts` | revision 32; data changes move the digest |
| `action_guard.test.ts`, `errors.test.ts` | new shapes; deleted commands and `heatMarkerCeramicId` `MALFORMED_ACTION`; `HEAT_MARKER_INVALID` gone |
| `invariants.test.ts`, `projection_privacy.test.ts`, `legal_actions*.test.ts`, `selector_agreement.test.ts`, `ui_selectors.test.ts`, `tech_matrix.test.ts`, `ability_cases.ts`, `optional_abilities.test.ts`, `fuzz.test.ts`, `determinism.test.ts`, `fixtures.test.ts`, `state_helpers.test.ts`, `p7_support.ts`, `phase_scenarios.ts`, `ui_support.ts` | §15.12 checks on broken states; new families and selectors; Kiln Master, the Crown Order and the sale as optional rows, fuel and Crackle VP as automatic; full games for 2/3/4 players reach `finished` with the new seed base |

Platform (`test/v161/platform`): `rules_fingerprint_gate`, `client_compatibility`, `supabase_contract`, `local_backend_v161`, `tsconfig_includes` (schema 9, `r32`; `r31` refused); `parallel_windows` (salvage window gone; a sale in Cleanup under the tolerant rule); `multiplayer_privacy`, `reconnect` (the setup choice and a Magistrate's Hall Crown Order are public; looked cards discarded stay private); `privacy_full_games` (R25 discards and a Main reshuffle reached); `fixture_privacy_oracle` (`LOOKED_ORDERS_DISCARDED`); `computer_decisions` (setup pick; fuel kept; Kiln Master at loading; Crown Order; Ge on Fine; selling); `computer_legality` (every revision-4 step); `computer_fallback`; `computer_full_games`, `online_computer_player`, `multiplayer_computer_turns`, `computer_strength`.

Gates for every stage: `npm run typecheck:engine`, `npm run typecheck:platform`, `npm run typecheck:edge`, `npx vitest run test/v161/engine test/v161/platform`, `npm run test:fuzz:long`, `npm run print:orders`.

### 15.19 Documents and content

- **Clarifications** (`KILN_OPENING_v1.6.2_CLARIFICATIONS.md`, content stage): re-cite every `L` tag to revision-4 lines; `CLARIFICATION_TAG` accepts R1–R25 and the contract refuses R3, R6, R9, R14 and R19. Retire: the Heat-marker items (T15 "A Heat marker is not a zone modifier", T24's three items, `glaze_load` R9 and the two Heat-marker-step items, JU's "Heat markers included" and "either a Heat marker or …"), T13's "before any Heat marker is turned", T11's salvage item, GE's "never a Masterpiece" and "cannot both apply" items, T16/`form_decorate`'s "Every Decoration costs 2 Coins", the R19 / deck-bottom items (T10, `commission_market` B3 · R19, the Main Orders item). Add: Kiln Master at loading (R22), kiln fuel (`glaze_load`, R24), the sale (R20) on the Flawed / Imperial / milestone or location items that fit, Ge's targets and Crackle VP, the Magistrate's Hall Shifu's Crown Order (R21), the Setup choice (R23), R25 on T10 and `commission_market`, and L627 on T14 and JU. The revision notes list the count.
- **Component text source** (`KILN_OPENING_v1.6.2_COMPONENT_TEXT_SOURCE.md`): lines 3/5, 15/17, 25/27, 84/86, 94/96, 128/130; `SHORT_TEXT_SECONDARY_LABELS` unchanged unless a new bold clause appears (none does).
- **Glossary** (`GLOSSARY_ZH_V1.6.1.md`): retire 火标, 翻火标, 暗置火标, 折卖; add 卖出 (sell a Flawed ceramic), 烧窑要烧柴 / 柴 for kiln fuel, 窑工标 placed at loading, the Magistrate's Hall Shifu's 承接榜上1张御令委托, the Setup choice; the Select N row (其余弃置); the error reasons of §15.7.
- `IMPLEMENTATION_DECISIONS.md`, `ONLINE_GAME_SPEC.md`, `DESIGN_SPEC.md`, `UI_V1.6.1_ARCHITECTURE.md`, `ENGINE_V1.6.1_DESIGN.md` (header note), `supabase/README.md`: the Heat marker, salvage, deck bottom and versions.
- **`AGENTS.md`** (the owner's file). The owner's commit `4496862` (2026-10-23) brought its Key facts, Hidden information, Tests and Removed lists to revision 4 and R25. The review step (2026-10-23, with the owner's permission to edit those four lists only) then fixed what in them still described revision 3: the Materials Yard Shifu's "gains 6" in the Removed list (now 8, change 34); "Ge following Saggars' upgrade on the same ceramic", which the Removed list still forbade although revision 4 allows it again (rev. 4 L641; now listed as revision 3's ban, removed); "Heat markers once turned" among the public ceramic attributes (now Kiln Master's face-up marker); the Fire run-out citation (rev. 4 L636); and the reconnect test bullet (now including the Setup pick). Still describing revision 3, outside the lists that step could edit, for the owner:
  - the "V1.6.2 changes from V1.6.1" bullets: "**Materials Yard** Shifu gains 6 Clay/Wood" (now 8, change 34) and "Fuel Ledger (cost 2)" (now 4, change 30);
  - source item 2: "owner rulings (R1–R19, B1–B3, …)" (the audit now holds R20–R25).

### 15.20 Stages

1. **Stage 8 (landed):** design (§15) and records (audit, `GAME_RULES.md`).
2. **Stage 9 (landed), engine:** §15.2–§15.15 with the mechanical data values (§15.8) and the engine tests (§15.18).
3. **Stage 10 (landed), content:** the data texts from revision-4 lines, clarifications, component text source, glossary and the content contract. The renumbering of the remaining code and test citations to revision-4 lines (the audit's map) stays with the renumbering pass.
4. **Stage 11 (landed), platform and computer:** §15.16–§15.17 and the platform tests; `npm run test:fuzz:long`.
5. **UI stage (later):** `src/app`, `e2e`, `test/v161/ui`, fixtures regenerated.

**Implementation note (setup and Work Phase step, 2026-10-23).** The engine work was split. The first step implemented Setup (§15.9.1), the Materials Yard, forming, Glaze & Load with kiln fuel and Kiln Master at loading, Imperial Priority, the Magistrate's Hall Shifu and Fuel Ledger's cost of 4 (§15.9.1–§15.9.6), with schema 9, revision 32 and the `r32` pins. Kiln Master's marker at loading replaces the Heat marker, so that step also took these items from §15.9.8 and §15.4:
- the whole Heat-marker step was removed: the `firing_heat_markers` phase, `RESOLVE_HEAT_MARKERS` and the Heat-marker events;
- `FiringStep` was renumbered to 1–6;
- the platform and computer items those changes touch (§15.16; §15.17 items 1–6, 10 and 11) were done, so the platform tests already pass.

Still to do after that step: Ge (§15.9.9), the sale (§15.9.11, which removes `firing_salvage`; until then the salvage window shows as step 5), R25 (§15.9.7), the Order Phase and Cleanup items, and the content texts (the firing and scoring step below took Ge, the sale and the Order Phase and Cleanup items). `test/v161/engine/support/fixtures.ts` keeps a deprecated `heatMarker` field on loaded `CeramicSpec`, typed only, so that the unmigrated `test/v161/ui/fixtures/tableScenarios.ts` (imported by `tools/uiFixtures.ts`) still compiles. Any value for it is refused at build time. Remove the field in the UI stage. The fuzz seed base stays at 7400 because its coverage checks pass there.

**Implementation note (firing and scoring step, 2026-10-23).** The second engine step implemented the firing and scoring parts: Ge (§15.9.9), the sale (§15.9.11), the Order Phase and Cleanup items (§15.9.12–§15.9.13) and the matching parts of §15.3–§15.7, §15.12–§15.14, §15.16 and §15.17. In detail:
- **Ge:** `KILNS.GE.params` is `{fromQualities: ["fine", "standard"], toQuality: "fine", vpPerDeliveredCrackle: 1}` (content validation added; the DESIGN §6.4 row follows). `USE_GE_CRACKLE` takes a Fine or Standard ceramic of this firing (`INVALID_TARGET` `not_fine_or_standard` otherwise). `QUALITY_IMPROVED` is emitted only for a Standard target; the history records Fine → Fine. Saggars then Ge on one ceramic is legal, and Ge then Saggars is not.
- **Crackle VP:** `resolveOrderCompletion` records `CompletedOrderRecord.crackleVp`, adds it to `score.kilnAbilities` and reports it in `completionTriggers` / `OrderMatchOption.triggers.crackleVp`. The score preview and the final breakdown carry it in the Kiln Tradition line. It has no event of its own: `ORDER_COMPLETED` carries the record.
  - `crackleVp` is optional in the type, and a record without it means 0. The engine always writes it. It is optional only so that the unmigrated `test/v161/ui/fixtures/tableScenarios.ts`, which builds a `CompletedOrderRecord` literal and is reached through `tools/uiFixtures.ts`, still compiles. Make it required in the UI stage.
  - New live invariants: `crackleVp` matches the delivered Crackle ceramics, `score.kilnAbilities` is the sum of Ru/Guan VP and `crackleVp`, and only a Ge player delivers a Crackle ceramic. The rich fuzz start now gives Crackle ceramics only to the Ge seat. Its RNG draws are unchanged, so the seeds are stable.
- **The sale (R20):** `SELL_FLAWED { ceramicId }` lives in `flawedSale.ts` (layer 3: `sellableFlawed`, `saleWindowError`, `sellFlawedOptions`, `sellFlawedCeramic`) and `flawedSaleHandler.ts` (layer 5; `engine.ts` registers it). Its phases are `work_turn`, `orders`, `firing_after_quality` and `cleanup_hand_limit`.
  - In a Work sub-step the error is `WRONG_PHASE` ("Finish your worker action first."). In a sale phase where the game waits for someone else it is `NOT_YOUR_DECISION`.
  - `CERAMIC_SOLD` is public, followed by `RESOURCES_CHANGED{reason: "flawed_sale"}`. `FiringCeramicRecord.sold` and `FiringStageCeramic.sold` replace `salvaged`, and `FIRING.flawedSaleCoins` replaces `salvageCoins`.
  - The `firing_salvage` phase, `SALVAGE_FLAWED`, `CERAMIC_SALVAGED`, `SalvageOptions` and `salvageOptions` are gone. `openAfterQuality` and `advanceAfterQuality` finish the firing directly.
  - After a sale, `afterQuality.continueAfterSale` and `orders/phase.continueAfterSale` let the turn pass when nothing is left to do in it.
  - The Order Phase skips a player only when they have nothing to complete and nothing to sell.
- **Legal actions:** a `SELL_FLAWED` family before the exit of each sale window. The sampler, the selector agreement, the fuzz coverage (`SELL_FLAWED` is reached), the phase scenarios ("Order Phase: sell a Flawed ceramic") and the firing-flow script follow.
- **Platform and computer:**
  - `cleanup_hand_limit` is the only parallel window, and the tolerant revision rule covers a sale there.
  - The strategic policy sells every Finished Flawed ceramic first in a before-action window, an Order Phase turn and a Cleanup trim, but never in the after-Quality turn (§15.17 item 8).
  - The policy values Ge on a Fine ceramic by its Crackle value (wildcard plus 1 VP at the planned delivery odds). With Saggars' only Standard target, Ge is not credited with that Standard → Fine. `completionReward` counts `crackleVp`.
  - The fallback's salvage branch is deleted.
  - `tools/uiFixtures.ts`: m14 becomes "Order Phase: sell a Flawed ceramic", the firing selectors dump `sellFlawedOptions`, and m6 notes Crackle VP.
- **Tests:** `flawed_sale.test.ts` (new), plus `after_quality`, `firing_flow`, `order_phase`, `kilns_orders`, `scoring` (Crackle VP in the final result's Kiln Tradition line, never a Crown or a Masterpiece for the tie-breakers), `invariants`, `dispatcher`, `action_guard`, `contributions`, `heat_quality`, `test_pieces`, `canal_barge`, `ui_selectors`, `state_helpers`, `legal_actions`, `fuzz`, `localization_content` (the new reasons) and `content_contract` (the sale sentence, rev. 4 L282, L284). On the platform side: `parallel_windows` (a sale in Cleanup), `computer_decisions`, `computer_legality` and `computer_fallback`.
- **Not in this step:** R25 (§15.9.7, Select N discards), the content texts (stage 10: GE/T11/T14 texts, clarifications, glossary terms 卖出 and 折卖) and the UI stage. The fuzz seed base stays at 7400, because its coverage checks pass there with `SELL_FLAWED` reached.

**Implementation note (content, computer players and privacy step, 2026-10-23).** The third step implemented R25 (§15.9.7) and the content stage (§15.19), and finished §15.14, §15.17 and the platform part of §15.18:
- **R25 in the engine:** `resolveSelectPicks` discards the unreserved looked cards with `discardMainOrders` (in look order, the last on top, no random draw) and emits `LOOKED_ORDERS_DISCARDED` (public count, the cards in `secret` for the looker). `putMainOrdersOnBottom`, its R19 shuffle, the `LOOKED_ORDERS_TO_BOTTOM` event and their tests are gone; `SELECT_CHOOSE` uses no randomness. Market, Commission Market, Colour Samples, Guild Hall, determinism, projection, reconnect, computer and fixture-privacy tests follow, with new cases for the reshuffle of a discard holding looked cards (at a look's start and at the end-of-turn refill). `CLARIFICATION_TAG` accepts R1–R25.
- **Content:** the Tech, Kiln, component, round-phase and asset texts follow the revision-4 lines (T13, T14, T16, T17, T24, GE, DI; the Heat markers component row and asset entry deleted; the Wood note; the firing summary). The component-text source, the clarifications (renumbered to revision-4 lines; 12 removed, 9 added, 167 in all), the glossary (§1.1–§2.16, §3, §4.4, §4.8, §6–§8, §10), `IMPLEMENTATION_DECISIONS.md` and `ONLINE_GAME_SPEC.md` follow revision 4 and R20–R25. The source checksums are pinned in `source_of_truth.test.ts`, which also refuses the retired revision-3 wording in any data file; the content contract refuses it in any clarification, and the glossary's banned list (`test/v161/support/glossary.ts`) adds 火标, 折卖, 纹饰费, 纹饰减免 and 放到主委托牌堆底.
- **Computer players:** the policy already covered §15.17 items 1–11; new decision cases pin the Imperial-only load without Wood, Wood taken at the Materials Yard for the fuel, and the Magistrate's Hall Shifu's Crown Order.
- **Privacy:** new service cases show the Setup Main Order take, Kiln Master's marker and the Crown Order to every seat while the hands stay secret; the full-game sweep now requires a Select's discarded looked cards and a Main deck reshuffle.
- **Full games:** the fuzz coverage also requires the Setup take, a discarded look, a reshuffle at the start of a look and one for a refill or a Canal Wharf draw, a Flawed sale and Crackle VP; the default seed base stays at 7400, where all of them occur.
- `AGENTS.md` was not edited by this step (the owner's project-instructions file); §15.19 lists what in it still describes revision 3.

**Review note (2026-10-23).** A review of the three steps found and fixed:
- **Crackle and Masterpieces (change 29):** the matcher no longer has a separate `crackle_not_masterpiece` reason (and `REASON_TEXT` no longer says "a Crackle ceramic is never a Masterpiece" / 开片器永远不是臻品). A Crackle ceramic is Fine (`FinishedQuality`), so `orderRank` is the printed Quality and a Masterpiece requirement refuses it with `masterpiece_required`, like any Fine ceramic. Glossary §7 drops 开片器不是臻品.
- **The sale's turn passing:** `ONLINE_GAME_SPEC.md`, the audit's INT and §15.4 said a sale never ends the turn; they now say what the engine does (a Work turn or Cleanup trim is unchanged; an after-Quality or Order Phase turn passes after a sale when nothing is left to do there, which in Round 5 can score the game).
- **Records:** this document's stage status, line-number note and §15.15 (the fuzz seed base stays at 7400); the audit's Versioning bullet; `ENGINE_V1.6.1_DESIGN.md`'s header note and its T24 row (`when_loading`, which `content_contract` now reads instead of overriding); the private-events comment of the Supabase migration (looked cards discarded, R25); stale test comments and citations (`test_pieces`, `localization_content`, `materials_yard`, `order_matching`, `after_quality`).
- **Content:** Test Pieces' L636 item no longer says "Test Pieces owners resolve in First Player order" (revision 4 dropped it, and there is one tile); glossary §2.11 step 1 likewise. The glossary rows and paragraphs revision 4 touched follow the plain register (于 → 在, 装入 → 装进, 空置 → 空着), so the §2.16 button is 装进御窑.
- **Tests:** a Setup-pick reconnect (`reconnect.test.ts`): each seat gets its own hand back mid-pick (the chooser's taken Main Order from the head, since its private deal record names only the Starting Orders), revision, head and audit unchanged, and the pending chooser picks afterwards.
- **`AGENTS.md`** (with the owner's permission, the four lists only): see §15.19.

### 15.21 Rulings and open questions

The owner answered revision 4's questions on 2026-10-23 (audit: R20–R24) and ruled R25 the same day. Recorded as interpretations, not questions (each can change without changing the contract): selling a ceramic of this firing in the own after-Quality turn (R20 names that turn; the ceramic leaves the kiln); the Order Phase turn opening for a sale; the Setup refill after each take sliding left as L386 does; the Magistrate's Hall Shifu's Crown Order chosen in the placement command from what shows then; Crackle VP automatic and recorded as Kiln Tradition VP. No question is open.
