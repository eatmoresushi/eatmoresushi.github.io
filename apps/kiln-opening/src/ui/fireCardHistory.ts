import type { FireModifier, PlayerId } from "../game";
import type { PublicEventRecord, PublicGameState } from "../multiplayer";

export interface FireCardHistoryEntry {
  round: number;
  modifier: FireModifier;
  kind: "round" | "second";
  playerId?: PlayerId;
}

/** Discard positions cannot identify rounds: extra draws and reshuffles change the pile. */
export function fireCardHistory(game: PublicGameState, events: PublicEventRecord[]): FireCardHistoryEntry[] {
  const history: FireCardHistoryEntry[] = [];
  const mainCards = new Map<number, FireCardHistoryEntry>();
  const seenRecords = new Set<number>();
  const secondCards = new Set<string>();
  let round = 1;

  const addMain = (cardRound: number, modifier: FireModifier): void => {
    if (mainCards.has(cardRound)) return;
    const entry: FireCardHistoryEntry = { round: cardRound, modifier, kind: "round" };
    mainCards.set(cardRound, entry);
    history.push(entry);
  };
  const addSecond = (cardRound: number, playerId: PlayerId, ceramicId: string, modifier: FireModifier): void => {
    const key = `${cardRound}:${playerId}:${ceramicId}`;
    if (secondCards.has(key)) return;
    secondCards.add(key);
    history.push({ round: cardRound, modifier, kind: "second", playerId });
  };

  for (const record of [...events].sort((a, b) => a.sequence - b.sequence)) {
    if (seenRecords.has(record.sequence)) continue;
    seenRecords.add(record.sequence);
    const event = record.event;
    if (event.type === "ROUND_STARTED") round = event.round;
    if (event.type === "FIRE_REVEALED") addMain(round, event.modifier);
    if (event.type === "SECOND_FIRING_RESOLVED") addSecond(round, event.playerId, event.ceramicId, event.fireModifier);
  }

  // Snapshots can arrive before the corresponding public-log refresh.
  if (game.lastFiringResult !== null) addMain(game.lastFiringResult.round, game.lastFiringResult.fireModifier);
  if (game.firingContext?.fireModifier !== null && game.firingContext?.fireModifier !== undefined) {
    addMain(game.firingContext.round, game.firingContext.fireModifier);
  }
  if (game.phase.type === "firing_second_before_quality") {
    addSecond(game.round, game.phase.actorId, game.phase.ceramicId, game.phase.fireModifier);
  }

  return history.sort((a, b) => a.round - b.round || (a.kind === b.kind ? 0 : a.kind === "round" ? -1 : 1));
}
