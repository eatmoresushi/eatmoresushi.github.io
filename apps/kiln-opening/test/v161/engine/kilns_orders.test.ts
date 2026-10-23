/**
 * P6 `orders/completion.ts`: the completion procedure (L410–419) and the completion
 * abilities Ru (L460), Guan (L464) and Tribute Ware (T25, L642), each optional and once per
 * round (R4), with Tribute Ware's Crown never printed (R13), Canal Barge's automatic 2
 * Coins (T23, v1.6.2 L630) and Ge's automatic 1 VP per delivered Crackle ceramic (rev. 4 L465,
 * change 29). Orders are completed only in the Order Phase (v1.6.2 L296, L484), so these
 * trigger only there. DESIGN §8.2 "Ru, Guan", "Tribute Ware bonus Crown (R13)".
 */

import { describe, expect, it } from "vitest";
import { KILNS, ORDERS } from "../../../src/game/content.ts";
import { assertInvariants } from "../../../src/game/invariants.ts";
import { scorePreview } from "../../../src/game/scoring.ts";
import { completableOrderIds, completionTriggers, resolveOrderCompletion, validateOrderCompletion } from "../../../src/game/orders/completion.ts";
import { ceramic, player } from "../../../src/game/state.ts";
import { techReady } from "../../../src/game/techs.ts";
import type {
  CompletedOrderRecord,
  Decoration,
  FinishedCeramic,
  GameState,
  Glaze,
  OrderCompletionSpec,
  OrderId,
  PlayerId,
  Quality,
  Shape,
} from "../../../src/game/types.ts";
import { openOrderPhase } from "../../../src/game/orders/phase.ts";
import { actorViewOf, projectEvent, projectPublicState } from "../../../src/game/view.ts";
import { buildState, type PlayerSpec, stageCeramic, testContext } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";

const Q: Record<string, Quality> = { std: "standard", fine: "fine", mp: "masterpiece", flawed: "flawed" };

/** Stages a Finished ceramic from "shape glaze decoration quality [crackle]". */
function fin(state: GameState, owner: PlayerId, spec: string): string {
  const [shape, glaze, decoration, quality, crackle] = spec.split(" ");
  return stageCeramic(state, {
    owner,
    stage: "finished",
    shape: shape as Shape,
    glaze: glaze as Glaze,
    decoration: decoration as Decoration,
    quality: Q[quality ?? ""] as Quality,
    ...(crackle === "crackle" ? { crackle: true } : {}),
  }).id;
}

function table(p1: PlayerSpec, p2: PlayerSpec = {}): GameState {
  return buildState({ round: 3, players: [{ resources: { clay: 0, wood: 0, coins: 0 }, ...p1 }, p2] });
}

function complete(state: GameState, playerId: PlayerId, spec: OrderCompletionSpec) {
  // Every completion here is first accepted by the shared validator.
  expect(validateOrderCompletion(actorViewOf(state, playerId), spec)).toBeNull();
  const ctx = testContext();
  const record = resolveOrderCompletion(state, playerId, spec, ctx);
  return { record, events: ctx.events };
}

describe("the completion procedure (L410–419)", () => {
  it("reveals, delivers beneath the Order, records VP, gains Coins and keeps the record", () => {
    const state = table({ kilnId: "GE", hand: ["O04", "S08"] });
    const vase = fin(state, "p1", "vase moon_white carved fine");
    const { record, events } = complete(state, "p1", { orderId: "O04", ceramicIds: [vase] });
    const expected: CompletedOrderRecord = {
      orderId: "O04",
      ceramicIds: [vase],
      round: 3,
      canalBargeCoins: 0,
      vp: 7,
      coins: 3,
      printedCrowns: 0,
      bonusCrowns: 0,
      crackleDeclarations: [],
      kilnAbility: null,
      crackleVp: 0,
    };
    expect(record).toEqual(expected);
    const p1 = player(state, "p1");
    expect(p1.completedOrders).toEqual([expected]);
    expect(p1.score.orders).toBe(ORDERS.O04.vp);
    expect(p1.resources.coins).toBe(ORDERS.O04.coins);
    expect(state.hidden.orderHands["p1"]).toEqual(["S08"]);
    expect(ceramic(state, vase)).toMatchObject({ stage: "delivered", orderId: "O04", deliveredInRound: 3, quality: "fine", crackle: false });
    expect(events).toEqual([
      { type: "ORDER_COMPLETED", playerId: "p1", record: expected },
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: 0, coins: 3, reason: "order_reward" },
    ]);
  });

  it("a delivered Crackle ceramic keeps its Crackle marker and printed Decoration (L94, L470)", () => {
    // S07 asks for Carved, Impressed or Painted (change 23); the wildcard fills it with the first
    // Decoration that works, in DECORATIONS order.
    const state = table({ kilnId: "GE", hand: ["S07"] });
    const bowl = fin(state, "p1", "bowl white plain fine crackle");
    const { record } = complete(state, "p1", { orderId: "S07", ceramicIds: [bowl] });
    expect(record.crackleDeclarations).toEqual([{ ceramicId: bowl, decoration: "carved" }]);
    expect(ceramic(state, bowl)).toMatchObject({ stage: "delivered", crackle: true, quality: "fine", decoration: "plain" });
  });

  it("records declared Crackle declarations exactly as given", () => {
    const state = table({ kilnId: "GE", hand: ["S07"] });
    const bowl = fin(state, "p1", "bowl white plain fine crackle");
    const spec = { orderId: "S07" as OrderId, ceramicIds: [bowl], crackleDeclarations: [{ ceramicId: bowl, decoration: "painted" as Decoration }] };
    expect(complete(state, "p1", spec).record.crackleDeclarations).toEqual(spec.crackleDeclarations);
  });

  it("a ceramic satisfies only one Order (L419)", () => {
    const state = table({ kilnId: "GE", hand: ["S08", "S01"] });
    const bowl = fin(state, "p1", "bowl white plain std");
    complete(state, "p1", { orderId: "S08", ceramicIds: [bowl] });
    expect(validateOrderCompletion(actorViewOf(state, "p1"), { orderId: "S01", ceramicIds: [bowl] })).toMatchObject({
      code: "ILLEGAL_CERAMIC_STAGE",
      details: { ceramicId: bowl, stage: "delivered", expectedStage: "finished" },
    });
    expect(completableOrderIds(state, "p1", ["S01"])).toEqual([]);
  });

  it("completableOrderIds lists held Orders the Finished ceramics can complete, in hand order", () => {
    const state = table({ kilnId: "GE", hand: ["O11", "S01", "S08", "O25"] });
    fin(state, "p1", "bowl white plain std");
    fin(state, "p1", "plate white plain flawed");
    expect(completableOrderIds(state, "p1", ["O11", "S01", "S08", "O25"])).toEqual(["S01", "S08"]);
    expect(completableOrderIds(state, "p2", ["S01"])).toEqual([]);
  });

  it("the public projection reveals the completed Order and the hand count only", () => {
    const state = table({ kilnId: "GE", hand: ["S08", "O25", "O30"] }, { hand: ["O31"] });
    const vase = fin(state, "p1", "vase white plain std");
    const { events } = complete(state, "p1", { orderId: "S08", ceramicIds: [vase] });
    const publicJson = JSON.stringify(projectPublicState(state));
    expect(publicJson).toContain('"S08"');
    for (const held of ["O25", "O30", "O31"]) {
      expect(publicJson).not.toContain(`"${held}"`);
    }
    expect(projectPublicState(state).counts.orderHands).toEqual({ p1: 2, p2: 1 });
    for (const event of events) {
      expect(event).not.toHaveProperty("secret");
      expect(projectEvent(event)).toEqual(event);
      expect(JSON.stringify(event)).not.toMatch(/O25|O30|O31/);
    }
  });
});

describe("Ru Kiln (L460)", () => {
  it("delivering an actual Celadon Plain Masterpiece scores 4 VP, even for an Order that asks for none of it", () => {
    const state = table({ kilnId: "RU", hand: ["S08"] });
    const vase = fin(state, "p1", "vase celadon plain mp");
    const { record, events } = complete(state, "p1", { orderId: "S08", ceramicIds: [vase] });
    expect(record.kilnAbility).toEqual({ kilnId: "RU", vp: 4, coins: 0 });
    const p1 = player(state, "p1");
    expect(p1.score).toMatchObject({ orders: 2, kilnAbilities: 4 });
    expect(p1.kilnAbilityUsedThisRound).toBe(true);
    expect(p1.resources.coins).toBe(ORDERS.S08.coins);
    expect(events.map((e) => e.type)).toEqual(["ORDER_COMPLETED", "RESOURCES_CHANGED", "KILN_ABILITY_USED"]);
    expect(events.at(-1)).toEqual({ type: "KILN_ABILITY_USED", playerId: "p1", kilnId: "RU" });
  });

  it("triggers from any delivered ceramic of a multi-ceramic Order", () => {
    const state = table({ kilnId: "RU", hand: ["O35"] });
    const bowl = fin(state, "p1", "bowl celadon plain mp");
    const plate = fin(state, "p1", "plate celadon carved fine");
    expect(complete(state, "p1", { orderId: "O35", ceramicIds: [plate, bowl] }).record.kilnAbility?.kilnId).toBe("RU");
  });

  it.each([
    ["Fine", "vase celadon plain fine"],
    ["Carved", "vase celadon carved mp"],
    ["White", "vase white plain mp"],
    ["Crackle (printed Plain, Fine)", "vase celadon plain fine crackle"],
  ])("does not trigger for a %s ceramic", (_label, spec) => {
    const state = table({ kilnId: "RU", hand: ["S08"] });
    const id = fin(state, "p1", spec);
    const { record, events } = complete(state, "p1", { orderId: "S08", ceramicIds: [id] });
    expect(record.kilnAbility).toBeNull();
    // Never Ru's 4 VP; a (synthetic) Crackle ceramic scores only its Crackle VP (rev. 4 L465).
    expect(player(state, "p1").score.kilnAbilities).toBe(record.crackleVp);
    expect(player(state, "p1").kilnAbilityUsedThisRound).toBe(false);
    expect(events.some((e) => e.type === "KILN_ABILITY_USED")).toBe(false);
  });

  it("is once per round; declining keeps the use for a later completion (R4)", () => {
    const state = table({ kilnId: "RU", hand: ["S08", "S06", "S05"] });
    const first = fin(state, "p1", "vase celadon plain mp");
    const second = fin(state, "p1", "censer celadon plain mp");
    const third = fin(state, "p1", "bowl celadon plain mp");
    const declined = complete(state, "p1", { orderId: "S08", ceramicIds: [first], declineKilnAbility: true });
    expect(declined.record.kilnAbility).toBeNull();
    expect(declined.events.some((e) => e.type === "KILN_ABILITY_USED")).toBe(false);
    expect(player(state, "p1").kilnAbilityUsedThisRound).toBe(false);
    expect(complete(state, "p1", { orderId: "S06", ceramicIds: [second] }).record.kilnAbility?.vp).toBe(4);
    expect(complete(state, "p1", { orderId: "S05", ceramicIds: [third] }).record.kilnAbility).toBeNull();
    expect(player(state, "p1").score.kilnAbilities).toBe(4);
  });

  it("does not trigger once the Kiln ability is used this round", () => {
    const state = table({ kilnId: "RU", hand: ["S08"], kilnAbilityUsedThisRound: true });
    const vase = fin(state, "p1", "vase celadon plain mp");
    expect(complete(state, "p1", { orderId: "S08", ceramicIds: [vase] }).record.kilnAbility).toBeNull();
  });

  it("triggers with Canal Barge's 2 Coins on the same completion (v1.6.2 L630)", () => {
    const state = table({ kilnId: "RU", techs: ["T23"], hand: ["S08"] });
    const vase = fin(state, "p1", "vase celadon plain mp");
    const { record } = complete(state, "p1", { orderId: "S08", ceramicIds: [vase] });
    expect(record).toMatchObject({ canalBargeCoins: 2, kilnAbility: { kilnId: "RU", vp: 4, coins: 0 } });
    expect(player(state, "p1").score.kilnAbilities).toBe(4);
    expect(player(state, "p1").resources.coins).toBe(ORDERS.S08.coins + 2);
  });
});

describe("Guan Kiln (L464)", () => {
  it("an Order showing at least 1 printed Crown gains 2 Coins and 1 VP", () => {
    const state = table({ kilnId: "GU", hand: ["O18"] });
    const vase = fin(state, "p1", "vase celadon carved fine");
    const { record, events } = complete(state, "p1", { orderId: "O18", ceramicIds: [vase] });
    expect(record).toMatchObject({ printedCrowns: 1, bonusCrowns: 0, kilnAbility: { kilnId: "GU", vp: 1, coins: 2 } });
    const p1 = player(state, "p1");
    expect(p1.score).toMatchObject({ orders: 6, kilnAbilities: 1 });
    expect(p1.resources.coins).toBe(ORDERS.O18.coins + 2 + 1); // + the Imperial Grant's Coin
    expect(p1.imperial.recognition).toBe(1);
    expect(events.map((e) => e.type)).toEqual([
      "ORDER_COMPLETED",
      "RESOURCES_CHANGED",
      "RECOGNITION_ADVANCED",
      "IMPERIAL_GRANT_RECEIVED",
      "RESOURCES_CHANGED",
      "KILN_ABILITY_USED",
      "RESOURCES_CHANGED",
    ]);
    expect(events.at(-1)).toEqual({ type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: 0, coins: 2, reason: "guan" });
  });

  it("does not trigger for an Order without printed Crowns", () => {
    const state = table({ kilnId: "GU", hand: ["O04"] });
    const vase = fin(state, "p1", "vase moon_white carved fine");
    expect(complete(state, "p1", { orderId: "O04", ceramicIds: [vase] }).record.kilnAbility).toBeNull();
    expect(player(state, "p1").kilnAbilityUsedThisRound).toBe(false);
  });

  it("is once per round; declining keeps the use (R4)", () => {
    const state = table({ kilnId: "GU", hand: ["O18", "O17", "O24"] });
    const vase = fin(state, "p1", "vase celadon carved fine");
    const washer = fin(state, "p1", "washer white painted fine");
    const bowl = fin(state, "p1", "bowl moon_white plain mp");
    expect(complete(state, "p1", { orderId: "O18", ceramicIds: [vase], declineKilnAbility: true }).record.kilnAbility).toBeNull();
    expect(player(state, "p1").kilnAbilityUsedThisRound).toBe(false);
    expect(complete(state, "p1", { orderId: "O17", ceramicIds: [washer] }).record.kilnAbility?.kilnId).toBe("GU");
    expect(complete(state, "p1", { orderId: "O24", ceramicIds: [bowl] }).record.kilnAbility).toBeNull();
    expect(player(state, "p1").score.kilnAbilities).toBe(1);
  });

  it("with Canal Barge: Guan's 2 Coins, then Canal Barge's 2 Coins (v1.6.2 L630)", () => {
    const state = table({ kilnId: "GU", techs: ["T23"], hand: ["O18"] });
    const vase = fin(state, "p1", "vase celadon carved fine");
    const { record, events } = complete(state, "p1", { orderId: "O18", ceramicIds: [vase] });
    expect(record).toMatchObject({ canalBargeCoins: 2, kilnAbility: { kilnId: "GU", coins: 2 } });
    expect(events.slice(-4)).toEqual([
      { type: "KILN_ABILITY_USED", playerId: "p1", kilnId: "GU" },
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: 0, coins: 2, reason: "guan" },
      { type: "TECH_USED", playerId: "p1", techId: "T23" },
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: 0, coins: 2, reason: "canal_barge" },
    ]);
    expect(player(state, "p1").resources.coins).toBe(ORDERS.O18.coins + 2 + 2 + 1); // + the Imperial Grant's Coin
  });
});

describe("Tribute Ware (T25, L642, R13)", () => {
  it("an Order showing at least 1 Crown gains 1 bonus Crown, recorded apart from the printed Crowns", () => {
    const state = table({ kilnId: "GE", techs: ["T25"], hand: ["O18"] });
    const vase = fin(state, "p1", "vase celadon carved fine");
    const { record, events } = complete(state, "p1", { orderId: "O18", ceramicIds: [vase] });
    expect(record).toMatchObject({ printedCrowns: 1, bonusCrowns: 1, kilnAbility: null });
    const p1 = player(state, "p1");
    expect(p1.imperial.recognition).toBe(2);
    expect(techReady(p1, "T25")).toBe(false);
    expect(events.filter((e) => e.type === "RECOGNITION_ADVANCED")).toEqual([
      { type: "RECOGNITION_ADVANCED", playerId: "p1", from: 0, to: 1, source: "printed_crown", orderId: "O18" },
      { type: "RECOGNITION_ADVANCED", playerId: "p1", from: 1, to: 2, source: "tribute_crown", orderId: "O18" },
    ]);
    expect(events).toContainEqual({ type: "TECH_USED", playerId: "p1", techId: "T25" });
  });

  it("does not trigger for an Order without printed Crowns", () => {
    const state = table({ kilnId: "GE", techs: ["T25"], hand: ["S08"] });
    const vase = fin(state, "p1", "vase celadon carved fine");
    const { record, events } = complete(state, "p1", { orderId: "S08", ceramicIds: [vase] });
    expect(record.bonusCrowns).toBe(0);
    expect(player(state, "p1").imperial.recognition).toBe(0);
    expect(techReady(player(state, "p1"), "T25")).toBe(true);
    expect(events.some((e) => e.type === "TECH_USED")).toBe(false);
  });

  it("is once per round; declining keeps the use (R4)", () => {
    const state = table({ kilnId: "GE", techs: ["T25"], hand: ["O18", "O17", "O24"] });
    const vase = fin(state, "p1", "vase celadon carved fine");
    const washer = fin(state, "p1", "washer white painted fine");
    const bowl = fin(state, "p1", "bowl moon_white plain mp");
    expect(complete(state, "p1", { orderId: "O18", ceramicIds: [vase], declineTributeWare: true }).record.bonusCrowns).toBe(0);
    expect(techReady(player(state, "p1"), "T25")).toBe(true);
    expect(complete(state, "p1", { orderId: "O17", ceramicIds: [washer] }).record.bonusCrowns).toBe(1);
    expect(complete(state, "p1", { orderId: "O24", ceramicIds: [bowl] }).record.bonusCrowns).toBe(0);
    // 3 printed + 1 bonus Crown.
    expect(player(state, "p1").imperial.recognition).toBe(4);
  });

  it("scores the bonus Crown as 1 VP at Recognition 4", () => {
    const state = table({ kilnId: "GE", techs: ["T25"], recognition: 4, hand: ["O18"] });
    const vase = fin(state, "p1", "vase celadon carved fine");
    complete(state, "p1", { orderId: "O18", ceramicIds: [vase] });
    expect(player(state, "p1").score.recognitionOverflow).toBe(2);
  });

  it("with Guan: both trigger on a printed-Crown Order; the bonus Crown never makes an Order 'show' a Crown", () => {
    const state = table({ kilnId: "GU", techs: ["T25"], hand: ["O18", "S08"] });
    const vase = fin(state, "p1", "vase celadon carved fine");
    const bowl = fin(state, "p1", "bowl white plain std");
    const crownless = complete(state, "p1", { orderId: "S08", ceramicIds: [bowl] });
    expect(crownless.record).toMatchObject({ printedCrowns: 0, bonusCrowns: 0, kilnAbility: null });
    const crowned = complete(state, "p1", { orderId: "O18", ceramicIds: [vase] });
    expect(crowned.record).toMatchObject({ printedCrowns: 1, bonusCrowns: 1, kilnAbility: { kilnId: "GU" } });
    // Tribute Ware's Crown resolves before Guan.
    expect(crowned.events.map((e) => e.type)).toEqual([
      "ORDER_COMPLETED",
      "RESOURCES_CHANGED",
      "RECOGNITION_ADVANCED",
      "IMPERIAL_GRANT_RECEIVED",
      "RESOURCES_CHANGED",
      "TECH_USED",
      "RECOGNITION_ADVANCED",
      "IMPERIAL_KILN_GAINED",
      "KILN_ABILITY_USED",
      "RESOURCES_CHANGED",
    ]);
  });

  it("declining the Kiln ability does not decline Tribute Ware, and vice versa", () => {
    const state = table({ kilnId: "GU", techs: ["T25"], hand: ["O18", "O17"] });
    const vase = fin(state, "p1", "vase celadon carved fine");
    const washer = fin(state, "p1", "washer white painted fine");
    expect(complete(state, "p1", { orderId: "O18", ceramicIds: [vase], declineKilnAbility: true }).record).toMatchObject({
      bonusCrowns: 1,
      kilnAbility: null,
    });
    expect(complete(state, "p1", { orderId: "O17", ceramicIds: [washer], declineTributeWare: true }).record).toMatchObject({
      bonusCrowns: 0,
      kilnAbility: { kilnId: "GU" },
    });
  });

  it("only in the Order Phase now: there is no completion through Canal Barge (v1.6.2 L32, R6 obsolete)", () => {
    const state = table({ kilnId: "GE", techs: ["T25"], hand: ["O18"] });
    const vase = fin(state, "p1", "vase celadon carved fine");
    expect(complete(state, "p1", { orderId: "O18", ceramicIds: [vase] }).record).toMatchObject({ bonusCrowns: 1, canalBargeCoins: 0 });
  });
});

describe("Ge: 1 VP per delivered Crackle ceramic (rev. 4 L465, L480, L487; change 29)", () => {
  it("scores 1 VP for a Crackle ceramic delivered to complete an Order, recorded with the Order as Kiln Tradition VP", () => {
    const state = table({ kilnId: "GE", hand: ["S07"] });
    const bowl = fin(state, "p1", "bowl white plain fine crackle");
    const { record, events } = complete(state, "p1", { orderId: "S07", ceramicIds: [bowl] });
    expect(KILNS.GE.params.vpPerDeliveredCrackle).toBe(1);
    expect(record.crackleVp).toBe(1);
    expect(record.kilnAbility).toBeNull();
    const p1 = player(state, "p1");
    expect(p1.score).toMatchObject({ orders: ORDERS.S07.vp, kilnAbilities: 1 });
    // Automatic: no once-per-round use, no Kiln ability event; the public record carries it.
    expect(p1.kilnAbilityUsedThisRound).toBe(false);
    expect(events.map((e) => e.type)).toEqual(["ORDER_COMPLETED", "RESOURCES_CHANGED"]);
    expect(events[0]).toMatchObject({ type: "ORDER_COMPLETED", record: { crackleVp: 1 } });
    expect(projectEvent(events[0]!)).toEqual(events[0]);
  });

  it("scores each Crackle ceramic of an Order, with no once-per-round limit; a plain ceramic scores nothing", () => {
    const state = table({ kilnId: "GE", hand: ["O26", "S08", "S01"] });
    const bowl = fin(state, "p1", "bowl white plain fine crackle");
    const plate = fin(state, "p1", "plate white carved fine crackle");
    const vase = fin(state, "p1", "vase white plain fine crackle");
    const plain = fin(state, "p1", "bowl white plain std");
    expect(complete(state, "p1", { orderId: "O26", ceramicIds: [bowl, plate] }).record.crackleVp).toBe(2);
    expect(complete(state, "p1", { orderId: "S08", ceramicIds: [vase] }).record.crackleVp).toBe(1);
    expect(complete(state, "p1", { orderId: "S01", ceramicIds: [plain] }).record.crackleVp).toBe(0);
    const p1 = player(state, "p1");
    expect(p1.completedOrders.map((r) => [r.orderId, r.crackleVp])).toEqual([["O26", 2], ["S08", 1], ["S01", 0]]);
    expect(p1.score.kilnAbilities).toBe(3);
    // Crackle VP is never a Crown: Recognition and the tie-breaker Crowns are unchanged.
    expect(p1.imperial.recognition).toBe(0);
    expect(p1.completedOrders.every((r) => r.printedCrowns === 0 && r.bonusCrowns === 0)).toBe(true);
    // The score preview (the final breakdown's shape) carries it in the Kiln Tradition line.
    const preview = scorePreview(state, "p1").breakdown;
    expect(preview.kilnAbilities).toBe(3);
    expect(preview.total).toBe(p1.score.orders + 3 + preview.exhibition.total + preview.connoisseur + preview.coins);
    assertInvariants(state);
  });

  it("the ledger check: a record whose Crackle VP disagrees with its delivered Crackle ceramics is reported", () => {
    const state = table({ kilnId: "GE", hand: ["S07"] });
    const bowl = fin(state, "p1", "bowl white plain fine crackle");
    complete(state, "p1", { orderId: "S07", ceramicIds: [bowl] });
    state.phase = { type: "orders", turnOrder: ["p1", "p2"], index: 0 };
    player(state, "p1").completedOrders[0]!.crackleVp = 0;
    expect(() => assertInvariants(state, { live: true })).toThrow(/records 0 Crackle VP for 1 Crackle ceramics/);
  });
});

describe("completionTriggers", () => {
  it("reports what would trigger before any decline", () => {
    const state = table({ kilnId: "GU", techs: ["T25"] });
    const fine = ceramic(state, fin(state, "p1", "vase celadon plain fine")) as FinishedCeramic;
    const p1 = player(state, "p1");
    expect(completionTriggers(p1, ORDERS.O18, [fine])).toEqual({ ru: false, guan: true, tributeWare: true, canalBarge: false, crackleVp: 0 });
    expect(completionTriggers(p1, ORDERS.S08, [fine])).toEqual({ ru: false, guan: false, tributeWare: false, canalBarge: false, crackleVp: 0 });
    const ru = table({ kilnId: "RU" });
    const mp = ceramic(ru, fin(ru, "p1", "vase celadon plain mp")) as FinishedCeramic;
    expect(completionTriggers(player(ru, "p1"), ORDERS.S08, [mp])).toEqual({ ru: true, guan: false, tributeWare: false, canalBarge: false, crackleVp: 0 });
    // Ge's Crackle VP: 1 per delivered Crackle ceramic (rev. 4 L465).
    const ge = table({ kilnId: "GE" });
    const crackled = [fin(ge, "p1", "bowl white plain fine crackle"), fin(ge, "p1", "plate white plain fine crackle")].map((id) => ceramic(ge, id) as FinishedCeramic);
    expect(completionTriggers(player(ge, "p1"), ORDERS.O26, crackled).crackleVp).toBe(2);
    // Canal Barge, ready, triggers on any Order (v1.6.2 L630); once used, no longer.
    const barge = table({ kilnId: "DI", techs: ["T23"] });
    expect(completionTriggers(player(barge, "p1"), ORDERS.S08, [mp]).canalBarge).toBe(true);
    player(barge, "p1").techs[0]!.usedThisRound = true;
    expect(completionTriggers(player(barge, "p1"), ORDERS.S08, [mp]).canalBarge).toBe(false);
  });
});

describe("through COMPLETE_ORDER in the Order Phase", () => {
  it("the decline flags reach the completion; Ru then triggers on the next Order", () => {
    const state = table({ kilnId: "RU", techs: ["T25"], hand: ["O22", "S08"] });
    const first = fin(state, "p1", "vase celadon plain mp");
    const second = fin(state, "p1", "bowl celadon plain mp");
    openOrderPhase(state, testContext());
    const orders = new LocalTable(state, { flow: "halt" });
    const declined = orders.act("p1", {
      type: "COMPLETE_ORDER",
      orderId: "O22",
      ceramicIds: [first],
      declineKilnAbility: true,
      declineTributeWare: true,
    });
    expect(declined.find((e) => e.type === "ORDER_COMPLETED")).toMatchObject({ record: { kilnAbility: null, bonusCrowns: 0, printedCrowns: 1 } });
    expect(orders.player("p1").kilnAbilityUsedThisRound).toBe(false);
    expect(techReady(orders.player("p1"), "T25")).toBe(true);
    const used = orders.act("p1", { type: "COMPLETE_ORDER", orderId: "S08", ceramicIds: [second] });
    expect(used.find((e) => e.type === "ORDER_COMPLETED")).toMatchObject({ record: { kilnAbility: { kilnId: "RU", vp: 4 }, bonusCrowns: 0 } });
    expect(orders.player("p1").score).toMatchObject({ orders: ORDERS.O22.vp + ORDERS.S08.vp, kilnAbilities: 4 });
    // Nothing left to complete: the turn ended automatically and the phase handed over.
    expect(orders.halts).toEqual([{ kind: "continue_after", milestone: "order_phase_done" }]);
  });
});
