/**
 * The Commission Market sub-draft (UI_V1.6.1_ARCHITECTURE §3.4; v1.6.2 L189–200). Owner: B4.
 *
 * Nothing to choose at placement: the worker always looks first (INT Commission Market looks).
 * The Apprentice effect looks privately at the top 2 Main Orders and reserves 1 from the display
 * or those 2; the Shifu effect (Senior Apprentice included, R12) looks at the top 3 and reserves
 * up to 2 (at least 1) from the display and those 3. There is no resource and no blind
 * reservation. The reservations are the `commission` window's (`CommissionStep`), once the look
 * is open. What the look will show comes from `commissionOptions(view, effect)`: the look size,
 * how many cards it will actually show (fewer when the deck runs short, B1, R16) and the
 * reservation limit, all public facts.
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
  /** 2 (Apprentice effect) or 3 (Shifu effect). */
  lookSize: number;
  /** How many cards the look will show: the deck's top `lookSize`, or fewer (B1); 0 with both piles empty. */
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
    return { lookSize: selector.lookSize, lookCount: selector.lookCount, maxReservations: selector.maxReservations, faceUpCount: selector.faceUpSlots.length };
  },
  build: (_draft, context) => command(context),
  fromCommand: () => BLANK,
  detail(_draft, context): MessageParam | null {
    const lookCount = selectorOptions(context).lookCount;
    return lookCount === 0 ? null : msg("work.cm.detailLook", { n: lookCount });
  },
};
