import { KILN_IDS, ORDER_DEFINITIONS, TECHNIQUE_DEFINITIONS } from "../game/index.ts";
import type { KilnId, PlayerCount } from "../game/index.ts";
import { AI_POLICY_VERSION } from "./types.ts";
import type { AIStrategyProfile, StrategyIntent, StrategyTag } from "./types.ts";

const STRATEGY_TAGS: readonly StrategyTag[] = [
  "Market-heavy",
  "Imperial-heavy",
  "Hybrid",
  "Quality",
  "Volume",
  "Technique",
  "Firing-control",
  "Presentation",
  "Coin-economy",
];

const STRATEGY_INTENTS: readonly StrategyIntent[] = [
  "Market",
  "Imperial",
  "Hybrid",
  "Quality-control",
  "Volume-multi",
  "Technique-economy",
];

/** Frozen V003 production priors, interpreted by the current V1.0.9 engine. */
export function createProductionV3Profile(playerCount: PlayerCount): AIStrategyProfile {
  return {
    rulesVersion: "1.0.2",
    currentRulesVersion: "1.0.9",
    aiPolicyVersion: AI_POLICY_VERSION,
    playerCount,
    gamesLearned: 0,
    actionWeights: {},
    orderValues: Object.fromEntries(Object.values(ORDER_DEFINITIONS).map((order) => [
      order.id,
      order.vp + order.coins * 0.35 + (order.imperialProgressReward ?? 0) * 2.5,
    ])),
    techniqueValues: Object.fromEntries(Object.values(TECHNIQUE_DEFINITIONS).map((technique) => [
      technique.id,
      technique.cost === 2 ? 2.4 : 2.8,
    ])),
    traditionValues: Object.fromEntries(KILN_IDS.map((id) => [id, 0])) as Record<KilnId, number>,
    resourceValues: { clay: 0.72, wood: 0.78, coins: 0.62 },
    strategicPriors: Object.fromEntries(STRATEGY_TAGS.map((tag) => [tag, 0])) as Record<StrategyTag, number>,
    intentPriors: Object.fromEntries(STRATEGY_INTENTS.map((intent) => [intent, 0])) as Record<StrategyIntent, number>,
    qualityParameters: {
      masterpiece: 4.3,
      fine: 2.25,
      standard: 0.8,
      flawed: -3.4,
      riskTolerance: 0.15,
    },
    exploration: { early: 0, developing: 0, mature: 0 },
  };
}
