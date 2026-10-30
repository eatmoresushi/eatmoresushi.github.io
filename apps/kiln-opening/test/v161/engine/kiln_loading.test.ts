/**
 * Kiln loading (P3, M2a): R5 a/b/c destinations, R8 sequential loads, Setter's Mark return,
 * Kiln Furniture, Reworking Table applied before the Inverted Firing Shape test, and the
 * DESIGN §11 Q3 default (placement legality ignores possible reworks).
 */

import { describe, expect, it } from "vitest";
import { KILN_SPACE_IDS } from "../../../src/game/content.ts";
import { InvariantError } from "../../../src/game/errors.ts";
import {
  hasAnyLegalLoad,
  imperialKilnEmpty,
  invertedFiringTarget,
  loadCeramic,
  loadDestinationOptions,
  reworkShape,
  sharedSpaceOpenFor,
  validateLoads,
} from "../../../src/game/kilnLoading.ts";
import { ceramic, player } from "../../../src/game/state.ts";
import type { GameState, KilnSpaceId, LoadSpec, LoadedCeramic, PlayerId } from "../../../src/game/types.ts";
import { actorViewOf, projectEvent, viewOf } from "../../../src/game/view.ts";
import { buildState, testContext, type CeramicSpec, type PlayerSpec, type StateSpec } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

/** Fills every active 2-player space (high_1, high_2, middle_1, low_1) with p2's ceramics. */
const P2_FILLS_KILN: CeramicSpec[] = [
  { owner: "p2", shape: "vase", stage: "loaded", glaze: "white", at: "high_1" },
  { owner: "p2", shape: "vase", stage: "loaded", glaze: "white", at: "high_2" },
  { owner: "p2", shape: "vase", stage: "loaded", glaze: "white", at: "middle_1" },
  { owner: "p2", shape: "vase", stage: "loaded", glaze: "white", at: "low_1" },
];

function code(state: GameState, loads: LoadSpec[], maxLoads = 2, loadedBy: LoadedCeramic["loadedBy"] = "glaze_load", actor: PlayerId = "p1") {
  const error = validateLoads(actorViewOf(state, actor), loads, maxLoads, loadedBy);
  if (error !== null) {
    expectDocumentedDetails(error);
  }
  return error?.code ?? null;
}

function shared(ceramicId: string, spaceId: KilnSpaceId, extra: { invertedFiring?: boolean; kilnFurniture?: -1 | 0 | 1 } = {}, reworkShape?: LoadSpec["reworkShape"]): LoadSpec {
  return {
    ceramicId,
    glaze: "celadon",
    destination: { kiln: "shared", spaceId, ...extra },
    ...(reworkShape === undefined ? {} : { reworkShape }),
  };
}

function imperial(ceramicId: string, imperialModifier: -1 | 0 | 1 = 0): LoadSpec {
  return { ceramicId, glaze: "moon_white", destination: { kiln: "imperial", imperialModifier } };
}

/** Postgres `jsonb` key order: keys sorted by length, then bytes (DESIGN §7). */
function keySorted<T>(value: T): T {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (input !== null && typeof input === "object") {
      const entries = Object.entries(input as Record<string, unknown>).sort(([a], [b]) =>
        a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0,
      );
      return Object.fromEntries(entries.map(([key, item]) => [key, sort(item)]));
    }
    return input;
  };
  return sort(value) as T;
}

describe("R5a — empty active Shared Kiln space not held by another's Setter's Mark", () => {
  it("is open when active and empty; covered, occupied and other-marked spaces are not", () => {
    const state = buildState({
      players: [{}, { techs: ["T22"] }],
      ceramics: [{ owner: "p1", shape: "bowl", stage: "loaded", glaze: "white", at: "high_1" }],
      settersMarks: { middle_1: "p2" },
    });
    expect(sharedSpaceOpenFor(state, "p1", "high_2")).toBe(true);
    expect(sharedSpaceOpenFor(state, "p1", "high_1")).toBe(false); // occupied
    expect(sharedSpaceOpenFor(state, "p1", "high_3")).toBe(false); // covered at 2 players (L122, L217)
    expect(sharedSpaceOpenFor(state, "p1", "middle_1")).toBe(false); // p2's Setter's Mark (L636)
    expect(sharedSpaceOpenFor(state, "p2", "middle_1")).toBe(true); // the owner may load there
  });

  it.each([2, 3, 4] as const)("only the active spaces of a %i-player game are ever open (L122)", (n) => {
    const state = buildState({ players: n });
    const open = KILN_SPACE_IDS.filter((space) => sharedSpaceOpenFor(state, "p1", space));
    expect(open).toEqual(
      { 2: ["high_1", "high_2", "middle_1", "low_1"], 3: ["high_1", "high_2", "middle_1", "middle_2", "low_1", "low_2"], 4: [...KILN_SPACE_IDS] }[n],
    );
  });
});

describe("R5b — your own gained, empty Imperial Kiln", () => {
  it("needs Recognition 2's tile and holds 1 ceramic per firing (L217, L306, L308)", () => {
    expect(imperialKilnEmpty(buildState(), "p1")).toBe(false);
    expect(imperialKilnEmpty(buildState({ players: [{ recognition: 2 }, {}] }), "p1")).toBe(true);
    const occupied = buildState({
      players: [{ recognition: 2 }, {}],
      ceramics: [{ owner: "p1", shape: "vase", stage: "loaded", glaze: "white", at: "imperial", imperialModifier: 1 }],
    });
    expect(imperialKilnEmpty(occupied, "p1")).toBe(false);
  });
});

describe("R5c — Inverted Firing target", () => {
  it("is an active space holding exactly 1 of your ceramics, even under Kiln Furniture (R8)", () => {
    const state = buildState({
      players: [{ techs: ["T15"] }, { techs: ["T21"] }],
      ceramics: [
        { owner: "p1", shape: "bowl", stage: "loaded", glaze: "white", at: "high_1", kilnFurniture: -1 },
        { owner: "p2", shape: "bowl", stage: "loaded", glaze: "white", at: "high_2" },
        { owner: "p2", shape: "bowl", stage: "loaded", glaze: "white", at: "middle_1" },
        { owner: "p2", shape: "plate", stage: "loaded", glaze: "white", at: "middle_1" },
      ],
    });
    expect(invertedFiringTarget(state, "p1", "high_1")).toBe(true);
    expect(invertedFiringTarget(state, "p1", "high_2")).toBe(false); // another player's ceramic
    expect(invertedFiringTarget(state, "p2", "high_2")).toBe(true);
    expect(invertedFiringTarget(state, "p2", "middle_1")).toBe(false); // already a stack of 2
    expect(invertedFiringTarget(state, "p1", "low_1")).toBe(false); // empty
    expect(invertedFiringTarget(state, "p1", "high_3")).toBe(false); // covered
  });
});

describe("hasAnyLegalLoad (L215, R5)", () => {
  it("needs at least 1 Shaped vessel", () => {
    expect(hasAnyLegalLoad(buildState(), "p1")).toBe(false);
    expect(hasAnyLegalLoad(buildState({ ceramics: [{ owner: "p1", shape: "vase", stage: "shaped" }] }), "p1")).toBe(true);
  });

  it("(a) fails when every active space is full or held by another player's Setter's Mark", () => {
    const full = buildState({ ceramics: [{ owner: "p1", shape: "bowl", stage: "shaped" }, ...P2_FILLS_KILN] });
    expect(hasAnyLegalLoad(full, "p1")).toBe(false);
    const marked = buildState({
      players: [{}, { techs: ["T22"] }],
      ceramics: [{ owner: "p1", shape: "bowl", stage: "shaped" }, ...P2_FILLS_KILN.slice(0, 3)],
      settersMarks: { low_1: "p2" },
    });
    expect(hasAnyLegalLoad(marked, "p1")).toBe(false);
    expect(hasAnyLegalLoad(marked, "p2")).toBe(false); // p2 has no Shaped vessel
  });

  it("(b) the empty Imperial Kiln alone makes the placement legal", () => {
    const state = buildState({
      players: [{ recognition: 2 }, {}],
      ceramics: [{ owner: "p1", shape: "vase", stage: "shaped" }, ...P2_FILLS_KILN],
    });
    expect(hasAnyLegalLoad(state, "p1")).toBe(true);
  });

  it("(c) a Bowl/Plate/Brush Washer with Inverted Firing ready and 1 own ceramic alone in a space", () => {
    const spec = (techs: PlayerSpec[]): StateSpec => ({
      players: techs,
      ceramics: [
        { owner: "p1", shape: "washer", stage: "shaped" },
        { owner: "p1", shape: "vase", stage: "loaded", glaze: "white", at: "high_1" },
        ...P2_FILLS_KILN.slice(1),
      ],
    });
    expect(hasAnyLegalLoad(buildState(spec([{ techs: ["T21"] }, {}])), "p1")).toBe(true);
    expect(hasAnyLegalLoad(buildState(spec([{ techs: [{ id: "T21", usedThisRound: true }] }, {}])), "p1")).toBe(false);
    expect(hasAnyLegalLoad(buildState(spec([{}, {}])), "p1")).toBe(false);
  });

  it("§11 Q3 default: a Vase that Reworking Table could make a Bowl does not count", () => {
    const state = buildState({
      players: [{ techs: ["T05", "T21"] }, {}],
      ceramics: [
        { owner: "p1", shape: "vase", stage: "shaped" },
        { owner: "p1", shape: "bowl", stage: "loaded", glaze: "white", at: "high_1" },
        ...P2_FILLS_KILN.slice(1),
      ],
    });
    expect(hasAnyLegalLoad(state, "p1")).toBe(false);
    // …so the Glaze & Load placement is illegal even with a rework in the command.
    const table = new LocalTable(state, { flow: "halt" });
    const error = table.expectRuleError(
      "p1",
      { type: "PLACE_GLAZE_LOAD", workerId: "p1:apprentice:1", loads: [shared("c1", "high_1", { invertedFiring: true }, "bowl")] },
      "NO_MAIN_ACTION_POSSIBLE",
    );
    expectDocumentedDetails(error);
  });
});

describe("validateLoads — counts and ceramics", () => {
  const state = buildState({
    players: [{ recognition: 2 }, {}],
    ceramics: [
      { owner: "p1", shape: "bowl", stage: "shaped" },
      { owner: "p1", shape: "plate", stage: "shaped" },
      { owner: "p1", shape: "vase", stage: "shaped" },
      { owner: "p2", shape: "bowl", stage: "shaped" },
      { owner: "p1", shape: "bowl", stage: "finished", glaze: "white", quality: "fine" },
    ],
  });

  it("accepts 1 to maxLoads loads and rejects 0 or more", () => {
    expect(code(state, [shared("c1", "high_1")], 1)).toBeNull();
    expect(code(state, [], 2)).toBe("INVALID_CHOICE");
    expect(code(state, [shared("c1", "high_1"), shared("c2", "high_2")], 1)).toBe("TOO_MANY_VESSELS");
    expect(code(state, [shared("c1", "high_1"), shared("c2", "high_2")], 2)).toBeNull();
  });

  it("rejects a Glaze that does not exist (validators may be called without parseCommand)", () => {
    expect(code(state, [{ ...shared("c1", "high_1"), glaze: "jade" as never }])).toBe("INVALID_CHOICE");
  });

  it("rejects unknown, foreign, non-Shaped and repeated ceramics", () => {
    expect(code(state, [shared("c99", "high_1")])).toBe("CERAMIC_NOT_FOUND");
    expect(code(state, [shared("c4", "high_1")])).toBe("CERAMIC_NOT_OWNED");
    expect(code(state, [shared("c5", "high_1")])).toBe("ILLEGAL_CERAMIC_STAGE");
    expect(code(state, [shared("c1", "high_1"), shared("c1", "high_2")])).toBe("DUPLICATE_CERAMIC");
  });

  it("the Imperial Kiln takes at most 1 vessel per action and per firing (L214, L217)", () => {
    expect(code(state, [imperial("c3", 1)])).toBeNull();
    expect(code(state, [imperial("c3", -1), imperial("c1", 0)])).toBe("IMPERIAL_KILN_UNAVAILABLE");
    expect(code(buildState({ ceramics: [{ owner: "p1", shape: "vase", stage: "shaped" }] }), [imperial("c1")])).toBe(
      "IMPERIAL_KILN_UNAVAILABLE",
    );
  });

  it("Imperial Priority loads only into the Imperial Kiln (L314)", () => {
    expect(code(state, [imperial("c3", 0)], 1, "imperial_priority")).toBeNull();
    expect(code(state, [shared("c3", "high_1")], 1, "imperial_priority")).toBe("INVALID_CHOICE");
  });
});

describe("validateLoads — Shared Kiln destinations", () => {
  it("rejects covered and occupied spaces (L217)", () => {
    const state = buildState({
      ceramics: [
        { owner: "p1", shape: "bowl", stage: "shaped" },
        { owner: "p1", shape: "bowl", stage: "shaped" },
        { owner: "p2", shape: "vase", stage: "loaded", glaze: "white", at: "high_1" },
      ],
    });
    expect(code(state, [shared("c1", "high_3")])).toBe("KILN_SPACE_UNAVAILABLE");
    expect(code(state, [shared("c1", "high_1")])).toBe("KILN_SPACE_UNAVAILABLE");
    // Sequentially: the second load cannot use the space the first just filled (R8).
    expect(code(state, [shared("c1", "high_2"), shared("c2", "high_2")])).toBe("KILN_SPACE_UNAVAILABLE");
  });

  it("another player's Setter's Mark holds the space; your own does not (L636)", () => {
    const state = buildState({
      players: [{ techs: ["T22"] }, { techs: ["T22"] }],
      ceramics: [{ owner: "p1", shape: "bowl", stage: "shaped" }],
      settersMarks: { high_1: "p1", high_2: "p2" },
    });
    expect(code(state, [shared("c1", "high_2")])).toBe("KILN_SPACE_MARKED");
    expect(code(state, [shared("c1", "high_1")])).toBeNull();
  });
});

describe("validateLoads — Inverted Firing (T21, L635, R5c, R8)", () => {
  const base = (techs: PlayerSpec[] = [{ techs: ["T21"] }, {}]): StateSpec => ({
    players: techs,
    ceramics: [
      { owner: "p1", shape: "vase", stage: "shaped" }, // c1
      { owner: "p1", shape: "bowl", stage: "shaped" }, // c2
      { owner: "p1", shape: "censer", stage: "shaped" }, // c3
      { owner: "p1", shape: "plate", stage: "loaded", glaze: "white", at: "high_1" }, // c4
      { owner: "p2", shape: "plate", stage: "loaded", glaze: "white", at: "high_2" }, // c5
    ],
  });

  it("stacks a Bowl/Plate/Brush Washer on exactly 1 of your ceramics", () => {
    const state = buildState(base());
    expect(code(state, [shared("c2", "high_1", { invertedFiring: true })])).toBeNull();
    expect(code(state, [shared("c1", "high_1", { invertedFiring: true })])).toBe("INVERTED_FIRING_INVALID");
    expect(code(state, [shared("c2", "high_2", { invertedFiring: true })])).toBe("INVERTED_FIRING_INVALID");
    expect(code(state, [shared("c2", "middle_1", { invertedFiring: true })])).toBe("INVERTED_FIRING_INVALID");
    // Without the flag, an occupied space is simply unavailable.
    expect(code(state, [shared("c2", "high_1")])).toBe("KILN_SPACE_UNAVAILABLE");
  });

  it("R8: stacks on a ceramic loaded earlier by the same action, but not the other way round", () => {
    const state = buildState(base());
    expect(code(state, [shared("c1", "low_1"), shared("c2", "low_1", { invertedFiring: true })])).toBeNull();
    expect(code(state, [shared("c2", "low_1", { invertedFiring: true }), shared("c1", "low_1")])).toBe(
      "INVERTED_FIRING_INVALID",
    );
  });

  it("is once per round: not owned, already used, or twice in one action are rejected", () => {
    expect(code(buildState(base([{}, {}])), [shared("c2", "high_1", { invertedFiring: true })])).toBe("TECH_NOT_OWNED");
    expect(
      code(buildState(base([{ techs: [{ id: "T21", usedThisRound: true }] }, {}])), [shared("c2", "high_1", { invertedFiring: true })]),
    ).toBe("TECH_ALREADY_USED");
    const twice = buildState({
      players: [{ techs: ["T21"] }, {}],
      ceramics: [
        { owner: "p1", shape: "bowl", stage: "shaped" },
        { owner: "p1", shape: "plate", stage: "shaped" },
        { owner: "p1", shape: "vase", stage: "loaded", glaze: "white", at: "high_1" },
        { owner: "p1", shape: "vase", stage: "loaded", glaze: "white", at: "high_2" },
      ],
    });
    expect(
      code(twice, [shared("c1", "high_1", { invertedFiring: true }), shared("c2", "high_2", { invertedFiring: true })]),
    ).toBe("TECH_ALREADY_USED");
  });
});

describe("validateLoads — Reworking Table (T05, L623) first, then the Inverted Firing Shape test", () => {
  const state = buildState({
    players: [{ techs: ["T05", "T21"] }, {}],
    ceramics: [
      { owner: "p1", shape: "vase", stage: "shaped" }, // c1
      { owner: "p1", shape: "bowl", stage: "shaped" }, // c2
      { owner: "p1", shape: "plate", stage: "loaded", glaze: "white", at: "high_1" }, // c3
    ],
  });

  it("a Vase reworked into a Bowl may be stacked; a Bowl reworked into a Vase may not", () => {
    expect(code(state, [shared("c1", "high_1", { invertedFiring: true }, "bowl")])).toBeNull();
    const error = validateLoads(actorViewOf(state, "p1"), [shared("c2", "high_1", { invertedFiring: true }, "vase")], 2, "glaze_load");
    expect(error?.code).toBe("INVERTED_FIRING_INVALID");
    expect(error?.details["shape"]).toBe("vase");
  });

  it("must change the Shape, is once per round and needs the Tech", () => {
    expect(code(state, [shared("c1", "high_2", {}, "vase")])).toBe("INVALID_VESSEL_CHOICE");
    expect(code(state, [shared("c1", "high_2", {}, "bowl"), shared("c2", "middle_1", {}, "plate")])).toBe("TECH_ALREADY_USED");
    const used = buildState({
      players: [{ techs: [{ id: "T05", usedThisRound: true }] }, {}],
      ceramics: [{ owner: "p1", shape: "vase", stage: "shaped" }],
    });
    expect(code(used, [shared("c1", "high_1", {}, "bowl")])).toBe("TECH_ALREADY_USED");
    const none = buildState({ ceramics: [{ owner: "p1", shape: "vase", stage: "shaped" }] });
    expect(code(none, [shared("c1", "high_1", {}, "bowl")])).toBe("TECH_NOT_OWNED");
  });
});

describe("validateLoads — Kiln Furniture (T15, L634, L653)", () => {
  const state = buildState({
    players: [{ techs: ["T15"], recognition: 2 }, {}],
    ceramics: [
      { owner: "p1", shape: "vase", stage: "shaped" },
      { owner: "p1", shape: "bowl", stage: "shaped" },
    ],
  });

  it("goes beneath 1 Shared Kiln load once per round, with a −1/0/+1 modifier", () => {
    expect(code(state, [shared("c1", "low_1", { kilnFurniture: 1 })])).toBeNull();
    expect(code(state, [shared("c1", "low_1", { kilnFurniture: 1 }), shared("c2", "high_1", { kilnFurniture: -1 })])).toBe(
      "TECH_ALREADY_USED",
    );
    const used = buildState({
      players: [{ techs: [{ id: "T15", usedThisRound: true }] }, {}],
      ceramics: [{ owner: "p1", shape: "vase", stage: "shaped" }],
    });
    expect(code(used, [shared("c1", "low_1", { kilnFurniture: 0 })])).toBe("TECH_ALREADY_USED");
    const none = buildState({ ceramics: [{ owner: "p1", shape: "vase", stage: "shaped" }] });
    expect(code(none, [shared("c1", "low_1", { kilnFurniture: 0 })])).toBe("TECH_NOT_OWNED");
  });

  it("refuses a tile that is still in the kiln", () => {
    const stillThere = buildState({
      players: [{ techs: ["T15"] }, {}],
      ceramics: [
        { owner: "p1", shape: "vase", stage: "shaped" },
        { owner: "p1", shape: "bowl", stage: "loaded", glaze: "white", at: "high_1", kilnFurniture: 0 },
      ],
    });
    expect(code(stillThere, [shared("c1", "low_1", { kilnFurniture: 1 })])).toBe("TECH_ALREADY_USED");
  });
});

describe("loadCeramic / reworkShape (resolution)", () => {
  it("loads into the Shared Kiln and emits a public CERAMIC_LOADED", () => {
    const draft = buildState({ ceramics: [{ owner: "p1", shape: "bowl", decoration: "carved", stage: "shaped" }] });
    const ctx = testContext();
    const loaded = loadCeramic(draft, "p1", shared("c1", "middle_1"), "glaze_load", ctx);
    expect(loaded).toMatchObject({
      id: "c1",
      stage: "loaded",
      shape: "bowl",
      decoration: "carved",
      glaze: "celadon",
      loadedBy: "glaze_load",
      loadedInRound: 1,
      placement: { kiln: "shared", spaceId: "middle_1", stacked: false },
      kilnMasterMarker: null,
    });
    expect(ceramic(draft, "c1")).toEqual(loaded);
    expect(draft.sharedKiln.spaces.middle_1.ceramicIds).toEqual(["c1"]);
    expect(ctx.events).toEqual([
      {
        type: "CERAMIC_LOADED",
        playerId: "p1",
        ceramicId: "c1",
        glaze: "celadon",
        placement: { kiln: "shared", spaceId: "middle_1", stacked: false },
        loadedBy: "glaze_load",
      },
    ]);
    expect(ctx.events.map(projectEvent)).toEqual(ctx.events);
  });

  it("records the public Imperial modifier on the ceramic (R11)", () => {
    const draft = buildState({ players: [{ recognition: 2 }, {}], ceramics: [{ owner: "p1", shape: "vase", stage: "shaped" }] });
    const ctx = testContext();
    const loaded = loadCeramic(draft, "p1", imperial("c1", -1), "glaze_load", ctx);
    expect(loaded.placement).toEqual({ kiln: "imperial", imperialModifier: -1 });
    expect(ctx.events[0]).toMatchObject({ type: "CERAMIC_LOADED", placement: { kiln: "imperial", imperialModifier: -1 } });
    expect(KILN_SPACE_IDS.every((space) => draft.sharedKiln.spaces[space].ceramicIds.length === 0)).toBe(true);
    expect(imperialKilnEmpty(draft, "p1")).toBe(false);
  });

  it("returns the owner's Setter's Mark when they load there (L636)", () => {
    const draft = buildState({ players: [{ techs: ["T22"] }, {}], ceramics: [{ owner: "p1", shape: "bowl", stage: "shaped" }], settersMarks: { high_2: "p1" } });
    const ctx = testContext();
    loadCeramic(draft, "p1", shared("c1", "high_2"), "glaze_load", ctx);
    expect(draft.sharedKiln.spaces.high_2.setterMarkOwnerId).toBeNull();
    expect(ctx.events.map((e) => e.type)).toEqual(["CERAMIC_LOADED", "SETTERS_MARK_RETURNED"]);
    expect(ctx.events[1]).toEqual({ type: "SETTERS_MARK_RETURNED", playerId: "p1", spaceId: "high_2", cause: "loaded_there" });
  });

  it("stacks with Inverted Firing and places Kiln Furniture on the space (R8)", () => {
    const draft = buildState({
      players: [{ techs: ["T21"] }, { techs: ["T15"] }],
      ceramics: [
        { owner: "p1", shape: "vase", stage: "loaded", glaze: "white", at: "high_1" },
        { owner: "p1", shape: "plate", stage: "shaped" },
        { owner: "p2", shape: "vase", stage: "shaped" },
      ],
    });
    const ctx = testContext();
    const stacked = loadCeramic(draft, "p1", shared("c2", "high_1", { invertedFiring: true }), "glaze_load", ctx);
    expect(stacked.placement).toEqual({ kiln: "shared", spaceId: "high_1", stacked: true });
    expect(draft.sharedKiln.spaces.high_1.ceramicIds).toEqual(["c1", "c2"]);
    expect(player(draft, "p1").techs.find((t) => t.id === "T21")?.usedThisRound).toBe(true);
    loadCeramic(draft, "p2", shared("c3", "low_1", { kilnFurniture: -1 }), "glaze_load", ctx);
    expect(draft.sharedKiln.spaces.low_1.kilnFurniture).toEqual({ ownerId: "p2", modifier: -1, underCeramicId: "c3" });
    expect(player(draft, "p2").techs.find((t) => t.id === "T15")?.usedThisRound).toBe(true);
    expect(ctx.events.map((e) => e.type)).toEqual([
      "TECH_USED",
      "CERAMIC_LOADED",
      "CERAMIC_LOADED",
      "TECH_USED",
      "KILN_FURNITURE_PLACED",
    ]);
    expect(ctx.events[4]).toEqual({ type: "KILN_FURNITURE_PLACED", playerId: "p2", spaceId: "low_1", modifier: -1 });
  });

  it("reworks before loading: returns the Vessel card, takes the new Shape, keeps the Decoration", () => {
    const draft = buildState({
      players: [{ techs: ["T05", "T21"] }, {}],
      ceramics: [
        { owner: "p1", shape: "vase", decoration: "painted", stage: "shaped" },
        { owner: "p1", shape: "plate", stage: "loaded", glaze: "white", at: "middle_1" },
      ],
    });
    expect(ceramic(draft, "c1").vesselInstanceId).toBe("vase-01");
    const clayBefore = player(draft, "p1").resources.clay;
    const ctx = testContext();
    const loaded = loadCeramic(draft, "p1", shared("c1", "middle_1", { invertedFiring: true }, "bowl"), "glaze_load", ctx);
    expect(loaded).toMatchObject({ shape: "bowl", decoration: "painted", vesselInstanceId: "bowl-01" });
    expect(draft.vesselSupply.vase[0]).toBe("vase-01");
    expect(player(draft, "p1").resources.clay).toBe(clayBefore);
    expect(ctx.events.map((e) => e.type)).toEqual(["TECH_USED", "CERAMIC_RESHAPED", "TECH_USED", "CERAMIC_LOADED"]);
    expect(ctx.events[1]).toEqual({ type: "CERAMIC_RESHAPED", playerId: "p1", ceramicId: "c1", from: "vase", to: "bowl" });
  });

  it("reworkShape with an exhausted supply takes a proxy; a reworked proxy vanishes (L350)", () => {
    const draft = buildState({ players: [{ techs: ["T05"] }, {}], ceramics: [{ owner: "p1", shape: "vase", stage: "shaped" }] });
    draft.vesselSupply.censer = [];
    const ctx = testContext();
    reworkShape(draft, "c1", "censer", ctx);
    expect(ceramic(draft, "c1")).toMatchObject({ shape: "censer", vesselInstanceId: "censer-proxy-1" });
    expect(draft.nextProxySequence).toBe(2);
    expect(draft.vesselSupply.vase).toContain("vase-01");
    // A proxy is never added to a supply when it is reworked away.
    player(draft, "p1").techs[0]!.usedThisRound = false;
    reworkShape(draft, "c1", "bowl", testContext());
    expect(draft.vesselSupply.censer).toEqual([]);
    expect(ceramic(draft, "c1").vesselInstanceId).toBe("bowl-01");
  });

  it("refuses to resolve an illegal load (engine bug, not a rule outcome)", () => {
    const draft = buildState({ ceramics: [{ owner: "p2", shape: "vase", stage: "shaped" }] });
    expect(() => loadCeramic(draft, "p1", shared("c1", "high_1"), "glaze_load", testContext())).toThrow(InvariantError);
  });
});

describe("loadDestinationOptions (selector agreement with validateLoads)", () => {
  const spec: StateSpec = {
    players: [{ techs: ["T15"], recognition: 2 }, { techs: ["T22"] }],
    ceramics: [
      { owner: "p1", shape: "bowl", stage: "shaped" }, // c1
      { owner: "p1", shape: "vase", stage: "shaped" }, // c2
      { owner: "p2", shape: "vase", stage: "loaded", glaze: "white", at: "high_1" }, // c3
    ],
    settersMarks: { middle_1: "p2" },
  };

  it("lists open spaces in KILN_SPACE_IDS order, Kiln Furniture variants, then the Imperial Kiln", () => {
    const state = buildState(spec);
    const options = loadDestinationOptions(viewOf(state, "p1"), "p1", "c1", []);
    expect(options.map((o) => JSON.stringify(o.destination))).toEqual([
      '{"kiln":"shared","spaceId":"high_2"}',
      '{"kiln":"shared","spaceId":"high_2","kilnFurniture":-1}',
      '{"kiln":"shared","spaceId":"high_2","kilnFurniture":0}',
      '{"kiln":"shared","spaceId":"high_2","kilnFurniture":1}',
      '{"kiln":"shared","spaceId":"low_1"}',
      '{"kiln":"shared","spaceId":"low_1","kilnFurniture":-1}',
      '{"kiln":"shared","spaceId":"low_1","kilnFurniture":0}',
      '{"kiln":"shared","spaceId":"low_1","kilnFurniture":1}',
      '{"kiln":"imperial","imperialModifier":-1}',
      '{"kiln":"imperial","imperialModifier":0}',
      '{"kiln":"imperial","imperialModifier":1}',
    ]);
    expect(options[0]).toMatchObject({ modifier: 1, requiresInvertedFiring: false, returnsSettersMark: false });
    expect(options[1]?.modifier).toBe(-1);
    expect(options[4]).toMatchObject({ modifier: -1, returnsSettersMark: false });
    expect(options[8]?.modifier).toBe(-1);
  });

  it("flags the space whose Setter's Mark the load would return (L636)", () => {
    const state = buildState({
      players: [{ techs: ["T22"] }, { techs: ["T22"] }],
      ceramics: [{ owner: "p1", shape: "bowl", stage: "shaped" }],
      settersMarks: { high_1: "p1", high_2: "p2" },
    });
    const options = loadDestinationOptions(viewOf(state, "p1"), "p1", "c1", []);
    expect(options.map((o) => [o.destination.kiln === "shared" ? o.destination.spaceId : "imperial", o.returnsSettersMark])).toEqual([
      ["high_1", true],
      ["middle_1", false],
      ["low_1", false],
    ]);
  });

  it("follows the earlier loads of the same action (R8)", () => {
    const state = buildState(spec);
    const first = shared("c2", "high_2", { kilnFurniture: 0 });
    const options = loadDestinationOptions(viewOf(state, "p1"), "p1", "c1", [first]);
    expect(options.map((o) => JSON.stringify(o.destination))).toEqual([
      '{"kiln":"shared","spaceId":"low_1"}',
      '{"kiln":"imperial","imperialModifier":-1}',
      '{"kiln":"imperial","imperialModifier":0}',
      '{"kiln":"imperial","imperialModifier":1}',
    ]);
    expect(loadDestinationOptions(viewOf(state, "p1"), "p1", "c1", [imperial("c2")]).some((o) => o.destination.kiln === "imperial")).toBe(false);
    // Illegal earlier loads, an unknown ceramic or an illegal rework offer nothing.
    expect(loadDestinationOptions(viewOf(state, "p1"), "p1", "c1", [shared("c2", "middle_1")])).toEqual([]);
    expect(loadDestinationOptions(viewOf(state, "p1"), "p1", "c99", [])).toEqual([]);
    expect(loadDestinationOptions(viewOf(state, "p1"), "p1", "c1", [], "plate")).toEqual([]); // no Reworking Table
  });

  it("offers Inverted Firing on a reworked Shape and reports a Kiln Furniture tile in the space", () => {
    const state = buildState({
      players: [{ techs: ["T05", "T21"] }, { techs: ["T15"] }],
      ceramics: [
        { owner: "p1", shape: "vase", stage: "shaped" }, // c1
        { owner: "p1", shape: "vase", stage: "loaded", glaze: "white", at: "high_1" }, // c2
        ...P2_FILLS_KILN.slice(1),
      ],
    });
    expect(loadDestinationOptions(viewOf(state, "p1"), "p1", "c1", [])).toEqual([]);
    const reworked = loadDestinationOptions(viewOf(state, "p1"), "p1", "c1", [], "washer");
    expect(reworked).toEqual([
      {
        destination: { kiln: "shared", spaceId: "high_1", invertedFiring: true },
        modifier: 1,
        requiresInvertedFiring: true,
        returnsSettersMark: false,
      },
    ]);
  });

  it("agrees with validateLoads for every candidate destination", () => {
    const state = buildState(spec);
    const view = actorViewOf(state, "p1");
    const offered = new Set(loadDestinationOptions(view, "p1", "c1", []).map((o) => JSON.stringify(o.destination)));
    for (const spaceId of KILN_SPACE_IDS) {
      for (const extra of [{}, { kilnFurniture: 1 as const }, { invertedFiring: true }]) {
        const load = shared("c1", spaceId, extra);
        expect(validateLoads(view, [load], 1, "glaze_load") === null, JSON.stringify(load.destination)).toBe(
          offered.has(JSON.stringify(load.destination)),
        );
      }
    }
  });
});

describe("determinism: no rule order from Record keys (DESIGN §2.3, §7)", () => {
  it("options and legality are identical after a jsonb-style key-sorted round trip", () => {
    const state = buildState({
      players: [{ techs: ["T15"], recognition: 2 }, { techs: ["T22"] }],
      ceramics: [
        { owner: "p1", shape: "bowl", stage: "shaped" },
        { owner: "p2", shape: "vase", stage: "loaded", glaze: "white", at: "high_1" },
      ],
      settersMarks: { middle_1: "p2" },
    });
    const sorted = keySorted(state);
    expect(Object.keys(sorted.sharedKiln.spaces)).not.toEqual(Object.keys(state.sharedKiln.spaces));
    expect(loadDestinationOptions(viewOf(sorted, "p1"), "p1", "c1", [])).toEqual(loadDestinationOptions(viewOf(state, "p1"), "p1", "c1", []));
    expect(hasAnyLegalLoad(sorted, "p1")).toBe(hasAnyLegalLoad(state, "p1"));
    const loads = [shared("c1", "low_1", { kilnFurniture: 1 })];
    expect(validateLoads(actorViewOf(sorted, "p1"), loads, 2, "glaze_load")).toEqual(validateLoads(actorViewOf(state, "p1"), loads, 2, "glaze_load"));
  });
});
