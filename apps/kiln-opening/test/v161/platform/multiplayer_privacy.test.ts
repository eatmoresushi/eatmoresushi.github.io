/**
 * Hidden information over the authoritative service (DESIGN §4): what each seat, the public
 * rows and the realtime payloads may and may not contain. Successor of the V1.4
 * `multiplayer_privacy` suite.
 */

import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../../../src/game/index.ts";
import type { GameEvent, GameState, OrderId, TechId } from "../../../src/game/index.ts";
import { projectPublicGameState } from "../../../src/multiplayer/index.ts";
import {
  allHandOrderIds,
  command,
  connectionFor,
  headState,
  seatState,
  seedState,
  started,
  tryCommand,
  valueOf,
} from "./support.ts";

const DEALT = GAME_CONFIG.setupDeal.startingOrders + GAME_CONFIG.setupDeal.mainOrders;

function quoted(ids: readonly string[]): string[] {
  return ids.map((id) => `"${id}"`);
}

function expectAbsent(payload: unknown, ids: readonly string[]): void {
  const json = JSON.stringify(payload);
  for (const id of quoted(ids)) expect(json).not.toContain(id);
}

describe("V1.6.1 multiplayer privacy", () => {
  it("deals each seat's Orders secretly and restores only the authenticated seat's hand and deal", async () => {
    const { harness, start } = await started();
    const head = await headState(harness);
    expect(head.phase.type).toBe("setup_kiln_selection");
    const hands = Object.fromEntries(head.playerOrder.map((id) => [id, head.hidden.orderHands[id] ?? []]));
    for (const hand of Object.values(hands)) expect(hand).toHaveLength(DEALT);

    // The public projection: no `hidden`, counts only.
    expect(start.game).not.toHaveProperty("hidden");
    expect(start.game.counts.orderHands).toEqual({ P1: DEALT, P2: DEALT });
    expect(start.game.counts.mainDeck).toBe(head.hidden.mainDeck.length);
    expectAbsent(start.game, allHandOrderIds(head));
    expectAbsent(start.game, head.hidden.mainDeck);
    expectAbsent(start.events, allHandOrderIds(head));
    expect(start.events.filter((event) => event.type === "ORDERS_DEALT")).toHaveLength(2);
    expect(start.events.some((event) => "secret" in event)).toBe(false);

    // The host's own response carries its deal, nobody else's.
    expect(start.ownPrivateView?.orderHand).toEqual(hands["P1"]);
    expect(start.ownSecrets.map((record) => record.event.type)).toEqual(["ORDERS_DEALT"]);
    const hostDeal = start.ownSecrets[0]!.event as Extract<GameEvent, { type: "ORDERS_DEALT" }>;
    expect(hostDeal.secret.visibleTo).toBe("P1");
    expect([...hostDeal.secret.startingOrderIds, ...hostDeal.secret.mainOrderIds].sort()).toEqual([...hands["P1"]!].sort());
    expectAbsent(start, hands["P2"]!);

    // Every seat recovers exactly its own deal on reconnect, as a private log entry.
    for (const connection of harness.humans) {
      const playerId = connection.seat.playerId;
      const other = playerId === "P1" ? "P2" : "P1";
      const reconnect = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connection.seatToken }));
      expect(reconnect.seat).toEqual(connection.seat);
      expect(reconnect.ownPrivateView?.orderHand).toEqual(hands[playerId]);
      expect(reconnect.ownSecrets).toHaveLength(1);
      expect(reconnect.ownSecrets[0]!.event).toMatchObject({ type: "ORDERS_DEALT", playerId, secret: { visibleTo: playerId } });
      expectAbsent(reconnect, hands[other]!);
      expectAbsent(reconnect.game, hands[playerId]!);
      const log = valueOf(await harness.service.listPrivateEvents({ roomCode: harness.roomCode, seatToken: connection.seatToken, afterSequence: 0 }));
      expect(log).toEqual(reconnect.ownSecrets);
    }

    // Public rows never carry a secret, and the event numbering matches the state.
    const rows = await harness.store.listPublicEvents(harness.roomId);
    expect(rows.map((row) => row.sequence)).toEqual(rows.map((_, index) => index + 1));
    expect(rows).toHaveLength(head.eventSequence);
    expect(rows.some((row) => "secret" in row.event)).toBe(false);
    expectAbsent(rows, allHandOrderIds(head));
    expect(start.ownSecrets[0]!.sequence).toBe(rows.find((row) => row.event.type === "ORDERS_DEALT")!.sequence);
    for (const publicState of harness.store.audit().publicStates) {
      expect(publicState).not.toHaveProperty("hidden");
      expectAbsent(publicState, allHandOrderIds(head));
    }
  });

  it("publishes every ceramic attribute to every seat (L508)", async () => {
    const { harness } = await started();
    const seeded = await seedState(harness, (gameId) =>
      seatState(2, {
        gameId,
        ceramics: [
          { owner: "P1", stage: "shaped", shape: "bowl", decoration: "carved" },
          { owner: "P1", stage: "loaded", shape: "vase", glaze: "celadon", at: "high_1" },
          { owner: "P2", stage: "finished", shape: "plate", glaze: "white", quality: "fine" },
          { owner: "P2", stage: "loaded", shape: "washer", glaze: "moon_white", at: "low_1" },
        ],
      }),
    );
    for (const connection of harness.humans) {
      const reconnect = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connection.seatToken }));
      expect(reconnect.game?.ceramics).toEqual(seeded.ceramics);
      expect(reconnect.game?.sharedKiln).toEqual(seeded.sharedKiln);
    }
  });

  it("keeps a blind Commission reservation private to its owner", async () => {
    const { harness } = await started();
    let deckTop: OrderId | undefined;
    await seedState(harness, (gameId) => {
      const state = seatState(2, { gameId });
      deckTop = state.hidden.mainDeck[0];
      return state;
    });
    expect(deckTop).toBeDefined();
    const result = await command(harness, "P1", {
      type: "PLACE_COMMISSION_MARKET",
      workerId: "P1:apprentice:1",
      first: { kind: "blind" },
    });
    const reserved = result.events.find((event) => event.type === "ORDER_RESERVED");
    expect(reserved).toMatchObject({ type: "ORDER_RESERVED", playerId: "P1", source: "blind", orderId: null });
    expect(reserved).not.toHaveProperty("secret");
    expect(result.ownSecrets.map((record) => record.event)).toContainEqual(
      expect.objectContaining({ type: "ORDER_RESERVED", secret: { visibleTo: "P1", orderId: deckTop } }),
    );
    expect(result.ownPrivateView?.orderHand).toContain(deckTop);
    expectAbsent(result.game, [deckTop!]);
    expectAbsent(result.events, [deckTop!]);
    const other = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P2").seatToken }));
    expectAbsent(other, [deckTop!]);
    expect(other.game?.counts.orderHands["P1"]).toBe(1);
  });

  it("keeps a Guild Hall Shifu inspection and its chosen bottom order private (B2)", async () => {
    const { harness } = await started();
    let inspected: TechId[] = [];
    const seeded = await seedState(harness, (gameId) => {
      const state = seatState(2, { gameId, players: [{ id: "P1", resources: { coins: 10 } }, { id: "P2" }] });
      inspected = state.hidden.techDecks.firing.slice(0, 2);
      return state;
    });
    expect(inspected).toHaveLength(2);
    const opened = await command(harness, "P1", {
      type: "PLACE_GUILD_HALL",
      workerId: "P1:shifu",
      choice: { kind: "inspect", discipline: "firing" },
    });
    expect(opened.ownPrivateView?.pendingLook).toMatchObject({ kind: "guild_inspection", playerId: "P1", techIds: inspected });
    expect(opened.game.counts.pendingLook).toEqual({ playerId: "P1", kind: "guild_inspection", count: 2 });
    expectAbsent(opened.game, inspected);
    expectAbsent(opened.events, inspected);
    const otherDuring = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P2").seatToken }));
    expect(otherDuring.ownPrivateView?.pendingLook).toBeNull();
    expectAbsent(otherDuring, inspected);

    const [taken, returned] = inspected as [TechId, TechId];
    const take = await command(harness, "P1", { type: "GUILD_TAKE", take: { kind: "inspected", techId: taken }, bottomOrder: [returned] });
    const head = await headState(harness);
    expect(head.hidden.techDecks.firing.at(-1)).toBe(returned);
    expectAbsent(take.game, [returned]);
    expectAbsent(take.events, [returned]);
    expect(take.ownSecrets.map((record) => record.event)).toContainEqual(
      expect.objectContaining({ type: "TECHS_RETURNED_TO_BOTTOM", secret: { visibleTo: "P1", techIds: [returned] } }),
    );
    const otherAfter = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P2").seatToken }));
    expectAbsent(otherAfter, [returned]);
    const ownAfter = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P1").seatToken }));
    expect(ownAfter.ownSecrets.map((record) => record.event.type)).toContain("TECHS_RETURNED_TO_BOTTOM");
    // Rows after the seeded scenario (earlier rows describe the pre-seed deal).
    expectAbsent(await harness.store.listPublicEvents(harness.roomId, seeded.eventSequence), [returned]);
  });

  it("shape-checks every command, Contributions included, before branching on it", async () => {
    const { harness } = await started();
    const before = await headState(harness);
    for (const malformed of [
      { type: "SUBMIT_CONTRIBUTION", windowId: "w", card: "TEND" },
      { type: "SUBMIT_CONTRIBUTION", windowId: "w", card: "BANK_2", fuelLedger: false },
      { type: "SUBMIT_WOOD_CONTRIBUTION", windowId: "w", card: "TEND" },
      { type: "SELECT_KILN", kilnId: "XX" },
      "SELECT_KILN",
      null,
    ]) {
      const result = await tryCommand(harness, "P1", malformed);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("MALFORMED_ACTION");
    }
    expect(await headState(harness)).toEqual(before);
  });

  it("refuses to project any save that is not schema 6 under V1.6.1", () => {
    const legacy = { schemaVersion: 5, rulesVersion: "1.4" } as unknown as GameState;
    expect(() => projectPublicGameState(legacy)).toThrow("Only schema-6 V1.6.1 games");
  });
});
