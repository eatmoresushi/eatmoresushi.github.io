/**
 * B5's Order and hand-trim draft models (UI_V1.6.1_ARCHITECTURE §3.5, §9.2), and the table
 * adapters of the Order Phase and the trim (§3.5 `TableSelection`). Owner: B5. V1.6.2 completes
 * Orders only in the Order Phase (L296): Canal Barge pays Coins on a completion and has no form.
 */
import { describe, expect, it } from "vitest";
import type { AuthoritativeCommand, PlayerView } from "../../../../src/game/index.ts";
import { handTrimDraft } from "../../../../src/app/decision/cleanup/HandTrim.draft.ts";
import { EMPTY_COMPLETION } from "../../../../src/app/decision/orders/orderCompletion.ts";
import { orderDraft } from "../../../../src/app/decision/orders/orderDraft.ts";
import type { OrderAction, OrderDraft } from "../../../../src/app/decision/orders/orderDraft.ts";
import { FIRING_WINDOWS } from "../../../../src/app/decision/windows.firing.ts";
import { checkCommand } from "../../../../src/app/session/fixtureSource.ts";
import { REVALIDATE } from "../../../../src/app/state/draftStore.ts";
import { buildGameModel, engineViewOf } from "../../../../src/app/state/model.ts";
import type { EngineView, GameModel } from "../../../../src/app/state/model.ts";
import { fixture } from "../support/fixtures.ts";

interface Ctx {
  view: PlayerView;
  model: GameModel;
  engine: EngineView;
}

function ctx(id: string): Ctx {
  const view = structuredClone(fixture(id).playerView);
  return { view, model: buildGameModel(view, []), engine: engineViewOf(view) };
}

function orders(c: Ctx, ...actions: OrderAction[]): OrderDraft {
  let draft = orderDraft.initial(c.model, c.engine);
  for (const action of actions) draft = orderDraft.reduce(draft, action, c.model, c.engine);
  return draft;
}

const valid = (c: Ctx, command: AuthoritativeCommand | null) => command !== null && checkCommand(c.view, command) === null;

describe("Order Phase", () => {
  const ru = ctx("w-order-phase-with-ru-tribute-ware-and-a-crackle-wildcard");

  it("lists every held Order with whether it can be completed; nothing chosen", () => {
    const draft = orders(ru);
    expect(draft).toEqual({ ...EMPTY_COMPLETION, end: false });
    const options = orderDraft.options(draft, ru.model, ru.engine);
    expect(options.orders).toEqual([
      { orderId: "O22", completable: true },
      { orderId: "O18", completable: true },
      { orderId: "S01", completable: true },
      { orderId: "S07", completable: true },
    ]);
    expect(orderDraft.build(draft, ru.model, ru.engine)).toBeNull();
    expect(orderDraft.summary(draft, ru.model, ru.engine)?.key).toBe("orders.turn.pick");
  });

  it("asks for the group when several complete the Order; builds with Ru and Tribute Ware used", () => {
    const chosen = orders(ru, { type: "order", orderId: "O22" });
    expect(chosen.ceramicIds).toBeNull();
    const options = orderDraft.options(chosen, ru.model, ru.engine);
    expect(options.groups.map((group) => group.key)).toEqual(["c1", "c2"]);
    const grouped = orderDraft.reduce(chosen, { type: "group", key: "c2" }, ru.model, ru.engine);
    expect(orderDraft.options(grouped, ru.model, ru.engine).match?.triggers).toEqual({ ru: true, guan: false, tributeWare: true, canalBarge: false });
    const command = orderDraft.build(grouped, ru.model, ru.engine);
    expect(command).toEqual({ type: "COMPLETE_ORDER", orderId: "O22", ceramicIds: ["c2"] });
    expect(valid(ru, command)).toBe(true);
  });

  it("declining Ru or Tribute Ware sets its flag (R4); a flag the match does not trigger is dropped", () => {
    const grouped = orders(ru, { type: "order", orderId: "O22" }, { type: "group", key: "c1" }, { type: "decline", ability: "kiln", decline: true }, { type: "decline", ability: "tributeWare", decline: true });
    expect(orderDraft.build(grouped, ru.model, ru.engine)).toEqual({ type: "COMPLETE_ORDER", orderId: "O22", ceramicIds: ["c1"], declineKilnAbility: true, declineTributeWare: true });
    const s01 = orders(ru, { type: "order", orderId: "S01" }, { type: "group", key: "c4" }, { type: "decline", ability: "kiln", decline: true });
    expect(s01.declineKilnAbility).toBe(false);
  });

  it("preselects the only group, and ends the turn on request", () => {
    const o18 = orders(ru, { type: "order", orderId: "O18" });
    expect(o18.ceramicIds).toEqual(["c3"]);
    expect(orderDraft.build(orders(ru, { type: "end" }), ru.model, ru.engine)).toEqual({ type: "END_ORDER_TURN" });
  });

  it("Crackle: auto mode omits declarations; explicit verdicts come from the validator (S07, \"Carved, Impressed or Painted\", change 23)", () => {
    const auto = orders(ru, { type: "order", orderId: "S07" });
    expect(auto.ceramicIds).toEqual(["c3"]);
    const autoOptions = orderDraft.options(auto, ru.model, ru.engine);
    expect(autoOptions.crackle?.ceramics.map((entry) => entry.ceramicId)).toEqual(["c3"]);
    expect(autoOptions.check?.ok).toBe(true);
    expect(orderDraft.build(auto, ru.model, ru.engine)).toEqual({ type: "COMPLETE_ORDER", orderId: "S07", ceramicIds: ["c3"] });

    const explicit = orderDraft.reduce(auto, { type: "declarationMode", mode: "explicit" }, ru.model, ru.engine);
    expect(explicit.declarations).toEqual([]);
    const verdicts = orderDraft.options(explicit, ru.model, ru.engine).crackle?.ceramics[0]?.options.map((option) => [option.decoration, option.check.ok]);
    // Its printed Plain does not fill S07; any one of the three listed Decorations does.
    expect(verdicts).toEqual([
      [null, false],
      ["plain", false],
      ["carved", true],
      ["impressed", true],
      ["painted", true],
    ]);
    const wrong = orderDraft.reduce(explicit, { type: "declare", ceramicId: "c3", decoration: "plain" }, ru.model, ru.engine);
    const wrongCommand = orderDraft.build(wrong, ru.model, ru.engine);
    expect(wrongCommand).toEqual({ type: "COMPLETE_ORDER", orderId: "S07", ceramicIds: ["c3"], crackleDeclarations: [{ ceramicId: "c3", decoration: "plain" }] });
    expect(valid(ru, wrongCommand)).toBe(false);
    const impressed = orderDraft.reduce(wrong, { type: "declare", ceramicId: "c3", decoration: "impressed" }, ru.model, ru.engine);
    expect(valid(ru, orderDraft.build(impressed, ru.model, ru.engine))).toBe(true);
    expect(orderDraft.summary(impressed, ru.model, ru.engine)?.key).toBe("orders.turn.sum");
  });

  it("a blocked Order cannot be chosen, and revalidation drops an Order no longer completable", () => {
    const m6 = ctx("m6_order_phase_crackle_3p");
    expect(orders(m6, { type: "order", orderId: "O48" }).orderId).toBeNull();
    const stale: OrderDraft = { ...EMPTY_COMPLETION, orderId: "O48", ceramicIds: ["c6"], end: false };
    expect(orderDraft.reduce(stale, REVALIDATE, m6.model, m6.engine)).toEqual({ ...EMPTY_COMPLETION, end: false });
  });

  it("table adapter: hand Order states and the chosen group's ceramics; clicking a completable Order chooses it", () => {
    const m6 = ctx("m6_order_phase_crackle_3p");
    const table = FIRING_WINDOWS.orders.table!;
    const draft = orders(m6, { type: "order", orderId: "O30" });
    const selection = table.select(draft, m6.model, m6.engine);
    expect(Object.fromEntries([...selection.orderTargets].map(([key, target]) => [key, target.state]))).toEqual({
      S02: "blocked",
      O30: "chosen",
      O19: "completable",
      O15: "completable",
      O48: "blocked",
    });
    expect([...selection.highlightedCeramicIds]).toEqual(["c6", "c16"]);
    expect(table.act(draft, { type: "order", key: "O19" }, m6.model, m6.engine)).toEqual({ type: "order", orderId: "O19" });
    expect(table.act(draft, { type: "order", key: "O48" }, m6.model, m6.engine)).toBeNull();
  });
});

describe("Canal Barge (v1.6.2 L622): 2 Coins on the first completion each round, automatic", () => {
  it("is a trigger of the completion, never a command or a choice to decline", () => {
    const view = structuredClone(fixture("w-order-phase-with-ru-tribute-ware-and-a-crackle-wildcard").playerView);
    const me = view.game.players[view.viewerId!]!;
    me.techs = [...me.techs.filter((tech) => tech.id !== "T25"), { id: "T23", acquiredInRound: 1, usedThisRound: false }];
    const c = { view, model: buildGameModel(view, []), engine: engineViewOf(view) };
    const grouped = orders(c, { type: "order", orderId: "S01" });
    expect(orderDraft.options(grouped, c.model, c.engine).match?.triggers.canalBarge).toBe(true);
    // Declining applies to Ru/Guan and Tribute Ware only: the command never carries a Canal Barge flag.
    const command = orderDraft.build(orderDraft.reduce(grouped, { type: "decline", ability: "kiln", decline: true }, c.model, c.engine), c.model, c.engine);
    expect(command).toEqual({ type: "COMPLETE_ORDER", orderId: "S01", ceramicIds: ["c4"] });
    expect(valid(c, command)).toBe(true);
    // Used this round: no Coins on a later completion.
    me.techs = me.techs.map((tech) => (tech.id === "T23" ? { ...tech, usedThisRound: true } : tech));
    const used = { view, model: buildGameModel(structuredClone(view), []), engine: engineViewOf(structuredClone(view)) };
    expect(orderDraft.options(orders(used, { type: "order", orderId: "S01" }), used.model, used.engine).match?.triggers.canalBarge).toBe(false);
  });
});

describe("hand trim", () => {
  const c = ctx("w-cleanup-hand-limit");

  it("checks exactly the excess; a wrong count shows the engine's reason", () => {
    const options = handTrimDraft.options(handTrimDraft.initial(c.model, c.engine), c.model, c.engine);
    expect(options.held).toEqual(["S01", "S02", "O01", "O02", "O03", "O04"]);
    expect(options.status).toEqual({ held: 6, limit: 4, mustDiscard: 2, trimDue: true });
    let draft = handTrimDraft.initial(c.model, c.engine);
    expect(handTrimDraft.build(draft, c.model, c.engine)).toBeNull();
    draft = handTrimDraft.reduce(draft, { type: "toggle", orderId: "O03", discard: true }, c.model, c.engine);
    const one = handTrimDraft.build(draft, c.model, c.engine);
    expect(checkCommand(c.view, one!)?.code).toBe("HAND_LIMIT_DISCARD_COUNT");
    expect(handTrimDraft.summary(draft, c.model, c.engine)).toEqual({ key: "orders.trim.count", params: { chosen: 1, n: 2 } });
    draft = handTrimDraft.reduce(draft, { type: "toggle", orderId: "S01", discard: true }, c.model, c.engine);
    const command = handTrimDraft.build(draft, c.model, c.engine);
    expect(command).toEqual({ type: "DISCARD_TO_HAND_LIMIT", orderIds: ["O03", "S01"] });
    expect(valid(c, command)).toBe(true);
    draft = handTrimDraft.reduce(draft, { type: "toggle", orderId: "O03", discard: false }, c.model, c.engine);
    expect(draft.orderIds).toEqual(["S01"]);
    expect(handTrimDraft.reduce(draft, { type: "toggle", orderId: "O48", discard: true }, c.model, c.engine)).toBe(draft);
  });

  it("table adapter: discard marks, and a click toggles the Order", () => {
    const table = FIRING_WINDOWS.hand_limit.table!;
    const draft = { orderIds: ["O02"] };
    const selection = table.select(draft, c.model, c.engine);
    expect(selection.orderTargets.get("O02")).toEqual({ state: "discard", disabled: false });
    expect(selection.orderTargets.get("S01")).toEqual({ state: "choosable", disabled: false });
    expect(table.act(draft, { type: "order", key: "S01" }, c.model, c.engine)).toEqual({ type: "toggle", orderId: "S01", discard: true });
    expect(table.act(draft, { type: "order", key: "O02" }, c.model, c.engine)).toEqual({ type: "toggle", orderId: "O02", discard: false });
  });
});
