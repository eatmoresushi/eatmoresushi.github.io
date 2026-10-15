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
  activeKilnSpaces,
  DISCIPLINES,
  FIRING,
  GLAZES,
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
import { isFinalRound, settersMarkSpaces } from "./round.ts";
import { scorePreview as scorePreviewOf } from "./scoring.ts";
import { ceramicSequence, ceramicsOf, decisionPrompt, heatMarkerOf, imperialKilnCeramic, lookup, player, turnOrder, workStep } from "./state.ts";
import { acquisitionError, handLimit, ownsTech, techPrice, techReady } from "./techs.ts";
import { quoteMaterialsYard } from "./work/materialsYard.ts";
import { imperialPriorityUsable } from "./work/turn.ts";
import type {
  ActorView,
  BoardView,
  CeramicId,
  CommissionOptions,
  ContributionOption,
  CostQuote,
  CrackleDeclaration,
  CrackleDeclarationChecks,
  FiringContext,
  FiringStageCeramic,
  FiringStageView,
  FiringStep,
  FinishedCeramic,
  FormVesselSpec,
  GameAction,
  GameRuleError,
  Glaze,
  GlazeLoadVesselOption,
  GameRuleErrorCode,
  GuildInspectionOptions,
  GuildOptions,
  GuildTechOption,
  HandLimitStatus,
  ImperialModifier,
  ImperialPriorityCeramicOption,
  ImperialPriorityOptions,
  KilnLayoutView,
  KilnSelectionOption,
  KilnSpaceId,
  KilnSpaceView,
  LoadSpec,
  LoadedCeramic,
  LocationEffectsById,
  LocationId,
  LocationOccupant,
  LookedOrderOptions,
  MaterialsYardOptions,
  OrderDefinition,
  OrderId,
  OrderMatchOption,
  OrderSelectionCheck,
  PersonalLocationId,
  PersonalSpaceView,
  PlacementLimits,
  PlacementOption,
  PlacementWorkerOption,
  PlayerId,
  PlayerState,
  PlayerSummary,
  PlayerView,
  PreparedClayPair,
  PublicGameState,
  Recognition,
  ScorePreview,
  Shape,
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
export { SCORE_BREAKDOWN_ROWS, TIE_BREAK_ORDER } from "./scoring.ts";

type FormDecorateAction = Extract<GameAction, { type: "PLACE_FORM_DECORATE" }>;

const SENIOR_APPRENTICE: TechId = "T18";
const LARGE_THROWING_WHEEL: TechId = "T01";
const DECORATORS_KIT: TechId = "T16";
const CANAL_BARGE: TechId = "T23";
const FUEL_LEDGER: TechId = "T12";
const PREPARED_CLAY: TechId = "T17";

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
      const unlocked = p.personalSpaces[locationId][spaceIndex].unlocked;
      personalSpaces.push({
        locationId,
        spaceIndex,
        unlocked,
        occupant: occupant ?? null,
        addedByTechId: unlocked && spaceIndex === 1 ? addedByTech(p, locationId) : null,
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

/** The owned Tech whose `unlocks` added a second personal space (L211, D7). At most one Tech
 * per discipline is owned (L210), so at most one matches. */
function addedByTech(p: PlayerState, locationId: PersonalLocationId): TechId | null {
  return p.techs.find((tech) => TECHS[tech.id].unlocks === locationId)?.id ?? null;
}

/** What the player would score if the game ended now (public information only). */
export function scorePreview(view: PlayerView, playerId: PlayerId): ScorePreview {
  return scorePreviewOf(view.game, playerId);
}

/**
 * Held Orders against the Cleanup hand limit (4, or 5 with Colour Samples; L199, L303).
 * `trimDue` uses Cleanup's own predicate: Rounds 1–4 only (INT: Round 5 skips the trim).
 */
export function handLimitStatus(view: PlayerView, playerId: PlayerId): HandLimitStatus {
  const held = lookup(view.game.counts.orderHands, playerId) ?? 0;
  const limit = handLimit(player(view.game, playerId));
  const mustDiscard = Math.max(0, held - limit);
  return { held, limit, mustDiscard, trimDue: !isFinalRound(view.game.round) && mustDiscard > 0 };
}

/** The Shared Kiln cover for this player count (L99) and which active spaces hold nothing
 * (UI_V1.6.1_ARCHITECTURE §5 gap 5). A Setter's Mark does not fill a space. */
export function kilnLayout(view: PlayerView): KilnLayoutView {
  const game = view.game;
  const active = activeKilnSpaces(game.playerCount);
  return {
    activeSpaceIds: KILN_SPACE_IDS.filter((spaceId) => active.includes(spaceId)),
    coveredSpaceIds: KILN_SPACE_IDS.filter((spaceId) => !active.includes(spaceId)),
    emptyActiveSpaceIds: KILN_SPACE_IDS.filter((spaceId) => active.includes(spaceId) && game.sharedKiln.spaces[spaceId].ceramicIds.length === 0),
  };
}

/** Appendix D steps resolved in First Player order: Test Pieces, Heat markers, heat
 * adjustment, after-Quality (L675, L676, L679, L681). */
const FIRST_PLAYER_ORDER_STEPS: readonly FiringStep[] = [4, 5, 8, 10];

/** The Appendix D step a firing phase decides (L670–693); null outside the Firing Phase. */
function firingStepOf(phase: PublicGameState["phase"]): FiringStep | null {
  switch (phase.type) {
    case "firing_contributions":
      return 1;
    case "firing_test_pieces":
      return 4;
    case "firing_heat_markers":
      return 5;
    case "firing_heat_adjustment":
      return 8;
    case "firing_after_quality":
    case "firing_second_firing_jun":
      return 10;
    case "firing_salvage":
      return 11;
    default:
      return null;
  }
}

/**
 * A firing as the table shows it (owner decisions D3, D4): never Actual Heat, a heat source,
 * a Heat Difference, a preview or the Fire-deck count. `live` reads the ceramics' current
 * markers; a finished firing (the recap) has had its markers removed (step 12).
 */
function stageOf(game: PublicGameState, firing: FiringContext, step: FiringStep, live: boolean): FiringStageView {
  const phase = game.phase;
  const queue =
    live &&
    (phase.type === "firing_test_pieces" ||
      phase.type === "firing_heat_markers" ||
      phase.type === "firing_heat_adjustment" ||
      phase.type === "firing_after_quality")
      ? { actorIds: [...phase.queue.actorIds], index: phase.queue.index }
      : null;
  const revealed = firing.contributions;
  const submittedPlayerIds =
    live && phase.type === "firing_contributions" ? [...phase.submittedPlayerIds] : revealed === null ? [] : [...firing.participantIds];
  const ceramics: FiringStageCeramic[] = Object.values(firing.ceramics)
    .filter((record): record is NonNullable<typeof record> => record !== undefined)
    .sort((a, b) => ceramicSequence(a.ceramicId) - ceramicSequence(b.ceramicId))
    .map((record) => {
      const current = live ? lookup(game.ceramics, record.ceramicId) : undefined;
      const marker = current !== undefined && current.stage === "loaded" && current.heatMarker !== null ? { ...current.heatMarker } : null;
      return {
        id: record.ceramicId,
        ownerId: record.ownerId,
        kiln: record.kiln,
        spaceId: record.spaceId,
        marker,
        quality: record.quality,
        crackle: record.crackle,
        salvaged: record.salvaged,
        secondFireModifier: record.second?.fireModifier ?? null,
      };
    });
  return {
    round: firing.round,
    step,
    firstPlayerOrder: [...FIRST_PLAYER_ORDER_STEPS],
    queue,
    submittedPlayerIds,
    kilnDie: firing.kilnDie,
    contributions: firing.participantIds.map((playerId) => {
      const contribution = revealed === null ? undefined : lookup(revealed, playerId);
      return {
        playerId,
        revealed: contribution === undefined ? null : { card: contribution.card, heat: contribution.heat, woodPaid: contribution.woodPaid },
      };
    }),
    baseHeat: firing.baseHeat,
    fireModifier: firing.fireModifier,
    globalHeat: firing.globalHeat,
    fireDiscard: [...game.fireDiscard],
    testPieces: firing.testPieces.map((record) => ({ playerId: record.playerId, peeked: record.peeked, buried: record.buried })),
    extraFire: live && firing.pendingExtraFire !== null ? { ...firing.pendingExtraFire } : null,
    ceramics,
  };
}

/** The firing in progress, as the table shows it (UI_V1.6.1_ARCHITECTURE §5 gap 7, D3, D4);
 * null outside the Firing Phase. */
export function firingStageView(view: PlayerView): FiringStageView | null {
  const game = view.game;
  const firing = game.firing;
  const step = firingStepOf(game.phase);
  if (firing === null || step === null) {
    return null;
  }
  return stageOf(game, firing, step, true);
}

/** The last finished firing (step 12), for the recap between firings (§5 gap 18); null before
 * the first firing and while the next one runs (its start clears the recap). */
export function firingRecapView(view: PlayerView): FiringStageView | null {
  const game = view.game;
  return game.lastFiring === null ? null : stageOf(game, game.lastFiring, 12, false);
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
    const error = ruleError("UNKNOWN_PLAYER", "You are not seated in this game.", { playerId: String(view.viewerId) });
    return { ...base, legal: false, reason: error.code, error };
  }
  const gate = validateAction(actor, gateProbe(actor, locationId, option));
  if (gate === null) {
    return { ...base, legal: true, reason: null, error: null };
  }
  if (PLACEMENT_GATE_CODES.has(gate.code)) {
    return { ...base, legal: false, reason: gate.code, error: gate };
  }
  for (const probe of placementProbes(actor, locationId, option)) {
    if (validates(actor, probe)) {
      return { ...base, legal: true, reason: null, error: null };
    }
  }
  return { ...base, legal: false, reason: gate.code, error: gate };
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
 * The printed effect record of a location for a worker effect (Appendix E; §5 gap 10): Form &
 * Decorate `maxVessels`, Glaze & Load `maxLoads` / `maxImperialLoads` / `placesHeatMarker`,
 * Materials Yard `resources` / `bonus`, Canal Wharf `coins`, … so a form never reads rule
 * constants. A copy; `view` keeps the selector shape (and the UI's import rule).
 */
export function placementLimits<L extends LocationId, E extends WorkerEffect>(
  view: PlayerView,
  locationId: L,
  effect: E,
): PlacementLimits<L, E> {
  void view;
  const effects = LOCATIONS[locationId].effects as LocationEffectsById[L];
  return structuredClone(effects[effect]);
}

/**
 * Materials Yard choices for one `placementOptions` worker entry (L159–162, L618; §5 gap 14),
 * probed through `validateAction`:
 * - `resources`: the Clay/Wood split total for the worker's effect;
 * - `shifuBonus`: the Shifu effect's 1-Coin purchase, quoted (`ok` = affordable), else null;
 * - `preparedClay`: every Shape + Decoration pair some legal command names (any split, with
 *   or without the bonus), and the Shapes and Decorations of those pairs; null for a Senior
 *   Apprentice placement (L349: both Form & Decorate Techs, L210) or when Prepared Clay (T17)
 *   is not owned and ready. Legality is per pair: Shape Clay and Decoration Coins compete with
 *   the 1-Coin bonus, so `shapes` × `decorations` may contain illegal combinations, and each
 *   pair says whether it stays legal together with the Shifu bonus.
 */
export function materialsYardOptions(view: PlayerView, worker: PlacementWorkerOption): MaterialsYardOptions {
  const resources = LOCATIONS.materials_yard.effects[worker.effect].resources;
  const actor = asActorView(view);
  const command = (clay: number, bonus: boolean, preparedClay?: { shape: Shape; decoration: (typeof DECORATIONS)[number] }): GameAction => ({
    type: "PLACE_MATERIALS_YARD",
    workerId: worker.workerId,
    clay,
    wood: resources - clay,
    ...(worker.seniorApprentice ? { seniorApprentice: true } : {}),
    ...(bonus ? { buyShifuBonus: true } : {}),
    ...(preparedClay === undefined ? {} : { preparedClay }),
  });
  const shifuBonus =
    actor === null || worker.effect !== "shifu"
      ? null
      : quoteMaterialsYard(actor, command(resources, true) as Extract<GameAction, { type: "PLACE_MATERIALS_YARD" }>);
  if (actor === null || worker.seniorApprentice || !techReady(player(view.game, actor.viewerId), PREPARED_CLAY)) {
    return { resources, shifuBonus, preparedClay: null };
  }
  const pairs: PreparedClayPair[] = [];
  for (const shape of SHAPES) {
    for (const decoration of DECORATIONS) {
      // Prepared Clay is paid after gaining the split and the bonus (L618), so a pair is legal
      // with a given bonus choice when some split validates.
      const legalWith = (bonus: boolean): boolean => {
        for (let clay = resources; clay >= 0; clay -= 1) {
          if (validates(actor, command(clay, bonus, { shape, decoration }))) return true;
        }
        return false;
      };
      const withShifuBonus = worker.effect === "shifu" && legalWith(true);
      if (withShifuBonus || legalWith(false)) {
        pairs.push({ shape, decoration, withShifuBonus });
      }
    }
  }
  return {
    resources,
    shifuBonus,
    preparedClay: {
      shapes: SHAPES.filter((x) => pairs.some((pair) => pair.shape === x)),
      decorations: DECORATIONS.filter((x) => pairs.some((pair) => pair.decoration === x)),
      pairs,
    },
  };
}

/**
 * The Shaped vessels a Glaze & Load load may name after `earlierLoads` (L176–184, L343, L617;
 * §5 gap 15), each with its Glazes (any, when it has a legal destination with its Shape or a
 * reworked one) and its Reworking Table Shapes (T05 ready, no earlier load of this action
 * reworked, a legal destination for the new Shape). Destinations come from
 * `loadDestinationOptions`, the validator's own simulation. Vessels already in
 * `earlierLoads` are left out.
 */
export function glazeLoadVesselOptions(view: PlayerView, playerId: PlayerId, earlierLoads: readonly LoadSpec[]): GlazeLoadVesselOption[] {
  if (seatedPlayer(view.game, playerId) === null) {
    return [];
  }
  const used = new Set(earlierLoads.map((load) => load.ceramicId));
  return ceramicsOf(view.game, playerId, "shaped")
    .filter((vessel) => !used.has(vessel.id))
    .map((vessel) => {
      const reworkShapes = SHAPES.filter(
        (shape) => shape !== vessel.shape && loadDestinationOptions(view, playerId, vessel.id, earlierLoads, shape).length > 0,
      );
      const loadable = reworkShapes.length > 0 || loadDestinationOptions(view, playerId, vessel.id, earlierLoads).length > 0;
      return { ceramicId: vessel.id, glazes: loadable ? [...GLAZES] : [], reworkShapes };
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


/**
 * Imperial Priority now (L292, R10): usable in your before/after-action window with the token
 * held, an empty gained Imperial Kiln and a Shaped vessel, which may be any of them. Per
 * vessel (§5 gap 16), probed through `validateAction`: its Glazes, Imperial modifiers and
 * Reworking Table Shapes (DESIGN §11 Q1).
 */
export function imperialPriorityOptions(view: PlayerView): ImperialPriorityOptions {
  const actor = asActorView(view);
  if (actor === null || !imperialPriorityWindowUsable(view.game, actor.viewerId)) {
    return { usable: false, ceramicIds: [], ceramics: [] };
  }
  const vessels = ceramicsOf(view.game, actor.viewerId, "shaped");
  const firstGlaze = GLAZES[0] as Glaze;
  const firstModifier = FIRING.imperialModifiers[0] as ImperialModifier;
  const probe = (ceramicId: CeramicId, glaze: Glaze, imperialModifier: ImperialModifier, reworkShape?: Shape): boolean =>
    validates(actor, { type: "USE_IMPERIAL_PRIORITY", ceramicId, glaze, imperialModifier, ...(reworkShape === undefined ? {} : { reworkShape }) });
  const ceramics: ImperialPriorityCeramicOption[] = vessels.map((vessel) => ({
    ceramicId: vessel.id,
    glazes: GLAZES.filter((glaze) => probe(vessel.id, glaze, firstModifier)),
    imperialModifiers: FIRING.imperialModifiers.filter((modifier) => probe(vessel.id, firstGlaze, modifier)),
    reworkShapes: SHAPES.filter((shape) => shape !== vessel.shape && probe(vessel.id, firstGlaze, firstModifier, shape)),
  }));
  return { usable: true, ceramicIds: vessels.map((c) => c.id), ceramics };
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

/**
 * Validator verdicts for a Crackle declaration picker (L469, L484; §5 gap 8). For the selected
 * ceramics of one held Order and the picker's current explicit `declarations`:
 * - `auto`: declarations omitted, the engine searches (the picker's explicit "auto" mode);
 * - `declared`: the declarations exactly as given;
 * - per selected Crackle ceramic, the verdict of declaring each Decoration, and of leaving it
 *   undeclared (its printed Decoration), with the other ceramics' declarations as given.
 * Every verdict is `orderSelectionCheck`, the validator's own matcher, so it agrees with
 * `COMPLETE_ORDER` and `USE_CANAL_BARGE` in their windows.
 */
export function crackleDeclarationChecks(
  view: PlayerView,
  orderId: OrderId,
  ceramicIds: readonly CeramicId[],
  declarations: readonly CrackleDeclaration[],
): CrackleDeclarationChecks {
  const withDeclaration = (ceramicId: CeramicId, decoration: (typeof DECORATIONS)[number] | null): CrackleDeclaration[] => {
    const replaced: CrackleDeclaration[] = [];
    let placed = false;
    for (const d of declarations) {
      if (d.ceramicId !== ceramicId) {
        replaced.push({ ...d });
      } else if (decoration !== null && !placed) {
        replaced.push({ ceramicId, decoration });
        placed = true;
      }
    }
    if (decoration !== null && !placed) {
      replaced.push({ ceramicId, decoration });
    }
    return replaced;
  };
  const crackle = ceramicIds
    .map((id) => lookup(view.game.ceramics, id))
    .filter((c): c is FinishedCeramic => c !== undefined && c.stage === "finished" && c.crackle);
  return {
    orderId,
    ceramicIds: [...ceramicIds],
    auto: orderSelectionCheck(view, orderId, ceramicIds),
    declared: orderSelectionCheck(view, orderId, ceramicIds, declarations),
    ceramics: crackle.map((c) => ({
      ceramicId: c.id,
      printedDecoration: c.decoration,
      options: [null, ...DECORATIONS].map((decoration) => ({
        decoration,
        check: orderSelectionCheck(view, orderId, ceramicIds, withDeclaration(c.id, decoration)),
      })),
    })),
  };
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
