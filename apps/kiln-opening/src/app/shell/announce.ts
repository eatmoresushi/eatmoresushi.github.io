/**
 * Live announcements (UI_V1.6.1_ARCHITECTURE §8.3). Owner: B1 (shell, log, lobby).
 * Source: wireframe `announcement`.
 *
 * Phase A stub created by A2 (§4.3 rule 1), with the final shape: announcements are stored as
 * `RichMessage`s and formatted when rendered, so a language switch re-renders them (§6.1).
 * B1 fills in:
 * - each `lastBatch` of any origin, summarised through the event templates;
 * - becoming an actor ("Your turn: place a worker. 3 workers left."), always last;
 * - someone else's private look ("Zhao is looking at 3 Orders");
 * coalesced into one summary per revision gap, at least `ANNOUNCE_INTERVAL_MS` apart.
 */
import type { EventBatch } from "../session/gameSource.ts";
import type { GameModel } from "../state/model.ts";
import type { RichMessage } from "../i18n/translator.ts";

export const ANNOUNCE_INTERVAL_MS = 1_500;

export interface Announcement {
  /** Polite messages, in order; "your turn" last. */
  polite: readonly RichMessage[];
  /** An error or a ConnectionBanner alert. */
  alert: RichMessage | null;
}

/** What to announce after a revision, or null for nothing (stub). */
export function announcementFor(_model: GameModel, _batch: EventBatch | null, _previous: GameModel | null): Announcement | null {
  return null;
}
