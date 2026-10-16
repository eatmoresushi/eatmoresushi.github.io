/**
 * B5's Order, Canal Barge and hand-trim draft models (UI_V1.6.1_ARCHITECTURE §3.5, §9.2), and the
 * table adapters of the Order Phase and the trim (§3.5 `TableSelection`). Owner: B5.
 */
import { describe, expect, it } from "vitest";
import type { AuthoritativeCommand, PlayerView } from "../../../../src/game/index.ts";
import { handTrimDraft } from "../../../../src/app/decision/cleanup/HandTrim.draft.ts";
import { canalBargeDraft } from "../../../../src/app/decision/orders/canalBargeDraft.ts";
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
      { orderId: "S13", completable: true },
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
    expect(orderDraft.options(grouped, ru.model, ru.engine).match?.triggers).toEqual({ ru: true, guan: false, tributeWare: true });
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

  it("Crackle: auto mode omits declarations; explicit verdicts come from the validator", () => {
    const m6 = ctx("m6_order_phase_crackle_3p");
    const auto = orders(m6, { type: "order", orderId: "O39" });
    expect(auto.ceramicIds).toEqual(["c18", "c21"]);
    const autoOptions = orderDraft.options(auto, m6.model, m6.engine);
    expect(autoOptions.crackle?.ceramics.map((entry) => entry.ceramicId)).toEqual(["c18"]);
    expect(autoOptions.check?.ok).toBe(true);
    expect(orderDraft.build(auto, m6.model, m6.engine)).toEqual({ type: "COMPLETE_ORDER", orderId: "O39", ceramicIds: ["c18", "c21"] });

    const explicit = orderDraft.reduce(auto, { type: "declarationMode", mode: "explicit" }, m6.model, m6.engine);
    expect(explicit.declarations).toEqual([]);
    const verdicts = orderDraft.options(explicit, m6.model, m6.engine).crackle?.ceramics[0]?.options.map((option) => [option.decoration, option.check.ok]);
    expect(verdicts).toEqual([
      [null, false],
      ["plain", false],
      ["carved", false],
      ["impressed", false],
      ["painted", true],
    ]);
    const wrong = orderDraft.reduce(explicit, { type: "declare", ceramicId: "c18", decoration: "carved" }, m6.model, m6.engine);
    const wrongCommand = orderDraft.build(wrong, m6.model, m6.engine);
    expect(wrongCommand).toEqual({ type: "COMPLETE_ORDER", orderId: "O39", ceramicIds: ["c18", "c21"], crackleDeclarations: [{ ceramicId: "c18", decoration: "carved" }] });
    expect(valid(m6, wrongCommand)).toBe(false);
    const painted = orderDraft.reduce(wrong, { type: "declare", ceramicId: "c18", decoration: "painted" }, m6.model, m6.engine);
    expect(valid(m6, orderDraft.build(painted, m6.model, m6.engine))).toBe(true);
    expect(orderDraft.summary(painted, m6.model, m6.engine)?.key).toBe("orders.turn.sum");
  });

  it("a blocked Order cannot be chosen, and revalidation drops an Order no longer completable", () => {
    const m6 = ctx("m6_order_phase_crackle_3p");
    expect(orders(m6, { type: "order", orderId: "O37" }).orderId).toBeNull();
    const stale: OrderDraft = { ...EMPTY_COMPLETION, orderId: "O37", ceramicIds: ["c3"], end: false };
    expect(orderDraft.reduce(stale, REVALIDATE, m6.model, m6.engine)).toEqual({ ...EMPTY_COMPLETION, end: false });
  });

  it("table adapter: hand Order states and the chosen group's ceramics; clicking a completable Order chooses it", () => {
    const m6 = ctx("m6_order_phase_crackle_3p");
    const table = FIRING_WINDOWS.orders.table!;
    const draft = orders(m6, { type: "order", orderId: "O39" });
    const selection = table.select(draft, m6.model, m6.engine);
    expect(Object.fromEntries([...selection.orderTargets].map(([key, target]) => [key, target.state]))).toEqual({
      O48: "completable",
      O39: "chosen",
      O05: "completable",
      O37: "blocked",
      O08: "completable",
    });
    expect([...selection.highlightedCeramicIds]).toEqual(["c18", "c21"]);
    expect(table.act(draft, { type: "order", key: "O05" }, m6.model, m6.engine)).toEqual({ type: "order", orderId: "O05" });
    expect(table.act(draft, { type: "order", key: "O37" }, m6.model, m6.engine)).toBeNull();
  });
});

describe("Canal Barge", () => {
  const c = ctx("w-after-the-worker-action");

  it("completes a held Order through USE_CANAL_BARGE", () => {
    const options = canalBargeDraft.options(canalBargeDraft.initial(c.model, c.engine), c.model, c.engine);
    expect(options.orders.filter((order) => order.completable).map((order) => order.orderId)).toEqual(["O01"]);
    let draft = canalBargeDraft.initial(c.model, c.engine);
    draft = canalBargeDraft.reduce(draft, { type: "order", orderId: "O01" }, c.model, c.engine);
    const command = canalBargeDraft.build(draft, c.model, c.engine);
    expect(command).toEqual({ type: "USE_CANAL_BARGE", orderId: "O01", ceramicIds: ["c1"] });
    expect(valid(c, command)).toBe(true);
    expect(canalBargeDraft.summary(draft, c.model, c.engine)?.key).toBe("orders.barge.sum");
  });

  it("offers nothing outside the viewer's before/after-action window", () => {
    const orderPhase = ctx("w-order-phase-with-ru-tribute-ware-and-a-crackle-wildcard");
    const options = canalBargeDraft.options(canalBargeDraft.initial(orderPhase.model, orderPhase.engine), orderPhase.model, orderPhase.engine);
    expect(options.orders.some((order) => order.completable)).toBe(false);
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
