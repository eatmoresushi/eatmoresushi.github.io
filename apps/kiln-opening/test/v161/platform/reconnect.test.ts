/**
 * Reconnect without changing seat or state (AGENTS.md, DESIGN §4.6): a seat recovers its
 * public projection, its own private view — including its sealed Contribution card, a Fuel
 * Ledger card included (v1.6.2 change 26), and its hand mid-way through the Setup pick (rev. 4
 * change 32, R23) — and its own secrets, and nothing is written.
 */

import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../../../src/game/content.ts";
import { decisionPrompt } from "../../../src/game/index.ts";
import type { OrderId } from "../../../src/game/types.ts";
import { LocalTable } from "../engine/support/localTable.ts";
import { command, connectionFor, headState, lobby, openedFiringState, seatState, seedState, started, tryCommand, valueOf } from "./support.ts";

describe("V1.6.2 reconnect", () => {
  it("returns the seat's own sealed card (Fuel Ledger Stoke) during an open window; seat and state unchanged", async () => {
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
    await command(harness, "P1", { type: "SUBMIT_CONTRIBUTION", windowId, card: "FUEL_LEDGER_STOKE" });

    const headBefore = await harness.store.loadHead(harness.roomId);
    const auditBefore = harness.store.audit();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const own = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P1").seatToken }));
      expect(own.seat).toEqual(connectionFor(harness, "P1").seat);
      expect(own.ownPrivateView?.pendingContribution).toEqual({ card: "FUEL_LEDGER_STOKE", windowId });
      expect(own.game?.revision).toBe(headBefore?.revision);
      const other = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P2").seatToken }));
      expect(other.seat).toEqual(connectionFor(harness, "P2").seat);
      expect(other.ownPrivateView?.pendingContribution).toBeNull();
      // P1's public card list names its cards; the sealed one is nowhere in P2's response.
      expect(JSON.stringify(other, (key, item: unknown) => (key === "contributionCards" ? undefined : item))).not.toContain("STOKE");
      expect(JSON.stringify(other.game)).toEqual(JSON.stringify(own.game));
    }
    expect(await harness.store.loadHead(harness.roomId)).toEqual(headBefore);
    expect(harness.store.audit()).toEqual(auditBefore);

    // The seat continues where it left off.
    const last = await tryCommand(harness, "P2", { type: "SUBMIT_CONTRIBUTION", windowId, card: "TEND" });
    expect(last.ok).toBe(true);
  });

  it("restores the lobby without a game, and refuses an unknown credential", async () => {
    const harness = await lobby();
    const reconnect = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: harness.host.seatToken }));
    expect(reconnect).toMatchObject({ game: null, ownPrivateView: null, ownSecrets: [], seat: harness.host.seat });
    const denied = await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: "x".repeat(40) });
    expect(denied.ok ? null : denied.error.code).toBe("AUTHENTICATION_FAILED");
  });

  it("restores a pending Commission Market Select 3 only to its owner, seat and step unchanged (v1.6.2 L226)", async () => {
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
      step: { kind: "commission_market", workerId: "P1:shifu", effect: "shifu", select: { n: 3, maxReservations: 2, fromDisplay: true, lookedCount: 3 } },
    });
    const other = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P2").seatToken }));
    expect(other.ownPrivateView?.pendingLook).toBeNull();
    expect(other.game?.counts.pendingLook).toEqual({ playerId: "P1", kind: "commission_market", count: 3 });
    for (const orderId of topThree) {
      expect(JSON.stringify(other)).not.toContain(`"${orderId}"`);
      expect(JSON.stringify(own.game)).not.toContain(`"${orderId}"`);
    }
  });

  it("restores a Colour Samples swap's Select 3 only to its owner; the discarded Order and the looked cards stay private (v1.6.2 L632, change 25, R25, B3)", async () => {
    const { harness } = await started();
    let look: OrderId[] = [];
    await seedState(harness, (gameId) => {
      const state = seatState(2, {
        gameId,
        players: [{ id: "P1", displayName: "Seat 1", techs: ["T10"], hand: ["O40"] }, { id: "P2", displayName: "Seat 2" }],
      });
      look = state.hidden.mainDeck.slice(0, 3);
      return state;
    });
    const opened = await command(harness, "P1", { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: "O40" });
    const own = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P1").seatToken }));
    expect(own.ownPrivateView?.pendingLook).toEqual({ kind: "colour_samples_swap", playerId: "P1", orderIds: look });
    expect(own.ownSecrets.map((record) => record.event.type)).toEqual(expect.arrayContaining(["HELD_ORDER_DISCARDED", "PRIVATE_LOOK_OPENED"]));
    expect(own.seat.playerId).toBe("P1");
    expect(own.game?.revision).toBe(opened.revision);
    expect(own.game?.phase).toEqual({
      type: "work_turn",
      activePlayerId: "P1",
      step: { kind: "colour_samples_swap", returnTo: "before_action", select: { n: 3, maxReservations: 1, fromDisplay: true, lookedCount: 3 } },
    });
    const other = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P2").seatToken }));
    expect(other.ownPrivateView?.pendingLook).toBeNull();
    expect(other.game?.counts.pendingLook).toEqual({ playerId: "P1", kind: "colour_samples_swap", count: 3 });
    expect(other.game?.counts.mainDiscard).toBe(1);
    for (const orderId of ["O40", ...look]) {
      expect(JSON.stringify(other)).not.toContain(`"${orderId}"`);
      expect(JSON.stringify(own.game)).not.toContain(`"${orderId}"`);
    }
    // The seat continues where it left off; the other 2 are discarded face down, still private (R25).
    const chosen = await command(harness, "P1", { type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: look[1] as OrderId }] });
    expect(chosen.ownPrivateView?.orderHand).toEqual([look[1]]);
    const after = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P2").seatToken }));
    for (const orderId of ["O40", ...look]) expect(JSON.stringify(after)).not.toContain(`"${orderId}"`);
    expect(after.game?.counts.mainDiscard).toBe(3);
  });

  it("restores a Second Firing choice with its 2 public cards; only the owner may choose (v1.6.2 L646, R7)", async () => {
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
      // Both revealed cards are public (L646), so every seat sees them.
      expect(view.game?.firing?.pendingExtraFire).toEqual({ playerId: "P1", ceramicId: "c1", modifiers: [1, -1] });
    }
    const refused = await tryCommand(harness, "P2", { type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: null });
    expect(refused.ok).toBe(false);
    const chosen = await command(harness, "P1", { type: "SECOND_FIRING_CHOOSE", cardIndex: 1, jun: null });
    // Nothing else is due, so the firing finishes; its record keeps the choice and both cards.
    expect((chosen.game.firing ?? chosen.game.lastFiring)?.ceramics["c1"]).toMatchObject({ second: { fireModifier: -1 }, secondFiringCards: [1, -1] });
    expect(chosen.game.fireDiscard.slice(-3)).toEqual([1, -1, 0]);
  });

  it("restores the Setup pick mid-way: each seat's own hand, the public take, seat and state unchanged, and the pending chooser picks after (L130, R23)", async () => {
    const { harness } = await started();
    const head = await headState(harness);
    if (head.phase.type !== "setup_kiln_selection") throw new Error(`expected Setup, found ${head.phase.type}`);
    const [first, second] = head.phase.selectionOrder;
    if (first === undefined || second === undefined) throw new Error("expected two choosers");
    const startingOf = (playerId: string): OrderId[] => [...(head.hidden.orderHands[playerId] ?? [])];
    expect(startingOf(first)).toHaveLength(GAME_CONFIG.setupDeal.startingOrders);
    expect(startingOf(second)).toHaveLength(GAME_CONFIG.setupDeal.startingOrders);

    // Before any pick: the first chooser gets its 2 Starting Orders back, and nothing is written.
    const auditBeforePick = harness.store.audit();
    const pending = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, first).seatToken }));
    expect(pending.seat).toEqual(connectionFor(harness, first).seat);
    expect(pending.ownPrivateView?.orderHand).toEqual(startingOf(first));
    expect(pending.game?.phase).toEqual({ type: "setup_kiln_selection", selectionOrder: [first, second], index: 0 });
    expect(harness.store.audit()).toEqual(auditBeforePick);

    const taken = head.market.display[3] as OrderId;
    const picked = await command(harness, first, { type: "SELECT_KILN", kilnId: "JU", mainOrder: { slotIndex: 3, orderId: taken } });
    const headBefore = await harness.store.loadHead(harness.roomId);
    const auditBefore = harness.store.audit();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      // The chooser's taken Main Order comes back from the head: its private deal record
      // (ORDERS_DEALT) names only the Starting Orders.
      const own = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, first).seatToken }));
      expect(own.seat).toEqual(connectionFor(harness, first).seat);
      expect([...(own.ownPrivateView?.orderHand ?? [])].sort()).toEqual([...startingOf(first), taken].sort());
      expect(own.ownSecrets.map((record) => record.event.type)).toContain("ORDERS_DEALT");
      expect(own.game?.revision).toBe(picked.revision);
      expect(own.game?.phase).toEqual({ type: "setup_kiln_selection", selectionOrder: [first, second], index: 1 });
      expect(own.game?.counts.orderHands[first]).toBe(GAME_CONFIG.setupDeal.startingOrders + 1);
      // The pending chooser gets its own Starting Orders back and sees the public take, never
      // the first chooser's Starting Orders.
      const waiting = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, second).seatToken }));
      expect(waiting.seat).toEqual(connectionFor(harness, second).seat);
      expect(waiting.ownPrivateView?.orderHand).toEqual(startingOf(second));
      expect(waiting.game?.revision).toBe(picked.revision);
      expect(waiting.game?.market.display).not.toContain(taken);
      for (const orderId of startingOf(first)) {
        expect(JSON.stringify(waiting)).not.toContain(`"${orderId}"`);
        expect(JSON.stringify(own.game)).not.toContain(`"${orderId}"`);
      }
      for (const orderId of startingOf(second)) expect(JSON.stringify(own)).not.toContain(`"${orderId}"`);
    }
    expect(await harness.store.loadHead(harness.roomId)).toEqual(headBefore);
    expect(harness.store.audit()).toEqual(auditBefore);

    // The pending chooser continues where it left off; the first chooser cannot pick again.
    const display = (await headState(harness)).market.display;
    const again = await tryCommand(harness, first, { type: "SELECT_KILN", kilnId: "RU", mainOrder: { slotIndex: 0, orderId: display[0] as OrderId } });
    expect(again.ok).toBe(false);
    const secondPick = await command(harness, second, { type: "SELECT_KILN", kilnId: "RU", mainOrder: { slotIndex: 0, orderId: display[0] as OrderId } });
    expect([...(secondPick.ownPrivateView?.orderHand ?? [])].sort()).toEqual([...startingOf(second), display[0] as OrderId].sort());
    expect(secondPick.game.phase.type).not.toBe("setup_kiln_selection");
  });

  it.each(["after_action", "order_phase"] as const)(
    "restores a free-action window (%s) with the seat's own hand only; the window is the same for every seat, and the seat completes after (rev. 5 L168–176, R27, R28)",
    async (window) => {
      const { harness } = await started();
      await seedState(harness, (gameId) =>
        seatState(2, {
          gameId,
          round: 3,
          players: [
            { id: "P1", displayName: "Seat 1", hand: ["O02"], resources: { coins: 1 } },
            { id: "P2", displayName: "Seat 2", hand: ["O40"] },
          ],
          ceramics: [{ owner: "P1", stage: "finished", shape: "plate", glaze: "celadon", quality: "fine" }],
          ...(window === "order_phase" ? { phase: { type: "orders", turnOrder: ["P1", "P2"], index: 0 } } : {}),
        }),
      );
      if (window === "after_action") {
        // A held Order and a Finished ceramic that is not Flawed open the window (public facts).
        await command(harness, "P1", { type: "PLACE_CANAL_WHARF", workerId: "P1:apprentice:1" });
      }
      const head = await headState(harness);
      const expected = window === "after_action" ? { type: "work_turn", activePlayerId: "P1", step: { kind: "after_action" } } : { type: "orders", turnOrder: ["P1", "P2"], index: 0 };
      expect(head.phase).toEqual(expected);
      const headBefore = await harness.store.loadHead(harness.roomId);
      const auditBefore = harness.store.audit();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const own = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P1").seatToken }));
        expect(own.seat).toEqual(connectionFor(harness, "P1").seat);
        expect(own.ownPrivateView?.orderHand).toEqual(["O02"]);
        expect(own.game?.phase).toEqual(expected);
        expect(own.game?.revision).toBe(head.revision);
        const other = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P2").seatToken }));
        expect(other.ownPrivateView?.orderHand).toEqual(["O40"]);
        expect(other.game?.phase).toEqual(expected);
        expect(other.game?.counts.orderHands["P1"]).toBe(1);
        expect(JSON.stringify(other)).not.toContain('"O02"');
        expect(JSON.stringify(own)).not.toContain('"O40"');
        expect(JSON.stringify(other.game)).toEqual(JSON.stringify(own.game));
      }
      expect(await harness.store.loadHead(harness.roomId)).toEqual(headBefore);
      expect(harness.store.audit()).toEqual(auditBefore);

      // The seat continues where it left off: the completion is a free action, and public.
      const completed = await command(harness, "P1", { type: "COMPLETE_ORDER", orderId: "O02", ceramicIds: ["c1"] });
      expect(completed.ownPrivateView?.orderHand).toEqual([]);
      expect(completed.game.players["P1"]?.completedOrders.map((record) => record.orderId)).toEqual(["O02"]);
      const after = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P2").seatToken }));
      expect(after.game?.players["P1"]?.completedOrders.map((record) => record.orderId)).toEqual(["O02"]);
      expect(after.game?.phase).not.toEqual(expected);
    },
  );

  it("replays an accepted command by its ID without committing it again", async () => {
    const { harness, start } = await started();
    const actor = decisionPrompt(start.game).actorIds[0]!;
    const other = actor === "P1" ? "P2" : "P1";
    const commandId = "00000000-0000-4000-9700-000000000001";
    // Setup step 9 (L130, R23): the Kiln and a face-up Main Order in one command.
    const orderId = start.game.market.display[0]!;
    const pick = { type: "SELECT_KILN", kilnId: "DI", mainOrder: { slotIndex: 0, orderId } } as const;
    const first = valueOf(await tryCommand(harness, actor, pick, start.revision, commandId));
    const commandsAfterFirst = harness.store.audit().commands.length;
    const replay = valueOf(await tryCommand(harness, actor, pick, start.revision, commandId));
    expect(replay).toEqual(first);
    expect(harness.store.audit().commands).toHaveLength(commandsAfterFirst);
    const stolen = await tryCommand(harness, other, { type: "SELECT_KILN", kilnId: "RU", mainOrder: { slotIndex: 0, orderId } }, first.revision, commandId);
    expect(stolen.ok ? null : stolen.error.code).toBe("DUPLICATE_COMMAND");
    expect((await harness.store.loadHead(harness.roomId))?.revision).toBe(first.revision);
  });
});
