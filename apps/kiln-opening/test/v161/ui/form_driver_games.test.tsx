// @vitest-environment happy-dom
/**
 * The forms can play the whole game (UI_V1.6.1_ARCHITECTURE §9.4, `form_driver_games`). Owner: B6.
 *
 * Full 2-, 3- and 4-player games are played **only through the decision forms**: the real
 * `DecisionPane` with every window of the registry renders from its draft model's `options()`;
 * the autopilot (`e2e/support/autopilot.ts`, shared with `e2e/full_game.spec.ts`) makes seeded
 * choices among the enabled native inputs and buttons the form shows; ConfirmBar builds the
 * command and runs the local check (`validateAction`); the harness then applies it to the engine
 * (tests may call the engine). Every seat is driven this way, hot-seat: the pane always shows the
 * acting seat's own view (its hand, its private looks, its sealed Contribution).
 *
 * Every game must reach `finalResult`, and every command a form sends must be accepted by the
 * engine. `KILN_UI_FUZZ_GAMES` plays more games per player count (like `test:fuzz:long`).
 *
 * A steered game also reaches the optional abilities a random autopilot rarely meets — Canal
 * Barge, Protective Saggars, Ge's Crackle and Kiln Master — through their real form controls: a
 * short preference list (Ge at Kiln selection, the Guild Hall and those Techs when offered, then
 * the ability's own option) is tried once per decision before the autopilot's own pick. The forms
 * still build every command, and the engine still accepts each one.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SeededRandom, createGame } from "../../../src/game/index.ts";
import type { AuthoritativeCommand, PlayerId, PlayerView } from "../../../src/game/index.ts";
import { DecisionPane } from "../../../src/app/decision/DecisionPane.tsx";
import { WINDOWS } from "../../../src/app/decision/windows.ts";
import { I18nProvider } from "../../../src/app/i18n/I18nProvider.tsx";
import { fixtureSnapshot } from "../../../src/app/session/fixtureSource.ts";
import type { GameSnapshot, GameSource, SubmitOutcome } from "../../../src/app/session/gameSource.ts";
import { DraftStore } from "../../../src/app/state/draftStore.ts";
import { GameProvider } from "../../../src/app/state/hooks.ts";
import { fixedLayoutSource } from "../../../src/app/state/layoutMode.ts";
import { UiStore } from "../../../src/app/state/uiStore.ts";
import { autopilotPick } from "../../../e2e/support/autopilot.ts";
import { LocalTable } from "../engine/support/localTable.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A game source over a local engine table, hot-seat: the snapshot is always the acting seat's
 * own view, and a submitted command is applied to the engine at once (no optimistic state: the
 * pane changes only when the new view arrives).
 */
class TableSource implements GameSource {
  private snapshot: GameSnapshot;
  private readonly listeners = new Set<() => void>();
  readonly sent: Array<{ actorId: PlayerId; command: AuthoritativeCommand }> = [];
  readonly rejected: string[] = [];

  constructor(readonly table: LocalTable) {
    this.snapshot = this.snapshotFor(this.actor());
  }

  actor(): PlayerId | null {
    return this.table.prompt().actorIds[0] ?? null;
  }

  private snapshotFor(actorId: PlayerId | null): GameSnapshot {
    const viewerId = actorId ?? this.table.state.playerOrder[0]!;
    const playerView = this.table.actorView(viewerId) as unknown as PlayerView;
    return fixtureSnapshot({ id: "form-driver", viewerId, playerView });
  }

  getSnapshot = (): GameSnapshot => this.snapshot;
  getServerSnapshot = (): GameSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async submit(command: AuthoritativeCommand): Promise<SubmitOutcome> {
    const actorId = this.snapshot.view?.viewerId ?? null;
    if (actorId === null) return { kind: "ignored" };
    this.sent.push({ actorId, command });
    const result = command.type === "SUBMIT_CONTRIBUTION" ? this.table.tryContribute(actorId, command.card, command.fuelLedger) : this.table.tryAct(actorId, command);
    if (!result.ok) {
      this.rejected.push(`${actorId} ${JSON.stringify(command)}: ${result.error.code}`);
      return { kind: "rejected", error: { kind: "rule", error: result.error } };
    }
    this.snapshot = this.snapshotFor(this.actor());
    for (const listener of [...this.listeners]) listener();
    return { kind: "success", revision: this.table.state.revision };
  }

  async resend(): Promise<SubmitOutcome> {
    return { kind: "ignored" };
  }
  async reconnect(): Promise<void> {}
  retryComputers(): void {}
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const GAMES = Math.max(1, Number(process.env["KILN_UI_FUZZ_GAMES"] ?? "1"));
/** The most autopilot moves for one decision before the form counts as stuck. */
const MAX_MOVES_PER_DECISION = 400;

interface GameReport {
  decisions: number;
  moves: number;
  windows: Map<string, number>;
  commands: Map<string, number>;
  /** Every command the forms sent, in order. */
  sent: ReadonlyArray<{ actorId: PlayerId; command: AuthoritativeCommand }>;
}

/** The optional abilities a game's forms used: the command types, and Kiln Master inside RESOLVE_HEAT_MARKERS. */
function abilitiesUsed(report: GameReport): Set<string> {
  const used = new Set<string>();
  for (const { command } of report.sent) {
    if (command.type === "USE_CANAL_BARGE" || command.type === "USE_PROTECTIVE_SAGGARS" || command.type === "USE_GE_CRACKLE") used.add(command.type);
    if (command.type === "RESOLVE_HEAT_MARKERS" && command.kilnMaster !== undefined) used.add("RESOLVE_HEAT_MARKERS.kilnMaster");
  }
  return used;
}

/**
 * Steering for the optional-ability game: selectors of form controls, tried in order before each
 * autopilot pick; each is clicked at most once per decision, and only when it is enabled, shown
 * and not already chosen, so the autopilot still completes (or changes) every form.
 */
const ABILITY_PREFERENCES: readonly string[] = [
  'input[name="kilnId"][value="GE"]',
  'input[name="mode"][value="canal_barge"]',
  'input[name="afterQuality"][value^="protective_saggars:"]',
  'input[name="afterQuality"][value^="ge_crackle:"]',
  'input[name="kilnMasterCeramicId"]:not([value="none"])',
  'input[name="take"][value="T23"]',
  'input[name="take"][value="T11"]',
  'input[name="take"][value="T24"]',
  'input[name="techId"][value="T23"]',
  'input[name="techId"][value="T11"]',
  'input[name="techId"][value="T24"]',
  'input[name="locationId"][value="guild_hall"]',
];

function preferredMove(preferences: readonly string[], tried: Set<string>): HTMLElement | null {
  const form = document.querySelector("form.pane-form[data-window]");
  if (form === null) return null;
  for (const selector of preferences) {
    if (tried.has(selector)) continue;
    const element = Array.from(form.querySelectorAll<HTMLInputElement>(selector)).find(
      (input) => input.getAttribute("aria-disabled") !== "true" && !input.disabled && !input.checked && input.closest("[hidden], [inert], details:not([open])") === null,
    );
    if (element === undefined) continue;
    tried.add(selector);
    return element;
  }
  return null;
}

async function playThroughForms(players: 2 | 3 | 4, seed: number, preferences: readonly string[] = []): Promise<GameReport> {
  // A fresh game at Kiln selection (the engine-test `newGame` would pick the Kilns itself).
  const rng = new SeededRandom(seed);
  const names = ["Lin", "Zhao", "Su", "Wen"];
  const created = createGame({ gameId: `form-driver-${seed}`, players: names.slice(0, players).map((displayName, seat) => ({ id: `p${seat + 1}`, displayName })) }, rng, { checkInvariants: true });
  if (!created.ok) throw new Error(created.error.code);
  const table = new LocalTable(created.state, { rng });
  table.events.push(...created.events);
  const source = new TableSource(table);
  const layout = fixedLayoutSource("desktop");
  await act(async () =>
    root.render(
      <I18nProvider defaultLocale={seed % 2 === 0 ? "en" : "zh-CN"} strict>
        <GameProvider source={source} registry={WINDOWS} drafts={new DraftStore()} ui={new UiStore({ layout })} layout={layout} devTools={false}>
          <DecisionPane />
        </GameProvider>
      </I18nProvider>,
    ),
  );
  const report: GameReport = { decisions: 0, moves: 0, windows: new Map(), commands: new Map(), sent: source.sent };
  let tick = 0;
  while (table.state.phase.type !== "finished") {
    report.decisions += 1;
    expect(report.decisions, "the game ends").toBeLessThan(4_000);
    const sentBefore = source.sent.length;
    const revisionBefore = table.state.revision;
    let moves = 0;
    const trail: string[] = [];
    const tried = new Set<string>();
    while (source.sent.length === sentBefore) {
      moves += 1;
      if (moves > MAX_MOVES_PER_DECISION) {
        throw new Error(`stuck in ${trail.at(-1) ?? "?"} after ${MAX_MOVES_PER_DECISION} moves (revision ${revisionBefore}):\n${trail.slice(-12).join("\n")}`);
      }
      tick += 1;
      const preferred = preferredMove(preferences, tried);
      if (preferred !== null) {
        trail.push(`preferred ${preferred.getAttribute("name") ?? ""}=${preferred.getAttribute("value") ?? ""}`);
        await act(async () => {
          preferred.click();
        });
        continue;
      }
      const pick = autopilotPick({ seed, tick, confirmChance: 0.55, altChance: 0.25 });
      if (pick.kind === "none" || pick.kind === "busy") throw new Error(`no move in ${pick.window ?? "no window"}: ${pick.kind === "none" ? pick.reason : "busy"}`);
      trail.push(`${pick.window}: ${pick.describe}`);
      if (pick.kind === "confirm" || pick.kind === "alt") report.windows.set(pick.window, (report.windows.get(pick.window) ?? 0) + 1);
      const target = document.querySelector<HTMLElement>(pick.selector);
      expect(target, pick.selector).not.toBeNull();
      await act(async () => {
        target!.click();
      });
    }
    report.moves += moves;
    const last = source.sent.at(-1)!;
    report.commands.set(last.command.type, (report.commands.get(last.command.type) ?? 0) + 1);
    expect(source.rejected, "every command a form sends is accepted").toEqual([]);
  }
  expect(table.state.finalResult).not.toBeNull();
  expect(container.querySelector('form.pane-form[data-window="final"]')).not.toBeNull();
  return report;
}

describe("full games played only through the decision forms (§9.4)", () => {
  const cases = ([2, 3, 4] as const).flatMap((players) => Array.from({ length: GAMES }, (_, index) => [players, 1_700 + players * 10 + index] as const));
  const used = new Set<string>();

  it.each(cases)("%i players (seed %i)", async (players, seed) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const report = await playThroughForms(players, seed);
      for (const type of report.commands.keys()) used.add(type);
      expect(report.commands.get("SELECT_KILN"), "every Kiln chosen in the Kiln-selection form").toBe(players);
      const placements = [...report.commands.keys()].filter((type) => type.startsWith("PLACE_") && type !== "PLACE_SETTERS_MARK");
      expect(placements.length, "several kinds of placement").toBeGreaterThanOrEqual(4);
      for (const window of ["kiln_selection", "work"]) expect(report.windows.get(window) ?? 0, window).toBeGreaterThan(0);
      expect(consoleError).not.toHaveBeenCalled();
      console.info(
        `${players}p seed ${seed}: ${report.decisions} decisions, ${report.moves} moves; commands ${[...report.commands.entries()].map(([type, n]) => `${type}×${n}`).join(", ")}`,
      );
    } finally {
      consoleError.mockRestore();
    }
  }, 600_000);

  it("together, the games used every placement form, the Commission and Guild steps, Contributions, Orders and the trim", () => {
    for (const type of [
      "PLACE_MATERIALS_YARD",
      "PLACE_FORM_DECORATE",
      "PLACE_GLAZE_LOAD",
      "PLACE_COMMISSION_MARKET",
      "PLACE_GUILD_HALL",
      "PLACE_CANAL_WHARF",
      "PLACE_MAGISTRATES_HALL",
      "SUBMIT_CONTRIBUTION",
      "COMPLETE_ORDER",
      "DISCARD_TO_HAND_LIMIT",
    ]) {
      expect(used.has(type), type).toBe(true);
    }
  });
});

describe("steered games reach the optional abilities through their forms", () => {
  // Seeds found by playing steered games (3 and 4 players): together they use all four.
  const steered = [
    [4, 5_002],
    [3, 5_003],
  ] as const;
  const used = new Set<string>();

  it.each(steered)("%i players (seed %i)", async (players, seed) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const report = await playThroughForms(players, seed, ABILITY_PREFERENCES);
      for (const ability of abilitiesUsed(report)) used.add(ability);
      expect(consoleError).not.toHaveBeenCalled();
      console.info(`${players}p seed ${seed} (steered): ${[...abilitiesUsed(report)].join(", ")}`);
    } finally {
      consoleError.mockRestore();
    }
  }, 600_000);

  it("together, Canal Barge, Protective Saggars, Ge's Crackle and Kiln Master were sent from their forms", () => {
    expect([...used].sort()).toEqual(["RESOLVE_HEAT_MARKERS.kilnMaster", "USE_CANAL_BARGE", "USE_GE_CRACKLE", "USE_PROTECTIVE_SAGGARS"]);
  });
});
