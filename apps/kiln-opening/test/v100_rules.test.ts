import { describe, expect, it } from "vitest";
import {
  IMPERIAL_ORDERS,
  MARKET_ORDERS,
  TECHNIQUES,
  activeKilnSpaceIds,
  applyAction,
  createPrivateFiringState,
  matchesOrder,
  submitWoodContribution,
} from "../src/game";
import type {
  FinishedCeramic,
  GameState,
  Glaze,
  KilnSpaceId,
  Quality,
  Shape,
  WoodContribution,
} from "../src/game";
import {
  addFinished,
  addGlazed,
  addLoaded,
  addTechnique,
  expectError,
  mustApply,
  startedGame,
  workerId,
} from "./helpers";

function ceramic(
  id: string,
  shape: Shape,
  glaze: Glaze,
  quality: Quality = "fine",
): FinishedCeramic {
  return {
    id,
    vesselInstanceId: `vessel-${id}`,
    ownerId: "P1",
    shape,
    stage: "finished",
    glaze,
    decoration: "plain",
    quality,
    firedInRound: 1,
  };
}

function enterFiring(state: GameState, rng: ReturnType<typeof startedGame>["rng"]): GameState {
  let next = state;
  while (next.phase.type === "work") {
    next = mustApply(next, next.phase.activePlayerId, { type: "PASS_WORK_PHASE" }, rng);
  }
  return next;
}

function submitOnlyContributor(
  state: GameState,
  actorId: string,
  amount: WoodContribution,
  rng: ReturnType<typeof startedGame>["rng"],
): GameState {
  expect(state.phase.type).toBe("firing_contributions");
  const result = submitWoodContribution(
    state,
    createPrivateFiringState(state),
    actorId,
    amount,
    rng,
  );
  expect(result.ok, result.ok ? undefined : JSON.stringify(result.error)).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

function firingFixture(
  techniqueId: "T10" | "T12" | "T13" | "T15" | "T16",
  fireModifier: -2 | -1 | 0 | 1 | 2,
  loads: Array<{ shape: Shape; glaze: Glaze; space: KilnSpaceId }>,
  seed: number,
) {
  const game = startedGame(2, seed);
  const actorId = game.state.firstPlayerId;
  game.state.players[actorId]!.kilnId = "DI";
  addTechnique(game.state, actorId, techniqueId);
  const ceramics = loads.map(({ shape, glaze, space }) =>
    addLoaded(game.state, actorId, shape, glaze, "plain", space),
  );
  game.state.fireDeck[0] = fireModifier;
  return { ...game, actorId, ceramics };
}

describe("V1.0.1 content", () => {
  it("contains 23 Market, 13 Imperial and five Techniques per discipline without T07", () => {
    expect(MARKET_ORDERS).toHaveLength(23);
    expect(IMPERIAL_ORDERS).toHaveLength(13);
    expect(TECHNIQUES).toHaveLength(15);
    expect(TECHNIQUES.some(({ id }) => id === "T07")).toBe(false);
    for (const discipline of ["forming", "glazing", "firing"] as const) {
      expect(TECHNIQUES.filter((technique) => technique.discipline === discipline)).toHaveLength(5);
    }
  });

  it("validates all six new Order patterns without introducing Order titles", () => {
    const order = (id: string) => [...MARKET_ORDERS, ...IMPERIAL_ORDERS].find((card) => card.id === id)!;
    expect(matchesOrder(order("M21"), [ceramic("a", "bowl", "white", "masterpiece")], false)).toBe(true);
    expect(matchesOrder(order("M21"), [ceramic("a", "bowl", "white", "fine")], false)).toBe(false);

    const twoDifferent = [ceramic("a", "bowl", "white"), ceramic("b", "vase", "white")];
    expect(matchesOrder(order("M22"), twoDifferent, false)).toBe(true);
    expect(matchesOrder(order("M22"), [twoDifferent[0]!, ceramic("b", "bowl", "celadon")], false)).toBe(false);

    const trio = [
      ceramic("a", "bowl", "white"),
      ceramic("b", "plate", "white"),
      ceramic("c", "vase", "celadon"),
    ];
    expect(matchesOrder(order("M23"), trio, false)).toBe(true);
    expect(matchesOrder(order("M23"), trio.map((piece) => ({ ...piece, glaze: "white" as const })), false)).toBe(false);

    expect(matchesOrder(order("I11"), [ceramic("a", "vase", "white", "masterpiece")], false)).toBe(true);
    expect(matchesOrder(order("I11"), [ceramic("a", "bowl", "white", "masterpiece")], false)).toBe(false);

    const pair = [ceramic("a", "bowl", "white"), ceramic("b", "plate", "celadon")];
    expect(matchesOrder(order("I12"), pair, false)).toBe(true);
    expect(matchesOrder(order("I12"), pair.map((piece) => ({ ...piece, glaze: "white" as const })), false)).toBe(false);

    const categories = [
      ceramic("a", "bowl", "white"),
      ceramic("b", "plate", "grey_green"),
      ceramic("c", "vase", "moon_white"),
    ];
    expect(matchesOrder(order("I13"), categories, false)).toBe(true);
    expect(matchesOrder(order("I13"), categories.map((piece) => ({ ...piece, glaze: "celadon" as const })), false)).toBe(false);

    for (const definition of [...MARKET_ORDERS, ...IMPERIAL_ORDERS]) {
      expect(definition).not.toHaveProperty("name");
      expect(definition).not.toHaveProperty("title");
    }
  });
});

describe("player-scaled Shared Kiln", () => {
  it("returns the exact 6/7/8 active spaces", () => {
    expect(activeKilnSpaceIds(2)).toEqual([
      "high_1", "high_2", "middle_1", "middle_2", "low_1", "low_2",
    ]);
    expect(activeKilnSpaceIds(3)).toEqual([
      "high_1", "high_2", "middle_1", "middle_2", "middle_3", "low_1", "low_2",
    ]);
    expect(activeKilnSpaceIds(4)).toEqual([
      "high_1", "high_2", "middle_1", "middle_2", "middle_3", "low_1", "low_2", "low_3",
    ]);
  });

  it("rejects loading and Kiln Setting movement into covered spaces", () => {
    const game = startedGame(2, 10001);
    const actorId = game.state.firstPlayerId;
    const glazed = addGlazed(game.state, actorId);
    expectError(applyAction(game.state, actorId, {
      type: "USE_KILN_YARD",
      workerId: workerId(game.state, actorId, "apprentice"),
      loads: [{ ceramicId: glazed.id, kilnSpaceId: "low_3" }],
    }, game.rng), "INVALID_SELECTION");

    addTechnique(game.state, actorId, "T09");
    const loaded = addLoaded(game.state, actorId, "bowl", "white", "plain", "middle_1");
    const firing = enterFiring(game.state, game.rng);
    expect(firing.phase.type).toBe("firing_before_contribution");
    expectError(applyAction(firing, actorId, {
      type: "RESOLVE_KILN_SETTING",
      ceramicId: loaded.id,
      toSpaceId: "low_3",
    }, game.rng), "INVALID_SELECTION");
  });
});

describe("V1.0.1 Technique timing", () => {
  it("T16 ignores Fire for one ceramic while preserving the natural snapshot", () => {
    const game = firingFixture("T16", 1, [{ shape: "bowl", glaze: "white", space: "middle_1" }], 10010);
    addTechnique(game.state, game.actorId, "T12");
    let state = enterFiring(game.state, game.rng);
    state = submitOnlyContributor(state, game.actorId, 0, game.rng);
    expect(state.phase.type).toBe("firing_after_fire_reveal");
    state = mustApply(state, game.actorId, {
      type: "RESOLVE_SAGGER_SELECTION",
      ceramicId: game.ceramics[0]!.id,
    }, game.rng);
    expect(state.ceramics[game.ceramics[0]!.id]).toEqual(
      expect.objectContaining({ stage: "finished", quality: "masterpiece" }),
    );
    expect(state.players[game.actorId]!.techniques.find(({ id }) => id === "T12")?.exhausted).toBe(false);
    expect(state.lastFiringResult?.fireModifier).toBe(1);
  });

  it("T10 improves Standard to Fine and T15 returns a Standard ceramic to Glazed", () => {
    const saggars = firingFixture("T10", 0, [{ shape: "bowl", glaze: "white", space: "high_1" }], 10011);
    let state = enterFiring(saggars.state, saggars.rng);
    state = submitOnlyContributor(state, saggars.actorId, 1, saggars.rng);
    expect(state.phase.type).toBe("firing_after_quality");
    state = mustApply(state, saggars.actorId, {
      type: "RESOLVE_PROTECTIVE_SAGGARS",
      ceramicId: saggars.ceramics[0]!.id,
    }, saggars.rng);
    expect(state.ceramics[saggars.ceramics[0]!.id]).toEqual(
      expect.objectContaining({ stage: "finished", quality: "fine" }),
    );

    const second = firingFixture("T15", 0, [{ shape: "bowl", glaze: "white", space: "high_1" }], 10012);
    state = enterFiring(second.state, second.rng);
    state = submitOnlyContributor(state, second.actorId, 1, second.rng);
    expect(state.phase.type).toBe("firing_after_quality");
    state = mustApply(state, second.actorId, {
      type: "RESOLVE_SECOND_FIRING",
      ceramicId: second.ceramics[0]!.id,
    }, second.rng);
    expect(state.ceramics[second.ceramics[0]!.id]).toEqual(expect.objectContaining({
      stage: "glazed",
      shape: "bowl",
      glaze: "white",
      decoration: "plain",
    }));
    expect(state.ceramics[second.ceramics[0]!.id]).not.toHaveProperty("quality");
  });

  it("opens T15 after T10 creates a Standard result", () => {
    const game = firingFixture("T10", -1, [{ shape: "vase", glaze: "moon_white", space: "low_1" }], 10013);
    addTechnique(game.state, game.actorId, "T15");
    let state = enterFiring(game.state, game.rng);
    state = submitOnlyContributor(state, game.actorId, 0, game.rng);
    state = mustApply(state, game.actorId, {
      type: "RESOLVE_PROTECTIVE_SAGGARS",
      ceramicId: game.ceramics[0]!.id,
    }, game.rng);
    expect(state.phase.type).toBe("firing_after_quality");
    if (state.phase.type === "firing_after_quality") {
      expect(state.phase.techniqueIds[state.phase.queue.currentIndex]).toBe("T15");
    }
  });

  it("T12 pays up to 2 Coins and T13 pays 1 Clay plus 1 Coin", () => {
    const testPieces = firingFixture("T12", 0, [
      { shape: "bowl", glaze: "celadon", space: "middle_1" },
      { shape: "plate", glaze: "celadon", space: "middle_2" },
    ], 10014);
    const coinsBefore = testPieces.state.players[testPieces.actorId]!.resources.coins;
    let state = enterFiring(testPieces.state, testPieces.rng);
    state = submitOnlyContributor(state, testPieces.actorId, 1, testPieces.rng);
    state = mustApply(state, testPieces.actorId, { type: "RESOLVE_TEST_PIECES", use: true }, testPieces.rng);
    expect(state.players[testPieces.actorId]!.resources.coins).toBe(coinsBefore + 2);

    const records = firingFixture("T13", 0, [
      { shape: "bowl", glaze: "celadon", space: "middle_1" },
      { shape: "plate", glaze: "celadon", space: "middle_2" },
    ], 10015);
    const resourcesBefore = { ...records.state.players[records.actorId]!.resources };
    state = enterFiring(records.state, records.rng);
    state = submitOnlyContributor(state, records.actorId, 1, records.rng);
    state = mustApply(state, records.actorId, { type: "RESOLVE_KILN_RECORDS", use: true }, records.rng);
    expect(state.players[records.actorId]!.resources).toEqual({
      ...resourcesBefore,
      clay: resourcesBefore.clay + 1,
      wood: resourcesBefore.wood - 1,
      coins: resourcesBefore.coins + 1,
    });
  });

  it("T14 follows a normal Office action, sells one Masterpiece for 3, and never follows Patronage", () => {
    const game = startedGame(2, 10016);
    const actorId = game.state.firstPlayerId;
    addTechnique(game.state, actorId, "T14");
    const masterpiece = addFinished(game.state, actorId, "vase", "masterpiece");
    const coinsBefore = game.state.players[actorId]!.resources.coins;
    let state = mustApply(game.state, actorId, {
      type: "OFFICE_GAIN_COINS",
      workerId: workerId(game.state, actorId, "apprentice"),
    }, game.rng);
    state = mustApply(state, actorId, { type: "OFFICE_RESOLVE_FLAWED_SALE", ceramicIds: [] }, game.rng);
    expect(state.phase.type).toBe("work_office_connoisseur");
    state = mustApply(state, actorId, {
      type: "OFFICE_RESOLVE_CONNOISSEUR_NETWORK",
      ceramicId: masterpiece.id,
    }, game.rng);
    expect(state.ceramics[masterpiece.id]?.stage).toBe("sold");
    expect(state.players[actorId]!.resources.coins).toBe(coinsBefore + 5);

    const patronage = startedGame(2, 10017);
    const patronId = patronage.state.firstPlayerId;
    addTechnique(patronage.state, patronId, "T14");
    addFinished(patronage.state, patronId, "vase", "masterpiece");
    patronage.state.players[patronId]!.completedOrders.push({
      orderId: "I01",
      ceramicIds: [],
      completedInRound: 1,
      vpAwarded: 7,
      coinsAwarded: 0,
      usedGuanWaiver: false,
    });
    patronage.state.players[patronId]!.resources.coins = 5;
    const afterPatronage = mustApply(patronage.state, patronId, {
      type: "USE_COURT_PATRONAGE",
      workerId: workerId(patronage.state, patronId, "shifu"),
    }, patronage.rng);
    expect(afterPatronage.phase.type).toBe("work");
  });
});
