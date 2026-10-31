/**
 * Glaze & Load (L207–217, changes 31, 34, 35): Apprentice 1 load, Shifu up to 2 loads
 * (no Heat marker since revision 4), the kiln fuel (1 Wood per action into the Shared Kiln,
 * whether it loads 1 vessel or 2; the Imperial Kiln free; R24), the Imperial modifier (R10, R11),
 * Kiln Tending (T20, L633, INT) and the loading Techs through the command (Setter's Mark,
 * Inverted Firing, Kiln Furniture, Reworking Table). Kiln Master's marker at loading is
 * `kiln_master.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { GLAZES } from "../../../src/game/content.ts";
import { loadDestinationOptions, quoteGlazeLoad } from "../../../src/game/selectors.ts";
import { ceramic } from "../../../src/game/state.ts";
import type { GameAction, KilnSpaceId, LoadSpec } from "../../../src/game/types.ts";
import { actionFuel, glazeLoadFuel, hasAnyLegalLoad, validateLoads } from "../../../src/game/kilnLoading.ts";
import { actorViewOf, projectPublicState } from "../../../src/game/view.ts";
import type { CeramicSpec, PlayerSpec } from "./support/fixtures.ts";
import {
  buildState,
  expectPublicEvents,
  keySorted,
  reject,
  scrambleHidden,
  table,
  types,
  verdict,
  withHands,
} from "./workshop_support.ts";

type GL = Extract<GameAction, { type: "PLACE_GLAZE_LOAD" }>;

function gl(workerId: string, loads: LoadSpec[]): GL {
  return { type: "PLACE_GLAZE_LOAD", workerId, loads };
}

function load(ceramicId: string, spaceId: KilnSpaceId, extra: Partial<Pick<LoadSpec, "reworkShape" | "glaze">> & { invertedFiring?: boolean; kilnFurniture?: -1 | 0 | 1 } = {}): LoadSpec {
  const { reworkShape, glaze, ...destination } = extra;
  return {
    ceramicId,
    glaze: glaze ?? "grey_green",
    destination: { kiln: "shared", spaceId, ...destination },
    ...(reworkShape === undefined ? {} : { reworkShape }),
  };
}

function imperial(ceramicId: string, imperialModifier: -1 | 0 | 1): LoadSpec {
  return { ceramicId, glaze: "moon_white", destination: { kiln: "imperial", imperialModifier } };
}

const shaped = (owner: string, shape: CeramicSpec["shape"] = "bowl"): CeramicSpec => ({ owner, shape, stage: "shaped" });

function spec(p1: PlayerSpec = {}, ceramics: CeramicSpec[] = [shaped("p1"), shaped("p1", "vase"), shaped("p1", "plate")]) {
  return { players: [p1, {}], ceramics };
}

const FUEL = { type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: -1, coins: 0, reason: "kiln_fuel" } as const;

describe("Apprentice effect: 1 Shaped vessel, a Glaze, loaded (L211)", () => {
  it("loads into an empty active Shared Kiln space for 1 Wood, then hands over", () => {
    const t = table(spec());
    const events = t.act("p1", gl("p1:apprentice:1", [load("c2", "high_2", { glaze: "celadon" })]));
    expect(events).toEqual([
      {
        type: "WORKER_PLACED",
        playerId: "p1",
        workerId: "p1:apprentice:1",
        kind: "apprentice",
        locationId: "glaze_load",
        spaceIndex: 0,
        effect: "apprentice",
        viaSeniorApprentice: false,
      },
      FUEL,
      {
        type: "CERAMIC_LOADED",
        playerId: "p1",
        ceramicId: "c2",
        glaze: "celadon",
        placement: { kiln: "shared", spaceId: "high_2", stacked: false },
        loadedBy: "glaze_load",
      },
    ]);
    expect(ceramic(t.state, "c2")).toMatchObject({ stage: "loaded", glaze: "celadon", shape: "vase", kilnMasterMarker: null });
    expect("heatMarker" in ceramic(t.state, "c2")).toBe(false);
    expect(t.state.sharedKiln.spaces.high_2.ceramicIds).toEqual(["c2"]);
    expect(t.halts).toEqual([{ kind: "worker_action_done", playerId: "p1" }]);
    expect(t.player("p1").resources).toEqual({ clay: 2, wood: 2, coins: 3 });
    expectPublicEvents(events);
  });

  it.each(GLAZES)("may choose %s at loading, at no cost beyond the fuel (L358)", (glaze) => {
    const t = table(spec());
    t.act("p1", gl("p1:apprentice:1", [load("c1", "low_1", { glaze })]));
    expect(ceramic(t.state, "c1")).toMatchObject({ glaze });
    expect(t.player("p1").resources).toEqual({ clay: 2, wood: 2, coins: 3 });
  });

  it("loads exactly 1 vessel", () => {
    const error = reject(table(spec()), "p1", gl("p1:apprentice:1", [load("c1", "high_1"), load("c2", "high_2")]), "TOO_MANY_VESSELS");
    expect(error.details).toMatchObject({ limit: 1, count: 2 });
    reject(table(spec()), "p1", gl("p1:apprentice:1", []), "INVALID_CHOICE");
  });
});

describe("Shifu effect: simply loads up to 2 (L212, changes 28, 31)", () => {
  it("loads 2 in order and pays 1 Wood for the action, not per vessel (R24)", () => {
    const t = table(spec());
    const events = t.act("p1", gl("p1:shifu", [load("c1", "high_1"), load("c2", "low_1")]));
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "CERAMIC_LOADED", "CERAMIC_LOADED"]);
    expect(events[1]).toEqual(FUEL);
    expect(t.player("p1").resources.wood).toBe(2);
    reject(table(spec()), "p1", gl("p1:shifu", [load("c1", "high_1"), load("c2", "high_2"), load("c3", "low_1")]), "TOO_MANY_VESSELS");
  });

  it("may load just 1, still for 1 Wood", () => {
    const t = table(spec());
    const events = t.act("p1", gl("p1:shifu", [load("c1", "middle_1")]));
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "CERAMIC_LOADED"]);
    expect(t.player("p1").resources.wood).toBe(2);
  });

  it("a revision-3 Heat marker field is not a command field (MALFORMED_ACTION at the guard)", async () => {
    const { parseCommand } = await import("../../../src/game/actionGuard.ts");
    const parsed = parseCommand({ ...gl("p1:shifu", [load("c1", "middle_1")]), heatMarkerCeramicId: "c1" });
    expect(parsed).toMatchObject({ code: "MALFORMED_ACTION", details: { field: "heatMarkerCeramicId" } });
  });
});

describe("the kiln burns fuel (L215–216, changes 34, 35, R24)", () => {
  it("a Shared and an Imperial load together cost 1 Wood; an Imperial load alone is free", () => {
    const mixed = table(spec({ recognition: 2 }));
    const events = mixed.act("p1", gl("p1:shifu", [imperial("c2", 1), load("c1", "high_1")]));
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "CERAMIC_LOADED", "CERAMIC_LOADED"]);
    expect(mixed.player("p1").resources.wood).toBe(2);

    const imperialOnly = table(spec({ recognition: 2 }));
    const free = imperialOnly.act("p1", gl("p1:apprentice:1", [imperial("c2", 0)]));
    expect(types(free)).toEqual(["WORKER_PLACED", "CERAMIC_LOADED"]);
    expect(imperialOnly.player("p1").resources.wood).toBe(3);
    expect(actionFuel([imperial("c2", 0)], "glaze_load")).toBe(0);
    expect(actionFuel([imperial("c2", 0), load("c1", "high_1")], "glaze_load")).toBe(glazeLoadFuel());
    expect(actionFuel([imperial("c2", 0)], "imperial_priority")).toBe(0);
  });

  it("without Wood a Shared load is refused; the Imperial Kiln still takes one", () => {
    const poor = spec({ recognition: 2, resources: { wood: 0 } });
    const error = reject(table(poor), "p1", gl("p1:apprentice:1", [load("c1", "high_1")]), "INSUFFICIENT_RESOURCES");
    expect(error.details).toMatchObject({ resource: "wood", needed: 1, have: 0, field: "loads[0].destination" });
    const shifu = reject(table(poor), "p1", gl("p1:shifu", [imperial("c2", 0), load("c1", "high_1")]), "INSUFFICIENT_RESOURCES");
    expect(shifu.details).toMatchObject({ field: "loads[1].destination" });
    const t = table(poor);
    t.act("p1", gl("p1:apprentice:1", [imperial("c2", 0)]));
    expect(ceramic(t.state, "c2")).toMatchObject({ placement: { kiln: "imperial" } });
    // The destinations offered match: no Shared space without the Wood.
    const view = actorViewOf(buildState(poor), "p1");
    expect(loadDestinationOptions(view, "p1", "c1", []).every((option) => option.destination.kiln === "imperial")).toBe(true);
  });

  it("the placement is illegal without Wood and without an empty Imperial Kiln (L216)", () => {
    const poor = spec({ resources: { wood: 0 } });
    const error = reject(table(poor), "p1", gl("p1:apprentice:1", [load("c1", "high_1")]), "NO_MAIN_ACTION_POSSIBLE");
    expect(error.details).toMatchObject({ locationId: "glaze_load" });
    expect(error.message).toContain("1 Wood");
    expect(hasAnyLegalLoad(buildState(poor), "p1")).toBe(false);
    expect(hasAnyLegalLoad(buildState(spec()), "p1")).toBe(true);
    expect(hasAnyLegalLoad(buildState(spec({ recognition: 2, resources: { wood: 0 } })), "p1")).toBe(true);
  });

  it("an Inverted Firing stack pays once for the action", () => {
    const t = table(spec({ techs: ["T21"] }));
    const events = t.act("p1", gl("p1:shifu", [load("c2", "low_1"), load("c3", "low_1", { invertedFiring: true })]));
    expect(types(events).filter((type) => type === "RESOURCES_CHANGED")).toHaveLength(1);
    expect(t.player("p1").resources.wood).toBe(2);
  });

  it("quoteGlazeLoad itemises the fuel and agrees with the validator", () => {
    const view = actorViewOf(buildState(spec({ recognition: 2 })), "p1");
    expect(quoteGlazeLoad(view, gl("p1:shifu", [load("c1", "high_1"), load("c2", "low_1")]))).toEqual({
      ok: true,
      error: null,
      pay: { clay: 0, wood: 1, coins: 0 },
      gain: { clay: 0, wood: 0, coins: 0 },
      lines: [{ kind: "kiln_fuel", resource: "wood", amount: 1, itemIndex: null }],
    });
    expect(quoteGlazeLoad(view, gl("p1:apprentice:1", [imperial("c2", 0)]))).toMatchObject({ ok: true, pay: { wood: 0 }, lines: [] });
    const poor = actorViewOf(buildState(spec({ resources: { wood: 0 } })), "p1");
    expect(quoteGlazeLoad(poor, gl("p1:apprentice:1", [load("c1", "high_1")]))).toMatchObject({ ok: false, error: { code: "NO_MAIN_ACTION_POSSIBLE" } });
  });
});

describe("the Imperial Kiln (L308–310, R10, R11)", () => {
  it.each([-1, 0, 1] as const)("records the public modifier %i on the ceramic", (modifier) => {
    const t = table(spec({ recognition: 2 }));
    const events = t.act("p1", gl("p1:apprentice:1", [imperial("c2", modifier)]));
    expect(events[1]).toMatchObject({ type: "CERAMIC_LOADED", placement: { kiln: "imperial", imperialModifier: modifier } });
    expect(projectPublicState(t.state).ceramics["c2"]).toMatchObject({ placement: { kiln: "imperial", imperialModifier: modifier } });
  });

  it("takes 1 vessel of the action; the other goes to the Shared Kiln", () => {
    const t = table(spec({ recognition: 2 }));
    t.act("p1", gl("p1:shifu", [imperial("c2", 1), load("c1", "high_1")]));
    expect(ceramic(t.state, "c2")).toMatchObject({ placement: { kiln: "imperial" }, kilnMasterMarker: null });
    reject(table(spec({ recognition: 2 })), "p1", gl("p1:shifu", [imperial("c2", 1), imperial("c1", 0)]), "IMPERIAL_KILN_UNAVAILABLE");
    reject(table(spec()), "p1", gl("p1:apprentice:1", [imperial("c2", 0)]), "IMPERIAL_KILN_UNAVAILABLE");
  });
});

describe("Kiln Tending (T20, L633): +1 Clay +1 Wood after the first qualifying action each round (INT)", () => {
  it("resolves automatically once, after the fuel and the loads", () => {
    const t = table(spec({ techs: ["T20"] }));
    const events = t.act("p1", gl("p1:shifu", [load("c1", "high_1")]));
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "CERAMIC_LOADED", "TECH_USED", "RESOURCES_CHANGED"]);
    expect(events.slice(3)).toEqual([
      { type: "TECH_USED", playerId: "p1", techId: "T20" },
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 1, wood: 1, coins: 0, reason: "kiln_tending" },
    ]);
    expect(t.player("p1").resources).toEqual({ clay: 3, wood: 3, coins: 3 });
    // The Glaze & Load Tech added space 1; the second action this round gains nothing.
    const second = t.act("p1", gl("p1:apprentice:1", [load("c2", "high_2")]));
    expect(types(second)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "CERAMIC_LOADED"]);
    expect(second[0]).toMatchObject({ spaceIndex: 1 });
    expect(t.player("p1").resources).toEqual({ clay: 3, wood: 2, coins: 3 });
  });

  it("never pays the action's own fuel: with no Wood a Shared load is refused even with Kiln Tending ready", () => {
    reject(table(spec({ techs: ["T20"], resources: { wood: 0 } })), "p1", gl("p1:apprentice:1", [load("c1", "high_1")]), "NO_MAIN_ACTION_POSSIBLE");
  });
});

describe("loading Techs through the command", () => {
  it("returns the owner's Setter's Mark; another player's Mark holds the space (L636)", () => {
    // One Setter's Mark tile exists (L105), so "own Mark" and "another player's Mark" are two
    // scenarios: a state where both players own T22 breaks Tech card conservation (§8.3).
    const own = { players: [{ techs: ["T22" as const] }, {}], ceramics: [shaped("p1")], settersMarks: { low_1: "p1" } as const };
    const t = table(own);
    const events = t.act("p1", gl("p1:apprentice:1", [load("c1", "low_1")]));
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "CERAMIC_LOADED", "SETTERS_MARK_RETURNED"]);
    expect(t.state.sharedKiln.spaces.low_1.setterMarkOwnerId).toBeNull();
    const other = { players: [{}, { techs: ["T22" as const] }], ceramics: [shaped("p1")], settersMarks: { high_1: "p2" } as const };
    reject(table(other), "p1", gl("p1:apprentice:1", [load("c1", "high_1")]), "KILN_SPACE_MARKED");
  });

  it("Inverted Firing stacks on a ceramic the same Shifu action loaded first (R8)", () => {
    const t = table(spec({ techs: ["T21"] }));
    t.act("p1", gl("p1:shifu", [load("c2", "low_1"), load("c3", "low_1", { invertedFiring: true })]));
    expect(t.state.sharedKiln.spaces.low_1.ceramicIds).toEqual(["c2", "c3"]);
    expect(ceramic(t.state, "c3")).toMatchObject({ placement: { kiln: "shared", spaceId: "low_1", stacked: true } });
  });

  it("Kiln Furniture goes beneath the ceramic with the chosen modifier (L634)", () => {
    const t = table(spec({ techs: ["T15"] }));
    const events = t.act("p1", gl("p1:apprentice:1", [load("c1", "high_1", { kilnFurniture: -1 })]));
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "CERAMIC_LOADED", "TECH_USED", "KILN_FURNITURE_PLACED"]);
    expect(t.state.sharedKiln.spaces.high_1.kilnFurniture).toEqual({ ownerId: "p1", modifier: -1, underCeramicId: "c1" });
  });

  it("Reworking Table changes the Shape first, then Inverted Firing tests the new Shape (L623, R8)", () => {
    const t = table(spec({ techs: ["T05", "T21"] }, [shaped("p1", "censer"), { owner: "p1", shape: "vase", stage: "loaded", glaze: "white", at: "middle_1" }]));
    const events = t.act("p1", gl("p1:apprentice:1", [load("c1", "middle_1", { invertedFiring: true, reworkShape: "plate" })]));
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "TECH_USED", "CERAMIC_RESHAPED", "TECH_USED", "CERAMIC_LOADED"]);
    expect(ceramic(t.state, "c1")).toMatchObject({ shape: "plate", placement: { stacked: true } });
    expectPublicEvents(events);
  });
});

describe("optional loading Techs (R4): declining keeps the once-per-round use", () => {
  it.each([
    ["T05", "Reworking Table"],
    ["T15", "Kiln Furniture"],
    ["T21", "Inverted Firing"],
  ] as const)("%s (%s) stays ready after a plain load and is usable later the same round", (techId, _name) => {
    const t = table(spec({ techs: [techId] }, [shaped("p1"), shaped("p1", "plate")]));
    const events = t.act("p1", gl("p1:shifu", [load("c1", "high_1")]));
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "CERAMIC_LOADED"]);
    expect(t.player("p1").techs[0]).toMatchObject({ id: techId, usedThisRound: false });
    const use: LoadSpec =
      techId === "T05" ? load("c2", "high_2", { reworkShape: "bowl" }) : techId === "T15" ? load("c2", "high_2", { kilnFurniture: 1 }) : load("c2", "high_1", { invertedFiring: true });
    expect(validateLoads(actorViewOf(t.state, "p1"), [use], 1, "glaze_load")).toBeNull();
  });
});

describe("privacy and determinism", () => {
  it("validation depends on the public view only (hidden contents scrambled)", () => {
    const state = buildState(withHands(spec({ recognition: 2, techs: ["T21"] })));
    const commands = [
      gl("p1:shifu", [imperial("c2", -1), load("c1", "high_1")]),
      gl("p1:apprentice:1", [load("c3", "high_1", { invertedFiring: true })]),
      gl("p1:shifu", [load("c1", "high_1"), load("c3", "high_1", { invertedFiring: true })]),
    ];
    for (const command of commands) {
      expect(verdict(scrambleHidden(state), "p1", command)).toBe(verdict(state, "p1", command));
    }
  });

  it("a key-sorted (jsonb) state resolves to the same events and state", () => {
    const s = withHands(spec({ recognition: 2, techs: ["T20"] }));
    const command = gl("p1:shifu", [load("c3", "middle_1"), imperial("c2", 1)]);
    const plain = table(s);
    const sorted = table(s);
    sorted.state = keySorted(sorted.state);
    expect(sorted.act("p1", command)).toEqual(plain.act("p1", command));
    expect(keySorted(sorted.state)).toEqual(keySorted(plain.state));
  });
});
