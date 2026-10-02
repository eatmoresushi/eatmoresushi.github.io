import { describe, expect, it } from "vitest";
import { AVAILABLE_KILN_IDS, MAIN_ORDERS, ORDER_DEFINITIONS, STARTING_ORDERS, STARTING_TECHNIQUES, applyAction, currentDecisionActor } from "../../src/game/index.ts";
import type { GameAction, StartingTechniqueId } from "../../src/game/index.ts";
import { fallbackComputerCommands } from "../../src/multiplayer/computerFallback.ts";
import { createComputerObservation } from "../../src/multiplayer/computerObservation.ts";
import { chooseOnlineComputerAction, ONLINE_COMPUTER_POLICY_VERSION } from "../../src/multiplayer/computerPlayer.ts";
import type { StoredSeat } from "../../src/multiplayer/types.ts";
import { addFinished, addWorkshop, createdGame, expectError, mustApply, mustResult, startedGame, workerId } from "../v127/helpers.ts";

function startingTechSetup() {
  const fixture = createdGame(4, 30_900);
  let state = fixture.state;
  let kilnIndex = 0;
  while (state.phase.type === "setup_kiln_selection") {
    state = mustApply(state, currentDecisionActor(state.phase)!, { type: "SELECT_KILN", kilnId: AVAILABLE_KILN_IDS[kilnIndex++]! }, fixture.rng);
  }
  return { state, rng: fixture.rng };
}

describe("September 2026 economy amendment", () => {
  it("reduces every Commercial Main Order by exactly one Coin and preserves every Crown Order payout", () => {
    const commercialBefore = {
      O01: 3, O02: 3, O03: 3, O04: 4, O05: 4, O06: 3, O07: 3, O08: 3,
      O09: 3, O10: 4, O11: 4, O12: 4, O13: 4, O14: 3, O15: 4, O16: 2,
      O25: 5, O26: 5, O27: 5, O28: 5, O29: 5, O30: 5, O31: 5, O32: 5,
      O33: 4, O34: 6, O43: 6, O44: 5,
    };
    const crownCoins = {
      O17: 2, O18: 2, O19: 2, O20: 2, O21: 1, O22: 1, O23: 1, O24: 1,
      O35: 2, O36: 3, O37: 3, O38: 2, O39: 1, O40: 1, O41: 1, O42: 1,
      O45: 2, O46: 3, O47: 0, O48: 1,
    };
    expect(MAIN_ORDERS.filter(({ crowns }) => crowns === 0).map(({ id }) => id)).toEqual(Object.keys(commercialBefore));
    expect(MAIN_ORDERS.filter(({ crowns }) => crowns > 0).map(({ id }) => id)).toEqual(Object.keys(crownCoins));
    for (const [id, previous] of Object.entries(commercialBefore)) {
      expect(ORDER_DEFINITIONS[id]?.coins, id).toBe(previous - 1);
      expect(ORDER_DEFINITIONS[id]?.coins, id).toBeGreaterThanOrEqual(1);
    }
    for (const [id, coins] of Object.entries(crownCoins)) expect(ORDER_DEFINITIONS[id]?.coins, id).toBe(coins);
    expect(STARTING_ORDERS).toHaveLength(8);
    for (const order of STARTING_ORDERS) expect(order.coins, order.id).toBe(3);
  });

  it.each([
    { orderId: "S01", shape: "bowl", glaze: "white", decoration: "plain", coins: 3 },
    { orderId: "O16", shape: "bowl", glaze: "white", decoration: "plain", coins: 1 },
    { orderId: "O17", shape: "washer", glaze: "white", decoration: "painted", coins: 2 },
  ] as const)("actually pays $coins Coins on completing $orderId", ({ orderId, shape, glaze, decoration, coins }) => {
    const { state, rng } = startedGame(2);
    const player = state.players["P1"]!;
    player.kilnId = "GE";
    player.imperialRecognition = 1;
    player.orderHand = [orderId];
    const piece = addFinished(state, "P1", shape, "masterpiece", glaze, decoration);
    // Keep a second player eligible so completion does not automatically clean up the round.
    state.players["P2"]!.orderHand = ["S02"];
    addFinished(state, "P2", "plate", "standard");
    state.phase = { type: "orders", turnOrder: ["P1", "P2"], currentIndex: 0, activePlayerId: "P1", completedInCircuit: 0 };
    const result = mustResult(state, "P1", { type: "COMPLETE_ORDER", orderId, ceramicIds: [piece.id] }, rng);
    expect(result.state.players["P1"]!.resources.coins).toBe(player.resources.coins + coins);
    expect(result.state.players["P1"]!.completedOrders.at(-1)).toMatchObject({ orderId, coinsAwarded: coins });
  });

  it.each(["ST04", "unknown", "__proto__"])("rejects removed or forged Starting Tech %s without advancing setup", (techniqueId) => {
    const { state, rng } = startingTechSetup();
    const before = structuredClone(state);
    expectError(applyAction(state, currentDecisionActor(state.phase)!, {
      type: "SELECT_STARTING_TECH", techniqueId,
    } as unknown as GameAction, rng), "INVALID_SELECTION");
    expect(state).toEqual(before);
  });

  it("allows all four players to share the remaining three Starting Tech choices", () => {
    const fixture = startingTechSetup();
    let state = fixture.state;
    expect(STARTING_TECHNIQUES.map(({ id }) => id)).toEqual(["ST01", "ST02", "ST03"]);
    const chosen = ["ST01", "ST02", "ST03", "ST01"] as const;
    for (const techniqueId of chosen) {
      state = mustApply(state, currentDecisionActor(state.phase)!, { type: "SELECT_STARTING_TECH", techniqueId }, fixture.rng);
    }
    expect(state.phase.type).toBe("work");
    expect(Object.values(state.players).map(({ startingTechniqueId }) => startingTechniqueId).sort()).toEqual([...chosen].sort());
  });

  it.each([
    { kilnTendingClay: 1 }, { kilnTendingWood: 1 },
    { kilnTendingClay: 0, kilnTendingWood: 0 }, { kilnTendingClay: -1 },
  ])("rejects legacy Kiln Tending fields %j atomically", (legacyFields) => {
    const { state, rng } = startedGame(2);
    const piece = addWorkshop(state, "P1");
    const before = structuredClone(state);
    expectError(applyAction(state, "P1", {
      type: "USE_KILN_YARD", workerId: workerId(state, "P1", "apprentice"),
      loads: [{ ceramicId: piece.id, kilnSpaceId: "high_1", glaze: "white" }], ...legacyFields,
    }, rng), "INVALID_ACTION");
    expect(state).toEqual(before);
  });

  it.each(["ST01", "ST02", "ST03", "ST04"])("loading gives no Clay or Wood even if the stored Starting Tech is %s", (techniqueId) => {
    const { state, rng } = startedGame(2);
    // Include a stale pre-amendment ID to prove it cannot revive the removed income rule.
    state.players["P1"]!.startingTechniqueId = techniqueId as StartingTechniqueId;
    const resources = { ...state.players["P1"]!.resources };
    const piece = addWorkshop(state, "P1");
    const result = mustResult(state, "P1", {
      type: "USE_KILN_YARD", workerId: workerId(state, "P1", "apprentice"),
      loads: [{ ceramicId: piece.id, kilnSpaceId: "high_1", glaze: "white" }],
    }, rng);
    expect(result.state.players["P1"]!.resources).toEqual({ ...resources, coins: resources.coins - 1 });
    expect(result.events.some(({ type }) => type === "STARTING_TECH_USED")).toBe(false);
  });

  it("retains the Shifu's one-Clay discount when forming two vessels", () => {
    const { state, rng } = startedGame(2);
    const next = mustApply(state, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", "shifu"), shapes: ["bowl", "plate"],
    }, rng);
    expect(Object.values(next.ceramics)).toHaveLength(2);
    expect(next.players["P1"]!.resources).toEqual({ clay: 1, wood: 2, coins: 3 });
  });

  it("keeps strategic and fallback computer setup choices inside the three-tech roster", async () => {
    const { state } = startingTechSetup();
    const playerId = currentDecisionActor(state.phase)!;
    const seat: StoredSeat = {
      roomId: "test-room", seatId: "test-seat", playerId, seatIndex: 0, displayName: "Computer",
      colour: "red", isHost: false, isComputer: true, authUserId: null,
      aiPolicyVersion: ONLINE_COMPUTER_POLICY_VERSION, aiSeed: 900, aiCreatedCommandId: null,
    };
    const observation = createComputerObservation(state, playerId);
    expect(fallbackComputerCommands(observation)).toEqual(STARTING_TECHNIQUES.map(({ id }) => ({ type: "SELECT_STARTING_TECH", techniqueId: id })));
    const command = await chooseOnlineComputerAction(observation, seat);
    expect(command.type).toBe("SELECT_STARTING_TECH");
    if (command.type !== "SELECT_STARTING_TECH") throw new Error("Expected computer Starting Tech selection");
    expect(STARTING_TECHNIQUES.map(({ id }) => id)).toContain(command.techniqueId);
  });
});
