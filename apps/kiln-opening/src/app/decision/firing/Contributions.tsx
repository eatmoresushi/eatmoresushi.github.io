/**
 * Contributions (UI_V1.6.1_ARCHITECTURE §3.4, §3.7; wireframe `decContrib`, `submitRow`). Owner: B5.
 *
 * Firing step 1: the viewer chooses 1 of their own Contribution cards in secret (v1.6.2 L246,
 * L266, change 26): Tend, Bank and Stoke, and, with Fuel Ledger, Fuel Ledger Bank and Fuel Ledger
 * Stoke, the two cards that come with the tile; its owner's plain Bank and Stoke cost no Wood
 * (v1.6.2 L634). Each card shows its modifier and the Wood it would cost this player, paid at the
 * reveal, from the selector; a card that costs less than its printed Wood names the owned Tech
 * that makes it free (the draft's `freeBy`). Each Tech that brought cards gets a note: the cards
 * it brought and those it makes free, as the draft links them. Renders only from
 * `contributionsDraft.options()`. Others see only who
 * has chosen (`phase.submittedPlayerIds`), never what; after submitting, the window becomes
 * `waiting`, where the viewer's own sealed card is shown from `own.pendingContribution`.
 */
import type { ContributionCardId } from "../../../game/index.ts";
import { RULE_NUMBERS, contributionCardName, techName } from "../../i18n/content.ts";
import { andList, range, signed } from "../../i18n/format.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { contributionsDraft } from "./Contributions.draft.ts";
import type { ContributionCardChoice, ContributionsAction, ContributionsDraft } from "./Contributions.draft.ts";
import { woodText } from "./firingSupport.ts";
import { Lead, stepLabel, Note, PlayerQueue, Section } from "./WindowParts.tsx";

export function Contributions() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [draft, dispatch] = useDraft<ContributionsDraft, ContributionsAction>();
  const options = contributionsDraft.options(draft, model, engine);
  const stage = model.firingStage;
  const submitted = new Set(stage?.submittedPlayerIds ?? []);
  const participants = stage?.contributions.map((entry) => entry.playerId) ?? [];
  const wood = model.me?.resources.wood ?? 0;
  // The Techs whose Contribution cards the viewer holds (Fuel Ledger): their rules details, the
  // cards they brought and the cards they make free (`freeBy`), each as the draft links them.
  const cardTechs = [...new Set(options.cards.flatMap((choice) => (choice.techId === null ? [] : [choice.techId])))];
  const names = (choices: readonly ContributionCardChoice[]) => choices.map((choice) => contributionCardName(choice.card, t.locale));
  return (
    <div className="dw-form">
      <Lead step={stepLabel(model, t)}>{t("firing.contrib.lead")}</Lead>

      <Section heading={t("firing.who")}>
        <PlayerQueue
          model={model}
          label={t("firing.who")}
          entries={participants.map((playerId) => {
            const done = submitted.has(playerId);
            return { playerId, status: done ? "done" : "now", statusText: done ? t("firing.statusChosen") : t("firing.statusChoosing") };
          })}
        />
      </Section>

      <OptionGroup
        legend={t("firing.contrib.card")}
        aside={t("firing.youHaveWood", { wood: woodText(wood, t) })}
        name="card"
        value={draft.card}
        onChange={(value) => dispatch({ type: "card", card: value as ContributionCardId })}
        description={stage === null ? undefined : t("firing.contrib.baseRule", { die: stage.kilnDie, range: range(RULE_NUMBERS.baseHeatMin, RULE_NUMBERS.baseHeatMax) })}
      >
        {options.cards.map((choice) => (
          <OptionCard
            key={choice.card}
            value={choice.card}
            leading={<span className="dw-big" aria-hidden="true">{signed(choice.option.heat)}</span>}
            title={contributionCardName(choice.card, t.locale)}
            meta={
              choice.option.woodCost > 0
                ? t("firing.contrib.woodAtReveal", { wood: woodText(choice.option.woodCost, t) })
                : choice.freeBy !== null
                  ? t("firing.contrib.noWoodTech", { tech: techName(choice.freeBy, t.locale) })
                  : t("firing.contrib.noWood")
            }
            description={
              choice.techId === null
                ? t("firing.contrib.heat", { heat: signed(choice.option.heat) })
                : t("firing.contrib.heatFromTech", { heat: signed(choice.option.heat), tech: techName(choice.techId, t.locale) })
            }
            disabled={!choice.available}
            reason={choice.reason === "cant_afford" ? t("firing.contrib.cantAfford") : undefined}
          />
        ))}
      </OptionGroup>

      {cardTechs.map((techId) => {
        const tech = techName(techId, t.locale);
        const cards = andList(names(options.cards.filter((choice) => choice.techId === techId)), t.locale);
        const free = names(options.cards.filter((choice) => choice.freeBy === techId));
        return (
          <Section key={techId} heading={<RulesDetail subject={{ kind: "tech", id: techId }} look="name" />}>
            <Note>{free.length === 0 ? t("firing.contrib.techCards", { cards, tech }) : t("firing.contrib.techCardsFree", { cards, tech, free: andList(free, t.locale) })}</Note>
          </Section>
        );
      })}

      <Note tone="private">{t("firing.contrib.othersSee")}</Note>
    </div>
  );
}
