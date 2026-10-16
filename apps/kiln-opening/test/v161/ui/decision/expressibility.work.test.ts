/**
 * The work and setup forms can play every legal move (UI_V1.6.1_ARCHITECTURE §9.4, §10.3 B4).
 * Owner: B4.
 *
 * For every view whose window belongs to B4 (Kiln selection, Setter's Mark, the work turn before
 * and after the worker action, the Commission Market steps, the Guild Hall inspection, Colour
 * Samples), each legal command must be expressible by its form: `fromCommand` gives a draft,
 * revalidating it changes nothing (every value is offered by `options()`), `build` gives the
 * command back and it validates. `USE_CANAL_BARGE` is routed to B5's form by the helper.
 *
 * Inputs:
 * - canonical mode over every scripted scenario and played moment;
 * - **exhaustive** mode over the scripted scenarios, capped at 5,000 commands per view with a
 *   seeded sample above that (the count is logged), because the canonical cap does not prove
 *   every legal move;
 * - canonical mode at every B4 decision of 3 seeded games (2, 3 and 4 players), played to the
 *   end with the engine's sampled legal moves.
 * No row may be `todo`: every B4 window has its real draft model.
 */
import { describe, expect, it } from "vitest";
import { SeededRandom, decisionPrompt, legalCommands, sampleLegalAction } from "../../../../src/game/index.ts";
import type { AuthoritativeCommand, PlayerCount, SubmitContributionCommand } from "../../../../src/game/index.ts";
import { decisionWindow } from "../../../../src/app/state/decisionWindow.ts";
import type { DecisionWindowKind } from "../../../../src/app/state/decisionWindow.ts";
import { FuzzTable } from "../../engine/p7_support.ts";
import { checkView } from "../support/expressibility.ts";
import type { ExpressibilityReport } from "../support/expressibility.ts";
import { allFixtures, scenarios } from "../support/fixtures.ts";

const B4_WINDOWS: ReadonlySet<DecisionWindowKind> = new Set(["kiln_selection", "setters_mark", "work", "commission", "guild_inspection", "colour_samples"]);

function failures(report: ExpressibilityReport): string[] {
  return report.rows.filter((row) => row.status !== "ok").map((row) => `${row.status} ${row.form}: ${row.problem ?? ""} ${JSON.stringify(row.command)}`);
}

const ACTING = allFixtures().filter((entry) => entry.viewerActs === true && B4_WINDOWS.has(decisionWindow(entry.playerView).kind));

describe("B4 forms express every canonical command", () => {
  it("has a B4 fixture for every B4 window kind, and both work steps", () => {
    const kinds = new Set(ACTING.map((entry) => decisionWindow(entry.playerView).kind));
    expect([...kinds].sort()).toEqual([...B4_WINDOWS].sort());
    const steps = new Set(ACTING.map((entry) => decisionWindow(entry.playerView)).flatMap((window) => (window.kind === "work" ? [window.step] : [])));
    expect([...steps].sort()).toEqual(["after_action", "before_action"]);
  });

  it.each(ACTING.map((entry) => [entry.id] as const))("%s", (id) => {
    const entry = ACTING.find((candidate) => candidate.id === id);
    if (entry === undefined) throw new Error(id);
    const report = checkView(entry.playerView);
    expect(report.rows.length).toBeGreaterThan(0);
    expect(failures(report)).toEqual([]);
  });

  it("covers every B4 command family", () => {
    const families = new Set(ACTING.flatMap((entry) => checkView(entry.playerView).rows.map((row) => row.command.type)));
    for (const type of [
      "SELECT_KILN",
      "PLACE_SETTERS_MARK",
      "PLACE_MATERIALS_YARD",
      "PLACE_FORM_DECORATE",
      "PLACE_GLAZE_LOAD",
      "PLACE_COMMISSION_MARKET",
      "PLACE_GUILD_HALL",
      "PLACE_CANAL_WHARF",
      "PLACE_MAGISTRATES_HALL",
      "COMMISSION_RESERVE",
      "COMMISSION_STOP",
      "COMMISSION_CHOOSE_LOOKED",
      "COMMISSION_GAIN",
      "GUILD_TAKE",
      "COLOUR_SAMPLES_CHOOSE",
      "USE_IMPERIAL_PRIORITY",
      "USE_CANAL_BARGE",
      "END_TURN",
    ]) {
      expect(families.has(type as AuthoritativeCommand["type"]), type).toBe(true);
    }
  });
});

describe("B4 forms express every legal command of the scripted scenarios (exhaustive, capped)", () => {
  const scripted = scenarios().filter((entry) => entry.viewerActs === true && B4_WINDOWS.has(decisionWindow(entry.playerView).kind));
  it.each(scripted.map((entry) => [entry.id] as const))("%s", (id) => {
    const entry = scripted.find((candidate) => candidate.id === id);
    if (entry === undefined) throw new Error(id);
    const report = checkView(entry.playerView, { mode: "exhaustive", cap: 5_000, seed: 1_610 });
    console.info(`[expressibility.work] ${id}: ${report.rows.length} of ${report.total} legal commands checked`);
    expect(report.rows.length).toBe(Math.min(report.total, 5_000));
    expect(failures(report)).toEqual([]);
  }, 120_000);
});

describe("B4 forms express every canonical command at every B4 decision of seeded games", () => {
  const GAMES: ReadonlyArray<{ seed: number; players: PlayerCount }> = [
    { seed: 4_102, players: 2 },
    { seed: 4_103, players: 3 },
    { seed: 4_104, players: 4 },
  ];

  it.each(GAMES.map((game) => [game.players, game.seed] as const))("%i players (seed %i)", (players, seed) => {
    const table = FuzzTable.create(seed, players);
    const chooser = new SeededRandom(seed * 7 + 1);
    const seen = new Map<string, number>();
    let commands = 0;
    let rows = 0;
    while (table.state.phase.type !== "finished") {
      expect(commands).toBeLessThan(3_000);
      const prompt = decisionPrompt(table.state);
      const actorId = prompt.actorIds[chooser.nextInt(prompt.actorIds.length)];
      if (actorId === undefined) throw new Error(`no actor in ${table.state.phase.type}`);
      const view = table.view(actorId);
      const kind = decisionWindow(view).kind;
      if (B4_WINDOWS.has(kind)) {
        const report = checkView(view);
        expect(failures(report), `${players}p seed ${seed}, command ${commands} (${kind})`).toEqual([]);
        rows += report.rows.length;
        seen.set(kind, (seen.get(kind) ?? 0) + 1);
      }
      let command: AuthoritativeCommand;
      if (table.state.phase.type === "firing_contributions") {
        const options = legalCommands(view, { mode: "canonical" }) as SubmitContributionCommand[];
        const chosen = options[chooser.nextInt(options.length)];
        if (chosen === undefined) throw new Error("no Contribution");
        command = chosen;
      } else {
        command = sampleLegalAction(view, chooser);
      }
      table.apply(actorId, command, `${players}p seed ${seed}`);
      commands += 1;
    }
    expect(table.state.finalResult).not.toBeNull();
    expect(seen.get("kiln_selection")).toBe(players);
    expect(seen.get("work") ?? 0).toBeGreaterThan(20);
    expect(rows).toBeGreaterThan(500);
  }, 300_000);
});
