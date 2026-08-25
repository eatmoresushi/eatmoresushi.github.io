import { RU_BONUS_QUALITY, RU_ORDER_VP } from "./orderRules.ts";
import { JUN_ACTIVATION_WOOD } from "./firingRules.ts";
import { IMPERIAL_PROGRESS } from "./content.ts";
import type {
  DingCostExperimentConfig,
  JunWoodExperimentConfig,
  ExhibitionExperimentConfig,
  TechniqueGrantExperimentConfig,
  R5WorkerExperimentConfig,
  RuTriggerExperimentConfig,
  GameExperimentConfig,
  ImperialTrackExperimentConfig,
  JunAbExperimentConfig,
} from "./types.ts";

export const JUN_AB_CONTROL_CONFIG = Object.freeze({
  experimentId: "jun-ab-001",
  experimentArm: "control",
  junActivationCoinCost: 0,
} satisfies JunAbExperimentConfig);

export const JUN_AB_COST_ONE_CONFIG = Object.freeze({
  experimentId: "jun-ab-001",
  experimentArm: "jun_cost_1",
  junActivationCoinCost: 1,
} satisfies JunAbExperimentConfig);

export interface ActiveImperialTrackRules {
  readonly imperialOrderProgressMode: "printed" | "all_two";
  readonly trackVp: readonly [number, number, number, number, number, number];
  readonly apprenticeMilestoneSpaces: readonly [number, number];
  readonly presentationSpaces: readonly number[];
  readonly exhibitionCapacityByProgress: readonly [number, number, number, number, number, number];
  readonly imperialSealEnabled: true;
  readonly imperialSealVp: 2 | 3;
}

/**
 * The published Imperial Progress rules, derived from `data/imperial_progress.json` rather
 * than restated here.
 *
 * These values were previously hard-coded. They happened to agree with the data file, so
 * nothing was visibly wrong -- but the engine scores end-game Progress VP from this object
 * (`engine.ts`, final scoring), which meant editing the track in the data file would have
 * changed the rulebook, the UI and every reference table while leaving actual scoring on
 * the old numbers.
 */
/**
 * Built fresh from the data on each read rather than frozen at import, so that editing
 * `data/imperial_progress.json` actually changes play. Freezing a derived copy at module
 * load reintroduces the bug this derivation exists to remove: the values agree until
 * someone edits the file, and then they silently do not.
 */
export function officialImperialTrackRules(): ActiveImperialTrackRules {
  const track = IMPERIAL_PROGRESS.track;
  return {
    imperialOrderProgressMode: "printed",
    trackVp: track.map((space) => space.endGameVp) as unknown as ActiveImperialTrackRules["trackVp"],
    apprenticeMilestoneSpaces: track
      .filter((space) => space.unlocksApprentice)
      .map((space) => space.space) as unknown as ActiveImperialTrackRules["apprenticeMilestoneSpaces"],
    presentationSpaces: [...IMPERIAL_PROGRESS.exhibition.diversityEligibleSpaces] as unknown as ActiveImperialTrackRules["presentationSpaces"],
    exhibitionCapacityByProgress: [...IMPERIAL_PROGRESS.exhibition.capacityByProgress] as unknown as ActiveImperialTrackRules["exhibitionCapacityByProgress"],
    imperialSealEnabled: true,
    imperialSealVp: IMPERIAL_PROGRESS.imperialSealVp as 2 | 3,
  };
}

export const IMPERIAL_TRACK_CANDIDATE_A_CONFIG = Object.freeze({
  experimentId: "imperial-track-ab-001",
  experimentArm: "all_imperial_orders_progress_2",
  imperialOrderProgressMode: "all_two",
  imperialProgressTrackVp: Object.freeze([0, 1, 1, 3, 3, 7]),
  apprenticeMilestoneSpaces: Object.freeze([2, 4]),
  presentationSpaces: Object.freeze([4, 5]),
  imperialSealEnabled: true,
  imperialSealVp: 3,
} satisfies ImperialTrackExperimentConfig);

export const IMPERIAL_TRACK_CANDIDATE_B_CONFIG = Object.freeze({
  experimentId: "imperial-track-ab-001",
  experimentArm: "earlier_apprentices_track_002248_seal_2",
  imperialOrderProgressMode: "printed",
  imperialProgressTrackVp: Object.freeze([0, 0, 2, 2, 4, 8]),
  apprenticeMilestoneSpaces: Object.freeze([1, 3]),
  presentationSpaces: Object.freeze([4, 5]),
  imperialSealEnabled: true,
  imperialSealVp: 2,
} satisfies ImperialTrackExperimentConfig);

function exactNumberArray(value: unknown, expected: readonly number[]): boolean {
  return Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index]);
}

function isJunConfig(value: unknown): value is JunAbExperimentConfig {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<JunAbExperimentConfig>;
  return candidate.experimentId === "jun-ab-001" && (
    (candidate.experimentArm === "control" && candidate.junActivationCoinCost === 0) ||
    (candidate.experimentArm === "jun_cost_1" && candidate.junActivationCoinCost === 1)
  );
}

function isImperialTrackConfig(value: unknown): value is ImperialTrackExperimentConfig {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ImperialTrackExperimentConfig>;
  if (candidate.experimentId !== "imperial-track-ab-001" || candidate.imperialSealEnabled !== true) {
    return false;
  }
  if (candidate.experimentArm === "all_imperial_orders_progress_2") {
    return candidate.imperialOrderProgressMode === "all_two" &&
      exactNumberArray(candidate.imperialProgressTrackVp, [0, 1, 1, 3, 3, 7]) &&
      exactNumberArray(candidate.apprenticeMilestoneSpaces, [2, 4]) &&
      exactNumberArray(candidate.presentationSpaces, [4, 5]) &&
      candidate.imperialSealVp === 3;
  }
  if (candidate.experimentArm === "earlier_apprentices_track_002248_seal_2") {
    return candidate.imperialOrderProgressMode === "printed" &&
      exactNumberArray(candidate.imperialProgressTrackVp, [0, 0, 2, 2, 4, 8]) &&
      exactNumberArray(candidate.apprenticeMilestoneSpaces, [1, 3]) &&
      exactNumberArray(candidate.presentationSpaces, [4, 5]) &&
      candidate.imperialSealVp === 2;
  }
  return false;
}

function isDingCostConfig(value: unknown): value is DingCostExperimentConfig {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DingCostExperimentConfig>;
  return candidate.experimentId === "ding-cost-ab-001"
    && (candidate.experimentArm === "paid" || candidate.experimentArm === "free");
}

function isRuTriggerConfig(value: unknown): value is RuTriggerExperimentConfig {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<RuTriggerExperimentConfig>;
  if (candidate.experimentId !== "ru-trigger-ab-001") return false;
  if (candidate.ruMinQuality !== "fine" && candidate.ruMinQuality !== "masterpiece") return false;
  if (typeof candidate.ruOrderVp !== "number" || candidate.ruOrderVp <= 0) return false;
  return ["control", "fine_2", "fine_3", "master_6"].includes(candidate.experimentArm ?? "");
}

function isJunWoodConfig(value: unknown): value is JunWoodExperimentConfig {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Partial<JunWoodExperimentConfig>;
  if (c.experimentId !== "jun-wood-ab-001") return false;
  if (!["control", "wood_3", "wood2_coin1"].includes(c.experimentArm ?? "")) return false;
  if (typeof c.junActivationWood !== "number" || c.junActivationWood <= 0) return false;
  return c.junActivationCoins === undefined
    || (typeof c.junActivationCoins === "number" && c.junActivationCoins >= 0);
}

function isR5WorkerConfig(value: unknown): value is R5WorkerExperimentConfig {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Partial<R5WorkerExperimentConfig>;
  return c.experimentId === "r5-worker-ab-001"
    && (c.experimentArm === "control" || c.experimentArm === "extra_worker")
    && typeof c.beneficiaryPlayerId === "string" && c.beneficiaryPlayerId.length > 0;
}

function isExhibitionConfig(value: unknown): value is ExhibitionExperimentConfig {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Partial<ExhibitionExperimentConfig>;
  if (c.experimentId !== "exhibition-ab-001") return false;
  if (c.experimentArm !== "control" && c.experimentArm !== "proposed") return false;
  if (!Array.isArray(c.capacityByProgress) || c.capacityByProgress.length !== 6) return false;
  const q = c.qualityVp;
  return typeof q === "object" && q !== null
    && typeof q.standard === "number" && typeof q.fine === "number" && typeof q.masterpiece === "number";
}

function isTechniqueGrantConfig(value: unknown): value is TechniqueGrantExperimentConfig {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Partial<TechniqueGrantExperimentConfig>;
  return c.experimentId === "technique-grant-ab-001"
    && (c.experimentArm === "control" || c.experimentArm === "granted")
    && typeof c.beneficiaryPlayerId === "string" && c.beneficiaryPlayerId.length > 0
    && typeof c.techniqueId === "string" && c.techniqueId.length > 0;
}

/** The Technique granted for free at setup, if any, and to whom. */
export function grantedTechnique(
  config: GameExperimentConfig | undefined,
): { playerId: string; techniqueId: string } | null {
  if (config?.experimentId !== "technique-grant-ab-001") return null;
  return config.experimentArm === "granted"
    ? { playerId: config.beneficiaryPlayerId, techniqueId: config.techniqueId }
    : null;
}

export function isSupportedExperimentConfig(value: unknown): value is GameExperimentConfig {
  return isJunConfig(value) || isImperialTrackConfig(value) || isDingCostConfig(value)
    || isRuTriggerConfig(value) || isJunWoodConfig(value) || isR5WorkerConfig(value)
    || isExhibitionConfig(value) || isTechniqueGrantConfig(value);
}

/** Active Exhibition capacity and Quality values. Shipped rules come from content. */
export function activeExhibitionRules(config: GameExperimentConfig | undefined): {
  capacityByProgress: readonly number[];
  qualityVp: Record<"standard" | "fine" | "masterpiece", number>;
} {
  if (config?.experimentId !== "exhibition-ab-001") {
    return {
      capacityByProgress: IMPERIAL_PROGRESS.exhibition.capacityByProgress,
      qualityVp: IMPERIAL_PROGRESS.exhibition.qualityVp,
    };
  }
  return { capacityByProgress: config.capacityByProgress, qualityVp: { ...config.qualityVp } };
}

/** Which player, if any, receives an extra Apprentice at the start of Round 5. */
export function round5ExtraWorkerFor(config: GameExperimentConfig | undefined): string | null {
  if (config?.experimentId !== "r5-worker-ab-001") return null;
  return config.experimentArm === "extra_worker" ? config.beneficiaryPlayerId : null;
}

/** Jun's active activation price in Wood. Shipped rules: JUN_ACTIVATION_WOOD. */
export function activeJunActivationWood(config: GameExperimentConfig | undefined): number {
  return config?.experimentId === "jun-wood-ab-001" ? config.junActivationWood : JUN_ACTIVATION_WOOD;
}

/** Coins charged alongside Jun's Wood. Zero under the shipped rules. */
export function activeJunActivationCoins(config: GameExperimentConfig | undefined): number {
  return config?.experimentId === "jun-wood-ab-001" ? config.junActivationCoins ?? 0 : 0;
}

/** Ru's active trigger and award. Shipped rules: a Masterpiece, worth RU_ORDER_VP. */
export function activeRuBonusRules(
  config: GameExperimentConfig | undefined,
): { minQuality: "fine" | "masterpiece"; vp: number } {
  if (config?.experimentId !== "ru-trigger-ab-001") {
    return { minQuality: RU_BONUS_QUALITY, vp: RU_ORDER_VP };
  }
  return { minQuality: config.ruMinQuality, vp: config.ruOrderVp };
}

export function junActivationCoinCost(config: GameExperimentConfig | undefined): 0 | 1 | 2 {
  return config?.experimentId === "jun-ab-001" ? config.junActivationCoinCost : 0;
}

export function activeImperialTrackRules(
  config: GameExperimentConfig | undefined,
): ActiveImperialTrackRules {
  if (config?.experimentId !== "imperial-track-ab-001") return officialImperialTrackRules();
  return {
    imperialOrderProgressMode: config.imperialOrderProgressMode,
    trackVp: config.imperialProgressTrackVp,
    apprenticeMilestoneSpaces: config.apprenticeMilestoneSpaces,
    presentationSpaces: config.presentationSpaces,
    exhibitionCapacityByProgress: Object.freeze([1, 1, 2, 2, 3, 3]),
    imperialSealEnabled: config.imperialSealEnabled,
    imperialSealVp: config.imperialSealVp,
  };
}

export function activeImperialOrderProgressReward(
  config: GameExperimentConfig | undefined,
  printedReward: 1 | 2 | 3,
): 1 | 2 | 3 {
  return activeImperialTrackRules(config).imperialOrderProgressMode === "all_two"
    ? 2
    : printedReward;
}

export function isImperialTrackExperiment(
  config: GameExperimentConfig | undefined,
): config is ImperialTrackExperimentConfig {
  return config?.experimentId === "imperial-track-ab-001";
}

/**
 * Does Ding's extra vessel pay its normal Clay cost? Shipped rules say yes; only the
 * `ding-cost-ab-001` `free` arm says no.
 */
export function dingExtraVesselIsFree(config: GameExperimentConfig | undefined): boolean {
  return config?.experimentId === "ding-cost-ab-001" && config.experimentArm === "free";
}
