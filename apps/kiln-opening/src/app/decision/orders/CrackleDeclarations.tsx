/**
 * CrackleDeclarations (UI_V1.6.1_ARCHITECTURE §3.4, §5 gap 8; wireframe `decOrders` `.decl`).
 * Owner: B5.
 *
 * For a chosen ceramic group holding Crackle ceramics (Ge, L470): either the explicit **auto**
 * mode — the command omits `crackleDeclarations` and the engine searches — or a declaration per
 * Crackle ceramic (its own Decoration, or any one Decoration for this Order only). Every verdict
 * ("satisfies O39" / "does not satisfy O39") is `crackleDeclarationChecks`, the validator's own
 * matcher; the picker never re-implements an Order rule. The auto mode names a Decoration only for
 * a Crackle ceramic whose own one does not complete the Order ("Counts as Carved" for a Plain
 * Crackle ceramic on S07 "Carved, Impressed or Painted"; nothing for a Painted one).
 */
import type { CeramicId, CrackleDeclarationChecks, Decoration, OrderSelectionCheck } from "../../../game/index.ts";
import { decorationName } from "../../i18n/content.ts";
import { list } from "../../i18n/format.ts";
import { errorTextOptions, ruleErrorText } from "../../i18n/errors.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import type { Translator } from "../../i18n/translator.ts";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import type { EngineView, GameModel } from "../../state/model.ts";
import { ceramicWords } from "../firing/firingSupport.ts";
import { countedDecorations, declaredDecoration } from "./orderCompletion.ts";
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

/**
 * What the auto mode needs a wildcard for (`countedDecorations`): "Counts as Carved." when the
 * group holds one Crackle ceramic, or each ceramic that needs its wildcard with the Decoration
 * it counts as; null when every Crackle ceramic completes the Order with its own Decoration, or
 * the auto mode completes nothing.
 */
function autoRecord(crackle: CrackleDeclarationChecks, counted: ReadonlyMap<CeramicId, Decoration>, model: GameModel, engine: EngineView, t: Translator): string | null {
  if (!crackle.auto.ok || counted.size === 0) return null;
  const entries = [...counted];
  const [only] = entries;
  if (crackle.ceramics.length === 1 && only !== undefined) return t("orders.decl.autoAs", { decoration: decorationName(only[1], t.locale) });
  const mine = model.me?.finishedCeramicIds ?? [];
  const items = entries.map(([ceramicId, decoration]) => t("orders.ceramicAs", { ceramic: ceramicWords(model, engine, ceramicId, t, mine), decoration: decorationName(decoration, t.locale) }));
  return t("orders.decl.autoAsList", { list: list(items, t.locale) });
}

export function CrackleDeclarations({ model, engine, draft, options, dispatch, namePrefix = "", step }: CrackleDeclarationsProps) {
  const t = useT();
  const crackle = options.crackle;
  const orderId = draft.orderId;
  if (crackle === null || orderId === null) return null;
  const mine = model.me?.finishedCeramicIds ?? [];
  const mode = draft.declarations === "auto" ? "auto" : "explicit";
  // The auto choice says what it needs a wildcard for, also while the explicit mode is chosen.
  const autoCounted = countedDecorations({ ...draft, declarations: "auto" }, { ...options, match: crackle.auto.ok ? crackle.auto.match : null }, engine);
  const recorded = autoRecord(crackle, autoCounted, model, engine, t);
  return (
    <div className="ord-decl">
      <OptionGroup
        legend={t("orders.decl.legend")}
        {...(step === undefined ? {} : { step })}
        name={`${namePrefix}crackleDeclarations`}
        value={mode}
        onChange={(value) => dispatch({ type: "declarationMode", mode: value === "explicit" ? "explicit" : "auto" })}
      >
        <OptionCard
          value="auto"
          title={t("orders.decl.auto")}
          description={
            recorded === null ? (
              t("orders.decl.autoDesc")
            ) : (
              <>
                {t("orders.decl.autoDesc")} <span className="ord-decl-record">{recorded}</span>
              </>
            )
          }
          meta={<Verdict check={crackle.auto} orderId={orderId} engine={engine} t={t} withReason />}
        />
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
