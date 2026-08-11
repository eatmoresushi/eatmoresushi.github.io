import { SeededRandom } from "../game/index.ts";
import { evaluateDecisionOracle, stableActionKey, V5_ROLLOUT_CONFIGS } from "./decisionOracle.ts";
import type { DecisionOracleOptions } from "./decisionOracle.ts";
import { evaluateAction, strategyTags } from "./evaluator.ts";
import { longHorizonTechniqueValue } from "./lookaheadPolicy.ts";
import { buildPlayerPlan } from "./planning.ts";
import { forecastTechniqueAcquisition } from "./techniqueForecast.ts";
import type {
  AIAction,
  AIDecisionContext,
  AIPolicy,
  AIPolicyDecision,
  AIStrategyProfile,
  PlayerObservation,
  PlayerPlan,
  ScoredAIAction,
  V5RolloutConfig,
} from "./types.ts";

function withTechniqueHorizon(
  candidate: ScoredAIAction,
  observation: PlayerObservation,
  plan: PlayerPlan,
  profile: AIStrategyProfile,
): ScoredAIAction {
  let correction = 0;
  if (candidate.action.type === "GUILD_BUY_TECHNIQUE") {
    const workerKind = observation.game.phase.type === "work_guild"
      ? observation.game.players[observation.playerId]?.workers[observation.game.phase.workerId]?.kind ?? null
      : null;
    const strategic = longHorizonTechniqueValue(observation, plan, candidate.action.techniqueId, workerKind);
    const frozen = candidate.diagnostics.techniqueForecast?.netValue ?? -20;
    if (strategic > 0) correction = strategic - (frozen > 0 ? frozen : frozen - 25);
  } else if (candidate.action.type === "BEGIN_GUILD_ACTION") {
    const workerKind = observation.game.players[observation.playerId]?.workers[candidate.action.workerId]?.kind ?? null;
    const strategic = Math.max(...Object.values(observation.game.displays.techniques).flat().map((techniqueId) => (
      longHorizonTechniqueValue(observation, plan, techniqueId, workerKind)
    )), -20);
    const frozen = Math.max(...Object.values(observation.game.displays.techniques).flat().map((techniqueId) => (
      forecastTechniqueAcquisition(observation, profile, plan, techniqueId, workerKind).netValue
    )), -20);
    if (strategic > 0) correction = strategic - (frozen > 0 ? frozen : -18);
  }
  return correction === 0 ? candidate : { ...candidate, totalScore: candidate.totalScore + correction };
}

function withKilnHorizon(candidate: ScoredAIAction, observation: PlayerObservation): ScoredAIAction {
  const kilnId = observation.game.players[observation.playerId]?.kilnId;
  let correction = 0;
  if (kilnId === "RU" && candidate.action.type === "GLAZE_CERAMICS") {
    correction += candidate.action.selections.filter(({ glaze, decoration }) => (
      glaze === "celadon" && decoration === "plain"
    )).length * (observation.game.round <= 4 ? 0.9 : 0.25);
  }
  if (kilnId === "GU" && candidate.action.type === "COMPLETE_ORDER" && candidate.action.useGuanWaiver) {
    correction -= 0.35;
  }
  return correction === 0 ? candidate : { ...candidate, totalScore: candidate.totalScore + correction };
}

export function rankV5BaseCandidates(
  observation: PlayerObservation,
  legalActions: AIAction[],
  context: AIDecisionContext,
  profile: AIStrategyProfile,
): { plan: PlayerPlan; scored: ScoredAIAction[] } {
  const plan = buildPlayerPlan(observation, profile, context.assignedIntent ?? "Hybrid");
  const scored = legalActions.map((action) => withKilnHorizon(withTechniqueHorizon(
    evaluateAction(observation, action, context, profile, plan),
    observation,
    plan,
    profile,
  ), observation)).sort((left, right) => (
    right.totalScore - left.totalScore || stableActionKey(left.action).localeCompare(stableActionKey(right.action))
  ));
  return { plan, scored };
}

function safeCandidate(candidate: ScoredAIAction): boolean {
  const optional = candidate.diagnostics.optionalEffect;
  if (optional?.selected === true && optional.projectedNetValue <= 0) return false;
  const forecast = candidate.diagnostics.techniqueForecast;
  const oracleValue = candidate.diagnostics.oracle?.selectedRolloutMean;
  if (forecast !== null && forecast.netValue <= 0 && (oracleValue === undefined || oracleValue <= 0)) return false;
  return true;
}

export class RolloutAIPolicy implements AIPolicy {
  private readonly profile: AIStrategyProfile;
  private readonly rng: SeededRandom;
  private readonly config: V5RolloutConfig;
  private readonly oracleSeed: number;
  private readonly oracleOptions: DecisionOracleOptions;

  constructor(
    profile: AIStrategyProfile,
    rng: SeededRandom,
    config: V5RolloutConfig = V5_ROLLOUT_CONFIGS.fast,
    oracleSeed = 0x5005_0001,
    oracleOptions: DecisionOracleOptions = {},
  ) {
    this.profile = profile;
    this.rng = rng;
    this.config = {
      rootWidth: Math.max(1, Math.floor(config.rootWidth)),
      samplesPerAction: Math.max(1, Math.floor(config.samplesPerAction)),
      horizonDecisions: Math.max(1, Math.floor(config.horizonDecisions)),
      rolloutWeight: Math.max(0, config.rolloutWeight),
      baseScoreWeight: Math.max(0, config.baseScoreWeight),
      maxOracleActions: Math.max(1, Math.floor(config.maxOracleActions)),
      baseScoreConfidenceMargin: Math.max(0, config.baseScoreConfidenceMargin),
    };
    this.oracleSeed = oracleSeed >>> 0;
    this.oracleOptions = oracleOptions;
  }

  async chooseAction(
    observation: PlayerObservation,
    legalActions: AIAction[],
    context: AIDecisionContext,
  ): Promise<AIPolicyDecision> {
    const started = performance.now();
    if (legalActions.length === 0) throw new Error(`AI ${observation.playerId} received no legal actions`);
    const { plan, scored: base } = rankV5BaseCandidates(observation, legalActions, context, this.profile);
    const safeBase = base.filter(safeCandidate);
    const confident = safeBase.length < 2 || safeBase[0]!.totalScore - safeBase[1]!.totalScore >= this.config.baseScoreConfidenceMargin;
    const candidates = safeBase.slice(0, confident ? 1 : this.config.rootWidth);
    const evaluation = evaluateDecisionOracle(
      observation,
      candidates.length > 0 ? candidates : base,
      this.profile,
      this.config,
      this.oracleSeed + context.decisionIndex,
      this.oracleOptions,
    );
    const fallback = evaluation.diagnostic.fallbackReason !== null;
    const ranked = fallback
      ? (candidates.length > 0 ? candidates : base)
      : evaluation.estimates.flatMap((estimate) => {
        const candidate = base.find(({ action }) => stableActionKey(action) === stableActionKey(estimate.action));
        return candidate === undefined ? [] : [{
          ...candidate,
          totalScore: estimate.combinedScore,
          diagnostics: { ...candidate.diagnostics, oracle: evaluation.diagnostic },
        }];
      });
    const scored = [...ranked].sort((left, right) => right.totalScore - left.totalScore || stableActionKey(left.action).localeCompare(stableActionKey(right.action)));
    const explorationRate = Math.max(0, Math.min(1, context.explorationRate));
    const explored = scored.length > 1 && this.rng.nextUint32() / 0x1_0000_0000 < explorationRate;
    const safe = scored.filter((candidate) => safeCandidate(candidate) && candidate.totalScore >= (scored[0]?.totalScore ?? candidate.totalScore) - 2.5);
    const poolSize = Math.max(1, Math.min(3, safe.length));
    const chosen = explored ? safe[this.rng.nextInt(poolSize)] ?? scored[0] : scored[0];
    if (chosen === undefined) throw new Error("V005 oracle produced no candidate");
    const diagnostics = fallback
      ? { ...chosen.diagnostics, oracle: evaluation.diagnostic }
      : chosen.diagnostics;
    return {
      action: chosen.action,
      score: chosen.totalScore,
      factors: chosen.factors,
      alternatives: scored.slice(0, 3),
      explored,
      strategyTags: strategyTags(observation),
      plan,
      diagnostics,
      durationMs: performance.now() - started,
    };
  }
}
