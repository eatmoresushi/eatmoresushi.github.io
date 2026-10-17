/**
 * CommissionStep (UI_V1.6.1_ARCHITECTURE §3.4 `commission`; v1.6.2 L189–200, B1, B3). Owner: B4.
 *
 * After placing at the Commission Market: the privately looked-at Orders ("Only you can see")
 * and the Orders on the display, one choice list each (both also choosable on the table: the
 * look row and the display). The Apprentice effect reserves exactly 1 (radios across both
 * lists); the Shifu effect 1 or 2 in any mix (checkboxes; once 2 are chosen the others are
 * unavailable, with the reason). The looked cards not reserved go face down to the bottom of the
 * Main Order deck; a display position reserved stays empty until the turn ends. A look that
 * showed fewer cards than its size says the deck ran short (B1); one that showed none says
 * there was nothing to look at. Others see only that you are looking, and how many cards.
 *
 * Every Order shows its card text, and its rules details (D10) open from the shared "Rules" pill
 * in the option card's corner (`OrderDetails`, as in every Order choice of the pane). The form
 * renders only from `commissionDraft.options()`.
 */
import { useT } from "../../i18n/I18nProvider.tsx";
import { Chip } from "../../kit/Chip.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { ORDER_OPTION_CLASS, OrderDetails } from "../orders/OrderCompletionPicker.tsx";
import { commissionDraft } from "./CommissionStep.draft.ts";
import type { CommissionAction, CommissionChoice, CommissionDraft, CommissionPickKey } from "./CommissionStep.draft.ts";
import { FormNote, OrderLines, OrderReward } from "./pieces.tsx";
import "./pieces.css";

export function CommissionStep() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [draft, dispatch] = useDraft<CommissionDraft, CommissionAction>();
  const options = commissionDraft.options(draft, model, engine);
  const me = model.me;
  const multi = options.maxReservations > 1;
  const keys = [...options.looked, ...options.slots].map((choice) => choice.key);
  const onChange = (value: string, checked: boolean) => {
    const key = keys.find((candidate) => candidate === value);
    if (key === undefined) return;
    dispatch(multi ? { type: "toggle", key, on: checked } : { type: "pick", key });
  };
  const radio = draft.picks[0] ?? null;
  const card = (choice: CommissionChoice) => {
    const unavailable = multi && options.full && !draft.picks.includes(choice.key);
    return (
      <OptionCard
        key={choice.key}
        value={choice.key}
        title={choice.slotIndex === null ? choice.orderId : t("work.cm.slot", { n: choice.slotIndex + 1, order: choice.orderId })}
        meta={<OrderReward orderId={choice.orderId} />}
        description={<OrderLines orderId={choice.orderId} />}
        disabled={unavailable}
        reason={unavailable ? t("work.cm.limitReached", { n: options.maxReservations }) : undefined}
        className={ORDER_OPTION_CLASS}
      >
        <OrderDetails orderId={choice.orderId} />
      </OptionCard>
    );
  };
  const group = {
    name: "reservations",
    type: multi ? ("checkbox" as const) : ("radio" as const),
    ...(multi ? { values: draft.picks as readonly CommissionPickKey[] } : { value: radio }),
    onChange,
  };
  const looked = options.looked.length;
  return (
    <div className="b4-form" data-b4="commission" data-max={options.maxReservations}>
      <p className="b4-prompt">{multi ? t("work.cm.promptTwo", { n: options.maxReservations }) : t("work.cm.promptOne")}</p>
      {looked === 0 ? (
        <FormNote>{t("work.cm.lookNone")}</FormNote>
      ) : (
        <OptionGroup
          {...group}
          legend={t("work.cm.lookTitle", { n: looked })}
          aside={<Chip tone="private">{t("common.status.onlyYou")}</Chip>}
          description={options.short ? t("work.cm.lookedShort", { n: looked }) : t("work.cm.lookRest")}
        >
          {options.looked.map(card)}
        </OptionGroup>
      )}
      {options.slots.length === 0 ? null : (
        <OptionGroup {...group} legend={t("work.cm.display")} description={t("work.cm.emptySlotNote")}>
          {options.slots.map(card)}
        </OptionGroup>
      )}
      {multi ? (
        <p className="b4-note b4-note--muted num" data-b4="commission-count">
          {t("work.cm.chosenN", { a: draft.picks.length, b: options.maxReservations })}
        </p>
      ) : null}
      {me === null || looked === 0 ? null : (
        <div className="b4-privacy">
          <strong>{t("work.cm.othersSee")}</strong>
          <span>{t("work.cm.looking", { name: me.displayName, n: looked })}</span>
        </div>
      )}
    </div>
  );
}
