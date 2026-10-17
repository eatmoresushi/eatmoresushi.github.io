/**
 * LocationCard (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `locCard`, `reasonFor`: one central location, its occupants, capacity and Place shortcuts.
 *
 * - Occupants in placement order, then an empty pip per free space; "1/1 taken", or "No limit"
 *   for the Canal Wharf. Capacities are absolute (no Shifu overfill).
 * - The Magistrate's Hall says which Recognition values may use it.
 * - Both one-line effects (rulebook Appendix E / glossary §4), as plain text: the action spaces
 *   open no rules details (owner review, 2026-10-17, removed the "Full rules ›" link).
 * - **Place shortcuts** from `useTableSelection().placeTargets` (the open work turn's adapter):
 *   one button per legal worker entry (Shifu, Apprentice, and Apprentice as Shifu where Senior
 *   Apprentice applies), `aria-pressed` when the pane's draft has chosen it; a click changes the
 *   pane's draft (`act`). They are the only way to place a worker (owner review, 2026-10-17):
 *   the pane shows the chosen placement and its choices. A Guild Hall placement takes the player
 *   to the Tech display, where the Guild Hall choice is made (`revealTechChooser`). When the
 *   adapter lists only illegal entries, the engine's reasons are shown through `ruleErrorText`
 *   (§5 gap 12; see CR B2-3).
 */
import { useId } from "react";
import type { CentralLocationId, PlacementWorkerOption } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { locationName, workerKindName } from "../i18n/content.ts";
import { errorTextOptions, ruleErrorText } from "../i18n/errors.ts";
import type { Translator } from "../i18n/translator.ts";
import { Disclosure } from "../kit/Disclosure.tsx";
import { WorkerPiece } from "../pieces/WorkerPiece.tsx";
import type { GameModel } from "../state/model.ts";
import { useGame, useLayoutMode, useTableSelection, useUi } from "../state/hooks.ts";
import { isPhone } from "../state/layoutMode.ts";
import { placementWorkerKey, revealTechChooser } from "../state/tableSelection.ts";
import type { TableSelection } from "../state/tableSelection.ts";
import { LocationSummaries } from "../rules/RulesDetail.tsx";
import { seatOf, summaryOf, tableCeramics } from "./tableData.ts";
import "./LocationCard.css";

export interface LocationCardProps {
  /** The central location shown. */
  locationId: CentralLocationId;
}

/** "Shifu", "Apprentice", or "Apprentice, as Shifu (Senior Apprentice)". */
export function placementWorkerName(option: Pick<PlacementWorkerOption, "kind" | "seniorApprentice">, t: Translator): string {
  const worker = workerKindName(option.kind, t.locale);
  return option.seniorApprentice ? t("common.worker.seniorApprentice", { worker }) : worker;
}

/** The distinct engine reasons of a location none of whose entries is legal (CR B2-3). */
export function unavailableReasons(entries: readonly PlacementWorkerOption[], model: GameModel, t: Translator): string[] {
  if (entries.length === 0 || entries.some((entry) => entry.legal)) return [];
  const options = errorTextOptions(tableCeramics(model).labelView, t);
  const texts = entries
    .map((entry) => (entry.error !== null ? ruleErrorText(entry.error, t, options) : entry.reason !== null ? ruleErrorText({ code: entry.reason }, t, options) : ""))
    .filter((text) => text !== "");
  return [...new Set(texts)];
}

/**
 * One compact Place piece per legal worker entry (wireframe `.place`, `.pbtn`): "Place:" then the
 * worker piece, with the worker's name beside it only where the card has room (or in Chinese).
 * The full sentence ("Place Shifu at ⟨location⟩") is the button's accessible name.
 */
export function PlaceButtons({ locationId, entries, selection, model }: {
  locationId: CentralLocationId | "form_decorate" | "glaze_load";
  entries: readonly PlacementWorkerOption[];
  selection: TableSelection;
  model: GameModel;
}) {
  const t = useT();
  const ui = useUi();
  const layout = useLayoutMode();
  const legal = entries.filter((entry) => entry.legal);
  if (legal.length === 0) return null;
  const viewer = model.viewerId;
  const seat = viewer === null ? 0 : seatOf(model, viewer);
  const location = locationName(locationId, t.locale);
  return (
    <div className="loc-place">
      <span className="loc-place-h" aria-hidden="true">{t("table.location.placeHeading")}</span>
      {legal.map((entry) => {
        const key = placementWorkerKey(entry);
        const worker = placementWorkerName(entry, t);
        const pressed = selection.activePlacement !== null && selection.activePlacement.locationId === locationId && selection.activePlacement.workerKey === key;
        return (
          <button
            key={key}
            type="button"
            className="pbtn"
            data-act="place"
            data-location-id={locationId}
            data-worker={key}
            aria-pressed={pressed}
            aria-label={t("table.location.placeAt", { worker, location })}
            onClick={() => {
              selection.act({ type: "place", locationId, workerKey: key });
              // The Guild Hall's choice is made on the Tech display: go there (owner review, 2026-10-17).
              if (locationId === "guild_hall") revealTechChooser(ui, isPhone(layout));
            }}
          >
            <WorkerPiece kind={entry.kind} seat={seat} senior={entry.seniorApprentice} decorative size={20} />
            <span className="pbtn-w" aria-hidden="true">{worker}</span>
          </button>
        );
      })}
    </div>
  );
}

export function LocationCard({ locationId }: LocationCardProps) {
  const t = useT();
  const model = useGame();
  const selection = useTableSelection();
  const headingId = useId();
  const location = model.board.centralLocations.find((entry) => entry.locationId === locationId);
  if (location === undefined) return null;
  const name = locationName(locationId, t.locale);
  const occupants = location.occupants;
  const capacity = location.capacity;
  const full = capacity !== null && occupants.length >= capacity;
  const free = capacity === null ? 0 : Math.max(0, capacity - occupants.length);
  const entries = selection.placeTargets.get(locationId) ?? [];
  const reasons = unavailableReasons(entries, model, t);
  const chosen = selection.activePlacement !== null && selection.activePlacement.locationId === locationId;
  const recognition = location.usableAtRecognition;
  return (
    <article className={chosen ? "loc loc--chosen" : "loc"} aria-labelledby={headingId} data-location-id={locationId}>
      <div className="loc-head">
        <h4 id={headingId} className="loc-name">{name}</h4>
        <span className={full ? "loc-count loc-count--full" : "loc-count"}>
          {capacity === null ? t("table.location.noLimit") : t("table.location.taken", { n: occupants.length, capacity })}
        </span>
      </div>
      <div className="loc-cap" role="group" aria-label={t("table.location.occupants", { location: name })}>
        {occupants.map((occupant) => {
          const owner = summaryOf(model, occupant.playerId);
          return (
            <WorkerPiece
              key={`${occupant.playerId}-${occupant.sequence}`}
              kind={occupant.kind}
              seat={owner?.seatIndex ?? 0}
              own={occupant.playerId === model.viewerId}
              {...(owner === null ? {} : { ownerName: owner.displayName })}
              senior={occupant.viaSeniorApprentice}
            />
          );
        })}
        {Array.from({ length: free }, (_, index) => <span key={`free-${index}`} className="pip" aria-hidden="true" />)}
        {capacity === null && occupants.length > 0 ? <span className="loc-here">{t("table.location.here", { n: occupants.length })}</span> : null}
      </div>
      {recognition === null || recognition.length === 0 ? null : (
        <p className="loc-rec">{t("table.location.recognitionOnly", { from: recognition[0] ?? 0, to: recognition[recognition.length - 1] ?? 0 })}</p>
      )}
      <p className="loc-fx">
        <LocationSummaries locationId={locationId} />
      </p>
      <PlaceButtons locationId={locationId} entries={entries} selection={selection} model={model} />
      {reasons.length === 0 ? null : (
        <Disclosure tone="warn" className="loc-why" summary={t("table.location.cantPlace")}>
          {reasons.map((reason) => <p key={reason}>{reason}</p>)}
        </Disclosure>
      )}
    </article>
  );
}
