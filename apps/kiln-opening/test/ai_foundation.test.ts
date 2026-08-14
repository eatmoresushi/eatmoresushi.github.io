import { describe, expect, it } from "vitest";
import {
  SeededRandom,
  createPrivateFiringState,
} from "../src/game/index.ts";
import type { PrivateFiringState } from "../src/game/index.ts";
import { evaluateAction } from "../src/ai/evaluator.ts";
import { getLegalAIActions } from "../src/ai/legalActions.ts";
import { createPlayerObservation } from "../src/ai/observation.ts";
import { HeuristicAIPolicy } from "../src/ai/policy.ts";
import { assignedTraditionsForGame, runSelfPlayGame } from "../src/ai/selfplay.ts";
import { createInitialStrategyProfile } from "../src/ai/strategy.ts";
import { addFinished, addLoaded, addTechnique, startedGame, workerId } from "./helpers.ts";

describe("reusable AI foundation", () => {
  it("does not expose hidden Fire order or another player's Wood value", () => {
    const { state } = startedGame(2, 8801);
    state.fireDiscard = [-2, 1];
    const otherFireOrder = structuredClone(state);
    otherFireOrder.fireDeck.reverse();
    const [playerId, otherId] = state.playerOrder;
    if (playerId === undefined || otherId === undefined) throw new Error("fixture players missing");
    state.phase = {
      type: "firing_contributions",
      windowId: "secret-window",
      eligiblePlayerIds: [playerId, otherId],
      submittedPlayerIds: [playerId, otherId],
    };
    otherFireOrder.phase = structuredClone(state.phase);
    const privateState: PrivateFiringState = {
      gameId: state.gameId,
      windowId: "secret-window",
      contributions: { [playerId]: 2, [otherId]: 3 },
    };
    const observation = createPlayerObservation(state, playerId, privateState);
    const otherObservation = createPlayerObservation(otherFireOrder, playerId, privateState);
    expect(observation).toEqual(otherObservation);
    expect(observation.ownPendingContribution?.amount).toBe(2);
    expect(observation.game.firingContext).toBeNull();
    expect(JSON.stringify(observation)).not.toContain(`"${otherId}":3`);
    expect(Object.values(observation.knownFireRemaining).reduce((sum, count) => sum + count, 0)).toBe(10);
  });

  it("returns only commands accepted by the unchanged authoritative engine", () => {
    const { state } = startedGame(2, 8802);
    const actorId = state.phase.type === "work" ? state.phase.activePlayerId : state.playerOrder[0]!;
    const privateState = createPrivateFiringState(state);
    const actions = getLegalAIActions(state, actorId, privateState);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some((action) => action.type === "PASS_WORK_PHASE")).toBe(true);
    expect(actions.every((action) => action.type !== "SUBMIT_WOOD_CONTRIBUTION")).toBe(true);
  });

  it("represents a blind Order draw without revealing an Order ID", () => {
    const { state } = startedGame(2, 8803);
    const actorId = state.phase.type === "work" ? state.phase.activePlayerId : state.playerOrder[0]!;
    state.phase = {
      type: "work_office_orders",
      actorId,
      workerId: workerId(state, actorId, "shifu"),
      mode: "take_up_to_two",
      remainingTakes: 2,
      ordersTaken: 0,
      step: "take_or_end",
      colourSamplesUsed: false,
    };
    const actions = getLegalAIActions(state, actorId, createPrivateFiringState(state));
    const blind = actions.filter((action) => action.type === "OFFICE_DRAW_BLIND_ORDER");
    expect(blind).toEqual(expect.arrayContaining([
      { type: "OFFICE_DRAW_BLIND_ORDER", deck: "market" },
      { type: "OFFICE_DRAW_BLIND_ORDER", deck: "imperial" },
    ]));
    expect(blind.every((action) => !("orderId" in action))).toBe(true);
  });

  it("is deterministic with a fixed observation, profile and AI seed", async () => {
    const { state } = startedGame(2, 8804);
    const actorId = state.phase.type === "work" ? state.phase.activePlayerId : state.playerOrder[0]!;
    const privateState = createPrivateFiringState(state);
    const observation = createPlayerObservation(state, actorId, privateState);
    const actions = getLegalAIActions(state, actorId, privateState);
    const profile = createInitialStrategyProfile(2);
    const context = {
      gameSequence: 20,
      decisionIndex: 1,
      learningPhase: "developing" as const,
      assignedTradition: state.players[actorId]!.kilnId!,
      explorationRate: 0.2,
      mode: "regression" as const,
    };
    const left = await new HeuristicAIPolicy(profile, new SeededRandom(991)).chooseAction(observation, actions, context);
    const right = await new HeuristicAIPolicy(profile, new SeededRandom(991)).chooseAction(observation, actions, context);
    expect(left.action).toEqual(right.action);
    expect(left.score).toBe(right.score);
    expect(left.explored).toBe(right.explored);
  });

  it("completes a legal valuable Order instead of ending its Order turn", async () => {
    const { state } = startedGame(2, 8805);
    const actorId = state.playerOrder[0]!;
    const ceramic = addFinished(state, actorId, "bowl", "standard");
    state.players[actorId]!.orderHand = ["M01"];
    state.phase = { type: "orders", turnOrder: state.playerOrder, currentIndex: 0, activePlayerId: actorId };
    const privateState = createPrivateFiringState(state);
    const observation = createPlayerObservation(state, actorId, privateState);
    const legal = getLegalAIActions(state, actorId, privateState);
    const decision = await new HeuristicAIPolicy(createInitialStrategyProfile(2), new SeededRandom(1)).chooseAction(
      observation,
      legal,
      {
        gameSequence: 50,
        decisionIndex: 1,
        learningPhase: "mature",
        assignedTradition: state.players[actorId]!.kilnId!,
        explorationRate: 0,
        mode: "regression",
      },
    );
    expect(decision.action).toEqual({ type: "COMPLETE_ORDER", orderId: "M01", ceramicIds: [ceramic.id], useGuanWaiver: false });
  });

  it("uses Sagger Selection when a +2 Fire card would otherwise cause a Flawed ceramic", async () => {
    const { state } = startedGame(2, 8806);
    const actorId = state.playerOrder[0]!;
    const ceramic = addLoaded(state, actorId, "bowl", "white", "plain", "middle_1");
    addTechnique(state, actorId, "T16");
    state.players[actorId]!.resources.coins = 3;
    state.firingContext = {
      round: state.round,
      contributors: [actorId],
      contributions: { [actorId]: 1 },
      baseHeat: 2,
      fireModifier: 2,
      globalHeat: 4,
      zeroFireModifierCeramicIds: [],
      ceramicResults: {
        [ceramic.id]: {
          ceramicId: ceramic.id,
          zoneModifier: 0,
          ignoredFireModifier: false,
          naturalActualHeat: 4,
          naturalHeatDifference: 3,
          naturalExactMatch: false,
          finalActualHeat: 4,
          finalHeatDifference: 3,
          forcedQuality: null,
          assignedQuality: null,
        },
      },
    };
    state.phase = { type: "firing_after_fire_reveal", queue: { actors: [actorId], currentIndex: 0 } };
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    const use = evaluateAction(observation, { type: "RESOLVE_SAGGER_SELECTION", ceramicId: ceramic.id }, {
      gameSequence: 50,
      decisionIndex: 1,
      learningPhase: "mature",
      assignedTradition: state.players[actorId]!.kilnId!,
      explorationRate: 0,
      mode: "regression",
    }, createInitialStrategyProfile(2));
    const decline = evaluateAction(observation, { type: "RESOLVE_SAGGER_SELECTION", ceramicId: null }, {
      gameSequence: 50,
      decisionIndex: 1,
      learningPhase: "mature",
      assignedTradition: state.players[actorId]!.kilnId!,
      explorationRate: 0,
      mode: "regression",
    }, createInitialStrategyProfile(2));
    expect(use.totalScore).toBeGreaterThan(decline.totalScore);
  });

  it("offers Court Patronage only after its authoritative prerequisites are met", () => {
    const { state } = startedGame(2, 8807);
    const actorId = state.phase.type === "work" ? state.phase.activePlayerId : state.playerOrder[0]!;
    const shifuId = workerId(state, actorId, "shifu");
    state.players[actorId]!.resources.coins = 5;
    let legal = getLegalAIActions(state, actorId, createPrivateFiringState(state));
    expect(legal).not.toContainEqual({ type: "USE_COURT_PATRONAGE", workerId: shifuId });
    state.players[actorId]!.completedOrders.push({
      orderId: "I01",
      ceramicIds: [],
      completedInRound: 1,
      vpAwarded: 0,
      coinsAwarded: 0,
      usedGuanWaiver: false,
    });
    legal = getLegalAIActions(state, actorId, createPrivateFiringState(state));
    expect(legal).toContainEqual({ type: "USE_COURT_PATRONAGE", workerId: shifuId });
  });

  it("drives an unchanged authoritative game through final scoring", async () => {
    const profile = createInitialStrategyProfile(2);
    const result = await runSelfPlayGame({
      gameId: "ai-regression-full-game",
      gameSequence: 50,
      playerCount: 2,
      gameSeed: 0x1012,
      aiSeed: 0xa112,
      assignedTraditions: assignedTraditionsForGame(2, 50),
      profile,
      explorationRate: 0,
    });
    expect(result.state.phase.type).toBe("finished");
    expect(result.state.finalResult).not.toBeNull();
    expect(result.illegalActionAttempts).toBe(0);
    expect(result.decisions.length).toBeGreaterThan(50);
  });
});
