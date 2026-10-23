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

/** Only the 2 Starting Orders are dealt; the Main Order is taken face up with the Kiln (rev. 4
 * L122, R23), so it is public. */
const DEALT = GAME_CONFIG.setupDeal.startingOrders;

function quoted(ids: readonly string[]): string[] {
  return ids.map((id) => `"${id}"`);
}

function expectAbsent(payload: unknown, ids: readonly string[]): void {
  const json = JSON.stringify(payload);
  for (const id of quoted(ids)) expect(json).not.toContain(id);
}

describe("V1.6.2 multiplayer privacy", () => {
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
    expect([...hostDeal.secret.startingOrderIds].sort()).toEqual([...hands["P1"]!].sort());
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

  it("keeps the Commission Market look, a looked reservation and the card put on the deck bottom private (v1.6.2 L195, change 24, B3)", async () => {
    const { harness } = await started();
    let top: OrderId[] = [];
    await seedState(harness, (gameId) => {
      const state = seatState(2, { gameId });
      top = state.hidden.mainDeck.slice(0, 2);
      return state;
    });
    expect(top).toHaveLength(2);
    const [kept, bottomed] = top as [OrderId, OrderId];
    const opened = await command(harness, "P1", { type: "PLACE_COMMISSION_MARKET", workerId: "P1:apprentice:1" });
    const look = opened.events.find((event) => event.type === "PRIVATE_LOOK_OPENED");
    expect(look).toMatchObject({ type: "PRIVATE_LOOK_OPENED", playerId: "P1", kind: "commission_market", count: 2 });
    expect(look).not.toHaveProperty("secret");
    expect(opened.ownPrivateView?.pendingLook).toEqual({ kind: "commission_market", playerId: "P1", orderIds: top });
    expect(opened.game.counts.pendingLook).toEqual({ playerId: "P1", kind: "commission_market", count: 2 });
    expectAbsent(opened.game, top);
    expectAbsent(opened.events, top);

    const result = await command(harness, "P1", { type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: kept }] });
    const reserved = result.events.find((event) => event.type === "ORDER_RESERVED");
    expect(reserved).toMatchObject({ type: "ORDER_RESERVED", playerId: "P1", via: "commission_market", source: "looked", orderId: null });
    expect(reserved).not.toHaveProperty("secret");
    expect(result.events.find((event) => event.type === "LOOKED_ORDERS_TO_BOTTOM")).toMatchObject({ playerId: "P1", count: 1 });
    expect(result.ownSecrets.map((record) => record.event)).toContainEqual(
      expect.objectContaining({ type: "ORDER_RESERVED", secret: { visibleTo: "P1", orderId: kept } }),
    );
    expect(result.ownSecrets.map((record) => record.event)).toContainEqual(
      expect.objectContaining({ type: "LOOKED_ORDERS_TO_BOTTOM", secret: { visibleTo: "P1", orderIds: [bottomed] } }),
    );
    expect(result.ownPrivateView?.orderHand).toContain(kept);
    expect(result.ownPrivateView?.pendingLook).toBeNull();
    expectAbsent(result.game, top);
    expectAbsent(result.events, top);
    const other = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P2").seatToken }));
    expectAbsent(other, top);
    expect(other.game?.counts.orderHands["P1"]).toBe(1);
    // The unreserved card went to the bottom of the deck, not the discard (change 24): only the
    // deck count shows it.
    expect(other.game?.counts.mainDiscard).toBe(0);
    expect(other.game?.counts.mainDeck).toBe(opened.game.counts.mainDeck + 1);
  });

  it("keeps the Canal Wharf Shifu's unseen Main Order private to its owner (v1.6.2 L220, B3)", async () => {
    const { harness } = await started();
    let deckTop: OrderId | undefined;
    await seedState(harness, (gameId) => {
      const state = seatState(2, { gameId });
      deckTop = state.hidden.mainDeck[0];
      return state;
    });
    expect(deckTop).toBeDefined();
    const result = await command(harness, "P1", { type: "PLACE_CANAL_WHARF", workerId: "P1:shifu" });
    const reserved = result.events.find((event) => event.type === "ORDER_RESERVED");
    expect(reserved).toMatchObject({ type: "ORDER_RESERVED", playerId: "P1", via: "canal_wharf", source: "deck_top", orderId: null });
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
    await command(harness, "P1", { type: "GUILD_TAKE", take: { kind: "inspected", techId: taken } });
    // 10 Coins leave a second take possible (v1.6.2 L207), so the inspection stays open: a
    // reconnect gives the untaken Tech back to P1 only.
    const otherMid = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P2").seatToken }));
    expect(otherMid.ownPrivateView?.pendingLook).toBeNull();
    expectAbsent(otherMid, [returned]);
    const ownMid = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P1").seatToken }));
    expect(ownMid.ownPrivateView?.pendingLook).toMatchObject({ kind: "guild_inspection", playerId: "P1", techIds: [returned] });
    const take = await command(harness, "P1", { type: "GUILD_FINISH", bottomOrder: [returned] });
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
      // The retired V1.6.2 Fuel Ledger commitment flag (change 26) and a V1.4 card.
      { type: "SUBMIT_CONTRIBUTION", windowId: "w", card: "TEND", fuelLedger: false },
      { type: "SUBMIT_CONTRIBUTION", windowId: "w", card: "BANK_2" },
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

  it("refuses to project any save that is not schema 9 under V1.6.2", () => {
    const legacy = { schemaVersion: 5, rulesVersion: "1.4" } as unknown as GameState;
    expect(() => projectPublicGameState(legacy)).toThrow("Only schema-9 V1.6.2 games");
    const v161 = { schemaVersion: 6, rulesVersion: "1.6.1" } as unknown as GameState;
    expect(() => projectPublicGameState(v161)).toThrow("Only schema-9 V1.6.2 games");
    // V1.6.2 saves from before owner revision 3 (changes 25–27) and 4 (changes 28–35) are refused too.
    const revision2 = { schemaVersion: 7, rulesVersion: "1.6.2" } as unknown as GameState;
    expect(() => projectPublicGameState(revision2)).toThrow("Only schema-9 V1.6.2 games");
    const revision3 = { schemaVersion: 8, rulesVersion: "1.6.2" } as unknown as GameState;
    expect(() => projectPublicGameState(revision3)).toThrow("Only schema-9 V1.6.2 games");
  });
});
