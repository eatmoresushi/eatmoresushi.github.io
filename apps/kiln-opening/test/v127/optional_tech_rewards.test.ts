import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/index.ts";
import type { GameAction, GameState, Shape, TechniqueId } from "../../src/game/index.ts";
import {
  addFinished, addGlazed, addLoaded, addShaped, addTechnique,
  expectError, mustApply, mustResult, setWorkTurn, startedGame, workerId,
} from "./helpers.ts";

const REWARDS = ["T02", "T03"] as const;
const otherShape = (id: typeof REWARDS[number]): Shape => id === "T02" ? "plate" : "bowl";
const isExhausted = (state: GameState, id: TechniqueId) => state.players["P1"]!.techniques.find((tech) => tech.id === id)?.exhausted;

describe("optional forming Tech rewards", () => {
  it.each(REWARDS)("%s can be declined, then selected later in the same round", (id) => {
    const { state, rng } = startedGame(2);
    addTechnique(state, "P1", id);
    addShaped(state, "P1", otherShape(id));
    state.players["P1"]!.resources.clay = 10;
    const coins = state.players["P1"]!.resources.coins;
    const skipped = mustResult(state, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["bowl"],
    }, rng);
    expect(skipped.state.players["P1"]!.resources.coins).toBe(coins);
    expect(isExhausted(skipped.state, id)).toBe(false);
    expect(skipped.events).not.toContainEqual(expect.objectContaining({ type: "TECHNIQUE_USED", techniqueId: id }));

    setWorkTurn(skipped.state, "P1");
    const used = mustApply(skipped.state, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(skipped.state, "P1", "apprentice"), shapes: ["bowl"], useTechniqueIds: [id],
    }, rng);
    expect(used.players["P1"]!.resources.coins).toBe(coins + 2);
    expect(isExhausted(used, id)).toBe(true);
    setWorkTurn(used, "P1");
    expect(applyAction(used, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(used, "P1", "shifu"), shapes: ["bowl"], useTechniqueIds: [id],
    }, rng).ok).toBe(false);
  });

  it("only selected eligible rewards pay and exhaust, even when both are eligible", () => {
    const { state, rng } = startedGame(2);
    addTechnique(state, "P1", "T02"); addTechnique(state, "P1", "T03");
    addShaped(state, "P1", "bowl"); addGlazed(state, "P1", "plate");
    const coins = state.players["P1"]!.resources.coins;
    const next = mustApply(state, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["bowl"], useTechniqueIds: ["T03"],
    }, rng);
    expect(next.players["P1"]!.resources.coins).toBe(coins + 2);
    expect(isExhausted(next, "T02")).toBe(false);
    expect(isExhausted(next, "T03")).toBe(true);
  });

  it.each(REWARDS)("%s counts a Glazed vessel when checking its requirement", (id) => {
    const { state, rng } = startedGame(2);
    addTechnique(state, "P1", id); addGlazed(state, "P1", otherShape(id));
    const next = mustApply(state, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["bowl"], useTechniqueIds: [id],
    }, rng);
    expect(next.players["P1"]!.resources.coins).toBe(state.players["P1"]!.resources.coins + 2);
  });

  it.each(REWARDS)("%s rejects an ineligible selection without counting loaded, finished or rival ceramics", (id) => {
    const { state, rng } = startedGame(2);
    addTechnique(state, "P1", id);
    addLoaded(state, "P1", otherShape(id), "white", "plain", "high_1");
    addFinished(state, "P1", otherShape(id), "standard");
    addShaped(state, "P2", otherShape(id));
    const before = structuredClone(state);
    expect(applyAction(state, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["bowl"], useTechniqueIds: [id],
    }, rng).ok).toBe(false);
    expect(state).toEqual(before);
  });

  it.each(["unowned", "exhausted", "duplicate", "invalid timing"] as const)("rejects a %s forming reward selection atomically", (kind) => {
    const { state, rng } = startedGame(2);
    addShaped(state, "P1", "plate");
    if (kind !== "unowned") addTechnique(state, "P1", "T02", kind === "exhausted");
    if (kind === "invalid timing") addTechnique(state, "P1", "T11");
    const ids = kind === "duplicate" ? ["T02", "T02"] : kind === "invalid timing" ? ["T11"] : ["T02"];
    const before = structuredClone(state);
    expect(applyAction(state, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["bowl"], useTechniqueIds: ids,
    }, rng).ok).toBe(false);
    expect(state).toEqual(before);
  });

  it.each(REWARDS)("%s may pay White Slip only when explicitly selected", (id) => {
    const { state, rng } = startedGame(2, 20_092, ["ST02"]);
    addTechnique(state, "P1", id); addShaped(state, "P1", otherShape(id));
    state.players["P1"]!.resources.coins = 0;
    const action: Extract<GameAction, { type: "FORM_CERAMICS" }> = {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["bowl"], whiteSlip: { formedIndex: 0 },
    };
    const before = structuredClone(state);
    expectError(applyAction(state, "P1", action, rng), "INSUFFICIENT_RESOURCES");
    expect(state).toEqual(before);
    const next = mustApply(state, "P1", { ...action, useTechniqueIds: [id] }, rng);
    expect(next.players["P1"]!.resources.coins).toBe(1);
    expect(Object.values(next.ceramics)).toContainEqual(expect.objectContaining({ stage: "glazed", shape: "bowl", glaze: "white", decoration: "plain" }));
    expect(isExhausted(next, id)).toBe(true);
  });

  it("only selected reward income can fund Drying Frames and White Slip together", () => {
    const { state, rng } = startedGame(2, 20_093, ["ST02"]);
    for (const id of ["T02", "T04"]) addTechnique(state, "P1", id);
    addShaped(state, "P1", "bowl");
    state.players["P1"]!.resources.coins = 1;
    const action: Extract<GameAction, { type: "FORM_CERAMICS" }> = {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", "shifu"), shapes: ["bowl", "plate"],
      whiteSlip: { formedIndex: 0 }, dryingFrames: { formedIndex: 1, glaze: "celadon", decoration: "carved" },
    };
    expectError(applyAction(state, "P1", { ...action, useTechniqueIds: ["T04"] }, rng), "INSUFFICIENT_RESOURCES");
    const next = mustApply(state, "P1", { ...action, useTechniqueIds: ["T02", "T04"] }, rng);
    expect(next.players["P1"]!.resources.coins).toBe(0);
    expect(next.players["P1"]!.techniques.every((tech) => tech.exhausted)).toBe(true);
  });

  it.each(REWARDS)("Prepared Clay lets %s be declined and used on a later Materials Yard action", (id) => {
    const { state, rng } = startedGame(2, 20_094, ["ST01"]);
    addTechnique(state, "P1", id); addShaped(state, "P1", otherShape(id));
    const coins = state.players["P1"]!.resources.coins;
    const skipped = mustApply(state, "P1", {
      type: "GAIN_MATERIALS", workerId: workerId(state, "P1", "apprentice"), clay: 3, wood: 0, preparedClayShape: "bowl",
    }, rng);
    expect(skipped.players["P1"]!.resources.coins).toBe(coins);
    expect(isExhausted(skipped, id)).toBe(false);
    setWorkTurn(skipped, "P1");
    const next = mustApply(skipped, "P1", {
      type: "GAIN_MATERIALS", workerId: workerId(skipped, "P1", "apprentice"), clay: 3, wood: 0, preparedClayShape: "bowl", useTechniqueIds: [id],
    }, rng);
    expect(next.players["P1"]!.resources.coins).toBe(coins + 2);
    expect(isExhausted(next, id)).toBe(true);
  });

  it.each(["no vessel", "ineligible", "unowned", "exhausted", "duplicate", "unrelated Tech"] as const)("Materials Yard rejects %s reward selections atomically", (kind) => {
    const { state, rng } = startedGame(2, 20_095, ["ST01"]);
    if (kind !== "ineligible") addShaped(state, "P1", "plate");
    if (kind !== "unowned") addTechnique(state, "P1", "T02", kind === "exhausted");
    if (kind === "unrelated Tech") addTechnique(state, "P1", "T01");
    const before = structuredClone(state);
    expect(applyAction(state, "P1", {
      type: "GAIN_MATERIALS", workerId: workerId(state, "P1", "apprentice"), clay: 3, wood: 0,
      ...(kind === "no vessel" ? {} : { preparedClayShape: "bowl" as const }),
      useTechniqueIds: kind === "duplicate" ? ["T02", "T02"] : kind === "unrelated Tech" ? ["T01"] : ["T02"],
    }, rng).ok).toBe(false);
    expect(state).toEqual(before);
  });
});

describe("optional Kiln Tending", () => {
  it.each([
    { label: "skip", choice: {}, clay: 0, wood: 0 },
    { label: "explicit skip", choice: { kilnTendingClay: 0, kilnTendingWood: 0 }, clay: 0, wood: 0 },
    { label: "Clay", choice: { kilnTendingClay: 1 }, clay: 1, wood: 0 },
    { label: "Wood", choice: { kilnTendingWood: 1 }, clay: 0, wood: 1 },
  ])("loads a ceramic and grants the chosen $label benefit", ({ choice, clay, wood }) => {
    const { state, rng } = startedGame(2, 20_096, ["ST04"]);
    const ceramic = addGlazed(state, "P1");
    const before = { ...state.players["P1"]!.resources };
    const result = mustResult(state, "P1", {
      type: "USE_KILN_YARD", workerId: workerId(state, "P1", "apprentice"), loads: [{ ceramicId: ceramic.id, kilnSpaceId: "high_1" }], ...choice,
    }, rng);
    expect(result.state.ceramics[ceramic.id]?.stage).toBe("loaded");
    expect(result.state.players["P1"]!.resources).toEqual({ clay: before.clay + clay, wood: before.wood + wood, coins: before.coins });
    const techEvents = result.events.filter((event) => event.type === "STARTING_TECH_USED" && event.techniqueId === "ST04");
    expect(techEvents).toHaveLength(clay + wood);
  });

  it.each([
    { kilnTendingClay: 1, kilnTendingWood: 1 },
    { kilnTendingClay: 2 }, { kilnTendingWood: 2 },
    { kilnTendingClay: -1 }, { kilnTendingWood: -1 },
    { kilnTendingClay: 0.5 }, { kilnTendingWood: 0.5 },
  ])("rejects invalid Kiln Tending amounts %j without moving a worker or ceramic", (choice) => {
    const { state, rng } = startedGame(2, 20_097, ["ST04"]);
    const ceramic = addGlazed(state, "P1");
    const before = structuredClone(state);
    expect(applyAction(state, "P1", {
      type: "USE_KILN_YARD", workerId: workerId(state, "P1", "apprentice"), loads: [{ ceramicId: ceramic.id, kilnSpaceId: "high_1" }], ...choice,
    }, rng).ok).toBe(false);
    expect(state).toEqual(before);
  });

  it.each([{ kilnTendingClay: 1 }, { kilnTendingWood: 1 }])("rejects a Kiln Tending benefit without ST04: %j", (choice) => {
    const { state, rng } = startedGame(2, 20_098, ["ST01"]);
    const ceramic = addGlazed(state, "P1");
    expect(applyAction(state, "P1", {
      type: "USE_KILN_YARD", workerId: workerId(state, "P1", "apprentice"), loads: [{ ceramicId: ceramic.id, kilnSpaceId: "high_1" }], ...choice,
    }, rng).ok).toBe(false);
  });

  it("can skip Kiln Tending then choose a resource after a later Kiln Yard action", () => {
    const { state, rng } = startedGame(2, 20_099, ["ST04"]);
    const first = addGlazed(state, "P1"); const second = addGlazed(state, "P1", "plate");
    const coins = { ...state.players["P1"]!.resources };
    const skipped = mustApply(state, "P1", {
      type: "USE_KILN_YARD", workerId: workerId(state, "P1", "apprentice"), loads: [{ ceramicId: first.id, kilnSpaceId: "high_1" }],
    }, rng);
    setWorkTurn(skipped, "P1");
    const next = mustApply(skipped, "P1", {
      type: "USE_KILN_YARD", workerId: workerId(skipped, "P1", "apprentice"), loads: [{ ceramicId: second.id, kilnSpaceId: "low_1" }], kilnTendingWood: 1,
    }, rng);
    expect(next.players["P1"]!.resources).toEqual({ ...coins, wood: coins.wood + 1 });
  });
});
