/**
 * Form & Decorate (rev. 4 L179–187, L336, change 30): Apprentice and Shifu effects, each vessel's
 * Shape Clay + 2 Coins whatever its Decoration, the Shifu's −1 Coin on one vessel when forming 2
 * (rev. 4 L184), Large Throwing Wheel (T01, rev. 4 L602), Decorator's Kit (T16, rev. 4 L603) and
 * Ding (rev. 4 L469, R1), incl. the three separate reductions of rev. 4 L639.
 */

import { describe, expect, it } from "vitest";
import { DECORATIONS } from "../../../src/game/content.ts";
import { ceramicsOf } from "../../../src/game/state.ts";
import type { Decoration, GameAction } from "../../../src/game/types.ts";
import { actorViewOf } from "../../../src/game/view.ts";
import { quoteFormDecorate } from "../../../src/game/work/formDecorate.ts";
import type { PlayerSpec } from "./support/fixtures.ts";
import {
  buildState,
  expectPublicEvents,
  keySorted,
  reject,
  scrambleHidden,
  table,
  types,
  verdict,
  withHands,
} from "./workshop_support.ts";

type FD = Extract<GameAction, { type: "PLACE_FORM_DECORATE" }>;
type Vessel = FD["vessels"][number];

function fd(workerId: string, vessels: Vessel[], extra: Partial<Omit<FD, "type" | "workerId" | "vessels">> = {}): FD {
  return { type: "PLACE_FORM_DECORATE", workerId, vessels, ...extra };
}

const v = (shape: Vessel["shape"], decoration: Decoration = "plain"): Vessel => ({ shape, decoration });

function players(p1: PlayerSpec): PlayerSpec[] {
  return [{ resources: { clay: 10, wood: 0, coins: 10 }, ...p1 }, {}];
}

describe("Apprentice effect: form 1 vessel, paying its Clay and 2 Coins (rev. 4 L183)", () => {
  it("pays the Shape's Clay and 2 Coins, forms a Shaped vessel on space 0, then hands over", () => {
    const t = table();
    const events = t.act("p1", fd("p1:apprentice:1", [v("bowl", "impressed")]));
    expect(t.player("p1").resources).toEqual({ clay: 1, wood: 3, coins: 1 });
    expect(events).toEqual([
      {
        type: "WORKER_PLACED",
        playerId: "p1",
        workerId: "p1:apprentice:1",
        kind: "apprentice",
        locationId: "form_decorate",
        spaceIndex: 0,
        effect: "apprentice",
        viaSeniorApprentice: false,
      },
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: -1, wood: 0, coins: -2, reason: "form_decorate" },
      { type: "CERAMIC_FORMED", playerId: "p1", ceramicId: "c1", shape: "bowl", decoration: "impressed", formedBy: "form_decorate" },
    ]);
    // L173, L357: a Shaped ceramic records Shape and Decoration.
    expect(ceramicsOf(t.state, "p1", "shaped")).toMatchObject([
      { id: "c1", stage: "shaped", shape: "bowl", decoration: "impressed", formedBy: "form_decorate", formedInRound: 1 },
    ]);
    expect(t.halts).toEqual([{ kind: "worker_action_done", playerId: "p1" }]);
    expectPublicEvents(events);
  });

  it.each(DECORATIONS)("a %s vessel costs 2 Coins (rev. 4 L336)", (decoration) => {
    const t = table({ players: players({}) });
    t.act("p1", fd("p1:apprentice:1", [v("plate", decoration)]));
    expect(t.player("p1").resources.coins).toBe(8);
  });

  it("forms exactly 1 vessel: never 0, never 2", () => {
    reject(table({ players: players({}) }), "p1", fd("p1:apprentice:1", []), "INVALID_CHOICE");
    const error = reject(table({ players: players({}) }), "p1", fd("p1:apprentice:1", [v("bowl"), v("bowl")]), "TOO_MANY_VESSELS");
    expect(error.details).toMatchObject({ limit: 1, count: 2 });
  });

  it("needs the Clay and the Coins for the whole action", () => {
    const clay = reject(table({ players: [{ resources: { clay: 1 } }, {}] }), "p1", fd("p1:apprentice:1", [v("vase")]), "INSUFFICIENT_RESOURCES");
    expect(clay.details).toMatchObject({ resource: "clay", needed: 2, have: 1 });
  });
});

describe("Shifu effect: up to 2 vessels; forming 2 makes one vessel 1 Coin cheaper (rev. 4 L184)", () => {
  it("forms 2 for 4 − 1 Coins", () => {
    const t = table({ players: players({}) });
    const events = t.act("p1", fd("p1:shifu", [v("vase", "carved"), v("washer", "painted")]));
    expect(t.player("p1").resources).toEqual({ clay: 7, wood: 0, coins: 7 });
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "CERAMIC_FORMED", "CERAMIC_FORMED"]);
    expect(ceramicsOf(t.state, "p1", "shaped").map((c) => [c.shape, c.decoration])).toEqual([
      ["vase", "carved"],
      ["washer", "painted"],
    ]);
  });

  it("gives no discount when forming 1, and forms at most 2", () => {
    const t = table({ players: players({}) });
    t.act("p1", fd("p1:shifu", [v("censer", "carved")]));
    expect(t.player("p1").resources).toEqual({ clay: 8, wood: 0, coins: 8 });
    reject(table({ players: players({}) }), "p1", fd("p1:shifu", [v("bowl"), v("bowl"), v("bowl")]), "TOO_MANY_VESSELS");
  });

  it("the discount is applied before payment (R4): 3 Coins suffice for 2 vessels, 2 do not", () => {
    table({ players: [{ resources: { clay: 2, coins: 3 } }, {}] }).act("p1", fd("p1:shifu", [v("bowl"), v("plate")]));
    const error = reject(table({ players: [{ resources: { clay: 2, coins: 2 } }, {}] }), "p1", fd("p1:shifu", [v("bowl"), v("plate")]), "INSUFFICIENT_RESOURCES");
    expect(error.details).toMatchObject({ resource: "coins", needed: 3, have: 2 });
  });
});

describe("Large Throwing Wheel (T01, rev. 4 L602): total Clay −2, minimum 0, with ≥1 Vase or Censer", () => {
  it.each([
    [[v("vase")], 0],
    [[v("vase"), v("bowl")], 1],
    [[v("censer"), v("vase")], 2],
  ] as const)("forms %j for %i Clay", (vessels, clay) => {
    const t = table({ players: players({ techs: ["T01"] }) });
    const worker = vessels.length === 2 ? "p1:shifu" : "p1:apprentice:1";
    const events = t.act("p1", fd(worker, [...vessels], { useLargeThrowingWheel: true }));
    expect(t.player("p1").resources.clay).toBe(10 - clay);
    expect(types(events).slice(0, 3)).toEqual(["WORKER_PLACED", "TECH_USED", "RESOURCES_CHANGED"]);
    expect(t.player("p1").techs[0]).toMatchObject({ id: "T01", usedThisRound: true });
  });

  it("lets a Vase be formed with 0 Clay", () => {
    const t = table({ players: [{ techs: ["T01"], resources: { clay: 0, coins: 2 } }, {}] });
    const events = t.act("p1", fd("p1:apprentice:1", [v("vase")], { useLargeThrowingWheel: true }));
    expect(events[2]).toEqual({ type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: 0, coins: -2, reason: "form_decorate" });
  });

  it("needs a Vase or Censer, the Tech, and an unused allowance; declining keeps it (R4)", () => {
    reject(table({ players: players({ techs: ["T01"] }) }), "p1", fd("p1:apprentice:1", [v("bowl")], { useLargeThrowingWheel: true }), "INVALID_CHOICE");
    reject(table({ players: players({}) }), "p1", fd("p1:apprentice:1", [v("vase")], { useLargeThrowingWheel: true }), "TECH_NOT_OWNED");
    const t = table({ players: players({ techs: ["T01"] }) });
    t.act("p1", fd("p1:apprentice:1", [v("vase")]));
    expect(t.player("p1").resources.clay).toBe(8);
    expect(t.player("p1").techs[0]).toMatchObject({ usedThisRound: false });
    t.act("p1", fd("p1:apprentice:2", [v("vase")], { useLargeThrowingWheel: false }));
    const used = table({ players: players({ techs: [{ id: "T01", usedThisRound: true }] }) });
    reject(used, "p1", fd("p1:apprentice:1", [v("vase")], { useLargeThrowingWheel: true }), "TECH_ALREADY_USED");
  });
});

describe("Decorator's Kit (T16, rev. 4 L603): one Carved/Impressed/Painted vessel −1 Coin", () => {
  it.each(["carved", "impressed", "painted"] as const)("reduces %s to 1 Coin", (decoration) => {
    const t = table({ players: players({ techs: ["T16"] }) });
    const events = t.act("p1", fd("p1:apprentice:1", [v("bowl", decoration)], { decoratorsKitVesselIndex: 0 }));
    expect(t.player("p1").resources.coins).toBe(9);
    expect(events[1]).toEqual({ type: "TECH_USED", playerId: "p1", techId: "T16" });
  });

  it("never reduces Plain, and names one of this action's vessels", () => {
    reject(table({ players: players({ techs: ["T16"] }) }), "p1", fd("p1:apprentice:1", [v("bowl")], { decoratorsKitVesselIndex: 0 }), "INVALID_VESSEL_CHOICE");
    reject(table({ players: players({ techs: ["T16"] }) }), "p1", fd("p1:apprentice:1", [v("bowl", "carved")], { decoratorsKitVesselIndex: 1 }), "INVALID_VESSEL_CHOICE");
    reject(table({ players: players({}) }), "p1", fd("p1:apprentice:1", [v("bowl", "carved")], { decoratorsKitVesselIndex: 0 }), "TECH_NOT_OWNED");
  });

  it("is optional (R4): a full-price Carved keeps the Kit ready for later this round", () => {
    const t = table({ players: players({ techs: ["T16"] }) });
    t.act("p1", fd("p1:apprentice:1", [v("bowl", "carved")]));
    expect(t.player("p1").resources.coins).toBe(8);
    expect(t.player("p1").techs[0]).toMatchObject({ id: "T16", usedThisRound: false });
    t.act("p1", fd("p1:shifu", [v("bowl", "painted")], { decoratorsKitVesselIndex: 0 }));
    expect(t.player("p1").resources.coins).toBe(7);
    // Both spaces are now used (T16 unlocked the second); the quote shows the Kit is spent.
    const again = quoteFormDecorate(actorViewOf(t.state, "p1"), fd("p1:apprentice:2", [v("bowl", "painted")], { decoratorsKitVesselIndex: 0 }));
    expect(again.error?.code).toBe("TECH_ALREADY_USED");
  });

  it("stacks with the Shifu discount on the same vessel: a Carved for 0 (rev. 4 L603, L639)", () => {
    const state = buildState({ players: players({ techs: ["T16"] }) });
    const command = fd("p1:shifu", [v("bowl", "carved"), v("plate")], { decoratorsKitVesselIndex: 0 });
    const quote = quoteFormDecorate(actorViewOf(state, "p1"), command);
    expect(quote.pay).toEqual({ clay: 2, wood: 0, coins: 2 });
    expect(quote.lines.filter((line) => line.resource === "coins")).toEqual([
      { kind: "vessel_coins", resource: "coins", amount: 2, itemIndex: 0 },
      { kind: "vessel_coins", resource: "coins", amount: 2, itemIndex: 1 },
      { kind: "decorators_kit", resource: "coins", amount: -1, itemIndex: 0 },
      { kind: "shifu_discount", resource: "coins", amount: -1, itemIndex: 0 },
    ]);
    const t = table({ players: players({ techs: ["T16"] }) });
    t.act("p1", command);
    expect(t.player("p1").resources.coins).toBe(8);
  });
});

describe("Ding (rev. 4 L469, R1): 1 Clay + 1 Coin for one more Bowl/Plate/Brush Washer of the same Shape", () => {
  const ding = (p1: PlayerSpec = {}) => players({ kilnId: "DI", ...p1 });

  it("forms the extra vessel after the action's vessel, with either worker type", () => {
    const t = table({ players: ding() });
    const events = t.act("p1", fd("p1:apprentice:1", [v("bowl", "carved")], { dingExtra: { copyOfVesselIndex: 0, decoration: "painted" } }));
    expect(t.player("p1").resources).toEqual({ clay: 8, wood: 0, coins: 7 });
    expect(types(events)).toEqual([
      "WORKER_PLACED",
      "RESOURCES_CHANGED",
      "CERAMIC_FORMED",
      "KILN_ABILITY_USED",
      "RESOURCES_CHANGED",
      "CERAMIC_FORMED",
    ]);
    expect(events[3]).toEqual({ type: "KILN_ABILITY_USED", playerId: "p1", kilnId: "DI" });
    expect(events[4]).toEqual({ type: "RESOURCES_CHANGED", playerId: "p1", clay: -1, wood: 0, coins: -1, reason: "ding_extra" });
    expect(events[5]).toEqual({ type: "CERAMIC_FORMED", playerId: "p1", ceramicId: "c2", shape: "bowl", decoration: "painted", formedBy: "ding_extra" });
    expect(t.player("p1").kilnAbilityUsedThisRound).toBe(true);
    expectPublicEvents(events);
  });

  it("is outside the vessel limit and the Shifu discount (rev. 4 L469, L639)", () => {
    const t = table({ players: ding() });
    t.act("p1", fd("p1:shifu", [v("vase", "carved"), v("washer", "impressed")], { dingExtra: { copyOfVesselIndex: 1, decoration: "plain" } }));
    // Vessels: 2 + 1 Clay, 4 − 1 Coins. Ding: 1 Clay + 1 Coin.
    expect(t.player("p1").resources).toEqual({ clay: 6, wood: 0, coins: 6 });
    expect(ceramicsOf(t.state, "p1", "shaped").map((c) => [c.shape, c.formedBy])).toEqual([
      ["vase", "form_decorate"],
      ["washer", "form_decorate"],
      ["washer", "ding_extra"],
    ]);
  });

  it("takes neither Large Throwing Wheel nor Decorator's Kit (rev. 4 L639)", () => {
    const wheel = table({ players: ding({ techs: ["T01"] }) });
    wheel.act("p1", fd("p1:shifu", [v("vase"), v("bowl")], { useLargeThrowingWheel: true, dingExtra: { copyOfVesselIndex: 1, decoration: "plain" } }));
    expect(wheel.player("p1").resources.clay).toBe(10 - (1 + 1)); // max(0, 3 − 2) + Ding's 1
    // Ding's vessel never triggers the Wheel: Bowls alone cannot use it.
    reject(
      table({ players: ding({ techs: ["T01"] }) }),
      "p1",
      fd("p1:apprentice:1", [v("bowl")], { useLargeThrowingWheel: true, dingExtra: { copyOfVesselIndex: 0, decoration: "plain" } }),
      "INVALID_CHOICE",
    );
    const kit = table({ players: ding({ techs: ["T16"] }) });
    kit.act("p1", fd("p1:apprentice:1", [v("plate", "carved")], { decoratorsKitVesselIndex: 0, dingExtra: { copyOfVesselIndex: 0, decoration: "carved" } }));
    expect(kit.player("p1").resources.coins).toBe(10 - 1 - 1);
  });

  it("copies only a Bowl, Plate or Brush Washer of this action", () => {
    reject(table({ players: ding() }), "p1", fd("p1:apprentice:1", [v("vase")], { dingExtra: { copyOfVesselIndex: 0, decoration: "plain" } }), "INVALID_VESSEL_CHOICE");
    reject(table({ players: ding() }), "p1", fd("p1:apprentice:1", [v("bowl")], { dingExtra: { copyOfVesselIndex: 1, decoration: "plain" } }), "INVALID_VESSEL_CHOICE");
  });

  it("needs the Ding Kiln and its unused once-per-round use; declining keeps it (R4)", () => {
    reject(table({ players: players({}) }), "p1", fd("p1:apprentice:1", [v("bowl")], { dingExtra: { copyOfVesselIndex: 0, decoration: "plain" } }), "KILN_ABILITY_NOT_OWNED");
    reject(
      table({ players: ding({ kilnAbilityUsedThisRound: true }) }),
      "p1",
      fd("p1:apprentice:1", [v("bowl")], { dingExtra: { copyOfVesselIndex: 0, decoration: "plain" } }),
      "ABILITY_ALREADY_USED",
    );
    const t = table({ players: ding() });
    t.act("p1", fd("p1:apprentice:1", [v("bowl")]));
    expect(t.player("p1").kilnAbilityUsedThisRound).toBe(false);
  });

  it("must be paid in full with the rest of the action", () => {
    const error = reject(
      table({ players: [{ kilnId: "DI", resources: { clay: 1, coins: 2 } }, {}] }),
      "p1",
      fd("p1:apprentice:1", [v("bowl")], { dingExtra: { copyOfVesselIndex: 0, decoration: "plain" } }),
      "INSUFFICIENT_RESOURCES",
    );
    expect(error.details).toMatchObject({ resource: "clay", needed: 2, have: 1 });
  });
});

describe("quoteFormDecorate (DESIGN §5.4)", () => {
  it("itemises Shape Clay, the Wheel, each vessel's Coins, the Kit, the Shifu discount and Ding", () => {
    const state = buildState({ players: [{ kilnId: "DI", techs: ["T01"], resources: { clay: 9, coins: 9 } }, {}] });
    const quote = quoteFormDecorate(
      actorViewOf(state, "p1"),
      fd("p1:shifu", [v("censer", "painted"), v("plate")], { useLargeThrowingWheel: true, dingExtra: { copyOfVesselIndex: 1, decoration: "carved" } }),
    );
    expect(quote).toEqual({
      ok: true,
      error: null,
      pay: { clay: 2, wood: 0, coins: 4 },
      gain: { clay: 0, wood: 0, coins: 0 },
      lines: [
        { kind: "shape_clay", resource: "clay", amount: 2, itemIndex: 0 },
        { kind: "shape_clay", resource: "clay", amount: 1, itemIndex: 1 },
        { kind: "large_throwing_wheel", resource: "clay", amount: -2, itemIndex: null },
        { kind: "vessel_coins", resource: "coins", amount: 2, itemIndex: 0 },
        { kind: "vessel_coins", resource: "coins", amount: 2, itemIndex: 1 },
        { kind: "shifu_discount", resource: "coins", amount: -1, itemIndex: 0 },
        { kind: "ding_extra", resource: "clay", amount: 1, itemIndex: null },
        { kind: "ding_extra", resource: "coins", amount: 1, itemIndex: null },
      ],
    });
  });
});

describe("privacy and determinism", () => {
  it("validation depends on the public view only (hidden contents scrambled)", () => {
    const state = buildState(withHands({ players: [{ kilnId: "DI", techs: ["T16"] }, {}] }));
    const commands = [
      fd("p1:apprentice:1", [v("bowl", "carved")], { decoratorsKitVesselIndex: 0, dingExtra: { copyOfVesselIndex: 0, decoration: "plain" } }),
      fd("p1:apprentice:1", [v("vase"), v("bowl")]),
      fd("p1:shifu", [v("vase"), v("vase")]),
    ];
    for (const command of commands) {
      expect(verdict(scrambleHidden(state), "p1", command)).toBe(verdict(state, "p1", command));
    }
  });

  it("a key-sorted (jsonb) state resolves to the same events and state", () => {
    const spec = withHands({ players: ding2() });
    const command = fd("p1:shifu", [v("bowl", "carved"), v("vase")], { dingExtra: { copyOfVesselIndex: 0, decoration: "painted" } });
    const plain = table(spec);
    const sorted = table(spec);
    sorted.state = keySorted(sorted.state);
    expect(sorted.act("p1", command)).toEqual(plain.act("p1", command));
    expect(keySorted(sorted.state)).toEqual(keySorted(plain.state));
  });
});

function ding2(): PlayerSpec[] {
  return players({ kilnId: "DI" });
}
