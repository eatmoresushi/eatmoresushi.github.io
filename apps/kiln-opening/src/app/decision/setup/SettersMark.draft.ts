/**
 * The draft model of Setter's Mark (UI_V1.6.1_ARCHITECTURE §3.4 `setters_mark`). Owner: B4.
 *
 * At the start of the Work Phase, in First Player order (T22, L630): put the tile on an empty
 * active Shared Kiln space — only you may load there this round — or decline (R4). The spaces
 * come from `settersMarkOptions(view)`; they are also the kiln's table targets (§3.5).
 */
import { settersMarkOptions } from "../../../game/index.ts";
import type { KilnSpaceId } from "../../../game/index.ts";
import { kilnSpaceName } from "../../i18n/ceramicLabel.ts";
import { msg } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView, GameModel } from "../../state/model.ts";
import { keepIfSame, viewMemo } from "../work/context.ts";

export interface SettersMarkDraft {
  /** A space, `decline`, or null until chosen. */
  readonly choice: KilnSpaceId | "decline" | null;
}

export type SettersMarkAction = { readonly type: "choose"; readonly choice: KilnSpaceId | "decline" };

export interface SettersMarkOptions {
  spaces: ReadonlyArray<{ spaceId: KilnSpaceId; modifier: number }>;
}

function spacesOf(engine: EngineView): readonly KilnSpaceId[] {
  return viewMemo(engine.view, "settersMarkOptions", () => settersMarkOptions(engine.view));
}

function optionsOf(model: GameModel, engine: EngineView): SettersMarkOptions {
  return {
    spaces: spacesOf(engine).map((spaceId) => ({
      spaceId,
      modifier: model.board.kilnSpaces.find((space) => space.spaceId === spaceId)?.effectiveModifier ?? 0,
    })),
  };
}

function revalidate(draft: SettersMarkDraft, engine: EngineView): SettersMarkDraft {
  const choice = draft.choice;
  const valid = choice === null || choice === "decline" || spacesOf(engine).includes(choice);
  return keepIfSame(draft, { choice: valid ? choice : null });
}

export const settersMarkDraft: DraftModel<SettersMarkDraft, SettersMarkAction, SettersMarkOptions> = {
  initial: () => ({ choice: null }),
  reduce: (draft, action, _model, engine) => (action.type === "revalidate" ? revalidate(draft, engine) : revalidate({ choice: action.choice }, engine)),
  options: (_draft, model, engine) => optionsOf(model, engine),
  build(draft) {
    if (draft.choice === null) return null;
    return { type: "PLACE_SETTERS_MARK", spaceId: draft.choice === "decline" ? null : draft.choice };
  },
  fromCommand: (command) => (command.type === "PLACE_SETTERS_MARK" ? { choice: command.spaceId ?? "decline" } : null),
  summary(draft) {
    const choice = draft.choice;
    if (choice === null) return msg("work.sm.summaryChoose");
    if (choice === "decline") return msg("work.sm.summaryDecline");
    return msg("work.sm.summary", { space: (t) => kilnSpaceName(choice, t) });
  },
};
