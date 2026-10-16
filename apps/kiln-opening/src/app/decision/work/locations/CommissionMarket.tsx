/**
 * CommissionMarket (UI_V1.6.1_ARCHITECTURE §3.4; wireframe `subEditor` commission_market).
 * Owner: B4.
 *
 * The first reservation: a face-up Order (also choosable on the display, `TableSelection`) and
 * the resource gained after it; a blind reservation; or the Shifu's private look. Every Order
 * shows its card text and opens its rules details (D10).
 */
import { useT } from "../../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../../kit/OptionCard.tsx";
import { OptionGroup } from "../../../kit/OptionGroup.tsx";
import { FormNote, OrderLines, OrderReward } from "../pieces.tsx";
import { RulesDetail } from "../../../rules/RulesDetail.tsx";
import type { CommissionFirstKey, CommissionMarketAction, CommissionMarketDraft, CommissionMarketOptions } from "./CommissionMarket.draft.ts";
import type { LocationEditorProps } from "./editor.ts";
import { amountText } from "./shared.ts";

export type CommissionMarketProps = LocationEditorProps<CommissionMarketDraft, CommissionMarketAction, CommissionMarketOptions>;

export function CommissionMarket({ draft, options, dispatch }: CommissionMarketProps) {
  const t = useT();
  const keys: CommissionFirstKey[] = [...options.slots.map((slot) => slot.key), ...(options.blind ? (["blind"] as const) : []), ...(options.look ? (["look"] as const) : [])];
  return (
    <div className="b4-sub" data-location="commission_market">
      <OptionGroup
        legend={t("work.cm.reserve")}
        aside={options.maxReservations > 1 ? t("work.cm.reservationN", { a: 1, b: options.maxReservations }) : undefined}
        name="first"
        value={draft.first}
        onChange={(value) => {
          const key = keys.find((candidate) => candidate === value);
          if (key !== undefined) dispatch({ type: "first", first: key });
        }}
      >
        {options.slots.map((slot) => (
          <OptionCard
            key={slot.key}
            value={slot.key}
            title={t("work.cm.slot", { n: slot.slotIndex + 1, order: slot.orderId })}
            meta={<OrderReward orderId={slot.orderId} />}
            description={<OrderLines orderId={slot.orderId} />}
          >
            <RulesDetail subject={{ kind: "order", id: slot.orderId }} />
          </OptionCard>
        ))}
        {options.blind ? <OptionCard value="blind" title={t("work.cm.blind")} /> : null}
        {options.look ? <OptionCard value="look" title={t("work.cm.look")} /> : null}
      </OptionGroup>
      {options.needsGain ? (
        <OptionGroup
          legend={t("work.cm.gain")}
          name="gain"
          layout="pills"
          value={draft.gain}
          onChange={(value) => {
            const gain = options.gains.find((candidate) => candidate === value);
            if (gain !== undefined) dispatch({ type: "gain", gain });
          }}
        >
          {options.gains.map((gain) => (
            <OptionCard key={gain} variant="pill" value={gain} title={amountText(t, gain, options.gainAmount)} />
          ))}
        </OptionGroup>
      ) : null}
      {options.slots.length > 0 ? <FormNote>{t("work.cm.emptySlotNote")}</FormNote> : null}
    </div>
  );
}
