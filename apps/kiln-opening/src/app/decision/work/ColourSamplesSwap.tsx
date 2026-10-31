/**
 * ColourSamplesSwap (T10, v1.6.2 L622, R17; UI_V1.6.1_ARCHITECTURE §3.4). Owner: B4.
 *
 * The first half of the Colour Samples swap, before or after a worker action: choose the held
 * Order to give up (radios here, or the Choose toggles on the table's hand row). The note says
 * the whole swap in one line (once per round, not a worker action: give up 1, look at the top 3,
 * reserve 1 of them or 1 from the display: its Select 3, change 25), or only "once per round, not
 * a worker action" when the free-action list above already describes it (`brief`), and the group
 * says where the given-up Order goes (a Main Order face down to the discard pile, a Starting Order
 * back to the box). Each Order shows its card text and opens its rules details from the shared
 * "Rules" pill (D10). An Order after which the look would find fewer cards than usual, or none
 * (the display then offers the reservation), says so (public deck facts, B1); one that cannot be
 * given up shows the engine's reason in the player's words. The look and its reservation follow
 * in the `colour_samples_swap` window (`SelectStep`). Composed by `ActionWindow`; the draft lives
 * in the work draft (`swap`).
 *
 * On phones the form brings the Orders tab up behind the sheet when it opens (the chip above
 * the table, or the after-action list), so collapsing the sheet shows the hand and its
 * Choose toggles, the other way to choose, rather than the Workshop.
 */
import { useEffect } from "react";
import { RULE_NUMBERS } from "../../i18n/content.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { useDraft, useEngineView, useGame, useLayoutMode, useUi } from "../../state/hooks.ts";
import { isPhone } from "../../state/layoutMode.ts";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
import { ORDER_OPTION_CLASS, OrderDetails } from "../orders/OrderCompletionPicker.tsx";
import { colourSamplesSwapDraft } from "./ColourSamplesSwap.draft.ts";
import type { ColourSamplesSwapAction } from "./ColourSamplesSwap.draft.ts";
import { FormNote, OrderLines, OrderReward, useRuleErrorText } from "./pieces.tsx";
import type { WorkAction, WorkDraft } from "./workDraft.ts";

export interface ColourSamplesSwapProps {
  /**
   * The free-action list above already says what the swap does (its description), so the note says
   * only that it is once per round and not a worker action. Without a list above (the swap opened
   * from its chip before the worker action) the note says the whole swap.
   */
  brief?: boolean;
}

export function ColourSamplesSwap({ brief = false }: ColourSamplesSwapProps) {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const errorText = useRuleErrorText();
  const [work, dispatchWork] = useDraft<WorkDraft, WorkAction>();
  const { setSection } = useUi();
  const phone = isPhone(useLayoutMode());
  useEffect(() => {
    // The hand (the table's Choose toggles) is on the Orders tab.
    if (phone) setSection("orders");
  }, [phone, setSection]);
  const draft = work.swap;
  const options = colourSamplesSwapDraft.options(draft, model, engine);
  const dispatch = (action: ColourSamplesSwapAction) => dispatchWork({ type: "swap", action });
  return (
    <div className="b4-sub" data-b4="colour-samples-swap">
      <div className="b4-row">
        <FormNote>{brief ? t("work.swap.noteBrief") : t("work.swap.note", { n: RULE_NUMBERS.swapSelect })}</FormNote>
        <RulesDetail subject={{ kind: "tech", id: options.techId }} />
      </div>
      <OptionGroup
        legend={t("work.swap.discard")}
        description={t("work.swap.where")}
        name="discardOrderId"
        value={draft.discardOrderId}
        onChange={(value) => {
          const choice = options.discards.find((discard) => discard.orderId === value);
          if (choice !== undefined) dispatch({ type: "discard", orderId: choice.orderId });
        }}
      >
        {options.discards.map((discard) => (
          <OptionCard
            key={discard.orderId}
            value={discard.orderId}
            title={discard.orderId}
            meta={<OrderReward orderId={discard.orderId} />}
            description={
              discard.short && discard.legal ? (
                <>
                  <OrderLines orderId={discard.orderId} />
                  <span className="b4-order-quality" data-b4="swap-look-short">{t("work.swap.lookShort", { n: discard.lookCount })}</span>
                </>
              ) : discard.none ? (
                <>
                  <OrderLines orderId={discard.orderId} />
                  <span className="b4-order-quality" data-b4="swap-look-none">{t("work.swap.lookNone")}</span>
                </>
              ) : (
                <OrderLines orderId={discard.orderId} />
              )
            }
            disabled={!discard.legal}
            reason={discard.reason === null ? undefined : errorText(discard.reason)}
            className={ORDER_OPTION_CLASS}
          >
            <OrderDetails orderId={discard.orderId} />
          </OptionCard>
        ))}
      </OptionGroup>
    </div>
  );
}
