import { SeededRandom } from "../game/index.ts";
import { evaluateAction, strategyTags } from "./evaluator.ts";
import { buildPlayerPlan } from "./planning.ts";
import { createProductionV3Profile } from "./productionProfile.ts";
import { V114Policy } from "./v114Policy.ts";
import { assessDenial, V115_DENIAL_OFF } from "./v115Denial.ts";
import type { DenialAssessment, DenialWeights } from "./v115Denial.ts";
import { AI_POLICY_V115_VERSION } from "./types.ts";
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
  return JSON.stringify(action, Object.keys(action).sort());
}

/**
 * V1.1.5 shipped policy `rules-v1.1.5-order-001`.
 *
 * Two things live in this lineage, and only one of them is on:
 *
 * - **Order valuation** (on). `createV115Profile` sets `orderRetryHorizon`, which makes
 *   Order feasibility retry-aware instead of charging every requirement to a single
 *   simultaneous attempt. +8.75 pp win rate against frozen V003 over 600 matched pairs;
 *   all five precommitted gates passed. This is the change the version name refers to.
 * - **Denial modelling** (off by default). Kept for the experiment record; it failed its
 *   own gates. See docs/experiments/v115-denial-001.md.
 *
 * Deliberately additive: every action is scored by exactly the frozen V003 evaluator, so
 * V003 remains the control for every prior measurement.
 *
 * The selection logic below mirrors `HeuristicAIPolicy` -- same sort, same safety filter,
 * same exploration pool -- so that when the denial weight is zero this policy reproduces
 * V003's choices exactly. `reproducesBaseline()` in the tests holds us to that.
 */
export class V115Policy implements AIPolicy {
  private readonly profile: AIStrategyProfile;
  private readonly rng: SeededRandom;
  private readonly weights: DenialWeights;
  private readonly inner: V114Policy;
  private lastDenial: DenialAssessment | null = null;

  /**
   * Denial defaults to **off**. The term failed its precommitted gates (see
   * docs/experiments/v115-denial-001.md) and the shipped candidate was evaluated with it
   * zeroed, so the default must match what was measured. Callers opt in explicitly.
   */
  constructor(profile: AIStrategyProfile, rng: SeededRandom, weights: DenialWeights = V115_DENIAL_OFF) {
    this.profile = profile;
    this.rng = rng;
    this.weights = weights;
    // v1.1.4's Contribution-card decision is not superseded by anything measured here, so
    // it is kept rather than reimplemented. The Order horizon rides on the shared profile
    // and therefore applies through this path too.
    this.inner = new V114Policy(profile, rng);
  }

  private get denialEnabled(): boolean {
    return this.weights.lockout !== 0 || this.weights.contention !== 0;
  }

  /** Exposed for telemetry: the denial assessment behind the chosen action. */
  get denial(): DenialAssessment | null {
    return this.lastDenial;
  }

  async chooseAction(
    observation: PlayerObservation,
    legalActions: AIAction[],
    context: AIDecisionContext,
  ): Promise<AIPolicyDecision> {
    const started = performance.now();
    if (legalActions.length === 0) throw new Error(`AI ${observation.playerId} received no legal actions`);
    // Shipped configuration: denial off, so this is v1.1.4's play with the corrected Order
    // model. The denial branch below exists for the experiment record only.
    if (!this.denialEnabled) {
      this.lastDenial = null;
      return this.inner.chooseAction(observation, legalActions, context);
    }
    const plan = buildPlayerPlan(observation, this.profile, context.assignedIntent ?? "Hybrid");
    const denials = new Map<string, DenialAssessment>();
    const scored: ScoredAIAction[] = legalActions
      .map((action) => {
        const base = evaluateAction(observation, action, context, this.profile, plan);
        const denial = assessDenial(observation, action, this.weights);
        denials.set(stableActionKey(action), denial);
        if (denial.value === 0) return base;
        return {
          ...base,
          totalScore: base.totalScore + denial.value,
          factors: { ...base.factors, opponentDenial: denial.value },
        };
      })
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
    this.lastDenial = denials.get(stableActionKey(chosen.action)) ?? null;

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

export function createV115Profile(playerCount: 2 | 3 | 4): AIStrategyProfile {
  const profile = structuredClone(createProductionV3Profile(playerCount));
  profile.rulesVersion = "1.1.5";
  profile.currentRulesVersion = "1.1.5";
  profile.aiPolicyVersion = AI_POLICY_V115_VERSION;
  profile.gamesLearned = 0;
  profile.exploration = { early: 0, developing: 0, mature: 0 };
  // Three firing attempts per outstanding requirement, capped by rounds remaining. Measured
  // against realised play, this reproduces the calibration gap the frozen single-attempt
  // model leaves: 1.39x/1.93x on one- and two-ceramic Orders against the 1.37x/2.01x the
  // data asks for. See docs/experiments/v115-order-valuation-001.md.
  profile.orderRetryHorizon = 3;
  // Price the seat's own Kiln Tradition ability. See docs/experiments/v115-tradition-001.md.
  profile.traditionAwareness = true;
  return profile;
}
