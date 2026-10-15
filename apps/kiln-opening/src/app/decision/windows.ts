/**
 * The window registry (UI_V1.6.1_ARCHITECTURE §3.4, §3.5). Frozen after phase A; changes go
 * through B6.
 *
 * It only merges the two slices, so it never changes in phase B:
 * - `decision/work/windows.work.ts` (B4): Kiln selection, Setter's Mark, the work turn (before
 *   and after the worker action), the Commission Market steps, the Guild Hall inspection and
 *   Colour Samples;
 * - `decision/windows.firing.ts` (B5): Contributions, Test Pieces, Heat markers, Jun, after-Quality,
 *   Salvage, the Order Phase, the hand trim, the final summary and waiting.
 *
 * The registry is injected into `GameProvider` (`state/hooks.ts`), so `state/**` never imports
 * `decision/**`. The type below fails `typecheck` if a kind is missing or covered twice.
 */
import type { DecisionWindowKind } from "../state/decisionWindow.ts";
import type { WindowRegistry } from "../state/draftStore.ts";
import { FIRING_WINDOWS } from "./windows.firing.ts";
import type { FiringWindowKind } from "./windows.firing.ts";
import { WORK_WINDOWS } from "./work/windows.work.ts";
import type { WorkWindowKind } from "./work/windows.work.ts";

export type { AnyWindowSpec, DraftModel, WindowSpec, WindowSpecFor, WindowText } from "../state/draftStore.ts";

/** Compile-time checks: the slices are disjoint and cover every kind. */
type Overlap = WorkWindowKind & FiringWindowKind;
type Missing = Exclude<DecisionWindowKind, WorkWindowKind | FiringWindowKind>;
const SLICES_ARE_DISJOINT: [Overlap] extends [never] ? true : never = true;
const SLICES_COVER_EVERY_KIND: [Missing] extends [never] ? true : never = true;
void SLICES_ARE_DISJOINT;
void SLICES_COVER_EVERY_KIND;

export const WINDOWS: WindowRegistry = { ...WORK_WINDOWS, ...FIRING_WINDOWS };
