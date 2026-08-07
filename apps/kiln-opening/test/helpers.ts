import { expect } from "vitest";
import {
  KILN_IDS,
  SeededRandom,
  applyAction,
  createGame,
  currentDecisionActor,
} from "../src/game";
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
  WorkerKind,
  TechniqueId,
} from "../src/game";

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
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.state;
}

export function expectError(result: ApplyResult, code: string): void {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("Expected action to fail");
  }
  expect(result.error.code).toBe(code);
}

export function startedGame(playerCount: PlayerCount, seed = 12345): StartedGame {
  const rng = new SeededRandom(seed);
  const result = createGame(
    { gameId: `game-${playerCount}-${seed}`, players: playerInputs(playerCount) },
    rng,
  );
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  let state = result.state;
  let kilnIndex = 0;
  while (state.phase.type === "setup_kiln_selection") {
    const actorId = currentDecisionActor(state.phase);
    const kilnId = KILN_IDS[kilnIndex] as KilnId | undefined;
    if (actorId === null || kilnId === undefined) {
      throw new Error("Unable to resolve Kiln selection fixture");
    }
    state = mustApply(state, actorId, { type: "SELECT_KILN", kilnId }, rng);
    kilnIndex += 1;
  }
  while (state.phase.type === "setup_starting_orders") {
    const actorId = currentDecisionActor(state.phase);
    if (actorId === null) {
      throw new Error("Unable to resolve starting Order fixture");
    }
    state = mustApply(state, actorId, { type: "KEEP_STARTING_ORDER" }, rng);
  }
  if (state.phase.type !== "work") {
    throw new Error(`Expected Work Phase, got ${state.phase.type}`);
  }
  return { state, rng };
}

export function setActive(state: GameState, playerId: PlayerId): void {
  state.phase = { type: "work", activePlayerId: playerId };
  state.players[playerId]!.passedWorkPhase = false;
}

export function workerId(
  state: GameState,
  playerId: PlayerId,
  kind: WorkerKind,
  availableIndex = 0,
): string {
  const workers = Object.values(state.players[playerId]!.workers).filter(
    (worker) => worker.kind === kind && worker.status === "available",
  );
  const worker = workers[availableIndex];
  if (worker === undefined) {
    throw new Error(`No available ${kind} worker for ${playerId}`);
  }
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
  const vesselInstanceId = state.vesselSupply[shape].shift();
  if (vesselInstanceId === undefined) {
    throw new Error(`No ${shape} Vessel fixture available`);
  }
  return vesselInstanceId;
}

function nextCeramicId(state: GameState): CeramicId {
  const id = `${state.gameId}:fixture:${state.nextCeramicSequence}`;
  state.nextCeramicSequence += 1;
  return id;
}

export function addShaped(
  state: GameState,
  ownerId: PlayerId,
  shape: Shape = "bowl",
): ShapedCeramic {
  const ceramic: ShapedCeramic = {
    id: nextCeramicId(state),
    vesselInstanceId: takeVessel(state, shape),
    ownerId,
    shape,
    stage: "shaped",
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
): LoadedCeramic {
  const ceramic: LoadedCeramic = {
    id: nextCeramicId(state),
    vesselInstanceId: takeVessel(state, shape),
    ownerId,
    shape,
    stage: "loaded",
    glaze,
    decoration,
    kilnSpaceId,
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
    id: nextCeramicId(state),
    vesselInstanceId: takeVessel(state, shape),
    ownerId,
    shape,
    stage: "glazed",
    glaze,
    decoration,
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
    id: nextCeramicId(state),
    vesselInstanceId: takeVessel(state, shape),
    ownerId,
    shape,
    stage: "finished",
    glaze,
    decoration,
    quality,
    firedInRound: state.round,
  };
  state.ceramics[ceramic.id] = ceramic;
  return ceramic;
}
