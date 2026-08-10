import type {
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
  readonly presentationSpaces: readonly [number, number];
  readonly imperialSealEnabled: true;
  readonly imperialSealVp: 2 | 3;
}

export const OFFICIAL_IMPERIAL_TRACK_RULES = Object.freeze({
  imperialOrderProgressMode: "printed",
  trackVp: Object.freeze([0, 0, 2, 2, 4, 8]),
  apprenticeMilestoneSpaces: Object.freeze([1, 3]),
  presentationSpaces: Object.freeze([4, 5]),
  imperialSealEnabled: true,
  imperialSealVp: 2,
} satisfies ActiveImperialTrackRules);

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

export function isSupportedExperimentConfig(value: unknown): value is GameExperimentConfig {
  return isJunConfig(value) || isImperialTrackConfig(value);
}

export function junActivationCoinCost(config: GameExperimentConfig | undefined): 0 | 1 | 2 {
  return config?.experimentId === "jun-ab-001" ? config.junActivationCoinCost : 2;
}

export function activeImperialTrackRules(
  config: GameExperimentConfig | undefined,
): ActiveImperialTrackRules {
  if (config?.experimentId !== "imperial-track-ab-001") return OFFICIAL_IMPERIAL_TRACK_RULES;
  return {
    imperialOrderProgressMode: config.imperialOrderProgressMode,
    trackVp: config.imperialProgressTrackVp,
    apprenticeMilestoneSpaces: config.apprenticeMilestoneSpaces,
    presentationSpaces: config.presentationSpaces,
    imperialSealEnabled: config.imperialSealEnabled,
    imperialSealVp: config.imperialSealVp,
  };
}

export function activeImperialOrderProgressReward(
  config: GameExperimentConfig | undefined,
  printedReward: 1 | 2,
): 1 | 2 {
  return activeImperialTrackRules(config).imperialOrderProgressMode === "all_two"
    ? 2
    : printedReward;
}

export function isImperialTrackExperiment(
  config: GameExperimentConfig | undefined,
): config is ImperialTrackExperimentConfig {
  return config?.experimentId === "imperial-track-ab-001";
}
