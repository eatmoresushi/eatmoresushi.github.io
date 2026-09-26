import type { ReactNode } from "react";
import {
  KILN_DEFINITIONS,
  STARTING_TECHNIQUE_DEFINITIONS,
  TECHNIQUE_DEFINITIONS,
} from "../game";
import type { KilnId, StartingTechniqueId, TechniqueId } from "../game";
import type { Locale } from "./i18n";

export const ADVANCED_TECHNIQUE_IDS = [
  "T01", "T02", "T03", "T04", "T05",
  "T06", "T07", "T08", "T09", "T10",
  "T11", "T12", "T13", "T14", "T15",
] as const;

export type AdvancedTechniqueId = (typeof ADVANCED_TECHNIQUE_IDS)[number];
export type TechniqueCopyId = StartingTechniqueId | AdvancedTechniqueId;
export const KILN_COPY_IDS = ["RU", "GU", "GE", "DI", "JU"] as const;
export type KilnCopyId = (typeof KILN_COPY_IDS)[number];

type LocalizedShortCopy = Readonly<Record<Locale, string>>;

/** Localized V1.4 reminders; complete rules remain in structured content. */
const STARTING_TECHNIQUE_SHORT_COPY = {
  ST01: {
    en: "After each Materials Yard action: pay the vessel's Clay cost + 1 Clay → form 1 vessel.",
    "zh-CN": "每次泥柴场行动后：支付器型泥费用＋1泥 → 成型1件器物。",
  },
  ST02: {
    en: "After each Potter’s Wheel action: pay 2 Coins → replace Plain with Painted on 1 vessel just formed.",
    "zh-CN": "每次陶车坊行动后：支付2铜钱 → 将本次成型的1件素面器物改为彩绘。",
  },
  ST03: {
    en: "After each Decoration Workshop action: pay 1 Wood + 1 Coin → glaze and load 1 vessel decorated by that action.",
    "zh-CN": "每次纹饰坊行动后：支付1柴＋1铜钱 → 为本次行动装饰的1件器物施釉并装窑。",
  },
  ST04: {
    en: "After each Kiln Yard action: gain 1 Clay or 1 Wood.",
    "zh-CN": "每次窑坊行动后：获得1泥或1柴。",
  },
} satisfies Record<StartingTechniqueId, LocalizedShortCopy>;

const ADVANCED_TECHNIQUE_SHORT_COPY = {
  T01: {
    en: "Once per round, during a Potter’s Wheel action forming a Vase or Censer → reduce the action’s total Clay cost by 2, minimum 0.",
    "zh-CN": "每轮一次，陶车坊行动至少成型1件瓶或香炉 → 该行动的泥总费用减2，最低为0。",
  },
  T02: {
    en: "Once per round, after forming a vessel: another vessel in your workshop has a different Shape → gain 2 Coins.",
    "zh-CN": "每轮一次，成型器物后：作坊内另有1件不同器型器物 → 获得2铜钱。",
  },
  T03: {
    en: "Once per round, after forming a vessel: another vessel in your workshop has the same Shape → gain 2 Coins.",
    "zh-CN": "每轮一次，成型器物后：作坊内另有1件相同器型器物 → 获得2铜钱。",
  },
  T04: {
    en: "Once per round, after a Potter’s Wheel action: pay 2 Coins → replace Plain with Carved, Impressed or Painted on 1 vessel just formed.",
    "zh-CN": "每轮一次，陶车坊行动后：支付2铜钱 → 将本次成型的1件素面器物改为刻花、印花或彩绘。",
  },
  T05: {
    en: "Once per round, during a Decoration Workshop action: before decorating 1 Plain vessel → change its Shape for no extra Clay.",
    "zh-CN": "每轮一次，纹饰坊行动中：为1件素面器物施加纹饰前 → 改为任意其他器型，无需额外支付泥。",
  },
  T06: {
    en: "Once per round, at the end of the Work Phase, before pre-firing abilities → change 1 of your loaded ceramics to any Glaze for free.",
    "zh-CN": "每轮一次，工人阶段结束、烧成前能力前 → 免费将己方1件已装窑陶瓷改为任意釉色。",
  },
  T07: {
    en: "Once per round, when replacing Plain with Carved → pay 0 Coins.",
    "zh-CN": "每轮一次，素面改为刻花时 → 支付0铜钱。",
  },
  T08: {
    en: "Once per round, when replacing Plain with Impressed → pay 0 Coins.",
    "zh-CN": "每轮一次，素面改为印花时 → 支付0铜钱。",
  },
  T09: {
    en: "Once per round, when replacing Plain with Painted → pay 0 Coins.",
    "zh-CN": "每轮一次，素面改为彩绘时 → 支付0铜钱。",
  },
  T10: {
    en: "When acquired + once per round instead of 1 Commission Market reservation: privately inspect the top 3 Main Orders → reserve 1 inspected or face-up Order; discard unchosen inspected cards. No resource bonus when acquired.",
    "zh-CN": "获得时＋每轮一次替代瓷牙行的1次承接：私下查看牌堆顶3张主委托 → 承接其中1张或1张公开委托，弃掉其余已查看委托。获得时无资源奖励。",
  },
  T11: {
    en: "Once per round, after Quality is assigned: pay 1 Wood → improve 1 of your ceramics from this firing: Flawed → Standard or Standard → Fine.",
    "zh-CN": "每轮一次，决定品质后：支付1柴 → 将自己本次烧成的1件陶瓷提升一级：瑕品→良品，或良品→上品。",
  },
  T12: {
    en: "When acquired → gain reusable +2 Stoke and −2 Bank cards. Pay 2 Wood to play either; still choose only 1 Contribution card per firing.",
    "zh-CN": "获得时 → 取得可重复使用的＋2添柴和－2压火牌。使用任一张支付2柴；每次烧成仍只选1张控火牌。",
  },
  T13: {
    en: "Once per round, before Contributions, if you have a ceramic in this firing: pay 1 Wood → privately peek at the top Fire card, then put it back.",
    "zh-CN": "每轮一次，选择控火牌前，若有自己的陶瓷参与本次烧成：支付1柴 → 私下查看窑火牌堆顶1张，再放回原位。",
  },
  T14: {
    en: "Once per round, after Quality is assigned: choose 1 of your Flawed or Standard ceramics from this firing → reveal 1 extra Fire card and recalculate only its Actual Heat + Quality. The new Quality replaces the old, even if worse.",
    "zh-CN": "每轮一次，决定品质后：选择自己本次烧成的1件瑕品或良品 → 额外揭示1张窑火牌，仅重算其实际火候与品质。新品质取代旧品质，即使更差。",
  },
  T15: {
    en: "Once per round, when loading 1 ceramic into a High or Low Shared Kiln space → its zone modifier is 0 for this firing.",
    "zh-CN": "每轮一次，将1件陶瓷装入共窑高温区或低温区时 → 该陶瓷本次烧成的窑位修正为0。",
  },
} satisfies Record<AdvancedTechniqueId, LocalizedShortCopy>;

export const TECHNIQUE_SHORT_COPY = {
  ...STARTING_TECHNIQUE_SHORT_COPY,
  ...ADVANCED_TECHNIQUE_SHORT_COPY,
} satisfies Record<TechniqueCopyId, LocalizedShortCopy>;

export const KILN_SHORT_COPY = {
  RU: {
    en: "Once per round: complete an Order using a Celadon, Plain Masterpiece to gain 4 VP.",
    "zh-CN": "每轮一次：用青釉、素面的臻品完成委托，获得4分。",
  },
  GU: {
    en: "Once per round: complete an Order with a Crown to gain 2 Coins + 1 VP.",
    "zh-CN": "每轮一次：完成带皇冠的委托，获得2铜钱＋1分。",
  },
  GE: {
    en: "Once per round, after Quality is assigned: 1 of your Standard ceramics from this firing becomes Fine + Crackle. When completing an Order, each of your Crackle ceramics may be treated as having **any one Decoration** for that Order.",
    "zh-CN": "每轮一次，品质判定后：将本次烧成的1件己方良品提升为上品并获得开片。完成委托时，你的每件开片陶瓷可在该委托中视为具有**任意一种纹饰**。",
  },
  DI: {
    en: "Once per round, after an Apprentice forms a Bowl, Plate or Brush Washer at Potter’s Wheel: pay 1 Clay for 1 extra Plain vessel of the same Shape.",
    "zh-CN": "每轮一次：学徒在陶车坊成型碗、盘或笔洗后，支付1泥，额外成型1件相同器型的素面器物。",
  },
  JU: {
    en: "Once per round, after Actual Heat and before Quality: pay 1 Wood to adjust 1 of your ceramics by +1 or −1 Heat.",
    "zh-CN": "每轮一次，计算实际火候后、决定品质前：支付1柴，将自己1件陶瓷的实际火候调整±1。",
  },
} satisfies Record<KilnCopyId, LocalizedShortCopy>;

function requiredTechniqueCopyId(id: string): TechniqueCopyId {
  if (Object.hasOwn(TECHNIQUE_SHORT_COPY, id)) return id as TechniqueCopyId;
  throw new Error(`Unknown Technique copy ID: ${id}`);
}

function requiredKilnCopyId(id: string): KilnCopyId {
  if (Object.hasOwn(KILN_SHORT_COPY, id)) return id as KilnCopyId;
  throw new Error(`Unknown Kiln copy ID: ${id}`);
}

export function techniqueShortCopy(id: string, locale: Locale): string {
  return TECHNIQUE_SHORT_COPY[requiredTechniqueCopyId(id)][locale];
}

export function techniqueShortPlainText(id: string, locale: Locale): string {
  return techniqueShortCopy(id, locale).replaceAll("**", "");
}

export function techniqueFullCopy(id: string, locale: Locale): string {
  const starting = STARTING_TECHNIQUE_DEFINITIONS[id as StartingTechniqueId];
  if (starting !== undefined) return locale === "zh-CN" ? starting.abilityZh : starting.ability;
  const advanced = TECHNIQUE_DEFINITIONS[id as TechniqueId];
  if (advanced === undefined) throw new Error(`Unknown Technique copy ID: ${id}`);
  return locale === "zh-CN" ? advanced.abilityZh : advanced.ability;
}

function richShortCopy(copy: string, emphasize = false): ReactNode[] {
  return copy.split(/\r?\n/).filter((line) => line.trim().length > 0).flatMap((line, lineIndex) => [
    ...(lineIndex === 0 ? [] : [<br key={`break-${lineIndex}`} />]),
    ...(emphasize
      ? line.split(/(\*\*[^*]+\*\*)/).map((part, partIndex) => part.startsWith("**")
        ? <strong key={`emphasis-${lineIndex}-${partIndex}`}>{part.slice(2, -2)}</strong>
        : part)
      : [line.replaceAll("**", "")]),
  ]);
}

export function TechniqueDescription({ id, locale, layer }: { id: string; locale: Locale; layer: "preview" | "full" }) {
  return layer === "preview"
    ? <>{richShortCopy(techniqueShortCopy(id, locale))}</>
    : <>{techniqueFullCopy(id, locale)}</>;
}

export function kilnShortCopy(id: string, locale: Locale): string {
  return KILN_SHORT_COPY[requiredKilnCopyId(id)][locale];
}

export function kilnShortPlainText(id: string, locale: Locale): string {
  return kilnShortCopy(id, locale).replaceAll("**", "");
}

export function kilnFullCopy(id: string, locale: Locale): string {
  const kiln = KILN_DEFINITIONS[id as KilnId];
  if (kiln === undefined) throw new Error(`Unknown Kiln copy ID: ${id}`);
  return locale === "zh-CN" ? kiln.abilityZh : kiln.ability;
}

export function KilnDescription({ id, locale, layer }: { id: KilnId; locale: Locale; layer: "preview" | "full" }) {
  return layer === "preview"
    ? <>{richShortCopy(kilnShortCopy(id, locale), id === "GE")}</>
    : <>{kilnFullCopy(id, locale)}</>;
}
