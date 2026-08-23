import {
  DECORATION_COSTS,
  GLAZES,
  IMPERIAL_ORDERS,
  MARKET_ORDERS,
  ORDER_DEFINITIONS,
  officialImperialTrackRules,
  QUALITY_RANK,
  SHAPES,
  SHAPE_COSTS,
  activeKilnSpaceIds,
  kilnZoneModifier,
  preferredHeat,
  qualityFromDifference,
} from "../game/index.ts";
import type {
  CeramicState,
  Decoration,
  Glaze,
  OrderDefinition,
  OrderRelationDefinition,
  Quality,
  Shape,
} from "../game/index.ts";
import { fireExpectation } from "./observation.ts";
import type {
  AIStrategyProfile,
  CeramicSpecification,
  OrderFeasibility,
  PlanReason,
  PlannedCeramicAssignment,
  PlayerObservation,
  PlayerPlan,
  ResourceDemand,
  TerminalConversionForecast,
  ImperialRouteForecast,
  MultiRoundRoutePlan,
  OrderRouteForecast,
  StrategicStepId,
  StrategyIntent,
} from "./types.ts";

const DECORATIONS: readonly Decoration[] = ["plain", "carved", "impressed", "crackle"];
const DEFAULT_INTENT: StrategyIntent = "Hybrid";

export function activeOrderProgressReward(
  observation: PlayerObservation,
  printedReward: 1 | 2 | 3 | undefined,
): 0 | 1 | 2 | 3 {
  if (printedReward === undefined) return 0;
  return observation.imperialTrackRules.imperialOrderProgressMode === "all_two"
    ? 2
    : printedReward;
}

function crossedMilestones(from: number, to: number, spaces: readonly number[]): number {
  return spaces.filter((space) => from < space && to >= space).length;
}

export function progressMoveValue(
  observation: PlayerObservation,
  rules: PlayerObservation["imperialTrackRules"],
  reward: 1 | 2 | 3,
): number {
  const player = observation.game.players[observation.playerId]!;
  const from = player.imperialProgress;
  const to = Math.min(5, from + reward);
  const remainingRounds = Math.max(0, 5 - observation.game.round);
  const finished = Object.values(observation.game.ceramics).filter(
    (ceramic) => ceramic.ownerId === observation.playerId && ceramic.stage === "finished",
  ).length;
  const trackValue = (rules.trackVp[to] ?? 0) - (rules.trackVp[from] ?? 0);
  const apprenticeValue = crossedMilestones(from, to, rules.apprenticeMilestoneSpaces) *
    (0.9 + remainingRounds * 0.55);
  const exhibitionCapacityValue = (
    rules.exhibitionCapacityByProgress[to]! - rules.exhibitionCapacityByProgress[from]!
  ) * (1.2 + Math.min(3, finished) * 0.8);
  // v1.1.4 removed the Coin stipends at Progress 2 and 4, so an advance is worth only
  // track VP, Apprentice unlocks, Exhibition capacity and the Seal.
  const sealValue = from < 5 && to === 5 && observation.game.imperialSealOwnerId === null
    ? rules.imperialSealVp
    : 0;
  return trackValue + apprenticeValue + exhibitionCapacityValue + sealValue;
}

/**
 * A single, arm-agnostic valuation of the public rule delta. It is exactly zero
 * under the active authoritative rules, preserving frozen-control policy behaviour.
 */
export function imperialProgressRuleDelta(
  observation: PlayerObservation,
  printedReward: 1 | 2 | 3,
): number {
  const activeReward = activeOrderProgressReward(observation, printedReward) as 1 | 2 | 3;
  return progressMoveValue(observation, observation.imperialTrackRules, activeReward) -
    progressMoveValue(observation, officialImperialTrackRules(), printedReward);
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function attributes(ceramic: CeramicState): { glaze?: Glaze; decoration?: Decoration; quality?: Quality } {
  if (ceramic.stage === "shaped" || ceramic.stage === "sold") return {};
  const base = { glaze: ceramic.glaze, decoration: ceramic.decoration };
  return ceramic.stage === "finished" || ceramic.stage === "delivered" || ceramic.stage === "presented"
    ? { ...base, quality: ceramic.quality }
    : base;
}

function stageDebt(ceramic: CeramicState): number {
  switch (ceramic.stage) {
    case "shaped": return 3;
    case "glazed": return 2;
    case "loaded": return 1;
    case "finished": return 0;
    case "sold":
    case "delivered":
    case "presented": return 99;
  }
}

function minimumQualityProbability(
  observation: PlayerObservation,
  glaze: Glaze,
  minQuality: Quality,
  zoneModifier = 0,
): number {
  if (minQuality === "flawed") return 1;
  return fireExpectation(observation).reduce((sum, card) => {
    const difference = Math.abs(2 + zoneModifier + card.modifier - preferredHeat(glaze));
    const quality = qualityFromDifference(difference);
    return sum + (QUALITY_RANK[quality] >= QUALITY_RANK[minQuality] ? card.probability : 0);
  }, 0);
}

function bestQualityProbability(
  observation: PlayerObservation,
  glaze: Glaze,
  minQuality: Quality,
): number {
  const modifiers = [...new Set(activeKilnSpaceIds(observation.game.playerCount).map(kilnZoneModifier))];
  return Math.max(...modifiers.map((modifier) => minimumQualityProbability(observation, glaze, minQuality, modifier)));
}

function chooseDistinct<T>(values: readonly T[], index: number, offset: number): T {
  return values[(index + offset) % values.length]!;
}

function targetSpecifications(order: OrderDefinition, offset: number): CeramicSpecification[] {
  const specifications = order.ceramics.map((requirement, index): CeramicSpecification => ({
    requirementIndex: index,
    shape: requirement.shape ?? requirement.shapes?.[(index + offset) % requirement.shapes.length] ?? chooseDistinct(SHAPES, index, offset),
    glaze: requirement.glaze ?? chooseDistinct(GLAZES, 0, offset),
    decoration: requirement.decoration ?? chooseDistinct(DECORATIONS, 0, Math.floor(offset / GLAZES.length)),
    minQuality: order.minQuality,
  }));
  for (const relation of order.relations ?? []) applyRelationTarget(specifications, relation, offset);
  order.ceramics.forEach((requirement, index) => {
    const target = specifications[index];
    if (target === undefined) return;
    if (requirement.shape !== undefined) target.shape = requirement.shape;
    if (requirement.shapes !== undefined && !requirement.shapes.includes(target.shape)) target.shape = requirement.shapes[0]!;
    if (requirement.glaze !== undefined) target.glaze = requirement.glaze;
    if (requirement.decoration !== undefined) target.decoration = requirement.decoration;
  });
  return specifications;
}

function applyRelationTarget(
  specifications: CeramicSpecification[],
  relation: OrderRelationDefinition,
  offset: number,
): void {
  switch (relation.type) {
    case "same_glaze": {
      const glaze = specifications[relation.indices[0] ?? 0]?.glaze ?? chooseDistinct(GLAZES, 0, offset);
      for (const index of relation.indices) if (specifications[index] !== undefined) specifications[index]!.glaze = glaze;
      break;
    }
    case "different_glaze":
    case "all_different_glaze":
      relation.indices.forEach((index, position) => {
        if (specifications[index] !== undefined) {
          specifications[index]!.glaze = chooseDistinct(GLAZES, position, offset);
        }
      });
      break;
    case "different_shape":
    case "all_different_shape":
      relation.indices.forEach((index, position) => {
        if (specifications[index] !== undefined) specifications[index]!.shape = chooseDistinct(SHAPES, position, offset);
      });
      break;
    case "same_decoration": {
      const decoration = specifications[relation.indices[0] ?? 0]?.decoration ?? "plain";
      for (const index of relation.indices) if (specifications[index] !== undefined) specifications[index]!.decoration = decoration;
      break;
    }
    case "at_least_n_quality":
      for (let index = 0; index < Math.min(relation.count, specifications.length); index += 1) specifications[index]!.minQuality = relation.quality;
      break;
    case "at_least_n_distinct_glazes":
      relation.indices.slice(0, relation.count).forEach((index, position) => {
        if (specifications[index] !== undefined) specifications[index]!.glaze = chooseDistinct(GLAZES, position, offset);
      });
      break;
    case "glaze_categories":
      relation.indices.forEach((index, position) => {
        const category = relation.categories[position];
        if (specifications[index] !== undefined && category?.length) specifications[index]!.glaze = category[offset % category.length]!;
      });
      break;
  }
}

function targetSatisfiesPrinted(order: OrderDefinition, target: CeramicSpecification): boolean {
  const requirement = order.ceramics[target.requirementIndex];
  if (requirement === undefined) return false;
  if (requirement.shape !== undefined && requirement.shape !== target.shape) return false;
  if (requirement.shapes !== undefined && !requirement.shapes.includes(target.shape)) return false;
  if (requirement.glaze !== undefined && requirement.glaze !== target.glaze) return false;
  if (requirement.decoration !== undefined && requirement.decoration !== target.decoration) return false;
  return true;
}

function ceramicFitsTarget(ceramic: CeramicState, target: CeramicSpecification): boolean {
  if (ceramic.stage === "sold" || ceramic.stage === "delivered" || ceramic.stage === "presented") return false;
  if (ceramic.shape !== target.shape) return false;
  const known = attributes(ceramic);
  if (known.glaze !== undefined && known.glaze !== target.glaze) return false;
  if (known.decoration !== undefined && known.decoration !== target.decoration) return false;
  if (known.quality !== undefined && QUALITY_RANK[known.quality] < QUALITY_RANK[target.minQuality]) return false;
  return true;
}

function assignmentFor(
  observation: PlayerObservation,
  ceramic: CeramicState | null,
  target: CeramicSpecification,
): PlannedCeramicAssignment {
  if (ceramic === null) {
    return {
      ...target,
      ceramicId: null,
      currentStage: "missing",
      stageDebt: 4,
      qualityProbability: bestQualityProbability(observation, target.glaze, target.minQuality),
    };
  }
  const debt = stageDebt(ceramic);
  const known = attributes(ceramic);
  const qualityProbability = known.quality === undefined
    ? ceramic.stage === "loaded"
      ? minimumQualityProbability(observation, target.glaze, target.minQuality, kilnZoneModifier(ceramic.kilnSpaceId))
      : bestQualityProbability(observation, target.glaze, target.minQuality)
    : 1;
  return {
    ...target,
    ceramicId: ceramic.id,
    currentStage: ceramic.stage as PlannedCeramicAssignment["currentStage"],
    stageDebt: debt,
    qualityProbability,
  };
}

function relationConflicts(order: OrderDefinition, specifications: readonly CeramicSpecification[]): number {
  let conflicts = 0;
  const values = <T>(indices: readonly number[], select: (value: CeramicSpecification) => T): T[] =>
    indices.flatMap((index) => specifications[index] === undefined ? [] : [select(specifications[index]!)]);
  for (const relation of order.relations ?? []) {
    switch (relation.type) {
      case "same_glaze": {
        const selected = values(relation.indices, (specification) => specification.glaze);
        if (new Set(selected).size !== 1) conflicts += 1;
        break;
      }
      case "different_glaze":
      case "all_different_glaze": {
        const selected = values(relation.indices, (specification) => specification.glaze);
        if (new Set(selected).size !== selected.length) conflicts += 1;
        break;
      }
      case "different_shape":
      case "all_different_shape": {
        const selected = values(relation.indices, (specification) => specification.shape);
        if (new Set(selected).size !== selected.length) conflicts += 1;
        break;
      }
      case "same_decoration": {
        const selected = values(relation.indices, (specification) => specification.decoration);
        if (new Set(selected).size !== 1) conflicts += 1;
        break;
      }
      case "at_least_n_quality":
        if (specifications.filter((specification) => QUALITY_RANK[specification.minQuality] >= QUALITY_RANK[relation.quality]).length < relation.count) conflicts += 1;
        break;
      case "at_least_n_distinct_glazes": {
        const selected = values(relation.indices, (specification) => specification.glaze);
        if (new Set(selected).size < relation.count) conflicts += 1;
        break;
      }
      case "glaze_categories":
        if (relation.indices.some((index, position) => !relation.categories[position]?.includes(specifications[index]?.glaze as Glaze))) conflicts += 1;
        break;
    }
  }
  return conflicts;
}

function bestAssignmentForTargets(
  observation: PlayerObservation,
  order: OrderDefinition,
  targets: CeramicSpecification[],
): PlannedCeramicAssignment[] | null {
  if (!targets.every((target) => targetSatisfiesPrinted(order, target))) return null;
  if (relationConflicts(order, targets) > 0) return null;
  const ceramics = Object.values(observation.game.ceramics).filter((ceramic) => ceramic.ownerId === observation.playerId);
  let best: PlannedCeramicAssignment[] | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  const used = new Set<string>();
  const current: PlannedCeramicAssignment[] = [];
  const visit = (slot: number, cost: number): void => {
    if (cost >= bestCost) return;
    const target = targets[slot];
    if (target === undefined) {
      best = [...current];
      bestCost = cost;
      return;
    }
    const matching = ceramics
      .filter((ceramic) => !used.has(ceramic.id) && ceramicFitsTarget(ceramic, target))
      .map((ceramic) => assignmentFor(observation, ceramic, target))
      .sort((left, right) => (left.stageDebt - left.qualityProbability) - (right.stageDebt - right.qualityProbability));
    for (const assignment of matching) {
      used.add(assignment.ceramicId!);
      current.push(assignment);
      visit(slot + 1, cost + assignment.stageDebt + (1 - assignment.qualityProbability) * 2);
      current.pop();
      used.delete(assignment.ceramicId!);
    }
    const missing = assignmentFor(observation, null, target);
    current.push(missing);
    visit(slot + 1, cost + missing.stageDebt + (1 - missing.qualityProbability) * 2 + 0.4);
    current.pop();
  };
  visit(0, 0);
  return best;
}

function resourceDebtFor(
  observation: PlayerObservation,
  assignments: readonly PlannedCeramicAssignment[],
): { clay: number; wood: number; coins: number } {
  const player = observation.game.players[observation.playerId]!;
  const clayNeed = assignments.reduce((sum, assignment) => sum + (assignment.currentStage === "missing" ? SHAPE_COSTS[assignment.shape] : 0), 0);
  const coinNeed = assignments.reduce((sum, assignment) => sum + (
    assignment.currentStage === "missing" || assignment.currentStage === "shaped"
      ? DECORATION_COSTS[assignment.decoration]
      : 0
  ), 0);
  const woodNeed = Math.max(0, Math.ceil(assignments.filter((assignment) => assignment.currentStage !== "finished").length / 2));
  return {
    clay: Math.max(0, clayNeed - player.resources.clay),
    wood: Math.max(0, woodNeed - player.resources.wood),
    coins: Math.max(0, coinNeed - player.resources.coins),
  };
}

function reasonsFor(
  actionDebt: number,
  resourceDebt: { clay: number; wood: number; coins: number },
  probability: number,
  relationConflictCount: number,
  earliestCompletionRound: number,
): PlanReason[] {
  const reasons: PlanReason[] = [];
  if (actionDebt === 0) reasons.push("ready");
  else reasons.push("pipeline_work");
  if (resourceDebt.clay + resourceDebt.wood + resourceDebt.coins > 0) reasons.push("resource_shortage");
  if (probability < 0.65) reasons.push("quality_risk");
  if (relationConflictCount > 0) reasons.push("relation_conflict");
  if (earliestCompletionRound > 5) reasons.push("insufficient_time");
  return reasons;
}

export function evaluateOrderFeasibility(
  observation: PlayerObservation,
  orderId: string,
  retryHorizon = 1,
): OrderFeasibility {
  const order = ORDER_DEFINITIONS[orderId];
  if (order === undefined) {
    return {
      orderId,
      probability: 0,
      feasible: false,
      assignments: [],
      missingSpecifications: [],
      actionDebt: 99,
      resourceDebt: { clay: 0, wood: 0, coins: 0 },
      earliestCompletionRound: 6,
      relationConflicts: 1,
      reasons: ["relation_conflict"],
    };
  }
  // Celadon first reflects the neutral Base Heat 2 plan; every public option is
  // still enumerated, so fixed requirements and visible pipeline pieces win.
  const variants = Array.from({ length: 20 }, (_, offset) => targetSpecifications(order, offset + 1));
  const options = variants.flatMap((targets) => {
    const assignments = bestAssignmentForTargets(observation, order, targets);
    return assignments === null ? [] : [{ assignments, relationConflicts: relationConflicts(order, assignments) }];
  });
  const assignments = options.sort((left, right) => {
    const leftDebt = left.assignments.reduce((sum, assignment) => sum + assignment.stageDebt + 2 * (1 - assignment.qualityProbability), 0);
    const rightDebt = right.assignments.reduce((sum, assignment) => sum + assignment.stageDebt + 2 * (1 - assignment.qualityProbability), 0);
    return leftDebt - rightDebt;
  })[0]?.assignments ?? [];
  const relationConflictCount = assignments.length === 0 ? 1 : relationConflicts(order, assignments);
  const actionDebt = assignments.reduce((sum, assignment) => sum + assignment.stageDebt, 0);
  const resourceDebt = resourceDebtFor(observation, assignments);
  // A ceramic that fires to the wrong Quality is not destroyed -- it stays in stock and the
  // requirement can be attempted again while rounds remain. With `retryHorizon` at 1 this is
  // the frozen single-attempt product; above 1 each requirement is lifted to the chance of
  // succeeding at least once, which lifts multi-ceramic Orders more because the product has
  // more terms. Retries are not free, and their cost is already carried by `actionDebt`,
  // `resourceDebt` and `timeProbability` below, so this is not double counting.
  const attempts = Math.max(1, Math.min(retryHorizon, 6 - observation.game.round));
  const atLeastOnce = (single: number): number => 1 - Math.pow(1 - single, attempts);
  const qualityProbability = assignments.reduce(
    (product, assignment) => product * atLeastOnce(assignment.qualityProbability),
    1,
  );
  const resourcePenalty = resourceDebt.clay * 0.045 + resourceDebt.wood * 0.04 + resourceDebt.coins * 0.035;
  const phaseAfterFiring = observation.game.phase.type === "orders" || observation.game.phase.type === "presentation";
  const actionsPerRound = 3.2;
  const roundDebt = Math.ceil(actionDebt / actionsPerRound) + (phaseAfterFiring && actionDebt > 0 ? 1 : 0);
  const earliestCompletionRound = observation.game.round + roundDebt;
  const timeCapacity = Math.max(1, (6 - observation.game.round) * actionsPerRound);
  const timeProbability = clamp(1.15 - actionDebt / timeCapacity);
  const probability = clamp(qualityProbability * timeProbability - resourcePenalty - relationConflictCount * 0.4);
  const reasons = reasonsFor(actionDebt, resourceDebt, probability, relationConflictCount, earliestCompletionRound);
  return {
    orderId,
    probability,
    feasible: probability >= 0.3 && earliestCompletionRound <= 5 && relationConflictCount === 0,
    assignments,
    missingSpecifications: assignments.filter((assignment) => assignment.ceramicId === null),
    actionDebt,
    resourceDebt,
    earliestCompletionRound,
    relationConflicts: relationConflictCount,
    reasons,
  };
}

function intentValue(
  observation: PlayerObservation,
  intent: StrategyIntent,
  order: OrderDefinition,
): number {
  const imperial = order.id.startsWith("I");
  const progressReward = activeOrderProgressReward(observation, order.imperialProgressReward);
  switch (intent) {
    case "Market": return imperial ? -0.6 : 0.8;
    case "Imperial": return imperial ? 3.8 + progressReward * 0.8 : -0.8;
    case "Hybrid": return 0.25;
    case "Quality-control": return QUALITY_RANK[order.minQuality] * 0.18;
    case "Volume-multi": return order.ceramics.length > 1 ? 2.8 + (order.ceramics.length - 2) * 0.8 : -1.5;
    case "Technique-economy": return order.coins * 0.14;
  }
}

export function orderPlanUtility(
  observation: PlayerObservation,
  feasibility: OrderFeasibility,
  profile: AIStrategyProfile,
  intent: StrategyIntent,
): number {
  const order = ORDER_DEFINITIONS[feasibility.orderId];
  if (order === undefined) return -100;
  const progressReward = activeOrderProgressReward(observation, order.imperialProgressReward);
  const reward = order.vp + order.coins * 0.35 + progressReward * 2.4;
  const ruleDelta = order.imperialProgressReward === undefined
    ? 0
    : imperialProgressRuleDelta(observation, order.imperialProgressReward);
  return feasibility.probability * (reward + ruleDelta) +
    intentValue(observation, intent, order) +
    (profile.orderValues[order.id] ?? reward) * 0.04 -
    feasibility.actionDebt * 0.28;
}

function resourceDemandFor(
  observation: PlayerObservation,
  selected: readonly OrderFeasibility[],
  intent: StrategyIntent,
): ResourceDemand {
  const player = observation.game.players[observation.playerId]!;
  const assignments = selected.flatMap((feasibility) => feasibility.assignments);
  const clay = assignments.reduce((sum, assignment) => sum + (assignment.currentStage === "missing" ? SHAPE_COSTS[assignment.shape] : 0), 0);
  const coins = assignments.reduce((sum, assignment) => sum + (
    assignment.currentStage === "missing" || assignment.currentStage === "shaped" ? DECORATION_COSTS[assignment.decoration] : 0
  ), 0) + (intent === "Technique-economy" && player.techniques.length < 2 ? 3 : 0);
  const wood = Math.max(1, Math.ceil(assignments.filter((assignment) => assignment.currentStage !== "finished").length / 2));
  return {
    clay,
    wood,
    coins,
    claySafety: Math.max(0, clay + 1 - player.resources.clay),
    woodSafety: Math.max(0, wood + 1 - player.resources.wood),
    coinSafety: Math.max(0, coins + 1 - player.resources.coins),
  };
}

export function buildPlayerPlan(
  observation: PlayerObservation,
  profile: AIStrategyProfile,
  assignedIntent: StrategyIntent = DEFAULT_INTENT,
): PlayerPlan {
  const player = observation.game.players[observation.playerId]!;
  const orderFeasibilities = player.orderHand.map((orderId) => evaluateOrderFeasibility(observation, orderId, profile.orderRetryHorizon));
  const ordered = [...orderFeasibilities].sort(
    (left, right) => orderPlanUtility(observation, right, profile, assignedIntent) - orderPlanUtility(observation, left, profile, assignedIntent) || left.orderId.localeCompare(right.orderId),
  );
  const primary = ordered[0] ?? null;
  const used = new Set(primary?.assignments.flatMap((assignment) => assignment.ceramicId === null ? [] : [assignment.ceramicId]) ?? []);
  const secondary = ordered.slice(1).filter((candidate) => {
    const ids = candidate.assignments.flatMap((assignment) => assignment.ceramicId === null ? [] : [assignment.ceramicId]);
    return ids.every((id) => !used.has(id)) && candidate.probability >= 0.22;
  }).slice(0, 2);
  const selected = primary === null ? [] : [primary, ...secondary];
  const ceramics = Object.values(observation.game.ceramics).filter((ceramic) => ceramic.ownerId === observation.playerId);
  const pipeline = {
    shaped: ceramics.filter((ceramic) => ceramic.stage === "shaped").length,
    glazed: ceramics.filter((ceramic) => ceramic.stage === "glazed").length,
    loaded: ceramics.filter((ceramic) => ceramic.stage === "loaded").length,
    finished: ceramics.filter((ceramic) => ceramic.stage === "finished").length,
  };
  const conversionUrgency = clamp((observation.game.round - 2) / 3 + (pipeline.shaped * 0.16 + pipeline.glazed * 0.12 + pipeline.loaded * 0.08), 0, 2);
  const imperialRewards = selected.reduce((sum, feasibility) => sum + activeOrderProgressReward(
    observation,
    ORDER_DEFINITIONS[feasibility.orderId]?.imperialProgressReward,
  ), 0);
  const reachableImperialSpace = Math.min(5, player.imperialProgress + imperialRewards);
  const terminalForecast = terminalConversionForecast(observation, selected, pipeline, assignedIntent, reachableImperialSpace);
  const imperialRoute = imperialRouteForecast(observation, selected, reachableImperialSpace);
  const multiRoundRoute = multiRoundRoutePlan(observation, selected, pipeline);
  return {
    assignedIntent,
    primaryOrderId: primary?.orderId ?? null,
    secondaryOrderIds: secondary.map(({ orderId }) => orderId),
    orderFeasibilities,
    resourceDemand: resourceDemandFor(observation, selected, assignedIntent),
    pipeline,
    conversionUrgency,
    remainingRounds: 6 - observation.game.round,
    handConflictCount: Math.max(0, ordered.length - selected.length),
    reachableImperialSpace,
    terminalForecast,
    imperialRoute,
    multiRoundRoute,
  };
}

function workerActionCapacity(observation: PlayerObservation): Array<{ round: number; actions: number }> {
  const player = observation.game.players[observation.playerId]!;
  const unlocked = Object.values(player.workers).filter(({ status }) => status !== "locked").length;
  const availableNow = Object.values(player.workers).filter(({ status }) => status === "available").length;
  const currentPhaseHasRemainingWork = observation.game.phase.type.startsWith("work");
  const rows: Array<{ round: number; actions: number }> = [];
  for (let round = observation.game.round; round <= 5; round += 1) {
    rows.push({
      round,
      actions: round === observation.game.round
        ? currentPhaseHasRemainingWork ? availableNow : 0
        : unlocked,
    });
  }
  return rows;
}

function routeSteps(feasibility: OrderFeasibility): StrategicStepId[] {
  const assignments = feasibility.assignments;
  const steps: StrategicStepId[] = [];
  const resourceDebt = feasibility.resourceDebt;
  if (resourceDebt.clay > 0 || resourceDebt.wood > 0) steps.push("gain_materials");
  if (resourceDebt.coins > 0) steps.push("gain_coins");
  if (assignments.some(({ currentStage }) => currentStage === "missing")) steps.push("form");
  if (assignments.some(({ currentStage }) => currentStage === "missing" || currentStage === "shaped")) steps.push("glaze");
  if (assignments.some(({ currentStage }) => currentStage === "missing" || currentStage === "shaped" || currentStage === "glazed")) steps.push("load");
  if (assignments.some(({ currentStage }) => currentStage !== "finished")) steps.push("fire");
  steps.push("complete_order");
  return steps;
}

function workerActionsForRoute(feasibility: OrderFeasibility): number {
  const assignments = feasibility.assignments;
  const missing = assignments.filter(({ currentStage }) => currentStage === "missing").length;
  const needsGlaze = assignments.filter(({ currentStage }) => currentStage === "missing" || currentStage === "shaped").length;
  const needsLoad = assignments.filter(({ currentStage }) => currentStage !== "loaded" && currentStage !== "finished").length;
  const resourceActions = Math.max(
    Math.ceil(feasibility.resourceDebt.clay / 3),
    Math.ceil(feasibility.resourceDebt.wood / 3),
  ) + Math.ceil(feasibility.resourceDebt.coins / 4);
  return resourceActions + Math.ceil(missing / 2) + Math.ceil(needsGlaze / 2) + Math.ceil(needsLoad / 2);
}

function routeBottleneck(feasibility: OrderFeasibility): StrategicStepId {
  if (feasibility.resourceDebt.clay > 0 || feasibility.resourceDebt.wood > 0) return "gain_materials";
  if (feasibility.resourceDebt.coins > 0) return "gain_coins";
  const stages = feasibility.assignments.map(({ currentStage }) => currentStage);
  if (stages.includes("missing")) return "form";
  if (stages.includes("shaped")) return "glaze";
  if (stages.includes("glazed")) return "load";
  if (stages.includes("loaded")) return "fire";
  return "complete_order";
}

function multiRoundRoutePlan(
  observation: PlayerObservation,
  selected: readonly OrderFeasibility[],
  pipeline: PlayerPlan["pipeline"],
): MultiRoundRoutePlan {
  const capacity = workerActionCapacity(observation);
  const totalWorkerActionsAvailable = capacity.reduce((sum, row) => sum + row.actions, 0);
  let cumulativeActions = 0;
  let projectedOrderCompletions = 0;
  let projectedOrderVp = 0;
  const orders: OrderRouteForecast[] = selected.map((feasibility) => {
    const definition = ORDER_DEFINITIONS[feasibility.orderId];
    const estimatedWorkerActions = workerActionsForRoute(feasibility);
    cumulativeActions += estimatedWorkerActions;
    let runningCapacity = 0;
    const completionRound = capacity.find(({ round, actions }) => {
      runningCapacity += actions;
      return runningCapacity >= cumulativeActions;
    })?.round ?? 6;
    const requiredFirings = feasibility.assignments.some(({ currentStage }) => currentStage !== "finished") ? 1 : 0;
    const fitsActionBudget = completionRound <= 5 && requiredFirings <= Math.max(0, 6 - observation.game.round);
    if (fitsActionBudget && feasibility.probability >= 0.3) {
      projectedOrderCompletions += 1;
      projectedOrderVp += definition?.vp ?? 0;
    }
    return {
      orderId: feasibility.orderId,
      estimatedWorkerActions,
      requiredFirings,
      completionRound,
      completionProbability: fitsActionBudget ? feasibility.probability : feasibility.probability * 0.25,
      expectedValue: (definition?.vp ?? 0) * feasibility.probability + (definition?.coins ?? 0) * 0.35 - estimatedWorkerActions * 0.28,
      fitsActionBudget,
      bottleneck: routeBottleneck(feasibility),
    };
  });
  const allSteps = selected.flatMap(routeSteps);
  const plannedSteps = [...allSteps];
  const rounds = capacity.map(({ round, actions }) => ({
    round,
    availableWorkerActions: actions,
    plannedSteps: plannedSteps.splice(0, actions),
  }));
  const totalWorkerActionsRequired = orders.reduce((sum, order) => sum + order.estimatedWorkerActions, 0);
  const unfinishedWeight = pipeline.shaped * 3 + pipeline.glazed * 2 + pipeline.loaded;
  const actionSlack = totalWorkerActionsAvailable - totalWorkerActionsRequired;
  return {
    totalWorkerActionsAvailable,
    totalWorkerActionsRequired,
    actionSlack,
    projectedOrderCompletions,
    projectedOrderVp,
    strandedPipelineRisk: Math.max(0, unfinishedWeight - Math.max(0, actionSlack)) / Math.max(1, 6 - observation.game.round),
    nextSteps: allSteps.slice(0, 6),
    rounds,
    orders,
  };
}

function terminalConversionForecast(
  observation: PlayerObservation,
  selected: readonly OrderFeasibility[],
  pipeline: PlayerPlan["pipeline"],
  intent: StrategyIntent,
  reachableImperialSpace: number,
): TerminalConversionForecast {
  const player = observation.game.players[observation.playerId]!;
  const usableWorkers = Object.values(player.workers).filter(({ status }) => status !== "locked").length;
  const currentAvailable = Object.values(player.workers).filter(({ status }) => status === "available").length;
  const futureRounds = Math.max(0, 5 - observation.game.round);
  const remainingWorkerActions = (observation.game.phase.type === "work" ? currentAvailable : 0) + futureRounds * usableWorkers;
  const assignments = selected.flatMap(({ assignments }) => assignments);
  const plannedDestinations = assignments.length;
  const presentationCapacity = observation.imperialTrackRules.exhibitionCapacityByProgress[reachableImperialSpace]!;
  const finishedAssignable = assignments.filter(({ currentStage }) => currentStage === "finished").length;
  const unfinishedAssignable = assignments.filter(({ currentStage }) => currentStage !== "finished").length;
  const activeCeramics = pipeline.shaped + pipeline.glazed + pipeline.loaded + pipeline.finished;
  const totalDestinationCapacity = plannedDestinations + presentationCapacity;
  const surplusCeramics = Math.max(0, activeCeramics - totalDestinationCapacity);
  const hasVolumeDestination = selected.some(({ orderId }) => (ORDER_DEFINITIONS[orderId]?.ceramics.length ?? 0) > 1);
  const enoughTimeForNew = remainingWorkerActions >= 3 && observation.game.round <= 4;
  return {
    remainingWorkerActions,
    remainingFirings: Math.max(0, 6 - observation.game.round),
    plannedDestinations,
    presentationCapacity,
    finishedAssignable,
    unfinishedAssignable,
    surplusCeramics,
    shouldStartSpeculativeCeramic: enoughTimeForNew && surplusCeramics === 0 && plannedDestinations > activeCeramics && (intent !== "Volume-multi" || hasVolumeDestination),
  };
}

function imperialRouteForecast(
  observation: PlayerObservation,
  selected: readonly OrderFeasibility[],
  reachableImperialSpace: number,
): ImperialRouteForecast {
  const player = observation.game.players[observation.playerId]!;
  const imperialPlans = selected.filter(({ orderId }) => orderId.startsWith("I"));
  const projectedOrderProgress = imperialPlans.reduce((sum, feasibility) => sum + (
    feasibility.feasible
      ? activeOrderProgressReward(observation, ORDER_DEFINITIONS[feasibility.orderId]?.imperialProgressReward)
      : 0
  ), 0);
  const completedImperial = player.completedOrders.some(({ orderId }) => orderId.startsWith("I"));
  const projectedImperialCompletion = imperialPlans.some(({ feasible }) => feasible);
  const patronageReachable = player.imperialProgress <= 3 && (completedImperial || projectedImperialCompletion) && (
    player.resources.coins >= 5 || observation.game.round <= 4
  );
  const projectedProgress = Math.min(5, player.imperialProgress + projectedOrderProgress + (patronageReachable ? 1 : 0));
  // This legacy field name is retained in serialized AI diagnostics, but under
  // V1.0.4 it means that the universal end-game Exhibition has capacity.
  const presentationReachable = observation.imperialTrackRules.exhibitionCapacityByProgress[projectedProgress]! > 0;
  const sealReachable = player.imperialProgress + projectedOrderProgress >= 5;
  const viable = imperialPlans.some(({ feasible, earliestCompletionRound }) => feasible && earliestCompletionRound <= 5);
  const reasonCodes = [
    viable ? "feasible_imperial_order" : "no_feasible_imperial_order",
    patronageReachable ? "patronage_reachable" : "patronage_unavailable",
    presentationReachable ? "presentation_reachable" : "presentation_unreached",
    sealReachable ? "seal_reachable" : "seal_unreached",
  ];
  const preferredPath: ImperialRouteForecast["preferredPath"] = sealReachable
    ? "seal"
    : presentationReachable
      ? "presentation"
      : patronageReachable
        ? "order_then_patronage"
        : viable
          ? "order"
          : "fallback";
  return {
    viable,
    projectedProgress: Math.max(reachableImperialSpace, projectedProgress),
    projectedOrderProgress,
    patronageReachable,
    presentationReachable,
    sealReachable,
    preferredPath,
    reasonCodes,
  };
}

export function knownBlindOrderPool(observation: PlayerObservation, deck: "market" | "imperial"): string[] {
  const definitions = deck === "market" ? MARKET_ORDERS : IMPERIAL_ORDERS;
  const publicKnown = new Set<string>([
    ...observation.game.displays.market,
    ...observation.game.displays.imperial,
    ...observation.game.discards.market,
    ...observation.game.discards.imperial,
    ...Object.values(observation.game.players).flatMap((player) => [
      ...player.orderHand,
      ...player.completedOrders.map(({ orderId }) => orderId),
    ]),
  ]);
  return definitions.map(({ id }) => id).filter((id) => !publicKnown.has(id));
}

export function marginalResourceValue(
  current: number,
  projectedDemand: number,
  safety = 1,
): number {
  const shortage = projectedDemand + safety - current;
  if (shortage > 0) return 1.5 + Math.min(2, shortage) * 0.55;
  const surplus = -shortage;
  return Math.max(0.08, 0.9 - surplus * 0.22);
}

export function terminalPipelinePenalty(plan: PlayerPlan): number {
  const unfinished = plan.pipeline.shaped * 3 + plan.pipeline.glazed * 2 + plan.pipeline.loaded;
  return plan.remainingRounds <= 1 ? unfinished * 1.8 : unfinished * plan.conversionUrgency * 0.25;
}
