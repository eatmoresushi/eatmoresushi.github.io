/**
 * FreeActionList (owner UI decision D21; `decision/freeActions.ts`). Owner: B6.
 *
 * The pane's list of what the viewer can do right now, in the after-action step and the Order Phase
 * turn: "the same list of free actions" as the chips before placing. One radio per entry; choosing
 * one opens that action's form below it. A Deliver entry shows the Order's card text, its printed
 * reward and its rules details (D10). Renders only what it is given. The input name `freeAction` and
 * the values (`complete-O22`, `sell_flawed`, `imperial_priority`, `colour_samples_swap`) are the
 * test driver's hooks (§9.6).
 */
import { RULE_NUMBERS, orderRequirements } from "../i18n/content.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { orderQualityLine } from "../i18n/orderText.ts";
import { OptionCard } from "../kit/OptionCard.tsx";
import { OptionGroup } from "../kit/OptionGroup.tsx";
import { ORDER_OPTION_CLASS, OrderDetails, OrderReward } from "./orders/OrderCompletionPicker.tsx";
import { freeActionLabel } from "./freeActions.ts";
import type { FreeActionItem, FreeActionKey } from "./freeActions.ts";

export interface FreeActionListProps {
  items: readonly FreeActionItem[];
  value: FreeActionKey | null;
  onChange: (key: FreeActionKey) => void;
}

export function FreeActionList({ items, value, onChange }: FreeActionListProps) {
  const t = useT();
  return (
    <OptionGroup
      legend={t("common.freeActions")}
      name="freeAction"
      value={value}
      onChange={(next) => {
        const key = items.find((item) => item.key === next)?.key;
        if (key !== undefined) onChange(key);
      }}
    >
      {items.map((item) =>
        item.kind === "deliver" ? (
          <OptionCard
            key={item.key}
            value={item.key}
            title={t.message(freeActionLabel(item))}
            meta={<OrderReward orderId={item.orderId} />}
            description={t("orders.requirementLine", { requirements: orderRequirements(item.orderId, t.locale), quality: orderQualityLine(item.orderId, t) })}
            className={ORDER_OPTION_CLASS}
          >
            <OrderDetails orderId={item.orderId} />
          </OptionCard>
        ) : (
          <OptionCard
            key={item.key}
            value={item.key}
            title={t.message(freeActionLabel(item))}
            description={item.kind === "swap" ? t("work.work.mode.swapHint", { n: RULE_NUMBERS.swapSelect }) : undefined}
          />
        ),
      )}
    </OptionGroup>
  );
}
