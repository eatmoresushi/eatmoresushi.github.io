# Kiln Opening V1.6.1 — Component clarifications (rules details)

Purpose: owner decision D10 ([OWNER_DECISIONS.md](./ui-v1.6.1/OWNER_DECISIONS.md)). When a player clicks, taps or focuses a Tech tile, Kiln Player Board, location, Imperial Recognition milestone or Order, the rules details show the component's short text, its full rule word for word, and **the clarifications listed here for that component only**, each labelled with its source. The component's own full rule text is shown separately and is not repeated here. A sentence from elsewhere in the rulebook appears only when it adds to that rule.

These items are rules reference only. They give no advice, strategy, odds or previews (D3, D4).

Status: prose. This file is **outside the rules fingerprint**. It is not data, it is not hashed, and it never changes a rule. If an item here disagrees with [KILN_OPENING_v1.6.1_EN_SOURCE.md](./KILN_OPENING_v1.6.1_EN_SOURCE.md) or [RULEBOOK_AUDIT_V1.6.1.md](./RULEBOOK_AUDIT_V1.6.1.md), those sources win and this file must be corrected. Chinese follows [GLOSSARY_ZH_V1.6.1.md](./GLOSSARY_ZH_V1.6.1.md), and no player-facing text says lock or unlock (D7).

## Format

- Sections are keyed by stable data IDs: Techs `T01`…`T25` (`data/techniques.json`), Kilns `RU` `GU` `GE` `DI` `JU` (`data/kilns.json`), locations (`data/action_locations.json`), Imperial milestones (`data/imperial_progress.json`; `imperial_overflow` covers `overflowVpPerCrown`), and `orders.starting` / `orders.main`.
- Each item reads: `- [source] English text / 中文`. The English quotes the rulebook verbatim where possible; rulings and interpretations are paraphrased faithfully.

## Source tags

| Tag | Source | Label shown in the UI |
| --- | --- | --- |
| `L124` | Line of the V1.6.1 rulebook (EN source) | Rulebook |
| `A1` | Owner amendment A1 (Tech VP on gain) | Owner amendment |
| `R1`–`R13` | Owner rulings | Owner ruling |
| `B1`–`B3` | Owner rulings (supply, Guild Hall, hidden Orders) | Owner ruling |
| `ED Lnnn` | Audit editorial correction to that line | Editorial correction |
| `INT <name>` | Audit "Interpretations of V1.6.1 text" | Recorded interpretation |
| `P1`–`P3` | Audit provisional defaults | Provisional ruling (owner may change) |
| `D7` | Owner UI decision D7 (wording only) | Wording |

---

## Advanced Techs

### T01 — Large Throwing Wheel / 大陶车

- [L375] A player may own at most 3, and at most 1 from each discipline. / 每人至多3项技艺，每门类至多1项。
- [L376 · L212 · D7] A Form & Decorate Tech adds your second Form & Decorate space. A space added this way may be used later the same round. / 习得坯作技艺即添设你的制坯饰纹第二工位；新添设的工位本轮稍后就可以使用。
- [A1] This Tech scores 1 VP immediately when you gain it. It is not scored again at game end. / 习得时立即得1分；终局不再另计。
- [L214] A newly acquired Advanced Tech may be used in the same round if its timing permits. / 新习得的技艺只要时机允许，本轮就可以使用。
- [R4] Tech abilities are optional. Declining does not use the once-per-round allowance. Valid discounts apply before payment. / 技艺效果可选用；放弃不消耗“每轮一次”。减免在支付前计算。
- [L652] Large Throwing Wheel reduces Clay only; Ding's vessel is not a Vase or Censer. / 大陶车只减泥；定窑的额外坯不是瓶或香炉。
- [L646] Prepared Clay is a Tech effect, not a worker action, and never counts as a Form & Decorate action, so a vessel formed through Prepared Clay is not formed in a Form & Decorate action. / 练泥是技艺效果，不是工人行动，不算制坯饰纹行动；经练泥所制坯不在制坯饰纹行动中。

### T16 — Decorator's Kit / 饰坯匣

- [L375] A player may own at most 3, and at most 1 from each discipline. / 每人至多3项技艺，每门类至多1项。
- [L376 · L212 · D7] A Form & Decorate Tech adds your second Form & Decorate space. A space added this way may be used later the same round. / 习得坯作技艺即添设你的制坯饰纹第二工位；新添设的工位本轮稍后就可以使用。
- [A1] This Tech scores 1 VP immediately when you gain it. It is not scored again at game end. / 习得时立即得1分；终局不再另计。
- [L214] A newly acquired Advanced Tech may be used in the same round if its timing permits. / 新习得的技艺只要时机允许，本轮就可以使用。
- [R4] Tech abilities are optional. Declining does not use the once-per-round allowance. Valid discounts apply before payment. / 技艺效果可选用；放弃不消耗“每轮一次”。减免在支付前计算。
- [L333] Every Decoration costs 2 Coins; the Shifu's Form & Decorate action and Decorator's Kit each reduce one Decoration by 1 Coin. / 每种纹饰都是2铜钱；师傅的制坯饰纹行动与饰坯匣各令1项纹饰少付1铜钱。
- [L652] The Shifu's Decoration discount, Decorator's Kit and Ding's 1-Coin vessel are three separate reductions. The first two may apply to the same Decoration (a Carved for 0). Ding's vessel takes neither. / 师傅纹饰减免、饰坯匣、定窑1铜钱额外坯是三项各自独立的减免。前两项可以作用于同一项纹饰（刻花可降到0铜钱）；定窑的额外坯两项都不适用。
- [INT Decorator's Kit] Decorator's Kit may reduce the Decoration paid through Prepared Clay. / 饰坯匣可用于经练泥所付的纹饰。

### T05 — Reworking Table / 改坯案

- [L375] A player may own at most 3, and at most 1 from each discipline. / 每人至多3项技艺，每门类至多1项。
- [L376 · L212 · D7] A Form & Decorate Tech adds your second Form & Decorate space. A space added this way may be used later the same round. / 习得坯作技艺即添设你的制坯饰纹第二工位；新添设的工位本轮稍后就可以使用。
- [A1] This Tech scores 1 VP immediately when you gain it. It is not scored again at game end. / 习得时立即得1分；终局不再另计。
- [L214] A newly acquired Advanced Tech may be used in the same round if its timing permits. / 新习得的技艺只要时机允许，本轮就可以使用。
- [R4] Tech abilities are optional. Declining does not use the once-per-round allowance. / 技艺效果可选用；放弃不消耗“每轮一次”。
- [L329] Vessel cards are not a hard gameplay limit. If all 10 cards of a Shape are in use, use a suitable proxy until a matching Vessel card becomes available. / 器型卡不是硬性上限；某器型10张皆在使用中时，以合适的代用物代替，直至有对应器型卡可用。
- [P1] Provisional ruling: Reworking Table may be used when Imperial Priority glazes and loads a vessel, and this uses its once-per-round allowance. The tile triggers "when you glaze and load a Shaped vessel" and does not require the Glaze & Load action. / 暂定裁定：御烧优先为坯施釉装窑时亦可用改坯案，并消耗其“每轮一次”。本牌时机为“每当你为1件坯施釉装窑时”，不限施釉装窑行动。
- [P3] Provisional ruling: during a legal action, the Shape change applies before the Inverted Firing Shape check. Whether a Glaze & Load placement is legal (R5c) looks only at each vessel's current Shape. / 暂定裁定：在合法行动中，改器型先于覆烧的器型检查结算；施釉装窑能否派工（R5c）只看各件坯当前的器型。

### T17 — Prepared Clay / 练泥

- [L375] A player may own at most 3, and at most 1 from each discipline. / 每人至多3项技艺，每门类至多1项。
- [L376 · L212 · D7] A Form & Decorate Tech adds your second Form & Decorate space. A space added this way may be used later the same round. / 习得坯作技艺即添设你的制坯饰纹第二工位；新添设的工位本轮稍后就可以使用。
- [A1] This Tech scores 1 VP immediately when you gain it. It is not scored again at game end. / 习得时立即得1分；终局不再另计。
- [L214] A newly acquired Advanced Tech may be used in the same round if its timing permits. / 新习得的技艺只要时机允许，本轮就可以使用。
- [R4] Tech abilities are optional. Declining does not use the once-per-round allowance. Pay all costs in full and apply valid discounts before payment. / 技艺效果可选用；放弃不消耗“每轮一次”。须足额支付费用，减免在支付前计算。
- [L646] Prepared Clay is a Tech effect, not a worker action. It never counts as a Form & Decorate action and does not trigger effects that require that action. / 练泥是技艺效果，不是工人行动；不算制坯饰纹行动，也不触发需要该行动的效果。
- [L486 · L646 · L615] Ding triggers during its Form & Decorate action, so forming through Prepared Clay does not trigger Ding; Large Throwing Wheel likewise needs a Form & Decorate action. / 定窑于制坯饰纹行动中触发，故练泥所制坯不触发定窑；大陶车同样须在制坯饰纹行动中。
- [L170 · L646] The Shifu's one-Decoration discount belongs to the Shifu's Form & Decorate action, so it does not apply to a vessel formed through Prepared Clay. / 师傅的纹饰减免属于师傅的制坯饰纹行动，不适用于经练泥所制的坯。
- [L333] Every Decoration costs 2 Coins. / 每种纹饰都是2铜钱。
- [INT Decorator's Kit] Decorator's Kit may reduce the Decoration paid through Prepared Clay. / 饰坯匣可用于经练泥所付的纹饰。

### T18 — Senior Apprentice / 高徒

- [L375] A player may own at most 3, and at most 1 from each discipline. / 每人至多3项技艺，每门类至多1项。
- [L376 · L212 · D7] A Form & Decorate Tech adds your second Form & Decorate space. A space added this way may be used later the same round. / 习得坯作技艺即添设你的制坯饰纹第二工位；新添设的工位本轮稍后就可以使用。
- [A1] This Tech scores 1 VP immediately when you gain it. It is not scored again at game end. / 习得时立即得1分；终局不再另计。
- [L214] A newly acquired Advanced Tech may be used in the same round if its timing permits. / 新习得的技艺只要时机允许，本轮就可以使用。
- [R4] Tech abilities are optional. Declining does not use the once-per-round allowance: an Apprentice that does not use it resolves the Apprentice effect, and the tile stays available for another Apprentice this round. / 技艺效果可选用；放弃不消耗“每轮一次”：不使用时，该学徒照常结算学徒效果，本轮仍可留待另一名学徒使用。
- [R12] Senior Apprentice resolves the whole Shifu effect, including the Materials Yard option to pay 1 Coin for +1 Clay and +1 Wood. It never applies at the Magistrate's Hall. / 高徒结算完整的师傅效果，在泥柴场含“可付1铜钱再得1泥1柴”；不适用于州衙。
- [L653] Senior Apprentice at the Commission Market gives that Apprentice the Shifu's 2 reservations, the top-3 selection on 1 of them, and a resource after each. / 高徒派往瓷牙行时，该学徒获得师傅的2次承接、其中1次可看三取一，以及每次承接后的1份资源。
- [L199 · R12] A Shifu effect must reserve at least 1 Order, but may stop after the first reservation. Because the display is not refilled until your turn ends, a second face-up reservation chooses from the Orders still showing. / 师傅效果须至少承接1张，可在第1张后停止；因回合结束前不补榜，第二次若承接榜上委托，只能从仍在榜上者中选。
- [B3] The top-3 look is private to the acting player. / 看三取一所见仅你可见。
- [L140] Capacities are absolute; the Apprentice still needs an unoccupied space. / 容量为绝对上限；该学徒仍须派往空工位。

### T19 — Connoisseur's Cabinet / 清玩斋

- [L375] A player may own at most 3, and at most 1 from each discipline. / 每人至多3项技艺，每门类至多1项。
- [L376 · L212 · D7] A Form & Decorate Tech adds your second Form & Decorate space. A space added this way may be used later the same round. / 习得坯作技艺即添设你的制坯饰纹第二工位；新添设的工位本轮稍后就可以使用。
- [A1] The tile's own 1 VP is scored immediately when you gain it; its Exhibition bonus is scored at game end. / 本牌自身的1分于习得时立即计入；陈列加分于终局计算。
- [L444 · L452] At game end, exhibit any number of your undelivered ceramics of Standard Quality or better. Flawed ceramics cannot be exhibited. / 终局时，陈列任意数量的良品以上未交付器物；瑕品不能陈列。
- [INT Exhibition] Every eligible undelivered ceramic is exhibited automatically. / 数字版自动陈列所有符合条件的未交付器物。

### T10 — Colour Samples / 色样簿

- [L375] A player may own at most 3, and at most 1 from each discipline. / 每人至多3项技艺，每门类至多1项。
- [L376 · L212 · D7] A Glazing & Loading Tech adds your second Glaze & Load space. A space added this way may be used later the same round. / 习得釉作技艺即添设施釉装窑第二工位；新添设的工位本轮稍后就可以使用。
- [A1] This Tech scores 1 VP immediately when you gain it. It is not scored again at game end. / 习得时立即得1分；终局不再另计。
- [L214] Resolve any when acquired effect immediately. / “习得时”的效果立即结算。
- [R4] The when-acquired reservation is mandatory whenever at least 1 Main Order can be looked at. / 只要至少能看1张主委托，习得时的承接即为强制。
- [L650 · ED L391] The when-acquired reservation takes from the deck only, never from the display, and does not refill the display. Your hand limit of 5 applies at every Cleanup while you own the tile. / 习得时的承接只取自牌堆，不取委托榜，委托榜不补。拥有此牌期间，每次收工的上限都是5张。
- [B1] A top-3 look sees as many cards as remain. The discard is reshuffled only when the deck is empty, never to complete a look. / 看三取一不足3张时看余数；弃牌堆只在牌堆用尽时洗混，不为凑足查看而洗混。
- [B3] The top-3 look is private to the acting player. The Main Order discard pile is face down; only its count is public. / 所看内容仅你可见；主委托弃牌堆面朝下，只公开张数。
- [L200] There is no Order hand limit during a round. Starting Orders and reserved Main Orders both count toward the limit at Cleanup. / 一轮之中没有委托上限；收工时起始委托与承接的主委托都计入上限。

### T20 — Kiln Tending / 看火

- [L375] A player may own at most 3, and at most 1 from each discipline. / 每人至多3项技艺，每门类至多1项。
- [L376 · L212 · D7] A Glazing & Loading Tech adds your second Glaze & Load space. A space added this way may be used later the same round. / 习得釉作技艺即添设施釉装窑第二工位；新添设的工位本轮稍后就可以使用。
- [A1] This Tech scores 1 VP immediately when you gain it. It is not scored again at game end. / 习得时立即得1分；终局不再另计。
- [L214] A newly acquired Advanced Tech may be used in the same round if its timing permits. / 新习得的技艺只要时机允许，本轮就可以使用。
- [INT Kiln Tending] Kiln Tending resolves automatically on the first qualifying Glaze & Load action each round; saving it gains nothing. / 数字版于每轮首次符合条件的施釉装窑行动后自动结算；留待以后毫无所得。
- [L65] Loading includes placing a vessel in your empty Imperial Kiln, so a vessel the action loads into the Imperial Kiln counts as loaded. / 装窑包括放入你空置的御窑；该行动装入御窑的器物也算已装窑。
- [L293 · L646] Imperial Priority is a token effect, not a Glaze & Load action, so loading through it does not trigger Kiln Tending. / 御烧优先是令牌效果，不是施釉装窑行动，经其装窑不触发看火。

### T15 — Kiln Furniture / 支烧窑具

- [L375] A player may own at most 3, and at most 1 from each discipline. / 每人至多3项技艺，每门类至多1项。
- [L376 · L212 · D7] A Glazing & Loading Tech adds your second Glaze & Load space. A space added this way may be used later the same round. / 习得釉作技艺即添设施釉装窑第二工位；新添设的工位本轮稍后就可以使用。
- [A1] This Tech scores 1 VP immediately when you gain it. It is not scored again at game end. / 习得时立即得1分；终局不再另计。
- [L214] A newly acquired Advanced Tech may be used in the same round if its timing permits. / 新习得的技艺只要时机允许，本轮就可以使用。
- [R4] Tech abilities are optional. Declining does not use the once-per-round allowance. / 技艺效果可选用；放弃不消耗“每轮一次”。
- [L647] Kiln Furniture, Inverted Firing and Setter's Mark affect the Shared Kiln only. The Imperial Kiln holds 1 ceramic and uses its own modifier. / 支烧窑具、覆烧、窑位签只作用于共窑。御窑只容纳1件，用它自己的御窑修正。
- [L269] A Heat marker is not a zone modifier: it stacks with Kiln Furniture. / 火标不是温区修正，与支烧窑具叠加。
- [R8] With Inverted Firing, both ceramics in the space use the Kiln Furniture modifier if Kiln Furniture is in that space. / 覆烧时，若该窑位有支烧窑具，两件器物都用窑具修正。
- [L640] A Second Firing recalculation keeps the same Kiln Furniture modifier. / 复烧重算时沿用相同的窑具修正。

### T21 — Inverted Firing / 覆烧

- [L375] A player may own at most 3, and at most 1 from each discipline. / 每人至多3项技艺，每门类至多1项。
- [L376 · L212 · D7] A Glazing & Loading Tech adds your second Glaze & Load space. A space added this way may be used later the same round. / 习得釉作技艺即添设施釉装窑第二工位；新添设的工位本轮稍后就可以使用。
- [A1] This Tech scores 1 VP immediately when you gain it. It is not scored again at game end. / 习得时立即得1分；终局不再另计。
- [L214] A newly acquired Advanced Tech may be used in the same round if its timing permits. / 新习得的技艺只要时机允许，本轮就可以使用。
- [R4] Tech abilities are optional. Declining does not use the once-per-round allowance. / 技艺效果可选用；放弃不消耗“每轮一次”。
- [R8] The newly loaded ceramic must be a Bowl, Plate or Brush Washer. It may join any active space holding exactly 1 of your ceramics, including one loaded earlier by the same action. Both ceramics use the space's printed modifier, or the Kiln Furniture modifier if Kiln Furniture is in that space. / 新装入者须为碗、盘或笔洗；可放入任一恰有1件你的器物的启用窑位，包括本次行动先装入的那件。两件器物都用该窑位的温区修正；若该窑位有支烧窑具，则用窑具修正。
- [R5] While Inverted Firing is unused this round, an active space holding exactly 1 of your ceramics is a legal destination for a Bowl, Plate or Brush Washer when checking whether a Glaze & Load placement is legal. / 覆烧本轮未用时，恰有1件你的器物的启用窑位，可算作碗、盘或笔洗的合法去处，用于判断施釉装窑能否派工。
- [L647] Kiln Furniture, Inverted Firing and Setter's Mark affect the Shared Kiln only. / 支烧窑具、覆烧、窑位签只作用于共窑。
- [P3] Provisional ruling: during a legal action, a Reworking Table Shape change applies before the Inverted Firing Shape check; placement legality looks only at each vessel's current Shape. / 暂定裁定：在合法行动中，改坯案的改器型先于覆烧的器型检查结算；能否派工只看各件坯当前的器型。

### T22 — Setter's Mark / 窑位签

- [L375] A player may own at most 3, and at most 1 from each discipline. / 每人至多3项技艺，每门类至多1项。
- [L376 · L212 · D7] A Glazing & Loading Tech adds your second Glaze & Load space. A space added this way may be used later the same round. / 习得釉作技艺即添设施釉装窑第二工位；新添设的工位本轮稍后就可以使用。
- [A1] This Tech scores 1 VP immediately when you gain it. It is not scored again at game end. / 习得时立即得1分；终局不再另计。
- [INT Setter's Mark] Placement is optional. A Setter's Mark bought mid-round is first placed at the next Work Phase start. / 放置可选；本轮中途习得者，从下一次派工阶段开始时起放置。
- [R5 · L630] An empty active Shared Kiln space marked by another player's Setter's Mark is not a legal destination for you. Only the Setter's Mark owner may load there this round. / 他人窑位签所占的空启用窑位，不是你的合法去处；本轮只有窑位签的主人可装入该窑位。
- [L647] Kiln Furniture, Inverted Firing and Setter's Mark affect the Shared Kiln only. / 支烧窑具、覆烧、窑位签只作用于共窑。

### T23 — Canal Barge / 漕船

- [L375] A player may own at most 3, and at most 1 from each discipline. / 每人至多3项技艺，每门类至多1项。
- [L376 · L212 · D7] A Glazing & Loading Tech adds your second Glaze & Load space. A space added this way may be used later the same round. / 习得釉作技艺即添设施釉装窑第二工位；新添设的工位本轮稍后就可以使用。
- [A1] This Tech scores 1 VP immediately when you gain it. It is not scored again at game end. / 习得时立即得1分；终局不再另计。
- [L214] A newly acquired Advanced Tech may be used in the same round if its timing permits. / 新习得的技艺只要时机允许，本轮就可以使用。
- [R4] Tech abilities are optional. Declining does not use the once-per-round allowance. / 技艺效果可选用；放弃不消耗“每轮一次”。
- [L646] Canal Barge is a Tech effect, not a worker action, and never counts as an Order-Phase action; Canal Barge triggers Ru and Guan. / 漕船是技艺效果，不是工人行动，不算交货阶段的完成委托；漕船触发汝窑与官窑。
- [R6] Canal Barge completes an Order for every completion effect, including Ru, Guan, Tribute Ware and Crackle wildcards. / 经漕船完成在一切方面视为完成委托：触发汝窑、官窑与贡瓷，开片器亦可充作纹饰。
- [INT Before/after-action window] Canal Barge and Imperial Priority may share the window in an order you choose. A token or Imperial Kiln gained during the window is usable within it. / 漕船与御烧优先同在“工人行动之前或之后”时，二者先后由你自定；在此时机中刚获得的令牌或御窑即可使用。
- [INT Deferred refill] Canal Barge used after a Commission Market action may complete an Order reserved by that action. The display refills when your turn ends, after Canal Barge. / 瓷牙行行动之后使用漕船，可完成该行动刚承接的委托；委托榜于你回合结束、漕船之后才补。

### T11 — Protective Saggars / 匣钵护烧

- [L375] A player may own at most 3, and at most 1 from each discipline. / 每人至多3项技艺，每门类至多1项。
- [L376 · D7] Firing Techs add no personal space. / 火作技艺不添设工位。
- [A1] This Tech scores 1 VP immediately when you gain it. It is not scored again at game end. / 习得时立即得1分；终局不再另计。
- [L214] A newly acquired Advanced Tech may be used in the same round if its timing permits. / 新习得的技艺只要时机允许，本轮就可以使用。
- [R4] Tech abilities are optional. Declining does not use the once-per-round allowance. / 技艺效果可选用；放弃不消耗“每轮一次”。
- [L651] Protective Saggars and Second Firing affect only your own eligible ceramics in the current firing, in the Shared Kiln or your Imperial Kiln; never ceramics fired in earlier rounds. / 匣钵护烧与复烧只作用于你本次烧成中（共窑或御窑）符合条件的器物，不作用于先前各轮烧成的器物。
- [L654] Ge's Crackle may be resolved after Protective Saggars on the same ceramic (Flawed → Standard → Fine, once a round). / 哥窑开片可在匣钵护烧之后作用于同一器物（瑕品→良品→上品，每轮一次）。
- [L681 · L378] After-Quality abilities resolve in First Player order. If you control several in this window, you choose their order. / 定品后能力按起始玩家顺序结算；同一时机你有多项能力时，顺序由你自定。
- [L281] After all after-Quality abilities have resolved, each player may discard 1 ceramic that is still Flawed from this firing to gain 2 Coins. / 所有定品后能力结算完毕后，每人可弃1件本次烧成中仍为瑕品的器物，得2铜钱。

### T12 — Fuel Ledger / 柴簿

- [L375] A player may own at most 3, and at most 1 from each discipline. / 每人至多3项技艺，每门类至多1项。
- [L376 · D7] Firing Techs add no personal space. / 火作技艺不添设工位。
- [A1] This Tech scores 1 VP immediately when you gain it. It is not scored again at game end. / 习得时立即得1分；终局不再另计。
- [L214] A newly acquired Advanced Tech may be used in the same round if its timing permits. / 新习得的技艺只要时机允许，本轮就可以使用。
- [R4] Tech abilities are optional. Pay all costs in full. / 技艺效果可选用；须足额支付费用。
- [L261] A player participates in Contributions only if they have at least 1 ceramic in the Shared Kiln. A ceramic in an Imperial Kiln gives no say over the shared fire. / 须在共窑中至少有1件器物方为控火者；御窑器物不给控火之权。
- [L672] Each participant secretly chooses Bank, Tend or Stoke and must be able to pay its Wood cost; with a Fuel Ledger commitment that is 2 Wood. / 控火者暗选压火、守火或添柴，须付得起其柴费；附柴簿加柴时共需2柴。
- [L504] Contribution choices and Fuel Ledger commitments remain secret until revealed. Wood committed to a Contribution remains in that player's total until it is paid. / 控火选择与柴簿加柴在亮牌前保密；随控火所附之柴在支付前仍计入该玩家的柴数。
- [L673 · L674] Reveal all Contribution cards and committed Wood simultaneously, then pay all costs. Start at the Kiln Die result, add all final Contribution modifiers, then clamp to 0–5. / 同时亮出全部控火牌与所附之柴，然后支付全部柴；以窑骰点数起算，加全部最终控火修正（含柴簿加柴后的−2／+2），限定在0–5。

### T13 — Test Pieces / 火照

- [L375] A player may own at most 3, and at most 1 from each discipline. / 每人至多3项技艺，每门类至多1项。
- [L376 · D7] Firing Techs add no personal space. / 火作技艺不添设工位。
- [A1] This Tech scores 1 VP immediately when you gain it. It is not scored again at game end. / 习得时立即得1分；终局不再另计。
- [L214] A newly acquired Advanced Tech may be used in the same round if its timing permits. / 新习得的技艺只要时机允许，本轮就可以使用。
- [R4] Tech abilities are optional. Declining does not use the once-per-round allowance. / 技艺效果可选用；放弃不消耗“每轮一次”。
- [L649] Test Pieces resolves in First Player order, before any Heat marker is turned. A buried card stays on the bottom. You may discuss what you saw but may not show the card. / 火照按起始玩家顺序结算，在任何火标翻定之前。置底的牌留在牌堆底。你可以谈论看到的内容，但不能把牌给别人看。
- [INT Test Pieces] Eligibility counts any of your ceramics in this firing, Imperial Kiln included. The Wood payment and the bury are public; the value you looked at is private to you. / 资格计入你本次烧成中的任一器物，含御窑。付柴与置底为公开信息，所见点数仅你可见。
- [ED L649] The Fire deck is never reshuffled mid-game, so a buried card simply stays at the bottom of the deck. / 窑火牌堆在局中不会重洗，置底之牌始终留在牌堆底。

### T14 — Second Firing / 复烧

- [L375] A player may own at most 3, and at most 1 from each discipline. / 每人至多3项技艺，每门类至多1项。
- [L376 · D7] Firing Techs add no personal space. / 火作技艺不添设工位。
- [A1] This Tech scores 1 VP immediately when you gain it. It is not scored again at game end. / 习得时立即得1分；终局不再另计。
- [L214] A newly acquired Advanced Tech may be used in the same round if its timing permits. / 新习得的技艺只要时机允许，本轮就可以使用。
- [R4] Tech abilities are optional. Declining does not use the once-per-round allowance. / 技艺效果可选用；放弃不消耗“每轮一次”。
- [L651] Second Firing affects only your own eligible ceramics in the current firing, in the Shared Kiln or your Imperial Kiln; never ceramics fired in earlier rounds. Second Firing's extra Fire card changes nothing for any other ceramic. / 复烧只作用于你本次烧成中（共窑或御窑）符合条件的器物，不作用于先前各轮烧成者；复烧额外翻出的窑火牌不影响任何其他器物。
- [INT Imperial Second Firing] On an Imperial Kiln ceramic, Second Firing keeps the same Kiln Die result, the same Imperial modifier and the same Heat marker, with the new Fire card. / 御窑器物复烧时，沿用同一窑骰点数、御窑修正与火标，配合新的窑火修正重算。
- [R7] Jun is once per round. If already used it cannot be used again. If unused, it may be used on the Second Firing ceramic after the extra Fire card is revealed and Actual Heat recalculated, before the new Quality is assigned. / 钧窑每轮一次，已用过则不可再用；若本轮尚未使用，可在额外窑火牌翻开、重算实际火候后、定新品质前用于该器物。
- [L648] Markers stay in place through a Second Firing recalculation. / 复烧重算时，火标留在原处。
- [L681 · L378] After-Quality abilities resolve in First Player order. If you control several in this window, you choose their order. / 定品后能力按起始玩家顺序结算；同一时机你有多项能力时，顺序由你自定。
- [L281] After all after-Quality abilities have resolved, each player may discard 1 ceramic that is still Flawed from this firing to gain 2 Coins. / 所有定品后能力结算完毕后，每人可弃1件本次烧成中仍为瑕品的器物，得2铜钱。

### T24 — Kiln Master / 窑工

- [L375] A player may own at most 3, and at most 1 from each discipline. / 每人至多3项技艺，每门类至多1项。
- [L376 · D7] Firing Techs add no personal space. / 火作技艺不添设工位。
- [A1] This Tech scores 1 VP immediately when you gain it. It is not scored again at game end. / 习得时立即得1分；终局不再另计。
- [L214] A newly acquired Advanced Tech may be used in the same round if its timing permits. / 新习得的技艺只要时机允许，本轮就可以使用。
- [R4] Tech abilities are optional. Declining does not use the once-per-round allowance. / 技艺效果可选用；放弃不消耗“每轮一次”。
- [L648] A ceramic carries at most 1 marker. Kiln Master's marker and your own Heat marker may not sit on the same ceramic. Jun's adjustment applies on top of either. Markers stay in place through a Second Firing recalculation. / 每件器物至多带1个火标；窑工标与你自己的火标不能放在同一件器物上。钧窑的调整叠加在二者之上。复烧重算时，火标留在原处。
- [INT Heat-marker step] Within your turn of the Heat-marker step you choose the order of your own marker and Kiln Master. If your own marker is returned, Kiln Master may then go on that ceramic. / 翻火标步骤中轮到你时，你自定己方火标与窑工标的先后；若你先收回了自己的火标，窑工标可放上那件器物。
- [L290] An Imperial Kiln ceramic counts as a ceramic in this firing for your Techs and abilities. / 御窑器物对你的技艺与窑口能力而言，算作本次烧成中的器物。
- [L269] A Heat marker adds its value to that ceramic's Actual Heat. It stacks with Kiln Furniture. / 火标的数值加入该器物的实际火候，与支烧窑具叠加。

### T25 — Tribute Ware / 贡瓷

- [L375] A player may own at most 3, and at most 1 from each discipline. / 每人至多3项技艺，每门类至多1项。
- [L376 · D7] Firing Techs add no personal space. / 火作技艺不添设工位。
- [A1] This Tech scores 1 VP immediately when you gain it. It is not scored again at game end. / 习得时立即得1分；终局不再另计。
- [L214] A newly acquired Advanced Tech may be used in the same round if its timing permits. / 新习得的技艺只要时机允许，本轮就可以使用。
- [R4] Tech abilities are optional. Declining does not use the once-per-round allowance. / 技艺效果可选用；放弃不消耗“每轮一次”。
- [R13] Tribute Ware's bonus Crown advances Recognition, or scores 1 VP past Recognition 4. It is not a printed Crown: it does not trigger Guan's "showing a Crown" and does not count for tie-breaker 2. / 贡瓷的额外御令推进御府声望，声望满4后计1分；但它不是印刷御令，不触发官窑，也不计入平局判定②。
- [R6] An Order completed with Canal Barge triggers Tribute Ware. / 经漕船完成的委托亦触发贡瓷。
- [L416] Resolve 1 Crown at a time. Resolve every milestone crossed. / 御令逐个结算，所跨各格奖励皆结算。
- [L521] Starting Orders have no Crowns. / 起始委托不印御令。

---

## Kiln Traditions

### RU — Ru Kiln, Quiet Perfection / 汝窑 · 天青无瑕

- [R4] Kiln Tradition abilities are optional. Declining does not use the once-per-round allowance. / 窑口能力可选用；放弃不消耗“每轮一次”。
- [L485 · R6] Ru triggers while completing an Order, in the Order Phase or through Canal Barge. / 汝窑于完成委托时触发，交货阶段或经漕船完成皆可。
- [L521] Starting Orders are Orders for all rules and Kiln Tradition abilities. / 起始委托在一切规则与窑口能力中皆算委托。
- [INT Ge Crackle · L470] Ru uses a ceramic's printed Decoration, not a Crackle wildcard. A Crackle ceramic is never a Masterpiece. / 汝窑按器物原纹饰计，不按开片声明；开片器永不是臻品。

### GU — Guan Kiln, Imperial Patronage / 官窑 · 内府恩眷

- [R4] Kiln Tradition abilities are optional. Declining does not use the once-per-round allowance. / 窑口能力可选用；放弃不消耗“每轮一次”。
- [L485 · R6] Guan triggers while completing an Order, in the Order Phase or through Canal Barge. / 官窑于完成委托时触发，交货阶段或经漕船完成皆可。
- [R13] Tribute Ware's bonus Crown is not a printed Crown and does not make an Order "showing a Crown". / 贡瓷额外获得的御令不是印刷御令，不使委托算作“印有御令”。
- [L521] Starting Orders have no Crowns. / 起始委托不印御令。

### GE — Ge Kiln, Crackle Mastery / 哥窑 · 金丝铁线

- [R4] Kiln Tradition abilities are optional. Declining does not use the once-per-round allowance. / 窑口能力可选用；放弃不消耗“每轮一次”。
- [INT Ge Crackle] Ge targets 1 of your ceramics from this firing that is Standard at that moment. It becomes Fine and permanently carries a Crackle marker. / 每轮一次，定品后，哥窑可选你本次烧成中1件当时为良品的器物：其变为上品，并永久带开片标。
- [L484 · L654] Ge's Crackle is an after-Quality effect; Ge chooses its order among their own after-Quality effects. It may be resolved after Protective Saggars on the same ceramic (Flawed → Standard → Fine, once a round). / 哥窑开片是定品后效果，与己方其他定品后效果的先后自定；可在匣钵护烧之后作用于同一器物（瑕品→良品→上品，每轮一次）。
- [L681] Players resolve after-Quality abilities in First Player order. / 定品后能力按起始玩家顺序结算。
- [L290] An Imperial Kiln ceramic counts as a ceramic in this firing for your abilities. / 御窑器物对你的窑口能力而言，算作本次烧成中的器物。
- [L94] A marked ceramic keeps its Crackle marker until delivered or exhibited. / 开片标保留至该器物交付或陈列。
- [L485 · R6] A Crackle ceramic's wildcard Decoration is declared while completing an Order, including through Canal Barge. / 开片器的纹饰于完成委托时声明，经漕船完成亦可。
- [INT Ge Crackle] Its printed Decoration is unchanged; the Exhibition and Ru use the printed Decoration. / 它原本的纹饰不变；终局陈列与汝窑仍按原纹饰。
- [L654] It never creates a Masterpiece, so a Crackle ceramic cannot fill a Masterpiece requirement, including Painted Masterpiece Orders. / 开片器永远不是臻品，所以不能满足任何臻品要求，包括画花臻品委托。

### DI — Ding Kiln, Moulded Production / 定窑 · 范制成器

- [R1] Ding is selectable as a Kiln at setup. Ding's ability works with either worker type. / 开局选窑口时，定窑可供选择；其能力学徒或师傅行动皆可触发。
- [R4] Kiln Tradition abilities are optional. Declining does not use the once-per-round allowance. Pay all costs in full. / 窑口能力可选用；放弃不消耗“每轮一次”。须足额支付费用。
- [L486] Ding triggers during its Form & Decorate action. / 定窑于制坯饰纹行动中触发。
- [L646] Prepared Clay is a Tech effect and never counts as a Form & Decorate action, so a vessel formed through Prepared Clay does not trigger Ding. / 练泥是技艺效果，不算制坯饰纹行动，练泥所制坯不触发定窑。
- [L652] The Shifu's Decoration discount, Decorator's Kit and Ding's 1-Coin vessel are three separate reductions. Ding's vessel takes neither. Large Throwing Wheel reduces Clay only; Ding's vessel is not a Vase or Censer. / 师傅纹饰减免、饰坯匣、定窑1铜钱额外坯是三项各自独立的减免；定窑的额外坯两项都不适用。大陶车只减泥；定窑的额外坯不是瓶或香炉。

### JU — Jun Kiln, Kiln Transformation / 钧窑 · 窑变天成

- [R4] Kiln Tradition abilities are optional. Declining does not use the once-per-round allowance. Pay all costs in full. / 窑口能力可选用；放弃不消耗“每轮一次”。须足额支付费用。
- [L483] Jun acts after Actual Heat is calculated (Heat markers included) and before Quality is assigned. / 钧窑在实际火候算出后（火标已计入）、定品前结算。
- [L679] Resolve Jun and other heat-adjustment abilities in First Player order. / 钧窑等调火能力按起始玩家顺序结算。
- [L648] Jun's adjustment applies on top of either a Heat marker or the Kiln Master marker. / 钧窑调整叠加于火标或窑工标之上。
- [L290] An Imperial Kiln ceramic counts as a ceramic in this firing for your abilities. / 御窑器物对你的窑口能力而言，算作本次烧成中的器物。
- [L249] Global Heat and Actual Heat are not clamped. / 全窑火候与实际火候不设上下限。
- [R7 · L640] Jun is once per round. If unused, it may be used on a Second Firing ceramic after the extra Fire card is revealed and Actual Heat recalculated, before the new Quality is assigned. Jun's adjustment from the first calculation does not carry over. / 钧窑每轮一次。若本轮尚未使用，可在复烧翻开额外窑火牌、重算实际火候后、定新品质前用于该器物；第一次计算时的钧窑调整不保留。

---

## Locations

### materials_yard — Materials Yard / 泥柴场

- [L150] Capacity is 2, 3 or 4 spaces in 2-, 3- or 4-player games. / 容量：2人2个、3人3个、4人4个工位。
- [L140] A worker may go on any unoccupied space. Workers already on other spaces, yours or anyone's, do not matter. Capacities are absolute: no worker, including the Shifu, may be placed at a location whose spaces are all occupied. / 工人可派往任一空工位；其他工位上已有谁的工人皆无妨。容量为绝对上限：工位全满时，任何工人（含师傅）都不能派往。
- [L142] Optional bonuses may still be declined. / 可选的额外收益可以放弃。
- [R12] Senior Apprentice lets 1 Apprentice resolve the whole Shifu effect here, including the option to pay 1 Coin for +1 Clay and +1 Wood. / 高徒可令1名学徒在此结算完整的师傅效果，含“可付1铜钱再得1泥1柴”。
- [L618 · L646] Prepared Clay may form 1 vessel during a Materials Yard action, after gaining resources; it is a Tech effect, not a Form & Decorate action. / 练泥可于泥柴场行动中、得资源后制1件坯；这是技艺效果，不算制坯饰纹行动。
- [L502] The supply of Clay, Wood and Coins is unlimited. / 泥、柴、铜钱的供应无限。

### form_decorate — Form & Decorate / 制坯饰纹

- [L144] Personal locations are on your own board. Each personal space may be used once per round. / 坊内地点在你自己的窑口板上；每个工位每轮只能用一次。
- [L155 · L212 · D7] You start with 1 space. Learning a Form & Decorate Tech adds the second space, which may be used later the same round. / 起初只有1个工位；习得坯作技艺即添设第二工位，新添设的工位本轮稍后就可以使用。
- [L142] "Up to 2" means 1 or 2, never 0. / “至多2”的意思是1或2，不能是0。
- [L333] Every Decoration costs 2 Coins; the Shifu's Form & Decorate action and Decorator's Kit each reduce one Decoration by 1 Coin. / 每种纹饰都是2铜钱；师傅的制坯饰纹行动与饰坯匣各令1项纹饰少付1铜钱。
- [L652] The Shifu's Decoration discount, Decorator's Kit and Ding's 1-Coin vessel are three separate reductions. The first two may apply to the same Decoration (a Carved for 0). Ding's vessel takes neither. / 师傅纹饰减免、饰坯匣、定窑1铜钱额外坯是三项各自独立的减免。前两项可以作用于同一项纹饰（刻花可降到0铜钱）；定窑的额外坯两项都不适用。
- [L646] Prepared Clay is a Tech effect and never counts as a Form & Decorate action. / 练泥是技艺效果，不算制坯饰纹行动。
- [L329] Vessel cards are not a hard gameplay limit. / 器型卡不是硬性上限。
- [L509] Shaped ceramics remain between rounds and keep all recorded attributes. / 坯跨轮保留，所记录的属性不变。

### glaze_load — Glaze & Load / 施釉装窑

- [L144] Personal locations are on your own board. Each personal space may be used once per round. / 坊内地点在你自己的窑口板上；每个工位每轮只能用一次。
- [L156 · L212 · D7] You start with 1 space. Learning a Glazing & Loading Tech adds the second space, which may be used later the same round. / 起初只有1个工位；习得釉作技艺即添设第二工位，新添设的工位本轮稍后就可以使用。
- [L142] "Up to 2" means 1 or 2, never 0. / “至多2”的意思是1或2，不能是0。
- [R5] A placement is legal if at least 1 of your Shaped vessels has a legal destination: an empty active Shared Kiln space not marked by another player's Setter's Mark; your own empty Imperial Kiln; or, for a Bowl, Plate or Brush Washer with Inverted Firing unused this round, an active space holding exactly 1 of your ceramics. / 可派工条件：你至少有1件坯拥有合法去处——空的启用窑位（非他人窑位签所占）、你空置的御窑，或（覆烧本轮未用时，碗／盘／笔洗）恰有1件你的器物的启用窑位。
- [L100] Active Shared Kiln spaces by player count: 4 players 8 (3 High, 3 Middle, 2 Low); 3 players 6 (2-2-2); 2 players 4 (2-1-1). / 启用窑位按人数：4人8个（高3、中3、低2）；3人6个（2-2-2）；2人4个（2-1-1）。
- [L289 · R11] A vessel loaded into the Imperial Kiln chooses the −1, 0 or +1 Imperial modifier. The modifier is public when chosen and is recorded on the ceramic. / 装入御窑时选定御窑修正−1、0或+1；选定即公开，并记录在该器物上。
- [L261] Only a ceramic in the Shared Kiln makes you a Contribution participant; an Imperial Kiln ceramic does not. / 只有共窑中的器物使你成为控火者；御窑器物不算。
- [R9] Placing the Shifu's Heat marker is optional. It may go on any of your ceramics in the Shared Kiln or your Imperial Kiln that has no marker, including one loaded earlier this round or by Imperial Priority. / 师傅暗置火标为可选；可放在你在共窑或御窑中任一未带火标的器物上，含本轮先前装入或经御烧优先装入者。
- [L268 · L269] After Base Heat is determined, in First Player order, each player with a face-down marker turns it to +1 or −1, or returns it. It stacks with Kiln Furniture and stays in place for a Second Firing recalculation. / 基础火候定后，按起始玩家顺序，各人将暗置的火标翻为+1或−1，或收回。火标与支烧窑具叠加，复烧重算时留在原处。
- [INT Heat-marker step] The +1 or −1 face is chosen in the Heat-marker step, in First Player order; nothing hidden is committed when the marker is placed. / 火标正负于翻火标步骤中按起始玩家顺序选定；暗置时不预定正负。
- [L293 · L646] Imperial Priority is a token effect, not a Glaze & Load action. / 御烧优先是令牌效果，不是施釉装窑行动。
- [P3] Provisional ruling: placement legality looks only at each vessel's current Shape, even if Reworking Table could change it. / 暂定裁定：能否派工只看各件坯当前的器型，即使改坯案可改其器型。

### commission_market — Commission Market / 瓷牙行

- [L151] Capacity is 2, 3 or 4 spaces in 2-, 3- or 4-player games. / 容量：2人2个、3人3个、4人4个工位。
- [L140] Capacities are absolute: no worker, including the Shifu, may be placed at a location whose spaces are all occupied. / 容量为绝对上限：工位全满时，任何工人（含师傅）都不能派往。
- [ED L714] The Shifu's top-3 selection is optional. / 师傅的看三取一为可选。
- [B1] Every reservation must take an available Order; a blind reservation needs a card in the deck after any reshuffle. If the Main Order deck and discard are both empty, leave display positions empty. A top-3 look sees as many cards as remain; the discard is reshuffled only when the deck is empty, never to complete a look. / 每次承接须取一张可得的委托；盲接须在（必要时洗混后）牌堆中有牌。主委托牌堆与弃牌堆皆空时，榜位留空。看三取一不足3张时看余数；弃牌堆只在牌堆用尽时洗混，不为凑足查看而洗混。
- [L511] If the Main Order deck is empty when a card is needed, shuffle its discard pile to form a new deck. / 需要翻牌而主委托牌堆已空时，将弃牌堆洗混成新牌堆。
- [B3] Top-3 looks are private to the acting player. The Main Order discard pile is face down; only its count is public. / 看三取一所见仅你可见；主委托弃牌堆面朝下，只公开张数。
- [L391] If a single turn takes more than one face-up Order, refill after the turn, not between the takes. / 一个回合内承接多张榜上委托时，回合结束后一并补榜，不在两次之间补。
- [INT Deferred refill] The display refills when the reserving player's turn ends, after any after-action Imperial Priority or Canal Barge. Canal Barge used after this action may complete an Order reserved by it. / 委托榜于承接者回合结束时补，在行动后的御烧优先或漕船之后；此行动之后使用漕船，可完成刚承接的委托。
- [P2] Provisional ruling: if more than two display positions are empty (only after the deck and discard both ran out), every refill compacts the display and fills all empty positions as cards allow. / 暂定裁定：若空榜位多于2个（仅在牌堆与弃牌堆皆曾用尽后），每次补榜先左移，再按余牌补满全部空位。
- [R12 · L653] Senior Apprentice gives 1 Apprentice here the Shifu's 2 reservations, the top-3 selection on 1 of them, and a resource after each. / 高徒可令1名学徒在此获得师傅的2次承接、其中1次可看三取一，以及每次承接后的1份资源。
- [L297] Face-up Main Orders cannot be completed; only Orders in your hand can be completed. / 榜上的委托不能完成，只能完成在手委托。

### guild_hall — Guild Hall / 陶工行

- [L152] Capacity is 2, 3 or 4 spaces in 2-, 3- or 4-player games. / 容量：2人2个、3人3个、4人4个工位。
- [L140] Capacities are absolute: no worker, including the Shifu, may be placed at a location whose spaces are all occupied. / 容量为绝对上限：工位全满时，任何工人（含师傅）都不能派往。
- [B2] The Shifu's inspection is private. The Shifu may inspect any discipline, including one already owned. You choose the order in which untaken inspected Techs go to the bottom, and that order stays private. Return them to the bottom first, then refill the display. / 师傅查看为私密；可查看任何门类，含你已拥有技艺的门类。未取的所看技艺按你自定的顺序（保密）置底；先置底，再补牌。
- [L513] If an Advanced Tech discipline cannot refill its display to 2, leave the display partially empty. / 某门类无法补至2张时，留空。
- [A1] Each Advanced Tech scores 1 VP immediately when you gain it. / 每习得1项技艺，立即得1分。
- [R4] Pay all costs in full and apply valid discounts before payment. Colour Samples' when-acquired reservation is mandatory whenever at least 1 Main Order can be looked at. / 须足额支付费用，减免在支付前计算。色样簿习得时的承接，只要至少能看1张主委托即为强制。

### canal_wharf — Canal Wharf / 漕运码头

- [L153] The Canal Wharf is uncapped at every player count. / 漕运码头在任何人数下都不限工位。
- [L143] You may not pass during the Work Phase. The Canal Wharf has no capacity limit or resource cost, so it is always a legal placement for an available worker. / 派工阶段不能跳过；漕运码头无容量、无费用，任何可派工人永远可派往此处。
- [L502] The supply of Coins is unlimited. / 铜钱的供应无限。

### magistrates_hall — Magistrate's Hall / 州衙

- [L154 · L100] It has 1 space in 2- and 3-player games and 2 spaces in 4-player games; in 2- and 3-player games the second space is covered. / 2人、3人局1个工位，4人局2个工位；2–3人局盖住第二工位。
- [L140] Capacities are absolute: no worker, including the Shifu, may be placed at a location whose spaces are all occupied. / 容量为绝对上限：工位全满时，任何工人（含师傅）都不能派往。
- [L142] You may place a worker only if you can perform at least 1 instance of the main action: pay the Coin cost while at Recognition 0, 1 or 2. / 须至少能执行1次主行动方可派工：声望为0、1或2，且付得起铜钱。
- [R12] Senior Apprentice never applies at the Magistrate's Hall. / 高徒不适用于州衙。
- [L427] Imperial Recognition may be advanced by Crown icons on completed Orders or by paying at the Magistrate's Hall. The Magistrate's Hall cannot advance you to Recognition 4. / 御府声望可经已完成委托上的御令或在州衙付费推进；州衙不能推进至4。
- [L440] Imperial Grant, Imperial Kiln, Imperial Priority token and Imperial Audience are each gained only once. / 御赐、御窑、御烧优先标与御前召见每项只得一次。

---

## Imperial Recognition milestones

### imperial_grant — Imperial Grant / 御赐

- [L427] Recognition is advanced by Crown icons on completed Orders or by paying at the Magistrate's Hall. / 声望经已完成委托上的御令或在州衙付费推进。
- [L232] Advancing at the Magistrate's Hall resolves the reward of the space you reach normally. / 在州衙推进声望，照常结算所到之格的奖励。
- [L416] Resolve 1 Crown at a time. Resolve every milestone crossed. / 御令逐个结算，所跨各格奖励皆结算。
- [L440] Each milestone reward is gained only once. / 每项声望奖励只得一次。

### imperial_gift — Imperial Gift / 赐御窑

- [L287 · L290] The Imperial Kiln holds 1 ceramic per firing. It does not occupy a Shared Kiln space. / 御窑每次烧成只容纳1件，不占共窑窑位。
- [L288] During a Glaze & Load action, 1 vessel loaded by that action may be placed in your empty Imperial Kiln instead of the Shared Kiln. Imperial Priority also loads it. No Tech effect loads it. / 施釉装窑行动中所装器物可有1件改放入你空置的御窑；御烧优先也可装入。技艺效果一律不能把器物装进御窑。
- [L289 · R11] Loading it chooses the −1, 0 or +1 Imperial modifier. The modifier is public when chosen and is recorded on the ceramic. / 装入时选定御窑修正−1、0或+1；选定即公开，并记录在该器物上。
- [L289] Its Actual Heat is the Kiln Die result + the Fire modifier + that modifier, plus any Heat marker, whatever the Contributions were. It still fires during the shared Firing Phase. / 其实际火候 = 窑骰点数 + 窑火修正 + 御窑修正 + 火标，不论控火如何；它仍在共同的烧窑阶段烧成。
- [L290] It counts as a ceramic in this firing for your Techs and abilities, but it does not make you a Contribution participant: only a ceramic in the Shared Kiln does. / 对你的技艺与窑口能力而言，它算作本次烧成中的器物；但不使你成为控火者，只有共窑中的器物才算。
- [INT No Contribution participants] If only Imperial Kiln ceramics are loaded, Contributions are skipped and Base Heat is the Kiln Die result; the Fire card is still revealed. / 若只有御窑器物入窑，则无人控火，基础火候即窑骰点数；仍翻窑火牌。
- [L647] Kiln Furniture, Inverted Firing and Setter's Mark affect the Shared Kiln only. / 支烧窑具、覆烧、窑位签只作用于共窑。
- [L291] After firing, its ceramic resolves Quality and moves to the owner's Finished Ceramics area normally. / 烧成后照常定品，移入成器区。
- [INT Before/after-action window] An Imperial Kiln gained during the before-or-after-action window is usable within it. / 在“工人行动之前或之后”时机中刚获得的御窑，即可于该时机使用。
- [L440] The Imperial Kiln is gained only once. / 御窑只得一次。

### imperial_priority — Imperial Priority / 御烧优先

- [R10 · R11] Imperial Priority is free. Loading through it chooses the −1, 0 or +1 Imperial modifier like any Imperial load, and the modifier is public. / 御烧优先免费；经其装窑同样选定御窑修正−1、0或+1，且公开。
- [L646] Imperial Priority is a token effect, not a worker action. It never counts as a Glaze & Load action and does not trigger effects that require that action. / 御烧优先是令牌效果，不是工人行动；不算施釉装窑行动，也不触发需要该行动的效果。
- [R9] A later Glaze & Load Shifu may place the Heat marker on a ceramic loaded by Imperial Priority. / 之后施釉装窑行动的师傅可将火标暗置于经御烧优先装入的器物上。
- [INT Before/after-action window] Canal Barge and Imperial Priority may share the window in an order you choose. A token gained during the window is usable within it. / 与漕船同在“工人行动之前或之后”时，二者先后由你自定；在此时机中刚获得的令牌即可使用。
- [INT Deferred refill] After a Commission Market action, the display refills after any after-action Imperial Priority. / 瓷牙行行动后，委托榜在行动后的御烧优先之后才补。
- [P1] Provisional ruling: Reworking Table may be used when Imperial Priority glazes and loads a vessel, using its once-per-round allowance. / 暂定裁定：御烧优先为坯施釉装窑时亦可用改坯案，并消耗其“每轮一次”。
- [L440] The Imperial Priority token is gained only once. / 御烧优先标只得一次。

### imperial_audience — Imperial Audience / 御前召见

- [L427] The Magistrate's Hall cannot advance you to Recognition 4; only Crowns reach it. / 州衙不能推进到声望4，只有御令可达。
- [L439] Resolve Crowns one at a time. A multi-Crown Order may cross several milestones, reach Recognition 4 and then score VP from any remaining Crowns on that same Order. / 御令逐个结算；一张多御令委托可连跨数格，到达声望4后，同一委托余下的御令即各计1分。
- [R13] Tribute Ware's bonus Crown also advances Recognition. / 贡瓷的额外御令同样推进御府声望。
- [L440] Imperial Audience is gained only once. / 御前召见只得一次。

### imperial_overflow — Crowns beyond Recognition 4 / 声望满后每个御令+1分

- [L438] After you are at Recognition 4, each additional Crown you gain scores 1 VP immediately. / 声望满4后，每获得1个御令，立即得1分。
- [L439] A multi-Crown Order may reach Recognition 4 and then score VP from any remaining Crowns on that same Order. / 一张多御令委托可先到达声望4，再以余下的御令计分。
- [R13] Tribute Ware's bonus Crown scores past Recognition 4, but it is not a printed Crown and does not count for tie-breaker 2. / 贡瓷的额外御令在声望满4后计1分，但不是印刷御令，不计入平局判定②。
- [L498] Tie-breaker 2 counts Crown icons printed across completed Orders, including those scored beyond Recognition 4. / 平局判定②计已完成委托上印有的御令总数，含声望满4后计分的御令。

---

## Orders

### orders.starting — Starting Orders / 起始委托

- [L521] Starting Orders never enter the Main Order deck and have no Crowns; if discarded from your hand during Cleanup, return them to the box. They are Orders for all rules and Kiln Tradition abilities. A player is never required to complete a Starting Order. / 起始委托永不进入主委托牌堆，不印御令；收工时弃置则放回盒中。在一切规则与窑口能力中皆算委托。玩家无须完成起始委托。
- [L297] Only Orders in your hand can be completed. / 只能完成在手委托。
- [INT Order Phase] The Order Phase is a single pass in First Player order. A player with nothing completable is skipped automatically. / 交货阶段按起始玩家顺序依次进行一遍，不再循环；无可完成委托者自动略过。
- [R6] An Order may also be completed through Canal Barge, which counts for every completion effect. / 亦可经漕船完成委托，在一切完成效果上皆算。
- [L419] A ceramic may satisfy only one completed Order. / 一件器物只能用于一张委托。
- [L279] Flawed ceramics cannot complete Orders. / 瑕品不能用于完成委托。
- [L470] When completing an Order, each of your Crackle ceramics may count as having any one Decoration for that Order's Decoration requirements. Its printed Decoration is unchanged. / 完成委托时，你的每件开片器都可以视为具有任意一种纹饰，以满足该委托的纹饰要求；它原本的纹饰不变。
- [L200 · L304] Starting Orders and reserved Main Orders both count toward your hand limit of 4 (5 with Colour Samples), checked only at Cleanup. / 起始委托与承接的主委托都计入委托上限4张（有色样簿则5张），只在收工时检查。
- [INT Cleanup in Round 5] In Round 5 the hand trim has no scoring effect and is skipped. / 第5轮收工不削减委托（对计分无影响）。
- [L507] Orders in hand are secret information. The number of Orders in each player's hand is public. / 手中委托保密，张数公开。
- [L510] Uncompleted Orders have no end-game penalty. / 未完成的委托终局不扣分。

### orders.main — Main Orders and Crown Orders / 主委托与御令委托

- [L297] Face-up Main Orders cannot be completed; they are reserved at the Commission Market during the Work Phase. / 榜上的委托不能完成，须于派工阶段在瓷牙行承接。
- [L403] A held Order can be completed during any later Order Phase, or with Canal Barge. / 在手委托可于此后任一交货阶段完成，或经漕船完成。
- [R6] Canal Barge completes an Order for every completion effect, including Ru, Guan, Tribute Ware and Crackle wildcards. / 经漕船完成在一切方面视为完成委托：触发汝窑、官窑与贡瓷，开片器亦可充作纹饰。
- [INT Order Phase] The Order Phase is a single pass in First Player order. A player with nothing completable is skipped automatically. / 交货阶段按起始玩家顺序依次进行一遍，不再循环；无可完成委托者自动略过。
- [L423] Requirements are independent unless a specific pairing is explicitly printed. / 各项要求彼此独立，除非卡面直接写明配对。
- [L419] A ceramic may satisfy only one completed Order. / 一件器物只能用于一张委托。
- [L279] Flawed ceramics cannot complete Orders. / 瑕品不能用于完成委托。
- [L470 · INT Ge Crackle] Each Crackle ceramic may count as having any one Decoration for that Order's Decoration requirements; its printed Decoration is unchanged. / 每件开片器可视为具有任意一种纹饰，以满足该委托的纹饰要求；它原本的纹饰不变。
- [L654] A Crackle ceramic cannot fill a Masterpiece requirement, including Painted Masterpiece Orders. / 开片器不能满足任何臻品要求（含画花臻品委托）。
- [L416] Resolve 1 Crown at a time. Each Crown advances Imperial Recognition by 1 until you reach Recognition 4; after that, each further Crown scores 1 VP immediately. Resolve every milestone crossed. / 御令逐个结算：每个御令推进声望1格，直至声望4；此后每个御令立即得1分。所跨各格奖励皆结算。
- [R13] Tribute Ware's bonus Crown is not a printed Crown: it does not trigger Guan and does not count for tie-breaker 2. / 贡瓷的额外御令不是印刷御令：不触发官窑，不计入平局判定②。
- [L498] Tie-breaker 2 counts Crown icons printed across completed Orders. / 平局判定②计已完成委托上印有的御令总数。
- [L128 · L130] At the start of Rounds 2–5, discard the 2 leftmost face-up Main Orders, slide the remaining 4 left and reveal 2 new Orders to restore the display to 6. / 第2–5轮开工时轮换委托榜：弃最左2张榜上主委托，余4张左移，翻2张新委托补至6张。
- [B1] If the deck and discard are both empty, only available cards can be reserved and display positions stay empty. The round-start rotation discards up to 2 and slides the rest. / 主委托牌堆与弃牌堆皆空时，只能承接现有之牌，榜位留空；开工轮换至多弃2张，余者左移。
- [B3] The Main Order discard pile is face down; only its count is public. Display Orders discarded at round start were already public. / 主委托弃牌堆面朝下，只公开张数；开工时弃置的榜上委托本已公开。
- [L200 · L304] Starting Orders and reserved Main Orders both count toward your hand limit of 4 (5 with Colour Samples), checked only at Cleanup. Discarded Main Orders go to the Main Order discard pile. / 起始委托与承接的主委托都计入委托上限4张（有色样簿则5张），只在收工时检查；弃置的主委托进入主委托弃牌堆。
- [INT Cleanup in Round 5] In Round 5 the hand trim has no scoring effect and is skipped. / 第5轮收工不削减委托（对计分无影响）。
- [L507] Orders in hand are secret information. The number of Orders in each player's hand is public. / 手中委托保密，张数公开。
- [L510] Uncompleted Orders have no end-game penalty. / 未完成的委托终局不扣分。

---

## Review notes

Verifier findings were applied, except for the following:

- T17 exception clause (finding "T17-L71-missing-exception"): resolved another way. Under D10, the T17 item now covers Prepared Clay only, so the Canal Barge exception does not belong on this panel. T23 already carries "Canal Barge triggers Ru and Guan".
- Glossary follow-ups in §2.11, §3 and §4.4 (单轮, 高徒 full text, second reservation) are not applied here. This workflow may edit only this file, so they are left for the glossary owner.
