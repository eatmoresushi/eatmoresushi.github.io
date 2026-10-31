/**
 * The Form & Decorate sub-draft (UI_V1.6.1_ARCHITECTURE §3.4, §5 gap 6; wireframe `subEditor`
 * form_decorate). Owner: B4.
 *
 * Choices: 1 vessel (Apprentice) or 1–2 (Shifu, `placementLimits(...).maxVessels`), each a Shape
 * and a Decoration; Large Throwing Wheel and Decorator's Kit when `formDiscountVariants` offers
 * them; Ding's extra vessel on an index `dingCopyableVesselIndexes` lists. The engine's quote
 * (`quoteFormDecorate`, live per draft, gap 6) prices the draft. Each vessel costs its Shape's
 * Clay and 2 Coins, whatever its Decoration (L201, L354, change 30): the Decoration has no
 * cost of its own; the Shifu's −1 Coin for two vessels and Decorator's Kit are reductions (L658),
 * Ding's extra vessel costs 1 Clay and 2 Coins (L488), and the quote lists them all (`vessel_coins`,
 * `shifu_discount`, …).
 *
 * The form offers exactly what the engine allows now. Every Shape and Decoration of every vessel
 * is listed (the vocabulary of the action), but one is available only when some command placing
 * this worker, consistent with the other choices made, passes `validateAction` (with any discount
 * `formDiscountVariants` offers), as `placementOptions` probes a location; an unavailable one
 * carries the engine's error for the first such command as its reason. The second vessel is
 * offered only when some legal two-vessel command exists, and Ding's extra vessel only when the
 * chosen Shapes give a legal command with it. No rule is decided here: every answer is a
 * `validateAction` verdict.
 */
import { DECORATIONS, SHAPES, dingCopyableVesselIndexes, formDiscountVariants, placementLimits, quoteFormDecorate, validateAction } from "../../../../game/index.ts";
import type { CostLine, CostQuote, Decoration, FormVesselSpec, GameRuleError, ResourceState, Shape } from "../../../../game/index.ts";
import { ceramicLabel } from "../../../i18n/ceramicLabel.ts";
import { kilnText } from "../../../i18n/content.ts";
import { msg } from "../../../i18n/translator.ts";
import type { Deferred, MessageParam, RichMessage } from "../../../i18n/translator.ts";
import { keepIfSame, keyOf, viewMemo } from "../context.ts";
import type { LocationDraftModel, PlacementCommandOf, PlacementContext } from "./editor.ts";
import { resourcesAfter } from "./shared.ts";

/**
 * One row of the quote as the pane lists it: an engine cost line, or Ding's extra vessel, whose
 * Clay and Coin lines (`ding_extra`) make one row naming the Shape it copies ("Moulded
 * Production: Bowl · 1 Clay, 2 Coins", change 40), so the cost never reads as charged twice.
 */
export type QuoteRow = { readonly kind: "line"; readonly line: CostLine } | { readonly kind: "ding"; readonly shape: Shape | null; readonly amounts: ResourceState };

/** The quote's lines as rows (`QuoteRow`), in the quote's order; Ding's row where its first line was. */
export function quoteRows(quote: CostQuote, draft: FormDecorateDraft): QuoteRow[] {
  const rows: QuoteRow[] = [];
  let ding: { shape: Shape | null; amounts: ResourceState } | null = null;
  for (const line of quote.lines) {
    if (line.kind !== "ding_extra") {
      rows.push({ kind: "line", line });
      continue;
    }
    if (ding === null) {
      const copied = draft.ding?.index ?? null;
      ding = { shape: copied === null ? null : draft.vessels[copied]?.shape ?? null, amounts: { clay: 0, wood: 0, coins: 0 } };
      rows.push({ kind: "ding", shape: ding.shape, amounts: ding.amounts });
    }
    ding.amounts[line.resource] += line.amount;
  }
  return rows;
}

const LARGE_THROWING_WHEEL = "T01" as const;
const DECORATORS_KIT = "T16" as const;
const DING = "DI" as const;

export interface FormVesselDraft {
  readonly shape: Shape | null;
  readonly decoration: Decoration | null;
}

export interface FormDecorateDraft {
  /** One vessel, or two for the Shifu effect. */
  readonly vessels: readonly FormVesselDraft[];
  readonly wheel: boolean;
  readonly kitIndex: number | null;
  /** Ding's extra vessel, when used. */
  readonly ding: { readonly index: number | null; readonly decoration: Decoration | null } | null;
}

export type FormDecorateAction =
  | { readonly type: "shape"; readonly index: number; readonly shape: Shape }
  | { readonly type: "decoration"; readonly index: number; readonly decoration: Decoration }
  | { readonly type: "second"; readonly on: boolean }
  | { readonly type: "wheel"; readonly on: boolean }
  | { readonly type: "kit"; readonly index: number | null }
  | { readonly type: "ding"; readonly on: boolean }
  | { readonly type: "dingIndex"; readonly index: number }
  | { readonly type: "dingDecoration"; readonly decoration: Decoration };

/** One choice and whether the engine allows it now; `reason` is the engine's error when not. */
export interface Availability {
  available: boolean;
  reason: GameRuleError | null;
}

export interface FormVesselOptions {
  /** Every Shape, with its printed Clay and whether it may be chosen for this vessel now. */
  shapes: ReadonlyArray<{ shape: Shape; clay: number | null } & Availability>;
  /** Every Decoration and whether it may be chosen for this vessel now (none has a cost, change 30). */
  decorations: ReadonlyArray<{ decoration: Decoration } & Availability>;
}

export interface FormDecorateOptions {
  maxVessels: number;
  /** Every Shape, with its printed Clay (from the quote's lines). */
  shapes: ReadonlyArray<{ shape: Shape; clay: number | null }>;
  /** Every Decoration (none has a cost of its own, L354). */
  decorations: ReadonlyArray<{ decoration: Decoration }>;
  /** The Coins every vessel costs before any reduction (the quote's `vessel_coins` line), or null. */
  vesselCoins: number | null;
  /** Per vessel of the draft: each Shape's and Decoration's availability now. */
  vessels: readonly FormVesselOptions[];
  /**
   * The second vessel: null when this worker forms one, or when no two-vessel command is legal;
   * else whether it may be added to the first vessel as chosen (always when it is already on).
   */
  second: Availability | null;
  /** Large Throwing Wheel, when it applies to these vessels. */
  wheel: { techId: typeof LARGE_THROWING_WHEEL } | null;
  /** Decorator's Kit: the vessels it may reduce. */
  kit: { techId: typeof DECORATORS_KIT; indexes: readonly number[] } | null;
  /**
   * Ding: offered only when every vessel has a Shape and some legal command with these Shapes
   * adds Ding's vessel. The vessels it may copy, and each extra-vessel Decoration's availability.
   */
  ding: { kilnId: typeof DING; indexes: readonly number[]; decorations: ReadonlyArray<{ decoration: Decoration } & Availability> } | null;
  quote: CostQuote | null;
  after: ResourceState | null;
}

const EMPTY_VESSEL: FormVesselDraft = Object.freeze({ shape: null, decoration: null });
const BLANK: FormDecorateDraft = Object.freeze({ vessels: Object.freeze([EMPTY_VESSEL]), wheel: false, kitIndex: null, ding: null });

function complete(vessels: readonly FormVesselDraft[]): FormVesselSpec[] | null {
  const specs: FormVesselSpec[] = [];
  for (const vessel of vessels) {
    if (vessel.shape === null || vessel.decoration === null) return null;
    specs.push({ shape: vessel.shape, decoration: vessel.decoration });
  }
  return specs;
}

function maxVessels(context: PlacementContext): number {
  return placementLimits(context.view, "form_decorate", context.worker.effect).maxVessels;
}

function variants(context: PlacementContext, vessels: readonly FormVesselSpec[]) {
  return viewMemo(context.view, `formDiscountVariants:${keyOf(vessels)}`, () => formDiscountVariants(context.view, context.playerId, vessels));
}

function quote(context: PlacementContext, action: PlacementCommandOf<"form_decorate">): CostQuote {
  return viewMemo(context.view, `quoteFormDecorate:${keyOf(action)}`, () => quoteFormDecorate(context.actor, action));
}

/** The printed Clay of each Shape and the Coins of a vessel, from the engine's quote lines. */
function printedCosts(context: PlacementContext): Pick<FormDecorateOptions, "shapes" | "decorations" | "vesselCoins"> {
  return viewMemo(context.view, `formDecoratePrinted:${context.worker.workerId}`, () => {
    const probe = (vessel: FormVesselSpec) => quote(context, { type: "PLACE_FORM_DECORATE", workerId: context.worker.workerId, vessels: [vessel] });
    return {
      shapes: SHAPES.map((shape) => ({ shape, clay: probe({ shape, decoration: "plain" }).lines.find((line) => line.kind === "shape_clay")?.amount ?? null })),
      decorations: DECORATIONS.map((decoration) => ({ decoration })),
      vesselCoins: probe({ shape: "bowl", decoration: "plain" }).lines.find((line) => line.kind === "vessel_coins")?.amount ?? null,
    };
  });
}

function wheelOffered(context: PlacementContext, vessels: readonly FormVesselSpec[] | null): boolean {
  return vessels !== null && variants(context, vessels).some((variant) => variant.useLargeThrowingWheel === true);
}

function kitIndexes(context: PlacementContext, vessels: readonly FormVesselDraft[]): number[] {
  const indexes: number[] = [];
  vessels.forEach((vessel, index) => {
    if (vessel.shape === null || vessel.decoration === null) return;
    if (variants(context, [{ shape: vessel.shape, decoration: vessel.decoration }]).some((variant) => variant.decoratorsKitVesselIndex === 0)) indexes.push(index);
  });
  return indexes;
}

function dingIndexes(context: PlacementContext, vessels: readonly FormVesselSpec[] | null): number[] {
  if (vessels === null) return [];
  return viewMemo(context.view, `dingCopyable:${context.worker.workerId}:${keyOf(vessels)}`, () =>
    dingCopyableVesselIndexes(context.view, { type: "PLACE_FORM_DECORATE", workerId: context.worker.workerId, vessels: [...vessels] }),
  );
}

// ── Availability: what `validateAction` allows now ────────────────────────────────────────

type DingSpec = { copyOfVesselIndex: number; decoration: Decoration };

const AVAILABLE: Availability = Object.freeze({ available: true, reason: null });

function placeCommand(context: PlacementContext, vessels: readonly FormVesselSpec[], ding: DingSpec | null = null): PlacementCommandOf<"form_decorate"> {
  return { type: "PLACE_FORM_DECORATE", workerId: context.worker.workerId, vessels: [...vessels], ...(ding === null ? {} : { dingExtra: ding }) };
}

/** True when these vessels (and Ding's vessel, if given) pass `validateAction` with some discount variant. */
function legalSomeVariant(context: PlacementContext, vessels: readonly FormVesselSpec[], ding: DingSpec | null = null): boolean {
  return viewMemo(context.view, `formLegal:${context.worker.workerId}:${keyOf(vessels)}:${keyOf(ding)}`, () =>
    variants(context, vessels).some((variant) => validateAction(context.actor, { ...placeCommand(context, vessels, ding), ...variant }) === null),
  );
}

/** Every full vessel list consistent with the choices made, in Shape-then-Decoration order. */
function* completions(partial: readonly FormVesselDraft[]): Generator<FormVesselSpec[]> {
  if (partial.length === 0) {
    yield [];
    return;
  }
  const [head, ...rest] = partial;
  if (head === undefined) return;
  const shapes = head.shape === null ? SHAPES : [head.shape];
  const decorations = head.decoration === null ? DECORATIONS : [head.decoration];
  for (const shape of shapes) {
    for (const decoration of decorations) {
      for (const tail of completions(rest)) yield [{ shape, decoration }, ...tail];
    }
  }
}

/**
 * Available when some completion of `partial` passes `legal`; else unavailable with the engine's
 * error for the first completion's `probe` command.
 */
function availability(
  context: PlacementContext,
  key: string,
  partial: readonly FormVesselDraft[],
  legal: (vessels: FormVesselSpec[]) => boolean,
  probe: (vessels: FormVesselSpec[]) => PlacementCommandOf<"form_decorate">,
): Availability {
  return viewMemo(context.view, `formAvailability:${context.worker.workerId}:${key}:${keyOf(partial)}`, () => {
    let first: FormVesselSpec[] | null = null;
    for (const vessels of completions(partial)) {
      first ??= vessels;
      if (legal(vessels)) return AVAILABLE;
    }
    return { available: false, reason: first === null ? null : validateAction(context.actor, probe(first)) };
  });
}

/** Whether some legal command forms these vessels as chosen so far (no Ding). */
function vesselsAvailability(context: PlacementContext, partial: readonly FormVesselDraft[]): Availability {
  return availability(
    context,
    "base",
    partial,
    (vessels) => legalSomeVariant(context, vessels),
    (vessels) => placeCommand(context, vessels),
  );
}

function replaced(vessels: readonly FormVesselDraft[], index: number, patch: Partial<FormVesselDraft>): FormVesselDraft[] {
  return vessels.map((vessel, at) => (at === index ? { ...vessel, ...patch } : vessel));
}

function vesselOptions(context: PlacementContext, vessels: readonly FormVesselDraft[], index: number): FormVesselOptions {
  const printed = printedCosts(context);
  return {
    shapes: printed.shapes.map((entry) => ({ ...entry, ...vesselsAvailability(context, replaced(vessels, index, { shape: entry.shape })) })),
    decorations: printed.decorations.map((entry) => ({ ...entry, ...vesselsAvailability(context, replaced(vessels, index, { decoration: entry.decoration })) })),
  };
}

/** The second vessel (see `FormDecorateOptions.second`). */
function secondOption(context: PlacementContext, vessels: readonly FormVesselDraft[]): Availability | null {
  if (maxVessels(context) < 2) return null;
  if (!vesselsAvailability(context, [EMPTY_VESSEL, EMPTY_VESSEL]).available) return null;
  if (vessels.length > 1) return AVAILABLE;
  return vesselsAvailability(context, [vessels[0] ?? EMPTY_VESSEL, EMPTY_VESSEL]);
}

/**
 * Ding's choices for these vessels, or null when Ding's vessel cannot be added: Ding not ready,
 * a Shape still to choose, or no legal command adds it. `index` narrows the Decorations to one
 * copied vessel.
 */
function dingChoices(
  context: PlacementContext,
  vessels: readonly FormVesselDraft[],
  index: number | null,
): { indexes: number[]; decorations: Array<{ decoration: Decoration } & Availability> } | null {
  if (context.me.kilnId !== DING || !context.me.kilnAbilityReady) return null;
  if (vessels.some((vessel) => vessel.shape === null)) return null;
  // Which vessels Ding may copy depends on their Shapes; a provisional Decoration stands in.
  const provisional = vessels.map((vessel) => ({ shape: vessel.shape as Shape, decoration: vessel.decoration ?? DECORATIONS[0] ?? "plain" }));
  const copyable = dingIndexes(context, provisional);
  const legalAt = (at: number, decoration: Decoration | null) =>
    availability(
      context,
      `ding:${at}:${decoration ?? "*"}`,
      // The extra vessel stands last; its Shape is the copied vessel's, so only its Decoration varies.
      [...vessels, { shape: vessels[at]?.shape ?? null, decoration }],
      (specs) => {
        const extra = specs[specs.length - 1];
        return extra !== undefined && legalSomeVariant(context, specs.slice(0, -1), { copyOfVesselIndex: at, decoration: extra.decoration });
      },
      (specs) => placeCommand(context, specs.slice(0, -1), { copyOfVesselIndex: at, decoration: specs[specs.length - 1]?.decoration ?? "plain" }),
    );
  const indexes = copyable.filter((at) => legalAt(at, null).available);
  if (indexes.length === 0) return null;
  const targets = index !== null && indexes.includes(index) ? [index] : indexes;
  const decorations = DECORATIONS.map((decoration) => {
    const verdicts = targets.map((at) => legalAt(at, decoration));
    return { decoration, ...(verdicts.find((verdict) => verdict.available) ?? verdicts[0] ?? AVAILABLE) };
  });
  return { indexes, decorations };
}

function command(draft: FormDecorateDraft, context: PlacementContext): PlacementCommandOf<"form_decorate"> | null {
  const vessels = complete(draft.vessels);
  if (vessels === null) return null;
  if (draft.ding !== null && (draft.ding.index === null || draft.ding.decoration === null)) return null;
  return {
    type: "PLACE_FORM_DECORATE",
    workerId: context.worker.workerId,
    vessels,
    ...(draft.wheel ? { useLargeThrowingWheel: true } : {}),
    ...(draft.kitIndex === null ? {} : { decoratorsKitVesselIndex: draft.kitIndex }),
    ...(draft.ding === null || draft.ding.index === null || draft.ding.decoration === null
      ? {}
      : { dingExtra: { copyOfVesselIndex: draft.ding.index, decoration: draft.ding.decoration } }),
  };
}

function revalidate(draft: FormDecorateDraft, context: PlacementContext): FormDecorateDraft {
  const max = maxVessels(context);
  let vessels: FormVesselDraft[] = draft.vessels.length > max ? draft.vessels.slice(0, max) : [...draft.vessels];
  if (vessels.length > 1 && secondOption(context, vessels) === null) vessels = vessels.slice(0, 1);
  // A choice no legal command allows with the others is dropped, the later vessel first.
  for (let index = vessels.length - 1; index >= 0; index -= 1) {
    if (vesselsAvailability(context, vessels).available) break;
    vessels = replaced(vessels, index, { decoration: null });
    if (vesselsAvailability(context, vessels).available) break;
    vessels = replaced(vessels, index, { shape: null });
  }
  const specs = complete(vessels);
  const wheel = draft.wheel && wheelOffered(context, specs);
  const kitIndex = draft.kitIndex !== null && kitIndexes(context, vessels).includes(draft.kitIndex) ? draft.kitIndex : null;
  let ding = draft.ding;
  if (ding !== null) {
    const choices = dingChoices(context, vessels, ding.index);
    if (choices === null) ding = null;
    else {
      // A single vessel Ding may copy is the only choice (the form then shows no index picker).
      const only = choices.indexes.length === 1 ? choices.indexes[0] : undefined;
      const index = ding.index !== null && choices.indexes.includes(ding.index) ? ding.index : (only ?? null);
      const decorations = index === ding.index ? choices.decorations : (dingChoices(context, vessels, index)?.decorations ?? []);
      const chosen = ding.decoration;
      const decoration = chosen !== null && decorations.some((entry) => entry.decoration === chosen && entry.available) ? chosen : null;
      ding = { index, decoration };
    }
  }
  return keepIfSame(draft, { vessels, wheel, kitIndex, ding });
}

/**
 * After a new choice, when the vessels as chosen are legal with exactly one discount variant
 * (say, only with Large Throwing Wheel), that variant is taken; the player may still change it.
 */
function withOnlyLegalVariant(draft: FormDecorateDraft, context: PlacementContext): FormDecorateDraft {
  const built = command(draft, context);
  if (built === null || validateAction(context.actor, built) === null) return draft;
  const ding = built.dingExtra ?? null;
  const legal = variants(context, built.vessels).filter((variant) => validateAction(context.actor, { ...placeCommand(context, built.vessels, ding), ...variant }) === null);
  const only = legal.length === 1 ? legal[0] : undefined;
  if (only === undefined) return draft;
  return revalidate({ ...draft, wheel: only.useLargeThrowingWheel === true, kitIndex: only.decoratorsKitVesselIndex ?? null }, context);
}

/** True when `options()` lists this Shape or Decoration as available for the vessel. */
function offered(context: PlacementContext, vessels: readonly FormVesselDraft[], index: number, patch: Partial<FormVesselDraft>): boolean {
  return index >= 0 && index < vessels.length && vesselsAvailability(context, replaced(vessels, index, patch)).available;
}

function setVessel(draft: FormDecorateDraft, index: number, patch: Partial<FormVesselDraft>): FormDecorateDraft {
  if (index < 0 || index >= draft.vessels.length) return draft;
  return { ...draft, vessels: draft.vessels.map((vessel, at) => (at === index ? { ...vessel, ...patch } : vessel)) };
}

function vesselParam(context: PlacementContext, vessel: FormVesselSpec): Deferred {
  return (t) => ceramicLabel({ ownerId: context.playerId, ...vessel }, { viewerId: context.playerId, players: [] }, { locale: t, withOwner: false, withPlace: false });
}

export const formDecorateDraft: LocationDraftModel<"form_decorate", FormDecorateDraft, FormDecorateAction, FormDecorateOptions> = {
  locationId: "form_decorate",
  blank: () => BLANK,
  prepare: (draft, context) => revalidate(draft, context),
  reduce(draft, action, context) {
    // A choice `options()` does not offer as available is ignored; the current one stays.
    switch (action.type) {
      case "revalidate":
        return revalidate(draft, context);
      case "shape":
        if (!offered(context, draft.vessels, action.index, { shape: action.shape })) return draft;
        return withOnlyLegalVariant(revalidate(setVessel(draft, action.index, { shape: action.shape }), context), context);
      case "decoration":
        if (!offered(context, draft.vessels, action.index, { decoration: action.decoration })) return draft;
        return withOnlyLegalVariant(revalidate(setVessel(draft, action.index, { decoration: action.decoration }), context), context);
      case "second": {
        if (!action.on) return withOnlyLegalVariant(revalidate({ ...draft, vessels: draft.vessels.slice(0, 1) }, context), context);
        if (draft.vessels.length >= maxVessels(context) || secondOption(context, draft.vessels)?.available !== true) return draft;
        return revalidate({ ...draft, vessels: [...draft.vessels, EMPTY_VESSEL] }, context);
      }
      case "wheel":
        return revalidate({ ...draft, wheel: action.on }, context);
      case "kit":
        return revalidate({ ...draft, kitIndex: action.index }, context);
      case "ding":
        if (action.on && dingChoices(context, draft.vessels, null) === null) return draft;
        return withOnlyLegalVariant(revalidate({ ...draft, ding: action.on ? { index: null, decoration: null } : null }, context), context);
      case "dingIndex":
        // Only an index Ding may copy in some legal command is taken; any other is ignored.
        if (draft.ding === null || dingChoices(context, draft.vessels, null)?.indexes.includes(action.index) !== true) return draft;
        return withOnlyLegalVariant(revalidate({ ...draft, ding: { index: action.index, decoration: draft.ding.decoration } }, context), context);
      case "dingDecoration": {
        if (draft.ding === null) return draft;
        const entry = dingChoices(context, draft.vessels, draft.ding.index)?.decorations.find((candidate) => candidate.decoration === action.decoration);
        if (entry?.available !== true) return draft;
        return withOnlyLegalVariant(revalidate({ ...draft, ding: { index: draft.ding.index, decoration: action.decoration } }, context), context);
      }
    }
  },
  options(draft, context) {
    const specs = complete(draft.vessels);
    const kit = kitIndexes(context, draft.vessels);
    const ding = dingChoices(context, draft.vessels, draft.ding?.index ?? null);
    const built = command(draft, context);
    const quoted = built === null ? null : quote(context, built);
    return {
      maxVessels: maxVessels(context),
      ...printedCosts(context),
      vessels: draft.vessels.map((_, index) => vesselOptions(context, draft.vessels, index)),
      second: secondOption(context, draft.vessels),
      wheel: wheelOffered(context, specs) ? { techId: LARGE_THROWING_WHEEL } : null,
      kit: kit.length === 0 ? null : { techId: DECORATORS_KIT, indexes: kit },
      ding: ding === null ? null : { kilnId: DING, indexes: ding.indexes, decorations: ding.decorations },
      quote: quoted,
      after: resourcesAfter(context.me.resources, quoted),
    };
  },
  build: (draft, context) => command(draft, context),
  fromCommand(cmd, context) {
    if (cmd.vessels.length === 0 || cmd.vessels.length > maxVessels(context)) return null;
    return {
      vessels: cmd.vessels.map((vessel) => ({ shape: vessel.shape, decoration: vessel.decoration })),
      wheel: cmd.useLargeThrowingWheel === true,
      kitIndex: cmd.decoratorsKitVesselIndex ?? null,
      ding: cmd.dingExtra === undefined ? null : { index: cmd.dingExtra.copyOfVesselIndex, decoration: cmd.dingExtra.decoration },
    };
  },
  detail(draft, context): MessageParam | null {
    const specs = complete(draft.vessels);
    if (specs === null) return null;
    const [first, second] = specs;
    if (first === undefined) return null;
    let vessels: MessageParam;
    if (second === undefined) vessels = oneVessel(vesselParam(context, first));
    else vessels = twoVessels(vesselParam(context, first), vesselParam(context, second));
    const ding = draft.ding;
    if (ding === null || ding.index === null || ding.decoration === null) return vessels;
    const copied = specs[ding.index];
    if (copied === undefined) return vessels;
    return msg("work.fd.detailDing", {
      vessels,
      ability: (t) => kilnText(DING, t.locale).abilityName,
      extra: vesselParam(context, { shape: copied.shape, decoration: ding.decoration }),
    });
  },
};

function oneVessel(vessel: Deferred): Deferred {
  return vessel;
}

function twoVessels(first: Deferred, second: Deferred): RichMessage {
  return msg("work.fd.detailTwo", { first, second });
}
