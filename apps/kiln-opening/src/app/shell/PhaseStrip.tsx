/**
 * PhaseStrip (UI_V1.6.1_ARCHITECTURE §4.1, §4.2, §7.3). Owner: B1 (shell, log, lobby).
 * Source: wireframe `topBar` `phases`.
 *
 * The five round phases (`roundPhases()` from `ROUND_STRUCTURE`), the current one from
 * `roundPhaseOf` (`model.roundPhase`) marked `aria-current="step"`, earlier ones `done`. During
 * the Firing Phase the current phase carries the Appendix D step (`firingStage.step`); once the
 * game is finished a "Final scoring" step follows the five.
 *
 * Full labels at 1500px and wider; below that the other phases show their number only (their
 * label stays readable by assistive technology), so the strip fits beside the seat chips.
 */
import { useT } from "../i18n/I18nProvider.tsx";
import { roundPhases } from "../i18n/content.ts";
import { num } from "../i18n/format.ts";
import { useModel } from "../state/hooks.ts";

export function PhaseStrip() {
  const t = useT();
  const roundPhase = useModel((model) => model.roundPhase);
  const step = useModel((model) => model.firingStage?.step ?? null);
  const phases = roundPhases(t.locale);
  const finished = roundPhase === "final";
  const currentIndex = finished ? phases.length : phases.findIndex((phase) => phase.id === roundPhase);
  return (
    <ol className="phase-strip" aria-label={t("shell.phases.label")} data-phase={roundPhase}>
      {phases.map((phase, index) => {
        const state = index === currentIndex ? "current" : index < currentIndex ? "done" : "next";
        return (
          <li key={phase.id} className="phase-strip-item" data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span className="phase-strip-number num" aria-hidden="true">
              {num(phase.order)}
            </span>
            <span className="phase-strip-label">{phase.name}</span>
            {state === "current" && roundPhase === "firing" && step !== null ? (
              <span className="phase-strip-step">
                {t("shell.sep")}
                {t("shell.phase.step", { n: step })}
              </span>
            ) : null}
          </li>
        );
      })}
      {finished ? (
        <li className="phase-strip-item" data-state="current" aria-current="step">
          <span className="phase-strip-label">{t("shell.phase.final")}</span>
        </li>
      ) : null}
    </ol>
  );
}
