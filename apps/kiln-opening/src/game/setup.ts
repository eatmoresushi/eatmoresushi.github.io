import {
  COMMON_SUPPLY,
  DISCIPLINES,
  FIRE_CARDS,
  GAME_CONFIG,
  IMPERIAL_ORDERS,
  KILN_IDS,
  MARKET_ORDERS,
  SHAPES,
  TECHNIQUES,
} from "./content";
import { createFailure, ruleError } from "./errors";
import type { RandomSource } from "./rng";
import { shuffle } from "./rng";
import { emptyActionBoard } from "./selectors";
import type {
  CreateGameInput,
  CreateGameResult,
  GameState,
  PlayerCount,
  PlayerId,
  PlayerState,
  Shape,
  TechniqueDeckState,
  TechniqueDisplayState,
  WorkerState,
} from "./types";

function makeWorkers(playerId: PlayerId): Record<string, WorkerState> {
  const shifuId = `${playerId}:shifu`;
  const workers: Record<string, WorkerState> = {
    [shifuId]: {
      id: shifuId,
      kind: "shifu",
      status: "available",
      locationId: null,
    },
  };

  for (let index = 1; index <= GAME_CONFIG.workers.apprenticesTotal; index += 1) {
    const id = `${playerId}:apprentice:${index}`;
    workers[id] = {
      id,
      kind: "apprentice",
      status: index <= GAME_CONFIG.workers.apprenticesStarting ? "available" : "locked",
      locationId: null,
    };
  }
  return workers;
}

function makePlayer(input: CreateGameInput["players"][number], seatIndex: number): PlayerState {
  return {
    id: input.id,
    seatIndex,
    displayName: input.displayName,
    kilnId: null,
    resources: { ...GAME_CONFIG.startingResources },
    workers: makeWorkers(input.id),
    orderHand: [],
    completedOrders: [],
    techniques: [],
    imperialProgress: 0,
    passedWorkPhase: false,
    progressAdvancedThisRound: false,
    pendingApprenticeUnlocks: 0,
    kilnAbilityUsedThisRound: false,
    presentationCeramicIds: [],
    score: { orderVp: 0, kilnTraditionVp: 0 },
  };
}

function drawMany<T>(deck: T[], count: number): T[] {
  return deck.splice(0, count);
}

function makeTechniqueState(rng: RandomSource): {
  decks: TechniqueDeckState;
  display: TechniqueDisplayState;
} {
  const decks = {
    forming: [] as string[],
    glazing: [] as string[],
    firing: [] as string[],
  };
  const display = {
    forming: [] as string[],
    glazing: [] as string[],
    firing: [] as string[],
  };

  for (const discipline of DISCIPLINES) {
    const shuffled = shuffle(
      TECHNIQUES.filter((technique) => technique.discipline === discipline).map(
        (technique) => technique.id,
      ),
      rng,
    );
    display[discipline] = drawMany(shuffled, GAME_CONFIG.techniques.faceUpPerDiscipline);
    decks[discipline] = shuffled;
  }
  return { decks, display };
}

function makeVesselSupply(): Record<Shape, string[]> {
  return Object.fromEntries(
    SHAPES.map((shape) => [
      shape,
      Array.from(
        { length: GAME_CONFIG.shapeSupplyEach },
        (_, index) => `${shape}:vessel:${index + 1}`,
      ),
    ]),
  ) as Record<Shape, string[]>;
}

export function createGame(input: CreateGameInput, rng: RandomSource): CreateGameResult {
  const playerCount = input.players.length;
  if (playerCount < GAME_CONFIG.players.min || playerCount > GAME_CONFIG.players.max) {
    return createFailure(
      ruleError("INVALID_SETUP", "Kiln Opening requires 2 to 4 players.", { playerCount }),
    );
  }
  if (input.gameId.trim().length === 0) {
    return createFailure(ruleError("INVALID_SETUP", "gameId must not be empty."));
  }

  const ids = input.players.map((player) => player.id);
  if (ids.some((id) => id.trim().length === 0) || new Set(ids).size !== ids.length) {
    return createFailure(
      ruleError("INVALID_SETUP", "Player IDs must be non-empty and unique."),
    );
  }
  if (input.players.some((player) => player.displayName.trim().length === 0)) {
    return createFailure(ruleError("INVALID_SETUP", "Display names must not be empty."));
  }

  const typedPlayerCount = playerCount as PlayerCount;
  const playerOrder = [...ids];
  const firstPlayerId = playerOrder[rng.nextInt(playerOrder.length)];
  if (firstPlayerId === undefined) {
    return createFailure(ruleError("INVALID_SETUP", "Unable to choose First Player."));
  }
  const firstIndex = playerOrder.indexOf(firstPlayerId);
  const turnOrder = [...playerOrder.slice(firstIndex), ...playerOrder.slice(0, firstIndex)];
  const selectionOrder = [...turnOrder].reverse();

  const marketDeck = shuffle(
    MARKET_ORDERS.map((order) => order.id),
    rng,
  );
  const imperialDeck = shuffle(
    IMPERIAL_ORDERS.map((order) => order.id),
    rng,
  );
  const marketDisplay = drawMany(marketDeck, GAME_CONFIG.orderDisplay.market);
  const imperialDisplay = drawMany(imperialDeck, GAME_CONFIG.orderDisplay.imperial);
  const techniqueState = makeTechniqueState(rng);
  const fireDeck = shuffle(FIRE_CARDS, rng);

  const players = Object.fromEntries(
    input.players.map((player, index) => [player.id, makePlayer(player, index)]),
  ) as Record<PlayerId, PlayerState>;

  const commonSupply = {
    clay: COMMON_SUPPLY.clay - GAME_CONFIG.startingResources.clay * playerCount,
    wood: COMMON_SUPPLY.wood - GAME_CONFIG.startingResources.wood * playerCount,
    coins: COMMON_SUPPLY.coins - GAME_CONFIG.startingResources.coins * playerCount,
  };

  const state: GameState = {
    schemaVersion: 1,
    rulesVersion: "0.4",
    gameId: input.gameId,
    revision: 0,
    eventSequence: 0,
    nextCeramicSequence: 1,
    playerCount: typedPlayerCount,
    round: 1,
    playerOrder,
    firstPlayerId,
    phase: {
      type: "setup_kiln_selection",
      selectionOrder,
      currentIndex: 0,
    },
    players,
    actionBoard: { placements: emptyActionBoard() },
    ceramics: {},
    commonSupply,
    vesselSupply: makeVesselSupply(),
    marketDeck,
    marketDiscard: [],
    marketDisplay,
    imperialDeck,
    imperialDiscard: [],
    imperialDisplay,
    techniqueDecks: techniqueState.decks,
    techniqueDisplay: techniqueState.display,
    fireDeck,
    fireDiscard: [],
    imperialSealOwnerId: null,
    firingContext: null,
    finalResult: null,
  };

  if (new Set(KILN_IDS).size !== KILN_IDS.length) {
    return createFailure(ruleError("INVALID_SETUP", "Kiln definitions must be unique."));
  }
  return { ok: true, state };
}
