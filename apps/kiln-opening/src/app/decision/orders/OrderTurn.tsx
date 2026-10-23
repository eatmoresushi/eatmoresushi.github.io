/**
 * OrderTurn (UI_V1.6.1_ARCHITECTURE §3.4 `orders`; wireframe `decOrders`). Owner: B5.
 *
 * The Order Phase is one pass in First Player order (L297). On your turn: choose a held Order,
 * the ceramics that complete it (described in words, D9), Crackle declarations when needed, and
 * whether to use the optional abilities it triggers; Confirm completes it. The lists are re-read
 * after each completion. "End turn" (the window's alternative) ends your Order turn. Only held
 * Orders can be completed; the display's cannot. The Order turn is also one of the player's own
 * turns, so a Flawed ceramic may be sold here (change 30, R20: "Sell a Flawed ceramic", also from
 * the Sell buttons on the table); the turn opens for that alone when nothing can be completed.
 */
import { useT } from "../../i18n/I18nProvider.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { Lead, Note } from "../firing/WindowParts.tsx";
import { SellFlawed } from "../sale/SellFlawed.tsx";
import { OrderCompletionPicker } from "./OrderCompletionPicker.tsx";
import type { CompletionAction } from "./orderCompletion.ts";
import { orderDraft } from "./orderDraft.ts";
import type { OrderAction, OrderDraft } from "./orderDraft.ts";

export function OrderTurn() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [draft, dispatch] = useDraft<OrderDraft, OrderAction>();
  const options = orderDraft.options(draft, model, engine);
  return (
    <div className="dw-form">
      <Lead>{t("orders.turn.lead")}</Lead>
      <OrderCompletionPicker model={model} engine={engine} draft={draft} options={options} dispatch={(action: CompletionAction) => dispatch(action)} />
      <Note>{t("orders.turn.faceUpNote")}</Note>
      {options.sale === null ? null : (
        <SellFlawed model={model} engine={engine} options={options.sale} value={draft.sell} name="orders.sell" onChange={(ceramicId) => dispatch({ type: "sell", ceramicId })} />
      )}
    </div>
  );
}
