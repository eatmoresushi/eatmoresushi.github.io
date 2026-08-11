import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  JUN_AB_CONTROL_CONFIG,
  JUN_AB_COST_ONE_CONFIG,
  SeededRandom,
  applyAction,
  createPrivateFiringState,
  submitWoodContribution,
} from "../src/game";
import type { GameExperimentConfig, GameState, PrivateFiringState } from "../src/game";
import { evaluateAction } from "../src/ai/evaluator";
import { getLegalAIActions } from "../src/ai/legalActions";
import { createPlayerObservation } from "../src/ai/observation";
import { buildPlayerPlan } from "../src/ai/planning";
import { HeuristicAIPolicy } from "../src/ai/policy";
import { runSelfPlayGame } from "../src/ai/selfplay";
import { fitJunAbAdjustedModel } from "../src/ai/junAbReporting";
import { createInitialStrategyProfile } from "../src/ai/strategy";
import {
  EXPECTED_FROZEN_PROFILE_HASH,
  assertExperimentOutputPathAvailable,
  collectPriorSeeds,
  createJunAbSchedule,
  frozenProfileHash,
  runPairedScenario,
  validateJunAbSchedule,
} from "../src/ai/junAbExperiment";
import type { AIDecisionContext, AIStrategyProfile } from "../src/ai/types";
import { addLoaded, expectError, mustApply, startedGame } from "./helpers";

const PROJECT_PATH = process.cwd();
const FROZEN_PROFILE_PATH = join(PROJECT_PATH, "playtests/v1.0.1/selfplay-003/ai_strategy_v1.0.1.json");
const PRIOR_PLAYTESTS_PATH = join(PROJECT_PATH, "playtests/v1.0.1");
const HAS_LOCAL_FROZEN_PROFILE = process.env["CI"] !== "true" && existsSync(FROZEN_PROFILE_PATH);
const HAS_LOCAL_PRIOR_PLAYTESTS = process.env["CI"] !== "true" && existsSync(PRIOR_PLAYTESTS_PATH);

function enterFiring(state: GameState, rng: ReturnType<typeof startedGame>["rng"]): GameState {
  let next = state;
  while (next.phase.type === "work") next = mustApply(next, next.phase.activePlayerId, { type: "PASS_WORK_PHASE" }, rng);
  return next;
}

function junWindow(
  experimentConfig: GameExperimentConfig | undefined,
  seed: number,
  coins = 3,
): {
  state: GameState;
  privateState: PrivateFiringState;
  rng: ReturnType<typeof startedGame>["rng"];
  actorId: string;
  ceramicId: string;
} {
  const game = startedGame(2, seed);
  const actorId = game.state.firstPlayerId;
  game.state.players[actorId]!.kilnId = "JU";
  game.state.players[actorId]!.resources.coins = coins;
  if (experimentConfig !== undefined) game.state.experimentConfig = { ...experimentConfig };
  const ceramic = addLoaded(game.state, actorId, "bowl", "celadon", "plain", "middle_1");
  game.state.fireDeck[0] = -1;
  let state = enterFiring(game.state, game.rng);
  let privateState = createPrivateFiringState(state);
  const submitted = submitWoodContribution(state, privateState, actorId, 1, game.rng);
  expect(submitted.ok).toBe(true);
  if (!submitted.ok) throw new Error(submitted.error.message);
  state = submitted.state;
  privateState = submitted.privateState;
  expect(state.phase.type).toBe("firing_before_quality");
  return { state, privateState, rng: game.rng, actorId, ceramicId: ceramic.id };
}

function withoutExperiment(state: GameState): unknown {
  const copy = JSON.parse(JSON.stringify(state)) as GameState;
  delete copy.experimentConfig;
  return copy;
}

function context(): AIDecisionContext {
  return {
    gameSequence: 51,
    decisionIndex: 1,
    learningPhase: "mature",
    assignedTradition: "JU",
    assignedIntent: "Quality-control",
    explorationRate: 0.04,
    mode: "regression",
  };
}

function scoreJun(
  fixture: ReturnType<typeof junWindow>,
  profile: AIStrategyProfile,
  action: { type: "RESOLVE_JUN"; ceramicId: string | null; delta: -1 | 1 | null },
) {
  const observation = createPlayerObservation(fixture.state, fixture.actorId, fixture.privateState);
  const plan = buildPlayerPlan(observation, profile, "Quality-control");
  return evaluateAction(observation, action, context(), profile, plan);
}

describe("jun-ab-001 frozen-bot experiment", () => {
  it("1. official V1.0.2 Jun costs 2 while the explicit historical control remains free", () => {
    const baseline = junWindow(undefined, 10_001);
    const control = junWindow(JUN_AB_CONTROL_CONFIG, 10_001);
    const baselineResult = applyAction(baseline.state, baseline.actorId, { type: "RESOLVE_JUN", ceramicId: baseline.ceramicId, delta: 1 }, baseline.rng);
    const controlResult = applyAction(control.state, control.actorId, { type: "RESOLVE_JUN", ceramicId: control.ceramicId, delta: 1 }, control.rng);
    expect(baselineResult.ok).toBe(true);
    expect(controlResult.ok).toBe(true);
    if (!baselineResult.ok || !controlResult.ok) return;
    expect(baselineResult.state.players[baseline.actorId]!.resources.coins).toBe(1);
    expect(controlResult.state.players[control.actorId]!.resources.coins).toBe(3);
    expect(baselineResult.events).toContainEqual({
      type: "JUN_ACTIVATION_PAID",
      playerId: baseline.actorId,
      coins: 2,
      rulesContext: "official_v1.0.4",
    });
    expect(controlResult.events.some(({ type }) => type === "JUN_ACTIVATION_PAID")).toBe(false);
  });

  it("2. explicit control-arm Jun remains free", () => {
    const fixture = junWindow(JUN_AB_CONTROL_CONFIG, 10_002);
    const before = fixture.state.players[fixture.actorId]!.resources.coins;
    const supply = fixture.state.commonSupply.coins;
    const result = applyAction(fixture.state, fixture.actorId, { type: "RESOLVE_JUN", ceramicId: fixture.ceramicId, delta: 1 }, fixture.rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[fixture.actorId]!.resources.coins).toBe(before);
    expect(result.state.commonSupply.coins).toBe(supply);
    expect(result.events.some(({ type }) => type === "JUN_ACTIVATION_PAID")).toBe(false);
  });

  it("3. jun_cost_1 deducts exactly 1 Coin on selection", () => {
    const fixture = junWindow(JUN_AB_COST_ONE_CONFIG, 10_003);
    const before = fixture.state.players[fixture.actorId]!.resources.coins;
    const result = applyAction(fixture.state, fixture.actorId, { type: "RESOLVE_JUN", ceramicId: fixture.ceramicId, delta: 1 }, fixture.rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[fixture.actorId]!.resources.coins).toBe(before - 1);
    expect(result.events).toContainEqual({
      type: "JUN_ACTIVATION_PAID",
      playerId: fixture.actorId,
      coins: 1,
      rulesContext: "historical_jun_cost_1_experiment",
    });
  });

  it("4. jun_cost_1 decline deducts no Coins", () => {
    const fixture = junWindow(JUN_AB_COST_ONE_CONFIG, 10_004);
    const before = fixture.state.players[fixture.actorId]!.resources.coins;
    const result = applyAction(fixture.state, fixture.actorId, { type: "RESOLVE_JUN", ceramicId: null, delta: null }, fixture.rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[fixture.actorId]!.resources.coins).toBe(before);
    expect(result.events.some(({ type }) => type === "JUN_ACTIVATION_PAID")).toBe(false);
  });

  it("5. a zero-Coin experimental Jun can decline but cannot select", () => {
    const fixture = junWindow(JUN_AB_COST_ONE_CONFIG, 10_005, 0);
    const observation = createPlayerObservation(fixture.state, fixture.actorId, fixture.privateState);
    expect(getLegalAIActions(fixture.state, fixture.actorId, fixture.privateState)).toEqual([
      { type: "RESOLVE_JUN", ceramicId: null, delta: null },
    ]);
    expectError(applyAction(fixture.state, fixture.actorId, { type: "RESOLVE_JUN", ceramicId: fixture.ceramicId, delta: 1 }, fixture.rng), "INSUFFICIENT_RESOURCES");
    expect(applyAction(fixture.state, fixture.actorId, { type: "RESOLVE_JUN", ceramicId: null, delta: null }, fixture.rng).ok).toBe(true);
  });

  it.each([
    ["control", JUN_AB_CONTROL_CONFIG],
    ["jun_cost_1", JUN_AB_COST_ONE_CONFIG],
  ] as const)("6. Jun remains once per round in %s", (_arm, config) => {
    const fixture = junWindow(config, config.junActivationCoinCost === 0 ? 10_006 : 10_007);
    const result = applyAction(fixture.state, fixture.actorId, { type: "RESOLVE_JUN", ceramicId: fixture.ceramicId, delta: 1 }, fixture.rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[fixture.actorId]!.kilnAbilityUsedThisRound).toBe(true);
    expectError(applyAction(result.state, fixture.actorId, { type: "RESOLVE_JUN", ceramicId: fixture.ceramicId, delta: -1 }, fixture.rng), "WRONG_PHASE");
  });

  it("7. payment returns exactly 1 Coin to the common supply", () => {
    const fixture = junWindow(JUN_AB_COST_ONE_CONFIG, 10_008);
    const supply = fixture.state.commonSupply.coins;
    const result = applyAction(fixture.state, fixture.actorId, { type: "RESOLVE_JUN", ceramicId: fixture.ceramicId, delta: 1 }, fixture.rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.commonSupply.coins).toBe(supply + 1);
    expect(result.events).toContainEqual({ type: "RESOURCES_CHANGED", playerId: fixture.actorId, clay: 0, wood: 0, coins: -1 });
  });

  it.each([
    ["control", JUN_AB_CONTROL_CONFIG],
    ["jun_cost_1", JUN_AB_COST_ONE_CONFIG],
  ] as const)("8-9. %s preserves natural telemetry while changing final Quality", (_arm, config) => {
    const fixture = junWindow(config, config.junActivationCoinCost === 0 ? 10_009 : 10_010);
    const natural = fixture.state.firingContext?.ceramicResults[fixture.ceramicId];
    const result = applyAction(fixture.state, fixture.actorId, { type: "RESOLVE_JUN", ceramicId: fixture.ceramicId, delta: 1 }, fixture.rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const firing = result.events.find((event) => event.type === "FIRING_RESOLVED" && event.ceramicId === fixture.ceramicId);
    expect(firing).toEqual(expect.objectContaining({
      naturalActualHeat: natural?.naturalActualHeat,
      naturalHeatDifference: natural?.naturalHeatDifference,
      naturalQuality: "fine",
      finalHeatDifference: 0,
      finalQuality: "masterpiece",
    }));
  });

  it("10. non-Jun behavior is identical across explicit arm configurations", () => {
    const base = startedGame(2, 10_011);
    const control = JSON.parse(JSON.stringify(base.state)) as GameState;
    const experimental = JSON.parse(JSON.stringify(base.state)) as GameState;
    control.experimentConfig = { ...JUN_AB_CONTROL_CONFIG };
    experimental.experimentConfig = { ...JUN_AB_COST_ONE_CONFIG };
    const actor = control.phase.type === "work" ? control.phase.activePlayerId : "P1";
    const left = applyAction(control, actor, { type: "PASS_WORK_PHASE" }, new SeededRandom(44));
    const right = applyAction(experimental, actor, { type: "PASS_WORK_PHASE" }, new SeededRandom(44));
    expect(left.ok).toBe(true);
    expect(right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    expect(withoutExperiment(left.state)).toEqual(withoutExperiment(right.state));
    expect(left.events).toEqual(right.events);
  });

  it("11. the sanitized AI observation exposes the public cost without private experiment state", () => {
    const fixture = junWindow(JUN_AB_COST_ONE_CONFIG, 10_012);
    const observation = createPlayerObservation(fixture.state, fixture.actorId, fixture.privateState);
    expect(observation.junActivationCoinCost).toBe(1);
    expect(observation).not.toHaveProperty("experimentImplementation");
    expect(observation.game).not.toHaveProperty("marketDeck");
    expect(observation.game).not.toHaveProperty("fireDeck");
  });

  it("12. the evaluator subtracts the public experimental Coin value", () => {
    const control = junWindow(JUN_AB_CONTROL_CONFIG, 10_013);
    const experimental = junWindow(JUN_AB_COST_ONE_CONFIG, 10_013);
    const profile = createInitialStrategyProfile(2);
    const left = scoreJun(control, profile, { type: "RESOLVE_JUN", ceramicId: control.ceramicId, delta: 1 });
    const right = scoreJun(experimental, profile, { type: "RESOLVE_JUN", ceramicId: experimental.ceramicId, delta: 1 });
    expect(left.diagnostics.optionalEffect?.coinCost).toBe(0);
    expect(right.diagnostics.optionalEffect?.coinCost).toBeGreaterThan(0);
    expect(right.diagnostics.optionalEffect?.projectedNetValue).toBeCloseTo(
      left.diagnostics.optionalEffect!.projectedNetValue - right.diagnostics.optionalEffect!.coinCost,
    );
  });

  it("13. a high-value conversion still outranks decline after the cost", () => {
    const fixture = junWindow(JUN_AB_COST_ONE_CONFIG, 10_014);
    const profile = createInitialStrategyProfile(2);
    const use = scoreJun(fixture, profile, { type: "RESOLVE_JUN", ceramicId: fixture.ceramicId, delta: 1 });
    const decline = scoreJun(fixture, profile, { type: "RESOLVE_JUN", ceramicId: null, delta: null });
    expect(use.totalScore).toBeGreaterThan(decline.totalScore);
    expect(use.diagnostics.optionalEffect?.reasonCode).toBe("benefit_exceeds_activation_cost");
  });

  it("14. a marginal adjustment is declined when it cannot repay the Coin", () => {
    const fixture = junWindow(JUN_AB_COST_ONE_CONFIG, 10_015);
    const profile = createInitialStrategyProfile(2);
    profile.qualityParameters = { ...profile.qualityParameters, masterpiece: 1, fine: 1, standard: 1, flawed: 1 };
    const use = scoreJun(fixture, profile, { type: "RESOLVE_JUN", ceramicId: fixture.ceramicId, delta: 1 });
    const decline = scoreJun(fixture, profile, { type: "RESOLVE_JUN", ceramicId: null, delta: null });
    expect(use.diagnostics.optionalEffect?.projectedNetValue).toBeLessThanOrEqual(0);
    expect(decline.totalScore).toBeGreaterThan(use.totalScore);
  });

  it("15. fixed state, profile, seed, and arm selects deterministically", async () => {
    const fixture = junWindow(JUN_AB_COST_ONE_CONFIG, 10_016);
    const observation = createPlayerObservation(fixture.state, fixture.actorId, fixture.privateState);
    const legal = getLegalAIActions(fixture.state, fixture.actorId, fixture.privateState);
    const profile = createInitialStrategyProfile(2);
    const left = await new HeuristicAIPolicy(profile, new SeededRandom(77)).chooseAction(observation, legal, context());
    const right = await new HeuristicAIPolicy(profile, new SeededRandom(77)).chooseAction(observation, legal, context());
    expect(left.action).toEqual(right.action);
    expect(left.score).toBe(right.score);
  });

  it("16. neither arm mutates a frozen profile", async () => {
    const profile = createInitialStrategyProfile(2);
    const before = JSON.stringify(profile);
    for (const experimentConfig of [JUN_AB_CONTROL_CONFIG, JUN_AB_COST_ONE_CONFIG]) {
      const result = await runSelfPlayGame({
        gameId: `profile-freeze-${experimentConfig.experimentArm}`,
        gameSequence: 51,
        playerCount: 2,
        gameSeed: 0x7700_0010,
        aiSeed: 0x7700_0011,
        assignedTraditions: { P1: "JU", P2: "RU" },
        assignedIntents: { P1: "Quality-control", P2: "Market" },
        datasetSplit: "ab_evaluation",
        profile,
        explorationRate: profile.exploration.mature,
        learningPhaseOverride: "mature",
        experimentConfig,
      });
      const expectedSeat = new SeededRandom(0x7700_0010).nextInt(2);
      expect(result.initialFirstPlayerId).toBe(`P${expectedSeat + 1}`);
      expect(JSON.stringify(profile)).toBe(before);
    }
  });

  it.skipIf(!HAS_LOCAL_FROZEN_PROFILE)("17. recomputes the exact Selfplay-003 frozen-profile hash", async () => {
    const artifact = await import(FROZEN_PROFILE_PATH, { with: { type: "json" } });
    expect(frozenProfileHash(artifact.default.snapshots.frozenHoldout)).toBe(EXPECTED_FROZEN_PROFILE_HASH);
  });

  it("18. precommits exactly one Jun player in every game", () => {
    const schedule = createJunAbSchedule({ gameSeeds: new Set(), aiSeeds: new Set(), pairs: new Set() });
    expect(schedule.scenarios).toHaveLength(300);
    for (const scenario of schedule.scenarios) {
      expect(Object.values(scenario.assignedTraditions).filter((tradition) => tradition === "JU")).toHaveLength(1);
    }
  });

  it("19. satisfies Tradition, Jun-seat, first-player, and intent balancing", () => {
    const schedule = createJunAbSchedule({ gameSeeds: new Set(), aiSeeds: new Set(), pairs: new Set() });
    expect(validateJunAbSchedule(schedule)).toEqual([]);
    for (const count of [2, 3, 4]) {
      const group = schedule.scenarios.filter((scenario) => scenario.playerCount === count);
      expect(group).toHaveLength(100);
      const intentCounts = Object.values(group.reduce<Record<string, number>>((counts, scenario) => {
        const intent = scenario.assignedIntents[scenario.junPlayerId]!;
        counts[intent] = (counts[intent] ?? 0) + 1;
        return counts;
      }, {}));
      expect(Math.max(...intentCounts) - Math.min(...intentCounts)).toBeLessThanOrEqual(1);
    }
  });

  it("20. precommits arm-paired seeds, assignments, intents, and execution order", () => {
    const schedule = createJunAbSchedule({ gameSeeds: new Set(), aiSeeds: new Set(), pairs: new Set() });
    for (const scenario of schedule.scenarios) {
      expect([...scenario.armOrder].sort()).toEqual(["control", "jun_cost_1"]);
      expect(scenario.candidateSeeds).toHaveLength(51);
      expect(new Set(scenario.candidateSeeds.map(({ gameSeed, aiSeed }) => `${gameSeed}:${aiSeed}`)).size).toBe(51);
      expect(Object.keys(scenario.assignedTraditions)).toEqual(Object.keys(scenario.assignedIntents));
    }
  });

  it.skipIf(!HAS_LOCAL_PRIOR_PLAYTESTS)("21. every primary and replacement seed is fresh against prior studies", async () => {
    const prior = await collectPriorSeeds(PRIOR_PLAYTESTS_PATH);
    const schedule = createJunAbSchedule(prior);
    expect(validateJunAbSchedule(schedule, prior)).toEqual([]);
  });

  it("22. an invalid arm advances both arms to the same replacement", async () => {
    const scenario = createJunAbSchedule({ gameSeeds: new Set(), aiSeeds: new Set(), pairs: new Set() }).scenarios[0]!;
    const calls: string[] = [];
    const result = await runPairedScenario(scenario, async (arm, candidate) => {
      calls.push(`${candidate.replacementIndex}:${arm}`);
      if (candidate.replacementIndex === 0 && arm === "control") throw new Error("fixture invalid");
      return `${candidate.replacementIndex}:${arm}`;
    });
    expect(result.candidate.replacementIndex).toBe(1);
    expect(result.invalidAttempts).toHaveLength(2);
    expect(result.invalidAttempts.every((attempt) => attempt.replacementIndex === 0 && attempt.discardedWithPair)).toBe(true);
    expect(calls.slice(0, 4)).toEqual(scenario.armOrder.map((arm) => `0:${arm}`).concat(scenario.armOrder.map((arm) => `1:${arm}`)));
  });

  it("23. refuses an existing output directory", async () => {
    const existing = await mkdtemp(join(tmpdir(), "jun-ab-001-existing-"));
    await expect(assertExperimentOutputPathAvailable(existing)).rejects.toThrow("already exists");
  });

  it("24. authoritative legality and hidden-information boundaries remain intact", () => {
    const fixture = junWindow(JUN_AB_COST_ONE_CONFIG, 10_017, 0);
    const observation = createPlayerObservation(fixture.state, fixture.actorId, fixture.privateState);
    expect(observation.game.decks.fireRemaining).toBeGreaterThan(0);
    expect(observation.game).not.toHaveProperty("fireDeck");
    expectError(applyAction(fixture.state, fixture.actorId, { type: "RESOLVE_JUN", ceramicId: fixture.ceramicId, delta: -1 }, fixture.rng), "INSUFFICIENT_RESOURCES");
  });

  it("25. the pre-specified adjusted design is full-rank and recovers arm × Jun", () => {
    const schedule = createJunAbSchedule({ gameSeeds: new Set(), aiSeeds: new Set(), pairs: new Set() });
    const rows = schedule.scenarios.flatMap((scenario) => (["control", "jun_cost_1"] as const).flatMap((arm) => (
      Array.from({ length: scenario.playerCount }, (_, seatIndex) => {
        const id = `P${seatIndex + 1}`;
        const jun = id === scenario.junPlayerId;
        return {
          pairId: scenario.pairId,
          outcome: 10 + (jun ? 5 : 0) + (arm === "jun_cost_1" && jun ? -2 : 0) + seatIndex * 0.1,
          arm,
          jun,
          playerCount: scenario.playerCount,
          seat: seatIndex + 1,
          firstPlayer: scenario.expectedFirstPlayerId === id,
          intent: scenario.assignedIntents[id]!,
          lineup: scenario.opponentLineup,
        };
      })
    )));
    const interaction = fitJunAbAdjustedModel(rows).coefficients.find(({ term }) => term === "arm×jun");
    expect(interaction?.coefficient).toBeCloseTo(-2, 8);
  });
});
