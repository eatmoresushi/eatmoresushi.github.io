/**
 * Fire deck: draw, peek, bury, discard, reshuffle only when empty (L512, L639, L649, Appendix C).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P5.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "../errors.ts";
import type { FireModifier, GameState, ResolveContext } from "../types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`firing/fireDeck.${name}`);
}

export function drawFire(_draft: GameState, _ctx: ResolveContext): FireModifier {
  return notImplemented("drawFire");
}

export function peekFire(_draft: GameState, _ctx: ResolveContext): FireModifier {
  return notImplemented("peekFire");
}

export function buryTopFire(_draft: GameState): void {
  return notImplemented("buryTopFire");
}

export function discardFire(_draft: GameState, _modifier: FireModifier): void {
  return notImplemented("discardFire");
}
