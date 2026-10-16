/**
 * The location sub-editor contract (UI_V1.6.1_ARCHITECTURE §3.4 "Work sub-editors", §3.5). Owner:
 * B4.
 *
 * Each location of the work window is a sub-draft model plus a thin component, ported from the
 * matching branch of the wireframe's `subEditor`. The work draft (`workDraft.ts`) keeps one
 * sub-draft per location (`perLocation`), so arrowing through the location radios never loses a
 * sub-editor's choices, and calls the active location's model with a `PlacementContext`: the
 * actor, the location's `placementOptions` entry and the chosen worker entry.
 *
 * - `blank()` is context-free (no choice made). `prepare()` runs when the location becomes the
 *   active one and may fill a choice that has exactly one option.
 * - `reduce(…, revalidate)` drops any choice `options()` no longer offers and returns the same
 *   draft object when nothing changed.
 * - `build()` returns the `PLACE_*` command, or null while the draft is incomplete.
 * - `fromCommand()` is the expressibility inverse (§9.4).
 * - `detail()` is the summary's tail ("— 2 Clay, 2 Wood"), or null.
 *
 * Components get `{ draft, options, dispatch, context }` from `WorkTurn`; they render only from
 * `options`.
 */
import type { AuthoritativeCommand, LocationId, PlacementOption, PlacementWorkerOption } from "../../../../game/index.ts";
import type { MessageParam } from "../../../i18n/translator.ts";
import type { RevalidateAction } from "../../../state/draftStore.ts";
import type { WorkContext } from "../context.ts";

export interface PlacementContext extends WorkContext {
  placement: PlacementOption;
  /** The chosen, legal worker entry of this location. */
  worker: PlacementWorkerOption;
}

/** The `PLACE_*` command of one location. */
export type PlacementCommandOf<L extends LocationId> = Extract<AuthoritativeCommand, { type: PlacementTypeOf<L> }>;

export type PlacementTypeOf<L extends LocationId> = {
  materials_yard: "PLACE_MATERIALS_YARD";
  form_decorate: "PLACE_FORM_DECORATE";
  glaze_load: "PLACE_GLAZE_LOAD";
  commission_market: "PLACE_COMMISSION_MARKET";
  guild_hall: "PLACE_GUILD_HALL";
  canal_wharf: "PLACE_CANAL_WHARF";
  magistrates_hall: "PLACE_MAGISTRATES_HALL";
}[L];

export const PLACEMENT_TYPES: { readonly [L in LocationId]: PlacementTypeOf<L> } = {
  materials_yard: "PLACE_MATERIALS_YARD",
  form_decorate: "PLACE_FORM_DECORATE",
  glaze_load: "PLACE_GLAZE_LOAD",
  commission_market: "PLACE_COMMISSION_MARKET",
  guild_hall: "PLACE_GUILD_HALL",
  canal_wharf: "PLACE_CANAL_WHARF",
  magistrates_hall: "PLACE_MAGISTRATES_HALL",
};

/** The location a placement command names, or null for any other command. */
export function placementLocationOf(command: AuthoritativeCommand): LocationId | null {
  for (const [locationId, type] of Object.entries(PLACEMENT_TYPES) as Array<[LocationId, string]>) {
    if (command.type === type) return locationId;
  }
  return null;
}

export interface LocationDraftModel<L extends LocationId, D, A extends { readonly type: string }, O> {
  readonly locationId: L;
  blank(): D;
  prepare(draft: D, context: PlacementContext): D;
  reduce(draft: D, action: A | RevalidateAction, context: PlacementContext): D;
  options(draft: D, context: PlacementContext): O;
  build(draft: D, context: PlacementContext): PlacementCommandOf<L> | null;
  fromCommand(command: PlacementCommandOf<L>, context: PlacementContext): D | null;
  /** The summary's tail, or null when there is nothing to add. */
  detail(draft: D, context: PlacementContext): MessageParam | null;
}

/** Props of every location sub-editor component. */
export interface LocationEditorProps<D, A, O> {
  draft: D;
  options: O;
  dispatch: (action: A) => void;
  context: PlacementContext;
}
