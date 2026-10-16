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
 * - **The open panel lives in one body-level layer** (`#kit-detail-layer`, a React portal), so
 *   no scrolling column, table or container (each `container-type` wrapper is a stacking context
 *   and a containing block) can clip it or paint over it (change requests CR B2-6, CR B3-5). It
 *   is placed beside its button with `position: fixed`, through custom properties only: below
 *   the button, or above it when there is more room there; shifted to stay inside the viewport;
 *   its height capped to the room on that side (it scrolls inside). It follows the button on
 *   scroll and resize. Without a layer (server rendering, the first client render) the panel is
 *   rendered in place, hidden, so static markup still carries every detail.
 * - Keyboard order: the panel sits at the end of the document, so Tab from an open piece moves
 *   into its panel, Shift+Tab from the panel's first control returns to the button, and Tab past
 *   the panel's last control continues after the piece. React events bubble through the portal,
 *   so Escape and focus leaving work from inside the panel as from the button.
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
import { createPortal } from "react-dom";
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
  /** Panel width: `"auto"` (up to 22rem, default) or `"wide"` (up to 26rem: rules details). */
  size?: "auto" | "wide";
  className?: string;
  /** Extra attributes for motion hooks on the wrapper (`data-motion`). */
  motion?: string;
  motionKey?: string;
}

/** Gap between the button and the panel, and the panel's margin to the viewport edge (CSS px). */
const GAP = 6;
const MARGIN = 8;
/** The smallest height a panel is capped to; below it the panel takes the roomier side. */
const MIN_HEIGHT = 120;

const LAYER_ID = "kit-detail-layer";

/** The one body-level layer every open panel is rendered into (created on first use). */
function detailLayer(): HTMLElement | null {
  if (typeof document === "undefined" || document.body === null) return null;
  let layer = document.getElementById(LAYER_ID);
  if (layer === null) {
    layer = document.createElement("div");
    layer.id = LAYER_ID;
    layer.className = "kit-detail-layer";
    document.body.appendChild(layer);
  }
  return layer;
}

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function tabbables(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((element) => !element.closest("[inert]") && !element.closest("[hidden]"));
}

/** Focuses the first tabbable element after `anchor` in document order that is outside `skip`. */
function focusAfter(anchor: HTMLElement, skip: HTMLElement | null): boolean {
  for (const candidate of tabbables(document)) {
    if (skip !== null && skip.contains(candidate)) continue;
    if (anchor === candidate || anchor.contains(candidate)) continue;
    if (anchor.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING) {
      candidate.focus();
      return true;
    }
  }
  return false;
}

interface Placement {
  x: number;
  /** Distance from the viewport top (below the button) or bottom (above it). */
  y: number;
  above: boolean;
  maxHeight: number;
}

export function PieceDetail({ label, trigger, name = "trigger", title, children, hover = true, size = "auto", className, motion, motionKey }: PieceDetailProps) {
  const t = useT();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** The next focus on the button comes from a pointer press or from `close(true)`: do not open. */
  const quietFocus = useRef(false);

  useEffect(() => {
    setLayer(detailLayer());
  }, []);

  const inside = (node: Node | null): boolean =>
    node !== null && ((rootRef.current !== null && rootRef.current.contains(node)) || (panelRef.current !== null && panelRef.current.contains(node)));

  // Place the open panel beside its button, and follow the button on scroll and resize.
  useLayoutEffect(() => {
    if (!open || layer === null || typeof window === "undefined") return undefined;
    let frame = 0;
    const place = () => {
      frame = 0;
      const button = buttonRef.current;
      const panel = panelRef.current;
      if (button === null || panel === null) return;
      const box = button.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return; // no layout (a test DOM)
      const width = document.documentElement.clientWidth || window.innerWidth;
      const height = window.innerHeight;
      const panelWidth = panel.offsetWidth;
      let x = box.left;
      if (x + panelWidth > width - MARGIN) x = width - MARGIN - panelWidth;
      if (x < MARGIN) x = MARGIN;
      const below = Math.floor(height - box.bottom - GAP - MARGIN);
      const above = Math.floor(box.top - GAP - MARGIN);
      const natural = panel.scrollHeight;
      const useAbove = natural > below && above > below;
      const next: Placement = {
        x: Math.round(x),
        y: Math.round(useAbove ? height - box.top + GAP : box.bottom + GAP),
        above: useAbove,
        maxHeight: Math.max(MIN_HEIGHT, useAbove ? above : below),
      };
      setPlacement((previous) =>
        previous !== null && previous.x === next.x && previous.y === next.y && previous.above === next.above && previous.maxHeight === next.maxHeight ? previous : next,
      );
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(place);
    };
    place();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [open, layer]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!inside(event.target as Node | null)) {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  });

  const close = (refocus: boolean) => {
    setOpen(false);
    setPinned(false);
    setPlacement(null);
    if (refocus) {
      quietFocus.current = true;
      buttonRef.current?.focus();
      quietFocus.current = false;
    }
  };

  const layered = layer !== null;

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key !== "Tab" || !open || !layered || event.altKey || event.ctrlKey || event.metaKey) return;
    const panel = panelRef.current;
    const button = buttonRef.current;
    if (panel === null || button === null) return;
    const target = event.target as Node;
    const controls = tabbables(panel);
    if (target === button && !event.shiftKey && controls.length > 0) {
      // Into the panel, which sits at the end of the document.
      event.preventDefault();
      controls[0]?.focus();
    } else if (panel.contains(target) && event.shiftKey && target === controls[0]) {
      event.preventDefault();
      quietFocus.current = true;
      button.focus();
      quietFocus.current = false;
    } else if (panel.contains(target) && !event.shiftKey && target === controls[controls.length - 1]) {
      // Past the panel: continue after the piece.
      event.preventDefault();
      if (!focusAfter(button, panel)) close(true);
    }
  };

  const fine = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const style = (
    placement === null
      ? {}
      : {
          "--detail-x": `${placement.x}px`,
          "--detail-top": placement.above ? "auto" : `${placement.y}px`,
          "--detail-bottom": placement.above ? `${placement.y}px` : "auto",
          "--detail-max-h": `${placement.maxHeight}px`,
        }
  ) as CSSProperties;

  const panel = (
    <div
      ref={panelRef}
      id={`${id}-panel`}
      className="kit-detail-panel"
      data-layer={layered ? "true" : undefined}
      data-placed={placement === null ? undefined : "true"}
      data-above={placement?.above === true ? "true" : undefined}
      data-size={size === "wide" ? "wide" : undefined}
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
  );

  return (
    <span
      ref={rootRef}
      className={["kit-detail", className ?? ""].filter((part) => part !== "").join(" ")}
      onKeyDown={onKeyDown}
      onMouseEnter={() => {
        if (hover && !pinned && fine()) setOpen(true);
      }}
      onMouseLeave={() => {
        if (!pinned && open && !inside(document.activeElement)) close(false);
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (!pinned && open && !inside(next)) close(false);
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
      {layer === null ? panel : createPortal(panel, layer)}
    </span>
  );
}
