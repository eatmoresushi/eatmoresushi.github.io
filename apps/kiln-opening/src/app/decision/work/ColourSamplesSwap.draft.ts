/**
 * The draft model of the Colour Samples swap (T10, v1.6.2 L632, R17; UI_V1.6.1_ARCHITECTURE §3.4).
 * Owner: B4.
 *
 * Once per round, before or after one of your worker actions: discard 1 held Order (a Main Order
 * face down to the discard, a Starting Order to the box) to Select 3: look privately at the top 3
 * Main Orders and reserve 1 of them or 1 face-up Main Order (`USE_COLOUR_SAMPLES_SWAP`, then the
 * `colour_samples_swap` window, change 25). This draft is the first half: which held Order to give
 * up. Whether the swap may be used now, and whether each discard is legal (a looked card or a
 * face-up Order to reserve, B1), come from `colourSamplesSwapOptions(view)`; an illegal discard
 * carries the engine's own reason (`validateAction`), never a rule of the UI's.
 *
 * Composed by the work draft (`workDraft.ts`) as its `swap` sub-draft, like Imperial Priority; it
 * is a full `DraftModel`, so it can be tested on its own.
 */
import { colourSamplesSwapOptions, validateAction } from "../../../game/index.ts";
import type { ColourSamplesSwapOptions as SelectorOptions, GameRuleError, OrderId } from "../../../game/index.ts";
import { RULE_NUMBERS, techName } from "../../i18n/content.ts";
import { msg } from "../../i18n/translator.ts";
import type { RichMessage } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView } from "../../state/model.ts";
import { keepIfSame, viewMemo } from "./context.ts";

/** Colour Samples (display only: its name and rules details). */
export const COLOUR_SAMPLES = "T10" as const;

export interface ColourSamplesSwapDraft {
  /** The held Order to discard; null until chosen. */
  readonly discardOrderId: OrderId | null;
}

export type ColourSamplesSwapAction = { readonly type: "discard"; readonly orderId: OrderId };

export interface SwapDiscardChoice {
  orderId: OrderId;
  /** How many cards the look would show after this discard (public deck facts, B1). */
  lookCount: number;
  /**
   * The look would show some cards, but fewer than the swap's N: the Main Order deck runs short
   * (B1, R16). Shown on the option; a full look needs no words beyond the form's note.
   */
  short: boolean;
  /**
   * The look would show no card at all, but the discard is legal: the Select can still reserve a
   * face-up Order (v1.6.2 L80, B1). Shown on the option.
   */
  none: boolean;
  legal: boolean;
  /** The engine's reason when this discard is not legal. */
  reason: GameRuleError | null;
}

export interface ColourSamplesSwapOptions {
  usable: boolean;
  techId: typeof COLOUR_SAMPLES;
  /** Every held Order, in hand order. */
  discards: readonly SwapDiscardChoice[];
}

const BLANK: ColourSamplesSwapDraft = Object.freeze({ discardOrderId: null });

function selectorOptions(engine: EngineView): SelectorOptions {
  return viewMemo(engine.view, "colourSamplesSwapOptions", () => colourSamplesSwapOptions(engine.view));
}

function optionsOf(engine: EngineView): ColourSamplesSwapOptions {
  const selector = selectorOptions(engine);
  const actor = engine.actor;
  return {
    usable: selector.usable,
    techId: COLOUR_SAMPLES,
    discards: selector.discards.map((discard) => ({
      orderId: discard.orderId,
      lookCount: discard.lookCount,
      short: discard.lookCount > 0 && discard.lookCount < RULE_NUMBERS.swapSelect,
      none: discard.lookCount === 0 && discard.legal,
      legal: discard.legal,
      reason:
        discard.legal || actor === null
          ? null
          : viewMemo(engine.view, `swapReason:${discard.orderId}`, () => validateAction(actor, { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: discard.orderId })),
    })),
  };
}

/** True when the swap may be used now (the work draft offers it as a mode). */
export function swapUsable(engine: EngineView): boolean {
  return selectorOptions(engine).usable;
}

function revalidate(draft: ColourSamplesSwapDraft, engine: EngineView): ColourSamplesSwapDraft {
  const options = optionsOf(engine);
  const keep = draft.discardOrderId !== null && options.discards.some((discard) => discard.orderId === draft.discardOrderId && discard.legal);
  return keepIfSame(draft, { discardOrderId: keep ? draft.discardOrderId : null });
}

export const colourSamplesSwapDraft: DraftModel<ColourSamplesSwapDraft, ColourSamplesSwapAction, ColourSamplesSwapOptions> = {
  initial(_model, engine) {
    const legal = optionsOf(engine).discards.filter((discard) => discard.legal);
    return legal.length === 1 ? { discardOrderId: legal[0]?.orderId ?? null } : BLANK;
  },
  reduce(draft, action, _model, engine) {
    if (action.type === "revalidate") return revalidate(draft, engine);
    const choice = optionsOf(engine).discards.find((discard) => discard.orderId === action.orderId);
    // A discard the options do not offer is ignored; the current choice stays.
    return choice === undefined || !choice.legal ? draft : revalidate({ discardOrderId: action.orderId }, engine);
  },
  options: (_draft, _model, engine) => optionsOf(engine),
  build(draft, _model, engine) {
    const settled = revalidate(draft, engine);
    return settled.discardOrderId === null ? null : { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: settled.discardOrderId };
  },
  fromCommand: (command) => (command.type === "USE_COLOUR_SAMPLES_SWAP" ? { discardOrderId: command.discardOrderId } : null),
  summary(draft): RichMessage {
    const orderId = draft.discardOrderId;
    if (orderId === null) return msg("work.swap.summaryChoose");
    return msg("work.swap.summary", { tech: (t) => techName(COLOUR_SAMPLES, t.locale), order: orderId, n: RULE_NUMBERS.swapSelect });
  },
};
