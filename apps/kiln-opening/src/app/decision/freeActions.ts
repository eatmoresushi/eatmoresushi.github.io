/**
 * The free-action list (owner UI decision D21; owner revision 5, change 36, rev. 5 L168–176; owner
 * rulings R26, R28). Owner: B6.
 *
 * What the viewer can do right now in a free-action window, in the order D21 names: Deliver ⟨Order⟩
 * for each held Order they can complete, Sell Flawed, Imperial Priority, and the Colour Samples
 * swap (not a free action, v1.6.2 L632, but it shares the before- and after-action timing and is
 * never offered in the Order Phase, R28). One list serves the turn line's chips before placing
 * (`workPane`), the after-action pane and the Order Phase pane (`FreeActionList`). Everything comes
 * from `freeActionOptions` and `colourSamplesSwapOptions`: nothing outside the viewer's own window
 * is ever listed, so no chip shows on another player's turn, during the firing or at Cleanup.
 *
 * `deliverableNow` is the private hint of a Reserve step ("You can deliver this now"): the engine's
 * own matcher over the viewer's own Finished ceramics, for an Order the viewer is about to reserve.
 */
import { findOrderMatches, freeActionOptions } from "../../game/index.ts";
import type { FinishedCeramic, OrderId } from "../../game/index.ts";
import { orderDefinition } from "../i18n/content.ts";
import { msg } from "../i18n/translator.ts";
import type { RichMessage } from "../i18n/translator.ts";
import type { EngineView } from "../state/model.ts";
import { swapUsable } from "./work/ColourSamplesSwap.draft.ts";
import { viewMemo } from "./work/context.ts";
import { saleOptions } from "./sale/sellFlawed.ts";

/** A list entry's key: the radio value and `data-pane-opener` (no colon: `keyOf`, `state/pane.ts`). */
export type FreeActionKey = `complete-${string}` | "sell_flawed" | "imperial_priority" | "colour_samples_swap";

export type FreeActionItem =
  | { readonly kind: "deliver"; readonly key: FreeActionKey; readonly orderId: OrderId }
  | { readonly kind: "sell"; readonly key: "sell_flawed"; readonly coins: number }
  | { readonly kind: "imperial_priority"; readonly key: "imperial_priority" }
  | { readonly kind: "swap"; readonly key: "colour_samples_swap" };

/** The list's key of completing this held Order. */
export function deliverKey(orderId: OrderId): FreeActionKey {
  return `complete-${orderId}`;
}

/** What the viewer can do right now, in D21's order; empty outside their free-action windows. */
export function freeActionItems(engine: EngineView): readonly FreeActionItem[] {
  return viewMemo(engine.view, "freeActionItems", () => {
    const options = freeActionOptions(engine.view);
    if (options === null) return [];
    const items: FreeActionItem[] = options.completableOrderIds.map((orderId) => ({ kind: "deliver", key: deliverKey(orderId), orderId }));
    const sale = saleOptions(engine);
    if (sale !== null) items.push({ kind: "sell", key: "sell_flawed", coins: sale.coins });
    if (options.imperialPriority) items.push({ kind: "imperial_priority", key: "imperial_priority" });
    if (swapUsable(engine)) items.push({ kind: "swap", key: "colour_samples_swap" });
    return items;
  });
}

/** The entry's name: "Deliver O22", "Sell Flawed (+2 Coins)", "Imperial Priority", "Colour Samples swap". */
export function freeActionLabel(item: FreeActionItem): RichMessage {
  switch (item.kind) {
    case "deliver":
      return msg("work.work.chip.deliver", { order: item.orderId });
    case "sell":
      return msg("work.work.chip.sell", { coins: (t) => t("common.amount.coins", { n: item.coins }) });
    case "imperial_priority":
      return msg("work.work.mode.imperialPriority");
    case "swap":
      return msg("work.work.mode.colourSamplesSwap");
  }
}

/**
 * This Order, were the viewer to hold it, would be completed by their own Finished ceramics now.
 * For the private hint on a step that reserves it: the viewer's own view only, the same matcher the
 * validator and `completableOrders` use, and only ever shown to that viewer.
 */
export function deliverableNow(engine: EngineView, orderId: OrderId): boolean {
  const { view } = engine;
  if (view.viewerId === null || view.own === null) return false;
  const order = orderDefinition(orderId);
  if (order === undefined) return false;
  const pool = Object.values(view.game.ceramics).filter((ceramic): ceramic is FinishedCeramic => ceramic.ownerId === view.viewerId && ceramic.stage === "finished");
  return findOrderMatches(order, pool, 1).length > 0;
}
