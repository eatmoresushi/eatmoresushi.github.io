/**
 * Jun (UI_V1.6.1_ARCHITECTURE §3.4 `jun`: step 3). Owner: B5.
 *
 * Firing step 3 (rev. 4 L661): pay Wood to adjust one of your ceramics' Actual Heat by +1 or −1 (step 1 the
 * ceramic, step 2 the side, with its cost), or decline (the window's alternative button; Jun stays
 * unused, R4). An unused Jun after Second Firing (rev. 4 L627) is chosen in Second Firing's own window. No heat value
 * is shown for any ceramic (D3): only its place, Kiln Master's marker and the rule effect.
 */
import type { CeramicId } from "../../../game/index.ts";
import { kilnText } from "../../i18n/content.ts";
import { errorTextOptions, ruleErrorText } from "../../i18n/errors.ts";
import { signed } from "../../i18n/format.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
import { B5_KILNS, costText, heatDeltaOf } from "./firingSupport.ts";
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
  const cost = t("firing.cost", { cost: costText({ clay: 0, wood: options.woodCost, coins: 0 }, t) });
  return (
    <div className="dw-form" data-form="jun">
      <Lead step={stepLabel(model, t)}>
        <ShortText text={jun.short} />
      </Lead>
      <Section heading={t("firing.queue")}>
        <StepQueue model={model} />
      </Section>

      {options.ceramicIds.length === 0 ? (
        <Section heading={t("firing.ability")} aside={<RulesDetail subject={{ kind: "kiln", id: B5_KILNS.jun }} look="name" />}>
          <Note>
            {!options.ready ? t("common.status.usedThisRound") : options.unusable === null ? t("firing.jun.none") : ruleErrorText(options.unusable, t, errorTextOptions(engine.view, t))}
          </Note>
        </Section>
      ) : (
        <>
          <OptionGroup
            legend={t("firing.ceramic")}
            step={1}
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
            step={2}
            aside={cost}
            description={t("firing.jun.adjustDesc")}
            name="delta"
            layout="pills"
            value={draft.delta === null ? null : String(draft.delta)}
            onChange={(value) => {
              const side = heatDeltaOf(value);
              if (side !== null) dispatch({ type: "delta", delta: side });
            }}
          >
            {options.sides.map((side) => (
              <OptionCard key={side} variant="pill" value={String(side)} title={signed(side)} />
            ))}
          </OptionGroup>
          <Section heading={t("firing.ability")} aside={<RulesDetail subject={{ kind: "kiln", id: B5_KILNS.jun }} look="name" />}>
            <Note>{t("firing.jun.declineNote", { ability: jun.abilityName })}</Note>
          </Section>
        </>
      )}
    </div>
  );
}
