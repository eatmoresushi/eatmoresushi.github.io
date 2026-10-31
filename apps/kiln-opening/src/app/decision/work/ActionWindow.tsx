/**
 * ActionWindow (UI_V1.6.1_ARCHITECTURE §3.4, §4.3 rule 3; owner UI decision D21). Owner: B4.
 *
 * A free action's form in a Work turn (owner revision 5, change 36, rev. 5 L168–176: complete a held
 * Order, sell a Flawed ceramic, spend Imperial Priority; never worker actions) or the Colour Samples
 * swap's (rev. 5 L632; not a free action, same timing). Before the worker action the form was opened
 * from a chip or a piece, so only the form shows, under its own heading. After the worker action the
 * pane is the free-action list with the chosen entry's form below it, and End turn is the
 * ConfirmBar's alternative (its only button until something is chosen). Their drafts live in the
 * work draft.
 */
import { useT } from "../../i18n/I18nProvider.tsx";
import { useDraft, useEngineView, useGame } from "../../state/hooks.ts";
import { FreeActionList } from "../FreeActionList.tsx";
import { OrderCompletionPicker } from "../orders/OrderCompletionPicker.tsx";
import { SellFlawed } from "../sale/SellFlawed.tsx";
import { ColourSamplesSwap } from "./ColourSamplesSwap.tsx";
import { ImperialPriority } from "./ImperialPriority.tsx";
import { FormNote } from "./pieces.tsx";
import { workDraft } from "./workDraft.ts";
import type { WorkAction, WorkDraft } from "./workDraft.ts";
import "./pieces.css";

export interface ActionWindowProps {
  source: "before_action" | "after_action";
}

export function ActionWindow({ source }: ActionWindowProps) {
  const t = useT();
  const model = useGame();
  const engine = useEngineView();
  const [draft, dispatch] = useDraft<WorkDraft, WorkAction>();
  const options = workDraft.options(draft, model, engine);
  const after = source === "after_action";
  return (
    <div className="b4-form" data-b4="action-window" data-source={source}>
      {!after ? null : options.freeActions.length === 0 ? (
        <FormNote>{t("work.work.noFreeAction")}</FormNote>
      ) : (
        <FreeActionList items={options.freeActions} value={options.freeAction} onChange={(key) => dispatch({ type: "freeAction", key })} />
      )}
      {draft.mode === "imperial_priority" ? <ImperialPriority /> : null}
      {draft.mode === "colour_samples_swap" ? <ColourSamplesSwap brief={after} /> : null}
      {draft.mode === "sell_flawed" && options.sale !== null ? (
        <SellFlawed model={model} engine={engine} options={options.sale} value={draft.sell} name="work.sell" hideLegend onChange={(ceramicId) => dispatch({ type: "sell", ceramicId })} />
      ) : null}
      {draft.mode === "complete_order" && options.completion !== null ? (
        <OrderCompletionPicker
          model={model}
          engine={engine}
          draft={draft.completion}
          options={options.completion}
          dispatch={(action) => dispatch({ type: "complete", action })}
          namePrefix="work."
          showOrder={!after}
        />
      ) : null}
    </div>
  );
}
