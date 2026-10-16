/**
 * The draft model of the Commission Market steps (UI_V1.6.1_ARCHITECTURE §3.4 `commission`;
 * wireframe `decLook`). Owner: B4.
 *
 * The `commission` window follows the placement's first reservation (L186–200, B1):
 * - `reservation`: reserve again (a face-up Order and its gain, blind, or the Shifu's look) or
 *   stop (`COMMISSION_STOP`, once one reservation is made);
 * - `look_choice`: reserve one of the privately looked-at Orders (`COMMISSION_CHOOSE_LOOKED`);
 * - `resource`: the resource after a blind reservation or a look (`COMMISSION_GAIN`).
 * Lists come from `commissionOptions(view, step.effect)` and `lookedOrderOptions(view)`; the
 * window's `awaiting` is part of its open key, so each step starts from a fresh draft.
 */
import { commissionOptions, lookedOrderOptions, placementLimits } from "../../../game/index.ts";
import type { CommissionOptions, OrderId, OrderReservationSource, PlayerId, ResourceKind, WorkerEffect } from "../../../game/index.ts";
import { msg } from "../../i18n/translator.ts";
import type { RichMessage } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { LogApi } from "../../state/hooks.ts";
import type { EngineView, GameModel } from "../../state/model.ts";
import { keepIfSame, viewMemo } from "./context.ts";
import { slotKey } from "./locations/CommissionMarket.draft.ts";
import type { CommissionFirstKey } from "./locations/CommissionMarket.draft.ts";
import { RESOURCE_ORDER, amountText } from "./locations/shared.ts";

export type CommissionAwaiting = "reservation" | "look_choice" | "resource";

export interface CommissionDraft {
  /** `reservation`: a face-up slot, `blind`, `look`, or `stop`. */
  readonly reserve: CommissionFirstKey | "stop" | null;
  /** The gain of a face-up reservation. */
  readonly gain: ResourceKind | null;
  /** `look_choice`: the Order to reserve. */
  readonly looked: OrderId | null;
  /** `resource`: the resource gained now. */
  readonly resource: ResourceKind | null;
}

export type CommissionAction =
  | { readonly type: "reserve"; readonly reserve: CommissionFirstKey | "stop" }
  | { readonly type: "gain"; readonly gain: ResourceKind }
  | { readonly type: "looked"; readonly orderId: OrderId }
  | { readonly type: "resource"; readonly resource: ResourceKind };

export interface CommissionStepOptions {
  awaiting: CommissionAwaiting;
  effect: WorkerEffect;
  reservationsMade: number;
  maxReservations: number;
  slots: ReadonlyArray<{ key: CommissionFirstKey; slotIndex: number; orderId: OrderId }>;
  blind: boolean;
  look: boolean;
  canStop: boolean;
  /** The privately looked-at Orders (`look_choice`); only this seat receives them. */
  looked: readonly OrderId[];
  gains: readonly ResourceKind[];
  gainAmount: number;
  needsGain: boolean;
}

/** An Order this player reserved earlier in this Commission Market action. */
export interface ReservedThisTurn {
  /** The Order, when this seat may know it (face up, or its own secret record); else null. */
  orderId: OrderId | null;
  /** The display position of a face-up reservation, else null. */
  slotIndex: number | null;
  source: OrderReservationSource;
}

/**
 * The Orders `playerId` has reserved since placing a worker at the Commission Market, oldest
 * first, from the log (public records merged with this seat's own secret ones): a face-up Order
 * is public; a blind or looked-at Order is named only by the seat's own record. This is the
 * player's own information (wireframe `decLook`, "Already reserved this turn").
 */
export function reservedThisTurn(log: LogApi["log"], playerId: PlayerId): ReservedThisTurn[] {
  const found: ReservedThisTurn[] = [];
  for (let index = log.length - 1; index >= 0; index -= 1) {
    const entry = log[index];
    if (entry === undefined) continue;
    const event = entry.event;
    if (event.type === "WORK_TURN_STARTED") break;
    if (event.type === "WORKER_PLACED" && event.playerId === playerId) break;
    if (event.type !== "ORDER_RESERVED" || event.playerId !== playerId || event.via !== "commission_market") continue;
    const own = entry.own?.type === "ORDER_RESERVED" && entry.own.playerId === playerId ? (entry.own.secret?.orderId ?? null) : null;
    found.unshift({ orderId: own ?? event.orderId, slotIndex: event.slotIndex, source: event.source });
  }
  return found;
}

const BLANK: CommissionDraft = Object.freeze({ reserve: null, gain: null, looked: null, resource: null });

function windowOf(model: GameModel): { awaiting: CommissionAwaiting; effect: WorkerEffect } {
  const window = model.window;
  return window.kind === "commission" ? { awaiting: window.awaiting, effect: window.effect } : { awaiting: "reservation", effect: "apprentice" };
}

function selectorOptions(engine: EngineView, effect: WorkerEffect): CommissionOptions {
  return viewMemo(engine.view, `commissionOptions:${effect}`, () => commissionOptions(engine.view, effect));
}

function optionsOf(draft: CommissionDraft, model: GameModel, engine: EngineView): CommissionStepOptions {
  const { awaiting, effect } = windowOf(model);
  const selector = selectorOptions(engine, effect);
  const display = engine.view.game.market.display;
  const look = lookedOrderOptions(engine.view);
  return {
    awaiting,
    effect,
    reservationsMade: selector.reservationsMade,
    maxReservations: selector.maxReservations,
    slots: selector.faceUpSlots.flatMap((slotIndex) => {
      const orderId = display[slotIndex];
      return orderId === null || orderId === undefined ? [] : [{ key: slotKey(slotIndex), slotIndex, orderId }];
    }),
    blind: selector.blind,
    look: selector.lookTopThree,
    canStop: selector.canStop,
    looked: look !== null && look.kind === "commission_top_three" ? look.orderIds : [],
    gains: RESOURCE_ORDER,
    gainAmount: placementLimits(engine.view, "commission_market", effect).gainAfterEach,
    needsGain: draft.reserve !== null && draft.reserve.startsWith("slot:"),
  };
}

function offered(reserve: CommissionFirstKey | "stop", options: CommissionStepOptions): boolean {
  switch (reserve) {
    case "stop":
      return options.canStop;
    case "blind":
      return options.blind;
    case "look":
      return options.look;
    default:
      return options.slots.some((slot) => slot.key === reserve);
  }
}

function revalidate(draft: CommissionDraft, model: GameModel, engine: EngineView): CommissionDraft {
  const options = optionsOf(draft, model, engine);
  return keepIfSame(draft, {
    reserve: draft.reserve !== null && options.awaiting === "reservation" && offered(draft.reserve, options) ? draft.reserve : null,
    gain: draft.gain !== null && options.gains.includes(draft.gain) ? draft.gain : null,
    looked: draft.looked !== null && options.looked.includes(draft.looked) ? draft.looked : null,
    resource: draft.resource !== null && options.awaiting === "resource" && options.gains.includes(draft.resource) ? draft.resource : null,
  });
}

export const commissionDraft: DraftModel<CommissionDraft, CommissionAction, CommissionStepOptions> = {
  initial(model, engine) {
    const options = optionsOf(BLANK, model, engine);
    const only = options.awaiting === "look_choice" && options.looked.length === 1 ? options.looked[0] : undefined;
    return only === undefined ? BLANK : { ...BLANK, looked: only };
  },
  reduce(draft, action, model, engine) {
    switch (action.type) {
      case "revalidate":
        return revalidate(draft, model, engine);
      case "reserve": {
        // A choice the options do not offer is ignored; the current one stays.
        const options = optionsOf(draft, model, engine);
        return options.awaiting === "reservation" && offered(action.reserve, options) ? revalidate({ ...draft, reserve: action.reserve }, model, engine) : draft;
      }
      case "gain":
        return revalidate({ ...draft, gain: action.gain }, model, engine);
      case "looked":
        return revalidate({ ...draft, looked: action.orderId }, model, engine);
      case "resource":
        return revalidate({ ...draft, resource: action.resource }, model, engine);
    }
  },
  options: optionsOf,
  build(draft, model, engine) {
    const options = optionsOf(draft, model, engine);
    switch (options.awaiting) {
      case "reservation": {
        if (draft.reserve === null) return null;
        if (draft.reserve === "stop") return { type: "COMMISSION_STOP" };
        if (draft.reserve === "blind") return { type: "COMMISSION_RESERVE", choice: { kind: "blind" } };
        if (draft.reserve === "look") return { type: "COMMISSION_RESERVE", choice: { kind: "look_top_three" } };
        const slot = options.slots.find((candidate) => candidate.key === draft.reserve);
        if (slot === undefined || draft.gain === null) return null;
        return { type: "COMMISSION_RESERVE", choice: { kind: "face_up", slotIndex: slot.slotIndex, orderId: slot.orderId, gain: draft.gain } };
      }
      case "look_choice":
        return draft.looked === null ? null : { type: "COMMISSION_CHOOSE_LOOKED", orderId: draft.looked };
      case "resource":
        return draft.resource === null ? null : { type: "COMMISSION_GAIN", resource: draft.resource };
    }
  },
  fromCommand(command, _model, engine) {
    switch (command.type) {
      case "COMMISSION_STOP":
        return { ...BLANK, reserve: "stop" };
      case "COMMISSION_RESERVE": {
        const choice = command.choice;
        if (choice.kind === "blind") return { ...BLANK, reserve: "blind" };
        if (choice.kind === "look_top_three") return { ...BLANK, reserve: "look" };
        if (engine.view.game.market.display[choice.slotIndex] !== choice.orderId) return null;
        return { ...BLANK, reserve: slotKey(choice.slotIndex), gain: choice.gain };
      }
      case "COMMISSION_CHOOSE_LOOKED":
        return { ...BLANK, looked: command.orderId };
      case "COMMISSION_GAIN":
        return { ...BLANK, resource: command.resource };
      default:
        return null;
    }
  },
  summary(draft, model, engine): RichMessage | null {
    const options = optionsOf(draft, model, engine);
    const amountOf = (kind: ResourceKind) => (t: Parameters<typeof amountText>[0]) => amountText(t, kind, options.gainAmount);
    switch (options.awaiting) {
      case "reservation": {
        if (draft.reserve === null) return msg("work.cm.summary.choose");
        if (draft.reserve === "stop") return msg("work.cm.summary.stop");
        if (draft.reserve === "blind") return msg("work.cm.summary.reserveBlind");
        if (draft.reserve === "look") return msg("work.cm.summary.look");
        const slot = options.slots.find((candidate) => candidate.key === draft.reserve);
        if (slot === undefined) return msg("work.cm.summary.choose");
        if (draft.gain === null) return msg("work.cm.summary.chooseGain");
        return msg("work.cm.summary.reserveSlot", { order: slot.orderId, amount: amountOf(draft.gain) });
      }
      case "look_choice":
        if (draft.looked === null) return msg("work.cm.summary.choose");
        return msg("work.cm.summary.chooseLooked", { order: draft.looked });
      case "resource":
        if (draft.resource === null) return msg("work.cm.summary.chooseGain");
        return msg("work.cm.summary.gain", { amount: amountOf(draft.resource) });
    }
  },
};
