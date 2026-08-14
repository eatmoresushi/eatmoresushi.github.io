import type { OrderDefinition, OrderRelationDefinition } from "./content.ts";
import { QUALITY_RANK } from "./firingRules.ts";
import type { FinishedCeramic } from "./types.ts";

function requirementMatches(
  order: OrderDefinition,
  slotIndex: number,
  ceramic: FinishedCeramic,
  ignoredDecorationIndex: number | null,
): boolean {
  const requirement = order.ceramics[slotIndex];
  if (requirement === undefined) return false;
  if (requirement.shape !== undefined && requirement.shape !== ceramic.shape) return false;
  if (requirement.shapes !== undefined && !requirement.shapes.includes(ceramic.shape)) return false;
  if (requirement.glaze !== undefined && requirement.glaze !== ceramic.glaze) return false;
  if (requirement.glazes !== undefined && !requirement.glazes.includes(ceramic.glaze)) return false;
  if (
    ignoredDecorationIndex !== slotIndex &&
    requirement.decoration !== undefined &&
    requirement.decoration !== ceramic.decoration
  ) {
    return false;
  }
  return QUALITY_RANK[ceramic.quality] >= QUALITY_RANK[order.minQuality];
}

function indexedValues<T>(
  ceramics: readonly FinishedCeramic[],
  indices: readonly number[],
  select: (ceramic: FinishedCeramic) => T,
): T[] | null {
  const values: T[] = [];
  for (const index of indices) {
    const ceramic = ceramics[index];
    if (ceramic === undefined) return null;
    values.push(select(ceramic));
  }
  return values;
}

function relationMatches(
  relation: OrderRelationDefinition,
  assigned: readonly FinishedCeramic[],
): boolean {
  switch (relation.type) {
    case "same_glaze": {
      const values = indexedValues(assigned, relation.indices, (ceramic) => ceramic.glaze);
      return values !== null && new Set(values).size === 1;
    }
    case "same_shape": {
      const values = indexedValues(assigned, relation.indices, (ceramic) => ceramic.shape);
      return values !== null && new Set(values).size === 1;
    }
    case "different_glaze":
    case "all_different_glaze": {
      const values = indexedValues(assigned, relation.indices, (ceramic) => ceramic.glaze);
      return values !== null && new Set(values).size === values.length;
    }
    case "different_shape":
    case "all_different_shape": {
      const values = indexedValues(assigned, relation.indices, (ceramic) => ceramic.shape);
      return values !== null && new Set(values).size === values.length;
    }
    case "same_decoration": {
      const values = indexedValues(assigned, relation.indices, (ceramic) => ceramic.decoration);
      return values !== null && new Set(values).size === 1;
    }
    case "different_decoration": {
      const values = indexedValues(assigned, relation.indices, (ceramic) => ceramic.decoration);
      return values !== null && new Set(values).size === values.length;
    }
    case "at_least_n_quality":
      return (
        assigned.filter(
          (ceramic) => QUALITY_RANK[ceramic.quality] >= QUALITY_RANK[relation.quality],
        ).length >= relation.count
      );
    case "at_least_n_distinct_glazes": {
      const values = indexedValues(assigned, relation.indices, (ceramic) => ceramic.glaze);
      return values !== null && new Set(values).size >= relation.count;
    }
    case "glaze_categories":
      return relation.indices.every((index, categoryIndex) => {
        const ceramic = assigned[index];
        const category = relation.categories[categoryIndex];
        return ceramic !== undefined && category !== undefined && category.includes(ceramic.glaze);
      });
  }
}

function assignmentMatchesRelations(
  order: OrderDefinition,
  assigned: readonly FinishedCeramic[],
): boolean {
  return (order.relations ?? []).every((relation) => relationMatches(relation, assigned));
}

function hasValidAssignment(
  order: OrderDefinition,
  selected: readonly FinishedCeramic[],
  ignoredDecorationIndex: number | null,
): boolean {
  const assigned: FinishedCeramic[] = [];
  const used = new Set<number>();

  const search = (slotIndex: number): boolean => {
    if (slotIndex === order.ceramics.length) {
      return assignmentMatchesRelations(order, assigned);
    }
    for (let ceramicIndex = 0; ceramicIndex < selected.length; ceramicIndex += 1) {
      if (used.has(ceramicIndex)) continue;
      const ceramic = selected[ceramicIndex];
      if (
        ceramic === undefined ||
        !requirementMatches(order, slotIndex, ceramic, ignoredDecorationIndex)
      ) {
        continue;
      }
      used.add(ceramicIndex);
      assigned[slotIndex] = ceramic;
      if (search(slotIndex + 1)) return true;
      used.delete(ceramicIndex);
    }
    return false;
  };

  return search(0);
}

export function matchesOrder(
  order: OrderDefinition,
  selected: readonly FinishedCeramic[],
  useGuanDecorationWaiver: boolean,
): boolean {
  if (selected.length !== order.ceramics.length) return false;
  if (new Set(selected.map((ceramic) => ceramic.id)).size !== selected.length) return false;
  if (!useGuanDecorationWaiver) return hasValidAssignment(order, selected, null);

  const decorationIndices = order.ceramics
    .map((requirement, index) => (requirement.decoration === undefined ? null : index))
    .filter((index): index is number => index !== null);
  return decorationIndices.some((index) => hasValidAssignment(order, selected, index));
}
