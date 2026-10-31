/**
 * B5's Order and hand-trim draft models (UI_V1.6.1_ARCHITECTURE §3.5, §9.2), and the table
 * adapters of the Order Phase and the trim (§3.5 `TableSelection`). Owner: B5. Since owner
 * revision 5 the Order Phase is the post-firing free-action window (R28): complete held Orders,
 * sell a Flawed ceramic, spend Imperial Priority. Canal Barge pays Coins on a completion and has
 * no form. The hand trim sells nothing (R26).
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
  const ru = ctx("w-order-phase-with-ru-and-tribute-ware");
  const cr = ctx("w-order-phase-with-a-crackle-wildcard");

  it("lists every held Order with whether it can be completed; nothing chosen", () => {
    const draft = orders(ru);
    expect(draft).toEqual({ ...EMPTY_COMPLETION, end: false, sell: null, selling: false, imperialPriority: null });
    const options = orderDraft.options(draft, ru.model, ru.engine);
    // The pane's list, in D21's order: Deliver per Order it can complete.
    expect(options.freeActions.map((item) => item.key)).toEqual(["complete-O22", "complete-O18", "complete-S01"]);
    expect(options.freeAction).toBeNull();
    expect(options.orders).toEqual([
      { orderId: "O22", completable: true },
      { orderId: "O18", completable: true },
      { orderId: "S01", completable: true },
    ]);
    // Nothing to sell and no Imperial Priority in this turn.
    expect(options.sale).toBeNull();
    expect(options.imperialPriority).toBeNull();
    expect(orderDraft.build(draft, ru.model, ru.engine)).toBeNull();
    expect(orderDraft.summary(draft, ru.model, ru.engine)?.key).toBe("orders.turn.pick");
  });

  it("asks for the group when several complete the Order; builds with Ru and Tribute Ware used", () => {
    const chosen = orders(ru, { type: "order", orderId: "O22" });
    expect(chosen.ceramicIds).toBeNull();
    expect(orderDraft.summary(chosen, ru.model, ru.engine)?.key).toBe("orders.turn.pickGroup");
    const options = orderDraft.options(chosen, ru.model, ru.engine);
    expect(options.groups.map((group) => group.key)).toEqual(["c1", "c2"]);
    const grouped = orderDraft.reduce(chosen, { type: "group", key: "c2" }, ru.model, ru.engine);
    expect(orderDraft.options(grouped, ru.model, ru.engine).match?.triggers).toEqual({ ru: true, guan: false, tributeWare: true, canalBarge: false, crackleVp: 0 });
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
    // A Ge owner's crackled Fine Vase (only Ge makes Crackle, rev. 5 L116, L482; it keeps its Quality, change 39).
    const auto = orders(cr, { type: "order", orderId: "S07" }, { type: "group", key: "c2" });
    expect(auto.ceramicIds).toEqual(["c2"]);
    const autoOptions = orderDraft.options(auto, cr.model, cr.engine);
    expect(autoOptions.crackle?.ceramics.map((entry) => entry.ceramicId)).toEqual(["c2"]);
    expect(autoOptions.check?.ok).toBe(true);
    expect(orderDraft.build(auto, cr.model, cr.engine)).toEqual({ type: "COMPLETE_ORDER", orderId: "S07", ceramicIds: ["c2"] });

    const explicit = orderDraft.reduce(auto, { type: "declarationMode", mode: "explicit" }, cr.model, cr.engine);
    expect(explicit.declarations).toEqual([]);
    const verdicts = orderDraft.options(explicit, cr.model, cr.engine).crackle?.ceramics[0]?.options.map((option) => [option.decoration, option.check.ok]);
    // Its printed Plain does not fill S07; any one of the three listed Decorations does.
    expect(verdicts).toEqual([
      [null, false],
      ["plain", false],
      ["carved", true],
      ["impressed", true],
      ["painted", true],
    ]);
    const wrong = orderDraft.reduce(explicit, { type: "declare", ceramicId: "c2", decoration: "plain" }, cr.model, cr.engine);
    const wrongCommand = orderDraft.build(wrong, cr.model, cr.engine);
    expect(wrongCommand).toEqual({ type: "COMPLETE_ORDER", orderId: "S07", ceramicIds: ["c2"], crackleDeclarations: [{ ceramicId: "c2", decoration: "plain" }] });
    expect(valid(cr, wrongCommand)).toBe(false);
    const impressed = orderDraft.reduce(wrong, { type: "declare", ceramicId: "c2", decoration: "impressed" }, cr.model, cr.engine);
    expect(valid(cr, orderDraft.build(impressed, cr.model, cr.engine))).toBe(true);
    expect(orderDraft.summary(impressed, cr.model, cr.engine)?.key).toBe("orders.turn.sum");
  });

  it("a crackled Masterpiece fills a Masterpiece requirement and scores its Crackle VP (change 39, R30)", () => {
    const o13 = orders(cr, { type: "order", orderId: "O13" });
    expect(o13.ceramicIds).toEqual(["c1"]);
    expect(orderDraft.options(o13, cr.model, cr.engine).match?.triggers.crackleVp).toBe(1);
    expect(valid(cr, orderDraft.build(o13, cr.model, cr.engine))).toBe(true);
  });

  it("a blocked Order cannot be chosen, and revalidation drops an Order no longer completable", () => {
    const m6 = ctx("m6_order_phase_crackle_3p");
    expect(orders(m6, { type: "order", orderId: "S03" }).orderId).toBeNull();
    const stale: OrderDraft = { ...EMPTY_COMPLETION, orderId: "S03", ceramicIds: ["c10"], end: false, sell: null };
    expect(orderDraft.reduce(stale, REVALIDATE, m6.model, m6.engine)).toEqual({ ...EMPTY_COMPLETION, end: false, sell: null, selling: false, imperialPriority: null });
  });

  it("table adapter: hand Order states and the chosen group's ceramics; clicking a completable Order chooses it", () => {
    const m6 = ctx("m6_order_phase_crackle_3p");
    const table = FIRING_WINDOWS.orders.table!;
    const draft = orders(m6, { type: "order", orderId: "O38" });
    const selection = table.select(draft, m6.model, m6.engine);
    expect(Object.fromEntries([...selection.orderTargets].map(([key, target]) => [key, target.state]))).toEqual({
      S05: "completable",
      S03: "blocked",
      O38: "chosen",
      O39: "blocked",
    });
    expect([...selection.highlightedCeramicIds]).toEqual(["c10", "c11"]);
    expect(table.act(draft, { type: "order", key: "S05" }, m6.model, m6.engine)).toEqual({ type: "order", orderId: "S05" });
    expect(table.act(draft, { type: "order", key: "S03" }, m6.model, m6.engine)).toBeNull();
  });

  it("Crackle VP (change 29): a delivered Crackle ceramic is a trigger of the completion, shown with its rewards", () => {
    const m6 = ctx("m6_order_phase_crackle_3p");
    // O38 takes the Ge player's crackled Masterpiece Plate (c10) and a Washer: 1 VP for the Crackle ceramic.
    const draft = orders(m6, { type: "order", orderId: "O38" });
    expect(orderDraft.options(draft, m6.model, m6.engine).match?.triggers.crackleVp).toBe(1);
    // S05 with the Washer (c11) alone delivers no Crackle ceramic.
    const plain = orders(m6, { type: "order", orderId: "S05" }, { type: "group", key: "c11" });
    expect(orderDraft.options(plain, m6.model, m6.engine).match?.triggers.crackleVp).toBe(0);
    expect(valid(m6, orderDraft.build(draft, m6.model, m6.engine))).toBe(true);
  });
});

describe("Order Phase: the post-firing free-action window (owner revision 5, R28)", () => {
  const ip = ctx("w-order-phase-imperial-priority");

  it("offers Imperial Priority alone (its token opens the turn); its ceramic waits for the next round's firing", () => {
    // Nothing is chosen at first, even with one entry: it spends something for good (D21).
    const start = orders(ip);
    expect(orderDraft.options(start, ip.model, ip.engine).freeAction).toBeNull();
    expect(orderDraft.summary(start, ip.model, ip.engine)?.key).toBe("orders.turn.pick");
    const draft = orders(ip, { type: "freeAction", key: "imperial_priority" });
    const options = orderDraft.options(draft, ip.model, ip.engine);
    expect(options.orders).toEqual([]);
    expect(options.sale).toBeNull();
    expect(options.imperialPriority?.usable).toBe(true);
    expect(options.imperialPriority?.vessels.length).toBe(1);
    expect(options.imperialTiming).toBe("next_round");
    expect(options.freeActions.map((item) => item.key)).toEqual(["imperial_priority"]);
    expect(options.freeAction).toBe("imperial_priority");
    expect(orderDraft.summary(draft, ip.model, ip.engine)?.key).toBe("work.summary.chooseGlaze");
  });

  it("builds USE_IMPERIAL_PRIORITY from its form, which the engine accepts in the Order Phase, and round-trips it", () => {
    const vessel = orderDraft.options(orders(ip), ip.model, ip.engine).imperialPriority!.vessels[0]!.ceramicId;
    const partial = orders(ip, { type: "imperialPriority", action: { type: "vessel", ceramicId: vessel } });
    expect(orderDraft.build(partial, ip.model, ip.engine)).toBeNull();
    expect(orderDraft.summary(partial, ip.model, ip.engine)?.key).toBe("work.summary.chooseGlaze");
    const glaze = orderDraft.options(partial, ip.model, ip.engine).imperialPriority!.glazes[0]!;
    const full = orders(
      ip,
      { type: "imperialPriority", action: { type: "vessel", ceramicId: vessel } },
      { type: "imperialPriority", action: { type: "glaze", glaze } },
      { type: "imperialPriority", action: { type: "modifier", modifier: 1 } },
    );
    const command = orderDraft.build(full, ip.model, ip.engine);
    expect(command).toEqual({ type: "USE_IMPERIAL_PRIORITY", ceramicId: vessel, glaze, imperialModifier: 1 });
    expect(valid(ip, command)).toBe(true);
    expect(orderDraft.summary(full, ip.model, ip.engine)?.key).toBe("work.summary.imperialPriority");
    expect(orderDraft.build(orderDraft.fromCommand(command!, ip.model, ip.engine)!, ip.model, ip.engine)).toEqual(command);
    // Ending the turn instead clears it.
    expect(orderDraft.reduce(full, { type: "end" }, ip.model, ip.engine)).toEqual({ ...EMPTY_COMPLETION, end: true, sell: null, selling: false, imperialPriority: null });
  });

  it("in the last round says plainly that the ceramic is never fired (R28)", () => {
    const view = structuredClone(fixture("w-order-phase-imperial-priority").playerView);
    view.game.round = 5;
    const last = { view, model: buildGameModel(view, []), engine: engineViewOf(view) };
    expect(orderDraft.options(orders(last), last.model, last.engine).imperialTiming).toBe("never");
  });

  it("a sale and a completion clear each other and Imperial Priority (one free action per Confirm)", () => {
    const m14 = ctx("m14_sell_flawed");
    const sold = orders(m14, { type: "sell", ceramicId: "c5" });
    expect(orderDraft.build(sold, m14.model, m14.engine)).toEqual({ type: "SELL_FLAWED", ceramicId: "c5" });
    const completing = orderDraft.reduce(sold, { type: "order", orderId: "S05" }, m14.model, m14.engine);
    expect(completing).toMatchObject({ orderId: "S05", sell: null, imperialPriority: null });
    expect(orderDraft.build(completing, m14.model, m14.engine)).toEqual({ type: "COMPLETE_ORDER", orderId: "S05", ceramicIds: ["c4"] });
    // Imperial Priority is not usable here: its action changes nothing.
    expect(orderDraft.reduce(completing, { type: "imperialPriority", action: { type: "vessel", ceramicId: "c4" } }, m14.model, m14.engine)).toBe(completing);
  });

  it("the table shows the Imperial Priority load as a pending chip in the Imperial Kiln", () => {
    const table = FIRING_WINDOWS.orders.table!;
    const vessel = orderDraft.options(orders(ip), ip.model, ip.engine).imperialPriority!.vessels[0]!.ceramicId;
    const glaze = orderDraft.options(orders(ip, { type: "imperialPriority", action: { type: "vessel", ceramicId: vessel } }), ip.model, ip.engine).imperialPriority!.glazes[0]!;
    const draft = orders(ip, { type: "imperialPriority", action: { type: "vessel", ceramicId: vessel } }, { type: "imperialPriority", action: { type: "glaze", glaze } });
    const selection = table.select(draft, ip.model, ip.engine);
    expect(selection.pendingCeramics).toEqual([{ ceramicId: vessel, glaze, at: "imperial" }]);
    expect([...selection.highlightedCeramicIds]).toEqual([vessel]);
  });
});

describe("Canal Barge (rev. 5 L637): 2 Coins on the first completion each round, automatic", () => {
  it("is a trigger of the completion, never a command or a choice to decline", () => {
    const view = structuredClone(fixture("w-order-phase-with-ru-and-tribute-ware").playerView);
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

  it("offers no sale while trimming, even with a Flawed ceramic (R26)", () => {
    const t = ctx("t-cleanup-no-sale");
    const options = handTrimDraft.options(handTrimDraft.initial(t.model, t.engine), t.model, t.engine);
    expect(Object.keys(options).sort()).toEqual(["held", "status"]);
    expect(handTrimDraft.fromCommand({ type: "SELL_FLAWED", ceramicId: "c1" }, t.model, t.engine)).toBeNull();
    expect(FIRING_WINDOWS.hand_limit.table!.select(handTrimDraft.initial(t.model, t.engine), t.model, t.engine).sellTargets.size).toBe(0);
    expect(valid(t, { type: "SELL_FLAWED", ceramicId: "c1" })).toBe(false);
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
