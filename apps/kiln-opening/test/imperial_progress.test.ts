import { describe, expect, it } from "vitest";
import {
  SeededRandom,
  applyAction,
  calculateFinalResult,
  turnOrderFromFirst,
} from "../src/game";
import type {
  GameState,
  PlayerId,
  Quality,
  RoundNumber,
} from "../src/game";
import {
  addFinished,
  expectError,
  mustApply,
  startedGame,
} from "./helpers";

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

function addImperialOrderCeramic(
  state: GameState,
  playerId: PlayerId,
  orderId: "I01" | "I02",
) {
  if (orderId === "I01") {
    return addFinished(state, playerId, "bowl", "masterpiece", "celadon", "plain");
  }
  return addFinished(state, playerId, "washer", "masterpiece", "celadon", "plain");
}

function completeImperial(
  state: GameState,
  playerId: PlayerId,
  orderId: "I01" | "I02",
  rng: SeededRandom,
): GameState {
  const ceramic = addImperialOrderCeramic(state, playerId, orderId);
  state.players[playerId]!.orderHand.push(orderId);
  return mustApply(
    state,
    playerId,
    { type: "COMPLETE_ORDER", orderId, ceramicIds: [ceramic.id], useGuanWaiver: false },
    rng,
  );
}

describe("Imperial Progress advancement and delayed Apprentices", () => {
  it("starts every player at 0 with two available and two locked Apprentices", () => {
    const { state } = startedGame(4, 810);
    for (const player of Object.values(state.players)) {
      expect(player.imperialProgress).toBe(0);
      expect(player.progressAdvancedThisRound).toBe(false);
      expect(player.pendingApprenticeUnlocks).toBe(0);
      const apprentices = Object.values(player.workers).filter((worker) => worker.kind === "apprentice");
      expect(apprentices.filter((worker) => worker.status === "available")).toHaveLength(2);
      expect(apprentices.filter((worker) => worker.status === "locked")).toHaveLength(2);
    }
  });

  it("does not advance for a Market Order", () => {
    const { state, rng } = startedGame(2, 811);
    const actorId = state.firstPlayerId;
    state.players[actorId]!.orderHand = ["M01"];
    const ceramic = addFinished(state, actorId, "bowl", "standard");
    setOrderPhase(state);
    const next = mustApply(
      state,
      actorId,
      { type: "COMPLETE_ORDER", orderId: "M01", ceramicIds: [ceramic.id], useGuanWaiver: false },
      rng,
    );
    expect(next.players[actorId]!.imperialProgress).toBe(0);
    expect(next.players[actorId]!.progressAdvancedThisRound).toBe(false);
  });

  it("advances exactly once for multiple Imperial Orders in one round", () => {
    const { state, rng } = startedGame(2, 812);
    const actorId = state.firstPlayerId;
    setOrderPhase(state);
    let next = completeImperial(state, actorId, "I01", rng);
    expect(next.players[actorId]!.imperialProgress).toBe(1);
    expect(next.players[actorId]!.progressAdvancedThisRound).toBe(true);
    next = completeImperial(next, actorId, "I02", rng);
    expect(next.players[actorId]!.imperialProgress).toBe(1);
    expect(next.players[actorId]!.completedOrders).toHaveLength(2);
  });

  it("resets the reminder at the next round and can advance again", () => {
    const { state, rng } = startedGame(2, 813);
    const actorId = state.firstPlayerId;
    setOrderPhase(state);
    let next = completeImperial(state, actorId, "I01", rng);
    next = finishOrderPhase(next, rng);
    expect(next.round).toBe(2);
    expect(next.players[actorId]!.progressAdvancedThisRound).toBe(false);
    const nextTurnOrder = [actorId, ...next.playerOrder.filter((playerId) => playerId !== actorId)];
    next.phase = { type: "orders", turnOrder: nextTurnOrder, currentIndex: 0, activePlayerId: actorId };
    next = completeImperial(next, actorId, "I02", rng);
    expect(next.players[actorId]!.imperialProgress).toBe(2);
  });

  it("never advances beyond space 5", () => {
    const { state, rng } = startedGame(2, 814);
    const actorId = state.firstPlayerId;
    state.players[actorId]!.imperialProgress = 5;
    setOrderPhase(state);
    const next = completeImperial(state, actorId, "I01", rng);
    expect(next.players[actorId]!.imperialProgress).toBe(5);
    expect(next.players[actorId]!.pendingApprenticeUnlocks).toBe(0);
  });

  it("reaching space 2 creates one pending unlock that is unusable until Cleanup", () => {
    const { state, rng } = startedGame(2, 815);
    const actorId = state.firstPlayerId;
    state.players[actorId]!.imperialProgress = 1;
    setOrderPhase(state);
    let next = completeImperial(state, actorId, "I01", rng);
    const beforeCleanup = Object.values(next.players[actorId]!.workers).filter(
      (worker) => worker.kind === "apprentice",
    );
    expect(next.players[actorId]!.pendingApprenticeUnlocks).toBe(1);
    expect(beforeCleanup.filter((worker) => worker.status === "available")).toHaveLength(2);
    expect(beforeCleanup.filter((worker) => worker.status === "locked")).toHaveLength(2);

    next = finishOrderPhase(next, rng);
    const afterCleanup = Object.values(next.players[actorId]!.workers).filter(
      (worker) => worker.kind === "apprentice",
    );
    expect(next.players[actorId]!.pendingApprenticeUnlocks).toBe(0);
    expect(afterCleanup.filter((worker) => worker.status === "available")).toHaveLength(3);
    expect(afterCleanup.filter((worker) => worker.status === "locked")).toHaveLength(1);
  });

  it("reaching space 4 unlocks only the second Apprentice and cannot trigger twice", () => {
    const { state, rng } = startedGame(2, 816);
    const actorId = state.firstPlayerId;
    const player = state.players[actorId]!;
    const firstLocked = Object.values(player.workers).find(
      (worker) => worker.kind === "apprentice" && worker.status === "locked",
    )!;
    firstLocked.status = "available";
    player.imperialProgress = 3;
    setOrderPhase(state);
    let next = completeImperial(state, actorId, "I01", rng);
    next = completeImperial(next, actorId, "I02", rng);
    expect(next.players[actorId]!.imperialProgress).toBe(4);
    expect(next.players[actorId]!.pendingApprenticeUnlocks).toBe(1);
    expect(
      Object.values(next.players[actorId]!.workers).filter(
        (worker) => worker.kind === "apprentice" && worker.status === "available",
      ),
    ).toHaveLength(3);
    next = finishOrderPhase(next, rng);
    expect(
      Object.values(next.players[actorId]!.workers).filter(
        (worker) => worker.kind === "apprentice" && worker.status === "available",
      ),
    ).toHaveLength(4);
  });
});

describe("Imperial Seal", () => {
  it("belongs permanently to the first player who reaches space 5", () => {
    const { state, rng } = startedGame(2, 820);
    const [firstId, secondId] = turnOrderFromFirst(state) as [PlayerId, PlayerId];
    state.players[firstId]!.imperialProgress = 4;
    state.players[secondId]!.imperialProgress = 4;
    setOrderPhase(state);
    let next = completeImperial(state, firstId, "I01", rng);
    expect(next.imperialSealOwnerId).toBe(firstId);
    next = mustApply(next, firstId, { type: "END_ORDER_TURN" }, rng);
    next = completeImperial(next, secondId, "I02", rng);
    expect(next.players[secondId]!.imperialProgress).toBe(5);
    expect(next.imperialSealOwnerId).toBe(firstId);
    next = finishOrderPhase(next, rng);
    expect(next.round).toBe(2);
    expect(next.imperialSealOwnerId).toBe(firstId);
    expect(calculateFinalResult(next).scores[firstId]!.imperialSeal).toBe(3);
    expect(calculateFinalResult(next).scores[secondId]!.imperialSeal).toBe(0);
  });
});

function presentedScore(qualities: Quality[], distinctShapes: boolean, distinctGlazes: boolean): number {
  const { state } = startedGame(2, 830 + qualities.length + Number(distinctShapes) + Number(distinctGlazes));
  const actorId = state.firstPlayerId;
  const shapes = distinctShapes ? ["bowl", "plate", "vase"] as const : ["bowl", "bowl", "bowl"] as const;
  const glazes = distinctGlazes ? ["white", "celadon", "moon_white"] as const : ["white", "white", "white"] as const;
  const ids = qualities.map((quality, index) => {
    const ceramic = addFinished(state, actorId, shapes[index] ?? "bowl", quality, glazes[index] ?? "white");
    const { firedInRound: _firedInRound, ...core } = ceramic;
    state.ceramics[ceramic.id] = { ...core, stage: "presented", quality: quality as Exclude<Quality, "flawed"> };
    return ceramic.id;
  });
  state.players[actorId]!.presentationCeramicIds = ids;
  return calculateFinalResult(state).scores[actorId]!.presentation;
}

describe("Imperial Presentation and final Imperial scoring", () => {
  it("rejects Progress 3 while Progress 4 and 5 are eligible", () => {
    const below = startedGame(2, 840);
    const [belowId, eligibleId] = below.state.playerOrder as [PlayerId, PlayerId];
    below.state.players[belowId]!.imperialProgress = 3;
    below.state.players[eligibleId]!.imperialProgress = 4;
    below.state.phase = { type: "presentation", eligiblePlayerIds: [eligibleId], submittedPlayerIds: [] };
    expectError(
      applyAction(below.state, belowId, { type: "SUBMIT_PRESENTATION", ceramicIds: [] }, below.rng),
      "PRESENTATION_NOT_ELIGIBLE",
    );

    for (const [progress, seed] of [[4, 841], [5, 842]] as const) {
      const game = startedGame(2, seed);
      const actorId = game.state.firstPlayerId;
      game.state.phase = { type: "presentation", eligiblePlayerIds: [actorId], submittedPlayerIds: [] };
      game.state.players[actorId]!.imperialProgress = progress;
      const next = mustApply(game.state, actorId, { type: "SUBMIT_PRESENTATION", ceramicIds: [] }, game.rng);
      expect(next.phase.type).toBe("finished");
    }
  });

  it("rejects Flawed and delivered ceramics", () => {
    const game = startedGame(2, 843);
    const actorId = game.state.firstPlayerId;
    game.state.players[actorId]!.imperialProgress = 4;
    game.state.phase = { type: "presentation", eligiblePlayerIds: [actorId], submittedPlayerIds: [] };
    const flawed = addFinished(game.state, actorId, "bowl", "flawed");
    expectError(
      applyAction(game.state, actorId, { type: "SUBMIT_PRESENTATION", ceramicIds: [flawed.id] }, game.rng),
      "PRESENTATION_NOT_ELIGIBLE",
    );
    const delivered = addFinished(game.state, actorId, "plate", "standard");
    const { firedInRound: _firedInRound, ...core } = delivered;
    game.state.ceramics[delivered.id] = { ...core, stage: "delivered", orderId: "M02" };
    expectError(
      applyAction(game.state, actorId, { type: "SUBMIT_PRESENTATION", ceramicIds: [delivered.id] }, game.rng),
      "PRESENTATION_NOT_ELIGIBLE",
    );
  });

  it("scores Standard/Fine/Masterpiece as 1/2/4 and gives no bonus below three", () => {
    expect(presentedScore(["standard"], true, true)).toBe(1);
    expect(presentedScore(["fine"], true, true)).toBe(2);
    expect(presentedScore(["masterpiece"], true, true)).toBe(4);
    expect(presentedScore(["standard", "fine"], true, true)).toBe(3);
    expect(presentedScore([], true, true)).toBe(0);
  });

  it("scores Shape and Glaze diversity separately and together", () => {
    expect(presentedScore(["standard", "standard", "standard"], true, false)).toBe(5);
    expect(presentedScore(["standard", "standard", "standard"], false, true)).toBe(5);
    expect(presentedScore(["standard", "fine", "masterpiece"], true, true)).toBe(11);
  });

  it.each([
    [0, 0], [1, 1], [2, 1], [3, 3], [4, 3], [5, 7],
  ] as const)("scores Progress space %s as %s VP", (space, expectedVp) => {
    const { state } = startedGame(2, 850 + space);
    const actorId = state.firstPlayerId;
    state.players[actorId]!.imperialProgress = space;
    const score = calculateFinalResult(state).scores[actorId]!;
    expect(score.imperialProgress).toBe(expectedVp);
    expect(score.total).toBe(
      score.orders + score.imperialProgress + score.imperialSeal + score.presentation +
      score.immediateAbilities + score.leftoverCoins,
    );
  });
});
