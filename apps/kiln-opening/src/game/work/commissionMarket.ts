/**
 * Commission Market incl. Senior Apprentice and the Shifu top-3 (L186–200, R12, B1, B3).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P4.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "../errors.ts";
import type { ActionHandlerTable } from "../types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`work/commissionMarket.${name}`);
}

export const handlers: Pick<ActionHandlerTable, "PLACE_COMMISSION_MARKET" | "COMMISSION_RESERVE" | "COMMISSION_CHOOSE_LOOKED" | "COMMISSION_GAIN" | "COMMISSION_STOP"> = {
  PLACE_COMMISSION_MARKET: {
    phases: ["work_turn"],
    validate: () => notImplemented("PLACE_COMMISSION_MARKET.validate"),
    resolve: () => notImplemented("PLACE_COMMISSION_MARKET.resolve"),
  },
  COMMISSION_RESERVE: {
    phases: ["work_turn"],
    validate: () => notImplemented("COMMISSION_RESERVE.validate"),
    resolve: () => notImplemented("COMMISSION_RESERVE.resolve"),
  },
  COMMISSION_CHOOSE_LOOKED: {
    phases: ["work_turn"],
    validate: () => notImplemented("COMMISSION_CHOOSE_LOOKED.validate"),
    resolve: () => notImplemented("COMMISSION_CHOOSE_LOOKED.resolve"),
  },
  COMMISSION_GAIN: {
    phases: ["work_turn"],
    validate: () => notImplemented("COMMISSION_GAIN.validate"),
    resolve: () => notImplemented("COMMISSION_GAIN.resolve"),
  },
  COMMISSION_STOP: {
    phases: ["work_turn"],
    validate: () => notImplemented("COMMISSION_STOP.validate"),
    resolve: () => notImplemented("COMMISSION_STOP.resolve"),
  },
};
