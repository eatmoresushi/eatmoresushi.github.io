import { KILN_IDS, ORDER_DEFINITIONS, TECHNIQUE_DEFINITIONS } from "../game/index.ts";
import type { KilnId, PlayerCount } from "../game/index.ts";
import { AI_POLICY_V4_VERSION, AI_POLICY_V5_VERSION, AI_POLICY_V6_VERSION, AI_POLICY_VERSION } from "./types.ts";
import type { AIStrategyProfile, StrategyIntent, StrategyTag } from "./types.ts";

export interface StrategyLearningResult {
  playerId: string;
  won: boolean;
  finalScore: number;
  actionCounts: Record<string, number>;
  completedOrderIds: string[];
  uncompletedOrders: Array<{ orderId: string; acquisitionFeasibility: number; actionsInvested: number }>;
  acquiredTechniqueIds: string[];
  techniquePerformance: Array<{ techniqueId: string; opportunities: number; uses: number; contribution: number }>;
  traditionId: KilnId;
  assignedIntent: StrategyIntent;
  realizedTags: StrategyTag[];
  resourceRemainder: { clay: number; wood: number; coins: number };
  naturalMasterpieces: number;
  finalMasterpieces: number;
  flawedCeramics: number;
  firedCeramics: number;
  unusedFinishedCeramics: number;
}

const TAGS: readonly StrategyTag[] = [
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

const INTENTS: readonly StrategyIntent[] = [
  "Market",
  "Imperial",
  "Hybrid",
  "Quality-control",
  "Volume-multi",
  "Technique-economy",
];

export function learningPhase(gameSequence: number): "early" | "developing" | "mature" {
  if (gameSequence <= 10) return "early";
  if (gameSequence <= 30) return "developing";
  return "mature";
}

export function createInitialStrategyProfile(playerCount: PlayerCount): AIStrategyProfile {
  return {
    rulesVersion: "1.0.4",
    currentRulesVersion: "1.0.4",
    aiPolicyVersion: AI_POLICY_VERSION,
    playerCount,
    gamesLearned: 0,
    actionWeights: {},
    orderValues: Object.fromEntries(
      Object.values(ORDER_DEFINITIONS).map((order) => [
        order.id,
        order.vp + order.coins * 0.35 + (order.imperialProgressReward ?? 0) * 2.5,
      ]),
    ),
    techniqueValues: Object.fromEntries(
      Object.values(TECHNIQUE_DEFINITIONS).map((technique) => [
        technique.id,
        technique.cost === 2 ? 2.4 : 2.8,
      ]),
    ),
    traditionValues: Object.fromEntries(KILN_IDS.map((id) => [id, 0])) as Record<KilnId, number>,
    resourceValues: { clay: 0.72, wood: 0.78, coins: 0.62 },
    strategicPriors: Object.fromEntries(TAGS.map((tag) => [tag, 0])) as Record<StrategyTag, number>,
    intentPriors: Object.fromEntries(INTENTS.map((intent) => [intent, 0])) as Record<StrategyIntent, number>,
    qualityParameters: {
      masterpiece: 4.3,
      fine: 2.25,
      standard: 0.8,
      flawed: -3.4,
      riskTolerance: 0.15,
    },
    exploration: { early: 0.16, developing: 0.09, mature: 0.04 },
  };
}

/**
 * Selfplay-004 starts from the frozen V003 priors. Search improvements are kept
 * in the policy layer so a paired study changes one independent variable.
 */
export function createV4StrategyProfile(playerCount: PlayerCount): AIStrategyProfile {
  return {
    ...createInitialStrategyProfile(playerCount),
    aiPolicyVersion: AI_POLICY_V4_VERSION,
  };
}

/** V005 also starts from frozen V003 priors; its learned signal is decision-level. */
export function createV5StrategyProfile(playerCount: PlayerCount): AIStrategyProfile {
  return {
    ...createInitialStrategyProfile(playerCount),
    aiPolicyVersion: AI_POLICY_V5_VERSION,
  };
}

/** V006 changes only the public leaf-ranking target, not the frozen V003 priors. */
export function createV6StrategyProfile(playerCount: PlayerCount): AIStrategyProfile {
  return {
    ...createInitialStrategyProfile(playerCount),
    aiPolicyVersion: AI_POLICY_V6_VERSION,
  };
}

function boundedUpdate(current: number, signal: number, rate: number, bound: number): number {
  return Math.max(-bound, Math.min(bound, current + rate * signal));
}

/**
 * Updates one player-count profile only after a completed game. The runner never
 * applies the returned profile to decisions already made in that game.
 */
export function learnFromCompletedGame(
  profile: AIStrategyProfile,
  results: readonly StrategyLearningResult[],
): AIStrategyProfile {
  if (results.length !== profile.playerCount) return profile;
  const average = results.reduce((sum, result) => sum + result.finalScore, 0) / results.length;
  const next: AIStrategyProfile = structuredClone(profile);
  const rate = 0.014;

  for (const result of results) {
    const relative = (result.finalScore - average) / 12 + (result.won ? 0.3 : 0);
    const actionTotal = Math.max(1, Object.values(result.actionCounts).reduce((sum, value) => sum + value, 0));
    const absoluteEfficiency = result.finalScore / Math.max(6, actionTotal * 0.35)
      + result.completedOrderIds.length * 0.18
      + result.firedCeramics * 0.025
      - result.unusedFinishedCeramics * 0.12;
    const performance = Math.max(-1.5, Math.min(1.5, relative + (absoluteEfficiency - 0.5) * 0.28));
    for (const [type, count] of Object.entries(result.actionCounts)) {
      const current = next.actionWeights[type] ?? 0;
      next.actionWeights[type] = boundedUpdate(current, performance * (count / actionTotal), rate, 1.5);
    }
    for (const id of result.completedOrderIds) {
      next.orderValues[id] = boundedUpdate(next.orderValues[id] ?? 0, 0.45 + performance, rate * 2.2, 20);
    }
    for (const order of result.uncompletedOrders) {
      const waste = Math.min(1.5, order.acquisitionFeasibility * 0.6 + order.actionsInvested * 0.12);
      next.orderValues[order.orderId] = boundedUpdate(next.orderValues[order.orderId] ?? 0, -waste + performance * 0.15, rate * 2.2, 20);
    }
    for (const technique of result.techniquePerformance) {
      const useRate = technique.opportunities === 0 ? 0 : technique.uses / technique.opportunities;
      const signal = performance * 0.25 + useRate * 0.65 + technique.contribution * 0.1 - (technique.opportunities > 0 && technique.uses === 0 ? 0.45 : 0);
      next.techniqueValues[technique.techniqueId] = boundedUpdate(next.techniqueValues[technique.techniqueId] ?? 0, signal, rate * 2, 8);
    }
    next.traditionValues[result.traditionId] = boundedUpdate(
      next.traditionValues[result.traditionId],
      performance,
      rate,
      2,
    );
    next.intentPriors[result.assignedIntent] = boundedUpdate(
      next.intentPriors[result.assignedIntent],
      performance,
      rate,
      1.25,
    );
    for (const tag of result.realizedTags) {
      next.strategicPriors[tag] = boundedUpdate(next.strategicPriors[tag], performance, rate * 0.7, 1.25);
    }

    const resources = result.resourceRemainder;
    const clayWaste = Math.max(0, resources.clay - 3);
    const woodWaste = Math.max(0, resources.wood - 4);
    const coinVp = Math.min(2, Math.floor(resources.coins / 3));
    const coinWaste = Math.max(0, resources.coins - coinVp * 3);
    next.resourceValues.clay = boundedUpdate(next.resourceValues.clay, performance * 0.08 - clayWaste * 0.1, rate, 1.5);
    next.resourceValues.wood = boundedUpdate(next.resourceValues.wood, performance * 0.08 - woodWaste * 0.12, rate, 1.5);
    next.resourceValues.coins = boundedUpdate(next.resourceValues.coins, performance * 0.08 + coinVp * 0.12 - coinWaste * 0.04, rate, 1.5);
    const produced = result.finalMasterpieces + result.flawedCeramics;
    if (produced > 0) {
      const qualitySignal = (result.finalMasterpieces - result.flawedCeramics) / produced;
      next.qualityParameters.riskTolerance = boundedUpdate(
        next.qualityParameters.riskTolerance,
        performance * qualitySignal,
        rate,
        0.8,
      );
    }
  }

  next.gamesLearned += 1;
  return next;
}
