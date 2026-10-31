/**
 * Setup and the Kiln and Main Order choice (P2 `setup.ts`; owner revision 4, change 32, rev. 4
 * L122–134, R1, R23), DESIGN §7 setup draw order (as revised by ENGINE_V1.6.2_DELTA.md §15.9.1),
 * §8.2 "Setup for 2/3/4", "2 Clay / 3 Wood / 3 Coins; 1 Shifu + 3 Apprentices" (changes 34, 35:
 * the same for every seat), "secret deal of 2 Starting Orders", "6-card Main display; 2 face-up
 * Techs per discipline", and the public face-up Main Order each player takes with its Kiln.
 */

import { describe, expect, it } from "vitest";
import {
  DISCIPLINES,
  FIRING,
  GAME_CONFIG,
  KILN_IDS,
  KILN_SPACE_IDS,
  MAIN_ORDER_IDS,
  SHAPES,
  STARTING_ORDER_IDS,
  isStartingOrderId,
  techsOfDiscipline,
  zoneOf,
} from "../../../src/game/content.ts";
import { parseCommand } from "../../../src/game/actionGuard.ts";
import { createGame, validateAction } from "../../../src/game/engine.ts";
import { availableKilns } from "../../../src/game/kilns.ts";
import { centralCapacity } from "../../../src/game/placement.ts";
import { SeededRandom, shuffle } from "../../../src/game/rng.ts";
import { createInitialState } from "../../../src/game/setup.ts";
import { setupChoiceOptions } from "../../../src/game/selectors.ts";
import { decisionPrompt, turnOrder } from "../../../src/game/state.ts";
import type {
  CreateGameInput,
  FireModifier,
  GameAction,
  GameEvent,
  GameState,
  KilnId,
  OrderId,
  PlayerCount,
  PlayerId,
} from "../../../src/game/types.ts";
import { actorViewOf } from "../../../src/game/view.ts";
import { cardZones } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

const COUNTS: PlayerCount[] = [2, 3, 4];

function input(n: number, gameId = "g-setup"): CreateGameInput {
  return { gameId, players: Array.from({ length: n }, (_, seat) => ({ id: `p${seat + 1}`, displayName: `Player ${seat + 1}` })) };
}

function created(seed: number, n: number): { state: GameState; events: GameEvent[]; rng: SeededRandom } {
  const rng = new SeededRandom(seed);
  const result = createInitialState(input(n), rng);
  if (!result.ok) throw new Error(result.error.message);
  return { state: result.state, events: result.events, rng };
}

/** `SELECT_KILN` with the face-up Main Order at `slotIndex` (L130, R23). */
function choose(state: GameState, kilnId: KilnId, slotIndex = 0): GameAction {
  const orderId = state.market.display[slotIndex];
  if (orderId === null || orderId === undefined) throw new Error(`no Order at ${slotIndex}`);
  return { type: "SELECT_KILN", kilnId, mainOrder: { slotIndex, orderId } };
}

function countBy<T extends string | number>(items: readonly T[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

describe("createInitialState for 2, 3 and 4 players (L120–134)", () => {
  it.each(COUNTS)("%i players: versions, round, phase and empty boards", (n) => {
    const { state } = created(11, n);
    expect(state.schemaVersion).toBe(10);
    expect(state.rulesVersion).toBe("1.6.2");
    expect(state.gameId).toBe("g-setup");
    expect(state.playerCount).toBe(n);
    expect(state.playerOrder).toEqual(Array.from({ length: n }, (_, seat) => `p${seat + 1}`));
    expect(state.round).toBe(1);
    expect(state.revision).toBe(0);
    expect(state.phase.type).toBe("setup_kiln_selection");
    expect(state.kilnDie).toBeNull();
    expect(state.firing).toBeNull();
    expect(state.lastFiring).toBeNull();
    expect(state.finalResult).toBeNull();
    expect(state.ceramics).toEqual({});
    expect(state.nextCeramicSequence).toBe(1);
    expect(state.nextProxySequence).toBe(1);
    expect(state.placementSequence).toBe(0);
    expect(state.market.refillPendingFor).toBeNull();
    expect(state.hidden.pendingLook).toBeNull();
    expect(state.hidden.firePeeks).toEqual({});
  });

  it.each([
    [2, { high: 2, middle: 1, low: 1 }, 1],
    [3, { high: 2, middle: 2, low: 2 }, 1],
    [4, { high: 3, middle: 3, low: 2 }, 2],
  ] as const)("%i players: Shared Kiln %o and Magistrate's Hall capacity %i (L122)", (n, zones, hall) => {
    const { state } = created(3, n);
    const active = KILN_SPACE_IDS.filter((id) => state.sharedKiln.spaces[id].active);
    expect(active).toHaveLength(2 * n);
    expect(Object.fromEntries(countBy(active.map(zoneOf)))).toEqual(zones);
    for (const id of KILN_SPACE_IDS) {
      expect(state.sharedKiln.spaces[id]).toEqual({ active: active.includes(id), ceramicIds: [], setterMarkOwnerId: null, kilnFurniture: null });
    }
    expect(centralCapacity(state, "magistrates_hall")).toBe(hall);
  });

  it.each(COUNTS)("%i players: 2 Clay, 3 Wood, 3 Coins at every seat (no seat Coin); 1 Shifu + 3 Apprentices; Cover tokens; Recognition 0 (L129–134)", (n) => {
    const { state } = created(5, n);
    state.playerOrder.forEach((playerId, seatIndex) => {
      const p = state.players[playerId];
      expect(p).toEqual({
        id: playerId,
        seatIndex,
        displayName: `Player ${seatIndex + 1}`,
        kilnId: null,
        resources: { clay: 2, wood: 3, coins: 3 },
        workers: {
          [`${playerId}:shifu`]: { id: `${playerId}:shifu`, kind: "shifu", placement: null },
          [`${playerId}:apprentice:1`]: { id: `${playerId}:apprentice:1`, kind: "apprentice", placement: null },
          [`${playerId}:apprentice:2`]: { id: `${playerId}:apprentice:2`, kind: "apprentice", placement: null },
          [`${playerId}:apprentice:3`]: { id: `${playerId}:apprentice:3`, kind: "apprentice", placement: null },
        },
        personalSpaces: {
          form_decorate: [{ unlocked: true }, { unlocked: false }],
          glaze_load: [{ unlocked: true }, { unlocked: false }],
        },
        techs: [],
        // Bank, Tend, Stoke (v1.6.2 L289); Fuel Ledger's 2 come only with the tile (change 26).
        contributionCards: ["BANK", "TEND", "STOKE"],
        kilnAbilityUsedThisRound: false,
        imperial: { recognition: 0, grantReceived: false, kilnGained: false, priority: "on_track", audienceReceived: false },
        completedOrders: [],
        score: { orders: 0, kilnAbilities: 0, recognitionOverflow: 0, imperialAudience: 0 },
      });
    });
    expect(GAME_CONFIG.startingResources).toEqual({ clay: 2, wood: 3, coins: 3 });
  });

  it.each(COUNTS)("%i players: a secret hand of 2 Starting Orders each, nothing Main dealt; the rest of the 8-card Starting deck in the box (L123–124, change 32)", (n) => {
    const { state } = created(9, n);
    const dealt: OrderId[] = [];
    for (const playerId of state.playerOrder) {
      const hand = state.hidden.orderHands[playerId] ?? [];
      expect(hand).toHaveLength(2);
      expect(hand.every(isStartingOrderId)).toBe(true);
      dealt.push(...hand);
    }
    expect(new Set(dealt).size).toBe(2 * n);
    // 8 Starting Orders: a 4-player game deals the whole deck and leaves the box empty (L535).
    expect(STARTING_ORDER_IDS).toHaveLength(8);
    expect(state.hidden.startingBox).toHaveLength(8 - 2 * n);
    if (n === 4) expect(state.hidden.startingBox).toEqual([]);
    expect([...state.hidden.startingBox, ...dealt.filter(isStartingOrderId)].sort()).toEqual([...STARTING_ORDER_IDS]);
  });

  it.each(COUNTS)("%i players: a 6-card Main display, the rest in the deck, an empty discard (L124)", (n) => {
    const { state } = created(13, n);
    expect(state.market.display).toHaveLength(6);
    expect(state.market.display.every((id) => id !== null && !isStartingOrderId(id))).toBe(true);
    expect(state.hidden.mainDeck).toHaveLength(48 - 6);
    expect(state.hidden.mainDiscard).toEqual([]);
    const zones = cardZones(state).orders;
    expect(zones).toHaveLength(56);
    expect([...zones].sort()).toEqual([...STARTING_ORDER_IDS, ...MAIN_ORDER_IDS].sort());
  });

  it.each(COUNTS)("%i players: three Tech decks of 6, 2 face up each (L125)", (n) => {
    const { state } = created(17, n);
    for (const discipline of DISCIPLINES) {
      expect(state.techDisplay[discipline]).toHaveLength(GAME_CONFIG.techs.faceUpPerDiscipline);
      expect(state.hidden.techDecks[discipline]).toHaveLength(4);
      expect([...state.techDisplay[discipline], ...state.hidden.techDecks[discipline]].sort()).toEqual([...techsOfDiscipline(discipline)].sort());
    }
  });

  it.each(COUNTS)("%i players: a shuffled 1/3/4/3/1 Fire deck, an empty open discard and 10 Vessel cards per Shape (L126–127)", (n) => {
    const { state } = created(19, n);
    expect(state.hidden.fireDeck).toHaveLength(12);
    expect(Object.fromEntries(countBy<FireModifier>(state.hidden.fireDeck))).toEqual({ "-2": 1, "-1": 3, "0": 4, "1": 3, "2": 1 });
    expect(state.fireDiscard).toEqual([]);
    for (const shape of SHAPES) {
      expect(state.vesselSupply[shape]).toEqual(Array.from({ length: 10 }, (_, index) => `${shape}-${String(index + 1).padStart(2, "0")}`));
    }
  });

  it("is JSON-safe: a JSON round trip changes nothing", () => {
    const { state, events } = created(23, 4);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(JSON.parse(JSON.stringify(events))).toEqual(events);
  });
});

describe("setup draw order (DESIGN §7)", () => {
  it.each(COUNTS)("%i players: Starting, Main, deal, box, reveal 6 (no reshuffle), Techs, Fire, First Player", (n) => {
    const seed = 101 + n;
    const { state, rng } = created(seed, n);
    const replay = new SeededRandom(seed);
    const starting = shuffle(STARTING_ORDER_IDS, replay);
    const main = shuffle(MAIN_ORDER_IDS, replay);
    const players = state.playerOrder;
    players.forEach((playerId, seat) => {
      expect(state.hidden.orderHands[playerId]).toEqual([starting[2 * seat], starting[2 * seat + 1]]);
    });
    expect(state.hidden.startingBox).toEqual(starting.slice(2 * n));
    // Nothing Main was dealt, so the display is the top 6 of the Main deck as shuffled (L124).
    expect(state.market.display).toEqual(main.slice(0, 6));
    expect(state.hidden.mainDeck).toEqual(main.slice(6));
    for (const discipline of DISCIPLINES) {
      const deck = shuffle(techsOfDiscipline(discipline), replay);
      expect(state.techDisplay[discipline]).toEqual(deck.slice(0, 2));
      expect(state.hidden.techDecks[discipline]).toEqual(deck.slice(2));
    }
    expect(state.hidden.fireDeck).toEqual(shuffle(FIRING.fireDeck, replay));
    expect(state.firstPlayerId).toBe(players[replay.nextInt(n)]);
    expect(rng.getState()).toBe(replay.getState());
  });

  it("the same seed gives the same game; seeds vary hands, displays and the First Player", () => {
    expect(created(42, 3)).toEqual(created(42, 3));
    const firsts = new Set<PlayerId>();
    const displays = new Set<string>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const { state } = created(seed, 3);
      firsts.add(state.firstPlayerId);
      displays.add(JSON.stringify(state.market.display));
    }
    expect([...firsts].sort()).toEqual(["p1", "p2", "p3"]);
    expect(displays.size).toBe(40);
  });
});

describe("creation events (DESIGN §4.4, §4.6)", () => {
  it("GAME_CREATED, ORDERS_DEALT per seat with the Starting Orders under secret, then the setup displays", () => {
    const { state, events } = created(31, 3);
    expect(events.map((event) => event.type)).toEqual([
      "GAME_CREATED",
      "ORDERS_DEALT",
      "ORDERS_DEALT",
      "ORDERS_DEALT",
      "DISPLAY_REFILLED",
      "TECH_DISPLAY_REFILLED",
      "TECH_DISPLAY_REFILLED",
      "TECH_DISPLAY_REFILLED",
    ]);
    expect(events[0]).toEqual({ type: "GAME_CREATED", playerOrder: ["p1", "p2", "p3"], firstPlayerId: state.firstPlayerId, playerCount: 3 });
    state.playerOrder.forEach((playerId, seat) => {
      const hand = state.hidden.orderHands[playerId] ?? [];
      expect(events[1 + seat]).toEqual({
        type: "ORDERS_DEALT",
        playerId,
        startingCount: 2,
        secret: { visibleTo: playerId, startingOrderIds: hand },
      });
    });
    expect(events[4]).toEqual({ type: "DISPLAY_REFILLED", cause: "setup", revealedOrderIds: state.market.display, display: state.market.display });
    DISCIPLINES.forEach((discipline, index) => {
      expect(events[5 + index]).toEqual({
        type: "TECH_DISPLAY_REFILLED",
        discipline,
        revealedTechIds: state.techDisplay[discipline],
        display: state.techDisplay[discipline],
      });
    });
  });

  it("createGame persists the creation events: eventSequence equals their count", () => {
    const result = createGame(input(2), new SeededRandom(8), { checkInvariants: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.eventSequence).toBe(result.events.length);
    expect(result.events).toHaveLength(1 + 2 + 1 + 3);
  });
});

describe("invalid setups (INVALID_SETUP)", () => {
  it.each([1, 5])("%i players is rejected without drawing randomness", (n) => {
    const rng = new SeededRandom(1);
    const before = rng.getState();
    const result = createInitialState(input(n), rng);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_SETUP");
    expect(result.error.details).toEqual({ playerCount: n, minPlayers: 2, maxPlayers: 4 });
    expectDocumentedDetails(result.error);
    expect(rng.getState()).toBe(before);
  });

  it.each([
    ["an empty game ID", { gameId: " ", players: input(2).players }, { field: "gameId" }],
    ["duplicate player IDs", { gameId: "g", players: [{ id: "a", displayName: "A" }, { id: "a", displayName: "B" }] }, { field: "id", seatIndex: 1 }],
    ["an empty player ID", { gameId: "g", players: [{ id: "a", displayName: "A" }, { id: "", displayName: "B" }] }, { field: "id", seatIndex: 1 }],
    ["a reserved object key as player ID", { gameId: "g", players: [{ id: "__proto__", displayName: "A" }, { id: "b", displayName: "B" }] }, { field: "id", seatIndex: 0 }],
    ["an empty display name", { gameId: "g", players: [{ id: "a", displayName: "A" }, { id: "b", displayName: "  " }] }, { field: "displayName", seatIndex: 1 }],
  ] as const)("%s is rejected", (_label, bad, details) => {
    const result = createInitialState(bad as CreateGameInput, new SeededRandom(1));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_SETUP");
    expect(result.error.details).toEqual(details);
    expectDocumentedDetails(result.error);
  });
});

describe("Setup step 9: a Kiln and a face-up Main Order in one reverse-order turn (L130, R1, R23)", () => {
  it.each(COUNTS)("%i players choose in reverse turn order: the First Player chooses last", (n) => {
    for (let seed = 1; seed <= 6; seed += 1) {
      const { state } = created(seed, n);
      const order = turnOrder(state);
      expect(order[0]).toBe(state.firstPlayerId);
      expect(state.phase).toEqual({ type: "setup_kiln_selection", selectionOrder: [...order].reverse(), index: 0 });
      expect(decisionPrompt(state)).toEqual({ phaseType: "setup_kiln_selection", actorIds: [order[n - 1]], mode: "single" });
    }
  });

  it("offers all five Kilns, Ding included, and removes each one chosen", () => {
    const { state } = created(2, 4);
    expect(availableKilns(state)).toEqual(["RU", "GU", "GE", "DI", "JU"]);
    const table = new LocalTable(state, { flow: "halt" });
    const picks: KilnId[] = ["DI", "JU", "RU", "GE"];
    const selectionOrder = state.phase.type === "setup_kiln_selection" ? state.phase.selectionOrder : [];
    selectionOrder.forEach((playerId, index) => {
      const pick = picks[index] as KilnId;
      expect(availableKilns(table.state)).toContain(pick);
      const events = table.act(playerId, choose(table.state, pick));
      expect(events[0]).toEqual({ type: "KILN_SELECTED", playerId, kilnId: pick });
      expect(table.player(playerId).kilnId).toBe(pick);
      expect(availableKilns(table.state)).not.toContain(pick);
    });
    expect(availableKilns(table.state)).toEqual(["GU"]);
  });

  it("rejects a Kiln already chosen (KILN_UNAVAILABLE) and choices out of turn (NOT_YOUR_DECISION)", () => {
    const { state } = created(4, 3);
    const table = new LocalTable(state, { flow: "halt" });
    const [first, second, third] = state.phase.type === "setup_kiln_selection" ? state.phase.selectionOrder : [];
    table.expectRuleError(second as PlayerId, choose(table.state, "RU"), "NOT_YOUR_DECISION");
    table.act(first as PlayerId, choose(table.state, "GE"));
    const error = table.expectRuleError(second as PlayerId, choose(table.state, "GE"), "KILN_UNAVAILABLE");
    expect(error.details).toEqual({ kilnId: "GE" });
    expectDocumentedDetails(error);
    table.expectRuleError(third as PlayerId, choose(table.state, "DI"), "NOT_YOUR_DECISION");
    expect(validateAction(actorViewOf(table.state, second as PlayerId), choose(table.state, "DI"))).toBeNull();
  });

  it("the last choice hands over setup_done; the Lock tokens stay; Start of Round has not run yet", () => {
    const table = LocalTable.newGame(6, 2, { flow: "halt" });
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "setup_done" }]);
    expect(table.state.phase).toEqual({ type: "round_start_setters_mark", queue: { actorIds: [], index: 0 } });
    expect(table.state.round).toBe(1);
    expect(table.state.kilnDie).toBeNull();
    for (const playerId of table.state.playerOrder) {
      expect(KILN_IDS).toContain(table.player(playerId).kilnId);
      expect(table.player(playerId).personalSpaces.form_decorate[1].unlocked).toBe(false);
      expect(table.player(playerId).personalSpaces.glaze_load[1].unlocked).toBe(false);
    }
    expect(table.events.filter((event) => event.type === "KILN_SELECTED")).toHaveLength(2);
    table.expectRuleError(table.state.firstPlayerId, choose(table.state, "JU"), "WRONG_PHASE");
  });

  it("takes the named face-up Main Order into the hand, publicly, and refills the display before the next choice (slide left)", () => {
    const { state } = created(14, 3);
    const table = new LocalTable(state, { flow: "halt" });
    const order = state.phase.type === "setup_kiln_selection" ? state.phase.selectionOrder : [];
    const chooser = order[0] as PlayerId;
    const before = [...table.state.market.display];
    const deckTop = table.state.hidden.mainDeck[0];
    const taken = before[2] as OrderId;
    expect(setupChoiceOptions(table.view(chooser))).toEqual({
      kilns: expect.arrayContaining([expect.objectContaining({ kilnId: "RU", available: true })]),
      faceUpSlots: [0, 1, 2, 3, 4, 5],
    });
    expect(setupChoiceOptions(table.view(order[1] as PlayerId))).toBeNull();
    const events = table.act(chooser, choose(table.state, "RU", 2));
    expect(events).toEqual([
      { type: "KILN_SELECTED", playerId: chooser, kilnId: "RU" },
      { type: "ORDER_RESERVED", playerId: chooser, via: "setup", source: "face_up", slotIndex: 2, orderId: taken },
      {
        type: "DISPLAY_REFILLED",
        cause: "setup",
        revealedOrderIds: [deckTop],
        display: [before[0], before[1], before[3], before[4], before[5], deckTop],
      },
    ]);
    // Public: everyone has seen which Main Order the player took (L130); no secret.
    for (const event of events) expect("secret" in event).toBe(false);
    expect(table.state.hidden.orderHands[chooser]?.slice(-1)).toEqual([taken]);
    expect(table.state.hidden.orderHands[chooser]).toHaveLength(3);
    expect(table.state.market.refillPendingFor).toBeNull();
    expect(table.state.market.display.every((orderId) => orderId !== null)).toBe(true);
    expect(table.state.hidden.mainDeck).toHaveLength(48 - 6 - 1);
  });

  it.each(COUNTS)("%i players: everyone ends with 2 Starting Orders and 1 Main Order, the display full", (n) => {
    const table = LocalTable.newGame(20 + n, n, { flow: "halt", mainOrderSlots: { p1: 5, p2: 3 } });
    for (const playerId of table.state.playerOrder) {
      const hand = table.state.hidden.orderHands[playerId] ?? [];
      expect(hand.filter(isStartingOrderId)).toHaveLength(2);
      expect(hand.filter((orderId) => !isStartingOrderId(orderId))).toHaveLength(1);
    }
    expect(table.state.market.display.every((orderId) => orderId !== null)).toBe(true);
    expect(table.state.hidden.mainDeck).toHaveLength(48 - 6 - n);
    expect(table.events.filter((event) => event.type === "ORDER_RESERVED" && event.via === "setup")).toHaveLength(n);
  });

  it("refuses a stale face-up pick (ORDER_NOT_AVAILABLE) and a choice without a Main Order (MALFORMED_ACTION)", () => {
    const { state } = created(15, 2);
    const table = new LocalTable(state, { flow: "halt" });
    const chooser = (state.phase.type === "setup_kiln_selection" ? state.phase.selectionOrder[0] : "p1") as PlayerId;
    const wrong = table.state.market.display[1] as OrderId;
    const error = table.expectRuleError(chooser, { type: "SELECT_KILN", kilnId: "GU", mainOrder: { slotIndex: 0, orderId: wrong } }, "ORDER_NOT_AVAILABLE");
    expectDocumentedDetails(error);
    expect(error.details).toMatchObject({ slotIndex: 0, orderId: wrong, field: "mainOrder" });
    table.expectRuleError(chooser, { type: "SELECT_KILN", kilnId: "GU", mainOrder: { slotIndex: 6, orderId: wrong } }, "ORDER_NOT_AVAILABLE");
    expect(parseCommand({ type: "SELECT_KILN", kilnId: "GU" })).toMatchObject({ code: "MALFORMED_ACTION", details: { field: "mainOrder" } });
    expect(parseCommand({ type: "SELECT_KILN", kilnId: "GU", mainOrder: { slotIndex: 0, orderId: wrong, extra: 1 } })).toMatchObject({
      code: "MALFORMED_ACTION",
      details: { field: "mainOrder.extra" },
    });
    expect(parseCommand({ type: "SELECT_KILN", kilnId: "GU", mainOrder: { slotIndex: -1, orderId: wrong } })).toMatchObject({ code: "MALFORMED_ACTION" });
  });

  it("then Round 1 starts with a public Kiln Die roll after the last Kiln and Main Order choice (INT)", () => {
    const table = LocalTable.newGame(6, 3, { flow: "halt", pass: ["setup_done"] });
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "round_start_done" }]);
    const types = table.events.map((event) => event.type);
    const lastPick = types.lastIndexOf("KILN_SELECTED");
    expect(types.slice(lastPick + 1)).toEqual(["ORDER_RESERVED", "DISPLAY_REFILLED", "ROUND_STARTED", "KILN_DIE_ROLLED", "ABILITIES_READIED"]);
    expect(table.state.kilnDie?.round).toBe(1);
    expect(FIRING.kilnDie.faces).toContain(table.state.kilnDie?.value);
  });
});
