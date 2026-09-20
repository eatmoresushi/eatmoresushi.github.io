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

/**
 * Owner-supplied reminders for tile faces and hover previews. Full effects
 * remain in `data/techniques.json`; clicked views add the pasted clarifications.
 */
export const TECHNIQUE_SHORT_COPY = {
  "ST01": {
    "en": "After each Materials Yard action: pay 1 more clay cost → form 1 vessel",
    "zh-CN": "每次泥柴场行动后：支付器型泥费＋1泥 → 成型1件器物"
  },
  "ST02": {
    "en": "After each Potter’s Wheel action: pay 1 coin → give 1 vessel just formed White + Plain",
    "zh-CN": "每次陶车坊行动后：支付1铜钱 → 为刚成型的1件器物施以白釉＋素面"
  },
  "ST03": {
    "en": "After each Glaze & Decoration action: pay 1 Wood → load 1 ceramic just glazed",
    "zh-CN": "每次釉饰坊行动后：支付1柴 → 将刚施釉的1件陶瓷装窑"
  },
  "ST04": {
    "en": "After each Kiln Yard action: gain 1 Clay or 1 Wood.",
    "zh-CN": "每次窑坊行动后：获得1泥或1柴。"
  },
  "T01": {
    "en": "During a Potter’s Wheel action forming at least 1 Vase or Censer → reduce the action’s total Clay cost by 2, minimum 0. This stacks with the Shifu discount.",
    "zh-CN": "陶车坊行动中成型至少1件瓶或香炉 → 该行动泥总费用减少2，最低为0。可与师傅优惠叠加。"
  },
  "T02": {
    "en": "After forming a vessel, if you have another Shaped or Glazed vessel of a different Shape → gain 2 Coins.",
    "zh-CN": "成型1件器物后，若你另有1件不同器型的已成型或已施釉器物 → 获得2铜钱。"
  },
  "T03": {
    "en": "After you form a vessel, if you have another Shaped or Glazed vessel of the same Shape → gain 2 Coins.",
    "zh-CN": "成型1件器物后，若你另有1件相同器型的已成型或已施釉器物 → 获得2铜钱。"
  },
  "T04": {
    "en": "After a Potter’s Wheel action: pay the Decoration cost → give 1 Shaped vessel formed by that action any Glaze + any Decoration.",
    "zh-CN": "陶车坊行动后：支付纹饰费用 → 为本次行动成型的1件已成型器物施以任意釉色＋任意纹饰。"
  },
  "T05": {
    "en": "During a Glaze & Decoration action, change the Shape of 1 Shaped vessel being glazed to any other Shape.",
    "zh-CN": "釉饰坊行动中，将正在施釉的1件已成型器物改为任意其他器型。"
  },
  "T06": {
    "en": "Immediately before loading 1 of your Glazed ceramics, change it to any Glaze at no cost. Its Shape and Decoration stay unchanged.",
    "zh-CN": "你的1件已施釉陶瓷装窑前，可免费将其改为任意釉色。器型与纹饰不变。"
  },
  "T07": {
    "en": "One Carved Decoration you apply costs 0 Coins.",
    "zh-CN": "你施加的1个刻花纹饰费用为0铜钱。"
  },
  "T08": {
    "en": "One Impressed Decoration you apply costs 0 Coins.",
    "zh-CN": "你施加的1个印花纹饰费用为0铜钱。"
  },
  "T09": {
    "en": "One Crackle Decoration you apply costs 0 Coins.",
    "zh-CN": "你施加的1个开片纹饰费用为0铜钱。"
  },
  "T10": {
    "en": "When acquired: Immediately make 1 selection\nOnce per round: Replace 1 reservation choice during a Commission Market action with selection.",
    "zh-CN": "获得时：立即进行1次选择\n每轮一次：用此选择替代瓷牙行行动中的1次承接选择。"
  },
  "T11": {
    "en": "After Quality is assigned: pay 1 Wood → improve 1 of your ceramics in this firing: Flawed → Standard or Standard → Fine.",
    "zh-CN": "判定品质后：支付1柴 → 提升本次烧成中你的1件陶瓷：瑕品→良品，或良品→上品。"
  },
  "T12": {
    "en": "Secretly commit 1 extra Wood with your Contribution. Reveal and pay it with your Contribution to make Bank −2 or Stoke +2.",
    "zh-CN": "秘密随控火牌额外投入1柴。与控火牌同时公开并支付，使压火变为−2或添柴变为＋2。"
  },
  "T13": {
    "en": "Before Contributions, if you have a ceramic in this firing: pay 1 Wood → privately look at the top Fire card. Return it to the top without showing it.",
    "zh-CN": "选择控火牌前，若你有陶瓷参与本次烧成：支付1柴 → 私下查看牌堆顶的窑火牌。不展示，并放回牌库顶。"
  },
  "T14": {
    "en": "After Quality is assigned: choose 1 of your Flawed or Standard ceramics in this firing → reveal 1 extra Fire card and recalculate only its Actual Heat and Quality using the same Base Heat and kiln position.",
    "zh-CN": "判定品质后：选择本次烧成中你的1件瑕品或良品 → 额外翻开1张窑火牌，使用相同基础火候和窑位，仅重新计算该陶瓷的实际火候与品质。"
  },
  "T15": {
    "en": "When loading 1 of your ceramics into a High or Low Shared Kiln space: place this tile beneath it → its zone modifier is 0 for this firing.",
    "zh-CN": "将你的1件陶瓷装入共窑高温区或低温区时：将本牌置于其下 → 本次烧成的窑位修正为0。"
  }
} as const satisfies Record<TechniqueCopyId, LocalizedShortCopy>;

export const KILN_SHORT_COPY = {
  RU: {
    en: "Once per round, when you complete an Order using a Masterpiece with Celadon Glaze and Plain Decoration, gain 4 VP.",
    "zh-CN": "每轮一次，完成委托时，若使用了1件青釉、素面的臻品陶瓷，获得4分。",
  },
  GU: {
    en: "Once per round, when you complete a Crown Order, gain 2 Coins and 1 VP.",
    "zh-CN": "每轮一次，完成1张御令委托时，获得2铜钱和1分。",
  },
  GE: {
    en: "For Orders and Exhibition scoring, your Standard Crackle ceramics count as Fine.\nOnce per round, 1 of your Crackle ceramics used for an Order may count as any one Decoration for all that Order’s requirements.",
    "zh-CN": "完成委托或进行展览计分时，将你的良品开片陶瓷视为上品。\n每轮一次：完成委托时，可将所用1件己方开片陶瓷视为具有任意一种纹饰，适用于该委托全部要求。",
  },
  DI: {
    en: "Once per round, during a Potter’s Wheel action, after forming a Bowl, Plate or Brush Washer, you may pay 1 Clay to form 1 extra vessel of the same Shape.",
    "zh-CN": "每轮一次，陶车坊行动中形成碗、盘或笔洗后，你可以支付1泥，额外形成1件相同器型的器物。",
  },
  JU: {
    en: "Once per round, after Actual Heat is calculated, but before Quality is assigned, you may pay 1 Wood to adjust 1 of your ceramics’ Actual Heat by +1 or −1.",
    "zh-CN": "每轮一次，计算实际火候后、判定品质前，你可以支付1柴，将你的1件陶瓷的实际火候调整+1或−1。",
  },
} as const satisfies Record<KilnCopyId, LocalizedShortCopy>;

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

function richShortCopy(copy: string): ReactNode[] {
  return copy.replaceAll("**", "").split(/\r?\n/).filter((line) => line.trim().length > 0).flatMap((line, lineIndex) => [
    ...(lineIndex === 0 ? [] : [<br key={`break-${lineIndex}`} />]),
    line,
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
    ? <>{richShortCopy(kilnShortCopy(id, locale))}</>
    : <>{kilnFullCopy(id, locale)}</>;
}
