import { describe, expect, it } from "vitest";
import {
  MAIN_ORDERS,
  ORDER_DEFINITIONS,
  STARTING_ORDERS,
  applyAction,
  calculateFinalResult,
  matchesOrder,
  turnOrderFromFirst,
} from "../../src/game/index.ts";
import type { Decoration, FinishedCeramic, GameState, Glaze, OrderDefinition, Shape } from "../../src/game/index.ts";
import {
  addFinished,
  expectError,
  mustApply,
  mustResult,
  startedGame,
} from "./helpers.ts";

function openOrderTurn(state: GameState, actorId = "P1"): void {
  const turnOrder = [actorId, ...state.playerOrder.filter((id) => id !== actorId)];
  state.phase = { type: "orders", turnOrder, currentIndex: 0, activePlayerId: actorId, completedInCircuit: 0 };
}

function ceramic(
  id: string,
  shape: Shape,
  glaze: Glaze,
  decoration: Decoration,
  quality: "standard" | "fine" | "masterpiece" = "masterpiece",
): FinishedCeramic {
  return {
    id,
    vesselInstanceId: `vessel:${id}`,
    ownerId: "P1",
    shape,
    glaze,
    decoration,
    quality,
    stage: "finished",
    firedInRound: 1,
  };
}

function product<T>(values: readonly T[], count: number): T[][] {
  if (count === 0) return [[]];
  return product(values, count - 1).flatMap((prefix) => values.map((value) => [...prefix, value]));
}

function witnessFor(order: OrderDefinition): FinishedCeramic[] | null {
  const shapes: readonly Shape[] = ["bowl", "plate", "washer", "vase", "censer"];
  const glazes: readonly Glaze[] = ["white", "celadon", "grey_green", "moon_white"];
  const decorations: readonly Decoration[] = ["plain", "carved", "impressed", "crackle"];
  const count = order.ceramics.length;
  for (const shapeValues of product(shapes, count)) {
    for (const glazeValues of product(glazes, count)) {
      for (const decorationValues of product(decorations, count)) {
        const selected = shapeValues.map((shape, index) => ceramic(
          `${order.id}:${index}`,
          shape,
          glazeValues[index]!,
          decorationValues[index]!,
        ));
        if (matchesOrder(order, selected)) return selected;
      }
    }
  }
  return null;
}

describe("V1.2.4 Orders, Recognition, and scoring", () => {
  it("has a valid independent-attribute witness for every one of the 64 Orders", () => {
    for (const order of [...STARTING_ORDERS, ...MAIN_ORDERS]) {
      expect(witnessFor(order), `${order.id}: ${order.requirements}`).not.toBeNull();
    }
  });

  it("matches multi-ceramic Shape and Glaze requirements independently", () => {
    const order = ORDER_DEFINITIONS["O30"]!;
    const firstPairing = [
      ceramic("a", "bowl", "white", "plain", "fine"),
      ceramic("b", "washer", "moon_white", "carved", "fine"),
    ];
    const crossedPairing = [
      ceramic("c", "bowl", "moon_white", "impressed", "fine"),
      ceramic("d", "washer", "white", "crackle", "fine"),
    ];
    expect(matchesOrder(order, firstPairing)).toBe(true);
    expect(matchesOrder(order, crossedPairing)).toBe(true);
  });

  it("completes held Starting Orders and face-up Main Orders directly, refilling the public position", () => {
    const { state: initial, rng } = startedGame(2, 1501);
    let state = structuredClone(initial);
    const held = "S01";
    state.players["P1"]!.orderHand = [held];
    const bowl = addFinished(state, "P1", "bowl", "standard");
    openOrderTurn(state);
    state = mustApply(state, "P1", { type: "COMPLETE_ORDER", orderId: held, ceramicIds: [bowl.id] }, rng);
    expect(state.players["P1"]!.orderHand).not.toContain(held);
    expect(state.ceramics[bowl.id]).toEqual(expect.objectContaining({ stage: "delivered", orderId: held }));

    const publicId = "O02";
    const replacement = "O03";
    state.marketDisplay = [publicId, "O04", "O05", "O06", "O07"];
    state.marketDeck = [replacement, ...state.marketDeck.filter((id) => id !== replacement && !state.marketDisplay.includes(id))];
    const plate = addFinished(state, "P1", "plate", "standard");
    openOrderTurn(state);
    const result = mustResult(state, "P1", { type: "COMPLETE_ORDER", orderId: publicId, ceramicIds: [plate.id] }, rng);
    state = result.state;
    expect(state.marketDisplay).toEqual([replacement, "O04", "O05", "O06", "O07"]);
    expect(state.players["P1"]!.orderHand).not.toContain(publicId);
    expect(result.events).toContainEqual({ type: "ORDER_COMPLETED", playerId: "P1", orderId: publicId, ceramicIds: [plate.id] });
  });

  it("keeps all players in reverse-order completion circuits until a full circuit completes nothing", () => {
    const { state: initial, rng } = startedGame(3, 1502);
    let state = structuredClone(initial);
    const reverse = [...turnOrderFromFirst(state)].reverse();
    state.phase = { type: "orders", turnOrder: reverse, currentIndex: 0, activePlayerId: reverse[0]!, completedInCircuit: 0 };
    const firstActor = reverse[0]!;
    state.players[firstActor]!.orderHand = ["S16"];
    const finished = addFinished(state, firstActor, "bowl", "standard");
    state = mustApply(state, firstActor, { type: "COMPLETE_ORDER", orderId: "S16", ceramicIds: [finished.id] }, rng);
    expect(state.phase).toEqual(expect.objectContaining({ type: "orders", activePlayerId: reverse[1] }));

    while (state.phase.type === "orders" && state.phase.completedInCircuit > 0) {
      state = mustApply(state, state.phase.activePlayerId, { type: "END_ORDER_TURN" }, rng);
    }
    expect(state.phase).toEqual(expect.objectContaining({ type: "orders", activePlayerId: reverse[0], completedInCircuit: 0 }));
    const secondCircuitActors: string[] = [];
    while (state.phase.type === "orders") {
      secondCircuitActors.push(state.phase.activePlayerId);
      state = mustApply(state, state.phase.activePlayerId, { type: "END_ORDER_TURN" }, rng);
    }
    expect(secondCircuitActors).toEqual(reverse);
    expect(state.round).toBe(2);
  });

  it("enforces one combined three-card Cleanup hand limit for Starting and reserved Main Orders", () => {
    const { state: initial, rng } = startedGame(2, 1503);
    let state = structuredClone(initial);
    state.players["P1"]!.orderHand = ["S01", "S02", "O01", "O02", "O03"];
    state.phase = { type: "cleanup_orders", queue: { actors: ["P1"], currentIndex: 0 } };
    expectError(applyAction(state, "P1", { type: "DISCARD_ORDERS_FOR_CLEANUP", orderIds: ["S01"] }, rng), "INVALID_SELECTION");
    state = mustApply(state, "P1", { type: "DISCARD_ORDERS_FOR_CLEANUP", orderIds: ["S01", "O01"] }, rng);
    expect(state.players["P1"]!.orderHand).toEqual(["S02", "O02", "O03"]);
    expect(state.marketDiscard).toContain("O01");
    expect(state.returnedStartingOrderIds).toContain("S01");
  });

  it("no longer waives any Decoration requirement for Guan", () => {
    // V1.2.2 let Guan exempt one ceramic from direct and relational Decoration checks.
    // V1.2.4 pays 2 Coins and 1 VP instead and exempts nothing, so a wrong Decoration is
    // simply a failed Order however the workshop is decorated.
    const single = ORDER_DEFINITIONS["O19"]!;
    const wrongDecoration = ceramic("single", "censer", "grey_green", "carved", "fine");
    expect(matchesOrder(single, [wrongDecoration])).toBe(false);
    const rightDecoration = ceramic("right", "censer", "grey_green", "impressed", "fine");
    expect(matchesOrder(single, [rightDecoration])).toBe(true);

    const relational = ORDER_DEFINITIONS["O39"]!;
    const wrongPair = ceramic("wrong", "vase", "celadon", "carved", "fine");
    const remaining = ceramic("remaining", "censer", "moon_white", "crackle", "fine");
    expect(matchesOrder(relational, [wrongPair, remaining])).toBe(false);
    const rightPair = ceramic("right-pair", "vase", "celadon", "plain", "fine");
    expect(matchesOrder(relational, [rightPair, remaining])).toBe(true);
  });

  it("gives Guan 2 Coins and 1 VP on a Crown Order, and Ru 4 VP once per round", () => {
    const { state: initial, rng } = startedGame(2, 1504);
    let state = structuredClone(initial);
    state.players["P1"]!.kilnId = "GU";
    state.players["P1"]!.resources.coins = 0;
    state.marketDisplay = ["O17"];
    // O17 is Brush Washer / White / Crackle: with the waiver gone it must match exactly.
    const guanCeramic = addFinished(state, "P1", "washer", "fine", "white", "crackle");
    openOrderTurn(state);
    state = mustApply(state, "P1", {
      type: "COMPLETE_ORDER", orderId: "O17", ceramicIds: [guanCeramic.id],
    }, rng);
    expect(state.players["P1"]!.resources.coins).toBe(4);
    expect(state.players["P1"]!.score.kilnTraditionVp).toBe(1);
    expect(state.players["P1"]!.kilnAbilityUsedThisRound).toBe(true);

    state = structuredClone(initial);
    state.players["P1"]!.kilnId = "RU";
    state.marketDisplay = ["O01", "O02"];
    const ruOne = addFinished(state, "P1", "bowl", "masterpiece", "celadon", "plain");
    openOrderTurn(state);
    state = mustApply(state, "P1", { type: "COMPLETE_ORDER", orderId: "O01", ceramicIds: [ruOne.id] }, rng);
    expect(state.players["P1"]!.score.kilnTraditionVp).toBe(4);
    const ruTwo = addFinished(state, "P1", "plate", "masterpiece", "celadon", "plain");
    state.marketDisplay = ["O02"];
    openOrderTurn(state);
    state = mustApply(state, "P1", { type: "COMPLETE_ORDER", orderId: "O02", ceramicIds: [ruTwo.id] }, rng);
    expect(state.players["P1"]!.score.kilnTraditionVp).toBe(4);
  });

  it("resolves every Recognition milestone crossed by a multi-Crown Order in ascending order", () => {
    const { state: initial, rng } = startedGame(2, 1505);
    let state = structuredClone(initial);
    state.players["P1"]!.kilnId = "RU";
    state.players["P1"]!.imperialRecognition = 1;
    state.marketDisplay = ["O47"];
    const ceramics = [
      addFinished(state, "P1", "bowl", "masterpiece", "white", "plain"),
      addFinished(state, "P1", "plate", "masterpiece", "celadon", "carved"),
      addFinished(state, "P1", "washer", "fine", "grey_green", "impressed"),
    ];
    const before = { ...state.players["P1"]!.resources };
    openOrderTurn(state);
    const result = mustResult(state, "P1", {
      type: "COMPLETE_ORDER", orderId: "O47", ceramicIds: ceramics.map(({ id }) => id),
      imperialGrantChoice: "resources",
    }, rng);
    state = result.state;
    expect(state.players["P1"]!.imperialRecognition).toBe(4);
    expect(state.players["P1"]!.imperialGrantResolved).toBe(true);
    expect(state.players["P1"]!.imperialKilnUnlocked).toBe(true);
    expect(state.players["P1"]!.imperialPriorityAvailable).toBe(true);
    expect(state.players["P1"]!.resources.clay).toBe(before.clay + 1);
    expect(state.players["P1"]!.resources.wood).toBe(before.wood + 1);
    expect(result.events.map(({ type }) => type)).toEqual(expect.arrayContaining([
      "IMPERIAL_RECOGNITION_ADVANCED",
      "IMPERIAL_GRANT_RECEIVED",
      "IMPERIAL_KILN_UNLOCKED",
      "IMPERIAL_PRIORITY_GAINED",
    ]));
    const milestoneOrder = result.events.map(({ type }) => type).filter((type) => type.startsWith("IMPERIAL_"));
    expect(milestoneOrder).toEqual([
      "IMPERIAL_RECOGNITION_ADVANCED",
      "IMPERIAL_GRANT_RECEIVED",
      "IMPERIAL_KILN_UNLOCKED",
      "IMPERIAL_PRIORITY_GAINED",
    ]);

    state.marketDisplay = ["O17"];
    const audienceCeramic = addFinished(state, "P1", "washer", "fine", "white", "crackle");
    openOrderTurn(state);
    const audience = mustResult(state, "P1", {
      type: "COMPLETE_ORDER", orderId: "O17", ceramicIds: [audienceCeramic.id],
    }, rng);
    state = audience.state;
    expect(state.players["P1"]!.imperialRecognition).toBe(5);
    expect(state.players["P1"]!.imperialAudienceVpAwarded).toBe(true);
    expect(audience.events).toContainEqual({ type: "IMPERIAL_AUDIENCE_GAINED", playerId: "P1", vp: 6 });
  });

  it("scores the universal five-slot Exhibition, Audience, Coins, and no Tech/track/Seal VP", () => {
    const { state: initial, rng } = startedGame(2, 1506);
    let state = structuredClone(initial);
    state.players["P1"]!.score = { orderVp: 10, kilnTraditionVp: 4 };
    state.players["P1"]!.imperialAudienceVpAwarded = true;
    state.players["P1"]!.imperialRecognition = 5;
    state.players["P1"]!.resources.coins = 17;
    state.players["P1"]!.techniques = [{ id: "T01", exhausted: false }, { id: "T11", exhausted: false }];
    const exhibited = [
      addFinished(state, "P1", "bowl", "standard", "white", "plain"),
      addFinished(state, "P1", "plate", "fine", "celadon", "carved"),
      addFinished(state, "P1", "vase", "masterpiece", "moon_white", "impressed"),
    ];
    state.phase = { type: "presentation", eligiblePlayerIds: ["P1", "P2"], submittedPlayerIds: [] };
    state = mustApply(state, "P1", {
      type: "SUBMIT_PRESENTATION", ceramicIds: exhibited.map(({ id }) => id), featuredCeramicIds: exhibited.map(({ id }) => id),
    }, rng);
    state = mustApply(state, "P2", { type: "SUBMIT_PRESENTATION", ceramicIds: [], featuredCeramicIds: [] }, rng);
    const score = state.finalResult?.scores["P1"];
    expect(score).toEqual({
      orders: 10,
      imperialAudience: 6,
      // Standard 2 + Fine 3 + Masterpiece 5, then V1.2.4's +3 Shapes and +3 Glazes.
      presentation: 16,
      immediateAbilities: 4,
      leftoverCoins: 5,
      total: 41,
    });
  });

  it("uses Recognition, Crowns, and delivered/exhibited Masterpieces as tie breakers, then shares victory", () => {
    const { state: initial } = startedGame(2, 1507);

    let state = structuredClone(initial);
    state.players["P1"]!.imperialRecognition = 2;
    state.players["P2"]!.imperialRecognition = 1;
    expect(calculateFinalResult(state)).toEqual(expect.objectContaining({ winnerIds: ["P1"], resolvedBy: "imperial_recognition" }));

    state = structuredClone(initial);
    state.players["P1"]!.completedOrders = [{ orderId: "O47", ceramicIds: [], completedInRound: 1, vpAwarded: 0, coinsAwarded: 0 }];
    state.players["P2"]!.completedOrders = [{ orderId: "O17", ceramicIds: [], completedInRound: 1, vpAwarded: 0, coinsAwarded: 0 }];
    expect(calculateFinalResult(state)).toEqual(expect.objectContaining({ winnerIds: ["P1"], resolvedBy: "completed_crowns" }));

    state = structuredClone(initial);
    const masterpiece = addFinished(state, "P1", "bowl", "masterpiece");
    state.ceramics[masterpiece.id] = { ...masterpiece, stage: "delivered", orderId: "S01" };
    expect(calculateFinalResult(state)).toEqual(expect.objectContaining({ winnerIds: ["P1"], resolvedBy: "masterpieces_delivered_or_presented" }));

    state = structuredClone(initial);
    expect(calculateFinalResult(state)).toEqual(expect.objectContaining({ winnerIds: ["P1", "P2"], resolvedBy: "shared_victory" }));
  });
});
