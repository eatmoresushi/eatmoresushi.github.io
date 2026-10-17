# V1.6.2 rulebook audit and owner rulings

Branch: `kiln-opening-v162-engine`, from `kiln-opening-next-version` at `e95c685`.

## Authority and provenance

On 2026-10-17 the owner designated the V1.6.2 Player Rulebook (Draft) as the **only source of truth** for the online game. It revises V1.6.1, which stays as history together with [its audit](./RULEBOOK_AUDIT_V1.6.1.md). The rulebook calls itself "v1.6.2"; the engine uses the rules version string `1.6.2`.

The owner supplied three files. Later on 2026-10-17 the owner revised them twice: first the Guild Hall in the English and Chinese rulebooks (below, "Owner revision"; the component text did not change), then the Starting Order deck, the Main Order values and where looked-at Orders go, in all three files (below, "Owner revision 2", rulebook changes 23–24). Each checked-in copy is byte-identical to the owner's current original in `/Users/luyuan/Documents/kiln board game/v1.6/` (checked 2026-10-18, after revision 2):

| File | Owner's original | SHA-256 |
| --- | --- | --- |
| [KILN_OPENING_v1.6.2_EN_SOURCE.md](./KILN_OPENING_v1.6.2_EN_SOURCE.md) — Player Rulebook, the mechanical authority | `KILN OPENING 开窑 v1.6.2 — Player Rulebook (Draft).md` | `f30994f8e11f8f8fb22726b1e727a66d247b502665de996ba0e64395299ce829` |
| [KILN_OPENING_v1.6.2_ZH.md](./KILN_OPENING_v1.6.2_ZH.md) — Chinese edition; it defers to the English (line 3) | `KILN OPENING 开窑 v1.6.2 — 玩家规则书（中文）.md` | `222ea2f76c6a7770f8c2e63013d3eed66109573a4b9e7d54c2e5112f2d1f89de` |
| [KILN_OPENING_v1.6.2_COMPONENT_TEXT.md](./KILN_OPENING_v1.6.2_COMPONENT_TEXT.md) — short text for Kiln boards and Tech tiles | `KILN OPENING 开窑 v1.6.2 — Component Text.md` | `cca04930985316a0730637d99f2bfd21cf0cfacfc442168bca00a4883d6fa8d7` |

History: [V1.6.1 source](./KILN_OPENING_v1.6.1_EN_SOURCE.md) (`173ec74a…`), [V1.6.1 Chinese edition](./KILN_OPENING_v1.6.1_ZH.md) (`d6d2f060…`) and [V1.6.1 audit](./RULEBOOK_AUDIT_V1.6.1.md). These are records, not rules. Before the Guild Hall revision the V1.6.2 English and Chinese files were `ed2ee2f1…` and `19fb1a21…`; between the two revisions they were `8d5734c9…` and `f7270d2f…`, with the component text at `3957a76b…`. Those texts are superseded.

### Owner revision 2026-10-17: the Guild Hall

The owner rewrote five lines of each rulebook edition, one for one, so no line moves. English lines, in the revision-2 numbering used throughout this audit (the Chinese edition's: 33, 211, 213, 216, 710):

| Line | Before | After |
| --- | --- | --- |
| L31 (change 21) | "Guild Hall Shifu pays 2 Coins less." | "Guild Hall Shifu takes up to 2 Techs from different disciplines at printed cost (no discount), and Tech displays refill after the taking player's turn, like the Order display." |
| L207 (Shifu effect) | take 1 face-up Tech of any discipline or 1 of the revealed Techs, 2 Coins less, minimum 0 | take **up to 2 Advanced Techs from different disciplines**, face-up or revealed, paying the printed cost of each |
| L209 (refill) | "After a tile is taken, refill its discipline to 2 if possible." | A taken tile's position stays **empty until the end of your turn**; then refill each discipline to 2 if possible. A Shifu's second Tech is chosen from what is showing now |
| L212 (legality) | Apprentice: an affordable face-up Tech of a discipline you do not own; Shifu: the same after the discount | "A placement here is legal only if you can afford at least 1 face-up Tech from a discipline you do not yet own." |
| L706 (Appendix E) | "take 1 revealed Tech or any face-up Tech at −2 Coins" | "buy up to 2 Techs from different disciplines at cost" |

Unchanged and still applying: the private look at the top 2 or as many as remain, the bottom placement of revealed Techs not taken (B2), the 3-total / 1-per-discipline limit (L210), Cover tokens (L211), when-acquired effects (L213) and "up to 2" meaning 1 or 2 (L144). The revision is rulebook text, not an amendment or a ruling. The engine's reading of what it leaves implicit is under "Interpretations" (Guild Hall Shifu takes, Deferred Tech refill).

### Owner revision 2, 2026-10-17: Starting Orders, Main Order values, looked cards to the deck bottom

The owner added change-log items 23 and 24 (L33–34, Chinese lines 35–36) and applied them in all three files:

- **Change 23, the Starting Order deck: 16 → 8 cards** (L84, L103–104, L386, A0 at L518–531). The new S01–S08 are four Glaze cards (White, Celadon, Grey-Green 3 VP + 4 Coins; Moon White 4 + 4), S05 "Bowl, Plate or Brush Washer" 3 + 4, S06 "Vase or Censer" 3 + 5, S07 "Carved, Impressed or Painted" 3 + 3 and S08 "any" 2 + 4. Setup still deals 2 Starting Orders and 1 Main Order to each player; a 4-player game deals all 8 and none go to the box (L104, L520). The IDs S01–S08 now name the new cards; S09–S16 are retired.
- **Change 24, the Main Order re-pass** (Appendix A): nineteen cards change value. O01–O03 4 VP; O04 7 + 3; O05 6 + 3; O14 5 + 3; O15 5 + 4; O19 and O20 6 VP; O22 9; O26 11; O27 12; O28 11; O30 13; O32 16; O33 and O34 15 + 5; O38 12; O39 13.
- **Change 24, the deck flow** (L34, L191, L195–196, L396, L617; component text line 42): looked-at Orders not reserved go to the **bottom of the Main Order deck**, not the discard pile. This covers the Commission Market Apprentice's 2 and Shifu's 3 cards, Colour Samples' when-acquired 3 and the other card of its swap's 2. It supersedes owner ruling R14. Several cards put there together go in random order (owner ruling R19, 2026-10-18). The held Order a swap discards still goes face down to the discard (a Starting Order to the box, L641), and so do the Orders discarded at round start (L130) and at Cleanup (L303).

Lines moved. English: lines 1–523 keep their numbers (33–34 rewritten); revision-1 lines 524–539 (16 Starting rows) became 524–531 (8 rows); revision-1 lines 540–756 are now 532–748 (−8). Chinese: lines 1–34 keep their numbers; 35–36 are new; revision-1 Chinese lines 35–525 moved down 2; the 16 Starting rows (526–541) became 8 (528–535); revision-1 Chinese lines 542–758 moved up 6.

Line numbers in this audit are lines of the V1.6.2 English source as it stands after revision 2, unless marked "Chinese" or "1.6.1". [ENGINE_V1.6.2_DELTA.md](./ENGINE_V1.6.2_DELTA.md) and the code comments written before revision 2 still cite revision-1 numbers for lines above 539 (for example L625 for Colour Samples, now L617); the renumbering pass (delta §1.1) moves them.

## What V1.6.2 changes

The rulebook lists its own changes as 21–24 (lines 31–34; 23 and 24 are owner revision 2). [ENGINE_V1.6.2_DELTA.md](./ENGINE_V1.6.2_DELTA.md) §1 maps each one to the engine.

- **Commission Market** (L191, L195–198, L396, L705). It gives no resource and has no blind reservation.
  - An Apprentice looks at the top 2 Main Orders and reserves 1 from the display or those 2.
  - The Shifu looks at the top 3 and reserves up to 2, at least 1, from the display and those 3.
  - Revealed cards not reserved go to the bottom of the Main Order deck (change 24, L34, L191, L195–196, L396). Change 21 (L31) still says they are discarded; change 24 supersedes it.
  - A reserved face-up Order is still replaced only after the reserving player's turn.
- **Materials Yard** Shifu gains 6 Clay/Wood, with no 1-Coin option (L165, L702).
- **Guild Hall** (owner revision 2026-10-17; L31, L207, L209, L212, L706):
  - the Shifu takes up to 2 Techs (1 or 2) from different disciplines, face-up or revealed, each at its printed cost, with no discount;
  - a taken Tech's position stays empty until the end of the taker's turn, then each discipline refills to 2, for Apprentice and Shifu takes alike;
  - a placement there, for either worker, is legal only if you can afford a face-up Tech from a discipline you do not own.
- **Canal Wharf** Shifu gains 4 Coins and takes the top Main Order card unseen into the hand (L220, L707).
- **Colour Samples** adds a once-per-round swap before or after a worker action: discard 1 held Order, look at the top 2 Main Orders, reserve 1 and put the other on the bottom of the deck (L617, L641, L710; change 24). Its when-acquired look puts the 2 cards it does not reserve on the bottom too (L617).
- **Canal Barge:** once per round, when you complete an Order, gain 2 Coins (L622). It no longer completes Orders (L402, L484, L637).
- **Protective Saggars**, cost 3: your ceramics are never Flawed, since a Heat Difference of 3 or more counts as Standard; once per round, after Quality, 1 of your Standard ceramics from this firing becomes Fine (L628, L642, L645).
- **Fuel Ledger**, cost 2: your Bank and Stoke cost no Wood; committing 1 Wood still makes them −2/+2 (L629).
- **Second Firing** reveals 2 extra Fire cards, uses the chosen one and discards both (L631).
- **Costs:** Senior Apprentice 3 and Kiln Tending 3 (L610, L618). Test Pieces stays 3 (L32, L630).
- **Starting Orders** (change 23): 8 cards, S01–S08 with new requirements and values; S07 asks for Carved, Impressed or Painted (L33, L518–531).
- **Main Orders** (change 24): nineteen re-valued cards (L34, Appendix A).

Line map from V1.6.1 (to revision 1; revision 2 then moves lines as above):

- lines 1–30 keep their numbers;
- 31–32 are new;
- 1.6.1 lines 31–188 move down 2;
- 1.6.1 lines 189–192 become line 191;
- 1.6.1 lines 193–757 move up 1.

The Chinese edition follows the same pattern: Chinese 1.6.1 lines 33–190 → 35–192, 191–194 → 193, 195–759 → 194–758.

## Owner amendments (carried over)

A1 and A2 were applied in place to the V1.6.1 files on 2026-10-15. The owner's V1.6.2 files already contain both: the Chinese edition says so at Chinese line 3, 已收录修订A1与A2. No in-place edit was needed. Lines below are V1.6.2 lines.

| ID | Date | Amendment | Overrides |
| --- | --- | --- | --- |
| A1 | 2026-10-15 | **Tech VP on purchase.** Each Advanced Tech scores its 1 VP immediately when the player gains it, recorded like other in-game VP. It is no longer added at game end. This is bookkeeping only: no V1.6.2 effect removes a Tech, so final totals and tie-breakers are unchanged. The text carries it as change 20 (line 30) and at lines 378, 491, 600, 711 and 746. | Lines 378, 491, 600, 746 (V1.6.1 lines 379, 492, 609, 755) |
| A2 | 2026-10-15 | **Discipline name.** The "Workshop" Advanced Tech discipline is called **"Form & Decorate"**, matching the personal location whose second space it adds (owner decision D11). Wording only; the internal ID stays `workshop`. | Lines 15, 53, 85, 105, 211, 373, 375, 600, 602, 711 |

## Owner rulings (re-checked against V1.6.2)

R1–R13 and B1–B3 were approved on 2026-10-14 for V1.6.1. R14 was approved on 2026-10-17 for V1.6.2. R15–R18 were approved on 2026-10-17: the owner confirmed the four provisional defaults that stage 1 of the engine track had recorded (P4 and the then open questions 2–4). R19 was approved on 2026-10-18: it answers the question owner revision 2 raised and replaces provisional default P5. Each ruling was re-checked on 2026-10-17, R1–R14 and B1–B3 again after the owner's Guild Hall revision, and all of them again on 2026-10-18 after owner revision 2: that revision makes R3 obsolete and supersedes R14. They are binding clarifications, not balance changes. R14–R19 are rulings, not amendments: neither the checked-in files nor the owner's originals change.

| ID | Ruling under V1.6.2 | Status under V1.6.2 | Lines |
| --- | --- | --- | --- |
| R1 | **Ding is selectable.** Five Kilns (Ru, Guan, Ge, Ding, Jun) are chosen in reverse turn order for 2–4 players. The 2026-10-02 Ding exclusion is withdrawn. Ding's ability works with either worker type. | Still valid. V1.6.2 changes no Kiln and no setup step. | 75, 110, 471–473 |
| R2 | **Printed values are final.** No V1.4-era amendment is reapplied: 2026-09-27 setup and O01–O03 values, 2026-09-28 Imperial Court cost and Ge virtual Glaze, 2026-09-30 economy. The V1.6.2 printed values, including its new costs and location values, stand as printed. | Still valid, including owner revision 2's Starting deck and Main Order values (changes 23–24). | 103, 222–232, 514–596, 604–633 |
| R3 | S14 (3 VP / 3 Coins) and S16 (2 VP / 3 Coins) stand as printed. | **Obsolete** (owner revision 2). Change 23 rebuilt the Starting deck as S01–S08 (L33, L518–531); S14 and S16 no longer exist. Its successors S05 "Bowl, Plate or Brush Washer" (3 VP / 4 Coins) and S08 "any" (2 VP / 4 Coins) stand as printed under R2. | 33, 518–531 |
| R4 | **Tech and Kiln Tradition abilities are optional** unless stated mandatory. Declining does not use a once-per-round allowance. Pay all costs in full and apply valid discounts before payment. Colour Samples' when-acquired reservation is mandatory whenever at least 1 Main Order can be looked at. | Still valid. Under V1.6.2 the Colour Samples swap ("you may", L617), Protective Saggars' Standard → Fine step and Second Firing are optional; once a swap is used, its reservation is mandatory (L617). Protective Saggars' floor and Fuel Ledger's free Bank and Stoke are not choices (INT Protective Saggars floor). Canal Barge resolves automatically (INT Canal Barge). A Guild Hall Shifu's second take is optional ("up to 2", L144, L207); its first is the main action. | 144, 207, 459–477, 604–633 |
| R5 | **Glaze & Load legality:** a placement is legal if at least 1 of your Shaped vessels has a legal destination: (a) an empty active Shared Kiln space not marked by another player's Setter's Mark; (b) your own empty Imperial Kiln; (c) for a Bowl, Plate or Brush Washer with Inverted Firing unused this round, an active space holding exactly 1 of your ceramics. | Still valid (unchanged). | 67, 184–186, 620–621 |
| R6 | **Canal Barge** completes an Order for every completion effect, including Ru, Guan, Tribute Ware and Crackle wildcards. | **Obsolete.** Canal Barge no longer completes Orders. It gives 2 Coins once per round when you complete an Order (L622; change 22, L32: "its Work-Phase completion gained nothing over the Order Phase"). Orders are completed only in the Order Phase (L296, L402, L484). The Tech-effect note no longer names Canal Barge (L637). | 32, 296, 402, 484, 622, 637 |
| R7 | **Jun and Second Firing:** Jun is once per round. If already used, it cannot be used again. If unused, it may be used on the Second Firing ceramic after the extra Fire cards are revealed, one is chosen and Actual Heat is recalculated with it, before the new Quality is assigned. | **Changed** in wording only. Second Firing now reveals 2 cards and uses the chosen one (L631); Jun follows the recalculation with the chosen card. | 477, 631, 670 |
| R8 | **Inverted Firing:** the newly loaded ceramic must be a Bowl, Plate or Brush Washer. It may join any active space holding exactly 1 of your ceramics, including one loaded earlier by the same action. Both ceramics use the space's printed modifier, or the Kiln Furniture modifier if Kiln Furniture is in that space. | Still valid (unchanged). | 619–620 |
| R9 | **Glaze & Load Shifu Heat marker:** placing it is optional. It may go on any of your ceramics in the Shared Kiln or your Imperial Kiln that has no marker, including one loaded earlier this round or by Imperial Priority. | Still valid (unchanged). | 182, 266 |
| R10 | **Imperial Priority** is free. Loading through it chooses the −1 / 0 / +1 Imperial modifier like any Imperial load. | Still valid (unchanged). | 60, 288, 292 |
| R11 | The **Imperial modifier is public** when chosen. It is recorded on the ceramic. | Still valid (unchanged). | 59, 288, 507 |
| R12 | **Senior Apprentice** resolves the whole Shifu effect: at the Materials Yard, 6 resources; at the Commission Market, look at the top 3 and reserve up to 2 from the display and those 3. It never applies at the Magistrate's Hall, nor at the Guild Hall or Canal Wharf. | **Changed.** The V1.6.1 ruling named the 1-Coin +1 Clay +1 Wood option and "2 reservations with the top-3 selection", both gone in V1.6.2 (L165, L196, L644). L610 still names only the Materials Yard and the Commission Market. | 165, 196, 610, 644 |
| R13 | **Tribute Ware's** bonus Crown advances Recognition (or scores past 4). It is not a printed Crown: it does not trigger Guan's "showing a Crown" and does not count for tie-breaker 2. | Still valid. It now triggers only in the Order Phase (R6 obsolete). | 463, 497, 633 |
| R14 | **Colour Samples swap (2026-10-17):** of the 2 cards looked at, the one not reserved is discarded, face down to the Main Order discard pile (B3). | **Superseded** by rulebook change 24 (owner revision 2, 2026-10-17). The text now says what happens to the other card: L617 "reserve 1 of them and put the other on the bottom", and L34 "Cards looked at and not reserved (Market, Colour Samples) go to the bottom of the Main Order deck instead of the discard pile". The engine puts it face down on the bottom of the Main deck (B3). The R14 text when it was a ruling: the card was discarded because L617 then said only "look at the top 2 cards of the Main Order deck and reserve 1 of them". | 34, 617, 641 |
| R15 | **Fire deck of buried cards (2026-10-17):** a Fire deck that holds only buried cards counts as run out. When a Fire card is needed (the Test Pieces peek, the round's reveal, each Second Firing reveal) and every card left in the deck is buried, the open discard is shuffled and placed on top, above the buried cards, which are drawn last. A deck with no cards at all is reshuffled the same way (L511, L649), and buried cards stay at the bottom through any number of reshuffles. | New ruling; confirms provisional default P4 (formerly open question 1). L511 and L649 reshuffle only when the deck "is empty"; L640 places the discard "above" the buried card so that it "is drawn last", which can happen only if the deck counts as run out while the buried card is still in it. Without this, a card buried from a short deck would be revealed at once and the bury would do nothing. | 511, 630, 640, 649 |
| R16 | **B1 for every look (2026-10-17):** B1's look clause applies to every look: the Commission Market top 2 and top 3, Colour Samples' top 3 and its swap's top 2. A look sees as many cards as remain and never reshuffles to complete itself; the discard is reshuffled only when the deck is empty as the look starts. With 1 card in the deck and a large discard, an Apprentice sees 1 card. | New ruling; confirms the default of former open question 2. L510's "when a card is needed" is not read as covering each looked card. Still valid after revision 2: a look's unreserved cards now return to the bottom of the deck (change 24), so a look takes out of the deck only the cards it reserves; the cases R16 covers arise only after display refills, reservations and Canal Wharf draws use the deck up. | 130–132, 195–196, 510, 617 |
| R17 | **The swap discards before it looks (2026-10-17):** the Colour Samples swap discards the held Order first, then looks at the top 2 (L617, "discard 1 held Order to look"). If the deck is empty, the look's reshuffle includes the Order just discarded, which may come straight back. | New ruling; confirms the default of former open question 3 (INT Colour Samples swap). Still valid after revision 2: the held Order is still discarded (L641); only the unreserved looked card moved to the deck bottom (change 24). Since looked cards no longer leave the deck, the deck is rarely empty when a swap looks. | 617, 641 |
| R18 | **Chinese Colour Samples reminder (2026-10-17):** the owner's Chinese reminder for Colour Samples (component text line 44, 79 characters; 82 after revision 2) is kept in full. The glossary's cap for reminders becomes 96 characters, four printed lines of 24, instead of 72. | New ruling; confirms the default of former open question 4. Wording and layout only. | Component text 44 |
| R19 | **Several looked cards to the deck bottom (2026-10-18):** when a look puts more than 1 card on the bottom of the Main Order deck (the Commission Market Apprentice's 2, the Shifu's or Senior Apprentice's 3, Colour Samples' when-acquired 3), they go there in random order. The player makes no decision about it. Which cards they are stays private to the looker (B3); their order under the deck is known to nobody, the looker included. | New ruling; replaces provisional default P5 (they kept the order they were drawn in) and answers former open question 1, which also offered letting the looker choose the order as B2 does for Techs. The text says only "put … on the bottom of the deck" (L195–196, L617) and "go to the bottom of the Main Order deck" (L34, L191, L396) and is silent on the order. The online game shuffles the cards with the seeded RNG (`putMainOrdersOnBottom`) before placing them under the deck. A swap puts back only 1 card, so R19 never applies to it. | 34, 191, 195–196, 396, 617 |
| B1 | **Empty Main Order supply:** if the deck and discard are both empty, draw or inspect only the cards available and leave display positions empty. Every reservation must take an available Order. A look sees as many cards as remain; the discard is reshuffled only when the deck is empty when the look starts, never to complete a look. The round-start rotation discards up to 2 and slides the rest. | **Changed in part.** Obsolete: the clause "a blind reservation needs a card in the deck after any reshuffle", since V1.6.2 has no blind reservation (L31). Extended to the V1.6.2 looks and draws: the Commission Market top-2 and top-3 looks (L195–196), Colour Samples' top-3 and its swap's top-2 (L617), and the Canal Wharf Shifu's draw (L220), which takes no card when both piles are empty while the Shifu still gains 4 Coins. A swap whose look would show no card cannot be used, because its reservation could take no available Order. R16 (2026-10-17) confirms the look clause for every look. Still valid after revision 2; the looked cards not reserved now go back under the deck (change 24), so they count toward the deck for every later look and draw. | 130–132, 191, 195–198, 220, 510, 617 |
| B2 | **Guild Hall Shifu inspection** is private. The acting player chooses the order in which untaken inspected Techs go to the bottom, and that order stays private. Return them to the bottom first, then refill the display. The Shifu may inspect any discipline, including one already owned. | Still valid under the owner's revision (2026-10-17). The Shifu now takes up to 2 Techs at printed cost (L207); the untaken inspected Techs go to the bottom when the Shifu stops taking. The display refills when the turn ends (L209), so "return first, then refill" holds. B2 never depended on the price; the first-draft V1.6.2 discount of 2 Coins (and the V1.6.1 discount of 1) is gone. | 207, 209, 212, 706 |
| B3 | **Hidden Orders:** these are private to the acting player: the Commission Market Apprentice's top-2 and Shifu's top-3 looks, Colour Samples' top-3 look and its swap's top-2 look, and which of the looked cards go back face down to the bottom of the Main deck. The Canal Wharf Shifu's card goes to the hand and is secret like every held Order. The Order discarded for a swap goes face down to the Main discard (a Starting Order to the box). The Main Order discard pile is face down; only its count is public, as is the deck's. Display Orders discarded at round start were already public. | **Changed** (extended to the V1.6.2 looks, draw and swap; after revision 2, to the looked cards returned under the deck, change 24). | 34, 191, 195–196, 200, 220, 303, 506, 617, 641 |

### Editorial corrections (no rule change)

- Line 16: change 6's "The Shifu may use a top-3 selection for one reservation; Colour Samples is now a hand-limit tile" describes V1.6.1. It is superseded by change 21 (L31, L196) and change 22 (L32, L617).
- Line 17's "2 + Fire" is superseded by change 15 (Kiln Die result).
- Line 431: malformed bold markup ("**1 Clay, 1 Wood and** **1 Coin**"). This was 1.6.1 line 432.
- Line 31 (change 21) still ends "revealed cards not reserved are discarded"; Chinese line 33 likewise (翻看而没有承接的牌弃置). Change 24 (L34, Chinese line 36) supersedes it, and L191, L195–196, L396 and L617 print the new rule.
- Line 33 (change 23) abbreviates S07 as "Carved/Impressed/Painted"; A0 prints it as "Carved, Impressed or Painted" (L530). Same card.

Retired with V1.6.2 (V1.6.1 line numbers):

- 1.6.1 line 391, "Colour Samples takes from the deck only, never from the display". The V1.6.2 line (L390) no longer names Colour Samples. Both its reservations come from the deck (L617, L641).
- 1.6.1 line 714, "the Shifu's top-3 selection is optional". The look is now the Shifu effect itself (L196, L705) and always happens (INT Commission Market looks).
- 1.6.1 line 649, "the bury clause can never apply because the 12-card Fire deck is never reshuffled mid-game". Second Firing now reveals 2 cards (L631), so one firing can use 3 Fire cards and five firings up to 15 of the 12. The reshuffle above a buried card (L640) is reachable (R15).

### Observations on the owner's files (not changed; for the owner)

- Chinese line 394 (392 before revision 2) reads 只有在**于瓷牙行被承接**…; the plain register of 2026-10-16 uses 在 rather than 于.
- Chinese line 300 (Order Phase) reads 它们要在派工阶段于瓷牙行承接, also with 于. The Main Orders clarification that quotes it keeps the owner's wording.
- The Chinese Colour Samples reminder in the component text (line 44) is 82 characters after revision 2 (79 before), over the glossary's former cap of 72. The owner keeps it in full and the cap is now 96, four printed lines of 24 (R18).
- Revision 2 replaced the English note after the change log ("Yours, from the doc comments: …", former lines 33–34) with changes 23–24. The Chinese edition added changes 23–24 and kept its note (Chinese line 38, 出自你在文档批注中的意见), so its lines from 37 on are 4 above the English ones, not 2.
- Change 24 lists nineteen re-valued Main Orders (O01–O05, O14, O15, O19, O20, O22, O26–O28, O30, O32–O34, O38, O39); Appendix A prints all nineteen.

### Interpretations of V1.6.2 text, recorded for implementers

Carried over from V1.6.1, re-checked:

- **Kiln Die:** rolled publicly by the server at the start of every round, including Round 1, after Kiln selection. The result stays visible all round. Still valid (L25, L128).
- **No Contribution participants:** when only Imperial Kiln ceramics are loaded, skip Contributions. Base Heat = Kiln Die result (clamped). The Fire card is still revealed. Still valid (L260).
- **Second Firing on an Imperial Kiln ceramic** (lines 65, 288, 631, 642): it recalculates with the same Kiln Die result, the same Imperial modifier chosen at loading and the same Heat marker, plus the chosen extra Fire card. Still valid, with the chosen card of the two.
- **Test Pieces:** eligibility counts any of your ceramics in this firing, Imperial Kiln included. The Wood payment and the bury are public; the peeked value is private to its owner. Still valid. Because every bury is public, so is the number of buried cards still in the deck.
- **Heat-marker step:** the +1 / −1 face is chosen in the step, in First Player order, so nothing hidden is committed at placement. Within a player's turn they choose the order of their own marker and Kiln Master. If their own marker is returned, Kiln Master may then go on that ceramic. Still valid.
- **Ge Crackle** (lines 467–469, 483, 645). **Changed:** the V1.6.1 entry "it may follow Protective Saggars on the same ceramic" is replaced by L645.
  - Once per round, after Quality is assigned, Ge targets 1 of the owner's ceramics from this firing that is Standard at that moment. The ceramic becomes Fine and permanently carries a Crackle marker.
  - With Protective Saggars, a ceramic that would have been Flawed is Standard and may be crackled. Saggars' own Standard → Fine step and Crackle never both apply to one ceramic: each needs a Standard ceramic, so each excludes the other.
  - When completing an Order, each Crackle ceramic may count as having any one Decoration for that Order's Decoration requirements. Its printed Decoration is unchanged; Exhibition and Ru use the printed Decoration.
  - A Crackle ceramic is never a Masterpiece.
- **Deferred Main display refill:** happens when the reserving player's turn ends, after any after-action Imperial Priority or Colour Samples swap. **Changed:** Canal Barge is gone. A swap used after a Commission Market action may discard an Order that action reserved, and its look takes deck cards before the refill does.
- **Before/after-action window:** the Colour Samples swap and Imperial Priority may share the window in an order the player chooses. **Changed:** Canal Barge is gone. A token or Imperial Kiln gained during the window would be usable within it, but nothing in the window can gain one any more: Canal Barge's completions were the only way.
- **Order Phase:** a single pass in First Player order. A player with nothing completable is skipped automatically. Still valid; it is now the only place Orders are completed (L296, L402).
- **Cleanup in Round 5:** the hand trim has no scoring effect and is skipped. Still valid.
- **Exhibition:** every eligible undelivered ceramic is exhibited automatically. Exhibiting more never loses VP and helps tie-breaker 3. Still valid.
- **Kiln Tending:** resolves automatically on the first qualifying Glaze & Load action each round; saving it gains nothing. Still valid; its cost is now 3.
- **Setter's Mark:** placement is optional. A Setter's Mark bought mid-round is first placed at the next Work Phase start. Still valid.
- **Decorator's Kit:** may reduce the Decoration paid through Prepared Clay. It never applies to Ding's 1-Coin vessel. Still valid.

New in V1.6.2:

- **Guild Hall Shifu takes** (owner revision 2026-10-17; L144, L207, L210–213, B2):
  - The Shifu takes its Techs one at a time. Each take pays the printed cost and resolves fully before the next: the Tech's 1 VP (A1), its Cover token (L211) and any when-acquired effect (L213). The second Tech is chosen afterwards, from the face-up Techs showing then and the untaken inspected ones.
  - When Colour Samples is the first take, its look and reservation come before the second take. The inspected Techs not taken wait, still private, until the reservation is made.
  - "From different disciplines" is the 1-per-discipline limit (L210) applied to the second take. At most 1 of the 2 Techs can be an inspected one, since the inspected Techs share a discipline. The 3-total limit may leave room for only 1 take.
  - The first take is the main action and is always possible, by placement legality (L212). The second is optional (L144: "up to 2" is 1 or 2). The untaken inspected Techs go to the bottom when the Shifu stops taking, in the order the Shifu chooses (B2).
  - When nothing is left to decide, the action ends by itself, with a bottom order of 0 or 1 Tech (DESIGN §3.7). Nothing is left to decide when no second take can be legal on public facts. That test never uses the cost of an untaken inspected Tech, which is private: when such a Tech of an unowned discipline remains, the Shifu ends the action explicitly.
  - Placement legality looks only at face-up Techs (L212), so a cheaper Tech the Shifu might find by inspecting never makes a placement legal.
- **Deferred Tech refill** (owner revision 2026-10-17; L209):
  - A taken Tech's display position stays empty until the taker's turn ends, for Apprentice buys and Shifu takes alike. The refill comes after any after-action Imperial Priority or Colour Samples swap, after the deferred Main display refill and after the bottom order (B2).
  - Each discipline is then refilled to 2 if its deck allows. Only a take in that turn can leave a display short with cards in its deck, so this refills exactly the taker's disciplines.
  - Display positions carry no rule, so the engine keeps each discipline's face-up Techs as a list and the refill appends.
  - The deferral never changes which second Techs a Shifu may take: the taken position is in the first take's discipline, which the second may not use. It decides only when the new Tech is revealed.

- **Commission Market looks:** the look is part of both effects and always happens, before the reservation is chosen. L195–196 say "Look at the top 2/3 … Reserve …", and the V1.6.1 "may instead" (1.6.1 line 197) is gone. The Apprentice reserves exactly 1 Order. The Shifu reserves 1 or 2 (L198), from the display, the looked cards or both. Senior Apprentice is declared when the Apprentice is placed, before the look (L610, "1 Apprentice you place"). A look that shows no card (B1) still leaves the display to choose from.
- **Canal Wharf Shifu draw:** the Shifu gains 4 Coins, then takes the top Main Order into the hand, in the order L220 gives them. With an empty deck the discard is shuffled first (L510); with both piles empty no card is taken (B1). The card is secret like every held Order.
- **Colour Samples swap:**
  - It is a Tech effect, not a worker or Commission Market action (L641).
  - The held Order is discarded first, then the top 2 are looked at (L617, "discard 1 held Order to look"; owner ruling R17). If the deck is empty, the look's reshuffle includes the Order just discarded.
  - It is once per round across all of a player's before and after windows.
  - It may be used in the round Colour Samples is acquired (L213), keeps the hand size and never touches the display.
  - The looked card not reserved goes face down to the bottom of the Main deck (L617, change 24); the held Order the swap discarded stays in the discard (L641).
- **Looked cards to the deck bottom** (change 24, owner revision 2; L34, L191, L195–196, L396, L617):
  - Every look's unreserved cards go face down to the bottom of the Main Order deck: the Commission Market's 2 or 3, Colour Samples' when-acquired 3 and its swap's 2. Nothing a look takes goes to the discard any more.
  - Several such cards go there in random order (owner ruling R19, which replaced provisional default P5). The engine shuffles them with the seeded RNG; nobody, the looker included, knows their order under the deck.
  - Which cards they are stays private to the looker (B3); the deck count is public. A Starting Order is never looked at, so never goes under the deck.
  - The looker knows those cards are at the bottom, but not in what order; nothing in the rules uses that, and the online game shows the looker their own look in their private log only. That record names the cards in the order they were looked at, never their order in the deck.
  - The discard now receives only the 2 Orders rotated out at each round start (L130), Cleanup trims (L303) and swapped-out held Main Orders (L641), so with up to 4 players the deck is not expected to run out (L34, "the deck lasts a 4-player game without a reshuffle"). B1 and R16 still govern an empty deck if it happens.
- **Canal Barge:** resolves automatically on the first Order its owner completes each round. Declining could only move the same 2 Coins to a later completion in the same Order-Phase turn, as with Kiln Tending. Starting Orders count, since they are Orders for all rules (L520).
- **Protective Saggars floor:**
  - It is always on, not an optional ability: the owner's component text labels it "Always:", and L628 states it as a fact.
  - It applies when Quality is assigned (step 9, after Jun) and to any recalculation, in the Shared Kiln and the Imperial Kiln (L642), but never to ceramics fired in earlier rounds (L642).
  - The Heat Difference is unchanged; only the Quality is Standard.
  - A floored ceramic counts as Standard for Saggars' own Standard → Fine step and for Ge (L645).
  - The owner's ceramics from that firing are never salvaged, because salvage needs a Flawed ceramic (L280).
  - Saggars' Standard → Fine step is optional (R4) and never makes a Masterpiece.
- **Fuel Ledger:** the owner's Bank and Stoke cost 0 Wood; with the commitment they cost 1 Wood and give −2/+2. Tend is unchanged. The commitment stays secret until the reveal (L503).
- **Second Firing choice:** the 2 extra cards are revealed face up and are public. The owner chooses 1. The recalculation uses it with the same Base Heat (the Kiln Die for the Imperial Kiln), position modifier and Heat marker, and Jun may follow (R7). The new Quality replaces the old even if worse, and both cards are discarded face up. If the deck runs out between the two cards, it is reshuffled (L511, R15).

### Provisional defaults (edge cases the text leaves open; owner may overrule)

P1–P3 come from the V1.6.1 engine design (ENGINE_V1.6.1_DESIGN.md §11). Each can change without changing the engine contract. P4, which the V1.6.2 delta added, was confirmed by the owner on 2026-10-17 and is now owner ruling R15. P5 was recorded on 2026-10-18 for owner revision 2; the owner overruled it the same day with owner ruling R19 (random order).

- **P1 — Reworking Table with Imperial Priority.** Allowed. It uses Reworking Table's once-per-round allowance. The tile triggers "when you glaze and load a Shaped vessel" and does not require the Glaze & Load action. Still valid (L608, L292, L637).
- **P2 — More than two empty display positions.** Possible only after the Main deck and discard both ran out (B1). Every refill compacts the display and fills all empty positions as cards allow, aiming at 6. Still valid (L132, L191).
- **P3 — Reworking into Inverted Firing eligibility.** Glaze & Load placement legality (R5c) looks only at each vessel's current Shape. During a legal action, the Shape change applies before the Inverted Firing Shape check (line 608, "first"). Still valid (L608, L620).
- **P5 — The order of several looked cards put on the bottom** (change 24; L191, L195–196, L617). **Replaced** by owner ruling R19 (2026-10-18): several cards go there in random order. The provisional default was that they keep the order they were drawn in, the first drawn ending highest and the last drawn the new bottom card, with no extra decision for the player. Kept here as a record; no item or code applies it.

### Open questions for the owner

None are open.

The question that owner revision 2 raised was answered on 2026-10-18:

1. When a look puts several cards on the bottom of the Main Order deck, do they keep the order they were drawn in (provisional default P5), or does the looker choose their order? Neither: they go there in random order, R19.

The four questions that stage 1 recorded were answered on 2026-10-17, each by confirming its default:

1. A deck holding only buried cards is "run out", and a Test Pieces peek triggers the reshuffle too: R15 (was P4).
2. B1 applies to every look; a look never reshuffles to complete itself: R16.
3. The Colour Samples swap discards the held Order before the look: R17.
4. The owner's Chinese Colour Samples reminder is kept in full; the cap is 96 characters: R18.

## Digital decisions

- **Versioning:** rules `1.6.2`, state schema 7, behaviour revision 30 (fingerprints `r30-<digest>`). V1.6.1 rooms (rules `1.6.1`, schema 6, `r29-`) are not migrated: the version gate and the rules fingerprint reject them, and new rooms start on V1.6.2. The Supabase migrations and Edge Functions were never deployed. Their pinned version strings are updated in place, and nothing is deployed.
- **Stable IDs:** Orders S01–S08 and O01–O48; Techs T01, T05 and T10–T25; Kilns RU, GU, GE, DI, JU. Owner revision 2 rebuilt the Starting deck under the IDs S01–S08 (change 23), so those IDs now name different cards than in V1.6.1, and S09–S16 are retired. V1.6.1 rooms and saves are refused by version and fingerprint (below), so no stored S-ID is reinterpreted. No other ID is added or retired.
- **Commands** ([ENGINE_V1.6.2_DELTA.md](./ENGINE_V1.6.2_DELTA.md) §2.3):
  - **Commission Market:** the placement opens the private look, then one `COMMISSION_CHOOSE` names 1 or 2 reservations.
  - **Colour Samples swap:** `USE_COLOUR_SAMPLES_SWAP` names the discarded Order and opens the look, then `COLOUR_SAMPLES_SWAP_CHOOSE`; the other card goes to the deck bottom (`LOOKED_ORDERS_TO_BOTTOM`, change 24).
  - **Looked cards not reserved** (change 24, R19): one event, `LOOKED_ORDERS_TO_BOTTOM`, with the count public and the cards in `secret` for the looker, in look order (their order under the deck is random, R19), after `COMMISSION_CHOOSE`, `COLOUR_SAMPLES_CHOOSE` and `COLOUR_SAMPLES_SWAP_CHOOSE`. It replaces `LOOKED_ORDERS_DISCARDED`.
  - **Second Firing:** `USE_SECOND_FIRING` reveals 2 cards, then `SECOND_FIRING_CHOOSE` takes the card and R7's Jun together. Nothing is hidden at that point, so the rule order (choose, recalculate, Jun, Quality) is kept inside one command.
  - **Guild Hall Shifu** (owner revision 2026-10-17): one `GUILD_TAKE` per Tech, up to 2, then `GUILD_FINISH` with the bottom order. The action ends by itself when no decision is left on public facts (INT Guild Hall Shifu takes). An Apprentice's buy stays a single `PLACE_GUILD_HALL`.
  - **Canal Barge:** no command.
- **Chinese text:** as before. A Song-dynasty kiln-workshop register, with terms fixed by the [glossary](./GLOSSARY_ZH_V1.6.1.md) and plain modern sentences (owner, 2026-10-14 and 2026-10-16).
- **Computer policy labels:** `rules-v1.6.2-<name>-<nnn>`.
