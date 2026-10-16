/**
 * OrderDisplay (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `displayRow`: `board.mainDisplay` (pending empty slots), deck and discard counts.
 *
 * The six face-up Main Orders, oldest (#1) to newest. A position emptied by a reservation stays
 * empty until the reserving player's turn ends ("Refills when Zhao’s turn ends", L190, L390);
 * a position left empty because both piles ran out says so (B1). The Main deck and its face-down
 * discard show their counts, as on the table (§5 "Deck counts"); the Fire deck never does (D4).
 * Display slots are table targets keyed `slot:<i>` (the Commission Market adapter).
 */
import type { PlayerId } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { useGame, usePlayerName } from "../state/hooks.ts";
import { displaySlotKey } from "../state/tableSelection.ts";
import { OrderCard } from "./OrderCard.tsx";
import { OrderRow } from "./OrderRow.tsx";

export function OrderDisplay() {
  const t = useT();
  const model = useGame();
  const playerName = usePlayerName();
  const display = model.board.mainDisplay;
  const counts = model.board.counts;
  const pending: PlayerId | null = model.board.refillPendingFor;
  return (
    <OrderRow
      ordered
      className="ordwrap--display"
      title={t("table.display.title")}
      meta={
        <>
          <span>{t("table.display.order", { first: 1, last: display.length })}</span>
          <span>{t("table.display.decks", { deck: counts.mainDeck, discard: counts.mainDiscard })}</span>
        </>
      }
    >
      {display.map((orderId, index) => (
        <li key={orderId ?? `empty-${index}`}>
          {orderId === null ? (
            <div className="ord-empty" data-motion="order-slot" data-motion-key={displaySlotKey(index)}>
              <span className="ord-slot" aria-hidden="true">{t("table.display.slot", { n: index + 1 })}</span>
              <span>{pending === null ? t("table.display.emptyNone") : t.rich("table.display.emptyRefill", { name: playerName(pending) })}</span>
            </div>
          ) : (
            <OrderCard orderId={orderId} targetKey={displaySlotKey(index)} slot={index + 1} />
          )}
        </li>
      ))}
    </OrderRow>
  );
}
