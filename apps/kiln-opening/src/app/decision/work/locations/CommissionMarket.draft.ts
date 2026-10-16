/**
 * The Commission Market sub-draft (UI_V1.6.1_ARCHITECTURE §3.4; wireframe `subEditor`
 * commission_market). Owner: B4.
 *
 * The first reservation is part of the placement: a face-up Order (its display position and the
 * resource gained after it), a blind reservation, or — Shifu effect — a private look at the top
 * of the deck. Every choice comes from `commissionOptions(view, effect)`; the gain is one of the
 * three resources (L197). Later reservations, the look's choice and a blind reservation's gain
 * are the `commission` window (`CommissionStep`).
 */
import { commissionOptions, placementLimits } from "../../../../game/index.ts";
import type { CommissionOptions, OrderId, ResourceKind } from "../../../../game/index.ts";
import { msg } from "../../../i18n/translator.ts";
import type { MessageParam } from "../../../i18n/translator.ts";
import { keepIfSame, viewMemo } from "../context.ts";
import type { LocationDraftModel, PlacementCommandOf, PlacementContext } from "./editor.ts";
import { RESOURCE_ORDER, amountText } from "./shared.ts";

/** `slot:<i>`, `blind` or `look`. */
export type CommissionFirstKey = `slot:${number}` | "blind" | "look";

export interface CommissionMarketDraft {
  readonly first: CommissionFirstKey | null;
  readonly gain: ResourceKind | null;
}

export type CommissionMarketAction =
  | { readonly type: "first"; readonly first: CommissionFirstKey }
  | { readonly type: "gain"; readonly gain: ResourceKind };

export interface CommissionMarketOptions {
  /** Face-up display positions that may be reserved, with their Orders. */
  slots: ReadonlyArray<{ key: CommissionFirstKey; slotIndex: number; orderId: OrderId }>;
  blind: boolean;
  look: boolean;
  /** Resources to gain after a face-up reservation, and how many. */
  gains: readonly ResourceKind[];
  gainAmount: number;
  maxReservations: number;
  /** Is the chosen first reservation a face-up one (which needs a gain now)? */
  needsGain: boolean;
}

const BLANK: CommissionMarketDraft = Object.freeze({ first: null, gain: null });

function selectorOptions(context: PlacementContext): CommissionOptions {
  return viewMemo(context.view, `commissionOptions:${context.worker.effect}`, () => commissionOptions(context.view, context.worker.effect));
}

export function slotKey(slotIndex: number): CommissionFirstKey {
  return `slot:${slotIndex}`;
}

function options(draft: CommissionMarketDraft, context: PlacementContext): CommissionMarketOptions {
  const selector = selectorOptions(context);
  const display = context.view.game.market.display;
  const slots = selector.faceUpSlots.flatMap((slotIndex) => {
    const orderId = display[slotIndex];
    return orderId === null || orderId === undefined ? [] : [{ key: slotKey(slotIndex), slotIndex, orderId }];
  });
  return {
    slots,
    blind: selector.blind,
    look: selector.lookTopThree,
    gains: RESOURCE_ORDER,
    gainAmount: placementLimits(context.view, "commission_market", context.worker.effect).gainAfterEach,
    maxReservations: selector.maxReservations,
    needsGain: draft.first !== null && draft.first.startsWith("slot:"),
  };
}

function offered(first: CommissionFirstKey, available: CommissionMarketOptions): boolean {
  if (first === "blind") return available.blind;
  if (first === "look") return available.look;
  return available.slots.some((slot) => slot.key === first);
}

function revalidate(draft: CommissionMarketDraft, context: PlacementContext): CommissionMarketDraft {
  const available = options(draft, context);
  const first = draft.first !== null && offered(draft.first, available) ? draft.first : null;
  const gain = draft.gain !== null && available.gains.includes(draft.gain) ? draft.gain : null;
  return keepIfSame(draft, { first, gain });
}

function command(draft: CommissionMarketDraft, context: PlacementContext): PlacementCommandOf<"commission_market"> | null {
  const senior = context.worker.seniorApprentice ? { seniorApprentice: true } : {};
  const base = { type: "PLACE_COMMISSION_MARKET" as const, workerId: context.worker.workerId, ...senior };
  if (draft.first === "blind") return { ...base, first: { kind: "blind" } };
  if (draft.first === "look") return { ...base, first: { kind: "look_top_three" } };
  if (draft.first === null || draft.gain === null) return null;
  const slot = options(draft, context).slots.find((candidate) => candidate.key === draft.first);
  if (slot === undefined) return null;
  return { ...base, first: { kind: "face_up", slotIndex: slot.slotIndex, orderId: slot.orderId, gain: draft.gain } };
}

export const commissionMarketDraft: LocationDraftModel<"commission_market", CommissionMarketDraft, CommissionMarketAction, CommissionMarketOptions> = {
  locationId: "commission_market",
  blank: () => BLANK,
  prepare: (draft, context) => revalidate(draft, context),
  reduce(draft, action, context) {
    switch (action.type) {
      case "revalidate":
        return revalidate(draft, context);
      case "first":
        // A choice the options do not offer is ignored; the current one stays.
        return offered(action.first, options(draft, context)) ? revalidate({ ...draft, first: action.first }, context) : draft;
      case "gain":
        return options(draft, context).gains.includes(action.gain) ? revalidate({ ...draft, gain: action.gain }, context) : draft;
    }
  },
  options,
  build: (draft, context) => command(draft, context),
  fromCommand(cmd, context) {
    const first = cmd.first;
    if (first.kind === "blind") return { first: "blind", gain: null };
    if (first.kind === "look_top_three") return { first: "look", gain: null };
    if (context.view.game.market.display[first.slotIndex] !== first.orderId) return null;
    return { first: slotKey(first.slotIndex), gain: first.gain };
  },
  detail(draft, context): MessageParam | null {
    if (draft.first === "blind") return msg("work.cm.detailBlind");
    if (draft.first === "look") return msg("work.cm.detailLook");
    if (draft.first === null || draft.gain === null) return null;
    const slot = options(draft, context).slots.find((candidate) => candidate.key === draft.first);
    if (slot === undefined) return null;
    const gain = draft.gain;
    const amount = placementLimits(context.view, "commission_market", context.worker.effect).gainAfterEach;
    return msg("work.cm.detailSlot", { order: slot.orderId, amount: (t) => amountText(t, gain, amount) });
  },
};
