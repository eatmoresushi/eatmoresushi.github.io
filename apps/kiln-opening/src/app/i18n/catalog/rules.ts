import { defineNamespace } from "../defineNamespace.ts";

/**
 * `rules` namespace: the shared rules-details panel of owner decision D10 / K15
 * (`rules/RulesDetail.tsx`), used by the table, boards, kiln, firing stage, results and every
 * decision form. Owned by B6, which merged the four package copies (B2 `table.rules.*`, B3
 * `kiln.rules.*`, B4 `work.rules.*`, B5 `orders.rules.*`) into this one key set.
 *
 * The panel shows the full rule and the clarifications only (owner review, 2026-10-17): no card
 * text, card facts or source labels. Numbers are placeholders (§5 gap 19). Chinese follows the glossary (D6): 技艺, 门类, 牌面费用, 御府声望,
 * 业主裁定, 规则修订; full-width punctuation next to Chinese (§6.3).
 */
export const rules = defineNamespace({
  en: {
    // Panel and trigger.
    label: "Full rules: {name}",
    button: "Full rules",
    fullRule: "Full rule",
    clarifications: "Clarifications",

    // Component names and lines.
    "kiln.name": "{kiln} · {ability}",
    "location.effect": "<b>{worker}</b>: {text}",
    "order.name": "Order {id}",
    "milestone.name": "Recognition {n} · {title}",
    "track.name": "Imperial Recognition",
    "track.milestone": "<b>Recognition {n} · {title}</b>: {reward}",
    "track.overflow": "Each further Crown: +{vp} VP",
  },
  zh: {
    label: "完整规则：{name}",
    button: "完整规则",
    fullRule: "完整规则",
    clarifications: "澄清",

    "kiln.name": "{kiln} · {ability}",
    "location.effect": "<b>{worker}</b>：{text}",
    "order.name": "委托{id}",
    "milestone.name": "声望{n} · {title}",
    "track.name": "御府声望",
    "track.milestone": "<b>声望{n} · {title}</b>：{reward}",
    "track.overflow": "声望满后每个御令+{vp}分",
  },
});
