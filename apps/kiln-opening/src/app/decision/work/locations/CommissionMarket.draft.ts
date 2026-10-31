/**
 * The Commission Market sub-draft (UI_V1.6.1_ARCHITECTURE §3.4; v1.6.2 L219–230, change 25).
 * Owner: B4.
 *
 * Nothing to choose at placement: the worker always looks first (INT Commission Market looks).
 * The Apprentice effect is Select 2: look privately at the top 2 Main Orders and reserve 1 of them
 * or 1 from the display; the Shifu effect (Senior Apprentice included, R12) is Select 3,
 * reserving up to 2 (at least 1) from those 3 and the display. There is no resource and no blind
 * reservation. The reservations are the `commission` window's (`SelectStep`), once the look is
 * open. What the look will show comes from `commissionOptions(view, effect)`: N, how many cards
 * it will actually show (fewer when the deck runs short, B1, R16) and the reservation limit, all
 * public facts.
 */
import { commissionOptions } from "../../../../game/index.ts";
import type { CommissionOptions } from "../../../../game/index.ts";
import { msg } from "../../../i18n/translator.ts";
import type { MessageParam } from "../../../i18n/translator.ts";
import { viewMemo } from "../context.ts";
import type { LocationDraftModel, PlacementCommandOf, PlacementContext } from "./editor.ts";

export interface CommissionMarketDraft {
  readonly placed: true;
}

export type CommissionMarketAction = never;

export interface CommissionMarketOptions {
  /** N of the Select: 2 (Apprentice effect) or 3 (Shifu effect). */
  n: number;
  /** How many cards the look will show: the deck's top `n`, or fewer (B1); 0 with both piles empty. */
  lookCount: number;
  /** 1, or 2 for the Shifu effect. */
  maxReservations: number;
  /** Display positions holding an Order now. */
  faceUpCount: number;
}

const BLANK: CommissionMarketDraft = Object.freeze({ placed: true });

function selectorOptions(context: PlacementContext): CommissionOptions {
  return viewMemo(context.view, `commissionOptions:${context.worker.effect}`, () => commissionOptions(context.view, context.worker.effect));
}

function command(context: PlacementContext): PlacementCommandOf<"commission_market"> {
  return {
    type: "PLACE_COMMISSION_MARKET",
    workerId: context.worker.workerId,
    ...(context.worker.seniorApprentice ? { seniorApprentice: true } : {}),
  };
}

export const commissionMarketDraft: LocationDraftModel<"commission_market", CommissionMarketDraft, CommissionMarketAction, CommissionMarketOptions> = {
  locationId: "commission_market",
  blank: () => BLANK,
  prepare: (draft) => draft,
  reduce: (draft) => draft,
  options(_draft, context) {
    const selector = selectorOptions(context);
    return { n: selector.n, lookCount: selector.lookCount, maxReservations: selector.maxReservations, faceUpCount: selector.faceUpSlots.length };
  },
  build: (_draft, context) => command(context),
  fromCommand: () => BLANK,
  // The keyword, as the location summary prints it (Select 2 / Select 3, reserving up to 2), and
  // how many cards are left to look at when the deck runs short (B1).
  detail(_draft, context): MessageParam | null {
    const { n, lookCount, maxReservations } = selectorOptions(context);
    const select = maxReservations > 1 ? msg("work.cm.detailSelectTwo", { n, max: maxReservations }) : msg("work.cm.detailSelect", { n });
    if (lookCount >= n) return select;
    return lookCount === 0 ? msg("work.cm.detailNone", { select }) : msg("work.cm.detailShort", { select, n: lookCount });
  },
};
