/**
 * The draft model of Kiln selection (UI_V1.6.1_ARCHITECTURE §3.4 `kiln_selection`). Owner: B4.
 *
 * Setup step 9 (L107): Kilns are chosen in reverse turn order; all five are selectable (R1).
 * The choices and who took which come from `kilnSelectionOptions(view)`; `KILN_IDS` (which
 * still lists every Kiln) never decides what is offered.
 */
import { kilnSelectionOptions } from "../../../game/index.ts";
import type { KilnId, KilnSelectionOption, PlayerId } from "../../../game/index.ts";
import { kilnText } from "../../i18n/content.ts";
import { msg } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView } from "../../state/model.ts";
import { keepIfSame, viewMemo } from "../work/context.ts";

export interface KilnSelectionDraft {
  readonly kilnId: KilnId | null;
}

export type KilnSelectionAction = { readonly type: "kiln"; readonly kilnId: KilnId };

export interface KilnSelectionOptions {
  kilns: readonly KilnSelectionOption[];
  /** Reverse turn order (public), and whose pick is now. */
  selectionOrder: readonly PlayerId[];
  index: number;
}

function optionsOf(engine: EngineView): KilnSelectionOptions {
  const phase = engine.view.game.phase;
  return {
    kilns: viewMemo(engine.view, "kilnSelectionOptions", () => kilnSelectionOptions(engine.view)),
    selectionOrder: phase.type === "setup_kiln_selection" ? phase.selectionOrder : [],
    index: phase.type === "setup_kiln_selection" ? phase.index : 0,
  };
}

function revalidate(draft: KilnSelectionDraft, engine: EngineView): KilnSelectionDraft {
  const offered = optionsOf(engine).kilns.some((kiln) => kiln.kilnId === draft.kilnId && kiln.available);
  return keepIfSame(draft, { kilnId: offered ? draft.kilnId : null });
}

export const kilnSelectionDraft: DraftModel<KilnSelectionDraft, KilnSelectionAction, KilnSelectionOptions> = {
  initial(_model, engine) {
    const available = optionsOf(engine).kilns.filter((kiln) => kiln.available);
    return { kilnId: available.length === 1 ? (available[0]?.kilnId ?? null) : null };
  },
  reduce: (draft, action, _model, engine) => (action.type === "revalidate" ? revalidate(draft, engine) : revalidate({ kilnId: action.kilnId }, engine)),
  options: (_draft, _model, engine) => optionsOf(engine),
  build: (draft) => (draft.kilnId === null ? null : { type: "SELECT_KILN", kilnId: draft.kilnId }),
  fromCommand: (command) => (command.type === "SELECT_KILN" ? { kilnId: command.kilnId } : null),
  summary(draft) {
    const kilnId = draft.kilnId;
    if (kilnId === null) return msg("work.ks.summaryChoose");
    return msg("work.ks.summary", { kiln: (t) => kilnText(kilnId, t.locale).name });
  },
};
