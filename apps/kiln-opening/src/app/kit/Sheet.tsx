/**
 * Sheet (kit; wireframe `.sheet-strip` / `.ko-pane[data-sheet]`): the phone bottom sheet for the
 * decision pane (§4.1, §8.1).
 *
 * - Below 900px the strip (a button with `aria-expanded`) shows one line naming the decision; in
 *   `peek` the body is collapsed (the one width-dependent hiding §7.3 allows).
 * - Opening it focuses the body's heading (`[data-sheet-focus]`, else the first h2/h3);
 *   Escape collapses it and returns focus to the strip.
 * - At 900px and wider, and in short landscape (≤500px tall), the strip is hidden and the body
 *   always shows: the same markup at every width.
 */
import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, ReactNode, Ref } from "react";
import "./Sheet.css";

export type SheetState = "peek" | "open";

export interface SheetProps {
  state: SheetState;
  onStateChange: (state: SheetState) => void;
  /** The strip's one-line summary ("Your turn: place a worker"). */
  strip: ReactNode;
  /** A short call to action at the strip's end ("Decide"). */
  stripAction?: ReactNode;
  className?: string;
  stripRef?: Ref<HTMLButtonElement>;
  children?: ReactNode;
}

function focusHeading(body: HTMLElement | null): void {
  if (body === null) return;
  const target = body.querySelector<HTMLElement>("[data-sheet-focus], h2, h3");
  if (target === null) return;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus();
}

export function Sheet({ state, onStateChange, strip, stripAction, className, stripRef, children }: SheetProps) {
  const id = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const ownStripRef = useRef<HTMLButtonElement | null>(null);
  const previous = useRef<SheetState>(state);
  const open = state === "open";

  useEffect(() => {
    if (previous.current === "peek" && state === "open") focusHeading(bodyRef.current);
    previous.current = state;
  }, [state]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || state !== "open") return;
    event.stopPropagation();
    onStateChange("peek");
    ownStripRef.current?.focus();
  };

  const setStrip = (node: HTMLButtonElement | null) => {
    ownStripRef.current = node;
    if (typeof stripRef === "function") stripRef(node);
    else if (stripRef !== null && stripRef !== undefined) (stripRef as { current: HTMLButtonElement | null }).current = node;
  };

  return (
    <div className={["kit-sheet", className ?? ""].filter((part) => part !== "").join(" ")} data-sheet={state} onKeyDown={onKeyDown}>
      <button
        ref={setStrip}
        type="button"
        className="kit-sheet-strip"
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={() => onStateChange(open ? "peek" : "open")}
      >
        <span className="kit-sheet-grab" aria-hidden="true" />
        <span className="kit-sheet-text">{strip}</span>
        {stripAction === undefined ? null : <span className="kit-sheet-cta">{stripAction}</span>}
      </button>
      <div ref={bodyRef} id={`${id}-body`} className="kit-sheet-body">
        {children}
      </div>
    </div>
  );
}
