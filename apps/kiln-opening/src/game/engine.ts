import {
  DECORATION_COSTS,
  DECORATIONS,
  GAME_CONFIG,
  GLAZES,
  IMPERIAL_PROGRESS,
  KILN_IDS,
  KILN_SPACE_IDS,
  ORDER_DEFINITIONS,
  SHAPE_COSTS,
  SHAPES,
  TECHNIQUE_DEFINITIONS,
  CONTRIBUTION_CARD_IDS,
  activeKilnSpaceIds,
  locationCapacity,
} from "./content.ts";
import { applyFailure, ruleError } from "./errors.ts";
import {
  activeImperialOrderProgressReward,
  activeImperialTrackRules,
} from "./experiment.ts";
import {
  QUALITY_RANK,
  contributionHeatAdjustment,
  contributionWoodCost,
  determineBaseHeat,
  kilnZoneModifier,
  preferredHeat,
  qualityFromDifference,
} from "./firingRules.ts";

/** Fuel Ledger spends this much extra Wood to turn a revealed Stoke into +2 Heat. */
const FUEL_LEDGER_WOOD = 1;

/** Office sale value of one Flawed ceramic. */
const FLAWED_SALE_COINS = 2;

/** Cards discarded from each Order display at the start of Rounds 2-5. */
const ORDER_DISPLAY_ROTATION = 2;

/** Labour pays these Coins; it has no worker limit, so it is always available. */
const LABOUR_APPRENTICE_COINS = 2;
const LABOUR_SHIFU_COINS = 4;

/**
 * Jun pays Wood rather than Coins. Wood is the currency of kiln control in v1.1.4 --
 * Contribution cards and every Firing Technique draw on it -- while Labour made Coins
 * abundant, so a Coin price no longer represented a real choice.
 */
const JUN_ACTIVATION_WOOD = 1;

/** Ge's activation cost, in Wood. */
const GE_ACTIVATION_WOOD = 1;

/** VP Guan scores alongside its Coin stipend on an Imperial Order. */
const GUAN_ORDER_VP = 1;

/** VP paid instead of an Apprentice that unlocks too late in Round 5 to ever act. */
const ROUND_FIVE_UNLOCK_VP = 2;

/** Clay Substitution pays this many Coins for three Clay/Wood in any combination. */
const CLAY_SUBSTITUTION_COINS = 3;
const CLAY_SUBSTITUTION_RESOURCES = 3;
import { RU_ORDER_VP, matchesOrder, ruBonusCeramic } from "./orderRules.ts";
import type { RandomSource } from "./rng.ts";
import { shuffle } from "./rng.ts";
import type { ContributionCardId } from "./types.ts";
import {
  actionOccupancy,
  availableWorkerIds,
  currentDecisionActor,
  emptyActionBoard,
  kilnOccupant,
  orderHandLimit,
  turnOrderFromFirst,
} from "./selectors.ts";
import type {
  ApplyResult,
  BaseHeat,
  CeramicState,
  Decoration,
  GameAction,
  GameEvent,
  GamePhase,
  GameState,
  Glaze,
  KilnId,
  KilnSpaceId,
  LocationId,
  OfficeOrderMode,
  OrderDeck,
  OrderId,
  PlayerId,
  PlayerState,
  FinishedCeramic,
  FinalResult,
  FiringContext,
  PrivateFiringState,
  Quality,
  RoundNumber,
  SubmitContributionResult,
  WoodContribution,
  Shape,
  TechniqueDiscipline,
  TechniqueId,
  WorkerState,
} from "./types.ts";

interface WorkerActionContext {
  player: PlayerState;
  worker: WorkerState;
}

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function success(state: GameState, events: GameEvent[]): ApplyResult {
  state.revision += 1;
  state.eventSequence += events.length;
  return { ok: true, state, events };
}

function actorFailure(state: GameState, actorId: PlayerId): ApplyResult | null {
  if (state.players[actorId] === undefined) {
    return applyFailure(
      ruleError("UNKNOWN_PLAYER", "The acting player is not part of this game.", { actorId }),
    );
  }
  const expectedActorId = currentDecisionActor(state.phase);
  if (expectedActorId !== actorId) {
    return applyFailure(
      ruleError("NOT_ACTIVE_PLAYER", "It is not this player's decision.", {
        actorId,
        expectedActorId: expectedActorId ?? "none",
      }),
    );
  }
  return null;
}

function requirePhase<T extends GamePhase["type"]>(
  state: GameState,
  phaseType: T,
): Extract<GamePhase, { type: T }> | ApplyResult {
  if (state.phase.type !== phaseType) {
    return applyFailure(
      ruleError("WRONG_PHASE", `This action requires phase ${phaseType}.`, {
        actualPhase: state.phase.type,
      }),
    );
  }
  return state.phase as Extract<GamePhase, { type: T }>;
}

function isFailure(value: GamePhase | ApplyResult): value is ApplyResult {
  return "ok" in value;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function ownedTechnique(player: PlayerState, techniqueId: TechniqueId) {
  return player.techniques.find((technique) => technique.id === techniqueId);
}

function validateTechniqueUses(
  player: PlayerState,
  requestedIds: readonly TechniqueId[],
  allowedIds: readonly TechniqueId[],
): ApplyResult | null {
  if (new Set(requestedIds).size !== requestedIds.length) {
    return applyFailure(ruleError("INVALID_SELECTION", "A Technique may be used only once."));
  }
  for (const techniqueId of requestedIds) {
    if (!allowedIds.includes(techniqueId)) {
      return applyFailure(
        ruleError("INVALID_ACTION", "That Technique cannot be used in this action.", {
          techniqueId,
        }),
      );
    }
    const technique = ownedTechnique(player, techniqueId);
    if (technique === undefined) {
      return applyFailure(
        ruleError("TECHNIQUE_NOT_OWNED", "The player does not own that Technique.", {
          techniqueId,
        }),
      );
    }
    if (technique.exhausted) {
      return applyFailure(
        ruleError("TECHNIQUE_EXHAUSTED", "The selected Technique is already exhausted.", {
          techniqueId,
        }),
      );
    }
  }
  return null;
}

function exhaustTechnique(
  player: PlayerState,
  playerId: PlayerId,
  techniqueId: TechniqueId,
  events: GameEvent[],
): void {
  const technique = ownedTechnique(player, techniqueId);
  if (technique === undefined || technique.exhausted) {
    throw new Error("Validated Technique could not be exhausted");
  }
  technique.exhausted = true;
  events.push({ type: "TECHNIQUE_USED", playerId, techniqueId });
}

function gainFromSupply(
  state: GameState,
  player: PlayerState,
  resource: "clay" | "wood" | "coins",
  amount: number,
): number {
  const gained = Math.min(amount, state.commonSupply[resource]);
  player.resources[resource] += gained;
  state.commonSupply[resource] -= gained;
  return gained;
}

function validateWorkerAction(
  state: GameState,
  actorId: PlayerId,
  workerId: string,
  locationId: LocationId,
): WorkerActionContext | ApplyResult {
  const phase = requirePhase(state, "work");
  if (isFailure(phase)) {
    return phase;
  }
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) {
    return actorError;
  }
  const player = state.players[actorId];
  if (player === undefined) {
    return applyFailure(ruleError("UNKNOWN_PLAYER", "Player was not found.", { actorId }));
  }
  if (player.passedWorkPhase) {
    return applyFailure(
      ruleError("PLAYER_ALREADY_PASSED", "Passing is permanent for this Work Phase."),
    );
  }
  const worker = player.workers[workerId];
  if (worker === undefined || worker.status !== "available") {
    return applyFailure(
      ruleError("WORKER_UNAVAILABLE", "The selected worker is not available.", { workerId }),
    );
  }
  const capacity = locationCapacity(locationId, state.playerCount);
  if (actionOccupancy(state, locationId) >= capacity) {
    return applyFailure(
      ruleError("LOCATION_FULL", "The selected location is at capacity.", {
        locationId,
        capacity,
      }),
    );
  }
  return { player, worker };
}

function isWorkerContext(value: WorkerActionContext | ApplyResult): value is WorkerActionContext {
  return "worker" in value;
}

function placeWorker(
  state: GameState,
  actorId: PlayerId,
  workerId: string,
  locationId: LocationId,
  events: GameEvent[],
): WorkerState {
  const player = state.players[actorId];
  const worker = player?.workers[workerId];
  if (player === undefined || worker === undefined) {
    throw new Error("Validated worker disappeared while applying action");
  }
  worker.status = "placed";
  worker.locationId = locationId;
  state.actionBoard.placements[locationId].push(workerId);
  events.push({ type: "WORKER_PLACED", playerId: actorId, workerId, locationId });
  return worker;
}

function beginOrderPhase(state: GameState): void {
  const order = turnOrderFromFirst(state);
  const first = order[0];
  if (first === undefined) throw new Error("Order Phase requires a player");
  state.phase = { type: "orders", turnOrder: order, currentIndex: 0, activePlayerId: first };
}

function openContributionPhase(state: GameState): void {
  const eligiblePlayerIds = turnOrderFromFirst(state).filter((playerId) =>
    Object.values(state.ceramics).some(
      (ceramic) => ceramic.stage === "loaded" && ceramic.ownerId === playerId,
    ),
  );
  state.phase = {
    type: "firing_contributions",
    windowId: `${state.gameId}:round:${state.round}:wood`,
    eligiblePlayerIds,
    submittedPlayerIds: [],
  };
}

function beginFiringPhase(state: GameState): void {
  const loaded = Object.values(state.ceramics).filter((ceramic) => ceramic.stage === "loaded");
  if (loaded.length === 0) {
    beginOrderPhase(state);
    return;
  }
  const hasEmptySpace = activeKilnSpaceIds(state.playerCount).some(
    (spaceId) => kilnOccupant(state, spaceId) === null,
  );
  const actors: PlayerId[] = [];
  const techniqueIds: TechniqueId[] = [];
  for (const playerId of turnOrderFromFirst(state)) {
        const player = state.players[playerId];
    const kilnSetting = player === undefined ? undefined : ownedTechnique(player, "T09");
    if (hasEmptySpace &&
          kilnSetting !== undefined &&
          !kilnSetting.exhausted &&
          loaded.some((ceramic) => ceramic.ownerId === playerId)
    ) {
      actors.push(playerId);
      techniqueIds.push("T09");
    }
    const claySubstitution = player === undefined ? undefined : ownedTechnique(player, "T03");
    if (
          claySubstitution !== undefined &&
          !claySubstitution.exhausted &&
          (player?.resources.coins ?? 0) >= CLAY_SUBSTITUTION_COINS &&
          loaded.some((ceramic) => ceramic.ownerId === playerId)
    ) {
      actors.push(playerId);
      techniqueIds.push("T03");
    }
    const testPieces = player === undefined ? undefined : ownedTechnique(player, "T12");
    if (
          testPieces !== undefined &&
          !testPieces.exhausted &&
          (player?.resources.wood ?? 0) >= 1 &&
          loaded.some((ceramic) => ceramic.ownerId === playerId)
    ) {
      actors.push(playerId);
      techniqueIds.push("T12");
    }
  }
  if (actors.length === 0) {
    openContributionPhase(state);
  } else {
    state.phase = {
      type: "firing_before_contribution",
      queue: { actors, currentIndex: 0 },
      techniqueIds,
    };
  }
}

function completeWorkerAction(
  state: GameState,
  actorId: PlayerId,
  events: GameEvent[],
): void {
  const actorIndex = state.playerOrder.indexOf(actorId);
  if (actorIndex < 0) {
    throw new Error("Acting player disappeared from player order");
  }
  for (let offset = 1; offset <= state.playerOrder.length; offset += 1) {
    const candidateId = state.playerOrder[(actorIndex + offset) % state.playerOrder.length];
    if (candidateId === undefined) {
      continue;
    }
    const candidate = state.players[candidateId];
    if (
      candidate !== undefined &&
      !candidate.passedWorkPhase &&
      availableWorkerIds(candidate).length > 0
    ) {
      state.phase = { type: "work", activePlayerId: candidateId };
      return;
    }
  }
  beginFiringPhase(state);
  events.push({ type: "WORK_PHASE_ENDED" });
}

function drawFromDisplay(
  display: OrderId[],
  deck: OrderId[],
  orderId: OrderId,
): boolean {
  const index = display.indexOf(orderId);
  if (index < 0) {
    return false;
  }
  const replacement = deck.shift();
  if (replacement === undefined) {
    display.splice(index, 1);
  } else {
    display.splice(index, 1, replacement);
  }
  return true;
}

function ensureOrderDeck(state: GameState, deck: OrderDeck, rng: RandomSource): void {
  const drawPile = deck === "market" ? state.marketDeck : state.imperialDeck;
  const discard = deck === "market" ? state.marketDiscard : state.imperialDiscard;
  if (drawPile.length === 0 && discard.length > 0) {
    const reshuffled = shuffle(discard, rng);
    drawPile.push(...reshuffled);
    discard.splice(0, discard.length);
  }
}

function ensureOrderCards(state: GameState, deck: OrderDeck, count: number, rng: RandomSource): boolean {
  ensureOrderDeck(state, deck, rng);
  const drawPile = deck === "market" ? state.marketDeck : state.imperialDeck;
  return drawPile.length >= count;
}

function startWorkPhase(state: GameState): void {
  state.phase = { type: "work", activePlayerId: state.firstPlayerId };
}

function dealStartingOrders(state: GameState): ApplyResult | null {
  const offeredOrderIds: Record<PlayerId, OrderId[]> = {};
  const decisionOrder = turnOrderFromFirst(state);
  for (const playerId of turnOrderFromFirst(state)) {
    const orders = [
      state.marketDeck.shift(),
      state.marketDeck.shift(),
      state.imperialDeck.shift(),
      state.imperialDeck.shift(),
    ];
    const player = state.players[playerId];
    if (orders.some((orderId) => orderId === undefined) || player === undefined) {
      return applyFailure(
        ruleError("SUPPLY_EMPTY", "The Order decks cannot deal all opening Order choices."),
      );
    }
    offeredOrderIds[playerId] = orders as OrderId[];
  }
  state.phase = {
    type: "setup_starting_orders",
    decisionOrder,
    currentIndex: 0,
    offeredOrderIds,
    initialOrderIds: Object.fromEntries(Object.entries(offeredOrderIds).map(([playerId, ids]) => [playerId, ids[0]]).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    submittedPlayerIds: [],
  };
  return null;
}

function advanceStartingOrderDecision(state: GameState): void {
  if (state.phase.type !== "setup_starting_orders") {
    throw new Error("Starting Order decision phase invariant failed");
  }
  const nextIndex = state.phase.currentIndex + 1;
  if (nextIndex >= state.phase.decisionOrder.length) {
    startWorkPhase(state);
  } else {
    state.phase.currentIndex = nextIndex;
  }
}

function selectKiln(state: GameState, actorId: PlayerId, kilnId: KilnId): ApplyResult {
  const phase = requirePhase(state, "setup_kiln_selection");
  if (isFailure(phase)) {
    return phase;
  }
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) {
    return actorError;
  }
  if (!KILN_IDS.includes(kilnId)) {
    return applyFailure(ruleError("KILN_UNAVAILABLE", "The selected Kiln does not exist.", { kilnId }));
  }
  if (Object.values(state.players).some((player) => player.kilnId === kilnId)) {
    return applyFailure(
      ruleError("KILN_UNAVAILABLE", "The selected Kiln has already been chosen.", { kilnId }),
    );
  }

  const next = cloneState(state);
  const player = next.players[actorId];
  if (player === undefined) {
    return applyFailure(ruleError("UNKNOWN_PLAYER", "Player was not found.", { actorId }));
  }
  player.kilnId = kilnId;
  const events: GameEvent[] = [{ type: "KILN_SELECTED", playerId: actorId, kilnId }];
  const nextPhase = next.phase;
  if (nextPhase.type !== "setup_kiln_selection") {
    throw new Error("Kiln selection phase invariant failed");
  }
  nextPhase.currentIndex += 1;
  if (nextPhase.currentIndex >= nextPhase.selectionOrder.length) {
    const failure = dealStartingOrders(next);
    if (failure !== null) {
      return failure;
    }
  }
  return success(next, events);
}

function submitStartingOrders(
  state: GameState,
  actorId: PlayerId,
  orderIds: OrderId[],
  rng: RandomSource,
): ApplyResult {
  const phase = requirePhase(state, "setup_starting_orders");
  if (isFailure(phase)) {
    return phase;
  }
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) {
    return actorError;
  }
  const offered = phase.offeredOrderIds[actorId];
  if (
    offered === undefined ||
    orderIds.length !== 2 ||
    new Set(orderIds).size !== 2 ||
    orderIds.some((orderId) => !offered.includes(orderId))
  ) {
    return applyFailure(
      ruleError("INVALID_SELECTION", "Keep exactly two of the four offered opening Orders."),
    );
  }
  const next = cloneState(state);
  const player = next.players[actorId];
  const nextPhase = next.phase;
  if (player === undefined || nextPhase.type !== "setup_starting_orders") {
    throw new Error("Starting Order selection invariant failed");
  }
  player.orderHand = [...orderIds];
  nextPhase.submittedPlayerIds.push(actorId);
  advanceStartingOrderDecision(next);
  const events: GameEvent[] = [{ type: "STARTING_ORDERS_SUBMITTED", playerId: actorId }];
  if (next.phase.type === "work") {
    for (const [selectionPlayerId, offeredOrders] of Object.entries(nextPhase.offeredOrderIds)) {
      const kept = next.players[selectionPlayerId]?.orderHand ?? [];
      for (const returned of offeredOrders.filter((orderId) => !kept.includes(orderId))) {
        if (returned.startsWith("M")) next.marketDeck.push(returned);
        else next.imperialDeck.push(returned);
      }
    }
    next.marketDeck = shuffle(next.marketDeck, rng);
    next.imperialDeck = shuffle(next.imperialDeck, rng);
    events.push({
      type: "STARTING_ORDERS_REVEALED",
      ordersByPlayer: Object.fromEntries(
        Object.entries(next.players).map(([playerId, entry]) => [playerId, [...entry.orderHand]]),
      ),
    });
  }
  return success(next, events);
}

function submitLegacyStartingOrders(state: GameState, actorId: PlayerId, rng: RandomSource): ApplyResult {
  if (state.phase.type !== "setup_starting_orders") {
    return applyFailure(ruleError("WRONG_PHASE", "Opening Orders are not awaiting a choice."));
  }
  const offered = state.phase.offeredOrderIds[actorId];
  if (offered === undefined || offered.length < 2) {
    return applyFailure(ruleError("INVALID_ACTION", "Opening Order offer is unavailable."));
  }
  return submitStartingOrders(state, actorId, offered.slice(0, 2), rng);
}

function passWorkPhase(state: GameState, actorId: PlayerId): ApplyResult {
  const phase = requirePhase(state, "work");
  if (isFailure(phase)) {
    return phase;
  }
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) {
    return actorError;
  }
  const next = cloneState(state);
  const player = next.players[actorId];
  if (player === undefined) {
    return applyFailure(ruleError("UNKNOWN_PLAYER", "Player was not found.", { actorId }));
  }
  if (player.passedWorkPhase) {
    return applyFailure(
      ruleError("PLAYER_ALREADY_PASSED", "Passing is permanent for this Work Phase."),
    );
  }
  player.passedWorkPhase = true;
  const events: GameEvent[] = [{ type: "PLAYER_PASSED", playerId: actorId }];
  completeWorkerAction(next, actorId, events);
  return success(next, events);
}

function gainMaterials(
  state: GameState,
  actorId: PlayerId,
  action: Extract<GameAction, { type: "GAIN_MATERIALS" }>,
): ApplyResult {
  const { workerId, clay, wood, exchange } = action;
  const context = validateWorkerAction(state, actorId, workerId, "materials_yard");
  if (!isWorkerContext(context)) {
    return context;
  }
  const amount = context.worker.kind === "shifu" ? 4 : 3;
  if (!isNonNegativeInteger(clay) || !isNonNegativeInteger(wood) || clay + wood !== amount) {
    return applyFailure(
      ruleError("INVALID_SELECTION", `Choose exactly ${amount} total Clay and Wood.`, {
        clay,
        wood,
      }),
    );
  }
  if (
    exchange !== undefined &&
    (context.worker.kind !== "shifu" ||
      !isNonNegativeInteger(exchange.amount) ||
      exchange.amount < 1)
  ) {
    return applyFailure(ruleError("INVALID_SELECTION", "Only the Shifu may exchange a positive number of Clay and Wood."));
  }

  const next = cloneState(state);
  const events: GameEvent[] = [];
  placeWorker(next, actorId, workerId, "materials_yard", events);
  const player = next.players[actorId];
  if (player === undefined) {
    throw new Error("Materials actor disappeared");
  }
  const gainedClay = Math.min(clay, next.commonSupply.clay);
  const gainedWood = Math.min(wood, next.commonSupply.wood);
  player.resources.clay += gainedClay;
  player.resources.wood += gainedWood;
  next.commonSupply.clay -= gainedClay;
  next.commonSupply.wood -= gainedWood;
  let clayDelta = gainedClay;
  let woodDelta = gainedWood;
  if (exchange !== undefined) {
    const give = exchange.give;
    const receive = give === "clay" ? "wood" : "clay";
    const availableToGive = player.resources[give];
    const availableToReceive = next.commonSupply[receive];
    if (availableToGive < exchange.amount || availableToReceive < exchange.amount) {
      return applyFailure(ruleError("INSUFFICIENT_RESOURCES", "The selected Shifu material exchange cannot be completed."));
    }
    player.resources[give] -= exchange.amount;
    next.commonSupply[give] += exchange.amount;
    player.resources[receive] += exchange.amount;
    next.commonSupply[receive] -= exchange.amount;
    clayDelta += give === "clay" ? -exchange.amount : exchange.amount;
    woodDelta += give === "wood" ? -exchange.amount : exchange.amount;
  }
  events.push({
    type: "RESOURCES_CHANGED",
    playerId: actorId,
    clay: clayDelta,
    wood: woodDelta,
    coins: 0,
  });
  completeWorkerAction(next, actorId, events);
  return success(next, events);
}

function formCeramics(
  state: GameState,
  actorId: PlayerId,
  action: Extract<GameAction, { type: "FORM_CERAMICS" }>,
): ApplyResult {
  const context = validateWorkerAction(state, actorId, action.workerId, "forming_studio");
  if (!isWorkerContext(context)) {
    return context;
  }
  const maximum = context.worker.kind === "shifu" ? 2 : 1;
  if (action.shapes.length > maximum || action.shapes.some((shape) => !SHAPES.includes(shape))) {
    return applyFailure(
      ruleError("INVALID_SELECTION", `This worker may form at most ${maximum} ceramics.`),
    );
  }
  const useTechniqueIds = action.useTechniqueIds ?? [];
  const techniqueFailure = validateTechniqueUses(
    context.player,
    useTechniqueIds,
    ["T01", "T02", "T03", "T04"],
  );
  if (techniqueFailure !== null) return techniqueFailure;

  const dingExtraShape = action.dingExtraShape;
  if (dingExtraShape !== undefined) {
    if (
      context.player.kilnId !== "DI" ||
      context.player.kilnAbilityUsedThisRound ||
      !(["bowl", "plate", "washer"] as Shape[]).includes(dingExtraShape) ||
      !action.shapes.includes(dingExtraShape)
    ) {
      return applyFailure(
        ruleError(
          "INVALID_ACTION",
          "Ding may add one matching Bowl, Plate, or Washer once per round.",
        ),
      );
    }
  }
  const substitutions = action.claySubstitutions ?? (action.claySubstitutionTarget === undefined ? 0 : 1);
  const usesSubstitution = useTechniqueIds.includes("T03");
  if (
    !isNonNegativeInteger(substitutions) ||
    usesSubstitution !== (substitutions > 0)
  ) {
    return applyFailure(
      ruleError("INVALID_ACTION", "Clay Substitution must match the number of Clay replaced by Coins."),
    );
  }
  const allFormedShapes =
    dingExtraShape === undefined ? [...action.shapes] : [...action.shapes, dingExtraShape];
  if (
    useTechniqueIds.includes("T01") &&
    !allFormedShapes.some((shape) => shape === "vase" || shape === "censer")
  ) {
    return applyFailure(
      ruleError("INVALID_ACTION", "Large Throwing Wheel requires forming a Vase or Censer."),
    );
  }
  if (useTechniqueIds.includes("T02") && new Set(allFormedShapes).size < 2) {
    return applyFailure(
      ruleError("INVALID_ACTION", "Measuring Calipers requires two different Shapes."),
    );
  }
  if (useTechniqueIds.includes("T04") !== (action.dryingFrames !== undefined)) {
    return applyFailure(ruleError("INVALID_ACTION", "Drying Frames requires one newly formed vessel and a Glaze."));
  }
  if (
    action.dryingFrames !== undefined &&
    (action.dryingFrames.formedIndex < 0 ||
      action.dryingFrames.formedIndex >= allFormedShapes.length ||
      !GLAZES.includes(action.dryingFrames.glaze))
  ) {
    return applyFailure(ruleError("INVALID_SELECTION", "The Drying Frames selection is invalid."));
  }

  const requiredByShape = new Map<Shape, number>();
  let totalClay = 0;
  for (const shape of allFormedShapes) {
    requiredByShape.set(shape, (requiredByShape.get(shape) ?? 0) + 1);
  }
  // Ding's extra vessel is free: the cost loop covers only the vessels the action formed.
  // Measured against charging for it, both settle inside their intervals -- free lands
  // Ding 2.0 points above fair share, charging lands it 2.2 below -- so this is a design
  // call, not a balance one. Free is chosen because the ability then fires 2.31 times a
  // game rather than 1.49, which is what makes it feel like a tradition rather than a
  // rounding error. `src/ai/evaluator.ts` must match: it charges the same set.
  for (const shape of action.shapes) {
    totalClay +=
      context.worker.kind === "shifu" && (shape === "vase" || shape === "censer")
        ? 1
        : SHAPE_COSTS[shape];
  }
  if (substitutions > totalClay) {
    return applyFailure(ruleError("INVALID_SELECTION", "Clay Substitution exceeds the Forming cost."));
  }
  const clayPaid = totalClay - substitutions;
  const coinsPaid = substitutions;
  if (context.player.resources.clay < clayPaid || context.player.resources.coins < coinsPaid) {
    return applyFailure(
      ruleError("INSUFFICIENT_RESOURCES", "Not enough resources to form the selected vessels.", {
        requiredClay: clayPaid,
        requiredCoins: coinsPaid,
      }),
    );
  }
  for (const [shape, count] of requiredByShape) {
    if (state.vesselSupply[shape].length < count) {
      return applyFailure(
        ruleError("SUPPLY_EMPTY", "The selected Vessel supply is too low.", { shape, count }),
      );
    }
  }

  const next = cloneState(state);
  const events: GameEvent[] = [];
  placeWorker(next, actorId, action.workerId, "forming_studio", events);
  const player = next.players[actorId];
  if (player === undefined) {
    throw new Error("Forming actor disappeared");
  }
  player.resources.clay -= clayPaid;
  next.commonSupply.clay += clayPaid;
  player.resources.coins -= coinsPaid;
  next.commonSupply.coins += coinsPaid;
  if (clayPaid > 0 || coinsPaid > 0) {
    events.push({
      type: "RESOURCES_CHANGED",
      playerId: actorId,
      clay: -clayPaid,
      wood: 0,
      coins: -coinsPaid,
    });
  }
  for (const [formedIndex, shape] of allFormedShapes.entries()) {
    const vesselInstanceId = next.vesselSupply[shape].shift();
    if (vesselInstanceId === undefined) {
      throw new Error("Validated Vessel supply became empty");
    }
    const ceramicId = `${next.gameId}:ceramic:${next.nextCeramicSequence}`;
    next.nextCeramicSequence += 1;
    const dryingFrames = action.dryingFrames;
    const dryingFramesApplies = dryingFrames?.formedIndex === formedIndex;
    next.ceramics[ceramicId] = dryingFramesApplies ? {
      id: ceramicId,
      vesselInstanceId,
      ownerId: actorId,
      shape,
      stage: "glazed",
      glaze: dryingFrames?.glaze ?? "white",
      decoration: "plain",
    } : {
      id: ceramicId,
      vesselInstanceId,
      ownerId: actorId,
      shape,
      stage: "shaped",
    };
    events.push({ type: "CERAMIC_SHAPED", playerId: actorId, ceramicId, shape });
    if (dryingFramesApplies) {
      events.push({
        type: "CERAMIC_GLAZED",
        playerId: actorId,
        ceramicId,
        glaze: dryingFrames?.glaze ?? "white",
        decoration: "plain",
      });
    }
  }
  for (const techniqueId of useTechniqueIds) {
    if (techniqueId !== "T03") exhaustTechnique(player, actorId, techniqueId, events);
  }
  if (dingExtraShape !== undefined) {
    player.kilnAbilityUsedThisRound = true;
    events.push({ type: "KILN_ABILITY_USED", playerId: actorId, kilnId: "DI" });
  }
  const rewardClay =
    (useTechniqueIds.includes("T01") ? gainFromSupply(next, player, "clay", 1) : 0) +
    (useTechniqueIds.includes("T02") ? gainFromSupply(next, player, "clay", 1) : 0);
  const rewardCoins = useTechniqueIds.includes("T02") ? gainFromSupply(next, player, "coins", 1) : 0;
  if (rewardClay > 0 || rewardCoins > 0) {
    events.push({
      type: "RESOURCES_CHANGED",
      playerId: actorId,
      clay: rewardClay,
      wood: 0,
      coins: rewardCoins,
    });
  }
  completeWorkerAction(next, actorId, events);
  return success(next, events);
}

function glazeCeramics(
  state: GameState,
  actorId: PlayerId,
  action: Extract<GameAction, { type: "GLAZE_CERAMICS" }>,
): ApplyResult {
  const context = validateWorkerAction(state, actorId, action.workerId, "glaze_workshop");
  if (!isWorkerContext(context)) {
    return context;
  }
  const freeDecorationCeramicId = action.freeDecorationCeramicId ??
    (action.shifuMode === "free_single" ? action.selections[0]?.ceramicId : undefined);
  if (context.worker.kind === "apprentice" && freeDecorationCeramicId !== undefined) {
    return applyFailure(
      ruleError("INVALID_ACTION", "Only the Shifu may make one selected Decoration free."),
    );
  }
  const maximum = context.worker.kind === "shifu" ? 2 : 1;
  if (action.selections.length > maximum) {
    return applyFailure(
      ruleError("INVALID_SELECTION", `This mode may glaze at most ${maximum} ceramics.`),
    );
  }
  const ceramicIds = action.selections.map((selection) => selection.ceramicId);
  if (new Set(ceramicIds).size !== ceramicIds.length) {
    return applyFailure(ruleError("INVALID_SELECTION", "A ceramic may be selected only once."));
  }
  const useTechniqueIds = action.useTechniqueIds ?? [];
  const techniqueFailure = validateTechniqueUses(
    context.player,
    useTechniqueIds,
    ["T05", "T06"],
  );
  if (techniqueFailure !== null) return techniqueFailure;
  if (
    freeDecorationCeramicId !== undefined &&
    !ceramicIds.includes(freeDecorationCeramicId)
  ) {
    return applyFailure(ruleError("INVALID_SELECTION", "The free Shifu Decoration must be one of the selected ceramics."));
  }
  const hasCarved = action.selections.some((selection) => selection.decoration === "carved" && selection.ceramicId !== freeDecorationCeramicId);
  const hasImpressed = action.selections.some((selection) => selection.decoration === "impressed" && selection.ceramicId !== freeDecorationCeramicId);
  if (
    useTechniqueIds.includes("T05") &&
    !hasCarved
  ) {
    return applyFailure(
      ruleError("INVALID_ACTION", "Carving Knives requires a paid Carved Decoration."),
    );
  }
  if (
    useTechniqueIds.includes("T06") &&
    !hasImpressed
  ) {
    return applyFailure(
      ruleError("INVALID_ACTION", "Seal Stamps requires a paid Impressed Decoration."),
    );
  }
  let totalCoins = 0;
  for (const selection of action.selections) {
    if (!GLAZES.includes(selection.glaze) || !DECORATIONS.includes(selection.decoration)) {
      return applyFailure(
        ruleError("INVALID_SELECTION", "The selected Glaze or Decoration does not exist."),
      );
    }
    const ceramic = state.ceramics[selection.ceramicId];
    if (ceramic === undefined) {
      return applyFailure(
        ruleError("CERAMIC_NOT_FOUND", "A selected ceramic does not exist.", {
          ceramicId: selection.ceramicId,
        }),
      );
    }
    if (ceramic.ownerId !== actorId || ceramic.stage !== "shaped") {
      return applyFailure(
        ruleError(
          "ILLEGAL_CERAMIC_STAGE",
          "Only the acting player's Shaped ceramics may be glazed.",
          { ceramicId: selection.ceramicId },
        ),
      );
    }
    if (selection.ceramicId !== freeDecorationCeramicId) {
      totalCoins += DECORATION_COSTS[selection.decoration];
    }
  }
  if (useTechniqueIds.includes("T05")) totalCoins -= DECORATION_COSTS.carved;
  if (useTechniqueIds.includes("T06")) totalCoins -= DECORATION_COSTS.impressed;
  if (context.player.resources.coins < totalCoins) {
    return applyFailure(
      ruleError("INSUFFICIENT_RESOURCES", "Not enough Coins for the selected Decorations.", {
        requiredCoins: totalCoins,
      }),
    );
  }

  const next = cloneState(state);
  const events: GameEvent[] = [];
  placeWorker(next, actorId, action.workerId, "glaze_workshop", events);
  const player = next.players[actorId];
  if (player === undefined) {
    throw new Error("Glazing actor disappeared");
  }
  player.resources.coins -= totalCoins;
  next.commonSupply.coins += totalCoins;
  if (totalCoins > 0) {
    events.push({
      type: "RESOURCES_CHANGED",
      playerId: actorId,
      clay: 0,
      wood: 0,
      coins: -totalCoins,
    });
  }
  for (const selection of action.selections) {
    const ceramic = next.ceramics[selection.ceramicId];
    if (ceramic === undefined || ceramic.stage !== "shaped") {
      throw new Error("Validated Shaped ceramic disappeared");
    }
    next.ceramics[selection.ceramicId] = {
      ...ceramic,
      stage: "glazed",
      glaze: selection.glaze,
      decoration: selection.decoration,
    };
    events.push({
      type: "CERAMIC_GLAZED",
      playerId: actorId,
      ceramicId: selection.ceramicId,
      glaze: selection.glaze,
      decoration: selection.decoration,
    });
  }
  for (const techniqueId of useTechniqueIds) {
    exhaustTechnique(player, actorId, techniqueId, events);
  }
  completeWorkerAction(next, actorId, events);
  return success(next, events);
}

function useKilnYard(
  state: GameState,
  actorId: PlayerId,
  action: Extract<GameAction, { type: "USE_KILN_YARD" }>,
): ApplyResult {
  const context = validateWorkerAction(state, actorId, action.workerId, "kiln_yard");
  if (!isWorkerContext(context)) {
    return context;
  }
  const maximum = context.worker.kind === "shifu" ? 2 : 1;
  if (action.loads.length < 1 || action.loads.length > maximum) {
    return applyFailure(
      ruleError(
        "INVALID_SELECTION",
        context.worker.kind === "shifu"
          ? "A Shifu must load one or two ceramics."
          : "An Apprentice must load exactly one ceramic.",
      ),
    );
  }
  const ceramicIds = action.loads.map((load) => load.ceramicId);
  const spaceIds = action.loads.map((load) => load.kilnSpaceId);
  if (
    new Set(ceramicIds).size !== ceramicIds.length ||
    new Set(spaceIds).size !== spaceIds.length
  ) {
    return applyFailure(
      ruleError("INVALID_SELECTION", "Ceramics and kiln spaces may be selected only once."),
    );
  }
  for (const load of action.loads) {
    if (!KILN_SPACE_IDS.includes(load.kilnSpaceId)) {
      return applyFailure(
        ruleError("INVALID_SELECTION", "The selected kiln space does not exist.", {
          kilnSpaceId: load.kilnSpaceId,
        }),
      );
    }
    if (!activeKilnSpaceIds(state.playerCount).includes(load.kilnSpaceId)) {
      return applyFailure(
        ruleError("INVALID_SELECTION", "The selected kiln space is covered at this player count.", {
          kilnSpaceId: load.kilnSpaceId,
          playerCount: state.playerCount,
        }),
      );
    }
    if (kilnOccupant(state, load.kilnSpaceId) !== null) {
      return applyFailure(
        ruleError("KILN_SPACE_OCCUPIED", "The selected kiln space is occupied.", {
          kilnSpaceId: load.kilnSpaceId,
        }),
      );
    }
    const ceramic = state.ceramics[load.ceramicId];
    if (ceramic === undefined) {
      return applyFailure(
        ruleError("CERAMIC_NOT_FOUND", "A selected ceramic does not exist.", {
          ceramicId: load.ceramicId,
        }),
      );
    }
    if (ceramic.ownerId !== actorId || ceramic.stage !== "glazed") {
      return applyFailure(
        ruleError(
          "ILLEGAL_CERAMIC_STAGE",
          "Only the acting player's Glazed ceramics may be loaded.",
          { ceramicId: load.ceramicId },
        ),
      );
    }
  }

  const next = cloneState(state);
  const events: GameEvent[] = [];
  placeWorker(next, actorId, action.workerId, "kiln_yard", events);
  for (const load of action.loads) {
    const ceramic = next.ceramics[load.ceramicId];
    if (ceramic === undefined || ceramic.stage !== "glazed") {
      throw new Error("Validated Glazed ceramic disappeared");
    }
    next.ceramics[load.ceramicId] = {
      ...ceramic,
      stage: "loaded",
      kilnSpaceId: load.kilnSpaceId,
    };
    events.push({
      type: "CERAMIC_LOADED",
      playerId: actorId,
      ceramicId: load.ceramicId,
      kilnSpaceId: load.kilnSpaceId,
    });
  }
  const player = next.players[actorId];
  if (player === undefined) throw new Error("Kiln Yard actor disappeared");
  completeWorkerAction(next, actorId, events);
  return success(next, events);
}

/**
 * Labour: an uncapped action that converts a worker into Coins. Apprentices earn 2 and a
 * Shifu 4, the same rates the Office used to pay, but without competing for a space.
 */
function useLabour(state: GameState, actorId: PlayerId, workerId: string): ApplyResult {
  const context = validateWorkerAction(
    state,
    actorId,
    workerId,
    "labour",
  );
  if (!isWorkerContext(context)) {
    return context;
  }
  const amount = context.worker.kind === "shifu" ? LABOUR_SHIFU_COINS : LABOUR_APPRENTICE_COINS;
  const next = cloneState(state);
  const events: GameEvent[] = [];
  placeWorker(next, actorId, workerId, "labour", events);
  const player = next.players[actorId];
  if (player === undefined) {
    throw new Error("Labour actor disappeared");
  }
  const gained = Math.min(amount, next.commonSupply.coins);
  player.resources.coins += gained;
  next.commonSupply.coins -= gained;
  events.push({
    type: "RESOURCES_CHANGED",
    playerId: actorId,
    clay: 0,
    wood: 0,
    coins: gained,
  });
  completeWorkerAction(next, actorId, events);
  return success(next, events);
}

function resolveOfficeFlawedSale(
  state: GameState,
  actorId: PlayerId,
  ceramicIds: string[],
): ApplyResult {
  const phase = requirePhase(state, "work_office_sale");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  const player = state.players[actorId];
  const worker = player?.workers[phase.workerId];
  if (
    player === undefined ||
    worker === undefined ||
    worker.status !== "placed" ||
    worker.locationId !== "market_imperial_office"
  ) {
    return applyFailure(ruleError("INVALID_ACTION", "The Office sale step has no placed worker."));
  }
  if (new Set(ceramicIds).size !== ceramicIds.length) {
    return applyFailure(ruleError("INVALID_SELECTION", "A ceramic may be sold only once."));
  }
  const saleLimit = worker.kind === "shifu" ? 2 : 1;
  if (ceramicIds.length > saleLimit) {
    return applyFailure(
      ruleError(
        "INVALID_SELECTION",
        worker.kind === "shifu"
          ? "A Shifu may sell at most two Flawed ceramics."
          : "An Apprentice may sell at most one Flawed ceramic.",
      ),
    );
  }
  if (ceramicIds.length * FLAWED_SALE_COINS > state.commonSupply.coins) {
    return applyFailure(
      ruleError(
        "SUPPLY_EMPTY",
        "The common supply must contain 1 Coin for every sold ceramic.",
        { requested: ceramicIds.length * FLAWED_SALE_COINS, available: state.commonSupply.coins },
      ),
    );
  }
  for (const ceramicId of ceramicIds) {
    const ceramic = state.ceramics[ceramicId];
    if (ceramic === undefined) {
      return applyFailure(
        ruleError("CERAMIC_NOT_FOUND", "A selected ceramic does not exist.", { ceramicId }),
      );
    }
    if (
      ceramic.ownerId !== actorId ||
      ceramic.stage !== "finished" ||
      ceramic.quality !== "flawed"
    ) {
      return applyFailure(
        ruleError(
          "ILLEGAL_CERAMIC_STAGE",
          "Only the acting player's Finished Flawed ceramics may be sold.",
          { ceramicId },
        ),
      );
    }
  }

  const next = cloneState(state);
  const events: GameEvent[] = [];
  const nextPlayer = next.players[actorId];
  if (nextPlayer === undefined) {
    throw new Error("Office actor disappeared");
  }
  for (const ceramicId of ceramicIds) {
    const ceramic = next.ceramics[ceramicId];
    if (ceramic === undefined || ceramic.stage !== "finished") {
      throw new Error("Validated Flawed ceramic disappeared");
    }
    next.vesselSupply[ceramic.shape].push(ceramic.vesselInstanceId);
    next.ceramics[ceramicId] = {
      id: ceramic.id,
      vesselInstanceId: ceramic.vesselInstanceId,
      ownerId: ceramic.ownerId,
      shape: ceramic.shape,
      stage: "sold",
      soldInRound: next.round,
    };
    events.push({ type: "CERAMIC_SOLD", playerId: actorId, ceramicId });
  }
  // v1.1.4 Office sale: a Flawed ceramic is worth 2 Coins.
  const gainedCoins = ceramicIds.length * FLAWED_SALE_COINS;
  nextPlayer.resources.coins += gainedCoins;
  next.commonSupply.coins -= gainedCoins;
  if (gainedCoins > 0) {
    events.push({
      type: "RESOURCES_CHANGED",
      playerId: actorId,
      clay: 0,
      wood: 0,
      coins: gainedCoins,
    });
  }
  const connoisseur = ownedTechnique(nextPlayer, "T14");
  const canUseConnoisseur =
    connoisseur !== undefined &&
    !connoisseur.exhausted &&
    Object.values(next.ceramics).some(
      (ceramic) =>
        ceramic.ownerId === actorId &&
        ceramic.stage === "finished" &&
        ceramic.quality !== "flawed" &&
        next.commonSupply.coins >= (ceramic.quality === "masterpiece" ? 7 : ceramic.quality === "fine" ? 4 : 2),
    );
  if (canUseConnoisseur) {
    next.phase = { type: "work_office_connoisseur", actorId, workerId: phase.workerId };
  } else {
    completeWorkerAction(next, actorId, events);
  }
  return success(next, events);
}

function resolveConnoisseurNetwork(
  state: GameState,
  actorId: PlayerId,
  ceramicId: string | null,
): ApplyResult {
  const phase = requirePhase(state, "work_office_connoisseur");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  const player = state.players[actorId];
  const technique = player === undefined ? undefined : ownedTechnique(player, "T14");
  if (player === undefined || technique === undefined || technique.exhausted) {
    return applyFailure(ruleError("TECHNIQUE_EXHAUSTED", "Connoisseur Network is unavailable."));
  }
  if (ceramicId !== null) {
    const ceramic = state.ceramics[ceramicId];
    if (
      ceramic === undefined ||
      ceramic.ownerId !== actorId ||
      ceramic.stage !== "finished" ||
      ceramic.quality === "flawed"
    ) {
      return applyFailure(
        ruleError(
          "ILLEGAL_CERAMIC_STAGE",
          "Connoisseur Network requires one owned Finished undelivered non-Flawed ceramic.",
          { ceramicId },
        ),
      );
    }
    const saleCoins = ceramic.quality === "masterpiece" ? 10 : ceramic.quality === "fine" ? 6 : 3;
    if (state.commonSupply.coins < saleCoins) {
      return applyFailure(
        ruleError("SUPPLY_EMPTY", "The common supply cannot pay the selected ceramic sale."),
      );
    }
  }

  const next = cloneState(state);
  const events: GameEvent[] = [];
  const nextPlayer = next.players[actorId];
  if (nextPlayer === undefined) throw new Error("Connoisseur actor disappeared");
  if (ceramicId !== null) {
    const ceramic = next.ceramics[ceramicId];
    if (ceramic === undefined || ceramic.stage !== "finished") {
      throw new Error("Validated Connoisseur ceramic disappeared");
    }
    next.vesselSupply[ceramic.shape].push(ceramic.vesselInstanceId);
    next.ceramics[ceramicId] = {
      id: ceramic.id,
      vesselInstanceId: ceramic.vesselInstanceId,
      ownerId: ceramic.ownerId,
      shape: ceramic.shape,
      stage: "sold",
      soldInRound: next.round,
    };
    const saleCoins = ceramic.quality === "masterpiece" ? 10 : ceramic.quality === "fine" ? 6 : 3;
    nextPlayer.resources.coins += saleCoins;
    next.commonSupply.coins -= saleCoins;
    exhaustTechnique(nextPlayer, actorId, "T14", events);
    events.push(
      { type: "CERAMIC_SOLD", playerId: actorId, ceramicId },
      { type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: 0, coins: saleCoins },
    );
  }
  completeWorkerAction(next, actorId, events);
  return success(next, events);
}

function validOfficeMode(worker: WorkerState, mode: OfficeOrderMode): boolean {
  if (worker.kind === "apprentice") {
    return mode === "take_one";
  }
  return mode === "take_up_to_two" || mode === "take_one_and_gain_two_coins";
}

function beginOfficeOrders(
  state: GameState,
  actorId: PlayerId,
  workerId: string,
  mode: OfficeOrderMode,
): ApplyResult {
  const context = validateWorkerAction(
    state,
    actorId,
    workerId,
    "market_imperial_office",
  );
  if (!isWorkerContext(context)) {
    return context;
  }
  if (!validOfficeMode(context.worker, mode)) {
    return applyFailure(
      ruleError("INVALID_ACTION", "The selected worker cannot use that Office Order mode."),
    );
  }
  const hasOrderSource =
    state.marketDisplay.length +
      state.imperialDisplay.length +
      state.marketDeck.length +
      state.imperialDeck.length +
      state.marketDiscard.length +
      state.imperialDiscard.length >
    0;
  if (mode !== "take_up_to_two") {
    if (!hasOrderSource) {
      return applyFailure(ruleError("ORDER_NOT_AVAILABLE", "No Order source is available."));
    }
  }

  const next = cloneState(state);
  const events: GameEvent[] = [];
  placeWorker(next, actorId, workerId, "market_imperial_office", events);
  next.phase = {
    type: "work_office_orders",
    actorId,
    workerId,
    mode,
    remainingTakes: mode === "take_up_to_two" ? 2 : 1,
    ordersTaken: 0,
    step:
      ownedTechnique(context.player, "T08") !== undefined &&
      !ownedTechnique(context.player, "T08")?.exhausted &&
      hasOrderSource &&
      state.marketDeck.length + state.marketDiscard.length + state.imperialDeck.length + state.imperialDiscard.length >= 2
        ? "colour_samples_or_skip"
        : "take_or_end",
    colourSamplesUsed: false,
  };
  return success(next, events);
}

function finishOfficeOrderAcquisition(
  state: GameState,
  actorId: PlayerId,
  events: GameEvent[],
): void {
  if (state.phase.type !== "work_office_orders") {
    throw new Error("Office Order phase invariant failed");
  }
  if (state.phase.remainingTakes > 0) return;
  const player = state.players[actorId];
  if (player === undefined) throw new Error("Office actor disappeared");
  if (state.phase.mode === "take_one_and_gain_two_coins") {
    const gainedCoins = gainFromSupply(state, player, "coins", 2);
    events.push({
      type: "RESOURCES_CHANGED",
      playerId: actorId,
      clay: 0,
      wood: 0,
      coins: gainedCoins,
    });
  }
  state.phase = { type: "work_office_sale", actorId, workerId: state.phase.workerId };
}

function takeOfficeOrder(state: GameState, actorId: PlayerId, orderId: OrderId, rng: RandomSource): ApplyResult {
  const phase = requirePhase(state, "work_office_orders");
  if (isFailure(phase)) {
    return phase;
  }
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) {
    return actorError;
  }
  const player = state.players[actorId];
  if (player === undefined) {
    return applyFailure(ruleError("UNKNOWN_PLAYER", "Player was not found.", { actorId }));
  }
  if (phase.remainingTakes <= 0) {
    return applyFailure(ruleError("INVALID_ACTION", "This Office action has no Order take left."));
  }
  if (phase.step !== "take_or_end") {
    return applyFailure(
      ruleError("INVALID_ACTION", "Resolve the Colour Samples choice before taking an Order."),
    );
  }
  const deck = state.marketDisplay.includes(orderId)
    ? "market"
    : state.imperialDisplay.includes(orderId)
      ? "imperial"
      : null;
  if (deck === null) {
    return applyFailure(
      ruleError("ORDER_NOT_AVAILABLE", "The selected Order is not face-up.", { orderId }),
    );
  }

  const next = cloneState(state);
  ensureOrderDeck(next, deck, rng);
  const nextPhase = next.phase;
  const nextPlayer = next.players[actorId];
  if (nextPhase.type !== "work_office_orders" || nextPlayer === undefined) {
    throw new Error("Office Order phase invariant failed");
  }
  const drawn =
    deck === "market"
      ? drawFromDisplay(next.marketDisplay, next.marketDeck, orderId)
      : drawFromDisplay(next.imperialDisplay, next.imperialDeck, orderId);
  if (!drawn) {
    throw new Error("Validated face-up Order disappeared");
  }
  nextPlayer.orderHand.push(orderId);
  nextPhase.remainingTakes = (nextPhase.remainingTakes - 1) as 0 | 1 | 2;
  nextPhase.ordersTaken += 1;
  const events: GameEvent[] = [
    { type: "ORDER_TAKEN", playerId: actorId, orderId, deck, acquisition: "face_up" },
  ];
  finishOfficeOrderAcquisition(next, actorId, events);
  return success(next, events);
}

function drawBlindOfficeOrder(
  state: GameState,
  actorId: PlayerId,
  deck: OrderDeck,
  rng: RandomSource,
): ApplyResult {
  const phase = requirePhase(state, "work_office_orders");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  const player = state.players[actorId];
  if (player === undefined) {
    return applyFailure(ruleError("UNKNOWN_PLAYER", "Player was not found.", { actorId }));
  }
  if (phase.remainingTakes <= 0) {
    return applyFailure(ruleError("INVALID_ACTION", "This Office action has no Order take left."));
  }
  if (phase.step !== "take_or_end") {
    return applyFailure(
      ruleError("INVALID_ACTION", "Resolve the Colour Samples choice before drawing an Order."),
    );
  }
  const available = (deck === "market" ? state.marketDeck.length + state.marketDiscard.length : state.imperialDeck.length + state.imperialDiscard.length);
  if (available === 0) {
    return applyFailure(
      ruleError("ORDER_NOT_AVAILABLE", `The ${deck} deck is empty.`, { deck }),
    );
  }

  const next = cloneState(state);
  ensureOrderDeck(next, deck, rng);
  const nextPhase = next.phase;
  const nextPlayer = next.players[actorId];
  if (nextPhase.type !== "work_office_orders" || nextPlayer === undefined) {
    throw new Error("Office blind-draw phase invariant failed");
  }
  const orderId = (deck === "market" ? next.marketDeck : next.imperialDeck).shift();
  if (orderId === undefined) throw new Error("Validated blind Order disappeared");
  nextPlayer.orderHand.push(orderId);
  nextPhase.remainingTakes = (nextPhase.remainingTakes - 1) as 0 | 1 | 2;
  nextPhase.ordersTaken += 1;
  const events: GameEvent[] = [
    { type: "ORDER_TAKEN", playerId: actorId, orderId, deck, acquisition: "blind_top" },
  ];
  finishOfficeOrderAcquisition(next, actorId, events);
  return success(next, events);
}

function endOfficeOrders(state: GameState, actorId: PlayerId): ApplyResult {
  const phase = requirePhase(state, "work_office_orders");
  if (isFailure(phase)) {
    return phase;
  }
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) {
    return actorError;
  }
  if (phase.mode !== "take_up_to_two") {
    return applyFailure(
      ruleError("INVALID_ACTION", "This Office mode requires taking its one Order."),
    );
  }
  if (phase.step !== "take_or_end") {
    return applyFailure(
      ruleError("INVALID_ACTION", "Resolve Colour Samples before ending the Office action."),
    );
  }
  if (phase.colourSamplesUsed && phase.ordersTaken === 0) {
    return applyFailure(
      ruleError("INVALID_ACTION", "After using Colour Samples, take at least one Order."),
    );
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  next.phase = { type: "work_office_sale", actorId, workerId: phase.workerId };
  return success(next, events);
}

function useColourSamples(
  state: GameState,
  actorId: PlayerId,
  deck: OrderDeck,
  rng: RandomSource,
): ApplyResult {
  const phase = requirePhase(state, "work_office_orders");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  if (phase.step !== "colour_samples_or_skip" || phase.ordersTaken !== 0) {
    return applyFailure(ruleError("INVALID_ACTION", "Colour Samples is not awaiting a choice."));
  }
  const player = state.players[actorId];
  const technique = player === undefined ? undefined : ownedTechnique(player, "T08");
  if (player === undefined || technique === undefined) {
    return applyFailure(ruleError("TECHNIQUE_NOT_OWNED", "Colour Samples is not owned."));
  }
  if (technique.exhausted) {
    return applyFailure(ruleError("TECHNIQUE_EXHAUSTED", "Colour Samples is exhausted."));
  }
  if ((deck === "market" ? state.marketDeck.length + state.marketDiscard.length : state.imperialDeck.length + state.imperialDiscard.length) < 2) {
    return applyFailure(ruleError("ORDER_NOT_AVAILABLE", "That Order deck cannot provide two Colour Samples cards."));
  }

  const next = cloneState(state);
  const nextPhase = next.phase;
  const nextPlayer = next.players[actorId];
  if (
    nextPhase.type !== "work_office_orders" || nextPlayer === undefined
  ) {
    throw new Error("Colour Samples state invariant failed");
  }
  ensureOrderDeck(next, deck, rng);
  const nextDeck = deck === "market" ? next.marketDeck : next.imperialDeck;
  if (nextDeck.length < 2) {
    return applyFailure(ruleError("ORDER_NOT_AVAILABLE", "That Order deck cannot provide two Colour Samples cards."));
  }
  const choices = nextDeck.splice(0, 2);

  const events: GameEvent[] = [];
  exhaustTechnique(nextPlayer, actorId, "T08", events);
  nextPhase.step = "colour_samples_choose";
  nextPhase.colourSamplesUsed = true;
  nextPhase.colourSamplesDeck = deck;
  nextPhase.colourSamplesChoices = choices;
  return success(next, events);
}

function chooseColourSamplesOrder(state: GameState, actorId: PlayerId, orderId: OrderId): ApplyResult {
  const phase = requirePhase(state, "work_office_orders");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  if (phase.step !== "colour_samples_choose" || phase.colourSamplesDeck === undefined || phase.colourSamplesChoices === undefined || !phase.colourSamplesChoices.includes(orderId)) {
    return applyFailure(ruleError("INVALID_SELECTION", "Choose one of the two private Colour Samples Orders."));
  }
  const bottomedOrderId = phase.colourSamplesChoices.find((choice) => choice !== orderId);
  if (bottomedOrderId === undefined) throw new Error("Colour Samples requires two distinct Orders");
  const next = cloneState(state);
  const nextPhase = next.phase;
  const player = next.players[actorId];
  if (nextPhase.type !== "work_office_orders" || player === undefined || nextPhase.colourSamplesDeck === undefined) throw new Error("Colour Samples state invariant failed");
  const deck = nextPhase.colourSamplesDeck;
  (deck === "market" ? next.marketDeck : next.imperialDeck).push(bottomedOrderId);
  player.orderHand.push(orderId);
  nextPhase.remainingTakes = (nextPhase.remainingTakes - 1) as 0 | 1 | 2;
  nextPhase.ordersTaken += 1;
  nextPhase.step = "take_or_end";
  delete nextPhase.colourSamplesChoices;
  delete nextPhase.colourSamplesDeck;
  const events: GameEvent[] = [
    { type: "ORDER_TAKEN", playerId: actorId, orderId, deck, acquisition: "blind_top" },
    { type: "COLOUR_SAMPLES_USED", playerId: actorId, deck, bottomedOrderId, selectedOrderId: orderId },
  ];
  finishOfficeOrderAcquisition(next, actorId, events);
  return success(next, events);
}

function skipColourSamples(state: GameState, actorId: PlayerId): ApplyResult {
  const phase = requirePhase(state, "work_office_orders");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  if (phase.step !== "colour_samples_or_skip") {
    return applyFailure(ruleError("INVALID_ACTION", "Colour Samples is not awaiting a choice."));
  }
  const next = cloneState(state);
  if (next.phase.type !== "work_office_orders") {
    throw new Error("Office Colour Samples phase invariant failed");
  }
  next.phase.step = "take_or_end";
  return success(next, []);
}

function techniqueDisplayEntries(state: GameState): TechniqueId[] {
  return [
    ...state.techniqueDisplay.forming,
    ...state.techniqueDisplay.glazing,
    ...state.techniqueDisplay.firing,
  ];
}

function techniqueDiscipline(techniqueId: TechniqueId): TechniqueDiscipline | null {
  return TECHNIQUE_DEFINITIONS[techniqueId]?.discipline ?? null;
}

function techniqueCost(techniqueId: TechniqueId): number | null {
  const definition = TECHNIQUE_DEFINITIONS[techniqueId];
  return definition?.cost ?? null;
}

function guildTechniqueCost(techniqueId: TechniqueId, worker: WorkerState): number | null {
  const printedCost = techniqueCost(techniqueId);
  if (printedCost === null) return null;
  return worker.kind === "shifu" ? Math.max(0, printedCost - 1) : printedCost;
}

function beginGuildAction(state: GameState, actorId: PlayerId, workerId: string): ApplyResult {
  const context = validateWorkerAction(state, actorId, workerId, "guild_academy");
  if (!isWorkerContext(context)) {
    return context;
  }
  if (context.player.techniques.length >= GAME_CONFIG.techniques.maxOwned) {
    return applyFailure(ruleError("TECHNIQUE_LIMIT", "A player may own at most two Techniques."));
  }
  const displayed = techniqueDisplayEntries(state);
  if (displayed.length === 0) {
    return applyFailure(
      ruleError("TECHNIQUE_NOT_AVAILABLE", "No face-up Technique is available."),
    );
  }
  const canAffordDisplayed = displayed.some((techniqueId) => {
    const cost = guildTechniqueCost(techniqueId, context.worker);
    return cost !== null && cost <= context.player.resources.coins;
  });
  if (!canAffordDisplayed) {
    return applyFailure(
      ruleError("INSUFFICIENT_RESOURCES", "No face-up Technique is affordable."),
    );
  }

  const next = cloneState(state);
  const events: GameEvent[] = [];
  placeWorker(next, actorId, workerId, "guild_academy", events);
  next.phase = {
    type: "work_guild",
    actorId,
    workerId,
    step: context.worker.kind === "shifu" ? "refresh_or_skip" : "buy",
  };
  return success(next, events);
}

function refreshGuildTechnique(
  state: GameState,
  actorId: PlayerId,
  techniqueId: TechniqueId,
): ApplyResult {
  const phase = requirePhase(state, "work_guild");
  if (isFailure(phase)) {
    return phase;
  }
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) {
    return actorError;
  }
  const player = state.players[actorId];
  const worker = player?.workers[phase.workerId];
  if (phase.step !== "refresh_or_skip" || worker?.kind !== "shifu") {
    return applyFailure(
      ruleError("INVALID_ACTION", "A Shifu refresh is not available in this step."),
    );
  }
  const discipline = techniqueDiscipline(techniqueId);
  if (discipline === null || !state.techniqueDisplay[discipline].includes(techniqueId)) {
    return applyFailure(
      ruleError("TECHNIQUE_NOT_AVAILABLE", "The selected Technique is not face-up."),
    );
  }

  const next = cloneState(state);
  const nextPhase = next.phase;
  if (nextPhase.type !== "work_guild") {
    throw new Error("Guild phase invariant failed");
  }
  const display = next.techniqueDisplay[discipline];
  const index = display.indexOf(techniqueId);
  display.splice(index, 1);
  next.techniqueDecks[discipline].push(techniqueId);
  const replacement = next.techniqueDecks[discipline].shift();
  if (replacement !== undefined) {
    display.splice(index, 0, replacement);
  }
  nextPhase.step = "buy";
  return success(next, [{ type: "TECHNIQUE_REFRESHED", playerId: actorId, techniqueId }]);
}

function skipGuildRefresh(state: GameState, actorId: PlayerId): ApplyResult {
  const phase = requirePhase(state, "work_guild");
  if (isFailure(phase)) {
    return phase;
  }
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) {
    return actorError;
  }
  if (phase.step !== "refresh_or_skip") {
    return applyFailure(ruleError("INVALID_ACTION", "There is no refresh decision to skip."));
  }
  const player = state.players[actorId];
  const worker = player?.workers[phase.workerId];
  if (worker?.kind !== "shifu") {
    return applyFailure(ruleError("INVALID_ACTION", "Only a Shifu has a refresh decision."));
  }
  const next = cloneState(state);
  if (next.phase.type !== "work_guild") {
    throw new Error("Guild phase invariant failed");
  }
  next.phase.step = "buy";
  return success(next, []);
}

function buyGuildTechnique(
  state: GameState,
  actorId: PlayerId,
  techniqueId: TechniqueId,
): ApplyResult {
  const phase = requirePhase(state, "work_guild");
  if (isFailure(phase)) {
    return phase;
  }
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) {
    return actorError;
  }
  if (phase.step !== "buy") {
    return applyFailure(
      ruleError("INVALID_ACTION", "Resolve the Shifu refresh decision before buying."),
    );
  }
  const player = state.players[actorId];
  const worker = player?.workers[phase.workerId];
  if (player === undefined || worker === undefined) {
    return applyFailure(ruleError("UNKNOWN_PLAYER", "The Guild actor was not found."));
  }
  if (player.techniques.length >= GAME_CONFIG.techniques.maxOwned) {
    return applyFailure(ruleError("TECHNIQUE_LIMIT", "A player may own at most two Techniques."));
  }
  const discipline = techniqueDiscipline(techniqueId);
  if (discipline === null || !state.techniqueDisplay[discipline].includes(techniqueId)) {
    return applyFailure(
      ruleError("TECHNIQUE_NOT_AVAILABLE", "The selected Technique is not face-up."),
    );
  }
  const cost = guildTechniqueCost(techniqueId, worker);
  if (cost === null || player.resources.coins < cost) {
    return applyFailure(
      ruleError("INSUFFICIENT_RESOURCES", "Not enough Coins for this Technique."),
    );
  }

  const next = cloneState(state);
  const nextPlayer = next.players[actorId];
  if (nextPlayer === undefined) {
    throw new Error("Guild actor disappeared");
  }
  const display = next.techniqueDisplay[discipline];
  const index = display.indexOf(techniqueId);
  display.splice(index, 1);
  const replacement = next.techniqueDecks[discipline].shift();
  if (replacement !== undefined) {
    display.splice(index, 0, replacement);
  }
  nextPlayer.resources.coins -= cost;
  next.commonSupply.coins += cost;
  nextPlayer.techniques.push({ id: techniqueId, exhausted: false });
  const events: GameEvent[] = [
    { type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: 0, coins: -cost },
    { type: "TECHNIQUE_ACQUIRED", playerId: actorId, techniqueId, cost },
  ];
  completeWorkerAction(next, actorId, events);
  return success(next, events);
}

function advanceQueuedWindow(state: GameState, onComplete: () => void): void {
  if (!("queue" in state.phase)) {
    throw new Error("Expected an ordered timing-window queue");
  }
  state.phase.queue.currentIndex += 1;
  if (state.phase.queue.currentIndex >= state.phase.queue.actors.length) onComplete();
}

function resolveKilnSetting(
  state: GameState,
  actorId: PlayerId,
  ceramicId: string | null,
  toSpaceId: KilnSpaceId | null,
): ApplyResult {
  const phase = requirePhase(state, "firing_before_contribution");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  if (phase.techniqueIds[phase.queue.currentIndex] !== "T09") {
    return applyFailure(ruleError("INVALID_ACTION", "Kiln Setting is not the current decision."));
  }
  const isPass = ceramicId === null && toSpaceId === null;
  if ((ceramicId === null) !== (toSpaceId === null)) {
    return applyFailure(ruleError("INVALID_SELECTION", "Kiln Setting requires both selections."));
  }
  if (!isPass) {
    const player = state.players[actorId];
    const technique = player === undefined ? undefined : ownedTechnique(player, "T09");
    const ceramic = ceramicId === null ? undefined : state.ceramics[ceramicId];
    if (technique === undefined || technique.exhausted) {
      return applyFailure(ruleError("TECHNIQUE_EXHAUSTED", "Kiln Setting is unavailable."));
    }
    if (ceramic === undefined || ceramic.ownerId !== actorId || ceramic.stage !== "loaded") {
      return applyFailure(
        ruleError("ILLEGAL_CERAMIC_STAGE", "Kiln Setting must move one owned Loaded ceramic."),
      );
    }
    if (toSpaceId === null || !activeKilnSpaceIds(state.playerCount).includes(toSpaceId)) {
      return applyFailure(
        ruleError("INVALID_SELECTION", "Kiln Setting cannot move a ceramic into a covered space."),
      );
    }
    if (kilnOccupant(state, toSpaceId) !== null) {
      return applyFailure(ruleError("KILN_SPACE_OCCUPIED", "The destination is not empty."));
    }
  }

  const next = cloneState(state);
  const events: GameEvent[] = [];
  if (!isPass && ceramicId !== null && toSpaceId !== null) {
    const player = next.players[actorId];
    const ceramic = next.ceramics[ceramicId];
    if (player === undefined || ceramic === undefined || ceramic.stage !== "loaded") {
      throw new Error("Kiln Setting invariant failed");
    }
    ceramic.kilnSpaceId = toSpaceId;
    exhaustTechnique(player, actorId, "T09", events);
  }
  advanceQueuedWindow(next, () => openContributionPhase(next));
  return success(next, events);
}

export function createPrivateFiringState(state: GameState): PrivateFiringState {
  return {
    gameId: state.gameId,
    windowId: state.phase.type === "firing_contributions" ? state.phase.windowId : null,
    contributions: {},
  };
}

function ensureFireDeck(state: GameState, rng: RandomSource): void {
  if (state.fireDeck.length === 0 && state.fireDiscard.length > 0) {
    state.fireDeck = shuffle(state.fireDiscard, rng);
    state.fireDiscard = [];
  }
}

/**
 * v1.1.4 firing steps 4-5. Fuel Ledger now resolves in its own window after every card is
 * revealed and before Base Heat exists, so the provisional value here is what the table
 * would produce with no upgrade, and the window is offered to anyone who revealed Stoke.
 */
function contributionAdjustments(state: GameState): number[] {
  const context = state.firingContext;
  if (context === null) throw new Error("Base Heat requires firing context");
  return context.contributors.map((playerId) => {
    const card = context.contributions[playerId];
    if (card === undefined) throw new Error(`Missing revealed Contribution for ${playerId}`);
    return contributionHeatAdjustment(card) + (context.fuelLedgerUpgradedBy.includes(playerId) ? 1 : 0);
  });
}

function provisionalBaseHeat(state: GameState): BaseHeat {
  return determineBaseHeat(contributionAdjustments(state));
}

function fuelLedgerCandidates(state: GameState): PlayerId[] {
  const context = state.firingContext;
  if (context === null) return [];
  return turnOrderFromFirst(state).filter((playerId) => {
    if (!context.contributors.includes(playerId)) return false;
    if (context.contributions[playerId] !== "STOKE") return false;
    if (context.fuelLedgerUpgradedBy.includes(playerId)) return false;
    const player = state.players[playerId];
    if (player === undefined) return false;
    const technique = ownedTechnique(player, "T11");
    return technique !== undefined && !technique.exhausted && player.resources.wood >= FUEL_LEDGER_WOOD;
  });
}

function openFuelLedgerOrDetermineBaseHeat(
  state: GameState,
  events: GameEvent[],
  rng: RandomSource,
): void {
  const actors = fuelLedgerCandidates(state);
  if (actors.length === 0) determineBaseHeatAndOpenReposition(state, events, rng);
  else state.phase = { type: "firing_after_reveal", queue: { actors, currentIndex: 0 } };
}

function resolveFuelLedger(
  state: GameState,
  actorId: PlayerId,
  use: boolean,
  rng: RandomSource,
): ApplyResult {
  const phase = requirePhase(state, "firing_after_reveal");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  const player = state.players[actorId];
  const context = state.firingContext;
  if (player === undefined || context === null) {
    return applyFailure(ruleError("INVALID_ACTION", "Fuel Ledger context is unavailable."));
  }
  if (use) {
    const technique = ownedTechnique(player, "T11");
    if (technique === undefined || technique.exhausted) {
      return applyFailure(ruleError("TECHNIQUE_EXHAUSTED", "Fuel Ledger is unavailable."));
    }
    if (context.contributions[actorId] !== "STOKE") {
      return applyFailure(
        ruleError("INVALID_ACTION", "Fuel Ledger upgrades Stoke the Fire only."),
      );
    }
    if (player.resources.wood < FUEL_LEDGER_WOOD) {
      return applyFailure(
        ruleError("INSUFFICIENT_RESOURCES", "Fuel Ledger costs 2 additional Wood.", {
          requiredWood: FUEL_LEDGER_WOOD,
        }),
      );
    }
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  if (use) {
    const nextPlayer = next.players[actorId];
    const nextContext = next.firingContext;
    if (nextPlayer === undefined || nextContext === null) throw new Error("Fuel Ledger invariant failed");
    nextPlayer.resources.wood -= FUEL_LEDGER_WOOD;
    next.commonSupply.wood += FUEL_LEDGER_WOOD;
    nextContext.fuelLedgerUpgradedBy.push(actorId);
    exhaustTechnique(nextPlayer, actorId, "T11", events);
    events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: -FUEL_LEDGER_WOOD, coins: 0 });
  }
  advanceQueuedWindow(next, () => determineBaseHeatAndOpenReposition(next, events, rng));
  return success(next, events);
}

function determineBaseHeatAndOpenReposition(
  state: GameState,
  events: GameEvent[],
  rng: RandomSource,
): void {
  const context = state.firingContext;
  if (context === null) throw new Error("Base Heat requires firing context");
  context.baseHeat = provisionalBaseHeat(state);
  const hasEmptySpace = activeKilnSpaceIds(state.playerCount).some((spaceId) => kilnOccupant(state, spaceId) === null);
  const actors = hasEmptySpace ? turnOrderFromFirst(state).filter((playerId) => {
    const player = state.players[playerId];
    const shifu = player === undefined ? undefined : Object.values(player.workers).find(
      (worker) => worker.kind === "shifu" && worker.status === "placed" && worker.locationId === "kiln_yard",
    );
    return shifu !== undefined && Object.values(state.ceramics).some(
      (ceramic) => ceramic.stage === "loaded" && ceramic.ownerId === playerId,
    );
  }) : [];
  if (actors.length === 0) revealFireAndOpenSaggerSelection(state, events, rng);
  else state.phase = { type: "firing_reposition", queue: { actors, currentIndex: 0 } };
}

export function submitWoodContribution(
  state: GameState,
  privateState: PrivateFiringState,
  actorId: PlayerId,
  card: ContributionCardId,
  rng: RandomSource,
): SubmitContributionResult {
  if (state.phase.type !== "firing_contributions") {
    return { ok: false, error: ruleError("WRONG_PHASE", "Wood Contributions are not open.") };
  }
  if (
    privateState.gameId !== state.gameId ||
    privateState.windowId !== state.phase.windowId
  ) {
    return {
      ok: false,
      error: ruleError("PRIVATE_WINDOW_MISMATCH", "Private firing state is for another window."),
    };
  }
  const player = state.players[actorId];
  if (player === undefined || !state.phase.eligiblePlayerIds.includes(actorId)) {
    return { ok: false, error: ruleError("NOT_CONTRIBUTOR", "This player is not a contributor.") };
  }
  if (state.phase.submittedPlayerIds.includes(actorId) || privateState.contributions[actorId] !== undefined) {
    return {
      ok: false,
      error: ruleError("CONTRIBUTION_ALREADY_SUBMITTED", "This player already submitted."),
    };
  }
  if (!CONTRIBUTION_CARD_IDS.includes(card)) {
    return {
      ok: false,
      error: ruleError("INVALID_CONTRIBUTION", "That Contribution card is not in the set."),
    };
  }
  // Affordability is checked against the card's printed Wood cost. Tend costs nothing and
  // is therefore always a legal choice, which is what guarantees the window can close.
  if (player.resources.wood < contributionWoodCost(card)) {
    return {
      ok: false,
      error: ruleError("INVALID_CONTRIBUTION", "You cannot pay that Contribution card's Wood cost.", {
        card,
        requiredWood: contributionWoodCost(card),
      }),
    };
  }

  const next = cloneState(state);
  const nextPrivate: PrivateFiringState = JSON.parse(JSON.stringify(privateState)) as PrivateFiringState;
  if (next.phase.type !== "firing_contributions") throw new Error("Contribution phase invariant failed");
  next.phase.submittedPlayerIds.push(actorId);
  nextPrivate.contributions[actorId] = card;
  const events: GameEvent[] = [
    { type: "WOOD_SUBMITTED", playerId: actorId, windowId: next.phase.windowId },
  ];

  if (next.phase.submittedPlayerIds.length === next.phase.eligiblePlayerIds.length) {
    const contributions: Record<PlayerId, ContributionCardId> = {};
    for (const contributorId of next.phase.eligiblePlayerIds) {
      const revealed = nextPrivate.contributions[contributorId];
      const contributor = next.players[contributorId];
      if (revealed === undefined || contributor === undefined) {
        throw new Error("A revealed contribution is missing");
      }
      const woodPaid = contributionWoodCost(revealed);
      contributor.resources.wood -= woodPaid;
      next.commonSupply.wood += woodPaid;
      if (woodPaid > 0) {
        events.push({ type: "RESOURCES_CHANGED", playerId: contributorId, clay: 0, wood: -woodPaid, coins: 0 });
      }
      contributions[contributorId] = revealed;
    }
    next.firingContext = {
      round: next.round,
      contributors: [...next.phase.eligiblePlayerIds],
      contributions,
      fuelLedgerUpgradedBy: [],
      baseHeat: null,
      fireModifier: null,
      globalHeat: null,
      saggerAdjustedCeramicIds: [],
      ceramicResults: {},
    };
    events.push({ type: "WOOD_REVEALED", contributions: { ...contributions } });
    nextPrivate.windowId = null;
    nextPrivate.contributions = {};
    openFuelLedgerOrDetermineBaseHeat(next, events, rng);
  }
  next.revision += 1;
  next.eventSequence += events.length;
  return { ok: true, state: next, privateState: nextPrivate, events };
}

function resolveKilnYardReposition(
  state: GameState,
  actorId: PlayerId,
  ceramicId: string | null,
  toSpaceId: KilnSpaceId | null,
  rng: RandomSource,
): ApplyResult {
  const phase = requirePhase(state, "firing_reposition");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  const isPass = ceramicId === null && toSpaceId === null;
  if ((ceramicId === null) !== (toSpaceId === null)) {
    return applyFailure(ruleError("INVALID_SELECTION", "Kiln Yard repositioning requires both a ceramic and destination."));
  }
  if (!isPass) {
    const ceramic = ceramicId === null ? undefined : state.ceramics[ceramicId];
    if (ceramic === undefined || ceramic.stage !== "loaded" || ceramic.ownerId !== actorId) {
      return applyFailure(ruleError("ILLEGAL_CERAMIC_STAGE", "Reposition one of your loaded ceramics."));
    }
    if (toSpaceId === null || !activeKilnSpaceIds(state.playerCount).includes(toSpaceId)) {
      return applyFailure(ruleError("INVALID_SELECTION", "Choose an active kiln space."));
    }
    if (kilnOccupant(state, toSpaceId) !== null) {
      return applyFailure(ruleError("KILN_SPACE_OCCUPIED", "The destination kiln space is occupied."));
    }
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  if (!isPass && ceramicId !== null && toSpaceId !== null) {
    const ceramic = next.ceramics[ceramicId];
    if (ceramic === undefined || ceramic.stage !== "loaded") throw new Error("Kiln Yard reposition invariant failed");
    ceramic.kilnSpaceId = toSpaceId;
  }
  advanceQueuedWindow(next, () => revealFireAndOpenSaggerSelection(next, events, rng));
  return success(next, events);
}

function revealFireAndOpenSaggerSelection(state: GameState, events: GameEvent[], rng: RandomSource): void {
  const context = state.firingContext;
  if (context === null) throw new Error("Heat calculation requires firing context");
  const baseHeat = context.baseHeat;
  if (baseHeat === null) throw new Error("Fire reveal requires Base Heat");
  ensureFireDeck(state, rng);
  const fireModifier = state.fireDeck.shift();
  if (fireModifier === undefined) throw new Error("Fire deck exhausted unexpectedly");
  const globalHeat = baseHeat + fireModifier;
  context.baseHeat = baseHeat;
  context.fireModifier = fireModifier;
  context.globalHeat = globalHeat;
  events.push({ type: "FIRE_REVEALED", modifier: fireModifier, baseHeat, globalHeat });

  const actors = fireModifier === 0 ? [] : turnOrderFromFirst(state).filter((playerId) => {
    const player = state.players[playerId];
    const technique = player === undefined ? undefined : ownedTechnique(player, "T16");
    return (
      player !== undefined &&
      technique !== undefined &&
      !technique.exhausted &&
      player.resources.wood >= 2 &&
      Object.values(state.ceramics).some(
        (ceramic) => ceramic.stage === "loaded" && ceramic.ownerId === playerId,
      )
    );
  });
  if (actors.length === 0) calculateActualHeatAndOpenQualityWindow(state, events);
  else state.phase = { type: "firing_after_fire_reveal", queue: { actors, currentIndex: 0 } };
}

function calculateActualHeatAndOpenQualityWindow(state: GameState, events: GameEvent[]): void {
  const context = state.firingContext;
  if (
    context === null ||
    context.baseHeat === null ||
    context.fireModifier === null ||
    context.globalHeat === null
  ) {
    throw new Error("Actual Heat calculation requires the revealed Fire card");
  }

  for (const ceramic of Object.values(state.ceramics)) {
    if (ceramic.stage !== "loaded") continue;
    const zoneModifier = kilnZoneModifier(ceramic.kilnSpaceId);
    const naturalActualHeat = context.globalHeat + zoneModifier;
    const naturalDifference = Math.abs(naturalActualHeat - preferredHeat(ceramic.glaze));
    // V1.1.1: Sagger Selection moves the modifier one step toward 0, it no longer zeroes it.
    const saggerAdjusted = context.saggerAdjustedCeramicIds.includes(ceramic.id);
    const effectiveFireModifier = saggerAdjusted
      ? context.fireModifier - Math.sign(context.fireModifier)
      : context.fireModifier;
    const ignoredFireModifier = saggerAdjusted;
    const actualHeat = context.baseHeat + effectiveFireModifier + zoneModifier;
    const difference = Math.abs(actualHeat - preferredHeat(ceramic.glaze));
    context.ceramicResults[ceramic.id] = {
      ceramicId: ceramic.id,
      zoneModifier,
      ignoredFireModifier,
      naturalActualHeat,
      naturalHeatDifference: naturalDifference,
      naturalExactMatch: naturalDifference === 0,
      finalActualHeat: actualHeat,
      finalHeatDifference: difference,
      forcedQuality: null,
      assignedQuality: null,
    };
  }

  const actors = turnOrderFromFirst(state).filter((playerId) => {
    const player = state.players[playerId];
    if (player === undefined || player.kilnAbilityUsedThisRound) return false;
    const ownedResults = Object.values(context.ceramicResults).filter(
      (result) => state.ceramics[result.ceramicId]?.ownerId === playerId,
    );
    if (player.kilnId === "JU") return ownedResults.length > 0;
    if (player.kilnId === "GE") {
      return ownedResults.length > 0;
    }
    return false;
  });
  if (actors.length === 0) assignQualityAndOpenSaggars(state, events);
  else state.phase = { type: "firing_before_quality", queue: { actors, currentIndex: 0 } };
}

function resolveSaggerSelection(
  state: GameState,
  actorId: PlayerId,
  ceramicId: string | null,
): ApplyResult {
  const phase = requirePhase(state, "firing_after_fire_reveal");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  const player = state.players[actorId];
  if (ceramicId !== null) {
    const technique = player === undefined ? undefined : ownedTechnique(player, "T16");
    const ceramic = state.ceramics[ceramicId];
    if (technique === undefined || technique.exhausted) {
      return applyFailure(ruleError("TECHNIQUE_EXHAUSTED", "Sagger Selection is unavailable."));
    }
    if (
      player === undefined ||
      player.resources.wood < 2 ||
      ceramic === undefined ||
      ceramic.stage !== "loaded" ||
      ceramic.ownerId !== actorId
    ) {
      return applyFailure(
        ruleError("INVALID_SELECTION", "Sagger Selection costs 2 Coins and requires one owned Loaded ceramic."),
      );
    }
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  if (ceramicId !== null) {
    const nextPlayer = next.players[actorId];
    const nextContext = next.firingContext;
    if (nextPlayer === undefined || nextContext === null) {
      throw new Error("Sagger Selection invariant failed");
    }
    nextPlayer.resources.wood -= 2;
    next.commonSupply.wood += 2;
    nextContext.saggerAdjustedCeramicIds.push(ceramicId);
    exhaustTechnique(nextPlayer, actorId, "T16", events);
    events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: -2, coins: 0 });
  }
  advanceQueuedWindow(next, () => calculateActualHeatAndOpenQualityWindow(next, events));
  return success(next, events);
}

function assignQualityAndOpenSaggars(state: GameState, events: GameEvent[]): void {
  const context = state.firingContext;
  if (context === null) throw new Error("Quality assignment requires firing context");
  for (const result of Object.values(context.ceramicResults)) {
    result.assignedQuality = result.forcedQuality ?? qualityFromDifference(result.finalHeatDifference);
    events.push({ type: "QUALITY_ASSIGNED", ceramicId: result.ceramicId, quality: result.assignedQuality });
  }
  const saggarsActors = turnOrderFromFirst(state).filter((playerId) => {
    const player = state.players[playerId];
    const technique = player === undefined ? undefined : ownedTechnique(player, "T10");
    return (
      player !== undefined &&
      technique !== undefined &&
      !technique.exhausted &&
      player.resources.wood >= 1 &&
      Object.values(context.ceramicResults).some(
        (result) =>
          (result.assignedQuality === "flawed" || result.assignedQuality === "standard") &&
          state.ceramics[result.ceramicId]?.ownerId === playerId,
      )
    );
  });
  if (saggarsActors.length === 0) openSecondFiringWindow(state, events);
  else {
    state.phase = {
      type: "firing_after_quality",
      queue: { actors: saggarsActors, currentIndex: 0 },
      techniqueIds: saggarsActors.map(() => "T10" as TechniqueId),
    };
  }
}

function openSecondFiringWindow(state: GameState, events: GameEvent[]): void {
  const context = state.firingContext;
  if (context === null) throw new Error("Second Firing window requires firing context");
  const actors = turnOrderFromFirst(state).filter((playerId) => {
    const player = state.players[playerId];
    const technique = player === undefined ? undefined : ownedTechnique(player, "T15");
    return (
      technique !== undefined &&
      !technique.exhausted &&
      Object.values(context.ceramicResults).some(
        (result) =>
          result.assignedQuality === "standard" &&
          state.ceramics[result.ceramicId]?.ownerId === playerId,
      )
    );
  });
  if (actors.length === 0) openAfterFiringWindow(state, events);
  else {
    state.phase = {
      type: "firing_after_quality",
      queue: { actors, currentIndex: 0 },
      techniqueIds: actors.map(() => "T15" as TechniqueId),
    };
  }
}

function resolveJun(
  state: GameState,
  actorId: PlayerId,
  ceramicId: string | null,
  delta: -1 | 1 | null,
): ApplyResult {
  const phase = requirePhase(state, "firing_before_quality");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  const player = state.players[actorId];
  if (player?.kilnId !== "JU") {
    return applyFailure(ruleError("INVALID_ACTION", "The current window is not Jun's ability."));
  }
  if (delta !== null && delta !== -1 && delta !== 1) {
    return applyFailure(ruleError("INVALID_SELECTION", "Jun changes Actual Heat by exactly +1 or -1."));
  }
  const isPass = ceramicId === null && delta === null;
  if ((ceramicId === null) !== (delta === null)) {
    return applyFailure(ruleError("INVALID_SELECTION", "Jun requires a ceramic and ±1."));
  }
  if (!isPass) {
    const ceramic = ceramicId === null ? undefined : state.ceramics[ceramicId];
    if (ceramic === undefined || ceramic.ownerId !== actorId || ceramic.stage !== "loaded") {
      return applyFailure(ruleError("ILLEGAL_CERAMIC_STAGE", "Jun must select an owned Loaded ceramic."));
    }
    if ((player?.resources.wood ?? 0) < JUN_ACTIVATION_WOOD) {
      return applyFailure(
        ruleError("INSUFFICIENT_RESOURCES", `Jun's Kiln Transformation costs ${JUN_ACTIVATION_WOOD} Wood.`),
      );
    }
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  if (!isPass && ceramicId !== null && delta !== null) {
    const nextPlayer = next.players[actorId];
    const ceramic = next.ceramics[ceramicId];
    const result = next.firingContext?.ceramicResults[ceramicId];
    if (nextPlayer === undefined || ceramic === undefined || ceramic.stage !== "loaded" || result === undefined) {
      throw new Error("Jun invariant failed");
    }
    result.finalActualHeat += delta;
    result.finalHeatDifference = Math.abs(result.finalActualHeat - preferredHeat(ceramic.glaze));
    nextPlayer.resources.wood -= JUN_ACTIVATION_WOOD;
    next.commonSupply.wood += JUN_ACTIVATION_WOOD;
    events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: -JUN_ACTIVATION_WOOD, coins: 0 });
    events.push({ type: "JUN_ACTIVATION_PAID", playerId: actorId, wood: JUN_ACTIVATION_WOOD });
    nextPlayer.kilnAbilityUsedThisRound = true;
    events.push({ type: "KILN_ABILITY_USED", playerId: actorId, kilnId: "JU" });
  }
  advanceQueuedWindow(next, () => assignQualityAndOpenSaggars(next, events));
  return success(next, events);
}

function resolveGe(state: GameState, actorId: PlayerId, ceramicId: string | null): ApplyResult {
  const phase = requirePhase(state, "firing_before_quality");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  const player = state.players[actorId];
  if (player?.kilnId !== "GE") {
    return applyFailure(ruleError("INVALID_ACTION", "The current window is not Ge's ability."));
  }
  // Ge spends 1 Wood. Its earlier weakness was never this price -- removing the cost
  // moved its win rate by 0.01 VP -- it was an enumerator that only ever offered targets
  // at Heat Difference 1 while the engine accepted 1 or 2.
  if (ceramicId !== null && (player?.resources.wood ?? 0) < GE_ACTIVATION_WOOD) {
    return applyFailure(ruleError("INSUFFICIENT_RESOURCES", `Ge costs ${GE_ACTIVATION_WOOD} Wood.`));
  }
  if (ceramicId !== null) {
    const ceramic = state.ceramics[ceramicId];
    const result = state.firingContext?.ceramicResults[ceramicId];
    if (
      ceramic === undefined ||
      ceramic.ownerId !== actorId ||
      ceramic.stage !== "loaded" ||
      result === undefined ||
      (result.finalHeatDifference !== 1 && result.finalHeatDifference !== 2)
    ) {
      return applyFailure(
        ruleError(
          "INVALID_SELECTION",
          "Ge requires one owned ceramic whose current Actual Heat differs from its Preferred Heat by 1 or 2.",
        ),
      );
    }
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  if (ceramicId !== null) {
    const nextPlayer = next.players[actorId];
    const ceramic = next.ceramics[ceramicId];
    const result = next.firingContext?.ceramicResults[ceramicId];
    if (nextPlayer === undefined || ceramic === undefined || ceramic.stage !== "loaded" || result === undefined) {
      throw new Error("Ge invariant failed");
    }
    ceramic.decoration = "crackle";
    result.finalActualHeat = preferredHeat(ceramic.glaze);
    result.finalHeatDifference = 0;
    nextPlayer.resources.wood -= GE_ACTIVATION_WOOD;
    next.commonSupply.wood += GE_ACTIVATION_WOOD;
    nextPlayer.kilnAbilityUsedThisRound = true;
    events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: -GE_ACTIVATION_WOOD, coins: 0 });
    events.push({ type: "KILN_ABILITY_USED", playerId: actorId, kilnId: "GE" });
  }
  advanceQueuedWindow(next, () => assignQualityAndOpenSaggars(next, events));
  return success(next, events);
}

function resolveProtectiveSaggars(
  state: GameState,
  actorId: PlayerId,
  ceramicId: string | null,
): ApplyResult {
  const phase = requirePhase(state, "firing_after_quality");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  if (phase.techniqueIds[phase.queue.currentIndex] !== "T10") {
    return applyFailure(ruleError("INVALID_ACTION", "Protective Saggars is not the current decision."));
  }
  const player = state.players[actorId];
  if (ceramicId !== null) {
    const technique = player === undefined ? undefined : ownedTechnique(player, "T10");
    const ceramic = state.ceramics[ceramicId];
    const result = state.firingContext?.ceramicResults[ceramicId];
    if (technique === undefined || technique.exhausted) {
      return applyFailure(ruleError("TECHNIQUE_EXHAUSTED", "Protective Saggars is unavailable."));
    }
    if (
      player === undefined ||
      player.resources.coins < 1 ||
      ceramic === undefined ||
      ceramic.ownerId !== actorId ||
      (result?.assignedQuality !== "flawed" && result?.assignedQuality !== "standard")
    ) {
      return applyFailure(
        ruleError("INVALID_SELECTION", "Protective Saggars requires 1 Coin and an owned Flawed or Standard ceramic."),
      );
    }
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  if (ceramicId !== null) {
    const nextPlayer = next.players[actorId];
    const result = next.firingContext?.ceramicResults[ceramicId];
    if (nextPlayer === undefined || result === undefined) throw new Error("Saggars invariant failed");
    nextPlayer.resources.wood -= 1;
    next.commonSupply.wood += 1;
    result.assignedQuality = result.assignedQuality === "flawed" ? "standard" : "fine";
    exhaustTechnique(nextPlayer, actorId, "T10", events);
    events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: -1, coins: 0 });
  }
  advanceQueuedWindow(next, () => openSecondFiringWindow(next, events));
  return success(next, events);
}

function resolveSecondFiring(
  state: GameState,
  actorId: PlayerId,
  ceramicId: string | null,
): ApplyResult {
  const phase = requirePhase(state, "firing_after_quality");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  if (phase.techniqueIds[phase.queue.currentIndex] !== "T15") {
    return applyFailure(ruleError("INVALID_ACTION", "Second Firing is not the current decision."));
  }
  const player = state.players[actorId];
  if (ceramicId !== null) {
    const technique = player === undefined ? undefined : ownedTechnique(player, "T15");
    const ceramic = state.ceramics[ceramicId];
    const result = state.firingContext?.ceramicResults[ceramicId];
    if (technique === undefined || technique.exhausted) {
      return applyFailure(ruleError("TECHNIQUE_EXHAUSTED", "Second Firing is unavailable."));
    }
    if (
      ceramic === undefined ||
      ceramic.stage !== "loaded" ||
      ceramic.ownerId !== actorId ||
      result?.assignedQuality !== "standard"
    ) {
      return applyFailure(
        ruleError("INVALID_SELECTION", "Second Firing requires one owned Standard ceramic from this firing."),
      );
    }
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  if (ceramicId !== null) {
    const nextPlayer = next.players[actorId];
    const ceramic = next.ceramics[ceramicId];
    const nextContext = next.firingContext;
    if (
      nextPlayer === undefined ||
      ceramic === undefined ||
      ceramic.stage !== "loaded" ||
      nextContext === null
    ) {
      throw new Error("Second Firing invariant failed");
    }
    const { kilnSpaceId: _kilnSpaceId, ...rest } = ceramic;
    next.ceramics[ceramicId] = { ...rest, stage: "glazed" };
    delete nextContext.ceramicResults[ceramicId];
    exhaustTechnique(nextPlayer, actorId, "T15", events);
    events.push({ type: "CERAMIC_RETURNED_TO_GLAZED", playerId: actorId, ceramicId });
  }
  advanceQueuedWindow(next, () => openAfterFiringWindow(next, events));
  return success(next, events);
}

function openAfterFiringWindow(state: GameState, events: GameEvent[]): void {
  const context = state.firingContext;
  if (context === null) throw new Error("After-firing window requires firing context");
  const kilnRecordsActors = turnOrderFromFirst(state).filter((playerId) => {
    const player = state.players[playerId];
    const technique = player === undefined ? undefined : ownedTechnique(player, "T13");
    return (
      technique !== undefined &&
      !technique.exhausted &&
      Object.values(context.ceramicResults).filter(
        (result) =>
          result.assignedQuality === "masterpiece" &&
          state.ceramics[result.ceramicId]?.ownerId === playerId,
      ).length >= 1
    );
  });
  const actors = kilnRecordsActors;
  const techniqueIds = kilnRecordsActors.map(() => "T13" as TechniqueId);
  if (actors.length === 0) finalizeFiring(state, events);
  else {
    state.phase = {
      type: "firing_after_firing",
      queue: { actors, currentIndex: 0 },
      techniqueIds,
    };
  }
}

/**
 * Clay Substitution inside the Firing Phase. The rulebook bounds this to before
 * Contribution cards are chosen precisely so it cannot be used to manufacture Wood for a
 * card already revealed, or for a Fuel Ledger upgrade after the fact.
 */
function resolveFiringClaySubstitution(
  state: GameState,
  actorId: PlayerId,
  clay: number,
  wood: number,
  use: boolean,
): ApplyResult {
  const phase = requirePhase(state, "firing_before_contribution");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  if (phase.techniqueIds[phase.queue.currentIndex] !== "T03") {
    return applyFailure(ruleError("INVALID_ACTION", "Clay Substitution is not the current decision."));
  }
  const player = state.players[actorId];
  if (use) {
    const technique = player === undefined ? undefined : ownedTechnique(player, "T03");
    if (technique === undefined || technique.exhausted) {
      return applyFailure(ruleError("TECHNIQUE_EXHAUSTED", "Clay Substitution is unavailable."));
    }
    if (!Number.isInteger(clay) || !Number.isInteger(wood) || clay < 0 || wood < 0 ||
        clay + wood !== CLAY_SUBSTITUTION_RESOURCES) {
      return applyFailure(
        ruleError("INVALID_SELECTION", "Clay Substitution grants exactly 3 resources.", { clay, wood }),
      );
    }
    if ((player?.resources.coins ?? 0) < CLAY_SUBSTITUTION_COINS) {
      return applyFailure(
        ruleError("INSUFFICIENT_RESOURCES", "Clay Substitution costs 3 Coins.", {
          requiredCoins: CLAY_SUBSTITUTION_COINS,
        }),
      );
    }
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  if (use) {
    const nextPlayer = next.players[actorId];
    if (nextPlayer === undefined) throw new Error("Clay Substitution actor disappeared");
    nextPlayer.resources.coins -= CLAY_SUBSTITUTION_COINS;
    next.commonSupply.coins += CLAY_SUBSTITUTION_COINS;
    const gainedClay = gainFromSupply(next, nextPlayer, "clay", clay);
    const gainedWood = gainFromSupply(next, nextPlayer, "wood", wood);
    exhaustTechnique(nextPlayer, actorId, "T03", events);
    events.push({
      type: "RESOURCES_CHANGED",
      playerId: actorId,
      clay: gainedClay,
      wood: gainedWood,
      coins: -CLAY_SUBSTITUTION_COINS,
    });
  }
  advanceQueuedWindow(next, () => openContributionPhase(next));
  return success(next, events);
}

function resolveTestPieces(state: GameState, actorId: PlayerId, use: boolean, rng: RandomSource): ApplyResult {
  const phase = requirePhase(state, "firing_before_contribution");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  if (phase.techniqueIds[phase.queue.currentIndex] !== "T12") {
    return applyFailure(ruleError("INVALID_ACTION", "Test Pieces is not the current decision."));
  }
  const player = state.players[actorId];
  if (use) {
    const technique = player === undefined ? undefined : ownedTechnique(player, "T12");
    if (technique === undefined || technique.exhausted) {
      return applyFailure(ruleError("INVALID_ACTION", "Test Pieces is not eligible."));
    }
    if ((player?.resources.wood ?? 0) < 1) {
      return applyFailure(ruleError("INSUFFICIENT_RESOURCES", "Test Pieces costs 1 Wood."));
    }
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  if (use) {
    const nextPlayer = next.players[actorId];
    if (nextPlayer === undefined) throw new Error("Test Pieces actor disappeared");
    ensureFireDeck(next, rng);
    const peek = next.fireDeck[0];
    if (peek === undefined) throw new Error("Test Pieces cannot peek an empty Fire deck");
    next.privateFirePeeks ??= {};
    next.privateFirePeeks[actorId] = peek;
    nextPlayer.resources.wood -= 1;
    next.commonSupply.wood += 1;
    exhaustTechnique(nextPlayer, actorId, "T12", events);
    events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: -1, coins: 0 });
  }
  advanceQueuedWindow(next, () => openContributionPhase(next));
  return success(next, events);
}

function resolveKilnRecords(state: GameState, actorId: PlayerId, use: boolean): ApplyResult {
  const phase = requirePhase(state, "firing_after_firing");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  if (phase.techniqueIds[phase.queue.currentIndex] !== "T13") {
    return applyFailure(ruleError("INVALID_ACTION", "Kiln Records is not the current decision."));
  }
  const player = state.players[actorId];
  if (use) {
    const technique = player === undefined ? undefined : ownedTechnique(player, "T13");
    const masterpieceCount = Object.values(state.firingContext?.ceramicResults ?? {}).filter(
      (result) =>
        result.assignedQuality === "masterpiece" &&
        state.ceramics[result.ceramicId]?.ownerId === actorId,
    ).length;
    if (technique === undefined || technique.exhausted || masterpieceCount < 1) {
      return applyFailure(ruleError("INVALID_ACTION", "Kiln Records is not eligible."));
    }
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  if (use) {
    const nextPlayer = next.players[actorId];
    if (nextPlayer === undefined) throw new Error("Kiln Records actor disappeared");
    const gainedClay = gainFromSupply(next, nextPlayer, "clay", 1);
    const gainedCoins = gainFromSupply(next, nextPlayer, "coins", 2);
    exhaustTechnique(nextPlayer, actorId, "T13", events);
    if (gainedClay > 0 || gainedCoins > 0) {
      events.push({
        type: "RESOURCES_CHANGED",
        playerId: actorId,
        clay: gainedClay,
        wood: 0,
        coins: gainedCoins,
      });
    }
  }
  advanceQueuedWindow(next, () => finalizeFiring(next, events));
  return success(next, events);
}

function finalizeFiring(state: GameState, events: GameEvent[]): void {
  const context = state.firingContext;
  if (
    context === null ||
    context.baseHeat === null ||
    context.fireModifier === null ||
    context.globalHeat === null
  ) {
    throw new Error("Cannot finalize an incomplete firing");
  }
  for (const result of Object.values(context.ceramicResults)) {
    const ceramic = state.ceramics[result.ceramicId];
    if (ceramic === undefined || ceramic.stage !== "loaded" || result.assignedQuality === null) {
      throw new Error("Firing result is incomplete");
    }
    events.push({
      type: "FIRING_RESOLVED",
      ceramicId: result.ceramicId,
      fireModifier: context.fireModifier,
      zoneModifier: result.zoneModifier,
      ignoredFireModifier: result.ignoredFireModifier,
      naturalActualHeat: result.naturalActualHeat,
      naturalHeatDifference: result.naturalHeatDifference,
      naturalQuality: qualityFromDifference(result.naturalHeatDifference),
      finalActualHeat: result.finalActualHeat,
      finalHeatDifference: result.finalHeatDifference,
      finalQuality: result.assignedQuality,
    });
    state.ceramics[result.ceramicId] = makeFinishedCeramic(
      ceramic,
      result.assignedQuality,
      state.round,
    );
  }
  state.lastFiringResult = {
    round: context.round,
    contributors: [...context.contributors],
    contributions: { ...context.contributions },
    baseHeat: context.baseHeat,
    fireModifier: context.fireModifier,
    globalHeat: context.globalHeat,
  };
  state.fireDiscard.push(context.fireModifier);
  state.firingContext = null;
  state.privateFirePeeks = {};
  beginOrderPhase(state);
}

function advanceImperialProgress(
  state: GameState,
  playerId: PlayerId,
  reward: 1 | 2 | 3,
  source: "imperial_order" | "court_patronage",
  events: GameEvent[],
  detail: {
    orderId: Extract<GameAction, { type: "COMPLETE_ORDER" }>["orderId"] | null;
    requirementCeramicCount: number | null;
    requirementCategory:
      | "single_fine"
      | "single_masterpiece"
      | "multi_2"
      | "multi_3"
      | "court_patronage"
      | null;
  } = { orderId: null, requirementCeramicCount: null, requirementCategory: null },
): { from: PlayerState["imperialProgress"]; to: PlayerState["imperialProgress"] } {
  const player = state.players[playerId];
  if (player === undefined) throw new Error("Imperial Progress player disappeared");
  const activeRules = activeImperialTrackRules(state.experimentConfig);
  const from = player.imperialProgress;
  const to = Math.min(5, from + reward) as PlayerState["imperialProgress"];
  player.imperialProgress = to;
  const crossedSpaces = Array.from({ length: to - from }, (_, index) => from + index + 1);
  const apprenticeMilestonesTriggered = activeRules.apprenticeMilestoneSpaces.filter(
    (space) => crossedSpaces.includes(space),
  );
  player.pendingApprenticeUnlocks += apprenticeMilestonesTriggered.length;
  const presentationMilestonesTriggered = activeRules.presentationSpaces.filter(
    (space) => crossedSpaces.includes(space),
  );
  // v1.1.4 pays no Coin stipend at Progress 2 or 4. The event field is retained so
  // serialized v1.1.1 matches still decode; it is always empty under the current rules.
  const stipendMilestonesTriggered: number[] = [];
  const sealMilestoneTriggered = source === "imperial_order" &&
    activeRules.imperialSealEnabled &&
    crossedSpaces.includes(5) &&
    state.imperialSealOwnerId === null;
  events.push({
    type: "IMPERIAL_PROGRESS_ADVANCED",
    playerId,
    source,
    orderId: detail.orderId,
    requirementCeramicCount: detail.requirementCeramicCount,
    requirementCategory: detail.requirementCategory,
    from,
    to,
    reward,
    appliedGain: to - from,
    crossedSpaces,
    capLoss: reward - (to - from),
    apprenticeMilestonesTriggered: [...apprenticeMilestonesTriggered],
    presentationMilestonesTriggered: [...presentationMilestonesTriggered],
    stipendMilestonesTriggered: [...stipendMilestonesTriggered],
    sealMilestoneTriggered,
    trackVpBefore: activeRules.trackVp[from],
    trackVpAfter: activeRules.trackVp[to],
    sealVp: activeRules.imperialSealVp,
  });
  if (sealMilestoneTriggered) {
    state.imperialSealOwnerId = playerId;
    events.push({ type: "IMPERIAL_SEAL_CLAIMED", playerId, sealVp: activeRules.imperialSealVp });
  }
  return { from, to };
}

function useCourtPatronage(
  state: GameState,
  actorId: PlayerId,
  workerId: string,
): ApplyResult {
  const context = validateWorkerAction(
    state,
    actorId,
    workerId,
    "court_patronage",
  );
  if (!isWorkerContext(context)) return context;
  if (context.worker.kind !== "shifu") {
    return applyFailure(ruleError("INVALID_ACTION", "Court Patronage requires a Shifu."));
  }
  if (!context.player.completedOrders.some(({ orderId }) => orderId.startsWith("I"))) {
    return applyFailure(
      ruleError(
        "INVALID_ACTION",
        "Complete at least one Imperial Order before using Court Patronage.",
      ),
    );
  }
  if (context.player.resources.coins < 4) {
    return applyFailure(
      ruleError("INSUFFICIENT_RESOURCES", "Court Patronage costs 4 Coins.", {
        requiredCoins: 4,
      }),
    );
  }
  if (context.player.imperialProgress >= 4) {
    return applyFailure(
      ruleError(
        "INVALID_ACTION",
        context.player.imperialProgress === 5
          ? "Court Patronage is unavailable at Progress 5."
          : "Progress 4 must reach 5 by completing an Imperial Order.",
      ),
    );
  }

  const next = cloneState(state);
  const events: GameEvent[] = [];
  placeWorker(next, actorId, workerId, "court_patronage", events);
  const player = next.players[actorId];
  if (player === undefined) throw new Error("Court Patronage actor disappeared");
  player.resources.coins -= 4;
  next.commonSupply.coins += 4;
  events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: 0, coins: -4 });
  const progress = advanceImperialProgress(next, actorId, 1, "court_patronage", events, {
    orderId: null,
    requirementCeramicCount: null,
    requirementCategory: "court_patronage",
  });
  events.push({
    type: "COURT_PATRONAGE_USED",
    playerId: actorId,
    cost: 5,
    from: progress.from as 0 | 1 | 2 | 3,
    to: progress.to as 1 | 2 | 3 | 4,
  });
  completeWorkerAction(next, actorId, events);
  return success(next, events);
}

function completeOrder(
  state: GameState,
  actorId: PlayerId,
  action: Extract<GameAction, { type: "COMPLETE_ORDER" }>,
): ApplyResult {
  const phase = requirePhase(state, "orders");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  const player = state.players[actorId];
  const definition = ORDER_DEFINITIONS[action.orderId];
  if (player === undefined || definition === undefined || !player.orderHand.includes(action.orderId)) {
    return applyFailure(ruleError("ORDER_NOT_AVAILABLE", "The selected Order is not in hand."));
  }
  if (new Set(action.ceramicIds).size !== action.ceramicIds.length) {
    return applyFailure(ruleError("INVALID_SELECTION", "A ceramic may be delivered only once."));
  }
  const selected: FinishedCeramic[] = [];
  for (const ceramicId of action.ceramicIds) {
    const ceramic = state.ceramics[ceramicId];
    if (ceramic === undefined) {
      return applyFailure(ruleError("CERAMIC_NOT_FOUND", "A selected ceramic does not exist."));
    }
    if (ceramic.ownerId !== actorId || ceramic.stage !== "finished") {
      return applyFailure(
        ruleError("ILLEGAL_CERAMIC_STAGE", "Orders require owned Finished, undelivered ceramics."),
      );
    }
    selected.push(ceramic);
  }
  const isImperial = action.orderId.startsWith("I");
  const guanTriggers = isImperial && player.kilnId === "GU" && !player.kilnAbilityUsedThisRound;
  const ruTriggers = player.kilnId === "RU" && !player.kilnAbilityUsedThisRound
    && selected.some((ceramic) => ruBonusCeramic(ceramic));
  if (action.useGuanWaiver) {
    if (
      !isImperial ||
      player.kilnId !== "GU" ||
      player.kilnAbilityUsedThisRound ||
      !definition.ceramics.some((requirement) => requirement.decoration !== undefined)
    ) {
      return applyFailure(
        ruleError("INVALID_ACTION", "Guan's waiver is unavailable for this Order."),
      );
    }
  }
  if (!matchesOrder(definition, selected, action.useGuanWaiver)) {
    return applyFailure(
      ruleError("ORDER_REQUIREMENTS_NOT_MET", "The selected ceramics do not fulfil this Order."),
    );
  }

  const next = cloneState(state);
  const nextPlayer = next.players[actorId];
  if (nextPlayer === undefined) throw new Error("Order actor disappeared");
  const handIndex = nextPlayer.orderHand.indexOf(action.orderId);
  nextPlayer.orderHand.splice(handIndex, 1);
  const gainedCoins = gainFromSupply(next, nextPlayer, "coins", definition.coins);
  nextPlayer.score.orderVp += definition.vp;
  for (const ceramicId of action.ceramicIds) {
    const ceramic = next.ceramics[ceramicId];
    if (ceramic === undefined || ceramic.stage !== "finished") {
      throw new Error("Validated Order ceramic disappeared");
    }
    next.ceramics[ceramicId] = {
      id: ceramic.id,
      vesselInstanceId: ceramic.vesselInstanceId,
      ownerId: ceramic.ownerId,
      shape: ceramic.shape,
      stage: "delivered",
      glaze: ceramic.glaze,
      decoration: ceramic.decoration,
      quality: ceramic.quality,
      orderId: action.orderId,
    };
  }
  nextPlayer.completedOrders.push({
    orderId: action.orderId,
    ceramicIds: [...action.ceramicIds],
    completedInRound: next.round,
    vpAwarded: definition.vp,
    coinsAwarded: gainedCoins,
    usedGuanWaiver: action.useGuanWaiver,
  });
  const events: GameEvent[] = [
    { type: "ORDER_COMPLETED", playerId: actorId, orderId: action.orderId, ceramicIds: [...action.ceramicIds] },
  ];
  if (gainedCoins > 0) {
    events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: 0, coins: gainedCoins });
  }
  if (guanTriggers) {
    // Guan pays a Coin stipend and a point. The Coins matter in the early rounds, when a
    // workshop is poor and a Technique or Decoration is out of reach; the VP matters in
    // Round 5, when Coins are nearly dead. Paying only in Coins -- as it did before --
    // meant the ability delivered about half a point across a whole game, because Guan
    // ended richer than everyone else and could not spend the difference.
    const guanCoins = gainFromSupply(next, nextPlayer, "coins", 2);
    nextPlayer.score.kilnTraditionVp += GUAN_ORDER_VP;
    nextPlayer.kilnAbilityUsedThisRound = true;
    events.push({ type: "KILN_ABILITY_USED", playerId: actorId, kilnId: "GU" });
    if (guanCoins > 0) events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: 0, coins: guanCoins });
  }
  if (ruTriggers) {
    nextPlayer.score.kilnTraditionVp += RU_ORDER_VP;
    nextPlayer.kilnAbilityUsedThisRound = true;
    events.push({ type: "KILN_ABILITY_USED", playerId: actorId, kilnId: "RU" });
  }
  if (isImperial && nextPlayer.imperialProgress < 5) {
    const printedReward = definition.imperialProgressReward;
    if (printedReward === undefined) throw new Error("Imperial Order progress reward is missing");
    const reward = activeImperialOrderProgressReward(next.experimentConfig, printedReward);
    const ceramicCount = definition.ceramics.length;
    const requirementCategory = ceramicCount === 1
      ? definition.minQuality === "masterpiece" ? "single_masterpiece" : "single_fine"
      : ceramicCount === 2 ? "multi_2" : "multi_3";
    advanceImperialProgress(next, actorId, reward, "imperial_order", events, {
      orderId: action.orderId,
      requirementCeramicCount: ceramicCount,
      requirementCategory,
    });
  }
  return success(next, events);
}

function refillTo<T>(display: T[], deck: T[], target: number): void {
  while (display.length < target) {
    const card = deck.shift();
    if (card === undefined) return;
    display.push(card);
  }
}

function rotateOrderDisplaysAtStartOfRound(state: GameState, events: GameEvent[], rng: RandomSource): void {
  if (state.round === 1) return;
  // v1.1.5 rotates two cards from each display, so half the offer turns over each round.
  const marketOrderIds = state.marketDisplay.splice(0, ORDER_DISPLAY_ROTATION);
  const imperialOrderIds = state.imperialDisplay.splice(0, ORDER_DISPLAY_ROTATION);
  state.marketDiscard.push(...marketOrderIds);
  state.imperialDiscard.push(...imperialOrderIds);
  ensureOrderDeck(state, "market", rng);
  ensureOrderDeck(state, "imperial", rng);
  refillTo(state.marketDisplay, state.marketDeck, GAME_CONFIG.orderDisplay.market);
  refillTo(state.imperialDisplay, state.imperialDeck, GAME_CONFIG.orderDisplay.imperial);
  events.push({
    type: "ORDER_DISPLAYS_ROTATED",
    round: state.round,
    marketOrderIds,
    imperialOrderIds,
  });
}

function calculatePresentationVp(state: GameState, player: PlayerState): number {
  const ceramics = player.presentationCeramicIds.map((id) => state.ceramics[id]).filter(
    (ceramic): ceramic is Extract<CeramicState, { stage: "presented" }> =>
      ceramic?.stage === "presented",
  );
  let score = ceramics.reduce(
    (sum, ceramic) => sum + IMPERIAL_PROGRESS.exhibition.qualityVp[ceramic.quality],
    0,
  );
  const diversityEligible = IMPERIAL_PROGRESS.exhibition.diversityEligibleSpaces.includes(
    player.imperialProgress,
  );
  if (diversityEligible && ceramics.length === 3 && new Set(ceramics.map((ceramic) => ceramic.shape)).size === 3) {
    score += IMPERIAL_PROGRESS.exhibition.threeDifferentShapesBonus;
  }
  if (diversityEligible && ceramics.length === 3 && new Set(ceramics.map((ceramic) => ceramic.glaze)).size === 3) {
    score += IMPERIAL_PROGRESS.exhibition.threeDifferentGlazesBonus;
  }
  return score;
}

function masterpiecesDeliveredOrPresented(state: GameState, playerId: PlayerId): number {
  return Object.values(state.ceramics).filter(
    (ceramic) =>
      ceramic.ownerId === playerId &&
      (ceramic.stage === "delivered" || ceramic.stage === "presented") &&
      ceramic.quality === "masterpiece",
  ).length;
}

export function calculateFinalResult(state: GameState): FinalResult {
  const activeRules = activeImperialTrackRules(state.experimentConfig);
  const scores: FinalResult["scores"] = {};
  for (const playerId of state.playerOrder) {
    const player = state.players[playerId];
    if (player === undefined) throw new Error("Scoring player disappeared");
    const progressVp = activeRules.trackVp[player.imperialProgress] ?? 0;
    const sealVp = state.imperialSealOwnerId === playerId ? activeRules.imperialSealVp : 0;
    const presentationVp = calculatePresentationVp(state, player);
    const coinVp = Math.min(
      GAME_CONFIG.coinEndGame.maxVp,
      Math.floor(player.resources.coins / GAME_CONFIG.coinEndGame.coinsPerVp),
    );
    const techniqueVp = player.techniques.length;
    const total =
      player.score.orderVp +
      progressVp +
      sealVp +
      presentationVp +
      player.score.kilnTraditionVp +
      techniqueVp +
      coinVp;
    scores[playerId] = {
      orders: player.score.orderVp,
      imperialProgress: progressVp,
      imperialSeal: sealVp,
      presentation: presentationVp,
      immediateAbilities: player.score.kilnTraditionVp,
      techniques: techniqueVp,
      leftoverCoins: coinVp,
      total,
    };
  }

  const maximumBy = (ids: PlayerId[], value: (id: PlayerId) => number): PlayerId[] => {
    const maximum = Math.max(...ids.map(value));
    return ids.filter((id) => value(id) === maximum);
  };
  let finalists = maximumBy(state.playerOrder, (id) => scores[id]?.total ?? 0);
  if (finalists.length === 1) return { scores, winnerIds: finalists, resolvedBy: "total_vp" };
  finalists = maximumBy(finalists, (id) => state.players[id]?.imperialProgress ?? 0);
  if (finalists.length === 1) {
    return { scores, winnerIds: finalists, resolvedBy: "imperial_progress" };
  }
  finalists = maximumBy(
    finalists,
    (id) => state.players[id]?.completedOrders.filter((order) => order.orderId.startsWith("I")).length ?? 0,
  );
  if (finalists.length === 1) {
    return { scores, winnerIds: finalists, resolvedBy: "completed_imperial_orders" };
  }
  finalists = maximumBy(finalists, (id) => masterpiecesDeliveredOrPresented(state, id));
  if (finalists.length === 1) {
    return {
      scores,
      winnerIds: finalists,
      resolvedBy: "masterpieces_delivered_or_presented",
    };
  }
  return { scores, winnerIds: finalists, resolvedBy: "shared_victory" };
}

function finalizeGame(state: GameState, events: GameEvent[]): void {
  const result = calculateFinalResult(state);
  state.finalResult = result;
  state.phase = { type: "finished" };
  events.push({ type: "FINAL_SCORE_CALCULATED", result });
}

function performCleanup(state: GameState, events: GameEvent[], rng: RandomSource): void {
  for (const player of Object.values(state.players)) {
    for (const worker of Object.values(player.workers)) {
      if (worker.status === "placed") {
        worker.status = "available";
        worker.locationId = null;
      }
    }
    while (player.pendingApprenticeUnlocks > 0) {
      if (state.round === 5) {
        const coins = gainFromSupply(state, player, "coins", 3);
        player.pendingApprenticeUnlocks -= 1;
        if (coins > 0) events.push({ type: "RESOURCES_CHANGED", playerId: player.id, clay: 0, wood: 0, coins });
        // An Apprentice unlocked in Cleanup of Round 5 can never act, so it pays points
        // instead. 3 Coins was worth about 1 VP against the 3-per-VP cap, which did not
        // match the 2 VP an even Progress space pays for the same advance.
        player.score.kilnTraditionVp += ROUND_FIVE_UNLOCK_VP;
        events.push({ type: "ROUND_FIVE_UNLOCK_VP_REWARD", playerId: player.id, vp: ROUND_FIVE_UNLOCK_VP });
        continue;
      }
      const worker = Object.values(player.workers).find(
        (candidate) => candidate.kind === "apprentice" && candidate.status === "locked",
      );
      if (worker === undefined) throw new Error("No locked Apprentice remains to unlock");
      worker.status = "available";
      player.pendingApprenticeUnlocks -= 1;
      events.push({ type: "APPRENTICE_UNLOCKED", playerId: player.id, workerId: worker.id });
    }
  }
  state.actionBoard.placements = emptyActionBoard();

  const firstIndex = state.playerOrder.indexOf(state.firstPlayerId);
  const nextFirst = state.playerOrder[(firstIndex + 1) % state.playerOrder.length];
  if (nextFirst === undefined) throw new Error("Unable to pass First Player");
  state.firstPlayerId = nextFirst;

  if (state.round < 5) {
    state.round = (state.round + 1) as RoundNumber;
    rotateOrderDisplaysAtStartOfRound(state, events, rng);
    for (const player of Object.values(state.players)) {
      player.passedWorkPhase = false;
      player.kilnAbilityUsedThisRound = false;
      for (const technique of player.techniques) technique.exhausted = false;
    }
    for (const discipline of ["forming", "glazing", "firing"] as TechniqueDiscipline[]) {
      refillTo(
        state.techniqueDisplay[discipline],
        state.techniqueDecks[discipline],
        GAME_CONFIG.techniques.faceUpPerDiscipline,
      );
    }
    state.phase = { type: "work", activePlayerId: state.firstPlayerId };
    events.push({ type: "ROUND_STARTED", round: state.round, firstPlayerId: state.firstPlayerId });
    return;
  }

  const eligiblePlayerIds = [...state.playerOrder];
  state.phase = { type: "presentation", eligiblePlayerIds, submittedPlayerIds: [] };
}

function beginCleanupOrderDiscards(state: GameState, events: GameEvent[], rng: RandomSource): void {
  const actors = turnOrderFromFirst(state).filter((playerId) => {
    const player = state.players[playerId];
    return player !== undefined && player.orderHand.length > orderHandLimit();
  });
  if (actors.length === 0) performCleanup(state, events, rng);
  else state.phase = { type: "cleanup_orders", queue: { actors, currentIndex: 0 } };
}

function discardOrdersForCleanup(
  state: GameState,
  actorId: PlayerId,
  orderIds: OrderId[],
  rng: RandomSource,
): ApplyResult {
  const phase = requirePhase(state, "cleanup_orders");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  const player = state.players[actorId];
  if (player === undefined) return applyFailure(ruleError("UNKNOWN_PLAYER", "Cleanup player was not found."));
  const required = player.orderHand.length - orderHandLimit();
  if (orderIds.length !== required || new Set(orderIds).size !== orderIds.length || orderIds.some((id) => !player.orderHand.includes(id))) {
    return applyFailure(ruleError("INVALID_SELECTION", `Discard exactly ${required} Orders for cleanup.`));
  }
  const next = cloneState(state);
  const nextPlayer = next.players[actorId];
  if (nextPlayer === undefined) throw new Error("Cleanup player disappeared");
  nextPlayer.orderHand = nextPlayer.orderHand.filter((id) => !orderIds.includes(id));
  for (const id of orderIds) (id.startsWith("M") ? next.marketDiscard : next.imperialDiscard).push(id);
  const events: GameEvent[] = [{ type: "ORDERS_DISCARDED_FOR_CLEANUP", playerId: actorId, orderIds: [...orderIds] }];
  advanceQueuedWindow(next, () => performCleanup(next, events, rng));
  return success(next, events);
}

function endOrderTurn(state: GameState, actorId: PlayerId, rng: RandomSource): ApplyResult {
  const phase = requirePhase(state, "orders");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  const next = cloneState(state);
  const events: GameEvent[] = [];
  if (next.phase.type !== "orders") throw new Error("Order phase invariant failed");
  next.phase.currentIndex += 1;
  const nextActor = next.phase.turnOrder[next.phase.currentIndex];
  if (nextActor === undefined) beginCleanupOrderDiscards(next, events, rng);
  else next.phase.activePlayerId = nextActor;
  return success(next, events);
}

function submitPresentation(
  state: GameState,
  actorId: PlayerId,
  ceramicIds: string[],
): ApplyResult {
  const phase = requirePhase(state, "presentation");
  if (isFailure(phase)) return phase;
  const player = state.players[actorId];
  if (player === undefined || !phase.eligiblePlayerIds.includes(actorId)) {
    return applyFailure(ruleError("PRESENTATION_NOT_ELIGIBLE", "This player cannot submit an End-game Exhibition selection."));
  }
  if (phase.submittedPlayerIds.includes(actorId)) {
    return applyFailure(ruleError("INVALID_ACTION", "This player already submitted an End-game Exhibition selection."));
  }
  const maximum = IMPERIAL_PROGRESS.exhibition.capacityByProgress[player.imperialProgress] ?? 0;
  if (
    ceramicIds.length > maximum ||
    new Set(ceramicIds).size !== ceramicIds.length
  ) {
    return applyFailure(ruleError("INVALID_SELECTION", `Exhibit at most ${maximum} unique ceramics.`));
  }
  for (const ceramicId of ceramicIds) {
    const ceramic = state.ceramics[ceramicId];
    if (
      ceramic === undefined ||
      ceramic.ownerId !== actorId ||
      ceramic.stage !== "finished" ||
      QUALITY_RANK[ceramic.quality] < QUALITY_RANK.standard
    ) {
      return applyFailure(
        ruleError("PRESENTATION_NOT_ELIGIBLE", "End-game Exhibition requires owned Finished Standard+ ceramics."),
      );
    }
  }

  const next = cloneState(state);
  const nextPlayer = next.players[actorId];
  if (next.phase.type !== "presentation" || nextPlayer === undefined) {
    throw new Error("Presentation invariant failed");
  }
  for (const ceramicId of ceramicIds) {
    const ceramic = next.ceramics[ceramicId];
    if (ceramic === undefined || ceramic.stage !== "finished" || ceramic.quality === "flawed") {
      throw new Error("Validated Presentation ceramic disappeared");
    }
    next.ceramics[ceramicId] = {
      id: ceramic.id,
      vesselInstanceId: ceramic.vesselInstanceId,
      ownerId: ceramic.ownerId,
      shape: ceramic.shape,
      stage: "presented",
      glaze: ceramic.glaze,
      decoration: ceramic.decoration,
      quality: ceramic.quality,
    };
  }
  nextPlayer.presentationCeramicIds = [...ceramicIds];
  next.phase.submittedPlayerIds.push(actorId);
  const events: GameEvent[] = [
    { type: "PRESENTATION_SUBMITTED", playerId: actorId, ceramicIds: [...ceramicIds] },
  ];
  if (next.phase.submittedPlayerIds.length === next.phase.eligiblePlayerIds.length) {
    finalizeGame(next, events);
  }
  return success(next, events);
}

export function applyAction(
  state: GameState,
  actorId: PlayerId,
  action: GameAction,
  rng: RandomSource,
): ApplyResult {
  switch (action.type) {
    case "SELECT_KILN":
      return selectKiln(state, actorId, action.kilnId);
    case "SUBMIT_STARTING_ORDERS":
      return submitStartingOrders(state, actorId, action.orderIds, rng);
    case "KEEP_STARTING_ORDER":
    case "REDRAW_STARTING_ORDER":
      return submitLegacyStartingOrders(state, actorId, rng);
    case "PASS_WORK_PHASE":
      return passWorkPhase(state, actorId);
    case "GAIN_MATERIALS":
      return gainMaterials(state, actorId, action);
    case "FORM_CERAMICS":
      return formCeramics(state, actorId, action);
    case "GLAZE_CERAMICS":
      return glazeCeramics(state, actorId, action);
    case "USE_KILN_YARD":
      return useKilnYard(state, actorId, action);
    case "USE_LABOUR":
      return useLabour(state, actorId, action.workerId);
    case "BEGIN_OFFICE_ORDERS":
      return beginOfficeOrders(state, actorId, action.workerId, action.mode);
    case "OFFICE_TAKE_ORDER":
      return takeOfficeOrder(state, actorId, action.orderId, rng);
    case "OFFICE_DRAW_BLIND_ORDER":
      return drawBlindOfficeOrder(state, actorId, action.deck, rng);
    case "OFFICE_END_ORDERS":
      return endOfficeOrders(state, actorId);
    case "OFFICE_USE_COLOUR_SAMPLES":
      return useColourSamples(state, actorId, action.deck ?? (action.orderId?.startsWith("I") ? "imperial" : "market"), rng);
    case "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER":
      return chooseColourSamplesOrder(state, actorId, action.orderId);
    case "OFFICE_SKIP_COLOUR_SAMPLES":
      return skipColourSamples(state, actorId);
    case "OFFICE_RESOLVE_FLAWED_SALE":
      return resolveOfficeFlawedSale(state, actorId, action.ceramicIds);
    case "OFFICE_RESOLVE_CONNOISSEUR_NETWORK":
      return resolveConnoisseurNetwork(state, actorId, action.ceramicId);
    case "USE_COURT_PATRONAGE":
      return useCourtPatronage(state, actorId, action.workerId);
    case "BEGIN_GUILD_ACTION":
      return beginGuildAction(state, actorId, action.workerId);
    case "GUILD_REFRESH_TECHNIQUE":
      return refreshGuildTechnique(state, actorId, action.techniqueId);
    case "GUILD_SKIP_REFRESH":
      return skipGuildRefresh(state, actorId);
    case "GUILD_BUY_TECHNIQUE":
      return buyGuildTechnique(state, actorId, action.techniqueId);
    case "RESOLVE_KILN_SETTING":
      return resolveKilnSetting(state, actorId, action.ceramicId, action.toSpaceId);
    case "RESOLVE_KILN_YARD_REPOSITION":
      return resolveKilnYardReposition(state, actorId, action.ceramicId, action.toSpaceId, rng);
    case "RESOLVE_FUEL_LEDGER":
      return resolveFuelLedger(state, actorId, action.use, rng);
    case "RESOLVE_SAGGER_SELECTION":
      return resolveSaggerSelection(state, actorId, action.ceramicId);
    case "RESOLVE_JUN":
      return resolveJun(state, actorId, action.ceramicId, action.delta);
    case "RESOLVE_GE":
      return resolveGe(state, actorId, action.ceramicId);
    case "RESOLVE_PROTECTIVE_SAGGARS":
      return resolveProtectiveSaggars(state, actorId, action.ceramicId);
    case "RESOLVE_SECOND_FIRING":
      return resolveSecondFiring(state, actorId, action.ceramicId);
    case "RESOLVE_FIRING_CLAY_SUBSTITUTION":
      return resolveFiringClaySubstitution(state, actorId, action.clay, action.wood, action.use);
    case "RESOLVE_TEST_PIECES":
      return resolveTestPieces(state, actorId, action.use, rng);
    case "RESOLVE_KILN_RECORDS":
      return resolveKilnRecords(state, actorId, action.use);
    case "COMPLETE_ORDER":
      return completeOrder(state, actorId, action);
    case "END_ORDER_TURN":
      return endOrderTurn(state, actorId, rng);
    case "DISCARD_ORDERS_FOR_CLEANUP":
      return discardOrdersForCleanup(state, actorId, action.orderIds, rng);
    case "SUBMIT_PRESENTATION":
      return submitPresentation(state, actorId, action.ceramicIds);
  }
}

export function makeFinishedCeramic(
  ceramic: CeramicState,
  quality: "flawed" | "standard" | "fine" | "masterpiece",
  round: 1 | 2 | 3 | 4 | 5,
): FinishedCeramic {
  if (ceramic.stage !== "loaded") {
    throw new Error("Only a Loaded ceramic can become Finished");
  }
  const { kilnSpaceId: _kilnSpaceId, ...rest } = ceramic;
  return { ...rest, stage: "finished", quality, firedInRound: round };
}
