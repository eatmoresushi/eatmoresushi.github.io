/**
 * Main Order deck, display and face-down discard; Tech decks and displays (L127–129, L186–213, L386–390, L511–513, B1–B3).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P2.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "./errors.ts";
import type {
  GameEvent,
  GameState,
  OrderId,
  PlayerId,
  PublicGameState,
  ResolveContext,
  TechDiscipline,
  TechId,
} from "./types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`market.${name}`);
}

/** `DISPLAY_REFILLED.cause`. */
export type MainDisplayRefillCause = Extract<GameEvent, { type: "DISPLAY_REFILLED" }>["cause"];

export function drawMainOrder(_draft: GameState, _ctx: ResolveContext): OrderId | null {
  return notImplemented("drawMainOrder");
}

export function takeTopMainOrders(_draft: GameState, _max: number, _ctx: ResolveContext): OrderId[] {
  return notImplemented("takeTopMainOrders");
}

export function discardMainOrders(_draft: GameState, _ids: readonly OrderId[]): void {
  return notImplemented("discardMainOrders");
}

export function takeFaceUpOrder(_draft: GameState, _playerId: PlayerId, _slotIndex: number): OrderId {
  return notImplemented("takeFaceUpOrder");
}

export function refillMainDisplay(_draft: GameState, _cause: MainDisplayRefillCause, _ctx: ResolveContext): void {
  return notImplemented("refillMainDisplay");
}

export function rotateMainDisplay(_draft: GameState, _ctx: ResolveContext): void {
  return notImplemented("rotateMainDisplay");
}

export function addToHand(_draft: GameState, _playerId: PlayerId, _orderId: OrderId): void {
  return notImplemented("addToHand");
}

export function removeFromHand(_draft: GameState, _playerId: PlayerId, _orderId: OrderId): void {
  return notImplemented("removeFromHand");
}

export function reservable(_game: PublicGameState): { faceUpSlots: number[]; blind: boolean; look: boolean } {
  return notImplemented("reservable");
}

export function drawTechsForInspection(_draft: GameState, _discipline: TechDiscipline, _count: number): TechId[] {
  return notImplemented("drawTechsForInspection");
}

export function returnTechsToBottom(_draft: GameState, _discipline: TechDiscipline, _ids: readonly TechId[]): void {
  return notImplemented("returnTechsToBottom");
}

export function takeFaceUpTech(_draft: GameState, _techId: TechId): void {
  return notImplemented("takeFaceUpTech");
}

export function refillTechDisplay(_draft: GameState, _discipline: TechDiscipline, _ctx: ResolveContext): void {
  return notImplemented("refillTechDisplay");
}
