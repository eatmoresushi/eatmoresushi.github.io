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
    en: "**After each Materials Yard action:** pay a vessel’s **Clay cost + 1 Clay** → form **1 vessel**.",
    "zh-CN": "**每次泥柴场行动后：**支付器物的**泥费用＋1泥** → 成型**1件器物**。",
  },
  ST02: {
    en: "**After each Potter’s Wheel action:** pay the **2-Coin Decoration cost** → replace Plain with **Painted** on **1 vessel formed by that action**.",
    "zh-CN": "**每次陶车坊行动后：**支付**2铜钱纹饰费用** → 将**本次行动成型的1件器物**的素面改为**彩绘**。",
  },
  ST03: {
    en: "**After each Decoration Workshop action:** pay **1 Wood + 1 Coin** → glaze and load **1 vessel decorated by that action**.",
    "zh-CN": "**每次纹饰坊行动后：**支付**1柴＋1铜钱** → 为**本次行动装饰的1件器物**施釉并装窑。",
  },
  ST04: {
    en: "**Once during each Kiln Yard action, after loading at least 1 ceramic:** gain **1 Clay or 1 Wood**.",
    "zh-CN": "**每次窑坊行动限一次，装窑至少1件陶瓷后：**获得**1泥或1柴**。",
  },
} satisfies Record<StartingTechniqueId, LocalizedShortCopy>;

const ADVANCED_TECHNIQUE_SHORT_COPY = {
  T01: {
    en: "During a Potter’s Wheel action forming at least 1 Vase or Censer: reduce the action’s total Clay cost by 2, minimum 0. Stacks with the Shifu discount.",
    "zh-CN": "陶车坊行动成型至少1件瓶或香炉时：该行动的泥总费用减2，最低为0。可与师傅折扣叠加。",
  },
  T02: {
    en: "After forming a vessel: if another of your ceramics has a different Shape → gain 2 Coins.",
    "zh-CN": "成型器物后：若你的另一件陶瓷具有不同器型 → 获得2铜钱。",
  },
  T03: {
    en: "After forming a vessel: if another of your ceramics has the same Shape → gain 2 Coins.",
    "zh-CN": "成型器物后：若你的另一件陶瓷具有相同器型 → 获得2铜钱。",
  },
  T04: {
    en: "After a Potter’s Wheel action: pay the 2-Coin Decoration cost → replace Plain with Carved, Impressed or Painted on 1 vessel formed by that action.",
    "zh-CN": "陶车坊行动后：支付2铜钱纹饰费用 → 将本次行动成型的1件器物的素面改为刻花、印花或彩绘。",
  },
  T05: {
    en: "During a Decoration Workshop action: before decorating 1 Plain vessel, change its Shape to any other Shape. Pay no additional Clay.",
    "zh-CN": "纹饰坊行动中：装饰1件素面器物前，将其器型改为任意其他器型。无需额外支付泥。",
  },
  T06: {
    en: "At the end of the Work Phase: change the Glaze of 1 of your loaded ceramics to any Glaze for free.",
    "zh-CN": "工人阶段结束时：将你的1件已装窑陶瓷的釉色免费改为任意釉色。",
  },
  T07: {
    en: "When replacing Plain with Carved, that Decoration costs 0 Coins.",
    "zh-CN": "将素面改为刻花时，该纹饰费用为0铜钱。",
  },
  T08: {
    en: "When replacing Plain with Impressed, that Decoration costs 0 Coins.",
    "zh-CN": "将素面改为印花时，该纹饰费用为0铜钱。",
  },
  T09: {
    en: "When replacing Plain with Painted, that Decoration costs 0 Coins.",
    "zh-CN": "将素面改为彩绘时，该纹饰费用为0铜钱。",
  },
  T10: {
    en: "When acquired: make 1 Selection, without a worker or resource bonus.\nDuring Commission Market: replace 1 reservation choice with a Selection.",
    "zh-CN": "获得时：进行1次选择，无需工人且无资源奖励。\n瓷牙行行动中：以该选择替代1次承接选择。",
  },
  T11: {
    en: "After Quality is assigned: pay 1 Wood → improve 1 of your ceramics from this firing: Flawed → Standard or Standard → Fine.",
    "zh-CN": "决定品质后：支付1柴 → 提升自己本次烧成的1件陶瓷：瑕品 → 良品或良品 → 上品。",
  },
  T12: {
    en: "When acquired: gain +2 Stoke and −2 Bank Contribution cards. Each costs 2 Wood to play.",
    "zh-CN": "获得时：取得＋2添柴和－2压火控火牌。使用任一张需支付2柴。",
  },
  T13: {
    en: "Before Contributions, if you have a ceramic in this firing: pay 1 Wood → privately inspect the top Fire card, then return it to the top without showing it.",
    "zh-CN": "选择控火牌前，若有自己的陶瓷参与本次烧成：支付1柴 → 私下查看窑火牌堆顶1张，再放回牌堆顶，不向他人展示。",
  },
  T14: {
    en: "After Quality is assigned: choose 1 of your Flawed or Standard ceramics from this firing → reveal 1 extra Fire card and recalculate only its Actual Heat and Quality.",
    "zh-CN": "决定品质后：选择自己本次烧成的1件瑕品或良品陶瓷 → 额外揭示1张窑火牌，仅重算其实际火候与品质。",
  },
  T15: {
    en: "When loading 1 of your ceramics into a High or Low Shared Kiln space: place this tile beneath it → its zone modifier is 0 for this firing.",
    "zh-CN": "将自己的1件陶瓷装入共窑高温区或低温区时：将此板块置于其下 → 该陶瓷本次烧成的窑位修正为0。",
  },
} satisfies Record<AdvancedTechniqueId, LocalizedShortCopy>;

export const TECHNIQUE_SHORT_COPY = {
  ...STARTING_TECHNIQUE_SHORT_COPY,
  ...ADVANCED_TECHNIQUE_SHORT_COPY,
} satisfies Record<TechniqueCopyId, LocalizedShortCopy>;

export const KILN_SHORT_COPY = {
  RU: {
    en: "**Once per round:** complete an Order using a **Plain Celadon Masterpiece** → gain **4 VP**.",
    "zh-CN": "**每轮一次：**用**青釉素面臻品**完成委托 → 获得**4分**。",
  },
  GU: {
    en: "**Once per round:** complete a **Crown Order** → gain **2 Coins + 1 VP**.",
    "zh-CN": "**每轮一次：**完成**带皇冠的委托** → 获得**2铜钱＋1分**。",
  },
  GE: {
    en: "**Once per round, after Quality is assigned:** **1 of your Standard ceramics from this firing → Fine + Crackle**.\n**Orders:** each Crackle ceramic may count as **any 1 Glaze**.",
    "zh-CN": "**每轮一次，决定品质后：****自己本次烧成的1件良品陶瓷 → 上品＋开片**。\n**委托：**每件开片陶瓷可视为具有**任意1种釉色**。",
  },
  DI: {
    en: "**Once per round, during an Apprentice’s Potter’s Wheel action:** after forming a **Bowl, Plate or Brush Washer**, pay **1 Clay** → form **1 extra vessel of the same Shape**. It counts as formed by that action.",
    "zh-CN": "**每轮一次，学徒的陶车坊行动中：**成型**碗、盘或笔洗**后，支付**1泥** → 额外成型**1件相同器型的器物**。视为由本次行动成型。",
  },
  JU: {
    en: "**Once per round, after Actual Heat is calculated, before Quality:** pay **1 Wood** → adjust **1 of your ceramics’ Actual Heat by +1 or −1**.",
    "zh-CN": "**每轮一次，计算实际火候后、决定品质前：**支付**1柴** → 将**自己的1件陶瓷的实际火候调整＋1或－1**。",
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
    ? <>{richShortCopy(techniqueShortCopy(id, locale), true)}</>
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
    ? <>{richShortCopy(kilnShortCopy(id, locale), true)}</>
    : <>{kilnFullCopy(id, locale)}</>;
}
