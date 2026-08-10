import { SeededRandom } from "../game/index.ts";
import { evaluateAction, strategyTags } from "./evaluator.ts";
import { buildPlayerPlan } from "./planning.ts";
import type {
  AIAction,
  AIDecisionContext,
  AIPolicy,
  AIPolicyDecision,
  AIStrategyProfile,
  PlayerObservation,
  ScoredAIAction,
} from "./types.ts";

function stableActionKey(action: AIAction): string {
  return JSON.stringify(action);
}

export class HeuristicAIPolicy implements AIPolicy {
  private readonly profile: AIStrategyProfile;
  private readonly rng: SeededRandom;

  constructor(
    profile: AIStrategyProfile,
    rng: SeededRandom,
  ) {
    this.profile = profile;
    this.rng = rng;
  }

  async chooseAction(
    observation: PlayerObservation,
    legalActions: AIAction[],
    context: AIDecisionContext,
  ): Promise<AIPolicyDecision> {
    const started = performance.now();
    if (legalActions.length === 0) throw new Error(`AI ${observation.playerId} received no legal actions`);
    const plan = buildPlayerPlan(observation, this.profile, context.assignedIntent ?? "Hybrid");
    const scored: ScoredAIAction[] = legalActions
      .map((action) => evaluateAction(observation, action, context, this.profile, plan))
      .sort((left, right) => right.totalScore - left.totalScore || stableActionKey(left.action).localeCompare(stableActionKey(right.action)));
    const explorationRate = Math.max(0, Math.min(1, context.explorationRate));
    const explored = scored.length > 1 && this.rng.nextUint32() / 0x1_0000_0000 < explorationRate;
    const safe = scored.filter((candidate) => {
      const optional = candidate.diagnostics.optionalEffect;
      const forecast = candidate.diagnostics.techniqueForecast;
      if (optional?.selected === true && optional.projectedNetValue <= 0) return false;
      if (forecast !== null && forecast.netValue <= 0) return false;
      return candidate.totalScore >= (scored[0]?.totalScore ?? candidate.totalScore) - 4;
    });
    const explorationPoolSize = Math.max(1, Math.min(5, Math.ceil(safe.length * 0.12)));
    const chosen = explored ? safe[this.rng.nextInt(explorationPoolSize)] ?? scored[0] : scored[0];
    if (chosen === undefined) throw new Error("AI scoring produced no candidate");
    return {
      action: chosen.action,
      score: chosen.totalScore,
      factors: chosen.factors,
      alternatives: scored.slice(0, 3),
      explored,
      strategyTags: strategyTags(observation),
      plan,
      diagnostics: chosen.diagnostics,
      durationMs: performance.now() - started,
    };
  }
}
