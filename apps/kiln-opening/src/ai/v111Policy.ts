import { SeededRandom } from "../game/index.ts";
import { HeuristicAIPolicy } from "./policy.ts";
import { createProductionV3Profile } from "./productionProfile.ts";
import { chooseV111WoodBid } from "./v111WoodPolicy.ts";
import type { V111WoodDecision } from "./v111WoodPolicy.ts";
import { AI_POLICY_V111_VERSION } from "./types.ts";
import type {
  AIAction,
  AIDecisionContext,
  AIPolicy,
  AIPolicyDecision,
  AIStrategyProfile,
  PlayerObservation,
} from "./types.ts";

/**
 * V1.1.1 candidate. It keeps frozen V003's play for every decision V1.1.1 left alone --
 * worker placement, Orders, Techniques, Glazes, zones -- and replaces the one decision
 * the version actually changed.
 *
 * This is a replacement rather than an anchored exception. The V1.0.4 population
 * lineages tried admitting narrow deviations from V003 and ended 84% byte-identical to
 * it, because an anchor that scores the deviation with the same evaluator cannot escape
 * the evaluator's priors. Here the Wood bid does not consult `evaluateAction` at all:
 * that function still carries a flat +2.2 bonus for bidding exactly 1, which was correct
 * under V1.0.9's band table and is now simply wrong.
 */
export class V111Policy implements AIPolicy {
  private readonly inner: HeuristicAIPolicy;
  private readonly profile: AIStrategyProfile;
  private lastWoodDecision: V111WoodDecision | null = null;

  constructor(profile: AIStrategyProfile, rng: SeededRandom) {
    this.profile = profile;
    this.inner = new HeuristicAIPolicy(profile, rng);
  }

  /** Exposed for telemetry: what the bid was, and what the old convention would have scored. */
  get woodDecision(): V111WoodDecision | null {
    return this.lastWoodDecision;
  }

  async chooseAction(
    observation: PlayerObservation,
    legalActions: AIAction[],
    context: AIDecisionContext,
  ): Promise<AIPolicyDecision> {
    const contributions = legalActions.filter(
      (action): action is Extract<AIAction, { type: "SUBMIT_WOOD_CONTRIBUTION" }> =>
        action.type === "SUBMIT_WOOD_CONTRIBUTION",
    );
    if (contributions.length === 0) {
      this.lastWoodDecision = null;
      return this.inner.chooseAction(observation, legalActions, context);
    }

    const started = performance.now();
    const affordable = Math.max(...contributions.map(({ amount }) => amount));
    const decision = chooseV111WoodBid(observation, this.profile, affordable);
    this.lastWoodDecision = decision;
    const chosen = contributions.find(({ amount }) => amount === decision.amount) ?? contributions[0]!;
    const fallback = await this.inner.chooseAction(observation, legalActions, context);
    return {
      ...fallback,
      action: chosen,
      score: decision.expectedValue,
      explored: chosen.amount !== 1,
      durationMs: performance.now() - started,
    };
  }
}

export function createV111Profile(playerCount: 2 | 3 | 4): AIStrategyProfile {
  const profile = structuredClone(createProductionV3Profile(playerCount));
  profile.rulesVersion = "1.1.1";
  profile.currentRulesVersion = "1.1.1";
  profile.aiPolicyVersion = AI_POLICY_V111_VERSION;
  profile.gamesLearned = 0;
  profile.exploration = { early: 0, developing: 0, mature: 0 };
  return profile;
}
