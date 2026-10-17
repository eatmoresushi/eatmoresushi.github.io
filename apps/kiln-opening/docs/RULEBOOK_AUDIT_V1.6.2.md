# V1.6.2 rulebook audit and owner rulings

Branch: `kiln-opening-v162-engine`, from `kiln-opening-next-version` at `e95c685`.

## Authority and provenance

On 2026-10-17 the owner designated the V1.6.2 Player Rulebook (Draft) as the **only source of truth** for the online game. It revises V1.6.1, which stays as history together with [its audit](./RULEBOOK_AUDIT_V1.6.1.md). The rulebook calls itself "v1.6.2"; the engine uses the rules version string `1.6.2`.

The owner supplied three files. Later on 2026-10-17 the owner revised the Guild Hall in the English and Chinese rulebooks (below, "Owner revision"); the component text did not change. Each checked-in copy is byte-identical to the owner's current original in `/Users/luyuan/Documents/kiln board game/v1.6/` (checked 2026-10-17, after the revision):

| File | Owner's original | SHA-256 |
| --- | --- | --- |
| [KILN_OPENING_v1.6.2_EN_SOURCE.md](./KILN_OPENING_v1.6.2_EN_SOURCE.md) — Player Rulebook, the mechanical authority | `KILN OPENING 开窑 v1.6.2 — Player Rulebook (Draft).md` | `8d5734c99f5801cc9920d96de5dfa9658d6fc3eb4a516c1ea19b4674c398e97c` |
| [KILN_OPENING_v1.6.2_ZH.md](./KILN_OPENING_v1.6.2_ZH.md) — Chinese edition; it defers to the English (line 3) | `KILN OPENING 开窑 v1.6.2 — 玩家规则书（中文）.md` | `f7270d2f44f3b9bf10de309b285bfde02b4cc9e217f4b152d38fbf3a19b0658a` |
| [KILN_OPENING_v1.6.2_COMPONENT_TEXT.md](./KILN_OPENING_v1.6.2_COMPONENT_TEXT.md) — short text for Kiln boards and Tech tiles | `KILN OPENING 开窑 v1.6.2 — Component Text.md` | `3957a76b2fe50197664d4b45b131997011e50c21918c0949e2f3e0b9a81c91f9` |

History: [V1.6.1 source](./KILN_OPENING_v1.6.1_EN_SOURCE.md) (`173ec74a…`), [V1.6.1 Chinese edition](./KILN_OPENING_v1.6.1_ZH.md) (`d6d2f060…`) and [V1.6.1 audit](./RULEBOOK_AUDIT_V1.6.1.md). These are records, not rules. Before the Guild Hall revision the V1.6.2 English and Chinese files were `ed2ee2f1…` and `19fb1a21…`; those texts are superseded.

### Owner revision 2026-10-17: the Guild Hall

The owner rewrote five lines of each rulebook edition, one for one, so no line moves. English lines (the Chinese edition's are 2 higher: 33, 209, 211, 214, 716):

| Line | Before | After |
| --- | --- | --- |
| L31 (change 21) | "Guild Hall Shifu pays 2 Coins less." | "Guild Hall Shifu takes up to 2 Techs from different disciplines at printed cost (no discount), and Tech displays refill after the taking player's turn, like the Order display." |
| L207 (Shifu effect) | take 1 face-up Tech of any discipline or 1 of the revealed Techs, 2 Coins less, minimum 0 | take **up to 2 Advanced Techs from different disciplines**, face-up or revealed, paying the printed cost of each |
| L209 (refill) | "After a tile is taken, refill its discipline to 2 if possible." | A taken tile's position stays **empty until the end of your turn**; then refill each discipline to 2 if possible. A Shifu's second Tech is chosen from what is showing now |
| L212 (legality) | Apprentice: an affordable face-up Tech of a discipline you do not own; Shifu: the same after the discount | "A placement here is legal only if you can afford at least 1 face-up Tech from a discipline you do not yet own." |
| L714 (Appendix E) | "take 1 revealed Tech or any face-up Tech at −2 Coins" | "buy up to 2 Techs from different disciplines at cost" |

Unchanged and still applying: the private look at the top 2 or as many as remain, the bottom placement of revealed Techs not taken (B2), the 3-total / 1-per-discipline limit (L210), Cover tokens (L211), when-acquired effects (L213) and "up to 2" meaning 1 or 2 (L144). The revision is rulebook text, not an amendment or a ruling. The engine's reading of what it leaves implicit is under "Interpretations" (Guild Hall Shifu takes, Deferred Tech refill).

Line numbers in this audit are lines of the V1.6.2 English source unless marked "Chinese" or "1.6.1".

## What V1.6.2 changes

The rulebook lists its own changes as 21 and 22 (lines 31–32). [ENGINE_V1.6.2_DELTA.md](./ENGINE_V1.6.2_DELTA.md) §1 maps each one to the engine.

- **Commission Market** (L191, L195–198, L396, L713). It gives no resource and has no blind reservation.
  - An Apprentice looks at the top 2 Main Orders and reserves 1 from the display or those 2.
  - The Shifu looks at the top 3 and reserves up to 2, at least 1, from the display and those 3.
  - Revealed cards not reserved are discarded.
  - A reserved face-up Order is still replaced only after the reserving player's turn.
- **Materials Yard** Shifu gains 6 Clay/Wood, with no 1-Coin option (L165, L710).
- **Guild Hall** (owner revision 2026-10-17; L31, L207, L209, L212, L714):
  - the Shifu takes up to 2 Techs (1 or 2) from different disciplines, face-up or revealed, each at its printed cost, with no discount;
  - a taken Tech's position stays empty until the end of the taker's turn, then each discipline refills to 2, for Apprentice and Shifu takes alike;
  - a placement there, for either worker, is legal only if you can afford a face-up Tech from a discipline you do not own.
- **Canal Wharf** Shifu gains 4 Coins and takes the top Main Order card unseen into the hand (L220, L715).
- **Colour Samples** adds a once-per-round swap before or after a worker action: discard 1 held Order, look at the top 2 Main Orders, reserve 1 (L625, L649, L718).
- **Canal Barge:** once per round, when you complete an Order, gain 2 Coins (L630). It no longer completes Orders (L402, L484, L645).
- **Protective Saggars**, cost 3: your ceramics are never Flawed, since a Heat Difference of 3 or more counts as Standard; once per round, after Quality, 1 of your Standard ceramics from this firing becomes Fine (L636, L650, L653).
- **Fuel Ledger**, cost 2: your Bank and Stoke cost no Wood; committing 1 Wood still makes them −2/+2 (L637).
- **Second Firing** reveals 2 extra Fire cards, uses the chosen one and discards both (L639).
- **Costs:** Senior Apprentice 3 and Kiln Tending 3 (L618, L626). Test Pieces stays 3 (L32, L638).

Line map from V1.6.1:

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
| A1 | 2026-10-15 | **Tech VP on purchase.** Each Advanced Tech scores its 1 VP immediately when the player gains it, recorded like other in-game VP. It is no longer added at game end. This is bookkeeping only: no V1.6.2 effect removes a Tech, so final totals and tie-breakers are unchanged. The text carries it as change 20 (line 30) and at lines 378, 491, 608, 719 and 754. | Lines 378, 491, 608, 754 (V1.6.1 lines 379, 492, 609, 755) |
| A2 | 2026-10-15 | **Discipline name.** The "Workshop" Advanced Tech discipline is called **"Form & Decorate"**, matching the personal location whose second space it adds (owner decision D11). Wording only; the internal ID stays `workshop`. | Lines 15, 53, 85, 105, 211, 373, 375, 608, 610, 719 |

## Owner rulings (re-checked against V1.6.2)

R1–R13 and B1–B3 were approved on 2026-10-14 for V1.6.1. R14 was approved on 2026-10-17 for V1.6.2. R15–R18 were approved on 2026-10-17: the owner confirmed the four provisional defaults that stage 1 of the engine track had recorded (P4 and the then open questions 2–4). Each ruling was re-checked on 2026-10-17, R1–R14 and B1–B3 again after the owner's Guild Hall revision. They are binding clarifications, not balance changes. R14–R18 are rulings, not amendments: neither the checked-in files nor the owner's originals change.

| ID | Ruling under V1.6.2 | Status under V1.6.2 | Lines |
| --- | --- | --- | --- |
| R1 | **Ding is selectable.** Five Kilns (Ru, Guan, Ge, Ding, Jun) are chosen in reverse turn order for 2–4 players. The 2026-10-02 Ding exclusion is withdrawn. Ding's ability works with either worker type. | Still valid. V1.6.2 changes no Kiln and no setup step. | 75, 110, 471–473 |
| R2 | **Printed values are final.** No V1.4-era amendment is reapplied: 2026-09-27 setup and O01–O03 values, 2026-09-28 Imperial Court cost and Ge virtual Glaze, 2026-09-30 economy. The V1.6.2 printed values, including its new costs and location values, stand as printed. | Still valid. | 103, 222–232, 514–604, 612–641 |
| R3 | S14 (3 VP / 3 Coins) and S16 (2 VP / 3 Coins) stand as printed. | Still valid (unchanged). | 537, 539 |
| R4 | **Tech and Kiln Tradition abilities are optional** unless stated mandatory. Declining does not use a once-per-round allowance. Pay all costs in full and apply valid discounts before payment. Colour Samples' when-acquired reservation is mandatory whenever at least 1 Main Order can be looked at. | Still valid. Under V1.6.2 the Colour Samples swap ("you may", L625), Protective Saggars' Standard → Fine step and Second Firing are optional; once a swap is used, its reservation is mandatory (L625, R14). Protective Saggars' floor and Fuel Ledger's free Bank and Stoke are not choices (INT Protective Saggars floor). Canal Barge resolves automatically (INT Canal Barge). A Guild Hall Shifu's second take is optional ("up to 2", L144, L207); its first is the main action. | 144, 207, 459–477, 612–641 |
| R5 | **Glaze & Load legality:** a placement is legal if at least 1 of your Shaped vessels has a legal destination: (a) an empty active Shared Kiln space not marked by another player's Setter's Mark; (b) your own empty Imperial Kiln; (c) for a Bowl, Plate or Brush Washer with Inverted Firing unused this round, an active space holding exactly 1 of your ceramics. | Still valid (unchanged). | 67, 184–186, 628–629 |
| R6 | **Canal Barge** completes an Order for every completion effect, including Ru, Guan, Tribute Ware and Crackle wildcards. | **Obsolete.** Canal Barge no longer completes Orders. It gives 2 Coins once per round when you complete an Order (L630; change 22, L32: "its Work-Phase completion gained nothing over the Order Phase"). Orders are completed only in the Order Phase (L296, L402, L484). The Tech-effect note no longer names Canal Barge (L645). | 32, 296, 402, 484, 630, 645 |
| R7 | **Jun and Second Firing:** Jun is once per round. If already used, it cannot be used again. If unused, it may be used on the Second Firing ceramic after the extra Fire cards are revealed, one is chosen and Actual Heat is recalculated with it, before the new Quality is assigned. | **Changed** in wording only. Second Firing now reveals 2 cards and uses the chosen one (L639); Jun follows the recalculation with the chosen card. | 477, 639, 678 |
| R8 | **Inverted Firing:** the newly loaded ceramic must be a Bowl, Plate or Brush Washer. It may join any active space holding exactly 1 of your ceramics, including one loaded earlier by the same action. Both ceramics use the space's printed modifier, or the Kiln Furniture modifier if Kiln Furniture is in that space. | Still valid (unchanged). | 627–628 |
| R9 | **Glaze & Load Shifu Heat marker:** placing it is optional. It may go on any of your ceramics in the Shared Kiln or your Imperial Kiln that has no marker, including one loaded earlier this round or by Imperial Priority. | Still valid (unchanged). | 182, 266 |
| R10 | **Imperial Priority** is free. Loading through it chooses the −1 / 0 / +1 Imperial modifier like any Imperial load. | Still valid (unchanged). | 60, 288, 292 |
| R11 | The **Imperial modifier is public** when chosen. It is recorded on the ceramic. | Still valid (unchanged). | 59, 288, 507 |
| R12 | **Senior Apprentice** resolves the whole Shifu effect: at the Materials Yard, 6 resources; at the Commission Market, look at the top 3 and reserve up to 2 from the display and those 3. It never applies at the Magistrate's Hall, nor at the Guild Hall or Canal Wharf. | **Changed.** The V1.6.1 ruling named the 1-Coin +1 Clay +1 Wood option and "2 reservations with the top-3 selection", both gone in V1.6.2 (L165, L196, L652). L618 still names only the Materials Yard and the Commission Market. | 165, 196, 618, 652 |
| R13 | **Tribute Ware's** bonus Crown advances Recognition (or scores past 4). It is not a printed Crown: it does not trigger Guan's "showing a Crown" and does not count for tie-breaker 2. | Still valid. It now triggers only in the Order Phase (R6 obsolete). | 463, 497, 641 |
| R14 | **Colour Samples swap (2026-10-17):** of the 2 cards looked at, the one not reserved is discarded, face down to the Main Order discard pile (B3). | New ruling. L625 says "look at the top 2 cards of the Main Order deck and reserve 1 of them" and does not say what happens to the other card. | 625, 649 |
| R15 | **Fire deck of buried cards (2026-10-17):** a Fire deck that holds only buried cards counts as run out. When a Fire card is needed (the Test Pieces peek, the round's reveal, each Second Firing reveal) and every card left in the deck is buried, the open discard is shuffled and placed on top, above the buried cards, which are drawn last. A deck with no cards at all is reshuffled the same way (L511, L657), and buried cards stay at the bottom through any number of reshuffles. | New ruling; confirms provisional default P4 (formerly open question 1). L511 and L657 reshuffle only when the deck "is empty"; L648 places the discard "above" the buried card so that it "is drawn last", which can happen only if the deck counts as run out while the buried card is still in it. Without this, a card buried from a short deck would be revealed at once and the bury would do nothing. | 511, 638, 648, 657 |
| R16 | **B1 for every look (2026-10-17):** B1's look clause applies to every look: the Commission Market top 2 and top 3, Colour Samples' top 3 and its swap's top 2. A look sees as many cards as remain and never reshuffles to complete itself; the discard is reshuffled only when the deck is empty as the look starts. With 1 card in the deck and a large discard, an Apprentice sees 1 card. | New ruling; confirms the default of former open question 2. L510's "when a card is needed" is not read as covering each looked card. | 130–132, 195–196, 510, 625 |
| R17 | **The swap discards before it looks (2026-10-17):** the Colour Samples swap discards the held Order first, then looks at the top 2 (L625, "discard 1 held Order to look"). If the deck is empty, the look's reshuffle includes the Order just discarded, which may come straight back. | New ruling; confirms the default of former open question 3 (INT Colour Samples swap). | 625, 649 |
| R18 | **Chinese Colour Samples reminder (2026-10-17):** the owner's Chinese reminder for Colour Samples (component text line 44, 79 characters) is kept in full. The glossary's cap for reminders becomes 96 characters, four printed lines of 24, instead of 72. | New ruling; confirms the default of former open question 4. Wording and layout only. | Component text 44 |
| B1 | **Empty Main Order supply:** if the deck and discard are both empty, draw or inspect only the cards available and leave display positions empty. Every reservation must take an available Order. A look sees as many cards as remain; the discard is reshuffled only when the deck is empty when the look starts, never to complete a look. The round-start rotation discards up to 2 and slides the rest. | **Changed in part.** Obsolete: the clause "a blind reservation needs a card in the deck after any reshuffle", since V1.6.2 has no blind reservation (L31). Extended to the V1.6.2 looks and draws: the Commission Market top-2 and top-3 looks (L195–196), Colour Samples' top-3 and its swap's top-2 (L625), and the Canal Wharf Shifu's draw (L220), which takes no card when both piles are empty while the Shifu still gains 4 Coins. A swap whose look would show no card cannot be used, because its reservation could take no available Order. R16 (2026-10-17) confirms the look clause for every look. | 130–132, 191, 195–198, 220, 510, 625 |
| B2 | **Guild Hall Shifu inspection** is private. The acting player chooses the order in which untaken inspected Techs go to the bottom, and that order stays private. Return them to the bottom first, then refill the display. The Shifu may inspect any discipline, including one already owned. | Still valid under the owner's revision (2026-10-17). The Shifu now takes up to 2 Techs at printed cost (L207); the untaken inspected Techs go to the bottom when the Shifu stops taking. The display refills when the turn ends (L209), so "return first, then refill" holds. B2 never depended on the price; the first-draft V1.6.2 discount of 2 Coins (and the V1.6.1 discount of 1) is gone. | 207, 209, 212, 714 |
| B3 | **Hidden Orders:** these are private to the acting player: the Commission Market Apprentice's top-2 and Shifu's top-3 looks, Colour Samples' top-3 look and its swap's top-2 look. The Canal Wharf Shifu's card goes to the hand and is secret like every held Order. The Order discarded for a swap goes face down to the Main discard (a Starting Order to the box). The Main Order discard pile is face down; only its count is public. Display Orders discarded at round start were already public. | **Changed** (extended to the V1.6.2 looks, draw and swap). | 195–196, 200, 220, 303, 506, 625, 649 |

### Editorial corrections (no rule change)

- Line 16: change 6's "The Shifu may use a top-3 selection for one reservation; Colour Samples is now a hand-limit tile" describes V1.6.1. It is superseded by change 21 (L31, L196) and change 22 (L32, L625).
- Line 17's "2 + Fire" is superseded by change 15 (Kiln Die result).
- Line 431: malformed bold markup ("**1 Clay, 1 Wood and** **1 Coin**"). This was 1.6.1 line 432.

Retired with V1.6.2 (V1.6.1 line numbers):

- 1.6.1 line 391, "Colour Samples takes from the deck only, never from the display". The V1.6.2 line (L390) no longer names Colour Samples. Both its reservations come from the deck (L625, L649).
- 1.6.1 line 714, "the Shifu's top-3 selection is optional". The look is now the Shifu effect itself (L196, L713) and always happens (INT Commission Market looks).
- 1.6.1 line 649, "the bury clause can never apply because the 12-card Fire deck is never reshuffled mid-game". Second Firing now reveals 2 cards (L639), so one firing can use 3 Fire cards and five firings up to 15 of the 12. The reshuffle above a buried card (L648) is reachable (R15).

### Observations on the owner's files (not changed; for the owner)

- Chinese line 392 reads 只有在**于瓷牙行被承接**…; the plain register of 2026-10-16 uses 在 rather than 于.
- The Chinese Colour Samples reminder in the component text (line 44) is 79 characters, over the glossary's former cap of 72. The owner keeps it in full and the cap is now 96, four printed lines of 24 (R18).

### Interpretations of V1.6.2 text, recorded for implementers

Carried over from V1.6.1, re-checked:

- **Kiln Die:** rolled publicly by the server at the start of every round, including Round 1, after Kiln selection. The result stays visible all round. Still valid (L25, L128).
- **No Contribution participants:** when only Imperial Kiln ceramics are loaded, skip Contributions. Base Heat = Kiln Die result (clamped). The Fire card is still revealed. Still valid (L260).
- **Second Firing on an Imperial Kiln ceramic** (lines 65, 288, 639, 650): it recalculates with the same Kiln Die result, the same Imperial modifier chosen at loading and the same Heat marker, plus the chosen extra Fire card. Still valid, with the chosen card of the two.
- **Test Pieces:** eligibility counts any of your ceramics in this firing, Imperial Kiln included. The Wood payment and the bury are public; the peeked value is private to its owner. Still valid. Because every bury is public, so is the number of buried cards still in the deck.
- **Heat-marker step:** the +1 / −1 face is chosen in the step, in First Player order, so nothing hidden is committed at placement. Within a player's turn they choose the order of their own marker and Kiln Master. If their own marker is returned, Kiln Master may then go on that ceramic. Still valid.
- **Ge Crackle** (lines 467–469, 483, 653). **Changed:** the V1.6.1 entry "it may follow Protective Saggars on the same ceramic" is replaced by L653.
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

- **Commission Market looks:** the look is part of both effects and always happens, before the reservation is chosen. L195–196 say "Look at the top 2/3 … Reserve …", and the V1.6.1 "may instead" (1.6.1 line 197) is gone. The Apprentice reserves exactly 1 Order. The Shifu reserves 1 or 2 (L198), from the display, the looked cards or both. Senior Apprentice is declared when the Apprentice is placed, before the look (L618, "1 Apprentice you place"). A look that shows no card (B1) still leaves the display to choose from.
- **Canal Wharf Shifu draw:** the Shifu gains 4 Coins, then takes the top Main Order into the hand, in the order L220 gives them. With an empty deck the discard is shuffled first (L510); with both piles empty no card is taken (B1). The card is secret like every held Order.
- **Colour Samples swap:**
  - It is a Tech effect, not a worker or Commission Market action (L649).
  - The held Order is discarded first, then the top 2 are looked at (L625, "discard 1 held Order to look"; owner ruling R17). If the deck is empty, the look's reshuffle includes the Order just discarded.
  - It is once per round across all of a player's before and after windows.
  - It may be used in the round Colour Samples is acquired (L213), keeps the hand size and never touches the display.
- **Canal Barge:** resolves automatically on the first Order its owner completes each round. Declining could only move the same 2 Coins to a later completion in the same Order-Phase turn, as with Kiln Tending. Starting Orders count, since they are Orders for all rules (L519).
- **Protective Saggars floor:**
  - It is always on, not an optional ability: the owner's component text labels it "Always:", and L636 states it as a fact.
  - It applies when Quality is assigned (step 9, after Jun) and to any recalculation, in the Shared Kiln and the Imperial Kiln (L650), but never to ceramics fired in earlier rounds (L650).
  - The Heat Difference is unchanged; only the Quality is Standard.
  - A floored ceramic counts as Standard for Saggars' own Standard → Fine step and for Ge (L653).
  - The owner's ceramics from that firing are never salvaged, because salvage needs a Flawed ceramic (L280).
  - Saggars' Standard → Fine step is optional (R4) and never makes a Masterpiece.
- **Fuel Ledger:** the owner's Bank and Stoke cost 0 Wood; with the commitment they cost 1 Wood and give −2/+2. Tend is unchanged. The commitment stays secret until the reveal (L503).
- **Second Firing choice:** the 2 extra cards are revealed face up and are public. The owner chooses 1. The recalculation uses it with the same Base Heat (the Kiln Die for the Imperial Kiln), position modifier and Heat marker, and Jun may follow (R7). The new Quality replaces the old even if worse, and both cards are discarded face up. If the deck runs out between the two cards, it is reshuffled (L511, R15).

### Provisional defaults (edge cases the text leaves open; owner may overrule)

P1–P3 come from the V1.6.1 engine design (ENGINE_V1.6.1_DESIGN.md §11). Each can change without changing the engine contract. P4, which the V1.6.2 delta added, was confirmed by the owner on 2026-10-17 and is now owner ruling R15.

- **P1 — Reworking Table with Imperial Priority.** Allowed. It uses Reworking Table's once-per-round allowance. The tile triggers "when you glaze and load a Shaped vessel" and does not require the Glaze & Load action. Still valid (L616, L292, L645).
- **P2 — More than two empty display positions.** Possible only after the Main deck and discard both ran out (B1). Every refill compacts the display and fills all empty positions as cards allow, aiming at 6. Still valid (L132, L191).
- **P3 — Reworking into Inverted Firing eligibility.** Glaze & Load placement legality (R5c) looks only at each vessel's current Shape. During a legal action, the Shape change applies before the Inverted Firing Shape check (line 616, "first"). Still valid (L616, L628).

### Open questions for the owner

None. The four that stage 1 recorded were answered on 2026-10-17, each by confirming its default:

1. A deck holding only buried cards is "run out", and a Test Pieces peek triggers the reshuffle too: R15 (was P4).
2. B1 applies to every look; a look never reshuffles to complete itself: R16.
3. The Colour Samples swap discards the held Order before the look: R17.
4. The owner's Chinese Colour Samples reminder is kept in full; the cap is 96 characters: R18.

## Digital decisions

- **Versioning:** rules `1.6.2`, state schema 7, behaviour revision 30 (fingerprints `r30-<digest>`). V1.6.1 rooms (rules `1.6.1`, schema 6, `r29-`) are not migrated: the version gate and the rules fingerprint reject them, and new rooms start on V1.6.2. The Supabase migrations and Edge Functions were never deployed. Their pinned version strings are updated in place, and nothing is deployed.
- **Stable IDs:** unchanged. Orders S01–S16 and O01–O48; Techs T01, T05 and T10–T25; Kilns RU, GU, GE, DI, JU. No ID is added or retired.
- **Commands** ([ENGINE_V1.6.2_DELTA.md](./ENGINE_V1.6.2_DELTA.md) §2.3):
  - **Commission Market:** the placement opens the private look, then one `COMMISSION_CHOOSE` names 1 or 2 reservations.
  - **Colour Samples swap:** `USE_COLOUR_SAMPLES_SWAP` names the discarded Order and opens the look, then `COLOUR_SAMPLES_SWAP_CHOOSE`.
  - **Second Firing:** `USE_SECOND_FIRING` reveals 2 cards, then `SECOND_FIRING_CHOOSE` takes the card and R7's Jun together. Nothing is hidden at that point, so the rule order (choose, recalculate, Jun, Quality) is kept inside one command.
  - **Guild Hall Shifu** (owner revision 2026-10-17): one `GUILD_TAKE` per Tech, up to 2, then `GUILD_FINISH` with the bottom order. The action ends by itself when no decision is left on public facts (INT Guild Hall Shifu takes). An Apprentice's buy stays a single `PLACE_GUILD_HALL`.
  - **Canal Barge:** no command.
- **Chinese text:** as before. A Song-dynasty kiln-workshop register, with terms fixed by the [glossary](./GLOSSARY_ZH_V1.6.1.md) and plain modern sentences (owner, 2026-10-14 and 2026-10-16).
- **Computer policy labels:** `rules-v1.6.2-<name>-<nnn>`.
