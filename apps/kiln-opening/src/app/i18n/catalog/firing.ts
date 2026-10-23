import { defineNamespace } from "../defineNamespace.ts";

/**
 * `firing` namespace: firing decision forms. Owned by B5 (UI_V1.6.1_ARCHITECTURE §4.2).
 *
 * Wireframe sources: `decContrib`, `decAfterQuality`, `submitRow`, `queueRow`, `decWait`, and the
 * windows the wireframe did not design (Test Pieces, Jun, Second Firing's choice), in the same
 * pattern. Revision 4 has no Heat-marker step and no salvage step (changes 28, 30, 31); selling a
 * Flawed ceramic is `common.sale.*`. Every rule number is a placeholder (§5 gap 19); Tech and Kiln names and their
 * card text come from data through `i18n/content.ts`. Owner decisions D3/D4: these strings state
 * rule effects only — no Quality previews, odds or Fire-deck counts.
 */
export const firing = defineNamespace({
  en: {
    // Window titles (pane heading and phone sheet strip).
    "title.contributions": "Choose your Contribution",
    "title.testPiecesDecide": "Use {tech}?",
    "title.testPiecesBury": "{tech}: the card you saw",
    "title.jun": "{kiln} · {ability}",
    "title.afterQuality": "After-Quality abilities",
    "title.secondFiring": "{tech}: choose a Fire card",

    // Shared pieces.
    "step": "Firing step {n}",
    "stepAndOrder": "Firing step {n}, in First Player order",
    "queue": "Queue",
    "queueNow": "deciding",
    "queueDone": "done",
    "queueNext": "next",
    "queueEntry": "{name}: {status}",
    "who": "Who has chosen",
    "statusChosen": "chosen",
    "statusChoosing": "choosing…",
    "youHaveWood": "You have {wood}.",
    "cost": "Cost: {cost}",
    "ability": "Ability",
    "yourCeramics": "Your ceramics in this firing",
    "ceramic": "Ceramic",

    // Step 1: Contributions (secret, simultaneous).
    "contrib.lead": "Everyone with a ceramic in the Shared Kiln chooses in secret at the same time. All cards are revealed together once everyone has chosen; Wood is paid then.",
    "contrib.card": "Contribution card",
    "contrib.heat": "Heat {heat}",
    "contrib.heatFromTech": "Heat {heat} · came with {tech}",
    "contrib.techCards": "{cards} came with {tech}. Wood is paid at the reveal.",
    "contrib.techCardsFree": "{cards} came with {tech}. With it, your {free} cost no Wood. Wood is paid at the reveal.",
    "contrib.woodAtReveal": "{wood} at reveal",
    "contrib.noWood": "no Wood",
    "contrib.cantAfford": "Not enough Wood",
    "contrib.noWoodTech": "no Wood: {tech}",
    "contrib.baseRule": "Base Heat = Kiln Die {die} + all Contributions, kept within {range}.",
    "contrib.othersSee": "Others see only that you have chosen; your card stays hidden until everyone has chosen.",
    "contrib.summary": "Submit <b>{card}</b> in secret: Heat {heat}, {wood}",
    "contrib.pick": "Choose a Contribution card.",
    "sealed": "Your sealed Contribution: <b>{card}</b>",
    "sealedNote": "All cards are revealed together once everyone has chosen.",

    // Test Pieces, at the end of step 1 (after Base Heat, before the Fire card).
    "tp.peek": "Pay {wood} and look at the top Fire card",
    "tp.peekNote": "Only you see the card. You then decide whether to put it on the bottom of the Fire deck.",
    "tp.youSaw": "The card you saw",
    "tp.bury": "Put it on the bottom of the Fire deck",
    "tp.keep": "Leave it on top",
    "tp.othersSee": "Others see whether you put it on the bottom, never the card.",
    "tp.sumDecline": "Do not use {tech}",
    "tp.sumBury": "Put the card you saw on the bottom of the Fire deck",
    "tp.sumKeep": "Leave the card you saw on top of the Fire deck",
    "tp.pick": "Choose one.",


    // Step 3 (and an unused Jun in Second Firing, rev. 4 L627): Jun.
    "jun.adjust": "Adjustment",
    "jun.adjustDesc": "Added to that ceramic’s Actual Heat before its Quality is assigned.",
    "jun.declineNote": "If you decline, {ability} stays unused this round.",
    "jun.none": "None of your ceramics can be adjusted now.",
    "jun.sum": "Pay {wood}: <b>{value}</b> to the Actual Heat of <b>{ceramic}</b>",
    "jun.sumDecline": "Do not use {ability}",
    "jun.pick": "Choose a ceramic and an adjustment, or decline.",

    // Step 5: after-Quality abilities.
    "aq.lead": "Use them in any order you like; the options are checked again after each use.",
    "aq.done": "Done — decline the rest",
    "aq.sumSaggars": "Use <b>{ability}</b>: <b>{ceramic}</b> becomes {quality}",
    "aq.sumSecond": "Use <b>{ability}</b> on <b>{ceramic}</b>: turn {n} extra Fire cards face up, then choose one",
    "aq.sumGe": "Use <b>{ability}</b>: <b>{ceramic}</b> gains a Crackle marker and is {quality}",
    "aq.saggarsFloor": "{tech}: counts as {standard}, not {flawed}",
    "aq.sumEnd": "Finish your after-Quality turn; decline the rest",
    "aq.pick": "Pick an ability, or finish.",

    // Step 5: Second Firing's choice (rev. 4 L627).
    "sf.lead": "{tech} turned {n} extra Fire cards face up, for everyone to see. Choose the one your ceramic is fired with again.",
    "sf.rule": "The {n} cards then go to the Fire discard, face up.",
    "sf.cards": "Choose a Fire card",
    "sf.cardsRule": "The new Quality replaces the old one, even if it is worse.",
    "sf.card": "Card {n}: {value}",
    "sf.jun": "{ability} (optional)",
    "sf.junDesc": "On this ceramic, after the recalculation and before its new Quality.",
    "sf.junNone": "Do not use",
    "sf.junUnavailable": "Not available now.",
    "sf.pick": "Choose one of the Fire cards.",
    "sf.sum": "Fire <b>{ceramic}</b> again with Fire card <b>{value}</b>",
    "sf.sumJun": "Fire <b>{ceramic}</b> again with Fire card <b>{value}</b>, then {ability} <b>{delta}</b> for {wood}",


    // Waiting.
    "wait.lead": "You can browse the table while you wait.",
    "wait.looking": { one: "{name} is looking at {n} card in private", other: "{name} is looking at {n} cards in private" },
  },
  zh: {
    "title.contributions": "暗选控火",
    "title.testPiecesDecide": "是否使用「{tech}」？",
    "title.testPiecesBury": "「{tech}」：你看到的牌",
    "title.jun": "{kiln}·{ability}",
    "title.afterQuality": "定品后结算",
    "title.secondFiring": "「{tech}」：选一张窑火牌",

    "step": "烧窑步骤{n}",
    "stepAndOrder": "烧窑步骤{n}，按起始玩家顺序",
    "queue": "顺序",
    "queueNow": "决断中",
    "queueDone": "已定",
    "queueNext": "待定",
    "queueEntry": "{name}：{status}",
    "who": "选定情况",
    "statusChosen": "已选",
    "statusChoosing": "选择中……",
    "youHaveWood": "你有{wood}。",
    "cost": "费用：{cost}",
    "ability": "能力",
    "yourCeramics": "你本窑的器物",
    "ceramic": "器物",

    "contrib.lead": "共窑中有器物的玩家同时暗选。全员选定后一齐亮牌，并在这时付柴。",
    "contrib.card": "控火牌",
    "contrib.heat": "火候{heat}",
    "contrib.heatFromTech": "火候{heat} · 随「{tech}」获得",
    "contrib.techCards": "{cards}随「{tech}」获得。柴在亮牌时支付。",
    "contrib.techCardsFree": "{cards}随「{tech}」获得。有了它，你的{free}不付柴。柴在亮牌时支付。",
    "contrib.woodAtReveal": "亮牌时付{wood}",
    "contrib.noWood": "不付柴",
    "contrib.cantAfford": "柴不足",
    "contrib.noWoodTech": "不付柴（「{tech}」）",
    "contrib.baseRule": "基础火候 = 窑骰{die} + 全部控火，限定在{range}。",
    "contrib.othersSee": "其他玩家只看到你已选定；全员选定前牌面保密。",
    "contrib.summary": "暗选<b>{card}</b>：火候{heat}，{wood}",
    "contrib.pick": "请选择控火牌。",
    "sealed": "你暗选的控火：<b>{card}</b>",
    "sealedNote": "全员选定后一齐亮牌。",

    "tp.peek": "付{wood}，私看窑火牌堆顶的牌",
    "tp.peekNote": "只有你看到此牌。看后再决定是否把它放到窑火牌堆底。",
    "tp.youSaw": "你看到的牌",
    "tp.bury": "放到窑火牌堆底",
    "tp.keep": "留在堆顶",
    "tp.othersSee": "其他玩家只看到你是否把它置底，看不到牌面。",
    "tp.sumDecline": "不使用「{tech}」",
    "tp.sumBury": "把你看到的牌放到窑火牌堆底",
    "tp.sumKeep": "把你看到的牌留在窑火牌堆顶",
    "tp.pick": "请选择一项。",


    "jun.adjust": "调整",
    "jun.adjustDesc": "在定品前计入这件器物的实际火候。",
    "jun.declineNote": "不使用时，「{ability}」本轮仍算未用。",
    "jun.none": "现在没有可以调整的器物。",
    "jun.sum": "付{wood}：<b>{ceramic}</b>的实际火候<b>{value}</b>",
    "jun.sumDecline": "不使用「{ability}」",
    "jun.pick": "请选择器物与调整，或不使用。",

    "aq.lead": "顺序由你决定；每次使用后重新核验可用选项。",
    "aq.done": "完成——其余不使用",
    "aq.sumSaggars": "使用「{ability}」：<b>{ceramic}</b>升为{quality}",
    "aq.sumSecond": "对<b>{ceramic}</b>使用「{ability}」：额外翻开{n}张窑火牌，再从中选一张",
    "aq.sumGe": "使用「{ability}」：<b>{ceramic}</b>开片，品质为{quality}",
    "aq.saggarsFloor": "「{tech}」：算作{standard}，不为{flawed}",
    "aq.sumEnd": "结束定品后结算，其余不使用",
    "aq.pick": "选择一项能力，或直接完成。",

    "sf.lead": "「{tech}」额外翻开了{n}张窑火牌，大家都能看到。选一张，用它为你的器物复烧。",
    "sf.rule": "这{n}张牌随后都正面朝上放入窑火弃牌堆。",
    "sf.cards": "选一张窑火牌",
    "sf.cardsRule": "新品质取代原来的品质，即使更差也一样。",
    "sf.card": "第{n}张：{value}",
    "sf.jun": "「{ability}」（可选）",
    "sf.junDesc": "用在这件器物上：重算之后、定新品质之前。",
    "sf.junNone": "不使用",
    "sf.junUnavailable": "现在不能使用。",
    "sf.pick": "请选一张窑火牌。",
    "sf.sum": "用窑火牌<b>{value}</b>复烧<b>{ceramic}</b>",
    "sf.sumJun": "用窑火牌<b>{value}</b>复烧<b>{ceramic}</b>，再付{wood}用「{ability}」<b>{delta}</b>",


    "wait.lead": "等候时可以浏览桌面。",
    "wait.looking": "{name}正在私看{n}张牌",
  },
});
