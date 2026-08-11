import { describe, expect, it } from "vitest";
import {
  IMPERIAL_ORDERS,
  IMPERIAL_TRACK_CANDIDATE_A_CONFIG,
  IMPERIAL_TRACK_CANDIDATE_B_CONFIG,
  OFFICIAL_IMPERIAL_TRACK_RULES,
  ORDER_DEFINITIONS,
  SeededRandom,
  activeImperialOrderProgressReward,
  activeImperialTrackRules,
  applyAction,
  calculateFinalResult,
  createGame,
  turnOrderFromFirst,
} from "../src/game";
import type {
  GameEvent,
  GameExperimentConfig,
  GameState,
  PlayerId,
} from "../src/game";
import {
  EXPECTED_IMPERIAL_FROZEN_PROFILE_HASH,
  loadHistoricalArchive,
  validateHistoricalArchive,
} from "../src/ai/imperialTrackExperiment.ts";
import { imperialTrackExperimentFields } from "../src/ai/imperialTrackReporting.ts";
import type { SelfPlayGameResult } from "../src/ai/selfplay.ts";
import { addFinished, expectError, playerInputs, startedGame, workerId } from "./helpers";

type FixtureOrder = "I01" | "I05" | "I06";

function candidateGame(config: GameExperimentConfig, seed: number): ReturnType<typeof startedGame> {
  const fixture = startedGame(2, seed);
  fixture.state.experimentConfig = config;
  return fixture;
}

function setOrderPhase(state: GameState, actorId: PlayerId): void {
  const order = turnOrderFromFirst(state);
  state.phase = {
    type: "orders",
    turnOrder: order,
    currentIndex: order.indexOf(actorId),
    activePlayerId: actorId,
  };
}

function orderCeramics(state: GameState, actorId: PlayerId, orderId: FixtureOrder): string[] {
  if (orderId === "I01") {
    return [addFinished(state, actorId, "bowl", "masterpiece", "celadon", "plain").id];
  }
  if (orderId === "I05") {
    return [addFinished(state, actorId, "censer", "fine", "grey_green", "crackle").id];
  }
  return [
    addFinished(state, actorId, "bowl", "masterpiece", "white", "plain").id,
    addFinished(state, actorId, "plate", "fine", "white", "carved").id,
  ];
}

function complete(
  state: GameState,
  rng: SeededRandom,
  actorId: PlayerId,
  orderId: FixtureOrder,
) {
  setOrderPhase(state, actorId);
  const ceramicIds = orderCeramics(state, actorId, orderId);
  state.players[actorId]!.orderHand.push(orderId);
  const result = applyAction(state, actorId, {
    type: "COMPLETE_ORDER",
    orderId,
    ceramicIds,
    useGuanWaiver: false,
  }, rng);
  expect(result.ok, result.ok ? undefined : JSON.stringify(result.error)).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

function progressEvent(events: readonly GameEvent[]) {
  const event = events.find((candidate) => candidate.type === "IMPERIAL_PROGRESS_ADVANCED");
  if (event?.type !== "IMPERIAL_PROGRESS_ADVANCED") throw new Error("Missing Progress event");
  return event;
}

function recordImperialCompletion(state: GameState, playerId: PlayerId): void {
  state.players[playerId]!.completedOrders.push({
    orderId: "I01",
    ceramicIds: [],
    completedInRound: 1,
    vpAwarded: 0,
    coinsAwarded: 0,
    usedGuanWaiver: false,
  });
}

describe("imperial-track-ab-001 deterministic preflight", () => {
  it("1. default configuration uses official V1.0.2", () => {
    expect(activeImperialTrackRules(undefined)).toEqual(OFFICIAL_IMPERIAL_TRACK_RULES);
    for (const order of IMPERIAL_ORDERS) {
      expect(activeImperialOrderProgressReward(undefined, order.imperialProgressReward!))
        .toBe(order.imperialProgressReward);
    }
    const fixture = startedGame(2, 11_001);
    const actorId = fixture.state.firstPlayerId;
    const result = complete(fixture.state, fixture.rng, actorId, "I01");
    expect(result.state.players[actorId]!.imperialProgress).toBe(1);
    expect(progressEvent(result.events)).toEqual(expect.objectContaining({
      type: "IMPERIAL_PROGRESS_ADVANCED", playerId: actorId, from: 0, to: 1, reward: 1,
    }));
  });

  it("2. Candidate A gives every Imperial Order +2, including all requirement categories", () => {
    for (const order of IMPERIAL_ORDERS) {
      expect(activeImperialOrderProgressReward(
        IMPERIAL_TRACK_CANDIDATE_A_CONFIG,
        order.imperialProgressReward!,
      )).toBe(2);
    }
    for (const [orderId, category, seed] of [
      ["I05", "single_fine", 11_010],
      ["I01", "single_masterpiece", 11_011],
      ["I06", "multi_2", 11_012],
    ] as const) {
      const fixture = candidateGame(IMPERIAL_TRACK_CANDIDATE_A_CONFIG, seed);
      const actorId = fixture.state.firstPlayerId;
      const result = complete(fixture.state, fixture.rng, actorId, orderId);
      expect(result.state.players[actorId]!.imperialProgress).toBe(2);
      expect(progressEvent(result.events)).toMatchObject({ reward: 2, requirementCategory: category });
    }
  });

  it("3. historical Candidate A retains its V1.0.1 control curve and milestones", () => {
    const rules = activeImperialTrackRules(IMPERIAL_TRACK_CANDIDATE_A_CONFIG);
    expect(rules.trackVp).toEqual([0, 1, 1, 3, 3, 7]);
    expect(rules.apprenticeMilestoneSpaces).toEqual([2, 4]);
    expect(rules.presentationSpaces).toEqual([4, 5]);
    expect(rules.imperialSealVp).toBe(3);
  });

  it("4. Candidate B retains printed +1 single / +2 multi Progress", () => {
    for (const order of IMPERIAL_ORDERS) {
      expect(activeImperialOrderProgressReward(
        IMPERIAL_TRACK_CANDIDATE_B_CONFIG,
        order.imperialProgressReward!,
      )).toBe(order.imperialProgressReward);
    }
    const single = candidateGame(IMPERIAL_TRACK_CANDIDATE_B_CONFIG, 11_020);
    const singleActor = single.state.firstPlayerId;
    expect(complete(single.state, single.rng, singleActor, "I01").state.players[singleActor]!.imperialProgress).toBe(1);
    const multi = candidateGame(IMPERIAL_TRACK_CANDIDATE_B_CONFIG, 11_021);
    const multiActor = multi.state.firstPlayerId;
    expect(complete(multi.state, multi.rng, multiActor, "I06").state.players[multiActor]!.imperialProgress).toBe(2);
  });

  it("5. Candidate B unlocks Apprentices at spaces 1 and 3", () => {
    const first = candidateGame(IMPERIAL_TRACK_CANDIDATE_B_CONFIG, 11_030);
    const actorId = first.state.firstPlayerId;
    const result = complete(first.state, first.rng, actorId, "I01");
    expect(result.state.players[actorId]!.pendingApprenticeUnlocks).toBe(1);
    expect(progressEvent(result.events).apprenticeMilestonesTriggered).toEqual([1]);

    const second = candidateGame(IMPERIAL_TRACK_CANDIDATE_B_CONFIG, 11_031);
    const secondActor = second.state.firstPlayerId;
    second.state.players[secondActor]!.imperialProgress = 2;
    const secondResult = complete(second.state, second.rng, secondActor, "I01");
    expect(secondResult.state.players[secondActor]!.pendingApprenticeUnlocks).toBe(1);
    expect(progressEvent(secondResult.events).apprenticeMilestonesTriggered).toEqual([3]);
  });

  it("6. Candidate B scores the exact 0/0/2/2/4/8 track", () => {
    const expected = [0, 0, 2, 2, 4, 8];
    expect(activeImperialTrackRules(IMPERIAL_TRACK_CANDIDATE_B_CONFIG).trackVp).toEqual(expected);
    for (let progress = 0; progress <= 5; progress += 1) {
      const fixture = candidateGame(IMPERIAL_TRACK_CANDIDATE_B_CONFIG, 11_040 + progress);
      const actorId = fixture.state.firstPlayerId;
      fixture.state.players[actorId]!.imperialProgress = progress as 0 | 1 | 2 | 3 | 4 | 5;
      expect(calculateFinalResult(fixture.state).scores[actorId]!.imperialProgress).toBe(expected[progress]);
    }
  });

  it("7. Candidate B gives the first space-5 arrival exactly one 2-VP Seal", () => {
    const fixture = candidateGame(IMPERIAL_TRACK_CANDIDATE_B_CONFIG, 11_050);
    const [firstId, secondId] = turnOrderFromFirst(fixture.state) as [PlayerId, PlayerId];
    fixture.state.players[firstId]!.imperialProgress = 4;
    fixture.state.players[secondId]!.imperialProgress = 4;
    let first = complete(fixture.state, fixture.rng, firstId, "I01");
    expect(first.state.imperialSealOwnerId).toBe(firstId);
    expect(first.events.filter(({ type }) => type === "IMPERIAL_SEAL_CLAIMED")).toEqual([
      { type: "IMPERIAL_SEAL_CLAIMED", playerId: firstId, sealVp: 2 },
    ]);
    first.state.phase = { type: "orders", turnOrder: [secondId], currentIndex: 0, activePlayerId: secondId };
    const second = complete(first.state, fixture.rng, secondId, "I01");
    expect(second.state.imperialSealOwnerId).toBe(firstId);
    expect(second.events.some(({ type }) => type === "IMPERIAL_SEAL_CLAIMED")).toBe(false);
    expect(calculateFinalResult(second.state).scores[firstId]!.imperialSeal).toBe(2);
    expect(calculateFinalResult(second.state).scores[secondId]!.imperialSeal).toBe(0);
  });

  it("8. Candidate B resolves Presentation only at spaces 4 and 5", () => {
    expect(activeImperialTrackRules(IMPERIAL_TRACK_CANDIDATE_B_CONFIG).presentationSpaces).toEqual([4, 5]);
    for (const progress of [4, 5] as const) {
      const fixture = candidateGame(IMPERIAL_TRACK_CANDIDATE_B_CONFIG, 11_060 + progress);
      const actorId = fixture.state.firstPlayerId;
      fixture.state.players[actorId]!.imperialProgress = progress;
      fixture.state.phase = { type: "presentation", eligiblePlayerIds: [actorId], submittedPlayerIds: [] };
      const result = applyAction(fixture.state, actorId, { type: "SUBMIT_PRESENTATION", ceramicIds: [] }, fixture.rng);
      expect(result.ok).toBe(true);
    }
    const below = candidateGame(IMPERIAL_TRACK_CANDIDATE_B_CONFIG, 11_063);
    const belowId = below.state.firstPlayerId;
    below.state.players[belowId]!.imperialProgress = 3;
    below.state.phase = { type: "presentation", eligiblePlayerIds: [], submittedPlayerIds: [] };
    expectError(applyAction(below.state, belowId, { type: "SUBMIT_PRESENTATION", ceramicIds: [] }, below.rng), "PRESENTATION_NOT_ELIGIBLE");
  });

  it("9. multi-space moves trigger crossed milestones once and in ascending order", () => {
    const fixture = candidateGame(IMPERIAL_TRACK_CANDIDATE_B_CONFIG, 11_070);
    const actorId = fixture.state.firstPlayerId;
    fixture.state.players[actorId]!.imperialProgress = 2;
    const result = complete(fixture.state, fixture.rng, actorId, "I06");
    const event = progressEvent(result.events);
    expect(event.crossedSpaces).toEqual([3, 4]);
    expect(event.apprenticeMilestonesTriggered).toEqual([3]);
    expect(event.presentationMilestonesTriggered).toEqual([4]);
    expect(result.state.players[actorId]!.pendingApprenticeUnlocks).toBe(1);
  });

  it("10. candidate Progress caps at 5 and records cap loss", () => {
    const fixture = candidateGame(IMPERIAL_TRACK_CANDIDATE_A_CONFIG, 11_080);
    const actorId = fixture.state.firstPlayerId;
    fixture.state.players[actorId]!.imperialProgress = 4;
    const result = complete(fixture.state, fixture.rng, actorId, "I05");
    expect(result.state.players[actorId]!.imperialProgress).toBe(5);
    expect(progressEvent(result.events)).toMatchObject({ reward: 2, appliedGain: 1, capLoss: 1, crossedSpaces: [5] });
  });

  it("11. Court Patronage stays +1 for 5 Coins and cannot reach space 5", () => {
    const fixture = candidateGame(IMPERIAL_TRACK_CANDIDATE_B_CONFIG, 11_090);
    const actorId = fixture.state.firstPlayerId;
    recordImperialCompletion(fixture.state, actorId);
    fixture.state.players[actorId]!.resources.coins = 8;
    fixture.state.players[actorId]!.imperialProgress = 3;
    const result = applyAction(fixture.state, actorId, {
      type: "USE_COURT_PATRONAGE",
      workerId: workerId(fixture.state, actorId, "shifu"),
    }, fixture.rng);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.players[actorId]!.imperialProgress).toBe(4);
    expect(result.state.players[actorId]!.resources.coins).toBe(3);
    expect(result.state.imperialSealOwnerId).toBeNull();

    const capped = candidateGame(IMPERIAL_TRACK_CANDIDATE_A_CONFIG, 11_091);
    const cappedId = capped.state.firstPlayerId;
    recordImperialCompletion(capped.state, cappedId);
    capped.state.players[cappedId]!.resources.coins = 8;
    capped.state.players[cappedId]!.imperialProgress = 4;
    expectError(applyAction(capped.state, cappedId, {
      type: "USE_COURT_PATRONAGE",
      workerId: workerId(capped.state, cappedId, "shifu"),
    }, capped.rng), "INVALID_ACTION");
  });

  it("12. no Imperial Order gains Coins", () => {
    expect(IMPERIAL_ORDERS).toHaveLength(13);
    expect(IMPERIAL_ORDERS.every(({ coins }) => coins === 0)).toBe(true);
  });

  it("13. candidate metadata survives normalized export fields", () => {
    const result = {
      config: {
        gameId: "metadata-fixture",
        experimentConfig: IMPERIAL_TRACK_CANDIDATE_A_CONFIG,
        experimentMetadata: {
          pairId: "v101-selfplay003-2p-051",
          matchedScenarioId: "v101-selfplay003-2p-051",
          archivedControlGameId: "v101-selfplay003-2p-051",
          replacementIndex: 0,
          frozenProfileHash: EXPECTED_IMPERIAL_FROZEN_PROFILE_HASH,
          policyVersion: "selfplay-003-frozen",
          simulationVersion: "v1.0.1-imperial-track-ab-001-candidate-a",
        },
      },
    } as unknown as SelfPlayGameResult;
    expect(imperialTrackExperimentFields(result)).toMatchObject({
      experiment_id: "imperial-track-ab-001",
      experiment_arm: "all_imperial_orders_progress_2",
      matched_scenario_id: "v101-selfplay003-2p-051",
      archived_control_game_id: "v101-selfplay003-2p-051",
      frozen_profile_hash: EXPECTED_IMPERIAL_FROZEN_PROFILE_HASH,
      active_track_vp: "0|1|1|3|3|7",
    });
  });

  it("14. frozen-profile hash gate accepts the archive and rejects a mismatch", async () => {
    const archive = await loadHistoricalArchive(process.cwd());
    expect(archive.profileHash).toBe(EXPECTED_IMPERIAL_FROZEN_PROFILE_HASH);
    expect(validateHistoricalArchive(archive)).toEqual([]);
    expect(validateHistoricalArchive({ ...archive, profileHash: "bad" })
      .some((error) => error.includes("frozen profile hash"))).toBe(true);
  });

  it("15. replay scenario inputs map one-to-one to the archived holdout", async () => {
    const archive = await loadHistoricalArchive(process.cwd());
    expect(archive.scenarios).toHaveLength(150);
    expect(archive.scenarios.filter(({ playerCount }) => playerCount === 2)).toHaveLength(50);
    expect(archive.scenarios.filter(({ playerCount }) => playerCount === 3)).toHaveLength(50);
    expect(archive.scenarios.filter(({ playerCount }) => playerCount === 4)).toHaveLength(50);
    archive.scenarios.forEach((scenario, index) => {
      const game = archive.holdoutGames[index]!;
      expect(scenario.matchedScenarioId).toBe(game.config.gameId);
      expect(scenario.gameSeed).toBe(game.config.gameSeed);
      expect(scenario.aiSeed).toBe(game.config.aiSeed);
      expect(scenario.assignedTraditions).toEqual(game.config.assignedTraditions);
      expect(scenario.assignedIntents).toEqual(game.config.assignedIntents);
    });
  });

  it("16. candidate rules cannot leak into default production setup", () => {
    const defaultGame = createGame({ gameId: "production-default", players: playerInputs(2) }, new SeededRandom(11_100));
    expect(defaultGame.ok).toBe(true);
    if (!defaultGame.ok) throw new Error(defaultGame.error.message);
    expect(defaultGame.state.experimentConfig).toBeUndefined();
    expect(activeImperialTrackRules(defaultGame.state.experimentConfig)).toEqual(OFFICIAL_IMPERIAL_TRACK_RULES);
    const invalidCombined = createGame({
      gameId: "invalid-combined-arm",
      players: playerInputs(2),
      experimentConfig: {
        ...IMPERIAL_TRACK_CANDIDATE_A_CONFIG,
        imperialProgressTrackVp: [0, 0, 2, 2, 4, 8],
      } as GameExperimentConfig,
    }, new SeededRandom(11_101));
    expect(invalidCombined.ok).toBe(false);
    expect(ORDER_DEFINITIONS["I01"]!.imperialProgressReward).toBe(1);
  });
});
