/**
 * The draft model of the Order Phase turn (UI_V1.6.1_ARCHITECTURE §3.4 `orders`, §3.5; wireframe
 * `decOrders`). Owner: B5.
 *
 * A single pass in First Player order (L297): on your turn, complete held Orders one at a time
 * (`COMPLETE_ORDER`; the lists are re-read after each, so an Order that shared ceramics with the
 * one just completed drops out), then end the turn (`END_ORDER_TURN`, the window's alternative).
 * The completion itself is the shared model of `orderCompletion.ts`.
 */
import { completableOrders } from "../../../game/index.ts";
import type { CeramicId, Decoration } from "../../../game/index.ts";
import type { Translator } from "../../i18n/translator.ts";
import { msg } from "../../i18n/translator.ts";
import { list } from "../../i18n/format.ts";
import { decorationName } from "../../i18n/content.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView, GameModel } from "../../state/model.ts";
import { ceramicWords } from "../firing/firingSupport.ts";
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
}

export type OrderAction = CompletionAction | { readonly type: "end" };

const COMPLETABLE: CompletableSource = (engine) => completableOrders(engine.view);

const INITIAL: OrderDraft = Object.freeze({ ...EMPTY_COMPLETION, end: false });

function withEnd(completion: CompletionDraft, end: boolean, previous: OrderDraft): OrderDraft {
  if (completion === previous && end === previous.end) return previous;
  return { ...completion, end };
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

export const orderDraft: DraftModel<OrderDraft, OrderAction, CompletionOptions> = {
  initial() {
    return INITIAL;
  },
  reduce(draft, action, _model, engine) {
    if (action.type === "end") return { ...EMPTY_COMPLETION, end: true };
    if (action.type === "revalidate") {
      if (draft.end) return draft;
      return withEnd(settleCompletion(draft, engine, COMPLETABLE), false, draft);
    }
    return withEnd(reduceCompletion(draft, action, engine, COMPLETABLE), false, draft);
  },
  options(draft, _model, engine) {
    return completionOptions(draft, engine, COMPLETABLE);
  },
  build(draft, _model, engine) {
    if (draft.end) return { type: "END_ORDER_TURN" };
    return buildCompletion("COMPLETE_ORDER", draft, engine, COMPLETABLE);
  },
  fromCommand(command) {
    if (command.type === "END_ORDER_TURN") return { ...EMPTY_COMPLETION, end: true };
    const completion = completionFromCommand("COMPLETE_ORDER", command);
    return completion === null ? null : { ...completion, end: false };
  },
  summary(draft, model, engine) {
    if (draft.end) return msg("orders.turn.sumEnd");
    const { orderId, ceramicIds } = draft;
    if (orderId === null) return msg("orders.turn.pick");
    if (ceramicIds === null) return msg("orders.turn.pickGroup");
    const counted = countedDecorations(draft, completionOptions(draft, engine, COMPLETABLE), engine);
    return msg("orders.turn.sum", { order: orderId, ceramics: (t) => groupWords(model, engine, ceramicIds, counted, t) });
  },
};
