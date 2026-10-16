/**
 * WorkTurn (UI_V1.6.1_ARCHITECTURE §3.4, §8.1; wireframe `decWork`, `subEditor`). Owner: B4.
 *
 * The `work` window. Before the worker action:
 * 1. what this step does, when Imperial Priority or Canal Barge may come first;
 * 2. the worker (`WorkerPicker`);
 * 3. the location: open locations as radios, each with its one-line effect for the chosen
 *    worker, its capacity, its rules details (D10) and — once chosen — its sub-editor, rendered
 *    after the radio's label as the region the radio names in `aria-controls` (§8.1). Locations
 *    that cannot be chosen sit in an "Unavailable" disclosure with the engine's reason.
 * After the worker action it shows `ActionWindow` (Imperial Priority, Canal Barge, End turn).
 *
 * Everything renders from `workDraft.options()`; the component filters, sums and checks nothing.
 */
import { useId } from "react";
import type { LocationId } from "../../../game/index.ts";
import { RULE_NUMBERS, locationName, locationSummaryKey } from "../../i18n/content.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import type { Translator } from "../../i18n/translator.ts";
import { Disclosure } from "../../kit/Disclosure.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import type { GameModel } from "../../state/model.ts";
import { ActionWindow } from "./ActionWindow.tsx";
import { CanalWharf } from "./locations/CanalWharf.tsx";
import { CommissionMarket } from "./locations/CommissionMarket.tsx";
import { FormDecorate } from "./locations/FormDecorate.tsx";
import { GlazeLoad } from "./locations/GlazeLoad.tsx";
import { GuildHall } from "./locations/GuildHall.tsx";
import { MagistratesHall } from "./locations/MagistratesHall.tsx";
import { MaterialsYard } from "./locations/MaterialsYard.tsx";
import { useRuleErrorText } from "./pieces.tsx";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
import { workDraft } from "./workDraft.ts";
import type { ActiveLocation, LocationChoice, WorkAction, WorkDraft, WorkMode } from "./workDraft.ts";
import { WorkerPicker } from "./WorkerPicker.tsx";
import "./pieces.css";

const MODE_TITLE: Readonly<Record<WorkMode, "work.work.mode.place" | "work.work.mode.imperialPriority" | "work.work.mode.canalBarge" | "work.work.mode.endTurn">> = {
  place: "work.work.mode.place",
  imperial_priority: "work.work.mode.imperialPriority",
  canal_barge: "work.work.mode.canalBarge",
  end_turn: "work.work.mode.endTurn",
};

/** The capacity line of a location card: spaces for a personal location, occupancy for a central one. */
function capacityText(choice: LocationChoice, model: GameModel, t: Translator): string {
  const placement = choice.placement;
  const personal = model.me?.personalSpaces.filter((space) => space.locationId === choice.locationId) ?? [];
  if (personal.length > 0) {
    const parts: string[] = [];
    if (placement.nextSpaceIndex !== null) parts.push(t("work.work.personalSpace", { i: placement.nextSpaceIndex + 1 }));
    for (const space of personal) if (!space.unlocked) parts.push(t("work.work.spaceNotAdded", { i: space.spaceIndex + 1 }));
    return parts.join(" · ");
  }
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

export function WorkTurn() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [draft, dispatch] = useDraft<WorkDraft, WorkAction>();
  const errorText = useRuleErrorText();
  const subId = useId();
  const options = workDraft.options(draft, model, engine);
  if (options.step === "after_action") return <ActionWindow source="after_action" />;

  const me = model.me;
  const modes = options.modes;
  const legal = options.locations.filter((choice) => choice.legal);
  const unavailable = options.locations.filter((choice) => !choice.legal);
  const selected: LocationId | null = draft.mode === "place" ? draft.locationId : null;
  const workerChosen = draft.workerKey !== null;

  const row = (choice: LocationChoice) => {
    const entry = choice.entry;
    const reason = choice.legal ? undefined : choice.error !== null ? errorText(choice.error) : workerChosen ? t("work.work.notForWorker") : undefined;
    const isSelected = selected === choice.locationId && choice.legal;
    const description = choice.legal && entry !== null ? t.dynamic(locationSummaryKey(choice.locationId, entry.effect)) : undefined;
    return (
      <OptionCard
        key={choice.locationId}
        value={choice.locationId}
        title={locationName(choice.locationId, t.locale)}
        meta={capacityText(choice, model, t)}
        description={description}
        disabled={!choice.legal}
        reason={reason}
        {...(isSelected && options.active !== null ? { controls: subId } : {})}
      >
        <RulesDetail subject={{ kind: "location", id: choice.locationId }} />
        {isSelected && options.active !== null ? (
          <div id={subId} className="b4-sub-region" role="group" aria-label={locationName(choice.locationId, t.locale)}>
            <SubEditor active={options.active} dispatch={dispatch} />
          </div>
        ) : null}
      </OptionCard>
    );
  };

  return (
    <div className="b4-form" data-b4="work">
      <p className="b4-prompt">{t("work.work.prompt", { n: options.workersLeft, total: RULE_NUMBERS.workers })}</p>
      {modes.length > 1 ? (
        <OptionGroup
          legend={t("work.work.step.mode")}
          name="mode"
          value={draft.mode}
          onChange={(value) => {
            const mode = modes.find((candidate) => candidate.mode === value)?.mode;
            if (mode !== undefined) dispatch({ type: "mode", mode });
          }}
        >
          {modes.map(({ mode }) => (
            <OptionCard
              key={mode}
              value={mode}
              title={t(MODE_TITLE[mode])}
              description={mode === "place" ? t("work.work.mode.placeHint") : t("work.work.mode.before")}
            />
          ))}
        </OptionGroup>
      ) : null}
      {draft.mode === "place" ? (
        <>
          <WorkerPicker workers={options.workers} value={draft.workerKey} onChange={(workerKey) => dispatch({ type: "worker", workerKey })} seat={me?.seatIndex ?? 0} />
          <OptionGroup
            legend={t("work.work.step.location")}
            step={2}
            aside={t("work.work.legalN", { a: legal.length, b: options.locations.length })}
            description={workerChosen ? undefined : t("work.work.chooseWorkerFirst")}
            name="locationId"
            value={selected}
            onChange={(value) => {
              const choice = legal.find((candidate) => candidate.locationId === value);
              if (choice !== undefined) dispatch({ type: "location", locationId: choice.locationId });
            }}
          >
            {legal.map(row)}
            {unavailable.length === 0 ? null : (
              <Disclosure className="b4-unavailable" summary={t("work.work.unavailableN", { n: unavailable.length })}>
                <div className="b4-unavailable-items">{unavailable.map(row)}</div>
              </Disclosure>
            )}
          </OptionGroup>
        </>
      ) : (
        <ActionWindow source="before_action" />
      )}
    </div>
  );
}

