/**
 * Determinism and storage independence (DESIGN §7, §8.2 `determinism`):
 * - the engine never reads `Math.random`, the clock or `crypto`;
 * - the same seed gives the same game;
 * - a recorded command log replays to identical events, state hashes and RNG states at every
 *   revision, both as is and with the state passed through the key-sorted (`jsonb`) round
 *   trip before every command;
 * - enumeration, validation and the selectors never consume the game RNG.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createGame } from "../../../src/game/engine.ts";
import { legalActionFamilies, legalCommands, sampleLegalAction } from "../../../src/game/legalActions.ts";
import { SeededRandom } from "../../../src/game/rng.ts";
import { placementOptions } from "../../../src/game/selectors.ts";
import { decisionPrompt } from "../../../src/game/state.ts";
import type { PlayerCount } from "../../../src/game/types.ts";
import { DIRECTED_WEIGHTS, FuzzTable, keySortedJsonRoundTrip, playFuzzGame, players, replayFrom, stateHash } from "./p7_support.ts";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

describe("no hidden randomness or clock (DESIGN §7)", () => {
  it("src/game never uses Math.random, Date, crypto or performance.now", () => {
    const root = join(import.meta.dirname, "../../../src/game");
    const offenders = sourceFiles(root).filter((file) => /Math\.random|\bDate\b|\bcrypto\b|performance\.now/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("seeded setup", () => {
  it.each([2, 3, 4] as const)("the same seed gives the same %i-player game; another seed differs", (count) => {
    const make = (seed: number) => {
      const created = createGame({ gameId: "determinism", players: players(count) }, new SeededRandom(seed));
      if (!created.ok) {
        throw new Error(created.error.code);
      }
      return { state: stateHash(created.state), events: stateHash(created.events) };
    };
    expect(make(12)).toEqual(make(12));
    expect(make(12).state).not.toBe(make(13).state);
  });
});

describe("replay of recorded command logs (DESIGN §7)", () => {
  it.each([
    [2, "new"],
    [3, "new"],
    [4, "new"],
    [3, "rich"],
    [4, "rich"],
  ] as const)("%i players (%s start): identical events, state hashes and RNG states at every revision, with and without the jsonb round trip", (count: PlayerCount, start) => {
    const seed = 6100 + count + (start === "rich" ? 50 : 0);
    const recorded = playFuzzGame({ start, seed, chooserSeed: seed + 7, playerCount: count, agreementEvery: 0, legalityEvery: 0, weights: DIRECTED_WEIGHTS });
    const plain = replayFrom(recorded.initial, recorded.initialRngState, recorded.table.log, false);
    const sorted = replayFrom(recorded.initial, recorded.initialRngState, recorded.table.log, true);
    expect(plain.hashes.length).toBe(recorded.table.log.length + 1);
    expect(sorted.hashes).toEqual(plain.hashes);
    expect(sorted.rngStates).toEqual(plain.rngStates);
    expect(sorted.events).toEqual(plain.events);
    expect(plain.hashes[plain.hashes.length - 1]).toBe(stateHash(recorded.table.state));
    expect(plain.state.phase.type).toBe("finished");
  });

  it("a new game replays from createGame itself", () => {
    const recorded = playFuzzGame({ seed: 6400, chooserSeed: 1, playerCount: 2, agreementEvery: 0, legalityEvery: 0 });
    const fresh = FuzzTable.create(6400, 2);
    expect(stateHash(fresh.state)).toBe(stateHash(recorded.initial));
    for (const record of recorded.table.log) {
      fresh.apply(record.actorId, record.command);
    }
    expect(stateHash(fresh.state)).toBe(stateHash(recorded.table.state));
  });
});

describe("legal actions and selectors never touch the game RNG", () => {
  it("enumerating, sampling and the selectors leave the RNG and the state unchanged", () => {
    const table = FuzzTable.create(77, 3);
    const chooser = new SeededRandom(5);
    for (let step = 0; step < 60 && table.state.phase.type !== "finished"; step += 1) {
      const actor = decisionPrompt(table.state).actorIds[0];
      if (actor === undefined) {
        break;
      }
      const before = { rng: table.rng.getState(), state: stateHash(table.state) };
      const view = table.view(actor);
      const commands = legalCommands(view, { mode: "canonical" });
      legalActionFamilies(view);
      placementOptions(view);
      const command = table.state.phase.type === "firing_contributions" ? commands[0] : sampleLegalAction(view, chooser);
      expect({ rng: table.rng.getState(), state: stateHash(table.state) }).toEqual(before);
      if (command === undefined) {
        break;
      }
      table.apply(actor, command);
    }
  });

  it("enumeration order does not depend on the state's key order", () => {
    const table = FuzzTable.create(91, 4);
    const chooser = new SeededRandom(2);
    for (let step = 0; step < 80 && table.state.phase.type !== "finished"; step += 1) {
      const actor = decisionPrompt(table.state).actorIds[0];
      if (actor === undefined) {
        break;
      }
      const view = table.view(actor);
      const sortedTable = FuzzTable.fromState(keySortedJsonRoundTrip(table.state), 1);
      sortedTable.privateState = keySortedJsonRoundTrip(table.privateState);
      const commands = legalCommands(view, { mode: "canonical" });
      expect(legalCommands(sortedTable.view(actor), { mode: "canonical" }).map((c) => JSON.stringify(keySortedJsonRoundTrip(c)))).toEqual(
        commands.map((c) => JSON.stringify(keySortedJsonRoundTrip(c))),
      );
      const command = table.state.phase.type === "firing_contributions" ? commands[0] : sampleLegalAction(view, chooser);
      if (command === undefined) {
        break;
      }
      table.apply(actor, command);
    }
  });
});
