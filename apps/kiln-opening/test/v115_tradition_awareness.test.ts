import { describe, expect, it } from "vitest";
import {
  GE_BONUS_DECORATION,
  IMPERIAL_ORDERS,
  MARKET_ORDERS,
  RU_BONUS_DECORATION,
  RU_BONUS_GLAZE,
  RU_BONUS_QUALITY,
  RU_ORDER_VP,
  createPrivateFiringState,
  isImperialOrder,
  orderAdmitsGeCrackle,
  orderAdmitsRuBonus,
  ruBonusCeramic,
} from "../src/game";
import { createPlayerObservation } from "../src/ai/observation.ts";
import { evaluateOrderFeasibility, orderPlanUtility } from "../src/ai/planning.ts";
import { createProductionV3Profile } from "../src/ai/productionProfile.ts";
import { createV115Profile } from "../src/ai/v115Policy.ts";
import { startedGame } from "./helpers.ts";
import type { KilnId } from "../src/game";

/**
 * Does the agent know its own Kiln Tradition ability exists?
 *
 * Until v1.1.5 it did not. `evaluator.ts` carried no kiln-tradition term at all, so a Ru
 * seat chose Orders without noticing which ones admit the Celadon, Plain Masterpiece its
 * ability pays 4 VP for, and a Ge seat took Orders that pin every slot to a Decoration
 * other than Crackle -- Orders its ability cannot serve, because firing it rewrites the
 * Decoration and breaks the match.
 */
function observationFor(kilnId: KilnId, seed: number) {
  const state = startedGame(3, seed).state;
  const actor = state.firstPlayerId;
  state.players[actor]!.kilnId = kilnId;
  state.players[actor]!.kilnAbilityUsedThisRound = false;
  state.round = 2;
  return { state, actor, observation: createPlayerObservation(state, actor, createPrivateFiringState(state)) };
}

const ALL_ORDERS = [...MARKET_ORDERS, ...IMPERIAL_ORDERS];

describe("V1.1.5 Kiln Tradition awareness", () => {
  it("the engine and the AI answer Ru's trigger with the same code", () => {
    expect(ruBonusCeramic({ glaze: RU_BONUS_GLAZE, decoration: RU_BONUS_DECORATION, quality: RU_BONUS_QUALITY })).toBe(true);
    // Each condition is load-bearing -- Masterpiece especially, which the ability text
    // requires and which is easy to drop when reading "Celadon, Plain".
    expect(ruBonusCeramic({ glaze: "white", decoration: RU_BONUS_DECORATION, quality: RU_BONUS_QUALITY })).toBe(false);
    expect(ruBonusCeramic({ glaze: RU_BONUS_GLAZE, decoration: "carved", quality: RU_BONUS_QUALITY })).toBe(false);
    expect(ruBonusCeramic({ glaze: RU_BONUS_GLAZE, decoration: RU_BONUS_DECORATION, quality: "fine" })).toBe(false);
  });

  it("treats an open slot as admitting the bonus, not only an exact match", () => {
    const open = ALL_ORDERS.find((o) => o.ceramics.every((c) => c.glaze === undefined && c.glazes === undefined && c.decoration === undefined));
    expect(open).toBeDefined();
    if (open !== undefined) expect(orderAdmitsRuBonus(open)).toBe(true);
    const blocked = ALL_ORDERS.filter((o) => !orderAdmitsRuBonus(o));
    for (const order of blocked) {
      // Every excluded Order must genuinely pin each slot away from Celadon or Plain.
      expect(order.ceramics.every((c) => (
        (c.glaze !== undefined && c.glaze !== RU_BONUS_GLAZE)
        || (c.glazes !== undefined && !c.glazes.includes(RU_BONUS_GLAZE))
        || (c.decoration !== undefined && c.decoration !== RU_BONUS_DECORATION)
      ))).toBe(true);
    }
  });

  it("Ge's predicate follows the Decoration its ability forces", () => {
    for (const order of ALL_ORDERS) {
      const expected = order.ceramics.some((c) => c.decoration === undefined || c.decoration === GE_BONUS_DECORATION);
      expect(orderAdmitsGeCrackle(order)).toBe(expected);
    }
  });

  it("a Ru seat values a bonus-admitting Order above one that excludes it", () => {
    const { observation } = observationFor("RU", 61_001);
    const profile = createV115Profile(3);
    const utility = (orderId: string): number =>
      orderPlanUtility(observation, evaluateOrderFeasibility(observation, orderId, 3, true), profile, "Hybrid");

    const admits = ALL_ORDERS.filter((o) => orderAdmitsRuBonus(o)).map((o) => o.id);
    const excludes = ALL_ORDERS.filter((o) => !orderAdmitsRuBonus(o)).map((o) => o.id);
    expect(admits.length).toBeGreaterThan(0);
    expect(excludes.length).toBeGreaterThan(0);

    // Compare like with like: the same Order scored by a Ru seat and by a seat whose
    // Tradition pays nothing here. Only the Ru seat should separate the two groups.
    const neutral = createV115Profile(3);
    const { observation: guanView } = observationFor("GU", 61_001);
    const guanUtility = (orderId: string): number =>
      orderPlanUtility(guanView, evaluateOrderFeasibility(guanView, orderId, 3, true), neutral, "Hybrid");

    const ruGap = Math.max(...admits.map(utility)) - Math.max(...excludes.map(utility));
    const guanGap = Math.max(...admits.map(guanUtility)) - Math.max(...excludes.map(guanUtility));
    expect(ruGap).toBeGreaterThan(guanGap);
  });

  it("is sensitive to the size of Ru's award", () => {
    // A sensitivity probe: an agent that scores identically whether the ability pays 4 VP
    // or nothing is not weighing the rule at all.
    expect(RU_ORDER_VP).toBeGreaterThan(0);
    const { observation } = observationFor("RU", 61_002);
    const aware = createV115Profile(3);
    const unaware = createV115Profile(3);
    delete unaware.traditionAwareness;
    const target = ALL_ORDERS.find((o) => orderAdmitsRuBonus(o))!.id;
    const scoreWith = (p: typeof aware, t: boolean): number =>
      orderPlanUtility(observation, evaluateOrderFeasibility(observation, target, 3, t), p, "Hybrid");
    expect(scoreWith(aware, true)).toBeGreaterThan(scoreWith(unaware, false));
  });

  it("stops valuing the ability once it has fired this round", () => {
    const { state, actor, observation } = observationFor("RU", 61_003);
    const profile = createV115Profile(3);
    const target = ALL_ORDERS.find((o) => orderAdmitsRuBonus(o))!.id;
    const before = orderPlanUtility(observation, evaluateOrderFeasibility(observation, target, 3, true), profile, "Hybrid");

    state.players[actor]!.kilnAbilityUsedThisRound = true;
    const spent = createPlayerObservation(state, actor, createPrivateFiringState(state));
    const after = orderPlanUtility(spent, evaluateOrderFeasibility(spent, target, 3, true), profile, "Hybrid");
    expect(after).toBeLessThan(before);
  });

  it("frozen V003 remains unaware, so it stays the control", () => {
    expect(createProductionV3Profile(3).traditionAwareness).toBeUndefined();
    expect(createV115Profile(3).traditionAwareness).toBe(true);
  });
});

describe("V1.1.5 Guan Imperial focus", () => {
  it("identifies Imperial Orders by deck membership, not an ID prefix", () => {
    for (const order of IMPERIAL_ORDERS) expect(isImperialOrder(order.id)).toBe(true);
    for (const order of MARKET_ORDERS) expect(isImperialOrder(order.id)).toBe(false);
    expect(isImperialOrder("not-an-order")).toBe(false);
  });

  it("a Guan seat values an Imperial Order above a Market one, beyond the usual bias", () => {
    const { observation } = observationFor("GU", 62_001);
    const { observation: neutral } = observationFor("DI", 62_001);
    const profile = createV115Profile(3);
    const util = (o: typeof observation, id: string): number =>
      orderPlanUtility(o, evaluateOrderFeasibility(o, id, 3, true), profile, "Hybrid");

    const imperial = IMPERIAL_ORDERS.map((o) => o.id);
    const market = MARKET_ORDERS.map((o) => o.id);
    // Ding is the control: same evaluation, no Imperial-specific ability.
    const guanGap = Math.max(...imperial.map((id) => util(observation, id)))
      - Math.max(...market.map((id) => util(observation, id)));
    const dingGap = Math.max(...imperial.map((id) => util(neutral, id)))
      - Math.max(...market.map((id) => util(neutral, id)));
    expect(guanGap).toBeGreaterThan(dingGap);
  });

  it("pays Guan nothing extra on a Market Order", () => {
    const { observation } = observationFor("GU", 62_002);
    const { observation: neutral } = observationFor("DI", 62_002);
    const profile = createV115Profile(3);
    const market = MARKET_ORDERS[0]!.id;
    const guan = orderPlanUtility(observation, evaluateOrderFeasibility(observation, market, 3, true), profile, "Hybrid");
    const ding = orderPlanUtility(neutral, evaluateOrderFeasibility(neutral, market, 3, true), profile, "Hybrid");
    expect(guan).toBeCloseTo(ding, 9);
  });

  it("stops paying once Guan's ability has fired this round", () => {
    const { state, actor, observation } = observationFor("GU", 62_003);
    const profile = createV115Profile(3);
    const target = IMPERIAL_ORDERS[0]!.id;
    const before = orderPlanUtility(observation, evaluateOrderFeasibility(observation, target, 3, true), profile, "Hybrid");
    state.players[actor]!.kilnAbilityUsedThisRound = true;
    const spent = createPlayerObservation(state, actor, createPrivateFiringState(state));
    const after = orderPlanUtility(spent, evaluateOrderFeasibility(spent, target, 3, true), profile, "Hybrid");
    expect(after).toBeLessThan(before);
  });
});
