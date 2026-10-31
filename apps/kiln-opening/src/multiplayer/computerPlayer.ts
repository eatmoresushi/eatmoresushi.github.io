/**
 * The strategic V1.6.2 computer player (DESIGN §3.4, §4.5, §4.6, §5.2, §9.2 P9; ENGINE_V1.6.2_DELTA.md §10).
 *
 * **What it may know.** `chooseCommand(view, seat)` receives only the seat's `ActorView`: the
 * public projection plus its own hand, private look, Test Pieces peek and sealed Contribution
 * (`computerObservation.ts`). It never sees `GameState`, so deck orders, other hands and
 * unrevealed Contributions cannot influence a choice (`computer_hidden_independence.test.ts`).
 *
 * **How it decides.** Every decision is routed on `decisionPrompt` and the phase, and built
 * from the engine's own selectors (`placementOptions`, `loadDestinationOptions`,
 * `kilnMasterOption`, `commissionOptions`, `orderMatchOptions`, the firing-window options,
 * `legalContributions`, …). Candidates are ranked by a value model and each one is checked with
 * the engine's `validateAction` before it is returned, so the policy never re-implements a
 * rule's legality; when nothing it prefers validates it returns null and the service uses
 * `fallbackComputerCommands`. The value model:
 *
 * - **Orders.** Each held Order is planned against the seat's pipeline (Finished, Loaded and
 *   Shaped ceramics plus vessels still to form). Requirements are independent per dimension
 *   (L437): every Order is precompiled into its valid Shape, Glaze and Decoration multisets, so
 *   a partial selection is feasible iff each dimension's fixed values fit one valid multiset.
 *   Plans give a completion probability, the vessels still to form (Shape and Decoration) and
 *   the Glazes that keep a plan alive when a vessel is loaded.
 * - **Heat.** Glazes and kiln spaces are chosen for the expected heat: the public Kiln Die, the
 *   space's zone or Kiln Furniture modifier, the Imperial modifier, the Kiln Master marker, and
 *   the remaining Fire deck computed from the public discard (and the seat's own peek). The same
 *   expectation chooses Contributions (with a model of the other participants' pushes from
 *   their public loads), Kiln Master's marker at loading (L647, R22), Test Pieces, Jun,
 *   Protective Saggars, Second Firing (the better of 2 cards) and Ge (on any of its ceramics of
 *   the firing, a Standard one becoming Fine, with its 1 VP per delivered Crackle ceramic, rev. 5
 *   L482, L484). The Fire deck model
 *   follows R15: once only buried cards are left, the next card comes from the reshuffled
 *   discard. There is no player Heat marker since revision 4 (changes 28, 31).
 * - **Sales.** A Finished Flawed ceramic can complete no Order and enter no Exhibition (rev. 5
 *   L300), so it is sold for 2 Coins as a free action (rev. 5 L172) in the seat's next free-action
 *   window (before or after its worker action, or its Order Phase turn), before any other choice.
 *   There is no sale during the firing or at Cleanup (R26).
 * - **Imperial Priority** is spent in a Work turn's windows (threshold 1.5). In the Order Phase
 *   (legal there, R28) its ceramic waits for the next round's Kiln Die and keeps the Imperial
 *   Kiln full, so the seat spends it there only in Rounds 1–4 and only when waiting for that
 *   roll could not change the best load (`orderPhaseImperialPriority`); never in Round 5, where
 *   the ceramic is never fired.
 * - **Work.** A small dynamic programme plans the seat's remaining placements this round over
 *   an abstract economy (resources, Shaped and Loaded counts, free personal spaces, kiln
 *   contention, Order and Tech offers); the best first step is then built concretely.
 *
 * **Determinism.** No `Math.random` and no clock in any choice: ties fall to a fixed order or
 * a hash of the seat's `aiSeed`. The only clock use is the cooperative decision deadline: past
 * it the policy throws `ComputerPolicyTimeoutError`, which the service logs server-side and
 * answers with the canonical fallback (DESIGN §4.5: the message is fixed and never forwarded).
 */

import {
  DECORATIONS,
  DISCIPLINES,
  FIRING,
  GAME_CONFIG,
  GLAZES,
  IMPERIAL_TRACK,
  KILNS,
  KILN_SPACE_IDS,
  LOCATIONS,
  ORDERS,
  QUALITY_RANK,
  SHAPES,
  TECHS,
  afterQualityOptions,
  colourSamplesSwapOptions,
  commissionOptions,
  contributionCard,
  decisionPrompt,
  guildInspectionOptions,
  guildOptions,
  handLimitStatus,
  imperialPriorityOptions,
  junOptions,
  kilnMasterOption,
  magistratesHallQuote,
  setupChoiceOptions,
  contributionOptions,
  loadDestinationOptions,
  lookedOrderOptions,
  orderMatchOptions,
  placementOptions,
  preferredHeat,
  qualityForDifference,
  secondFiringChoiceOptions,
  sellFlawedOptions,
  settersMarkOptions,
  shapeClay,
  techsOfDiscipline,
  testPiecesOptions,
  validateAction,
  vesselCoins,
  zoneModifier,
} from "../game/index.ts";
import type {
  ActorView,
  AuthoritativeCommand,
  CeramicId,
  CeramicState,
  SelectPick,
  Decoration,
  FinishedCeramic,
  FormVesselSpec,
  GameAction,
  Glaze,
  GuildTechOption,
  HeatDelta,
  KilnId,
  KilnSpaceId,
  LoadSpec,
  LoadedCeramic,
  OrderDefinition,
  OrderId,
  OrderMatchOption,
  OrderRelationDefinition,
  PlayerId,
  PlayerState,
  PublicGameState,
  Quality,
  Shape,
  ShapedCeramic,
  SubmitContributionCommand,
  TechDiscipline,
  TechId,
  WorkerEffect,
} from "../game/index.ts";
import { CANONICAL_COMPUTER_POLICY } from "./computerPolicy.ts";
import type { ComputerPolicy, ComputerSeatContext } from "./computerPolicy.ts";
import type { ComputerPolicyVersion } from "./types.ts";

// ═══════════════════════════════════════════════════════════════════════════════════════
// 1. Policy objects and the decision deadline
// ═══════════════════════════════════════════════════════════════════════════════════════

export const STRATEGIC_COMPUTER_POLICY_VERSION = "rules-v1.6.2-strategic-001" satisfies ComputerPolicyVersion;
export const STRATEGIC_COMPUTER_POLICY_LABEL = "V1.6.2 Strategic";
/**
 * The cooperative per-decision budget of the service's policy. Typical decisions take a few
 * milliseconds (the `computer_strength` suite measures them); the budget only bounds a
 * pathological case, which then falls back to the canonical command. One request may play up
 * to 24 computer actions (the service's per-request cap), so even 24 decisions that each hit
 * the budget stay at 1.8 s, inside an Edge function's ~2 s per-request CPU allowance, while
 * leaving ample headroom over the slowest decision measured (p99 ≈ 4 ms, max ≈ 30 ms).
 */
export const DEFAULT_DECISION_BUDGET_MS = 75;
/**
 * The default budget of a direct `chooseStrategicCommand` call (tests, analysis tools), which
 * runs outside any request and should not fall back merely because a loaded machine is slow.
 */
export const DIRECT_DECISION_BUDGET_MS = 1_000;

/**
 * Thrown when a policy runs past its decision budget. The message is fixed: it never names a
 * card, so even a logger that forwarded it could not leak the seat's hand (DESIGN §4.5).
 */
export class ComputerPolicyTimeoutError extends Error {
  constructor(readonly budgetMs: number) {
    super(`The computer policy exceeded its ${budgetMs} ms decision budget.`);
    this.name = "ComputerPolicyTimeoutError";
  }
}

export interface StrategicPolicyOptions {
  /** Cooperative per-decision budget in ms (default `DEFAULT_DECISION_BUDGET_MS`). */
  decisionBudgetMs?: number;
  /** Clock in ms, injectable for tests; default `performance.now`. Used only for the deadline. */
  now?: () => number;
}

function defaultNow(): number {
  return globalThis.performance.now();
}

class Deadline {
  private readonly end: number;
  private calls = 0;

  constructor(
    private readonly now: () => number,
    readonly budgetMs: number,
  ) {
    this.end = now() + budgetMs;
  }

  /** Throws once the budget is spent. Cheap: the clock is read every 16th call. */
  check(): void {
    this.calls += 1;
    if ((this.calls & 15) === 0 && this.now() > this.end) {
      throw new ComputerPolicyTimeoutError(this.budgetMs);
    }
  }

  /** An unconditional clock check, for the end of an expensive step. */
  checkNow(): void {
    if (this.now() > this.end) {
      throw new ComputerPolicyTimeoutError(this.budgetMs);
    }
  }
}

/**
 * The strategic policy. Returns null only when none of its preferred commands validates; the
 * service then commits the first legal `fallbackComputerCommands(view)` candidate.
 */
export function createStrategicComputerPolicy(options: StrategicPolicyOptions = {}): ComputerPolicy {
  const budgetMs = options.decisionBudgetMs ?? DEFAULT_DECISION_BUDGET_MS;
  const now = options.now ?? defaultNow;
  return {
    version: STRATEGIC_COMPUTER_POLICY_VERSION,
    label: STRATEGIC_COMPUTER_POLICY_LABEL,
    chooseCommand(view, seat) {
      return chooseStrategicCommand(view, seat, new Deadline(now, budgetMs));
    },
  };
}

export const STRATEGIC_COMPUTER_POLICY: ComputerPolicy = createStrategicComputerPolicy();

/**
 * Every V1.6.2 policy a server knows, the default first: new computer seats are stamped with
 * the strategic policy; seats stamped earlier with the canonical one keep it.
 */
export const COMPUTER_POLICIES: readonly ComputerPolicy[] = [STRATEGIC_COMPUTER_POLICY, CANONICAL_COMPUTER_POLICY];

/**
 * Wraps any policy with a decision timeout: an asynchronous proposal that has not settled
 * within `budgetMs`, or a synchronous one that took longer, is rejected with
 * `ComputerPolicyTimeoutError`, so the service falls back to the canonical command.
 */
export function withDecisionTimeout(policy: ComputerPolicy, budgetMs: number, now: () => number = defaultNow): ComputerPolicy {
  return {
    version: policy.version,
    label: policy.label,
    chooseCommand(view, seat) {
      const started = now();
      const proposal = policy.chooseCommand(view, seat);
      if (!(proposal instanceof Promise)) {
        if (now() - started > budgetMs) {
          throw new ComputerPolicyTimeoutError(budgetMs);
        }
        return proposal;
      }
      return new Promise<AuthoritativeCommand | null>((resolve, reject) => {
        const timer = setTimeout(() => reject(new ComputerPolicyTimeoutError(budgetMs)), budgetMs);
        proposal.then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (cause: unknown) => {
            clearTimeout(timer);
            reject(cause);
          },
        );
      });
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 2. Small helpers
// ═══════════════════════════════════════════════════════════════════════════════════════

type ActionOf<T extends GameAction["type"]> = Extract<GameAction, { type: T }>;
type Dist = ReadonlyArray<readonly [number, number]>;

const QUALITY_VALUE: Readonly<Record<Quality, number>> = { flawed: 0.7, standard: 2, fine: 3.1, masterpiece: 5 };
const QUALITY_BY_RANK: readonly Quality[] = ["flawed", "standard", "fine", "masterpiece"];
const MASTERPIECE_RANK = QUALITY_RANK.masterpiece;
const SHAPE_COUNT = SHAPES.length;
const GLAZE_COUNT = GLAZES.length;
const DECORATION_COUNT = DECORATIONS.length;
/** Generic vessels (no Order asks for one): cheap Shapes, Plain (Ru, O10, O22). */
const GENERIC_DECORATION: Decoration = "plain";
const COLOUR_SAMPLES: TechId = "T10";
const PROTECTIVE_SAGGARS: TechId = "T11";
const FUEL_LEDGER: TechId = "T12";
const REWORKING_TABLE: TechId = "T05";
const SENIOR_APPRENTICE: TechId = "T18";
const PREPARED_CLAY: TechId = "T17";
const DECORATORS_KIT: TechId = "T16";
const LARGE_THROWING_WHEEL: TechId = "T01";
const KILN_TENDING: TechId = "T20";
const CONNOISSEUR: TechId = "T19";
const TRIBUTE_WARE: TechId = "T25";

function sequenceOf(id: string): number {
  const match = /^c([0-9]+)$/.exec(id);
  return match === null ? Number.MAX_SAFE_INTEGER : Number(match[1]);
}

function ceramicsOf<S extends CeramicState["stage"]>(game: PublicGameState, playerId: PlayerId, stage: S): Array<Extract<CeramicState, { stage: S }>> {
  return Object.values(game.ceramics)
    .filter((c): c is Extract<CeramicState, { stage: S }> => c.ownerId === playerId && c.stage === stage)
    .sort((a, b) => sequenceOf(a.id) - sequenceOf(b.id));
}

function ownsTech(p: PlayerState, techId: TechId): boolean {
  return p.techs.some((tech) => tech.id === techId);
}

function techReady(p: PlayerState, techId: TechId): boolean {
  const owned = p.techs.find((tech) => tech.id === techId);
  return owned !== undefined && !(TECHS[techId].oncePerRound && owned.usedThisRound);
}

function kilnReady(p: PlayerState, kilnId: KilnId): boolean {
  return p.kilnId === kilnId && !p.kilnAbilityUsedThisRound;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** FNV-1a of the seat seed and a key: a stable, seat-specific tie-break. */
function tieHash(seed: number, key: string): number {
  let hash = (Math.trunc(seed) ^ 0x811c9dc5) >>> 0;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** The Quality a heat gives; `neverFlawed` for a Protective Saggars owner (v1.6.2 L643). */
function qualityAt(heat: number, preferred: number, neverFlawed = false): Quality {
  const quality = qualityForDifference(heat - preferred);
  return neverFlawed && quality === "flawed" ? "standard" : quality;
}

/** A utility over the seat's own ceramics, floored at Standard under Protective Saggars. */
function floored(k: Know, utility: (q: Quality) => number): (q: Quality) => number {
  return ownsTech(k.me, PROTECTIVE_SAGGARS) ? (quality) => utility(quality === "flawed" ? "standard" : quality) : utility;
}

function stepQuality(quality: Quality, steps: number, cap: Quality): Quality {
  const rank = Math.min(QUALITY_RANK[quality] + steps, QUALITY_RANK[cap]);
  return QUALITY_BY_RANK[rank] ?? quality;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 3. Per-decision knowledge
// ═══════════════════════════════════════════════════════════════════════════════════════

interface Know {
  readonly view: ActorView;
  readonly game: PublicGameState;
  readonly pid: PlayerId;
  readonly me: PlayerState;
  readonly round: number;
  /** Rounds after the current one (0 in Round 5). */
  readonly roundsAfter: number;
  readonly lastRound: boolean;
  readonly hand: readonly OrderId[];
  readonly seed: number;
  readonly deadline: Deadline;
  /** This round's Kiln Die (L148); 2 before the first roll. */
  readonly die: number;
  readonly memo: Map<string, unknown>;
}

function knowledge(view: ActorView, seat: ComputerSeatContext | null, deadline: Deadline): Know {
  const game = view.game;
  const me = game.players[view.viewerId];
  if (me === undefined) {
    throw new Error("The computer seat is not seated in this game.");
  }
  const rounds = GAME_CONFIG.rounds;
  const die = game.firing?.kilnDie ?? (game.kilnDie !== null && game.kilnDie.round === game.round ? game.kilnDie.value : 2);
  return {
    view,
    game,
    pid: view.viewerId,
    me,
    round: game.round,
    roundsAfter: rounds - game.round,
    lastRound: game.round >= rounds,
    hand: view.own.orderHand,
    seed: seat?.aiSeed ?? 0,
    deadline,
    die,
    memo: new Map(),
  };
}

function memo<T>(k: Know, key: string, build: () => T): T {
  if (k.memo.has(key)) {
    return k.memo.get(key) as T;
  }
  const value = build();
  k.memo.set(key, value);
  return value;
}

function workPhaseOpen(k: Know): boolean {
  return k.game.phase.type === "work_turn" || k.game.phase.type === "round_start_setters_mark";
}

function availableWorkerCount(p: PlayerState): number {
  return Object.values(p.workers).filter((w) => w.placement === null).length;
}

function freePersonalSpaces(p: PlayerState, locationId: "form_decorate" | "glaze_load"): number {
  const used = new Set(
    Object.values(p.workers)
      .filter((w) => w.placement?.locationId === locationId)
      .map((w) => w.placement?.spaceIndex),
  );
  return p.personalSpaces[locationId].filter((space, index) => space.unlocked && !used.has(index)).length;
}

function sharedSpaceOpenFor(game: PublicGameState, playerId: PlayerId, spaceId: KilnSpaceId): boolean {
  const space = game.sharedKiln.spaces[spaceId];
  return space.active && space.ceramicIds.length === 0 && (space.setterMarkOwnerId === null || space.setterMarkOwnerId === playerId);
}

function openSharedSpaces(game: PublicGameState, playerId: PlayerId): number {
  return KILN_SPACE_IDS.filter((spaceId) => sharedSpaceOpenFor(game, playerId, spaceId)).length;
}

function imperialOpen(game: PublicGameState, playerId: PlayerId): boolean {
  const p = game.players[playerId];
  if (p === undefined || !p.imperial.kilnGained) {
    return false;
  }
  return !Object.values(game.ceramics).some((c) => c.stage === "loaded" && c.ownerId === playerId && c.placement.kiln === "imperial");
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 4. Fire and heat expectations (public information plus the seat's own peek)
// ═══════════════════════════════════════════════════════════════════════════════════════

function deckCounts(values: readonly number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function removeOne(counts: Map<number, number>, value: number): void {
  const held = counts.get(value) ?? 0;
  if (held > 0) {
    counts.set(value, held - 1);
  }
}

function toDist(counts: ReadonlyMap<number, number>): Dist {
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  if (total <= 0) {
    return toDist(deckCounts(FIRING.fireDeck));
  }
  return [...counts.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([value, n]) => [value, n / total] as const);
}

/** The Fire deck's cards: the full deck minus the open discard (L526) and the cards of the
 * current firing (the round's card and any revealed Second Firing cards). Buried cards are in
 * it too; their values are unknown to the table except a seat's own peek. */
function unseenFire(game: PublicGameState): Map<number, number> {
  const counts = deckCounts(FIRING.fireDeck);
  for (const value of game.fireDiscard) {
    removeOne(counts, value);
  }
  const firing = game.firing;
  if (firing !== null) {
    if (firing.fireModifier !== null) {
      removeOne(counts, firing.fireModifier);
    }
    for (const value of firing.pendingExtraFire?.modifiers ?? []) {
      removeOne(counts, value);
    }
  }
  return counts;
}

/** Unburied cards left in the Fire deck (public: every bury is public, R15). */
function unburiedFire(game: PublicGameState): number {
  return Math.max(0, game.counts.fireDeck - game.counts.fireBuried);
}

/**
 * The deck cards a draw may take before any reshuffle: the deck's cards less the seat's own
 * buried peek of this round (it sits at the bottom, L645).
 */
function drawableFire(k: Know): Map<number, number> {
  const counts = unseenFire(k.game);
  const peek = k.view.own.firePeek;
  if (peek !== null && peek.round === k.game.round && peek.buried === true) removeOne(counts, peek.modifier);
  return counts;
}

/**
 * The next Fire card (R15): the seat's own unburied peek is the top card (L645); with only
 * buried cards left, the next card comes from the reshuffled open discard; otherwise from the
 * deck's unburied cards.
 */
function nextFireDist(k: Know): Dist {
  const peek = k.view.own.firePeek;
  const firing = k.game.firing;
  if (peek !== null && peek.round === k.game.round && firing !== null && firing.fireModifier === null && peek.buried !== true) {
    return [[peek.modifier, 1]];
  }
  if (unburiedFire(k.game) === 0 && k.game.fireDiscard.length > 0) {
    return toDist(deckCounts(k.game.fireDiscard));
  }
  return toDist(drawableFire(k));
}

/** Expected utility over the next Fire card; own utilities come `floored` (Protective Saggars). */
function expectQuality(heatBeforeFire: number, preferred: number, fire: Dist, utility: (q: Quality) => number): number {
  let total = 0;
  for (const [value, p] of fire) {
    total += p * utility(qualityAt(heatBeforeFire + value, preferred));
  }
  return total;
}

function positionModifierOf(game: PublicGameState, ceramic: LoadedCeramic): number {
  const placement = ceramic.placement;
  if (placement.kiln === "imperial") {
    return placement.imperialModifier;
  }
  return game.sharedKiln.spaces[placement.spaceId].kilnFurniture?.modifier ?? zoneModifier(placement.spaceId);
}

/** The Kiln Master marker a loaded ceramic carries (L647, public), 0 without one. */
function markerValueOf(ceramic: LoadedCeramic): number {
  return ceramic.kilnMasterMarker ?? 0;
}

function clampBase(value: number): number {
  return clamp(value, FIRING.baseHeat.minimum, FIRING.baseHeat.maximum);
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 5. Order models and the hand planner
// ═══════════════════════════════════════════════════════════════════════════════════════

type Dim = "shape" | "glaze" | "decoration";

interface OrderModel {
  readonly def: OrderDefinition;
  readonly n: number;
  readonly minRank: number;
  /** Masterpieces the Order needs (an `at_least_n_quality` relation or a Masterpiece minimum). */
  readonly mpCount: number;
  /** Valid value multisets per dimension, as count vectors over SHAPES / GLAZES / DECORATIONS. */
  readonly shapeSets: readonly number[][];
  readonly glazeSets: readonly number[][];
  readonly decoSets: readonly number[][];
}

const MODELS = new Map<OrderId, OrderModel>();

function countVectors(length: number, total: number): number[][] {
  if (length === 1) {
    return [[total]];
  }
  const result: number[][] = [];
  for (let first = total; first >= 0; first -= 1) {
    for (const rest of countVectors(length - 1, total - first)) {
      result.push([first, ...rest]);
    }
  }
  return result;
}

function expand<T>(counts: readonly number[], domain: readonly T[]): T[] {
  const values: T[] = [];
  counts.forEach((n, index) => {
    for (let copy = 0; copy < n; copy += 1) {
      values.push(domain[index] as T);
    }
  });
  return values;
}

function permutationsOf<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) {
    return [[...items]];
  }
  const result: T[][] = [];
  items.forEach((item, index) => {
    for (const rest of permutationsOf([...items.slice(0, index), ...items.slice(index + 1)])) {
      result.push([item, ...rest]);
    }
  });
  return result;
}

function relationDim(relation: OrderRelationDefinition): Dim | "quality" {
  switch (relation.type) {
    case "same_shape":
    case "different_shape":
    case "all_different_shape":
      return "shape";
    case "same_glaze":
    case "different_glaze":
    case "all_different_glaze":
    case "required_glazes":
      return "glaze";
    case "same_decoration":
    case "different_decoration":
    case "at_least_n_distinct_decorations":
    case "required_decorations":
      return "decoration";
    case "at_least_n_quality":
      return "quality";
  }
}

function includesAll<T>(values: readonly T[], required: readonly T[]): boolean {
  const pool = [...values];
  for (const value of required) {
    const index = pool.indexOf(value);
    if (index < 0) {
      return false;
    }
    pool.splice(index, 1);
  }
  return true;
}

function relationHolds(relation: OrderRelationDefinition, values: readonly string[]): boolean {
  switch (relation.type) {
    case "same_shape":
    case "same_glaze":
    case "same_decoration":
      return relation.indices.every((index) => values[index] === values[relation.indices[0] ?? 0]);
    case "different_shape":
    case "all_different_shape":
    case "different_glaze":
    case "all_different_glaze":
    case "different_decoration":
      return new Set(relation.indices.map((index) => values[index])).size === relation.indices.length;
    case "at_least_n_distinct_decorations":
      return new Set(relation.indices.map((index) => values[index])).size >= relation.count;
    case "required_glazes":
      return includesAll(values, relation.values);
    case "required_decorations":
      return includesAll(values, relation.values);
    case "at_least_n_quality":
      return true;
  }
}

function dimValid(def: OrderDefinition, dim: Dim, values: readonly string[]): boolean {
  const relations = (def.relations ?? []).filter((relation) => relationDim(relation) === dim);
  return permutationsOf(values).some((assigned) => {
    const slotsFit = def.ceramics.every((slot, index) => {
      const value = assigned[index];
      if (dim === "shape") {
        return (slot.shape === undefined || slot.shape === value) && (slot.shapes === undefined || (slot.shapes as readonly string[]).includes(value ?? ""));
      }
      if (dim === "glaze") {
        return slot.glaze === undefined || slot.glaze === value;
      }
      return (
        (slot.decoration === undefined || slot.decoration === value) &&
        (slot.decorations === undefined || (slot.decorations as readonly string[]).includes(value ?? ""))
      );
    });
    return slotsFit && relations.every((relation) => relationHolds(relation, assigned));
  });
}

function orderModel(orderId: OrderId): OrderModel {
  const cached = MODELS.get(orderId);
  if (cached !== undefined) {
    return cached;
  }
  const def = ORDERS[orderId];
  const n = def.ceramics.length;
  const sets = (dim: Dim, domain: readonly string[]): number[][] =>
    countVectors(domain.length, n).filter((counts) => dimValid(def, dim, expand(counts, domain)));
  const mpRelation = (def.relations ?? []).find((relation) => relation.type === "at_least_n_quality" && relation.quality === "masterpiece");
  const mpCount = def.minQuality === "masterpiece" ? n : mpRelation !== undefined && mpRelation.type === "at_least_n_quality" ? mpRelation.count : 0;
  const model: OrderModel = {
    def,
    n,
    minRank: QUALITY_RANK[def.minQuality],
    mpCount,
    shapeSets: sets("shape", SHAPES),
    glazeSets: sets("glaze", GLAZES),
    decoSets: sets("decoration", DECORATIONS),
  };
  MODELS.set(orderId, model);
  return model;
}

/** Some valid multiset contains every fixed value (the free slots fill the rest). */
function fits(sets: readonly number[][], fixed: readonly number[]): boolean {
  return sets.some((set) => set.every((n, index) => n >= (fixed[index] ?? 0)));
}

function withOne(fixed: readonly number[], index: number): number[] {
  const next = [...fixed];
  next[index] = (next[index] ?? 0) + 1;
  return next;
}

/** One ceramic of the seat's pipeline as the planner sees it. */
interface PItem {
  readonly id: CeramicId;
  readonly stage: "finished" | "loaded" | "shaped";
  readonly shape: number;
  /** Index into GLAZES, or -1 while still free (Shaped). */
  readonly glaze: number;
  /** Index into DECORATIONS, or -1 for a Crackle wildcard (L484). */
  readonly deco: number;
  /** P(final Quality rank ≥ r) for r = 0…3 (exact for Finished; a Crackle ceramic keeps its
   * Quality, rev. 5 L482). */
  readonly pAtLeast: readonly number[];
  readonly pMasterpiece: number;
  readonly masterpiece: boolean;
  readonly exhibitValue: number;
}

interface OrderPlan {
  readonly orderId: OrderId;
  readonly model: OrderModel;
  readonly gross: number;
  readonly p: number;
  readonly chosen: readonly PItem[];
  readonly newCount: number;
}

interface VesselDemand {
  readonly orderId: OrderId;
  readonly shape: Shape;
  readonly decoration: Decoration;
  readonly value: number;
}

interface HandPlan {
  readonly plans: readonly OrderPlan[];
  readonly planOf: ReadonlyMap<CeramicId, OrderPlan>;
  readonly demands: readonly VesselDemand[];
}

/** Base probability that a fired ceramic reaches a Quality rank when its Glaze is aimed well. */
function aimedQualityP(k: Know, rank: number): number {
  const jun = k.me.kilnId === "JU";
  // Protective Saggars: never Flawed, and once a round a Standard becomes Fine (L643);
  // Ge crackles any ceramic of the firing, and a Standard one becomes Fine (rev. 5 L482).
  const saggars = ownsTech(k.me, PROTECTIVE_SAGGARS);
  const lift = saggars || k.me.kilnId === "GE";
  if (rank <= 0) return 1;
  if (rank === 1) return saggars ? 1 : jun || lift ? 0.98 : 0.95;
  if (rank === 2) return jun ? 0.9 : lift ? 0.88 : 0.8;
  return jun ? 0.45 : 0.33;
}

/** Chance a Shaped vessel is loaded and fired before the end of the game. */
function loadLaterP(k: Know): number {
  if (k.roundsAfter >= 1) return 0.9;
  if (k.game.phase.type === "work_turn" && freePersonalSpaces(k.me, "glaze_load") > 0 && availableWorkerCount(k.me) > 0) return 0.65;
  return 0;
}

/** Chance a vessel not yet formed is formed, loaded and fired in time. */
function makeLaterP(k: Know): number {
  if (k.roundsAfter >= 2) return 0.85;
  if (k.roundsAfter === 1) return workPhaseOpen(k) ? 0.75 : 0.6;
  if (k.game.phase.type === "work_turn" && availableWorkerCount(k.me) >= 2 && freePersonalSpaces(k.me, "form_decorate") > 0 && freePersonalSpaces(k.me, "glaze_load") > 0) {
    return 0.3;
  }
  return 0;
}

/** A Finished ceramic's Quality rank; Crackle keeps it (rev. 5 L482, change 39). */
function finishedRank(c: FinishedCeramic): number {
  return QUALITY_RANK[c.quality];
}

/** P(rank ≥ r) for a loaded ceramic, from its heat situation. */
function loadedQualityP(k: Know, c: LoadedCeramic): { pAtLeast: number[]; pMp: number } {
  const record = k.game.firing?.ceramics[c.id];
  if (record?.quality !== null && record?.quality !== undefined) {
    const rank = QUALITY_RANK[record.quality];
    return { pAtLeast: [0, 1, 2, 3].map((r) => (rank >= r ? 1 : 0)), pMp: rank === MASTERPIECE_RANK ? 1 : 0 };
  }
  const preferred = preferredHeat(c.glaze);
  const pos = positionModifierOf(k.game, c);
  const fire = nextFireDist(k);
  const bases: Dist =
    c.placement.kiln === "imperial"
      ? [[k.die, 1]]
      : k.game.firing?.baseHeat !== null && k.game.firing?.baseHeat !== undefined
        ? [[k.game.firing.baseHeat, 1]]
        : [
            [clampBase(k.die - 1), 0.2],
            [k.die, 0.6],
            [clampBase(k.die + 1), 0.2],
          ];
  const pAtLeast = [0, 0, 0, 0];
  let pMp = 0;
  for (const [base, pb] of bases) {
    const markers = [markerValueOf(c)];
    let best: number[] = [0, 0, 0, 0];
    let bestScore = -1;
    for (const marker of markers) {
      const probs = [0, 0, 0, 0];
      for (const [fire1, pf] of fire) {
        const rank = QUALITY_RANK[qualityAt(base + pos + marker + fire1, preferred, ownsTech(k.me, PROTECTIVE_SAGGARS))];
        for (let r = 0; r <= rank; r += 1) {
          probs[r] = (probs[r] ?? 0) + pf;
        }
      }
      const score = (probs[1] ?? 0) + (probs[2] ?? 0) + (probs[3] ?? 0);
      if (score > bestScore) {
        bestScore = score;
        best = probs;
      }
    }
    for (let r = 0; r < 4; r += 1) {
      pAtLeast[r] = (pAtLeast[r] ?? 0) + pb * (best[r] ?? 0);
    }
    pMp += pb * (best[3] ?? 0);
  }
  return { pAtLeast, pMp };
}

function poolItems(k: Know): PItem[] {
  return memo(k, "pool", () => {
    const items: PItem[] = [];
    for (const c of ceramicsOf(k.game, k.pid, "finished")) {
      if (c.quality === "flawed") continue;
      const rank = finishedRank(c);
      items.push({
        id: c.id,
        stage: "finished",
        shape: SHAPES.indexOf(c.shape),
        glaze: GLAZES.indexOf(c.glaze),
        deco: c.crackle ? -1 : DECORATIONS.indexOf(c.decoration),
        pAtLeast: [0, 1, 2, 3].map((r) => (rank >= r ? 1 : 0)),
        pMasterpiece: rank === MASTERPIECE_RANK ? 1 : 0,
        masterpiece: rank === MASTERPIECE_RANK,
        exhibitValue: QUALITY_VALUE[c.quality],
      });
    }
    for (const c of ceramicsOf(k.game, k.pid, "loaded")) {
      const { pAtLeast, pMp } = loadedQualityP(k, c);
      items.push({
        id: c.id,
        stage: "loaded",
        shape: SHAPES.indexOf(c.shape),
        glaze: GLAZES.indexOf(c.glaze),
        deco: DECORATIONS.indexOf(c.decoration),
        pAtLeast,
        pMasterpiece: pMp,
        masterpiece: false,
        exhibitValue: 3,
      });
    }
    const load = loadLaterP(k);
    for (const c of ceramicsOf(k.game, k.pid, "shaped")) {
      items.push({
        id: c.id,
        stage: "shaped",
        shape: SHAPES.indexOf(c.shape),
        glaze: -1,
        deco: DECORATIONS.indexOf(c.decoration),
        pAtLeast: [0, 1, 2, 3].map((r) => load * aimedQualityP(k, r)),
        pMasterpiece: load * aimedQualityP(k, MASTERPIECE_RANK),
        masterpiece: false,
        exhibitValue: 2.5,
      });
    }
    return items;
  });
}

/** Imperial Audience's VP (Recognition 4, L449). */
function audienceVp(): number {
  const reward = IMPERIAL_TRACK.track.find((space) => space.space === 4)?.reward;
  return reward?.kind === "vp" ? reward.vp : 0;
}

/** True once the last Work Phase is over: nothing gained from now on can be spent or loaded. */
function afterFinalWork(k: Know): boolean {
  return k.lastRound && !workPhaseOpen(k);
}

/** End-game VP for `coins` (1 per 3, capped, L508). */
function endCoinVp(coins: number): number {
  const rule = GAME_CONFIG.coinEndGame;
  return Math.min(Math.floor(Math.max(0, coins) / rule.coinsPerVp), rule.maxVp);
}

/** Imperial Grant's Coins (Recognition 1, L446). */
function grantCoins(): number {
  const reward = IMPERIAL_TRACK.track.find((space) => space.space === 1)?.reward;
  return reward?.kind === "resources" ? reward.coins : 0;
}

/** Tie breaker 1 (L512): farther along Imperial Recognition. */
const RECOGNITION_TIE_BREAK = 0.05;

/**
 * A Crown's worth now at Recognition `from`, valued by what its milestone can still do:
 * the Imperial Grant's Clay and Wood need a Work Phase to spend them, the Imperial Kiln and
 * Imperial Priority need a Glaze & Load or a worker action before a firing. After the last
 * Work Phase only the Grant's Coin (as end-game Coin VP), the Audience and overflow VP count.
 */
function crownStepValue(k: Know, from: number): number {
  const ended = afterFinalWork(k);
  switch (from) {
    case 0:
      if (ended) return grantCoins() * coinValue(k) + RECOGNITION_TIE_BREAK;
      return k.roundsAfter >= 1 ? 1.6 + 0.6 : 0.8;
    case 1:
      if (ended) return RECOGNITION_TIE_BREAK;
      return 0.6 + 1.6 * Math.min(k.roundsAfter, 3);
    case 2:
      if (ended) return RECOGNITION_TIE_BREAK;
      return 0.6 + (k.roundsAfter >= 1 ? 2 : 0.3);
    case 3:
      return audienceVp() + 0.2;
    default:
      return IMPERIAL_TRACK.overflowVpPerCrown;
  }
}

function crownsValue(k: Know, crowns: number, from: number = k.me.imperial.recognition): number {
  let value = 0;
  let recognition = from;
  for (let crown = 0; crown < crowns; crown += 1) {
    value += crownStepValue(k, recognition);
    recognition = Math.min(4, recognition + 1);
  }
  return value;
}

function coinValue(k: Know): number {
  return k.lastRound ? 1 / 3 : 0.5;
}

function woodValue(k: Know): number {
  return k.lastRound ? 0.15 : 0.35;
}

/** What completing the Order is worth to the seat, before the ceramics it consumes. */
function orderGross(k: Know, def: OrderDefinition): number {
  let value = def.vp + def.coins * coinValue(k) + crownsValue(k, def.crowns);
  if (def.crowns >= 1) {
    if (k.me.kilnId === "GU") value += 0.7 * (KILNS.GU.params.vp + KILNS.GU.params.coins * coinValue(k));
    if (ownsTech(k.me, TRIBUTE_WARE)) value += 0.7 * crownStepValue(k, Math.min(4, k.me.imperial.recognition + def.crowns));
  }
  return value;
}

/** The best way to fill one Order from `items` plus vessels still to form. */
function planOrder(k: Know, orderId: OrderId, items: readonly PItem[]): OrderPlan | null {
  const model = orderModel(orderId);
  const n = model.n;
  const shapeOk = (shape: number) => fits(model.shapeSets, withOne(new Array(SHAPE_COUNT).fill(0), shape));
  const glazeOk = (glaze: number) => glaze < 0 || fits(model.glazeSets, withOne(new Array(GLAZE_COUNT).fill(0), glaze));
  const decoOk = (deco: number) => deco < 0 || fits(model.decoSets, withOne(new Array(DECORATION_COUNT).fill(0), deco));
  const candidates = items
    .filter((item) => (item.pAtLeast[model.minRank] ?? 0) > 0.01 && shapeOk(item.shape) && glazeOk(item.glaze) && decoOk(item.deco))
    .slice(0, 12);
  const pNew = makeLaterP(k) * aimedQualityP(k, model.minRank);
  const pNewMp = makeLaterP(k) * aimedQualityP(k, MASTERPIECE_RANK);
  let best: { chosen: PItem[]; p: number; cost: number } | null = null;
  const chosen: PItem[] = [];
  const evaluate = (): void => {
    k.deadline.check();
    const shapes = new Array<number>(SHAPE_COUNT).fill(0);
    const glazes = new Array<number>(GLAZE_COUNT).fill(0);
    const decos = new Array<number>(DECORATION_COUNT).fill(0);
    let p = 1;
    let cost = 0;
    let definiteMp = 0;
    const mpChances: number[] = [];
    for (const item of chosen) {
      shapes[item.shape] = (shapes[item.shape] ?? 0) + 1;
      if (item.glaze >= 0) glazes[item.glaze] = (glazes[item.glaze] ?? 0) + 1;
      if (item.deco >= 0) decos[item.deco] = (decos[item.deco] ?? 0) + 1;
      p *= item.pAtLeast[model.minRank] ?? 0;
      cost += item.stage === "finished" ? item.exhibitValue * 0.05 : 0;
      if (item.masterpiece) definiteMp += 1;
      else mpChances.push(item.pMasterpiece);
    }
    if (!fits(model.shapeSets, shapes) || !fits(model.glazeSets, glazes) || !fits(model.decoSets, decos)) {
      return;
    }
    const fresh = n - chosen.length;
    p *= pNew ** fresh;
    for (let index = 0; index < fresh; index += 1) mpChances.push(pNewMp);
    const mpNeeded = model.mpCount - definiteMp;
    if (mpNeeded > 0 && model.minRank < MASTERPIECE_RANK) {
      if (mpChances.length < mpNeeded) return;
      mpChances.sort((a, b) => b - a);
      for (let index = 0; index < mpNeeded; index += 1) p *= (mpChances[index] ?? 0) / Math.max(0.01, aimedQualityP(k, model.minRank));
    }
    if (best === null || p > best.p + 1e-9 || (Math.abs(p - best.p) <= 1e-9 && cost < best.cost)) {
      best = { chosen: [...chosen], p, cost };
    }
  };
  const walk = (start: number): void => {
    evaluate();
    if (chosen.length >= n) return;
    for (let index = start; index < candidates.length; index += 1) {
      chosen.push(candidates[index] as PItem);
      walk(index + 1);
      chosen.pop();
    }
  };
  walk(0);
  const found = best as { chosen: PItem[]; p: number; cost: number } | null;
  if (found === null || found.p <= 0) {
    return null;
  }
  return { orderId, model, gross: orderGross(k, model.def), p: Math.min(1, found.p), chosen: found.chosen, newCount: n - found.chosen.length };
}

/** New vessels (Shape, Decoration) that keep `plan` feasible, chosen cheapest first. */
function demandsOf(k: Know, plan: OrderPlan): VesselDemand[] {
  const shapes = new Array<number>(SHAPE_COUNT).fill(0);
  const decos = new Array<number>(DECORATION_COUNT).fill(0);
  for (const item of plan.chosen) {
    shapes[item.shape] = (shapes[item.shape] ?? 0) + 1;
    if (item.deco >= 0) decos[item.deco] = (decos[item.deco] ?? 0) + 1;
  }
  const shapeOrder = [...SHAPES].sort((a, b) => shapeClay(a) - shapeClay(b) || tieHash(k.seed, a) - tieHash(k.seed, b));
  const decoOrder: Decoration[] = [GENERIC_DECORATION, ...DECORATIONS.filter((d) => d !== GENERIC_DECORATION)];
  const demands: VesselDemand[] = [];
  let currentShapes = shapes;
  let currentDecos = decos;
  for (let index = 0; index < plan.newCount; index += 1) {
    const shape = shapeOrder.find((s) => fits(plan.model.shapeSets, withOne(currentShapes, SHAPES.indexOf(s))));
    const decoration = decoOrder.find((d) => fits(plan.model.decoSets, withOne(currentDecos, DECORATIONS.indexOf(d))));
    if (shape === undefined || decoration === undefined) break;
    currentShapes = withOne(currentShapes, SHAPES.indexOf(shape));
    currentDecos = withOne(currentDecos, DECORATIONS.indexOf(decoration));
    demands.push({ orderId: plan.orderId, shape, decoration, value: planValue(plan) / Math.max(1, plan.model.n) });
  }
  return demands;
}

/** What a ceramic earns when simply exhibited (L460–466), the baseline an Order must beat. */
const EXHIBIT_BASELINE = 2.6;

/** The planning value of an Order: its chance times what it earns beyond exhibiting its
 * ceramics, plus a little for finishing early (Coins sooner, a lighter hand). */
function planValue(plan: OrderPlan): number {
  return plan.p * (Math.max(0, plan.gross - plan.model.n * EXHIBIT_BASELINE) + 1);
}

/** Most leading Orders whose planning order `assignPlans` permutes (4! = 24 orders). */
const PLAN_PERMUTED = 4;

/** Plans the Orders in `sequence`, each taking the best of the ceramics still unclaimed. */
function assignInSequence(k: Know, sequence: readonly OrderPlan[], items: readonly PItem[]): OrderPlan[] {
  const used = new Set<CeramicId>();
  const raw: OrderPlan[] = [];
  for (const first of sequence) {
    const plan = planOrder(
      k,
      first.orderId,
      items.filter((item) => !used.has(item.id)),
    );
    if (plan === null || plan.p < 0.02) continue;
    raw.push(plan);
    for (const item of plan.chosen) used.add(item.id);
  }
  return raw;
}

/**
 * Assigns the pipeline's ceramics to the held Orders. When the Orders' own best plans share no
 * ceramic, each keeps its own. Otherwise the planning order matters — the most valuable Order
 * planned first may take, among equally good ceramics, the only one a second Order can use —
 * so the leading Orders are planned in every order and the assignment with the greatest total
 * planning value is kept (ties keep the value order).
 */
function assignPlans(k: Know, solo: readonly OrderPlan[], items: readonly PItem[]): OrderPlan[] {
  const claimed = new Set<CeramicId>();
  let overlap = false;
  for (const plan of solo) {
    for (const item of plan.chosen) {
      if (claimed.has(item.id)) overlap = true;
      claimed.add(item.id);
    }
  }
  if (!overlap) return solo.filter((plan) => plan.p >= 0.02);
  const head = solo.slice(0, PLAN_PERMUTED);
  const tail = solo.slice(PLAN_PERMUTED);
  let best: { plans: OrderPlan[]; total: number } | null = null;
  const permute = (prefix: OrderPlan[], rest: OrderPlan[]): void => {
    if (rest.length === 0) {
      k.deadline.check();
      const plans = assignInSequence(k, [...prefix, ...tail], items);
      const total = plans.reduce((sum, plan) => sum + planValue(plan), 0);
      if (best === null || total > best.total + 1e-9) best = { plans, total };
      return;
    }
    for (let index = 0; index < rest.length; index += 1) {
      permute([...prefix, rest[index] as OrderPlan], [...rest.slice(0, index), ...rest.slice(index + 1)]);
    }
  };
  permute([], head);
  return (best as { plans: OrderPlan[]; total: number } | null)?.plans ?? [];
}

/**
 * Plans the held Orders against the pipeline: the most valuable first, each taking the
 * ceramics it fits best, then scales the chance of every plan that still needs new vessels by
 * the seat's remaining production capacity (vessels are formed for the best plans first).
 */
function handPlan(k: Know): HandPlan {
  return memo(k, "handPlan", () => {
    const items = poolItems(k);
    const solo = k.hand
      .map((orderId) => planOrder(k, orderId, items))
      .filter((plan): plan is OrderPlan => plan !== null)
      .sort((a, b) => planValue(b) - planValue(a) || a.orderId.localeCompare(b.orderId));
    const raw = assignPlans(k, solo, items);
    raw.sort((a, b) => planValue(b) - planValue(a) || a.orderId.localeCompare(b.orderId));
    let capacity = productionCapacity(k);
    const plans = raw.map((plan) => {
      if (plan.newCount === 0) return plan;
      const factor = clamp(capacity / plan.newCount, 0, 1);
      capacity -= plan.newCount;
      return factor >= 1 ? plan : { ...plan, p: plan.p * factor };
    });
    plans.sort((a, b) => planValue(b) - planValue(a) || a.orderId.localeCompare(b.orderId));
    const planOf = new Map<CeramicId, OrderPlan>();
    for (const plan of plans) {
      for (const item of plan.chosen) planOf.set(item.id, plan);
    }
    const demands = plans
      .filter((plan) => plan.p > 0.05)
      .flatMap((plan) => demandsOf(k, plan))
      .sort((a, b) => b.value - a.value);
    return { plans, planOf, demands };
  });
}

/** The planned use of a ceramic: the Order share it would earn at or above `minRank`. */
function ceramicNeed(k: Know, ceramicId: CeramicId): { minRank: number; bonus: number; mpBonus: number } {
  const plan = handPlan(k).planOf.get(ceramicId);
  if (plan === undefined) {
    return { minRank: 4, bonus: 0, mpBonus: 0 };
  }
  const others = plan.chosen.filter((item) => item.id !== ceramicId).reduce((p, item) => p * (item.pAtLeast[plan.model.minRank] ?? 0), 1);
  const share = Math.max(0, plan.gross / plan.model.n - 2.4) * Math.max(0.25, others);
  return { minRank: plan.model.minRank, bonus: share, mpBonus: plan.model.mpCount > 0 && plan.model.minRank < MASTERPIECE_RANK ? share * 0.6 : 0 };
}

/** Utility of a ceramic of this seat ending at `quality` (exhibition value plus its planned
 * Order share, plus Ru's 4 VP for a Celadon Plain Masterpiece). */
function ceramicUtility(k: Know, ceramicId: CeramicId, glaze: Glaze, decoration: Decoration): (q: Quality) => number {
  const need = ceramicNeed(k, ceramicId);
  const ru = k.me.kilnId === "RU" && glaze === KILNS.RU.params.glaze && decoration === KILNS.RU.params.decoration;
  return (quality: Quality): number => {
    const rank = QUALITY_RANK[quality];
    let value = QUALITY_VALUE[quality];
    if (rank >= need.minRank && quality !== "flawed") value += need.bonus;
    if (quality === "masterpiece") {
      value += need.mpBonus;
      if (ru) value += 2.5;
    }
    return value;
  };
}

function loadedUtility(k: Know, c: LoadedCeramic): (q: Quality) => number {
  return floored(k, ceramicUtility(k, c.id, c.glaze, c.decoration));
}

/**
 * Held Orders expected to leave the hand by completion before the next Cleanup: plans that
 * need no new vessel, in full when their ceramics are Finished or loaded for this round's
 * firing, half when a Shaped one must still be loaded this Work Phase.
 */
function expectedCompletionsBeforeCleanup(k: Know): number {
  return memo(k, "completionsBeforeCleanup", () => {
    let expected = 0;
    for (const plan of handPlan(k).plans) {
      if (plan.newCount > 0) continue;
      const ready = plan.chosen.every((item) => item.stage === "finished" || item.stage === "loaded");
      expected += plan.p * (ready ? 1 : workPhaseOpen(k) ? 0.5 : 0);
    }
    return expected;
  });
}

/**
 * Whether one more Order — after `pending` reservations already counted for this action but
 * not yet in hand — would leave the seat over its hand limit at Cleanup (L325), once the
 * Orders it expects to complete first have left the hand.
 */
function reservationOverflows(k: Know, pending: number): boolean {
  const limit = handLimitStatus(k.view, k.pid).limit;
  return k.hand.length + pending + 1 - expectedCompletionsBeforeCleanup(k) > limit + 1e-9;
}

/**
 * A reservation that still needs new vessels completes less often than its plan suggests —
 * the plan cannot see the rivals' competition for kiln spaces or the Orders reserved after it
 * (self-play: about half of such reservations were ever completed). Head-to-head over 600
 * seeded 2–4-player games, this discount scored about 0.5 VP more per game than none.
 */
const RESERVATION_NEW_VESSEL_DISCOUNT = 0.75;

/**
 * The value of reserving `orderId` now: its plan against the ceramics the held Orders do not
 * already claim, its chance scaled by the production capacity those Orders leave, and — when
 * the hand would be over its limit at Cleanup, counting `pending` reservations this action
 * has already planned and the Orders expected to be completed first — only what it adds over
 * the weakest held Order, which Cleanup would discard (L325).
 */
function reservationValue(k: Know, orderId: OrderId, pending = 0): number {
  return memo(k, `reserve:${orderId}:${pending}`, () => {
    const plan = handPlan(k);
    const used = new Set(plan.plans.flatMap((p) => p.chosen.map((item) => item.id)));
    const items = poolItems(k).filter((item) => !used.has(item.id));
    const own = planOrder(k, orderId, items);
    if (own === null) return 0;
    const pendingNew = plan.plans.filter((p) => p.p > 0.1).reduce((sum, p) => sum + p.newCount, 0);
    const spare = productionCapacity(k) - pendingNew;
    const crowding = own.newCount === 0 ? 1 : clamp(spare / own.newCount, 0, 1);
    // In Round 5 a new Order can only use ceramics fired this round.
    const late = k.lastRound && own.newCount > 0 ? 0.4 : 1;
    const value = planValue({ ...own, p: own.p * crowding * late * (own.newCount > 0 ? RESERVATION_NEW_VESSEL_DISCOUNT : 1) });
    if (!reservationOverflows(k, pending)) return value;
    const values = plan.plans.map(planValue);
    const unplanned = k.hand.length - plan.plans.length;
    const weakest = unplanned > 0 ? 0 : Math.min(...values, Infinity);
    return Math.max(0, value - (Number.isFinite(weakest) ? weakest : 0) - 0.3);
  });
}

/** New vessels the seat can still form and fire before the game ends. */
function productionCapacity(k: Know): number {
  const perRound = 1.6 + 0.6 * (freePersonalSpacesTotal(k.me, "form_decorate") > 1 ? 1 : 0) + 0.6 * (freePersonalSpacesTotal(k.me, "glaze_load") > 1 ? 1 : 0);
  const thisRound = workPhaseOpen(k) ? Math.min(1, availableWorkerCount(k.me) / 3) * perRound : 0;
  return thisRound + perRound * k.roundsAfter;
}

function freePersonalSpacesTotal(p: PlayerState, locationId: "form_decorate" | "glaze_load"): number {
  return p.personalSpaces[locationId].filter((space) => space.unlocked).length;
}

/** The Main Orders whose identity the seat does not know: not shown, not held, not completed. */
function unknownMainOrders(k: Know): OrderId[] {
  return memo(k, "unknownMain", () => {
    const seen = new Set<OrderId>([...k.hand]);
    for (const orderId of k.game.market.display) if (orderId !== null) seen.add(orderId);
    for (const pid of k.game.playerOrder) {
      for (const record of k.game.players[pid]?.completedOrders ?? []) seen.add(record.orderId);
    }
    return (Object.keys(ORDERS) as OrderId[]).filter((orderId) => ORDERS[orderId].deck === "main" && !seen.has(orderId)).sort();
  });
}

/** Expected value of the best of `count` cards drawn from the unknown Main Orders. */
function expectedBestOf(k: Know, count: number, pending = 0): number {
  return memo(k, `bestOf:${count}:${pending}`, () => {
    const values = unknownMainOrders(k)
      .map((orderId) => reservationValue(k, orderId, pending))
      .sort((a, b) => a - b);
    const total = values.length;
    if (total === 0) return 0;
    const draws = Math.min(count, total);
    const choose = (n: number, r: number): number => {
      if (r < 0 || r > n) return 0;
      let result = 1;
      for (let index = 1; index <= r; index += 1) result = (result * (n - r + index)) / index;
      return result;
    };
    let expected = 0;
    const all = choose(total, draws);
    values.forEach((value, index) => {
      expected += value * (choose(index, draws - 1) / all);
    });
    return expected;
  });
}

/**
 * Expected value of a single-reservation Select (v1.6.2 L80): the best of the face-up Main
 * Orders showing and `count` cards drawn from the unknown Main Orders. Exact over the order
 * statistics of the look, like `expectedBestOf`.
 */
function expectedBestWithDisplay(k: Know, count: number, pending = 0): number {
  return memo(k, `bestOfWithDisplay:${count}:${pending}`, () => {
    let floor = 0;
    for (const orderId of k.game.market.display) {
      if (orderId !== null) floor = Math.max(floor, reservationValue(k, orderId, pending));
    }
    const values = unknownMainOrders(k)
      .map((orderId) => reservationValue(k, orderId, pending))
      .sort((a, b) => a - b);
    const total = values.length;
    const draws = Math.min(count, total);
    if (draws === 0) return floor;
    const choose = (n: number, r: number): number => {
      if (r < 0 || r > n) return 0;
      let result = 1;
      for (let index = 1; index <= r; index += 1) result = (result * (n - r + index)) / index;
      return result;
    };
    let expected = 0;
    const all = choose(total, draws);
    values.forEach((value, index) => {
      expected += Math.max(floor, value) * (choose(index, draws - 1) / all);
    });
    return expected;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 6. Valuations
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * The resources the seat's plan wants in hand. Wood covers the kiln fuel (1 per Glaze & Load
 * action into the Shared Kiln, L215, R24) as well as Contributions, Jun and Test Pieces.
 */
function resourceNeed(k: Know): { clay: number; wood: number; coins: number } {
  const demands = handPlan(k).demands.slice(0, 3);
  const clay = demands.length > 0 ? demands.reduce((sum, d) => sum + shapeClay(d.shape), 0) : 3;
  return { clay: Math.max(2, Math.min(4, clay)), wood: k.lastRound ? 2 : 3, coins: k.lastRound ? 0 : 5 };
}

function marginal(units: number, need: number, high: number, low: number): number {
  const covered = Math.min(units, need);
  return covered * high + Math.max(0, units - need) * low;
}

/** Value of holding these resources at the end of the seat's round plan. */
function resourceValue(k: Know, clay: number, wood: number, coins: number): number {
  const need = resourceNeed(k);
  if (k.lastRound) {
    return Math.min(coins, 15) / 3 + marginal(wood, need.wood, 0.3, 0.02) + clay * 0.01;
  }
  return marginal(clay, need.clay, 0.45, 0.15) + marginal(wood, need.wood, 0.35, 0.08) + marginal(coins, need.coins, 0.55, 0.3);
}

/**
 * A Tech's worth to the seat: its ability over the remaining rounds and the second personal space
 * it adds. Gaining a Tech scores no VP (v1.6.2 change 27, which superseded owner amendment A1).
 */
function techValue(k: Know, techId: TechId): number {
  const left = k.roundsAfter + (workPhaseOpen(k) ? 1 : 0);
  const later = k.roundsAfter;
  const unlock = TECHS[techId].unlocks !== null ? 0.7 * Math.min(later, 3) : 0;
  const perRound: Partial<Record<TechId, number>> = {
    T01: 0.25,
    T16: 0.3,
    T05: 0.15,
    T17: 0.7,
    T18: 0.45,
    T20: 0.5,
    T15: 0.35,
    T21: 0.4,
    T22: 0.25,
    // Protective Saggars: never Flawed and a free Standard → Fine each round (v1.6.2 L643).
    T11: 0.75,
    // Fuel Ledger: Bank and Stoke cost no Wood, and its 2 cards push ±2 for 1 Wood (v1.6.2 L644).
    T12: 0.4,
    T13: 0.25,
    // Second Firing: the better of 2 extra cards (v1.6.2 L646).
    T14: 0.5,
    T24: 0.4,
  };
  let ability = (perRound[techId] ?? 0) * left * kilnSynergy(k.me.kilnId, techId) * planFit(k, techId);
  // Connoisseur's Cabinet: +1 per exhibited Fine or Masterpiece, up to 5 (L626); most
  // ceramics go to Orders, so expect a few.
  if (techId === "T19") ability = Math.min(5, 0.4 + 0.45 * left);
  // Colour Samples: the when-acquired Select 3 (the display included), hand limit 5 and a
  // Select 3 swap each round (v1.6.2 L632, change 25).
  if (techId === "T10") ability = (k.hand.length <= 3 ? 2.2 : 1.4) + 0.15 * left + 0.3 * left;
  // Canal Barge: 2 Coins on the round's first completion (v1.6.2 L637), most rounds.
  if (techId === "T23") ability = TECHS.T23.params.coins * coinValue(k) * 0.6 * left * kilnSynergy(k.me.kilnId, techId);
  if (techId === "T25") ability = 0.2 * left * kilnSynergy(k.me.kilnId, techId) * Math.min(2, handPlan(k).plans.filter((p) => p.model.def.crowns > 0).length + 0.5);
  return unlock + ability;
}

/** How well a Tech suits the seat's Kiln Tradition (L472–492, Appendix B). */
function kilnSynergy(kilnId: KilnId | null, techId: TechId): number {
  switch (kilnId) {
    case "RU":
      // Precision for Celadon Plain Masterpieces.
      return techId === "T15" || techId === "T24" ? 1.4 : techId === "T13" ? 1.5 : 1;
    case "GU":
      // More Crown Orders completed, sooner.
      return techId === "T25" ? 1.6 : techId === "T23" ? 1.3 : 1;
    case "GE":
      // Under Protective Saggars a would-be Flawed ceramic is Standard, which Ge then makes Fine
      // (rev. 5 L660); Second Firing makes Flawed ceramics Standard or better to crackle.
      return techId === "T11" ? 1.3 : techId === "T14" ? 1.2 : 1;
    case "DI":
      // Cheap Bowls, Plates and Brush Washers: Clay and stacking.
      return techId === "T17" || techId === "T20" ? 1.2 : techId === "T21" ? 1.25 : techId === "T01" ? 0.6 : 1;
    case "JU":
      // Jun already corrects one ceramic per round.
      return techId === "T11" ? 0.8 : techId === "T24" ? 0.9 : 1;
    default:
      return 1;
  }
}

/** How well a Tech suits the vessels the held Orders still need. */
function planFit(k: Know, techId: TechId): number {
  const demands = handPlan(k).demands;
  if (demands.length === 0) return 1;
  const share = (test: (d: VesselDemand) => boolean): number => demands.filter(test).length / demands.length;
  switch (techId) {
    case "T01":
      return 0.5 + share((d) => (TECHS.T01.params.triggerShapes as readonly Shape[]).includes(d.shape));
    case "T16":
      // Any vessel (rev. 5 L622, change 37): no Decoration share.
      return 1;
    case "T21":
      return 0.6 + share((d) => (TECHS.T21.params.shapes as readonly Shape[]).includes(d.shape)) * 0.6;
    default:
      return 1;
  }
}

/** The best Tech this worker effect could take now at the Guild Hall, net of its printed cost. */
function bestTechOffer(k: Know, effect: WorkerEffect): { techId: TechId; net: number; price: number } | null {
  return memo(k, `tech:${effect}`, () => {
    let best: { techId: TechId; net: number; price: number } | null = null;
    for (const option of guildOptions(k.view, effect).faceUp) {
      if (!option.legal) continue;
      const net = techValue(k, option.techId) - option.cost * coinValue(k);
      if (best === null || net > best.net) best = { techId: option.techId, net, price: option.cost };
    }
    return best;
  });
}

/** A second Guild Hall take is worth its Coins only above this net value. */
const SECOND_TECH_THRESHOLD = 0.5;

/**
 * The Shifu's visit (v1.6.2 L237): up to 2 Techs from different disciplines, face-up or from
 * the inspected deck, each at its printed cost. Candidates are the legal face-up Techs and,
 * per unowned discipline with cards left, an estimate of its unseen Techs (the mean of the
 * two best). The value is the better of 1 take and 2 the Coins cover (at most one estimate,
 * since only one deck is inspected); `discipline` is the deck to inspect.
 */
function guildShifuValue(k: Know): { value: number; price: number; discipline: TechDiscipline | null } {
  return memo(k, "guild:shifu", () => {
    type Candidate = { discipline: TechDiscipline; net: number; price: number; unseen: boolean };
    const coins = k.me.resources.coins;
    const candidates: Candidate[] = [];
    for (const option of guildOptions(k.view, "shifu").faceUp) {
      if (option.legal) candidates.push({ discipline: option.discipline, net: techValue(k, option.techId) - option.cost * coinValue(k), price: option.cost, unseen: false });
    }
    const owned = new Set(k.me.techs.map((tech) => TECHS[tech.id].discipline));
    const visible = new Set<TechId>();
    for (const pid of k.game.playerOrder) for (const tech of k.game.players[pid]?.techs ?? []) visible.add(tech.id);
    for (const discipline of DISCIPLINES) for (const techId of k.game.techDisplay[discipline]) visible.add(techId);
    let bestUnseen: Candidate | null = null;
    for (const discipline of DISCIPLINES) {
      if (owned.has(discipline) || k.game.counts.techDecks[discipline] === 0 || k.me.techs.length >= GAME_CONFIG.techs.maxOwned) continue;
      const unknown = techsOfDiscipline(discipline).filter((techId) => !visible.has(techId) && TECHS[techId].cost <= coins);
      if (unknown.length === 0) continue;
      const ranked = unknown.map((techId) => ({ net: techValue(k, techId) - TECHS[techId].cost * coinValue(k), price: TECHS[techId].cost })).sort((a, b) => b.net - a.net);
      const first = ranked[0];
      const second = ranked[1] ?? first;
      if (first === undefined || second === undefined) continue;
      const candidate: Candidate = { discipline, net: (first.net + second.net) / 2, price: Math.max(first.price, second.price), unseen: true };
      candidates.push(candidate);
      if (bestUnseen === null || candidate.net > bestUnseen.net) bestUnseen = candidate;
    }
    let best: { value: number; price: number; discipline: TechDiscipline | null } = { value: -Infinity, price: 2, discipline: bestUnseen?.discipline ?? null };
    const pairs = k.me.techs.length + 2 <= GAME_CONFIG.techs.maxOwned && LOCATIONS.guild_hall.effects.shifu.maxTechs >= 2;
    for (const a of candidates) {
      if (a.net > best.value) best = { value: a.net, price: a.price, discipline: a.unseen ? a.discipline : (bestUnseen?.discipline ?? a.discipline) };
      if (!pairs) continue;
      for (const b of candidates) {
        if (b === a || b.discipline === a.discipline || (a.unseen && b.unseen) || a.price + b.price > coins || b.net <= SECOND_TECH_THRESHOLD) continue;
        const value = a.net + b.net;
        if (value > best.value) {
          const inspected = a.unseen ? a.discipline : b.unseen ? b.discipline : (bestUnseen?.discipline ?? a.discipline);
          best = { value, price: a.price + b.price, discipline: inspected };
        }
      }
    }
    return best;
  });
}

/** Exhibition score of a set of Finished ceramics (L458–466, T19). */
function exhibitionScore(k: Know, ceramics: readonly FinishedCeramic[]): number {
  const shown = ceramics.filter((c) => c.quality !== "flawed");
  let score = shown.reduce((sum, c) => sum + (c.quality === "masterpiece" ? 5 : c.quality === "fine" ? 3 : 2), 0);
  if (new Set(shown.map((c) => c.shape)).size >= 3) score += 3;
  if (new Set(shown.map((c) => c.glaze)).size >= 3) score += 3;
  if (ownsTech(k.me, CONNOISSEUR)) score += Math.min(5, shown.filter((c) => c.quality === "fine" || c.quality === "masterpiece").length);
  return score;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 7. Decisions by phase
// ═══════════════════════════════════════════════════════════════════════════════════════

function firstValid(k: Know, candidates: Iterable<GameAction>): GameAction | null {
  for (const candidate of candidates) {
    k.deadline.check();
    if (validateAction(k.view, candidate) === null) {
      return candidate;
    }
  }
  return null;
}

// ── Setup and Start of Round ──────────────────────────────────────────────────────────

const KILN_PREFERENCE: readonly KilnId[] = ["JU", "GE", "DI", "RU", "GU"];

/** The seat's knowledge as if it had already taken `kilnId` (a copy of the view; nothing else
 * changes), for valuing the Setup Main Order with the Kiln it comes with. */
function withKiln(k: Know, kilnId: KilnId): Know {
  const players = { ...k.game.players, [k.pid]: { ...k.me, kilnId } };
  const view: ActorView = { ...k.view, game: { ...k.game, players } };
  return { ...k, view, game: view.game, me: players[k.pid] as PlayerState, memo: new Map() };
}

/**
 * Setup step 9 (L130, R23): one command takes a Kiln and a face-up Main Order. The Kiln
 * by `KILN_PREFERENCE` among the available ones; the Main Order is the face-up one with the
 * highest `reservationValue`, valued as if that Kiln were already taken; ties to the lowest
 * position.
 */
function decideSetup(k: Know): GameAction | null {
  const options = setupChoiceOptions(k.view);
  if (options === null) return null;
  const available = new Set(options.kilns.filter((option) => option.available).map((option) => option.kilnId));
  const candidates: GameAction[] = [];
  for (const kilnId of KILN_PREFERENCE.filter((id) => available.has(id))) {
    const asIf = withKiln(k, kilnId);
    const slots = options.faceUpSlots
      .map((slotIndex) => ({ slotIndex, orderId: k.game.market.display[slotIndex] ?? null }))
      .filter((entry): entry is { slotIndex: number; orderId: OrderId } => entry.orderId !== null)
      .map((entry) => ({ ...entry, value: reservationValue(asIf, entry.orderId) }))
      .sort((a, b) => b.value - a.value || a.slotIndex - b.slotIndex);
    for (const { slotIndex, orderId } of slots) {
      candidates.push({ type: "SELECT_KILN", kilnId, mainOrder: { slotIndex, orderId } });
    }
  }
  return firstValid(k, candidates);
}

function decideSettersMark(k: Know): GameAction | null {
  const spaces = settersMarkOptions(k.view);
  const glazes = demandedGlazes(k);
  const scored = spaces
    .map((spaceId) => {
      const heat = k.die + zoneModifier(spaceId);
      const value = Math.max(...glazes.map((glaze) => -Math.abs(preferredHeat(glaze) - heat))) - (heat < 1 || heat > 4 ? 2 : 0);
      return { spaceId, value: value + (zoneModifier(spaceId) === 0 ? 0.1 : 0) };
    })
    .sort((a, b) => b.value - a.value);
  return firstValid(k, [...scored.map(({ spaceId }): GameAction => ({ type: "PLACE_SETTERS_MARK", spaceId })), { type: "PLACE_SETTERS_MARK", spaceId: null }]);
}

/** Glazes the held Orders still need on vessels to be loaded (all four when nothing specific). */
function demandedGlazes(k: Know): Glaze[] {
  const wanted = new Set<Glaze>();
  const plan = handPlan(k);
  for (const order of plan.plans) {
    const fixed = new Array<number>(GLAZE_COUNT).fill(0);
    for (const item of order.chosen) if (item.glaze >= 0) fixed[item.glaze] = (fixed[item.glaze] ?? 0) + 1;
    for (const glaze of GLAZES) if (fits(order.model.glazeSets, withOne(fixed, GLAZES.indexOf(glaze)))) wanted.add(glaze);
  }
  return wanted.size === 0 || wanted.size === GLAZE_COUNT ? [...GLAZES] : [...wanted];
}

// ── Contributions (secret, simultaneous; L281–291, L644) ─────────────────────────────

/** My firing value at a known Base Heat: each ceramic with its Kiln Master marker (chosen at
 * loading, L647), and Jun's ±1 after the Fire card when ready and affordable. */
function firingValueAtBase(k: Know, base: number, fire: Dist, woodLeft: number): number {
  const mine = ceramicsOf(k.game, k.pid, "loaded");
  if (mine.length === 0) return 0;
  const entries = mine.map((c) => ({
    c,
    utility: loadedUtility(k, c),
    preferred: preferredHeat(c.glaze),
    source: c.placement.kiln === "imperial" ? k.die : base,
    pos: positionModifierOf(k.game, c),
    marker: markerValueOf(c),
  }));
  let total = 0;
  const heatOf: number[] = [];
  for (const entry of entries) {
    const before = entry.source + entry.pos;
    total += expectQuality(before + entry.marker, entry.preferred, fire, entry.utility);
    heatOf.push(before + entry.marker);
  }
  if (kilnReady(k.me, "JU") && woodLeft >= KILNS.JU.params.wood) {
    let junGain = 0;
    for (const [fire1, pf] of fire) {
      let best = 0;
      entries.forEach((entry, index) => {
        const heat = (heatOf[index] ?? 0) + fire1;
        const current = entry.utility(qualityAt(heat, entry.preferred));
        for (const delta of [-1, 1]) {
          best = Math.max(best, entry.utility(qualityAt(heat + delta, entry.preferred)) - current);
        }
      });
      junGain += pf * Math.max(0, best - woodValue(k));
    }
    total += junGain;
  }
  return total;
}

/**
 * A rival participant's likely push: the Contribution card that best suits their public loads. A
 * Fuel Ledger owner holds 5 cards (v1.6.2 L289, L644, change 26): its plain Bank and Stoke cost
 * no Wood, so it may push with none, and with 1 Wood it may play Fuel Ledger Bank (−2) or Fuel
 * Ledger Stoke (+2); a Protective Saggars owner's ceramics are never Flawed (v1.6.2 L643).
 */
function rivalPushDist(k: Know, playerId: PlayerId): Dist {
  const rival = k.game.players[playerId];
  if (rival === undefined) return [[0, 1]];
  const loads = ceramicsOf(k.game, playerId, "loaded").filter((c) => c.placement.kiln === "shared");
  const fuelLedger = ownsTech(rival, FUEL_LEDGER);
  if (loads.length === 0 || (rival.resources.wood < 1 && !fuelLedger)) return [[0, 1]];
  const fire = nextFireDist(k);
  const saggars = ownsTech(rival, PROTECTIVE_SAGGARS);
  const value = (q: Quality): number => QUALITY_VALUE[saggars && q === "flawed" ? "standard" : q];
  const scoreAt = (delta: number): number =>
    loads.reduce((sum, c) => {
      const before = clampBase(k.die + delta) + positionModifierOf(k.game, c) + markerValueOf(c);
      return sum + expectQuality(before, preferredHeat(c.glaze), fire, value);
    }, 0);
  // The reluctance to spend a Wood card's Wood; almost none when Fuel Ledger makes it free.
  const woodCard = fuelLedger ? 0.05 : 0.35;
  const cards: Array<readonly [number, number]> = [
    [0, scoreAt(0)],
    [-1, scoreAt(-1) - woodCard],
    [1, scoreAt(1) - woodCard],
  ];
  // Fuel Ledger Bank and Fuel Ledger Stoke cost their printed 1 Wood.
  if (fuelLedger && rival.resources.wood >= 1) cards.push([-2, scoreAt(-2) - 0.35], [2, scoreAt(2) - 0.35]);
  let best = cards[0] as readonly [number, number];
  for (const card of cards) if (card[1] > best[1] + 1e-9) best = card;
  if (best[0] === 0) return [[-1, 0.1], [0, 0.8], [1, 0.1]];
  return [[best[0], 0.6], [0, 0.35], [-Math.sign(best[0]), 0.05]];
}

function convolve(a: Dist, b: Dist): Dist {
  const result = new Map<number, number>();
  for (const [x, px] of a) for (const [y, py] of b) result.set(x + y, (result.get(x + y) ?? 0) + px * py);
  return [...result.entries()].sort((l, r) => l[0] - r[0]);
}

function decideContribution(k: Know): AuthoritativeCommand | null {
  // `contributionOptions` carries each card's Wood and Heat (Fuel Ledger included); only the
  // affordable ones (`legalContributions`, Tend first) are candidates.
  const options = contributionOptions(k.view).filter((option) => option.affordable);
  const phase = k.game.phase;
  if (options.length === 0 || phase.type !== "firing_contributions") return null;
  let others: Dist = [[0, 1]];
  for (const playerId of phase.eligiblePlayerIds) {
    if (playerId !== k.pid) others = convolve(others, rivalPushDist(k, playerId));
  }
  // The round's card (R15: from the reshuffled discard once only buried cards are left).
  const fire = nextFireDist(k);
  let best: { command: SubmitContributionCommand; score: number } | null = null;
  for (const { command, heat: delta, woodCost: wood } of options) {
    let value = 0;
    for (const [push, p] of others) {
      value += p * firingValueAtBase(k, clampBase(k.die + delta + push), fire, k.me.resources.wood - wood);
    }
    // A Fuel Ledger card (±2) only when it is clearly better than the plain card it extends.
    const score = value - wood * woodValue(k) - (contributionCard(command.card).techId !== null ? 0.05 : 0);
    if (best === null || score > best.score + 1e-9) best = { command, score };
  }
  return best?.command ?? null;
}

// ── Test Pieces, Jun ──────────────────────────────────────────────────────────────────

function knownBase(k: Know): number {
  return k.game.firing?.baseHeat ?? k.die;
}

/**
 * The round's card after burying `peeked` (L645, R15): the next unburied card, or, when the
 * peeked card was the last one (the peek's own reshuffle already counted), the reshuffled
 * discard.
 */
function afterBuryDist(k: Know, peeked: number): Dist {
  const reshuffledByPeek = unburiedFire(k.game) === 0 && k.game.fireDiscard.length > 0;
  const rest = reshuffledByPeek ? deckCounts(k.game.fireDiscard) : unseenFire(k.game);
  removeOne(rest, peeked);
  const left = reshuffledByPeek ? k.game.fireDiscard.length - 1 : unburiedFire(k.game) - 1;
  if (left <= 0 && !reshuffledByPeek && k.game.fireDiscard.length > 0) return toDist(deckCounts(k.game.fireDiscard));
  return toDist(rest);
}

function decideTestPieces(k: Know): GameAction | null {
  const options = testPiecesOptions(k.view);
  if (options === null) return null;
  const base = knownBase(k);
  const wood = k.me.resources.wood;
  if (options.awaiting === "bury") {
    const peeked = options.peekedModifier;
    if (peeked === null) return firstValid(k, [{ type: "TEST_PIECES_BURY", bury: false }]);
    const keep = firingValueAtBase(k, base, [[peeked, 1]], wood);
    const bury = firingValueAtBase(k, base, afterBuryDist(k, peeked), wood);
    return firstValid(k, [{ type: "TEST_PIECES_BURY", bury: bury > keep + 0.05 }, { type: "TEST_PIECES_BURY", bury: false }]);
  }
  if (!options.canPeek) return firstValid(k, [{ type: "TEST_PIECES_DECIDE", peek: false }]);
  const fire = nextFireDist(k);
  const blind = firingValueAtBase(k, base, fire, wood);
  let informed = 0;
  for (const [value, p] of fire) {
    informed += p * Math.max(firingValueAtBase(k, base, [[value, 1]], wood - options.woodCost), firingValueAtBase(k, base, afterBuryDist(k, value), wood - options.woodCost));
  }
  const peek = informed - blind > options.woodCost * woodValue(k) + 0.1;
  return firstValid(k, [{ type: "TEST_PIECES_DECIDE", peek }, { type: "TEST_PIECES_DECIDE", peek: false }]);
}

function decideJun(k: Know): GameAction | null {
  const options = junOptions(k.view);
  const decline: GameAction = { type: "RESOLVE_JUN", adjustment: null };
  const firing = k.game.firing;
  if (options === null || firing === null || options.ceramicIds.length === 0) return firstValid(k, [decline]);
  let best: { action: GameAction; gain: number } | null = null;
  for (const ceramicId of options.ceramicIds) {
    const c = k.game.ceramics[ceramicId];
    const record = firing.ceramics[ceramicId];
    if (c === undefined || c.stage !== "loaded" || record === undefined) continue;
    const calculation = record.first;
    if (calculation === null) continue;
    const utility = loadedUtility(k, c);
    const current = utility(qualityAt(calculation.actualHeat, record.preferredHeat));
    for (const delta of [1, -1] as const) {
      const gain = utility(qualityAt(calculation.actualHeat + delta, record.preferredHeat)) - current;
      if (best === null || gain > best.gain) best = { action: { type: "RESOLVE_JUN", adjustment: { ceramicId, delta } }, gain };
    }
  }
  const threshold = options.woodCost * woodValue(k) + 0.05;
  return firstValid(k, best !== null && best.gain > threshold ? [best.action, decline] : [decline]);
}

// ── After Quality and sales ──────────────────────────────────────────────────────────

/**
 * Second Firing's 2 cards (v1.6.2 L646), drawn one after the other without replacement, as
 * pairs with probabilities (R15): from the deck's unburied cards while any are left, then from
 * the reshuffled open discard.
 */
function secondFiringPairs(k: Know): Array<readonly [number, number, number]> {
  const pairs: Array<readonly [number, number, number]> = [];
  const draw = (pool: Map<number, number>): Dist => toDist(pool);
  const unburied = unburiedFire(k.game);
  const discard = deckCounts(k.game.fireDiscard);
  const firstPool = unburied > 0 || k.game.fireDiscard.length === 0 ? drawableFire(k) : discard;
  for (const [a, pa] of draw(firstPool)) {
    let secondPool: Map<number, number>;
    if (unburied >= 2 || (unburied === 1 && k.game.fireDiscard.length === 0)) {
      secondPool = new Map(drawableFire(k));
      removeOne(secondPool, a);
    } else if (unburied === 1) {
      secondPool = new Map(discard);
    } else {
      secondPool = new Map(discard);
      removeOne(secondPool, a);
      if ([...secondPool.values()].every((n) => n === 0)) secondPool = new Map(drawableFire(k));
    }
    for (const [b, pb] of draw(secondPool)) pairs.push([a, b, pa * pb] as const);
  }
  return pairs;
}

/** The best value of one recalculation with card `fire1`, with R7's Jun when `jun`. */
function secondFiringValue(k: Know, record: NonNullable<NonNullable<PublicGameState["firing"]>["ceramics"][string]>, utility: (q: Quality) => number, fire1: number, jun: boolean): number {
  const calculation = record.first;
  if (calculation === null) return 0;
  const source = calculation.heatSource - calculation.fireModifier;
  const heat = source + fire1 + calculation.positionModifier + calculation.kilnMasterMarker;
  let value = utility(qualityAt(heat, record.preferredHeat));
  if (jun) {
    for (const delta of [-1, 1]) value = Math.max(value, utility(qualityAt(heat + delta, record.preferredHeat)) - woodValue(k));
  }
  return value;
}

/**
 * The value of a Crackle marker on `ceramicId` (rev. 5 L484): its wildcard Decoration and 1 VP
 * when it is delivered to complete an Order, at the odds its planned Order is completed (a
 * ceramic no held Order plans for may still meet a later one while rounds remain).
 */
function crackleValue(k: Know, ceramicId: CeramicId): number {
  const plan = handPlan(k).planOf.get(ceramicId);
  const deliveryP = plan !== undefined ? Math.max(0.3, Math.min(1, plan.p)) : k.roundsAfter >= 1 ? 0.4 : 0.1;
  return 0.15 + KILNS.GE.params.vpPerDeliveredCrackle * deliveryP;
}

function decideAfterQuality(k: Know): GameAction | null {
  const options = afterQualityOptions(k.view);
  const firing = k.game.firing;
  const end: GameAction = { type: "END_AFTER_QUALITY" };
  if (options.length === 0 || firing === null) return firstValid(k, [end]);
  // Protective Saggars' Standard targets: Ge on the only one would leave Saggars nothing to do
  // (Ge on a Standard makes it Fine as well), so that Standard → Fine is not Ge's gain
  // (rev. 5 L660: Saggars first, then Crackle on the same ceramic, is the other order).
  const saggarsTargets = options.find((option) => option.ability === "protective_saggars")?.ceramicIds ?? [];
  const candidates: Array<{ action: GameAction; gain: number }> = [];
  for (const option of options) {
    for (const ceramicId of option.ceramicIds) {
      const c = k.game.ceramics[ceramicId];
      const record = firing.ceramics[ceramicId];
      if (c === undefined || c.stage !== "loaded" || record === undefined || record.quality === null) continue;
      const utility = loadedUtility(k, c);
      const now = utility(record.quality);
      if (option.ability === "ge_crackle") {
        // Rev. 5 L482 (change 39): any ceramic develops Crackle; a Standard one becomes Fine, the
        // others keep their Quality. A Flawed one can complete no Order and enter no Exhibition
        // (rev. 5 L300), so the marker is worth nothing there (gain 0, never chosen).
        if (record.quality === "flawed") {
          candidates.push({ action: { type: "USE_GE_CRACKLE", ceramicId }, gain: 0 });
          continue;
        }
        // Between targets of equal value the better ceramic is preferred: it fills more Orders.
        const lift = record.quality === KILNS.GE.params.upgradeFrom ? utility(KILNS.GE.params.upgradeTo) - now : 0;
        const saggarsWouldLift = saggarsTargets.length === 1 && saggarsTargets[0] === ceramicId;
        const better = QUALITY_RANK[record.quality] * 0.001;
        candidates.push({ action: { type: "USE_GE_CRACKLE", ceramicId }, gain: (saggarsWouldLift ? 0 : lift) + crackleValue(k, ceramicId) + better });
      } else if (option.ability === "protective_saggars") {
        // Rev. 5 L643: Standard → Fine, no Wood. Ge may crackle the same ceramic afterwards
        // (L660).
        const improved = stepQuality(record.quality, 1, "fine");
        candidates.push({ action: { type: "USE_PROTECTIVE_SAGGARS", ceramicId }, gain: utility(improved) - now });
      } else {
        if (record.first === null) continue;
        const jun = kilnReady(k.me, "JU") && k.me.resources.wood >= KILNS.JU.params.wood;
        let expected = 0;
        for (const [a, b, p] of secondFiringPairs(k)) {
          expected += p * Math.max(secondFiringValue(k, record, utility, a, jun), secondFiringValue(k, record, utility, b, jun));
        }
        candidates.push({ action: { type: "USE_SECOND_FIRING", ceramicId }, gain: expected - now - 0.05 });
      }
    }
  }
  candidates.sort((a, b) => b.gain - a.gain);
  return firstValid(k, [...candidates.filter((candidate) => candidate.gain > 0.02).map((candidate) => candidate.action), end]);
}

/**
 * Second Firing's choice (v1.6.2 L646, R7): both revealed cards are known, so each card with
 * and without Jun's ±1 is evaluated exactly (Jun's Wood at `woodValue`).
 */
function decideSecondFiringChoice(k: Know): GameAction | null {
  const options = secondFiringChoiceOptions(k.view);
  const firing = k.game.firing;
  if (options === null || firing === null) return null;
  const c = k.game.ceramics[options.ceramicId];
  const record = firing.ceramics[options.ceramicId];
  const fallback: GameAction = { type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: null };
  if (c === undefined || c.stage !== "loaded" || record === undefined || record.first === null) return firstValid(k, [fallback]);
  const utility = loadedUtility(k, c);
  const source = record.first.heatSource - record.first.fireModifier;
  const fixed = record.first.positionModifier + record.first.kilnMasterMarker;
  const candidates: Array<{ action: GameAction; value: number }> = [];
  for (const cardIndex of [0, 1] as const) {
    const heat = source + options.modifiers[cardIndex] + fixed;
    candidates.push({ action: { type: "SECOND_FIRING_CHOOSE", cardIndex, jun: null }, value: utility(qualityAt(heat, record.preferredHeat)) });
    if (options.jun.ready) {
      for (const delta of [1, -1] as const) {
        const value = utility(qualityAt(heat + delta, record.preferredHeat)) - options.jun.woodCost * woodValue(k) - 0.05;
        candidates.push({ action: { type: "SECOND_FIRING_CHOOSE", cardIndex, jun: { delta } }, value });
      }
    }
  }
  candidates.sort((a, b) => b.value - a.value);
  return firstValid(k, [...candidates.map((candidate) => candidate.action), fallback]);
}

/**
 * Sells the seat's Finished Flawed ceramics (a free action, rev. 5 L172), one command each,
 * before any other choice of a free-action window: before or after the worker action, or the
 * Order Phase turn. A Finished Flawed ceramic can complete no Order and enter no Exhibition
 * (rev. 5 L300), so its 2 Coins are pure gain. There is no sale during the firing or at Cleanup
 * (R26); the after-action window and the Order Phase turn always open for a sale. Null when there
 * is nothing to sell.
 */
function decideSellFlawed(k: Know): GameAction | null {
  const options = sellFlawedOptions(k.view);
  if (options === null) return null;
  const finished = options.ceramicIds.filter((ceramicId) => k.game.ceramics[ceramicId]?.stage === "finished");
  return firstValid(
    k,
    finished.map((ceramicId): GameAction => ({ type: "SELL_FLAWED", ceramicId })),
  );
}

// ── Orders (Order Phase) ──────────────────────────────────────────────────────────────

/**
 * The reward side of completing `options` one after another: printed VP and Coins, each Crown
 * from the Recognition it reaches, each once-per-round trigger (Ru, Guan, Tribute Ware, Canal
 * Barge's 2 Coins; L472, L478, v1.6.2 L637, L648) at most once, and the Crackle VP of every
 * delivered Crackle ceramic (L484). After the last Work
 * Phase every term is exact end-game VP: Coins through the capped 1-per-3 rule (L508), and a
 * Crown only for its Grant Coin, the Audience or overflow VP.
 */
function completionReward(k: Know, options: readonly OrderMatchOption[]): number {
  const exact = afterFinalWork(k);
  let recognition: number = k.me.imperial.recognition;
  let value = 0;
  let coins = 0;
  let ru = false;
  let guan = false;
  let tribute = false;
  let barge = false;
  for (const option of options) {
    if (option.triggers.canalBarge && !barge) {
      barge = true;
      coins += TECHS.T23.params.coins;
    }
    value += option.vp + option.triggers.crackleVp;
    coins += option.coins;
    let crowns = option.printedCrowns;
    if (option.triggers.ru && !ru) {
      ru = true;
      value += KILNS.RU.params.vp;
    }
    if (option.triggers.guan && !guan) {
      guan = true;
      value += KILNS.GU.params.vp;
      coins += KILNS.GU.params.coins;
    }
    if (option.triggers.tributeWare && !tribute) {
      tribute = true;
      crowns += 1;
    }
    for (let crown = 0; crown < crowns; crown += 1) {
      if (!exact) {
        value += crownStepValue(k, recognition);
      } else if (recognition === 0) {
        coins += grantCoins();
        value += RECOGNITION_TIE_BREAK;
      } else if (recognition < 3) {
        value += RECOGNITION_TIE_BREAK;
      } else {
        value += recognition === 3 ? audienceVp() + RECOGNITION_TIE_BREAK : IMPERIAL_TRACK.overflowVpPerCrown;
      }
      recognition = Math.min(4, recognition + 1);
    }
  }
  if (exact) {
    const held = k.me.resources.coins;
    // Exact VP, plus a sliver per Coin so equal-VP sets still prefer more Coins (no rule uses it).
    return value + endCoinVp(held + coins) - endCoinVp(held) + coins * 0.01;
  }
  return value + coins * coinValue(k);
}

/**
 * Net value of completing every Order in `options` (disjoint ceramics) now: their reward,
 * minus what the ceramics would otherwise earn — the Exhibition, and other held Orders the
 * hand plan has them earmarked for. After the last Work Phase no other Order can still be
 * completed later, so only the Exhibition counts.
 */
function completionSetGain(k: Know, options: readonly OrderMatchOption[]): number {
  if (options.length === 0) return 0;
  const finished = ceramicsOf(k.game, k.pid, "finished");
  const used = new Set(options.flatMap((option) => option.ceramicIds));
  const keepCost = exhibitionScore(k, finished) - exhibitionScore(k, finished.filter((c) => !used.has(c.id)));
  let altCost = 0;
  if (!afterFinalWork(k)) {
    const plan = handPlan(k);
    const completing = new Set(options.map((option) => option.orderId));
    for (const ceramicId of used) {
      const other = plan.planOf.get(ceramicId);
      if (other !== undefined && !completing.has(other.orderId)) {
        altCost += Math.max(0, (other.gross * other.p) / other.model.n - 2.5) * 0.6;
      }
    }
  }
  const keepWeight = k.lastRound ? 1 : 0.85;
  return completionReward(k, options) - keepCost * keepWeight - altCost;
}

/** Net value of completing one held Order with this group now. */
function completionGain(k: Know, option: OrderMatchOption): number {
  return completionSetGain(k, [option]);
}

/** Options kept per held Order, and leaves visited, by the completion-set search. */
const COMPLETION_OPTIONS_PER_ORDER = 8;
const COMPLETION_SET_LEAVES = 3_000;

/**
 * The best set of completions now — at most one option per held Order, no ceramic used
 * twice — by total `completionSetGain`. Choosing Orders one at a time can spend the only
 * ceramic that fits a second Order on one that had an equally good alternative; searching the
 * whole set (a hand holds a few Orders, each with a few options) cannot. Returns the member
 * to complete first (the best on its own) with the set's total gain, or null when no set
 * gains.
 */
function bestCompletion(k: Know): { action: GameAction; gain: number; single: number } | null {
  const perOrder: Array<Array<{ option: OrderMatchOption; gain: number }>> = [];
  for (const orderId of k.hand) {
    const ranked = orderMatchOptions(k.view, orderId, 24).map((option) => {
      k.deadline.check();
      return { option, gain: completionGain(k, option) };
    });
    ranked.sort((a, b) => b.gain - a.gain);
    if (ranked.length > 0) perOrder.push(ranked.slice(0, COMPLETION_OPTIONS_PER_ORDER));
  }
  perOrder.sort((a, b) => (b[0]?.gain ?? 0) - (a[0]?.gain ?? 0) || (a[0]?.option.orderId ?? "").localeCompare(b[0]?.option.orderId ?? ""));
  let best: { members: Array<{ option: OrderMatchOption; gain: number }>; gain: number } = { members: [], gain: 0 };
  const chosen: Array<{ option: OrderMatchOption; gain: number }> = [];
  const usedIds = new Set<CeramicId>();
  let leaves = 0;
  const walk = (index: number): void => {
    if (leaves >= COMPLETION_SET_LEAVES) return;
    if (index === perOrder.length) {
      leaves += 1;
      k.deadline.check();
      const gain = completionSetGain(
        k,
        chosen.map((entry) => entry.option),
      );
      if (gain > best.gain + 1e-9) best = { members: [...chosen], gain };
      return;
    }
    for (const entry of perOrder[index] ?? []) {
      if (entry.option.ceramicIds.some((id) => usedIds.has(id))) continue;
      chosen.push(entry);
      for (const id of entry.option.ceramicIds) usedIds.add(id);
      walk(index + 1);
      for (const id of entry.option.ceramicIds) usedIds.delete(id);
      chosen.pop();
    }
    walk(index + 1);
  };
  walk(0);
  let first: { option: OrderMatchOption; gain: number } | null = null;
  for (const member of best.members) {
    if (first === null || member.gain > first.gain) first = member;
  }
  if (first === null) return null;
  return { action: { type: "COMPLETE_ORDER", orderId: first.option.orderId, ceramicIds: [...first.option.ceramicIds] }, gain: best.gain, single: first.gain };
}

/**
 * The Order Phase turn (rev. 5 L143, L318): the free actions after the firing. The sale comes
 * first (`decideSellFlawed`); then the best completion while it gains, then Imperial Priority
 * when it is worth spending here (`orderPhaseImperialPriority`), then the end of the turn.
 */
function decideOrders(k: Know): GameAction | null {
  const best = bestCompletion(k);
  const end: GameAction = { type: "END_ORDER_TURN" };
  if (best !== null && best.gain > 0) return firstValid(k, [best.action, end]);
  return orderPhaseImperialPriority(k) ?? firstValid(k, [end]);
}

/**
 * Completing a held Order in a Work turn (a free action before or after the worker action,
 * rev. 5 L170, L173): the completion the Order Phase would make (`bestCompletion`, gain > 0),
 * taken now so its Coins, Crowns and milestones count for the placements that follow (L176),
 * unless one of its ceramics is earmarked by the hand plan for a different held Order (that
 * Order may still be completed later; the Order Phase decides with the round's new ceramics).
 * Before the worker action it also waits while a face-up Main Order this turn's placement could
 * reserve would complete at once with one of those ceramics, for more (reserve and deliver in
 * one turn); after the action that choice is made. Null when nothing is worth
 * completing now.
 */
function decideFreeCompletion(k: Know, beforeAction: boolean): GameAction | null {
  if (k.hand.length === 0) return null;
  const best = bestCompletion(k);
  if (best === null || best.gain <= 0 || best.action.type !== "COMPLETE_ORDER") return null;
  const orderId = best.action.orderId;
  const planOf = handPlan(k).planOf;
  if (best.action.ceramicIds.some((ceramicId) => (planOf.get(ceramicId)?.orderId ?? orderId) !== orderId)) return null;
  if (beforeAction && displayWantsCeramics(k, orderId, best.action.ceramicIds)) return null;
  return firstValid(k, [best.action]);
}

/**
 * Whether a face-up Main Order would complete at once from Finished ceramics, one of them in
 * `ceramicIds`, and is worth more than `orderId` (its expected gross value against the held
 * Order's).
 */
function displayWantsCeramics(k: Know, orderId: OrderId, ceramicIds: readonly CeramicId[]): boolean {
  const ids = new Set(ceramicIds);
  const held = orderGross(k, ORDERS[orderId]);
  const items = poolItems(k);
  for (const displayed of k.game.market.display) {
    if (displayed === null) continue;
    const plan = planOrder(k, displayed, items);
    if (plan === null || plan.newCount > 0 || plan.chosen.some((item) => item.stage !== "finished")) continue;
    if (plan.chosen.some((item) => ids.has(item.id)) && plan.gross * plan.p > held) return true;
  }
  return false;
}

function decideHandLimit(k: Know): GameAction | null {
  const status = handLimitStatus(k.view, k.pid);
  if (status.mustDiscard <= 0) return null;
  const items = poolItems(k);
  const plan = handPlan(k);
  const ranked = k.hand
    .map((orderId) => {
      const planned = plan.plans.find((p) => p.orderId === orderId) ?? planOrder(k, orderId, items);
      return { orderId, value: planned === null ? 0 : planned.p * planned.gross };
    })
    .sort((a, b) => a.value - b.value || tieHash(k.seed, a.orderId) - tieHash(k.seed, b.orderId));
  const orderIds = ranked.slice(0, status.mustDiscard).map((entry) => entry.orderId);
  return firstValid(k, [{ type: "DISCARD_TO_HAND_LIMIT", orderIds }]);
}

// ── Commission Market and Guild Hall sub-steps ────────────────────────────────────────

/** The second Commission reservation is kept only above this value (overflow-dependent). */
function secondReservationThreshold(k: Know): number {
  return reservationOverflows(k, 1) ? 2.2 : 1.2;
}

/** A reservable Order valued as a first (`p0`) and as a second (`p1`) reservation. */
interface ReservationCandidate {
  readonly p0: number;
  readonly p1: number;
}

/**
 * Expected value of a Commission Market visit for a worker effect, from public information
 * only (v1.6.2 L225–228): the look shows `commissionOptions(…).lookCount` unknown Main
 * Orders (B1); the seat then reserves the best Order among the display and the look and, for
 * the Shifu effect, a second one when it clears `secondReservationThreshold`. Exact over the
 * order statistics of the look, drawn without replacement from the Main Orders the seat
 * cannot see. `pending` counts reservations made earlier this round in the plan, before
 * this visit (a repeated visit).
 */
function commissionVisitValue(k: Know, effect: WorkerEffect, pending = 0): number {
  return memo(k, `cmVisit:${effect}:${pending}`, () => {
    const options = commissionOptions(k.view, effect);
    if (!options.reservable) return 0;
    const shifu = options.maxReservations >= 2;
    const value = (orderId: OrderId): ReservationCandidate => ({
      p0: reservationValue(k, orderId, pending),
      p1: shifu ? reservationValue(k, orderId, pending + 1) : 0,
    });
    const display = options.faceUpSlots
      .map((slotIndex) => k.game.market.display[slotIndex])
      .filter((orderId): orderId is OrderId => orderId !== null && orderId !== undefined)
      .map(value)
      .sort((a, b) => b.p0 - a.p0);
    // Overflow only subtracts a constant from every value, so p0 and p1 rank Orders alike.
    const unknown = unknownMainOrders(k).map(value).sort((a, b) => a.p0 - b.p0);
    const total = unknown.length;
    const draws = Math.min(options.lookCount, total);
    const threshold = secondReservationThreshold(k);
    const outcome = (drawn: readonly ReservationCandidate[]): number => {
      const ranked = [...drawn, ...display.slice(0, 2)].sort((a, b) => b.p0 - a.p0);
      const first = ranked[0]?.p0 ?? 0;
      const second = shifu ? (ranked[1]?.p1 ?? 0) : 0;
      return first + (second > threshold ? second : 0);
    };
    if (draws === 0) return outcome([]);
    const choose = (n: number, r: number): number => {
      if (r < 0 || r > n) return 0;
      let result = 1;
      for (let index = 1; index <= r; index += 1) result = (result * (n - r + index)) / index;
      return result;
    };
    const all = choose(total, draws);
    let expected = 0;
    for (let top = 0; top < total; top += 1) {
      const best = unknown[top] as ReservationCandidate;
      if (draws === 1 || !shifu) {
        // Only the look's best card can matter.
        expected += outcome([best]) * (choose(top, draws - 1) / all);
        continue;
      }
      for (let next = 0; next < top; next += 1) {
        k.deadline.check();
        expected += outcome([best, unknown[next] as ReservationCandidate]) * (choose(next, draws - 2) / all);
      }
    }
    return expected;
  });
}

/**
 * `SELECT_CHOOSE` for every Select (v1.6.2 L80, change 25): the Commission Market's (L225–228)
 * and Colour Samples' when acquired and in its swap (L632). The best Order among the display and
 * the seat's own look; for the Commission Market Shifu effect also the next best, valued as a
 * second reservation, when it clears `secondReservationThreshold`. Single picks follow as
 * fallbacks. The swap keeps the hand size, so its pick is valued without an overflow cost.
 */
function decideSelect(k: Know): GameAction | null {
  const phase = k.game.phase;
  if (phase.type !== "work_turn") return null;
  const options = lookedOrderOptions(k.view);
  if (options === null || options.kind !== phase.step.kind) return null;
  const pending = options.kind === "colour_samples_swap" ? -1 : 0;
  const picks: Array<{ pick: SelectPick; orderId: OrderId; value: number }> = [];
  for (const slotIndex of options.faceUpSlots) {
    const orderId = k.game.market.display[slotIndex];
    if (orderId === null || orderId === undefined) continue;
    picks.push({ pick: { kind: "face_up", slotIndex, orderId }, orderId, value: reservationValue(k, orderId, pending) });
  }
  for (const orderId of options.orderIds) picks.push({ pick: { kind: "looked", orderId }, orderId, value: reservationValue(k, orderId, pending) });
  picks.sort((a, b) => b.value - a.value || tieHash(k.seed, a.orderId) - tieHash(k.seed, b.orderId));
  const [best, ...rest] = picks;
  if (best === undefined) return null;
  const candidates: GameAction[] = [];
  if (options.maxReservations >= 2) {
    const second = rest
      .map((entry) => ({ ...entry, value: reservationValue(k, entry.orderId, 1) }))
      .sort((a, b) => b.value - a.value || tieHash(k.seed, a.orderId) - tieHash(k.seed, b.orderId))[0];
    if (second !== undefined && second.value > secondReservationThreshold(k)) {
      candidates.push({ type: "SELECT_CHOOSE", reservations: [best.pick, second.pick] });
    }
  }
  candidates.push(...picks.map((entry): GameAction => ({ type: "SELECT_CHOOSE", reservations: [entry.pick] })));
  return firstValid(k, candidates);
}

/**
 * The Guild Hall Shifu after its inspection (v1.6.2 L237): the first take is mandatory and
 * is ranked with the best second take the Coins left would still cover (another discipline);
 * a second take is made only when it clears `SECOND_TECH_THRESHOLD`; then `GUILD_FINISH`
 * returns the untaken inspected Techs in look order (B2).
 */
function decideGuildTake(k: Know): GameAction | null {
  const options = guildInspectionOptions(k.view);
  if (options === null) return null;
  const net = (option: GuildTechOption): number => techValue(k, option.techId) - option.cost * coinValue(k);
  const legal = [...options.inspected, ...options.faceUp].filter((option) => option.legal);
  const coins = k.me.resources.coins;
  const lookahead = !options.canFinish && options.takesLeft >= 2 && k.me.techs.length + 2 <= GAME_CONFIG.techs.maxOwned;
  const ranked = legal
    .map((option) => {
      let follow = 0;
      if (lookahead) {
        for (const other of legal) {
          if (other.discipline !== option.discipline && option.cost + other.cost <= coins) follow = Math.max(follow, net(other) > SECOND_TECH_THRESHOLD ? net(other) : 0);
        }
      }
      return { option, net: net(option), score: net(option) + follow };
    })
    .sort((a, b) => b.score - a.score);
  const takes = ranked.map(({ option }): GameAction => ({ type: "GUILD_TAKE", take: { kind: option.source, techId: option.techId } }));
  if (!options.canFinish) return firstValid(k, takes);
  const finish: GameAction = { type: "GUILD_FINISH", bottomOrder: options.inspected.map((option) => option.techId) };
  const worth = ranked.filter((entry) => entry.net > SECOND_TECH_THRESHOLD).map(({ option }): GameAction => ({ type: "GUILD_TAKE", take: { kind: option.source, techId: option.techId } }));
  return firstValid(k, [...worth, finish]);
}

// ── Before/after-action window: Colour Samples swap, Imperial Priority ────────────────

/**
 * The Colour Samples swap (v1.6.2 L632, change 25): discard the held Order the plan values least
 * when the best Order its Select 3 could reserve (the looked cards or a face-up Main Order) is
 * expected to be worth clearly more. Held Orders are valued like the Cleanup trim
 * (`decideHandLimit`). The swap leaves the hand size unchanged, so the Select is valued without
 * the overflow cost of an extra Order (`pending` −1).
 */
function colourSamplesSwap(k: Know): GameAction | null {
  if (!techReady(k.me, COLOUR_SAMPLES)) return null;
  const options = colourSamplesSwapOptions(k.view);
  if (!options.usable) return null;
  const items = poolItems(k);
  const plan = handPlan(k);
  let best: { action: GameAction; gain: number } | null = null;
  for (const discard of options.discards) {
    if (!discard.legal) continue;
    const planned = plan.plans.find((p) => p.orderId === discard.orderId) ?? planOrder(k, discard.orderId, items);
    const held = planned === null ? 0 : planned.p * planned.gross;
    const gain = expectedBestWithDisplay(k, discard.lookCount, -1) - held - 0.1;
    if (best === null || gain > best.gain + 1e-9) best = { action: { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: discard.orderId }, gain };
  }
  return best !== null && best.gain > 0.3 ? firstValid(k, [best.action]) : null;
}

/**
 * Imperial Priority (free, no Wood, L309): every vessel × Glaze × Imperial modifier, and,
 * when Kiln Master is ready, its +1 or −1 marker on the load (R22) at a small bias to none.
 */
function imperialPriorityCandidates(k: Know): Array<{ action: GameAction; value: number }> {
  const options = imperialPriorityOptions(k.view);
  if (!options.usable) return [];
  const fire = nextFireDist(k);
  const markers: Array<HeatDelta | null> = [null, ...(options.kilnMaster ? (kilnMasterOption(k.view, k.pid)?.values ?? []) : [])];
  const candidates: Array<{ action: GameAction; value: number }> = [];
  for (const ceramicId of options.ceramicIds) {
    const vessel = k.game.ceramics[ceramicId];
    if (vessel === undefined || vessel.stage !== "shaped") continue;
    for (const glaze of GLAZES) {
      const utility = vesselUtility(k, vessel, glaze);
      for (const modifier of FIRING.imperialModifiers) {
        for (const kilnMaster of markers) {
          const value = expectQuality(k.die + modifier + (kilnMaster ?? 0), preferredHeat(glaze), fire, utility) - (kilnMaster === null ? 0 : KILN_MASTER_BIAS);
          candidates.push({
            action: { type: "USE_IMPERIAL_PRIORITY", ceramicId, glaze, imperialModifier: modifier, ...(kilnMaster === null ? {} : { kilnMaster }) },
            value,
          });
        }
      }
    }
  }
  return candidates.sort((a, b) => b.value - a.value);
}

/** Imperial Priority is spent only for a load worth more than this (Work turn or Order Phase). */
const IMPERIAL_PRIORITY_THRESHOLD = 1.5;

function windowAbility(k: Know): GameAction | null {
  const swap = colourSamplesSwap(k);
  if (swap !== null) return swap;
  const priority = imperialPriorityCandidates(k);
  if (priority.length > 0 && (priority[0]?.value ?? 0) > IMPERIAL_PRIORITY_THRESHOLD) {
    const valid = firstValid(k, priority.slice(0, 6).map((candidate) => candidate.action));
    if (valid !== null) return valid;
  }
  return null;
}

/**
 * Imperial Priority in the Order Phase turn (a free action, rev. 5 L174, L314; R28). Its ceramic
 * waits in the Imperial Kiln for the next round's firing, under a Kiln Die not yet rolled, and
 * in Round 5 it is never fired, so the seat never spends the token there. In Rounds 1–4 it
 * spends it only when waiting for the roll gains nothing: the best load chosen now (Glaze and
 * Imperial modifier, its value averaged over the Kiln Die's faces) is worth as much as the best
 * load chosen after the roll, and clears the Work-turn threshold. It places no Kiln Master
 * marker: the tile's one marker would stay on the ceramic and keep Kiln Master unusable next
 * round until that firing finishes (R32). Null otherwise.
 */
function orderPhaseImperialPriority(k: Know): GameAction | null {
  if (k.lastRound) return null;
  const options = imperialPriorityOptions(k.view);
  if (!options.usable) return null;
  const faces = FIRING.kilnDie.faces;
  const fire = nextFireDist(k);
  const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const candidates: Array<{ action: GameAction; byFace: number[]; value: number }> = [];
  for (const ceramicId of options.ceramicIds) {
    const vessel = k.game.ceramics[ceramicId];
    if (vessel === undefined || vessel.stage !== "shaped") continue;
    for (const glaze of GLAZES) {
      const utility = vesselUtility(k, vessel, glaze);
      for (const modifier of FIRING.imperialModifiers) {
        k.deadline.check();
        const byFace = faces.map((face) => expectQuality(face + modifier, preferredHeat(glaze), fire, utility));
        candidates.push({ action: { type: "USE_IMPERIAL_PRIORITY", ceramicId, glaze, imperialModifier: modifier }, byFace, value: mean(byFace) });
      }
    }
  }
  if (candidates.length === 0) return null;
  const afterRoll = mean(faces.map((_face, index) => Math.max(...candidates.map((candidate) => candidate.byFace[index] ?? 0))));
  const now = candidates
    .filter((candidate) => candidate.value > IMPERIAL_PRIORITY_THRESHOLD && candidate.value >= afterRoll - 1e-9)
    .sort((a, b) => b.value - a.value);
  return now.length === 0 ? null : firstValid(k, now.slice(0, 6).map((candidate) => candidate.action));
}

function decideAfterAction(k: Know): GameAction | null {
  return decideSellFlawed(k) ?? decideFreeCompletion(k, false) ?? windowAbility(k) ?? firstValid(k, [{ type: "END_TURN" }]);
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 8. Work phase: the round planner and the command builders
// ═══════════════════════════════════════════════════════════════════════════════════════

/** Value of a Shaped vessel with `glaze` reaching each Quality, using its planned Order. */
function vesselUtility(k: Know, vessel: ShapedCeramic, glaze: Glaze, shape: Shape = vessel.shape): (q: Quality) => number {
  const plan = handPlan(k).planOf.get(vessel.id);
  let bonus = 0;
  let minRank = 4;
  let mpBonus = 0;
  if (plan !== undefined) {
    const fixed = new Array<number>(GLAZE_COUNT).fill(0);
    for (const item of plan.chosen) if (item.id !== vessel.id && item.glaze >= 0) fixed[item.glaze] = (fixed[item.glaze] ?? 0) + 1;
    const glazeFits = fits(plan.model.glazeSets, withOne(fixed, GLAZES.indexOf(glaze)));
    const shapes = new Array<number>(SHAPE_COUNT).fill(0);
    for (const item of plan.chosen) if (item.id !== vessel.id) shapes[item.shape] = (shapes[item.shape] ?? 0) + 1;
    const shapeFits = fits(plan.model.shapeSets, withOne(shapes, SHAPES.indexOf(shape)));
    if (glazeFits && shapeFits) {
      const need = ceramicNeed(k, vessel.id);
      bonus = need.bonus;
      minRank = need.minRank;
      mpBonus = need.mpBonus;
    }
  } else {
    // An unplanned vessel: does any held Order want this Glaze on this Shape?
    const alt = bestUnplannedUse(k, shape, vessel.decoration, glaze);
    bonus = alt.bonus;
    minRank = alt.minRank;
  }
  const ru = k.me.kilnId === "RU" && glaze === KILNS.RU.params.glaze && vessel.decoration === KILNS.RU.params.decoration;
  const diversity = glazeDiversityBonus(k, glaze);
  return floored(k, (quality: Quality): number => {
    if (quality === "flawed") return QUALITY_VALUE.flawed;
    let value = QUALITY_VALUE[quality] + diversity;
    if (QUALITY_RANK[quality] >= minRank) value += bonus;
    if (quality === "masterpiece") {
      value += mpBonus;
      if (ru) value += 2.5;
    }
    return value;
  });
}

function bestUnplannedUse(k: Know, shape: Shape, decoration: Decoration, glaze: Glaze): { bonus: number; minRank: number } {
  let best = { bonus: 0, minRank: 4 };
  for (const orderId of k.hand) {
    const model = orderModel(orderId);
    if (model.n !== 1) continue;
    const ok =
      fits(model.shapeSets, withOne(new Array(SHAPE_COUNT).fill(0), SHAPES.indexOf(shape))) &&
      fits(model.glazeSets, withOne(new Array(GLAZE_COUNT).fill(0), GLAZES.indexOf(glaze))) &&
      fits(model.decoSets, withOne(new Array(DECORATION_COUNT).fill(0), DECORATIONS.indexOf(decoration)));
    if (!ok) continue;
    const bonus = Math.max(0, orderGross(k, model.def) - 2.4) * 0.5;
    if (bonus > best.bonus) best = { bonus, minRank: model.minRank };
  }
  return best;
}

function glazeDiversityBonus(k: Know, glaze: Glaze): number {
  const held = new Set<Glaze>();
  for (const c of ceramicsOf(k.game, k.pid, "finished")) if (c.quality !== "flawed") held.add(c.glaze);
  for (const c of ceramicsOf(k.game, k.pid, "loaded")) held.add(c.glaze);
  return held.has(glaze) || held.size >= 3 ? 0 : 0.35;
}

/** Base Heat the seat steers toward this round: what suits its own Shared loads, near the die. */
function targetBase(k: Know): number {
  return memo(k, "targetBase", () => {
    const mine = ceramicsOf(k.game, k.pid, "loaded").filter((c) => c.placement.kiln === "shared");
    if (mine.length === 0) return k.die;
    const fire = nextFireDist(k);
    let best = k.die;
    let bestScore = -Infinity;
    for (const base of [k.die - 1, k.die, k.die + 1]) {
      if (base < 0 || base > 5) continue;
      const score = firingValueAtBase(k, base, fire, k.me.resources.wood) - Math.abs(base - k.die) * 0.8;
      if (score > bestScore + 1e-9) {
        bestScore = score;
        best = base;
      }
    }
    return best;
  });
}

/**
 * Expected value of loading `vessel` with `glaze` at a destination of position `modifier`, with
 * Kiln Master's `marker` on it (L647; 0 without one).
 */
function loadValue(k: Know, vessel: ShapedCeramic, glaze: Glaze, destination: LoadSpec["destination"], modifier: number, shape: Shape, marker = 0): number {
  const fire = nextFireDist(k);
  const utility = vesselUtility(k, vessel, glaze, shape);
  const preferred = preferredHeat(glaze);
  const bases: Dist =
    destination.kiln === "imperial"
      ? [[k.die, 1]]
      : (() => {
          const target = targetBase(k);
          const steer = k.me.resources.wood >= 1 ? 0.15 : 0.22;
          return [
            [clampBase(target - 1), steer],
            [target, 1 - 2 * steer],
            [clampBase(target + 1), steer],
          ] as const;
        })();
  let total = 0;
  for (const [base, pb] of bases) {
    total += pb * expectQuality(base + modifier + marker, preferred, fire, utility);
  }
  return total;
}

interface LoadChoice {
  readonly load: LoadSpec;
  readonly value: number;
}

/** Ranked single loads for the vessels not yet in `earlier`, built from `loadDestinationOptions`. */
function rankedLoads(k: Know, earlier: readonly LoadSpec[], limit: number): LoadChoice[] {
  const used = new Set(earlier.map((load) => load.ceramicId));
  const choices: LoadChoice[] = [];
  const vessels = ceramicsOf(k.game, k.pid, "shaped").filter((vessel) => !used.has(vessel.id));
  const seenClass = new Set<string>();
  const rework = techReady(k.me, REWORKING_TABLE) && !earlier.some((load) => load.reworkShape !== undefined);
  for (const vessel of vessels) {
    const planned = handPlan(k).planOf.has(vessel.id);
    const key = `${vessel.shape}|${vessel.decoration}|${planned ? vessel.id : ""}`;
    if (seenClass.has(key)) continue;
    seenClass.add(key);
    const shapes: Array<Shape | undefined> = [undefined];
    if (rework) {
      for (const demand of handPlan(k).demands) {
        if (demand.shape !== vessel.shape && demand.decoration === vessel.decoration && !shapes.includes(demand.shape)) shapes.push(demand.shape);
      }
    }
    for (const reworkShape of shapes) {
      k.deadline.check();
      const destinations = loadDestinationOptions(k.view, k.pid, vessel.id, earlier, reworkShape);
      const shape = reworkShape ?? vessel.shape;
      for (const option of destinations) {
        for (const glaze of GLAZES) {
          const value = loadValue(k, vessel, glaze, option.destination, option.modifier, shape) + (reworkShape === undefined ? 0 : 0.2);
          choices.push({
            load: { ceramicId: vessel.id, glaze, destination: option.destination, ...(reworkShape === undefined ? {} : { reworkShape }) },
            value: value + (option.destination.kiln === "imperial" ? 0.15 : 0) + (option.returnsSettersMark ? 0.05 : 0),
          });
        }
      }
    }
  }
  choices.sort((a, b) => b.value - a.value || tieHash(k.seed, JSON.stringify(a.load)) - tieHash(k.seed, JSON.stringify(b.load)));
  return choices.slice(0, limit);
}

/**
 * The Glaze & Load candidates: the best 1–3 first loads, each with the best second load for the
 * Shifu when it is worth it (the second load into the Shared Kiln costs no more Wood, R24), Kiln
 * Master's marker where it helps most (`withKilnMaster`), and the single load as a fallback.
 * Shared destinations need the action's 1 Wood; `loadDestinationOptions` offers none without it.
 */
function buildGlazeLoad(k: Know, workerId: string, effect: WorkerEffect): GameAction[] {
  const maxLoads = LOCATIONS.glaze_load.effects[effect].maxLoads;
  const firstChoices = rankedLoads(k, [], 6);
  const actions: GameAction[] = [];
  for (const first of firstChoices.slice(0, 3)) {
    const loads: LoadSpec[] = [first.load];
    if (maxLoads >= 2) {
      const second = rankedLoads(k, loads, 3)[0];
      if (second !== undefined && second.value > 1.0) loads.push(second.load);
    }
    const marked = withKilnMaster(k, loads);
    if (marked !== null) actions.push({ type: "PLACE_GLAZE_LOAD", workerId, loads: marked });
    actions.push({ type: "PLACE_GLAZE_LOAD", workerId, loads });
    if (loads.length > 1) {
      const single = withKilnMaster(k, [first.load]);
      if (single !== null) actions.push({ type: "PLACE_GLAZE_LOAD", workerId, loads: single });
      actions.push({ type: "PLACE_GLAZE_LOAD", workerId, loads: [first.load] });
    }
  }
  return actions;
}

/** A small preference for keeping Kiln Master's once-per-round use when its marker barely helps. */
const KILN_MASTER_BIAS = 0.01;

/**
 * Kiln Master (T24, L647, R22): when it is ready, the loads with its +1 or −1 marker on
 * the one load where the expected Quality gains most (the same heat model that chooses the Glaze
 * and the space); null when it is not ready or no marker beats none by `KILN_MASTER_BIAS`.
 */
function withKilnMaster(k: Know, loads: readonly LoadSpec[]): LoadSpec[] | null {
  const option = kilnMasterOption(k.view, k.pid);
  if (option === null || !option.ready) return null;
  let best: { index: number; value: HeatDelta; gain: number } | null = null;
  loads.forEach((load, index) => {
    const vessel = k.game.ceramics[load.ceramicId];
    if (vessel === undefined || vessel.stage !== "shaped") return;
    const shape = load.reworkShape ?? vessel.shape;
    const modifier =
      load.destination.kiln === "imperial"
        ? load.destination.imperialModifier
        : (load.destination.kilnFurniture ?? k.game.sharedKiln.spaces[load.destination.spaceId].kilnFurniture?.modifier ?? zoneModifier(load.destination.spaceId));
    const plain = loadValue(k, vessel, load.glaze, load.destination, modifier, shape);
    for (const value of option.values) {
      const gain = loadValue(k, vessel, load.glaze, load.destination, modifier, shape, value) - plain;
      if (best === null || gain > best.gain) best = { index, value, gain };
    }
  });
  const chosen = best as { index: number; value: HeatDelta; gain: number } | null;
  if (chosen === null || chosen.gain <= KILN_MASTER_BIAS) return null;
  return loads.map((load, index) => (index === chosen.index ? { ...load, kilnMaster: chosen.value } : load));
}

/** Vessels to form: the most valuable planned demands, else cheap Shapes that add variety. */
function formingWishes(k: Know, count: number): FormVesselSpec[] {
  const wishes: FormVesselSpec[] = handPlan(k)
    .demands.slice(0, count)
    .map((demand) => ({ shape: demand.shape, decoration: demand.decoration }));
  const owned = new Set<Shape>();
  for (const c of Object.values(k.game.ceramics)) if (c.ownerId === k.pid && c.stage !== "delivered") owned.add(c.shape);
  const cheap = [...SHAPES].sort(
    (a, b) => shapeClay(a) - shapeClay(b) || Number(owned.has(a)) - Number(owned.has(b)) || tieHash(k.seed, a) - tieHash(k.seed, b),
  );
  let index = 0;
  while (wishes.length < count) {
    const shape = cheap[index % cheap.length] as Shape;
    index += 1;
    if (wishes.some((wish) => wish.shape === shape) && index < cheap.length) continue;
    wishes.push({ shape, decoration: k.me.kilnId === "RU" ? "plain" : GENERIC_DECORATION });
  }
  return wishes;
}

function formVariants(k: Know, workerId: string, vessels: FormVesselSpec[]): GameAction[] {
  const base: ActionOf<"PLACE_FORM_DECORATE"> = { type: "PLACE_FORM_DECORATE", workerId, vessels };
  const wheel = techReady(k.me, LARGE_THROWING_WHEEL) && vessels.some((v) => (TECHS.T01.params.triggerShapes as readonly Shape[]).includes(v.shape));
  // Decorator's Kit on any vessel (rev. 5 L622, change 37): the first one.
  const kitIndex = techReady(k.me, DECORATORS_KIT) && vessels.length > 0 ? 0 : -1;
  const discounted: ActionOf<"PLACE_FORM_DECORATE"> = {
    ...base,
    ...(wheel ? { useLargeThrowingWheel: true } : {}),
    ...(kitIndex >= 0 ? { decoratorsKitVesselIndex: kitIndex } : {}),
  };
  const variants: GameAction[] = [];
  const dingIndex = kilnReady(k.me, "DI") ? vessels.findIndex((v) => (KILNS.DI.params.shapes as readonly Shape[]).includes(v.shape)) : -1;
  if (dingIndex >= 0 && !k.lastRound) {
    const copy = vessels[dingIndex] as FormVesselSpec;
    const demand = handPlan(k).demands.find((d) => d.shape === copy.shape && !vessels.some((v) => v.shape === d.shape && v.decoration === d.decoration));
    variants.push({ ...discounted, dingExtra: { copyOfVesselIndex: dingIndex, decoration: demand?.decoration ?? copy.decoration } });
  }
  variants.push(discounted, base);
  return variants;
}

function buildFormDecorate(k: Know, workerId: string, effect: WorkerEffect): GameAction[] {
  const maxVessels = LOCATIONS.form_decorate.effects[effect].maxVessels;
  const wishes = formingWishes(k, Math.max(2, maxVessels));
  const actions: GameAction[] = [];
  if (maxVessels >= 2) actions.push(...formVariants(k, workerId, wishes.slice(0, 2)));
  actions.push(...formVariants(k, workerId, wishes.slice(0, 1)));
  if (wishes.length > 1) actions.push(...formVariants(k, workerId, wishes.slice(1, 2)));
  // Cheaper fallbacks: a Bowl with the wished Decoration, then a Plain Bowl.
  const firstDecoration = wishes[0]?.decoration ?? GENERIC_DECORATION;
  actions.push(...formVariants(k, workerId, [{ shape: "bowl", decoration: firstDecoration }]));
  actions.push(...formVariants(k, workerId, [{ shape: "bowl", decoration: GENERIC_DECORATION }]));
  return actions;
}

/**
 * The Clay/Wood split of a Materials Yard gain (4 or 8, L194–195): the Clay the next
 * vessels need, then Wood up to the round's fuel and firing needs (1 Wood per Glaze & Load
 * action into the Shared Kiln this round and the next, R24), the rest as Clay once the Wood is
 * covered.
 */
function materialsSplit(k: Know, total: number, clayHave: number, woodHave: number): { clay: number; wood: number } {
  const need = resourceNeed(k);
  const wantClay = clamp(need.clay - clayHave, 0, total);
  const wantWood = clamp((k.lastRound ? 2 : 4) - woodHave, 0, total - wantClay);
  const rest = total - wantClay - wantWood;
  const clay = wantClay + (woodHave + wantWood < 3 ? 0 : rest);
  return { clay, wood: total - clay };
}

function buildMaterialsYard(k: Know, workerId: string, effect: WorkerEffect, senior: boolean): GameAction[] {
  // 4 resources, or 8 for the Shifu effect (Senior Apprentice included), with no Coin option (L194–195).
  const total = LOCATIONS.materials_yard.effects[effect].resources;
  const r = k.me.resources;
  const split = materialsSplit(k, total, r.clay, r.wood);
  const base: ActionOf<"PLACE_MATERIALS_YARD"> = { type: "PLACE_MATERIALS_YARD", workerId, clay: split.clay, wood: split.wood, ...(senior ? { seniorApprentice: true } : {}) };
  const actions: GameAction[] = [];
  if (!senior && techReady(k.me, PREPARED_CLAY) && (k.roundsAfter >= 1 || freePersonalSpaces(k.me, "glaze_load") > 0)) {
    const wish = formingWishes(k, 1)[0];
    if (wish !== undefined) {
      // Shift the split toward Clay so Prepared Clay can pay its Shape + 1.
      const needClay = shapeClay(wish.shape) + TECHS.T17.params.claySurcharge;
      const clay = clamp(Math.max(split.clay, needClay - r.clay), 0, total);
      actions.push({ ...base, clay, wood: total - clay, preparedClay: { shape: wish.shape, decoration: wish.decoration } });
    }
  }
  actions.push(base);
  return actions;
}

/** The placement only opens the Select (v1.6.2 L225–226); the reservations follow in SELECT_CHOOSE. */
function buildCommission(workerId: string, senior: boolean): GameAction[] {
  return [{ type: "PLACE_COMMISSION_MARKET", workerId, ...(senior ? { seniorApprentice: true } : {}) }];
}

function buildGuildHall(k: Know, workerId: string, effect: WorkerEffect): GameAction[] {
  if (effect === "apprentice") {
    return guildOptions(k.view, "apprentice")
      .faceUp.filter((option) => option.legal)
      .map((option) => ({ option, net: techValue(k, option.techId) - option.cost * coinValue(k) }))
      .sort((a, b) => b.net - a.net)
      .map(({ option }): GameAction => ({ type: "PLACE_GUILD_HALL", workerId, choice: { kind: "buy_face_up", techId: option.techId } }));
  }
  const shifu = guildShifuValue(k);
  const disciplines = [shifu.discipline, ...DISCIPLINES].filter((d): d is TechDiscipline => d !== null);
  return [...new Set(disciplines)].map((discipline): GameAction => ({ type: "PLACE_GUILD_HALL", workerId, choice: { kind: "inspect", discipline } }));
}

// ── The round planner ─────────────────────────────────────────────────────────────────

type PlanAction = "MY" | "CW" | "FD" | "GL" | "CM" | "GH" | "MH";
const PLAN_ACTIONS: readonly PlanAction[] = ["GL", "FD", "MY", "CW", "CM", "GH", "MH"];

interface PlanWorker {
  readonly kind: "shifu" | "apprentice";
  readonly effect: WorkerEffect;
  readonly senior: boolean;
}

interface AbsState {
  clay: number;
  wood: number;
  coins: number;
  shifu: boolean;
  appr: number;
  senior: boolean;
  fd: number;
  gl: number;
  shaped: number;
  loads: number;
  imperialLoads: number;
  sharedLoads: number;
  step: number;
  my: number;
  cm: number;
  gh: number;
  mh: number;
  techBought: boolean;
  cmUsed: number;
  recognition: number;
  prepared: boolean;
  ding: boolean;
  kit: boolean;
  wheel: boolean;
  tending: boolean;
}

interface PlanParams {
  readonly vLoad: number;
  readonly vShaped: number;
  readonly backlogCap: number;
  readonly sharedOpen: number;
  readonly imperialOpen: boolean;
  readonly oppRate: number;
  readonly demandClay: readonly number[];
  /** A first Commission Market visit this round, per worker effect (v1.6.2 L225–228). */
  readonly cmValue: Readonly<Record<WorkerEffect, number>>;
  /** A later visit in the same round: its reservations come after the first visit's. */
  readonly cmRepeat: Readonly<Record<WorkerEffect, number>>;
  /** The Canal Wharf Shifu's unseen top Main Order (v1.6.2 L250); 0 with no supply (B1). */
  readonly cwDraw: number;
  readonly gh: Readonly<Record<WorkerEffect, { value: number; price: number; unlocks: "form_decorate" | "glaze_load" | null } | null>>;
  readonly mhStep: (recognition: number) => number;
  /** The Magistrate's Hall Shifu's best face-up Crown Order (L259, R21), 0 when none is
   * worth taking. */
  readonly mhCrown: number;
}

function planParams(k: Know): PlanParams {
  const plan = handPlan(k);
  const demandBonus = plan.demands.length > 0 ? Math.min(2, plan.demands.slice(0, 2).reduce((sum, d) => sum + d.value, 0) / 2) : 0;
  const vLoad = 4.3 + demandBonus;
  const vShaped = k.roundsAfter >= 1 ? 0.7 * vLoad : 0;
  const backlogCap = k.roundsAfter * (1.5 + (freePersonalSpacesTotal(k.me, "glaze_load") > 1 ? 1 : 0));
  let oppRate = 0;
  for (const pid of k.game.playerOrder) {
    if (pid === k.pid) continue;
    const rival = k.game.players[pid];
    if (rival === undefined || availableWorkerCount(rival) === 0 || freePersonalSpaces(rival, "glaze_load") === 0) continue;
    oppRate += ceramicsOf(k.game, pid, "shaped").length > 0 ? 0.45 : 0.2;
  }
  const demandClay = plan.demands.map((d) => shapeClay(d.shape));
  const ghFor = (effect: WorkerEffect): PlanParams["gh"][WorkerEffect] => {
    if (effect === "shifu") {
      const shifu = guildShifuValue(k);
      if (!Number.isFinite(shifu.value)) return null;
      const offer = bestTechOffer(k, "shifu");
      return { value: shifu.value + shifu.price * coinValue(k), price: shifu.price, unlocks: offer === null ? null : TECHS[offer.techId].unlocks };
    }
    const offer = bestTechOffer(k, "apprentice");
    return offer === null ? null : { value: offer.net + offer.price * coinValue(k), price: offer.price, unlocks: TECHS[offer.techId].unlocks };
  };
  return {
    vLoad,
    vShaped,
    backlogCap,
    sharedOpen: openSharedSpaces(k.game, k.pid),
    imperialOpen: imperialOpen(k.game, k.pid),
    oppRate,
    demandClay,
    cmValue: { apprentice: commissionVisitValue(k, "apprentice"), shifu: commissionVisitValue(k, "shifu") },
    cmRepeat: { apprentice: 0.8 * commissionVisitValue(k, "apprentice", 1), shifu: 0.8 * commissionVisitValue(k, "shifu", 1) },
    cwDraw: k.game.counts.mainDeck + k.game.counts.mainDiscard > 0 ? Math.max(0, expectedBestOf(k, 1)) : 0,
    gh: { apprentice: ghFor("apprentice"), shifu: ghFor("shifu") },
    mhStep: (recognition: number) => (recognition <= 2 ? crownStepValue(k, recognition) : 0),
    mhCrown: bestMagistratesCrownOrder(k)?.value ?? 0,
  };
}

/** A face-up Crown Order is taken at the Magistrate's Hall only when it is worth this much. */
const MH_CROWN_ORDER_THRESHOLD = 0.3;

/**
 * The Magistrate's Hall Shifu's optional Crown Order (L259, R21): the face-up Order
 * showing a Crown with the highest `reservationValue` (which already counts the Cleanup hand
 * limit, `reservationOverflows`), when it clears `MH_CROWN_ORDER_THRESHOLD`; ties to the lowest
 * position. Null when none is worth taking or none shows.
 */
function bestMagistratesCrownOrder(k: Know): { slotIndex: number; orderId: OrderId; value: number } | null {
  return memo(k, "mhCrown", () => {
    let best: { slotIndex: number; orderId: OrderId; value: number } | null = null;
    for (const slotIndex of magistratesHallQuote(k.view, "shifu").crownOrderSlots) {
      const orderId = k.game.market.display[slotIndex];
      if (orderId === null || orderId === undefined) continue;
      const value = reservationValue(k, orderId);
      if (best === null || value > best.value + 1e-9) best = { slotIndex, orderId, value };
    }
    return best !== null && best.value > MH_CROWN_ORDER_THRESHOLD ? best : null;
  });
}

function initialAbs(k: Know): AbsState {
  const me = k.me;
  const workers = Object.values(me.workers).filter((w) => w.placement === null);
  const capOf = (locationId: "materials_yard" | "commission_market" | "guild_hall" | "magistrates_hall"): number => {
    const capacity = LOCATIONS[locationId].capacity?.[String(k.game.playerCount) as "2" | "3" | "4"] ?? 0;
    let used = 0;
    for (const pid of k.game.playerOrder) for (const w of Object.values(k.game.players[pid]?.workers ?? {})) if (w.placement?.locationId === locationId) used += 1;
    return Math.max(0, (capacity ?? 0) - used);
  };
  return {
    clay: me.resources.clay,
    wood: me.resources.wood,
    coins: me.resources.coins,
    shifu: workers.some((w) => w.kind === "shifu"),
    appr: workers.filter((w) => w.kind === "apprentice").length,
    senior: techReady(me, SENIOR_APPRENTICE),
    fd: freePersonalSpaces(me, "form_decorate"),
    gl: freePersonalSpaces(me, "glaze_load"),
    shaped: ceramicsOf(k.game, k.pid, "shaped").length,
    loads: 0,
    imperialLoads: 0,
    sharedLoads: 0,
    step: 0,
    my: capOf("materials_yard"),
    cm: capOf("commission_market"),
    gh: capOf("guild_hall"),
    mh: me.imperial.recognition <= 2 ? capOf("magistrates_hall") : 0,
    techBought: false,
    cmUsed: 0,
    recognition: me.imperial.recognition,
    prepared: techReady(me, PREPARED_CLAY),
    ding: kilnReady(me, "DI"),
    kit: techReady(me, DECORATORS_KIT),
    wheel: techReady(me, LARGE_THROWING_WHEEL),
    tending: techReady(me, KILN_TENDING),
  };
}

function absKey(s: AbsState): string {
  return [
    s.clay, s.wood, s.coins, s.shifu ? 1 : 0, s.appr, s.senior ? 1 : 0, s.fd, s.gl, s.shaped, s.loads, s.imperialLoads, s.sharedLoads,
    s.step, s.my, s.cm, s.gh, s.mh, s.techBought ? 1 : 0, s.cmUsed, s.recognition, s.prepared ? 1 : 0, s.ding ? 1 : 0, s.kit ? 1 : 0, s.wheel ? 1 : 0, s.tending ? 1 : 0,
  ].join(",");
}

/** Applies one abstract action; returns the next state and the immediate value, or null. */
function absApply(k: Know, params: PlanParams, s: AbsState, worker: PlanWorker, action: PlanAction): { next: AbsState; gain: number } | null {
  if (worker.kind === "shifu" ? !s.shifu : s.appr <= 0) return null;
  if (worker.senior && (!s.senior || (action !== "MY" && action !== "CM"))) return null;
  const next: AbsState = { ...s, step: s.step + 1 };
  if (worker.kind === "shifu") next.shifu = false;
  else next.appr -= 1;
  if (worker.senior) next.senior = false;
  const effect = worker.effect;
  let gain = 0;
  switch (action) {
    case "MY": {
      if (s.my <= 0) return null;
      next.my -= 1;
      const total = LOCATIONS.materials_yard.effects[effect].resources;
      const split = materialsSplit(k, total, s.clay, s.wood);
      next.clay += split.clay;
      next.wood += split.wood;
      if (next.prepared && !worker.senior && (k.roundsAfter >= 1 || next.gl > 0)) {
        const clay = (params.demandClay[0] ?? 1) + TECHS.T17.params.claySurcharge;
        if (next.clay >= clay && next.coins >= vesselCoins()) {
          next.clay -= clay;
          next.coins -= vesselCoins();
          next.shaped += 1;
          next.prepared = false;
        }
      }
      break;
    }
    case "CW":
      next.coins += LOCATIONS.canal_wharf.effects[effect].coins;
      // The Shifu also takes the top Main Order unseen into the hand (v1.6.2 L250).
      if (effect === "shifu") gain += params.cwDraw;
      break;
    case "FD": {
      if (s.fd <= 0) return null;
      next.fd -= 1;
      const maxVessels = LOCATIONS.form_decorate.effects[effect].maxVessels;
      let formed = 0;
      for (let index = 0; index < maxVessels; index += 1) {
        const clay = params.demandClay[index] ?? 1;
        let coins = vesselCoins();
        if (index === 1) coins -= LOCATIONS.form_decorate.effects.shifu.twoVesselDiscount;
        if (next.kit && index === 0) coins -= 1;
        const clayCost = next.wheel && clay >= 2 ? Math.max(0, clay - TECHS.T01.params.clayReduction) : clay;
        if (next.clay < clayCost || next.coins < coins) break;
        next.clay -= clayCost;
        next.coins -= coins;
        formed += 1;
      }
      if (formed === 0) return null;
      if (next.kit) next.kit = false;
      if (next.wheel && params.demandClay.slice(0, formed).some((clay) => clay >= 2)) next.wheel = false;
      if (next.ding && (params.demandClay[0] ?? 1) === 1 && next.clay >= KILNS.DI.params.clay && next.coins >= KILNS.DI.params.coins && !k.lastRound) {
        next.clay -= KILNS.DI.params.clay;
        next.coins -= KILNS.DI.params.coins;
        next.ding = false;
        formed += 1;
      }
      next.shaped += formed;
      break;
    }
    case "GL": {
      if (s.gl <= 0 || s.shaped <= 0) return null;
      const maxLoads = LOCATIONS.glaze_load.effects[effect].maxLoads;
      // Kiln fuel (L215, R24): 1 Wood for the action when any load goes into the Shared
      // Kiln; without it, only the Imperial Kiln (free) can take a load.
      const fuel = LOCATIONS.glaze_load.effects[effect].sharedKilnWood;
      const sharedFree = s.wood >= fuel ? Math.floor(Math.max(0, params.sharedOpen - params.oppRate * s.step - s.sharedLoads)) : 0;
      const imperialFree = params.imperialOpen && s.imperialLoads === 0 ? 1 : 0;
      const loads = Math.min(maxLoads, s.shaped, sharedFree + imperialFree);
      if (loads <= 0) return null;
      next.gl -= 1;
      next.shaped -= loads;
      next.loads += loads;
      const imperial = Math.min(imperialFree, loads);
      next.imperialLoads += imperial;
      next.sharedLoads += loads - imperial;
      if (loads - imperial > 0) next.wood -= fuel;
      gain += imperial * 0.5 + (effect === "shifu" ? 0.35 : 0);
      if (next.tending) {
        next.tending = false;
        next.clay += TECHS.T20.params.clay;
        next.wood += TECHS.T20.params.wood;
      }
      break;
    }
    case "CM": {
      if (s.cm <= 0) return null;
      next.cm -= 1;
      next.cmUsed += 1;
      // No resource at the Commission Market (v1.6.2 L31).
      gain += s.cmUsed === 0 ? params.cmValue[effect] : params.cmRepeat[effect];
      break;
    }
    case "GH": {
      const offer = params.gh[effect];
      if (s.gh <= 0 || s.techBought || offer === null || next.coins < offer.price || offer.value <= 0) return null;
      next.gh -= 1;
      next.coins -= offer.price;
      next.techBought = true;
      gain += offer.value;
      if (offer.unlocks === "form_decorate") next.fd += 1;
      if (offer.unlocks === "glaze_load") next.gl += 1;
      break;
    }
    case "MH": {
      const cost = LOCATIONS.magistrates_hall.effects[effect].coins;
      if (s.mh <= 0 || s.recognition > 2 || next.coins < cost) return null;
      next.mh -= 1;
      next.coins -= cost;
      gain += params.mhStep(s.recognition);
      // The Shifu then may reserve a face-up Crown Order (R21): counted for the plan's first
      // Magistrate's Hall visit only (each visit advances Recognition).
      if (effect === "shifu" && s.recognition === k.me.imperial.recognition) gain += params.mhCrown;
      next.recognition += 1;
      break;
    }
  }
  return { next, gain };
}

function absTerminal(k: Know, params: PlanParams, s: AbsState): number {
  const shapedValue = Math.min(s.shaped, Math.max(0, params.backlogCap)) * params.vShaped + Math.max(0, s.shaped - params.backlogCap) * 0.2 * params.vShaped;
  return s.loads * params.vLoad + shapedValue + resourceValue(k, s.clay, s.wood, s.coins);
}

const WORKER_KINDS: readonly PlanWorker[] = [
  { kind: "shifu", effect: "shifu", senior: false },
  { kind: "apprentice", effect: "apprentice", senior: false },
  { kind: "apprentice", effect: "shifu", senior: true },
];

function absBest(k: Know, params: PlanParams, s: AbsState, table: Map<string, number>): number {
  if (!s.shifu && s.appr <= 0) return absTerminal(k, params, s);
  const key = absKey(s);
  const cached = table.get(key);
  if (cached !== undefined) return cached;
  k.deadline.check();
  let best = -Infinity;
  for (const worker of WORKER_KINDS) {
    for (const action of PLAN_ACTIONS) {
      const applied = absApply(k, params, s, worker, action);
      if (applied === null) continue;
      const value = applied.gain + absBest(k, params, applied.next, table);
      if (value > best) best = value;
    }
  }
  if (best === -Infinity) best = absTerminal(k, params, s);
  table.set(key, best);
  return best;
}

const LOCATION_OF: Readonly<Record<PlanAction, "materials_yard" | "canal_wharf" | "form_decorate" | "glaze_load" | "commission_market" | "guild_hall" | "magistrates_hall">> = {
  MY: "materials_yard",
  CW: "canal_wharf",
  FD: "form_decorate",
  GL: "glaze_load",
  CM: "commission_market",
  GH: "guild_hall",
  MH: "magistrates_hall",
};

function buildPlacement(k: Know, action: PlanAction, workerId: string, effect: WorkerEffect, senior: boolean): GameAction[] {
  switch (action) {
    case "MY":
      return buildMaterialsYard(k, workerId, effect, senior);
    case "CW":
      return [{ type: "PLACE_CANAL_WHARF", workerId }];
    case "FD":
      return buildFormDecorate(k, workerId, effect);
    case "GL":
      return buildGlazeLoad(k, workerId, effect);
    case "CM":
      return buildCommission(workerId, senior);
    case "GH":
      return buildGuildHall(k, workerId, effect);
    case "MH": {
      // The Shifu's optional Crown Order (R21), when one is worth taking; the bare step after.
      const crown = effect === "shifu" ? bestMagistratesCrownOrder(k) : null;
      const base: GameAction = { type: "PLACE_MAGISTRATES_HALL", workerId };
      return crown === null ? [base] : [{ type: "PLACE_MAGISTRATES_HALL", workerId, crownOrder: { slotIndex: crown.slotIndex, orderId: crown.orderId } }, base];
    }
  }
}

function decidePlacement(k: Know): GameAction | null {
  const params = planParams(k);
  const start = initialAbs(k);
  const table = new Map<string, number>();
  const legal = placementOptions(k.view);
  const roots: Array<{ action: PlanAction; workerId: string; effect: WorkerEffect; senior: boolean; value: number }> = [];
  for (const action of PLAN_ACTIONS) {
    const location = legal.find((option) => option.locationId === LOCATION_OF[action]);
    if (location === undefined) continue;
    for (const option of location.workers) {
      if (!option.legal) continue;
      const worker: PlanWorker = { kind: option.kind, effect: option.effect, senior: option.seniorApprentice };
      const applied = absApply(k, params, start, worker, action);
      if (applied === null) continue;
      const value = applied.gain + absBest(k, params, applied.next, table);
      roots.push({ action, workerId: option.workerId, effect: option.effect, senior: option.seniorApprentice, value });
    }
  }
  k.deadline.checkNow();
  roots.sort((a, b) => b.value - a.value || PLAN_ACTIONS.indexOf(a.action) - PLAN_ACTIONS.indexOf(b.action));
  for (const root of roots) {
    const chosen = firstValid(k, buildPlacement(k, root.action, root.workerId, root.effect, root.senior));
    if (chosen !== null) return chosen;
  }
  // Canal Wharf is always legal (L165).
  const anyWorker = legal.find((option) => option.locationId === "canal_wharf")?.workers.find((option) => option.legal);
  return anyWorker === undefined ? null : firstValid(k, [{ type: "PLACE_CANAL_WHARF", workerId: anyWorker.workerId }]);
}

function decideBeforeAction(k: Know): GameAction | null {
  return decideSellFlawed(k) ?? decideFreeCompletion(k, true) ?? windowAbility(k) ?? decidePlacement(k);
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 9. Entry point
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * One strategic decision for `view.viewerId`, which must be one of
 * `decisionPrompt(view.game).actorIds`. Returns null when the seat has nothing to decide or
 * none of its preferred commands validates (the service then falls back).
 */
export function chooseStrategicCommand(
  view: ActorView,
  seat: ComputerSeatContext | null = null,
  deadline: Deadline = new Deadline(defaultNow, DIRECT_DECISION_BUDGET_MS),
): AuthoritativeCommand | null {
  const game = view.game;
  if (game.phase.type === "finished" || !decisionPrompt(game).actorIds.includes(view.viewerId)) {
    return null;
  }
  const k = knowledge(view, seat, deadline);
  const command = decide(k);
  // A decision that finished past its budget is discarded too, so a slow decision always
  // falls back rather than depending on where the last cooperative check happened to fall.
  deadline.checkNow();
  return command;
}

function decide(k: Know): AuthoritativeCommand | null {
  const phase = k.game.phase;
  switch (phase.type) {
    case "setup_kiln_selection":
      return decideSetup(k);
    case "round_start_setters_mark":
      return decideSettersMark(k);
    case "work_turn":
      switch (phase.step.kind) {
        case "before_action":
          return decideBeforeAction(k);
        case "commission_market":
        case "colour_samples":
        case "colour_samples_swap":
          return decideSelect(k);
        case "guild_inspection":
          return decideGuildTake(k);
        case "after_action":
          return decideAfterAction(k);
      }
      return null;
    case "firing_contributions":
      return decideContribution(k);
    case "firing_test_pieces":
      return decideTestPieces(k);
    case "firing_heat_adjustment":
      return decideJun(k);
    case "firing_second_firing_choice":
      return decideSecondFiringChoice(k);
    case "firing_after_quality":
      return decideAfterQuality(k);
    case "orders":
      return decideSellFlawed(k) ?? decideOrders(k);
    case "cleanup_hand_limit":
      // Cleanup is not a free-action window (R26): no sale while trimming.
      return decideHandLimit(k);
    case "finished":
      return null;
  }
}
