import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/index.ts";
import type { GameAction } from "../../src/game/index.ts";
import { addLoaded, addTechnique, addWorkshop, expectError, mustApply, mustResult, setWorkTurn, startedGame, workerId } from "../v127/helpers.ts";

const ready = (state: ReturnType<typeof startedGame>["state"]) => state.players["P1"]!.techniques.find(({ id }) => id === "T03")?.exhausted === false;

describe("Dipping Vats", () => {
  it.each(["high_1", "imperial"] as const)("lets an Apprentice glaze and load Plain for zero Coins in %s", (kilnSpaceId) => {
    const { state, rng } = startedGame(2);
    addTechnique(state, "P1", "T03");
    state.players["P1"]!.imperialKilnUnlocked = true;
    state.players["P1"]!.resources.coins = 0;
    const piece = addWorkshop(state, "P1");
    const result = mustResult(state, "P1", {
      type: "USE_KILN_YARD", workerId: workerId(state, "P1", "apprentice"),
      loads: [{ ceramicId: piece.id, kilnSpaceId, glaze: "moon_white" }], useDippingVats: true,
    }, rng);
    expect(result.state.players["P1"]!.resources.coins).toBe(0);
    expect(result.state.ceramics[piece.id]).toMatchObject({ stage: "loaded", decoration: "plain", glaze: "moon_white", kilnSpaceId });
    expect(ready(result.state)).toBe(false);
    expect(result.events.filter((event) => event.type === "TECHNIQUE_USED" && event.techniqueId === "T03")).toEqual([
      { type: "TECHNIQUE_USED", playerId: "P1", techniqueId: "T03" },
    ]);
  });

  it("waives both Plain loads across the shared and Imperial kilns during one Shifu action", () => {
    const { state, rng } = startedGame(2);
    addTechnique(state, "P1", "T03");
    state.players["P1"]!.imperialKilnUnlocked = true;
    state.players["P1"]!.resources.coins = 0;
    const first = addWorkshop(state, "P1"); const second = addWorkshop(state, "P1", "plate");
    const shifu = workerId(state, "P1", "shifu");
    const result = mustResult(state, "P1", {
      type: "USE_KILN_YARD", workerId: shifu,
      loads: [{ ceramicId: first.id, kilnSpaceId: "middle_1", glaze: "white" }, { ceramicId: second.id, kilnSpaceId: "imperial", glaze: "celadon" }],
      useDippingVats: true, shifuCeramicId: second.id,
    }, rng);
    expect(result.state.players["P1"]!.resources.coins).toBe(0);
    expect(result.state.ceramics[first.id]?.stage).toBe("loaded");
    expect(result.state.ceramics[second.id]).toMatchObject({ stage: "loaded", kilnSpaceId: "imperial" });
    expect(result.state.players["P1"]!.workers[shifu]?.status).not.toBe("available");
    expect(result.events.filter((event) => event.type === "TECHNIQUE_USED" && event.techniqueId === "T03")).toHaveLength(1);
  });

  it.each(["carved", "impressed", "painted"] as const)("still charges for a %s ceramic in a mixed Shifu load", (decoration) => {
    const { state, rng } = startedGame(2);
    addTechnique(state, "P1", "T03");
    const plain = addWorkshop(state, "P1"); const decorated = addWorkshop(state, "P1", "plate", decoration);
    const action: GameAction = {
      type: "USE_KILN_YARD", workerId: workerId(state, "P1", "shifu"),
      loads: [{ ceramicId: plain.id, kilnSpaceId: "middle_1", glaze: "white" }, { ceramicId: decorated.id, kilnSpaceId: "middle_2", glaze: "celadon" }],
      useDippingVats: true, shifuCeramicId: decorated.id,
    };
    state.players["P1"]!.resources.coins = 0;
    const before = structuredClone(state);
    expectError(applyAction(state, "P1", action, rng), "INSUFFICIENT_RESOURCES");
    expect(state).toEqual(before);
    state.players["P1"]!.resources.coins = 1;
    const next = mustApply(state, "P1", action, rng);
    expect(next.players["P1"]!.resources.coins).toBe(0);
    expect(next.ceramics[plain.id]?.stage).toBe("loaded");
    expect(next.ceramics[decorated.id]?.stage).toBe("loaded");
  });

  it.each([undefined, false])("can decline (%s), use it later, then cannot reuse it that round", (useDippingVats) => {
    const { state, rng } = startedGame(2);
    addTechnique(state, "P1", "T03");
    const first = addWorkshop(state, "P1"); const second = addWorkshop(state, "P1", "plate"); const third = addWorkshop(state, "P1", "washer");
    const coins = state.players["P1"]!.resources.coins;
    const skipped = mustResult(state, "P1", {
      type: "USE_KILN_YARD", workerId: workerId(state, "P1", "apprentice"),
      loads: [{ ceramicId: first.id, kilnSpaceId: "middle_1", glaze: "white" }],
      ...(useDippingVats === undefined ? {} : { useDippingVats }),
    }, rng);
    expect(skipped.state.players["P1"]!.resources.coins).toBe(coins - 1);
    expect(ready(skipped.state)).toBe(true);
    expect(skipped.events).not.toContainEqual(expect.objectContaining({ type: "TECHNIQUE_USED", techniqueId: "T03" }));
    setWorkTurn(skipped.state, "P1");
    const used = mustApply(skipped.state, "P1", {
      type: "USE_KILN_YARD", workerId: workerId(skipped.state, "P1", "apprentice"),
      loads: [{ ceramicId: second.id, kilnSpaceId: "middle_2", glaze: "celadon" }], useDippingVats: true,
    }, rng);
    expect(used.players["P1"]!.resources.coins).toBe(coins - 1);
    setWorkTurn(used, "P1");
    const before = structuredClone(used);
    const repeat: GameAction = {
      type: "USE_KILN_YARD", workerId: workerId(used, "P1", "apprentice"),
      loads: [{ ceramicId: third.id, kilnSpaceId: "high_1", glaze: "grey_green" }], useDippingVats: true,
    };
    expectError(applyAction(used, "P1", repeat, rng), "TECHNIQUE_EXHAUSTED");
    expect(used).toEqual(before);
    const paid = mustApply(used, "P1", { ...repeat, useDippingVats: false }, rng);
    expect(paid.players["P1"]!.resources.coins).toBe(coins - 2);
  });

  it.each(["unowned", "exhausted", "no Plain", "occupied", "inactive", "locked Imperial", "rival", "duplicate"] as const)("rejects %s use atomically", (kind) => {
    const { state, rng } = startedGame(2);
    if (kind !== "unowned") addTechnique(state, "P1", "T03", kind === "exhausted");
    const piece = addWorkshop(state, kind === "rival" ? "P2" : "P1", "bowl", kind === "no Plain" ? "painted" : "plain");
    if (kind === "occupied") addLoaded(state, "P2", "plate", "white", "plain", "high_1");
    if (kind === "no Plain") addWorkshop(state, "P1", "plate");
    const load = { ceramicId: piece.id, kilnSpaceId: kind === "inactive" ? "high_2" : kind === "locked Imperial" ? "imperial" : "high_1", glaze: "white" } as const;
    const before = structuredClone(state);
    const result = applyAction(state, "P1", {
      type: "USE_KILN_YARD", workerId: workerId(state, "P1", kind === "duplicate" ? "shifu" : "apprentice"),
      loads: kind === "duplicate" ? [load, { ...load, kilnSpaceId: "middle_1" }] : [load],
      ...(kind === "duplicate" ? { shifuCeramicId: piece.id } : {}), useDippingVats: true,
    }, rng);
    expect(result.ok).toBe(false);
    expect(state).toEqual(before);
  });

  it.each([null, 1, "true", [], {}].map((flag) => ({ flag })))("rejects malformed flag $flag atomically", ({ flag }) => {
    const { state, rng } = startedGame(2);
    addTechnique(state, "P1", "T03"); const piece = addWorkshop(state, "P1");
    const before = structuredClone(state);
    expect(applyAction(state, "P1", {
      type: "USE_KILN_YARD", workerId: workerId(state, "P1", "apprentice"),
      loads: [{ ceramicId: piece.id, kilnSpaceId: "high_1", glaze: "white" }], useDippingVats: flag,
    } as unknown as GameAction, rng).ok).toBe(false);
    expect(state).toEqual(before);
  });

  it("stacks with Kiln Tending, Kiln Furniture and the Shifu marker", () => {
    const { state, rng } = startedGame(2, 14_300, ["ST04"]);
    addTechnique(state, "P1", "T03"); addTechnique(state, "P1", "T15");
    state.players["P1"]!.resources.coins = 0;
    const piece = addWorkshop(state, "P1"); const resources = { ...state.players["P1"]!.resources };
    const result = mustResult(state, "P1", {
      type: "USE_KILN_YARD", workerId: workerId(state, "P1", "shifu"),
      loads: [{ ceramicId: piece.id, kilnSpaceId: "high_1", glaze: "white", useKilnFurniture: true }],
      useDippingVats: true, shifuCeramicId: piece.id, kilnTendingWood: 1,
    }, rng);
    expect(result.state.players["P1"]!.resources).toEqual({ ...resources, wood: resources.wood + 1 });
    expect(result.state.ceramics[piece.id]).toMatchObject({ stage: "loaded", kilnFurnitureUsed: true });
    expect(result.state.players["P1"]!.techniques.every(({ exhausted }) => exhausted)).toBe(true);
    expect(result.events).toContainEqual({ type: "STARTING_TECH_USED", playerId: "P1", techniqueId: "ST04" });
  });

  it("does not waive Rapid Drying's Coin or consume its use", () => {
    const { state, rng } = startedGame(2, 14_301, ["ST03"]);
    addTechnique(state, "P1", "T03"); const piece = addWorkshop(state, "P1");
    state.players["P1"]!.resources.coins = 2;
    const action: GameAction = {
      type: "DECORATE_CERAMICS", workerId: workerId(state, "P1", "apprentice"),
      selections: [{ ceramicId: piece.id, decoration: "painted" }],
      rapidDrying: { ceramicId: piece.id, kilnSpaceId: "high_1", glaze: "white" },
    };
    const before = structuredClone(state);
    expectError(applyAction(state, "P1", action, rng), "INSUFFICIENT_RESOURCES");
    expect(state).toEqual(before);
    state.players["P1"]!.resources.coins = 3;
    const next = mustApply(state, "P1", action, rng);
    expect(next.players["P1"]!.resources.coins).toBe(0);
    expect(ready(next)).toBe(true);
  });

  it("does not waive Imperial Priority's Coin on a Plain ceramic or consume its use", () => {
    const { state, rng } = startedGame(2);
    addTechnique(state, "P1", "T03"); const piece = addWorkshop(state, "P1");
    state.players["P1"]!.imperialKilnUnlocked = true;
    state.players["P1"]!.imperialPriorityAvailable = true;
    state.players["P1"]!.resources.coins = 0;
    const action: GameAction = { type: "RESOLVE_IMPERIAL_PRIORITY", ceramicId: piece.id, glaze: "white" };
    const before = structuredClone(state);
    expect(applyAction(state, "P1", action, rng).ok).toBe(false);
    expect(state).toEqual(before);
    state.players["P1"]!.resources.coins = 1;
    const next = mustApply(state, "P1", action, rng);
    expect(next.players["P1"]!.resources.coins).toBe(0);
    expect(ready(next)).toBe(true);
  });

  it("refreshes Dipping Vats and Calipers for the next round", () => {
    const { state, rng } = startedGame(2);
    addTechnique(state, "P1", "T02", true); addTechnique(state, "P1", "T03", true);
    state.players["P1"]!.orderHand = ["S01", "S02", "O01", "O02"];
    state.phase = { type: "cleanup_orders", queue: { actors: ["P1"], currentIndex: 0 } };
    const next = mustApply(state, "P1", { type: "DISCARD_ORDERS_FOR_CLEANUP", orderIds: ["O01"] }, rng);
    expect(next.round).toBe(2);
    expect(next.players["P1"]!.techniques.every(({ exhausted }) => !exhausted)).toBe(true);
    setWorkTurn(next, "P1");
    next.players["P1"]!.resources.coins = 0;
    const piece = addWorkshop(next, "P1");
    const loaded = mustApply(next, "P1", {
      type: "USE_KILN_YARD", workerId: workerId(next, "P1", "apprentice"),
      loads: [{ ceramicId: piece.id, kilnSpaceId: "high_1", glaze: "white" }], useDippingVats: true,
    }, rng);
    expect(loaded.ceramics[piece.id]?.stage).toBe("loaded");
    expect(ready(loaded)).toBe(false);
  });
});
