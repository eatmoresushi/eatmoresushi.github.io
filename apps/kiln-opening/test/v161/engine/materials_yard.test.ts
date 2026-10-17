/**
 * Materials Yard (v1.6.2 L160–165): the Apprentice effect's 3 and the Shifu effect's 6 Clay/
 * Wood, Senior Apprentice (T18, v1.6.2 L618, R12) and Prepared Clay (T17, L618), resolved
 * split → Prepared Clay against the running totals (DESIGN §3.5). V1.6.2 removed the Shifu's
 * 1-Coin +1 Clay +1 Wood option (v1.6.2 L31, L165).
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

describe("Apprentice effect: 3 Clay/Wood in any mix (v1.6.2 L164)", () => {
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
});

describe("Shifu effect: 6 Clay/Wood in any mix, no Coin option (v1.6.2 L165)", () => {
  it.each([0, 1, 2, 3, 4, 5, 6])("gains %i Clay and the rest as Wood, in one event, with no Coin spent", (clay) => {
    const t = table();
    const events = t.act("p1", my("p1:shifu", clay, 6 - clay));
    expect(t.player("p1").resources).toEqual({ clay: 2 + clay, wood: 2 + 6 - clay, coins: 3 });
    expect(events.slice(1)).toEqual([{ type: "RESOURCES_CHANGED", playerId: "p1", clay, wood: 6 - clay, coins: 0, reason: "materials_yard" }]);
  });

  it.each([
    [4, 0],
    [3, 2],
    [6, 1],
    [7, 0],
  ])("rejects %i Clay + %i Wood (must total exactly 6)", (clay, wood) => {
    const error = reject(table(), "p1", my("p1:shifu", clay, wood), "INVALID_RESOURCE_SPLIT");
    expect(error.details).toMatchObject({ total: 6, clay, wood });
    expectDocumentedDetails(error);
  });

  it("gains 6 even with no Coins at all: nothing is paid", () => {
    const t = table({ players: [{ resources: { clay: 0, wood: 0, coins: 0 } }, {}] });
    t.act("p1", my("p1:shifu", 3, 3));
    expect(t.player("p1").resources).toEqual({ clay: 3, wood: 3, coins: 0 });
  });
});

describe("Senior Apprentice (T18, v1.6.2 L618, R12): an Apprentice resolves the whole Shifu effect", () => {
  it("gains 6 and uses T18 once", () => {
    const t = table({ players: [{ techs: ["T18"] }, {}] });
    const events = t.act("p1", my("p1:apprentice:1", 2, 4, { seniorApprentice: true }));
    expect(t.player("p1").resources).toEqual({ clay: 4, wood: 6, coins: 3 });
    expect(types(events)).toEqual(["WORKER_PLACED", "TECH_USED", "RESOURCES_CHANGED"]);
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
    reject(table({ players: [{ techs: ["T18"] }, {}] }), "p1", my("p1:shifu", 6, 0, { seniorApprentice: true }), "SENIOR_APPRENTICE_NOT_APPLICABLE");
    reject(table(), "p1", my("p1:apprentice:1", 6, 0, { seniorApprentice: true }), "TECH_NOT_OWNED");
    // With Senior Apprentice the total is the Shifu effect's 6.
    const short = reject(table({ players: [{ techs: ["T18"] }, {}] }), "p1", my("p1:apprentice:1", 3, 0, { seniorApprentice: true }), "INVALID_RESOURCE_SPLIT");
    expect(short.details).toMatchObject({ total: 6 });
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

  it("resolves after the Shifu's 6, so it may spend the Clay just gained (DESIGN §3.5)", () => {
    const spec = { players: [{ techs: ["T17" as const], resources: { clay: 0, wood: 0, coins: 2 } }, {}] };
    const t = table(spec);
    t.act("p1", my("p1:shifu", 3, 3, { preparedClay: { shape: "vase", decoration: "plain" } }));
    expect(t.player("p1").resources).toEqual({ clay: 0, wood: 3, coins: 0 });
    // A split with too little Clay is short.
    const error = reject(table(spec), "p1", my("p1:shifu", 2, 4, { preparedClay: { shape: "vase", decoration: "plain" } }), "INSUFFICIENT_RESOURCES");
    expect(error.details).toMatchObject({ resource: "clay", needed: 3, have: 2 });
  });

  it("is checked against the Coins held, and takes no Shifu discount", () => {
    const spec = { players: [{ techs: ["T17" as const], resources: { coins: 1 } }, {}] };
    const error = reject(table(spec), "p1", my("p1:shifu", 6, 0, { preparedClay: { shape: "bowl", decoration: "carved" } }), "INSUFFICIENT_RESOURCES");
    expect(error.details).toMatchObject({ resource: "coins", needed: 2, have: 1 });
    const t = table({ players: [{ techs: ["T17"], resources: { coins: 2 } }, {}] });
    t.act("p1", my("p1:shifu", 6, 0, { preparedClay: { shape: "bowl", decoration: "carved" } }));
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

  it("Decorator's Kit may reduce its Decoration (audit INT; branch kept although L211 makes it unreachable)", () => {
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
    const quote = quoteMaterialsYard(actorViewOf(state, "p1"), my("p1:shifu", 2, 4, { preparedClay: { shape: "bowl", decoration: "plain" } }));
    expect(quote).toMatchObject({ ok: true, error: null, pay: { clay: 2, wood: 0, coins: 2 }, gain: { clay: 2, wood: 4, coins: 0 } });
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
      my("p1:shifu", 6, 0, { preparedClay: { shape: "vase", decoration: "carved" } }),
      my("p1:shifu", 4, 0),
    ];
    for (const command of commands) {
      expect(verdict(scrambleHidden(state), "p1", command)).toBe(verdict(state, "p1", command));
    }
  });

  it("a key-sorted (jsonb) state resolves to the same events and state", () => {
    const spec = withHands({ players: [{ techs: ["T17"] }, {}] });
    const command = my("p1:shifu", 3, 3, { preparedClay: { shape: "censer", decoration: "impressed" } });
    const plain = table(spec);
    const sorted = table(spec);
    sorted.state = keySorted(sorted.state);
    expect(sorted.act("p1", command)).toEqual(plain.act("p1", command));
    expect(keySorted(sorted.state)).toEqual(keySorted(plain.state));
  });
});
