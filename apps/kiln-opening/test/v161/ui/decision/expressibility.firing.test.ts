/**
 * The forms can express every legal firing, Order and Cleanup command (UI_V1.6.1_ARCHITECTURE
 * §9.4). Owner: B5.
 *
 * For each command of B5's forms — Contributions, Test Pieces, Jun, after-Quality, Second
 * Firing's choice, the Order Phase (with a Flawed ceramic's sale, rev. 5 L172, L318) and the hand
 * trim (no sale in after-Quality or the trim, rev. 5 L170, L176, R26) — the expressibility
 * helper checks `fromCommand` → every value offered by `options()` → `build` equals the command
 * (after `normalizeCommand`) → `build` validates. Inputs:
 * - canonical mode over every scripted scenario and played moment;
 * - exhaustive mode over the scripted scenarios (capped at 5,000 commands, seeded sample above);
 * - every decision of three seeded games (2, 3 and 4 players), played by a seeded chooser over
 *   the canonical commands.
 * B4's forms are not judged here (`expressibility.work.test.ts`); no B5 row may be `todo`.
 */
import { describe, expect, it } from "vitest";
import { legalCommands } from "../../../../src/game/index.ts";
import type { AuthoritativeCommand, PlayerView } from "../../../../src/game/index.ts";
import { buildGameModel, engineViewOf } from "../../../../src/app/state/model.ts";
import { LocalTable } from "../../engine/support/localTable.ts";
import { checkExpressible, commandsFor, formFor } from "../support/expressibility.ts";
import type { ExpressibilityForm, ExpressibilityRow } from "../support/expressibility.ts";
import { allFixtures, scenarios } from "../support/fixtures.ts";

const B5_FORMS: ReadonlySet<ExpressibilityForm> = new Set<ExpressibilityForm>([
  "contributions",
  "test_pieces",
  "jun",
  "after_quality",
  "second_firing",
  "orders",
  "hand_limit",
]);

/** B5's rows for a view and a list of its commands. */
function b5Rows(view: PlayerView, commands: readonly AuthoritativeCommand[]): ExpressibilityRow[] {
  const model = buildGameModel(view, []);
  const engine = engineViewOf(view);
  return commands
    .filter((command) => B5_FORMS.has(formFor(command, model.window).form))
    .map((command) => checkExpressible(view, command, {}, { model, engine }));
}

function failures(rows: readonly ExpressibilityRow[]): string[] {
  return rows.filter((row) => row.status !== "ok").map((row) => `${row.form} ${JSON.stringify(row.command)}: ${row.status} ${row.problem ?? ""}`);
}

describe("B5 forms express every canonical command of every fixture", () => {
  const acting = allFixtures().filter((entry) => entry.viewerActs === true);

  it.each(acting.map((entry) => [entry.id, entry] as const))("%s", (_, entry) => {
    const rows = b5Rows(entry.playerView, commandsFor(entry.playerView).commands);
    expect(failures(rows)).toEqual([]);
  });

  it("reaches every B5 form", () => {
    const forms = new Set<ExpressibilityForm>();
    for (const entry of acting) for (const row of b5Rows(entry.playerView, commandsFor(entry.playerView).commands)) forms.add(row.form);
    expect([...forms].sort()).toEqual([...B5_FORMS].sort());
  });
});

describe("B5 forms express every exhaustive command of the scripted scenarios", () => {
  const acting = scenarios().filter((entry) => entry.viewerActs === true);

  it.each(acting.map((entry) => [entry.id, entry] as const))("%s", (_, entry) => {
    const { total, commands } = commandsFor(entry.playerView, { mode: "exhaustive", cap: 5_000, seed: 1_610 });
    const rows = b5Rows(entry.playerView, commands);
    if (total > commands.length) console.info(`${entry.id}: ${total} exhaustive commands, ${commands.length} sampled`);
    expect(failures(rows)).toEqual([]);
  });
});

/** A small seeded generator for the chooser. */
function chooser(seed: number): (n: number) => number {
  let state = seed >>> 0 || 1;
  return (n) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return Math.floor(((state >>> 0) / 0x1_0000_0000) * n);
  };
}

describe("B5 forms express every decision of seeded games", () => {
  it.each([
    [2, 1_621],
    [3, 1_632],
    [4, 1_643],
  ] as const)("%i players (seed %i)", (players, seed) => {
    const table = LocalTable.newGame(seed, players);
    const pick = chooser(seed);
    const seenForms = new Set<ExpressibilityForm>();
    const problems: string[] = [];
    let decisions = 0;
    while (table.state.phase.type !== "finished") {
      decisions += 1;
      expect(decisions, "the game ends").toBeLessThan(5_000);
      const actorId = table.prompt().actorIds[0];
      expect(actorId, "someone acts").toBeDefined();
      const view = table.actorView(actorId!);
      const commands = legalCommands(view, { mode: "canonical" });
      for (const row of b5Rows(view, commands)) {
        seenForms.add(row.form);
        if (row.status !== "ok") problems.push(`decision ${decisions} ${row.form} ${JSON.stringify(row.command)}: ${row.status} ${row.problem ?? ""}`);
      }
      const command = commands[pick(commands.length)]!;
      if (command.type === "SUBMIT_CONTRIBUTION") table.contribute(actorId!, command.card);
      else table.act(actorId!, command);
    }
    expect(problems).toEqual([]);
    expect(table.state.finalResult).not.toBeNull();
    for (const form of ["contributions", "orders"] as const) expect(seenForms.has(form), form).toBe(true);
  }, 120_000);
});
