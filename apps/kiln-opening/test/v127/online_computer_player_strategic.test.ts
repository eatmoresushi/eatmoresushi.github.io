import { describe, expect, it } from "vitest";
import { activeKilnSpaceIds } from "../../src/game/index.ts";
import type { GameAction, GameState, PlayerId } from "../../src/game/index.ts";
import {
  ONLINE_COMPUTER_POLICY_VERSION,
  chooseOnlineComputerAction,
} from "../../src/multiplayer/computerPlayer.ts";
import { createComputerObservation } from "../../src/multiplayer/computerObservation.ts";
import { fallbackComputerCommands } from "../../src/multiplayer/computerFallback.ts";
import type { StoredSeat } from "../../src/multiplayer/types.ts";
import {
  addGlazed,
  addLoaded,
  addShaped,
  addTechnique,
  mustApply,
  setWorkTurn,
  startedGame,
} from "./helpers.ts";

function seatFor(playerId: PlayerId): StoredSeat {
  return {
    seatId: `seat-${playerId}`,
    roomId: "strategic-policy",
    playerId,
    seatIndex: 0,
    displayName: "Computer",
    colour: "cinnabar",
    isHost: true,
    isComputer: true,
    aiPolicyVersion: ONLINE_COMPUTER_POLICY_VERSION,
    authUserId: null,
    aiSeed: 17,
    aiCreatedCommandId: "strategic-policy-command",
  };
}

async function choose(state: GameState, playerId: PlayerId = "P1"): Promise<GameAction> {
  const command = await chooseOnlineComputerAction(
    createComputerObservation(state, playerId),
    seatFor(playerId),
  );
  if (command.type === "SUBMIT_WOOD_CONTRIBUTION") {
    throw new Error("Unexpected Contribution command in a deterministic policy fixture");
  }
  return command;
}

function closeGuild(state: GameState): void {
  state.techniqueDisplay = { forming: [], glazing: [], firing: [] };
}

describe("V1.4 strategic computer policy: amended Imperial Court", () => {
  it.each([4, 5])("chooses Court only when it can pay five Coins (holding %i)", async (coins) => {
    const { state, rng } = startedGame(2, 4_940);
    const player = state.players["P1"]!;
    player.resources = { clay: 0, wood: 6, coins };
    player.imperialRecognition = 1;
    state.marketDisplay = [];
    state.marketDeck = [];
    state.marketDiscard = [];
    closeGuild(state);
    setWorkTurn(state, "P1");

    const action = await choose(state);
    expect(action.type).toBe(coins === 5 ? "USE_COURT_PATRONAGE" : "USE_LABOUR");
    const next = mustApply(state, "P1", action, rng);
    expect(next.players["P1"]!.imperialRecognition).toBe(coins === 5 ? 2 : 1);
    if (coins === 5) expect(next.players["P1"]!.resources.coins).toBe(0);
  });
});

describe("V1.4 strategic computer policy: Dipping Vats", () => {
  function fixture(coins: number) {
    const { state, rng } = startedGame(2, 4_950);
    const player = state.players["P1"]!;
    player.resources = { clay: 0, wood: 0, coins };
    player.orderHand = ["S01"];
    state.marketDisplay = [];
    closeGuild(state);
    addTechnique(state, "P1", "T03");
    setWorkTurn(state, "P1");
    return { state, rng };
  }

  it("loads two Plain ceramics with a Shifu and no Coins", async () => {
    const { state, rng } = fixture(0);
    addShaped(state, "P1", "bowl");
    addShaped(state, "P1", "bowl");
    const action = await choose(state);
    expect(action).toMatchObject({ type: "USE_KILN_YARD", useDippingVats: true });
    if (action.type !== "USE_KILN_YARD") throw new Error("Expected Kiln Yard");
    expect(action.loads).toHaveLength(2);
    expect(state.players["P1"]!.workers[action.workerId]?.kind).toBe("shifu");
    const next = mustApply(state, "P1", action, rng);
    expect(next.players["P1"]!.resources.coins).toBe(0);
    expect(next.players["P1"]!.techniques).toContainEqual({ id: "T03", exhausted: true });
  });

  it.each([0, 1])("charges only the decorated ceramic in a mixed batch with %i Coins", async (coins) => {
    const { state, rng } = fixture(coins);
    const decorated = addGlazed(state, "P1", "bowl", "white", "carved");
    const plain = addShaped(state, "P1", "bowl");
    const action = await choose(state);
    expect(action).toMatchObject({ type: "USE_KILN_YARD", useDippingVats: true });
    if (action.type !== "USE_KILN_YARD") throw new Error("Expected Kiln Yard");
    expect(action.loads.map((load) => load.ceramicId)).toEqual(coins === 0 ? [plain.id] : [plain.id, decorated.id]);
    const next = mustApply(state, "P1", action, rng);
    expect(next.players["P1"]!.resources.coins).toBe(0);
  });

  it("preserves Dipping Vats when loading only a decorated ceramic", async () => {
    const { state, rng } = fixture(1);
    addGlazed(state, "P1", "bowl", "white", "carved");
    const action = await choose(state);
    expect(action.type).toBe("USE_KILN_YARD");
    expect(action).not.toHaveProperty("useDippingVats");
    const next = mustApply(state, "P1", action, rng);
    expect(next.players["P1"]!.resources.coins).toBe(0);
    expect(next.players["P1"]!.techniques).toContainEqual({ id: "T03", exhausted: false });
  });

  it.each(["shared", "imperial"] as const)("offers legal free fallback loading into the %s kiln", (destination) => {
    const { state, rng } = fixture(0);
    if (destination === "imperial") {
      state.players["P1"]!.imperialRecognition = 2;
      state.players["P1"]!.imperialKilnUnlocked = true;
      for (const spaceId of activeKilnSpaceIds(state.playerCount)) addLoaded(state, "P2", "bowl", "white", "plain", spaceId);
    }
    const plain = addShaped(state, "P1", "bowl");
    const loads = fallbackComputerCommands(createComputerObservation(state, "P1"))
      .filter((action) => action.type === "USE_KILN_YARD");
    expect(loads.length).toBeGreaterThan(0);
    for (const action of loads) {
      expect(action.useDippingVats).toBe(true);
      expect(action.loads[0]?.ceramicId).toBe(plain.id);
      if (destination === "imperial") expect(action.loads[0]?.kilnSpaceId).toBe("imperial");
      const next = mustApply(state, "P1", action, rng);
      expect(next.players["P1"]!.resources.coins).toBe(0);
    }
    state.players["P1"]!.techniques.find((technique) => technique.id === "T03")!.exhausted = true;
    expect(fallbackComputerCommands(createComputerObservation(state, "P1")).some((action) => action.type === "USE_KILN_YARD")).toBe(false);
  });
});

describe("V1.4 strategic computer policy: Shifu free Decoration", () => {
  it.each([
    { coins: 0, carvingKnives: false, count: 1, paid: 0 },
    { coins: 1, carvingKnives: false, count: 1, paid: 0 },
    { coins: 2, carvingKnives: false, count: 2, paid: 2 },
    { coins: 3, carvingKnives: false, count: 2, paid: 2 },
    { coins: 0, carvingKnives: true, count: 2, paid: 0 },
    { coins: 1, carvingKnives: true, count: 2, paid: 0 },
  ])("decorates $count Carved vessels with $coins Coins and Carving Knives=$carvingKnives", async ({ coins, carvingKnives, count, paid }) => {
    const { state: initial, rng } = startedGame(2, 4_941);
    const state = structuredClone(initial);
    const player = state.players["P1"]!;
    player.startingTechniqueId = "ST01";
    player.orderHand = ["O38"];
    player.resources = { clay: 0, wood: 0, coins };
    if (carvingKnives) addTechnique(state, "P1", "T07");
    addShaped(state, "P1", "plate");
    addShaped(state, "P1", "washer");
    closeGuild(state);
    setWorkTurn(state, "P1");

    const action = await choose(state);
    if (count === 0) {
      expect(action.type).not.toBe("DECORATE_CERAMICS");
      return;
    }
    expect(action.type).toBe("DECORATE_CERAMICS");
    if (action.type !== "DECORATE_CERAMICS") throw new Error("Expected glazing");
    expect(player.workers[action.workerId]?.kind).toBe("shifu");
    expect(action.selections).toHaveLength(count);
    expect(action.selections.every(({ decoration }) => decoration === "carved")).toBe(true);
    expect(action).not.toHaveProperty("freeDecorationCeramicId");

    const resolved = mustApply(state, "P1", action, rng);
    expect(resolved.players["P1"]!.resources.coins).toBe(coins - paid);
    expect(Object.values(resolved.ceramics).filter((ceramic) => ceramic.stage === "workshop" && ceramic.decoration === "carved")).toHaveLength(count);
    if (carvingKnives) expect(resolved.players["P1"]!.techniques).toContainEqual({ id: "T07", exhausted: true });
  });

  it.each([0, 1])("fallback can decorate one Plain vessel free with a Shifu holding %i Coins", (coins) => {
    const { state: initial, rng } = startedGame(2, 4_942);
    const state = structuredClone(initial);
    state.players["P1"]!.resources = { clay: 0, wood: 0, coins };
    const ceramic = addShaped(state, "P1", "bowl");
    setWorkTurn(state, "P1");

    const commands = fallbackComputerCommands(createComputerObservation(state, "P1"));
    const glazeCommands = commands.filter((command) => command.type === "DECORATE_CERAMICS");
    expect(glazeCommands).toHaveLength(1);
    const action = glazeCommands.find(({ workerId }) => state.players["P1"]!.workers[workerId]?.kind === "shifu")!;
    expect(state.players["P1"]!.workers[action.workerId]?.kind).toBe("shifu");
    expect(action).not.toHaveProperty("freeDecorationCeramicId");
    const resolved = mustApply(state, "P1", action, rng);
    expect(resolved.players["P1"]!.resources.coins).toBe(coins);
    expect(resolved.ceramics[ceramic.id]?.stage).toBe("workshop");
  });
});

describe("V1.4 strategic computer policy: Starting Techs and Ding", () => {
  it("uses Prepared Clay when a Materials Yard gain can pay its surcharge", async () => {
    const { state: initial, rng } = startedGame(2, 4_901);
    const state = structuredClone(initial);
    state.players["P1"]!.startingTechniqueId = "ST01";
    state.players["P1"]!.resources = { clay: 0, wood: 0, coins: 0 };
    state.players["P1"]!.orderHand = [];
    state.marketDisplay = [];
    state.marketDeck = [];
    state.marketDiscard = [];
    setWorkTurn(state, "P1");

    const action = await choose(state);
    expect(action).toEqual(expect.objectContaining({
      type: "GAIN_MATERIALS",
      preparedClayShape: "bowl",
    }));

    const resolved = mustApply(state, "P1", action, rng);
    expect(Object.values(resolved.ceramics)).toContainEqual(expect.objectContaining({
      ownerId: "P1",
      shape: "bowl",
      stage: "workshop",
    }));
  });

  it("uses White Slip on a newly formed vessel when its Order calls for Painted", async () => {
    const { state: initial, rng } = startedGame(2, 4_902);
    const state = structuredClone(initial);
    state.players["P1"]!.startingTechniqueId = "ST02";
    state.players["P1"]!.orderHand = ["O17"];
    state.players["P1"]!.resources = { clay: 2, wood: 0, coins: 2 };
    closeGuild(state);
    setWorkTurn(state, "P1");

    const action = await choose(state);
    expect(action).toEqual(expect.objectContaining({
      type: "FORM_CERAMICS",
      shapes: expect.arrayContaining(["washer"]),
      whiteSlip: { formedIndex: 0 },
    }));

    const resolved = mustApply(state, "P1", action, rng);
    expect(Object.values(resolved.ceramics)).toContainEqual(expect.objectContaining({
      ownerId: "P1",
      shape: "washer",
      stage: "workshop",
      decoration: "painted",
    }));
  });

  it("uses Rapid Drying to glaze and load a ceramic decorated by the same action", async () => {
    const { state: initial, rng } = startedGame(2, 4_903);
    const state = structuredClone(initial);
    state.players["P1"]!.startingTechniqueId = "ST03";
    state.players["P1"]!.orderHand = ["O23"];
    state.players["P1"]!.resources = { clay: 0, wood: 1, coins: 1 };
    const shaped = addShaped(state, "P1", "vase");
    closeGuild(state);
    setWorkTurn(state, "P1");

    const action = await choose(state);
    expect(action).toEqual(expect.objectContaining({
      type: "DECORATE_CERAMICS",
      rapidDrying: expect.objectContaining({ ceramicId: shaped.id }),
    }));

    const resolved = mustApply(state, "P1", action, rng);
    expect(resolved.ceramics[shaped.id]).toEqual(expect.objectContaining({
      stage: "loaded",
      glaze: "grey_green",
    }));
    expect(resolved.players["P1"]!.resources.wood).toBe(0);
  });

  it("takes Ding's paid extra vessel when the chosen Shape is eligible and affordable", async () => {
    const { state: initial, rng } = startedGame(2, 4_904);
    const state = structuredClone(initial);
    state.players["P1"]!.kilnId = "DI";
    state.players["P1"]!.kilnAbilityUsedThisRound = false;
    state.players["P1"]!.startingTechniqueId = "ST03";
    state.players["P1"]!.orderHand = [];
    state.players["P1"]!.resources = { clay: 3, wood: 0, coins: 0 };
    setWorkTurn(state, "P1");

    const action = await choose(state);
    expect(action).toEqual(expect.objectContaining({
      type: "FORM_CERAMICS",
      dingExtraShape: expect.any(String),
    }));
    if (action.type !== "FORM_CERAMICS" || action.dingExtraShape === undefined) return;
    expect(action.shapes).toContain(action.dingExtraShape);

    const resolved = mustApply(state, "P1", action, rng);
    expect(Object.values(resolved.ceramics).filter(({ ownerId }) => ownerId === "P1")).toHaveLength(
      action.shapes.length + 1,
    );
    expect(resolved.players["P1"]!.kilnAbilityUsedThisRound).toBe(true);
  });
});

describe("V1.4 strategic computer policy: route-repair Techs", () => {
  it("uses Reworking Table when changing Shape closes an Order-route deficit", async () => {
    const { state: initial, rng } = startedGame(2, 4_911);
    const state = structuredClone(initial);
    addTechnique(state, "P1", "T05");
    state.players["P1"]!.orderHand = ["O23"];
    state.players["P1"]!.resources = { clay: 0, wood: 0, coins: 1 };
    const bowl = addShaped(state, "P1", "bowl");
    closeGuild(state);
    setWorkTurn(state, "P1");

    const action = await choose(state);
    expect(action).toEqual(expect.objectContaining({
      type: "DECORATE_CERAMICS",
      useTechniqueIds: expect.arrayContaining(["T05"]),
      selections: [expect.objectContaining({ ceramicId: bowl.id, newShape: "vase" })],
    }));

    const resolved = mustApply(state, "P1", action, rng);
    expect(resolved.ceramics[bowl.id]).toEqual(expect.objectContaining({
      shape: "vase",
      stage: "workshop",
    }));
    expect(resolved.players["P1"]!.techniques).toContainEqual({ id: "T05", exhausted: true });
  });

  it("uses Glaze Palette at the end of Work on an already loaded ceramic", async () => {
    const { state: initial, rng } = startedGame(2, 4_912);
    const state = structuredClone(initial);
    addTechnique(state, "P1", "T06");
    state.players["P1"]!.orderHand = ["O30"];
    state.players["P1"]!.resources = { clay: 0, wood: 0, coins: 2 };
    const wrongGlaze = addLoaded(state, "P1", "washer", "celadon", "plain", "middle_1");
    state.phase = { type: "work_glaze_palette", queue: { actors: ["P1"], currentIndex: 0 } };

    const action = await choose(state);
    expect(action.type).toBe("RESOLVE_GLAZE_PALETTE");
    if (action.type !== "RESOLVE_GLAZE_PALETTE") throw new Error("Expected palette choice");
    expect(action.ceramicId).toBe(wrongGlaze.id);
    expect(["white", "moon_white"]).toContain(action.glaze);

    const resolved = mustApply(state, "P1", action, rng);
    expect(resolved.ceramics[wrongGlaze.id]).toEqual(expect.objectContaining({
      stage: "loaded",
      glaze: action.glaze,
    }));
    expect(resolved.players["P1"]!.techniques).toContainEqual({ id: "T06", exhausted: true });
  });
});

describe("V1.4 strategic computer policy: firing placement", () => {
  it("uses Kiln Furniture when only a forced zone is available for neutral heat", async () => {
    const { state: initial, rng } = startedGame(2, 4_921);
    const state = structuredClone(initial);
    addTechnique(state, "P1", "T15");
    const ceramic = addGlazed(state, "P1", "bowl", "celadon", "plain");
    addLoaded(state, "P2", "plate", "celadon", "plain", "middle_1");
    addLoaded(state, "P2", "washer", "celadon", "plain", "middle_2");
    state.players["P1"]!.orderHand = [];
    setWorkTurn(state, "P1");

    const action = await choose(state);
    expect(action).toEqual(expect.objectContaining({
      type: "USE_KILN_YARD",
      loads: [expect.objectContaining({ ceramicId: ceramic.id, useKilnFurniture: true })],
    }));

    const resolved = mustApply(state, "P1", action, rng);
    expect(resolved.ceramics[ceramic.id]).toEqual(expect.objectContaining({
      stage: "loaded",
      kilnFurnitureUsed: true,
    }));
    expect(resolved.players["P1"]!.techniques).toContainEqual({ id: "T15", exhausted: true });
  });

  it("cools the marked ceramic even when neighbouring spaces are occupied and no Wood remains", async () => {
    const { state: initial, rng } = startedGame(2, 4_922);
    const state = structuredClone(initial);
    const ceramic = addLoaded(state, "P1", "bowl", "celadon", "plain", "high_1");
    state.players["P1"]!.kilnYardShifuUsedThisRound = true;
    state.players["P1"]!.kilnYardShifuCeramicId = ceramic.id;
    state.players["P1"]!.resources.wood = 0;
    addLoaded(state, "P2", "plate", "white", "plain", "middle_1");
    state.firingContext = {
      round: state.round,
      contributors: ["P1"],
      contributions: { P1: "TEND" },
      baseHeat: 2,
      fireModifier: null,
      globalHeat: null,
      kilnYardShifuAdjustments: [],
      ceramicResults: {},
    };
    state.phase = { type: "firing_shifu_adjustment", queue: { actors: ["P1"], currentIndex: 0 } };

    const action = await choose(state);
    expect(action).toEqual({
      type: "RESOLVE_KILN_YARD_ADJUSTMENT",
      ceramicId: ceramic.id,
      adjustment: -1,
    });
    const resolved = mustApply(state, "P1", action, rng);
    expect(resolved.ceramics[ceramic.id]).toMatchObject({ kilnSpaceId: "high_1", shifuHeatAdjustment: -1 });
    expect(resolved.players["P1"]!.resources.wood).toBe(0);
  });

  it("can add heat to a ceramic carrying Kiln Furniture", async () => {
    const { state, rng } = startedGame(2, 4_923);
    const ceramic = addLoaded(state, "P1", "bowl", "grey_green", "plain", "low_1");
    ceramic.kilnFurnitureUsed = true;
    state.players["P1"]!.kilnYardShifuUsedThisRound = true;
    state.players["P1"]!.kilnYardShifuCeramicId = ceramic.id;
    state.firingContext = {
      round: state.round, contributors: ["P1"], contributions: { P1: "TEND" },
      baseHeat: 2, fireModifier: null, globalHeat: null,
      kilnYardShifuAdjustments: [], ceramicResults: {},
    };
    state.phase = { type: "firing_shifu_adjustment", queue: { actors: ["P1"], currentIndex: 0 } };
    const action = await choose(state);
    expect(action).toEqual({ type: "RESOLVE_KILN_YARD_ADJUSTMENT", ceramicId: ceramic.id, adjustment: 1 });
    expect(mustApply(state, "P1", action, rng).ceramics[ceramic.id]).toMatchObject({
      kilnSpaceId: "low_1", kilnFurnitureUsed: true, shifuHeatAdjustment: 1,
    });
  });
});

describe("V1.4 strategic computer policy: audited timing and limits", () => {
  it("discards an owned Flawed firing result when the 2-Coin salvage is available", async () => {
    const { state: initial, rng } = startedGame(2, 4_931);
    const state = structuredClone(initial);
    const ceramic = addLoaded(state, "P1", "bowl", "white", "plain", "high_1");
    state.firingContext = {
      round: state.round,
      contributors: ["P1"],
      contributions: { P1: "TEND" },
      baseHeat: 2,
      fireModifier: 0,
      globalHeat: 2,
      kilnYardShifuAdjustments: [],
      ceramicResults: {
        [ceramic.id]: {
          ceramicId: ceramic.id,
          zoneModifier: 1,
          naturalActualHeat: 5,
          naturalHeatDifference: 4,
          naturalExactMatch: false,
          finalActualHeat: 5,
          finalHeatDifference: 4,
          forcedQuality: null,
          assignedQuality: "flawed",
        },
      },
    };
    state.phase = { type: "firing_workshop_seconds", queue: { actors: ["P1"], currentIndex: 0 } };

    const action = await choose(state);
    expect(action).toEqual({ type: "RESOLVE_WORKSHOP_SECONDS", ceramicId: ceramic.id });

    const coinsBefore = state.players["P1"]!.resources.coins;
    const resolved = mustApply(state, "P1", action, rng);
    expect(resolved.ceramics[ceramic.id]).toBeUndefined();
    expect(resolved.players["P1"]!.resources.coins).toBe(coinsBefore + 2);
  });

  it("uses its private Test Pieces peek when choosing a heat marker or declining", async () => {
    const { state: initial } = startedGame(2, 4_932);
    const state = structuredClone(initial);
    const ceramic = addLoaded(state, "P1", "bowl", "celadon", "plain", "middle_1");
    state.players["P1"]!.kilnYardShifuUsedThisRound = true;
    state.players["P1"]!.kilnYardShifuCeramicId = ceramic.id;
    state.firingContext = {
      round: state.round,
      contributors: ["P1"],
      contributions: { P1: "TEND" },
      baseHeat: 2,
      fireModifier: null,
      globalHeat: null,
      kilnYardShifuAdjustments: [],
      ceramicResults: {},
    };
    state.phase = { type: "firing_shifu_adjustment", queue: { actors: ["P1"], currentIndex: 0 } };

    // Without private knowledge, Middle is already exact for Celadon at Base Heat 2.
    expect(await choose(state)).toEqual({
      type: "RESOLVE_KILN_YARD_ADJUSTMENT",
      ceramicId: null,
      adjustment: null,
    });

    // A privately seen +1 Fire card makes a -1 marker restore an exact match.
    state.privateFirePeeks = { P1: 1 };
    expect(await choose(state)).toEqual({
      type: "RESOLVE_KILN_YARD_ADJUSTMENT",
      ceramicId: ceramic.id,
      adjustment: -1,
    });
  });

  it("reserves a fourth Main Order during Work and leaves hand-limit cleanup until later", async () => {
    const { state: initial, rng } = startedGame(2, 4_933);
    const state = structuredClone(initial);
    state.players["P1"]!.resources = { clay: 0, wood: 0, coins: 0 };
    state.players["P1"]!.orderHand = ["S01", "S02", "S03"];
    state.marketDisplay = ["O01", "O43", "O44", "O45", "O46"];
    closeGuild(state);
    setWorkTurn(state, "P1");

    const begin = await choose(state);
    expect(begin).toEqual(expect.objectContaining({
      type: "BEGIN_OFFICE_ORDERS",
      mode: "take_one",
    }));
    const opened = mustApply(state, "P1", begin, rng);

    const reserve = await choose(opened);
    expect(reserve).toEqual({ type: "OFFICE_TAKE_ORDER", orderId: "O01" });
    const reserved = mustApply(opened, "P1", reserve, rng);
    expect(reserved.players["P1"]!.orderHand).toHaveLength(4);
    expect(reserved.players["P1"]!.orderHand).toContain("O01");
  });
});
