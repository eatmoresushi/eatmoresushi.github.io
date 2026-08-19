import { describe, expect, it } from "vitest";
import { SeededRandom, createPrivateFiringState, determineBaseHeat, submitWoodContribution } from "../src/game";
import type { GameState, PlayerId } from "../src/game";
import { addLoaded, addTechnique, mustApply, startedGame } from "./helpers";

/** Base Heat once firing has resolved and the live context has been cleared. */
function resolvedBaseHeat(state: GameState): number | undefined {
  return state.firingContext?.baseHeat ?? state.lastFiringResult?.baseHeat;
}

/** Drive a 2P game to the contribution window with both seats holding a loaded ceramic. */
function atContributions(seed: number, options: { fuelLedger: boolean }): GameState {
  let state = startedGame(2, seed).state;
  for (const playerId of state.playerOrder) {
    const player = state.players[playerId]!;
    player.resources.wood = 4;
    player.resources.coins = 4;
    if (options.fuelLedger) addTechnique(state, playerId, "T11");
  }
  addLoaded(state, "P1", "bowl", "celadon", "plain", "middle_1");
  addLoaded(state, "P2", "bowl", "celadon", "plain", "middle_2");
  const rng = new SeededRandom(seed);
  while (state.phase.type === "work") {
    state = mustApply(state, state.phase.activePlayerId, { type: "PASS_WORK_PHASE" }, rng);
  }
  return state;
}

function bid(state: GameState, amounts: Record<PlayerId, number>, seed: number): GameState {
  const rng = new SeededRandom(seed);
  let next = state;
  let priv = createPrivateFiringState(next);
  for (const playerId of next.playerOrder) {
    const result = submitWoodContribution(next, priv, playerId, amounts[playerId] as 0 | 1 | 2 | 3, false, rng);
    if (!result.ok) throw new Error(result.error.message);
    next = result.state;
    priv = result.privateState;
  }
  return next;
}

describe("V1.1.1 Fuel Ledger is conditional and reactive", () => {
  it("rejects a Fuel Ledger commitment made with the secret bid", () => {
    const state = atContributions(51_101, { fuelLedger: true });
    expect(state.phase.type).toBe("firing_contributions");
    const result = submitWoodContribution(
      state, createPrivateFiringState(state), state.playerOrder[0]!, 1, true, new SeededRandom(1),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONTRIBUTION");
  });

  it("opens the reactive window when Base Heat would otherwise be 1", () => {
    expect(determineBaseHeat(2, 1)).toBe(1);
    const state = bid(atContributions(51_102, { fuelLedger: true }), { P1: 0, P2: 1 }, 2);
    expect(state.phase.type).toBe("firing_after_reveal");
  });

  it("does not open the window when Base Heat would be 2", () => {
    expect(determineBaseHeat(2, 2)).toBe(2);
    const state = bid(atContributions(51_103, { fuelLedger: true }), { P1: 1, P2: 1 }, 3);
    expect(state.phase.type).not.toBe("firing_after_reveal");
    expect(resolvedBaseHeat(state)).toBe(2);
  });

  it("does not open the window for players who do not own the tile", () => {
    const state = bid(atContributions(51_104, { fuelLedger: false }), { P1: 0, P2: 1 }, 4);
    expect(state.phase.type).not.toBe("firing_after_reveal");
    expect(resolvedBaseHeat(state)).toBe(1);
  });

  it("raises Base Heat from 1 to 2 when the tile is used", () => {
    let state = bid(atContributions(51_105, { fuelLedger: true }), { P1: 0, P2: 1 }, 5);
    expect(state.phase.type).toBe("firing_after_reveal");
    const rng = new SeededRandom(5);
    const actor = state.phase.type === "firing_after_reveal"
      ? state.phase.queue.actors[state.phase.queue.currentIndex]!
      : state.playerOrder[0]!;
    const before = state.players[actor]!.resources;
    const woodBefore = before.wood;
    const coinsBefore = before.coins;
    state = mustApply(state, actor, { type: "RESOLVE_FUEL_LEDGER", use: true }, rng);
    while (state.phase.type === "firing_after_reveal") {
      const next = state.phase.queue.actors[state.phase.queue.currentIndex]!;
      state = mustApply(state, next, { type: "RESOLVE_FUEL_LEDGER", use: false }, rng);
    }
    expect(resolvedBaseHeat(state)).toBe(2);
    expect(state.players[actor]!.resources.wood).toBe(woodBefore - 1);
    expect(state.players[actor]!.resources.coins).toBe(coinsBefore - 1);
  });
});
