import { describe, expect, it } from "vitest";
import { FIRING, MAIN_ORDER_IDS, ORDER_IDS, STARTING_ORDER_IDS, TECH_IDS } from "../../../src/game/content.ts";
import type { GamePhase, GameState } from "../../../src/game/types.ts";
import {
  buildState,
  cardZones,
  giveTech,
  setDisplay,
  setHand,
  setResources,
  stageCeramic,
} from "./support/fixtures.ts";

function expectConserved(state: GameState): void {
  const zones = cardZones(state);
  expect([...zones.orders].sort()).toEqual([...ORDER_IDS].sort());
  expect([...zones.techs].sort()).toEqual([...TECH_IDS].sort());
  expect([...zones.fire].sort((a, b) => a - b)).toEqual([...FIRING.fireDeck].sort((a, b) => a - b));
}

describe("buildState", () => {
  it("builds a complete default 2-player state in the First Player's Work turn", () => {
    const state = buildState();
    expect(state.playerOrder).toEqual(["p1", "p2"]);
    expect(state.phase).toEqual({ type: "work_turn", activePlayerId: "p1", step: { kind: "before_action" } });
    expect(state.market.display).toEqual(MAIN_ORDER_IDS.slice(0, 6));
    expect(state.hidden.mainDeck).toHaveLength(42);
    expect(state.hidden.startingBox).toEqual(STARTING_ORDER_IDS);
    expect(state.techDisplay).toEqual({ workshop: ["T01", "T16"], glazing_loading: ["T10", "T20"], firing: ["T11", "T12"] });
    expect(state.hidden.fireDeck).toHaveLength(12);
    expect(state.players["p1"]?.resources).toEqual({ clay: 2, wood: 3, coins: 3 });
    expect(Object.keys(state.players["p1"]?.workers ?? {}).sort()).toEqual([
      "p1:apprentice:1",
      "p1:apprentice:2",
      "p1:apprentice:3",
      "p1:shifu",
    ]);
    expect(state.players["p1"]?.personalSpaces.form_decorate).toEqual([{ unlocked: true }, { unlocked: false }]);
    expect(state.vesselSupply.bowl).toHaveLength(10);
    expect(state.vesselSupply.censer[0]).toBe("censer-01");
    expectConserved(state);
  });

  it.each([
    [2, ["high_1", "high_2", "middle_1", "low_1"]],
    [3, ["high_1", "high_2", "middle_1", "middle_2", "low_1", "low_2"]],
    [4, ["high_1", "high_2", "high_3", "middle_1", "middle_2", "middle_3", "low_1", "low_2"]],
  ] as const)("covers Shared Kiln spaces for %i players (L100)", (players, active) => {
    const state = buildState({ players });
    const activeIds = Object.entries(state.sharedKiln.spaces)
      .filter(([, space]) => space.active)
      .map(([id]) => id)
      .sort();
    expect(activeIds).toEqual([...active].sort());
    expect(state.playerCount).toBe(players);
  });

  it("survives a JSON round trip unchanged (no undefined, NaN or class instances)", () => {
    const state = buildState({
      players: [{ hand: ["S01", "O10"], techs: ["T01", "T15"] }, { recognition: 4 }],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1", kilnFurniture: 1 },
        { owner: "p2", stage: "finished", shape: "vase", glaze: "celadon", quality: "fine", crackle: true },
      ],
    });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("keeps every card in exactly one zone for hands, looks, displays and decks", () => {
    const state = buildState({
      players: [{ hand: ["S03", "S04", "O01"] }, { hand: ["S08", "O20"], techs: ["T13"] }],
      display: ["O02", null, "O03"],
      mainDeck: ["O04", "O05"],
      pendingLook: { kind: "commission_market", playerId: "p1", orderIds: ["O30", "O31"] },
      techDisplay: { firing: ["T25"] },
      fireDiscard: [2, -2],
      firing: null,
    });
    expect(state.hidden.mainDeck).toEqual(["O04", "O05"]);
    // 48 − 2 in hands − 2 displayed − 2 in the deck − 2 looked at.
    expect(state.hidden.mainDiscard).toHaveLength(40);
    expect(state.hidden.startingBox).not.toContain("S03");
    expect(state.techDisplay.firing).toEqual(["T25"]);
    expect(state.hidden.techDecks.firing).toEqual(["T11", "T12", "T14", "T24"]);
    expectConserved(state);
  });

  it("rejects a spec that pins every zone but leaves cards out", () => {
    expect(() => buildState({ mainDeck: ["O01"], mainDiscard: [], display: [] })).toThrow(/in no zone/);
    expect(() => buildState({ fireDeck: [0], fireDiscard: [] })).toThrow(/in no zone/);
    expect(() => buildState({ display: ["O01"], mainDeck: ["O01"] })).toThrow(/more than one zone/);
    expect(() => buildState({ display: ["S01"] })).toThrow(/Starting Orders/);
  });

  it("refuses Tech sets the 3-total / 1-per-discipline limit excludes (L211)", () => {
    expect(() => buildState({ players: [{ techs: ["T01", "T16"] }, {}] })).toThrow(/TECH_DISCIPLINE_OWNED/);
    const state = buildState({ players: [{ techs: ["T01", "T10", "T11"] }, {}] });
    expect(() => giveTech(state, "p1", "T25")).toThrow(/TECH_LIMIT/);
  });

  it("unlocks personal spaces exactly for owned Techs (L212)", () => {
    const state = buildState({ players: [{ techs: ["T05", { id: "T21", usedThisRound: true }, "T14"] }, {}] });
    const p1 = state.players["p1"]!;
    expect(p1.personalSpaces.form_decorate[1].unlocked).toBe(true);
    expect(p1.personalSpaces.glaze_load[1].unlocked).toBe(true);
    expect(p1.techs.map((tech) => [tech.id, tech.usedThisRound])).toEqual([
      ["T05", false],
      ["T21", true],
      ["T14", false],
    ]);
    expect(state.players["p2"]?.personalSpaces.glaze_load[1].unlocked).toBe(false);
  });

  it("sets Recognition milestones consistently", () => {
    const state = buildState({ players: [{ recognition: 3 }, { recognition: 4 }] });
    expect(state.players["p1"]?.imperial).toEqual({
      recognition: 3,
      grantReceived: true,
      kilnGained: true,
      priority: "held",
      audienceReceived: false,
    });
    expect(state.players["p2"]?.imperial.audienceReceived).toBe(true);
    expect(state.players["p2"]?.score.imperialAudience).toBe(6);
  });

  it("stages ceramics with stacks, Kiln Furniture, the Imperial Kiln and placements", () => {
    const state = buildState({
      players: [{ techs: ["T21"] }, { techs: ["T15"], recognition: 2 }, { techs: ["T22"] }],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "vase", glaze: "white", at: "middle_1" },
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1" },
        { owner: "p2", stage: "loaded", shape: "plate", glaze: "celadon", at: "low_1", kilnFurniture: -1 },
        { owner: "p2", stage: "loaded", shape: "plate", glaze: "celadon", at: "imperial", imperialModifier: 1 },
        { owner: "p1", stage: "shaped", shape: "censer", decoration: "painted" },
      ],
      placements: [
        { player: "p1", worker: "shifu", locationId: "glaze_load" },
        { player: "p2", worker: 1, locationId: "canal_wharf" },
        { player: "p1", worker: 2, locationId: "canal_wharf" },
      ],
      settersMarks: { high_1: "p3" },
    });
    expect(state.sharedKiln.spaces.middle_1.ceramicIds).toEqual(["c1", "c2"]);
    expect(state.ceramics["c2"]).toMatchObject({ stage: "loaded", placement: { kiln: "shared", spaceId: "middle_1", stacked: true } });
    expect(state.sharedKiln.spaces.low_1.kilnFurniture).toEqual({ ownerId: "p2", modifier: -1, underCeramicId: "c3" });
    expect(state.ceramics["c4"]).toMatchObject({ placement: { kiln: "imperial", imperialModifier: 1 } });
    expect(state.ceramics["c5"]).toMatchObject({ stage: "shaped", decoration: "painted", vesselInstanceId: "censer-01" });
    expect(state.nextCeramicSequence).toBe(6);
    expect(state.players["p1"]?.workers["p1:apprentice:2"]?.placement).toEqual({
      locationId: "canal_wharf",
      spaceIndex: 1,
      effect: "apprentice",
      viaSeniorApprentice: false,
      sequence: 2,
    });
    expect(state.placementSequence).toBe(3);
    expect(state.sharedKiln.spaces.high_1.setterMarkOwnerId).toBe("p3");
    expect(() => buildState({ ceramics: [{ owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "high_3" }] })).toThrow(
      /cannot load/,
    );
  });
});

describe("buildState refuses states the §8.3 invariants forbid", () => {
  const loaded = { stage: "loaded", glaze: "white" } as const;

  it("Imperial Kiln: only once kilnGained, at most 1 ceramic per player", () => {
    expect(() => buildState({ ceramics: [{ ...loaded, owner: "p1", shape: "vase", at: "imperial" }] })).toThrow(/kilnGained/);
    expect(() =>
      buildState({ players: [{ imperial: { kilnGained: false } }, {}], ceramics: [{ ...loaded, owner: "p1", shape: "vase", at: "imperial" }] }),
    ).toThrow(/kilnGained/);
    expect(() =>
      buildState({
        players: [{ recognition: 2 }, {}],
        ceramics: [
          { ...loaded, owner: "p1", shape: "vase", at: "imperial" },
          { ...loaded, owner: "p1", shape: "bowl", at: "imperial" },
        ],
      }),
    ).toThrow(/already has a ceramic in the Imperial Kiln/);
    expect(
      buildState({ players: [{ recognition: 2 }, {}], ceramics: [{ ...loaded, owner: "p1", shape: "vase", at: "imperial" }] }).ceramics["c1"],
    ).toMatchObject({ placement: { kiln: "imperial" } });
  });

  it("stacks: same owner, T21 owned, and the stacked ceramic a Bowl, Plate or Brush Washer", () => {
    const base = { ...loaded, owner: "p1", shape: "vase", at: "high_1" } as const;
    expect(() => buildState({ ceramics: [base, { ...loaded, owner: "p1", shape: "bowl", at: "high_1" }] })).toThrow(/needs T21/);
    expect(() =>
      buildState({ players: [{ techs: ["T21"] }, {}], ceramics: [base, { ...loaded, owner: "p1", shape: "censer", at: "high_1" }] }),
    ).toThrow(/may be stacked/);
    expect(() =>
      buildState({ players: [{ techs: ["T21"] }, { techs: ["T21"] }], ceramics: [base, { ...loaded, owner: "p2", shape: "bowl", at: "high_1" }] }),
    ).toThrow(/one owner/);
    for (const shape of ["bowl", "plate", "washer"] as const) {
      const state = buildState({ players: [{ techs: ["T21"] }, {}], ceramics: [base, { ...loaded, owner: "p1", shape, at: "high_1" }] });
      expect(state.sharedKiln.spaces.high_1.ceramicIds).toEqual(["c1", "c2"]);
    }
  });

  it("Kiln Furniture: owner owns T15, at most 1 tile", () => {
    expect(() => buildState({ ceramics: [{ ...loaded, owner: "p1", shape: "bowl", at: "high_1", kilnFurniture: 0 }] })).toThrow(/needs T15/);
    expect(() =>
      buildState({
        players: [{ techs: ["T15"] }, {}],
        ceramics: [
          { ...loaded, owner: "p1", shape: "bowl", at: "high_1", kilnFurniture: 0 },
          { ...loaded, owner: "p1", shape: "bowl", at: "low_1", kilnFurniture: 1 },
        ],
      }),
    ).toThrow(/already in high_1/);
  });

  it("Kiln Master's marker: 1 in the game, on a T24 owner's loaded ceramic (rev. 4 L628)", () => {
    expect(
      buildState({
        players: [{ techs: [{ id: "T24", usedThisRound: true }] }, {}],
        ceramics: [{ ...loaded, owner: "p1", shape: "bowl", at: "high_1", kilnMaster: -1 }],
      }).ceramics["c1"],
    ).toMatchObject({ kilnMasterMarker: -1 });
    expect(() => buildState({ ceramics: [{ ...loaded, owner: "p1", shape: "bowl", at: "high_1", kilnMaster: 1 }] })).toThrow(/needs T24/);
    expect(() =>
      buildState({
        players: [{ techs: ["T24"] }, {}],
        ceramics: [
          { ...loaded, owner: "p1", shape: "bowl", at: "high_1", kilnMaster: 1 },
          { ...loaded, owner: "p1", shape: "bowl", at: "low_1", kilnMaster: -1 },
        ],
      }),
    ).toThrow(/Kiln Master marker is already/);
  });

  it("Setter's Mark: owner owns T22, at most 1 per owner, never in mark-free phases", () => {
    expect(() => buildState({ settersMarks: { high_1: "p1" } })).toThrow(/does not own T22/);
    expect(() => buildState({ players: [{ techs: ["T22"] }, {}], settersMarks: { high_1: "p1", low_1: "p1" } })).toThrow(
      /more than 1 Setter's Mark/,
    );
    const phases: GamePhase[] = [
      { type: "setup_kiln_selection", selectionOrder: ["p2", "p1"], index: 0 },
      { type: "cleanup_hand_limit", pendingPlayerIds: ["p1"], openedAtRevision: 0 },
      { type: "finished" },
    ];
    for (const phase of phases) {
      expect(() => buildState({ players: [{ techs: ["T22"] }, {}], phase, settersMarks: { high_1: "p1" } })).toThrow(/no Setter's Mark/);
    }
    expect(buildState({ players: [{ techs: ["T22"] }, {}], settersMarks: { high_1: "p1" } }).sharedKiln.spaces.high_1.setterMarkOwnerId).toBe("p1");
  });

  it("placements: explicit personal spaces unlocked and unused, central capacity, Senior Apprentice", () => {
    expect(() => buildState({ placements: [{ player: "p1", worker: "shifu", locationId: "form_decorate", spaceIndex: 1 }] })).toThrow(
      /locked, used/,
    );
    expect(() =>
      buildState({
        players: [{ techs: ["T01"] }, {}],
        placements: [
          { player: "p1", worker: "shifu", locationId: "form_decorate", spaceIndex: 1 },
          { player: "p1", worker: 1, locationId: "form_decorate", spaceIndex: 1 },
        ],
      }),
    ).toThrow(/locked, used/);
    expect(
      buildState({
        players: [{ techs: ["T01"] }, {}],
        placements: [{ player: "p1", worker: "shifu", locationId: "form_decorate", spaceIndex: 1 }],
      }).players["p1"]?.workers["p1:shifu"]?.placement?.spaceIndex,
    ).toBe(1);
    expect(() =>
      buildState({
        placements: [
          { player: "p1", worker: "shifu", locationId: "magistrates_hall" },
          { player: "p2", worker: "shifu", locationId: "magistrates_hall" },
        ],
      }),
    ).toThrow(/is full/);
    expect(() =>
      buildState({
        placements: [
          { player: "p1", worker: 1, locationId: "canal_wharf", spaceIndex: 0 },
          { player: "p2", worker: 1, locationId: "canal_wharf", spaceIndex: 0 },
        ],
      }),
    ).toThrow(/slot 0 is taken/);
    expect(() =>
      buildState({
        players: [{ techs: ["T18"] }, {}],
        placements: [{ player: "p1", worker: "shifu", locationId: "guild_hall", viaSeniorApprentice: true }],
      }),
    ).toThrow(/Senior Apprentice applies only/);
    expect(() =>
      buildState({
        players: [{ techs: ["T18"] }, {}],
        placements: [{ player: "p1", worker: 1, locationId: "guild_hall", viaSeniorApprentice: true }],
      }),
    ).toThrow(/Senior Apprentice applies only/);
    expect(() => buildState({ placements: [{ player: "p1", worker: 1, locationId: "materials_yard", viaSeniorApprentice: true }] })).toThrow(
      /no ready T18/,
    );
    expect(() =>
      buildState({
        players: [{ techs: [{ id: "T18", usedThisRound: true }] }, {}],
        placements: [{ player: "p1", worker: 1, locationId: "materials_yard", viaSeniorApprentice: true }],
      }),
    ).toThrow(/no ready T18/);
    const ok = buildState({
      players: [{ techs: ["T18"] }, {}],
      placements: [{ player: "p1", worker: 1, locationId: "commission_market", viaSeniorApprentice: true }],
    });
    expect(ok.players["p1"]?.workers["p1:apprentice:1"]?.placement).toMatchObject({ effect: "shifu", viaSeniorApprentice: true });
    expect(ok.players["p1"]?.techs[0]?.usedThisRound).toBe(true);
  });
});

describe("mutation helpers", () => {
  it("setHand and setDisplay move cards between zones without losing any", () => {
    const state = buildState({ players: [{ hand: ["S01", "O40"] }, {}] });
    setHand(state, "p1", ["S02", "O01"]);
    expect(state.hidden.orderHands["p1"]).toEqual(["S02", "O01"]);
    expect(state.market.display[0]).toBeNull();
    expect(state.hidden.startingBox).toContain("S01");
    expect(state.hidden.mainDeck.at(-1)).toBe("O40");
    expectConserved(state);
    setDisplay(state, ["O40", "O41", null, null, null, null]);
    expect(state.market.display).toEqual(["O40", "O41", null, null, null, null]);
    expectConserved(state);
  });

  it("giveTech takes a displayed Tech and refills the display from the deck", () => {
    const state = buildState();
    giveTech(state, "p2", "T16", { usedThisRound: true });
    expect(state.techDisplay.workshop).toEqual(["T01", "T05"]);
    expect(state.players["p2"]?.techs).toEqual([{ id: "T16", acquiredInRound: 1, usedThisRound: true }]);
    expectConserved(state);
  });

  it("setResources and stageCeramic", () => {
    const state = buildState();
    setResources(state, "p2", { coins: 0 });
    expect(state.players["p2"]?.resources).toEqual({ clay: 2, wood: 3, coins: 0 });
    const staged = stageCeramic(state, { owner: "p2", stage: "finished", shape: "bowl", glaze: "white", quality: "masterpiece" });
    expect(staged).toMatchObject({ id: "c1", stage: "finished", crackle: false, quality: "masterpiece" });
    expect(() =>
      stageCeramic(state, { owner: "p2", stage: "finished", shape: "bowl", glaze: "white", quality: "masterpiece", crackle: true }),
    ).toThrow(/exactly Fine/);
  });
});
