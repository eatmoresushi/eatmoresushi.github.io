import { describe, expect, it } from "vitest";
import { GAME_CONFIG, turnOrderFromFirst } from "../../src/game/index.ts";
import type { GameState, OrderId } from "../../src/game/index.ts";
import {
  addFinished,
  addTechnique,
  mustApply,
  mustResult,
  setWorkTurn,
  startedGame,
  workerId,
} from "./helpers.ts";

const DISPLAY = ["O01", "O02", "O03", "O04", "O05"] satisfies OrderId[];
const REPLACEMENTS = ["O06", "O07", "O08", "O09", "O10"] satisfies OrderId[];

function setMainOrderQueue(
  state: GameState,
  display: readonly OrderId[] = DISPLAY,
  replacements: readonly OrderId[] = REPLACEMENTS,
): void {
  const fixed = new Set([...display, ...replacements]);
  state.marketDisplay = [...display];
  state.marketDeck = [
    ...replacements,
    ...state.marketDeck.filter((orderId) => !fixed.has(orderId)),
  ];
  state.marketDiscard = [];
}

function beginCommission(state: GameState, kind: "apprentice" | "shifu", rng: Parameters<typeof mustApply>[3]): GameState {
  setWorkTurn(state, "P1");
  return mustApply(state, "P1", {
    type: "BEGIN_OFFICE_ORDERS",
    workerId: workerId(state, "P1", kind),
    mode: kind === "shifu" ? "take_up_to_two" : "take_one",
  }, rng);
}

describe("V1.2.6 ordered Main Order display", () => {
  it.each([
    {
      label: "oldest leftmost card",
      orderId: "O01" as const,
      expected: ["O02", "O03", "O04", "O05", "O06"],
    },
    {
      label: "middle card",
      orderId: "O03" as const,
      expected: ["O01", "O02", "O04", "O05", "O06"],
    },
    {
      label: "newest rightmost card",
      orderId: "O05" as const,
      expected: ["O01", "O02", "O03", "O04", "O06"],
    },
  ])("slides later cards left and appends the replacement after reserving the $label", ({ orderId, expected }) => {
    const { state: initial, rng } = startedGame(2, 15_100);
    let state = structuredClone(initial);
    setMainOrderQueue(state);
    state = beginCommission(state, "apprentice", rng);

    state = mustApply(state, "P1", { type: "OFFICE_TAKE_ORDER", orderId }, rng);

    expect(state.marketDisplay).toEqual(expected);
    expect(state.players["P1"]?.orderHand).toContain(orderId);
  });

  it("resolves both Shifu reservations against the newly updated queue", () => {
    const { state: initial, rng } = startedGame(2, 15_101);
    let state = structuredClone(initial);
    setMainOrderQueue(state);
    state = beginCommission(state, "shifu", rng);

    state = mustApply(state, "P1", { type: "OFFICE_TAKE_ORDER", orderId: "O03" }, rng);
    expect(state.marketDisplay).toEqual(["O01", "O02", "O04", "O05", "O06"]);
    state = mustApply(state, "P1", { type: "COMMISSION_GAIN_ADVANCE", resource: "clay" }, rng);

    // O06 only became selectable after the first reservation appended it.
    state = mustApply(state, "P1", { type: "OFFICE_TAKE_ORDER", orderId: "O06" }, rng);
    expect(state.marketDisplay).toEqual(["O01", "O02", "O04", "O05", "O07"]);
    expect(state.players["P1"]?.orderHand).toEqual(expect.arrayContaining(["O03", "O06"]));
  });

  it("takes the unseen top Main Order without moving or refilling the public display", () => {
    const { state: initial, rng } = startedGame(2, 15_102);
    let state = structuredClone(initial);
    setMainOrderQueue(state);
    const before = [...state.marketDisplay];
    state = beginCommission(state, "apprentice", rng);

    state = mustApply(state, "P1", { type: "OFFICE_TAKE_TOP_ORDER" }, rng);

    expect(state.marketDisplay).toEqual(before);
    expect(state.players["P1"]?.orderHand).toContain("O06");
    expect(state.marketDeck[0]).toBe("O07");
  });

  it("leaves the display unchanged when Colour Samples reserves a privately viewed Order", () => {
    const { state: initial, rng } = startedGame(2, 15_103);
    let state = structuredClone(initial);
    setMainOrderQueue(state);
    addTechnique(state, "P1", "T10");
    const before = [...state.marketDisplay];
    state = beginCommission(state, "apprentice", rng);
    state = mustApply(state, "P1", { type: "OFFICE_USE_COLOUR_SAMPLES", deck: "market" }, rng);
    if (state.phase.type !== "work_office_orders" || state.phase.colourSamplesChoices === undefined) {
      throw new Error("Colour Samples choices disappeared");
    }
    const selected = state.phase.colourSamplesChoices[1];
    if (selected === undefined) throw new Error("Colour Samples did not reveal a second Order");

    state = mustApply(state, "P1", {
      type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER",
      orderId: selected,
    }, rng);

    expect(state.marketDisplay).toEqual(before);
    expect(state.players["P1"]?.orderHand).toContain(selected);
  });

  it("slides and appends when Colour Samples reserves a face-up Order", () => {
    const { state: initial, rng } = startedGame(2, 15_104);
    let state = structuredClone(initial);
    setMainOrderQueue(state);
    addTechnique(state, "P1", "T10");
    state = beginCommission(state, "apprentice", rng);
    state = mustApply(state, "P1", { type: "OFFICE_USE_COLOUR_SAMPLES", deck: "market" }, rng);

    state = mustApply(state, "P1", {
      type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER",
      orderId: "O03",
    }, rng);

    // O06-O08 were viewed privately; O09 is now the top public replacement.
    expect(state.marketDisplay).toEqual(["O01", "O02", "O04", "O05", "O09"]);
    expect(state.players["P1"]?.orderHand).toContain("O03");
  });

  it("uses unchosen Colour Samples cards to refill a face-up reservation after the deck is exhausted", () => {
    const { state: initial, rng } = startedGame(2, 15_106);
    let state = structuredClone(initial);
    state.marketDisplay = [...DISPLAY];
    state.marketDeck = ["O06", "O07", "O08"];
    state.marketDiscard = [];
    addTechnique(state, "P1", "T10");
    state = beginCommission(state, "apprentice", rng);
    state = mustApply(state, "P1", { type: "OFFICE_USE_COLOUR_SAMPLES", deck: "market" }, rng);
    if (state.phase.type !== "work_office_orders" || state.phase.colourSamplesChoices === undefined) {
      throw new Error("Colour Samples choices disappeared");
    }
    const lookedAt = [...state.phase.colourSamplesChoices];
    expect(lookedAt).toEqual(["O06", "O07", "O08"]);
    expect(state.marketDeck).toEqual([]);

    state = mustApply(state, "P1", {
      type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER",
      orderId: "O03",
    }, rng);

    expect(state.marketDisplay.slice(0, 4)).toEqual(["O01", "O02", "O04", "O05"]);
    expect(state.marketDisplay).toHaveLength(5);
    expect(lookedAt).toContain(state.marketDisplay[4]);
    expect(state.marketDiscard).toEqual([]);
    const relevantCards = [
      ...state.marketDisplay,
      ...state.marketDeck,
      ...state.marketDiscard,
      ...state.players["P1"]!.orderHand,
    ].filter((orderId) => [...DISPLAY, ...lookedAt].includes(orderId));
    expect(relevantCards).toHaveLength(8);
    expect(new Set(relevantCards).size).toBe(8);
  });

  it("slides a completed face-up Order and re-prompts a passer for the new rightmost Order", () => {
    const { state: initial, rng } = startedGame(2, 15_105);
    let state = structuredClone(initial);
    state.players["P1"]!.orderHand = [];
    state.players["P2"]!.orderHand = [];
    setMainOrderQueue(
      state,
      ["O02", "O04", "O05", "O46", "O47"],
      ["O01"],
    );
    addFinished(state, "P1", "bowl", "standard");
    const plate = addFinished(state, "P2", "plate", "standard");
    state.phase = {
      type: "orders",
      turnOrder: ["P1", "P2"],
      currentIndex: 0,
      activePlayerId: "P1",
      completedInCircuit: 0,
    };

    state = mustApply(state, "P1", { type: "END_ORDER_TURN" }, rng);
    state = mustApply(state, "P2", {
      type: "COMPLETE_ORDER",
      orderId: "O02",
      ceramicIds: [plate.id],
    }, rng);

    expect(state.marketDisplay).toEqual(["O04", "O05", "O46", "O47", "O01"]);
    expect(state.phase).toEqual(expect.objectContaining({
      type: "orders",
      activePlayerId: "P1",
    }));
  });

  it.each([2, 3, 4, 5] as const)(
    "discards two oldest Orders and appends two new Orders at the start of Round %s",
    (round) => {
      const { state: initial, rng } = startedGame(2, 15_110 + round);
      let state = structuredClone(initial);
      state.round = (round - 1) as GameState["round"];
      for (const player of Object.values(state.players)) player.orderHand = [];
      state.ceramics = {};
      setMainOrderQueue(state);
      const reverse = [...turnOrderFromFirst(state)].reverse();
      state.phase = {
        type: "orders",
        turnOrder: reverse,
        currentIndex: 0,
        activePlayerId: reverse[0]!,
        completedInCircuit: 0,
      };

      const result = mustResult(state, reverse[0]!, { type: "END_ORDER_TURN" }, rng);
      state = result.state;

      expect(GAME_CONFIG.orderDisplay.roundStartDiscard).toBe(2);
      expect(state.round).toBe(round);
      expect(state.marketDisplay).toEqual(["O03", "O04", "O05", "O06", "O07"]);
      expect(state.marketDiscard.slice(-2)).toEqual(["O01", "O02"]);
      expect(result.events).toContainEqual(expect.objectContaining({
        type: "ORDER_DISPLAYS_ROTATED",
        round,
        marketOrderIds: ["O01", "O02"],
      }));
    },
  );
});
