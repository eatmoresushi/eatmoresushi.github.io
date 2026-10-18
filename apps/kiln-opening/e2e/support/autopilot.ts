/**
 * The decision-form autopilot (UI plan §9.4, §9.6). Owner: B6.
 *
 * One function, `autopilotPick`, chooses the next move on the open decision form from the
 * rendered DOM only — the test-driver contract of §9.6: the form has `data-window`, its option
 * inputs are native radios and checkboxes named after engine fields, Confirm is
 * `[data-action="confirm"]` and the alternative (End turn, Stop, Decline, Keep…) is
 * `[data-action="alt"]`. It never reads the engine: a form that renders a choice the rules do
 * not allow, or cannot reach a legal command, fails the game that uses it.
 *
 * The same function drives
 * - `test/v161/ui/form_driver_games.test.tsx` (happy-dom; the caller clicks), and
 * - `e2e/full_game.spec.ts` and `e2e/two_humans.spec.ts` (Playwright serializes it into the page
 *   with `page.evaluate`, then clicks the marked element with a real pointer).
 * So it must stay **self-contained**: no imports, no closures over module values.
 *
 * Each call marks one element with `data-autopilot` and says what it is. Choices are seeded by
 * `(seed, tick)`, so a run is reproducible; they vary the forms: any enabled radio, checkbox,
 * stepper or reorder button of the form's fields may be chosen, Confirm is pressed once enabled
 * with probability `confirmChance`, and the alternative with probability `altChance`. A steered
 * driver passes `prefer` (selectors tried before the seeded choice) and the `tried` ones of the
 * current decision: the steered `form_driver_games` games and `full_game.spec`'s steered case
 * share this one steering rule.
 *
 * **Table targets.** Workers are placed from the table (owner review, 2026-10-17): the pane lists
 * no workers or locations. So the work turn's Place shortcuts (`[data-act="place"]`, on the
 * location cards and the viewer's own personal spaces) and the Guild Hall's targets on the Tech
 * display (`[data-act="tech"]`, `[data-act="inspect"]`: the Apprentice's purchase, the Shifu's
 * discipline, and the face-up Techs of the Shifu's first and second take) are candidates too,
 * wherever they are on the page, and so are the other table targets a window offers beside its
 * pane options: the Order cards' toggles (`[data-act="order"]`: every Select's reservations on the
 * display and the private look row — the Commission Market's, and Colour Samples' when acquired and
 * in its swap — the held Order the Colour Samples swap gives up, the Order Phase's Orders and the
 * hand trim) and the Shared
 * Kiln's spaces (`[data-act="kiln-space"]`: a Glaze & Load destination, the Setter's Mark). A
 * target already pressed, unavailable (`aria-disabled`) or a dev tool (`data-dev`) is not. The
 * pane's own navigation buttons (`data-goto`: the Guild Hall's "Go to the Advanced Techs") move
 * nothing in the game and are never picked. On a phone a table target may sit in another section:
 * the caller brings it into view (`e2e/full_game.spec.ts`).
 *
 * **V1.6.2 windows.** Every one is a form of native radios and checkboxes like the others, so the
 * autopilot needs no knowledge of them: every Select N (v1.6.2 change 25: the Commission Market's,
 * Colour Samples' when gained and the swap's; `reservations`, valued `look:<OrderId>` and
 * `slot:<i>`: radios for a limit of 1, checkboxes for the Commission Market Shifu's 1–2, the others
 * unavailable once 2 are chosen), the Guild Hall inspection (`take`, one Tech per command; after the
 * first take a second or "take no more", then the bottom order's Move up / Move down buttons; after
 * the second take only the bottom order), the swap itself (an opener before the worker action, a
 * `mode` of the after-action window; `discardOrderId`), Second Firing's card (`cardIndex`, and
 * `jun` when Jun's adjustment applies), Protective Saggars' upgrade (an `afterQuality` option), the
 * Contribution card (`card`: Bank, Tend and Stoke, and Fuel Ledger Bank and Fuel Ledger Stoke for
 * the Fuel Ledger's owner, change 26) and the Order Phase's Orders (S07's "Carved, Impressed or
 * Painted" and a Crackle ceramic's declaration included).
 *
 * **The hidden pane.** During the work turn the pane is hidden until a placement is chosen (owner
 * review, 2026-10-17): its form stays in the page (`data-window`, `data-step`), but inside a
 * `hidden` `<aside>`, so none of its fields is a candidate; the Place shortcuts are, and so are the
 * hidden pane's openers above the world (`[data-pane-opener]`: an ability that may come before the
 * worker action, which brings the pane back with its form). After a Place the pane shows, and its
 * fields are candidates again. With an ability open and nothing placed, the step's radios are the
 * abilities only (none at all when only one may come first: the pane's heading names it), and
 * "Back to placing a worker" (`data-b4="back-to-placing"`) is a pane button like any other: it
 * hides the pane again, leaving the Place shortcuts and the openers.
 */

export interface AutopilotArgs {
  seed: number;
  /** A counter the caller increments for every pick. */
  tick: number;
  /** Probability of pressing an enabled Confirm instead of changing another choice. */
  confirmChance: number;
  /** Probability of pressing an enabled alternative button. */
  altChance: number;
  /**
   * Only choices inside this element of the form's fields (a CSS selector), for a steered driver
   * that has already made the choices outside it (e.g. `.b4-sub-region`: the chosen location's
   * sub-editor). Confirm and the alternative are still the form's own; of the table targets only
   * the sub-editors' own are offered (the Tech display's for the Guild Hall, the Shared Kiln's
   * spaces for a Glaze & Load destination), never a Place shortcut or an Order.
   */
  within?: string;
  /**
   * Steering: CSS selectors tried in order before the seeded choice, for a driver that wants the
   * game to reach the optional abilities a random autopilot rarely meets. A form control
   * (`input[name="take"][value="T10"]`) is looked for in the form, a table target or an opener
   * (`[data-act=…]`, `[data-pane-opener=…]`) anywhere on the page; the first one that is enabled,
   * shown, and not already checked or pressed is the pick, and its selector comes back as
   * `preferred`. Preferences never press Confirm or the alternative, so the seeded choices still
   * complete the form, and the engine still judges every command.
   */
  prefer?: readonly string[];
  /** Preferences already used in this decision (the caller collects `preferred` and clears them when the decision changes). */
  tried?: readonly string[];
}

export type AutopilotPick =
  | { kind: "none"; reason: string; window: string | null }
  | { kind: "busy"; window: string }
  | { kind: "confirm" | "alt" | "choice"; window: string; selector: string; describe: string; preferred?: string };

/** One move on the open decision form; marks the element to press with `data-autopilot`. */
export function autopilotPick(args: AutopilotArgs): AutopilotPick {
  // A small seeded generator, inlined so the function stays self-contained.
  let state = ((args.seed >>> 0) ^ Math.imul(args.tick + 1, 0x9e3779b1)) >>> 0 || 1;
  const random = (): number => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
  for (const old of Array.from(document.querySelectorAll("[data-autopilot]"))) old.removeAttribute("data-autopilot");
  const form = document.querySelector<HTMLFormElement>("form.pane-form[data-window]");
  if (form === null) return { kind: "none", reason: "no decision form", window: null };
  const window = form.getAttribute("data-window") ?? "";
  const confirm = form.querySelector<HTMLElement>('[data-action="confirm"]');
  const alt = form.querySelector<HTMLElement>('[data-action="alt"]');
  if (confirm !== null && confirm.getAttribute("aria-busy") === "true") return { kind: "busy", window };
  const enabled = (element: Element | null): element is HTMLElement =>
    element !== null && element.getAttribute("aria-disabled") !== "true" && element.getAttribute("aria-busy") !== "true" && !(element as HTMLButtonElement).disabled;
  const shown = (element: Element): boolean => element.closest("[hidden], [inert], details:not([open])") === null;
  const mark = (element: HTMLElement, kind: "confirm" | "alt" | "choice", describe: string): Extract<AutopilotPick, { selector: string }> => {
    const id = `${args.seed}-${args.tick}`;
    element.setAttribute("data-autopilot", id);
    return { kind, window, selector: `[data-autopilot="${id}"]`, describe };
  };
  const describeOf = (element: HTMLElement): string => {
    if (element instanceof HTMLInputElement) return `${element.type} ${element.name}=${element.value}${element.checked ? " (on)" : ""}`;
    const opener = element.getAttribute("data-pane-opener");
    if (opener !== null) return `opener ${opener}`;
    const act = element.getAttribute("data-act");
    if (act !== null) {
      const what =
        element.getAttribute("data-location-id") ??
        element.getAttribute("data-tech-id") ??
        element.getAttribute("data-discipline") ??
        element.getAttribute("data-space") ??
        element.closest("[data-order-id]")?.getAttribute("data-order-id") ??
        "";
      const worker = element.getAttribute("data-worker");
      return `table ${act} ${what}${worker === null ? "" : ` ${worker}`}`;
    }
    return `button ${element.getAttribute("aria-label") ?? element.textContent?.trim() ?? ""}`;
  };
  // Steering first: the first preference that can be pressed now.
  for (const selector of args.prefer ?? []) {
    if (args.tried?.includes(selector) === true) continue;
    const scope: ParentNode = selector.startsWith("[data-act") || selector.startsWith("[data-pane-opener") ? document : form;
    const element = Array.from(scope.querySelectorAll<HTMLElement>(selector)).find(
      (candidate) => enabled(candidate) && shown(candidate) && !(candidate instanceof HTMLInputElement && candidate.checked) && candidate.getAttribute("aria-pressed") !== "true",
    );
    if (element === undefined) continue;
    return { ...mark(element, "choice", describeOf(element)), preferred: selector };
  }
  const scroll = form.querySelector(".pane-scroll") ?? form;
  const fields = args.within === undefined ? scroll : scroll.querySelector(args.within);
  if (fields === null) return { kind: "none", reason: `nothing matches ${args.within ?? ""}`, window };
  const candidates: HTMLElement[] = [];
  for (const input of Array.from(fields.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]'))) {
    if (!enabled(input) || !shown(input)) continue;
    if (input.type === "radio" && input.checked) continue;
    candidates.push(input);
  }
  for (const button of Array.from(fields.querySelectorAll<HTMLButtonElement>("button"))) {
    if (!enabled(button) || !shown(button)) continue;
    if (button.hasAttribute("data-action") || button.closest(".kit-detail") !== null || button.classList.contains("kit-detail-close")) continue;
    // Dev tools (the canonical-move button sits at the end of the scroll area) are never a player's choice.
    if (button.hasAttribute("data-dev")) continue;
    // The pane's way to the table ("Go to the Central Action Board") changes nothing in the game.
    if (button.hasAttribute("data-goto")) continue;
    if (button.type === "submit") continue;
    candidates.push(button);
  }
  // The table targets of the open window: Place shortcuts, the Guild Hall's Techs and decks, the
  // Order cards' toggles, the Shared Kiln's spaces, and the hidden pane's openers.
  const tableTargets =
    args.within === undefined
      ? '[data-act="place"], [data-act="tech"], [data-act="inspect"], [data-act="order"], [data-act="kiln-space"], [data-pane-opener]'
      : '[data-act="tech"], [data-act="inspect"], [data-act="kiln-space"]';
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(tableTargets))) {
    if (form.contains(button) || !enabled(button) || !shown(button)) continue;
    if (button.hasAttribute("data-dev") || button.getAttribute("aria-pressed") === "true") continue;
    candidates.push(button);
  }
  if (enabled(confirm) && random() < args.confirmChance) return mark(confirm, "confirm", "Confirm");
  if (enabled(alt) && random() < args.altChance) return mark(alt, "alt", alt.textContent?.trim() ?? "alternative");
  if (candidates.length > 0) {
    const choice = candidates[Math.floor(random() * candidates.length)]!;
    return mark(choice, "choice", describeOf(choice));
  }
  if (enabled(confirm)) return mark(confirm, "confirm", "Confirm");
  if (enabled(alt)) return mark(alt, "alt", alt.textContent?.trim() ?? "alternative");
  return { kind: "none", reason: "nothing to press", window };
}
