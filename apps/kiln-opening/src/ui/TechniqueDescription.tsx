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
 * Compact, rules-equivalent reminder copy for glanceable cards and previews.
 * `**...**` is a deliberately tiny rich-text vocabulary rendered as emphasis;
 * the authoritative full rules text remains in `data/techniques.json`.
 */
export const TECHNIQUE_SHORT_COPY = {
  ST01: {
    en: "**Once during each Materials Yard action**\n\nAfter gaining resources, you may form **1 vessel of any Shape** by paying its **normal Clay cost + 1 Clay**.",
    "zh-CN": "每次**泥柴场**行动获得资源后：可支付**正常泥费用 + 1泥**形成1件任意器形的器物。",
  },
  ST02: {
    en: "**Once during each Potter’s Wheel action**\n\nAfter forming, you may give **1 vessel formed by this action** **White Glaze + Plain Decoration**. Pay the Plain Decoration cost.",
    "zh-CN": "每次**陶车坊**行动后：将本次行动形成的 1 件器物施以**白釉 + 素面**；支付 **1 铜钱**。",
  },
  ST03: {
    en: "**Once during each Glaze & Decoration action**\n\nAfter glazing, you may pay **1 Wood** to load **1 ceramic glazed by this action** into an empty active Shared Kiln space or your empty Imperial Kiln, if gained.",
    "zh-CN": "每次**釉饰坊**行动后：支付 **1 柴** → 将本次行动施釉的 1 件陶瓷装窑。",
  },
  ST04: {
    en: "**Once during each Kiln Yard action**\n\nAfter loading at least **1 ceramic**, gain **1 Clay and 1 Wood**.",
    "zh-CN": "每次窑坊行动中至少装窑1件后，获得1泥和1柴。",
  },
  T01: {
    en: "**Acquisition: 2 Coins** · **Once per round**\n\nDuring a **Potter’s Wheel** action that forms at least **1 Vase or Censer**, reduce the action’s **total Clay cost by 2**, minimum 0. This stacks with the Shifu discount.",
    "zh-CN": "每轮一次，在陶车坊行动中形成至少1个瓶或香炉时，该行动的泥总费用减少2，最低为0。可与师傅优惠叠加。",
  },
  T02: {
    en: "**Acquisition: 2 Coins** · **Once per round**\n\nAfter you form a vessel, if you have another **Shaped or Glazed vessel of a different Shape**, gain **2 Coins**.",
    "zh-CN": "每轮一次，形成后：若你另有一件**不同器形**的成型／施釉器物，获得 **2 铜钱**。",
  },
  T03: {
    en: "**Acquisition: 2 Coins** · **Once per round**\n\nAfter you form a vessel, if you have another **Shaped or Glazed vessel of the same Shape**, gain **2 Coins**.",
    "zh-CN": "每轮一次，形成后：若你另有一件**相同器形**的成型／施釉器物，获得 **2 铜钱**。",
  },
  T04: {
    en: "**Acquisition: 3 Coins** · **Once per round**\n\nAfter a **Potter’s Wheel** action, choose **1 Shaped vessel formed by that action**. Immediately give it **any Glaze and Decoration**, paying the Decoration cost.",
    "zh-CN": "每轮一次，**陶车坊**行动后：将本次行动形成的 1 件器物施以**任意釉色 + 任意纹饰**；支付该纹饰费用。",
  },
  T05: {
    en: "**Acquisition: 2 Coins** · **Once per round**\n\nDuring a **Glaze & Decoration** action, you may change the Shape of **1 Shaped vessel being glazed** to any other Shape. Exchange its Vessel card. **No additional Clay is paid.**",
    "zh-CN": "每轮一次，在釉饰坊行动中，可将正在施釉的1件已成型器物改为任意其他器型，无需额外支付泥。",
  },
  T06: {
    en: "**Acquisition: 2 Coins** · **Once per round**\n\nImmediately before loading **1 of your Glazed ceramics**, you may change it to **any Glaze at no cost**. Its Shape and Decoration stay unchanged.",
    "zh-CN": "每轮一次，装窑前，可免费将即将装窑的1件已施釉陶瓷改为任意釉色，器型与纹饰不变。适用于窑坊、催干和御烧优先。",
  },
  T07: {
    en: "**Acquisition: 2 Coins** · **Once per round**\n\nOne **Carved Decoration** you apply costs **0 Coins**.",
    "zh-CN": "每轮一次：你施加的 1 个**刻花**纹饰费用为 **0 铜钱**。",
  },
  T08: {
    en: "**Acquisition: 2 Coins** · **Once per round**\n\nOne **Impressed Decoration** you apply costs **0 Coins**.",
    "zh-CN": "每轮一次：你施加的 1 个**印花**纹饰费用为 **0 铜钱**。",
  },
  T09: {
    en: "**Acquisition: 2 Coins** · **Once per round**\n\nOne **Crackle Decoration** you apply costs **0 Coins**.",
    "zh-CN": "每轮一次：你施加的 1 个**开片**纹饰费用为 **0 铜钱**。",
  },
  T10: {
    en: "**Acquisition: 2 Coins**\n\n**Selection:** Privately look at the top **3 Main Orders** (or as many as remain). Reserve **1 of these or 1 face-up Main Order**. Discard unreserved looked-at Orders; update the public display normally.\n\n**When acquired:** Immediately make 1 selection\n\n**Once per round:** Replace **1 reservation choice** during a Commission Market action with selection.",
    "zh-CN": "获得时立即进行1次选择，不获得承接资源奖励。每轮一次，可用此选择替代瓷牙行行动中的1次承接。选择：私下查看牌堆顶3张主委托（不足则尽量查看），承接其中1张或1张公开委托，弃掉其余已查看委托。公开展示正常左移并补牌。",
  },
  T11: {
    en: "**Acquisition: 2 Coins** · **Once per round**\n\nAfter Quality is assigned, you may pay **1 Wood** to improve **1 of your ceramics from this firing**: **Flawed → Standard** or **Standard → Fine**. This cannot create a Masterpiece.",
    "zh-CN": "每轮一次，判定品质后：支付 **1 柴** → 将 1 件陶瓷提升一级：\n**瑕品 → 良品** 或 **良品 → 上品**。不能提升为臻品。",
  },
  T12: {
    en: "**Acquisition: 3 Coins** · **When choosing Bank or Stoke**\n\nYou may secretly commit **1 extra Wood** with your Contribution. Reveal and pay it with your Contribution to make **Bank −2** or **Stoke +2**.",
    "zh-CN": "选择**压火或添柴**时，秘密额外支付 **1 柴** → 你的控火值变为 **−2 或 +2**。",
  },
  T13: {
    en: "**Acquisition: 3 Coins** · **Once per round**\n\nBefore Contributions are chosen, if you have a ceramic in this firing, you may pay **1 Wood** to privately look at the **top Fire card**. Return it to the top without showing it.",
    "zh-CN": "每轮一次，选择控火牌前：若你有陶瓷参与本次烧成，支付 **1 柴** → 私下查看牌堆顶的火牌。",
  },
  T14: {
    en: "**Acquisition: 2 Coins** · **Once per round**\n\nAfter Quality is assigned, choose **1 of your Flawed or Standard ceramics from this firing**. Reveal an extra Fire card and recalculate its Actual Heat and Quality using the **same Base Heat and kiln position**. Ignore previous Actual Heat adjustments. Keep the new Quality, **even if worse**, then discard the extra card. Unused firing abilities may still resolve at their normal timing.",
    "zh-CN": "每轮一次，判定品质后：选择 1 件**瑕品或良品**。额外翻开 1 张火牌并重新计算其火候与品质。**新结果取代旧结果，即使更差。**",
  },
  T15: {
    en: "**Acquisition: 2 Coins** · **Once per round**\n\nWhen loading **1 of your ceramics into a High or Low Shared Kiln space**, you may place this tile beneath it. Its zone modifier is **0 for this firing**, even if moved. Move this tile with it; return the tile after firing.",
    "zh-CN": "每轮一次，装入**高温区或低温区**时：将此牌置于该陶瓷下。本次烧成其窑位修正视为 **0**，即使之后被移动。",
  },
} as const satisfies Record<TechniqueCopyId, LocalizedShortCopy>;

export const KILN_SHORT_COPY = {
  RU: {
    en: "**Once per round**\n\nWhen you complete an Order using a **Masterpiece with Celadon Glaze and Plain Decoration**, gain **4 VP**.",
    "zh-CN": "**每轮一次：**\n完成委托时，若使用了 1 件**臻品 · 青釉 · 素面**陶瓷 → **+4 VP**。",
  },
  GU: {
    en: "**Once per round**\n\nWhen you complete a **Crown Order**, gain **2 Coins and 1 VP**.",
    "zh-CN": "**每轮一次：**\n完成 1 张**御令委托** → **+2 铜钱 +1 VP**。",
  },
  GE: {
    en: "When completing **Orders** or scoring the **Exhibition**, treat your **Standard-quality Crackle ceramics** as **Fine**.\n\n**Once per round:** When completing an Order, you may treat **1 of your Crackle ceramics used** as having **any one Decoration** for all that Order’s Decoration requirements.",
    "zh-CN": "完成**委托**或进行**展览**计分时，将你的**良品开片陶瓷**视为**上品**。\n\n**每轮一次：**完成委托时，可将所用**1件开片陶瓷**视为具有**任意一种纹饰**，适用于该委托全部纹饰要求。",
  },
  DI: {
    en: "**Once per round**\n\nDuring a **Potter’s Wheel** action, after forming a **Bowl, Plate or Brush Washer**, you may pay **1 Clay** to form **1 extra vessel of the same Shape**.\n\nThe extra vessel does not count towards the action limit or Shifu discount. It may be chosen for White Slip or Drying Frames.",
    "zh-CN": "**每轮一次，陶车坊：**\n形成**碗、盘或笔洗**后，支付 **1 泥** → 再形成 **1 件相同器形**。",
  },
  JU: {
    en: "**Once per round**\n\nAfter Actual Heat is calculated, but before Quality is assigned, you may pay **1 Wood** to adjust **1 of your ceramics’ Actual Heat by +1 or −1**.",
    "zh-CN": "**每轮一次，判定品质前：**\n支付 **1 柴** → 将 1 件陶瓷的**实际火候 ±1**。",
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
  return copy.replaceAll("**", "").split("\n").flatMap((line, lineIndex) => [
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
