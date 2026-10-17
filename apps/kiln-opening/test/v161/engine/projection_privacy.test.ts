/**
 * The hidden-information boundary (DESIGN §4.3), on states built with `buildState` only.
 * P2, P4 and P5 own `privacy_setup`, `privacy_guild` and `privacy_contributions`.
 */

import { describe, expect, it } from "vitest";
import { InvariantError } from "../../../src/game/errors.ts";
import {
  actorViewOf,
  eventForViewer,
  projectEvent,
  projectPrivateView,
  projectPublicState,
  publicCounts,
  viewOf,
} from "../../../src/game/view.ts";
import type { FiringContext, GameEvent, GameState, OrderId, PrivateFiringState, TechId } from "../../../src/game/types.ts";
import { buildState } from "./support/fixtures.ts";

function firingContext(overrides: Partial<FiringContext> = {}): FiringContext {
  return {
    round: 2,
    kilnDie: 2,
    participantIds: ["p1", "p2"],
    firingPlayerIds: ["p1", "p2"],
    contributionWindowId: "test-game:r2:contributions",
    contributions: null,
    unclampedBaseHeat: null,
    baseHeat: null,
    testPieces: [],
    fireModifier: null,
    globalHeat: null,
    ceramics: {},
    pendingExtraFire: null,
    ...overrides,
  };
}

/** A mid-game state with something secret in every hidden zone. */
function secretRichState(): GameState {
  const state = buildState({
    players: [
      { hand: ["S01", "S02", "O10"], techs: ["T01", "T13"] },
      { hand: ["S05", "O11", "O12", "O13"], techs: ["T22"] },
      { hand: [] },
    ],
    round: 2,
    mainDiscard: ["O20", "O21"],
    pendingLook: { kind: "commission_market", playerId: "p2", orderIds: ["O30", "O31", "O32"] },
    firePeeks: { p1: { playerId: "p1", round: 2, modifier: 2, buried: null } },
    fireDiscard: [-1],
    phase: { type: "firing_test_pieces", queue: { actorIds: ["p1"], index: 0 }, awaiting: "bury" },
    firing: firingContext({
      contributions: { p1: { card: "STOKE", fuelLedger: false, heat: 1, woodPaid: 1 }, p2: { card: "TEND", fuelLedger: false, heat: 0, woodPaid: 0 } },
      unclampedBaseHeat: 3,
      baseHeat: 3,
      testPieces: [{ playerId: "p1", peeked: true, buried: false }],
    }),
    ceramics: [
      { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1", heatMarker: { source: "own", faceDown: true } },
      { owner: "p2", stage: "finished", shape: "vase", glaze: "celadon", quality: "fine", crackle: true },
    ],
  });
  // A completed Order is public (L410).
  state.hidden.mainDeck = state.hidden.mainDeck.filter((id) => id !== "O40");
  state.players["p3"]!.completedOrders.push({
    orderId: "O40",
    ceramicIds: [],
    round: 1,
    canalBargeCoins: 0,
    vp: 15,
    coins: 0,
    printedCrowns: 2,
    bonusCrowns: 0,
    crackleDeclarations: [],
    kilnAbility: null,
  });
  return state;
}

function idsIn(json: string, pattern: RegExp): Set<string> {
  return new Set([...json.matchAll(pattern)].map((match) => match[1] as string));
}

describe("projectPublicState", () => {
  it("drops `hidden` wholesale and adds public counts", () => {
    const state = secretRichState();
    const projected = projectPublicState(state);
    expect("hidden" in projected).toBe(false);
    expect(projected.counts).toEqual({
      orderHands: { p1: 3, p2: 4, p3: 0 },
      mainDeck: state.hidden.mainDeck.length,
      mainDiscard: 2,
      techDecks: { workshop: 3, glazing_loading: 3, firing: 3 },
      fireDeck: 11,
      fireBuried: 0,
      pendingLook: { playerId: "p2", kind: "commission_market", count: 3 },
    });
    expect(publicCounts(state)).toEqual(projected.counts);
  });

  it("contains no Order ID other than the display and completed records (§4.3)", () => {
    const state = secretRichState();
    const json = JSON.stringify(projectPublicState(state));
    const allowed = new Set<OrderId>([
      ...state.market.display.filter((id): id is OrderId => id !== null),
      "O40",
    ]);
    const seen = idsIn(json, /"([SO]\d{2})"/g);
    expect([...seen].filter((id) => !allowed.has(id as OrderId))).toEqual([]);
    // The secrets really are in the authoritative state.
    expect(JSON.stringify(state)).toContain('"O31"');
    expect(JSON.stringify(state)).toContain('"S05"');
  });

  it("contains no Tech ID other than those displayed or owned (§4.3)", () => {
    const state = secretRichState();
    const json = JSON.stringify(projectPublicState(state));
    const allowed = new Set<TechId>([
      ...state.techDisplay.workshop,
      ...state.techDisplay.glazing_loading,
      ...state.techDisplay.firing,
      "T01",
      "T13",
      "T22",
    ]);
    const seen = idsIn(json, /"(T\d{2})"/g);
    expect(seen.size).toBeGreaterThan(0);
    expect([...seen].filter((id) => !allowed.has(id as TechId))).toEqual([]);
  });

  it("contains no hidden Fire values: no deck order and no private peek", () => {
    const state = secretRichState();
    const projected = projectPublicState(state);
    const json = JSON.stringify(projected);
    expect(json).not.toContain("firePeeks");
    expect(json).not.toContain('"fireDeck":[');
    expect(projected.counts.fireDeck).toBe(11);
    expect(projected.fireDiscard).toEqual([-1]);
    expect(projected.firing?.testPieces).toEqual([{ playerId: "p1", peeked: true, buried: false }]);
  });

  it("keeps every ceramic attribute public, including face-down markers and Crackle (L508)", () => {
    const projected = projectPublicState(secretRichState());
    expect(projected.ceramics["c1"]).toMatchObject({ stage: "loaded", heatMarker: { source: "own", faceDown: true } });
    expect(projected.ceramics["c2"]).toMatchObject({ crackle: true, quality: "fine" });
    expect(projected.players["p1"]?.resources).toBeDefined();
  });

  it("never aliases the authoritative state", () => {
    const state = secretRichState();
    const before = structuredClone(state);
    const projected = projectPublicState(state);
    projected.players["p1"]!.resources.coins = 99;
    projected.market.display[0] = null;
    projected.ceramics["c1"]!.ownerId = "p3";
    expect(state).toEqual(before);
  });

  it("names whose Guild inspection is pending, its discipline count, never the Techs", () => {
    const state = buildState({
      pendingLook: { kind: "guild_inspection", playerId: "p1", discipline: "firing", techIds: ["T24", "T25"] },
      techDisplay: { firing: ["T11", "T12"] },
    });
    const projected = projectPublicState(state);
    expect(projected.counts.pendingLook).toEqual({ playerId: "p1", kind: "guild_inspection", count: 2 });
    const json = JSON.stringify(projected);
    expect(json).not.toContain('"T24"');
    expect(json).not.toContain('"T25"');
  });

  it("throws if revealed Contributions are in public state while the window is open", () => {
    const state = buildState({
      phase: { type: "firing_contributions", windowId: "w", eligiblePlayerIds: ["p1", "p2"], submittedPlayerIds: ["p1"] },
      firing: firingContext({ contributionWindowId: "w", contributions: { p1: { card: "BANK", fuelLedger: true, heat: -2, woodPaid: 2 } } }),
    });
    expect(() => projectPublicState(state)).toThrow(InvariantError);
    state.firing!.contributions = null;
    expect(() => projectPublicState(state)).not.toThrow();
  });
});

describe("private views", () => {
  it("give each seat only its own hand, look and peek", () => {
    const state = secretRichState();
    expect(projectPrivateView(state, "p1", null)).toEqual({
      playerId: "p1",
      orderHand: ["S01", "S02", "O10"],
      pendingLook: null,
      firePeek: { playerId: "p1", round: 2, modifier: 2, buried: null },
      pendingContribution: null,
    });
    expect(projectPrivateView(state, "p2", null)).toEqual({
      playerId: "p2",
      orderHand: ["S05", "O11", "O12", "O13"],
      pendingLook: { kind: "commission_market", playerId: "p2", orderIds: ["O30", "O31", "O32"] },
      firePeek: null,
      pendingContribution: null,
    });
    expect(projectPrivateView(state, "p3", null).orderHand).toEqual([]);
    expect(() => projectPrivateView(state, "p9", null)).toThrow(InvariantError);
  });

  it("returns a seat's own sealed Contribution with its window, and nobody else's", () => {
    const state = buildState({
      phase: { type: "firing_contributions", windowId: "test-game:r1:contributions", eligiblePlayerIds: ["p1", "p2"], submittedPlayerIds: ["p1"] },
      firing: firingContext({ round: 1, contributionWindowId: "test-game:r1:contributions" }),
    });
    const sealed: PrivateFiringState = {
      gameId: "test-game",
      windowId: "test-game:r1:contributions",
      submissions: { p1: { card: "BANK", fuelLedger: true } },
    };
    expect(projectPrivateView(state, "p1", sealed).pendingContribution).toEqual({
      card: "BANK",
      fuelLedger: true,
      windowId: "test-game:r1:contributions",
    });
    expect(projectPrivateView(state, "p2", sealed).pendingContribution).toBeNull();
    expect(projectPrivateView(state, "p1", null).pendingContribution).toBeNull();
    expect(projectPrivateView(state, "p1", { ...sealed, gameId: "other-game" }).pendingContribution).toBeNull();
    // Only the open window's sealed card: a stale window or no open window shows nothing.
    expect(projectPrivateView(state, "p1", { ...sealed, windowId: "test-game:r0:contributions" }).pendingContribution).toBeNull();
    expect(projectPrivateView(buildState(), "p1", { ...sealed, windowId: "test-game:r0:contributions" }).pendingContribution).toBeNull();
    expect(projectPrivateView(buildState(), "p1", sealed).pendingContribution).toBeNull();
    // The sealed card never reaches public state.
    const json = JSON.stringify(projectPublicState(state));
    expect(json).not.toContain("BANK");
    expect(json).not.toContain("fuelLedger");
  });

  it("viewOf composes public and private parts; spectators and unseated IDs get no private data", () => {
    const state = secretRichState();
    const p2 = viewOf(state, "p2");
    expect(p2.viewerId).toBe("p2");
    expect(p2.own?.orderHand).toEqual(["S05", "O11", "O12", "O13"]);
    expect(p2.game).toEqual(projectPublicState(state));
    expect(viewOf(state, null)).toEqual({ viewerId: null, game: projectPublicState(state), own: null });
    expect(viewOf(state, "p9").own).toBeNull();
  });

  it("actorViewOf requires a seated actor", () => {
    const state = secretRichState();
    expect(actorViewOf(state, "p3").own.playerId).toBe("p3");
    expect(() => actorViewOf(state, "p9")).toThrow(InvariantError);
    expect(() => actorViewOf(state, "__proto__")).toThrow(InvariantError);
  });
});

describe("events (DESIGN §4.4)", () => {
  const secretEvents: GameEvent[] = [
    { type: "ORDERS_DEALT", playerId: "p1", startingCount: 2, mainCount: 1, secret: { visibleTo: "p1", startingOrderIds: ["S01", "S02"], mainOrderIds: ["O10"] } },
    { type: "ORDER_RESERVED", playerId: "p2", via: "commission_market", source: "looked", slotIndex: null, orderId: null, secret: { visibleTo: "p2", orderId: "O31" } },
    { type: "ORDER_RESERVED", playerId: "p2", via: "canal_wharf", source: "deck_top", slotIndex: null, orderId: null, secret: { visibleTo: "p2", orderId: "O33" } },
    { type: "PRIVATE_LOOK_OPENED", playerId: "p2", kind: "commission_market", discipline: null, count: 3, secret: { visibleTo: "p2", orderIds: ["O30", "O31", "O32"], techIds: [] } },
    { type: "LOOKED_ORDERS_TO_BOTTOM", playerId: "p2", count: 2, secret: { visibleTo: "p2", orderIds: ["O30", "O32"] } },
    { type: "HELD_ORDER_DISCARDED", playerId: "p2", cause: "colour_samples_swap", to: "main_discard", secret: { visibleTo: "p2", orderId: "O34" } },
    { type: "PRIVATE_LOOK_OPENED", playerId: "p2", kind: "colour_samples_swap", discipline: null, count: 2, secret: { visibleTo: "p2", orderIds: ["O35", "O36"], techIds: [] } },
    { type: "ORDER_RESERVED", playerId: "p2", via: "colour_samples_swap", source: "looked", slotIndex: null, orderId: null, secret: { visibleTo: "p2", orderId: "O35" } },
    { type: "TECHS_RETURNED_TO_BOTTOM", playerId: "p1", discipline: "firing", count: 2, secret: { visibleTo: "p1", techIds: ["T25", "T24"] } },
    { type: "TEST_PIECES_PEEKED", playerId: "p1", secret: { visibleTo: "p1", modifier: 2 } },
    { type: "HAND_TRIMMED", playerId: "p2", count: 1, secret: { visibleTo: "p2", orderIds: ["O13"] } },
  ];

  it.each(secretEvents.map((event) => [event.type, event] as const))("projectEvent removes the secret of %s", (_type, event) => {
    const projected = projectEvent(event);
    expect("secret" in projected).toBe(false);
    const { secret: _secret, ...publicPart } = event as GameEvent & { secret: unknown };
    expect(projected).toEqual(publicPart);
  });

  it("eventForViewer keeps the secret only for its visibleTo seat", () => {
    for (const event of secretEvents) {
      const owner = (event as { secret: { visibleTo: string } }).secret.visibleTo;
      const other = owner === "p1" ? "p2" : "p1";
      expect(eventForViewer(event, owner)).toEqual(event);
      expect("secret" in eventForViewer(event, other)).toBe(false);
      expect("secret" in eventForViewer(event, null)).toBe(false);
    }
  });

  it("leaves public events whole, without aliasing", () => {
    const event: GameEvent = {
      type: "ORDER_RESERVED",
      playerId: "p1",
      via: "commission_market",
      source: "face_up",
      slotIndex: 2,
      orderId: "O03",
    };
    const contributions: GameEvent = {
      type: "CONTRIBUTIONS_REVEALED",
      windowId: "w",
      contributions: { p1: { card: "STOKE", fuelLedger: true, heat: 2, woodPaid: 2 } },
    };
    expect(projectEvent(event)).toEqual(event);
    const projected = projectEvent(contributions) as Extract<GameEvent, { type: "CONTRIBUTIONS_REVEALED" }>;
    expect(projected).toEqual(contributions);
    projected.contributions["p1"]!.heat = -2;
    expect((contributions as typeof projected).contributions["p1"]?.heat).toBe(2);
  });

  it("a Contribution submission event never carries the card", () => {
    const event: GameEvent = { type: "CONTRIBUTION_SUBMITTED", playerId: "p1", windowId: "w" };
    expect(Object.keys(projectEvent(event)).sort()).toEqual(["playerId", "type", "windowId"]);
  });
});
