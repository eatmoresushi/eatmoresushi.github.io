/**
 * The draft model of the Guild Hall Shifu inspection (UI_V1.6.1_ARCHITECTURE §3.4
 * `guild_inspection`, §8.1). Owner: B4.
 *
 * After inspecting a discipline (B2, private), the Shifu takes one inspected Tech or one
 * face-up Tech of any discipline at −1 Coin (L207), and returns every untaken inspected Tech
 * to the bottom of that deck in an order only they know (`GUILD_TAKE.bottomOrder`). Prices,
 * legality and reasons come from `guildInspectionOptions(view)`. The bottom order starts in the
 * order the cards were seen and is changed with Move up / Move down (`ReorderList`).
 */
import { guildInspectionOptions } from "../../../game/index.ts";
import type { GuildInspectionOptions, GuildTechOption, TechId } from "../../../game/index.ts";
import { techName } from "../../i18n/content.ts";
import { msg } from "../../i18n/translator.ts";
import type { RichMessage } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView } from "../../state/model.ts";
import { keepIfSame, viewMemo } from "./context.ts";
import { amountText } from "./locations/shared.ts";

export interface GuildTake {
  readonly kind: "inspected" | "face_up";
  readonly techId: TechId;
}

export interface GuildInspectionDraft {
  readonly take: GuildTake | null;
  /** Every untaken inspected Tech, top to bottom as they will sit at the deck bottom. */
  readonly bottomOrder: readonly TechId[];
}

export type GuildInspectionAction =
  | { readonly type: "take"; readonly take: GuildTake }
  | { readonly type: "reorder"; readonly bottomOrder: readonly TechId[] };

export type GuildInspectionDraftOptions = GuildInspectionOptions | null;

function optionsOf(engine: EngineView): GuildInspectionOptions | null {
  return viewMemo(engine.view, "guildInspectionOptions", () => guildInspectionOptions(engine.view));
}

/** Take value of an option: `inspected:T13` / `face_up:T05`. */
export function takeKey(take: GuildTake): string {
  return `${take.kind}:${take.techId}`;
}

function findOption(options: GuildInspectionOptions, take: GuildTake): GuildTechOption | undefined {
  return (take.kind === "inspected" ? options.inspected : options.faceUp).find((option) => option.techId === take.techId);
}

/** The untaken inspected Techs, kept in the current order, any missing ones after. */
function bottomFor(options: GuildInspectionOptions, take: GuildTake | null, current: readonly TechId[]): TechId[] {
  const required = options.inspected.map((option) => option.techId).filter((techId) => take === null || take.kind !== "inspected" || take.techId !== techId);
  const kept = current.filter((techId) => required.includes(techId));
  return [...kept, ...required.filter((techId) => !kept.includes(techId))];
}

function revalidate(draft: GuildInspectionDraft, engine: EngineView): GuildInspectionDraft {
  const options = optionsOf(engine);
  if (options === null) return keepIfSame(draft, { take: null, bottomOrder: [] });
  const option = draft.take === null ? undefined : findOption(options, draft.take);
  const take = draft.take !== null && option !== undefined && option.legal ? draft.take : null;
  return keepIfSame(draft, { take, bottomOrder: bottomFor(options, take, draft.bottomOrder) });
}

export const guildInspectionDraft: DraftModel<GuildInspectionDraft, GuildInspectionAction, GuildInspectionDraftOptions> = {
  initial(_model, engine) {
    const options = optionsOf(engine);
    return { take: null, bottomOrder: options === null ? [] : bottomFor(options, null, []) };
  },
  reduce(draft, action, _model, engine) {
    switch (action.type) {
      case "revalidate":
        return revalidate(draft, engine);
      case "take":
        return revalidate({ ...draft, take: action.take }, engine);
      case "reorder": {
        const same = action.bottomOrder.length === draft.bottomOrder.length && action.bottomOrder.every((techId) => draft.bottomOrder.includes(techId));
        return same ? revalidate({ ...draft, bottomOrder: [...action.bottomOrder] }, engine) : draft;
      }
    }
  },
  options: (_draft, _model, engine) => optionsOf(engine),
  build(draft, _model, engine) {
    const options = optionsOf(engine);
    if (options === null || draft.take === null) return null;
    return { type: "GUILD_TAKE", take: { kind: draft.take.kind, techId: draft.take.techId }, bottomOrder: [...draft.bottomOrder] };
  },
  fromCommand(command) {
    if (command.type !== "GUILD_TAKE") return null;
    return { take: { kind: command.take.kind, techId: command.take.techId }, bottomOrder: [...command.bottomOrder] };
  },
  summary(draft, _model, engine): RichMessage {
    const options = optionsOf(engine);
    const take = draft.take;
    const option = options === null || take === null ? undefined : findOption(options, take);
    if (take === null || option === undefined) return msg("work.gi.summaryChoose");
    return msg("work.gi.summary", { tech: (t) => techName(take.techId, t.locale), price: (t) => amountText(t, "coins", option.price) });
  },
};
