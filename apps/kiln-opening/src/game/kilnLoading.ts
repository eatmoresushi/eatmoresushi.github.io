/**
 * R5 destinations, loading, Reworking Table, Setter's Mark return, Kiln Furniture, Inverted Firing (L176–184, L617, L628–630, R5, R8).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P3.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "./errors.ts";
import type {
  ActorView,
  CeramicId,
  GameRuleError,
  GameState,
  KilnSpaceId,
  LoadDestinationOption,
  LoadSpec,
  LoadedCeramic,
  PlayerId,
  PlayerView,
  PublicCore,
  ResolveContext,
  Shape,
} from "./types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`kilnLoading.${name}`);
}

export function sharedSpaceOpenFor(_game: PublicCore, _playerId: PlayerId, _space: KilnSpaceId): boolean {
  return notImplemented("sharedSpaceOpenFor");
}

export function invertedFiringTarget(_game: PublicCore, _playerId: PlayerId, _space: KilnSpaceId): boolean {
  return notImplemented("invertedFiringTarget");
}

export function imperialKilnEmpty(_game: PublicCore, _playerId: PlayerId): boolean {
  return notImplemented("imperialKilnEmpty");
}

export function hasAnyLegalLoad(_game: PublicCore, _playerId: PlayerId): boolean {
  return notImplemented("hasAnyLegalLoad");
}

export function validateLoads(
  _view: ActorView,
  _loads: readonly LoadSpec[],
  _maxLoads: number,
  _loadedBy: LoadedCeramic["loadedBy"],
): GameRuleError | null {
  return notImplemented("validateLoads");
}

export function loadCeramic(
  _draft: GameState,
  _playerId: PlayerId,
  _spec: LoadSpec,
  _loadedBy: LoadedCeramic["loadedBy"],
  _ctx: ResolveContext,
): LoadedCeramic {
  return notImplemented("loadCeramic");
}

export function reworkShape(_draft: GameState, _ceramicId: CeramicId, _shape: Shape, _ctx: ResolveContext): void {
  return notImplemented("reworkShape");
}

export function loadDestinationOptions(
  _view: PlayerView,
  _playerId: PlayerId,
  _ceramicId: CeramicId,
  _earlierLoads: readonly LoadSpec[],
  _reworkShape?: Shape,
): LoadDestinationOption[] {
  return notImplemented("loadDestinationOptions");
}
