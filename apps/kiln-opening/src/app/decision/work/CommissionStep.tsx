/**
 * CommissionStep (UI_V1.6.1_ARCHITECTURE §3.4 `commission`; wireframe `decLook`). Owner: B4.
 *
 * - `reservation`: reserve again (face-up Order + gain, blind, or the Shifu's look) or stop.
 * - `look_choice`: the privately looked-at Orders ("Only you can see"), one to reserve; the
 *   rest go face down to the discard. Others see only that you are looking, and how many.
 * - `resource`: the resource gained after this reservation.
 * Every step first shows the Orders this player already reserved in this action ("Already
 * reserved this turn", their own information from the log), and a reservation still to be
 * followed by its gain shows that gain as the numbered next step (wireframe `decLook`).
 * Every Order shows its card text and opens its rules details (D10).
 */
import type { ReactNode } from "react";
import { useT } from "../../i18n/I18nProvider.tsx";
import type { Translator } from "../../i18n/translator.ts";
import { Chip } from "../../kit/Chip.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { useDraft, useEngineView, useGame, useLog } from "../../state/hooks.ts";
import { commissionDraft, reservedThisTurn } from "./CommissionStep.draft.ts";
import type { CommissionAction, CommissionDraft, CommissionStepOptions, ReservedThisTurn } from "./CommissionStep.draft.ts";
import type { CommissionFirstKey } from "./locations/CommissionMarket.draft.ts";
import { amountText } from "./locations/shared.ts";
import { FormNote, OrderLines, OrderReward } from "./pieces.tsx";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
import "./pieces.css";

/** A numbered step heading outside a form group (wireframe `.dstep h3 .n`); `later` is a step still to come. */
function StepHeading({ step, later = false, children }: { step?: number; later?: boolean; children: ReactNode }) {
  return (
    <p className={later ? "b4-step b4-step--later" : "b4-step"}>
      {step === undefined ? null : (
        <span className="b4-step-n" aria-hidden="true">
          {step}
        </span>
      )}
      <span>{children}</span>
    </p>
  );
}

/** "Next: gain 1 Clay, 1 Wood or 1 Coin". */
function nextGainText(t: Translator, options: CommissionStepOptions): string {
  const [a, b, c] = options.gains.map((gain) => amountText(t, gain, options.gainAmount));
  return t("work.cm.nextGain", { a: a ?? "", b: b ?? "", c: c ?? "" });
}

/** The Orders already reserved in this Commission Market action (the player's own). */
function AlreadyReserved({ reserved }: { reserved: readonly ReservedThisTurn[] }) {
  const t = useT();
  if (reserved.length === 0) return null;
  return (
    <section className="b4-sub-block" data-b4="already-reserved" aria-label={t("work.cm.already")}>
      <StepHeading>{t("work.cm.already")}</StepHeading>
      {reserved.map((entry, index) => {
        const from = entry.source === "blind" ? t("work.cm.alreadyFrom.blind") : entry.source === "top_three" ? t("work.cm.alreadyFrom.top_three") : null;
        if (entry.orderId === null) {
          return (
            <div key={index} className="b4-reserved">
              <strong>{t("work.cm.alreadyUnknown")}</strong>
              {from === null ? null : <span className="b4-order-quality">{from}</span>}
            </div>
          );
        }
        const orderId = entry.orderId;
        return (
          <div key={index} className="b4-reserved" data-order={orderId}>
            <div className="b4-reserved-head">
              <strong>{entry.slotIndex === null ? orderId : t("work.cm.slot", { n: entry.slotIndex + 1, order: orderId })}</strong>
              <OrderReward orderId={orderId} />
            </div>
            {from === null ? null : <span className="b4-order-quality">{from}</span>}
            <OrderLines orderId={orderId} />
            <RulesDetail subject={{ kind: "order", id: orderId }} />
          </div>
        );
      })}
    </section>
  );
}

export function CommissionStep() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const { log } = useLog();
  const [draft, dispatch] = useDraft<CommissionDraft, CommissionAction>();
  const options = commissionDraft.options(draft, model, engine);
  const me = model.me;
  const reserved = me === null ? [] : reservedThisTurn(log, me.playerId);
  const progress = t("work.cm.reservationN", { a: options.reservationsMade + (options.awaiting === "resource" ? 0 : 1), b: options.maxReservations });

  if (options.awaiting === "look_choice") {
    return (
      <div className="b4-form" data-b4="commission" data-awaiting="look_choice">
        <p className="b4-prompt">{progress}</p>
        <AlreadyReserved reserved={reserved} />
        <OptionGroup
          step={1}
          legend={t("work.cm.lookTitle")}
          aside={<Chip tone="private">{t("common.status.onlyYou")}</Chip>}
          description={t("work.cm.lookRest")}
          name="orderId"
          value={draft.looked}
          onChange={(value) => {
            const orderId = options.looked.find((candidate) => candidate === value);
            if (orderId !== undefined) dispatch({ type: "looked", orderId });
          }}
        >
          {options.looked.map((orderId) => (
            <OptionCard key={orderId} value={orderId} title={orderId} meta={<OrderReward orderId={orderId} />} description={<OrderLines orderId={orderId} />}>
              <RulesDetail subject={{ kind: "order", id: orderId }} />
            </OptionCard>
          ))}
        </OptionGroup>
        <StepHeading step={2} later>
          {nextGainText(t, options)}
        </StepHeading>
        {me === null ? null : (
          <div className="b4-privacy">
            <strong>{t("work.cm.othersSee")}</strong>
            <span>{t("work.cm.looking", { name: me.displayName, n: options.looked.length })}</span>
          </div>
        )}
      </div>
    );
  }

  if (options.awaiting === "resource") {
    return (
      <div className="b4-form" data-b4="commission" data-awaiting="resource">
        <p className="b4-prompt">{progress}</p>
        <AlreadyReserved reserved={reserved} />
        <OptionGroup
          legend={t("work.cm.resourceHint")}
          name="resource"
          layout="pills"
          value={draft.resource}
          onChange={(value) => {
            const resource = options.gains.find((candidate) => candidate === value);
            if (resource !== undefined) dispatch({ type: "resource", resource });
          }}
        >
          {options.gains.map((gain) => (
            <OptionCard key={gain} variant="pill" value={gain} title={amountText(t, gain, options.gainAmount)} />
          ))}
        </OptionGroup>
      </div>
    );
  }

  const keys: Array<CommissionFirstKey | "stop"> = [
    ...options.slots.map((slot) => slot.key),
    ...(options.blind ? (["blind"] as const) : []),
    ...(options.look ? (["look"] as const) : []),
    ...(options.canStop ? (["stop"] as const) : []),
  ];
  return (
    <div className="b4-form" data-b4="commission" data-awaiting="reservation">
      <p className="b4-prompt">{progress}</p>
      <AlreadyReserved reserved={reserved} />
      <OptionGroup
        step={1}
        legend={t("work.cm.next")}
        name="reserve"
        value={draft.reserve}
        onChange={(value) => {
          const reserve = keys.find((candidate) => candidate === value);
          if (reserve !== undefined) dispatch({ type: "reserve", reserve });
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
        {options.canStop ? <OptionCard value="stop" title={t("work.cm.stop")} description={t("work.cm.stopHint")} /> : null}
      </OptionGroup>
      {draft.reserve === "blind" || draft.reserve === "look" ? (
        <StepHeading step={2} later>
          {nextGainText(t, options)}
        </StepHeading>
      ) : null}
      {options.needsGain ? (
        <OptionGroup
          step={2}
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
