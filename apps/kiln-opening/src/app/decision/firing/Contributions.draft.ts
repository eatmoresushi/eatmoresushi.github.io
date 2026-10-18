/**
 * The draft model of Contributions (UI_V1.6.1_ARCHITECTURE §3.5, §3.7; wireframe `decContrib`).
 * Owner: B5.
 *
 * Firing step 1, secret and simultaneous: the viewer plays exactly 1 of their own Contribution
 * cards (v1.6.2 L246, L266, L668, change 26). Every card the viewer holds, its Heat, its Wood and
 * whether it is affordable come from `contributionOptions`: Bank, Tend and Stoke, and, for the
 * owner of Fuel Ledger, Fuel Ledger Bank (1 Wood, −2) and Fuel Ledger Stoke (1 Wood, +2), the
 * two cards that come with the tile (v1.6.2 L634). The draft only remembers the card, and `build`
 * returns the selector's own command, so the window ID is always the open window's.
 *
 * - A card that costs less than its printed Wood (Fuel Ledger's free Bank and Stoke, v1.6.2
 *   L634) is marked, with the owned Tech whose printed text makes it free (content's
 *   `techsFreeingContributionCard`), so the form can say why it costs no Wood. The costs
 *   themselves are the selector's.
 * - A card that comes with a Tech (Fuel Ledger's two) carries that Tech, from content.
 * - An unaffordable choice is shown with its reason and never selected.
 */
import type { ContributionCardId, ContributionOption, TechId } from "../../../game/index.ts";
import { contributionCard, contributionOptions } from "../../../game/index.ts";
import { contributionCardName, techsFreeingContributionCard } from "../../i18n/content.ts";
import { signed } from "../../i18n/format.ts";
import { msg } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView, GameModel } from "../../state/model.ts";
import { woodText } from "./firingSupport.ts";

export interface ContributionsDraft {
  readonly card: ContributionCardId | null;
}

export type ContributionsAction = { readonly type: "card"; readonly card: ContributionCardId };

/** One of the viewer's own Contribution cards, as the form shows it. */
export interface ContributionCardChoice {
  card: ContributionCardId;
  option: ContributionOption;
  /** The card costs less Wood than its printed cost (Fuel Ledger's free Bank and Stoke, v1.6.2 L634). */
  belowPrintedCost: boolean;
  /** The owned Tech that makes it cost less (Fuel Ledger for Bank and Stoke); null when it costs its printed Wood. */
  freeBy: TechId | null;
  /** The Tech the card came with (Fuel Ledger Bank and Fuel Ledger Stoke: Fuel Ledger); null for Bank, Tend and Stoke. */
  techId: TechId | null;
  /** Unavailable: not enough Wood. */
  available: boolean;
  /** Why it is unavailable. */
  reason: "cant_afford" | null;
}

export interface ContributionsOptions {
  /** The viewer's own cards, in the selector's order (Tend, Bank, Stoke, then Fuel Ledger's 2). */
  cards: ContributionCardChoice[];
  /** The option the draft would submit, or null. */
  chosen: ContributionOption | null;
}

function optionsFor(draft: ContributionsDraft, engine: EngineView): ContributionsOptions {
  const viewerId = engine.view.viewerId;
  const owned = new Set((viewerId === null ? undefined : engine.view.game.players[viewerId])?.techs.map((tech) => tech.id) ?? []);
  const cards = contributionOptions(engine.view).map((option): ContributionCardChoice => {
    const card = option.command.card;
    const printed = contributionCard(card);
    const belowPrintedCost = option.woodCost < printed.woodCost;
    return {
      card,
      option,
      belowPrintedCost,
      freeBy: belowPrintedCost ? (techsFreeingContributionCard(card).find((techId) => owned.has(techId)) ?? null) : null,
      techId: printed.techId,
      available: option.affordable,
      reason: option.affordable ? null : "cant_afford",
    };
  });
  const chosen = draft.card === null ? null : cards.find((choice) => choice.card === draft.card && choice.available)?.option ?? null;
  return { cards, chosen };
}

function revalidate(draft: ContributionsDraft, engine: EngineView): ContributionsDraft {
  const card = draft.card !== null && optionsFor(draft, engine).cards.some((choice) => choice.card === draft.card && choice.available) ? draft.card : null;
  return card === draft.card ? draft : { card };
}

export const contributionsDraft: DraftModel<ContributionsDraft, ContributionsAction, ContributionsOptions> = {
  initial(_model: GameModel, engine: EngineView) {
    const available = optionsFor({ card: null }, engine).cards.filter((choice) => choice.available);
    // Only one card a player could submit: it is the choice (§3.5).
    return { card: available.length === 1 ? available[0]!.card : null };
  },
  reduce(draft, action, _model, engine) {
    switch (action.type) {
      case "revalidate":
        return revalidate(draft, engine);
      case "card": {
        const choice = optionsFor(draft, engine).cards.find((candidate) => candidate.card === action.card);
        return choice === undefined || !choice.available ? draft : { card: action.card };
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
    return command.type === "SUBMIT_CONTRIBUTION" ? { card: command.card } : null;
  },
  summary(draft, _model, engine) {
    const chosen = optionsFor(draft, engine).chosen;
    if (chosen === null) return msg("firing.contrib.pick");
    const card = chosen.command.card;
    const wood = (t: Parameters<typeof woodText>[1]) => (chosen.woodCost === 0 ? t("firing.contrib.noWood") : t("firing.contrib.woodAtReveal", { wood: woodText(chosen.woodCost, t) }));
    const cardName = (t: Parameters<typeof woodText>[1]) => contributionCardName(card, t.locale);
    return msg("firing.contrib.summary", { card: cardName, heat: signed(chosen.heat), wood });
  },
};
