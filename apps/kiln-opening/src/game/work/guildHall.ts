/**
 * Guild Hall incl. the private Shifu inspection and Colour Samples when acquired (L202–213, L626, B2).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P4.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "../errors.ts";
import type { ActionHandlerTable } from "../types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`work/guildHall.${name}`);
}

export const handlers: Pick<ActionHandlerTable, "PLACE_GUILD_HALL" | "GUILD_TAKE" | "COLOUR_SAMPLES_CHOOSE"> = {
  PLACE_GUILD_HALL: {
    phases: ["work_turn"],
    validate: () => notImplemented("PLACE_GUILD_HALL.validate"),
    resolve: () => notImplemented("PLACE_GUILD_HALL.resolve"),
  },
  GUILD_TAKE: {
    phases: ["work_turn"],
    validate: () => notImplemented("GUILD_TAKE.validate"),
    resolve: () => notImplemented("GUILD_TAKE.resolve"),
  },
  COLOUR_SAMPLES_CHOOSE: {
    phases: ["work_turn"],
    validate: () => notImplemented("COLOUR_SAMPLES_CHOOSE.validate"),
    resolve: () => notImplemented("COLOUR_SAMPLES_CHOOSE.resolve"),
  },
};
