/**
 * CommissionMarket (UI_V1.6.1_ARCHITECTURE §3.4; v1.6.2 L189–200). Owner: B4.
 *
 * Nothing to choose at placement: the pane says what follows. Confirm opens the private look
 * (only you see the cards), and the next step reserves from the display and the looked cards.
 * The note says how many cards the look will show when the deck runs short (B1: a look never
 * completes itself from a reshuffle), and that a reserved display position stays empty until
 * the turn ends.
 */
import { useT } from "../../../i18n/I18nProvider.tsx";
import { FormNote } from "../pieces.tsx";
import type { CommissionMarketAction, CommissionMarketDraft, CommissionMarketOptions } from "./CommissionMarket.draft.ts";
import type { LocationEditorProps } from "./editor.ts";

export type CommissionMarketProps = LocationEditorProps<CommissionMarketDraft, CommissionMarketAction, CommissionMarketOptions>;

export function CommissionMarket({ options }: CommissionMarketProps) {
  const t = useT();
  const short = options.lookCount < options.lookSize;
  return (
    <div className="b4-sub" data-location="commission_market">
      <p>{options.maxReservations > 1 ? t("work.cm.planTwo", { n: options.lookSize, max: options.maxReservations }) : t("work.cm.planOne", { n: options.lookSize })}</p>
      {short ? (
        <FormNote>{options.lookCount === 0 ? t("work.cm.lookNone") : t("work.cm.lookShort", { n: options.lookCount })}</FormNote>
      ) : null}
      <FormNote tone="private">{t("work.cm.lookPrivate")}</FormNote>
      {options.faceUpCount > 0 ? <FormNote>{t("work.cm.emptySlotNote")}</FormNote> : null}
    </div>
  );
}
