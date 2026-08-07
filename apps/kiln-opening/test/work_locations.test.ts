import { describe, expect, it } from "vitest";
import { SeededRandom, applyAction, makeFinishedCeramic } from "../src/game";
import { addGlazed, addShaped, expectError, mustApply, setActive, startedGame, workerId } from "./helpers";

describe("Materials Yard", () => {
  it("gives an Apprentice two resources and a Shifu three in any combination", () => {
    for (const [kind, clay, wood] of [
      ["apprentice", 1, 1],
      ["shifu", 2, 1],
    ] as const) {
      const { state: initial, rng } = startedGame(2, kind === "shifu" ? 201 : 200);
      const actorId = initial.firstPlayerId;
      const before = JSON.parse(JSON.stringify(initial));
      const state = mustApply(
        initial,
        actorId,
        {
          type: "GAIN_MATERIALS",
          workerId: workerId(initial, actorId, kind),
          clay,
          wood,
        },
        rng,
      );
      expect(state.players[actorId]!.resources.clay).toBe(2 + clay);
      expect(state.players[actorId]!.resources.wood).toBe(2 + wood);
      expect(initial).toEqual(before);
    }
  });

  it("rejects an over-limit split and fulfils only available common supply", () => {
    const { state, rng } = startedGame(2, 202);
    const actorId = state.firstPlayerId;
    const apprenticeId = workerId(state, actorId, "apprentice");
    const invalid = applyAction(
      state,
      actorId,
      { type: "GAIN_MATERIALS", workerId: apprenticeId, clay: 2, wood: 1 },
      rng,
    );
    expectError(invalid, "INVALID_SELECTION");

    state.commonSupply.clay = 1;
    const next = mustApply(
      state,
      actorId,
      { type: "GAIN_MATERIALS", workerId: apprenticeId, clay: 2, wood: 0 },
      rng,
    );
    expect(next.players[actorId]!.resources.clay).toBe(3);
    expect(next.commonSupply.clay).toBe(0);
  });
});

describe("Forming Studio", () => {
  it("charges Shape cost, consumes finite Vessel supply, and creates Shaped instances", () => {
    const { state, rng } = startedGame(2, 210);
    const actorId = state.firstPlayerId;
    const next = mustApply(
      state,
      actorId,
      {
        type: "FORM_CERAMICS",
        workerId: workerId(state, actorId, "apprentice"),
        shapes: ["bowl"],
      },
      rng,
    );
    expect(next.players[actorId]!.resources.clay).toBe(1);
    expect(next.vesselSupply.bowl).toHaveLength(7);
    expect(Object.values(next.ceramics)).toEqual([
      expect.objectContaining({ ownerId: actorId, shape: "bowl", stage: "shaped" }),
    ]);
  });

  it("lets the Shifu form up to two and rejects capacity, Clay, or Vessel shortages", () => {
    const { state, rng } = startedGame(2, 211);
    const actorId = state.firstPlayerId;
    state.players[actorId]!.resources.clay = 4;
    const next = mustApply(
      state,
      actorId,
      {
        type: "FORM_CERAMICS",
        workerId: workerId(state, actorId, "shifu"),
        shapes: ["vase", "censer"],
      },
      rng,
    );
    expect(next.players[actorId]!.resources.clay).toBe(0);
    expect(Object.values(next.ceramics).map((ceramic) => ceramic.shape)).toEqual([
      "vase",
      "censer",
    ]);

    const shortage = startedGame(2, 212);
    const shortageActor = shortage.state.firstPlayerId;
    const noClay = applyAction(
      shortage.state,
      shortageActor,
      {
        type: "FORM_CERAMICS",
        workerId: workerId(shortage.state, shortageActor, "shifu"),
        shapes: ["vase", "censer"],
      },
      shortage.rng,
    );
    expectError(noClay, "INSUFFICIENT_RESOURCES");

    shortage.state.vesselSupply.bowl = [];
    const noVessel = applyAction(
      shortage.state,
      shortageActor,
      {
        type: "FORM_CERAMICS",
        workerId: workerId(shortage.state, shortageActor, "apprentice"),
        shapes: ["bowl"],
      },
      shortage.rng,
    );
    expectError(noVessel, "SUPPLY_EMPTY");
  });
});

describe("Glaze Workshop", () => {
  it("applies exactly one Glaze and Decoration and pays its Coin cost", () => {
    const { state, rng } = startedGame(2, 220);
    const actorId = state.firstPlayerId;
    const ceramic = addShaped(state, actorId, "plate");
    const next = mustApply(
      state,
      actorId,
      {
        type: "GLAZE_CERAMICS",
        workerId: workerId(state, actorId, "apprentice"),
        selections: [{ ceramicId: ceramic.id, glaze: "celadon", decoration: "carved" }],
        shifuMode: "normal",
      },
      rng,
    );
    expect(next.players[actorId]!.resources.coins).toBe(2);
    expect(next.ceramics[ceramic.id]).toEqual(
      expect.objectContaining({ stage: "glazed", glaze: "celadon", decoration: "carved" }),
    );
  });

  it("supports both Shifu modes and rejects re-glazing", () => {
    const normal = startedGame(2, 221);
    const actorId = normal.state.firstPlayerId;
    const first = addShaped(normal.state, actorId, "bowl");
    const second = addShaped(normal.state, actorId, "washer");
    const normalNext = mustApply(
      normal.state,
      actorId,
      {
        type: "GLAZE_CERAMICS",
        workerId: workerId(normal.state, actorId, "shifu"),
        selections: [
          { ceramicId: first.id, glaze: "white", decoration: "carved" },
          { ceramicId: second.id, glaze: "moon_white", decoration: "impressed" },
        ],
        shifuMode: "normal",
      },
      normal.rng,
    );
    expect(normalNext.players[actorId]!.resources.coins).toBe(1);

    const free = startedGame(2, 222);
    const freeActor = free.state.firstPlayerId;
    const freeCeramic = addShaped(free.state, freeActor, "vase");
    const freeNext = mustApply(
      free.state,
      freeActor,
      {
        type: "GLAZE_CERAMICS",
        workerId: workerId(free.state, freeActor, "shifu"),
        selections: [
          { ceramicId: freeCeramic.id, glaze: "moon_white", decoration: "crackle" },
        ],
        shifuMode: "free_single",
      },
      free.rng,
    );
    expect(freeNext.players[freeActor]!.resources.coins).toBe(3);

    setActive(freeNext, freeActor);
    const reglaze = applyAction(
      freeNext,
      freeActor,
      {
        type: "GLAZE_CERAMICS",
        workerId: workerId(freeNext, freeActor, "apprentice"),
        selections: [
          { ceramicId: freeCeramic.id, glaze: "white", decoration: "plain" },
        ],
        shifuMode: "normal",
      },
      free.rng,
    );
    expectError(reglaze, "ILLEGAL_CERAMIC_STAGE");
  });
});

describe("Kiln Yard and ceramic lifecycle", () => {
  it("supports Shaped → Glazed → Loaded → Finished with three legal actions", () => {
    let { state, rng } = startedGame(2, 230);
    const actorId = state.firstPlayerId;

    state = mustApply(
      state,
      actorId,
      {
        type: "FORM_CERAMICS",
        workerId: workerId(state, actorId, "apprentice"),
        shapes: ["bowl"],
      },
      rng,
    );
    const ceramicId = Object.keys(state.ceramics)[0]!;
    expect(state.ceramics[ceramicId]!.stage).toBe("shaped");

    setActive(state, actorId);
    state = mustApply(
      state,
      actorId,
      {
        type: "GLAZE_CERAMICS",
        workerId: workerId(state, actorId, "apprentice"),
        selections: [{ ceramicId, glaze: "white", decoration: "plain" }],
        shifuMode: "normal",
      },
      rng,
    );
    expect(state.ceramics[ceramicId]!.stage).toBe("glazed");

    setActive(state, actorId);
    state = mustApply(
      state,
      actorId,
      {
        type: "USE_KILN_YARD",
        workerId: workerId(state, actorId, "shifu"),
        gainWood: true,
        loads: [{ ceramicId, kilnSpaceId: "high_1" }],
      },
      rng,
    );
    expect(state.players[actorId]!.resources.wood).toBe(3);
    const loaded = state.ceramics[ceramicId]!;
    expect(loaded).toEqual(expect.objectContaining({ stage: "loaded", kilnSpaceId: "high_1" }));
    const finished = makeFinishedCeramic(loaded, "fine", 1);
    expect(finished).toEqual(
      expect.objectContaining({ stage: "finished", quality: "fine", firedInRound: 1 }),
    );
    expect(finished).not.toHaveProperty("kilnSpaceId");
  });

  it("lets a Shifu load two, allows taking Wood with no load, and blocks occupied spaces", () => {
    const shifuGame = startedGame(2, 231);
    const actorId = shifuGame.state.firstPlayerId;
    const first = addGlazed(shifuGame.state, actorId, "bowl");
    const second = addGlazed(shifuGame.state, actorId, "plate");
    const next = mustApply(
      shifuGame.state,
      actorId,
      {
        type: "USE_KILN_YARD",
        workerId: workerId(shifuGame.state, actorId, "shifu"),
        gainWood: false,
        loads: [
          { ceramicId: first.id, kilnSpaceId: "middle_1" },
          { ceramicId: second.id, kilnSpaceId: "middle_2" },
        ],
      },
      shifuGame.rng,
    );
    expect(Object.values(next.ceramics).filter((ceramic) => ceramic.stage === "loaded")).toHaveLength(2);

    const emptyLoad = startedGame(2, 232);
    const emptyActor = emptyLoad.state.firstPlayerId;
    const woodOnly = mustApply(
      emptyLoad.state,
      emptyActor,
      {
        type: "USE_KILN_YARD",
        workerId: workerId(emptyLoad.state, emptyActor, "apprentice"),
        gainWood: true,
        loads: [],
      },
      emptyLoad.rng,
    );
    expect(woodOnly.players[emptyActor]!.resources.wood).toBe(3);

    const occupied = startedGame(2, 233);
    const occupiedActor = occupied.state.firstPlayerId;
    addGlazed(occupied.state, occupiedActor, "bowl");
    const otherId = occupied.state.playerOrder.find((id) => id !== occupiedActor)!;
    const occupying = addGlazed(occupied.state, otherId, "plate");
    occupied.state.ceramics[occupying.id] = {
      ...occupying,
      stage: "loaded",
      kilnSpaceId: "low_1",
    };
    const actorCeramic = Object.values(occupied.state.ceramics).find(
      (ceramic) => ceramic.ownerId === occupiedActor,
    )!;
    const rejected = applyAction(
      occupied.state,
      occupiedActor,
      {
        type: "USE_KILN_YARD",
        workerId: workerId(occupied.state, occupiedActor, "apprentice"),
        gainWood: false,
        loads: [{ ceramicId: actorCeramic.id, kilnSpaceId: "low_1" }],
      },
      occupied.rng,
    );
    expectError(rejected, "KILN_SPACE_OCCUPIED");
  });
});
