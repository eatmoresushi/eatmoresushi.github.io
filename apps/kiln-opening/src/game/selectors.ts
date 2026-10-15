/**
 * UI view models, quotes and step-wise option lists (DESIGN §5.4). React reads only these,
 * plus `validateAction`, `decisionPrompt` and events; it never compares rule constants, sums
 * score fields or scans workers itself.
 *
 * - **One rule implementation.** Every `legal` flag and option list is derived from the
 *   action validators: either by validating a probe command through `validateAction` (the
 *   single legality function, DESIGN §2.5) or by calling the helper the validator itself
 *   calls (`acquisitionError`, `techPrice`, `market.reservable`, `findOrderMatches`, …).
 *   `selector_agreement.test.ts` checks every flag and option against the validators.
 * - **Re-exports, never reimplementations,** of the option functions owned by P3
 *   (`loadDestinationOptions`, the quotes), P5 (`heatPreviews`, the firing-window options,
 *   `legalContributions`) and P6 (`findOrderMatches`) (DESIGN §2.4).
 * - **Public information only,** except where a selector reads the viewer's own
 *   `PrivatePlayerView` (hand, pending look, peek, sealed Contribution). Nothing here needs or
 *   reads `GameState.hidden`.
 * - **Iteration order** follows the canonical ID lists (`LOCATION_IDS`, `KILN_SPACE_IDS`,
 *   `DISCIPLINES`, …), players in turn order and ceramics by sequence (DESIGN §2.3).
 *
 * Layer 5. It also imports `validateAction` from `engine.ts` (layer 6): §2.5 makes that the
 * single legality function every consumer calls, and the import is acyclic (`engine.ts`
 * imports neither this module nor `legalActions.ts`).
 */

import {
  CENTRAL_LOCATION_IDS,
  DECORATIONS,
  DISCIPLINES,
  KILNS,
  KILN_IDS,
  KILN_SPACE_IDS,
  LOCATIONS,
  LOCATION_IDS,
  ORDERS,
  PERSONAL_LOCATION_IDS,
  SHAPES,
  TECHS,
  zoneModifier,
  zoneOf,
} from "./content.ts";
import { validateAction } from "./engine.ts";
import { ruleError } from "./errors.ts";
import { legalContributions } from "./firing/contributions.ts";
import { contributionHeat, contributionWood } from "./firing/heat.ts";
import { availableKilns, kilnAbilityReady } from "./kilns.ts";
import { loadDestinationOptions } from "./kilnLoading.ts";
import { reservable } from "./market.ts";
import { completionTriggers, validateOrderCompletion } from "./orders/completion.ts";
import { findOrderMatches, matchOrder, type OrderMatch } from "./orders/matching.ts";
import { availableWorkers, centralCapacity, nextPersonalSpace, workersAt } from "./placement.ts";
import { magistratesHallOpen } from "./recognition.ts";
import { settersMarkSpaces } from "./round.ts";
import { scorePreview as scorePreviewOf } from "./scoring.ts";
import { ceramicsOf, decisionPrompt, heatMarkerOf, imperialKilnCeramic, lookup, player, turnOrder, workStep } from "./state.ts";
import { acquisitionError, handLimit, ownsTech, techPrice, techReady } from "./techs.ts";
import { imperialPriorityUsable } from "./work/turn.ts";
import type {
  ActorView,
  BoardView,
  CeramicId,
  CommissionOptions,
  ContributionOption,
  CostQuote,
  CrackleDeclaration,
  FiringContext,
  FinishedCeramic,
  FormVesselSpec,
  GameAction,
  GameRuleError,
  GameRuleErrorCode,
  GuildInspectionOptions,
  GuildOptions,
  GuildTechOption,
  KilnSelectionOption,
  KilnSpaceId,
  KilnSpaceView,
  LoadSpec,
  LoadedCeramic,
  LocationId,
  LocationOccupant,
  LookedOrderOptions,
  OrderDefinition,
  OrderId,
  OrderMatchOption,
  OrderSelectionCheck,
  PersonalSpaceView,
  PlacementOption,
  PlacementWorkerOption,
  PlayerId,
  PlayerState,
  PlayerSummary,
  PlayerView,
  PublicGameState,
  Recognition,
  ScorePreview,
  ShapedCeramic,
  SubmitContributionCommand,
  TechId,
  WorkerEffect,
  WorkerId,
  WorkerKind,
  WorkerState,
} from "./types.ts";

export { decisionPrompt } from "./state.ts";
export { heatPreviews } from "./firing/heat.ts";
export { quoteMaterialsYard } from "./work/materialsYard.ts";
export { quoteFormDecorate } from "./work/formDecorate.ts";
export { loadDestinationOptions } from "./kilnLoading.ts";
export { heatMarkerStepOptions, junOptions, testPiecesOptions } from "./firing/pipeline.ts";
export { afterQualityOptions, salvageOptions } from "./firing/afterQuality.ts";
export { legalContributions } from "./firing/contributions.ts";
export { findOrderMatches } from "./orders/matching.ts";

type FormDecorateAction = Extract<GameAction, { type: "PLACE_FORM_DECORATE" }>;

const SENIOR_APPRENTICE: TechId = "T18";
const LARGE_THROWING_WHEEL: TechId = "T01";
const DECORATORS_KIT: TechId = "T16";
const CANAL_BARGE: TechId = "T23";
const FUEL_LEDGER: TechId = "T12";

/**
 * Rule-error codes that depend only on the phase, the actor, the worker, the location and the
 * worker effect — never on the rest of a placement command. Every placement validator checks
 * them before anything command-specific (`validatePlacement`, then the location's "at least 1
 * instance of the main action" test, L141; the Magistrate's Hall Recognition gate). When one
 * placement command fails with one of these, every command for that worker and location
 * fails the same way, so enumerators and probes may stop there.
 */
export const PLACEMENT_GATE_CODES: ReadonlySet<GameRuleErrorCode> = new Set<GameRuleErrorCode>([
  "GAME_FINISHED",
  "UNKNOWN_PLAYER",
  "WRONG_PHASE",
  "NOT_YOUR_DECISION",
  "WORKER_ACTION_ALREADY_TAKEN",
  "WORKER_UNAVAILABLE",
  "LOCATION_FULL",
  "PERSONAL_SPACE_LOCKED",
  "PERSONAL_SPACE_USED",
  "NO_MAIN_ACTION_POSSIBLE",
  "SENIOR_APPRENTICE_NOT_APPLICABLE",
  "RECOGNITION_GATE",
]);

// ── View helpers ─────────────────────────────────────────────────────────────────────

/** The view as an `ActorView`, or null for a spectator (or an unseated viewer). */
export function asActorView(view: PlayerView): ActorView | null {
  const viewerId = view.viewerId;
  if (viewerId === null || view.own === null || lookup(view.game.players, viewerId) === undefined) {
    return null;
  }
  return { viewerId, game: view.game, own: view.own };
}

/** The viewer may act now: seated and in `decisionPrompt(game).actorIds`. */
export function viewerActs(view: PlayerView): view is ActorView {
  const actor = asActorView(view);
  return actor !== null && view.game.phase.type !== "finished" && decisionPrompt(view.game).actorIds.includes(actor.viewerId);
}

function validates(view: ActorView, action: GameAction): boolean {
  return validateAction(view, action) === null;
}

function seatedPlayer(game: PublicGameState, playerId: PlayerId): PlayerState | null {
  return lookup(game.players, playerId) ?? null;
}

// ── Who acts, the board and the players (public) ────────────────────────────────────

function occupantOf(playerId: PlayerId, worker: WorkerState): LocationOccupant | null {
  const placement = worker.placement;
  if (placement === null) {
    return null;
  }
  return {
    playerId,
    workerId: worker.id,
    kind: worker.kind,
    effect: placement.effect,
    viaSeniorApprentice: placement.viaSeniorApprentice,
    spaceIndex: placement.spaceIndex,
    sequence: placement.sequence,
  };
}

/** The whole public board in canonical order (DESIGN §5.4). */
export function boardView(view: PlayerView): BoardView {
  const game = view.game;
  const kilnSpaces: KilnSpaceView[] = KILN_SPACE_IDS.map((spaceId) => {
    const space = game.sharedKiln.spaces[spaceId];
    const ceramics = space.ceramicIds
      .map((id) => lookup(game.ceramics, id))
      .filter((c): c is LoadedCeramic => c !== undefined && c.stage === "loaded");
    return {
      spaceId,
      zone: zoneOf(spaceId),
      zoneModifier: zoneModifier(spaceId),
      active: space.active,
      ceramics: structuredClone(ceramics),
      setterMarkOwnerId: space.setterMarkOwnerId,
      kilnFurniture: space.kilnFurniture === null ? null : { ...space.kilnFurniture },
      effectiveModifier: space.kilnFurniture?.modifier ?? zoneModifier(spaceId),
    };
  });
  return {
    round: game.round,
    prompt: decisionPrompt(game),
    firstPlayerId: game.firstPlayerId,
    turnOrder: turnOrder(game),
    kilnDie: game.kilnDie === null ? null : { ...game.kilnDie },
    centralLocations: CENTRAL_LOCATION_IDS.map((locationId) => ({
      locationId,
      capacity: centralCapacity(game, locationId),
      occupants: workersAt(game, locationId)
        .map(({ playerId, worker }) => occupantOf(playerId, worker))
        .filter((o): o is LocationOccupant => o !== null),
      usableAtRecognition: LOCATIONS[locationId].usableAtRecognition === null ? null : [...(LOCATIONS[locationId].usableAtRecognition ?? [])],
    })),
    kilnSpaces,
    mainDisplay: [...game.market.display],
    techDisplay: DISCIPLINES.map((discipline) => ({
      discipline,
      techIds: [...game.techDisplay[discipline]],
      deckCount: game.counts.techDecks[discipline],
    })),
    counts: structuredClone(game.counts),
    fireDiscard: [...game.fireDiscard],
    firing: firingSummary(view),
  };
}

/** One player's public summary (DESIGN §5.4). Throws for an unseated player ID. */
export function playerSummary(view: PlayerView, playerId: PlayerId): PlayerSummary {
  const game = view.game;
  const p = player(game, playerId);
  const recorded = { ...p.score };
  const personalSpaces: PersonalSpaceView[] = [];
  for (const locationId of PERSONAL_LOCATION_IDS) {
    for (const spaceIndex of [0, 1] as const) {
      const occupant = Object.values(p.workers)
        .filter((w) => w.placement?.locationId === locationId && w.placement.spaceIndex === spaceIndex)
        .map((w) => occupantOf(playerId, w))[0];
      personalSpaces.push({
        locationId,
        spaceIndex,
        unlocked: p.personalSpaces[locationId][spaceIndex].unlocked,
        occupant: occupant ?? null,
      });
    }
  }
  const kilnCeramic = imperialKilnCeramic(game, playerId);
  return {
    playerId,
    displayName: p.displayName,
    seatIndex: p.seatIndex,
    isFirstPlayer: game.firstPlayerId === playerId,
    kilnId: p.kilnId,
    kilnAbilityReady: p.kilnId !== null && kilnAbilityReady(p, p.kilnId),
    resources: { ...p.resources },
    recordedVp: recorded.orders + recorded.kilnAbilities + recorded.recognitionOverflow + recorded.imperialAudience + recorded.techs,
    recorded,
    techs: p.techs.map((tech) => ({
      techId: tech.id,
      discipline: TECHS[tech.id].discipline,
      oncePerRound: TECHS[tech.id].oncePerRound,
      ready: techReady(p, tech.id),
    })),
    availableWorkerIds: availableWorkers(game, playerId).map((w) => w.id),
    personalSpaces,
    recognition: p.imperial.recognition,
    imperial: {
      kilnGained: p.imperial.kilnGained,
      kilnCeramic: kilnCeramic === null ? null : structuredClone(kilnCeramic),
      priority: p.imperial.priority,
      priorityUsableNow: imperialPriorityWindowUsable(game, playerId),
    },
    heatMarkerCeramicId: heatMarkerOf(game, playerId, "own")?.id ?? null,
    kilnMasterCeramicId: heatMarkerOf(game, playerId, "kiln_master")?.id ?? null,
    orderHandCount: lookup(game.counts.orderHands, playerId) ?? 0,
    handLimit: handLimit(p),
    shapedCeramicIds: ceramicsOf(game, playerId, "shaped").map((c) => c.id),
    loadedCeramicIds: ceramicsOf(game, playerId, "loaded").map((c) => c.id),
    finishedCeramicIds: ceramicsOf(game, playerId, "finished").map((c) => c.id),
    completedOrders: structuredClone(p.completedOrders),
  };
}

/** What the player would score if the game ended now (public information only). */
export function scorePreview(view: PlayerView, playerId: PlayerId): ScorePreview {
  return scorePreviewOf(view.game, playerId);
}

/** Held Orders against the Cleanup hand limit (4, or 5 with Colour Samples; L199, L303). */
export function handLimitStatus(view: PlayerView, playerId: PlayerId): { held: number; limit: number; mustDiscard: number } {
  const held = lookup(view.game.counts.orderHands, playerId) ?? 0;
  const limit = handLimit(player(view.game, playerId));
  return { held, limit, mustDiscard: Math.max(0, held - limit) };
}

/** The current firing, else the most recent one (for the recap). */
export function firingSummary(view: PlayerView): FiringContext | null {
  const firing = view.game.firing ?? view.game.lastFiring;
  return firing === null ? null : structuredClone(firing);
}

// ── Setup and Start of Round ─────────────────────────────────────────────────────────

/** All five Kilns (R1), each with whether it is still available and who chose it. */
export function kilnSelectionOptions(view: PlayerView): KilnSelectionOption[] {
  const game = view.game;
  const available = availableKilns(game);
  return KILN_IDS.map((kilnId) => ({
    kilnId,
    available: available.includes(kilnId),
    chosenBy: game.playerOrder.find((pid) => lookup(game.players, pid)?.kilnId === kilnId) ?? null,
  }));
}

/** Spaces where the viewer may place their Setter's Mark now (T22, L630); `[]` when it is
 * not their decision. Declining (`spaceId: null`) is always possible in the window. */
export function settersMarkOptions(view: PlayerView): KilnSpaceId[] {
  if (!viewerActs(view) || view.game.phase.type !== "round_start_setters_mark") {
    return [];
  }
  return settersMarkSpaces(view.game).filter((spaceId) => validates(view, { type: "PLACE_SETTERS_MARK", spaceId }));
}

// ── Work Phase ───────────────────────────────────────────────────────────────────────

interface WorkerOption {
  workerId: WorkerId;
  kind: WorkerKind;
  effect: WorkerEffect;
  seniorApprentice: boolean;
}

/**
 * The worker choices a placement can name (DESIGN §5.2 worker identity): the Shifu, the
 * lowest-ID available Apprentice and, where Senior Apprentice applies (T18 ready, a listed
 * location), that Apprentice resolving the Shifu effect.
 */
export function placementWorkerChoices(view: PlayerView, playerId: PlayerId, locationId: LocationId): WorkerOption[] {
  const p = seatedPlayer(view.game, playerId);
  if (p === null) {
    return [];
  }
  const available = availableWorkers(view.game, playerId);
  const shifu = available.find((w) => w.kind === "shifu");
  const apprentice = available.find((w) => w.kind === "apprentice");
  const options: WorkerOption[] = [];
  if (shifu !== undefined) {
    options.push({ workerId: shifu.id, kind: "shifu", effect: "shifu", seniorApprentice: false });
  }
  if (apprentice !== undefined) {
    options.push({ workerId: apprentice.id, kind: "apprentice", effect: "apprentice", seniorApprentice: false });
    const seniorLocations: readonly LocationId[] = TECHS.T18.params.locations;
    if (seniorLocations.includes(locationId) && techReady(p, SENIOR_APPRENTICE)) {
      options.push({ workerId: apprentice.id, kind: "apprentice", effect: "shifu", seniorApprentice: true });
    }
  }
  return options;
}

function seniorFlag(option: WorkerOption): { seniorApprentice?: true } {
  return option.seniorApprentice ? { seniorApprentice: true } : {};
}

/** A minimal command for the location; its validation reveals the gate (DESIGN §5.2). */
function gateProbe(view: ActorView, locationId: LocationId, option: WorkerOption): GameAction {
  const workerId = option.workerId;
  switch (locationId) {
    case "materials_yard":
      return { type: "PLACE_MATERIALS_YARD", workerId, clay: LOCATIONS.materials_yard.effects[option.effect].resources, wood: 0, ...seniorFlag(option) };
    case "form_decorate":
      return { type: "PLACE_FORM_DECORATE", workerId, vessels: [{ shape: "bowl", decoration: "plain" }] };
    case "glaze_load": {
      const first = ceramicsOf(view.game, view.viewerId, "shaped")[0];
      return {
        type: "PLACE_GLAZE_LOAD",
        workerId,
        loads: [{ ceramicId: first?.id ?? "c0", glaze: "white", destination: { kiln: "imperial", imperialModifier: 0 } }],
      };
    }
    case "commission_market":
      return { type: "PLACE_COMMISSION_MARKET", workerId, first: { kind: "blind" }, ...seniorFlag(option) };
    case "guild_hall":
      return option.effect === "shifu"
        ? { type: "PLACE_GUILD_HALL", workerId, choice: { kind: "inspect", discipline: "workshop" } }
        : { type: "PLACE_GUILD_HALL", workerId, choice: { kind: "buy_face_up", techId: DISCIPLINES.flatMap((d) => view.game.techDisplay[d])[0] ?? "T01" } };
    case "canal_wharf":
      return { type: "PLACE_CANAL_WHARF", workerId };
    case "magistrates_hall":
      return { type: "PLACE_MAGISTRATES_HALL", workerId };
  }
}

/** Form & Decorate discount variants of a vessel list (Large Throwing Wheel, Decorator's Kit). */
export function formDiscountVariants(
  view: PlayerView,
  playerId: PlayerId,
  vessels: readonly FormVesselSpec[],
): Array<Pick<FormDecorateAction, "useLargeThrowingWheel" | "decoratorsKitVesselIndex">> {
  const p = seatedPlayer(view.game, playerId);
  const variants: Array<Pick<FormDecorateAction, "useLargeThrowingWheel" | "decoratorsKitVesselIndex">> = [{}];
  if (p === null) {
    return variants;
  }
  const wheelShapes: readonly string[] = TECHS.T01.params.triggerShapes;
  const kitDecorations: readonly string[] = TECHS.T16.params.decorations;
  const wheel = techReady(p, LARGE_THROWING_WHEEL) && vessels.some((v) => wheelShapes.includes(v.shape));
  const kitIndex = techReady(p, DECORATORS_KIT) ? vessels.findIndex((v) => kitDecorations.includes(v.decoration)) : -1;
  if (wheel) {
    variants.push({ useLargeThrowingWheel: true });
  }
  if (kitIndex >= 0) {
    variants.push({ decoratorsKitVesselIndex: kitIndex });
    if (wheel) {
      // Unreachable under L210 (both Workshop Techs), kept for completeness.
      variants.push({ useLargeThrowingWheel: true, decoratorsKitVesselIndex: kitIndex });
    }
  }
  return variants;
}

/** Commands that between them prove a location legal for a worker choice (L141). */
function* placementProbes(view: ActorView, locationId: LocationId, option: WorkerOption): Generator<GameAction> {
  const workerId = option.workerId;
  const game = view.game;
  switch (locationId) {
    case "form_decorate":
      for (const shape of SHAPES) {
        for (const decoration of DECORATIONS) {
          const vessels = [{ shape, decoration }];
          for (const variant of formDiscountVariants(view, view.viewerId, vessels)) {
            yield { type: "PLACE_FORM_DECORATE", workerId, vessels, ...variant };
          }
        }
      }
      return;
    case "glaze_load":
      for (const vessel of ceramicsOf(game, view.viewerId, "shaped")) {
        const destination = loadDestinationOptions(view, view.viewerId, vessel.id, [])[0]?.destination;
        if (destination !== undefined) {
          yield { type: "PLACE_GLAZE_LOAD", workerId, loads: [{ ceramicId: vessel.id, glaze: "white", destination }] };
        }
      }
      return;
    case "commission_market": {
      const supply = reservable(game);
      for (const slotIndex of supply.faceUpSlots) {
        const orderId = game.market.display[slotIndex];
        if (orderId !== null && orderId !== undefined) {
          yield { type: "PLACE_COMMISSION_MARKET", workerId, first: { kind: "face_up", slotIndex, orderId, gain: "clay" }, ...seniorFlag(option) };
        }
      }
      if (option.effect === "shifu") {
        yield { type: "PLACE_COMMISSION_MARKET", workerId, first: { kind: "look_top_three" }, ...seniorFlag(option) };
      }
      return;
    }
    case "guild_hall":
      if (option.effect === "apprentice") {
        for (const techId of DISCIPLINES.flatMap((d) => game.techDisplay[d])) {
          yield { type: "PLACE_GUILD_HALL", workerId, choice: { kind: "buy_face_up", techId } };
        }
      } else {
        for (const discipline of DISCIPLINES) {
          yield { type: "PLACE_GUILD_HALL", workerId, choice: { kind: "inspect", discipline } };
        }
      }
      return;
    default:
      return;
  }
}

function placementWorkerOption(view: PlayerView, locationId: LocationId, option: WorkerOption): PlacementWorkerOption {
  const base = { workerId: option.workerId, kind: option.kind, effect: option.effect, seniorApprentice: option.seniorApprentice };
  const actor = asActorView(view);
  if (actor === null) {
    return { ...base, legal: false, reason: "UNKNOWN_PLAYER" };
  }
  const gate = validateAction(actor, gateProbe(actor, locationId, option));
  if (gate === null) {
    return { ...base, legal: true, reason: null };
  }
  if (PLACEMENT_GATE_CODES.has(gate.code)) {
    return { ...base, legal: false, reason: gate.code };
  }
  for (const probe of placementProbes(actor, locationId, option)) {
    if (validates(actor, probe)) {
      return { ...base, legal: true, reason: null };
    }
  }
  return { ...base, legal: false, reason: gate.code };
}

/**
 * Every location with the viewer's worker choices (Shifu, lowest Apprentice, Apprentice via
 * Senior Apprentice) and whether each may be placed now (L139–143, L141). `legal` means some
 * command placing that worker there passes `validateAction`.
 */
export function placementOptions(view: PlayerView): PlacementOption[] {
  const game = view.game;
  const viewerId = view.viewerId;
  const seated = viewerId !== null && seatedPlayer(game, viewerId) !== null;
  return LOCATION_IDS.map((locationId): PlacementOption => {
    const personal = LOCATIONS[locationId].scope === "personal";
    const choices = seated ? placementWorkerChoices(view, viewerId, locationId) : [];
    const workers = choices.map((option) => placementWorkerOption(view, locationId, option));
    const legal = workers.some((w) => w.legal);
    let occupancy: number;
    let capacity: number | null;
    let nextSpaceIndex: number | null = null;
    if (personal) {
      const pid = seated ? viewerId : null;
      const p = pid === null ? null : player(game, pid);
      const location = locationId as "form_decorate" | "glaze_load";
      occupancy = p === null ? 0 : Object.values(p.workers).filter((w) => w.placement?.locationId === locationId).length;
      capacity = p === null ? null : p.personalSpaces[location].filter((space) => space.unlocked).length;
      nextSpaceIndex = pid === null ? null : nextPersonalSpace(game, pid, location);
    } else {
      const central = locationId as (typeof CENTRAL_LOCATION_IDS)[number];
      occupancy = workersAt(game, central).length;
      capacity = centralCapacity(game, central);
    }
    const reason: GameRuleErrorCode | null = legal
      ? null
      : (workers[0]?.reason ?? (seated ? "WORKER_UNAVAILABLE" : "UNKNOWN_PLAYER"));
    return {
      locationId,
      legal,
      reason,
      workerIds: [...new Set(workers.filter((w) => w.legal).map((w) => w.workerId))],
      workers,
      seniorApprentice: choices.some((c) => c.seniorApprentice),
      occupancy,
      capacity,
      nextSpaceIndex,
    };
  });
}

/**
 * Indexes of `draft.vessels` that Ding may copy (L473, R1): a Bowl, Plate or Brush Washer of
 * this action, with Ding owned and ready. Affordability is the quote's business
 * (`quoteFormDecorate`), so an index stays listed when only the resources fall short.
 */
export function dingCopyableVesselIndexes(view: PlayerView, draft: FormDecorateAction): number[] {
  const actor = asActorView(view);
  if (actor === null) {
    return [];
  }
  const p = player(view.game, actor.viewerId);
  if (!kilnAbilityReady(p, "DI")) {
    return [];
  }
  const indexes: number[] = [];
  draft.vessels.forEach((vessel, index) => {
    // The same test the quote applies, after the vessel checks.
    if (!KILNS.DI.params.shapes.includes(vessel.shape)) {
      return;
    }
    const probe: FormDecorateAction = { type: "PLACE_FORM_DECORATE", workerId: draft.workerId, vessels: draft.vessels, dingExtra: { copyOfVesselIndex: index, decoration: "plain" } };
    const error = validateAction(actor, probe);
    if (error === null || !isDingError(error)) {
      indexes.push(index);
    }
  });
  return indexes;
}

function isDingError(error: GameRuleError): boolean {
  const field = error.details["field"];
  return error.code === "KILN_ABILITY_NOT_OWNED" || error.code === "ABILITY_ALREADY_USED" || (typeof field === "string" && field.startsWith("dingExtra"));
}

/** The player's Shaped vessels in sequence order (L356). */
export function shapedVessels(view: PlayerView, playerId: PlayerId): ShapedCeramic[] {
  return ceramicsOf(view.game, playerId, "shaped").map((c) => structuredClone(c));
}

/**
 * Ceramics the Glaze & Load Shifu may put the face-down Heat marker on with these loads (R9,
 * L179, L184): your loaded ceramics without a marker (Shared or Imperial, incl. earlier this
 * round or by Imperial Priority), then the vessels these loads would load; `[]` when your
 * marker is already on a ceramic (L75).
 */
export function heatMarkerTargets(view: PlayerView, playerId: PlayerId, pendingLoads: readonly LoadSpec[]): CeramicId[] {
  const game = view.game;
  if (seatedPlayer(game, playerId) === null || heatMarkerOf(game, playerId, "own") !== null) {
    return [];
  }
  const targets = ceramicsOf(game, playerId, "loaded")
    .filter((c) => c.heatMarker === null)
    .map((c) => c.id);
  for (const load of pendingLoads) {
    const c = lookup(game.ceramics, load.ceramicId);
    if (c !== undefined && c.ownerId === playerId && c.stage === "shaped" && !targets.includes(c.id)) {
      targets.push(c.id);
    }
  }
  return targets;
}

/**
 * Commission Market choices (L186–200, B1): at placement for a worker effect, or — during the
 * viewer's own sub-step — what that step allows now (the step's effect wins).
 */
export function commissionOptions(view: PlayerView, effect: WorkerEffect): CommissionOptions {
  const game = view.game;
  const supply = reservable(game);
  const phase = game.phase;
  const step = phase.type === "work_turn" && phase.activePlayerId === view.viewerId ? workStep(game, "commission_market") : null;
  if (step !== null) {
    const canReserve = step.awaiting === "reservation" && step.reservationsMade < step.maxReservations;
    return {
      effect: step.effect,
      faceUpSlots: canReserve ? [...supply.faceUpSlots] : [],
      blind: canReserve && supply.blind,
      lookTopThree: canReserve && step.topThreeAvailable && supply.look,
      gainNow: step.awaiting === "resource",
      canStop: step.awaiting === "reservation" && step.reservationsMade >= 1,
      maxReservations: step.maxReservations,
      reservationsMade: step.reservationsMade,
    };
  }
  const maxReservations = LOCATIONS.commission_market.effects[effect].maxReservations === 2 ? 2 : 1;
  return {
    effect,
    faceUpSlots: [...supply.faceUpSlots],
    blind: supply.blind,
    lookTopThree: effect === "shifu" && supply.look,
    gainNow: false,
    canStop: false,
    maxReservations,
    reservationsMade: 0,
  };
}

/** The viewer's own pending top-3 look (Commission Shifu or Colour Samples), if any. */
export function lookedOrderOptions(view: PlayerView): LookedOrderOptions | null {
  const look = view.own?.pendingLook ?? null;
  if (look === null || look.kind === "guild_inspection") {
    return null;
  }
  return { kind: look.kind, orderIds: [...look.orderIds] };
}

function techOption(p: PlayerState | null, techId: TechId, source: "face_up" | "inspected", effect: WorkerEffect): GuildTechOption {
  const price = techPrice(techId, effect);
  // The Guild Hall validator's own checks: the 3 / 1-per-discipline limit, then the price.
  const limit = p === null ? ruleError("UNKNOWN_PLAYER", "Not seated.", {}) : acquisitionError(p, techId);
  const reason: GameRuleErrorCode | null =
    limit !== null ? limit.code : p !== null && price > p.resources.coins ? "INSUFFICIENT_RESOURCES" : null;
  return { techId, discipline: TECHS[techId].discipline, source, printedCost: TECHS[techId].cost, price, legal: reason === null, reason };
}

/** Guild Hall choices for a worker effect (L202–213): Techs to buy (Apprentice) or take after
 * inspecting (Shifu), with prices; the Shifu may inspect any discipline (B2). */
export function guildOptions(view: PlayerView, effect: WorkerEffect): GuildOptions {
  const game = view.game;
  const p = view.viewerId === null ? null : seatedPlayer(game, view.viewerId);
  return {
    effect,
    faceUp: DISCIPLINES.flatMap((d) => game.techDisplay[d]).map((techId) => techOption(p, techId, "face_up", effect)),
    inspect: effect === "shifu" ? DISCIPLINES.map((discipline) => ({ discipline, deckCount: game.counts.techDecks[discipline] })) : [],
  };
}

/** The viewer's Guild Hall Shifu inspection (B2), while `GUILD_TAKE` is due; else null. */
export function guildInspectionOptions(view: PlayerView): GuildInspectionOptions | null {
  const look = view.own?.pendingLook ?? null;
  const step = workStep(view.game, "guild_inspection");
  if (look === null || look.kind !== "guild_inspection" || step === null || view.viewerId === null) {
    return null;
  }
  const p = seatedPlayer(view.game, view.viewerId);
  return {
    discipline: look.discipline,
    inspected: look.techIds.map((techId) => techOption(p, techId, "inspected", "shifu")),
    faceUp: guildOptions(view, "shifu").faceUp,
    bottomOrderLengthIfInspectedTaken: Math.max(0, look.techIds.length - 1),
    bottomOrderLengthIfFaceUpTaken: look.techIds.length,
  };
}

/** The Magistrate's Hall for a worker effect (L222–232): 4 / 3 Coins, +1 Recognition, only
 * from Recognition 0–2 and never to 4; `reachable` is the Recognition it would reach. */
export function magistratesHallQuote(view: PlayerView, effect: WorkerEffect): CostQuote & { reachable: Recognition | null } {
  const effects = LOCATIONS.magistrates_hall.effects[effect];
  const pay = { clay: 0, wood: 0, coins: effects.coins };
  const lines = [{ kind: "magistrates_hall" as const, resource: "coins" as const, amount: effects.coins, itemIndex: null }];
  const zero = { clay: 0, wood: 0, coins: 0 };
  const p = view.viewerId === null ? null : seatedPlayer(view.game, view.viewerId);
  if (p === null) {
    return { ok: false, error: ruleError("UNKNOWN_PLAYER", "You are not seated in this game.", { playerId: String(view.viewerId) }), pay, gain: zero, lines, reachable: null };
  }
  const from = p.imperial.recognition;
  const to = from + effects.recognitionSteps;
  if (!magistratesHallOpen(p) || to >= 4) {
    const error = ruleError("RECOGNITION_GATE", "The Magistrate's Hall is usable only at Recognition 0–2 and never advances you to 4.", { recognition: from });
    return { ok: false, error, pay, gain: zero, lines, reachable: null };
  }
  const reachable = to as Recognition;
  if (p.resources.coins < effects.coins) {
    const error = ruleError("INSUFFICIENT_RESOURCES", `Not enough coins: you need ${effects.coins} and have ${p.resources.coins}.`, {
      resource: "coins",
      needed: effects.coins,
      have: p.resources.coins,
    });
    return { ok: false, error, pay, gain: zero, lines, reachable };
  }
  return { ok: true, error: null, pay, gain: zero, lines, reachable };
}

/**
 * Held Orders Canal Barge could complete now (T23 ready; own view only, R6): empty outside the
 * viewer's own before- or after-action window of a Work turn, where the validator rejects it.
 */
export function canalBargeOptions(view: PlayerView): OrderMatchOption[] {
  const viewerId = view.viewerId;
  const p = viewerId === null ? null : seatedPlayer(view.game, viewerId);
  if (viewerId === null || p === null || !techReady(p, CANAL_BARGE) || !ownActionWindow(view.game, viewerId)) {
    return [];
  }
  return completableOrders(view);
}

/** The player's own before- or after-action window of a Work turn. */
function ownActionWindow(game: PublicGameState, playerId: PlayerId): boolean {
  const phase = game.phase;
  return (
    phase.type === "work_turn" &&
    phase.activePlayerId === playerId &&
    (phase.step.kind === "before_action" || phase.step.kind === "after_action")
  );
}

function imperialPriorityWindowUsable(game: PublicGameState, playerId: PlayerId): boolean {
  return seatedPlayer(game, playerId) !== null && ownActionWindow(game, playerId) && imperialPriorityUsable(game, playerId);
}


/** Imperial Priority now (L292, R10): usable in your before/after-action window with the token
 * held, an empty gained Imperial Kiln and a Shaped vessel, which may be any of them. */
export function imperialPriorityOptions(view: PlayerView): { usable: boolean; ceramicIds: CeramicId[] } {
  if (view.viewerId === null || !imperialPriorityWindowUsable(view.game, view.viewerId)) {
    return { usable: false, ceramicIds: [] };
  }
  return { usable: true, ceramicIds: ceramicsOf(view.game, view.viewerId, "shaped").map((c) => c.id) };
}

// ── Orders (Order Phase and Canal Barge pickers) ─────────────────────────────────────

function finishedPool(game: PublicGameState, playerId: PlayerId): FinishedCeramic[] {
  return ceramicsOf(game, playerId, "finished");
}

/** An `OrderMatchOption` for a matcher result (Ru/Guan/Tribute Ware triggers before any decline). */
export function orderMatchOption(game: PublicGameState, playerId: PlayerId, order: OrderDefinition, match: OrderMatch): OrderMatchOption {
  const p = player(game, playerId);
  const ceramics = match.ceramicIds
    .map((id) => lookup(game.ceramics, id))
    .filter((c): c is FinishedCeramic => c !== undefined && c.stage === "finished");
  return {
    orderId: order.id,
    ceramicIds: [...match.ceramicIds],
    crackleDeclarations: match.crackleDeclarations.map((d) => ({ ...d })),
    vp: order.vp,
    coins: order.coins,
    printedCrowns: order.crowns,
    triggers: completionTriggers(p, order, ceramics),
  };
}

/** One entry per completable held Order (its first match), in hand order. */
export function completableOrders(view: PlayerView): OrderMatchOption[] {
  const viewerId = view.viewerId;
  const own = view.own;
  if (viewerId === null || own === null || seatedPlayer(view.game, viewerId) === null) {
    return [];
  }
  const pool = finishedPool(view.game, viewerId);
  const options: OrderMatchOption[] = [];
  for (const orderId of own.orderHand) {
    const order = lookup(ORDERS, orderId);
    const match = order === undefined ? undefined : findOrderMatches(order, pool, 1)[0];
    if (order !== undefined && match !== undefined) {
      options.push(orderMatchOption(view.game, viewerId, order, match));
    }
  }
  return options;
}

/** Every distinct ceramic group that completes one held Order (search-mode declarations). */
export function orderMatchOptions(view: PlayerView, orderId: OrderId, limit?: number): OrderMatchOption[] {
  const viewerId = view.viewerId;
  const own = view.own;
  const order = lookup(ORDERS, orderId);
  if (viewerId === null || own === null || order === undefined || !own.orderHand.includes(orderId) || seatedPlayer(view.game, viewerId) === null) {
    return [];
  }
  return findOrderMatches(order, finishedPool(view.game, viewerId), limit).map((match) => orderMatchOption(view.game, viewerId, order, match));
}

/**
 * A live check of an Order picker's selection: the validator's verdict (the same matcher),
 * and whether adding more of your eligible Finished ceramics could still complete the Order.
 */
export function orderSelectionCheck(
  view: PlayerView,
  orderId: OrderId,
  ceramicIds: readonly CeramicId[],
  declarations?: readonly CrackleDeclaration[],
): OrderSelectionCheck {
  const actor = asActorView(view);
  if (actor === null) {
    return { ok: false, error: ruleError("UNKNOWN_PLAYER", "You are not seated in this game.", { playerId: String(view.viewerId) }), extendable: false };
  }
  const spec = {
    orderId,
    ceramicIds: [...ceramicIds],
    ...(declarations === undefined ? {} : { crackleDeclarations: declarations.map((d) => ({ ...d })) }),
  };
  const error = validateOrderCompletion(actor, spec);
  const order = lookup(ORDERS, orderId);
  if (error === null && order !== undefined) {
    const selected = ceramicIds
      .map((id) => lookup(view.game.ceramics, id))
      .filter((c): c is FinishedCeramic => c !== undefined && c.stage === "finished");
    const match = matchOrder(order, selected, declarations);
    if (match !== null) {
      return { ok: true, match: orderMatchOption(view.game, actor.viewerId, order, match) };
    }
  }
  const failure = error ?? ruleError("ORDER_REQUIREMENTS_NOT_MET", "The chosen ceramics do not meet the Order.", { orderId });
  const extendable =
    order !== undefined &&
    actor.own.orderHand.includes(orderId) &&
    ceramicIds.length < order.ceramics.length &&
    findOrderMatches(order, finishedPool(view.game, actor.viewerId)).some((match) => ceramicIds.every((id) => match.ceramicIds.includes(id)));
  return { ok: false, error: failure, extendable };
}

// ── Firing ───────────────────────────────────────────────────────────────────────────

/**
 * The viewer's Contribution choices while they may submit (L252–262, L638): Tend, Bank, Stoke,
 * then Bank and Stoke with Fuel Ledger when owned, each with its Wood, Heat and whether it is
 * legal now (`legalContributions`, i.e. `validateContribution`).
 */
export function contributionOptions(view: PlayerView): ContributionOption[] {
  const phase = view.game.phase;
  const viewerId = view.viewerId;
  if (viewerId === null || view.own === null || phase.type !== "firing_contributions" || !phase.eligiblePlayerIds.includes(viewerId)) {
    return [];
  }
  const p = player(view.game, viewerId);
  const legal = legalContributions(view);
  const candidates: Array<[SubmitContributionCommand["card"], boolean]> = [
    ["TEND", false],
    ["BANK", false],
    ["STOKE", false],
  ];
  if (ownsTech(p, FUEL_LEDGER)) {
    candidates.push(["BANK", true], ["STOKE", true]);
  }
  return candidates.map(([card, fuelLedger]) => {
    const command: SubmitContributionCommand = { type: "SUBMIT_CONTRIBUTION", windowId: phase.windowId, card, fuelLedger };
    const submission = { card, fuelLedger };
    return {
      command,
      woodCost: contributionWood(submission),
      heat: contributionHeat(submission),
      affordable: legal.some((c) => c.card === card && c.fuelLedger === fuelLedger),
    };
  });
}
