/**
 * The draft model of the Guild Hall Shifu inspection (UI_V1.6.1_ARCHITECTURE §3.4
 * `guild_inspection`, §8.1; v1.6.2 L206–213, B2, owner revision 2026-10-17). Owner: B4.
 *
 * After inspecting a discipline (B2, private), the Shifu takes up to 2 Techs from different
 * disciplines, inspected or face up, each at its printed cost, one per command (`GUILD_TAKE`).
 * After the first take the window opens again (its open key counts the takes): the Shifu may take
 * a second Tech or stop (`GUILD_FINISH`), which returns every untaken inspected Tech to the bottom
 * of that deck in an order only they know (`GUILD_FINISH.bottomOrder`). When nothing is left to
 * decide the engine closes the action itself (its forced bottom order of 0 or 1 Tech).
 *
 * Costs, legality, reasons, the takes so far and whether finishing is allowed all come from
 * `guildInspectionOptions(view)`. The bottom order starts in the order the cards were seen and
 * is changed with Move up / Move down (`ReorderList`).
 *
 * The face-up Techs may also be chosen on the Tech display (owner review, 2026-10-17, D14):
 * `inspectionTechChooser` gives the window's table adapter its targets (take mode), for the first
 * take and the second; the inspected Techs never leave the pane (B2). A when-acquired effect of
 * the first take (Colour Samples' look) is its own window between the two takes; the engine then
 * reopens this one with the take counted.
 *
 * After the second take (`takesLeft === 0`, `inspectionReturnOnly`) the engine keeps the step open
 * only while 2 inspected Techs are untaken: their bottom order is the one decision left. Stopping
 * is then pre-selected, the table offers no Tech (`inspectionTechChooser` is null) and the window
 * asks only for that order.
 */
import { guildInspectionOptions } from "../../../game/index.ts";
import type { GuildInspectionOptions, GuildTechOption, TechId } from "../../../game/index.ts";
import { disciplineName, techName } from "../../i18n/content.ts";
import { msg } from "../../i18n/translator.ts";
import type { RichMessage, Translator } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView, GameModel } from "../../state/model.ts";
import type { TechChooser, TechTarget } from "../../state/tableSelection.ts";
import { keepIfSame, viewMemo } from "./context.ts";
import { techReasonDetails } from "./locations/GuildHall.draft.ts";
import { amountText } from "./locations/shared.ts";

export interface GuildTake {
  readonly kind: "inspected" | "face_up";
  readonly techId: TechId;
}

/** The radio value of "take no more Techs". */
export const GUILD_FINISH_VALUE = "finish";

export type GuildChoice = { readonly kind: "take"; readonly take: GuildTake } | { readonly kind: "finish" };

export interface GuildInspectionDraft {
  /** A Tech to take now, or stop taking (after at least 1 take); null until chosen. */
  readonly choice: GuildChoice | null;
  /** Every untaken inspected Tech, top to bottom as they will sit at the deck bottom. */
  readonly bottomOrder: readonly TechId[];
}

export type GuildInspectionAction =
  | { readonly type: "take"; readonly take: GuildTake }
  | { readonly type: "finish" }
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
function bottomFor(options: GuildInspectionOptions, current: readonly TechId[]): TechId[] {
  const required = options.inspected.map((option) => option.techId);
  const kept = current.filter((techId) => required.includes(techId));
  return [...kept, ...required.filter((techId) => !kept.includes(techId))];
}

/**
 * Both takes are made (v1.6.2 L207: up to 2): only the untaken inspected Techs' bottom order is
 * left to decide (B2).
 */
export function inspectionReturnOnly(options: GuildInspectionOptions): boolean {
  return options.takesLeft === 0;
}

/** No Tech can be taken next: stopping is the only choice. */
function onlyFinish(options: GuildInspectionOptions): boolean {
  return options.canFinish && ![...options.inspected, ...options.faceUp].some((option) => option.legal);
}

function settle(draft: GuildInspectionDraft, engine: EngineView): GuildInspectionDraft {
  const options = optionsOf(engine);
  if (options === null) return keepIfSame(draft, { choice: null, bottomOrder: [] });
  let choice = draft.choice;
  if (choice !== null && choice.kind === "take" && findOption(options, choice.take)?.legal !== true) choice = null;
  if (choice !== null && choice.kind === "finish" && !options.canFinish) choice = null;
  return keepIfSame(draft, { choice, bottomOrder: bottomFor(options, draft.bottomOrder) });
}

/**
 * A Tech's reason in the inspection with the details its sentence needs: the Coins held and this
 * action's take limit (`takes` + `takesLeft`), or null when it may be taken next.
 */
export function inspectionReason(option: GuildTechOption, options: GuildInspectionOptions, model: GameModel): TechTarget["reason"] {
  const coins = model.me?.resources.coins;
  return techReasonDetails(option, { ...(coins === undefined ? {} : { coins }), maxTechs: options.takes.length + options.takesLeft });
}

/**
 * The Tech display's chooser during the inspection (owner review, 2026-10-17; v1.6.2 L207): every
 * face-up Tech showing now, legal or not, pressed when the draft takes it. The inspected Techs are
 * private and stay in the pane (B2). Null when the viewer has no open inspection, and after the
 * second take, when no Tech can be taken any more (`inspectionReturnOnly`).
 */
export function inspectionTechChooser(draft: GuildInspectionDraft, model: GameModel, engine: EngineView): TechChooser | null {
  const options = optionsOf(engine);
  if (options === null || inspectionReturnOnly(options)) return null;
  const chosen = draft.choice?.kind === "take" && draft.choice.take.kind === "face_up" ? draft.choice.take.techId : null;
  const techs = new Map<TechId, TechTarget>(
    options.faceUp.map((option) => [option.techId, { pressed: chosen === option.techId, legal: option.legal, reason: inspectionReason(option, options, model), cost: option.cost }]),
  );
  return { mode: "take", worker: { kind: "shifu", seniorApprentice: false }, techs, disciplines: new Map(), taken: options.takes.length };
}

export const guildInspectionDraft: DraftModel<GuildInspectionDraft, GuildInspectionAction, GuildInspectionDraftOptions> = {
  initial(_model, engine) {
    const options = optionsOf(engine);
    if (options === null) return { choice: null, bottomOrder: [] };
    // §3.5: when stopping is the only choice, it is pre-selected.
    return { choice: onlyFinish(options) ? { kind: "finish" } : null, bottomOrder: bottomFor(options, []) };
  },
  reduce(draft, action, _model, engine) {
    switch (action.type) {
      case "revalidate":
        return settle(draft, engine);
      case "take": {
        // A Tech the engine says cannot be taken next is ignored; the current choice stays.
        const options = optionsOf(engine);
        if (options === null || findOption(options, action.take)?.legal !== true) return draft;
        return settle({ ...draft, choice: { kind: "take", take: { kind: action.take.kind, techId: action.take.techId } } }, engine);
      }
      case "finish":
        return optionsOf(engine)?.canFinish === true ? settle({ ...draft, choice: { kind: "finish" } }, engine) : draft;
      case "reorder": {
        const same = action.bottomOrder.length === draft.bottomOrder.length && action.bottomOrder.every((techId) => draft.bottomOrder.includes(techId));
        return same ? settle({ ...draft, bottomOrder: [...action.bottomOrder] }, engine) : draft;
      }
    }
  },
  options: (_draft, _model, engine) => optionsOf(engine),
  build(draft, _model, engine) {
    const settled = settle(draft, engine);
    const choice = settled.choice;
    if (optionsOf(engine) === null || choice === null) return null;
    if (choice.kind === "finish") return { type: "GUILD_FINISH", bottomOrder: [...settled.bottomOrder] };
    return { type: "GUILD_TAKE", take: { kind: choice.take.kind, techId: choice.take.techId } };
  },
  fromCommand(command, _model, engine) {
    const options = optionsOf(engine);
    if (options === null) return null;
    if (command.type === "GUILD_TAKE") return { choice: { kind: "take", take: { kind: command.take.kind, techId: command.take.techId } }, bottomOrder: bottomFor(options, []) };
    if (command.type === "GUILD_FINISH") return { choice: { kind: "finish" }, bottomOrder: [...command.bottomOrder] };
    return null;
  },
  summary(draft, _model, engine): RichMessage {
    const options = optionsOf(engine);
    const choice = draft.choice;
    if (options === null || choice === null) return options?.canFinish === true ? msg("work.gi.summaryChooseOrFinish") : msg("work.gi.summaryChoose");
    if (choice.kind === "finish") {
      const discipline = options.discipline;
      if (draft.bottomOrder.length === 0) return msg("work.gi.summaryFinishNone");
      const values = { discipline: (t: Translator) => disciplineName(discipline, t.locale) };
      return inspectionReturnOnly(options) ? msg("work.gi.summaryReturn", values) : msg("work.gi.summaryFinish", values);
    }
    const take = choice.take;
    const option = findOption(options, take);
    if (option === undefined) return msg("work.gi.summaryChoose");
    return msg("work.gi.summary", { tech: (t) => techName(take.techId, t.locale), price: (t) => amountText(t, "coins", option.cost) });
  },
};
