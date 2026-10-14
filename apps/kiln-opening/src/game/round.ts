/**
 * Start of Round, Setter's Mark window and Cleanup (L123–131, L300–304, L630).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P2.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "./errors.ts";
import type { ActionHandlerTable, GameState, ResolveContext } from "./types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`round.${name}`);
}

export function startRound(_draft: GameState, _ctx: ResolveContext): void {
  return notImplemented("startRound");
}

export function openCleanup(_draft: GameState, _ctx: ResolveContext): void {
  return notImplemented("openCleanup");
}

export const handlers: Pick<ActionHandlerTable, "PLACE_SETTERS_MARK" | "DISCARD_TO_HAND_LIMIT"> = {
  PLACE_SETTERS_MARK: {
    phases: ["round_start_setters_mark"],
    validate: () => notImplemented("PLACE_SETTERS_MARK.validate"),
    resolve: () => notImplemented("PLACE_SETTERS_MARK.resolve"),
  },
  DISCARD_TO_HAND_LIMIT: {
    phases: ["cleanup_hand_limit"],
    validate: () => notImplemented("DISCARD_TO_HAND_LIMIT.validate"),
    resolve: () => notImplemented("DISCARD_TO_HAND_LIMIT.resolve"),
  },
};
