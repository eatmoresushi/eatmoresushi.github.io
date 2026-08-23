import {
  DECORATION_COSTS,
  GAME_CONFIG,
  IMPERIAL_PROGRESS,
  ORDER_DEFINITIONS,
  contributionHeatAdjustment,
  contributionWoodCost,
  QUALITY_RANK,
  SHAPE_COSTS,
  determineBaseHeat,
  kilnZoneModifier,
  preferredHeat,
  qualityFromDifference,
  isImperialOrder,
} from "../game/index.ts";
import type { CeramicState, FinishedCeramic, Quality } from "../game/index.ts";
import { actionOrderId, actionTechniqueId } from "./legalActions.ts";
import { fireExpectation } from "./observation.ts";
import { plannedOrderCompatibility, projectSaggerCounterfactual } from "./counterfactuals.ts";
import {
  buildPlayerPlan,
  activeOrderProgressReward,
  evaluateOrderFeasibility,
  knownBlindOrderPool,
  marginalResourceValue,
  imperialProgressRuleDelta,
  orderPlanUtility,
  progressMoveValue,
  terminalPipelinePenalty,
} from "./planning.ts";
import { forecastTechniqueAcquisition } from "./techniqueForecast.ts";
import type {
  AIAction,
  AIDecisionContext,
  AIStrategyProfile,
  EvaluationFactors,
  OrderFeasibility,
  PlannedCeramicAssignment,
  PlayerObservation,
  PlayerPlan,
  ScoredAIAction,
  AIDecisionDiagnostics,
  OptionalEffectDiagnostic,
  StrategyIntent,
  StrategyTag,
} from "./types.ts";

const EMPTY_DIAGNOSTICS = (): AIDecisionDiagnostics => ({
  optionalEffect: null,
  techniqueForecast: null,
  search: null,
  oracle: null,
});

const ZERO_FACTORS = (): EvaluationFactors => ({
  immediateVP: 0,
  futureVP: 0,
  resourceEfficiency: 0,
  imperialValue: 0,
  qualityValue: 0,
  blocking: 0,
  opponentDenial: 0,
  risk: 0,
  learned: 0,
  orderFeasibility: 0,
  planProgress: 0,
  conversionUrgency: 0,
  resourceDemand: 0,
  opportunityCost: 0,
});

function ownCeramics(observation: PlayerObservation): CeramicState[] {
  return Object.values(observation.game.ceramics).filter((ceramic) => ceramic.ownerId === observation.playerId);
}

function qualityValue(quality: Quality, profile: AIStrategyProfile): number {
  return profile.qualityParameters[quality];
}

function expectedQualityValue(
  observation: PlayerObservation,
  profile: AIStrategyProfile,
  glaze: Parameters<typeof preferredHeat>[0],
  zone: number,
  baseHeat: number,
): number {
  return fireExpectation(observation).reduce((sum, card) => {
    const difference = Math.abs(baseHeat + card.modifier + zone - preferredHeat(glaze));
    return sum + card.probability * qualityValue(qualityFromDifference(difference), profile);
  }, 0);
}

function primaryFeasibility(plan: PlayerPlan): OrderFeasibility | null {
  return plan.orderFeasibilities.find(({ orderId }) => orderId === plan.primaryOrderId) ?? null;
}

function plannedAssignments(plan: PlayerPlan): PlannedCeramicAssignment[] {
  const selected = new Set([plan.primaryOrderId, ...plan.secondaryOrderIds]);
  return plan.orderFeasibilities.filter(({ orderId }) => selected.has(orderId)).flatMap(({ assignments }) => assignments);
}

function intentBias(intent: StrategyIntent, kind: "market" | "imperial" | "quality" | "volume" | "technique"): number {
  if (intent === "Imperial" && kind === "imperial") return 3.2;
  if (intent === "Market" && kind === "market") return 1.2;
  if (intent === "Quality-control" && kind === "quality") return 1;
  if (intent === "Volume-multi" && kind === "volume") return 1;
  if (intent === "Technique-economy" && kind === "technique") return 1;
  if ((intent === "Market" && kind === "imperial") || (intent === "Imperial" && kind === "market")) return -0.5;
  return intent === "Hybrid" ? 0.25 : 0;
}

function actionWorkerKind(observation: PlayerObservation, action: AIAction): "shifu" | "apprentice" | null {
  return "workerId" in action && typeof action.workerId === "string"
    ? observation.game.players[observation.playerId]?.workers[action.workerId]?.kind ?? null
    : null;
}

function acquisitionScore(
  observation: PlayerObservation,
  profile: AIStrategyProfile,
  intent: StrategyIntent,
  orderId: string,
): { value: number; feasibility: OrderFeasibility } {
  const feasibility = evaluateOrderFeasibility(observation, orderId, profile.orderRetryHorizon, profile.traditionAwareness);
  const order = ORDER_DEFINITIONS[orderId];
  if (order === undefined) return { value: -20, feasibility };
  let value = orderPlanUtility(observation, feasibility, profile, intent)
    + (isImperialOrder(order.id) ? intentBias(intent, "imperial") : intentBias(intent, "market"))
    - (feasibility.feasible ? 0 : 4 + feasibility.actionDebt * 0.18)
    - (feasibility.earliestCompletionRound > 5 ? 8 : 0);
  if (isImperialOrder(order.id) && intent === "Imperial") {
    if (observation.game.round <= 2 && feasibility.feasible) {
      value += 7 + activeOrderProgressReward(observation, order.imperialProgressReward) * 1.5;
    }
    if (observation.game.round >= 4 && !feasibility.feasible) value -= 8;
  }
  if (intent === "Volume-multi") {
    value += order.ceramics.length > 1 && feasibility.feasible ? 5 : order.ceramics.length === 1 ? -2 : 0;
  }
  return { value, feasibility };
}

function terminalCeramicCost(observation: PlayerObservation, action: AIAction): number {
  if (observation.game.round < 5) return 0;
  switch (action.type) {
    case "FORM_CERAMICS": return action.shapes.length * 7;
    case "GLAZE_CERAMICS": return action.selections.length * 4;
    case "USE_KILN_YARD": return 0;
    default: return 0;
  }
}

function scoreOptionalQuality(
  observation: PlayerObservation,
  profile: AIStrategyProfile,
  ceramicId: string,
  afterQuality: Quality,
): number {
  const result = observation.game.firingContext?.ceramicResults[ceramicId];
  const before = result?.assignedQuality ?? (result === undefined ? null : qualityFromDifference(result.finalHeatDifference));
  return before === null ? 0 : qualityValue(afterQuality, profile) - qualityValue(before, profile);
}

function qualityDiagnostic(
  effectId: OptionalEffectDiagnostic["effectId"],
  observation: PlayerObservation,
  plan: PlayerPlan,
  ceramicId: string | null,
  before: Quality | null,
  after: Quality | null,
  grossBenefit: number,
  coinCost: number,
  woodCost: number,
  reasonCode: string,
  eligibleTargetIds?: string[],
  compatibilityBefore = 0,
  compatibilityAfter = 0,
  orderValueDelta = 0,
  opportunityCost = 0,
  selectedDelta: -1 | 1 | null = null,
): OptionalEffectDiagnostic {
  return {
    effectId,
    eligibleTargetIds: eligibleTargetIds ?? ownCeramics(observation).filter(({ stage }) => stage === "loaded").map(({ id }) => id),
    selected: ceramicId !== null,
    selectedTargetId: ceramicId,
    selectedDelta,
    naturalQuality: before,
    projectedQuality: after,
    qualityRankDelta: before === null || after === null ? 0 : QUALITY_RANK[after] - QUALITY_RANK[before],
    compatibleOrdersBefore: compatibilityBefore,
    compatibleOrdersAfter: compatibilityAfter,
    orderValueDelta,
    coinCost,
    woodCost,
    opportunityCost,
    grossBenefit,
    projectedNetValue: grossBenefit + orderValueDelta - coinCost - woodCost - opportunityCost,
    reasonCode,
  };
}

function junDiagnostic(
  observation: PlayerObservation,
  profile: AIStrategyProfile,
  plan: PlayerPlan,
  selectedCeramicId: string | null,
  selectedDelta: -1 | 1 | null,
): OptionalEffectDiagnostic {
  const player = observation.game.players[observation.playerId];
  // Jun pays Wood in v1.1.4, which competes directly with Contribution cards and every
  // Firing Technique. Pricing it in Coins would understate the real cost.
  const coinCost = JUN_ACTIVATION_WOOD * marginalResourceValue(
    player?.resources.wood ?? 0,
    plan.resourceDemand.wood,
    0,
  );
  const loaded = ownCeramics(observation).filter(
    (ceramic): ceramic is Extract<CeramicState, { stage: "loaded" }> => ceramic.stage === "loaded",
  );
  const candidates = loaded.flatMap((ceramic) => {
    const result = observation.game.firingContext?.ceramicResults[ceramic.id];
    if (result === undefined) return [];
    const before = qualityFromDifference(result.finalHeatDifference);
    return ([-1, 1] as const).map((delta) => {
      const after = qualityFromDifference(Math.abs(
        result.finalActualHeat + delta - preferredHeat(ceramic.glaze),
      ));
      const grossBenefit = qualityValue(after, profile) - qualityValue(before, profile);
      const compatibilityBefore = plannedOrderCompatibility(observation, plan, ceramic.id, before);
      const compatibilityAfter = plannedOrderCompatibility(observation, plan, ceramic.id, after);
      const orderValueDelta = compatibilityAfter.value - compatibilityBefore.value;
      return {
        ceramicId: ceramic.id,
        delta,
        before,
        after,
        grossBenefit,
        compatibilityBefore,
        compatibilityAfter,
        orderValueDelta,
        netValue: grossBenefit + orderValueDelta - coinCost,
      };
    });
  }).sort((left, right) => (
    right.netValue - left.netValue ||
    left.ceramicId.localeCompare(right.ceramicId) ||
    left.delta - right.delta
  ));
  const candidate = selectedCeramicId === null || selectedDelta === null
    ? candidates[0]
    : candidates.find(({ ceramicId, delta }) => ceramicId === selectedCeramicId && delta === selectedDelta);
  const eligibleTargetIds = [...new Set(candidates.map(({ ceramicId }) => ceramicId))];
  if (candidate === undefined) {
    return qualityDiagnostic(
      "jun", observation, plan, selectedCeramicId, null, null, 0, coinCost, 0,
      "no_beneficial_adjustment", eligibleTargetIds, 0, 0, 0, 0, selectedDelta,
    );
  }
  const selected = selectedCeramicId !== null && selectedDelta !== null;
  const reason = selected
    ? candidate.netValue > 0
      ? observation.junActivationCoinCost > 0 ? "benefit_exceeds_activation_cost" : "quality_or_order_improves"
      : "benefit_not_worth_activation_cost"
    : candidate.netValue > 0
      ? "declined_positive_adjustment"
      : observation.junActivationCoinCost > 0
        ? "declined_below_activation_cost"
        : "declined_no_beneficial_adjustment";
  return qualityDiagnostic(
    "jun",
    observation,
    plan,
    selected ? candidate.ceramicId : null,
    candidate.before,
    candidate.after,
    candidate.grossBenefit,
    coinCost,
    0,
    reason,
    eligibleTargetIds,
    candidate.compatibilityBefore.compatibleOrders,
    candidate.compatibilityAfter.compatibleOrders,
    candidate.orderValueDelta,
    0,
    selected ? candidate.delta : null,
  );
}

function saggerDiagnostic(
  observation: PlayerObservation,
  profile: AIStrategyProfile,
  plan: PlayerPlan,
  selectedCeramicId: string | null,
): OptionalEffectDiagnostic {
  const candidates = ownCeramics(observation)
    .filter((ceramic): ceramic is Extract<CeramicState, { stage: "loaded" }> => ceramic.stage === "loaded")
    .flatMap((ceramic) => {
      const projected = projectSaggerCounterfactual(observation, plan, ceramic.id);
      if (projected === null) return [];
      const qualityGain = qualityValue(projected.zeroFireQuality, profile) - qualityValue(projected.naturalQuality, profile);
      const coinCost = 2 * marginalResourceValue(observation.game.players[observation.playerId]!.resources.coins, plan.resourceDemand.coins, 0);
      const net = qualityGain + projected.orderValueDelta - coinCost;
      return [{ projected, qualityGain, coinCost, net }];
    })
    .sort((left, right) => right.net - left.net || left.projected.ceramicId.localeCompare(right.projected.ceramicId));
  const selected = selectedCeramicId === null
    ? candidates[0]
    : candidates.find(({ projected }) => projected.ceramicId === selectedCeramicId);
  if (selected === undefined) return qualityDiagnostic(
    "sagger_selection", observation, plan, selectedCeramicId, null, null, 0, 0, 0, "no_counterfactual", candidates.map(({ projected }) => projected.ceramicId),
  );
  const reason = selected.net <= 0
    ? selected.projected.qualityRankDelta < 0 ? "zero_fire_downgrades" : selected.projected.qualityRankDelta === 0 ? "unchanged_not_worth_cost" : "benefit_below_full_cost"
    : "positive_counterfactual_value";
  return qualityDiagnostic(
    "sagger_selection",
    observation,
    plan,
    selectedCeramicId,
    selected.projected.naturalQuality,
    selected.projected.zeroFireQuality,
    selected.qualityGain,
    selected.coinCost,
    0,
    reason,
    candidates.map(({ projected }) => projected.ceramicId),
    selected.projected.compatibilityBefore.compatibleOrders,
    selected.projected.compatibilityAfter.compatibleOrders,
    selected.projected.orderValueDelta,
  );
}

function geDiagnostic(
  observation: PlayerObservation,
  profile: AIStrategyProfile,
  plan: PlayerPlan,
  selectedCeramicId: string | null,
): OptionalEffectDiagnostic {
  const eligible = ownCeramics(observation).filter((ceramic): ceramic is Extract<CeramicState, { stage: "loaded" }> => {
    if (ceramic.stage !== "loaded") return false;
    const result = observation.game.firingContext?.ceramicResults[ceramic.id];
    // v1.1.4 widened Ge to a Heat Difference of 1 or 2. From 2 the jump is Standard to
    // Masterpiece, a larger prize than the Fine-to-Masterpiece case, which matters because
    // the forced Crackle has to be worth paying for.
    return result !== undefined && (result.finalHeatDifference === 1 || result.finalHeatDifference === 2);
  });
  const evaluated = eligible.map((ceramic) => {
    const difference = observation.game.firingContext?.ceramicResults[ceramic.id]?.finalHeatDifference ?? 1;
    const currentQuality = qualityFromDifference(difference);
    const before = plannedOrderCompatibility(observation, plan, ceramic.id, currentQuality, ceramic.decoration);
    const after = plannedOrderCompatibility(observation, plan, ceramic.id, "masterpiece", "crackle");
    const qualityGain = qualityValue("masterpiece", profile) - qualityValue(currentQuality, profile);
    return { ceramic, currentQuality, before, after, qualityGain, orderDelta: after.value - before.value, net: qualityGain + after.value - before.value };
  }).sort((left, right) => right.net - left.net || left.ceramic.id.localeCompare(right.ceramic.id));
  const selected = selectedCeramicId === null ? evaluated[0] : evaluated.find(({ ceramic }) => ceramic.id === selectedCeramicId);
  if (selected === undefined) return qualityDiagnostic("ge", observation, plan, selectedCeramicId, null, null, 0, 0, 0, "no_eligible_target", eligible.map(({ id }) => id));
  return qualityDiagnostic(
    "ge", observation, plan, selectedCeramicId, selected.currentQuality, "masterpiece", selected.qualityGain, 0, 0,
    selected.net <= 0 ? "forced_crackle_breaks_plan" : selected.orderDelta < 0 ? "quality_outweighs_order_loss" : "quality_and_order_compatible",
    eligible.map(({ id }) => id), selected.before.compatibleOrders, selected.after.compatibleOrders, selected.orderDelta,
  );
}

function scoreAction(
  observation: PlayerObservation,
  action: AIAction,
  context: AIDecisionContext,
  profile: AIStrategyProfile,
  plan: PlayerPlan,
  factors: EvaluationFactors,
  diagnostics: AIDecisionDiagnostics,
): void {
  const player = observation.game.players[observation.playerId];
  if (player === undefined) return;
  const ceramics = ownCeramics(observation);
  const assignments = plannedAssignments(plan);
  const intent = context.assignedIntent ?? plan.assignedIntent;
  const primary = primaryFeasibility(plan);

  switch (action.type) {
    case "SELECT_KILN":
      factors.futureVP += action.kilnId === context.assignedTradition ? 1_000 : -1_000;
      factors.learned += profile.traditionValues[action.kilnId];
      return;
    case "SUBMIT_STARTING_ORDERS":
      factors.orderFeasibility += action.orderIds.reduce(
        (sum, orderId) => sum + acquisitionScore(observation, profile, intent, orderId).value,
        0,
      );
      return;
    case "KEEP_STARTING_ORDER": {
      const orderId = observation.game.phase.type === "setup_starting_orders"
        ? observation.game.phase.initialOrderIds?.[observation.playerId] ?? observation.game.phase.offeredOrderIds[observation.playerId]?.[0]
        : undefined;
      if (orderId !== undefined) {
        const acquisition = acquisitionScore(observation, profile, intent, orderId);
        factors.orderFeasibility += acquisition.value;
      }
      return;
    }
    case "REDRAW_STARTING_ORDER": {
      const orderId = observation.game.phase.type === "setup_starting_orders"
        ? observation.game.phase.initialOrderIds?.[observation.playerId] ?? observation.game.phase.offeredOrderIds[observation.playerId]?.[0]
        : undefined;
      if (orderId !== undefined) {
        const current = acquisitionScore(observation, profile, intent, orderId);
        const marketPool = knownBlindOrderPool(observation, "market");
        const expected = marketPool.length === 0 ? 0 : marketPool.reduce(
          (sum, id) => sum + acquisitionScore(observation, profile, intent, id).value,
          0,
        ) / marketPool.length;
        factors.orderFeasibility += expected - current.value - 0.4;
      }
      return;
    }
    case "PASS_WORK_PHASE": {
      const available = Object.values(player.workers).filter((worker) => worker.status === "available").length;
      const workable = assignments.some((assignment) => assignment.currentStage === "missing" || assignment.currentStage === "shaped" || assignment.currentStage === "glazed");
      factors.opportunityCost -= available * (primary?.actionDebt ?? 0) > 0
        ? available * (workable ? 3 : 0.35)
        : available * 1.2;
      if (available === 0) factors.resourceEfficiency += 2;
      return;
    }
    case "GAIN_MATERIALS": {
      const clayBase = player.resources.clay;
      const woodBase = player.resources.wood;
      for (let index = 0; index < action.clay; index += 1) {
        factors.resourceDemand += marginalResourceValue(clayBase + index, plan.resourceDemand.clay);
      }
      for (let index = 0; index < action.wood; index += 1) {
        factors.resourceDemand += marginalResourceValue(woodBase + index, plan.resourceDemand.wood);
      }
      if (action.exchange !== undefined) {
        const giveDemand = action.exchange.give === "clay" ? plan.resourceDemand.clay : plan.resourceDemand.wood;
        const receiveDemand = action.exchange.give === "clay" ? plan.resourceDemand.wood : plan.resourceDemand.clay;
        const giveBase = action.exchange.give === "clay" ? clayBase + action.clay : woodBase + action.wood;
        const receiveBase = action.exchange.give === "clay" ? woodBase + action.wood : clayBase + action.clay;
        for (let index = 0; index < action.exchange.amount; index += 1) {
          factors.resourceDemand -= marginalResourceValue(giveBase - index, giveDemand);
          factors.resourceDemand += marginalResourceValue(receiveBase + index, receiveDemand);
        }
      }
      factors.opportunityCost -= Math.max(0, clayBase + action.clay - plan.resourceDemand.clay - 2) * 1.25;
      factors.opportunityCost -= Math.max(0, woodBase + action.wood - plan.resourceDemand.wood - 2) * 1.7;
      return;
    }
    case "FORM_CERAMICS": {
      const needed = assignments.filter((assignment) => assignment.currentStage === "missing");
      const remaining = [...needed];
      const workerKind = actionWorkerKind(observation, action);
      let formingClayCost = 0;
      for (const shape of action.shapes) {
        const index = remaining.findIndex((assignment) => assignment.shape === shape);
        if (index >= 0) {
          factors.planProgress += 6.2;
          remaining.splice(index, 1);
        } else {
          factors.futureVP += plan.terminalForecast.shouldStartSpeculativeCeramic
            ? 1.2 + intentBias(intent, "volume")
            : observation.game.round >= 4
              ? -10
              : -5;
        }
        formingClayCost += workerKind === "shifu" && (shape === "vase" || shape === "censer")
          ? 1
          : SHAPE_COSTS[shape];
      }
      // Ding's extra vessel is free under the current rules, so nothing is charged for it
      // here. If the engine ever charges for it again, this must charge too: while the two
      // disagreed, the agent took a vessel it believed free and paid for it unbudgeted,
      // which understated Ding by about half a point in measurement.
      const substitutions = action.claySubstitutions ?? (action.claySubstitutionTarget === undefined ? 0 : 1);
      factors.resourceEfficiency -= (formingClayCost - substitutions) * marginalResourceValue(
        player.resources.clay,
        plan.resourceDemand.clay,
      ) * 0.25;
      factors.resourceEfficiency -= substitutions * marginalResourceValue(
        player.resources.coins,
        plan.resourceDemand.coins,
        0,
      ) * 0.25;
      if (action.dingExtraShape !== undefined) {
        const useful = needed.some((assignment) => assignment.shape === action.dingExtraShape);
        factors.planProgress += useful ? 5.5 : -4;
      }
      factors.conversionUrgency -= plan.conversionUrgency * (plan.pipeline.shaped + plan.pipeline.glazed) * 0.35;
      factors.opportunityCost -= terminalCeramicCost(observation, action);
      if (action.useTechniqueIds?.includes("T01")) {
        factors.resourceDemand += marginalResourceValue(player.resources.clay, plan.resourceDemand.clay);
      }
      if (action.useTechniqueIds?.includes("T02")) {
        factors.resourceDemand += marginalResourceValue(player.resources.clay, plan.resourceDemand.clay)
          + 2 * marginalResourceValue(player.resources.coins, plan.resourceDemand.coins, 0);
      }
      if (action.dryingFrames !== undefined) factors.planProgress += 3.5;
      return;
    }
    case "GLAZE_CERAMICS": {
      const freeDecorationCeramicId = action.freeDecorationCeramicId ??
        (action.shifuMode === "free_single" ? action.selections[0]?.ceramicId : undefined);
      let totalDecorationCost = action.selections.reduce((sum, selection) => (
        sum + (selection.ceramicId === freeDecorationCeramicId ? 0 : DECORATION_COSTS[selection.decoration])
      ), 0);
      if (action.useTechniqueIds?.includes("T05")) totalDecorationCost -= DECORATION_COSTS.carved;
      if (action.useTechniqueIds?.includes("T06")) totalDecorationCost -= DECORATION_COSTS.impressed;
      factors.resourceEfficiency -= Math.max(0, totalDecorationCost) * 0.2;
      for (const selection of action.selections) {
        const planned = assignments.find((assignment) => assignment.ceramicId === selection.ceramicId);
        if (planned === undefined) factors.planProgress += plan.terminalForecast.presentationCapacity > 0
          ? 0.5
          : observation.game.round >= 4 ? -8 : -2.5;
        else if (planned.glaze === selection.glaze && planned.decoration === selection.decoration) factors.planProgress += 7.2;
        else factors.planProgress -= 5;
        factors.qualityValue += expectedQualityValue(observation, profile, selection.glaze, 0, 2) * 0.22;
      }
      factors.conversionUrgency += action.selections.length * plan.conversionUrgency * 2.4;
      factors.opportunityCost -= terminalCeramicCost(observation, action);
      return;
    }
    case "USE_KILN_YARD": {
      for (const load of action.loads) {
        const ceramic = observation.game.ceramics[load.ceramicId];
        const planned = assignments.find((assignment) => assignment.ceramicId === load.ceramicId);
        factors.planProgress += planned === undefined
          ? plan.terminalForecast.presentationCapacity > 0 && plan.terminalForecast.surplusCeramics === 0 ? 0.5 : observation.game.round >= 4 ? -10 : -4
          : 6.5;
        if (ceramic?.stage === "glazed") {
          factors.qualityValue += expectedQualityValue(
            observation,
            profile,
            ceramic.glaze,
            kilnZoneModifier(load.kilnSpaceId),
            2,
          );
        }
      }
      factors.conversionUrgency += action.loads.length * (2.5 + plan.conversionUrgency * 2.8);
      for (let index = 0; index < action.loads.length; index += 1) {
        factors.resourceDemand += marginalResourceValue(player.resources.wood + index, plan.resourceDemand.wood);
      }
      return;
    }
    case "USE_LABOUR": {
      const amount = actionWorkerKind(observation, action) === "shifu" ? 4 : 2;
      let instrumental = 0;
      for (let index = 0; index < amount; index += 1) {
        instrumental += marginalResourceValue(player.resources.coins + index, plan.resourceDemand.coins, 0);
      }
      // Coins are not purely instrumental. Every 3 left at game end convert to 1 VP, up to
      // 5 VP, so a coin keeps a floor value even when there is nothing left to buy. Pricing
      // only the instrumental side put a surplus coin at 0.08 and, with the hoarding
      // penalty below, made Labour score about -3.8 in Round 5 -- so the agent passed
      // rather than turn an idle worker into guaranteed points.
      const terminal = terminalCoinVp(player.resources.coins + amount) - terminalCoinVp(player.resources.coins);
      factors.resourceDemand += Math.max(instrumental, terminal);
      // Hoarding is only wasteful once the conversion is capped out.
      if (terminal <= 0 && player.resources.coins >= plan.resourceDemand.coins + 1) {
        factors.opportunityCost -= 4;
      }
      return;
    }
    case "BEGIN_OFFICE_ORDERS": {
      const visible = [...observation.game.displays.market, ...observation.game.displays.imperial]
        .map((orderId) => acquisitionScore(observation, profile, intent, orderId).value)
        .sort((left, right) => right - left);
      const capacity = action.mode === "take_up_to_two" ? 2 : 1;
      factors.orderFeasibility += visible.slice(0, capacity).reduce((sum, value) => sum + Math.max(-2, value), 0) * 0.35;
      if (action.mode === "take_one_and_gain_two_coins") factors.resourceDemand += 2 * marginalResourceValue(player.resources.coins, plan.resourceDemand.coins, 0);
      factors.opportunityCost -= plan.conversionUrgency * (plan.pipeline.shaped + plan.pipeline.glazed) * 1.1;
      return;
    }
    case "OFFICE_TAKE_ORDER": {
      const acquisition = acquisitionScore(observation, profile, intent, action.orderId);
      factors.orderFeasibility += acquisition.value;
      return;
    }
    case "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER":
      factors.orderFeasibility += acquisitionScore(observation, profile, intent, action.orderId).value;
      return;
    case "OFFICE_USE_COLOUR_SAMPLES":
      factors.orderFeasibility += 0.5;
      return;
    case "OFFICE_DRAW_BLIND_ORDER": {
      const pool = knownBlindOrderPool(observation, action.deck);
      const expected = pool.length === 0 ? -8 : pool.reduce(
        (sum, orderId) => sum + acquisitionScore(observation, profile, intent, orderId).value,
        0,
      ) / pool.length;
      factors.orderFeasibility += expected * 0.75;
      factors.risk -= 0.8;
      if (action.deck === "imperial") {
        const visibleImperial = observation.game.displays.imperial.map((orderId) => acquisitionScore(observation, profile, intent, orderId));
        const hasViableFaceUp = visibleImperial.some(({ feasibility }) => feasibility.feasible);
        if (observation.game.round >= 4) factors.risk -= 9;
        else if (intent === "Imperial" && hasViableFaceUp) factors.risk -= 7;
        else if (intent === "Imperial" && observation.game.round <= 2) factors.imperialValue += 2;
      }
      return;
    }
    case "OFFICE_END_ORDERS":
      factors.opportunityCost += primary?.feasible === false ? 1.5 : 0;
      return;
    case "OFFICE_SKIP_COLOUR_SAMPLES":
    case "GUILD_SKIP_REFRESH":
      factors.resourceEfficiency += 0.05;
      return;
    case "OFFICE_RESOLVE_FLAWED_SALE":
      factors.resourceEfficiency += action.ceramicIds.length * 2.5;
      return;
    case "OFFICE_RESOLVE_CONNOISSEUR_NETWORK":
      if (action.ceramicId !== null) {
        const ceramic = observation.game.ceramics[action.ceramicId];
        const reserved = assignments.some((assignment) => assignment.ceramicId === action.ceramicId);
        const saleCoins = ceramic?.stage === "finished"
          ? ceramic.quality === "masterpiece" ? 7 : ceramic.quality === "fine" ? 4 : ceramic.quality === "standard" ? 2 : 0
          : 0;
        factors.resourceEfficiency += saleCoins * marginalResourceValue(player.resources.coins, plan.resourceDemand.coins, 0);
        factors.opportunityCost -= reserved ? 8 : 0;
      }
      return;
    case "USE_COURT_PATRONAGE": {
      const unlockValue = player.imperialProgress === 1 && observation.game.round < 5 ? 3.5 : 0;
      // How far one Court Patronage actually moves, and what the track actually pays for
      // it, both come from the active rules. Hard-coding either would leave the agent
      // blind to the imperial-economy arms and make the A/B measure its arithmetic.
      const nextProgress = Math.min(4, player.imperialProgress + 1);
      const capacityGain = observation.imperialTrackRules.exhibitionCapacityByProgress[nextProgress]! -
        observation.imperialTrackRules.exhibitionCapacityByProgress[player.imperialProgress]!;
      const exhibitionValue = capacityGain * (3 + Math.min(3, plan.pipeline.finished) * 1.5);
      // v1.1.4 removed the Progress 2 and 4 Coin stipends, so advancing pays only in
      // track VP, Apprentice unlocks and Exhibition capacity.
      const stipendValue = 0;
      const trackVpGain = observation.imperialTrackRules.trackVp[nextProgress]! -
        observation.imperialTrackRules.trackVp[player.imperialProgress]!;
      // Buying a step onto a 0 VP space is worth far less than buying one onto a 2 VP
      // space; this term was computed and then discarded.
      factors.imperialValue += trackVpGain;
      const deadEndPenalty = observation.game.round >= 5 && capacityGain === 0 && stipendValue === 0 && trackVpGain === 0
        ? -12
        : 0;
      factors.imperialValue += 3 + unlockValue + exhibitionValue + stipendValue + deadEndPenalty +
        intentBias(intent, "imperial") + imperialProgressRuleDelta(observation, 1);
      factors.resourceEfficiency -= 5 * marginalResourceValue(player.resources.coins, plan.resourceDemand.coins, 0);
      return;
    }
    case "BEGIN_GUILD_ACTION": {
      const workerKind = actionWorkerKind(observation, action);
      const forecasts = Object.values(observation.game.displays.techniques).flat().map((techniqueId) =>
        forecastTechniqueAcquisition(observation, profile, plan, techniqueId, workerKind));
      const best = forecasts.sort((left, right) => right.netValue - left.netValue)[0];
      factors.futureVP += best !== undefined && best.netValue > 0
        ? best.netValue + intentBias(intent, "technique")
        : -18;
      factors.opportunityCost -= plan.conversionUrgency * (plan.pipeline.shaped + plan.pipeline.glazed);
      return;
    }
    case "GUILD_REFRESH_TECHNIQUE": {
      const forecast = forecastTechniqueAcquisition(observation, profile, plan, action.techniqueId);
      factors.blocking += forecast.netValue <= 0 ? Math.min(4, -forecast.netValue * 0.5) : -forecast.netValue;
      return;
    }
    case "GUILD_BUY_TECHNIQUE": {
      const forecast = forecastTechniqueAcquisition(observation, profile, plan, action.techniqueId);
      diagnostics.techniqueForecast = forecast;
      factors.futureVP += forecast.netValue > 0 ? forecast.netValue + intentBias(intent, "technique") : forecast.netValue - 25;
      return;
    }
    case "RESOLVE_KILN_SETTING":
      if (action.ceramicId !== null && action.toSpaceId !== null) {
        const ceramic = observation.game.ceramics[action.ceramicId];
        if (ceramic?.stage === "loaded") {
          const before = expectedQualityValue(observation, profile, ceramic.glaze, kilnZoneModifier(ceramic.kilnSpaceId), 2);
          const after = expectedQualityValue(observation, profile, ceramic.glaze, kilnZoneModifier(action.toSpaceId), 2);
          factors.qualityValue += after - before;
        }
      }
      return;
    case "RESOLVE_KILN_YARD_REPOSITION":
      if (action.ceramicId !== null && action.toSpaceId !== null) {
        const ceramic = observation.game.ceramics[action.ceramicId];
        const baseHeat = observation.game.firingContext?.baseHeat;
        if (ceramic?.stage === "loaded" && baseHeat !== null && baseHeat !== undefined) {
          const before = expectedQualityValue(observation, profile, ceramic.glaze, kilnZoneModifier(ceramic.kilnSpaceId), baseHeat);
          const after = expectedQualityValue(observation, profile, ceramic.glaze, kilnZoneModifier(action.toSpaceId), baseHeat);
          factors.qualityValue += after - before;
        }
      }
      return;
    case "SUBMIT_WOOD_CONTRIBUTION": {
      const loaded = ceramics.filter((ceramic) => ceramic.stage === "loaded");
      // Predict the rest of the table on the neutral card, which is both the free option
      // and the one nobody is individually paid to abandon, then score the Base Heat this
      // card would produce for the ceramics this player actually has in the kiln.
      const projected = determineBaseHeat([contributionHeatAdjustment(action.card)]);
      for (const ceramic of loaded) {
        if (ceramic.stage !== "loaded") continue;
        factors.qualityValue += expectedQualityValue(observation, profile, ceramic.glaze, kilnZoneModifier(ceramic.kilnSpaceId), projected);
      }
      // Charge the card's printed Wood cost. Bank and Stoke both cost 1, so cooling is
      // never cheaper than heating and the agent has no structural reason to free-ride.
      factors.resourceEfficiency -= contributionWoodCost(action.card) *
        marginalResourceValue(player.resources.wood, plan.resourceDemand.wood) * 0.45;
      return;
    }
    case "RESOLVE_FUEL_LEDGER": {
      const firing = observation.game.firingContext;
      if (firing === null) return;
      // Fuel Ledger turns this player's revealed Stoke into +2, one extra step of Heat.
      const adjustments = firing.contributors.map((contributorId) => {
        const card = firing.contributions[contributorId];
        return card === undefined ? 0 : contributionHeatAdjustment(card);
      });
      const beforeHeat = determineBaseHeat(adjustments);
      const afterHeat = determineBaseHeat([...adjustments, 1]);
      let grossBenefit = 0;
      for (const ceramic of ceramics) {
        if (ceramic.stage !== "loaded") continue;
        const zone = kilnZoneModifier(ceramic.kilnSpaceId);
        const before = expectedQualityValue(observation, profile, ceramic.glaze, zone, beforeHeat);
        const after = expectedQualityValue(observation, profile, ceramic.glaze, zone, afterHeat);
        grossBenefit += after - before;
      }
      const woodCost = marginalResourceValue(player.resources.wood, plan.resourceDemand.wood);
      const coinCost = marginalResourceValue(player.resources.coins, plan.resourceDemand.coins, 0);
      const net = grossBenefit - woodCost - coinCost;
      diagnostics.optionalEffect = qualityDiagnostic(
        "fuel_ledger", observation, plan, action.use ? observation.playerId : null, null, null, grossBenefit,
        action.use ? coinCost : 0, action.use ? woodCost : 0,
        net > 0 ? "whole_portfolio_benefits" : "portfolio_not_worth_cost", [],
      );
      if (action.use) {
        factors.qualityValue += grossBenefit;
        factors.resourceEfficiency -= woodCost + coinCost;
        if (net <= 0) factors.risk -= 20;
      }
      return;
    }
    case "RESOLVE_SAGGER_SELECTION": {
      const diagnostic = saggerDiagnostic(observation, profile, plan, action.ceramicId);
      diagnostics.optionalEffect = diagnostic;
      if (action.ceramicId !== null) {
        factors.qualityValue += diagnostic.grossBenefit + diagnostic.orderValueDelta;
        factors.resourceEfficiency -= diagnostic.coinCost;
        if (diagnostic.projectedNetValue <= 0 || diagnostic.qualityRankDelta < 0) factors.risk -= 30;
      }
      return;
    }
    case "RESOLVE_JUN": {
      const diagnostic = junDiagnostic(observation, profile, plan, action.ceramicId, action.delta);
      diagnostics.optionalEffect = diagnostic;
      if (action.ceramicId !== null && action.delta !== null) {
        factors.qualityValue += diagnostic.grossBenefit + diagnostic.orderValueDelta;
        factors.resourceEfficiency -= diagnostic.coinCost;
        if (diagnostic.projectedNetValue <= 0) factors.risk -= 20;
      }
      return;
    }
    case "RESOLVE_GE": {
      const diagnostic = geDiagnostic(observation, profile, plan, action.ceramicId);
      diagnostics.optionalEffect = diagnostic;
      if (action.ceramicId !== null) {
        factors.qualityValue += diagnostic.grossBenefit + diagnostic.orderValueDelta;
        // Ge spends Wood, which competes with Contribution cards and every Firing
        // Technique. Leaving this unpriced would make the ability look free to the agent.
        factors.resourceEfficiency -= GE_ACTIVATION_WOOD *
          marginalResourceValue(player.resources.wood, plan.resourceDemand.wood, 0);
        if (diagnostic.projectedNetValue <= 0) factors.risk -= 30;
      }
      return;
    }
    case "RESOLVE_PROTECTIVE_SAGGARS":
      if (action.ceramicId !== null) {
        const before = observation.game.firingContext?.ceramicResults[action.ceramicId]?.assignedQuality;
        const after = before === "flawed" ? "standard" : "fine";
        const gross = scoreOptionalQuality(observation, profile, action.ceramicId, after);
        const coinCost = marginalResourceValue(player.resources.coins, plan.resourceDemand.coins, 0);
        const compatibilityBefore = before === null || before === undefined ? { compatibleOrders: 0, value: 0 } : plannedOrderCompatibility(observation, plan, action.ceramicId, before);
        const compatibilityAfter = plannedOrderCompatibility(observation, plan, action.ceramicId, after);
        const orderDelta = compatibilityAfter.value - compatibilityBefore.value;
        diagnostics.optionalEffect = qualityDiagnostic(
          "protective_saggars", observation, plan, action.ceramicId, before ?? null, after, gross, coinCost, 0,
          gross + orderDelta > coinCost ? "quality_salvage_worth_cost" : "benefit_below_full_cost",
          ownCeramics(observation).filter((ceramic) => ceramic.stage === "loaded" && ["flawed", "standard"].includes(observation.game.firingContext?.ceramicResults[ceramic.id]?.assignedQuality ?? "")).map(({ id }) => id),
          compatibilityBefore.compatibleOrders, compatibilityAfter.compatibleOrders, orderDelta,
        );
        factors.qualityValue += gross + orderDelta;
        factors.resourceEfficiency -= coinCost;
        if (gross + orderDelta <= coinCost) factors.risk -= 20;
      } else {
        diagnostics.optionalEffect = qualityDiagnostic(
          "protective_saggars", observation, plan, null, null, null, 0, 0, 0, "declined_no_positive_target",
          ownCeramics(observation).filter((ceramic) => ceramic.stage === "loaded" && ["flawed", "standard"].includes(observation.game.firingContext?.ceramicResults[ceramic.id]?.assignedQuality ?? "")).map(({ id }) => id),
        );
      }
      return;
    case "RESOLVE_SECOND_FIRING":
      if (action.ceramicId !== null) {
        const reserved = assignments.find((assignment) => assignment.ceramicId === action.ceramicId);
        const needsFine = reserved !== undefined && QUALITY_RANK[reserved.minQuality] >= QUALITY_RANK.fine;
        const futureCapacity = observation.game.round < 5 && plan.terminalForecast.remainingWorkerActions >= 2;
        const gross = futureCapacity && needsFine ? 5.5 : 0;
        const opportunityCost = futureCapacity ? 2.8 : 8;
        diagnostics.optionalEffect = qualityDiagnostic(
          "second_firing", observation, plan, action.ceramicId, "standard", null, gross, 0, 0,
          gross > opportunityCost ? "planned_refire_has_time" : observation.game.round >= 5 ? "no_refire_time" : "no_higher_quality_destination",
          ownCeramics(observation).filter((ceramic) => ceramic.stage === "loaded" && observation.game.firingContext?.ceramicResults[ceramic.id]?.assignedQuality === "standard").map(({ id }) => id),
          0, 0, 0, opportunityCost,
        );
        factors.futureVP += gross;
        factors.opportunityCost -= opportunityCost;
        if (gross <= opportunityCost) factors.risk -= 20;
      } else {
        diagnostics.optionalEffect = qualityDiagnostic(
          "second_firing", observation, plan, null, "standard", null, 0, 0, 0, "declined_no_positive_refire",
          ownCeramics(observation).filter((ceramic) => ceramic.stage === "loaded" && observation.game.firingContext?.ceramicResults[ceramic.id]?.assignedQuality === "standard").map(({ id }) => id),
        );
      }
      return;
    case "RESOLVE_FIRING_CLAY_SUBSTITUTION":
      // Three resources for 3 Coins, taken in the Firing Phase. Its distinctive value is
      // buying Wood while a Contribution card can still be chosen with it.
      if (action.use) {
        factors.resourceEfficiency +=
          action.clay * marginalResourceValue(player.resources.clay, plan.resourceDemand.clay)
          + action.wood * marginalResourceValue(player.resources.wood, plan.resourceDemand.wood)
          - CLAY_SUBSTITUTION_COIN_COST * marginalResourceValue(player.resources.coins, plan.resourceDemand.coins, 0);
      }
      return;
    case "RESOLVE_TEST_PIECES":
      if (action.use) {
        const loadedCount = ceramics.filter(({ stage }) => stage === "loaded").length;
        factors.qualityValue += 0.8 + loadedCount * 0.45;
      }
      return;
    case "RESOLVE_KILN_RECORDS":
      if (action.use) factors.resourceEfficiency += marginalResourceValue(player.resources.clay, plan.resourceDemand.clay)
        + marginalResourceValue(player.resources.coins, plan.resourceDemand.coins, 0);
      return;
    case "COMPLETE_ORDER": {
      const order = ORDER_DEFINITIONS[action.orderId];
      if (order !== undefined) {
        const progressReward = activeOrderProgressReward(observation, order.imperialProgressReward);
        factors.immediateVP += order.vp;
        factors.resourceEfficiency += order.coins * 0.7;
        // Price the space actually landed on, not a flat rate per step. The track pays
        // 0 / 0 / 2 / 2 / 4 / 8, so advancing 2 -> 3 is worth nothing in VP while 3 -> 4 is
        // worth 2 plus full Exhibition access. A flat rate makes those identical, which is
        // exactly the distinction a player has to reason about.
        factors.imperialValue += progressReward > 0
          ? progressMoveValue(observation, observation.imperialTrackRules, progressReward as 1 | 2 | 3)
          : 0;
        if (order.imperialProgressReward !== undefined) {
          factors.imperialValue += imperialProgressRuleDelta(observation, order.imperialProgressReward);
        }
        const targetProgress = Math.min(5, player.imperialProgress + progressReward) as 0 | 1 | 2 | 3 | 4 | 5;
        const capacityGain = observation.imperialTrackRules.exhibitionCapacityByProgress[targetProgress] -
          observation.imperialTrackRules.exhibitionCapacityByProgress[player.imperialProgress];
        factors.imperialValue += capacityGain * 4;
        if (player.imperialProgress < 2 && targetProgress >= 2) factors.imperialValue += 1.5;
        if (player.imperialProgress < 4 && targetProgress >= 4) factors.imperialValue += 2;
      }
      factors.planProgress += 6;
      return;
    }
    case "END_ORDER_TURN":
      if (primary?.actionDebt === 0) factors.opportunityCost -= 12;
      return;
    case "DISCARD_ORDERS_FOR_CLEANUP":
      factors.orderFeasibility -= action.orderIds.reduce(
        (sum, orderId) => sum + acquisitionScore(observation, profile, intent, orderId).value,
        0,
      );
      return;
    case "SUBMIT_PRESENTATION": {
      const selected = action.ceramicIds
        .map((id) => observation.game.ceramics[id])
        .filter((ceramic): ceramic is FinishedCeramic => ceramic?.stage === "finished");
      factors.immediateVP += selected.reduce((sum, ceramic) => sum + (
        ceramic.quality === "flawed" ? 0 : IMPERIAL_PROGRESS.exhibition.qualityVp[ceramic.quality]
      ), 0);
      if (IMPERIAL_PROGRESS.exhibition.diversityEligibleSpaces.includes(player.imperialProgress)) {
        if (selected.length === 3 && new Set(selected.map(({ shape }) => shape)).size === 3) factors.immediateVP += 2;
        if (selected.length === 3 && new Set(selected.map(({ glaze }) => glaze)).size === 3) factors.immediateVP += 2;
      }
      return;
    }
  }
}

export function strategyTags(observation: PlayerObservation): StrategyTag[] {
  const player = observation.game.players[observation.playerId];
  if (player === undefined) return ["Hybrid"];
  const imperial = player.orderHand.filter((id) => isImperialOrder(id)).length + player.completedOrders.filter(({ orderId }) => isImperialOrder(orderId)).length;
  const market = player.orderHand.length + player.completedOrders.length - imperial;
  const tags: StrategyTag[] = [imperial > market ? "Imperial-heavy" : market > imperial ? "Market-heavy" : "Hybrid"];
  if (player.techniques.length > 0) tags.push("Technique");
  if (player.imperialProgress >= 3) tags.push("Presentation");
  if (player.resources.coins >= 5) tags.push("Coin-economy");
  if (ownCeramics(observation).filter(({ stage }) => stage === "loaded").length >= 2) tags.push("Firing-control");
  tags.push(ownCeramics(observation).length >= 5 ? "Volume" : "Quality");
  return tags;
}

const CLAY_SUBSTITUTION_COIN_COST = 3;

/** Jun's activation cost, in Wood. Mirrors the engine constant. */
const JUN_ACTIVATION_WOOD = 1;

/** Ge's activation cost, in Wood. Mirrors the engine constant. */
const GE_ACTIVATION_WOOD = 1;

/** VP that a Coin balance is worth if the game ended now, read from the authoritative rules. */
function terminalCoinVp(coins: number): number {
  const { coinsPerVp, maxVp } = GAME_CONFIG.coinEndGame;
  return Math.min(maxVp, Math.floor(Math.max(0, coins) / coinsPerVp));
}

export function evaluateAction(
  observation: PlayerObservation,
  action: AIAction,
  context: AIDecisionContext,
  profile: AIStrategyProfile,
  suppliedPlan?: PlayerPlan,
): ScoredAIAction {
  const intent = context.assignedIntent ?? "Hybrid";
  const plan = suppliedPlan ?? buildPlayerPlan(observation, profile, intent);
  const factors = ZERO_FACTORS();
  const diagnostics = EMPTY_DIAGNOSTICS();
  scoreAction(observation, action, context, profile, plan, factors, diagnostics);
  const orderId = actionOrderId(action);
  const techniqueId = actionTechniqueId(action);
  factors.learned += profile.actionWeights[action.type] ?? 0;
  factors.learned += profile.intentPriors[intent] ?? 0;
  if (orderId !== null) factors.learned += (profile.orderValues[orderId] ?? 0) * 0.025;
  if (techniqueId !== null) factors.learned += (profile.techniqueValues[techniqueId] ?? 0) * 0.06;
  if (observation.game.round === 5 && action.type !== "USE_KILN_YARD" && action.type !== "COMPLETE_ORDER") {
    factors.opportunityCost -= terminalPipelinePenalty(plan) * 0.12;
  }
  return {
    action,
    totalScore: Object.values(factors).reduce((sum, value) => sum + value, 0),
    factors,
    diagnostics,
  };
}
