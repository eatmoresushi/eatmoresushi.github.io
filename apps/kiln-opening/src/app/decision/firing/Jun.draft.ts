/**
 * The draft model of Jun (UI_V1.6.1_ARCHITECTURE §3.4 `jun`, §3.5). Owner: B5.
 *
 * Step 8 (`firing_heat_adjustment`): pay Wood, +1 or −1 to one of your ceramics' Actual Heat.
 * R7's Jun after Second Firing is part of Second Firing's own choice (`SecondFiring.draft.ts`,
 * `SECOND_FIRING_CHOOSE`), since V1.6.2 reveals 2 cards and the owner chooses one.
 *
 * The ceramics come from `junOptions` (empty when Jun is used or unaffordable); each side is
 * probed through `validateAction`. Declining (`adjustment: null`, R4) is always possible and is
 * the window's alternative button.
 */
import { junOptions } from "../../../game/index.ts";
import type { CeramicId, GameRuleError, HeatMarkerValue } from "../../../game/index.ts";
import { kilnText } from "../../i18n/content.ts";
import { signed } from "../../i18n/format.ts";
import { msg } from "../../i18n/translator.ts";
import type { Translator } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView, GameModel } from "../../state/model.ts";
import { B5_KILNS, ceramicWords, ownFiringCeramicIds, probe, woodText } from "./firingSupport.ts";
import { HEAT_MARKER_SIDES } from "./HeatMarkers.draft.ts";

export interface JunDraft {
  readonly ceramicId: CeramicId | null;
  readonly delta: HeatMarkerValue | null;
  /** Decline Jun this time (keeps its once-per-round use). */
  readonly decline: boolean;
}

export type JunAction =
  | { readonly type: "ceramic"; readonly ceramicId: CeramicId }
  | { readonly type: "delta"; readonly delta: HeatMarkerValue }
  | { readonly type: "decline" };

export interface JunOptionsView {
  during: "first_firing" | "second_firing" | null;
  ready: boolean;
  woodCost: number;
  /** The ceramics Jun may adjust now. */
  ceramicIds: CeramicId[];
  /** Why no ceramic can be adjusted (Jun used, not enough Wood), when `ceramicIds` is empty. */
  unusable: GameRuleError | null;
  sides: readonly HeatMarkerValue[];
  /** Always: declining is always legal. */
  canDecline: true;
}

function optionsFor(model: GameModel, engine: EngineView): JunOptionsView {
  const options = junOptions(engine.view);
  if (options === null) return { during: null, ready: false, woodCost: 0, ceramicIds: [], unusable: null, sides: HEAT_MARKER_SIDES, canDecline: true };
  let unusable: GameRuleError | null = null;
  if (options.ceramicIds.length === 0) {
    const anyOwn = ownFiringCeramicIds(model)[0];
    unusable = anyOwn === undefined ? null : probe(engine, { type: "RESOLVE_JUN", adjustment: { ceramicId: anyOwn, delta: HEAT_MARKER_SIDES[0] } });
  }
  return { during: options.during, ready: options.ready, woodCost: options.woodCost, ceramicIds: options.ceramicIds, unusable, sides: HEAT_MARKER_SIDES, canDecline: true };
}

function settle(draft: JunDraft, model: GameModel, engine: EngineView): JunDraft {
  if (draft.decline) return draft.ceramicId === null && draft.delta === null ? draft : { ceramicId: null, delta: null, decline: true };
  const options = optionsFor(model, engine);
  const ceramicId = draft.ceramicId !== null && options.ceramicIds.includes(draft.ceramicId) ? draft.ceramicId : null;
  const delta = draft.delta !== null && options.ceramicIds.length > 0 && options.sides.includes(draft.delta) ? draft.delta : null;
  return ceramicId === draft.ceramicId && delta === draft.delta ? draft : { ceramicId, delta, decline: false };
}

const abilityName = (t: Translator) => kilnText(B5_KILNS.jun, t.locale).abilityName;

export const junDraft: DraftModel<JunDraft, JunAction, JunOptionsView> = {
  initial(model, engine) {
    const options = optionsFor(model, engine);
    // §3.5: preselect the only choice.
    return { ceramicId: options.ceramicIds.length === 1 ? options.ceramicIds[0]! : null, delta: null, decline: false };
  },
  reduce(draft, action, model, engine) {
    switch (action.type) {
      case "revalidate":
        return settle(draft, model, engine);
      case "ceramic":
        return settle({ ...draft, ceramicId: action.ceramicId, decline: false }, model, engine);
      case "delta":
        return settle({ ...draft, delta: action.delta, decline: false }, model, engine);
      case "decline":
        return { ceramicId: null, delta: null, decline: true };
    }
  },
  options(_draft, model, engine) {
    return optionsFor(model, engine);
  },
  build(draft, model, engine) {
    if (draft.decline) return { type: "RESOLVE_JUN", adjustment: null };
    const settled = settle(draft, model, engine);
    if (settled.ceramicId === null || settled.delta === null) return null;
    return { type: "RESOLVE_JUN", adjustment: { ceramicId: settled.ceramicId, delta: settled.delta } };
  },
  fromCommand(command) {
    if (command.type !== "RESOLVE_JUN") return null;
    return command.adjustment === null
      ? { ceramicId: null, delta: null, decline: true }
      : { ceramicId: command.adjustment.ceramicId, delta: command.adjustment.delta, decline: false };
  },
  summary(draft, model, engine) {
    if (draft.decline) return msg("firing.jun.sumDecline", { ability: abilityName });
    const options = optionsFor(model, engine);
    const { ceramicId, delta } = draft;
    if (ceramicId === null || delta === null) return msg("firing.jun.pick");
    return msg("firing.jun.sum", {
      wood: (t) => woodText(options.woodCost, t),
      value: signed(delta),
      ceramic: (t) => ceramicWords(model, engine, ceramicId, t, options.ceramicIds),
    });
  },
};
