/**
 * Scenario fixtures (DESIGN §8.1).
 *
 * `buildState(spec)` builds a complete `GameState` from a compact spec without `setup.ts`,
 * so every Phase 2 package can build scenarios before P2 lands. It keeps the §8.3
 * invariants that a spec can affect, and throws a `fixtures:` error otherwise:
 * - card conservation: all 16 Starting, 48 Main, 18 Tech and 12 Fire cards sit in exactly
 *   one zone (unplaced cards go to the default zone; a spec that pins every zone and still
 *   leaves a card out throws);
 * - Tech sets obey 3 total / 1 per discipline (`giveTech` calls `acquisitionError`);
 * - personal spaces are unlocked exactly by owned Techs; kiln spaces list their ceramics;
 * - kiln consistency: loads only into active spaces; a stack is 1 Bowl/Plate/Brush Washer
 *   (T21 shapes) on 1 ceramic of the same owner, who owns Inverted Firing (T21); ≤ 1
 *   Imperial ceramic per player and only once `kilnGained`;
 * - Kiln Furniture: its owner owns T15; ≤ 1 tile in the Shared Kiln;
 * - Heat markers: ≤ 1 `own` marker per player; ≤ 1 `kiln_master` marker in the game, on a
 *   ceramic of the T24 owner;
 * - Setter's Mark: on an empty active space; the owner owns T22; ≤ 1 per owner; none during
 *   `setup_kiln_selection`, `cleanup_hand_limit` or `finished`;
 * - placements: an explicit personal `spaceIndex` is an unlocked space unused this round; a
 *   central location never exceeds `locationCapacity`, and an explicit central slot is
 *   free; `viaSeniorApprentice` only for an Apprentice at the Materials Yard or Commission
 *   Market whose owner has Senior Apprentice (T18) ready.
 *
 * Mutation helpers (`stageCeramic`, `giveTech`, `setResources`, `setHand`, `setDisplay`)
 * keep the same invariants on an existing state.
 */

import {
  DISCIPLINES,
  FIRING,
  GAME_CONFIG,
  IMPERIAL_TRACK,
  KILN_IDS,
  KILN_SPACE_IDS,
  MAIN_ORDER_IDS,
  SHAPES,
  STARTING_ORDER_IDS,
  TECHS,
  activeKilnSpaces,
  isStartingOrderId,
  locationCapacity,
  techsOfDiscipline,
} from "../../../../src/game/content.ts";
import { applyAction, createGame } from "../../../../src/game/engine.ts";
import { availableKilns } from "../../../../src/game/kilns.ts";
import { SeededRandom } from "../../../../src/game/rng.ts";
import {
  decisionPrompt,
  heatMarkerOf,
  imperialKilnCeramic,
  loadedCeramics,
  lookup,
  player,
  takeVesselCard,
} from "../../../../src/game/state.ts";
import { acquisitionError, grantTech, ownsTech, techReady } from "../../../../src/game/techs.ts";
import type {
  CeramicHeatMarker,
  CeramicState,
  Decoration,
  FireModifier,
  FirePeek,
  FiringContext,
  FlowController,
  FormedBy,
  GameEvent,
  GamePhase,
  GameState,
  Glaze,
  ImperialModifier,
  ImperialState,
  KilnDieFace,
  KilnFurnitureModifier,
  KilnId,
  KilnSpaceId,
  LoadedCeramic,
  LocationId,
  OrderId,
  PendingLook,
  PlayerCount,
  PlayerId,
  PlayerState,
  Quality,
  Recognition,
  ResolveContext,
  ResourceState,
  RoundNumber,
  ScoreLedger,
  Shape,
  SharedKilnSpaceState,
  StartingOrderId,
  TechDiscipline,
  TechId,
  WorkerState,
} from "../../../../src/game/types.ts";
import { type FlowHalt, haltingFlow } from "./flow.ts";

// ── Specs ────────────────────────────────────────────────────────────────────────────

export type TechSpec = TechId | { id: TechId; usedThisRound?: boolean; acquiredInRound?: RoundNumber };

export interface PlayerSpec {
  /** Default `p1` … `p4` by seat. */
  id?: PlayerId;
  displayName?: string;
  /** Default: `KILN_IDS[seat]` (RU, GU, GE, DI), or null during `setup_kiln_selection`. */
  kilnId?: KilnId | null;
  /** Merged over the starting resources (2 Clay, 2 Wood, 3 Coins). */
  resources?: Partial<ResourceState>;
  techs?: TechSpec[];
  kilnAbilityUsedThisRound?: boolean;
  /** Sets every milestone flag consistently (Grant at 1, Kiln at 2, token held at 3,
   * Audience and its 6 VP at 4). `imperial` overrides individual fields. */
  recognition?: Recognition;
  imperial?: Partial<ImperialState>;
  hand?: OrderId[];
  score?: Partial<ScoreLedger>;
}

/** A worker: the Shifu or Apprentice 1–3. */
export type WorkerRef = "shifu" | 1 | 2 | 3;

export interface PlacementSpec {
  player: PlayerId;
  worker: WorkerRef;
  locationId: LocationId;
  /** Default: personal → the next free unlocked space; central → current occupancy. An
   * explicit index must be a free unlocked personal space, or a free central slot. */
  spaceIndex?: number;
  /** Needs an Apprentice at the Materials Yard or Commission Market and a ready T18;
   * marks T18 used. */
  viaSeniorApprentice?: boolean;
}

interface CeramicSpecCore {
  owner: PlayerId;
  shape: Shape;
  /** Default `plain`. */
  decoration?: Decoration;
  formedBy?: FormedBy;
  formedInRound?: RoundNumber;
}

export type CeramicSpec = CeramicSpecCore &
  (
    | { stage: "shaped" }
    | {
        stage: "loaded";
        glaze: Glaze;
        /** A Shared Kiln space (stacked automatically onto 1 own ceramic) or the Imperial Kiln. */
        at: KilnSpaceId | "imperial";
        /** Imperial only; default 0. */
        imperialModifier?: ImperialModifier;
        /** Shared only: Kiln Furniture beneath this ceramic. */
        kilnFurniture?: KilnFurnitureModifier;
        heatMarker?: CeramicHeatMarker | null;
        loadedBy?: LoadedCeramic["loadedBy"];
        loadedInRound?: RoundNumber;
      }
    | { stage: "finished"; glaze: Glaze; quality: Quality; crackle?: boolean; firedInRound?: RoundNumber }
  );

export interface StateSpec {
  gameId?: string;
  /** A player count (default 2) or one spec per seat, clockwise. */
  players?: PlayerCount | PlayerSpec[];
  firstPlayerId?: PlayerId;
  round?: RoundNumber;
  /** Default: the First Player's Work turn, before the worker action. */
  phase?: GamePhase;
  /** Default 2 for the current round; null during `setup_kiln_selection`. */
  kilnDie?: KilnDieFace | null;
  ceramics?: CeramicSpec[];
  placements?: PlacementSpec[];
  settersMarks?: Partial<Record<KilnSpaceId, PlayerId>>;
  /** Default: the first 6 Main Orders not placed elsewhere. */
  display?: Array<OrderId | null>;
  refillPendingFor?: PlayerId | null;
  /** Top first. Default: every Main Order not placed elsewhere. */
  mainDeck?: OrderId[];
  /** Default: empty, or every leftover Main Order when `mainDeck` is given. */
  mainDiscard?: OrderId[];
  /** Default: the first 2 unowned Techs of each discipline in `TECH_IDS` order. */
  techDisplay?: Partial<Record<TechDiscipline, TechId[]>>;
  /** Top first. Default: every remaining Tech of the discipline. */
  techDecks?: Partial<Record<TechDiscipline, TechId[]>>;
  /** Top first. Default: the remaining Fire cards in `FIRING.fireDeck` order. */
  fireDeck?: FireModifier[];
  /** Default: empty, or every leftover card when `fireDeck` is given. */
  fireDiscard?: FireModifier[];
  pendingLook?: PendingLook | null;
  firePeeks?: Partial<Record<PlayerId, FirePeek>>;
  firing?: FiringContext | null;
  lastFiring?: FiringContext | null;
}

// ── Contexts ─────────────────────────────────────────────────────────────────────────

export interface TestContext extends ResolveContext {
  readonly rng: SeededRandom;
  readonly events: GameEvent[];
  readonly halts: FlowHalt[];
}

/** A `ResolveContext` for calling helpers directly; hand-overs halt into `halts`. */
export function testContext(seed = 1, flow?: FlowController): TestContext {
  const halts: FlowHalt[] = [];
  return { rng: new SeededRandom(seed), events: [], flow: flow ?? haltingFlow(halts), halts };
}

// ── buildState ───────────────────────────────────────────────────────────────────────

function fixtureError(message: string): Error {
  return new Error(`fixtures: ${message}`);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function audienceVp(): number {
  const space = IMPERIAL_TRACK.track.find((entry) => entry.space === 4);
  return space?.reward?.kind === "vp" ? space.reward.vp : 0;
}

export function workerIdOf(playerId: PlayerId, worker: WorkerRef): string {
  return worker === "shifu" ? `${playerId}:shifu` : `${playerId}:apprentice:${worker}`;
}

function normalisePlayers(players: StateSpec["players"]): Array<PlayerSpec & { id: PlayerId }> {
  const specs: PlayerSpec[] = typeof players === "number" || players === undefined
    ? Array.from({ length: players ?? 2 }, () => ({}))
    : players;
  if (specs.length < 2 || specs.length > 4) {
    throw fixtureError(`2–4 players required, got ${specs.length}`);
  }
  const normalised = specs.map((spec, seat) => ({ ...spec, id: spec.id ?? `p${seat + 1}` }));
  if (new Set(normalised.map((spec) => spec.id)).size !== normalised.length) {
    throw fixtureError("duplicate player IDs");
  }
  return normalised;
}

function makePlayer(spec: PlayerSpec & { id: PlayerId }, seatIndex: number, inSetup: boolean): PlayerState {
  const workers: Record<string, WorkerState> = {};
  workers[`${spec.id}:shifu`] = { id: `${spec.id}:shifu`, kind: "shifu", placement: null };
  for (let index = 1; index <= GAME_CONFIG.workers.apprentices; index += 1) {
    const id = `${spec.id}:apprentice:${index}`;
    workers[id] = { id, kind: "apprentice", placement: null };
  }
  const recognition = spec.recognition ?? 0;
  const imperial: ImperialState = {
    recognition,
    grantReceived: recognition >= 1,
    kilnGained: recognition >= 2,
    priority: recognition >= 3 ? "held" : "on_track",
    audienceReceived: recognition >= 4,
    ...spec.imperial,
  };
  const defaultKiln = inSetup ? null : (KILN_IDS[seatIndex] ?? null);
  return {
    id: spec.id,
    seatIndex,
    displayName: spec.displayName ?? `Player ${seatIndex + 1}`,
    kilnId: spec.kilnId === undefined ? defaultKiln : spec.kilnId,
    resources: { ...GAME_CONFIG.startingResources, ...spec.resources },
    workers,
    personalSpaces: {
      form_decorate: [{ unlocked: true }, { unlocked: false }],
      glaze_load: [{ unlocked: true }, { unlocked: false }],
    },
    techs: [],
    kilnAbilityUsedThisRound: spec.kilnAbilityUsedThisRound ?? false,
    imperial,
    completedOrders: [],
    score: {
      orders: 0,
      kilnAbilities: 0,
      recognitionOverflow: 0,
      imperialAudience: imperial.audienceReceived ? audienceVp() : 0,
      ...spec.score,
    },
  };
}

function emptyTechRecord(): Record<TechDiscipline, TechId[]> {
  return { workshop: [], glazing_loading: [], firing: [] };
}

function withoutAll<T>(items: readonly T[], remove: readonly T[]): T[] {
  return items.filter((item) => !remove.includes(item));
}

/** Multiset difference: removes one occurrence per entry of `remove`; throws if absent. */
function multisetMinus(items: readonly FireModifier[], remove: readonly FireModifier[], what: string): FireModifier[] {
  const result = [...items];
  for (const card of remove) {
    const index = result.indexOf(card);
    if (index < 0) {
      throw fixtureError(`${what}: more ${card} Fire cards than the deck holds`);
    }
    result.splice(index, 1);
  }
  return result;
}

function assignTechZones(state: GameState, spec: StateSpec): void {
  const lookTechs = state.hidden.pendingLook?.kind === "guild_inspection" ? state.hidden.pendingLook.techIds : [];
  for (const discipline of DISCIPLINES) {
    const owned = state.playerOrder.flatMap((pid) => player(state, pid).techs.map((tech) => tech.id));
    const pool = withoutAll(techsOfDiscipline(discipline), [...owned, ...lookTechs]);
    const deckSpec = spec.techDecks?.[discipline];
    const display = spec.techDisplay?.[discipline] ?? withoutAll(pool, deckSpec ?? []).slice(0, GAME_CONFIG.techs.faceUpPerDiscipline);
    const deck = deckSpec ?? withoutAll(pool, display);
    const placed = [...display, ...deck];
    if (placed.length !== pool.length || new Set(placed).size !== placed.length || !pool.every((id) => placed.includes(id))) {
      throw fixtureError(`${discipline} Techs are not each in exactly one zone`);
    }
    state.techDisplay[discipline] = [...display];
    state.hidden.techDecks[discipline] = [...deck];
  }
}

function assignOrderZones(state: GameState, spec: StateSpec): void {
  const hands = state.playerOrder.flatMap((pid) => state.hidden.orderHands[pid] ?? []);
  const look = state.hidden.pendingLook;
  const looked = look !== null && look.kind !== "guild_inspection" ? look.orderIds : [];
  const fixed = [...hands, ...looked, ...(spec.display ?? []).filter((id): id is OrderId => id !== null)];
  const pinned = [...fixed, ...(spec.mainDeck ?? []), ...(spec.mainDiscard ?? [])];
  if (new Set(pinned).size !== pinned.length) {
    throw fixtureError("an Order appears in more than one zone");
  }
  let pool = withoutAll(MAIN_ORDER_IDS, pinned);
  const display = spec.display ?? pool.slice(0, GAME_CONFIG.mainMarket.displaySize);
  pool = withoutAll(pool, display.filter((id): id is OrderId => id !== null));
  let deck: OrderId[];
  let discard: OrderId[];
  if (spec.mainDeck !== undefined && spec.mainDiscard !== undefined) {
    if (pool.length > 0) {
      throw fixtureError(`${pool.length} Main Orders are in no zone`);
    }
    deck = spec.mainDeck;
    discard = spec.mainDiscard;
  } else if (spec.mainDeck !== undefined) {
    deck = spec.mainDeck;
    discard = pool;
  } else {
    discard = spec.mainDiscard ?? [];
    deck = pool;
  }
  const startingOutsideHands = [...display, ...deck, ...discard].filter((id) => id !== null && isStartingOrderId(id));
  if (startingOutsideHands.length > 0) {
    throw fixtureError(`Starting Orders cannot be in the Main display, deck or discard: ${startingOutsideHands.join(", ")}`);
  }
  state.market.display = [...display];
  state.hidden.mainDeck = [...deck];
  state.hidden.mainDiscard = [...discard];
  state.hidden.startingBox = STARTING_ORDER_IDS.filter((id) => !hands.includes(id) && !looked.includes(id));
}

function assignFireZones(state: GameState, spec: StateSpec): void {
  const inPlay: FireModifier[] = [];
  if (state.firing?.fireModifier !== null && state.firing?.fireModifier !== undefined) {
    inPlay.push(state.firing.fireModifier);
  }
  if (state.firing?.pendingExtraFire) {
    inPlay.push(state.firing.pendingExtraFire.modifier);
  }
  const remaining = multisetMinus(FIRING.fireDeck, inPlay, "firing");
  if (spec.fireDeck !== undefined && spec.fireDiscard !== undefined) {
    const leftover = multisetMinus(multisetMinus(remaining, spec.fireDeck, "fireDeck"), spec.fireDiscard, "fireDiscard");
    if (leftover.length > 0) {
      throw fixtureError(`${leftover.length} Fire cards are in no zone`);
    }
    state.hidden.fireDeck = [...spec.fireDeck];
    state.fireDiscard = [...spec.fireDiscard];
  } else if (spec.fireDeck !== undefined) {
    state.fireDiscard = multisetMinus(remaining, spec.fireDeck, "fireDeck");
    state.hidden.fireDeck = [...spec.fireDeck];
  } else {
    const discard = spec.fireDiscard ?? [];
    state.hidden.fireDeck = multisetMinus(remaining, discard, "fireDiscard");
    state.fireDiscard = [...discard];
  }
}

/** A complete, invariant-clean `GameState` from a compact spec (DESIGN §8.1). */
export function buildState(spec: StateSpec = {}): GameState {
  const playerSpecs = normalisePlayers(spec.players);
  const playerOrder = playerSpecs.map((p) => p.id);
  const playerCount = playerOrder.length as PlayerCount;
  const round = spec.round ?? 1;
  const firstPlayerId = spec.firstPlayerId ?? (playerOrder[0] as PlayerId);
  if (!playerOrder.includes(firstPlayerId)) {
    throw fixtureError(`First Player ${firstPlayerId} is not seated`);
  }
  const phase: GamePhase = spec.phase ?? { type: "work_turn", activePlayerId: firstPlayerId, step: { kind: "before_action" } };
  const inSetup = phase.type === "setup_kiln_selection";

  const players: Record<PlayerId, PlayerState> = {};
  const orderHands: Record<PlayerId, OrderId[]> = {};
  playerSpecs.forEach((playerSpec, seat) => {
    players[playerSpec.id] = makePlayer(playerSpec, seat, inSetup);
    orderHands[playerSpec.id] = [...(playerSpec.hand ?? [])];
  });

  const active = activeKilnSpaces(playerCount);
  const spaces = {} as Record<KilnSpaceId, SharedKilnSpaceState>;
  for (const id of KILN_SPACE_IDS) {
    spaces[id] = { active: active.includes(id), ceramicIds: [], setterMarkOwnerId: null, kilnFurniture: null };
  }
  const vesselSupply = {} as Record<Shape, string[]>;
  for (const shape of SHAPES) {
    vesselSupply[shape] = Array.from({ length: GAME_CONFIG.shapeSupplyEach }, (_, index) => `${shape}-${pad2(index + 1)}`);
  }
  const techDecks = emptyTechRecord();
  for (const discipline of DISCIPLINES) {
    techDecks[discipline] = [...techsOfDiscipline(discipline)];
  }

  const state: GameState = {
    schemaVersion: 6,
    rulesVersion: "1.6.1",
    gameId: spec.gameId ?? "test-game",
    revision: 0,
    eventSequence: 0,
    nextCeramicSequence: 1,
    nextProxySequence: 1,
    placementSequence: 0,
    playerCount,
    round,
    playerOrder,
    firstPlayerId,
    phase,
    players,
    ceramics: {},
    vesselSupply,
    sharedKiln: { spaces },
    market: { display: [], refillPendingFor: spec.refillPendingFor ?? null },
    techDisplay: emptyTechRecord(),
    fireDiscard: [],
    kilnDie: spec.kilnDie === undefined ? (inSetup ? null : { round, value: 2 }) : spec.kilnDie === null ? null : { round, value: spec.kilnDie },
    firing: spec.firing === undefined ? null : structuredClone(spec.firing),
    lastFiring: spec.lastFiring === undefined ? null : structuredClone(spec.lastFiring),
    finalResult: null,
    hidden: {
      orderHands,
      mainDeck: [],
      mainDiscard: [],
      startingBox: [],
      techDecks,
      fireDeck: [],
      pendingLook: spec.pendingLook === undefined ? null : structuredClone(spec.pendingLook),
      firePeeks: spec.firePeeks === undefined ? {} : structuredClone(spec.firePeeks),
    },
  };

  for (const playerSpec of playerSpecs) {
    for (const tech of playerSpec.techs ?? []) {
      const options = typeof tech === "string" ? {} : tech;
      giveTech(state, playerSpec.id, typeof tech === "string" ? tech : tech.id, options);
    }
  }
  assignTechZones(state, spec);
  assignOrderZones(state, spec);
  assignFireZones(state, spec);

  for (const ceramicSpec of spec.ceramics ?? []) {
    stageCeramic(state, ceramicSpec);
  }
  for (const placement of spec.placements ?? []) {
    placeFixtureWorker(state, placement);
  }
  const markOwners: PlayerId[] = [];
  for (const space of KILN_SPACE_IDS) {
    const owner = spec.settersMarks?.[space];
    if (owner !== undefined) {
      if (!spaces[space].active || spaces[space].ceramicIds.length > 0) {
        throw fixtureError(`Setter's Mark needs an empty active space, not ${space}`);
      }
      if (MARKLESS_PHASES.includes(phase.type)) {
        throw fixtureError(`no Setter's Mark is on the board during ${phase.type}`);
      }
      if (!ownsTech(player(state, owner), SETTERS_MARK)) {
        throw fixtureError(`Setter's Mark owner ${owner} does not own ${SETTERS_MARK}`);
      }
      if (markOwners.includes(owner)) {
        throw fixtureError(`${owner} has more than 1 Setter's Mark`);
      }
      markOwners.push(owner);
      spaces[space].setterMarkOwnerId = owner;
    }
  }
  return state;
}

// ── Mutation helpers ─────────────────────────────────────────────────────────────────

const KILN_FURNITURE: TechId = "T15";
const SENIOR_APPRENTICE: TechId = "T18";
const INVERTED_FIRING: TechId = "T21";
const SETTERS_MARK: TechId = "T22";
const KILN_MASTER: TechId = "T24";
/** Phases with every Setter's Mark returned or not yet placeable (§8.3, L302). */
const MARKLESS_PHASES: readonly GamePhase["type"][] = ["setup_kiln_selection", "cleanup_hand_limit", "finished"];

function scratchContext(): ResolveContext {
  return testContext();
}

/**
 * Gives a Tech the way `grantTech` does (unlocking its personal space) and removes it from
 * the display, deck or pending inspection; a display gap is refilled from the deck top.
 * Throws on a Tech set the 3-total / 1-per-discipline limit (L210) excludes.
 */
export function giveTech(
  state: GameState,
  playerId: PlayerId,
  techId: TechId,
  options: { usedThisRound?: boolean; acquiredInRound?: RoundNumber } = {},
): void {
  const owner = player(state, playerId);
  const error = acquisitionError(owner, techId);
  if (error !== null) {
    throw fixtureError(`giveTech(${playerId}, ${techId}) is illegal: ${error.code} — ${error.message}`);
  }
  const discipline = TECHS[techId].discipline;
  const display = state.techDisplay[discipline];
  const deck = state.hidden.techDecks[discipline];
  const wasDisplayed = display.includes(techId);
  state.techDisplay[discipline] = display.filter((id) => id !== techId);
  state.hidden.techDecks[discipline] = deck.filter((id) => id !== techId);
  const look = state.hidden.pendingLook;
  if (look?.kind === "guild_inspection") {
    look.techIds = look.techIds.filter((id) => id !== techId);
  }
  if (wasDisplayed) {
    const refill = state.hidden.techDecks[discipline].shift();
    if (refill !== undefined) {
      state.techDisplay[discipline].push(refill);
    }
  }
  grantTech(state, playerId, techId, scratchContext());
  const owned = owner.techs.find((tech) => tech.id === techId);
  if (owned !== undefined) {
    owned.usedThisRound = options.usedThisRound ?? false;
    owned.acquiredInRound = options.acquiredInRound ?? owned.acquiredInRound;
  }
}

/** Adds one ceramic (Vessel card from the supply, next sequence ID) and returns it. */
export function stageCeramic(state: GameState, spec: CeramicSpec): CeramicState {
  const owner = player(state, spec.owner);
  const id = `c${state.nextCeramicSequence}`;
  state.nextCeramicSequence += 1;
  const core = {
    id,
    ownerId: spec.owner,
    vesselInstanceId: takeVesselCard(state, spec.shape),
    shape: spec.shape,
    decoration: spec.decoration ?? "plain",
    formedInRound: spec.formedInRound ?? state.round,
    formedBy: spec.formedBy ?? "form_decorate",
  };
  let staged: CeramicState;
  switch (spec.stage) {
    case "shaped":
      staged = { ...core, stage: "shaped" };
      break;
    case "loaded": {
      let placement: LoadedCeramic["placement"];
      checkHeatMarker(state, spec.owner, spec.heatMarker ?? null);
      if (spec.at === "imperial") {
        if (spec.kilnFurniture !== undefined) {
          throw fixtureError("Kiln Furniture is Shared Kiln only");
        }
        if (!owner.imperial.kilnGained) {
          throw fixtureError(`${spec.owner} has no Imperial Kiln (kilnGained is false)`);
        }
        if (imperialKilnCeramic(state, spec.owner) !== null) {
          throw fixtureError(`${spec.owner} already has a ceramic in the Imperial Kiln`);
        }
        placement = { kiln: "imperial", imperialModifier: spec.imperialModifier ?? 0 };
      } else {
        const space = state.sharedKiln.spaces[spec.at];
        if (!space.active || space.ceramicIds.length >= 2 || space.setterMarkOwnerId !== null) {
          throw fixtureError(`cannot load into ${spec.at}`);
        }
        const below = space.ceramicIds[0];
        if (below !== undefined) {
          if (lookup(state.ceramics, below)?.ownerId !== spec.owner) {
            throw fixtureError(`a stack in ${spec.at} must have one owner`);
          }
          if (!ownsTech(owner, INVERTED_FIRING)) {
            throw fixtureError(`stacking in ${spec.at} needs ${INVERTED_FIRING}, which ${spec.owner} does not own`);
          }
          const stackable: readonly Shape[] = TECHS.T21.params.shapes;
          if (!stackable.includes(spec.shape)) {
            throw fixtureError(`only a ${stackable.join("/")} may be stacked, not a ${spec.shape}`);
          }
        }
        if (spec.kilnFurniture !== undefined) {
          if (!ownsTech(owner, KILN_FURNITURE)) {
            throw fixtureError(`Kiln Furniture needs ${KILN_FURNITURE}, which ${spec.owner} does not own`);
          }
          const tiled = KILN_SPACE_IDS.find((other) => state.sharedKiln.spaces[other].kilnFurniture !== null);
          if (tiled !== undefined) {
            throw fixtureError(`the Kiln Furniture tile is already in ${tiled}`);
          }
        }
        placement = { kiln: "shared", spaceId: spec.at, stacked: below !== undefined };
        space.ceramicIds.push(id);
        if (spec.kilnFurniture !== undefined) {
          space.kilnFurniture = { ownerId: spec.owner, modifier: spec.kilnFurniture, underCeramicId: id };
        }
      }
      staged = {
        ...core,
        stage: "loaded",
        glaze: spec.glaze,
        loadedInRound: spec.loadedInRound ?? state.round,
        loadedBy: spec.loadedBy ?? "glaze_load",
        placement,
        heatMarker: spec.heatMarker ?? null,
      };
      break;
    }
    case "finished": {
      const fired = { ...core, stage: "finished" as const, glaze: spec.glaze, firedInRound: spec.firedInRound ?? state.round };
      if (spec.crackle === true) {
        if (spec.quality !== "fine") {
          throw fixtureError("a Crackle ceramic is exactly Fine");
        }
        staged = { ...fired, crackle: true, quality: "fine" };
      } else {
        staged = { ...fired, crackle: false, quality: spec.quality };
      }
      break;
    }
  }
  state.ceramics[id] = staged;
  return staged;
}

/** ≤ 1 `own` marker per player; ≤ 1 `kiln_master` marker in the game, owned by the T24
 * owner (§8.3). Markers are only on loaded ceramics by construction. */
function checkHeatMarker(state: GameState, ownerId: PlayerId, marker: CeramicHeatMarker | null): void {
  if (marker === null) {
    return;
  }
  if (marker.source === "own") {
    if (heatMarkerOf(state, ownerId, "own") !== null) {
      throw fixtureError(`${ownerId} already has its own Heat marker on a ceramic`);
    }
    return;
  }
  if (!ownsTech(player(state, ownerId), KILN_MASTER)) {
    throw fixtureError(`the Kiln Master marker needs ${KILN_MASTER}, which ${ownerId} does not own`);
  }
  if (loadedCeramics(state).some((c) => c.heatMarker?.source === "kiln_master")) {
    throw fixtureError("the Kiln Master marker is already on a ceramic");
  }
}

function placeFixtureWorker(state: GameState, spec: PlacementSpec): void {
  const owner = player(state, spec.player);
  const workerId = workerIdOf(spec.player, spec.worker);
  const worker = lookup(owner.workers, workerId);
  if (worker === undefined || worker.placement !== null) {
    throw fixtureError(`worker ${workerId} is not available`);
  }
  let spaceIndex = spec.spaceIndex;
  if (spec.locationId === "form_decorate" || spec.locationId === "glaze_load") {
    const location = spec.locationId;
    const used = Object.values(owner.workers)
      .filter((w) => w.placement?.locationId === location)
      .map((w) => w.placement?.spaceIndex);
    const free = ([0, 1] as const).filter((index) => owner.personalSpaces[location][index].unlocked && !used.includes(index));
    if (spaceIndex === undefined) {
      spaceIndex = free[0];
      if (spaceIndex === undefined) {
        throw fixtureError(`${spec.player} has no free ${location} space`);
      }
    } else if (!(free as readonly number[]).includes(spaceIndex)) {
      throw fixtureError(`${spec.player}'s ${location} space ${spaceIndex} is locked, used or does not exist`);
    }
  } else {
    const location = spec.locationId;
    const here = state.playerOrder
      .flatMap((pid) => Object.values(player(state, pid).workers))
      .filter((w) => w.placement?.locationId === location);
    const capacity = locationCapacity(location, state.playerCount);
    if (capacity !== null && here.length >= capacity) {
      throw fixtureError(`${location} is full (capacity ${capacity} at ${state.playerCount} players)`);
    }
    if (spaceIndex === undefined) {
      spaceIndex = here.length;
    } else if (
      !Number.isSafeInteger(spaceIndex) ||
      spaceIndex < 0 ||
      (capacity !== null && spaceIndex >= capacity) ||
      here.some((w) => w.placement?.spaceIndex === spaceIndex)
    ) {
      throw fixtureError(`${location} slot ${spaceIndex} is taken or out of range`);
    }
  }
  const via = spec.viaSeniorApprentice ?? false;
  if (via) {
    const allowed: readonly LocationId[] = TECHS.T18.params.locations;
    if (worker.kind !== "apprentice" || !allowed.includes(spec.locationId)) {
      throw fixtureError(`Senior Apprentice applies only to an Apprentice at ${allowed.join(" or ")}`);
    }
    if (!ownsTech(owner, SENIOR_APPRENTICE) || !techReady(owner, SENIOR_APPRENTICE)) {
      throw fixtureError(`${spec.player} has no ready ${SENIOR_APPRENTICE} (Senior Apprentice)`);
    }
  }
  worker.placement = {
    locationId: spec.locationId,
    spaceIndex,
    effect: worker.kind === "shifu" || via ? "shifu" : "apprentice",
    viaSeniorApprentice: via,
    sequence: state.placementSequence,
  };
  state.placementSequence += 1;
  const senior = owner.techs.find((tech) => tech.id === SENIOR_APPRENTICE);
  if (via && senior !== undefined) {
    senior.usedThisRound = true;
  }
}

export function setResources(state: GameState, playerId: PlayerId, resources: Partial<ResourceState>): void {
  const owner = player(state, playerId);
  owner.resources = { ...owner.resources, ...resources };
}

/** Removes an Order from whichever zone holds it (a display position becomes empty). */
function takeOrderFromZones(state: GameState, orderId: OrderId): void {
  const hidden = state.hidden;
  for (const pid of state.playerOrder) {
    const hand = hidden.orderHands[pid] ?? [];
    hidden.orderHands[pid] = hand.filter((id) => id !== orderId);
  }
  state.market.display = state.market.display.map((id) => (id === orderId ? null : id));
  hidden.mainDeck = hidden.mainDeck.filter((id) => id !== orderId);
  hidden.mainDiscard = hidden.mainDiscard.filter((id) => id !== orderId);
  hidden.startingBox = hidden.startingBox.filter((id) => id !== orderId);
  const look = hidden.pendingLook;
  if (look !== null && look.kind !== "guild_inspection") {
    look.orderIds = look.orderIds.filter((id) => id !== orderId);
  }
  const completed = state.playerOrder.some((pid) => player(state, pid).completedOrders.some((record) => record.orderId === orderId));
  if (completed) {
    throw fixtureError(`${orderId} is already completed`);
  }
}

function returnOrder(state: GameState, orderId: OrderId): void {
  if (isStartingOrderId(orderId)) {
    state.hidden.startingBox.push(orderId as StartingOrderId);
  } else {
    state.hidden.mainDeck.push(orderId);
  }
}

/** Sets a hand exactly. New Orders come from any zone; dropped ones return to the box
 * (Starting) or the deck bottom (Main). */
export function setHand(state: GameState, playerId: PlayerId, orderIds: readonly OrderId[]): void {
  player(state, playerId);
  const previous = state.hidden.orderHands[playerId] ?? [];
  state.hidden.orderHands[playerId] = [];
  for (const orderId of previous) {
    if (!orderIds.includes(orderId)) {
      returnOrder(state, orderId);
    }
  }
  for (const orderId of orderIds) {
    takeOrderFromZones(state, orderId);
  }
  state.hidden.orderHands[playerId] = [...orderIds];
}

/** Sets the Main display exactly. New Orders come from any zone; dropped ones go to the
 * deck bottom. */
export function setDisplay(state: GameState, display: ReadonlyArray<OrderId | null>): void {
  const previous = state.market.display;
  state.market.display = [];
  for (const orderId of previous) {
    if (orderId !== null && !display.includes(orderId)) {
      returnOrder(state, orderId);
    }
  }
  for (const orderId of display) {
    if (orderId !== null) {
      if (isStartingOrderId(orderId)) {
        throw fixtureError(`Starting Order ${orderId} cannot be displayed`);
      }
      takeOrderFromZones(state, orderId);
    }
  }
  state.market.display = [...display];
}

// ── Card zones ───────────────────────────────────────────────────────────────────────

/**
 * Every card of each deck type wherever it sits (DESIGN §8.3 card conservation). History
 * records (`FiringCeramicRecord.second`, `lastFiring`, `kilnDie`) are not zones.
 */
export function cardZones(state: GameState): {
  orders: OrderId[];
  techs: TechId[];
  fire: FireModifier[];
} {
  const hidden = state.hidden;
  const look = hidden.pendingLook;
  const orders: OrderId[] = [
    ...state.playerOrder.flatMap((pid) => hidden.orderHands[pid] ?? []),
    ...hidden.mainDeck,
    ...hidden.mainDiscard,
    ...hidden.startingBox,
    ...state.market.display.filter((id): id is OrderId => id !== null),
    ...state.playerOrder.flatMap((pid) => player(state, pid).completedOrders.map((record) => record.orderId)),
    ...(look !== null && look.kind !== "guild_inspection" ? look.orderIds : []),
  ];
  const techs: TechId[] = [
    ...state.playerOrder.flatMap((pid) => player(state, pid).techs.map((tech) => tech.id)),
    ...DISCIPLINES.flatMap((d) => [...state.techDisplay[d], ...hidden.techDecks[d]]),
    ...(look?.kind === "guild_inspection" ? look.techIds : []),
  ];
  const fire: FireModifier[] = [...hidden.fireDeck, ...state.fireDiscard];
  if (state.firing?.fireModifier !== null && state.firing?.fireModifier !== undefined) {
    fire.push(state.firing.fireModifier);
  }
  if (state.firing?.pendingExtraFire) {
    fire.push(state.firing.pendingExtraFire.modifier);
  }
  return { orders, techs, fire };
}

// ── newGame ──────────────────────────────────────────────────────────────────────────

export interface NewGameOptions {
  /** Kiln per seat; default: the first available Kiln at each pick. */
  kilns?: Partial<Record<PlayerId, KilnId>>;
  /** Flow for the Kiln-selection commands (the last one hands over `setup_done`). */
  flow?: FlowController;
}

/** `createGame` plus Kiln selection (needs P2's `setup.ts`, and P2/P4 for the full flow). */
export function newGame(
  seed: number,
  playerCount: PlayerCount,
  options: NewGameOptions = {},
): { state: GameState; rng: SeededRandom; events: GameEvent[] } {
  const rng = new SeededRandom(seed);
  const created = createGame(
    {
      gameId: `test-game-${seed}`,
      players: Array.from({ length: playerCount }, (_, seat) => ({ id: `p${seat + 1}`, displayName: `Player ${seat + 1}` })),
    },
    rng,
    { checkInvariants: true },
  );
  if (!created.ok) {
    throw fixtureError(`createGame failed: ${created.error.code}`);
  }
  let state = created.state;
  const events = [...created.events];
  while (state.phase.type === "setup_kiln_selection") {
    const actor = decisionPrompt(state).actorIds[0];
    if (actor === undefined) {
      throw fixtureError("no Kiln-selection actor");
    }
    const kilnId = options.kilns?.[actor] ?? availableKilns(state)[0];
    if (kilnId === undefined) {
      throw fixtureError("no Kiln available");
    }
    const result = applyAction(state, actor, { type: "SELECT_KILN", kilnId }, rng, {
      checkInvariants: true,
      ...(options.flow === undefined ? {} : { flow: options.flow }),
    });
    if (!result.ok) {
      throw fixtureError(`SELECT_KILN failed: ${result.error.code}`);
    }
    state = result.state;
    events.push(...result.events);
  }
  return { state, rng, events };
}
