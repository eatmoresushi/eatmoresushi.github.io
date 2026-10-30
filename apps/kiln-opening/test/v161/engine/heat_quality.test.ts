/**
 * Heat and Quality (L274–301, L310, L680–683, v1.6.2 L643–644): Base Heat clamp, Contribution
 * values (Fuel Ledger's free Bank and Stoke and its 2 cards, change 26), Actual Heat for the Shared Kiln (zone or Kiln
 * Furniture + marker) and the Imperial Kiln, the Quality table with Protective Saggars' floor,
 * Quality assignment, and the public heat previews.
 */

import { describe, expect, it } from "vitest";
import { TECHS, qualityForDifference } from "../../../src/game/content.ts";
import { InvariantError } from "../../../src/game/errors.ts";
import {
  baseHeat,
  contributionHeat,
  contributionWood,
  firingRecordsInOrder,
  heatCalculation,
  heatPreviews,
  positionFor,
  withJunAdjustment,
  qualityFor,
  saggarsFloored,
} from "../../../src/game/firing/heat.ts";
import { loadedCeramics } from "../../../src/game/state.ts";
import type { CeramicHeatResult, KilnDieFace, LoadedCeramic, Quality } from "../../../src/game/types.ts";
import { viewOf } from "../../../src/game/view.ts";
import { buildState } from "./support/fixtures.ts";
import { eventsOfType, openFiringTable, tendAll, typesOf } from "./support/firing.ts";

describe("baseHeat (L277, L291, L680)", () => {
  it.each([
    [1, 0, 1],
    [2, 0, 2],
    [3, 0, 3],
    [2, 1, 3],
    [2, -1, 1],
    [3, 2, 5],
    [3, 3, 5],
    [3, 6, 5],
    [1, -1, 0],
    [1, -4, 0],
  ] as const)("die %i + Σ %i → %i (clamped 0–5)", (die, sum, expected) => {
    expect(baseHeat(die as KilnDieFace, sum)).toBe(expected);
  });

  it("rejects a non-integer sum as an engine bug", () => {
    expect(() => baseHeat(2, 0.5)).toThrow(InvariantError);
  });
});

describe("Contribution values (v1.6.2 L285–289, L644, change 26)", () => {
  it("Bank −1 / 1 Wood, Tend 0 / 0, Stoke +1 / 1 Wood", () => {
    expect([contributionHeat({ card: "BANK" }), contributionWood({ card: "BANK" }, false)]).toEqual([-1, 1]);
    expect([contributionHeat({ card: "TEND" }), contributionWood({ card: "TEND" }, false)]).toEqual([0, 0]);
    expect([contributionHeat({ card: "STOKE" }), contributionWood({ card: "STOKE" }, false)]).toEqual([1, 1]);
  });

  it("a Fuel Ledger owner's Bank and Stoke cost no Wood; Tend is unchanged", () => {
    expect([contributionHeat({ card: "BANK" }), contributionWood({ card: "BANK" }, true)]).toEqual([-1, 0]);
    expect([contributionHeat({ card: "STOKE" }), contributionWood({ card: "STOKE" }, true)]).toEqual([1, 0]);
    expect([contributionHeat({ card: "TEND" }), contributionWood({ card: "TEND" }, true)]).toEqual([0, 0]);
  });

  it("Fuel Ledger Bank and Fuel Ledger Stoke are −2 / +2 for their printed 1 Wood", () => {
    expect([contributionHeat({ card: "FUEL_LEDGER_BANK" }), contributionWood({ card: "FUEL_LEDGER_BANK" }, true)]).toEqual([-2, 1]);
    expect([contributionHeat({ card: "FUEL_LEDGER_STOKE" }), contributionWood({ card: "FUEL_LEDGER_STOKE" }, true)]).toEqual([2, 1]);
    // The same options and prices as V1.6.2's commitment (change 26: "Same options and prices").
    expect(TECHS.T12.params).toEqual({ freeCards: ["BANK", "STOKE"], cards: ["FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"] });
  });
});

describe("Protective Saggars' floor (v1.6.2 L643)", () => {
  it.each([
    [0, "masterpiece", "masterpiece", false],
    [1, "fine", "fine", false],
    [2, "standard", "standard", false],
    [3, "flawed", "standard", true],
    [4, "flawed", "standard", true],
    [5, "flawed", "standard", true],
    [6, "flawed", "standard", true],
  ] as const)("difference %i: %s without Saggars, %s with it", (difference, plain, floored, applied) => {
    expect(qualityFor(difference, false)).toBe(plain);
    expect(qualityFor(-difference, false)).toBe(plain);
    expect(qualityFor(difference, true)).toBe(floored);
    expect(saggarsFloored(difference, true)).toBe(applied);
    expect(saggarsFloored(difference, false)).toBe(false);
  });
});

describe("heatCalculation and the Quality table (L87, L274, L295–300)", () => {
  it("sums source, position and the Kiln Master marker, then Jun, and takes the absolute Heat Difference (L273, L654)", () => {
    expect(heatCalculation({ fireModifier: 1, heatSource: 4, positionModifier: -1, kilnMasterMarker: 1, junAdjustment: -1, preferredHeat: 2 })).toEqual({
      fireModifier: 1,
      heatSource: 4,
      positionModifier: -1,
      kilnMasterMarker: 1,
      actualHeat: 4,
      junAdjustment: -1,
      finalActualHeat: 3,
      heatDifference: 1,
    });
    expect(heatCalculation({ fireModifier: -2, heatSource: 0, positionModifier: -1, kilnMasterMarker: -1, junAdjustment: 0, preferredHeat: 4 }).heatDifference).toBe(6);
  });

  it.each([
    [0, "masterpiece"],
    [1, "fine"],
    [-1, "fine"],
    [2, "standard"],
    [-2, "standard"],
    [3, "flawed"],
    [-5, "flawed"],
  ] as const)("Heat Difference %i → %s", (difference, quality) => {
    expect(qualityForDifference(difference)).toBe(quality);
  });

  it("withJunAdjustment keeps the Kiln Master marker and replaces only Jun's ±1 (L646, L654)", () => {
    const first = heatCalculation({ fireModifier: 0, heatSource: 2, positionModifier: 0, kilnMasterMarker: -1, junAdjustment: 0, preferredHeat: 2 });
    expect(withJunAdjustment(first, 1, 2)).toEqual({ ...first, junAdjustment: 1, finalActualHeat: 2, heatDifference: 0 });
  });
});

describe("positionFor (L95, L274, L310, L634, R8, R11)", () => {
  it("uses the printed zone modifier: High +1, Middle 0, Low −1", () => {
    const state = buildState({
      players: 4,
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "high_3" },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "white", at: "middle_3" },
        { owner: "p3", stage: "loaded", shape: "bowl", glaze: "white", at: "low_2" },
      ],
    });
    expect(loadedCeramics(state).map((c) => positionFor(state, c))).toEqual([
      { source: "zone", modifier: 1 },
      { source: "zone", modifier: 0 },
      { source: "zone", modifier: -1 },
    ]);
  });

  it("Kiln Furniture's chosen modifier replaces the zone modifier; the Imperial modifier is the one chosen at loading", () => {
    const state = buildState({
      players: [{ techs: ["T15"], recognition: 2 }, {}],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "vase", glaze: "white", at: "low_1", kilnFurniture: 1 },
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "imperial", imperialModifier: -1 },
      ],
    });
    const [furnished, imperial] = loadedCeramics(state) as [LoadedCeramic, LoadedCeramic];
    expect(positionFor(state, furnished)).toEqual({ source: "kiln_furniture", modifier: 1 });
    expect(positionFor(state, imperial)).toEqual({ source: "imperial", modifier: -1 });
  });
});

function results(events: Parameters<typeof eventsOfType>[0]): CeramicHeatResult[] {
  return eventsOfType(events, "ACTUAL_HEAT_CALCULATED")[0]?.results ?? [];
}

describe("Actual Heat in the firing (L274, L683)", () => {
  it("Shared: Global Heat + zone + Kiln Master marker; Global Heat is Base + Fire and unclamped (L277, L273)", () => {
    const table = openFiringTable({
      players: [{ techs: ["T12"], resources: { wood: 3 } }, { techs: [{ id: "T24", usedThisRound: true }] }],
      kilnDie: 3,
      fireDeck: [2],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "high_1" },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "white", at: "low_1", kilnMaster: -1 },
        { owner: "p2", stage: "loaded", shape: "plate", glaze: "grey_green", at: "middle_1" },
      ],
    });
    table.contribute("p1", "FUEL_LEDGER_STOKE");
    // Base Heat 3 + 3 = 6 → 5; nobody uses Test Pieces, so the Fire card follows at once.
    const events = table.contribute("p2", "STOKE");
    expect(eventsOfType(events, "BASE_HEAT_DETERMINED")[0]?.baseHeat).toBe(5);
    expect(eventsOfType(events, "FIRE_REVEALED")).toEqual([{ type: "FIRE_REVEALED", modifier: 2, baseHeat: 5, globalHeat: 7 }]);
    expect(results(events).map((r) => [r.ceramicId, r.calculation.heatSource, r.calculation.positionModifier, r.calculation.kilnMasterMarker, r.calculation.actualHeat])).toEqual([
      ["c1", 7, 1, 0, 8],
      ["c2", 7, -1, -1, 5],
      ["c3", 7, 0, 0, 7],
    ]);
    expect(table.state.lastFiring?.globalHeat ?? table.state.firing?.globalHeat).toBe(7);
  });

  it("Imperial: Kiln Die + Fire + Imperial modifier + Kiln Master marker, whatever the Contributions were (L310, R10, L310)", () => {
    const table = openFiringTable({
      players: [{ recognition: 2, techs: [{ id: "T24", usedThisRound: true }], resources: { wood: 4 } }, {}],
      kilnDie: 1,
      fireDeck: [-1],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "vase", glaze: "white", at: "imperial", imperialModifier: 1, kilnMaster: -1 },
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1" },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1" },
      ],
    });
    table.contribute("p1", "STOKE");
    const events = table.contribute("p2", "STOKE");
    expect(eventsOfType(events, "BASE_HEAT_DETERMINED")[0]?.baseHeat).toBe(3);
    // Imperial: 1 + (−1) + 1 + (−1) = 0, untouched by the two Stokes. Shared: 3 − 1 = 2.
    expect(results(events)).toEqual([
      {
        ceramicId: "c1",
        calculation: { fireModifier: -1, heatSource: 0, positionModifier: 1, kilnMasterMarker: -1, actualHeat: 0, junAdjustment: 0, finalActualHeat: 0, heatDifference: 1 },
      },
      {
        ceramicId: "c2",
        calculation: { fireModifier: -1, heatSource: 2, positionModifier: 1, kilnMasterMarker: 0, actualHeat: 3, junAdjustment: 0, finalActualHeat: 3, heatDifference: 2 },
      },
      {
        ceramicId: "c3",
        calculation: { fireModifier: -1, heatSource: 2, positionModifier: 0, kilnMasterMarker: 0, actualHeat: 2, junAdjustment: 0, finalActualHeat: 2, heatDifference: 1 },
      },
    ]);
  });

  it("Kiln Furniture's modifier replaces the zone and stacks with the Kiln Master marker (L634, L654)", () => {
    const table = openFiringTable({
      players: [{ techs: ["T15", { id: "T24", usedThisRound: true }] }, {}],
      fireDeck: [0],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_1", kilnFurniture: 1, kilnMaster: 1 },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
      ],
    });
    const events = tendAll(table);
    expect(results(events)[0]?.calculation).toMatchObject({ heatSource: 2, positionModifier: 1, kilnMasterMarker: 1, actualHeat: 4, heatDifference: 0 });
    expect(table.state.lastFiring?.ceramics["c1"]).toMatchObject({ positionSource: "kiln_furniture", quality: "masterpiece" });
  });
});

describe("Quality assignment (L295–300, L683)", () => {
  it("assigns every ceramic's Quality from its Heat Difference, in ceramic order", () => {
    // Base 2, Fire 0, Global 2. Middle spaces (0): White 1 → Fine, Celadon 2 → Masterpiece,
    // Grey-Green 3 → Fine; Low (−1): Moon White 4 → 1, Flawed; High (+1): White 1 → 3, Standard.
    // p4 owns Second Firing, so the firing stays open at p4's after-Quality turn.
    const table = openFiringTable({
      players: [{}, {}, {}, { techs: ["T14"] }],
      fireDeck: [0],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1" },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_2" },
        { owner: "p3", stage: "loaded", shape: "bowl", glaze: "grey_green", at: "middle_3" },
        { owner: "p4", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_1" },
        { owner: "p1", stage: "loaded", shape: "vase", glaze: "white", at: "high_1" },
      ],
    });
    const events = tendAll(table);
    expect(typesOf(events).filter((type) => type === "QUALITY_ASSIGNED")).toHaveLength(5);
    const assigned = eventsOfType(events, "QUALITY_ASSIGNED").map((e) => [e.ceramicId, e.quality, e.heatDifference, e.cause]);
    expect(assigned).toEqual([
      ["c1", "fine", 1, "fired"],
      ["c2", "masterpiece", 0, "fired"],
      ["c3", "fine", 1, "fired"],
      ["c4", "flawed", 3, "fired"],
      ["c5", "standard", 2, "fired"],
    ]);
    const firing = table.state.firing;
    expect(firing).not.toBeNull();
    if (firing === null) return;
    const qualities: Array<Quality | null> = firingRecordsInOrder(firing).map((record) => record.quality);
    expect(qualities).toEqual(["fine", "masterpiece", "fine", "flawed", "standard"]);
    expect(firing.ceramics["c4"]?.history).toEqual([{ cause: "fired", from: null, to: "flawed" }]);
    // Quality is recorded on the firing; the ceramics stay loaded until step 6 (L683).
    expect(table.state.ceramics["c4"]?.stage).toBe("loaded");
    // p3 (the default Ge Kiln) may crackle its Fine c3 (L482); p4 may Second-Fire c4.
    expect(table.state.phase).toEqual({ type: "firing_after_quality", queue: { actorIds: ["p3", "p4"], index: 0 } });
  });

  it("firingRecordsInOrder follows ceramic sequence, never key order (DESIGN §2.3)", () => {
    const table = openFiringTable({
      players: 2,
      ceramics: Array.from({ length: 3 }, (_, index) => ({
        owner: index % 2 === 0 ? "p1" : "p2",
        stage: "loaded" as const,
        shape: "bowl" as const,
        glaze: "white" as const,
        at: (["high_1", "high_2", "middle_1"] as const)[index] as "high_1" | "high_2" | "middle_1",
      })),
    });
    const firing = table.state.firing;
    if (firing === null) throw new Error("firing expected");
    // Reinsert in reverse key order; the helper still returns c1, c2, c3.
    const reversed = Object.fromEntries(Object.entries(firing.ceramics).reverse());
    expect(firingRecordsInOrder({ ...firing, ceramics: reversed }).map((r) => r.ceramicId)).toEqual(["c1", "c2", "c3"]);
  });
});

describe("heatPreviews (public information only)", () => {
  it("before the firing: Shared ceramics unknown, Imperial known from the public Kiln Die", () => {
    const state = buildState({
      players: [{ recognition: 2 }, {}],
      kilnDie: 3,
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "vase", glaze: "grey_green", at: "imperial", imperialModifier: -1 },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1" },
      ],
    });
    expect(heatPreviews(viewOf(state, null))).toEqual([
      {
        ceramicId: "c1",
        preferredHeat: 3,
        heatBeforeFire: 2,
        qualityByFire: { "-2": "flawed", "-1": "standard", "0": "fine", "1": "masterpiece", "2": "fine" },
      },
      { ceramicId: "c2", preferredHeat: 1, heatBeforeFire: null, qualityByFire: null },
    ]);
  });

  it("after Base Heat: known for every ceramic, the Kiln Master marker included (public since loading, L654)", () => {
    const table = openFiringTable({
      players: [{ techs: [{ id: "T24", usedThisRound: true }] }, { techs: ["T13"] }],
      fireDeck: [0],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "high_1", kilnMaster: 1 },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "low_1" },
      ],
    });
    tendAll(table);
    // Test Pieces pauses the firing after Base Heat and before the Fire card (L645).
    expect(table.state.phase.type).toBe("firing_test_pieces");
    const previews = heatPreviews(table.view("p2"));
    expect(previews[0]).toMatchObject({ ceramicId: "c1", preferredHeat: 2, heatBeforeFire: 4 });
    expect(previews[1]).toMatchObject({ ceramicId: "c2", heatBeforeFire: 1 });
    expect(previews[1]?.qualityByFire?.["1"]).toBe("masterpiece");
    // The same answer for every viewer: previews use public information only.
    expect(heatPreviews(table.view("p1"))).toEqual(previews);
    expect(heatPreviews(table.view(null))).toEqual(previews);
  });

  it("applies Protective Saggars' floor to its owner's ceramics only (v1.6.2 L643)", () => {
    const state = buildState({
      players: [{ recognition: 2, techs: ["T11"] }, { recognition: 2 }],
      kilnDie: 1,
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "vase", glaze: "moon_white", at: "imperial", imperialModifier: -1 },
        { owner: "p2", stage: "loaded", shape: "vase", glaze: "moon_white", at: "imperial", imperialModifier: -1 },
      ],
    });
    const [own, other] = heatPreviews(viewOf(state, null));
    // Die 1 − 1 = 0 before the Fire card, Moon White 4: differences 6, 5, 4, 3, 2.
    expect(own?.qualityByFire).toEqual({ "-2": "standard", "-1": "standard", "0": "standard", "1": "standard", "2": "standard" });
    expect(other?.qualityByFire).toEqual({ "-2": "flawed", "-1": "flawed", "0": "flawed", "1": "flawed", "2": "standard" });
  });
});
