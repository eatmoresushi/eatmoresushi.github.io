/**
 * Canal Wharf (L245–250) and Magistrate's Hall (L252–262).
 *
 * - **Canal Wharf:** gain 2 Coins (Apprentice), or 4 Coins and then the top Main Order card
 *   into the hand without looking at it (Shifu, v1.6.2 L249–250), in that order (INT: Canal
 *   Wharf Shifu draw). An empty deck is first replaced by the shuffled discard (L525); with
 *   both piles empty no card is taken and the Shifu still gains the Coins (B1). The card is
 *   secret like every held Order (B3). Uncapped and costless, so it is always a legal
 *   placement for an available worker (L165, the Work Phase's progress guarantee, DESIGN
 *   §3.6).
 * - **Magistrate's Hall (L252–263, change 33):** 1 space at 2–3 players, 2 at 4
 *   (capacity is the shared placement check). Both workers pay 4 Coins to advance Imperial
 *   Recognition by 1 step, only from Recognition 0, 1 or 2, so never to 4 (L261–262). No
 *   Crown requirement; the milestone reached resolves normally
 *   (`recognition.advanceRecognitionStep`, P6). The Shifu then may reserve 1 face-up Crown
 *   Order from the display (L259, R21: optional, the player names it in the placement
 *   command, `crownOrder`, from what shows then; nothing if none shows). Its position stays
 *   empty until the end of the turn, then the display is refilled as at the Commission Market
 *   (L263; `work/turn.endTurn`, with any other face-up reservation of the turn). The
 *   reservation is public, like any face-up one. Everything the choice depends on — the
 *   display, the Recognition step and its public milestone — is known when the command is
 *   made (DESIGN §1 principle 4). Senior Apprentice never applies here (R12; enforced by
 *   `validatePlacement`).
 *
 * Layer 4. Hands over through `ctx.flow.workerActionDone` (DESIGN §2.2).
 */

import { IMPERIAL_TRACK, LOCATIONS, ORDERS } from "../content.ts";
import { invariant, ruleError } from "../errors.ts";
import { addToHand, drawMainOrder, takeFaceUpOrder } from "../market.ts";
import { placeWorker, validatePlacement, workerEffectFor } from "../placement.ts";
import { advanceRecognitionStep, magistratesHallOpen } from "../recognition.ts";
import { emit, gain, player, spend } from "../state.ts";
import type {
  ActionHandlerTable,
  ActorView,
  GameAction,
  GameRuleError,
  GameState,
  PlayerId,
  PlayerState,
  ResolveContext,
  WorkerEffect,
} from "../types.ts";

type CanalWharfAction = Extract<GameAction, { type: "PLACE_CANAL_WHARF" }>;
type MagistratesHallAction = Extract<GameAction, { type: "PLACE_MAGISTRATES_HALL" }>;

// ── Canal Wharf ──────────────────────────────────────────────────────────────────────

function validateCanalWharf(view: ActorView, action: CanalWharfAction): GameRuleError | null {
  return validatePlacement(view, action.workerId, "canal_wharf", false);
}

function resolveCanalWharf(draft: GameState, playerId: PlayerId, action: CanalWharfAction, ctx: ResolveContext): void {
  const placement = placeWorker(draft, playerId, action.workerId, "canal_wharf", false, ctx);
  gain(draft, playerId, { coins: LOCATIONS.canal_wharf.effects[placement.effect].coins }, "canal_wharf", ctx);
  if (placement.effect === "shifu") {
    for (let drawn = 0; drawn < LOCATIONS.canal_wharf.effects.shifu.topMainOrders; drawn += 1) {
      const orderId = drawMainOrder(draft, ctx);
      if (orderId === null) {
        break; // B1: the deck and the discard are both empty.
      }
      addToHand(draft, playerId, orderId);
      emit(ctx, {
        type: "ORDER_RESERVED",
        playerId,
        via: "canal_wharf",
        source: "deck_top",
        slotIndex: null,
        orderId: null,
        secret: { visibleTo: playerId, orderId },
      });
    }
  }
  ctx.flow.workerActionDone(draft, playerId, ctx);
}

// ── Magistrate's Hall ────────────────────────────────────────────────────────────────

/** The top of the Imperial track (Recognition 4, Imperial Audience), which the Magistrate's
 * Hall can never reach (L256, L262). */
function topRecognition(): number {
  return Math.max(...IMPERIAL_TRACK.track.map((space) => space.space));
}

/** Recognition 0–2 only (`magistratesHallOpen`, L254), and the step never reaches 4 (L262). */
function recognitionGateError(p: PlayerState, effect: WorkerEffect): GameRuleError | null {
  const from = p.imperial.recognition;
  const steps = LOCATIONS.magistrates_hall.effects[effect].recognitionSteps;
  if (!magistratesHallOpen(p) || from + steps >= topRecognition()) {
    return ruleError(
      "RECOGNITION_GATE",
      "The Magistrate's Hall is usable only at Recognition 0–2 and never advances you to 4.",
      { recognition: from },
    );
  }
  return null;
}

/** How many face-up Crown Orders the effect may reserve (L259): 1 for the Shifu, none for
 * the Apprentice. */
function crownOrdersOf(effect: WorkerEffect): number {
  return effect === "shifu" ? LOCATIONS.magistrates_hall.effects.shifu.crownOrders : 0;
}

/**
 * The Shifu's optional Crown Order (L259, R21): the Shifu effect only, a face-up Order
 * still at the named position, showing at least 1 Crown.
 */
function crownOrderError(view: ActorView, action: MagistratesHallAction, effect: WorkerEffect): GameRuleError | null {
  const pick = action.crownOrder;
  if (pick === undefined) {
    return null;
  }
  if (crownOrdersOf(effect) < 1) {
    return ruleError("NOT_SHIFU_EFFECT", "Only the Magistrate's Hall Shifu reserves a Crown Order.", {
      workerId: action.workerId,
      effect,
      locationId: "magistrates_hall",
      field: "crownOrder",
    });
  }
  if (view.game.market.display[pick.slotIndex] !== pick.orderId) {
    return ruleError("ORDER_NOT_AVAILABLE", "That Order is no longer on the display.", {
      orderId: pick.orderId,
      slotIndex: pick.slotIndex,
      field: "crownOrder",
    });
  }
  if (ORDERS[pick.orderId].crowns < 1) {
    return ruleError("INVALID_TARGET", "The Magistrate's Hall Shifu reserves only a face-up Order that shows a Crown.", {
      reason: "no_crown",
      orderId: pick.orderId,
      slotIndex: pick.slotIndex,
      field: "crownOrder",
    });
  }
  return null;
}

function validateMagistratesHall(view: ActorView, action: MagistratesHallAction): GameRuleError | null {
  const placementError = validatePlacement(view, action.workerId, "magistrates_hall", false);
  if (placementError !== null) {
    return placementError;
  }
  const p = player(view.game, view.viewerId);
  const effect = workerEffectFor(view, action.workerId, false);
  const gate = recognitionGateError(p, effect);
  if (gate !== null) {
    return gate;
  }
  const cost = LOCATIONS.magistrates_hall.effects[effect].coins;
  if (p.resources.coins < cost) {
    return ruleError("INSUFFICIENT_RESOURCES", `Not enough coins: you need ${cost} and have ${p.resources.coins}.`, {
      resource: "coins",
      needed: cost,
      have: p.resources.coins,
    });
  }
  return crownOrderError(view, action, effect);
}

/**
 * Pay 4 Coins, advance 1 step (the milestone resolves), then the Shifu's optional Crown Order
 * (L259, R21): the face-up Order goes into the hand and its position stays empty until
 * the turn ends (`takeFaceUpOrder` sets `refillPendingFor`; `work/turn.endTurn` refills). Public:
 * `ORDER_RESERVED` via `magistrates_hall`, `face_up`.
 */
function resolveMagistratesHall(draft: GameState, playerId: PlayerId, action: MagistratesHallAction, ctx: ResolveContext): void {
  const placement = placeWorker(draft, playerId, action.workerId, "magistrates_hall", false, ctx);
  const effects = LOCATIONS.magistrates_hall.effects[placement.effect];
  invariant(recognitionGateError(player(draft, playerId), placement.effect) === null, "Magistrate's Hall gate must be validated first");
  spend(draft, playerId, { coins: effects.coins }, "magistrates_hall", ctx);
  for (let step = 0; step < effects.recognitionSteps; step += 1) {
    advanceRecognitionStep(draft, playerId, "magistrates_hall", null, ctx);
  }
  const pick = action.crownOrder;
  if (pick !== undefined) {
    invariant(crownOrdersOf(placement.effect) >= 1, "Only the Magistrate's Hall Shifu reserves a Crown Order");
    const orderId = takeFaceUpOrder(draft, playerId, pick.slotIndex);
    invariant(orderId === pick.orderId && ORDERS[orderId].crowns >= 1, `Display position ${pick.slotIndex} does not hold Crown Order ${pick.orderId}`);
    addToHand(draft, playerId, orderId);
    emit(ctx, {
      type: "ORDER_RESERVED",
      playerId,
      via: "magistrates_hall",
      source: "face_up",
      slotIndex: pick.slotIndex,
      orderId,
    });
  }
  ctx.flow.workerActionDone(draft, playerId, ctx);
}

export const handlers: Pick<ActionHandlerTable, "PLACE_CANAL_WHARF" | "PLACE_MAGISTRATES_HALL"> = {
  PLACE_CANAL_WHARF: {
    phases: ["work_turn"],
    validate: validateCanalWharf,
    resolve: resolveCanalWharf,
  },
  PLACE_MAGISTRATES_HALL: {
    phases: ["work_turn"],
    validate: validateMagistratesHall,
    resolve: resolveMagistratesHall,
  },
};
