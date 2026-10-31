/**
 * The Materials Yard sub-draft (UI_V1.6.1_ARCHITECTURE §3.4; wireframe `subEditor`
 * materials_yard). Owner: B4.
 *
 * Choices: the Clay/Wood split (4, or 8 for the Shifu effect, v1.6.2 L194–195; there is no Coin
 * option) and Prepared Clay (T17: a Shape and a Decoration). Every list comes from
 * `materialsYardOptions(view, worker)` (§5 gap 14); the complete draft is quoted with
 * `quoteMaterialsYard`. A Prepared Clay Decoration is offered per chosen Shape from the
 * selector's legal `pairs` (never the cross product).
 */
import { materialsYardOptions, quoteMaterialsYard } from "../../../../game/index.ts";
import type { CostQuote, Decoration, ResourceState, Shape } from "../../../../game/index.ts";
import { techName } from "../../../i18n/content.ts";
import { ceramicLabel } from "../../../i18n/ceramicLabel.ts";
import { msg } from "../../../i18n/translator.ts";
import type { MessageParam, RichMessage } from "../../../i18n/translator.ts";
import { placementWorkerKey } from "../../../state/tableSelection.ts";
import { keepIfSame, keyOf, viewMemo } from "../context.ts";
import type { LocationDraftModel, PlacementCommandOf, PlacementContext } from "./editor.ts";
import { resourcesAfter } from "./shared.ts";

const PREPARED_CLAY = "T17" as const;

export interface MaterialsYardDraft {
  /** Clay of the split (Wood is the rest); null until chosen. */
  readonly clay: number | null;
  /** Prepared Clay, when used. */
  readonly preparedClay: { readonly shape: Shape | null; readonly decoration: Decoration | null } | null;
}

export type MaterialsYardAction =
  | { readonly type: "clay"; readonly clay: number }
  | { readonly type: "preparedClay"; readonly on: boolean }
  | { readonly type: "pcShape"; readonly shape: Shape }
  | { readonly type: "pcDecoration"; readonly decoration: Decoration };

export interface MaterialsYardOptions {
  resources: number;
  splits: ReadonlyArray<{ clay: number; wood: number }>;
  /** Prepared Clay: Shapes legal now and the Decorations for the chosen Shape. */
  preparedClay: { techId: typeof PREPARED_CLAY; shapes: readonly Shape[]; decorations: readonly Decoration[] } | null;
  /** The quote of the complete draft, or null while incomplete. */
  quote: CostQuote | null;
  after: ResourceState | null;
}

const BLANK: MaterialsYardDraft = Object.freeze({ clay: null, preparedClay: null });

function selectorOptions(context: PlacementContext) {
  return viewMemo(context.view, `materialsYardOptions:${placementWorkerKey(context.worker)}`, () => materialsYardOptions(context.view, context.worker));
}

function preparedOptions(draft: MaterialsYardDraft, context: PlacementContext): MaterialsYardOptions["preparedClay"] {
  const prepared = selectorOptions(context).preparedClay;
  if (prepared === null) return null;
  const pairs = prepared.pairs;
  const shapes = prepared.shapes.filter((shape) => pairs.some((pair) => pair.shape === shape));
  const chosen = draft.preparedClay?.shape ?? null;
  const decorations = chosen === null ? [] : prepared.decorations.filter((decoration) => pairs.some((pair) => pair.shape === chosen && pair.decoration === decoration));
  return { techId: PREPARED_CLAY, shapes, decorations };
}

function command(draft: MaterialsYardDraft, context: PlacementContext): PlacementCommandOf<"materials_yard"> | null {
  if (draft.clay === null) return null;
  const resources = selectorOptions(context).resources;
  const prepared = draft.preparedClay;
  if (prepared !== null && (prepared.shape === null || prepared.decoration === null)) return null;
  return {
    type: "PLACE_MATERIALS_YARD",
    workerId: context.worker.workerId,
    clay: draft.clay,
    wood: resources - draft.clay,
    ...(context.worker.seniorApprentice ? { seniorApprentice: true } : {}),
    ...(prepared === null || prepared.shape === null || prepared.decoration === null ? {} : { preparedClay: { shape: prepared.shape, decoration: prepared.decoration } }),
  };
}

function quoteOf(draft: MaterialsYardDraft, context: PlacementContext): CostQuote | null {
  const built = command(draft, context);
  if (built === null) return null;
  return viewMemo(context.view, `quoteMaterialsYard:${keyOf(built)}`, () => quoteMaterialsYard(context.actor, built));
}

function revalidate(draft: MaterialsYardDraft, context: PlacementContext): MaterialsYardDraft {
  const resources = selectorOptions(context).resources;
  const clay = draft.clay !== null && draft.clay >= 0 && draft.clay <= resources ? draft.clay : null;
  let preparedClay = draft.preparedClay;
  const prepared = preparedOptions(draft, context);
  if (preparedClay !== null) {
    if (prepared === null) preparedClay = null;
    else {
      const shape = preparedClay.shape !== null && prepared.shapes.includes(preparedClay.shape) ? preparedClay.shape : null;
      const decorations = preparedOptions({ ...draft, preparedClay: { shape, decoration: null } }, context)?.decorations ?? [];
      const decoration = shape !== null && preparedClay.decoration !== null && decorations.includes(preparedClay.decoration) ? preparedClay.decoration : null;
      preparedClay = { shape, decoration };
    }
  }
  return keepIfSame(draft, { clay, preparedClay });
}

export const materialsYardDraft: LocationDraftModel<"materials_yard", MaterialsYardDraft, MaterialsYardAction, MaterialsYardOptions> = {
  locationId: "materials_yard",
  blank: () => BLANK,
  prepare: (draft, context) => revalidate(draft, context),
  reduce(draft, action, context) {
    switch (action.type) {
      case "revalidate":
        return revalidate(draft, context);
      case "clay":
        return revalidate({ ...draft, clay: action.clay }, context);
      case "preparedClay":
        return revalidate({ ...draft, preparedClay: action.on ? { shape: null, decoration: null } : null }, context);
      case "pcShape":
        return draft.preparedClay === null ? draft : revalidate({ ...draft, preparedClay: { shape: action.shape, decoration: draft.preparedClay.decoration } }, context);
      case "pcDecoration":
        return draft.preparedClay === null ? draft : revalidate({ ...draft, preparedClay: { shape: draft.preparedClay.shape, decoration: action.decoration } }, context);
    }
  },
  options(draft, context) {
    const resources = selectorOptions(context).resources;
    const splits = Array.from({ length: resources + 1 }, (_, index) => ({ clay: resources - index, wood: index }));
    const quote = quoteOf(draft, context);
    return {
      resources,
      splits,
      preparedClay: preparedOptions(draft, context),
      quote,
      after: resourcesAfter(context.me.resources, quote),
    };
  },
  build: (draft, context) => command(draft, context),
  fromCommand(cmd, context) {
    const resources = selectorOptions(context).resources;
    if (cmd.clay + cmd.wood !== resources || cmd.preparedClay?.useDecoratorsKit === true) return null;
    return {
      clay: cmd.clay,
      preparedClay: cmd.preparedClay === undefined ? null : { shape: cmd.preparedClay.shape, decoration: cmd.preparedClay.decoration },
    };
  },
  detail(draft, context): MessageParam | null {
    if (draft.clay === null) return null;
    const wood = selectorOptions(context).resources - draft.clay;
    const clay = draft.clay;
    const split: RichMessage = plainDetail(clay, wood);
    const prepared = draft.preparedClay;
    if (prepared === null || prepared.shape === null || prepared.decoration === null) return split;
    const vessel = { ownerId: context.playerId, shape: prepared.shape, decoration: prepared.decoration };
    return msg("work.my.detailPrepared", {
      split,
      tech: (t) => techName(PREPARED_CLAY, t.locale),
      vessel: (t) => ceramicLabel(vessel, { viewerId: context.playerId, players: [] }, { locale: t, withOwner: false, withPlace: false }),
    });
  },
};

function plainDetail(clay: number, wood: number): RichMessage {
  return msg("work.my.detail", { clay, wood });
}
