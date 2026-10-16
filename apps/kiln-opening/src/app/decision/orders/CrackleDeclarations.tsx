/**
 * CrackleDeclarations (UI_V1.6.1_ARCHITECTURE §3.4, §5 gap 8; wireframe `decOrders` `.decl`).
 * Owner: B5.
 *
 * For a chosen ceramic group holding Crackle ceramics (Ge, L469): either the explicit **auto**
 * mode — the command omits `crackleDeclarations` and the engine searches — or a declaration per
 * Crackle ceramic (its own Decoration, or any one Decoration for this Order only). Every verdict
 * ("satisfies O39" / "does not satisfy O39") is `crackleDeclarationChecks`, the validator's own
 * matcher; the picker never re-implements an Order rule.
 */
import type { CeramicId, Decoration, OrderSelectionCheck } from "../../../game/index.ts";
import { decorationName } from "../../i18n/content.ts";
import { errorTextOptions, ruleErrorText } from "../../i18n/errors.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import type { Translator } from "../../i18n/translator.ts";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import type { EngineView, GameModel } from "../../state/model.ts";
import { ceramicWords } from "../firing/firingSupport.ts";
import { declaredDecoration } from "./orderCompletion.ts";
import type { CompletionAction, CompletionDraft, CompletionOptions } from "./orderCompletion.ts";

export interface CrackleDeclarationsProps {
  model: GameModel;
  engine: EngineView;
  draft: CompletionDraft;
  options: CompletionOptions;
  dispatch: (action: CompletionAction) => void;
  /** Input-name prefix, so two forms in one pane never share a radio group. */
  namePrefix?: string;
  step?: number;
}

const PRINTED = "printed";

/**
 * "✓ satisfies O39" / "✕ does not satisfy O39". `withReason` adds the engine's reason (the auto
 * mode's only verdict); per Decoration the verdict alone is enough, and the ConfirmBar shows the
 * reason for the declaration actually chosen.
 */
function Verdict({ check, orderId, engine, t, withReason = false }: { check: OrderSelectionCheck; orderId: string; engine: EngineView; t: Translator; withReason?: boolean }) {
  if (check.ok) {
    return (
      <span className="ord-verdict ord-verdict--ok">
        <span aria-hidden="true">✓ </span>
        {t("orders.decl.ok", { order: orderId })}
      </span>
    );
  }
  return (
    <span className="ord-verdict ord-verdict--no">
      <span aria-hidden="true">✕ </span>
      {t("orders.decl.no", { order: orderId })}
      {!withReason || check.error.code === "ORDER_REQUIREMENTS_NOT_MET" ? null : <span className="ord-verdict-why">{ruleErrorText(check.error, t, errorTextOptions(engine.view, t))}</span>}
    </span>
  );
}

export function CrackleDeclarations({ model, engine, draft, options, dispatch, namePrefix = "", step }: CrackleDeclarationsProps) {
  const t = useT();
  const crackle = options.crackle;
  const orderId = draft.orderId;
  if (crackle === null || orderId === null) return null;
  const mine = model.me?.finishedCeramicIds ?? [];
  const mode = draft.declarations === "auto" ? "auto" : "explicit";
  return (
    <div className="ord-decl">
      <OptionGroup
        legend={t("orders.decl.legend")}
        {...(step === undefined ? {} : { step })}
        name={`${namePrefix}crackleDeclarations`}
        value={mode}
        onChange={(value) => dispatch({ type: "declarationMode", mode: value === "explicit" ? "explicit" : "auto" })}
      >
        <OptionCard value="auto" title={t("orders.decl.auto")} description={t("orders.decl.autoDesc")} meta={<Verdict check={crackle.auto} orderId={orderId} engine={engine} t={t} withReason />} />
        <OptionCard value="explicit" title={t("orders.decl.explicit")} description={t("orders.decl.explicitDesc")} />
      </OptionGroup>
      {mode === "auto"
        ? null
        : crackle.ceramics.map((entry) => (
            <OptionGroup
              key={entry.ceramicId}
              legend={t("orders.decl.countsAs", { ceramic: ceramicWords(model, engine, entry.ceramicId, t, mine) })}
              name={`${namePrefix}decoration:${entry.ceramicId}`}
              value={declaredDecoration(draft, entry.ceramicId) ?? PRINTED}
              onChange={(value) => dispatch({ type: "declare", ceramicId: entry.ceramicId as CeramicId, decoration: value === PRINTED ? null : (value as Decoration) })}
            >
              {entry.options.map((option) => (
                <OptionCard
                  key={option.decoration ?? PRINTED}
                  value={option.decoration ?? PRINTED}
                  title={option.decoration === null ? t("orders.decl.printed", { decoration: decorationName(entry.printedDecoration, t.locale) }) : decorationName(option.decoration, t.locale)}
                  meta={<Verdict check={option.check} orderId={orderId} engine={engine} t={t} />}
                />
              ))}
            </OptionGroup>
          ))}
    </div>
  );
}
