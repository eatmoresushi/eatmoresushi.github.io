import { DECORATIONS, GLAZES, ORDER_DEFINITIONS, SHAPES, matchesOrder } from "../game/index.ts";
import type { Decoration, FinishedCeramic, Glaze, OrderId, Shape } from "../game/index.ts";

const cache = new Map<OrderId, readonly FinishedCeramic[]>();
const EMPTY: readonly FinishedCeramic[] = Object.freeze([]);
const PREFERRED_SHAPES: readonly Shape[] = ["bowl", "vase", "plate"];

function preferredFirst<T>(values: readonly T[], preferred: T): T[] {
  return values.includes(preferred) ? [preferred, ...values.filter((value) => value !== preferred)] : [...values];
}

/**
 * Illustrative examples only: the engine decides whether the finished group
 * meets the Order. Relation hints order the search without duplicating legality.
 * Quality stays in the card's text; no example depends on Ge's Crackle ability.
 */
export function orderIllustrationCeramics(id: OrderId): readonly FinishedCeramic[] {
  const cached = cache.get(id);
  if (cached !== undefined) return cached;
  const order = ORDER_DEFINITIONS[id];
  if (order === undefined) return EMPTY;

  const shapes = order.ceramics.map((_, index) => PREFERRED_SHAPES[index % PREFERRED_SHAPES.length]!);
  const glazes = order.ceramics.map((_, index) => GLAZES[index % GLAZES.length]!);
  const decorations = order.ceramics.map((_, index) => DECORATIONS[index % DECORATIONS.length]!);
  for (const relation of order.relations ?? []) {
    switch (relation.type) {
      case "same_shape": shapes.fill(shapes[0]!); break;
      case "same_glaze": glazes.fill(glazes[0]!); break;
      case "same_decoration": decorations.fill(decorations[0]!); break;
      case "same_nonplain_decoration": decorations.fill("carved"); break;
      case "required_glazes": relation.values.forEach((value, index) => { glazes[index] = value; }); break;
      case "required_decorations": relation.values.forEach((value, index) => { decorations[index] = value; }); break;
      case "glaze_categories": relation.categories.forEach((category, index) => { glazes[index] = category[0] ?? glazes[index]!; }); break;
    }
  }

  const candidates = order.ceramics.map((requirement, index) => {
    const allowedShapes = requirement.shape ? [requirement.shape] : requirement.shapes ?? SHAPES;
    // Multi-ceramic attribute requirements are independent groups, not paired
    // slot constraints. Their relation data is validated by matchesOrder below.
    const allowedGlazes: readonly Glaze[] = order.ceramics.length === 1
      ? requirement.glaze ? [requirement.glaze] : requirement.glazes ?? GLAZES : GLAZES;
    const allowedDecorations: readonly Decoration[] = order.ceramics.length === 1
      ? requirement.decoration ? [requirement.decoration] : requirement.decorations ?? DECORATIONS : DECORATIONS;
    return preferredFirst(allowedShapes, shapes[index]!).flatMap((shape) =>
      preferredFirst(allowedGlazes, glazes[index]!).flatMap((glaze) =>
        preferredFirst(allowedDecorations, decorations[index]!).map((decoration): FinishedCeramic => ({
          id: `order-art-${id}-${index}`,
          vesselInstanceId: `order-art-${id}-${index}`,
          ownerId: "order-art",
          stage: "finished",
          shape,
          glaze,
          decoration,
          quality: "masterpiece",
          firedInRound: 1,
        })),
      ),
    );
  });
  const selected: FinishedCeramic[] = [];
  const search = (index: number): boolean => {
    if (index === candidates.length) return matchesOrder(order, selected);
    for (const candidate of candidates[index]!) {
      selected.push(candidate);
      if (search(index + 1)) return true;
      selected.pop();
    }
    return false;
  };
  if (!search(0)) throw new Error(`No valid illustration for Order ${id}`);
  const result = Object.freeze(selected);
  cache.set(id, result);
  return result;
}
