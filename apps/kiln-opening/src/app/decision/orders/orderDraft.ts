/**
 * The draft model of the Order Phase turn (UI_V1.6.1_ARCHITECTURE §3.4 `orders`, §3.5; wireframe
 * `decOrders`). Owner: B5.
 *
 * The Order Phase is the post-firing free-action window (owner revision 5, rev. 5 L143, L318;
 * owner ruling R28): a single pass in First Player order in which each player may take any number
 * of free actions, one per Confirm, then end the turn (`END_ORDER_TURN`, the window's
 * alternative):
 * - complete a held Order (`COMPLETE_ORDER`; the lists are re-read after each, so an Order that
 *   shared ceramics with the one just completed drops out), through the shared model of
 *   `orderCompletion.ts`;
 * - sell a Flawed ceramic (`SELL_FLAWED`, from `sellFlawedOptions`);
 * - spend Imperial Priority (`USE_IMPERIAL_PRIORITY`, from `imperialPriorityOptions` through the
 *   work turn's `imperialPriorityDraft`): its ceramic waits in the Imperial Kiln for the next
 *   round's firing, and in the last round is never fired (R28).
 * Choosing one clears the others. The turn opens only while one of them is possible, and passes
 * on by itself once nothing is left (the engine decides both, R28). The Colour Samples swap is not
 * a free action and is never offered here.
 *
 * Owner UI decision D21: the pane is the same free-action list as the work turn's chips
 * (`freeActionItems`), so choosing one is one action (`freeAction`). Nothing is chosen at first, even
 * with one entry: each spends something for good, so it takes the player's own press. Done is the only
 * button until then, and it too takes its own press, since it gives up the window (`DecisionPane`).
 * Each Confirm offers Deliver · done (the command ends the turn too) beside Deliver, and Done is the
 * alternative (`END_ORDER_TURN`).
 */
import { completableOrders, imperialPriorityOptions } from "../../../game/index.ts";
import type { CeramicId, Decoration, SellFlawedOptions } from "../../../game/index.ts";
import type { RichMessage, Translator } from "../../i18n/translator.ts";
import { msg } from "../../i18n/translator.ts";
import { list } from "../../i18n/format.ts";
import { RULE_NUMBERS, decorationName } from "../../i18n/content.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import { REVALIDATE } from "../../state/draftStore.ts";
import type { EngineView, GameModel } from "../../state/model.ts";
import { ceramicWords } from "../firing/firingSupport.ts";
import { deliverKey, freeActionItems } from "../freeActions.ts";
import type { FreeActionItem, FreeActionKey } from "../freeActions.ts";
import { saleOf, saleOffered, saleOptions, saleSummary } from "../sale/sellFlawed.ts";
import { viewMemo } from "../work/context.ts";
import { imperialPriorityDraft } from "../work/ImperialPriority.draft.ts";
import type { ImperialPriorityAction, ImperialPriorityDraft, ImperialPriorityOptions } from "../work/ImperialPriority.draft.ts";
import {
  EMPTY_COMPLETION,
  buildCompletion,
  completionFromCommand,
  completionOptions,
  countedDecorations,
  reduceCompletion,
  settleCompletion,
} from "./orderCompletion.ts";
import type { CompletableSource, CompletionAction, CompletionDraft, CompletionOptions } from "./orderCompletion.ts";

export interface OrderDraft extends CompletionDraft {
  /** End the Order turn (`END_ORDER_TURN`). */
  readonly end: boolean;
  /** A Flawed ceramic to sell instead (`SELL_FLAWED`), or null. */
  readonly sell: CeramicId | null;
  /** The list's Sell entry is chosen (with more than one Flawed ceramic: none picked yet). */
  readonly selling?: boolean;
  /** Imperial Priority instead (`USE_IMPERIAL_PRIORITY`, R28), or null while not chosen. */
  readonly imperialPriority?: ImperialPriorityDraft | null;
}

export type OrderAction =
  | CompletionAction
  | { readonly type: "end" }
  /** One entry of the free-action list: the pane's choice, the token's Use button (D21). */
  | { readonly type: "freeAction"; readonly key: FreeActionKey }
  | { readonly type: "sell"; readonly ceramicId: CeramicId }
  | { readonly type: "imperialPriority"; readonly action: ImperialPriorityAction };

/** When a ceramic loaded by Imperial Priority now is fired (R28), as the form says it. */
export type ImperialPriorityTiming = "next_round" | "never";

/** The completion's lists, and the other free actions of this turn. */
export interface OrderTurnOptions extends CompletionOptions {
  /** The Flawed ceramics the viewer may sell in this turn, or null. */
  sale: SellFlawedOptions | null;
  /** Imperial Priority's choices while it is usable in this turn (R28), else null. */
  imperialPriority: ImperialPriorityOptions | null;
  /** When its ceramic would be fired: the next round's firing, or never in the last round. */
  imperialTiming: ImperialPriorityTiming;
  /** What the viewer can do right now (D21). */
  freeActions: readonly FreeActionItem[];
  /** The list's entry the draft has chosen, or null. */
  freeAction: FreeActionKey | null;
}

/** The held Orders the viewer's Finished ceramics complete now (`completableOrders`). */
export const COMPLETABLE: CompletableSource = (engine) => viewMemo(engine.view, "completableOrders", () => completableOrders(engine.view));

const INITIAL: OrderDraft = Object.freeze({ ...EMPTY_COMPLETION, end: false, sell: null, selling: false, imperialPriority: null });

const BLANK_IMPERIAL: ImperialPriorityDraft = Object.freeze({ ceramicId: null, glaze: null, modifier: null, rework: null, kilnMaster: null });

function imperialUsable(engine: EngineView): boolean {
  return viewMemo(engine.view, "imperialPriorityOptions", () => imperialPriorityOptions(engine.view)).usable;
}

function withEnd(completion: CompletionDraft, end: boolean, previous: OrderDraft): OrderDraft {
  if (completion === previous && end === previous.end && previous.sell === null && previous.selling !== true && (previous.imperialPriority ?? null) === null) return previous;
  return { ...completion, end, sell: null, selling: false, imperialPriority: null };
}

/** The draft with this list entry chosen: its form open, its only choice made (§3.5). */
function chooseFreeAction(item: FreeActionItem, model: GameModel, engine: EngineView): OrderDraft {
  switch (item.kind) {
    case "deliver":
      return { ...INITIAL, ...reduceCompletion(EMPTY_COMPLETION, { type: "order", orderId: item.orderId }, engine, COMPLETABLE) };
    case "sell": {
      const ids = saleOptions(engine)?.ceramicIds ?? [];
      return { ...INITIAL, selling: true, sell: ids.length === 1 ? (ids[0] ?? null) : null };
    }
    case "imperial_priority":
      return { ...INITIAL, imperialPriority: imperialPriorityDraft.initial(model, engine) };
    case "swap":
      return INITIAL;
  }
}

/** The list's entry the draft has chosen, or null. */
export function chosenOrderFreeAction(draft: OrderDraft): FreeActionKey | null {
  if ((draft.imperialPriority ?? null) !== null) return "imperial_priority";
  if ((draft.sell ?? null) !== null || draft.selling === true) return "sell_flawed";
  return draft.orderId === null ? null : deliverKey(draft.orderId);
}

/**
 * "Celadon Vase, Plain · Fine · Crackle (as Carved), …": the group in words, with the Decoration
 * each Crackle ceramic counts as when it is not its own (`countedDecorations`).
 */
export function groupWords(model: GameModel, engine: EngineView, ceramicIds: readonly CeramicId[], counted: ReadonlyMap<CeramicId, Decoration>, t: Translator): string {
  const mine = model.me?.finishedCeramicIds ?? [];
  return list(
    ceramicIds.map((ceramicId) => {
      const words = ceramicWords(model, engine, ceramicId, t, mine);
      const as = counted.get(ceramicId);
      return as === undefined ? words : t("orders.ceramicAs", { ceramic: words, decoration: decorationName(as, t.locale) });
    }),
    t.locale,
  );
}

/**
 * The ConfirmBar sentence of a completion draft (any free-action window): "Complete O22 with
 * Celadon Bowl, Plain · Fine", or what is still to choose.
 */
export function completionSummary(draft: CompletionDraft, model: GameModel, engine: EngineView, completable: CompletableSource): RichMessage {
  const { orderId, ceramicIds } = draft;
  if (orderId === null) return msg("orders.turn.pickOrder");
  if (ceramicIds === null) return msg("orders.turn.pickGroup");
  const counted = countedDecorations(draft, completionOptions(draft, engine, completable), engine);
  return msg("orders.turn.sum", { order: orderId, ceramics: (t) => groupWords(model, engine, ceramicIds, counted, t) });
}

/** The round after which no ceramic is fired (the last round, R28). */
function imperialTimingOf(model: GameModel): ImperialPriorityTiming {
  return model.round >= RULE_NUMBERS.rounds ? "never" : "next_round";
}

export const orderDraft: DraftModel<OrderDraft, OrderAction, OrderTurnOptions> = {
  initial: () => INITIAL,
  reduce(draft, action, model, engine) {
    if (action.type === "end") return { ...EMPTY_COMPLETION, end: true, sell: null, selling: false, imperialPriority: null };
    if (action.type === "freeAction") {
      const item = freeActionItems(engine).find((candidate) => candidate.key === action.key);
      return item === undefined ? draft : chooseFreeAction(item, model, engine);
    }
    if (action.type === "sell") return saleOffered(engine, action.ceramicId) ? { ...INITIAL, selling: true, sell: action.ceramicId } : draft;
    if (action.type === "imperialPriority") {
      if (!imperialUsable(engine)) return draft;
      const sub = imperialPriorityDraft.reduce(draft.imperialPriority ?? BLANK_IMPERIAL, action.action, model, engine);
      return { ...INITIAL, imperialPriority: sub };
    }
    if (action.type === "revalidate") {
      if (draft.end) return draft;
      const imperial = draft.imperialPriority ?? null;
      if (imperial !== null) {
        if (!imperialUsable(engine)) return INITIAL;
        const sub = imperialPriorityDraft.reduce(imperial, REVALIDATE, model, engine);
        return sub === imperial ? draft : { ...draft, imperialPriority: sub };
      }
      // A draft seeded without `sell` (tests, the gallery) is a completion draft.
      const sell = draft.sell ?? null;
      if (sell !== null) return saleOffered(engine, sell) ? draft : INITIAL;
      if (draft.selling === true) return saleOptions(engine) === null ? INITIAL : draft;
      const settled = withEnd(settleCompletion(draft, engine, COMPLETABLE), false, draft);
      return settled.sell === undefined ? { ...settled, sell: null } : settled;
    }
    return withEnd(reduceCompletion(draft, action, engine, COMPLETABLE), false, draft);
  },
  options(draft, model, engine) {
    const imperial = draft.imperialPriority ?? BLANK_IMPERIAL;
    return {
      ...completionOptions(draft, engine, COMPLETABLE),
      sale: saleOptions(engine),
      imperialPriority: imperialUsable(engine) ? imperialPriorityDraft.options(imperial, model, engine) : null,
      imperialTiming: imperialTimingOf(model),
      freeActions: freeActionItems(engine),
      freeAction: chosenOrderFreeAction(draft),
    };
  },
  build(draft, model, engine) {
    if (draft.end) return { type: "END_ORDER_TURN" };
    const imperial = draft.imperialPriority ?? null;
    if (imperial !== null) return imperialUsable(engine) ? imperialPriorityDraft.build(imperial, model, engine) : null;
    const sell = draft.sell ?? null;
    if (sell !== null) return saleOffered(engine, sell) ? { type: "SELL_FLAWED", ceramicId: sell } : null;
    return buildCompletion("COMPLETE_ORDER", draft, engine, COMPLETABLE);
  },
  fromCommand(command, model, engine) {
    if (command.type === "END_ORDER_TURN") return { ...EMPTY_COMPLETION, end: true, sell: null, selling: false, imperialPriority: null };
    if (command.type === "USE_IMPERIAL_PRIORITY") {
      const sub = imperialPriorityDraft.fromCommand(command, model, engine);
      return sub === null ? null : { ...INITIAL, imperialPriority: sub };
    }
    const sale = saleOf(command);
    if (sale !== null) return { ...INITIAL, selling: true, sell: sale };
    const completion = completionFromCommand("COMPLETE_ORDER", command);
    return completion === null ? null : { ...INITIAL, ...completion };
  },
  summary(draft, model, engine) {
    if (draft.end) return msg("orders.turn.sumEnd");
    const imperial = draft.imperialPriority ?? null;
    if (imperial !== null) return imperialPriorityDraft.summary(imperial, model, engine);
    const sell = draft.sell ?? null;
    if (sell !== null) return saleSummary(model, engine, sell);
    if (draft.selling === true) return msg("common.sale.pick");
    if (draft.orderId === null) return msg("orders.turn.pick");
    return completionSummary(draft, model, engine, COMPLETABLE);
  },
};
