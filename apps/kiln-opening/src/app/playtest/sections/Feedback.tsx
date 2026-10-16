/**
 * Feedback (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * Source: Playtest Form V3: feedback.
 *
 * The thirteen table-reflection prompts of `PlaytestFeedback`, each a labelled text area with a
 * hint. Text is trimmed and capped by the schema (1,500 characters).
 */
import type { PlaytestFeedback } from "../../../playtest/types.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import type { SectionProps } from "../draftOps.ts";
import { Field, FormSection } from "../formParts.tsx";
import { fieldId } from "../issueText.ts";

/** The prompts, in the form's order (the keys of `PlaytestFeedback`). */
export const FEEDBACK_FIELDS: ReadonlyArray<keyof PlaytestFeedback> = [
  "strongest",
  "weakest",
  "blockedOrIdleWorkers",
  "softLock",
  "impossibleOrder",
  "sharedKilnNegotiation",
  "heatHedging",
  "tendMeaningful",
  "recognitionWorthwhile",
  "traditionConcern",
  "techConcern",
  "rulesAmbiguity",
  "minorTuning",
];

export function Feedback({ draft, edit, index }: SectionProps & { index: number }) {
  const t = useT();
  return (
    <FormSection index={index} title={t("playtest.feedback.title")} description={t("playtest.feedback.description")} optional>
      <div className="pt-grid pt-grid--two">
        {FEEDBACK_FIELDS.map((key) => {
          const path = `feedback.${key}`;
          return (
            <Field key={key} label={t.dynamic(`playtest.feedback.${key}`)} hint={t.dynamic(`playtest.feedback.${key}Hint`)} path={path}>
              <textarea
                id={fieldId(path)}
                name={path}
                rows={3}
                maxLength={1500}
                value={draft.feedback[key]}
                aria-describedby={`${fieldId(path)}-hint`}
                onChange={(event) => {
                  const value = event.target.value;
                  edit((current) => ({ ...current, feedback: { ...current.feedback, [key]: value } }));
                }}
              />
            </Field>
          );
        })}
      </div>
    </FormSection>
  );
}
