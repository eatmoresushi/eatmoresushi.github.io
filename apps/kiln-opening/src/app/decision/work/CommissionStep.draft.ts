/**
 * The draft model of the Commission Market reservation step (UI_V1.6.1_ARCHITECTURE §3.4
 * `commission`; v1.6.2 L189–200, B1, B3). Owner: B4.
 *
 * The placement opened a private look (top 2 for the Apprentice effect, top 3 for the Shifu
 * effect, possibly fewer, B1). Now the player reserves, in one command (`COMMISSION_CHOOSE`):
 * - Apprentice effect: exactly 1 Order, from the display or the looked cards;
 * - Shifu effect (Senior Apprentice included, R12): 1 or 2, from the display and the looked
 *   cards in any mix. Both choose from the Orders showing now (a reserved position stays empty
 *   until the turn ends).
 * The looked cards not reserved go face down to the bottom of the Main deck (change 24). There is
 * no resource.
 *
 * Every list comes from `lookedOrderOptions(view)` (the viewer's own look: its cards, the
 * display positions reservable now and the limit); the draft only holds which of them are
 * chosen. Its keys are `slot:<i>` for a display position and `look:<OrderId>` for a looked
 * card. `build` lists the picks in the engine's canonical order (display positions ascending,
 * then looked cards in look order), so the same choice always builds the same command.
 */
import { lookedOrderOptions } from "../../../game/index.ts";
import type { CommissionPick, LookedOrderOptions, OrderId, WorkerEffect } from "../../../game/index.ts";
import { list } from "../../i18n/format.ts";
import { msg } from "../../i18n/translator.ts";
import type { RichMessage, Translator } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView, GameModel } from "../../state/model.ts";
import { keepIfSame, viewMemo } from "./context.ts";

/** `slot:<i>` (a display position) or `look:<OrderId>` (a looked card). */
export type CommissionPickKey = `slot:${number}` | `look:${string}`;

export interface CommissionDraft {
  /** The chosen reservations, in the order they were chosen. */
  readonly picks: readonly CommissionPickKey[];
}

export type CommissionAction =
  /** Radio (a limit of 1): this pick replaces any other. */
  | { readonly type: "pick"; readonly key: CommissionPickKey }
  /** Checkbox (a limit of 2): add or remove one pick. */
  | { readonly type: "toggle"; readonly key: CommissionPickKey; readonly on: boolean };

export interface CommissionChoice {
  key: CommissionPickKey;
  orderId: OrderId;
  /** The display position, for a face-up Order; null for a looked card. */
  slotIndex: number | null;
}

export interface CommissionStepOptions {
  effect: WorkerEffect;
  /** 2 or 3 (v1.6.2 L195–196). */
  lookSize: number;
  /** 1, or 2 for the Shifu effect. */
  maxReservations: number;
  /** The privately looked-at Orders, in look order (only this seat receives them, B3). */
  looked: readonly CommissionChoice[];
  /** The display positions reservable now, ascending. */
  slots: readonly CommissionChoice[];
  /**
   * The look showed some cards, but fewer than `lookSize`: the Main Order deck ran short (B1, R16:
   * a look never completes itself from a reshuffle). A public fact (the step's `lookedCount`).
   */
  short: boolean;
  /** The limit is reached: no other pick can be added. */
  full: boolean;
}

const BLANK: CommissionDraft = Object.freeze({ picks: Object.freeze([]) as readonly CommissionPickKey[] });

export function slotPickKey(slotIndex: number): CommissionPickKey {
  return `slot:${slotIndex}`;
}

export function lookPickKey(orderId: OrderId): CommissionPickKey {
  return `look:${orderId}`;
}

function windowOf(model: GameModel): { effect: WorkerEffect; lookSize: number; maxReservations: number } {
  const window = model.window;
  return window.kind === "commission"
    ? { effect: window.effect, lookSize: window.lookSize, maxReservations: window.maxReservations }
    : { effect: "apprentice", lookSize: 0, maxReservations: 1 };
}

function lookOf(engine: EngineView): LookedOrderOptions | null {
  return viewMemo(engine.view, "lookedOrderOptions", () => lookedOrderOptions(engine.view));
}

function choicesOf(model: GameModel, engine: EngineView): { looked: CommissionChoice[]; slots: CommissionChoice[]; max: number } {
  const look = lookOf(engine);
  if (model.window.kind !== "commission" || look === null || look.kind !== "commission_market") return { looked: [], slots: [], max: 1 };
  const display = engine.view.game.market.display;
  const slots = [...look.faceUpSlots]
    .sort((a, b) => a - b)
    .flatMap((slotIndex): CommissionChoice[] => {
      const orderId = display[slotIndex];
      return orderId === null || orderId === undefined ? [] : [{ key: slotPickKey(slotIndex), orderId, slotIndex }];
    });
  const looked = look.orderIds.map((orderId): CommissionChoice => ({ key: lookPickKey(orderId), orderId, slotIndex: null }));
  return { looked, slots, max: look.maxReservations };
}

function optionsOf(draft: CommissionDraft, model: GameModel, engine: EngineView): CommissionStepOptions {
  const { effect, lookSize } = windowOf(model);
  const { looked, slots, max } = choicesOf(model, engine);
  const short = looked.length > 0 && looked.length < lookSize;
  return { effect, lookSize, maxReservations: max, looked, slots, short, full: draft.picks.length >= max };
}

function allChoices(options: Pick<CommissionStepOptions, "looked" | "slots">): CommissionChoice[] {
  return [...options.slots, ...options.looked];
}

/** Keeps the offered picks, without duplicates, at most the limit. */
function settle(draft: CommissionDraft, model: GameModel, engine: EngineView): CommissionDraft {
  const { looked, slots, max } = choicesOf(model, engine);
  const offered = new Set(allChoices({ looked, slots }).map((choice) => choice.key));
  const picks: CommissionPickKey[] = [];
  for (const key of draft.picks) if (offered.has(key) && !picks.includes(key) && picks.length < max) picks.push(key);
  return keepIfSame(draft, { picks });
}

/** The picks in the engine's canonical order: display positions ascending, then looked cards in look order. */
function canonical(draft: CommissionDraft, options: Pick<CommissionStepOptions, "looked" | "slots">): CommissionChoice[] {
  return allChoices(options).filter((choice) => draft.picks.includes(choice.key));
}

function pickOf(choice: CommissionChoice): CommissionPick {
  return choice.slotIndex === null ? { kind: "looked", orderId: choice.orderId } : { kind: "face_up", slotIndex: choice.slotIndex, orderId: choice.orderId };
}

export const commissionDraft: DraftModel<CommissionDraft, CommissionAction, CommissionStepOptions> = {
  initial(model, engine) {
    const options = optionsOf(BLANK, model, engine);
    const only = allChoices(options);
    // §3.5: the only choice is pre-selected (a single looked card and an empty display).
    return only.length === 1 && only[0] !== undefined ? { picks: [only[0].key] } : BLANK;
  },
  reduce(draft, action, model, engine) {
    switch (action.type) {
      case "revalidate":
        return settle(draft, model, engine);
      case "pick": {
        const offered = allChoices(optionsOf(draft, model, engine)).some((choice) => choice.key === action.key);
        return offered ? settle({ picks: [action.key] }, model, engine) : draft;
      }
      case "toggle": {
        const options = optionsOf(draft, model, engine);
        if (!allChoices(options).some((choice) => choice.key === action.key)) return draft;
        if (!action.on) return settle({ picks: draft.picks.filter((key) => key !== action.key) }, model, engine);
        if (draft.picks.includes(action.key)) return draft;
        // A pick beyond the limit is ignored; with a limit of 1 it replaces the other.
        if (options.full) return options.maxReservations === 1 ? settle({ picks: [action.key] }, model, engine) : draft;
        return settle({ picks: [...draft.picks, action.key] }, model, engine);
      }
    }
  },
  options: optionsOf,
  build(draft, model, engine) {
    const settled = settle(draft, model, engine);
    if (settled.picks.length === 0) return null;
    const options = optionsOf(settled, model, engine);
    return { type: "COMMISSION_CHOOSE", reservations: canonical(settled, options).map(pickOf) };
  },
  fromCommand(command, model, engine) {
    if (command.type !== "COMMISSION_CHOOSE") return null;
    const display = engine.view.game.market.display;
    const picks: CommissionPickKey[] = [];
    for (const pick of command.reservations) {
      if (pick.kind === "face_up") {
        if (display[pick.slotIndex] !== pick.orderId) return null;
        picks.push(slotPickKey(pick.slotIndex));
      } else picks.push(lookPickKey(pick.orderId));
    }
    const options = optionsOf({ picks }, model, engine);
    const offered = new Set(allChoices(options).map((choice) => choice.key));
    if (picks.length === 0 || picks.length > options.maxReservations || picks.some((key) => !offered.has(key)) || new Set(picks).size !== picks.length) return null;
    return { picks };
  },
  summary(draft, model, engine): RichMessage {
    const options = optionsOf(draft, model, engine);
    const chosen = canonical(draft, options);
    if (chosen.length === 0) return options.maxReservations > 1 ? msg("work.cm.summary.chooseTwo", { n: options.maxReservations }) : msg("work.cm.summary.choose");
    const orders = (t: Translator) => list(chosen.map((choice) => choice.orderId), t.locale);
    const lookedChosen = chosen.filter((choice) => choice.slotIndex === null).length;
    const rest = options.looked.length - lookedChosen;
    if (rest === 0) return msg("work.cm.summary.reserve", { orders });
    // "The other 2 cards" only when a looked card is reserved; otherwise all of them go.
    return lookedChosen > 0 ? msg("work.cm.summary.reserveRest", { orders, n: rest }) : msg("work.cm.summary.reserveLookedAll", { orders, n: rest });
  },
};
