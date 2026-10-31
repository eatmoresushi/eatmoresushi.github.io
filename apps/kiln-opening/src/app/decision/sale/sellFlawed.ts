/**
 * Selling a Flawed ceramic (change 30; a free action since owner revision 5, change 36, rev. 5
 * L172, L300, L302): the shared draft helpers of the windows that offer it. Owner: B6 (shared by
 * B4's work window and B5's Order Phase window).
 *
 * A player may sell 1 of their Finished Flawed ceramics for 2 Coins (its Vessel card returns to
 * the supply) as a free action, only in their own free-action windows: before or after the worker
 * action of their Work turn and in their Order Phase turn. Never during the firing (the
 * after-Quality step included) or at Cleanup (the hand trim): owner ruling R26, which replaced
 * R20's digital windows. Each sale is one `SELL_FLAWED { ceramicId }`; it is never a worker
 * action, so the window stays open afterwards (the engine ends an after-action step or an Order
 * turn by itself when nothing is left to do there, R27, R28).
 *
 * Whether a sale is offered, and which ceramics, comes only from `sellFlawedOptions(view)`; the
 * windows never decide it. The table shows a Sell button on each of these ceramics
 * (`TableSelectionData.sellTargets`), which chooses it in the open window's draft.
 */
import { sellFlawedOptions } from "../../../game/index.ts";
import type { AuthoritativeCommand, CeramicId, SellFlawedOptions } from "../../../game/index.ts";
import { msg } from "../../i18n/translator.ts";
import type { RichMessage } from "../../i18n/translator.ts";
import type { EngineView, GameModel } from "../../state/model.ts";
import { ceramicWords } from "../firing/firingSupport.ts";
import { viewMemo } from "../work/context.ts";

/** `sellFlawedOptions(view)`, once per view: null outside the viewer's sale windows or with nothing to sell. */
export function saleOptions(engine: EngineView): SellFlawedOptions | null {
  return viewMemo(engine.view, "sellFlawedOptions", () => sellFlawedOptions(engine.view));
}

/** The ceramic may be sold now. */
export function saleOffered(engine: EngineView, ceramicId: CeramicId): boolean {
  return saleOptions(engine)?.ceramicIds.includes(ceramicId) === true;
}

/** The sale command of a ceramic the options offer, else null. */
export function saleCommand(engine: EngineView, ceramicId: CeramicId | null): AuthoritativeCommand | null {
  return ceramicId !== null && saleOffered(engine, ceramicId) ? { type: "SELL_FLAWED", ceramicId } : null;
}

/** The ceramic a `SELL_FLAWED` command names, or null for any other command. */
export function saleOf(command: AuthoritativeCommand): CeramicId | null {
  return command.type === "SELL_FLAWED" ? command.ceramicId : null;
}

/** "Sell <b>Celadon Bowl, Plain · Flawed</b> for 2 Coins" (the ConfirmBar sentence). */
export function saleSummary(model: GameModel, engine: EngineView, ceramicId: CeramicId): RichMessage {
  const options = saleOptions(engine);
  const among = options?.ceramicIds ?? [ceramicId];
  const coins = options?.coins ?? 0;
  return msg("common.sale.sum", { ceramic: (t) => ceramicWords(model, engine, ceramicId, t, among), coins: (t) => t("common.amount.coins", { n: coins }) });
}

/** The table's Sell buttons: every sellable ceramic, the chosen one pressed. */
export function saleTargets(engine: EngineView, chosen: CeramicId | null): Map<CeramicId, { pressed: boolean }> {
  return new Map((saleOptions(engine)?.ceramicIds ?? []).map((ceramicId) => [ceramicId, { pressed: ceramicId === chosen }]));
}
