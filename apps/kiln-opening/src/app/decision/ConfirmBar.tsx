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
 * - **The split Confirm (owner UI decision D21, DELTA §16.24).** On the action's last step the
 *   window spec's `confirmSplit` names two visible buttons, no hidden menu: the primary one (Enter,
 *   "Place · end turn") sends the command with `endTurn: true`, so the turn ends in that one
 *   command; the secondary one (`data-action="confirm-stay"`, Shift+Enter, "Place, then free
 *   actions") sends it without the field. Both name the same choice in full for a screen reader
 *   (`aria-keyshortcuts` for the keys, which `DecisionPane` handles), and a line under them says the
 *   keys to whoever has a keyboard (`.confirm-keys`, not on touch screens). With no secondary button
 *   (the after-action step cannot open) Shift+Enter also sends the command without the field, and
 *   the turn ends by itself. The window's private hint (`confirmHint`, "You can deliver this now")
 *   sits above them.
 * - While sending, Confirm stays focused with `aria-busy`, and its handler ignores a second
 *   submit; only `.pane-scroll` above is `inert` (U3).
 * - The alternative button (`data-action="alt"`: End turn, Done, Decline…) comes from the window
 *   spec; without one, Clear returns the draft to its initial state. In a window that may simply
 *   end with nothing chosen (`alternativeOnly`) it is the only button, the primary one; Enter
 *   presses it from anywhere in the pane only when the list has nothing to lose
 *   (`alternativeTakesEnter`, `DecisionPane`).
 * - **Short screens (`.confirm-pin`, §7.3):** what must stay in view while the fields scroll is
 *   the error, the hint and the buttons. Elsewhere the wrapper has no box of its own.
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
import type { ConfirmSplit, WindowAlternative, WindowText } from "../state/draftStore.ts";
import { useDecision, useDraft, useEngineView, useGame, useGameContext } from "../state/hooks.ts";
import { stayCommand, withEndTurn } from "./endTurn.ts";
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
  /** The alternative is the only button (nothing is chosen in a window that may simply end). */
  alternativeOnly: boolean;
  /** That only button takes Enter from anywhere in the pane: pressing it gives nothing up. */
  alternativeTakesEnter: boolean;
  /** The split Confirm of this draft (D21), or null for a plain Confirm. */
  split: ConfirmSplit | null;
  /** The window's private line beside Confirm (D21), or null. */
  hint: WindowText | null;
  sending: boolean;
  /** Sends `command` if it is ready and nothing is in flight: with `endTurn: true` when split. */
  confirm(): void;
  /** Sends `command` without ending the turn (the split's secondary button, Shift+Enter). */
  confirmStay(): void;
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
  const alternativeOnly = alternative !== null && spec.alternativeOnly?.(draft, model, engine) === true;
  const alternativeTakesEnter = alternativeOnly && spec.alternativeTakesEnter?.(draft, model, engine) === true;
  const split = spec.confirmSplit?.(draft, model, engine) ?? null;
  const hint = spec.confirmHint?.(draft, model, engine) ?? null;
  const confirm = useCallback(() => {
    if (sending || command === null || check !== null) return;
    void submit(split === null ? command : withEndTurn(command, true));
  }, [sending, command, check, submit, split]);
  const confirmStay = useCallback(() => {
    if (sending || command === null || check !== null) return;
    void submit(split === null ? command : stayCommand(command, engine));
  }, [sending, command, check, submit, split, engine]);
  const sendAlternative = useCallback(() => {
    if (sending || alternative === null) return;
    void submit(alternative.command);
  }, [sending, alternative, submit]);
  const key = windowDraftKey(model.window);
  const clear = useCallback(() => {
    if (sending || drafts.storedKey() !== key) return;
    drafts.reset();
  }, [sending, drafts, key]);
  return { command, check, summary, alternative, alternativeOnly, alternativeTakesEnter, split, hint, sending, confirm, confirmStay, sendAlternative, clear };
}

export interface ConfirmBarProps {
  state: ConfirmState;
}

export function ConfirmBar({ state }: ConfirmBarProps) {
  const t = useT();
  const { view } = useEngineView();
  const decision = useDecision();
  const reasonId = useId();
  const hintId = useId();
  const options = errorTextOptions(view, t);
  const checkText = state.check === null ? null : ruleErrorText(state.check, t, options);
  const serverText = decision.error === null ? null : storedErrorText(decision.error, t, options);
  const ready = state.command !== null && state.check === null;
  const reason = checkText === null && serverText === null ? null : reasonId;
  const hint = state.hint === null ? null : hintId;
  const describedBy = [reason, hint].filter((id) => id !== null).join(" ") || undefined;
  const alternative =
    state.alternative === null ? (
      <Button onClick={state.clear} disabled={state.sending}>
        {t("common.verb.clear")}
      </Button>
    ) : (
      <Button
        action="alt"
        variant={state.alternativeOnly ? "primary" : "secondary"}
        block={state.alternativeOnly}
        onClick={state.sendAlternative}
        busy={state.sending}
        {...(state.alternativeTakesEnter ? { "aria-keyshortcuts": "Enter" } : {})}
      >
        {renderWindowText(t, state.alternative.label)}
      </Button>
    );
  const sendingText = state.sending ? t("common.status.sending") : null;
  return (
    <div className="confirm" data-confirm="">
      {state.summary === null ? null : <p className="confirm-summary">{t.richMessage(state.summary)}</p>}
      <div className="confirm-pin">
        {checkText === null && serverText === null ? null : (
          <p className="confirm-error" id={reasonId}>
            {checkText ?? serverText}
          </p>
        )}
        {state.hint === null ? null : (
          <p className="confirm-hint" id={hintId} data-confirm-hint="">
            {renderWindowText(t, state.hint)}
          </p>
        )}
        {state.alternativeOnly ? (
          <div className="confirm-buttons">{alternative}</div>
        ) : state.split === null ? (
          <div className="confirm-buttons">
            {alternative}
            <Button type="submit" variant="primary" action="confirm" block disabled={!ready} busy={state.sending} aria-describedby={describedBy} aria-keyshortcuts="Enter">
              {sendingText ?? t("common.verb.confirm")}
            </Button>
          </div>
        ) : (
          <div className="confirm-buttons confirm-buttons--split">
            <Button type="submit" variant="primary" action="confirm" block disabled={!ready} busy={state.sending} aria-describedby={describedBy} aria-keyshortcuts="Enter">
              {sendingText ?? renderWindowText(t, state.split.end)}
            </Button>
            {state.split.stay === null ? null : (
              <Button action="confirm-stay" disabled={!ready} busy={state.sending} onClick={state.confirmStay} aria-describedby={describedBy} aria-keyshortcuts="Shift+Enter">
                {renderWindowText(t, state.split.stay)}
              </Button>
            )}
            {alternative}
          </div>
        )}
      </div>
      {/* For sighted keyboard players (the buttons' `aria-keyshortcuts` tell a screen reader). */}
      {state.alternativeOnly || state.split === null || state.split.stay === null ? null : (
        <p className="confirm-keys" aria-hidden="true">
          {t("common.confirm.keys")}
        </p>
      )}
    </div>
  );
}
