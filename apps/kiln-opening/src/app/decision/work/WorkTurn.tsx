/**
 * WorkTurn (UI_V1.6.1_ARCHITECTURE §3.4, §8.1; wireframe `decWork`, `subEditor`). Owner: B4.
 *
 * The `work` window. Workers are placed **on the table** (owner review, 2026-10-17): the Place
 * shortcuts of the location cards and of the viewer's own Form & Decorate and Glaze & Load
 * spaces (`useTableSelection().placeTargets`, the work window's table adapter) set the worker and
 * the location of this window's draft. The pane itself lists no workers and no locations, and it
 * is **hidden** until a placement is chosen (owner review item 2, 2026-10-17: `workPane` in
 * `windows.work.ts`; a free action or the Colour Samples swap opens it from the chips above the
 * world, `PaneOpeners`, or from the pieces on the table: owner UI decision D21). Before the worker
 * action it shows:
 * 1. how many workers are left (the Work Phase cannot be passed), while placing;
 * 2. with an ability's form open, the form and "Back to placing" (`data-b4="back-to-placing"`,
 *    D14), which hides the pane again, and focus goes back to the chip the player used. Nothing
 *    has to be dismissed, though: placing a worker on the table is how the turn moves on (D21);
 * 3. the chosen placement's summary (worker, location, its one-line effect, the space it takes)
 *    and the location's sub-editor, a labelled region (`.b4-sub-region`) holding the choices that
 *    location needs (the Materials Yard split, Form & Decorate, Glaze & Load, the Commission
 *    Market, the Guild Hall — whose Tech is chosen on the Tech display —, the Magistrate's
 *    Hall…), or the chosen ability's form.
 * With nothing chosen the pane is hidden, so this form renders no hint and no way to the table
 * (the bar above the world says what to do; a pending server error keeps the pane up, and its
 * ConfirmBar summary then says to place a worker on the table).
 * The ConfirmBar follows (DecisionPane): Clear goes back to placing, which hides the pane again.
 * After the worker action it shows `ActionWindow` (the free-action list; End turn is the ConfirmBar's
 * alternative).
 *
 * Everything renders from `workDraft.options()`; the component filters, sums and checks nothing.
 * The location opens no rules details here (owner review, 2026-10-17).
 */
import { useId } from "react";
import { RULE_NUMBERS, locationName, locationSummaryKey, workerKindName } from "../../i18n/content.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import type { Translator } from "../../i18n/translator.ts";
import { Button } from "../../kit/Button.tsx";
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
import type { ActiveLocation, WorkAction, WorkDraft } from "./workDraft.ts";
import "./pieces.css";

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

/**
 * The location's one-line effect (the rulebook's Action Summary cell). At Glaze & Load, once the
 * loads go only into the Imperial Kiln (the engine's quote pays no Wood, R24), the cell's
 * "(1 Wood)" would contradict the kiln-fuel block, so the line says the action is free instead.
 */
function effectText(active: ActiveLocation, t: Translator): string {
  const effect = active.context.worker.effect;
  if (active.locationId === "glaze_load" && active.options.fuel.free) {
    return t(effect === "shifu" ? "work.gl.effectFree.shifu" : "work.gl.effectFree.apprentice", { n: active.options.maxLoads });
  }
  return t.dynamic(locationSummaryKey(active.locationId, effect));
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
      return <MagistratesHall draft={active.draft} options={active.options} context={active.context} dispatch={(action) => dispatch({ type: "sub", locationId: "magistrates_hall", action })} />;
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
      <p className="b4-chosen-effect">{effectText(active, t)}</p>
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
  return (
    <div className="b4-form" data-b4="work">
      {options.backToPlacing ? (
        <div className="b4-row">
          <Button size="sm" data-b4="back-to-placing" onClick={() => dispatch({ type: "mode", mode: "place" })}>
            {t("work.work.backToPlacing")}
          </Button>
        </div>
      ) : (
        <p className="b4-prompt">{t("work.work.prompt", { n: options.workersLeft, total: RULE_NUMBERS.workers })}</p>
      )}
      {draft.mode === "place" ? (
        options.active === null ? null : <ChosenPlacement active={options.active} dispatch={dispatch} />
      ) : (
        <ActionWindow source="before_action" />
      )}
    </div>
  );
}
