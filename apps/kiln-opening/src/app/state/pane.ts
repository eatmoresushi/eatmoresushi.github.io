/**
 * The decision pane's presence (owner review, 2026-10-17; UI_V1.6.1_ARCHITECTURE §3.5, §8.2).
 *
 * The open window's spec decides from its draft whether the pane shows (`WindowSpec.pane`;
 * without it, always). The work turn hides it while no placement is chosen: the player places a
 * worker with the Place shortcuts on the table, and the pane appears with that placement's
 * choices and Confirm; after Confirm or Clear it hides again. While it is hidden:
 * - desktop and tablet give the world the pane's column, and phones show no bottom sheet
 *   (`GameShell`, `data-pane="hidden"`; `DecisionPane` keeps its markup, `hidden`);
 * - a slim bar above the world (`decision/PaneOpeners`) always says whose turn it is and what to
 *   do (the spec's `lead`: "Your turn: place a worker · 3 left"), followed by the window's openers,
 *   if any, after the words that name them (the "Free actions" chips, owner UI decision D21); an
 *   opener dispatches its draft action, which brings the pane back, open on phones.
 *
 * `usePane()` reads the draft the way `useTableSelection()` does, so the shell, the pane and the
 * bar agree in the same render. `focusTable()` is the "back to the table" focus move: the pane
 * uses it when it hides with focus inside, and the skip link while the pane is hidden. Its
 * preferred target is the placement control the player last used (`PANE_RETURN_CONTROL`: a
 * Place shortcut, a Sell button, a chip, a held Order's toggle or the Imperial Priority token's Use
 * button, never a prompt the code focused
 * on the way, such as the Tech display's Guild Hall chooser), found again by its data attributes
 * when a re-render replaced it.
 */

import { useMemo, useSyncExternalStore } from "react";
import { windowDraftKey } from "./decisionWindow.ts";
import type { DraftActionBase, PanePresence, WindowText } from "./draftStore.ts";
import { useGameContext, useSnapshot } from "./hooks.ts";
import { engineViewOf, gameModelOf } from "./model.ts";

export interface PaneOpenerItem {
  /** The spec's opener key (`data-pane-opener`). */
  key: string;
  label: WindowText;
  /** Brings the pane back with the opener's choice (and opens the sheet on phones). */
  open(): void;
}

export interface PaneState {
  /** True while the open window's draft has nothing for the pane to show. */
  hidden: boolean;
  /** The hidden pane's bar cue ("Your turn: place a worker · 3 left"); null when the pane shows. */
  lead: WindowText | null;
  /** The words that name the openers' group ("Free actions"); null without openers. */
  openersLabel: WindowText | null;
  /** The ways to bring the pane back while it is hidden; empty when it shows. */
  openers: readonly PaneOpenerItem[];
}

const SHOWN: PaneState = Object.freeze({ hidden: false, lead: null, openersLabel: null, openers: Object.freeze([]) as readonly PaneOpenerItem[] });

/** Whether the decision pane shows now, and the openers while it is hidden. */
export function usePane(): PaneState {
  const { registry, drafts, ui } = useGameContext();
  const snapshot = useSnapshot();
  const version = useSyncExternalStore(drafts.subscribe, drafts.getVersion, drafts.getVersion);
  const view = snapshot.view;
  const hasError = snapshot.status.error !== null;
  return useMemo<PaneState>(() => {
    if (view === null) return SHOWN;
    const model = gameModelOf(view, snapshot.seats);
    const engine = engineViewOf(view);
    const spec = registry[model.window.kind];
    if (spec.pane === undefined) return SHOWN;
    const key = windowDraftKey(model.window);
    const presence: PanePresence<DraftActionBase> = spec.pane(drafts.read(key, spec.draft, model, engine), model, engine);
    // A server error (a rejected command, a send that failed) is said in the pane's ConfirmBar:
    // the pane stays up while one is pending, so the error never hides with it. The next choice
    // in the pane (`useDraft`) or the next command sent dismisses it.
    if (!presence.hidden || hasError) return SHOWN;
    return {
      hidden: true,
      lead: presence.lead,
      openersLabel: presence.openers.length === 0 ? null : presence.openersLabel,
      openers: presence.openers.map((opener) => ({
        key: opener.key,
        label: opener.label,
        open: () => {
          ui.actions.placeShortcut();
          drafts.dispatch(key, spec.draft, model, engine, opener.action);
        },
      })),
    };
    // `version` is the draft store's change counter: the presence follows every draft change.
  }, [view, snapshot.seats, registry, drafts, ui, hasError, version]);
}

// ── Focus ─────────────────────────────────────────────────────────────────────────────────

/**
 * The controls focus returns to when the pane hides: the table's Place shortcuts
 * (`LocationCard`'s `PlaceButtons`, `data-act="place"` with `data-location-id` and `data-worker`),
 * the Sell buttons on the viewer's Flawed ceramics (`SellButton`, `data-act="sell"` with
 * `data-ceramic-id`), the toggles of the viewer's held Orders (a completable one opens the
 * completion, owner revision 5; `.ord--own[data-order-id]`), the Imperial Priority token's Use
 * button (`data-act="imperial-priority"`, D21) and the hidden pane's chips (`data-pane-opener`). `DecisionPane` records the last one the player focused or clicked (a
 * click: WebKit does not focus a clicked button).
 */
export const PANE_RETURN_CONTROL = '[data-act="place"], [data-act="sell"], [data-act="imperial-priority"], .ord--own [data-act="order"], [data-pane-opener]';

/** The phone section showing now has a Place shortcut (`LocationCard`, the personal spaces). */
export function placeControlShown(document: Document): boolean {
  return document.querySelector('[data-section][data-current] [data-act="place"]') !== null;
}

function isRendered(element: Element | null | undefined): element is HTMLElement {
  return element instanceof HTMLElement && element.isConnected && element.getClientRects().length > 0;
}

function isShown(element: Element | null | undefined): element is HTMLElement {
  return isRendered(element) && element.closest("[hidden], [inert]") === null;
}

/** The heading of a world section (`WorldSections`: `[data-section]` → its `h2`). */
function sectionHeading(document: Document, selector: string): HTMLElement | null {
  const heading = document.querySelector(`${selector} h2`);
  return isShown(heading) ? heading : null;
}

/** A data attribute's value, when it is a plain key safe in a selector. */
function keyOf(element: Element, attribute: string): string | null {
  const value = element.getAttribute(attribute);
  return value !== null && /^[\w-]+$/.test(value) ? value : null;
}

/**
 * The live controls standing for `preferred`, best first: itself, then (a re-render drew it anew:
 * the Place shortcuts after another player's turn, the openers each time the pane hides) the
 * control with the same data attributes, then another worker's Place at the same location.
 */
function sameControls(document: Document, preferred: Element): Element[] {
  const found: Array<Element | null> = [preferred];
  const opener = keyOf(preferred, "data-pane-opener");
  if (opener !== null) found.push(document.querySelector(`[data-pane-opener="${opener}"]`));
  const sold = preferred.getAttribute("data-act") === "sell" ? keyOf(preferred, "data-ceramic-id") : null;
  if (sold !== null) found.push(document.querySelector(`[data-act="sell"][data-ceramic-id="${sold}"]`));
  const held = preferred.getAttribute("data-act") === "order" ? preferred.closest(".ord--own")?.getAttribute("data-order-id") : null;
  if (typeof held === "string" && /^[\w-]+$/.test(held)) found.push(document.querySelector(`.ord--own[data-order-id="${held}"] [data-act="order"]`));
  if (preferred.getAttribute("data-act") === "imperial-priority") found.push(document.querySelector('[data-act="imperial-priority"]'));
  const location = preferred.getAttribute("data-act") === "place" ? keyOf(preferred, "data-location-id") : null;
  if (location !== null) {
    const worker = keyOf(preferred, "data-worker");
    if (worker !== null) found.push(document.querySelector(`[data-act="place"][data-location-id="${location}"][data-worker="${worker}"]`));
    found.push(...document.querySelectorAll(`[data-act="place"][data-location-id="${location}"]`));
  }
  return found.filter((element): element is Element => element !== null);
}

/**
 * The table's focus target when the pane hides or is skipped to while hidden: `preferred` (the
 * last placement control the player used, `PANE_RETURN_CONTROL`) or its live counterpart if one
 * is shown, else the Table section's heading, else the current phone section's heading, else the
 * first shown section heading.
 */
export function tableFocusTarget(document: Document, preferred: Element | null = null): HTMLElement | null {
  const again = preferred === null ? undefined : sameControls(document, preferred).find(isShown);
  if (isShown(again)) return again;
  const first = [...document.querySelectorAll("[data-section] h2")].find(isShown);
  return sectionHeading(document, '[data-section="table"]') ?? sectionHeading(document, "[data-section][data-current]") ?? (isShown(first) ? first : null);
}

/**
 * How `focusTable` treats the view: `true` brings the target into view; `false` never scrolls;
 * `"focus-visible"` brings it into view only when the browser shows the focus ring (the player is
 * on the keyboard), so a pointer player's view never moves when the pane hides, and a keyboard
 * player never ends up with focus out of sight. (The turn toast's band, which opens at the
 * world's top after a new turn's reveal, keeps a control with the focus ring in view too:
 * `shell/toastRoom.ts`.)
 */
export type FocusScroll = boolean | "focus-visible";

function focusVisible(element: HTMLElement): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return false;
  }
}

/** Room kept between a revealed target and the world's edges, in px (as `FOCUS_GAP`, `shell/toastRoom.ts`). */
const REVEAL_GAP = 8;

/**
 * Scrolls the world, and only the world (like `jumpTo`: never the page or the shell), the least
 * that shows `target` inside it. Nothing lies over the world's top: the jump bar is a row of its
 * own above it (`GameShell`), and the turn toast's band is taken from the world's cell, not
 * drawn over it. Always an instant scroll, even of 0px: it also stops a jump's smooth scroll
 * still under way (the Guild Hall's jump to the Tech display), which would otherwise carry the
 * target out of sight again. A target outside the world (the bar above it) is always in view.
 */
export function revealInWorld(target: HTMLElement): void {
  const world = target.closest<HTMLElement>(".shell-world");
  if (world === null) return;
  const box = world.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const top = box.top + REVEAL_GAP;
  const bottom = box.bottom - REVEAL_GAP;
  const delta = rect.top < top ? rect.top - top : rect.bottom > bottom ? Math.min(rect.bottom - bottom, rect.top - top) : 0;
  world.scrollTo({ top: Math.max(0, world.scrollTop + delta), behavior: "instant" });
}

/** Moves focus to `tableFocusTarget`; returns the element focused, if any. */
export function focusTable(document: Document, options: { preferred?: Element | null; scroll: FocusScroll }): HTMLElement | null {
  const target = tableFocusTarget(document, options.preferred ?? null);
  if (target === null) return null;
  if (!target.hasAttribute("tabindex") && target.tabIndex < 0) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  if (options.scroll === true || (options.scroll === "focus-visible" && focusVisible(target))) revealInWorld(target);
  return target;
}

/** The hidden pane's bar lead (`decision/PaneOpeners`), when it is shown. */
export const PANE_OPENERS_FOCUS = "[data-pane-openers] [data-focus-heading]";

/**
 * Where "Skip to your decision" goes while the pane is hidden: the bar above the world if it has
 * openers (the abilities that may come first, right after its lead), else the table, where the
 * worker is placed.
 */
export function focusHiddenDecision(document: Document): HTMLElement | null {
  const bar = document.querySelector(PANE_OPENERS_FOCUS);
  const opener = bar?.closest("[data-pane-openers]")?.querySelector("[data-pane-opener]") ?? null;
  if (isShown(bar) && isShown(opener)) {
    bar.focus();
    return bar;
  }
  return focusTable(document, { scroll: true });
}
