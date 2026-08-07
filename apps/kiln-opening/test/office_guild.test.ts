import { describe, expect, it } from "vitest";
import { TECHNIQUE_DEFINITIONS, applyAction, orderHandLimit } from "../src/game";
import {
  addFinished,
  expectError,
  mustApply,
  startedGame,
  workerId,
} from "./helpers";

describe("Market & Imperial Office", () => {
  it("gives an Apprentice 2 Coins and a Shifu 4 Coins", () => {
    for (const [kind, amount, seed] of [
      ["apprentice", 2, 300],
      ["shifu", 4, 301],
    ] as const) {
      const { state, rng } = startedGame(2, seed);
      const actorId = state.firstPlayerId;
      const next = mustApply(
        state,
        actorId,
        { type: "OFFICE_GAIN_COINS", workerId: workerId(state, actorId, kind) },
        rng,
      );
      expect(next.players[actorId]!.resources.coins).toBe(3 + amount);
    }
  });

  it("lets an Apprentice take one Order and refills its display position immediately", () => {
    const { state, rng } = startedGame(2, 302);
    const actorId = state.firstPlayerId;
    state.players[actorId]!.kilnId = "RU";
    const orderId = state.marketDisplay[0]!;
    const replacementId = state.marketDeck[0]!;
    const initialHandSize = state.players[actorId]!.orderHand.length;

    let next = mustApply(
      state,
      actorId,
      {
        type: "BEGIN_OFFICE_ORDERS",
        workerId: workerId(state, actorId, "apprentice"),
        mode: "take_one",
      },
      rng,
    );
    expect(next.phase.type).toBe("work_office_orders");
    next = mustApply(next, actorId, { type: "OFFICE_TAKE_ORDER", orderId }, rng);

    expect(next.players[actorId]!.orderHand).toContain(orderId);
    expect(next.players[actorId]!.orderHand).toHaveLength(initialHandSize + 1);
    expect(next.marketDisplay[0]).toBe(replacementId);
    expect(next.phase.type).toBe("work");
  });

  it("lets a Shifu take two sequentially, stop after one, or take one plus 2 Coins", () => {
    const two = startedGame(2, 303);
    const actorId = two.state.firstPlayerId;
    let state = mustApply(
      two.state,
      actorId,
      {
        type: "BEGIN_OFFICE_ORDERS",
        workerId: workerId(two.state, actorId, "shifu"),
        mode: "take_up_to_two",
      },
      two.rng,
    );
    const firstOrder = state.marketDisplay[0]!;
    const refillOrder = state.marketDeck[0]!;
    state = mustApply(state, actorId, { type: "OFFICE_TAKE_ORDER", orderId: firstOrder }, two.rng);
    expect(state.phase.type).toBe("work_office_orders");
    expect(state.marketDisplay).toContain(refillOrder);
    state = mustApply(state, actorId, { type: "OFFICE_TAKE_ORDER", orderId: refillOrder }, two.rng);
    expect(state.phase.type).toBe("work");
    expect(state.players[actorId]!.orderHand).toEqual(
      expect.arrayContaining([firstOrder, refillOrder]),
    );

    const stop = startedGame(2, 304);
    const stopActor = stop.state.firstPlayerId;
    let stopState = mustApply(
      stop.state,
      stopActor,
      {
        type: "BEGIN_OFFICE_ORDERS",
        workerId: workerId(stop.state, stopActor, "shifu"),
        mode: "take_up_to_two",
      },
      stop.rng,
    );
    stopState = mustApply(
      stopState,
      stopActor,
      { type: "OFFICE_TAKE_ORDER", orderId: stopState.imperialDisplay[0]! },
      stop.rng,
    );
    stopState = mustApply(stopState, stopActor, { type: "OFFICE_END_ORDERS" }, stop.rng);
    expect(stopState.phase.type).toBe("work");

    const bonus = startedGame(2, 305);
    const bonusActor = bonus.state.firstPlayerId;
    const coinsBefore = bonus.state.players[bonusActor]!.resources.coins;
    let bonusState = mustApply(
      bonus.state,
      bonusActor,
      {
        type: "BEGIN_OFFICE_ORDERS",
        workerId: workerId(bonus.state, bonusActor, "shifu"),
        mode: "take_one_and_gain_two_coins",
      },
      bonus.rng,
    );
    bonusState = mustApply(
      bonusState,
      bonusActor,
      { type: "OFFICE_TAKE_ORDER", orderId: bonusState.marketDisplay[0]! },
      bonus.rng,
    );
    expect(bonusState.players[bonusActor]!.resources.coins).toBe(coinsBefore + 2);
  });

  it("enforces the normal 3-Order hand limit and Guan's limit of 4", () => {
    const normal = startedGame(2, 306);
    const actorId = normal.state.firstPlayerId;
    normal.state.players[actorId]!.kilnId = "RU";
    normal.state.players[actorId]!.orderHand = ["M01", "M02", "M03"];
    expect(orderHandLimit(normal.state.players[actorId]!)).toBe(3);
    const rejected = applyAction(
      normal.state,
      actorId,
      {
        type: "BEGIN_OFFICE_ORDERS",
        workerId: workerId(normal.state, actorId, "apprentice"),
        mode: "take_one",
      },
      normal.rng,
    );
    expectError(rejected, "ORDER_HAND_LIMIT");

    const guan = startedGame(2, 307);
    const guanActor = guan.state.firstPlayerId;
    guan.state.players[guanActor]!.kilnId = "GU";
    guan.state.players[guanActor]!.orderHand = ["M01", "M02", "M03"];
    expect(orderHandLimit(guan.state.players[guanActor]!)).toBe(4);
    let accepted = mustApply(
      guan.state,
      guanActor,
      {
        type: "BEGIN_OFFICE_ORDERS",
        workerId: workerId(guan.state, guanActor, "apprentice"),
        mode: "take_one",
      },
      guan.rng,
    );
    accepted = mustApply(
      accepted,
      guanActor,
      { type: "OFFICE_TAKE_ORDER", orderId: accepted.imperialDisplay[0]! },
      guan.rng,
    );
    expect(accepted.players[guanActor]!.orderHand).toHaveLength(4);
  });

  it("sells only Finished Flawed ceramics, with Apprentice and Shifu limits", () => {
    const apprentice = startedGame(2, 308);
    const actorId = apprentice.state.firstPlayerId;
    const first = addFinished(apprentice.state, actorId, "bowl", "flawed");
    const second = addFinished(apprentice.state, actorId, "plate", "flawed");
    const third = addFinished(apprentice.state, actorId, "washer", "flawed");
    const overLimit = applyAction(
      apprentice.state,
      actorId,
      {
        type: "OFFICE_SELL_FLAWED",
        workerId: workerId(apprentice.state, actorId, "apprentice"),
        ceramicIds: [first.id, second.id, third.id],
      },
      apprentice.rng,
    );
    expectError(overLimit, "INVALID_SELECTION");

    const sold = mustApply(
      apprentice.state,
      actorId,
      {
        type: "OFFICE_SELL_FLAWED",
        workerId: workerId(apprentice.state, actorId, "apprentice"),
        ceramicIds: [first.id, second.id],
      },
      apprentice.rng,
    );
    expect(sold.players[actorId]!.resources.coins).toBe(5);
    expect(sold.ceramics[first.id]!.stage).toBe("sold");
    expect(sold.vesselSupply.bowl).toHaveLength(8);

    const shifu = startedGame(2, 309);
    const shifuActor = shifu.state.firstPlayerId;
    const flawed = [
      addFinished(shifu.state, shifuActor, "bowl", "flawed"),
      addFinished(shifu.state, shifuActor, "plate", "flawed"),
      addFinished(shifu.state, shifuActor, "washer", "flawed"),
    ];
    const allSold = mustApply(
      shifu.state,
      shifuActor,
      {
        type: "OFFICE_SELL_FLAWED",
        workerId: workerId(shifu.state, shifuActor, "shifu"),
        ceramicIds: flawed.map((ceramic) => ceramic.id),
      },
      shifu.rng,
    );
    expect(allSold.players[shifuActor]!.resources.coins).toBe(6);

    const wrongQuality = startedGame(2, 310);
    const wrongActor = wrongQuality.state.firstPlayerId;
    const fine = addFinished(wrongQuality.state, wrongActor, "vase", "fine");
    const rejected = applyAction(
      wrongQuality.state,
      wrongActor,
      {
        type: "OFFICE_SELL_FLAWED",
        workerId: workerId(wrongQuality.state, wrongActor, "shifu"),
        ceramicIds: [fine.id],
      },
      wrongQuality.rng,
    );
    expectError(rejected, "ILLEGAL_CERAMIC_STAGE");
  });
});

describe("Guild & Academy", () => {
  it("charges an Apprentice printed cost, acquires one tile, and refills its discipline", () => {
    const { state, rng } = startedGame(2, 320);
    const actorId = state.firstPlayerId;
    const techniqueId = [
      ...state.techniqueDisplay.forming,
      ...state.techniqueDisplay.glazing,
      ...state.techniqueDisplay.firing,
    ].find((id) => TECHNIQUE_DEFINITIONS[id]!.cost <= 3)!;
    const definition = TECHNIQUE_DEFINITIONS[techniqueId]!;
    const displayBefore = [...state.techniqueDisplay[definition.discipline]];

    let next = mustApply(
      state,
      actorId,
      { type: "BEGIN_GUILD_ACTION", workerId: workerId(state, actorId, "apprentice") },
      rng,
    );
    expect(next.phase).toEqual(
      expect.objectContaining({ type: "work_guild", step: "buy", actorId }),
    );
    next = mustApply(next, actorId, { type: "GUILD_BUY_TECHNIQUE", techniqueId }, rng);
    expect(next.players[actorId]!.resources.coins).toBe(3 - definition.cost);
    expect(next.players[actorId]!.techniques).toContainEqual({ id: techniqueId, exhausted: false });
    expect(next.techniqueDisplay[definition.discipline]).toHaveLength(displayBefore.length);
    expect(next.techniqueDisplay[definition.discipline]).not.toContain(techniqueId);
  });

  it("lets a Shifu refresh before choosing and applies the 1-Coin discount to minimum 1", () => {
    const { state, rng } = startedGame(2, 321);
    const actorId = state.firstPlayerId;
    let next = mustApply(
      state,
      actorId,
      { type: "BEGIN_GUILD_ACTION", workerId: workerId(state, actorId, "shifu") },
      rng,
    );
    const refreshedId = next.techniqueDisplay.forming[0]!;
    next = mustApply(
      next,
      actorId,
      { type: "GUILD_REFRESH_TECHNIQUE", techniqueId: refreshedId },
      rng,
    );
    expect(next.phase).toEqual(expect.objectContaining({ type: "work_guild", step: "buy" }));

    const techniqueId = [
      ...next.techniqueDisplay.forming,
      ...next.techniqueDisplay.glazing,
      ...next.techniqueDisplay.firing,
    ].find((id) => Math.max(1, TECHNIQUE_DEFINITIONS[id]!.cost - 1) <= 3)!;
    const expectedCost = Math.max(1, TECHNIQUE_DEFINITIONS[techniqueId]!.cost - 1);
    next = mustApply(next, actorId, { type: "GUILD_BUY_TECHNIQUE", techniqueId }, rng);
    expect(next.players[actorId]!.resources.coins).toBe(3 - expectedCost);
  });

  it("enforces the two-Technique limit and affordability", () => {
    const full = startedGame(2, 322);
    const actorId = full.state.firstPlayerId;
    full.state.players[actorId]!.techniques = [
      { id: "T01", exhausted: false },
      { id: "T05", exhausted: false },
    ];
    const limited = applyAction(
      full.state,
      actorId,
      { type: "BEGIN_GUILD_ACTION", workerId: workerId(full.state, actorId, "apprentice") },
      full.rng,
    );
    expectError(limited, "TECHNIQUE_LIMIT");

    const poor = startedGame(2, 323);
    const poorActor = poor.state.firstPlayerId;
    poor.state.players[poorActor]!.resources.coins = 0;
    const unaffordable = applyAction(
      poor.state,
      poorActor,
      { type: "BEGIN_GUILD_ACTION", workerId: workerId(poor.state, poorActor, "shifu") },
      poor.rng,
    );
    expectError(unaffordable, "INSUFFICIENT_RESOURCES");
  });
});
