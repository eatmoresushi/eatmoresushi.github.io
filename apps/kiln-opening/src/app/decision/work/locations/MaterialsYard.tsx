/**
 * MaterialsYard (UI_V1.6.1_ARCHITECTURE §3.4; wireframe `subEditor` materials_yard). Owner: B4.
 *
 * The Clay/Wood split as radio pills (no split is pre-selected) and Prepared Clay (T17) with its
 * Shape and Decoration from the selector's legal pairs. Renders only
 * from `options`; the delta row shows the engine quote's outcome.
 */
import { decorationName, shapeName, techName } from "../../../i18n/content.ts";
import { useT } from "../../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../../kit/OptionCard.tsx";
import { OptionGroup } from "../../../kit/OptionGroup.tsx";
import { FormNote, ResourceDelta, useRuleErrorText } from "../pieces.tsx";
import { RulesDetail } from "../../../rules/RulesDetail.tsx";
import type { MaterialsYardAction, MaterialsYardDraft, MaterialsYardOptions } from "./MaterialsYard.draft.ts";
import type { LocationEditorProps } from "./editor.ts";

export type MaterialsYardProps = LocationEditorProps<MaterialsYardDraft, MaterialsYardAction, MaterialsYardOptions>;

export function MaterialsYard({ draft, options, dispatch, context }: MaterialsYardProps) {
  const t = useT();
  const errorText = useRuleErrorText();
  const prepared = options.preparedClay;
  const quote = options.quote;
  return (
    <div className="b4-sub" data-location="materials_yard">
      <OptionGroup
        legend={t("work.my.split", { n: options.resources })}
        name="clay"
        layout="pills"
        value={draft.clay === null ? null : String(draft.clay)}
        onChange={(value) => dispatch({ type: "clay", clay: Number(value) })}
      >
        {options.splits.map((split) => (
          <OptionCard key={split.clay} variant="pill" value={String(split.clay)} title={t("work.my.splitOption", { clay: split.clay, wood: split.wood })} />
        ))}
      </OptionGroup>
      {prepared === null ? null : (
        <div className="b4-sub-block">
          <OptionCard
            type="checkbox"
            name="preparedClay"
            value="true"
            checked={draft.preparedClay !== null}
            onChange={(_, checked) => dispatch({ type: "preparedClay", on: checked })}
            disabled={prepared.shapes.length === 0}
            title={t("work.my.preparedClay", { tech: techName(prepared.techId, t.locale) })}
          >
            <RulesDetail subject={{ kind: "tech", id: prepared.techId }} />
          </OptionCard>
          {draft.preparedClay === null ? null : (
            <>
              <OptionGroup
                legend={t("work.my.shape")}
                name="preparedClay.shape"
                layout="pills"
                value={draft.preparedClay.shape}
                onChange={(value) => {
                  const shape = prepared.shapes.find((candidate) => candidate === value);
                  if (shape !== undefined) dispatch({ type: "pcShape", shape });
                }}
              >
                {prepared.shapes.map((shape) => (
                  <OptionCard key={shape} variant="pill" value={shape} title={shapeName(shape, t.locale)} />
                ))}
              </OptionGroup>
              {draft.preparedClay.shape === null ? null : (
                <OptionGroup
                  legend={t("work.my.decoration")}
                  name="preparedClay.decoration"
                  layout="pills"
                  value={draft.preparedClay.decoration}
                  onChange={(value) => {
                    const decoration = prepared.decorations.find((candidate) => candidate === value);
                    if (decoration !== undefined) dispatch({ type: "pcDecoration", decoration });
                  }}
                >
                  {prepared.decorations.map((decoration) => (
                    <OptionCard key={decoration} variant="pill" value={decoration} title={decorationName(decoration, t.locale)} />
                  ))}
                </OptionGroup>
              )}
            </>
          )}
        </div>
      )}
      {quote !== null && !quote.ok && quote.error !== null ? <FormNote tone="error">{errorText(quote.error)}</FormNote> : null}
      <ResourceDelta before={context.me.resources} after={options.after} />
    </div>
  );
}

