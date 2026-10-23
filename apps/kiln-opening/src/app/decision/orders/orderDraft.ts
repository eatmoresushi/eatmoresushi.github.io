/**
 * The draft model of the Order Phase turn (UI_V1.6.1_ARCHITECTURE §3.4 `orders`, §3.5; wireframe
 * `decOrders`). Owner: B5.
 *
 * A single pass in First Player order (L297): on your turn, complete held Orders one at a time
 * (`COMPLETE_ORDER`; the lists are re-read after each, so an Order that shared ceramics with the
 * one just completed drops out), then end the turn (`END_ORDER_TURN`, the window's alternative).
 * The completion itself is the shared model of `orderCompletion.ts`.
 *
 * The Order Phase turn is also one of the player's own turns, so a Flawed ceramic may be sold
 * in it (change 30, R20): the draft's `sell` builds `SELL_FLAWED` from `sellFlawedOptions`, and
 * choosing a sale clears the completion (one command per Confirm), and the other way round. The
 * turn opens for a player with nothing to complete but a Flawed ceramic to sell, and passes on by
 * itself once nothing is left to complete or sell (rev. 4, INT Order Phase).
 */
import { completableOrders } from "../../../game/index.ts";
import type { CeramicId, Decoration, SellFlawedOptions } from "../../../game/index.ts";
import type { Translator } from "../../i18n/translator.ts";
import { msg } from "../../i18n/translator.ts";
import { list } from "../../i18n/format.ts";
import { decorationName } from "../../i18n/content.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView, GameModel } from "../../state/model.ts";
import { ceramicWords } from "../firing/firingSupport.ts";
import { saleOf, saleOffered, saleOptions, saleSummary } from "../sale/sellFlawed.ts";
import {
  EMPTY_COMPLETION,
  buildCompletion,
  completionFromCommand,
  completionOptions,
  countedDecorations,
  reduceCompletion,
  settleCompletion,
} from "./orderCompletion.ts";
import type { CompletableSource, CompletionAction, CompletionDraft, CompletionOptions } from "./orderCompletion.ts";

export interface OrderDraft extends CompletionDraft {
  /** End the Order turn (`END_ORDER_TURN`). */
  readonly end: boolean;
  /** A Flawed ceramic to sell instead (`SELL_FLAWED`, R20), or null. */
  readonly sell: CeramicId | null;
}

export type OrderAction = CompletionAction | { readonly type: "end" } | { readonly type: "sell"; readonly ceramicId: CeramicId };

/** The completion's lists, and the Flawed ceramics the viewer may sell in this turn (R20). */
export interface OrderTurnOptions extends CompletionOptions {
  sale: SellFlawedOptions | null;
}

const COMPLETABLE: CompletableSource = (engine) => completableOrders(engine.view);

const INITIAL: OrderDraft = Object.freeze({ ...EMPTY_COMPLETION, end: false, sell: null });

function withEnd(completion: CompletionDraft, end: boolean, previous: OrderDraft): OrderDraft {
  if (completion === previous && end === previous.end && previous.sell === null) return previous;
  return { ...completion, end, sell: null };
}

/**
 * "Celadon Vase, Plain · Fine · Crackle (as Carved), …": the group in words, with the Decoration
 * each Crackle ceramic counts as when it is not its own (`countedDecorations`).
 */
export function groupWords(model: GameModel, engine: EngineView, ceramicIds: readonly CeramicId[], counted: ReadonlyMap<CeramicId, Decoration>, t: Translator): string {
  const mine = model.me?.finishedCeramicIds ?? [];
  return list(
    ceramicIds.map((ceramicId) => {
      const words = ceramicWords(model, engine, ceramicId, t, mine);
      const as = counted.get(ceramicId);
      return as === undefined ? words : t("orders.ceramicAs", { ceramic: words, decoration: decorationName(as, t.locale) });
    }),
    t.locale,
  );
}

export const orderDraft: DraftModel<OrderDraft, OrderAction, OrderTurnOptions> = {
  initial() {
    return INITIAL;
  },
  reduce(draft, action, _model, engine) {
    if (action.type === "end") return { ...EMPTY_COMPLETION, end: true, sell: null };
    if (action.type === "sell") return saleOffered(engine, action.ceramicId) ? { ...EMPTY_COMPLETION, end: false, sell: action.ceramicId } : draft;
    if (action.type === "revalidate") {
      if (draft.end) return draft;
      // A draft seeded without `sell` (tests, the gallery) is a completion draft.
      const sell = draft.sell ?? null;
      if (sell !== null) return saleOffered(engine, sell) ? draft : INITIAL;
      const settled = withEnd(settleCompletion(draft, engine, COMPLETABLE), false, draft);
      return settled.sell === undefined ? { ...settled, sell: null } : settled;
    }
    return withEnd(reduceCompletion(draft, action, engine, COMPLETABLE), false, draft);
  },
  options(draft, _model, engine) {
    return { ...completionOptions(draft, engine, COMPLETABLE), sale: saleOptions(engine) };
  },
  build(draft, _model, engine) {
    if (draft.end) return { type: "END_ORDER_TURN" };
    const sell = draft.sell ?? null;
    if (sell !== null) return saleOffered(engine, sell) ? { type: "SELL_FLAWED", ceramicId: sell } : null;
    return buildCompletion("COMPLETE_ORDER", draft, engine, COMPLETABLE);
  },
  fromCommand(command) {
    if (command.type === "END_ORDER_TURN") return { ...EMPTY_COMPLETION, end: true, sell: null };
    const sale = saleOf(command);
    if (sale !== null) return { ...EMPTY_COMPLETION, end: false, sell: sale };
    const completion = completionFromCommand("COMPLETE_ORDER", command);
    return completion === null ? null : { ...completion, end: false, sell: null };
  },
  summary(draft, model, engine) {
    if (draft.end) return msg("orders.turn.sumEnd");
    const sell = draft.sell ?? null;
    if (sell !== null) return saleSummary(model, engine, sell);
    const { orderId, ceramicIds } = draft;
    if (orderId === null) return msg("orders.turn.pick");
    if (ceramicIds === null) return msg("orders.turn.pickGroup");
    const counted = countedDecorations(draft, completionOptions(draft, engine, COMPLETABLE), engine);
    return msg("orders.turn.sum", { order: orderId, ceramics: (t) => groupWords(model, engine, ceramicIds, counted, t) });
  },
};
