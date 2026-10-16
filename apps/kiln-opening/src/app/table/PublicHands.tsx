/**
 * PublicHands (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `handsPublic`: others' hands as counts only.
 *
 * Every player's hand as the table shows it: card backs and "held / limit" (`counts.orderHands`,
 * `handLimits`), never a card face. A pending private look at Orders (`counts.pendingLook`:
 * Commission Market Shifu top 3, Colour Samples) shows who is looking and how many cards, never
 * which. A Guild Hall Shifu inspection is a look at Techs, so TechDisplay announces it instead.
 */
import type { CSSProperties } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { CardBack } from "../pieces/CardBack.tsx";
import { useGame } from "../state/hooks.ts";
import "./PublicHands.css";

export function PublicHands() {
  const t = useT();
  const model = useGame();
  const counts = model.board.counts;
  const pending = counts.pendingLook;
  // Only looks at Orders belong beside the hands; a Guild Hall inspection is shown by TechDisplay.
  const look = pending !== null && pending.kind !== "guild_inspection" ? pending : null;
  const looker = look === null ? null : model.players.find((summary) => summary.playerId === look.playerId) ?? null;
  return (
    <div className="hands-public">
      <h3 className="hands-title">{t("table.hands.title")}</h3>
      <ul className="hands">
        {model.players.map((summary) => {
          const held = counts.orderHands[summary.playerId] ?? summary.orderHandCount;
          const limit = model.handLimits[summary.playerId]?.limit ?? summary.handLimit;
          const name = summary.playerId === model.viewerId ? t("common.nameYou", { name: summary.displayName }) : summary.displayName;
          return (
            <li key={summary.playerId} className="hands-player" style={{ "--pc": `var(--seat-${summary.seatIndex})` } as CSSProperties} data-player-id={summary.playerId}>
              <CardBack count={held} label={t("table.hands.player", { name, n: held, limit })} />
              <span aria-hidden="true">
                <b>{name}</b> <span className="num">{t("table.hands.count", { n: held, limit })}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {look === null || looker === null ? null : (
        <p className="hands-looking" data-player-id={look.playerId}>
          {t("table.hands.looking", { name: looker.displayName, n: look.count })}
        </p>
      )}
    </div>
  );
}
