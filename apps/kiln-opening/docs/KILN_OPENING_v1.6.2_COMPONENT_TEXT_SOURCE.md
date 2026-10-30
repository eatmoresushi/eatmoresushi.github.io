# KILN OPENING 开窑 v1.6.2 — Component Text

Short text printed on Kiln Player Boards, Advanced Tech tiles and the 2 Fuel Ledger Contribution cards, in the repository's format: one section per component, keyed by its stable data ID, with an `- EN:` and a `- ZH:` line. The owner's master copy is [KILN_OPENING_v1.6.2_COMPONENT_TEXT.md](./KILN_OPENING_v1.6.2_COMPONENT_TEXT.md) (byte-identical to the owner's original; the audit records its checksum). This file carries the same 25 lines word for word, with the owner's bold markup removed, as the data stores them (`data/techniques.json`, `data/kilns.json`, and `data/firing.json` for the 2 cards). It replaces the [V1.6.1 component text](./KILN_OPENING_v1.6.1_COMPONENT_TEXT_SOURCE.md), which stays as history.

The owner's file also defines the keyword **Select N** in its introduction (look at the top N cards of the Main Order deck, reserve 1 of them or 1 face-up Main Order from the display; the rest are discarded; 精选N). It names no component, so it has no section here; the data carries the rulebook's definition (L80, owner ruling R25) as a clarification of Colour Samples and the Commission Market.

This text is a reminder. The [V1.6.2 rulebook](./KILN_OPENING_v1.6.2_EN_SOURCE.md) and its [rulings](./RULEBOOK_AUDIT_V1.6.2.md) give the full effects, and the UI keeps the full text in each card's details. Every ability is optional unless it says otherwise (R4).

**Format rules**

- The timing clause comes first and ends with a colon. The UI bolds it.
- The owner's file also bolds these later clauses, and the UI bolds them too (`SHORT_TEXT_SECONDARY_LABELS` in `src/game/content.ts`): "Ongoing:" / 持续：, "Orders:" / 完成委托时：, "Once per round, before or after one of your worker actions:" / 每轮一次，你的一次工人行动之前或之后：, "Once per round, after Quality is assigned:" / 每轮一次，定品后：, and "When acquired:" / 习得时： (Fuel Ledger's second clause).
- "→" separates a cost or condition from its effect.
- Chinese follows the [glossary](./GLOSSARY_ZH_V1.6.1.md) register and punctuation. A Chinese line is at most 96 characters (owner ruling R18).
- The data files store this text as `shortText` / `shortTextZh`; the plain Bank, Tend and Stoke cards have none (their effects are the rulebook table, v1.6.2 L285–287).

## Form & Decorate Techs (坯作)

### Large Throwing Wheel / 大陶车 (T01)
- EN: Once per round, during a Form & Decorate action forming at least 1 Vase or Censer: reduce that action's total Clay cost by 2, minimum 0.
- ZH: 每轮一次，制坯饰纹行动中制有至少1件瓶或香炉时：该行动的泥总费−2，最低为0。

### Decorator's Kit / 饰坯匣 (T16)
- EN: Once per round: a vessel you form costs 1 Coin less. Stacks with the Shifu discount.
- ZH: 每轮一次：你制的1件坯少付1铜钱。可与师傅的减免叠加。

### Reworking Table / 改坯案 (T05)
- EN: Once per round, when you glaze and load a Shaped vessel: first change its Shape to any other Shape. Pay no Clay; its Decoration stays.
- ZH: 每轮一次，为1件坯施釉装窑时：可先将其器型改为任意其他器型。不付泥，纹饰不变。

### Prepared Clay / 练泥 (T17)
- EN: Once per round, after gaining resources at the Materials Yard: pay a vessel's Clay cost + 1 Clay and 2 Coins → form 1 vessel, any Decoration.
- ZH: 每轮一次，泥柴场行动得到资源后：可付器型泥费+1泥及2铜钱→制1件坯，纹饰任选。

### Senior Apprentice / 高徒 (T18)
- EN: Once per round: 1 Apprentice you place at the Materials Yard or Commission Market uses the Shifu effect instead.
- ZH: 每轮一次：你派往泥柴场或瓷牙行的1名学徒可改按师傅效果结算。

### Connoisseur's Cabinet / 清玩斋 (T19)
- EN: Game end: each Fine or Masterpiece ceramic in your Exhibition scores +1 VP, maximum +5 VP.
- ZH: 终局时：你陈列中的每件上品或臻品+1分，至多+5分。

## Glazing & Loading Techs (釉作)

### Colour Samples / 色样簿 (T10)
- EN: When acquired: Select 3. Ongoing: your Order hand limit is 5. Once per round, before or after one of your worker actions: discard 1 held Order → Select 3.
- ZH: 习得时：精选3。持续：你的委托上限为5张。每轮一次，你的一次工人行动之前或之后：可弃1张在手委托→精选3。

### Kiln Tending / 看火 (T20)
- EN: Once per round, after a Glaze & Load action that loaded at least 1 ceramic: gain 1 Clay + 1 Wood.
- ZH: 每轮一次，至少装窑1件的施釉装窑行动之后：得1泥1柴。

### Kiln Furniture / 支烧窑具 (T15)
- EN: Once per round, when you load 1 ceramic into the Shared Kiln: place this tile beneath it → choose its zone modifier for this firing: −1, 0 or +1.
- ZH: 每轮一次，将1件器物装入共窑时：可将本牌垫于其下→本次烧成中，该器物的温区修正由你定为−1、0或+1。

### Inverted Firing / 覆烧 (T21)
- EN: Once per round, when you load a Bowl, Plate or Brush Washer into the Shared Kiln: you may place it in a space holding exactly 1 of your ceramics. Both use that space's modifier.
- ZH: 每轮一次，将1件碗、盘或笔洗装入共窑时：可放入恰有1件己方器物的启用窑位；两件同用该窑位的修正。

### Setter's Mark / 窑位签 (T22)
- EN: Once per round, at the start of the Work Phase: place this tile on an empty active Shared Kiln space → only you may load there this round.
- ZH: 每轮一次，派工阶段开始时：可将本牌置于共窑1个空的启用窑位→本轮只有你能在此装窑。

### Canal Barge / 漕船 (T23)
- EN: Once per round, when you complete an Order: gain 2 Coins.
- ZH: 每轮一次，完成委托时：得2铜钱。

## Firing Techs (火作)

### Protective Saggars / 匣钵护烧 (T11)
- EN: Always: your ceramics are never Flawed; a Heat Difference of 3 or more counts as Standard. Once per round, after Quality is assigned: 1 of your Standard ceramics from this firing → Fine.
- ZH: 持续：你的器物永不为瑕品，火候差3或以上算作良品。每轮一次，定品后：己方本窑1件良品→上品。

### Fuel Ledger / 柴簿 (T12)
- EN: Always: your Bank and Stoke cost no Wood. When acquired: Gain the Fuel Ledger Bank and Fuel Ledger Stoke Contribution cards (pay 1 Wood → −2/+2).
- ZH: 持续：你的压火与添柴不付柴。习得时：获取柴簿压火与柴簿添柴两张控火牌（付1柴→−2或+2）。

### Test Pieces / 火照 (T13)
- EN: Once per round, after Base Heat, before the Fire card, if you have a ceramic in this firing: pay 1 Wood → privately look at the top Fire card; you may put it on the bottom of the deck.
- ZH: 每轮一次，基础火候定后、翻窑火前，本窑有己方器物时：可付1柴→私看窑火牌堆顶1张，可将其置于牌堆底。

### Second Firing / 复烧 (T14)
- EN: Once per round, after Quality is assigned: 1 of your Flawed or Standard ceramics from this firing → reveal 2 Fire cards and recalculate its Quality with 1 of them, even if worse.
- ZH: 每轮一次，定品后：己方本窑1件瑕品或良品→另翻2张窑火牌，以其中1张重算其品质，即使更差也算。

### Kiln Master / 窑工 (T24)
- EN: Once per round, when you load a ceramic: you may place a +1 or −1 marker on it. It adds its value to that ceramic's Actual Heat.
- ZH: 每轮一次，装窑1件器物时：可在它上面放一个+1或−1标记。其数值计入该器物的实际火候。

### Tribute Ware / 贡瓷 (T25)
- EN: Once per round, when you complete a Crown Order: gain 1 additional Crown.
- ZH: 每轮一次，完成御令委托时：额外得1个御令。

## Fuel Ledger Contribution Cards (柴簿控火牌)

### Fuel Ledger Bank / 柴簿压火 (FUEL_LEDGER_BANK)
- EN: 1 Wood: −2.
- ZH: 1柴：−2。

### Fuel Ledger Stoke / 柴簿添柴 (FUEL_LEDGER_STOKE)
- EN: 1 Wood: +2.
- ZH: 1柴：+2。

## Kiln Player Boards (窑口板)

### Ru Kiln / 汝窑 — Quiet Perfection / 天青无瑕 (RU)
- EN: Once per round, when you complete an Order using a Plain Celadon Masterpiece: gain 4 VP.
- ZH: 每轮一次，以素面青釉臻品完成委托时：得4分。

### Guan Kiln / 官窑 — Imperial Patronage / 内府恩眷 (GU)
- EN: Once per round, when you complete a Crown Order: gain 2 Coins + 1 VP.
- ZH: 每轮一次，完成御令委托时：得2铜钱和1分。

### Ge Kiln / 哥窑 — Crackle Mastery / 金丝铁线 (GE)
- EN: Once per round, after Quality is assigned: choose 1 of your ceramics from this firing → it develops Crackle; if it is Standard, it becomes Fine. Orders: each Crackle ceramic may count as any 1 Decoration and scores 1 VP when delivered.
- ZH: 每轮一次，定品后：选择己方本窑1件器物→它开片；若它是良品，则升为上品。完成委托时：每件开片器可作任意1种纹饰，交付时得1分。

### Ding Kiln / 定窑 — Moulded Production / 范制成器 (DI)
- EN: Once per round, during a Form & Decorate action: after forming a Bowl, Plate or Brush Washer, pay 1 Clay + 2 Coins → form 1 extra vessel of the same Shape with any Decoration. It does not count against the action's vessel limit. It counts as formed by that action.
- ZH: 每轮一次，制坯饰纹行动中制成碗、盘或笔洗后：可付1泥2铜钱→多制1件同器型的坯，纹饰任选，不计入该行动的制坯件数上限。算作该行动所制。

### Jun Kiln / 钧窑 — Kiln Transformation / 窑变天成 (JU)
- EN: Once per round, after Actual Heat is calculated, before Quality: pay 1 Wood → adjust 1 of your ceramics' Actual Heat by +1 or −1.
- ZH: 每轮一次，实际火候算出后、定品前：可付1柴→己方1件器物的实际火候+1或−1。

## Review notes

V1.6.2 (2026-10-17, with owner revision 2 of the same day). The owner rewrote 5 of the 23 components with their V1.6.2 mechanics: Colour Samples (the rest go to the bottom of the deck; the once-per-round swap), Canal Barge (2 Coins when you complete an Order), Protective Saggars (never Flawed; Standard → Fine), Fuel Ledger (free Bank and Stoke) and Second Firing (2 extra Fire cards, choose 1). The other 18 lines are unchanged from V1.6.1. The owner's file drops the IDs and the "- EN:" / "- ZH:" prefixes and bolds every timing clause; this file restores the repository format and leaves the bold to the UI. The Chinese Colour Samples line is 82 characters, over the earlier cap of 72; the owner keeps it in full and the cap is 96 (R18).

Owner revision 3 (2026-10-18, changes 25–27). The owner rewrote Colour Samples (the keyword Select N: Select 3 when acquired and for the swap), Fuel Ledger (its 2 Contribution cards, "When acquired:" now bold as its second clause) and Second Firing (shorter wording, the same effect), and added the 2 Fuel Ledger Contribution cards, so this file now has 25 components. The English Fuel Ledger line is kept verbatim, including "cards(-1 Wood → -2/+2)" with no space before the parenthesis and hyphen-minus signs; the Chinese line keeps its "—1柴". The rules text (v1.6.2 L289, L644) prints the cards as 1 Wood, −2 and 1 Wood, +2; the audit notes the difference for the owner.

Owner revision 4 (2026-10-22/23, changes 28–35) and owner ruling R25 (2026-10-23). The owner rewrote 5 components: Decorator's Kit (a vessel you form with a Carved, Impressed or Painted Decoration costs 1 Coin less, change 30), Prepared Clay (its Clay cost + 1 Clay and 2 Coins, any Decoration, change 30), Test Pieces (after Base Heat, before the Fire card, changes 28 and 31), Kiln Master (a +1 or −1 marker when you load a ceramic, change 31) and Ge (a Fine or Standard ceramic; each delivered Crackle ceramic scores 1 VP, change 29). R25 changed the keyword line of the introduction (lines 3 and 5): the rest of a Select are discarded / 其余弃置. The other 20 lines are unchanged, Fuel Ledger's included (its cost of 4 is printed on the tile, not in its text). The secondary bold labels the UI emphasises (`SHORT_TEXT_SECONDARY_LABELS`) are unchanged.

Owner revision 5 (2026-10-28, changes 36–42). The owner rewrote 3 components: Decorator's Kit (any vessel you form costs 1 Coin less, change 37), Ge (any 1 of your ceramics from this firing develops Crackle; a Standard one becomes Fine, change 39) and Ding (1 Clay + 2 Coins; it does not count against the action's vessel limit, change 40). The owner's file keeps its numbering (lines 15/17, 128/130, 133/135 changed). The other 22 lines are unchanged; the four new prices (Canal Barge 3, Prepared Clay 4, Colour Samples 3, Protective Saggars 2, change 38) are printed on the tiles, not in their text. The secondary bold labels the UI emphasises (`SHORT_TEXT_SECONDARY_LABELS`) are unchanged.
