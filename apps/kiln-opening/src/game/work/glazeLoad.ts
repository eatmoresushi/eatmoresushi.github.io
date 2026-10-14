/**
 * Glaze & Load incl. Heat-marker placement and Kiln Tending (L176–184, L627, R9).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P3.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "../errors.ts";
import type { ActionHandlerTable } from "../types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`work/glazeLoad.${name}`);
}

export const handlers: Pick<ActionHandlerTable, "PLACE_GLAZE_LOAD"> = {
  PLACE_GLAZE_LOAD: {
    phases: ["work_turn"],
    validate: () => notImplemented("PLACE_GLAZE_LOAD.validate"),
    resolve: () => notImplemented("PLACE_GLAZE_LOAD.resolve"),
  },
};
