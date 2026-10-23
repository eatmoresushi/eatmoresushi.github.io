/**
 * MagistratesHall (UI_V1.6.1_ARCHITECTURE §3.4; wireframe `subEditor` magistrates_hall). Owner: B4.
 *
 * The price (4 Coins for either worker, change 33) and the Imperial Recognition reached
 * (`magistratesHallQuote`), that milestone's reward with its rules details (D10), and the
 * resulting resources. The Shifu then may reserve 1 face-up Crown Order (R21: optional): the
 * display's Crown Orders as radio cards, with "Reserve none", also choosable with the display's
 * Choose toggles on the table; its position stays empty until the end of the turn.
 */
import { recognitionMilestones } from "../../../i18n/content.ts";
import { useT } from "../../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../../kit/OptionCard.tsx";
import { OptionGroup } from "../../../kit/OptionGroup.tsx";
import { ORDER_OPTION_CLASS, OrderDetails } from "../../orders/OrderCompletionPicker.tsx";
import { FormNote, OrderLines, OrderReward, ResourceDelta, useRuleErrorText } from "../pieces.tsx";
import { RulesDetail } from "../../../rules/RulesDetail.tsx";
import type { MagistratesHallAction, MagistratesHallDraft, MagistratesHallOptions } from "./MagistratesHall.draft.ts";
import type { LocationEditorProps } from "./editor.ts";
import { amountsText } from "./shared.ts";

export type MagistratesHallProps = LocationEditorProps<MagistratesHallDraft, MagistratesHallAction, MagistratesHallOptions>;

const NO_CROWN = "none";

export function MagistratesHall({ draft, options, dispatch, context }: MagistratesHallProps) {
  const t = useT();
  const errorText = useRuleErrorText();
  const reachable = options.reachable;
  const milestone = reachable === null ? undefined : recognitionMilestones(t.locale).find((space) => space.space === reachable);
  return (
    <div className="b4-sub" data-location="magistrates_hall">
      <p>{t("work.mh.pay", { pay: amountsText(t, options.quote.pay) })}</p>
      {reachable === null ? null : <p>{t("work.mh.recognition", { from: options.from, to: reachable })}</p>}
      {milestone === undefined || reachable === null ? null : (
        <div className="b4-sub-block">
          <p className="b4-sub-title">{t("work.mh.reward", { to: reachable })}</p>
          <p>
            <strong>{milestone.title}</strong>
            {milestone.reward === null ? null : <span> · {milestone.reward}</span>}
          </p>
          <RulesDetail subject={{ kind: "recognition", space: reachable }} />
        </div>
      )}
      {!options.reservesCrown ? null : options.crownOrders.length === 0 ? (
        <FormNote>{t("work.mh.crownNone")}</FormNote>
      ) : (
        <OptionGroup
          legend={t("work.mh.crownTitle")}
          description={t("work.mh.crownNote")}
          name="crownOrder"
          value={draft.crownSlot === null ? NO_CROWN : String(draft.crownSlot)}
          onChange={(value) => {
            const choice = options.crownOrders.find((candidate) => String(candidate.slotIndex) === value);
            dispatch({ type: "crown", slotIndex: choice?.slotIndex ?? null });
          }}
        >
          <OptionCard value={NO_CROWN} title={t("work.mh.crownSkip")} />
          {options.crownOrders.map((choice) => (
            <OptionCard
              key={choice.slotIndex}
              value={String(choice.slotIndex)}
              title={t("work.cm.slot", { n: choice.slotIndex + 1, order: choice.orderId })}
              meta={<OrderReward orderId={choice.orderId} />}
              description={<OrderLines orderId={choice.orderId} />}
              className={ORDER_OPTION_CLASS}
            >
              <OrderDetails orderId={choice.orderId} />
            </OptionCard>
          ))}
        </OptionGroup>
      )}
      {options.quote.ok || options.quote.error === null ? null : <FormNote tone="error">{errorText(options.quote.error)}</FormNote>}
      <ResourceDelta before={context.me.resources} after={options.after} />
    </div>
  );
}
