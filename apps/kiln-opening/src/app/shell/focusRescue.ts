/**
 * Focus rescue (UI_V1.6.1_ARCHITECTURE §8.2). Owner: B1 (shell, log, lobby).
 *
 * Its job is to catch a focused table control that a revision removed or hid (a Place button
 * after placing, an Order card after completion, a section the phone section bar switched away
 * from), so focus never falls to `<body>`.
 *
 * - On `focusin`, it records the focused element and its nearest `[data-focus-fallback]`
 *   container.
 * - After each commit (a DOM mutation under the root, including the attribute change that hides
 *   a phone section), if focus fell to `<body>` because the recorded element was removed, or
 *   the focused element is no longer rendered, it moves focus to the first visible of: that
 *   container's heading; the heading of the current phone section (`[data-current]`); the
 *   decision pane's heading; the phone sheet's strip.
 * - Focus the player moved away on purpose (clicking empty space) is left alone: the recorded
 *   element is still connected and visible.
 */

const HEADING = "h2, h3, h4, [data-focus-heading]";
const PANE_HEADING = ".pane-heading";
const SHEET_STRIP = ".kit-sheet-strip";

function isRendered(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement && element.isConnected && element.getClientRects().length > 0;
}

/** Moves focus without scrolling: a rescue runs after other players' moves too, and must never move the view. */
function focusQuietly(element: HTMLElement): void {
  if (!element.hasAttribute("tabindex") && element.tabIndex < 0) element.setAttribute("tabindex", "-1");
  element.focus({ preventScroll: true });
}

function headingOf(container: Element | null): HTMLElement | null {
  if (container === null || !isRendered(container)) return null;
  const heading = container.querySelector(HEADING);
  return isRendered(heading) ? heading : null;
}

interface RescueState {
  element: HTMLElement | null;
  container: Element | null;
}

const STATES = new WeakMap<HTMLElement, RescueState>();

function stateOf(root: HTMLElement): RescueState {
  let state = STATES.get(root);
  if (state === undefined) {
    state = { element: null, container: null };
    STATES.set(root, state);
  }
  return state;
}

/** Whether focus was lost: it is on `<body>` (or nowhere) and the last focused element went away, or the focused element is hidden. */
function focusLost(root: HTMLElement, state: RescueState): boolean {
  const document = root.ownerDocument;
  const active = document.activeElement;
  if (active === null || active === document.body || active === document.documentElement) {
    const last = state.element;
    return last !== null && !isRendered(last);
  }
  return root.contains(active) && !isRendered(active);
}

/** The element focus should move to, in the §8.2 order. */
export function rescueTarget(root: HTMLElement, container: Element | null): HTMLElement | null {
  const candidates: Array<HTMLElement | null> = [
    headingOf(container),
    headingOf(root.querySelector("[data-section][data-current]")),
  ];
  const pane = root.querySelector<HTMLElement>(PANE_HEADING);
  candidates.push(isRendered(pane) ? pane : null);
  const strip = root.querySelector<HTMLElement>(SHEET_STRIP);
  candidates.push(isRendered(strip) ? strip : null);
  return candidates.find((candidate): candidate is HTMLElement => candidate !== null) ?? null;
}

/** Runs the rescue once (after a commit). Returns the element it focused, if any. */
export function rescueFocus(root: HTMLElement): HTMLElement | null {
  const state = stateOf(root);
  if (!focusLost(root, state)) return null;
  const target = rescueTarget(root, state.container);
  if (target === null) return null;
  focusQuietly(target);
  state.element = target;
  state.container = target.closest("[data-focus-fallback]");
  return target;
}

/** Installs focus rescue on `root`; returns the cleanup. */
export function installFocusRescue(root: HTMLElement): () => void {
  const state = stateOf(root);
  const onFocusIn = (event: FocusEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    state.element = target;
    state.container = target.closest("[data-focus-fallback]");
  };
  root.addEventListener("focusin", onFocusIn);
  const MutationObserverImpl = root.ownerDocument.defaultView?.MutationObserver;
  const observer = MutationObserverImpl === undefined ? null : new MutationObserverImpl(() => rescueFocus(root));
  observer?.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-current", "hidden", "data-sheet", "inert"] });
  return () => {
    root.removeEventListener("focusin", onFocusIn);
    observer?.disconnect();
    STATES.delete(root);
  };
}
