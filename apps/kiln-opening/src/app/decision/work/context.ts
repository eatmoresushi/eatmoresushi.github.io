/**
 * Shared plumbing of B4's draft models (UI_V1.6.1_ARCHITECTURE §3.4–§3.5). Owner: B4.
 *
 * - `viewMemo`: selector results memoised on the identity of the raw `PlayerView` and a key, so
 *   `options()`, `reduce(revalidate)` and `build()` of one view share every probe (the
 *   expressibility test calls them thousands of times per view, §9.4). Every store merge makes
 *   a new view object, so a cached value is never stale.
 * - `workContext`: the actor, its seat and its own summary, or null for a spectator.
 * - `placements`: `placementOptions(view)`, which probes `validateAction` per location and
 *   worker, computed once per view (§3.3).
 * - `sameDraft`: a structural comparison, so `revalidate` hands back the very same draft when
 *   nothing changed (the draft store and the expressibility check both rely on it).
 *
 * Nothing here decides a rule: legality, prices and lists come from engine selectors.
 */
import { isDeepStrictEqualLike } from "./deepEqual.ts";
import { placementOptions } from "../../../game/index.ts";
import type { ActorView, LocationId, PlacementOption, PlacementWorkerOption, PlayerId, PlayerSummary, PlayerView } from "../../../game/index.ts";
import { placementWorkerKey } from "../../state/tableSelection.ts";
import type { EngineView, GameModel } from "../../state/model.ts";

const MEMO = new WeakMap<object, Map<string, unknown>>();

/** A value computed once per view object and key. */
export function viewMemo<T>(view: PlayerView, key: string, compute: () => T): T {
  let entries = MEMO.get(view);
  if (entries === undefined) {
    entries = new Map();
    MEMO.set(view, entries);
  }
  if (entries.has(key)) return entries.get(key) as T;
  const value = compute();
  entries.set(key, value);
  return value;
}

/** The deciding seat: its actor view and summary. */
export interface WorkContext {
  model: GameModel;
  engine: EngineView;
  view: PlayerView;
  actor: ActorView;
  playerId: PlayerId;
  me: PlayerSummary;
}

/** The context of a seated viewer, or null for a spectator. */
export function workContext(model: GameModel, engine: EngineView): WorkContext | null {
  const actor = engine.actor;
  const me = model.me;
  if (actor === null || me === null) return null;
  return { model, engine, view: engine.view, actor, playerId: actor.viewerId, me };
}

/** `placementOptions(view)`, once per view. */
export function placements(view: PlayerView): readonly PlacementOption[] {
  return viewMemo(view, "placementOptions", () => placementOptions(view));
}

/** One location's placement option. */
export function placementOf(view: PlayerView, locationId: LocationId): PlacementOption | null {
  return placements(view).find((option) => option.locationId === locationId) ?? null;
}

/** The worker entry of a location for a worker key (`shifu`, `apprentice`, `apprentice-senior`). */
export function workerEntry(placement: PlacementOption | null, workerKey: string | null): PlacementWorkerOption | null {
  if (placement === null || workerKey === null) return null;
  return placement.workers.find((worker) => placementWorkerKey(worker) === workerKey) ?? null;
}

/** True when the two drafts hold the same values. */
export function sameDraft(a: unknown, b: unknown): boolean {
  return isDeepStrictEqualLike(a, b);
}

/** `next` when it differs from `draft`, else `draft` itself (stable identity for the store). */
export function keepIfSame<D>(draft: D, next: D): D {
  return sameDraft(draft, next) ? draft : next;
}

/** A stable string key for memoising a JSON-able value. */
export function keyOf(value: unknown): string {
  return JSON.stringify(value) ?? "undefined";
}
