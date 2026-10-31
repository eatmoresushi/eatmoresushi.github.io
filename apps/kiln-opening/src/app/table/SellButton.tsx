/**
 * SellButton (B2; change 30, a free action since change 36, owner ruling R26; owner UI decision D21:
 * "Sell 2"): the Sell button on one of the viewer's own Flawed
 * ceramics, drawn by the viewer's board (`CeramicsRow`) and the Finished ceramics strip while the
 * open window offers the sale (`useTableSelection().sellTargets`, from `sellFlawedOptions`: only
 * during the viewer's own turn). A press chooses the ceramic in the open window's draft
 * (`act({ type: "sell", ceramicId })`), which brings the pane up with the sale for Confirm (on
 * phones the sheet opens, D14); it never sends a command by itself (no optimistic state, K4).
 * `data-act="sell"`. It is not a toggle (a second press keeps the choice), so it carries no
 * `aria-pressed`: once chosen its words say so ("Chosen to sell", `data-chosen`). Its name holds
 * the words it shows (WCAG 2.5.3), the Coins in full, then the ceramic: "Sell 2 Coins: Celadon Bowl,
 * Plain · Flawed (finished)".
 */
import type { CeramicId } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { RULE_NUMBERS } from "../i18n/content.ts";
import type { TableSelection } from "../state/tableSelection.ts";
import "./SellButton.css";

export interface SellButtonProps {
  ceramicId: CeramicId;
  /** The ceramic in words (D9), for the button's accessible name. */
  label: string;
  selection: TableSelection;
}

export function SellButton({ ceramicId, label, selection }: SellButtonProps) {
  const t = useT();
  const target = selection.sellTargets.get(ceramicId);
  if (target === undefined) return null;
  const coins = t("common.amount.coins", { n: RULE_NUMBERS.flawedSaleCoins });
  const shown = target.pressed ? t("common.sale.chosen") : t("common.sale.button", { n: RULE_NUMBERS.flawedSaleCoins });
  const action = target.pressed ? shown : t("common.sale.buttonName", { coins });
  return (
    <button
      type="button"
      className="sell-pick"
      data-act="sell"
      data-ceramic-id={ceramicId}
      data-chosen={target.pressed ? "" : undefined}
      aria-label={t("common.sale.buttonLabel", { action, ceramic: label })}
      onClick={() => selection.act({ type: "sell", ceramicId })}
    >
      {shown}
    </button>
  );
}
