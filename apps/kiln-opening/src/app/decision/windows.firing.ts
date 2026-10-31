/**
 * B5's slice of the window registry (UI_V1.6.1_ARCHITECTURE §3.4, §3.5). Owner: B5 (firing,
 * Order, Cleanup and Results decisions). `decision/windows.ts` merges it with B4's slice and
 * never changes in phase B.
 *
 * Each spec names its component and draft model, its title (the pane heading and phone sheet
 * strip), its ConfirmBar alternative where the window has one (End turn, Done, Decline, Keep it),
 * and a table adapter where the table shows the draft:
 * - Order Phase (the post-firing free-action window, R28): the hand's Order cards (`orderTargets`:
 *   completable, chosen, blocked) and the chosen group's ceramics (`highlightedCeramicIds`);
 *   a completable Order's Deliver badge chooses it; Use on the Imperial Priority token
 *   (`imperialPriority`, D21); Imperial Priority's vessel highlighted and its pending chip in the
 *   Imperial Kiln (`pendingCeramics`); its Confirm is the split Deliver · done / Deliver, with Done
 *   the alternative (owner UI decision D21, `orderSplit`);
 * - hand trim: the hand's Order cards marked for discard (`discard` / `choosable`); clicking one
 *   toggles it;
 * - firing windows: the target ceramic of the draft (`highlightedCeramicIds`); Second Firing's
 *   choice highlights its ceramic;
 * - the Order Phase turn, the only free-action window of this slice (owner revision 5, R26, R28):
 *   a Sell button on each sellable Flawed ceramic (`sellTargets`), which chooses it in the draft
 *   (`saleTargets`, `sale/sellFlawed.ts`). The after-Quality step and the hand trim sell nothing.
 * `final` and `waiting` never send a command (`noDraft()`).
 */
import type { CeramicId, OrderId } from "../../game/index.ts";
import { kilnText, techName } from "../i18n/content.ts";
import { list } from "../i18n/format.ts";
import { msg } from "../i18n/translator.ts";
import type { Translator } from "../i18n/translator.ts";
import { defineWindow, noDraft } from "../state/draftStore.ts";
import type { ConfirmSplit, WindowSpecFor, WindowText } from "../state/draftStore.ts";
import type { EngineView, GameModel } from "../state/model.ts";
import { tableSelection } from "../state/tableSelection.ts";
import type { OrderTargetState } from "../state/tableSelection.ts";
import { HandTrim } from "./cleanup/HandTrim.tsx";
import { handTrimDraft } from "./cleanup/HandTrim.draft.ts";
import { AfterQuality } from "./firing/AfterQuality.tsx";
import { afterQualityDraft } from "./firing/AfterQuality.draft.ts";
import { Contributions } from "./firing/Contributions.tsx";
import { contributionsDraft } from "./firing/Contributions.draft.ts";
import { B5_KILNS, B5_TECHS } from "./firing/firingSupport.ts";
import { Jun } from "./firing/Jun.tsx";
import { junDraft } from "./firing/Jun.draft.ts";
import { SecondFiring } from "./firing/SecondFiring.tsx";
import { secondFiringDraft } from "./firing/SecondFiring.draft.ts";
import { TestPieces } from "./firing/TestPieces.tsx";
import { testPiecesDraft } from "./firing/TestPieces.draft.ts";
import { OrderTurn } from "./orders/OrderTurn.tsx";
import { chosenOrderFreeAction, orderDraft } from "./orders/orderDraft.ts";
import type { OrderDraft } from "./orders/orderDraft.ts";
import { FinalSummary } from "./results/FinalSummary.tsx";
import { acceptsEndTurn } from "./endTurn.ts";
import { freeActionItems } from "./freeActions.ts";
import { saleOffered, saleTargets } from "./sale/sellFlawed.ts";
import { Waiting } from "./Waiting.tsx";

/** The window kinds this slice covers. */
export type FiringWindowKind =
  | "contributions"
  | "test_pieces"
  | "jun"
  | "after_quality"
  | "second_firing"
  | "orders"
  | "hand_limit"
  | "final"
  | "waiting";

/** "Waiting for Lin and Zhao…" from the prompt's actors. */
const waitingTitle = (model: GameModel): WindowText => {
  const names = model.window.actorIds.map((id) => model.players.find((summary) => summary.playerId === id)?.displayName ?? "").filter((name) => name !== "");
  if (names.length === 0) return msg("common.status.waitingForOthers");
  return msg("common.status.waitingFor", { name: (t) => list(names, t.locale) });
};

/** A selection that only highlights ceramics (an ability's target). */
function highlight(ids: readonly (CeramicId | null | undefined)[]) {
  return tableSelection({ highlightedCeramicIds: new Set(ids.filter((id): id is CeramicId => typeof id === "string")) });
}

/** The Order Phase Confirm (D21): ⟨Action⟩ · done, one command, beside ⟨Action⟩. */
function orderSplit(draft: OrderDraft, engine: EngineView): ConfirmSplit | null {
  const chosen = chosenOrderFreeAction(draft);
  if (chosen === null) return null;
  if (chosen === "sell_flawed") return acceptsEndTurn(engine, "SELL_FLAWED") ? { end: msg("common.confirm.sellDone"), stay: msg("common.confirm.sell") } : null;
  if (chosen === "imperial_priority") return acceptsEndTurn(engine, "USE_IMPERIAL_PRIORITY") ? { end: msg("common.confirm.priorityDone"), stay: msg("common.confirm.priority") } : null;
  return acceptsEndTurn(engine, "COMPLETE_ORDER") ? { end: msg("common.confirm.deliverDone"), stay: msg("common.confirm.deliver") } : null;
}

export const FIRING_WINDOWS: { readonly [K in FiringWindowKind]: WindowSpecFor<K> } = {
  contributions: defineWindow({
    kind: "contributions",
    Component: Contributions,
    draft: contributionsDraft,
    title: () => msg("firing.title.contributions"),
  }),
  test_pieces: defineWindow({
    kind: "test_pieces",
    Component: TestPieces,
    draft: testPiecesDraft,
    title: (model) => {
      const tech = (t: Translator) => techName(B5_TECHS.testPieces, t.locale);
      if (model.window.kind === "test_pieces" && model.window.awaiting === "bury") return msg("firing.title.testPiecesBury", { tech });
      return msg("firing.title.testPiecesDecide", { tech });
    },
  }),
  jun: defineWindow({
    kind: "jun",
    Component: Jun,
    draft: junDraft,
    title: () => msg("firing.title.jun", { kiln: (t) => kilnText(B5_KILNS.jun, t.locale).name, ability: (t) => kilnText(B5_KILNS.jun, t.locale).abilityName }),
    alternative: () => ({ label: msg("common.verb.decline"), command: { type: "RESOLVE_JUN", adjustment: null } }),
    table: { select: (draft) => highlight([draft.ceramicId]), act: () => null },
  }),
  after_quality: defineWindow({
    kind: "after_quality",
    Component: AfterQuality,
    draft: afterQualityDraft,
    title: () => msg("firing.title.afterQuality"),
    alternative: () => ({ label: msg("firing.aq.done"), command: { type: "END_AFTER_QUALITY" } }),
    // The target ceramic of the draft. No Sell buttons: nothing is sold during the firing (R26).
    table: { select: (draft) => highlight([draft.choice === null || draft.choice === "end" ? null : draft.choice.ceramicId]), act: () => null },
  }),
  second_firing: defineWindow({
    kind: "second_firing",
    Component: SecondFiring,
    draft: secondFiringDraft,
    title: () => msg("firing.title.secondFiring", { tech: (t) => techName(B5_TECHS.secondFiring, t.locale) }),
    table: { select: (_draft, model) => highlight([model.window.kind === "second_firing" ? model.window.ceramicId : null]), act: () => null },
  }),
  orders: defineWindow({
    kind: "orders",
    Component: OrderTurn,
    draft: orderDraft,
    title: () => msg("orders.title.orders"),
    // "Done" in English (D21). In Chinese the glossary's 完成 is also the verb of completing an Order,
    // which this pane offers beside it, so the button says what it does: 结束回合.
    alternative: () => ({ label: msg("orders.turn.done"), command: { type: "END_ORDER_TURN" } }),
    // With nothing chosen, Done is the only button (D21).
    alternativeOnly: (draft) => chosenOrderFreeAction(draft) === null,
    alternativeTakesEnter: (_draft, _model, engine) => freeActionItems(engine).length === 0,
    confirmSplit: (draft, _model, engine) => orderSplit(draft, engine),
    table: {
      select: (draft, model, engine) => {
        const options = orderDraft.options(draft, model, engine);
        const orderTargets = new Map<string, { state: OrderTargetState; disabled: boolean }>();
        for (const order of options.orders) {
          const state: OrderTargetState = draft.orderId === order.orderId ? "chosen" : order.completable ? "completable" : "blocked";
          orderTargets.set(order.orderId, { state, disabled: !order.completable });
        }
        const highlighted = new Set<CeramicId>(draft.ceramicIds ?? []);
        if (draft.sell !== null) highlighted.add(draft.sell);
        // Imperial Priority (R28): its vessel highlighted, and a pending chip in the Imperial Kiln.
        const imperial = draft.imperialPriority ?? null;
        if (imperial?.ceramicId != null) highlighted.add(imperial.ceramicId);
        const pendingCeramics = imperial !== null && imperial.ceramicId !== null && imperial.glaze !== null ? [{ ceramicId: imperial.ceramicId, glaze: imperial.glaze, at: "imperial" as const }] : [];
        const imperialPriority = freeActionItems(engine).some((item) => item.kind === "imperial_priority") ? { pressed: imperial !== null } : null;
        return tableSelection({ orderTargets, highlightedCeramicIds: highlighted, sellTargets: saleTargets(engine, draft.sell), pendingCeramics, imperialPriority });
      },
      act: (_draft, action, model, engine) => {
        if (action.type === "sell") return saleOffered(engine, action.ceramicId) ? { type: "sell" as const, ceramicId: action.ceramicId } : null;
        if (action.type === "imperial_priority") return freeActionItems(engine).some((item) => item.kind === "imperial_priority") ? { type: "freeAction" as const, key: "imperial_priority" as const } : null;
        if (action.type !== "order") return null;
        const options = orderDraft.options(_draft, model, engine);
        return options.orders.some((order) => order.orderId === action.key && order.completable) ? { type: "order" as const, orderId: action.key as OrderId } : null;
      },
    },
  }),
  hand_limit: defineWindow({
    kind: "hand_limit",
    Component: HandTrim,
    draft: handTrimDraft,
    title: () => msg("orders.title.handLimit"),
    table: {
      select: (draft, model, engine) => {
        const options = handTrimDraft.options(draft, model, engine);
        const orderTargets = new Map<string, { state: OrderTargetState; disabled: boolean }>();
        for (const orderId of options.held) orderTargets.set(orderId, { state: draft.orderIds.includes(orderId) ? "discard" : "choosable", disabled: false });
        // No Sell buttons: nothing is sold while trimming (R26).
        return tableSelection({ orderTargets });
      },
      act: (draft, action, model, engine) => {
        if (action.type !== "order") return null;
        const held = handTrimDraft.options(draft, model, engine).held;
        const orderId = action.key as OrderId;
        return held.includes(orderId) ? { type: "toggle" as const, orderId, discard: !draft.orderIds.includes(orderId) } : null;
      },
    },
  }),
  final: defineWindow({
    kind: "final",
    Component: FinalSummary,
    draft: noDraft(),
    title: (model) => {
      if (model.finalResult !== null && model.finalResult.winnerIds.length > 1) return msg("orders.title.sharedVictory");
      return msg("orders.title.final");
    },
  }),
  waiting: defineWindow({ kind: "waiting", Component: Waiting, draft: noDraft(), title: waitingTitle }),
};
