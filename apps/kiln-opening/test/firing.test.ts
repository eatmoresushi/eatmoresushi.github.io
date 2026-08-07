import { describe, expect, it } from "vitest";
import {
  applyAction,
  createPrivateFiringState,
  currentDecisionActor,
  determineBaseHeat,
  kilnZoneModifier,
  qualityFromDifference,
  submitWoodContribution,
  turnOrderFromFirst,
} from "../src/game";
import type {
  GameState,
  PrivateFiringState,
  SubmitContributionResult,
  WoodContribution,
} from "../src/game";
import {
  addLoaded,
  addTechnique,
  expectError,
  mustApply,
  startedGame,
} from "./helpers";

function enterFiring(state: GameState, rng: ReturnType<typeof startedGame>["rng"]): GameState {
  let next = state;
  while (next.phase.type === "work") {
    next = mustApply(next, next.phase.activePlayerId, { type: "PASS_WORK_PHASE" }, rng);
  }
  return next;
}

function mustSubmit(
  state: GameState,
  privateState: PrivateFiringState,
  actorId: string,
  amount: WoodContribution,
  rng: ReturnType<typeof startedGame>["rng"],
): Extract<SubmitContributionResult, { ok: true }> {
  const result = submitWoodContribution(state, privateState, actorId, amount, rng);
  expect(result.ok, result.ok ? undefined : JSON.stringify(result.error)).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

describe("contributor-scaled Base Heat and Quality", () => {
  it.each([
    [1, 0, 1], [1, 1, 2], [1, 2, 2], [1, 3, 3],
    [2, 1, 1], [2, 2, 2], [2, 4, 2], [2, 5, 3],
    [3, 2, 1], [3, 3, 2], [3, 6, 2], [3, 7, 3],
    [4, 3, 1], [4, 4, 2], [4, 8, 2], [4, 9, 3],
  ] as const)("N=%s and Wood=%s gives Base Heat %s", (contributors, wood, expected) => {
    expect(determineBaseHeat(contributors, wood)).toBe(expected);
  });

  it("maps Heat Difference 0/1/2/3+ to the exact Quality ladder", () => {
    expect([0, 1, 2, 3, 7].map(qualityFromDifference)).toEqual([
      "masterpiece",
      "fine",
      "standard",
      "flawed",
      "flawed",
    ]);
  });

  it("applies High/Middle/Low zone modifiers and supports the +1 Fire card", () => {
    expect([
      kilnZoneModifier("high_1"),
      kilnZoneModifier("middle_1"),
      kilnZoneModifier("low_1"),
    ]).toEqual([1, 0, -1]);

    const game = startedGame(2, 602);
    const actorId = game.state.firstPlayerId;
    const ceramic = addLoaded(game.state, actorId, "vase", "moon_white", "plain", "low_1");
    game.state.fireDeck[0] = 1;
    let state = enterFiring(game.state, game.rng);
    state = mustSubmit(
      state,
      createPrivateFiringState(state),
      actorId,
      1,
      game.rng,
    ).state;
    expect(state.ceramics[ceramic.id]).toEqual(
      expect.objectContaining({ stage: "finished", quality: "fine" }),
    );
  });
});

describe("private Wood boundary", () => {
  it("keeps values outside GameState until the atomic reveal and counts a zero contributor", () => {
    const game = startedGame(2, 600);
    const [firstId, secondId] = turnOrderFromFirst(game.state);
    addLoaded(game.state, firstId!, "bowl", "celadon", "plain", "middle_1");
    addLoaded(game.state, secondId!, "bowl", "white", "plain", "middle_2");
    game.state.fireDeck[0] = 0;
    let state = enterFiring(game.state, game.rng);
    expect(state.phase.type).toBe("firing_contributions");
    let privateState = createPrivateFiringState(state);
    const firstWood = state.players[firstId!]!.resources.wood;

    const first = mustSubmit(state, privateState, firstId!, 1, game.rng);
    state = first.state;
    privateState = first.privateState;
    expect(state.players[firstId!]!.resources.wood).toBe(firstWood);
    expect(state.firingContext).toBeNull();
    expect(state.phase).toEqual(
      expect.objectContaining({ type: "firing_contributions", submittedPlayerIds: [firstId] }),
    );
    expect(privateState.contributions[firstId!]).toBe(1);

    const second = mustSubmit(state, privateState, secondId!, 0, game.rng);
    state = second.state;
    expect(second.privateState).toEqual({ gameId: state.gameId, windowId: null, contributions: {} });
    expect(state.players[firstId!]!.resources.wood).toBe(firstWood - 1);
    expect(second.events.some((event) => event.type === "WOOD_REVEALED")).toBe(true);
    expect(second.events).toContainEqual(
      expect.objectContaining({ type: "FIRE_REVEALED", baseHeat: 1 }),
    );
    expect(state.phase.type).toBe("orders");
  });

  it("rejects non-contributors, unaffordable values, and duplicate submissions", () => {
    const game = startedGame(2, 601);
    const contributorId = game.state.firstPlayerId;
    const otherId = game.state.playerOrder.find((id) => id !== contributorId)!;
    addLoaded(game.state, contributorId, "bowl", "white", "plain", "middle_1");
    const state = enterFiring(game.state, game.rng);
    const privateState = createPrivateFiringState(state);
    expect(submitWoodContribution(state, privateState, otherId, 0, game.rng)).toEqual(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "NOT_CONTRIBUTOR" }) }),
    );
    expect(submitWoodContribution(state, privateState, contributorId, 3, game.rng)).toEqual(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "INVALID_CONTRIBUTION" }) }),
    );
    const submitted = mustSubmit(state, privateState, contributorId, 0, game.rng);
    const duplicate = submitWoodContribution(
      state,
      { ...privateState, contributions: { [contributorId]: 0 } },
      contributorId,
      0,
      game.rng,
    );
    expect(duplicate.ok).toBe(false);
    expect(submitted.state.phase.type).toBe("orders");
  });
});

describe("firing timing windows", () => {
  it("resolves Kiln Setting in First-Player order before Contributions", () => {
    const game = startedGame(2, 610);
    const order = turnOrderFromFirst(game.state);
    for (let index = 0; index < order.length; index += 1) {
      const playerId = order[index]!;
      addTechnique(game.state, playerId, "T09");
      addLoaded(game.state, playerId, "bowl", "white", "plain", `middle_${index + 1}` as "middle_1" | "middle_2");
    }
    let state = enterFiring(game.state, game.rng);
    expect(state.phase).toEqual({
      type: "firing_before_contribution",
      queue: { actors: order, currentIndex: 0 },
    });
    const firstActor = currentDecisionActor(state.phase)!;
    const ceramic = Object.values(state.ceramics).find((item) => item.ownerId === firstActor)!;
    state = mustApply(
      state,
      firstActor,
      { type: "RESOLVE_KILN_SETTING", ceramicId: ceramic.id, toSpaceId: "high_1" },
      game.rng,
    );
    expect(state.ceramics[ceramic.id]).toEqual(
      expect.objectContaining({ stage: "loaded", kilnSpaceId: "high_1" }),
    );
    expect(state.players[firstActor]!.techniques[0]!.exhausted).toBe(true);
    state = mustApply(
      state,
      currentDecisionActor(state.phase)!,
      { type: "RESOLVE_KILN_SETTING", ceramicId: null, toSpaceId: null },
      game.rng,
    );
    expect(state.phase.type).toBe("firing_contributions");
  });

  it("Fuel Ledger spends after reveal, can raise effective contribution above the card value, and preserves N", () => {
    const game = startedGame(2, 611);
    const actorId = game.state.firstPlayerId;
    game.state.players[actorId]!.kilnId = "JU";
    game.state.players[actorId]!.resources.wood = 4;
    addTechnique(game.state, actorId, "T11");
    addLoaded(game.state, actorId, "bowl", "white", "plain", "middle_1");
    game.state.fireDeck[0] = 0;
    let state = enterFiring(game.state, game.rng);
    let privateState = createPrivateFiringState(state);
    const submitted = mustSubmit(state, privateState, actorId, 3, game.rng);
    state = submitted.state;
    privateState = submitted.privateState;
    expect(state.phase.type).toBe("firing_after_reveal");
    state = mustApply(state, actorId, { type: "RESOLVE_FUEL_LEDGER", use: true }, game.rng);
    expect(state.phase.type).toBe("firing_before_quality");
    expect(state.firingContext?.contributors).toEqual([actorId]);
    expect(state.firingContext?.contributions[actorId]).toBe(4);
    expect(state.firingContext?.baseHeat).toBe(3);
    expect(state.players[actorId]!.resources).toEqual({ clay: 2, wood: 0, coins: 2 });
    expect(privateState.contributions).toEqual({});
  });

  it("Jun changes Actual Heat by exactly ±1 before Quality", () => {
    const game = startedGame(2, 612);
    const actorId = game.state.firstPlayerId;
    game.state.players[actorId]!.kilnId = "JU";
    const ceramic = addLoaded(game.state, actorId, "bowl", "celadon", "plain", "middle_1");
    game.state.fireDeck[0] = -1;
    let state = enterFiring(game.state, game.rng);
    let privateState = createPrivateFiringState(state);
    ({ state, privateState } = mustSubmit(state, privateState, actorId, 1, game.rng));
    expect(state.firingContext?.ceramicResults[ceramic.id]?.naturalHeatDifference).toBe(1);
    state = mustApply(
      state,
      actorId,
      { type: "RESOLVE_JUN", ceramicId: ceramic.id, delta: 1 },
      game.rng,
    );
    expect(state.ceramics[ceramic.id]).toEqual(
      expect.objectContaining({ stage: "finished", quality: "masterpiece" }),
    );
  });

  it("Ge converts natural difference 1 to Masterpiece and Crackle with no refund", () => {
    const game = startedGame(2, 613);
    const actorId = game.state.firstPlayerId;
    game.state.players[actorId]!.kilnId = "GE";
    const coinsBefore = game.state.players[actorId]!.resources.coins;
    const ceramic = addLoaded(game.state, actorId, "bowl", "celadon", "carved", "middle_1");
    game.state.fireDeck[0] = -1;
    let state = enterFiring(game.state, game.rng);
    let privateState = createPrivateFiringState(state);
    ({ state, privateState } = mustSubmit(state, privateState, actorId, 1, game.rng));
    state = mustApply(state, actorId, { type: "RESOLVE_GE", ceramicId: ceramic.id }, game.rng);
    expect(state.ceramics[ceramic.id]).toEqual(
      expect.objectContaining({ stage: "finished", quality: "masterpiece", decoration: "crackle" }),
    );
    expect(state.players[actorId]!.resources.coins).toBe(coinsBefore);
  });

  it("Protective Saggars improves only an assigned Flawed ceramic to Standard", () => {
    const game = startedGame(2, 614);
    const actorId = game.state.firstPlayerId;
    game.state.players[actorId]!.kilnId = "RU";
    game.state.players[actorId]!.resources.wood = 3;
    addTechnique(game.state, actorId, "T10");
    const ceramic = addLoaded(game.state, actorId, "bowl", "white", "plain", "high_1");
    game.state.fireDeck[0] = 0;
    let state = enterFiring(game.state, game.rng);
    let privateState = createPrivateFiringState(state);
    ({ state, privateState } = mustSubmit(state, privateState, actorId, 3, game.rng));
    expect(state.phase.type).toBe("firing_after_quality");
    state = mustApply(
      state,
      actorId,
      { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: ceramic.id },
      game.rng,
    );
    expect(state.ceramics[ceramic.id]).toEqual(
      expect.objectContaining({ stage: "finished", quality: "standard" }),
    );
    expect(state.players[actorId]!.resources.coins).toBe(2);
  });

  it("Test Pieces uses the immutable natural exact-match snapshot after Jun alters heat", () => {
    const game = startedGame(2, 615);
    const actorId = game.state.firstPlayerId;
    game.state.players[actorId]!.kilnId = "JU";
    addTechnique(game.state, actorId, "T12");
    const ceramic = addLoaded(game.state, actorId, "bowl", "celadon", "plain", "middle_1");
    game.state.fireDeck[0] = 0;
    let state = enterFiring(game.state, game.rng);
    let privateState = createPrivateFiringState(state);
    ({ state, privateState } = mustSubmit(state, privateState, actorId, 1, game.rng));
    expect(state.firingContext?.ceramicResults[ceramic.id]?.naturalExactMatch).toBe(true);
    state = mustApply(
      state,
      actorId,
      { type: "RESOLVE_JUN", ceramicId: ceramic.id, delta: 1 },
      game.rng,
    );
    expect(state.phase.type).toBe("firing_after_firing");
    const coinsBefore = state.players[actorId]!.resources.coins;
    state = mustApply(state, actorId, { type: "RESOLVE_TEST_PIECES", use: true }, game.rng);
    expect(state.players[actorId]!.resources.coins).toBe(coinsBefore + 1);
    expect(state.ceramics[ceramic.id]).toEqual(
      expect.objectContaining({ stage: "finished", quality: "fine" }),
    );
  });

  it("Ru scores once after all firing effects from final Celadon/Plain Masterpiece state", () => {
    const game = startedGame(2, 616);
    const actorId = game.state.firstPlayerId;
    game.state.players[actorId]!.kilnId = "RU";
    addLoaded(game.state, actorId, "bowl", "celadon", "plain", "middle_1");
    game.state.fireDeck[0] = 0;
    let state = enterFiring(game.state, game.rng);
    const privateState = createPrivateFiringState(state);
    state = mustSubmit(state, privateState, actorId, 1, game.rng).state;
    expect(state.players[actorId]!.score.kilnTraditionVp).toBe(2);
    expect(state.players[actorId]!.kilnAbilityUsedThisRound).toBe(true);
  });
});
