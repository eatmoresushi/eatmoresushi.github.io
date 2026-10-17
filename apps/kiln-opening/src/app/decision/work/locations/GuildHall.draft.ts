/**
 * The Guild Hall sub-draft (UI_V1.6.1_ARCHITECTURE §3.4; wireframe `subEditor` guild_hall).
 * Owner: B4.
 *
 * Apprentice effect: buy one face-up Tech at its printed cost. Shifu effect: choose a discipline
 * to inspect (any, even one already owned, B2); the take and the secret bottom order follow in
 * the `guild_inspection` window. Prices, legality and reasons come from `guildOptions(view,
 * effect)`.
 *
 * The choice is made on the table (owner review, 2026-10-17): `techChooserOf` turns the options
 * into the Tech display's targets (`TableSelectionData.techChooser`), and the work window's table
 * adapter sends their clicks back as this sub-draft's `tech` and `discipline` actions.
 */
import { guildOptions } from "../../../../game/index.ts";
import type { GuildOptions, GuildTechOption, TechDiscipline, TechId } from "../../../../game/index.ts";
import type { TechChooser, TechTarget } from "../../../state/tableSelection.ts";
import { disciplineName, techName } from "../../../i18n/content.ts";
import { msg } from "../../../i18n/translator.ts";
import type { MessageParam } from "../../../i18n/translator.ts";
import { keepIfSame, viewMemo } from "../context.ts";
import type { LocationDraftModel, PlacementCommandOf, PlacementContext } from "./editor.ts";

export interface GuildHallDraft {
  readonly techId: TechId | null;
  readonly discipline: TechDiscipline | null;
}

export type GuildHallAction = { readonly type: "tech"; readonly techId: TechId } | { readonly type: "discipline"; readonly discipline: TechDiscipline };

export interface GuildHallOptions {
  /** `buy` for the Apprentice effect, `inspect` for the Shifu effect. */
  mode: "buy" | "inspect";
  guild: GuildOptions;
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

/** A Tech's reason with the details its message needs (discipline, Coins), or null when legal. */
export function techReasonDetails(option: GuildTechOption): TechTarget["reason"] {
  if (option.reason === null) return null;
  return { code: option.reason, details: { techId: option.techId, discipline: option.discipline, resource: "coins" } };
}

/** The Tech display's Guild Hall chooser for this placement: every face-up Tech, or every discipline. */
export function techChooserOf(draft: GuildHallDraft, context: PlacementContext): TechChooser {
  const guild = selectorOptions(context);
  const mode = modeOf(context);
  const techs = new Map<TechId, TechTarget>();
  const disciplines = new Map<TechDiscipline, { pressed: boolean }>();
  if (mode === "buy") {
    for (const tech of guild.faceUp) {
      techs.set(tech.techId, { pressed: draft.techId === tech.techId, legal: tech.legal, reason: techReasonDetails(tech), printedCost: tech.printedCost, price: tech.price });
    }
  } else {
    for (const entry of guild.inspect) disciplines.set(entry.discipline, { pressed: draft.discipline === entry.discipline });
  }
  return { mode, worker: { kind: context.worker.kind, seniorApprentice: context.worker.seniorApprentice }, techs, disciplines };
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
  options: (_draft, context) => ({ mode: modeOf(context), guild: selectorOptions(context) }),
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
  detail(draft): MessageParam | null {
    const techId = draft.techId;
    if (techId !== null) return (t) => techName(techId, t.locale);
    const discipline = draft.discipline;
    if (discipline !== null) return msg("work.gh.detailInspect", { discipline: (t) => disciplineName(discipline, t.locale) });
    return null;
  },
};
