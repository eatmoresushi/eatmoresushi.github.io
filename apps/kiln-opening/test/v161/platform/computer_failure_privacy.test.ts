/**
 * Computer policy failures leak nothing (DESIGN §4.5, §4.6). A policy sees its own hand,
 * looks and peek, so an exception message may name them; the service logs the cause
 * server-side and answers with a fixed message, or falls back to a legal command.
 */

import { describe, expect, it } from "vitest";
import type { ActorView, AuthoritativeCommand, OrderId } from "../../../src/game/index.ts";
import type { ComputerPolicy } from "../../../src/multiplayer/index.ts";
import { advance, exitCommand, headState, lobby, nextCommandId, seatState, seedState, valueOf, type Harness } from "./support.ts";

const HUMAN_HAND: OrderId[] = ["O01", "O02"];
const COMPUTER_HAND: OrderId[] = ["O03", "O04", "S05"];

function leakingPolicy(): ComputerPolicy {
  return {
    version: "rules-v1.6.2-leaky-001",
    label: "Leaky",
    chooseCommand(view: ActorView): AuthoritativeCommand | null {
      throw new Error(`cannot decide with hand ${view.own.orderHand.join(",")}`);
    },
  };
}

/** A human (P1) and a computer (P2); the computer is the active Work player. */
async function computerToAct(policy: ComputerPolicy, fallbackCommands: (view: ActorView) => readonly unknown[]): Promise<Harness> {
  const harness = await lobby({ humans: 1, computers: 1, service: { computerPolicy: policy, fallbackCommands: (view) => fallbackCommands(view as ActorView) } });
  harness.revision = valueOf(
    await harness.service.startGame({ roomCode: harness.roomCode, seatToken: harness.host.seatToken, commandId: nextCommandId(harness, "9200") }),
  ).revision;
  await seedState(harness, (gameId) =>
    seatState(2, {
      gameId,
      players: [
        { id: "P1", hand: HUMAN_HAND },
        { id: "P2", hand: COMPUTER_HAND },
      ],
      firstPlayerId: "P2",
    }),
  );
  return harness;
}

function expectNoComputerSecrets(payload: unknown): void {
  const json = JSON.stringify(payload);
  for (const orderId of COMPUTER_HAND) expect(json).not.toContain(`"${orderId}"`);
  expect(json).not.toContain("cannot decide");
  expect(json).not.toContain("fallback broke");
  expect(json).not.toContain(COMPUTER_HAND.join(","));
}

describe("computer failure privacy", () => {
  it("answers a throwing policy and a throwing fallback with a fixed message and logs the cause server-side", async () => {
    const harness = await computerToAct(leakingPolicy(), (view) => {
      throw new Error(`fallback broke on ${view.own.orderHand.join(",")}`);
    });
    const before = await harness.store.loadHead(harness.roomId);
    const result = await advance(harness);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: "COMPUTER_TURN_FAILED",
      message: "Computer 1 could not choose an action.",
      details: {},
      currentRevision: before?.revision,
    });
    expectNoComputerSecrets(result);
    expect(await harness.store.loadHead(harness.roomId)).toEqual(before);
    expect(harness.store.audit().commands.some((record) => record.actorId === "P2")).toBe(false);
    const causes = harness.logger.entries.map((entry) => String(entry.context["cause"] ?? ""));
    expect(causes.some((cause) => cause.includes(COMPUTER_HAND.join(",")))).toBe(true);
  });

  it("falls back to a legal command when only the policy fails, still without leaking", async () => {
    const harness = await computerToAct(leakingPolicy(), (view) => {
      const exit = exitCommand(view);
      return exit === null ? [] : [exit];
    });
    const result = valueOf(await advance(harness));
    expect(result.actorIds).toEqual(["P2"]);
    expect(result.stoppedReason).toBe("human_turn");
    expectNoComputerSecrets(result);
    expect(result.ownPrivateView?.playerId).toBe("P1");
    expect(result.ownPrivateView?.orderHand).toEqual(HUMAN_HAND);
    expect(harness.logger.entries.some((entry) => entry.message === "computer policy failed")).toBe(true);
  });

  it("falls back from a malformed or illegal proposal", async () => {
    for (const proposal of [{ type: "NOT_A_COMMAND" }, { type: "PLACE_MAGISTRATES_HALL", workerId: "P1:shifu" }]) {
      const policy: ComputerPolicy = {
        version: "rules-v1.6.2-wrong-001",
        label: "Wrong",
        chooseCommand: () => proposal as unknown as AuthoritativeCommand,
      };
      const harness = await computerToAct(policy, (view) => {
        const exit = exitCommand(view);
        return exit === null ? [] : [exit];
      });
      const result = valueOf(await advance(harness));
      expect(result.actorIds).toEqual(["P2"]);
      expect(harness.logger.entries.some((entry) => entry.message === "computer policy proposal rejected")).toBe(true);
    }
  });

  it("stores no private view or secret in a computer command's processed record", async () => {
    const harness = await computerToAct(leakingPolicy(), (view) => {
      const exit = exitCommand(view);
      return exit === null ? [] : [exit];
    });
    valueOf(await advance(harness));
    const computerRecords = harness.store.audit().processed.filter((record) => record.actorId === "P2");
    expect(computerRecords.length).toBeGreaterThan(0);
    for (const record of computerRecords) {
      expect(record.response.ownPrivateView).toBeNull();
      expect(record.response.ownSecrets).toEqual([]);
      expectNoComputerSecrets(record.response);
    }
    expect((await headState(harness)).hidden.orderHands["P2"]).toEqual(COMPUTER_HAND);
  });
});
