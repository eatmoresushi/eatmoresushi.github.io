/**
 * Reconnect without changing seat or state (AGENTS.md, DESIGN §4.6): a seat recovers its
 * public projection, its own private view — including its sealed Contribution and Fuel
 * Ledger commitment — and its own secrets, and nothing is written.
 */

import { describe, expect, it } from "vitest";
import { decisionPrompt } from "../../../src/game/index.ts";
import { command, connectionFor, lobby, openedFiringState, seatState, seedState, started, tryCommand, valueOf } from "./support.ts";

describe("V1.6.1 reconnect", () => {
  it("returns the seat's own sealed {card, fuelLedger} during an open window; seat and state unchanged", async () => {
    const { harness } = await started();
    const seeded = await seedState(harness, (gameId) =>
      openedFiringState({
        gameId,
        players: [
          { id: "P1", techs: ["T12"], resources: { wood: 4 } },
          { id: "P2", resources: { wood: 2 } },
        ],
        ceramics: [
          { owner: "P1", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1" },
          { owner: "P2", stage: "loaded", shape: "bowl", glaze: "white", at: "high_2" },
        ],
      }),
    );
    if (seeded.phase.type !== "firing_contributions") throw new Error("Expected the Contribution window");
    const windowId = seeded.phase.windowId;
    await command(harness, "P1", { type: "SUBMIT_CONTRIBUTION", windowId, card: "STOKE", fuelLedger: true });

    const headBefore = await harness.store.loadHead(harness.roomId);
    const auditBefore = harness.store.audit();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const own = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P1").seatToken }));
      expect(own.seat).toEqual(connectionFor(harness, "P1").seat);
      expect(own.ownPrivateView?.pendingContribution).toEqual({ card: "STOKE", fuelLedger: true, windowId });
      expect(own.game?.revision).toBe(headBefore?.revision);
      const other = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P2").seatToken }));
      expect(other.seat).toEqual(connectionFor(harness, "P2").seat);
      expect(other.ownPrivateView?.pendingContribution).toBeNull();
      expect(JSON.stringify(other)).not.toContain("STOKE");
      expect(JSON.stringify(other.game)).toEqual(JSON.stringify(own.game));
    }
    expect(await harness.store.loadHead(harness.roomId)).toEqual(headBefore);
    expect(harness.store.audit()).toEqual(auditBefore);

    // The seat continues where it left off.
    const last = await tryCommand(harness, "P2", { type: "SUBMIT_CONTRIBUTION", windowId, card: "TEND", fuelLedger: false });
    expect(last.ok).toBe(true);
  });

  it("restores the lobby without a game, and refuses an unknown credential", async () => {
    const harness = await lobby();
    const reconnect = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: harness.host.seatToken }));
    expect(reconnect).toMatchObject({ game: null, ownPrivateView: null, ownSecrets: [], seat: harness.host.seat });
    const denied = await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: "x".repeat(40) });
    expect(denied.ok ? null : denied.error.code).toBe("AUTHENTICATION_FAILED");
  });

  it("restores a pending Commission top-3 look only to its owner", async () => {
    const { harness } = await started();
    let topThree: string[] = [];
    await seedState(harness, (gameId) => {
      const state = seatState(2, { gameId });
      topThree = state.hidden.mainDeck.slice(0, 3);
      return state;
    });
    await command(harness, "P1", { type: "PLACE_COMMISSION_MARKET", workerId: "P1:shifu", first: { kind: "look_top_three" } });
    const own = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P1").seatToken }));
    expect(own.ownPrivateView?.pendingLook).toEqual({ kind: "commission_top_three", playerId: "P1", orderIds: topThree });
    expect(own.ownSecrets.map((record) => record.event.type)).toContain("PRIVATE_LOOK_OPENED");
    const other = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P2").seatToken }));
    expect(other.ownPrivateView?.pendingLook).toBeNull();
    expect(other.game?.counts.pendingLook).toEqual({ playerId: "P1", kind: "commission_top_three", count: 3 });
    for (const orderId of topThree) {
      expect(JSON.stringify(other)).not.toContain(`"${orderId}"`);
      expect(JSON.stringify(own.game)).not.toContain(`"${orderId}"`);
    }
  });

  it("replays an accepted command by its ID without committing it again", async () => {
    const { harness, start } = await started();
    const actor = decisionPrompt(start.game).actorIds[0]!;
    const other = actor === "P1" ? "P2" : "P1";
    const commandId = "00000000-0000-4000-9700-000000000001";
    const first = valueOf(await tryCommand(harness, actor, { type: "SELECT_KILN", kilnId: "DI" }, start.revision, commandId));
    const commandsAfterFirst = harness.store.audit().commands.length;
    const replay = valueOf(await tryCommand(harness, actor, { type: "SELECT_KILN", kilnId: "DI" }, start.revision, commandId));
    expect(replay).toEqual(first);
    expect(harness.store.audit().commands).toHaveLength(commandsAfterFirst);
    const stolen = await tryCommand(harness, other, { type: "SELECT_KILN", kilnId: "RU" }, first.revision, commandId);
    expect(stolen.ok ? null : stolen.error.code).toBe("DUPLICATE_COMMAND");
    expect((await harness.store.loadHead(harness.roomId))?.revision).toBe(first.revision);
  });
});
