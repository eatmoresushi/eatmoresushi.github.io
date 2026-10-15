/**
 * The Heat-marker step (L59, L267–270, L641, L648, L676; R9; INT "Heat-marker step"):
 * First Player order; each face-down own marker is turned to +1/−1 or returned; Kiln Master
 * places its face-up marker on an own unmarked ceramic in this firing; the Fire card is then
 * revealed automatically (L677).
 */

import { describe, expect, it } from "vitest";
import { heatMarkerStepOptions } from "../../../src/game/firing/pipeline.ts";
import type { KilnSpaceId } from "../../../src/game/types.ts";
import type { CeramicSpec, StateSpec } from "./support/fixtures.ts";
import { eventsOfType, openFiringTable, tendAll, typesOf } from "./support/firing.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

const FACE_DOWN = { source: "own", faceDown: true } as const;

function marked(owner: string, at: KilnSpaceId): CeramicSpec {
  return { owner, stage: "loaded", shape: "bowl", glaze: "celadon", at, heatMarker: FACE_DOWN };
}

/** Three players with a face-down marker each; the First Player is p2. */
function threeMarkers(extra: Partial<StateSpec> = {}): StateSpec {
  return {
    players: 3,
    firstPlayerId: "p2",
    fireDeck: [0],
    ceramics: [
      marked("p1", "middle_1"),
      marked("p2", "middle_2"),
      { owner: "p2", stage: "loaded", shape: "plate", glaze: "celadon", at: "high_2" },
      marked("p3", "low_1"),
    ],
    ...extra,
  };
}

describe("own Heat markers (L268–270)", () => {
  it("resolve in First Player order: turn to +1/−1 or return; the Fire card follows automatically", () => {
    const table = openFiringTable(threeMarkers());
    tendAll(table);
    expect(table.state.phase).toEqual({ type: "firing_heat_markers", queue: { actorIds: ["p2", "p3", "p1"], index: 0 } });
    table.expectRuleError("p1", { type: "RESOLVE_HEAT_MARKERS", ownMarker: 1 }, "NOT_YOUR_DECISION");

    expect(table.act("p2", { type: "RESOLVE_HEAT_MARKERS", ownMarker: 1 })).toEqual([
      { type: "HEAT_MARKER_TURNED", playerId: "p2", ceramicId: "c2", value: 1 },
    ]);
    expect(table.state.ceramics["c2"]).toMatchObject({ heatMarker: { source: "own", faceDown: false, value: 1 } });
    // Later players see the earlier choices (one command per player, in order).
    expect(table.view("p3").game.ceramics["c2"]).toMatchObject({ heatMarker: { faceDown: false, value: 1 } });

    expect(table.act("p3", { type: "RESOLVE_HEAT_MARKERS", ownMarker: "return" })).toEqual([
      { type: "HEAT_MARKER_RETURNED", playerId: "p3", ceramicId: "c4" },
    ]);
    expect(table.state.ceramics["c4"]).toMatchObject({ heatMarker: null });

    const events = table.act("p1", { type: "RESOLVE_HEAT_MARKERS", ownMarker: -1 });
    expect(typesOf(events).slice(0, 3)).toEqual(["HEAT_MARKER_TURNED", "FIRE_REVEALED", "ACTUAL_HEAT_CALCULATED"]);
    const results = eventsOfType(events, "ACTUAL_HEAT_CALCULATED")[0]?.results ?? [];
    // Each marker changes only its own ceramic: c2 (+1) and c3 (no marker) share p2's Base
    // and Global Heat; c4's returned marker adds nothing.
    expect(results.map((r) => [r.ceramicId, r.calculation.heatMarker, r.calculation.actualHeat])).toEqual([
      ["c1", -1, 1],
      ["c2", 1, 3],
      ["c3", 0, 3],
      ["c4", 0, 1],
    ]);
  });

  it("a face-down marker must be resolved; a player without one may not name ownMarker", () => {
    const table = openFiringTable(
      threeMarkers({
        players: [{}, { techs: ["T24"] }, {}],
        firstPlayerId: "p1",
        ceramics: [marked("p1", "middle_1"), { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_2" }],
      }),
    );
    tendAll(table);
    expect(table.state.phase).toMatchObject({ queue: { actorIds: ["p1", "p2"] } });
    const missing = table.expectRuleError("p1", { type: "RESOLVE_HEAT_MARKERS" }, "INVALID_CHOICE");
    expectDocumentedDetails(missing);
    expect(missing.details).toMatchObject({ field: "ownMarker" });
    table.act("p1", { type: "RESOLVE_HEAT_MARKERS", ownMarker: 1 });
    expectDocumentedDetails(table.expectRuleError("p2", { type: "RESOLVE_HEAT_MARKERS", ownMarker: 1 }, "INVALID_CHOICE"));
    // p2 (Kiln Master owner) may decline everything (R4): the step ends and Fire is revealed.
    const events = table.act("p2", { type: "RESOLVE_HEAT_MARKERS" });
    expect(typesOf(events)[0]).toBe("FIRE_REVEALED");
    expect(table.player("p2").techs.find((t) => t.id === "T24")?.usedThisRound).toBe(false);
  });

  it("markers are returned when the ceramics leave the kiln (L270, L683)", () => {
    const table = openFiringTable(threeMarkers({ ceramics: [marked("p1", "middle_1"), { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_2" }] }));
    tendAll(table);
    table.act("p1", { type: "RESOLVE_HEAT_MARKERS", ownMarker: 1 });
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "firing_done" }]);
    expect(table.state.ceramics["c1"]).toMatchObject({ stage: "finished", quality: "fine" });
    expect("heatMarker" in (table.state.ceramics["c1"] ?? {})).toBe(false);
  });
});

/** p1 owns Kiln Master; c1 Shared (face-down own marker), c2 Imperial, c3 Shared unmarked. */
function kilnMasterSpec(): StateSpec {
  return {
    players: [{ techs: ["T24"], recognition: 2 }, {}],
    fireDeck: [0],
    ceramics: [
      marked("p1", "middle_1"),
      { owner: "p1", stage: "loaded", shape: "vase", glaze: "celadon", at: "imperial" },
      { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "high_1" },
      { owner: "p1", stage: "finished", shape: "bowl", glaze: "celadon", quality: "fine" },
    ],
  };
}

describe("Kiln Master (T24, L641, L648)", () => {
  it("places a face-up marker on an own unmarked ceramic in this firing; it is a Heat marker for all rules", () => {
    const table = openFiringTable(kilnMasterSpec());
    tendAll(table);
    expect(heatMarkerStepOptions(table.view("p1"))).toEqual({
      ownMarkerCeramicId: "c1",
      kilnMaster: { ready: true, targets: ["c2"], targetsIfOwnReturned: ["c1", "c2"] },
    });
    const events = table.act("p1", { type: "RESOLVE_HEAT_MARKERS", ownMarker: 1, kilnMaster: { ceramicId: "c2", value: -1 } });
    expect(typesOf(events).slice(0, 4)).toEqual(["HEAT_MARKER_TURNED", "TECH_USED", "KILN_MASTER_PLACED", "FIRE_REVEALED"]);
    expect(eventsOfType(events, "KILN_MASTER_PLACED")).toEqual([{ type: "KILN_MASTER_PLACED", playerId: "p1", ceramicId: "c2", value: -1 }]);
    const results = eventsOfType(events, "ACTUAL_HEAT_CALCULATED")[0]?.results ?? [];
    // Imperial: die 2 + Fire 0 + modifier 0 + Kiln Master −1 = 1.
    expect(results.find((r) => r.ceramicId === "c2")?.calculation).toMatchObject({ heatMarker: -1, actualHeat: 1 });
    expect(results.find((r) => r.ceramicId === "c1")?.calculation).toMatchObject({ heatMarker: 1, actualHeat: 3 });
  });

  it("may not share a ceramic with your own marker, unless that marker is returned first (INT)", () => {
    const table = openFiringTable(kilnMasterSpec());
    tendAll(table);
    const error = table.expectRuleError(
      "p1",
      { type: "RESOLVE_HEAT_MARKERS", ownMarker: 1, kilnMaster: { ceramicId: "c1", value: 1 } },
      "HEAT_MARKER_INVALID",
    );
    expectDocumentedDetails(error);
    expect(error.details).toMatchObject({ ceramicId: "c1", source: "own" });
    const events = table.act("p1", { type: "RESOLVE_HEAT_MARKERS", ownMarker: "return", kilnMaster: { ceramicId: "c1", value: 1 } });
    expect(typesOf(events).slice(0, 3)).toEqual(["HEAT_MARKER_RETURNED", "TECH_USED", "KILN_MASTER_PLACED"]);
    expect(eventsOfType(events, "ACTUAL_HEAT_CALCULATED")[0]?.results[0]?.calculation).toMatchObject({ heatMarker: 1, actualHeat: 3 });
  });

  it("targets only your own ceramics in this firing", () => {
    const table = openFiringTable(kilnMasterSpec());
    tendAll(table);
    expectDocumentedDetails(
      table.expectRuleError("p1", { type: "RESOLVE_HEAT_MARKERS", ownMarker: 1, kilnMaster: { ceramicId: "c3", value: 1 } }, "CERAMIC_NOT_OWNED"),
    );
    expectDocumentedDetails(
      table.expectRuleError("p1", { type: "RESOLVE_HEAT_MARKERS", ownMarker: 1, kilnMaster: { ceramicId: "c4", value: 1 } }, "INVALID_TARGET"),
    );
    expectDocumentedDetails(
      table.expectRuleError("p1", { type: "RESOLVE_HEAT_MARKERS", ownMarker: 1, kilnMaster: { ceramicId: "c99", value: 1 } }, "CERAMIC_NOT_FOUND"),
    );
  });

  it("is optional (R4) and once per round", () => {
    const declined = openFiringTable(kilnMasterSpec());
    tendAll(declined);
    declined.act("p1", { type: "RESOLVE_HEAT_MARKERS", ownMarker: -1 });
    expect(declined.player("p1").techs.find((t) => t.id === "T24")?.usedThisRound).toBe(false);

    const spent = kilnMasterSpec();
    spent.players = [{ techs: [{ id: "T24", usedThisRound: true }], recognition: 2 }, {}];
    const table = openFiringTable(spent);
    tendAll(table);
    expect(heatMarkerStepOptions(table.view("p1"))?.kilnMaster).toEqual({ ready: false, targets: [], targetsIfOwnReturned: [] });
    expectDocumentedDetails(
      table.expectRuleError("p1", { type: "RESOLVE_HEAT_MARKERS", ownMarker: 1, kilnMaster: { ceramicId: "c2", value: 1 } }, "TECH_ALREADY_USED"),
    );
    const noTech = openFiringTable({ ...kilnMasterSpec(), players: [{ recognition: 2 }, {}] });
    tendAll(noTech);
    expect(heatMarkerStepOptions(noTech.view("p1"))).toEqual({ ownMarkerCeramicId: "c1", kilnMaster: null });
    expectDocumentedDetails(
      noTech.expectRuleError("p1", { type: "RESOLVE_HEAT_MARKERS", ownMarker: 1, kilnMaster: { ceramicId: "c2", value: 1 } }, "TECH_NOT_OWNED"),
    );
  });

  it("queues a Kiln Master owner without an own marker only when an eligible ceramic exists", () => {
    const queued = openFiringTable({
      players: [{ techs: ["T24"] }, {}],
      fireDeck: [0],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "high_1" },
      ],
    });
    tendAll(queued);
    expect(queued.state.phase).toEqual({ type: "firing_heat_markers", queue: { actorIds: ["p1"], index: 0 } });
    expect(heatMarkerStepOptions(queued.view("p2"))).toBeNull();

    const notInFiring = openFiringTable({
      players: [{ techs: ["T24"] }, {}],
      fireDeck: [0],
      ceramics: [{ owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "high_1" }],
    });
    const events = tendAll(notInFiring);
    expect(eventsOfType(events, "FIRE_REVEALED")).toHaveLength(1);
  });
});
