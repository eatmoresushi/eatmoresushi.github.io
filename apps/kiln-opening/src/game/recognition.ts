/**
 * Crowns, Recognition steps, milestones and overflow VP (L424–439, R13).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P6.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "./errors.ts";
import type {
  GameEvent,
  GameState,
  OrderId,
  PlayerId,
  PlayerState,
  ResolveContext,
} from "./types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`recognition.${name}`);
}

/** Where a Crown comes from (`CROWN_OVERFLOW_VP.source`). */
export type CrownSource = Extract<GameEvent, { type: "CROWN_OVERFLOW_VP" }>["source"];
/** Where a Recognition step comes from (`RECOGNITION_ADVANCED.source`). */
export type RecognitionSource = Extract<GameEvent, { type: "RECOGNITION_ADVANCED" }>["source"];

export function gainCrown(
  _draft: GameState,
  _playerId: PlayerId,
  _source: CrownSource,
  _orderId: OrderId | null,
  _ctx: ResolveContext,
): void {
  return notImplemented("gainCrown");
}

export function advanceRecognitionStep(
  _draft: GameState,
  _playerId: PlayerId,
  _source: RecognitionSource,
  _orderId: OrderId | null,
  _ctx: ResolveContext,
): void {
  return notImplemented("advanceRecognitionStep");
}

export function magistratesHallOpen(_player: PlayerState): boolean {
  return notImplemented("magistratesHallOpen");
}
