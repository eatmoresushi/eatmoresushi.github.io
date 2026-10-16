/**
 * The draft model of Colour Samples (UI_V1.6.1_ARCHITECTURE §3.4 `colour_samples`; wireframe
 * `decLook`). Owner: B4.
 *
 * When acquired (L626, R4): look privately at the top of the Main Order deck and reserve one;
 * the rest go face down to the discard. The Orders come from `lookedOrderOptions(view)` (kind
 * `colour_samples`), which only this seat receives.
 */
import { lookedOrderOptions } from "../../../game/index.ts";
import type { OrderId } from "../../../game/index.ts";
import { msg } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView } from "../../state/model.ts";
import { keepIfSame } from "./context.ts";

export interface ColourSamplesDraft {
  readonly orderId: OrderId | null;
}

export type ColourSamplesAction = { readonly type: "order"; readonly orderId: OrderId };

export interface ColourSamplesOptions {
  orderIds: readonly OrderId[];
}

function looked(engine: EngineView): readonly OrderId[] {
  const look = lookedOrderOptions(engine.view);
  return look !== null && look.kind === "colour_samples" ? look.orderIds : [];
}

function revalidate(draft: ColourSamplesDraft, engine: EngineView): ColourSamplesDraft {
  return keepIfSame(draft, { orderId: draft.orderId !== null && looked(engine).includes(draft.orderId) ? draft.orderId : null });
}

export const colourSamplesDraft: DraftModel<ColourSamplesDraft, ColourSamplesAction, ColourSamplesOptions> = {
  initial(_model, engine) {
    const orderIds = looked(engine);
    return { orderId: orderIds.length === 1 ? (orderIds[0] ?? null) : null };
  },
  reduce: (draft, action, _model, engine) => (action.type === "revalidate" ? revalidate(draft, engine) : revalidate({ orderId: action.orderId }, engine)),
  options: (_draft, _model, engine) => ({ orderIds: looked(engine) }),
  build: (draft) => (draft.orderId === null ? null : { type: "COLOUR_SAMPLES_CHOOSE", orderId: draft.orderId }),
  fromCommand: (command) => (command.type === "COLOUR_SAMPLES_CHOOSE" ? { orderId: command.orderId } : null),
  summary(draft) {
    if (draft.orderId === null) return msg("work.cs.summaryChoose");
    return msg("work.cs.summary", { order: draft.orderId });
  },
};
