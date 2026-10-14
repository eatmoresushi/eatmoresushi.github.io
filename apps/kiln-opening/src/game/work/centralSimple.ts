/**
 * Canal Wharf and Magistrate's Hall (L215–232).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P3.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "../errors.ts";
import type { ActionHandlerTable } from "../types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`work/centralSimple.${name}`);
}

export const handlers: Pick<ActionHandlerTable, "PLACE_CANAL_WHARF" | "PLACE_MAGISTRATES_HALL"> = {
  PLACE_CANAL_WHARF: {
    phases: ["work_turn"],
    validate: () => notImplemented("PLACE_CANAL_WHARF.validate"),
    resolve: () => notImplemented("PLACE_CANAL_WHARF.resolve"),
  },
  PLACE_MAGISTRATES_HALL: {
    phases: ["work_turn"],
    validate: () => notImplemented("PLACE_MAGISTRATES_HALL.validate"),
    resolve: () => notImplemented("PLACE_MAGISTRATES_HALL.resolve"),
  },
};
