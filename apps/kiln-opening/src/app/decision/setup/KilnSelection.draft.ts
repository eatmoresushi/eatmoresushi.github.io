/**
 * The draft model of the Setup choice (UI_V1.6.1_ARCHITECTURE §3.4 `kiln_selection`). Owner: B4.
 *
 * Setup step 9 (rev. 4 L122, change 32, owner ruling R23): in reverse turn order, each player in
 * one turn chooses a Kiln (all five are selectable, R1) and takes 1 face-up Main Order from the
 * display into their hand. One command carries both (`SELECT_KILN { kilnId, mainOrder }`); the
 * take is public and the display is refilled at once, before the next player chooses.
 *
 * The Kilns (with who took which) and the display positions holding a Main Order come from
 * `setupChoiceOptions(view)` (`kilnSelectionOptions` for a viewer who is not choosing); `KILN_IDS`
 * (which still lists every Kiln) never decides what is offered. The Main Order is chosen in the
 * pane or with the display's Choose toggles on the table (`slot:<i>`).
 */
import { kilnSelectionOptions, setupChoiceOptions } from "../../../game/index.ts";
import type { KilnId, KilnSelectionOption, OrderId, PlayerId } from "../../../game/index.ts";
import { kilnText } from "../../i18n/content.ts";
import { msg } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView } from "../../state/model.ts";
import { keepIfSame, viewMemo } from "../work/context.ts";

export interface KilnSelectionDraft {
  readonly kilnId: KilnId | null;
  /** The display position of the Main Order to take, or null. */
  readonly slotIndex: number | null;
}

export type KilnSelectionAction = { readonly type: "kiln"; readonly kilnId: KilnId } | { readonly type: "order"; readonly slotIndex: number };

/** One face-up Main Order the chooser may take with the Kiln. */
export interface SetupOrderChoice {
  slotIndex: number;
  orderId: OrderId;
}

export interface KilnSelectionOptions {
  kilns: readonly KilnSelectionOption[];
  /** The display's Main Orders the chooser may take now, by position (empty for a viewer not choosing). */
  orders: readonly SetupOrderChoice[];
  /** Reverse turn order (public), and whose pick is now. */
  selectionOrder: readonly PlayerId[];
  index: number;
}

const BLANK: KilnSelectionDraft = Object.freeze({ kilnId: null, slotIndex: null });

function optionsOf(engine: EngineView): KilnSelectionOptions {
  return viewMemo(engine.view, "kilnSelection:options", () => {
    const phase = engine.view.game.phase;
    const choice = setupChoiceOptions(engine.view);
    const display = engine.view.game.market.display;
    const orders = (choice?.faceUpSlots ?? []).flatMap((slotIndex): SetupOrderChoice[] => {
      const orderId = display[slotIndex];
      return orderId === null || orderId === undefined ? [] : [{ slotIndex, orderId }];
    });
    return {
      kilns: choice?.kilns ?? kilnSelectionOptions(engine.view),
      orders,
      selectionOrder: phase.type === "setup_kiln_selection" ? phase.selectionOrder : [],
      index: phase.type === "setup_kiln_selection" ? phase.index : 0,
    };
  });
}

function revalidate(draft: KilnSelectionDraft, engine: EngineView): KilnSelectionDraft {
  const options = optionsOf(engine);
  const kilnOffered = options.kilns.some((kiln) => kiln.kilnId === draft.kilnId && kiln.available);
  const slotOffered = options.orders.some((order) => order.slotIndex === draft.slotIndex);
  return keepIfSame(draft, { kilnId: kilnOffered ? draft.kilnId : null, slotIndex: slotOffered ? draft.slotIndex : null });
}

/** The Main Order at a chosen display position, or null. */
function orderAt(engine: EngineView, slotIndex: number | null): SetupOrderChoice | null {
  return slotIndex === null ? null : optionsOf(engine).orders.find((order) => order.slotIndex === slotIndex) ?? null;
}

export const kilnSelectionDraft: DraftModel<KilnSelectionDraft, KilnSelectionAction, KilnSelectionOptions> = {
  initial(_model, engine) {
    const options = optionsOf(engine);
    const available = options.kilns.filter((kiln) => kiln.available);
    return {
      kilnId: available.length === 1 ? (available[0]?.kilnId ?? null) : null,
      slotIndex: options.orders.length === 1 ? (options.orders[0]?.slotIndex ?? null) : null,
    };
  },
  reduce(draft, action, _model, engine) {
    switch (action.type) {
      case "revalidate":
        return revalidate(draft, engine);
      case "kiln":
        return revalidate({ ...draft, kilnId: action.kilnId }, engine);
      case "order":
        return revalidate({ ...draft, slotIndex: action.slotIndex }, engine);
    }
  },
  options: (_draft, _model, engine) => optionsOf(engine),
  build(draft, _model, engine) {
    const order = orderAt(engine, draft.slotIndex);
    if (draft.kilnId === null || order === null) return null;
    return { type: "SELECT_KILN", kilnId: draft.kilnId, mainOrder: { slotIndex: order.slotIndex, orderId: order.orderId } };
  },
  fromCommand: (command) => (command.type === "SELECT_KILN" ? { kilnId: command.kilnId, slotIndex: command.mainOrder.slotIndex } : null),
  summary(draft, _model, engine) {
    const kilnId = draft.kilnId;
    const order = orderAt(engine, draft.slotIndex);
    if (kilnId === null && order === null) return msg("work.ks.summaryChoose");
    if (kilnId === null) return msg("work.ks.summaryChooseKiln");
    if (order === null) return msg("work.ks.summaryChooseOrder", { kiln: (t) => kilnText(kilnId, t.locale).name });
    return msg("work.ks.summary", { kiln: (t) => kilnText(kilnId, t.locale).name, order: order.orderId });
  },
};
