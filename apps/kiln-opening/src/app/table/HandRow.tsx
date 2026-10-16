/**
 * HandRow (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `handRow`: `model.hand` with completable, chosen and discard states.
 *
 * The viewer's own Orders (private: only the authenticated owner's view carries them), marked
 * "Only you can see", with the held count against the hand limit (`handLimits`). Over the limit,
 * it says whether Cleanup will trim (`trimDue`) or not (the final round skips the trim); the
 * warning is left out while the trim window itself is open. Each card's target state (Order
 * Phase completable / chosen, hand-trim discard) comes from `orderTargets`, keyed by OrderId.
 * A spectator has no hand: nothing renders.
 */
import { useT } from "../i18n/I18nProvider.tsx";
import { Chip } from "../kit/Chip.tsx";
import { useGame } from "../state/hooks.ts";
import { OrderCard } from "./OrderCard.tsx";
import { OrderRow } from "./OrderRow.tsx";

export function HandRow() {
  const t = useT();
  const model = useGame();
  const viewerId = model.viewerId;
  if (viewerId === null || model.me === null) return null;
  const status = model.handLimits[viewerId];
  const held = status?.held ?? model.hand.length;
  const limit = status?.limit ?? model.me.handLimit;
  const over = status !== undefined && status.mustDiscard > 0 && model.window.kind !== "hand_limit" ? (status.trimDue ? "trim" : "final") : null;
  return (
    <OrderRow
      className="ordwrap--hand"
      title={t("table.hand.title")}
      meta={
        <>
          <Chip tone="private">{t("common.status.onlyYou")}</Chip>
          <span className="num">{t("table.hand.held", { n: held, limit })}</span>
          {over === "trim" ? <Chip tone="warn">{t("table.hand.overLimit")}</Chip> : null}
          {over === "final" ? <Chip>{t("table.hand.noFinalTrim")}</Chip> : null}
        </>
      }
    >
      {model.hand.length === 0 ? (
        <li className="orow-note">{t("table.hand.empty")}</li>
      ) : (
        model.hand.map((orderId) => (
          <li key={orderId}>
            <OrderCard orderId={orderId} own />
          </li>
        ))
      )}
    </OrderRow>
  );
}
