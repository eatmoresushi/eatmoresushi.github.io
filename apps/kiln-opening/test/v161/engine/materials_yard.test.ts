/**
 * Materials Yard (L157–162): Apprentice and Shifu effects, the Shifu's 1-Coin bonus, Senior
 * Apprentice (T18, L619, R12) and Prepared Clay (T17, L618), resolved split → bonus →
 * Prepared Clay against the running totals (DESIGN §3.5).
 */

import { describe, expect, it } from "vitest";
import { nextPersonalSpace } from "../../../src/game/placement.ts";
import { ceramicsOf, player } from "../../../src/game/state.ts";
import type { GameAction } from "../../../src/game/types.ts";
import { actorViewOf } from "../../../src/game/view.ts";
import { quoteMaterialsYard } from "../../../src/game/work/materialsYard.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";
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

type MY = Extract<GameAction, { type: "PLACE_MATERIALS_YARD" }>;

function my(workerId: string, clay: number, wood: number, extra: Partial<Omit<MY, "type" | "workerId" | "clay" | "wood">> = {}): MY {
  return { type: "PLACE_MATERIALS_YARD", workerId, clay, wood, ...extra };
}

describe("Apprentice effect: 3 Clay/Wood in any mix (L161)", () => {
  it.each([
    [3, 0],
    [0, 3],
    [2, 1],
    [1, 2],
  ])("gains %i Clay and %i Wood, then hands over", (clay, wood) => {
    const t = table();
    const events = t.act("p1", my("p1:apprentice:1", clay, wood));
    expect(t.player("p1").resources).toEqual({ clay: 2 + clay, wood: 2 + wood, coins: 3 });
    expect(events).toEqual([
      {
        type: "WORKER_PLACED",
        playerId: "p1",
        workerId: "p1:apprentice:1",
        kind: "apprentice",
        locationId: "materials_yard",
        spaceIndex: 0,
        effect: "apprentice",
        viaSeniorApprentice: false,
      },
      { type: "RESOURCES_CHANGED", playerId: "p1", clay, wood, coins: 0, reason: "materials_yard" },
    ]);
    expect(t.halts).toEqual([{ kind: "worker_action_done", playerId: "p1" }]);
    expectPublicEvents(events);
  });

  it.each([
    [2, 0],
    [4, 0],
    [2, 2],
    [0, 0],
  ])("rejects %i Clay + %i Wood (must total exactly 3)", (clay, wood) => {
    const error = reject(table(), "p1", my("p1:apprentice:1", clay, wood), "INVALID_RESOURCE_SPLIT");
    expect(error.details).toMatchObject({ total: 3, clay, wood });
  });

  it("cannot buy the Shifu bonus", () => {
    reject(table(), "p1", my("p1:apprentice:1", 3, 0, { buyShifuBonus: true }), "NOT_SHIFU_EFFECT");
  });
});

describe("Shifu effect: 4 Clay/Wood, then may pay 1 Coin for +1 Clay +1 Wood (L162)", () => {
  it("gains 4 in any mix and may decline the bonus (R4)", () => {
    const t = table();
    t.act("p1", my("p1:shifu", 1, 3, { buyShifuBonus: false }));
    expect(t.player("p1").resources).toEqual({ clay: 3, wood: 5, coins: 3 });
    reject(table(), "p1", my("p1:shifu", 3, 0), "INVALID_RESOURCE_SPLIT");
    reject(table(), "p1", my("p1:shifu", 3, 2), "INVALID_RESOURCE_SPLIT");
  });

  it("buys +1 Clay +1 Wood for 1 Coin after the split", () => {
    const t = table();
    const events = t.act("p1", my("p1:shifu", 4, 0, { buyShifuBonus: true }));
    expect(t.player("p1").resources).toEqual({ clay: 7, wood: 3, coins: 2 });
    expect(events.slice(1)).toEqual([
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 4, wood: 0, coins: 0, reason: "materials_yard" },
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: 0, coins: -1, reason: "materials_yard_bonus" },
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 1, wood: 1, coins: 0, reason: "materials_yard_bonus" },
    ]);
  });

  it("needs the Coin to buy the bonus", () => {
    const error = reject(table({ players: [{ resources: { coins: 0 } }, {}] }), "p1", my("p1:shifu", 4, 0, { buyShifuBonus: true }), "INSUFFICIENT_RESOURCES");
    expect(error.details).toMatchObject({ resource: "coins", needed: 1, have: 0 });
  });
});

describe("Senior Apprentice (T18, L619, R12): an Apprentice resolves the whole Shifu effect", () => {
  it("gains 4, may buy the bonus, and uses T18 once", () => {
    const t = table({ players: [{ techs: ["T18"] }, {}] });
    const events = t.act("p1", my("p1:apprentice:1", 2, 2, { seniorApprentice: true, buyShifuBonus: true }));
    expect(t.player("p1").resources).toEqual({ clay: 5, wood: 5, coins: 2 });
    expect(types(events)).toEqual(["WORKER_PLACED", "TECH_USED", "RESOURCES_CHANGED", "RESOURCES_CHANGED", "RESOURCES_CHANGED"]);
    expect(events[0]).toMatchObject({ effect: "shifu", viaSeniorApprentice: true, kind: "apprentice" });
    expect(events[1]).toEqual({ type: "TECH_USED", playerId: "p1", techId: "T18" });
    expect(t.player("p1").techs[0]).toMatchObject({ id: "T18", usedThisRound: true });
    // Once per round: the next Apprentice resolves the Apprentice effect only.
    reject(t, "p1", my("p1:apprentice:2", 2, 2, { seniorApprentice: true }), "TECH_ALREADY_USED");
    reject(t, "p1", my("p1:apprentice:2", 2, 2), "INVALID_RESOURCE_SPLIT");
    t.act("p1", my("p1:apprentice:2", 2, 1));
  });

  it("is optional (R4): without it the Apprentice gains 3 and T18 stays ready", () => {
    const t = table({ players: [{ techs: ["T18"] }, {}] });
    t.act("p1", my("p1:apprentice:1", 3, 0));
    expect(t.player("p1").techs[0]).toMatchObject({ id: "T18", usedThisRound: false });
  });

  it("applies only to an Apprentice and only with the Tech", () => {
    reject(table({ players: [{ techs: ["T18"] }, {}] }), "p1", my("p1:shifu", 4, 0, { seniorApprentice: true }), "SENIOR_APPRENTICE_NOT_APPLICABLE");
    reject(table(), "p1", my("p1:apprentice:1", 4, 0, { seniorApprentice: true }), "TECH_NOT_OWNED");
  });
});

describe("Prepared Clay (T17, L618): after gaining, form 1 vessel for Clay cost +1 and a Decoration", () => {
  it("spends Clay gained by the same action and forms a Shaped vessel (a Tech effect, not F&D)", () => {
    const t = table({ players: [{ techs: ["T17"], resources: { clay: 0 } }, {}] });
    const events = t.act("p1", my("p1:apprentice:1", 3, 0, { preparedClay: { shape: "vase", decoration: "painted" } }));
    expect(t.player("p1").resources).toEqual({ clay: 0, wood: 2, coins: 1 });
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "TECH_USED", "RESOURCES_CHANGED", "CERAMIC_FORMED"]);
    expect(events[3]).toEqual({ type: "RESOURCES_CHANGED", playerId: "p1", clay: -3, wood: 0, coins: -2, reason: "prepared_clay" });
    expect(events[4]).toEqual({
      type: "CERAMIC_FORMED",
      playerId: "p1",
      ceramicId: "c1",
      shape: "vase",
      decoration: "painted",
      formedBy: "prepared_clay",
    });
    expect(ceramicsOf(t.state, "p1", "shaped")).toMatchObject([{ id: "c1", shape: "vase", decoration: "painted", formedBy: "prepared_clay" }]);
    // Not a Form & Decorate action (L646): no personal space was used.
    expect(nextPersonalSpace(t.state, "p1", "form_decorate")).toBe(0);
    expectPublicEvents(events);
  });

  it("resolves after the Shifu bonus, so it may spend the bonus Clay (DESIGN §3.5)", () => {
    const spec = { players: [{ techs: ["T17" as const], resources: { clay: 1, coins: 3 } }, {}] };
    const command = my("p1:shifu", 0, 4, { buyShifuBonus: true, preparedClay: { shape: "bowl", decoration: "plain" } });
    const t = table(spec);
    t.act("p1", command);
    expect(t.player("p1").resources).toEqual({ clay: 0, wood: 7, coins: 0 });
    // Without the bonus the Clay is 1 short.
    const error = reject(table(spec), "p1", { ...command, buyShifuBonus: false }, "INSUFFICIENT_RESOURCES");
    expect(error.details).toMatchObject({ resource: "clay", needed: 2, have: 1 });
  });

  it("is checked against the Coins left after the bonus, and takes no Shifu discount", () => {
    const spec = { players: [{ techs: ["T17" as const], resources: { coins: 2 } }, {}] };
    const error = reject(
      table(spec),
      "p1",
      my("p1:shifu", 4, 0, { buyShifuBonus: true, preparedClay: { shape: "bowl", decoration: "carved" } }),
      "INSUFFICIENT_RESOURCES",
    );
    expect(error.details).toMatchObject({ resource: "coins", needed: 2, have: 1 });
    const t = table(spec);
    t.act("p1", my("p1:shifu", 4, 0, { preparedClay: { shape: "bowl", decoration: "carved" } }));
    expect(t.player("p1").resources.coins).toBe(0);
  });

  it("is optional and once per round (R4)", () => {
    const t = table({ players: [{ techs: ["T17"] }, {}, {}, {}] });
    t.act("p1", my("p1:apprentice:1", 3, 0));
    expect(t.player("p1").techs[0]).toMatchObject({ id: "T17", usedThisRound: false });
    t.act("p1", my("p1:apprentice:2", 3, 0, { preparedClay: { shape: "plate", decoration: "plain" } }));
    reject(t, "p1", my("p1:apprentice:3", 3, 0, { preparedClay: { shape: "plate", decoration: "plain" } }), "TECH_ALREADY_USED");
    reject(table(), "p1", my("p1:apprentice:1", 3, 0, { preparedClay: { shape: "plate", decoration: "plain" } }), "TECH_NOT_OWNED");
  });

  it("Decorator's Kit may reduce its Decoration (audit INT; branch kept although L210 makes it unreachable)", () => {
    // T16 and T17 are both Workshop Techs, so no legal fixture owns both; the quote is pure,
    // so the branch is checked on a hand-built view.
    const state = buildState({ players: [{ techs: ["T17"] }, {}] });
    player(state, "p1").techs.push({ id: "T16", acquiredInRound: 1, usedThisRound: false });
    const quote = quoteMaterialsYard(
      actorViewOf(state, "p1"),
      my("p1:apprentice:1", 3, 0, { preparedClay: { shape: "censer", decoration: "impressed", useDecoratorsKit: true } }),
    );
    expect(quote).toEqual({
      ok: true,
      error: null,
      pay: { clay: 3, wood: 0, coins: 1 },
      gain: { clay: 3, wood: 0, coins: 0 },
      lines: [
        { kind: "shape_clay", resource: "clay", amount: 2, itemIndex: null },
        { kind: "prepared_clay_surcharge", resource: "clay", amount: 1, itemIndex: null },
        { kind: "decoration", resource: "coins", amount: 2, itemIndex: null },
        { kind: "decorators_kit", resource: "coins", amount: -1, itemIndex: null },
      ],
    });
    const plain = quoteMaterialsYard(
      actorViewOf(state, "p1"),
      my("p1:apprentice:1", 3, 0, { preparedClay: { shape: "censer", decoration: "plain", useDecoratorsKit: true } }),
    );
    expect(plain.error?.code).toBe("INVALID_VESSEL_CHOICE");
    expectDocumentedDetails(plain.error);
    const noKit = buildState({ players: [{ techs: ["T17"] }, {}] });
    const quoteNoKit = quoteMaterialsYard(
      actorViewOf(noKit, "p1"),
      my("p1:apprentice:1", 3, 0, { preparedClay: { shape: "censer", decoration: "carved", useDecoratorsKit: true } }),
    );
    expect(quoteNoKit.error?.code).toBe("TECH_NOT_OWNED");
  });
});

describe("quoteMaterialsYard (DESIGN §5.4)", () => {
  it("reports gains and costs in resolution order", () => {
    const state = buildState({ players: [{ techs: ["T17"] }, {}] });
    const quote = quoteMaterialsYard(
      actorViewOf(state, "p1"),
      my("p1:shifu", 2, 2, { buyShifuBonus: true, preparedClay: { shape: "bowl", decoration: "plain" } }),
    );
    expect(quote).toMatchObject({ ok: true, error: null, pay: { clay: 2, wood: 0, coins: 3 }, gain: { clay: 3, wood: 3, coins: 0 } });
  });

  it("reports an unavailable worker instead of throwing", () => {
    const quote = quoteMaterialsYard(actorViewOf(buildState(), "p1"), my("p1:apprentice:9", 3, 0));
    expect(quote.error?.code).toBe("WORKER_UNAVAILABLE");
  });
});

describe("privacy and determinism", () => {
  it("validation depends on the public view only (hidden contents scrambled)", () => {
    const state = buildState(withHands({ players: [{ techs: ["T17"] }, {}] }));
    const commands = [
      my("p1:apprentice:1", 3, 0),
      my("p1:apprentice:1", 2, 0),
      my("p1:shifu", 4, 0, { buyShifuBonus: true, preparedClay: { shape: "vase", decoration: "carved" } }),
    ];
    for (const command of commands) {
      expect(verdict(scrambleHidden(state), "p1", command)).toBe(verdict(state, "p1", command));
    }
  });

  it("a key-sorted (jsonb) state resolves to the same events and state", () => {
    const spec = withHands({ players: [{ techs: ["T17"] }, {}] });
    const command = my("p1:shifu", 1, 3, { buyShifuBonus: true, preparedClay: { shape: "censer", decoration: "impressed" } });
    const plain = table(spec);
    const sorted = table(spec);
    sorted.state = keySorted(sorted.state);
    expect(sorted.act("p1", command)).toEqual(plain.act("p1", command));
    expect(keySorted(sorted.state)).toEqual(keySorted(plain.state));
  });
});
