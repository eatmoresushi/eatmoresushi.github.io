/**
 * Authoritative computer turns (DESIGN §3.4, §4.6): routed by `decisionPrompt` alone in
 * every decision mode, committed at most once under concurrency, capped per request, and
 * recoverable after a failure. Successor of the V1.4 `multiplayer_computer_turns` suite.
 */

import { describe, expect, it } from "vitest";
import { decisionPrompt } from "../../../src/game/index.ts";
import {
  AuthoritativeGameService,
  COMPUTER_POLICY_VERSION_PATTERN,
  nextOnlineDecisionActor,
} from "../../../src/multiplayer/index.ts";
import type { ComputerPolicy } from "../../../src/multiplayer/index.ts";
import {
  RecordingLogger,
  advance,
  headState,
  lobby,
  nextCommandId,
  openedFiringState,
  scriptedPolicy,
  seatState,
  seedState,
  valueOf,
  type Harness,
  type HarnessOptions,
} from "./support.ts";

async function startedWith(options: HarnessOptions): Promise<Harness> {
  const harness = await lobby(options);
  harness.revision = valueOf(
    await harness.service.startGame({ roomCode: harness.roomCode, seatToken: harness.host.seatToken, commandId: nextCommandId(harness, "9200") }),
  ).revision;
  return harness;
}

const SCRIPTED = { computerPolicy: scriptedPolicy(), fallbackCommands: () => [] };

/** Kiln selection with every computer ahead of the human host. */
async function kilnSelectionComputersFirst(harness: Harness, playerCount: number): Promise<void> {
  await seedState(harness, (gameId) => {
    const order = Array.from({ length: playerCount }, (_, seat) => `P${seat + 1}`);
    return seatState(playerCount, {
      gameId,
      phase: { type: "setup_kiln_selection", selectionOrder: [...order.slice(1), "P1"], index: 0 },
    });
  });
}

describe("V1.6.1 authoritative computer turns", () => {
  it("advances consecutive computer decisions and stops cleanly at the human", async () => {
    const harness = await startedWith({ humans: 1, computers: 2, service: SCRIPTED });
    await kilnSelectionComputersFirst(harness, 3);
    const before = harness.revision;
    const result = valueOf(await advance(harness));
    expect(result.advancedActions).toBe(2);
    expect(result.actorIds).toEqual(["P2", "P3"]);
    expect(result.stoppedReason).toBe("human_turn");
    expect(result.revision).toBe(before + 2);
    expect(decisionPrompt(result.game).actorIds).toEqual(["P1"]);
    expect(result.game.players["P2"]?.kilnId).not.toBeNull();
    expect(result.game.players["P3"]?.kilnId).not.toBeNull();
    expect(result.events.filter((event) => event.type === "KILN_SELECTED")).toHaveLength(2);
  });

  it("routes a simultaneous secret window to every pending computer and keeps their cards sealed", async () => {
    const harness = await startedWith({
      humans: 1,
      computers: 2,
      service: {
        computerPolicy: scriptedPolicy({
          firing_contributions: (view) =>
            view.game.phase.type === "firing_contributions"
              ? { type: "SUBMIT_CONTRIBUTION", windowId: view.game.phase.windowId, card: "STOKE", fuelLedger: false }
              : null,
        }),
        fallbackCommands: () => [],
      },
    });
    const seeded = await seedState(harness, (gameId) =>
      openedFiringState({
        gameId,
        players: [{ id: "P1" }, { id: "P2" }, { id: "P3" }],
        ceramics: [
          { owner: "P1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
          { owner: "P2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_2" },
          { owner: "P3", stage: "loaded", shape: "bowl", glaze: "celadon", at: "high_1" },
        ],
      }),
    );
    if (seeded.phase.type !== "firing_contributions") throw new Error("Expected the Contribution window");
    expect(decisionPrompt(seeded).mode).toBe("simultaneous_secret");
    const result = valueOf(await advance(harness));
    expect(result.actorIds).toEqual(["P2", "P3"]);
    expect(result.stoppedReason).toBe("human_turn");
    expect(result.events).toEqual([
      { type: "CONTRIBUTION_SUBMITTED", playerId: "P2", windowId: seeded.phase.windowId },
      { type: "CONTRIBUTION_SUBMITTED", playerId: "P3", windowId: seeded.phase.windowId },
    ]);
    expect(result.ownPrivateView?.pendingContribution).toBeNull();
    expect(JSON.stringify(result)).not.toContain("STOKE");
    expect(harness.store.audit().privateSubmissions.map((row) => [row.playerId, row.card])).toEqual([
      ["P2", "STOKE"],
      ["P3", "STOKE"],
    ]);
  });

  it("commits a concurrent computer decision at most once and rejects an explicitly stale retry", async () => {
    const harness = await startedWith({ humans: 1, computers: 1, service: SCRIPTED });
    await kilnSelectionComputersFirst(harness, 2);
    const before = harness.revision;
    const results = await Promise.all([advance(harness, before), advance(harness, before)]);
    const advanced = results.reduce((sum, result) => sum + (result.ok ? result.value.advancedActions : 0), 0);
    expect(advanced).toBe(1);
    for (const result of results) {
      if (!result.ok) expect(result.error.code).toBe("STALE_REVISION");
    }
    expect((await headState(harness)).revision).toBe(before + 1);
    expect(harness.store.audit().commands.filter((record) => record.actorId === "P2")).toHaveLength(1);
    const stale = await advance(harness, before);
    expect(stale.ok ? null : stale.error).toMatchObject({ code: "STALE_REVISION", currentRevision: before + 1 });
  });

  it("stops at the per-request cap and continues on the next request", async () => {
    const harness = await startedWith({ humans: 1, computers: 3, service: { ...SCRIPTED, maxComputerActionsPerRequest: 2 } });
    await kilnSelectionComputersFirst(harness, 4);
    const first = valueOf(await advance(harness));
    expect(first.advancedActions).toBe(2);
    expect(first.stoppedReason).toBe("action_limit");
    const second = valueOf(await advance(harness, first.revision));
    expect(second.actorIds).toEqual(["P4"]);
    expect(second.stoppedReason).toBe("human_turn");
  });

  it("leaves the state untouched when no candidate is legal, and recovers with a working policy", async () => {
    const broken: ComputerPolicy = { version: "rules-v1.6.1-broken-001", label: "Broken", chooseCommand: () => null };
    const harness = await startedWith({ humans: 1, computers: 1, service: { computerPolicy: broken, fallbackCommands: () => [] } });
    await kilnSelectionComputersFirst(harness, 2);
    const before = await harness.store.loadHead(harness.roomId);
    const failed = await advance(harness);
    expect(failed.ok ? null : failed.error).toMatchObject({ code: "COMPUTER_TURN_FAILED", currentRevision: before?.revision });
    expect(await harness.store.loadHead(harness.roomId)).toEqual(before);

    const repaired = new AuthoritativeGameService(harness.store, harness.security, {
      computerPolicy: scriptedPolicy(),
      fallbackCommands: () => [],
      logger: new RecordingLogger(),
    });
    const recovered = valueOf(
      await repaired.advanceComputerTurns({ roomCode: harness.roomCode, seatToken: harness.host.seatToken, expectedRevision: before!.revision }),
    );
    expect(recovered.actorIds).toEqual(["P2"]);
    expect(recovered.revision).toBe(before!.revision + 1);
  });

  it("stamps new computer seats with the service's policy label", async () => {
    const harness = await lobby({ humans: 1, computers: 1, service: SCRIPTED });
    const seats = await harness.store.getSeats(harness.roomId);
    const computer = seats.find((seat) => seat.isComputer);
    expect(computer?.aiPolicyVersion).toBe("rules-v1.6.1-scripted-001");
    expect(computer?.aiPolicyVersion).toMatch(COMPUTER_POLICY_VERSION_PATTERN);
    expect(computer?.aiSeed).not.toBeNull();
  });

  it("names the first computer among the prompt's actors, whatever the mode", async () => {
    const harness = await startedWith({ humans: 1, computers: 2, service: SCRIPTED });
    const seats = await harness.store.getSeats(harness.roomId);
    const state = await seedState(harness, (gameId, revision) =>
      seatState(3, { gameId, phase: { type: "cleanup_hand_limit", pendingPlayerIds: ["P1", "P3", "P2"], openedAtRevision: revision }, players: [{ id: "P1", hand: ["O01", "O02", "O03", "O04", "O05"] }, { id: "P2", hand: ["O06", "O07", "O08", "O09", "O10"] }, { id: "P3", hand: ["O11", "O12", "O13", "O14", "O15"] }] }),
    );
    expect(decisionPrompt(state).mode).toBe("parallel");
    expect(nextOnlineDecisionActor(state, seats)).toBe("P3");
  });
});
