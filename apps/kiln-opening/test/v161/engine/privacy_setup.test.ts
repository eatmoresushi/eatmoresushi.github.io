/**
 * Hidden information at setup (P2): the secret deal (L101, L201, L507), the Starting box
 * (L102), deck orders and Tech decks never reach the public projection or public events;
 * each seat sees only its own hand (DESIGN §4.2–4.4, §8.2 "Secret deal of 2 Starting + 1
 * Main").
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

/** Order IDs a public reader may see: the display only (nothing is completed at setup). */
function expectOnlyDisplayedOrders(json: string, game: PublicGameState | GameState): void {
  const shown = new Set<OrderId>(game.market.display.filter((id): id is OrderId => id !== null));
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
      orderHands: Object.fromEntries(state.playerOrder.map((id) => [id, 3])),
      mainDeck: 48 - n - 6,
      mainDiscard: 0,
      techDecks: { workshop: 4, glazing_loading: 4, firing: 4 },
      fireDeck: 12,
      fireBuried: 0,
      pendingLook: null,
    });
  });
});

describe("creation events", () => {
  it("ORDERS_DEALT shows the counts publicly and the cards only to their owner", () => {
    const { state, events } = newState(61, 3);
    const dealt = events.filter((event): event is Extract<GameEvent, { type: "ORDERS_DEALT" }> => event.type === "ORDERS_DEALT");
    expect(dealt.map((event) => event.playerId)).toEqual(["p1", "p2", "p3"]);
    for (const event of dealt) {
      expect(projectEvent(event)).toEqual({ type: "ORDERS_DEALT", playerId: event.playerId, startingCount: 2, mainCount: 1 });
      expect(eventForViewer(event, event.playerId)).toEqual(event);
      const hand = state.hidden.orderHands[event.playerId] ?? [];
      expect([...event.secret.startingOrderIds, ...event.secret.mainOrderIds]).toEqual(hand);
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
    // Swap p2's and p3's hands with Starting / Main cards of equal counts from the box and deck.
    const box = shuffled.hidden.startingBox;
    const deck = shuffled.hidden.mainDeck;
    for (const other of ["p2", "p3"] as PlayerId[]) {
      const hand = shuffled.hidden.orderHands[other] ?? [];
      const starting = box.splice(0, 2);
      const main = deck.splice(0, 1);
      box.push(...(hand.slice(0, 2) as typeof starting));
      deck.push(...(hand.slice(2) as typeof main));
      shuffled.hidden.orderHands[other] = [...starting, ...main];
    }
    shuffled.hidden.mainDeck = shuffle(deck, rng);
    shuffled.hidden.fireDeck = shuffle(shuffled.hidden.fireDeck, rng);
    for (const d of DISCIPLINES) shuffled.hidden.techDecks[d] = shuffle(shuffled.hidden.techDecks[d], rng);
    expect(shuffled.hidden.orderHands["p2"]).not.toEqual(state.hidden.orderHands["p2"]);
    expect(actorViewOf(shuffled, "p1")).toEqual(actorViewOf(state, "p1"));
    expect(projectPrivateView(shuffled, "p1", null)).toEqual(projectPrivateView(state, "p1", null));
  });
});

describe("after Kiln selection and the Round 1 start", () => {
  it("public state and every public event still hide the hands; the Kiln Die is public", () => {
    const table = LocalTable.newGame(65, 3, { flow: "halt", pass: ["setup_done"] });
    const projected = projectPublicState(table.state);
    const json = JSON.stringify(projected);
    expectOnlyDisplayedOrders(json, table.state);
    expectOnlyDisplayedTechs(json, table.state);
    expect(projected.kilnDie).toEqual(table.state.kilnDie);
    const publicLog = JSON.stringify(table.events.map(projectEvent));
    expectOnlyDisplayedOrders(publicLog, table.state);
    expect(table.events.map(projectEvent).some((event) => event.type === "KILN_DIE_ROLLED")).toBe(true);
    expect(projected.counts.orderHands).toEqual({ p1: 3, p2: 3, p3: 3 });
  });
});
