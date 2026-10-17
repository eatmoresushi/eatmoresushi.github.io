/**
 * Contributions (UI_V1.6.1_ARCHITECTURE §3.4, §3.7; wireframe `decContrib`, `submitRow`). Owner: B5.
 *
 * Firing step 1: the viewer chooses a Contribution card in secret (and, with Fuel Ledger, whether
 * to commit Wood with it: Bank and Stoke then cost no Wood of their own, and the commitment makes
 * them −2/+2 for its Wood, v1.6.2 L637). Each card shows the Heat and the Wood it would cost, from
 * the selector. Renders only from `contributionsDraft.options()`. Others see only who has chosen
 * (`phase.submittedPlayerIds`), never what; after submitting, the window becomes `waiting`, where
 * the viewer's own sealed card is shown from `own.pendingContribution`.
 */
import type { ContributionCardId } from "../../../game/index.ts";
import { RULE_NUMBERS, contributionCardName, techName } from "../../i18n/content.ts";
import { range, signed } from "../../i18n/format.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
import { contributionsDraft } from "./Contributions.draft.ts";
import type { ContributionsAction, ContributionsDraft } from "./Contributions.draft.ts";
import { B5_TECHS, woodText } from "./firingSupport.ts";
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
  const fuel = options.fuelLedger;
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
            title={
              choice.option.command.fuelLedger
                ? t("firing.contrib.cardWithTech", { card: contributionCardName(choice.card, t.locale), tech: techName(B5_TECHS.fuelLedger, t.locale) })
                : contributionCardName(choice.card, t.locale)
            }
            meta={
              choice.option.woodCost > 0
                ? t("firing.contrib.woodAtReveal", { wood: woodText(choice.option.woodCost, t) })
                : choice.belowPrintedCost
                  ? t("firing.contrib.noWoodTech", { tech: techName(B5_TECHS.fuelLedger, t.locale) })
                  : t("firing.contrib.noWood")
            }
            description={t("firing.contrib.heat", { heat: signed(choice.option.heat) })}
            disabled={!choice.available}
            reason={
              choice.reason === "cant_afford"
                ? t("firing.contrib.cantAfford")
                : choice.reason === "fuel_ledger_bank_stoke"
                  ? t("firing.contrib.fuelOnlyBankStoke", { bank: contributionCardName("BANK", t.locale), stoke: contributionCardName("STOKE", t.locale) })
                  : undefined
            }
          />
        ))}
      </OptionGroup>

      {fuel === null ? null : (
        <Section heading={<RulesDetail subject={{ kind: "tech", id: B5_TECHS.fuelLedger }} look="name" />}>
          <OptionCard
            type="checkbox"
            name="fuelLedger"
            value="fuelLedger"
            checked={draft.fuelLedger}
            onChange={(_, checked) => dispatch({ type: "fuelLedger", on: checked })}
            disabled={!fuel.canCommit && !draft.fuelLedger}
            reason={!fuel.canCommit && !draft.fuelLedger ? t("firing.contrib.fuelCantAfford") : undefined}
            title={t("firing.contrib.fuelToggle", { wood: woodText(fuel.commitWood, t) })}
            description={t("firing.contrib.fuelEffect", {
              bank: contributionCardName("BANK", t.locale),
              bankHeat: fuel.bank === null ? "" : signed(fuel.bank.heat),
              stoke: contributionCardName("STOKE", t.locale),
              stokeHeat: fuel.stoke === null ? "" : signed(fuel.stoke.heat),
            })}
          />
        </Section>
      )}

      <Note tone="private">{t("firing.contrib.othersSee")}</Note>
    </div>
  );
}
