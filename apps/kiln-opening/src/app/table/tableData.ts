/**
 * Read helpers for table and board components (B2). Pure, memoised per model; no rule is decided
 * here. Each helper only gathers public facts the model already holds into the shape a component
 * draws: ceramic attributes from `model.ceramics` (change request CR B2-1, landed by B6) with this
 * firing's recorded Quality and Crackle, and the workers and personal spaces of a board.
 */
import type {
  CeramicId,
  CeramicState,
  LocationId,
  PersonalLocationId,
  PersonalSpaceIndex,
  PlayerId,
  PlayerSummary,
  HeatDelta,
  WorkerKind,
} from "../../game/index.ts";
import type { CeramicFacts, CeramicLabelModelView } from "../i18n/ceramicLabel.ts";
import type { GameModel } from "../state/model.ts";

// ── Ceramics ──────────────────────────────────────────────────────────────────────────────

export interface TableCeramics {
  /** Attributes by ID, with this firing's recorded Quality and Crackle merged into loaded ones. */
  readonly byId: ReadonlyMap<CeramicId, CeramicFacts>;
  /** Kiln Master's markers on loaded ceramics (public, face up, chosen at loading: T24, rev. 4 L628). */
  readonly markers: ReadonlyMap<CeramicId, HeatDelta>;
  /** For `ceramicLabel` and `errorTextOptions`: names and words, never IDs (D9). */
  readonly labelView: CeramicLabelModelView;
}

type MutableFacts = { -readonly [K in keyof CeramicFacts]: CeramicFacts[K] };

/** The Vessel-card facts of a ceramic (never its other fields). */
function factsOf(id: CeramicId, ceramic: CeramicState): CeramicFacts {
  const facts: MutableFacts = { id, ownerId: ceramic.ownerId, shape: ceramic.shape, decoration: ceramic.decoration, stage: ceramic.stage };
  if ("glaze" in ceramic) facts.glaze = ceramic.glaze;
  if ("quality" in ceramic) facts.quality = ceramic.quality;
  if ("crackle" in ceramic) facts.crackle = ceramic.crackle;
  if (ceramic.stage === "loaded") facts.placement = ceramic.placement;
  return facts;
}

const CERAMICS = new WeakMap<GameModel, TableCeramics>();

export function tableCeramics(model: GameModel): TableCeramics {
  const cached = CERAMICS.get(model);
  if (cached !== undefined) return cached;
  const byId = new Map<CeramicId, CeramicFacts>();
  const markers = new Map<CeramicId, HeatDelta>();
  for (const [key, ceramic] of Object.entries(model.ceramics)) {
    const id = key as CeramicId;
    byId.set(id, factsOf(id, ceramic));
    if (ceramic.stage === "loaded" && ceramic.kilnMasterMarker !== null) markers.set(id, ceramic.kilnMasterMarker);
  }
  // A loaded ceramic shows the Quality and Crackle this firing recorded (Appendix D steps 4–5).
  const firing = model.firingStage;
  if (firing !== null) {
    for (const fired of firing.ceramics) {
      const facts = byId.get(fired.id);
      if (facts === undefined || facts.stage !== "loaded") continue;
      byId.set(fired.id, { ...facts, ...(fired.quality === null ? {} : { quality: fired.quality }), crackle: fired.crackle });
    }
  }
  const ceramics: Record<CeramicId, CeramicFacts> = {};
  for (const [id, facts] of byId) ceramics[id] = facts;
  const result: TableCeramics = {
    byId,
    markers,
    labelView: { viewerId: model.viewerId, players: model.players, ceramics },
  };
  CERAMICS.set(model, result);
  return result;
}

/** Facts for each ID, and how many IDs have none (none in a consistent view). */
export function ceramicsFor(model: GameModel, ids: readonly CeramicId[]): { known: CeramicFacts[]; unknown: number } {
  const { byId } = tableCeramics(model);
  const known: CeramicFacts[] = [];
  let unknown = 0;
  for (const id of ids) {
    const facts = byId.get(id);
    if (facts === undefined) unknown += 1;
    else known.push(facts);
  }
  return { known, unknown };
}

// ── Workers ───────────────────────────────────────────────────────────────────────────────

export interface BoardWorker {
  kind: WorkerKind;
  /** Where it is placed this round, or null while available. */
  placedAt: LocationId | null;
  /** An Apprentice resolving the Shifu effect (Senior Apprentice). */
  senior: boolean;
}

/**
 * A player's workers as the board shows them, Shifu first: placed workers from the public
 * occupants of every location, then the available ones (`availableWorkerIds`: Shifu first). No
 * worker ID leaves this function (D9).
 */
export function boardWorkers(model: GameModel, summary: PlayerSummary): BoardWorker[] {
  const placed: BoardWorker[] = [];
  for (const location of model.board.centralLocations) {
    for (const occupant of location.occupants) {
      if (occupant.playerId === summary.playerId) {
        placed.push({ kind: occupant.kind, placedAt: location.locationId, senior: occupant.viaSeniorApprentice });
      }
    }
  }
  for (const space of summary.personalSpaces) {
    if (space.occupant !== null) placed.push({ kind: space.occupant.kind, placedAt: space.locationId, senior: space.occupant.viaSeniorApprentice });
  }
  const shifuPlaced = placed.some((worker) => worker.kind === "shifu");
  const available: BoardWorker[] = summary.availableWorkerIds.map((_, index) => ({
    kind: index === 0 && !shifuPlaced ? "shifu" : "apprentice",
    placedAt: null,
    senior: false,
  }));
  const all = [...available, ...placed];
  return [...all.filter((worker) => worker.kind === "shifu"), ...all.filter((worker) => worker.kind !== "shifu")];
}

// ── Personal spaces ───────────────────────────────────────────────────────────────────────

/** The first added, empty space of a personal location: where a new worker would stand. */
export function nextFreePersonalSpace(summary: PlayerSummary, locationId: PersonalLocationId): PersonalSpaceIndex | null {
  const space = summary.personalSpaces.find((candidate) => candidate.locationId === locationId && candidate.unlocked && candidate.occupant === null);
  return space === undefined ? null : space.spaceIndex;
}

// ── Players ───────────────────────────────────────────────────────────────────────────────

export function summaryOf(model: GameModel, playerId: PlayerId): PlayerSummary | null {
  return model.players.find((summary) => summary.playerId === playerId) ?? null;
}

/** The seat-colour index of a player (`--seat-N`), 0 when unknown. */
export function seatOf(model: GameModel, playerId: PlayerId): number {
  return summaryOf(model, playerId)?.seatIndex ?? 0;
}

