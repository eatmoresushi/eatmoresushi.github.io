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
    en: "After each Materials Yard action: form 1 Plain vessel for its normal Clay cost +1 Clay.",
    "zh-CN": "每次泥柴场行动后：支付器型泥费用＋1泥，成型1件素面器物。",
  },
  ST02: {
    en: "After each Potter’s Wheel action: pay 2 Coins to replace Plain with Painted on 1 vessel just formed.",
    "zh-CN": "每次陶车坊行动后：支付2铜钱，将本次成型的1件素面器物改为彩绘。",
  },
  ST03: {
    en: "After each Decoration Workshop action: pay 1 Wood + 1 Coin to glaze and load 1 just-decorated vessel into an empty Shared or owned Imperial Kiln space.",
    "zh-CN": "每次纹饰坊行动后：支付1柴＋1铜钱，为本次装饰的1件器物施釉，装入空置共窑位或自己的御窑。",
  },
  ST04: {
    en: "Each Kiln Yard action: after loading, gain 1 Clay or 1 Wood once.",
    "zh-CN": "每次窑坊行动装窑后：获得1泥或1柴，仅一次。",
  },
} satisfies Record<StartingTechniqueId, LocalizedShortCopy>;

export const TECHNIQUE_SHORT_COPY = { ...Object.fromEntries(
  [...Object.values(STARTING_TECHNIQUE_DEFINITIONS), ...Object.values(TECHNIQUE_DEFINITIONS)]
    .map((technique) => [technique.id, { en: technique.ability, "zh-CN": technique.abilityZh }]),
), ...STARTING_TECHNIQUE_SHORT_COPY } as Record<TechniqueCopyId, LocalizedShortCopy>;

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
    en: "Once per round, after your other Quality effects: 1 of your Standard ceramics from this firing becomes Fine + permanent Crackle. Each Crackle ceramic can use any one Decoration per Order.",
    "zh-CN": "每轮一次，其他品质能力结算后：将本次烧成的1件己方良品提升为上品并获得永久开片。每件开片陶瓷完成委托时可视为任意一种纹饰。",
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
