/**
 * UI fixtures from the real engine, now V1.6.2 (UI_V1.6.1_ARCHITECTURE.md §9.1; ENGINE_V1.6.2_DELTA.md §9).
 *
 * Two targets:
 * - `--target tests` (default): `test/v161/ui/fixtures/`
 *   - `scenarios.json`: every scripted decision window (`phaseScenarios`, kind `window`) and
 *     table state (`tableScenarios`, kind `table`), projected for one viewer. Fast and
 *     deterministic; `fixtures_current.test.ts` regenerates it in memory on every `npm test`;
 *   - `moments.json`: played moments m1–m18 (realistic text lengths, for layout, the gallery and
 *     screenshots). A moment whose seed search exceeds its budget falls back to the matching
 *     scripted scenario (`source.kind: "scripted"`);
 *   - `secrets.json`: per entry, the Order and Tech IDs that viewer must never see (the oracle
 *     of the rendered-markup leak test; never loaded by `src/app`).
 * - `--target wireframe`: `docs/ui-v1.6.1/fixtures.json`, the legacy file the signed-off
 *   wireframe renders. It is frozen with the wireframe; regenerating it is not part of any gate.
 *
 * Every entry holds only what the viewer's client may hold: the viewer's `PlayerView` (public
 * projection + own private view), the public event records and the viewer's own secret events
 * (`ownSecrets`, full events with `secret.visibleTo` = the viewer). `tools/fixturePrivacy.ts`
 * checks each entry against the authoritative state and log at capture time, and the written
 * files again without it.
 *
 * Seeded games are driven through `createGame` / `applyAction` / `submitContribution` by the
 * strategic computer policy (src/multiplayer/computerPlayer.ts). Some moments need one seat
 * to make a specific (legal, engine-validated) choice; those "steered" commands are recorded
 * per moment.
 *
 *   npm run fixtures                       # vite-node tools/uiFixtures.ts --target tests
 *   npm run fixtures:check                 # regenerate in memory, byte-diff, privacy verify
 *   npx vite-node tools/uiFixtures.ts --target wireframe      # the frozen wireframe file
 *   npx vite-node tools/uiFixtures.ts --verify [file]         # privacy check of the wireframe file
 *   npx vitest run --config tools/uiFixtures.vitest.config.ts # the tests target, under Vitest
 *
 * Importing this module (as `fixtures_current.test.ts` does) runs nothing.
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import roundStructureJson from "../data/round_structure.json" with { type: "json" };
import {
  DECORATIONS,
  DISCIPLINES,
  FIRING,
  GAME_CONFIG,
  GLAZES,
  IMPERIAL_TRACK,
  KILNS,
  KILN_IDS,
  KILN_SPACE_IDS,
  LOCATIONS,
  LOCATION_IDS,
  ORDERS,
  ORDER_IDS,
  QUALITIES,
  RULE_ERROR_TEXT,
  RULES_VERSION,
  SHAPES,
  SeededRandom,
  TECHS,
  TECH_IDS,
  DECORATION_TEXT,
  DISCIPLINE_TEXT,
  GLAZE_TEXT,
  PHASE_TEXT,
  QUALITY_TEXT,
  RESOURCE_TEXT,
  SHAPE_TEXT,
  STAGE_TEXT,
  WORKER_TEXT,
  ZONE_TEXT,
  activeKilnSpaces,
  actorViewOf,
  afterQualityOptions,
  applyAction,
  boardView,
  colourSamplesSwapOptions,
  commissionOptions,
  completableOrders,
  contributionOptions,
  createGame,
  decisionPrompt,
  firingSummary,
  guildOptions,
  handLimitStatus,
  heatMarkerStepOptions,
  heatMarkerTargets,
  heatPreviews,
  imperialPriorityOptions,
  junOptions,
  kilnSelectionOptions,
  legalCommands,
  loadDestinationOptions,
  locationCapacity,
  lookedOrderOptions,
  magistratesHallQuote,
  orderMatchOptions,
  orderSelectionCheck,
  placementOptions,
  playerSummary,
  projectEvent,
  quoteFormDecorate,
  quoteMaterialsYard,
  rulesFingerprint,
  salvageOptions,
  scorePreview,
  settersMarkOptions,
  shapedVessels,
  submitContribution,
  testPiecesOptions,
  viewOf,
} from "../src/game/index.ts";
import type {
  ActorView,
  AuthoritativeCommand,
  CommissionPick,
  DecisionPrompt,
  GameEvent,
  GameState,
  KilnId,
  PlayerCount,
  PlayerId,
  PlayerView,
  PrivateFiringState,
  PublicGameEvent,
  RoundNumber,
  TechId,
} from "../src/game/index.ts";
import { createStrategicComputerPolicy, fallbackComputerCommands } from "../src/multiplayer/index.ts";
import { phaseScenarios } from "../test/v161/engine/phase_scenarios.ts";
import type { LocalTable } from "../test/v161/engine/support/localTable.ts";
import { tableScenarios } from "../test/v161/ui/fixtures/tableScenarios.ts";
import {
  assertNoForeignSecrets,
  entryStructureProblems,
  secretIdsFor,
  verifyFixtureEntries,
  type FixtureEventRecord,
  type PrivacyCheckedEntry,
} from "./fixturePrivacy.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT_DIR = resolve(ROOT, "docs/ui-v1.6.1");
const OUT_FILE = resolve(OUT_DIR, "fixtures.json");
/** The tests target's directory (UI plan §9.1). */
export const TEST_FIXTURE_DIR = resolve(ROOT, "test/v161/ui/fixtures");
export const TEST_FIXTURE_FILES = {
  scenarios: resolve(TEST_FIXTURE_DIR, "scenarios.json"),
  moments: resolve(TEST_FIXTURE_DIR, "moments.json"),
  secrets: resolve(TEST_FIXTURE_DIR, "secrets.json"),
} as const;

/** The clock never advances, so the policy's decision deadline never fires: deterministic. */
const POLICY = createStrategicComputerPolicy({ now: () => 0 });
const RECENT_EVENTS = 24;
/** Scripted scenarios are short: their whole log is kept. */
const SCENARIO_EVENTS = 60;
const SEAT_NAMES = ["Lin", "Zhao", "Wen", "Su"] as const;

type Target = "tests" | "wireframe";
/** What `capture` builds: the legacy wireframe moment or the tests entry. */
let TARGET: Target = "tests";

// ═══════════════════════════════════════════════════════════════════════════════════════
// Table driver
// ═══════════════════════════════════════════════════════════════════════════════════════

interface LoggedEvent {
  seq: number;
  revision: number;
  actorId: PlayerId;
  event: GameEvent;
}

interface SteeredCommand {
  revision: number;
  playerId: PlayerId;
  command: AuthoritativeCommand;
  why: string;
}

/** A steering hook: return a command for `actor` to try instead of the policy, or null. */
type Steer = (table: Table, actor: PlayerId) => { command: AuthoritativeCommand; why: string } | null;

class Table {
  state: GameState;
  priv: PrivateFiringState;
  readonly rng: SeededRandom;
  readonly events: LoggedEvent[] = [];
  readonly steered: SteeredCommand[] = [];
  commands = 0;

  constructor(
    readonly seed: number,
    readonly playerCount: PlayerCount,
  ) {
    this.rng = new SeededRandom(seed);
    const players = Array.from({ length: playerCount }, (_, i) => ({ id: `p${i + 1}`, displayName: SEAT_NAMES[i] ?? `Seat ${i + 1}` }));
    const created = createGame({ gameId: `ui-fixture-${playerCount}p-${seed}`, players }, this.rng, { checkInvariants: true });
    if (!created.ok) throw new Error(`createGame failed: ${created.error.code}`);
    this.state = created.state;
    this.priv = { gameId: this.state.gameId, windowId: null, submissions: {} };
    // The service records the creation events under the host who started the game.
    this.log(created.events, players[0]?.id ?? "p1");
    this.syncWindow();
  }

  private log(events: readonly GameEvent[], actorId: PlayerId): void {
    for (const event of events) this.events.push({ seq: this.events.length + 1, revision: this.state.revision, actorId, event });
  }

  private syncWindow(): void {
    const phase = this.state.phase;
    if (phase.type === "firing_contributions" && this.priv.windowId !== phase.windowId) {
      this.priv = { gameId: this.state.gameId, windowId: phase.windowId, submissions: {} };
    }
  }

  actor(): PlayerId | null {
    return decisionPrompt(this.state).actorIds[0] ?? null;
  }

  view(playerId: PlayerId): ActorView {
    return actorViewOf(this.state, playerId, this.priv);
  }

  /** The viewer's client view: public projection + own private view only. */
  playerView(playerId: PlayerId): PlayerView {
    return viewOf(this.state, playerId, this.priv);
  }

  tryApply(playerId: PlayerId, command: AuthoritativeCommand): boolean {
    if (command.type === "SUBMIT_CONTRIBUTION") {
      const result = submitContribution(this.state, this.priv, playerId, command, this.rng, { checkInvariants: true });
      if (!result.ok) return false;
      this.state = result.state;
      this.priv = result.privateState;
      this.log(result.events, playerId);
    } else {
      const result = applyAction(this.state, playerId, command, this.rng, { checkInvariants: true });
      if (!result.ok) return false;
      this.state = result.state;
      this.log(result.events, playerId);
    }
    this.commands += 1;
    this.syncWindow();
    return true;
  }

  /** One decision: the steer hook if it returns a legal command, else the strategic policy,
   * else the service's canonical fallback. */
  step(steer: Steer | null): void {
    const actor = this.actor();
    if (actor === null) throw new Error(`No actor in ${this.state.phase.type}`);
    const steered = steer?.(this, actor) ?? null;
    if (steered !== null) {
      const revision = this.state.revision;
      if (this.tryApply(actor, steered.command)) {
        this.steered.push({ revision, playerId: actor, command: steered.command, why: steered.why });
        return;
      }
    }
    const view = this.view(actor);
    let proposal: AuthoritativeCommand | null = null;
    try {
      proposal = POLICY.chooseCommand(view, { playerId: actor, displayName: actor, aiSeed: this.seed * 7919 + actor.length, aiPolicyVersion: POLICY.version }) as AuthoritativeCommand | null;
    } catch {
      proposal = null;
    }
    if (proposal !== null && this.tryApply(actor, proposal)) return;
    const fallback = fallbackComputerCommands(view).find((c) => this.tryApply(actor, c));
    if (fallback === undefined) throw new Error(`No legal command for ${actor} in ${this.state.phase.type}`);
  }

  /** Plays until `stop(actor)` holds before a decision (returns the actor) or the game ends. */
  runUntil(stop: (table: Table, actor: PlayerId) => boolean, steer: Steer | null = null, maxCommands = 3_000): PlayerId | null {
    while (this.state.phase.type !== "finished") {
      const actor = this.actor();
      if (actor === null) throw new Error(`No actor in ${this.state.phase.type}`);
      if (stop(this, actor)) return actor;
      if (this.commands >= maxCommands) throw new Error(`Seed ${this.seed} exceeded ${maxCommands} commands`);
      this.step(steer);
    }
    return null;
  }

  recentPublicEvents(count = RECENT_EVENTS): Array<{ seq: number; revision: number; event: PublicGameEvent }> {
    return this.events.slice(-count).map((e) => ({ seq: e.seq, revision: e.revision, event: projectEvent(e.event) }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Entries (tests target) and legacy moments (wireframe target)
// ═══════════════════════════════════════════════════════════════════════════════════════

/** Where an entry comes from. */
export type UiFixtureSource =
  | {
      kind: "played";
      seed: number;
      playerCount: PlayerCount;
      gameId: string;
      round: RoundNumber;
      revision: number;
      phase: string;
      commandsPlayed: number;
      policy: string;
      steered: SteeredCommand[];
    }
  | {
      kind: "scripted";
      /** `phaseScenarios` (test/v161/engine/phase_scenarios.ts) or `tableScenarios`. */
      from: "phaseScenarios" | "tableScenarios";
      scenario: string;
      round: RoundNumber;
      revision: number;
      phase: string;
    };

/**
 * One fixture: what one viewer's client holds at one moment (`scenarios.json`,
 * `moments.json`). `FixtureGameSource` (src/app/session/fixtureSource.ts) reads `id`, `name`,
 * `kind`, `viewerId`, `playerView`, `recentPublicEvents` and `ownSecrets`.
 */
export interface UiFixtureEntry extends PrivacyCheckedEntry {
  id: string;
  name: string;
  kind: "window" | "table" | "moment";
  description: string;
  viewerId: PlayerId;
  /** The viewer is among `decisionPrompt.actorIds`. */
  viewerActs: boolean;
  decisionPrompt: DecisionPrompt;
  /** `actorViewOf(state, viewer, privateState)`: public projection + the viewer's own view. */
  playerView: PlayerView;
  /** The last public events (all of a scripted scenario's), numbered from the first event. */
  recentPublicEvents: Array<FixtureEventRecord<PublicGameEvent>>;
  /** Every secret event of the viewer's own so far (full events, `secret.visibleTo` = viewer). */
  ownSecrets: Array<FixtureEventRecord<GameEvent>>;
  source: UiFixtureSource;
  notes: string[];
}

interface Moment {
  id: string;
  title: string;
  description: string;
  source: {
    seed: number;
    playerCount: PlayerCount;
    gameId: string;
    round: RoundNumber;
    revision: number;
    phase: string;
    commandsPlayed: number;
    policy: string;
    steered: SteeredCommand[];
  };
  viewerId: PlayerId;
  viewerActs: boolean;
  playerView: PlayerView;
  decisionPrompt: ReturnType<typeof decisionPrompt>;
  selectors: Record<string, unknown>;
  recentPublicEvents: Array<{ seq: number; revision: number; event: PublicGameEvent }>;
  notes: string[];
}

/** A capture in the current `TARGET`'s format, with its secrets oracle (tests target). */
interface Captured {
  id: string;
  legacy: Moment | null;
  entry: UiFixtureEntry | null;
  secrets: string[] | null;
}

interface EventLog {
  /** Full authoritative events, `sequence` = index + 1. */
  records: ReadonlyArray<FixtureEventRecord<GameEvent>>;
}

/** Builds and privacy-checks one entry; returns it with its secrets oracle. */
function entryOf(args: {
  id: string;
  name: string;
  kind: UiFixtureEntry["kind"];
  description: string;
  notes: string[];
  source: UiFixtureSource;
  state: GameState;
  privateState: PrivateFiringState;
  log: EventLog;
  viewerId: PlayerId;
  recent: number;
}): { entry: UiFixtureEntry; secrets: string[] } {
  const { state, privateState, log, viewerId } = args;
  const prompt = decisionPrompt(state);
  const view = actorViewOf(state, viewerId, privateState);
  const entry: UiFixtureEntry = {
    id: args.id,
    name: args.name,
    kind: args.kind,
    description: args.description,
    viewerId,
    viewerActs: state.phase.type !== "finished" && prompt.actorIds.includes(viewerId),
    decisionPrompt: prompt,
    playerView: { viewerId: view.viewerId, game: view.game, own: view.own },
    recentPublicEvents: log.records.slice(-args.recent).map((r) => ({ sequence: r.sequence, revision: r.revision, actorId: r.actorId, event: projectEvent(r.event) })),
    ownSecrets: log.records
      .filter((r) => (r.event as { secret?: { visibleTo: PlayerId } }).secret?.visibleTo === viewerId)
      .map((r) => ({ sequence: r.sequence, revision: r.revision, actorId: r.actorId, event: structuredClone(r.event) })),
    source: args.source,
    notes: args.notes,
  };
  const events = log.records.map((r) => r.event);
  assertNoForeignSecrets(state, privateState, entry, events);
  return { entry, secrets: secretIdsFor(state, viewerId, events) };
}

function tableLog(table: Table): EventLog {
  return { records: table.events.map((e) => ({ sequence: e.seq, revision: e.revision, actorId: e.actorId, event: e.event })) };
}

/** A legacy moment, checked with the shared privacy rules (no own secrets in that format). */
function checkLegacy(table: Table, moment: Moment): void {
  const entry = {
    ...moment,
    recentPublicEvents: moment.recentPublicEvents.map((e) => ({ sequence: e.seq, revision: e.revision, actorId: "", event: e.event })),
    ownSecrets: [],
  };
  assertNoForeignSecrets(table.state, table.priv, entry, table.events.map((e) => e.event));
}

/** Selectors every moment carries (all public information, or the viewer's own). */
function commonSelectors(view: PlayerView): Record<string, unknown> {
  const game = view.game;
  const turn = boardView(view).turnOrder;
  return {
    boardView: boardView(view),
    playerSummaries: turn.map((pid) => playerSummary(view, pid)),
    scorePreviews: turn.map((pid) => scorePreview(view, pid)),
    handLimitStatus: Object.fromEntries(turn.map((pid) => [pid, handLimitStatus(view, pid)])),
    heatPreviews: heatPreviews(view),
    firingSummary: firingSummary(view),
    kilnLayout: {
      playerCount: game.playerCount,
      activeSpaces: [...activeKilnSpaces(game.playerCount)],
      coveredSpaces: KILN_SPACE_IDS.filter((id) => !activeKilnSpaces(game.playerCount).includes(id)),
      centralCapacities: Object.fromEntries(
        LOCATION_IDS.filter((id) => LOCATIONS[id].scope === "central").map((id) => [id, locationCapacity(id, game.playerCount)]),
      ),
    },
  };
}

/** Canonical legal commands for the viewer, grouped by type (capped so the file stays small). */
function legalCommandSummary(view: PlayerView, perType = 12): Record<string, unknown> {
  if (view.viewerId === null || !decisionPrompt(view.game).actorIds.includes(view.viewerId)) {
    return { viewerActs: false, total: 0, byType: {} };
  }
  const all = legalCommands(view, { mode: "canonical" });
  const byType: Record<string, { count: number; examples: AuthoritativeCommand[] }> = {};
  for (const command of all) {
    const bucket = (byType[command.type] ??= { count: 0, examples: [] });
    bucket.count += 1;
    if (bucket.examples.length < perType) bucket.examples.push(command);
  }
  return { viewerActs: true, mode: "canonical", total: all.length, byType };
}

/** Heat ladder for the legacy wireframe's docked FiringStage (the production UI never shows it, D3). */
function heatLadder(view: PlayerView): Record<string, unknown> | null {
  const firing = firingSummary(view);
  if (firing === null) return null;
  const previews = new Map(heatPreviews(view).map((p) => [p.ceramicId, p]));
  const records = Object.values(firing.ceramics)
    .filter((r) => r !== undefined)
    .sort((a, b) => Number(a.ceramicId.slice(1)) - Number(b.ceramicId.slice(1)));
  return {
    round: firing.round,
    kilnDie: firing.kilnDie,
    baseHeat: firing.baseHeat,
    unclampedBaseHeat: firing.unclampedBaseHeat,
    fireModifier: firing.fireModifier,
    globalHeat: firing.globalHeat,
    contributions: firing.contributions,
    baseHeatClamp: FIRING.baseHeat,
    preferredHeatBands: GLAZES.map((glaze) => ({ glaze, preferredHeat: GAME_CONFIG.glazes[glaze] })),
    qualityByHeatDifference: FIRING.qualityByHeatDifference,
    chips: records.map((r) => {
      const calc = r.second ?? r.first;
      return {
        ceramicId: r.ceramicId,
        ownerId: r.ownerId,
        kiln: r.kiln,
        spaceId: r.spaceId,
        glaze: r.glaze,
        preferredHeat: r.preferredHeat,
        positionSource: r.positionSource,
        heatBeforeFire: previews.get(r.ceramicId)?.heatBeforeFire ?? null,
        heatSource: calc?.heatSource ?? null,
        positionModifier: calc?.positionModifier ?? null,
        heatMarker: calc?.heatMarker ?? null,
        actualHeat: calc?.actualHeat ?? null,
        junAdjustment: calc?.junAdjustment ?? null,
        finalActualHeat: calc?.finalActualHeat ?? null,
        heatDifference: calc?.heatDifference ?? null,
        quality: r.quality,
        crackle: r.crackle,
        secondFiring: r.second !== null,
        history: r.history,
      };
    }),
  };
}

function capture(
  table: Table,
  viewerId: PlayerId,
  meta: { id: string; title: string; description: string; notes?: string[] },
  extra: (view: PlayerView, actor: ActorView) => Record<string, unknown>,
): Captured {
  const source = {
    seed: table.seed,
    playerCount: table.playerCount,
    gameId: table.state.gameId,
    round: table.state.round,
    revision: table.state.revision,
    phase: table.state.phase.type,
    commandsPlayed: table.commands,
    policy: POLICY.version,
    steered: structuredClone(table.steered),
  };
  if (TARGET === "tests") {
    const { entry, secrets } = entryOf({
      id: meta.id,
      name: meta.title,
      kind: "moment",
      description: meta.description,
      notes: meta.notes ?? [],
      source: { kind: "played", ...source },
      state: table.state,
      privateState: table.priv,
      log: tableLog(table),
      viewerId,
      recent: RECENT_EVENTS,
    });
    return { id: meta.id, legacy: null, entry, secrets };
  }
  const view = table.playerView(viewerId);
  const actor = table.view(viewerId);
  const prompt = decisionPrompt(view.game);
  const moment: Moment = {
    id: meta.id,
    title: meta.title,
    description: meta.description,
    source,
    viewerId,
    viewerActs: prompt.actorIds.includes(viewerId),
    playerView: view,
    decisionPrompt: prompt,
    selectors: { ...commonSelectors(view), ...extra(view, actor), legalCommands: legalCommandSummary(view) },
    recentPublicEvents: table.recentPublicEvents(),
    notes: meta.notes ?? [],
  };
  checkLegacy(table, moment);
  return { id: meta.id, legacy: moment, entry: null, secrets: null };
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Moment searches (m1–m9: the wireframe set)
// ═══════════════════════════════════════════════════════════════════════════════════════

type Found = { moment: Captured; score: number } | null;

function phaseIs(table: Table, type: GameState["phase"]["type"]): boolean {
  return table.state.phase.type === type;
}

function beforeAction(table: Table, actor: PlayerId): boolean {
  const phase = table.state.phase;
  return phase.type === "work_turn" && phase.activePlayerId === actor && phase.step.kind === "before_action";
}

/** Steers one seat's Kiln choice (if still available); everything else is the policy's. */
function kilnSteer(seat: PlayerId, kilnId: KilnId): Steer {
  return (table, actor) =>
    actor === seat && phaseIs(table, "setup_kiln_selection")
      ? { command: { type: "SELECT_KILN", kilnId }, why: `Seat ${seat} takes ${kilnId} so the fixture shows its ability.` }
      : null;
}

function combine(...steers: Steer[]): Steer {
  return (table, actor) => {
    for (const s of steers) {
      const r = s(table, actor);
      if (r !== null) return r;
    }
    return null;
  };
}

function workSelectors(view: PlayerView, actor: ActorView): Record<string, unknown> {
  const viewer = actor.viewerId;
  const p = actor.game.players[viewer];
  const workers = p === undefined ? [] : Object.values(p.workers).filter((w) => w.placement === null);
  const shifu = workers.find((w) => w.kind === "shifu");
  const apprentice = workers.find((w) => w.kind === "apprentice");
  const shaped = shapedVessels(view, viewer);
  const firstShaped = shaped[0];
  const quotes: Record<string, unknown> = {};
  if (apprentice !== undefined) {
    quotes["materialsYardApprentice_2clay_1wood"] = quoteMaterialsYard(actor, { type: "PLACE_MATERIALS_YARD", workerId: apprentice.id, clay: 2, wood: 1 });
    quotes["formDecorateApprentice_bowl_carved"] = quoteFormDecorate(actor, {
      type: "PLACE_FORM_DECORATE",
      workerId: apprentice.id,
      vessels: [{ shape: "bowl", decoration: "carved" }],
    });
    quotes["formDecorateApprentice_vase_painted"] = quoteFormDecorate(actor, {
      type: "PLACE_FORM_DECORATE",
      workerId: apprentice.id,
      vessels: [{ shape: "vase", decoration: "painted" }],
    });
  }
  if (shifu !== undefined) {
    // V1.6.2: the Shifu gains 6 Clay/Wood, with no Coin option (v1.6.2 L165).
    quotes["materialsYardShifu_4clay_2wood"] = quoteMaterialsYard(actor, {
      type: "PLACE_MATERIALS_YARD",
      workerId: shifu.id,
      clay: 4,
      wood: 2,
    });
    quotes["formDecorateShifu_bowl_plain_plus_vase_carved"] = quoteFormDecorate(actor, {
      type: "PLACE_FORM_DECORATE",
      workerId: shifu.id,
      vessels: [
        { shape: "bowl", decoration: "plain" },
        { shape: "vase", decoration: "carved" },
      ],
    });
  }
  return {
    placementOptions: placementOptions(view),
    quotes,
    shapedVessels: shaped,
    loadDestinationOptions:
      firstShaped === undefined ? null : { ceramicId: firstShaped.id, options: loadDestinationOptions(actor, viewer, firstShaped.id, []) },
    heatMarkerTargets:
      firstShaped === undefined
        ? heatMarkerTargets(view, viewer, [])
        : heatMarkerTargets(view, viewer, [{ ceramicId: firstShaped.id, glaze: "celadon", destination: { kiln: "imperial", imperialModifier: 0 } }]),
    commissionOptions: { apprentice: commissionOptions(view, "apprentice"), shifu: commissionOptions(view, "shifu") },
    guildOptions: { apprentice: guildOptions(view, "apprentice"), shifu: guildOptions(view, "shifu") },
    magistratesHallQuote: { apprentice: magistratesHallQuote(view, "apprentice"), shifu: magistratesHallQuote(view, "shifu") },
    colourSamplesSwapOptions: colourSamplesSwapOptions(view),
    imperialPriorityOptions: imperialPriorityOptions(view),
  };
}

/** 1. 3-player Round 2 Work Phase: viewer's before_action, Form & Decorate Tech owned (Form &
 * Decorate space 2 added) and the Glaze & Load second space not yet added. */
function findWorkPhaseR2(): Found {
  let best: Found = null;
  for (const seed of seedOrder(120, 27)) {
    if (best !== null && best.score >= 4) break;
    const table = new Table(seed, 3);
    const stop = (t: Table, actor: PlayerId): boolean => {
      if (t.state.round !== 2 || !beforeAction(t, actor)) return false;
      const p = t.state.players[actor];
      return p !== undefined && p.personalSpaces.form_decorate[1].unlocked && !p.personalSpaces.glaze_load[1].unlocked;
    };
    const actor = table.runUntil((t, a) => t.state.round > 2 || stop(t, a));
    if (actor === null || !stop(table, actor)) continue;
    const p = table.state.players[actor]!;
    const others = table.state.playerOrder.filter((id) => id !== actor);
    const score =
      (Object.values(p.workers).some((w) => w.placement !== null) ? 1 : 0) +
      (Object.values(table.state.ceramics).some((c) => c.ownerId === actor && c.stage === "shaped") ? 2 : 0) +
      (others.some((o) => table.state.players[o]!.techs.length > 0) ? 1 : 0);
    if (best === null || score > best.score) {
      best = {
        score,
        moment: capture(
          table,
          actor,
          {
            id: "m1_work_phase_r2_3p",
            title: "3P · Round 2 · Work Phase · your turn (before action)",
            description:
              "The viewer owns a Form & Decorate Tech, so they have added the second Form & Decorate space; they have not yet added the second Glaze & Load space. Placement options, quotes and the Commission / Guild / Magistrate option lists are for this exact state.",
          },
          workSelectors,
        ),
      };
    }
  }
  return best;
}

/** 2. 4-player Round 3, Commission Market: the viewer's Shifu has just been placed and is
 * looking at the top 3 (private, v1.6.2 L196); the reservations from the display and the look
 * follow in COMMISSION_CHOOSE. */
function findCommissionLook(): Found {
  for (let seed = 1; seed <= 60; seed += 1) {
    const table = new Table(seed, 4);
    let steeredSeat: PlayerId | null = null;
    const steer: Steer = (t, actor) => {
      if (t.state.round !== 3) return null;
      const phase = t.state.phase;
      if (phase.type !== "work_turn" || phase.activePlayerId !== actor) return null;
      if (steeredSeat !== null && steeredSeat !== actor) return null;
      const view = t.view(actor);
      if (phase.step.kind === "before_action" && steeredSeat === null) {
        const p = t.state.players[actor]!;
        const shifu = Object.values(p.workers).find((w) => w.kind === "shifu" && w.placement === null);
        if (shifu === undefined || view.game.counts.mainDeck + view.game.counts.mainDiscard < 4) return null;
        const options = commissionOptions(view, "shifu");
        if (options.lookCount < options.lookSize || options.faceUpSlots.length === 0) return null;
        steeredSeat = actor;
        return {
          command: { type: "PLACE_COMMISSION_MARKET", workerId: shifu.id },
          why: "Shifu to the Commission Market: the placement opens the private top-3 look.",
        };
      }
      return null;
    };
    const stop = (t: Table, actor: PlayerId): boolean => {
      const phase = t.state.phase;
      return (
        t.state.round === 3 &&
        phase.type === "work_turn" &&
        phase.activePlayerId === actor &&
        phase.step.kind === "commission_market" &&
        phase.step.effect === "shifu" &&
        phase.step.lookedCount === 3
      );
    };
    const actor = table.runUntil((t, a) => t.state.round > 3 || stop(t, a), steer);
    if (actor === null || !stop(table, actor)) continue;
    return {
      score: 1,
      moment: capture(
        table,
        actor,
        {
          id: "m2_commission_market_look_r3_4p",
          title: "4P · Round 3 · Commission Market · Shifu mid-action with private top-3 look",
          description:
            "The viewer's Shifu was placed at the Commission Market, which opened the private look at the top 3 Main Orders (v1.6.2 L196). own.pendingLook holds the 3 Orders; other players only see counts.pendingLook (kind + count). The viewer now reserves 1 or 2 from the display and those 3 (COMMISSION_CHOOSE); a face-up position stays empty until the turn ends, and the looked cards not reserved go face down to the bottom of the Main Order deck (change 24). No resource is gained.",
        },
        (view) => ({
          commissionOptions: commissionOptions(view, "shifu"),
          lookedOrderOptions: lookedOrderOptions(view),
          market: { display: [...view.game.market.display], refillPendingFor: view.game.market.refillPendingFor, emptySlots: view.game.market.display.flatMap((o, i) => (o === null ? [i] : [])) },
          publicLookIndicator: view.game.counts.pendingLook,
        }),
      ),
    };
  }
  return null;
}

function firingStageSelectors(view: PlayerView): Record<string, unknown> {
  return {
    heatLadder: heatLadder(view),
    contributionOptions: contributionOptions(view),
    testPiecesOptions: testPiecesOptions(view),
    heatMarkerStepOptions: heatMarkerStepOptions(view),
    junOptions: junOptions(view),
    afterQualityOptions: afterQualityOptions(view),
    salvageOptions: salvageOptions(view),
    fireDiscard: [...view.game.fireDiscard],
    fireDeckCount: view.game.counts.fireDeck,
  };
}

function loadedCeramics(state: GameState): Array<Extract<GameState["ceramics"][string], { stage: "loaded" }>> {
  return Object.values(state.ceramics).filter((c): c is Extract<typeof c, { stage: "loaded" }> => c.stage === "loaded");
}

/** 3. 3-player Heat-marker step. Scores: face-down markers, an Imperial Kiln ceramic, Kiln Master owned. */
function findHeatMarkers(): Found {
  let best: Found = null;
  for (const seed of seedOrder(150, 17)) {
    if (best !== null && best.score >= 9) break;
    const table = new Table(seed, 3);
    const scoreOf = (t: Table, actor: PlayerId): number => {
      if (t.state.phase.type !== "firing_heat_markers") return -1;
      const loaded = loadedCeramics(t.state);
      const faceDown = loaded.filter((c) => c.heatMarker?.faceDown === true).length;
      const imperial = loaded.some((c) => c.placement.kiln === "imperial");
      const kilnMaster = t.state.playerOrder.some((pid) => t.state.players[pid]!.techs.some((x) => x.id === "T24"));
      const ownFaceDown = loaded.some((c) => c.ownerId === actor && c.heatMarker?.faceDown === true);
      if (faceDown === 0) return -1;
      const firing = t.state.firing;
      const contributions = firing?.contributions ?? {};
      const varied = Object.values(contributions).some((c) => c !== undefined && c.card !== "TEND");
      return Math.min(faceDown, 2) + (imperial ? 2 : 0) + (kilnMaster ? 2 : 0) + (ownFaceDown ? 1 : 0) + (varied ? 2 : 0);
    };
    let localBest = -1;
    let localMoment: Captured | null = null;
    table.runUntil((t, actor) => {
      const s = scoreOf(t, actor);
      if (s > localBest) {
        localBest = s;
        localMoment = capture(
          t,
          actor,
          {
            id: "m3_heat_marker_step_3p",
            title: "3P · Firing · Heat-marker step (step 5)",
            description:
              "Kiln Die and Base Heat after the revealed Contributions are known; the Fire card is not yet revealed. Face-down Heat markers have no value yet (the viewer turns or returns theirs now). heatPreviews show Actual Heat before Fire and Quality per possible Fire card, null while a face-down marker is still undecided.",
          },
          (view) => firingStageSelectors(view),
        );
      }
      return false;
    });
    if (localMoment !== null && (best === null || localBest > best.score)) best = { score: localBest, moment: localMoment };
  }
  return best;
}

/** 4. After-Quality window with per-ceramic Actual Heat / Heat Difference / Quality. */
function findAfterQuality(playerCount: PlayerCount): Found {
  let best: Found = null;
  for (const seed of seedOrder(60, 17)) {
    if (best !== null && best.score >= 5) break;
    const table = new Table(seed, playerCount);
    const viewerSeat = "p1";
    const steer = kilnSteer(viewerSeat, "GE");
    let localBest = -1;
    let localMoment: Captured | null = null;
    table.runUntil((t, actor) => {
      if (t.state.phase.type !== "firing_after_quality") return false;
      const options = afterQualityOptions(t.playerView(actor)).filter((o) => o.ceramicIds.length > 0);
      if (options.length === 0) return false;
      const abilities = new Set(options.map((o) => o.ability));
      const s = options.length + (abilities.has("ge_crackle") ? 2 : 0) + (abilities.size >= 2 ? 1 : 0) + (loadedImperialRecord(t) ? 1 : 0);
      if (s > localBest) {
        localBest = s;
        localMoment = capture(
          t,
          actor,
          {
            id: `m4_after_quality_${playerCount}p`,
            title: `${playerCount}P · Firing · after-Quality window (step 10)`,
            description:
              "Quality has been assigned. The viewer chooses after-Quality abilities in their own order (Ge Crackle, Protective Saggars, Second Firing), rechecked after each use. heatLadder.chips carries each ceramic's Actual Heat, Heat Difference and Quality.",
          },
          (view) => firingStageSelectors(view),
        );
      }
      return false;
    }, steer);
    if (localMoment !== null && (best === null || localBest > best.score)) best = { score: localBest, moment: localMoment };
  }
  return best;
}

function loadedImperialRecord(table: Table): boolean {
  const firing = table.state.firing;
  return firing !== null && Object.values(firing.ceramics).some((r) => r?.kiln === "imperial");
}

/** 5. 2-player game: 2-1-1 kiln cover and the 1-space Magistrate's Hall. */
function findTwoPlayer(): Found {
  let best: Found = null;
  for (const seed of seedOrder(60, 35)) {
    if (best !== null && best.score >= 4) break;
    const table = new Table(seed, 2);
    let localBest = -1;
    let localMoment: Captured | null = null;
    table.runUntil((t, actor) => {
      if (t.state.round < 2 || !beforeAction(t, actor)) return t.state.round > 3;
      const loaded = loadedCeramics(t.state).filter((c) => c.placement.kiln === "shared").length;
      const magistrate = Object.values(t.state.players).some((p) => Object.values(p.workers).some((w) => w.placement?.locationId === "magistrates_hall"));
      const s = Math.min(loaded, 2) + (magistrate ? 2 : 0);
      if (s > localBest) {
        localBest = s;
        localMoment = capture(
          t,
          actor,
          {
            id: "m5_two_player_board_2p",
            title: "2P · Work Phase · 2-1-1 Shared Kiln and 1-space Magistrate's Hall",
            description:
              "In a 2-player game the Shared Kiln has 4 active spaces (High 2, Middle 1, Low 1); covered spaces are active:false in boardView.kilnSpaces. The Magistrate's Hall has capacity 1 (kilnLayout.centralCapacities).",
          },
          workSelectors,
        );
      }
      return t.state.round > 3;
    });
    if (localMoment !== null && (best === null || localBest > best.score)) best = { score: localBest, moment: localMoment };
  }
  return best;
}

/** 6. Order Phase with completable held Orders and Crackle wildcard options for the viewer.
 * Prefers a Crackle ceramic that must declare a Decoration other than its printed one. */
function findOrderPhase(): Found {
  let best: Found = null;
  for (const seed of seedOrder(150, 5)) {
    if (best !== null && best.score >= 8) break;
    const table = new Table(seed, 3);
    const steer = kilnSteer("p1", "GE");
    let localBest = -1;
    let localMoment: Captured | null = null;
    table.runUntil((t, actor) => {
      if (t.state.phase.type !== "orders") return false;
      const view = t.playerView(actor);
      const completable = completableOrders(view);
      if (completable.length === 0) return false;
      const own = view.own!;
      const matches = own.orderHand.flatMap((id) => orderMatchOptions(view, id, 8));
      const printed = (id: string) => {
        const c = view.game.ceramics[id];
        return c === undefined ? null : c.decoration;
      };
      const crackle = matches.filter((m) => m.crackleDeclarations.length > 0);
      const realWildcard = crackle.some((m) => m.crackleDeclarations.some((d) => d.decoration !== printed(d.ceramicId)));
      const multi = completable.some((m) => m.ceramicIds.length > 1);
      const s =
        Math.min(completable.length, 2) +
        (realWildcard ? 4 : crackle.length > 0 ? 1 : 0) +
        (own.orderHand.length > completable.length ? 1 : 0) +
        (multi ? 1 : 0);
      if (s > localBest) {
        localBest = s;
        localMoment = capture(
          t,
          actor,
          {
            id: "m6_order_phase_crackle_3p",
            title: "3P · Order Phase · completable held Orders with Crackle wildcard",
            description:
              "Only held Orders can be completed, in one First-Player-order pass. completableOrders gives one entry per completable held Order (its first match); orderMatchOptions lists every distinct ceramic group with the Crackle declarations that would be recorded; crackleDeclarationChecks run the validator's matcher (orderSelectionCheck) for each Decoration a Crackle ceramic could declare, so a declaration picker never re-implements Order rules.",
          },
          (v) => {
            const hand = v.own?.orderHand ?? [];
            const options = completableOrders(v);
            const all = hand.flatMap((id) => orderMatchOptions(v, id, 8));
            const crackleMatches = all.filter((m) => m.crackleDeclarations.length > 0);
            const multi = options.find((m) => m.ceramicIds.length > 1);
            const finished = v.viewerId === null ? [] : playerSummary(v, v.viewerId).finishedCeramicIds;
            return {
              completableOrders: options,
              orderMatchOptions: Object.fromEntries(hand.map((id) => [id, orderMatchOptions(v, id, 8)])),
              crackleDeclarationChecks: crackleMatches.map((m) => ({
                orderId: m.orderId,
                ceramicIds: m.ceramicIds,
                recorded: m.crackleDeclarations,
                undeclared: orderSelectionCheck(v, m.orderId, m.ceramicIds, []),
                perDecoration: m.crackleDeclarations.map((d) => ({
                  ceramicId: d.ceramicId,
                  printedDecoration: v.game.ceramics[d.ceramicId]?.decoration ?? null,
                  checks: DECORATIONS.map((decoration) => {
                    const declarations = m.crackleDeclarations.map((x) => (x.ceramicId === d.ceramicId ? { ceramicId: x.ceramicId, decoration } : x));
                    const result = orderSelectionCheck(v, m.orderId, m.ceramicIds, declarations);
                    return { decoration, ok: result.ok, error: result.ok ? null : result.error.code };
                  }),
                })),
              })),
              orderSelectionCheck:
                multi === undefined
                  ? null
                  : {
                      partial: { orderId: multi.orderId, ceramicIds: multi.ceramicIds.slice(0, 1), result: orderSelectionCheck(v, multi.orderId, multi.ceramicIds.slice(0, 1)) },
                      full: { orderId: multi.orderId, ceramicIds: multi.ceramicIds, result: orderSelectionCheck(v, multi.orderId, multi.ceramicIds, multi.crackleDeclarations) },
                    },
              viewerFinishedCeramicIds: finished,
              crackleCeramicIds: finished.filter((id) => {
                const c = v.game.ceramics[id];
                return c !== undefined && c.stage === "finished" && c.crackle;
              }),
            };
          },
        );
      }
      return false;
    }, steer);
    if (localMoment !== null && (best === null || localBest > best.score)) best = { score: localBest, moment: localMoment };
  }
  return best;
}

/** 7. Cleanup hand-limit trim (Rounds 1–4). */
function findHandLimit(): Found {
  for (const playerCount of [3, 4, 2] as const) {
    for (let seed = 1; seed <= 60; seed += 1) {
      const table = new Table(seed, playerCount);
      const actor = table.runUntil((t) => t.state.phase.type === "cleanup_hand_limit");
      if (actor === null) continue;
      return {
        score: 1,
        moment: capture(
          table,
          actor,
          {
            id: `m7_cleanup_hand_limit_${playerCount}p`,
            title: `${playerCount}P · Cleanup · trim Orders to the hand limit`,
            description:
              "Cleanup step 2 (Rounds 1–4 only): the viewer holds more than the limit (4, or 5 with Colour Samples) and must discard exactly the excess. The prompt is parallel; other players' hands stay hidden (only counts).",
          },
          (v) => ({
            handLimitViewer: v.viewerId === null ? null : handLimitStatus(v, v.viewerId),
            heldOrders: v.own?.orderHand ?? [],
          }),
        ),
      };
    }
  }
  return null;
}

/** 7b. Fallback: steer the viewer to reserve Orders until a trim is due. */
function findHandLimitSteered(): Found {
  for (let seed = 1; seed <= 40; seed += 1) {
    const table = new Table(seed, 3);
    const seat = "p1";
    const steer: Steer = (t, actor) => {
      if (actor !== seat || t.state.round > 4) return null;
      const phase = t.state.phase;
      if (phase.type !== "work_turn" || phase.activePlayerId !== actor) return null;
      const view = t.view(actor);
      if (phase.step.kind === "before_action") {
        const p = t.state.players[actor]!;
        const free = Object.values(p.workers).filter((w) => w.placement === null);
        const shifu = free.find((w) => w.kind === "shifu");
        const worker = shifu ?? free[0];
        if (worker === undefined) return null;
        const options = commissionOptions(view, worker.kind === "shifu" ? "shifu" : "apprentice");
        if (!options.reservable) return null;
        return {
          command: { type: "PLACE_COMMISSION_MARKET", workerId: worker.id },
          why: "Reserve Orders at the Commission Market so the hand exceeds the limit at Cleanup.",
        };
      }
      if (phase.step.kind === "commission_market") {
        // As many reservations as the effect allows: looked cards first, then face-up Orders.
        const looked = lookedOrderOptions(view);
        if (looked?.kind !== "commission_market") return null;
        const picks: CommissionPick[] = [
          ...looked.orderIds.map((orderId): CommissionPick => ({ kind: "looked", orderId })),
          ...looked.faceUpSlots.flatMap((slotIndex): CommissionPick[] => {
            const orderId = t.state.market.display[slotIndex];
            return orderId === null || orderId === undefined ? [] : [{ kind: "face_up", slotIndex, orderId }];
          }),
        ].slice(0, phase.step.maxReservations);
        return { command: { type: "COMMISSION_CHOOSE", reservations: picks }, why: `Reserve ${picks.length} Order(s) from the look and the display.` };
      }
      return null;
    };
    const actor = table.runUntil((t) => t.state.phase.type === "cleanup_hand_limit", steer);
    if (actor === null) continue;
    const viewer = (table.state.phase as { pendingPlayerIds: PlayerId[] }).pendingPlayerIds.includes(seat) ? seat : actor;
    return {
      score: 1,
      moment: capture(
        table,
        viewer,
        {
          id: "m7_cleanup_hand_limit_3p",
          title: "3P · Cleanup · trim Orders to the hand limit",
          description:
            "Cleanup step 2 (Rounds 1–4 only): the viewer holds more than the limit (4, or 5 with Colour Samples) and must discard exactly the excess. The prompt is parallel; other players' hands stay hidden (only counts).",
          notes: ["The viewer's seat was steered to reserve Orders at the Commission Market (see source.steered); every command was validated by the engine."],
        },
        (v) => ({
          handLimitViewer: v.viewerId === null ? null : handLimitStatus(v, v.viewerId),
          heldOrders: v.own?.orderHand ?? [],
        }),
      ),
    };
  }
  return null;
}

/** 8. Final results. Prefers a game decided by a tie-breaker. */
function findFinal(): Found {
  let best: Found = null;
  for (const seed of seedOrder(40, 10)) {
    if (best !== null && best.score >= 2) break;
    for (const playerCount of [4, 3] as const) {
      const table = new Table(seed, playerCount);
      table.runUntil(() => false);
      const result = table.state.finalResult;
      if (result === null) continue;
      const score = (result.resolvedBy !== "total_vp" ? 2 : 0) + (playerCount === 4 ? 0.5 : 0);
      if (best !== null && score <= best.score) continue;
      const winner = result.winnerIds[0] ?? table.state.playerOrder[0]!;
      best = {
        score,
        moment: capture(
          table,
          winner,
          {
            id: `m8_final_results_${playerCount}p`,
            title: `${playerCount}P · Final results`,
            description:
              "FinalResult with each player's breakdown: orders, kilnAbilities, recognitionOverflow, imperialAudience, techs (recorded when gained, A1 — never added again at game end), exhibition (quality VP + Shape/Glaze diversity bonuses), connoisseur, coins, total; standings with tie-break values (Recognition, printed Crowns, Masterpieces) and resolvedBy.",
            notes: [`resolvedBy = ${result.resolvedBy}`],
          },
          (v) => ({
            finalResult: v.game.finalResult,
            scoreBreakdownRows: [
              "orders",
              "kilnAbilities",
              "recognitionOverflow",
              "imperialAudience",
              "techs",
              "exhibition",
              "connoisseur",
              "coins",
              "total",
            ],
            tieBreakOrder: ["recognition", "printedCrowns", "masterpieces", "shared_victory"],
          }),
        ),
      };
    }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Label tables (EN / ZH)
// ═══════════════════════════════════════════════════════════════════════════════════════

/** Parses the markdown tables of one glossary section ("### 2.16 …") into rows of cells. */
function glossarySection(markdown: string, heading: string): Array<Record<string, string>> {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`### ${heading}`));
  if (start < 0) throw new Error(`Glossary section ${heading} not found`);
  const rows: Array<Record<string, string>> = [];
  let header: string[] | null = null;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line.startsWith("## ") || line.startsWith("### ")) break;
    if (!line.startsWith("|")) {
      header = null;
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (header === null) {
      header = cells;
      continue;
    }
    if (cells.every((c) => /^-+$/.test(c))) continue;
    rows.push(Object.fromEntries(header.map((h, j) => [h, cells[j] ?? ""])));
  }
  return rows;
}

function labels(): Record<string, unknown> {
  const glossary = readFileSync(resolve(ROOT, "docs/GLOSSARY_ZH_V1.6.1.md"), "utf8");
  const enZh = <K extends string>(ids: readonly K[], table: Readonly<Record<K, { en: string; zh: string }>>) =>
    Object.fromEntries(ids.map((id) => [id, { en: table[id].en, zh: table[id].zh }]));
  const uiVerbs = glossarySection(glossary, "2.16").map((r) => ({ en: r["EN"] ?? "", zh: r["简体中文"] ?? "" }));
  const pick = (heading: string) =>
    glossarySection(glossary, heading).map((r) => ({ en: r["EN"] ?? "", zh: r["简体中文"] ?? "", note: r["说明"] ?? r["适烧火候"] ?? r["泥费"] ?? "" }));
  return {
    rulesVersion: RULES_VERSION,
    sources: ["data/*.json", "src/game/ruleErrorText.ts", "docs/GLOSSARY_ZH_V1.6.1.md"],
    locations: Object.fromEntries(
      LOCATION_IDS.map((id) => {
        const l = LOCATIONS[id];
        return [
          id,
          {
            en: l.name,
            zh: l.nameZh,
            scope: l.scope,
            capacity: l.capacity,
            personalSpaces: l.personalSpaces,
            usableAtRecognition: l.usableAtRecognition,
            apprenticeText: { en: l.apprenticeText, zh: l.apprenticeTextZh },
            shifuText: { en: l.shifuText, zh: l.shifuTextZh },
          },
        ];
      }),
    ),
    techs: Object.fromEntries(
      TECH_IDS.map((id) => {
        const t = TECHS[id];
        return [
          id,
          {
            en: t.name,
            zh: t.nameZh,
            discipline: t.discipline,
            cost: t.cost,
            oncePerRound: t.oncePerRound,
            timing: t.timing,
            unlocks: t.unlocks,
            shortText: { en: t.shortText, zh: t.shortTextZh },
            ability: { en: t.ability, zh: t.abilityZh },
          },
        ];
      }),
    ),
    kilns: Object.fromEntries(
      KILN_IDS.map((id) => {
        const k = KILNS[id];
        return [
          id,
          {
            en: k.name,
            zh: k.nameZh,
            abilityName: { en: k.abilityName, zh: k.abilityNameZh },
            shortText: { en: k.shortText, zh: k.shortTextZh },
            ability: { en: k.ability, zh: k.abilityZh },
          },
        ];
      }),
    ),
    shapes: Object.fromEntries(SHAPES.map((id) => [id, { ...SHAPE_TEXT[id], clay: GAME_CONFIG.shapes[id] }])),
    glazes: Object.fromEntries(GLAZES.map((id) => [id, { ...GLAZE_TEXT[id], preferredHeat: GAME_CONFIG.glazes[id] }])),
    decorations: Object.fromEntries(DECORATIONS.map((id) => [id, { ...DECORATION_TEXT[id], coins: GAME_CONFIG.decorations[id] }])),
    qualities: enZh(QUALITIES, QUALITY_TEXT),
    qualityOrderHighToLow: [...QUALITIES].reverse(),
    resources: enZh(["clay", "wood", "coins"] as const, RESOURCE_TEXT),
    workers: enZh(["shifu", "apprentice"] as const, WORKER_TEXT),
    disciplines: enZh(DISCIPLINES, DISCIPLINE_TEXT),
    zones: enZh(["high", "middle", "low"] as const, ZONE_TEXT),
    ceramicStages: enZh(["shaped", "loaded", "finished", "delivered"] as const, STAGE_TEXT),
    kilnSpaces: Object.fromEntries(FIRING.kilnSpaces.map((s) => [s.id, { zone: s.zone, modifier: s.modifier, label: { en: `${ZONE_TEXT[s.zone].en} ${s.id}`, zh: `${ZONE_TEXT[s.zone].zh} ${s.id}` } }])),
    roundPhases: roundStructureJson.phases.map((p) => ({ id: p.id, order: p.order, en: p.name, zh: p.nameZh, summary: { en: p.summary, zh: p.summaryZh } })),
    enginePhases: PHASE_TEXT,
    firingSteps: pick("2.11").filter((r) => /step|Phase|Final|skip/i.test(r.en)),
    contributionCards: Object.fromEntries(FIRING.contributionCards.map((c) => [c.id, { en: c.name, zh: c.nameZh, woodCost: c.woodCost, heat: c.heat }])),
    fireDeck: FIRING.fireDeck,
    kilnDieFaces: FIRING.kilnDie.faces,
    imperialModifiers: FIRING.imperialModifiers,
    recognitionMilestones: IMPERIAL_TRACK.track.map((m) => ({
      space: m.space,
      id: m.id,
      title: { en: m.title, zh: m.titleZh },
      reward: m.reward,
      rewardText: { en: m.rewardText, zh: m.rewardTextZh },
    })),
    recognitionOverflowVpPerCrown: IMPERIAL_TRACK.overflowVpPerCrown,
    exhibition: IMPERIAL_TRACK.exhibition,
    coinEndGame: GAME_CONFIG.coinEndGame,
    scoring: pick("2.14"),
    components: pick("2.5"),
    firingTerms: pick("2.10"),
    orderTerms: pick("2.12"),
    uiVerbs,
    ruleErrors: Object.fromEntries(Object.entries(RULE_ERROR_TEXT).map(([code, t]) => [code, { en: t.en, zh: t.zh }])),
    orders: Object.fromEntries(
      ORDER_IDS.map((id) => {
        const o = ORDERS[id];
        return [
          id,
          {
            deck: o.deck,
            requirements: { en: o.requirements, zh: o.requirementsZh },
            ceramics: o.ceramics,
            relations: o.relations ?? [],
            minQuality: o.minQuality,
            vp: o.vp,
            coins: o.coins,
            crowns: o.crowns,
          },
        ];
      }),
    ),
    ceramicArt: {
      directory: "assets/current_v04/ceramics/",
      pattern: "ceramic-{shape}-{decoration}-v1.webp",
      crackleOverlay: "ceramic-crackle-overlay-v1.webp",
      note: "Neutral cutouts tinted per Glaze; may be embedded as data URIs.",
    },
  };
}

/** 9. Firing step 1: secret, simultaneous Contributions. Another seat has submitted (shown only
 * as "submitted"); the viewer still chooses, ideally with Fuel Ledger. Seats are steered to buy
 * Fuel Ledger, Inverted Firing or Setter's Mark at the Guild Hall when the policy would not, so
 * the kiln can show a stack and a Setter's Mark. */
const STEP1_TECHS = ["T12", "T21", "T22"] as const;
function step1Steer(): Steer {
  return (t, actor) => {
    if (t.state.round > 3 || !beforeAction(t, actor)) return null;
    const p = t.state.players[actor]!;
    const apprentice = Object.values(p.workers).find((w) => w.kind === "apprentice" && w.placement === null);
    if (apprentice === undefined) return null;
    const options = guildOptions(t.playerView(actor), "apprentice").faceUp;
    const pick = options.find((o) => o.legal && (STEP1_TECHS as readonly string[]).includes(o.techId));
    if (pick === undefined) return null;
    return {
      command: { type: "PLACE_GUILD_HALL", workerId: apprentice.id, choice: { kind: "buy_face_up", techId: pick.techId } } as AuthoritativeCommand,
      why: `Apprentice buys ${pick.techId} so the step-1 fixture can show Fuel Ledger, Inverted Firing or Setter's Mark.`,
    };
  };
}
function findContributions(): Found {
  let best: Found = null;
  for (const seed of seedOrder(120, 118)) {
    if (best !== null && best.score >= 9) break;
    const table = new Table(seed, 3);
    let localBest = -1;
    let localMoment: Captured | null = null;
    table.runUntil((t, actor) => {
      const phase = t.state.phase;
      if (phase.type !== "firing_contributions") return t.state.round > 4;
      if (phase.submittedPlayerIds.length === 0 || phase.submittedPlayerIds.includes(actor)) return false;
      const spaces = Object.values(t.state.sharedKiln.spaces);
      const stack = spaces.some((s) => s.ceramicIds.length > 1);
      const setter = spaces.some((s) => s.setterMarkOwnerId !== null);
      const furniture = spaces.some((s) => s.kilnFurniture !== null);
      const fuel = t.state.players[actor]!.techs.some((x) => x.id === "T12");
      const s = (stack ? 3 : 0) + (setter ? 3 : 0) + (fuel ? 3 : 0) + (furniture ? 1 : 0) + (loadedImperialRecord(t) ? 1 : 0);
      if (s > localBest) {
        localBest = s;
        localMoment = capture(
          t,
          actor,
          {
            id: "m9_contributions_step1_3p",
            title: "3P · Firing · step 1 · secret Contributions",
            description:
              "Contributions are chosen secretly and simultaneously. phase.submittedPlayerIds shows who has submitted, never what; the viewer's own choice is not yet sealed. contributionOptions lists Tend / Bank / Stoke (and Fuel Ledger variants when owned) with Wood cost and affordability.",
          },
          (view) => ({
            ...firingStageSelectors(view),
            contributionOptions: contributionOptions(view),
            submittedPlayerIds: [...(view.game.phase.type === "firing_contributions" ? view.game.phase.submittedPlayerIds : [])],
          }),
        );
      }
      return false;
    }, step1Steer());
    if (localMoment !== null && (best === null || localBest > best.score)) best = { score: localBest, moment: localMoment };
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Moment searches (m10–m18: the windows the wireframe could not reach; tests target only)
// ═══════════════════════════════════════════════════════════════════════════════════════

function techOwner(table: Table, techId: TechId): PlayerId | null {
  return table.state.playerOrder.find((pid) => table.state.players[pid]?.techs.some((tech) => tech.id === techId)) ?? null;
}

/** Steers an Apprentice to buy `techId` face up at the Guild Hall (any seat, or only `seat`),
 * while nobody owns it. An illegal attempt falls back to the policy. */
function buyTechSteer(techId: TechId, seat: PlayerId | null = null): Steer {
  return (t, actor) => {
    if ((seat !== null && actor !== seat) || !beforeAction(t, actor) || techOwner(t, techId) !== null) return null;
    const p = t.state.players[actor];
    const worker = p === undefined ? undefined : Object.values(p.workers).find((w) => w.kind === "apprentice" && w.placement === null);
    if (worker === undefined) return null;
    const option = guildOptions(t.playerView(actor), "apprentice").faceUp.find((o) => o.techId === techId && o.legal);
    if (option === undefined) return null;
    return {
      command: { type: "PLACE_GUILD_HALL", workerId: worker.id, choice: { kind: "buy_face_up", techId } },
      why: `An Apprentice buys ${TECHS[techId].name} (${techId}) at the Guild Hall so the fixture can show it.`,
    };
  };
}

/**
 * Seeds to try: `hint` first (the seed a previous run found, so a regeneration is quick), then
 * 1…budget. Deterministic either way; if the engine or policy changes and the hint no longer
 * reaches the moment, the search simply continues.
 */
function seedOrder(budget: number, hint?: number): number[] {
  const seeds = Array.from({ length: budget }, (_, i) => i + 1);
  return hint === undefined ? seeds : [hint, ...seeds.filter((seed) => seed !== hint)];
}

interface MomentMeta {
  id: string;
  title: string;
  description: string;
  notes?: string[];
}

/** The moment's scripted fallback: the matching window scenario, for its acting viewer. */
function scriptedMoment(meta: MomentMeta, scenarioName: string, prepare?: (table: LocalTable, actor: PlayerId) => PlayerId): Captured {
  const scenario = phaseScenarios().find((s) => s.name === scenarioName);
  if (scenario === undefined) throw new Error(`No phase scenario "${scenarioName}" for ${meta.id}`);
  const viewer = prepare === undefined ? scenario.actor : prepare(scenario.table, scenario.actor);
  const { entry, secrets } = entryOf({
    id: meta.id,
    name: meta.title,
    kind: "moment",
    description: meta.description,
    notes: [...(meta.notes ?? []), `Seed search exceeded its budget; this is the scripted scenario "${scenarioName}".`],
    source: scriptedSource(scenario.table, "phaseScenarios", scenarioName),
    state: scenario.table.state,
    privateState: scenario.table.privateState,
    log: localTableLog(scenario.table),
    viewerId: viewer,
    recent: RECENT_EVENTS,
  });
  return { id: meta.id, legacy: null, entry, secrets };
}

interface Search {
  meta: MomentMeta;
  playerCounts: readonly PlayerCount[];
  seeds: number;
  steer: () => Steer | null;
  /** The viewer to capture before this decision, or null. */
  at: (table: Table, actor: PlayerId) => PlayerId | null;
  /** Stop playing this seed. */
  giveUp: (table: Table) => boolean;
  fallback: string;
  /** The seed to try first (`seedOrder`). */
  hint?: number;
}

/** Plays seeds until `at` names a viewer; captures there, else falls back to the scenario. */
function search(spec: Search): Captured {
  for (const playerCount of spec.playerCounts) {
    for (const seed of seedOrder(spec.seeds, spec.hint)) {
      const table = new Table(seed, playerCount);
      let viewer: PlayerId | null = null;
      table.runUntil((t, actor) => {
        if (spec.giveUp(t)) return true;
        viewer = spec.at(t, actor);
        return viewer !== null;
      }, spec.steer());
      if (viewer !== null) return capture(table, viewer, spec.meta, () => ({}));
    }
  }
  return scriptedMoment(spec.meta, spec.fallback);
}

/** m10: the Setter's Mark window at the start of a round, then the tile on its space. */
function findSettersMark(): Captured[] {
  const window: MomentMeta = {
    id: "m10a_setters_mark_window",
    title: "3P · Start of the Work Phase · Setter's Mark window",
    description: "The viewer owns Setter's Mark (T22): at the start of the Work Phase they may place the tile on an empty active Shared Kiln space, or decline (settersMarkOptions).",
  };
  const tile: MomentMeta = {
    id: "m10b_setters_mark_on_space",
    title: "3P · Work Phase · a Setter's Mark tile on a Shared Kiln space",
    description: "The viewer placed their Setter's Mark: only they may load into that space this round; the tile returns when they load there or at Cleanup.",
  };
  for (const seed of seedOrder(40, 1)) {
    const table = new Table(seed, 3);
    const buy = buyTechSteer("T22");
    const giveUp = (t: Table) => t.state.round > 4;
    const owner = table.runUntil((t, actor) => giveUp(t) || (t.state.phase.type === "round_start_setters_mark" && settersMarkOptions(t.playerView(actor)).length > 0), buy);
    if (owner === null || table.state.phase.type !== "round_start_setters_mark") continue;
    const first = capture(table, owner, window, () => ({}));
    const place: Steer = (t, actor) => {
      if (actor !== owner || t.state.phase.type !== "round_start_setters_mark") return null;
      const spaceId = settersMarkOptions(t.playerView(actor))[0];
      return spaceId === undefined ? null : { command: { type: "PLACE_SETTERS_MARK", spaceId }, why: "The owner places the Setter's Mark on the first open space." };
    };
    const marked = (t: Table) => KILN_SPACE_IDS.some((id) => t.state.sharedKiln.spaces[id].setterMarkOwnerId === owner);
    table.runUntil((t) => t.state.phase.type === "work_turn" && marked(t), place);
    const phaseNow = table.state.phase.type as string;
    if (phaseNow !== "work_turn" || !marked(table)) continue;
    return [first, capture(table, owner, tile, () => ({}))];
  }
  return [
    scriptedMoment(window, "Setter's Mark window"),
    scriptedMoment(tile, "Setter's Mark window", (t, actor) => {
      t.act(actor, { type: "PLACE_SETTERS_MARK", spaceId: settersMarkOptionsFor(t, actor) });
      return actor;
    }),
  ];
}

function settersMarkOptionsFor(table: LocalTable, actor: PlayerId) {
  const spaceId = settersMarkOptions(table.view(actor))[0];
  if (spaceId === undefined) throw new Error("No Setter's Mark space in the scripted scenario");
  return spaceId;
}

/** m11: Test Pieces — the decision, then the private peek before the bury decision. */
function findTestPieces(): Captured[] {
  const decision: MomentMeta = {
    id: "m11a_test_pieces_decision",
    title: "3P · Firing step 4 · Test Pieces: pay 1 Wood to peek?",
    description: "The viewer owns Test Pieces (T13) and has a ceramic in this firing: they may pay 1 Wood to look privately at the top Fire card (testPiecesOptions).",
  };
  const bury: MomentMeta = {
    id: "m11b_test_pieces_bury",
    title: "3P · Firing step 4 · Test Pieces: bury the card?",
    description: "The viewer peeked: only they see the card (own.firePeek). Others see only that they paid and peeked. Next they decide, publicly, whether to bury it.",
  };
  for (const seed of seedOrder(40, 10)) {
    const table = new Table(seed, 3);
    const giveUp = (t: Table) => t.state.round > 5;
    const owner = table.runUntil((t, actor) => {
      if (giveUp(t)) return true;
      const options = t.state.phase.type === "firing_test_pieces" ? testPiecesOptions(t.playerView(actor)) : null;
      return options !== null && options.awaiting === "decision" && options.canPeek;
    }, buyTechSteer("T13"));
    if (owner === null || table.state.phase.type !== "firing_test_pieces") continue;
    const first = capture(table, owner, decision, () => ({}));
    if (!table.tryApply(owner, { type: "TEST_PIECES_DECIDE", peek: true })) continue;
    table.steered.push({ revision: table.state.revision - 1, playerId: owner, command: { type: "TEST_PIECES_DECIDE", peek: true }, why: "The owner pays 1 Wood and peeks." });
    if (table.state.phase.type !== "firing_test_pieces" || table.state.phase.awaiting !== "bury") continue;
    return [first, capture(table, owner, bury, () => ({}))];
  }
  return [scriptedMoment(decision, "Test Pieces decision"), scriptedMoment(bury, "Test Pieces bury")];
}

/** m18: the Second Firing choice with Jun (v1.6.2 L631, R7): 2 extra Fire cards are turned. */
function findJunSecondFiring(): Captured {
  const meta: MomentMeta = {
    id: "m18_jun_second_firing",
    title: "3P · Firing step 10 · Second Firing choice with Jun (R7)",
    description:
      "The viewer (Jun Kiln, Second Firing) kept Jun unused in step 8, then used Second Firing: 2 extra Fire cards are turned (firingStageView.extraFire, secondFiringChoiceOptions). The viewer chooses 1 to recalculate with and, before the new Quality, may use Jun's ±1 for 1 Wood (SECOND_FIRING_CHOOSE).",
  };
  const seat = "p1";
  const steer = combine(
    kilnSteer(seat, "JU"),
    buyTechSteer("T14", seat),
    (t, actor) =>
      actor === seat && t.state.phase.type === "firing_heat_adjustment"
        ? { command: { type: "RESOLVE_JUN", adjustment: null }, why: "Keep Jun unused in step 8 so it can act in Second Firing (R7)." }
        : null,
    (t, actor) => {
      if (actor !== seat || t.state.phase.type !== "firing_after_quality") return null;
      const second = afterQualityOptions(t.playerView(actor)).find((o) => o.ability === "second_firing");
      const ceramicId = second?.ceramicIds[0];
      return ceramicId === undefined ? null : { command: { type: "USE_SECOND_FIRING", ceramicId }, why: "Second Firing on an eligible ceramic." };
    },
  );
  return search({
    meta,
    playerCounts: [3],
    seeds: 40,
    steer: () => steer,
    at: (t) => (t.state.phase.type === "firing_second_firing_choice" ? t.state.phase.actorId : null),
    giveUp: (t) => t.state.round > 5,
    fallback: "Jun during Second Firing (R7)",
    hint: 13,
  });
}

function newMoments(): Captured[] {
  const firingGiveUp = (t: Table) => t.state.round > 5;
  return [
    ...findSettersMark(),
    ...findTestPieces(),
    search({
      meta: {
        id: "m12_guild_shifu_inspection",
        title: "3P · Work Phase · Guild Hall Shifu inspection (private)",
        description: "The viewer's Shifu inspected the top Techs of one discipline: only they see them (guildInspectionOptions). They take up to 2 Techs from different disciplines, inspected or face-up, each at its printed cost (v1.6.2 L207), then choose the bottom order of the rest (GUILD_FINISH).",
      },
      playerCounts: [3],
      seeds: 30,
      steer: () => (t, actor) => {
        if (t.state.round < 2 || !beforeAction(t, actor)) return null;
        const shifu = placementOptions(t.playerView(actor)).find((o) => o.locationId === "guild_hall")?.workers.find((w) => w.kind === "shifu" && w.legal);
        const target = guildOptions(t.playerView(actor), "shifu").inspect.filter((d) => d.deckCount >= 2).sort((a, b) => b.deckCount - a.deckCount)[0];
        if (shifu === undefined || target === undefined) return null;
        return { command: { type: "PLACE_GUILD_HALL", workerId: shifu.workerId, choice: { kind: "inspect", discipline: target.discipline } }, why: "The Shifu inspects a Tech deck at the Guild Hall." };
      },
      at: (t, actor) => {
        const phase = t.state.phase;
        return phase.type === "work_turn" && phase.step.kind === "guild_inspection" ? actor : null;
      },
      giveUp: (t) => t.state.round > 3,
      fallback: "Guild Hall: Shifu inspection",
    }),
    search({
      meta: {
        id: "m13_jun_heat_adjustment",
        title: "3P · Firing step 8 · Jun heat adjustment",
        description: "The Fire card is turned and Actual Heat known (shown only in the log); the viewer's Jun Kiln may pay 1 Wood to move one of their ceramics ±1 before Quality (junOptions).",
      },
      playerCounts: [3],
      seeds: 30,
      steer: () => kilnSteer("p1", "JU"),
      at: (t, actor) => (t.state.phase.type === "firing_heat_adjustment" && actor === "p1" && (junOptions(t.playerView(actor))?.ready ?? false) ? actor : null),
      giveUp: firingGiveUp,
      fallback: "Jun heat adjustment",
    }),
    search({
      meta: {
        id: "m14_salvage",
        title: "3P · Firing step 11 · salvage a Flawed ceramic",
        description: "The viewer has a still-Flawed ceramic from this firing: discard it for 2 Coins or keep it (salvageOptions). Players decide independently, in any order.",
      },
      playerCounts: [3, 4],
      seeds: 30,
      steer: () => null,
      at: (t) => (t.state.phase.type === "firing_salvage" ? (t.state.phase.pendingPlayerIds[0] ?? null) : null),
      giveUp: firingGiveUp,
      fallback: "salvage",
      hint: 7,
    }),
    search({
      meta: {
        id: "m15_kiln_selection",
        title: "4P · Setup · Kiln selection (reverse turn order)",
        description: "Setup step 9: in reverse turn order each player takes one of the five Kiln Player Boards (kilnSelectionOptions). The viewer chooses first.",
      },
      playerCounts: [4],
      seeds: 1,
      steer: () => null,
      at: (t, actor) => (t.state.phase.type === "setup_kiln_selection" ? actor : null),
      giveUp: () => false,
      fallback: "Kiln selection",
    }),
    search({
      meta: {
        id: "m16_colour_samples",
        title: "3P · Work Phase · Colour Samples: reserve 1 of 3 (private)",
        description: "The viewer just gained Colour Samples (T10): they look at the top 3 Main Orders privately and must reserve one; the other 2 go face down to the bottom of the Main Order deck (v1.6.2 L617, change 24; lookedOrderOptions).",
      },
      playerCounts: [3],
      seeds: 30,
      steer: () => buyTechSteer("T10"),
      at: (t, actor) => {
        const phase = t.state.phase;
        return phase.type === "work_turn" && phase.step.kind === "colour_samples" ? actor : null;
      },
      giveUp: (t) => t.state.round > 4,
      fallback: "Colour Samples choice",
      hint: 3,
    }),
    search({
      meta: {
        id: "m17_after_action",
        title: "3P · Work Phase · after-action window (Colour Samples swap)",
        description: "The viewer owns Colour Samples (T10): after their worker action they may swap 1 held Order once this round (discard it, privately look at the top 2 Main Orders, reserve 1; the other goes to the bottom of the Main Order deck, change 24), use Imperial Priority if they have it, or end the turn (colourSamplesSwapOptions, imperialPriorityOptions).",
      },
      playerCounts: [3],
      seeds: 30,
      steer: () => buyTechSteer("T10"),
      at: (t, actor) => {
        const phase = t.state.phase;
        return phase.type === "work_turn" && phase.activePlayerId === actor && phase.step.kind === "after_action" && t.state.round >= 2 ? actor : null;
      },
      giveUp: (t) => t.state.round > 4,
      fallback: "after the worker action",
    }),
    findJunSecondFiring(),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Scripted scenarios (scenarios.json)
// ═══════════════════════════════════════════════════════════════════════════════════════

/** A LocalTable's log, numbered from its first event like the service numbers a game's. */
function localTableLog(table: LocalTable): EventLog {
  const marks = table.commandMarks;
  const initialRevision = marks[0] === undefined ? table.state.revision : marks[0].revision - 1;
  const host = table.state.playerOrder[0] ?? "p1";
  return {
    records: table.events.map((event, index) => {
      let mark: (typeof marks)[number] | undefined;
      for (const candidate of marks) if (candidate.firstEventIndex <= index) mark = candidate;
      return { sequence: index + 1, revision: mark?.revision ?? initialRevision, actorId: mark?.actorId ?? host, event };
    }),
  };
}

function scriptedSource(table: LocalTable, from: "phaseScenarios" | "tableScenarios", scenario: string): UiFixtureSource {
  return { kind: "scripted", from, scenario, round: table.state.round, revision: table.state.revision, phase: table.state.phase.type };
}

/** `"Setter's Mark window"` → `w-setters-mark-window`. */
function slug(prefix: string, name: string): string {
  return `${prefix}-${name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/** Every scripted scenario: the decision windows, then the table states. */
export function buildScenarioFixtures(): { entries: UiFixtureEntry[]; secrets: Record<string, string[]> } {
  const entries: UiFixtureEntry[] = [];
  const secrets: Record<string, string[]> = {};
  const add = (built: { entry: UiFixtureEntry; secrets: string[] }) => {
    if (secrets[built.entry.id] !== undefined) throw new Error(`Duplicate fixture id ${built.entry.id}`);
    entries.push(built.entry);
    secrets[built.entry.id] = built.secrets;
  };
  for (const scenario of phaseScenarios()) {
    add(
      entryOf({
        id: slug("w", scenario.name),
        name: scenario.name,
        kind: "window",
        description: `Decision window: ${scenario.name} (${scenario.phase}), seen by the acting player.`,
        notes: [],
        source: scriptedSource(scenario.table, "phaseScenarios", scenario.name),
        state: scenario.table.state,
        privateState: scenario.table.privateState,
        log: localTableLog(scenario.table),
        viewerId: scenario.actor,
        recent: SCENARIO_EVENTS,
      }),
    );
  }
  for (const scenario of tableScenarios()) {
    add(
      entryOf({
        id: scenario.id,
        name: scenario.name,
        kind: "table",
        description: `Table state: ${scenario.name}.`,
        notes: [],
        source: scriptedSource(scenario.table, "tableScenarios", scenario.id),
        state: scenario.table.state,
        privateState: scenario.table.privateState,
        log: localTableLog(scenario.table),
        viewerId: scenario.viewerId,
        recent: SCENARIO_EVENTS,
      }),
    );
  }
  return { entries, secrets };
}

/** m1–m9 (the wireframe set, recaptured in the entry format) and m10–m18. */
export function buildMomentFixtures(): { entries: UiFixtureEntry[]; secrets: Record<string, string[]>; missing: string[] } {
  const previous = TARGET;
  TARGET = "tests";
  try {
    const missing: string[] = [];
    const captured: Captured[] = [];
    const take = (name: string, found: Found) => {
      if (found === null) missing.push(name);
      else captured.push(found.moment);
    };
    take("1 work phase R2 3p", findWorkPhaseR2());
    take("2 commission look R3 4p", findCommissionLook());
    take("3 heat-marker step 3p", findHeatMarkers());
    take("4 after-Quality window 3p", findAfterQuality(3));
    take("5 two-player board", findTwoPlayer());
    take("6 order phase with Crackle", findOrderPhase());
    take("7 cleanup hand limit", findHandLimit() ?? findHandLimitSteered());
    take("8 final results", findFinal());
    take("9 contributions step 1", findContributions());
    captured.push(...newMoments());
    const entries: UiFixtureEntry[] = [];
    const secrets: Record<string, string[]> = {};
    for (const c of captured) {
      if (c.entry === null || c.secrets === null) throw new Error(`${c.id} was not captured as an entry`);
      if (secrets[c.id] !== undefined) throw new Error(`Duplicate moment id ${c.id}`);
      entries.push(c.entry);
      secrets[c.id] = c.secrets;
    }
    return { entries, secrets, missing };
  } finally {
    TARGET = previous;
  }
}

/** Stable JSON: keys sorted so Record iteration order never changes the file. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, stable((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/** The exact bytes written for a fixture file. */
export function serializeFixture(value: unknown): string {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

export function scenariosFile(entries: readonly UiFixtureEntry[]): Record<string, unknown> {
  return {
    generatedBy: "tools/uiFixtures.ts --target tests",
    rulesVersion: RULES_VERSION,
    rulesFingerprint: rulesFingerprint(),
    privacy: "Each entry holds only the viewer's PlayerView, projected public events and the viewer's own secret events; checked against the authoritative state when generated (tools/fixturePrivacy.ts).",
    entries,
  };
}

export function momentsFile(entries: readonly UiFixtureEntry[]): Record<string, unknown> {
  return { ...scenariosFile(entries), policy: POLICY.version };
}

export function secretsFile(secrets: Readonly<Record<string, readonly string[]>>): Record<string, unknown> {
  return {
    generatedBy: "tools/uiFixtures.ts --target tests",
    oracle: "Per entry id: the Order and Tech IDs that viewer must never see (other hands, other seats' looks, the decks, the Main discard and the Starting box), minus IDs a public event revealed and IDs the viewer was shown privately. A test oracle for the rendered-markup leak checks; never loaded by src/app.",
    entries: secrets,
  };
}

/** The three files of the tests target, as written. */
export function generateTestFixtureTexts(): { files: Record<keyof typeof TEST_FIXTURE_FILES, string>; summary: Record<string, unknown> } {
  const scenarios = buildScenarioFixtures();
  const moments = buildMomentFixtures();
  if (moments.missing.length > 0) throw new Error(`Moments not found: ${moments.missing.join(", ")}`);
  const secrets = { ...scenarios.secrets, ...moments.secrets };
  const problems = verifyFixtureEntries([...scenarios.entries, ...moments.entries], secrets);
  if (problems.length > 0) throw new Error(`Fixture privacy verification failed:\n- ${problems.join("\n- ")}`);
  return {
    files: {
      scenarios: serializeFixture(scenariosFile(scenarios.entries)),
      moments: serializeFixture(momentsFile(moments.entries)),
      secrets: serializeFixture(secretsFile(secrets)),
    },
    summary: {
      scenarios: scenarios.entries.map((e) => `${e.id} (${e.playerView.game.phase.type}, viewer ${e.viewerId}${e.viewerActs ? " acts" : ""})`),
      moments: moments.entries.map((e) => `${e.id} (${e.source.kind}${e.source.kind === "played" ? ` seed ${e.source.seed} ${e.source.playerCount}p` : ""}, ${e.playerView.game.phase.type}, viewer ${e.viewerId})`),
    },
  };
}

/**
 * Re-reads the written test fixtures and checks them without the authoritative state: the
 * structural privacy rules for every entry, and no entry holding one of its secret IDs.
 */
export function verifyTestFixtureFiles(): string[] {
  const read = (file: string) => JSON.parse(readFileSync(file, "utf8")) as { entries: unknown };
  const scenarios = read(TEST_FIXTURE_FILES.scenarios).entries as UiFixtureEntry[];
  const moments = read(TEST_FIXTURE_FILES.moments).entries as UiFixtureEntry[];
  const secrets = read(TEST_FIXTURE_FILES.secrets).entries as Record<string, string[]>;
  return verifyFixtureEntries([...scenarios, ...moments], secrets);
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// The legacy wireframe target
// ═══════════════════════════════════════════════════════════════════════════════════════

export function generateWireframe(): { file: string; moments: Array<{ id: string; seed: number; playerCount: number; round: number; phase: string; viewerId: string }>; missing: string[] } {
  const previous = TARGET;
  TARGET = "wireframe";
  try {
    const missing: string[] = [];
    const moments: Moment[] = [];
    const take = (name: string, found: Found) => {
      if (found === null || found.moment.legacy === null) missing.push(name);
      else moments.push(found.moment.legacy);
    };
    take("1 work phase R2 3p", findWorkPhaseR2());
    take("2 commission look R3 4p", findCommissionLook());
    take("3 heat-marker step 3p", findHeatMarkers());
    take("4 after-Quality window 3p", findAfterQuality(3));
    take("5 two-player board", findTwoPlayer());
    take("6 order phase with Crackle", findOrderPhase());
    take("7 cleanup hand limit", findHandLimit() ?? findHandLimitSteered());
    take("8 final results", findFinal());
    take("9 contributions step 1", findContributions());
    const fixture = {
      generatedBy: "tools/uiFixtures.ts",
      rulesVersion: RULES_VERSION,
      policy: POLICY.version,
      privacy:
        "Each moment holds only the viewer's PlayerView (public projection + own private view), selectors computed from it and projected public events. Checked against the authoritative hidden state at generation time.",
      moments: moments.map((m) => stable(m)),
      labels: stable(labels()),
    };
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_FILE, `${JSON.stringify(fixture, null, 2)}\n`);
    return {
      file: OUT_FILE,
      moments: moments.map((m) => ({ id: m.id, seed: m.source.seed, playerCount: m.source.playerCount, round: m.source.round, phase: m.source.phase, viewerId: m.viewerId })),
      missing,
    };
  } finally {
    TARGET = previous;
  }
}

/**
 * Re-reads the wireframe file and checks, without the authoritative state, that each moment is
 * shaped like one viewer's client data (`entryStructureProblems`).
 */
export function verifyFixtureFile(file = OUT_FILE): string[] {
  const data = JSON.parse(readFileSync(file, "utf8")) as { moments: Moment[] };
  const problems: string[] = [];
  for (const m of data.moments) {
    const entry = { ...m, recentPublicEvents: m.recentPublicEvents.map((e) => ({ sequence: e.seq, revision: e.revision, actorId: "", event: e.event })), ownSecrets: [] };
    for (const problem of entryStructureProblems(entry)) problems.push(`${m.id}: ${problem}`);
  }
  return problems;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════════════════

function writeOrCheckTests(check: boolean): void {
  const started = Date.now();
  const { files, summary } = generateTestFixtureTexts();
  const drift: string[] = [];
  mkdirSync(TEST_FIXTURE_DIR, { recursive: true });
  for (const [name, text] of Object.entries(files) as Array<[keyof typeof TEST_FIXTURE_FILES, string]>) {
    const file = TEST_FIXTURE_FILES[name];
    if (check) {
      let current: string | null = null;
      try {
        current = readFileSync(file, "utf8");
      } catch {
        current = null;
      }
      if (current !== text) drift.push(`${name}.json differs from a fresh generation`);
    } else {
      writeFileSync(file, text);
    }
  }
  const problems = verifyTestFixtureFiles();
  console.log(JSON.stringify({ target: "tests", mode: check ? "check" : "write", ms: Date.now() - started, ...summary, drift, privacyCheck: problems.length === 0 ? "passed" : problems }, null, 2));
  if (drift.length > 0 || problems.length > 0) {
    throw new Error(`UI fixtures are not current:\n- ${[...drift, ...problems].join("\n- ")}\nRun \`npm run fixtures\` and review the diff.`);
  }
}

function main(argv: readonly string[]): void {
  const verifyAt = argv.indexOf("--verify");
  if (verifyAt >= 0) {
    // Privacy check of an existing wireframe file only.
    const file = argv[verifyAt + 1] ?? OUT_FILE;
    const problems = verifyFixtureFile(resolve(file));
    console.log(problems.length === 0 ? `privacy check passed: ${file}` : `privacy check FAILED:\n- ${problems.join("\n- ")}`);
    if (problems.length > 0) process.exitCode = 1;
    return;
  }
  const targetAt = argv.indexOf("--target");
  const target = targetAt >= 0 ? argv[targetAt + 1] : "tests";
  if (target === "wireframe") {
    const result = generateWireframe();
    const problems = verifyFixtureFile(result.file);
    if (problems.length > 0) throw new Error(`Fixture file privacy check failed:\n- ${problems.join("\n- ")}`);
    console.log(JSON.stringify({ ...result, privacyCheck: "passed" }, null, 2));
    return;
  }
  if (target !== "tests") throw new Error(`Unknown --target ${String(target)} (tests | wireframe)`);
  writeOrCheckTests(argv.includes("--check"));
}

if (process.env["KILN_UI_FIXTURES_VITEST"] === "1") {
  // `npx vitest run --config tools/uiFixtures.vitest.config.ts`: the tests target, under Vitest.
  const { test } = await import("vitest");
  test("generate UI test fixtures", () => writeOrCheckTests(process.env["KILN_UI_FIXTURES_CHECK"] === "1"), 600_000);
} else if (process.env["VITEST"] === undefined) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
