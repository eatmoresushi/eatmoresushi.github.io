/**
 * The whole Firing Phase as a state machine (DESIGN §3.1, §3.3, §3.6, §3.7, §7; Appendix D as
 * owner revision 4 left it, rev. 4 L655–664: Contributions (Base Heat) → Test Pieces → Fire →
 * Actual Heat (Jun) → Quality → after-Quality → finish; no Heat-marker step, changes 28, 31, and
 * no salvage step, change 30: a Flawed ceramic is sold during its owner's turn instead, R20):
 * the skip check, every window in Appendix D order with the right actors, automatic steps
 * inside the command that reaches them, an always-legal exit in every window, card
 * conservation, and determinism under a `jsonb`-style key-sorted round trip.
 */

import { describe, expect, it } from "vitest";
import { afterQualityOptions, secondFiringChoiceOptions } from "../../../src/game/firing/afterQuality.ts";
import { sellFlawedOptions } from "../../../src/game/flawedSale.ts";
import { CONTRIBUTION_CARD_IDS } from "../../../src/game/content.ts";
import { validateAction } from "../../../src/game/engine.ts";
import { legalContributions, openFiringPhase, validateContribution } from "../../../src/game/firing/contributions.ts";
import { junOptions, testPiecesOptions } from "../../../src/game/firing/pipeline.ts";
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
 * - p1 Jun Kiln + Test Pieces; c1 Celadon in High;
 * - p2 Ge Kiln + Kiln Master, its marker +1 placed on c3 when it was loaded (rev. 4 L628, R22);
 *   c2 White in High (Standard), c3 Grey-Green in its Imperial Kiln;
 * - p3 Second Firing; c4 Moon White in Low (Flawed), c5 White in Low (Masterpiece), and c6, a
 *   Finished Flawed Bowl from an earlier round, which p3 may sell in their after-Quality turn
 *   (R20).
 * Fire deck: the round's 0, then −1 and −2 for Second Firing (rev. 4 L627).
 */
function everyWindow(fire: FireModifier[] = [0, -1, -2]): StateSpec {
  return {
    players: [
      { kilnId: "JU", techs: ["T13"], resources: { wood: 4 } },
      { kilnId: "GE", techs: [{ id: "T24", usedThisRound: true }], recognition: 2 },
      { kilnId: "RU", techs: ["T14"] },
    ],
    fireDeck: fire,
    ceramics: [
      { owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "high_2" },
      { owner: "p2", stage: "loaded", shape: "plate", glaze: "white", at: "high_1" },
      { owner: "p2", stage: "loaded", shape: "vase", glaze: "grey_green", at: "imperial", kilnMaster: 1 },
      { owner: "p3", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_1" },
      { owner: "p3", stage: "loaded", shape: "washer", glaze: "white", at: "low_2" },
      { owner: "p3", stage: "finished", shape: "bowl", glaze: "white", quality: "flawed" },
    ],
  };
}

type Step =
  | { actor: PlayerId; contribute: ContributionCardId }
  | { actor: PlayerId; action: GameAction };

/** Uses every ability once, in Appendix D order. */
const FULL_SCRIPT: Step[] = [
  { actor: "p2", contribute: "BANK" },
  { actor: "p3", contribute: "TEND" },
  { actor: "p1", contribute: "STOKE" },
  { actor: "p1", action: { type: "TEST_PIECES_DECIDE", peek: true } },
  { actor: "p1", action: { type: "TEST_PIECES_BURY", bury: false } },
  { actor: "p1", action: { type: "RESOLVE_JUN", adjustment: { ceramicId: "c1", delta: -1 } } },
  { actor: "p2", action: { type: "USE_GE_CRACKLE", ceramicId: "c2" } },
  // R20: a sale in p3's own after-Quality turn keeps the turn (Second Firing is still eligible).
  { actor: "p3", action: { type: "SELL_FLAWED", ceramicId: "c6" } },
  { actor: "p3", action: { type: "USE_SECOND_FIRING", ceramicId: "c4" } },
  { actor: "p3", action: { type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: null } },
];

/** Declines everything: the always-legal exit of every window (DESIGN §3.6). */
const EXIT_SCRIPT: Step[] = [
  { actor: "p1", contribute: "TEND" },
  { actor: "p2", contribute: "TEND" },
  { actor: "p3", contribute: "TEND" },
  { actor: "p1", action: { type: "TEST_PIECES_DECIDE", peek: false } },
  { actor: "p1", action: { type: "RESOLVE_JUN", adjustment: null } },
  { actor: "p2", action: { type: "END_AFTER_QUALITY" } },
  { actor: "p3", action: { type: "END_AFTER_QUALITY" } },
];

function run(table: LocalTable, step: Step): GameEvent[] {
  return "contribute" in step ? table.contribute(step.actor, step.contribute) : table.act(step.actor, step.action);
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
 * validates, every unlisted target is rejected, and the window's decline always validates. The
 * sale of a Flawed ceramic (R20) agrees with `sellFlawedOptions` for every player in every
 * window: only the after-Quality queue head may sell.
 */
function expectSelectorsAgree(table: LocalTable): void {
  const prompt = table.prompt();
  const ceramicIds = Object.keys(table.state.ceramics).sort();
  for (const player of table.state.playerOrder) {
    const view = table.actorView(player);
    const listed = sellFlawedOptions(view)?.ceramicIds ?? [];
    if (prompt.phaseType !== "firing_after_quality" || !prompt.actorIds.includes(player)) {
      expect(listed, `${prompt.phaseType} / ${player} sale`).toEqual([]);
    }
    for (const ceramicId of ceramicIds) {
      const ok = validateAction(view, { type: "SELL_FLAWED", ceramicId }) === null;
      expect(ok, `${prompt.phaseType} / ${player} sells ${ceramicId}`).toBe(listed.includes(ceramicId));
    }
  }
  for (const actor of prompt.actorIds) {
    const view = table.actorView(actor);
    const ok = (action: GameAction): boolean => validateAction(view, action) === null;
    const where = `${prompt.phaseType} / ${actor}`;
    switch (prompt.phaseType) {
      case "firing_contributions": {
        const listed = legalContributions(view);
        expect(listed[0]?.card, where).toBe("TEND");
        for (const card of CONTRIBUTION_CARD_IDS) {
          const command: SubmitContributionCommand = { type: "SUBMIT_CONTRIBUTION", windowId: listed[0]?.windowId ?? "", card };
          expect(validateContribution(view, table.privateState, command) === null, `${where} ${card}`).toBe(listed.some((c) => c.card === card));
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
      case "firing_second_firing_choice": {
        const options = secondFiringChoiceOptions(view);
        if (options === null) throw new Error(`${where}: no Second Firing options`);
        for (const cardIndex of [0, 1] as const) {
          expect(ok({ type: "SECOND_FIRING_CHOOSE", cardIndex, jun: null }), `${where} card ${cardIndex}`).toBe(true);
          expect(ok({ type: "SECOND_FIRING_CHOOSE", cardIndex, jun: { delta: 1 } }), `${where} card ${cardIndex} + Jun`).toBe(options.jun.ready);
        }
        expect(ok({ type: "RESOLVE_JUN", adjustment: null }), where).toBe(false);
        break;
      }
      case "firing_heat_adjustment": {
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
      { phaseType: "firing_heat_adjustment", actorIds: ["p1"], mode: "single" },
      { phaseType: "firing_after_quality", actorIds: ["p2"], mode: "single" },
      { phaseType: "firing_after_quality", actorIds: ["p3"], mode: "single" },
      { phaseType: "firing_after_quality", actorIds: ["p3"], mode: "single" },
      { phaseType: "firing_second_firing_choice", actorIds: ["p3"], mode: "single" },
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
      "CERAMIC_SOLD",
      "SECOND_FIRING_REVEALED",
      "SECOND_FIRING_CHOSEN",
      "QUALITY_ASSIGNED",
      "FIRING_FINISHED",
    ]);

    // The outcome, ceramic by ceramic.
    expect(eventsOfType(all, "BASE_HEAT_DETERMINED")[0]?.baseHeat).toBe(2);
    // c3 carries Kiln Master's +1 from loading: Kiln Die 2 + Fire 0 + 0 + 1 = 3.
    expect(eventsOfType(all, "ACTUAL_HEAT_CALCULATED")[0]?.results.find((r) => r.ceramicId === "c3")?.calculation.kilnMasterMarker).toBe(1);
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
    // c6 was sold; c4 stays Flawed after Second Firing and finishes (sellable in p3's next turn).
    expect(final.ceramics["c6"]).toBeUndefined();
    expect(final.ceramics["c4"]).toMatchObject({ stage: "finished", quality: "flawed" });
    expect(eventsOfType(all, "CERAMIC_SOLD")).toEqual([{ type: "CERAMIC_SOLD", playerId: "p3", ceramicId: "c6", coins: 2, from: "finished" }]);
    expect(final.ceramics["c2"]).toMatchObject({ stage: "finished", quality: "fine", crackle: true });
    expect(["c1", "c3", "c5"].map((id) => final.ceramics[id])).toEqual(
      ["c1", "c3", "c5"].map((id) => expect.objectContaining({ id, stage: "finished", quality: "masterpiece", crackle: false })),
    );
    expect(final.players["p3"]?.resources.coins).toBe(5);
    // Both Second Firing cards in reveal order, then the round's card at step 6 (rev. 4 L664).
    expect(final.fireDiscard.slice(-3)).toEqual([-1, -2, 0]);
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
    // p2's Kiln Master was used when c3 was loaded (rev. 4 L628), before the firing.
    expect(table.player("p2").techs[0]?.usedThisRound).toBe(true);
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
      return { actor, contribute: choice.card };
    }
    case "firing_test_pieces": {
      const options = testPiecesOptions(view);
      if (options === null) throw new Error("no Test Pieces options");
      return options.awaiting === "decision"
        ? { actor, action: { type: "TEST_PIECES_DECIDE", peek: options.canPeek } }
        : { actor, action: { type: "TEST_PIECES_BURY", bury: (options.peekedModifier ?? 0) > 0 } };
    }
    case "firing_heat_adjustment": {
      const options = junOptions(view);
      const ceramicId = options?.ceramicIds[0];
      return { actor, action: { type: "RESOLVE_JUN", adjustment: ceramicId === undefined ? null : { ceramicId, delta: 1 } } };
    }
    case "firing_second_firing_choice": {
      const options = secondFiringChoiceOptions(view);
      return { actor, action: { type: "SECOND_FIRING_CHOOSE", cardIndex: 1, jun: options?.jun.ready === true ? { delta: 1 } : null } };
    }
    case "firing_after_quality": {
      // R20: a Finished Flawed ceramic is sold first; the turn stays open for the abilities.
      const sale = sellFlawedOptions(view)?.ceramicIds.find((id) => table.state.ceramics[id]?.stage === "finished");
      if (sale !== undefined) return { actor, action: { type: "SELL_FLAWED", ceramicId: sale } };
      const [option] = afterQualityOptions(view);
      const ceramicId = option?.ceramicIds[0];
      if (option === undefined || ceramicId === undefined) return { actor, action: { type: "END_AFTER_QUALITY" } };
      const type = option.ability === "protective_saggars" ? "USE_PROTECTIVE_SAGGARS" : option.ability === "second_firing" ? "USE_SECOND_FIRING" : "USE_GE_CRACKLE";
      return { actor, action: { type, ceramicId } };
    }
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
    expect(eventsOfType(plain.events, "FIRE_DECK_RESHUFFLED")).toEqual([{ type: "FIRE_DECK_RESHUFFLED", cardCount: 12, buriedBelow: 0 }]);
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
    expect(table.tryContribute("p1", "FUEL_LEDGER_STOKE").ok).toBe(false);
    expect(table.rng.getState()).toBe(before);
  });
});
