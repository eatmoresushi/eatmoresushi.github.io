/**
 * Submit (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * Source: Playtest Form V3: validation issues and submission.
 *
 * - `validatePlaytestSubmission` issues, in the reader's language (`issueText.ts`), each a link
 *   to its field; the list is an alert that receives focus after a failed check.
 * - A failed submission (`submitPlaytest`) explains itself; the draft stays saved.
 * - The submit button shows `aria-busy` while sending and ignores a second press.
 */
import type { RefObject } from "react";
import type { PlaytestDraft, PlaytestValidationIssue } from "../../../playtest/types.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import type { Translator } from "../../i18n/translator.ts";
import { Button } from "../../kit/Button.tsx";
import { fieldId, issueText } from "../issueText.ts";

/** Issues shown before "and n more". */
export const SHOWN_ISSUES = 8;

export interface SubmissionFailure {
  code: string;
  message: string;
}

export function failureText(failure: SubmissionFailure, t: Translator): string {
  switch (failure.code) {
    case "NOT_CONFIGURED":
      return t("playtest.submit.notConfigured");
    case "AUTHENTICATION_FAILED":
      return t("playtest.submit.authFailed");
    case "SERVICE_UNAVAILABLE":
      return t("playtest.submit.unavailable");
    case "INVALID_RESPONSE":
      return t("playtest.submit.invalidResponse");
    default:
      return failure.message;
  }
}

export interface SubmitProps {
  draft: PlaytestDraft;
  issues: readonly PlaytestValidationIssue[];
  failure: SubmissionFailure | null;
  busy: boolean;
  issuesRef: RefObject<HTMLDivElement | null>;
}

export function Submit({ draft, issues, failure, busy, issuesRef }: SubmitProps) {
  const t = useT();
  const unique = issues.filter((issue, index) => issues.findIndex((other) => other.path === issue.path && other.message === issue.message) === index);
  const shown = unique.slice(0, SHOWN_ISSUES);
  return (
    <>
      {unique.length === 0 ? null : (
        <div className="pt-message pt-message--error" ref={issuesRef} tabIndex={-1} role="alert" data-issues={unique.length}>
          <strong>{t("playtest.submit.issuesTitle")}</strong>
          <ul>
            {shown.map((issue) => (
              <li key={`${issue.path}|${issue.message}`}>
                <a href={`#${fieldId(issue.path)}`}>{issueText(issue, draft, t)}</a>
              </li>
            ))}
          </ul>
          {unique.length > shown.length ? <p>{t("playtest.submit.moreIssues", { n: unique.length - shown.length })}</p> : null}
        </div>
      )}
      {failure === null ? null : (
        <div className="pt-message pt-message--error" role="alert">
          <strong>{t("playtest.submit.failedTitle")}</strong>
          <p>{failureText(failure, t)}</p>
        </div>
      )}
      <section className="pt-submit" aria-labelledby="pt-submit-title">
        <div>
          <p className="pt-eyebrow">{t("playtest.submit.eyebrow")}</p>
          <h2 id="pt-submit-title">{t("playtest.submit.title")}</h2>
          <p>{t("playtest.submit.privacy")}</p>
        </div>
        <Button type="submit" variant="primary" busy={busy} action="confirm">
          {busy ? t("playtest.submit.busy") : t("playtest.submit.button")}
        </Button>
      </section>
    </>
  );
}
