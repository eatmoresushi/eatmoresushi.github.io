import { QUALITY_RANK, TECHNIQUE_DEFINITIONS } from "../game/index.ts";
import type { TechniqueId } from "../game/index.ts";
import { marginalResourceValue } from "./planning.ts";
import type {
  AIStrategyProfile,
  PlayerObservation,
  PlayerPlan,
  TechniqueAcquisitionForecast,
} from "./types.ts";

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function selectedAssignments(plan: PlayerPlan) {
  const selected = new Set([plan.primaryOrderId, ...plan.secondaryOrderIds]);
  return plan.orderFeasibilities.filter(({ orderId }) => selected.has(orderId)).flatMap(({ assignments }) => assignments);
}

export function techniquePurchaseCost(
  observation: PlayerObservation,
  techniqueId: TechniqueId,
  workerKind?: "shifu" | "apprentice" | null,
): number {
  const definition = TECHNIQUE_DEFINITIONS[techniqueId];
  if (definition === undefined) return 99;
  let resolvedKind = workerKind;
  if (resolvedKind === undefined && observation.game.phase.type === "work_guild") {
    resolvedKind = observation.game.players[observation.playerId]?.workers[observation.game.phase.workerId]?.kind ?? null;
  }
  return resolvedKind === "shifu" ? Math.max(0, definition.cost - 1) : definition.cost;
}

export function forecastTechniqueAcquisition(
  observation: PlayerObservation,
  profile: AIStrategyProfile,
  plan: PlayerPlan,
  techniqueId: TechniqueId,
  workerKind?: "shifu" | "apprentice" | null,
): TechniqueAcquisitionForecast {
  const player = observation.game.players[observation.playerId]!;
  const assignments = selectedAssignments(plan);
  const remainingRounds = 6 - observation.game.round;
  const remainingWindows = Math.max(0, remainingRounds);
  const pipelinePotential = plan.pipeline.glazed + plan.pipeline.loaded + assignments.filter((assignment) => assignment.currentStage === "missing" || assignment.currentStage === "shaped").length;
  const purchaseCoins = techniquePurchaseCost(observation, techniqueId, workerKind);
  const purchaseCost = purchaseCoins * marginalResourceValue(player.resources.coins, plan.resourceDemand.coins, 0);
  let expectedWindows = 0;
  let probability = 0;
  let beneficialUses = 0;
  let grossBenefit = 0;
  let activationCost = 0;
  let compatibility = 0;
  const reasons: string[] = [];

  const missing = assignments.filter((assignment) => assignment.currentStage === "missing");
  const shaped = assignments.filter((assignment) => assignment.currentStage === "shaped");
  switch (techniqueId) {
    case "T01": {
      const targets = missing.filter(({ shape }) => shape === "vase" || shape === "censer").length;
      expectedWindows = Math.min(remainingWindows, targets);
      probability = targets > 0 ? 0.9 : 0.05;
      beneficialUses = expectedWindows * probability;
      grossBenefit = beneficialUses * marginalResourceValue(player.resources.clay, plan.resourceDemand.clay);
      compatibility = targets;
      reasons.push(targets > 0 ? "planned_large_shapes" : "no_planned_large_shape");
      break;
    }
    case "T02": {
      const distinct = new Set(missing.map(({ shape }) => shape)).size;
      expectedWindows = Math.min(remainingWindows, Math.floor(missing.length / 2));
      probability = distinct >= 2 ? 0.8 : 0.05;
      beneficialUses = expectedWindows * probability;
      grossBenefit = beneficialUses * (
        2 * marginalResourceValue(player.resources.coins, plan.resourceDemand.coins, 0) +
        marginalResourceValue(player.resources.clay, plan.resourceDemand.clay)
      );
      compatibility = distinct >= 2 ? 1 : 0;
      reasons.push(distinct >= 2 ? "planned_shape_pair" : "no_different_shape_pair");
      break;
    }
    case "T03": {
      expectedWindows = Math.min(remainingWindows, missing.length);
      probability = plan.resourceDemand.claySafety > 0 && player.resources.coins > plan.resourceDemand.coins ? 0.7 : 0.1;
      beneficialUses = expectedWindows * probability;
      grossBenefit = beneficialUses * Math.max(0, marginalResourceValue(player.resources.clay, plan.resourceDemand.clay) - 0.5 * marginalResourceValue(player.resources.coins, plan.resourceDemand.coins, 0));
      compatibility = plan.resourceDemand.claySafety;
      reasons.push(probability > 0.5 ? "clay_short_coin_available" : "weak_substitution_need");
      break;
    }
    case "T04": {
      expectedWindows = Math.min(remainingWindows, missing.length);
      probability = missing.length > 0 ? 0.9 : 0.05;
      beneficialUses = expectedWindows * probability;
      grossBenefit = beneficialUses * (
        2.2 + marginalResourceValue(player.resources.coins, plan.resourceDemand.coins, 0)
      );
      compatibility = missing.length;
      reasons.push(missing.length > 0 ? "planned_order_shapes" : "no_missing_order_shape");
      break;
    }
    case "T05":
    case "T06": {
      const decoration = techniqueId === "T05" ? "carved" : "impressed";
      const targets = assignments.filter((assignment) => (assignment.currentStage === "missing" || assignment.currentStage === "shaped") && assignment.decoration === decoration).length;
      expectedWindows = Math.min(remainingWindows, targets);
      probability = targets > 0 ? 0.95 : 0.03;
      beneficialUses = expectedWindows * probability;
      grossBenefit = beneficialUses * 2 * marginalResourceValue(player.resources.coins, plan.resourceDemand.coins, 0);
      compatibility = targets;
      reasons.push(targets > 0 ? "planned_decoration_savings" : "no_matching_decoration");
      break;
    }
    case "T08": {
      const futureOrders = Math.max(0, 3 - player.orderHand.length) + player.completedOrders.length * 0.4;
      expectedWindows = Math.min(remainingWindows, futureOrders);
      probability = observation.game.round <= 3 ? 0.35 : 0.08;
      beneficialUses = expectedWindows * probability;
      grossBenefit = beneficialUses * 1.4;
      compatibility = futureOrders;
      reasons.push(observation.game.round <= 3 ? "future_order_acquisitions" : "late_order_filter");
      break;
    }
    case "T09": {
      expectedWindows = Math.min(remainingWindows, Math.max(0, pipelinePotential));
      probability = pipelinePotential > 0 ? 0.28 : 0;
      beneficialUses = Math.min(remainingWindows, expectedWindows * probability);
      grossBenefit = beneficialUses * 2.1;
      compatibility = pipelinePotential;
      reasons.push(pipelinePotential > 0 ? "future_loaded_portfolio" : "no_future_firing");
      break;
    }
    case "T10": {
      expectedWindows = Math.min(remainingWindows, Math.ceil(Math.max(0, pipelinePotential) / 2));
      probability = pipelinePotential > 0 ? 0.22 : 0;
      beneficialUses = expectedWindows * probability;
      grossBenefit = beneficialUses * 2.7;
      activationCost = beneficialUses * marginalResourceValue(player.resources.coins, plan.resourceDemand.coins, 0);
      compatibility = assignments.filter(({ minQuality }) => QUALITY_RANK[minQuality] >= QUALITY_RANK.fine).length;
      reasons.push(pipelinePotential > 0 ? "quality_salvage_windows" : "no_future_firing");
      break;
    }
    case "T11": {
      expectedWindows = Math.min(remainingWindows, Math.ceil(Math.max(0, pipelinePotential) / 2));
      probability = pipelinePotential >= 2 ? 0.18 : pipelinePotential === 1 ? 0.08 : 0;
      beneficialUses = expectedWindows * probability;
      grossBenefit = beneficialUses * (2.2 + assignments.filter(({ minQuality }) => QUALITY_RANK[minQuality] >= QUALITY_RANK.fine).length * 0.25);
      activationCost = beneficialUses * (
        marginalResourceValue(player.resources.coins, plan.resourceDemand.coins, 0) +
        marginalResourceValue(player.resources.wood, plan.resourceDemand.wood)
      );
      compatibility = pipelinePotential;
      reasons.push(probability > 0.1 ? "portfolio_threshold_chance" : "few_threshold_windows");
      break;
    }
    case "T12": {
      expectedWindows = Math.min(remainingWindows, Math.ceil(Math.max(0, pipelinePotential) / 2));
      probability = pipelinePotential > 0 ? 0.28 : 0;
      beneficialUses = expectedWindows * probability;
      grossBenefit = beneficialUses * (1.4 + pipelinePotential * 0.12);
      compatibility = pipelinePotential;
      reasons.push(pipelinePotential > 0 ? "private_fire_information" : "no_future_firing");
      break;
    }
    case "T13": {
      expectedWindows = Math.min(remainingWindows, Math.ceil(Math.max(0, pipelinePotential) / 2));
      probability = pipelinePotential >= 3 ? 0.34 : pipelinePotential >= 1 ? 0.16 : 0;
      beneficialUses = expectedWindows * probability;
      grossBenefit = beneficialUses * (
        marginalResourceValue(player.resources.clay, plan.resourceDemand.clay) +
        2 * marginalResourceValue(player.resources.coins, plan.resourceDemand.coins, 0)
      );
      compatibility = pipelinePotential;
      reasons.push(probability >= 0.2 ? "masterpiece_portfolio" : "masterpiece_unlikely");
      break;
    }
    case "T14": {
      const surplusEligible = Object.values(observation.game.ceramics).flatMap((ceramic) =>
        ceramic.ownerId === observation.playerId &&
        ceramic.stage === "finished" &&
        ceramic.quality !== "flawed" &&
        !assignments.some((assignment) => assignment.ceramicId === ceramic.id)
          ? [ceramic]
          : []);
      const currentSaleValue = surplusEligible.reduce((best, ceramic) => Math.max(
        best,
        ceramic.quality === "masterpiece" ? 7 : ceramic.quality === "fine" ? 4 : 2,
      ), 0);
      expectedWindows = Math.min(remainingWindows, surplusEligible.length + pipelinePotential * 0.12);
      probability = expectedWindows > 0 ? 0.55 : 0;
      beneficialUses = expectedWindows * probability;
      grossBenefit = beneficialUses * Math.max(2, currentSaleValue) * marginalResourceValue(player.resources.coins, plan.resourceDemand.coins, 0);
      compatibility = surplusEligible.length;
      reasons.push(surplusEligible.length > 0 ? "surplus_non_flawed_ceramic" : "no_unreserved_sale_ceramic");
      break;
    }
    case "T15": {
      const fineTargets = assignments.filter(({ minQuality }) => QUALITY_RANK[minQuality] >= QUALITY_RANK.fine).length;
      expectedWindows = Math.max(0, Math.min(remainingWindows - 1, Math.ceil(pipelinePotential / 2)));
      probability = expectedWindows > 0 && fineTargets > 0 ? 0.2 : 0;
      beneficialUses = expectedWindows * probability;
      grossBenefit = beneficialUses * 3.4;
      activationCost = beneficialUses * 2.7;
      compatibility = fineTargets;
      reasons.push(remainingRounds <= 1 ? "no_refire_time" : fineTargets > 0 ? "planned_quality_upgrade" : "no_fine_destination");
      break;
    }
    case "T16": {
      expectedWindows = Math.min(remainingWindows, Math.ceil(Math.max(0, pipelinePotential) / 2));
      probability = pipelinePotential > 0 ? 0.24 : 0;
      beneficialUses = expectedWindows * probability;
      grossBenefit = beneficialUses * (3 + assignments.filter(({ minQuality }) => QUALITY_RANK[minQuality] >= QUALITY_RANK.fine).length * 0.35);
      activationCost = beneficialUses * 2 * marginalResourceValue(player.resources.coins, plan.resourceDemand.coins, 0);
      compatibility = pipelinePotential;
      reasons.push(pipelinePotential > 0 ? "future_fire_protection" : "no_future_firing");
      break;
    }
  }

  // Every acquired Technique is worth 1 VP at final scoring in V1.0.9.
  grossBenefit += 1;
  reasons.push("printed_endgame_vp");
  probability = clamp(probability);
  const workerOpportunityCost = 1.6 + plan.conversionUrgency * (plan.pipeline.shaped + plan.pipeline.glazed) * 0.45;
  const intentAdjustment = plan.assignedIntent === "Technique-economy" ? 0.35 : 0;
  const learnedAdjustment = Math.max(-0.25, Math.min(0.25, (profile.techniqueValues[techniqueId] ?? 0) * 0.025));
  const netValue = grossBenefit - purchaseCost - activationCost - workerOpportunityCost + intentAdjustment + learnedAdjustment;
  if (netValue <= 0) reasons.push("non_positive_net_value");
  else reasons.push("positive_expected_use");
  return {
    techniqueId,
    remainingRounds,
    expectedWindows,
    opportunityProbability: probability,
    expectedBeneficialUses: beneficialUses,
    grossBenefit,
    purchaseCost,
    activationCost,
    workerOpportunityCost,
    netValue,
    planCompatibility: compatibility,
    reasonCodes: reasons,
  };
}
