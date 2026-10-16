/**
 * The draft model of Salvage (UI_V1.6.1_ARCHITECTURE §3.4 `salvage`, §3.5, §3.7). Owner: B5.
 *
 * Firing step 11, parallel: every player with a still-Flawed ceramic from this firing decides,
 * in any order (`SALVAGE_FLAWED { ceramicId }` for the Coins, or `{ ceramicId: null }` to keep
 * it — the window's alternative). The ceramics and the Coins come from `salvageOptions`. The
 * draft survives other players' decisions (it is revalidated, not reset, §3.5).
 */
import { salvageOptions } from "../../../game/index.ts";
import type { CeramicId } from "../../../game/index.ts";
import { msg } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView } from "../../state/model.ts";
import { ceramicWords, coinsText } from "./firingSupport.ts";

export interface SalvageDraft {
  /** A ceramic to salvage, "keep" to salvage nothing, or null while undecided. */
  readonly choice: CeramicId | "keep" | null;
}

export type SalvageAction = { readonly type: "salvage"; readonly ceramicId: CeramicId } | { readonly type: "keep" };

export interface SalvageOptionsView {
  ceramicIds: CeramicId[];
  coins: number;
  /** Keeping every Flawed ceramic is always possible. */
  canKeep: true;
}

function optionsFor(engine: EngineView): SalvageOptionsView {
  const options = salvageOptions(engine.view);
  return { ceramicIds: options?.ceramicIds ?? [], coins: options?.coins ?? 0, canKeep: true };
}

export const salvageDraft: DraftModel<SalvageDraft, SalvageAction, SalvageOptionsView> = {
  initial() {
    // §3.5: nothing is pre-selected; even one Flawed ceramic leaves "keep" as the other choice.
    return { choice: null };
  },
  reduce(draft, action, _model, engine) {
    switch (action.type) {
      case "revalidate":
        return draft.choice === null || draft.choice === "keep" || optionsFor(engine).ceramicIds.includes(draft.choice) ? draft : { choice: null };
      case "salvage":
        return optionsFor(engine).ceramicIds.includes(action.ceramicId) ? { choice: action.ceramicId } : draft;
      case "keep":
        return { choice: "keep" };
    }
  },
  options(_draft, _model, engine) {
    return optionsFor(engine);
  },
  build(draft, _model, engine) {
    if (draft.choice === null) return null;
    if (draft.choice === "keep") return { type: "SALVAGE_FLAWED", ceramicId: null };
    return optionsFor(engine).ceramicIds.includes(draft.choice) ? { type: "SALVAGE_FLAWED", ceramicId: draft.choice } : null;
  },
  fromCommand(command) {
    return command.type === "SALVAGE_FLAWED" ? { choice: command.ceramicId ?? "keep" } : null;
  },
  summary(draft, model, engine) {
    const choice = draft.choice;
    if (choice === null) return msg("firing.salvage.pick");
    if (choice === "keep") return msg("firing.salvage.sumKeep");
    const options = optionsFor(engine);
    return msg("firing.salvage.sum", { ceramic: (t) => ceramicWords(model, engine, choice, t, options.ceramicIds), coins: (t) => coinsText(options.coins, t) });
  },
};
