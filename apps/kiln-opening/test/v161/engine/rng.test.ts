import { describe, expect, it } from "vitest";
import { SeededRandom, rollDie, shuffle } from "../../../src/game/rng.ts";
import type { RandomSource } from "../../../src/game/types.ts";

describe("SeededRandom (unchanged V1.4 mulberry32, DESIGN §7)", () => {
  it("reproduces the V1.4 sequence for the same seed", () => {
    // Values recorded from `src/game-v14/rng.ts` with seed 20261014.
    const rng = new SeededRandom(20261014);
    expect([rng.nextUint32(), rng.nextUint32(), rng.nextUint32(), rng.nextInt(6), rng.getState()]).toEqual([
      840802199, 3845536253, 324460659, 1, 3051556970,
    ]);
  });

  it("continues the same sequence from a persisted state", () => {
    const first = new SeededRandom(99);
    first.nextUint32();
    const resumed = new SeededRandom(first.getState());
    expect(resumed.nextUint32()).toBe(first.nextUint32());
  });

  it("nextInt rejects a non-positive or fractional bound", () => {
    const rng = new SeededRandom(1);
    expect(() => rng.nextInt(0)).toThrow(RangeError);
    expect(() => rng.nextInt(2.5)).toThrow(RangeError);
  });
});

describe("shuffle (unchanged V1.4 Fisher–Yates)", () => {
  it("reproduces the V1.4 order and never mutates its input", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle(items, new SeededRandom(7))).toEqual([5, 7, 2, 3, 4, 6, 8, 1]);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("rollDie", () => {
  it("is faces[rng.nextInt(faces.length)] and consumes exactly one draw", () => {
    const rng = new SeededRandom(42);
    expect(Array.from({ length: 12 }, () => rollDie([1, 1, 2, 2, 3, 3], rng))).toEqual([2, 2, 3, 3, 1, 2, 1, 2, 3, 2, 1, 3]);
    const calls: number[] = [];
    const scripted: RandomSource = {
      nextUint32: () => 0,
      nextInt: (max) => {
        calls.push(max);
        return 4;
      },
      getState: () => 0,
    };
    expect(rollDie(["a", "b", "c", "d", "e", "f"], scripted)).toBe("e");
    expect(calls).toEqual([6]);
  });

  it("rejects a die without faces", () => {
    expect(() => rollDie([], new SeededRandom(1))).toThrow(RangeError);
  });
});
