/**
 * The Guild Hall sub-draft (UI_V1.6.1_ARCHITECTURE §3.4; wireframe `subEditor` guild_hall).
 * Owner: B4.
 *
 * Apprentice effect: buy one face-up Tech at its printed cost. Shifu effect: choose a discipline
 * to inspect (any, even one already owned, B2); up to 2 takes from different disciplines, each at
 * its printed cost, and the secret bottom order follow in the `guild_inspection` window (v1.6.2
 * L207). Costs, legality and reasons come from `guildOptions(view, effect)`.
 *
 * The choice is made on the table (owner review, 2026-10-17): `techChooserOf` turns the options
 * into the Tech display's targets (`TableSelectionData.techChooser`), and the work window's table
 * adapter sends their clicks back as this sub-draft's `tech` and `discipline` actions.
 */
import { guildOptions, placementLimits } from "../../../../game/index.ts";
import type { GuildOptions, GuildTechOption, TechDiscipline, TechId } from "../../../../game/index.ts";
import type { TechChooser, TechTarget } from "../../../state/tableSelection.ts";
import { RULE_NUMBERS, disciplineName, techName } from "../../../i18n/content.ts";
import { msg } from "../../../i18n/translator.ts";
import type { MessageParam } from "../../../i18n/translator.ts";
import { keepIfSame, viewMemo } from "../context.ts";
import type { LocationDraftModel, PlacementCommandOf, PlacementContext } from "./editor.ts";
import { amountText } from "./shared.ts";

export interface GuildHallDraft {
  readonly techId: TechId | null;
  readonly discipline: TechDiscipline | null;
}

export type GuildHallAction = { readonly type: "tech"; readonly techId: TechId } | { readonly type: "discipline"; readonly discipline: TechDiscipline };

export interface GuildHallOptions {
  /** `buy` for the Apprentice effect, `inspect` for the Shifu effect. */
  mode: "buy" | "inspect";
  guild: GuildOptions;
  /** How many Techs this action may take: 1, or up to 2 for the Shifu effect (v1.6.2 L206–207). */
  maxTechs: number;
}

const BLANK: GuildHallDraft = Object.freeze({ techId: null, discipline: null });

function selectorOptions(context: PlacementContext): GuildOptions {
  return viewMemo(context.view, `guildOptions:${context.worker.effect}`, () => guildOptions(context.view, context.worker.effect));
}

function modeOf(context: PlacementContext): "buy" | "inspect" {
  return context.worker.effect === "shifu" ? "inspect" : "buy";
}

function revalidate(draft: GuildHallDraft, context: PlacementContext): GuildHallDraft {
  const guild = selectorOptions(context);
  const mode = modeOf(context);
  const techId = mode === "buy" && draft.techId !== null && guild.faceUp.some((tech) => tech.techId === draft.techId && tech.legal) ? draft.techId : null;
  const discipline = mode === "inspect" && draft.discipline !== null && guild.inspect.some((entry) => entry.discipline === draft.discipline) ? draft.discipline : null;
  return keepIfSame(draft, { techId, discipline });
}

/**
 * A Tech's reason with the details its message needs, or null when legal: the discipline
 * (`TECH_DISCIPLINE_OWNED`), the Tech limit (`TECH_LIMIT`), the printed cost and the Coins held
 * (`INSUFFICIENT_RESOURCES`, when `coins` is known) and the action's take limit (`TECH_TAKE_LIMIT`,
 * when `maxTechs` is known). The engine's sentence falls back to fewer words without them.
 */
export function techReasonDetails(option: GuildTechOption, known: { coins?: number; maxTechs?: number } = {}): TechTarget["reason"] {
  if (option.reason === null) return null;
  return {
    code: option.reason,
    details: {
      techId: option.techId,
      discipline: option.discipline,
      maxOwned: RULE_NUMBERS.techsMaxOwned,
      resource: "coins",
      ...(known.coins === undefined ? {} : { needed: option.cost, have: known.coins }),
      ...(known.maxTechs === undefined ? {} : { limit: known.maxTechs }),
    },
  };
}

/** The Tech display's Guild Hall chooser for this placement: every face-up Tech, or every discipline. */
export function techChooserOf(draft: GuildHallDraft, context: PlacementContext): TechChooser {
  const guild = selectorOptions(context);
  const mode = modeOf(context);
  const techs = new Map<TechId, TechTarget>();
  const disciplines = new Map<TechDiscipline, { pressed: boolean }>();
  if (mode === "buy") {
    for (const tech of guild.faceUp) {
      techs.set(tech.techId, { pressed: draft.techId === tech.techId, legal: tech.legal, reason: techReasonDetails(tech, { coins: context.me.resources.coins }), cost: tech.cost });
    }
  } else {
    for (const entry of guild.inspect) disciplines.set(entry.discipline, { pressed: draft.discipline === entry.discipline });
  }
  return { mode, worker: { kind: context.worker.kind, seniorApprentice: context.worker.seniorApprentice }, techs, disciplines, taken: 0 };
}

export const guildHallDraft: LocationDraftModel<"guild_hall", GuildHallDraft, GuildHallAction, GuildHallOptions> = {
  locationId: "guild_hall",
  blank: () => BLANK,
  prepare: (draft, context) => revalidate(draft, context),
  reduce(draft, action, context) {
    switch (action.type) {
      case "revalidate":
        return revalidate(draft, context);
      case "tech":
        return revalidate({ ...draft, techId: action.techId }, context);
      case "discipline":
        return revalidate({ ...draft, discipline: action.discipline }, context);
    }
  },
  options: (_draft, context) => ({
    mode: modeOf(context),
    guild: selectorOptions(context),
    maxTechs: placementLimits(context.view, "guild_hall", context.worker.effect).maxTechs,
  }),
  build(draft, context): PlacementCommandOf<"guild_hall"> | null {
    const workerId = context.worker.workerId;
    if (modeOf(context) === "buy") return draft.techId === null ? null : { type: "PLACE_GUILD_HALL", workerId, choice: { kind: "buy_face_up", techId: draft.techId } };
    return draft.discipline === null ? null : { type: "PLACE_GUILD_HALL", workerId, choice: { kind: "inspect", discipline: draft.discipline } };
  },
  fromCommand(cmd, context) {
    const mode = modeOf(context);
    if (cmd.choice.kind === "buy_face_up") return mode === "buy" ? { techId: cmd.choice.techId, discipline: null } : null;
    return mode === "inspect" ? { techId: null, discipline: cmd.choice.discipline } : null;
  },
  detail(draft, context): MessageParam | null {
    const techId = draft.techId;
    const bought = techId === null ? undefined : selectorOptions(context).faceUp.find((tech) => tech.techId === techId);
    if (techId !== null && bought !== undefined) {
      return msg("work.gh.detailBuy", { tech: (t) => techName(techId, t.locale), price: (t) => amountText(t, "coins", bought.cost) });
    }
    const discipline = draft.discipline;
    if (discipline !== null) return msg("work.gh.detailInspect", { discipline: (t) => disciplineName(discipline, t.locale) });
    return null;
  },
};
