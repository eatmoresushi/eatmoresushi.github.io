/**
 * Final scoring, tie-breakers and score preview (L487–498).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P6.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "./errors.ts";
import type {
  FinalResult,
  GameState,
  PlayerId,
  PublicCore,
  ResolveContext,
  ScorePreview,
} from "./types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`scoring.${name}`);
}

export function computeFinalResult(_game: PublicCore): FinalResult {
  return notImplemented("computeFinalResult");
}

export function scorePreview(_game: PublicCore, _playerId: PlayerId): ScorePreview {
  return notImplemented("scorePreview");
}

export function finishGame(_draft: GameState, _ctx: ResolveContext): void {
  return notImplemented("finishGame");
}
