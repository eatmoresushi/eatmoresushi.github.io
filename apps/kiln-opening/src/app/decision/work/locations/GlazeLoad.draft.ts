/**
 * The Glaze & Load sub-draft (UI_V1.6.1_ARCHITECTURE §3.4, §5 gap 15; wireframe `subEditor`
 * glaze_load). Owner: B4.
 *
 * 1 load (Apprentice) or 1–2 ordered loads (Shifu, `placementLimits(...).maxLoads`). Each load:
 * a Shaped vessel, its Glaze and Reworking Table Shape (`glazeLoadVesselOptions(view, pid,
 * earlierLoads)`), and a destination (`loadDestinationOptions(view, pid, ceramicId, earlierLoads,
 * reworkShape)`): a Shared Kiln space, plain or with Kiln Furniture's −1/0/+1 or Inverted Firing,
 * or the Imperial Kiln with its −1/0/+1 modifier. A later load's lists are queried with the
 * earlier complete loads of this action (R8), and never repeat a vessel an earlier load has
 * chosen, complete or not. The second load is offered only while some other Shaped vessel can
 * still be loaded after the first.
 *
 * Kiln fuel (L215, changes 34–35, R24): the action costs 1 Wood when any of its loads goes
 * into the Shared Kiln, whether it loads 1 vessel or 2; loading only into the Imperial Kiln is
 * free. The engine's quote (`quoteGlazeLoad`, its `kiln_fuel` line) prices the draft; without the
 * Wood the engine offers no Shared Kiln destination (`loadDestinationOptions`). There is no Heat
 * marker since revision 4 (changes 28, 31).
 *
 * Kiln Master (T24, L647, R22): once per round, as a ceramic is loaded, its owner may place
 * the +1 or −1 marker on it, face up (`kilnMasterOption`: owned and ready, its faces). At most one
 * load of the action carries it; declining is choosing none (R4).
 *
 * The destination is chosen in two steps: a place (a kiln space or the Imperial Kiln), then,
 * when that place offers more than one way in, its modifier. A place with a single way in takes
 * it at once.
 */
import { glazeLoadVesselOptions, kilnMasterOption, loadDestinationOptions, placementLimits, quoteGlazeLoad } from "../../../../game/index.ts";
import type { CeramicId, CeramicState, CostQuote, Glaze, HeatDelta, KilnSpaceId, LoadDestinationOption, LoadSpec, ResourceState, Shape } from "../../../../game/index.ts";
import { kilnSpaceName } from "../../../i18n/ceramicLabel.ts";
import { glazeName, shapeName } from "../../../i18n/content.ts";
import { list } from "../../../i18n/format.ts";
import { msg } from "../../../i18n/translator.ts";
import type { Deferred, MessageParam, RichMessage } from "../../../i18n/translator.ts";
import { keepIfSame, keyOf, viewMemo } from "../context.ts";
import type { LocationDraftModel, PlacementCommandOf, PlacementContext } from "./editor.ts";
import { resourcesPlus, signedModifier, vesselLabel, vesselParam } from "./shared.ts";

const REWORKING_TABLE = "T05" as const;
const KILN_FURNITURE = "T15" as const;
const INVERTED_FIRING = "T21" as const;
const SETTERS_MARK = "T22" as const;
const KILN_MASTER = "T24" as const;

export type Destination = LoadSpec["destination"];

export interface LoadDraft {
  readonly ceramicId: CeramicId | null;
  readonly glaze: Glaze | null;
  readonly rework: Shape | null;
  /** A Shared Kiln space ID, or `imperial`. */
  readonly place: string | null;
  readonly destination: Destination | null;
}

/** Kiln Master's marker on one load of the action (its index) with its face. */
export interface KilnMasterChoice {
  readonly index: number;
  readonly value: HeatDelta;
}

export interface GlazeLoadDraft {
  readonly loads: readonly LoadDraft[];
  /** Kiln Master's marker (T24, R22), or null for none. */
  readonly kilnMaster: KilnMasterChoice | null;
}

export type GlazeLoadAction =
  | { readonly type: "vessel"; readonly index: number; readonly ceramicId: CeramicId }
  | { readonly type: "glaze"; readonly index: number; readonly glaze: Glaze }
  | { readonly type: "rework"; readonly index: number; readonly shape: Shape | null }
  | { readonly type: "place"; readonly index: number; readonly place: string }
  | { readonly type: "destination"; readonly index: number; readonly key: string }
  | { readonly type: "second"; readonly on: boolean }
  | { readonly type: "kilnMaster"; readonly choice: KilnMasterChoice | null }
  | { readonly type: "kilnSpace"; readonly spaceId: KilnSpaceId };

export type VariantKind = "zone" | "furniture" | "inverted" | "imperial";

export interface DestinationVariant {
  key: string;
  kind: VariantKind;
  destination: Destination;
  modifier: number;
  returnsSettersMark: boolean;
}

export interface PlaceOption {
  key: string;
  kind: "space" | "imperial";
  spaceId: KilnSpaceId | null;
  variants: readonly DestinationVariant[];
}

export interface LoadOptions {
  vessels: ReadonlyArray<{ ceramicId: CeramicId; ceramic: CeramicState | null; loadable: boolean }>;
  glazes: readonly Glaze[];
  reworkShapes: readonly Shape[];
  places: readonly PlaceOption[];
}

export interface GlazeLoadOptions {
  maxLoads: number;
  /**
   * The second load may be added: this worker loads two, and some Shaped vessel other than the
   * first load's (two of them, while the first has none yet) can still be loaded after it.
   */
  second: boolean;
  loads: readonly LoadOptions[];
  /**
   * Kiln Master (T24, R22): null without the tile or once used this round; else its faces and the
   * loads (indexes) that have a vessel chosen, any one of which may carry the marker.
   */
  kilnMaster: { techId: typeof KILN_MASTER; values: readonly HeatDelta[]; loads: readonly number[] } | null;
  /**
   * Kiln fuel (R24): the Wood this action pays now (the quote's `kiln_fuel` line, 0 while no load
   * goes into the Shared Kiln), what an action into the Shared Kiln costs (`sharedKilnWood`), the
   * Wood held; `free` once the quote is known and pays no Wood (the loads go only into the
   * Imperial Kiln), `short` when the Wood held cannot pay for the Shared Kiln.
   */
  fuel: { wood: number; perAction: number; have: number; free: boolean; short: boolean };
  /** The engine's quote of the loads with a destination (`quoteGlazeLoad`), or null with none. */
  quote: CostQuote | null;
  /** Resources after paying the quote, or null while it is not known. */
  after: ResourceState | null;
  techs: { reworkingTable: typeof REWORKING_TABLE; kilnFurniture: typeof KILN_FURNITURE; invertedFiring: typeof INVERTED_FIRING; settersMark: typeof SETTERS_MARK; kilnMaster: typeof KILN_MASTER };
}

const BLANK_LOAD: LoadDraft = Object.freeze({ ceramicId: null, glaze: null, rework: null, place: null, destination: null });
const BLANK: GlazeLoadDraft = Object.freeze({ loads: Object.freeze([BLANK_LOAD]), kilnMaster: null });

export function destinationKey(destination: Destination): string {
  if (destination.kiln === "imperial") return `imperial:${destination.imperialModifier}`;
  const parts: string[] = [destination.spaceId];
  if (destination.invertedFiring === true) parts.push("inverted");
  if (destination.kilnFurniture !== undefined) parts.push(`kf${destination.kilnFurniture}`);
  return parts.join(":");
}

export function placeKeyOf(destination: Destination): string {
  return destination.kiln === "imperial" ? "imperial" : destination.spaceId;
}

function variantKind(destination: Destination): VariantKind {
  if (destination.kiln === "imperial") return "imperial";
  if (destination.kilnFurniture !== undefined) return "furniture";
  if (destination.invertedFiring === true) return "inverted";
  return "zone";
}

function maxLoads(context: PlacementContext): number {
  return placementLimits(context.view, "glaze_load", context.worker.effect).maxLoads;
}

/** The Wood one Glaze & Load action pays when it loads into the Shared Kiln (R24). */
function fuelPerAction(context: PlacementContext): number {
  return placementLimits(context.view, "glaze_load", context.worker.effect).sharedKilnWood;
}

/** Kiln Master's option for this player when it may be used now (owned and ready), else null. */
function kilnMasterReady(context: PlacementContext): { values: readonly HeatDelta[] } | null {
  const option = viewMemo(context.view, `kilnMasterOption:${context.playerId}`, () => kilnMasterOption(context.view, context.playerId));
  return option === null || !option.ready ? null : { values: option.values };
}

function completeLoad(load: LoadDraft): LoadSpec | null {
  if (load.ceramicId === null || load.glaze === null || load.destination === null) return null;
  return { ceramicId: load.ceramicId, glaze: load.glaze, destination: load.destination, ...(load.rework === null ? {} : { reworkShape: load.rework }) };
}

/**
 * The loads with a destination, for the fuel quote: a load whose Glaze is not chosen yet uses its
 * first offered Glaze (the fuel depends only on the destinations).
 */
function quotedLoads(draft: GlazeLoadDraft, context: PlacementContext): LoadSpec[] {
  return draft.loads.flatMap((load, index): LoadSpec[] => {
    if (load.ceramicId === null || load.destination === null) return [];
    const glaze = load.glaze ?? loadOptions(draft, index, context).glazes[0] ?? null;
    if (glaze === null) return [];
    return [{ ceramicId: load.ceramicId, glaze, destination: load.destination, ...(load.rework === null ? {} : { reworkShape: load.rework }) }];
  });
}

function quoteOf(draft: GlazeLoadDraft, context: PlacementContext): CostQuote | null {
  const loads = quotedLoads(draft, context);
  if (loads.length === 0) return null;
  const action = { type: "PLACE_GLAZE_LOAD" as const, workerId: context.worker.workerId, loads };
  return viewMemo(context.view, `quoteGlazeLoad:${keyOf(action)}`, () => quoteGlazeLoad(context.actor, action));
}

/** The complete loads before `index` (a later load's lists are queried after them, R8). */
function earlierOf(loads: readonly LoadDraft[], index: number): LoadSpec[] {
  return loads.slice(0, index).map(completeLoad).filter((load): load is LoadSpec => load !== null);
}

function vesselOptions(context: PlacementContext, earlier: readonly LoadSpec[]) {
  return viewMemo(context.view, `glazeLoadVesselOptions:${keyOf(earlier)}`, () => glazeLoadVesselOptions(context.view, context.playerId, earlier));
}

function destinations(context: PlacementContext, ceramicId: CeramicId, earlier: readonly LoadSpec[], rework: Shape | null): readonly LoadDestinationOption[] {
  return viewMemo(context.view, `loadDestinationOptions:${ceramicId}:${rework ?? ""}:${keyOf(earlier)}`, () =>
    loadDestinationOptions(context.view, context.playerId, ceramicId, earlier, rework ?? undefined),
  );
}

function placesOf(options: readonly LoadDestinationOption[]): PlaceOption[] {
  const places: PlaceOption[] = [];
  for (const option of options) {
    const key = placeKeyOf(option.destination);
    let place = places.find((candidate) => candidate.key === key);
    if (place === undefined) {
      place = { key, kind: option.destination.kiln === "imperial" ? "imperial" : "space", spaceId: option.destination.kiln === "shared" ? option.destination.spaceId : null, variants: [] };
      places.push(place);
    }
    (place.variants as DestinationVariant[]).push({
      key: destinationKey(option.destination),
      kind: variantKind(option.destination),
      destination: option.destination,
      modifier: option.modifier,
      returnsSettersMark: option.returnsSettersMark,
    });
  }
  // The Imperial Kiln after the Shared Kiln spaces, whatever the selector's order.
  return [...places.filter((place) => place.kind === "space"), ...places.filter((place) => place.kind === "imperial")];
}

/**
 * The vessels a load may name: `glazeLoadVesselOptions` after the earlier complete loads, less
 * any vessel an earlier load has chosen but not finished (one vessel is loaded once).
 */
function vesselsFor(loads: readonly LoadDraft[], index: number, context: PlacementContext) {
  const taken = new Set(loads.slice(0, index).flatMap((load) => (load.ceramicId === null ? [] : [load.ceramicId])));
  return vesselOptions(context, earlierOf(loads, index)).filter((vessel) => !taken.has(vessel.ceramicId));
}

function loadableCount(vessels: ReturnType<typeof vesselsFor>): number {
  return vessels.filter((vessel) => vessel.glazes.length > 0 || vessel.reworkShapes.length > 0).length;
}

/** See `GlazeLoadOptions.second`. */
function secondOffered(loads: readonly LoadDraft[], context: PlacementContext): boolean {
  if (maxLoads(context) < 2) return false;
  const first = loads[0] ?? BLANK_LOAD;
  const loadable = loadableCount(vesselsFor([first], 1, context));
  return first.ceramicId === null ? loadable >= 2 : loadable >= 1;
}

function loadOptions(draft: GlazeLoadDraft, index: number, context: PlacementContext): LoadOptions {
  const earlier = earlierOf(draft.loads, index);
  const load = draft.loads[index] ?? BLANK_LOAD;
  const vessels = vesselsFor(draft.loads, index, context);
  const chosen = vessels.find((vessel) => vessel.ceramicId === load.ceramicId) ?? null;
  const rework = chosen !== null && load.rework !== null && chosen.reworkShapes.includes(load.rework) ? load.rework : null;
  return {
    vessels: vessels.map((vessel) => ({
      ceramicId: vessel.ceramicId,
      ceramic: context.view.game.ceramics[vessel.ceramicId] ?? null,
      loadable: vessel.glazes.length > 0 || vessel.reworkShapes.length > 0,
    })),
    glazes: chosen?.glazes ?? [],
    reworkShapes: chosen?.reworkShapes ?? [],
    places: chosen === null ? [] : placesOf(destinations(context, chosen.ceramicId, earlier, rework)),
  };
}

/** The loads that have a vessel chosen: each may carry Kiln Master's marker. */
function kilnMasterLoads(loads: readonly LoadDraft[]): number[] {
  return loads.flatMap((load, index) => (load.ceramicId === null ? [] : [index]));
}

function revalidateLoad(load: LoadDraft, options: LoadOptions, context: PlacementContext, earlier: readonly LoadSpec[]): LoadDraft {
  if (load.ceramicId === null) return load.glaze === null && load.rework === null && load.place === null && load.destination === null ? load : BLANK_LOAD;
  const vessel = options.vessels.find((candidate) => candidate.ceramicId === load.ceramicId);
  if (vessel === undefined || !vessel.loadable) return BLANK_LOAD;
  const glaze = load.glaze !== null && options.glazes.includes(load.glaze) ? load.glaze : null;
  const rework = load.rework !== null && options.reworkShapes.includes(load.rework) ? load.rework : null;
  const places = rework === load.rework ? options.places : placesOf(destinations(context, load.ceramicId, earlier, rework));
  const place = load.place === null ? null : places.find((candidate) => candidate.key === load.place) ?? null;
  let destination: Destination | null = null;
  if (place !== null) {
    const current = load.destination === null ? null : destinationKey(load.destination);
    const variant = place.variants.find((candidate) => candidate.key === current) ?? (place.variants.length === 1 ? place.variants[0] : undefined);
    destination = variant?.destination ?? null;
  }
  return { ceramicId: load.ceramicId, glaze, rework, place: place?.key ?? null, destination };
}

function revalidate(draft: GlazeLoadDraft, context: PlacementContext): GlazeLoadDraft {
  const max = maxLoads(context);
  let loads: LoadDraft[] = (draft.loads.length > max ? draft.loads.slice(0, max) : [...draft.loads]);
  if (loads.length === 0) loads = [BLANK_LOAD];
  for (let index = 0; index < loads.length; index += 1) {
    const current = { loads, kilnMaster: draft.kilnMaster };
    const load = loads[index] ?? BLANK_LOAD;
    const next = revalidateLoad(load, loadOptions(current, index, context), context, earlierOf(loads, index));
    if (next !== load) loads = loads.map((item, at) => (at === index ? next : item));
  }
  // No other vessel can follow the first load: the second load goes.
  if (loads.length > 1 && !secondOffered(loads, context)) loads = loads.slice(0, 1);
  const ready = kilnMasterReady(context);
  const km = draft.kilnMaster;
  const kilnMaster = km !== null && ready !== null && ready.values.includes(km.value) && kilnMasterLoads(loads).includes(km.index) ? km : null;
  return keepIfSame(draft, { loads, kilnMaster });
}

function setLoad(draft: GlazeLoadDraft, index: number, patch: Partial<LoadDraft>): GlazeLoadDraft {
  if (index < 0 || index >= draft.loads.length) return draft;
  return { ...draft, loads: draft.loads.map((load, at) => (at === index ? { ...load, ...patch } : load)) };
}

function command(draft: GlazeLoadDraft, context: PlacementContext): PlacementCommandOf<"glaze_load"> | null {
  const loads = draft.loads.map(completeLoad);
  if (loads.some((load) => load === null)) return null;
  const km = draft.kilnMaster;
  return {
    type: "PLACE_GLAZE_LOAD",
    workerId: context.worker.workerId,
    loads: (loads as LoadSpec[]).map((load, index) => (km !== null && km.index === index ? { ...load, kilnMaster: km.value } : load)),
  };
}

/** "High 2 (+1)" / "Imperial Kiln (−1)". */
export function destinationParam(destination: Destination, modifier: number): Deferred {
  return (t) =>
    destination.kiln === "imperial"
      ? t("work.gl.placeImperial", { m: signedModifier(modifier) })
      : t("work.gl.placeSpace", { space: kilnSpaceName(destination.spaceId, t), m: signedModifier(modifier) });
}

function modifierOf(context: PlacementContext, draft: GlazeLoadDraft, index: number): number {
  const load = draft.loads[index];
  if (load === undefined || load.destination === null) return 0;
  const key = destinationKey(load.destination);
  for (const place of loadOptions(draft, index, context).places) {
    const variant = place.variants.find((candidate) => candidate.key === key);
    if (variant !== undefined) return variant.modifier;
  }
  return 0;
}

export const glazeLoadDraft: LocationDraftModel<"glaze_load", GlazeLoadDraft, GlazeLoadAction, GlazeLoadOptions> = {
  locationId: "glaze_load",
  blank: () => BLANK,
  prepare(draft, context) {
    const next = revalidate(draft, context);
    // A single Shaped vessel with somewhere to go is the only choice: take it.
    const first = next.loads[0];
    if (first === undefined || first.ceramicId !== null || next.loads.length !== 1) return next;
    const loadable = loadOptions(next, 0, context).vessels.filter((vessel) => vessel.loadable);
    const only = loadable.length === 1 ? loadable[0] : undefined;
    return only === undefined ? next : revalidate(setLoad(next, 0, { ceramicId: only.ceramicId }), context);
  },
  reduce(draft, action, context) {
    switch (action.type) {
      case "revalidate":
        return revalidate(draft, context);
      case "vessel": {
        const current = draft.loads[action.index];
        if (current === undefined || current.ceramicId === action.ceramicId) return draft;
        return revalidate(setLoad(draft, action.index, { ceramicId: action.ceramicId, rework: null, place: null, destination: null }), context);
      }
      case "glaze":
        return revalidate(setLoad(draft, action.index, { glaze: action.glaze }), context);
      case "rework":
        return revalidate(setLoad(draft, action.index, { rework: action.shape }), context);
      case "place": {
        const current = draft.loads[action.index];
        if (current === undefined) return draft;
        return revalidate(setLoad(draft, action.index, { place: action.place, destination: current.place === action.place ? current.destination : null }), context);
      }
      case "destination": {
        const options = loadOptions(draft, action.index, context);
        for (const place of options.places) {
          const variant = place.variants.find((candidate) => candidate.key === action.key);
          if (variant !== undefined) return revalidate(setLoad(draft, action.index, { place: place.key, destination: variant.destination }), context);
        }
        return draft;
      }
      case "second": {
        if (!action.on) return revalidate({ ...draft, loads: draft.loads.slice(0, 1) }, context);
        if (draft.loads.length >= maxLoads(context) || !secondOffered(draft.loads, context)) return draft;
        return revalidate({ ...draft, loads: [...draft.loads, BLANK_LOAD] }, context);
      }
      case "kilnMaster":
        return revalidate({ ...draft, kilnMaster: action.choice }, context);
      case "kilnSpace": {
        const offers = (index: number) => loadOptions(draft, index, context).places.some((place) => place.key === action.spaceId);
        const indexes = draft.loads.map((_, index) => index).filter((index) => draft.loads[index]?.ceramicId !== null && offers(index));
        const target = indexes.find((index) => draft.loads[index]?.place === null) ?? indexes[0];
        if (target === undefined) return draft;
        return glazeLoadDraft.reduce(draft, { type: "place", index: target, place: action.spaceId }, context);
      }
    }
  },
  options(draft, context) {
    const ready = kilnMasterReady(context);
    const quote = quoteOf(draft, context);
    return {
      maxLoads: maxLoads(context),
      second: secondOffered(draft.loads, context),
      loads: draft.loads.map((_, index) => loadOptions(draft, index, context)),
      kilnMaster: ready === null ? null : { techId: KILN_MASTER, values: ready.values, loads: kilnMasterLoads(draft.loads) },
      fuel: {
        wood: quote?.pay.wood ?? 0,
        perAction: fuelPerAction(context),
        have: context.me.resources.wood,
        free: quote !== null && quote.pay.wood === 0,
        short: context.me.resources.wood < fuelPerAction(context),
      },
      quote,
      after: quote === null ? null : resourcesPlus(context.me.resources, quote.gain, quote.pay),
      techs: { reworkingTable: REWORKING_TABLE, kilnFurniture: KILN_FURNITURE, invertedFiring: INVERTED_FIRING, settersMark: SETTERS_MARK, kilnMaster: KILN_MASTER },
    };
  },
  build: (draft, context) => command(draft, context),
  fromCommand(cmd, context) {
    if (cmd.loads.length === 0 || cmd.loads.length > maxLoads(context)) return null;
    const marked = cmd.loads.flatMap((load, index): KilnMasterChoice[] => (load.kilnMaster === undefined ? [] : [{ index, value: load.kilnMaster }]));
    if (marked.length > 1) return null;
    return {
      loads: cmd.loads.map((load) => ({
        ceramicId: load.ceramicId,
        glaze: load.glaze,
        rework: load.reworkShape ?? null,
        place: placeKeyOf(load.destination),
        destination: load.destination,
      })),
      kilnMaster: marked[0] ?? null,
    };
  },
  detail(draft, context): MessageParam | null {
    const parts: RichMessage[] = [];
    draft.loads.forEach((load, index) => {
      if (load.ceramicId === null || load.glaze === null || load.destination === null) return;
      const glaze = load.glaze;
      const place = destinationParam(load.destination, modifierOf(context, draft, index));
      const vessel = vesselParam(context.view, load.ceramicId);
      const rework = load.rework;
      if (rework === null) parts.push(msg("work.gl.detailLoad", { vessel, glaze: (t) => glazeName(glaze, t.locale), place }));
      else parts.push(msg("work.gl.detailLoadRework", { vessel, shape: (t) => shapeName(rework, t.locale), glaze: (t) => glazeName(glaze, t.locale), place }));
    });
    if (parts.length === 0) return null;
    const km = draft.kilnMaster;
    const kmCeramic = km === null ? null : draft.loads[km.index]?.ceramicId ?? null;
    if (km !== null && kmCeramic !== null) {
      parts.push(msg("work.gl.detailKilnMaster", { value: signedModifier(km.value), ceramic: vesselParam(context.view, kmCeramic) }));
    }
    const wood = quoteOf(draft, context)?.pay.wood ?? 0;
    if (wood > 0) parts.push(msg("work.gl.detailFuel", { wood: (t) => t("common.amount.wood", { n: wood }) }));
    const loads: Deferred = (t) => parts.map((part) => t.message(part)).join(t.locale === "zh-CN" ? "；" : "; ");
    return loads;
  },
};

/** The ceramics this draft would load, for pending chips on the table (§3.5). */
export function pendingLoads(draft: GlazeLoadDraft): Array<{ ceramicId: CeramicId; glaze: Glaze; at: KilnSpaceId | "imperial" }> {
  return draft.loads.flatMap((load) => {
    if (load.ceramicId === null || load.glaze === null || load.place === null) return [];
    return [{ ceramicId: load.ceramicId, glaze: load.glaze, at: load.place === "imperial" ? ("imperial" as const) : (load.place as KilnSpaceId) }];
  });
}

/** The kiln spaces a table click may choose now, and the ones chosen (§3.5 kiln targets). */
export function kilnTargetsOf(draft: GlazeLoadDraft, context: PlacementContext): Map<KilnSpaceId, { pressed: boolean }> {
  const targets = new Map<KilnSpaceId, { pressed: boolean }>();
  const chosen = new Set(draft.loads.map((load) => load.place).filter((place): place is string => place !== null && place !== "imperial"));
  draft.loads.forEach((load, index) => {
    if (load.ceramicId === null) return;
    for (const place of loadOptions(draft, index, context).places) {
      if (place.spaceId !== null) targets.set(place.spaceId, { pressed: chosen.has(place.spaceId) });
    }
  });
  for (const spaceId of chosen) if (!targets.has(spaceId as KilnSpaceId)) targets.set(spaceId as KilnSpaceId, { pressed: true });
  return targets;
}

/** Words for a list of vessels (the summary of the vessels chosen). */
export function vesselsText(context: PlacementContext, ids: readonly CeramicId[]): Deferred {
  return (t) => list(ids.map((id) => vesselLabel(context.view, id, t)), t.locale);
}
