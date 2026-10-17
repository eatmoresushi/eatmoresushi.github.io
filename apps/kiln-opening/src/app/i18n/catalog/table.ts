import { defineNamespace } from "../defineNamespace.ts";

/**
 * `table` namespace: central board, Shared Kiln strip, Order display, the viewer's hand, Techs,
 * Recognition track and the D10 rules details. Owned by B2 (UI_V1.6.1_ARCHITECTURE §4.2).
 *
 * Numbers are placeholders (§5 gap 19). Chinese follows the glossary (D6): 委托榜, 主委托牌堆,
 * 启用／停用窑位, 御府声望, 技艺, 门类, 牌面费用, 业主裁定, 规则修订; full-width punctuation and
 * `／` next to Chinese (§6.3).
 */
export const table = defineNamespace({
  en: {
    // Central board and location cards (wireframe `centralBoard`, `locCard`).
    "central.title": "Central Action Board",
    "location.taken": "{n}/{capacity} taken",
    "location.noLimit": "No limit",
    "location.here": "{n} here",
    "location.recognitionOnly": "Recognition {from}–{to} only",
    "location.placeHeading": "Place:",
    "location.placeAt": "Place {worker} at {location}",
    "location.cantPlace": "Can’t place here",
    "location.occupants": "Workers at {location}",

    // Shared Kiln strip (wireframe `kilnMini`).
    "kilnMini.title": "Shared Kiln",
    "kilnMini.layout": "{active} spaces ({zones}) · {empty} empty",
    "kilnMini.discard": "Fire discard (open)",
    "kilnMini.discardNone": "none yet",
    "kilnMini.open": "Open Kiln",

    // Main Order display (wireframe `displayRow`).
    "display.title": "Main Order display",
    "display.order": "#{first} oldest → #{last} newest",
    "display.decks": "Main deck {deck} · discard {discard} (face down)",
    "display.slot": "#{n}",
    "display.emptyRefill": "Empty. Refills when <b>{name}</b>’s turn ends.",
    "display.emptyNone": "Empty: no card to refill.",

    // Order cards (wireframe `orderCard`).
    "order.kind.starting": "Starting",
    "order.kind.commercial": "Commercial",
    "order.kind.crown": "Crown",
    "order.state.choosable": "Choose",
    "order.state.chosen": "Chosen",
    "order.state.completable": "Can complete",
    "order.state.blocked": "No matching ceramics",
    "order.state.discard": "Discard",
    "order.pick": "{state}: {order}",

    // The viewer's hand and private looks (wireframe `handRow`). The public-hands block was
    // removed in the owner review of 2026-10-17: the seat chips show every hand count.
    "hand.title": "Your hand",
    "hand.held": "{n}/{limit} held",
    "hand.overLimit": "Over the limit: trimmed at Cleanup",
    "hand.noFinalTrim": "No trim in the final round",
    "hand.empty": "No Orders in hand",
    "look.commission": "Top {n} of the Main deck",
    "look.colourSamples": "{tech}: top {n} of the Main deck",

    // Finished ceramics in the Order Phase (wireframe `secOrders` orders branch).
    "finished.title": "Your Finished ceramics",
    "finished.none": "No Finished ceramics",
    "finished.count": { one: "{n} Finished ceramic", other: "{n} Finished ceramics" },
    "finished.faceUpNote": "Face-up Main Orders cannot be completed; reserve them at the {market}.",

    // Tech display (wireframe `techDisplay`, `techCard`).
    "techs.title": "Advanced Techs",
    "techs.sub": "{n} face-up per discipline · bought at the {guild} · +{vp} VP when gained",
    "techs.deck": "deck {n}",
    "techs.none": "No face-up Tech",
    "techs.looking": { one: "{name} is looking at {n} Tech", other: "{name} is looking at {n} Techs" },
    // The Guild Hall chooser on the Tech display (owner review, 2026-10-17).
    "techs.chooseBuy": "{worker} at the {location}: choose a face-up Tech to buy",
    "techs.chooseInspect": "{worker} at the {location}: choose a discipline and inspect the top of its deck",
    "techs.inspect": "Inspect the deck",
    "techs.inspectLabel": "Inspect the deck: {discipline} (only you see the cards)",
    "techs.price": "{printed} → {price}",

    // Imperial Recognition track (wireframe `recognitionTrack`).
    "recognition.title": "Imperial Recognition",
    "recognition.range": "{from}–{to}",
    "recognition.space": "Recognition {n}",
    "recognition.here": "Here: {names}",

    // Rules details (owner decision D10, K15).

    // Clarification source labels (docs/KILN_OPENING_v1.6.1_CLARIFICATIONS.md, "Source tags").

    // Card facts (D10: discipline, cost, once per round, used this round).
  },
  zh: {
    "central.title": "中央行动板",
    "location.taken": "已占{n}／{capacity}",
    "location.noLimit": "不限",
    "location.here": "已派{n}名",
    "location.recognitionOnly": "仅限御府声望{from}–{to}",
    "location.placeHeading": "派工：",
    "location.placeAt": "派{worker}到{location}",
    "location.cantPlace": "不能派",
    "location.occupants": "{location}的工人",

    "kilnMini.title": "共窑",
    "kilnMini.layout": "{active}个窑位（{zones}）· 空{empty}个",
    "kilnMini.discard": "窑火弃牌堆（公开）",
    "kilnMini.discardNone": "暂无",
    "kilnMini.open": "查看窑",

    "display.title": "委托榜",
    "display.order": "#{first}最旧 → #{last}最新",
    "display.decks": "主委托牌堆{deck}张 · 弃牌堆{discard}张（面朝下）",
    "display.slot": "#{n}",
    "display.emptyRefill": "空位：<b>{name}</b>的回合结束时补榜。",
    "display.emptyNone": "空位：没有牌可补。",

    "order.kind.starting": "起始",
    "order.kind.commercial": "商贾",
    "order.kind.crown": "御令",
    "order.state.choosable": "选择",
    "order.state.chosen": "已选",
    "order.state.completable": "可完成",
    "order.state.blocked": "无可用器物",
    "order.state.discard": "弃置",
    "order.pick": "{state}：{order}",

    "hand.title": "你的委托手牌",
    "hand.held": "持有{n}／{limit}张",
    "hand.overLimit": "超出上限：收工时削减",
    "hand.noFinalTrim": "最后一轮不削减",
    "hand.empty": "手中暂无委托",
    "look.commission": "主委托牌堆顶{n}张",
    "look.colourSamples": "{tech}：主委托牌堆顶{n}张",

    "finished.title": "你的成器",
    "finished.none": "暂无成器",
    "finished.count": "{n}件成器",
    "finished.faceUpNote": "委托榜上的委托不能直接完成，要先在{market}承接。",

    "techs.title": "技艺",
    "techs.sub": "每门类公开{n}张 · 在{guild}习得 · 习得时得{vp}分",
    "techs.deck": "牌堆{n}张",
    "techs.none": "暂无公开技艺",
    "techs.looking": "{name}正在查看{n}张技艺",
    "techs.chooseBuy": "派{worker}到{location}：选择要习得的公开技艺",
    "techs.chooseInspect": "派{worker}到{location}：选择一个门类，查看其牌堆顶",
    "techs.inspect": "查看牌堆顶",
    "techs.inspectLabel": "查看牌堆顶：{discipline}（仅你可见）",
    "techs.price": "{printed} → {price}",

    "recognition.title": "御府声望",
    "recognition.range": "{from}–{to}",
    "recognition.space": "声望{n}",
    "recognition.here": "在此：{names}",



  },
});
