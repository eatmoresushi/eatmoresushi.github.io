/**
 * Appendix D steps 10–12 (L280, L467–469, L637, L640, L654, L681–683; R4, R7): Protective
 * Saggars, Second Firing (incl. the R7 Jun window), Ge's Crackle in the owner's chosen order
 * with eligibility rechecked after each use, the optional 2-Coin salvage, and finishing.
 */

import { describe, expect, it } from "vitest";
import { afterQualityOptions, salvageOptions } from "../../../src/game/firing/afterQuality.ts";
import { junOptions } from "../../../src/game/firing/pipeline.ts";
import type { FireModifier, KilnId, TechId } from "../../../src/game/types.ts";
import { type PlayerSpec, type StateSpec, cardZones } from "./support/fixtures.ts";
import { eventsOfType, openFiringTable, tendAll, typesOf } from "./support/firing.ts";
import type { LocalTable } from "./support/localTable.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

/**
 * Three players; Base Heat 2 with Tend all round and the first Fire card 0 (Global 2):
 * - c1 p1 Moon White, Low → Actual 1, Flawed
 * - c2 p1 White, High → 3, Standard
 * - c3 p1 Celadon, High → 3, Fine
 * - c4 p1 Celadon, Middle → 2, Masterpiece
 * - c5 p2 Celadon, Middle → 2, Masterpiece
 * - c6 p1 Finished Standard from an earlier round (not in this firing)
 */
function aqSpec(p1: PlayerSpec, fire: FireModifier[] = [0], extra: Partial<StateSpec> = {}): StateSpec {
  return {
    players: [{ kilnId: "RU", ...p1 }, { kilnId: "GU" }, { kilnId: "DI" }],
    fireDeck: fire,
    ceramics: [
      { owner: "p1", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_1" },
      { owner: "p1", stage: "loaded", shape: "plate", glaze: "white", at: "high_1" },
      { owner: "p1", stage: "loaded", shape: "vase", glaze: "celadon", at: "high_2" },
      { owner: "p1", stage: "loaded", shape: "censer", glaze: "celadon", at: "middle_1" },
      { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_2" },
      { owner: "p1", stage: "finished", shape: "washer", glaze: "white", quality: "standard" },
    ],
    ...extra,
  };
}

function withTechs(techs: TechId[], kilnId: KilnId = "RU", resources: PlayerSpec["resources"] = {}): PlayerSpec {
  return { techs, kilnId, resources };
}

function record(table: LocalTable, ceramicId: string) {
  return (table.state.firing ?? table.state.lastFiring)?.ceramics[ceramicId];
}

function fireCount(table: LocalTable): number {
  return cardZones(table.state).fire.length;
}

describe("the after-Quality window (L681)", () => {
  it("opens for players with an eligible ability, in First Player order; nobody else is queued", () => {
    const table = openFiringTable(
      aqSpec(withTechs(["T11"]), [0], {
        firstPlayerId: "p2",
        players: [{ kilnId: "RU", techs: ["T11"] }, { kilnId: "GU", techs: ["T14"] }, { kilnId: "DI", techs: ["T13"] }],
        ceramics: [
          { owner: "p1", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_1" },
          { owner: "p2", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "middle_2" },
        ],
      }),
    );
    tendAll(table);
    expect(table.state.phase).toEqual({ type: "firing_after_quality", queue: { actorIds: ["p2", "p1"], index: 0 } });
    expect(afterQualityOptions(table.view("p2"))).toEqual([{ ability: "second_firing", ceramicIds: ["c2"], cost: { clay: 0, wood: 0, coins: 0 } }]);
    expect(afterQualityOptions(table.view("p1"))).toEqual([]);
    table.expectRuleError("p1", { type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c1" }, "NOT_YOUR_DECISION");
    // Ending the turn declines the rest (R4): Second Firing stays ready.
    table.act("p2", { type: "END_AFTER_QUALITY" });
    expect(table.player("p2").techs[0]?.usedThisRound).toBe(false);
    expect(table.state.phase).toEqual({ type: "firing_after_quality", queue: { actorIds: ["p2", "p1"], index: 1 } });
    expect(afterQualityOptions(table.view("p1"))).toEqual([
      { ability: "protective_saggars", ceramicIds: ["c1"], cost: { clay: 0, wood: 1, coins: 0 } },
    ]);
  });

  it("is skipped when nobody has an eligible ability", () => {
    const table = openFiringTable(aqSpec({}));
    const events = tendAll(table);
    expect(typesOf(events)).toContain("QUALITY_ASSIGNED");
    expect(table.state.phase).toMatchObject({ type: "firing_salvage", pendingPlayerIds: ["p1"] });
  });
});

describe("Protective Saggars (T11, L637, L651)", () => {
  it("pays 1 Wood to improve Flawed → Standard", () => {
    const table = openFiringTable(aqSpec(withTechs(["T11"])));
    tendAll(table);
    expect(afterQualityOptions(table.view("p1"))).toEqual([
      { ability: "protective_saggars", ceramicIds: ["c1", "c2"], cost: { clay: 0, wood: 1, coins: 0 } },
    ]);
    const events = table.act("p1", { type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c1" });
    expect(events.slice(0, 3)).toEqual([
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: -1, coins: 0, reason: "protective_saggars" },
      { type: "TECH_USED", playerId: "p1", techId: "T11" },
      { type: "QUALITY_IMPROVED", ceramicId: "c1", from: "flawed", to: "standard", cause: "protective_saggars" },
    ]);
    // Nothing else eligible: the turn passes automatically, nobody is still Flawed, the firing finishes.
    expect(typesOf(events).at(-1)).toBe("FIRING_FINISHED");
    expect(record(table, "c1")?.history).toEqual([
      { cause: "fired", from: null, to: "flawed" },
      { cause: "protective_saggars", from: "flawed", to: "standard" },
    ]);
    expect(table.state.ceramics["c1"]).toMatchObject({ stage: "finished", quality: "standard", crackle: false });
  });

  it("improves Standard → Fine; never to Masterpiece and never a Fine ceramic", () => {
    const table = openFiringTable(aqSpec(withTechs(["T11"])));
    tendAll(table);
    for (const [ceramicId, code] of [
      ["c3", "INVALID_TARGET"],
      ["c4", "INVALID_TARGET"],
      ["c5", "CERAMIC_NOT_OWNED"],
      ["c6", "INVALID_TARGET"],
    ] as const) {
      expectDocumentedDetails(table.expectRuleError("p1", { type: "USE_PROTECTIVE_SAGGARS", ceramicId }, code));
    }
    const events = table.act("p1", { type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c2" });
    expect(eventsOfType(events, "QUALITY_IMPROVED")).toEqual([
      { type: "QUALITY_IMPROVED", ceramicId: "c2", from: "standard", to: "fine", cause: "protective_saggars" },
    ]);
    // c1 is still Flawed, so the salvage window follows.
    expect(table.state.phase).toMatchObject({ type: "firing_salvage", pendingPlayerIds: ["p1"] });
  });

  it("needs 1 Wood: without it the window does not open (and the validator says so)", () => {
    const table = openFiringTable(aqSpec(withTechs(["T11"], "RU", { wood: 0 })));
    tendAll(table);
    expect(table.state.phase.type).toBe("firing_salvage");

    const forced = openFiringTable(aqSpec(withTechs(["T11"])));
    tendAll(forced);
    forced.state.players["p1"]!.resources.wood = 0;
    const error = forced.expectRuleError("p1", { type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c1" }, "INSUFFICIENT_RESOURCES");
    expectDocumentedDetails(error);
    forced.state.players["p1"]!.techs = [];
    expectDocumentedDetails(forced.expectRuleError("p1", { type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c1" }, "TECH_NOT_OWNED"));
  });
});

describe("Second Firing (T14, L640, L651)", () => {
  it("draws an extra card and recalculates with the same Base Heat, position and marker", () => {
    const table = openFiringTable(aqSpec(withTechs(["T14"]), [0, 2]));
    tendAll(table);
    const discardBefore = [...table.state.fireDiscard];
    const events = table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    expect(events.slice(0, 3)).toEqual([
      { type: "TECH_USED", playerId: "p1", techId: "T14" },
      {
        type: "SECOND_FIRING_REVEALED",
        playerId: "p1",
        ceramicId: "c1",
        modifier: 2,
        calculation: { fireModifier: 2, heatSource: 4, positionModifier: -1, heatMarker: 0, actualHeat: 3, junAdjustment: 0, finalActualHeat: 3, heatDifference: 1 },
      },
      { type: "QUALITY_ASSIGNED", ceramicId: "c1", quality: "fine", heatDifference: 1, cause: "second_firing" },
    ]);
    // It changes nothing for any other ceramic.
    expect(record(table, "c2")).toMatchObject({ quality: "standard", second: null });
    expect(record(table, "c1")?.first).toMatchObject({ fireModifier: 0, actualHeat: 1 });
    // The extra card is discarded after resolving; the round's card at step 12 (L683).
    expect(table.state.fireDiscard).toEqual([...discardBefore, 2, 0]);
    expect(fireCount(table)).toBe(12);
  });

  it("the new Quality replaces the old one even if worse", () => {
    const table = openFiringTable(aqSpec(withTechs(["T14"]), [0, 2]));
    tendAll(table);
    const events = table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c2" });
    expect(eventsOfType(events, "QUALITY_ASSIGNED")).toEqual([
      { type: "QUALITY_ASSIGNED", ceramicId: "c2", quality: "flawed", heatDifference: 4, cause: "second_firing" },
    ]);
    expect(record(table, "c2")?.history).toEqual([
      { cause: "fired", from: null, to: "standard" },
      { cause: "second_firing", from: "standard", to: "flawed" },
    ]);
    expect(table.state.phase).toMatchObject({ type: "firing_salvage", pendingPlayerIds: ["p1"] });
    expect(salvageOptions(table.view("p1"))).toEqual({ ceramicIds: ["c1", "c2"], coins: 2 });
  });

  it("keeps the Heat marker and the Kiln Furniture modifier (L268, L640)", () => {
    const table = openFiringTable({
      players: [{ techs: ["T14", "T15"] }, {}],
      fireDeck: [0, -1],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "low_1", kilnFurniture: 1, heatMarker: { source: "own", faceDown: true } },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
      ],
    });
    tendAll(table);
    table.act("p1", { type: "RESOLVE_HEAT_MARKERS", ownMarker: 1 });
    // First: 2 + Furniture 1 + marker 1 = 4 vs White 1 → Flawed.
    expect(record(table, "c1")?.quality).toBe("flawed");
    const events = table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    expect(eventsOfType(events, "SECOND_FIRING_REVEALED")[0]?.calculation).toEqual({
      fireModifier: -1,
      heatSource: 1,
      positionModifier: 1,
      heatMarker: 1,
      actualHeat: 3,
      junAdjustment: 0,
      finalActualHeat: 3,
      heatDifference: 2,
    });
    expect(eventsOfType(events, "QUALITY_ASSIGNED")[0]).toMatchObject({ quality: "standard" });
  });

  it("an Imperial ceramic uses the Kiln Die again, not Base Heat (L288)", () => {
    const table = openFiringTable({
      players: [{ techs: ["T14"], recognition: 2 }, {}],
      fireDeck: [0, 1],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "vase", glaze: "moon_white", at: "imperial", imperialModifier: -1 },
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "high_1" },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
      ],
    });
    table.contribute("p1", "STOKE");
    table.contribute("p2", "STOKE");
    expect(table.state.firing?.baseHeat).toBe(4);
    expect(record(table, "c1")?.quality).toBe("flawed");
    const events = table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    // Die 2 + extra 1 − 1 = 2 vs Moon White 4 → Standard (Base Heat 4 would have given 4).
    expect(eventsOfType(events, "SECOND_FIRING_REVEALED")[0]?.calculation).toMatchObject({ heatSource: 3, positionModifier: -1, actualHeat: 2 });
    expect(eventsOfType(events, "QUALITY_ASSIGNED")[0]).toMatchObject({ ceramicId: "c1", quality: "standard" });
  });

  it("does not carry Jun's first adjustment; with Jun spent there is no R7 window", () => {
    const table = openFiringTable(aqSpec(withTechs(["T14"], "JU"), [0, 0]));
    tendAll(table);
    table.act("p1", { type: "RESOLVE_JUN", adjustment: { ceramicId: "c1", delta: 1 } });
    expect(record(table, "c1")).toMatchObject({ quality: "standard", first: { junAdjustment: 1, finalActualHeat: 2 } });
    const events = table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    expect(eventsOfType(events, "SECOND_FIRING_REVEALED")[0]?.calculation).toMatchObject({ actualHeat: 1, junAdjustment: 0, heatDifference: 3 });
    expect(eventsOfType(events, "QUALITY_ASSIGNED")[0]).toMatchObject({ ceramicId: "c1", quality: "flawed", cause: "second_firing" });
    expect(table.state.phase.type).not.toBe("firing_second_firing_jun");
  });

  it("targets only your Flawed or Standard ceramics from this firing", () => {
    const table = openFiringTable(aqSpec(withTechs(["T14"]), [0, 0]));
    tendAll(table);
    for (const [ceramicId, code] of [
      ["c3", "INVALID_TARGET"],
      ["c4", "INVALID_TARGET"],
      ["c5", "CERAMIC_NOT_OWNED"],
      ["c6", "INVALID_TARGET"],
    ] as const) {
      expectDocumentedDetails(table.expectRuleError("p1", { type: "USE_SECOND_FIRING", ceramicId }, code));
    }
  });
});

describe("R7: Jun during Second Firing", () => {
  function r7Table(fire: FireModifier[] = [0, 2]): LocalTable {
    const table = openFiringTable(aqSpec(withTechs(["T14"], "JU"), fire));
    tendAll(table);
    table.act("p1", { type: "RESOLVE_JUN", adjustment: null });
    return table;
  }

  it("an unused Jun opens a window after the extra card and recalculation, before the new Quality", () => {
    const table = r7Table();
    const events = table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    expect(typesOf(events)).toEqual(["TECH_USED", "SECOND_FIRING_REVEALED"]);
    expect(table.state.phase).toEqual({ type: "firing_second_firing_jun", actorId: "p1", ceramicId: "c1" });
    expect(table.prompt()).toEqual({ phaseType: "firing_second_firing_jun", actorIds: ["p1"], mode: "single" });
    expect(table.state.firing?.pendingExtraFire).toEqual({ playerId: "p1", ceramicId: "c1", modifier: 2 });
    expect(record(table, "c1")?.quality).toBe("flawed");
    expect(fireCount(table)).toBe(12);
    expect(junOptions(table.view("p1"))).toEqual({ during: "second_firing", ready: true, woodCost: 1, ceramicIds: ["c1"] });

    expectDocumentedDetails(table.expectRuleError("p1", { type: "RESOLVE_JUN", adjustment: { ceramicId: "c2", delta: 1 } }, "INVALID_TARGET"));
    const resolved = table.act("p1", { type: "RESOLVE_JUN", adjustment: { ceramicId: "c1", delta: 1 } });
    expect(resolved.slice(0, 4)).toEqual([
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: -1, coins: 0, reason: "jun" },
      { type: "KILN_ABILITY_USED", playerId: "p1", kilnId: "JU" },
      { type: "JUN_ADJUSTED", playerId: "p1", ceramicId: "c1", delta: 1, finalActualHeat: 4, during: "second_firing" },
      { type: "QUALITY_ASSIGNED", ceramicId: "c1", quality: "masterpiece", heatDifference: 0, cause: "second_firing" },
    ]);
    expect(record(table, "c1")?.second).toMatchObject({ actualHeat: 3, junAdjustment: 1, finalActualHeat: 4 });
    expect((table.state.firing ?? table.state.lastFiring)?.pendingExtraFire).toBeNull();
    expect(table.state.fireDiscard.slice(-2)).toEqual([2, 0]);
    expect(fireCount(table)).toBe(12);
  });

  it("declining in the R7 window assigns the new Quality and keeps Jun (R4)", () => {
    const table = r7Table();
    table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    const events = table.act("p1", { type: "RESOLVE_JUN", adjustment: null });
    expect(events[0]).toEqual({ type: "QUALITY_ASSIGNED", ceramicId: "c1", quality: "fine", heatDifference: 1, cause: "second_firing" });
    expect(table.player("p1").kilnAbilityUsedThisRound).toBe(false);
  });

  it("returns to the after-Quality window for later players in First Player order", () => {
    const table = openFiringTable(
      aqSpec(withTechs(["T14"], "JU"), [0, 2], {
        players: [{ kilnId: "JU", techs: ["T14"] }, { kilnId: "GU", techs: ["T11"] }, { kilnId: "DI" }],
        ceramics: [
          { owner: "p1", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_1" },
          { owner: "p2", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_2" },
        ],
      }),
    );
    tendAll(table);
    table.act("p1", { type: "RESOLVE_JUN", adjustment: null });
    expect(table.state.phase).toEqual({ type: "firing_after_quality", queue: { actorIds: ["p1", "p2"], index: 0 } });
    table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    table.act("p1", { type: "RESOLVE_JUN", adjustment: null });
    // p1 has nothing left; p2's turn follows.
    expect(table.prompt()).toEqual({ phaseType: "firing_after_quality", actorIds: ["p2"], mode: "single" });
    table.act("p2", { type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c2" });
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "firing_done" }]);
  });

  it("no window without the Wood to pay for Jun", () => {
    const table = openFiringTable(aqSpec(withTechs(["T14"], "JU", { wood: 1 }), [0, 2]));
    table.contribute("p1", "STOKE");
    table.contribute("p2", "TEND");
    expect(table.player("p1").resources.wood).toBe(0);
    const events = table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    expect(typesOf(events)).toContain("QUALITY_ASSIGNED");
    expect(table.state.phase.type).not.toBe("firing_second_firing_jun");
  });
});

describe("Ge Crackle (L467–469, L654)", () => {
  it("turns one of your Standard ceramics Fine with a permanent Crackle marker", () => {
    const table = openFiringTable(aqSpec(withTechs([], "GE")));
    tendAll(table);
    expect(afterQualityOptions(table.view("p1"))).toEqual([{ ability: "ge_crackle", ceramicIds: ["c2"], cost: { clay: 0, wood: 0, coins: 0 } }]);
    for (const [ceramicId, code] of [
      ["c1", "INVALID_TARGET"],
      ["c3", "INVALID_TARGET"],
      ["c4", "INVALID_TARGET"],
      ["c5", "CERAMIC_NOT_OWNED"],
      ["c6", "INVALID_TARGET"],
    ] as const) {
      expectDocumentedDetails(table.expectRuleError("p1", { type: "USE_GE_CRACKLE", ceramicId }, code));
    }
    const events = table.act("p1", { type: "USE_GE_CRACKLE", ceramicId: "c2" });
    expect(events.slice(0, 3)).toEqual([
      { type: "KILN_ABILITY_USED", playerId: "p1", kilnId: "GE" },
      { type: "QUALITY_IMPROVED", ceramicId: "c2", from: "standard", to: "fine", cause: "ge_crackle" },
      { type: "CRACKLE_APPLIED", playerId: "p1", ceramicId: "c2" },
    ]);
    expect(record(table, "c2")).toMatchObject({ quality: "fine", crackle: true });
    // c1 is still Flawed: salvage, then finish with the Crackle ceramic exactly Fine.
    table.act("p1", { type: "SALVAGE_FLAWED", ceramicId: null });
    expect(table.state.ceramics["c2"]).toMatchObject({ stage: "finished", quality: "fine", crackle: true, decoration: "plain" });
  });

  it("may follow Protective Saggars on the same ceramic: Flawed → Standard → Fine (L654)", () => {
    const table = openFiringTable(aqSpec(withTechs(["T11"], "GE")));
    tendAll(table);
    table.act("p1", { type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c1" });
    // Eligibility is rechecked: c1 is now Standard, so Ge may target it.
    expect(afterQualityOptions(table.view("p1"))).toEqual([{ ability: "ge_crackle", ceramicIds: ["c1", "c2"], cost: { clay: 0, wood: 0, coins: 0 } }]);
    table.act("p1", { type: "USE_GE_CRACKLE", ceramicId: "c1" });
    expect(record(table, "c1")?.history).toEqual([
      { cause: "fired", from: null, to: "flawed" },
      { cause: "protective_saggars", from: "flawed", to: "standard" },
      { cause: "ge_crackle", from: "standard", to: "fine" },
    ]);
    expect(table.state.ceramics["c1"]).toMatchObject({ stage: "finished", quality: "fine", crackle: true });
  });

  it("the owner chooses the order: Ge first, then Saggars on another ceramic", () => {
    const table = openFiringTable(aqSpec(withTechs(["T11"], "GE")));
    tendAll(table);
    table.act("p1", { type: "USE_GE_CRACKLE", ceramicId: "c2" });
    expect(table.state.phase).toMatchObject({ type: "firing_after_quality" });
    expect(afterQualityOptions(table.view("p1"))).toEqual([
      { ability: "protective_saggars", ceramicIds: ["c1"], cost: { clay: 0, wood: 1, coins: 0 } },
    ]);
    // A Crackle ceramic is Fine for good: Saggars cannot lift it to Masterpiece (L469, L637).
    expectDocumentedDetails(table.expectRuleError("p1", { type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c2" }, "INVALID_TARGET"));
    table.act("p1", { type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c1" });
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "firing_done" }]);
    expect(table.state.ceramics["c2"]).toMatchObject({ stage: "finished", quality: "fine", crackle: true });
  });

  it("may follow Second Firing on the same ceramic; a Crackle ceramic cannot be fired again", () => {
    const table = openFiringTable(aqSpec(withTechs(["T14"], "GE"), [0, 1]));
    tendAll(table);
    expect(afterQualityOptions(table.view("p1"))).toEqual([
      { ability: "second_firing", ceramicIds: ["c1", "c2"], cost: { clay: 0, wood: 0, coins: 0 } },
      { ability: "ge_crackle", ceramicIds: ["c2"], cost: { clay: 0, wood: 0, coins: 0 } },
    ]);
    // Second Firing: 2 + 1 − 1 = 2 vs Moon White 4 → Standard, so Ge may now take c1.
    table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    expect(afterQualityOptions(table.view("p1"))).toEqual([{ ability: "ge_crackle", ceramicIds: ["c1", "c2"], cost: { clay: 0, wood: 0, coins: 0 } }]);
    table.act("p1", { type: "USE_GE_CRACKLE", ceramicId: "c1" });
    expect(record(table, "c1")?.history.map((change) => change.cause)).toEqual(["fired", "second_firing", "ge_crackle"]);
    expect(table.state.ceramics["c1"]).toMatchObject({ stage: "finished", quality: "fine", crackle: true });

    const crackledFirst = openFiringTable(aqSpec(withTechs(["T14"], "GE"), [0, 1]));
    tendAll(crackledFirst);
    crackledFirst.act("p1", { type: "USE_GE_CRACKLE", ceramicId: "c2" });
    expect(afterQualityOptions(crackledFirst.view("p1"))).toEqual([
      { ability: "second_firing", ceramicIds: ["c1"], cost: { clay: 0, wood: 0, coins: 0 } },
    ]);
    expectDocumentedDetails(crackledFirst.expectRuleError("p1", { type: "USE_SECOND_FIRING", ceramicId: "c2" }, "INVALID_TARGET"));
  });

  it("after each use the turn passes automatically when nothing eligible is left", () => {
    const table = openFiringTable(
      aqSpec(withTechs(["T11"], "GE"), [0], {
        ceramics: [
          { owner: "p1", stage: "loaded", shape: "plate", glaze: "white", at: "high_1" },
          { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_2" },
        ],
      }),
    );
    tendAll(table);
    const events = table.act("p1", { type: "USE_GE_CRACKLE", ceramicId: "c1" });
    // Saggars is still ready but has no Flawed/Standard target left: on to step 12.
    expect(typesOf(events).at(-1)).toBe("FIRING_FINISHED");
    expect(table.player("p1").techs[0]?.usedThisRound).toBe(false);
  });

  it("is once per round, and only for the Ge Kiln", () => {
    const used = openFiringTable(aqSpec({ kilnId: "GE", kilnAbilityUsedThisRound: true }));
    tendAll(used);
    expect(used.state.phase.type).toBe("firing_salvage");

    const table = openFiringTable(aqSpec(withTechs(["T11"], "GE")));
    tendAll(table);
    const p1 = table.state.players["p1"]!;
    p1.kilnAbilityUsedThisRound = true;
    expectDocumentedDetails(table.expectRuleError("p1", { type: "USE_GE_CRACKLE", ceramicId: "c2" }, "ABILITY_ALREADY_USED"));
    p1.kilnId = "RU";
    expectDocumentedDetails(table.expectRuleError("p1", { type: "USE_GE_CRACKLE", ceramicId: "c2" }, "KILN_ABILITY_NOT_OWNED"));
  });
});

describe("salvage (L280, L682)", () => {
  function salvageSpec(): StateSpec {
    return {
      players: [{ techs: ["T15"] }, {}, {}],
      fireDeck: [0],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_1", kilnFurniture: -1 },
        { owner: "p1", stage: "loaded", shape: "plate", glaze: "white", at: "high_1" },
        { owner: "p2", stage: "loaded", shape: "vase", glaze: "moon_white", at: "low_2" },
        { owner: "p1", stage: "loaded", shape: "washer", glaze: "moon_white", at: "middle_1" },
      ],
    };
  }

  it("each player with a still-Flawed ceramic decides, in any order (parallel)", () => {
    const table = openFiringTable(salvageSpec());
    tendAll(table);
    expect(table.state.phase).toEqual({ type: "firing_salvage", pendingPlayerIds: ["p1", "p2"], openedAtRevision: table.state.revision });
    expect(table.prompt()).toEqual({ phaseType: "firing_salvage", actorIds: ["p1", "p2"], mode: "parallel" });
    expect(salvageOptions(table.view("p1"))).toEqual({ ceramicIds: ["c1"], coins: 2 });
    expect(salvageOptions(table.view("p3"))).toBeNull();

    const card = table.state.ceramics["c3"]?.vesselInstanceId;
    const events = table.act("p2", { type: "SALVAGE_FLAWED", ceramicId: "c3" });
    expect(events).toEqual([
      { type: "CERAMIC_SALVAGED", playerId: "p2", ceramicId: "c3", coins: 2 },
      { type: "RESOURCES_CHANGED", playerId: "p2", clay: 0, wood: 0, coins: 2, reason: "salvage" },
    ]);
    expect(table.state.ceramics["c3"]).toBeUndefined();
    expect(table.state.sharedKiln.spaces.low_2.ceramicIds).toEqual([]);
    expect(table.state.vesselSupply.vase).toContain(card);
    expect(table.state.vesselSupply.vase).toEqual([...table.state.vesselSupply.vase].sort());
    expect(record(table, "c3")).toMatchObject({ salvaged: true, quality: "flawed" });
    expect(table.player("p2").resources.coins).toBe(5);
    expect(table.state.phase).toMatchObject({ pendingPlayerIds: ["p1"] });
  });

  it("validates the target: your own, still Flawed, from this firing", () => {
    const table = openFiringTable(salvageSpec());
    tendAll(table);
    expectDocumentedDetails(table.expectRuleError("p1", { type: "SALVAGE_FLAWED", ceramicId: "c2" }, "INVALID_TARGET"));
    expectDocumentedDetails(table.expectRuleError("p1", { type: "SALVAGE_FLAWED", ceramicId: "c3" }, "CERAMIC_NOT_OWNED"));
    table.expectRuleError("p3", { type: "SALVAGE_FLAWED", ceramicId: null }, "NOT_YOUR_DECISION");
  });

  it("salvages at most 1 ceramic per player; Kiln Furniture under it leaves with it", () => {
    const table = openFiringTable({
      ...salvageSpec(),
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_1", kilnFurniture: -1 },
        { owner: "p1", stage: "loaded", shape: "plate", glaze: "moon_white", at: "low_2" },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_2" },
      ],
    });
    tendAll(table);
    expect(salvageOptions(table.view("p1"))).toEqual({ ceramicIds: ["c1", "c2"], coins: 2 });
    const events = table.act("p1", { type: "SALVAGE_FLAWED", ceramicId: "c1" });
    expect(table.state.sharedKiln.spaces.low_1).toMatchObject({ ceramicIds: [], kilnFurniture: null });
    // p1 is done: the firing finishes with c2 still Flawed.
    expect(typesOf(events).at(-1)).toBe("FIRING_FINISHED");
    expect(table.state.ceramics["c2"]).toMatchObject({ stage: "finished", quality: "flawed" });
    expect(eventsOfType(events, "FIRING_FINISHED")[0]?.finishedCeramicIds).toEqual(["c2", "c3"]);
  });

  it("declining keeps the ceramic, which finishes Flawed", () => {
    const table = openFiringTable(aqSpec({}));
    tendAll(table);
    const events = table.act("p1", { type: "SALVAGE_FLAWED", ceramicId: null });
    expect(typesOf(events)).toEqual(["FIRING_FINISHED"]);
    expect(table.state.ceramics["c1"]).toMatchObject({ stage: "finished", quality: "flawed" });
    expect(table.player("p1").resources.coins).toBe(3);
  });
});

describe("finishing the firing (L683)", () => {
  it("moves ceramics to Finished, empties the kilns, discards the Fire card and records the firing", () => {
    const table = openFiringTable({
      players: [{ techs: ["T15", "T13"], recognition: 2 }, { techs: ["T22"] }],
      fireDeck: [1],
      settersMarks: { low_1: "p2" },
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "vase", glaze: "grey_green", at: "middle_1", kilnFurniture: 0, heatMarker: { source: "own", faceDown: true } },
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "imperial" },
        { owner: "p2", stage: "loaded", shape: "plate", glaze: "grey_green", at: "high_1", decoration: "carved" },
      ],
    });
    tendAll(table);
    table.act("p1", { type: "TEST_PIECES_DECIDE", peek: true });
    table.act("p1", { type: "TEST_PIECES_BURY", bury: false });
    const firingBefore = structuredClone(table.state.firing);
    const discardBefore = [...table.state.fireDiscard];
    const events = table.act("p1", { type: "RESOLVE_HEAT_MARKERS", ownMarker: -1 });
    expect(eventsOfType(events, "FIRING_FINISHED")).toEqual([{ type: "FIRING_FINISHED", round: 1, finishedCeramicIds: ["c1", "c2", "c3"] }]);
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "firing_done" }]);
    const c1 = table.state.ceramics["c1"];
    expect(c1).toEqual({
      id: "c1",
      ownerId: "p1",
      vesselInstanceId: c1?.vesselInstanceId,
      shape: "vase",
      decoration: "plain",
      formedInRound: 1,
      formedBy: "form_decorate",
      glaze: "grey_green",
      firedInRound: 1,
      stage: "finished",
      crackle: false,
      quality: "fine",
    });
    expect(table.state.ceramics["c2"]).toMatchObject({ stage: "finished", quality: "fine" });
    expect(table.state.ceramics["c3"]).toMatchObject({ stage: "finished", quality: "fine", decoration: "carved" });
    for (const space of Object.values(table.state.sharedKiln.spaces)) {
      expect(space.ceramicIds).toEqual([]);
      expect(space.kilnFurniture).toBeNull();
    }
    // A Setter's Mark is returned at Cleanup, not by the firing (L630).
    expect(table.state.sharedKiln.spaces.low_1.setterMarkOwnerId).toBe("p2");
    expect(table.state.fireDiscard).toEqual([...discardBefore, 1]);
    expect(table.state.firing).toBeNull();
    expect(table.state.hidden.firePeeks).toEqual({});
    expect(table.state.lastFiring).toMatchObject({
      round: 1,
      baseHeat: 2,
      fireModifier: 1,
      globalHeat: 3,
      testPieces: [{ playerId: "p1", peeked: true, buried: false }],
      pendingExtraFire: null,
    });
    expect(table.state.lastFiring?.participantIds).toEqual(firingBefore?.participantIds);
    expect(fireCount(table)).toBe(12);
  });

  it("a new firing clears the previous recap when it starts", () => {
    const table = openFiringTable({
      players: 2,
      fireDeck: [0],
      ceramics: [{ owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" }],
      lastFiring: {
        round: 1,
        kilnDie: 1,
        participantIds: [],
        firingPlayerIds: [],
        contributionWindowId: null,
        contributions: {},
        unclampedBaseHeat: 1,
        baseHeat: 1,
        testPieces: [],
        fireModifier: null,
        globalHeat: null,
        ceramics: {},
        pendingExtraFire: null,
      },
      round: 2,
    });
    expect(table.state.lastFiring).toBeNull();
    expect(table.state.firing?.round).toBe(2);
    expect(table.state.phase).toMatchObject({ windowId: "test-game:r2:contributions" });
  });
});
