import { describe, expect, it } from "vitest";
import type { GameAction, GameState, PlayerId } from "../../src/game/index.ts";
import {
  ONLINE_COMPUTER_POLICY_VERSION,
  chooseOnlineComputerAction,
} from "../../src/multiplayer/computerPlayer.ts";
import { createComputerObservation } from "../../src/multiplayer/computerObservation.ts";
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

describe("V1.2.7 strategic computer policy: Starting Techs and Ding", () => {
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
      stage: "shaped",
    }));
  });

  it("uses White Slip on a newly formed vessel when its Order calls for White", async () => {
    const { state: initial, rng } = startedGame(2, 4_902);
    const state = structuredClone(initial);
    state.players["P1"]!.startingTechniqueId = "ST02";
    state.players["P1"]!.orderHand = ["O21"];
    state.players["P1"]!.resources = { clay: 2, wood: 0, coins: 1 };
    closeGuild(state);
    setWorkTurn(state, "P1");

    const action = await choose(state);
    expect(action).toEqual(expect.objectContaining({
      type: "FORM_CERAMICS",
      shapes: expect.arrayContaining(["plate"]),
      whiteSlip: { formedIndex: 0 },
    }));

    const resolved = mustApply(state, "P1", action, rng);
    expect(Object.values(resolved.ceramics)).toContainEqual(expect.objectContaining({
      ownerId: "P1",
      shape: "plate",
      stage: "glazed",
      glaze: "white",
      decoration: "plain",
    }));
  });

  it("uses Rapid Drying to load a ceramic glazed by the same action", async () => {
    const { state: initial, rng } = startedGame(2, 4_903);
    const state = structuredClone(initial);
    state.players["P1"]!.startingTechniqueId = "ST03";
    state.players["P1"]!.orderHand = ["O04"];
    state.players["P1"]!.resources = { clay: 0, wood: 1, coins: 1 };
    const shaped = addShaped(state, "P1", "vase");
    closeGuild(state);
    setWorkTurn(state, "P1");

    const action = await choose(state);
    expect(action).toEqual(expect.objectContaining({
      type: "GLAZE_CERAMICS",
      rapidDrying: expect.objectContaining({ ceramicId: shaped.id }),
    }));

    const resolved = mustApply(state, "P1", action, rng);
    expect(resolved.ceramics[shaped.id]).toEqual(expect.objectContaining({
      stage: "loaded",
      glaze: "moon_white",
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

describe("V1.2.7 strategic computer policy: route-repair Techs", () => {
  it("uses Reworking Table when changing Shape closes an Order-route deficit", async () => {
    const { state: initial, rng } = startedGame(2, 4_911);
    const state = structuredClone(initial);
    addTechnique(state, "P1", "T05");
    state.players["P1"]!.orderHand = ["O04"];
    state.players["P1"]!.resources = { clay: 0, wood: 0, coins: 1 };
    const bowl = addShaped(state, "P1", "bowl");
    closeGuild(state);
    setWorkTurn(state, "P1");

    const action = await choose(state);
    expect(action).toEqual(expect.objectContaining({
      type: "GLAZE_CERAMICS",
      useTechniqueIds: expect.arrayContaining(["T05"]),
      selections: [expect.objectContaining({ ceramicId: bowl.id, newShape: "vase" })],
    }));

    const resolved = mustApply(state, "P1", action, rng);
    expect(resolved.ceramics[bowl.id]).toEqual(expect.objectContaining({
      shape: "vase",
      stage: "glazed",
    }));
    expect(resolved.players["P1"]!.techniques).toContainEqual({ id: "T05", exhausted: true });
  });

  it("uses Glaze Palette to change a ceramic immediately before loading", async () => {
    const { state: initial, rng } = startedGame(2, 4_912);
    const state = structuredClone(initial);
    addTechnique(state, "P1", "T06");
    state.players["P1"]!.orderHand = ["O30"];
    state.players["P1"]!.resources = { clay: 0, wood: 0, coins: 2 };
    const wrongGlaze = addGlazed(state, "P1", "washer", "celadon", "plain");
    setWorkTurn(state, "P1");

    const action = await choose(state);
    expect(action.type).toBe("USE_KILN_YARD");
    if (action.type !== "USE_KILN_YARD") throw new Error("Expected loading");
    const load = action.loads.find(({ ceramicId }) => ceramicId === wrongGlaze.id)!;
    expect(["white", "moon_white"]).toContain(load.glazePalette);

    const resolved = mustApply(state, "P1", action, rng);
    expect(resolved.ceramics[wrongGlaze.id]).toEqual(expect.objectContaining({
      stage: "loaded",
      glaze: load.glazePalette,
    }));
    expect(resolved.players["P1"]!.techniques).toContainEqual({ id: "T06", exhausted: true });
  });
});

describe("V1.2.7 strategic computer policy: firing placement", () => {
  it("uses Kiln Furniture when only a forced zone is available for neutral heat", async () => {
    const { state: initial, rng } = startedGame(2, 4_921);
    const state = structuredClone(initial);
    addTechnique(state, "P1", "T15");
    const ceramic = addGlazed(state, "P1", "bowl", "celadon", "plain");
    addLoaded(state, "P2", "plate", "celadon", "plain", "middle_1");
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

  it("moves the marked ceramic when Base Heat makes a neighbouring zone strictly better", async () => {
    const { state: initial } = startedGame(2, 4_922);
    const state = structuredClone(initial);
    const ceramic = addLoaded(state, "P1", "bowl", "celadon", "plain", "high_1");
    state.players["P1"]!.kilnYardShifuUsedThisRound = true;
    state.players["P1"]!.kilnYardShifuCeramicId = ceramic.id;
    state.firingContext = {
      round: state.round,
      contributors: ["P1"],
      contributions: { P1: "TEND" },
      fuelLedgerUpgradedBy: [],
      baseHeat: 2,
      fireModifier: null,
      globalHeat: null,
      kilnYardShifuRepositions: [],
      ceramicResults: {},
    };
    state.phase = { type: "firing_reposition", queue: { actors: ["P1"], currentIndex: 0 } };

    expect(await choose(state)).toEqual({
      type: "RESOLVE_KILN_YARD_REPOSITION",
      ceramicId: ceramic.id,
      toSpaceId: "middle_1",
    });
  });
});

describe("V1.2.7 strategic computer policy: audited timing and limits", () => {
  it("discards an owned Flawed firing result when the 2-Coin salvage is available", async () => {
    const { state: initial, rng } = startedGame(2, 4_931);
    const state = structuredClone(initial);
    const ceramic = addLoaded(state, "P1", "bowl", "white", "plain", "high_1");
    state.firingContext = {
      round: state.round,
      contributors: ["P1"],
      contributions: { P1: "TEND" },
      fuelLedgerUpgradedBy: [],
      baseHeat: 2,
      fireModifier: 0,
      globalHeat: 2,
      kilnYardShifuRepositions: [],
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

  it("uses its private Test Pieces peek when deciding whether and where to reposition", async () => {
    const { state: initial } = startedGame(2, 4_932);
    const state = structuredClone(initial);
    const ceramic = addLoaded(state, "P1", "bowl", "celadon", "plain", "middle_1");
    state.players["P1"]!.kilnYardShifuUsedThisRound = true;
    state.players["P1"]!.kilnYardShifuCeramicId = ceramic.id;
    state.firingContext = {
      round: state.round,
      contributors: ["P1"],
      contributions: { P1: "TEND" },
      fuelLedgerUpgradedBy: [],
      baseHeat: 2,
      fireModifier: null,
      globalHeat: null,
      kilnYardShifuRepositions: [],
      ceramicResults: {},
    };
    state.phase = { type: "firing_reposition", queue: { actors: ["P1"], currentIndex: 0 } };

    // Without private knowledge, Middle is already exact for Celadon at Base Heat 2.
    expect(await choose(state)).toEqual({
      type: "RESOLVE_KILN_YARD_REPOSITION",
      ceramicId: null,
      toSpaceId: null,
    });

    // A privately seen +1 Fire card makes Low the exact neighbouring zone instead.
    state.privateFirePeeks = { P1: 1 };
    expect(await choose(state)).toEqual({
      type: "RESOLVE_KILN_YARD_REPOSITION",
      ceramicId: ceramic.id,
      toSpaceId: "low_1",
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
