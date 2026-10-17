import { defineNamespace } from "../defineNamespace.ts";

/**
 * One-line location effect summaries (UI_V1.6.1_ARCHITECTURE §5 gap 1). Owned by A3.
 *
 * Keys are `<locationId>.<effect>`. English is the rulebook's Appendix E "Action Summary" table
 * (`docs/KILN_OPENING_v1.6.2_EN_SOURCE.md`) cell by cell; Chinese is the same table of the Chinese
 * rulebook (行动一览, `docs/KILN_OPENING_v1.6.2_ZH.md`), which glossary §4.1–4.7 repeats as its short
 * column (短). One editorial expansion: the Magistrate's Hall Shifu cell reads "Pay 3 Coins → same" /
 * 付3铜钱，同上, which is spelled out with the Apprentice cell's result so the line stands alone on a
 * location card. `test/v161/ui/i18n/location_summary_parity.test.ts` parses
 * both documents and checks every cell, that expansion included.
 *
 * This text is sourced rule text, so it is the one namespace exempt from the no-literal-numbers
 * rule (§6.4 `no_rule_numbers`). It lives here, not in `data/`: a new data key would move the
 * content digest.
 */
export const locationSummary = defineNamespace({
  en: {
    "materials_yard.apprentice": "Gain 3 Clay/Wood",
    "materials_yard.shifu": "Gain 6 Clay/Wood",
    "form_decorate.apprentice": "Form and decorate 1",
    "form_decorate.shifu": "Form and decorate up to 2; if 2, one Decoration −1 Coin",
    "glaze_load.apprentice": "Glaze and load 1",
    "glaze_load.shifu": "Glaze and load up to 2; Heat marker face-down on 1 of your ceramics",
    "commission_market.apprentice": "Look at the top 2 of the deck; reserve 1 from the display or those 2",
    "commission_market.shifu": "Look at the top 3; reserve up to 2 from the display and those 3",
    "guild_hall.apprentice": "Buy 1 Advanced Tech at cost",
    "guild_hall.shifu": "Look at top 2 Techs of 1 discipline (or as many as remain); buy up to 2 Techs from different disciplines at cost",
    "canal_wharf.apprentice": "2 Coins",
    "canal_wharf.shifu": "4 Coins + the top Order card, unseen, to hand",
    "magistrates_hall.apprentice": "Pay 4 Coins → +1 Recognition (0 → 1, 1 → 2 or 2 → 3)",
    "magistrates_hall.shifu": "Pay 3 Coins → +1 Recognition (0 → 1, 1 → 2 or 2 → 3)",
  },
  zh: {
    "materials_yard.apprentice": "得3泥／柴",
    "materials_yard.shifu": "得6泥／柴",
    "form_decorate.apprentice": "制1件坯并饰纹",
    "form_decorate.shifu": "制至多2件坯并饰纹；制2件时1项纹饰−1铜钱",
    "glaze_load.apprentice": "1件坯施釉装窑",
    "glaze_load.shifu": "至多2件坯施釉装窑；火标暗置于己方1件器物上",
    "commission_market.apprentice": "看牌堆顶2张；从榜上或这2张中承接1张",
    "commission_market.shifu": "看牌堆顶3张；从榜上和这3张中承接至多2张",
    "guild_hall.apprentice": "按价习得1张公开技艺",
    "guild_hall.shifu": "看1个门类的顶2张（不足则看余下的）；按价习得至多2项不同门类的技艺",
    "canal_wharf.apprentice": "得2铜钱",
    "canal_wharf.shifu": "得4铜钱，并拿取牌堆顶1张委托（不看）",
    "magistrates_hall.apprentice": "付4铜钱，声望+1（0→1、1→2或2→3）",
    "magistrates_hall.shifu": "付3铜钱，声望+1（0→1、1→2或2→3）",
  },
});
