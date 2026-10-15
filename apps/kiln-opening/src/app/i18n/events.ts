/**
 * Event text templates (UI_V1.6.1_ARCHITECTURE §5 gap 4, §8.3). Owner: B1 (shell, log, lobby).
 * Source: wireframe `evText`.
 *
 * Phase A stub created by A2 (§4.3 rule 1), with the final shapes:
 * - `EVENT_TEXT`: one template per `GameEventType` (exhaustive by type once B1 lands it). A
 *   template reads only `PublicGameEvent` fields.
 * - `OWN_EVENT_TEXT`: own-secret variants (`ORDERS_DEALT`, `ORDER_RESERVED`,
 *   `PRIVATE_LOOK_OPENED`, `LOOKED_ORDERS_DISCARDED`, `TECHS_RETURNED_TO_BOTTOM`,
 *   `TEST_PIECES_PEEKED`, `HAND_TRIMMED`), which read `LogEntry.own`.
 * - `eventText(entry, context)`: the log line for one entry, or null when no template exists yet.
 *
 * Ceramics are described with `ceramicLabel` (D9), never by ID. This is the only file of
 * `src/app` that may read the heat-calculation fields of past events (public history, §2).
 */
import type { GameEvent, GameEventType, PlayerId, PublicGameEvent } from "../../game/index.ts";
import type { LogEntry } from "../session/gameSource.ts";
import type { CeramicLabelView } from "./ceramicLabel.ts";
import type { Translator } from "./translator.ts";

export interface EventTextContext {
  t: Translator;
  /** For player names and ceramic descriptions. */
  view: CeramicLabelView;
  viewerId: PlayerId | null;
}

export type EventTemplate<T extends GameEventType = GameEventType> = (
  event: Extract<PublicGameEvent, { type: T }>,
  context: EventTextContext,
) => string;

export type OwnEventTemplate<T extends GameEventType = GameEventType> = (
  event: Extract<GameEvent, { type: T }>,
  context: EventTextContext,
) => string;

export const EVENT_TEXT: Partial<{ readonly [T in GameEventType]: EventTemplate<T> }> = {};

export const OWN_EVENT_TEXT: Partial<{ readonly [T in GameEventType]: OwnEventTemplate<T> }> = {};

/** The log line for one entry, or null while no template exists (stub). */
export function eventText(_entry: LogEntry, _context: EventTextContext): string | null {
  return null;
}
