/**
 * Full random legal games for 2, 3 and 4 players (DESIGN §8.3; AGENTS "full random legal
 * games for 2/3/4 players completing without error").
 *
 * Each game runs `sampleLegalAction` (and `legalContributions` + `submitContribution` in the
 * secret window) until `finished`, with the live invariant tier after every command, the
 * hidden-information checks on the public projection and the event stream, bounded legality
 * checks, the §5.4 selector agreement and a key-sorted (`jsonb`) round trip before a random
 * 10% of commands. At the end the final score must recompute from public data and the replay
 * of the command log must reproduce the final state.
 *
 * Half the games start from `createGame`, half from a rich `buildState` start (random Kilns, a
 * Tech in every discipline dealt from a seed-rotated window, Recognition 0–3, and the set-ups
 * that Inverted Firing, Ru, Guan and Tribute Ware need), so every Tech and Kiln ability runs
 * under the checks. The coverage test asserts that the default seeds play every command type,
 * reach every phase and Work step, make every optional Glaze & Load choice and fire every Tech
 * and Kiln ability. `KILN_FUZZ_GAMES` sets the games per player count and start (default 4,
 * nightly e.g. 500); `KILN_FUZZ_SEED` offsets the seeds. Every failure names
 * `(seed, chooserSeed)`.
 *
 * Long runs (6 × KILN_FUZZ_GAMES games, roughly 0.25 s each):
 *
 *   npm run test:fuzz:long                                    # 500 per player count and start
 *   KILN_FUZZ_GAMES=150 npx vitest run test/v161/engine/fuzz.test.ts
 *
 * Each game yields one macrotask (`setImmediate`) before it starts. Without that, every test
 * and every hook is synchronous, so the worker's event loop never reaches its I/O phase for the
 * whole file: Vitest's throttled `onTaskUpdate` RPCs (one per ~100 ms) go out but their replies
 * are never read, and once the file runs past the 60 s RPC timeout the first expired timer
 * raises "[vitest-worker]: Timeout calling onTaskUpdate" and the run exits non-zero even though
 * every game passed.
 */

import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { KILN_IDS, TECH_IDS } from "../../../src/game/content.ts";
import type { GameActionType, GamePhaseType, PlayerCount, WorkTurnStep } from "../../../src/game/types.ts";
import { DIRECTED_WEIGHTS, type FuzzResult, finalScoreViolations, playFuzzGame, replayFrom, stateHash } from "./p7_support.ts";

const GAMES = Number(process.env["KILN_FUZZ_GAMES"] ?? 4);
const SEED_BASE = Number(process.env["KILN_FUZZ_SEED"] ?? 7100);

interface Totals {
  games: number;
  commands: number;
  families: Map<string, number>;
  techs: Map<string, number>;
  kilns: Map<string, number>;
  phases: Map<string, number>;
  loadFeatures: Map<string, number>;
}

const totals: Totals = { games: 0, commands: 0, families: new Map(), techs: new Map(), kilns: new Map(), phases: new Map(), loadFeatures: new Map() };

/** Every command type; `satisfies` makes a new `GameActionType` fail to compile until listed. */
const COMMAND_TYPES = Object.keys({
  SELECT_KILN: true,
  PLACE_SETTERS_MARK: true,
  USE_COLOUR_SAMPLES_SWAP: true,
  COLOUR_SAMPLES_SWAP_CHOOSE: true,
  USE_IMPERIAL_PRIORITY: true,
  PLACE_MATERIALS_YARD: true,
  PLACE_FORM_DECORATE: true,
  PLACE_GLAZE_LOAD: true,
  PLACE_COMMISSION_MARKET: true,
  PLACE_GUILD_HALL: true,
  PLACE_CANAL_WHARF: true,
  PLACE_MAGISTRATES_HALL: true,
  COMMISSION_CHOOSE: true,
  GUILD_TAKE: true,
  GUILD_FINISH: true,
  COLOUR_SAMPLES_CHOOSE: true,
  END_TURN: true,
  SUBMIT_CONTRIBUTION: true,
  TEST_PIECES_DECIDE: true,
  TEST_PIECES_BURY: true,
  RESOLVE_HEAT_MARKERS: true,
  RESOLVE_JUN: true,
  USE_PROTECTIVE_SAGGARS: true,
  USE_SECOND_FIRING: true,
  SECOND_FIRING_CHOOSE: true,
  USE_GE_CRACKLE: true,
  END_AFTER_QUALITY: true,
  SALVAGE_FLAWED: true,
  COMPLETE_ORDER: true,
  END_ORDER_TURN: true,
  DISCARD_TO_HAND_LIMIT: true,
} satisfies Record<GameActionType | "SUBMIT_CONTRIBUTION", true>);

/** Every decision phase and Work step (`finished` has no decision). */
const PHASES = [
  ...Object.keys({
    setup_kiln_selection: true,
    round_start_setters_mark: true,
    work_turn: true,
    firing_contributions: true,
    firing_test_pieces: true,
    firing_heat_markers: true,
    firing_heat_adjustment: true,
    firing_after_quality: true,
    firing_second_firing_choice: true,
    firing_salvage: true,
    orders: true,
    cleanup_hand_limit: true,
  } satisfies Record<Exclude<GamePhaseType, "finished">, true>),
  ...Object.keys({
    before_action: true,
    commission_market: true,
    guild_inspection: true,
    colour_samples: true,
    colour_samples_swap: true,
    after_action: true,
  } satisfies Record<WorkTurnStep["kind"], true>).map((kind) => `work_turn:${kind}`),
];

const LOAD_FEATURES = ["inverted_firing", "kiln_furniture", "rework", "heat_marker", "pair", "imperial"];

function merge(into: Map<string, number>, from: ReadonlyMap<string, number>): void {
  for (const [key, value] of from) {
    into.set(key, (into.get(key) ?? 0) + value);
  }
}

interface GameCase {
  start: "new" | "rich";
  playerCount: PlayerCount;
  seed: number;
  chooserSeed: number;
  directed: boolean;
}

/** One test per game, so a failure names its seeds; each test yields to the event loop first
 * (see the header). Half the games use the directed profile to reach deep states
 * (Recognition 3–4, Ru/Guan …). */
const CASES: GameCase[] = ([2, 3, 4] as const).flatMap((playerCount) =>
  (["new", "rich"] as const).flatMap((start) =>
    Array.from({ length: GAMES }, (_, game): GameCase => {
      const seed = SEED_BASE + (start === "rich" ? 50_000 : 0) + playerCount * 1000 + game;
      return { start, playerCount, seed, chooserSeed: seed * 31 + 17, directed: game % 2 === (start === "rich" ? 0 : 1) };
    }),
  ),
);

describe("random legal games to the end with every §8.3 check", () => {
  it.each(CASES.map((c) => [`${c.playerCount}p ${c.start} seed ${c.seed} chooserSeed ${c.chooserSeed}${c.directed ? " directed" : ""}`, c] as const))(
    "%s",
    async (where, c) => {
      // Let the worker read Vitest's RPC replies between games (see the header).
      await yieldToEventLoop();
      const result = playFuzzGame({ start: c.start, seed: c.seed, chooserSeed: c.chooserSeed, playerCount: c.playerCount, ...(c.directed ? { weights: DIRECTED_WEIGHTS } : {}) });
      expect(result.table.state.phase.type, where).toBe("finished");
      expect(result.commands, where).toBeLessThan(2000);
      expect(finalScoreViolations(result.table.state), where).toEqual([]);
      const replayed = replayFrom(result.initial, result.initialRngState, result.table.log, false);
      expect(stateHash(replayed.state), `${where} replay`).toBe(stateHash(result.table.state));
      record(result);
    },
  );
});

function record(result: FuzzResult): void {
  totals.games += 1;
  totals.commands += result.commands;
  merge(totals.families, result.families);
  merge(totals.techs, result.techUses);
  merge(totals.kilns, result.kilnUses);
  merge(totals.phases, result.phases);
  merge(totals.loadFeatures, result.loadFeatures);
}

describe("fuzz coverage", () => {
  it("reports what the games exercised and asserts it reached every command, phase, Tech and Kiln", () => {
    const families = [...totals.families.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    const techs = TECH_IDS.map((id) => `${id}:${totals.techs.get(id) ?? 0}`);
    const kilns = KILN_IDS.map((id) => `${id}:${totals.kilns.get(id) ?? 0}`);
    console.info(
      [
        `fuzz: ${totals.games} games, ${totals.commands} commands, ${families.length} command types`,
        `families: ${families.map(([type, n]) => `${type}=${n}`).join(" ")}`,
        `phases: ${PHASES.map((phase) => `${phase}=${totals.phases.get(phase) ?? 0}`).join(" ")}`,
        `load choices: ${LOAD_FEATURES.map((feature) => `${feature}=${totals.loadFeatures.get(feature) ?? 0}`).join(" ")}`,
        `techs: ${techs.join(" ")}`,
        `kilns: ${kilns.join(" ")}`,
      ].join("\n"),
    );
    expect(totals.games).toBe(GAMES * 6);
    // Coverage is asserted for the default seed base with at least the default game count,
    // and for any long run (≥ 50 games per player count and start); a short run from a
    // custom seed base only reports it, since rare windows (Ru, Guan, a Second Firing choice)
    // may then legitimately not occur.
    if (!((GAMES >= 4 && SEED_BASE === 7100) || GAMES >= 50)) {
      return;
    }
    const missing = (keys: readonly string[], seen: ReadonlyMap<string, number>) => keys.filter((key) => (seen.get(key) ?? 0) === 0);
    expect(missing(COMMAND_TYPES, totals.families), "command types never played").toEqual([]);
    expect(missing(PHASES, totals.phases), "phases never reached").toEqual([]);
    expect(missing(LOAD_FEATURES, totals.loadFeatures), "Glaze & Load choices never made").toEqual([]);
    expect(missing(TECH_IDS, totals.techs), "Techs never used").toEqual([]);
    expect(missing(KILN_IDS, totals.kilns), "Kiln abilities never used").toEqual([]);
  });
});
