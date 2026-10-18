/**
 * The work and setup forms can play every legal move (UI_V1.6.1_ARCHITECTURE §9.4, §10.3 B4).
 * Owner: B4.
 *
 * For every view whose window belongs to B4 (Kiln selection, Setter's Mark, the work turn before
 * and after the worker action with the Colour Samples swap, the Commission Market reservation, the
 * Guild Hall inspection's takes and finish, Colour Samples and the swap's look), each legal command
 * must be expressible by its form: `fromCommand` gives a draft, revalidating it changes nothing
 * (every value is offered by `options()`), `build` gives the command back and it validates.
 *
 * Inputs:
 * - canonical mode over every scripted scenario and played moment;
 * - **exhaustive** mode over the scripted scenarios, capped at 5,000 commands per view with a
 *   seeded sample above that (the count is logged), because the canonical cap does not prove
 *   every legal move;
 * - canonical mode at every B4 decision of 3 seeded games (2, 3 and 4 players), played to the
 *   end with the engine's sampled legal moves.
 * No row may be `todo`: every B4 window has its real draft model.
 *
 * Workers are placed on the table (owner review, 2026-10-17): every `PLACE_*` row is also routed
 * through the work window's table adapter by the helper (Place shortcut, then the Guild Hall's
 * Tech display target, then the pane's sub-editor); the last block checks that route directly
 * and that it fails when the table does not offer the target.
 */
import { describe, expect, it } from "vitest";
import { SeededRandom, decisionPrompt, legalCommands, sampleLegalAction } from "../../../../src/game/index.ts";
import type { AuthoritativeCommand, PlayerCount, SubmitContributionCommand } from "../../../../src/game/index.ts";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { workDraft } from "../../../../src/app/decision/work/workDraft.ts";
import { decisionWindow } from "../../../../src/app/state/decisionWindow.ts";
import type { DraftActionBase } from "../../../../src/app/state/draftStore.ts";
import { buildGameModel, engineViewOf } from "../../../../src/app/state/model.ts";
import { tableSelection } from "../../../../src/app/state/tableSelection.ts";
import type { TableAdapter } from "../../../../src/app/state/tableSelection.ts";
import type { DecisionWindowKind } from "../../../../src/app/state/decisionWindow.ts";
import { FuzzTable } from "../../engine/p7_support.ts";
import { checkView, tableRoute } from "../support/expressibility.ts";
import type { ExpressibilityReport } from "../support/expressibility.ts";
import { allFixtures, scenarios } from "../support/fixtures.ts";

const B4_WINDOWS: ReadonlySet<DecisionWindowKind> = new Set(["kiln_selection", "setters_mark", "work", "commission", "guild_inspection", "colour_samples", "colour_samples_swap"]);

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
      "SELECT_CHOOSE",
      "GUILD_TAKE",
      "USE_COLOUR_SAMPLES_SWAP",
      "USE_IMPERIAL_PRIORITY",
      "END_TURN",
    ]) {
      expect(families.has(type as AuthoritativeCommand["type"]), type).toBe(true);
    }
    // The removed commands are never offered (v1.6.2 change 25: one Select command).
    for (const type of ["COMMISSION_CHOOSE", "COLOUR_SAMPLES_CHOOSE", "COLOUR_SAMPLES_SWAP_CHOOSE"]) expect(families.has(type as AuthoritativeCommand["type"]), type).toBe(false);
  });

  it("expresses SELECT_CHOOSE in every Select window, a face-up Order and a looked card each (v1.6.2 L64, change 25)", () => {
    const picks = new Map<string, Set<string>>();
    for (const entry of ACTING) {
      const kind = decisionWindow(entry.playerView).kind;
      for (const row of checkView(entry.playerView).rows) {
        if (row.command.type !== "SELECT_CHOOSE" || row.status !== "ok") continue;
        const kinds = picks.get(kind) ?? new Set<string>();
        for (const pick of row.command.reservations) kinds.add(pick.kind);
        if (row.command.reservations.length === 2) kinds.add("pair");
        picks.set(kind, kinds);
      }
    }
    expect([...picks.keys()].sort()).toEqual(["colour_samples", "colour_samples_swap", "commission"]);
    for (const kind of ["commission", "colour_samples", "colour_samples_swap"]) expect([...(picks.get(kind) ?? [])].sort(), kind).toEqual(kind === "commission" ? ["face_up", "looked", "pair"] : ["face_up", "looked"]);
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

describe("B4 placements are reachable from the table (owner review, 2026-10-17)", () => {
  const adapter = WINDOWS.work.table as unknown as TableAdapter<unknown, DraftActionBase>;
  const model = workDraft as never;

  it("every canonical placement of every work fixture: Place shortcut, then the Tech display at the Guild Hall, then the sub-editor", () => {
    let routed = 0;
    const kinds = new Set<string>();
    const guild = new Set<string>();
    for (const entry of ACTING) {
      const view = entry.playerView;
      const window = decisionWindow(view);
      if (window.kind !== "work" || window.step !== "before_action") continue;
      const gameModel = buildGameModel(view, []);
      const engine = engineViewOf(view);
      for (const command of legalCommands(view, { mode: "canonical" })) {
        if (!command.type.startsWith("PLACE_")) continue;
        const expressed = workDraft.fromCommand(command, gameModel, engine);
        expect(expressed, JSON.stringify(command)).not.toBeNull();
        expect(tableRoute(command, expressed!, model, adapter, gameModel, engine), `${entry.id} ${JSON.stringify(command)}`).toBeNull();
        routed += 1;
        kinds.add(command.type);
        if (command.type === "PLACE_GUILD_HALL") guild.add(command.choice.kind);
      }
    }
    expect(routed).toBeGreaterThan(100);
    expect(kinds.size).toBe(7);
    expect([...guild].sort()).toEqual(["buy_face_up", "inspect"]);
  });

  it("fails when the table offers no Place shortcut, or no Tech display chooser at the Guild Hall", () => {
    const id = "w-before-the-worker-action-kiln-furniture-inverted-firing-targets-setters-marks-senior-apprentice";
    const view = ACTING.find((entry) => entry.id === id)!.playerView;
    const gameModel = buildGameModel(view, []);
    const engine = engineViewOf(view);
    const commands = legalCommands(view, { mode: "canonical" });
    const wharf = commands.find((command) => command.type === "PLACE_CANAL_WHARF")!;
    const guild = commands.find((command) => command.type === "PLACE_GUILD_HALL")!;
    const noShortcuts: TableAdapter<unknown, DraftActionBase> = { select: () => tableSelection({}), act: adapter.act };
    expect(tableRoute(wharf, workDraft.fromCommand(wharf, gameModel, engine)!, model, noShortcuts, gameModel, engine)).toMatch(/no legal Place shortcut/);
    const noChooser: TableAdapter<unknown, DraftActionBase> = { select: (draft, m, e) => ({ ...adapter.select(draft, m, e), techChooser: null }), act: adapter.act };
    expect(tableRoute(guild, workDraft.fromCommand(guild, gameModel, engine)!, model, noChooser, gameModel, engine)).toMatch(/without its chooser/);
  });
});
