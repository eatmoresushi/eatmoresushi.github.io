/**
 * Order Phase: a single pass in First Player order (L294–296, INT).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P6.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "../errors.ts";
import type { ActionHandlerTable, GameState, ResolveContext } from "../types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`orders/phase.${name}`);
}

export function openOrderPhase(_draft: GameState, _ctx: ResolveContext): void {
  return notImplemented("openOrderPhase");
}

export const handlers: Pick<ActionHandlerTable, "COMPLETE_ORDER" | "END_ORDER_TURN"> = {
  COMPLETE_ORDER: {
    phases: ["orders"],
    validate: () => notImplemented("COMPLETE_ORDER.validate"),
    resolve: () => notImplemented("COMPLETE_ORDER.resolve"),
  },
  END_ORDER_TURN: {
    phases: ["orders"],
    validate: () => notImplemented("END_ORDER_TURN.validate"),
    resolve: () => notImplemented("END_ORDER_TURN.resolve"),
  },
};
