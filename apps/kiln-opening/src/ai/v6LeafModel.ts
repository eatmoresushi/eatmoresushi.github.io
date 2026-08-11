import {
  ORDER_DEFINITIONS,
  createPrivateFiringState,
} from "../game/index.ts";
import type {
  GameState,
  PlayerCount,
  PlayerId,
  PrivateFiringState,
  Quality,
} from "../game/index.ts";
import type { PublicLeafEvaluator } from "./decisionOracle.ts";
import { createPlayerObservation } from "./observation.ts";
import type { AIStrategyProfile, PlayerObservation } from "./types.ts";

export const V6_LEAF_FEATURE_NAMES = [
  "round",
  "remaining_rounds",
  "own_immediate_vp",
  "relative_immediate_vp",
  "own_progress_vp",
  "relative_progress_vp",
  "owns_imperial_seal",
  "own_completed_orders",
  "relative_completed_orders",
  "own_completed_imperial_orders",
  "relative_completed_imperial_orders",
  "own_imperial_progress",
  "relative_imperial_progress",
  "own_hand_size",
  "own_hand_printed_vp",
  "own_coins",
  "relative_coins",
  "own_clay",
  "relative_clay",
  "own_wood",
  "relative_wood",
  "own_available_workers",
  "relative_available_workers",
  "own_unlocked_workers",
  "own_techniques",
  "relative_techniques",
  "own_shaped",
  "own_glazed",
  "own_loaded",
  "own_finished",
  "relative_pipeline_value",
  "own_finished_quality_value",
  "relative_finished_quality_value",
  "own_presented_quality_value",
  "relative_presented_quality_value",
  "own_delivered_count",
  "relative_delivered_count",
  "presentation_eligible",
  "is_first_player",
  "has_passed_work",
  "phase_work",
  "phase_firing",
  "phase_orders",
  "phase_presentation",
] as const;

export type V6LeafFeatureName = typeof V6_LEAF_FEATURE_NAMES[number];
export type V6LeafCheckpointKind = "short" | "one_round" | "two_rounds";

export interface V6RealizedOutcome {
  relativeVp: number;
  relativeCompletedOrders: number;
  winCredit: number;
  strandedPipeline: number;
  target: number;
}

export interface V6LeafTrainingExample {
  sourceGameId: string;
  playerCount: PlayerCount;
  publicStateFingerprint: string;
  groupId: string;
  candidateActionKey: string;
  sampleIndex: number;
  checkpoint: V6LeafCheckpointKind;
  decisionsToCheckpoint: number;
  features: number[];
  handcraftedValue: number;
  outcome: V6RealizedOutcome;
  target: number;
}

export interface V6LeafModel {
  schemaVersion: 1;
  modelVersion: "v006-leaf-linear-001";
  rulesVersion: "1.0.2";
  modelId: string;
  featureNames: V6LeafFeatureName[];
  featureMeans: number[];
  featureScales: number[];
  weights: number[];
  bias: number;
  ridgeLambda: number;
  training: {
    exampleCount: number;
    sourceGameCount: number;
    targetMean: number;
    targetStandardDeviation: number;
  };
}

export interface V6LeafValidationMetrics {
  examples: number;
  groups: number;
  rmse: number;
  mae: number;
  correlation: number;
  handcraftedCorrelation: number;
  bestActionAccuracy: number;
  handcraftedBestActionAccuracy: number;
  pairwiseAccuracy: number;
  handcraftedPairwiseAccuracy: number;
}

const QUALITY_VALUE: Record<Quality, number> = {
  flawed: -0.5,
  standard: 1,
  fine: 2.1,
  masterpiece: 3.4,
};

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: readonly number[], average = mean(values)): number {
  if (values.length < 2) return 1;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.max(1e-6, Math.sqrt(variance));
}

function averageOther(
  observation: PlayerObservation,
  measure: (playerId: PlayerId) => number,
): number {
  return mean(observation.game.playerOrder.filter((id) => id !== observation.playerId).map(measure));
}

function ceramicCounts(observation: PlayerObservation, playerId: PlayerId) {
  const ceramics = Object.values(observation.game.ceramics).filter(({ ownerId }) => ownerId === playerId);
  const count = (stage: string): number => ceramics.filter((ceramic) => ceramic.stage === stage).length;
  const quality = (stage: "finished" | "delivered" | "presented"): number => ceramics.reduce((sum, ceramic) => (
    ceramic.stage === stage ? sum + QUALITY_VALUE[ceramic.quality] : sum
  ), 0);
  return {
    shaped: count("shaped"),
    glazed: count("glazed"),
    loaded: count("loaded"),
    finished: count("finished"),
    delivered: count("delivered"),
    presented: count("presented"),
    finishedQuality: quality("finished"),
    presentedQuality: quality("presented"),
    pipelineValue: count("shaped") * 0.1 + count("glazed") * 0.45 + count("loaded") * 0.8 + quality("finished"),
  };
}

/** Extracts only public projection fields; authoritative deck arrays are not accepted. */
export function extractV6LeafFeatures(observation: PlayerObservation): number[] {
  const own = observation.game.players[observation.playerId];
  if (own === undefined) throw new Error(`Missing V006 focal player ${observation.playerId}`);
  const rules = observation.imperialTrackRules;
  const metric = (playerId: PlayerId) => {
    const player = observation.game.players[playerId];
    if (player === undefined) throw new Error(`Missing public player ${playerId}`);
    const ceramics = ceramicCounts(observation, playerId);
    const immediateVp = player.score.orderVp + player.score.kilnTraditionVp;
    const progressVp = rules.trackVp[player.imperialProgress] ?? 0;
    return {
      immediateVp,
      progressVp,
      completedOrders: player.completedOrders.length,
      completedImperialOrders: player.completedOrders.filter(({ orderId }) => orderId.startsWith("I")).length,
      progress: player.imperialProgress,
      coins: player.resources.coins,
      clay: player.resources.clay,
      wood: player.resources.wood,
      availableWorkers: Object.values(player.workers).filter(({ status }) => status === "available").length,
      unlockedWorkers: Object.values(player.workers).filter(({ status }) => status !== "locked").length,
      techniques: player.techniques.length,
      ceramics,
    };
  };
  const ownMetric = metric(observation.playerId);
  const relative = (selector: (value: ReturnType<typeof metric>) => number): number => (
    selector(ownMetric) - averageOther(observation, (id) => selector(metric(id)))
  );
  const handPrintedVp = own.orderHand.reduce((sum, orderId) => sum + (ORDER_DEFINITIONS[orderId]?.vp ?? 0), 0);
  const phase = observation.game.phase.type;
  const firing = phase.startsWith("firing_");
  const features = [
    observation.game.round,
    Math.max(0, 6 - observation.game.round),
    ownMetric.immediateVp,
    relative((value) => value.immediateVp),
    ownMetric.progressVp,
    relative((value) => value.progressVp),
    observation.game.imperialSealOwnerId === observation.playerId ? 1 : 0,
    ownMetric.completedOrders,
    relative((value) => value.completedOrders),
    ownMetric.completedImperialOrders,
    relative((value) => value.completedImperialOrders),
    ownMetric.progress,
    relative((value) => value.progress),
    own.orderHand.length,
    handPrintedVp,
    ownMetric.coins,
    relative((value) => value.coins),
    ownMetric.clay,
    relative((value) => value.clay),
    ownMetric.wood,
    relative((value) => value.wood),
    ownMetric.availableWorkers,
    relative((value) => value.availableWorkers),
    ownMetric.unlockedWorkers,
    ownMetric.techniques,
    relative((value) => value.techniques),
    ownMetric.ceramics.shaped,
    ownMetric.ceramics.glazed,
    ownMetric.ceramics.loaded,
    ownMetric.ceramics.finished,
    relative((value) => value.ceramics.pipelineValue),
    ownMetric.ceramics.finishedQuality,
    relative((value) => value.ceramics.finishedQuality),
    ownMetric.ceramics.presentedQuality,
    relative((value) => value.ceramics.presentedQuality),
    ownMetric.ceramics.delivered,
    relative((value) => value.ceramics.delivered),
    rules.presentationSpaces.includes(own.imperialProgress) ? 1 : 0,
    observation.game.firstPlayerId === observation.playerId ? 1 : 0,
    own.passedWorkPhase ? 1 : 0,
    phase === "work" || phase.startsWith("work_") ? 1 : 0,
    firing ? 1 : 0,
    phase === "orders" ? 1 : 0,
    phase === "presentation" ? 1 : 0,
  ];
  if (features.length !== V6_LEAF_FEATURE_NAMES.length) throw new Error("V006 feature schema mismatch");
  return features;
}

export function realizedV6Outcome(state: GameState, focalPlayerId: PlayerId): V6RealizedOutcome {
  if (state.phase.type !== "finished" || state.finalResult === null) {
    throw new Error("V006 realized outcome requires a finished game");
  }
  const focal = state.players[focalPlayerId];
  if (focal === undefined) throw new Error(`Missing V006 outcome player ${focalPlayerId}`);
  const opponents = state.playerOrder.filter((id) => id !== focalPlayerId);
  const opponentVp = mean(opponents.map((id) => state.finalResult?.scores[id]?.total ?? 0));
  const relativeVp = (state.finalResult.scores[focalPlayerId]?.total ?? 0) - opponentVp;
  const relativeCompletedOrders = focal.completedOrders.length - mean(opponents.map((id) => state.players[id]?.completedOrders.length ?? 0));
  const winCredit = state.finalResult.winnerIds.includes(focalPlayerId)
    ? 1 / Math.max(1, state.finalResult.winnerIds.length)
    : 0;
  const strandedPipeline = Object.values(state.ceramics).reduce((sum, ceramic) => {
    if (ceramic.ownerId !== focalPlayerId) return sum;
    if (ceramic.stage === "shaped") return sum + 0.25;
    if (ceramic.stage === "glazed") return sum + 0.5;
    if (ceramic.stage === "loaded") return sum + 0.75;
    if (ceramic.stage === "finished") return sum + 0.5;
    return sum;
  }, 0);
  const target = relativeVp + relativeCompletedOrders * 0.75 + winCredit * 2 - strandedPipeline * 0.25;
  return { relativeVp, relativeCompletedOrders, winCredit, strandedPipeline, target };
}

function solveLinearSystem(matrix: number[][], values: number[]): number[] {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index] ?? 0]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row]?.[column] ?? 0) > Math.abs(augmented[pivot]?.[column] ?? 0)) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot]!, augmented[column]!];
    const divisor = augmented[column]?.[column] ?? 0;
    if (Math.abs(divisor) < 1e-10) continue;
    for (let index = column; index <= size; index += 1) augmented[column]![index] = (augmented[column]?.[index] ?? 0) / divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row]?.[column] ?? 0;
      if (factor === 0) continue;
      for (let index = column; index <= size; index += 1) {
        augmented[row]![index] = (augmented[row]?.[index] ?? 0) - factor * (augmented[column]?.[index] ?? 0);
      }
    }
  }
  return augmented.map((row, index) => row?.[size] ?? (index === 0 ? mean(values) : 0));
}

function modelHash(values: readonly number[]): string {
  let hash = 0x811c9dc5;
  for (const character of JSON.stringify(values)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function fitV6LeafModel(examples: readonly V6LeafTrainingExample[], ridgeLambda = 10): V6LeafModel {
  if (examples.length === 0) throw new Error("Cannot fit V006 leaf model without examples");
  const width = V6_LEAF_FEATURE_NAMES.length;
  if (examples.some(({ features }) => features.length !== width)) throw new Error("Invalid V006 training feature width");
  const featureMeans = Array.from({ length: width }, (_, index) => mean(examples.map(({ features }) => features[index] ?? 0)));
  const featureScales = Array.from({ length: width }, (_, index) => standardDeviation(
    examples.map(({ features }) => features[index] ?? 0),
    featureMeans[index],
  ));
  const rows = examples.map(({ features }) => [1, ...features.map((value, index) => (
    (value - (featureMeans[index] ?? 0)) / (featureScales[index] ?? 1)
  ))]);
  const size = width + 1;
  const matrix = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
  const values = Array.from({ length: size }, () => 0);
  rows.forEach((row, rowIndex) => {
    const target = examples[rowIndex]?.target ?? 0;
    for (let left = 0; left < size; left += 1) {
      values[left] = (values[left] ?? 0) + (row[left] ?? 0) * target;
      for (let right = 0; right < size; right += 1) {
        matrix[left]![right] = (matrix[left]?.[right] ?? 0) + (row[left] ?? 0) * (row[right] ?? 0);
      }
    }
  });
  for (let index = 1; index < size; index += 1) matrix[index]![index] = (matrix[index]?.[index] ?? 0) + ridgeLambda;
  const solved = solveLinearSystem(matrix, values);
  const weights = solved.slice(1);
  const targets = examples.map(({ target }) => target);
  return {
    schemaVersion: 1,
    modelVersion: "v006-leaf-linear-001",
    rulesVersion: "1.0.2",
    modelId: `V006-LEAF-${modelHash([solved[0] ?? 0, ...weights])}`,
    featureNames: [...V6_LEAF_FEATURE_NAMES],
    featureMeans,
    featureScales,
    weights,
    bias: solved[0] ?? mean(targets),
    ridgeLambda,
    training: {
      exampleCount: examples.length,
      sourceGameCount: new Set(examples.map(({ sourceGameId }) => sourceGameId)).size,
      targetMean: mean(targets),
      targetStandardDeviation: standardDeviation(targets),
    },
  };
}

export function createNeutralV6LeafModel(): V6LeafModel {
  const width = V6_LEAF_FEATURE_NAMES.length;
  return {
    schemaVersion: 1,
    modelVersion: "v006-leaf-linear-001",
    rulesVersion: "1.0.2",
    modelId: "V006-LEAF-NEUTRAL",
    featureNames: [...V6_LEAF_FEATURE_NAMES],
    featureMeans: Array.from({ length: width }, () => 0),
    featureScales: Array.from({ length: width }, () => 1),
    weights: Array.from({ length: width }, () => 0),
    bias: 0,
    ridgeLambda: 0,
    training: { exampleCount: 0, sourceGameCount: 0, targetMean: 0, targetStandardDeviation: 1 },
  };
}

export function predictV6LeafValue(model: V6LeafModel, features: readonly number[]): number {
  if (model.rulesVersion !== "1.0.2" || features.length !== model.featureNames.length) {
    throw new Error("Incompatible V006 leaf model");
  }
  return model.bias + features.reduce((sum, value, index) => (
    sum + ((value - (model.featureMeans[index] ?? 0)) / (model.featureScales[index] ?? 1)) * (model.weights[index] ?? 0)
  ), 0);
}

function correlation(left: readonly number[], right: readonly number[]): number {
  if (left.length < 2 || left.length !== right.length) return 0;
  const leftMean = mean(left);
  const rightMean = mean(right);
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * ((right[index] ?? 0) - rightMean), 0);
  const denominator = Math.sqrt(
    left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0) *
    right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0),
  );
  return denominator <= 1e-9 ? 0 : numerator / denominator;
}

function rankingAccuracy(
  examples: readonly V6LeafTrainingExample[],
  score: (example: V6LeafTrainingExample) => number,
): { best: number; pairwise: number; groups: number } {
  const grouped = new Map<string, V6LeafTrainingExample[]>();
  for (const example of examples) grouped.set(example.groupId, [...grouped.get(example.groupId) ?? [], example]);
  let bestCorrect = 0;
  let pairCorrect = 0;
  let pairTotal = 0;
  for (const rows of grouped.values()) {
    const selected = [...rows].sort((left, right) => score(right) - score(left) || left.candidateActionKey.localeCompare(right.candidateActionKey))[0];
    const bestTarget = Math.max(...rows.map(({ target }) => target));
    if (selected !== undefined && selected.target >= bestTarget - 1e-9) bestCorrect += 1;
    for (let left = 0; left < rows.length; left += 1) {
      for (let right = left + 1; right < rows.length; right += 1) {
        const leftRow = rows[left]!;
        const rightRow = rows[right]!;
        if (Math.abs(leftRow.target - rightRow.target) < 1e-9) continue;
        pairTotal += 1;
        if (Math.sign(score(leftRow) - score(rightRow)) === Math.sign(leftRow.target - rightRow.target)) pairCorrect += 1;
      }
    }
  }
  return {
    best: grouped.size === 0 ? 0 : bestCorrect / grouped.size,
    pairwise: pairTotal === 0 ? 0 : pairCorrect / pairTotal,
    groups: grouped.size,
  };
}

export function validateV6LeafModel(
  model: V6LeafModel,
  examples: readonly V6LeafTrainingExample[],
): V6LeafValidationMetrics {
  const predicted = examples.map(({ features }) => predictV6LeafValue(model, features));
  const targets = examples.map(({ target }) => target);
  const handcrafted = examples.map(({ handcraftedValue }) => handcraftedValue);
  const learnedRanking = rankingAccuracy(examples, (example) => predictV6LeafValue(model, example.features));
  const handcraftedRanking = rankingAccuracy(examples, (example) => example.handcraftedValue);
  return {
    examples: examples.length,
    groups: learnedRanking.groups,
    rmse: Math.sqrt(mean(predicted.map((value, index) => (value - (targets[index] ?? 0)) ** 2))),
    mae: mean(predicted.map((value, index) => Math.abs(value - (targets[index] ?? 0)))),
    correlation: correlation(predicted, targets),
    handcraftedCorrelation: correlation(handcrafted, targets),
    bestActionAccuracy: learnedRanking.best,
    handcraftedBestActionAccuracy: handcraftedRanking.best,
    pairwiseAccuracy: learnedRanking.pairwise,
    handcraftedPairwiseAccuracy: handcraftedRanking.pairwise,
  };
}

export function createV6LeafEvaluator(model: V6LeafModel): PublicLeafEvaluator {
  return (
    state: GameState,
    privateState: PrivateFiringState,
    focalPlayerId: PlayerId,
    _profile: AIStrategyProfile,
  ): number => {
    const safePrivateState = state.phase.type === "firing_contributions"
      ? privateState
      : createPrivateFiringState(state);
    const observation = createPlayerObservation(state, focalPlayerId, safePrivateState);
    return predictV6LeafValue(model, extractV6LeafFeatures(observation));
  };
}
