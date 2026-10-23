/**
 * Initial state, and the Kiln and Main Order choice (rev. 4 L113–126, change 32, R1, R23).
 * Package P2, layer 4.
 *
 * `createInitialState` follows the fixed setup draw order of DESIGN §7 (as revised by
 * ENGINE_V1.6.2_DELTA.md §15.9.1) exactly, so a seed always produces the same game:
 * 1. shuffle the Starting deck; 2. shuffle the Main deck;
 * 3. deal 2 Starting Orders to each player in seat order (rev. 4 L115, secret); nothing Main
 *    is dealt;
 * 4. return the undealt Starting Orders to the box (rev. 4 L116);
 * 5. reveal 6 Main Orders from the top of the Main deck, left to right (rev. 4 L116): no
 *    reshuffle, since nothing Main was dealt;
 * 6. shuffle the Tech decks in the order Workshop, Glazing & Loading, Firing and reveal 2
 *    each (L103);
 * 7. shuffle the Fire deck (L104);
 * 8. choose the First Player: `playerOrder[rng.nextInt(n)]` (L108).
 *
 * Setup step 9 then runs in reverse turn order (rev. 4 L122): in one turn (R23) each player
 * chooses an available Kiln (all five, R1) and takes 1 face-up Main Order into their hand; the
 * take is public, and the display is refilled to 6 before the next player chooses. The last
 * choice hands over `setup_done`; Start of Round (incl. Round 1's Kiln Die roll, INT) is
 * `round.startRound`. Every seat starts with the same resources (rev. 4 L125): there is no seat
 * Coin (change 35).
 */

import {
  BASE_CONTRIBUTION_CARD_IDS,
  DISCIPLINES,
  FIRING,
  GAME_CONFIG,
  KILN_IDS,
  KILN_SPACE_IDS,
  LOCATIONS,
  MAIN_ORDER_IDS,
  PERSONAL_LOCATION_IDS,
  SHAPES,
  STARTING_ORDER_IDS,
  activeKilnSpaces,
  techsOfDiscipline,
} from "./content.ts";
import { InvariantError, invariant, ruleError } from "./errors.ts";
import { availableKilns } from "./kilns.ts";
import { addToHand, refillMainDisplay, refillTechDisplay, takeFaceUpOrder } from "./market.ts";
import { shuffle } from "./rng.ts";
import { emit, phaseAs, player } from "./state.ts";
import type {
  ActionHandlerTable,
  CreateGameInput,
  CreateGameResult,
  FlowController,
  GameEvent,
  GameRuleError,
  GameState,
  KilnSpaceId,
  MainOrderId,
  OrderId,
  PersonalLocationId,
  PersonalSpaceState,
  PlayerCount,
  PlayerId,
  PlayerSetup,
  PlayerState,
  RandomSource,
  ResolveContext,
  Shape,
  SharedKilnSpaceState,
  StartingOrderId,
  TechDiscipline,
  TechId,
  VesselInstanceId,
  WorkerState,
} from "./types.ts";

// ── Input validation ─────────────────────────────────────────────────────────────────

/** Object keys that would not become own properties of a plain `Record`. */
const RESERVED_IDS: ReadonlySet<string> = new Set(["__proto__"]);

function invalidSetup(message: string, details: GameRuleError["details"]): CreateGameResult {
  return { ok: false, error: ruleError("INVALID_SETUP", message, details) };
}

function setupError(input: CreateGameInput): CreateGameResult | null {
  const { min, max } = GAME_CONFIG.players;
  if (typeof input.gameId !== "string" || input.gameId.trim().length === 0) {
    return invalidSetup("A game needs a non-empty game ID.", { field: "gameId" });
  }
  if (!Array.isArray(input.players)) {
    return invalidSetup(`Kiln Opening needs ${min} to ${max} players.`, { field: "players", minPlayers: min, maxPlayers: max });
  }
  const count = input.players.length;
  if (count < min || count > max) {
    return invalidSetup(`Kiln Opening needs ${min} to ${max} players.`, { playerCount: count, minPlayers: min, maxPlayers: max });
  }
  const seen = new Set<string>();
  for (const [seatIndex, seat] of input.players.entries()) {
    const id: unknown = seat?.id;
    if (typeof id !== "string" || id.trim().length === 0 || RESERVED_IDS.has(id)) {
      return invalidSetup("Every player needs a non-empty player ID.", { field: "id", seatIndex });
    }
    if (seen.has(id)) {
      return invalidSetup("Player IDs must be unique.", { field: "id", seatIndex });
    }
    seen.add(id);
    const name: unknown = seat.displayName;
    if (typeof name !== "string" || name.trim().length === 0) {
      return invalidSetup("Every player needs a display name.", { field: "displayName", seatIndex });
    }
  }
  return null;
}

// ── Initial pieces ───────────────────────────────────────────────────────────────────

function makeWorkers(playerId: PlayerId): Record<string, WorkerState> {
  const workers: Record<string, WorkerState> = {};
  invariant(GAME_CONFIG.workers.shifu === 1, "Each player has exactly one Shifu (L74)");
  const shifuId = `${playerId}:shifu`;
  workers[shifuId] = { id: shifuId, kind: "shifu", placement: null };
  for (let index = 1; index <= GAME_CONFIG.workers.apprentices; index += 1) {
    const id = `${playerId}:apprentice:${index}`;
    workers[id] = { id, kind: "apprentice", placement: null };
  }
  return workers;
}

/** Space 0 open, space 1 under a Lock token (L73, L108). */
function makePersonalSpaces(): Record<PersonalLocationId, [PersonalSpaceState, PersonalSpaceState]> {
  const spaces = {} as Record<PersonalLocationId, [PersonalSpaceState, PersonalSpaceState]>;
  for (const locationId of PERSONAL_LOCATION_IDS) {
    const layout = LOCATIONS[locationId].personalSpaces;
    invariant(layout !== null && layout.total === 2, `${locationId} has 2 personal spaces`);
    spaces[locationId] = [{ unlocked: layout.unlockedAtStart >= 1 }, { unlocked: layout.unlockedAtStart >= 2 }];
  }
  return spaces;
}

function makePlayer(seat: PlayerSetup, seatIndex: number): PlayerState {
  return {
    id: seat.id,
    seatIndex,
    displayName: seat.displayName,
    kilnId: null,
    resources: { ...GAME_CONFIG.startingResources },
    workers: makeWorkers(seat.id),
    personalSpaces: makePersonalSpaces(),
    techs: [],
    // Bank, Tend and Stoke (v1.6.2 L260); Fuel Ledger adds its 2 cards when gained (change 26).
    contributionCards: [...BASE_CONTRIBUTION_CARD_IDS],
    kilnAbilityUsedThisRound: false,
    imperial: { recognition: 0, grantReceived: false, kilnGained: false, priority: "on_track", audienceReceived: false },
    completedOrders: [],
    score: { orders: 0, kilnAbilities: 0, recognitionOverflow: 0, imperialAudience: 0 },
  };
}

function makeSharedKiln(playerCount: PlayerCount): Record<KilnSpaceId, SharedKilnSpaceState> {
  const active = activeKilnSpaces(playerCount);
  const spaces = {} as Record<KilnSpaceId, SharedKilnSpaceState>;
  for (const spaceId of KILN_SPACE_IDS) {
    spaces[spaceId] = { active: active.includes(spaceId), ceramicIds: [], setterMarkOwnerId: null, kilnFurniture: null };
  }
  return spaces;
}

/** Ten Vessel cards per Shape, `bowl-01` … `censer-10` (L80, L105). */
function makeVesselSupply(): Record<Shape, VesselInstanceId[]> {
  const supply = {} as Record<Shape, VesselInstanceId[]>;
  for (const shape of SHAPES) {
    supply[shape] = Array.from({ length: GAME_CONFIG.shapeSupplyEach }, (_, index) => `${shape}-${String(index + 1).padStart(2, "0")}`);
  }
  return supply;
}

function emptyTechRecord(): Record<TechDiscipline, TechId[]> {
  return { workshop: [], glazing_loading: [], firing: [] };
}

function takeTop<T>(deck: T[], count: number, what: string): T[] {
  const cards = deck.splice(0, count);
  invariant(cards.length === count, `The ${what} deck ran out during setup`);
  return cards;
}

/** Setup never hands over mid-command; reaching the flow from here is an engine bug. */
const SETUP_FLOW: FlowController = {
  continueAfter(milestone) {
    throw new InvariantError(`Setup cannot hand over ${milestone}`);
  },
  workerActionDone() {
    throw new InvariantError("Setup has no worker actions");
  },
};

// ── createInitialState ───────────────────────────────────────────────────────────────

/**
 * The initial state, in `setup_kiln_selection`, and its creation events (persisted by the
 * service, DESIGN §4.6): `GAME_CREATED`, one `ORDERS_DEALT` per seat (cards under `secret`),
 * `DISPLAY_REFILLED` (cause `setup`) and one `TECH_DISPLAY_REFILLED` per discipline.
 */
export function createInitialState(input: CreateGameInput, rng: RandomSource): CreateGameResult {
  const invalid = setupError(input);
  if (invalid !== null) {
    return invalid;
  }
  const playerOrder: PlayerId[] = input.players.map((seat) => seat.id);
  const playerCount = playerOrder.length as PlayerCount;

  // §7 steps 1–2.
  const startingDeck: StartingOrderId[] = shuffle(STARTING_ORDER_IDS, rng);
  const mainDeck: MainOrderId[] = shuffle(MAIN_ORDER_IDS, rng);

  // §7 step 3 (rev. 4 L115): 2 Starting Orders each, in seat order. Nothing Main is dealt: each
  // player takes a face-up Main Order at step 9 (`SELECT_KILN`, rev. 4 L122).
  const dealtStarting = new Map<PlayerId, StartingOrderId[]>();
  for (const playerId of playerOrder) {
    dealtStarting.set(playerId, takeTop(startingDeck, GAME_CONFIG.setupDeal.startingOrders, "Starting Order"));
  }

  // §7 step 4 (rev. 4 L116): any undealt Starting Orders go to the box; a 4-player game deals
  // all 8 (A0, change 23), leaving the box empty.
  const startingBox: StartingOrderId[] = startingDeck.splice(0);

  const players: Record<PlayerId, PlayerState> = {};
  const orderHands: Record<PlayerId, OrderId[]> = {};
  input.players.forEach((seat, seatIndex) => {
    players[seat.id] = makePlayer(seat, seatIndex);
    orderHands[seat.id] = [...(dealtStarting.get(seat.id) ?? [])];
  });

  const firstSeat = playerOrder[0];
  invariant(firstSeat !== undefined, "A game has players");
  const draft: GameState = {
    schemaVersion: 9,
    rulesVersion: GAME_CONFIG.rulesVersion,
    gameId: input.gameId,
    revision: 0,
    eventSequence: 0,
    nextCeramicSequence: 1,
    nextProxySequence: 1,
    placementSequence: 0,
    playerCount,
    round: 1,
    playerOrder,
    // Chosen at §7 step 8, after every shuffle.
    firstPlayerId: firstSeat,
    phase: { type: "setup_kiln_selection", selectionOrder: [], index: 0 },
    players,
    ceramics: {},
    vesselSupply: makeVesselSupply(),
    sharedKiln: { spaces: makeSharedKiln(playerCount) },
    market: { display: [], refillPendingFor: null },
    techDisplay: emptyTechRecord(),
    fireDiscard: [],
    kilnDie: null,
    firing: null,
    lastFiring: null,
    finalResult: null,
    hidden: {
      orderHands,
      mainDeck,
      mainDiscard: [],
      startingBox,
      techDecks: emptyTechRecord(),
      fireDeck: [],
      fireBuried: 0,
      pendingLook: null,
      firePeeks: {},
    },
  };

  const events: GameEvent[] = [];
  const ctx: ResolveContext = { rng, events, flow: SETUP_FLOW };
  for (const playerId of playerOrder) {
    const startingOrderIds = dealtStarting.get(playerId) ?? [];
    emit(ctx, {
      type: "ORDERS_DEALT",
      playerId,
      startingCount: startingOrderIds.length,
      secret: { visibleTo: playerId, startingOrderIds: [...startingOrderIds] },
    });
  }
  // §7 step 5 (rev. 4 L116): reveal 6 face-up Main Orders from left to right, off the top of
  // the Main deck as shuffled at step 2.
  refillMainDisplay(draft, "setup", ctx);

  // §7 step 6 (L103): shuffle each discipline in rulebook order and reveal 2.
  for (const discipline of DISCIPLINES) {
    draft.hidden.techDecks[discipline] = shuffle(techsOfDiscipline(discipline), rng);
    refillTechDisplay(draft, discipline, ctx);
  }

  // §7 step 7 (L104): the Fire deck; the discard starts empty and is open (L512).
  draft.hidden.fireDeck = shuffle(FIRING.fireDeck, rng);

  // §7 step 8 (L108): random First Player; Kilns are chosen in reverse turn order.
  const firstPlayerId = playerOrder[rng.nextInt(playerOrder.length)];
  invariant(firstPlayerId !== undefined, "The First Player is seated");
  draft.firstPlayerId = firstPlayerId;
  const start = playerOrder.indexOf(firstPlayerId);
  const turn = playerOrder.map((_, offset) => playerOrder[(start + offset) % playerOrder.length] as PlayerId);
  draft.phase = { type: "setup_kiln_selection", selectionOrder: [...turn].reverse(), index: 0 };

  invariant(KILN_IDS.length >= playerCount, "There is a Kiln for every player (R1)");
  // `SELECT_KILN.mainOrder` names exactly 1 face-up Main Order (rev. 4 L122).
  invariant(GAME_CONFIG.setupFaceUpMainOrders === 1, "Each player takes exactly 1 face-up Main Order at Setup step 9");
  return {
    ok: true,
    state: draft,
    events: [{ type: "GAME_CREATED", playerOrder: [...playerOrder], firstPlayerId, playerCount }, ...events],
  };
}

// ── SELECT_KILN ──────────────────────────────────────────────────────────────────────

export const handlers: Pick<ActionHandlerTable, "SELECT_KILN"> = {
  SELECT_KILN: {
    phases: ["setup_kiln_selection"],
    /**
     * Any Kiln not yet chosen, all five included (R1), and the face-up Main Order the command
     * names: `display[slotIndex]` must still be that Order (rev. 4 L122). The display is full
     * at every choice (it is refilled after each take), so a take is always possible.
     */
    validate(view, action) {
      if (!availableKilns(view.game).includes(action.kilnId)) {
        return ruleError("KILN_UNAVAILABLE", "That Kiln has already been chosen.", { kilnId: action.kilnId });
      }
      const { slotIndex, orderId } = action.mainOrder;
      if (view.game.market.display[slotIndex] !== orderId) {
        return ruleError("ORDER_NOT_AVAILABLE", "That Main Order is no longer on the display.", {
          orderId,
          slotIndex,
          field: "mainOrder",
        });
      }
      return null;
    },
    /**
     * One reverse-order turn (rev. 4 L122, R23): takes the Kiln Player Board (its second
     * personal spaces are already under Cover tokens), then the named face-up Main Order into
     * the hand (public: `ORDER_RESERVED`, via `setup`), then refills the display to 6 at once
     * (slide left, reveal into the rightmost position, as rev. 4 L386; `DISPLAY_REFILLED`,
     * cause `setup`). After the last choice the phase becomes the Start of Round (no decision
     * yet) and `setup_done` hands over to `round.startRound`.
     */
    resolve(draft, actorId, action, ctx) {
      const phase = phaseAs(draft, "setup_kiln_selection");
      invariant(phase.selectionOrder[phase.index] === actorId, `${actorId} is not choosing a Kiln now`);
      player(draft, actorId).kilnId = action.kilnId;
      emit(ctx, { type: "KILN_SELECTED", playerId: actorId, kilnId: action.kilnId });
      const { slotIndex } = action.mainOrder;
      const orderId = takeFaceUpOrder(draft, actorId, slotIndex);
      invariant(orderId === action.mainOrder.orderId, `Display position ${slotIndex} does not hold ${action.mainOrder.orderId}`);
      addToHand(draft, actorId, orderId);
      emit(ctx, { type: "ORDER_RESERVED", playerId: actorId, via: "setup", source: "face_up", slotIndex, orderId });
      refillMainDisplay(draft, "setup", ctx);
      if (phase.index + 1 < phase.selectionOrder.length) {
        phase.index += 1;
        return;
      }
      draft.phase = { type: "round_start_setters_mark", queue: { actorIds: [], index: 0 } };
      ctx.flow.continueAfter("setup_done", draft, ctx);
    },
  },
};
