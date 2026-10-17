/**
 * The server-authoritative V1.6.2 game service (DESIGN §4.6; ENGINE_V1.6.2_DELTA.md §9).
 *
 * - Every command is shape-checked by `parseCommand` before the service branches on it.
 *   Contributions go through `submitContribution` with a `PrivateFiringState` rebuilt from
 *   the stored private submissions (card and Fuel Ledger commitment); everything else
 *   through `applyAction`. The engine validates on the actor's view only.
 * - Who acts comes from `decisionPrompt(state)` alone (DESIGN §3.4), for humans and for
 *   computer seats, in `single`, `parallel` and `simultaneous_secret` windows.
 * - Responses carry the public projection and public events for everyone, plus the
 *   requesting seat's own `PrivatePlayerView` and secret event payloads.
 * - Computer policy failures never leak: the cause is logged server-side and the
 *   response carries a fixed message (DESIGN §4.5).
 * - Rooms and saves of any other rules version, schema or rules fingerprint are refused,
 *   never reinterpreted.
 */

import {
  SeededRandom,
  actorViewOf,
  applyAction,
  createGame,
  decisionPrompt,
  isGameRuleError,
  parseCommand,
  projectPrivateView,
  rulesFingerprint,
  submitContribution,
} from "../game/index.ts";
import type {
  AuthoritativeCommand,
  EngineOptions,
  GameAction,
  GameEvent,
  GameRuleError,
  GameState,
  PlayerId,
  PlayerView,
  PrivateFiringState,
  PrivatePlayerView,
  SubmitContributionCommand,
} from "../game/index.ts";
import { fallbackComputerCommands, selectFirstLegalComputerCommand } from "./computerFallback.ts";
import { CANONICAL_COMPUTER_POLICY } from "./computerPolicy.ts";
import { STRATEGIC_COMPUTER_POLICY } from "./computerPlayer.ts";
import type { ComputerPolicy, ComputerSeatContext } from "./computerPolicy.ts";
import { ownSecretRecords, projectPublicEvents, projectPublicGameState } from "./projection.ts";
import type {
  AuthenticatedSeat,
  CommitTransitionInput,
  MultiplayerStore,
  PrivateCommitInput,
  StoreFailureCode,
  StoreResult,
} from "./store.ts";
import type {
  AddComputerSeatRequest,
  AdvanceComputersRequest,
  AuthoritativeHead,
  CommandRequest,
  CommandSuccess,
  ComputerAdvanceSuccess,
  CreateRoomRequest,
  EndSessionRequest,
  EndSessionSuccess,
  JoinRoomRequest,
  ListPrivateEventsRequest,
  LobbySeatUpdateSuccess,
  MultiplayerError,
  MultiplayerErrorCode,
  MultiplayerResult,
  PrivateEventRecord,
  PublicRoom,
  PublicSeat,
  ReconnectResult,
  RemoveComputerSeatRequest,
  RoomConnection,
  SecurityProvider,
  StartGameRequest,
  StoredRoom,
  StoredSeat,
} from "./types.ts";

export const CURRENT_RULES_VERSION = "1.6.2" as const;
export const CURRENT_SCHEMA_VERSION = 7 as const;

const MAX_DISPLAY_NAME_LENGTH = 40;
const ROOM_CODE_ATTEMPTS = 8;
const CONTRIBUTION_CAS_ATTEMPTS = 8;
/** DESIGN §4.6: a parallel-window commit conflict is retried at most 3 times. */
const PARALLEL_WINDOW_RETRIES = 3;
const DEFAULT_MAX_COMPUTER_ACTIONS_PER_REQUEST = 24;
const COMPUTER_CAS_ATTEMPTS = 8;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server-side diagnostics. Never part of a response. */
export interface ServiceLogger {
  error(message: string, context: Record<string, string | number | boolean>): void;
}

const CONSOLE_LOGGER: ServiceLogger = {
  error(message, context) {
    console.error(message, context);
  },
};

export interface AuthoritativeGameServiceOptions {
  /** The policy stamped on new computer seats and used for any seat without a known one
   * (default: the strategic V1.6.2 policy, `computerPlayer.ts`). */
  computerPolicy?: ComputerPolicy;
  /** Further policies, matched by a seat's stored `aiPolicyVersion` (default: the canonical
   * policy, so seats stamped with it keep it). */
  additionalComputerPolicies?: readonly ComputerPolicy[];
  /** The safety net tried after the policy (default `fallbackComputerCommands`). */
  fallbackCommands?: (view: PlayerView) => readonly unknown[];
  logger?: ServiceLogger;
  /** Run `assertInvariants` after every engine command (the service's own
   * `KILN_ENGINE_INVARIANTS=1`; the engine reads no environment). */
  checkInvariants?: boolean;
  maxComputerActionsPerRequest?: number;
}

function error(
  code: MultiplayerErrorCode,
  message: string,
  currentRevision: number | null = null,
  details: MultiplayerError["details"] = {},
): MultiplayerError {
  return { code, message, details, currentRevision };
}

function failed<T>(value: MultiplayerError): MultiplayerResult<T> {
  return { ok: false, error: value };
}

function publicRoom(room: StoredRoom): PublicRoom {
  return {
    id: room.id,
    code: room.code,
    status: room.status,
    hostSeatId: room.hostSeatId,
    rulesVersion: room.rulesVersion,
    latestRevision: room.latestRevision,
    endedAt: room.endedAt ?? null,
    endedByPlayerId: room.endedByPlayerId ?? null,
  };
}

function publicSeat(seat: StoredSeat): PublicSeat {
  return {
    seatId: seat.seatId,
    roomId: seat.roomId,
    playerId: seat.playerId,
    seatIndex: seat.seatIndex,
    displayName: seat.displayName,
    colour: seat.colour,
    isHost: seat.isHost,
    isComputer: seat.isComputer ?? false,
    aiPolicyVersion: seat.aiPolicyVersion ?? null,
  };
}

function roomAfterTransition(room: StoredRoom, head: AuthoritativeHead): PublicRoom {
  return {
    ...publicRoom(room),
    status: head.state.phase.type === "finished" ? "finished" : "playing",
    latestRevision: head.revision,
  };
}

function validDisplayName(displayName: string): boolean {
  const length = displayName.trim().length;
  return length > 0 && length <= MAX_DISPLAY_NAME_LENGTH;
}

function gameFailure(ruleError: GameRuleError, revision: number | null): MultiplayerError {
  return error(ruleError.code, ruleError.message, revision, ruleError.details);
}

/** Only schema-7 V1.6.2 saves continue; anything older (V1.6.1 schema 6 included) is refused, never migrated (DIG). */
function gameCompatibilityError(state: GameState, revision: number): MultiplayerError | null {
  if (state.schemaVersion === CURRENT_SCHEMA_VERSION && state.rulesVersion === CURRENT_RULES_VERSION) return null;
  return error(
    "UNSUPPORTED_RULES_VERSION",
    "This saved game uses an older rules or save format and cannot continue under V1.6.2. Please create a new room.",
    revision,
    { schemaVersion: String((state as { schemaVersion?: unknown }).schemaVersion), rulesVersion: String((state as { rulesVersion?: unknown }).rulesVersion) },
  );
}

function mapStoreFailure(code: StoreFailureCode, revision: number | null = null): MultiplayerError {
  switch (code) {
    case "room_code_conflict":
      return error("ROOM_CODE_CONFLICT", "The generated room code is already in use.");
    case "room_not_found":
      return error("ROOM_NOT_FOUND", "The room does not exist.");
    case "room_full":
      return error("ROOM_FULL", "The room already has four seats.");
    case "game_already_started":
      return error("GAME_ALREADY_STARTED", "The game has already started.", revision);
    case "not_enough_players":
      return error("NOT_ENOUGH_PLAYERS", "At least two players are required to start.");
    case "seat_already_joined":
      return error("INVALID_REQUEST", "This authenticated account already has a seat in the room.");
    case "host_only":
      return error("HOST_ONLY", "Only the host may do this.", revision);
    case "session_not_active":
      return error("SESSION_ENDED", "This room no longer accepts changes under the current rules.", revision);
    case "duplicate":
      return error("DUPLICATE_COMMAND", "This command ID was already used.", revision);
    case "stale":
      return error("STALE_REVISION", "The authoritative game revision has changed.", revision);
    case "private_duplicate":
      return error("CONTRIBUTION_ALREADY_SUBMITTED", "This seat already submitted a Contribution in this window.", revision);
    case "not_computer_seat":
      return error("INVALID_REQUEST", "Only computer seats can be removed from the lobby.", revision);
  }
}

/** Rebuilt `PrivateFiringState` for the state's open Contribution window, or an empty one. */
function emptyPrivateFiring(state: GameState): PrivateFiringState {
  return { gameId: state.gameId, windowId: null, submissions: {} };
}

/** True when the seat is one of the game's players (not a lobby seat added later). */
function seated(state: GameState, playerId: PlayerId): boolean {
  return state.playerOrder.includes(playerId);
}

function privateViewOf(state: GameState, playerId: PlayerId, privateFiring: PrivateFiringState): PrivatePlayerView | null {
  return seated(state, playerId) ? projectPrivateView(state, playerId, privateFiring) : null;
}

/**
 * Whether a command based on `expectedRevision` may be validated against the current head
 * (DESIGN §4.6). Strict equality, except in a `parallel` window (`firing_salvage`,
 * `cleanup_hand_limit`): choices there touch only the actor's own ceramics or hand, so a
 * command based on any revision since the window opened is validated against the newer
 * head while the actor is still pending.
 */
function revisionAcceptance(
  state: GameState,
  expectedRevision: number,
  actorId: PlayerId,
): { ok: true; tolerant: boolean } | { ok: false } {
  const prompt = decisionPrompt(state);
  const phase = state.phase;
  const window =
    prompt.mode === "parallel" && (phase.type === "firing_salvage" || phase.type === "cleanup_hand_limit") ? phase : null;
  if (expectedRevision === state.revision) {
    return { ok: true, tolerant: window !== null && prompt.actorIds.includes(actorId) };
  }
  if (
    window !== null &&
    window.openedAtRevision <= expectedRevision &&
    expectedRevision < state.revision &&
    prompt.actorIds.includes(actorId)
  ) {
    return { ok: true, tolerant: true };
  }
  return { ok: false };
}

interface AppliedCommand {
  command: AuthoritativeCommand;
  rng: SeededRandom;
  state: GameState;
  events: GameEvent[];
  /** The private state after the command (contributions only). */
  privateState: PrivateFiringState | null;
  privateSubmission: PrivateCommitInput | null;
}

type Application = { ok: true; value: AppliedCommand } | { ok: false; error: GameRuleError };

export class AuthoritativeGameService {
  private readonly defaultPolicy: ComputerPolicy;
  private readonly policies: readonly ComputerPolicy[];
  private readonly fallbackCommands: (view: PlayerView) => readonly unknown[];
  private readonly logger: ServiceLogger;
  private readonly engineOptions: EngineOptions;
  private readonly maxComputerActions: number;

  constructor(
    private readonly store: MultiplayerStore,
    private readonly security: SecurityProvider,
    options: AuthoritativeGameServiceOptions = {},
  ) {
    this.defaultPolicy = options.computerPolicy ?? STRATEGIC_COMPUTER_POLICY;
    this.policies = [this.defaultPolicy, ...(options.additionalComputerPolicies ?? [CANONICAL_COMPUTER_POLICY])];
    this.fallbackCommands = options.fallbackCommands ?? fallbackComputerCommands;
    this.logger = options.logger ?? CONSOLE_LOGGER;
    this.engineOptions = options.checkInvariants === true ? { checkInvariants: true } : {};
    this.maxComputerActions = options.maxComputerActionsPerRequest ?? DEFAULT_MAX_COMPUTER_ACTIONS_PER_REQUEST;
  }

  // ── Lobby ────────────────────────────────────────────────────────────────────────

  async createRoom(request: CreateRoomRequest): Promise<MultiplayerResult<RoomConnection>> {
    const displayName = request.displayName.trim();
    if (!validDisplayName(displayName)) {
      return failed(error("INVALID_REQUEST", "Display name must contain 1–40 characters."));
    }
    for (let attempt = 0; attempt < ROOM_CODE_ATTEMPTS; attempt += 1) {
      const roomId = this.security.randomId();
      const seatId = this.security.randomId();
      const seatToken = this.security.randomSeatToken();
      const tokenHash = await this.security.hashSecret(seatToken);
      const code = this.security.randomRoomCode().toUpperCase();
      const room: StoredRoom = {
        id: roomId,
        code,
        status: "lobby",
        hostSeatId: seatId,
        rulesVersion: CURRENT_RULES_VERSION,
        contentVersion: CURRENT_RULES_VERSION,
        contentDigest: rulesFingerprint(),
        latestRevision: 0,
        endedAt: null,
        endedByPlayerId: null,
      };
      const hostSeat: StoredSeat = {
        seatId,
        roomId,
        playerId: "P1",
        seatIndex: 0,
        displayName,
        colour: "cinnabar",
        isHost: true,
        isComputer: false,
        aiPolicyVersion: null,
        authUserId: request.authUserId,
        aiSeed: null,
        aiCreatedCommandId: null,
      };
      const created = await this.store.createRoom({ room, hostSeat, tokenHash });
      if (created.status === "error" && created.code === "room_code_conflict") continue;
      if (created.status !== "ok") {
        return failed(mapStoreFailure(created.status === "duplicate" ? "duplicate" : created.code));
      }
      const seats = await this.store.getSeats(roomId);
      return {
        ok: true,
        value: {
          room: publicRoom(created.value.room),
          seats: seats.map(publicSeat),
          seat: publicSeat(created.value.seat),
          seatToken,
          game: null,
          ownPrivateView: null,
          ownSecrets: [],
        },
      };
    }
    return failed(error("ROOM_CODE_CONFLICT", "Unable to allocate a unique room code."));
  }

  async joinRoom(request: JoinRoomRequest): Promise<MultiplayerResult<RoomConnection>> {
    const displayName = request.displayName.trim();
    const roomCode = request.roomCode.trim().toUpperCase();
    if (!validDisplayName(displayName) || roomCode.length === 0) {
      return failed(error("INVALID_REQUEST", "A room code and 1–40 character display name are required."));
    }
    const seatToken = this.security.randomSeatToken();
    const tokenHash = await this.security.hashSecret(seatToken);
    const joined = await this.store.joinRoom({
      roomCode,
      seatId: this.security.randomId(),
      displayName,
      colour: "",
      authUserId: request.authUserId,
      tokenHash,
    });
    if (joined.status !== "ok") {
      return failed(mapStoreFailure(joined.status === "duplicate" ? "duplicate" : joined.code));
    }
    const seats = await this.store.getSeats(joined.value.room.id);
    return {
      ok: true,
      value: {
        room: publicRoom(joined.value.room),
        seats: seats.map(publicSeat),
        seat: publicSeat(joined.value.seat),
        seatToken,
        game: null,
        ownPrivateView: null,
        ownSecrets: [],
      },
    };
  }

  /**
   * Restores a seat without changing seat or state: the public projection, the seat's own
   * private view (its sealed Contribution and Fuel Ledger commitment included, rebuilt from
   * the stored submissions) and every secret addressed to it, such as its setup deal.
   */
  async reconnect(request: { roomCode: string; seatToken: string }): Promise<MultiplayerResult<ReconnectResult>> {
    const authenticated = await this.authenticate(request.roomCode, request.seatToken);
    if (!authenticated.ok) return authenticated;
    const { room, seat, tokenHash } = authenticated.value;
    const [seats, head] = await Promise.all([this.store.getSeats(room.id), this.store.loadHead(room.id)]);
    if (head === null) {
      return {
        ok: true,
        value: {
          room: publicRoom(room),
          seats: seats.map(publicSeat),
          seat: publicSeat(seat),
          game: null,
          ownPrivateView: null,
          ownSecrets: [],
        },
      };
    }
    const compatibilityError = gameCompatibilityError(head.state, head.revision);
    if (compatibilityError !== null) return failed(compatibilityError);
    const [privateFiring, ownSecrets] = await Promise.all([
      this.privateFiringState(room.id, head.state),
      this.store.listPrivateEvents(room.id, seat.playerId, tokenHash, 0),
    ]);
    return {
      ok: true,
      value: {
        room: publicRoom(room),
        seats: seats.map(publicSeat),
        seat: publicSeat(seat),
        game: projectPublicGameState(head.state),
        ownPrivateView: privateViewOf(head.state, seat.playerId, privateFiring),
        ownSecrets,
      },
    };
  }

  /** The requesting seat's secret event payloads after `afterSequence` (DESIGN §4.6). */
  async listPrivateEvents(request: ListPrivateEventsRequest): Promise<MultiplayerResult<PrivateEventRecord[]>> {
    if (!Number.isInteger(request.afterSequence) || request.afterSequence < 0) {
      return failed(error("INVALID_REQUEST", "A non-negative afterSequence is required."));
    }
    const authenticated = await this.authenticate(request.roomCode, request.seatToken);
    if (!authenticated.ok) return authenticated;
    const { room, seat, tokenHash } = authenticated.value;
    return { ok: true, value: await this.store.listPrivateEvents(room.id, seat.playerId, tokenHash, request.afterSequence) };
  }

  async addComputerSeat(request: AddComputerSeatRequest): Promise<MultiplayerResult<LobbySeatUpdateSuccess>> {
    if (!UUID_PATTERN.test(request.commandId)) {
      return failed(error("INVALID_REQUEST", "commandId must be a UUID."));
    }
    const authenticated = await this.authenticate(request.roomCode, request.seatToken);
    if (!authenticated.ok) return authenticated;
    const { room, seat } = authenticated.value;
    if (!seat.isHost || room.hostSeatId !== seat.seatId) {
      return failed(error("HOST_ONLY", "Only the host may add a computer player.", room.latestRevision));
    }
    if (room.status !== "lobby") {
      return failed(error("GAME_ALREADY_STARTED", "Computer players can only be changed in the lobby.", room.latestRevision));
    }
    const currentSeats = await this.store.getSeats(room.id);
    const usedNumbers = new Set(
      currentSeats.flatMap((currentSeat) => {
        const match = /^Computer (\d+)$/.exec(currentSeat.displayName);
        return match?.[1] === undefined ? [] : [Number(match[1])];
      }),
    );
    const computerNumber = [1, 2, 3, 4].find((number) => !usedNumbers.has(number)) ?? 4;
    const added = await this.store.addComputerSeat({
      roomId: room.id,
      hostSeatId: seat.seatId,
      seatId: this.security.randomId(),
      displayName: `Computer ${computerNumber}`,
      aiSeed: this.security.randomSeed() >>> 0,
      policyVersion: this.defaultPolicy.version,
      commandId: request.commandId,
    });
    if (added.status !== "ok") {
      return failed(mapStoreFailure(added.status === "duplicate" ? "duplicate" : added.code, room.latestRevision));
    }
    const seats = await this.store.getSeats(room.id);
    return { ok: true, value: { room: publicRoom(room), seats: seats.map(publicSeat) } };
  }

  async removeComputerSeat(request: RemoveComputerSeatRequest): Promise<MultiplayerResult<LobbySeatUpdateSuccess>> {
    if (!UUID_PATTERN.test(request.computerSeatId)) {
      return failed(error("INVALID_REQUEST", "A valid computer seat ID is required."));
    }
    const authenticated = await this.authenticate(request.roomCode, request.seatToken);
    if (!authenticated.ok) return authenticated;
    const { room, seat } = authenticated.value;
    if (!seat.isHost || room.hostSeatId !== seat.seatId) {
      return failed(error("HOST_ONLY", "Only the host may remove a computer player.", room.latestRevision));
    }
    if (room.status !== "lobby") {
      return failed(error("GAME_ALREADY_STARTED", "Computer players can only be changed in the lobby.", room.latestRevision));
    }
    const removed = await this.store.removeComputerSeat({
      roomId: room.id,
      hostSeatId: seat.seatId,
      computerSeatId: request.computerSeatId,
    });
    if (removed.status !== "ok") {
      return failed(mapStoreFailure(removed.status === "duplicate" ? "duplicate" : removed.code, room.latestRevision));
    }
    const seats = await this.store.getSeats(room.id);
    return { ok: true, value: { room: publicRoom(room), seats: seats.map(publicSeat) } };
  }

  /**
   * Creates the game and persists `createGame`'s events — including each seat's secret
   * setup deal — so `public_states.event_sequence` equals the persisted event count.
   */
  async startGame(request: StartGameRequest): Promise<MultiplayerResult<CommandSuccess>> {
    if (!UUID_PATTERN.test(request.commandId)) {
      return failed(error("INVALID_REQUEST", "commandId must be a UUID."));
    }
    const authenticated = await this.authenticate(request.roomCode, request.seatToken);
    if (!authenticated.ok) return authenticated;
    const { room, seat } = authenticated.value;
    const prior = await this.store.getProcessed(room.id, request.commandId);
    if (prior !== null) return this.processedResult(prior.actorId, seat.playerId, prior.response);
    if (room.status === "abandoned" || room.status === "finished") {
      return failed(error("SESSION_ENDED", "This game session has already ended.", room.latestRevision));
    }
    if (!seat.isHost || room.hostSeatId !== seat.seatId) {
      return failed(error("HOST_ONLY", "Only the host may start the game."));
    }
    if (room.status !== "lobby") {
      return failed(error("GAME_ALREADY_STARTED", "The game has already started.", room.latestRevision));
    }
    const seats = (await this.store.getSeats(room.id)).sort((left, right) => left.seatIndex - right.seatIndex);
    if (seats.length < 2) {
      return failed(error("NOT_ENOUGH_PLAYERS", "At least two players are required to start."));
    }
    const rootSeed = this.security.randomSeed() >>> 0;
    const rng = new SeededRandom(rootSeed);
    const created = createGame(
      {
        gameId: room.id,
        players: seats.map((currentSeat) => ({ id: currentSeat.playerId, displayName: currentSeat.displayName })),
      },
      rng,
      this.engineOptions,
    );
    if (!created.ok) return failed(gameFailure(created.error, room.latestRevision));
    const head: AuthoritativeHead = {
      roomId: room.id,
      revision: created.state.revision,
      state: created.state,
      rngState: rng.getState(),
      rootSeed,
      stateHash: await this.security.hashJson(created.state),
    };
    const game = projectPublicGameState(created.state);
    const publicEvents = projectPublicEvents(created.events);
    const response: CommandSuccess = {
      commandId: request.commandId,
      room: roomAfterTransition(room, head),
      actorId: seat.playerId,
      revision: head.revision,
      game,
      events: publicEvents,
      ownPrivateView: privateViewOf(created.state, seat.playerId, emptyPrivateFiring(created.state)),
      ownSecrets: ownSecretRecords(created.events, seat.playerId, {
        roomId: room.id,
        commandId: request.commandId,
        actorId: seat.playerId,
        revision: head.revision,
        previousEventSequence: 0,
      }),
    };
    const committed = await this.store.commitStart({
      roomId: room.id,
      commandId: request.commandId,
      actorId: seat.playerId,
      head,
      publicState: game,
      fullEvents: created.events,
      publicEvents,
      response,
    });
    return this.commitResult(committed, seat.playerId, room.latestRevision);
  }

  async endSession(request: EndSessionRequest): Promise<MultiplayerResult<EndSessionSuccess>> {
    if (!UUID_PATTERN.test(request.commandId)) {
      return failed(error("INVALID_REQUEST", "commandId must be a UUID."));
    }
    const authenticated = await this.authenticate(request.roomCode, request.seatToken);
    if (!authenticated.ok) return authenticated;
    const { room, seat } = authenticated.value;
    if (!seat.isHost || room.hostSeatId !== seat.seatId) {
      return failed(error("HOST_ONLY", "Only the host may end this session.", room.latestRevision));
    }
    if (room.status === "finished") {
      return failed(error("SESSION_ENDED", "This game session has already finished.", room.latestRevision));
    }
    const ended = await this.store.endSession({
      roomId: room.id,
      hostSeatId: seat.seatId,
      actorId: seat.playerId,
      commandId: request.commandId,
    });
    if (ended.status !== "ok") {
      return failed(mapStoreFailure(ended.status === "duplicate" ? "duplicate" : ended.code, room.latestRevision));
    }
    return { ok: true, value: { commandId: request.commandId, room: publicRoom(ended.value) } };
  }

  // ── Commands ─────────────────────────────────────────────────────────────────────

  async executeCommand(request: CommandRequest): Promise<MultiplayerResult<CommandSuccess>> {
    if (
      typeof request.commandId !== "string" ||
      !UUID_PATTERN.test(request.commandId) ||
      !Number.isInteger(request.expectedRevision) ||
      request.expectedRevision < 0
    ) {
      return failed(error("INVALID_REQUEST", "A commandId and non-negative expectedRevision are required."));
    }
    const authenticated = await this.authenticate(request.roomCode, request.seatToken);
    if (!authenticated.ok) return authenticated;
    const { room, seat } = authenticated.value;
    if (room.status === "abandoned" || room.status === "finished") {
      // A replayed accepted command — including the one that ended the game — returns its
      // stored response to the same seat and commits nothing; only new IDs are refused.
      const prior = await this.store.getProcessed(room.id, request.commandId);
      if (prior !== null) return this.processedResult(prior.actorId, seat.playerId, prior.response);
      return failed(error("SESSION_ENDED", "This game session has ended and no longer accepts actions.", room.latestRevision));
    }
    // DESIGN §2.5: shape-check every command, Contributions included, before branching.
    const parsed = parseCommand(request.command);
    if (isGameRuleError(parsed)) return failed(gameFailure(parsed, room.latestRevision));
    if (parsed.type === "SUBMIT_CONTRIBUTION") {
      return this.executeContribution(authenticated.value, request, parsed);
    }
    return this.executePublicCommand(authenticated.value, request, parsed);
  }

  private async executePublicCommand(
    authenticated: AuthenticatedSeat,
    request: CommandRequest,
    command: GameAction,
  ): Promise<MultiplayerResult<CommandSuccess>> {
    const { room, seat } = authenticated;
    for (let attempt = 0; attempt <= PARALLEL_WINDOW_RETRIES; attempt += 1) {
      const prior = await this.store.getProcessed(room.id, request.commandId);
      if (prior !== null) return this.processedResult(prior.actorId, seat.playerId, prior.response);
      const head = await this.store.loadHead(room.id);
      if (head === null) return failed(error("GAME_NOT_STARTED", "The game has not started."));
      const compatibilityError = gameCompatibilityError(head.state, head.revision);
      if (compatibilityError !== null) return failed(compatibilityError);
      const acceptance = revisionAcceptance(head.state, request.expectedRevision, seat.playerId);
      if (!acceptance.ok) {
        return failed(error("STALE_REVISION", "The authoritative game revision has changed.", head.revision));
      }
      const applied = this.apply(head, emptyPrivateFiring(head.state), seat.playerId, command);
      if (!applied.ok) return failed(gameFailure(applied.error, head.revision));
      const committed = await this.commit(room, head, applied.value, request.commandId, seat.playerId, true);
      if (committed.status === "error" && committed.code === "stale" && acceptance.tolerant) continue;
      return this.commitResult(committed, seat.playerId, head.revision);
    }
    const current = await this.store.loadHead(room.id);
    return failed(error("PERSISTENCE_CONFLICT", "The command could not be committed after concurrent updates.", current?.revision ?? null));
  }

  /**
   * A sealed Contribution. Compare-and-swap on the head and on the window: the engine
   * rejects a submission for any window but the open one (`PRIVATE_WINDOW_MISMATCH`), the
   * store refuses a second submission per seat and window, and a concurrent commit is
   * retried against the fresh head and the fresh set of stored submissions.
   */
  private async executeContribution(
    authenticated: AuthenticatedSeat,
    request: CommandRequest,
    command: SubmitContributionCommand,
  ): Promise<MultiplayerResult<CommandSuccess>> {
    const { room, seat } = authenticated;
    for (let attempt = 0; attempt < CONTRIBUTION_CAS_ATTEMPTS; attempt += 1) {
      const prior = await this.store.getProcessed(room.id, request.commandId);
      if (prior !== null) return this.processedResult(prior.actorId, seat.playerId, prior.response);
      const head = await this.store.loadHead(room.id);
      if (head === null) return failed(error("GAME_NOT_STARTED", "The game has not started."));
      const compatibilityError = gameCompatibilityError(head.state, head.revision);
      if (compatibilityError !== null) return failed(compatibilityError);
      if (request.expectedRevision > head.revision) {
        return failed(error("STALE_REVISION", "The authoritative game revision has changed.", head.revision));
      }
      const privateState = await this.privateFiringState(room.id, head.state);
      const applied = this.apply(head, privateState, seat.playerId, command);
      if (!applied.ok) return failed(gameFailure(applied.error, head.revision));
      const committed = await this.commit(room, head, applied.value, request.commandId, seat.playerId, true);
      if (committed.status === "error" && (committed.code === "stale" || committed.code === "private_duplicate")) continue;
      return this.commitResult(committed, seat.playerId, head.revision);
    }
    const current = await this.store.loadHead(room.id);
    return failed(error("PERSISTENCE_CONFLICT", "The Contribution could not be committed after concurrent updates.", current?.revision ?? null));
  }

  // ── Computer seats ───────────────────────────────────────────────────────────────

  /**
   * Plays every pending computer decision, routed by `decisionPrompt` alone, until a human
   * must act, the game ends or the per-request cap is reached.
   */
  async advanceComputerTurns(request: AdvanceComputersRequest): Promise<MultiplayerResult<ComputerAdvanceSuccess>> {
    if (!Number.isInteger(request.expectedRevision) || request.expectedRevision < 0) {
      return failed(error("INVALID_REQUEST", "A non-negative expectedRevision is required."));
    }
    const authenticated = await this.authenticate(request.roomCode, request.seatToken);
    if (!authenticated.ok) return authenticated;
    const { room, seat: requestingSeat, tokenHash } = authenticated.value;
    if (room.status === "abandoned" || room.status === "finished") {
      return failed(error("SESSION_ENDED", "This game session has ended.", room.latestRevision));
    }
    let head = await this.store.loadHead(room.id);
    if (head === null) return failed(error("GAME_NOT_STARTED", "The game has not started."));
    {
      const compatibilityError = gameCompatibilityError(head.state, head.revision);
      if (compatibilityError !== null) return failed(compatibilityError);
    }
    if (!this.computerAdvanceAccepted(head.state, request.expectedRevision)) {
      return failed(error("STALE_REVISION", "The authoritative game revision has changed.", head.revision));
    }
    const startingEventSequence = head.state.eventSequence;
    const seats = await this.store.getSeats(room.id);
    const seatsByPlayerId = new Map(seats.map((currentSeat) => [currentSeat.playerId, currentSeat]));
    const publicEvents: ComputerAdvanceSuccess["events"] = [];
    const actorIds: PlayerId[] = [];
    let advancedActions = 0;
    let conflicts = 0;

    while (advancedActions < this.maxComputerActions) {
      if (head.state.phase.type === "finished") break;
      const computerSeat = nextComputerSeat(head.state, seatsByPlayerId);
      if (computerSeat === null) break;

      const decisionHead: AuthoritativeHead = head;
      const privateState = await this.privateFiringState(room.id, decisionHead.state);
      const selection = await this.chooseComputerCommand(decisionHead, privateState, computerSeat);
      if (selection === null) {
        return failed(error("COMPUTER_TURN_FAILED", `${computerSeat.displayName} could not choose an action.`, decisionHead.revision));
      }
      const commandId = this.security.randomId();
      const committed = await this.commit(room, decisionHead, selection, commandId, computerSeat.playerId, false);
      if (
        (committed.status === "error" && (committed.code === "stale" || committed.code === "private_duplicate")) ||
        committed.status === "duplicate"
      ) {
        conflicts += 1;
        if (conflicts >= COMPUTER_CAS_ATTEMPTS) {
          return failed(error("PERSISTENCE_CONFLICT", "Computer turns could not be committed after concurrent updates.", decisionHead.revision));
        }
        const current = await this.store.loadHead(room.id);
        if (current === null) return failed(error("GAME_NOT_STARTED", "The game has not started."));
        const compatibilityError = gameCompatibilityError(current.state, current.revision);
        if (compatibilityError !== null) return failed(compatibilityError);
        head = current;
        continue;
      }
      if (committed.status === "error") return failed(mapStoreFailure(committed.code, decisionHead.revision));
      head = committed.head;
      publicEvents.push(...committed.response.events);
      actorIds.push(computerSeat.playerId);
      advancedActions += 1;
      conflicts = 0;
    }

    const privateFiring = await this.privateFiringState(room.id, head.state);
    const ownSecrets =
      head.state.eventSequence > startingEventSequence
        ? await this.store.listPrivateEvents(room.id, requestingSeat.playerId, tokenHash, startingEventSequence)
        : [];
    const nextSeat = nextComputerSeat(head.state, seatsByPlayerId);
    const stoppedReason: ComputerAdvanceSuccess["stoppedReason"] =
      head.state.phase.type === "finished"
        ? "finished"
        : advancedActions >= this.maxComputerActions && nextSeat !== null
          ? "action_limit"
          : "human_turn";
    return {
      ok: true,
      value: {
        room: roomAfterTransition(room, head),
        revision: head.revision,
        game: projectPublicGameState(head.state),
        events: publicEvents,
        advancedActions,
        actorIds,
        stoppedReason,
        ownPrivateView: privateViewOf(head.state, requestingSeat.playerId, privateFiring),
        ownSecrets,
      },
    };
  }

  /**
   * Strict revision equality, except while a computer may act concurrently with a human:
   * in a `parallel` window since it opened, and in the Contribution window.
   */
  private computerAdvanceAccepted(state: GameState, expectedRevision: number): boolean {
    if (expectedRevision === state.revision) return true;
    if (expectedRevision > state.revision) return false;
    const phase = state.phase;
    if (phase.type === "firing_salvage" || phase.type === "cleanup_hand_limit") {
      return phase.openedAtRevision <= expectedRevision;
    }
    return phase.type === "firing_contributions";
  }

  private policyFor(seat: StoredSeat): ComputerPolicy {
    return this.policies.find((policy) => policy.version === seat.aiPolicyVersion) ?? this.defaultPolicy;
  }

  /**
   * The policy's proposal, then the fallback list; the first candidate the engine accepts
   * against `head` wins. Every failure is logged server-side with codes only, and a policy
   * exception's message is logged but never returned (DESIGN §4.5).
   */
  private async chooseComputerCommand(
    head: AuthoritativeHead,
    privateState: PrivateFiringState,
    seat: StoredSeat,
  ): Promise<AppliedCommand | null> {
    const view = actorViewOf(head.state, seat.playerId, privateState);
    const context: ComputerSeatContext = {
      playerId: seat.playerId,
      displayName: seat.displayName,
      aiSeed: seat.aiSeed,
      aiPolicyVersion: seat.aiPolicyVersion,
    };
    const policy = this.policyFor(seat);
    let preferred: unknown = null;
    try {
      preferred = await policy.chooseCommand(view, context);
    } catch (cause) {
      this.logger.error("computer policy failed", {
        roomId: head.roomId,
        playerId: seat.playerId,
        revision: head.revision,
        policy: policy.version,
        cause: cause instanceof Error ? cause.message : String(cause),
      });
    }
    const fallbacks = (): readonly unknown[] => {
      try {
        return this.fallbackCommands(view);
      } catch (cause) {
        this.logger.error("computer fallback failed", {
          roomId: head.roomId,
          playerId: seat.playerId,
          revision: head.revision,
          cause: cause instanceof Error ? cause.message : String(cause),
        });
        return [];
      }
    };
    const selection = selectFirstLegalComputerCommand<AppliedCommand>(preferred, fallbacks, (candidate) => {
      const parsed = parseCommand(candidate);
      if (isGameRuleError(parsed)) return { ok: false, code: parsed.code, message: parsed.message };
      let applied: Application;
      try {
        applied = this.apply(head, privateState, seat.playerId, parsed);
      } catch (cause) {
        // An engine invariant failure on one candidate must not abort the others.
        this.logger.error("computer candidate raised an engine error", {
          roomId: head.roomId,
          playerId: seat.playerId,
          revision: head.revision,
          type: parsed.type,
          cause: cause instanceof Error ? cause.message : String(cause),
        });
        return { ok: false, code: "INTERNAL_SERVER_ERROR", message: "engine error" };
      }
      return applied.ok
        ? { ok: true, command: parsed, result: applied.value }
        : { ok: false, code: applied.error.code, message: applied.error.message };
    });
    if (selection === null || selection.usedFallback) {
      this.logger.error(selection === null ? "computer seat has no legal action" : "computer policy proposal rejected", {
        roomId: head.roomId,
        playerId: seat.playerId,
        revision: head.revision,
        phase: head.state.phase.type,
        rejected: (selection?.rejected ?? []).map((failure) => failure.code).join(","),
      });
    }
    return selection === null ? null : selection.result;
  }

  // ── Shared steps ─────────────────────────────────────────────────────────────────

  /** Applies one parsed command on a fresh RNG at the head's stored state. */
  private apply(
    head: AuthoritativeHead,
    privateState: PrivateFiringState,
    actorId: PlayerId,
    command: AuthoritativeCommand,
  ): Application {
    const rng = new SeededRandom(head.rngState);
    if (command.type === "SUBMIT_CONTRIBUTION") {
      const applied = submitContribution(head.state, privateState, actorId, command, rng, this.engineOptions);
      if (!applied.ok) return applied;
      return {
        ok: true,
        value: {
          command,
          rng,
          state: applied.state,
          events: applied.events,
          privateState: applied.privateState,
          privateSubmission: {
            windowId: command.windowId,
            card: command.card,
            fuelLedger: command.fuelLedger,
            revealed: applied.privateState.windowId === null,
          },
        },
      };
    }
    const applied = applyAction(head.state, actorId, command, rng, this.engineOptions);
    if (!applied.ok) return applied;
    return {
      ok: true,
      value: { command, rng, state: applied.state, events: applied.events, privateState: null, privateSubmission: null },
    };
  }

  /**
   * Builds the next head and the response, and commits them. A human command's stored
   * response carries the actor's own private view and secrets (returned again only to that
   * seat on an idempotent retry); a computer command's stored response carries none.
   */
  private async commit(
    room: StoredRoom,
    head: AuthoritativeHead,
    applied: AppliedCommand,
    commandId: string,
    actorId: PlayerId,
    humanActor: boolean,
  ): Promise<
    | { status: "ok"; head: AuthoritativeHead; response: CommandSuccess }
    | Exclude<StoreResult<CommandSuccess>, { status: "ok" }>
  > {
    const nextHead: AuthoritativeHead = {
      roomId: head.roomId,
      revision: applied.state.revision,
      state: applied.state,
      rngState: applied.rng.getState(),
      rootSeed: head.rootSeed,
      stateHash: await this.security.hashJson(applied.state),
    };
    const publicEvents = projectPublicEvents(applied.events);
    const game = projectPublicGameState(applied.state);
    const privateAfter = applied.privateState ?? emptyPrivateFiring(applied.state);
    const response: CommandSuccess = {
      commandId,
      room: roomAfterTransition(room, nextHead),
      actorId,
      revision: nextHead.revision,
      game,
      events: publicEvents,
      ownPrivateView: humanActor ? privateViewOf(applied.state, actorId, privateAfter) : null,
      ownSecrets: humanActor
        ? ownSecretRecords(applied.events, actorId, {
            roomId: room.id,
            commandId,
            actorId,
            revision: nextHead.revision,
            previousEventSequence: head.state.eventSequence,
          })
        : [],
    };
    const input: CommitTransitionInput = {
      roomId: room.id,
      commandId,
      actorId,
      expectedRevision: head.revision,
      command: applied.command,
      previousHead: head,
      nextHead,
      fullEvents: applied.events,
      publicEvents,
      publicState: game,
      response,
      privateSubmission: applied.privateSubmission,
    };
    const committed = await this.store.commitTransition(input);
    if (committed.status === "ok") return { status: "ok", head: nextHead, response: committed.value };
    return committed;
  }

  /** `PrivateFiringState` of the open Contribution window, rebuilt from stored rows. */
  private async privateFiringState(roomId: string, state: GameState): Promise<PrivateFiringState> {
    if (state.phase.type !== "firing_contributions") return emptyPrivateFiring(state);
    const windowId = state.phase.windowId;
    const rows = await this.store.loadPrivateSubmissions(roomId, windowId);
    const submissions: PrivateFiringState["submissions"] = {};
    for (const row of rows) {
      if (row.windowId === windowId) {
        submissions[row.playerId] = { card: row.card, fuelLedger: row.fuelLedger === true };
      }
    }
    return { gameId: state.gameId, windowId, submissions };
  }

  private async authenticate(
    roomCode: string,
    seatToken: string,
  ): Promise<MultiplayerResult<AuthenticatedSeat & { tokenHash: string }>> {
    if (typeof roomCode !== "string" || typeof seatToken !== "string" || roomCode.trim().length === 0 || seatToken.length < 16) {
      return failed(error("AUTHENTICATION_FAILED", "The room or seat credential is invalid."));
    }
    const tokenHash = await this.security.hashSecret(seatToken);
    const authenticated = await this.store.authenticate(roomCode.trim().toUpperCase(), tokenHash);
    if (authenticated === null) {
      return failed(error("AUTHENTICATION_FAILED", "The room or seat credential is invalid."));
    }
    if (authenticated.room.rulesVersion !== CURRENT_RULES_VERSION || authenticated.room.contentVersion !== CURRENT_RULES_VERSION) {
      return failed(
        error(
          "UNSUPPORTED_RULES_VERSION",
          "This room uses an older rules version and cannot continue under V1.6.2. Please create a new room.",
        ),
      );
    }
    // A room can carry the current rules version and still have been created under other
    // rules, because a change can land inside an unchanged version string. Refuse rather
    // than reinterpret: continuing would change the rules mid-game. Every V1.6.2 room is
    // created with a fingerprint, so a missing one fails closed too.
    const fingerprint = rulesFingerprint();
    const roomFingerprint = authenticated.room.contentDigest ?? null;
    if (roomFingerprint !== fingerprint) {
      return failed(
        error(
          "RULES_FINGERPRINT_MISMATCH",
          "This room was created under a different ruleset than the server now runs, so it cannot continue without changing the rules mid-game. Please create a new room.",
          null,
          { roomFingerprint: roomFingerprint ?? "missing", serverFingerprint: fingerprint },
        ),
      );
    }
    return { ok: true, value: { ...authenticated, tokenHash } };
  }

  private processedResult(
    processedActorId: PlayerId,
    currentActorId: PlayerId,
    response: CommandSuccess,
  ): MultiplayerResult<CommandSuccess> {
    if (processedActorId !== currentActorId) {
      return failed(error("DUPLICATE_COMMAND", "This command ID belongs to another seat."));
    }
    return { ok: true, value: response };
  }

  private commitResult(
    committed: StoreResult<CommandSuccess> | { status: "ok"; head: AuthoritativeHead; response: CommandSuccess },
    actorId: PlayerId,
    revision: number,
  ): MultiplayerResult<CommandSuccess> {
    if (committed.status === "ok") {
      return { ok: true, value: "response" in committed ? committed.response : committed.value };
    }
    if (committed.status === "duplicate") {
      return this.processedResult(committed.processed.actorId, actorId, committed.processed.response);
    }
    return failed(mapStoreFailure(committed.code, revision));
  }
}

/** The first computer seat among the current actors (DESIGN §3.4), in prompt order. */
export function nextComputerSeat(state: GameState, seatsByPlayerId: ReadonlyMap<PlayerId, StoredSeat>): StoredSeat | null {
  if (state.phase.type === "finished") return null;
  for (const actorId of decisionPrompt(state).actorIds) {
    const seat = seatsByPlayerId.get(actorId);
    if (seat !== undefined && seat.isComputer) return seat;
  }
  return null;
}

/** DESIGN §4.6 `nextOnlineDecisionActor`: the first computer seat in the prompt's actors. */
export function nextOnlineDecisionActor(state: GameState, seats: readonly StoredSeat[]): PlayerId | null {
  return nextComputerSeat(state, new Map(seats.map((seat) => [seat.playerId, seat])))?.playerId ?? null;
}
