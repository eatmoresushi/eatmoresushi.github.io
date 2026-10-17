/**
 * The online computer player through the service (DESIGN §4.5, §4.6): a policy sees only
 * its seat's `ActorView`, is asked only when `decisionPrompt` names it, and with the
 * default policy computer seats play complete legal games against a human. Successor of
 * the V1.4 `online_computer_player` suite's service-level intent; the strategic V1.6.2
 * policy (P9) plugs into the same `ComputerPolicy` interface.
 */

import { describe, expect, it } from "vitest";
import { decisionPrompt } from "../../../src/game/index.ts";
import type { ActorView, AuthoritativeCommand } from "../../../src/game/index.ts";
import {
  CANONICAL_COMPUTER_POLICY,
  CANONICAL_COMPUTER_POLICY_VERSION,
  computerPolicyLabel,
} from "../../../src/multiplayer/index.ts";
import type { ComputerPolicy, ComputerSeatContext } from "../../../src/multiplayer/index.ts";
import {
  advance,
  allHandOrderIds,
  command,
  connectionFor,
  headState,
  lobby,
  nextCommandId,
  valueOf,
  type Harness,
} from "./support.ts";

interface PolicyCall {
  view: ActorView;
  seat: ComputerSeatContext;
  actorIds: string[];
}

function spyingPolicy(calls: PolicyCall[]): ComputerPolicy {
  return {
    version: CANONICAL_COMPUTER_POLICY_VERSION,
    label: CANONICAL_COMPUTER_POLICY.label,
    async chooseCommand(view, seat): Promise<AuthoritativeCommand | null> {
      calls.push({ view: structuredClone(view), seat, actorIds: [...decisionPrompt(view.game).actorIds] });
      return CANONICAL_COMPUTER_POLICY.chooseCommand(view, seat);
    },
  };
}

async function humanView(harness: Harness): Promise<ActorView> {
  const reconnect = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P1").seatToken }));
  if (reconnect.game === null || reconnect.ownPrivateView === null) throw new Error("No game view");
  return { viewerId: "P1", game: reconnect.game, own: reconnect.ownPrivateView };
}

/** One human host (seeded canonical choices) and `computers` computer seats, to the end. */
async function playGame(computers: number, seedBase: number, calls: PolicyCall[]): Promise<Harness> {
  const harness = await lobby({ humans: 1, computers, seedBase, service: { computerPolicy: spyingPolicy(calls) } });
  harness.revision = valueOf(
    await harness.service.startGame({ roomCode: harness.roomCode, seatToken: harness.host.seatToken, commandId: nextCommandId(harness, "9200") }),
  ).revision;
  for (let step = 0; step < 2_500; step += 1) {
    const state = await headState(harness);
    if (state.phase.type === "finished") return harness;
    if (!decisionPrompt(state).actorIds.includes("P1")) {
      const advanced = valueOf(await advance(harness, state.revision));
      // The requesting human receives public payloads plus its own private data only.
      expect(advanced.game).not.toHaveProperty("hidden");
      for (const event of advanced.events) expect(event).not.toHaveProperty("secret");
      expect(advanced.ownPrivateView?.playerId).toBe("P1");
      for (const record of advanced.ownSecrets) expect(record.event).toHaveProperty("secret.visibleTo", "P1");
      continue;
    }
    const choice = await CANONICAL_COMPUTER_POLICY.chooseCommand(await humanView(harness), {
      playerId: "P1",
      displayName: "Host",
      aiSeed: seedBase,
      aiPolicyVersion: null,
    });
    if (choice === null) throw new Error(`No legal command for the human in ${state.phase.type}`);
    await command(harness, "P1", choice, state.revision);
  }
  throw new Error("The game did not finish");
}

describe("online computer player", () => {
  it.each([
    [1, 7_001],
    [2, 7_002],
    [3, 7_003],
  ])("plays complete legal games with %i computer seat(s) through the service (seed %i)", async (computers, seedBase) => {
    const calls: PolicyCall[] = [];
    const harness = await playGame(computers, seedBase, calls);
    const state = await headState(harness);
    expect(state.phase.type).toBe("finished");
    expect(state.finalResult?.standings).toHaveLength(computers + 1);
    // Every proposal of the default policy was legal: nothing fell back.
    expect(harness.logger.entries).toEqual([]);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.view).not.toHaveProperty("game.hidden");
      expect(call.actorIds).toContain(call.view.viewerId);
      expect(call.view.own.playerId).toBe(call.view.viewerId);
      expect(call.seat.playerId).toBe(call.view.viewerId);
    }
    // No public row ever carried a hand or a secret.
    const audit = harness.store.audit();
    for (const publicState of audit.publicStates) expect(publicState).not.toHaveProperty("hidden");
    for (const row of audit.publicEvents) expect(row.event).not.toHaveProperty("secret");
    expect(allHandOrderIds(state).every((orderId) => !JSON.stringify(audit.publicStates.at(-1)).includes(`"${orderId}"`))).toBe(true);
  }, 120_000);

  it("labels policies for players", () => {
    expect(computerPolicyLabel(CANONICAL_COMPUTER_POLICY_VERSION)).toBe("V1.6.2 Canonical");
    expect(computerPolicyLabel(null)).toBe("Computer");
    expect(computerPolicyLabel("rules-v1.4-strategic-001")).toBe("Computer (rules-v1.4-strategic-001)");
  });
});
