/**
 * StepRail (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * Source: wireframe `stepper`: the Appendix D steps (6 since revision 4) with First-Player marks.
 *
 * An ordered list of the Appendix D firing steps (glossary §2.11 names; short English labels on
 * the rail, the full name in its accessible text and tooltip). The open step carries
 * `aria-current="step"`; earlier steps are marked done; steps resolved in First Player order
 * (`stage.firstPlayerOrder`: step 5 since revision 4) carry a mark and say so. The rail scrolls inside
 * itself in a narrow stage, never the page, and takes keyboard focus so it can be scrolled.
 * Whenever the open step changes, the rail scrolls itself (instantly, not the page) so the open
 * step sits near its start edge, as the wireframe does (`ol.scrollLeft = st.offsetLeft - 40`).
 */
import { useLayoutEffect, useRef } from "react";
import type { FiringStageView } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { firingStepCount } from "../i18n/content.ts";
import "./StepRail.css";

export interface StepRailProps {
  /** The firing shown. */
  stage: FiringStageView;
}

/** How far the open step sits from the rail's start edge after scrolling (wireframe: 40px). */
export const STEP_RAIL_LEAD_PX = 40;

/**
 * Scrolls `rail` (never the page) so `item` starts `STEP_RAIL_LEAD_PX` from its start edge.
 * Measured from the bounding boxes, so it does not depend on the rail being the item's
 * offset parent. A rail that does not overflow ignores the assignment.
 */
export function scrollRailTo(rail: HTMLElement, item: HTMLElement): void {
  const offset = item.getBoundingClientRect().left - rail.getBoundingClientRect().left + rail.scrollLeft;
  rail.scrollLeft = Math.max(0, offset - STEP_RAIL_LEAD_PX);
}

export function StepRail({ stage }: StepRailProps) {
  const t = useT();
  const railRef = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    const rail = railRef.current;
    const item = rail?.querySelector<HTMLElement>('[aria-current="step"]');
    if (rail && item) scrollRailTo(rail, item);
  }, [stage.step]);
  const total = firingStepCount();
  const steps = Array.from({ length: total }, (_, index) => index + 1);
  const finished = stage.step === total;
  return (
    // Focusable, so a keyboard user can scroll the rail when it scrolls inside a narrow stage
    // (WCAG 2.1.1; axe `scrollable-region-focusable`).
    <ol ref={railRef} className="steps" aria-label={t("kiln.rail.label")} tabIndex={0}>
      {steps.map((n) => {
        const full = t.dynamic(`kiln.step.${String(n)}.full`);
        const short = t.dynamic(`kiln.step.${String(n)}.short`);
        const firstPlayer = (stage.firstPlayerOrder as readonly number[]).includes(n);
        const done = n < stage.step || finished;
        const current = n === stage.step;
        const classes = ["steps-item", done ? "steps-item--done" : "", current ? "steps-item--on" : "", firstPlayer ? "steps-item--fp" : ""]
          .filter((part) => part !== "")
          .join(" ");
        return (
          <li key={n} className={classes} aria-current={current ? "step" : undefined} title={full} data-step={n}>
            <span className="steps-n num" aria-hidden="true">{n}</span>
            <span className="steps-label" aria-hidden="true">{short}</span>
            <span className="sr-only">{t("kiln.rail.item", { n, name: full })}</span>
            {firstPlayer ? <span className="sr-only">{t("kiln.rail.firstPlayerOrder")}</span> : null}
            {done && !current ? <span className="sr-only">{t("kiln.rail.done")}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
