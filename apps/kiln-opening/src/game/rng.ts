/**
 * Seeded randomness (DESIGN §7). Every random draw in the engine goes through a
 * `RandomSource`; the engine never uses the platform's own random source or clock.
 *
 * `SeededRandom` and `shuffle` are unchanged from V1.4 (mulberry32, Fisher–Yates), so a
 * persisted `getState()` continues the same sequence when passed back to the constructor.
 *
 * Layer 1: imports only types.
 */

import type { RandomSource } from "./types.ts";

export class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("maxExclusive must be a positive integer");
    }
    return Math.floor((this.nextUint32() / 0x1_0000_0000) * maxExclusive);
  }

  getState(): number {
    return this.state;
  }
}

export function shuffle<T>(items: readonly T[], rng: RandomSource): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.nextInt(index + 1);
    const current = result[index];
    const other = result[swapIndex];
    if (current === undefined || other === undefined) {
      throw new Error("Shuffle index invariant failed");
    }
    result[index] = other;
    result[swapIndex] = current;
  }
  return result;
}

/** One roll: `faces[rng.nextInt(faces.length)]`. Consumes exactly one draw. */
export function rollDie<T>(faces: readonly T[], rng: RandomSource): T {
  if (faces.length === 0) {
    throw new RangeError("A die needs at least one face");
  }
  return faces[rng.nextInt(faces.length)] as T;
}
