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
  activeKilnSpaceIds,
  locationCapacity,
} from "./content.ts";
import { applyFailure, ruleError } from "./errors.ts";
import {
  QUALITY_RANK,
  determineBaseHeat,
  kilnZoneModifier,
  preferredHeat,
  qualityFromDifference,
} from "./firingRules.ts";
import { matchesOrder } from "./orderRules.ts";
import type { RandomSource } from "./rng.ts";
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
  const kilnSettingActors = hasEmptySpace
    ? turnOrderFromFirst(state).filter((playerId) => {
        const player = state.players[playerId];
        const technique = player === undefined ? undefined : ownedTechnique(player, "T09");
        return (
          technique !== undefined &&
          !technique.exhausted &&
          loaded.some((ceramic) => ceramic.ownerId === playerId)
        );
      })
    : [];
  if (kilnSettingActors.length === 0) {
    openContributionPhase(state);
  } else {
    state.phase = {
      type: "firing_before_contribution",
      queue: { actors: kilnSettingActors, currentIndex: 0 },
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

function startWorkPhase(state: GameState): void {
  state.phase = { type: "work", activePlayerId: state.firstPlayerId };
}

function dealStartingOrders(state: GameState): ApplyResult | null {
  const initialOrderIds: Record<PlayerId, OrderId> = {};
  const decisionOrder: PlayerId[] = [];
  for (const playerId of turnOrderFromFirst(state)) {
    const orderId = state.marketDeck.shift();
    const player = state.players[playerId];
    if (orderId === undefined || player === undefined) {
      return applyFailure(
        ruleError("SUPPLY_EMPTY", "The Market deck cannot deal all starting Orders."),
      );
    }
    player.orderHand.push(orderId);
    initialOrderIds[playerId] = orderId;
    const definition = ORDER_DEFINITIONS[orderId];
    if (definition === undefined) {
      return applyFailure(
        ruleError("INVALID_SETUP", "A starting Order has no definition.", { orderId }),
      );
    }
    if (definition.ceramics.length >= 2) {
      decisionOrder.push(playerId);
    }
  }
  if (decisionOrder.length === 0) {
    startWorkPhase(state);
  } else {
    state.phase = {
      type: "setup_starting_orders",
      decisionOrder,
      currentIndex: 0,
      initialOrderIds,
    };
  }
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

function keepStartingOrder(state: GameState, actorId: PlayerId): ApplyResult {
  const phase = requirePhase(state, "setup_starting_orders");
  if (isFailure(phase)) {
    return phase;
  }
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) {
    return actorError;
  }
  const orderId = phase.initialOrderIds[actorId];
  if (orderId === undefined) {
    return applyFailure(
      ruleError("INVALID_ACTION", "No initial Order is awaiting this player's decision."),
    );
  }
  const next = cloneState(state);
  advanceStartingOrderDecision(next);
  return success(next, [{ type: "STARTING_ORDER_KEPT", playerId: actorId, orderId }]);
}

function redrawStartingOrder(state: GameState, actorId: PlayerId): ApplyResult {
  const phase = requirePhase(state, "setup_starting_orders");
  if (isFailure(phase)) {
    return phase;
  }
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) {
    return actorError;
  }
  const currentOrderId = phase.initialOrderIds[actorId];
  const definition = currentOrderId === undefined ? undefined : ORDER_DEFINITIONS[currentOrderId];
  if (currentOrderId === undefined || definition === undefined || definition.ceramics.length < 2) {
    return applyFailure(
      ruleError(
        "STARTING_ORDER_NOT_REDRAWABLE",
        "Only an initial Order requiring at least two ceramics may be redrawn.",
      ),
    );
  }
  const replacementOrderId = state.marketDeck[0];
  if (replacementOrderId === undefined) {
    return applyFailure(ruleError("SUPPLY_EMPTY", "The Market deck has no redraw available."));
  }

  const next = cloneState(state);
  const player = next.players[actorId];
  const nextPhase = next.phase;
  if (player === undefined || nextPhase.type !== "setup_starting_orders") {
    throw new Error("Starting Order redraw invariant failed");
  }
  const handIndex = player.orderHand.indexOf(currentOrderId);
  if (handIndex < 0) {
    throw new Error("Initial Order is missing from the player's hand");
  }
  player.orderHand.splice(handIndex, 1, replacementOrderId);
  next.marketDeck.shift();
  next.marketDiscard.push(currentOrderId);
  nextPhase.initialOrderIds[actorId] = replacementOrderId;
  advanceStartingOrderDecision(next);
  return success(next, [
    {
      type: "STARTING_ORDER_REDRAWN",
      playerId: actorId,
      discardedOrderId: currentOrderId,
      drawnOrderId: replacementOrderId,
    },
  ]);
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
  workerId: string,
  clay: number,
  wood: number,
): ApplyResult {
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
  events.push({
    type: "RESOURCES_CHANGED",
    playerId: actorId,
    clay: gainedClay,
    wood: gainedWood,
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
  const substitutionTarget = action.claySubstitutionTarget;
  const usesSubstitution = useTechniqueIds.includes("T03");
  if (
    usesSubstitution !== (substitutionTarget !== undefined) ||
    substitutionTarget === "ding" && dingExtraShape === undefined ||
    substitutionTarget === "base" && action.shapes.length === 0
  ) {
    return applyFailure(
      ruleError("INVALID_ACTION", "Clay Substitution requires one valid base or Ding payment target."),
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
  if (useTechniqueIds.includes("T04")) {
    const matchesHand = allFormedShapes.some((shape) =>
      context.player.orderHand.some((orderId) =>
        ORDER_DEFINITIONS[orderId]?.ceramics.some(
          (requirement) => requirement.shape === undefined || requirement.shape === shape,
        ),
      ),
    );
    if (!matchesHand) {
      return applyFailure(
        ruleError("INVALID_ACTION", "Drying Frames requires a Shape matching an Order in hand."),
      );
    }
  }

  const requiredByShape = new Map<Shape, number>();
  let totalClay = 0;
  for (const shape of allFormedShapes) {
    requiredByShape.set(shape, (requiredByShape.get(shape) ?? 0) + 1);
    totalClay += SHAPE_COSTS[shape];
  }
  const clayPaid = totalClay - (usesSubstitution ? 1 : 0);
  const coinsPaid = usesSubstitution ? 1 : 0;
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
  for (const shape of allFormedShapes) {
    const vesselInstanceId = next.vesselSupply[shape].shift();
    if (vesselInstanceId === undefined) {
      throw new Error("Validated Vessel supply became empty");
    }
    const ceramicId = `${next.gameId}:ceramic:${next.nextCeramicSequence}`;
    next.nextCeramicSequence += 1;
    next.ceramics[ceramicId] = {
      id: ceramicId,
      vesselInstanceId,
      ownerId: actorId,
      shape,
      stage: "shaped",
    };
    events.push({ type: "CERAMIC_SHAPED", playerId: actorId, ceramicId, shape });
  }
  for (const techniqueId of useTechniqueIds) {
    exhaustTechnique(player, actorId, techniqueId, events);
  }
  if (dingExtraShape !== undefined) {
    player.kilnAbilityUsedThisRound = true;
    events.push({ type: "KILN_ABILITY_USED", playerId: actorId, kilnId: "DI" });
  }
  const rewardClay = useTechniqueIds.includes("T01") ? gainFromSupply(next, player, "clay", 1) : 0;
  const rewardCoins =
    (useTechniqueIds.includes("T02") ? gainFromSupply(next, player, "coins", 2) : 0) +
    (useTechniqueIds.includes("T04") ? gainFromSupply(next, player, "coins", 1) : 0);
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
  if (context.worker.kind === "apprentice" && action.shifuMode !== "normal") {
    return applyFailure(
      ruleError("INVALID_ACTION", "Only the Shifu may use the free-single Decoration mode."),
    );
  }
  const maximum = context.worker.kind === "shifu" && action.shifuMode === "normal" ? 2 : 1;
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
  const hasCarved = action.selections.some((selection) => selection.decoration === "carved");
  const hasImpressed = action.selections.some((selection) => selection.decoration === "impressed");
  if (
    useTechniqueIds.includes("T05") &&
    (!hasCarved || action.shifuMode === "free_single")
  ) {
    return applyFailure(
      ruleError("INVALID_ACTION", "Carving Knives requires a paid Carved Decoration."),
    );
  }
  if (
    useTechniqueIds.includes("T06") &&
    (!hasImpressed || action.shifuMode === "free_single")
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
    if (action.shifuMode !== "free_single") {
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
  completeWorkerAction(next, actorId, events);
  return success(next, events);
}

function officeGainCoins(state: GameState, actorId: PlayerId, workerId: string): ApplyResult {
  const context = validateWorkerAction(
    state,
    actorId,
    workerId,
    "market_imperial_office",
  );
  if (!isWorkerContext(context)) {
    return context;
  }
  const amount = context.worker.kind === "shifu" ? 4 : 2;
  const next = cloneState(state);
  const events: GameEvent[] = [];
  placeWorker(next, actorId, workerId, "market_imperial_office", events);
  const player = next.players[actorId];
  if (player === undefined) {
    throw new Error("Office actor disappeared");
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
  next.phase = { type: "work_office_sale", actorId, workerId };
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
  if (ceramicIds.length > state.commonSupply.coins) {
    return applyFailure(
      ruleError(
        "SUPPLY_EMPTY",
        "The common supply must contain 1 Coin for every sold ceramic.",
        { requested: ceramicIds.length, available: state.commonSupply.coins },
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
  const gainedCoins = ceramicIds.length;
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
    next.commonSupply.coins >= 3 &&
    Object.values(next.ceramics).some(
      (ceramic) =>
        ceramic.ownerId === actorId &&
        ceramic.stage === "finished" &&
        ceramic.quality === "masterpiece",
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
      ceramic.quality !== "masterpiece"
    ) {
      return applyFailure(
        ruleError(
          "ILLEGAL_CERAMIC_STAGE",
          "Connoisseur Network requires one owned Finished undelivered Masterpiece.",
          { ceramicId },
        ),
      );
    }
    if (state.commonSupply.coins < 3) {
      return applyFailure(
        ruleError("SUPPLY_EMPTY", "The common supply must contain all 3 Coins for this sale."),
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
    nextPlayer.resources.coins += 3;
    next.commonSupply.coins -= 3;
    exhaustTechnique(nextPlayer, actorId, "T14", events);
    events.push(
      { type: "CERAMIC_SOLD", playerId: actorId, ceramicId },
      { type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: 0, coins: 3 },
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
  const hasHandSlot = context.player.orderHand.length < orderHandLimit(context.player);
  const hasOrderSource =
    state.marketDisplay.length +
      state.imperialDisplay.length +
      state.marketDeck.length +
      state.imperialDeck.length >
    0;
  if (mode !== "take_up_to_two") {
    if (!hasHandSlot) {
      return applyFailure(ruleError("ORDER_HAND_LIMIT", "The player has no Order hand slot."));
    }
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
      hasHandSlot &&
      hasOrderSource &&
      state.marketDisplay.length + state.imperialDisplay.length > 0
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

function takeOfficeOrder(state: GameState, actorId: PlayerId, orderId: OrderId): ApplyResult {
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
  if (player.orderHand.length >= orderHandLimit(player)) {
    return applyFailure(ruleError("ORDER_HAND_LIMIT", "The player has reached the Order hand limit."));
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
  if (player.orderHand.length >= orderHandLimit(player)) {
    return applyFailure(ruleError("ORDER_HAND_LIMIT", "The player has reached the Order hand limit."));
  }
  const source = deck === "market" ? state.marketDeck : state.imperialDeck;
  if (source.length === 0) {
    return applyFailure(
      ruleError("ORDER_NOT_AVAILABLE", `The ${deck} deck is empty.`, { deck }),
    );
  }

  const next = cloneState(state);
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
  orderId: OrderId,
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
  const deck: OrderDeck | null = state.marketDisplay.includes(orderId)
    ? "market"
    : state.imperialDisplay.includes(orderId)
      ? "imperial"
      : null;
  if (deck === null) {
    return applyFailure(
      ruleError("ORDER_NOT_AVAILABLE", "Choose a face-up Market or Imperial Order."),
    );
  }

  const next = cloneState(state);
  const nextPhase = next.phase;
  const nextPlayer = next.players[actorId];
  if (
    nextPhase.type !== "work_office_orders" || nextPlayer === undefined
  ) {
    throw new Error("Colour Samples state invariant failed");
  }
  const nextDisplay = deck === "market" ? next.marketDisplay : next.imperialDisplay;
  const nextDeck = deck === "market" ? next.marketDeck : next.imperialDeck;
  const index = nextDisplay.indexOf(orderId);
  nextDisplay.splice(index, 1);
  nextDeck.push(orderId);
  const replacement = nextDeck.shift();
  if (replacement !== undefined) nextDisplay.splice(index, 0, replacement);

  const events: GameEvent[] = [];
  exhaustTechnique(nextPlayer, actorId, "T08", events);
  nextPhase.step = "take_or_end";
  nextPhase.colourSamplesUsed = true;
  events.push({
    type: "COLOUR_SAMPLES_USED",
    playerId: actorId,
    deck,
    bottomedOrderId: orderId,
    revealedOrderId: replacement ?? null,
  });
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
  return worker.kind === "shifu" ? Math.max(1, printedCost - 1) : printedCost;
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

function openAfterRevealWindow(state: GameState, events: GameEvent[]): void {
  const context = state.firingContext;
  if (context === null) throw new Error("Post-reveal window requires firing context");
  const actors = turnOrderFromFirst(state).filter((playerId) => {
    const player = state.players[playerId];
    const technique = player === undefined ? undefined : ownedTechnique(player, "T11");
    return (
      player !== undefined &&
      technique !== undefined &&
      !technique.exhausted &&
      context.contributors.includes(playerId) &&
      player.resources.wood >= 1 &&
      player.resources.coins >= 1
    );
  });
  if (actors.length === 0) revealFireAndOpenSaggerSelection(state, events);
  else state.phase = { type: "firing_after_reveal", queue: { actors, currentIndex: 0 } };
}

export function submitWoodContribution(
  state: GameState,
  privateState: PrivateFiringState,
  actorId: PlayerId,
  amount: WoodContribution,
  rng: RandomSource,
): SubmitContributionResult {
  void rng;
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
  if (!Number.isInteger(amount) || amount < 0 || amount > 3 || player.resources.wood < amount) {
    return {
      ok: false,
      error: ruleError("INVALID_CONTRIBUTION", "Contribution must be 0–3 and affordable."),
    };
  }

  const next = cloneState(state);
  const nextPrivate: PrivateFiringState = JSON.parse(JSON.stringify(privateState)) as PrivateFiringState;
  if (next.phase.type !== "firing_contributions") throw new Error("Contribution phase invariant failed");
  next.phase.submittedPlayerIds.push(actorId);
  nextPrivate.contributions[actorId] = amount;
  const events: GameEvent[] = [
    { type: "WOOD_SUBMITTED", playerId: actorId, windowId: next.phase.windowId },
  ];

  if (next.phase.submittedPlayerIds.length === next.phase.eligiblePlayerIds.length) {
    const contributions: Record<PlayerId, number> = {};
    for (const contributorId of next.phase.eligiblePlayerIds) {
      const contribution = nextPrivate.contributions[contributorId];
      const contributor = next.players[contributorId];
      if (contribution === undefined || contributor === undefined) {
        throw new Error("A revealed contribution is missing");
      }
      contributor.resources.wood -= contribution;
      next.commonSupply.wood += contribution;
      contributions[contributorId] = contribution;
    }
    next.firingContext = {
      round: next.round,
      contributors: [...next.phase.eligiblePlayerIds],
      contributions,
      baseHeat: null,
      fireModifier: null,
      globalHeat: null,
      zeroFireModifierCeramicIds: [],
      ceramicResults: {},
    };
    events.push({ type: "WOOD_REVEALED", contributions: { ...contributions } });
    nextPrivate.windowId = null;
    nextPrivate.contributions = {};
    openAfterRevealWindow(next, events);
  }
  next.revision += 1;
  next.eventSequence += events.length;
  return { ok: true, state: next, privateState: nextPrivate, events };
}

function revealFireAndOpenSaggerSelection(state: GameState, events: GameEvent[]): void {
  const context = state.firingContext;
  if (context === null) throw new Error("Heat calculation requires firing context");
  const totalWood = Object.values(context.contributions).reduce((sum, amount) => sum + amount, 0);
  const baseHeat = determineBaseHeat(context.contributors.length, totalWood);
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
      player.resources.coins >= 2 &&
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
    const ignoredFireModifier = context.zeroFireModifierCeramicIds.includes(ceramic.id);
    const actualHeat =
      context.baseHeat + (ignoredFireModifier ? 0 : context.fireModifier) + zoneModifier;
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
      return ownedResults.some((result) => result.naturalHeatDifference === 1);
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
      player.resources.coins < 2 ||
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
    nextPlayer.resources.coins -= 2;
    next.commonSupply.coins += 2;
    nextContext.zeroFireModifierCeramicIds.push(ceramicId);
    exhaustTechnique(nextPlayer, actorId, "T16", events);
    events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: 0, coins: -2 });
  }
  advanceQueuedWindow(next, () => calculateActualHeatAndOpenQualityWindow(next, events));
  return success(next, events);
}

function resolveFuelLedger(state: GameState, actorId: PlayerId, use: boolean): ApplyResult {
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
    if (player.resources.wood < 1 || player.resources.coins < 1) {
      return applyFailure(
        ruleError("INSUFFICIENT_RESOURCES", "Fuel Ledger costs 1 Wood and 1 Coin."),
      );
    }
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  if (use) {
    const nextPlayer = next.players[actorId];
    const nextContext = next.firingContext;
    if (nextPlayer === undefined || nextContext === null) throw new Error("Fuel Ledger invariant failed");
    nextPlayer.resources.wood -= 1;
    nextPlayer.resources.coins -= 1;
    next.commonSupply.wood += 1;
    next.commonSupply.coins += 1;
    nextContext.contributions[actorId] = (nextContext.contributions[actorId] ?? 0) + 1;
    exhaustTechnique(nextPlayer, actorId, "T11", events);
    events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: -1, coins: -1 });
  }
  advanceQueuedWindow(next, () => revealFireAndOpenSaggerSelection(next, events));
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
      player.resources.coins >= 1 &&
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
  const isPass = ceramicId === null && delta === null;
  if ((ceramicId === null) !== (delta === null)) {
    return applyFailure(ruleError("INVALID_SELECTION", "Jun requires a ceramic and ±1."));
  }
  if (!isPass) {
    const ceramic = ceramicId === null ? undefined : state.ceramics[ceramicId];
    if (ceramic === undefined || ceramic.ownerId !== actorId || ceramic.stage !== "loaded") {
      return applyFailure(ruleError("ILLEGAL_CERAMIC_STAGE", "Jun must select an owned Loaded ceramic."));
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
  if (ceramicId !== null) {
    const ceramic = state.ceramics[ceramicId];
    const result = state.firingContext?.ceramicResults[ceramicId];
    if (
      ceramic === undefined ||
      ceramic.ownerId !== actorId ||
      ceramic.stage !== "loaded" ||
      result?.naturalHeatDifference !== 1
    ) {
      return applyFailure(
        ruleError("INVALID_SELECTION", "Ge requires an owned ceramic with natural difference exactly 1."),
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
    result.finalHeatDifference = 0;
    result.forcedQuality = "masterpiece";
    nextPlayer.kilnAbilityUsedThisRound = true;
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
    nextPlayer.resources.coins -= 1;
    next.commonSupply.coins += 1;
    result.assignedQuality = result.assignedQuality === "flawed" ? "standard" : "fine";
    exhaustTechnique(nextPlayer, actorId, "T10", events);
    events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: 0, coins: -1 });
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
  const testPiecesActors = turnOrderFromFirst(state).filter((playerId) => {
    const player = state.players[playerId];
    const technique = player === undefined ? undefined : ownedTechnique(player, "T12");
    return (
      technique !== undefined &&
      !technique.exhausted &&
      Object.values(context.ceramicResults).some(
        (result) => result.naturalExactMatch && state.ceramics[result.ceramicId]?.ownerId === playerId,
      )
    );
  });
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
      ).length >= 2
    );
  });
  const actors = [...testPiecesActors, ...kilnRecordsActors];
  const techniqueIds = [
    ...testPiecesActors.map(() => "T12" as TechniqueId),
    ...kilnRecordsActors.map(() => "T13" as TechniqueId),
  ];
  if (actors.length === 0) finalizeFiring(state, events);
  else {
    state.phase = {
      type: "firing_after_firing",
      queue: { actors, currentIndex: 0 },
      techniqueIds,
    };
  }
}

function resolveTestPieces(state: GameState, actorId: PlayerId, use: boolean): ApplyResult {
  const phase = requirePhase(state, "firing_after_firing");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  if (phase.techniqueIds[phase.queue.currentIndex] !== "T12") {
    return applyFailure(ruleError("INVALID_ACTION", "Test Pieces is not the current decision."));
  }
  const player = state.players[actorId];
  if (use) {
    const technique = player === undefined ? undefined : ownedTechnique(player, "T12");
    const eligible = Object.values(state.firingContext?.ceramicResults ?? {}).some(
      (result) => result.naturalExactMatch && state.ceramics[result.ceramicId]?.ownerId === actorId,
    );
    if (technique === undefined || technique.exhausted || !eligible) {
      return applyFailure(ruleError("INVALID_ACTION", "Test Pieces is not eligible."));
    }
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  if (use) {
    const nextPlayer = next.players[actorId];
    if (nextPlayer === undefined) throw new Error("Test Pieces actor disappeared");
    const exactMatches = Object.values(next.firingContext?.ceramicResults ?? {}).filter(
      (result) => result.naturalExactMatch && next.ceramics[result.ceramicId]?.ownerId === actorId,
    ).length;
    const gained = gainFromSupply(next, nextPlayer, "coins", Math.min(2, exactMatches));
    exhaustTechnique(nextPlayer, actorId, "T12", events);
    if (gained > 0) {
      events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: 0, coins: gained });
    }
  }
  advanceQueuedWindow(next, () => finalizeFiring(next, events));
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
    if (technique === undefined || technique.exhausted || masterpieceCount < 2) {
      return applyFailure(ruleError("INVALID_ACTION", "Kiln Records is not eligible."));
    }
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  if (use) {
    const nextPlayer = next.players[actorId];
    if (nextPlayer === undefined) throw new Error("Kiln Records actor disappeared");
    const gainedClay = gainFromSupply(next, nextPlayer, "clay", 1);
    const gainedCoins = gainFromSupply(next, nextPlayer, "coins", 1);
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
  for (const playerId of turnOrderFromFirst(state)) {
    const player = state.players[playerId];
    if (player?.kilnId !== "RU" || player.kilnAbilityUsedThisRound) continue;
    const qualifies = Object.values(context.ceramicResults).some((result) => {
      const ceramic = state.ceramics[result.ceramicId];
      return (
        ceramic?.stage === "loaded" &&
        ceramic.ownerId === playerId &&
        ceramic.glaze === "celadon" &&
        ceramic.decoration === "plain" &&
        result.assignedQuality === "masterpiece"
      );
    });
    if (qualifies) {
      player.score.kilnTraditionVp += 2;
      player.kilnAbilityUsedThisRound = true;
      events.push({ type: "KILN_ABILITY_USED", playerId, kilnId: "RU" });
    }
  }
  for (const result of Object.values(context.ceramicResults)) {
    const ceramic = state.ceramics[result.ceramicId];
    if (ceramic === undefined || ceramic.stage !== "loaded" || result.assignedQuality === null) {
      throw new Error("Firing result is incomplete");
    }
    state.ceramics[result.ceramicId] = makeFinishedCeramic(
      ceramic,
      result.assignedQuality,
      state.round,
    );
  }
  state.lastFiringResult = {
    round: context.round,
    baseHeat: context.baseHeat,
    fireModifier: context.fireModifier,
    globalHeat: context.globalHeat,
  };
  state.fireDiscard.push(context.fireModifier);
  state.firingContext = null;
  beginOrderPhase(state);
}

function advanceImperialProgress(
  state: GameState,
  playerId: PlayerId,
  reward: 1 | 2,
  source: "imperial_order" | "court_patronage",
  events: GameEvent[],
): { from: PlayerState["imperialProgress"]; to: PlayerState["imperialProgress"] } {
  const player = state.players[playerId];
  if (player === undefined) throw new Error("Imperial Progress player disappeared");
  const from = player.imperialProgress;
  const to = Math.min(5, from + reward) as PlayerState["imperialProgress"];
  player.imperialProgress = to;
  if (from < 2 && to >= 2) player.pendingApprenticeUnlocks += 1;
  if (from < 4 && to >= 4) player.pendingApprenticeUnlocks += 1;
  events.push({
    type: "IMPERIAL_PROGRESS_ADVANCED",
    playerId,
    from,
    to,
    reward,
  });
  if (source === "imperial_order" && to === 5 && state.imperialSealOwnerId === null) {
    state.imperialSealOwnerId = playerId;
    events.push({ type: "IMPERIAL_SEAL_CLAIMED", playerId });
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
    "market_imperial_office",
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
  if (context.player.resources.coins < 5) {
    return applyFailure(
      ruleError("INSUFFICIENT_RESOURCES", "Court Patronage costs 5 Coins.", {
        requiredCoins: 5,
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
  placeWorker(next, actorId, workerId, "market_imperial_office", events);
  const player = next.players[actorId];
  if (player === undefined) throw new Error("Court Patronage actor disappeared");
  player.resources.coins -= 5;
  next.commonSupply.coins += 5;
  events.push({ type: "RESOURCES_CHANGED", playerId: actorId, clay: 0, wood: 0, coins: -5 });
  const progress = advanceImperialProgress(next, actorId, 1, "court_patronage", events);
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
  if (action.useGuanWaiver) {
    nextPlayer.kilnAbilityUsedThisRound = true;
    events.push({ type: "KILN_ABILITY_USED", playerId: actorId, kilnId: "GU" });
  }
  if (isImperial && nextPlayer.imperialProgress < 5) {
    const reward = definition.imperialProgressReward;
    if (reward === undefined) throw new Error("Imperial Order progress reward is missing");
    advanceImperialProgress(next, actorId, reward, "imperial_order", events);
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

function calculatePresentationVp(state: GameState, player: PlayerState): number {
  const ceramics = player.presentationCeramicIds.map((id) => state.ceramics[id]).filter(
    (ceramic): ceramic is Extract<CeramicState, { stage: "presented" }> =>
      ceramic?.stage === "presented",
  );
  let score = ceramics.reduce(
    (sum, ceramic) => sum + IMPERIAL_PROGRESS.presentation.qualityVp[ceramic.quality],
    0,
  );
  if (ceramics.length === 3 && new Set(ceramics.map((ceramic) => ceramic.shape)).size === 3) {
    score += IMPERIAL_PROGRESS.presentation.threeDifferentShapesBonus;
  }
  if (ceramics.length === 3 && new Set(ceramics.map((ceramic) => ceramic.glaze)).size === 3) {
    score += IMPERIAL_PROGRESS.presentation.threeDifferentGlazesBonus;
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
    const progressVp = IMPERIAL_PROGRESS.track[player.imperialProgress]?.endGameVp ?? 0;
    const sealVp = state.imperialSealOwnerId === playerId ? IMPERIAL_PROGRESS.imperialSealVp : 0;
    const presentationVp = calculatePresentationVp(state, player);
    const coinVp = Math.min(
      GAME_CONFIG.coinEndGame.maxVp,
      Math.floor(player.resources.coins / GAME_CONFIG.coinEndGame.coinsPerVp),
    );
    const total =
      player.score.orderVp +
      progressVp +
      sealVp +
      presentationVp +
      player.score.kilnTraditionVp +
      coinVp;
    scores[playerId] = {
      orders: player.score.orderVp,
      imperialProgress: progressVp,
      imperialSeal: sealVp,
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

function performCleanup(state: GameState, events: GameEvent[]): void {
  for (const player of Object.values(state.players)) {
    for (const worker of Object.values(player.workers)) {
      if (worker.status === "placed") {
        worker.status = "available";
        worker.locationId = null;
      }
    }
    while (player.pendingApprenticeUnlocks > 0) {
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

  const marketDiscard = state.marketDisplay.shift();
  if (marketDiscard !== undefined) state.marketDiscard.push(marketDiscard);
  const imperialDiscard = state.imperialDisplay.shift();
  if (imperialDiscard !== undefined) state.imperialDiscard.push(imperialDiscard);
  refillTo(state.marketDisplay, state.marketDeck, GAME_CONFIG.orderDisplay.market);
  refillTo(state.imperialDisplay, state.imperialDeck, GAME_CONFIG.orderDisplay.imperial);

  const firstIndex = state.playerOrder.indexOf(state.firstPlayerId);
  const nextFirst = state.playerOrder[(firstIndex + 1) % state.playerOrder.length];
  if (nextFirst === undefined) throw new Error("Unable to pass First Player");
  state.firstPlayerId = nextFirst;

  if (state.round < 5) {
    state.round = (state.round + 1) as RoundNumber;
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

  const eligiblePlayerIds = state.playerOrder.filter((playerId) => {
    const progress = state.players[playerId]?.imperialProgress ?? 0;
    return IMPERIAL_PROGRESS.presentation.eligibleSpaces.includes(progress);
  });
  state.phase = { type: "presentation", eligiblePlayerIds, submittedPlayerIds: [] };
  if (eligiblePlayerIds.length === 0) finalizeGame(state, events);
}

function endOrderTurn(state: GameState, actorId: PlayerId): ApplyResult {
  const phase = requirePhase(state, "orders");
  if (isFailure(phase)) return phase;
  const actorError = actorFailure(state, actorId);
  if (actorError !== null) return actorError;
  const next = cloneState(state);
  const events: GameEvent[] = [];
  if (next.phase.type !== "orders") throw new Error("Order phase invariant failed");
  next.phase.currentIndex += 1;
  const nextActor = next.phase.turnOrder[next.phase.currentIndex];
  if (nextActor === undefined) performCleanup(next, events);
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
    return applyFailure(ruleError("PRESENTATION_NOT_ELIGIBLE", "This player is not eligible."));
  }
  if (phase.submittedPlayerIds.includes(actorId)) {
    return applyFailure(ruleError("INVALID_ACTION", "This player already submitted a Presentation."));
  }
  if (
    ceramicIds.length > IMPERIAL_PROGRESS.presentation.maxCeramics ||
    new Set(ceramicIds).size !== ceramicIds.length
  ) {
    return applyFailure(ruleError("INVALID_SELECTION", "Present at most three unique ceramics."));
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
        ruleError("PRESENTATION_NOT_ELIGIBLE", "Presentation requires owned Finished Standard+ ceramics."),
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
  void rng;
  switch (action.type) {
    case "SELECT_KILN":
      return selectKiln(state, actorId, action.kilnId);
    case "KEEP_STARTING_ORDER":
      return keepStartingOrder(state, actorId);
    case "REDRAW_STARTING_ORDER":
      return redrawStartingOrder(state, actorId);
    case "PASS_WORK_PHASE":
      return passWorkPhase(state, actorId);
    case "GAIN_MATERIALS":
      return gainMaterials(state, actorId, action.workerId, action.clay, action.wood);
    case "FORM_CERAMICS":
      return formCeramics(state, actorId, action);
    case "GLAZE_CERAMICS":
      return glazeCeramics(state, actorId, action);
    case "USE_KILN_YARD":
      return useKilnYard(state, actorId, action);
    case "OFFICE_GAIN_COINS":
      return officeGainCoins(state, actorId, action.workerId);
    case "BEGIN_OFFICE_ORDERS":
      return beginOfficeOrders(state, actorId, action.workerId, action.mode);
    case "OFFICE_TAKE_ORDER":
      return takeOfficeOrder(state, actorId, action.orderId);
    case "OFFICE_DRAW_BLIND_ORDER":
      return drawBlindOfficeOrder(state, actorId, action.deck);
    case "OFFICE_END_ORDERS":
      return endOfficeOrders(state, actorId);
    case "OFFICE_USE_COLOUR_SAMPLES":
      return useColourSamples(state, actorId, action.orderId);
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
    case "RESOLVE_FUEL_LEDGER":
      return resolveFuelLedger(state, actorId, action.use);
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
    case "RESOLVE_TEST_PIECES":
      return resolveTestPieces(state, actorId, action.use);
    case "RESOLVE_KILN_RECORDS":
      return resolveKilnRecords(state, actorId, action.use);
    case "COMPLETE_ORDER":
      return completeOrder(state, actorId, action);
    case "END_ORDER_TURN":
      return endOrderTurn(state, actorId);
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
