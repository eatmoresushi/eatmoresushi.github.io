import { describe, expect, it } from "vitest";
import { ORDER_DEFINITIONS, STARTING_ORDERS, matchesOrder } from "../../src/game/index.ts";
import type { Decoration, FinishedCeramic, Glaze, Shape } from "../../src/game/index.ts";
import { addFinished, mustResult, startedGame } from "./helpers.ts";

const shapes: readonly Shape[] = ["bowl", "plate", "washer", "vase", "censer"];
const glazes: readonly Glaze[] = ["white", "celadon", "grey_green", "moon_white"];
const decorations: readonly Decoration[] = ["plain", "carved", "impressed", "crackle"];
const qualities = ["flawed", "standard", "fine", "masterpiece"] as const;
const ownerDeck = [
  { id: "S01", ceramics: [{ shape: "bowl" }], shape: "bowl", glaze: "white", vp: 2, accepts: (shape: Shape, _glaze: Glaze) => shape === "bowl" },
  { id: "S02", ceramics: [{ shape: "plate" }], shape: "plate", glaze: "celadon", vp: 2, accepts: (shape: Shape, _glaze: Glaze) => shape === "plate" },
  { id: "S03", ceramics: [{ shape: "washer" }], shape: "washer", glaze: "grey_green", vp: 2, accepts: (shape: Shape, _glaze: Glaze) => shape === "washer" },
  { id: "S04", ceramics: [{ glaze: "white" }], shape: "vase", glaze: "white", vp: 3, accepts: (_shape: Shape, glaze: Glaze) => glaze === "white" },
  { id: "S05", ceramics: [{ glaze: "celadon" }], shape: "censer", glaze: "celadon", vp: 3, accepts: (_shape: Shape, glaze: Glaze) => glaze === "celadon" },
  { id: "S06", ceramics: [{ glaze: "grey_green" }], shape: "plate", glaze: "grey_green", vp: 3, accepts: (_shape: Shape, glaze: Glaze) => glaze === "grey_green" },
  { id: "S07", ceramics: [{ glaze: "moon_white" }], shape: "washer", glaze: "moon_white", vp: 4, accepts: (_shape: Shape, glaze: Glaze) => glaze === "moon_white" },
  { id: "S08", ceramics: [{ shapes: ["vase", "censer"] }], shape: "vase", glaze: "moon_white", vp: 3, accepts: (shape: Shape, _glaze: Glaze) => shape === "vase" || shape === "censer" },
] as const;

describe("owner's eight-card Starting Order amendment", () => {
  it("contains exactly S01–S08 with the specified requirements and rewards", () => {
    expect(STARTING_ORDERS.map(({ id, ceramics, minQuality, vp, coins, crowns, relations }) => ({
      id, ceramics, minQuality, vp, coins, crowns, relations,
    }))).toEqual(ownerDeck.map(({ id, ceramics, vp }) => ({
      id, ceramics, minQuality: "standard", vp, coins: 4, crowns: 0, relations: undefined,
    })));
    for (let number = 9; number <= 16; number += 1) {
      expect(ORDER_DEFINITIONS[`S${String(number).padStart(2, "0")}`]).toBeUndefined();
    }
  });

  it.each(ownerDeck)("$id accepts all and only its permitted attributes at Standard+", ({ id, accepts }) => {
    const order = ORDER_DEFINITIONS[id]!;
    for (const shape of shapes) {
      for (const glaze of glazes) {
        for (const decoration of decorations) {
          for (const quality of qualities) {
            const ceramic: FinishedCeramic = {
              id: "test-ceramic", ownerId: "P1", vesselInstanceId: "test-vessel",
              shape, glaze, decoration, quality, stage: "finished", firedInRound: 1,
            };
            expect(matchesOrder(order, [ceramic]), `${id}: ${shape}/${glaze}/${decoration}/${quality}`)
              .toBe(quality !== "flawed" && accepts(shape, glaze));
            if (quality === "standard" && accepts(shape, glaze)) {
              expect(matchesOrder(order, [])).toBe(false);
              expect(matchesOrder(order, [ceramic, { ...ceramic, id: "extra-ceramic" }])).toBe(false);
            }
          }
        }
      }
    }
  });

  it.each(ownerDeck)("completing $id delivers one ceramic, awards $vp VP and 4 Coins, and gains no Recognition", ({ id, shape, glaze, vp }) => {
    const { state, rng } = startedGame(2, 20_920);
    state.players["P1"]!.kilnId = "DI";
    state.players["P1"]!.orderHand = [id];
    state.players["P2"]!.orderHand = ["O01"];
    state.marketDisplay = [];
    addFinished(state, "P2", "bowl", "standard");
    const ceramic = addFinished(state, "P1", shape, "standard", glaze, "impressed");
    const previousCoins = state.players["P1"]!.resources.coins;
    state.phase = { type: "orders", turnOrder: ["P1", "P2"], currentIndex: 0, activePlayerId: "P1", completedInCircuit: 0 };
    const result = mustResult(state, "P1", { type: "COMPLETE_ORDER", orderId: id, ceramicIds: [ceramic.id] }, rng);
    expect(result.state.players["P1"]!.resources.coins).toBe(previousCoins + 4);
    expect(result.state.players["P1"]!.score.orderVp).toBe(vp);
    expect(result.state.players["P1"]!.imperialRecognition).toBe(0);
    expect(result.state.players["P1"]!.orderHand).toEqual([]);
    expect(result.state.players["P1"]!.completedOrders).toEqual([
      { orderId: id, ceramicIds: [ceramic.id], completedInRound: 1, vpAwarded: vp, coinsAwarded: 4 },
    ]);
    expect(result.state.ceramics[ceramic.id]).toMatchObject({ stage: "delivered", orderId: id });
    expect(result.events).not.toContainEqual(expect.objectContaining({ type: "IMPERIAL_RECOGNITION_ADVANCED" }));
  });
});
