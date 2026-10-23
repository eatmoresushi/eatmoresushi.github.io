/**
 * FormDecorate (UI_V1.6.1_ARCHITECTURE §3.4, §5 gap 6; wireframe `subEditor` form_decorate).
 * Owner: B4.
 *
 * Shape and Decoration pills per vessel (each Shape with a vessel's printed cost, its Clay and 2
 * Coins whatever the Decoration, rev. 4 L183, change 30; a Decoration has no cost of its own; a
 * choice the engine does not allow now is unavailable, with the engine's reason), a second vessel for the Shifu
 * when a two-vessel command is legal, the Workshop discounts the engine offers (Large Throwing Wheel, Decorator's Kit),
 * Ding's extra vessel, and the engine's live quote with its lines (Ding's Clay and Coin as one row
 * naming the Shape it copies, `quoteRows`), total, reason and the resulting resources.
 */
import type { CostLine, Decoration, GameRuleError, Shape } from "../../../../game/index.ts";
import { decorationName, kilnText, shapeName, techName, workerKindName } from "../../../i18n/content.ts";
import { useT } from "../../../i18n/I18nProvider.tsx";
import type { Translator } from "../../../i18n/translator.ts";
import { OptionCard } from "../../../kit/OptionCard.tsx";
import { OptionGroup } from "../../../kit/OptionGroup.tsx";
import { CeramicArt } from "../../../pieces/CeramicArt.tsx";
import { FormNote, ResourceDelta, useRuleErrorText } from "../pieces.tsx";
import { RulesDetail } from "../../../rules/RulesDetail.tsx";
import { quoteRows } from "./FormDecorate.draft.ts";
import type { FormDecorateAction, FormDecorateDraft, FormDecorateOptions } from "./FormDecorate.draft.ts";
import type { LocationEditorProps } from "./editor.ts";
import { amountText, amountsText } from "./shared.ts";

export type FormDecorateProps = LocationEditorProps<FormDecorateDraft, FormDecorateAction, FormDecorateOptions>;

const NONE = "none";

function lineLabel(line: CostLine, draft: FormDecorateDraft, t: Translator): string {
  const vessel = line.itemIndex === null ? undefined : draft.vessels[line.itemIndex];
  switch (line.kind) {
    case "shape_clay":
      return vessel?.shape == null ? t("work.fd.line.other") : shapeName(vessel.shape, t.locale);
    case "vessel_coins":
      return vessel?.shape == null ? t("work.fd.line.other") : t("work.fd.line.vesselCoins", { shape: shapeName(vessel.shape, t.locale) });
    case "shifu_discount":
      return t("work.fd.line.shifuDiscount", { shifu: workerKindName("shifu", t.locale) });
    case "decorators_kit":
      return t("work.fd.line.tech", { tech: techName("T16", t.locale) });
    case "large_throwing_wheel":
      return t("work.fd.line.tech", { tech: techName("T01", t.locale) });
    case "prepared_clay_surcharge":
      return t("work.fd.line.surcharge", { tech: techName("T17", t.locale) });
    default:
      return t("work.fd.line.other");
  }
}

export function FormDecorate({ draft, options, dispatch, context }: FormDecorateProps) {
  const t = useT();
  const errorText = useRuleErrorText();
  const two = draft.vessels.length > 1;
  const quote = options.quote;
  const shapeOf = (value: string): Shape | undefined => options.shapes.find((entry) => entry.shape === value)?.shape;
  const decorationOf = (value: string): Decoration | undefined => options.decorations.find((entry) => entry.decoration === value)?.decoration;
  const reasonOf = (error: GameRuleError | null) => (error === null ? undefined : errorText(error));
  return (
    <div className="b4-sub" data-location="form_decorate">
      {draft.vessels.map((vessel, index) => {
        const choices = options.vessels[index];
        if (choices === undefined) return null;
        return (
          <div key={index} className="b4-sub-block" data-vessel={index}>
            {two ? <p className="b4-sub-title">{t("work.fd.vesselN", { n: index + 1 })}</p> : null}
            <OptionGroup
              legend={t("work.fd.shape")}
              name={`vessels.${index}.shape`}
              layout="pills"
              value={vessel.shape}
              onChange={(value) => {
                const shape = shapeOf(value);
                if (shape !== undefined) dispatch({ type: "shape", index, shape });
              }}
            >
              {choices.shapes.map((entry) => (
                <OptionCard
                  key={entry.shape}
                  variant="pill"
                  value={entry.shape}
                  disabled={!entry.available}
                  reason={entry.available ? undefined : reasonOf(entry.reason)}
                  title={shapeName(entry.shape, t.locale)}
                  description={
                    entry.clay === null
                      ? undefined
                      : options.vesselCoins === null
                        ? amountText(t, "clay", entry.clay)
                        : t("work.fd.vesselCost", { clay: amountText(t, "clay", entry.clay), coins: amountText(t, "coins", options.vesselCoins) })
                  }
                  leading={<CeramicArt shape={entry.shape} decoration={vessel.decoration ?? "plain"} size={22} />}
                />
              ))}
            </OptionGroup>
            <OptionGroup
              legend={t("work.fd.decoration")}
              description={index === 0 ? t("work.fd.decorationFree") : undefined}
              name={`vessels.${index}.decoration`}
              layout="pills"
              value={vessel.decoration}
              onChange={(value) => {
                const decoration = decorationOf(value);
                if (decoration !== undefined) dispatch({ type: "decoration", index, decoration });
              }}
            >
              {choices.decorations.map((entry) => (
                <OptionCard
                  key={entry.decoration}
                  variant="pill"
                  value={entry.decoration}
                  disabled={!entry.available}
                  reason={entry.available ? undefined : reasonOf(entry.reason)}
                  title={decorationName(entry.decoration, t.locale)}
                />
              ))}
            </OptionGroup>
          </div>
        );
      })}
      {options.second === null ? null : (
        <OptionCard
          type="checkbox"
          name="secondVessel"
          value="true"
          checked={two}
          disabled={!options.second.available}
          reason={options.second.available ? undefined : reasonOf(options.second.reason)}
          onChange={(_, checked) => dispatch({ type: "second", on: checked })}
          title={t("work.fd.second")}
        />
      )}
      {options.wheel === null && options.kit === null ? null : (
        <div className="b4-sub-block">
          <p className="b4-sub-title">{t("work.fd.discounts")}</p>
          {options.wheel === null ? null : (
            <OptionCard
              type="checkbox"
              name="useLargeThrowingWheel"
              value="true"
              checked={draft.wheel}
              onChange={(_, checked) => dispatch({ type: "wheel", on: checked })}
              title={t("work.fd.wheel", { tech: techName(options.wheel.techId, t.locale) })}
            >
              <RulesDetail subject={{ kind: "tech", id: options.wheel.techId }} />
            </OptionCard>
          )}
          {options.kit === null ? null : (
            <OptionGroup
              legend={techName(options.kit.techId, t.locale)}
              name="decoratorsKitVesselIndex"
              layout="pills"
              value={draft.kitIndex === null ? NONE : String(draft.kitIndex)}
              onChange={(value) => dispatch({ type: "kit", index: value === NONE ? null : Number(value) })}
            >
              <OptionCard variant="pill" value={NONE} title={t("common.verb.decline")} />
              {options.kit.indexes.map((index) => (
                <OptionCard key={index} variant="pill" value={String(index)} title={t("work.fd.kit", { tech: techName(options.kit?.techId ?? "T16", t.locale), n: index + 1 })} />
              ))}
            </OptionGroup>
          )}
          {options.kit === null ? null : <RulesDetail subject={{ kind: "tech", id: options.kit.techId }} />}
        </div>
      )}
      {options.ding === null ? null : (
        <div className="b4-sub-block">
          <OptionCard
            type="checkbox"
            name="dingExtra"
            value="true"
            checked={draft.ding !== null}
            onChange={(_, checked) => dispatch({ type: "ding", on: checked })}
            title={t("work.fd.ding", { ability: kilnText(options.ding.kilnId, t.locale).abilityName })}
          >
            <RulesDetail subject={{ kind: "kiln", id: options.ding.kilnId }} />
          </OptionCard>
          {draft.ding === null ? null : (
            <>
              {options.ding.indexes.length > 1 ? (
                <OptionGroup
                  legend={t("work.fd.vesselN", { n: (draft.ding.index ?? 0) + 1 })}
                  hideLegend
                  name="dingExtra.copyOfVesselIndex"
                  layout="pills"
                  value={draft.ding.index === null ? null : String(draft.ding.index)}
                  onChange={(value) => dispatch({ type: "dingIndex", index: Number(value) })}
                >
                  {options.ding.indexes.map((index) => (
                    <OptionCard key={index} variant="pill" value={String(index)} title={t("work.fd.dingCopy", { n: index + 1 })} />
                  ))}
                </OptionGroup>
              ) : null}
              <OptionGroup
                legend={t("work.fd.dingDecoration")}
                name="dingExtra.decoration"
                layout="pills"
                value={draft.ding.decoration}
                onChange={(value) => {
                  const decoration = options.ding?.decorations.find((candidate) => candidate.decoration === value)?.decoration;
                  if (decoration !== undefined) dispatch({ type: "dingDecoration", decoration });
                }}
              >
                {options.ding.decorations.map((entry) => (
                  <OptionCard
                    key={entry.decoration}
                    variant="pill"
                    value={entry.decoration}
                    disabled={!entry.available}
                    reason={entry.available ? undefined : reasonOf(entry.reason)}
                    title={decorationName(entry.decoration, t.locale)}
                  />
                ))}
              </OptionGroup>
            </>
          )}
        </div>
      )}
      {quote === null ? null : (
        <div className="b4-quote" role="group" aria-label={t("work.fd.quote")}>
          {quoteRows(quote, draft).map((row, index) =>
            row.kind === "ding" ? (
              <div key={index} className="b4-quote-line" data-quote-row="ding">
                <span>
                  {row.shape === null
                    ? kilnText("DI", t.locale).abilityName
                    : t("work.fd.line.ding", { ability: kilnText("DI", t.locale).abilityName, shape: shapeName(row.shape, t.locale) })}
                </span>
                <span className="num">{amountsText(t, row.amounts)}</span>
              </div>
            ) : (
              <div key={index} className="b4-quote-line">
                <span>{lineLabel(row.line, draft, t)}</span>
                <span className="num">{row.line.amount < 0 ? t("work.fd.minus", { amount: amountText(t, row.line.resource, Math.abs(row.line.amount)) }) : amountText(t, row.line.resource, row.line.amount)}</span>
              </div>
            ),
          )}
          <div className="b4-quote-line b4-quote-total">
            <span>{t("work.fd.total")}</span>
            <span className="num">{amountsText(t, quote.pay)}</span>
          </div>
        </div>
      )}
      {quote !== null && !quote.ok && quote.error !== null ? <FormNote tone="error">{errorText(quote.error)}</FormNote> : null}
      <ResourceDelta before={context.me.resources} after={options.after} />
    </div>
  );
}
