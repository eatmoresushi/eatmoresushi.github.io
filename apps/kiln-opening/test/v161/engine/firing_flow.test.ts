/**
 * The whole Firing Phase as a state machine (DESIGN §3.1, §3.3, §3.6, §3.7, §7; Appendix D):
 * the skip check, every window in Appendix D order with the right actors, automatic steps
 * inside the command that reaches them, an always-legal exit in every window, card
 * conservation, and determinism under a `jsonb`-style key-sorted round trip.
 */

import { describe, expect, it } from "vitest";
import { afterQualityOptions, salvageOptions } from "../../../src/game/firing/afterQuality.ts";
import { validateAction } from "../../../src/game/engine.ts";
import { legalContributions, openFiringPhase, validateContribution } from "../../../src/game/firing/contributions.ts";
import { heatMarkerStepOptions, junOptions, testPiecesOptions } from "../../../src/game/firing/pipeline.ts";
import { SeededRandom } from "../../../src/game/rng.ts";
import type {
  AfterQualityAbility,
  CeramicId,
  ContributionCardId,
  DecisionPrompt,
  FireModifier,
  GameAction,
  GameEvent,
  GamePhaseType,
  PlayerId,
  SubmitContributionCommand,
} from "../../../src/game/types.ts";
import { projectEvent } from "../../../src/game/view.ts";
import { type StateSpec, buildState, cardZones } from "./support/fixtures.ts";
import { eventsOfType, keySortedJsonRoundTrip, openFiringTable, typesOf } from "./support/firing.ts";
import { type FlowHalt, haltingFlow } from "./support/flow.ts";
import type { LocalTable } from "./support/localTable.ts";

/**
 * Three players, First Player p1, every firing window in play:
 * - p1 Jun Kiln + Test Pieces; c1 Celadon in Middle with a face-down marker;
 * - p2 Ge Kiln + Kiln Master; c2 White in High (Standard), c3 Grey-Green in its Imperial Kiln;
 * - p3 Second Firing; c4 Moon White in Low (Flawed), c5 White in Low (Masterpiece).
 * Fire deck: the round's 0, then −1 for Second Firing.
 */
function everyWindow(fire: FireModifier[] = [0, -1]): StateSpec {
  return {
    players: [
      { kilnId: "JU", techs: ["T13"], resources: { wood: 4 } },
      { kilnId: "GE", techs: ["T24"], recognition: 2 },
      { kilnId: "RU", techs: ["T14"] },
    ],
    fireDeck: fire,
    ceramics: [
      { owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1", heatMarker: { source: "own", faceDown: true } },
      { owner: "p2", stage: "loaded", shape: "plate", glaze: "white", at: "high_1" },
      { owner: "p2", stage: "loaded", shape: "vase", glaze: "grey_green", at: "imperial" },
      { owner: "p3", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_1" },
      { owner: "p3", stage: "loaded", shape: "washer", glaze: "white", at: "low_2" },
    ],
  };
}

type Step =
  | { actor: PlayerId; contribute: ContributionCardId; fuelLedger?: boolean }
  | { actor: PlayerId; action: GameAction };

/** Uses every ability once, in Appendix D order. */
const FULL_SCRIPT: Step[] = [
  { actor: "p2", contribute: "BANK" },
  { actor: "p3", contribute: "TEND" },
  { actor: "p1", contribute: "STOKE" },
  { actor: "p1", action: { type: "TEST_PIECES_DECIDE", peek: true } },
  { actor: "p1", action: { type: "TEST_PIECES_BURY", bury: false } },
  { actor: "p1", action: { type: "RESOLVE_HEAT_MARKERS", ownMarker: 1 } },
  { actor: "p2", action: { type: "RESOLVE_HEAT_MARKERS", kilnMaster: { ceramicId: "c3", value: 1 } } },
  { actor: "p1", action: { type: "RESOLVE_JUN", adjustment: { ceramicId: "c1", delta: -1 } } },
  { actor: "p2", action: { type: "USE_GE_CRACKLE", ceramicId: "c2" } },
  { actor: "p3", action: { type: "USE_SECOND_FIRING", ceramicId: "c4" } },
  { actor: "p3", action: { type: "SALVAGE_FLAWED", ceramicId: "c4" } },
];

/** Declines everything: the always-legal exit of every window (DESIGN §3.6). */
const EXIT_SCRIPT: Step[] = [
  { actor: "p1", contribute: "TEND" },
  { actor: "p2", contribute: "TEND" },
  { actor: "p3", contribute: "TEND" },
  { actor: "p1", action: { type: "TEST_PIECES_DECIDE", peek: false } },
  { actor: "p1", action: { type: "RESOLVE_HEAT_MARKERS", ownMarker: "return" } },
  { actor: "p2", action: { type: "RESOLVE_HEAT_MARKERS" } },
  { actor: "p1", action: { type: "RESOLVE_JUN", adjustment: null } },
  { actor: "p2", action: { type: "END_AFTER_QUALITY" } },
  { actor: "p3", action: { type: "END_AFTER_QUALITY" } },
  { actor: "p3", action: { type: "SALVAGE_FLAWED", ceramicId: null } },
];

function run(table: LocalTable, step: Step): GameEvent[] {
  return "contribute" in step ? table.contribute(step.actor, step.contribute, step.fuelLedger ?? false) : table.act(step.actor, step.action);
}

function fireCounts(table: LocalTable): string {
  return [...cardZones(table.state).fire].sort((a, b) => a - b).join(",");
}

const DECK = "-2,-1,-1,-1,0,0,0,0,1,1,1,2";

const ABILITY_ACTIONS: Record<AfterQualityAbility, (ceramicId: CeramicId) => GameAction> = {
  protective_saggars: (ceramicId) => ({ type: "USE_PROTECTIVE_SAGGARS", ceramicId }),
  second_firing: (ceramicId) => ({ type: "USE_SECOND_FIRING", ceramicId }),
  ge_crackle: (ceramicId) => ({ type: "USE_GE_CRACKLE", ceramicId }),
};

/**
 * Selector–validator agreement (DESIGN §5.4) for the P5 option selectors: every listed option
 * validates, every unlisted target is rejected, and the window's decline always validates.
 */
function expectSelectorsAgree(table: LocalTable): void {
  const prompt = table.prompt();
  const ceramicIds = Object.keys(table.state.ceramics).sort();
  for (const actor of prompt.actorIds) {
    const view = table.actorView(actor);
    const ok = (action: GameAction): boolean => validateAction(view, action) === null;
    const where = `${prompt.phaseType} / ${actor}`;
    switch (prompt.phaseType) {
      case "firing_contributions": {
        const listed = legalContributions(view);
        expect(listed[0]?.card, where).toBe("TEND");
        for (const [card, fuelLedger] of [["TEND", false], ["BANK", false], ["STOKE", false], ["BANK", true], ["STOKE", true], ["TEND", true]] as const) {
          const command: SubmitContributionCommand = { type: "SUBMIT_CONTRIBUTION", windowId: listed[0]?.windowId ?? "", card, fuelLedger };
          expect(validateContribution(view, table.privateState, command) === null, `${where} ${card}/${fuelLedger}`).toBe(
            listed.some((c) => c.card === card && c.fuelLedger === fuelLedger),
          );
        }
        break;
      }
      case "firing_test_pieces": {
        const options = testPiecesOptions(view);
        expect(options, where).not.toBeNull();
        if (options?.awaiting === "decision") {
          expect(ok({ type: "TEST_PIECES_DECIDE", peek: true }), where).toBe(options.canPeek);
          expect(ok({ type: "TEST_PIECES_DECIDE", peek: false }), where).toBe(true);
        } else {
          expect(ok({ type: "TEST_PIECES_BURY", bury: true }), where).toBe(true);
          expect(ok({ type: "TEST_PIECES_BURY", bury: false }), where).toBe(true);
        }
        break;
      }
      case "firing_heat_markers": {
        const options = heatMarkerStepOptions(view);
        if (options === null) throw new Error(`${where}: no options`);
        const own = options.ownMarkerCeramicId === null ? {} : { ownMarker: 1 as const };
        expect(ok({ type: "RESOLVE_HEAT_MARKERS", ...own }), where).toBe(true);
        if (options.ownMarkerCeramicId !== null) {
          expect(ok({ type: "RESOLVE_HEAT_MARKERS", ownMarker: "return" }), where).toBe(true);
        }
        for (const ceramicId of ceramicIds) {
          const kilnMaster = { ceramicId, value: 1 as const };
          expect(ok({ type: "RESOLVE_HEAT_MARKERS", ...own, kilnMaster }), `${where} ${ceramicId}`).toBe(options.kilnMaster?.targets.includes(ceramicId) ?? false);
          if (options.ownMarkerCeramicId !== null) {
            expect(ok({ type: "RESOLVE_HEAT_MARKERS", ownMarker: "return", kilnMaster }), `${where} return ${ceramicId}`).toBe(
              options.kilnMaster?.targetsIfOwnReturned.includes(ceramicId) ?? false,
            );
          }
        }
        break;
      }
      case "firing_heat_adjustment":
      case "firing_second_firing_jun": {
        const options = junOptions(view);
        expect(ok({ type: "RESOLVE_JUN", adjustment: null }), where).toBe(true);
        for (const ceramicId of ceramicIds) {
          for (const delta of [1, -1] as const) {
            expect(ok({ type: "RESOLVE_JUN", adjustment: { ceramicId, delta } }), `${where} ${ceramicId}`).toBe(options?.ceramicIds.includes(ceramicId) ?? false);
          }
        }
        break;
      }
      case "firing_after_quality": {
        const options = afterQualityOptions(view);
        expect(options.length, where).toBeGreaterThan(0);
        expect(ok({ type: "END_AFTER_QUALITY" }), where).toBe(true);
        for (const ability of Object.keys(ABILITY_ACTIONS) as AfterQualityAbility[]) {
          for (const ceramicId of ceramicIds) {
            const listed = options.find((option) => option.ability === ability)?.ceramicIds.includes(ceramicId) ?? false;
            expect(ok(ABILITY_ACTIONS[ability](ceramicId)), `${where} ${ability} ${ceramicId}`).toBe(listed);
          }
        }
        break;
      }
      case "firing_salvage": {
        const options = salvageOptions(view);
        expect(options?.ceramicIds.length, where).toBeGreaterThan(0);
        expect(ok({ type: "SALVAGE_FLAWED", ceramicId: null }), where).toBe(true);
        for (const ceramicId of ceramicIds) {
          expect(ok({ type: "SALVAGE_FLAWED", ceramicId }), `${where} ${ceramicId}`).toBe(options?.ceramicIds.includes(ceramicId) ?? false);
        }
        break;
      }
      default:
        throw new Error(`unexpected phase ${prompt.phaseType}`);
    }
  }
}

describe("the skip check through the production hand-over (L237, L670)", () => {
  it("work_phase_done → openFiringPhase → FIRING_SKIPPED → firing_done, in one call", () => {
    const halts: FlowHalt[] = [];
    const flow = haltingFlow(halts, { pass: ["work_phase_done"] });
    const state = buildState({ ceramics: [{ owner: "p1", stage: "shaped", shape: "vase" }] });
    const events: GameEvent[] = [];
    flow.continueAfter("work_phase_done", state, { rng: new SeededRandom(1), events, flow });
    expect(events).toEqual([{ type: "FIRING_SKIPPED", round: 1 }]);
    expect(halts).toEqual([{ kind: "continue_after", milestone: "firing_done" }]);
  });

  it("anything loaded, even only in an Imperial Kiln, starts a firing", () => {
    const state = buildState({
      players: [{ recognition: 2 }, {}],
      fireDeck: [0],
      ceramics: [{ owner: "p1", stage: "loaded", shape: "vase", glaze: "celadon", at: "imperial" }],
    });
    const halts: FlowHalt[] = [];
    const events: GameEvent[] = [];
    openFiringPhase(state, { rng: new SeededRandom(1), events, flow: haltingFlow(halts) });
    expect(typesOf(events)).toContain("FIRE_REVEALED");
    expect(typesOf(events).at(-1)).toBe("FIRING_FINISHED");
  });
});

describe("Appendix D in order, with every window (DESIGN §3.3)", () => {
  it("visits each window with the right actors and decision mode", () => {
    const table = openFiringTable(everyWindow());
    const prompts: DecisionPrompt[] = [table.prompt()];
    const phases: GamePhaseType[] = [table.state.phase.type];
    const all: GameEvent[] = [...table.events];
    for (const step of FULL_SCRIPT) {
      expectSelectorsAgree(table);
      all.push(...run(table, step));
      expect(fireCounts(table), `Fire cards after ${JSON.stringify(step)}`).toBe(DECK);
      if (table.halts.length === 0) {
        prompts.push(table.prompt());
        phases.push(table.state.phase.type);
      }
    }
    expect(prompts).toEqual([
      { phaseType: "firing_contributions", actorIds: ["p1", "p2", "p3"], mode: "simultaneous_secret" },
      { phaseType: "firing_contributions", actorIds: ["p1", "p3"], mode: "simultaneous_secret" },
      { phaseType: "firing_contributions", actorIds: ["p1"], mode: "simultaneous_secret" },
      { phaseType: "firing_test_pieces", actorIds: ["p1"], mode: "single" },
      { phaseType: "firing_test_pieces", actorIds: ["p1"], mode: "single" },
      { phaseType: "firing_heat_markers", actorIds: ["p1"], mode: "single" },
      { phaseType: "firing_heat_markers", actorIds: ["p2"], mode: "single" },
      { phaseType: "firing_heat_adjustment", actorIds: ["p1"], mode: "single" },
      { phaseType: "firing_after_quality", actorIds: ["p2"], mode: "single" },
      { phaseType: "firing_after_quality", actorIds: ["p3"], mode: "single" },
      { phaseType: "firing_salvage", actorIds: ["p3"], mode: "parallel" },
    ]);
    expect(phases).toHaveLength(prompts.length);
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "firing_done" }]);

    const order = typesOf(all).filter((type) => type !== "RESOURCES_CHANGED" && type !== "TECH_USED" && type !== "KILN_ABILITY_USED");
    expect(order).toEqual([
      "FIRING_STARTED",
      "CONTRIBUTION_SUBMITTED",
      "CONTRIBUTION_SUBMITTED",
      "CONTRIBUTION_SUBMITTED",
      "CONTRIBUTIONS_REVEALED",
      "BASE_HEAT_DETERMINED",
      "TEST_PIECES_PEEKED",
      "TEST_PIECES_USED",
      "HEAT_MARKER_TURNED",
      "KILN_MASTER_PLACED",
      "FIRE_REVEALED",
      "ACTUAL_HEAT_CALCULATED",
      "JUN_ADJUSTED",
      "QUALITY_ASSIGNED",
      "QUALITY_ASSIGNED",
      "QUALITY_ASSIGNED",
      "QUALITY_ASSIGNED",
      "QUALITY_ASSIGNED",
      "QUALITY_IMPROVED",
      "CRACKLE_APPLIED",
      "SECOND_FIRING_REVEALED",
      "QUALITY_ASSIGNED",
      "CERAMIC_SALVAGED",
      "FIRING_FINISHED",
    ]);

    // The outcome, ceramic by ceramic.
    expect(eventsOfType(all, "BASE_HEAT_DETERMINED")[0]?.baseHeat).toBe(2);
    expect(eventsOfType(all, "ACTUAL_HEAT_CALCULATED")[0]?.results.map((r) => [r.ceramicId, r.calculation.actualHeat])).toEqual([
      ["c1", 3],
      ["c2", 3],
      ["c3", 3],
      ["c4", 1],
      ["c5", 1],
    ]);
    expect(eventsOfType(all, "QUALITY_ASSIGNED").map((e) => [e.ceramicId, e.quality, e.cause])).toEqual([
      ["c1", "masterpiece", "fired"],
      ["c2", "standard", "fired"],
      ["c3", "masterpiece", "fired"],
      ["c4", "flawed", "fired"],
      ["c5", "masterpiece", "fired"],
      ["c4", "flawed", "second_firing"],
    ]);
    const final = table.state;
    expect(final.firing).toBeNull();
    expect(final.ceramics["c4"]).toBeUndefined();
    expect(final.ceramics["c2"]).toMatchObject({ stage: "finished", quality: "fine", crackle: true });
    expect(["c1", "c3", "c5"].map((id) => final.ceramics[id])).toEqual(
      ["c1", "c3", "c5"].map((id) => expect.objectContaining({ id, stage: "finished", quality: "masterpiece", crackle: false })),
    );
    expect(final.players["p3"]?.resources.coins).toBe(5);
    expect(final.fireDiscard.slice(-2)).toEqual([-1, 0]);
    // No projected event carries a secret.
    for (const event of all) {
      expect("secret" in projectEvent(event)).toBe(false);
    }
  });

  it("every window has a legal exit, and declining everything still finishes the firing (DESIGN §3.6)", () => {
    const table = openFiringTable(everyWindow());
    for (const step of EXIT_SCRIPT) {
      expect(table.halts).toEqual([]);
      expectSelectorsAgree(table);
      run(table, step);
      expect(fireCounts(table)).toBe(DECK);
    }
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "firing_done" }]);
    // Declined abilities keep their once-per-round use (R4).
    expect(table.player("p1").kilnAbilityUsedThisRound).toBe(false);
    expect(table.player("p1").techs[0]?.usedThisRound).toBe(false);
    expect(table.player("p2").kilnAbilityUsedThisRound).toBe(false);
    expect(table.player("p2").techs[0]?.usedThisRound).toBe(false);
    expect(table.player("p3").techs[0]?.usedThisRound).toBe(false);
    expect(table.state.ceramics["c4"]).toMatchObject({ stage: "finished", quality: "flawed" });
  });

  it("windows without an eligible actor are skipped inside the command that reaches them (DESIGN §3.7)", () => {
    const table = openFiringTable({
      players: 2,
      fireDeck: [0],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1" },
      ],
    });
    table.contribute("p1", "TEND");
    const events = table.contribute("p2", "TEND");
    expect(typesOf(events)).toEqual([
      "CONTRIBUTION_SUBMITTED",
      "CONTRIBUTIONS_REVEALED",
      "BASE_HEAT_DETERMINED",
      "FIRE_REVEALED",
      "ACTUAL_HEAT_CALCULATED",
      "QUALITY_ASSIGNED",
      "QUALITY_ASSIGNED",
      "FIRING_FINISHED",
    ]);
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "firing_done" }]);
  });
});

/**
 * A deterministic chooser built only from the P5 option selectors, so every command it sends
 * is one a selector offered (and the dispatcher must accept). Uses every ability it can.
 */
function nextStep(table: LocalTable): Step {
  const prompt = table.prompt();
  const actor = prompt.actorIds[0];
  if (actor === undefined) throw new Error(`no actor in ${prompt.phaseType}`);
  const view = table.view(actor);
  switch (prompt.phaseType) {
    case "firing_contributions": {
      const options = legalContributions(view);
      const choice = options.at(-1) ?? options[0];
      if (choice === undefined) throw new Error("no Contribution offered");
      return { actor, contribute: choice.card, fuelLedger: choice.fuelLedger };
    }
    case "firing_test_pieces": {
      const options = testPiecesOptions(view);
      if (options === null) throw new Error("no Test Pieces options");
      return options.awaiting === "decision"
        ? { actor, action: { type: "TEST_PIECES_DECIDE", peek: options.canPeek } }
        : { actor, action: { type: "TEST_PIECES_BURY", bury: (options.peekedModifier ?? 0) > 0 } };
    }
    case "firing_heat_markers": {
      const options = heatMarkerStepOptions(view);
      if (options === null) throw new Error("no Heat-marker options");
      const target = options.kilnMaster?.targets[0];
      return {
        actor,
        action: {
          type: "RESOLVE_HEAT_MARKERS",
          ...(options.ownMarkerCeramicId === null ? {} : { ownMarker: 1 as const }),
          ...(target === undefined ? {} : { kilnMaster: { ceramicId: target, value: -1 as const } }),
        },
      };
    }
    case "firing_heat_adjustment":
    case "firing_second_firing_jun": {
      const options = junOptions(view);
      const ceramicId = options?.ceramicIds[0];
      return { actor, action: { type: "RESOLVE_JUN", adjustment: ceramicId === undefined ? null : { ceramicId, delta: 1 } } };
    }
    case "firing_after_quality": {
      const [option] = afterQualityOptions(view);
      const ceramicId = option?.ceramicIds[0];
      if (option === undefined || ceramicId === undefined) return { actor, action: { type: "END_AFTER_QUALITY" } };
      const type = option.ability === "protective_saggars" ? "USE_PROTECTIVE_SAGGARS" : option.ability === "second_firing" ? "USE_SECOND_FIRING" : "USE_GE_CRACKLE";
      return { actor, action: { type, ceramicId } };
    }
    case "firing_salvage":
      return { actor, action: { type: "SALVAGE_FLAWED", ceramicId: salvageOptions(view)?.ceramicIds[0] ?? null } };
    default:
      throw new Error(`unexpected phase ${prompt.phaseType}`);
  }
}

describe("determinism (DESIGN §7)", () => {
  function play(roundTrip: boolean, seed: number): { events: GameEvent[]; table: LocalTable; steps: number } {
    // An empty Fire deck makes the first draw reshuffle, so the RNG is exercised.
    const table = openFiringTable(everyWindow([]), { seed });
    const events: GameEvent[] = [];
    let steps = 0;
    while (table.halts.length === 0) {
      if (roundTrip) {
        table.state = keySortedJsonRoundTrip(table.state);
        table.privateState = keySortedJsonRoundTrip(table.privateState);
      }
      expectSelectorsAgree(table);
      events.push(...run(table, nextStep(table)));
      expect(fireCounts(table)).toBe(DECK);
      steps += 1;
      expect(steps).toBeLessThan(40);
    }
    return { events, table, steps };
  }

  it.each([21, 22, 23, 24])("seed %i replays identically through a key-sorted (jsonb) round trip before every command", (seed) => {
    const plain = play(false, seed);
    const sorted = play(true, seed);
    expect(eventsOfType(plain.events, "FIRE_DECK_RESHUFFLED")).toEqual([{ type: "FIRE_DECK_RESHUFFLED", cardCount: 12 }]);
    expect(sorted.steps).toBe(plain.steps);
    expect(sorted.events).toEqual(plain.events);
    expect(sorted.table.state).toEqual(plain.table.state);
    expect(sorted.table.rng.getState()).toBe(plain.table.rng.getState());
    expect(plain.table.halts).toEqual([{ kind: "continue_after", milestone: "firing_done" }]);
  });

  it("validation never consumes randomness", () => {
    const table = openFiringTable(everyWindow([]), { seed: 5 });
    const before = table.rng.getState();
    table.expectRuleError("p1", { type: "TEST_PIECES_DECIDE", peek: true }, "WRONG_PHASE");
    expect(table.tryContribute("p1", "STOKE", true).ok).toBe(false);
    expect(table.rng.getState()).toBe(before);
  });
});
