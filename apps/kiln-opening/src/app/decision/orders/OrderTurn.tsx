/**
 * OrderTurn (UI_V1.6.1_ARCHITECTURE §3.4 `orders`; wireframe `decOrders`). Owner: B5.
 *
 * The Order Phase is the post-firing free-action window (owner revision 5, rev. 5 L318; owner
 * ruling R28), one pass in First Player order. Its pane is the same free-action list as the work
 * turn's (owner UI decision D21; `FreeActionList`), one per Confirm, and the chosen entry's form:
 * - Deliver ⟨Order⟩: the ceramics that complete it (described in words, D9), Crackle declarations
 *   when needed, and whether to use the optional abilities it triggers. Only held Orders can be
 *   completed; the display's cannot;
 * - Sell Flawed: which ceramic, if there are several (also from the Sell buttons on the table);
 * - Imperial Priority: its ceramic waits in your Imperial Kiln for the next round's firing, or, in
 *   the last round, is never fired, which the form says plainly (R28).
 * The list is re-read after each free action. Each Confirm offers Deliver · done (one command) beside
 * Deliver, and Done (the window's alternative) ends your Order turn; the engine ends it by itself
 * once nothing is left. Everything renders from `orderDraft.options()`.
 */
import { useT } from "../../i18n/I18nProvider.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { FreeActionList } from "../FreeActionList.tsx";
import { Lead, Note } from "../firing/WindowParts.tsx";
import { SellFlawed } from "../sale/SellFlawed.tsx";
import { ImperialPriorityForm } from "../work/ImperialPriority.tsx";
import { OrderCompletionPicker } from "./OrderCompletionPicker.tsx";
import type { CompletionAction } from "./orderCompletion.ts";
import { orderDraft } from "./orderDraft.ts";
import type { OrderAction, OrderDraft } from "./orderDraft.ts";

const BLANK_IMPERIAL = { ceramicId: null, glaze: null, modifier: null, rework: null, kilnMaster: null } as const;

export function OrderTurn() {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [draft, dispatch] = useDraft<OrderDraft, OrderAction>();
  const options = orderDraft.options(draft, model, engine);
  const imperial = options.imperialPriority;
  return (
    <div className="dw-form">
      <Lead>{t("orders.turn.lead")}</Lead>
      <FreeActionList items={options.freeActions} value={options.freeAction} onChange={(key) => dispatch({ type: "freeAction", key })} />
      {draft.orderId === null ? null : (
        <>
          <OrderCompletionPicker model={model} engine={engine} draft={draft} options={options} dispatch={(action: CompletionAction) => dispatch(action)} />
          <Note>{t("orders.turn.faceUpNote")}</Note>
        </>
      )}
      {options.sale === null || options.freeAction !== "sell_flawed" ? null : (
        <SellFlawed model={model} engine={engine} options={options.sale} value={draft.sell} name="orders.sell" hideLegend onChange={(ceramicId) => dispatch({ type: "sell", ceramicId })} />
      )}
      {imperial === null || options.freeAction !== "imperial_priority" ? null : (
        <ImperialPriorityForm
          draft={draft.imperialPriority ?? BLANK_IMPERIAL}
          onAction={(action) => dispatch({ type: "imperialPriority", action })}
          extra={options.imperialTiming === "never" ? t("work.ip.lastRound") : t("work.ip.nextRound")}
        />
      )}
    </div>
  );
}
