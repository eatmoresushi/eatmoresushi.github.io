import {
  ORDER_DEFINITIONS,
  QUALITY_RANK,
  kilnZoneModifier,
  preferredHeat,
  qualityFromDifference,
} from "../game/index.ts";
import type { Decoration, Glaze, OrderDefinition, Quality, Shape } from "../game/index.ts";
import { activeOrderProgressReward } from "./planning.ts";
import type { PlayerObservation, PlayerPlan } from "./types.ts";

interface ProjectedCeramic {
  shape: Shape;
  glaze: Glaze;
  decoration: Decoration;
  quality: Quality;
}

export interface PlanCompatibilitySummary {
  compatibleOrders: number;
  compatibleOrderIds: string[];
  incompatibleOrderIds: string[];
  value: number;
}

export interface SaggerCounterfactual {
  ceramicId: string;
  baseHeat: number;
  revealedFireModifier: number;
  zoneModifier: number;
  preferredHeat: number;
  naturalActualHeat: number;
  zeroFireActualHeat: number;
  naturalQuality: Quality;
  zeroFireQuality: Quality;
  qualityRankDelta: number;
  compatibilityBefore: PlanCompatibilitySummary;
  compatibilityAfter: PlanCompatibilitySummary;
  orderValueDelta: number;
}

function projectedAssignments(
  orderId: string,
  plan: PlayerPlan,
  observation: PlayerObservation,
  changedCeramicId: string,
  changedQuality: Quality,
  changedDecoration?: Decoration,
): ProjectedCeramic[] | null {
  const feasibility = plan.orderFeasibilities.find((candidate) => candidate.orderId === orderId);
  if (feasibility === undefined) return null;
  return feasibility.assignments.map((assignment) => {
    const ceramic = assignment.ceramicId === null ? null : observation.game.ceramics[assignment.ceramicId];
    const isChanged = assignment.ceramicId === changedCeramicId;
    const knownGlaze = ceramic !== null && ceramic !== undefined && ceramic.stage !== "shaped" && ceramic.stage !== "sold"
      ? ceramic.glaze
      : assignment.glaze;
    const knownDecoration = ceramic !== null && ceramic !== undefined && ceramic.stage !== "shaped" && ceramic.stage !== "sold"
      ? ceramic.decoration
      : assignment.decoration;
    const knownQuality = ceramic !== null && ceramic !== undefined && (ceramic.stage === "finished" || ceramic.stage === "delivered" || ceramic.stage === "presented")
      ? ceramic.quality
      : assignment.minQuality;
    return {
      shape: ceramic?.shape ?? assignment.shape,
      glaze: knownGlaze,
      decoration: isChanged ? changedDecoration ?? knownDecoration : knownDecoration,
      quality: isChanged ? changedQuality : knownQuality,
    };
  });
}

function satisfiesOrder(order: OrderDefinition, ceramics: readonly ProjectedCeramic[]): boolean {
  if (ceramics.length !== order.ceramics.length) return false;
  for (let index = 0; index < order.ceramics.length; index += 1) {
    const requirement = order.ceramics[index];
    const ceramic = ceramics[index];
    if (requirement === undefined || ceramic === undefined) return false;
    if (requirement.shape !== undefined && ceramic.shape !== requirement.shape) return false;
    if (requirement.shapes !== undefined && !requirement.shapes.includes(ceramic.shape)) return false;
    if (requirement.glaze !== undefined && ceramic.glaze !== requirement.glaze) return false;
    if (requirement.decoration !== undefined && ceramic.decoration !== requirement.decoration) return false;
    if (QUALITY_RANK[ceramic.quality] < QUALITY_RANK[order.minQuality]) return false;
  }
  const selected = <T>(indices: readonly number[], value: (ceramic: ProjectedCeramic) => T): T[] =>
    indices.flatMap((index) => ceramics[index] === undefined ? [] : [value(ceramics[index]!)]);
  for (const relation of order.relations ?? []) {
    switch (relation.type) {
      case "same_glaze":
        if (new Set(selected(relation.indices, ({ glaze }) => glaze)).size !== 1) return false;
        break;
      case "different_glaze":
      case "all_different_glaze": {
        const values = selected(relation.indices, ({ glaze }) => glaze);
        if (new Set(values).size !== values.length) return false;
        break;
      }
      case "different_shape":
      case "all_different_shape": {
        const values = selected(relation.indices, ({ shape }) => shape);
        if (new Set(values).size !== values.length) return false;
        break;
      }
      case "same_decoration":
        if (new Set(selected(relation.indices, ({ decoration }) => decoration)).size !== 1) return false;
        break;
      case "at_least_n_quality":
        if (ceramics.filter(({ quality }) => QUALITY_RANK[quality] >= QUALITY_RANK[relation.quality]).length < relation.count) return false;
        break;
      case "at_least_n_distinct_glazes":
        if (new Set(selected(relation.indices, ({ glaze }) => glaze)).size < relation.count) return false;
        break;
      case "glaze_categories":
        if (relation.indices.some((index, position) => !relation.categories[position]?.includes(ceramics[index]?.glaze as Glaze))) return false;
        break;
    }
  }
  return true;
}

export function plannedOrderCompatibility(
  observation: PlayerObservation,
  plan: PlayerPlan,
  ceramicId: string,
  quality: Quality,
  decoration?: Decoration,
): PlanCompatibilitySummary {
  const selectedOrderIds = [plan.primaryOrderId, ...plan.secondaryOrderIds].filter((id): id is string => id !== null);
  const relevant = selectedOrderIds.filter((orderId) => plan.orderFeasibilities
    .find((candidate) => candidate.orderId === orderId)?.assignments.some((assignment) => assignment.ceramicId === ceramicId));
  const compatibleOrderIds: string[] = [];
  const incompatibleOrderIds: string[] = [];
  let value = 0;
  for (const orderId of relevant) {
    const order = ORDER_DEFINITIONS[orderId];
    const ceramics = projectedAssignments(orderId, plan, observation, ceramicId, quality, decoration);
    if (order !== undefined && ceramics !== null && satisfiesOrder(order, ceramics)) {
      compatibleOrderIds.push(orderId);
      value += order.vp + order.coins * 0.35 +
        activeOrderProgressReward(observation, order.imperialProgressReward) * 2.4;
    } else {
      incompatibleOrderIds.push(orderId);
    }
  }
  return {
    compatibleOrders: compatibleOrderIds.length,
    compatibleOrderIds,
    incompatibleOrderIds,
    value,
  };
}

/**
 * Computes both outcomes from public state at the after-Fire window. It never
 * reads ceramicResults, which the engine intentionally has not populated yet.
 */
export function projectSaggerCounterfactual(
  observation: PlayerObservation,
  plan: PlayerPlan,
  ceramicId: string,
): SaggerCounterfactual | null {
  const ceramic = observation.game.ceramics[ceramicId];
  const firing = observation.game.firingContext;
  if (
    ceramic?.stage !== "loaded" ||
    firing?.baseHeat === null ||
    firing?.baseHeat === undefined ||
    firing.fireModifier === null ||
    firing.fireModifier === undefined
  ) return null;
  const zone = kilnZoneModifier(ceramic.kilnSpaceId);
  const preferred = preferredHeat(ceramic.glaze);
  const naturalActual = firing.baseHeat + firing.fireModifier + zone;
  const zeroActual = firing.baseHeat + zone;
  const naturalQuality = qualityFromDifference(Math.abs(naturalActual - preferred));
  const zeroFireQuality = qualityFromDifference(Math.abs(zeroActual - preferred));
  const before = plannedOrderCompatibility(observation, plan, ceramicId, naturalQuality);
  const after = plannedOrderCompatibility(observation, plan, ceramicId, zeroFireQuality);
  return {
    ceramicId,
    baseHeat: firing.baseHeat,
    revealedFireModifier: firing.fireModifier,
    zoneModifier: zone,
    preferredHeat: preferred,
    naturalActualHeat: naturalActual,
    zeroFireActualHeat: zeroActual,
    naturalQuality,
    zeroFireQuality,
    qualityRankDelta: QUALITY_RANK[zeroFireQuality] - QUALITY_RANK[naturalQuality],
    compatibilityBefore: before,
    compatibilityAfter: after,
    orderValueDelta: after.value - before.value,
  };
}
