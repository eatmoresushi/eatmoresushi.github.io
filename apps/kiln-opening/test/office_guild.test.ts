import { describe, expect, it } from "vitest";
import { TECHNIQUE_DEFINITIONS, applyAction, orderHandLimit } from "../src/game";
import type { GameState, PlayerId, SeededRandom, WorkerKind } from "../src/game";
import {
  addFinished,
  expectError,
  mustApply,
  setActive,
  startedGame,
  workerId,
} from "./helpers";

function beginCoinOfficeSale(
  state: GameState,
  actorId: PlayerId,
  kind: WorkerKind,
  rng: SeededRandom,
): GameState {
  return mustApply(
    state,
    actorId,
    { type: "OFFICE_GAIN_COINS", workerId: workerId(state, actorId, kind) },
    rng,
  );
}

function resolveOfficeSale(
  state: GameState,
  actorId: PlayerId,
  ceramicIds: string[],
  rng: SeededRandom,
): GameState {
  return mustApply(state, actorId, { type: "OFFICE_RESOLVE_FLAWED_SALE", ceramicIds }, rng);
}

describe("Market & Imperial Office", () => {
  it("gives an Apprentice 2 Coins and a Shifu 4 Coins before an optional empty sale", () => {
    for (const [kind, amount, seed] of [
      ["apprentice", 2, 300],
      ["shifu", 4, 301],
    ] as const) {
      const { state, rng } = startedGame(2, seed);
      const actorId = state.firstPlayerId;
      let next = beginCoinOfficeSale(state, actorId, kind, rng);
      expect(next.players[actorId]!.resources.coins).toBe(3 + amount);
      expect(next.phase.type).toBe("work_office_sale");
      next = resolveOfficeSale(next, actorId, [], rng);
      expect(next.phase.type).toBe("work");
    }
  });

  it("lets an Apprentice take an Order, refills immediately, then sell one Flawed ceramic", () => {
    const { state, rng } = startedGame(2, 302);
    const actorId = state.firstPlayerId;
    state.players[actorId]!.kilnId = "RU";
    const flawed = addFinished(state, actorId, "bowl", "flawed");
    const bowlSupplyAfterFiring = state.vesselSupply.bowl.length;
    const coinsBefore = state.players[actorId]!.resources.coins;
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
    expect(next.phase.type).toBe("work_office_sale");
    next = resolveOfficeSale(next, actorId, [flawed.id], rng);
    expect(next.phase.type).toBe("work");
    expect(next.players[actorId]!.resources.coins).toBe(coinsBefore + 1);
    expect(next.ceramics[flawed.id]!.stage).toBe("sold");
    expect(next.vesselSupply.bowl).toHaveLength(bowlSupplyAfterFiring + 1);
  });

  it("lets an Apprentice gain 2 Coins and then sell one Flawed ceramic", () => {
    const { state, rng } = startedGame(2, 303);
    const actorId = state.firstPlayerId;
    const flawed = addFinished(state, actorId, "plate", "flawed");
    const coinsBefore = state.players[actorId]!.resources.coins;
    let next = beginCoinOfficeSale(state, actorId, "apprentice", rng);
    next = resolveOfficeSale(next, actorId, [flawed.id], rng);
    expect(next.players[actorId]!.resources.coins).toBe(coinsBefore + 3);
    expect(next.ceramics[flawed.id]!.stage).toBe("sold");
  });

  it("rejects an Apprentice selling two Flawed ceramics", () => {
    const { state, rng } = startedGame(2, 304);
    const actorId = state.firstPlayerId;
    const first = addFinished(state, actorId, "bowl", "flawed");
    const second = addFinished(state, actorId, "plate", "flawed");
    const sale = beginCoinOfficeSale(state, actorId, "apprentice", rng);
    const rejected = applyAction(
      sale,
      actorId,
      { type: "OFFICE_RESOLVE_FLAWED_SALE", ceramicIds: [first.id, second.id] },
      rng,
    );
    expectError(rejected, "INVALID_SELECTION");
    expect(sale.ceramics[first.id]!.stage).toBe("finished");
    expect(sale.ceramics[second.id]!.stage).toBe("finished");
  });

  it("lets a Shifu take two sequential Orders and then sell two Flawed ceramics", () => {
    const two = startedGame(2, 303);
    const actorId = two.state.firstPlayerId;
    two.state.players[actorId]!.kilnId = "RU";
    const flawed = [
      addFinished(two.state, actorId, "bowl", "flawed"),
      addFinished(two.state, actorId, "plate", "flawed"),
    ];
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
    expect(state.phase.type).toBe("work_office_sale");
    expect(state.players[actorId]!.orderHand).toEqual(
      expect.arrayContaining([firstOrder, refillOrder]),
    );
    state = resolveOfficeSale(state, actorId, flawed.map((ceramic) => ceramic.id), two.rng);
    expect(flawed.every((ceramic) => state.ceramics[ceramic.id]!.stage === "sold")).toBe(true);
    expect(state.phase.type).toBe("work");
  });

  it("lets a Shifu stop after one Order or take one Order plus 2 Coins before the sale step", () => {
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
    expect(stopState.phase.type).toBe("work_office_sale");
    stopState = resolveOfficeSale(stopState, stopActor, [], stop.rng);
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
    expect(bonusState.phase.type).toBe("work_office_sale");
    bonusState = resolveOfficeSale(bonusState, bonusActor, [], bonus.rng);
    expect(bonusState.phase.type).toBe("work");
  });

  it("lets a Shifu gain 4 Coins and then sell up to two Flawed ceramics for exactly 1 Coin each", () => {
    const { state, rng } = startedGame(2, 308);
    const actorId = state.firstPlayerId;
    const flawed = [
      addFinished(state, actorId, "washer", "flawed"),
      addFinished(state, actorId, "vase", "flawed"),
    ];
    const coinsBefore = state.players[actorId]!.resources.coins;
    const supplyBefore = state.commonSupply.coins;
    let next = beginCoinOfficeSale(state, actorId, "shifu", rng);
    expect(next.players[actorId]!.resources.coins).toBe(coinsBefore + 4);
    next = resolveOfficeSale(next, actorId, flawed.map((ceramic) => ceramic.id), rng);
    expect(next.players[actorId]!.resources.coins).toBe(coinsBefore + 6);
    expect(next.commonSupply.coins).toBe(supplyBefore - 6);
  });

  it("rejects a Shifu selling three Flawed ceramics", () => {
    const { state, rng } = startedGame(2, 309);
    const actorId = state.firstPlayerId;
    const flawed = [
      addFinished(state, actorId, "bowl", "flawed"),
      addFinished(state, actorId, "plate", "flawed"),
      addFinished(state, actorId, "washer", "flawed"),
    ];
    const sale = beginCoinOfficeSale(state, actorId, "shifu", rng);
    expectError(
      applyAction(
        sale,
        actorId,
        { type: "OFFICE_RESOLVE_FLAWED_SALE", ceramicIds: flawed.map((ceramic) => ceramic.id) },
        rng,
      ),
      "INVALID_SELECTION",
    );
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
    expect(accepted.phase.type).toBe("work_office_sale");
  });

  it("rejects Standard, Fine, and Masterpiece ceramics", () => {
    const wrongQuality = startedGame(2, 310);
    const wrongActor = wrongQuality.state.firstPlayerId;
    for (const [quality, shape] of [
      ["standard", "bowl"],
      ["fine", "plate"],
      ["masterpiece", "washer"],
    ] as const) {
      const ceramic = addFinished(wrongQuality.state, wrongActor, shape, quality);
      const sale = beginCoinOfficeSale(wrongQuality.state, wrongActor, "shifu", wrongQuality.rng);
      expectError(
        applyAction(
          sale,
          wrongActor,
          { type: "OFFICE_RESOLVE_FLAWED_SALE", ceramicIds: [ceramic.id] },
          wrongQuality.rng,
        ),
        "ILLEGAL_CERAMIC_STAGE",
      );
    }
  });

  it("rejects a delivered ceramic and another player's Finished Flawed ceramic", () => {
    const deliveredGame = startedGame(2, 311);
    const actorId = deliveredGame.state.firstPlayerId;
    const delivered = addFinished(deliveredGame.state, actorId, "vase", "flawed");
    const { firedInRound: _firedInRound, ...deliveredCore } = delivered;
    deliveredGame.state.ceramics[delivered.id] = {
      ...deliveredCore,
      stage: "delivered",
      orderId: "M01",
    };
    const deliveredSale = beginCoinOfficeSale(
      deliveredGame.state,
      actorId,
      "shifu",
      deliveredGame.rng,
    );
    expectError(
      applyAction(
        deliveredSale,
        actorId,
        { type: "OFFICE_RESOLVE_FLAWED_SALE", ceramicIds: [delivered.id] },
        deliveredGame.rng,
      ),
      "ILLEGAL_CERAMIC_STAGE",
    );

    const ownershipGame = startedGame(2, 312);
    const ownershipActor = ownershipGame.state.firstPlayerId;
    const otherId = ownershipGame.state.playerOrder.find((id) => id !== ownershipActor)!;
    const otherCeramic = addFinished(ownershipGame.state, otherId, "censer", "flawed");
    const ownershipSale = beginCoinOfficeSale(
      ownershipGame.state,
      ownershipActor,
      "shifu",
      ownershipGame.rng,
    );
    expectError(
      applyAction(
        ownershipSale,
        ownershipActor,
        { type: "OFFICE_RESOLVE_FLAWED_SALE", ceramicIds: [otherCeramic.id] },
        ownershipGame.rng,
      ),
      "ILLEGAL_CERAMIC_STAGE",
    );
  });

  it("rejects duplicate IDs and prevents a sold ceramic from being sold again", () => {
    const { state, rng } = startedGame(2, 313);
    const actorId = state.firstPlayerId;
    const flawed = addFinished(state, actorId, "bowl", "flawed");
    let sale = beginCoinOfficeSale(state, actorId, "shifu", rng);
    expectError(
      applyAction(
        sale,
        actorId,
        { type: "OFFICE_RESOLVE_FLAWED_SALE", ceramicIds: [flawed.id, flawed.id] },
        rng,
      ),
      "INVALID_SELECTION",
    );
    sale = resolveOfficeSale(sale, actorId, [flawed.id], rng);
    setActive(sale, actorId);
    const secondVisit = beginCoinOfficeSale(sale, actorId, "apprentice", rng);
    expectError(
      applyAction(
        secondVisit,
        actorId,
        { type: "OFFICE_RESOLVE_FLAWED_SALE", ceramicIds: [flawed.id] },
        rng,
      ),
      "ILLEGAL_CERAMIC_STAGE",
    );
  });

  it("does not sell a ceramic unless enough common-supply Coins exist to pay exactly 1", () => {
    const { state, rng } = startedGame(2, 314);
    const actorId = state.firstPlayerId;
    const flawed = addFinished(state, actorId, "plate", "flawed");
    state.commonSupply.coins = 0;
    const sale = beginCoinOfficeSale(state, actorId, "apprentice", rng);
    expectError(
      applyAction(
        sale,
        actorId,
        { type: "OFFICE_RESOLVE_FLAWED_SALE", ceramicIds: [flawed.id] },
        rng,
      ),
      "SUPPLY_EMPTY",
    );
    expect(sale.ceramics[flawed.id]!.stage).toBe("finished");
  });
});

describe("Guild & Academy", () => {
  it("rejects an Apprentice before placing it", () => {
    const { state, rng } = startedGame(2, 320);
    const actorId = state.firstPlayerId;
    const apprenticeId = workerId(state, actorId, "apprentice");
    const rejected = applyAction(
      state,
      actorId,
      { type: "BEGIN_GUILD_ACTION", workerId: apprenticeId },
      rng,
    );
    expectError(rejected, "INVALID_ACTION");
    expect(state.players[actorId]!.workers[apprenticeId]!.status).toBe("available");
    expect(state.actionBoard.placements.guild_academy).toEqual([]);
  });

  it("places a Shifu, optionally skips refresh, pays printed cost, and refills", () => {
    const { state, rng } = startedGame(2, 321);
    const actorId = state.firstPlayerId;
    const shifuId = workerId(state, actorId, "shifu");
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
      { type: "BEGIN_GUILD_ACTION", workerId: shifuId },
      rng,
    );
    expect(next.phase).toEqual(
      expect.objectContaining({ type: "work_guild", step: "refresh_or_skip", actorId }),
    );
    expect(next.actionBoard.placements.guild_academy).toEqual([shifuId]);
    next = mustApply(next, actorId, { type: "GUILD_SKIP_REFRESH" }, rng);
    next = mustApply(next, actorId, { type: "GUILD_BUY_TECHNIQUE", techniqueId }, rng);
    expect(next.players[actorId]!.resources.coins).toBe(3 - definition.cost);
    expect(next.players[actorId]!.techniques).toContainEqual({ id: techniqueId, exhausted: false });
    expect(next.techniqueDisplay[definition.discipline]).toHaveLength(displayBefore.length);
    expect(next.techniqueDisplay[definition.discipline]).not.toContain(techniqueId);
  });

  it("refreshes one Technique from the same discipline deck before buying", () => {
    const { state, rng } = startedGame(2, 322);
    const actorId = state.firstPlayerId;
    const glazingBefore = [...state.techniqueDisplay.glazing];
    const firingBefore = [...state.techniqueDisplay.firing];
    let next = mustApply(
      state,
      actorId,
      { type: "BEGIN_GUILD_ACTION", workerId: workerId(state, actorId, "shifu") },
      rng,
    );
    const refreshedId = next.techniqueDisplay.forming[0]!;
    const replacementId = next.techniqueDecks.forming[0]!;
    next = mustApply(
      next,
      actorId,
      { type: "GUILD_REFRESH_TECHNIQUE", techniqueId: refreshedId },
      rng,
    );
    expect(next.phase).toEqual(expect.objectContaining({ type: "work_guild", step: "buy" }));
    expect(next.techniqueDisplay.forming[0]).toBe(replacementId);
    expect(next.techniqueDecks.forming.at(-1)).toBe(refreshedId);
    expect(next.techniqueDisplay.glazing).toEqual(glazingBefore);
    expect(next.techniqueDisplay.firing).toEqual(firingBefore);
  });

  it("charges the printed cost exactly and applies no extra Shifu discount", () => {
    const { state, rng } = startedGame(2, 323);
    const actorId = state.firstPlayerId;
    state.techniqueDisplay.forming = ["T03", "T01"];
    state.players[actorId]!.resources.coins = 1;
    let next = mustApply(
      state,
      actorId,
      { type: "BEGIN_GUILD_ACTION", workerId: workerId(state, actorId, "shifu") },
      rng,
    );
    next = mustApply(next, actorId, { type: "GUILD_SKIP_REFRESH" }, rng);
    const rejected = applyAction(next, actorId, { type: "GUILD_BUY_TECHNIQUE", techniqueId: "T03" }, rng);
    expect(TECHNIQUE_DEFINITIONS["T03"]!.cost).toBe(2);
    expectError(rejected, "INSUFFICIENT_RESOURCES");
  });

  it("matches the complete V0.5 printed-cost table", () => {
    expect(Object.fromEntries(Object.entries(TECHNIQUE_DEFINITIONS).map(([id, technique]) => [id, technique.cost]))).toEqual({
      T01: 1, T02: 1, T03: 2, T04: 1,
      T05: 1, T06: 1, T07: 1, T08: 1,
      T09: 2, T10: 2, T11: 2, T12: 1,
    });
  });

  it("enforces the two-Technique limit and affordability", () => {
    const full = startedGame(2, 324);
    const actorId = full.state.firstPlayerId;
    full.state.players[actorId]!.techniques = [
      { id: "T01", exhausted: false },
      { id: "T05", exhausted: false },
    ];
    const limited = applyAction(
      full.state,
      actorId,
      { type: "BEGIN_GUILD_ACTION", workerId: workerId(full.state, actorId, "shifu") },
      full.rng,
    );
    expectError(limited, "TECHNIQUE_LIMIT");

    const poor = startedGame(2, 325);
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

  it("allows a newly acquired Technique to trigger later in the same round", () => {
    const { state, rng } = startedGame(2, 326);
    const actorId = state.firstPlayerId;
    const otherId = state.playerOrder.find((playerId) => playerId !== actorId)!;
    state.players[otherId]!.passedWorkPhase = true;
    state.techniqueDisplay.forming = ["T01", "T02"];

    let next = mustApply(
      state,
      actorId,
      { type: "BEGIN_GUILD_ACTION", workerId: workerId(state, actorId, "shifu") },
      rng,
    );
    next = mustApply(next, actorId, { type: "GUILD_SKIP_REFRESH" }, rng);
    next = mustApply(next, actorId, { type: "GUILD_BUY_TECHNIQUE", techniqueId: "T01" }, rng);
    expect(next.phase).toEqual({ type: "work", activePlayerId: actorId });

    next = mustApply(
      next,
      actorId,
      {
        type: "FORM_CERAMICS",
        workerId: workerId(next, actorId, "apprentice"),
        shapes: ["vase"],
        useTechniqueIds: ["T01"],
      },
      rng,
    );
    expect(next.players[actorId]!.resources.clay).toBe(1);
    expect(next.players[actorId]!.techniques).toContainEqual({ id: "T01", exhausted: true });
  });
});
