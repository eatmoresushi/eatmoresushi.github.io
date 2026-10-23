/**
 * Helpers for the Playtest Form V3 tests (owner: B3): a minimal valid draft and an in-memory
 * `Storage`.
 */
import { KILN_IDS } from "../../../../src/game/index.ts";
import type { PlayerCount } from "../../../../src/game/index.ts";
import { createPlaytestDraft } from "../../../../src/playtest/model.ts";
import type { PlaytestDraft } from "../../../../src/playtest/types.ts";

/** A minimal valid record. */
export function validDraft(playerCount: PlayerCount = 2): PlaytestDraft {
  const draft = createPlaytestDraft(playerCount);
  return {
    ...draft,
    playedOn: "2026-10-15",
    players: draft.players.map((player, index) => ({
      ...player,
      name: `Seat ${String(index + 1)}`,
      kilnId: KILN_IDS[index]!,
      recognition: 0,
      coinsRemaining: 1,
      clayRemaining: 0,
      woodRemaining: 0,
      finalVp: 20 - index,
    })),
  };
}

export class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();
  get length(): number {
    return this.items.size;
  }
  clear(): void {
    this.items.clear();
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}
