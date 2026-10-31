/**
 * FinishedCeramicsStrip (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `secOrders` orders branch: `me.finishedCeramicIds`, highlighted groups.
 *
 * In the Order Phase, and in the viewer's own Work turn when they hold any (the free actions come
 * before and after the worker action, owner revision 5, change 36), the viewer's Finished ceramics
 * beside their hand, with the ceramics the open completion has chosen highlighted
 * (`highlightedCeramicIds`), and the reminder that face-up Main Orders cannot be completed. Only
 * held Orders are completed; the picker itself is the decision window's. A Flawed ceramic the
 * viewer may sell now carries a Sell button (`SellButton`, a free action). Nothing renders
 * otherwise, or for a spectator.
 */
import { useT } from "../i18n/I18nProvider.tsx";
import { locationName } from "../i18n/content.ts";
import { ceramicLabel } from "../i18n/ceramicLabel.ts";
import { useGame, useTableSelection } from "../state/hooks.ts";
import { CeramicPiece } from "./CeramicPiece.tsx";
import { SellButton } from "./SellButton.tsx";
import { ceramicsFor, tableCeramics } from "./tableData.ts";
import "./FinishedCeramicsStrip.css";

export function FinishedCeramicsStrip() {
  const t = useT();
  const model = useGame();
  const selection = useTableSelection();
  const me = model.me;
  if (me === null) return null;
  if (model.roundPhase !== "orders" && (model.window.kind !== "work" || me.finishedCeramicIds.length === 0)) return null;
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
            <li key={ceramic.id} className="finished-item">
              <CeramicPiece
                ceramic={ceramic}
                seat={me.seatIndex}
                view={labelView}
                marker={ceramic.id === undefined ? null : markers.get(ceramic.id) ?? null}
                highlighted={ceramic.id !== undefined && selection.highlightedCeramicIds.has(ceramic.id)}
                size={40}
                withOwner={false}
              />
              {ceramic.id === undefined ? null : <SellButton ceramicId={ceramic.id} label={ceramicLabel(ceramic, labelView, { locale: t, withOwner: false, withPlace: true })} selection={selection} />}
            </li>
          ))}
          {unknown === 0 ? null : <li className="finished-count">{t("table.finished.count", { n: unknown })}</li>}
        </ul>
      )}
      <p className="finished-note">{t("table.finished.faceUpNote", { market: locationName("commission_market", t.locale) })}</p>
    </div>
  );
}
