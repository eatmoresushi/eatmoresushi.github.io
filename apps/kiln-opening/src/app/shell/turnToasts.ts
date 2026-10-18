/**
 * Turn toasts: what the other players did on their turns (owner review, 2026-10-17; one at a
 * time in turn order, owner review item 3). Owner: B1 (shell, log, lobby).
 *
 * Pure: it reads the game log (`useLog().log`) and groups the entries that arrived since the
 * screen mounted into turns, one per other player's turn. `TurnToasts.tsx` shows those turns one
 * at a time, each a group of lines in the event templates' words (`publicEventText`, the game
 * log's own lines).
 *
 * - **History is not news.** The log present when the screen mounts (a reload, a reconnect that
 *   fills the log later) is skipped: only entries newer than the mount's revision count.
 * - **Only turns the viewer was there for.** Turns played while the viewer was away (the page
 *   hidden: another tab, a locked phone; or the connection offline) are history too, exactly as
 *   after a reload (`skipTurns`): the screen moves the tracker past them, and past whatever the
 *   update that brings the viewer back holds (and the reconnect the store makes on that return),
 *   without queuing them. The game log keeps them.
 * - **Every turn the viewer was there for.** In live play a view may come before its entries (a
 *   poll reads the records, then a newer head; a room check or a stale command's refresh brings
 *   the head alone): those entries are news when they come, whatever the view showed meanwhile.
 *   And an update may bring later entries before earlier ones (the viewer's own command, or a
 *   computer batch, right after such a view): the tracker waits at the gap, so the turns in it
 *   play when they come, in turn order (`GAP_WAIT_MS` at most; a gap of history is not waited for).
 * - **Only other players' moves.** An entry the viewer's own command produced is never shown, and
 *   it ends the turn being collected. A line is shown only when its event names the player whose
 *   command produced it (`playerId === actorId`), or is a Quality change their own ability made
 *   (`QUALITY_IMPROVED`, a Second Firing `QUALITY_ASSIGNED`). Table events (refills, the Kiln Die,
 *   Fire, Contribution reveals, the Fire deck reshuffle) and turn markers are left out, and so is
 *   a line the game log folds into its neighbour (an Order reward, Canal Barge's 2 Coins, Guan's
 *   Coins, a salvage, the Imperial Grant, a Guild Hall payment, Ding's cost and Jun's Wood, and a
 *   Ding, Jun or Ge "used ⟨ability⟩" beside the line naming it), so the 4 lines carry the moves:
 *   a Form & Decorate turn with Ding's extra vessel is 4 lines, a Jun adjustment 1.
 * - **Grouped per turn.** Consecutive entries of one actor form one turn. A Work or Order turn
 *   ends at its `*_TURN_ENDED`, and a turn start always opens a new one. A turn may span several
 *   commands (and so several updates): the tracker keeps the open turn, and the next update adds
 *   to it under the same key.
 * - **Public only.** A turn holds log entries; the toast formats their public event, never the
 *   entry's own-secret variant, so a private look or a hand never shows.
 *
 * `toastReducer` is the queue itself: the turns in the order they were played, one showing at a
 * time. The toast showing closes `TOAST_MS` after it appeared (or after its turn last grew), or
 * when dismissed, and the next turn in the queue shows in its place for its own `TOAST_MS`. A
 * turn that grows while it waits is updated in its place in the queue; one that grows after its
 * toast closed (a turn of several commands) joins the queue again.
 *
 * **Every turn plays** (owner review item 3: "queue … and play them in order"). The queue has no
 * cap, so no turn the viewer was there for is ever dropped: one computer batch can bring ten
 * turns and more (a 4-player round's end: the last placements, the Contributions, the Heat
 * markers, the after-Quality abilities, the Order turns and the next round's first placements),
 * and a viewer who decides faster than the others' turns play builds a backlog, which plays on
 * in order (× or Escape moves on to the next turn). An absence piles up nothing: what is played
 * while the page is hidden or offline is not queued (above).
 *
 * **Held, not lost.** The clock runs only while the toast can be seen and is not in use: the
 * screen pauses the queue (`pause` / `resume`) while the pointer or focus is on the toast, while
 * there is no room to draw it (the phone's open decision sheet), and while the page is hidden
 * (the turns already waiting then keep their place and their time). A pause may start before any
 * turn waits; the turn that then arrives gets its full `TOAST_MS` from the resume.
 */
import type { GameEventType, PlayerId } from "../../game/index.ts";
import { repeatsNextEntry, repeatsPreviousEntry } from "../i18n/events.ts";
import type { LogEntry } from "../session/gameSource.ts";

/** A toast shows this long after it appears (or after its turn last grew). */
export const TOAST_MS = 3_000;

/** At most this many lines per turn; the rest are counted ("and 2 more lines in the game log"). */
export const MAX_TOAST_LINES = 4;

/**
 * A gap in the log (an update that brought later entries before earlier ones) is waited for this
 * long; the store's next read fills it long before. Then the tracker moves past it.
 */
export const GAP_WAIT_MS = 10_000;

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
  "LOOKED_ORDERS_TO_BOTTOM",
  "HELD_ORDER_DISCARDED",
  "TECH_ACQUIRED",
  // Fuel Ledger's 2 Contribution cards, taken with the tile (v1.6.2 change 26): public.
  "CONTRIBUTION_CARDS_GAINED",
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
  "SECOND_FIRING_CHOSEN",
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
  /** The last log sequence looked at; −1 before any (an empty log at mount). */
  lastSequence: number;
  /** Entries at or below this revision are history (the log when the screen mounted, or when the viewer came back). */
  sinceRevision: number;
  /** The turn still being collected, or null once it ended. */
  open: Turn | null;
  /** The sequence missing right after `lastSequence` while later ones are in, and since when; null without a gap. */
  gap: { sequence: number; since: number } | null;
}

function playerOf(entry: LogEntry): PlayerId | null {
  const value = (entry.event as { playerId?: unknown }).playerId;
  return typeof value === "string" ? value : null;
}

/**
 * Whether an entry of `entry.actorId`'s command is a line of their toast. A line the game log
 * folds into its neighbour (`repeatsPreviousEntry`, `repeatsNextEntry`) is none either.
 */
export function isToastLine(entry: LogEntry, previous: LogEntry | undefined, next?: LogEntry): boolean {
  const event = entry.event;
  if (repeatsPreviousEntry(entry, previous) || repeatsNextEntry(entry, next)) return false;
  if (event.type === "QUALITY_IMPROVED") return true;
  if (event.type === "QUALITY_ASSIGNED") return event.cause === "second_firing";
  return TOAST_EVENTS.has(event.type) && playerOf(entry) === entry.actorId;
}

/** A tracker that treats everything in `log` (and anything up to `revision`) as history. */
export function startTurnTracker(log: readonly LogEntry[], revision: number): TurnTracker {
  const last = log.length === 0 ? -1 : (log[log.length - 1]?.sequence ?? -1);
  return { lastSequence: last, sinceRevision: revision, open: null, gap: null };
}

/**
 * The tracker moved past everything in `log` (and anything up to `revision`) without making a
 * turn of it: the viewer was away (the page hidden, the connection offline) or is just back, so
 * those turns are history, as after a reload. The turn being collected ends: a later part of it
 * starts a turn of its own.
 */
export function skipTurns(tracker: TurnTracker, log: readonly LogEntry[], revision: number): TurnTracker {
  const last = log.length === 0 ? tracker.lastSequence : Math.max(tracker.lastSequence, log[log.length - 1]?.sequence ?? -1);
  return { lastSequence: last, sinceRevision: Math.max(tracker.sinceRevision, revision), open: null, gap: null };
}

/**
 * The turns that changed since the tracker last looked, oldest first: each new turn, and the
 * open turn again (same key, more entries) when it grew. Entries of the viewer's own commands
 * (and every entry for a spectator, `viewerId` null, is someone else's) are never in a turn.
 *
 * The entries are taken in sequence order, and none is passed over: at a sequence that has not
 * arrived while later ones have (a gap), the tracker stops and waits (`gap`), so the turns in it
 * play in their place once the store's next read brings them. A gap still open `GAP_WAIT_MS`
 * after it was met (`now`) is passed, and the turn being collected ends; a gap of history (the
 * entries after it are history) is never waited for.
 */
export function advanceTurns(tracker: TurnTracker, log: readonly LogEntry[], viewerId: PlayerId | null, now: number = 0): { tracker: TurnTracker; turns: readonly Turn[] } {
  let open: Turn | null = tracker.open;
  let lastSequence = tracker.lastSequence;
  let gap: TurnTracker["gap"] = null;
  const changed = new Map<number, Turn>();
  for (let index = 0; index < log.length; index += 1) {
    const entry = log[index]!;
    if (entry.sequence <= lastSequence) continue;
    if (lastSequence >= 0 && entry.sequence > lastSequence + 1 && entry.revision > tracker.sinceRevision) {
      const missing = lastSequence + 1;
      const since = tracker.gap?.sequence === missing ? tracker.gap.since : now;
      if (now - since < GAP_WAIT_MS) {
        gap = { sequence: missing, since };
        break;
      }
      // Waited long enough: what the gap held is unknown, so the turn being collected ends.
      open = null;
    }
    lastSequence = entry.sequence;
    if (entry.revision <= tracker.sinceRevision) continue;
    const actor = entry.actorId;
    if (actor === viewerId || TURN_STARTS.has(entry.event.type)) {
      open = null;
      continue;
    }
    if (open !== null && open.playerId !== actor) open = null;
    if (isToastLine(entry, log[index - 1], log[index + 1])) {
      const turn: Turn = open === null ? { key: entry.sequence, playerId: actor, entries: [entry] } : { ...open, entries: [...open.entries, entry] };
      open = turn;
      changed.set(turn.key, turn);
    }
    if (TURN_ENDS.has(entry.event.type) && playerOf(entry) === actor) open = null;
  }
  return { tracker: { lastSequence, sinceRevision: tracker.sinceRevision, open, gap }, turns: [...changed.values()] };
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

// ── The queue ─────────────────────────────────────────────────────────────────────────────

/** One turn in the queue. */
export interface ToastItem {
  turn: Turn;
}

/**
 * The queue: the toast showing first (`items[0]`), then the turns waiting, oldest first. The
 * toast showing closes at `deadline` unless paused; while paused (`pausedAt`: the pointer or
 * focus on it, no room for it, the page hidden) it never closes, and resuming moves the deadline
 * on by the paused time, so it keeps the time it had left.
 */
export interface ToastState {
  items: readonly ToastItem[];
  /** When the toast showing closes; null when the queue is empty. */
  deadline: number | null;
  /** When the pause began; it may outlast the queue (no room, the page hidden). */
  pausedAt: number | null;
}

export const NO_TOASTS: ToastState = Object.freeze({ items: Object.freeze([]) as readonly ToastItem[], deadline: null, pausedAt: null });

export type ToastAction =
  | { type: "turns"; turns: readonly Turn[]; now: number }
  | { type: "expire"; now: number }
  | { type: "dismiss"; key: number; now: number }
  | { type: "pause"; now: number }
  | { type: "resume"; now: number };

/** The toast showing, or null. */
export function showingToast(state: ToastState): ToastItem | null {
  return state.items[0] ?? null;
}

/** The queue without its first toast: the next one shows from `start` for `TOAST_MS`. */
function next(state: ToastState, items: readonly ToastItem[], start: number): ToastState {
  if (items.length === 0) return state.pausedAt === null ? NO_TOASTS : { items: [], deadline: null, pausedAt: state.pausedAt };
  return { items, deadline: start + TOAST_MS, pausedAt: state.pausedAt };
}

/**
 * - `turns` (one update's turns, oldest first): a turn already in the queue is updated in its
 *   place (the toast showing gets its full `TOAST_MS` again, from now, or from the pause while
 *   paused); any other turn joins the end of the queue, however long it is. An empty queue shows
 *   its first turn at once.
 * - `expire`: closes the toast showing when its time is up (never while paused); the next turn
 *   shows for its own `TOAST_MS` from now.
 * - `dismiss` (the close button, Escape): closes that turn's toast, and the next turn shows; a
 *   waiting turn (dismissed as it was replaced) just leaves the queue.
 * - `pause` / `resume`: the screen's hold (hover or focus on the toast, no room for it, the page
 *   hidden). A pause may begin while the queue is empty and outlasts it until resumed.
 */
export function toastReducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case "turns": {
      if (action.turns.length === 0) return state;
      const start = state.pausedAt ?? action.now;
      const items = [...state.items];
      let deadline = state.deadline;
      for (const turn of action.turns) {
        const index = items.findIndex((item) => item.turn.key === turn.key);
        if (index >= 0) items[index] = { ...items[index]!, turn };
        else items.push({ turn });
        if (index === 0 || items.length === 1) deadline = start + TOAST_MS;
      }
      return { ...state, items, deadline };
    }
    case "expire": {
      if (state.pausedAt !== null || state.deadline === null || state.deadline > action.now) return state;
      return next(state, state.items.slice(1), action.now);
    }
    case "dismiss": {
      const index = state.items.findIndex((item) => item.turn.key === action.key);
      if (index < 0) return state;
      const items = state.items.filter((_, at) => at !== index);
      if (index > 0) return { ...state, items };
      return next(state, items, state.pausedAt ?? action.now);
    }
    case "pause":
      return state.pausedAt !== null ? state : { ...state, pausedAt: action.now };
    case "resume": {
      const pausedAt = state.pausedAt;
      if (pausedAt === null) return state;
      if (state.items.length === 0) return NO_TOASTS;
      const shift = Math.max(0, action.now - pausedAt);
      return { ...state, deadline: state.deadline === null ? null : state.deadline + shift, pausedAt: null };
    }
  }
}

/** When the toast showing closes, or null when it will not (an empty or paused queue). */
export function nextDeadline(state: ToastState): number | null {
  if (state.pausedAt !== null || state.items.length === 0) return null;
  return state.deadline;
}
