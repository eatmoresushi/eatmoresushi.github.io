/**
 * The Canal Wharf sub-draft (UI_V1.6.1_ARCHITECTURE §3.4; wireframe `subEditor` canal_wharf).
 * Owner: B4.
 *
 * Nothing to choose: the location is uncapped and always legal (L143). The Coins gained come from
 * `placementLimits(view, "canal_wharf", effect)`, and so does the Shifu effect's draw: 4 Coins,
 * then the top Main Order card into the hand, unseen (v1.6.2 L219–220). When the Main Order deck
 * and its discard pile are both empty no card is taken (B1): `commissionOptions(...).lookCount`,
 * the engine's count of the cards the top of the deck can give now (it reshuffles the discard
 * when the deck is empty, as the draw does), says whether one is there.
 */
import { commissionOptions, placementLimits } from "../../../../game/index.ts";
import type { PlayerView, ResourceState } from "../../../../game/index.ts";
import { msg } from "../../../i18n/translator.ts";
import { viewMemo } from "../context.ts";
import type { LocationDraftModel, PlacementContext } from "./editor.ts";
import { gainText, resourcesPlus } from "./shared.ts";

export interface CanalWharfDraft {
  readonly placed: true;
}

export type CanalWharfAction = never;

export interface CanalWharfOptions {
  coins: number;
  /**
   * The Shifu effect's draw: `card` when it takes the top Main Order card into the hand, unseen;
   * `empty` when the deck and the discard are both empty (B1); null for the Apprentice effect.
   */
  draw: "card" | "empty" | null;
  after: ResourceState;
}

const BLANK: CanalWharfDraft = Object.freeze({ placed: true });

/** A Main Order card can be drawn now (the deck or, reshuffled, its discard holds one; B1). */
function cardAvailable(view: PlayerView): boolean {
  return viewMemo(view, "commissionOptions:apprentice", () => commissionOptions(view, "apprentice")).lookCount > 0;
}

function drawOf(context: PlacementContext): CanalWharfOptions["draw"] {
  const limits = placementLimits(context.view, "canal_wharf", context.worker.effect);
  if (!("topMainOrders" in limits) || limits.topMainOrders <= 0) return null;
  return cardAvailable(context.view) ? "card" : "empty";
}

export const canalWharfDraft: LocationDraftModel<"canal_wharf", CanalWharfDraft, CanalWharfAction, CanalWharfOptions> = {
  locationId: "canal_wharf",
  blank: () => BLANK,
  prepare: (draft) => draft,
  reduce: (draft) => draft,
  options(_draft, context) {
    const coins = placementLimits(context.view, "canal_wharf", context.worker.effect).coins;
    return { coins, draw: drawOf(context), after: resourcesPlus(context.me.resources, { coins }) };
  },
  build: (_draft, context) => ({ type: "PLACE_CANAL_WHARF", workerId: context.worker.workerId }),
  fromCommand: () => BLANK,
  detail(_draft, context) {
    const coins = placementLimits(context.view, "canal_wharf", context.worker.effect).coins;
    // The summary's tail: "+4 Coins" / "得4铜钱" (glossary §1.3 compact gain), and the Shifu's card.
    const gain = (t: Parameters<typeof gainText>[0]) => gainText(t, "coins", coins);
    return drawOf(context) === "card" ? msg("work.cw.detailDraw", { gain }) : gain;
  },
};
