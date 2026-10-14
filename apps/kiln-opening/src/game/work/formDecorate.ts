/**
 * Form & Decorate incl. Shifu discount, Large Throwing Wheel, Decorator's Kit and Ding (L166–172, L332–339, L473, L615–616, L652).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P3.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "../errors.ts";
import type {
  ActionHandlerTable,
  ActorView,
  CostQuote,
  GameAction,
  PlayerId,
  PublicCore,
} from "../types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`work/formDecorate.${name}`);
}

export function quoteFormDecorate(_view: ActorView, _action: Extract<GameAction, { type: "PLACE_FORM_DECORATE" }>): CostQuote {
  return notImplemented("quoteFormDecorate");
}

export function canFormAny(_game: PublicCore, _playerId: PlayerId): boolean {
  return notImplemented("canFormAny");
}

export const handlers: Pick<ActionHandlerTable, "PLACE_FORM_DECORATE"> = {
  PLACE_FORM_DECORATE: {
    phases: ["work_turn"],
    validate: () => notImplemented("PLACE_FORM_DECORATE.validate"),
    resolve: () => notImplemented("PLACE_FORM_DECORATE.resolve"),
  },
};
