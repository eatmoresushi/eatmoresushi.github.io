/**
 * Turn toasts: what the other players did on their last turn (owner review, 2026-10-17).
 * Owner: B1 (shell, log, lobby).
 *
 * Pure: it reads the game log (`useLog().log`) and groups the entries that arrived since the
 * screen mounted into turns, one per other player's turn. `TurnToasts.tsx` shows each player's
 * turns in their toast, each turn a group of lines in the event templates' words
 * (`publicEventText`, the game log's own lines).
 *
 * - **History is not news.** The log present when the screen mounts (a reload, a reconnect that
 *   fills the log later) is skipped: only entries newer than the mount's revision count.
 * - **Only other players' moves.** An entry the viewer's own command produced is never shown, and
 *   it ends the turn being collected. A line is shown only when its event names the player whose
 *   command produced it (`playerId === actorId`), or is a Quality change their own ability made
 *   (`QUALITY_IMPROVED`, a Second Firing `QUALITY_ASSIGNED`). Table events (refills, the Kiln Die,
 *   Fire, Contribution reveals) and turn markers are left out.
 * - **Grouped per turn.** Consecutive entries of one actor form one turn. A Work or Order turn
 *   ends at its `*_TURN_ENDED`, and a turn start always opens a new one. A turn may span several
 *   commands (and so several updates): the tracker keeps the open turn, and the next update adds
 *   to it under the same key.
 * - **Public only.** A turn holds log entries; the toast formats their public event, never the
 *   entry's own-secret variant, so a private look or a hand never shows.
 *
 * `toastReducer` is the stack itself: one toast per other player, each closing `TOAST_MS` after it
 * last changed, all paused while hovered or focused. A toast holds every turn of that player that
 * one update brought, oldest first, each turn its own group of lines: a computer batch (or a
 * reconnect) can bring a player's Order turn and their next Work turn at once, and neither is
 * dropped (newest `MAX_TOAST_TURNS`, the rest counted). A later update that brings that player a
 * new turn replaces their toast.
 */
import type { GameEventType, PlayerId } from "../../game/index.ts";
import { repeatsPreviousEntry } from "../i18n/events.ts";
import type { LogEntry } from "../session/gameSource.ts";

/** A toast closes this long after it appears (or after it last changed). */
export const TOAST_MS = 3_000;

/** At most this many lines per turn; the rest are counted ("and 2 more lines in the game log"). */
export const MAX_TOAST_LINES = 4;

/**
 * At most this many turns per toast, the newest; the earlier ones are counted ("and 2 earlier
 * turns in the game log"). A computer batch holds no more than this for one player; a reconnect
 * after a long absence may.
 */
export const MAX_TOAST_TURNS = 3;

/** Player actions a toast states, when their event names the acting player. */
export const TOAST_EVENTS: ReadonlySet<GameEventType> = new Set<GameEventType>([
  "KILN_SELECTED",
  "SETTERS_MARK_PLACED",
  "WORKER_PLACED",
  "RESOURCES_CHANGED",
  "CERAMIC_FORMED",
  "CERAMIC_RESHAPED",
  "CERAMIC_LOADED",
  "KILN_FURNITURE_PLACED",
  "HEAT_MARKER_PLACED",
  "ORDER_RESERVED",
  "PRIVATE_LOOK_OPENED",
  "LOOKED_ORDERS_DISCARDED",
  "TECH_ACQUIRED",
  "TECHS_RETURNED_TO_BOTTOM",
  "PERSONAL_SPACE_UNLOCKED",
  "TECH_USED",
  "KILN_ABILITY_USED",
  "IMPERIAL_PRIORITY_USED",
  "RECOGNITION_ADVANCED",
  "CROWN_OVERFLOW_VP",
  "IMPERIAL_GRANT_RECEIVED",
  "IMPERIAL_KILN_GAINED",
  "IMPERIAL_PRIORITY_GAINED",
  "IMPERIAL_AUDIENCE_GAINED",
  "CONTRIBUTION_SUBMITTED",
  "TEST_PIECES_PEEKED",
  "TEST_PIECES_USED",
  "HEAT_MARKER_TURNED",
  "HEAT_MARKER_RETURNED",
  "KILN_MASTER_PLACED",
  "JUN_ADJUSTED",
  "SECOND_FIRING_REVEALED",
  "CRACKLE_APPLIED",
  "CERAMIC_SALVAGED",
  "ORDER_COMPLETED",
  "ORDER_TURN_ENDED",
  "HAND_TRIMMED",
]);

/** Turn markers: a start always opens a new turn; an end closes the actor's turn. */
const TURN_STARTS: ReadonlySet<GameEventType> = new Set<GameEventType>(["WORK_TURN_STARTED", "ORDER_TURN_STARTED"]);
const TURN_ENDS: ReadonlySet<GameEventType> = new Set<GameEventType>(["WORK_TURN_ENDED", "ORDER_TURN_ENDED"]);

/** One other player's turn (so far): its key is the sequence of its first shown entry. */
export interface Turn {
  key: number;
  playerId: PlayerId;
  entries: readonly LogEntry[];
}

export interface TurnTracker {
  /** The last log sequence looked at. */
  lastSequence: number;
  /** Entries at or below this revision are history (the log when the screen mounted). */
  sinceRevision: number;
  /** The turn still being collected, or null once it ended. */
  open: Turn | null;
}

function playerOf(entry: LogEntry): PlayerId | null {
  const value = (entry.event as { playerId?: unknown }).playerId;
  return typeof value === "string" ? value : null;
}

/** Whether an entry of `entry.actorId`'s command is a line of their toast. */
export function isToastLine(entry: LogEntry, previous: LogEntry | undefined): boolean {
  const event = entry.event;
  if (repeatsPreviousEntry(entry, previous)) return false;
  if (event.type === "QUALITY_IMPROVED") return true;
  if (event.type === "QUALITY_ASSIGNED") return event.cause === "second_firing";
  return TOAST_EVENTS.has(event.type) && playerOf(entry) === entry.actorId;
}

/** A tracker that treats everything in `log` (and anything up to `revision`) as history. */
export function startTurnTracker(log: readonly LogEntry[], revision: number): TurnTracker {
  const last = log.length === 0 ? -1 : (log[log.length - 1]?.sequence ?? -1);
  return { lastSequence: last, sinceRevision: revision, open: null };
}

/**
 * The turns that changed since the tracker last looked, oldest first: each new turn, and the
 * open turn again (same key, more entries) when it grew. Entries of the viewer's own commands
 * (and every entry for a spectator, `viewerId` null, is someone else's) are never in a turn.
 */
export function advanceTurns(tracker: TurnTracker, log: readonly LogEntry[], viewerId: PlayerId | null): { tracker: TurnTracker; turns: readonly Turn[] } {
  let open: Turn | null = tracker.open;
  let lastSequence = tracker.lastSequence;
  const changed = new Map<number, Turn>();
  for (let index = 0; index < log.length; index += 1) {
    const entry = log[index]!;
    if (entry.sequence <= lastSequence) continue;
    lastSequence = entry.sequence;
    if (entry.revision <= tracker.sinceRevision) continue;
    const actor = entry.actorId;
    if (actor === viewerId || TURN_STARTS.has(entry.event.type)) {
      open = null;
      continue;
    }
    if (open !== null && open.playerId !== actor) open = null;
    if (isToastLine(entry, log[index - 1])) {
      const turn: Turn = open === null ? { key: entry.sequence, playerId: actor, entries: [entry] } : { ...open, entries: [...open.entries, entry] };
      open = turn;
      changed.set(turn.key, turn);
    }
    if (TURN_ENDS.has(entry.event.type) && playerOf(entry) === actor) open = null;
  }
  return { tracker: { lastSequence, sinceRevision: tracker.sinceRevision, open }, turns: [...changed.values()] };
}

/**
 * The lines a toast shows: every line when they fit, else the first `max − 1` and the count of
 * the rest (`more`), which the game log holds.
 */
export function toastLines<T>(lines: readonly T[], max: number = MAX_TOAST_LINES): { shown: readonly T[]; more: number } {
  if (lines.length <= max) return { shown: lines, more: 0 };
  const shown = lines.slice(0, Math.max(1, max - 1));
  return { shown, more: lines.length - shown.length };
}

/**
 * The turns a toast shows: every turn when they fit, else the newest `max` and the count of the
 * earlier ones (`earlier`), which the game log holds.
 */
export function toastTurns<T>(turns: readonly T[], max: number = MAX_TOAST_TURNS): { shown: readonly T[]; earlier: number } {
  if (turns.length <= max) return { shown: turns, earlier: 0 };
  const shown = turns.slice(-Math.max(1, max));
  return { shown, earlier: turns.length - shown.length };
}

// ── The toast stack ───────────────────────────────────────────────────────────────────────

/**
 * One toast: one other player's turns from the update that last brought them a new turn (and
 * that turn's growth since), oldest first, closing at `deadline` unless paused.
 */
export interface ToastItem {
  playerId: PlayerId;
  turns: readonly Turn[];
  deadline: number;
  /** The update (`ToastState.updates`) that last changed this toast. */
  update: number;
}

/**
 * The stack: at most one toast per other player, oldest first. While the pointer or focus is on
 * it (`pausedAt`), no toast closes; resuming moves every deadline on by the paused time, so each
 * keeps the time it had left.
 */
export interface ToastState {
  items: readonly ToastItem[];
  pausedAt: number | null;
  /** How many updates brought turns: the toasts the latest one changed carry this number. */
  updates: number;
}

export const NO_TOASTS: ToastState = Object.freeze({ items: Object.freeze([]) as readonly ToastItem[], pausedAt: null, updates: 0 });

export type ToastAction =
  | { type: "turns"; turns: readonly Turn[]; now: number }
  | { type: "expire"; now: number }
  | { type: "dismiss"; playerId: PlayerId }
  | { type: "pause"; now: number }
  | { type: "resume"; now: number };

/** The update's turns per player, in the order each player first appears, each oldest first. */
function turnsByPlayer(turns: readonly Turn[]): Map<PlayerId, Turn[]> {
  const byPlayer = new Map<PlayerId, Turn[]>();
  for (const turn of turns) {
    const own = byPlayer.get(turn.playerId);
    if (own === undefined) byPlayer.set(turn.playerId, [turn]);
    else own.push(turn);
  }
  return byPlayer;
}

/**
 * - `turns` (one update's turns, oldest first): each player's toast shows every turn of theirs in
 *   the update, for `TOAST_MS` from now (from the pause, while paused). When the update only
 *   continues the toast's last turn (a turn of several commands), the toast keeps its earlier
 *   turns; when it brings the player a new turn, it replaces their older toast. A changed toast
 *   moves to the end (newest) unless the stack is paused, where it is updated in place so nothing
 *   jumps under the reader.
 * - `expire`: closes every toast whose time is up (never while paused).
 * - `dismiss`: closes one toast (the close button, Escape).
 * - `pause` / `resume`: hover or focus on the stack. An empty stack is never paused.
 */
export function toastReducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case "turns": {
      if (action.turns.length === 0) return state;
      const update = state.updates + 1;
      const items = [...state.items];
      const deadline = (state.pausedAt ?? action.now) + TOAST_MS;
      for (const [playerId, turns] of turnsByPlayer(action.turns)) {
        const index = items.findIndex((candidate) => candidate.playerId === playerId);
        const previous = index < 0 ? undefined : items[index]!;
        const continues = previous !== undefined && previous.turns[previous.turns.length - 1]?.key === turns[0]!.key;
        const item: ToastItem = { playerId, turns: continues ? [...previous.turns.slice(0, -1), ...turns] : turns, deadline, update };
        if (index < 0) items.push(item);
        else if (state.pausedAt !== null) items[index] = item;
        else {
          items.splice(index, 1);
          items.push(item);
        }
      }
      return { ...state, items, updates: update };
    }
    case "expire": {
      if (state.pausedAt !== null) return state;
      const items = state.items.filter((item) => item.deadline > action.now);
      return items.length === state.items.length ? state : { ...state, items, pausedAt: null };
    }
    case "dismiss": {
      const items = state.items.filter((item) => item.playerId !== action.playerId);
      if (items.length === state.items.length) return state;
      return { ...state, items, pausedAt: items.length === 0 ? null : state.pausedAt };
    }
    case "pause":
      return state.pausedAt !== null || state.items.length === 0 ? state : { ...state, pausedAt: action.now };
    case "resume": {
      const pausedAt = state.pausedAt;
      if (pausedAt === null) return state;
      const shift = Math.max(0, action.now - pausedAt);
      return { ...state, items: state.items.map((item) => ({ ...item, deadline: item.deadline + shift })), pausedAt: null };
    }
  }
}

/** When the next toast closes, or null when none will (an empty or paused stack). */
export function nextDeadline(state: ToastState): number | null {
  if (state.pausedAt !== null || state.items.length === 0) return null;
  return Math.min(...state.items.map((item) => item.deadline));
}
