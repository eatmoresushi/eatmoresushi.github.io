/**
 * The Canal Wharf sub-draft (UI_V1.6.1_ARCHITECTURE §3.4; wireframe `subEditor` canal_wharf).
 * Owner: B4.
 *
 * Nothing to choose: the location is uncapped and always legal (L143). The Coins gained come from
 * `placementLimits(view, "canal_wharf", effect)`.
 */
import { placementLimits } from "../../../../game/index.ts";
import type { ResourceState } from "../../../../game/index.ts";
import type { LocationDraftModel } from "./editor.ts";
import { gainText, resourcesPlus } from "./shared.ts";

export interface CanalWharfDraft {
  readonly placed: true;
}

export type CanalWharfAction = never;

export interface CanalWharfOptions {
  coins: number;
  after: ResourceState;
}

const BLANK: CanalWharfDraft = Object.freeze({ placed: true });

export const canalWharfDraft: LocationDraftModel<"canal_wharf", CanalWharfDraft, CanalWharfAction, CanalWharfOptions> = {
  locationId: "canal_wharf",
  blank: () => BLANK,
  prepare: (draft) => draft,
  reduce: (draft) => draft,
  options(_draft, context) {
    const coins = placementLimits(context.view, "canal_wharf", context.worker.effect).coins;
    return { coins, after: resourcesPlus(context.me.resources, { coins }) };
  },
  build: (_draft, context) => ({ type: "PLACE_CANAL_WHARF", workerId: context.worker.workerId }),
  fromCommand: () => BLANK,
  detail(_draft, context) {
    const coins = placementLimits(context.view, "canal_wharf", context.worker.effect).coins;
    // The summary's tail: "+4 Coins" / "得4铜钱" (glossary §1.3 compact gain).
    return (t) => gainText(t, "coins", coins);
  },
};
