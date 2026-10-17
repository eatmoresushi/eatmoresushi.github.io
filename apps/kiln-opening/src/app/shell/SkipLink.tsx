/**
 * SkipLink (UI_V1.6.1_ARCHITECTURE §4.1, §8.1). Owner: B1 (shell, log, lobby).
 *
 * "Skip to your decision": the first stop in the tab order, visible only while focused. On a
 * phone with the sheet in `peek` it opens the sheet first (the sheet then focuses its heading);
 * otherwise it focuses the decision pane's heading (`<h2 tabIndex={-1}>`) directly. While the
 * pane is hidden (owner review, 2026-10-17: the work turn before a placement is chosen) the
 * decision starts on the table: it focuses the openers above the world if any, else the table
 * (`focusHiddenDecision`).
 */
import type { MouseEvent } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { useLayoutMode, useUi } from "../state/hooks.ts";
import { isPhone } from "../state/layoutMode.ts";
import { focusHiddenDecision, usePane } from "../state/pane.ts";
import "./SkipLink.css";

const PANE_HEADING = "aside.pane .pane-heading";

function focusPaneHeading(from: HTMLElement): boolean {
  const heading = from.ownerDocument.querySelector<HTMLElement>(PANE_HEADING);
  if (heading === null || heading.getClientRects().length === 0) return false;
  heading.focus();
  return true;
}

export function SkipLink() {
  const t = useT();
  const ui = useUi();
  const mode = useLayoutMode();
  const { hidden } = usePane();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const link = event.currentTarget;
    if (hidden) {
      focusHiddenDecision(link.ownerDocument);
      return;
    }
    if (isPhone(mode) && ui.sheet === "peek") {
      ui.setSheet("open");
      // The sheet focuses its heading when it opens; make sure it did once it has rendered.
      const view = link.ownerDocument.defaultView;
      view?.requestAnimationFrame(() => {
        if (link.ownerDocument.activeElement === link || link.ownerDocument.activeElement === link.ownerDocument.body) focusPaneHeading(link);
      });
      return;
    }
    focusPaneHeading(link);
  };
  return (
    <a className="skip-link" href="#decision" onClick={onClick}>
      {t("shell.skip.decision")}
    </a>
  );
}
