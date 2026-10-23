/**
 * The presentation timeline (UI_V1.6.1_ARCHITECTURE §8.4). Frozen after phase A; changes go
 * through B6.
 *
 * `SessionStore` hands every new event batch to `present(batch, apply)`; `apply` publishes the
 * store's snapshot. Phase 4 ships `ImmediateTimeline`, which applies at once, so components
 * render end states only. Phase 5 swaps in an animated timeline (which jumps to the end on a
 * reconnect, `skip()`) without touching any component: elements to animate already carry
 * `data-motion` (one of `MOTION_KINDS`) and `data-motion-key` (a stable ID for FLIP).
 */
import type { EventBatch } from "../session/gameSource.ts";
import type { PresentBatch } from "../session/sessionStore.ts";

/** The `data-motion` vocabulary (§8.4). */
export const MOTION_KINDS = ["die", "contribution", "fire", "marker", "ceramic", "worker", "order-slot", "board", "kiln", "quality"] as const;

export type MotionKind = (typeof MOTION_KINDS)[number];

/** The `data-webgl-mount` points phase 6 attaches to (§8.4). */
export const WEBGL_MOUNTS = ["shared-kiln", "imperial-kiln", "firing-stage"] as const;

export type WebglMount = (typeof WEBGL_MOUNTS)[number];

export interface PresentationTimeline {
  /** Presents one batch; must call `apply` exactly once, when the end state should show. */
  present(batch: EventBatch, apply: () => void): void;
  /** Jumps to the end of anything in progress. */
  skip(): void;
}

/** Phase 4: no animation; every batch applies at once. */
export class ImmediateTimeline implements PresentationTimeline {
  present(_batch: EventBatch, apply: () => void): void {
    apply();
  }

  skip(): void {
    // Nothing is ever in progress.
  }
}

/** The `SessionStoreOptions.present` hook for a timeline. */
export function presentWith(timeline: PresentationTimeline): PresentBatch {
  return (batch, apply) => timeline.present(batch, apply);
}
