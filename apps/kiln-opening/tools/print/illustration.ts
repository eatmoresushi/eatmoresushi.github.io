/**
 * The ceramic picture on each printed Order card, from the Order's data entry (ceramics and
 * relations, already checked against the rulebook text by `orderSource.ts`).
 *
 * The text is authoritative; the picture shows one valid combination, drawn with the game's
 * 20 neutral cutouts tinted per Glaze (as `src/app/pieces/CeramicArt` does):
 *
 * - a fixed Shape, Glaze or Decoration is drawn as required;
 * - "any Glaze" is the untinted neutral cutout, "any Decoration" the Plain cutout, "any Shape"
 *   a Bowl;
 * - Shape alternatives ("Bowl, Plate or Brush Washer") show every alternative, smaller, side by
 *   side (`layout: "alternatives"`); Decoration alternatives ("any Shape · any Glaze · Carved,
 *   Impressed or Painted") likewise show one ceramic per alternative Decoration, grouped the
 *   same way (a Bowl each, for "any Shape"). A slot never has both kinds of alternative;
 *   the run fails if one does;
 * - multi-ceramic Orders show each ceramic, grouped and slightly overlapping (`layout: "group"`):
 *   per-ceramic Glazes and Decorations as listed; "same Glaze" the same neutral; "different
 *   Glazes" distinct tints; "different Decorations" distinct Decorations; "same Decoration" one
 *   Decoration on all; "N different Shapes" Bowl + Plate (+ Vase); "2 ceramics of the same
 *   Shape" two Bowls; "at least 2 different Decorations" two distinct, the rest Plain (any).
 */
import type { CeramicSlot, Decoration, Glaze, OrderData, Relation, Shape } from "./orderSource.ts";

export interface Figure {
  shape: Shape;
  decoration: Decoration;
  /** Null: "any Glaze", the untinted neutral cutout. */
  glaze: Glaze | null;
}

export interface Illustration {
  layout: "single" | "alternatives" | "group";
  figures: Figure[];
}

/** Shapes used for unrestricted slots that must differ, in order. */
const SHAPE_ORDER: Shape[] = ["bowl", "plate", "vase", "washer", "censer"];
/** Tints for "different Glazes", most distinct from each other (and from the neutral) first. */
const GLAZE_ORDER: Glaze[] = ["celadon", "moon_white", "grey_green", "white"];
/** Decorations for "different Decorations", most distinct at card size first. */
const DECORATION_ORDER: Decoration[] = ["carved", "painted", "impressed"];
/** The Decoration shown for "same Decoration": the most visible pattern at print size. */
const SAME_DECORATION: Decoration = "painted";

function pickDistinct<T>(order: T[], taken: Array<T | null | undefined>): T {
  const next = order.find((value) => !taken.includes(value));
  if (next === undefined) throw new Error("illustration: ran out of distinct values");
  return next;
}

export function illustrationFor(order: OrderData): Illustration {
  const slots: CeramicSlot[] = order.ceramics;
  const relations: Relation[] = order.relations ?? [];
  const only = slots[0];
  if (slots.length === 1 && only !== undefined) {
    if (only.shapes !== undefined && only.decorations !== undefined) {
      throw new Error(`${order.id}: illustration: a ceramic with both Shape and Decoration alternatives`);
    }
    const glaze = only.glaze ?? null;
    const decoration = only.decoration ?? "plain";
    if (only.shapes !== undefined) {
      return { layout: "alternatives", figures: only.shapes.map((shape) => ({ shape, glaze, decoration })) };
    }
    const shape = only.shape ?? "bowl";
    if (only.decorations !== undefined) {
      return { layout: "alternatives", figures: only.decorations.map((alternative) => ({ shape, glaze, decoration: alternative })) };
    }
    return { layout: "single", figures: [{ shape, glaze, decoration }] };
  }

  const shapes: Array<Shape | undefined> = slots.map((slot) => slot.shape);
  const glazes: Array<Glaze | null | undefined> = slots.map((slot) => slot.glaze);
  // A ceramic of a multi-ceramic Order that may take any of several Decorations shows the first.
  const decorations: Array<Decoration | undefined> = slots.map((slot) => slot.decoration ?? slot.decorations?.[0]);
  for (const relation of relations) {
    switch (relation.type) {
      case "required_glazes":
        relation.values.forEach((glaze, index) => {
          glazes[index] = glaze;
        });
        break;
      case "required_decorations":
        relation.values.forEach((decoration, index) => {
          decorations[index] = decoration;
        });
        break;
      case "same_glaze":
        for (const index of relation.indices) glazes[index] = null;
        break;
      case "same_shape":
        for (const index of relation.indices) shapes[index] = "bowl";
        break;
      case "same_decoration":
        for (const index of relation.indices) decorations[index] = SAME_DECORATION;
        break;
      default:
        break;
    }
  }
  for (const relation of relations) {
    switch (relation.type) {
      case "different_shape":
      case "all_different_shape":
        for (const index of relation.indices) shapes[index] ??= pickDistinct(SHAPE_ORDER, shapes);
        break;
      case "different_glaze":
      case "all_different_glaze":
        for (const index of relation.indices) glazes[index] ??= pickDistinct(GLAZE_ORDER, glazes);
        break;
      case "different_decoration":
        for (const index of relation.indices) decorations[index] ??= pickDistinct(DECORATION_ORDER, decorations);
        break;
      case "at_least_n_distinct_decorations":
        for (const index of relation.indices.slice(0, relation.count)) decorations[index] ??= pickDistinct(DECORATION_ORDER, decorations);
        break;
      default:
        break;
    }
  }
  return {
    layout: "group",
    figures: slots.map((_, index) => ({
      shape: shapes[index] ?? "bowl",
      glaze: glazes[index] ?? null,
      decoration: decorations[index] ?? "plain",
    })),
  };
}

/** Checks the picture is one valid combination for the Order's data; returns problems. */
export function checkIllustration(order: OrderData, art: Illustration): string[] {
  const problems: string[] = [];
  const say = (message: string): void => {
    problems.push(`${order.id}: illustration ${message}`);
  };
  if (order.ceramics.length === 1) {
    // One figure per alternative (Shape or Decoration), each otherwise as required.
    const slot = order.ceramics[0] ?? {};
    const shapes = slot.shapes ?? [slot.shape ?? "bowl"];
    const decorations = slot.decorations ?? [slot.decoration ?? "plain"];
    const count = Math.max(shapes.length, decorations.length);
    const expectedLayout = count > 1 ? "alternatives" : "single";
    if (shapes.length > 1 && decorations.length > 1) say("cannot show both Shape and Decoration alternatives");
    if (art.layout !== expectedLayout) say(`layout "${art.layout}", expected "${expectedLayout}"`);
    if (art.figures.length !== count) say(`has ${art.figures.length} ceramics for ${count} alternative(s)`);
    const at = <T>(list: T[], index: number): T | undefined => (list.length === 1 ? list[0] : list[index]);
    art.figures.forEach((figure, index) => {
      if (figure.shape !== at(shapes, index)) say(`ceramic ${index + 1} shows the wrong Shape`);
      if (figure.glaze !== (slot.glaze ?? null)) say(`ceramic ${index + 1} shows the wrong Glaze`);
      if (figure.decoration !== at(decorations, index)) say(`ceramic ${index + 1} shows the wrong Decoration`);
    });
    return problems;
  }
  const figures = art.figures;
  if (figures.length !== order.ceramics.length) say(`has ${figures.length} ceramics for ${order.ceramics.length}`);
  order.ceramics.forEach((slot, index) => {
    const figure = figures[index];
    if (figure === undefined) return;
    if (slot.shape !== undefined && figure.shape !== slot.shape) say(`ceramic ${index + 1} is not a ${slot.shape}`);
    if (slot.shapes !== undefined && !slot.shapes.includes(figure.shape)) say(`ceramic ${index + 1} is not one of ${slot.shapes.join("/")}`);
    if (slot.glaze !== undefined && figure.glaze !== slot.glaze) say(`ceramic ${index + 1} is not ${slot.glaze}`);
    if (slot.decoration !== undefined && figure.decoration !== slot.decoration) say(`ceramic ${index + 1} is not ${slot.decoration}`);
    if (slot.decorations !== undefined && !slot.decorations.includes(figure.decoration)) say(`ceramic ${index + 1} is not one of ${slot.decorations.join("/")}`);
  });
  const distinct = (values: unknown[]): boolean => new Set(values).size === values.length;
  for (const relation of order.relations ?? []) {
    const pick = <K extends keyof Figure>(key: K, list: number[]): Array<Figure[K] | undefined> => list.map((index) => figures[index]?.[key]);
    switch (relation.type) {
      case "different_shape":
      case "all_different_shape":
        if (!distinct(pick("shape", relation.indices))) say("Shapes are not all different");
        break;
      case "same_shape":
        if (new Set(pick("shape", relation.indices)).size !== 1) say("Shapes are not the same");
        break;
      case "same_glaze":
        if (new Set(pick("glaze", relation.indices)).size !== 1) say("Glazes are not the same");
        break;
      case "different_glaze":
      case "all_different_glaze":
        if (!distinct(pick("glaze", relation.indices)) || pick("glaze", relation.indices).includes(null)) say("Glazes are not distinct tints");
        break;
      case "same_decoration":
        if (new Set(pick("decoration", relation.indices)).size !== 1) say("Decorations are not the same");
        break;
      case "different_decoration":
        if (!distinct(pick("decoration", relation.indices))) say("Decorations are not all different");
        break;
      case "at_least_n_distinct_decorations":
        if (new Set(pick("decoration", relation.indices)).size < relation.count) say("has too few distinct Decorations");
        break;
      case "required_glazes": {
        const shown = figures.map((figure) => figure.glaze);
        const missing = [...relation.values];
        for (const glaze of shown) {
          const at = missing.indexOf(glaze as Glaze);
          if (at >= 0) missing.splice(at, 1);
        }
        if (missing.length > 0) say(`lacks Glaze ${missing.join(", ")}`);
        break;
      }
      case "required_decorations": {
        const missing = [...relation.values];
        for (const figure of figures) {
          const at = missing.indexOf(figure.decoration);
          if (at >= 0) missing.splice(at, 1);
        }
        if (missing.length > 0) say(`lacks Decoration ${missing.join(", ")}`);
        break;
      }
      case "at_least_n_quality":
        break;
    }
  }
  return problems;
}
