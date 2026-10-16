/**
 * CanalBarge (UI_V1.6.1_ARCHITECTURE §3.4, §4.3). Owner: B5. Composed by B4's `ActionWindow`
 * before and after the worker action: `<CanalBarge source="before_action" | "after_action" />`.
 *
 * Canal Barge (T23, L631, R6): once per round, before or after one of your worker actions,
 * complete 1 held Order, for every completion effect. Its draft model is `canalBargeDraft` (the
 * expressibility helper's Canal Barge form, §9.4). The form has two modes:
 * - **composed** (the work window): B4's work draft holds the Canal Barge draft as its
 *   `canalBarge` sub-draft and provides it through `useComposedCanalBarge()` (B4's
 *   `composedForms.tsx`, change request B4-2). The form reads and changes that sub-draft only;
 *   the window's ConfirmBar builds, checks and sends `USE_CANAL_BARGE` (§3.6) and shows the
 *   summary, so the form has no button of its own. Input names are the command's fields
 *   (`orderId`, `ceramicIds`, …; §9.6).
 * - **standalone** (no composition, e.g. the gallery): the form keeps the draft locally,
 *   revalidated against every new view, and its own button sends `USE_CANAL_BARGE` through
 *   `useDecision().submit` after the same local check as ConfirmBar (`validate`), showing the
 *   engine's reason while it fails. It is not the form's submit button, so Enter in an enclosing
 *   form still confirms that form. Input names carry a `canalBarge.` prefix.
 *
 * Nothing renders unless the viewer owns Canal Barge. Used this round, or no completable held
 * Order: a one-line note.
 */
import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { errorTextOptions, ruleErrorText } from "../../i18n/errors.ts";
import { techName } from "../../i18n/content.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { Button } from "../../kit/Button.tsx";
import { Disclosure } from "../../kit/Disclosure.tsx";
import { REVALIDATE } from "../../state/draftStore.ts";
import { useDecision, useEngineView, useGame } from "../../state/hooks.ts";
import type { EngineView, GameModel } from "../../state/model.ts";
import { B5_TECHS } from "../firing/firingSupport.ts";
import { Note } from "../firing/WindowParts.tsx";
import { useComposedCanalBarge } from "../composition.tsx";
import { canalBargeDraft } from "./canalBargeDraft.ts";
import type { CanalBargeAction, CanalBargeDraft } from "./canalBargeDraft.ts";
import type { CompletionOptions } from "./orderCompletion.ts";
import { OrderCompletionPicker } from "./OrderCompletionPicker.tsx";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
import "./Orders.css";

export interface CanalBargeProps {
  /** Which window composes it. */
  source: "before_action" | "after_action";
}

interface BargeBodyProps {
  model: GameModel;
  engine: EngineView;
  draft: CanalBargeDraft;
  options: CompletionOptions;
  dispatch: (action: CanalBargeAction) => void;
  ready: boolean;
  namePrefix: string;
  /** The standalone form's own send row; none when composed. */
  actions?: ReactNode;
}

/** The rules details, the "used" / "none" notes, or the picker. */
function BargeBody({ model, engine, draft, options, dispatch, ready, namePrefix, actions }: BargeBodyProps) {
  const t = useT();
  const anyCompletable = options.orders.some((order) => order.completable);
  return (
    <div className="dw-form">
      <span className="dw-row">
        <RulesDetail subject={{ kind: "tech", id: B5_TECHS.canalBarge }} look="name" />
      </span>
      {!ready ? (
        <Note>{t("orders.barge.used")}</Note>
      ) : !anyCompletable ? (
        <Note>{t("orders.barge.none")}</Note>
      ) : (
        <>
          <OrderCompletionPicker model={model} engine={engine} draft={draft} options={options} dispatch={dispatch} namePrefix={namePrefix} />
          {actions}
        </>
      )}
    </div>
  );
}

/** Inside the work window: the work draft's `canalBarge` sub-draft; ConfirmBar sends. */
function ComposedCanalBarge({ source }: CanalBargeProps) {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const composed = useComposedCanalBarge();
  const owned = model.me?.techs.find((tech) => tech.techId === B5_TECHS.canalBarge) ?? null;
  if (composed === null || owned === null) return null;
  const draft = composed.draft;
  const options = composed.options ?? canalBargeDraft.options(draft, model, engine);
  return (
    <div className="ord-barge" data-form="canal-barge" data-source={source} role="group" aria-label={t("orders.barge.legend", { tech: techName(B5_TECHS.canalBarge, t.locale) })}>
      <BargeBody model={model} engine={engine} draft={draft} options={options} dispatch={composed.dispatch} ready={owned.ready} namePrefix="" />
    </div>
  );
}

/** Outside the work window: a local draft and its own send button. */
function StandaloneCanalBarge({ source }: CanalBargeProps) {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const decision = useDecision();
  const [stored, setStored] = useState<CanalBargeDraft | null>(null);
  const draft = useMemo(
    () => (stored === null ? canalBargeDraft.initial(model, engine) : canalBargeDraft.reduce(stored, REVALIDATE, model, engine)),
    [stored, model, engine],
  );
  const dispatch = useCallback(
    (action: CanalBargeAction) => setStored(canalBargeDraft.reduce(draft, action, model, engine)),
    [draft, model, engine],
  );
  const owned = model.me?.techs.find((tech) => tech.techId === B5_TECHS.canalBarge) ?? null;
  if (owned === null) return null;
  const name = techName(B5_TECHS.canalBarge, t.locale);
  const options = canalBargeDraft.options(draft, model, engine);
  const command = canalBargeDraft.build(draft, model, engine);
  const check = command === null ? null : decision.validate(command);
  const summary = canalBargeDraft.summary(draft, model, engine);
  const anyCompletable = options.orders.some((order) => order.completable);
  const send = () => {
    if (decision.sending || command === null || check !== null) return;
    void decision.submit(command).then((outcome) => {
      if (outcome.kind === "success") setStored(null);
    });
  };
  const actions = (
    <div className="ord-barge-actions">
      {summary === null ? null : <p className="dw-note dw-note--private">{t.richMessage(summary)}</p>}
      {check === null ? null : <p className="ord-barge-error">{ruleErrorText(check, t, errorTextOptions(engine.view, t))}</p>}
      <Button variant="secondary" disabled={command === null || check !== null} busy={decision.sending} onClick={send} data-form-action="canal-barge">
        {t("orders.barge.button", { tech: name })}
      </Button>
    </div>
  );
  return (
    <div className="ord-barge" data-form="canal-barge" data-source={source}>
      <Disclosure summary={t("orders.barge.legend", { tech: name })} defaultOpen={source === "after_action" && owned.ready && anyCompletable}>
        <BargeBody model={model} engine={engine} draft={draft} options={options} dispatch={dispatch} ready={owned.ready} namePrefix="canalBarge." actions={actions} />
      </Disclosure>
    </div>
  );
}

export function CanalBarge({ source }: CanalBargeProps) {
  return useComposedCanalBarge() === null ? <StandaloneCanalBarge source={source} /> : <ComposedCanalBarge source={source} />;
}
