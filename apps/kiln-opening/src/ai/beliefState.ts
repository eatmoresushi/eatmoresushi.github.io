import {
  FIRE_CARDS,
  IMPERIAL_ORDERS,
  MARKET_ORDERS,
  SHAPES,
  TECHNIQUES,
  SeededRandom,
  shuffle,
} from "../game/index.ts";
import type {
  FireModifier,
  GameState,
  OrderId,
  PlayerId,
  PlayerState,
  Shape,
  TechniqueDiscipline,
  TechniqueId,
} from "../game/index.ts";
import type { PublicGameState } from "../multiplayer/types.ts";
import type { PlayerObservation } from "./types.ts";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]));
  }
  return value;
}

export function stablePublicJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

/** Browser-safe FNV-1a fingerprint; this is an identity marker, not a secret hash. */
export function publicStateFingerprint(observation: PlayerObservation): string {
  const source = stablePublicJson({
    playerId: observation.playerId,
    game: observation.game,
    ownPendingContribution: observation.ownPendingContribution,
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `PUB-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function mixBeliefSeed(...values: number[]): number {
  let seed = 0x9e3779b9;
  for (const value of values) {
    seed ^= value >>> 0;
    seed = Math.imul(seed ^ (seed >>> 16), 0x85ebca6b);
    seed = Math.imul(seed ^ (seed >>> 13), 0xc2b2ae35);
    seed ^= seed >>> 16;
  }
  return seed >>> 0;
}

function phaseOrderIds(game: PublicGameState): string[] {
  return game.phase.type === "setup_starting_orders"
    ? Object.values(game.phase.initialOrderIds)
    : [];
}

function knownOrderIds(game: PublicGameState): Set<string> {
  return new Set([
    ...game.displays.market,
    ...game.displays.imperial,
    ...game.discards.market,
    ...game.discards.imperial,
    ...phaseOrderIds(game),
    ...Object.values(game.players).flatMap((player) => [
      ...player.orderHand,
      ...player.completedOrders.map(({ orderId }) => orderId),
    ]),
  ]);
}

function sampledOrders(
  definitions: readonly { id: string }[],
  known: ReadonlySet<string>,
  count: number,
  rng: SeededRandom,
  deckName: string,
): OrderId[] {
  const possible = definitions.map(({ id }) => id).filter((id) => !known.has(id));
  if (possible.length < count) {
    throw new Error(`Public belief cannot reconstruct ${deckName}: ${count} hidden cards but only ${possible.length} candidates`);
  }
  return shuffle(possible, rng).slice(0, count);
}

function sampledTechniques(
  game: PublicGameState,
  discipline: TechniqueDiscipline,
  rng: SeededRandom,
): TechniqueId[] {
  const known = new Set([
    ...game.displays.techniques[discipline],
    ...Object.values(game.players).flatMap((player) => player.techniques.map(({ id }) => id)),
  ]);
  const possible = TECHNIQUES.filter((technique) => technique.discipline === discipline && !known.has(technique.id))
    .map(({ id }) => id);
  const count = game.decks.techniqueRemaining[discipline];
  if (possible.length < count) {
    throw new Error(`Public belief cannot reconstruct ${discipline} Techniques: ${count} hidden cards but only ${possible.length} candidates`);
  }
  return shuffle(possible, rng).slice(0, count);
}

function removeOne<T>(values: T[], target: T): void {
  const index = values.indexOf(target);
  if (index >= 0) values.splice(index, 1);
}

function sampledFireDeck(game: PublicGameState, rng: SeededRandom): FireModifier[] {
  const possible = [...FIRE_CARDS];
  for (const modifier of game.discards.fire) removeOne(possible, modifier);
  if (game.firingContext?.fireModifier !== null && game.firingContext?.fireModifier !== undefined) {
    removeOne(possible, game.firingContext.fireModifier);
  }
  if (possible.length < game.decks.fireRemaining) {
    throw new Error(`Public belief cannot reconstruct Fire deck: ${game.decks.fireRemaining} hidden cards but only ${possible.length} candidates`);
  }
  return shuffle(possible, rng).slice(0, game.decks.fireRemaining);
}

function vesselSupply(game: PublicGameState, sampleIndex: number): Record<Shape, string[]> {
  return Object.fromEntries(SHAPES.map((shape) => [
    shape,
    Array.from({ length: game.vesselSupplyCounts[shape] }, (_, index) => (
      `${game.gameId}:belief:${sampleIndex}:${shape}:${index + 1}`
    )),
  ])) as Record<Shape, string[]>;
}

function nextCeramicSequence(game: PublicGameState): number {
  return Math.max(0, ...Object.keys(game.ceramics).map((id) => {
    const match = id.match(/:ceramic:(\d+)$/);
    return match === null ? 0 : Number(match[1]);
  })) + 1;
}

function players(game: PublicGameState): Record<PlayerId, PlayerState> {
  return Object.fromEntries(game.playerOrder.map((playerId) => {
    const player = game.players[playerId];
    if (player === undefined) throw new Error(`Public belief is missing player ${playerId}`);
    return [playerId, clone(player) as PlayerState];
  })) as Record<PlayerId, PlayerState>;
}

/**
 * Samples a complete engine state using public information only. Repeating this
 * with two authoritative states that project to the same observation produces
 * the same belief distribution for a fixed seed.
 */
export function createPublicBeliefState(
  observation: PlayerObservation,
  seed: number,
  sampleIndex = 0,
): GameState {
  const game = observation.game;
  const rng = new SeededRandom(mixBeliefSeed(seed, sampleIndex));
  const knownOrders = knownOrderIds(game);
  const state: GameState = {
    schemaVersion: game.schemaVersion,
    rulesVersion: game.rulesVersion,
    gameId: game.gameId,
    revision: game.revision,
    eventSequence: game.eventSequence,
    nextCeramicSequence: nextCeramicSequence(game),
    playerCount: game.playerCount,
    round: game.round,
    playerOrder: [...game.playerOrder],
    firstPlayerId: game.firstPlayerId,
    phase: clone(game.phase),
    players: players(game),
    actionBoard: clone(game.actionBoard),
    ceramics: clone(game.ceramics),
    commonSupply: clone(game.commonSupply),
    vesselSupply: vesselSupply(game, sampleIndex),
    marketDeck: sampledOrders(MARKET_ORDERS, knownOrders, game.decks.marketRemaining, rng, "Market deck"),
    marketDiscard: [...game.discards.market],
    marketDisplay: [...game.displays.market],
    imperialDeck: sampledOrders(IMPERIAL_ORDERS, knownOrders, game.decks.imperialRemaining, rng, "Imperial deck"),
    imperialDiscard: [...game.discards.imperial],
    imperialDisplay: [...game.displays.imperial],
    techniqueDecks: {
      forming: sampledTechniques(game, "forming", rng),
      glazing: sampledTechniques(game, "glazing", rng),
      firing: sampledTechniques(game, "firing", rng),
    },
    techniqueDisplay: clone(game.displays.techniques),
    fireDeck: sampledFireDeck(game, rng),
    fireDiscard: [...game.discards.fire],
    imperialSealOwnerId: game.imperialSealOwnerId,
    firingContext: clone(game.firingContext),
    lastFiringResult: clone(game.lastFiringResult),
    finalResult: clone(game.finalResult),
    ...(game.experimentConfig === undefined ? {} : { experimentConfig: clone(game.experimentConfig) }),
  };
  return state;
}
