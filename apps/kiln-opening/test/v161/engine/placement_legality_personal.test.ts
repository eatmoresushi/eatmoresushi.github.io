/**
 * Personal-location placement legality (L142):
 * - Form & Decorate (L172, R4): Clay plus a Decoration payable for 1 vessel after every ready
 *   Workshop discount — Large Throwing Wheel (a Vase with 0 Clay), Decorator's Kit (a Carved
 *   with 1 Coin). Ding and the Shifu discount never make it legal.
 * - Glaze & Load (L183, R5 a/b/c): at least 1 Shaped vessel with a legal destination; current
 *   Shapes only (DESIGN §11 Q3).
 */

import { describe, expect, it } from "vitest";
import { canFormAny } from "../../../src/game/work/formDecorate.ts";
import type { GameAction, ResourceState } from "../../../src/game/types.ts";
import type { CeramicSpec, PlayerSpec, TechSpec } from "./support/fixtures.ts";
import { buildState, verdict } from "./workshop_support.ts";

const fd = (workerId: string, extra: Partial<Extract<GameAction, { type: "PLACE_FORM_DECORATE" }>> = {}): GameAction => ({
  type: "PLACE_FORM_DECORATE",
  workerId,
  vessels: [{ shape: "bowl", decoration: "plain" }],
  ...extra,
});

function withResources(resources: Partial<ResourceState>, techs: TechSpec[] = [], more: PlayerSpec = {}) {
  return buildState({ players: [{ resources, techs, ...more }, {}] });
}

describe("Form & Decorate: Clay and a Decoration for at least 1 vessel (L172)", () => {
  it("is legal with 1 Clay and 2 Coins; illegal with less", () => {
    expect(canFormAny(withResources({ clay: 1, coins: 2 }), "p1")).toBe(true);
    expect(canFormAny(withResources({ clay: 0, coins: 9 }), "p1")).toBe(false);
    expect(canFormAny(withResources({ clay: 9, coins: 1 }), "p1")).toBe(false);
    expect(verdict(withResources({ clay: 0, coins: 9 }), "p1", fd("p1:shifu"))).toBe("NO_MAIN_ACTION_POSSIBLE");
    expect(verdict(withResources({ clay: 9, coins: 1 }), "p1", fd("p1:apprentice:1"))).toBe("NO_MAIN_ACTION_POSSIBLE");
    expect(verdict(withResources({ clay: 1, coins: 2 }), "p1", fd("p1:apprentice:1"))).toBeNull();
  });

  it("counts a ready Large Throwing Wheel: a Vase with 0 Clay (R4)", () => {
    const state = withResources({ clay: 0, coins: 2 }, ["T01"]);
    expect(canFormAny(state, "p1")).toBe(true);
    const vase = fd("p1:apprentice:1", { vessels: [{ shape: "vase", decoration: "plain" }], useLargeThrowingWheel: true });
    expect(verdict(state, "p1", vase)).toBeNull();
    // Placement is legal; the command must still be affordable as given.
    expect(verdict(state, "p1", fd("p1:apprentice:1", { vessels: [{ shape: "vase", decoration: "plain" }] }))).toBe("INSUFFICIENT_RESOURCES");
    expect(canFormAny(withResources({ clay: 0, coins: 2 }, [{ id: "T01", usedThisRound: true }]), "p1")).toBe(false);
  });

  it("counts a ready Decorator's Kit: a Carved, Impressed or Painted vessel with 1 Coin (R4)", () => {
    const state = withResources({ clay: 1, coins: 1 }, ["T16"]);
    expect(canFormAny(state, "p1")).toBe(true);
    const carved = fd("p1:apprentice:1", { vessels: [{ shape: "plate", decoration: "carved" }], decoratorsKitVesselIndex: 0 });
    expect(verdict(state, "p1", carved)).toBeNull();
    expect(verdict(state, "p1", fd("p1:apprentice:1"))).toBe("INSUFFICIENT_RESOURCES");
    expect(canFormAny(withResources({ clay: 1, coins: 1 }, [{ id: "T16", usedThisRound: true }]), "p1")).toBe(false);
  });

  it("is not made legal by Ding or by the Shifu's two-vessel discount", () => {
    const ding = withResources({ clay: 5, coins: 1 }, [], { kilnId: "DI" });
    expect(verdict(ding, "p1", fd("p1:shifu", { dingExtra: { copyOfVesselIndex: 0, decoration: "plain" } }))).toBe("NO_MAIN_ACTION_POSSIBLE");
    expect(verdict(withResources({ clay: 2, coins: 1 }), "p1", fd("p1:shifu", { vessels: [{ shape: "bowl", decoration: "plain" }, { shape: "plate", decoration: "plain" }] }))).toBe(
      "NO_MAIN_ACTION_POSSIBLE",
    );
  });
});

describe("Glaze & Load: a Shaped vessel with a legal destination (L183, R5)", () => {
  const gl = (loads: Extract<GameAction, { type: "PLACE_GLAZE_LOAD" }>["loads"]): GameAction => ({
    type: "PLACE_GLAZE_LOAD",
    workerId: "p1:apprentice:1",
    loads,
  });
  const fill = (from = 0): CeramicSpec[] =>
    (["high_1", "high_2", "middle_1", "low_1"] as const).slice(from).map((at) => ({ owner: "p2", shape: "vase", stage: "loaded", glaze: "white", at }));

  it("needs a Shaped vessel of your own", () => {
    const none = buildState({ ceramics: [{ owner: "p2", shape: "bowl", stage: "shaped" }] });
    expect(verdict(none, "p1", gl([{ ceramicId: "c1", glaze: "white", destination: { kiln: "shared", spaceId: "high_1" } }]))).toBe(
      "NO_MAIN_ACTION_POSSIBLE",
    );
  });

  it("(a) an empty active space; refused when every space is full or another player's Mark holds it", () => {
    const open = buildState({ ceramics: [{ owner: "p1", shape: "bowl", stage: "shaped" }, ...fill(1)] });
    expect(verdict(open, "p1", gl([{ ceramicId: "c1", glaze: "white", destination: { kiln: "shared", spaceId: "high_1" } }]))).toBeNull();
    const full = buildState({ ceramics: [{ owner: "p1", shape: "bowl", stage: "shaped" }, ...fill()] });
    expect(verdict(full, "p1", gl([{ ceramicId: "c1", glaze: "white", destination: { kiln: "shared", spaceId: "high_1" } }]))).toBe(
      "NO_MAIN_ACTION_POSSIBLE",
    );
    const marked = buildState({
      players: [{}, { techs: ["T22"] }],
      ceramics: [{ owner: "p1", shape: "bowl", stage: "shaped" }, ...fill(1)],
      settersMarks: { high_1: "p2" },
    });
    expect(verdict(marked, "p1", gl([{ ceramicId: "c1", glaze: "white", destination: { kiln: "shared", spaceId: "high_1" } }]))).toBe(
      "NO_MAIN_ACTION_POSSIBLE",
    );
  });

  it("(b) your own empty Imperial Kiln alone", () => {
    const state = buildState({ players: [{ recognition: 2 }, {}], ceramics: [{ owner: "p1", shape: "censer", stage: "shaped" }, ...fill()] });
    expect(verdict(state, "p1", gl([{ ceramicId: "c1", glaze: "white", destination: { kiln: "imperial", imperialModifier: 0 } }]))).toBeNull();
  });

  it("(c) a Bowl/Plate/Brush Washer with Inverted Firing ready onto 1 of your ceramics alone", () => {
    const ceramics: CeramicSpec[] = [
      { owner: "p1", shape: "plate", stage: "shaped" },
      { owner: "p1", shape: "vase", stage: "loaded", glaze: "white", at: "high_1" },
      ...fill(1),
    ];
    const load = gl([{ ceramicId: "c1", glaze: "white", destination: { kiln: "shared", spaceId: "high_1", invertedFiring: true } }]);
    expect(verdict(buildState({ players: [{ techs: ["T21"] }, {}], ceramics }), "p1", load)).toBeNull();
    expect(verdict(buildState({ players: [{ techs: [{ id: "T21", usedThisRound: true }] }, {}], ceramics }), "p1", load)).toBe(
      "NO_MAIN_ACTION_POSSIBLE",
    );
    expect(verdict(buildState({ ceramics }), "p1", load)).toBe("NO_MAIN_ACTION_POSSIBLE");
  });

  it("§11 Q3 default: a vessel Reworking Table could make stackable does not count", () => {
    const ceramics: CeramicSpec[] = [
      { owner: "p1", shape: "censer", stage: "shaped" },
      { owner: "p1", shape: "vase", stage: "loaded", glaze: "white", at: "high_1" },
      ...fill(1),
    ];
    const load = gl([{ ceramicId: "c1", glaze: "white", destination: { kiln: "shared", spaceId: "high_1", invertedFiring: true }, reworkShape: "bowl" }]);
    expect(verdict(buildState({ players: [{ techs: ["T05", "T21"] }, {}], ceramics }), "p1", load)).toBe("NO_MAIN_ACTION_POSSIBLE");
  });
});
