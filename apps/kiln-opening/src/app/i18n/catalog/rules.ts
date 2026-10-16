import { defineNamespace } from "../defineNamespace.ts";

/**
 * `rules` namespace: the shared rules-details panel of owner decision D10 / K15
 * (`rules/RulesDetail.tsx`), used by the table, boards, kiln, firing stage, results and every
 * decision form. Owned by B6, which merged the four package copies (B2 `table.rules.*`, B3
 * `kiln.rules.*`, B4 `work.rules.*`, B5 `orders.rules.*`) into this one key set.
 *
 * Source labels follow `docs/KILN_OPENING_v1.6.1_CLARIFICATIONS.md` "Source tags", except that a
 * rulebook line is named by its section, as a player finds it in the printed rulebook. Numbers are
 * placeholders (§5 gap 19). Chinese follows the glossary (D6): 技艺, 门类, 牌面费用, 御府声望,
 * 业主裁定, 规则修订; full-width punctuation next to Chinese (§6.3).
 */
export const rules = defineNamespace({
  en: {
    // Panel and trigger.
    label: "Rules: {name}",
    button: "Rules",
    cardText: "Card text",
    fullRule: "Full rule",
    clarifications: "Clarifications",
    facts: "Card facts",
    source: "Source: {source}",

    // Clarification source labels.
    // A rulebook line prints as its section's name (`rules/rulebookSections.ts`), never a number.
    "source.section": "“{name}”",
    "source.titlePage": "Title page",
    "source.rulebook": "Rulebook {tags}",
    "source.amendment": "Owner amendment {tags}",
    "source.ruling": "Owner ruling {tags}",
    "source.editorial": "Editorial correction to {tags}",
    "source.interpretation": "Recorded interpretation",
    "source.interpretationNamed": "Recorded interpretation: {name}",
    "source.provisional": "Provisional ruling {tags} (owner may change)",
    "source.wording": "Wording {tags}",

    // Card facts (D10: discipline, cost, once per round, used this round).
    "fact.discipline": "Discipline",
    "fact.cost": "Cost",
    "fact.price": "You pay",
    "fact.use": "Use",
    "fact.oncePerRound": "Once per round",
    "fact.thisRound": "This round",
    "fact.adds": "Adds",
    "fact.addsSpace": "Your second {location} space",
    "fact.vp": "Score",
    "fact.vpWhenGained": "{n} VP when gained",
    "fact.owner": "Owner",
    "fact.kind": "Card",
    "fact.reward": "Reward",
    "fact.location": "Location",
    "fact.central": "Central location",
    "fact.personal": "Personal location",
    "fact.capacity": "Capacity ({players} players)",
    "fact.spaces": { one: "{n} space", other: "{n} spaces" },
    "fact.noLimit": "No limit",
    "fact.eachSpace": "Each space once per round",
    "fact.recognition": "Recognition",
    "fact.recognitionOnly": "Recognition {from}–{to} only",
    "fact.here": "Here now",
    "fact.nobody": "Nobody",
    "fact.ability": "Kiln Tradition",
    "fact.track": "Track",
    "fact.trackRange": "Recognition {from}–{to}",

    // Component names and lines.
    "kiln.name": "{kiln} · {ability}",
    "location.effect": "<b>{worker}</b>: {text}",
    "order.name": "Order {id}",
    "order.kind.starting": "Starting Order",
    "order.kind.commercial": "Commercial Order",
    "order.kind.crown": "Crown Order",
    "milestone.name": "Recognition {n} · {title}",
    "track.name": "Imperial Recognition",
    "track.milestone": "<b>Recognition {n} · {title}</b>: {reward}",
    "track.overflow": "Each further Crown: +{vp} VP",
  },
  zh: {
    label: "规则：{name}",
    button: "规则",
    cardText: "牌面文字",
    fullRule: "完整规则",
    clarifications: "澄清",
    facts: "牌面信息",
    source: "出处：{source}",

    "source.section": "「{name}」",
    "source.titlePage": "扉页",
    "source.rulebook": "规则书{tags}",
    "source.amendment": "规则修订{tags}",
    "source.ruling": "业主裁定{tags}",
    "source.editorial": "勘误{tags}",
    "source.interpretation": "规则解释",
    "source.interpretationNamed": "规则解释（{name}）",
    "source.provisional": "暂定裁定{tags}（业主可改）",
    "source.wording": "措辞{tags}",

    "fact.discipline": "门类",
    "fact.cost": "牌面费用",
    "fact.price": "你付",
    "fact.use": "使用",
    "fact.oncePerRound": "每轮一次",
    "fact.thisRound": "本轮",
    "fact.adds": "添设",
    "fact.addsSpace": "{location}第二工位",
    "fact.vp": "得分",
    "fact.vpWhenGained": "习得即得{n}分",
    "fact.owner": "拥有者",
    "fact.kind": "类别",
    "fact.reward": "报酬",
    "fact.location": "地点",
    "fact.central": "中央地点",
    "fact.personal": "坊内地点",
    "fact.capacity": "容量（{players}人）",
    "fact.spaces": "{n}个工位",
    "fact.noLimit": "不限",
    "fact.eachSpace": "每个工位每轮一次",
    "fact.recognition": "御府声望",
    "fact.recognitionOnly": "仅限御府声望{from}–{to}",
    "fact.here": "现在此格",
    "fact.nobody": "无人",
    "fact.ability": "窑口传承",
    "fact.track": "声望轨",
    "fact.trackRange": "御府声望{from}–{to}",

    "kiln.name": "{kiln} · {ability}",
    "location.effect": "<b>{worker}</b>：{text}",
    "order.name": "委托{id}",
    "order.kind.starting": "起始委托",
    "order.kind.commercial": "商贾委托",
    "order.kind.crown": "御令委托",
    "milestone.name": "声望{n} · {title}",
    "track.name": "御府声望",
    "track.milestone": "<b>声望{n} · {title}</b>：{reward}",
    "track.overflow": "声望满后每个御令+{vp}分",
  },
});
