/**
 * The draft model of Contributions (UI_V1.6.1_ARCHITECTURE §3.5, §3.7; wireframe `decContrib`).
 * Owner: B5.
 *
 * Firing step 1, secret and simultaneous. Every card, its Heat, its Wood and whether it is
 * affordable come from `contributionOptions` (which includes the Fuel Ledger variants when the
 * viewer owns it); the draft only remembers the card and the Fuel Ledger toggle, and `build`
 * returns the selector's own command, so the window ID is always the open window's.
 *
 * - The Fuel Ledger toggle applies only to cards that have a Fuel Ledger variant (Bank and
 *   Stoke); while it is on, a card without one is unavailable (wireframe `ctFuelNA`).
 * - An unaffordable choice is shown with its reason and never selected.
 */
import type { ContributionCardId, ContributionOption } from "../../../game/index.ts";
import { contributionOptions } from "../../../game/index.ts";
import { contributionCardName, techName } from "../../i18n/content.ts";
import { signed } from "../../i18n/format.ts";
import { msg } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView, GameModel } from "../../state/model.ts";
import { B5_TECHS, woodText } from "./firingSupport.ts";

export interface ContributionsDraft {
  readonly card: ContributionCardId | null;
  readonly fuelLedger: boolean;
}

export type ContributionsAction = { readonly type: "card"; readonly card: ContributionCardId } | { readonly type: "fuelLedger"; readonly on: boolean };

/** One card as the form shows it: the variant that the current toggle would submit. */
export interface ContributionCardChoice {
  card: ContributionCardId;
  option: ContributionOption;
  /** Unavailable: unaffordable, or the toggle is on and this card has no Fuel Ledger variant. */
  available: boolean;
  /** Why it is unavailable. */
  reason: "cant_afford" | "fuel_ledger_bank_stoke" | null;
}

export interface ContributionsOptions {
  /** The cards in the selector's order (Tend, Bank, Stoke). */
  cards: ContributionCardChoice[];
  /** Fuel Ledger is owned: the toggle is offered, with the cards it applies to. */
  fuelLedger: { appliesTo: ContributionCardId[]; bank: ContributionOption | null; stoke: ContributionOption | null } | null;
  /** The option the draft would submit, or null. */
  chosen: ContributionOption | null;
}

function variants(engine: EngineView): ContributionOption[] {
  return contributionOptions(engine.view);
}

function find(options: readonly ContributionOption[], card: ContributionCardId, fuelLedger: boolean): ContributionOption | null {
  return options.find((option) => option.command.card === card && option.command.fuelLedger === fuelLedger) ?? null;
}

function optionsFor(draft: ContributionsDraft, engine: EngineView): ContributionsOptions {
  const all = variants(engine);
  const base = all.filter((option) => !option.command.fuelLedger);
  const fuel = all.filter((option) => option.command.fuelLedger);
  const fuelOn = draft.fuelLedger && fuel.length > 0;
  const cards = base.map((plain): ContributionCardChoice => {
    const card = plain.command.card;
    const withFuel = find(fuel, card, true);
    if (fuelOn && withFuel === null) return { card, option: plain, available: false, reason: "fuel_ledger_bank_stoke" };
    const option = fuelOn && withFuel !== null ? withFuel : plain;
    return { card, option, available: option.affordable, reason: option.affordable ? null : "cant_afford" };
  });
  const chosen = draft.card === null ? null : cards.find((choice) => choice.card === draft.card && choice.available)?.option ?? null;
  return {
    cards,
    fuelLedger: fuel.length === 0 ? null : { appliesTo: fuel.map((option) => option.command.card), bank: find(fuel, "BANK", true), stoke: find(fuel, "STOKE", true) },
    chosen,
  };
}

function revalidate(draft: ContributionsDraft, engine: EngineView): ContributionsDraft {
  const options = optionsFor(draft, engine);
  const fuelLedger = draft.fuelLedger && options.fuelLedger !== null;
  const settled = fuelLedger === draft.fuelLedger ? options : optionsFor({ ...draft, fuelLedger }, engine);
  const card = draft.card !== null && settled.cards.some((choice) => choice.card === draft.card && choice.available) ? draft.card : null;
  return card === draft.card && fuelLedger === draft.fuelLedger ? draft : { card, fuelLedger };
}

export const contributionsDraft: DraftModel<ContributionsDraft, ContributionsAction, ContributionsOptions> = {
  initial(_model: GameModel, engine: EngineView) {
    const options = optionsFor({ card: null, fuelLedger: false }, engine);
    const available = options.cards.filter((choice) => choice.available);
    // Only one card a player could submit: it is the choice (§3.5).
    return { card: available.length === 1 && options.fuelLedger === null ? available[0]!.card : null, fuelLedger: false };
  },
  reduce(draft, action, _model, engine) {
    switch (action.type) {
      case "revalidate":
        return revalidate(draft, engine);
      case "card": {
        const choice = optionsFor(draft, engine).cards.find((candidate) => candidate.card === action.card);
        return choice === undefined || !choice.available ? draft : { ...draft, card: action.card };
      }
      case "fuelLedger": {
        if (optionsFor(draft, engine).fuelLedger === null) return draft;
        const next = { ...draft, fuelLedger: action.on };
        return revalidate(next, engine);
      }
    }
  },
  options(draft, _model, engine) {
    return optionsFor(draft, engine);
  },
  build(draft, _model, engine) {
    const chosen = optionsFor(draft, engine).chosen;
    return chosen === null ? null : { ...chosen.command };
  },
  fromCommand(command) {
    return command.type === "SUBMIT_CONTRIBUTION" ? { card: command.card, fuelLedger: command.fuelLedger } : null;
  },
  summary(draft, _model, engine) {
    const chosen = optionsFor(draft, engine).chosen;
    if (chosen === null) return msg("firing.contrib.pick");
    const card = chosen.command.card;
    const wood = (t: Parameters<typeof woodText>[1]) => (chosen.woodCost === 0 ? t("firing.contrib.noWood") : t("firing.contrib.woodAtReveal", { wood: woodText(chosen.woodCost, t) }));
    const cardName = (t: Parameters<typeof woodText>[1]) => contributionCardName(card, t.locale);
    if (chosen.command.fuelLedger) {
      return msg("firing.contrib.summaryFuel", { card: cardName, tech: (t) => techName(B5_TECHS.fuelLedger, t.locale), heat: signed(chosen.heat), wood });
    }
    return msg("firing.contrib.summary", { card: cardName, heat: signed(chosen.heat), wood });
  },
};
