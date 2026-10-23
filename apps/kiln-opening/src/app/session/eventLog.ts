/**
 * Event-log bookkeeping for `SessionStore` (UI plan §3.2): sequence assignment, merging by
 * sequence, own-secret attachment and the incremental read cursor. Pure functions over
 * immutable arrays; a merge returns the same array when nothing changed.
 */

import type { PlayerId, PublicGameEvent, PublicGameState } from "../../game/index.ts";
import type { PrivateEventRecord, PublicEventRecord } from "../../multiplayer/types.ts";
import type { BatchOrigin, EventBatch, LogEntry } from "./gameSource.ts";

/**
 * The store numbers public events from the state's `eventSequence`: a command that brought
 * the game to `game` emitted `events`, numbered
 * `game.eventSequence − events.length + 1 … game.eventSequence`.
 */
export function firstSequenceOf(game: Pick<PublicGameState, "eventSequence">, eventCount: number): number {
  return game.eventSequence - eventCount + 1;
}

/** Log entries for one command response (`CommandSuccess`). */
export function entriesFromCommand(
  game: Pick<PublicGameState, "eventSequence" | "revision">,
  events: readonly PublicGameEvent[],
  actorId: PlayerId,
): LogEntry[] {
  const first = firstSequenceOf(game, events.length);
  return events.map((event, index) => ({ sequence: first + index, revision: game.revision, actorId, event }));
}

/**
 * Log entries for a computer batch when the authoritative records could not be read: the
 * revision is the batch's final revision and the actor is the event's own `playerId` when it
 * names one, else the batch's first actor. The next authoritative read replaces them.
 */
export function entriesFromComputerBatch(
  game: Pick<PublicGameState, "eventSequence" | "revision">,
  events: readonly PublicGameEvent[],
  actorIds: readonly PlayerId[],
): LogEntry[] {
  const first = firstSequenceOf(game, events.length);
  const fallback = actorIds[0] ?? "";
  return events.map((event, index) => {
    const named = (event as { playerId?: unknown }).playerId;
    return {
      sequence: first + index,
      revision: game.revision,
      actorId: typeof named === "string" ? named : fallback,
      event,
    };
  });
}

export function entriesFromRecords(records: readonly PublicEventRecord[]): LogEntry[] {
  return records.map((record) => ({
    sequence: record.sequence,
    revision: record.revision,
    actorId: record.actorId,
    event: record.event,
  }));
}

export interface LogMerge {
  log: readonly LogEntry[];
  /** Entries whose sequence was not in the log before, in sequence order. */
  added: readonly LogEntry[];
}

/**
 * Adds every entry whose sequence is new. With `authoritative`, an entry that is already
 * present but differs in revision or actor (a synthesized computer entry) is corrected in
 * place, without counting as added, so it is never announced twice.
 */
export function mergeLog(
  log: readonly LogEntry[],
  incoming: readonly LogEntry[],
  secrets: ReadonlyMap<number, PrivateEventRecord>,
  options: { authoritative?: boolean } = {},
): LogMerge {
  if (incoming.length === 0) return { log, added: [] };
  const bySequence = new Map<number, LogEntry>();
  for (const entry of log) bySequence.set(entry.sequence, entry);
  const added: LogEntry[] = [];
  let changed = false;
  for (const entry of incoming) {
    const existing = bySequence.get(entry.sequence);
    if (existing === undefined) {
      const withOwn = withSecret(entry, secrets);
      bySequence.set(entry.sequence, withOwn);
      added.push(withOwn);
      changed = true;
    } else if (options.authoritative === true && (existing.revision !== entry.revision || existing.actorId !== entry.actorId)) {
      bySequence.set(entry.sequence, { ...existing, revision: entry.revision, actorId: entry.actorId });
      changed = true;
    }
  }
  if (!changed) return { log, added: [] };
  const merged = [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
  added.sort((a, b) => a.sequence - b.sequence);
  return { log: merged, added };
}

/** Merges secret records by sequence; returns the same map when nothing is new. */
export function mergeSecrets(
  secrets: ReadonlyMap<number, PrivateEventRecord>,
  records: readonly PrivateEventRecord[],
): ReadonlyMap<number, PrivateEventRecord> {
  const fresh = records.filter((record) => !secrets.has(record.sequence));
  if (fresh.length === 0) return secrets;
  const next = new Map(secrets);
  for (const record of fresh) next.set(record.sequence, record);
  return next;
}

/** Attaches each secret to the log entry of the same sequence; the same array if unchanged. */
export function attachSecrets(log: readonly LogEntry[], secrets: ReadonlyMap<number, PrivateEventRecord>): readonly LogEntry[] {
  let changed = false;
  const next = log.map((entry) => {
    if (entry.own !== undefined) return entry;
    const secret = secrets.get(entry.sequence);
    if (secret === undefined) return entry;
    changed = true;
    return { ...entry, own: secret.event };
  });
  return changed ? next : log;
}

function withSecret(entry: LogEntry, secrets: ReadonlyMap<number, PrivateEventRecord>): LogEntry {
  if (entry.own !== undefined) return entry;
  const secret = secrets.get(entry.sequence);
  return secret === undefined ? entry : { ...entry, own: secret.event };
}

/**
 * The highest sequence `n` such that every sequence `1…n` is in the log. Incremental reads
 * start after it, so a gap left by an out-of-order merge is filled by the next read.
 */
export function contiguousCursor(log: readonly LogEntry[]): number {
  let cursor = 0;
  for (const entry of log) {
    if (entry.sequence === cursor + 1) cursor = entry.sequence;
    else if (entry.sequence > cursor + 1) break;
  }
  return cursor;
}

export function batchOf(added: readonly LogEntry[], origin: BatchOrigin, revision: number): EventBatch | null {
  const first = added[0];
  if (first === undefined) return null;
  return { revision, firstSequence: first.sequence, events: added.map((entry) => entry.event), origin };
}
