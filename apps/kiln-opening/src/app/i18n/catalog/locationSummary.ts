import { defineNamespace } from "../defineNamespace.ts";

/**
 * One-line location effect summaries (UI_V1.6.1_ARCHITECTURE §5 gap 1). Owned by A3.
 *
 * Keys are `<locationId>.<effect>`. English is the rulebook's Appendix E "Action Summary" table
 * (`docs/KILN_OPENING_v1.6.2_EN_SOURCE.md`) cell by cell; Chinese is the same table of the Chinese
 * rulebook (行动一览, `docs/KILN_OPENING_v1.6.2_ZH.md`), which glossary §4.1–4.7 repeats as its short
 * column (短). One editorial expansion: the Magistrate's Hall Shifu cell reads "Pay 4 Coins → same,
 * and reserve 1 face-up Crown Order …" / 付4铜钱，同上，并承接…, whose "same" (同上) is spelled out
 * with the Apprentice cell's result so the line stands alone on a location card (owner revision 4,
 * changes 30, 33–35). `test/v161/ui/i18n/location_summary_parity.test.ts` parses
 * both documents and checks every cell, that expansion included.
 *
 * This text is sourced rule text, so it is the one namespace exempt from the no-literal-numbers
 * rule (§6.4 `no_rule_numbers`). It lives here, not in `data/`: a new data key would move the
 * content digest.
 */
export const locationSummary = defineNamespace({
  en: {
    "materials_yard.apprentice": "Gain 4 Clay/Wood",
    "materials_yard.shifu": "Gain 8 Clay/Wood",
    "form_decorate.apprentice": "Form 1: Clay + 2 Coins, any Decoration",
    "form_decorate.shifu": "Form up to 2; if 2, one costs 1 Coin less",
    "glaze_load.apprentice": "Glaze and load 1 (1 Wood)",
    "glaze_load.shifu": "Glaze and load up to 2 (still 1 Wood)",
    "commission_market.apprentice": "Select 2",
    "commission_market.shifu": "Select 3, reserving up to 2",
    "guild_hall.apprentice": "Buy 1 Advanced Tech at cost",
    "guild_hall.shifu": "Look at top 2 Techs of 1 discipline (or as many as remain); buy up to 2 Techs from different disciplines at cost",
    "canal_wharf.apprentice": "2 Coins",
    "canal_wharf.shifu": "4 Coins + the top Order card, unseen, to hand",
    "magistrates_hall.apprentice": "Pay 4 Coins → +1 Recognition (0 → 1, 1 → 2 or 2 → 3)",
    "magistrates_hall.shifu": "Pay 4 Coins → +1 Recognition (0 → 1, 1 → 2 or 2 → 3), and reserve 1 face-up Crown Order (none if none is showing)",
  },
  zh: {
    "materials_yard.apprentice": "得4泥／柴",
    "materials_yard.shifu": "得8泥／柴",
    "form_decorate.apprentice": "制1件坯：泥费+2铜钱，纹饰任选",
    "form_decorate.shifu": "制至多2件坯；制2件时1件少付1铜钱",
    "glaze_load.apprentice": "1件坯施釉装窑（1柴）",
    "glaze_load.shifu": "至多2件坯施釉装窑（仍是1柴）",
    "commission_market.apprentice": "精选2",
    "commission_market.shifu": "精选3，承接至多2张",
    "guild_hall.apprentice": "按价习得1张公开技艺",
    "guild_hall.shifu": "看1个门类的顶2张（不足则看余下的）；按价习得至多2项不同门类的技艺",
    "canal_wharf.apprentice": "得2铜钱",
    "canal_wharf.shifu": "得4铜钱，并拿取牌堆顶1张委托（不看）",
    "magistrates_hall.apprentice": "付4铜钱，声望+1（0→1、1→2或2→3）",
    "magistrates_hall.shifu": "付4铜钱，声望+1（0→1、1→2或2→3），并承接榜上1张御令委托（榜上没有则不承接）",
  },
});
