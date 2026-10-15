/**
 * ConfirmBar (UI_V1.6.1_ARCHITECTURE §3.6, §8.2; wireframe `pane` `confirm` block). Frozen after
 * phase A; changes go through B6.
 *
 * - The summary sentence is the draft model's `summary()` (`workSummary`, `completeSum`, …), a
 *   `RichMessage` formatted with `t.rich`, so player names are never markup.
 * - Confirm (`type="submit"`, `data-action="confirm"`) is disabled until `build(draft)` returns a
 *   command that passes the local check (`validateAction`, or a Contribution's affordability);
 *   the engine's reason is shown inline and named by `aria-describedby`. The server stays
 *   authoritative (K4: no optimistic state).
 * - While sending, Confirm stays focused with `aria-busy`, and its handler ignores a second
 *   submit; only `.pane-scroll` above is `inert` (U3).
 * - The alternative button (`data-action="alt"`: End turn, End, Decline…) comes from the window
 *   spec; without one, Clear returns the draft to its initial state.
 * - A rejection from the server is stored as a code and formatted here at render time, so a
 *   language switch re-renders it (§6.1).
 */
import { useCallback, useId } from "react";
import type { AuthoritativeCommand, GameRuleError } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { errorTextOptions, ruleErrorText, storedErrorText } from "../i18n/errors.ts";
import type { RichMessage, Translator } from "../i18n/translator.ts";
import { Button } from "../kit/Button.tsx";
import { windowDraftKey } from "../state/decisionWindow.ts";
import type { WindowAlternative, WindowText } from "../state/draftStore.ts";
import { useDecision, useDraft, useEngineView, useGame, useGameContext } from "../state/hooks.ts";
import "./ConfirmBar.css";

/** Formats a window text (a stored message or a deferred formatter) as React nodes. */
export function renderWindowText(t: Translator, text: WindowText) {
  return typeof text === "function" ? text(t) : t.richMessage(text);
}

/** Formats a window text as plain text (attributes, the sheet strip's title). */
export function windowTextString(t: Translator, text: WindowText): string {
  return typeof text === "function" ? text(t) : t.message(text);
}

export interface ConfirmState {
  /** The command the draft builds now, or null while it is incomplete. */
  command: AuthoritativeCommand | null;
  /** The local check's verdict on `command`; Confirm is disabled while it is set. */
  check: GameRuleError | null;
  summary: RichMessage | null;
  alternative: WindowAlternative | null;
  sending: boolean;
  /** Sends `command` if it is ready and nothing is in flight. */
  confirm(): void;
  /** Sends the alternative command. */
  sendAlternative(): void;
  /** Returns the draft to its initial state. */
  clear(): void;
}

/** The ConfirmBar's state for the open window; `DecisionPane` uses `confirm` as the form submit. */
export function useConfirmState(): ConfirmState {
  const model = useGame();
  const engine = useEngineView();
  const decision = useDecision();
  const { drafts } = useGameContext();
  const [draft] = useDraft<unknown>();
  const { spec, sending, validate, submit } = decision;
  const command = spec.draft.build(draft, model, engine);
  const check = command === null ? null : validate(command);
  const summary = spec.draft.summary(draft, model, engine);
  const alternative = spec.alternative?.(draft, model, engine) ?? null;
  const confirm = useCallback(() => {
    if (sending || command === null || check !== null) return;
    void submit(command);
  }, [sending, command, check, submit]);
  const sendAlternative = useCallback(() => {
    if (sending || alternative === null) return;
    void submit(alternative.command);
  }, [sending, alternative, submit]);
  const key = windowDraftKey(model.window);
  const clear = useCallback(() => {
    if (sending || drafts.storedKey() !== key) return;
    drafts.reset();
  }, [sending, drafts, key]);
  return { command, check, summary, alternative, sending, confirm, sendAlternative, clear };
}

export interface ConfirmBarProps {
  state: ConfirmState;
}

export function ConfirmBar({ state }: ConfirmBarProps) {
  const t = useT();
  const { view } = useEngineView();
  const decision = useDecision();
  const reasonId = useId();
  const options = errorTextOptions(view, t);
  const checkText = state.check === null ? null : ruleErrorText(state.check, t, options);
  const serverText = decision.error === null ? null : storedErrorText(decision.error, t, options);
  const ready = state.command !== null && state.check === null;
  return (
    <div className="confirm" data-confirm="">
      {state.summary === null ? null : <p className="confirm-summary">{t.richMessage(state.summary)}</p>}
      {checkText === null && serverText === null ? null : (
        <p className="confirm-error" id={reasonId}>
          {checkText ?? serverText}
        </p>
      )}
      <div className="confirm-buttons">
        {state.alternative === null ? (
          <Button onClick={state.clear} disabled={state.sending}>
            {t("common.verb.clear")}
          </Button>
        ) : (
          <Button action="alt" onClick={state.sendAlternative} busy={state.sending}>
            {renderWindowText(t, state.alternative.label)}
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          action="confirm"
          block
          disabled={!ready}
          busy={state.sending}
          aria-describedby={checkText === null && serverText === null ? undefined : reasonId}
        >
          {state.sending ? t("common.status.sending") : t("common.verb.confirm")}
        </Button>
      </div>
    </div>
  );
}
