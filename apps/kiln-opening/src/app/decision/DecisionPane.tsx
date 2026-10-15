/**
 * DecisionPane (UI_V1.6.1_ARCHITECTURE §3.4–§3.6, §4.1, §8.1–§8.2; wireframe `pane`). Frozen
 * after phase A; changes go through B6.
 *
 * `<aside aria-label="Your decision">` (a stable landmark name, §8.1) · phone sheet (`kit/Sheet`) ·
 * `<h2 tabIndex={-1}>` (the focus target) · OwnSummary ·
 * `<form data-window>` [ `.pane-scroll`: the window's fields ] · ConfirmBar `</form>`.
 *
 * - The window and its component come from the registry (`decision/windows.ts`) through
 *   `useDecision()`; the frame decides no rule.
 * - **Sending (§3.6, U3):** only `.pane-scroll` is `inert`; ConfirmBar stays outside it, keeps
 *   focus and shows `aria-busy`.
 * - **Window change (§8.2):** when the window's kind or open key changes and focus was in the pane
 *   or on `<body>`, focus moves to the heading if it is visible, else (a phone sheet in `peek`)
 *   to the sheet strip, whose text names the window. Otherwise focus stays where it is.
 * - **Test-driver contract (§9.6):** the form has `data-window="<kind>"` (and `data-step` for the
 *   work window); Confirm is `data-action="confirm"`, the alternative `data-action="alt"`.
 * - Dev tools (`npm run dev:local`, e2e builds): the canonical-move button under the form.
 */
import { useEffect, useId, useRef } from "react";
import type { FormEvent } from "react";
import { CanonicalMoveButton } from "../dev/CanonicalMoveButton.tsx";
import { useT } from "../i18n/I18nProvider.tsx";
import { Sheet } from "../kit/Sheet.tsx";
import { isActingWindow, windowDraftKey } from "../state/decisionWindow.ts";
import { DEV_TOOLS_BUILD, useDecision, useDevTools, useEngineView, useGame, useUi } from "../state/hooks.ts";
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
  const headingId = useId();
  const paneRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stripRef = useRef<HTMLButtonElement>(null);
  const { window, spec, sending } = decision;
  const acting = isActingWindow(window);
  const key = windowDraftKey(window);
  const title = renderWindowText(t, spec.title(model, engine));

  const previousKey = useRef(key);
  useEffect(() => {
    if (previousKey.current === key) return;
    previousKey.current = key;
    if (typeof document === "undefined") return;
    const active = document.activeElement;
    const pane = paneRef.current;
    const focusWasHere = active === null || active === document.body || (pane !== null && pane.contains(active));
    if (!focusWasHere) return;
    const heading = headingRef.current;
    if (isVisible(heading)) heading.focus({ preventScroll: true });
    else stripRef.current?.focus({ preventScroll: true });
  }, [key]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    confirm.confirm();
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
    <aside ref={paneRef} className="pane" aria-label={t("common.landmark.decision")} data-window={window.kind} data-revision={model.revision}>
      <Sheet state={ui.sheet} onStateChange={ui.setSheet} strip={strip} stripAction={stripAction} stripRef={stripRef}>
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
          <div className="pane-scroll" inert={sending}>
            <Fields />
          </div>
          {acting ? <ConfirmBar state={confirm} /> : null}
        </form>
        {DEV_TOOLS_BUILD && devTools && acting ? <CanonicalMoveButton /> : null}
      </Sheet>
    </aside>
  );
}
