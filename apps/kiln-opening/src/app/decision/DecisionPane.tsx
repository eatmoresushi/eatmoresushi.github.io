/**
 * DecisionPane (UI_V1.6.1_ARCHITECTURE §3.4–§3.6, §4.1, §8.1–§8.2; wireframe `pane`). Frozen
 * after phase A; changes go through B6.
 *
 * `<aside aria-label="Your decision">` (a stable landmark name, §8.1) · phone sheet (`kit/Sheet`) ·
 * eyebrow (the round phase, "· Your turn" when the viewer acts; wireframe `promptBlock`) ·
 * `<h2 tabIndex={-1}>` (the focus target) · OwnSummary ·
 * `<form data-window>` [ `.pane-scroll`: the window's fields ] · ConfirmBar `</form>`.
 *
 * - The window and its component come from the registry (`decision/windows.ts`) through
 *   `useDecision()`; the frame decides no rule. The heading is the spec's `title` for the open
 *   draft (the work turn names an ability's form while it is open).
 * - **Sending (§3.6, U3):** only `.pane-scroll` is `inert`; ConfirmBar stays outside it, keeps
 *   focus and shows `aria-busy`.
 * - **Window change (§8.2):** when the window's kind or open key changes and focus was in the pane
 *   or on `<body>`, focus moves to the heading if it is visible, else (a phone sheet in `peek`)
 *   to the sheet strip, whose text names the window. Otherwise focus stays where it is.
 * - **Scroll on a window change:** `.pane-scroll` is one element for every window, so a new
 *   window would open where the last one was scrolled to (a Select's look and prompt above the
 *   view after a long list was scrolled). A new acting window, a change of kind, and the pane
 *   appearing all start the fields (and the short-landscape sheet body, which scrolls instead) at
 *   the top. A waiting window whose actor changes keeps its place: the viewer may be reading it.
 * - **Hidden pane (owner review, 2026-10-17; `state/pane.ts`):** while the open window's draft has
 *   nothing for it (the work turn before a placement is chosen) the `<aside>` is `hidden`, its
 *   markup kept (the test-driver contract below still holds), and `GameShell` gives its room to
 *   the world. When it appears in the same window (a Place shortcut, an opener), focus moves to
 *   its heading (or the sheet strip); when it hides on a phone section with no Place control (a
 *   free action's Confirm or Clear from the Orders tab, the Colour Samples swap: D20, D21), the phone
 *   goes back to the Table tab, where the worker is placed (`placeControlShown`); when it hides with
 *   focus inside or on `<body>` (Clear, back
 *   to placing, a new turn after Confirm), focus goes back to the table (`focusTable`): to the
 *   placement control the player last used (a Place shortcut or an opener, `PANE_RETURN_CONTROL`;
 *   never a prompt focused on the way, like the Guild Hall's Tech chooser), found again by its
 *   data attributes when it was drawn anew, else to the Table section's heading. The world then
 *   scrolls, the least it can, to show that target: always after the player's own Clear or back
 *   to placing (the world has just widened, and the Guild Hall's jump to the Tech display may
 *   have taken the view away); at a new turn only when the focus ring shows (a keyboard player),
 *   so a pointer player's view is never moved by the other players' turns. The other players'
 *   turn toasts, which open a band at the world's top right after (a later commit), never scroll
 *   that target out of view again (`shell/toastRoom.ts`: the world scrolls only as far as keeps
 *   a control with the focus ring in view).
 * - **Test-driver contract (§9.6):** the form has `data-window="<kind>"` (and `data-step` for the
 *   work window); Confirm is `data-action="confirm"`, the alternative `data-action="alt"`.
 * - Dev tools (`npm run dev:local`, e2e builds): the canonical-move button under the form (hidden
 *   with the pane: the smoke spec presses it there with a dispatched click).
 */
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { CanonicalMoveButton } from "../dev/CanonicalMoveButton.tsx";
import { useT } from "../i18n/I18nProvider.tsx";
import { roundPhases } from "../i18n/content.ts";
import { Sheet } from "../kit/Sheet.tsx";
import { isActingWindow, windowDraftKey } from "../state/decisionWindow.ts";
import { DEV_TOOLS_BUILD, useDecision, useDevTools, useDraft, useEngineView, useGame, useLayoutMode, useUi } from "../state/hooks.ts";
import { isPhone } from "../state/layoutMode.ts";
import { PANE_RETURN_CONTROL, focusTable, placeControlShown, usePane } from "../state/pane.ts";
import { ConfirmBar, renderWindowText, useConfirmState } from "./ConfirmBar.tsx";
import { OwnSummary } from "./OwnSummary.tsx";
import "./DecisionPane.css";

function isVisible(element: HTMLElement | null): element is HTMLElement {
  return element !== null && element.getClientRects().length > 0;
}

export function DecisionPane() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const decision = useDecision();
  const ui = useUi();
  const devTools = useDevTools();
  const confirm = useConfirmState();
  const [draft] = useDraft<unknown>();
  const headingId = useId();
  const paneRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stripRef = useRef<HTMLButtonElement>(null);
  const { window, spec, sending } = decision;
  const acting = isActingWindow(window);
  const key = windowDraftKey(window);
  const title = renderWindowText(t, spec.title(model, engine, draft));
  const phaseName = model.roundPhase === "final" ? t("shell.phase.final") : (roundPhases(t.locale).find((phase) => phase.id === model.roundPhase)?.name ?? null);
  const eyebrow = phaseName === null ? null : acting ? t("common.status.phaseYourTurn", { phase: phaseName }) : phaseName;

  const { hidden } = usePane();
  const phone = isPhone(useLayoutMode());

  // The placement control the player last used (a Place shortcut, an opener above the world):
  // focus goes back there when the pane hides. Focus and clicks both count (WebKit does not
  // focus a clicked button); focus the code moves elsewhere on the way (the Guild Hall's Tech
  // chooser) does not.
  const lastPlace = useRef<Element | null>(null);
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const record = (event: Event) => {
      const target = event.target instanceof Element ? event.target.closest(PANE_RETURN_CONTROL) : null;
      if (target !== null && !(paneRef.current?.contains(target) ?? false)) lastPlace.current = target;
    };
    document.addEventListener("focusin", record);
    document.addEventListener("click", record, true);
    return () => {
      document.removeEventListener("focusin", record);
      document.removeEventListener("click", record, true);
    };
  }, []);

  // Layout effect: it runs in the commit that shows or hides the pane, before focus rescue's
  // mutation observer, so the move below is the one that counts.
  const kind = window.kind;
  const previous = useRef({ key, hidden, kind });
  const { section, setSection } = ui;
  // The focus move that waits for the Table tab to show (the section changes in the next commit).
  const afterSection = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const before = previous.current;
    if (before.key === key && before.hidden === hidden) return;
    previous.current = { key, hidden, kind };
    if (typeof document === "undefined") return;
    const active = document.activeElement;
    const pane = paneRef.current;
    const focusWasHere = active === null || active === document.body || (pane !== null && pane.contains(active));
    if (hidden) {
      // Same window: the player's own Clear or back to placing. A new key: a new turn.
      const focusBack = () => {
        if (focusWasHere) focusTable(document, { preferred: lastPlace.current, scroll: before.key === key ? true : "focus-visible" });
      };
      // D20, D21: the pane hides for placing, so a phone section with nothing to place on (the Orders
      // tab after a Deliver badge or the swap) gives way to the Table tab. Otherwise the player would
      // read "place a worker" with no Place button in sight.
      if (phone && section !== "table" && !placeControlShown(document)) {
        afterSection.current = focusBack;
        setSection("table");
        return;
      }
      focusBack();
      return;
    }
    // A new window, or the pane shown again, starts at the top of its fields.
    if (before.hidden || (before.key !== key && (acting || before.kind !== kind))) {
      if (scrollRef.current !== null) scrollRef.current.scrollTop = 0;
      const body = scrollRef.current?.closest<HTMLElement>(".kit-sheet-body") ?? null;
      if (body !== null) body.scrollTop = 0;
    }
    // Shown again in the same window: the player placed a worker or opened an ability.
    const appeared = before.hidden && before.key === key;
    if (!appeared && !focusWasHere) return;
    const heading = headingRef.current;
    if (isVisible(heading)) heading.focus({ preventScroll: true });
    else stripRef.current?.focus({ preventScroll: true });
  }, [key, hidden, kind, acting, phone, section, setSection]);

  useLayoutEffect(() => {
    const run = afterSection.current;
    afterSection.current = null;
    run?.();
  }, [section]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    confirm.confirm();
  };

  // D21: Enter is the default (the primary button, "Place · end turn"), Shift+Enter the secondary
  // ("Place, then free actions"), wherever focus is in the pane: on the heading it focuses when it
  // appears (outside the form, hence the handler on the pane), or on a choice. A button or link keeps
  // its own Enter (Clear, Rules, Move up), except that Shift+Enter on the primary button is still the
  // secondary choice. A held key never confirms (the Enter that pressed Place may repeat), and
  // neither does an IME's Enter.
  // Enter on a radio nobody has chosen yet chooses it, in every window: a keyboard player who tabbed
  // to it means that entry, never what the form would otherwise send.
  // Where End turn or Done is the only button, Enter presses it only if the list has nothing to lose
  // (`alternativeTakesEnter`). Ending the window with entries left needs that button's own press: a
  // stray Enter on the heading would otherwise give up the last chance to deliver for good.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" || event.repeat || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest('button, a[href], select, textarea, summary, [role="button"]') ?? null;
    if (control !== null && !(event.shiftKey && control.getAttribute("data-action") === "confirm")) return;
    event.preventDefault();
    if (target instanceof HTMLInputElement && target.type === "radio" && !target.checked) target.click();
    else if (confirm.alternativeOnly) {
      if (!event.shiftKey && confirm.alternativeTakesEnter) confirm.sendAlternative();
    } else if (event.shiftKey) confirm.confirmStay();
    else confirm.confirm();
  };

  const strip = (
    <span className="pane-strip">
      {acting ? <strong className="pane-strip-turn">{t("common.status.yourTurn")}</strong> : null}
      <span className="pane-strip-title">{title}</span>
    </span>
  );
  const stripAction = ui.sheet === "open" ? t("common.kit.sheetCollapse") : acting ? t("common.verb.decide") : t("common.kit.details");
  const Fields = spec.Component;

  return (
    <aside ref={paneRef} className="pane" aria-label={t("common.landmark.decision")} data-window={window.kind} data-revision={model.revision} hidden={hidden} onKeyDown={acting ? onKeyDown : undefined}>
      <Sheet state={ui.sheet} onStateChange={ui.setSheet} strip={strip} stripAction={stripAction} stripRef={stripRef}>
        {eyebrow === null ? null : (
          <p className="pane-eyebrow" data-phase={model.roundPhase}>
            {eyebrow}
          </p>
        )}
        <h2 ref={headingRef} id={headingId} className="pane-heading" tabIndex={-1} data-sheet-focus="">
          {title}
        </h2>
        <OwnSummary />
        <form
          className="pane-form"
          data-window={window.kind}
          data-step={window.kind === "work" ? window.step : undefined}
          aria-labelledby={headingId}
          noValidate
          onSubmit={onSubmit}
        >
          {/* A window with no fields of its own (final results, waiting) may still scroll inside a
              short pane: then the region itself takes keyboard focus (axe scrollable-region-focusable). */}
          <div ref={scrollRef} className="pane-scroll" inert={sending} {...(acting ? {} : { tabIndex: 0, role: "group", "aria-labelledby": headingId })}>
            <Fields />
            {/* Dev builds only. Inside the scroll area, so on a short pane it never takes height
                from (or paints over) the ConfirmBar. */}
            {DEV_TOOLS_BUILD && devTools && acting ? <CanonicalMoveButton /> : null}
          </div>
          {acting ? <ConfirmBar state={confirm} /> : null}
        </form>
      </Sheet>
    </aside>
  );
}
