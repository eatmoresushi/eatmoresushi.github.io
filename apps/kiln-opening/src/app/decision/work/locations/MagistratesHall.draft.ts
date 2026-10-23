/**
 * The Magistrate's Hall sub-draft (UI_V1.6.1_ARCHITECTURE §3.4; wireframe `subEditor`
 * magistrates_hall). Owner: B4.
 *
 * Pay 4 Coins (either worker) for +1 Imperial Recognition, only from Recognition 0–2 and never to
 * 4 (rev. 4 L234–245, change 33). The Shifu then may reserve 1 face-up Crown Order from the
 * display (owner ruling R21: optional, the player chooses which or none; nothing when none
 * shows); its position stays empty until the end of the turn. The price, the Recognition reached,
 * the engine's reason and the display positions holding a Crown Order come from
 * `magistratesHallQuote(view, effect)` (`crownOrderSlots`, always empty for the Apprentice). The
 * Crown Order is chosen here or with the display's Choose toggles on the table (`crownTargetsOf`).
 */
import { magistratesHallQuote } from "../../../../game/index.ts";
import type { CostQuote, OrderId, Recognition, ResourceState } from "../../../../game/index.ts";
import { msg } from "../../../i18n/translator.ts";
import type { MessageParam } from "../../../i18n/translator.ts";
import { displaySlotKey } from "../../../state/tableSelection.ts";
import type { OrderTarget } from "../../../state/tableSelection.ts";
import { keepIfSame, viewMemo } from "../context.ts";
import type { LocationDraftModel, PlacementContext } from "./editor.ts";
import { amountsText, resourcesPlus } from "./shared.ts";

export interface MagistratesHallDraft {
  /** The display position of the Crown Order the Shifu reserves, or null for none (R21). */
  readonly crownSlot: number | null;
}

export type MagistratesHallAction = { readonly type: "crown"; readonly slotIndex: number | null };

/** A face-up Crown Order the Shifu may reserve after the step. */
export interface CrownOrderChoice {
  slotIndex: number;
  orderId: OrderId;
}

export interface MagistratesHallOptions {
  quote: CostQuote;
  from: Recognition;
  reachable: Recognition | null;
  after: ResourceState | null;
  /** The display's Crown Orders the Shifu may reserve (empty for the Apprentice or with none showing). */
  crownOrders: readonly CrownOrderChoice[];
  /** This worker's effect may reserve a Crown Order at all (the Shifu's). */
  reservesCrown: boolean;
}

const BLANK: MagistratesHallDraft = Object.freeze({ crownSlot: null });

function quoteOf(context: PlacementContext) {
  return viewMemo(context.view, `magistratesHallQuote:${context.worker.effect}`, () => magistratesHallQuote(context.view, context.worker.effect));
}

function crownOrders(context: PlacementContext): CrownOrderChoice[] {
  const display = context.view.game.market.display;
  return quoteOf(context).crownOrderSlots.flatMap((slotIndex): CrownOrderChoice[] => {
    const orderId = display[slotIndex];
    return orderId === null || orderId === undefined ? [] : [{ slotIndex, orderId }];
  });
}

function revalidate(draft: MagistratesHallDraft, context: PlacementContext): MagistratesHallDraft {
  const offered = draft.crownSlot !== null && crownOrders(context).some((choice) => choice.slotIndex === draft.crownSlot);
  return keepIfSame(draft, { crownSlot: offered ? draft.crownSlot : null });
}

export const magistratesHallDraft: LocationDraftModel<"magistrates_hall", MagistratesHallDraft, MagistratesHallAction, MagistratesHallOptions> = {
  locationId: "magistrates_hall",
  blank: () => BLANK,
  // The Crown Order is optional (R21): nothing is pre-selected, even with one showing.
  prepare: (draft, context) => revalidate(draft, context),
  reduce(draft, action, context) {
    if (action.type === "revalidate") return revalidate(draft, context);
    return revalidate({ crownSlot: action.slotIndex }, context);
  },
  options(_draft, context) {
    const quote = quoteOf(context);
    return {
      quote,
      from: context.me.recognition,
      reachable: quote.reachable,
      after: quote.ok ? resourcesPlus(context.me.resources, quote.gain, quote.pay) : null,
      crownOrders: crownOrders(context),
      reservesCrown: context.worker.effect === "shifu",
    };
  },
  build(draft, context) {
    const crown = draft.crownSlot === null ? null : crownOrders(context).find((choice) => choice.slotIndex === draft.crownSlot) ?? null;
    return {
      type: "PLACE_MAGISTRATES_HALL",
      workerId: context.worker.workerId,
      ...(crown === null ? {} : { crownOrder: { slotIndex: crown.slotIndex, orderId: crown.orderId } }),
    };
  },
  fromCommand: (command) => ({ crownSlot: command.crownOrder?.slotIndex ?? null }),
  detail(draft, context): MessageParam | null {
    const quote = quoteOf(context);
    const pay = msg("work.mh.pay", { pay: (t) => amountsText(t, quote.pay) });
    const crown = draft.crownSlot === null ? null : crownOrders(context).find((choice) => choice.slotIndex === draft.crownSlot) ?? null;
    if (crown === null) return pay;
    return msg("work.mh.detailCrown", { pay: (t) => t.message(pay), order: crown.orderId });
  },
};

/** The display's Crown Orders as table targets for this placement (§3.5), the chosen one pressed. */
export function crownTargetsOf(draft: MagistratesHallDraft, context: PlacementContext): Map<string, OrderTarget> {
  return new Map(
    crownOrders(context).map((choice): [string, OrderTarget] => [displaySlotKey(choice.slotIndex), { state: draft.crownSlot === choice.slotIndex ? "chosen" : "choosable", disabled: false }]),
  );
}
