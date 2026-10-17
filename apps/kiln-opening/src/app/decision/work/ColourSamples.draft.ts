/**
 * The draft models of the Colour Samples looks (UI_V1.6.1_ARCHITECTURE §3.4; T10, v1.6.2 L617).
 * Owner: B4.
 *
 * Two windows reserve 1 of the privately looked-at Main Orders (only this seat receives them,
 * B3); the rest go face down to the bottom of the Main Order deck (change 24, R19):
 * - `colour_samples`: when acquired (R4), the top 3 (`COLOUR_SAMPLES_CHOOSE`). After a Guild
 *   Hall Shifu's take the inspection then continues (the engine's `resume`);
 * - `colour_samples_swap`: the once-per-round swap's top 2, after its held Order was discarded
 *   (`COLOUR_SAMPLES_SWAP_CHOOSE`).
 * The Orders come from `lookedOrderOptions(view)` of the matching look kind.
 */
import { lookedOrderOptions } from "../../../game/index.ts";
import type { OrderId } from "../../../game/index.ts";
import { msg } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView } from "../../state/model.ts";
import { keepIfSame } from "./context.ts";

export type ColourSamplesLookKind = "colour_samples" | "colour_samples_swap";

export interface ColourSamplesDraft {
  readonly orderId: OrderId | null;
}

export type ColourSamplesAction = { readonly type: "order"; readonly orderId: OrderId };

export interface ColourSamplesOptions {
  kind: ColourSamplesLookKind;
  orderIds: readonly OrderId[];
  /**
   * Colour Samples was taken by a Guild Hall Shifu whose inspection waits behind this look: after
   * the reservation the inspection resumes (take another Tech or stop). Public: the step's
   * `resume` (the takes are public; the waiting Techs are not read here).
   */
  resume: boolean;
}

const COMMAND = {
  colour_samples: "COLOUR_SAMPLES_CHOOSE",
  colour_samples_swap: "COLOUR_SAMPLES_SWAP_CHOOSE",
} as const satisfies Record<ColourSamplesLookKind, string>;

/** The when-acquired look resumes a Guild Hall Shifu's inspection afterwards (engine step `resume`). */
function resumesInspection(engine: EngineView): boolean {
  const phase = engine.view.game.phase;
  return phase.type === "work_turn" && phase.step.kind === "colour_samples" && phase.step.resume !== null;
}

function lookChoiceDraft(kind: ColourSamplesLookKind): DraftModel<ColourSamplesDraft, ColourSamplesAction, ColourSamplesOptions> {
  const looked = (engine: EngineView): readonly OrderId[] => {
    const look = lookedOrderOptions(engine.view);
    return look !== null && look.kind === kind ? look.orderIds : [];
  };
  const revalidate = (draft: ColourSamplesDraft, engine: EngineView): ColourSamplesDraft =>
    keepIfSame(draft, { orderId: draft.orderId !== null && looked(engine).includes(draft.orderId) ? draft.orderId : null });
  return {
    initial(_model, engine) {
      const orderIds = looked(engine);
      return { orderId: orderIds.length === 1 ? (orderIds[0] ?? null) : null };
    },
    reduce: (draft, action, _model, engine) => (action.type === "revalidate" ? revalidate(draft, engine) : revalidate({ orderId: action.orderId }, engine)),
    options: (_draft, _model, engine) => ({ kind, orderIds: looked(engine), resume: kind === "colour_samples" && resumesInspection(engine) }),
    build(draft, _model, engine) {
      const settled = revalidate(draft, engine);
      return settled.orderId === null ? null : { type: COMMAND[kind], orderId: settled.orderId };
    },
    fromCommand: (command) => (command.type === COMMAND[kind] ? { orderId: command.orderId } : null),
    summary(draft, _model, engine) {
      const settled = revalidate(draft, engine);
      if (settled.orderId === null) return msg("work.cs.summaryChoose");
      // The cards not reserved go face down to the bottom of the Main Order deck (change 24, R19).
      if (looked(engine).length <= 1) return msg("work.cs.summaryOnly", { order: settled.orderId });
      return msg(kind === "colour_samples" ? "work.cs.summary" : "work.cs.summarySwap", { order: settled.orderId });
    },
  };
}

/** Colour Samples when acquired: reserve 1 of the top 3. */
export const colourSamplesDraft = lookChoiceDraft("colour_samples");

/** The Colour Samples swap's look: reserve 1 of the top 2. */
export const colourSamplesSwapLookDraft = lookChoiceDraft("colour_samples_swap");

/** The look draft of a window kind. */
export function colourSamplesLookDraft(kind: ColourSamplesLookKind): DraftModel<ColourSamplesDraft, ColourSamplesAction, ColourSamplesOptions> {
  return kind === "colour_samples" ? colourSamplesDraft : colourSamplesSwapLookDraft;
}
