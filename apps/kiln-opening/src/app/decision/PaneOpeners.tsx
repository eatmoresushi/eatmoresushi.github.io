/**
 * PaneOpeners (owner review, 2026-10-17; `state/pane.ts`). Drawn by `GameShell` above the world,
 * across its column, only while the decision pane is hidden.
 *
 * The work turn hides the pane until a worker's placement is chosen on the table. The pane's
 * eyebrow ("Work Phase · Your turn") and heading are then out of sight, so this slim bar always
 * says it instead, in the spec's `lead`: "Your turn: place a worker · 3 left". An ability that may
 * come before the worker action (Imperial Priority…: whatever the window's spec names as openers)
 * still needs the pane, so it gets a small button after the lead, behind the words that name the
 * group: "Or first: [Imperial Priority] [Canal Barge]". Pressing one chooses that ability, the
 * pane appears with its form (open on phones) and focus moves into it (`DecisionPane`).
 *
 * - The bar is a region named like the pane ("Your decision"): the two never show together, so
 *   the decision always has one landmark. Its lead is the skip link's target while the pane is
 *   hidden and openers are shown (`focusHiddenDecision`); without openers the skip link goes to
 *   the table.
 * - Two flex items: the lead, and the openers' group (its label first, then the buttons). They
 *   share one line when they fit (desktop); otherwise the group moves, whole, onto its own line
 *   under the lead, the buttons in one row (phones: `PaneOpeners.css`).
 * - Openers are plain buttons with `data-pane-opener="<key>"` (the e2e autopilot's hook); their
 *   order is the spec's.
 */
import { useId } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { Button } from "../kit/Button.tsx";
import { usePane } from "../state/pane.ts";
import { renderWindowText } from "./ConfirmBar.tsx";
import "./PaneOpeners.css";

export function PaneOpeners() {
  const t = useT();
  const pane = usePane();
  const labelId = useId();
  if (!pane.hidden || pane.lead === null) return null;
  return (
    <section className="pane-openers" aria-label={t("common.landmark.decision")} data-pane-openers="">
      <p className="pane-openers-lead" tabIndex={-1} data-focus-heading="">
        {renderWindowText(t, pane.lead)}
      </p>
      {pane.openers.length === 0 || pane.openersLabel === null ? null : (
        <div className="pane-openers-row" role="group" aria-labelledby={labelId}>
          <span id={labelId} className="pane-openers-label">
            {renderWindowText(t, pane.openersLabel)}
          </span>
          {pane.openers.map((opener) => (
            <Button key={opener.key} size="sm" className="pane-opener" data-pane-opener={opener.key} onClick={opener.open}>
              {renderWindowText(t, opener.label)}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
