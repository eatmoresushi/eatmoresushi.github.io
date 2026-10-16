/**
 * AfterQuality (UI_V1.6.1_ARCHITECTURE §3.4 `after_quality`; wireframe `decAfterQuality`). Owner: B5.
 *
 * Firing step 10: Protective Saggars, Second Firing and Ge, in the order the player chooses, one
 * use per Confirm; the options are re-read after each use. "Done — decline the rest" is the
 * window's alternative button. Each ability shows its card text (its rule effect) and its
 * eligible targets with their recorded Quality; nothing predicts a result (D3).
 */
import type { AfterQualityAbility, CeramicId } from "../../../game/index.ts";
import { kilnText, techText } from "../../i18n/content.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
import type { RulesSubject } from "../../rules/RulesDetail.tsx";
import { afterQualityDraft, afterQualityValue } from "./AfterQuality.draft.ts";
import type { AfterQualityAction, AfterQualityDraft } from "./AfterQuality.draft.ts";
import { B5_KILNS, B5_TECHS, costText, ownFiringCeramicIds } from "./firingSupport.ts";
import { CeramicLine, Lead, Section, ShortText, StepQueue, stepLabel } from "./WindowParts.tsx";

const SUBJECTS: { readonly [A in AfterQualityAbility]: Extract<RulesSubject, { kind: "tech" | "kiln" }> } = {
  protective_saggars: { kind: "tech", id: B5_TECHS.protectiveSaggars },
  second_firing: { kind: "tech", id: B5_TECHS.secondFiring },
  ge_crackle: { kind: "kiln", id: B5_KILNS.ge },
};

function parseValue(value: string): { ability: AfterQualityAbility; ceramicId: CeramicId } | null {
  const at = value.indexOf(":");
  if (at < 0) return null;
  const ability = value.slice(0, at);
  if (ability !== "protective_saggars" && ability !== "second_firing" && ability !== "ge_crackle") return null;
  return { ability, ceramicId: value.slice(at + 1) };
}

export function AfterQuality() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [draft, dispatch] = useDraft<AfterQualityDraft, AfterQualityAction>();
  const options = afterQualityDraft.options(draft, model, engine);
  const mine = ownFiringCeramicIds(model);
  const selected = draft.choice === null || draft.choice === "end" ? null : afterQualityValue(draft.choice.ability, draft.choice.ceramicId);
  const onChange = (value: string) => {
    const parsed = parseValue(value);
    if (parsed !== null) dispatch({ type: "use", ability: parsed.ability, ceramicId: parsed.ceramicId });
  };
  return (
    <div className="dw-form">
      <Lead step={stepLabel(model, t)}>{t("firing.aq.lead")}</Lead>
      <Section heading={t("firing.queue")}>
        <StepQueue model={model} />
      </Section>
      <Section heading={t("firing.yourCeramics")}>
        <span className="dw-cerrow">
          {mine.map((ceramicId) => (
            <CeramicLine key={ceramicId} model={model} engine={engine} ceramicId={ceramicId} among={mine} size={36} />
          ))}
        </span>
      </Section>

      {options.abilities.map((option) => {
        const subject = SUBJECTS[option.ability];
        const short = subject.kind === "tech" ? techText(subject.id, t.locale).short : kilnText(subject.id, t.locale).short;
        return (
          <OptionGroup
            key={option.ability}
            legend={<RulesDetail subject={subject} look="name" />}
            aside={t("firing.cost", { cost: costText(option.cost, t) })}
            description={<ShortText text={short} />}
            name="afterQuality"
            value={selected}
            onChange={onChange}
          >
            {option.ceramicIds.map((ceramicId) => (
              <OptionCard
                key={ceramicId}
                value={afterQualityValue(option.ability, ceramicId)}
                title={<CeramicLine model={model} engine={engine} ceramicId={ceramicId} among={mine} size={32} />}
              />
            ))}
          </OptionGroup>
        );
      })}
    </div>
  );
}
