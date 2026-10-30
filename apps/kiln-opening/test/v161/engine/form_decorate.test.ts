/**
 * Form & Decorate (rev. 5 L197–205, L354, change 30): Apprentice and Shifu effects, each vessel's
 * Shape Clay + 2 Coins whatever its Decoration, the Shifu's −1 Coin on one vessel when forming 2
 * (rev. 5 L202), Large Throwing Wheel (T01, rev. 5 L621), Decorator's Kit on any vessel (T16,
 * rev. 5 L622, change 37) and Ding at 1 Clay + 2 Coins (rev. 5 L488, change 40, R1), incl. the two
 * separate reductions of rev. 5 L658, I4 and provisional default P6.
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

describe("Apprentice effect: form 1 vessel, paying its Clay and 2 Coins (L201)", () => {
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
    // L205, L371: a Shaped ceramic records Shape and Decoration.
    expect(ceramicsOf(t.state, "p1", "shaped")).toMatchObject([
      { id: "c1", stage: "shaped", shape: "bowl", decoration: "impressed", formedBy: "form_decorate", formedInRound: 1 },
    ]);
    expect(t.halts).toEqual([{ kind: "worker_action_done", playerId: "p1" }]);
    expectPublicEvents(events);
  });

  it.each(DECORATIONS)("a %s vessel costs 2 Coins (L354)", (decoration) => {
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

describe("Shifu effect: up to 2 vessels; forming 2 makes one vessel 1 Coin cheaper (L202)", () => {
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

describe("Large Throwing Wheel (T01, L621): total Clay −2, minimum 0, with ≥1 Vase or Censer", () => {
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

describe("Decorator's Kit (T16, rev. 5 L622, change 37): any one vessel −1 Coin", () => {
  it.each(["plain", "carved", "impressed", "painted"] as const)("reduces a %s vessel to 1 Coin", (decoration) => {
    const t = table({ players: players({ techs: ["T16"] }) });
    const events = t.act("p1", fd("p1:apprentice:1", [v("bowl", decoration)], { decoratorsKitVesselIndex: 0 }));
    expect(t.player("p1").resources.coins).toBe(9);
    expect(events[1]).toEqual({ type: "TECH_USED", playerId: "p1", techId: "T16" });
  });

  it("may name any vessel of the action, and only a vessel of this action (the Decoration check is gone)", () => {
    for (const index of [0, 1]) {
      const state = buildState({ players: players({ techs: ["T16"] }) });
      const quote = quoteFormDecorate(actorViewOf(state, "p1"), fd("p1:shifu", [v("bowl"), v("vase")], { decoratorsKitVesselIndex: index }));
      expect(quote.ok, `index ${index}`).toBe(true);
      expect(quote.lines).toContainEqual({ kind: "decorators_kit", resource: "coins", amount: -1, itemIndex: index });
      // 2 + 2 − 1 (Kit) − 1 (Shifu) wherever the Kit goes.
      expect(quote.pay.coins).toBe(2);
    }
    const outside = reject(table({ players: players({ techs: ["T16"] }) }), "p1", fd("p1:apprentice:1", [v("bowl", "carved")], { decoratorsKitVesselIndex: 1 }), "INVALID_VESSEL_CHOICE");
    expect(outside.details).toEqual({ vesselIndex: 1, field: "decoratorsKitVesselIndex" });
    reject(table({ players: players({}) }), "p1", fd("p1:apprentice:1", [v("bowl", "carved")], { decoratorsKitVesselIndex: 0 }), "TECH_NOT_OWNED");
  });

  it("makes Form & Decorate legal with 1 Coin for any Decoration, Plain included (rev. 5 L204)", () => {
    const poor = [{ techs: ["T16"], resources: { clay: 1, wood: 0, coins: 1 } }, {}] as PlayerSpec[];
    const t = table({ players: poor });
    t.act("p1", fd("p1:apprentice:1", [v("bowl")], { decoratorsKitVesselIndex: 0 }));
    expect(t.player("p1").resources).toEqual({ clay: 0, wood: 0, coins: 0 });
    // Without the Kit (or with it spent) 1 Coin forms nothing: the placement itself is illegal.
    const error = reject(table({ players: [{ resources: { clay: 1, wood: 0, coins: 1 } }, {}] }), "p1", fd("p1:apprentice:1", [v("bowl")]), "NO_MAIN_ACTION_POSSIBLE");
    expect(error.details).toMatchObject({ locationId: "form_decorate" });
  });

  it("is optional (R4): a full-price vessel keeps the Kit ready for later this round", () => {
    const t = table({ players: players({ techs: ["T16"] }) });
    t.act("p1", fd("p1:apprentice:1", [v("bowl", "carved")]));
    expect(t.player("p1").resources.coins).toBe(8);
    expect(t.player("p1").techs[0]).toMatchObject({ id: "T16", usedThisRound: false });
    t.act("p1", fd("p1:shifu", [v("bowl")], { decoratorsKitVesselIndex: 0 }));
    expect(t.player("p1").resources.coins).toBe(7);
    // Both spaces are now used (T16 added the second); the quote shows the Kit is spent.
    const again = quoteFormDecorate(actorViewOf(t.state, "p1"), fd("p1:apprentice:2", [v("bowl", "painted")], { decoratorsKitVesselIndex: 0 }));
    expect(again.error?.code).toBe("TECH_ALREADY_USED");
  });

  it("stacks with the Shifu discount on the same vessel: its 2 Coins become 0 (rev. 5 L622, L658)", () => {
    const state = buildState({ players: players({ techs: ["T16"] }) });
    const command = fd("p1:shifu", [v("bowl"), v("plate")], { decoratorsKitVesselIndex: 0 });
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

describe("Ding (rev. 5 L488, change 40, R1): 1 Clay + 2 Coins for one more Bowl/Plate/Brush Washer of the same Shape", () => {
  const ding = (p1: PlayerSpec = {}) => players({ kilnId: "DI", ...p1 });

  it("forms the extra vessel after the action's vessel, with any Decoration and either worker type", () => {
    const t = table({ players: ding() });
    const events = t.act("p1", fd("p1:apprentice:1", [v("bowl", "carved")], { dingExtra: { copyOfVesselIndex: 0, decoration: "painted" } }));
    // Vessel: 1 Clay + 2 Coins; Ding: 1 Clay + 2 Coins.
    expect(t.player("p1").resources).toEqual({ clay: 8, wood: 0, coins: 6 });
    expect(types(events)).toEqual([
      "WORKER_PLACED",
      "RESOURCES_CHANGED",
      "CERAMIC_FORMED",
      "KILN_ABILITY_USED",
      "RESOURCES_CHANGED",
      "CERAMIC_FORMED",
    ]);
    expect(events[3]).toEqual({ type: "KILN_ABILITY_USED", playerId: "p1", kilnId: "DI" });
    expect(events[4]).toEqual({ type: "RESOURCES_CHANGED", playerId: "p1", clay: -1, wood: 0, coins: -2, reason: "ding_extra" });
    expect(events[5]).toEqual({ type: "CERAMIC_FORMED", playerId: "p1", ceramicId: "c2", shape: "bowl", decoration: "painted", formedBy: "ding_extra" });
    expect(t.player("p1").kilnAbilityUsedThisRound).toBe(true);
    expectPublicEvents(events);
  });

  it("is outside the vessel limit; a Shifu forming 2 and Ding's gets one Shifu discount", () => {
    const t = table({ players: ding() });
    t.act("p1", fd("p1:shifu", [v("vase", "carved"), v("washer", "impressed")], { dingExtra: { copyOfVesselIndex: 1, decoration: "plain" } }));
    // Vessels: 2 + 1 Clay, 4 − 1 Coins. Ding: 1 Clay + 2 Coins.
    expect(t.player("p1").resources).toEqual({ clay: 6, wood: 0, coins: 5 });
    expect(ceramicsOf(t.state, "p1", "shaped").map((c) => [c.shape, c.formedBy])).toEqual([
      ["vase", "form_decorate"],
      ["washer", "form_decorate"],
      ["washer", "ding_extra"],
    ]);
  });

  it("does not count toward the Shifu's \"If you form 2\": 1 vessel and Ding's gets no Shifu discount (P6)", () => {
    const state = buildState({ players: ding() });
    const quote = quoteFormDecorate(actorViewOf(state, "p1"), fd("p1:shifu", [v("bowl")], { dingExtra: { copyOfVesselIndex: 0, decoration: "plain" } }));
    expect(quote.pay).toEqual({ clay: 2, wood: 0, coins: 4 });
    expect(quote.lines.map((line) => line.kind)).not.toContain("shifu_discount");
    const t = table({ players: ding() });
    t.act("p1", fd("p1:shifu", [v("bowl")], { dingExtra: { copyOfVesselIndex: 0, decoration: "plain" } }));
    expect(t.player("p1").resources).toEqual({ clay: 8, wood: 0, coins: 6 });
  });

  it("totals with Decorator's Kit and the Shifu discount as if either reduction sat on Ding's vessel (I4)", () => {
    // Shifu, 2 vessels + Ding's, Kit and Shifu discount: 3 × 2 Coins − 2 = 4, whichever vessel
    // carries the reductions; the engine places them on the action's own vessels.
    const kit = table({ players: ding({ techs: ["T16"] }) });
    kit.act("p1", fd("p1:shifu", [v("plate", "carved"), v("bowl")], { decoratorsKitVesselIndex: 1, dingExtra: { copyOfVesselIndex: 0, decoration: "carved" } }));
    expect(kit.player("p1").resources).toEqual({ clay: 10 - 3, wood: 0, coins: 10 - 4 });
    // Apprentice, 1 vessel + Ding's, Kit: 2 × 2 − 1 = 3.
    const apprentice = table({ players: ding({ techs: ["T16"] }) });
    apprentice.act("p1", fd("p1:apprentice:1", [v("plate")], { decoratorsKitVesselIndex: 0, dingExtra: { copyOfVesselIndex: 0, decoration: "plain" } }));
    expect(apprentice.player("p1").resources.coins).toBe(10 - 3);
    // Affordability is the same: exactly 3 Coins suffice for the Apprentice's vessel, the Kit and Ding's.
    const exact = table({ players: [{ kilnId: "DI", techs: ["T16"], resources: { clay: 2, wood: 0, coins: 3 } }, {}] });
    exact.act("p1", fd("p1:apprentice:1", [v("plate")], { decoratorsKitVesselIndex: 0, dingExtra: { copyOfVesselIndex: 0, decoration: "plain" } }));
    expect(exact.player("p1").resources).toEqual({ clay: 0, wood: 0, coins: 0 });
  });

  it("never triggers Large Throwing Wheel: Ding's vessel is not a Vase or Censer (rev. 5 L658)", () => {
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
    // 1 + 2 Coins of Ding's: 3 Coins are 1 short of the vessel's 2 and Ding's 2 (change 40).
    const coins = reject(
      table({ players: [{ kilnId: "DI", resources: { clay: 2, coins: 3 } }, {}] }),
      "p1",
      fd("p1:apprentice:1", [v("bowl")], { dingExtra: { copyOfVesselIndex: 0, decoration: "plain" } }),
      "INSUFFICIENT_RESOURCES",
    );
    expect(coins.details).toMatchObject({ resource: "coins", needed: 4, have: 3 });
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
      pay: { clay: 2, wood: 0, coins: 5 },
      gain: { clay: 0, wood: 0, coins: 0 },
      lines: [
        { kind: "shape_clay", resource: "clay", amount: 2, itemIndex: 0 },
        { kind: "shape_clay", resource: "clay", amount: 1, itemIndex: 1 },
        { kind: "large_throwing_wheel", resource: "clay", amount: -2, itemIndex: null },
        { kind: "vessel_coins", resource: "coins", amount: 2, itemIndex: 0 },
        { kind: "vessel_coins", resource: "coins", amount: 2, itemIndex: 1 },
        { kind: "shifu_discount", resource: "coins", amount: -1, itemIndex: 0 },
        { kind: "ding_extra", resource: "clay", amount: 1, itemIndex: null },
        { kind: "ding_extra", resource: "coins", amount: 2, itemIndex: null },
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
