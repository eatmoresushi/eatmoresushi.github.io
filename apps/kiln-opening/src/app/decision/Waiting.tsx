/**
 * Waiting (UI_V1.6.1_ARCHITECTURE §3.4 `waiting`, §3.7; wireframe `decWait`, `submitRow`). Owner: B5.
 *
 * The pane when the viewer does not act. The heading (window spec) names who acts now; the body
 * shows only public facts plus the viewer's own secrets:
 * - in the Contribution window: who has chosen (`phase.submittedPlayerIds`, never what) and,
 *   once the viewer has submitted, their own sealed card from `own.pendingContribution` — which
 *   the server rebuilds on reconnect — marked "only you";
 * - a queued firing step: its queue in First Player order;
 * - someone else's private look: "Zhao is looking at 3 cards in private" (`counts.pendingLook`).
 */
import { Chip } from "../kit/Chip.tsx";
import { contributionCardName, techName } from "../i18n/content.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { useEngineView, useGame } from "../state/hooks.ts";
import { B5_TECHS, nameOf } from "./firing/firingSupport.ts";
import { Lead, Note, PlayerQueue, Section, StepQueue } from "./firing/WindowParts.tsx";

export function Waiting() {
  const t = useT();
  const model = useGame();
  const { view } = useEngineView();
  const stage = model.firingStage;
  const sealed = view.own?.pendingContribution ?? null;
  const contributions = model.phaseType === "firing_contributions" && stage !== null;
  const look = model.board.counts.pendingLook;
  const submitted = new Set(stage?.submittedPlayerIds ?? []);
  return (
    <div className="dw-form" data-waiting={model.phaseType}>
      <Lead>{t("firing.wait.lead")}</Lead>

      {contributions ? (
        <Section heading={t("firing.who")}>
          <PlayerQueue
            model={model}
            label={t("firing.who")}
            entries={stage.contributions.map((entry) => {
              const done = submitted.has(entry.playerId);
              return { playerId: entry.playerId, status: done ? "done" : "now", statusText: done ? t("firing.statusChosen") : t("firing.statusChoosing") };
            })}
          />
        </Section>
      ) : stage !== null && stage.queue !== null ? (
        <Section heading={t("firing.queue")}>
          <StepQueue model={model} />
        </Section>
      ) : null}

      {contributions && sealed !== null && sealed.windowId === (view.game.phase.type === "firing_contributions" ? view.game.phase.windowId : null) ? (
        <Section heading={t("firing.contrib.card")} aside={<Chip tone="private">{t("common.status.onlyYou")}</Chip>}>
          <p className="dw-lead-text" data-sealed-contribution="">
            {sealed.fuelLedger
              ? t.rich("firing.sealedFuel", { card: contributionCardName(sealed.card, t.locale), tech: techName(B5_TECHS.fuelLedger, t.locale) })
              : t.rich("firing.sealed", { card: contributionCardName(sealed.card, t.locale) })}
          </p>
          <Note>{t("firing.sealedNote")}</Note>
        </Section>
      ) : null}

      {look !== null && look.playerId !== model.viewerId ? <Note>{t("firing.wait.looking", { name: nameOf(model, look.playerId), n: look.count })}</Note> : null}
    </div>
  );
}
