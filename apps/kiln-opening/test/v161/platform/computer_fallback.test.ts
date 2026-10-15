/**
 * The computer fallback (DESIGN §3.6, §4.6, §9.2 P9). The strategic policy is forced to throw
 * or time out in every phase type — Contributions included — and the seat still moves on:
 * the service commits the first of `fallbackComputerCommands(view)` that the engine accepts
 * (`legalCommands(view, {mode: "canonical"})`, then the §3.6 safe exits), logs the cause
 * server-side only, and the game still reaches `finished`.
 */

import { describe, expect, it } from "vitest";
import { SeededRandom, applyAction, decisionPrompt, isGameRuleError, parseCommand, submitContribution } from "../../../src/game/index.ts";
import type { ActorView, AuthoritativeCommand, GamePhaseType, GameState, PlayerId, PrivateFiringState } from "../../../src/game/index.ts";
import {
  ComputerPolicyTimeoutError,
  DEFAULT_DECISION_BUDGET_MS,
  STRATEGIC_COMPUTER_POLICY,
  STRATEGIC_COMPUTER_POLICY_VERSION,
  chooseStrategicCommand,
  createComputerObservation,
  createStrategicComputerPolicy,
  fallbackComputerCommands,
  safeExitCommands,
  selectFirstLegalComputerCommand,
  withDecisionTimeout,
} from "../../../src/multiplayer/index.ts";
import type { ComputerPolicy, ComputerSeatContext } from "../../../src/multiplayer/index.ts";
import { phaseScenarios } from "../engine/phase_scenarios.ts";
import { advance, command, connectionFor, headState, lobby, nextCommandId, valueOf, type Harness } from "./support.ts";

const SECRET_TEXT = "policy failure naming the hand";

/** The host's strategic play, with a budget a loaded test machine cannot trip (the production
 * budget is wall-clock; the budget tests below inject their own clocks). */
const HOST_POLICY = createStrategicComputerPolicy({ decisionBudgetMs: 10_000 });

/** Every phase with a decision (DESIGN §3.4); `finished` has none. */
const DECISION_PHASES: readonly GamePhaseType[] = [
  "setup_kiln_selection",
  "round_start_setters_mark",
  "work_turn",
  "firing_contributions",
  "firing_test_pieces",
  "firing_heat_markers",
  "firing_heat_adjustment",
  "firing_after_quality",
  "firing_second_firing_jun",
  "firing_salvage",
  "orders",
  "cleanup_hand_limit",
];

const WORK_STEPS = ["before_action", "commission_market", "guild_inspection", "colour_samples", "after_action"] as const;

/** Whether the engine accepts the candidate, exactly as the service checks it: shape first
 * (`parseCommand`), then `submitContribution` or `applyAction` on the current state. */
function accepts(state: GameState, privateState: PrivateFiringState, actor: PlayerId, candidate: unknown): boolean {
  const parsed = parseCommand(candidate);
  if (isGameRuleError(parsed)) return false;
  if (parsed.type === "SUBMIT_CONTRIBUTION") {
    return submitContribution(state, privateState, actor, parsed, new SeededRandom(1)).ok;
  }
  return applyAction(state, actor, parsed, new SeededRandom(1)).ok;
}

function throwingPolicy(): ComputerPolicy {
  return {
    version: STRATEGIC_COMPUTER_POLICY_VERSION,
    label: "Throwing strategic",
    chooseCommand(view) {
      throw new Error(`${SECRET_TEXT}: ${view.own.orderHand.join(",")}`);
    },
  };
}

function seatOf(playerId: PlayerId): ComputerSeatContext {
  return { playerId, displayName: playerId, aiSeed: 11, aiPolicyVersion: STRATEGIC_COMPUTER_POLICY_VERSION };
}

function scenarioView(scenario: ReturnType<typeof phaseScenarios>[number]): ActorView {
  return createComputerObservation(scenario.table.state, scenario.actor, scenario.table.privateState);
}

describe("computer fallback in every phase type", () => {
  it("covers every decision phase and Work step in the scenarios", () => {
    const scenarios = phaseScenarios();
    const phases = new Set(scenarios.map((scenario) => scenario.phase));
    for (const phase of DECISION_PHASES) expect(phases, phase).toContain(phase);
    const steps = new Set(
      scenarios.flatMap((scenario) => (scenario.table.state.phase.type === "work_turn" ? [scenario.table.state.phase.step.kind] : [])),
    );
    for (const step of WORK_STEPS) expect(steps, step).toContain(step);
  });

  it("commits a legal fallback when the strategic policy throws, in every phase type", () => {
    for (const scenario of phaseScenarios()) {
      const view = scenarioView(scenario);
      let preferred: AuthoritativeCommand | null = null;
      let threw = false;
      try {
        preferred = throwingPolicy().chooseCommand(view, seatOf(scenario.actor)) as AuthoritativeCommand | null;
      } catch (cause) {
        threw = cause instanceof Error && cause.message.startsWith(SECRET_TEXT);
      }
      expect(threw, scenario.name).toBe(true);
      const selection = selectFirstLegalComputerCommand(preferred, () => fallbackComputerCommands(view), (candidate) =>
        accepts(scenario.table.state, scenario.table.privateState, scenario.actor, candidate)
          ? { ok: true, command: candidate as AuthoritativeCommand, result: true }
          : { ok: false, code: "REJECTED", message: "rejected" },
      );
      expect(selection, scenario.name).not.toBeNull();
      expect(selection?.usedFallback, scenario.name).toBe(true);
      if (scenario.phase === "firing_contributions") {
        // Tend first: always affordable (L261).
        expect(selection?.command).toMatchObject({ type: "SUBMIT_CONTRIBUTION", card: "TEND" });
      }
    }
  });

  it("keeps a legal exit in every phase type even when enumeration is unavailable", () => {
    for (const scenario of phaseScenarios()) {
      const view = scenarioView(scenario);
      const exits = safeExitCommands(view);
      expect(
        exits.some((candidate) => accepts(scenario.table.state, scenario.table.privateState, scenario.actor, candidate)),
        scenario.name,
      ).toBe(true);
      // The fallback list ends with the same exits.
      const fallback = fallbackComputerCommands(view).map((candidate) => JSON.stringify(candidate));
      for (const exit of exits) expect(fallback, scenario.name).toContain(JSON.stringify(exit));
    }
  });

  it("proposes a legal command of its own in every phase type", () => {
    for (const scenario of phaseScenarios()) {
      const view = scenarioView(scenario);
      const choice = chooseStrategicCommand(view, seatOf(scenario.actor));
      expect(choice, scenario.name).not.toBeNull();
      expect(accepts(scenario.table.state, scenario.table.privateState, scenario.actor, choice), `${scenario.name}: ${JSON.stringify(choice)}`).toBe(true);
    }
  });
});

async function hostView(harness: Harness): Promise<ActorView> {
  const reconnect = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P1").seatToken }));
  if (reconnect.game === null || reconnect.ownPrivateView === null) throw new Error("No game view for the host");
  return { viewerId: "P1", game: reconnect.game, own: reconnect.ownPrivateView };
}

/** The host plays strategically; the computer seats use `policy`. Returns every response. */
async function playWith(policy: ComputerPolicy, computers: number, seedBase: number): Promise<{ harness: Harness; state: GameState; responses: string[] }> {
  const harness = await lobby({ humans: 1, computers, seedBase, service: { computerPolicy: policy } });
  harness.revision = valueOf(
    await harness.service.startGame({ roomCode: harness.roomCode, seatToken: harness.host.seatToken, commandId: nextCommandId(harness, "9200") }),
  ).revision;
  const responses: string[] = [];
  for (let step = 0; step < 4_000; step += 1) {
    const state = await headState(harness);
    if (state.phase.type === "finished") return { harness, state, responses };
    if (!decisionPrompt(state).actorIds.includes("P1")) {
      const advanced = await advance(harness, state.revision);
      responses.push(JSON.stringify(advanced));
      valueOf(advanced);
      continue;
    }
    const choice = await HOST_POLICY.chooseCommand(await hostView(harness), seatOf("P1"));
    if (choice === null) throw new Error(`No host command in ${state.phase.type}`);
    responses.push(JSON.stringify(await command(harness, "P1", choice, state.revision)));
  }
  throw new Error("The game did not finish");
}

/** Starts the game and plays the host strategically until a computer seat must act. */
async function startUntilComputerActs(harness: Harness): Promise<GameState> {
  harness.revision = valueOf(
    await harness.service.startGame({ roomCode: harness.roomCode, seatToken: harness.host.seatToken, commandId: nextCommandId(harness, "9200") }),
  ).revision;
  for (let step = 0; step < 50; step += 1) {
    const state = await headState(harness);
    if (!decisionPrompt(state).actorIds.includes("P1")) return state;
    const choice = await HOST_POLICY.chooseCommand(await hostView(harness), seatOf("P1"));
    if (choice === null) throw new Error("No host command");
    await command(harness, "P1", choice, state.revision);
  }
  throw new Error("The computer seat never had to act");
}

function failedPhases(harness: Harness): Set<string> {
  const phases = new Set<string>();
  for (const entry of harness.logger.entries) {
    if (entry.message === "computer policy proposal rejected") phases.add(String(entry.context["phase"]));
  }
  return phases;
}

describe("computer fallback through the service", () => {
  it("finishes a game whose computer policy throws in every phase, and never forwards the cause", async () => {
    // Seed 8 602: the computer seats reach every listed phase, the Order Phase included (not
    // every seed gives a fallback-played seat an Order-Phase decision).
    const { harness, state, responses } = await playWith(throwingPolicy(), 2, 8_602);
    expect(state.phase.type).toBe("finished");
    expect(state.finalResult?.standings).toHaveLength(3);
    const failures = harness.logger.entries.filter((entry) => entry.message === "computer policy failed");
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.every((entry) => String(entry.context["cause"]).startsWith(SECRET_TEXT))).toBe(true);
    const phases = failedPhases(harness);
    for (const phase of ["setup_kiln_selection", "work_turn", "firing_contributions", "orders"]) expect(phases, phase).toContain(phase);
    for (const response of responses) expect(response).not.toContain(SECRET_TEXT);
  }, 120_000);

  it("falls back when a decision overruns its budget", async () => {
    let clock = 0;
    const slow = createStrategicComputerPolicy({
      decisionBudgetMs: 5,
      now: () => {
        clock += 10;
        return clock;
      },
    });
    const view = scenarioView(phaseScenarios()[0] as ReturnType<typeof phaseScenarios>[number]);
    expect(() => slow.chooseCommand(view, seatOf(view.viewerId))).toThrow(ComputerPolicyTimeoutError);

    const harness = await lobby({ humans: 1, computers: 1, seedBase: 8_701, service: { computerPolicy: slow } });
    const state = await startUntilComputerActs(harness);
    const advanced = valueOf(await advance(harness, state.revision));
    expect(advanced.actorIds.length).toBeGreaterThan(0);
    expect(JSON.stringify(advanced)).not.toContain("decision budget");
    const failure = harness.logger.entries.find((entry) => entry.message === "computer policy failed");
    expect(String(failure?.context["cause"])).toContain("decision budget");
  });

  it("bounds the service policy's thinking per request", () => {
    // The service plays up to 24 computer actions per request (its per-request cap). Even if
    // every one ran to the default budget, the request stays inside ~2 s of CPU.
    expect(DEFAULT_DECISION_BUDGET_MS).toBeLessThanOrEqual(100);
    expect(24 * DEFAULT_DECISION_BUDGET_MS).toBeLessThanOrEqual(1_800);
    // The default policy enforces that budget: a clock just past it times the decision out,
    // and one just inside it lets the decision through.
    const view = scenarioView(phaseScenarios()[0] as ReturnType<typeof phaseScenarios>[number]);
    const clockStepping = (step: number) => {
      let clock = 0;
      return () => {
        const now = clock;
        clock += step;
        return now;
      };
    };
    const over = createStrategicComputerPolicy({ now: clockStepping(DEFAULT_DECISION_BUDGET_MS + 1) });
    expect(() => over.chooseCommand(view, seatOf(view.viewerId))).toThrow(ComputerPolicyTimeoutError);
    const inside = createStrategicComputerPolicy({ now: clockStepping(Math.floor(DEFAULT_DECISION_BUDGET_MS / 4)) });
    expect(inside.chooseCommand(view, seatOf(view.viewerId))).toMatchObject({ type: "SELECT_KILN" });
  });

  it("falls back when an asynchronous policy does not answer in time", async () => {
    const never: ComputerPolicy = {
      version: "rules-v1.6.1-never-001",
      label: "Never",
      chooseCommand: () => new Promise<AuthoritativeCommand | null>(() => undefined),
    };
    const timed = withDecisionTimeout(never, 20);
    const harness = await lobby({ humans: 1, computers: 1, seedBase: 8_801, service: { computerPolicy: timed } });
    const state = await startUntilComputerActs(harness);
    const advanced = valueOf(await advance(harness, state.revision));
    expect(advanced.actorIds.length).toBeGreaterThan(0);
    expect(harness.logger.entries.some((entry) => String(entry.context["cause"]).includes("decision budget"))).toBe(true);
  });

  it("times out a synchronous policy that overruns, and passes one that does not", () => {
    const view = scenarioView(phaseScenarios()[0] as ReturnType<typeof phaseScenarios>[number]);
    let clock = 0;
    const tick = (step: number) => () => {
      clock += step;
      return clock;
    };
    expect(() => withDecisionTimeout(STRATEGIC_COMPUTER_POLICY, 50, tick(100)).chooseCommand(view, seatOf(view.viewerId))).toThrow(ComputerPolicyTimeoutError);
    expect(withDecisionTimeout(STRATEGIC_COMPUTER_POLICY, 50, tick(1)).chooseCommand(view, seatOf(view.viewerId))).toMatchObject({ type: "SELECT_KILN" });
  });
});
