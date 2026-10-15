/**
 * Storage independence (DESIGN §2.3, §7, §9.2 P8): Postgres `jsonb` reorders object keys, so
 * a full seeded game played through the in-memory store with the jsonb key order applied on
 * every write and read must end in exactly the same state as without it — same final hash,
 * RNG state, revision and event log.
 */

import { describe, expect, it } from "vitest";
import { decisionPrompt } from "../../../src/game/index.ts";
import type { ActorView } from "../../../src/game/index.ts";
import { CANONICAL_COMPUTER_POLICY } from "../../../src/multiplayer/index.ts";
import {
  advance,
  canonicalJson,
  command,
  connectionFor,
  headState,
  lobby,
  nextCommandId,
  valueOf,
  type Harness,
} from "./support.ts";

const MAX_STEPS = 2_500;

/** The human host plays the same seeded canonical choice the default computer policy makes,
 * from the view a reconnecting client receives. */
async function humanView(harness: Harness): Promise<ActorView> {
  const reconnect = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P1").seatToken }));
  if (reconnect.game === null || reconnect.ownPrivateView === null) throw new Error("No game view");
  return { viewerId: "P1", game: reconnect.game, own: reconnect.ownPrivateView };
}

async function playSeededGame(jsonbKeyOrder: boolean): Promise<{ harness: Harness; steps: number }> {
  const harness = await lobby({ humans: 1, computers: 1, store: { jsonbKeyOrder }, seedBase: 4_242 });
  harness.revision = valueOf(
    await harness.service.startGame({ roomCode: harness.roomCode, seatToken: harness.host.seatToken, commandId: nextCommandId(harness, "9200") }),
  ).revision;
  let steps = 0;
  for (; steps < MAX_STEPS; steps += 1) {
    const state = await headState(harness);
    if (state.phase.type === "finished") break;
    if (!decisionPrompt(state).actorIds.includes("P1")) {
      valueOf(await advance(harness, state.revision));
      continue;
    }
    const view = await humanView(harness);
    const choice = await CANONICAL_COMPUTER_POLICY.chooseCommand(view, {
      playerId: "P1",
      displayName: "Host",
      aiSeed: 99,
      aiPolicyVersion: null,
    });
    if (choice === null) throw new Error(`No legal command for the human in ${state.phase.type}`);
    await command(harness, "P1", choice, state.revision);
  }
  return { harness, steps };
}

describe("storage round trip", () => {
  it("plays a full seeded game to the same final hash with and without jsonb key order", async () => {
    const plain = await playSeededGame(false);
    const reordered = await playSeededGame(true);
    const plainHead = await plain.harness.store.loadHead(plain.harness.roomId);
    const reorderedHead = await reordered.harness.store.loadHead(reordered.harness.roomId);
    expect(plainHead?.state.phase.type).toBe("finished");
    expect(reordered.steps).toBe(plain.steps);
    expect(reorderedHead?.stateHash).toBe(plainHead?.stateHash);
    expect(reorderedHead?.rngState).toBe(plainHead?.rngState);
    expect(reorderedHead?.revision).toBe(plainHead?.revision);
    expect(canonicalJson(reorderedHead?.state)).toBe(canonicalJson(plainHead?.state));
    const plainEvents = await plain.harness.store.listPublicEvents(plain.harness.roomId);
    const reorderedEvents = await reordered.harness.store.listPublicEvents(reordered.harness.roomId);
    expect(canonicalJson(reorderedEvents)).toBe(canonicalJson(plainEvents));
    expect(plainEvents).toHaveLength(plainHead!.state.eventSequence);
    // The jsonb run really did reorder keys: `players` comes before `phase`, by length.
    const reorderedKeys = Object.keys(reorderedHead!.state);
    expect(reorderedKeys.indexOf("phase")).toBeLessThan(reorderedKeys.indexOf("players"));
    expect(reorderedKeys).not.toEqual(Object.keys(plainHead!.state));
  }, 120_000);
});
