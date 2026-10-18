/**
 * PlayerBoard (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `boardFull`: kiln tradition, resources, workers, hand, personal spaces, Tech slots, ceramics.
 *
 * One full Kiln Player Board, from `playerSummary` (public information only). The viewer's own
 * hand shows its count (no "Only you can see" pill, owner review 2026-10-18); another player's hand shows card backs and a
 * count, never a card. Score is the score-track value `recordedVp` (Orders, Kiln abilities,
 * Crowns and Imperial Audience; a Tech scores nothing, v1.6.2 change 27), never a projection.
 */
import { useId } from "react";
import type { CSSProperties } from "react";
import type { PlayerId } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { RULE_NUMBERS } from "../i18n/content.ts";
import { Chip } from "../kit/Chip.tsx";
import { CardBack } from "../pieces/CardBack.tsx";
import { ResourceRow } from "../pieces/ResourceRow.tsx";
import { useGame } from "../state/hooks.ts";
import { RulesDetail } from "../rules/RulesDetail.tsx";
import { summaryOf } from "../table/tableData.ts";
import { CeramicsRow } from "./CeramicsRow.tsx";
import { KilnTradition, MarkerLine } from "./KilnTradition.tsx";
import { PersonalSpaces } from "./PersonalSpaces.tsx";
import { TechSlots } from "./TechSlots.tsx";
import { WorkersRow } from "./WorkersRow.tsx";
import "./PlayerBoard.css";

export interface PlayerBoardProps {
  /** Whose board. */
  playerId: PlayerId;
}

export function PlayerBoard({ playerId }: PlayerBoardProps) {
  const t = useT();
  const model = useGame();
  const headingId = useId();
  const summary = summaryOf(model, playerId);
  if (summary === null) return null;
  const me = playerId === model.viewerId;
  const name = me ? t("common.nameYou", { name: summary.displayName }) : summary.displayName;
  const status = model.handLimits[playerId];
  const held = status?.held ?? summary.orderHandCount;
  const limit = status?.limit ?? summary.handLimit;
  return (
    <article
      className="kpb"
      style={{ "--pc": `var(--seat-${summary.seatIndex})` } as CSSProperties}
      aria-labelledby={headingId}
      data-player-id={playerId}
      data-motion="board"
      data-motion-key={playerId}
    >
      <header className="kpb-h">
        <h4 id={headingId} className="kpb-name">{name}</h4>
        {summary.isFirstPlayer ? <Chip tone="gold">{t("boards.board.firstPlayer")}</Chip> : null}
        <Chip>{t("boards.board.recognition", { n: summary.recognition, max: RULE_NUMBERS.recognitionMax })}</Chip>
        {me ? null : <Chip>{t("boards.board.publicOnly")}</Chip>}
        <span className="kpb-vp">{t.rich("boards.board.vp", { n: summary.recordedVp })}</span>
      </header>
      <div className="kpb-grid">
        <div className="kpb-col">
          <KilnTradition playerId={playerId} />
          <div className="prow">
            <span className="prow-lab">{t("boards.board.resources")}</span>
            <ResourceRow resources={summary.resources} label={t("boards.board.resources")} />
          </div>
          <div className="prow">
            <span className="prow-lab">{t("boards.board.workers")}</span>
            <WorkersRow playerId={playerId} />
            <span className="prow-note">{t("boards.board.workersLeft", { n: summary.availableWorkerIds.length })}</span>
          </div>
          <div className="prow">
            <span className="prow-lab">{t("boards.board.hand")}</span>
            {me ? (
              <>
                <CardBack count={held} label={t("table.hand.held", { n: held, limit })} />
                <span className="prow-note num" aria-hidden="true">{t("table.hand.held", { n: held, limit })}</span>
              </>
            ) : (
              <>
                <CardBack count={held} label={t("common.piece.ordersInHand", { n: held })} />
                <span className="prow-note" aria-hidden="true">{t("boards.board.handHidden", { n: held })}</span>
              </>
            )}
          </div>
        </div>
        <div className="kpb-col">
          <PersonalSpaces playerId={playerId} />
          <TechSlots playerId={playerId} />
        </div>
      </div>
      <CeramicsRow playerId={playerId} />
      <p className="kpb-markers"><MarkerLine playerId={playerId} /></p>
      <div className="prow">
        <span className="prow-lab">{t("boards.board.completed")}</span>
        {summary.completedOrders.length === 0 ? (
          <span className="prow-note">{t("common.none")}</span>
        ) : (
          <ul className="kpb-orders">
            {summary.completedOrders.map((record) => (
              <li key={record.orderId}>
                <RulesDetail
                  subject={{ kind: "order", id: record.orderId }}
                  className="kpb-order"
                  trigger={<span className="kpb-order-face">{t("boards.board.completedOrder", { order: record.orderId, vp: t("common.vpN", { n: record.vp }) })}</span>}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

