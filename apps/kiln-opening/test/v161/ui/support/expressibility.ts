/**
 * The expressibility helper (UI_V1.6.1_ARCHITECTURE §9.4). Created by A2; owned by B6 after
 * phase A. Used by `expressibility.work.test.ts` (B4), `expressibility.firing.test.ts` (B5) and
 * `expressibility_complete.test.ts` (B6).
 *
 * For a view and its window it takes the legal commands (`canonical`, the engine's default
 * per-family cap of 64; or `exhaustive`, capped with a seeded reservoir sample) and routes each
 * to the draft model of the form that must express it: the open window's, except
 * `USE_CANAL_BARGE`, which goes to B5's `canalBargeDraft`. For each command it checks that
 * 1. `fromCommand(cmd)` gives a draft;
 * 2. every value in that draft appears in `options(draft)` — checked through the contract of
 *    `reduce(draft, { type: "revalidate" })`, which drops any choice `options()` does not offer,
 *    so revalidating must leave the draft unchanged;
 * 3. `build(draft)` equals `cmd` after `normalizeCommand`;
 * 4. `build(draft)` passes the ConfirmBar check (`validateAction`, or Contribution
 *    affordability).
 *
 * Work placements are made **on the table** (owner review, 2026-10-17): the pane lists no workers
 * or locations. So a `PLACE_*` command of the work window is also routed through the window's
 * table adapter (`tableRoute`): its location and worker must be a legal Place shortcut of the
 * fresh draft (`placeTargets`), the shortcut's `act` must choose exactly them, and at the Guild
 * Hall the Tech or discipline must be a selectable target of the Tech display (`techChooser`)
 * whose `act` sets the sub-draft. The rest of the sub-draft is the pane's sub-editor's (checked by
 * steps 1–3), and the routed draft must build the command.
 *
 * A stub draft model (`stubDraft()`, phase A) is reported as `todo`, never as a failure.
 */
import { isDeepStrictEqual } from "node:util";
import { enumerateLegalActions, legalCommands } from "../../../../src/game/index.ts";
import type { AuthoritativeCommand, PlayerView } from "../../../../src/game/index.ts";
import { canalBargeDraft } from "../../../../src/app/decision/orders/canalBargeDraft.ts";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import type { WorkDraft } from "../../../../src/app/decision/work/workDraft.ts";
import { placementWorkerKey } from "../../../../src/app/state/tableSelection.ts";
import type { TableAdapter } from "../../../../src/app/state/tableSelection.ts";
import { checkCommand } from "../../../../src/app/session/fixtureSource.ts";
import { decisionWindow } from "../../../../src/app/state/decisionWindow.ts";
import type { DecisionWindow, DecisionWindowKind } from "../../../../src/app/state/decisionWindow.ts";
import { REVALIDATE } from "../../../../src/app/state/draftStore.ts";
import type { DraftActionBase, DraftModel, WindowRegistry } from "../../../../src/app/state/draftStore.ts";
import { buildGameModel, engineViewOf } from "../../../../src/app/state/model.ts";
import type { EngineView, GameModel } from "../../../../src/app/state/model.ts";

export type ExpressibilityStatus = "ok" | "todo" | "fail";

/** The form a command belongs to: a window kind, or the Canal Barge sub-form. */
export type ExpressibilityForm = DecisionWindowKind | "canal_barge";

export interface ExpressibilityRow {
  window: DecisionWindowKind;
  form: ExpressibilityForm;
  command: AuthoritativeCommand;
  status: ExpressibilityStatus;
  /** Why it failed (null when ok or todo). */
  problem: string | null;
}

export interface ExpressibilityOptions {
  mode?: "canonical" | "exhaustive";
  /** Exhaustive mode: the most commands checked per view (default 5,000). */
  cap?: number;
  /** Exhaustive mode: the reservoir sample's seed. */
  seed?: number;
  registry?: WindowRegistry;
  /** Draft models for the sub-forms (default: B5's `canalBargeDraft`). */
  canalBarge?: DraftModel<unknown, DraftActionBase, unknown>;
}

export interface ExpressibilityReport {
  window: DecisionWindow;
  /** Every legal command of the mode, before any sampling. */
  total: number;
  rows: ExpressibilityRow[];
}

type AnyDraftModel = DraftModel<unknown, DraftActionBase, unknown>;

/** Drops optional flags that are absent or false, recursively (arrays keep every item). */
export function normalizeCommand(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeCommand);
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === false) continue;
    out[key] = normalizeCommand(entry);
  }
  return out;
}

/** The draft model that must express `command` in `window`. */
export function formFor(
  command: AuthoritativeCommand,
  window: DecisionWindow,
  options: ExpressibilityOptions = {},
): { form: ExpressibilityForm; draft: AnyDraftModel } {
  if (command.type === "USE_CANAL_BARGE") {
    return { form: "canal_barge", draft: options.canalBarge ?? (canalBargeDraft as unknown as AnyDraftModel) };
  }
  const registry = options.registry ?? WINDOWS;
  return { form: window.kind, draft: registry[window.kind].draft };
}

/**
 * A work placement through the table (owner review, 2026-10-17): the Place shortcut, then the
 * Guild Hall's Tech display target, then the sub-editor's values. Returns why it cannot be
 * reached, or null.
 */
export function tableRoute(
  command: AuthoritativeCommand,
  expressed: WorkDraft,
  draft: AnyDraftModel,
  adapter: TableAdapter<unknown, DraftActionBase> | undefined,
  model: GameModel,
  engine: EngineView,
): string | null {
  if (adapter === undefined) return "the work window has no table adapter";
  const { locationId, workerKey } = expressed;
  if (expressed.mode !== "place" || locationId === null || workerKey === null) return "the placement draft names no location or worker";
  const initial = draft.initial(model, engine);
  const entries = adapter.select(initial, model, engine).placeTargets.get(locationId) ?? [];
  if (!entries.some((entry) => entry.legal && placementWorkerKey(entry) === workerKey)) return `no legal Place shortcut for ${workerKey} at ${locationId}`;
  const placeAction = adapter.act(initial, { type: "place", locationId, workerKey }, model, engine);
  if (placeAction === null) return `the Place shortcut for ${workerKey} at ${locationId} does nothing`;
  let routed = draft.reduce(initial, placeAction, model, engine) as WorkDraft;
  if (routed.mode !== "place" || routed.locationId !== locationId || routed.workerKey !== workerKey) return `the Place shortcut chose ${routed.workerKey ?? "nothing"} at ${routed.locationId ?? "nowhere"}`;
  if (locationId === "guild_hall") {
    const chooser = adapter.select(routed, model, engine).techChooser;
    if (chooser === null) return "the Guild Hall placement leaves the Tech display without its chooser";
    const sub = expressed.perLocation.guild_hall;
    if (sub.techId !== null && chooser.techs.get(sub.techId)?.legal !== true) return `${sub.techId} is not a selectable Tech on the Tech display`;
    if (sub.discipline !== null && !chooser.disciplines.has(sub.discipline)) return `${sub.discipline} is not a deck to inspect on the Tech display`;
    const choice = sub.techId !== null ? adapter.act(routed, { type: "tech", techId: sub.techId }, model, engine) : sub.discipline !== null ? adapter.act(routed, { type: "inspect", discipline: sub.discipline }, model, engine) : null;
    if (choice === null) return "the Tech display's choice does nothing";
    routed = draft.reduce(routed, choice, model, engine) as WorkDraft;
    if (!isDeepStrictEqual(routed.perLocation.guild_hall, sub)) return `the Tech display chose ${JSON.stringify(routed.perLocation.guild_hall)}`;
  }
  // The sub-editor's values (Materials Yard split, vessels, loads, reservation…) are the pane's.
  const final = draft.reduce({ ...routed, perLocation: { ...routed.perLocation, [locationId]: expressed.perLocation[locationId] } }, REVALIDATE, model, engine);
  const built = draft.build(final, model, engine);
  if (built === null || !isDeepStrictEqual(normalizeCommand(built), normalizeCommand(command))) return `the table route builds ${JSON.stringify(built)}`;
  return null;
}

/** Checks one command against its form (§9.4 steps 1–4). */
export function checkExpressible(
  view: PlayerView,
  command: AuthoritativeCommand,
  options: ExpressibilityOptions = {},
  context?: { model: GameModel; engine: EngineView },
): ExpressibilityRow {
  const model = context?.model ?? buildGameModel(view, []);
  const engine = context?.engine ?? engineViewOf(view);
  const window = model.window;
  const { form, draft } = formFor(command, window, options);
  const row = (status: ExpressibilityStatus, problem: string | null): ExpressibilityRow => ({ window: window.kind, form, command, status, problem });
  if (draft.stub === true) return row("todo", null);
  const expressed = draft.fromCommand(command, model, engine);
  if (expressed === null) return row("fail", "fromCommand returned null");
  const revalidated = draft.reduce(expressed, REVALIDATE, model, engine);
  if (!isDeepStrictEqual(revalidated, expressed)) return row("fail", "the draft holds a value options() does not offer (revalidate changed it)");
  const built = draft.build(expressed, model, engine);
  if (built === null) return row("fail", "build returned null");
  if (form === "work" && command.type.startsWith("PLACE_")) {
    const registry = options.registry ?? WINDOWS;
    const problem = tableRoute(command, expressed as WorkDraft, draft, registry.work.table as TableAdapter<unknown, DraftActionBase> | undefined, model, engine);
    if (problem !== null) return row("fail", `not reachable from the table: ${problem}`);
  }
  if (!isDeepStrictEqual(normalizeCommand(built), normalizeCommand(command))) {
    return row("fail", `build gave ${JSON.stringify(built)}`);
  }
  const error = checkCommand(view, built);
  if (error !== null) return row("fail", `build does not validate: ${error.code}`);
  return row("ok", null);
}

/** A small seeded generator for the reservoir sample. */
function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

/** The legal commands of a view in a mode; exhaustive mode keeps a seeded sample of `cap`. */
export function commandsFor(view: PlayerView, options: ExpressibilityOptions = {}): { total: number; commands: AuthoritativeCommand[] } {
  if (options.mode !== "exhaustive" || view.game.phase.type === "firing_contributions") {
    const commands = legalCommands(view, { mode: options.mode ?? "canonical" });
    return { total: commands.length, commands };
  }
  const cap = options.cap ?? 5_000;
  const random = seeded(options.seed ?? 1_610);
  const sample: AuthoritativeCommand[] = [];
  let total = 0;
  for (const action of enumerateLegalActions(view, { mode: "exhaustive" })) {
    total += 1;
    if (sample.length < cap) sample.push(action);
    else {
      const slot = Math.floor(random() * total);
      if (slot < cap) sample[slot] = action;
    }
  }
  return { total, commands: sample };
}

/** Every legal command of a view's window, checked. */
export function checkView(view: PlayerView, options: ExpressibilityOptions = {}): ExpressibilityReport {
  const model = buildGameModel(view, []);
  const engine = engineViewOf(view);
  const { total, commands } = commandsFor(view, options);
  return {
    window: decisionWindow(view),
    total,
    rows: commands.map((command) => checkExpressible(view, command, options, { model, engine })),
  };
}
