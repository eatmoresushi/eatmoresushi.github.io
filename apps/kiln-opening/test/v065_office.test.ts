import { describe, expect, it } from "vitest";
import { applyAction } from "../src/game";
import type { GameState, PlayerId } from "../src/game";
import { expectError, mustApply, startedGame, workerId } from "./helpers";

function recordImperialCompletion(state: GameState, playerId: PlayerId): void {
  state.players[playerId]!.completedOrders.push({
    orderId: "I01",
    ceramicIds: [],
    completedInRound: state.round,
    vpAwarded: 0,
    coinsAwarded: 0,
    usedGuanWaiver: false,
  });
}

describe("V0.6.5 blind Office acquisitions", () => {
  it.each(["market", "imperial"] as const)(
    "lets an Apprentice commit to the actual blind %s top card without changing its display",
    (deck) => {
      const { state, rng } = startedGame(2, deck === "market" ? 6501 : 6502);
      const actorId = state.firstPlayerId;
      const expected = (deck === "market" ? state.marketDeck : state.imperialDeck)[0]!;
      const displayBefore = [...(deck === "market" ? state.marketDisplay : state.imperialDisplay)];
      let next = mustApply(state, actorId, {
        type: "BEGIN_OFFICE_ORDERS",
        workerId: workerId(state, actorId, "apprentice"),
        mode: "take_one",
      }, rng);
      next = mustApply(next, actorId, { type: "OFFICE_DRAW_BLIND_ORDER", deck }, rng);
      expect(next.players[actorId]!.orderHand).toContain(expected);
      expect(deck === "market" ? next.marketDisplay : next.imperialDisplay).toEqual(displayBefore);
      expect(next.phase.type).toBe("work_office_sale");
    },
  );

  it("lets a Shifu mix a face-up Market pick and a blind Imperial draw", () => {
    const { state, rng } = startedGame(2, 6503);
    const actorId = state.firstPlayerId;
    const faceUp = state.marketDisplay[0]!;
    const marketReplacement = state.marketDeck[0]!;
    const blindImperial = state.imperialDeck[0]!;
    const imperialDisplayBefore = [...state.imperialDisplay];
    let next = mustApply(state, actorId, {
      type: "BEGIN_OFFICE_ORDERS",
      workerId: workerId(state, actorId, "shifu"),
      mode: "take_up_to_two",
    }, rng);
    next = mustApply(next, actorId, { type: "OFFICE_TAKE_ORDER", orderId: faceUp }, rng);
    expect(next.marketDisplay).toContain(marketReplacement);
    next = mustApply(next, actorId, { type: "OFFICE_DRAW_BLIND_ORDER", deck: "imperial" }, rng);
    expect(next.players[actorId]!.orderHand).toEqual(expect.arrayContaining([faceUp, blindImperial]));
    expect(next.imperialDisplay).toEqual(imperialDisplayBefore);
  });

  it("checks the hand limit before each acquisition and rejects an empty blind source safely", () => {
    const full = startedGame(2, 6504);
    const actorId = full.state.firstPlayerId;
    full.state.players[actorId]!.kilnId = "RU";
    full.state.players[actorId]!.orderHand = full.state.marketDeck.splice(0, 2);
    let next = mustApply(full.state, actorId, {
      type: "BEGIN_OFFICE_ORDERS",
      workerId: workerId(full.state, actorId, "shifu"),
      mode: "take_up_to_two",
    }, full.rng);
    next = mustApply(next, actorId, { type: "OFFICE_DRAW_BLIND_ORDER", deck: "market" }, full.rng);
    expectError(
      applyAction(next, actorId, { type: "OFFICE_DRAW_BLIND_ORDER", deck: "imperial" }, full.rng),
      "ORDER_HAND_LIMIT",
    );

    const empty = startedGame(2, 6505);
    const emptyActor = empty.state.firstPlayerId;
    empty.state.marketDeck = [];
    let emptyPhase = mustApply(empty.state, emptyActor, {
      type: "BEGIN_OFFICE_ORDERS",
      workerId: workerId(empty.state, emptyActor, "apprentice"),
      mode: "take_one",
    }, empty.rng);
    const revision = emptyPhase.revision;
    expectError(
      applyAction(emptyPhase, emptyActor, { type: "OFFICE_DRAW_BLIND_ORDER", deck: "market" }, empty.rng),
      "ORDER_NOT_AVAILABLE",
    );
    expect(emptyPhase.revision).toBe(revision);
  });
});

describe("V0.6.5 Colour Samples timing", () => {
  it("refreshes either display before the first pick, bottoms the target, then may draw elsewhere", () => {
    const { state, rng } = startedGame(2, 6510);
    const actorId = state.firstPlayerId;
    state.players[actorId]!.techniques.push({ id: "T08", exhausted: false });
    const bottomed = state.imperialDisplay[0]!;
    const replacement = state.imperialDeck[0]!;
    const blindMarket = state.marketDeck[0]!;
    let next = mustApply(state, actorId, {
      type: "BEGIN_OFFICE_ORDERS",
      workerId: workerId(state, actorId, "shifu"),
      mode: "take_up_to_two",
    }, rng);
    expect(next.phase).toEqual(expect.objectContaining({ step: "colour_samples_or_skip" }));
    next = mustApply(next, actorId, { type: "OFFICE_USE_COLOUR_SAMPLES", orderId: bottomed }, rng);
    expect(next.imperialDisplay).toContain(replacement);
    expect(next.imperialDeck.at(-1)).toBe(bottomed);
    expect(next.imperialDiscard).not.toContain(bottomed);
    next = mustApply(next, actorId, { type: "OFFICE_DRAW_BLIND_ORDER", deck: "market" }, rng);
    expect(next.players[actorId]!.orderHand).toContain(blindMarket);
    expectError(
      applyAction(next, actorId, { type: "OFFICE_USE_COLOUR_SAMPLES", orderId: replacement }, rng),
      "INVALID_ACTION",
    );
  });
});

describe("V0.6.5 Court Patronage", () => {
  it("rejects Apprentices, holdings, Market-only history, insufficient Coins, and Progress 4-5", () => {
    const apprentice = startedGame(2, 6520);
    const apprenticeActor = apprentice.state.firstPlayerId;
    recordImperialCompletion(apprentice.state, apprenticeActor);
    apprentice.state.players[apprenticeActor]!.resources.coins = 10;
    expectError(applyAction(apprentice.state, apprenticeActor, {
      type: "USE_COURT_PATRONAGE",
      workerId: workerId(apprentice.state, apprenticeActor, "apprentice"),
    }, apprentice.rng), "INVALID_ACTION");

    const locked = startedGame(2, 6521);
    const lockedActor = locked.state.firstPlayerId;
    locked.state.players[lockedActor]!.resources.coins = 10;
    locked.state.players[lockedActor]!.orderHand.push("I01");
    locked.state.players[lockedActor]!.completedOrders.push({
      orderId: "M01", ceramicIds: [], completedInRound: 1, vpAwarded: 0, coinsAwarded: 0, usedGuanWaiver: false,
    });
    expectError(applyAction(locked.state, lockedActor, {
      type: "USE_COURT_PATRONAGE",
      workerId: workerId(locked.state, lockedActor, "shifu"),
    }, locked.rng), "INVALID_ACTION");

    for (const progress of [4, 5] as const) {
      const capped = startedGame(2, 6530 + progress);
      const actorId = capped.state.firstPlayerId;
      recordImperialCompletion(capped.state, actorId);
      capped.state.players[actorId]!.resources.coins = 10;
      capped.state.players[actorId]!.imperialProgress = progress;
      expectError(applyAction(capped.state, actorId, {
        type: "USE_COURT_PATRONAGE",
        workerId: workerId(capped.state, actorId, "shifu"),
      }, capped.rng), "INVALID_ACTION");
    }
  });

  it.each([[0, 1], [2, 3]] as const)(
    "pays exactly 5 Coins, advances %s to %s, crosses its milestone, and ends without a sale",
    (from, to) => {
      const { state, rng } = startedGame(2, 6540 + from);
      const actorId = state.firstPlayerId;
      recordImperialCompletion(state, actorId);
      state.players[actorId]!.resources.coins = 8;
      state.players[actorId]!.imperialProgress = from;
      const result = applyAction(state, actorId, {
        type: "USE_COURT_PATRONAGE",
        workerId: workerId(state, actorId, "shifu"),
      }, rng);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);
      expect(result.state.players[actorId]!.resources.coins).toBe(3);
      expect(result.state.players[actorId]!.imperialProgress).toBe(to);
      expect(result.state.players[actorId]!.pendingApprenticeUnlocks).toBe(1);
      expect(result.state.phase.type).not.toBe("work_office_sale");
      expect(result.state.imperialSealOwnerId).toBeNull();
      expect(result.events).toContainEqual({
        type: "COURT_PATRONAGE_USED", playerId: actorId, cost: 5, from, to,
      });
      expect(result.state.players[actorId]!.completedOrders.some(({ orderId }) => orderId === "I01")).toBe(true);
      expect(JSON.parse(JSON.stringify(result.state)).players[actorId].completedOrders).toHaveLength(1);
    },
  );
});
