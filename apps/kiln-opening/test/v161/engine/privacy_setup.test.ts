/**
 * Hidden information at setup (P2): the secret deal of 2 Starting Orders (rev. 4 L115, L201,
 * L507), the Starting box (rev. 4 L116), deck orders and Tech decks never reach the public
 * projection or public events; each seat sees only its own hand (DESIGN §4.2–4.4, §8.2). The
 * Main Order each player takes face up with its Kiln is public (rev. 4 L122: "everyone has seen
 * which Main Order each player took").
 */

import { describe, expect, it } from "vitest";
import { DISCIPLINES, ORDER_IDS, TECH_IDS } from "../../../src/game/content.ts";
import { createGame } from "../../../src/game/engine.ts";
import { SeededRandom, shuffle } from "../../../src/game/rng.ts";
import type { GameEvent, GameState, OrderId, PlayerCount, PlayerId, PublicGameState, TechId } from "../../../src/game/types.ts";
import { actorViewOf, eventForViewer, projectEvent, projectPrivateView, projectPublicState, viewOf } from "../../../src/game/view.ts";
import { LocalTable } from "./support/localTable.ts";

function newState(seed: number, n: PlayerCount): { state: GameState; events: GameEvent[] } {
  const result = createGame(
    { gameId: `privacy-${seed}`, players: Array.from({ length: n }, (_, seat) => ({ id: `p${seat + 1}`, displayName: `P${seat + 1}` })) },
    new SeededRandom(seed),
  );
  if (!result.ok) throw new Error(result.error.message);
  return { state: result.state, events: result.events };
}

function quoted(id: string): string {
  return `"${id}"`;
}

/** Order IDs a public reader may see: the display, and any `also` (the Main Orders taken face up
 * at Setup step 9; nothing is completed at setup). */
function expectOnlyDisplayedOrders(json: string, game: PublicGameState | GameState, also: readonly OrderId[] = []): void {
  const shown = new Set<OrderId>([...game.market.display.filter((id): id is OrderId => id !== null), ...also]);
  for (const orderId of ORDER_IDS) {
    if (!shown.has(orderId)) {
      expect(json, `${orderId} leaked`).not.toContain(quoted(orderId));
    }
  }
}

function expectOnlyDisplayedTechs(json: string, game: GameState): void {
  const shown = new Set<TechId>(DISCIPLINES.flatMap((d) => game.techDisplay[d]));
  for (const techId of TECH_IDS) {
    if (!shown.has(techId)) {
      expect(json, `${techId} leaked`).not.toContain(quoted(techId));
    }
  }
}

describe("public projection after setup", () => {
  it.each([2, 3, 4] as PlayerCount[])("%i players: no hand, deck, box or Tech-deck identity; counts only", (n) => {
    const { state } = newState(50 + n, n);
    const projected = projectPublicState(state);
    const json = JSON.stringify(projected);
    expect("hidden" in projected).toBe(false);
    expect(json).not.toContain("startingBox");
    expect(json).not.toContain('"fireDeck":[');
    expectOnlyDisplayedOrders(json, state);
    expectOnlyDisplayedTechs(json, state);
    expect(projected.counts).toEqual({
      orderHands: Object.fromEntries(state.playerOrder.map((id) => [id, 2])),
      mainDeck: 48 - 6,
      mainDiscard: 0,
      techDecks: { workshop: 4, glazing_loading: 4, firing: 4 },
      fireDeck: 12,
      fireBuried: 0,
      pendingLook: null,
    });
  });
});

describe("creation events", () => {
  it("ORDERS_DEALT shows the count publicly and the 2 Starting Orders only to their owner", () => {
    const { state, events } = newState(61, 3);
    const dealt = events.filter((event): event is Extract<GameEvent, { type: "ORDERS_DEALT" }> => event.type === "ORDERS_DEALT");
    expect(dealt.map((event) => event.playerId)).toEqual(["p1", "p2", "p3"]);
    for (const event of dealt) {
      expect(projectEvent(event)).toEqual({ type: "ORDERS_DEALT", playerId: event.playerId, startingCount: 2 });
      expect(eventForViewer(event, event.playerId)).toEqual(event);
      const hand = state.hidden.orderHands[event.playerId] ?? [];
      expect(event.secret.startingOrderIds).toEqual(hand);
      for (const viewer of [...state.playerOrder.filter((id) => id !== event.playerId), null]) {
        const seen = JSON.stringify(eventForViewer(event, viewer));
        for (const orderId of hand) expect(seen).not.toContain(quoted(orderId));
      }
    }
  });

  it("every projected creation event is free of hidden Orders and Techs", () => {
    const { state, events } = newState(62, 4);
    const json = JSON.stringify(events.map(projectEvent));
    expect(json).not.toContain("secret");
    expectOnlyDisplayedOrders(json, state);
    expectOnlyDisplayedTechs(json, state);
  });
});

describe("private views", () => {
  it("each seat sees exactly its own hand and nobody else's", () => {
    const { state } = newState(63, 4);
    for (const viewer of state.playerOrder) {
      const view = viewOf(state, viewer);
      const hand = state.hidden.orderHands[viewer] ?? [];
      expect(view.own?.orderHand).toEqual(hand);
      const json = JSON.stringify(view);
      for (const other of state.playerOrder.filter((id) => id !== viewer)) {
        for (const orderId of state.hidden.orderHands[other] ?? []) expect(json).not.toContain(quoted(orderId));
      }
      for (const orderId of state.hidden.startingBox) expect(json).not.toContain(quoted(orderId));
    }
    expect(viewOf(state, null).own).toBeNull();
  });

  it("an actor's view does not change when other hands, the box and the deck orders are re-dealt", () => {
    const { state } = newState(64, 3);
    const shuffled: GameState = structuredClone(state);
    const rng = new SeededRandom(99);
    // Swap p2's and p3's hands with Starting cards of equal counts from the box (2 each in a
    // 3-player game, rev. 4 L115–116).
    const box = shuffled.hidden.startingBox;
    for (const other of ["p2", "p3"] as PlayerId[]) {
      const hand = shuffled.hidden.orderHands[other] ?? [];
      const starting = box.splice(0, 1);
      box.push(...(hand.slice(0, 1) as typeof starting));
      shuffled.hidden.orderHands[other] = [...starting, ...hand.slice(1)];
    }
    shuffled.hidden.mainDeck = shuffle(shuffled.hidden.mainDeck, rng);
    shuffled.hidden.fireDeck = shuffle(shuffled.hidden.fireDeck, rng);
    for (const d of DISCIPLINES) shuffled.hidden.techDecks[d] = shuffle(shuffled.hidden.techDecks[d], rng);
    expect(shuffled.hidden.orderHands["p2"]).not.toEqual(state.hidden.orderHands["p2"]);
    expect(actorViewOf(shuffled, "p1")).toEqual(actorViewOf(state, "p1"));
    expect(projectPrivateView(shuffled, "p1", null)).toEqual(projectPrivateView(state, "p1", null));
  });
});

describe("after the Kiln and Main Order choice and the Round 1 start", () => {
  it("public state and every public event hide the Starting Orders; the Main Orders taken and the Kiln Die are public", () => {
    const table = LocalTable.newGame(65, 3, { flow: "halt", pass: ["setup_done"] });
    const projected = projectPublicState(table.state);
    const json = JSON.stringify(projected);
    expectOnlyDisplayedOrders(json, table.state);
    expectOnlyDisplayedTechs(json, table.state);
    expect(projected.kilnDie).toEqual(table.state.kilnDie);
    const taken = table.events.flatMap((event) => (event.type === "ORDER_RESERVED" && event.via === "setup" && event.orderId !== null ? [event.orderId] : []));
    expect(taken).toHaveLength(3);
    for (const playerId of table.state.playerOrder) {
      // Each player's taken Main Order is in their hand; its whereabouts are public.
      expect(taken.filter((orderId) => table.state.hidden.orderHands[playerId]?.includes(orderId))).toHaveLength(1);
    }
    const publicLog = JSON.stringify(table.events.map(projectEvent));
    // Displayed Orders (incl. ones revealed by the setup refills and taken since) and the takes.
    const revealed = table.events.flatMap((event) => (event.type === "DISPLAY_REFILLED" ? event.revealedOrderIds : []));
    expectOnlyDisplayedOrders(publicLog, table.state, [...taken, ...revealed]);
    for (const playerId of table.state.playerOrder) {
      for (const orderId of (table.state.hidden.orderHands[playerId] ?? []).filter((id) => !taken.includes(id))) {
        expect(publicLog).not.toContain(quoted(orderId));
      }
    }
    expect(table.events.map(projectEvent).some((event) => event.type === "KILN_DIE_ROLLED")).toBe(true);
    expect(projected.counts.orderHands).toEqual({ p1: 3, p2: 3, p3: 3 });
  });
});
