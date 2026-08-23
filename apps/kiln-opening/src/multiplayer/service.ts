import {
  SeededRandom,
  applyAction,
  createPrivateFiringState,
  createGame,
  submitWoodContribution,
} from "../game/index.ts";
import type {
  GameAction,
  GameState,
  GameRuleError,
  PlayerId,
  PrivateFiringState,
} from "../game/index.ts";
import { chooseOnlineComputerAction, nextOnlineDecisionActor } from "./computerPlayer.ts";
import { projectPublicEvents, projectPublicGameState } from "./projection.ts";
import type {
  AuthenticatedSeat,
  CommitTransitionInput,
  MultiplayerStore,
  StoreFailureCode,
  StoreResult,
} from "./store.ts";
import type {
  AuthoritativeHead,
  AddComputerSeatRequest,
  AdvanceComputersRequest,
  CommandRequest,
  CommandSuccess,
  ComputerAdvanceSuccess,
  CreateRoomRequest,
  EndSessionRequest,
  EndSessionSuccess,
  JoinRoomRequest,
  LobbySeatUpdateSuccess,
  MultiplayerError,
  MultiplayerErrorCode,
  MultiplayerResult,
  PendingContribution,
  PrivateDecisionState,
  PublicRoom,
  PublicSeat,
  ReconnectResult,
  RemoveComputerSeatRequest,
  RoomConnection,
  SecurityProvider,
  StartGameRequest,
  StoredRoom,
  StoredSeat,
  SubmitWoodCommand,
} from "./types.ts";

const MAX_DISPLAY_NAME_LENGTH = 40;
const ROOM_CODE_ATTEMPTS = 8;
const CONTRIBUTION_CAS_ATTEMPTS = 8;
const MAX_COMPUTER_ACTIONS_PER_REQUEST = 24;
const COMPUTER_CAS_ATTEMPTS = 8;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function error(
  code: MultiplayerErrorCode,
  message: string,
  currentRevision: number | null = null,
  details: MultiplayerError["details"] = {},
): MultiplayerError {
  return { code, message, details, currentRevision };
}

function privateDecisionState(state: GameState, playerId: PlayerId): PrivateDecisionState {
  const phase = state.phase;
  return {
    startingOrderIds: phase.type === "setup_starting_orders" ? [...(phase.offeredOrderIds[playerId] ?? [])] : [],
    colourSamplesOrderIds: phase.type === "work_office_orders" && phase.actorId === playerId && phase.step === "colour_samples_choose"
      ? [...(phase.colourSamplesChoices ?? [])]
      : [],
    fireModifierPeek: state.privateFirePeeks?.[playerId] ?? null,
  };
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

function gameFailure(ruleError: GameRuleError, revision: number): MultiplayerError {
  return error(ruleError.code, ruleError.message, revision, ruleError.details);
}

function mapStoreFailure(code: StoreFailureCode, revision: number | null = null): MultiplayerError {
  switch (code) {
    case "room_code_conflict":
      return error("ROOM_CODE_CONFLICT", "The generated room code is already in use.");
    case "room_not_found":
      return error("ROOM_NOT_FOUND", "The room does not exist.");
    case "room_full":
      return error("ROOM_FULL", "The room already has four stable seats.");
    case "game_already_started":
      return error("GAME_ALREADY_STARTED", "The game has already started.", revision);
    case "not_enough_players":
      return error("NOT_ENOUGH_PLAYERS", "At least two players are required to start.");
    case "seat_already_joined":
      return error("INVALID_REQUEST", "This authenticated account already has a seat in the room.");
    case "host_only":
      return error("HOST_ONLY", "Only the host may end this session.", revision);
    case "session_not_active":
      return error("SESSION_ENDED", "This game session has already ended.", revision);
    case "duplicate":
      return error("DUPLICATE_COMMAND", "This command ID was already used.", revision);
    case "stale":
      return error("STALE_REVISION", "The authoritative game revision has changed.", revision);
    case "private_duplicate":
      return error(
        "CONTRIBUTION_ALREADY_SUBMITTED",
        "This seat already submitted for the current Wood window.",
        revision,
      );
    case "not_computer_seat":
      return error("INVALID_REQUEST", "Only computer seats can be removed from the lobby.", revision);
  }
}

export class AuthoritativeGameService {
  constructor(
    private readonly store: MultiplayerStore,
    private readonly security: SecurityProvider,
  ) {}

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
        rulesVersion: "1.1.5",
        contentVersion: "1.1.5",
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
        const storeError = created.status === "duplicate" ? "duplicate" : created.code;
        return failed(mapStoreFailure(storeError));
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
          ownPendingContribution: null,
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
      const storeError = joined.status === "duplicate" ? "duplicate" : joined.code;
      return failed(mapStoreFailure(storeError));
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
        ownPendingContribution: null,
      },
    };
  }

  async reconnect(request: { roomCode: string; seatToken: string }): Promise<MultiplayerResult<ReconnectResult>> {
    const authenticated = await this.authenticate(request.roomCode, request.seatToken);
    if (!authenticated.ok) return authenticated;
    const { room, seat } = authenticated.value;
    const [seats, head, pending] = await Promise.all([
      this.store.getSeats(room.id),
      this.store.loadHead(room.id),
      this.store.findOwnPendingSubmission(room.id, seat.playerId),
    ]);
    return {
      ok: true,
      value: {
        room: publicRoom(room),
        seats: seats.map(publicSeat),
        seat: publicSeat(seat),
        game: head === null ? null : projectPublicGameState(head.state),
        ownPendingContribution:
          pending === null
            ? null
            : { windowId: pending.windowId, card: pending.card, submitted: true },
        ...(head === null ? {} : { ownPrivateDecision: privateDecisionState(head.state, seat.playerId) }),
      },
    };
  }

  async addComputerSeat(
    request: AddComputerSeatRequest,
  ): Promise<MultiplayerResult<LobbySeatUpdateSuccess>> {
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
    const usedComputerNumbers = new Set(currentSeats.flatMap((currentSeat) => {
      const match = /^Computer (\d+)$/.exec(currentSeat.displayName);
      return match?.[1] === undefined ? [] : [Number(match[1])];
    }));
    const computerNumber = [1, 2, 3, 4].find((number) => !usedComputerNumbers.has(number)) ?? 4;
    const added = await this.store.addComputerSeat({
      roomId: room.id,
      hostSeatId: seat.seatId,
      seatId: this.security.randomId(),
      displayName: `Computer ${computerNumber}`,
      aiSeed: this.security.randomSeed() >>> 0,
      commandId: request.commandId,
    });
    if (added.status !== "ok") {
      const storeError = added.status === "duplicate" ? "duplicate" : added.code;
      return failed(mapStoreFailure(storeError, room.latestRevision));
    }
    const seats = await this.store.getSeats(room.id);
    return { ok: true, value: { room: publicRoom(room), seats: seats.map(publicSeat) } };
  }

  async removeComputerSeat(
    request: RemoveComputerSeatRequest,
  ): Promise<MultiplayerResult<LobbySeatUpdateSuccess>> {
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
      const storeError = removed.status === "duplicate" ? "duplicate" : removed.code;
      return failed(mapStoreFailure(storeError, room.latestRevision));
    }
    const seats = await this.store.getSeats(room.id);
    return { ok: true, value: { room: publicRoom(room), seats: seats.map(publicSeat) } };
  }

  async startGame(request: StartGameRequest): Promise<MultiplayerResult<CommandSuccess>> {
    if (!UUID_PATTERN.test(request.commandId)) {
      return failed(error("INVALID_REQUEST", "commandId must be a UUID."));
    }
    const authenticated = await this.authenticate(request.roomCode, request.seatToken);
    if (!authenticated.ok) return authenticated;
    const { room, seat } = authenticated.value;
    if (room.status === "abandoned" || room.status === "finished") {
      return failed(error("SESSION_ENDED", "This game session has already ended.", room.latestRevision));
    }
    const prior = await this.store.getProcessed(room.id, request.commandId);
    if (prior !== null) return this.processedResult(prior.actorId, seat.playerId, prior.response);
    if (!seat.isHost || room.hostSeatId !== seat.seatId) {
      return failed(error("HOST_ONLY", "Only the host may start the game."));
    }
    if (room.status !== "lobby") {
      return failed(error("GAME_ALREADY_STARTED", "The game has already started.", room.latestRevision));
    }
    const seats = (await this.store.getSeats(room.id)).sort(
      (left, right) => left.seatIndex - right.seatIndex,
    );
    if (seats.length < 2) {
      return failed(error("NOT_ENOUGH_PLAYERS", "At least two players are required to start."));
    }
    const rootSeed = this.security.randomSeed() >>> 0;
    const rng = new SeededRandom(rootSeed);
    const created = createGame(
      {
        gameId: room.id,
        players: seats.map((currentSeat) => ({
          id: currentSeat.playerId,
          displayName: currentSeat.displayName,
        })),
      },
      rng,
    );
    if (!created.ok) return failed(gameFailure(created.error, room.latestRevision));
    const stateHash = await this.security.hashJson(created.state);
    const head: AuthoritativeHead = {
      roomId: room.id,
      revision: created.state.revision,
      state: created.state,
      rngState: rng.getState(),
      rootSeed,
      stateHash,
    };
    const game = projectPublicGameState(created.state);
    const response: CommandSuccess = {
      commandId: request.commandId,
      room: roomAfterTransition(room, head),
      actorId: seat.playerId,
      revision: head.revision,
      game,
      events: [],
      ownPendingContribution: null,
      ownPrivateDecision: privateDecisionState(created.state, seat.playerId),
    };
    const committed = await this.store.commitStart({
      roomId: room.id,
      commandId: request.commandId,
      actorId: seat.playerId,
      head,
      publicState: game,
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
      const storeError = ended.status === "duplicate" ? "duplicate" : ended.code;
      return failed(mapStoreFailure(storeError, room.latestRevision));
    }
    return {
      ok: true,
      value: {
        commandId: request.commandId,
        room: publicRoom(ended.value),
      },
    };
  }

  async executeCommand(request: CommandRequest): Promise<MultiplayerResult<CommandSuccess>> {
    if (
      !UUID_PATTERN.test(request.commandId) ||
      !Number.isInteger(request.expectedRevision) ||
      request.expectedRevision < 0
    ) {
      return failed(error("INVALID_REQUEST", "A commandId and non-negative expectedRevision are required."));
    }
    const authenticated = await this.authenticate(request.roomCode, request.seatToken);
    if (!authenticated.ok) return authenticated;
    if (authenticated.value.room.status === "abandoned" || authenticated.value.room.status === "finished") {
      return failed(error(
        "SESSION_ENDED",
        "This game session has ended and no longer accepts actions.",
        authenticated.value.room.latestRevision,
      ));
    }
    const command = request.command;
    if (command.type === "SUBMIT_WOOD_CONTRIBUTION") {
      return this.executeContribution(authenticated.value, { ...request, command });
    }
    return this.executePublicCommand(authenticated.value, { ...request, command });
  }

  async advanceComputerTurns(
    request: AdvanceComputersRequest,
  ): Promise<MultiplayerResult<ComputerAdvanceSuccess>> {
    if (!Number.isInteger(request.expectedRevision) || request.expectedRevision < 0) {
      return failed(error("INVALID_REQUEST", "A non-negative expectedRevision is required."));
    }
    const authenticated = await this.authenticate(request.roomCode, request.seatToken);
    if (!authenticated.ok) return authenticated;
    const { room, seat: requestingSeat } = authenticated.value;
    if (room.status === "abandoned" || room.status === "finished") {
      return failed(error("SESSION_ENDED", "This game session has ended.", room.latestRevision));
    }
    let head = await this.store.loadHead(room.id);
    if (head === null) return failed(error("GAME_NOT_STARTED", "The game has not started."));
    if (head.revision !== request.expectedRevision) {
      return failed(error("STALE_REVISION", "The authoritative game revision has changed.", head.revision));
    }
    const seats = await this.store.getSeats(room.id);
    const seatsByPlayerId = new Map(seats.map((currentSeat) => [currentSeat.playerId, currentSeat]));
    const publicEvents: CommandSuccess["events"] = [];
    const actorIds: PlayerId[] = [];
    let advancedActions = 0;
    let conflicts = 0;

    while (advancedActions < MAX_COMPUTER_ACTIONS_PER_REQUEST) {
      if (head.state.phase.type === "finished") break;
      const actorId = nextOnlineDecisionActor(head.state);
      const computerSeat = actorId === null ? undefined : seatsByPlayerId.get(actorId);
      if (computerSeat === undefined || !computerSeat.isComputer) break;

      const privateState = await this.privateFiringState(room.id, head);
      let command: Awaited<ReturnType<typeof chooseOnlineComputerAction>>;
      try {
        command = await chooseOnlineComputerAction(head.state, privateState, computerSeat);
      } catch (cause) {
        return failed(
          error(
            "COMPUTER_TURN_FAILED",
            `${computerSeat.displayName} could not choose a legal action: ${cause instanceof Error ? cause.message : "unknown policy error"}`,
            head.revision,
          ),
        );
      }

      const commandId = this.security.randomId();
      const rng = new SeededRandom(head.rngState);
      let appliedState: AuthoritativeHead["state"];
      let fullEvents: CommandSuccess["events"];
      let privateSubmission: CommitTransitionInput["privateSubmission"] = null;

      if (command.type === "SUBMIT_WOOD_CONTRIBUTION") {
        if (
          head.state.phase.type !== "firing_contributions" ||
          head.state.phase.windowId !== command.windowId
        ) {
          return failed(error("COMPUTER_TURN_FAILED", "The computer contribution window changed.", head.revision));
        }
        const applied = submitWoodContribution(
          head.state,
          privateState,
          computerSeat.playerId,
          command.card,
          rng,
        );
        if (!applied.ok) return failed(gameFailure(applied.error, head.revision));
        appliedState = applied.state;
        fullEvents = applied.events;
        privateSubmission = {
          windowId: command.windowId,
        card: command.card,
          revealed: applied.privateState.windowId === null,
        };
      } else {
        const applied = applyAction(head.state, computerSeat.playerId, command, rng);
        if (!applied.ok) return failed(gameFailure(applied.error, head.revision));
        appliedState = applied.state;
        fullEvents = applied.events;
      }

      const nextHead = await this.makeNextHead(head, appliedState, rng.getState());
      const projectedEvents = projectPublicEvents(fullEvents);
      const game = projectPublicGameState(appliedState);
      const response = this.commandResponse(
        commandId,
        room,
        computerSeat.playerId,
        nextHead,
        game,
        projectedEvents,
        null,
      );
      const committed = await this.store.commitTransition({
        roomId: room.id,
        commandId,
        actorId: computerSeat.playerId,
        expectedRevision: head.revision,
        command,
        previousHead: head,
        nextHead,
        fullEvents,
        publicEvents: projectedEvents,
        publicState: game,
        response,
        privateSubmission,
      });
      if (
        (committed.status === "error" &&
          (committed.code === "stale" || committed.code === "private_duplicate")) ||
        committed.status === "duplicate"
      ) {
        conflicts += 1;
        if (conflicts >= COMPUTER_CAS_ATTEMPTS) {
          return failed(
            error(
              "PERSISTENCE_CONFLICT",
              "Computer turns could not be committed after concurrent updates.",
              head.revision,
            ),
          );
        }
        const current = await this.store.loadHead(room.id);
        if (current === null) return failed(error("GAME_NOT_STARTED", "The game has not started."));
        head = current;
        continue;
      }
      if (committed.status === "error") {
        return failed(mapStoreFailure(committed.code, head.revision));
      }
      head = nextHead;
      publicEvents.push(...projectedEvents);
      actorIds.push(computerSeat.playerId);
      advancedActions += 1;
      conflicts = 0;
    }

    const game = projectPublicGameState(head.state);
    const pending = await this.store.findOwnPendingSubmission(room.id, requestingSeat.playerId);
    const nextActorId = nextOnlineDecisionActor(head.state);
    const nextSeat = nextActorId === null ? undefined : seatsByPlayerId.get(nextActorId);
    const stoppedReason: ComputerAdvanceSuccess["stoppedReason"] =
      head.state.phase.type === "finished"
        ? "finished"
        : advancedActions >= MAX_COMPUTER_ACTIONS_PER_REQUEST && nextSeat?.isComputer === true
          ? "action_limit"
          : "human_turn";
    return {
      ok: true,
      value: {
        room: roomAfterTransition(room, head),
        revision: head.revision,
        game,
        events: publicEvents,
        advancedActions,
        actorIds,
        stoppedReason,
        ownPendingContribution:
          pending === null
            ? null
            : { windowId: pending.windowId, card: pending.card, submitted: true },
        ownPrivateDecision: privateDecisionState(head.state, requestingSeat.playerId),
      },
    };
  }

  private async executePublicCommand(
    authenticated: AuthenticatedSeat,
    request: CommandRequest & { command: GameAction },
  ): Promise<MultiplayerResult<CommandSuccess>> {
    const { room, seat } = authenticated;
    const prior = await this.store.getProcessed(room.id, request.commandId);
    if (prior !== null) return this.processedResult(prior.actorId, seat.playerId, prior.response);
    const head = await this.store.loadHead(room.id);
    if (head === null) return failed(error("GAME_NOT_STARTED", "The game has not started."));
    if (request.expectedRevision !== head.revision) {
      return failed(error("STALE_REVISION", "The authoritative game revision has changed.", head.revision));
    }
    const rng = new SeededRandom(head.rngState);
    const applied = applyAction(head.state, seat.playerId, request.command, rng);
    if (!applied.ok) return failed(gameFailure(applied.error, head.revision));
    const publicEvents = projectPublicEvents(applied.events);
    const nextHead = await this.makeNextHead(head, applied.state, rng.getState());
    const game = projectPublicGameState(applied.state);
    const response = this.commandResponse(
      request.commandId,
      room,
      seat.playerId,
      nextHead,
      game,
      publicEvents,
      null,
    );
    const committed = await this.store.commitTransition({
      roomId: room.id,
      commandId: request.commandId,
      actorId: seat.playerId,
      expectedRevision: head.revision,
      command: request.command,
      previousHead: head,
      nextHead,
      fullEvents: applied.events,
      publicEvents,
      publicState: game,
      response,
      privateSubmission: null,
    });
    return this.commitResult(committed, seat.playerId, head.revision);
  }

  private async executeContribution(
    authenticated: AuthenticatedSeat,
    request: CommandRequest & { command: SubmitWoodCommand },
  ): Promise<MultiplayerResult<CommandSuccess>> {
    const { room, seat } = authenticated;
    if (request.command.windowId.trim().length === 0) {
      return failed(error("INVALID_REQUEST", "A Wood Contribution windowId is required."));
    }
    for (let attempt = 0; attempt < CONTRIBUTION_CAS_ATTEMPTS; attempt += 1) {
      const prior = await this.store.getProcessed(room.id, request.commandId);
      if (prior !== null) return this.processedResult(prior.actorId, seat.playerId, prior.response);
      const head = await this.store.loadHead(room.id);
      if (head === null) return failed(error("GAME_NOT_STARTED", "The game has not started."));
      if (
        head.state.phase.type !== "firing_contributions" ||
        head.state.phase.windowId !== request.command.windowId
      ) {
        return failed(
          error("PRIVATE_WINDOW_MISMATCH", "The private submission window has changed.", head.revision),
        );
      }
      if (request.expectedRevision > head.revision) {
        return failed(error("STALE_REVISION", "The authoritative game revision has changed.", head.revision));
      }
      const storedSubmissions = await this.store.loadPrivateSubmissions(room.id, request.command.windowId);
      const privateState: PrivateFiringState = {
        gameId: head.state.gameId,
        windowId: request.command.windowId,
        contributions: Object.fromEntries(
          storedSubmissions.map((submission) => [submission.playerId, submission.card]),
        ),
      };
      const rng = new SeededRandom(head.rngState);
      const applied = submitWoodContribution(
        head.state,
        privateState,
        seat.playerId,
        request.command.card,
        rng,
      );
      if (!applied.ok) return failed(gameFailure(applied.error, head.revision));
      const revealed = applied.privateState.windowId === null;
      const ownPendingContribution: PendingContribution | null = revealed
        ? null
        : {
            windowId: request.command.windowId,
        card: request.command.card,
            submitted: true,
          };
      const publicEvents = projectPublicEvents(applied.events);
      const nextHead = await this.makeNextHead(head, applied.state, rng.getState());
      const game = projectPublicGameState(applied.state);
      const response = this.commandResponse(
        request.commandId,
        room,
        seat.playerId,
        nextHead,
        game,
        publicEvents,
        ownPendingContribution,
      );
      const commitInput: CommitTransitionInput = {
        roomId: room.id,
        commandId: request.commandId,
        actorId: seat.playerId,
        expectedRevision: head.revision,
        command: request.command,
        previousHead: head,
        nextHead,
        fullEvents: applied.events,
        publicEvents,
        publicState: game,
        response,
        privateSubmission: {
          windowId: request.command.windowId,
        card: request.command.card,
          revealed,
        },
      };
      const committed = await this.store.commitTransition(commitInput);
      if (committed.status === "error" && committed.code === "stale") continue;
      return this.commitResult(committed, seat.playerId, head.revision);
    }
    const current = await this.store.loadHead(room.id);
    return failed(
      error(
        "PERSISTENCE_CONFLICT",
        "The contribution could not be committed after concurrent updates.",
        current?.revision ?? null,
      ),
    );
  }

  private async authenticate(
    roomCode: string,
    seatToken: string,
  ): Promise<MultiplayerResult<AuthenticatedSeat>> {
    if (roomCode.trim().length === 0 || seatToken.length < 16) {
      return failed(error("AUTHENTICATION_FAILED", "The room or seat credential is invalid."));
    }
    const tokenHash = await this.security.hashSecret(seatToken);
    const authenticated = await this.store.authenticate(roomCode.trim().toUpperCase(), tokenHash);
    if (authenticated === null) {
      return failed(error("AUTHENTICATION_FAILED", "The room or seat credential is invalid."));
    }
    if (
      authenticated.room.rulesVersion !== "1.1.5" ||
      authenticated.room.contentVersion !== "1.1.5"
    ) {
      return failed(
        error(
          "UNSUPPORTED_RULES_VERSION",
          "This room uses an older rules version and cannot continue under V1.1.5. Please create a new room.",
        ),
      );
    }
    return { ok: true, value: authenticated };
  }

  private async privateFiringState(
    roomId: string,
    head: AuthoritativeHead,
  ): Promise<PrivateFiringState> {
    const privateState = createPrivateFiringState(head.state);
    if (head.state.phase.type !== "firing_contributions") return privateState;
    const submissions = await this.store.loadPrivateSubmissions(roomId, head.state.phase.windowId);
    return {
      gameId: head.state.gameId,
      windowId: head.state.phase.windowId,
      contributions: Object.fromEntries(
        submissions.map((submission) => [submission.playerId, submission.card]),
      ),
    };
  }

  private async makeNextHead(
    previous: AuthoritativeHead,
    state: AuthoritativeHead["state"],
    rngState: number,
  ): Promise<AuthoritativeHead> {
    return {
      roomId: previous.roomId,
      revision: state.revision,
      state,
      rngState,
      rootSeed: previous.rootSeed,
      stateHash: await this.security.hashJson(state),
    };
  }

  private commandResponse(
    commandId: string,
    room: StoredRoom,
    actorId: PlayerId,
    head: AuthoritativeHead,
    game: CommandSuccess["game"],
    events: CommandSuccess["events"],
    pending: PendingContribution | null,
  ): CommandSuccess {
    return {
      commandId,
      room: roomAfterTransition(room, head),
      actorId,
      revision: head.revision,
      game,
      events,
      ownPendingContribution: pending,
      ownPrivateDecision: privateDecisionState(head.state, actorId),
    };
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
    committed: StoreResult<CommandSuccess>,
    actorId: PlayerId,
    revision: number,
  ): MultiplayerResult<CommandSuccess> {
    if (committed.status === "ok") return { ok: true, value: committed.value };
    if (committed.status === "duplicate") {
      return this.processedResult(committed.processed.actorId, actorId, committed.processed.response);
    }
    return failed(mapStoreFailure(committed.code, revision));
  }
}
