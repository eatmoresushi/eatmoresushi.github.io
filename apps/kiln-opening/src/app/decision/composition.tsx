/**
 * Composition seams between decision packages (UI_V1.6.1_ARCHITECTURE §4.3 rule 3). Owner: B6;
 * frozen contract (change requests CR B4-2, CR B5-2).
 *
 * **Canal Barge inside the work window.** The work window's draft store entry belongs to the
 * work turn, and Confirm sends one command built by the window's draft model (§3.5, §3.6). So
 * B4's work draft (`work/workDraft.ts`) keeps Canal Barge's draft as its `canalBarge` sub-draft,
 * reduced, revalidated, built, summarised and `fromCommand`-ed through B5's `canalBargeDraft`,
 * and B4's `ActionWindow` renders B5's `CanalBarge` form inside `CanalBargeFormProvider`:
 * - inside the provider, the form edits the composed sub-draft, shows no button of its own, and
 *   names its inputs after the command's fields (`orderId`, `ceramicIds`, …);
 * - outside it (`useComposedCanalBarge()` returns null: the gallery, any other host), the form
 *   keeps a local draft and sends `USE_CANAL_BARGE` from its own button.
 *
 * The types come from B5's draft model only, so neither package depends on the other's
 * internals; the expressibility helper may route `USE_CANAL_BARGE` to `canalBargeDraft` or to the
 * work window (both are checked).
 */
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { CanalBargeAction, CanalBargeDraft } from "./orders/canalBargeDraft.ts";
import type { CompletionOptions } from "./orders/orderCompletion.ts";

export interface ComposedCanalBarge {
  /** Which window composes the form. */
  source: "before_action" | "after_action";
  /** The work draft's `canalBarge` sub-draft. */
  draft: CanalBargeDraft;
  /** `canalBargeDraft.options(draft)`, already computed by the work draft; null: the form computes it. */
  options: CompletionOptions | null;
  /** Applies one of `canalBargeDraft`'s actions to the sub-draft. */
  dispatch: (action: CanalBargeAction) => void;
}

const CanalBargeFormContext = createContext<ComposedCanalBarge | null>(null);

export function CanalBargeFormProvider({ value, children }: { value: ComposedCanalBarge; children?: ReactNode }) {
  return <CanalBargeFormContext.Provider value={value}>{children}</CanalBargeFormContext.Provider>;
}

/** The composed Canal Barge sub-draft, or null outside the work window. */
export function useComposedCanalBarge(): ComposedCanalBarge | null {
  return useContext(CanalBargeFormContext);
}
