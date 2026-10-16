/**
 * FinishedCeramicsStrip (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `secOrders` orders branch: `me.finishedCeramicIds`, highlighted groups.
 *
 * In the Order Phase, the viewer's Finished ceramics beside their hand, with the ceramics the
 * open Order decision has chosen highlighted (`highlightedCeramicIds`), and the reminder that
 * face-up Main Orders cannot be completed (L297). Only held Orders are completed; the picker
 * itself is B5's decision window. Nothing renders outside the Order Phase or for a spectator.
 */
import { useT } from "../i18n/I18nProvider.tsx";
import { locationName } from "../i18n/content.ts";
import { useGame, useTableSelection } from "../state/hooks.ts";
import { CeramicPiece } from "./CeramicPiece.tsx";
import { ceramicsFor, tableCeramics } from "./tableData.ts";
import "./FinishedCeramicsStrip.css";

export function FinishedCeramicsStrip() {
  const t = useT();
  const model = useGame();
  const selection = useTableSelection();
  const me = model.me;
  if (me === null || model.roundPhase !== "orders") return null;
  const { known, unknown } = ceramicsFor(model, me.finishedCeramicIds);
  const { labelView, markers } = tableCeramics(model);
  return (
    <div className="finished-strip">
      <h3 className="finished-title">{t("table.finished.title")}</h3>
      {me.finishedCeramicIds.length === 0 ? (
        <p className="finished-none">{t("table.finished.none")}</p>
      ) : (
        <ul className="finished-list">
          {known.map((ceramic) => (
            <li key={ceramic.id}>
              <CeramicPiece
                ceramic={ceramic}
                seat={me.seatIndex}
                view={labelView}
                marker={ceramic.id === undefined ? null : markers.get(ceramic.id) ?? null}
                highlighted={ceramic.id !== undefined && selection.highlightedCeramicIds.has(ceramic.id)}
                size={40}
                withOwner={false}
              />
            </li>
          ))}
          {unknown === 0 ? null : <li className="finished-count">{t("table.finished.count", { n: unknown })}</li>}
        </ul>
      )}
      <p className="finished-note">{t("table.finished.faceUpNote", { market: locationName("commission_market", t.locale) })}</p>
    </div>
  );
}
