/**
 * Initial state and Kiln selection (L97–111, R1).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P2.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "./errors.ts";
import type {
  ActionHandlerTable,
  CreateGameInput,
  CreateGameResult,
  RandomSource,
} from "./types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`setup.${name}`);
}

export function createInitialState(_input: CreateGameInput, _rng: RandomSource): CreateGameResult {
  return notImplemented("createInitialState");
}

export const handlers: Pick<ActionHandlerTable, "SELECT_KILN"> = {
  SELECT_KILN: {
    phases: ["setup_kiln_selection"],
    validate: () => notImplemented("SELECT_KILN.validate"),
    resolve: () => notImplemented("SELECT_KILN.resolve"),
  },
};
