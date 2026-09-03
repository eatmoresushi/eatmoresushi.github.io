import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/index.ts";
import {
  addGlazed,
  addShaped,
  addTechnique,
  expectError,
  mustApply,
  mustResult,
  setWorkTurn,
  startedGame,
  workerId,
} from "./helpers.ts";

describe("V1.2.2 worker actions and workshop Techs", () => {
  it("resolves Apprentice and Shifu Materials Yard effects, including Prepared Clay", () => {
    const { state: initial, rng } = startedGame(2, 1301, ["ST01"]);
    let state = structuredClone(initial);
    const apprentice = workerId(state, "P1", "apprentice");
    const before = { ...state.players["P1"]!.resources };
    state = mustApply(state, "P1", {
      type: "GAIN_MATERIALS", workerId: apprentice, clay: 1, wood: 2, preparedClayShape: "vase",
    }, rng);
    expect(state.players["P1"]!.resources.clay).toBe(before.clay + 1 - 2);
    expect(state.players["P1"]!.resources.wood).toBe(before.wood + 2);
    expect(Object.values(state.ceramics)).toEqual([
      expect.objectContaining({ ownerId: "P1", shape: "vase", stage: "shaped" }),
    ]);

    setWorkTurn(state, "P2");
    const shifu = workerId(state, "P2", "shifu");
    const shifuBefore = { ...state.players["P2"]!.resources };
    state = mustApply(state, "P2", {
      type: "GAIN_MATERIALS", workerId: shifu, clay: 2, wood: 2, buyShifuBonus: true,
    }, rng);
    expect(state.players["P2"]!.resources).toEqual({
      clay: shifuBefore.clay + 3,
      wood: shifuBefore.wood + 3,
      coins: shifuBefore.coins - 1,
    });
  });

  it("enforces one private Potter's Wheel space per owner until Advanced Tech expansion", () => {
    const { state: initial, rng } = startedGame(2, 1302);
    let state = structuredClone(initial);
    state.players["P1"]!.resources.clay = 10;
    state.players["P2"]!.resources.clay = 10;
    const first = workerId(state, "P1", "apprentice", 0);
    state = mustApply(state, "P1", { type: "FORM_CERAMICS", workerId: first, shapes: ["bowl"] }, rng);

    setWorkTurn(state, "P1");
    const second = workerId(state, "P1", "apprentice", 0);
    expectError(applyAction(state, "P1", { type: "FORM_CERAMICS", workerId: second, shapes: ["plate"] }, rng), "LOCATION_FULL");

    setWorkTurn(state, "P2");
    state = mustApply(state, "P2", { type: "FORM_CERAMICS", workerId: workerId(state, "P2", "apprentice"), shapes: ["plate"] }, rng);
    expect(Object.values(state.ceramics).filter(({ stage }) => stage === "shaped")).toHaveLength(2);
  });

  it("applies the Potter's Wheel limits, Shifu two-vessel discount, and forbids an empty action", () => {
    const { state: initial, rng } = startedGame(2, 1303);
    let state = structuredClone(initial);
    state.players["P1"]!.resources.clay = 10;
    const shifu = workerId(state, "P1", "shifu");
    const invalid = applyAction(state, "P1", { type: "FORM_CERAMICS", workerId: shifu, shapes: [] }, rng);
    expectError(invalid, "INVALID_SELECTION");
    const before = state.players["P1"]!.resources.clay;
    state = mustApply(state, "P1", { type: "FORM_CERAMICS", workerId: shifu, shapes: ["vase", "censer"] }, rng);
    expect(state.players["P1"]!.resources.clay).toBe(before - 3);
  });

  it("applies Ding's additional matching vessel at its normal Clay cost", () => {
    const { state: initial, rng } = startedGame(2, 1315);
    let state = structuredClone(initial);
    state.players["P1"]!.kilnId = "DI";
    state.players["P1"]!.resources.clay = 10;
    const before = state.players["P1"]!.resources.clay;
    state = mustApply(state, "P1", {
      type: "FORM_CERAMICS",
      workerId: workerId(state, "P1", "apprentice"),
      shapes: ["bowl"],
      dingExtraShape: "bowl",
    }, rng);
    const bowls = Object.values(state.ceramics).filter(
      (ceramic) => ceramic.ownerId === "P1" && ceramic.shape === "bowl",
    );
    expect(bowls).toHaveLength(2);
    expect(state.players["P1"]!.resources.clay).toBe(before - 2);
    expect(state.players["P1"]!.kilnAbilityUsedThisRound).toBe(true);
  });

  it("allows a player to pass with unused workers and prevents later Work actions that round", () => {
    const { state: initial, rng } = startedGame(2, 1316);
    let state = structuredClone(initial);
    expect(Object.values(state.players["P1"]!.workers).some(({ status }) => status === "available")).toBe(true);
    state = mustApply(state, "P1", { type: "PASS_WORK_PHASE" }, rng);
    expect(state.players["P1"]!.passedWorkPhase).toBe(true);
    expect(state.phase).toEqual({ type: "work", activePlayerId: "P2" });
    expectError(applyAction(state, "P1", {
      type: "USE_LABOUR",
      workerId: workerId(state, "P1", "apprentice"),
    }, rng), "NOT_ACTIVE_PLAYER");
  });

  it("lets White Slip and Drying Frames finish different vessels from one Shifu action", () => {
    const { state: initial, rng } = startedGame(2, 1304, ["ST02"]);
    let state = structuredClone(initial);
    state.players["P1"]!.resources = { clay: 10, wood: 10, coins: 10 };
    addTechnique(state, "P1", "T04");
    state = mustApply(state, "P1", {
      type: "FORM_CERAMICS",
      workerId: workerId(state, "P1", "shifu"),
      shapes: ["bowl", "plate"],
      useTechniqueIds: ["T04"],
      whiteSlip: { formedIndex: 0, decoration: "carved" },
      dryingFrames: { formedIndex: 1, glaze: "moon_white" },
    }, rng);
    const glazed = Object.values(state.ceramics).filter(({ stage }) => stage === "glazed");
    expect(glazed).toEqual(expect.arrayContaining([
      expect.objectContaining({ shape: "bowl", glaze: "white", decoration: "carved" }),
      expect.objectContaining({ shape: "plate", glaze: "moon_white", decoration: "plain" }),
    ]));
    expect(state.players["P1"]!.resources.coins).toBe(7);
    expect(state.players["P1"]!.techniques.find(({ id }) => id === "T04")?.exhausted).toBe(true);
  });

  it("implements all five Forming Advanced Tech effects", () => {
    const { state: initial, rng } = startedGame(2, 1305);

    let state = structuredClone(initial);
    state.players["P1"]!.resources = { clay: 10, wood: 10, coins: 10 };
    addTechnique(state, "P1", "T01");
    const beforeClay = state.players["P1"]!.resources.clay;
    state = mustApply(state, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["vase"], useTechniqueIds: ["T01"],
    }, rng);
    expect(state.players["P1"]!.resources.clay).toBe(beforeClay - 1);

    state = structuredClone(initial);
    state.players["P1"]!.resources = { clay: 10, wood: 10, coins: 10 };
    addTechnique(state, "P1", "T02");
    addShaped(state, "P1", "bowl");
    const calipersCoins = state.players["P1"]!.resources.coins;
    state = mustApply(state, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["plate"],
    }, rng);
    expect(state.players["P1"]!.resources.coins).toBe(calipersCoins + 1);
    expect(state.players["P1"]!.techniques.find(({ id }) => id === "T02")?.exhausted).toBe(true);

    state = structuredClone(initial);
    state.players["P1"]!.resources = { clay: 10, wood: 10, coins: 10 };
    addTechnique(state, "P1", "T03");
    addShaped(state, "P1", "bowl");
    const mouldCoins = state.players["P1"]!.resources.coins;
    state = mustApply(state, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["bowl"],
    }, rng);
    expect(state.players["P1"]!.resources.coins).toBe(mouldCoins + 1);

    state = structuredClone(initial);
    state.players["P1"]!.resources = { clay: 10, wood: 10, coins: 10 };
    addTechnique(state, "P1", "T04");
    state = mustApply(state, "P1", {
      type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["washer"],
      useTechniqueIds: ["T04"], dryingFrames: { formedIndex: 0, glaze: "celadon" },
    }, rng);
    expect(Object.values(state.ceramics)).toContainEqual(expect.objectContaining({ shape: "washer", stage: "glazed", glaze: "celadon", decoration: "plain" }));

    state = structuredClone(initial);
    state.players["P1"]!.resources = { clay: 10, wood: 10, coins: 10 };
    addTechnique(state, "P1", "T05");
    const reworked = addShaped(state, "P1", "bowl");
    const clayBeforeRework = state.players["P1"]!.resources.clay;
    state = mustApply(state, "P1", {
      type: "GLAZE_CERAMICS", workerId: workerId(state, "P1", "apprentice"),
      selections: [{ ceramicId: reworked.id, glaze: "white", decoration: "plain", newShape: "vase" }],
      useTechniqueIds: ["T05"],
    }, rng);
    expect(state.ceramics[reworked.id]).toEqual(expect.objectContaining({ shape: "vase", stage: "glazed" }));
    expect(state.players["P1"]!.resources.clay).toBe(clayBeforeRework - 1);
  });

  it("applies the Shifu free Decoration even when glazing one vessel", () => {
    const { state: initial, rng } = startedGame(2, 1306);
    let state = structuredClone(initial);
    state.players["P1"]!.resources.coins = 0;
    const ceramic = addShaped(state, "P1", "censer");
    state = mustApply(state, "P1", {
      type: "GLAZE_CERAMICS", workerId: workerId(state, "P1", "shifu"),
      selections: [{ ceramicId: ceramic.id, glaze: "grey_green", decoration: "crackle" }],
      freeDecorationCeramicId: ceramic.id,
    }, rng);
    expect(state.ceramics[ceramic.id]).toEqual(expect.objectContaining({ stage: "glazed", glaze: "grey_green", decoration: "crackle" }));
    expect(state.players["P1"]!.resources.coins).toBe(0);
  });

  it("implements Glaze Palette and all three free-Decoration Advanced Techs", () => {
    const { state: initial, rng } = startedGame(2, 1307);
    for (const [techniqueId, decoration] of [["T07", "carved"], ["T08", "impressed"], ["T09", "crackle"]] as const) {
      let state = structuredClone(initial);
      state.players["P1"]!.resources.coins = 0;
      addTechnique(state, "P1", techniqueId);
      const ceramic = addShaped(state, "P1", "bowl");
      state = mustApply(state, "P1", {
        type: "GLAZE_CERAMICS", workerId: workerId(state, "P1", "apprentice"),
        selections: [{ ceramicId: ceramic.id, glaze: "white", decoration }], useTechniqueIds: [techniqueId],
      }, rng);
      expect(state.players["P1"]!.resources.coins).toBe(0);
      expect(state.players["P1"]!.techniques.find(({ id }) => id === techniqueId)?.exhausted).toBe(true);
    }

    let state = structuredClone(initial);
    state.players["P1"]!.resources.coins = 10;
    addTechnique(state, "P1", "T06");
    const selected = addShaped(state, "P1", "plate");
    const other = addGlazed(state, "P1", "vase", "white", "plain");
    state = mustApply(state, "P1", {
      type: "GLAZE_CERAMICS", workerId: workerId(state, "P1", "apprentice"),
      selections: [{ ceramicId: selected.id, glaze: "celadon", decoration: "plain" }],
      useTechniqueIds: ["T06"], glazePalette: { ceramicId: other.id, glaze: "moon_white" },
    }, rng);
    expect(state.ceramics[other.id]).toEqual(expect.objectContaining({ stage: "glazed", glaze: "moon_white" }));
  });

  it("implements Rapid Drying without consuming a Kiln Yard space or triggering Kiln Tending", () => {
    const { state: initial, rng } = startedGame(2, 1308, ["ST03"]);
    let state = structuredClone(initial);
    state.players["P1"]!.resources = { clay: 10, wood: 2, coins: 10 };
    const ceramic = addShaped(state, "P1", "plate");
    state = mustApply(state, "P1", {
      type: "GLAZE_CERAMICS", workerId: workerId(state, "P1", "apprentice"),
      selections: [{ ceramicId: ceramic.id, glaze: "celadon", decoration: "plain" }],
      rapidDrying: { ceramicId: ceramic.id, kilnSpaceId: "middle_1" },
    }, rng);
    expect(state.ceramics[ceramic.id]).toEqual(expect.objectContaining({ stage: "loaded", kilnSpaceId: "middle_1" }));
    expect(state.actionBoard.placements.kiln_yard).toEqual([]);
    expect(state.players["P1"]!.resources.wood).toBe(1);
  });

  it("loads through Kiln Yard, applies Kiln Tending, and treats the location as uncapped", () => {
    const { state: initial, rng } = startedGame(2, 1309, ["ST04", "ST01"]);
    let state = structuredClone(initial);
    const p1 = addGlazed(state, "P1", "bowl", "white", "plain");
    const p2 = addGlazed(state, "P2", "plate", "celadon", "plain");
    const resources = { ...state.players["P1"]!.resources };
    state = mustApply(state, "P1", {
      type: "USE_KILN_YARD", workerId: workerId(state, "P1", "apprentice"),
      loads: [{ ceramicId: p1.id, kilnSpaceId: "high_1" }], kilnTendingClay: 1, kilnTendingWood: 1,
    }, rng);
    expect(state.players["P1"]!.resources.clay).toBe(resources.clay + 1);
    expect(state.players["P1"]!.resources.wood).toBe(resources.wood + 1);
    setWorkTurn(state, "P2");
    state = mustApply(state, "P2", {
      type: "USE_KILN_YARD", workerId: workerId(state, "P2", "apprentice"),
      loads: [{ ceramicId: p2.id, kilnSpaceId: "low_1" }],
    }, rng);
    expect(state.actionBoard.placements.kiln_yard).toHaveLength(2);
  });

  it("reserves and refills two Main Orders with a Shifu, then grants only one commission advance", () => {
    const { state: initial, rng } = startedGame(2, 1310);
    let state = structuredClone(initial);
    const displayed = state.marketDisplay.slice(0, 2);
    const clayBefore = state.players["P1"]!.resources.clay;
    state = mustApply(state, "P1", {
      type: "BEGIN_OFFICE_ORDERS", workerId: workerId(state, "P1", "shifu"), mode: "take_up_to_two",
    }, rng);
    state = mustApply(state, "P1", { type: "OFFICE_TAKE_ORDER", orderId: displayed[0]! }, rng);
    state = mustApply(state, "P1", { type: "OFFICE_TAKE_ORDER", orderId: displayed[1]! }, rng);
    expect(state.phase.type).toBe("work_commission_advance");
    expect(state.marketDisplay).toHaveLength(5);
    state = mustApply(state, "P1", { type: "COMMISSION_GAIN_ADVANCE", resource: "clay" }, rng);
    expect(state.players["P1"]!.resources.clay).toBe(clayBefore + 1);
    expect(state.players["P1"]!.orderHand).toEqual(expect.arrayContaining(displayed));
  });

  it("uses Colour Samples only from its three private Main Orders", () => {
    const { state: initial, rng } = startedGame(2, 1311);
    let state = structuredClone(initial);
    addTechnique(state, "P1", "T10");
    state = mustApply(state, "P1", {
      type: "BEGIN_OFFICE_ORDERS", workerId: workerId(state, "P1", "apprentice"), mode: "take_one",
    }, rng);
    expect(state.phase).toEqual(expect.objectContaining({ type: "work_office_orders", step: "colour_samples_or_skip" }));
    state = mustApply(state, "P1", { type: "OFFICE_USE_COLOUR_SAMPLES", deck: "market" }, rng);
    if (state.phase.type !== "work_office_orders" || state.phase.colourSamplesChoices === undefined) throw new Error("Missing Colour Samples choices");
    const choices = [...state.phase.colourSamplesChoices];
    const publicOrder = state.marketDisplay[0]!;
    expectError(applyAction(state, "P1", { type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER", orderId: publicOrder }, rng), "INVALID_SELECTION");
    state = mustApply(state, "P1", {
      type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER", orderId: choices[1]!, bottomOrderIds: [choices[2]!, choices[0]!],
    }, rng);
    expect(state.players["P1"]!.orderHand).toContain(choices[1]);
    expect(state.marketDeck.slice(-2)).toEqual([choices[2], choices[0]]);
  });

  it("rejects obsolete blind draws and non-Main Colour Samples at the engine boundary", () => {
    const { state: initial, rng } = startedGame(2, 1317);
    let state = structuredClone(initial);
    addTechnique(state, "P1", "T10");
    state = mustApply(state, "P1", {
      type: "BEGIN_OFFICE_ORDERS",
      workerId: workerId(state, "P1", "apprentice"),
      mode: "take_one",
    }, rng);
    expectError(applyAction(state, "P1", {
      type: "OFFICE_DRAW_BLIND_ORDER",
      deck: "market",
    } as never, rng), "INVALID_ACTION");
    expectError(applyAction(state, "P1", {
      type: "OFFICE_USE_COLOUR_SAMPLES",
      deck: "imperial",
    } as never, rng), "ORDER_NOT_AVAILABLE");
  });

  it("unlocks the chosen private space with the first Advanced Tech and the other with the second", () => {
    const { state: initial, rng } = startedGame(2, 1312);
    let state = structuredClone(initial);
    state.players["P1"]!.resources.coins = 10;
    const firstId = state.techniqueDisplay.forming[0]!;
    state = mustApply(state, "P1", {
      type: "BEGIN_GUILD_ACTION", workerId: workerId(state, "P1", "apprentice"),
    }, rng);
    state = mustApply(state, "P1", { type: "GUILD_BUY_TECHNIQUE", techniqueId: firstId, unlockWorkshop: "potters_wheel" }, rng);
    expect(state.players["P1"]!.workshopSpaces).toEqual({ pottersWheelUnlocked: 2, glazeDecorationUnlocked: 1 });

    setWorkTurn(state, "P1");
    const secondId = state.techniqueDisplay.glazing[0]!;
    state = mustApply(state, "P1", {
      type: "BEGIN_GUILD_ACTION", workerId: workerId(state, "P1", "apprentice"),
    }, rng);
    state = mustApply(state, "P1", { type: "GUILD_BUY_TECHNIQUE", techniqueId: secondId }, rng);
    expect(state.players["P1"]!.workshopSpaces).toEqual({ pottersWheelUnlocked: 2, glazeDecorationUnlocked: 2 });
    expect(state.players["P1"]!.techniques).toHaveLength(2);

    setWorkTurn(state, "P1");
    state.actionBoard.placements.guild_academy = [];
    expectError(applyAction(state, "P1", {
      type: "BEGIN_GUILD_ACTION", workerId: workerId(state, "P1", "shifu"),
    }, rng), "TECHNIQUE_LIMIT");
  });

  it("refreshes an entire discipline and applies the Shifu Advanced-Tech discount", () => {
    const { state: initial, rng } = startedGame(2, 1313);
    let state = structuredClone(initial);
    state.players["P1"]!.resources.coins = 10;
    const oldDisplay = [...state.techniqueDisplay.firing];
    const expectedNew = state.techniqueDecks.firing.slice(0, 2);
    state = mustApply(state, "P1", {
      type: "BEGIN_GUILD_ACTION", workerId: workerId(state, "P1", "shifu"),
    }, rng);
    state = mustApply(state, "P1", { type: "GUILD_REFRESH_TECHNIQUE", techniqueId: oldDisplay[0]! }, rng);
    expect(state.techniqueDisplay.firing).toEqual(expectedNew);
    const selected = state.techniqueDisplay.firing[0]!;
    const printed = [
      ...state.techniqueDisplay.firing,
    ].includes(selected) ? 3 : 0;
    const before = state.players["P1"]!.resources.coins;
    const result = mustResult(state, "P1", {
      type: "GUILD_BUY_TECHNIQUE", techniqueId: selected, unlockWorkshop: "glaze_decoration",
    }, rng);
    state = result.state;
    const acquired = result.events.find((event) => event.type === "TECHNIQUE_ACQUIRED");
    expect(acquired).toEqual(expect.objectContaining({ techniqueId: selected, cost: printed - 1 }));
    expect(state.players["P1"]!.resources.coins).toBe(before - (printed - 1));
  });

  it("pays Labour at 2 Coins for an Apprentice and 4 for a Shifu", () => {
    const { state: initial, rng } = startedGame(2, 1314);
    let state = structuredClone(initial);
    const p1Before = state.players["P1"]!.resources.coins;
    state = mustApply(state, "P1", { type: "USE_LABOUR", workerId: workerId(state, "P1", "apprentice") }, rng);
    expect(state.players["P1"]!.resources.coins).toBe(p1Before + 2);
    setWorkTurn(state, "P2");
    const p2Before = state.players["P2"]!.resources.coins;
    state = mustApply(state, "P2", { type: "USE_LABOUR", workerId: workerId(state, "P2", "shifu") }, rng);
    expect(state.players["P2"]!.resources.coins).toBe(p2Before + 4);
  });
});
