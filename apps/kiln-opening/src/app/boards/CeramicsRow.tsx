/**
 * CeramicsRow (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `ceramicsRow`.
 *
 * A board's ceramics by stage: Shaped (in the workshop), In kiln (Shared or Imperial Kiln, with
 * this firing's recorded Quality once assigned), Finished. Each is a ceramic chip described in
 * words (D9) with its details; chips the open decision points at are highlighted
 * (`highlightedCeramicIds`). All undelivered ceramics are public (AGENTS.md). While a group's
 * attributes are not in the model (CR B2-1), the group shows its count instead. On the viewer's
 * own board, a Flawed ceramic they may sell now carries a Sell button (`SellButton`, change 30,
 * R20: only during their own turn).
 */
import type { CeramicId, PlayerId } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { ceramicLabel } from "../i18n/ceramicLabel.ts";
import { useGame, useTableSelection } from "../state/hooks.ts";
import { CeramicPiece } from "../table/CeramicPiece.tsx";
import { SellButton } from "../table/SellButton.tsx";
import { ceramicsFor, summaryOf, tableCeramics } from "../table/tableData.ts";
import "./CeramicsRow.css";

export interface CeramicsRowProps {
  /** Whose ceramics. */
  playerId: PlayerId;
}

type Group = { key: "shaped" | "inKiln" | "finished"; ids: readonly CeramicId[] };

export function CeramicsRow({ playerId }: CeramicsRowProps) {
  const t = useT();
  const model = useGame();
  const selection = useTableSelection();
  const summary = summaryOf(model, playerId);
  if (summary === null) return null;
  const { labelView, markers } = tableCeramics(model);
  const groups: Group[] = [
    { key: "shaped", ids: summary.shapedCeramicIds },
    { key: "inKiln", ids: summary.loadedCeramicIds },
    { key: "finished", ids: summary.finishedCeramicIds },
  ];
  const shown = groups.filter((group) => group.ids.length > 0);
  return (
    <div className="cerrow" role="group" aria-label={t("boards.ceramics.title")}>
      <span className="prow-lab">{t("boards.ceramics.title")}</span>
      {shown.length === 0 ? <span className="cerrow-none">{t("boards.ceramics.none")}</span> : null}
      {shown.map((group) => {
        const { known, unknown } = ceramicsFor(model, group.ids);
        return (
          <div key={group.key} className="cerrow-group" data-stage={group.key}>
            <span className="cerrow-lab">{t(`boards.ceramics.${group.key}`)}</span>
            <ul className="cerrow-list">
              {known.map((ceramic) => (
                <li key={ceramic.id} className="cerrow-item">
                  <CeramicPiece
                    ceramic={ceramic}
                    seat={summary.seatIndex}
                    view={labelView}
                    marker={ceramic.id === undefined ? null : markers.get(ceramic.id) ?? null}
                    highlighted={ceramic.id !== undefined && selection.highlightedCeramicIds.has(ceramic.id)}
                    withOwner={false}
                  />
                  {ceramic.id === undefined || playerId !== model.viewerId ? null : (
                    <SellButton ceramicId={ceramic.id} label={ceramicLabel(ceramic, labelView, { locale: t, withOwner: false, withPlace: true })} selection={selection} />
                  )}
                </li>
              ))}
              {unknown === 0 ? null : <li className="cerrow-count">{t("boards.ceramics.count", { n: unknown })}</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
