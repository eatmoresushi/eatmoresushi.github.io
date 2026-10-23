/**
 * All-computer tables through the authoritative service and the in-memory backend (DESIGN
 * §9.2 P9). The host seat must be a human account to open the room, so the test drives it
 * with the same strategic policy through `executeCommand`; every other seat is a computer
 * seat played by the service's default policy via `advanceComputerTurns`. Every game must
 * reach `finished` with no policy proposal rejected and nothing private in a public row.
 */

import { describe, expect, it } from "vitest";
import { decisionPrompt } from "../../../src/game/index.ts";
import type { ActorView, GameState } from "../../../src/game/index.ts";
import {
  COMPUTER_POLICIES,
  STRATEGIC_COMPUTER_POLICY,
  STRATEGIC_COMPUTER_POLICY_LABEL,
  STRATEGIC_COMPUTER_POLICY_VERSION,
  computerPolicyLabel,
  createStrategicComputerPolicy,
} from "../../../src/multiplayer/index.ts";
import type { ComputerPolicy, ComputerSeatContext } from "../../../src/multiplayer/index.ts";

/**
 * The service's strategic policy with a budget no loaded test machine can trip: the
 * production budget (`DEFAULT_DECISION_BUDGET_MS`) is wall-clock, so on a busy CI worker a
 * timeout fallback would be logged and make these assertions flaky. Its decisions are the
 * default policy's; `computer_fallback` covers the production budget itself.
 */
const STRATEGIC = createStrategicComputerPolicy({ decisionBudgetMs: 10_000 });
import { advance, command, connectionFor, headState, lobby, nextCommandId, valueOf, type Harness } from "./support.ts";

async function hostView(harness: Harness): Promise<ActorView> {
  const reconnect = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P1").seatToken }));
  if (reconnect.game === null || reconnect.ownPrivateView === null) throw new Error("No game view for the host");
  return { viewerId: "P1", game: reconnect.game, own: reconnect.ownPrivateView };
}

interface Recorded {
  calls: number;
  phases: Set<string>;
  hiddenSeen: boolean;
}

/** The service's default policy, recording what each call saw. */
function recordingStrategic(recorded: Recorded): ComputerPolicy {
  return {
    version: STRATEGIC_COMPUTER_POLICY.version,
    label: STRATEGIC_COMPUTER_POLICY.label,
    chooseCommand(view, seat) {
      recorded.calls += 1;
      recorded.phases.add(view.game.phase.type);
      if (Object.hasOwn(view.game, "hidden")) recorded.hiddenSeen = true;
      return STRATEGIC.chooseCommand(view, seat);
    },
  };
}

async function playAllComputerTable(players: 2 | 3 | 4, seedBase: number): Promise<{ harness: Harness; state: GameState; recorded: Recorded }> {
  const recorded: Recorded = { calls: 0, phases: new Set(), hiddenSeen: false };
  const harness = await lobby({ humans: 1, computers: players - 1, seedBase, service: { computerPolicy: recordingStrategic(recorded) } });
  harness.revision = valueOf(
    await harness.service.startGame({ roomCode: harness.roomCode, seatToken: harness.host.seatToken, commandId: nextCommandId(harness, "9200") }),
  ).revision;
  const hostSeat: ComputerSeatContext = { playerId: "P1", displayName: "Host", aiSeed: seedBase, aiPolicyVersion: STRATEGIC_COMPUTER_POLICY_VERSION };
  for (let step = 0; step < 4_000; step += 1) {
    const state = await headState(harness);
    if (state.phase.type === "finished") return { harness, state, recorded };
    if (!decisionPrompt(state).actorIds.includes("P1")) {
      const advanced = valueOf(await advance(harness, state.revision));
      expect(advanced.game).not.toHaveProperty("hidden");
      for (const event of advanced.events) expect(event).not.toHaveProperty("secret");
      continue;
    }
    const choice = await STRATEGIC.chooseCommand(await hostView(harness), hostSeat);
    if (choice === null) throw new Error(`The strategic policy had no command for the host in ${state.phase.type}`);
    await command(harness, "P1", choice, state.revision);
  }
  throw new Error(`The ${players}-player table did not finish`);
}

describe("all-computer tables through the service", () => {
  it.each([
    [2, 8_201],
    [3, 8_301],
    [4, 8_401],
  ] as const)("a %i-player all-strategic table reaches finished (seed %i)", async (players, seedBase) => {
    const { harness, state, recorded } = await playAllComputerTable(players, seedBase);
    expect(state.phase.type).toBe("finished");
    const result = state.finalResult;
    expect(result?.standings).toHaveLength(players);
    // The strategic policy never needed the fallback: no proposal was missing, threw or failed
    // validation (the service logs every such case).
    expect(harness.logger.entries).toEqual([]);
    expect(recorded.calls).toBeGreaterThan(0);
    expect(recorded.hiddenSeen).toBe(false);
    for (const phase of ["setup_kiln_selection", "work_turn", "firing_contributions", "orders"]) {
      expect(recorded.phases).toContain(phase);
    }
    // Sensible play: every seat produces, and the table completes Orders.
    const completed = state.playerOrder.reduce((sum, playerId) => sum + (state.players[playerId]?.completedOrders.length ?? 0), 0);
    expect(completed).toBeGreaterThanOrEqual(players);
    for (const playerId of state.playerOrder) {
      expect(result?.scores[playerId]?.total ?? 0).toBeGreaterThan(10);
    }
    // Computer seats are stamped with the strategic policy.
    const seats = await harness.store.getSeats(harness.roomId);
    const computers = seats.filter((seat) => seat.isComputer);
    expect(computers).toHaveLength(players - 1);
    for (const seat of computers) expect(seat.aiPolicyVersion).toBe(STRATEGIC_COMPUTER_POLICY_VERSION);
    // No public row ever carried hidden state or a secret payload.
    const audit = harness.store.audit();
    for (const publicState of audit.publicStates) expect(publicState).not.toHaveProperty("hidden");
    for (const row of audit.publicEvents) expect(row.event).not.toHaveProperty("secret");
  }, 120_000);

  it("is the service's default policy and labels itself for players", async () => {
    const harness = await lobby({ humans: 1, computers: 1, seedBase: 8_501 });
    const seats = await harness.store.getSeats(harness.roomId);
    expect(seats.find((seat) => seat.isComputer)?.aiPolicyVersion).toBe(STRATEGIC_COMPUTER_POLICY_VERSION);
    expect(computerPolicyLabel(STRATEGIC_COMPUTER_POLICY_VERSION, COMPUTER_POLICIES)).toBe(STRATEGIC_COMPUTER_POLICY_LABEL);
    expect(STRATEGIC_COMPUTER_POLICY_VERSION).toMatch(/^rules-v1\.6\.2-[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});
