/**
 * Glaze & Load (L174–184): Apprentice 1 load, Shifu up to 2 loads plus the optional face-down
 * Heat marker (L179, R9), the Imperial modifier (R10, R11), Kiln Tending (T20, L627, INT) and
 * the loading Techs through the command (Setter's Mark, Inverted Firing, Kiln Furniture,
 * Reworking Table).
 */

import { describe, expect, it } from "vitest";
import { GLAZES } from "../../../src/game/content.ts";
import { ceramic } from "../../../src/game/state.ts";
import type { GameAction, KilnSpaceId, LoadSpec } from "../../../src/game/types.ts";
import { validateLoads } from "../../../src/game/kilnLoading.ts";
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

function gl(workerId: string, loads: LoadSpec[], heatMarkerCeramicId?: string): GL {
  return { type: "PLACE_GLAZE_LOAD", workerId, loads, ...(heatMarkerCeramicId === undefined ? {} : { heatMarkerCeramicId }) };
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

describe("Apprentice effect: 1 Shaped vessel, a Glaze, loaded (L178)", () => {
  it("loads into an empty active Shared Kiln space, then hands over", () => {
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
      {
        type: "CERAMIC_LOADED",
        playerId: "p1",
        ceramicId: "c2",
        glaze: "celadon",
        placement: { kiln: "shared", spaceId: "high_2", stacked: false },
        loadedBy: "glaze_load",
      },
    ]);
    expect(ceramic(t.state, "c2")).toMatchObject({ stage: "loaded", glaze: "celadon", shape: "vase", heatMarker: null });
    expect(t.state.sharedKiln.spaces.high_2.ceramicIds).toEqual(["c2"]);
    expect(t.halts).toEqual([{ kind: "worker_action_done", playerId: "p1" }]);
    expectPublicEvents(events);
  });

  it.each(GLAZES)("may choose %s at loading, at no cost (L343)", (glaze) => {
    const t = table(spec());
    t.act("p1", gl("p1:apprentice:1", [load("c1", "low_1", { glaze })]));
    expect(ceramic(t.state, "c1")).toMatchObject({ glaze });
    expect(t.player("p1").resources).toEqual({ clay: 2, wood: 2, coins: 3 });
  });

  it("loads exactly 1 vessel and places no Heat marker", () => {
    const error = reject(table(spec()), "p1", gl("p1:apprentice:1", [load("c1", "high_1"), load("c2", "high_2")]), "TOO_MANY_VESSELS");
    expect(error.details).toMatchObject({ limit: 1, count: 2 });
    reject(table(spec()), "p1", gl("p1:apprentice:1", []), "INVALID_CHOICE");
    reject(table(spec()), "p1", gl("p1:apprentice:1", [load("c1", "high_1")], "c1"), "NOT_SHIFU_EFFECT");
  });
});

describe("Shifu effect: up to 2 loads, then the optional face-down Heat marker (L179, R9)", () => {
  it("loads 2 in order and marks one of them face down", () => {
    const t = table(spec());
    const events = t.act("p1", gl("p1:shifu", [load("c1", "high_1"), load("c2", "low_1")], "c2"));
    expect(types(events)).toEqual(["WORKER_PLACED", "CERAMIC_LOADED", "CERAMIC_LOADED", "HEAT_MARKER_PLACED"]);
    expect(events[3]).toEqual({ type: "HEAT_MARKER_PLACED", playerId: "p1", ceramicId: "c2" });
    expect(ceramic(t.state, "c2")).toMatchObject({ heatMarker: { source: "own", faceDown: true } });
    // The face-down marker has no value in public state (INT: nothing hidden is committed).
    const published = JSON.stringify(projectPublicState(t.state).ceramics["c2"]);
    expect(published).toContain('"heatMarker":{"source":"own","faceDown":true}');
    expect(published).not.toContain('"value"');
    reject(table(spec()), "p1", gl("p1:shifu", [load("c1", "high_1"), load("c2", "high_2"), load("c3", "low_1")]), "TOO_MANY_VESSELS");
  });

  it("may load just 1 and may decline the marker (R9)", () => {
    const t = table(spec());
    const events = t.act("p1", gl("p1:shifu", [load("c1", "middle_1")]));
    expect(types(events)).toEqual(["WORKER_PLACED", "CERAMIC_LOADED"]);
    expect(ceramic(t.state, "c1")).toMatchObject({ heatMarker: null });
  });

  it("may mark a ceramic loaded earlier this round or by Imperial Priority, Shared or Imperial (R9)", () => {
    const earlier = table(
      spec({}, [shaped("p1"), { owner: "p1", shape: "vase", stage: "loaded", glaze: "white", at: "high_1" }]),
    );
    earlier.act("p1", gl("p1:shifu", [load("c1", "low_1")], "c2"));
    expect(ceramic(earlier.state, "c2")).toMatchObject({ heatMarker: { source: "own", faceDown: true } });

    const viaPriority = table(
      spec({ recognition: 3, imperial: { priority: "spent" } }, [
        shaped("p1"),
        { owner: "p1", shape: "vase", stage: "loaded", glaze: "white", at: "imperial", imperialModifier: 1, loadedBy: "imperial_priority" },
      ]),
    );
    viaPriority.act("p1", gl("p1:shifu", [load("c1", "low_1")], "c2"));
    expect(ceramic(viaPriority.state, "c2")).toMatchObject({ heatMarker: { source: "own", faceDown: true } });
  });

  it("goes only on your own loaded ceramic without a marker; you have 1 marker (L75, L184)", () => {
    const ceramics: CeramicSpec[] = [
      shaped("p1"), // c1
      { owner: "p1", shape: "vase", stage: "loaded", glaze: "white", at: "high_1", heatMarker: { source: "kiln_master", faceDown: false, value: 1 } }, // c2
      { owner: "p2", shape: "vase", stage: "loaded", glaze: "white", at: "high_2" }, // c3
      shaped("p1", "plate"), // c4
      { owner: "p1", shape: "bowl", stage: "finished", glaze: "white", quality: "fine" }, // c5
    ];
    const base = spec({ techs: ["T24"] }, ceramics);
    reject(table(base), "p1", gl("p1:shifu", [load("c1", "low_1")], "c2"), "HEAT_MARKER_INVALID");
    reject(table(base), "p1", gl("p1:shifu", [load("c1", "low_1")], "c3"), "CERAMIC_NOT_OWNED");
    reject(table(base), "p1", gl("p1:shifu", [load("c1", "low_1")], "c4"), "ILLEGAL_CERAMIC_STAGE");
    reject(table(base), "p1", gl("p1:shifu", [load("c1", "low_1")], "c5"), "ILLEGAL_CERAMIC_STAGE");
    reject(table(base), "p1", gl("p1:shifu", [load("c1", "low_1")], "c99"), "CERAMIC_NOT_FOUND");
    const placed = spec({}, [
      shaped("p1"),
      { owner: "p1", shape: "vase", stage: "loaded", glaze: "white", at: "high_1", heatMarker: { source: "own", faceDown: true } },
    ]);
    const error = reject(table(placed), "p1", gl("p1:shifu", [load("c1", "low_1")], "c1"), "HEAT_MARKER_INVALID");
    expect(error.details).toMatchObject({ ceramicId: "c2", source: "own" });
  });
});

describe("the Imperial Kiln (L181, L286–289, R10, R11)", () => {
  it.each([-1, 0, 1] as const)("records the public modifier %i on the ceramic", (modifier) => {
    const t = table(spec({ recognition: 2 }));
    const events = t.act("p1", gl("p1:apprentice:1", [imperial("c2", modifier)]));
    expect(events[1]).toMatchObject({ type: "CERAMIC_LOADED", placement: { kiln: "imperial", imperialModifier: modifier } });
    expect(projectPublicState(t.state).ceramics["c2"]).toMatchObject({ placement: { kiln: "imperial", imperialModifier: modifier } });
  });

  it("takes 1 vessel of the action; the other goes to the Shared Kiln", () => {
    const t = table(spec({ recognition: 2 }));
    t.act("p1", gl("p1:shifu", [imperial("c2", 1), load("c1", "high_1")], "c2"));
    expect(ceramic(t.state, "c2")).toMatchObject({ placement: { kiln: "imperial" }, heatMarker: { source: "own", faceDown: true } });
    reject(table(spec({ recognition: 2 })), "p1", gl("p1:shifu", [imperial("c2", 1), imperial("c1", 0)]), "IMPERIAL_KILN_UNAVAILABLE");
    reject(table(spec()), "p1", gl("p1:apprentice:1", [imperial("c2", 0)]), "IMPERIAL_KILN_UNAVAILABLE");
  });
});

describe("Kiln Tending (T20, L627): +1 Clay +1 Wood after the first qualifying action each round (INT)", () => {
  it("resolves automatically once, after the loads and the marker", () => {
    const t = table(spec({ techs: ["T20"] }));
    const events = t.act("p1", gl("p1:shifu", [load("c1", "high_1")], "c1"));
    expect(types(events)).toEqual(["WORKER_PLACED", "CERAMIC_LOADED", "HEAT_MARKER_PLACED", "TECH_USED", "RESOURCES_CHANGED"]);
    expect(events.slice(3)).toEqual([
      { type: "TECH_USED", playerId: "p1", techId: "T20" },
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 1, wood: 1, coins: 0, reason: "kiln_tending" },
    ]);
    expect(t.player("p1").resources).toEqual({ clay: 3, wood: 3, coins: 3 });
    // The Glaze & Load Tech unlocked space 1; the second action this round gains nothing.
    const second = t.act("p1", gl("p1:apprentice:1", [load("c2", "high_2")]));
    expect(types(second)).toEqual(["WORKER_PLACED", "CERAMIC_LOADED"]);
    expect(second[0]).toMatchObject({ spaceIndex: 1 });
    expect(t.player("p1").resources).toEqual({ clay: 3, wood: 3, coins: 3 });
  });
});

describe("loading Techs through the command", () => {
  it("returns the owner's Setter's Mark; another player's Mark holds the space (L630)", () => {
    // One Setter's Mark tile exists (L82), so "own Mark" and "another player's Mark" are two
    // scenarios: a state where both players own T22 breaks Tech card conservation (§8.3).
    const own = { players: [{ techs: ["T22" as const] }, {}], ceramics: [shaped("p1")], settersMarks: { low_1: "p1" } as const };
    const t = table(own);
    const events = t.act("p1", gl("p1:apprentice:1", [load("c1", "low_1")]));
    expect(types(events)).toEqual(["WORKER_PLACED", "CERAMIC_LOADED", "SETTERS_MARK_RETURNED"]);
    expect(t.state.sharedKiln.spaces.low_1.setterMarkOwnerId).toBeNull();
    const other = { players: [{}, { techs: ["T22" as const] }], ceramics: [shaped("p1")], settersMarks: { high_1: "p2" } as const };
    reject(table(other), "p1", gl("p1:apprentice:1", [load("c1", "high_1")]), "KILN_SPACE_MARKED");
  });

  it("Inverted Firing stacks on a ceramic the same Shifu action loaded first (R8)", () => {
    const t = table(spec({ techs: ["T21"] }));
    t.act("p1", gl("p1:shifu", [load("c2", "low_1"), load("c3", "low_1", { invertedFiring: true })], "c3"));
    expect(t.state.sharedKiln.spaces.low_1.ceramicIds).toEqual(["c2", "c3"]);
    expect(ceramic(t.state, "c3")).toMatchObject({ placement: { kiln: "shared", spaceId: "low_1", stacked: true } });
  });

  it("Kiln Furniture goes beneath the ceramic with the chosen modifier (L628)", () => {
    const t = table(spec({ techs: ["T15"] }));
    const events = t.act("p1", gl("p1:apprentice:1", [load("c1", "high_1", { kilnFurniture: -1 })]));
    expect(types(events)).toEqual(["WORKER_PLACED", "CERAMIC_LOADED", "TECH_USED", "KILN_FURNITURE_PLACED"]);
    expect(t.state.sharedKiln.spaces.high_1.kilnFurniture).toEqual({ ownerId: "p1", modifier: -1, underCeramicId: "c1" });
  });

  it("Reworking Table changes the Shape first, then Inverted Firing tests the new Shape (L617, R8)", () => {
    const t = table(spec({ techs: ["T05", "T21"] }, [shaped("p1", "censer"), { owner: "p1", shape: "vase", stage: "loaded", glaze: "white", at: "middle_1" }]));
    const events = t.act("p1", gl("p1:apprentice:1", [load("c1", "middle_1", { invertedFiring: true, reworkShape: "plate" })]));
    expect(types(events)).toEqual(["WORKER_PLACED", "TECH_USED", "CERAMIC_RESHAPED", "TECH_USED", "CERAMIC_LOADED"]);
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
    expect(types(events)).toEqual(["WORKER_PLACED", "CERAMIC_LOADED"]);
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
      gl("p1:shifu", [imperial("c2", -1), load("c1", "high_1")], "c2"),
      gl("p1:apprentice:1", [load("c3", "high_1", { invertedFiring: true })]),
      gl("p1:shifu", [load("c1", "high_1"), load("c3", "high_1", { invertedFiring: true })]),
    ];
    for (const command of commands) {
      expect(verdict(scrambleHidden(state), "p1", command)).toBe(verdict(state, "p1", command));
    }
  });

  it("a key-sorted (jsonb) state resolves to the same events and state", () => {
    const s = withHands(spec({ recognition: 2, techs: ["T20"] }));
    const command = gl("p1:shifu", [load("c3", "middle_1"), imperial("c2", 1)], "c3");
    const plain = table(s);
    const sorted = table(s);
    sorted.state = keySorted(sorted.state);
    expect(sorted.act("p1", command)).toEqual(plain.act("p1", command));
    expect(keySorted(sorted.state)).toEqual(keySorted(plain.state));
  });
});
