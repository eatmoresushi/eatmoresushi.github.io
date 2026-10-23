/**
 * HandTrim (UI_V1.6.1_ARCHITECTURE §3.4 `hand_limit`, §3.7; wireframe `decTrim`). Owner: B5.
 *
 * Cleanup (Rounds 1–4), parallel: discard exactly the excess over your hand limit. Checkboxes over
 * your own held Orders (secret: only you see them; others see only how many you hold). Starting
 * Orders return to the box and Main Orders go face down to the discard. A pending trim is one of
 * the player's own turns, so a Flawed ceramic may be sold first (change 30, R20), from the "Sell a
 * Flawed ceramic" group or the Sell buttons on the table. Renders only from
 * `handTrimDraft.options()`.
 */
import type { OrderId } from "../../../game/index.ts";
import { orderRequirements } from "../../i18n/content.ts";
import { orderQualityLine } from "../../i18n/orderText.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { Chip } from "../../kit/Chip.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { B5_TECHS } from "../firing/firingSupport.ts";
import { Lead, Note } from "../firing/WindowParts.tsx";
import { ORDER_OPTION_CLASS, OrderDetails, OrderReward } from "../orders/OrderCompletionPicker.tsx";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
import { SellFlawed } from "../sale/SellFlawed.tsx";
import { handTrimDraft } from "./HandTrim.draft.ts";
import type { HandTrimAction, HandTrimDraft } from "./HandTrim.draft.ts";

export function HandTrim() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [draft, dispatch] = useDraft<HandTrimDraft, HandTrimAction>();
  const options = handTrimDraft.options(draft, model, engine);
  const status = options.status;
  const raised = model.me?.techs.some((tech) => tech.techId === B5_TECHS.colourSamples) ?? false;
  return (
    <div className="dw-form">
      {status === null ? null : <Lead>{t("orders.trim.lead", { held: status.held, limit: status.limit, n: status.mustDiscard })}</Lead>}
      {raised ? (
        <span className="dw-row">
          <span className="dw-note dw-note--muted">{t("orders.trim.raisedBy")}</span>
          <RulesDetail subject={{ kind: "tech", id: B5_TECHS.colourSamples }} look="name" />
        </span>
      ) : null}
      <OptionGroup
        legend={t("orders.turn.order")}
        aside={<Chip tone="private">{t("common.status.onlyYou")}</Chip>}
        description={status === null ? undefined : t("orders.trim.count", { chosen: draft.orderIds.length, n: status.mustDiscard })}
        type="checkbox"
        name="orderIds"
        values={draft.orderIds}
        onChange={(value, checked) => dispatch({ type: "toggle", orderId: value as OrderId, discard: checked })}
      >
        {options.held.map((orderId) => (
          <OptionCard
            key={orderId}
            value={orderId}
            title={orderId}
            meta={<OrderReward orderId={orderId} />}
            description={t("orders.requirementLine", { requirements: orderRequirements(orderId, t.locale), quality: orderQualityLine(orderId, t) })}
            className={ORDER_OPTION_CLASS}
          >
            <OrderDetails orderId={orderId} />
          </OptionCard>
        ))}
      </OptionGroup>
      <Note>{t("orders.trim.parallel")}</Note>
      {options.sale === null ? null : (
        <SellFlawed model={model} engine={engine} options={options.sale} value={draft.sell} name="trim.sell" onChange={(ceramicId) => dispatch({ type: "sell", ceramicId })} />
      )}
    </div>
  );
}
