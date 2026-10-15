/**
 * Guild Hall incl. the private Shifu inspection and Colour Samples when acquired (L202–213,
 * L396, L626, L650, R4, B1, B2, B3; DESIGN §3.2 "Guild Hall").
 *
 * - Apprentice: `PLACE_GUILD_HALL{buy_face_up}` pays the printed cost, takes the face-up
 *   Tech, grants it (unlocking a personal space, L211) and refills its discipline (L209).
 * - Shifu: `PLACE_GUILD_HALL{inspect}` privately draws the top 2 Techs of any discipline, even
 *   one already owned, or as many as remain (L207, B2). `GUILD_TAKE` then takes 1 face-up
 *   Tech of any discipline or 1 inspected Tech at 1 Coin less (minimum 0), returns every
 *   untaken inspected Tech to the bottom in a private chosen order, and only then refills
 *   (B2).
 * - Legality (L212): an affordable face-up Tech from a discipline the player does not own,
 *   after the Shifu discount for the Shifu; 3 total / 1 per discipline (L210).
 * - Colour Samples (T10, L626): when acquired, look at the top 3 Main Orders (deck only, as
 *   many as remain, B1) and reserve 1 — mandatory whenever at least 1 card can be looked at
 *   (R4). No resource and no display refill (L626, L650). Its hand limit of 5 lives in
 *   `techs.handLimit`.
 *
 * Layer 4 (P4). Imports layers 0–3 only; hands over through `ctx.flow.workerActionDone`.
 */

import { DISCIPLINES, GAME_CONFIG, LOCATIONS, TECHS } from "../content.ts";
import { invariant, ruleError } from "../errors.ts";
import {
  addToHand,
  discardMainOrders,
  drawTechsForInspection,
  refillTechDisplay,
  reservable,
  returnTechsToBottom,
  takeFaceUpTech,
  takeTopMainOrders,
} from "../market.ts";
import { placeWorker, validatePlacement, workerEffectFor } from "../placement.ts";
import { emit, phaseAs, player, spend } from "../state.ts";
import { acquisitionError, grantTech, techPrice } from "../techs.ts";
import type {
  ActionHandlerTable,
  ActorView,
  GameRuleError,
  GameState,
  PlayerId,
  PlayerState,
  PublicCore,
  PublicGameState,
  ResolveContext,
  TechDiscipline,
  TechId,
  WorkerEffect,
} from "../types.ts";
import { publicCounts } from "../view.ts";

const LOCATION = "guild_hall";
const COLOUR_SAMPLES: TechId = "T10";

function publicGame(draft: GameState): PublicGameState {
  const { hidden: _hidden, ...core } = draft;
  return { ...core, counts: publicCounts(draft) };
}

/** Face-up Techs in `DISCIPLINES` order (never `techDisplay` key order, DESIGN §2.3). */
function faceUpTechs(game: PublicCore): TechId[] {
  return DISCIPLINES.flatMap((discipline) => game.techDisplay[discipline]);
}

function isFaceUp(game: PublicCore, techId: TechId): boolean {
  return game.techDisplay[TECHS[techId].discipline].includes(techId);
}

/** L212: an affordable face-up Tech from a discipline you do not own (after the Shifu discount
 * for the Shifu), within the 3-total limit (L210). */
function mainActionPossible(p: PlayerState, game: PublicCore, effect: WorkerEffect): boolean {
  return faceUpTechs(game).some(
    (techId) => acquisitionError(p, techId) === null && techPrice(techId, effect) <= p.resources.coins,
  );
}

/** Ownership limits and price for taking `techId` with `effect` (availability checked by the caller). */
function acquireError(p: PlayerState, techId: TechId, effect: WorkerEffect): GameRuleError | null {
  const limitError = acquisitionError(p, techId);
  if (limitError !== null) {
    return limitError;
  }
  const price = techPrice(techId, effect);
  if (price > p.resources.coins) {
    return ruleError("INSUFFICIENT_RESOURCES", "Not enough Coins for that Tech.", {
      resource: "coins",
      needed: price,
      have: p.resources.coins,
    });
  }
  return null;
}

function techNotAvailable(techId: TechId): GameRuleError {
  return ruleError("TECH_NOT_AVAILABLE", "That Tech is not available to take.", {
    techId,
    discipline: TECHS[techId].discipline,
  });
}

function stepError(view: ActorView, kind: "guild_inspection" | "colour_samples"): GameRuleError | null {
  const phase = view.game.phase;
  if (phase.type !== "work_turn") {
    return ruleError("WRONG_PHASE", "The Guild Hall is resolved during the Work Phase.", { phase: phase.type });
  }
  if (phase.activePlayerId !== view.viewerId) {
    return ruleError("NOT_YOUR_DECISION", "It is not your Work turn.", { playerId: view.viewerId });
  }
  if (phase.step.kind !== kind) {
    return ruleError("WRONG_PHASE", "That choice is not due now.", { phase: phase.type, step: phase.step.kind });
  }
  return null;
}

// ── Resolution ───────────────────────────────────────────────────────────────────────

/** Pays, takes and grants a Tech: `TECH_ACQUIRED`, then any `PERSONAL_SPACE_UNLOCKED` (L211). */
function acquire(
  draft: GameState,
  playerId: PlayerId,
  techId: TechId,
  source: "face_up" | "inspected",
  effect: WorkerEffect,
  ctx: ResolveContext,
): void {
  const price = techPrice(techId, effect);
  spend(draft, playerId, { coins: price }, "guild_hall", ctx);
  if (source === "face_up") {
    takeFaceUpTech(draft, techId);
  }
  emit(ctx, { type: "TECH_ACQUIRED", playerId, techId, source, cost: price });
  grantTech(draft, playerId, techId, ctx);
}

/** Refills each listed discipline whose display is short, in `DISCIPLINES` order (L209, L513). */
function refillShort(draft: GameState, disciplines: readonly TechDiscipline[], ctx: ResolveContext): void {
  for (const discipline of DISCIPLINES) {
    if (disciplines.includes(discipline) && draft.techDisplay[discipline].length < GAME_CONFIG.techs.faceUpPerDiscipline) {
      refillTechDisplay(draft, discipline, ctx);
    }
  }
}

/** When-acquired effects (L213), then the end of the worker action. */
function afterAcquired(draft: GameState, playerId: PlayerId, techId: TechId, ctx: ResolveContext): void {
  if (techId === COLOUR_SAMPLES && reservable(publicGame(draft)).look) {
    const orderIds = takeTopMainOrders(draft, TECHS.T10.params.lookSize, ctx);
    if (orderIds.length > 0) {
      draft.hidden.pendingLook = { kind: "colour_samples", playerId, orderIds: [...orderIds] };
      emit(ctx, {
        type: "PRIVATE_LOOK_OPENED",
        playerId,
        kind: "colour_samples",
        discipline: null,
        count: orderIds.length,
        secret: { visibleTo: playerId, orderIds: [...orderIds], techIds: [] },
      });
      phaseAs(draft, "work_turn").step = { kind: "colour_samples", lookedCount: orderIds.length };
      return;
    }
  }
  ctx.flow.workerActionDone(draft, playerId, ctx);
}

function activePhase(draft: GameState, playerId: PlayerId): Extract<GameState["phase"], { type: "work_turn" }> {
  const phase = phaseAs(draft, "work_turn");
  invariant(phase.activePlayerId === playerId, `${playerId} is not the active player`);
  return phase;
}

// ── Handlers ─────────────────────────────────────────────────────────────────────────

export const handlers: Pick<ActionHandlerTable, "PLACE_GUILD_HALL" | "GUILD_TAKE" | "COLOUR_SAMPLES_CHOOSE"> = {
  PLACE_GUILD_HALL: {
    phases: ["work_turn"],
    validate: (view, action) => {
      const placementError = validatePlacement(view, action.workerId, LOCATION, false);
      if (placementError !== null) {
        return placementError;
      }
      const effect = workerEffectFor(view, action.workerId, false);
      const p = player(view.game, view.viewerId);
      if (!mainActionPossible(p, view.game, effect)) {
        return ruleError("NO_MAIN_ACTION_POSSIBLE", "You cannot afford a face-up Tech from a discipline you do not own.", {
          locationId: LOCATION,
          workerId: action.workerId,
          effect,
        });
      }
      const choice = action.choice;
      switch (choice.kind) {
        case "buy_face_up":
          if (effect !== "apprentice") {
            return ruleError("INVALID_CHOICE", "The Shifu inspects a Tech deck instead of buying directly.", {
              choice: choice.kind,
              effect,
            });
          }
          if (!isFaceUp(view.game, choice.techId)) {
            return techNotAvailable(choice.techId);
          }
          return acquireError(p, choice.techId, effect);
        case "inspect":
          // Any discipline, including one already owned (B2), even with fewer than 2 cards left.
          return effect === "shifu"
            ? null
            : ruleError("INVALID_CHOICE", "Only the Shifu inspects a Tech deck.", { choice: choice.kind, effect });
        default: {
          const unknown: never = choice;
          return ruleError("MALFORMED_ACTION", "Unknown Guild Hall choice.", { field: "choice", value: String(unknown) });
        }
      }
    },
    resolve: (draft, actorId, action, ctx) => {
      const placement = placeWorker(draft, actorId, action.workerId, LOCATION, false, ctx);
      const choice = action.choice;
      if (choice.kind === "buy_face_up") {
        acquire(draft, actorId, choice.techId, "face_up", placement.effect, ctx);
        refillShort(draft, [TECHS[choice.techId].discipline], ctx);
        afterAcquired(draft, actorId, choice.techId, ctx);
        return;
      }
      const techIds = drawTechsForInspection(draft, choice.discipline, LOCATIONS.guild_hall.effects.shifu.inspectCount);
      draft.hidden.pendingLook = { kind: "guild_inspection", playerId: actorId, discipline: choice.discipline, techIds: [...techIds] };
      emit(ctx, {
        type: "PRIVATE_LOOK_OPENED",
        playerId: actorId,
        kind: "guild_inspection",
        discipline: choice.discipline,
        count: techIds.length,
        secret: { visibleTo: actorId, orderIds: [], techIds: [...techIds] },
      });
      activePhase(draft, actorId).step = {
        kind: "guild_inspection",
        workerId: action.workerId,
        discipline: choice.discipline,
        inspectedCount: techIds.length,
      };
    },
  },
  GUILD_TAKE: {
    phases: ["work_turn"],
    validate: (view, action) => {
      const error = stepError(view, "guild_inspection");
      if (error !== null) {
        return error;
      }
      const look = view.own.pendingLook;
      if (look === null || look.kind !== "guild_inspection") {
        return ruleError("INVALID_CHOICE", "No Guild Hall inspection is pending.", { choice: "guild_take" });
      }
      const take = action.take;
      const available = take.kind === "inspected" ? look.techIds.includes(take.techId) : isFaceUp(view.game, take.techId);
      if (!available) {
        return techNotAvailable(take.techId);
      }
      const takeError = acquireError(player(view.game, view.viewerId), take.techId, "shifu");
      if (takeError !== null) {
        return takeError;
      }
      const untaken = look.techIds.filter((techId) => !(take.kind === "inspected" && techId === take.techId));
      const given = action.bottomOrder;
      const permutation =
        given.length === untaken.length &&
        new Set(given).size === given.length &&
        given.every((techId) => untaken.includes(techId));
      if (!permutation) {
        return ruleError(
          "INVALID_BOTTOM_ORDER",
          "Put every untaken inspected Tech on the bottom exactly once, in the order you choose.",
          { expected: untaken.length, given: given.length },
        );
      }
      return null;
    },
    resolve: (draft, actorId, action, ctx) => {
      activePhase(draft, actorId);
      const look = draft.hidden.pendingLook;
      invariant(
        look !== null && look.kind === "guild_inspection" && look.playerId === actorId,
        "No Guild Hall inspection is pending for the actor",
      );
      const take = action.take;
      draft.hidden.pendingLook = null;
      acquire(draft, actorId, take.techId, take.kind, "shifu", ctx);
      // B2: the untaken inspected Techs go to the bottom first, in the chosen private order …
      if (action.bottomOrder.length > 0) {
        returnTechsToBottom(draft, look.discipline, action.bottomOrder);
        emit(ctx, {
          type: "TECHS_RETURNED_TO_BOTTOM",
          playerId: actorId,
          discipline: look.discipline,
          count: action.bottomOrder.length,
          secret: { visibleTo: actorId, techIds: [...action.bottomOrder] },
        });
      }
      // … then the display refills (L209).
      refillShort(draft, [TECHS[take.techId].discipline, look.discipline], ctx);
      afterAcquired(draft, actorId, take.techId, ctx);
    },
  },
  COLOUR_SAMPLES_CHOOSE: {
    phases: ["work_turn"],
    validate: (view, action) => {
      const error = stepError(view, "colour_samples");
      if (error !== null) {
        return error;
      }
      const look = view.own.pendingLook;
      if (look === null || look.kind !== "colour_samples" || !look.orderIds.includes(action.orderId)) {
        return ruleError("INVALID_CHOICE", "Choose one of the Orders you looked at.", { orderId: action.orderId });
      }
      return null;
    },
    resolve: (draft, actorId, action, ctx) => {
      activePhase(draft, actorId);
      const look = draft.hidden.pendingLook;
      invariant(
        look !== null && look.kind === "colour_samples" && look.playerId === actorId,
        "No Colour Samples look is pending for the actor",
      );
      const rest = look.orderIds.filter((orderId) => orderId !== action.orderId);
      draft.hidden.pendingLook = null;
      addToHand(draft, actorId, action.orderId);
      emit(ctx, {
        type: "ORDER_RESERVED",
        playerId: actorId,
        via: "colour_samples",
        source: "colour_samples",
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
      // No resource and no display refill (L626, L650).
      ctx.flow.workerActionDone(draft, actorId, ctx);
    },
  },
};
