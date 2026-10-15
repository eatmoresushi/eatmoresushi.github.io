/**
 * PieceDetail (kit, §7.4, §8.1, K15): a piece (ceramic, marker, Tech slot, Kiln tradition, Order,
 * location, Recognition milestone) as a button that discloses a panel with its full details,
 * the `RulesDetail` pattern of owner decision D10.
 *
 * - Click, tap, Enter or Space toggles the panel (`aria-expanded`, `aria-controls`) and pins it.
 * - Keyboard focus opens it too (D10: "click, tap or focus"), unpinned: it closes again when
 *   focus leaves the piece. Focus that comes from a pointer press does not open it (the click
 *   does). With a fine pointer, hovering also shows it until the pointer leaves.
 * - Escape or an outside click closes it; Escape returns focus to the button (without
 *   reopening it).
 * - The panel is kept inside the viewport (it shifts horizontally and flips above when there is
 *   no room below), through custom properties only.
 * - The `title` attribute is never the only carrier of game information. The button's
 *   accessible name comes from the trigger's own words by default (`name="trigger"`), so
 *   everything the piece shows is read: a `CeramicChip` supplies its `ceramicLabel` plus its
 *   Heat marker's words ("…, Heat marker, face down"), a `QualityChip` its word. Pass
 *   `name="label"` only for a trigger with no words of its own (pure art); `label` must then
 *   carry everything the art shows (for a marked ceramic, `common.ceramic.withMarker`).
 *   `label` always names the panel.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import "./PieceDetail.css";

export interface PieceDetailProps {
  /** The piece in words, e.g. a `ceramicLabel`: names the panel, and the button when `name="label"`. */
  label: string;
  /** The visible piece. Rendered inside the button; keep it free of interactive content. */
  trigger: ReactNode;
  /**
   * Where the button's accessible name comes from. `"trigger"` (default): the trigger's own
   * text, including visually hidden text (CeramicChip, HeatMarkerBadge). `"label"`: `label`,
   * for a trigger without words.
   */
  name?: "trigger" | "label";
  /** Panel heading; defaults to `label`. */
  title?: ReactNode;
  /** Panel content. */
  children?: ReactNode;
  /** Open on hover with a fine pointer (default true). */
  hover?: boolean;
  className?: string;
  /** Extra attributes for motion hooks on the wrapper (`data-motion`). */
  motion?: string;
  motionKey?: string;
}

const VIEWPORT_MARGIN = 8;

export function PieceDetail({ label, trigger, name = "trigger", title, children, hover = true, className, motion, motionKey }: PieceDetailProps) {
  const t = useT();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [shift, setShift] = useState<{ x: number; above: boolean }>({ x: 0, above: false });
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** The next focus on the button comes from a pointer press or from `close(true)`: do not open. */
  const quietFocus = useRef(false);

  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (panel === null || typeof window === "undefined") return;
    const rect = panel.getBoundingClientRect();
    const width = document.documentElement.clientWidth || window.innerWidth;
    const height = window.innerHeight;
    let x = 0;
    if (rect.right > width - VIEWPORT_MARGIN) x = width - VIEWPORT_MARGIN - rect.right;
    if (rect.left + x < VIEWPORT_MARGIN) x = VIEWPORT_MARGIN - rect.left;
    const button = buttonRef.current?.getBoundingClientRect();
    const above = rect.bottom > height - VIEWPORT_MARGIN && button !== undefined && button.top > rect.height + VIEWPORT_MARGIN;
    setShift((previous) => (previous.x === x && previous.above === above ? previous : { x, above }));
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    setPinned(false);
    setShift({ x: 0, above: false });
    if (refocus) {
      quietFocus.current = true;
      buttonRef.current?.focus();
      quietFocus.current = false;
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      close(true);
    }
  };

  const fine = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const style = { "--detail-shift-x": `${shift.x}px` } as CSSProperties;

  return (
    <span
      ref={rootRef}
      className={["kit-detail", className ?? ""].filter((part) => part !== "").join(" ")}
      onKeyDown={onKeyDown}
      onMouseEnter={() => {
        if (hover && !pinned && fine()) setOpen(true);
      }}
      onMouseLeave={() => {
        const focusInside = rootRef.current !== null && rootRef.current.contains(document.activeElement);
        if (!pinned && open && !focusInside) close(false);
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (!pinned && open && (next === null || rootRef.current === null || !rootRef.current.contains(next))) close(false);
      }}
      data-motion={motion}
      data-motion-key={motionKey}
    >
      <button
        ref={buttonRef}
        type="button"
        className="kit-detail-trigger"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        aria-label={name === "label" ? label : undefined}
        onPointerDown={() => {
          quietFocus.current = true;
        }}
        onFocus={() => {
          if (!quietFocus.current && !open) setOpen(true);
          quietFocus.current = false;
        }}
        onClick={() => {
          quietFocus.current = false;
          if (open && pinned) close(false);
          else {
            setOpen(true);
            setPinned(true);
          }
        }}
      >
        {trigger}
      </button>
      <div
        ref={panelRef}
        id={`${id}-panel`}
        className="kit-detail-panel"
        data-above={shift.above ? "true" : undefined}
        style={style}
        role="group"
        aria-label={label}
        hidden={!open}
      >
        <div className="kit-detail-head">
          <strong className="kit-detail-title">{title ?? label}</strong>
          <button type="button" className="kit-detail-close" aria-label={t("common.kit.close")} onClick={() => close(true)}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="kit-detail-body">{children}</div>
      </div>
    </span>
  );
}
