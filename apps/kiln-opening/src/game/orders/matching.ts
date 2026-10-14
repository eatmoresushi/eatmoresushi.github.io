/**
 * Pure Order matcher incl. Crackle wildcards (L409–422, L469, R6).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P6.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "../errors.ts";
import type {
  CeramicId,
  CrackleDeclaration,
  FinishedCeramic,
  OrderDefinition,
} from "../types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`orders/matching.${name}`);
}

/** One way a set of ceramics satisfies an Order, with the Crackle declarations used. */
export interface OrderMatch {
  ceramicIds: CeramicId[];
  crackleDeclarations: CrackleDeclaration[];
}

export function matchOrder(
  _order: OrderDefinition,
  _ceramics: readonly FinishedCeramic[],
  _declared?: readonly CrackleDeclaration[],
): OrderMatch | null {
  return notImplemented("matchOrder");
}

export function findOrderMatches(_order: OrderDefinition, _pool: readonly FinishedCeramic[], _limit?: number): OrderMatch[] {
  return notImplemented("findOrderMatches");
}

export function ruTriggers(_ceramics: readonly FinishedCeramic[]): boolean {
  return notImplemented("ruTriggers");
}
