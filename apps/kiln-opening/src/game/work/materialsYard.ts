/**
 * Materials Yard incl. Senior Apprentice and Prepared Clay (L159–162, L618–619).
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
} from "../types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`work/materialsYard.${name}`);
}

export function quoteMaterialsYard(_view: ActorView, _action: Extract<GameAction, { type: "PLACE_MATERIALS_YARD" }>): CostQuote {
  return notImplemented("quoteMaterialsYard");
}

export const handlers: Pick<ActionHandlerTable, "PLACE_MATERIALS_YARD"> = {
  PLACE_MATERIALS_YARD: {
    phases: ["work_turn"],
    validate: () => notImplemented("PLACE_MATERIALS_YARD.validate"),
    resolve: () => notImplemented("PLACE_MATERIALS_YARD.resolve"),
  },
};
