/**
 * The draft model of the Cleanup hand trim (UI_V1.6.1_ARCHITECTURE §3.4 `hand_limit`, §3.5,
 * §3.7; wireframe `decTrim`). Owner: B5.
 *
 * Cleanup, Rounds 1–4, parallel (L304): a player over the hand limit (4, or 5 with Colour
 * Samples) discards exactly the excess (`DISCARD_TO_HAND_LIMIT`). The held Orders come from the
 * viewer's own hand and the count from `handLimitStatus`; the draft keeps the chosen Orders in
 * the order chosen. It builds as soon as one is chosen, so a wrong count shows the engine's own
 * reason (`HAND_LIMIT_DISCARD_COUNT`) beside a disabled Confirm. The draft survives other
 * players' trims (revalidated, not reset, §3.5).
 *
 * A pending trim is also one of the player's own turns, so a Flawed ceramic may be sold first
 * (change 30, R20): the draft's `sell` builds `SELL_FLAWED` from `sellFlawedOptions`; the player
 * stays pending and trims afterwards. Choosing a sale clears the Orders chosen, and the other way
 * round (one command per Confirm).
 */
import { handLimitStatus } from "../../../game/index.ts";
import type { CeramicId, HandLimitStatus, OrderId, SellFlawedOptions } from "../../../game/index.ts";
import { andList } from "../../i18n/format.ts";
import { msg } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView } from "../../state/model.ts";
import { saleOf, saleOffered, saleOptions, saleSummary } from "../sale/sellFlawed.ts";

export interface HandTrimDraft {
  readonly orderIds: readonly OrderId[];
  /** A Flawed ceramic to sell first (`SELL_FLAWED`, R20), or null. */
  readonly sell: CeramicId | null;
}

export type HandTrimAction =
  | { readonly type: "toggle"; readonly orderId: OrderId; readonly discard: boolean }
  | { readonly type: "sell"; readonly ceramicId: CeramicId };

export interface HandTrimOptions {
  /** The viewer's held Orders, in hand order. */
  held: readonly OrderId[];
  status: HandLimitStatus | null;
  /** The Flawed ceramics the viewer may sell while their trim is pending (R20), or null. */
  sale: SellFlawedOptions | null;
}

const INITIAL: HandTrimDraft = Object.freeze({ orderIds: Object.freeze([]) as readonly OrderId[], sell: null });

function optionsFor(engine: EngineView): HandTrimOptions {
  const viewerId = engine.view.viewerId;
  return {
    held: engine.view.own?.orderHand ?? [],
    status: viewerId === null || engine.view.game.players[viewerId] === undefined ? null : handLimitStatus(engine.view, viewerId),
    sale: saleOptions(engine),
  };
}

export const handTrimDraft: DraftModel<HandTrimDraft, HandTrimAction, HandTrimOptions> = {
  initial() {
    return INITIAL;
  },
  reduce(draft, action, _model, engine) {
    const held = optionsFor(engine).held;
    if (action.type === "revalidate") {
      // A draft seeded without `sell` (tests, the gallery) is a trim draft.
      const sell = draft.sell ?? null;
      if (sell !== null) return saleOffered(engine, sell) ? draft : INITIAL;
      const kept = draft.orderIds.filter((orderId, index) => held.includes(orderId) && draft.orderIds.indexOf(orderId) === index);
      return kept.length === draft.orderIds.length && draft.sell === null ? draft : { orderIds: kept, sell: null };
    }
    if (action.type === "sell") return saleOffered(engine, action.ceramicId) ? { orderIds: [], sell: action.ceramicId } : draft;
    if (!held.includes(action.orderId)) return draft;
    const without = draft.orderIds.filter((orderId) => orderId !== action.orderId);
    return { orderIds: action.discard ? [...without, action.orderId] : without, sell: null };
  },
  options(_draft, _model, engine) {
    return optionsFor(engine);
  },
  build(draft, _model, engine) {
    const sell = draft.sell ?? null;
    if (sell !== null) return saleOffered(engine, sell) ? { type: "SELL_FLAWED", ceramicId: sell } : null;
    return draft.orderIds.length === 0 ? null : { type: "DISCARD_TO_HAND_LIMIT", orderIds: [...draft.orderIds] };
  },
  fromCommand(command) {
    const sale = saleOf(command);
    if (sale !== null) return { orderIds: [], sell: sale };
    return command.type === "DISCARD_TO_HAND_LIMIT" ? { orderIds: [...command.orderIds], sell: null } : null;
  },
  summary(draft, model, engine) {
    const sell = draft.sell ?? null;
    if (sell !== null) return saleSummary(model, engine, sell);
    const status = optionsFor(engine).status;
    const must = status?.mustDiscard ?? 0;
    if (draft.orderIds.length !== must) return msg("orders.trim.count", { chosen: draft.orderIds.length, n: must });
    const orderIds = draft.orderIds;
    return msg("orders.trim.sum", { list: (t) => andList(orderIds, t.locale) });
  },
};
