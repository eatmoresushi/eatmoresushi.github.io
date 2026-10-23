/**
 * OrderCard (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `orderCard`: one Order's printed face, its quality line and target state.
 *
 * - The face (printed number, kind, VP, requirement line, quality line, Coins, Crowns) is the
 *   trigger of its rules details (D10): click, tap or focus opens them.
 * - When the open window's table adapter names this card in `orderTargets` (key: the OrderId, or
 *   `slot:<i>` on the display), a separate toggle below the face chooses it
 *   (`act({ type: "order", key })`, `aria-pressed`): Choose / Chosen / Can complete / Discard, or
 *   "No matching ceramics" when the Order cannot be completed now. The table never decides the
 *   state; the adapter does.
 * - A target the adapter greys out (`disabled`) keeps its toggle focusable with `aria-disabled`,
 *   and says why under it when the adapter gives a reason (the Commission Market's limit is
 *   reached, the engine's reason a held Order cannot be given up): the toggle's description, so a
 *   tap, a hover and a screen reader all meet the reason, never a silent grey button.
 * - Printed Order numbers (S01, O33) are on the physical cards, so they are shown (D9).
 */
import { useId } from "react";
import type { OrderId } from "../../game/index.ts";
import { errorTextOptions, ruleErrorText } from "../i18n/errors.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import type { Translator } from "../i18n/translator.ts";
import { orderRequirements } from "../i18n/content.ts";
import { orderQualityLine } from "../i18n/orderText.ts";
import { Chip } from "../kit/Chip.tsx";
import { CrownIcon } from "../pieces/CrownIcon.tsx";
import { useOptionalGame, useTableSelection } from "../state/hooks.ts";
import type { GameModel } from "../state/model.ts";
import type { OrderTargetReason, OrderTargetState } from "../state/tableSelection.ts";
import { orderFacts } from "../i18n/content.ts";
import { RulesDetail, orderName } from "../rules/RulesDetail.tsx";
import { tableCeramics } from "./tableData.ts";
import "./OrderCard.css";

export interface OrderCardProps {
  /** The Order shown. */
  orderId: OrderId;
  /** Its key in `orderTargets` (the OrderId, or `slot:<i>` on the display). */
  targetKey?: string;
  /** Display position, 1-based, shown as "#1" (the Main Order display only). */
  slot?: number;
  /** One of the viewer's own private cards (hand, look): drawn on the private card stock. */
  own?: boolean;
}

const STATE_KEYS = {
  choosable: "table.order.state.choosable",
  chosen: "table.order.state.chosen",
  completable: "table.order.state.completable",
  blocked: "table.order.state.blocked",
  discard: "table.order.state.discard",
} as const satisfies Record<OrderTargetState, string>;

/** A disabled target's reason in the current language (player and ceramic names in words, D9). */
function reasonText(reason: OrderTargetReason, t: Translator, model: GameModel | null): string {
  if (reason.kind === "message") return t.message(reason.message);
  return ruleErrorText(reason.error, t, model === null ? {} : errorTextOptions(tableCeramics(model).labelView, t));
}

export function OrderCard({ orderId, targetKey, slot, own = false }: OrderCardProps) {
  const t = useT();
  const model = useOptionalGame();
  const reasonId = useId();
  const selection = useTableSelection();
  const key = targetKey ?? orderId;
  const target = selection.orderTargets.get(key) ?? null;
  const facts = orderFacts(orderId);
  const kind = t(`table.order.kind.${facts.kind}`);
  const classes = [
    "ord",
    `ord--${facts.kind}`,
    own ? "ord--own" : "",
    target === null ? "" : `ord--${target.state}`,
  ].filter((part) => part !== "").join(" ");
  const face = (
    <span className="ord-face">
      <span className="ord-o1">
        <span className="ord-id">{orderId}</span>
        <span className="ord-kind">{kind}</span>
        <span className="ord-vp">{t.rich("boards.board.vp", { n: facts.vp })}</span>
      </span>
      <span className="ord-req">{orderRequirements(orderId, t.locale)}</span>
      <span className="ord-o2">
        <Chip wrap className="ord-quality">{orderQualityLine(orderId, t)}</Chip>
        <Chip>{t("common.amount.coins", { n: facts.coins })}</Chip>
        {facts.crowns > 0 ? <Chip tone="gold"><CrownIcon count={facts.crowns} /></Chip> : null}
      </span>
    </span>
  );
  const pressed = target !== null && (target.state === "chosen" || target.state === "discard");
  const blocked = target !== null && (target.state === "blocked" || target.disabled);
  const stateText = target === null ? "" : t(STATE_KEYS[target.state]);
  const why = target !== null && target.disabled && target.state !== "blocked" && target.reason != null ? reasonText(target.reason, t, model) : null;
  return (
    <article
      className={classes}
      data-order-id={orderId}
      data-target={target === null ? undefined : target.state}
      data-motion="order-slot"
      data-motion-key={key}
    >
      {slot === undefined ? null : <span className="ord-slot" aria-hidden="true">{t("table.display.slot", { n: slot })}</span>}
      <RulesDetail subject={{ kind: "order", id: orderId }} trigger={face} className="ord-detail" />
      {target === null ? null : blocked && target.state === "blocked" ? (
        <span className="ord-state ord-state--blocked">{stateText}</span>
      ) : (
        <button
          type="button"
          className="ord-pick"
          data-act="order"
          aria-pressed={pressed}
          aria-disabled={blocked ? true : undefined}
          aria-label={t("table.order.pick", { state: stateText, order: orderName(orderId, t) })}
          aria-describedby={why === null ? undefined : reasonId}
          onClick={() => {
            if (!blocked) selection.act({ type: "order", key });
          }}
        >
          {target.state === "completable" ? <span aria-hidden="true">✓ </span> : null}
          {stateText}
        </button>
      )}
      {why === null ? null : (
        <p id={reasonId} className="ord-why">
          {why}
        </p>
      )}
    </article>
  );
}
