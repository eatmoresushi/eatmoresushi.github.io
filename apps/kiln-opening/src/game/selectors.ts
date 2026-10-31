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
  IMPERIAL_TRACK,
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
import {
  END_TURN_COMMAND_TYPES,
  FREE_ACTION_END_TURN_TYPES,
  afterActionWindowOpen,
  colourSamplesSwapUsable,
  endTurnRequestError,
  freeActionWindowOf,
  imperialPriorityUsable,
  sellableFlawed,
} from "./freeActionWindow.ts";
import { availableKilns, kilnAbilityReady } from "./kilns.ts";
import { kilnMasterOptionFor, loadDestinationOptions } from "./kilnLoading.ts";
import { lookCount, reservable } from "./market.ts";
import { completionTriggers, validateOrderCompletion } from "./orders/completion.ts";
import { findOrderMatches, matchOrder, type OrderMatch } from "./orders/matching.ts";
import { availableWorkers, centralCapacity, nextPersonalSpace, workersAt } from "./placement.ts";
import { magistratesHallOpen, milestoneResourcesCrossed } from "./recognition.ts";
import { isFinalRound, settersMarkSpaces } from "./round.ts";
import { scorePreview as scorePreviewOf } from "./scoring.ts";
import { ceramicSequence, ceramicsOf, decisionPrompt, imperialKilnCeramic, kilnMasterCarrier, lookup, player, selectStep, turnOrder, workStep } from "./state.ts";
import { acquisitionError, handLimit, ownsTech, techPrice, techReady } from "./techs.ts";
import { commissionLimits } from "./work/commissionMarket.ts";
import { decisionLeft } from "./work/guildHall.ts";
import { swapLookCount, validateColourSamplesSwap } from "./work/windowAbilities.ts";
import type {
  ActionBrings,
  ActorView,
  BoardView,
  CeramicId,
  ColourSamplesSwapOptions,
  CommissionOptions,
  ContributionOption,
  CostQuote,
  CrackleDeclaration,
  CrackleDeclarationChecks,
  EndTurnCommandType,
  EndTurnOptions,
  FiringContext,
  FiringStageCeramic,
  FiringStageView,
  FiringStep,
  FinishedCeramic,
  FormVesselSpec,
  FreeActionOptions,
  GameAction,
  GameRuleError,
  Glaze,
  GlazeLoadVesselOption,
  GameRuleErrorCode,
  GuildInspectionOptions,
  GuildOptions,
  GuildTake,
  GuildTechOption,
  HandLimitStatus,
  ImperialModifier,
  ImperialPriorityCeramicOption,
  ImperialPriorityOptions,
  KilnLayoutView,
  KilnMasterOption,
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
  SetupChoiceOptions,
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
export { quoteGlazeLoad } from "./work/glazeLoad.ts";
export { loadDestinationOptions } from "./kilnLoading.ts";
export { junOptions, testPiecesOptions } from "./firing/pipeline.ts";
export { afterQualityOptions, secondFiringChoiceOptions } from "./firing/afterQuality.ts";
export { sellFlawedOptions } from "./flawedSale.ts";
export { legalContributions } from "./firing/contributions.ts";
export { findOrderMatches } from "./orders/matching.ts";
export { SCORE_BREAKDOWN_ROWS, TIE_BREAK_ORDER } from "./scoring.ts";

type FormDecorateAction = Extract<GameAction, { type: "PLACE_FORM_DECORATE" }>;

const SENIOR_APPRENTICE: TechId = "T18";
const LARGE_THROWING_WHEEL: TechId = "T01";
const DECORATORS_KIT: TechId = "T16";
const FUEL_LEDGER: TechId = "T12";
const PREPARED_CLAY: TechId = "T17";
const COLOUR_SAMPLES: TechId = "T10";

/**
 * Rule-error codes that depend only on the phase, the actor, the worker, the location and the
 * worker effect — never on the rest of a placement command. Every placement validator checks
 * them before anything command-specific (`validatePlacement`, then the location's "at least 1
 * instance of the main action" test, L164; the Magistrate's Hall Recognition gate). When one
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
    recordedVp: recorded.orders + recorded.kilnAbilities + recorded.recognitionOverflow + recorded.imperialAudience,
    recorded,
    contributionCards: [...p.contributionCards],
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
    kilnMasterCeramicId: kilnMasterCarrier(game, playerId)?.id ?? null,
    orderHandCount: lookup(game.counts.orderHands, playerId) ?? 0,
    handLimit: handLimit(p),
    shapedCeramicIds: ceramicsOf(game, playerId, "shaped").map((c) => c.id),
    loadedCeramicIds: ceramicsOf(game, playerId, "loaded").map((c) => c.id),
    finishedCeramicIds: ceramicsOf(game, playerId, "finished").map((c) => c.id),
    completedOrders: structuredClone(p.completedOrders),
  };
}

/** The owned Tech whose `unlocks` added a second personal space (L241, D7). At most one Tech
 * per discipline is owned (L240), so at most one matches. */
function addedByTech(p: PlayerState, locationId: PersonalLocationId): TechId | null {
  return p.techs.find((tech) => TECHS[tech.id].unlocks === locationId)?.id ?? null;
}

/** What the player would score if the game ended now (public information only). */
export function scorePreview(view: PlayerView, playerId: PlayerId): ScorePreview {
  return scorePreviewOf(view.game, playerId);
}

/**
 * Held Orders against the Cleanup hand limit (4, or 5 with Colour Samples; L229, L325).
 * `trimDue` uses Cleanup's own predicate: Rounds 1–4 only (INT: Round 5 skips the trim).
 */
export function handLimitStatus(view: PlayerView, playerId: PlayerId): HandLimitStatus {
  const held = lookup(view.game.counts.orderHands, playerId) ?? 0;
  const limit = handLimit(player(view.game, playerId));
  const mustDiscard = Math.max(0, held - limit);
  return { held, limit, mustDiscard, trimDue: !isFinalRound(view.game.round) && mustDiscard > 0 };
}

/** The Shared Kiln cover for this player count (L122) and which active spaces hold nothing
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

/** Appendix D steps the rulebook resolves in First Player order (L674–691): only step 5,
 * the after-Quality abilities. Test Pieces (end of step 1) and Jun (step 3) each have a single
 * owner, so no order is printed for them since revision 4. */
const FIRST_PLAYER_ORDER_STEPS: readonly FiringStep[] = [5];

/** The Appendix D step a firing phase decides (L674–691); null outside the Firing Phase.
 * Revision 4 has no Heat-marker step (changes 28, 31). */
function firingStepOf(phase: PublicGameState["phase"]): FiringStep | null {
  switch (phase.type) {
    case "firing_contributions":
    case "firing_test_pieces":
      return 1;
    case "firing_heat_adjustment":
      return 3;
    case "firing_after_quality":
    case "firing_second_firing_choice":
      return 5;
    default:
      return null;
  }
}

/**
 * A firing as the table shows it (owner decisions D3, D4): never Actual Heat, a heat source,
 * a Heat Difference, a preview or the Fire-deck count. `live` reads the ceramics' current
 * Kiln Master marker; a finished firing (the recap) has had it removed (step 6).
 */
function stageOf(game: PublicGameState, firing: FiringContext, step: FiringStep, live: boolean): FiringStageView {
  const phase = game.phase;
  const queue =
    live &&
    (phase.type === "firing_test_pieces" ||
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
      const kilnMasterMarker = current !== undefined && current.stage === "loaded" ? current.kilnMasterMarker : null;
      return {
        id: record.ceramicId,
        ownerId: record.ownerId,
        kiln: record.kiln,
        spaceId: record.spaceId,
        kilnMasterMarker,
        quality: record.quality,
        crackle: record.crackle,
        secondFireModifier: record.second?.fireModifier ?? null,
        secondFireRevealed: record.secondFiringCards === null ? null : [...record.secondFiringCards],
        saggarsFloor: record.saggarsFloor,
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
    extraFire:
      live && firing.pendingExtraFire !== null
        ? { playerId: firing.pendingExtraFire.playerId, ceramicId: firing.pendingExtraFire.ceramicId, modifiers: [...firing.pendingExtraFire.modifiers] }
        : null,
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

/** The last finished firing (Appendix D step 6), for the recap between firings (§5 gap 18);
 * null before the first firing and while the next one runs (its start clears the recap). */
export function firingRecapView(view: PlayerView): FiringStageView | null {
  const game = view.game;
  return game.lastFiring === null ? null : stageOf(game, game.lastFiring, 6, false);
}

/** The current firing, else the most recent one (for the recap). */
export function firingSummary(view: PlayerView): FiringContext | null {
  const firing = view.game.firing ?? view.game.lastFiring;
  return firing === null ? null : structuredClone(firing);
}

// ── Setup and Start of Round ─────────────────────────────────────────────────────────

/**
 * Setup step 9 for the viewer while it is their choice (L130, R23): every Kiln with its
 * availability, and the display positions holding a Main Order to take with it in the same
 * `SELECT_KILN`. Null when it is not the viewer's choice.
 */
export function setupChoiceOptions(view: PlayerView): SetupChoiceOptions | null {
  if (!viewerActs(view) || view.game.phase.type !== "setup_kiln_selection") {
    return null;
  }
  return { kilns: kilnSelectionOptions(view), faceUpSlots: [...reservable(view.game).faceUpSlots] };
}

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

/** Spaces where the viewer may place their Setter's Mark now (T22, L636); `[]` when it is
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
      // The whole command: the Select and its reservations follow in SELECT_CHOOSE.
      return { type: "PLACE_COMMISSION_MARKET", workerId, ...seniorFlag(option) };
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

/** Form & Decorate discount variants of a vessel list (Large Throwing Wheel; Decorator's Kit on
 * the first vessel, any Decoration, rev. 5 L622, change 37). */
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
  const wheel = techReady(p, LARGE_THROWING_WHEEL) && vessels.some((v) => wheelShapes.includes(v.shape));
  const kitIndex = techReady(p, DECORATORS_KIT) && vessels.length > 0 ? 0 : -1;
  if (wheel) {
    variants.push({ useLargeThrowingWheel: true });
  }
  if (kitIndex >= 0) {
    variants.push({ decoratorsKitVesselIndex: kitIndex });
    if (wheel) {
      // Unreachable under L240 (both Workshop Techs), kept for completeness.
      variants.push({ useLargeThrowingWheel: true, decoratorsKitVesselIndex: kitIndex });
    }
  }
  return variants;
}

/** Commands that between them prove a location legal for a worker choice (L164). */
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
 * Senior Apprentice) and whether each may be placed now (L162–166, L164). `legal` means some
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
 * Decorate `maxVessels` / `twoVesselDiscount`, Glaze & Load `maxLoads` / `maxImperialLoads` /
 * `sharedKilnWood`, Materials Yard `resources`, Commission Market `select` / `maxReservations`,
 * Canal Wharf `coins` / `topMainOrders`, Magistrate's Hall `coins` / `recognitionSteps` /
 * `crownOrders`, … so a form never reads rule
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
 * Materials Yard choices for one `placementOptions` worker entry (L194–195, L624; §5
 * gap 14), probed through `validateAction`:
 * - `resources`: the Clay/Wood split total for the worker's effect (4, or 8 for the Shifu
 *   effect, Senior Apprentice included);
 * - `preparedClay`: every Shape + Decoration pair some legal command names (any split), and
 *   the Shapes and Decorations of those pairs; null for a Senior Apprentice placement (both
 *   Form & Decorate Techs, L240) or when Prepared Clay (T17) is not owned and ready.
 *   Legality is per pair: Shape Clay comes from the split, so `shapes` × `decorations` may
 *   contain illegal combinations.
 */
export function materialsYardOptions(view: PlayerView, worker: PlacementWorkerOption): MaterialsYardOptions {
  const resources = LOCATIONS.materials_yard.effects[worker.effect].resources;
  const actor = asActorView(view);
  const command = (clay: number, preparedClay?: { shape: Shape; decoration: (typeof DECORATIONS)[number] }): GameAction => ({
    type: "PLACE_MATERIALS_YARD",
    workerId: worker.workerId,
    clay,
    wood: resources - clay,
    ...(worker.seniorApprentice ? { seniorApprentice: true } : {}),
    ...(preparedClay === undefined ? {} : { preparedClay }),
  });
  if (actor === null || worker.seniorApprentice || !techReady(player(view.game, actor.viewerId), PREPARED_CLAY)) {
    return { resources, preparedClay: null };
  }
  const pairs: PreparedClayPair[] = [];
  for (const shape of SHAPES) {
    for (const decoration of DECORATIONS) {
      // Prepared Clay is paid after gaining the split (L624), so a pair is legal when some
      // split validates.
      for (let clay = resources; clay >= 0; clay -= 1) {
        if (validates(actor, command(clay, { shape, decoration }))) {
          pairs.push({ shape, decoration });
          break;
        }
      }
    }
  }
  return {
    resources,
    preparedClay: {
      shapes: SHAPES.filter((x) => pairs.some((pair) => pair.shape === x)),
      decorations: DECORATIONS.filter((x) => pairs.some((pair) => pair.decoration === x)),
      pairs,
    },
  };
}

/**
 * The Shaped vessels a Glaze & Load load may name after `earlierLoads` (L209–218, L358, L623;
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
 * Indexes of `draft.vessels` that Ding may copy (L488, R1): a Bowl, Plate or Brush Washer of
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

/** The player's Shaped vessels in sequence order (L371). */
export function shapedVessels(view: PlayerView, playerId: PlayerId): ShapedCeramic[] {
  return ceramicsOf(view.game, playerId, "shaped").map((c) => structuredClone(c));
}

/**
 * Kiln Master (T24, L647, R22) for a player's next loading command — a Glaze & Load load
 * or Imperial Priority, into either kiln: null without the tile; else whether it is unused this
 * round (`LoadSpec.kilnMaster` / `USE_IMPERIAL_PRIORITY.kilnMaster` may then name a face) and
 * its faces (+1, −1). Public facts only.
 */
export function kilnMasterOption(view: PlayerView, playerId: PlayerId): KilnMasterOption | null {
  return kilnMasterOptionFor(view.game, playerId);
}

/**
 * The Commission Market at placement time for a worker effect (v1.6.2 L219–230, B1), from
 * public information only: how many cards the look would show, the reservation limit and the
 * display positions holding an Order. `reservable` is the placement's main-action test (L164):
 * a display Order or a non-empty deck plus discard (then the look shows at least 1 card).
 */
export function commissionOptions(view: PlayerView, effect: WorkerEffect): CommissionOptions {
  const game = view.game;
  const supply = reservable(game);
  const { n, maxReservations } = commissionLimits(effect);
  return {
    effect,
    n,
    lookCount: lookCount(game, n),
    maxReservations,
    faceUpSlots: [...supply.faceUpSlots],
    reservable: supply.faceUpSlots.length > 0 || supply.supply,
  };
}

/**
 * The viewer's own open Select (v1.6.2 L80, change 25): the Commission Market, Colour Samples
 * when acquired or its swap, while `SELECT_CHOOSE` is due. It lists N, the looked cards, the
 * display positions reservable now (every Select may take a face-up Main Order) and the
 * reservation limit (1, or 2 for the Commission Market Shifu effect). Null otherwise.
 */
export function lookedOrderOptions(view: PlayerView): LookedOrderOptions | null {
  const look = view.own?.pendingLook ?? null;
  const step = selectStep(view.game);
  if (look === null || look.kind === "guild_inspection" || step === null || step.kind !== look.kind) {
    return null;
  }
  return {
    kind: look.kind,
    n: step.select.n,
    orderIds: [...look.orderIds],
    faceUpSlots: step.select.fromDisplay ? [...reservable(view.game).faceUpSlots] : [],
    maxReservations: step.select.maxReservations,
  };
}

/**
 * One Tech a Guild Hall worker could take, with the validator's own checks in its order:
 * the Shifu's take limit (`takesLeft`), the 3-total / 1-per-discipline limit (L240), then
 * the printed cost (v1.6.2 L236–237).
 */
function techOption(p: PlayerState | null, techId: TechId, source: "face_up" | "inspected", takesLeft: number): GuildTechOption {
  const cost = techPrice(techId);
  const limit = p === null ? ruleError("UNKNOWN_PLAYER", "Not seated.", {}) : acquisitionError(p, techId);
  const reason: GameRuleErrorCode | null =
    takesLeft <= 0
      ? "TECH_TAKE_LIMIT"
      : limit !== null
        ? limit.code
        : p !== null && cost > p.resources.coins
          ? "INSUFFICIENT_RESOURCES"
          : null;
  return { techId, discipline: TECHS[techId].discipline, source, cost, legal: reason === null, reason };
}

/** Guild Hall choices for a worker effect (v1.6.2 L232–244): Techs to buy (Apprentice) or
 * take after inspecting (Shifu), at printed cost; the Shifu may inspect any discipline (B2). */
export function guildOptions(view: PlayerView, effect: WorkerEffect): GuildOptions {
  const game = view.game;
  const p = view.viewerId === null ? null : seatedPlayer(game, view.viewerId);
  return {
    effect,
    faceUp: DISCIPLINES.flatMap((d) => game.techDisplay[d]).map((techId) => techOption(p, techId, "face_up", 1)),
    inspect: effect === "shifu" ? DISCIPLINES.map((discipline) => ({ discipline, deckCount: game.counts.techDecks[discipline] })) : [],
  };
}

/**
 * The viewer's Guild Hall Shifu inspection (v1.6.2 L237, B2) while it is open: the inspected
 * Techs not taken yet and the face-up Techs showing now, each with the legality of taking it
 * next (`GUILD_TAKE`), and what `GUILD_FINISH` needs. Null otherwise.
 */
export function guildInspectionOptions(view: PlayerView): GuildInspectionOptions | null {
  const look = view.own?.pendingLook ?? null;
  const step = workStep(view.game, "guild_inspection");
  if (look === null || look.kind !== "guild_inspection" || step === null || view.viewerId === null) {
    return null;
  }
  const p = seatedPlayer(view.game, view.viewerId);
  const takesLeft = Math.max(0, LOCATIONS.guild_hall.effects.shifu.maxTechs - step.takes.length);
  return {
    discipline: look.discipline,
    inspected: look.techIds.map((techId) => techOption(p, techId, "inspected", takesLeft)),
    faceUp: DISCIPLINES.flatMap((d) => view.game.techDisplay[d]).map((techId) => techOption(p, techId, "face_up", takesLeft)),
    takes: step.takes.map((take) => ({ ...take })),
    takesLeft,
    canFinish: step.takes.length > 0,
    bottomOrderLength: look.techIds.length,
  };
}

/**
 * Whether the viewer's inspection would still wait for a decision after this take: the engine's
 * own `decisionLeft`, asked of the state after the take (a copy of the player with the cost paid
 * and the Tech added, a copy of the step with the take added). The taken Tech may still show on
 * the display here; the 1-per-discipline limit refuses it as a next take, as it does the rest of
 * its discipline. The cost comes from the viewer's own `guildInspectionOptions`, so an inspected
 * Tech's price is used only by the viewer who has seen it, and `decisionLeft` itself still reads
 * public facts only. False when the viewer has no open inspection or `take` is not one of its
 * options. A Colour Samples take opens its Select first (B1 permitting): this answers for the
 * inspection after that Select, as `guildDecisionLeftOnResume` will.
 */
export function guildDecisionLeftAfterTake(view: PlayerView, take: GuildTake): boolean {
  const options = guildInspectionOptions(view);
  const step = workStep(view.game, "guild_inspection");
  const p = view.viewerId === null ? null : seatedPlayer(view.game, view.viewerId);
  if (options === null || step === null || p === null) {
    return false;
  }
  const option = (take.kind === "inspected" ? options.inspected : options.faceUp).find((candidate) => candidate.techId === take.techId);
  if (option === undefined) {
    return false;
  }
  const after: PlayerState = {
    ...p,
    resources: { ...p.resources, coins: p.resources.coins - option.cost },
    techs: [...p.techs, { id: take.techId, acquiredInRound: view.game.round, usedThisRound: false }],
  };
  return decisionLeft(view.game, after, { ...step, takes: [...step.takes, { kind: take.kind, techId: take.techId }] });
}

/**
 * Whether the viewer's inspection would still wait for a decision after Colour Samples'
 * when-acquired Select (v1.6.2 L243): the engine's own `decisionLeft` on the step that Select
 * resumes. The reservation changes nothing it reads. False unless that Select is the viewer's own
 * and has an inspection behind it.
 */
export function guildDecisionLeftOnResume(view: PlayerView): boolean {
  const viewerId = view.viewerId;
  const step = workStep(view.game, "colour_samples");
  const p = viewerId === null ? null : seatedPlayer(view.game, viewerId);
  if (step === null || step.resume === null || p === null || view.game.phase.type !== "work_turn" || view.game.phase.activePlayerId !== viewerId) {
    return false;
  }
  return decisionLeft(view.game, p, step.resume);
}

/**
 * The display positions the Magistrate's Hall Shifu could take a Crown Order from now (rev. 4
 * L259, R21): positions holding a face-up Order that shows at least 1 Crown. Public.
 */
function crownOrderSlots(game: PublicGameState): number[] {
  return reservable(game).faceUpSlots.filter((slotIndex) => {
    const orderId = game.market.display[slotIndex];
    return orderId !== null && orderId !== undefined && ORDERS[orderId].crowns >= 1;
  });
}

/**
 * The Magistrate's Hall for a worker effect (L252–263, change 33): 4 Coins for either
 * worker, +1 Recognition, only from Recognition 0–2 and never to 4; `reachable` is the
 * Recognition it would reach. `crownOrderSlots`: for the Shifu effect, the display positions
 * whose Order shows a Crown — the optional reservation that follows the step (R21; `[]` when
 * none shows, and always `[]` for the Apprentice).
 */
export function magistratesHallQuote(
  view: PlayerView,
  effect: WorkerEffect,
): CostQuote & { reachable: Recognition | null; crownOrderSlots: number[] } {
  const effects = LOCATIONS.magistrates_hall.effects[effect];
  const pay = { clay: 0, wood: 0, coins: effects.coins };
  const lines = [{ kind: "magistrates_hall" as const, resource: "coins" as const, amount: effects.coins, itemIndex: null }];
  const zero = { clay: 0, wood: 0, coins: 0 };
  const slots = effect === "shifu" && LOCATIONS.magistrates_hall.effects.shifu.crownOrders > 0 ? crownOrderSlots(view.game) : [];
  const p = view.viewerId === null ? null : seatedPlayer(view.game, view.viewerId);
  if (p === null) {
    return {
      ok: false,
      error: ruleError("UNKNOWN_PLAYER", "You are not seated in this game.", { playerId: String(view.viewerId) }),
      pay,
      gain: zero,
      lines,
      reachable: null,
      crownOrderSlots: slots,
    };
  }
  const from = p.imperial.recognition;
  const to = from + effects.recognitionSteps;
  if (!magistratesHallOpen(p) || to >= 4) {
    const error = ruleError("RECOGNITION_GATE", "The Magistrate's Hall is usable only at Recognition 0–2 and never advances you to 4.", { recognition: from });
    return { ok: false, error, pay, gain: zero, lines, reachable: null, crownOrderSlots: slots };
  }
  const reachable = to as Recognition;
  if (p.resources.coins < effects.coins) {
    const error = ruleError("INSUFFICIENT_RESOURCES", `Not enough coins: you need ${effects.coins} and have ${p.resources.coins}.`, {
      resource: "coins",
      needed: effects.coins,
      have: p.resources.coins,
    });
    return { ok: false, error, pay, gain: zero, lines, reachable, crownOrderSlots: slots };
  }
  // The milestone crossed is part of the action's result: the Imperial Grant at Recognition 1
  // (L446) if it is not yet received; the later milestones give no resources.
  const gain = milestoneResourcesCrossed(p, from, reachable);
  return { ok: true, error: null, pay, gain, lines, reachable, crownOrderSlots: slots };
}

/**
 * The Colour Samples swap now (T10, rev. 5 L632, change 25): `usable` on the public facts that
 * open the window (T10 ready, a held Order, the viewer's own before/after-action window of a Work
 * turn; it is not a free action, so never in the Order Phase); per
 * held Order, in hand order, how many cards its Select 3 would show after discarding it (B1, R16,
 * R17) and the validator's verdict on that discard; and the display positions the Select could
 * take instead.
 */
export function colourSamplesSwapOptions(view: PlayerView): ColourSamplesSwapOptions {
  const actor = asActorView(view);
  if (actor === null || !ownActionWindow(view.game, actor.viewerId) || !colourSamplesSwapUsable(view.game, actor.viewerId)) {
    return { usable: false, discards: [], faceUpSlots: [] };
  }
  return {
    usable: true,
    discards: actor.own.orderHand.map((orderId) => ({
      orderId,
      lookCount: swapLookCount(view.game, orderId),
      legal: validateColourSamplesSwap(actor, orderId) === null,
    })),
    faceUpSlots: [...reservable(view.game).faceUpSlots],
  };
}

/** The player's own before- or after-action window of a Work turn (the Colour Samples swap's). */
function ownActionWindow(game: PublicGameState, playerId: PlayerId): boolean {
  const window = freeActionWindowOf(game, playerId);
  return window === "before_action" || window === "after_action";
}

function imperialPriorityWindowUsable(game: PublicGameState, playerId: PlayerId): boolean {
  return seatedPlayer(game, playerId) !== null && freeActionWindowOf(game, playerId) !== null && imperialPriorityUsable(game, playerId);
}

/**
 * The viewer's free actions now (rev. 5 L168–176): null outside the viewer's free-action windows
 * (before or after the worker action of their own Work turn, their own Order Phase turn);
 * otherwise the window, the held Orders their Finished ceramics can complete now (hand order;
 * the same matcher as the validator), the Flawed ceramics they may sell and whether Imperial
 * Priority is usable. Reads only the viewer's own hand.
 */
export function freeActionOptions(view: PlayerView): FreeActionOptions | null {
  const viewerId = view.viewerId;
  if (viewerId === null || view.own === null || seatedPlayer(view.game, viewerId) === null) {
    return null;
  }
  const window = freeActionWindowOf(view.game, viewerId);
  if (window === null) {
    return null;
  }
  return {
    window,
    completableOrderIds: completableOrders(view).map((option) => option.orderId),
    sellableCeramicIds: sellableFlawed(view.game, viewerId),
    imperialPriority: imperialPriorityUsable(view.game, viewerId),
  };
}

// "End the turn afterwards" (owner UI decision D21; DELTA §16.24). Re-exported for the UI.
export { END_TURN_COMMAND_TYPES } from "./freeActionWindow.ts";

/** The commands each Work step finishes or continues the worker action with (D21). */
const WORKER_ACTION_COMMANDS: { readonly [K in "before_action" | "commission_market" | "colour_samples" | "guild_inspection"]: readonly EndTurnCommandType[] } = {
  before_action: [
    "PLACE_MATERIALS_YARD",
    "PLACE_FORM_DECORATE",
    "PLACE_GLAZE_LOAD",
    "PLACE_COMMISSION_MARKET",
    "PLACE_GUILD_HALL",
    "PLACE_CANAL_WHARF",
    "PLACE_MAGISTRATES_HALL",
  ],
  commission_market: ["SELECT_CHOOSE"],
  colour_samples: ["SELECT_CHOOSE"],
  guild_inspection: ["GUILD_TAKE", "GUILD_FINISH"],
};

/**
 * The "end the turn afterwards" request the viewer may put on a command now (owner UI decision
 * D21, `EndTurnRequest`): null unless it is the viewer's own Work turn or Order Phase turn.
 * `commandTypes` are the types of the current step that accept `endTurn: true` (the validators'
 * own `endTurnRequestError` decides, so the list agrees with them); `afterActionWouldOpen` reuses
 * `afterActionWindowOpen` (R27) on the viewer's public view; `requested` reads the public
 * `work_turn.endTurnAfterAction`. Nothing here reads a hand, the viewer's own included, so the
 * same public state gives every viewer in the same seat the same answer.
 */
export function endTurnOptions(view: PlayerView): EndTurnOptions | null {
  const viewerId = view.viewerId;
  if (viewerId === null || view.own === null || seatedPlayer(view.game, viewerId) === null) {
    return null;
  }
  const game = view.game;
  const phase = game.phase;
  const accepted = (types: readonly EndTurnCommandType[]): EndTurnCommandType[] =>
    END_TURN_COMMAND_TYPES.filter((type) => types.includes(type) && endTurnRequestError(game, viewerId, { type, endTurn: true }) === null);
  if (phase.type === "orders") {
    if (phase.turnOrder[phase.index] !== viewerId) {
      return null;
    }
    return { stage: "order_phase", commandTypes: accepted(FREE_ACTION_END_TURN_TYPES), afterActionWouldOpen: false, requested: false };
  }
  if (phase.type !== "work_turn" || phase.activePlayerId !== viewerId) {
    return null;
  }
  const step = phase.step;
  // True in `after_action`, where the step is open only while the predicate holds (R27).
  const common = { afterActionWouldOpen: afterActionWindowOpen(game, viewerId), requested: phase.endTurnAfterAction === true };
  switch (step.kind) {
    case "before_action":
      return { stage: "before_action", commandTypes: accepted(WORKER_ACTION_COMMANDS.before_action), ...common };
    case "after_action":
      return { stage: "after_action", commandTypes: accepted(FREE_ACTION_END_TURN_TYPES), ...common };
    case "colour_samples_swap":
      return { stage: "colour_samples_swap", commandTypes: accepted(["SELECT_CHOOSE"]), ...common };
    default:
      return { stage: "worker_action", commandTypes: accepted(WORKER_ACTION_COMMANDS[step.kind]), ...common };
  }
}

/**
 * Whether the after-action step may open once the viewer's worker action is done (R27, owner UI
 * decision D21). `endTurnOptions(view).afterActionWouldOpen` is the public answer now; the action
 * may still change the facts it reads, and `brings` says how:
 * - a held Order counts with a Finished ceramic (a Flawed one has already opened it) or a ready
 *   swap;
 * - a Shaped vessel or the Imperial Priority token counts with the other half of Imperial Priority;
 * - Colour Samples counts with a held Order.
 * Everything else a worker action does (Clay, Wood, Coins, a load, another Tech) cannot open it.
 * Public facts only, the hand count and never a hand, so a wrong "may open" can only be the safe
 * side: the step then has nothing to offer and the turn ends by itself.
 */
export function afterActionMayOpen(view: PlayerView, brings: ActionBrings = {}): boolean {
  if (endTurnOptions(view)?.afterActionWouldOpen === true) {
    return true;
  }
  const viewerId = view.viewerId;
  const p = viewerId === null ? null : seatedPlayer(view.game, viewerId);
  if (viewerId === null || p === null) {
    return false;
  }
  const game = view.game;
  const handCount = lookup(game.counts.orderHands, viewerId) ?? 0;
  if (brings.colourSamples === true && (handCount > 0 || brings.order === true)) {
    return true;
  }
  if (brings.order === true && (ceramicsOf(game, viewerId, "finished").length > 0 || techReady(p, COLOUR_SAMPLES))) {
    return true;
  }
  const kilnEmpty = p.imperial.kilnGained && imperialKilnCeramic(game, viewerId) === null;
  if (brings.vessel === true && p.imperial.priority === "held" && kilnEmpty) {
    return true;
  }
  const reached = IMPERIAL_TRACK.track.find((space) => space.space === brings.recognition);
  return reached?.reward?.kind === "imperial_priority" && kilnEmpty && ceramicsOf(game, viewerId, "shaped").length > 0;
}

/**
 * Imperial Priority now (rev. 5 L174, L314, R10): a free action, usable in any of your free-action
 * windows (before or after your worker action, your Order Phase turn) with the token held, an
 * empty gained Imperial Kiln and a Shaped vessel, which may be any of them. Free: no Wood. Per
 * vessel (§5 gap 16), probed through `validateAction`: its Glazes, Imperial modifiers and
 * Reworking Table Shapes (DESIGN §11 Q1). `kilnMaster`: Kiln Master's marker may go on this load
 * (T24 ready and its marker not on a ceramic still in a kiln, L647, R22, P7).
 */
export function imperialPriorityOptions(view: PlayerView): ImperialPriorityOptions {
  const actor = asActorView(view);
  if (actor === null || !imperialPriorityWindowUsable(view.game, actor.viewerId)) {
    return { usable: false, ceramicIds: [], ceramics: [], kilnMaster: false };
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
  const kilnMaster = kilnMasterOptionFor(view.game, actor.viewerId)?.ready === true;
  return { usable: true, ceramicIds: vessels.map((c) => c.id), ceramics, kilnMaster };
}

// ── Orders (completion pickers, any free-action window) ──────────────────────────────

function finishedPool(game: PublicGameState, playerId: PlayerId): FinishedCeramic[] {
  return ceramicsOf(game, playerId, "finished");
}

/** An `OrderMatchOption` for a matcher result (Ru/Guan/Tribute Ware triggers before any decline,
 * and Canal Barge's automatic 2 Coins). */
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

/** One entry per completable held Order (its first match), in hand order. Phase-agnostic: the
 * UI offers it in every free-action window (`freeActionOptions`). */
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
 * Validator verdicts for a Crackle declaration picker (L484, L499; §5 gap 8). For the selected
 * ceramics of one held Order and the picker's current explicit `declarations`:
 * - `auto`: declarations omitted, the engine searches (the picker's explicit "auto" mode);
 * - `declared`: the declarations exactly as given;
 * - per selected Crackle ceramic, the verdict of declaring each Decoration, and of leaving it
 *   undeclared (its printed Decoration), with the other ceramics' declarations as given.
 * Every verdict is `orderSelectionCheck`, the validator's own matcher, so it agrees with
 * `COMPLETE_ORDER` in the Order Phase.
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

/** The order Contribution cards are offered in: Tend, Bank, Stoke, then Fuel Ledger's 2. */
const CONTRIBUTION_OFFER_ORDER: readonly SubmitContributionCommand["card"][] = ["TEND", "BANK", "STOKE", "FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"];

/**
 * The viewer's Contribution choices while they may submit (v1.6.2 L271, L283–289, L644, change
 * 26): 1 per card they hold, Tend, Bank, Stoke, then Fuel Ledger Bank and Fuel Ledger Stoke when
 * Fuel Ledger is owned, each with its Wood (paid on reveal; a Fuel Ledger owner's Bank and Stoke
 * cost none), Heat and whether it is legal now (`legalContributions`, i.e. `validateContribution`).
 */
export function contributionOptions(view: PlayerView): ContributionOption[] {
  const phase = view.game.phase;
  const viewerId = view.viewerId;
  if (viewerId === null || view.own === null || phase.type !== "firing_contributions" || !phase.eligiblePlayerIds.includes(viewerId)) {
    return [];
  }
  const p = player(view.game, viewerId);
  const legal = legalContributions(view);
  return CONTRIBUTION_OFFER_ORDER.filter((card) => p.contributionCards.includes(card)).map((card) => {
    const command: SubmitContributionCommand = { type: "SUBMIT_CONTRIBUTION", windowId: phase.windowId, card };
    return {
      command,
      woodCost: contributionWood({ card }, ownsTech(p, FUEL_LEDGER)),
      heat: contributionHeat({ card }),
      affordable: legal.some((c) => c.card === card),
    };
  });
}
