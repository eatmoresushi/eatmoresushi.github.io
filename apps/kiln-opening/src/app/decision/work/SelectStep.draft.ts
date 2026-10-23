/**
 * The draft model of every Select N (UI_V1.6.1_ARCHITECTURE §3.4 `commission`, `colour_samples`,
 * `colour_samples_swap`; keyword Select N, v1.6.2 L64, change 25). Owner: B4.
 *
 * A Select looks privately at the top N Main Orders (as many as remain, B1, R16), then reserves
 * 1 of them or 1 face-up Main Order from the display; the looked cards not reserved are discarded
 * face down to the Main Order discard (owner ruling R25, replacing change 24's deck bottom).
 * Three windows open one, and all three answer with one command, `SELECT_CHOOSE`:
 * - `commission`: the Commission Market (v1.6.2 L201–202). The Apprentice effect Selects 2 and
 *   reserves exactly 1; the Shifu effect (Senior Apprentice included, R12) Selects 3 and reserves
 *   1 or 2, from the looked cards and the display in any mix. No resource is gained;
 * - `colour_samples`: Colour Samples when acquired, Select 3 (v1.6.2 L622, R4). After a Guild
 *   Hall Shifu's take the inspection then continues (the engine's `resume`);
 * - `colour_samples_swap`: the once-per-round swap's Select 3, after its held Order was discarded
 *   (v1.6.2 L622, R17).
 * A face-up position reserved stays empty until the turn ends (v1.6.2 L197, L646).
 *
 * Every list comes from `lookedOrderOptions(view)` (the viewer's own Select: N, the looked cards,
 * the display positions reservable now and the reservation limit); the draft only holds which of
 * them are chosen. Its keys are `slot:<i>` for a display position and `look:<OrderId>` for a
 * looked card. `build` lists the picks in the engine's canonical order (display positions
 * ascending, then looked cards in look order), so the same choice always builds the same command.
 */
import { lookedOrderOptions } from "../../../game/index.ts";
import type { LookedOrderOptions, OrderId, SelectPick, WorkerEffect } from "../../../game/index.ts";
import { andList } from "../../i18n/format.ts";
import { msg } from "../../i18n/translator.ts";
import type { RichMessage, Translator } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView, GameModel } from "../../state/model.ts";
import { keepIfSame, viewMemo } from "./context.ts";

/** The decision windows that open a Select. */
export type SelectWindowKind = "commission" | "colour_samples" | "colour_samples_swap";

/** The engine's look kind of each Select window. */
const LOOK_KIND = {
  commission: "commission_market",
  colour_samples: "colour_samples",
  colour_samples_swap: "colour_samples_swap",
} as const satisfies Record<SelectWindowKind, LookedOrderOptions["kind"]>;

/** True for a window that opens a Select. */
export function isSelectWindow(kind: string): kind is SelectWindowKind {
  return kind in LOOK_KIND;
}

/** `slot:<i>` (a display position) or `look:<OrderId>` (a looked card). */
export type SelectPickKey = `slot:${number}` | `look:${string}`;

export interface SelectDraft {
  /** The chosen reservations, in the order they were chosen. */
  readonly picks: readonly SelectPickKey[];
}

export type SelectAction =
  /** Radio (a limit of 1): this pick replaces any other. */
  | { readonly type: "pick"; readonly key: SelectPickKey }
  /** Checkbox (a limit of 2): add or remove one pick. */
  | { readonly type: "toggle"; readonly key: SelectPickKey; readonly on: boolean };

export interface SelectChoice {
  key: SelectPickKey;
  orderId: OrderId;
  /** The display position, for a face-up Order; null for a looked card. */
  slotIndex: number | null;
}

export interface SelectStepOptions {
  /** The open Select window, or null outside one. */
  kind: SelectWindowKind | null;
  /** The Commission Market placement's effect; null for Colour Samples. */
  effect: WorkerEffect | null;
  /** N: 2 or 3 (v1.6.2 L64). */
  n: number;
  /** 1, or 2 for the Commission Market Shifu effect. At least 1 is always required. */
  maxReservations: number;
  /** The privately looked-at Orders, in look order (only this seat receives them, B3). */
  looked: readonly SelectChoice[];
  /** The display positions reservable now, ascending. */
  slots: readonly SelectChoice[];
  /**
   * The look showed some cards, but fewer than N: the Main Order deck ran short (B1, R16: a look
   * never completes itself from a reshuffle). A public fact (the step's `lookedCount`).
   */
  short: boolean;
  /** The limit is reached: no other pick can be added. */
  full: boolean;
  /**
   * Colour Samples was taken by a Guild Hall Shifu whose inspection waits behind this Select:
   * after the reservation the inspection resumes (take another Tech or stop). Public: the step's
   * `resume` (the takes are public; the waiting Techs are not read here).
   */
  resume: boolean;
}

const BLANK: SelectDraft = Object.freeze({ picks: Object.freeze([]) as readonly SelectPickKey[] });

export function slotPickKey(slotIndex: number): SelectPickKey {
  return `slot:${slotIndex}`;
}

export function lookPickKey(orderId: OrderId): SelectPickKey {
  return `look:${orderId}`;
}

function windowKind(model: GameModel): SelectWindowKind | null {
  return isSelectWindow(model.window.kind) ? model.window.kind : null;
}

/** The viewer's own open Select, when it belongs to the open window. */
function lookOf(model: GameModel, engine: EngineView): LookedOrderOptions | null {
  const kind = windowKind(model);
  const look = viewMemo(engine.view, "lookedOrderOptions", () => lookedOrderOptions(engine.view));
  return kind === null || look === null || look.kind !== LOOK_KIND[kind] ? null : look;
}

/** The when-acquired Select resumes a Guild Hall Shifu's inspection afterwards (engine step `resume`). */
function resumesInspection(engine: EngineView): boolean {
  const phase = engine.view.game.phase;
  return phase.type === "work_turn" && phase.step.kind === "colour_samples" && phase.step.resume !== null;
}

function choicesOf(model: GameModel, engine: EngineView): { looked: SelectChoice[]; slots: SelectChoice[]; max: number; n: number } {
  const look = lookOf(model, engine);
  if (look === null) return { looked: [], slots: [], max: 1, n: 0 };
  const display = engine.view.game.market.display;
  const slots = [...look.faceUpSlots]
    .sort((a, b) => a - b)
    .flatMap((slotIndex): SelectChoice[] => {
      const orderId = display[slotIndex];
      return orderId === null || orderId === undefined ? [] : [{ key: slotPickKey(slotIndex), orderId, slotIndex }];
    });
  const looked = look.orderIds.map((orderId): SelectChoice => ({ key: lookPickKey(orderId), orderId, slotIndex: null }));
  return { looked, slots, max: look.maxReservations, n: look.n };
}

function optionsOf(draft: SelectDraft, model: GameModel, engine: EngineView): SelectStepOptions {
  const kind = windowKind(model);
  const { looked, slots, max, n } = choicesOf(model, engine);
  return {
    kind,
    effect: model.window.kind === "commission" ? model.window.effect : null,
    n,
    maxReservations: max,
    looked,
    slots,
    short: looked.length > 0 && looked.length < n,
    full: draft.picks.length >= max,
    resume: kind === "colour_samples" && resumesInspection(engine),
  };
}

function allChoices(options: Pick<SelectStepOptions, "looked" | "slots">): SelectChoice[] {
  return [...options.slots, ...options.looked];
}

/** Keeps the offered picks, without duplicates, at most the limit. */
function settle(draft: SelectDraft, model: GameModel, engine: EngineView): SelectDraft {
  const { looked, slots, max } = choicesOf(model, engine);
  const offered = new Set(allChoices({ looked, slots }).map((choice) => choice.key));
  const picks: SelectPickKey[] = [];
  for (const key of draft.picks) if (offered.has(key) && !picks.includes(key) && picks.length < max) picks.push(key);
  return keepIfSame(draft, { picks });
}

/** The picks in the engine's canonical order: display positions ascending, then looked cards in look order. */
function canonical(draft: SelectDraft, options: Pick<SelectStepOptions, "looked" | "slots">): SelectChoice[] {
  return allChoices(options).filter((choice) => draft.picks.includes(choice.key));
}

function pickOf(choice: SelectChoice): SelectPick {
  return choice.slotIndex === null ? { kind: "looked", orderId: choice.orderId } : { kind: "face_up", slotIndex: choice.slotIndex, orderId: choice.orderId };
}

/** The table's Choose toggle (or the form's option) for a pick: the draft action it makes. */
export function selectActionFor(draft: SelectDraft, options: SelectStepOptions, key: SelectPickKey): SelectAction | null {
  if (!allChoices(options).some((choice) => choice.key === key)) return null;
  return options.maxReservations === 1 ? { type: "pick", key } : { type: "toggle", key, on: !draft.picks.includes(key) };
}

export const selectDraft: DraftModel<SelectDraft, SelectAction, SelectStepOptions> = {
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
    return { type: "SELECT_CHOOSE", reservations: canonical(settled, options).map(pickOf) };
  },
  fromCommand(command, model, engine) {
    if (command.type !== "SELECT_CHOOSE") return null;
    const display = engine.view.game.market.display;
    const picks: SelectPickKey[] = [];
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
    const orders = (t: Translator) => andList(chosen.map((choice) => choice.orderId), t.locale);
    const lookedChosen = chosen.filter((choice) => choice.slotIndex === null).length;
    const rest = options.looked.length - lookedChosen;
    if (rest === 0) return msg("work.cm.summary.reserve", { orders });
    // "The other 2 cards" only when a looked card is reserved; otherwise all of them go.
    return lookedChosen > 0 ? msg("work.cm.summary.reserveRest", { orders, n: rest }) : msg("work.cm.summary.reserveLookedAll", { orders, n: rest });
  },
};
