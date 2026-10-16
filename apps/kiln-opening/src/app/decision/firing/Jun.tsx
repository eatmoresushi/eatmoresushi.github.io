/**
 * Jun (UI_V1.6.1_ARCHITECTURE §3.4 `jun`: step 8 and R7). Owner: B5.
 *
 * Pay Wood to adjust one of your ceramics' Actual Heat by +1 or −1, or decline (the window's
 * alternative button). In the R7 window, Second Firing's extra Fire card is shown beside its
 * ceramic (`firingStage.extraFire`: public, it has just been turned). No heat value is shown
 * for any ceramic (D3): only its place, marker and the rule effect.
 */
import type { CeramicId } from "../../../game/index.ts";
import { kilnText, techName } from "../../i18n/content.ts";
import { errorTextOptions, ruleErrorText } from "../../i18n/errors.ts";
import { signed } from "../../i18n/format.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { FireCard } from "../../pieces/FireCard.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
import { B5_KILNS, B5_TECHS, costText } from "./firingSupport.ts";
import { isHeatMarkerSide } from "./HeatMarkers.draft.ts";
import { junDraft } from "./Jun.draft.ts";
import type { JunAction, JunDraft } from "./Jun.draft.ts";
import { CeramicLine, Lead, Note, Section, ShortText, StepQueue, stepLabel } from "./WindowParts.tsx";

export function Jun() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [draft, dispatch] = useDraft<JunDraft, JunAction>();
  const options = junDraft.options(draft, model, engine);
  const jun = kilnText(B5_KILNS.jun, t.locale);
  const extra = model.firingStage?.extraFire ?? null;
  const second = options.during === "second_firing";
  return (
    <div className="dw-form">
      <Lead step={stepLabel(model, t)}>
        {second ? t("firing.jun.leadSecond", { tech: techName(B5_TECHS.secondFiring, t.locale), ability: jun.abilityName }) : <ShortText text={jun.short} />}
      </Lead>
      <Section heading={t("firing.ability")} aside={<RulesDetail subject={{ kind: "kiln", id: B5_KILNS.jun }} look="name" />}>
        {second ? null : <StepQueue model={model} />}
        <Note>{t("firing.cost", { cost: costText({ clay: 0, wood: options.woodCost, coins: 0 }, t) })}</Note>
      </Section>

      {second && extra !== null ? (
        <Section heading={t("firing.jun.extraFire")}>
          <span className="dw-row">
            <FireCard value={extra.modifier} size="lg" />
            <CeramicLine model={model} engine={engine} ceramicId={extra.ceramicId} withPlace size={40} />
          </span>
        </Section>
      ) : null}

      {options.ceramicIds.length === 0 ? (
        !options.ready ? (
          <Note>{t("common.status.usedThisRound")}</Note>
        ) : options.unusable === null ? null : (
          <Note>{ruleErrorText(options.unusable, t, errorTextOptions(engine.view, t))}</Note>
        )
      ) : (
        <>
          <OptionGroup
            legend={t("firing.ceramic")}
            name="ceramicId"
            value={draft.ceramicId}
            onChange={(value) => dispatch({ type: "ceramic", ceramicId: value as CeramicId })}
          >
            {options.ceramicIds.map((ceramicId) => (
              <OptionCard key={ceramicId} value={ceramicId} title={<CeramicLine model={model} engine={engine} ceramicId={ceramicId} withPlace among={options.ceramicIds} size={32} />} />
            ))}
          </OptionGroup>
          <OptionGroup
            legend={t("firing.jun.adjust")}
            name="delta"
            layout="pills"
            value={draft.delta === null ? null : String(draft.delta)}
            onChange={(value) => {
              const side = isHeatMarkerSide(value);
              if (side !== null) dispatch({ type: "delta", delta: side });
            }}
          >
            {options.sides.map((side) => (
              <OptionCard key={side} variant="pill" value={String(side)} title={signed(side)} />
            ))}
          </OptionGroup>
        </>
      )}
    </div>
  );
}
