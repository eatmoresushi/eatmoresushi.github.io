import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { SeededRandom, createPrivateFiringState } from "../src/game/index.ts";
import type { GameState, PlayerId, Quality } from "../src/game/index.ts";
import { projectSaggerCounterfactual } from "../src/ai/counterfactuals.ts";
import { evaluateAction } from "../src/ai/evaluator.ts";
import { getLegalAIActions } from "../src/ai/legalActions.ts";
import { createPlayerObservation } from "../src/ai/observation.ts";
import { buildPlayerPlan, evaluateOrderFeasibility } from "../src/ai/planning.ts";
import { HeuristicAIPolicy } from "../src/ai/policy.ts";
import { assertFreshHoldoutSeeds } from "../src/ai/runSelfPlayStudy.ts";
import { assignedStrategyIntentsForGame, assignedTraditionsForGame, runSelfPlayGame } from "../src/ai/selfplay.ts";
import { createSourceIdentity, sha256, sourceIdentityHash } from "../src/ai/sourceManifest.ts";
import { createInitialStrategyProfile, learnFromCompletedGame } from "../src/ai/strategy.ts";
import type { StrategyLearningResult } from "../src/ai/strategy.ts";
import { forecastTechniqueAcquisition } from "../src/ai/techniqueForecast.ts";
import type { AIDecisionContext, AIStrategyProfile } from "../src/ai/types.ts";
import { addFinished, addGlazed, addLoaded, addShaped, addTechnique, startedGame, workerId } from "./helpers.ts";

const SELFPLAY_002_PLAYERS = "playtests/v1.0.1/selfplay-002/playtests_v1.0.1_players.csv";
const SELFPLAY_002_SUMMARY = "playtests/v1.0.1/selfplay-002/study_summary.json";
const HAS_LOCAL_SELFPLAY_002_ARCHIVE = process.env["CI"] !== "true" &&
  existsSync(SELFPLAY_002_PLAYERS) && existsSync(SELFPLAY_002_SUMMARY);

function fixture(playerCount: 2 | 3 | 4 = 2, seed = 9301): { state: GameState; actorId: PlayerId } {
  const { state } = startedGame(playerCount, seed);
  const actorId = state.phase.type === "work" ? state.phase.activePlayerId : state.playerOrder[0]!;
  return { state, actorId };
}

function context(state: GameState, actorId: PlayerId, overrides: Partial<AIDecisionContext> = {}): AIDecisionContext {
  return {
    gameSequence: 50,
    decisionIndex: 1,
    learningPhase: "mature",
    assignedTradition: state.players[actorId]!.kilnId!,
    assignedIntent: "Hybrid",
    explorationRate: 0,
    mode: "regression",
    ...overrides,
  };
}

function afterFire(
  state: GameState,
  actorId: PlayerId,
  ceramicId: string,
  baseHeat: 1 | 2 | 3,
  fireModifier: -2 | -1 | 0 | 1 | 2,
  finalDifference?: number,
  assignedQuality: Quality | null = null,
): void {
  state.firingContext = {
    round: state.round,
    contributors: [actorId],
    contributions: { [actorId]: "TEND" },
    fuelLedgerUpgradedBy: [],
    baseHeat,
    fireModifier,
    globalHeat: baseHeat + fireModifier,
    saggerAdjustedCeramicIds: [],
    ceramicResults: finalDifference === undefined ? {} : {
      [ceramicId]: {
        ceramicId,
        zoneModifier: 0,
        ignoredFireModifier: false,
        naturalActualHeat: baseHeat + fireModifier,
        naturalHeatDifference: finalDifference,
        naturalExactMatch: finalDifference === 0,
        finalActualHeat: baseHeat + fireModifier,
        finalHeatDifference: finalDifference,
        forcedQuality: null,
        assignedQuality,
      },
    },
  };
}

function score(
  state: GameState,
  actorId: PlayerId,
  action: Parameters<typeof evaluateAction>[1],
  profile = createInitialStrategyProfile(state.playerCount),
  overrides: Partial<AIDecisionContext> = {},
) {
  const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
  return evaluateAction(observation, action, context(state, actorId, overrides), profile);
}

describe("Selfplay-003 policy validation", () => {
  it("1. is deterministic for a fixed observation, profile, intent and AI seed", async () => {
    const { state, actorId } = fixture(2, 9301);
    const privateState = createPrivateFiringState(state);
    const observation = createPlayerObservation(state, actorId, privateState);
    const legal = getLegalAIActions(state, actorId, privateState);
    const profile = createInitialStrategyProfile(2);
    const ctx = context(state, actorId, { explorationRate: 0.2, assignedIntent: "Imperial" });
    const left = await new HeuristicAIPolicy(profile, new SeededRandom(303)).chooseAction(observation, legal, ctx);
    const right = await new HeuristicAIPolicy(profile, new SeededRandom(303)).chooseAction(observation, legal, ctx);
    expect(left.action).toEqual(right.action);
    expect(left.plan).toEqual(right.plan);
    expect(left.diagnostics).toEqual(right.diagnostics);
  });

  it("2. remains invariant to hidden deck order and unrevealed opposing Wood", () => {
    const { state, actorId } = fixture(2, 9302);
    const changed = structuredClone(state);
    changed.marketDeck.reverse();
    changed.imperialDeck.reverse();
    changed.techniqueDecks.forming.reverse();
    changed.fireDeck.reverse();
    const own = createPrivateFiringState(state);
    const left = createPlayerObservation(state, actorId, own);
    const right = createPlayerObservation(changed, actorId, own);
    expect(left).toEqual(right);
    expect(buildPlayerPlan(left, createInitialStrategyProfile(2), "Imperial"))
      .toEqual(buildPlayerPlan(right, createInitialStrategyProfile(2), "Imperial"));
  });

  it("3. preserves unique ceramic assignments", () => {
    const { state, actorId } = fixture(2, 9303);
    const ceramic = addFinished(state, actorId, "bowl", "standard");
    const plan = evaluateOrderFeasibility(createPlayerObservation(state, actorId, createPrivateFiringState(state)), "M15");
    expect(plan.assignments.filter(({ ceramicId }) => ceramicId === ceramic.id)).toHaveLength(1);
  });

  it.skipIf(!HAS_LOCAL_SELFPLAY_002_ARCHIVE)("4. preserves immutable Selfplay-002 benchmark artifacts", async () => {
    const digest = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
    expect(digest(await readFile(SELFPLAY_002_PLAYERS)))
      .toBe("f33cdc4969a51bf25c97201463e9786d3ab588c044a6eee74ab5ec91575089a8");
    expect(digest(await readFile(SELFPLAY_002_SUMMARY)))
      .toBe("051e49dcee69e077de182262bba73400c09ab9d7d8f8db25c77e59541887dd3c");
  });

  it("5. declines Sagger when the natural result is already a Masterpiece", () => {
    const { state, actorId } = fixture(2, 9305);
    const ceramic = addLoaded(state, actorId, "bowl", "white", "plain", "middle_1");
    state.players[actorId]!.resources.coins = 4;
    afterFire(state, actorId, ceramic.id, 2, -1);
    const use = score(state, actorId, { type: "RESOLVE_SAGGER_SELECTION", ceramicId: ceramic.id });
    const decline = score(state, actorId, { type: "RESOLVE_SAGGER_SELECTION", ceramicId: null });
    expect(use.diagnostics.optionalEffect?.naturalQuality).toBe("masterpiece");
    expect(use.totalScore).toBeLessThan(decline.totalScore);
  });

  it("6. uses Sagger when zero Fire creates a net improvement", () => {
    const { state, actorId } = fixture(2, 9306);
    const ceramic = addLoaded(state, actorId, "bowl", "white", "plain", "middle_1");
    state.players[actorId]!.resources.coins = 8;
    afterFire(state, actorId, ceramic.id, 2, 2);
    const use = score(state, actorId, { type: "RESOLVE_SAGGER_SELECTION", ceramicId: ceramic.id });
    const decline = score(state, actorId, { type: "RESOLVE_SAGGER_SELECTION", ceramicId: null });
    expect(use.diagnostics.optionalEffect?.qualityRankDelta).toBeGreaterThan(0);
    expect(use.totalScore).toBeGreaterThan(decline.totalScore);
  });

  it("7. declines Sagger when zero Fire leaves Quality unchanged", () => {
    const { state, actorId } = fixture(2, 9307);
    const ceramic = addLoaded(state, actorId, "bowl", "celadon", "plain", "middle_1");
    state.players[actorId]!.resources.coins = 8;
    afterFire(state, actorId, ceramic.id, 2, 0);
    const use = score(state, actorId, { type: "RESOLVE_SAGGER_SELECTION", ceramicId: ceramic.id });
    const decline = score(state, actorId, { type: "RESOLVE_SAGGER_SELECTION", ceramicId: null });
    expect(use.diagnostics.optionalEffect?.qualityRankDelta).toBe(0);
    expect(use.totalScore).toBeLessThan(decline.totalScore);
  });

  it("8. computes Sagger outcomes before ceramicResults exist", () => {
    const { state, actorId } = fixture(2, 9308);
    const ceramic = addLoaded(state, actorId, "bowl", "white", "plain", "middle_1");
    afterFire(state, actorId, ceramic.id, 2, 2);
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    const plan = buildPlayerPlan(observation, createInitialStrategyProfile(2));
    const projected = projectSaggerCounterfactual(observation, plan, ceramic.id);
    expect(state.firingContext?.ceramicResults).toEqual({});
    expect(projected).toMatchObject({ naturalActualHeat: 4, zeroFireActualHeat: 2, naturalQuality: "flawed", zeroFireQuality: "fine" });
  });

  it("9. declines Ge when forced Crackle breaks a more valuable planned Order", () => {
    const { state, actorId } = fixture(2, 9309);
    state.players[actorId]!.kilnId = "GE";
    state.players[actorId]!.orderHand = ["M06"];
    const ceramic = addLoaded(state, actorId, "bowl", "white", "plain", "middle_1");
    afterFire(state, actorId, ceramic.id, 2, 0, 1);
    const use = score(state, actorId, { type: "RESOLVE_GE", ceramicId: ceramic.id });
    const decline = score(state, actorId, { type: "RESOLVE_GE", ceramicId: null });
    expect(use.diagnostics.optionalEffect?.orderValueDelta).toBeLessThan(0);
    expect(use.totalScore).toBeLessThan(decline.totalScore);
  });

  it("10. uses Ge when Crackle preserves and improves the planned route", () => {
    const { state, actorId } = fixture(2, 9310);
    state.players[actorId]!.kilnId = "GE";
    state.players[actorId]!.orderHand = ["M21"];
    const ceramic = addLoaded(state, actorId, "bowl", "white", "carved", "middle_1");
    afterFire(state, actorId, ceramic.id, 2, 0, 1);
    const use = score(state, actorId, { type: "RESOLVE_GE", ceramicId: ceramic.id });
    const decline = score(state, actorId, { type: "RESOLVE_GE", ceramicId: null });
    expect(use.diagnostics.optionalEffect?.compatibleOrdersAfter).toBeGreaterThan(use.diagnostics.optionalEffect?.compatibleOrdersBefore ?? 0);
    expect(use.totalScore).toBeGreaterThan(decline.totalScore);
  });

  it("11. gives Imperial intent a meaningful round-1 feasible face-up commitment", () => {
    const { state, actorId } = fixture(2, 9311);
    state.round = 1;
    addFinished(state, actorId, "bowl", "masterpiece", "celadon", "plain");
    const imperial = score(state, actorId, { type: "OFFICE_TAKE_ORDER", orderId: "I01" }, createInitialStrategyProfile(2), { assignedIntent: "Imperial" });
    const market = score(state, actorId, { type: "OFFICE_TAKE_ORDER", orderId: "M23" }, createInitialStrategyProfile(2), { assignedIntent: "Imperial" });
    expect(imperial.totalScore).toBeGreaterThan(market.totalScore);
  });

  it("12. falls back from an infeasible Imperial route", () => {
    const { state, actorId } = fixture(2, 9312);
    state.round = 3;
    addFinished(state, actorId, "bowl", "standard", "white", "plain");
    const impossible = score(state, actorId, { type: "OFFICE_TAKE_ORDER", orderId: "I10" }, createInitialStrategyProfile(2), { assignedIntent: "Imperial" });
    const feasible = score(state, actorId, { type: "OFFICE_TAKE_ORDER", orderId: "M01" }, createInitialStrategyProfile(2), { assignedIntent: "Imperial" });
    expect(feasible.totalScore).toBeGreaterThan(impossible.totalScore);
  });

  it("13. declines a late blind Imperial draw with negative public expectation", () => {
    const { state, actorId } = fixture(2, 9313);
    state.round = 5;
    state.players[actorId]!.orderHand = [];
    const blind = score(state, actorId, { type: "OFFICE_DRAW_BLIND_ORDER", deck: "imperial" }, createInitialStrategyProfile(2), { assignedIntent: "Imperial" });
    const end = score(state, actorId, { type: "OFFICE_END_ORDERS" }, createInitialStrategyProfile(2), { assignedIntent: "Imperial" });
    expect(end.totalScore).toBeGreaterThan(blind.totalScore);
  });

  it("14. values Court Patronage at a coherent threshold and declines a dead route", () => {
    const { state, actorId } = fixture(2, 9314);
    const shifu = workerId(state, actorId, "shifu");
    state.players[actorId]!.completedOrders.push({ orderId: "I01", ceramicIds: [], completedInRound: 1, vpAwarded: 0, coinsAwarded: 0, usedGuanWaiver: false });
    state.players[actorId]!.resources.coins = 5;
    state.players[actorId]!.imperialProgress = 3;
    addFinished(state, actorId, "bowl", "fine");
    const coherent = score(state, actorId, { type: "USE_COURT_PATRONAGE", workerId: shifu }, createInitialStrategyProfile(2), { assignedIntent: "Imperial" });
    const coins = score(state, actorId, { type: "USE_LABOUR", workerId: shifu }, createInitialStrategyProfile(2), { assignedIntent: "Imperial" });
    expect(coherent.totalScore).toBeGreaterThan(coins.totalScore);
    state.players[actorId]!.imperialProgress = 0;
    state.round = 5;
    const dead = score(state, actorId, { type: "USE_COURT_PATRONAGE", workerId: shifu }, createInitialStrategyProfile(2), { assignedIntent: "Imperial" });
    expect(dead.totalScore).toBeLessThan(score(state, actorId, { type: "USE_LABOUR", workerId: shifu }).totalScore);
  });

  it("15. makes Volume intent acquire a feasible multi-ceramic destination first", () => {
    const { state, actorId } = fixture(2, 9315);
    addFinished(state, actorId, "bowl", "standard");
    addFinished(state, actorId, "bowl", "standard");
    const multi = score(state, actorId, { type: "OFFICE_TAKE_ORDER", orderId: "M15" }, createInitialStrategyProfile(2), { assignedIntent: "Volume-multi" });
    const single = score(state, actorId, { type: "OFFICE_TAKE_ORDER", orderId: "M01" }, createInitialStrategyProfile(2), { assignedIntent: "Volume-multi" });
    expect(multi.totalScore).toBeGreaterThan(single.totalScore);
  });

  it("16. does not start Volume production without a destination", () => {
    const { state, actorId } = fixture(2, 9316);
    state.players[actorId]!.orderHand = [];
    const apprentice = workerId(state, actorId, "apprentice");
    const form = score(state, actorId, { type: "FORM_CERAMICS", workerId: apprentice, shapes: ["bowl"] }, createInitialStrategyProfile(2), { assignedIntent: "Volume-multi" });
    const pass = score(state, actorId, { type: "PASS_WORK_PHASE" }, createInitialStrategyProfile(2), { assignedIntent: "Volume-multi" });
    expect(pass.totalScore).toBeGreaterThan(form.totalScore);
  });

  it("17. prefers round-5 conversion over speculative production", () => {
    const { state, actorId } = fixture(2, 9317);
    state.round = 5;
    state.players[actorId]!.orderHand = ["M01"];
    const glazed = addGlazed(state, actorId, "bowl", "white", "plain");
    const apprentice = workerId(state, actorId, "apprentice");
    const load = score(state, actorId, { type: "USE_KILN_YARD", workerId: apprentice, loads: [{ ceramicId: glazed.id, kilnSpaceId: "middle_1" }] });
    const form = score(state, actorId, { type: "FORM_CERAMICS", workerId: apprentice, shapes: ["plate"] });
    expect(load.totalScore).toBeGreaterThan(form.totalScore);
  });

  it("18. rejects T11, T13 and T15 when expected net use is negative", () => {
    const { state, actorId } = fixture(2, 9318);
    state.round = 5;
    state.players[actorId]!.orderHand = [];
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    const profile = createInitialStrategyProfile(2);
    const plan = buildPlayerPlan(observation, profile, "Technique-economy");
    for (const id of ["T11", "T13", "T15"] as const) expect(forecastTechniqueAcquisition(observation, profile, plan, id, "apprentice").netValue).toBeLessThanOrEqual(0);
  });

  it("19. acquires and uses a Technique in a positive planned scenario", () => {
    const { state, actorId } = fixture(2, 9319);
    state.players[actorId]!.orderHand = ["M10", "M11"];
    state.players[actorId]!.resources.coins = 6;
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    const profile = createInitialStrategyProfile(2);
    const plan = buildPlayerPlan(observation, profile, "Technique-economy");
    expect(forecastTechniqueAcquisition(observation, profile, plan, "T05", "shifu").netValue).toBeGreaterThan(0);
    const shaped = addShaped(state, actorId, "censer");
    addTechnique(state, actorId, "T05");
    const apprentice = workerId(state, actorId, "apprentice");
    const withTechnique = score(state, actorId, { type: "GLAZE_CERAMICS", workerId: apprentice, selections: [{ ceramicId: shaped.id, glaze: "moon_white", decoration: "carved" }], shifuMode: "normal", useTechniqueIds: ["T05"] }, profile, { assignedIntent: "Technique-economy" });
    const without = score(state, actorId, { type: "GLAZE_CERAMICS", workerId: apprentice, selections: [{ ceramicId: shaped.id, glaze: "moon_white", decoration: "carved" }], shifuMode: "normal", useTechniqueIds: [] }, profile, { assignedIntent: "Technique-economy" });
    expect(withTechnique.totalScore).toBeGreaterThan(without.totalScore);
  });

  it("20. uses Second Firing only when time and a higher-quality destination remain", () => {
    const { state, actorId } = fixture(2, 9320);
    state.round = 3;
    state.players[actorId]!.orderHand = ["M06"];
    const ceramic = addLoaded(state, actorId, "bowl", "white", "plain", "middle_1");
    afterFire(state, actorId, ceramic.id, 2, 1, 2, "standard");
    const earlyUse = score(state, actorId, { type: "RESOLVE_SECOND_FIRING", ceramicId: ceramic.id });
    const earlyDecline = score(state, actorId, { type: "RESOLVE_SECOND_FIRING", ceramicId: null });
    expect(earlyUse.totalScore).toBeGreaterThan(earlyDecline.totalScore);
    state.round = 5;
    expect(score(state, actorId, { type: "RESOLVE_SECOND_FIRING", ceramicId: ceramic.id }).totalScore)
      .toBeLessThan(score(state, actorId, { type: "RESOLVE_SECOND_FIRING", ceramicId: null }).totalScore);
  });

  it("21. uses Ding only when its extra vessel advances the plan", () => {
    const { state, actorId } = fixture(2, 9321);
    state.players[actorId]!.kilnId = "DI";
    state.players[actorId]!.orderHand = ["M15"];
    const apprentice = workerId(state, actorId, "apprentice");
    const useful = score(state, actorId, { type: "FORM_CERAMICS", workerId: apprentice, shapes: ["bowl"], dingExtraShape: "bowl" });
    const waste = score(state, actorId, { type: "FORM_CERAMICS", workerId: apprentice, shapes: ["bowl"], dingExtraShape: "plate" });
    expect(useful.totalScore).toBeGreaterThan(waste.totalScore);
  });

  it("22. keeps learning deterministic, bounded, non-zero and directional", () => {
    const profile = createInitialStrategyProfile(2);
    const result = (playerId: string, won: boolean): StrategyLearningResult => ({
      playerId, won, finalScore: won ? 24 : 2, actionCounts: { FORM_CERAMICS: won ? 5 : 10 },
      completedOrderIds: won ? ["M01"] : [], uncompletedOrders: won ? [] : [{ orderId: "I10", acquisitionFeasibility: 0.9, actionsInvested: 8 }],
      acquiredTechniqueIds: [], techniquePerformance: [], traditionId: won ? "RU" : "GE", assignedIntent: won ? "Market" : "Imperial",
      realizedTags: won ? ["Market-heavy"] : ["Imperial-heavy"], resourceRemainder: { clay: 2, wood: 2, coins: 3 },
      naturalMasterpieces: 1, finalMasterpieces: 1, flawedCeramics: 0, firedCeramics: 4, unusedFinishedCeramics: won ? 0 : 3,
    });
    const rows = [result("P1", true), result("P2", false)];
    const left = learnFromCompletedGame(profile, rows);
    const right = learnFromCompletedGame(profile, rows);
    expect(left).toEqual(right);
    expect(left.intentPriors.Market).toBeGreaterThan(0);
    expect(left.orderValues["I10"]).toBeLessThan(profile.orderValues["I10"]!);
    expect(Math.abs(left.intentPriors.Market)).toBeLessThanOrEqual(1.25);
  });

  it("23. never mutates the profile during a holdout game", async () => {
    const profile = createInitialStrategyProfile(2);
    const before = JSON.stringify(profile);
    await runSelfPlayGame({
      gameId: "selfplay-003-holdout-profile", gameSequence: 51, playerCount: 2, gameSeed: 0x330051, aiSeed: 0x330052,
      assignedTraditions: assignedTraditionsForGame(2, 51), assignedIntents: assignedStrategyIntentsForGame(2, 51), datasetSplit: "holdout", profile, explorationRate: 0,
    });
    expect(JSON.stringify(profile)).toBe(before);
  });

  it("24. produces stable source and seed hashes and accepts fresh holdout seeds", async () => {
    const left = await createSourceIdentity(process.cwd());
    const right = await createSourceIdentity(process.cwd());
    expect(sourceIdentityHash(left)).toBe(sourceIdentityHash(right));
    expect(sha256("stable-seed-schedule")).toBe(sha256("stable-seed-schedule"));
    await expect(assertFreshHoldoutSeeds([{ datasetSplit: "holdout", candidateSeeds: [{ gameSeed: 0xf3000001, aiSeed: 0xf3000002 }] }])).resolves.toBeUndefined();
  });

  it("25. completes a full authoritative game with zero illegal selections", async () => {
    const profile: AIStrategyProfile = createInitialStrategyProfile(2);
    const result = await runSelfPlayGame({
      gameId: "selfplay-003-legality", gameSequence: 51, playerCount: 2, gameSeed: 0x330101, aiSeed: 0x330102,
      assignedTraditions: assignedTraditionsForGame(2, 51), assignedIntents: assignedStrategyIntentsForGame(2, 51), datasetSplit: "holdout", profile, explorationRate: 0.04,
    });
    expect(result.state.phase.type).toBe("finished");
    expect(result.illegalActionAttempts).toBe(0);
  });

  it("26. retains rational positive-use cases for Jun and Protective Saggars", () => {
    const junFixture = fixture(2, 9326);
    junFixture.state.players[junFixture.actorId]!.kilnId = "JU";
    const junCeramic = addLoaded(junFixture.state, junFixture.actorId, "bowl", "celadon", "plain", "middle_1");
    afterFire(junFixture.state, junFixture.actorId, junCeramic.id, 2, 1, 1);
    const junUse = score(junFixture.state, junFixture.actorId, { type: "RESOLVE_JUN", ceramicId: junCeramic.id, delta: -1 });
    const junDecline = score(junFixture.state, junFixture.actorId, { type: "RESOLVE_JUN", ceramicId: null, delta: null });
    expect(junUse.totalScore).toBeGreaterThan(junDecline.totalScore);

    const t10Fixture = fixture(2, 9327);
    const t10Ceramic = addLoaded(t10Fixture.state, t10Fixture.actorId, "bowl", "white", "plain", "middle_1");
    t10Fixture.state.players[t10Fixture.actorId]!.resources.coins = 5;
    afterFire(t10Fixture.state, t10Fixture.actorId, t10Ceramic.id, 2, 2, 3, "flawed");
    const t10Use = score(t10Fixture.state, t10Fixture.actorId, { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: t10Ceramic.id });
    const t10Decline = score(t10Fixture.state, t10Fixture.actorId, { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: null });
    expect(t10Use.totalScore).toBeGreaterThan(t10Decline.totalScore);
  });

  it("27. enumerates Presentation choices for every eligible simultaneous submitter", () => {
    const { state } = fixture(2, 9328);
    const [first, second] = state.playerOrder;
    if (first === undefined || second === undefined) throw new Error("fixture players missing");
    state.phase = { type: "presentation", eligiblePlayerIds: [first, second], submittedPlayerIds: [first] };
    const legal = getLegalAIActions(state, second, createPrivateFiringState(state));
    expect(legal).toContainEqual({ type: "SUBMIT_PRESENTATION", ceramicIds: [], featuredCeramicIds: [] });
  });
});
