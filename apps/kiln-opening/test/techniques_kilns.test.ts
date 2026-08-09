import { describe, expect, it } from "vitest";
import { applyAction } from "../src/game";
import {
  addShaped,
  addTechnique,
  expectError,
  mustApply,
  startedGame,
  workerId,
} from "./helpers";

describe("Forming Techniques and Ding", () => {
  it("implements T01 Large Throwing Wheel", () => {
    const { state, rng } = startedGame(2, 500);
    const actorId = state.firstPlayerId;
    addTechnique(state, actorId, "T01");
    const next = mustApply(
      state,
      actorId,
      {
        type: "FORM_CERAMICS",
        workerId: workerId(state, actorId, "apprentice"),
        shapes: ["vase"],
        useTechniqueIds: ["T01"],
      },
      rng,
    );
    expect(next.players[actorId]!.resources.clay).toBe(1);
    expect(next.players[actorId]!.techniques[0]!.exhausted).toBe(true);
  });

  it("implements T02 Measuring Calipers and T04 Drying Frames", () => {
    const { state, rng } = startedGame(2, 501);
    const actorId = state.firstPlayerId;
    state.players[actorId]!.kilnId = "RU";
    state.players[actorId]!.orderHand = ["M01"];
    addTechnique(state, actorId, "T02");
    addTechnique(state, actorId, "T04");
    const next = mustApply(
      state,
      actorId,
      {
        type: "FORM_CERAMICS",
        workerId: workerId(state, actorId, "shifu"),
        shapes: ["bowl", "plate"],
        useTechniqueIds: ["T02", "T04"],
      },
      rng,
    );
    expect(next.players[actorId]!.resources.coins).toBe(6);
  });

  it("implements T03 Clay Substitution for base and Ding payments", () => {
    const base = startedGame(2, 502);
    const actorId = base.state.firstPlayerId;
    base.state.players[actorId]!.resources.clay = 1;
    addTechnique(base.state, actorId, "T03");
    const substituted = mustApply(
      base.state,
      actorId,
      {
        type: "FORM_CERAMICS",
        workerId: workerId(base.state, actorId, "apprentice"),
        shapes: ["vase"],
        useTechniqueIds: ["T03"],
        claySubstitutionTarget: "base",
      },
      base.rng,
    );
    expect(substituted.players[actorId]!.resources).toEqual({ clay: 0, wood: 2, coins: 2 });

    const ding = startedGame(2, 503);
    const dingActor = ding.state.firstPlayerId;
    ding.state.players[dingActor]!.kilnId = "DI";
    ding.state.players[dingActor]!.resources.clay = 1;
    addTechnique(ding.state, dingActor, "T03");
    const extra = mustApply(
      ding.state,
      dingActor,
      {
        type: "FORM_CERAMICS",
        workerId: workerId(ding.state, dingActor, "apprentice"),
        shapes: ["bowl"],
        dingExtraShape: "bowl",
        useTechniqueIds: ["T03"],
        claySubstitutionTarget: "ding",
      },
      ding.rng,
    );
    expect(Object.values(extra.ceramics)).toHaveLength(2);
    expect(extra.players[dingActor]!.kilnAbilityUsedThisRound).toBe(true);
    expect(extra.players[dingActor]!.resources).toEqual({ clay: 0, wood: 2, coins: 2 });
  });

  it("rejects an exhausted Technique and a second Ding use", () => {
    const { state, rng } = startedGame(2, 504);
    const actorId = state.firstPlayerId;
    addTechnique(state, actorId, "T01", true);
    const exhausted = applyAction(
      state,
      actorId,
      {
        type: "FORM_CERAMICS",
        workerId: workerId(state, actorId, "apprentice"),
        shapes: ["vase"],
        useTechniqueIds: ["T01"],
      },
      rng,
    );
    expectError(exhausted, "TECHNIQUE_EXHAUSTED");

    state.players[actorId]!.kilnId = "DI";
    state.players[actorId]!.kilnAbilityUsedThisRound = true;
    const ding = applyAction(
      state,
      actorId,
      {
        type: "FORM_CERAMICS",
        workerId: workerId(state, actorId, "apprentice"),
        shapes: ["bowl"],
        dingExtraShape: "bowl",
      },
      rng,
    );
    expectError(ding, "INVALID_ACTION");
  });
});

describe("Glazing Techniques", () => {
  it.each([
    ["T05", "carved"],
    ["T06", "impressed"],
  ] as const)("%s waives the complete 2-Coin %s Decoration cost", (techniqueId, decoration) => {
    const { state, rng } = startedGame(2, techniqueId === "T05" ? 508 : 509);
    const actorId = state.firstPlayerId;
    const ceramic = addShaped(state, actorId, "bowl");
    addTechnique(state, actorId, techniqueId);
    const next = mustApply(
      state,
      actorId,
      {
        type: "GLAZE_CERAMICS",
        workerId: workerId(state, actorId, "apprentice"),
        selections: [{ ceramicId: ceramic.id, glaze: "white", decoration }],
        shifuMode: "normal",
        useTechniqueIds: [techniqueId],
      },
      rng,
    );
    expect(next.players[actorId]!.resources.coins).toBe(3);
  });

  it("implements T05 Carving Knives and T06 Seal Stamps cost reductions", () => {
    const { state, rng } = startedGame(2, 510);
    const actorId = state.firstPlayerId;
    const carved = addShaped(state, actorId, "bowl");
    const impressed = addShaped(state, actorId, "plate");
    addTechnique(state, actorId, "T05");
    addTechnique(state, actorId, "T06");
    const next = mustApply(
      state,
      actorId,
      {
        type: "GLAZE_CERAMICS",
        workerId: workerId(state, actorId, "shifu"),
        selections: [
          { ceramicId: carved.id, glaze: "white", decoration: "carved" },
          { ceramicId: impressed.id, glaze: "celadon", decoration: "impressed" },
        ],
        shifuMode: "normal",
        useTechniqueIds: ["T05", "T06"],
      },
      rng,
    );
    expect(next.players[actorId]!.resources.coins).toBe(3);
  });

  it("removes obsolete T07 Glaze Notebook", () => {
    const { state, rng } = startedGame(2, 511);
    const actorId = state.firstPlayerId;
    const first = addShaped(state, actorId, "bowl");
    const second = addShaped(state, actorId, "plate");
    addTechnique(state, actorId, "T07");
    const result = applyAction(
      state,
      actorId,
      {
        type: "GLAZE_CERAMICS",
        workerId: workerId(state, actorId, "shifu"),
        selections: [
          { ceramicId: first.id, glaze: "white", decoration: "plain" },
          { ceramicId: second.id, glaze: "celadon", decoration: "plain" },
        ],
        shifuMode: "normal",
        useTechniqueIds: ["T07"],
      },
      rng,
    );
    expectError(result, "INVALID_ACTION");
  });
});

describe("T08 Colour Samples", () => {
  it("opens before taking an Order, bottoms from either display, and refills", () => {
    const { state, rng } = startedGame(2, 520);
    const actorId = state.firstPlayerId;
    state.players[actorId]!.kilnId = "RU";
    addTechnique(state, actorId, "T08");
    let next = mustApply(
      state,
      actorId,
      {
        type: "BEGIN_OFFICE_ORDERS",
        workerId: workerId(state, actorId, "apprentice"),
        mode: "take_one",
      },
      rng,
    );
    expect(next.phase).toEqual(
      expect.objectContaining({ type: "work_office_orders", step: "colour_samples_or_skip" }),
    );
    const bottomedId = next.imperialDisplay[0]!;
    const replacementId = next.imperialDeck[0]!;
    next = mustApply(
      next,
      actorId,
      { type: "OFFICE_USE_COLOUR_SAMPLES", orderId: bottomedId },
      rng,
    );
    expect(next.imperialDiscard).not.toContain(bottomedId);
    expect(next.imperialDeck.at(-1)).toBe(bottomedId);
    expect(next.imperialDisplay).toContain(replacementId);
    expect(next.players[actorId]!.techniques[0]!.exhausted).toBe(true);
    next = mustApply(next, actorId, { type: "OFFICE_TAKE_ORDER", orderId: replacementId }, rng);
    expect(next.phase.type).toBe("work_office_sale");
    next = mustApply(
      next,
      actorId,
      { type: "OFFICE_RESOLVE_FLAWED_SALE", ceramicIds: [] },
      rng,
    );
    expect(next.phase.type).toBe("work");
  });
});
