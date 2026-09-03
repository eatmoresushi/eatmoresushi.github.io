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
    case "at_least_n_distinct_decorations": {
      const values = indexedValues(assigned, relation.indices, (ceramic) => ceramic.decoration);
      return values !== null && new Set(values).size >= relation.count;
    }
    case "required_glazes":
      return multisetContains(assigned.map((ceramic) => ceramic.glaze), relation.values);
    case "required_decorations":
      return multisetContains(assigned.map((ceramic) => ceramic.decoration), relation.values);
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


function multisetContains<T>(actual: readonly T[], required: readonly T[]): boolean {
  const remaining = [...actual];
  for (const value of required) {
    const index = remaining.indexOf(value);
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  return true;
}

function shapeSlotsMatch(order: OrderDefinition, selected: readonly FinishedCeramic[]): boolean {
  const used = new Set<number>();
  const search = (slotIndex: number): boolean => {
    if (slotIndex === order.ceramics.length) return true;
    const requirement = order.ceramics[slotIndex];
    if (requirement === undefined) return false;
    for (let index = 0; index < selected.length; index += 1) {
      if (used.has(index)) continue;
      const ceramic = selected[index];
      if (ceramic === undefined) continue;
      if (requirement.shape !== undefined && requirement.shape !== ceramic.shape) continue;
      if (requirement.shapes !== undefined && !requirement.shapes.includes(ceramic.shape)) continue;
      used.add(index);
      if (search(slotIndex + 1)) return true;
      used.delete(index);
    }
    return false;
  };
  return search(0);
}

/**
 * V1.2.4 evaluates Shape, Glaze and Decoration groups independently.
 *
 * V1.2.2's Guan Decoration waiver is gone: Imperial Patronage now pays 2 Coins and 1 VP and
 * exempts nothing, so every submitted ceramic faces every printed requirement.
 */
export function matchesOrder(
  order: OrderDefinition,
  selected: readonly FinishedCeramic[],
): boolean {
  if (selected.length !== order.ceramics.length || new Set(selected.map((ceramic) => ceramic.id)).size !== selected.length) return false;
  if (selected.some((ceramic) => QUALITY_RANK[ceramic.quality] < QUALITY_RANK[order.minQuality])) return false;
  if (!shapeSlotsMatch(order, selected)) return false;
  if (selected.length === 1) {
    const requirement = order.ceramics[0];
    const ceramic = selected[0];
    if (requirement === undefined || ceramic === undefined) return false;
    if (requirement.glaze !== undefined && ceramic.glaze !== requirement.glaze) return false;
    if (requirement.glazes !== undefined && !requirement.glazes.includes(ceramic.glaze)) return false;
    if (requirement.decoration !== undefined && ceramic.decoration !== requirement.decoration) return false;
  }
  const decorations = selected;
  for (const relation of order.relations ?? []) {
    switch (relation.type) {
      case "same_shape":
        if (new Set(selected.map((ceramic) => ceramic.shape)).size !== 1) return false;
        break;
      case "different_shape":
      case "all_different_shape":
        if (new Set(selected.map((ceramic) => ceramic.shape)).size !== selected.length) return false;
        break;
      case "same_glaze":
        if (new Set(selected.map((ceramic) => ceramic.glaze)).size !== 1) return false;
        break;
      case "different_glaze":
      case "all_different_glaze":
        if (new Set(selected.map((ceramic) => ceramic.glaze)).size !== selected.length) return false;
        break;
      case "same_decoration":
        if (decorations.length > 1 && new Set(decorations.map((ceramic) => ceramic.decoration)).size !== 1) return false;
        break;
      case "different_decoration":
        if (new Set(decorations.map((ceramic) => ceramic.decoration)).size !== decorations.length) return false;
        break;
      case "required_glazes":
        if (!multisetContains(selected.map((ceramic) => ceramic.glaze), relation.values)) return false;
        break;
      case "required_decorations":
        if (!multisetContains(decorations.map((ceramic) => ceramic.decoration), relation.values)) return false;
        break;
      case "at_least_n_quality":
        if (selected.filter((ceramic) => QUALITY_RANK[ceramic.quality] >= QUALITY_RANK[relation.quality]).length < relation.count) return false;
        break;
      case "at_least_n_distinct_glazes":
        if (new Set(selected.map((ceramic) => ceramic.glaze)).size < relation.count) return false;
        break;
      case "at_least_n_distinct_decorations":
        if (new Set(decorations.map((ceramic) => ceramic.decoration)).size < Math.min(relation.count, decorations.length)) return false;
        break;
      case "glaze_categories":
        if (!relation.categories.every((category) => selected.some((ceramic) => category.includes(ceramic.glaze)))) return false;
        break;
    }
  }
  return true;
}

/**
 * Ru's Order bonus, in one place.
 *
 * The rule is "once per round, when you complete any Order using a Celadon, Plain
 * Masterpiece, gain 4 VP". Every part of that lived as a literal inside `applyCompleteOrder`
 * and nowhere else, so the AI could not consult it: the shipped evaluator carried no
 * kiln-tradition term at all and chose Orders, Glazes and firing targets without knowing
 * the ability existed. Ru fired 0.47 times per game in self-play against 2 for a human
 * table, and was the weakest Tradition under both policies.
 *
 * These are exported so the engine and the AI answer the question with the same code.
 */
export const RU_BONUS_GLAZE = "celadon" as const;
export const RU_BONUS_DECORATION = "plain" as const;
export const RU_BONUS_QUALITY = "masterpiece" as const;

/** VP Ru scores for delivering a Celadon, Plain Masterpiece into an Order. */
export const RU_ORDER_VP = 4;

/** Does this finished ceramic trigger Ru's bonus? The engine's own test. */
export function ruBonusCeramic(
  ceramic: Pick<FinishedCeramic, "glaze" | "decoration" | "quality">,
  minQuality: "fine" | "masterpiece" = RU_BONUS_QUALITY,
): boolean {
  if (ceramic.glaze !== RU_BONUS_GLAZE || ceramic.decoration !== RU_BONUS_DECORATION) return false;
  return QUALITY_RANK[ceramic.quality] >= QUALITY_RANK[minQuality];
}

/**
 * Could this Order be completed using a Celadon, Plain ceramic?
 *
 * This is a *compatibility* test, not an exact-match one. A slot that fixes no Glaze can be
 * filled with Celadon, and a slot that fixes no Decoration can be filled with Plain, so an
 * open slot qualifies just as much as one that spells out Celadon and Plain. 32 of the 52
 * Orders in the pool admit the bonus on that reading; only a slot demanding some other
 * Glaze or Decoration rules it out. Quality is deliberately not considered here -- whether
 * the ceramic actually fires to Masterpiece is a firing question, not an Order-choice one.
 */
export function orderAdmitsRuBonus(order: OrderDefinition): boolean {
  return order.ceramics.some((requirement) => {
    const glazeOk = requirement.glaze === undefined
      ? requirement.glazes === undefined || requirement.glazes.includes(RU_BONUS_GLAZE)
      : requirement.glaze === RU_BONUS_GLAZE;
    const decorationOk = requirement.decoration === undefined
      || requirement.decoration === RU_BONUS_DECORATION;
    return glazeOk && decorationOk;
  });
}

/**
 * Ge's ability rewrites the chosen ceramic's Decoration to Crackle as a side effect of
 * correcting its Heat. An Order slot that demands some other Decoration therefore cannot
 * receive a ceramic Ge has fixed -- using the ability would break the match.
 *
 * The evaluator already checks this when deciding whether to *fire* the ability
 * (`forced_crackle_breaks_plan`). This predicate is the same rule one step earlier, at the
 * point where the Order is taken: 38 of the 52 Orders leave at least one slot open to
 * Crackle, and an agent that does not look for them takes the other 14 just as readily.
 */
export const GE_BONUS_DECORATION = "crackle" as const;

export function orderAdmitsGeCrackle(order: OrderDefinition): boolean {
  return order.ceramics.some((requirement) => (
    requirement.decoration === undefined || requirement.decoration === GE_BONUS_DECORATION
  ));
}

/**
 * Guan's Order bonus.
 *
 * Unlike Ru, Guan has no execution problem to solve: measured over 1,400 seat-games it
 * fires 1.69 times per game against 1.69 rounds in which it completes an Imperial Order --
 * it already triggers every time it possibly can. What it does not do is *seek* Imperial
 * Orders. It completes 1.70 per game against Jun's 2.03, despite being the only Tradition
 * paid for them, because nothing in the Order valuation knew the ability existed.
 */
/** V1.2.4 Imperial Patronage: 2 Coins and 1 VP on a Crown Order, and no Decoration waiver. */
export const GUAN_ORDER_COINS = 2;
export const GUAN_ORDER_VP = 1;

/**
 * V1.2.2 has one Main Order deck; "Imperial Order" is a Crown count on a card, not deck
 * membership. `isImperialOrder()` and the empty `IMPERIAL_ORDERS` deck it read outlived the
 * separate-deck mechanic and answered `false` for every card in the game. The engine had
 * already moved to `definition.crowns > 0`, so nothing called them.
 */

/**
 * Shapes Ding's extra vessel may copy. Previously a bare array literal inside
 * `applyFormCeramics`, which meant the AI had no way to ask the question.
 */
export const DING_EXTRA_SHAPES = ["bowl", "plate", "washer"] as const;
