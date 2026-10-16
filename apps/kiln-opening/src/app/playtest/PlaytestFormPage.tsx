/**
 * PlaytestFormPage (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * Source: V1.4 `PlaytestFormPage.tsx` rebuilt on Form V3 (`src/playtest`).
 *
 * - **Draft save and restore.** The draft is saved under `kiln-opening:playtest-draft-v3` on
 *   every change and restored with `restorePlaytestDraft` (Form V3 only; older drafts are not
 *   migrated). Every storage call is wrapped in `try`/`catch` (§3.2); the V2 key is left alone
 *   until the cutover (C2.1).
 * - **Sections:** the game (`Meta`), players with their Techs per discipline and results
 *   (`Players`), firing by round with the Kiln Die and Fuel Ledger ±2 only for its owner
 *   (`Rounds`), reflection (`Feedback`), and submission (`Submit`).
 * - **Submit:** `validatePlaytestSubmission(submissionCandidate(draft))`; issues are rendered and
 *   focused; a valid record goes through `submitPlaytest`. On success the draft is cleared and a
 *   reference is shown.
 * - English and Chinese from the `playtest` namespace and content names; the language toggle
 *   keeps the draft.
 *
 * Props exist for tests and the gallery: a seeded draft, a storage, a submit function.
 */
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createPlaytestDraft, restorePlaytestDraft, submissionCandidate } from "../../playtest/model.ts";
import { validatePlaytestSubmission } from "../../playtest/schema.ts";
import { submitPlaytest } from "../../playtest/client.ts";
import type { PlaytestDraft, PlaytestSubmission, PlaytestSubmitResult, PlaytestValidationIssue } from "../../playtest/types.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { Button } from "../kit/Button.tsx";
import { LanguageToggle } from "../kit/LanguageToggle.tsx";
import { num } from "../i18n/format.ts";
import type { DraftEdit } from "./draftOps.ts";
import { Feedback } from "./sections/Feedback.tsx";
import { Meta } from "./sections/Meta.tsx";
import { Players } from "./sections/Players.tsx";
import { Rounds } from "./sections/Rounds.tsx";
import { Submit } from "./sections/Submit.tsx";
import type { SubmissionFailure } from "./sections/Submit.tsx";
import "./PlaytestFormPage.css";

export const PLAYTEST_DRAFT_KEY = "kiln-opening:playtest-draft-v3";

/** The browser's storage, or null (SSR, blocked storage). */
export function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The saved Form V3 draft, else a new one. */
export function loadPlaytestDraft(storage: Storage | null): PlaytestDraft {
  try {
    const serialized = storage?.getItem(PLAYTEST_DRAFT_KEY) ?? null;
    return serialized === null ? createPlaytestDraft() : restorePlaytestDraft(serialized) ?? createPlaytestDraft();
  } catch {
    return createPlaytestDraft();
  }
}

export function savePlaytestDraft(storage: Storage | null, draft: PlaytestDraft): void {
  try {
    storage?.setItem(PLAYTEST_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage may be blocked or full; the form keeps working without a saved draft.
  }
}

export function clearPlaytestDraft(storage: Storage | null): void {
  try {
    storage?.removeItem(PLAYTEST_DRAFT_KEY);
  } catch {
    // Ignored, as above.
  }
}

export interface PlaytestFormPageProps {
  /** A starting draft (tests, the gallery); default: the saved draft or a new one. */
  initialDraft?: PlaytestDraft;
  /** Default: `window.localStorage` when available. Pass null to keep nothing. */
  storage?: Storage | null;
  /** Default: `submitPlaytest` (the playtest Edge Function). */
  submit?: (payload: PlaytestSubmission) => Promise<PlaytestSubmitResult>;
}

const SECTION_KEYS = ["playtest.meta.title", "playtest.players.title", "playtest.rounds.title", "playtest.feedback.title"] as const;

export function PlaytestFormPage({ initialDraft, storage, submit = submitPlaytest }: PlaytestFormPageProps) {
  const t = useT();
  const store = storage === undefined ? browserStorage() : storage;
  const [draft, setDraft] = useState<PlaytestDraft>(() => initialDraft ?? loadPlaytestDraft(store));
  const [issues, setIssues] = useState<readonly PlaytestValidationIssue[]>([]);
  const [failure, setFailure] = useState<SubmissionFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const issuesRef = useRef<HTMLDivElement | null>(null);
  const sending = useRef(false);

  useEffect(() => {
    if (submittedId === null) savePlaytestDraft(store, draft);
  }, [store, draft, submittedId]);

  useEffect(() => {
    if (issues.length > 0) issuesRef.current?.focus();
  }, [issues]);

  const edit = (change: DraftEdit) => setDraft((current) => change(current));

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (sending.current) return;
    setFailure(null);
    const validation = validatePlaytestSubmission(submissionCandidate(draft));
    if (!validation.ok) {
      setIssues(validation.issues);
      return;
    }
    setIssues([]);
    sending.current = true;
    setBusy(true);
    try {
      const result = await submit(validation.value);
      if (!result.ok) {
        setFailure({ code: result.code, message: result.message });
        return;
      }
      clearPlaytestDraft(store);
      setSubmittedId(result.gameId);
    } catch {
      setFailure({ code: "SERVICE_UNAVAILABLE", message: "" });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const home = import.meta.env.BASE_URL;

  const masthead = (
    <header className="pt-masthead">
      <a className="pt-brand" href={home}>
        <strong>{t("playtest.brand")}</strong>
        <small>{t("playtest.record", { version: draft.rulesVersion })}</small>
      </a>
      <div className="pt-masthead-tools">
        <LanguageToggle />
        <a className="pt-link" href={home}>{t("playtest.backToGame")}</a>
      </div>
    </header>
  );

  if (submittedId !== null) {
    return (
      <div className="pt-shell">
        {masthead}
        <main className="pt-page pt-success" data-submitted="">
          <div className="pt-success-mark" aria-hidden="true">✓</div>
          <p className="pt-eyebrow">{t("playtest.success.eyebrow")}</p>
          <h1>{t("playtest.success.title")}</h1>
          <p>{t.rich("playtest.success.reference", { id: submittedId })}</p>
          <div className="pt-row">
            <Button
              variant="primary"
              onClick={() => {
                setDraft(createPlaytestDraft());
                setSubmittedId(null);
              }}
            >
              {t("playtest.success.another")}
            </Button>
            <a className="pt-link" href={home}>{t("playtest.success.return")}</a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="pt-shell">
      {masthead}
      <main className="pt-page">
        <section className="pt-hero" aria-labelledby="pt-title">
          <div>
            <p className="pt-eyebrow">{t("playtest.eyebrow")}</p>
            <h1 id="pt-title">{t("playtest.title")}</h1>
            <p>{t("playtest.lead")}</p>
          </div>
          <aside className="pt-hero-aside">
            <strong>{t("playtest.draftSaved")}</strong>
            <span>{t("playtest.draftHint")}</span>
            <span>{t("playtest.referenceHint")}</span>
          </aside>
        </section>

        <nav className="pt-nav" aria-label={t("playtest.sections")}>
          {SECTION_KEYS.map((key, index) => (
            <a key={key} href={`#pt-section-${String(index + 1)}`}>
              <span className="num" aria-hidden="true">{num(index + 1)}</span>
              <span>{t(key)}</span>
            </a>
          ))}
        </nav>

        <form className="pt-form" noValidate onSubmit={(event) => void onSubmit(event)} data-form="playtest-v3">
          <Meta index={1} draft={draft} edit={edit} />
          <Players index={2} draft={draft} edit={edit} />
          <Rounds index={3} draft={draft} edit={edit} />
          <Feedback index={4} draft={draft} edit={edit} />
          <Submit draft={draft} issues={issues} failure={failure} busy={busy} issuesRef={issuesRef} />
        </form>
      </main>
    </div>
  );
}
