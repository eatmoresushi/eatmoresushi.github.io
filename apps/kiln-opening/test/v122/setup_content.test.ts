import { describe, expect, it } from "vitest";
import {
  FIRE_CARDS,
  GAME_CONFIG,
  KILN_IDS,
  LOCATION_IDS,
  MAIN_ORDERS,
  STARTING_ORDERS,
  STARTING_TECHNIQUES,
  TECHNIQUES,
  activeKilnSpaceIds,
  applyAction,
  currentDecisionActor,
  locationCapacity,
  turnOrderFromFirst,
} from "../../src/game/index.ts";
import { createdGame, mustApply, mustResult, startedGame } from "./helpers.ts";

describe("V1.2.2 setup and authoritative content", () => {
  it.each([2, 3, 4] as const)("creates the exact %i-player setup", (playerCount) => {
    const { state } = createdGame(playerCount, 1200 + playerCount);

    expect(state.rulesVersion).toBe("1.2.2");
    expect(state.schemaVersion).toBe(2);
    expect(state.round).toBe(1);
    expect(state.marketDisplay).toHaveLength(5);
    expect(state.marketDeck).toHaveLength(43);
    expect(state.startingOrderDeck).toHaveLength(16);
    expect(state.returnedStartingOrderIds).toEqual([]);
    expect(state.phase.type).toBe("setup_kiln_selection");
    if (state.phase.type !== "setup_kiln_selection") return;
    expect(state.phase.selectionOrder).toEqual([...turnOrderFromFirst(state)].reverse());

    for (const player of Object.values(state.players)) {
      expect(Object.values(player.workers)).toHaveLength(4);
      expect(Object.values(player.workers).filter(({ kind }) => kind === "shifu")).toHaveLength(1);
      expect(Object.values(player.workers).filter(({ kind }) => kind === "apprentice")).toHaveLength(3);
      expect(Object.values(player.workers).every(({ status }) => status === "available")).toBe(true);
      expect(player.workshopSpaces).toEqual({ pottersWheelUnlocked: 1, glazeDecorationUnlocked: 1 });
      expect(player.imperialRecognition).toBe(0);
      expect(player.imperialKilnUnlocked).toBe(false);
      expect(player.imperialPriorityAvailable).toBe(false);
    }
  });

  it("deals four private Starting Orders, keeps exactly two, then allows shared Starting Tech choices", () => {
    const { state: created, rng } = createdGame(3, 1221);
    let state = created;
    let kilnIndex = 0;
    while (state.phase.type === "setup_kiln_selection") {
      const actor = currentDecisionActor(state.phase)!;
      state = mustApply(state, actor, { type: "SELECT_KILN", kilnId: KILN_IDS[kilnIndex]! }, rng);
      kilnIndex += 1;
    }
    expect(state.phase.type).toBe("setup_starting_orders");
    if (state.phase.type !== "setup_starting_orders") return;
    const allOffers = Object.values(state.phase.offeredOrderIds).flat();
    expect(allOffers).toHaveLength(12);
    expect(new Set(allOffers).size).toBe(12);
    expect(allOffers.every((id) => id.startsWith("S"))).toBe(true);

    while (state.phase.type === "setup_starting_orders") {
      const actor = currentDecisionActor(state.phase)!;
      const offer = state.phase.offeredOrderIds[actor]!;
      const invalid = applyAction(state, actor, { type: "SUBMIT_STARTING_ORDERS", orderIds: offer.slice(0, 1) }, rng);
      expect(invalid.ok).toBe(false);
      state = mustApply(state, actor, { type: "SUBMIT_STARTING_ORDERS", orderIds: offer.slice(1, 3) }, rng);
    }
    expect(state.phase.type).toBe("setup_starting_tech");
    for (const player of Object.values(state.players)) expect(player.orderHand).toHaveLength(2);

    while (state.phase.type === "setup_starting_tech") {
      const actor = currentDecisionActor(state.phase)!;
      state = mustApply(state, actor, { type: "SELECT_STARTING_TECH", techniqueId: "ST01" }, rng);
    }
    expect(state.phase.type).toBe("work");
    expect(Object.values(state.players).every(({ startingTechniqueId }) => startingTechniqueId === "ST01")).toBe(true);
  });

  it("contains exactly the V1.2.2 decks, spaces, locations, and bilingual records", () => {
    expect(STARTING_ORDERS.map(({ id }) => id)).toEqual(Array.from({ length: 16 }, (_, i) => `S${String(i + 1).padStart(2, "0")}`));
    expect(MAIN_ORDERS.map(({ id }) => id)).toEqual(Array.from({ length: 48 }, (_, i) => `O${String(i + 1).padStart(2, "0")}`));
    expect(STARTING_TECHNIQUES).toHaveLength(4);
    expect(TECHNIQUES).toHaveLength(15);
    expect(TECHNIQUES.filter(({ discipline }) => discipline === "forming")).toHaveLength(5);
    expect(TECHNIQUES.filter(({ discipline }) => discipline === "glazing")).toHaveLength(5);
    expect(TECHNIQUES.filter(({ discipline }) => discipline === "firing")).toHaveLength(5);
    expect([...STARTING_ORDERS, ...MAIN_ORDERS].every(({ commission, commissionZh }) => commission.length > 0 && commissionZh.length > 0)).toBe(true);
    expect([...STARTING_TECHNIQUES, ...TECHNIQUES].every(({ name, nameZh, ability, abilityZh }) => name.length > 0 && nameZh.length > 0 && ability.length > 0 && abilityZh.length > 0)).toBe(true);
    expect(LOCATION_IDS).toHaveLength(7);
    expect(LOCATION_IDS).not.toContain("court_patronage");
    expect(activeKilnSpaceIds(2)).toHaveLength(5);
    expect(activeKilnSpaceIds(3)).toHaveLength(6);
    expect(activeKilnSpaceIds(4)).toHaveLength(7);
    expect(FIRE_CARDS).toHaveLength(12);
    expect(Object.fromEntries([-2, -1, 0, 1, 2].map((value) => [value, FIRE_CARDS.filter((card) => card === value).length]))).toEqual({ "-2": 1, "-1": 3, "0": 4, "1": 3, "2": 1 });
  });

  it("uses 2/3/4 capacity for shared contested locations and no cap for Kiln Yard/Labour", () => {
    for (const playerCount of [2, 3, 4] as const) {
      for (const location of ["materials_yard", "market_imperial_office", "guild_academy"] as const) {
        expect(locationCapacity(location, playerCount)).toBe(playerCount);
      }
      expect(locationCapacity("kiln_yard", playerCount)).toBe(Number.POSITIVE_INFINITY);
      expect(locationCapacity("labour", playerCount)).toBe(Number.POSITIVE_INFINITY);
    }
  });

  it("rotates a five-card market by discarding the leftmost three and preserving the remaining two", () => {
    const { state: started, rng } = startedGame(2, 1222);
    let state = structuredClone(started);
    const oldDisplay = [...state.marketDisplay];
    const nextThree = state.marketDeck.slice(0, 3);
    const reverseOrder = [...turnOrderFromFirst(state)].reverse();
    state.phase = { type: "orders", turnOrder: reverseOrder, currentIndex: 0, activePlayerId: reverseOrder[0]!, completedInCircuit: 0 };

    let finalEvents: ReturnType<typeof mustResult>["events"] = [];
    while (state.phase.type === "orders") {
      const result = mustResult(state, state.phase.activePlayerId, { type: "END_ORDER_TURN" }, rng);
      state = result.state;
      finalEvents = result.events;
    }

    expect(state.round).toBe(2);
    expect(state.marketDisplay).toEqual([...oldDisplay.slice(3), ...nextThree]);
    expect(state.marketDisplay).toHaveLength(GAME_CONFIG.orderDisplay.market);
    expect(state.marketDiscard.slice(-3)).toEqual(oldDisplay.slice(0, 3));
    expect(finalEvents).toContainEqual(expect.objectContaining({ type: "ORDER_DISPLAYS_ROTATED", marketOrderIds: oldDisplay.slice(0, 3) }));
  });

  it("finishes a five-card rotation when the Main deck runs out mid-refill", () => {
    const { state: started, rng } = startedGame(2, 1223);
    let state = structuredClone(started);
    const remaining = [...state.marketDeck];
    state.marketDeck = remaining.slice(0, 1);
    state.marketDiscard = remaining.slice(1, 5);
    const reverseOrder = [...turnOrderFromFirst(state)].reverse();
    state.phase = { type: "orders", turnOrder: reverseOrder, currentIndex: 0, activePlayerId: reverseOrder[0]!, completedInCircuit: 0 };

    while (state.phase.type === "orders") {
      state = mustApply(state, state.phase.activePlayerId, { type: "END_ORDER_TURN" }, rng);
    }

    expect(state.round).toBe(2);
    expect(state.marketDisplay).toHaveLength(5);
    expect(state.marketDiscard).toEqual([]);
  });
});
