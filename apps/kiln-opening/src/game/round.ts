/**
 * Start of Round, Setter's Mark window and Cleanup (L124–132, L301–305, L630). Package P2,
 * layer 4.
 *
 * Start of Round (L118, L126–132), all automatic (DESIGN §3.7):
 *   `ROUND_STARTED` → Kiln Die (`KILN_DIE_ROLLED`, every round incl. Round 1, public, INT)
 *   → Rounds 2–5: rotate the Main display (`MAIN_DISPLAY_ROTATED`, `DISPLAY_REFILLED`)
 *   → refill the Tech displays (idempotent; silent when nothing is revealed)
 *   → ready once-per-round abilities (`ABILITIES_READIED`)
 *   → Setter's Mark window in First Player order, only when someone can place one (T22, L630,
 *     optional per INT) → `round_start_done`.
 *
 * Cleanup (L303–305):
 *   return workers and Setter's Marks (`WORKERS_RETURNED`, `SETTERS_MARK_RETURNED`)
 *   → Rounds 1–4: players above their hand limit (4, or 5 with Colour Samples) trim in any
 *     order (`cleanup_hand_limit`, parallel); Round 5 skips the trim (INT)
 *   → Rounds 1–4: pass the First Player clockwise, advance the round → `cleanup_done`;
 *     Round 5: `game_over`.
 *
 * Phase between steps: while Start of Round runs (and after the last Kiln choice) the phase
 * is `round_start_setters_mark` with an empty queue unless a Setter's Mark decision is
 * pending; while Cleanup runs it is `cleanup_hand_limit` with no pending players unless a
 * trim is pending. The next opener replaces it inside the same command, so with the
 * production flow neither empty window is ever persisted (DESIGN §3.6).
 */

import { DISCIPLINES, FIRING, GAME_CONFIG, KILN_SPACE_IDS, isStartingOrderId } from "./content.ts";
import { invariant, ruleError } from "./errors.ts";
import { discardMainOrders, refillTechDisplay, removeFromHand, rotateMainDisplay } from "./market.ts";
import { rollDie } from "./rng.ts";
import { emit, lookup, nextClockwise, phaseAs, player, turnOrder } from "./state.ts";
import { handLimit, markTechUsed, ownsTech, readyAllAbilities, techReady } from "./techs.ts";
import type {
  ActionHandlerTable,
  GameState,
  KilnSpaceId,
  MainOrderId,
  OrderId,
  PlayerId,
  PublicCore,
  ResolveContext,
  RoundNumber,
  StartingOrderId,
  TechId,
} from "./types.ts";

const SETTERS_MARK: TechId = "T22";

// ── Setter's Mark (T22, L630) ────────────────────────────────────────────────────────

/** Where a Setter's Mark may go now: empty, active, unmarked Shared Kiln spaces, in
 * `KILN_SPACE_IDS` order (L630). */
export function settersMarkSpaces(game: PublicCore): KilnSpaceId[] {
  return KILN_SPACE_IDS.filter((spaceId) => {
    const space = game.sharedKiln.spaces[spaceId];
    return space.active && space.ceramicIds.length === 0 && space.setterMarkOwnerId === null;
  });
}

/** May this player place a Setter's Mark now: T22 owned and ready, and a space is open. */
function canPlaceSettersMark(game: PublicCore, playerId: PlayerId): boolean {
  return techReady(player(game, playerId), SETTERS_MARK) && settersMarkSpaces(game).length > 0;
}

/** Advances the Setter's Mark queue past players with nothing to decide; hands over
 * `round_start_done` when it is exhausted. */
function continueSettersMarkWindow(draft: GameState, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "round_start_setters_mark");
  const queue = phase.queue;
  while (queue.index < queue.actorIds.length && !canPlaceSettersMark(draft, queue.actorIds[queue.index] as PlayerId)) {
    queue.index += 1;
  }
  if (queue.index >= queue.actorIds.length) {
    ctx.flow.continueAfter("round_start_done", draft, ctx);
  }
}

// ── Start of Round (L124–132) ────────────────────────────────────────────────────────

/** The automatic Start of Round, then the Setter's Mark window when someone can use it. */
export function startRound(draft: GameState, ctx: ResolveContext): void {
  const round = draft.round;
  emit(ctx, { type: "ROUND_STARTED", round, firstPlayerId: draft.firstPlayerId });

  // L126, INT: a public roll every round, Round 1 included.
  const value = rollDie(FIRING.kilnDie.faces, ctx.rng);
  draft.kilnDie = { round, value };
  emit(ctx, { type: "KILN_DIE_ROLLED", round, value });

  // L128–130 (B1): Rounds 2–5 only.
  if (round > 1) {
    rotateMainDisplay(draft, ctx);
  }
  // L118 "refill displays": Tech displays refill right after each take (L210); re-running
  // the refill here only matters if a display was left short.
  for (const discipline of DISCIPLINES) {
    refillTechDisplay(draft, discipline, ctx);
  }

  // L132.
  readyAllAbilities(draft);
  emit(ctx, { type: "ABILITIES_READIED", round });

  // L630: at the start of the Work Phase, in First Player order.
  const actorIds = turnOrder(draft).filter((playerId) => ownsTech(player(draft, playerId), SETTERS_MARK));
  draft.phase = { type: "round_start_setters_mark", queue: { actorIds, index: 0 } };
  continueSettersMarkWindow(draft, ctx);
}

// ── Cleanup (L301–305) ───────────────────────────────────────────────────────────────

/** The last round (L490): Cleanup skips the hand-limit trim (INT) and the game ends. Shared
 * with `handLimitStatus(...).trimDue`, so the UI and Cleanup use one predicate. */
export function isFinalRound(round: RoundNumber): boolean {
  return round >= GAME_CONFIG.rounds;
}

function handOf(draft: GameState, playerId: PlayerId): OrderId[] {
  return lookup(draft.hidden.orderHands, playerId) ?? [];
}

/** Cleanup step 3 (L305). */
function finishCleanup(draft: GameState, ctx: ResolveContext): void {
  if (isFinalRound(draft.round)) {
    ctx.flow.continueAfter("game_over", draft, ctx);
    return;
  }
  const from = draft.firstPlayerId;
  const to = nextClockwise(draft, from);
  draft.firstPlayerId = to;
  emit(ctx, { type: "FIRST_PLAYER_PASSED", from, to });
  draft.round = (draft.round + 1) as RoundNumber;
  ctx.flow.continueAfter("cleanup_done", draft, ctx);
}

/** Cleanup steps 1–2 (L303–304); step 3 follows at once unless someone must trim. */
export function openCleanup(draft: GameState, ctx: ResolveContext): void {
  // Step 1: workers (the placement record is the only occupancy record) and Setter's Marks.
  for (const playerId of draft.playerOrder) {
    for (const worker of Object.values(player(draft, playerId).workers)) {
      worker.placement = null;
    }
  }
  draft.placementSequence = 0;
  emit(ctx, { type: "WORKERS_RETURNED", round: draft.round });
  for (const spaceId of KILN_SPACE_IDS) {
    const space = draft.sharedKiln.spaces[spaceId];
    const ownerId = space.setterMarkOwnerId;
    if (ownerId !== null) {
      space.setterMarkOwnerId = null;
      emit(ctx, { type: "SETTERS_MARK_RETURNED", playerId: ownerId, spaceId, cause: "cleanup" });
    }
  }

  // Step 2, Rounds 1–4 only (INT: the Round 5 trim has no scoring effect and is skipped).
  const pendingPlayerIds = isFinalRound(draft.round)
    ? []
    : turnOrder(draft).filter((playerId) => handOf(draft, playerId).length > handLimit(player(draft, playerId)));
  draft.phase = { type: "cleanup_hand_limit", pendingPlayerIds, openedAtRevision: draft.revision + 1 };
  if (pendingPlayerIds.length === 0) {
    finishCleanup(draft, ctx);
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────────────

export const handlers: Pick<ActionHandlerTable, "PLACE_SETTERS_MARK" | "DISCARD_TO_HAND_LIMIT"> = {
  PLACE_SETTERS_MARK: {
    phases: ["round_start_setters_mark"],
    /** `null` declines (INT: optional; declining keeps the once-per-round use, R4). */
    validate(view, action) {
      if (action.spaceId === null) {
        return null;
      }
      const p = player(view.game, view.viewerId);
      if (!ownsTech(p, SETTERS_MARK)) {
        return ruleError("TECH_NOT_OWNED", "You do not own Setter's Mark.", { techId: SETTERS_MARK });
      }
      if (!techReady(p, SETTERS_MARK)) {
        return ruleError("TECH_ALREADY_USED", "Setter's Mark has already been used this round.", { techId: SETTERS_MARK });
      }
      const space = lookup(view.game.sharedKiln.spaces, action.spaceId);
      if (space === undefined || !space.active || space.ceramicIds.length > 0) {
        return ruleError("KILN_SPACE_UNAVAILABLE", "A Setter's Mark goes on an empty active Shared Kiln space.", {
          spaceId: action.spaceId,
        });
      }
      if (space.setterMarkOwnerId !== null) {
        return ruleError("KILN_SPACE_MARKED", "Another Setter's Mark already holds this space.", {
          spaceId: action.spaceId,
          ownerId: space.setterMarkOwnerId,
        });
      }
      return null;
    },
    resolve(draft, actorId, action, ctx) {
      const phase = phaseAs(draft, "round_start_setters_mark");
      invariant(phase.queue.actorIds[phase.queue.index] === actorId, `${actorId} is not placing a Setter's Mark now`);
      if (action.spaceId !== null) {
        draft.sharedKiln.spaces[action.spaceId].setterMarkOwnerId = actorId;
        emit(ctx, { type: "SETTERS_MARK_PLACED", playerId: actorId, spaceId: action.spaceId });
        markTechUsed(draft, actorId, SETTERS_MARK, ctx);
      } else {
        emit(ctx, { type: "SETTERS_MARK_PLACED", playerId: actorId, spaceId: null });
      }
      phase.queue.index += 1;
      continueSettersMarkWindow(draft, ctx);
    },
  },

  DISCARD_TO_HAND_LIMIT: {
    phases: ["cleanup_hand_limit"],
    /** Exactly `hand − limit` distinct held Orders (L304). */
    validate(view, action) {
      const hand = view.own.orderHand;
      const limit = handLimit(player(view.game, view.viewerId));
      const seen = new Set<OrderId>();
      for (const orderId of action.orderIds) {
        if (seen.has(orderId)) {
          return ruleError("INVALID_CHOICE", "Each Order can be discarded only once.", { field: "orderIds", orderId });
        }
        seen.add(orderId);
        if (!hand.includes(orderId)) {
          return ruleError("ORDER_NOT_HELD", "You can discard only Orders in your hand.", { orderId });
        }
      }
      const needed = Math.max(0, hand.length - limit);
      if (action.orderIds.length !== needed) {
        const noun = needed === 1 ? "Order" : "Orders";
        return ruleError("HAND_LIMIT_DISCARD_COUNT", `Discard exactly ${needed} ${noun} to reach your hand limit of ${limit}.`, {
          limit,
          needed,
          held: hand.length,
          given: action.orderIds.length,
        });
      }
      return null;
    },
    /** Starting Orders return to the box; Main Orders go face down to the discard (L304, B3). */
    resolve(draft, actorId, action, ctx) {
      const phase = phaseAs(draft, "cleanup_hand_limit");
      invariant(phase.pendingPlayerIds.includes(actorId), `${actorId} has no hand to trim`);
      const main: MainOrderId[] = [];
      for (const orderId of action.orderIds) {
        removeFromHand(draft, actorId, orderId);
        if (isStartingOrderId(orderId)) {
          draft.hidden.startingBox.push(orderId as StartingOrderId);
        } else {
          main.push(orderId as MainOrderId);
        }
      }
      discardMainOrders(draft, main);
      emit(ctx, {
        type: "HAND_TRIMMED",
        playerId: actorId,
        count: action.orderIds.length,
        secret: { visibleTo: actorId, orderIds: [...action.orderIds] },
      });
      phase.pendingPlayerIds = phase.pendingPlayerIds.filter((playerId) => playerId !== actorId);
      if (phase.pendingPlayerIds.length === 0) {
        finishCleanup(draft, ctx);
      }
    },
  },
};
