/**
 * B2's read helpers (`src/app/table/tableData.ts`): ceramics (CR B2-1, `model.ceramics`), the
 * deferred display refill (CR B2-2, `board.refillPendingFor`), board workers and the next free personal space. Pure
 * functions over `GameModel`; no rule is decided.
 */
import { describe, expect, it } from "vitest";
import { buildGameModel } from "../../../../src/app/state/model.ts";
import type { GameModel } from "../../../../src/app/state/model.ts";
import { boardWorkers, nextFreePersonalSpace, summaryOf, tableCeramics } from "../../../../src/app/table/tableData.ts";
import { fixture } from "../support/fixtures.ts";

function modelOf(id: string): GameModel {
  return buildGameModel(structuredClone(fixture(id).playerView), []);
}

describe("tableCeramics (model.ceramics, CR B2-1)", () => {
  it("reads every ceramic from model.ceramics, every stage included", () => {
    const view = structuredClone(fixture("m1_work_phase_r2_3p").playerView);
    const model = buildGameModel(view, []);
    expect(model.ceramics).toBe(view.game.ceramics);
    const ceramics = tableCeramics(model);
    expect(ceramics.byId.size).toBe(Object.keys(view.game.ceramics).length);
    // Every ceramic as the model holds it, its Vessel-card facts unchanged.
    for (const ceramic of Object.values(view.game.ceramics)) {
      expect(ceramics.byId.get(ceramic.id), ceramic.id).toMatchObject({ shape: ceramic.shape, decoration: ceramic.decoration, stage: ceramic.stage, ownerId: ceramic.ownerId });
    }
    const finished = Object.values(view.game.ceramics).find((ceramic) => ceramic.stage === "finished");
    expect(finished).toBeDefined();
    if (finished?.stage === "finished") expect(ceramics.labelView.ceramics?.[finished.id]).toMatchObject({ quality: finished.quality, glaze: finished.glaze });
    expect(Object.values(view.game.ceramics).some((ceramic) => ceramic.stage === "shaped")).toBe(true);
  });

  it("keeps only Vessel-card facts and the Heat markers of loaded ceramics", () => {
    const view = structuredClone(fixture("m3_heat_marker_step_3p").playerView);
    const ceramics = tableCeramics(buildGameModel(view, []));
    const loaded = Object.values(view.game.ceramics).filter((ceramic) => ceramic.stage === "loaded");
    expect(loaded.length).toBeGreaterThan(0);
    for (const ceramic of loaded) if (ceramic.heatMarker !== null) expect(ceramics.markers.get(ceramic.id)).toEqual(ceramic.heatMarker);
    for (const facts of ceramics.byId.values()) {
      expect(Object.keys(facts).every((key) => ["id", "ownerId", "shape", "decoration", "glaze", "quality", "crackle", "stage", "placement"].includes(key))).toBe(true);
    }
  });

  it("merges this firing's recorded Quality into loaded ceramics (steps 9–11)", () => {
    const model = modelOf("m4_after_quality_3p");
    const stage = model.firingStage;
    expect(stage).not.toBeNull();
    const ceramics = tableCeramics(model);
    for (const fired of stage!.ceramics) {
      const facts = ceramics.byId.get(fired.id);
      if (facts === undefined || facts.stage !== "loaded") continue;
      expect(facts.quality ?? null).toBe(fired.quality);
    }
  });

  it("is memoised per model", () => {
    const model = modelOf("m1_work_phase_r2_3p");
    expect(tableCeramics(model)).toBe(tableCeramics(model));
  });
});

describe("board.refillPendingFor (CR B2-2)", () => {
  it("names the reserving player while a reserved position is empty (m2 after its reservation)", () => {
    const id = "d-commission-after-face-up-reservation";
    expect(fixture(id).playerView.game.market.refillPendingFor).toBe("p3");
    expect(modelOf(id).board.refillPendingFor).toBe("p3");
    // During the look nothing is reserved yet.
    expect(modelOf("m2_commission_market_look_r3_4p").board.refillPendingFor).toBeNull();
  });

  it("is null with a full display, and when the piles ran out (no reservation pending)", () => {
    expect(modelOf("m1_work_phase_r2_3p").board.refillPendingFor).toBeNull();
    const id = "t-empty-main-supply";
    expect(fixture(id).playerView.game.market.refillPendingFor).toBeNull();
    expect(modelOf(id).board.refillPendingFor).toBeNull();
  });
});

describe("boardWorkers", () => {
  it("lists the Shifu first, placed workers with their location, never an ID (m5)", () => {
    const model = modelOf("m5_two_player_board_2p");
    const lin = boardWorkers(model, summaryOf(model, "p1")!);
    expect(lin).toHaveLength(4);
    expect(lin[0]).toEqual({ kind: "shifu", placedAt: "form_decorate", senior: false });
    expect(lin.filter((worker) => worker.placedAt === null)).toEqual([{ kind: "apprentice", placedAt: null, senior: false }]);
    expect(lin.map((worker) => worker.placedAt).sort()).toEqual(["form_decorate", "glaze_load", "materials_yard", null].sort());
    expect(JSON.stringify(lin)).not.toMatch(/p\d:/);
  });

  it("shows four available workers between rounds (m7)", () => {
    const model = modelOf("m7_cleanup_hand_limit_3p");
    const wen = boardWorkers(model, summaryOf(model, "p3")!);
    expect(wen.map((worker) => worker.kind)).toEqual(["shifu", "apprentice", "apprentice", "apprentice"]);
    expect(wen.every((worker) => worker.placedAt === null)).toBe(true);
  });
});

describe("nextFreePersonalSpace", () => {
  it("is the first added, empty space", () => {
    const model = modelOf("m1_work_phase_r2_3p");
    const wen = summaryOf(model, "p3")!;
    // Wen's Apprentice stands on the first Form & Decorate space; the second, added by a Tech, is free.
    expect(wen.personalSpaces.find((space) => space.locationId === "form_decorate" && space.spaceIndex === 0)?.occupant).not.toBeNull();
    expect(nextFreePersonalSpace(wen, "form_decorate")).toBe(1);
    expect(nextFreePersonalSpace(wen, "glaze_load")).toBe(0);
    const m5 = modelOf("m5_two_player_board_2p");
    const lin = summaryOf(m5, "p1")!;
    const glaze = lin.personalSpaces.filter((space) => space.locationId === "glaze_load");
    const expected = glaze.find((space) => space.unlocked && space.occupant === null)?.spaceIndex ?? null;
    expect(nextFreePersonalSpace(lin, "glaze_load")).toBe(expected);
  });
});
