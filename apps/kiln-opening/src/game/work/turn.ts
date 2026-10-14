/**
 * Work Phase, turns, before/after-action window, END_TURN and the deferred refill (L133–143, L190, L390).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P4.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "../errors.ts";
import type {
  ActionHandlerTable,
  GameState,
  PlayerId,
  PublicCore,
  ResolveContext,
} from "../types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`work/turn.${name}`);
}

export function openWorkPhase(_draft: GameState, _ctx: ResolveContext): void {
  return notImplemented("openWorkPhase");
}

export function completeWorkerAction(_draft: GameState, _playerId: PlayerId, _ctx: ResolveContext): void {
  return notImplemented("completeWorkerAction");
}

export function afterActionWindowOpen(_game: PublicCore, _playerId: PlayerId): boolean {
  return notImplemented("afterActionWindowOpen");
}

export function imperialPriorityUsable(_game: PublicCore, _playerId: PlayerId): boolean {
  return notImplemented("imperialPriorityUsable");
}

export function afterWindowAbilityUsed(_draft: GameState, _playerId: PlayerId, _ctx: ResolveContext): void {
  return notImplemented("afterWindowAbilityUsed");
}

export function endTurn(_draft: GameState, _playerId: PlayerId, _automatic: boolean, _ctx: ResolveContext): void {
  return notImplemented("endTurn");
}

export const handlers: Pick<ActionHandlerTable, "END_TURN"> = {
  END_TURN: {
    phases: ["work_turn"],
    validate: () => notImplemented("END_TURN.validate"),
    resolve: () => notImplemented("END_TURN.resolve"),
  },
};
