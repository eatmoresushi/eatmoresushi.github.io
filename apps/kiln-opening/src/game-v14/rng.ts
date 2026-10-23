export interface RandomSource {
  nextUint32(): number;
  nextInt(maxExclusive: number): number;
  getState(): number;
}

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
