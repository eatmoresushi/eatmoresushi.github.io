/**
 * Appendix D steps 9–12 (L281, L468–470, v1.6.2 L636, L639, L650, L653, L681–683; R4, R7, R15):
 * Protective Saggars (its floor at Quality and its once-per-round Standard → Fine step), Second
 * Firing (2 cards revealed, 1 chosen, R7's Jun with the choice), Ge's Crackle in the owner's
 * chosen order with eligibility rechecked after each use, the optional 2-Coin salvage, and
 * finishing.
 */

import { describe, expect, it } from "vitest";
import { afterQualityOptions, salvageOptions, secondFiringChoiceOptions } from "../../../src/game/firing/afterQuality.ts";
import { junOptions } from "../../../src/game/firing/pipeline.ts";
import { firingStageView } from "../../../src/game/selectors.ts";
import type { FireModifier, KilnId, TechId } from "../../../src/game/types.ts";
import { projectEvent } from "../../../src/game/view.ts";
import { type PlayerSpec, type StateSpec, cardZones } from "./support/fixtures.ts";
import { eventsOfType, openFiringTable, tendAll, typesOf } from "./support/firing.ts";
import type { LocalTable } from "./support/localTable.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

/**
 * Three players; Base Heat 2 with Tend all round and the first Fire card 0 (Global 2):
 * - c1 p1 Moon White, Low → Actual 1, Heat Difference 3: Flawed (Standard under Saggars)
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

const NO_COST = { clay: 0, wood: 0, coins: 0 };

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
    expect(afterQualityOptions(table.view("p2"))).toEqual([{ ability: "second_firing", ceramicIds: ["c2"], cost: NO_COST }]);
    expect(afterQualityOptions(table.view("p1"))).toEqual([]);
    table.expectRuleError("p1", { type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c1" }, "NOT_YOUR_DECISION");
    // Ending the turn declines the rest (R4): Second Firing stays ready.
    table.act("p2", { type: "END_AFTER_QUALITY" });
    expect(table.player("p2").techs[0]?.usedThisRound).toBe(false);
    expect(table.state.phase).toEqual({ type: "firing_after_quality", queue: { actorIds: ["p2", "p1"], index: 1 } });
    // c1 would have been Flawed; under Saggars it is Standard, so the upgrade may take it.
    expect(afterQualityOptions(table.view("p1"))).toEqual([{ ability: "protective_saggars", ceramicIds: ["c1"], cost: NO_COST }]);
  });

  it("is skipped when nobody has an eligible ability", () => {
    const table = openFiringTable(aqSpec({}));
    const events = tendAll(table);
    expect(typesOf(events)).toContain("QUALITY_ASSIGNED");
    expect(table.state.phase).toMatchObject({ type: "firing_salvage", pendingPlayerIds: ["p1"] });
  });
});

describe("Protective Saggars: never Flawed (T11, v1.6.2 L636, L650)", () => {
  it("a Heat Difference of 3 counts as Standard for its owner only; the difference stays real", () => {
    const table = openFiringTable(
      aqSpec(withTechs(["T11"]), [0], {
        ceramics: [
          { owner: "p1", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_1" },
          { owner: "p2", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_2" },
        ],
      }),
    );
    const events = tendAll(table);
    expect(eventsOfType(events, "QUALITY_ASSIGNED")).toEqual([
      { type: "QUALITY_ASSIGNED", ceramicId: "c1", quality: "standard", heatDifference: 3, cause: "fired", saggarsFloor: true },
      { type: "QUALITY_ASSIGNED", ceramicId: "c2", quality: "flawed", heatDifference: 3, cause: "fired", saggarsFloor: false },
    ]);
    expect(record(table, "c1")).toMatchObject({ quality: "standard", saggarsFloor: true, first: { heatDifference: 3 } });
    expect(record(table, "c1")?.history).toEqual([{ cause: "fired", from: null, to: "standard" }]);
    expect(record(table, "c2")).toMatchObject({ quality: "flawed", saggarsFloor: false });
    // The floor is public, like every recorded attribute (L507).
    expect(firingStageView(table.view("p3"))?.ceramics.map((c) => [c.id, c.quality, c.saggarsFloor])).toEqual([
      ["c1", "standard", true],
      ["c2", "flawed", false],
    ]);
    expect(JSON.stringify(events.map(projectEvent))).toContain('"saggarsFloor":true');
  });

  it("covers differences of 4 and 5 too, and never touches a better Quality", () => {
    for (const [fire, difference] of [[-1, 4], [-2, 5]] as const) {
      const table = openFiringTable(aqSpec(withTechs(["T11"]), [fire]));
      const events = tendAll(table);
      expect(eventsOfType(events, "QUALITY_ASSIGNED").find((e) => e.ceramicId === "c1")).toMatchObject({
        quality: "standard",
        heatDifference: difference,
        saggarsFloor: true,
      });
      for (const e of eventsOfType(events, "QUALITY_ASSIGNED").filter((q) => q.ceramicId !== "c1")) {
        expect(e.saggarsFloor, e.ceramicId).toBe(false);
      }
    }
  });

  it("applies in the owner's Imperial Kiln (Kiln Die + Fire + modifier, L650)", () => {
    const table = openFiringTable({
      players: [{ techs: ["T11"], recognition: 2 }, {}],
      fireDeck: [0],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "vase", glaze: "moon_white", at: "imperial", imperialModifier: -1 },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
      ],
    });
    const events = tendAll(table);
    // Die 2 + Fire 0 − 1 = 1 vs Moon White 4: difference 3.
    expect(eventsOfType(events, "QUALITY_ASSIGNED")[0]).toEqual({
      type: "QUALITY_ASSIGNED",
      ceramicId: "c1",
      quality: "standard",
      heatDifference: 3,
      cause: "fired",
      saggarsFloor: true,
    });
  });

  it("its owner never salvages, since nothing of theirs is Flawed (L280)", () => {
    const table = openFiringTable(aqSpec(withTechs(["T11"])));
    tendAll(table);
    table.act("p1", { type: "END_AFTER_QUALITY" });
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "firing_done" }]);
    expect(table.state.ceramics["c1"]).toMatchObject({ stage: "finished", quality: "standard" });
    expect(table.player("p1").techs[0]?.usedThisRound).toBe(false);
  });

  it("never reaches ceramics fired before the owner had the tile (L650)", () => {
    const table = openFiringTable({
      round: 2,
      players: [{ techs: [{ id: "T11", acquiredInRound: 2 }] }, {}],
      fireDeck: [0],
      ceramics: [
        { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "flawed", firedInRound: 1 },
        { owner: "p1", stage: "loaded", shape: "plate", glaze: "celadon", at: "middle_1" },
      ],
    });
    tendAll(table);
    expect(table.state.ceramics["c1"]).toMatchObject({ stage: "finished", quality: "flawed" });
    expect(afterQualityOptions(table.view("p1"))).toEqual([]);
  });
});

describe("Protective Saggars: Standard → Fine once per round (T11, v1.6.2 L636; R4)", () => {
  it("turns 1 of the owner's Standard ceramics from this firing Fine without Wood, a floored one included", () => {
    const table = openFiringTable(aqSpec(withTechs(["T11"], "RU", { wood: 0 })));
    tendAll(table);
    expect(afterQualityOptions(table.view("p1"))).toEqual([{ ability: "protective_saggars", ceramicIds: ["c1", "c2"], cost: NO_COST }]);
    const events = table.act("p1", { type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c1" });
    expect(events.slice(0, 2)).toEqual([
      { type: "TECH_USED", playerId: "p1", techId: "T11" },
      { type: "QUALITY_IMPROVED", ceramicId: "c1", from: "standard", to: "fine", cause: "protective_saggars" },
    ]);
    expect(eventsOfType(events, "RESOURCES_CHANGED")).toEqual([]);
    expect(table.player("p1").resources.wood).toBe(0);
    // Once per round: nothing eligible remains, the firing finishes (no salvage for p1).
    expect(typesOf(events).at(-1)).toBe("FIRING_FINISHED");
    expect(record(table, "c1")).toMatchObject({ quality: "fine", saggarsFloor: true });
    expect(record(table, "c1")?.history).toEqual([
      { cause: "fired", from: null, to: "standard" },
      { cause: "protective_saggars", from: "standard", to: "fine" },
    ]);
    expect(table.state.ceramics["c1"]).toMatchObject({ stage: "finished", quality: "fine", crackle: false });
  });

  it("targets only a Standard ceramic of yours from this firing; never Fine or Masterpiece", () => {
    const table = openFiringTable(aqSpec(withTechs(["T11"])));
    tendAll(table);
    for (const [ceramicId, code] of [
      ["c3", "INVALID_TARGET"],
      ["c4", "INVALID_TARGET"],
      ["c5", "CERAMIC_NOT_OWNED"],
      ["c6", "INVALID_TARGET"],
    ] as const) {
      const error = table.expectRuleError("p1", { type: "USE_PROTECTIVE_SAGGARS", ceramicId }, code);
      expectDocumentedDetails(error);
      if (code === "INVALID_TARGET" && ceramicId !== "c6") expect(error.message).toBe("Choose one of your Standard ceramics from this firing.");
    }
    table.act("p1", { type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c2" });
    expect(record(table, "c2")).toMatchObject({ quality: "fine", saggarsFloor: false });
  });

  it("is once per round; without the Tech it is refused; declining keeps the use (R4)", () => {
    const table = openFiringTable(aqSpec(withTechs(["T11"], "GE")));
    tendAll(table);
    table.act("p1", { type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c2" });
    expectDocumentedDetails(table.expectRuleError("p1", { type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c1" }, "TECH_ALREADY_USED"));

    const declined = openFiringTable(aqSpec(withTechs(["T11"])));
    tendAll(declined);
    declined.act("p1", { type: "END_AFTER_QUALITY" });
    expect(declined.player("p1").techs[0]?.usedThisRound).toBe(false);

    const unowned = openFiringTable(aqSpec(withTechs(["T11"], "GE")));
    tendAll(unowned);
    unowned.state.players["p1"]!.techs = [];
    expectDocumentedDetails(unowned.expectRuleError("p1", { type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c1" }, "TECH_NOT_OWNED"));
  });
});

describe("Second Firing: 2 cards revealed, 1 chosen (T14, v1.6.2 L639, L650)", () => {
  it("reveals 2 extra cards publicly and waits for the owner's choice", () => {
    const table = openFiringTable(aqSpec(withTechs(["T14"]), [0, 2, -1]));
    tendAll(table);
    const events = table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    expect(events).toEqual([
      { type: "TECH_USED", playerId: "p1", techId: "T14" },
      { type: "SECOND_FIRING_REVEALED", playerId: "p1", ceramicId: "c1", modifiers: [2, -1] },
    ]);
    expect(table.state.phase).toEqual({ type: "firing_second_firing_choice", actorId: "p1", ceramicId: "c1" });
    expect(table.prompt()).toEqual({ phaseType: "firing_second_firing_choice", actorIds: ["p1"], mode: "single" });
    expect(table.state.firing?.pendingExtraFire).toEqual({ playerId: "p1", ceramicId: "c1", modifiers: [2, -1] });
    expect(record(table, "c1")?.quality).toBe("flawed");
    expect(fireCount(table)).toBe(12);
    expect(secondFiringChoiceOptions(table.view("p1"))).toEqual({ ceramicId: "c1", modifiers: [2, -1], jun: { ready: false, woodCost: 1 } });
    expect(secondFiringChoiceOptions(table.view("p2"))).toBeNull();
    // The revealed cards are on the table for everyone (D3: no heat preview).
    expect(firingStageView(table.view("p2"))?.extraFire).toEqual({ playerId: "p1", ceramicId: "c1", modifiers: [2, -1] });
    expect(JSON.stringify(events.map(projectEvent))).toContain('"modifiers":[2,-1]');
    // Nothing else may happen until the card is chosen.
    table.expectRuleError("p1", { type: "END_AFTER_QUALITY" }, "WRONG_PHASE");
    table.expectRuleError("p1", { type: "RESOLVE_JUN", adjustment: null }, "WRONG_PHASE");
    table.expectRuleError("p2", { type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: null }, "NOT_YOUR_DECISION");
  });

  it("recalculates with the chosen card and the same Base Heat, position and marker; both cards are discarded", () => {
    const table = openFiringTable(aqSpec(withTechs(["T14"]), [0, -1, 2]));
    tendAll(table);
    const discardBefore = [...table.state.fireDiscard];
    table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    const events = table.act("p1", { type: "SECOND_FIRING_CHOOSE", cardIndex: 1, jun: null });
    expect(events.slice(0, 2)).toEqual([
      {
        type: "SECOND_FIRING_CHOSEN",
        playerId: "p1",
        ceramicId: "c1",
        cardIndex: 1,
        modifier: 2,
        calculation: { fireModifier: 2, heatSource: 4, positionModifier: -1, heatMarker: 0, actualHeat: 3, junAdjustment: 0, finalActualHeat: 3, heatDifference: 1 },
      },
      { type: "QUALITY_ASSIGNED", ceramicId: "c1", quality: "fine", heatDifference: 1, cause: "second_firing", saggarsFloor: false },
    ]);
    expect(record(table, "c1")).toMatchObject({ secondFiringCards: [-1, 2], second: { fireModifier: 2 }, first: { fireModifier: 0, actualHeat: 1 } });
    // It changes nothing for any other ceramic.
    expect(record(table, "c2")).toMatchObject({ quality: "standard", second: null, secondFiringCards: null });
    // Both extra cards are discarded in reveal order; the round's card at step 12 (L683).
    expect(table.state.fireDiscard).toEqual([...discardBefore, -1, 2, 0]);
    expect(table.state.lastFiring?.pendingExtraFire).toBeNull();
    expect(fireCount(table)).toBe(12);
    expect(firingStageView(table.view("p2"))).toBeNull();
  });

  it("the new Quality replaces the old one even if worse", () => {
    const table = openFiringTable(aqSpec(withTechs(["T14"]), [0, 2, 1]));
    tendAll(table);
    table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c2" });
    const events = table.act("p1", { type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: null });
    expect(eventsOfType(events, "QUALITY_ASSIGNED")).toEqual([
      { type: "QUALITY_ASSIGNED", ceramicId: "c2", quality: "flawed", heatDifference: 4, cause: "second_firing", saggarsFloor: false },
    ]);
    expect(record(table, "c2")?.history).toEqual([
      { cause: "fired", from: null, to: "standard" },
      { cause: "second_firing", from: "standard", to: "flawed" },
    ]);
    expect(table.state.phase).toMatchObject({ type: "firing_salvage", pendingPlayerIds: ["p1"] });
    expect(salvageOptions(table.view("p1"))).toEqual({ ceramicIds: ["c1", "c2"], coins: 2 });
  });

  it("keeps the Heat marker and the Kiln Furniture modifier (L269, v1.6.2 L639)", () => {
    const table = openFiringTable({
      players: [{ techs: ["T14", "T15"] }, {}],
      fireDeck: [0, -1, 2],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "low_1", kilnFurniture: 1, heatMarker: { source: "own", faceDown: true } },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
      ],
    });
    tendAll(table);
    table.act("p1", { type: "RESOLVE_HEAT_MARKERS", ownMarker: 1 });
    // First: 2 + Furniture 1 + marker 1 = 4 vs White 1 → Flawed.
    expect(record(table, "c1")?.quality).toBe("flawed");
    table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    const events = table.act("p1", { type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: null });
    expect(eventsOfType(events, "SECOND_FIRING_CHOSEN")[0]?.calculation).toEqual({
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

  it("an Imperial ceramic uses the Kiln Die again, not Base Heat (L289)", () => {
    const table = openFiringTable({
      players: [{ techs: ["T14"], recognition: 2 }, {}],
      fireDeck: [0, -2, 1],
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
    table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    const events = table.act("p1", { type: "SECOND_FIRING_CHOOSE", cardIndex: 1, jun: null });
    // Die 2 + chosen 1 − 1 = 2 vs Moon White 4 → Standard (Base Heat 4 would have given 4).
    expect(eventsOfType(events, "SECOND_FIRING_CHOSEN")[0]?.calculation).toMatchObject({ heatSource: 3, positionModifier: -1, actualHeat: 2 });
    expect(eventsOfType(events, "QUALITY_ASSIGNED")[0]).toMatchObject({ ceramicId: "c1", quality: "standard" });
  });

  it("does not carry Jun's first adjustment; with Jun spent the choice has no Jun", () => {
    const table = openFiringTable(aqSpec(withTechs(["T14"], "JU"), [0, 0, 0]));
    tendAll(table);
    table.act("p1", { type: "RESOLVE_JUN", adjustment: { ceramicId: "c1", delta: 1 } });
    expect(record(table, "c1")).toMatchObject({ quality: "standard", first: { junAdjustment: 1, finalActualHeat: 2 } });
    table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    expect(secondFiringChoiceOptions(table.view("p1"))?.jun).toEqual({ ready: false, woodCost: 1 });
    expectDocumentedDetails(table.expectRuleError("p1", { type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: { delta: 1 } }, "ABILITY_ALREADY_USED"));
    const events = table.act("p1", { type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: null });
    expect(eventsOfType(events, "SECOND_FIRING_CHOSEN")[0]?.calculation).toMatchObject({ actualHeat: 1, junAdjustment: 0, heatDifference: 3 });
    expect(eventsOfType(events, "QUALITY_ASSIGNED")[0]).toMatchObject({ ceramicId: "c1", quality: "flawed", cause: "second_firing" });
  });

  it("targets only your Flawed or Standard ceramics from this firing", () => {
    const table = openFiringTable(aqSpec(withTechs(["T14"]), [0, 0, 0]));
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

  it("reshuffles the discard when the deck runs out between the two cards (L511, R15)", () => {
    const table = openFiringTable(aqSpec(withTechs(["T14"]), [0, 1]));
    tendAll(table);
    const discard = table.state.fireDiscard.length;
    expect(discard).toBe(10);
    const events = table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    expect(typesOf(events)).toEqual(["TECH_USED", "FIRE_DECK_RESHUFFLED", "SECOND_FIRING_REVEALED"]);
    expect(eventsOfType(events, "FIRE_DECK_RESHUFFLED")[0]).toEqual({ type: "FIRE_DECK_RESHUFFLED", cardCount: 10, buriedBelow: 0 });
    expect(table.state.firing?.pendingExtraFire?.modifiers[0]).toBe(1);
    expect(table.state.fireDiscard).toEqual([]);
    expect(table.state.hidden.fireDeck).toHaveLength(9);
    expect(fireCount(table)).toBe(12);
  });
});

describe("R7: Jun during Second Firing, with the choice", () => {
  function r7Table(fire: FireModifier[] = [0, -2, 2]): LocalTable {
    const table = openFiringTable(aqSpec(withTechs(["T14"], "JU"), fire));
    tendAll(table);
    table.act("p1", { type: "RESOLVE_JUN", adjustment: null });
    return table;
  }

  it("an unused Jun may adjust the recalculation with the chosen card, before the new Quality", () => {
    const table = r7Table();
    table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    expect(secondFiringChoiceOptions(table.view("p1"))).toEqual({ ceramicId: "c1", modifiers: [-2, 2], jun: { ready: true, woodCost: 1 } });
    // Jun in step 8 is over: its options are not offered here.
    expect(junOptions(table.view("p1"))).toBeNull();
    const resolved = table.act("p1", { type: "SECOND_FIRING_CHOOSE", cardIndex: 1, jun: { delta: 1 } });
    expect(resolved.slice(0, 5)).toEqual([
      {
        type: "SECOND_FIRING_CHOSEN",
        playerId: "p1",
        ceramicId: "c1",
        cardIndex: 1,
        modifier: 2,
        calculation: { fireModifier: 2, heatSource: 4, positionModifier: -1, heatMarker: 0, actualHeat: 3, junAdjustment: 0, finalActualHeat: 3, heatDifference: 1 },
      },
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: -1, coins: 0, reason: "jun" },
      { type: "KILN_ABILITY_USED", playerId: "p1", kilnId: "JU" },
      { type: "JUN_ADJUSTED", playerId: "p1", ceramicId: "c1", delta: 1, finalActualHeat: 4, during: "second_firing" },
      { type: "QUALITY_ASSIGNED", ceramicId: "c1", quality: "masterpiece", heatDifference: 0, cause: "second_firing", saggarsFloor: false },
    ]);
    expect(record(table, "c1")?.second).toMatchObject({ actualHeat: 3, junAdjustment: 1, finalActualHeat: 4 });
    expect((table.state.firing ?? table.state.lastFiring)?.pendingExtraFire).toBeNull();
    expect(table.state.fireDiscard.slice(-3)).toEqual([-2, 2, 0]);
    expect(fireCount(table)).toBe(12);
  });

  it("declining Jun assigns the new Quality and keeps Jun (R4)", () => {
    const table = r7Table();
    table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    const events = table.act("p1", { type: "SECOND_FIRING_CHOOSE", cardIndex: 1, jun: null });
    expect(eventsOfType(events, "QUALITY_ASSIGNED")[0]).toEqual({
      type: "QUALITY_ASSIGNED",
      ceramicId: "c1",
      quality: "fine",
      heatDifference: 1,
      cause: "second_firing",
      saggarsFloor: false,
    });
    expect(table.player("p1").kilnAbilityUsedThisRound).toBe(false);
  });

  it("refuses Jun without the Jun Kiln or the Wood", () => {
    const notJun = openFiringTable(aqSpec(withTechs(["T14"]), [0, 0, 0]));
    tendAll(notJun);
    notJun.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    expectDocumentedDetails(notJun.expectRuleError("p1", { type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: { delta: 1 } }, "KILN_ABILITY_NOT_OWNED"));

    const poor = openFiringTable(aqSpec(withTechs(["T14"], "JU", { wood: 1 }), [0, 0, 0]));
    poor.contribute("p1", "STOKE");
    poor.contribute("p2", "TEND");
    expect(poor.player("p1").resources.wood).toBe(0);
    poor.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    // The choice still opens: a card must be chosen.
    expect(poor.state.phase).toMatchObject({ type: "firing_second_firing_choice" });
    expect(secondFiringChoiceOptions(poor.view("p1"))?.jun).toEqual({ ready: false, woodCost: 1 });
    expectDocumentedDetails(poor.expectRuleError("p1", { type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: { delta: -1 } }, "INSUFFICIENT_RESOURCES"));
  });

  it("returns to the after-Quality window for later players in First Player order", () => {
    const table = openFiringTable(
      aqSpec(withTechs(["T14"], "JU"), [0, 2, 1], {
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
    table.act("p1", { type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: null });
    // p1 has nothing left; p2's turn follows (c2 floored to Standard by Saggars).
    expect(table.prompt()).toEqual({ phaseType: "firing_after_quality", actorIds: ["p2"], mode: "single" });
    table.act("p2", { type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c2" });
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "firing_done" }]);
  });
});

describe("Ge Crackle (L467–469, v1.6.2 L653)", () => {
  it("turns one of your Standard ceramics Fine with a permanent Crackle marker", () => {
    const table = openFiringTable(aqSpec(withTechs([], "GE")));
    tendAll(table);
    expect(afterQualityOptions(table.view("p1"))).toEqual([{ ability: "ge_crackle", ceramicIds: ["c2"], cost: NO_COST }]);
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

  it("with Protective Saggars, a ceramic that would have been Flawed is Standard and may be crackled (v1.6.2 L653)", () => {
    const table = openFiringTable(aqSpec(withTechs(["T11"], "GE")));
    tendAll(table);
    expect(afterQualityOptions(table.view("p1"))).toEqual([
      { ability: "protective_saggars", ceramicIds: ["c1", "c2"], cost: NO_COST },
      { ability: "ge_crackle", ceramicIds: ["c1", "c2"], cost: NO_COST },
    ]);
    table.act("p1", { type: "USE_GE_CRACKLE", ceramicId: "c1" });
    expect(record(table, "c1")?.history).toEqual([
      { cause: "fired", from: null, to: "standard" },
      { cause: "ge_crackle", from: "standard", to: "fine" },
    ]);
    expect(record(table, "c1")).toMatchObject({ saggarsFloor: true, crackle: true });
    // After Crackle, Saggars' upgrade cannot take that ceramic: it is no longer Standard.
    expect(afterQualityOptions(table.view("p1"))).toEqual([{ ability: "protective_saggars", ceramicIds: ["c2"], cost: NO_COST }]);
    expectDocumentedDetails(table.expectRuleError("p1", { type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c1" }, "INVALID_TARGET"));
    table.act("p1", { type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c2" });
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "firing_done" }]);
    expect(table.state.ceramics["c1"]).toMatchObject({ stage: "finished", quality: "fine", crackle: true });
    expect(table.state.ceramics["c2"]).toMatchObject({ stage: "finished", quality: "fine", crackle: false });
  });

  it("after Saggars' Standard → Fine, Ge cannot crackle that ceramic (v1.6.2 L653)", () => {
    const table = openFiringTable(aqSpec(withTechs(["T11"], "GE")));
    tendAll(table);
    table.act("p1", { type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c2" });
    expect(afterQualityOptions(table.view("p1"))).toEqual([{ ability: "ge_crackle", ceramicIds: ["c1"], cost: NO_COST }]);
    // A Fine ceramic is not Standard: Crackle needs Standard (L467).
    expectDocumentedDetails(table.expectRuleError("p1", { type: "USE_GE_CRACKLE", ceramicId: "c2" }, "INVALID_TARGET"));
    table.act("p1", { type: "USE_GE_CRACKLE", ceramicId: "c1" });
    expect(table.state.ceramics["c2"]).toMatchObject({ stage: "finished", quality: "fine", crackle: false });
  });

  it("may follow Second Firing on the same ceramic; a Crackle ceramic cannot be fired again", () => {
    const table = openFiringTable(aqSpec(withTechs(["T14"], "GE"), [0, 1, 2]));
    tendAll(table);
    expect(afterQualityOptions(table.view("p1"))).toEqual([
      { ability: "second_firing", ceramicIds: ["c1", "c2"], cost: NO_COST },
      { ability: "ge_crackle", ceramicIds: ["c2"], cost: NO_COST },
    ]);
    // Second Firing with the chosen 1: 2 + 1 − 1 = 2 vs Moon White 4 → Standard, so Ge may now take c1.
    table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    table.act("p1", { type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: null });
    expect(afterQualityOptions(table.view("p1"))).toEqual([{ ability: "ge_crackle", ceramicIds: ["c1", "c2"], cost: NO_COST }]);
    table.act("p1", { type: "USE_GE_CRACKLE", ceramicId: "c1" });
    expect(record(table, "c1")?.history.map((change) => change.cause)).toEqual(["fired", "second_firing", "ge_crackle"]);
    expect(table.state.ceramics["c1"]).toMatchObject({ stage: "finished", quality: "fine", crackle: true });

    const crackledFirst = openFiringTable(aqSpec(withTechs(["T14"], "GE"), [0, 1, 2]));
    tendAll(crackledFirst);
    crackledFirst.act("p1", { type: "USE_GE_CRACKLE", ceramicId: "c2" });
    expect(afterQualityOptions(crackledFirst.view("p1"))).toEqual([{ ability: "second_firing", ceramicIds: ["c1"], cost: NO_COST }]);
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
    // Saggars is still ready but has no Standard target left: on to step 12.
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

describe("salvage (L281, L682)", () => {
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
