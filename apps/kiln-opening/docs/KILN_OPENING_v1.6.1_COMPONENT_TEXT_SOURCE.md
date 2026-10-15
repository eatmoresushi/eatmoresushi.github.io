# KILN OPENING 开窑 v1.6.1 — Component Text

Short text printed on Kiln Player Boards and Advanced Tech tiles. It follows the format of the [V1.4 component text](./KILN_OPENING_v1.4_COMPONENT_TEXT_SOURCE.md) at the owner's request (2026-10-15): **timing:** cost → effect.

This text is a reminder. The [V1.6.1 rulebook](./KILN_OPENING_v1.6.1_EN_SOURCE.md) and its [rulings](./RULEBOOK_AUDIT_V1.6.1.md) give the full effects, and the UI keeps the full text in each card's details. Every ability is optional unless it says otherwise (R4).

**Format rules**

- The timing clause comes first and ends with a colon. The UI bolds it.
- "→" separates a cost or condition from its effect.
- Chinese follows the [glossary](./GLOSSARY_ZH_V1.6.1.md) register and punctuation.
- The data files store this text as `shortText` / `shortTextZh`.

## Workshop Techs (坯作)

### Large Throwing Wheel / 大陶车 (T01)
- EN: Once per round, during a Form & Decorate action forming at least 1 Vase or Censer: reduce that action's total Clay cost by 2, minimum 0.
- ZH: 每轮一次，制坯饰纹行动含至少1件瓶或香炉时：该行动泥总费−2，最低为0。

### Decorator's Kit / 饰坯匣 (T16)
- EN: Once per round: 1 Carved, Impressed or Painted Decoration you apply costs 1 Coin less. Stacks with the Shifu discount.
- ZH: 每轮一次：你施加的1项刻花、印花或画花少付1铜钱；可与师傅纹饰减免叠加。

### Reworking Table / 改坯案 (T05)
- EN: Once per round, when you glaze and load a Shaped vessel: first change its Shape to any other Shape. Pay no Clay; its Decoration stays.
- ZH: 每轮一次，为1件坯施釉入窑时：可先将其器型改为任意其他器型；不付泥，纹饰不变。

### Prepared Clay / 练泥 (T17)
- EN: Once per round, after gaining resources at the Materials Yard: pay a vessel's Clay cost + 1 Clay and a Decoration cost → form and decorate 1 vessel.
- ZH: 每轮一次，泥柴场行动得料后：可付器型泥费+1泥与纹饰费→制1件坯并饰纹。

### Senior Apprentice / 高徒 (T18)
- EN: Once per round: 1 Apprentice you place at the Materials Yard or Commission Market uses the Shifu effect instead.
- ZH: 每轮一次：你派往泥柴场或瓷牙行的1名学徒可改按师傅效果结算。

### Connoisseur's Cabinet / 清玩斋 (T19)
- EN: Game end: each Fine or Masterpiece ceramic in your Exhibition scores +1 VP, maximum +5 VP.
- ZH: 终局时：你陈列中每件上品或臻品+1分，至多+5分。

## Glazing & Loading Techs (釉作)

### Colour Samples / 色样簿 (T10)
- EN: When acquired: privately look at the top 3 cards of the Main Order deck → you must reserve 1; discard the rest. Ongoing: your Order hand limit is 5.
- ZH: 习得时：私看主委托牌堆顶3张→须承接1张，其余弃置。持续：你的委托上限为5张。

### Kiln Tending / 看火 (T20)
- EN: Once per round, after a Glaze & Load action that loaded at least 1 ceramic: gain 1 Clay + 1 Wood.
- ZH: 每轮一次，至少装窑1件的施釉装窑行动后：得1泥1柴。

### Kiln Furniture / 支烧窑具 (T15)
- EN: Once per round, when you load 1 ceramic into the Shared Kiln: place this tile beneath it → choose its zone modifier for this firing: −1, 0 or +1.
- ZH: 每轮一次，将1件器物装入共窑时：可将本牌垫于其下→本次烧成中该件温区修正由你定为−1、0或+1。

### Inverted Firing / 覆烧 (T21)
- EN: Once per round, when you load a Bowl, Plate or Brush Washer into the Shared Kiln: you may place it in a space holding exactly 1 of your ceramics. Both use that space's modifier.
- ZH: 每轮一次，将1件碗、盘或笔洗装入共窑时：可放入恰有1件己方器物的启用窑位，两件同用该窑位修正。

### Setter's Mark / 窑位签 (T22)
- EN: Once per round, at the start of the Work Phase: place this tile on an empty active Shared Kiln space → only you may load there this round.
- ZH: 每轮一次，派工阶段开始时：可将本牌置于共窑1个空的启用窑位上→本轮仅你可在此装窑。

### Canal Barge / 漕船 (T23)
- EN: Once per round, before or after one of your worker actions: complete 1 held Order.
- ZH: 每轮一次，你的工人行动之前或之后：可完成1张在手委托。

## Firing Techs (火作)

### Protective Saggars / 匣钵护烧 (T11)
- EN: Once per round, after Quality is assigned: pay 1 Wood → improve 1 of your ceramics from this firing: Flawed → Standard or Standard → Fine.
- ZH: 每轮一次，定品后：可付1柴→己方本窑1件瑕品升良品，或良品升上品。

### Fuel Ledger / 柴簿 (T12)
- EN: When you choose Bank or Stoke: secretly commit 1 extra Wood with it → Bank becomes −2, Stoke becomes +2.
- ZH: 选控火时：若选压火或添柴，可随控火牌暗附1柴→控火修正改为压火−2或添柴+2。

### Test Pieces / 火照 (T13)
- EN: Once per round, after Base Heat, before Heat markers, if you have a ceramic in this firing: pay 1 Wood → privately look at the top Fire card; you may put it on the bottom of the deck.
- ZH: 每轮一次，基础火候定后、翻火标前，若本窑有己方器物：可付1柴→私看窑火牌堆顶1张，可置于牌堆底。

### Second Firing / 复烧 (T14)
- EN: Once per round, after Quality is assigned: choose 1 of your Flawed or Standard ceramics from this firing → reveal 1 extra Fire card; recalculate its Actual Heat and Quality with that card instead of the first (Jun's earlier adjustment is lost). The new Quality stands, even if worse.
- ZH: 每轮一次，定品后：可选己方本窑1件瑕品／良品→另翻1张窑火牌代原牌重算，不计钧窑调整；更差亦算。

### Kiln Master / 窑工 (T24)
- EN: Once per round, in the Heat marker step: place the Kiln Master marker (+1 or −1) on 1 of your ceramics in this firing that has no Heat marker.
- ZH: 每轮一次，火标步骤中：可将窑工标（+1或−1）放在己方本窑1件未带火标的器物上。

### Tribute Ware / 贡瓷 (T25)
- EN: Once per round, when you complete a Crown Order: gain 1 additional Crown.
- ZH: 每轮一次，完成御令委托时：额外得1个御令。

## Kiln Player Boards

### Ru Kiln / 汝窑 — Quiet Perfection / 天青无瑕 (RU)
- EN: Once per round, when you complete an Order using a Plain Celadon Masterpiece: gain 4 VP.
- ZH: 每轮一次，以臻品青釉素面器完成委托时：得4分。

### Guan Kiln / 官窑 — Imperial Patronage / 内府恩眷 (GU)
- EN: Once per round, when you complete a Crown Order: gain 2 Coins + 1 VP.
- ZH: 每轮一次，完成御令委托时：得2铜钱1分。

### Ge Kiln / 哥窑 — Crackle Mastery / 金丝铁线 (GE)
- EN: Once per round, after Quality is assigned: 1 of your Standard ceramics from this firing → Fine + Crackle. Orders: each Crackle ceramic may count as any 1 Decoration; it is never a Masterpiece.
- ZH: 每轮一次，定品后：可令己方本窑1件良品开片升上品。完成委托时：开片器可作任意1种纹饰；永非臻品。

### Ding Kiln / 定窑 — Moulded Production / 范制成器 (DI)
- EN: Once per round, during a Form & Decorate action: after forming a Bowl, Plate or Brush Washer, pay 1 Clay + 1 Coin → form 1 extra vessel of the same Shape with any Decoration (no discounts). It counts as formed by that action.
- ZH: 每轮一次，制坯饰纹行动中制碗、盘或笔洗后：可付1泥1铜钱→该行动多制1件同型坯，任选纹饰无减免。

### Jun Kiln / 钧窑 — Kiln Transformation / 窑变天成 (JU)
- EN: Once per round, after Actual Heat is calculated, before Quality: pay 1 Wood → adjust 1 of your ceramics' Actual Heat by +1 or −1.
- ZH: 每轮一次，实际火候算出后、定品前：可付1柴→己方1件器物的实际火候+1或−1。

## Review notes

Reconciliation of two reviews (2026-10-15). All 18 findings were applied; none were rejected. Where the wording differs from a suggestion:

- T14 (EN/ZH): EN says the extra card is used "instead of the first". ZH uses 代原牌重算, 不计钧窑调整 and 更差亦算 to stay within 48 characters (2 × 24).
- DI (ZH): written as 该行动多制1件同型坯，任选纹饰无减免 (48 characters). This keeps the EN points: any Decoration for the 1 Coin, no discounts, and counts as formed by that action.
- T12 (EN): "commit 1 extra Wood with it" follows the rulebook's "commit … with your Contribution card".
- T10 (EN): adds "privately" to match ZH 私看 and ruling B3.
- RU/GU (ZH): changed to the trigger form …完成委托时： to match the EN fix and Tribute Ware. These are pure gains, so they take no 可 (glossary §1.1).
- T22 (EN, not raised in review): adds "active" to match ZH 启用窑位 and Appendix B.
