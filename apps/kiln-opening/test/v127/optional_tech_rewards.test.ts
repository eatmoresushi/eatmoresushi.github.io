import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/index.ts";
import type { GameAction, GameState, TechniqueId } from "../../src/game/index.ts";
import {
  addFinished, addGlazed, addLoaded, addShaped, addTechnique,
  expectError, mustApply, mustResult, setWorkTurn, startedGame, workerId,
} from "./helpers.ts";

const isExhausted = (state: GameState, id: TechniqueId) => state.players["P1"]!.techniques.find((tech) => tech.id === id)?.exhausted;

describe("optional Measuring Calipers rewards", () => {
  it.each(["bowl", "plate"] as const)("counts another %s, with the same or a different Shape", (shape) => {
    const { state, rng } = startedGame(2);
    addTechnique(state, "P1", "T02");
    addShaped(state, "P1", shape);
    const coins = state.players["P1"]!.resources.coins;
    const used = mustResult(state, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["bowl"], useTechniqueIds: ["T02"],
    }, rng);
    expect(used.state.players["P1"]!.resources.coins).toBe(coins + 2);
    expect(isExhausted(used.state, "T02")).toBe(true);
    expect(used.events.filter((event) => event.type === "TECHNIQUE_USED" && event.techniqueId === "T02")).toHaveLength(1);
  });

  it("can be declined and used later, but not twice in one round", () => {
    const { state, rng } = startedGame(2);
    addTechnique(state, "P1", "T02"); addShaped(state, "P1", "bowl");
    state.players["P1"]!.resources.clay = 10;
    const coins = state.players["P1"]!.resources.coins;
    const skipped = mustResult(state, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["bowl"],
    }, rng);
    expect(skipped.state.players["P1"]!.resources.coins).toBe(coins);
    expect(isExhausted(skipped.state, "T02")).toBe(false);
    expect(skipped.events).not.toContainEqual(expect.objectContaining({ type: "TECHNIQUE_USED", techniqueId: "T02" }));
    setWorkTurn(skipped.state, "P1");
    const used = mustApply(skipped.state, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(skipped.state, "P1", "apprentice"), shapes: ["bowl"], useTechniqueIds: ["T02"],
    }, rng);
    expect(used.players["P1"]!.resources.coins).toBe(coins + 2);
    setWorkTurn(used, "P1");
    const before = structuredClone(used);
    expect(applyAction(used, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(used, "P1", "shifu"), shapes: ["bowl"], useTechniqueIds: ["T02"],
    }, rng).ok).toBe(false);
    expect(used).toEqual(before);
  });

  it.each(["shifu", "Ding"] as const)("counts another vessel formed by the same %s action, paying only once", (source) => {
    const { state, rng } = startedGame(2);
    addTechnique(state, "P1", "T02");
    state.players["P1"]!.kilnId = "DI";
    const coins = state.players["P1"]!.resources.coins;
    const next = mustApply(state, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", source === "shifu" ? "shifu" : "apprentice"),
      shapes: source === "shifu" ? ["bowl", "bowl"] : ["bowl"],
      ...(source === "Ding" ? { dingExtraShape: "bowl" as const } : {}), useTechniqueIds: ["T02"],
    }, rng);
    expect(Object.values(next.ceramics)).toHaveLength(2);
    expect(next.players["P1"]!.resources.coins).toBe(coins + 2);
  });

  it("counts another specialised workshop vessel", () => {
    const { state, rng } = startedGame(2);
    addTechnique(state, "P1", "T02"); addGlazed(state, "P1", "bowl", "white", "painted");
    const next = mustApply(state, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["bowl"], useTechniqueIds: ["T02"],
    }, rng);
    expect(next.players["P1"]!.resources.coins).toBe(state.players["P1"]!.resources.coins + 2);
  });

  it("rejects a lone new vessel without counting loaded, finished, delivered or rival ceramics", () => {
    const { state, rng } = startedGame(2);
    addTechnique(state, "P1", "T02");
    addLoaded(state, "P1", "bowl", "white", "plain", "high_1");
    addFinished(state, "P1", "plate", "standard");
    const delivered = addFinished(state, "P1", "vase", "fine");
    state.ceramics[delivered.id] = { ...delivered, stage: "delivered", orderId: "S08" };
    addShaped(state, "P2", "bowl");
    const before = structuredClone(state);
    expect(applyAction(state, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["bowl"], useTechniqueIds: ["T02"],
    }, rng).ok).toBe(false);
    expect(state).toEqual(before);
  });

  it.each(["unowned", "exhausted", "duplicate", "Dipping Vats", "invalid timing"] as const)("rejects a %s forming selection atomically", (kind) => {
    const { state, rng } = startedGame(2);
    addShaped(state, "P1", "bowl");
    if (kind !== "unowned") addTechnique(state, "P1", "T02", kind === "exhausted");
    if (kind === "invalid timing") addTechnique(state, "P1", "T11");
    if (kind === "Dipping Vats") addTechnique(state, "P1", "T03");
    const ids = kind === "duplicate" ? ["T02", "T02"] : kind === "invalid timing" ? ["T11"] : kind === "Dipping Vats" ? ["T03"] : ["T02"];
    const before = structuredClone(state);
    expect(applyAction(state, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["bowl"], useTechniqueIds: ids,
    }, rng).ok).toBe(false);
    expect(state).toEqual(before);
  });

  it("can pay White Slip only when explicitly selected", () => {
    const { state, rng } = startedGame(2, 20_092, ["ST02"]);
    addTechnique(state, "P1", "T02"); addShaped(state, "P1", "bowl");
    state.players["P1"]!.resources.coins = 0;
    const action: Extract<GameAction, { type: "FORM_CERAMICS" }> = {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["bowl"], whiteSlip: { formedIndex: 0 },
    };
    const before = structuredClone(state);
    expectError(applyAction(state, "P1", action, rng), "INSUFFICIENT_RESOURCES");
    expect(state).toEqual(before);
    const next = mustApply(state, "P1", { ...action, useTechniqueIds: ["T02"] }, rng);
    expect(next.players["P1"]!.resources.coins).toBe(0);
    expect(Object.values(next.ceramics)).toContainEqual(expect.objectContaining({ stage: "workshop", shape: "bowl", decoration: "painted" }));
    expect(isExhausted(next, "T02")).toBe(true);
  });

  it("only selected reward income can fund Drying Frames and White Slip together", () => {
    const { state, rng } = startedGame(2, 20_093, ["ST02"]);
    for (const id of ["T02", "T04"]) addTechnique(state, "P1", id);
    addShaped(state, "P1", "bowl");
    state.players["P1"]!.resources.coins = 2;
    const action: Extract<GameAction, { type: "FORM_CERAMICS" }> = {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", "shifu"), shapes: ["bowl", "plate"],
      whiteSlip: { formedIndex: 0 }, dryingFrames: { formedIndex: 1, decoration: "carved" },
    };
    expectError(applyAction(state, "P1", { ...action, useTechniqueIds: ["T04"] }, rng), "INSUFFICIENT_RESOURCES");
    const next = mustApply(state, "P1", { ...action, useTechniqueIds: ["T02", "T04"] }, rng);
    expect(next.players["P1"]!.resources.coins).toBe(0);
    expect(next.players["P1"]!.techniques.every((tech) => tech.exhausted)).toBe(true);
  });

  it("Prepared Clay lets Calipers be declined and used on a later Materials Yard action", () => {
    const { state, rng } = startedGame(2, 20_094, ["ST01"]);
    addTechnique(state, "P1", "T02"); addShaped(state, "P1", "bowl");
    const coins = state.players["P1"]!.resources.coins;
    const skipped = mustApply(state, "P1", {
      type: "GAIN_MATERIALS", workerId: workerId(state, "P1", "apprentice"), clay: 3, wood: 0, preparedClayShape: "bowl",
    }, rng);
    expect(skipped.players["P1"]!.resources.coins).toBe(coins);
    expect(isExhausted(skipped, "T02")).toBe(false);
    setWorkTurn(skipped, "P1");
    const next = mustApply(skipped, "P1", {
      type: "GAIN_MATERIALS", workerId: workerId(skipped, "P1", "apprentice"), clay: 3, wood: 0, preparedClayShape: "bowl", useTechniqueIds: ["T02"],
    }, rng);
    expect(next.players["P1"]!.resources.coins).toBe(coins + 2);
    expect(isExhausted(next, "T02")).toBe(true);
  });

  it.each(["no vessel", "ineligible", "unowned", "exhausted", "duplicate", "Dipping Vats", "unrelated Tech"] as const)("Materials Yard rejects %s reward selections atomically", (kind) => {
    const { state, rng } = startedGame(2, 20_095, ["ST01"]);
    if (kind !== "ineligible") addShaped(state, "P1", "plate");
    if (kind !== "unowned") addTechnique(state, "P1", "T02", kind === "exhausted");
    if (kind === "unrelated Tech") addTechnique(state, "P1", "T01");
    if (kind === "Dipping Vats") addTechnique(state, "P1", "T03");
    const before = structuredClone(state);
    expect(applyAction(state, "P1", {
      type: "GAIN_MATERIALS", workerId: workerId(state, "P1", "apprentice"), clay: 3, wood: 0,
      ...(kind === "no vessel" ? {} : { preparedClayShape: "bowl" as const }),
      useTechniqueIds: kind === "duplicate" ? ["T02", "T02"] : kind === "unrelated Tech" ? ["T01"] : kind === "Dipping Vats" ? ["T03"] : ["T02"],
    }, rng).ok).toBe(false);
    expect(state).toEqual(before);
  });
});
