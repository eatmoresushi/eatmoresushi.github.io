import { describe, expect, it } from "vitest";
import {
  FIRE_CARDS,
  GAME_CONFIG,
  applyAction,
  createPrivateFiringState,
  submitWoodContribution,
} from "../src/game";
import type {
  FireModifier,
  GameAction,
  GameState,
  Quality,
  WoodContribution,
} from "../src/game";
import { projectPublicGameState } from "../src/multiplayer";
import { addLoaded, addTechnique, expectError, mustApply, startedGame } from "./helpers";

type TestGame = ReturnType<typeof startedGame>;

function enterFiring(state: GameState, rng: TestGame["rng"]): GameState {
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
  rng: TestGame["rng"],
) {
  const result = submitWoodContribution(
    state,
    createPrivateFiringState(state),
    actorId,
    amount,
    rng,
  );
  expect(result.ok, result.ok ? undefined : JSON.stringify(result.error)).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

describe("V1.0.1 Fire deck", () => {
  it("contains the exact symmetric 5/3/4/3/5 distribution", () => {
    const count = (modifier: FireModifier) => FIRE_CARDS.filter((card) => card === modifier).length;
    expect(FIRE_CARDS).toHaveLength(20);
    expect([-2, -1, 0, 1, 2].map((value) => count(value as FireModifier))).toEqual([5, 3, 4, 3, 5]);
    expect(count(-2)).toBe(count(2));
    expect(count(-1)).toBe(count(1));
    expect(GAME_CONFIG.fireDeck).toEqual({ "-2": 5, "-1": 3, "0": 4, "1": 3, "2": 5 });
  });

  it.each([
    [-2, 0, "fine"],
    [-1, 1, "masterpiece"],
    [0, 2, "fine"],
    [1, 3, "standard"],
    [2, 4, "flawed"],
  ] as const)("resolves Fire %s through the unchanged heat and Quality system", (modifier, globalHeat, quality) => {
    const game = startedGame(2, 10100 + modifier);
    const actorId = game.state.firstPlayerId;
    game.state.players[actorId]!.kilnId = "DI";
    const ceramic = addLoaded(game.state, actorId, "bowl", "white", "plain", "middle_1");
    game.state.fireDeck[0] = modifier;
    const firing = enterFiring(game.state, game.rng);
    const resolved = submitOnlyContributor(firing, actorId, 1, game.rng);

    expect(resolved.state.lastFiringResult).toEqual({
      round: 1,
      contributors: [actorId],
      contributions: { [actorId]: 1 },
      baseHeat: 2,
      fireModifier: modifier,
      globalHeat,
    });
    expect(resolved.state.ceramics[ceramic.id]).toEqual(
      expect.objectContaining({ stage: "finished", quality }),
    );
    expect(resolved.state.fireDeck).toHaveLength(19);
    expect(resolved.state.fireDiscard).toEqual([modifier]);
    expect(resolved.events).toContainEqual(expect.objectContaining({
      type: "FIRING_RESOLVED",
      ceramicId: ceramic.id,
      fireModifier: modifier,
      naturalActualHeat: globalHeat,
      naturalHeatDifference: Math.abs(globalHeat - 1),
      naturalQuality: quality,
      finalQuality: quality,
    }));

    const publicState = projectPublicGameState(resolved.state);
    expect(publicState.discards.fire).toEqual([modifier]);
    expect(publicState.decks.fireRemaining).toBe(19);
    expect(publicState).not.toHaveProperty("fireDeck");
    expect(Object.keys(publicState.decks).sort()).toEqual([
      "fireRemaining",
      "imperialRemaining",
      "marketRemaining",
      "techniqueRemaining",
    ]);
  });

  it.each([
    [2, 0, "white", 1],
    [-2, 3, "moon_white", 3],
  ] as const)("Sagger Selection treats Fire %s as 0 only for its selected ceramic", (modifier, wood, glaze, expectedHeat) => {
    const game = startedGame(2, 10120 + modifier);
    const actorId = game.state.firstPlayerId;
    game.state.players[actorId]!.kilnId = "DI";
    game.state.players[actorId]!.resources.wood = 3;
    addTechnique(game.state, actorId, "T16");
    const selected = addLoaded(game.state, actorId, "bowl", glaze, "plain", "middle_1");
    const unselected = addLoaded(game.state, actorId, "plate", glaze, "plain", "middle_2");
    game.state.fireDeck[0] = modifier;
    let state = enterFiring(game.state, game.rng);
    state = submitOnlyContributor(state, actorId, wood as WoodContribution, game.rng).state;
    expect(state.phase.type).toBe("firing_after_fire_reveal");
    state = mustApply(state, actorId, {
      type: "RESOLVE_SAGGER_SELECTION",
      ceramicId: selected.id,
    }, game.rng);

    expect(state.ceramics[selected.id]).toEqual(expect.objectContaining({ quality: "masterpiece" }));
    expect(state.ceramics[unselected.id]).toEqual(expect.objectContaining({ quality: "standard" }));
    expect(state.lastFiringResult).toEqual(expect.objectContaining({
      fireModifier: modifier,
      globalHeat: expectedHeat + modifier,
    }));
  });

  it.each([
    [2, 0, "moon_white", -1],
    [-2, 3, "white", 1],
  ] as const)("Jun remains exactly ±1 when the Fire card is %s", (modifier, wood, glaze, delta) => {
    const game = startedGame(2, 10140 + modifier);
    const actorId = game.state.firstPlayerId;
    game.state.players[actorId]!.kilnId = "JU";
    game.state.players[actorId]!.resources.wood = 3;
    const ceramic = addLoaded(game.state, actorId, "bowl", glaze, "plain", "middle_1");
    game.state.fireDeck[0] = modifier;
    let state = enterFiring(game.state, game.rng);
    state = submitOnlyContributor(state, actorId, wood as WoodContribution, game.rng).state;
    expect(state.phase.type).toBe("firing_before_quality");
    expect(state.firingContext?.ceramicResults[ceramic.id]?.naturalExactMatch).toBe(true);

    expectError(applyAction(state, actorId, {
      type: "RESOLVE_JUN",
      ceramicId: ceramic.id,
      delta: 2,
    } as unknown as GameAction, game.rng), "INVALID_SELECTION");

    state = mustApply(state, actorId, {
      type: "RESOLVE_JUN",
      ceramicId: ceramic.id,
      delta,
    }, game.rng);
    expect(state.ceramics[ceramic.id]).toEqual(expect.objectContaining({ quality: "fine" }));
  });

  it.each([
    [2, 0, "moon_white"],
    [-2, 3, "white"],
  ] as const)("Test Pieces uses the original Fire %s after Sagger Selection", (modifier, wood, glaze) => {
    const game = startedGame(2, 10160 + modifier);
    const actorId = game.state.firstPlayerId;
    game.state.players[actorId]!.kilnId = "DI";
    game.state.players[actorId]!.resources.wood = 3;
    addTechnique(game.state, actorId, "T12");
    addTechnique(game.state, actorId, "T16");
    const ceramic = addLoaded(game.state, actorId, "bowl", glaze, "plain", "middle_1");
    game.state.fireDeck[0] = modifier;
    let state = enterFiring(game.state, game.rng);
    state = submitOnlyContributor(state, actorId, wood as WoodContribution, game.rng).state;
    state = mustApply(state, actorId, {
      type: "RESOLVE_SAGGER_SELECTION",
      ceramicId: ceramic.id,
    }, game.rng);

    expect(state.phase.type).toBe("firing_after_firing");
    expect(state.firingContext?.ceramicResults[ceramic.id]).toEqual(expect.objectContaining({
      ignoredFireModifier: true,
      naturalExactMatch: true,
      naturalHeatDifference: 0,
      assignedQuality: "standard",
    }));
    const coinsBefore = state.players[actorId]!.resources.coins;
    state = mustApply(state, actorId, { type: "RESOLVE_TEST_PIECES", use: true }, game.rng);
    expect(state.players[actorId]!.resources.coins).toBe(coinsBefore + 1);
    expect(state.ceramics[ceramic.id]).toEqual(expect.objectContaining({ quality: "standard" }));
    expect(state.fireDiscard).toEqual([modifier]);
  });

  it("retains natural and final Quality separately when an ability changes the result", () => {
    const game = startedGame(2, 10180);
    const actorId = game.state.firstPlayerId;
    game.state.players[actorId]!.kilnId = "JU";
    const ceramic = addLoaded(game.state, actorId, "bowl", "moon_white", "plain", "middle_1");
    game.state.fireDeck[0] = 2;
    let state = enterFiring(game.state, game.rng);
    state = submitOnlyContributor(state, actorId, 0, game.rng).state;
    const applied = applyAction(state, actorId, {
      type: "RESOLVE_JUN",
      ceramicId: ceramic.id,
      delta: -1,
    }, game.rng);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.events).toContainEqual(expect.objectContaining({
      type: "FIRING_RESOLVED",
      ceramicId: ceramic.id,
      fireModifier: 2,
      naturalActualHeat: 3,
      naturalHeatDifference: 0,
      naturalQuality: "masterpiece" satisfies Quality,
      finalQuality: "fine" satisfies Quality,
    }));
  });
});
