# Kiln Opening V1.6.2 — Component clarifications (rules details)

Purpose: owner decision D10 ([OWNER_DECISIONS.md](./ui-v1.6.1/OWNER_DECISIONS.md)). When a player clicks, taps or focuses a Tech tile, Kiln Player Board, location, Imperial Recognition milestone or Order, the "Full rules" panel shows the component's full rule word for word and **the clarifications listed here for that component only**, as plain text (no source labels in the UI; owner review, 2026-10-17). The component's own full rule text is shown separately and is not repeated here. A sentence from elsewhere in the rulebook appears only when it adds to that rule.

**What belongs here (owner review, 2026-10-17).** Only clarifications that matter for this component:

- No general rules that apply the same way to every component of its kind, such as "abilities are optional", the 3-Tech limit, "usable the same round", unlimited supply, or the general Order Phase rules.
- No interactions this component's owner can never meet. A player has one Kiln, and only Ge makes Crackle ceramics, so the Ru board has no Crackle item. A player owns at most one Tech per discipline, so two Techs of one discipline never interact for one player (Large Throwing Wheel and Prepared Clay; Kiln Furniture and Inverted Firing; Kiln Master and Second Firing; Protective Saggars and Second Firing).
- No duplicates within a section.

The source tags stay below for maintainers; the UI does not show them.

These items are rules reference only. They give no advice, strategy, odds or previews (D3, D4).

Status: prose. This file is **outside the rules fingerprint**. It is not data, it is not hashed, and it never changes a rule. If an item here disagrees with [KILN_OPENING_v1.6.2_EN_SOURCE.md](./KILN_OPENING_v1.6.2_EN_SOURCE.md) or [RULEBOOK_AUDIT_V1.6.2.md](./RULEBOOK_AUDIT_V1.6.2.md), those sources win and this file must be corrected. Chinese follows [GLOSSARY_ZH_V1.6.1.md](./GLOSSARY_ZH_V1.6.1.md) in plain modern sentences, and no player-facing text says lock or unlock (D7).

This file replaces the [V1.6.1 clarifications](./KILN_OPENING_v1.6.1_CLARIFICATIONS.md), which stay as history. "Revision notes (V1.6.2)" at the end lists what changed.

## Format

- Sections are keyed by stable data IDs: Techs `T01`…`T25` (`data/techniques.json`), Kilns `RU` `GU` `GE` `DI` `JU` (`data/kilns.json`), locations (`data/action_locations.json`), Imperial milestones (`data/imperial_progress.json`; `imperial_overflow` covers `overflowVpPerCrown`), and `orders.starting` / `orders.main`.
- Each item reads: `- [source] English text / 中文`. The English quotes the rulebook verbatim where possible; rulings and interpretations are paraphrased faithfully.

## Source tags

| Tag | Source | Kind |
| --- | --- | --- |
| `L124` | Line of the V1.6.2 rulebook (EN source, as it stands after owner revision 4 and owner ruling R25's edit) | Rulebook |
| `A1`–`A2` | Owner amendments; A1 (Tech VP on gain) is superseded by rulebook change 27, so no item cites it | Owner amendment |
| `R1`–`R25` | Owner rulings; R3, R6, R9 and R19 are obsolete and R14 superseded under V1.6.2, so no item cites them | Owner ruling |
| `B1`–`B3` | Owner rulings (supply, Guild Hall, hidden Orders) | Owner ruling |
| `ED Lnnn` | Audit editorial correction to that line | Editorial correction |
| `INT <name>` | Audit "Interpretations of V1.6.2 text" | Recorded interpretation |
| `P1`–`P3` | Audit provisional defaults | Provisional ruling (owner may change) |
| `D7` | Owner UI decision D7 (wording only) | Wording |

---

## Advanced Techs

### T01 — Large Throwing Wheel / 大陶车

- [L372 · L223 · D7] A Form & Decorate Tech adds your second Form & Decorate space. A space added this way may be used later the same round. / 习得坯作技艺即添设你的制坯饰纹第二工位；新添设的工位本轮稍后就可以使用。
- [L639] Large Throwing Wheel reduces Clay only; Ding's vessel is not a Vase or Censer. / 大陶车只减泥；定窑的额外坯不是瓶或香炉。

### T16 — Decorator's Kit / 饰坯匣

- [L372 · L223 · D7] A Form & Decorate Tech adds your second Form & Decorate space. A space added this way may be used later the same round. / 习得坯作技艺即添设你的制坯饰纹第二工位；新添设的工位本轮稍后就可以使用。
- [L639] The Shifu's discount, Decorator's Kit and Ding's 1-Coin vessel are three separate reductions. The first two may apply to the same vessel (its 2 Coins become 0). Ding's vessel takes neither. / 师傅的减免、饰坯匣、定窑的1铜钱额外坯是三项各自独立的减免。前两项可以作用于同一件坯（其2铜钱可降到0）；定窑的额外坯两项都不适用。

### T05 — Reworking Table / 改坯案

- [L372 · L223 · D7] A Form & Decorate Tech adds your second Form & Decorate space. A space added this way may be used later the same round. / 习得坯作技艺即添设你的制坯饰纹第二工位；新添设的工位本轮稍后就可以使用。
- [L332] Vessel cards are not a hard gameplay limit. If all 10 cards of a Shape are in use, use a suitable proxy until a matching Vessel card becomes available. / 器型卡不是硬性的游戏上限。若某种器型的10张卡都在使用中，先用合适的代用物代替，等有相应的器型卡空出来再换回。
- [P1] Provisional ruling: Reworking Table may be used when Imperial Priority glazes and loads a vessel, and this uses its once-per-round allowance. The tile triggers "when you glaze and load a Shaped vessel" and does not require the Glaze & Load action. / 暂定裁定：御烧优先为1件坯施釉装窑时，也可以使用改坯案，并消耗改坯案的“每轮一次”。本牌的时机是“当你为1件坯施釉装窑时”，不限于施釉装窑行动。
- [P3] Provisional ruling: during a legal action, the Shape change applies before the Inverted Firing Shape check. Whether a Glaze & Load placement is legal (R5c) looks only at each vessel's current Shape. / 暂定裁定：在合法的行动中，改器型在覆烧的器型检查之前结算；能否派工到施釉装窑（R5c）只看各件坯当前的器型。

### T17 — Prepared Clay / 练泥

- [L372 · L223 · D7] A Form & Decorate Tech adds your second Form & Decorate space. A space added this way may be used later the same round. / 习得坯作技艺即添设你的制坯饰纹第二工位；新添设的工位本轮稍后就可以使用。
- [L633] Prepared Clay is a Tech effect, not a worker action. It never counts as a Form & Decorate action and does not trigger effects that require that action. / 练泥是技艺效果，不是工人行动。它不算制坯饰纹行动，也不触发需要该行动的效果。
- [L481 · L633] Ding triggers during its Form & Decorate action, so forming through Prepared Clay does not trigger Ding. / 定窑在其制坯饰纹行动中触发，所以通过练泥制坯不会触发定窑。
- [L184 · L633] The Shifu's discount belongs to the Shifu's Form & Decorate action, so it does not apply to a vessel formed through Prepared Clay. / 师傅的减免属于师傅的制坯饰纹行动，所以不适用于通过练泥制成的坯。

### T18 — Senior Apprentice / 高徒

- [L372 · L223 · D7] A Form & Decorate Tech adds your second Form & Decorate space. A space added this way may be used later the same round. / 习得坯作技艺即添设你的制坯饰纹第二工位；新添设的工位本轮稍后就可以使用。
- [R4] Tech abilities are optional. Declining does not use the once-per-round allowance: an Apprentice that does not use it resolves the Apprentice effect, and the tile stays available for another Apprentice this round. / 技艺效果可以选用；放弃不消耗“每轮一次”：不使用时，该学徒照常结算学徒效果，本轮仍可以留给另一名学徒使用。
- [R12] Senior Apprentice resolves the whole Shifu effect: at the Materials Yard the Apprentice gains 8 resources in any combination of Clay and Wood. It never applies at the Guild Hall, the Canal Wharf or the Magistrate's Hall. / 高徒结算完整的师傅效果：在泥柴场，该学徒获得8份资源，泥和柴任意搭配。高徒不适用于陶工行、漕运码头和州衙。
- [L640] Senior Apprentice at the Commission Market gives that Apprentice the Shifu's effect: Select 3, reserving up to 2. / 高徒派往瓷牙行时，该学徒按师傅效果结算：精选3，承接至多2张。
- [L210 · R12] Like a Shifu, that Apprentice must reserve at least 1 Order and may reserve 2. The display is not refilled until your turn ends, so both reservations choose from the Orders showing now. / 与师傅一样，该学徒至少要承接1张，至多2张。你的回合结束前委托榜不会补牌，所以两次承接都只能从此刻榜上的委托中选。
- [INT Commission Market looks] You choose Senior Apprentice when you place the Apprentice, before the look. / 高徒要在派出该学徒时选定，在查看之前。

### T19 — Connoisseur's Cabinet / 清玩斋

- [L372 · L223 · D7] A Form & Decorate Tech adds your second Form & Decorate space. A space added this way may be used later the same round. / 习得坯作技艺即添设你的制坯饰纹第二工位；新添设的工位本轮稍后就可以使用。
- [L439 · L447] At game end, exhibit any number of your undelivered ceramics of Standard Quality or better. Flawed ceramics cannot be exhibited. / 游戏结束时，陈列你任意数量的、品质为良品或以上的未交付器物。瑕品不能陈列。
- [INT Exhibition] Every eligible undelivered ceramic is exhibited automatically. / 数字版自动陈列所有符合条件的未交付器物。

### T10 — Colour Samples / 色样簿

- [L72 · R25] Select N: Look at the top N cards of the Main Order deck. Reserve 1 of them, or 1 face-up Main Order from the display; discard the rest of the N. / 精选N：查看主委托牌堆顶N张。承接其中1张，或承接委托榜上的1张主委托；这N张中其余的弃置。
- [L225 · INT Guild Hall Shifu takes] Resolve any when acquired effect immediately. When a Guild Hall Shifu takes Colour Samples first, its Select 3 and reservation come before the second take. / “习得时”的效果立即结算。陶工行的师傅若先习得色样簿，先结算它的精选3与承接，再拿第2项技艺。
- [R4 · INT Colour Samples Select] The when-acquired Select 3 is mandatory whenever a Main Order can be reserved: a card you look at or a face-up one. The swap is optional; once you discard an Order for it, you must reserve 1 Order with its Select 3. / 只要有主委托可以承接（看过的牌或委托榜上的委托），习得时的精选3就必须承接。换单是可选的；一旦为换单弃了委托，就必须用这次精选3承接1张委托。
- [L637] Each Select 3 it grants is a Tech effect, not a Commission Market action; a face-up Order taken by one is replaced at the end of your turn as usual. Your hand limit of 5 applies at every Cleanup while you own the tile. / 它的精选是技艺效果，不算瓷牙行行动；由此承接的榜上委托照常在你的回合结束后补上。拥有此牌期间，每次收工的上限都是5张。
- [L72 · L637 · R25] Cards you look at and do not reserve are discarded face down to the Main Order discard pile, as is the Order you discard for a swap; a Starting Order you discard goes to the box. / 翻看而没有承接的牌面朝下弃置到主委托弃牌堆，换单弃置的主委托也放入那里；换单弃置的起始委托放回盒中。
- [R17] A swap discards the held Order first, then looks at the top 3. If the deck is empty at that moment, the discard pile is shuffled into a new deck, so the Order you just discarded may be among the cards you look at. / 换单先弃置在手委托，再查看牌堆顶3张。如果此时牌堆已空，就把弃牌堆洗混组成新牌堆，所以刚弃置的委托可能出现在你查看的牌中。
- [B1 · R16] Each look sees as many cards as remain, up to 3, when acquired and for a swap. The discard is reshuffled only when the deck is empty as the look starts, never to complete a look. A look that shows no card still lets you reserve from the display; a swap cannot be used if it could reserve no Order at all. / 每次查看时牌堆不足就看余下的，至多3张，习得时与换单都一样。弃牌堆只在查看开始时牌堆已空才洗混，不会为了凑足张数而洗混。即使查看时一张牌也没有，仍可以从委托榜上承接；如果换单根本无委托可承接，就不能换单。
- [B3 · R25] Your looks are private: only you see the cards and which of them you discard. The Main Order discard pile is face down; only the counts of the deck and the discard are public. / 查看是私下进行的：看过的牌，以及弃置了哪几张，只有你知道。主委托弃牌堆面朝下；牌堆与弃牌堆只公开张数。
- [INT Before/after-action window] The swap and Imperial Priority may share a before- or after-action window, in an order you choose. / 换单与御烧优先同在“工人行动之前或之后”时，二者的先后由你决定。
- [INT Deferred refill] A swap used after a Commission Market action may discard an Order that action reserved. The display refills only when your turn ends, after the swap. / 在瓷牙行行动之后换单，可以弃置该行动刚承接的委托；委托榜要等你的回合结束、换单之后才补牌。

### T20 — Kiln Tending / 看火

- [INT Kiln Tending] Kiln Tending resolves automatically on the first qualifying Glaze & Load action each round; saving it gains nothing. / 数字版在每轮第一次符合条件的施釉装窑行动后自动结算看火；留到以后没有任何好处。
- [L614 · L197] Kiln Tending's Clay and Wood come after the Glaze & Load action, so its Wood cannot pay that action's 1 Wood of kiln fuel. / 看火的泥和柴在施釉装窑行动之后才得到，所以它给的柴不能支付该行动烧窑要花的1柴。
- [L80] Loading includes placing a vessel in your empty Imperial Kiln, so a vessel the action loads into the Imperial Kiln counts as loaded. / 装窑包括把坯放进你空着的御窑，所以该行动装进御窑的器物也算已装窑。
- [L296 · L633] Imperial Priority is a token effect, not a Glaze & Load action, so loading through it does not trigger Kiln Tending. / 御烧优先是令牌效果，不是施釉装窑行动，所以通过它装窑不会触发看火。

### T15 — Kiln Furniture / 支烧窑具

- [L634] Kiln Furniture, Inverted Firing and Setter's Mark affect the Shared Kiln only. The Imperial Kiln holds 1 ceramic and uses its own modifier. / 支烧窑具、覆烧、窑位签只作用于共窑。御窑只容纳1件，用它自己的御窑修正。
- [L255 · L661] Kiln Master's marker is not a zone modifier: it adds to the Kiln Furniture modifier. / 窑工标不是温区修正：它与支烧窑具的修正相加。
- [L627] A Second Firing recalculation keeps the same Kiln Furniture modifier. / 复烧重算时沿用相同的窑具修正。

### T21 — Inverted Firing / 覆烧

- [R8] The newly loaded ceramic must be a Bowl, Plate or Brush Washer. It may join any active space holding exactly 1 of your ceramics, including one loaded earlier by the same action. Both ceramics use the space's printed modifier, or the Kiln Furniture modifier if Kiln Furniture is in that space. / 新装进的器物必须是碗、盘或笔洗；它可以放进任意一个恰好已有1件你的器物的启用窑位，包括本次行动先装进的那件。两件器物都用该窑位的温区修正；如果该窑位垫有支烧窑具，就用窑具修正。
- [R5 · L198] While Inverted Firing is unused this round, an active space holding exactly 1 of your ceramics is a legal destination for a Bowl, Plate or Brush Washer when checking whether a Glaze & Load placement is legal, if you have the 1 Wood that loading into the Shared Kiln costs. / 覆烧本轮还没有使用时，恰好已有1件你的器物的启用窑位，算作碗、盘或笔洗的合法去处，用于判断能否派工到施釉装窑；前提是你有装进共窑所需的1柴。
- [L634] Kiln Furniture, Inverted Firing and Setter's Mark affect the Shared Kiln only. / 支烧窑具、覆烧、窑位签只作用于共窑。
- [P3] Provisional ruling: during a legal action, a Reworking Table Shape change applies before the Inverted Firing Shape check; placement legality looks only at each vessel's current Shape. / 暂定裁定：在合法的行动中，改坯案的改器型在覆烧的器型检查之前结算；能否派工只看各件坯当前的器型。

### T22 — Setter's Mark / 窑位签

- [INT Setter's Mark] Placement is optional. A Setter's Mark bought mid-round is first placed at the next Work Phase start. / 放置是可选的；本轮中途习得的窑位签，要到下一次派工阶段开始时才可以放置。
- [R5 · L617] An empty active Shared Kiln space marked by another player's Setter's Mark is not a legal destination for you. Only the Setter's Mark owner may load there this round. / 共窑中放着其他玩家窑位签的空启用窑位，不是你的合法去处；本轮只有窑位签的主人能在这里装窑。
- [L634] Kiln Furniture, Inverted Firing and Setter's Mark affect the Shared Kiln only. / 支烧窑具、覆烧、窑位签只作用于共窑。

### T23 — Canal Barge / 漕船

- [L300] Canal Barge does not complete Orders itself. You gain its 2 Coins in the Order Phase, the only time Orders are completed. / 漕船本身不能完成委托。它的2铜钱在交货阶段获得，只有交货阶段才能完成委托。
- [INT Canal Barge] Canal Barge resolves automatically on the first Order you complete each round, a Starting Order included. / 数字版在你每轮第一次完成委托时自动结算漕船，起始委托也算。

### T11 — Protective Saggars / 匣钵护烧

- [INT Protective Saggars floor] "Never Flawed" is always on; it is not an optional ability. It applies when Quality is assigned, after any Jun adjustment, to your ceramics in the Shared Kiln and your Imperial Kiln. The Heat Difference is unchanged; only the Quality counts as Standard. / “永不为瑕品”始终生效，不是可选能力。它在定品时（钧窑调整之后）适用于你在共窑与御窑中的器物。火候差不变，只是品质算作良品。
- [INT Protective Saggars floor] A ceramic that is Standard only because it can never be Flawed still counts as Standard, so the once-per-round step may make it Fine. / 因永不为瑕品而算作良品的器物就是良品，所以每轮一次的升品可以把它升为上品。
- [L638] Protective Saggars affects only your own ceramics in the current firing, in the Shared Kiln or your Imperial Kiln; never ceramics fired in earlier rounds. / 匣钵护烧只作用于你本次烧成中（共窑或御窑）的器物，不作用于先前各轮烧成的器物。
- [L641] With Protective Saggars, a ceramic that would have been Flawed is Standard and may be crackled; Saggars' Standard → Fine step and Crackle may both apply to the same ceramic, since Crackle does not change a Fine ceramic's Quality. / 有匣钵护烧时，本应为瑕品的器物算作良品，可以再开片；匣钵护烧的“良品变上品”与开片可以作用于同一件器物，因为开片不改变上品的品质。
- [L663 · L374] After-Quality abilities resolve in First Player order. If you control several in this window, you choose their order. / 定品后能力按起始玩家顺序结算；若你在此时机有多项能力，由你决定先后。

### T12 — Fuel Ledger / 柴簿

- [L117] Keep the 2 Fuel Ledger Contribution cards beside the Firing deck; they go to whoever acquires Fuel Ledger. / 把2张柴簿控火牌放在火作叠旁，谁习得柴簿就归谁。
- [L271] A player participates in Contributions only if they have at least 1 ceramic in the Shared Kiln. A ceramic in an Imperial Kiln gives no say over the shared fire. / 只有在共窑中至少有1件器物的玩家才参与控火；玩家不能凭御窑中的器物对共窑的火发表意见。
- [L659] Each participant secretly chooses 1 of their Contribution cards and must be able to pay its Wood cost. Your Bank and Stoke cost 0 Wood, so you may choose them with no Wood; each of your 2 Fuel Ledger cards costs 1 Wood. / 每位控火者暗选1张自己的控火牌，而且必须付得起它的柴费。你的压火与添柴不付柴，没有柴也可以选；两张柴簿控火牌各需1柴。
- [L99 · L499] Contribution choices remain secret until revealed; Wood is paid only on reveal, so no Wood is set aside beforehand. All 14 Contribution cards share one back, so a face-down card reveals nothing. / 控火选择在亮牌前保密；柴在亮牌时才支付，事先不必押下。14张控火牌牌背相同，暗牌不泄露任何信息。
- [L253 · L659] Reveal all Contribution cards simultaneously, then pay all costs. Start at the Kiln Die result, add all final Contribution modifiers, then clamp to 0–5. / 同时亮出所有控火牌，然后支付全部费用；以窑骰点数为起点，加上所有最终的控火修正，再限定在0–5。

### T13 — Test Pieces / 火照

- [L636] A buried card stays on the bottom; if the Fire deck runs out, the discard pile is shuffled and placed above it, so the buried card is drawn last. You may discuss what you saw but may not show the card. / 置底的牌留在牌堆底；若窑火牌堆用尽，把弃牌堆洗混后放在它上面，所以置底的牌最后才翻出。你可以谈论看到的内容，但不能把牌给别人看。
- [R15] A Fire deck that holds only buried cards counts as run out: when a card is needed, the discard pile is shuffled and placed above them. A Test Pieces look counts as needing a card. / 窑火牌堆只剩置底的牌时，算作牌堆用尽：需要翻牌时，把弃牌堆洗混后放在它们上面。火照查看也算需要翻牌。
- [INT Test Pieces] Eligibility counts any of your ceramics in this firing, Imperial Kiln included. The Wood payment and the bury are public, and so is the number of buried cards in the deck; the value you looked at is private to you. / 判断资格时，你本次烧成中的任何器物都算，包括御窑中的器物。付柴与置底是公开信息，牌堆中置底的张数也公开；你看到的内容只有你自己知道。

### T14 — Second Firing / 复烧

- [L638] Second Firing affects only your own eligible ceramics in the current firing, in the Shared Kiln or your Imperial Kiln; never ceramics fired in earlier rounds. Second Firing's extra Fire cards change nothing for any other ceramic. / 复烧只作用于你本次烧成中（共窑或御窑）符合条件的器物，不作用于先前各轮烧成的器物；复烧额外翻出的窑火牌不影响任何其他器物。
- [INT Second Firing choice · R15] The 2 extra Fire cards are revealed face up for everyone to see. If the Fire deck runs out before either card, it is reshuffled first, and any buried card stays at the bottom. / 2张额外窑火牌正面朝上翻开，所有人都看得到。翻其中任何一张之前若窑火牌堆已用尽，先洗混再翻，置底的牌仍留在牌堆底。
- [INT Imperial Second Firing] On an Imperial Kiln ceramic, Second Firing keeps the same Kiln Die result, the same Imperial modifier and the same Kiln Master marker, with the chosen card's Fire modifier. / 复烧御窑中的器物时，用相同的窑骰点数、御窑修正与窑工标，配合所选那张牌的窑火修正重新计算。
- [L663 · L374] After-Quality abilities resolve in First Player order. If you control several in this window, you choose their order. / 定品后能力按起始玩家顺序结算；若你在此时机有多项能力，由你决定先后。
- [L284 · R20] You may sell a Flawed ceramic for 2 Coins during your own turn, your after-Quality turn included; a ceramic of this firing sold then leaves the kiln and can no longer be chosen for Second Firing. / 你可以在自己的回合中以2铜钱卖出瑕品，包括你的定品后回合；在那时卖出的本窑器物离开窑位，不能再被选作复烧的对象。

### T24 — Kiln Master / 窑工

- [R22 · INT Kiln Master at loading] The marker may be placed at any loading: a Glaze & Load action or Imperial Priority, into the Shared Kiln or your Imperial Kiln. It goes on the ceramic as that ceramic is loaded, never on one already in a kiln. / 窑工标可以在任何一次装窑时放置：施釉装窑行动或御烧优先，装进共窑或你的御窑都可以。它在器物装窑的当时放上，不能放在已在窑中的器物上。
- [L635 · L664] The marker is chosen when the ceramic is loaded, like the Imperial Kiln's modifier, and is open information. It stays in place through a Second Firing recalculation and returns when the firing finishes. / 窑工标在装窑时选定，与御窑修正的选法相同，且是公开信息。复烧重算时窑工标留在原处，开窑取器时收回。
- [L661 · L635] In the Shared Kiln the marker adds to the zone or Kiln Furniture modifier; in your Imperial Kiln it adds to the modifier chosen at loading. Jun's adjustment applies on top of it. / 在共窑中，窑工标与温区或支烧窑具修正相加；在你的御窑中，它与装窑时选定的御窑修正相加。钧窑的调整叠加在它之上。

### T25 — Tribute Ware / 贡瓷

- [R13] Tribute Ware's bonus Crown advances Recognition, or scores 1 VP past Recognition 4. It is not a printed Crown: it does not trigger Guan's "showing a Crown" and does not count for tie-breaker 2. / 贡瓷的额外御令会推进御府声望，到达声望4之后改为得1分；但它不是委托上印有的御令，不触发官窑，也不计入平局判定②。
- [L516] Starting Orders have no Crowns. / 起始委托没有御令。

---

## Kiln Traditions

### RU — Ru Kiln, Quiet Perfection / 汝窑 · 天青无瑕

- [L480] Ru triggers while completing an Order in the Order Phase. / 汝窑在交货阶段完成委托时触发。

### GU — Guan Kiln, Imperial Patronage / 官窑 · 内府恩眷

- [L480] Guan triggers while completing an Order in the Order Phase. / 官窑在交货阶段完成委托时触发。
- [R13] Tribute Ware's bonus Crown is not a printed Crown and does not make an Order "showing a Crown". / 贡瓷额外获得的御令不是委托上印有的御令，不会让委托算作“印有御令”。
- [L516] Starting Orders have no Crowns. / 起始委托没有御令。

### GE — Ge Kiln, Crackle Mastery / 哥窑 · 金丝铁线

- [INT Ge Crackle revision 4] Ge targets 1 of your ceramics from this firing that is Fine or Standard at that moment; a Masterpiece or Flawed ceramic is not a target. A Standard one becomes Fine, a Fine one stays Fine, and it permanently carries a Crackle marker. / 哥窑选择你本次烧成中1件此时为上品或良品的器物；臻品与瑕品不能选。良品升为上品，上品仍是上品，并一直带着开片标。
- [L479 · L641] Ge's Crackle is an after-Quality effect; Ge chooses its order among their own after-Quality effects. With Protective Saggars, a ceramic that would have been Flawed is Standard and may be crackled; Saggars' Standard → Fine step and Crackle may both apply to the same ceramic. / 哥窑开片是定品后效果；哥窑玩家自行决定它在己方各项定品后效果中的先后。有匣钵护烧时，本应为瑕品的器物算作良品，可以再开片；匣钵护烧的“良品变上品”与开片可以作用于同一件器物。
- [L293] An Imperial Kiln ceramic counts as a ceramic in this firing for your abilities. / 对你的能力而言，御窑中的器物算作本次烧成中的器物。
- [L108] A marked ceramic keeps its Crackle marker until delivered or exhibited. / 带有开片标的器物一直保留此标，直到交付或陈列。
- [L480 · INT Ge Crackle revision 4] Crackle VP triggers while completing an Order in the Order Phase, where a Crackle ceramic's wildcard Decoration is declared. It is automatic and recorded with the Order as Kiln Tradition VP. / 开片器的得分在交货阶段完成委托时触发，开片器的任意纹饰也在此时声明。它自动计入，作为窑口传承所得的分数随委托记录。

### DI — Ding Kiln, Moulded Production / 定窑 · 范制成器

- [R1] Ding's ability works with either worker type. / 学徒或师傅的行动都能触发定窑的能力。
- [L481] Ding triggers during its Form & Decorate action. / 定窑在其制坯饰纹行动中触发。
- [L633] Prepared Clay is a Tech effect and never counts as a Form & Decorate action, so a vessel formed through Prepared Clay does not trigger Ding. / 练泥是技艺效果，不算制坯饰纹行动，所以通过练泥制成的坯不会触发定窑。
- [L639] The Shifu's discount, Decorator's Kit and Ding's 1-Coin vessel are three separate reductions. Ding's vessel takes neither. Large Throwing Wheel reduces Clay only; Ding's vessel is not a Vase or Censer. / 师傅的减免、饰坯匣、定窑的1铜钱额外坯是三项各自独立的减免；定窑的额外坯两项都不适用。大陶车只减泥；定窑的额外坯不是瓶或香炉。

### JU — Jun Kiln, Kiln Transformation / 钧窑 · 窑变天成

- [L478] Jun acts after Actual Heat is calculated (Kiln Master marker included) and before Quality is assigned. / 钧窑在实际火候算出后（已计入窑工标）、定品前结算。
- [L635] Jun's adjustment applies on top of Kiln Master's marker. / 钧窑的调整叠加在窑工标之上。
- [L293] An Imperial Kiln ceramic counts as a ceramic in this firing for your abilities. / 对你的能力而言，御窑中的器物算作本次烧成中的器物。
- [L259] Global Heat and Actual Heat are not clamped. / 全窑火候与实际火候不设上下限。
- [L478 · L627] If a Second Firing recalculates a ceramic, an unused Jun adjustment may be applied to the recalculated heat. Jun's adjustment from the first calculation does not carry over. / 若复烧重算了某件器物，尚未使用的钧窑调整可以作用于重算后的火候；第一次计算时的钧窑调整不保留。

---

## Locations

### materials_yard — Materials Yard / 泥柴场

- [L164] Capacity is 2, 3 or 4 spaces in 2-, 3- or 4-player games. / 容量：2人2个、3人3个、4人4个工位。
- [R12] Senior Apprentice lets 1 Apprentice resolve the whole Shifu effect here: 8 resources in any combination of Clay and Wood. / 高徒可以让1名学徒在这里结算完整的师傅效果：获得8份资源，泥和柴任意搭配。
- [L605 · L633] Prepared Clay may form 1 vessel during a Materials Yard action, after gaining resources; it is a Tech effect, not a Form & Decorate action. / 练泥可以在泥柴场行动中获得资源后制1件坯；这是技艺效果，不算制坯饰纹行动。

### form_decorate — Form & Decorate / 制坯饰纹

- [L158] Personal locations are on your own board. Each personal space may be used once per round. / 坊内地点在你自己的窑口板上；每个坊内工位每轮只能使用一次。
- [L169 · L223 · D7] You start with 1 space. Learning a Form & Decorate Tech adds the second space, which may be used later the same round. / 起初只有1个工位；习得坯作技艺即添设第二工位，新添设的工位本轮稍后就可以使用。
- [L156] "Up to 2" means 1 or 2, never 0. / “至多2”的意思是1或2，不能是0。
- [L336] The Shifu's Form & Decorate action and Decorator's Kit each reduce one vessel's cost by 1 Coin. Decorations matter only for Order requirements. / 师傅的制坯饰纹行动与饰坯匣各能使1件坯少付1铜钱。纹饰只关系到委托的要求。
- [L186] A placement here is legal only if you can pay the full cost of at least 1 vessel, after any reductions. / 只有当你在计入各项减免后至少付得起1件坯的全部费用时，才可以派工到这里。
- [L639] The Shifu's discount, Decorator's Kit and Ding's 1-Coin vessel are three separate reductions. The first two may apply to the same vessel (its 2 Coins become 0). Ding's vessel takes neither. / 师傅的减免、饰坯匣、定窑的1铜钱额外坯是三项各自独立的减免。前两项可以作用于同一件坯（其2铜钱可降到0）；定窑的额外坯两项都不适用。
- [L633] Prepared Clay is a Tech effect and never counts as a Form & Decorate action. / 练泥是技艺效果，不算制坯饰纹行动。
- [L504] Shaped ceramics remain between rounds and keep all recorded attributes. / 坯跨轮保留，并保持记录的全部属性。

### glaze_load — Glaze & Load / 施釉装窑

- [L158] Personal locations are on your own board. Each personal space may be used once per round. / 坊内地点在你自己的窑口板上；每个坊内工位每轮只能使用一次。
- [L170 · L223 · D7] You start with 1 space. Learning a Glazing & Loading Tech adds the second space, which may be used later the same round. / 起初只有1个工位；习得釉作技艺即添设第二工位，新添设的工位本轮稍后就可以使用。
- [L156] "Up to 2" means 1 or 2, never 0. / “至多2”的意思是1或2，不能是0。
- [R5 · L198] A placement is legal if at least 1 of your Shaped vessels has a legal destination you can pay for: your own empty Imperial Kiln; or, with 1 Wood, an empty active Shared Kiln space not marked by another player's Setter's Mark, or, for a Bowl, Plate or Brush Washer with Inverted Firing unused this round, an active space holding exactly 1 of your ceramics. / 可派工条件：你至少有1件坯有付得起的合法去处——你自己空着的御窑；或者在有1柴时，共窑中空的启用窑位（上面没有其他玩家的窑位签），或（覆烧本轮还没有使用时，限碗、盘或笔洗）恰好已有1件你的器物的启用窑位。
- [L197 · R24] The kiln burns fuel: a Glaze & Load action that loads into the Shared Kiln costs 1 Wood, whether it loads 1 vessel or 2. You pay no Wood if the action loads only into your Imperial Kiln. / 烧窑要烧柴：一次向共窑装窑的施釉装窑行动花费1柴，装1件或2件都一样。只装进御窑的行动不花柴。
- [L114] Active Shared Kiln spaces by player count: 4 players 8 (3 High, 3 Middle, 2 Low); 3 players 6 (2-2-2); 2 players 4 (2-1-1). / 启用窑位按人数：4人8个（高3、中3、低2）；3人6个（2-2-2）；2人4个（2-1-1）。
- [L292 · R11] A vessel loaded into the Imperial Kiln chooses the −1, 0 or +1 Imperial modifier. The modifier is public when chosen and is recorded on the ceramic. / 装进御窑时，选定御窑修正−1、0或+1；它在选定时就公开，并记录在该器物上。
- [L271] Only a ceramic in the Shared Kiln makes you a Contribution participant; an Imperial Kiln ceramic does not. / 只有共窑中的器物才会让你成为控火者；御窑中的器物不算。
- [L296 · L633] Imperial Priority is a token effect, not a Glaze & Load action. / 御烧优先是令牌效果，不是施釉装窑行动。
- [P3] Provisional ruling: placement legality looks only at each vessel's current Shape, even if Reworking Table could change it. / 暂定裁定：能否派工只看各件坯当前的器型，即使改坯案可以改变它的器型。

### commission_market — Commission Market / 瓷牙行

- [L165] Capacity is 2, 3 or 4 spaces in 2-, 3- or 4-player games. / 容量：2人2个、3人3个、4人4个工位。
- [L72 · R25] Select N: Look at the top N cards of the Main Order deck. Reserve 1 of them, or 1 face-up Main Order from the display; discard the rest of the N. / 精选N：查看主委托牌堆顶N张。承接其中1张，或承接委托榜上的1张主委托；这N张中其余的弃置。
- [INT Commission Market looks] The look always happens, before you choose. The Apprentice reserves exactly 1 Order; the Shifu reserves 1 or 2, from the display, the looked cards or both. / 查看一定会进行，在承接之前。学徒恰好承接1张；师傅承接1或2张，可以来自委托榜、看过的牌，或两者都有。
- [B1 · R16] Every reservation must take an available Order. A look sees as many cards as remain; the discard is reshuffled only when the deck is empty as the look starts, never to complete a look. A look that shows no card still lets you reserve from the display. If the Main Order deck and discard are both empty, leave display positions empty. / 每次承接必须拿1张现有的委托。查看时牌堆不足就看余下的；弃牌堆只在查看开始时牌堆已空才洗混，不会为了凑足张数而洗混。即使查看时一张牌也没有，仍可以从委托榜上承接。主委托牌堆与弃牌堆都空时，榜位空着。
- [B3 · R25] Your look is private: only you see the cards and which of them you discard. The Main Order discard pile is face down; only the counts of the deck and the discard are public. / 查看是私下进行的：看过的牌，以及弃置了哪几张，只有你知道。主委托弃牌堆面朝下；牌堆与弃牌堆只公开张数。
- [L386] If a single turn takes more than one face-up Order, refill after the turn, not between the takes. / 如果一个回合中从榜上拿走了不止一张委托，在该回合结束后再补榜，而不是在两次承接之间补。
- [INT Deferred refill] The display refills when the reserving player's turn ends, after any after-action Imperial Priority or Colour Samples swap. A swap used after this action may discard an Order this action reserved. / 委托榜在承接者的回合结束时才补，排在行动后的御烧优先或色样簿换单之后；在此行动之后换单，可以弃置刚承接的委托。
- [P2] Provisional ruling: if more than two display positions are empty (only after the deck and discard both ran out), every refill compacts the display and fills all empty positions as cards allow. / 暂定裁定：如果空榜位多于2个（只在牌堆与弃牌堆都用尽之后才会出现），每次补榜都先向左推齐，再用现有的牌尽量补满所有空位。
- [R12 · L640] Senior Apprentice gives 1 Apprentice here the Shifu's effect: Select 3, reserving up to 2. / 高徒可以让1名学徒在这里按师傅效果结算：精选3，承接至多2张。
- [L300] Face-up Main Orders cannot be completed; only Orders in your hand can be completed. / 榜上的委托不能完成，只能完成在手委托。

### guild_hall — Guild Hall / 陶工行

- [L166] Capacity is 2, 3 or 4 spaces in 2-, 3- or 4-player games. / 容量：2人2个、3人3个、4人4个工位。
- [L224 · INT Guild Hall Shifu takes] A placement here is legal only if you can afford at least 1 face-up Tech from a discipline you do not yet own. The same holds for the Shifu: a Tech it might find by inspecting never makes the placement legal. / 派工到这里的前提是：你付得起1张公开技艺，且你还没有该门类的技艺。师傅也一样：查看时可能找到的技艺，不能让派工变为合法。
- [L156 · L219] "Up to 2" means 1 or 2: the Shifu's first Tech is the main action, and the second is optional. / “至多2项”的意思是1或2项：师傅的第1项技艺是主行动，第2项可以不拿。
- [INT Guild Hall Shifu takes] The Shifu's 2 Techs must come from different disciplines, so at most 1 of them can be an inspected Tech. / 师傅的2项技艺必须来自不同门类，所以其中至多1项是所查看的技艺。
- [L225 · INT Guild Hall Shifu takes] Each Tech resolves fully before the Shifu takes another: any second space it adds, any Contribution cards it brings and any when-acquired effect. / 每项技艺先完整结算，师傅才拿下一项：它添设的第二工位（如有）、它附带的控火牌（如有），以及“习得时”效果。
- [L221] A taken Tech's position stays empty until your turn ends, so the Shifu's second Tech never comes from a refill. / 被拿走的技艺的位置空着，直到你的回合结束，所以师傅的第2项技艺不会来自补牌。
- [B2] The Shifu's inspection is private. The Shifu may inspect any discipline, including one already owned. You choose the order in which untaken inspected Techs go to the bottom, and that order stays private. They go to the bottom when the Shifu stops taking; the display refills when your turn ends. / 师傅的查看是私下进行的；可以查看任何门类，包括你已拥有技艺的门类。查看后没有拿的技艺按你决定的顺序（保密）放回该门类的牌堆底；师傅不再拿技艺时放回，你的回合结束时再补牌。

### canal_wharf — Canal Wharf / 漕运码头

- [L157] You may not pass during the Work Phase. The Canal Wharf has no capacity limit or resource cost, so it is always a legal placement for an available worker. / 派工阶段不能跳过。漕运码头没有容量限制，也不需要资源，所以可派工人总是可以派往那里。
- [L506 · B1] When the Main Order deck is empty, the discard pile is shuffled into a new deck before the Shifu takes a card. If both are empty, the Shifu takes no card but still gains 4 Coins. / 主委托牌堆已空时，先把弃牌堆洗混组成新牌堆，师傅再拿牌；牌堆与弃牌堆都空时，师傅不拿牌，仍得4铜钱。
- [B3] The Shifu's card goes into your hand and is secret like every held Order; only your hand count is public. / 师傅拿到的委托收入手中，与其他在手委托一样保密；只公开手牌张数。

### magistrates_hall — Magistrate's Hall / 州衙

- [L168 · L114] It has 1 space in 2- and 3-player games and 2 spaces in 4-player games; in 2- and 3-player games the second space is covered. / 2人局与3人局中有1个工位，4人局中有2个工位；2人局与3人局盖住第二工位。
- [L156] You may place a worker only if you can perform at least 1 instance of the main action: pay the Coin cost while at Recognition 0, 1 or 2. / 只有当你至少能执行1次主行动时，才可以派工到这里：声望为0、1或2，且付得起铜钱。
- [L245 · R21] The Shifu's Crown Order is optional: after advancing, you may reserve 1 face-up Order that shows a Crown, or none; with none showing, nothing is reserved. The reserved Order's position stays empty until the end of your turn; then the display is refilled as at the Commission Market. / 师傅的御令委托可以不拿：推进声望后，可以从榜上承接1张印有御令的委托，也可以不承接；榜上没有印有御令的委托时，就不承接。被承接的委托的榜位空着，直到你的回合结束；然后按瓷牙行的方式补榜。
- [R12] Senior Apprentice never applies at the Magistrate's Hall. / 高徒不适用于州衙。

---

## Imperial Recognition milestones

### imperial_grant — Imperial Grant / 御赐


### imperial_gift — Imperial Gift / 赐御窑

- [L290 · L293] The Imperial Kiln holds 1 ceramic per firing. It does not occupy a Shared Kiln space. / 御窑每次烧成只容纳1件，不占用共窑窑位。
- [L291] During a Glaze & Load action, 1 vessel loaded by that action may be placed in your empty Imperial Kiln instead of the Shared Kiln. Imperial Priority also loads it. No Tech effect loads it. You pay no Wood when loading into it. / 施釉装窑行动中，该行动装窑的器物可以有1件改放进你空着的御窑，而不放进共窑。御烧优先也可以把器物装进御窑。技艺效果一律不能把器物装进御窑。装进御窑不花柴。
- [L292 · R11] Loading it chooses the −1, 0 or +1 Imperial modifier. The modifier is public when chosen and is recorded on the ceramic. / 装窑时，选定御窑修正−1、0或+1；它在选定时就公开，并记录在该器物上。
- [L292] Its Actual Heat is the Kiln Die result + the Fire modifier + that modifier (plus the Kiln Master marker if it carries it), whatever the Contributions were. It still fires during the shared Firing Phase. / 它的实际火候 = 窑骰点数 + 窑火修正 + 御窑修正（+ 窑工标，如有），与控火结果无关；它仍在共同的烧窑阶段烧成。
- [L293] It counts as a ceramic in this firing for your Techs and abilities, but it does not make you a Contribution participant: only a ceramic in the Shared Kiln does. / 对你的技艺与能力而言，它算作本次烧成中的器物，但不会让你成为控火的参与者：只有共窑中的器物才算。
- [INT No Contribution participants] If only Imperial Kiln ceramics are loaded, Contributions are skipped and Base Heat is the Kiln Die result; the Fire card is still revealed. / 如果只有御窑器物入窑，就跳过控火，基础火候就是窑骰点数；仍然翻开窑火牌。
- [L634] Kiln Furniture, Inverted Firing and Setter's Mark affect the Shared Kiln only. / 支烧窑具、覆烧、窑位签只作用于共窑。
- [L294] After firing, its ceramic resolves Quality and moves to the owner's Finished Ceramics area normally. / 烧成后照常定品，移入主人的成器区。

### imperial_priority — Imperial Priority / 御烧优先

- [R10 · R11 · L291] Imperial Priority is free: it pays no Wood. Loading through it chooses the −1, 0 or +1 Imperial modifier like any Imperial load, and the modifier is public. / 御烧优先免费，也不花柴；通过它装窑时，同样选定御窑修正−1、0或+1，它在选定时就公开。
- [L633] Imperial Priority is a token effect, not a worker action. It never counts as a Glaze & Load action and does not trigger effects that require that action. / 御烧优先是令牌效果，不是工人行动。它不算施釉装窑行动，也不触发需要该行动的效果。
- [R22] If you own Kiln Master, its once-per-round marker may go on the ceramic Imperial Priority loads. / 如果你有窑工，每轮一次的窑工标也可以放在通过御烧优先装进的器物上。
- [INT Before/after-action window] Imperial Priority and the Colour Samples swap may share a before- or after-action window, in an order you choose. / 御烧优先与色样簿换单同在“工人行动之前或之后”时，二者的先后由你决定。
- [P1] Provisional ruling: Reworking Table may be used when Imperial Priority glazes and loads a vessel, using its once-per-round allowance. / 暂定裁定：御烧优先为1件坯施釉装窑时，也可以使用改坯案，并消耗改坯案的“每轮一次”。

### imperial_audience — Imperial Audience / 御前召见

- [L422] The Magistrate's Hall cannot advance you to Recognition 4; only Crowns reach it. / 州衙不能把你推进到声望4，只有御令才能到达。
- [R13] Tribute Ware's bonus Crown also advances Recognition. / 贡瓷的额外御令同样推进御府声望。

### imperial_overflow — Crowns beyond Recognition 4 / 声望满后每个御令+1分

- [L434] A multi-Crown Order may reach Recognition 4 and then score VP from any remaining Crowns on that same Order. / 一张多御令的委托可以先到达声望4，再用同一张委托上余下的御令得分。
- [R13] Tribute Ware's bonus Crown scores past Recognition 4, but it is not a printed Crown and does not count for tie-breaker 2. / 贡瓷的额外御令在到达声望4后得1分，但它不是委托上印有的御令，不计入平局判定②。
- [L493] Tie-breaker 2 counts Crown icons printed across completed Orders, including those scored beyond Recognition 4. / 平局判定②统计已完成委托上印的御令总数，包括到达声望4后得分的御令。

---

## Orders

### orders.starting — Starting Orders / 起始委托

- [L516] Starting Orders never enter the Main Order deck and have no Crowns; if discarded from your hand during Cleanup, return them to the box. They are Orders for all rules and Kiln Tradition abilities. A player is never required to complete a Starting Order. / 起始委托永远不进入主委托牌堆，也没有御令；若在收工时从手中弃置，放回盒中。对所有规则与窑口传承能力而言，起始委托都算作委托。玩家没有义务完成任何起始委托。
- [L465] When completing an Order, each of your Crackle ceramics may count as having any one Decoration for that Order's Decoration requirements. Its printed Decoration is unchanged. / 完成委托时，你的每件开片器都可以视为具有任意一种纹饰，以满足该委托的纹饰要求；它原本的纹饰不变。
- [L211 · L307] Starting Orders and reserved Main Orders both count toward your hand limit of 4 (5 with Colour Samples), checked only at Cleanup. / 起始委托与承接的主委托都计入委托上限4张（有色样簿则为5张），只在收工时检查。

### orders.main — Main Orders and Crown Orders / 主委托与御令委托

- [L300] Face-up Main Orders cannot be completed; they are reserved at the Commission Market during the Work Phase. / 委托榜上的主委托不能完成；它们要在派工阶段到瓷牙行承接。
- [L418] Requirements are independent unless a specific pairing is explicitly printed. / 各项要求彼此独立，除非卡面直接写明配对。
- [L465 · INT Ge Crackle revision 4] Each Crackle ceramic may count as having any one Decoration for that Order's Decoration requirements; its printed Decoration is unchanged. Each Crackle ceramic you deliver to complete an Order scores 1 VP. / 每件开片器都可以视为具有任意一种纹饰，以满足该委托的纹饰要求；它原本的纹饰不变。你每交付1件开片器完成委托，得1分。
- [L411] Resolve 1 Crown at a time. Each Crown advances Imperial Recognition by 1 until you reach Recognition 4; after that, each further Crown scores 1 VP immediately. Resolve every milestone crossed. / 逐个结算御令。每个御令使御府声望推进1格，直到声望4。到达声望4之后，每再获得1个御令，立即得1分。途经的每一格奖励都要结算。
- [R13] Tribute Ware's bonus Crown is not a printed Crown: it does not trigger Guan and does not count for tie-breaker 2. / 贡瓷的额外御令不是委托上印有的御令：它不触发官窑，也不计入平局判定②。
- [L493] Tie-breaker 2 counts Crown icons printed across completed Orders. / 平局判定②统计已完成委托上印的御令总数。
- [L122 · R23] At Setup, in reverse turn order, each player chooses a Kiln and takes 1 face-up Main Order in one turn; the display is refilled to 6 after each take, and everyone sees which Order each player took. / 游戏准备时，按回合顺序的逆序，每位玩家在同一个回合里选定窑口板，并从委托榜上拿取1张主委托；每拿1张就把委托榜补回6张，大家都看到各人拿的是哪张。
- [L142 · L144] At the start of Rounds 2–5, discard the 2 leftmost face-up Main Orders, slide the remaining 4 left and reveal 2 new Orders to restore the display to 6. / 第2–5轮开工时轮换委托榜：弃置最左边的2张主委托，余下4张向左推，再翻开2张新委托，使委托榜恢复为6张。
- [B1] If the deck and discard are both empty, only available cards can be reserved and display positions stay empty. The round-start rotation discards up to 2 and slides the rest. / 如果主委托牌堆和弃牌堆都空了，只能承接现有的牌，榜位就空着；开工轮换至多弃置2张，其余的向左推。
- [L203 · B3 · R25] Orders looked at and not reserved, at the Commission Market or with Colour Samples, are discarded face down to the Main Order discard pile. Only the player who looked knows which they are; the discard count is public. / 在瓷牙行或用色样簿翻看而没有承接的委托，面朝下弃置到主委托弃牌堆；是哪几张只有翻看者知道，弃牌堆张数公开。
- [L392 · R21] The Magistrate's Hall Shifu may also reserve 1 face-up Crown Order after advancing Recognition. / 州衙的师傅推进声望后，还可以从榜上承接1张御令委托。
- [B3] The Main Order discard pile is face down; only its count is public. Display Orders discarded at round start were already public. / 主委托弃牌堆面朝下，只公开张数；开工时弃置的榜上委托本来就是公开的。
- [L211 · L307] Starting Orders and reserved Main Orders both count toward your hand limit of 4 (5 with Colour Samples), checked only at Cleanup. Discarded Main Orders go to the Main Order discard pile. / 起始委托与承接的主委托都计入委托上限4张（有色样簿则为5张），只在收工时检查；弃置的主委托进入主委托弃牌堆。

---

## Revision notes (V1.6.2)

Carried over from the V1.6.1 file on 2026-10-18 (engine track, stage 4), under the owner's rule above.

- **Renumbered.** Every `L` tag now cites the V1.6.2 English source after owner revision 2. Unchanged lines were mapped line for line from V1.6.1 (+2 for V1.6.1 lines 31–188, −1 for lines 193–524, −9 for lines 541–757); every line V1.6.2 rewrote was re-read and the item checked against the new text. The audit tags now resolve against the V1.6.2 audit.
- **Removed as obsolete or wrong under V1.6.2:**
  - Commission Market: the optional Shifu top-3 selection (`ED L714`), blind reservations, "a resource after each" reservation, and Senior Apprentice's "2 reservations, the top-3 selection on 1 of them" (changes 21–22, L195–196, L644).
  - Materials Yard and Senior Apprentice: the Shifu's 1-Coin +1 Clay +1 Wood option (L165).
  - Canal Barge completing Orders and ruling R6, with the Canal Barge items of Ru, Guan, Ge and Tribute Ware, the Canal Barge before/after-action window and its deferred-refill item (change 22, L622).
  - Protective Saggars' Wood cost and Flawed → Standard upgrade, and Ge following that upgrade on the same ceramic (L628, L645).
  - Colour Samples' "from the deck only" editorial note (`ED L391`, retired), and a single extra Fire card for Second Firing (L631).
  - Imperial Gift: a Kiln gained during the before/after-action window (nothing in the window can gain one any more).
- **Rewritten:** Senior Apprentice (R12, L198), the Commission Market's B1 and B3 and its deferred refill, Colour Samples' B1 and B3, Protective Saggars' Ge and salvage items, Second Firing's Imperial and Jun (R7) items, Jun's R7 item, Fuel Ledger's Wood cost, Test Pieces' buried card (L640), the Guild Hall's B2, and Ru, Guan and Ge timing (L484).
- **Added:** Colour Samples' swap (R4, R17, L641, change 24, Imperial Priority window, deferred refill) and its Guild Hall first take; the Commission Market look (INT Commission Market looks); the Guild Hall Shifu's takes (L144, L209, L212, L213); the Canal Wharf Shifu's card (B1, B3); Canal Barge (L296, INT Canal Barge); Protective Saggars' "never Flawed" (INT Protective Saggars floor); Test Pieces' reshuffle (R15); Second Firing's 2 public cards; looked-at Orders going to the deck bottom (L34, B3).
- **Owner ruling R19 (2026-10-18):** several looked cards put on the bottom of the deck go there in random order. The rulebook is silent; the owner's ruling replaced provisional default P5 (the order drawn), and three items now say it: Colour Samples' deck-bottom item, the Commission Market's B3 item and the Main Orders' deck-bottom item.

### Owner revision 3 (changes 25–27, 2026-10-18)

- **Renumbered.** Every `L` tag now cites the English source after owner revision 3: lines 1–34 keep their numbers, 35–58 move down 5, 59–377 down 6, 379–709 down 5, 710–745 down 6 and 747–748 down 5 (the audit gives the full map). Revision 3 deleted lines 378 and 746 (Tech VP); no item cited them.
- **Removed:** both Tech VP items (owner amendment A1, superseded by change 27): Connoisseur's Cabinet's "the tile's own 1 VP" and the Guild Hall's "each Advanced Tech scores 1 VP"; Colour Samples' "takes only from the deck and leaves the display unchanged" swap item (change 25: every Select may take a face-up Order; the rest of that item is in the rewritten L646 item).
- **Rewritten:** Colour Samples' R4, L646, R17 and B1 · R16 items (the swap Selects 3, and both looks may take a face-up Order) and its Guild Hall first-take item (its Select 3); Fuel Ledger's L668, L93 · L508 and L669 · L670 items (its 2 Contribution cards replaced the secret commitment, change 26; the L669 · L670 item's Chinese now says what its English and Chinese lines 671–672 say, without the card values it had added); Senior Apprentice's L649 item and the Commission Market's R12 · L649 item (Select 3, reserving up to 2); the Guild Hall's L219 item (no VP; a Tech's Contribution cards resolve with it).
- **Added:** the keyword Select N (L64) on Colour Samples and the Commission Market, the two components that use it; Fuel Ledger's cards beside the Firing deck (L111).
- The count stays 170 (2 + 1 removed, 3 added).

### Owner revision 4 (changes 28–35) and owner rulings R20–R25 (2026-10-22/23)

- **Renumbered.** Every `L` tag now cites the English source after owner revision 4 and R25's edit (737 lines), by the audit's revision-3 → revision-4 map; every line revision 4 rewrote was re-read and the item checked against the new text.
- **Removed:**
  - the player Heat marker (changes 28, 31): Glaze & Load's R9 item, its Heat-marker step item and its "turned after Base Heat" item (rev. 3 L273–274); Kiln Master's three marker items (one marker per ceramic, the Heat-marker step, "a Heat marker adds its value"); R9 is obsolete;
  - the firing-step salvage (change 30): Protective Saggars' salvage item;
  - Ge's "never a Masterpiece" clause (change 29): the Ge and Main Orders items;
  - Decorator's Kit's "Every Decoration costs 2 Coins" item (change 30: the Decoration table is gone; the Form & Decorate item is rewritten);
  - Second Firing's R7 item, which revision 4 printed in the tile itself (rev. 4 L627).
- **Rewritten:** Decorator's Kit, Ding and Form & Decorate's discounts item (rev. 4 L639, a vessel's cost); Prepared Clay's Shifu-discount item (L184); Senior Apprentice's and the Materials Yard's R12 items (8 resources, change 34); Colour Samples' and the Commission Market's Select N, B3 and deck items and the Main Orders' deck item (owner ruling R25: the looked cards not reserved are discarded; R19 obsolete); Kiln Furniture's marker item (Kiln Master's marker, L255, L661); Inverted Firing's and Glaze & Load's R5 items (1 Wood for a Shared Kiln destination, L198); Protective Saggars' and Ge's Saggars items (both may apply to one ceramic, L641); Fuel Ledger's reveal item (L253, L659); Test Pieces' timing item (L636, which no longer says "in First Player order": the item now quotes only its bury and run-out sentences, and its L374 tag, a general rule, is dropped); Second Firing's Imperial item (the Kiln Master marker) and its salvage item (the sale, R20); Ge's target and timing items (Fine or Standard; Crackle VP, L465, L480); Jun's timing, Kiln Master and Second Firing items (L478, L627, L635); the Imperial Gift's loading and Actual Heat items (no Wood, the Kiln Master marker, L291–292); Imperial Priority's R10 item (no Wood) and its marker item (Kiln Master, R22); the Main Orders' Crackle item (Crackle VP).
- **Added:** Kiln Master at any loading (R22), its public marker (L635, L664) and its place in Actual Heat (L661); Kiln Tending's Wood after the fuel (L614, L197); Form & Decorate's legality after reductions (L186); Glaze & Load's kiln fuel (L197, R24); the Magistrate's Hall Shifu's optional Crown Order (L245, R21); the Main Orders' Setup choice (L122, R23) and the Magistrate's Hall Crown Order (L392, R21).
- The count goes from 170 to 167 (12 removed, 9 added).
