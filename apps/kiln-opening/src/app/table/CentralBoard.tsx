/**
 * CentralBoard (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `centralBoard`: the five LocationCards with Place shortcuts (`useTableSelection().placeTargets`).
 *
 * The five central locations in board order (`board.centralLocations`), five columns wide,
 * then three, two and one as the container narrows (§7.3 `central-board`).
 */
import { useT } from "../i18n/I18nProvider.tsx";
import { useModel } from "../state/hooks.ts";
import { LocationCard } from "./LocationCard.tsx";
import "./CentralBoard.css";

export function CentralBoard() {
  const t = useT();
  const locations = useModel((model) => model.board.centralLocations);
  return (
    <div className="cb">
      <h3 className="sr-only">{t("table.central.title")}</h3>
      <ul className="locs">
        {locations.map((location) => (
          <li key={location.locationId}>
            <LocationCard locationId={location.locationId} />
          </li>
        ))}
      </ul>
    </div>
  );
}
