/**
 * Shared harness for the V1.6.1 platform suites: a deterministic security provider, rooms
 * driven through the real `AuthoritativeGameService` over the in-memory store, and a way to
 * seed an authoritative head built with the engine fixtures (`buildState`).
 */

import { createHash } from "node:crypto";
import { expect } from "vitest";
import { FLOW } from "../../../src/game/engine.ts";
import { openFiringPhase } from "../../../src/game/firing/contributions.ts";
import { GAME_CONFIG, KILN_IDS, SeededRandom, TECHS } from "../../../src/game/index.ts";
import type {
  ActorView,
  AuthoritativeCommand,
  GameState,
  OrderId,
  PlayerId,
} from "../../../src/game/index.ts";
import {
  AuthoritativeGameService,
  InMemoryMultiplayerStore,
  projectPublicGameState,
} from "../../../src/multiplayer/index.ts";
import type {
  AuthoritativeGameServiceOptions,
  CommandSuccess,
  ComputerAdvanceSuccess,
  ComputerPolicy,
  InMemoryStoreOptions,
  MultiplayerResult,
  RoomConnection,
  SecurityProvider,
  ServiceLogger,
} from "../../../src/multiplayer/index.ts";
import { buildState, type StateSpec } from "../engine/support/fixtures.ts";

/** Keys sorted recursively, so the hash never depends on object key order (as jsonb). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export class TestSecurity implements SecurityProvider {
  private sequence = 0;

  constructor(private readonly seedBase = 161_000) {}

  randomId(): string {
    this.sequence += 1;
    return `00000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`;
  }

  randomRoomCode(): string {
    this.sequence += 1;
    return `V${String(this.sequence).padStart(5, "0")}`;
  }

  randomSeatToken(): string {
    this.sequence += 1;
    return `v161-seat-token-${String(this.sequence).padStart(32, "0")}`;
  }

  randomSeed(): number {
    this.sequence += 1;
    return this.seedBase + this.sequence;
  }

  async hashSecret(value: string): Promise<string> {
    return `secret:${value}`;
  }

  async hashJson(value: unknown): Promise<string> {
    return createHash("sha256").update(canonicalJson(value)).digest("hex");
  }
}

/** A logger that records instead of printing; the service's only server-side channel. */
export class RecordingLogger implements ServiceLogger {
  readonly entries: Array<{ message: string; context: Record<string, string | number | boolean> }> = [];

  error(message: string, context: Record<string, string | number | boolean>): void {
    this.entries.push({ message, context });
  }
}

export function valueOf<T>(result: MultiplayerResult<T>): T {
  expect(result.ok, result.ok ? undefined : JSON.stringify(result.error)).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

export interface HarnessOptions {
  humans?: number;
  computers?: number;
  service?: AuthoritativeGameServiceOptions;
  store?: InMemoryStoreOptions;
  seedBase?: number;
}

export interface Harness {
  service: AuthoritativeGameService;
  store: InMemoryMultiplayerStore;
  security: TestSecurity;
  logger: RecordingLogger;
  /** Human seats in seat order; the host first. */
  humans: RoomConnection[];
  host: RoomConnection;
  roomId: string;
  roomCode: string;
  /** The latest response known to the test (a human command, the start or a seed). */
  revision: number;
  commandSequence: number;
}

export function nextCommandId(harness: Harness, group = "9000"): string {
  harness.commandSequence += 1;
  return `00000000-0000-4000-${group}-${String(harness.commandSequence).padStart(12, "0")}`;
}

/** A lobby with `humans` human seats (the host first) and `computers` computer seats. */
export async function lobby(options: HarnessOptions = {}): Promise<Harness> {
  const security = new TestSecurity(options.seedBase);
  const store = new InMemoryMultiplayerStore(options.store ?? {});
  const logger = new RecordingLogger();
  const service = new AuthoritativeGameService(store, security, { logger, ...options.service });
  const host = valueOf(await service.createRoom({ displayName: "Host", authUserId: "auth-host" }));
  const harness: Harness = {
    service,
    store,
    security,
    logger,
    humans: [host],
    host,
    roomId: host.room.id,
    roomCode: host.room.code,
    revision: 0,
    commandSequence: 0,
  };
  for (let index = 1; index < (options.humans ?? 2); index += 1) {
    harness.humans.push(
      valueOf(await service.joinRoom({ roomCode: host.room.code, displayName: `Guest ${index}`, authUserId: `auth-guest-${index}` })),
    );
  }
  for (let index = 0; index < (options.computers ?? 0); index += 1) {
    valueOf(await service.addComputerSeat({ roomCode: host.room.code, seatToken: host.seatToken, commandId: nextCommandId(harness, "9100") }));
  }
  return harness;
}

export async function started(options: HarnessOptions = {}): Promise<{ harness: Harness; start: CommandSuccess }> {
  const harness = await lobby(options);
  const start = valueOf(
    await harness.service.startGame({ roomCode: harness.roomCode, seatToken: harness.host.seatToken, commandId: nextCommandId(harness, "9200") }),
  );
  harness.revision = start.revision;
  return { harness, start };
}

export function connectionFor(harness: Harness, playerId: PlayerId): RoomConnection {
  const connection = harness.humans.find((candidate) => candidate.seat.playerId === playerId);
  if (connection === undefined) throw new Error(`No human seat ${playerId}`);
  return connection;
}

export async function tryCommand(
  harness: Harness,
  playerId: PlayerId,
  command: unknown,
  expectedRevision = harness.revision,
  commandId = nextCommandId(harness),
): Promise<MultiplayerResult<CommandSuccess>> {
  const connection = connectionFor(harness, playerId);
  const result = await harness.service.executeCommand({
    roomCode: harness.roomCode,
    seatToken: connection.seatToken,
    commandId,
    expectedRevision,
    command,
  });
  if (result.ok) harness.revision = Math.max(harness.revision, result.value.revision);
  return result;
}

export async function command(
  harness: Harness,
  playerId: PlayerId,
  action: AuthoritativeCommand,
  expectedRevision = harness.revision,
): Promise<CommandSuccess> {
  return valueOf(await tryCommand(harness, playerId, action, expectedRevision));
}

export async function advance(
  harness: Harness,
  expectedRevision = harness.revision,
  playerId: PlayerId = harness.host.seat.playerId,
): Promise<MultiplayerResult<ComputerAdvanceSuccess>> {
  const result = await harness.service.advanceComputerTurns({
    roomCode: harness.roomCode,
    seatToken: connectionFor(harness, playerId).seatToken,
    expectedRevision,
  });
  if (result.ok) harness.revision = Math.max(harness.revision, result.value.revision);
  return result;
}

export async function headState(harness: Harness): Promise<GameState> {
  const head = await harness.store.loadHead(harness.roomId);
  if (head === null) throw new Error("No authoritative head");
  return head.state;
}

/**
 * Commits `build(...)` as the next authoritative head, the way the V1.4 suites seeded
 * scenarios: a test-only transition with no events. The seeded state keeps the room's game
 * ID, the next revision and the persisted event count.
 */
export async function seedState(harness: Harness, build: (gameId: string, revision: number) => GameState): Promise<GameState> {
  const previous = await harness.store.loadHead(harness.roomId);
  if (previous === null) throw new Error("No authoritative head to replace");
  const revision = previous.revision + 1;
  const state = build(harness.roomId, revision);
  state.gameId = harness.roomId;
  state.revision = revision;
  state.eventSequence = previous.state.eventSequence;
  const nextHead = { ...previous, revision, state, stateHash: await harness.security.hashJson(state) };
  const publicState = projectPublicGameState(state);
  const commandId = nextCommandId(harness, "9800");
  const committed = await harness.store.commitTransition({
    roomId: harness.roomId,
    commandId,
    actorId: harness.host.seat.playerId,
    expectedRevision: previous.revision,
    command: { type: "TEST_SEED_V161_STATE" },
    previousHead: previous,
    nextHead,
    fullEvents: [],
    publicEvents: [],
    publicState,
    response: {
      commandId,
      room: { ...harness.host.room, status: "playing", latestRevision: revision },
      actorId: harness.host.seat.playerId,
      revision,
      game: publicState,
      events: [],
      ownPrivateView: null,
      ownSecrets: [],
    },
    privateSubmission: null,
  });
  if (committed.status !== "ok") throw new Error(`Unable to seed state: ${committed.status}`);
  harness.revision = revision;
  return state;
}

/** `buildState` with seat IDs P1…Pn (the service's player IDs). */
export function seatState(playerCount: number, spec: Omit<StateSpec, "players"> & { players?: StateSpec["players"] } = {}): GameState {
  const players =
    spec.players ?? Array.from({ length: playerCount }, (_, seat) => ({ id: `P${seat + 1}`, displayName: `Seat ${seat + 1}` }));
  return buildState({ ...spec, players });
}

/** A seeded head whose Firing Phase has just opened through the production flow. */
export function openedFiringState(spec: StateSpec, seed = 1): GameState {
  const state = buildState(spec);
  openFiringPhase(state, { rng: new SeededRandom(seed), events: [], flow: FLOW });
  return state;
}

/** Every Order ID currently in any seat's hand. */
export function allHandOrderIds(state: GameState): OrderId[] {
  return state.playerOrder.flatMap((playerId) => state.hidden.orderHands[playerId] ?? []);
}

/**
 * A minimal always-legal command for `view.viewerId`, independent of the legal-action
 * enumerator: every phase's progress-guarantee exit (DESIGN §3.6), with Canal Wharf as the
 * worker action. Routing and race tests use it so they test the service, not a policy.
 */
export function exitCommand(view: ActorView): AuthoritativeCommand | null {
  const game = view.game;
  const me = game.players[view.viewerId];
  if (me === undefined) return null;
  const phase = game.phase;
  switch (phase.type) {
    case "setup_kiln_selection": {
      const taken = new Set(game.playerOrder.map((id) => game.players[id]?.kilnId ?? null));
      const kilnId = KILN_IDS.find((id) => !taken.has(id));
      return kilnId === undefined ? null : { type: "SELECT_KILN", kilnId };
    }
    case "round_start_setters_mark":
      return { type: "PLACE_SETTERS_MARK", spaceId: null };
    case "work_turn": {
      if (phase.step.kind === "after_action") return { type: "END_TURN" };
      if (phase.step.kind !== "before_action") return null;
      const workerId = Object.keys(me.workers)
        .sort()
        .find((id) => me.workers[id]?.placement === null);
      return workerId === undefined ? null : { type: "PLACE_CANAL_WHARF", workerId };
    }
    case "firing_contributions":
      return { type: "SUBMIT_CONTRIBUTION", windowId: phase.windowId, card: "TEND" };
    case "firing_test_pieces":
      return phase.awaiting === "decision" ? { type: "TEST_PIECES_DECIDE", peek: false } : { type: "TEST_PIECES_BURY", bury: false };
    case "firing_heat_markers": {
      const faceDown = Object.values(game.ceramics).some(
        (ceramic) => ceramic.stage === "loaded" && ceramic.ownerId === view.viewerId && ceramic.heatMarker?.faceDown === true,
      );
      return faceDown ? { type: "RESOLVE_HEAT_MARKERS", ownMarker: "return" } : { type: "RESOLVE_HEAT_MARKERS" };
    }
    case "firing_heat_adjustment":
      return { type: "RESOLVE_JUN", adjustment: null };
    case "firing_second_firing_choice":
      return { type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: null };
    case "firing_after_quality":
      return { type: "END_AFTER_QUALITY" };
    case "firing_salvage":
      return { type: "SALVAGE_FLAWED", ceramicId: null };
    case "orders":
      return { type: "END_ORDER_TURN" };
    case "cleanup_hand_limit": {
      const limit = me.techs.some((tech) => tech.id === "T10") ? TECHS.T10.params.handLimit : GAME_CONFIG.handLimit.base;
      const hand = view.own.orderHand;
      return { type: "DISCARD_TO_HAND_LIMIT", orderIds: hand.slice(0, Math.max(0, hand.length - limit)) };
    }
    case "finished":
      return null;
  }
}

/** A computer policy that always takes `exitCommand`, unless a phase is overridden. */
export function scriptedPolicy(overrides: Partial<Record<string, (view: ActorView) => AuthoritativeCommand | null>> = {}): ComputerPolicy {
  return {
    version: "rules-v1.6.2-scripted-001",
    label: "Scripted",
    chooseCommand(view) {
      const override = overrides[view.game.phase.type];
      return override !== undefined ? override(view) : exitCommand(view);
    },
  };
}
