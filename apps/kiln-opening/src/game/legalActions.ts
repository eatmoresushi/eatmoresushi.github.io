/**
 * Legal-action enumerator, families, sampler and legal commands (DESIGN §5.1–5.3).
 *
 * One rule implementation, three consumers: every candidate below is a well-formed command
 * built from the §5.4 selectors, and only candidates that pass `validateAction` (the single
 * legality function, DESIGN §2.5) are ever returned. The computer fallback, the fuzz test and
 * the UI therefore never offer a command the server would reject.
 *
 * **Enumeration** (`enumerateLegalActions`) is a deterministic, lazy generator: families in a
 * fixed order per phase (`familiesFor`), then parameters in a fixed order built from
 * canonical ID lists, never `Record` key order (DESIGN §2.3). Both modes collapse worker
 * identity (the Shifu and the lowest-ID available Apprentice, plus that Apprentice via Senior
 * Apprentice) and equivalent vessels (same Shape and Decoration: the lowest sequence stands
 * for the class). `canonical` mode also collapses equivalent kiln targets and yields each
 * optional ability both used and declined; `exhaustive` mode yields every distinct command
 * and is only ever consumed with a limit.
 *
 * | Family | canonical | exhaustive |
 * | --- | --- | --- |
 * | `SELECT_KILN` | every available Kiln | same |
 * | `PLACE_SETTERS_MARK` | one open space per zone, then `null` | every open space, then `null` |
 * | `PLACE_MATERIALS_YARD` | per worker choice: Prepared Clay {none, each Shape × Decoration if ready} × every split (0..3 or 0..6) | same |
 * | `PLACE_FORM_DECORATE` | 20 singles, then (Shifu effect) 210 unordered pairs; × {no discount, Large Throwing Wheel, Decorator's Kit on the first eligible vessel}; × Ding {none, each Decoration on the first Bowl/Plate/Brush Washer} | singles and 400 ordered pairs; the Kit on every eligible vessel; Ding on every eligible vessel |
 * | `PLACE_GLAZE_LOAD` | singles, then (Shifu effect) pairs, each built from `loadDestinationOptions` after the earlier load (R8): vessel class × Glaze × destination (one plain space per zone, the own Setter's Mark space, every Inverted Firing target, Kiln Furniture × 3 on one space per zone, Imperial × 3); Reworking Table: each class × other Shape × destination with the first Glaze; Heat marker {none, each `heatMarkerTargets`}. Each worker's candidates are disjoint streams interleaved round-robin (`glazeLoadStreams`), each ability variant and the first pair before the Glaze cross-product, so the default `perFamilyLimit` still offers every optional ability used and declined | every vessel, destination and rework (Glaze × destination product) |
 * | `PLACE_COMMISSION_MARKET` | one per worker choice (Shifu, Apprentice, Apprentice via Senior Apprentice) | same |
 * | `PLACE_GUILD_HALL` | Apprentice: each face-up Tech; Shifu: each discipline with a non-empty deck (the first discipline if every deck is empty, so the Shifu's face-up take stays reachable) | Shifu: every discipline |
 * | `PLACE_CANAL_WHARF`, `PLACE_MAGISTRATES_HALL` | each worker choice | same |
 * | `SELECT_CHOOSE` (every Select: the Commission Market, Colour Samples when acquired and its swap) | every single pick (face-up slots ascending, then looked cards in look order), then, for the Commission Market Shifu effect, every unordered pair in that order (≤ 9 + 36) | same |
 * | Guild Hall sub-steps | all: each next `GUILD_TAKE` (inspected Techs, then face-up), then `GUILD_FINISH` × every bottom order (≤ 2) | same |
 * | `USE_COLOUR_SAMPLES_SWAP` | one swap per held Order, in hand order | same |
 * | `COMPLETE_ORDER` | per held Order: the first match, plus the first Ru-triggering match; each triggered Ru/Guan and Tribute Ware used and declined | every match × decline flags |
 * | `USE_IMPERIAL_PRIORITY` | vessel class × Glaze × modifier; with Reworking Table ready, one variant per class and other Shape | every vessel × Glaze × modifier × rework |
 * | firing windows, salvage, `END_*` | all, incl. the `null` / decline choice; `SECOND_FIRING_CHOOSE` both cards × Jun {none, +1, −1 when ready} | same |
 * | `DISCARD_TO_HAND_LIMIT` | every C(hand, excess) | same |
 *
 * **Bounds.** `perFamilyLimit` (default 64 in canonical, unlimited in exhaustive) stops each
 * family separately; `limit` stops the whole enumeration. Families whose candidates differ by
 * worker choice are interleaved round-robin across those choices, so a family limit never
 * hides one worker. A placement group stops at its first candidate whose error is one of
 * `PLACEMENT_GATE_CODES` (that error then applies to every command of the group), and Form &
 * Decorate skips candidates whose cost lower bound exceeds the player's resources, so an
 * unaffordable or blocked location costs a single validation. Combinations that the
 * 1-per-discipline Tech limit (L211) makes unreachable are never generated together (Prepared
 * Clay with Senior Apprentice or Decorator's Kit; Kiln Furniture with Inverted Firing comes
 * from P3's option list, which never offers it); validators still handle them.
 *
 * `legalCommands` is `legalContributions(view)` in `firing_contributions` and `legalActions`
 * elsewhere (DESIGN §4.6, §5.2). `legalActionFamilies` lists the families with at least one
 * legal command (the first valid candidate of each family). `sampleLegalAction` (DESIGN
 * §5.3) builds a random command step by step from the selectors, so the fuzz test explores
 * far beyond the canonical list, and falls back to the first canonical command.
 *
 * Layer 5. Like `selectors.ts` it imports `validateAction` from `engine.ts` (DESIGN §2.5);
 * the import is acyclic (`engine.ts` imports neither module).
 */

import { DECORATIONS, DISCIPLINES, FIRING, GLAZES, KILNS, KILN_IDS, LOCATIONS, ORDERS, SHAPES, TECHS, decorationCost, shapeClay, zoneOf } from "./content.ts";
import { validateAction } from "./engine.ts";
import { InvariantError } from "./errors.ts";
import { afterQualityOptions, salvageOptions } from "./firing/afterQuality.ts";
import { legalContributions } from "./firing/contributions.ts";
import { heatMarkerStepOptions, junOptions } from "./firing/pipeline.ts";
import { kilnAbilityReady } from "./kilns.ts";
import { loadDestinationOptions } from "./kilnLoading.ts";
import { completionTriggers } from "./orders/completion.ts";
import { findOrderMatches, ruTriggers, type OrderMatch } from "./orders/matching.ts";
import { settersMarkSpaces } from "./round.ts";
import {
  PLACEMENT_GATE_CODES,
  asActorView,
  colourSamplesSwapOptions,
  completableOrders,
  dingCopyableVesselIndexes,
  formDiscountVariants,
  guildInspectionOptions,
  guildOptions,
  heatMarkerTargets,
  imperialPriorityOptions,
  lookedOrderOptions,
  orderMatchOptions,
  placementOptions,
  placementWorkerChoices,
  secondFiringChoiceOptions,
  settersMarkOptions,
} from "./selectors.ts";
import { ceramicsOf, decisionPrompt, lookup, player, workStep } from "./state.ts";
import { handLimit, techReady } from "./techs.ts";
import type {
  ActorView,
  AuthoritativeCommand,
  Decoration,
  FinishedCeramic,
  SelectPick,
  FormVesselSpec,
  GameAction,
  GameActionType,
  Glaze,
  LegalActionMode,
  LegalActionOptions,
  LoadSpec,
  LocationId,
  OrderCompletionSpec,
  OrderDefinition,
  PlayerId,
  PlayerState,
  PlayerView,
  PublicGameState,
  RandomSource,
  Shape,
  ShapedCeramic,
  TechId,
  WorkerEffect,
  WorkerKind,
  WorkerId,
} from "./types.ts";

type ActionOf<T extends GameActionType> = Extract<GameAction, { type: T }>;
type FormDecorateAction = ActionOf<"PLACE_FORM_DECORATE">;
type GlazeLoadAction = ActionOf<"PLACE_GLAZE_LOAD">;
type Destination = LoadSpec["destination"];
type DiscountVariant = Pick<FormDecorateAction, "useLargeThrowingWheel" | "decoratorsKitVesselIndex">;

const PREPARED_CLAY: TechId = "T17";
const REWORKING_TABLE: TechId = "T05";
const INVERTED_FIRING: TechId = "T21";
const STACKABLE_SHAPES: readonly Shape[] = TECHS.T21.params.shapes;
const LARGE_THROWING_WHEEL: TechId = "T01";
const DECORATORS_KIT: TechId = "T16";
const KILN_MASTER_VALUES = TECHS.T24.params.values;
const DEFAULT_CANONICAL_FAMILY_LIMIT = 64;
/** DESIGN §5.3: sampling attempts before the canonical fallback. */
const SAMPLE_ATTEMPTS = 20;
/** DESIGN §5.3: Canal Wharf is always legal, so it is sampled less often. */
const FAMILY_WEIGHT = 4;
const CANAL_WHARF_WEIGHT = 1;

interface EnumContext {
  readonly view: ActorView;
  readonly game: PublicGameState;
  readonly pid: PlayerId;
  readonly me: PlayerState;
  readonly mode: LegalActionMode;
  /** `destinationsFor` memo for this enumeration call. */
  readonly destinations: Map<string, KindedDestination[]>;
}

interface WorkerChoice {
  workerId: WorkerId;
  kind: WorkerKind;
  effect: WorkerEffect;
  seniorApprentice: boolean;
}

/**
 * One action family: its candidate groups (interleaved round-robin) and whether a
 * `PLACEMENT_GATE_CODES` error on a group's first candidate ends that group.
 */
interface Family {
  readonly type: GameActionType;
  readonly gated: boolean;
  groups(ctx: EnumContext): Array<Iterable<GameAction>>;
}

function isCanonical(ctx: EnumContext): boolean {
  return ctx.mode === "canonical";
}

function contextFor(view: PlayerView, mode: LegalActionMode): EnumContext | null {
  const actor = asActorView(view);
  if (actor === null || view.game.phase.type === "finished") {
    return null;
  }
  if (!decisionPrompt(view.game).actorIds.includes(actor.viewerId)) {
    return null;
  }
  return { view: actor, game: view.game, pid: actor.viewerId, me: player(view.game, actor.viewerId), mode, destinations: new Map() };
}

function seniorFlag(choice: WorkerChoice): { seniorApprentice?: true } {
  return choice.seniorApprentice ? { seniorApprentice: true } : {};
}

function* combinations<T>(items: readonly T[], size: number, start = 0, prefix: T[] = []): Generator<T[]> {
  if (prefix.length === size) {
    yield [...prefix];
    return;
  }
  for (let index = start; index <= items.length - (size - prefix.length); index += 1) {
    prefix.push(items[index] as T);
    yield* combinations(items, size, index + 1, prefix);
    prefix.pop();
  }
}

function* permutations<T>(items: readonly T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield [...items];
    return;
  }
  for (let index = 0; index < items.length; index += 1) {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) {
      yield [items[index] as T, ...tail];
    }
  }
}

// ── Vessels and kiln targets ─────────────────────────────────────────────────────────

/** Shaped vessels not in `used`; canonical keeps the lowest sequence of each Shape ×
 * Decoration class (DESIGN §5.2 equivalent vessels). */
function vesselChoices(ctx: EnumContext, used: ReadonlySet<string>): ShapedCeramic[] {
  const shaped = ceramicsOf(ctx.game, ctx.pid, "shaped").filter((c) => !used.has(c.id));
  if (!isCanonical(ctx)) {
    return shaped;
  }
  const seen = new Set<string>();
  return shaped.filter((c) => {
    const key = `${c.shape}|${c.decoration}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

type DestinationKind = "plain" | "inverted" | "furniture" | "imperial";

interface KindedDestination {
  readonly destination: Destination;
  readonly kind: DestinationKind;
}

function kindOf(destination: Destination): DestinationKind {
  if (destination.kiln === "imperial") {
    return "imperial";
  }
  if (destination.invertedFiring === true) {
    return "inverted";
  }
  return destination.kilnFurniture === undefined ? "plain" : "furniture";
}

/**
 * `loadDestinationOptions` (P3), collapsed in canonical mode: one plain space per zone, the
 * own Setter's Mark space, every Inverted Firing target, every Imperial modifier, and Kiln
 * Furniture's three modifiers on one representative space per zone (DESIGN §5.2). Furniture
 * makes the zone irrelevant to that ceramic's Heat, but not to which spaces stay open for the
 * Shifu's second load, so one representative per zone keeps every reachable occupancy.
 * Memoised per enumeration call (`ctx.destinations`).
 */
function destinationsFor(ctx: EnumContext, ceramicId: string, earlier: readonly LoadSpec[], rework?: Shape): KindedDestination[] {
  const key = `${ceramicId}|${rework ?? ""}|${JSON.stringify(earlier)}`;
  const cached = ctx.destinations.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const options = loadDestinationOptions(ctx.view, ctx.pid, ceramicId, earlier, rework);
  const kept: KindedDestination[] = [];
  if (!isCanonical(ctx)) {
    kept.push(...options.map((option) => ({ destination: option.destination, kind: kindOf(option.destination) })));
  } else {
    const zones = new Set<string>();
    const furnitureSpaces = new Map<string, string>();
    for (const option of options) {
      const destination = option.destination;
      const kind = kindOf(destination);
      if (kind === "imperial" || kind === "inverted") {
        kept.push({ destination, kind });
      } else if (destination.kiln === "shared" && kind === "furniture") {
        const zone = zoneOf(destination.spaceId);
        const space = furnitureSpaces.get(zone) ?? destination.spaceId;
        furnitureSpaces.set(zone, space);
        if (destination.spaceId === space) {
          kept.push({ destination, kind });
        }
      } else if (option.returnsSettersMark) {
        kept.push({ destination, kind });
      } else if (destination.kiln === "shared") {
        const zone = zoneOf(destination.spaceId);
        if (!zones.has(zone)) {
          zones.add(zone);
          kept.push({ destination, kind });
        }
      }
    }
  }
  ctx.destinations.set(key, kept);
  return kept;
}

interface SingleFilter {
  /** Glazes to use, in `GLAZES` order. */
  readonly glazes: readonly Glaze[];
  /** Destination kinds to use (all when omitted). */
  readonly kinds?: ReadonlySet<DestinationKind>;
  /** Plain loads, Reworking Table loads, or both. */
  readonly rework: "none" | "only" | "both";
  /** Only vessels of these Shapes (all when omitted). */
  readonly shapes?: readonly Shape[];
}

/**
 * One load after `earlier`: vessel class × Glaze × destination, then (T05 ready and no earlier
 * rework; once per round, so once per action) vessel class × other Shape × destination with
 * the first Glaze. Exhaustive mode uses every vessel, destination, Glaze and rework.
 */
function* singleLoads(ctx: EnumContext, earlier: readonly LoadSpec[], filter: SingleFilter): Generator<LoadSpec> {
  const vessels = vesselChoices(ctx, new Set(earlier.map((load) => load.ceramicId))).filter(
    (vessel) => filter.shapes === undefined || filter.shapes.includes(vessel.shape),
  );
  const kindOk = (entry: KindedDestination) => filter.kinds === undefined || filter.kinds.has(entry.kind);
  if (filter.rework !== "only") {
    for (const vessel of vessels) {
      const destinations = destinationsFor(ctx, vessel.id, earlier).filter(kindOk);
      for (const glaze of filter.glazes) {
        for (const { destination } of destinations) {
          yield { ceramicId: vessel.id, glaze, destination };
        }
      }
    }
  }
  if (filter.rework === "none" || !techReady(ctx.me, REWORKING_TABLE) || earlier.some((load) => load.reworkShape !== undefined)) {
    return;
  }
  const reworkGlazes = isCanonical(ctx) ? filter.glazes.slice(0, 1) : filter.glazes;
  for (const vessel of vessels) {
    for (const shape of SHAPES) {
      if (shape === vessel.shape) {
        continue;
      }
      const destinations = destinationsFor(ctx, vessel.id, earlier, shape).filter(kindOk);
      for (const glaze of reworkGlazes) {
        for (const { destination } of destinations) {
          yield { ceramicId: vessel.id, glaze, destination, reworkShape: shape };
        }
      }
    }
  }
}

// ── Work Phase placements ────────────────────────────────────────────────────────────

function* materialsYardCandidates(ctx: EnumContext, choice: WorkerChoice): Generator<GameAction> {
  const total = LOCATIONS.materials_yard.effects[choice.effect].resources;
  const prepared: Array<{ shape: Shape; decoration: Decoration } | null> = [null];
  // Senior Apprentice and Prepared Clay are both Workshop Techs (L211): never together.
  if (!choice.seniorApprentice && techReady(ctx.me, PREPARED_CLAY)) {
    for (const shape of SHAPES) {
      for (const decoration of DECORATIONS) {
        prepared.push({ shape, decoration });
      }
    }
  }
  for (const preparedClay of prepared) {
    for (let clay = 0; clay <= total; clay += 1) {
      yield {
        type: "PLACE_MATERIALS_YARD",
        workerId: choice.workerId,
        clay,
        wood: total - clay,
        ...seniorFlag(choice),
        ...(preparedClay === null ? {} : { preparedClay }),
      };
    }
  }
}

const SINGLE_VESSELS: readonly FormVesselSpec[] = SHAPES.flatMap((shape) => DECORATIONS.map((decoration) => ({ shape, decoration })));

/**
 * A lower bound on a Form & Decorate command's cost, with every discount it names at its
 * largest. Used only to skip candidates that cannot be afforded; validation decides the rest.
 */
function formCostLowerBound(effect: WorkerEffect, action: FormDecorateAction): { clay: number; coins: number } {
  let clay = action.vessels.reduce((sum, v) => sum + shapeClay(v.shape), 0);
  let coins = action.vessels.reduce((sum, v) => sum + decorationCost(v.decoration), 0);
  if (action.useLargeThrowingWheel === true) {
    clay = Math.max(0, clay - TECHS.T01.params.clayReduction);
  }
  if (action.decoratorsKitVesselIndex !== undefined) {
    coins -= TECHS.T16.params.coinReduction;
  }
  if (effect === "shifu" && action.vessels.length === 2) {
    coins -= LOCATIONS.form_decorate.effects.shifu.twoVesselDecorationDiscount;
  }
  coins = Math.max(0, coins);
  if (action.dingExtra !== undefined) {
    clay += KILNS.DI.params.clay;
    coins += KILNS.DI.params.coins;
  }
  return { clay, coins };
}

function mightAfford(ctx: EnumContext, effect: WorkerEffect, action: FormDecorateAction): boolean {
  const bound = formCostLowerBound(effect, action);
  return bound.clay <= ctx.me.resources.clay && bound.coins <= ctx.me.resources.coins;
}

/** Exhaustive discount variants: none, the Wheel, the Kit on each eligible vessel, both. */
function allDiscountVariants(ctx: EnumContext, vessels: readonly FormVesselSpec[]): DiscountVariant[] {
  const wheelShapes: readonly Shape[] = TECHS.T01.params.triggerShapes;
  const kitDecorations: readonly Decoration[] = TECHS.T16.params.decorations;
  const wheels = techReady(ctx.me, LARGE_THROWING_WHEEL) && vessels.some((v) => wheelShapes.includes(v.shape)) ? [false, true] : [false];
  const kits: Array<number | null> = [null];
  if (techReady(ctx.me, DECORATORS_KIT)) {
    vessels.forEach((v, index) => {
      if (kitDecorations.includes(v.decoration)) {
        kits.push(index);
      }
    });
  }
  const variants: DiscountVariant[] = [];
  for (const wheel of wheels) {
    for (const kit of kits) {
      variants.push({ ...(wheel ? { useLargeThrowingWheel: true } : {}), ...(kit === null ? {} : { decoratorsKitVesselIndex: kit }) });
    }
  }
  return variants;
}

function* formDecorateCandidates(ctx: EnumContext, choice: WorkerChoice): Generator<GameAction> {
  const maxVessels = LOCATIONS.form_decorate.effects[choice.effect].maxVessels;
  const sets: FormVesselSpec[][] = SINGLE_VESSELS.map((vessel) => [vessel]);
  if (maxVessels >= 2) {
    for (let first = 0; first < SINGLE_VESSELS.length; first += 1) {
      for (let second = isCanonical(ctx) ? first : 0; second < SINGLE_VESSELS.length; second += 1) {
        sets.push([SINGLE_VESSELS[first] as FormVesselSpec, SINGLE_VESSELS[second] as FormVesselSpec]);
      }
    }
  }
  const dingShapes: readonly Shape[] = KILNS.DI.params.shapes;
  const dingReady = kilnAbilityReady(ctx.me, "DI");
  for (const vessels of sets) {
    const variants = isCanonical(ctx) ? formDiscountVariants(ctx.view, ctx.pid, vessels) : allDiscountVariants(ctx, vessels);
    for (const variant of variants) {
      const base: FormDecorateAction = { type: "PLACE_FORM_DECORATE", workerId: choice.workerId, vessels, ...variant };
      if (mightAfford(ctx, choice.effect, base)) {
        yield base;
      }
      if (!dingReady) {
        continue;
      }
      const copyable = vessels.flatMap((v, index) => (dingShapes.includes(v.shape) ? [index] : []));
      for (const copyOfVesselIndex of isCanonical(ctx) ? copyable.slice(0, 1) : copyable) {
        for (const decoration of DECORATIONS) {
          const withDing: FormDecorateAction = { ...base, dingExtra: { copyOfVesselIndex, decoration } };
          if (mightAfford(ctx, choice.effect, withDing)) {
            yield withDing;
          }
        }
      }
    }
  }
}

/** The candidates of several streams, one from each in turn until all are exhausted. */
function* interleave<T>(streams: ReadonlyArray<Iterable<T>>): Generator<T> {
  let live = streams.map((stream) => stream[Symbol.iterator]());
  while (live.length > 0) {
    const next: Array<Iterator<T>> = [];
    for (const iterator of live) {
      const step = iterator.next();
      if (step.done !== true) {
        next.push(iterator);
        yield step.value;
      }
    }
    live = next;
  }
}

const FIRST_GLAZE: readonly Glaze[] = GLAZES.slice(0, 1);
const OTHER_GLAZES: readonly Glaze[] = GLAZES.slice(1);

/**
 * Glaze & Load candidate streams for one worker choice (`interleave`d into its group).
 * Exhaustive: one stream, every single then every pair, each with every Heat-marker choice.
 * Canonical: disjoint streams taken round-robin, so the default `perFamilyLimit` still offers each optional
 * ability used and declined (R4) and a Shifu pair, instead of spending the limit on Glaze
 * permutations of single loads:
 *
 * 1. singles, first Glaze, a plain space (zone representative or own Setter's Mark), no marker;
 * 2. the same with Inverted Firing; 3. with Kiln Furniture; 4. into the Imperial Kiln;
 * 5. Reworking Table singles, first Glaze; 6. (Shifu) first-Glaze singles with each Heat-marker
 *    target; 7. (Shifu) pairs, first Glaze on both, no marker, except those of stream 8;
 * 8. (T21 ready) a plain first load, then a Bowl, Plate or Brush Washer stacked by Inverted
 *    Firing;
 * 9. the rest: every other Glaze and every marker variant of singles and pairs.
 */
function glazeLoadStreams(ctx: EnumContext, choice: WorkerChoice): Array<Iterable<GameAction>> {
  const pairs = LOCATIONS.glaze_load.effects[choice.effect].maxLoads >= 2;
  const marker = choice.effect === "shifu" && LOCATIONS.glaze_load.effects.shifu.placesHeatMarker;
  const action = (loads: LoadSpec[], heatMarkerCeramicId?: string): GlazeLoadAction => ({
    type: "PLACE_GLAZE_LOAD",
    workerId: choice.workerId,
    loads,
    ...(heatMarkerCeramicId === undefined ? {} : { heatMarkerCeramicId }),
  });
  const markerTargets = (loads: LoadSpec[]): string[] => (marker ? heatMarkerTargets(ctx.view, ctx.pid, loads) : []);
  const withMarkers = function* (loads: LoadSpec[], includeNone: boolean): Generator<GameAction> {
    if (includeNone) {
      yield action(loads);
    }
    for (const target of markerTargets(loads)) {
      yield action(loads, target);
    }
  };
  const pairsOf = function* (filter: SingleFilter, second: SingleFilter = filter): Generator<LoadSpec[]> {
    for (const first of singleLoads(ctx, [], filter)) {
      for (const next of singleLoads(ctx, [first], second)) {
        yield [first, next];
      }
    }
  };
  if (!isCanonical(ctx)) {
    const all: SingleFilter = { glazes: GLAZES, rework: "both" };
    return [
      (function* () {
        for (const load of singleLoads(ctx, [], all)) {
          yield* withMarkers([load], true);
        }
        if (pairs) {
          for (const loads of pairsOf(all)) {
            yield* withMarkers(loads, true);
          }
        }
      })(),
    ];
  }
  const singlesOfKind = function* (kind: DestinationKind): Generator<GameAction> {
    for (const load of singleLoads(ctx, [], { glazes: FIRST_GLAZE, kinds: new Set([kind]), rework: "none" })) {
      yield action([load]);
    }
  };
  const streams: Array<Iterable<GameAction>> = [
    singlesOfKind("plain"),
    singlesOfKind("inverted"),
    singlesOfKind("furniture"),
    singlesOfKind("imperial"),
    (function* () {
      for (const load of singleLoads(ctx, [], { glazes: FIRST_GLAZE, rework: "only" })) {
        yield action([load]);
      }
    })(),
  ];
  if (marker) {
    streams.push(
      (function* () {
        for (const load of singleLoads(ctx, [], { glazes: FIRST_GLAZE, rework: "none" })) {
          yield* withMarkers([load], false);
        }
      })(),
    );
  }
  if (pairs) {
    // A plain first load and a second Bowl, Plate or Brush Washer stacked by Inverted Firing
    // (onto the first, or another own ceramic; R5c) has its own stream: pairs list the second
    // load per first load, so a stack would otherwise come late. Only when T21 is ready and a
    // stackable vessel exists, so the stream is never an expensive empty scan.
    const stackFirst: SingleFilter = { glazes: FIRST_GLAZE, kinds: new Set(["plain"]), rework: "none" };
    const stackSecond: SingleFilter = { glazes: FIRST_GLAZE, kinds: new Set(["inverted"]), rework: "none", shapes: STACKABLE_SHAPES };
    const prioritised = (loads: readonly LoadSpec[]) =>
      loads.length === 2 &&
      loads.every((load) => load.reworkShape === undefined) &&
      kindOf((loads[0] as LoadSpec).destination) === "plain" &&
      kindOf((loads[1] as LoadSpec).destination) === "inverted";
    const stacking =
      techReady(ctx.me, INVERTED_FIRING) && ceramicsOf(ctx.game, ctx.pid, "shaped").some((vessel) => STACKABLE_SHAPES.includes(vessel.shape));
    streams.push(
      (function* () {
        for (const loads of pairsOf({ glazes: FIRST_GLAZE, rework: "both" })) {
          if (!prioritised(loads)) {
            yield action(loads);
          }
        }
      })(),
    );
    if (stacking) {
      streams.push(
        (function* () {
          for (const loads of pairsOf(stackFirst, stackSecond)) {
            yield action(loads);
          }
        })(),
      );
    }
  }
  streams.push(
    (function* () {
      for (const load of singleLoads(ctx, [], { glazes: OTHER_GLAZES, rework: "none" })) {
        yield* withMarkers([load], true);
      }
      for (const load of singleLoads(ctx, [], { glazes: FIRST_GLAZE, rework: "only" })) {
        yield* withMarkers([load], false);
      }
      if (pairs) {
        for (const loads of pairsOf({ glazes: GLAZES, rework: "both" })) {
          const firstGlazeOnly = loads.every((load) => load.glaze === FIRST_GLAZE[0]);
          yield* withMarkers(loads, !firstGlazeOnly);
        }
      }
    })(),
  );
  return streams;
}

/** Every single pick the viewer's open Select allows: the face-up slots ascending, then the
 * looked cards in look order (v1.6.2 L64). */
function selectPicks(ctx: EnumContext): SelectPick[] {
  const options = lookedOrderOptions(ctx.view);
  if (options === null) {
    return [];
  }
  const display = ctx.game.market.display;
  const picks: SelectPick[] = [];
  for (const slotIndex of options.faceUpSlots) {
    const orderId = display[slotIndex];
    if (orderId !== null && orderId !== undefined) {
      picks.push({ kind: "face_up", slotIndex, orderId });
    }
  }
  for (const orderId of options.orderIds) {
    picks.push({ kind: "looked", orderId });
  }
  return picks;
}

function* commissionCandidates(_ctx: EnumContext, choice: WorkerChoice): Generator<GameAction> {
  yield { type: "PLACE_COMMISSION_MARKET", workerId: choice.workerId, ...seniorFlag(choice) };
}

function* guildHallCandidates(ctx: EnumContext, choice: WorkerChoice): Generator<GameAction> {
  if (choice.effect === "apprentice") {
    for (const techId of DISCIPLINES.flatMap((d) => ctx.game.techDisplay[d])) {
      yield { type: "PLACE_GUILD_HALL", workerId: choice.workerId, choice: { kind: "buy_face_up", techId } };
    }
    return;
  }
  const withCards = DISCIPLINES.filter((d) => ctx.game.counts.techDecks[d] > 0);
  const disciplines = !isCanonical(ctx) ? DISCIPLINES : withCards.length > 0 ? withCards : DISCIPLINES.slice(0, 1);
  for (const discipline of disciplines) {
    yield { type: "PLACE_GUILD_HALL", workerId: choice.workerId, choice: { kind: "inspect", discipline } };
  }
}

function placementFamily(
  type: GameActionType,
  locationId: LocationId,
  generate: (ctx: EnumContext, choice: WorkerChoice) => Iterable<GameAction>,
): Family {
  return {
    type,
    gated: true,
    groups: (ctx) => placementWorkerChoices(ctx.view, ctx.pid, locationId).map((choice) => generate(ctx, choice)),
  };
}

const PLACEMENT_FAMILIES: readonly Family[] = [
  placementFamily("PLACE_MATERIALS_YARD", "materials_yard", materialsYardCandidates),
  placementFamily("PLACE_FORM_DECORATE", "form_decorate", formDecorateCandidates),
  placementFamily("PLACE_GLAZE_LOAD", "glaze_load", (ctx, choice) => interleave(glazeLoadStreams(ctx, choice))),
  placementFamily("PLACE_COMMISSION_MARKET", "commission_market", commissionCandidates),
  placementFamily("PLACE_GUILD_HALL", "guild_hall", guildHallCandidates),
  placementFamily("PLACE_CANAL_WHARF", "canal_wharf", (_ctx, choice) => [{ type: "PLACE_CANAL_WHARF", workerId: choice.workerId }]),
  placementFamily("PLACE_MAGISTRATES_HALL", "magistrates_hall", (_ctx, choice) => [{ type: "PLACE_MAGISTRATES_HALL", workerId: choice.workerId }]),
];

// ── Order completion (Order Phase) ───────────────────────────────────────────────────

function finishedOf(ctx: EnumContext, match: OrderMatch): FinishedCeramic[] {
  return match.ceramicIds
    .map((id) => lookup(ctx.game.ceramics, id))
    .filter((c): c is FinishedCeramic => c !== undefined && c.stage === "finished");
}

/** Canonical: the first match, plus the first Ru-triggering match when Ru is ready. */
function matchesFor(ctx: EnumContext, order: OrderDefinition, pool: readonly FinishedCeramic[]): OrderMatch[] {
  if (!isCanonical(ctx)) {
    return findOrderMatches(order, pool);
  }
  const first = findOrderMatches(order, pool, 1);
  const head = first[0];
  if (head === undefined || !kilnAbilityReady(ctx.me, "RU") || ruTriggers(finishedOf(ctx, head))) {
    return first;
  }
  const ru = findOrderMatches(order, pool).find((match) => ruTriggers(finishedOf(ctx, match)));
  return ru === undefined ? first : [head, ru];
}

function* completionCandidates(ctx: EnumContext): Generator<GameAction> {
  const pool = ceramicsOf(ctx.game, ctx.pid, "finished");
  if (pool.length === 0) {
    return;
  }
  for (const orderId of ctx.view.own.orderHand) {
    const order = lookup(ORDERS, orderId);
    if (order === undefined) {
      continue;
    }
    for (const match of matchesFor(ctx, order, pool)) {
      const triggers = completionTriggers(ctx.me, order, finishedOf(ctx, match));
      const kilnFlags = triggers.ru || triggers.guan ? [false, true] : [false];
      const tributeFlags = triggers.tributeWare ? [false, true] : [false];
      for (const declineKilnAbility of kilnFlags) {
        for (const declineTributeWare of tributeFlags) {
          yield {
            type: "COMPLETE_ORDER",
            orderId,
            ceramicIds: [...match.ceramicIds],
            ...(declineKilnAbility ? { declineKilnAbility: true } : {}),
            ...(declineTributeWare ? { declineTributeWare: true } : {}),
          };
        }
      }
    }
  }
}

// ── Families by phase ────────────────────────────────────────────────────────────────

function family(type: GameActionType, generate: (ctx: EnumContext) => Iterable<GameAction>): Family {
  return { type, gated: false, groups: (ctx) => [generate(ctx)] };
}

const SELECT_KILN = family("SELECT_KILN", () => KILN_IDS.map((kilnId): GameAction => ({ type: "SELECT_KILN", kilnId })));

const PLACE_SETTERS_MARK = family("PLACE_SETTERS_MARK", function* (ctx) {
  const zones = new Set<string>();
  for (const spaceId of settersMarkSpaces(ctx.game)) {
    if (isCanonical(ctx)) {
      const zone = zoneOf(spaceId);
      if (zones.has(zone)) {
        continue;
      }
      zones.add(zone);
    }
    yield { type: "PLACE_SETTERS_MARK", spaceId };
  }
  yield { type: "PLACE_SETTERS_MARK", spaceId: null };
});

const USE_COLOUR_SAMPLES_SWAP = family("USE_COLOUR_SAMPLES_SWAP", function* (ctx) {
  const options = colourSamplesSwapOptions(ctx.view);
  if (!options.usable) {
    return;
  }
  for (const discard of options.discards) {
    yield { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: discard.orderId };
  }
});

const SECOND_FIRING_CHOOSE = family("SECOND_FIRING_CHOOSE", function* (ctx) {
  const options = secondFiringChoiceOptions(ctx.view);
  if (options === null) {
    return;
  }
  for (const cardIndex of [0, 1] as const) {
    yield { type: "SECOND_FIRING_CHOOSE", cardIndex, jun: null };
    if (options.jun.ready) {
      for (const delta of KILNS.JU.params.deltas) {
        yield { type: "SECOND_FIRING_CHOOSE", cardIndex, jun: { delta } };
      }
    }
  }
});

const USE_IMPERIAL_PRIORITY = family("USE_IMPERIAL_PRIORITY", function* (ctx) {
  if (!imperialPriorityOptions(ctx.view).usable) {
    return;
  }
  const vessels = vesselChoices(ctx, new Set());
  for (const vessel of vessels) {
    for (const glaze of GLAZES) {
      for (const imperialModifier of FIRING.imperialModifiers) {
        yield { type: "USE_IMPERIAL_PRIORITY", ceramicId: vessel.id, glaze, imperialModifier };
      }
    }
  }
  if (!techReady(ctx.me, REWORKING_TABLE)) {
    return;
  }
  // DESIGN §11 Q1 default: Reworking Table may change the Shape first.
  for (const vessel of vessels) {
    for (const reworkShape of SHAPES) {
      if (reworkShape === vessel.shape) {
        continue;
      }
      if (isCanonical(ctx)) {
        yield { type: "USE_IMPERIAL_PRIORITY", ceramicId: vessel.id, glaze: "white", imperialModifier: 0, reworkShape };
        continue;
      }
      for (const glaze of GLAZES) {
        for (const imperialModifier of FIRING.imperialModifiers) {
          yield { type: "USE_IMPERIAL_PRIORITY", ceramicId: vessel.id, glaze, imperialModifier, reworkShape };
        }
      }
    }
  }
});

const END_TURN = family("END_TURN", () => [{ type: "END_TURN" }]);

const SELECT_CHOOSE = family("SELECT_CHOOSE", function* (ctx) {
  const options = lookedOrderOptions(ctx.view);
  if (options === null) {
    return;
  }
  const picks = selectPicks(ctx);
  for (const pick of picks) {
    yield { type: "SELECT_CHOOSE", reservations: [pick] };
  }
  if (options.maxReservations >= 2) {
    for (const pair of combinations(picks, 2)) {
      yield { type: "SELECT_CHOOSE", reservations: pair };
    }
  }
});

const GUILD_TAKE = family("GUILD_TAKE", function* (ctx) {
  const options = guildInspectionOptions(ctx.view);
  if (options === null || options.takesLeft <= 0) {
    return;
  }
  for (const option of options.inspected) {
    yield { type: "GUILD_TAKE", take: { kind: "inspected", techId: option.techId } };
  }
  for (const option of options.faceUp) {
    yield { type: "GUILD_TAKE", take: { kind: "face_up", techId: option.techId } };
  }
});

const GUILD_FINISH = family("GUILD_FINISH", function* (ctx) {
  const options = guildInspectionOptions(ctx.view);
  if (options === null || !options.canFinish) {
    return;
  }
  for (const bottomOrder of permutations(options.inspected.map((option) => option.techId))) {
    yield { type: "GUILD_FINISH", bottomOrder };
  }
});

const TEST_PIECES_DECIDE = family("TEST_PIECES_DECIDE", () => [
  { type: "TEST_PIECES_DECIDE", peek: true },
  { type: "TEST_PIECES_DECIDE", peek: false },
]);

const TEST_PIECES_BURY = family("TEST_PIECES_BURY", () => [
  { type: "TEST_PIECES_BURY", bury: true },
  { type: "TEST_PIECES_BURY", bury: false },
]);

const RESOLVE_HEAT_MARKERS = family("RESOLVE_HEAT_MARKERS", function* (ctx) {
  const options = heatMarkerStepOptions(ctx.view);
  if (options === null) {
    return;
  }
  const ownChoices: Array<1 | -1 | "return" | null> = options.ownMarkerCeramicId === null ? [null] : [1, -1, "return"];
  for (const own of ownChoices) {
    const base: ActionOf<"RESOLVE_HEAT_MARKERS"> = { type: "RESOLVE_HEAT_MARKERS", ...(own === null ? {} : { ownMarker: own }) };
    const kilnMaster = options.kilnMaster;
    if (kilnMaster !== null && kilnMaster.ready) {
      const targets = own === "return" ? kilnMaster.targetsIfOwnReturned : kilnMaster.targets;
      for (const ceramicId of targets) {
        for (const value of KILN_MASTER_VALUES) {
          yield { ...base, kilnMaster: { ceramicId, value } };
        }
      }
    }
    yield base;
  }
});

const RESOLVE_JUN = family("RESOLVE_JUN", function* (ctx) {
  for (const ceramicId of junOptions(ctx.view)?.ceramicIds ?? []) {
    for (const delta of KILNS.JU.params.deltas) {
      yield { type: "RESOLVE_JUN", adjustment: { ceramicId, delta } };
    }
  }
  yield { type: "RESOLVE_JUN", adjustment: null };
});

function afterQualityFamily(type: "USE_PROTECTIVE_SAGGARS" | "USE_SECOND_FIRING" | "USE_GE_CRACKLE", ability: string): Family {
  return family(type, function* (ctx) {
    for (const option of afterQualityOptions(ctx.view)) {
      if (option.ability === ability) {
        for (const ceramicId of option.ceramicIds) {
          yield { type, ceramicId };
        }
      }
    }
  });
}

const USE_PROTECTIVE_SAGGARS = afterQualityFamily("USE_PROTECTIVE_SAGGARS", "protective_saggars");
const USE_SECOND_FIRING = afterQualityFamily("USE_SECOND_FIRING", "second_firing");
const USE_GE_CRACKLE = afterQualityFamily("USE_GE_CRACKLE", "ge_crackle");

const END_AFTER_QUALITY = family("END_AFTER_QUALITY", () => [{ type: "END_AFTER_QUALITY" }]);

const SALVAGE_FLAWED = family("SALVAGE_FLAWED", function* (ctx) {
  for (const ceramicId of salvageOptions(ctx.view)?.ceramicIds ?? []) {
    yield { type: "SALVAGE_FLAWED", ceramicId };
  }
  yield { type: "SALVAGE_FLAWED", ceramicId: null };
});

const COMPLETE_ORDER = family("COMPLETE_ORDER", (ctx) => completionCandidates(ctx));

const END_ORDER_TURN = family("END_ORDER_TURN", () => [{ type: "END_ORDER_TURN" }]);

const DISCARD_TO_HAND_LIMIT = family("DISCARD_TO_HAND_LIMIT", function* (ctx) {
  const hand = ctx.view.own.orderHand;
  const excess = hand.length - handLimit(ctx.me);
  if (excess > 0) {
    for (const orderIds of combinations(hand, excess)) {
      yield { type: "DISCARD_TO_HAND_LIMIT", orderIds };
    }
  }
});

/** The families of the current decision, in their fixed order. */
function familiesFor(ctx: EnumContext): readonly Family[] {
  const phase = ctx.game.phase;
  switch (phase.type) {
    case "setup_kiln_selection":
      return [SELECT_KILN];
    case "round_start_setters_mark":
      return [PLACE_SETTERS_MARK];
    case "work_turn":
      switch (phase.step.kind) {
        case "before_action":
          return [USE_COLOUR_SAMPLES_SWAP, USE_IMPERIAL_PRIORITY, ...PLACEMENT_FAMILIES];
        case "commission_market":
        case "colour_samples":
        case "colour_samples_swap":
          return [SELECT_CHOOSE];
        case "guild_inspection":
          return [GUILD_TAKE, GUILD_FINISH];
        case "after_action":
          return [USE_COLOUR_SAMPLES_SWAP, USE_IMPERIAL_PRIORITY, END_TURN];
      }
      return [];
    case "firing_contributions":
      // Contributions are `SubmitContributionCommand`s, not actions (see `legalCommands`).
      return [];
    case "firing_test_pieces":
      return [TEST_PIECES_DECIDE, TEST_PIECES_BURY];
    case "firing_heat_markers":
      return [RESOLVE_HEAT_MARKERS];
    case "firing_heat_adjustment":
      return [RESOLVE_JUN];
    case "firing_second_firing_choice":
      return [SECOND_FIRING_CHOOSE];
    case "firing_after_quality":
      return [USE_PROTECTIVE_SAGGARS, USE_SECOND_FIRING, USE_GE_CRACKLE, END_AFTER_QUALITY];
    case "firing_salvage":
      return [SALVAGE_FLAWED];
    case "orders":
      return [COMPLETE_ORDER, END_ORDER_TURN];
    case "cleanup_hand_limit":
      return [DISCARD_TO_HAND_LIMIT];
    case "finished":
      return [];
  }
}

// ── The enumerator ───────────────────────────────────────────────────────────────────

interface Cursor {
  readonly iterator: Iterator<GameAction>;
  first: boolean;
}

/** The next valid candidate of a group, or null when the group is exhausted or gated. */
function nextValid(ctx: EnumContext, gated: boolean, cursor: Cursor): GameAction | null {
  for (;;) {
    const step = cursor.iterator.next();
    if (step.done === true) {
      return null;
    }
    const error = validateAction(ctx.view, step.value);
    const wasFirst = cursor.first;
    cursor.first = false;
    if (error === null) {
      return step.value;
    }
    if (gated && wasFirst && PLACEMENT_GATE_CODES.has(error.code)) {
      return null;
    }
  }
}

/** A family's valid candidates, its groups interleaved round-robin. */
function* validFamilyActions(ctx: EnumContext, fam: Family): Generator<GameAction> {
  let live: Cursor[] = fam.groups(ctx).map((group) => ({ iterator: group[Symbol.iterator](), first: true }));
  while (live.length > 0) {
    const next: Cursor[] = [];
    for (const cursor of live) {
      const action = nextValid(ctx, fam.gated, cursor);
      if (action === null) {
        continue;
      }
      next.push(cursor);
      yield action;
    }
    live = next;
  }
}

/**
 * Every legal action of the viewer's current decision, lazily, in the documented fixed order
 * (module JSDoc). Empty for spectators, for a viewer who is not among the prompt's actors,
 * in `finished` and in `firing_contributions` (see `legalCommands`).
 */
export function* enumerateLegalActions(view: PlayerView, opts: LegalActionOptions): Generator<GameAction> {
  const ctx = contextFor(view, opts.mode);
  const limit = opts.limit ?? Number.POSITIVE_INFINITY;
  const perFamily = opts.perFamilyLimit ?? (opts.mode === "canonical" ? DEFAULT_CANONICAL_FAMILY_LIMIT : Number.POSITIVE_INFINITY);
  if (ctx === null || limit <= 0 || perFamily <= 0) {
    return;
  }
  let total = 0;
  for (const fam of familiesFor(ctx)) {
    let count = 0;
    for (const action of validFamilyActions(ctx, fam)) {
      yield action;
      total += 1;
      count += 1;
      if (total >= limit) {
        return;
      }
      if (count >= perFamily) {
        break;
      }
    }
  }
}

/** `enumerateLegalActions` collected into an array. */
export function legalActions(view: PlayerView, opts: LegalActionOptions): GameAction[] {
  return [...enumerateLegalActions(view, opts)];
}

/**
 * Every legal command now: the viewer's affordable Contributions in `firing_contributions`
 * (`legalContributions`, Tend first, DESIGN §4.6), else `legalActions`. The computer
 * fallback and the fuzz test's exit of last resort.
 */
export function legalCommands(view: PlayerView, opts: LegalActionOptions): AuthoritativeCommand[] {
  if (view.game.phase.type === "firing_contributions") {
    const contributions = legalContributions(view);
    return opts.limit === undefined ? contributions : contributions.slice(0, Math.max(0, opts.limit));
  }
  return legalActions(view, opts);
}

/** The families with at least one legal action for the viewer now, in enumeration order. */
export function legalActionFamilies(view: PlayerView): GameActionType[] {
  const ctx = contextFor(view, "canonical");
  if (ctx === null) {
    return [];
  }
  return familiesFor(ctx)
    .filter((fam) => validFamilyActions(ctx, fam).next().done !== true)
    .map((fam) => fam.type);
}

// ── The sampler (DESIGN §5.3) ────────────────────────────────────────────────────────

function pick<T>(items: readonly T[], rng: RandomSource): T | undefined {
  return items.length === 0 ? undefined : items[rng.nextInt(items.length)];
}

function coin(rng: RandomSource): boolean {
  return rng.nextInt(2) === 1;
}

function shuffled<T>(items: readonly T[], rng: RandomSource): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = rng.nextInt(index + 1);
    const held = result[index] as T;
    result[index] = result[swap] as T;
    result[swap] = held;
  }
  return result;
}

/** Optional sampling bias; the default is DESIGN §5.3's uniform choice with Canal Wharf
 * down-weighted. A weight of 0 never picks the family unless every legal family has 0. */
export interface SampleOptions {
  weights?: Partial<Record<GameActionType, number>>;
}

function weightOf(type: GameActionType, options: SampleOptions): number {
  const custom = options.weights?.[type];
  if (custom !== undefined && Number.isFinite(custom) && custom >= 0) {
    return Math.floor(custom);
  }
  return type === "PLACE_CANAL_WHARF" ? CANAL_WHARF_WEIGHT : FAMILY_WEIGHT;
}

function pickFamily(families: readonly GameActionType[], rng: RandomSource, options: SampleOptions): GameActionType {
  const weights = families.map((type) => weightOf(type, options));
  if (weights.every((weight) => weight === 0)) {
    return pick(families, rng) as GameActionType;
  }
  let roll = rng.nextInt(weights.reduce((sum, weight) => sum + weight, 0));
  for (const [index, type] of families.entries()) {
    roll -= weights[index] ?? 0;
    if (roll < 0) {
      return type;
    }
  }
  return families[families.length - 1] as GameActionType;
}

const LOCATION_OF: Partial<Record<GameActionType, LocationId>> = {
  PLACE_MATERIALS_YARD: "materials_yard",
  PLACE_FORM_DECORATE: "form_decorate",
  PLACE_GLAZE_LOAD: "glaze_load",
  PLACE_COMMISSION_MARKET: "commission_market",
  PLACE_GUILD_HALL: "guild_hall",
  PLACE_CANAL_WHARF: "canal_wharf",
  PLACE_MAGISTRATES_HALL: "magistrates_hall",
};

function randomWorker(ctx: EnumContext, locationId: LocationId, rng: RandomSource): WorkerChoice | undefined {
  const option = placementOptions(ctx.view).find((o) => o.locationId === locationId);
  return pick(option?.workers.filter((w) => w.legal) ?? [], rng);
}

function randomFormDecorate(ctx: EnumContext, choice: WorkerChoice, rng: RandomSource): GameAction | null {
  // Affordable singles first (with whichever discount makes them affordable), then combine.
  const affordable = SINGLE_VESSELS.filter((vessel) =>
    formDiscountVariants(ctx.view, ctx.pid, [vessel]).some(
      (variant) => validateAction(ctx.view, { type: "PLACE_FORM_DECORATE", workerId: choice.workerId, vessels: [vessel], ...variant }) === null,
    ),
  );
  if (affordable.length === 0) {
    return null;
  }
  const count = LOCATIONS.form_decorate.effects[choice.effect].maxVessels >= 2 && coin(rng) ? 2 : 1;
  const vessels = Array.from({ length: count }, () => pick(affordable, rng) as FormVesselSpec);
  const variant = pick(formDiscountVariants(ctx.view, ctx.pid, vessels), rng) ?? {};
  const action: FormDecorateAction = { type: "PLACE_FORM_DECORATE", workerId: choice.workerId, vessels, ...variant };
  if (kilnAbilityReady(ctx.me, "DI") && coin(rng)) {
    const index = pick(dingCopyableVesselIndexes(ctx.view, action), rng);
    if (index !== undefined) {
      return { ...action, dingExtra: { copyOfVesselIndex: index, decoration: pick(DECORATIONS, rng) ?? "plain" } };
    }
  }
  return action;
}

/** Kiln Furniture and Inverted Firing are optional abilities: each is decided by a coin flip
 * when the options offer it, rather than by a uniform pick over all destinations. */
function pickDestination(destinations: readonly Destination[], rng: RandomSource): Destination | undefined {
  const furniture = destinations.filter((d) => d.kiln === "shared" && d.kilnFurniture !== undefined);
  const inverted = destinations.filter((d) => d.kiln === "shared" && d.invertedFiring === true);
  const plain = destinations.filter((d) => !furniture.includes(d) && !inverted.includes(d));
  if (furniture.length > 0 && coin(rng)) {
    return pick(furniture, rng);
  }
  if (inverted.length > 0 && coin(rng)) {
    return pick(inverted, rng);
  }
  return pick(plain.length > 0 ? plain : destinations, rng);
}

function randomGlazeLoad(ctx: EnumContext, choice: WorkerChoice, rng: RandomSource): GameAction | null {
  const shaped = ceramicsOf(ctx.game, ctx.pid, "shaped");
  const maxLoads = LOCATIONS.glaze_load.effects[choice.effect].maxLoads;
  const wanted = maxLoads >= 2 && shaped.length >= 2 && coin(rng) ? 2 : 1;
  const loads: LoadSpec[] = [];
  for (const vessel of shuffled(shaped, rng)) {
    if (loads.length >= wanted) {
      break;
    }
    let reworkShape: Shape | undefined;
    if (techReady(ctx.me, REWORKING_TABLE) && !loads.some((load) => load.reworkShape !== undefined) && rng.nextInt(3) === 0) {
      reworkShape = pick(SHAPES.filter((shape) => shape !== vessel.shape), rng);
    }
    let options = loadDestinationOptions(ctx.view, ctx.pid, vessel.id, loads, reworkShape);
    if (options.length === 0 && reworkShape !== undefined) {
      reworkShape = undefined;
      options = loadDestinationOptions(ctx.view, ctx.pid, vessel.id, loads);
    }
    const destination = pickDestination(options.map((option) => option.destination), rng);
    if (destination === undefined) {
      continue;
    }
    loads.push({ ceramicId: vessel.id, glaze: pick(GLAZES, rng) ?? "white", destination, ...(reworkShape === undefined ? {} : { reworkShape }) });
  }
  if (loads.length === 0) {
    return null;
  }
  const action: GlazeLoadAction = { type: "PLACE_GLAZE_LOAD", workerId: choice.workerId, loads };
  if (choice.effect === "shifu" && coin(rng)) {
    const target = pick(heatMarkerTargets(ctx.view, ctx.pid, loads), rng);
    if (target !== undefined) {
      return { ...action, heatMarkerCeramicId: target };
    }
  }
  return action;
}

function randomPlacement(ctx: EnumContext, type: GameActionType, rng: RandomSource): GameAction | null {
  const locationId = LOCATION_OF[type];
  const choice = locationId === undefined ? undefined : randomWorker(ctx, locationId, rng);
  if (locationId === undefined || choice === undefined) {
    return null;
  }
  const workerId = choice.workerId;
  switch (locationId) {
    case "materials_yard": {
      const total = LOCATIONS.materials_yard.effects[choice.effect].resources;
      const clay = rng.nextInt(total + 1);
      const prepared =
        !choice.seniorApprentice && techReady(ctx.me, PREPARED_CLAY) && coin(rng)
          ? { shape: pick(SHAPES, rng) ?? "bowl", decoration: pick(DECORATIONS, rng) ?? "plain" }
          : null;
      return {
        type: "PLACE_MATERIALS_YARD",
        workerId,
        clay,
        wood: total - clay,
        ...seniorFlag(choice),
        ...(prepared === null ? {} : { preparedClay: prepared }),
      };
    }
    case "form_decorate":
      return randomFormDecorate(ctx, choice, rng);
    case "glaze_load":
      return randomGlazeLoad(ctx, choice, rng);
    case "commission_market":
      return { type: "PLACE_COMMISSION_MARKET", workerId, ...seniorFlag(choice) };
    case "guild_hall": {
      if (choice.effect === "apprentice") {
        const techId = pick(guildOptions(ctx.view, "apprentice").faceUp.filter((o) => o.legal), rng)?.techId;
        return techId === undefined ? null : { type: "PLACE_GUILD_HALL", workerId, choice: { kind: "buy_face_up", techId } };
      }
      return { type: "PLACE_GUILD_HALL", workerId, choice: { kind: "inspect", discipline: pick(DISCIPLINES, rng) ?? "workshop" } };
    }
    case "canal_wharf":
      return { type: "PLACE_CANAL_WHARF", workerId };
    case "magistrates_hall":
      return { type: "PLACE_MAGISTRATES_HALL", workerId };
  }
}

function randomCompletion(ctx: EnumContext, rng: RandomSource): GameAction | null {
  const option = pick(completableOrders(ctx.view), rng);
  if (option === undefined) {
    return null;
  }
  const match = pick(orderMatchOptions(ctx.view, option.orderId, 12), rng) ?? option;
  const spec: OrderCompletionSpec = {
    orderId: match.orderId,
    ceramicIds: [...match.ceramicIds],
    // Declared mode half the time (L470): the declarations the search would record.
    ...(match.crackleDeclarations.length > 0 && coin(rng) ? { crackleDeclarations: match.crackleDeclarations.map((d) => ({ ...d })) } : {}),
    ...((match.triggers.ru || match.triggers.guan) && coin(rng) ? { declineKilnAbility: true } : {}),
    ...(match.triggers.tributeWare && coin(rng) ? { declineTributeWare: true } : {}),
  };
  return { type: "COMPLETE_ORDER", ...spec };
}

/** One random, well-formed candidate of `type` built from the selectors (DESIGN §5.3). */
function randomCandidate(ctx: EnumContext, type: GameActionType, rng: RandomSource): GameAction | null {
  const view = ctx.view;
  switch (type) {
    case "SELECT_KILN": {
      const kilnId = pick(KILN_IDS.filter((id) => validateAction(view, { type, kilnId: id }) === null), rng);
      return kilnId === undefined ? null : { type, kilnId };
    }
    case "PLACE_SETTERS_MARK":
      return { type, spaceId: coin(rng) ? null : (pick(settersMarkOptions(view), rng) ?? null) };
    case "PLACE_MATERIALS_YARD":
    case "PLACE_FORM_DECORATE":
    case "PLACE_GLAZE_LOAD":
    case "PLACE_COMMISSION_MARKET":
    case "PLACE_GUILD_HALL":
    case "PLACE_CANAL_WHARF":
    case "PLACE_MAGISTRATES_HALL":
      return randomPlacement(ctx, type, rng);
    case "COMPLETE_ORDER":
      return randomCompletion(ctx, rng);
    case "USE_COLOUR_SAMPLES_SWAP": {
      const discard = pick(colourSamplesSwapOptions(view).discards.filter((d) => d.legal), rng);
      return discard === undefined ? null : { type, discardOrderId: discard.orderId };
    }
    case "SECOND_FIRING_CHOOSE": {
      const options = secondFiringChoiceOptions(view);
      if (options === null) {
        return null;
      }
      const cardIndex = rng.nextInt(2) === 1 ? 1 : 0;
      const delta = options.jun.ready && coin(rng) ? pick(KILNS.JU.params.deltas, rng) : undefined;
      return { type, cardIndex, jun: delta === undefined ? null : { delta } };
    }
    case "USE_IMPERIAL_PRIORITY": {
      const vessel = lookup(ctx.game.ceramics, pick(imperialPriorityOptions(view).ceramicIds, rng) ?? "");
      if (vessel === undefined) {
        return null;
      }
      const rework = techReady(ctx.me, REWORKING_TABLE) && rng.nextInt(3) === 0 ? pick(SHAPES.filter((s) => s !== vessel.shape), rng) : undefined;
      return {
        type,
        ceramicId: vessel.id,
        glaze: pick(GLAZES, rng) ?? "white",
        imperialModifier: pick(FIRING.imperialModifiers, rng) ?? 0,
        ...(rework === undefined ? {} : { reworkShape: rework }),
      };
    }
    case "END_TURN":
    case "END_AFTER_QUALITY":
    case "END_ORDER_TURN":
      return { type };
    case "SELECT_CHOOSE": {
      // 1 pick, a face-up Order or a looked card, or (Commission Market Shifu effect) 2 distinct
      // picks half the time (v1.6.2 L64, L202).
      const options = lookedOrderOptions(view);
      const picks = shuffled(selectPicks(ctx), rng);
      if (options === null || picks.length === 0) {
        return null;
      }
      const count = options.maxReservations >= 2 && picks.length >= 2 && coin(rng) ? 2 : 1;
      return { type, reservations: picks.slice(0, count) };
    }
    case "GUILD_TAKE": {
      const options = guildInspectionOptions(view);
      if (options === null) {
        return null;
      }
      const takes = [
        ...options.inspected.filter((o) => o.legal).map((o) => ({ kind: "inspected" as const, techId: o.techId })),
        ...options.faceUp.filter((o) => o.legal).map((o) => ({ kind: "face_up" as const, techId: o.techId })),
      ];
      const take = pick(takes, rng);
      return take === undefined ? null : { type, take };
    }
    case "GUILD_FINISH": {
      const options = guildInspectionOptions(view);
      return options === null || !options.canFinish ? null : { type, bottomOrder: shuffled(options.inspected.map((o) => o.techId), rng) };
    }
    case "TEST_PIECES_DECIDE":
      return { type, peek: coin(rng) };
    case "TEST_PIECES_BURY":
      return { type, bury: coin(rng) };
    case "RESOLVE_HEAT_MARKERS": {
      const options = heatMarkerStepOptions(view);
      if (options === null) {
        return null;
      }
      const own = options.ownMarkerCeramicId === null ? null : (pick([1, -1, "return"] as const, rng) ?? "return");
      const base: ActionOf<"RESOLVE_HEAT_MARKERS"> = { type, ...(own === null ? {} : { ownMarker: own }) };
      const kilnMaster = options.kilnMaster;
      if (kilnMaster !== null && kilnMaster.ready && coin(rng)) {
        const ceramicId = pick(own === "return" ? kilnMaster.targetsIfOwnReturned : kilnMaster.targets, rng);
        if (ceramicId !== undefined) {
          return { ...base, kilnMaster: { ceramicId, value: pick(KILN_MASTER_VALUES, rng) ?? 1 } };
        }
      }
      return base;
    }
    case "RESOLVE_JUN": {
      const ceramicId = coin(rng) ? pick(junOptions(view)?.ceramicIds ?? [], rng) : undefined;
      return { type, adjustment: ceramicId === undefined ? null : { ceramicId, delta: pick(KILNS.JU.params.deltas, rng) ?? 1 } };
    }
    case "USE_PROTECTIVE_SAGGARS":
    case "USE_SECOND_FIRING":
    case "USE_GE_CRACKLE": {
      const ability = type === "USE_PROTECTIVE_SAGGARS" ? "protective_saggars" : type === "USE_SECOND_FIRING" ? "second_firing" : "ge_crackle";
      const ceramicId = pick(afterQualityOptions(view).find((o) => o.ability === ability)?.ceramicIds ?? [], rng);
      return ceramicId === undefined ? null : { type, ceramicId };
    }
    case "SALVAGE_FLAWED": {
      const ceramicId = coin(rng) ? pick(salvageOptions(view)?.ceramicIds ?? [], rng) : undefined;
      return { type, ceramicId: ceramicId ?? null };
    }
    case "DISCARD_TO_HAND_LIMIT": {
      const hand = view.own.orderHand;
      const excess = Math.max(0, hand.length - handLimit(ctx.me));
      return { type, orderIds: shuffled(hand, rng).slice(0, excess) };
    }
  }
}

/**
 * A random legal action for the viewer (DESIGN §5.3): a family from `legalActionFamilies`
 * (uniform, Canal Wharf down-weighted), its parameters built step by step from the selectors
 * with each optional ability decided by a coin flip, then validated; up to 20 attempts, then
 * the first canonical action, which the progress guarantee (§3.6) makes legal. `chooser` is
 * separate from the game RNG, so sampling never perturbs engine draws. Throws an
 * `InvariantError` when the viewer has no action (not their decision, or only
 * Contributions — use `legalCommands`).
 */
export function sampleLegalAction(view: PlayerView, chooser: RandomSource, options: SampleOptions = {}): GameAction {
  const ctx = contextFor(view, "canonical");
  const families = ctx === null ? [] : legalActionFamilies(view);
  if (ctx === null || families.length === 0) {
    throw new InvariantError(`sampleLegalAction: ${String(view.viewerId)} has no legal action in ${view.game.phase.type}`);
  }
  for (let attempt = 0; attempt < SAMPLE_ATTEMPTS; attempt += 1) {
    const candidate = randomCandidate(ctx, pickFamily(families, chooser, options), chooser);
    if (candidate !== null && validateAction(ctx.view, candidate) === null) {
      return candidate;
    }
  }
  const fallback = legalActions(view, { mode: "canonical", limit: 1 })[0];
  if (fallback === undefined) {
    throw new InvariantError(`sampleLegalAction: no canonical action in ${view.game.phase.type}`);
  }
  return fallback;
}
