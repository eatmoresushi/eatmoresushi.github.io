/**
 * Legal-action enumerator, sampler and legal commands (DESIGN §5.2–5.3).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P7.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "./errors.ts";
import type {
  AuthoritativeCommand,
  GameAction,
  GameActionType,
  LegalActionOptions,
  PlayerView,
  RandomSource,
} from "./types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`legalActions.${name}`);
}

export function legalActions(_view: PlayerView, _opts: LegalActionOptions): GameAction[] {
  return notImplemented("legalActions");
}

export function enumerateLegalActions(_view: PlayerView, _opts: LegalActionOptions): Generator<GameAction> {
  return notImplemented("enumerateLegalActions");
}

export function legalCommands(_view: PlayerView, _opts: LegalActionOptions): AuthoritativeCommand[] {
  return notImplemented("legalCommands");
}

export function sampleLegalAction(_view: PlayerView, _chooser: RandomSource): GameAction {
  return notImplemented("sampleLegalAction");
}

export function legalActionFamilies(_view: PlayerView): GameActionType[] {
  return notImplemented("legalActionFamilies");
}
