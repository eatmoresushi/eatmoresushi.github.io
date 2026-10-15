/**
 * Thin wrappers over the engine's hidden-information boundary (`src/game/view.ts`, DESIGN
 * §4.3). Secrets are structurally separate in V1.6.1 — `GameState.hidden`,
 * `PrivateFiringState` and each event's `secret` — so nothing here redacts field by field.
 */

import { projectEvent, projectPublicState } from "../game/index.ts";
import type { GameEvent, GameState, PlayerId } from "../game/index.ts";
import type { PrivateEventRecord, PublicGameEvent, PublicGameState } from "./types.ts";

/** Throws unless the state is a V1.6.1 schema-6 game: older saves are never projected. */
export function assertCurrentGameState(state: GameState): void {
  if (state.schemaVersion !== 6 || state.rulesVersion !== "1.6.1") {
    throw new Error("Only schema-6 V1.6.1 games may be projected by the current service");
  }
}

/** The public projection: the state without `hidden`, plus public counts. */
export function projectPublicGameState(state: GameState): PublicGameState {
  assertCurrentGameState(state);
  return projectPublicState(state);
}

/** Every event with its `secret` removed, in order. */
export function projectPublicEvents(events: readonly GameEvent[]): PublicGameEvent[] {
  return events.map(projectEvent);
}

/** The `visibleTo` seat of an event's secret, or null for a fully public event. */
export function secretRecipient(event: GameEvent): PlayerId | null {
  const secret = (event as { secret?: { visibleTo?: unknown } }).secret;
  return secret !== undefined && typeof secret.visibleTo === "string" ? secret.visibleTo : null;
}

export interface EventLocation {
  roomId: string;
  commandId: string;
  actorId: PlayerId;
  revision: number;
  /** `GameState.eventSequence` before these events: the first event is `sequence + 1`. */
  previousEventSequence: number;
}

/**
 * The events of one command that carry a secret for `viewerId`, as private log records.
 * Sequence numbers match the stored event rows, because every emitted event is persisted
 * (DESIGN §4.6: `event_sequence` equals the persisted event count).
 */
export function ownSecretRecords(
  events: readonly GameEvent[],
  viewerId: PlayerId,
  location: EventLocation,
): PrivateEventRecord[] {
  const records: PrivateEventRecord[] = [];
  events.forEach((event, index) => {
    if (secretRecipient(event) !== viewerId) {
      return;
    }
    records.push({
      roomId: location.roomId,
      sequence: location.previousEventSequence + index + 1,
      revision: location.revision,
      commandId: location.commandId,
      actorId: location.actorId,
      event: structuredClone(event),
    });
  });
  return records;
}
