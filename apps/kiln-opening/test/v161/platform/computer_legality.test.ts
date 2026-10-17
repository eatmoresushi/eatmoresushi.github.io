/**
 * Every computer proposal is legal (P9 regression). Local games logged "computer policy
 * proposal rejected … phase: firing_heat_markers, rejected: INVALID_CHOICE". Root cause: the
 * Heat-marker safe exits in `safeExitCommands` offered both `{ownMarker: "return"}` and the
 * bare `RESOLVE_HEAT_MARKERS`, and exactly one of them is ever legal — the validator requires
 * an own-marker choice while a face-down marker is out and rejects one without it. The
 * canonical baseline policy (`CANONICAL_COMPUTER_POLICY`, the local backend's and the e2e
 * smoke game's `policy: "canonical"`) samples uniformly from `fallbackComputerCommands(view)`,
 * so it sometimes proposed the illegal exit and the service fell back. The strategic policy
 * validates every candidate it proposes; these suites pin both: no proposal of either policy,
 * and no fallback candidate, is ever rejected, in any phase.
 */

import { describe, expect, it } from "vitest";
import {
  SeededRandom,
  applyAction,
  decisionPrompt,
  isGameRuleError,
  legalContributions,
  parseCommand,
  sampleLegalAction,
  submitContribution,
  validateAction,
} from "../../../src/game/index.ts";
import type { ActorView, AuthoritativeCommand, GameState, PlayerCount, PlayerId, PrivateFiringState } from "../../../src/game/index.ts";
import {
  CANONICAL_COMPUTER_POLICY,
  chooseStrategicCommand,
  createComputerObservation,
  createStrategicComputerPolicy,
  fallbackComputerCommands,
  safeExitCommands,
} from "../../../src/multiplayer/index.ts";
import type { ComputerPolicy } from "../../../src/multiplayer/index.ts";
import { phaseScenarios } from "../engine/phase_scenarios.ts";
import { openFiringTable, tendAll } from "../engine/support/firing.ts";
import { playEngineTable, randomChooser } from "./computer_support.ts";
import { advance, command, connectionFor, headState, lobby, nextCommandId, valueOf } from "./support.ts";

/** The strategic policy with a budget no loaded test machine can trip (see computer_full_games). */
const STRATEGIC = createStrategicComputerPolicy({ decisionBudgetMs: 10_000 });

const PLAYER_COUNTS: readonly PlayerCount[] = [2, 3, 4];

/** Whether the engine accepts `candidate` exactly as the service checks it: shape first, then
 * `submitContribution` or `applyAction` on the authoritative state. Returns the failure code. */
function rejection(state: GameState, privateState: PrivateFiringState, actor: PlayerId, candidate: unknown): string | null {
  const parsed = parseCommand(candidate);
  if (isGameRuleError(parsed)) return parsed.code;
  const result =
    parsed.type === "SUBMIT_CONTRIBUTION"
      ? submitContribution(state, privateState, actor, parsed, new SeededRandom(1))
      : applyAction(state, actor, parsed, new SeededRandom(1));
  return result.ok ? null : result.error.code;
}

/** The view-side check the strategic policy runs: `validateAction`, or membership of the
 * affordable Contributions (Contributions are not a `GameAction`). */
function viewRejection(view: ActorView, candidate: AuthoritativeCommand): string | null {
  if (candidate.type === "SUBMIT_CONTRIBUTION") {
    const key = JSON.stringify(candidate);
    return legalContributions(view).some((option) => JSON.stringify(option) === key) ? null : "NOT_AFFORDABLE";
  }
  return validateAction(view, candidate)?.code ?? null;
}

function phaseKey(state: GameState): string {
  return state.phase.type === "work_turn" ? `work_turn/${state.phase.step.kind}` : state.phase.type;
}

describe("Heat-marker safe exits", () => {
  it("offers only the return exit while a face-down own marker is out", () => {
    const scenario = phaseScenarios().find((candidate) => candidate.phase === "firing_heat_markers");
    if (scenario === undefined) throw new Error("No Heat-marker scenario");
    const view = createComputerObservation(scenario.table.state, scenario.actor, scenario.table.privateState);
    expect(safeExitCommands(view)).toEqual([{ type: "RESOLVE_HEAT_MARKERS", ownMarker: "return" }]);
    // The bare command is the one the validator rejected (the logged INVALID_CHOICE).
    expect(validateAction(view, { type: "RESOLVE_HEAT_MARKERS" })?.code).toBe("INVALID_CHOICE");
  });

  it("offers only the decline exit on a Kiln Master-only turn", () => {
    const table = openFiringTable({
      fireDeck: [0, 1, -1],
      players: [{ techs: ["T24"] }, {}],
      ceramics: [{ owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1" }],
    });
    tendAll(table);
    expect(table.state.phase.type).toBe("firing_heat_markers");
    const view = createComputerObservation(table.state, "p1", table.privateState);
    expect(safeExitCommands(view)).toEqual([{ type: "RESOLVE_HEAT_MARKERS" }]);
    expect(validateAction(view, { type: "RESOLVE_HEAT_MARKERS", ownMarker: "return" })?.code).toBe("INVALID_CHOICE");
    for (const candidate of fallbackComputerCommands(view)) {
      expect(rejection(table.state, table.privateState, "p1", candidate), JSON.stringify(candidate)).toBeNull();
    }
  });

  it("keeps every safe exit legal in every phase scenario", () => {
    for (const scenario of phaseScenarios()) {
      const view = createComputerObservation(scenario.table.state, scenario.actor, scenario.table.privateState);
      for (const exit of safeExitCommands(view)) {
        expect(rejection(scenario.table.state, scenario.table.privateState, scenario.actor, exit), `${scenario.name}: ${JSON.stringify(exit)}`).toBeNull();
      }
    }
  });
});

/** Everything the service logged (a rejected, failed or missing proposal, an engine error),
 * with the phase and the rejected codes, as the service logs them. */
function rejectionLog(entries: ReadonlyArray<{ message: string; context: Record<string, string | number | boolean> }>): string[] {
  return entries.map((entry) => `${entry.message} | ${String(entry.context["phase"])} | ${String(entry.context["rejected"])}`);
}

/**
 * One service table: the host is a "human" playing seeded random legal moves (as a person in
 * a local game reaches states no computer seat would), every other seat is a computer seat
 * played by `policy`. Returns every line the service logged.
 */
async function playServiceTable(policy: ComputerPolicy, players: PlayerCount, seedBase: number): Promise<{ log: string[]; state: GameState }> {
  const harness = await lobby({ humans: 1, computers: players - 1, seedBase, service: { computerPolicy: policy } });
  harness.revision = valueOf(
    await harness.service.startGame({ roomCode: harness.roomCode, seatToken: harness.host.seatToken, commandId: nextCommandId(harness, "9200") }),
  ).revision;
  const rng = new SeededRandom(seedBase);
  for (let step = 0; step < 6_000; step += 1) {
    const state = await headState(harness);
    if (state.phase.type === "finished") return { log: rejectionLog(harness.logger.entries), state };
    if (!decisionPrompt(state).actorIds.includes("P1")) {
      valueOf(await advance(harness, state.revision));
      continue;
    }
    const reconnect = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P1").seatToken }));
    if (reconnect.game === null || reconnect.ownPrivateView === null) throw new Error("No game view for the host");
    const view: ActorView = { viewerId: "P1", game: reconnect.game, own: reconnect.ownPrivateView };
    let choice: AuthoritativeCommand | null;
    if (view.game.phase.type === "firing_contributions") {
      const options = legalContributions(view);
      choice = options[rng.nextInt(options.length)] ?? null;
    } else {
      choice = sampleLegalAction(view, rng);
    }
    if (choice === null) throw new Error(`No host command in ${state.phase.type}`);
    await command(harness, "P1", choice, state.revision);
  }
  throw new Error(`The ${players}-player table ${seedBase} did not finish`);
}

describe("computer proposals through the service", () => {
  // Seeds that reproduced "computer policy proposal rejected | firing_heat_markers |
  // INVALID_CHOICE" before the fix (canonical computer seats, random host).
  it.each([
    [2, 22_001],
    [3, 23_019],
    [3, 23_024],
    [4, 24_008],
    [4, 24_012],
  ] as const)("the canonical policy is never rejected (%i players, seed %i)", async (players, seedBase) => {
    const { log, state } = await playServiceTable(CANONICAL_COMPUTER_POLICY, players, seedBase);
    expect(state.phase.type).toBe("finished");
    expect(log).toEqual([]);
  }, 120_000);

  it("the strategic policy is never rejected or falls back, over seeded 2-, 3- and 4-player tables", async () => {
    const log: string[] = [];
    for (const players of PLAYER_COUNTS) {
      for (let game = 0; game < 4; game += 1) {
        const seedBase = 26_000 + players * 100 + game;
        const result = await playServiceTable(STRATEGIC, players, seedBase);
        expect(result.state.phase.type).toBe("finished");
        log.push(...result.log.map((line) => `${players}p ${seedBase}: ${line}`));
      }
    }
    expect(log).toEqual([]);
  }, 300_000);
});

describe("computer proposals over many seeded engine games", () => {
  it("all-strategic tables never need the fallback in any phase (2, 3 and 4 players)", () => {
    const rejected: string[] = [];
    const phases = new Set<string>();
    for (const playerCount of PLAYER_COUNTS) {
      for (let game = 0; game < 12; game += 1) {
        const seed = 27_000 + playerCount * 100 + game;
        const result = playEngineTable({
          seed,
          playerCount,
          chooserFor: (playerId) => (view) => chooseStrategicCommand(view, { playerId, displayName: playerId, aiSeed: seed, aiPolicyVersion: null }),
          observe: (state) => phases.add(phaseKey(state)),
        });
        expect(result.state.phase.type).toBe("finished");
        rejected.push(...result.fallbacks.map((fallback) => `${playerCount}p ${seed} ${fallback.playerId} ${fallback.phase}: ${fallback.reason}`));
      }
    }
    expect(rejected).toEqual([]);
    for (const phase of [
      "setup_kiln_selection",
      "work_turn/before_action",
      "work_turn/commission_market",
      "work_turn/guild_inspection",
      "work_turn/colour_samples",
      "work_turn/colour_samples_swap",
      "firing_contributions",
      "firing_heat_markers",
      "firing_after_quality",
      "firing_second_firing_choice",
      "orders",
    ]) {
      expect(phases, phase).toContain(phase);
    }
  }, 300_000);

  it("on states reached by random play, every strategic proposal and every fallback candidate is legal", () => {
    // Random seats reach states the strategic seats would not (any Tech, any load, Kiln
    // Master turns); at every decision the strategic policy is asked for the acting seat and
    // its proposal is checked both against the view (`validateAction`) and the authoritative
    // state, and so is every fallback candidate (the canonical policy's whole choice set).
    const rejected: string[] = [];
    const phases = new Set<string>();
    let proposals = 0;
    for (const playerCount of PLAYER_COUNTS) {
      for (let game = 0; game < 10; game += 1) {
        const seed = 28_000 + playerCount * 100 + game;
        playEngineTable({
          seed,
          playerCount,
          chooserFor: (_playerId, seatIndex) => randomChooser(seed * 31 + seatIndex),
          observe: (state, actor, view, privateFiring) => {
            const where = `${playerCount}p ${seed} ${actor} ${phaseKey(state)}`;
            phases.add(phaseKey(state));
            const proposal = chooseStrategicCommand(view, { playerId: actor, displayName: actor, aiSeed: seed, aiPolicyVersion: null });
            if (proposal === null) {
              rejected.push(`${where}: strategic null`);
            } else {
              proposals += 1;
              const onView = viewRejection(view, proposal);
              const onState = rejection(state, privateFiring, actor, proposal);
              if (onView !== null || onState !== null) rejected.push(`${where}: strategic ${JSON.stringify(proposal)} ${onView} ${onState}`);
            }
            for (const candidate of fallbackComputerCommands(view)) {
              const code = rejection(state, privateFiring, actor, candidate);
              if (code !== null) rejected.push(`${where}: fallback ${JSON.stringify(candidate)} ${code}`);
            }
          },
        });
      }
    }
    expect(rejected).toEqual([]);
    expect(proposals).toBeGreaterThan(1_000);
    for (const phase of [
      "setup_kiln_selection",
      "work_turn/before_action",
      "work_turn/after_action",
      "work_turn/commission_market",
      // V1.6.2 decisions: the Guild Hall Shifu's takes (L207), Colour Samples when acquired and
      // its swap (L617, change 24), and Second Firing's choice of 1 of 2 cards (L631).
      "work_turn/guild_inspection",
      "work_turn/colour_samples",
      "work_turn/colour_samples_swap",
      "firing_contributions",
      "firing_test_pieces",
      "firing_heat_markers",
      "firing_heat_adjustment",
      "firing_after_quality",
      "firing_second_firing_choice",
      "firing_salvage",
      "orders",
      "cleanup_hand_limit",
    ]) {
      expect(phases, phase).toContain(phase);
    }
  }, 300_000);
});
