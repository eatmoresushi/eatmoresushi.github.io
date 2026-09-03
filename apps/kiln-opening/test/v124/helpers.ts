import { expect } from "vitest";
import {
  KILN_IDS,
  SeededRandom,
  applyAction,
  createGame,
  currentDecisionActor,
} from "../../src/game/index.ts";
import type {
  ApplyResult,
  CeramicId,
  Decoration,
  FinishedCeramic,
  GameAction,
  GameState,
  GlazedCeramic,
  Glaze,
  KilnId,
  LoadedCeramic,
  PlayerCount,
  PlayerId,
  Quality,
  Shape,
  ShapedCeramic,
  StartingTechniqueId,
  TechniqueId,
  WorkerKind,
} from "../../src/game/index.ts";

export interface StartedGame {
  state: GameState;
  rng: SeededRandom;
}

export function playerInputs(count: number): Array<{ id: string; displayName: string }> {
  return Array.from({ length: count }, (_, index) => ({
    id: `P${index + 1}`,
    displayName: `Player ${index + 1}`,
  }));
}

export function mustApply(
  state: GameState,
  actorId: PlayerId,
  action: GameAction,
  rng: SeededRandom,
): GameState {
  const result = applyAction(state, actorId, action, rng);
  expect(result.ok, result.ok ? undefined : JSON.stringify(result.error)).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

export function mustResult(
  state: GameState,
  actorId: PlayerId,
  action: GameAction,
  rng: SeededRandom,
): Extract<ApplyResult, { ok: true }> {
  const result = applyAction(state, actorId, action, rng);
  expect(result.ok, result.ok ? undefined : JSON.stringify(result.error)).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

export function expectError(result: ApplyResult, code: string): void {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected action to fail");
  expect(result.error.code).toBe(code);
}

export function createdGame(playerCount: PlayerCount, seed = 122): StartedGame {
  const rng = new SeededRandom(seed);
  const result = createGame(
    { gameId: `v122-${playerCount}-${seed}`, players: playerInputs(playerCount) },
    rng,
  );
  if (!result.ok) throw new Error(result.error.message);
  return { state: result.state, rng };
}

export function startedGame(
  playerCount: PlayerCount,
  seed = 122,
  startingTechs: readonly StartingTechniqueId[] = ["ST01", "ST02", "ST03", "ST04"],
): StartedGame {
  const fixture = createdGame(playerCount, seed);
  let { state } = fixture;
  const { rng } = fixture;
  let kilnIndex = 0;
  while (state.phase.type === "setup_kiln_selection") {
    const actorId = currentDecisionActor(state.phase);
    const kilnId = KILN_IDS[kilnIndex] as KilnId | undefined;
    if (actorId === null || kilnId === undefined) throw new Error("Kiln setup fixture failed");
    state = mustApply(state, actorId, { type: "SELECT_KILN", kilnId }, rng);
    kilnIndex += 1;
  }
  while (state.phase.type === "setup_starting_orders") {
    const actorId = currentDecisionActor(state.phase);
    const offer = actorId === null ? undefined : state.phase.offeredOrderIds[actorId];
    if (actorId === null || offer === undefined) throw new Error("Starting Order fixture failed");
    state = mustApply(state, actorId, { type: "SUBMIT_STARTING_ORDERS", orderIds: offer.slice(0, 2) }, rng);
  }
  while (state.phase.type === "setup_starting_tech") {
    const actorId = currentDecisionActor(state.phase);
    if (actorId === null) throw new Error("Starting Tech fixture failed");
    const seat = state.players[actorId]?.seatIndex ?? 0;
    const techniqueId = startingTechs[seat % startingTechs.length] ?? "ST01";
    state = mustApply(state, actorId, { type: "SELECT_STARTING_TECH", techniqueId }, rng);
  }
  if (state.phase.type !== "work") throw new Error(`Expected Work Phase, got ${state.phase.type}`);
  // Most unit fixtures exercise P1 directly. Individual turn-order tests use createdGame
  // or overwrite this phase explicitly.
  state.phase = { type: "work", activePlayerId: "P1" };
  return { state, rng };
}

export function setWorkTurn(state: GameState, playerId: PlayerId): void {
  state.phase = { type: "work", activePlayerId: playerId };
  state.players[playerId]!.passedWorkPhase = false;
}

export function workerId(
  state: GameState,
  playerId: PlayerId,
  kind: WorkerKind,
  availableIndex = 0,
): string {
  const worker = Object.values(state.players[playerId]!.workers).filter(
    (candidate) => candidate.kind === kind && candidate.status === "available",
  )[availableIndex];
  if (worker === undefined) throw new Error(`No available ${kind} for ${playerId}`);
  return worker.id;
}

export function addTechnique(
  state: GameState,
  playerId: PlayerId,
  techniqueId: TechniqueId,
  exhausted = false,
): void {
  state.players[playerId]!.techniques.push({ id: techniqueId, exhausted });
}

function takeVessel(state: GameState, shape: Shape): string {
  const vessel = state.vesselSupply[shape].shift();
  if (vessel === undefined) throw new Error(`No ${shape} vessel remains`);
  return vessel;
}

function nextId(state: GameState): CeramicId {
  return `${state.gameId}:fixture:${state.nextCeramicSequence++}`;
}

export function addShaped(state: GameState, ownerId: PlayerId, shape: Shape = "bowl"): ShapedCeramic {
  const ceramic: ShapedCeramic = {
    id: nextId(state), vesselInstanceId: takeVessel(state, shape), ownerId, shape, stage: "shaped",
  };
  state.ceramics[ceramic.id] = ceramic;
  return ceramic;
}

export function addGlazed(
  state: GameState,
  ownerId: PlayerId,
  shape: Shape = "bowl",
  glaze: Glaze = "white",
  decoration: Decoration = "plain",
): GlazedCeramic {
  const ceramic: GlazedCeramic = {
    id: nextId(state), vesselInstanceId: takeVessel(state, shape), ownerId, shape,
    stage: "glazed", glaze, decoration,
  };
  state.ceramics[ceramic.id] = ceramic;
  return ceramic;
}

export function addLoaded(
  state: GameState,
  ownerId: PlayerId,
  shape: Shape,
  glaze: Glaze,
  decoration: Decoration,
  kilnSpaceId: LoadedCeramic["kilnSpaceId"],
  kilnFurnitureUsed = false,
): LoadedCeramic {
  const ceramic: LoadedCeramic = {
    id: nextId(state), vesselInstanceId: takeVessel(state, shape), ownerId, shape,
    stage: "loaded", glaze, decoration, kilnSpaceId,
    ...(kilnFurnitureUsed ? { kilnFurnitureUsed: true } : {}),
  };
  state.ceramics[ceramic.id] = ceramic;
  return ceramic;
}

export function addFinished(
  state: GameState,
  ownerId: PlayerId,
  shape: Shape,
  quality: Quality,
  glaze: Glaze = "white",
  decoration: Decoration = "plain",
): FinishedCeramic {
  const ceramic: FinishedCeramic = {
    id: nextId(state), vesselInstanceId: takeVessel(state, shape), ownerId, shape,
    stage: "finished", glaze, decoration, quality, firedInRound: state.round,
  };
  state.ceramics[ceramic.id] = ceramic;
  return ceramic;
}
