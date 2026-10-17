/**
 * Commission Market incl. Senior Apprentice (v1.6.2 L189–200, L390, L396, L618, L652; R12,
 * B1, B3; DESIGN §3.2 as amended by ENGINE_V1.6.2_DELTA.md §4.2).
 *
 * - `PLACE_COMMISSION_MARKET` places the worker and always opens the private look: the top 2
 *   Main Orders for the Apprentice effect, the top 3 for the Shifu effect (incl. Senior
 *   Apprentice, R12), as many as remain (B1). The look happens before any reservation is
 *   chosen (INT: Commission Market looks), so the step opens whatever the cards are.
 * - `COMMISSION_CHOOSE` then makes the reservations: exactly 1 (Apprentice effect) or 1–2
 *   (Shifu effect), each a face-up Order or a looked card, in any mix (v1.6.2 L195–196,
 *   L198). The looked cards not reserved go face down to the bottom of the Main deck, in random
 *   order (change 24, L34, L191; owner ruling R19). No resource is gained.
 * - A face-up position stays empty until the turn ends (v1.6.2 L191, L390): both of a Shifu's
 *   reservations choose from the Orders showing now, and `work/turn.endTurn` refills once.
 * - Placement legality reads public counts only (`market.reservable`): a display Order or a
 *   non-empty deck plus discard, so at least 1 reservation always exists (L142, B1).
 * - Looked identities are private (B3): `PRIVATE_LOOK_OPENED.secret`, `ORDER_RESERVED.secret`
 *   and `LOOKED_ORDERS_TO_BOTTOM.secret`; public payloads carry counts and face-up IDs only.
 *
 * Layer 4 (P4). Imports layers 0–3 only; hands over through `ctx.flow.workerActionDone`.
 */

import { LOCATIONS } from "../content.ts";
import { invariant, ruleError } from "../errors.ts";
import { addToHand, putMainOrdersOnBottom, reservable, takeFaceUpOrder, takeTopMainOrders } from "../market.ts";
import { placeWorker, validatePlacement, workerEffectFor } from "../placement.ts";
import { emit, phaseAs } from "../state.ts";
import type {
  ActionHandlerTable,
  ActorView,
  CommissionPick,
  GameRuleError,
  GameState,
  OrderId,
  PlayerId,
  WorkTurnStep,
  WorkerEffect,
} from "../types.ts";

type CommissionStep = Extract<WorkTurnStep, { kind: "commission_market" }>;

const LOCATION = "commission_market";
const EFFECTS = LOCATIONS.commission_market.effects;

/** The printed look and reservation limit of a worker effect (v1.6.2 L195–196). */
export function commissionLimits(effect: WorkerEffect): { lookSize: 2 | 3; maxReservations: 1 | 2 } {
  const { lookSize, maxReservations } = EFFECTS[effect];
  invariant(lookSize === 2 || lookSize === 3, `Unexpected Commission look size ${lookSize}`);
  invariant(maxReservations === 1 || maxReservations === 2, `Unexpected reservation limit ${maxReservations}`);
  return { lookSize, maxReservations };
}

// ── Validation (validators see only the actor's view) ────────────────────────────────

/** The active player's Commission step, or the rule error. */
function stepFor(view: ActorView): CommissionStep | GameRuleError {
  const phase = view.game.phase;
  if (phase.type !== "work_turn") {
    return ruleError("WRONG_PHASE", "The Commission Market is resolved during the Work Phase.", { phase: phase.type });
  }
  if (phase.activePlayerId !== view.viewerId) {
    return ruleError("NOT_YOUR_DECISION", "It is not your Work turn.", { playerId: view.viewerId });
  }
  if (phase.step.kind !== "commission_market") {
    return ruleError("WRONG_PHASE", "No Commission Market reservation is due now.", { phase: phase.type, step: phase.step.kind });
  }
  return phase.step;
}

function isError(value: CommissionStep | GameRuleError): value is GameRuleError {
  return "code" in value;
}

/**
 * The reservations of a `COMMISSION_CHOOSE`, in this order: the count (at least 1, at most
 * the effect's limit), duplicates, then each pick against the display and the own look.
 */
function picksError(view: ActorView, step: CommissionStep, picks: readonly CommissionPick[]): GameRuleError | null {
  if (picks.length === 0) {
    return ruleError("RESERVATION_REQUIRED", "Reserve at least 1 Order.", {});
  }
  if (picks.length > step.maxReservations) {
    return ruleError("RESERVATION_LIMIT", `This action reserves at most ${step.maxReservations} Orders.`, {
      limit: step.maxReservations,
      requested: picks.length,
    });
  }
  const slots = new Set<number>();
  const looked = new Set<OrderId>();
  for (const pick of picks) {
    const duplicate = pick.kind === "face_up" ? slots.has(pick.slotIndex) : looked.has(pick.orderId);
    if (duplicate) {
      return ruleError("INVALID_CHOICE", "Each Order can be reserved only once.", {
        choice: pick.kind,
        orderId: pick.orderId,
        ...(pick.kind === "face_up" ? { slotIndex: pick.slotIndex } : {}),
      });
    }
    if (pick.kind === "face_up") {
      slots.add(pick.slotIndex);
    } else {
      looked.add(pick.orderId);
    }
  }
  const display = view.game.market.display;
  const look = view.own.pendingLook;
  for (const pick of picks) {
    if (pick.kind === "face_up") {
      const shown = display[pick.slotIndex] ?? null;
      if (shown === null || shown !== pick.orderId) {
        return ruleError("ORDER_NOT_AVAILABLE", "That Order is no longer on the display.", {
          orderId: pick.orderId,
          slotIndex: pick.slotIndex,
        });
      }
    } else if (look === null || look.kind !== "commission_market" || !look.orderIds.includes(pick.orderId)) {
      return ruleError("INVALID_CHOICE", "Choose one of the Orders you looked at.", { choice: pick.kind, orderId: pick.orderId });
    }
  }
  return null;
}

// ── Resolution ───────────────────────────────────────────────────────────────────────

function commissionStep(draft: GameState, playerId: PlayerId): CommissionStep {
  const phase = phaseAs(draft, "work_turn");
  invariant(phase.activePlayerId === playerId, `${playerId} is not the active player`);
  invariant(phase.step.kind === "commission_market", `Expected the Commission Market step, found ${phase.step.kind}`);
  return phase.step;
}

// ── Handlers ─────────────────────────────────────────────────────────────────────────

export const handlers: Pick<ActionHandlerTable, "PLACE_COMMISSION_MARKET" | "COMMISSION_CHOOSE"> = {
  PLACE_COMMISSION_MARKET: {
    phases: ["work_turn"],
    validate: (view, action) => {
      const seniorApprentice = action.seniorApprentice === true;
      const placementError = validatePlacement(view, action.workerId, LOCATION, seniorApprentice);
      if (placementError !== null) {
        return placementError;
      }
      const supply = reservable(view.game);
      if (supply.faceUpSlots.length === 0 && !supply.supply) {
        return ruleError("NO_MAIN_ACTION_POSSIBLE", "There is no Main Order to reserve.", {
          locationId: LOCATION,
          workerId: action.workerId,
          effect: workerEffectFor(view, action.workerId, seniorApprentice),
        });
      }
      return null;
    },
    resolve: (draft, actorId, action, ctx) => {
      const placement = placeWorker(draft, actorId, action.workerId, LOCATION, action.seniorApprentice === true, ctx);
      const effect = placement.effect;
      const { lookSize, maxReservations } = commissionLimits(effect);
      const orderIds = takeTopMainOrders(draft, lookSize, ctx);
      draft.hidden.pendingLook = { kind: "commission_market", playerId: actorId, orderIds: [...orderIds] };
      emit(ctx, {
        type: "PRIVATE_LOOK_OPENED",
        playerId: actorId,
        kind: "commission_market",
        discipline: null,
        count: orderIds.length,
        secret: { visibleTo: actorId, orderIds: [...orderIds], techIds: [] },
      });
      phaseAs(draft, "work_turn").step = {
        kind: "commission_market",
        workerId: action.workerId,
        effect,
        lookSize,
        maxReservations,
        lookedCount: orderIds.length,
      };
    },
  },
  COMMISSION_CHOOSE: {
    phases: ["work_turn"],
    validate: (view, action) => {
      const step = stepFor(view);
      return isError(step) ? step : picksError(view, step, action.reservations);
    },
    resolve: (draft, actorId, action, ctx) => {
      commissionStep(draft, actorId);
      const look = draft.hidden.pendingLook;
      invariant(look !== null && look.kind === "commission_market" && look.playerId === actorId, "No Commission look is pending for the actor");
      const reservedLooked = new Set<OrderId>();
      for (const pick of action.reservations) {
        if (pick.kind === "face_up") {
          const orderId = takeFaceUpOrder(draft, actorId, pick.slotIndex);
          invariant(orderId === pick.orderId, `Display position ${pick.slotIndex} held ${orderId}, not ${pick.orderId}`);
          addToHand(draft, actorId, orderId);
          emit(ctx, {
            type: "ORDER_RESERVED",
            playerId: actorId,
            via: "commission_market",
            source: "face_up",
            slotIndex: pick.slotIndex,
            orderId,
          });
        } else {
          invariant(look.orderIds.includes(pick.orderId), `${pick.orderId} is not in the actor's Commission look`);
          reservedLooked.add(pick.orderId);
          addToHand(draft, actorId, pick.orderId);
          emit(ctx, {
            type: "ORDER_RESERVED",
            playerId: actorId,
            via: "commission_market",
            source: "looked",
            slotIndex: null,
            orderId: null,
            secret: { visibleTo: actorId, orderId: pick.orderId },
          });
        }
      }
      // The rest of the look goes face down to the bottom of the Main deck, in random order
      // (v1.6.2 change 24, L191, L195–196; R19). The secret names them in look order.
      const rest = look.orderIds.filter((orderId) => !reservedLooked.has(orderId));
      draft.hidden.pendingLook = null;
      if (rest.length > 0) {
        putMainOrdersOnBottom(draft, rest, ctx);
        emit(ctx, {
          type: "LOOKED_ORDERS_TO_BOTTOM",
          playerId: actorId,
          count: rest.length,
          secret: { visibleTo: actorId, orderIds: rest },
        });
      }
      ctx.flow.workerActionDone(draft, actorId, ctx);
    },
  },
};
