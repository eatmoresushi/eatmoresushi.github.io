/**
 * Canal Barge and Imperial Priority in the before/after-action window (L292, L631, R6, R10).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P4.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "../errors.ts";
import type { ActionHandlerTable } from "../types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`work/windowAbilities.${name}`);
}

export const handlers: Pick<ActionHandlerTable, "USE_CANAL_BARGE" | "USE_IMPERIAL_PRIORITY"> = {
  USE_CANAL_BARGE: {
    phases: ["work_turn"],
    validate: () => notImplemented("USE_CANAL_BARGE.validate"),
    resolve: () => notImplemented("USE_CANAL_BARGE.resolve"),
  },
  USE_IMPERIAL_PRIORITY: {
    phases: ["work_turn"],
    validate: () => notImplemented("USE_IMPERIAL_PRIORITY.validate"),
    resolve: () => notImplemented("USE_IMPERIAL_PRIORITY.resolve"),
  },
};
