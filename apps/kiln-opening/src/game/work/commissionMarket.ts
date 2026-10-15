/**
 * Commission Market incl. Senior Apprentice and the Shifu top-3 (L186–200, L396, L619, L653,
 * R12, B1, B3; DESIGN §3.2 "Commission Market sub-step").
 *
 * - `PLACE_COMMISSION_MARKET` carries the mandatory first reservation (L198). A face-up
 *   reservation names its resource in the same command (everything is known); a blind
 *   reservation reveals a card to the actor, so `COMMISSION_GAIN` follows (L195–196); the
 *   Shifu top-3 look opens `look_choice`, then `COMMISSION_CHOOSE_LOOKED`.
 * - After each reservation the player gains 1 Clay, Wood or Coin (L196). With the Shifu effect
 *   (incl. Senior Apprentice, R12) a second reservation may follow (`COMMISSION_RESERVE`), or
 *   `COMMISSION_STOP` ends the action (L198).
 * - A face-up position stays empty until the turn ends (L190, L390): the second reservation
 *   chooses among the Orders still showing, and `work/turn.endTurn` refills once.
 * - Every reservation must take an available card (B1). Legality reads public counts only
 *   (`market.reservable`), so it never depends on hidden information.
 * - Blind and top-3 identities are private (B3): `ORDER_RESERVED.secret`, `PRIVATE_LOOK_OPENED`
 *   and `LOOKED_ORDERS_DISCARDED.secret`; the public payloads carry counts and sources only.
 *
 * Layer 4 (P4). Imports layers 0–3 only; hands over through `ctx.flow.workerActionDone`.
 */

import { LOCATIONS } from "../content.ts";
import { invariant, ruleError } from "../errors.ts";
import {
  addToHand,
  discardMainOrders,
  drawMainOrder,
  reservable,
  takeFaceUpOrder,
  takeTopMainOrders,
} from "../market.ts";
import { placeWorker, validatePlacement, workerEffectFor } from "../placement.ts";
import { emit, gain, phaseAs } from "../state.ts";
import type {
  ActionHandlerTable,
  ActorView,
  CommissionReservationChoice,
  GainResource,
  GameRuleError,
  GameState,
  PlayerId,
  PublicGameState,
  ResolveContext,
  WorkTurnStep,
  WorkerEffect,
} from "../types.ts";
import { publicCounts } from "../view.ts";

type CommissionStep = Extract<WorkTurnStep, { kind: "commission_market" }>;
type Awaiting = CommissionStep["awaiting"];
type Supply = ReturnType<typeof reservable>;

const LOCATION = "commission_market";
const EFFECTS = LOCATIONS.commission_market.effects;

// ── Shared checks (validators see only the actor's view) ─────────────────────────────

/** The public projection of a draft, for `market.reservable` (public counts only). */
function publicGame(draft: GameState): PublicGameState {
  const { hidden: _hidden, ...core } = draft;
  return { ...core, counts: publicCounts(draft) };
}

/** Top-3 looks this effect allows (L196: the Shifu, once per action). */
function topThreeLooks(effect: WorkerEffect): number {
  return effect === "shifu" ? EFFECTS.shifu.topThreeLooks : 0;
}

/** At least one reservation can be made (L141, B1). A look needs a card, so it never adds
 * an option that a blind reservation lacks; it is listed for clarity. */
function anyReservation(supply: Supply, lookAvailable: boolean): boolean {
  return supply.faceUpSlots.length > 0 || supply.blind || (lookAvailable && supply.look);
}

function reservationError(
  supply: Supply,
  display: PublicGameState["market"]["display"],
  effect: WorkerEffect,
  lookAvailable: boolean,
  choice: CommissionReservationChoice,
): GameRuleError | null {
  switch (choice.kind) {
    case "face_up": {
      const shown = display[choice.slotIndex] ?? null;
      if (shown === null || shown !== choice.orderId || !supply.faceUpSlots.includes(choice.slotIndex)) {
        return ruleError("ORDER_NOT_AVAILABLE", "That Order is no longer on the display.", {
          orderId: choice.orderId,
          slotIndex: choice.slotIndex,
        });
      }
      return null;
    }
    case "blind":
      return supply.blind
        ? null
        : ruleError("ORDER_SUPPLY_EMPTY", "The Main Order deck and discard pile are both empty.", {});
    case "look_top_three":
      if (!lookAvailable) {
        return ruleError(
          "INVALID_CHOICE",
          effect === "shifu"
            ? "This action has already used its top-3 selection."
            : "Only the Shifu effect may look at the top 3 Main Orders.",
          { choice: choice.kind, effect },
        );
      }
      return supply.look
        ? null
        : ruleError("ORDER_SUPPLY_EMPTY", "The Main Order deck and discard pile are both empty.", {});
    default: {
      const unknown: never = choice;
      return ruleError("MALFORMED_ACTION", "Unknown reservation choice.", { field: "choice", value: String(unknown) });
    }
  }
}

/** The active player's Commission sub-step awaiting `awaiting`, or the rule error. */
function stepFor(view: ActorView, awaiting: Awaiting): CommissionStep | GameRuleError {
  const phase = view.game.phase;
  if (phase.type !== "work_turn") {
    return ruleError("WRONG_PHASE", "The Commission Market is resolved during the Work Phase.", { phase: phase.type });
  }
  if (phase.activePlayerId !== view.viewerId) {
    return ruleError("NOT_YOUR_DECISION", "It is not your Work turn.", { playerId: view.viewerId });
  }
  const step = phase.step;
  if (step.kind !== "commission_market" || step.awaiting !== awaiting) {
    return ruleError("WRONG_PHASE", "That Commission Market choice is not due now.", {
      phase: phase.type,
      step: step.kind === "commission_market" ? `${step.kind}.${step.awaiting}` : step.kind,
    });
  }
  return step;
}

function isError(value: CommissionStep | GameRuleError): value is GameRuleError {
  return "code" in value;
}

// ── Resolution ───────────────────────────────────────────────────────────────────────

function commissionStep(draft: GameState, playerId: PlayerId): CommissionStep {
  const phase = phaseAs(draft, "work_turn");
  invariant(phase.activePlayerId === playerId, `${playerId} is not the active player`);
  invariant(phase.step.kind === "commission_market", `Expected the Commission Market step, found ${phase.step.kind}`);
  return phase.step;
}

function countReservation(step: CommissionStep): void {
  invariant(step.reservationsMade < step.maxReservations, "Commission Market reservation limit exceeded");
  step.reservationsMade = step.reservationsMade === 0 ? 1 : 2;
}

/** Resolves one reservation (L190–191, L196). */
function reserve(draft: GameState, playerId: PlayerId, choice: CommissionReservationChoice, ctx: ResolveContext): void {
  const step = commissionStep(draft, playerId);
  switch (choice.kind) {
    case "face_up": {
      const orderId = takeFaceUpOrder(draft, playerId, choice.slotIndex);
      invariant(orderId === choice.orderId, `Display position ${choice.slotIndex} held ${orderId}, not ${choice.orderId}`);
      addToHand(draft, playerId, orderId);
      emit(ctx, {
        type: "ORDER_RESERVED",
        playerId,
        via: "commission_market",
        source: "face_up",
        slotIndex: choice.slotIndex,
        orderId,
      });
      countReservation(step);
      gainAfterReservation(draft, playerId, choice.gain, ctx);
      return;
    }
    case "blind": {
      const orderId = drawMainOrder(draft, ctx);
      invariant(orderId !== null, "A validated blind reservation found no card");
      addToHand(draft, playerId, orderId);
      emit(ctx, {
        type: "ORDER_RESERVED",
        playerId,
        via: "commission_market",
        source: "blind",
        slotIndex: null,
        orderId: null,
        secret: { visibleTo: playerId, orderId },
      });
      countReservation(step);
      step.awaiting = "resource";
      return;
    }
    case "look_top_three": {
      const orderIds = takeTopMainOrders(draft, EFFECTS.shifu.lookSize, ctx);
      invariant(orderIds.length > 0, "A validated top-3 look found no card");
      draft.hidden.pendingLook = { kind: "commission_top_three", playerId, orderIds: [...orderIds] };
      emit(ctx, {
        type: "PRIVATE_LOOK_OPENED",
        playerId,
        kind: "commission_top_three",
        discipline: null,
        count: orderIds.length,
        secret: { visibleTo: playerId, orderIds: [...orderIds], techIds: [] },
      });
      step.topThreeAvailable = false;
      step.awaiting = "look_choice";
      return;
    }
    default: {
      const unknown: never = choice;
      invariant(false, `Unknown reservation choice ${JSON.stringify(unknown)}`);
    }
  }
}

/** Gains the resource after a reservation (L195–196), then offers another reservation or
 * completes the worker action. */
function gainAfterReservation(draft: GameState, playerId: PlayerId, resource: GainResource, ctx: ResolveContext): void {
  const step = commissionStep(draft, playerId);
  gain(draft, playerId, { [resource]: EFFECTS[step.effect].gainAfterEach }, "commission_market", ctx);
  if (
    step.reservationsMade < step.maxReservations &&
    anyReservation(reservable(publicGame(draft)), step.topThreeAvailable)
  ) {
    step.awaiting = "reservation";
    return;
  }
  ctx.flow.workerActionDone(draft, playerId, ctx);
}

// ── Handlers ─────────────────────────────────────────────────────────────────────────

export const handlers: Pick<
  ActionHandlerTable,
  "PLACE_COMMISSION_MARKET" | "COMMISSION_RESERVE" | "COMMISSION_CHOOSE_LOOKED" | "COMMISSION_GAIN" | "COMMISSION_STOP"
> = {
  PLACE_COMMISSION_MARKET: {
    phases: ["work_turn"],
    validate: (view, action) => {
      const seniorApprentice = action.seniorApprentice === true;
      const placementError = validatePlacement(view, action.workerId, LOCATION, seniorApprentice);
      if (placementError !== null) {
        return placementError;
      }
      const effect = workerEffectFor(view, action.workerId, seniorApprentice);
      const lookAvailable = topThreeLooks(effect) > 0;
      const supply = reservable(view.game);
      if (!anyReservation(supply, lookAvailable)) {
        return ruleError("NO_MAIN_ACTION_POSSIBLE", "There is no Main Order to reserve.", {
          locationId: LOCATION,
          workerId: action.workerId,
          effect,
        });
      }
      return reservationError(supply, view.game.market.display, effect, lookAvailable, action.first);
    },
    resolve: (draft, actorId, action, ctx) => {
      const placement = placeWorker(draft, actorId, action.workerId, LOCATION, action.seniorApprentice === true, ctx);
      const effect = placement.effect;
      const maxReservations = EFFECTS[effect].maxReservations;
      invariant(maxReservations === 1 || maxReservations === 2, `Unexpected reservation limit ${maxReservations}`);
      phaseAs(draft, "work_turn").step = {
        kind: "commission_market",
        workerId: action.workerId,
        effect,
        maxReservations,
        reservationsMade: 0,
        topThreeAvailable: topThreeLooks(effect) > 0,
        awaiting: "reservation",
      };
      reserve(draft, actorId, action.first, ctx);
    },
  },
  COMMISSION_RESERVE: {
    phases: ["work_turn"],
    validate: (view, action) => {
      const step = stepFor(view, "reservation");
      if (isError(step)) {
        return step;
      }
      if (step.reservationsMade >= step.maxReservations) {
        return ruleError("RESERVATION_LIMIT", "This action cannot reserve another Order.", {
          limit: step.maxReservations,
          reservationsMade: step.reservationsMade,
        });
      }
      return reservationError(reservable(view.game), view.game.market.display, step.effect, step.topThreeAvailable, action.choice);
    },
    resolve: (draft, actorId, action, ctx) => reserve(draft, actorId, action.choice, ctx),
  },
  COMMISSION_CHOOSE_LOOKED: {
    phases: ["work_turn"],
    validate: (view, action) => {
      const step = stepFor(view, "look_choice");
      if (isError(step)) {
        return step;
      }
      const look = view.own.pendingLook;
      if (look === null || look.kind !== "commission_top_three" || !look.orderIds.includes(action.orderId)) {
        return ruleError("INVALID_CHOICE", "Choose one of the Orders you looked at.", { orderId: action.orderId });
      }
      return null;
    },
    resolve: (draft, actorId, action, ctx) => {
      const step = commissionStep(draft, actorId);
      const look = draft.hidden.pendingLook;
      invariant(
        look !== null && look.kind === "commission_top_three" && look.playerId === actorId,
        "No Commission top-3 look is pending for the actor",
      );
      const rest = look.orderIds.filter((orderId) => orderId !== action.orderId);
      draft.hidden.pendingLook = null;
      addToHand(draft, actorId, action.orderId);
      emit(ctx, {
        type: "ORDER_RESERVED",
        playerId: actorId,
        via: "commission_market",
        source: "top_three",
        slotIndex: null,
        orderId: null,
        secret: { visibleTo: actorId, orderId: action.orderId },
      });
      if (rest.length > 0) {
        discardMainOrders(draft, rest);
        emit(ctx, {
          type: "LOOKED_ORDERS_DISCARDED",
          playerId: actorId,
          count: rest.length,
          secret: { visibleTo: actorId, orderIds: rest },
        });
      }
      countReservation(step);
      step.awaiting = "resource";
    },
  },
  COMMISSION_GAIN: {
    phases: ["work_turn"],
    validate: (view) => {
      const step = stepFor(view, "resource");
      return isError(step) ? step : null;
    },
    resolve: (draft, actorId, action, ctx) => gainAfterReservation(draft, actorId, action.resource, ctx),
  },
  COMMISSION_STOP: {
    phases: ["work_turn"],
    validate: (view) => {
      const step = stepFor(view, "reservation");
      if (isError(step)) {
        return step;
      }
      if (step.reservationsMade < 1) {
        return ruleError("INVALID_CHOICE", "You must reserve at least 1 Order.", { choice: "stop" });
      }
      return null;
    },
    resolve: (draft, actorId, _action, ctx) => {
      commissionStep(draft, actorId);
      ctx.flow.workerActionDone(draft, actorId, ctx);
    },
  },
};
