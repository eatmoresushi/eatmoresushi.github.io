/**
 * Completing one Order (Order Phase and Canal Barge) incl. Ru, Guan and Tribute Ware (L409–418, L459–463, L642, R6, R13).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P6.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "../errors.ts";
import type {
  ActorView,
  CompletedOrderRecord,
  GameRuleError,
  GameState,
  OrderCompletionSpec,
  OrderId,
  PlayerId,
  PublicCore,
  ResolveContext,
} from "../types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`orders/completion.${name}`);
}

export function validateOrderCompletion(_view: ActorView, _spec: OrderCompletionSpec): GameRuleError | null {
  return notImplemented("validateOrderCompletion");
}

export function resolveOrderCompletion(
  _draft: GameState,
  _playerId: PlayerId,
  _spec: OrderCompletionSpec,
  _via: CompletedOrderRecord["via"],
  _ctx: ResolveContext,
): CompletedOrderRecord {
  return notImplemented("resolveOrderCompletion");
}

export function completableOrderIds(_game: PublicCore, _playerId: PlayerId, _hand: readonly OrderId[]): OrderId[] {
  return notImplemented("completableOrderIds");
}
