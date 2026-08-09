import { describe, expect, it } from "vitest";
import {
  ORDER_DEFINITIONS,
  SeededRandom,
  applyAction,
  calculateFinalResult,
  createPrivateFiringState,
  matchesOrder,
  submitWoodContribution,
  turnOrderFromFirst,
} from "../src/game";
import type {
  Decoration,
  FinishedCeramic,
  GameState,
  Glaze,
  OrderDefinition,
  PlayerId,
  Quality,
  Shape,
} from "../src/game";
import {
  addFinished,
  expectError,
  mustApply,
  startedGame,
  workerId,
} from "./helpers";

const shapes: Shape[] = ["bowl", "plate", "washer", "vase", "censer"];
const glazes: Glaze[] = ["white", "celadon", "grey_green", "moon_white"];
const decorations: Decoration[] = ["plain", "carved", "impressed", "crackle"];

function validCeramics(order: OrderDefinition): FinishedCeramic[] {
  const result = order.ceramics.map((requirement, index): FinishedCeramic => ({
    id: `${order.id}:ceramic:${index}`,
    vesselInstanceId: `${order.id}:vessel:${index}`,
    ownerId: "P1",
    shape: requirement.shapes?.[0] ?? requirement.shape ?? shapes[index % shapes.length]!,
    stage: "finished",
    glaze: requirement.glaze ?? "white",
    decoration: requirement.decoration ?? "plain",
    quality: order.minQuality,
    firedInRound: 1,
  }));

  const assignDistinct = <K extends "shape" | "glaze">(
    indices: number[],
    key: K,
    values: K extends "shape" ? Shape[] : Glaze[],
  ): void => {
    const used = new Set<string>();
    for (const index of indices) {
      const requirement = order.ceramics[index];
      const explicit = requirement?.[key];
      if (explicit !== undefined) used.add(explicit);
    }
    for (const index of indices) {
      const requirement = order.ceramics[index];
      const ceramic = result[index];
      if (ceramic === undefined || requirement === undefined) continue;
      const explicit = requirement[key];
      if (explicit !== undefined) {
        (ceramic as unknown as Record<string, string>)[key] = explicit;
        continue;
      }
      const value = values.find((candidate) => !used.has(candidate));
      if (value === undefined) throw new Error("Unable to construct distinct Order fixture");
      (ceramic as unknown as Record<string, string>)[key] = value;
      used.add(value);
    }
  };

  for (const relation of order.relations ?? []) {
    switch (relation.type) {
      case "same_glaze": {
        const explicit = relation.indices
          .map((index) => order.ceramics[index]?.glaze)
          .find((value) => value !== undefined) ?? "celadon";
        for (const index of relation.indices) result[index]!.glaze = explicit;
        break;
      }
      case "different_glaze":
      case "all_different_glaze":
        assignDistinct(relation.indices, "glaze", glazes);
        break;
      case "different_shape":
      case "all_different_shape":
        assignDistinct(relation.indices, "shape", shapes);
        break;
      case "same_decoration": {
        const explicit = relation.indices
          .map((index) => order.ceramics[index]?.decoration)
          .find((value) => value !== undefined) ?? "plain";
        for (const index of relation.indices) result[index]!.decoration = explicit;
        break;
      }
      case "at_least_n_quality":
        for (let index = 0; index < relation.count; index += 1) {
          result[index]!.quality = relation.quality;
        }
        break;
      case "at_least_n_distinct_glazes":
        assignDistinct(relation.indices, "glaze", glazes);
        break;
      case "glaze_categories":
        relation.indices.forEach((index, categoryIndex) => {
          result[index]!.glaze = relation.categories[categoryIndex]![0]!;
        });
        break;
    }
  }
  return result;
}

function setOrderPhase(state: GameState): void {
  const order = turnOrderFromFirst(state);
  state.phase = { type: "orders", turnOrder: order, currentIndex: 0, activePlayerId: order[0]! };
}

function finishOrderPhase(state: GameState, rng: SeededRandom): GameState {
  let next = state;
  while (next.phase.type === "orders") {
    next = mustApply(next, next.phase.activePlayerId, { type: "END_ORDER_TURN" }, rng);
  }
  return next;
}

describe("Order matcher", () => {
  it("finds a valid assignment for every one of the 36 current Orders", () => {
    const definitions = Object.values(ORDER_DEFINITIONS);
    expect(definitions).toHaveLength(36);
    for (const order of definitions) {
      expect(matchesOrder(order, validCeramics(order), false), order.id).toBe(true);
    }
  });

  it("is permutation-independent and rejects Quality below the minimum", () => {
    const order = ORDER_DEFINITIONS["M16"]!;
    const ceramics = validCeramics(order);
    expect(matchesOrder(order, [...ceramics].reverse(), false)).toBe(true);
    ceramics[0]!.quality = "flawed";
    expect(matchesOrder(order, ceramics, false)).toBe(false);
  });

  it("allows Guan to ignore exactly one Decoration requirement but no other field", () => {
    const order = ORDER_DEFINITIONS["I03"]!;
    const ceramics = validCeramics(order);
    ceramics[0]!.decoration = "plain";
    expect(matchesOrder(order, ceramics, false)).toBe(false);
    expect(matchesOrder(order, ceramics, true)).toBe(true);
    ceramics[0]!.glaze = "celadon";
    expect(matchesOrder(order, ceramics, true)).toBe(false);
  });

  it("matches the exact V0.6.3 Order attribute and reward changes without score changes", () => {
    expect(ORDER_DEFINITIONS["M10"]).toEqual(expect.objectContaining({ vp: 8, coins: 4 }));
    expect(ORDER_DEFINITIONS["M10"]?.ceramics[0]).toEqual(expect.objectContaining({ glaze: "moon_white", decoration: "carved" }));
    expect(ORDER_DEFINITIONS["M12"]).toEqual(expect.objectContaining({ vp: 6, coins: 4 }));
    expect(ORDER_DEFINITIONS["M12"]?.ceramics[0]).toEqual(expect.objectContaining({ glaze: "grey_green", decoration: "impressed" }));
    expect(ORDER_DEFINITIONS["M14"]).toEqual(expect.objectContaining({ vp: 7, coins: 4 }));
    expect(ORDER_DEFINITIONS["M14"]?.ceramics[0]).toEqual(expect.objectContaining({ glaze: "moon_white", decoration: "impressed" }));
    expect(ORDER_DEFINITIONS["I02"]).toEqual(expect.objectContaining({ vp: 8, imperialProgressReward: 1 }));
    expect(ORDER_DEFINITIONS["I02"]?.ceramics[0]).toEqual(expect.objectContaining({ glaze: "celadon", decoration: "impressed" }));
    expect(ORDER_DEFINITIONS["I04"]).toEqual(expect.objectContaining({ vp: 9, imperialProgressReward: 1 }));
    expect(ORDER_DEFINITIONS["I04"]?.ceramics[0]).toEqual(expect.objectContaining({ glaze: "moon_white", decoration: "impressed" }));
  });

  it("keeps the V0.6.3 explicit Glaze and Decoration distributions balanced", () => {
    const allOrders = Object.values(ORDER_DEFINITIONS);
    const glazeCounts: Record<Glaze, number> = {
      white: 0,
      celadon: 0,
      grey_green: 0,
      moon_white: 0,
    };
    const decorationCounts: Record<Decoration, number> = {
      plain: 0,
      carved: 0,
      impressed: 0,
      crackle: 0,
    };
    for (const order of allOrders) {
      for (const requirement of order.ceramics) {
        if (requirement.glaze !== undefined) glazeCounts[requirement.glaze] += 1;
        if (requirement.decoration !== undefined) decorationCounts[requirement.decoration] += 1;
      }
    }
    expect(glazeCounts).toEqual({ white: 4, celadon: 4, grey_green: 4, moon_white: 4 });
    expect(decorationCounts).toEqual({ plain: 3, carved: 3, impressed: 4, crackle: 3 });
  });

  it("uses the exact +1/+2 reward printed on every Imperial Order, never +3", () => {
    for (let index = 1; index <= 13; index += 1) {
      const id = `I${String(index).padStart(2, "0")}`;
      const reward = ORDER_DEFINITIONS[id]?.imperialProgressReward;
      expect(reward, id).toBe(index <= 5 || index === 11 ? 1 : 2);
      expect(reward, id).not.toBe(3);
    }
  });
});

describe("Order Phase and Imperial Progress", () => {
  it("delivers ceramics, awards printed VP/Coins, and prevents reuse", () => {
    const game = startedGame(2, 700);
    const actorId = game.state.firstPlayerId;
    game.state.players[actorId]!.orderHand = ["M01"];
    const ceramic = addFinished(game.state, actorId, "bowl", "standard");
    setOrderPhase(game.state);
    const next = mustApply(
      game.state,
      actorId,
      {
        type: "COMPLETE_ORDER",
        orderId: "M01",
        ceramicIds: [ceramic.id],
        useGuanWaiver: false,
      },
      game.rng,
    );
    expect(next.players[actorId]!.score.orderVp).toBe(3);
    expect(next.players[actorId]!.resources.coins).toBe(6);
    expect(next.ceramics[ceramic.id]).toEqual(
      expect.objectContaining({ stage: "delivered", orderId: "M01" }),
    );
    expect(next.players[actorId]!.completedOrders).toHaveLength(1);
  });

  it("advances for every Imperial Order in one round and unlocks space 2 during Cleanup", () => {
    const game = startedGame(2, 701);
    const actorId = game.state.firstPlayerId;
    game.state.players[actorId]!.imperialProgress = 1;
    game.state.players[actorId]!.orderHand = ["I01", "I02"];
    const first = addFinished(game.state, actorId, "bowl", "masterpiece", "celadon", "plain");
    const second = addFinished(game.state, actorId, "washer", "masterpiece", "celadon", "impressed");
    setOrderPhase(game.state);
    let state = mustApply(
      game.state,
      actorId,
      { type: "COMPLETE_ORDER", orderId: "I01", ceramicIds: [first.id], useGuanWaiver: false },
      game.rng,
    );
    state = mustApply(
      state,
      actorId,
      { type: "COMPLETE_ORDER", orderId: "I02", ceramicIds: [second.id], useGuanWaiver: false },
      game.rng,
    );
    expect(state.players[actorId]!.imperialProgress).toBe(3);
    expect(state.players[actorId]!.pendingApprenticeUnlocks).toBe(1);
    state = finishOrderPhase(state, game.rng);
    expect(state.round).toBe(2);
    expect(
      Object.values(state.players[actorId]!.workers).filter(
        (worker) => worker.kind === "apprentice" && worker.status === "available",
      ),
    ).toHaveLength(4);
  });

  it("unlocks the fourth Apprentice at Progress space 4 during Cleanup", () => {
    const game = startedGame(2, 711);
    const actorId = game.state.firstPlayerId;
    const player = game.state.players[actorId]!;
    const previouslyUnlocked = Object.values(player.workers).find(
      (worker) => worker.kind === "apprentice" && worker.status === "locked",
    );
    if (previouslyUnlocked === undefined) throw new Error("Expected a locked Apprentice");
    previouslyUnlocked.status = "available";
    player.imperialProgress = 3;
    player.orderHand = ["I01"];
    const ceramic = addFinished(game.state, actorId, "bowl", "masterpiece", "celadon", "plain");
    setOrderPhase(game.state);

    let state = mustApply(
      game.state,
      actorId,
      { type: "COMPLETE_ORDER", orderId: "I01", ceramicIds: [ceramic.id], useGuanWaiver: false },
      game.rng,
    );
    expect(state.players[actorId]!.imperialProgress).toBe(4);
    expect(state.players[actorId]!.pendingApprenticeUnlocks).toBe(1);

    state = finishOrderPhase(state, game.rng);
    expect(
      Object.values(state.players[actorId]!.workers).filter(
        (worker) => worker.kind === "apprentice" && worker.status === "available",
      ),
    ).toHaveLength(5);
  });

  it("awards the Imperial Seal only to the first arrival at space 5", () => {
    const game = startedGame(2, 702);
    const [firstId, secondId] = turnOrderFromFirst(game.state);
    game.state.players[firstId!]!.imperialProgress = 4;
    game.state.players[firstId!]!.orderHand = ["I01"];
    const ceramic = addFinished(game.state, firstId!, "bowl", "masterpiece", "celadon", "plain");
    setOrderPhase(game.state);
    const state = mustApply(
      game.state,
      firstId!,
      { type: "COMPLETE_ORDER", orderId: "I01", ceramicIds: [ceramic.id], useGuanWaiver: false },
      game.rng,
    );
    expect(state.imperialSealOwnerId).toBe(firstId);
    state.players[secondId!]!.imperialProgress = 5;
    expect(state.imperialSealOwnerId).toBe(firstId);
  });

  it("implements Guan's once-per-round Imperial Decoration waiver", () => {
    const game = startedGame(2, 703);
    const actorId = game.state.firstPlayerId;
    game.state.players[actorId]!.kilnId = "GU";
    game.state.players[actorId]!.orderHand = ["I03"];
    const ceramic = addFinished(game.state, actorId, "plate", "masterpiece", "white", "plain");
    setOrderPhase(game.state);
    const next = mustApply(
      game.state,
      actorId,
      { type: "COMPLETE_ORDER", orderId: "I03", ceramicIds: [ceramic.id], useGuanWaiver: true },
      game.rng,
    );
    expect(next.players[actorId]!.kilnAbilityUsedThisRound).toBe(true);
    expect(next.players[actorId]!.completedOrders[0]!.usedGuanWaiver).toBe(true);
  });

  it("performs deterministic Cleanup, cycles displays, passes First Player, and readies Techniques", () => {
    const game = startedGame(2, 704);
    const oldFirst = game.state.firstPlayerId;
    const oldMarket = game.state.marketDisplay[0]!;
    const actorId = oldFirst;
    game.state.players[actorId]!.techniques.push({ id: "T01", exhausted: true });
    setOrderPhase(game.state);
    const state = finishOrderPhase(game.state, game.rng);
    expect(state.round).toBe(2);
    expect(state.firstPlayerId).not.toBe(oldFirst);
    expect(state.marketDiscard).toContain(oldMarket);
    expect(state.marketDisplay).toHaveLength(4);
    expect(state.players[actorId]!.techniques[0]!.exhausted).toBe(false);
    expect(state.phase).toEqual({ type: "work", activePlayerId: state.firstPlayerId });
  });
});

describe("Presentation and final scoring", () => {
  it("scores Quality plus exact-three Shape/Glaze diversity and caps Coin VP", () => {
    const game = startedGame(2, 710);
    const actorId = game.state.firstPlayerId;
    game.state.round = 5;
    game.state.players[actorId]!.imperialProgress = 4;
    game.state.players[actorId]!.resources.coins = 99;
    const standard = addFinished(game.state, actorId, "bowl", "standard", "white");
    const fine = addFinished(game.state, actorId, "plate", "fine", "celadon");
    const masterpiece = addFinished(
      game.state,
      actorId,
      "vase",
      "masterpiece",
      "moon_white",
    );
    setOrderPhase(game.state);
    let state = finishOrderPhase(game.state, game.rng);
    expect(state.phase.type).toBe("presentation");
    state = mustApply(
      state,
      actorId,
      {
        type: "SUBMIT_PRESENTATION",
        ceramicIds: [standard.id, fine.id, masterpiece.id],
      },
      game.rng,
    );
    expect(state.phase.type).toBe("finished");
    expect(state.finalResult?.scores[actorId]?.presentation).toBe(11);
    expect(state.finalResult?.scores[actorId]?.leftoverCoins).toBe(5);
  });

  it("allows an empty eligible Presentation with no penalty and rejects Flawed ceramics", () => {
    const game = startedGame(2, 711);
    const actorId = game.state.firstPlayerId;
    game.state.round = 5;
    game.state.players[actorId]!.imperialProgress = 4;
    const flawed = addFinished(game.state, actorId, "bowl", "flawed");
    setOrderPhase(game.state);
    let state = finishOrderPhase(game.state, game.rng);
    const rejected = applyAction(
      state,
      actorId,
      { type: "SUBMIT_PRESENTATION", ceramicIds: [flawed.id] },
      game.rng,
    );
    expectError(rejected, "PRESENTATION_NOT_ELIGIBLE");
    state = mustApply(state, actorId, { type: "SUBMIT_PRESENTATION", ceramicIds: [] }, game.rng);
    expect(state.finalResult?.scores[actorId]?.presentation).toBe(0);
  });

  it("applies every tie breaker in order and supports shared victory", () => {
    const base = startedGame(2, 712).state;
    const [p1, p2] = base.playerOrder as [PlayerId, PlayerId];

    base.players[p1]!.score.orderVp = 1;
    expect(calculateFinalResult(base).resolvedBy).toBe("total_vp");
    base.players[p1]!.score.orderVp = 0;

    base.players[p1]!.imperialProgress = 1;
    base.players[p2]!.score.orderVp = 1;
    expect(calculateFinalResult(base)).toEqual(
      expect.objectContaining({ winnerIds: [p1], resolvedBy: "imperial_progress" }),
    );
    base.players[p1]!.imperialProgress = 0;
    base.players[p2]!.score.orderVp = 0;

    base.players[p1]!.completedOrders.push({
      orderId: "I01",
      ceramicIds: [],
      completedInRound: 1,
      vpAwarded: 0,
      coinsAwarded: 0,
      usedGuanWaiver: false,
    });
    expect(calculateFinalResult(base).resolvedBy).toBe("completed_imperial_orders");
    base.players[p1]!.completedOrders = [];

    const masterpiece = addFinished(base, p1, "bowl", "masterpiece");
    const finished = base.ceramics[masterpiece.id]!;
    if (finished.stage !== "finished") throw new Error("Fixture failed");
    base.ceramics[masterpiece.id] = {
      id: finished.id,
      vesselInstanceId: finished.vesselInstanceId,
      ownerId: finished.ownerId,
      shape: finished.shape,
      stage: "presented",
      glaze: finished.glaze,
      decoration: finished.decoration,
      quality: "masterpiece",
    };
    expect(calculateFinalResult(base).resolvedBy).toBe("masterpieces_delivered_or_presented");
    delete base.ceramics[masterpiece.id];

    expect(calculateFinalResult(base).resolvedBy).toBe("shared_victory");
  });
});

describe("complete deterministic simulation", () => {
  function simulate(seed: number): GameState {
    const game = startedGame(2, seed);
    let state = game.state;
    const workshopId = state.firstPlayerId;
    const otherId = state.playerOrder.find((id) => id !== workshopId)!;
    state.fireDeck[0] = 0;
    state = mustApply(
      state,
      workshopId,
      {
        type: "FORM_CERAMICS",
        workerId: workerId(state, workshopId, "apprentice"),
        shapes: ["bowl"],
      },
      game.rng,
    );
    const ceramicId = Object.keys(state.ceramics)[0]!;
    state = mustApply(state, otherId, { type: "PASS_WORK_PHASE" }, game.rng);
    state = mustApply(
      state,
      workshopId,
      {
        type: "GLAZE_CERAMICS",
        workerId: workerId(state, workshopId, "apprentice"),
        selections: [{ ceramicId, glaze: "white", decoration: "plain" }],
        shifuMode: "normal",
      },
      game.rng,
    );
    state = mustApply(
      state,
      workshopId,
      {
        type: "USE_KILN_YARD",
        workerId: workerId(state, workshopId, "shifu"),
        loads: [{ ceramicId, kilnSpaceId: "middle_1" }],
      },
      game.rng,
    );
    state = mustApply(state, workshopId, { type: "PASS_WORK_PHASE" }, game.rng);
    if (state.phase.type !== "firing_contributions") {
      throw new Error("Simulation did not reach Contributions");
    }
    const submitted = submitWoodContribution(
      state,
      createPrivateFiringState(state),
      workshopId,
      1,
      game.rng,
    );
    if (!submitted.ok) throw new Error(submitted.error.message);
    state = submitted.state;
    let guard = 0;
    while (state.phase.type !== "finished") {
      guard += 1;
      if (guard > 100) throw new Error("Simulation did not terminate");
      if (state.phase.type === "work") {
        state = mustApply(state, state.phase.activePlayerId, { type: "PASS_WORK_PHASE" }, game.rng);
      } else if (state.phase.type === "orders") {
        state = mustApply(state, state.phase.activePlayerId, { type: "END_ORDER_TURN" }, game.rng);
      } else if (state.phase.type === "presentation") {
        const presentationPhase = state.phase;
        const actorId = presentationPhase.eligiblePlayerIds.find(
          (id) => !presentationPhase.submittedPlayerIds.includes(id),
        );
        if (actorId === undefined) throw new Error("Presentation actor missing");
        state = mustApply(state, actorId, { type: "SUBMIT_PRESENTATION", ceramicIds: [] }, game.rng);
      } else {
        throw new Error(`Unexpected simulation phase ${state.phase.type}`);
      }
    }
    return state;
  }

  it("completes all five rounds and reproduces the same final state from the same seed", () => {
    const first = simulate(720);
    const second = simulate(720);
    expect(first.round).toBe(5);
    expect(first.phase.type).toBe("finished");
    expect(first.finalResult).not.toBeNull();
    expect(first.fireDiscard).toHaveLength(1);
    expect(Object.values(first.ceramics)).toContainEqual(
      expect.objectContaining({ stage: "finished", quality: "fine" }),
    );
    expect(first).toEqual(second);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
});
