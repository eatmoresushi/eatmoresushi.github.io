/**
 * Reconnect without changing seat or state (AGENTS.md, DESIGN §4.6): a seat recovers its
 * public projection, its own private view — including its sealed Contribution and Fuel
 * Ledger commitment — and its own secrets, and nothing is written.
 */

import { describe, expect, it } from "vitest";
import { decisionPrompt } from "../../../src/game/index.ts";
import type { OrderId } from "../../../src/game/types.ts";
import { LocalTable } from "../engine/support/localTable.ts";
import { command, connectionFor, lobby, openedFiringState, seatState, seedState, started, tryCommand, valueOf } from "./support.ts";

describe("V1.6.2 reconnect", () => {
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

  it("restores a pending Commission Market top-3 look only to its owner, seat and step unchanged (v1.6.2 L196)", async () => {
    const { harness } = await started();
    let topThree: string[] = [];
    await seedState(harness, (gameId) => {
      const state = seatState(2, { gameId });
      topThree = state.hidden.mainDeck.slice(0, 3);
      return state;
    });
    const opened = await command(harness, "P1", { type: "PLACE_COMMISSION_MARKET", workerId: "P1:shifu" });
    const own = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P1").seatToken }));
    expect(own.ownPrivateView?.pendingLook).toEqual({ kind: "commission_market", playerId: "P1", orderIds: topThree });
    expect(own.ownSecrets.map((record) => record.event.type)).toContain("PRIVATE_LOOK_OPENED");
    expect(own.seat.playerId).toBe("P1");
    expect(own.game?.revision).toBe(opened.revision);
    expect(own.game?.phase).toEqual({
      type: "work_turn",
      activePlayerId: "P1",
      step: { kind: "commission_market", workerId: "P1:shifu", effect: "shifu", lookSize: 3, maxReservations: 2, lookedCount: 3 },
    });
    const other = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P2").seatToken }));
    expect(other.ownPrivateView?.pendingLook).toBeNull();
    expect(other.game?.counts.pendingLook).toEqual({ playerId: "P1", kind: "commission_market", count: 3 });
    for (const orderId of topThree) {
      expect(JSON.stringify(other)).not.toContain(`"${orderId}"`);
      expect(JSON.stringify(own.game)).not.toContain(`"${orderId}"`);
    }
  });

  it("restores a Colour Samples swap look only to its owner; the discarded Order and the looked cards stay private (v1.6.2 L617, change 24, B3)", async () => {
    const { harness } = await started();
    let look: OrderId[] = [];
    await seedState(harness, (gameId) => {
      const state = seatState(2, {
        gameId,
        players: [{ id: "P1", displayName: "Seat 1", techs: ["T10"], hand: ["O40"] }, { id: "P2", displayName: "Seat 2" }],
      });
      look = state.hidden.mainDeck.slice(0, 2);
      return state;
    });
    const opened = await command(harness, "P1", { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: "O40" });
    const own = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P1").seatToken }));
    expect(own.ownPrivateView?.pendingLook).toEqual({ kind: "colour_samples_swap", playerId: "P1", orderIds: look });
    expect(own.ownSecrets.map((record) => record.event.type)).toEqual(expect.arrayContaining(["HELD_ORDER_DISCARDED", "PRIVATE_LOOK_OPENED"]));
    expect(own.seat.playerId).toBe("P1");
    expect(own.game?.revision).toBe(opened.revision);
    expect(own.game?.phase).toEqual({ type: "work_turn", activePlayerId: "P1", step: { kind: "colour_samples_swap", returnTo: "before_action", lookedCount: 2 } });
    const other = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P2").seatToken }));
    expect(other.ownPrivateView?.pendingLook).toBeNull();
    expect(other.game?.counts.pendingLook).toEqual({ playerId: "P1", kind: "colour_samples_swap", count: 2 });
    expect(other.game?.counts.mainDiscard).toBe(1);
    for (const orderId of ["O40", ...look]) {
      expect(JSON.stringify(other)).not.toContain(`"${orderId}"`);
      expect(JSON.stringify(own.game)).not.toContain(`"${orderId}"`);
    }
    // The seat continues where it left off; the other card goes under the deck, still private.
    const chosen = await command(harness, "P1", { type: "COLOUR_SAMPLES_SWAP_CHOOSE", orderId: look[1] as OrderId });
    expect(chosen.ownPrivateView?.orderHand).toEqual([look[1]]);
    const after = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P2").seatToken }));
    for (const orderId of ["O40", ...look]) expect(JSON.stringify(after)).not.toContain(`"${orderId}"`);
    expect(after.game?.counts.mainDiscard).toBe(1);
  });

  it("restores a Second Firing choice with its 2 public cards; only the owner may choose (v1.6.2 L631, R7)", async () => {
    const { harness } = await started();
    await seedState(harness, (gameId) => {
      // P1's White Bowl in a High space: Base 2 + Fire 0 + 1 = 3, Heat Difference 2, Standard.
      const firing = openedFiringState({
        gameId,
        players: [{ id: "P1", displayName: "Seat 1", techs: ["T14"] }, { id: "P2", displayName: "Seat 2" }],
        fireDeck: [0, 1, -1],
        ceramics: [
          { owner: "P1", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1" },
          { owner: "P2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
        ],
      });
      const table = new LocalTable(firing);
      table.contribute("P1", "TEND");
      table.contribute("P2", "TEND");
      if (table.state.phase.type !== "firing_after_quality") throw new Error(`Expected step 10, found ${table.state.phase.type}`);
      table.act("P1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
      return table.state;
    });
    for (const playerId of ["P1", "P2"]) {
      const view = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, playerId).seatToken }));
      expect(view.seat.playerId).toBe(playerId);
      expect(view.game?.phase).toEqual({ type: "firing_second_firing_choice", actorId: "P1", ceramicId: "c1" });
      // Both revealed cards are public (L631), so every seat sees them.
      expect(view.game?.firing?.pendingExtraFire).toEqual({ playerId: "P1", ceramicId: "c1", modifiers: [1, -1] });
    }
    const refused = await tryCommand(harness, "P2", { type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: null });
    expect(refused.ok).toBe(false);
    const chosen = await command(harness, "P1", { type: "SECOND_FIRING_CHOOSE", cardIndex: 1, jun: null });
    // Nothing else is due, so the firing finishes; its record keeps the choice and both cards.
    expect((chosen.game.firing ?? chosen.game.lastFiring)?.ceramics["c1"]).toMatchObject({ second: { fireModifier: -1 }, secondFiringCards: [1, -1] });
    expect(chosen.game.fireDiscard.slice(-3)).toEqual([1, -1, 0]);
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
