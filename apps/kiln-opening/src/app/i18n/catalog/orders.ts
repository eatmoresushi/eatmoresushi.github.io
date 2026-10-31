import { defineNamespace } from "../defineNamespace.ts";

/**
 * `orders` namespace: Order Phase, Cleanup, final and rules-detail text. Owned by B5
 * (UI_V1.6.1_ARCHITECTURE §4.2).
 *
 * Wireframe sources: `decOrders`, `decTrim`, `decFinal`, and owner decision D10 (rules details).
 * Since owner revision 5 the Order Phase is the post-firing free-action window (R28), and an Order
 * is also completed as a free action in a Work turn (`work.work.mode.completeOrder`).
 * Every rule number is a placeholder (§5 gap 19). Glossary §1.5: 交货 only in 交货阶段; Orders are
 * 完成 and ceramics 交付.
 */
export const orders = defineNamespace({
  en: {
    // Order Phase (single pass, First Player order).
    "title.orders": "Order Phase: free actions",
    "turn.lead": "In First Player order, after the firing. Take any number of free actions, one at a time: complete held Orders, sell a Flawed ceramic, use Imperial Priority. The choices are checked again after each one.",
    "turn.order": "Order",
    "turn.ceramics": "Ceramics",
    "turn.option": "Option {n}",
    "turn.rewards": "Rewards",
    "turn.optional": "Optional abilities",
    "turn.optionalNote": "Declining keeps the once-per-round use.",
    "turn.use": "Use {name}",
    "turn.canalBarge": "{tech}: +{n} Coins",
    "turn.crackleVp": "Crackle: +{n} VP",
    "turn.sum": "Complete <b>{order}</b> with {ceramics}",
    "turn.sumEnd": "End your Order turn",
    "turn.pick": "Choose a free action, or end your turn.",
    "turn.done": "Done",
    "turn.pickOrder": "Choose an Order to complete.",
    "turn.pickGroup": "Choose which ceramics to deliver.",
    "turn.faceUpNote": "Only held Orders can be completed; Orders on the display cannot.",
    "turn.crownNote": "Crowns advance Imperial Recognition one at a time, resolving every milestone crossed; beyond Recognition {max}, each Crown scores {vp} VP immediately.",
    "ceramicAs": "{ceramic} (as {decoration})",
    "requirementLine": "{requirements} · {quality}",

    // Crackle declarations (L470, L485; `crackleDeclarationChecks`).
    "decl.legend": "Crackle declaration",
    "decl.auto": "Find a declaration for me",
    "decl.autoDesc": "The game picks Decorations for your Crackle ceramics that complete the Order, and records them.",
    "decl.autoAs": "Counts as {decoration}.",
    "decl.autoAsList": "{list}.",
    "decl.explicit": "Declare each Crackle ceramic myself",
    "decl.explicitDesc": "Each Crackle ceramic may count as any one Decoration for this Order only.",
    "decl.countsAs": "{ceramic} counts as",
    "decl.printed": "Its own Decoration ({decoration})",
    "decl.ok": "satisfies {order}",
    "decl.no": "does not satisfy {order}",

    // Cleanup hand trim (parallel).
    "title.handLimit": "Discard down to your hand limit",
    "trim.lead": "You hold {held} Orders and your limit is {limit}: discard exactly {n}. Starting Orders return to the box; Main Orders go face down to the discard.",
    "trim.count": "{chosen} of {n} chosen",
    "trim.sum": "Discard <b>{list}</b>",
    "trim.parallel": "Everyone trims at the same time; others see only how many Orders you hold.",
    "trim.raisedBy": "Your limit is raised by",

    // Final summary.
    "title.final": "Game over",
    "title.sharedVictory": "Shared victory",
    "final.winner": "{name} wins with {vp} VP.",
    "final.shared": "{names} share the win on {vp} VP; they also tie on every tie-breaker.",
    "final.decidedBy": "Decided by {criterion}.",
    "final.by.imperial_recognition": "Imperial Recognition",
    "final.by.printed_crowns": "printed Crowns on completed Orders",
    "final.by.masterpieces": "Masterpieces delivered or exhibited",
    "final.standings": "Standings",
    "final.rank": "#{rank}",
    "final.seeResults": "The full score table is in Results.",

    // Rules details (owner decision D10).
    "rules.kilnName": "{kiln} · {ability}",
  },
  zh: {
    "title.orders": "交货阶段：自由行动",
    "turn.lead": "烧窑之后，按起始玩家顺序。你可以逐项进行任意数量的自由行动：完成在手委托、卖出瑕品、用御烧优先；每做一项，选项都会重新核验。",
    "turn.order": "委托",
    "turn.ceramics": "器物",
    "turn.option": "方案{n}",
    "turn.rewards": "报酬",
    "turn.optional": "可选能力",
    "turn.optionalNote": "不使用则不消耗“每轮一次”。",
    "turn.use": "使用「{name}」",
    "turn.canalBarge": "「{tech}」：得{n}铜钱",
    "turn.crackleVp": "开片器+{n}分",
    "turn.sum": "用{ceramics}完成<b>{order}</b>",
    "turn.sumEnd": "结束你的交货阶段回合",
    "turn.pick": "请选择一项自由行动，或结束回合。",
    "turn.done": "结束回合",
    "turn.pickOrder": "请选择要完成的委托。",
    "turn.pickGroup": "请选择要交付的器物。",
    "turn.faceUpNote": "只能完成在手委托；委托榜上的委托不能完成。",
    "turn.crownNote": "御令逐个推进御府声望，逐格结算途经的每项声望奖励；声望满{max}后，每个御令立即得{vp}分。",
    "ceramicAs": "{ceramic}（视为{decoration}）",
    "requirementLine": "{requirements} · {quality}",

    "decl.legend": "开片声明",
    "decl.auto": "自动寻找可行声明",
    "decl.autoDesc": "由系统为你的开片器选定能完成这张委托的纹饰，并记录在案。",
    "decl.autoAs": "视为{decoration}。",
    "decl.autoAsList": "{list}。",
    "decl.explicit": "逐件自行声明",
    "decl.explicitDesc": "每件开片器都可以视为任意一种纹饰，只对这张委托有效。",
    "decl.countsAs": "{ceramic}视为",
    "decl.printed": "本身纹饰（{decoration}）",
    "decl.ok": "满足{order}",
    "decl.no": "不满足{order}",

    "title.handLimit": "弃到委托上限",
    "trim.lead": "你持有{held}张委托，上限{limit}张：必须恰好弃置{n}张。起始委托放回盒中；主委托面朝下弃置。",
    "trim.count": "已选{chosen}／{n}张",
    "trim.sum": "弃置<b>{list}</b>",
    "trim.parallel": "所有玩家同时弃牌；其他玩家只看到你持有的委托张数。",
    "trim.raisedBy": "你的上限由此提高：",

    "title.final": "终局",
    "title.sharedVictory": "共享胜利",
    "final.winner": "{name}以{vp}分获胜。",
    "final.shared": "{names}以{vp}分并列第一，平局判定也全部相同，共享胜利。",
    "final.decidedBy": "以{criterion}定胜负。",
    "final.by.imperial_recognition": "御府声望",
    "final.by.printed_crowns": "已完成委托上印的御令",
    "final.by.masterpieces": "已交付或陈列的臻品",
    "final.standings": "名次",
    "final.rank": "第{rank}名",
    "final.seeResults": "完整计分见终局结果。",

    "rules.kilnName": "{kiln}·{ability}",
  },
});
