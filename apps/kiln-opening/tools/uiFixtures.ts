/**
 * UI wireframe fixtures from the real V1.6.1 engine (docs/ui-v1.6.1/fixtures.json).
 *
 * Seeded games are driven through `createGame` / `applyAction` / `submitContribution` by the
 * strategic computer policy (src/multiplayer/computerPlayer.ts). A few moments need one seat
 * to make a specific (legal, engine-validated) choice — e.g. a Commission Shifu that reserves
 * face up and then looks at the top 3. Those "steered" commands are recorded per moment.
 *
 * Every captured moment stores only what the viewer's client may hold: the viewer's
 * `PlayerView` (public projection + the viewer's own private view), the decision prompt, the
 * DESIGN §5.4 selector / view-model outputs computed from that view, and recent public events.
 * A privacy check (`assertNoForeignSecrets`) compares each moment against the authoritative
 * state's hidden piles and fails the run if any non-viewer secret appears.
 *
 * Regenerate (either works, no extra dependencies):
 *   npx vite-node tools/uiFixtures.ts
 *   npx vitest run --config tools/uiFixtures.vitest.config.ts
 * Re-check an existing file's privacy only:
 *   npx vite-node tools/uiFixtures.ts --verify [docs/ui-v1.6.1/fixtures.json]
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
  canalBargeOptions,
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
  salvageOptions,
  scorePreview,
  shapedVessels,
  submitContribution,
  testPiecesOptions,
  viewOf,
} from "../src/game/index.ts";
import type {
  ActorView,
  AuthoritativeCommand,
  GameEvent,
  GameState,
  KilnId,
  PlayerCount,
  PlayerId,
  PlayerView,
  PrivateFiringState,
  PublicGameEvent,
  RoundNumber,
} from "../src/game/index.ts";
import { createStrategicComputerPolicy, fallbackComputerCommands } from "../src/multiplayer/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT_DIR = resolve(ROOT, "docs/ui-v1.6.1");
const OUT_FILE = resolve(OUT_DIR, "fixtures.json");

/** The clock never advances, so the policy's decision deadline never fires: deterministic. */
const POLICY = createStrategicComputerPolicy({ now: () => 0 });
const RECENT_EVENTS = 24;
const SEAT_NAMES = ["Lin", "Zhao", "Wen", "Su"] as const;

// ═══════════════════════════════════════════════════════════════════════════════════════
// Table driver
// ═══════════════════════════════════════════════════════════════════════════════════════

interface LoggedEvent {
  seq: number;
  revision: number;
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
    this.log(created.events);
    this.syncWindow();
  }

  private log(events: readonly GameEvent[]): void {
    for (const event of events) this.events.push({ seq: this.events.length + 1, revision: this.state.revision, event });
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
      this.log(result.events);
    } else {
      const result = applyAction(this.state, playerId, command, this.rng, { checkInvariants: true });
      if (!result.ok) return false;
      this.state = result.state;
      this.log(result.events);
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
// Capture
// ═══════════════════════════════════════════════════════════════════════════════════════

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

/** Heat ladder for the docked FiringStage: Preferred-Heat bands and each ceramic's chip. */
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
): Moment {
  const view = table.playerView(viewerId);
  const actor = table.view(viewerId);
  const prompt = decisionPrompt(view.game);
  const moment: Moment = {
    id: meta.id,
    title: meta.title,
    description: meta.description,
    source: {
      seed: table.seed,
      playerCount: table.playerCount,
      gameId: table.state.gameId,
      round: table.state.round,
      revision: table.state.revision,
      phase: table.state.phase.type,
      commandsPlayed: table.commands,
      policy: POLICY.version,
      steered: structuredClone(table.steered),
    },
    viewerId,
    viewerActs: prompt.actorIds.includes(viewerId),
    playerView: view,
    decisionPrompt: prompt,
    selectors: { ...commonSelectors(view), ...extra(view, actor), legalCommands: legalCommandSummary(view) },
    recentPublicEvents: table.recentPublicEvents(),
    notes: meta.notes ?? [],
  };
  assertNoForeignSecrets(table.state, table.priv, moment, publiclyRevealed(table.events));
  return moment;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Privacy check
// ═══════════════════════════════════════════════════════════════════════════════════════

/** Walks every key and string of a value. */
function walk(value: unknown, visit: (key: string | null, v: unknown) => void, key: string | null = null): void {
  visit(key, value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, null);
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walk(v, visit, k);
  }
}

/**
 * Fails if the moment holds anything a non-viewer seat keeps secret, or any server-only pile:
 * - structural: no `hidden` / `secret` key; `own` is the viewer's; any pending look, fire peek
 *   or sealed Contribution in `own` belongs to the viewer;
 * - by identity: no Order ID from another seat's hand, the Main deck or discard, or the
 *   Starting box, and no Tech ID from a Tech deck, appears anywhere in the moment — except the
 *   IDs in the viewer's own private look (which are the viewer's to see) and IDs some public
 *   event already revealed (a face-up Order that was reserved or rotated off the display);
 * - no other seat's unrevealed Contribution.
 */
/** Every string any public event has ever carried (e.g. a face-up Order later reserved, or
 * the 2 face-up Orders discarded by the round-start rotation): public knowledge for all. */
function publiclyRevealed(events: readonly LoggedEvent[]): Set<string> {
  const seen = new Set<string>();
  for (const e of events) {
    walk(projectEvent(e.event), (_key, v) => {
      if (typeof v === "string") seen.add(v);
    });
  }
  return seen;
}

function assertNoForeignSecrets(state: GameState, priv: PrivateFiringState, moment: Moment, revealed: ReadonlySet<string>): void {
  const problems: string[] = [];
  const viewer = moment.viewerId;
  const own = moment.playerView.own;
  if (own === null || own.playerId !== viewer) problems.push("own view is not the viewer's");
  if (own?.pendingLook && own.pendingLook.playerId !== viewer) problems.push("pending look of another seat");
  if (own?.firePeek && own.firePeek.playerId !== viewer) problems.push("fire peek of another seat");
  const ownLook = new Set<string>();
  if (own?.pendingLook) {
    for (const id of own.pendingLook.kind === "guild_inspection" ? own.pendingLook.techIds : own.pendingLook.orderIds) ownLook.add(id);
  }
  const forbidden = new Map<string, string>();
  for (const [pid, hand] of Object.entries(state.hidden.orderHands)) {
    if (pid !== viewer) for (const id of hand) forbidden.set(id, `${pid}'s hand`);
  }
  for (const id of state.hidden.mainDeck) if (!ownLook.has(id)) forbidden.set(id, "Main deck");
  for (const id of state.hidden.mainDiscard) forbidden.set(id, "Main discard");
  for (const id of state.hidden.startingBox) forbidden.set(id, "Starting box");
  for (const discipline of DISCIPLINES) {
    for (const id of state.hidden.techDecks[discipline]) if (!ownLook.has(id)) forbidden.set(id, `${discipline} Tech deck`);
  }
  // Once revealed by a public event, an ID is no longer secret (it may sit face down now).
  for (const id of revealed) forbidden.delete(id);
  const look = state.hidden.pendingLook;
  if (look !== null && look.playerId !== viewer) {
    for (const id of look.kind === "guild_inspection" ? look.techIds : look.orderIds) forbidden.set(id, `${look.playerId}'s private look`);
  }
  walk(moment, (key, v) => {
    if (key === "hidden" || key === "secret") problems.push(`server-only key "${key}"`);
    if (typeof v === "string" && forbidden.has(v)) problems.push(`${v} from ${forbidden.get(v)}`);
  });
  // Another seat may already have submitted (that fact is public via phase.submittedPlayerIds);
  // what it submitted must not appear: no sealed card outside the viewer's own view, and no
  // card or Fuel Ledger flag on that seat's projected CONTRIBUTION_SUBMITTED event.
  if (state.phase.type === "firing_contributions") {
    let sealed = 0;
    walk(moment, (key, v) => {
      if (key === "pendingContribution" && v !== null && v !== undefined) sealed += 1;
    });
    if (sealed > (own?.pendingContribution ? 1 : 0)) problems.push("a sealed Contribution outside the viewer's own view");
    for (const [pid, submission] of Object.entries(priv.submissions)) {
      if (pid === viewer || submission === undefined) continue;
      const leaked = moment.recentPublicEvents.some((e) => {
        const ev = e.event as unknown as Record<string, unknown>;
        return ev["type"] === "CONTRIBUTION_SUBMITTED" && ev["playerId"] === pid && ("card" in ev || "fuelLedger" in ev);
      });
      if (leaked) problems.push(`unrevealed Contribution of ${pid} while the window is open`);
    }
  }
  for (const [pid, peek] of Object.entries(state.hidden.firePeeks)) {
    if (pid !== viewer && peek !== undefined && JSON.stringify(moment).includes(`"firePeek":{"playerId":"${pid}"`)) {
      problems.push(`fire peek of ${pid}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`Privacy check failed for ${moment.id} (viewer ${viewer}):\n- ${[...new Set(problems)].join("\n- ")}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Moment searches
// ═══════════════════════════════════════════════════════════════════════════════════════

type Found = { moment: Moment; score: number } | null;

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
    quotes["materialsYardShifu_2clay_2wood_withBonus"] = quoteMaterialsYard(actor, {
      type: "PLACE_MATERIALS_YARD",
      workerId: shifu.id,
      clay: 2,
      wood: 2,
      buyShifuBonus: true,
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
    canalBargeOptions: canalBargeOptions(view),
    imperialPriorityOptions: imperialPriorityOptions(view),
  };
}

/** 1. 3-player Round 2 Work Phase: viewer's before_action, Workshop Tech owned (Form &
 * Decorate space 2 unlocked) and the Glaze & Load second space still locked. */
function findWorkPhaseR2(): Found {
  let best: Found = null;
  for (let seed = 1; seed <= 120 && (best === null || best.score < 4); seed += 1) {
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
              "The viewer owns a Workshop Tech, so the second Form & Decorate space is unlocked; the second Glaze & Load space still carries its Lock token. Placement options, quotes and the Commission / Guild / Magistrate option lists are for this exact state.",
          },
          workSelectors,
        ),
      };
    }
  }
  return best;
}

/** 2. 4-player Round 3, Commission Market: viewer's Shifu reserved face up (slot empty until
 * the turn ends) and is now looking at the top 3 (private). */
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
        const slot = options.faceUpSlots[0];
        const orderId = slot === undefined ? null : t.state.market.display[slot];
        if (slot === undefined || orderId === null || orderId === undefined || !options.lookTopThree) return null;
        steeredSeat = actor;
        return {
          command: { type: "PLACE_COMMISSION_MARKET", workerId: shifu.id, first: { kind: "face_up", slotIndex: slot, orderId, gain: "coins" } },
          why: "Shifu to the Commission Market: first reservation face up (its slot stays empty until the turn ends).",
        };
      }
      if (phase.step.kind === "commission_market" && phase.step.awaiting === "reservation" && phase.step.topThreeAvailable) {
        return { command: { type: "COMMISSION_RESERVE", choice: { kind: "look_top_three" } }, why: "Second reservation: look at the top 3 (private)." };
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
        phase.step.awaiting === "look_choice" &&
        t.state.market.refillPendingFor === actor &&
        t.state.market.display.includes(null)
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
            "The viewer's Shifu reserved a face-up Order (its display position is null until the viewer's turn ends — market.refillPendingFor is the viewer), gained a resource, then chose 'look at the top 3'. own.pendingLook holds the 3 Orders; other players only see counts.pendingLook (kind + count).",
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
  for (let seed = 1; seed <= 150 && (best === null || best.score < 9); seed += 1) {
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
    let localMoment: Moment | null = null;
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
  for (let seed = 1; seed <= 60 && (best === null || best.score < 5); seed += 1) {
    const table = new Table(seed, playerCount);
    const viewerSeat = "p1";
    const steer = kilnSteer(viewerSeat, "GE");
    let localBest = -1;
    let localMoment: Moment | null = null;
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
  for (let seed = 1; seed <= 60 && (best === null || best.score < 4); seed += 1) {
    const table = new Table(seed, 2);
    let localBest = -1;
    let localMoment: Moment | null = null;
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
  for (let seed = 1; seed <= 150 && (best === null || best.score < 8); seed += 1) {
    const table = new Table(seed, 3);
    const steer = kilnSteer("p1", "GE");
    let localBest = -1;
    let localMoment: Moment | null = null;
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
        const slot = options.faceUpSlots[0];
        const orderId = slot === undefined ? null : t.state.market.display[slot];
        if (slot === undefined || orderId === null || orderId === undefined) return null;
        return {
          command: { type: "PLACE_COMMISSION_MARKET", workerId: worker.id, first: { kind: "face_up", slotIndex: slot, orderId, gain: "clay" } },
          why: "Reserve Orders at the Commission Market so the hand exceeds the limit at Cleanup.",
        };
      }
      if (phase.step.kind === "commission_market" && phase.step.awaiting === "reservation") {
        const options = commissionOptions(view, phase.step.effect);
        if (options.blind) return { command: { type: "COMMISSION_RESERVE", choice: { kind: "blind" } }, why: "Second reservation: blind." };
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
  for (let seed = 1; seed <= 40 && (best === null || best.score < 2); seed += 1) {
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
  for (let seed = 1; seed <= 120 && (best === null || best.score < 9); seed += 1) {
    const table = new Table(seed, 3);
    let localBest = -1;
    let localMoment: Moment | null = null;
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
// Main
// ═══════════════════════════════════════════════════════════════════════════════════════

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

export function generate(): { file: string; moments: Array<{ id: string; seed: number; playerCount: number; round: number; phase: string; viewerId: string }>; missing: string[] } {
  const missing: string[] = [];
  const moments: Moment[] = [];
  const take = (name: string, found: Found) => {
    if (found === null) missing.push(name);
    else moments.push(found.moment);
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
}

/**
 * Re-reads the written file and checks, without the authoritative state, that each moment is
 * shaped like one viewer's client data: no server-only keys, `own` is the viewer's, private
 * looks / peeks / sealed Contributions are the viewer's, and other seats' Order hands appear
 * only as counts. (The identity check against the hidden piles runs at capture time.)
 */
export function verifyFixtureFile(file = OUT_FILE): string[] {
  const data = JSON.parse(readFileSync(file, "utf8")) as { moments: Moment[] };
  const problems: string[] = [];
  for (const m of data.moments) {
    const own = m.playerView.own;
    if (m.playerView.viewerId !== m.viewerId) problems.push(`${m.id}: playerView.viewerId differs from viewerId`);
    if (own === null || own.playerId !== m.viewerId) problems.push(`${m.id}: own view missing or not the viewer's`);
    if (own?.pendingLook && own.pendingLook.playerId !== m.viewerId) problems.push(`${m.id}: foreign pending look`);
    if (own?.firePeek && own.firePeek.playerId !== m.viewerId) problems.push(`${m.id}: foreign fire peek`);
    const look = m.playerView.game.counts.pendingLook;
    if (look !== null && look.playerId !== m.viewerId && own?.pendingLook) problems.push(`${m.id}: look contents for another seat's look`);
    walk(m, (key, v) => {
      if (key === "hidden" || key === "secret" || key === "orderHands" && Array.isArray(v)) problems.push(`${m.id}: server-only key ${key}`);
      if (key === "orderHand" && v !== own?.orderHand && Array.isArray(v)) problems.push(`${m.id}: a second orderHand`);
      if (key === "submissions" || key === "mainDeck" && Array.isArray(v) || key === "techDecks" && v !== null && typeof v === "object" && Object.values(v).some(Array.isArray)) {
        problems.push(`${m.id}: hidden pile ${key}`);
      }
    });
    for (const [pid, n] of Object.entries(m.playerView.game.counts.orderHands)) {
      if (typeof n !== "number") problems.push(`${m.id}: ${pid}'s hand is not a count`);
    }
  }
  return problems;
}

function report(): void {
  const result = generate();
  const problems = verifyFixtureFile(result.file);
  if (problems.length > 0) throw new Error(`Fixture file privacy check failed:\n- ${problems.join("\n- ")}`);
  console.log(JSON.stringify({ ...result, privacyCheck: "passed" }, null, 2));
}

if (process.env["VITEST"] !== undefined) {
  const { test } = await import("vitest");
  test("generate UI fixtures", () => report(), 600_000);
} else if (process.argv.includes("--verify")) {
  // Privacy check of an existing file only: npx vite-node tools/uiFixtures.ts --verify [file]
  const index = process.argv.indexOf("--verify");
  const file = process.argv[index + 1] ?? OUT_FILE;
  const problems = verifyFixtureFile(resolve(file));
  console.log(problems.length === 0 ? `privacy check passed: ${file}` : `privacy check FAILED:\n- ${problems.join("\n- ")}`);
  if (problems.length > 0) process.exitCode = 1;
} else {
  report();
}
