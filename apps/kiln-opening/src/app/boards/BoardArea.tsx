/**
 * BoardArea (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `boardArea`: D1 board tabs (ARIA tabs) and Your workshop.
 *
 * Owner decision D1: every Kiln Player Board lives in one board area. It shows the viewer's own
 * board by default; tabs on the board's top edge switch to each other player's board (the WAI-ARIA
 * tabs pattern: roving tabindex, arrow keys, one tabpanel); the "Your workshop" tab returns to
 * the viewer's own. The board shown is UI state (`useUi().boardShown`), shared with the seat chips
 * (B1), so a seat chip opens the same board. A spectator sees every board, First Player first.
 */
import { useT } from "../i18n/I18nProvider.tsx";
import { kilnShortName } from "../i18n/content.ts";
import { Tabs } from "../kit/Tabs.tsx";
import type { TabItem } from "../kit/Tabs.tsx";
import { useGame, useUi } from "../state/hooks.ts";
import { PlayerBoard } from "./PlayerBoard.tsx";
import "./BoardArea.css";

const HOME_ICON = (
  <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" focusable="false">
    <path d="M1.5 6.5 7 2l5.5 4.5M3 5.5v6.5h3V9h2v3h3V5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

export function BoardArea() {
  const t = useT();
  const model = useGame();
  const { boardShown, showBoard } = useUi();
  const viewerId = model.me === null ? null : model.me.playerId;
  const fallback = viewerId ?? model.players[0]?.playerId ?? null;
  const shown = boardShown !== null && model.players.some((summary) => summary.playerId === boardShown) ? boardShown : fallback;
  if (shown === null) return null;
  const tabs: TabItem[] = [];
  if (model.me !== null) {
    tabs.push({ id: model.me.playerId, label: t("boards.area.yourWorkshop"), seat: model.me.seatIndex, home: true, icon: HOME_ICON });
  }
  for (const summary of model.players) {
    if (summary.playerId === viewerId) continue;
    const kiln = summary.kilnId === null ? null : kilnShortName(summary.kilnId, t.locale);
    tabs.push({
      id: summary.playerId,
      seat: summary.seatIndex,
      label: kiln === null ? summary.displayName : t("boards.area.tab", { name: summary.displayName, kiln }),
    });
  }
  return (
    <div className="boards" data-board-shown={shown}>
      <Tabs label={t("boards.area.label")} tabs={tabs} selected={shown} onSelect={(id) => showBoard(id === viewerId ? null : id)} className="boards-tabs">
        <PlayerBoard playerId={shown} />
      </Tabs>
    </div>
  );
}
