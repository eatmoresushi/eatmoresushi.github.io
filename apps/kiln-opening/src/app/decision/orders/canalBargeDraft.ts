/**
 * The draft model of the Canal Barge form (UI_V1.6.1_ARCHITECTURE §3.4, §4.3; composed by B4's
 * `ActionWindow` before and after the worker action). Owner: B5.
 *
 * Canal Barge (T23, L631, R6): once per round, before or after one of your worker actions,
 * complete 1 held Order — for every completion effect. Which Orders it may complete now comes
 * from `canalBargeOptions` (empty outside your before/after-action window, or once used); the
 * completion itself is the shared model of `orderCompletion.ts`, building `USE_CANAL_BARGE`.
 *
 * The expressibility helper routes every `USE_CANAL_BARGE` here (§9.4). The form keeps its draft
 * locally (`CanalBarge.tsx`), revalidated against each new view, because the open window's draft
 * store entry belongs to the work turn (B4).
 */
import { canalBargeOptions } from "../../../game/index.ts";
import { techName } from "../../i18n/content.ts";
import { msg } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import { B5_TECHS } from "../firing/firingSupport.ts";
import {
  EMPTY_COMPLETION,
  buildCompletion,
  completionFromCommand,
  completionOptions,
  reduceCompletion,
  settleCompletion,
} from "./orderCompletion.ts";
import type { CompletableSource, CompletionAction, CompletionDraft, CompletionOptions } from "./orderCompletion.ts";
import { groupWords } from "./orderDraft.ts";

export type CanalBargeDraft = CompletionDraft;
export type CanalBargeAction = CompletionAction;

const COMPLETABLE: CompletableSource = (engine) => canalBargeOptions(engine.view);

export const canalBargeDraft: DraftModel<CanalBargeDraft, CanalBargeAction, CompletionOptions> = {
  initial() {
    return EMPTY_COMPLETION;
  },
  reduce(draft, action, _model, engine) {
    return action.type === "revalidate" ? settleCompletion(draft, engine, COMPLETABLE) : reduceCompletion(draft, action, engine, COMPLETABLE);
  },
  options(draft, _model, engine) {
    return completionOptions(draft, engine, COMPLETABLE);
  },
  build(draft, _model, engine) {
    return buildCompletion("USE_CANAL_BARGE", draft, engine, COMPLETABLE);
  },
  fromCommand(command) {
    return completionFromCommand("USE_CANAL_BARGE", command);
  },
  summary(draft, model, engine) {
    const { orderId, ceramicIds } = draft;
    if (orderId === null) return msg("orders.barge.pick");
    if (ceramicIds === null) return msg("orders.turn.pickGroup");
    return msg("orders.barge.sum", {
      order: orderId,
      tech: (t) => techName(B5_TECHS.canalBarge, t.locale),
      ceramics: (t) => groupWords(model, engine, draft, ceramicIds, t),
    });
  },
};
