/**
 * WorkTurn (UI_V1.6.1_ARCHITECTURE §3.4, §8.1; wireframe `decWork`, `subEditor`). Owner: B4.
 *
 * The `work` window. Workers are placed **on the table** (owner review, 2026-10-17): the Place
 * shortcuts of the location cards and of the viewer's own Form & Decorate and Glaze & Load
 * spaces (`useTableSelection().placeTargets`, the work window's table adapter) set the worker and
 * the location of this window's draft. The pane itself lists no workers and no locations, and it
 * is **hidden** until a placement is chosen (owner review item 2, 2026-10-17: `workPane` in
 * `windows.work.ts`; an ability that may come first opens it from above the world,
 * `PaneOpeners`). Before the worker action it shows:
 * 1. how many workers are left (the Work Phase cannot be passed);
 * 2. what this step does, when Imperial Priority or Canal Barge may come first
 *    (`options.stepChoices`): the abilities, and Place a worker only while a placement is chosen,
 *    so moving through the radios (arrow keys select as they move) never hides the pane; no
 *    choice at all when it would be a lone radio (one ability opened with nothing placed: the
 *    pane's heading names it, `options.heading`). With an ability open and nothing placed, "Back
 *    to placing" (`data-b4="back-to-placing"`) is a separate button: it hides the pane, and focus
 *    goes back to the opener the player used;
 * 3. the chosen placement's summary (worker, location, its one-line effect, the space it takes)
 *    and the location's sub-editor, a labelled region (`.b4-sub-region`) holding the choices that
 *    location needs (the Materials Yard split, Form & Decorate, Glaze & Load, the Commission
 *    Market, the Guild Hall — whose Tech is chosen on the Tech display —, the Magistrate's
 *    Hall…), or the chosen ability's form.
 * With nothing chosen the pane is hidden, so this form renders no hint and no way to the table
 * (the bar above the world says what to do; a pending server error keeps the pane up, and its
 * ConfirmBar summary then says to place a worker on the table).
 * The ConfirmBar follows (DecisionPane): Clear goes back to placing, which hides the pane again.
 * After the worker action it shows `ActionWindow` (Imperial Priority, Canal Barge, End turn).
 *
 * Everything renders from `workDraft.options()`; the component filters, sums and checks nothing.
 * The location opens no rules details here (owner review, 2026-10-17).
 */
import { useId } from "react";
import { RULE_NUMBERS, locationName, locationSummaryKey, workerKindName } from "../../i18n/content.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import type { Translator } from "../../i18n/translator.ts";
import { Button } from "../../kit/Button.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { ActionWindow } from "./ActionWindow.tsx";
import { CanalWharf } from "./locations/CanalWharf.tsx";
import { CommissionMarket } from "./locations/CommissionMarket.tsx";
import { FormDecorate } from "./locations/FormDecorate.tsx";
import { GlazeLoad } from "./locations/GlazeLoad.tsx";
import { GuildHall } from "./locations/GuildHall.tsx";
import { MagistratesHall } from "./locations/MagistratesHall.tsx";
import { MaterialsYard } from "./locations/MaterialsYard.tsx";
import { workDraft } from "./workDraft.ts";
import type { ActiveLocation, WorkAction, WorkDraft, WorkMode } from "./workDraft.ts";
import "./pieces.css";

const MODE_TITLE: Readonly<Record<WorkMode, "work.work.mode.place" | "work.work.mode.imperialPriority" | "work.work.mode.canalBarge" | "work.work.mode.endTurn">> = {
  place: "work.work.mode.place",
  imperial_priority: "work.work.mode.imperialPriority",
  canal_barge: "work.work.mode.canalBarge",
  end_turn: "work.work.mode.endTurn",
};

/** The worker of the chosen placement in words: "Shifu", "Apprentice as Shifu" (never an ID, D9). */
function workerText(active: ActiveLocation, t: Translator): string {
  const worker = active.context.worker;
  const name = workerKindName(worker.kind, t.locale);
  return worker.seniorApprentice ? t("work.work.workerSenior", { worker: name, shifu: workerKindName("shifu", t.locale) }) : name;
}

/** The space the placement takes: "your space 2" for a personal location, the occupancy for a central one. */
function spaceText(active: ActiveLocation, t: Translator): string {
  const placement = active.context.placement;
  if (placement.nextSpaceIndex !== null) return t("work.work.personalSpace", { i: placement.nextSpaceIndex + 1 });
  return placement.capacity === null ? t("work.work.noLimit") : t("work.work.taken", { n: placement.occupancy, c: placement.capacity });
}

function SubEditor({ active, dispatch }: { active: ActiveLocation; dispatch: (action: WorkAction) => void }) {
  switch (active.locationId) {
    case "materials_yard":
      return <MaterialsYard draft={active.draft} options={active.options} context={active.context} dispatch={(action) => dispatch({ type: "sub", locationId: "materials_yard", action })} />;
    case "form_decorate":
      return <FormDecorate draft={active.draft} options={active.options} context={active.context} dispatch={(action) => dispatch({ type: "sub", locationId: "form_decorate", action })} />;
    case "glaze_load":
      return <GlazeLoad draft={active.draft} options={active.options} context={active.context} dispatch={(action) => dispatch({ type: "sub", locationId: "glaze_load", action })} />;
    case "commission_market":
      return <CommissionMarket draft={active.draft} options={active.options} context={active.context} dispatch={(action) => dispatch({ type: "sub", locationId: "commission_market", action })} />;
    case "guild_hall":
      return <GuildHall draft={active.draft} options={active.options} context={active.context} dispatch={(action) => dispatch({ type: "sub", locationId: "guild_hall", action })} />;
    case "canal_wharf":
      return <CanalWharf draft={active.draft} options={active.options} context={active.context} dispatch={() => undefined} />;
    case "magistrates_hall":
      return <MagistratesHall draft={active.draft} options={active.options} context={active.context} dispatch={() => undefined} />;
  }
}

/** The chosen placement: worker, location, effect and space, then the location's choices. */
function ChosenPlacement({ active, dispatch }: { active: ActiveLocation; dispatch: (action: WorkAction) => void }) {
  const t = useT();
  const titleId = useId();
  const location = locationName(active.locationId, t.locale);
  return (
    <section className="b4-chosen" data-b4="chosen" data-location-id={active.locationId} aria-labelledby={titleId}>
      <div className="b4-chosen-head">
        <h3 id={titleId} className="b4-chosen-title">
          {t("work.work.chosen", { worker: workerText(active, t), location })}
        </h3>
        <span className="b4-chosen-meta num">{spaceText(active, t)}</span>
      </div>
      <p className="b4-chosen-effect">{t.dynamic(locationSummaryKey(active.locationId, active.context.worker.effect))}</p>
      <div className="b4-sub-region" role="group" aria-label={location}>
        <SubEditor active={active} dispatch={dispatch} />
      </div>
      <p className="b4-note b4-note--muted">{t("work.work.changeHint")}</p>
    </section>
  );
}

export function WorkTurn() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [draft, dispatch] = useDraft<WorkDraft, WorkAction>();
  const options = workDraft.options(draft, model, engine);
  if (options.step === "after_action") return <ActionWindow source="after_action" />;
  const choices = options.stepChoices;
  return (
    <div className="b4-form" data-b4="work">
      <p className="b4-prompt">{t("work.work.prompt", { n: options.workersLeft, total: RULE_NUMBERS.workers })}</p>
      {choices.length > 0 ? (
        <OptionGroup
          legend={t("work.work.step.mode")}
          name="mode"
          value={draft.mode}
          onChange={(value) => {
            const mode = choices.find((candidate) => candidate.mode === value)?.mode;
            if (mode !== undefined) dispatch({ type: "mode", mode });
          }}
        >
          {choices.map(({ mode }) => (
            <OptionCard
              key={mode}
              value={mode}
              title={t(MODE_TITLE[mode])}
              description={mode === "place" ? t("work.work.mode.placeHint") : t("work.work.mode.before")}
            />
          ))}
        </OptionGroup>
      ) : null}
      {options.backToPlacing ? (
        <div className="b4-row">
          <Button size="sm" data-b4="back-to-placing" onClick={() => dispatch({ type: "mode", mode: "place" })}>
            {t("work.work.backToPlacing")}
          </Button>
        </div>
      ) : null}
      {draft.mode === "place" ? (
        options.active === null ? null : <ChosenPlacement active={options.active} dispatch={dispatch} />
      ) : (
        <ActionWindow source="before_action" />
      )}
    </div>
  );
}
