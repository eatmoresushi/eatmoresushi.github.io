import { describe, expect, it } from "vitest";
import {
  GAME_CONFIG,
  IMPERIAL_PROGRESS,
  OFFICIAL_IMPERIAL_TRACK_RULES,
  applyAction,
  createPrivateFiringState,
  submitWoodContribution,
  turnOrderFromFirst,
} from "../src/game";
import type { GameState } from "../src/game";
import { evaluateAction } from "../src/ai/evaluator";
import { getLegalAIActions } from "../src/ai/legalActions";
import { createPlayerObservation } from "../src/ai/observation";
import { buildPlayerPlan } from "../src/ai/planning";
import { createInitialStrategyProfile } from "../src/ai/strategy";
import { addFinished, addLoaded, addTechnique, expectError, mustApply, startedGame, workerId } from "./helpers";
import selfPlayRunner from "../src/ai/runSelfPlayStudy.ts?raw";
import selfPlayReporting from "../src/ai/reporting.ts?raw";

type TestGame = ReturnType<typeof startedGame>;

function enterFiring(state: GameState, rng: TestGame["rng"]): GameState {
  let next = state;
  while (next.phase.type === "work") {
    next = mustApply(next, next.phase.activePlayerId, { type: "PASS_WORK_PHASE" }, rng);
  }
  return next;
}

function junWindow(seed: number, coins: number): {
  state: GameState;
  actorId: string;
  ceramicId: string;
  rng: TestGame["rng"];
} {
  const game = startedGame(2, seed);
  const actorId = game.state.firstPlayerId;
  game.state.players[actorId]!.kilnId = "JU";
  game.state.players[actorId]!.resources.coins = coins;
  game.state.players[actorId]!.orderHand = [];
  const ceramic = addLoaded(game.state, actorId, "bowl", "celadon", "plain", "middle_1");
  game.state.fireDeck[0] = -1;
  const firing = enterFiring(game.state, game.rng);
  const result = submitWoodContribution(
    firing,
    createPrivateFiringState(firing),
    actorId,
    1,
    game.rng,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  expect(result.state.phase.type).toBe("firing_before_quality");
  return { state: result.state, actorId, ceramicId: ceramic.id, rng: game.rng };
}

describe("V1.0.4 authoritative content", () => {
  it("uses the exact version, displays, Progress curve, milestones, and Seal value", () => {
    expect(GAME_CONFIG.rulesVersion).toBe("1.0.4");
    expect(GAME_CONFIG.orderDisplay).toEqual(expect.objectContaining({ market: 4, imperial: 4 }));
    expect(GAME_CONFIG.workers.apprenticeUnlockProgress).toEqual([1, 3]);
    expect(GAME_CONFIG.imperialProgressEndGameVp).toEqual([0, 0, 2, 2, 4, 8]);
    expect(GAME_CONFIG.imperialSealVp).toBe(2);
    expect(IMPERIAL_PROGRESS.track.map(({ endGameVp }) => endGameVp)).toEqual([0, 0, 2, 2, 4, 8]);
    expect(OFFICIAL_IMPERIAL_TRACK_RULES).toEqual(expect.objectContaining({
      apprenticeMilestoneSpaces: [1, 3],
      presentationSpaces: [4, 5],
      exhibitionCapacityByProgress: [1, 1, 2, 2, 3, 3],
      imperialSealVp: 2,
    }));
  });

  it("leaves Round 1 unchanged, then rotates exactly two leftmost Orders from both displays in Rounds 2–5", () => {
    const game = startedGame(2, 10_201);
    expect(game.state.round).toBe(1);
    expect(game.state.marketDiscard).toEqual([]);
    expect(game.state.imperialDiscard).toEqual([]);
    let state = game.state;
    for (const expectedRound of [2, 3, 4, 5] as const) {
      const order = turnOrderFromFirst(state);
      const marketBefore = [...state.marketDisplay];
      const imperialBefore = [...state.imperialDisplay];
      const nextMarket = state.marketDeck.slice(0, 2);
      const nextImperial = state.imperialDeck.slice(0, 2);
      const marketDiscardBefore = state.marketDiscard.length;
      const imperialDiscardBefore = state.imperialDiscard.length;
      state.phase = { type: "orders", turnOrder: order, currentIndex: 0, activePlayerId: order[0]! };
      const rotationEvents = [];
      while (state.phase.type === "orders") {
        const result = applyAction(state, state.phase.activePlayerId, { type: "END_ORDER_TURN" }, game.rng);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(result.error.message);
        rotationEvents.push(...result.events.filter((event) => event.type === "ORDER_DISPLAYS_ROTATED"));
        state = result.state;
      }
      expect(state.round).toBe(expectedRound);
      expect(rotationEvents).toEqual([{
        type: "ORDER_DISPLAYS_ROTATED",
        round: expectedRound,
        marketOrderIds: marketBefore.slice(0, 2),
        imperialOrderIds: imperialBefore.slice(0, 2),
      }]);
      expect(state.marketDiscard.slice(marketDiscardBefore)).toEqual(marketBefore.slice(0, 2));
      expect(state.imperialDiscard.slice(imperialDiscardBefore)).toEqual(imperialBefore.slice(0, 2));
      expect(state.marketDisplay).toEqual([...marketBefore.slice(2), ...nextMarket]);
      expect(state.imperialDisplay).toEqual([...imperialBefore.slice(2), ...nextImperial]);
      expect(state.marketDisplay).toHaveLength(4);
      expect(state.imperialDisplay).toHaveLength(4);
    }
  });

  it("keeps future V1.0.2 study outputs separate from historical V1.0.1 artifacts", () => {
    expect(selfPlayRunner).toContain('playtests/v1.0.2/selfplay-003');
    expect(selfPlayRunner).toContain('rulesVersion: "1.0.2"');
    expect(selfPlayRunner).toContain('const root = resolve("playtests/v1.0.1")');
    expect(selfPlayReporting).toContain('playtests_v1.0.2_games.jsonl');
    expect(selfPlayReporting).toContain('ai_strategy_v1.0.2.json');
    expect(selfPlayReporting).toContain('resolve("playtests/v1.0.1/playtests_v1.0.1_games.jsonl")');
  });
});

describe("V1.0.4 Jun", () => {
  it("deducts exactly 2 Coins, returns them to supply, and can create a Masterpiece", () => {
    const fixture = junWindow(10_210, 3);
    const supplyBefore = fixture.state.commonSupply.coins;
    const result = applyAction(
      fixture.state,
      fixture.actorId,
      { type: "RESOLVE_JUN", ceramicId: fixture.ceramicId, delta: 1 },
      fixture.rng,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[fixture.actorId]!.resources.coins).toBe(1);
    expect(result.state.commonSupply.coins).toBe(supplyBefore + 2);
    expect(result.state.players[fixture.actorId]!.kilnAbilityUsedThisRound).toBe(true);
    expect(result.state.ceramics[fixture.ceramicId]).toEqual(
      expect.objectContaining({ stage: "finished", quality: "masterpiece" }),
    );
    expect(result.events).toContainEqual({
      type: "JUN_ACTIVATION_PAID",
      playerId: fixture.actorId,
      coins: 2,
      rulesContext: "official_v1.0.4",
    });
  });

  it("offers only decline below 2 Coins and never charges for declining", () => {
    const fixture = junWindow(10_211, 1);
    const privateState = createPrivateFiringState(fixture.state);
    expect(getLegalAIActions(fixture.state, fixture.actorId, privateState)).toEqual([
      { type: "RESOLVE_JUN", ceramicId: null, delta: null },
    ]);
    expectError(applyAction(
      fixture.state,
      fixture.actorId,
      { type: "RESOLVE_JUN", ceramicId: fixture.ceramicId, delta: 1 },
      fixture.rng,
    ), "INSUFFICIENT_RESOURCES");
    const declined = applyAction(
      fixture.state,
      fixture.actorId,
      { type: "RESOLVE_JUN", ceramicId: null, delta: null },
      fixture.rng,
    );
    expect(declined.ok).toBe(true);
    if (!declined.ok) return;
    expect(declined.state.players[fixture.actorId]!.resources.coins).toBe(1);
    expect(declined.events.some(({ type }) => type === "JUN_ACTIVATION_PAID")).toBe(false);
  });

  it("lets the AI decline a legal but economically worthless adjustment", () => {
    const fixture = junWindow(10_212, 2);
    const privateState = createPrivateFiringState(fixture.state);
    const observation = createPlayerObservation(fixture.state, fixture.actorId, privateState);
    const profile = createInitialStrategyProfile(2);
    profile.qualityParameters = {
      masterpiece: 1,
      fine: 1,
      standard: 1,
      flawed: 1,
      riskTolerance: profile.qualityParameters.riskTolerance,
    };
    const plan = buildPlayerPlan(observation, profile, "Quality-control");
    const context = {
      gameSequence: 1,
      decisionIndex: 1,
      learningPhase: "mature" as const,
      assignedTradition: "JU" as const,
      assignedIntent: "Quality-control" as const,
      explorationRate: 0,
      mode: "regression" as const,
    };
    const use = evaluateAction(
      observation,
      { type: "RESOLVE_JUN", ceramicId: fixture.ceramicId, delta: 1 },
      context,
      profile,
      plan,
    );
    const decline = evaluateAction(
      observation,
      { type: "RESOLVE_JUN", ceramicId: null, delta: null },
      context,
      profile,
      plan,
    );
    expect(use.diagnostics.optionalEffect?.coinCost).toBeGreaterThan(0);
    expect(decline.totalScore).toBeGreaterThan(use.totalScore);
  });
});

describe("V1.0.4 Connoisseur Network", () => {
  it("keeps its 3-Coin purchase cost and sells a Masterpiece for 5 Coins and 0 VP", () => {
    const game = startedGame(2, 10_220);
    const actorId = game.state.firstPlayerId;
    addTechnique(game.state, actorId, "T14");
    const masterpiece = addFinished(game.state, actorId, "vase", "masterpiece");
    const vesselSupplyBefore = game.state.vesselSupply.vase.length;
    const scoreBefore = { ...game.state.players[actorId]!.score };
    let state = mustApply(game.state, actorId, {
      type: "OFFICE_GAIN_COINS",
      workerId: workerId(game.state, actorId, "apprentice"),
    }, game.rng);
    state = mustApply(state, actorId, { type: "OFFICE_RESOLVE_FLAWED_SALE", ceramicIds: [] }, game.rng);
    const coinsBeforeSale = state.players[actorId]!.resources.coins;
    state = mustApply(state, actorId, {
      type: "OFFICE_RESOLVE_CONNOISSEUR_NETWORK",
      ceramicId: masterpiece.id,
    }, game.rng);
    expect(state.players[actorId]!.resources.coins).toBe(coinsBeforeSale + 5);
    expect(state.players[actorId]!.score).toEqual(scoreBefore);
    expect(state.ceramics[masterpiece.id]?.stage).toBe("sold");
    expect(state.vesselSupply.vase).toHaveLength(vesselSupplyBefore + 1);
    expect(state.players[actorId]!.techniques).toContainEqual({ id: "T14", exhausted: true });
  });
});
