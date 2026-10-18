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
 */
import { handLimitStatus } from "../../../game/index.ts";
import type { HandLimitStatus, OrderId } from "../../../game/index.ts";
import { andList } from "../../i18n/format.ts";
import { msg } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView } from "../../state/model.ts";

export interface HandTrimDraft {
  readonly orderIds: readonly OrderId[];
}

export type HandTrimAction = { readonly type: "toggle"; readonly orderId: OrderId; readonly discard: boolean };

export interface HandTrimOptions {
  /** The viewer's held Orders, in hand order. */
  held: readonly OrderId[];
  status: HandLimitStatus | null;
}

function optionsFor(engine: EngineView): HandTrimOptions {
  const viewerId = engine.view.viewerId;
  return {
    held: engine.view.own?.orderHand ?? [],
    status: viewerId === null || engine.view.game.players[viewerId] === undefined ? null : handLimitStatus(engine.view, viewerId),
  };
}

export const handTrimDraft: DraftModel<HandTrimDraft, HandTrimAction, HandTrimOptions> = {
  initial() {
    return { orderIds: [] };
  },
  reduce(draft, action, _model, engine) {
    const held = optionsFor(engine).held;
    if (action.type === "revalidate") {
      const kept = draft.orderIds.filter((orderId, index) => held.includes(orderId) && draft.orderIds.indexOf(orderId) === index);
      return kept.length === draft.orderIds.length ? draft : { orderIds: kept };
    }
    if (!held.includes(action.orderId)) return draft;
    const without = draft.orderIds.filter((orderId) => orderId !== action.orderId);
    return { orderIds: action.discard ? [...without, action.orderId] : without };
  },
  options(_draft, _model, engine) {
    return optionsFor(engine);
  },
  build(draft) {
    return draft.orderIds.length === 0 ? null : { type: "DISCARD_TO_HAND_LIMIT", orderIds: [...draft.orderIds] };
  },
  fromCommand(command) {
    return command.type === "DISCARD_TO_HAND_LIMIT" ? { orderIds: [...command.orderIds] } : null;
  },
  summary(draft, _model, engine) {
    const status = optionsFor(engine).status;
    const must = status?.mustDiscard ?? 0;
    if (draft.orderIds.length !== must) return msg("orders.trim.count", { chosen: draft.orderIds.length, n: must });
    const orderIds = draft.orderIds;
    return msg("orders.trim.sum", { list: (t) => andList(orderIds, t.locale) });
  },
};
