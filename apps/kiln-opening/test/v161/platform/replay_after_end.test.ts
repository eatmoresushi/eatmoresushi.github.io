/**
 * Idempotency after the session ends (ONLINE_GAME_SPEC: "Replaying an accepted ID returns
 * the stored response to the same seat and commits nothing"). The command that finishes
 * the game — and any accepted command of an abandoned room — must replay to its stored
 * response, while a new command ID is refused with SESSION_ENDED.
 */

import { describe, expect, it } from "vitest";
import { SeededRandom, decisionPrompt, legalCommands } from "../../../src/game/index.ts";
import type { ActorView, PlayerId } from "../../../src/game/index.ts";
import { connectionFor, headState, lobby, nextCommandId, started, tryCommand, valueOf, type Harness } from "./support.ts";

const MAX_STEPS = 3_000;

async function viewFor(harness: Harness, playerId: PlayerId): Promise<ActorView> {
  const reconnect = valueOf(
    await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, playerId).seatToken }),
  );
  if (reconnect.game === null || reconnect.ownPrivateView === null) throw new Error("No game view");
  return { viewerId: playerId, game: reconnect.game, own: reconnect.ownPrivateView };
}

describe("replay after the session ends", () => {
  it("replays the game-ending command to its stored response and commits nothing", async () => {
    const harness = await lobby({ humans: 2, computers: 0, seedBase: 77 });
    harness.revision = valueOf(
      await harness.service.startGame({ roomCode: harness.roomCode, seatToken: harness.host.seatToken, commandId: nextCommandId(harness, "9200") }),
    ).revision;
    const rng = new SeededRandom(5);
    let last: { actor: PlayerId; commandId: string; command: unknown; revision: number; response: unknown } | null = null;
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const state = await headState(harness);
      if (state.phase.type === "finished") break;
      const actor = decisionPrompt(state).actorIds[0]!;
      const commands = legalCommands(await viewFor(harness, actor), { mode: "canonical" });
      const chosen = commands[rng.nextInt(commands.length)]!;
      const commandId = nextCommandId(harness);
      const response = valueOf(await tryCommand(harness, actor, chosen, state.revision, commandId));
      last = { actor, commandId, command: chosen, revision: state.revision, response };
    }
    expect((await headState(harness)).phase.type).toBe("finished");
    if (last === null) throw new Error("No command was played");
    expect((last.response as { room: { status: string } }).room.status).toBe("finished");

    const headBefore = await harness.store.loadHead(harness.roomId);
    const auditBefore = harness.store.audit();

    const replay = await tryCommand(harness, last.actor, last.command, last.revision, last.commandId);
    expect(replay).toEqual({ ok: true, value: last.response });

    const otherSeat: PlayerId = last.actor === "P1" ? "P2" : "P1";
    const stolen = await tryCommand(harness, otherSeat, last.command, last.revision, last.commandId);
    expect(stolen.ok ? null : stolen.error.code).toBe("DUPLICATE_COMMAND");

    const fresh = await tryCommand(harness, last.actor, last.command, last.revision, nextCommandId(harness));
    expect(fresh.ok ? null : fresh.error.code).toBe("SESSION_ENDED");

    expect(await harness.store.loadHead(harness.roomId)).toEqual(headBefore);
    expect(harness.store.audit()).toEqual(auditBefore);
  }, 120_000);

  it("replays an accepted command and the start after the host ends the session", async () => {
    const { harness, start } = await started();
    const state = await headState(harness);
    const actor = decisionPrompt(state).actorIds[0]!;
    const chosen = legalCommands(await viewFor(harness, actor), { mode: "canonical" })[0]!;
    const commandId = nextCommandId(harness);
    const accepted = valueOf(await tryCommand(harness, actor, chosen, state.revision, commandId));

    const ended = valueOf(
      await harness.service.endSession({ roomCode: harness.roomCode, seatToken: harness.host.seatToken, commandId: nextCommandId(harness, "9300") }),
    );
    expect(ended.room.status).toBe("abandoned");
    const headBefore = await harness.store.loadHead(harness.roomId);
    const auditBefore = harness.store.audit();

    expect(await tryCommand(harness, actor, chosen, state.revision, commandId)).toEqual({ ok: true, value: accepted });
    const replayedStart = await harness.service.startGame({
      roomCode: harness.roomCode,
      seatToken: harness.host.seatToken,
      commandId: start.commandId,
    });
    expect(replayedStart).toEqual({ ok: true, value: start });

    const fresh = await tryCommand(harness, actor, chosen, state.revision, nextCommandId(harness));
    expect(fresh.ok ? null : fresh.error.code).toBe("SESSION_ENDED");
    const freshStart = await harness.service.startGame({
      roomCode: harness.roomCode,
      seatToken: harness.host.seatToken,
      commandId: nextCommandId(harness, "9200"),
    });
    expect(freshStart.ok ? null : freshStart.error.code).toBe("SESSION_ENDED");

    expect(await harness.store.loadHead(harness.roomId)).toEqual(headBefore);
    expect(harness.store.audit()).toEqual(auditBefore);
  });
});
