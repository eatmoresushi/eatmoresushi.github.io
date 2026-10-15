/**
 * Draft models, window specs and the draft store (UI_V1.6.1_ARCHITECTURE §3.5, K5). Frozen
 * after phase A; changes go through B6.
 *
 * **Draft models.** Every decision window is a pure draft model plus a thin component. The
 * model is unit-tested in node; the component renders only from `options()` and never filters,
 * sums or checks a choice itself.
 *
 * **The draft store** holds the open window's draft outside React, keyed by the window's
 * draft key (`windowDraftKey`: kind and open key):
 * - **reset to `initial`** when the key changes (a new window, a new queue position, a new
 *   turn…) and when this client's own command succeeds (`reset()`);
 * - **kept and revalidated** otherwise: after other players' commits, reconnects and
 *   `STALE_REVISION` recovery the stored draft is passed through
 *   `reduce(draft, { type: "revalidate" })` against the new model, which drops any choice the
 *   new options no longer offer. A half-made Contribution or trim survives another player's
 *   submission.
 *
 * The effective draft is derived synchronously (no effect), so SSR renders a seeded draft and
 * its table targets. Derivations are memoised on (key, stored draft, model), so
 * `useSyncExternalStore` sees stable values.
 */

import type { ComponentType } from "react";
import type { AuthoritativeCommand } from "../../game/index.ts";
import type { Deferred, RichMessage } from "../i18n/translator.ts";
import type { DecisionWindowKind } from "./decisionWindow.ts";
import type { EngineView, GameModel } from "./model.ts";
import type { TableAdapter } from "./tableSelection.ts";

/** A window-specific draft action. Each draft model names its own (`{ type: "pickKiln"; … }`). */
export interface DraftActionBase {
  readonly type: string;
}

/** Sent by the store, never by a component: re-check the draft against a new model. */
export interface RevalidateAction {
  readonly type: "revalidate";
}

export const REVALIDATE: RevalidateAction = Object.freeze({ type: "revalidate" });

/**
 * What a component dispatches: one of the model's own actions, or `set` (replace the whole
 * draft; the store revalidates it, so a `set` can never smuggle in an unoffered choice).
 */
export type DraftAction<D, A extends DraftActionBase = never> = { readonly type: "set"; readonly draft: D } | A;

/**
 * A window's draft model (§3.5). `O` is whatever the form renders (every list, with reasons).
 * All members are methods, so a registry can hold models of different draft types.
 */
export interface DraftModel<D, A extends DraftActionBase = never, O = unknown> {
  /** No choice is pre-selected unless only one exists. */
  initial(model: GameModel, engine: EngineView): D;
  /** `revalidate` drops any choice `options()` no longer offers. */
  reduce(draft: D, action: A | RevalidateAction, model: GameModel, engine: EngineView): D;
  /** Every list the form renders, with reasons. The component renders only from these. */
  options(draft: D, model: GameModel, engine: EngineView): O;
  /** The command, or null while the draft is incomplete. */
  build(draft: D, model: GameModel, engine: EngineView): AuthoritativeCommand | null;
  /** The draft that builds this command, or null if the form cannot express it (§9.4). */
  fromCommand(command: AuthoritativeCommand, model: GameModel, engine: EngineView): D | null;
  /** The ConfirmBar sentence (`workSummary`, `completeSum`, …), formatted with `t.rich`. */
  summary(draft: D, model: GameModel, engine: EngineView): RichMessage | null;
  /** Set only by `stubDraft()`: the expressibility helper reports this window as `todo`. */
  readonly stub?: true;
}

/** Text a window spec provides (formatted at render time, so it follows the language). */
export type WindowText = RichMessage | Deferred;

/** The ConfirmBar's alternative button: End turn, End, Decline… (`data-action="alt"`). */
export interface WindowAlternative {
  label: WindowText;
  command: AuthoritativeCommand;
}

/**
 * One registry entry of `decision/windows.ts` (§3.5). The slices `decision/work/windows.work.ts`
 * (B4) and `decision/windows.firing.ts` (B5) provide them; `windows.ts` only merges the slices.
 */
export interface WindowSpec<D = unknown, A extends DraftActionBase = never, O = unknown> {
  kind: DecisionWindowKind;
  /** The form fields; reads `useDraft()` / `useEngineView()`. Rendered inside `.pane-scroll`. */
  Component: ComponentType;
  draft: DraftModel<D, A, O>;
  /** The pane heading and the phone sheet strip ("Place a worker"). */
  title(model: GameModel, engine: EngineView): WindowText;
  /** The alternative to Confirm, if this window has one now; else ConfirmBar offers Clear. */
  alternative?(draft: D, model: GameModel, engine: EngineView): WindowAlternative | null;
  /** Table targets driven by the draft (Place shortcuts, kiln spaces, Order cards). */
  table?: TableAdapter<D, A>;
}

/** A spec with its draft type erased, as the registry holds it. */
export type AnyWindowSpec = WindowSpec<unknown, DraftActionBase, unknown>;

/** The registry entry of one kind. */
export type WindowSpecFor<K extends DecisionWindowKind> = AnyWindowSpec & { readonly kind: K };

/** Every window kind's spec. */
export type WindowRegistry = { readonly [K in DecisionWindowKind]: WindowSpecFor<K> };

/**
 * Checks a spec against its own draft model (component, alternative and table adapter agree on
 * `D` and `A`) and returns it as a registry entry.
 */
export function defineWindow<K extends DecisionWindowKind, D, A extends DraftActionBase = never, O = unknown>(
  spec: WindowSpec<D, A, O> & { readonly kind: K },
): WindowSpecFor<K> {
  return spec as unknown as WindowSpecFor<K>;
}

/** The draft of a stub window: nothing to choose yet. */
export interface StubDraft {
  readonly stub: true;
}

const STUB_DRAFT: StubDraft = Object.freeze({ stub: true });

/**
 * A phase A placeholder draft model (§4.3 rule 1): it builds nothing, and `fromCommand`
 * returns null, so the expressibility helper reports the window as `todo` until its owner lands
 * the real model.
 */
export function stubDraft(): DraftModel<StubDraft, never, null> & { readonly stub: true } {
  return {
    stub: true,
    initial: () => STUB_DRAFT,
    reduce: (draft) => draft,
    options: () => null,
    build: () => null,
    fromCommand: () => null,
    summary: () => null,
  };
}

/** The empty draft of a window that never sends a command (`final`, `waiting`). */
export interface NoDraft {
  readonly none: true;
}

const NO_DRAFT_VALUE: NoDraft = Object.freeze({ none: true });

export function noDraft(): DraftModel<NoDraft, never, null> {
  return {
    initial: () => NO_DRAFT_VALUE,
    reduce: (draft) => draft,
    options: () => null,
    build: () => null,
    fromCommand: () => null,
    summary: () => null,
  };
}

interface StoredDraft {
  key: string;
  draft: unknown;
  /** The model the draft was last reduced against; another model means revalidate. */
  basis: GameModel | null;
}

const INITIAL = Symbol("initial");

/** The open window's draft, outside React (§3.5). */
export class DraftStore {
  private entry: StoredDraft | null = null;
  private memo: { key: string; source: unknown; model: GameModel; value: unknown } | null = null;
  private version = 0;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Changes whenever the stored draft changes (the `useSyncExternalStore` snapshot). */
  getVersion = (): number => this.version;

  /** The effective draft of window `key` for this model: stored, revalidated, or initial. */
  read<D, A extends DraftActionBase, O>(key: string, spec: DraftModel<D, A, O>, model: GameModel, engine: EngineView): D {
    const entry = this.entry !== null && this.entry.key === key ? this.entry : null;
    if (entry !== null && entry.basis === model) return entry.draft as D;
    const source = entry === null ? INITIAL : entry.draft;
    const memo = this.memo;
    if (memo !== null && memo.key === key && memo.source === source && memo.model === model) return memo.value as D;
    const value = entry === null ? spec.initial(model, engine) : spec.reduce(entry.draft as D, REVALIDATE, model, engine);
    this.memo = { key, source, model, value };
    return value;
  }

  /** Applies a component's action to the effective draft and stores the result. */
  dispatch<D, A extends DraftActionBase, O>(
    key: string,
    spec: DraftModel<D, A, O>,
    model: GameModel,
    engine: EngineView,
    action: DraftAction<D, A>,
  ): D {
    const current = this.read(key, spec, model, engine);
    const next = isSet(action) ? spec.reduce(action.draft, REVALIDATE, model, engine) : spec.reduce(current, action, model, engine);
    this.store({ key, draft: next, basis: model });
    return next;
  }

  /**
   * Seeds window `key` with a draft (tests, the gallery). It is revalidated against the first
   * model it is read with.
   */
  seed(key: string, draft: unknown): void {
    this.store({ key, draft, basis: null });
  }

  /** Back to `initial` (this client's own command succeeded). */
  reset(): void {
    if (this.entry === null) return;
    this.store(null);
  }

  /** The stored key, if any (tests). */
  storedKey(): string | null {
    return this.entry?.key ?? null;
  }

  private store(entry: StoredDraft | null): void {
    this.entry = entry;
    this.memo = null;
    this.version += 1;
    for (const listener of [...this.listeners]) listener();
  }
}

function isSet<D, A extends DraftActionBase>(action: DraftAction<D, A>): action is { readonly type: "set"; readonly draft: D } {
  return action.type === "set" && "draft" in action;
}
