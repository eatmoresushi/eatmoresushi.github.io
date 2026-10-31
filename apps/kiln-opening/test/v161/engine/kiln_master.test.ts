/**
 * Kiln Master (T24, L647, L654; changes 28, 31; owner ruling R22): once per round, when
 * you load a ceramic — at any loading, a Glaze & Load action or Imperial Priority, into the Shared
 * or the Imperial Kiln — you may place a +1 or −1 marker on it, face up. It adds its value to that
 * ceramic's Actual Heat (L86, L273, L680), Jun's adjustment applies on top of it, and it
 * stays in place through a Second Firing recalculation (L646). It is open information and
 * returns when the firing finishes (L683). There is no player Heat marker and no
 * Heat-marker step since revision 4. Replaces revision 3's `heat_markers.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { parseCommand } from "../../../src/game/actionGuard.ts";
import { applyAction, submitContribution } from "../../../src/game/engine.ts";
import { openFiringPhase } from "../../../src/game/firing/contributions.ts";
import { validateLoads } from "../../../src/game/kilnLoading.ts";
import { SeededRandom } from "../../../src/game/rng.ts";
import { firingStageView, imperialPriorityOptions, kilnMasterOption, playerSummary } from "../../../src/game/selectors.ts";
import { ceramic, kilnMasterCarrier } from "../../../src/game/state.ts";
import type { GameAction, GameEvent, GameState, KilnSpaceId, LoadSpec, TechId } from "../../../src/game/types.ts";
import { actorViewOf, projectEvent, projectPublicState } from "../../../src/game/view.ts";
import type { CeramicSpec, PlayerSpec, StateSpec } from "./support/fixtures.ts";
import { eventsOfType, openFiringTable, tendAll, typesOf } from "./support/firing.ts";
import { type FlowHalt, haltingFlow } from "./support/flow.ts";
import { LocalTable } from "./support/localTable.ts";
import { buildState, expectPublicEvents, reject, table, types } from "./workshop_support.ts";

type GL = Extract<GameAction, { type: "PLACE_GLAZE_LOAD" }>;

function gl(workerId: string, loads: LoadSpec[]): GL {
  return { type: "PLACE_GLAZE_LOAD", workerId, loads };
}

function load(ceramicId: string, spaceId: KilnSpaceId, kilnMaster?: 1 | -1): LoadSpec {
  return { ceramicId, glaze: "celadon", destination: { kiln: "shared", spaceId }, ...(kilnMaster === undefined ? {} : { kilnMaster }) };
}

function imperial(ceramicId: string, kilnMaster?: 1 | -1): LoadSpec {
  return { ceramicId, glaze: "celadon", destination: { kiln: "imperial", imperialModifier: 0 }, ...(kilnMaster === undefined ? {} : { kilnMaster }) };
}

const shaped = (owner: string, shape: CeramicSpec["shape"] = "bowl"): CeramicSpec => ({ owner, shape, stage: "shaped" });

/** p1 owns Kiln Master (and Inverted Firing's discipline is free for another Tech). */
function spec(p1: PlayerSpec = {}, ceramics: CeramicSpec[] = [shaped("p1"), shaped("p1", "plate"), shaped("p1", "vase")]): StateSpec {
  return { players: [{ techs: ["T24" as TechId], ...p1 }, {}], ceramics };
}

function kilnMasterUsed(t: LocalTable): boolean | undefined {
  return t.player("p1").techs.find((tech) => tech.id === "T24")?.usedThisRound;
}

describe("the marker is chosen when the ceramic is loaded (L647, R22)", () => {
  it("at a Glaze & Load Apprentice load into the Shared Kiln: face up, public, once per round", () => {
    const t = table(spec());
    expect(kilnMasterOption(t.view("p1"), "p1")).toEqual({ ready: true, values: [1, -1] });
    const events = t.act("p1", gl("p1:apprentice:1", [load("c1", "middle_1", -1)]));
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "CERAMIC_LOADED", "TECH_USED", "KILN_MASTER_PLACED"]);
    expect(events.slice(3)).toEqual([
      { type: "TECH_USED", playerId: "p1", techId: "T24" },
      { type: "KILN_MASTER_PLACED", playerId: "p1", ceramicId: "c1", value: -1 },
    ]);
    expectPublicEvents(events);
    expect(ceramic(t.state, "c1")).toMatchObject({ stage: "loaded", kilnMasterMarker: -1 });
    expect(projectPublicState(t.state).ceramics["c1"]).toMatchObject({ kilnMasterMarker: -1 });
    expect(kilnMasterCarrier(t.state, "p1")?.id).toBe("c1");
    expect(playerSummary(t.view("p2"), "p1").kilnMasterCeramicId).toBe("c1");
    expect(kilnMasterUsed(t)).toBe(true);
    expect(kilnMasterOption(t.view("p1"), "p1")).toEqual({ ready: false, values: [1, -1] });
  });

  it("on either load of a Shifu action, but on only 1 load of a command (once per round)", () => {
    const second = table(spec());
    second.act("p1", gl("p1:shifu", [load("c1", "high_1"), load("c2", "low_1", 1)]));
    expect(ceramic(second.state, "c1")).toMatchObject({ kilnMasterMarker: null });
    expect(ceramic(second.state, "c2")).toMatchObject({ kilnMasterMarker: 1 });

    const both = reject(table(spec()), "p1", gl("p1:shifu", [load("c1", "high_1", 1), load("c2", "low_1", -1)]), "TECH_ALREADY_USED");
    expect(both.details).toMatchObject({ techId: "T24", field: "loads[1].kilnMaster" });
  });

  it("into the Imperial Kiln, by a Glaze & Load action or by Imperial Priority (R22)", () => {
    const viaAction = table(spec({ recognition: 2 }));
    const events = viaAction.act("p1", gl("p1:apprentice:1", [imperial("c3", 1)]));
    // The Imperial Kiln costs no Wood (L309).
    expect(types(events)).toEqual(["WORKER_PLACED", "CERAMIC_LOADED", "TECH_USED", "KILN_MASTER_PLACED"]);
    expect(ceramic(viaAction.state, "c3")).toMatchObject({ placement: { kiln: "imperial" }, kilnMasterMarker: 1 });

    const viaPriority = new LocalTable(buildState(spec({ recognition: 3 })), { flow: "halt", pass: ["worker_action_done"] });
    expect(imperialPriorityOptions(viaPriority.view("p1")).kilnMaster).toBe(true);
    const used = viaPriority.act("p1", { type: "USE_IMPERIAL_PRIORITY", ceramicId: "c3", glaze: "white", imperialModifier: -1, kilnMaster: -1 });
    expect(types(used)).toEqual(["IMPERIAL_PRIORITY_USED", "CERAMIC_LOADED", "TECH_USED", "KILN_MASTER_PLACED"]);
    expect(ceramic(viaPriority.state, "c3")).toMatchObject({ loadedBy: "imperial_priority", kilnMasterMarker: -1 });
    expect(viaPriority.player("p1").resources.wood).toBe(3);
    expect(imperialPriorityOptions(viaPriority.view("p1")).kilnMaster).toBe(false);
  });

  it("is optional (R4): a load without it keeps the use for a later loading the same round", () => {
    const t = table(spec());
    t.act("p1", gl("p1:apprentice:1", [load("c1", "high_1")]));
    expect(kilnMasterUsed(t)).toBe(false);
    expect(ceramic(t.state, "c1")).toMatchObject({ kilnMasterMarker: null });
    expect(kilnMasterOption(t.view("p1"), "p1")?.ready).toBe(true);
    // A later loading this round may still carry the marker.
    expect(validateLoads(actorViewOf(t.state, "p1"), [load("c2", "high_2", 1)], 1, "glaze_load")).toBeNull();
  });

  it("is refused without the tile, after its use this round, and with a value other than ±1", () => {
    reject(table({ players: [{}, {}], ceramics: [shaped("p1")] }), "p1", gl("p1:apprentice:1", [load("c1", "high_1", 1)]), "TECH_NOT_OWNED");
    reject(table(spec({ techs: [{ id: "T24", usedThisRound: true }] })), "p1", gl("p1:apprentice:1", [load("c1", "high_1", 1)]), "TECH_ALREADY_USED");
    expect(kilnMasterOption(table({ players: [{}, {}] }).view("p1"), "p1")).toBeNull();
    expect(parseCommand({ ...gl("p1:apprentice:1", [load("c1", "high_1")]), loads: [{ ...load("c1", "high_1"), kilnMaster: 2 }] })).toMatchObject({
      code: "MALFORMED_ACTION",
      details: { field: "loads[0].kilnMaster" },
    });
    expect(parseCommand({ type: "USE_IMPERIAL_PRIORITY", ceramicId: "c1", glaze: "white", imperialModifier: 0, kilnMaster: 0 })).toMatchObject({
      code: "MALFORMED_ACTION",
      details: { field: "kilnMaster" },
    });
  });

  it("may be used the round the tile is acquired", () => {
    const t = table(spec({ techs: [{ id: "T24", acquiredInRound: 1 }] }));
    t.act("p1", gl("p1:apprentice:1", [load("c1", "high_1", 1)]));
    expect(ceramic(t.state, "c1")).toMatchObject({ kilnMasterMarker: 1 });
  });
});

/** p1 owns Kiln Master; Base Heat 2 with Tend all round, the first Fire card 0 (Global 2). */
function firingSpec(ceramics: CeramicSpec[], p1: PlayerSpec = {}, fire: StateSpec["fireDeck"] = [0]): StateSpec {
  return { players: [{ techs: ["T24" as TechId], recognition: 2, ...p1 }, {}], fireDeck: fire, ceramics };
}

describe("the marker in the firing (L273, L646, L654, L674–683)", () => {
  it("adds to Actual Heat: Shared (zone), Shared under Kiln Furniture, and Imperial (with its modifier); there is no Heat-marker step", () => {
    const zone = openFiringTable(
      firingSpec([
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "high_1", kilnMaster: -1 },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "high_2" },
      ]),
    );
    const events = tendAll(zone);
    // Contributions (Base Heat) → Fire → Actual Heat: with nobody using Test Pieces, the Fire card
    // follows Base Heat in the same command; no Heat-marker step (changes 28, 31).
    const order = typesOf(events);
    expect(order.indexOf("FIRE_REVEALED")).toBe(order.indexOf("BASE_HEAT_DETERMINED") + 1);
    expect(order.indexOf("ACTUAL_HEAT_CALCULATED")).toBe(order.indexOf("FIRE_REVEALED") + 1);
    const results = eventsOfType(events, "ACTUAL_HEAT_CALCULATED")[0]?.results ?? [];
    // Global 2 + High +1 − 1 = 2; the rival's ceramic in the same zone is 3.
    expect(results.map((r) => [r.ceramicId, r.calculation.kilnMasterMarker, r.calculation.actualHeat])).toEqual([
      ["c1", -1, 2],
      ["c2", 0, 3],
    ]);

    const furniture = openFiringTable(
      firingSpec([{ owner: "p1", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_1", kilnFurniture: 1, kilnMaster: 1 }], { techs: ["T24", "T15"] }),
    );
    const furnitureResults = eventsOfType(tendAll(furniture), "ACTUAL_HEAT_CALCULATED")[0]?.results ?? [];
    // It stacks with Kiln Furniture: 2 + 1 (furniture) + 1 (marker) = 4.
    expect(furnitureResults[0]?.calculation).toMatchObject({ positionModifier: 1, kilnMasterMarker: 1, actualHeat: 4, heatDifference: 0 });

    const imperialTable = openFiringTable(
      firingSpec([{ owner: "p1", stage: "loaded", shape: "vase", glaze: "celadon", at: "imperial", imperialModifier: 1, kilnMaster: 1 }]),
    );
    const imperialResults = eventsOfType(imperialTable.events, "ACTUAL_HEAT_CALCULATED")[0]?.results ?? [];
    // Court-fired: Kiln Die 2 + Fire 0 + modifier 1 + marker 1 = 4 (L310).
    expect(imperialResults[0]?.calculation).toMatchObject({ heatSource: 2, positionModifier: 1, kilnMasterMarker: 1, actualHeat: 4 });
  });

  it("is public on the firing stage while loaded and gone once the firing finishes", () => {
    const t = openFiringTable(
      firingSpec([
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1", kilnMaster: 1 },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "high_1" },
      ]),
    );
    expect(firingStageView(t.view("p2"))?.ceramics.map((c) => [c.id, c.kilnMasterMarker])).toEqual([
      ["c1", 1],
      ["c2", null],
    ]);
    tendAll(t);
    expect(t.halts).toEqual([{ kind: "continue_after", milestone: "firing_done" }]);
    expect(t.state.ceramics["c1"]).toMatchObject({ stage: "finished" });
    expect("kilnMasterMarker" in (t.state.ceramics["c1"] ?? {})).toBe(false);
  });

  it("Jun's ±1 applies on top of it (L497, L654)", () => {
    const t = openFiringTable(
      firingSpec([{ owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1", kilnMaster: -1 }], { kilnId: "JU" }),
    );
    tendAll(t);
    expect(t.state.phase).toMatchObject({ type: "firing_heat_adjustment", queue: { actorIds: ["p1"] } });
    const events = t.act("p1", { type: "RESOLVE_JUN", adjustment: { ceramicId: "c1", delta: -1 } });
    // 2 + 0 − 1 (marker) = 1, then Jun −1 = 0 vs White 1.
    expect(eventsOfType(events, "JUN_ADJUSTED")[0]).toMatchObject({ delta: -1, finalActualHeat: 0 });
    expect(t.state.lastFiring?.ceramics["c1"]?.first).toMatchObject({ kilnMasterMarker: -1, actualHeat: 1, junAdjustment: -1, finalActualHeat: 0 });
  });

  it("stays in place through a Second Firing recalculation (L646)", () => {
    // Kiln Master and Second Firing are both Firing Techs, so no player owns both (L240) and the
    // combination is unreachable in play; the engine still keeps the marker in the
    // recalculation. The marker is set on the state directly, and the commands run without the
    // invariant hook (which would refuse a marker without T24).
    const state: GameState = buildState(
      firingSpec([{ owner: "p1", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "middle_1" }], { techs: ["T14"] }, [0, 2, -1]),
    );
    const loaded = state.ceramics["c1"];
    if (loaded?.stage !== "loaded") throw new Error("c1 is not loaded");
    loaded.kilnMasterMarker = -1;
    const rng = new SeededRandom(1);
    const halts: FlowHalt[] = [];
    const flow = haltingFlow(halts);
    const opened: GameEvent[] = [];
    openFiringPhase(state, { rng, events: opened, flow });
    if (state.phase.type !== "firing_contributions") throw new Error(`expected Contributions, found ${state.phase.type}`);
    const windowId = state.phase.windowId;
    const submitted = submitContribution(state, { gameId: state.gameId, windowId, submissions: {} }, "p1", { type: "SUBMIT_CONTRIBUTION", windowId, card: "TEND" }, rng, { flow });
    if (!submitted.ok) throw new Error(submitted.error.code);
    // 2 + 0 − 1 = 1 vs Moon White 4: Flawed.
    expect(submitted.state.firing?.ceramics["c1"]).toMatchObject({ quality: "flawed", first: { kilnMasterMarker: -1, actualHeat: 1 } });
    const used = applyAction(submitted.state, "p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" }, rng, { flow });
    if (!used.ok) throw new Error(used.error.code);
    const chosen = applyAction(used.state, "p1", { type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: null }, rng, { flow });
    if (!chosen.ok) throw new Error(chosen.error.code);
    const events = chosen.events;
    // Same Base Heat 2, position 0 and marker −1, with the chosen +2: 3 vs 4 → Fine.
    expect(eventsOfType(events, "SECOND_FIRING_CHOSEN")[0]?.calculation).toEqual({
      fireModifier: 2,
      heatSource: 4,
      positionModifier: 0,
      kilnMasterMarker: -1,
      actualHeat: 3,
      junAdjustment: 0,
      finalActualHeat: 3,
      heatDifference: 1,
    });
    expect(JSON.stringify(events.map(projectEvent))).toContain('"kilnMasterMarker":-1');
  });
});
