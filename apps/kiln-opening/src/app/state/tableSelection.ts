/**
 * Table selection (UI_V1.6.1_ARCHITECTURE §3.5). Frozen after phase A; changes go through B6.
 *
 * Table and kiln components (B2, B3) and decision windows (B4, B5) never import each other.
 * A window spec may declare a `table` adapter; the table reads its targets from
 * `useTableSelection()` and sends clicks back through `act`, which becomes a draft action of the
 * open window. Selection is a pure function of the draft, derived synchronously (no effect), so
 * an SSR test that seeds a draft sees the targets (wireframe `draftTargets`, `data-act="place"`,
 * `data-act="dest"`).
 *
 * Owner review, 2026-10-17: workers are placed from the table only (the pane no longer lists
 * workers and locations), and the Guild Hall choice is made on the Tech display (`techChooser`;
 * `data-act="tech"` and `data-act="inspect"` targets).
 */

import type { CeramicId, GameRuleError, Glaze, KilnSpaceId, LocationId, PlacementWorkerOption, TechDiscipline, TechId } from "../../game/index.ts";
import type { DraftAction, DraftActionBase } from "./draftStore.ts";
import type { EngineView, GameModel } from "./model.ts";
import type { UiActions } from "./uiStore.ts";

export type OrderTargetState = "choosable" | "chosen" | "completable" | "blocked" | "discard";

/** One face-up Tech the Guild Hall chooser offers (buy mode). */
export interface TechTarget {
  /** The pane's draft has chosen it. */
  pressed: boolean;
  /** This worker may buy it now (`guildOptions`); otherwise it is greyed out and not selectable. */
  legal: boolean;
  /** The engine's reason when it is not legal, with the details its message needs. */
  reason: (Pick<GameRuleError, "code"> & { details: Readonly<Record<string, string | number>> }) | null;
  /** The printed cost, which every Guild Hall take pays (v1.6.2 L206–207: no discount). */
  cost: number;
}

/**
 * The Guild Hall chooser on the Tech display (owner review, 2026-10-17): with a worker chosen at
 * the Guild Hall, the face-up Techs (Apprentice: buy one) or the disciplines (Shifu: inspect one)
 * become table targets; during the Shifu's inspection (the `guild_inspection` window) the face-up
 * Techs are targets again, for the first take and the second (v1.6.2 L207). Everything comes from
 * `guildOptions` / `guildInspectionOptions` through the drafts.
 */
export interface TechChooser {
  /**
   * `buy`: the Apprentice effect buys a face-up Tech; `inspect`: the Shifu effect inspects a deck;
   * `take`: the Shifu takes a Tech after inspecting, a face-up one here (the inspected ones are
   * private and only in the pane, B2).
   */
  mode: "buy" | "inspect" | "take";
  /** The worker placed there, for the prompt's words (never a worker ID, D9). */
  worker: Pick<PlacementWorkerOption, "kind" | "seniorApprentice">;
  /** Buy and take modes: every face-up Tech, legal or not. Empty in inspect mode. */
  techs: ReadonlyMap<TechId, TechTarget>;
  /** Inspect mode: every discipline the Shifu may inspect. Empty in the other modes. */
  disciplines: ReadonlyMap<TechDiscipline, { pressed: boolean }>;
  /** Take mode: the Techs this action has taken so far (0 or 1), for the prompt; 0 otherwise. */
  taken: number;
}

export interface TableSelectionData {
  /**
   * Per location, every worker entry of the viewer's open work turn
   * (`placementOptions(view)[i].workers`, legal or not; change request CR B2-3). Table
   * components draw a Place shortcut only for `legal` entries, and show the engine's reason
   * (`error` through `ruleErrorText`) on a location none of whose entries is legal.
   */
  placeTargets: ReadonlyMap<LocationId, readonly PlacementWorkerOption[]>;
  /** The location and worker the pane's draft has chosen. */
  activePlacement: { locationId: LocationId; workerKey: string } | null;
  /** Glaze & Load destinations, Setter's Mark spaces. */
  kilnTargets: ReadonlyMap<KilnSpaceId, { pressed: boolean }>;
  /** Ceramics the draft would load, shown as pending chips where they would go. */
  pendingCeramics: readonly { ceramicId: CeramicId; glaze: Glaze; at: KilnSpaceId | "imperial" }[];
  /** Keyed by OrderId, or `slot:<i>` for a display slot. */
  orderTargets: ReadonlyMap<string, { state: OrderTargetState; disabled: boolean }>;
  /** An Order's matching group, an ability's target. */
  highlightedCeramicIds: ReadonlySet<CeramicId>;
  /** The Guild Hall chooser on the Tech display, while the pane's draft has a Guild Hall placement
   * or the viewer's Shifu takes a Tech after inspecting. */
  techChooser: TechChooser | null;
}

/** A click on a table target. */
export type TableAction =
  | { type: "place"; locationId: LocationId; workerKey: string }
  | { type: "kilnSpace"; spaceId: KilnSpaceId }
  | { type: "order"; key: string }
  /** A face-up Tech on the Tech display (the Guild Hall chooser, buy and take modes). */
  | { type: "tech"; techId: TechId }
  /** A discipline's deck on the Tech display (the Guild Hall chooser, inspect mode). */
  | { type: "inspect"; discipline: TechDiscipline };

/** A window spec's table adapter. Both members are pure. */
export interface TableAdapter<D, A extends DraftActionBase = never> {
  select(draft: D, model: GameModel, engine: EngineView): TableSelectionData;
  /** The draft action for a table click, or null to ignore it. */
  act(draft: D, action: TableAction, model: GameModel, engine: EngineView): DraftAction<D, A> | null;
}

/** What table components read: the targets, and `act` for their clicks. */
export interface TableSelection extends TableSelectionData {
  /** False when the open window has no table adapter (every target map is empty). */
  interactive: boolean;
  act(action: TableAction): void;
}

const EMPTY_MAP: ReadonlyMap<never, never> = new Map<never, never>();
const EMPTY_SET: ReadonlySet<never> = new Set<never>();

/** No targets at all: a window without an adapter, a waiting viewer, a lobby. */
export const INERT_SELECTION: TableSelectionData = Object.freeze({
  placeTargets: EMPTY_MAP,
  activePlacement: null,
  kilnTargets: EMPTY_MAP,
  pendingCeramics: Object.freeze([]),
  orderTargets: EMPTY_MAP,
  highlightedCeramicIds: EMPTY_SET,
  techChooser: null,
});

/** A selection with only the fields an adapter sets; the rest stay inert. */
export function tableSelection(partial: Partial<TableSelectionData>): TableSelectionData {
  return { ...INERT_SELECTION, ...partial };
}

/**
 * The stable key of a placement worker entry (`shifu`, `apprentice`, `apprentice-senior`):
 * never a worker ID (D9), and the same for every Apprentice, since the engine names the
 * lowest-ID available one.
 */
export function placementWorkerKey(option: Pick<PlacementWorkerOption, "kind" | "seniorApprentice">): string {
  return option.seniorApprentice ? `${option.kind}-senior` : option.kind;
}

/**
 * The Tech display's chooser prompt carries this attribute: the focus target when a worker is
 * placed at the Guild Hall (owner review, 2026-10-17).
 */
export const TECH_CHOOSER_ATTRIBUTE = "data-tech-chooser";

/**
 * After the next frame (once a phone's section switch or the draft's new targets have rendered),
 * focuses the element `find` returns, if any, so keyboard and screen-reader users land where the
 * view went. `scroll` also brings it into view (phones, where `jumpTo` only switches the section);
 * on wider screens `jumpTo` scrolls smoothly and the focus must not jump ahead of it.
 */
export function focusAfterFrame(find: () => HTMLElement | null, options: { scroll: boolean }): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const run = (): void => {
    find()?.focus({ preventScroll: !options.scroll });
  };
  if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(run);
  else window.setTimeout(run, 0);
}

/** After the next frame, focuses the Tech display's chooser prompt (`focusAfterFrame`). */
export function focusTechChooser(options: { scroll: boolean }): void {
  focusAfterFrame(() => document.querySelector<HTMLElement>(`[${TECH_CHOOSER_ATTRIBUTE}]`), options);
}

/**
 * Takes the viewer to the Guild Hall chooser in the "Recognition & Techs" section: on desktop and
 * tablet `jumpTo` scrolls there; on phones it switches to that section's tab, the decision sheet
 * collapses so the Techs are not covered, and the chooser is scrolled into view. Shared by the
 * Guild Hall's Place shortcut (table) and the pane's Guild Hall editor (decision), which never
 * import each other.
 */
export function revealTechChooser(ui: Pick<UiActions, "jumpTo" | "setSheet">, phone: boolean): void {
  if (phone) ui.setSheet("peek");
  ui.jumpTo("progress");
  focusTechChooser({ scroll: phone });
}

/** `slot:<i>` for a Main display slot in `orderTargets`. */
export function displaySlotKey(slotIndex: number): string {
  return `slot:${slotIndex}`;
}

type SelectionMemo = WeakMap<object, WeakMap<GameModel, TableSelectionData>>;
const MEMO = new WeakMap<object, SelectionMemo>();

/** The adapter's selection for a draft and model, memoised on all three (stable for React). */
export function selectTable<D, A extends DraftActionBase>(
  adapter: TableAdapter<D, A> | undefined,
  draft: D,
  model: GameModel,
  engine: EngineView,
): TableSelectionData {
  if (adapter === undefined) return INERT_SELECTION;
  if (typeof draft !== "object" || draft === null) return adapter.select(draft, model, engine);
  let perDraft = MEMO.get(adapter);
  if (perDraft === undefined) {
    perDraft = new WeakMap();
    MEMO.set(adapter, perDraft);
  }
  let perModel = perDraft.get(draft);
  if (perModel === undefined) {
    perModel = new WeakMap();
    perDraft.set(draft, perModel);
  }
  let selection = perModel.get(model);
  if (selection === undefined) {
    selection = adapter.select(draft, model, engine);
    perModel.set(model, selection);
  }
  return selection;
}
