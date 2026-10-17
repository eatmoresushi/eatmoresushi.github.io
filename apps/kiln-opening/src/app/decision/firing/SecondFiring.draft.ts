/**
 * The draft model of Second Firing's choice (UI_V1.6.1_ARCHITECTURE §3.4; T14, v1.6.2 L631, R7).
 * Owner: B5.
 *
 * Second Firing turned 2 extra Fire cards face up for one of the owner's ceramics. The owner
 * chooses the card the ceramic is fired with again and, when Jun is ready on it (R7: the Jun
 * Kiln, unused this round, 1 Wood), whether to adjust its Actual Heat by +1 or −1 before Quality.
 * One command carries both (`SECOND_FIRING_CHOOSE { cardIndex, jun }`); the new Quality replaces
 * the old one even if worse, and both cards go to the discard.
 *
 * The cards and Jun's readiness come from `secondFiringChoiceOptions(view)`. When the viewer owns
 * the Jun Kiln but Jun is not ready (used in step 8, or not enough Wood), the engine's reason
 * comes from probing the command with Jun (`validateAction`), so the form can show Jun greyed
 * out with that reason; a player without the Jun Kiln is never offered it. Nothing here predicts
 * a Quality (D3): the form shows the two cards, the ceramic and the rule.
 */
import { secondFiringChoiceOptions } from "../../../game/index.ts";
import type { CeramicId, FireModifier, GameRuleError, HeatMarkerValue } from "../../../game/index.ts";
import { kilnText } from "../../i18n/content.ts";
import { signed } from "../../i18n/format.ts";
import { msg } from "../../i18n/translator.ts";
import type { RichMessage, Translator } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView, GameModel } from "../../state/model.ts";
import { B5_KILNS, ceramicWords, ownFiringCeramicIds, probe, woodText } from "./firingSupport.ts";
import { HEAT_MARKER_SIDES } from "./HeatMarkers.draft.ts";

export interface SecondFiringDraft {
  /** The chosen card: 0 or 1 in reveal order; null until chosen. */
  readonly cardIndex: 0 | 1 | null;
  /** R7: Jun's adjustment on this ceramic, or null not to use it (it stays unused, R4). */
  readonly jun: HeatMarkerValue | null;
}

export type SecondFiringAction = { readonly type: "card"; readonly cardIndex: 0 | 1 } | { readonly type: "jun"; readonly delta: HeatMarkerValue | null };

export interface SecondFiringOptions {
  ceramicId: CeramicId | null;
  /** The 2 revealed cards in reveal order. */
  cards: ReadonlyArray<{ cardIndex: 0 | 1; modifier: FireModifier }>;
  /**
   * R7: Jun on this ceramic. `offered` when the viewer owns the Jun Kiln; `ready` when it may be
   * used now (then `sides` are the adjustments); otherwise `reason` is the engine's verdict on
   * using it (already used this round, not enough Wood).
   */
  jun: { offered: boolean; ready: boolean; woodCost: number; sides: readonly HeatMarkerValue[]; reason: GameRuleError | null };
}

const BLANK: SecondFiringDraft = Object.freeze({ cardIndex: null, jun: null });

const NO_JUN: SecondFiringOptions["jun"] = Object.freeze({ offered: false, ready: false, woodCost: 0, sides: [], reason: null });

function optionsOf(engine: EngineView): SecondFiringOptions {
  const options = secondFiringChoiceOptions(engine.view);
  if (options === null) return { ceramicId: null, cards: [], jun: NO_JUN };
  const cards = [
    { cardIndex: 0, modifier: options.modifiers[0] },
    { cardIndex: 1, modifier: options.modifiers[1] },
  ] as const;
  if (options.jun.ready) return { ceramicId: options.ceramicId, cards, jun: { offered: true, ready: true, woodCost: options.jun.woodCost, sides: HEAT_MARKER_SIDES, reason: null } };
  // Not ready: ask the engine why. Without the Jun Kiln it is not this player's ability at all.
  const reason = probe(engine, { type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: { delta: HEAT_MARKER_SIDES[0] } });
  const offered = reason !== null && reason.code !== "KILN_ABILITY_NOT_OWNED" && reason.code !== "UNKNOWN_PLAYER";
  return { ceramicId: options.ceramicId, cards, jun: { offered, ready: false, woodCost: options.jun.woodCost, sides: [], reason: offered ? reason : null } };
}

function settle(draft: SecondFiringDraft, engine: EngineView): SecondFiringDraft {
  const options = optionsOf(engine);
  const cardIndex = draft.cardIndex !== null && options.cards.some((card) => card.cardIndex === draft.cardIndex) ? draft.cardIndex : null;
  const jun = draft.jun !== null && options.jun.sides.includes(draft.jun) ? draft.jun : null;
  return cardIndex === draft.cardIndex && jun === draft.jun ? draft : { cardIndex, jun };
}

const junAbility = (t: Translator) => kilnText(B5_KILNS.jun, t.locale).abilityName;

export const secondFiringDraft: DraftModel<SecondFiringDraft, SecondFiringAction, SecondFiringOptions> = {
  initial() {
    // §3.5: two cards are always a choice, so nothing is pre-selected; Jun starts unused (R4).
    return BLANK;
  },
  reduce(draft, action, _model, engine) {
    switch (action.type) {
      case "revalidate":
        return settle(draft, engine);
      case "card":
        return settle({ ...draft, cardIndex: action.cardIndex }, engine);
      case "jun":
        return settle({ ...draft, jun: action.delta }, engine);
    }
  },
  options: (_draft, _model, engine) => optionsOf(engine),
  build(draft, _model, engine) {
    const settled = settle(draft, engine);
    if (settled.cardIndex === null || optionsOf(engine).ceramicId === null) return null;
    return { type: "SECOND_FIRING_CHOOSE", cardIndex: settled.cardIndex, jun: settled.jun === null ? null : { delta: settled.jun } };
  },
  fromCommand(command) {
    if (command.type !== "SECOND_FIRING_CHOOSE") return null;
    return { cardIndex: command.cardIndex, jun: command.jun === null ? null : command.jun.delta };
  },
  summary(draft, model: GameModel, engine): RichMessage {
    const options = optionsOf(engine);
    const card = options.cards.find((candidate) => candidate.cardIndex === draft.cardIndex);
    const ceramicId = options.ceramicId;
    if (card === undefined || ceramicId === null) return msg("firing.sf.pick");
    const ceramic = (t: Translator) => ceramicWords(model, engine, ceramicId, t, ownFiringCeramicIds(model));
    const value = signed(card.modifier);
    const jun = draft.jun;
    if (jun === null) return msg("firing.sf.sum", { ceramic, value });
    return msg("firing.sf.sumJun", { ceramic, value, ability: junAbility, delta: signed(jun), wood: (t) => woodText(options.jun.woodCost, t) });
  },
};
