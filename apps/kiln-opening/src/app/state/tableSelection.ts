/**
 * Table selection (UI_V1.6.1_ARCHITECTURE §3.5). Frozen after phase A; changes go through B6.
 *
 * Table and kiln components (B2, B3) and decision windows (B4, B5) never import each other.
 * A window spec may declare a `table` adapter; the table reads its targets from
 * `useTableSelection()` and sends clicks back through `act`, which becomes a draft action of the
 * open window. Selection is a pure function of the draft, derived synchronously (no effect), so
 * an SSR test that seeds a draft sees the targets (wireframe `draftTargets`, `data-act="place"`,
 * `data-act="dest"`).
 */

import type { CeramicId, Glaze, KilnSpaceId, LocationId, PlacementWorkerOption } from "../../game/index.ts";
import type { DraftAction, DraftActionBase } from "./draftStore.ts";
import type { EngineView, GameModel } from "./model.ts";

export type OrderTargetState = "choosable" | "chosen" | "completable" | "blocked" | "discard";

export interface TableSelectionData {
  /** Legal worker entries per location: the Place shortcuts. */
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
}

/** A click on a table target. */
export type TableAction =
  | { type: "place"; locationId: LocationId; workerKey: string }
  | { type: "kilnSpace"; spaceId: KilnSpaceId }
  | { type: "order"; key: string };

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
