/**
 * The Magistrate's Hall sub-draft (UI_V1.6.1_ARCHITECTURE §3.4; wireframe `subEditor`
 * magistrates_hall). Owner: B4.
 *
 * Nothing to choose: pay 4 / 3 Coins for +1 Imperial Recognition, only from Recognition 0–2 and
 * never to 4 (L222–232). The price, the Recognition reached and the engine's reason come from
 * `magistratesHallQuote(view, effect)`.
 */
import { magistratesHallQuote } from "../../../../game/index.ts";
import type { CostQuote, Recognition, ResourceState } from "../../../../game/index.ts";
import { msg } from "../../../i18n/translator.ts";
import type { LocationDraftModel } from "./editor.ts";
import { amountsText, resourcesPlus } from "./shared.ts";

export interface MagistratesHallDraft {
  readonly placed: true;
}

export type MagistratesHallAction = never;

export interface MagistratesHallOptions {
  quote: CostQuote;
  from: Recognition;
  reachable: Recognition | null;
  after: ResourceState | null;
}

const BLANK: MagistratesHallDraft = Object.freeze({ placed: true });

export const magistratesHallDraft: LocationDraftModel<"magistrates_hall", MagistratesHallDraft, MagistratesHallAction, MagistratesHallOptions> = {
  locationId: "magistrates_hall",
  blank: () => BLANK,
  prepare: (draft) => draft,
  reduce: (draft) => draft,
  options(_draft, context) {
    const quote = magistratesHallQuote(context.view, context.worker.effect);
    return {
      quote,
      from: context.me.recognition,
      reachable: quote.reachable,
      after: quote.ok ? resourcesPlus(context.me.resources, quote.gain, quote.pay) : null,
    };
  },
  build: (_draft, context) => ({ type: "PLACE_MAGISTRATES_HALL", workerId: context.worker.workerId }),
  fromCommand: () => BLANK,
  detail(_draft, context) {
    const quote = magistratesHallQuote(context.view, context.worker.effect);
    return msg("work.mh.pay", { pay: (t) => amountsText(t, quote.pay) });
  },
};
