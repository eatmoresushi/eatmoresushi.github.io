import {
  ACTION_LOCATION_PRICES,
  COLOUR_SAMPLES_LOOK,
  DECORATION_COSTS,
  DISCIPLINES,
  FORMING_TECH_COINS,
  GUILD_SHIFU_INSPECT,
  DECORATIONS,
  GAME_CONFIG,
  GLAZES,
  IMPERIAL_PROGRESS,
  KILN_IDS,
  KILN_SPACE_IDS,
  ORDER_DEFINITIONS,
  SHAPE_COSTS,
  SHAPES,
  STARTING_TECHNIQUE_DEFINITIONS,
  TECHNIQUE_DEFINITIONS,
  CONTRIBUTION_CARD_IDS,
  activeKilnSpaceIds,
  locationCapacity,
} from "./content.ts";
import { applyFailure, ruleError } from "./errors.ts";
import {
  FUEL_LEDGER_WOOD,
  GE_ACTIVATION_WOOD,
  GE_CORRECTABLE_DIFFERENCES,
  JUN_ACTIVATION_WOOD,
  QUALITY_RANK,
  contributionHeatAdjustment,
  contributionWoodCost,
  determineBaseHeat,
  fuelLedgerHeatDelta,
  kilnZoneModifier,
  preferredHeat,
  qualityFromDifference,
} from "./firingRules.ts";

/** Cards discarded from each Order display at the start of Rounds 2-5. */
const ORDER_DISPLAY_ROTATION = 3;

/** Labour pays these Coins; it has no worker limit, so it is always available. */
const LABOUR_APPRENTICE_COINS = ACTION_LOCATION_PRICES.labourApprenticeCoins;
const LABOUR_SHIFU_COINS = ACTION_LOCATION_PRICES.labourShifuCoins;
import {
  DING_EXTRA_SHAPES,
  GUAN_ORDER_COINS,
  GUAN_ORDER_VP,
  RU_BONUS_QUALITY,
  RU_ORDER_VP,
  matchesOrder,
  ruBonusCeramic,
} from "./orderRules.ts";
import type { RandomSource } from "./rng.ts";
import { shuffle } from "./rng.ts";
import type { ContributionCardId, ContributionHeatAdjustment } from "./types.ts";
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
  CeramicId,
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
  const privateCapacity = locationId === "forming_studio"
    ? player.workshopSpaces.pottersWheelUnlocked
    : locationId === "glaze_workshop"
      ? player.workshopSpaces.glazeDecorationUnlocked
      : null;
  const occupancy = privateCapacity === null
    ? actionOccupancy(state, locationId)
    : Object.values(player.workers).filter((placed) => placed.locationId === locationId).length;
  const capacity = privateCapacity ?? locationCapacity(locationId, state.playerCount);
  if (occupancy >= capacity) {
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
  const order = [...turnOrderFromFirst(state)].reverse();
  const first = order[0];
  if (first === undefined) throw new Error("Order Phase requires a player");
  state.phase = { type: "orders", turnOrder: order, currentIndex: 0, activePlayerId: first, completedInCircuit: 0 };
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

/**
 * Players who may reposition a Shared-Kiln ceramic with their Kiln Yard Shifu.
 *
 * V1.2.4 moved this from mid-firing (after Base Heat, before Fire) to the end of the Work
 * Phase, before any Firing Phase ability resolves, so repositioning is now decided without
 * knowing the Base Heat the Contributions will produce.
 */
function kilnYardRepositionActors(state: GameState): PlayerId[] {
  const hasEmptySpace = activeKilnSpaceIds(state.playerCount).some((spaceId) => kilnOccupant(state, spaceId) === null);
  if (!hasEmptySpace) return [];
  return turnOrderFromFirst(state).filter((playerId) => {
    const player = state.players[playerId];
    const shifu = player === undefined ? undefined : Object.values(player.workers).find(
      (worker) => worker.kind === "shifu" && worker.status === "placed" && worker.locationId === "kiln_yard",
    );
    return shifu !== undefined && Object.values(state.ceramics).some(
      (ceramic) => ceramic.stage === "loaded" && ceramic.ownerId === playerId && ceramic.kilnSpaceId !== "imperial",
    );
  });
}

/** End of Work Phase: resolve Kiln Yard Shifu repositions, then open the Firing Phase. */
function endWorkPhase(state: GameState): void {
  const actors = Object.values(state.ceramics).some((ceramic) => ceramic.stage === "loaded")
    ? kilnYardRepositionActors(state)
    : [];
  if (actors.length === 0) beginFiringPhase(state);
  else state.phase = { type: "firing_reposition", queue: { actors, currentIndex: 0 } };
}

function beginFiringPhase(state: GameState): void {
  const loaded = Object.values(state.ceramics).filter((ceramic) => ceramic.stage === "loaded");
  if (loaded.length === 0) {
    beginOrderPhase(state);
    return;
  }
  const actors: PlayerId[] = [];
  const techniqueIds: TechniqueId[] = [];
  for (const playerId of turnOrderFromFirst(state)) {
    const player = state.players[playerId];
    const testPieces = player === undefined ? undefined : ownedTechnique(player, "T13");
    if (
          testPieces !== undefined && !testPieces.exhausted &&
          (player?.resources.wood ?? 0) >= 1 &&
          loaded.some((ceramic) => ceramic.ownerId === playerId)
    ) {
      actors.push(playerId);
      techniqueIds.push("T13");
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
  endWorkPhase(state);
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

function ensureMainOrderDeck(
  state: GameState,
  rng: RandomSource,
  requiredCards = 1,
): void {
  if (state.marketDeck.length < requiredCards && state.marketDiscard.length > 0) {
    state.marketDeck.push(...shuffle(state.marketDiscard, rng));
    state.marketDiscard.splice(0, state.marketDiscard.length);
  }
}

function ensureMainOrderCards(state: GameState, count: number, rng: RandomSource): boolean {
  ensureMainOrderDeck(state, rng, count);
  return state.marketDeck.length >= count;
}

function startWorkPhase(state: GameState): void {
  state.phase = { type: "work", activePlayerId: state.firstPlayerId };
}

function dealStartingOrders(state: GameState): ApplyResult | null {
  const offeredOrderIds: Record<PlayerId, OrderId[]> = {};
  const decisionOrder = turnOrderFromFirst(state);
  for (const playerId of turnOrderFromFirst(state)) {
    const orders = Array.from({ length: 4 }, () => state.startingOrderDeck.shift());
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
    state.phase = {
      type: "setup_starting_tech",
      decisionOrder: [...state.phase.decisionOrder],
      currentIndex: 0,
    };
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
  if (next.phase.type === "setup_starting_tech") {
    for (const [selectionPlayerId, offeredOrders] of Object.entries(nextPhase.offeredOrderIds)) {
      const kept = next.players[selectionPlayerId]?.orderHand ?? [];
      for (const returned of offeredOrders.filter((orderId) => !kept.includes(orderId))) {
        next.returnedStartingOrderIds.push(returned);
      }
    }
    events.push({
      type: "STARTING_ORDERS_REVEALED",
      ordersByPlayer: Object.fromEntries(
        Object.entries(next.players).map(([playerId, entry]) => [playerId, [...entry.orderHand]]),
      ),
    });
  }
  return success(next, events);
}

function selectStartingTech(
  state: GameState,
  actorId: PlayerId,
  techniqueId: "ST01" | "ST02" | "ST03" | "ST04",
): ApplyResult {
  const phase = requirePhase(state, "setup_starting_tech");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  if (STARTING_TECHNIQUE_DEFINITIONS[techniqueId] === undefined) {
    return applyFailure(ruleError("INVALID_SELECTION", "Choose one of the four Starting Techs."));
  }
  const next = cloneState(state);
  const player = next.players[actorId];
  if (player === undefined || next.phase.type !== "setup_starting_tech") {
    throw new Error("Starting Tech selection invariant failed");
  }
  player.startingTechniqueId = techniqueId;
  next.phase.currentIndex += 1;
  if (next.phase.currentIndex >= next.phase.decisionOrder.length) startWorkPhase(next);
  return success(next, [{ type: "STARTING_TECH_SELECTED", playerId: actorId, techniqueId }]);
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
  const { workerId, clay, wood, buyShifuBonus = false, preparedClayShape } = action;
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
  if (buyShifuBonus && context.worker.kind !== "shifu") {
    return applyFailure(ruleError("INVALID_ACTION", "Only the Shifu may buy the Materials Yard bonus."));
  }
  if (buyShifuBonus && context.player.resources.coins < 1) {
    return applyFailure(ruleError("INSUFFICIENT_RESOURCES", "The Materials Yard bonus costs 1 Coin."));
  }
  if (preparedClayShape !== undefined && (context.player.startingTechniqueId !== "ST01" || !SHAPES.includes(preparedClayShape))) {
    return applyFailure(ruleError("INVALID_ACTION", "Prepared Clay is required to form during Materials Yard."));
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
  let coinDelta = 0;
  if (buyShifuBonus) {
    player.resources.coins -= 1;
    next.commonSupply.coins += 1;
    clayDelta += gainFromSupply(next, player, "clay", 1);
    woodDelta += gainFromSupply(next, player, "wood", 1);
    coinDelta = -1;
  }
  if (preparedClayShape !== undefined) {
    const clayCost = SHAPE_COSTS[preparedClayShape];
    if (player.resources.clay < clayCost || next.vesselSupply[preparedClayShape].length < 1) {
      return applyFailure(ruleError("INSUFFICIENT_RESOURCES", "Prepared Clay cannot pay for or supply that vessel."));
    }
    player.resources.clay -= clayCost;
    next.commonSupply.clay += clayCost;
    clayDelta -= clayCost;
    const vesselInstanceId = next.vesselSupply[preparedClayShape].shift();
    if (vesselInstanceId === undefined) throw new Error("Prepared Clay vessel disappeared");
    const ceramicId = `${next.gameId}:ceramic:${next.nextCeramicSequence++}`;
    next.ceramics[ceramicId] = { id: ceramicId, vesselInstanceId, ownerId: actorId, shape: preparedClayShape, formedInRound: next.round, stage: "shaped" };
    events.push({ type: "CERAMIC_SHAPED", playerId: actorId, ceramicId, shape: preparedClayShape });
  }
  events.push({
    type: "RESOURCES_CHANGED",
    playerId: actorId,
    clay: clayDelta,
    wood: woodDelta,
    coins: coinDelta,
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
  if (
    action.shapes.length < 1 ||
    action.shapes.length > maximum ||
    action.shapes.some((shape) => !SHAPES.includes(shape))
  ) {
    return applyFailure(
      ruleError("INVALID_SELECTION", `This worker must form 1 to ${maximum} ceramics.`),
    );
  }
  const useTechniqueIds = action.useTechniqueIds ?? [];
  const techniqueFailure = validateTechniqueUses(
    context.player,
    useTechniqueIds,
    ["T01", "T04"],
  );
  if (techniqueFailure !== null) return techniqueFailure;

  const dingExtraShape = action.dingExtraShape;
  if (dingExtraShape !== undefined) {
    if (
      context.player.kilnId !== "DI" ||
      context.player.kilnAbilityUsedThisRound ||
      !(DING_EXTRA_SHAPES as readonly Shape[]).includes(dingExtraShape) ||
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
  if (action.whiteSlip !== undefined && context.player.startingTechniqueId !== "ST02") {
    return applyFailure(ruleError("INVALID_ACTION", "White Slip is not this workshop's Starting Tech."));
  }
  if (action.whiteSlip !== undefined && (
    action.whiteSlip.formedIndex < 0 ||
    action.whiteSlip.formedIndex >= allFormedShapes.length ||
    !DECORATIONS.includes(action.whiteSlip.decoration)
  )) {
    return applyFailure(ruleError("INVALID_SELECTION", "The White Slip selection is invalid."));
  }
  if (action.whiteSlip !== undefined && action.dryingFrames?.formedIndex === action.whiteSlip.formedIndex) {
    return applyFailure(ruleError("INVALID_SELECTION", "White Slip and Drying Frames must choose different vessels."));
  }

  const requiredByShape = new Map<Shape, number>();
  let totalClay = 0;
  for (const shape of allFormedShapes) {
    requiredByShape.set(shape, (requiredByShape.get(shape) ?? 0) + 1);
  }
  // V1.2.4: Ding's additional vessel costs no Clay, so it is formed but never charged.
  const chargedShapes = action.shapes;
  for (const shape of chargedShapes) {
    totalClay += SHAPE_COSTS[shape];
  }
  if (context.worker.kind === "shifu" && action.shapes.length === 2) totalClay -= 1;
  if (useTechniqueIds.includes("T01")) {
    totalClay -= 1;
  }
  const clayPaid = totalClay;
  const dryingFramesCoins = action.dryingFrames === undefined ? 0 : DECORATION_COSTS.plain;
  const whiteSlipCoins = action.whiteSlip === undefined ? 0 : DECORATION_COSTS[action.whiteSlip.decoration];
  const formingCoins = dryingFramesCoins + whiteSlipCoins;
  if (context.player.resources.clay < clayPaid || context.player.resources.coins < formingCoins) {
    return applyFailure(
      ruleError("INSUFFICIENT_RESOURCES", "Not enough resources to form the selected vessels.", {
        requiredClay: clayPaid,
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
  player.resources.coins -= formingCoins;
  next.commonSupply.clay += clayPaid;
  next.commonSupply.coins += formingCoins;
  if (clayPaid > 0 || formingCoins > 0) {
    events.push({
      type: "RESOURCES_CHANGED",
      playerId: actorId,
      clay: -clayPaid,
      wood: 0,
      coins: -formingCoins,
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
    const whiteSlip = action.whiteSlip;
    const whiteSlipApplies = whiteSlip?.formedIndex === formedIndex;
    next.ceramics[ceramicId] = dryingFramesApplies || whiteSlipApplies ? {
      id: ceramicId,
      vesselInstanceId,
      ownerId: actorId,
      shape,
      formedInRound: next.round,
      stage: "glazed",
      glaze: dryingFramesApplies ? dryingFrames?.glaze ?? "white" : "white",
      decoration: dryingFramesApplies ? "plain" : whiteSlip?.decoration ?? "plain",
    } : {
      id: ceramicId,
      vesselInstanceId,
      ownerId: actorId,
      shape,
      formedInRound: next.round,
      stage: "shaped",
    };
    events.push({ type: "CERAMIC_SHAPED", playerId: actorId, ceramicId, shape });
    if (dryingFramesApplies || whiteSlipApplies) {
      events.push({
        type: "CERAMIC_GLAZED",
        playerId: actorId,
        ceramicId,
        glaze: dryingFramesApplies ? dryingFrames?.glaze ?? "white" : "white",
        decoration: dryingFramesApplies ? "plain" : whiteSlip?.decoration ?? "plain",
      });
    }
  }
  for (const techniqueId of useTechniqueIds) exhaustTechnique(player, actorId, techniqueId, events);
  if (dingExtraShape !== undefined) {
    player.kilnAbilityUsedThisRound = true;
    events.push({ type: "KILN_ABILITY_USED", playerId: actorId, kilnId: "DI" });
  }
  const previousShapes = new Set(Object.values(state.ceramics).filter((ceramic) => ceramic.ownerId === actorId && (ceramic.stage === "shaped" || ceramic.stage === "glazed")).map((ceramic) => ceramic.shape));
  const currentShapes = new Set([...previousShapes, ...allFormedShapes]);
  const calipers = ownedTechnique(player, "T02");
  const calipersTriggers = calipers !== undefined && !calipers.exhausted && allFormedShapes.some((shape) => [...currentShapes].some((other) => other !== shape));
  const moulds = ownedTechnique(player, "T03");
  const mouldsTriggers = moulds !== undefined && !moulds.exhausted && allFormedShapes.some((shape, index) => previousShapes.has(shape) || allFormedShapes.indexOf(shape) !== index);
  player.shapesFormedThisRound = [...currentShapes];
  const rewardClay = 0;
  const rewardCoins = (calipersTriggers ? gainFromSupply(next, player, "coins", FORMING_TECH_COINS) : 0)
    + (mouldsTriggers ? gainFromSupply(next, player, "coins", FORMING_TECH_COINS) : 0);
  if (calipersTriggers) exhaustTechnique(player, actorId, "T02", events);
  if (mouldsTriggers) exhaustTechnique(player, actorId, "T03", events);
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

function glazeCeramicsV122(
  state: GameState,
  actorId: PlayerId,
  action: Extract<GameAction, { type: "GLAZE_CERAMICS" }>,
): ApplyResult {
  const context = validateWorkerAction(state, actorId, action.workerId, "glaze_workshop");
  if (!isWorkerContext(context)) return context;
  const maximum = context.worker.kind === "shifu" ? 2 : 1;
  if (action.selections.length < 1 || action.selections.length > maximum) {
    return applyFailure(ruleError("INVALID_SELECTION", `This worker must glaze 1 to ${maximum} vessels.`));
  }
  const ids = action.selections.map((selection) => selection.ceramicId);
  if (new Set(ids).size !== ids.length) return applyFailure(ruleError("INVALID_SELECTION", "A ceramic may be selected once."));
  const useTechniqueIds = action.useTechniqueIds ?? [];
  const techniqueFailure = validateTechniqueUses(context.player, useTechniqueIds, ["T05", "T06", "T07", "T08", "T09"]);
  if (techniqueFailure !== null) return techniqueFailure;
  const reworks = action.selections.filter((selection) => selection.newShape !== undefined);
  if (useTechniqueIds.includes("T05") !== (reworks.length === 1)) {
    return applyFailure(ruleError("INVALID_SELECTION", "Reworking Table must change exactly one selected vessel."));
  }
  if (useTechniqueIds.includes("T06") !== (action.glazePalette !== undefined)) {
    return applyFailure(ruleError("INVALID_SELECTION", "Glaze Palette requires one other Glazed ceramic."));
  }
  const freeDecorationCeramicId = action.freeDecorationCeramicId;
  if (freeDecorationCeramicId !== undefined && (context.worker.kind !== "shifu" || !ids.includes(freeDecorationCeramicId))) {
    return applyFailure(ruleError("INVALID_SELECTION", "The Shifu's free Decoration must be on this action."));
  }
  let totalCoins = 0;
  let addedClay = 0;
  for (const selection of action.selections) {
    const ceramic = state.ceramics[selection.ceramicId];
    if (ceramic === undefined || ceramic.ownerId !== actorId || ceramic.stage !== "shaped") {
      return applyFailure(ruleError("ILLEGAL_CERAMIC_STAGE", "Glaze & Decoration selects owned Shaped vessels only."));
    }
    if (!GLAZES.includes(selection.glaze) || !DECORATIONS.includes(selection.decoration)) {
      return applyFailure(ruleError("INVALID_SELECTION", "Unknown Glaze or Decoration."));
    }
    if (selection.newShape !== undefined) {
      if (!SHAPES.includes(selection.newShape) || selection.newShape === ceramic.shape || state.vesselSupply[selection.newShape].length < 1) {
        return applyFailure(ruleError("INVALID_SELECTION", "Reworking Table needs an available different Shape."));
      }
      addedClay += Math.max(0, SHAPE_COSTS[selection.newShape] - SHAPE_COSTS[ceramic.shape]);
    }
    const freeByTech = (selection.decoration === "carved" && useTechniqueIds.includes("T07"))
      || (selection.decoration === "impressed" && useTechniqueIds.includes("T08"))
      || (selection.decoration === "crackle" && useTechniqueIds.includes("T09"));
    if (selection.ceramicId !== freeDecorationCeramicId && !freeByTech) totalCoins += DECORATION_COSTS[selection.decoration];
  }
  for (const [techniqueId, decoration] of [["T07", "carved"], ["T08", "impressed"], ["T09", "crackle"]] as const) {
    if (useTechniqueIds.includes(techniqueId) && !action.selections.some((selection) => selection.decoration === decoration)) {
      return applyFailure(ruleError("INVALID_SELECTION", `${TECHNIQUE_DEFINITIONS[techniqueId]?.name ?? techniqueId} must waive its matching Decoration.`));
    }
  }
  if (action.glazePalette !== undefined) {
    const target = state.ceramics[action.glazePalette.ceramicId];
    if (target === undefined || target.ownerId !== actorId || target.stage !== "glazed" || ids.includes(target.id) || !GLAZES.includes(action.glazePalette.glaze)) {
      return applyFailure(ruleError("INVALID_SELECTION", "Glaze Palette must change one other owned Glazed ceramic."));
    }
  }
  if (context.player.resources.coins < totalCoins || context.player.resources.clay < addedClay) {
    return applyFailure(ruleError("INSUFFICIENT_RESOURCES", "The selected glazing and reworking costs cannot be paid."));
  }
  if (action.rapidDrying !== undefined) {
    if (context.player.startingTechniqueId !== "ST03" || !ids.includes(action.rapidDrying.ceramicId) || context.player.resources.wood < 1) {
      return applyFailure(ruleError("INVALID_ACTION", "Rapid Drying requires its Starting Tech, 1 Wood, and a ceramic glazed now."));
    }
    const destination = action.rapidDrying.kilnSpaceId;
    if (destination === "imperial") {
      const imperialOccupied = Object.values(state.ceramics).some((ceramic) => ceramic.stage === "loaded" && ceramic.ownerId === actorId && ceramic.kilnSpaceId === "imperial");
      if (!context.player.imperialKilnUnlocked || imperialOccupied) return applyFailure(ruleError("KILN_SPACE_OCCUPIED", "The Imperial Kiln is unavailable."));
    } else if (!activeKilnSpaceIds(state.playerCount).includes(destination) || kilnOccupant(state, destination) !== null) {
      return applyFailure(ruleError("KILN_SPACE_OCCUPIED", "The Rapid Drying destination is unavailable."));
    }
  }

  const next = cloneState(state);
  const events: GameEvent[] = [];
  placeWorker(next, actorId, action.workerId, "glaze_workshop", events);
  const player = next.players[actorId];
  if (player === undefined) throw new Error("Glazing actor disappeared");
  player.resources.coins -= totalCoins;
  player.resources.clay -= addedClay;
  next.commonSupply.coins += totalCoins;
  next.commonSupply.clay += addedClay;
  if (totalCoins > 0 || addedClay > 0) events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: -addedClay, wood: 0, coins: -totalCoins });
  for (const selection of action.selections) {
    const ceramic = next.ceramics[selection.ceramicId];
    if (ceramic === undefined || ceramic.stage !== "shaped") throw new Error("Glazing target disappeared");
    let vesselInstanceId = ceramic.vesselInstanceId;
    let shape = ceramic.shape;
    if (selection.newShape !== undefined) {
      next.vesselSupply[ceramic.shape].push(ceramic.vesselInstanceId);
      const replacement = next.vesselSupply[selection.newShape].shift();
      if (replacement === undefined) throw new Error("Reworking vessel disappeared");
      vesselInstanceId = replacement;
      shape = selection.newShape;
    }
    next.ceramics[selection.ceramicId] = { ...ceramic, vesselInstanceId, shape, stage: "glazed", glaze: selection.glaze, decoration: selection.decoration };
    events.push({ type: "CERAMIC_GLAZED", playerId: actorId, ceramicId: selection.ceramicId, glaze: selection.glaze, decoration: selection.decoration });
  }
  if (action.glazePalette !== undefined) {
    const target = next.ceramics[action.glazePalette.ceramicId];
    if (target === undefined || target.stage !== "glazed") throw new Error("Glaze Palette target disappeared");
    next.ceramics[target.id] = { ...target, glaze: action.glazePalette.glaze };
  }
  if (action.rapidDrying !== undefined) {
    const target = next.ceramics[action.rapidDrying.ceramicId];
    if (target === undefined || target.stage !== "glazed") throw new Error("Rapid Drying target disappeared");
    player.resources.wood -= 1;
    next.commonSupply.wood += 1;
    next.ceramics[target.id] = { ...target, stage: "loaded", kilnSpaceId: action.rapidDrying.kilnSpaceId };
    events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: -1, coins: 0 });
    events.push({ type: "CERAMIC_LOADED", playerId: actorId, ceramicId: target.id, kilnSpaceId: action.rapidDrying.kilnSpaceId });
  }
  for (const techniqueId of useTechniqueIds) exhaustTechnique(player, actorId, techniqueId, events);
  completeWorkerAction(next, actorId, events);
  return success(next, events);
}

function useKilnYardV122(
  state: GameState,
  actorId: PlayerId,
  action: Extract<GameAction, { type: "USE_KILN_YARD" }>,
): ApplyResult {
  const context = validateWorkerAction(state, actorId, action.workerId, "kiln_yard");
  if (!isWorkerContext(context)) return context;
  const normalMaximum = context.worker.kind === "shifu" ? 2 : 1;
  const priority = action.useImperialPriority === true;
  const normalCount = action.loads.length - (priority ? 1 : 0);
  if (normalCount < 1 || normalCount > normalMaximum) {
    return applyFailure(ruleError("INVALID_SELECTION", `This Kiln Yard action must load 1 to ${normalMaximum}${priority ? " normal" : ""} ceramics.`));
  }
  if (priority && (!context.player.imperialPriorityAvailable || !context.player.imperialKilnUnlocked)) {
    return applyFailure(ruleError("ABILITY_ALREADY_USED", "Imperial Priority is unavailable."));
  }
  const ceramicIds = action.loads.map((load) => load.ceramicId);
  const destinations = action.loads.map((load) => load.kilnSpaceId);
  if (new Set(ceramicIds).size !== ceramicIds.length || new Set(destinations).size !== destinations.length) {
    return applyFailure(ruleError("INVALID_SELECTION", "Ceramics and kiln destinations may be selected only once."));
  }
  const imperialLoads = action.loads.filter((load) => load.kilnSpaceId === "imperial");
  if (imperialLoads.length > 1 || (priority && imperialLoads.length !== 1)) {
    return applyFailure(ruleError("INVALID_SELECTION", "At most one ceramic may enter the empty Imperial Kiln."));
  }
  if (imperialLoads.length === 1) {
    const occupied = Object.values(state.ceramics).some((ceramic) => ceramic.stage === "loaded" && ceramic.ownerId === actorId && ceramic.kilnSpaceId === "imperial");
    if (!context.player.imperialKilnUnlocked || occupied) return applyFailure(ruleError("KILN_SPACE_OCCUPIED", "The Imperial Kiln is locked or occupied."));
  }
  if (priority && action.loads[action.loads.length - 1]?.kilnSpaceId !== "imperial") {
    return applyFailure(ruleError("INVALID_SELECTION", "The Imperial Priority additional load must be identified last and enter the Imperial Kiln."));
  }
  const furnitureLoads = action.loads.filter((load) => load.useKilnFurniture === true);
  if (furnitureLoads.length > 1) return applyFailure(ruleError("INVALID_SELECTION", "Kiln Furniture may affect one ceramic per round."));
  if (furnitureLoads.length === 1) {
    const tech = ownedTechnique(context.player, "T15");
    const destination = furnitureLoads[0]?.kilnSpaceId;
    if (tech === undefined || tech.exhausted || destination === undefined || destination === "imperial" || !destination.startsWith("high_") && !destination.startsWith("low_")) {
      return applyFailure(ruleError("INVALID_ACTION", "Kiln Furniture requires an available High or Low Shared Kiln load."));
    }
  }
  for (const load of action.loads) {
    if (load.kilnSpaceId !== "imperial") {
      if (!KILN_SPACE_IDS.includes(load.kilnSpaceId) || !activeKilnSpaceIds(state.playerCount).includes(load.kilnSpaceId)) {
        return applyFailure(ruleError("INVALID_SELECTION", "That Shared Kiln space is inactive."));
      }
      if (kilnOccupant(state, load.kilnSpaceId) !== null) return applyFailure(ruleError("KILN_SPACE_OCCUPIED", "That Shared Kiln space is occupied."));
    }
    const ceramic = state.ceramics[load.ceramicId];
    if (ceramic === undefined || ceramic.ownerId !== actorId || ceramic.stage !== "glazed") {
      return applyFailure(ruleError("ILLEGAL_CERAMIC_STAGE", "Kiln Yard loads owned Glazed ceramics only."));
    }
  }
  const tendingSelected = action.kilnTendingClay !== undefined || action.kilnTendingWood !== undefined;
  if (context.player.startingTechniqueId === "ST04") {
    const tendingClay = action.kilnTendingClay ?? -1;
    const tendingWood = action.kilnTendingWood ?? -1;
    if (!isNonNegativeInteger(tendingClay) || !isNonNegativeInteger(tendingWood) || tendingClay + tendingWood !== 2) {
      return applyFailure(ruleError("INVALID_SELECTION", "Kiln Tending gains exactly 2 Clay/Wood resources."));
    }
  } else if (tendingSelected) {
    return applyFailure(ruleError("INVALID_ACTION", "Kiln Tending is not this workshop's Starting Tech."));
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  placeWorker(next, actorId, action.workerId, "kiln_yard", events);
  const player = next.players[actorId];
  if (player === undefined) throw new Error("Kiln Yard actor disappeared");
  for (const load of action.loads) {
    const ceramic = next.ceramics[load.ceramicId];
    if (ceramic === undefined || ceramic.stage !== "glazed") throw new Error("Kiln Yard target disappeared");
    next.ceramics[ceramic.id] = { ...ceramic, stage: "loaded", kilnSpaceId: load.kilnSpaceId, ...(load.useKilnFurniture === true ? { kilnFurnitureUsed: true } : {}) };
    events.push({ type: "CERAMIC_LOADED", playerId: actorId, ceramicId: ceramic.id, kilnSpaceId: load.kilnSpaceId });
  }
  if (priority) {
    player.imperialPriorityAvailable = false;
    events.push({ type: "IMPERIAL_PRIORITY_USED", playerId: actorId });
  }
  if (context.worker.kind === "shifu") player.kilnYardShifuUsedThisRound = true;
  if (furnitureLoads.length === 1) exhaustTechnique(player, actorId, "T15", events);
  if (player.startingTechniqueId === "ST04") {
    const clay = gainFromSupply(next, player, "clay", action.kilnTendingClay ?? 0);
    const wood = gainFromSupply(next, player, "wood", action.kilnTendingWood ?? 0);
    events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay, wood, coins: 0 });
  }
  completeWorkerAction(next, actorId, events);
  return success(next, events);
}

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

function validOfficeMode(worker: WorkerState, mode: OfficeOrderMode): boolean {
  if (worker.kind === "apprentice") {
    return mode === "take_one";
  }
  return mode === "take_up_to_two";
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
  // V1.2.4: a reservation may take a face-up Order or the top of the deck, so either source
  // makes the placement legal. The Work Phase requires at least one instance of the action.
  const hasOrderSource =
    state.marketDisplay.length > 0 || state.marketDeck.length + state.marketDiscard.length > 0;
  if (!hasOrderSource) {
    return applyFailure(ruleError("ORDER_NOT_AVAILABLE", "No Order source is available."));
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
      ownedTechnique(context.player, "T10")?.exhausted === false &&
      state.marketDeck.length + state.marketDiscard.length > 0
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
  state.phase = { type: "work_commission_advance", actorId, workerId: state.phase.workerId };
}

function offerColourSamplesBeforeNextTake(state: GameState): void {
  if (state.phase.type !== "work_office_orders" || state.phase.remainingTakes <= 0 || state.phase.colourSamplesUsed) return;
  const player = state.players[state.phase.actorId];
  const technique = player === undefined ? undefined : ownedTechnique(player, "T10");
  if (
    technique !== undefined && !technique.exhausted &&
    state.marketDeck.length + state.marketDiscard.length > 0
  ) {
    state.phase.step = "colour_samples_or_skip";
  }
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
  const deck = state.marketDisplay.includes(orderId) ? "market" : null;
  if (deck === null) {
    return applyFailure(
      ruleError("ORDER_NOT_AVAILABLE", "The selected Order is not face-up.", { orderId }),
    );
  }

  const next = cloneState(state);
  const nextPhase = next.phase;
  const nextPlayer = next.players[actorId];
  if (nextPhase.type !== "work_office_orders" || nextPlayer === undefined) {
    throw new Error("Office Order phase invariant failed");
  }
  ensureMainOrderDeck(next, rng);
  const drawn = drawFromDisplay(next.marketDisplay, next.marketDeck, orderId);
  if (!drawn) {
    throw new Error("Validated face-up Order disappeared");
  }
  nextPlayer.orderHand.push(orderId);
  nextPhase.remainingTakes = (nextPhase.remainingTakes - 1) as 0 | 1 | 2;
  nextPhase.ordersTaken += 1;
  offerColourSamplesBeforeNextTake(next);
  const events: GameEvent[] = [
    { type: "ORDER_TAKEN", playerId: actorId, orderId, deck, acquisition: "face_up" },
  ];
  finishOfficeOrderAcquisition(next, actorId, events);
  return success(next, events);
}

/**
 * V1.2.4: a reservation may instead take the top Main Order without looking at it first.
 *
 * V1.2.2 could only reserve a face-up Order, so a Commission Market worker was worth
 * nothing once the display held nothing the player wanted. Each reservation now chooses
 * between the display and the deck independently.
 */
function takeTopOfficeOrder(state: GameState, actorId: PlayerId, rng: RandomSource): ApplyResult {
  const phase = requirePhase(state, "work_office_orders");
  if (isFailure(phase)) {
    return phase;
  }
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) {
    return actorError;
  }
  if (phase.remainingTakes <= 0) {
    return applyFailure(ruleError("INVALID_ACTION", "This Commission Market action has no reservation left."));
  }
  if (phase.step !== "take_or_end") {
    return applyFailure(
      ruleError("INVALID_ACTION", "Resolve the Colour Samples choice before reserving an Order."),
    );
  }
  const next = cloneState(state);
  ensureMainOrderDeck(next, rng);
  const nextPhase = next.phase;
  const nextPlayer = next.players[actorId];
  if (nextPhase.type !== "work_office_orders" || nextPlayer === undefined) {
    throw new Error("Office Order phase invariant failed");
  }
  const orderId = next.marketDeck.shift();
  if (orderId === undefined) {
    return applyFailure(ruleError("ORDER_NOT_AVAILABLE", "The Main Order deck is empty."));
  }
  nextPlayer.orderHand.push(orderId);
  nextPhase.remainingTakes = (nextPhase.remainingTakes - 1) as 0 | 1 | 2;
  nextPhase.ordersTaken += 1;
  offerColourSamplesBeforeNextTake(next);
  const events: GameEvent[] = [
    { type: "ORDER_TAKEN", playerId: actorId, orderId, deck: "market", acquisition: "blind_deck" },
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
  if (phase.ordersTaken === 0) {
    return applyFailure(
      ruleError("INVALID_ACTION", "After using Colour Samples, take at least one Order."),
    );
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  next.phase = { type: "work_commission_advance", actorId, workerId: phase.workerId };
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
  if (phase.step !== "colour_samples_or_skip") {
    return applyFailure(ruleError("INVALID_ACTION", "Colour Samples is not awaiting a choice."));
  }
  const player = state.players[actorId];
  const technique = player === undefined ? undefined : ownedTechnique(player, "T10");
  if (player === undefined || technique === undefined) {
    return applyFailure(ruleError("TECHNIQUE_NOT_OWNED", "Colour Samples is not owned."));
  }
  if (deck !== "market" || state.marketDeck.length + state.marketDiscard.length === 0) {
    return applyFailure(ruleError("ORDER_NOT_AVAILABLE", "The Main Order deck is empty."));
  }

  const next = cloneState(state);
  const nextPhase = next.phase;
  const nextPlayer = next.players[actorId];
  if (
    nextPhase.type !== "work_office_orders" || nextPlayer === undefined
  ) {
    throw new Error("Colour Samples state invariant failed");
  }
  // V1.2.4 looks at the top 3 "or as many as remain".
  ensureMainOrderCards(next, COLOUR_SAMPLES_LOOK, rng);
  const choices = next.marketDeck.splice(0, COLOUR_SAMPLES_LOOK);

  const events: GameEvent[] = [];
  nextPhase.step = "colour_samples_choose";
  nextPhase.colourSamplesUsed = true;
  nextPhase.colourSamplesDeck = deck;
  nextPhase.colourSamplesChoices = choices;
  return success(next, events);
}

function chooseColourSamplesOrder(state: GameState, actorId: PlayerId, orderId: OrderId, rng: RandomSource): ApplyResult {
  const phase = requirePhase(state, "work_office_orders");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  // V1.2.4: reserve one looked-at Order or one face-up Order. Everything looked at and not
  // reserved is discarded -- V1.2.2 returned them to the bottom of the deck instead.
  if (phase.step !== "colour_samples_choose" || phase.colourSamplesDeck !== "market" || phase.colourSamplesChoices === undefined) {
    return applyFailure(ruleError("INVALID_ACTION", "Colour Samples is not awaiting a choice."));
  }
  const lookedAt = phase.colourSamplesChoices;
  const fromLookedAt = lookedAt.includes(orderId);
  const fromDisplay = state.marketDisplay.includes(orderId);
  if (!fromLookedAt && !fromDisplay) {
    return applyFailure(ruleError("INVALID_SELECTION", "Reserve a looked-at Order or a face-up Main Order."));
  }
  const next = cloneState(state);
  const nextPhase = next.phase;
  const player = next.players[actorId];
  if (nextPhase.type !== "work_office_orders" || player === undefined || nextPhase.colourSamplesDeck === undefined) throw new Error("Colour Samples state invariant failed");
  const deck = nextPhase.colourSamplesDeck;
  const events: GameEvent[] = [];
  if (fromDisplay) {
    ensureMainOrderDeck(next, rng);
    if (!drawFromDisplay(next.marketDisplay, next.marketDeck, orderId)) {
      throw new Error("Validated face-up Order disappeared");
    }
  }
  const discarded = lookedAt.filter((id) => id !== orderId);
  next.marketDiscard.push(...discarded);
  player.orderHand.push(orderId);
  exhaustTechnique(player, actorId, "T10", events);
  nextPhase.remainingTakes = (nextPhase.remainingTakes - 1) as 0 | 1 | 2;
  nextPhase.ordersTaken += 1;
  nextPhase.step = "take_or_end";
  delete nextPhase.colourSamplesChoices;
  delete nextPhase.colourSamplesDeck;
  events.push(
    { type: "ORDER_TAKEN", playerId: actorId, orderId, deck, acquisition: "colour_samples" },
    { type: "COLOUR_SAMPLES_USED", playerId: actorId, deck, discardedOrderIds: discarded, selectedOrderId: orderId, reservedFromDisplay: fromDisplay },
  );
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

function gainCommissionAdvance(
  state: GameState,
  actorId: PlayerId,
  resource: "clay" | "wood" | "coins",
): ApplyResult {
  const phase = requirePhase(state, "work_commission_advance");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  const next = cloneState(state);
  const player = next.players[actorId];
  if (player === undefined) return applyFailure(ruleError("UNKNOWN_PLAYER", "Commission actor disappeared."));
  const gained = gainFromSupply(next, player, resource, 1);
  const events: GameEvent[] = [{
    type: "RESOURCES_CHANGED",
    playerId: actorId,
    clay: resource === "clay" ? gained : 0,
    wood: resource === "wood" ? gained : 0,
    coins: resource === "coins" ? gained : 0,
  }];
  completeWorkerAction(next, actorId, events);
  return success(next, events);
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
    step: context.worker.kind === "shifu" ? "inspect" : "buy",
  };
  return success(next, events);
}

/**
 * V1.2.4 Guild Shifu: look at the top 2 Techs of one discipline, or as many as remain.
 *
 * V1.2.2 refreshed a discipline -- its face-up tiles went to the bottom and the display
 * refilled -- and the purchase then had to come from that same discipline. V1.2.4 instead
 * draws the top 2 off the chosen deck for the actor alone to see, leaves the face-up
 * displays untouched, and lets the purchase come from any face-up tile or either drawn tile.
 */
function inspectGuildDiscipline(
  state: GameState,
  actorId: PlayerId,
  discipline: TechniqueDiscipline,
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
  if (phase.step !== "inspect" || worker?.kind !== "shifu") {
    return applyFailure(
      ruleError("INVALID_ACTION", "A Shifu inspection is not available in this step."),
    );
  }
  if (!(DISCIPLINES as readonly TechniqueDiscipline[]).includes(discipline)) {
    return applyFailure(ruleError("INVALID_SELECTION", "Choose a Tech discipline to inspect."));
  }

  const next = cloneState(state);
  const nextPhase = next.phase;
  if (nextPhase.type !== "work_guild") {
    throw new Error("Guild phase invariant failed");
  }
  const deck = next.techniqueDecks[discipline];
  const inspected = deck.splice(0, GUILD_SHIFU_INSPECT);
  nextPhase.inspectedDiscipline = discipline;
  nextPhase.inspectedTechniqueIds = inspected;
  nextPhase.step = "buy";
  return success(next, [{ type: "GUILD_DISCIPLINE_INSPECTED", playerId: actorId, discipline, count: inspected.length }]);
}

function buyGuildTechnique(
  state: GameState,
  actorId: PlayerId,
  techniqueId: TechniqueId,
  unlockWorkshop?: "potters_wheel" | "glaze_decoration",
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
      ruleError("INVALID_ACTION", "Choose a discipline to inspect before buying."),
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
  if (player.techniques.length === 0 && unlockWorkshop === undefined) {
    return applyFailure(ruleError("INVALID_SELECTION", "The first Advanced Tech must unlock one private workshop space."));
  }
  if (player.techniques.length === 0 && unlockWorkshop === "potters_wheel" && player.workshopSpaces.pottersWheelUnlocked === 2) {
    return applyFailure(ruleError("INVALID_SELECTION", "The second Potter's Wheel space is already unlocked."));
  }
  if (player.techniques.length === 0 && unlockWorkshop === "glaze_decoration" && player.workshopSpaces.glazeDecorationUnlocked === 2) {
    return applyFailure(ruleError("INVALID_SELECTION", "The second Glaze & Decoration space is already unlocked."));
  }
  const discipline = techniqueDiscipline(techniqueId);
  const inspectedIds = phase.inspectedTechniqueIds ?? [];
  const fromDisplay = discipline !== null && state.techniqueDisplay[discipline].includes(techniqueId);
  const fromInspected = inspectedIds.includes(techniqueId);
  if (discipline === null || (!fromDisplay && !fromInspected)) {
    return applyFailure(
      ruleError("TECHNIQUE_NOT_AVAILABLE", "The selected Technique is neither face-up nor one you inspected."),
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
  if (fromDisplay) {
    const display = next.techniqueDisplay[discipline];
    const index = display.indexOf(techniqueId);
    display.splice(index, 1);
    const replacement = next.techniqueDecks[discipline].shift();
    if (replacement !== undefined) {
      display.splice(index, 0, replacement);
    }
  }
  // Inspected tiles the actor did not take go to the bottom of their own deck.
  const inspectedDiscipline = phase.inspectedDiscipline;
  if (inspectedDiscipline !== undefined) {
    next.techniqueDecks[inspectedDiscipline].push(...inspectedIds.filter((id) => id !== techniqueId));
  }
  nextPlayer.resources.coins -= cost;
  next.commonSupply.coins += cost;
  nextPlayer.techniques.push({ id: techniqueId, exhausted: false });
  if (nextPlayer.techniques.length === 1) {
    if (unlockWorkshop === "potters_wheel") nextPlayer.workshopSpaces.pottersWheelUnlocked = 2;
    else nextPlayer.workshopSpaces.glazeDecorationUnlocked = 2;
  } else if (nextPlayer.techniques.length === 2) {
    nextPlayer.workshopSpaces.pottersWheelUnlocked = 2;
    nextPlayer.workshopSpaces.glazeDecorationUnlocked = 2;
  }
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

export function createPrivateFiringState(state: GameState): PrivateFiringState {
  return {
    gameId: state.gameId,
    windowId: state.phase.type === "firing_contributions" ? state.phase.windowId : null,
    contributions: {},
    fuelLedgerCommittedBy: [],
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
    const ledgerDelta = context.fuelLedgerUpgradedBy.includes(playerId) ? fuelLedgerHeatDelta(card) : 0;
    return contributionHeatAdjustment(card) + ledgerDelta;
  });
}

function revealedContributionAdjustments(
  contributions: Record<PlayerId, ContributionCardId>,
  fuelLedgerUpgradedBy: readonly PlayerId[],
): Record<PlayerId, ContributionHeatAdjustment> {
  return Object.fromEntries(Object.entries(contributions).map(([playerId, card]) => {
    const ledgerDelta = fuelLedgerUpgradedBy.includes(playerId) ? fuelLedgerHeatDelta(card) : 0;
    return [playerId, contributionHeatAdjustment(card) + ledgerDelta];
  })) as Record<PlayerId, ContributionHeatAdjustment>;
}

function provisionalBaseHeat(state: GameState): BaseHeat {
  return determineBaseHeat(contributionAdjustments(state));
}

function determineBaseHeatAndOpenReposition(
  state: GameState,
  events: GameEvent[],
  rng: RandomSource,
): void {
  const context = state.firingContext;
  if (context === null) throw new Error("Base Heat requires firing context");
  context.baseHeat = provisionalBaseHeat(state);
  revealFireAndCalculateActualHeat(state, events, rng);
}

export function submitWoodContribution(
  state: GameState,
  privateState: PrivateFiringState,
  actorId: PlayerId,
  card: ContributionCardId,
  useFuelLedger: boolean,
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
  if (useFuelLedger) {
    const technique = ownedTechnique(player, "T12");
    if (technique === undefined || (card !== "BANK" && card !== "STOKE")) {
      return { ok: false, error: ruleError("INVALID_CONTRIBUTION", "Fuel Ledger may accompany Bank or Stoke only.") };
    }
  }
  const totalWoodCost = contributionWoodCost(card) + (useFuelLedger ? FUEL_LEDGER_WOOD : 0);
  if (player.resources.wood < totalWoodCost) {
    return {
      ok: false,
      error: ruleError("INVALID_CONTRIBUTION", "You cannot pay that Contribution card's Wood cost.", {
        card,
        requiredWood: totalWoodCost,
      }),
    };
  }

  const next = cloneState(state);
  const nextPrivate: PrivateFiringState = JSON.parse(JSON.stringify(privateState)) as PrivateFiringState;
  if (next.phase.type !== "firing_contributions") throw new Error("Contribution phase invariant failed");
  next.phase.submittedPlayerIds.push(actorId);
  nextPrivate.contributions[actorId] = card;
  if (useFuelLedger) nextPrivate.fuelLedgerCommittedBy.push(actorId);
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
      const ledgerCommitted = nextPrivate.fuelLedgerCommittedBy.includes(contributorId);
      const woodPaid = contributionWoodCost(revealed) + (ledgerCommitted ? 1 : 0);
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
      fuelLedgerUpgradedBy: [...nextPrivate.fuelLedgerCommittedBy],
      baseHeat: null,
      fireModifier: null,
      globalHeat: null,
      ceramicResults: {},
    };
    events.push({
      type: "WOOD_REVEALED",
      contributions: { ...contributions },
      effectiveHeatAdjustments: revealedContributionAdjustments(
        contributions,
        nextPrivate.fuelLedgerCommittedBy,
      ),
    });
    nextPrivate.windowId = null;
    nextPrivate.contributions = {};
    nextPrivate.fuelLedgerCommittedBy = [];
    determineBaseHeatAndOpenReposition(next, events, rng);
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
    if (ceramic === undefined || ceramic.stage !== "loaded" || ceramic.ownerId !== actorId || ceramic.kilnSpaceId === "imperial") {
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
  advanceQueuedWindow(next, () => beginFiringPhase(next));
  return success(next, events);
}

function revealFireAndCalculateActualHeat(state: GameState, events: GameEvent[], rng: RandomSource): void {
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

  calculateActualHeatAndOpenQualityWindow(state, events);
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
    const zoneModifier = ceramic.kilnSpaceId === "imperial" || ceramic.kilnFurnitureUsed === true
      ? 0
      : kilnZoneModifier(ceramic.kilnSpaceId);
    const naturalActualHeat = context.globalHeat + zoneModifier;
    const naturalDifference = Math.abs(naturalActualHeat - preferredHeat(ceramic.glaze));
    const actualHeat = naturalActualHeat;
    const difference = Math.abs(actualHeat - preferredHeat(ceramic.glaze));
    context.ceramicResults[ceramic.id] = {
      ceramicId: ceramic.id,
      zoneModifier,
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
  if (actors.length === 0) assignQualityAndOpenAfterQualityTechs(state, events);
  else state.phase = { type: "firing_before_quality", queue: { actors, currentIndex: 0 } };
}

function assignQualityAndOpenAfterQualityTechs(state: GameState, events: GameEvent[]): void {
  const context = state.firingContext;
  if (context === null) throw new Error("Quality assignment requires firing context");
  for (const result of Object.values(context.ceramicResults)) {
    result.assignedQuality = result.forcedQuality ?? qualityFromDifference(result.finalHeatDifference);
    events.push({ type: "QUALITY_ASSIGNED", ceramicId: result.ceramicId, quality: result.assignedQuality });
  }
  const saggarsActors = turnOrderFromFirst(state).filter((playerId) => {
    const player = state.players[playerId];
    const technique = player === undefined ? undefined : ownedTechnique(player, "T11");
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
      techniqueIds: saggarsActors.map(() => "T11" as TechniqueId),
    };
  }
}

function openSecondFiringWindow(state: GameState, events: GameEvent[]): void {
  const context = state.firingContext;
  if (context === null) throw new Error("Second Firing window requires firing context");
  const actors = turnOrderFromFirst(state).filter((playerId) => {
    const player = state.players[playerId];
    const technique = player === undefined ? undefined : ownedTechnique(player, "T14");
    return (
      technique !== undefined &&
      !technique.exhausted &&
      Object.values(context.ceramicResults).some(
        (result) =>
          (result.assignedQuality === "flawed" || result.assignedQuality === "standard") &&
          state.ceramics[result.ceramicId]?.ownerId === playerId,
      )
    );
  });
  if (actors.length === 0) openWorkshopSeconds(state, events);
  else {
    state.phase = {
      type: "firing_after_quality",
      queue: { actors, currentIndex: 0 },
      techniqueIds: actors.map(() => "T14" as TechniqueId),
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
  advanceQueuedWindow(next, () => assignQualityAndOpenAfterQualityTechs(next, events));
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
      !GE_CORRECTABLE_DIFFERENCES.includes(result.finalHeatDifference)
    ) {
      return applyFailure(
        ruleError(
          "INVALID_SELECTION",
          "Ge requires one owned ceramic whose current Actual Heat differs from its Preferred Heat by exactly 1.",
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
  advanceQueuedWindow(next, () => assignQualityAndOpenAfterQualityTechs(next, events));
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
  if (phase.techniqueIds[phase.queue.currentIndex] !== "T11") {
    return applyFailure(ruleError("INVALID_ACTION", "Protective Saggars is not the current decision."));
  }
  const player = state.players[actorId];
  if (ceramicId !== null) {
    const technique = player === undefined ? undefined : ownedTechnique(player, "T11");
    const ceramic = state.ceramics[ceramicId];
    const result = state.firingContext?.ceramicResults[ceramicId];
    if (technique === undefined || technique.exhausted) {
      return applyFailure(ruleError("TECHNIQUE_EXHAUSTED", "Protective Saggars is unavailable."));
    }
    if (
      player === undefined ||
      player.resources.wood < 1 ||
      ceramic === undefined ||
      ceramic.ownerId !== actorId ||
      (result?.assignedQuality !== "flawed" && result?.assignedQuality !== "standard")
    ) {
      return applyFailure(
        ruleError("INVALID_SELECTION", "Protective Saggars requires 1 Wood and an owned Flawed or Standard ceramic."),
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
    exhaustTechnique(nextPlayer, actorId, "T11", events);
    events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: -1, coins: 0 });
  }
  advanceQueuedWindow(next, () => openSecondFiringWindow(next, events));
  return success(next, events);
}

function resolveSecondFiring(
  state: GameState,
  actorId: PlayerId,
  ceramicId: string | null,
  rng: RandomSource,
): ApplyResult {
  const phase = requirePhase(state, "firing_after_quality");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  if (phase.techniqueIds[phase.queue.currentIndex] !== "T14") {
    return applyFailure(ruleError("INVALID_ACTION", "Second Firing is not the current decision."));
  }
  const player = state.players[actorId];
  if (ceramicId !== null) {
    const technique = player === undefined ? undefined : ownedTechnique(player, "T14");
    const ceramic = state.ceramics[ceramicId];
    const result = state.firingContext?.ceramicResults[ceramicId];
    if (technique === undefined || technique.exhausted) {
      return applyFailure(ruleError("TECHNIQUE_EXHAUSTED", "Second Firing is unavailable."));
    }
    if (
      ceramic === undefined ||
      ceramic.stage !== "loaded" ||
      ceramic.ownerId !== actorId ||
      (result?.assignedQuality !== "flawed" && result?.assignedQuality !== "standard")
    ) {
      return applyFailure(
        ruleError("INVALID_SELECTION", "Second Firing requires one owned Flawed or Standard ceramic from this firing."),
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
    ensureFireDeck(next, rng);
    const extraFire = next.fireDeck.shift();
    const result = nextContext.ceramicResults[ceramicId];
    if (extraFire === undefined || result === undefined || nextContext.baseHeat === null) throw new Error("Second Firing card/result disappeared");
    const actualHeat = nextContext.baseHeat + extraFire + result.zoneModifier;
    result.finalActualHeat = actualHeat;
    result.finalHeatDifference = Math.abs(actualHeat - preferredHeat(ceramic.glaze));
    result.assignedQuality = qualityFromDifference(result.finalHeatDifference);
    next.fireDiscard.push(extraFire);
    exhaustTechnique(nextPlayer, actorId, "T14", events);
    events.push({ type: "SECOND_FIRING_RESOLVED", playerId: actorId, ceramicId, fireModifier: extraFire, quality: result.assignedQuality });
  }
  advanceQueuedWindow(next, () => openWorkshopSeconds(next, events));
  return success(next, events);
}

function openWorkshopSeconds(state: GameState, events: GameEvent[]): void {
  const context = state.firingContext;
  if (context === null) throw new Error("Workshop Seconds requires firing context");
  const actors = turnOrderFromFirst(state).filter((playerId) => Object.values(context.ceramicResults).some(
    (result) => result.assignedQuality === "flawed" && state.ceramics[result.ceramicId]?.ownerId === playerId,
  ));
  if (actors.length === 0) finalizeFiring(state, events);
  else state.phase = { type: "firing_workshop_seconds", queue: { actors, currentIndex: 0 } };
}

function resolveWorkshopSeconds(
  state: GameState,
  actorId: PlayerId,
  ceramicId: CeramicId | null,
): ApplyResult {
  const phase = requirePhase(state, "firing_workshop_seconds");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  if (ceramicId !== null) {
    const ceramic = state.ceramics[ceramicId];
    const result = state.firingContext?.ceramicResults[ceramicId];
    if (ceramic === undefined || ceramic.stage !== "loaded" || ceramic.ownerId !== actorId || result?.assignedQuality !== "flawed") {
      return applyFailure(ruleError("INVALID_SELECTION", "Workshop Seconds may discard one remaining owned Flawed ceramic."));
    }
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  if (ceramicId !== null) {
    const player = next.players[actorId];
    const ceramic = next.ceramics[ceramicId];
    if (player === undefined || ceramic === undefined || ceramic.stage !== "loaded") throw new Error("Workshop Seconds target disappeared");
    next.vesselSupply[ceramic.shape].push(ceramic.vesselInstanceId);
    delete next.ceramics[ceramicId];
    if (next.firingContext !== null) delete next.firingContext.ceramicResults[ceramicId];
    const coins = gainFromSupply(next, player, "coins", ACTION_LOCATION_PRICES.workshopSecondsCoins);
    events.push({ type: "WORKSHOP_SECONDS_SOLD", playerId: actorId, ceramicId, coins });
    if (coins > 0) events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: 0, coins });
  }
  advanceQueuedWindow(next, () => finalizeFiring(next, events));
  return success(next, events);
}

function resolveTestPieces(state: GameState, actorId: PlayerId, use: boolean, rng: RandomSource): ApplyResult {
  const phase = requirePhase(state, "firing_before_contribution");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  if (phase.techniqueIds[phase.queue.currentIndex] !== "T13") {
    return applyFailure(ruleError("INVALID_ACTION", "Test Pieces is not the current decision."));
  }
  const player = state.players[actorId];
  if (use) {
    const technique = player === undefined ? undefined : ownedTechnique(player, "T13");
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
    exhaustTechnique(nextPlayer, actorId, "T13", events);
    events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: -1, coins: 0 });
  }
  advanceQueuedWindow(next, () => openContributionPhase(next));
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
    effectiveHeatAdjustments: revealedContributionAdjustments(
      context.contributions,
      context.fuelLedgerUpgradedBy,
    ),
    baseHeat: context.baseHeat,
    fireModifier: context.fireModifier,
    globalHeat: context.globalHeat,
  };
  state.fireDiscard.push(context.fireModifier);
  state.firingContext = null;
  state.privateFirePeeks = {};
  beginOrderPhase(state);
}

function advanceRecognitionV122(
  state: GameState,
  playerId: PlayerId,
  crowns: 1 | 2 | 3,
  grantChoice: "coins" | "resources" | undefined,
  orderId: OrderId,
  events: GameEvent[],
): void {
  const player = state.players[playerId];
  if (player === undefined) throw new Error("Recognition player disappeared");
  const from = player.imperialRecognition;
  const to = Math.min(5, from + crowns) as PlayerState["imperialRecognition"];
  const crossesTwo = from < 2 && to >= 2;
  if (crossesTwo && grantChoice === undefined) throw new Error("Imperial Grant choice was not validated");
  player.imperialRecognition = to;
  const crossedSpaces = Array.from({ length: to - from }, (_, index) => from + index + 1);
  events.push({
    type: "IMPERIAL_RECOGNITION_ADVANCED",
    playerId,
    orderId,
    from,
    to,
    crowns,
    appliedCrowns: to - from,
  });
  if (crossesTwo && !player.imperialGrantResolved) {
    player.imperialGrantResolved = true;
    if (grantChoice === "coins") {
      const coins = gainFromSupply(state, player, "coins", 3);
      if (coins > 0) events.push({ type: "RESOURCES_CHANGED", playerId, clay: 0, wood: 0, coins });
      events.push({ type: "IMPERIAL_GRANT_RECEIVED", playerId, choice: "coins", clay: 0, wood: 0, coins });
    } else {
      const clay = gainFromSupply(state, player, "clay", 1);
      const wood = gainFromSupply(state, player, "wood", 1);
      const coins = gainFromSupply(state, player, "coins", 1);
      events.push({ type: "RESOURCES_CHANGED", playerId, clay, wood, coins });
      events.push({ type: "IMPERIAL_GRANT_RECEIVED", playerId, choice: "resources", clay, wood, coins });
    }
  }
  if (from < 3 && to >= 3) {
    player.imperialKilnUnlocked = true;
    events.push({ type: "IMPERIAL_KILN_UNLOCKED", playerId });
  }
  if (from < 4 && to >= 4) {
    player.imperialPriorityAvailable = true;
    events.push({ type: "IMPERIAL_PRIORITY_GAINED", playerId });
  }
  if (from < 5 && to >= 5 && !player.imperialAudienceVpAwarded) {
    player.imperialAudienceVpAwarded = true;
    events.push({ type: "IMPERIAL_AUDIENCE_GAINED", playerId, vp: 6 });
  }
}

function completeOrder(
  state: GameState,
  actorId: PlayerId,
  action: Extract<GameAction, { type: "COMPLETE_ORDER" }>,
  rng: RandomSource,
): ApplyResult {
  const phase = requirePhase(state, "orders");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  const player = state.players[actorId];
  const definition = ORDER_DEFINITIONS[action.orderId];
  const held = player?.orderHand.includes(action.orderId) ?? false;
  const publicOrder = state.marketDisplay.includes(action.orderId);
  if (player === undefined || definition === undefined || (!held && !publicOrder)) {
    return applyFailure(ruleError("ORDER_NOT_AVAILABLE", "Complete a held Order or a face-up Main Order."));
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
  const isCrownOrder = definition.crowns > 0;
  const guanTriggers = isCrownOrder && player.kilnId === "GU" && !player.kilnAbilityUsedThisRound;
  const ruTriggers = player.kilnId === "RU" && !player.kilnAbilityUsedThisRound
    && selected.some((ceramic) => ruBonusCeramic(ceramic, RU_BONUS_QUALITY));
  if (!matchesOrder(definition, selected)) {
    return applyFailure(
      ruleError("ORDER_REQUIREMENTS_NOT_MET", "The selected ceramics do not fulfil this Order."),
    );
  }

  const next = cloneState(state);
  const nextPlayer = next.players[actorId];
  if (nextPlayer === undefined) throw new Error("Order actor disappeared");
  if (held) {
    const handIndex = nextPlayer.orderHand.indexOf(action.orderId);
    nextPlayer.orderHand.splice(handIndex, 1);
  } else {
    const displayIndex = next.marketDisplay.indexOf(action.orderId);
    ensureMainOrderDeck(next, rng);
    const replacement = next.marketDeck.shift();
    if (replacement === undefined) next.marketDisplay.splice(displayIndex, 1);
    else next.marketDisplay.splice(displayIndex, 1, replacement);
  }
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
  });
  const events: GameEvent[] = [
    { type: "ORDER_COMPLETED", playerId: actorId, orderId: action.orderId, ceramicIds: [...action.ceramicIds] },
  ];
  if (gainedCoins > 0) {
    events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: 0, coins: gainedCoins });
  }
  if (guanTriggers) {
    const guanCoins = gainFromSupply(next, nextPlayer, "coins", GUAN_ORDER_COINS);
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
  if (definition.crowns > 0 && nextPlayer.imperialRecognition < 5) {
    const reachesGrant = nextPlayer.imperialRecognition < 2
      && Math.min(5, nextPlayer.imperialRecognition + definition.crowns) >= 2;
    if (reachesGrant && action.imperialGrantChoice === undefined) {
      return applyFailure(ruleError("INVALID_SELECTION", "Choose the Imperial Grant reward before completing this Crown Order."));
    }
    advanceRecognitionV122(next, actorId, definition.crowns as 1 | 2 | 3, action.imperialGrantChoice, action.orderId, events);
  }
  if (next.phase.type !== "orders") throw new Error("Order phase disappeared");
  next.phase.completedInCircuit += 1;
  next.phase.currentIndex += 1;
  if (next.phase.currentIndex >= next.phase.turnOrder.length) {
    next.phase.currentIndex = 0;
    next.phase.completedInCircuit = 0;
  }
  const nextActor = next.phase.turnOrder[next.phase.currentIndex];
  if (nextActor === undefined) throw new Error("Order circuit actor disappeared");
  next.phase.activePlayerId = nextActor;
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
  const marketOrderIds = state.marketDisplay.splice(0, ORDER_DISPLAY_ROTATION);
  state.marketDiscard.push(...marketOrderIds);
  ensureMainOrderDeck(
    state,
    rng,
    GAME_CONFIG.orderDisplay.market - state.marketDisplay.length,
  );
  refillTo(state.marketDisplay, state.marketDeck, GAME_CONFIG.orderDisplay.market);
  events.push({
    type: "ORDER_DISPLAYS_ROTATED",
    round: state.round,
    marketOrderIds,
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
  const featuredIds = player.presentationFeaturedCeramicIds ?? [];
  const featured = featuredIds.map((id) => state.ceramics[id]).filter(
    (ceramic): ceramic is Extract<CeramicState, { stage: "presented" }> =>
      ceramic?.stage === "presented",
  );
  if (featured.length === IMPERIAL_PROGRESS.exhibition.featuredCollectionSize && new Set(featured.map((ceramic) => ceramic.shape)).size === 3) {
    score += IMPERIAL_PROGRESS.exhibition.threeDifferentShapesBonus;
  }
  if (featured.length === IMPERIAL_PROGRESS.exhibition.featuredCollectionSize && new Set(featured.map((ceramic) => ceramic.glaze)).size === 3) {
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
  const scores: FinalResult["scores"] = {};
  for (const playerId of state.playerOrder) {
    const player = state.players[playerId];
    if (player === undefined) throw new Error("Scoring player disappeared");
    const imperialAudienceVp = player.imperialAudienceVpAwarded ? 6 : 0;
    const presentationVp = calculatePresentationVp(state, player);
    const coinVp = Math.min(
      GAME_CONFIG.coinEndGame.maxVp,
      Math.floor(player.resources.coins / GAME_CONFIG.coinEndGame.coinsPerVp),
    );
    const total =
      player.score.orderVp +
      imperialAudienceVp +
      presentationVp +
      player.score.kilnTraditionVp +
      coinVp;
    scores[playerId] = {
      orders: player.score.orderVp,
      imperialAudience: imperialAudienceVp,
      presentation: presentationVp,
      immediateAbilities: player.score.kilnTraditionVp,
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
  finalists = maximumBy(finalists, (id) => state.players[id]?.imperialRecognition ?? 0);
  if (finalists.length === 1) {
    return { scores, winnerIds: finalists, resolvedBy: "imperial_recognition" };
  }
  finalists = maximumBy(
    finalists,
    (id) => state.players[id]?.completedOrders.reduce((sum, order) => sum + (ORDER_DEFINITIONS[order.orderId]?.crowns ?? 0), 0) ?? 0,
  );
  if (finalists.length === 1) {
    return { scores, winnerIds: finalists, resolvedBy: "completed_crowns" };
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
      player.kilnYardShifuUsedThisRound = false;
      player.shapesFormedThisRound = [];
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
  // Starting Orders leave the game when discarded; only O01-O48 can ever return to the
  // Main Order discard pile.
  for (const id of orderIds) {
    if (id.startsWith("O")) next.marketDiscard.push(id);
    else next.returnedStartingOrderIds.push(id);
  }
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
  if (next.phase.currentIndex >= next.phase.turnOrder.length) {
    if (next.phase.completedInCircuit === 0) {
      beginCleanupOrderDiscards(next, events, rng);
      return success(next, events);
    }
    next.phase.currentIndex = 0;
    next.phase.completedInCircuit = 0;
  }
  if (next.phase.type === "orders") {
    const nextActor = next.phase.turnOrder[next.phase.currentIndex];
    if (nextActor === undefined) throw new Error("Order circuit actor disappeared");
    next.phase.activePlayerId = nextActor;
  }
  return success(next, events);
}

function submitPresentation(
  state: GameState,
  actorId: PlayerId,
  ceramicIds: string[],
  featuredCeramicIds: string[],
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
  const maximum = IMPERIAL_PROGRESS.exhibition.capacityByProgress[player.imperialRecognition] ?? 0;
  if (
    ceramicIds.length > maximum ||
    new Set(ceramicIds).size !== ceramicIds.length
  ) {
    return applyFailure(ruleError("INVALID_SELECTION", `Exhibit at most ${maximum} unique ceramics.`));
  }
  const requiredFeatured = ceramicIds.length >= IMPERIAL_PROGRESS.exhibition.featuredCollectionSize
    ? IMPERIAL_PROGRESS.exhibition.featuredCollectionSize
    : 0;
  if (
    featuredCeramicIds.length !== requiredFeatured ||
    new Set(featuredCeramicIds).size !== featuredCeramicIds.length ||
    featuredCeramicIds.some((ceramicId) => !ceramicIds.includes(ceramicId))
  ) {
    return applyFailure(ruleError(
      "INVALID_SELECTION",
      requiredFeatured === 0
        ? "A featured collection is available only when at least three ceramics are exhibited."
        : "Choose exactly three unique exhibited ceramics as the featured collection.",
    ));
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
  nextPlayer.presentationFeaturedCeramicIds = [...featuredCeramicIds];
  next.phase.submittedPlayerIds.push(actorId);
  const events: GameEvent[] = [
    {
      type: "PRESENTATION_SUBMITTED",
      playerId: actorId,
      ceramicIds: [...ceramicIds],
      featuredCeramicIds: [...featuredCeramicIds],
    },
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
    case "SELECT_STARTING_TECH":
      return selectStartingTech(state, actorId, action.techniqueId);
    case "PASS_WORK_PHASE":
      return passWorkPhase(state, actorId);
    case "GAIN_MATERIALS":
      return gainMaterials(state, actorId, action);
    case "FORM_CERAMICS":
      return formCeramics(state, actorId, action);
    case "GLAZE_CERAMICS":
      return glazeCeramicsV122(state, actorId, action);
    case "USE_KILN_YARD":
      return useKilnYardV122(state, actorId, action);
    case "USE_LABOUR":
      return useLabour(state, actorId, action.workerId);
    case "BEGIN_OFFICE_ORDERS":
      return beginOfficeOrders(state, actorId, action.workerId, action.mode);
    case "OFFICE_TAKE_ORDER":
      return takeOfficeOrder(state, actorId, action.orderId, rng);
    case "OFFICE_TAKE_TOP_ORDER":
      return takeTopOfficeOrder(state, actorId, rng);
    case "OFFICE_END_ORDERS":
      return endOfficeOrders(state, actorId);
    case "OFFICE_USE_COLOUR_SAMPLES":
      return useColourSamples(state, actorId, action.deck ?? "market", rng);
    case "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER":
      return chooseColourSamplesOrder(state, actorId, action.orderId, rng);
    case "OFFICE_SKIP_COLOUR_SAMPLES":
      return skipColourSamples(state, actorId);
    case "COMMISSION_GAIN_ADVANCE":
      return gainCommissionAdvance(state, actorId, action.resource);
    case "BEGIN_GUILD_ACTION":
      return beginGuildAction(state, actorId, action.workerId);
    case "GUILD_INSPECT_DISCIPLINE":
      return inspectGuildDiscipline(state, actorId, action.discipline);
    case "GUILD_BUY_TECHNIQUE":
      return buyGuildTechnique(state, actorId, action.techniqueId, action.unlockWorkshop);
    case "RESOLVE_KILN_YARD_REPOSITION":
      return resolveKilnYardReposition(state, actorId, action.ceramicId, action.toSpaceId, rng);
    case "RESOLVE_JUN":
      return resolveJun(state, actorId, action.ceramicId, action.delta);
    case "RESOLVE_GE":
      return resolveGe(state, actorId, action.ceramicId);
    case "RESOLVE_PROTECTIVE_SAGGARS":
      return resolveProtectiveSaggars(state, actorId, action.ceramicId);
    case "RESOLVE_SECOND_FIRING":
      return resolveSecondFiring(state, actorId, action.ceramicId, rng);
    case "RESOLVE_TEST_PIECES":
      return resolveTestPieces(state, actorId, action.use, rng);
    case "RESOLVE_WORKSHOP_SECONDS":
      return resolveWorkshopSeconds(state, actorId, action.ceramicId);
    case "COMPLETE_ORDER":
      return completeOrder(state, actorId, action, rng);
    case "END_ORDER_TURN":
      return endOrderTurn(state, actorId, rng);
    case "DISCARD_ORDERS_FOR_CLEANUP":
      return discardOrdersForCleanup(state, actorId, action.orderIds, rng);
    case "SUBMIT_PRESENTATION":
      return submitPresentation(state, actorId, action.ceramicIds, action.featuredCeramicIds ?? []);
    default:
      return applyFailure(ruleError("INVALID_ACTION", "That action is not part of V1.2.4."));
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
  const { kilnSpaceId: _kilnSpaceId, kilnFurnitureUsed: _kilnFurnitureUsed, ...rest } = ceramic;
  return { ...rest, stage: "finished", quality, firedInRound: round };
}
