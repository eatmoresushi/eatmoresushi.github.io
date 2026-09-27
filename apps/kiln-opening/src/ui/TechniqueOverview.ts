import type { Locale } from "./i18n";
import type { TechniqueCopyId } from "./TechniqueDescription";

/** Table overview reminders; the existing short and full rules remain in inspection. */
export const TECHNIQUE_OVERVIEW_COPY = {
  ST01: {
    en: "Materials Yard: pay Shape cost + 1 Clay → form 1 Plain vessel.",
    "zh-CN": "泥柴场后：支付器型泥费用＋1泥 → 成型1件素面器物。",
  },
  ST02: {
    en: "After Potter’s Wheel: 2 Coins → paint 1 just-formed Plain vessel.",
    "zh-CN": "陶车坊后：支付2铜钱 → 将本次成型的1件素面改为彩绘。",
  },
  ST03: {
    en: "After Decoration Workshop: 1 Wood + 1 Coin → glaze + load 1 worked vessel.",
    "zh-CN": "纹饰坊后：支付1柴＋1铜钱 → 为本次装饰的1件器物施釉并装窑。",
  },
  ST04: {
    en: "Kiln Yard: load 1+ ceramic → gain 1 Clay or 1 Wood.",
    "zh-CN": "窑坊至少装窑1件后 → 获得1泥或1柴。",
  },
  T01: {
    en: "Potter’s Wheel: form Vase/Censer → −2 Clay total (min. 0).",
    "zh-CN": "陶车坊成型瓶或香炉 → 该行动泥总费用减2，最低0。",
  },
  T02: {
    en: "After forming: another workshop Shape differs → gain 2 Coins.",
    "zh-CN": "成型后，作坊另有不同器型 → 获得2铜钱。",
  },
  T03: {
    en: "After forming: another workshop Shape matches → gain 2 Coins.",
    "zh-CN": "成型后，作坊另有相同器型 → 获得2铜钱。",
  },
  T04: {
    en: "After Potter’s Wheel: 2 Coins → decorate 1 just-formed Plain vessel.",
    "zh-CN": "陶车坊后：支付2铜钱 → 本次成型的1件素面改为刻花、印花或彩绘。",
  },
  T05: {
    en: "Decoration Workshop: reshape 1 Plain vessel for no extra Clay.",
    "zh-CN": "纹饰坊装饰前：改变1件素面的器型，无需额外泥。",
  },
  T06: {
    en: "End of Work: freely change the Glaze of 1 loaded ceramic.",
    "zh-CN": "工人阶段结束：免费改变己方1件已装窑陶瓷的釉色。",
  },
  T07: {
    en: "Plain → Carved on 1 vessel for 0 Coins.",
    "zh-CN": "1件素面改为刻花 → 纹饰费用0铜钱。",
  },
  T08: {
    en: "Plain → Impressed on 1 vessel for 0 Coins.",
    "zh-CN": "1件素面改为印花 → 纹饰费用0铜钱。",
  },
  T09: {
    en: "Plain → Painted on 1 vessel for 0 Coins.",
    "zh-CN": "1件素面改为彩绘 → 纹饰费用0铜钱。",
  },
  T10: {
    en: "On gain + Market: inspect 3 Main Orders; reserve 1 inspected or face-up.",
    "zh-CN": "获得时＋瓷牙行承接：私看3张主委托，承接其中或公开的1张。",
  },
  T11: {
    en: "Pay 1 Wood: 1 fired ceramic Flawed → Standard or Standard → Fine.",
    "zh-CN": "支付1柴：本次烧成的1件陶瓷瑕品→良品，或良品→上品。",
  },
  T12: {
    en: "Gain ±2 Contribution cards; playing either costs 2 Wood.",
    "zh-CN": "取得±2控火牌；使用任一张支付2柴，每次烧成仍只选1张。",
  },
  T13: {
    en: "Before Contributions: 1 Wood → privately peek at the top Fire card.",
    "zh-CN": "有陶瓷参与烧成时，控火前支付1柴 → 私看窑火顶牌并放回。",
  },
  T14: {
    en: "Re-fire 1 Flawed/Standard ceramic; keep the new result, even if worse.",
    "zh-CN": "复烧本次的1件瑕品／良品；采用新结果，即使更差。",
  },
  T15: {
    en: "Load 1 High/Low Shared Kiln ceramic → its zone modifier is 0.",
    "zh-CN": "1件陶瓷装入共窑高／低温区 → 本次窑位修正为0。",
  },
} satisfies Record<TechniqueCopyId, Readonly<Record<Locale, string>>>;

export function techniqueOverviewCopy(id: string, locale: Locale): string {
  if (!Object.hasOwn(TECHNIQUE_OVERVIEW_COPY, id)) throw new Error(`Unknown Technique overview ID: ${id}`);
  return TECHNIQUE_OVERVIEW_COPY[id as TechniqueCopyId][locale];
}
