/**
 * TurnToasts (owner review, 2026-10-17). Owner: B1 (shell, log, lobby).
 *
 * A small stack of toasts over the bottom of the world column, one per other player, each
 * saying what that player did on their last turns in the game log's own words
 * (`publicEventText`; `turnToasts.ts` groups the log into turns). Every turn the latest update
 * brought that player is its own group of lines, oldest first (a computer batch can hold their
 * Order turn and their next Work turn). Only other players' moves, only public text: never the
 * viewer's own moves, a private look or a hand.
 *
 * - Each toast closes by itself `TOAST_MS` after it appears (or after it last changed).
 * - Hovering the stack or focusing inside it pauses every toast; leaving resumes them with the
 *   time they had left.
 * - The close button (and Escape inside a toast) dismisses that toast. Focus then moves to the
 *   next toast's close button when the dismissal came from the keyboard, else back to where it
 *   was before it entered the stack; failing both, focus rescue (`focusRescue.ts`) takes it.
 * - **Not a live region.** `LiveAnnouncer`'s one polite region already says every batch of
 *   moves through the same event templates, so the toast stays silent (no `aria-live`, no
 *   `role="status"`) and nothing is said twice. It is still reachable: a labelled list in the Tab
 *   order between the world and the decision pane, matching where it is drawn.
 * - Placement is GameShell's (`.shell-toasts`): the world's grid cell, bottom edge, so it never
 *   covers the decision pane and its Confirm bar, the seat chips (top bar, or the world's sticky
 *   jump bar) or the phone section bar. Taller than its room (a short phone), the list scrolls
 *   inside itself: each update brings the first toast it changed to the top (the oldest news;
 *   the rest follow below it), or the end of the list into view when everything after it fits.
 *   It never scrolls while the player is reading (paused). When the room cannot hold even one
 *   toast (a phone whose open decision sheet fills the world's cell), the stack is hidden
 *   (`data-cramped`) instead of drawn as a sliver with a scrollbar; its toasts keep closing on
 *   time, and those still open show again when the room returns. The entrance animation (a
 *   fade, no slide, so the scrolling list never overflows while it runs) plays only without
 *   `prefers-reduced-motion: reduce`.
 * - Formatted at render time, so a language switch re-renders the open toasts.
 */
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CSSProperties, FocusEvent, KeyboardEvent, MouseEvent } from "react";
import type { PlayerId } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { publicEventText } from "../i18n/events.ts";
import { useGame, useLog } from "../state/hooks.ts";
import { logCeramicView } from "./logCeramics.ts";
import { NO_TOASTS, advanceTurns, nextDeadline, startTurnTracker, toastLines, toastReducer, toastTurns } from "./turnToasts.ts";
import type { TurnTracker } from "./turnToasts.ts";
import "./TurnToasts.css";

const CLOSE_ICON = (
  <svg className="turn-toast-close-icon" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
  </svg>
);

function isShown(element: HTMLElement | null): element is HTMLElement {
  return element !== null && element.isConnected && element.getClientRects().length > 0;
}

/** Whether the list's room (its content box) is shorter than its shortest toast. */
function isCramped(list: HTMLElement): boolean {
  const heights = [...list.children].map((toast) => (toast as HTMLElement).offsetHeight).filter((height) => height > 0);
  if (heights.length === 0) return false;
  const style = getComputedStyle(list);
  const room = list.clientHeight - (Number.parseFloat(style.paddingTop) || 0) - (Number.parseFloat(style.paddingBottom) || 0);
  return room < Math.min(...heights);
}

export function TurnToasts() {
  const t = useT();
  const model = useGame();
  const { log } = useLog();
  const [state, dispatch] = useReducer(toastReducer, NO_TOASTS);
  const tracker = useRef<TurnTracker | null>(null);
  // Everything in the log when the screen mounts is history, not news.
  if (tracker.current === null) tracker.current = startTurnTracker(log, model.revision);
  const listRef = useRef<HTMLOListElement>(null);
  const hovered = useRef(false);
  const focused = useRef(false);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const current = tracker.current;
    if (current === null) return;
    const { tracker: next, turns } = advanceTurns(current, log, model.viewerId);
    tracker.current = next;
    if (turns.length > 0) dispatch({ type: "turns", turns, now: Date.now() });
  }, [log, model.viewerId]);

  const deadline = nextDeadline(state);
  useEffect(() => {
    if (deadline === null) return undefined;
    const timer = setTimeout(() => dispatch({ type: "expire", now: Date.now() }), Math.max(0, deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [deadline]);

  const empty = state.items.length === 0;
  useEffect(() => {
    // The stack went away under the pointer or focus: no leave event follows, so forget both.
    if (!empty) return;
    hovered.current = false;
    focused.current = false;
    returnTo.current = null;
  }, [empty]);

  // No room for even one toast (the phone's decision sheet fills the world's cell): hide the
  // stack rather than draw a sliver of it with a scrollbar. Measured on every change of the
  // list's or a toast's size, and before paint, so a sliver never shows; the stack keeps its
  // layout while hidden, so the measure holds.
  const [cramped, setCramped] = useState(false);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list === null) {
      setCramped(false);
      return undefined;
    }
    const measure = () => setCramped(isCramped(list));
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const toast of list.children) observer.observe(toast);
    return () => observer.disconnect();
  }, [state.items]);

  // When the stack is taller than its room (a short phone), it scrolls inside itself: each update
  // brings the first toast it changed to the top (the browser stops at the end when the rest
  // fits), once, and never while the player is reading (an update during a pause scrolls when it
  // resumes). The list is the toasts' offset parent (TurnToasts.css), so offsets are scroll ones.
  // Before paint, so the list never shows a frame at the old scroll.
  const scrolledUpdate = useRef(0);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list === null || state.pausedAt !== null || state.updates === scrolledUpdate.current) return;
    scrolledUpdate.current = state.updates;
    const index = state.items.findIndex((item) => item.update === state.updates);
    const toasts = list.querySelectorAll<HTMLElement>(":scope > .turn-toast");
    const target = toasts[index];
    const first = toasts[0];
    if (index < 0 || target === undefined || first === undefined) return;
    list.scrollTop = target.offsetTop - first.offsetTop;
  }, [state.updates, state.pausedAt, state.items]);

  const view = useMemo(() => (empty ? null : logCeramicView(model, log)), [empty, model, log]);

  if (view === null) return null;

  const settle = () => dispatch(hovered.current || focused.current ? { type: "pause", now: Date.now() } : { type: "resume", now: Date.now() });

  const onFocus = (event: FocusEvent<HTMLOListElement>) => {
    const from = event.relatedTarget;
    if (!focused.current) returnTo.current = from instanceof HTMLElement && !event.currentTarget.contains(from) ? from : null;
    focused.current = true;
    settle();
  };

  const onBlur = (event: FocusEvent<HTMLOListElement>) => {
    const to = event.relatedTarget;
    if (to instanceof Node && event.currentTarget.contains(to)) return;
    focused.current = false;
    settle();
  };

  const dismiss = (playerId: PlayerId, fromKeyboard: boolean) => {
    const list = listRef.current;
    const toasts = list === null ? [] : [...list.querySelectorAll<HTMLElement>(".turn-toast")];
    const index = toasts.findIndex((toast) => toast.dataset["playerId"] === playerId);
    const toast = toasts[index] ?? null;
    let focusLeaves = false;
    if (toast !== null && toast.contains(document.activeElement)) {
      const sibling = fromKeyboard ? (toasts[index + 1] ?? toasts[index - 1] ?? null) : null;
      const next = sibling?.querySelector<HTMLElement>(".turn-toast-close") ?? null;
      const back = returnTo.current;
      if (next !== null) next.focus({ preventScroll: true });
      else {
        // Focus leaves the stack (to where it was, else focus rescue takes it once the toast is
        // gone): a removed element sends no blur, so the stack must not stay paused for it.
        focusLeaves = true;
        if (isShown(back)) back.focus({ preventScroll: true });
      }
    }
    dispatch({ type: "dismiss", playerId });
    if (focusLeaves) {
      focused.current = false;
      settle();
    }
  };

  const context = { t, view, viewerId: model.viewerId };
  return (
    <ol
      ref={listRef}
      className="turn-toasts"
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
      {state.items.map((item) => {
        const player = model.players.find((summary) => summary.playerId === item.playerId) ?? null;
        const name = player?.displayName || t("common.anotherPlayer");
        const { shown, earlier } = toastTurns(item.turns);
        const style = { "--seat": `var(--seat-${player?.seatIndex ?? 0})` } as CSSProperties;
        const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          dismiss(item.playerId, true);
        };
        // A click with no pointer detail is a keyboard press (Enter or Space on the button).
        const onClose = (event: MouseEvent<HTMLButtonElement>) => dismiss(item.playerId, event.detail === 0);
        return (
          <li key={item.playerId} className="turn-toast" style={style} data-player-id={item.playerId} onKeyDown={onKeyDown}>
            <div className="turn-toast-turns">
              {earlier > 0 ? <p className="turn-toast-line turn-toast-more turn-toast-earlier">{t("shell.toast.earlier", { n: earlier })}</p> : null}
              {shown.map((turn) => {
                const lines = toastLines(turn.entries.map((entry) => publicEventText(entry.event, context)));
                return (
                  <ul key={turn.key} className="turn-toast-lines" data-turn={turn.key}>
                    {lines.shown.map((line, index) => (
                      <li key={index} className="turn-toast-line">
                        {line}
                      </li>
                    ))}
                    {lines.more > 0 ? <li className="turn-toast-line turn-toast-more">{t("shell.toast.more", { n: lines.more })}</li> : null}
                  </ul>
                );
              })}
            </div>
            <button type="button" className="turn-toast-close" aria-label={t("shell.toast.close", { name })} onClick={onClose}>
              {CLOSE_ICON}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
