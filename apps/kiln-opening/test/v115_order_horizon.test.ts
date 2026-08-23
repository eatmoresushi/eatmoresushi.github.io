import { describe, expect, it } from "vitest";
import { ORDER_DEFINITIONS, MARKET_ORDERS, IMPERIAL_ORDERS, createPrivateFiringState } from "../src/game";
import { createPlayerObservation } from "../src/ai/observation.ts";
import { evaluateOrderFeasibility } from "../src/ai/planning.ts";
import { createProductionV3Profile } from "../src/ai/productionProfile.ts";
import { createV115Profile } from "../src/ai/v115Policy.ts";
import { startedGame } from "./helpers.ts";

/**
 * Frozen V003 charges a multi-ceramic Order the product of single-attempt Quality
 * probabilities, as though every requirement had to land simultaneously on one firing.
 * Measured against realised play it predicts 25.6% for two-ceramic Orders that complete
 * 51.4% of the time, and ranks them below one-ceramic Orders that are worth less.
 */
describe("V1.1.5 Order retry horizon", () => {
  const ordersByCeramicCount = (count: number): string[] =>
    [...MARKET_ORDERS, ...IMPERIAL_ORDERS]
      .filter((order) => order.ceramics.length === count)
      .map((order) => order.id);

  it("frozen V003 leaves the horizon unset, keeping the single-attempt model", () => {
    expect(createProductionV3Profile(3).orderRetryHorizon).toBeUndefined();
    expect(createV115Profile(3).orderRetryHorizon).toBe(3);
  });

  it("the content still contains multi-ceramic Orders for this to matter", () => {
    expect(ordersByCeramicCount(1).length).toBeGreaterThan(0);
    expect(ordersByCeramicCount(2).length).toBeGreaterThan(0);
  });

  it("lifts multi-ceramic Orders more than single-ceramic ones", () => {
    const state = startedGame(3, 55_001).state;
    const actor = state.firstPlayerId;
    state.round = 2;
    const observation = createPlayerObservation(state, actor, createPrivateFiringState(state));

    const lift = (orderIds: string[]): number => {
      const ratios = orderIds.flatMap((id) => {
        const single = evaluateOrderFeasibility(observation, id, 1).probability;
        const retry = evaluateOrderFeasibility(observation, id, 3).probability;
        return single > 0.02 ? [retry / single] : [];
      });
      return ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
    };

    const oneCeramic = lift(ordersByCeramicCount(1));
    const twoCeramic = lift(ordersByCeramicCount(2));
    expect(oneCeramic).toBeGreaterThan(1);
    expect(twoCeramic).toBeGreaterThan(oneCeramic);
  });

  it("collapses to the frozen model in the final round, where there is no retry", () => {
    const state = startedGame(3, 55_002).state;
    const actor = state.firstPlayerId;
    state.round = 5;
    const observation = createPlayerObservation(state, actor, createPrivateFiringState(state));
    for (const orderId of Object.keys(ORDER_DEFINITIONS)) {
      expect(evaluateOrderFeasibility(observation, orderId, 3).probability)
        .toBeCloseTo(evaluateOrderFeasibility(observation, orderId, 1).probability, 12);
    }
  });

  it("never exceeds a probability of 1", () => {
    const state = startedGame(2, 55_003).state;
    const actor = state.firstPlayerId;
    state.round = 1;
    const observation = createPlayerObservation(state, actor, createPrivateFiringState(state));
    for (const orderId of Object.keys(ORDER_DEFINITIONS)) {
      const p = evaluateOrderFeasibility(observation, orderId, 9).probability;
      expect(p).toBeLessThanOrEqual(1);
      expect(p).toBeGreaterThanOrEqual(0);
    }
  });
});
