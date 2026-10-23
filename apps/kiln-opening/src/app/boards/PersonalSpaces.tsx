/**
 * PersonalSpaces (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `personalSpaces`: D7 wording ("Added by ⟨Tech⟩").
 *
 * The two personal locations on a Kiln Player Board, Form & Decorate and Glaze & Load, two spaces
 * each (`playerSummary(...).personalSpaces`):
 * - a worker standing there; an empty space; or, for a second space not yet added, the D7 sentence
 *   from `formatRuleError(PERSONAL_SPACE_LOCKED)`: "Learn a Form & Decorate Tech to add this
 *   space" / 习得坯作技艺即添此工位 — never "locked";
 * - once added, "Added by ⟨Tech⟩" / 由「⟨技艺⟩」添设 (`addedByTechId`, §5 gap 11);
 * - the location name, as plain text: like the table's action spaces, a personal action space has
 *   no rules-details link (owner review, 2026-10-17);
 * - on the viewer's own board during their work turn, Place shortcuts from `placeTargets`
 *   (the next free space is marked when the pane's draft has chosen this location), and the
 *   engine's reason when the location cannot be used (CR B2-3).
 */
import type { PersonalLocationId, PlayerId } from "../../game/index.ts";
import { PERSONAL_LOCATION_IDS } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { locationName, techName } from "../i18n/content.ts";
import { ruleErrorText } from "../i18n/errors.ts";
import { Disclosure } from "../kit/Disclosure.tsx";
import { WorkerPiece } from "../pieces/WorkerPiece.tsx";
import { useGame, useTableSelection } from "../state/hooks.ts";
import { PlaceButtons, unavailableReasons } from "../table/LocationCard.tsx";
import { nextFreePersonalSpace, summaryOf } from "../table/tableData.ts";
import "./PersonalSpaces.css";

export interface PersonalSpacesProps {
  /** Whose spaces. */
  playerId: PlayerId;
}

const TONE: Readonly<Record<PersonalLocationId, string>> = { form_decorate: "psp--fd", glaze_load: "psp--gl" };

export function PersonalSpaces({ playerId }: PersonalSpacesProps) {
  const t = useT();
  const model = useGame();
  const selection = useTableSelection();
  const summary = summaryOf(model, playerId);
  if (summary === null) return null;
  const own = playerId === model.viewerId;
  return (
    <div className="pspaces">
      {PERSONAL_LOCATION_IDS.map((locationId) => {
        const spaces = summary.personalSpaces.filter((space) => space.locationId === locationId);
        const entries = own ? selection.placeTargets.get(locationId) ?? [] : [];
        const chosen = own && selection.activePlacement !== null && selection.activePlacement.locationId === locationId;
        const next = chosen ? nextFreePersonalSpace(summary, locationId) : null;
        const added = spaces.find((space) => space.spaceIndex === 1 && space.unlocked && space.addedByTechId !== null);
        const reasons = own ? unavailableReasons(entries, model, t) : [];
        const name = locationName(locationId, t.locale);
        return (
          <div key={locationId} className={`psp ${TONE[locationId]}`} data-location-id={locationId}>
            <span className="psp-name">{name}</span>
            <ul className="psp-slots">
              {spaces.map((space) => {
                if (!space.unlocked) {
                  return (
                    <li key={space.spaceIndex} className="psp-slot psp-slot--add">
                      <span className="psp-plus" aria-hidden="true">+</span>
                      <span>{ruleErrorText({ code: "PERSONAL_SPACE_LOCKED", details: { locationId } }, t)}</span>
                    </li>
                  );
                }
                if (space.occupant !== null) {
                  return (
                    <li key={space.spaceIndex} className="psp-slot">
                      <WorkerPiece
                        kind={space.occupant.kind}
                        seat={summary.seatIndex}
                        own={own}
                        ownerName={summary.displayName}
                        senior={space.occupant.viaSeniorApprentice}
                      />
                    </li>
                  );
                }
                const pending = next === space.spaceIndex;
                return (
                  <li key={space.spaceIndex} className={pending ? "psp-slot psp-slot--pending" : "psp-slot"}>
                    <span className="sr-only">{pending ? t("boards.spaces.pending") : t("boards.spaces.empty")}</span>
                  </li>
                );
              })}
            </ul>
            {added === undefined || added.addedByTechId === null ? null : (
              <p className="psp-added">{t.rich("boards.spaces.addedBy", { tech: techName(added.addedByTechId, t.locale) })}</p>
            )}
            {own ? <PlaceButtons locationId={locationId} entries={entries} selection={selection} model={model} /> : null}
            {reasons.length === 0 ? null : (
              <Disclosure tone="warn" className="loc-why" summary={t("table.location.cantPlace")}>
                {reasons.map((reason) => <p key={reason}>{reason}</p>)}
              </Disclosure>
            )}
          </div>
        );
      })}
    </div>
  );
}
