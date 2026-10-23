/**
 * Heat adjustment, Appendix D step 8 (L246, L478, L679–680): Jun Kiln, once per round, after
 * Actual Heat (markers included) and before Quality, pays 1 Wood to adjust one of its own
 * ceramics' Actual Heat by ±1. Optional (R4). The Second Firing case (R7) is in
 * `after_quality.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { junOptions } from "../../../src/game/firing/pipeline.ts";
import type { StateSpec } from "./support/fixtures.ts";
import { eventsOfType, openFiringTable, tendAll, typesOf } from "./support/firing.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

/** p1 has the Jun Kiln: c1 Celadon in High (Actual 3, Fine), c2 Imperial White (die 2 → Actual 2,
 * Fine), and a Finished ceramic c4; p2 has c3 Celadon in Middle (Masterpiece). Fire 0. */
function junSpec(extra: Partial<StateSpec> = {}): StateSpec {
  return {
    players: [{ kilnId: "JU", recognition: 2 }, {}],
    fireDeck: [0],
    ceramics: [
      { owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "high_1" },
      { owner: "p1", stage: "loaded", shape: "vase", glaze: "white", at: "imperial" },
      { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
      { owner: "p1", stage: "finished", shape: "plate", glaze: "white", quality: "standard" },
    ],
    ...extra,
  };
}

describe("the Jun window (L478, L679)", () => {
  it("opens after Actual Heat and before any Quality is assigned", () => {
    const table = openFiringTable(junSpec());
    const events = tendAll(table);
    expect(typesOf(events).slice(-2)).toEqual(["FIRE_REVEALED", "ACTUAL_HEAT_CALCULATED"]);
    expect(typesOf(events)).not.toContain("QUALITY_ASSIGNED");
    expect(table.state.phase).toEqual({ type: "firing_heat_adjustment", queue: { actorIds: ["p1"], index: 0 } });
    expect(junOptions(table.view("p1"))).toEqual({ during: "first_firing", ready: true, woodCost: 1, ceramicIds: ["c1", "c2"] });
    expect(junOptions(table.view("p2"))).toBeNull();
  });

  it("pays 1 Wood and adjusts one ceramic by ±1, changing its Quality only", () => {
    const table = openFiringTable(junSpec());
    tendAll(table);
    const events = table.act("p1", { type: "RESOLVE_JUN", adjustment: { ceramicId: "c1", delta: -1 } });
    expect(events.slice(0, 3)).toEqual([
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: -1, coins: 0, reason: "jun" },
      { type: "KILN_ABILITY_USED", playerId: "p1", kilnId: "JU" },
      { type: "JUN_ADJUSTED", playerId: "p1", ceramicId: "c1", delta: -1, finalActualHeat: 2, during: "first_firing" },
    ]);
    expect(eventsOfType(events, "QUALITY_ASSIGNED").map((e) => [e.ceramicId, e.quality, e.heatDifference])).toEqual([
      ["c1", "masterpiece", 0],
      ["c2", "fine", 1],
      ["c3", "masterpiece", 0],
    ]);
    const record = (table.state.lastFiring ?? table.state.firing)?.ceramics["c1"];
    expect(record?.first).toMatchObject({ actualHeat: 3, junAdjustment: -1, finalActualHeat: 2, heatDifference: 0 });
    expect(table.player("p1").kilnAbilityUsedThisRound).toBe(true);
    expect(table.player("p1").resources.wood).toBe(2);
  });

  it("applies on top of the Kiln Master marker (rev. 4 L478, L635) and works on an Imperial ceramic", () => {
    const table = openFiringTable(
      junSpec({
        players: [{ kilnId: "JU", recognition: 2, techs: [{ id: "T24", usedThisRound: true }] }, {}],
        ceramics: [
          { owner: "p1", stage: "loaded", shape: "vase", glaze: "moon_white", at: "imperial", kilnMaster: 1 },
          { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
        ],
      }),
    );
    // p1 has only an Imperial ceramic: not a participant, but in this firing (L290).
    tendAll(table);
    const events = table.act("p1", { type: "RESOLVE_JUN", adjustment: { ceramicId: "c1", delta: 1 } });
    // Imperial: die 2 + Fire 0 + 0 + marker 1 = 3, Jun +1 = 4 = Moon White's Preferred Heat.
    expect(eventsOfType(events, "JUN_ADJUSTED")[0]).toMatchObject({ ceramicId: "c1", delta: 1, finalActualHeat: 4 });
    expect(eventsOfType(events, "QUALITY_ASSIGNED")[0]).toMatchObject({ ceramicId: "c1", quality: "masterpiece", heatDifference: 0 });
  });

  it("declining costs nothing and keeps the once-per-round use (R4)", () => {
    const table = openFiringTable(junSpec());
    tendAll(table);
    const events = table.act("p1", { type: "RESOLVE_JUN", adjustment: null });
    expect(typesOf(events)).not.toContain("JUN_ADJUSTED");
    expect(typesOf(events)).not.toContain("KILN_ABILITY_USED");
    expect(eventsOfType(events, "QUALITY_ASSIGNED")[0]).toMatchObject({ ceramicId: "c1", quality: "fine", heatDifference: 1 });
    expect(table.player("p1").kilnAbilityUsedThisRound).toBe(false);
    expect(table.player("p1").resources.wood).toBe(3);
  });
});

describe("eligibility (L478, DESIGN §3.3 step 8)", () => {
  it.each([
    ["without Wood", junSpec({ players: [{ kilnId: "JU", recognition: 2, resources: { wood: 0 } }, {}] })],
    ["after Jun was used this round", junSpec({ players: [{ kilnId: "JU", recognition: 2, kilnAbilityUsedThisRound: true }, {}] })],
    [
      "without a ceramic in this firing",
      junSpec({
        ceramics: [
          { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
          { owner: "p1", stage: "finished", shape: "plate", glaze: "white", quality: "standard" },
        ],
      }),
    ],
    ["for any other Kiln", junSpec({ players: [{ kilnId: "GE", recognition: 2 }, {}] })],
  ])("no window opens %s: Quality follows immediately", (_label, scenario) => {
    const table = openFiringTable(scenario);
    const events = tendAll(table);
    expect(typesOf(events)).toContain("QUALITY_ASSIGNED");
    expect(table.state.phase.type).not.toBe("firing_heat_adjustment");
  });
});

describe("RESOLVE_JUN validation", () => {
  it("targets only your own ceramics in this firing", () => {
    const table = openFiringTable(junSpec());
    tendAll(table);
    for (const [ceramicId, code] of [
      ["c3", "CERAMIC_NOT_OWNED"],
      ["c4", "INVALID_TARGET"],
      ["c9", "CERAMIC_NOT_FOUND"],
    ] as const) {
      expectDocumentedDetails(table.expectRuleError("p1", { type: "RESOLVE_JUN", adjustment: { ceramicId, delta: 1 } }, code));
    }
  });

  it("checks the Kiln, its once-per-round use and the Wood (each unreachable through the queue)", () => {
    const table = openFiringTable(junSpec());
    tendAll(table);
    const p1 = table.state.players["p1"]!;
    p1.resources.wood = 0;
    expectDocumentedDetails(table.expectRuleError("p1", { type: "RESOLVE_JUN", adjustment: { ceramicId: "c1", delta: 1 } }, "INSUFFICIENT_RESOURCES"));
    p1.kilnAbilityUsedThisRound = true;
    expectDocumentedDetails(table.expectRuleError("p1", { type: "RESOLVE_JUN", adjustment: { ceramicId: "c1", delta: 1 } }, "ABILITY_ALREADY_USED"));
    p1.kilnId = "RU";
    expectDocumentedDetails(table.expectRuleError("p1", { type: "RESOLVE_JUN", adjustment: { ceramicId: "c1", delta: 1 } }, "KILN_ABILITY_NOT_OWNED"));
    // Declining stays legal (DESIGN §3.6).
    expect(table.tryAct("p1", { type: "RESOLVE_JUN", adjustment: null }).ok).toBe(true);
  });

  it("is not available outside its windows", () => {
    const table = openFiringTable(
      junSpec({
        players: [{ kilnId: "JU", recognition: 2 }, { techs: ["T13"] }],
        ceramics: [
          { owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "high_1" },
          { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
        ],
      }),
    );
    tendAll(table);
    // Test Pieces comes before the Fire card, and so before Jun (rev. 4 L626, L661).
    expect(table.state.phase.type).toBe("firing_test_pieces");
    table.expectRuleError("p1", { type: "RESOLVE_JUN", adjustment: { ceramicId: "c1", delta: 1 } }, "WRONG_PHASE");
    expect(junOptions(table.view("p1"))).toBeNull();
  });
});
