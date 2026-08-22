import {
  IMPERIAL_PROGRESS,
  ORDER_DEFINITIONS,
  SeededRandom,
  activeImperialTrackRules,
  applyAction,
  createPrivateFiringState,
  currentDecisionActor,
  submitWoodContribution,
} from "../game/index.ts";
import type {
  GameState,
  PlayerId,
  PrivateFiringState,
  Quality,
} from "../game/index.ts";
import { createPublicBeliefState, mixBeliefSeed, publicStateFingerprint } from "./beliefState.ts";
import { evaluateAction } from "./evaluator.ts";
import { getLegalAIActions } from "./legalActions.ts";
import { createPlayerObservation } from "./observation.ts";
import { buildPlayerPlan } from "./planning.ts";
import { createInitialStrategyProfile } from "./strategy.ts";
import type {
  AIAction,
  AIDecisionContext,
  AIStrategyProfile,
  DecisionOracleDiagnostic,
  OracleActionEstimate,
  PlayerObservation,
  ScoredAIAction,
  StrategyIntent,
  V5RolloutConfig,
} from "./types.ts";

export const V5_ROLLOUT_CONFIGS = {
  fast: {
    rootWidth: 2,
    samplesPerAction: 1,
    horizonDecisions: 1,
    rolloutWeight: 1.1,
    baseScoreWeight: 0.42,
    maxOracleActions: 2,
    baseScoreConfidenceMargin: 3,
  },
  standard: {
    rootWidth: 5,
    samplesPerAction: 2,
    horizonDecisions: 4,
    rolloutWeight: 1.25,
    baseScoreWeight: 0.38,
    maxOracleActions: 5,
    baseScoreConfidenceMargin: 2,
  },
  deep: {
    rootWidth: 6,
    samplesPerAction: 8,
    horizonDecisions: 8,
    rolloutWeight: 1,
    baseScoreWeight: 0,
    maxOracleActions: 6,
    baseScoreConfidenceMargin: 0,
  },
} as const satisfies Record<string, V5RolloutConfig>;

export interface DecisionOracleEvaluation {
  estimates: OracleActionEstimate[];
  diagnostic: DecisionOracleDiagnostic;
}

export type PublicLeafEvaluator = (
  state: GameState,
  privateState: PrivateFiringState,
  focalPlayerId: PlayerId,
  profile: AIStrategyProfile,
) => number;

export interface DecisionOracleOptions {
  leafEvaluator?: PublicLeafEvaluator;
  oracleVersion?: DecisionOracleDiagnostic["oracleVersion"];
  leafModelId?: string | null;
}

export interface PublicBeliefTrajectoryCheckpoint {
  kind: "short" | "one_round" | "two_rounds";
  decisionsApplied: number;
  state: GameState;
  privateState: PrivateFiringState;
}

export interface PublicBeliefTrajectory {
  checkpoints: PublicBeliefTrajectoryCheckpoint[];
  terminalState: GameState;
  terminalPrivateState: PrivateFiringState;
  decisionsApplied: number;
  completed: boolean;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function stableActionKey(action: AIAction): string {
  return JSON.stringify(action);
}

function nextActor(state: GameState): PlayerId | null {
  const phase = state.phase;
  if (phase.type === "firing_contributions") {
    return phase.eligiblePlayerIds.find((id) => !phase.submittedPlayerIds.includes(id)) ?? null;
  }
  if (phase.type === "presentation") {
    return phase.eligiblePlayerIds.find((id) => !phase.submittedPlayerIds.includes(id)) ?? null;
  }
  return currentDecisionActor(phase);
}

function inferredIntent(state: GameState, playerId: PlayerId): StrategyIntent {
  const player = state.players[playerId];
  if (player === undefined) return "Hybrid";
  const imperial = player.orderHand.filter((id) => id.startsWith("I")).length;
  const market = player.orderHand.length - imperial;
  if (imperial > market) return "Imperial";
  if (market > imperial) return "Market";
  if (player.techniques.length >= 2) return "Technique-economy";
  return "Hybrid";
}

function rolloutContext(
  state: GameState,
  playerId: PlayerId,
  decisionIndex: number,
): AIDecisionContext {
  return {
    gameSequence: 0,
    decisionIndex,
    learningPhase: "mature",
    assignedTradition: state.players[playerId]?.kilnId ?? "RU",
    assignedIntent: inferredIntent(state, playerId),
    explorationRate: 0,
    mode: "regression",
  };
}

function safeGreedyAction(
  state: GameState,
  privateState: PrivateFiringState,
  playerId: PlayerId,
  decisionIndex: number,
  profile: AIStrategyProfile,
): AIAction | null {
  const legal = getLegalAIActions(state, playerId, privateState);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0]!;
  const rolloutCandidates = legal.length <= 20
    ? legal
    : [...legal].sort((left, right) => stableActionKey(left).localeCompare(stableActionKey(right)))
      .reduce<AIAction[]>((selected, action) => {
        if (selected.filter(({ type }) => type === action.type).length < 2) selected.push(action);
        return selected;
      }, []);
  const observation = createPlayerObservation(state, playerId, privateState);
  const context = rolloutContext(state, playerId, decisionIndex);
  const plan = buildPlayerPlan(observation, profile, context.assignedIntent);
  const scored = rolloutCandidates.map((action) => evaluateAction(observation, action, context, profile, plan))
    .filter((candidate) => {
      const optional = candidate.diagnostics.optionalEffect;
      const technique = candidate.diagnostics.techniqueForecast;
      return !(optional?.selected === true && optional.projectedNetValue <= 0) &&
        !(technique !== null && technique.netValue <= 0);
    })
    .sort((left, right) => right.totalScore - left.totalScore || stableActionKey(left.action).localeCompare(stableActionKey(right.action)));
  return scored[0]?.action ?? legal[0]!;
}

function ensurePrivateWindow(state: GameState, privateState: PrivateFiringState): PrivateFiringState {
  if (state.phase.type === "firing_contributions" && privateState.windowId !== state.phase.windowId) {
    return createPrivateFiringState(state);
  }
  return privateState;
}

function applyRolloutAction(
  state: GameState,
  privateState: PrivateFiringState,
  actorId: PlayerId,
  action: AIAction,
  rng: SeededRandom,
): { ok: true; state: GameState; privateState: PrivateFiringState } | { ok: false } {
  if (action.type === "SUBMIT_WOOD_CONTRIBUTION") {
    const result = submitWoodContribution(
      state,
      privateState,
      actorId,
      action.card,
      rng,
    );
    return result.ok
      ? { ok: true, state: result.state, privateState: result.privateState }
      : { ok: false };
  }
  const result = applyAction(state, actorId, action, rng);
  return result.ok
    ? { ok: true, state: result.state, privateState }
    : { ok: false };
}

const QUALITY_VALUE: Record<Quality, number> = {
  flawed: -0.5,
  standard: 1,
  fine: 2.1,
  masterpiece: 3.4,
};

/** Public leaf evaluation. Hidden deck order never contributes directly. */
export function publicLeafValue(
  state: GameState,
  privateState: PrivateFiringState,
  focalPlayerId: PlayerId,
  profile: AIStrategyProfile,
): number {
  void privateState;
  void profile;
  const final = state.finalResult?.scores[focalPlayerId];
  if (final !== undefined) return final.total;
  const player = state.players[focalPlayerId];
  if (player === undefined) return -100;
  const rules = activeImperialTrackRules(state.experimentConfig);
  const progressVp = rules.trackVp[player.imperialProgress] ?? 0;
  const sealVp = state.imperialSealOwnerId === focalPlayerId ? rules.imperialSealVp : 0;
  const ceramics = Object.values(state.ceramics).filter(({ ownerId }) => ownerId === focalPlayerId);
  const pipelineValue = ceramics.reduce((sum, ceramic) => {
    switch (ceramic.stage) {
      case "shaped": return sum + 0.1;
      case "glazed": return sum + 0.45;
      case "loaded": return sum + 0.8;
      case "finished": return sum + QUALITY_VALUE[ceramic.quality];
      case "sold": return sum;
      case "delivered":
      case "presented": return sum;
    }
  }, 0);
  const coinValue = Math.min(2, Math.floor(player.resources.coins / 3)) + (player.resources.coins % 3) * 0.16;
  const resourceValue = player.resources.clay * 0.09 + player.resources.wood * 0.14;
  const remainingRounds = Math.max(1, 6 - state.round);
  const routeValue = player.orderHand.reduce((sum, orderId) => (
    sum + (ORDER_DEFINITIONS[orderId]?.vp ?? 0) * 0.035 * remainingRounds
  ), 0) - ceramics.reduce((sum, ceramic) => (
    sum + (ceramic.stage === "shaped" ? 0.22 : ceramic.stage === "glazed" ? 0.12 : 0)
  ), 0) / remainingRounds;
  const presentationPotential = ceramics.filter((ceramic): ceramic is Extract<typeof ceramic, { stage: "finished" }> => (
    ceramic.stage === "finished" && ceramic.quality !== "flawed"
  ))
    .slice(0, rules.exhibitionCapacityByProgress[player.imperialProgress])
    .reduce((sum, ceramic) => sum + (ceramic.quality === "flawed" ? 0 : IMPERIAL_PROGRESS.exhibition.qualityVp[ceramic.quality]), 0) * 0.35;
  return player.score.orderVp + player.score.kilnTraditionVp + progressVp + sealVp +
    pipelineValue + coinValue + resourceValue + routeValue + presentationPotential;
}

function singleRollout(
  observation: PlayerObservation,
  focalPlayerId: PlayerId,
  rootAction: AIAction,
  sampleSeed: number,
  sampleIndex: number,
  horizonDecisions: number,
  profile: AIStrategyProfile,
  leafEvaluator: PublicLeafEvaluator,
): { ok: true; delta: number } | { ok: false } {
  let state: GameState;
  try {
    state = createPublicBeliefState(observation, sampleSeed, sampleIndex);
  } catch {
    return { ok: false };
  }
  let privateState = createPrivateFiringState(state);
  privateState = ensurePrivateWindow(state, privateState);
  const initialValue = leafEvaluator(state, privateState, focalPlayerId, profile);
  const rng = new SeededRandom(mixBeliefSeed(sampleSeed, sampleIndex, 0x51f15e));
  const root = applyRolloutAction(state, privateState, focalPlayerId, rootAction, rng);
  if (!root.ok) return { ok: false };
  state = root.state;
  privateState = root.privateState;
  for (let decision = 1; decision <= horizonDecisions && state.phase.type !== "finished"; decision += 1) {
    privateState = ensurePrivateWindow(state, privateState);
    const actorId = nextActor(state);
    if (actorId === null) break;
    const action = safeGreedyAction(state, privateState, actorId, decision, profile);
    if (action === null) return { ok: false };
    const result = applyRolloutAction(state, privateState, actorId, action, rng);
    if (!result.ok) return { ok: false };
    state = result.state;
    privateState = result.privateState;
  }
  privateState = ensurePrivateWindow(state, privateState);
  return { ok: true, delta: leafEvaluator(state, privateState, focalPlayerId, profile) - initialValue };
}

/**
 * Generates a synthetic continuation from a public observation. The returned
 * states contain only hidden values sampled from that observation; no
 * authoritative hidden deck order is accepted by this API.
 */
export function simulatePublicBeliefTrajectory(
  observation: PlayerObservation,
  rootAction: AIAction,
  profile: AIStrategyProfile,
  seed: number,
  sampleIndex: number,
  maximumDecisions = 2_500,
): PublicBeliefTrajectory | null {
  let state: GameState;
  try {
    state = createPublicBeliefState(observation, seed, sampleIndex);
  } catch {
    return null;
  }
  let privateState = ensurePrivateWindow(state, createPrivateFiringState(state));
  const rng = new SeededRandom(mixBeliefSeed(seed, sampleIndex, 0x6006_1eaf));
  const root = applyRolloutAction(state, privateState, observation.playerId, rootAction, rng);
  if (!root.ok) return null;
  state = root.state;
  privateState = root.privateState;
  const initialRound = observation.game.round;
  const checkpoints: PublicBeliefTrajectoryCheckpoint[] = [];
  let capturedShort = false;
  let capturedOneRound = false;
  let capturedTwoRounds = false;
  let decisionsApplied = 0;

  const capture = (kind: PublicBeliefTrajectoryCheckpoint["kind"]): void => {
    checkpoints.push({
      kind,
      decisionsApplied,
      state: clone(state),
      privateState: clone(privateState),
    });
  };

  while (state.phase.type !== "finished" && decisionsApplied < maximumDecisions) {
    privateState = ensurePrivateWindow(state, privateState);
    const actorId = nextActor(state);
    if (actorId === null) return null;
    const action = safeGreedyAction(state, privateState, actorId, decisionsApplied + 1, profile);
    if (action === null) return null;
    const result = applyRolloutAction(state, privateState, actorId, action, rng);
    if (!result.ok) return null;
    state = result.state;
    privateState = result.privateState;
    decisionsApplied += 1;
    if (!capturedShort) {
      capture("short");
      capturedShort = true;
    }
    if (!capturedOneRound && (state.round >= initialRound + 1 || state.phase.type === "finished")) {
      capture("one_round");
      capturedOneRound = true;
    }
    if (!capturedTwoRounds && (state.round >= initialRound + 2 || state.phase.type === "finished")) {
      capture("two_rounds");
      capturedTwoRounds = true;
    }
  }

  if (!capturedShort) capture("short");
  if (!capturedOneRound) capture("one_round");
  if (!capturedTwoRounds) capture("two_rounds");
  privateState = ensurePrivateWindow(state, privateState);
  return {
    checkpoints,
    terminalState: state,
    terminalPrivateState: privateState,
    decisionsApplied,
    completed: state.phase.type === "finished",
  };
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? -100 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

export function oracleSupports(observation: PlayerObservation): boolean {
  return observation.game.phase.type !== "setup_kiln_selection" &&
    observation.game.phase.type !== "setup_starting_orders" &&
    observation.game.phase.type !== "firing_contributions";
}

export function evaluateDecisionOracle(
  observation: PlayerObservation,
  candidates: readonly ScoredAIAction[],
  profile: AIStrategyProfile,
  config: V5RolloutConfig,
  seed: number,
  options: DecisionOracleOptions = {},
): DecisionOracleEvaluation {
  const leafEvaluator = options.leafEvaluator ?? publicLeafValue;
  const fingerprint = publicStateFingerprint(observation);
  const selectedCandidates = candidates.slice(0, Math.max(1, Math.min(config.rootWidth, config.maxOracleActions)));
  const unsupported = !oracleSupports(observation);
  const single = selectedCandidates.length <= 1;
  const estimates = selectedCandidates.map((candidate): OracleActionEstimate => {
    const results = unsupported || single ? [] : Array.from({ length: config.samplesPerAction }, (_, sampleIndex) => (
      singleRollout(
        observation,
        observation.playerId,
        candidate.action,
        mixBeliefSeed(seed, Number.parseInt(fingerprint.slice(4), 16)),
        sampleIndex,
        config.horizonDecisions,
        profile,
        leafEvaluator,
      )
    ));
    const successful = results.flatMap((result) => result.ok ? [result.delta] : []);
    const rolloutMean = unsupported || single ? 0 : mean(successful);
    return {
      action: clone(candidate.action),
      baseScore: candidate.totalScore,
      rolloutMean,
      rolloutStandardDeviation: standardDeviation(successful),
      successfulSamples: successful.length,
      failedSamples: results.length - successful.length,
      combinedScore: config.baseScoreWeight * candidate.totalScore + config.rolloutWeight * rolloutMean,
    };
  }).sort((left, right) => right.combinedScore - left.combinedScore || stableActionKey(left.action).localeCompare(stableActionKey(right.action)));
  const successfulEstimates = estimates.filter(({ successfulSamples }) => successfulSamples > 0);
  const selected = estimates[0];
  const bestRollout = successfulEstimates.length === 0
    ? selected?.rolloutMean ?? 0
    : Math.max(...successfulEstimates.map(({ rolloutMean }) => rolloutMean));
  const fallbackReason: DecisionOracleDiagnostic["fallbackReason"] = unsupported
    ? "unsupported_phase"
    : single
      ? "single_legal_action"
      : successfulEstimates.length === 0
        ? "no_successful_rollout"
        : null;
  return {
    estimates,
    diagnostic: {
      oracleVersion: options.oracleVersion ?? "decision-oracle-001",
      leafModelId: options.leafModelId ?? null,
      publicStateFingerprint: fingerprint,
      beliefSamples: unsupported || single ? 0 : config.samplesPerAction,
      horizonDecisions: config.horizonDecisions,
      candidateCount: selectedCandidates.length,
      selectedActionKey: selected === undefined ? "" : stableActionKey(selected.action),
      selectedRolloutMean: selected?.rolloutMean ?? 0,
      predictedRegret: Math.max(0, bestRollout - (selected?.rolloutMean ?? 0)),
      estimates,
      fallbackReason,
    },
  };
}
