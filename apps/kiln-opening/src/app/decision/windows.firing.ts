/**
 * B5's slice of the window registry (UI_V1.6.1_ARCHITECTURE §3.4, §3.5). Owner: B5 (firing,
 * Order, Cleanup and Results decisions). `decision/windows.ts` merges it with B4's slice and
 * never changes in phase B.
 *
 * Each spec names its component and draft model, its title (the pane heading and phone sheet
 * strip), its ConfirmBar alternative where the window has one (End turn, Done, Decline, Keep it),
 * and a table adapter where the table shows the draft:
 * - Order Phase: the hand's Order cards (`orderTargets`: completable, chosen, blocked) and the
 *   chosen group's ceramics (`highlightedCeramicIds`); clicking a completable Order chooses it;
 * - hand trim: the hand's Order cards marked for discard (`discard` / `choosable`); clicking one
 *   toggles it;
 * - firing windows: the target ceramic of the draft (`highlightedCeramicIds`); Second Firing's
 *   choice highlights its ceramic;
 * - the viewer's sale windows among them (change 30, R20: the Order Phase turn, the after-Quality
 *   turn and the hand trim): a Sell button on each sellable Flawed ceramic (`sellTargets`), which
 *   chooses it in the draft (`saleTargets`, `sale/sellFlawed.ts`).
 * `final` and `waiting` never send a command (`noDraft()`).
 */
import type { CeramicId, OrderId } from "../../game/index.ts";
import { kilnText, techName } from "../i18n/content.ts";
import { list } from "../i18n/format.ts";
import { msg } from "../i18n/translator.ts";
import type { Translator } from "../i18n/translator.ts";
import { defineWindow, noDraft } from "../state/draftStore.ts";
import type { WindowSpecFor, WindowText } from "../state/draftStore.ts";
import type { GameModel } from "../state/model.ts";
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
import { orderDraft } from "./orders/orderDraft.ts";
import { FinalSummary } from "./results/FinalSummary.tsx";
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
    table: {
      select: (draft, _model, engine) => {
        const choice = draft.choice === null || draft.choice === "end" ? null : draft.choice;
        return tableSelection({
          highlightedCeramicIds: new Set(choice === null ? [] : [choice.ceramicId]),
          sellTargets: saleTargets(engine, choice?.ability === "sell_flawed" ? choice.ceramicId : null),
        });
      },
      act: (_draft, action, _model, engine) =>
        action.type === "sell" && saleOffered(engine, action.ceramicId) ? { type: "use" as const, ability: "sell_flawed" as const, ceramicId: action.ceramicId } : null,
    },
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
    alternative: () => ({ label: msg("common.verb.endTurn"), command: { type: "END_ORDER_TURN" } }),
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
        return tableSelection({ orderTargets, highlightedCeramicIds: highlighted, sellTargets: saleTargets(engine, draft.sell) });
      },
      act: (_draft, action, model, engine) => {
        if (action.type === "sell") return saleOffered(engine, action.ceramicId) ? { type: "sell" as const, ceramicId: action.ceramicId } : null;
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
        return tableSelection({ orderTargets, sellTargets: saleTargets(engine, draft.sell), highlightedCeramicIds: new Set(draft.sell === null ? [] : [draft.sell]) });
      },
      act: (draft, action, model, engine) => {
        if (action.type === "sell") return saleOffered(engine, action.ceramicId) ? { type: "sell" as const, ceramicId: action.ceramicId } : null;
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
