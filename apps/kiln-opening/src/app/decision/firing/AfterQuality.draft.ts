/**
 * The draft model of after-Quality abilities (UI_V1.6.1_ARCHITECTURE §3.4 `after_quality`, §3.5;
 * wireframe `decAfterQuality`). Owner: B5.
 *
 * Appendix D step 5 (rev. 4 L663), in First Player order; the queue head uses Protective Saggars, Second Firing
 * and Ge in any order (one per command). `afterQualityOptions` is re-read every revision, so
 * eligibility is rechecked after each use; the draft holds one ability and target, or "end"
 * (`END_AFTER_QUALITY`, the window's alternative: decline the rest, R4).
 *
 * Their own after-Quality turn is also one of the turns in which a player may sell a Flawed
 * ceramic (change 30, R20), one of this firing included: the draft's `sell_flawed` choice builds
 * `SELL_FLAWED` from `sellFlawedOptions` (`sale/sellFlawed.ts`). The turn passes on by itself
 * after a use or a sale when nothing is left to do in it.
 */
import { afterQualityOptions } from "../../../game/index.ts";
import type { AfterQualityAbility, AfterQualityOption, AuthoritativeCommand, CeramicId } from "../../../game/index.ts";
import type { SellFlawedOptions } from "../../../game/index.ts";
import { RULE_NUMBERS, kilnText, qualityName, techName } from "../../i18n/content.ts";
import { msg } from "../../i18n/translator.ts";
import type { Translator } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView, GameModel } from "../../state/model.ts";
import { saleOf, saleOffered, saleOptions, saleSummary } from "../sale/sellFlawed.ts";
import { B5_KILNS, B5_TECHS, ceramicWords, ownFiringCeramicIds } from "./firingSupport.ts";

/** An ability of this step, or selling a Flawed ceramic in this turn (R20). */
export type AfterQualityChoiceKind = AfterQualityAbility | "sell_flawed";

export interface AfterQualityDraft {
  readonly choice: { readonly ability: AfterQualityChoiceKind; readonly ceramicId: CeramicId } | "end" | null;
}

export type AfterQualityAction =
  | { readonly type: "use"; readonly ability: AfterQualityChoiceKind; readonly ceramicId: CeramicId }
  | { readonly type: "end" };

export interface AfterQualityOptionsView {
  abilities: AfterQualityOption[];
  /** The Flawed ceramics the viewer may sell in this turn (R20), or null. */
  sale: SellFlawedOptions | null;
  /** Ending the turn (declining the rest) is always possible. */
  canEnd: true;
}

/** The radio value of one ability and target (`name="afterQuality"`). */
export function afterQualityValue(ability: AfterQualityChoiceKind, ceramicId: CeramicId): string {
  return `${ability}:${ceramicId}`;
}

/** The name of an after-Quality ability: the Tech, or Ge's ability. */
export function afterQualityAbilityName(ability: AfterQualityAbility, t: Translator): string {
  switch (ability) {
    case "protective_saggars":
      return techName(B5_TECHS.protectiveSaggars, t.locale);
    case "second_firing":
      return techName(B5_TECHS.secondFiring, t.locale);
    case "ge_crackle": {
      const ge = kilnText(B5_KILNS.ge, t.locale);
      return t("orders.rules.kilnName", { kiln: ge.name, ability: ge.abilityName });
    }
  }
}

const COMMAND_TYPES = {
  protective_saggars: "USE_PROTECTIVE_SAGGARS",
  second_firing: "USE_SECOND_FIRING",
  ge_crackle: "USE_GE_CRACKLE",
} as const satisfies Record<AfterQualityAbility, AuthoritativeCommand["type"]>;

function offered(engine: EngineView, ability: AfterQualityChoiceKind, ceramicId: CeramicId): boolean {
  if (ability === "sell_flawed") return saleOffered(engine, ceramicId);
  return afterQualityOptions(engine.view).some((option) => option.ability === ability && option.ceramicIds.includes(ceramicId));
}

export const afterQualityDraft: DraftModel<AfterQualityDraft, AfterQualityAction, AfterQualityOptionsView> = {
  initial() {
    return { choice: null };
  },
  reduce(draft, action, _model, engine) {
    switch (action.type) {
      case "revalidate": {
        const choice = draft.choice;
        if (choice === null || choice === "end") return draft;
        return offered(engine, choice.ability, choice.ceramicId) ? draft : { choice: null };
      }
      case "use":
        return offered(engine, action.ability, action.ceramicId) ? { choice: { ability: action.ability, ceramicId: action.ceramicId } } : draft;
      case "end":
        return { choice: "end" };
    }
  },
  options(_draft, _model, engine) {
    return { abilities: afterQualityOptions(engine.view), sale: saleOptions(engine), canEnd: true };
  },
  build(draft, _model, engine) {
    const choice = draft.choice;
    if (choice === null) return null;
    if (choice === "end") return { type: "END_AFTER_QUALITY" };
    if (!offered(engine, choice.ability, choice.ceramicId)) return null;
    if (choice.ability === "sell_flawed") return { type: "SELL_FLAWED", ceramicId: choice.ceramicId };
    return { type: COMMAND_TYPES[choice.ability], ceramicId: choice.ceramicId };
  },
  fromCommand(command) {
    const sale = saleOf(command);
    if (sale !== null) return { choice: { ability: "sell_flawed", ceramicId: sale } };
    switch (command.type) {
      case "USE_PROTECTIVE_SAGGARS":
        return { choice: { ability: "protective_saggars", ceramicId: command.ceramicId } };
      case "USE_SECOND_FIRING":
        return { choice: { ability: "second_firing", ceramicId: command.ceramicId } };
      case "USE_GE_CRACKLE":
        return { choice: { ability: "ge_crackle", ceramicId: command.ceramicId } };
      case "END_AFTER_QUALITY":
        return { choice: "end" };
      default:
        return null;
    }
  },
  summary(draft, model: GameModel, engine) {
    const choice = draft.choice;
    if (choice === null) return msg("firing.aq.pick");
    if (choice === "end") return msg("firing.aq.sumEnd");
    if (choice.ability === "sell_flawed") return saleSummary(model, engine, choice.ceramicId);
    const chosen = choice.ability;
    const mine = ownFiringCeramicIds(model);
    const ability = (t: Translator) => afterQualityAbilityName(chosen, t);
    const ceramic = (t: Translator) => ceramicWords(model, engine, choice.ceramicId, t, mine);
    // Each ability's effect as its card states it (a fixed result, never a Fire-card preview, D3).
    switch (chosen) {
      case "protective_saggars":
        return msg("firing.aq.sumSaggars", { ability, ceramic, quality: (t) => qualityName("fine", t.locale) });
      case "second_firing":
        return msg("firing.aq.sumSecond", { ability, ceramic, n: RULE_NUMBERS.secondFiringCards });
      case "ge_crackle":
        return msg("firing.aq.sumGe", { ability, ceramic, quality: (t) => qualityName("fine", t.locale) });
    }
  },
};
