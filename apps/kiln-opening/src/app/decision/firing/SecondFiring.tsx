/**
 * SecondFiring (UI_V1.6.1_ARCHITECTURE §3.4 `second_firing`; T14, v1.6.2 L631, R7). Owner: B5.
 *
 * Second Firing's 2 extra Fire cards, turned face up (public: the table shows them too, in the
 * heat equation and beside the ceramic), and the ceramic they fire again. The owner chooses one
 * card (step 1, radios, each showing its card) and, with Jun ready on this ceramic (R7), Jun's +1
 * or −1 for its Wood, or not to use it (step 2, pills; "Do not use" is the default, R4). A Jun
 * owner whose Jun is not ready sees why, in the engine's words. The rule is stated in words: the
 * new Quality replaces the old one even if worse, and both cards are discarded. No heat value or
 * Quality is predicted for either card (D3). Renders only from `secondFiringDraft.options()`.
 */
import { kilnText, techName, techText } from "../../i18n/content.ts";
import { errorTextOptions, ruleErrorText } from "../../i18n/errors.ts";
import { signed } from "../../i18n/format.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { FireCard } from "../../pieces/FireCard.tsx";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { B5_KILNS, B5_TECHS, costText, ownFiringCeramicIds } from "./firingSupport.ts";
import { isHeatMarkerSide } from "./HeatMarkers.draft.ts";
import { secondFiringDraft } from "./SecondFiring.draft.ts";
import type { SecondFiringAction, SecondFiringDraft } from "./SecondFiring.draft.ts";
import { CeramicLine, Lead, Note, Section, ShortText, stepLabel } from "./WindowParts.tsx";

/** The radio value of "do not use Jun". */
const NO_JUN = "none";

export function SecondFiring() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [draft, dispatch] = useDraft<SecondFiringDraft, SecondFiringAction>();
  const options = secondFiringDraft.options(draft, model, engine);
  const tech = techName(B5_TECHS.secondFiring, t.locale);
  const jun = kilnText(B5_KILNS.jun, t.locale);
  const ceramicId = options.ceramicId;
  const twoSteps = options.jun.ready;
  const junCost = t("firing.cost", { cost: costText({ clay: 0, wood: options.jun.woodCost, coins: 0 }, t) });
  return (
    <div className="dw-form" data-form="second-firing">
      <Lead step={stepLabel(model, t)}>{t("firing.sf.lead", { tech, n: options.cards.length })}</Lead>
      {ceramicId === null ? null : (
        <Section heading={t("firing.ceramic")}>
          <CeramicLine model={model} engine={engine} ceramicId={ceramicId} withPlace among={ownFiringCeramicIds(model)} size={40} />
        </Section>
      )}
      <OptionGroup
        legend={t("firing.sf.cards")}
        {...(twoSteps ? { step: 1 } : {})}
        description={t("firing.sf.cardsRule")}
        name="cardIndex"
        layout="grid"
        value={draft.cardIndex === null ? null : String(draft.cardIndex)}
        onChange={(value) => {
          const card = options.cards.find((candidate) => String(candidate.cardIndex) === value);
          if (card !== undefined) dispatch({ type: "card", cardIndex: card.cardIndex });
        }}
      >
        {options.cards.map((card) => (
          <OptionCard
            key={card.cardIndex}
            value={String(card.cardIndex)}
            leading={
              <span aria-hidden="true">
                <FireCard value={card.modifier} size="lg" />
              </span>
            }
            title={t("firing.sf.card", { n: card.cardIndex + 1, value: signed(card.modifier) })}
          />
        ))}
      </OptionGroup>
      {!options.jun.offered ? null : options.jun.ready ? (
        <OptionGroup
          legend={t("firing.sf.jun", { ability: jun.abilityName })}
          step={2}
          aside={junCost}
          description={t("firing.sf.junDesc")}
          name="jun"
          layout="pills"
          value={draft.jun === null ? NO_JUN : String(draft.jun)}
          onChange={(value) => dispatch({ type: "jun", delta: value === NO_JUN ? null : isHeatMarkerSide(value) })}
        >
          <OptionCard variant="pill" value={NO_JUN} title={t("firing.sf.junNone")} />
          {options.jun.sides.map((side) => (
            <OptionCard key={side} variant="pill" value={String(side)} title={signed(side)} />
          ))}
        </OptionGroup>
      ) : (
        <Section heading={t("firing.sf.jun", { ability: jun.abilityName })} aside={junCost}>
          <Note>{t("firing.sf.junDesc")}</Note>
          <Note>
            {options.jun.reason === null ? t("firing.sf.junUnavailable") : ruleErrorText(options.jun.reason, t, errorTextOptions(engine.view, t))}
          </Note>
        </Section>
      )}
      <Section heading={t("firing.ability")} aside={<RulesDetail subject={{ kind: "tech", id: B5_TECHS.secondFiring }} look="name" />}>
        <ShortText text={techText(B5_TECHS.secondFiring, t.locale).short} />
        <Note>{t("firing.sf.rule", { n: options.cards.length })}</Note>
      </Section>
    </div>
  );
}
