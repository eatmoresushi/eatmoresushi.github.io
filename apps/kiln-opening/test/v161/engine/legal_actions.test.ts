/**
 * The legal-action enumerator (DESIGN §5.1–5.3, §8.2 `legal_actions`): every enumerated
 * command validates and applies, every phase offers its §3.6 always-legal exit, families agree
 * with the enumeration, the order is deterministic and storage-independent, canonical is a
 * subset of exhaustive, limits are honoured, and nothing is offered to a viewer without a
 * decision.
 */

import { describe, expect, it } from "vitest";
import { validateAction } from "../../../src/game/engine.ts";
import { validateContribution } from "../../../src/game/firing/contributions.ts";
import { enumerateLegalActions, legalActionFamilies, legalActions, legalCommands, sampleLegalAction } from "../../../src/game/legalActions.ts";
import { SeededRandom } from "../../../src/game/rng.ts";
import { decisionPrompt } from "../../../src/game/state.ts";
import type { AuthoritativeCommand, GameAction, GamePhaseType } from "../../../src/game/types.ts";
import { actorViewOf, viewOf } from "../../../src/game/view.ts";
import { applyCommand } from "./ability_cases.ts";
import { DIRECTED_WEIGHTS, keySortedJsonRoundTrip, playFuzzGame } from "./p7_support.ts";
import { type PhaseScenario, phaseScenarios } from "./phase_scenarios.ts";
import { buildState } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";

const ALL_PHASES: readonly GamePhaseType[] = [
  "setup_kiln_selection",
  "round_start_setters_mark",
  "work_turn",
  "firing_contributions",
  "firing_test_pieces",
  "firing_heat_markers",
  "firing_heat_adjustment",
  "firing_after_quality",
  "firing_second_firing_choice",
  "firing_salvage",
  "orders",
  "cleanup_hand_limit",
];

const HALTING_PHASES = ["firing", "orders", "cleanup"];

function key(command: AuthoritativeCommand): string {
  return JSON.stringify(keySortedJsonRoundTrip(command));
}

/** A fresh copy of the scenario's table, so each command applies to the same decision. */
function copyOf(scenario: PhaseScenario): LocalTable {
  const original = scenario.table;
  return new LocalTable(structuredClone(original.state), {
    rng: new SeededRandom(original.rng.getState()),
    privateState: structuredClone(original.privateState),
    // The firing, Order Phase and Cleanup scenarios halt at their phase's end (as built).
    ...(HALTING_PHASES.some((prefix) => original.state.phase.type.startsWith(prefix)) ? { flow: "halt" as const } : {}),
  });
}

describe("legal actions in every phase", () => {
  const scenarios = phaseScenarios();

  it("cover every phase type except `finished`", () => {
    const covered = new Set(scenarios.map((s) => s.phase));
    for (const phase of ALL_PHASES) {
      expect(covered.has(phase), phase).toBe(true);
    }
    const steps = new Set(scenarios.map((s) => (s.table.state.phase.type === "work_turn" ? s.table.state.phase.step.kind : null)));
    for (const step of ["before_action", "commission_market", "guild_inspection", "colour_samples", "after_action"]) {
      expect(steps.has(step as never), step).toBe(true);
    }
  });

  it.each(scenarios.map((s) => [s.name, s] as const))("%s: every canonical command validates and applies; the §3.6 exit is offered", (_name, scenario) => {
    const view = scenario.table.view(scenario.actor);
    expect(decisionPrompt(view.game).actorIds).toContain(scenario.actor);
    const commands = legalCommands(view, { mode: "canonical" });
    expect(commands.length).toBeGreaterThan(0);
    if (scenario.exit !== null) {
      expect(commands.some(scenario.exit), "the always-legal exit").toBe(true);
    }
    for (const command of commands) {
      const error =
        command.type === "SUBMIT_CONTRIBUTION"
          ? validateContribution(scenario.table.actorView(scenario.actor), scenario.table.privateState, command)
          : validateAction(scenario.table.actorView(scenario.actor), command);
      expect(error, `${command.type} ${JSON.stringify(command)}`).toBeNull();
      const table = copyOf(scenario);
      expect(() => applyCommand(table, scenario.actor, command), JSON.stringify(command)).not.toThrow();
    }
    // No duplicates.
    expect(new Set(commands.map(key)).size).toBe(commands.length);
  });

  it.each(scenarios.map((s) => [s.name, s] as const))("%s: families agree with the enumeration", (_name, scenario) => {
    const view = scenario.table.view(scenario.actor);
    const families = legalActionFamilies(view);
    const types = [...new Set(legalActions(view, { mode: "canonical", perFamilyLimit: 1 }).map((a) => a.type))];
    expect(families).toEqual(types);
    const all = legalActions(view, { mode: "canonical", perFamilyLimit: 100_000 });
    expect([...new Set(all.map((a) => a.type))]).toEqual(families);
  });

  it.each(scenarios.map((s) => [s.name, s] as const))("%s: deterministic, storage-independent and bounded", (_name, scenario) => {
    const view = scenario.table.view(scenario.actor);
    const first = legalActions(view, { mode: "canonical" });
    expect(legalActions(view, { mode: "canonical" })).toEqual(first);
    const sorted = viewOf(keySortedJsonRoundTrip(scenario.table.state), scenario.actor, keySortedJsonRoundTrip(scenario.table.privateState));
    expect(legalActions(sorted, { mode: "canonical" }).map(key)).toEqual(first.map(key));
    expect(legalActions(view, { mode: "canonical", limit: 3 })).toEqual(first.slice(0, 3));
    const perFamily = legalActions(view, { mode: "canonical", perFamilyLimit: 2 });
    for (const type of new Set(perFamily.map((a) => a.type))) {
      expect(perFamily.filter((a) => a.type === type).length).toBeLessThanOrEqual(2);
    }
    expect(legalActions(view, { mode: "canonical", limit: 0 })).toEqual([]);
    const exhaustive = legalActions(view, { mode: "exhaustive", limit: 300 });
    for (const action of exhaustive) {
      expect(validateAction(scenario.table.actorView(scenario.actor), action)).toBeNull();
    }
  });

  it.each(scenarios.filter((s) => !s.name.includes("rich")).map((s) => [s.name, s] as const))(
    "%s: every canonical action is also an exhaustive one",
    (_name, scenario) => {
      const view = scenario.table.view(scenario.actor);
      const exhaustive = new Set<string>();
      for (const action of enumerateLegalActions(view, { mode: "exhaustive", limit: 200_000 })) {
        exhaustive.add(key(action));
      }
      for (const action of legalActions(view, { mode: "canonical", perFamilyLimit: 100_000 })) {
        expect(exhaustive.has(key(action)), JSON.stringify(action)).toBe(true);
      }
    },
  );

  it.each(scenarios.map((s) => [s.name, s] as const))("%s: nothing for spectators or players without a decision", (_name, scenario) => {
    const state = scenario.table.state;
    expect(legalActions(viewOf(state, null), { mode: "canonical" })).toEqual([]);
    expect(legalCommands(viewOf(state, null), { mode: "canonical" })).toEqual([]);
    expect(legalActionFamilies(viewOf(state, null))).toEqual([]);
    const prompt = decisionPrompt(state);
    for (const playerId of state.playerOrder.filter((id) => !prompt.actorIds.includes(id))) {
      expect(legalCommands(viewOf(state, playerId, scenario.table.privateState), { mode: "canonical" })).toEqual([]);
      expect(() => sampleLegalAction(viewOf(state, playerId), new SeededRandom(1))).toThrow(/no legal action/);
    }
  });

  it.each(scenarios.filter((s) => s.phase !== "firing_contributions").map((s) => [s.name, s] as const))(
    "%s: sampled actions validate and are reproducible from the chooser seed",
    (_name, scenario) => {
      const view = scenario.table.view(scenario.actor);
      const families = legalActionFamilies(view);
      for (let seed = 1; seed <= 12; seed += 1) {
        const sampled = sampleLegalAction(view, new SeededRandom(seed));
        expect(validateAction(scenario.table.actorView(scenario.actor), sampled)).toBeNull();
        expect(families).toContain(sampled.type);
        expect(sampleLegalAction(view, new SeededRandom(seed))).toEqual(sampled);
      }
    },
  );
});

describe("contributions and finished games", () => {
  it("legalCommands returns the Contributions, Tend first; legalActions has none", () => {
    const scenario = phaseScenarios().find((s) => s.phase === "firing_contributions");
    expect(scenario).toBeDefined();
    if (scenario === undefined) {
      return;
    }
    const view = scenario.table.view(scenario.actor);
    const commands = legalCommands(view, { mode: "canonical" });
    // 1 command per held card: the Fuel Ledger owner's 5 (v1.6.2 change 26).
    expect(commands.map((c) => (c.type === "SUBMIT_CONTRIBUTION" ? c.card : c.type))).toEqual([
      "TEND",
      "BANK",
      "STOKE",
      "FUEL_LEDGER_BANK",
      "FUEL_LEDGER_STOKE",
    ]);
    expect(legalCommands(view, { mode: "canonical", limit: 1 })).toHaveLength(1);
    expect(legalActions(view, { mode: "canonical" })).toEqual([]);
    expect(legalActionFamilies(view)).toEqual([]);
  });

  it("offers nothing once the game is finished", () => {
    const { table } = playFuzzGame({ seed: 4242, chooserSeed: 99, playerCount: 2, agreementEvery: 0, legalityEvery: 0 });
    expect(table.state.phase.type).toBe("finished");
    for (const playerId of table.state.playerOrder) {
      expect(legalCommands(viewOf(table.state, playerId), { mode: "canonical" })).toEqual([]);
    }
  });

  it.each([2, 4] as const)("every canonical command resolves at every 4th decision of a full %i-player game", (count) => {
    const { table } = playFuzzGame({ seed: 700 + count, chooserSeed: 9, playerCount: count, agreementEvery: 0, legalityEvery: 0, applyCanonicalEvery: 4, weights: DIRECTED_WEIGHTS });
    expect(table.state.phase.type).toBe("finished");
  });

  it("the progress guarantee holds at every decision of a full game (§3.6)", () => {
    const { table } = playFuzzGame({ seed: 515, chooserSeed: 3, playerCount: 3, agreementEvery: 0, legalityEvery: 1 });
    expect(table.state.phase.type).toBe("finished");
  });
});

describe("collapsing (DESIGN §5.2)", () => {
  it("uses the Shifu and the lowest-ID available Apprentice, and one vessel per Shape × Decoration class", () => {
    const state = buildState({
      players: [{}, {}],
      ceramics: [
        { owner: "p1", stage: "shaped", shape: "bowl" },
        { owner: "p1", stage: "shaped", shape: "bowl" },
        { owner: "p1", stage: "shaped", shape: "plate", decoration: "carved" },
      ],
      placements: [{ player: "p1", worker: 1, locationId: "canal_wharf" }],
    });
    const view = actorViewOf(state, "p1");
    const actions = legalActions(view, { mode: "canonical", perFamilyLimit: 100_000 });
    const workers = new Set(actions.filter((a): a is GameAction & { workerId: string } => "workerId" in a).map((a) => a.workerId));
    expect([...workers].sort()).toEqual(["p1:apprentice:2", "p1:shifu"]);
    const loaded = new Set(actions.flatMap((a) => (a.type === "PLACE_GLAZE_LOAD" && a.loads.length === 1 ? [a.loads[0]?.ceramicId] : [])));
    expect([...loaded].sort()).toEqual(["c1", "c3"]);
    // Exhaustive keeps both Bowls.
    const exhaustive = legalActions(view, { mode: "exhaustive", perFamilyLimit: 100_000 });
    const all = new Set(exhaustive.flatMap((a) => (a.type === "PLACE_GLAZE_LOAD" && a.loads.length === 1 ? [a.loads[0]?.ceramicId] : [])));
    expect([...all].sort()).toEqual(["c1", "c2", "c3"]);
  });

  it("collapses empty unmarked spaces to one per zone but keeps every Imperial modifier", () => {
    const state = buildState({ players: [{ recognition: 2 }, {}, {}, {}], ceramics: [{ owner: "p1", stage: "shaped", shape: "bowl" }] });
    const view = actorViewOf(state, "p1");
    const loads = legalActions(view, { mode: "canonical", perFamilyLimit: 100_000 })
      .filter((a): a is Extract<GameAction, { type: "PLACE_GLAZE_LOAD" }> => a.type === "PLACE_GLAZE_LOAD" && a.workerId === "p1:apprentice:1" && a.loads.length === 1)
      .filter((a) => a.loads[0]?.glaze === "white")
      .map((a) => JSON.stringify(a.loads[0]?.destination));
    expect(loads.sort()).toEqual(
      [
        { kiln: "shared", spaceId: "high_1" },
        { kiln: "shared", spaceId: "middle_1" },
        { kiln: "shared", spaceId: "low_1" },
        { kiln: "imperial", imperialModifier: -1 },
        { kiln: "imperial", imperialModifier: 0 },
        { kiln: "imperial", imperialModifier: 1 },
      ]
        .map((d) => JSON.stringify(d))
        .sort(),
    );
  });

  // Verifier finding (minor): Kiln Furniture used one space overall and a rework only the
  // first destination, so a Shifu pair could never put the Furniture or reworked vessel in a
  // lower zone and the plain vessel into the last free high space.
  it("keeps one Kiln Furniture space and one rework destination per zone, so the second load can still take the last high space", () => {
    for (const tech of ["T15", "T05"] as const) {
      const state = buildState({
        players: [{ techs: [tech] }, {}],
        ceramics: [
          { owner: "p2", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1" },
          { owner: "p1", stage: "shaped", shape: "vase" },
          { owner: "p1", stage: "shaped", shape: "plate" },
        ],
      });
      const view = actorViewOf(state, "p1");
      const loads = legalActions(view, { mode: "canonical", perFamilyLimit: Number.POSITIVE_INFINITY }).filter(
        (a): a is Extract<GameAction, { type: "PLACE_GLAZE_LOAD" }> => a.type === "PLACE_GLAZE_LOAD",
      );
      const special = (load: Extract<GameAction, { type: "PLACE_GLAZE_LOAD" }>["loads"][number]) =>
        tech === "T05" ? load.reworkShape !== undefined : load.destination.kiln === "shared" && load.destination.kilnFurniture !== undefined;
      const zonesUsed = new Set(
        loads.flatMap((a) => a.loads.filter(special).map((l) => (l.destination.kiln === "shared" ? l.destination.spaceId : "imperial"))),
      );
      expect([...zonesUsed].sort(), tech).toEqual(expect.arrayContaining(["high_2", "middle_1", "low_1"]));
      const pair = loads.find(
        (a) =>
          a.loads.length === 2 &&
          a.loads[0] !== undefined &&
          special(a.loads[0]) &&
          a.loads[0].destination.kiln === "shared" &&
          a.loads[0].destination.spaceId === "middle_1" &&
          a.loads[1]?.destination.kiln === "shared" &&
          a.loads[1].destination.spaceId === "high_2" &&
          !special(a.loads[1]),
      );
      expect(pair, tech).toBeDefined();
    }
  });
});

// Verifier finding (minor): with the default `perFamilyLimit`, Glaze & Load spent its 64
// commands on Glaze permutations of single loads, so no pair, rework or Inverted Firing stack
// was offered. Every optional ability must be offered used and declined under default limits.
describe("Glaze & Load under the default canonical limits", () => {
  const glazeLoads = (techs: Array<"T05" | "T15" | "T21">) => {
    const state = buildState({
      players: [{ techs }, {}, {}, {}],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "low_1" },
        { owner: "p1", stage: "shaped", shape: "vase" },
        { owner: "p1", stage: "shaped", shape: "censer" },
        { owner: "p1", stage: "shaped", shape: "plate" },
      ],
    });
    const view = actorViewOf(state, "p1");
    const commands = legalCommands(view, { mode: "canonical" });
    for (const command of commands) {
      expect(validateAction(view, command as GameAction), JSON.stringify(command)).toBeNull();
    }
    return commands.filter((c): c is Extract<GameAction, { type: "PLACE_GLAZE_LOAD" }> => c.type === "PLACE_GLAZE_LOAD");
  };

  it.each([
    ["T05", (l: Extract<GameAction, { type: "PLACE_GLAZE_LOAD" }>["loads"][number]) => l.reworkShape !== undefined],
    ["T15", (l: Extract<GameAction, { type: "PLACE_GLAZE_LOAD" }>["loads"][number]) => l.destination.kiln === "shared" && l.destination.kilnFurniture !== undefined],
    ["T21", (l: Extract<GameAction, { type: "PLACE_GLAZE_LOAD" }>["loads"][number]) => l.destination.kiln === "shared" && l.destination.invertedFiring === true],
  ] as const)("%s is offered used and declined, beside pairs and Heat markers, for both workers", (tech, uses) => {
    const loads = glazeLoads([tech]);
    expect(loads).toHaveLength(64);
    for (const workerId of ["p1:shifu", "p1:apprentice:1"]) {
      const own = loads.filter((a) => a.workerId === workerId);
      expect(own.some((a) => a.loads.some(uses)), `${workerId} uses ${tech}`).toBe(true);
      expect(own.some((a) => !a.loads.some(uses)), `${workerId} declines ${tech}`).toBe(true);
    }
    const shifu = loads.filter((a) => a.workerId === "p1:shifu");
    expect(shifu.some((a) => a.loads.length === 2), "a Shifu pair").toBe(true);
    expect(shifu.some((a) => a.heatMarkerCeramicId !== undefined), "a Heat marker").toBe(true);
    expect(shifu.some((a) => a.heatMarkerCeramicId === undefined), "no Heat marker").toBe(true);
  });

  it("still offers every Glaze within the limit", () => {
    const loads = glazeLoads([]);
    expect(new Set(loads.map((a) => a.loads[0]?.glaze)).size).toBe(4);
  });
});
