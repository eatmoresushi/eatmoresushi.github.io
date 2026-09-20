import { describe, expect, it } from "vitest";
import {
  MAIN_ORDERS,
  ORDER_DEFINITIONS,
  STARTING_ORDERS,
  applyAction,
  canCompleteOrder,
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

/** Keep assertions about an Order completion in the same round instead of auto-cleaning up. */
function keepFollowingActorLegallyActive(state: GameState, actorId = "P1"): void {
  const followingActor = state.playerOrder.find((playerId) => playerId !== actorId);
  if (followingActor === undefined) throw new Error("Order test requires another player");
  state.players[followingActor]!.orderHand = ["S01"];
  addFinished(state, followingActor, "bowl", "standard");
}

function ceramic(
  id: string,
  shape: Shape,
  glaze: Glaze,
  decoration: Decoration,
  quality: FinishedCeramic["quality"] = "masterpiece",
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

describe("V1.2.7 Orders, Recognition, and scoring", () => {
  it("has a valid independent-attribute witness for every one of the 56 Orders", () => {
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

  it.each([
    ["fine", "fine", false],
    ["fine", "masterpiece", true],
    ["masterpiece", "fine", true],
    ["masterpiece", "masterpiece", true],
    ["standard", "masterpiece", false],
    ["masterpiece", "standard", false],
    ["flawed", "masterpiece", false],
    ["masterpiece", "flawed", false],
  ] as const)("O32 completion with %s Vase and %s Bowl requires Fine+ each and at least one Masterpiece", (vaseQuality, bowlQuality, allowed) => {
    const { state, rng } = startedGame(2, 15_032);
    state.players["P1"]!.orderHand = ["O32"];
    const vase = addFinished(state, "P1", "vase", vaseQuality, "white", "plain");
    const bowl = addFinished(state, "P1", "bowl", bowlQuality, "white", "carved");
    keepFollowingActorLegallyActive(state);
    openOrderTurn(state);
    const before = structuredClone(state);
    expect(matchesOrder(ORDER_DEFINITIONS["O32"]!, [vase, bowl])).toBe(allowed);
    const result = applyAction(state, "P1", { type: "COMPLETE_ORDER", orderId: "O32", ceramicIds: [vase.id, bowl.id] }, rng);
    if (!allowed) {
      expectError(result, "ORDER_REQUIREMENTS_NOT_MET");
      expect(state).toEqual(before);
    } else {
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);
      expect(result.state.players["P1"]!.score.orderVp).toBe(before.players["P1"]!.score.orderVp + 13);
      expect(result.state.players["P1"]!.resources.coins).toBe(before.players["P1"]!.resources.coins + 5);
      expect(result.state.ceramics[vase.id]?.stage).toBe("delivered");
      expect(result.state.ceramics[bowl.id]?.stage).toBe("delivered");
    }
  });

  it("uses the shared legality helper to identify Orders with a valid Finished-ceramic group", () => {
    const bowl = ceramic("bowl", "bowl", "white", "plain", "standard");
    const flawedBowl = ceramic("flawed", "bowl", "white", "plain", "flawed");

    expect(canCompleteOrder(ORDER_DEFINITIONS["O01"]!, [bowl])).toBe(true);
    expect(canCompleteOrder(ORDER_DEFINITIONS["O02"]!, [bowl])).toBe(false);
    expect(canCompleteOrder(ORDER_DEFINITIONS["O01"]!, [flawedBowl])).toBe(false);
  });

  it("completes held Starting Orders and slides a completed face-up Main Order before refilling right", () => {
    const { state: initial, rng } = startedGame(2, 1501);
    let state = structuredClone(initial);
    const held = "S01";
    state.players["P1"]!.orderHand = [held];
    const bowl = addFinished(state, "P1", "bowl", "standard");
    keepFollowingActorLegallyActive(state);
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
    expect(state.marketDisplay).toEqual(["O04", "O05", "O06", "O07", replacement]);
    expect(state.players["P1"]!.orderHand).not.toContain(publicId);
    expect(result.events).toContainEqual({ type: "ORDER_COMPLETED", playerId: "P1", orderId: publicId, ceramicIds: [plate.id] });
  });

  it("ends the Order Phase after one full zero-completion circuit", () => {
    const { state: initial, rng } = startedGame(3, 1502);
    let state = structuredClone(initial);
    const reverse = [...turnOrderFromFirst(state)].reverse();
    state.phase = { type: "orders", turnOrder: reverse, currentIndex: 0, activePlayerId: reverse[0]!, completedInCircuit: 0 };
    state.marketDisplay = ["O47"];
    for (const player of Object.values(state.players)) player.orderHand = [];

    // The first explicit pass scans the remaining actors, whose lack of legal
    // completions is administrative, and closes the no-completion circuit.
    state = mustApply(state, reverse[0]!, { type: "END_ORDER_TURN" }, rng);

    expect(state.round).toBe(2);
    expect(state.phase).toEqual({ type: "work", activePlayerId: state.firstPlayerId });
  });

  it("suppresses unchanged legal choices after an explicit pass", () => {
    const { state: initial, rng } = startedGame(2, 15_021);
    let state = structuredClone(initial);
    state.players["P1"]!.orderHand = [];
    state.players["P2"]!.orderHand = ["S01"];
    state.marketDisplay = ["O01"];
    state.marketDeck = state.marketDeck.filter((orderId) => orderId !== "O01");
    addFinished(state, "P1", "bowl", "standard");
    const p2Bowl = addFinished(state, "P2", "bowl", "standard");
    openOrderTurn(state);

    state = mustApply(state, "P1", { type: "END_ORDER_TURN" }, rng);
    expect(state.phase).toEqual(expect.objectContaining({
      type: "orders",
      activePlayerId: "P2",
      declinedCompletableOrderIdsByPlayer: { P1: ["O01"] },
    }));

    // P2 completes a held Order, so the public display is unchanged. P1's
    // still-legal O01 was already declined and is skipped in the next circuit.
    state = mustApply(state, "P2", {
      type: "COMPLETE_ORDER",
      orderId: "S01",
      ceramicIds: [p2Bowl.id],
    }, rng);
    expect(state.players["P1"]!.completedOrders).toHaveLength(0);
    expect(state.round).toBe(2);
    expect(state.phase.type).toBe("work");
  });

  it("re-prompts a passer when a refill reveals a newly completable Main Order", () => {
    const { state: initial, rng } = startedGame(2, 15_022);
    let state = structuredClone(initial);
    state.players["P1"]!.orderHand = [];
    state.players["P2"]!.orderHand = [];
    state.marketDisplay = ["O02"];
    state.marketDeck = ["O01", ...state.marketDeck.filter((orderId) => orderId !== "O01" && orderId !== "O02")];
    addFinished(state, "P1", "bowl", "standard");
    const p2Plate = addFinished(state, "P2", "plate", "standard");
    openOrderTurn(state);

    state = mustApply(state, "P1", { type: "END_ORDER_TURN" }, rng);
    state = mustApply(state, "P2", {
      type: "COMPLETE_ORDER",
      orderId: "O02",
      ceramicIds: [p2Plate.id],
    }, rng);

    expect(state.marketDisplay).toEqual(["O01"]);
    expect(state.phase).toEqual(expect.objectContaining({
      type: "orders",
      activePlayerId: "P1",
      declinedCompletableOrderIdsByPlayer: { P1: [] },
    }));
  });

  it("auto-skips a passer when a refill still does not match, without hiding the next legal actor", () => {
    const { state: initial, rng } = startedGame(2, 15_023);
    let state = structuredClone(initial);
    state.players["P1"]!.orderHand = [];
    state.players["P2"]!.orderHand = ["S01"];
    state.marketDisplay = ["O02"];
    state.marketDeck = ["O03", ...state.marketDeck.filter((orderId) => orderId !== "O02" && orderId !== "O03")];
    addFinished(state, "P1", "bowl", "standard");
    const p2Plate = addFinished(state, "P2", "plate", "standard");
    addFinished(state, "P2", "bowl", "standard");
    openOrderTurn(state);

    state = mustApply(state, "P1", { type: "END_ORDER_TURN" }, rng);
    state = mustApply(state, "P2", {
      type: "COMPLETE_ORDER",
      orderId: "O02",
      ceramicIds: [p2Plate.id],
    }, rng);

    expect(state.marketDisplay).toEqual(["O03"]);
    expect(state.phase).toEqual(expect.objectContaining({
      type: "orders",
      activePlayerId: "P2",
      declinedCompletableOrderIdsByPlayer: { P1: [] },
    }));
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
    // V1.2.7 pays 2 Coins and 1 VP instead and exempts nothing, so a wrong Decoration is
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
    state.players["P1"]!.imperialRecognition = 1;
    state.players["P1"]!.imperialGrantResolved = true;
    state.players["P1"]!.resources.coins = 0;
    state.marketDisplay = ["O17"];
    keepFollowingActorLegallyActive(state);
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
    keepFollowingActorLegallyActive(state);
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
    state.players["P1"]!.imperialRecognition = 0;
    state.marketDisplay = ["O47"];
    keepFollowingActorLegallyActive(state);
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
    expect(state.players["P1"]!.imperialRecognition).toBe(3);
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
    expect(state.players["P1"]!.imperialRecognition).toBe(4);
    expect(state.players["P1"]!.imperialAudienceVpAwarded).toBe(true);
    expect(audience.events).toContainEqual({ type: "IMPERIAL_AUDIENCE_GAINED", playerId: "P1", vp: 6 });

    state.marketDisplay = ["O18"];
    const overflowCeramic = addFinished(state, "P1", "vase", "fine", "celadon", "carved");
    openOrderTurn(state);
    const overflow = mustResult(state, "P1", {
      type: "COMPLETE_ORDER", orderId: "O18", ceramicIds: [overflowCeramic.id],
    }, rng);
    state = overflow.state;
    expect(state.players["P1"]!.imperialRecognition).toBe(4);
    expect(state.players["P1"]!.score.imperialOverflowVp).toBe(1);
    expect(overflow.events).toContainEqual(expect.objectContaining({
      type: "IMPERIAL_RECOGNITION_ADVANCED",
      from: 4,
      to: 4,
      crowns: 1,
      appliedCrowns: 0,
      overflowVp: 1,
    }));
  });

  it("scores the five-slot Exhibition, Audience, Advanced Techs, overflow Crowns, and Coins", () => {
    const { state: initial, rng } = startedGame(2, 1506);
    let state = structuredClone(initial);
    state.players["P1"]!.score = { orderVp: 10, kilnTraditionVp: 4, imperialOverflowVp: 1 };
    state.players["P1"]!.imperialAudienceVpAwarded = true;
    state.players["P1"]!.imperialRecognition = 4;
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
      // Standard 2 + Fine 3 + Masterpiece 5, then V1.2.7's +3 Shapes and +3 Glazes.
      presentation: 16,
      advancedTechniques: 2,
      immediateAbilities: 5,
      leftoverCoins: 5,
      total: 44,
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
