import { describe, expect, it } from "vitest";
import { projectPublicGameState } from "../../src/multiplayer/projection.ts";
import { mustApply, mustResult, startedGame, workerId } from "./helpers.ts";

describe("unlimited Clay, Wood and Coins", () => {
  it.each([2, 3, 4] as const)("preserves workshop balances above component counts in %i-player snapshots", (count) => {
    const { state } = startedGame(count);
    for (const player of Object.values(state.players)) {
      player.resources = { clay: 1_000, wood: 2_000, coins: 3_000 };
    }
    const restored = JSON.parse(JSON.stringify(state));
    const publicState = projectPublicGameState(restored);
    expect(restored).toEqual(state);
    expect(publicState).not.toHaveProperty("commonSupply");
    expect(restored).not.toHaveProperty("commonSupply");
    for (const player of Object.values(publicState.players)) {
      expect(player.resources).toEqual({ clay: 1_000, wood: 2_000, coins: 3_000 });
    }
  });

  it.each(["clay", "wood", "coins"] as const)("pays the full Commission %s advance above component counts", (resource) => {
    const { state: initial, rng } = startedGame(2);
    initial.players["P1"]!.resources = { clay: 1_000, wood: 1_000, coins: 1_000 };
    let state = mustApply(initial, "P1", {
      type: "BEGIN_OFFICE_ORDERS", workerId: workerId(initial, "P1", "apprentice"), mode: "take_one",
    }, rng);
    state = mustApply(state, "P1", { type: "OFFICE_TAKE_ORDER", orderId: state.marketDisplay[0]! }, rng);
    const result = mustResult(state, "P1", { type: "COMMISSION_GAIN_ADVANCE", resource }, rng);
    expect(result.state.players["P1"]!.resources).toEqual({ clay: 1_000, wood: 1_000, coins: 1_000, [resource]: 1_001 });
    expect(result.events).toContainEqual({ type: "RESOURCES_CHANGED", playerId: "P1", clay: 0, wood: 0, coins: 0, [resource]: 1 });
  });
});
