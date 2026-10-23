/**
 * TurnToasts (owner review, 2026-10-17; item 3: top right, one at a time). Owner: B1 (shell,
 * log, lobby).
 *
 * One toast at a time saying what one other player did on one turn, in the game log's own words
 * (`publicEventText`; `turnToasts.ts` groups the log into turns and queues them). The turns play
 * in the order they were played: in a 3-player game, after the viewer's turn, Computer 1's turn
 * shows for `TOAST_MS`, then Computer 2's. Every turn the viewer was there for plays; none is
 * dropped. Only other players' moves, only public text: never the viewer's own moves, a private
 * look or a hand.
 *
 * - **Away is history.** Turns played while the page is hidden or the connection is offline are
 *   not queued, nor is what the update that brings the viewer back holds (`skipTurns`), nor the
 *   new state of the reconnect the store makes on that return, when it comes in a later update
 *   (the first new view after the return): they are history, as after a reload, and the game log
 *   keeps them. The turns already waiting when the page was hidden keep their place and their
 *   time (the clock stops, below).
 * - **Present is news.** While the viewer is there, every turn plays, also when its entries come
 *   after a view that already shows it (a poll that read the records before a newer head, a room
 *   check) or after later entries (`advanceTurns` waits at the gap).
 * - Each toast closes by itself `TOAST_MS` after it appears (or after its turn last grew), and
 *   the next turn in the queue shows in its place.
 * - **Shown time only.** The clock stops while the pointer is on the toast or focus is inside it,
 *   while there is no room to draw it (it is hidden then, `data-cramped`: a phone whose open
 *   decision sheet leaves the world too little height), and while the page is hidden. The turn
 *   waits and keeps the time it had left, so each one is seen for its `TOAST_MS`.
 * - The close button (and Escape inside the toast) dismisses it, and the next turn shows. From
 *   the keyboard, focus stays on the close button, now the next toast's; from the pointer (or
 *   when nothing follows), focus goes back to where it was before it entered the toast; failing
 *   that, focus rescue (`focusRescue.ts`) takes it once the toast is gone.
 * - **Not a live region.** `LiveAnnouncer`'s one polite region already says every batch of
 *   moves through the same event templates, so the toast stays silent (no `aria-live`, no
 *   `role="status"`) and nothing is said twice. It is still reachable: a labelled group in the
 *   Tab order where it is drawn.
 * - **Drawn over nothing.** GameShell's holder sits at the top of the world's cell, under the
 *   top bar and (desktop and tablet) the jump bar with its seat chips, which are rows of their own
 *   above the world: the toast at its right end on desktop and tablet, across the world column on
 *   phones and in short landscape. While a toast shows, the world gives up a band of its cell as
 *   tall as the holder (`toastRoom.ts`: the world's top margin), so no part of the world lies
 *   under the toast, and the table stays where it was on screen: what the band takes is scrolled
 *   out of the world's top, where scrolling (or Tab, which scrolls the focused control into view)
 *   brings it back; what a closing toast gives back that the scroll cannot is left empty at the
 *   table's top until it is scrolled past; a short section gets room below it to scroll; a scroll
 *   under way is never stopped; a control with the keyboard focus ring is never scrolled out of
 *   view (the table moves down instead). The toast never covers the top bar (the Log button),
 *   the seat chips, the decision pane (its Confirm), the sheet or the section bar, and in the
 *   markup it comes after them and before the world, as it is drawn.
 * - The entrance (a fade and a short drop, the next turn's lines a fade) plays only without
 *   `prefers-reduced-motion: reduce`; the band opens and closes without motion.
 * - Formatted at render time, so a language switch re-renders the open toast. Its ceramics read
 *   as they were at the end of the turn (`ceramicViewAsOf`), so a toast that shows some turns
 *   later never calls a ceramic delivered that was still on the table, and its words do not
 *   change while it shows.
 */
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, FocusEvent, KeyboardEvent, MouseEvent } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { publicEventText } from "../i18n/events.ts";
import { isPhone } from "../state/layoutMode.ts";
import { useGame, useLayoutMode, useLog, useSession, useUi } from "../state/hooks.ts";
import { ceramicViewAsOf } from "./logCeramics.ts";
import { ToastRoom } from "./toastRoom.ts";
import { GAP_WAIT_MS, MAX_TOAST_LINES, NO_TOASTS, advanceTurns, isMinorToastLine, nextDeadline, showingToast, skipTurns, startTurnTracker, toastLines, toastReducer } from "./turnToasts.ts";
import type { ToastAction, TurnTracker } from "./turnToasts.ts";
import "./TurnToasts.css";

const CLOSE_ICON = (
  <svg className="turn-toast-close-icon" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
  </svg>
);

function isShown(element: HTMLElement | null): element is HTMLElement {
  return element !== null && element.isConnected && element.getClientRects().length > 0;
}

/** Whether the toast does not fit the holder (never taller than the world's cell), which the group shrinks to. */
function isCramped(group: HTMLElement): boolean {
  const toast = group.querySelector<HTMLElement>(":scope > .turn-toast");
  const height = toast?.offsetHeight ?? 0;
  return height > 0 && group.clientHeight < height;
}

/**
 * What the resize observer watches, each in the box the measure reads: the group (its
 * `clientHeight`; it has no padding or border), the toast (its border box, `offsetHeight`) and the
 * holder (its border box, the band). Never the world, whose box the band sets.
 */
function observedBoxes(group: HTMLElement, holder: HTMLElement | null): Array<readonly [Element, ResizeObserverBoxOptions]> {
  const boxes: Array<readonly [Element, ResizeObserverBoxOptions]> = [[group, "content-box"]];
  for (const toast of group.children) boxes.push([toast, "border-box"]);
  if (holder !== null) boxes.push([holder, "border-box"]);
  return boxes;
}

/** Whether the page is hidden (another tab, a locked phone): the queue's clock stops. */
function subscribeVisibility(listener: () => void): () => void {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}
const pageHidden = () => document.visibilityState === "hidden";
const neverHidden = () => false;

function holdAction(held: boolean): ToastAction {
  return held ? { type: "pause", now: Date.now() } : { type: "resume", now: Date.now() };
}

export function TurnToasts() {
  const t = useT();
  const model = useGame();
  const { log } = useLog();
  const hidden = useSyncExternalStore(subscribeVisibility, pageHidden, neverHidden);
  const offline = useSession().status.connection === "offline";
  // The viewer is away while the page is hidden or the connection is offline.
  const away = hidden || offline;
  const [state, dispatch] = useReducer(toastReducer, NO_TOASTS);
  const tracker = useRef<TurnTracker | null>(null);
  // Everything in the log when the screen mounts is history, not news.
  if (tracker.current === null) tracker.current = startTurnTracker(log, model.revision);
  const wasAway = useRef(away);
  // The view of the last update looked at, and whether the store's reconnect on the viewer's
  // return is still to come (its view, the first new one after the return, is history too).
  const lastModel = useRef(model);
  const catchingUp = useRef(false);
  // Bumped when a gap in the log has been waited for long enough, to look again.
  const [gapCheck, setGapCheck] = useState(0);
  const groupRef = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);
  const focused = useRef(false);
  const returnTo = useRef<HTMLElement | null>(null);
  const [cramped, setCramped] = useState(false);

  const revision = model.revision;
  useEffect(() => {
    const current = tracker.current;
    if (current === null) return undefined;
    const viewChanged = model !== lastModel.current;
    lastModel.current = model;
    if (away) {
      // Away: history, as after a reload.
      tracker.current = skipTurns(current, log, revision);
      catchingUp.current = false;
    } else if (wasAway.current || catchingUp.current) {
      // Back: what the update that brings the viewer back holds is history too, and so is the
      // reconnect the store makes on the return, unless this update already brought it (a new view).
      tracker.current = skipTurns(current, log, revision);
      catchingUp.current = !viewChanged;
    } else {
      const { tracker: next, turns } = advanceTurns(current, log, model.viewerId, Date.now());
      tracker.current = next;
      if (turns.length > 0) dispatch({ type: "turns", turns, now: Date.now() });
    }
    wasAway.current = away;
    // A gap in the log: look again once it has been waited for long enough.
    const gap = tracker.current.gap;
    if (gap === null) return undefined;
    const timer = setTimeout(() => setGapCheck((count) => count + 1), Math.max(0, gap.since + GAP_WAIT_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [log, model, revision, away, gapCheck]);

  const deadline = nextDeadline(state);
  useEffect(() => {
    if (deadline === null) return undefined;
    const timer = setTimeout(() => dispatch({ type: "expire", now: Date.now() }), Math.max(0, deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [deadline]);

  const showing = showingToast(state);
  const empty = showing === null;

  /** Holds the clock while the toast is in use, has no room, or the page is hidden. */
  const settle = () => dispatch(holdAction(hovered.current || focused.current || cramped || hidden));

  // The toast went away under the pointer or focus: no leave event follows, so forget both. Then
  // hold or release the clock for the new state.
  useEffect(() => {
    if (empty) {
      hovered.current = false;
      focused.current = false;
      returnTo.current = null;
    }
    dispatch(holdAction(hovered.current || focused.current || cramped || hidden));
  }, [empty, cramped, hidden]);

  // Measured before paint whenever the toast shows, and again whenever the toast or its holder
  // changes size (a turn's lines, a language switch, a change of layout, the phone sheet opening):
  // whether it fits (else it is hidden and waits), and the band it takes from the world
  // (`toastRoom.ts`, which keeps the table still). The room stays with the shell after the queue
  // ends: what a closed toast leaves at the table's top goes once it is scrolled past.
  //
  // The resize observer watches only the boxes the measure reads (`observedBoxes`), never the
  // world: the band the callback sets is the world's top margin, and its room the world's padding,
  // so a watched world would change size inside its own callback, at the depth of the holder (both
  // are the shell's children), and the browser could not deliver that before paint ("ResizeObserver
  // loop completed with undelivered notifications"). Nothing the callback writes changes a watched
  // box. The world's cell still reaches the measure: the holder shares that cell (its height is
  // capped at the cell's, its width is the cell's), so the phone sheet opening or a change of
  // layout resizes the holder, its group or the toast.
  const room = useRef<ToastRoom | null>(null);
  const measureRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const group = groupRef.current;
    if (group === null) {
      setCramped(false);
      return undefined;
    }
    // The shell's holder.
    const holder = group.parentElement;
    const shell = group.closest<HTMLElement>("[data-shell]");
    const world = shell?.querySelector<HTMLElement>(":scope > .shell-world") ?? null;
    if (shell !== null && world !== null && room.current?.world !== world) {
      room.current?.dispose();
      room.current = new ToastRoom(shell, world);
    }
    const measure = () => {
      const tight = isCramped(group);
      setCramped(tight);
      room.current?.setBand(holder === null || tight ? 0 : Math.ceil(holder.getBoundingClientRect().height));
    };
    measure();
    measureRef.current = measure;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (observer !== null) for (const [target, box] of observedBoxes(group, holder)) observer.observe(target, { box });
    return () => {
      measureRef.current = null;
      observer?.disconnect();
      room.current?.setBand(0);
    };
  }, [empty]);

  // The next turn's lines (or a language switch) change the toast's height: measured again in the
  // same commit, before paint, so the band never lags the toast while the resize observer's
  // callback waits for a frame (a page whose rendering is throttled delivers it late).
  const shownTurn = showing?.turn ?? null;
  useLayoutEffect(() => {
    measureRef.current?.();
  }, [shownTurn, t]);

  // The screen goes: every room goes with it.
  useEffect(
    () => () => {
      room.current?.dispose();
      room.current = null;
    },
    [],
  );

  // A phone's section changes the table shown: the room a closed toast left at its top goes.
  const { section } = useUi();
  const phone = isPhone(useLayoutMode());
  const shownSection = useRef(section);
  useLayoutEffect(() => {
    if (shownSection.current === section) return;
    shownSection.current = section;
    if (phone) room.current?.dropLead();
  }, [section, phone]);

  // The turn's ceramics as they were when it ended.
  const upTo = showing?.turn.entries[showing.turn.entries.length - 1]?.sequence ?? null;
  const view = useMemo(() => (upTo === null ? null : ceramicViewAsOf(model, log, upTo)), [upTo, model, log]);

  if (showing === null || view === null) return null;

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const from = event.relatedTarget;
    if (!focused.current) returnTo.current = from instanceof HTMLElement && !event.currentTarget.contains(from) ? from : null;
    focused.current = true;
    settle();
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const to = event.relatedTarget;
    if (to instanceof Node && event.currentTarget.contains(to)) return;
    focused.current = false;
    settle();
  };

  const key = showing.turn.key;
  const last = state.items.length <= 1;
  const dismiss = (fromKeyboard: boolean) => {
    const group = groupRef.current;
    let focusLeaves = false;
    // From the keyboard with a next turn to show, focus stays on the close button (the same
    // button, now the next toast's). Otherwise it goes back to where it was; a removed element
    // sends no blur, so the toast must not stay paused for it.
    if (group !== null && group.contains(document.activeElement) && (!fromKeyboard || last)) {
      focusLeaves = true;
      const back = returnTo.current;
      if (isShown(back)) back.focus({ preventScroll: true });
      else if (!last && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
    dispatch({ type: "dismiss", key, now: Date.now() });
    if (focusLeaves) {
      focused.current = false;
      returnTo.current = null;
      settle();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    dismiss(true);
  };
  // A click with no pointer detail is a keyboard press (Enter or Space on the button).
  const onClose = (event: MouseEvent<HTMLButtonElement>) => dismiss(event.detail === 0);

  const player = model.players.find((summary) => summary.playerId === showing.turn.playerId) ?? null;
  const toastStyle = { "--seat": `var(--seat-${player?.seatIndex ?? 0})` } as CSSProperties;
  const name = player?.displayName || t("common.anotherPlayer");
  const context = { t, view, viewerId: model.viewerId };
  const lines = toastLines(showing.turn.entries, MAX_TOAST_LINES, isMinorToastLine);
  return (
    <div
      ref={groupRef}
      className="turn-toasts"
      role="group"
      aria-label={t("shell.toast.label")}
      data-turn-toasts=""
      data-cramped={cramped ? "" : undefined}
      onPointerEnter={() => {
        hovered.current = true;
        settle();
      }}
      onPointerLeave={() => {
        hovered.current = false;
        settle();
      }}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {/* One element for every turn, so focus stays on its close button; the lines are keyed by turn. */}
      <div className="turn-toast" style={toastStyle} data-player-id={showing.turn.playerId} data-turn={key} onKeyDown={onKeyDown}>
        <div key={key} className="turn-toast-body">
          <ul className="turn-toast-lines">
            {lines.shown.map((entry) => (
              <li key={entry.sequence} className="turn-toast-line">
                {publicEventText(entry.event, context)}
              </li>
            ))}
            {lines.more > 0 ? <li className="turn-toast-line turn-toast-more">{t("shell.toast.more", { n: lines.more })}</li> : null}
          </ul>
        </div>
        <button type="button" className="turn-toast-close" aria-label={t("shell.toast.close", { name })} onClick={onClose}>
          {CLOSE_ICON}
        </button>
      </div>
    </div>
  );
}
