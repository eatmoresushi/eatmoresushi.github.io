import { ONLINE_COMPUTER_POLICY_VERSION } from "./computerPlayer.ts";
import type { GameEvent, PlayerId } from "../game";
import type {
  AuthenticatedSeat,
  CommitStartInput,
  CommitTransitionInput,
  CreateRoomRecord,
  EndSessionRecord,
  JoinRoomRecord,
  AddComputerSeatRecord,
  RemoveComputerSeatRecord,
  MultiplayerStore,
  StoreResult,
} from "./store";
import type {
  AuthoritativeHead,
  CommandSuccess,
  PrivateSubmissionRecord,
  ProcessedCommandRecord,
  PublicEventRecord,
  PublicGameState,
  PublicStateListener,
  StoredRoom,
  StoredSeat,
} from "./types";

const SEAT_COLOURS = ["cinnabar", "celadon", "ink", "moon-white"] as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

interface FullEventRecord {
  roomId: string;
  sequence: number;
  revision: number;
  commandId: string;
  actorId: PlayerId;
  event: GameEvent;
  previousHash: string;
  eventHash: string;
  stateHash: string;
}

interface AcceptedCommandRecord {
  roomId: string;
  commandId: string;
  actorId: PlayerId;
  revision: number;
  command: unknown;
}

export interface InMemoryStoreAudit {
  credentials: Array<{ roomId: string; seatId: string; tokenHash: string }>;
  heads: AuthoritativeHead[];
  snapshots: AuthoritativeHead[];
  commands: AcceptedCommandRecord[];
  fullEvents: FullEventRecord[];
  privateSubmissions: PrivateSubmissionRecord[];
}

export class InMemoryMultiplayerStore implements MultiplayerStore {
  private readonly rooms = new Map<string, StoredRoom>();
  private readonly roomIdsByCode = new Map<string, string>();
  private readonly seats = new Map<string, StoredSeat[]>();
  private readonly credentialHashes = new Map<string, { roomId: string; seatId: string }>();
  private readonly heads = new Map<string, AuthoritativeHead>();
  private readonly publicStates = new Map<string, PublicGameState>();
  private readonly processed = new Map<string, ProcessedCommandRecord>();
  private readonly privateSubmissions = new Map<string, PrivateSubmissionRecord>();
  private readonly publicEvents = new Map<string, PublicEventRecord[]>();
  private readonly fullEvents = new Map<string, FullEventRecord[]>();
  private readonly snapshots = new Map<string, AuthoritativeHead[]>();
  private readonly commands = new Map<string, AcceptedCommandRecord[]>();
  private readonly listeners = new Map<string, Set<PublicStateListener>>();

  async createRoom(input: CreateRoomRecord): Promise<StoreResult<AuthenticatedSeat>> {
    const code = input.room.code.toUpperCase();
    if (this.roomIdsByCode.has(code)) return { status: "error", code: "room_code_conflict" };
    const room = clone({ ...input.room, code });
    const seat = clone(input.hostSeat);
    this.rooms.set(room.id, room);
    this.roomIdsByCode.set(code, room.id);
    this.seats.set(room.id, [seat]);
    this.credentialHashes.set(`${room.id}:${input.tokenHash}`, { roomId: room.id, seatId: seat.seatId });
    this.publicEvents.set(room.id, []);
    this.fullEvents.set(room.id, []);
    this.snapshots.set(room.id, []);
    this.commands.set(room.id, []);
    return { status: "ok", value: { room: clone(room), seat: clone(seat) } };
  }

  async joinRoom(input: JoinRoomRecord): Promise<StoreResult<AuthenticatedSeat>> {
    const roomId = this.roomIdsByCode.get(input.roomCode.toUpperCase());
    if (roomId === undefined) return { status: "error", code: "room_not_found" };
    const room = this.rooms.get(roomId);
    if (room === undefined) return { status: "error", code: "room_not_found" };
    if (room.status !== "lobby") return { status: "error", code: "game_already_started" };
    const roomSeats = this.seats.get(roomId) ?? [];
    if (roomSeats.length >= 4) return { status: "error", code: "room_full" };
    const used = new Set(roomSeats.map((seat) => seat.seatIndex));
    const seatIndex = [0, 1, 2, 3].find((index) => !used.has(index));
    if (seatIndex === undefined) return { status: "error", code: "room_full" };
    const seat: StoredSeat = {
      seatId: input.seatId,
      roomId,
      playerId: `P${seatIndex + 1}`,
      seatIndex,
      displayName: input.displayName,
      colour: SEAT_COLOURS[seatIndex]!,
      isHost: false,
      isComputer: false,
      aiPolicyVersion: null,
      authUserId: input.authUserId,
      aiSeed: null,
      aiCreatedCommandId: null,
    };
    roomSeats.push(seat);
    roomSeats.sort((left, right) => left.seatIndex - right.seatIndex);
    this.seats.set(roomId, roomSeats);
    this.credentialHashes.set(`${roomId}:${input.tokenHash}`, { roomId, seatId: seat.seatId });
    return { status: "ok", value: { room: clone(room), seat: clone(seat) } };
  }

  async addComputerSeat(input: AddComputerSeatRecord): Promise<StoreResult<StoredSeat>> {
    const room = this.rooms.get(input.roomId);
    if (room === undefined) return { status: "error", code: "room_not_found" };
    const roomSeats = this.seats.get(input.roomId) ?? [];
    const host = roomSeats.find((seat) => seat.seatId === input.hostSeatId && seat.isHost);
    if (room.hostSeatId !== input.hostSeatId || host === undefined) {
      return { status: "error", code: "host_only" };
    }
    if (room.status !== "lobby") return { status: "error", code: "game_already_started" };
    const prior = roomSeats.find((seat) => seat.aiCreatedCommandId === input.commandId);
    if (prior !== undefined) return { status: "ok", value: clone(prior) };
    if (roomSeats.length >= 4) return { status: "error", code: "room_full" };
    const used = new Set(roomSeats.map((seat) => seat.seatIndex));
    const seatIndex = [0, 1, 2, 3].find((index) => !used.has(index));
    if (seatIndex === undefined) return { status: "error", code: "room_full" };
    const seat: StoredSeat = {
      seatId: input.seatId,
      roomId: input.roomId,
      playerId: `P${seatIndex + 1}`,
      seatIndex,
      displayName: input.displayName,
      colour: SEAT_COLOURS[seatIndex]!,
      isHost: false,
      isComputer: true,
      aiPolicyVersion: ONLINE_COMPUTER_POLICY_VERSION,
      authUserId: null,
      aiSeed: input.aiSeed >>> 0,
      aiCreatedCommandId: input.commandId,
    };
    roomSeats.push(seat);
    roomSeats.sort((left, right) => left.seatIndex - right.seatIndex);
    this.seats.set(input.roomId, roomSeats);
    this.notify(input.roomId);
    return { status: "ok", value: clone(seat) };
  }

  async removeComputerSeat(input: RemoveComputerSeatRecord): Promise<StoreResult<boolean>> {
    const room = this.rooms.get(input.roomId);
    if (room === undefined) return { status: "error", code: "room_not_found" };
    const roomSeats = this.seats.get(input.roomId) ?? [];
    const host = roomSeats.find((seat) => seat.seatId === input.hostSeatId && seat.isHost);
    if (room.hostSeatId !== input.hostSeatId || host === undefined) {
      return { status: "error", code: "host_only" };
    }
    if (room.status !== "lobby") return { status: "error", code: "game_already_started" };
    const target = roomSeats.find((seat) => seat.seatId === input.computerSeatId);
    if (target === undefined) return { status: "ok", value: true };
    if (!target.isComputer) return { status: "error", code: "not_computer_seat" };
    this.seats.set(input.roomId, roomSeats.filter((seat) => seat.seatId !== input.computerSeatId));
    this.notify(input.roomId);
    return { status: "ok", value: true };
  }

  async authenticate(roomCode: string, tokenHash: string): Promise<AuthenticatedSeat | null> {
    const roomId = this.roomIdsByCode.get(roomCode.toUpperCase());
    if (roomId === undefined) return null;
    const credential = this.credentialHashes.get(`${roomId}:${tokenHash}`);
    const room = this.rooms.get(roomId);
    const seat = this.seats.get(roomId)?.find((candidate) => candidate.seatId === credential?.seatId);
    if (credential === undefined || room === undefined || seat === undefined) return null;
    return { room: clone(room), seat: clone(seat) };
  }

  async getSeats(roomId: string): Promise<StoredSeat[]> {
    return clone(this.seats.get(roomId) ?? []);
  }

  async loadHead(roomId: string): Promise<AuthoritativeHead | null> {
    const head = this.heads.get(roomId);
    return head === undefined ? null : clone(head);
  }

  async loadPublicState(roomId: string): Promise<PublicGameState | null> {
    const state = this.publicStates.get(roomId);
    return state === undefined ? null : clone(state);
  }

  async getProcessed(roomId: string, commandId: string): Promise<ProcessedCommandRecord | null> {
    const record = this.processed.get(`${roomId}:${commandId}`);
    return record === undefined ? null : clone(record);
  }

  async endSession(input: EndSessionRecord): Promise<StoreResult<StoredRoom>> {
    const room = this.rooms.get(input.roomId);
    if (room === undefined) return { status: "error", code: "room_not_found" };
    const host = this.seats.get(input.roomId)?.find(
      (seat) => seat.seatId === input.hostSeatId && seat.playerId === input.actorId && seat.isHost,
    );
    if (room.hostSeatId !== input.hostSeatId || host === undefined) {
      return { status: "error", code: "host_only" };
    }
    if (room.status === "finished") return { status: "error", code: "session_not_active" };
    if (room.status !== "abandoned") {
      room.status = "abandoned";
      room.endedAt = new Date().toISOString();
      room.endedByPlayerId = input.actorId;
      this.notify(input.roomId);
    }
    return { status: "ok", value: clone(room) };
  }

  async commitStart(input: CommitStartInput): Promise<StoreResult<CommandSuccess>> {
    const processed = this.processed.get(`${input.roomId}:${input.commandId}`);
    if (processed !== undefined) return { status: "duplicate", processed: clone(processed) };
    const room = this.rooms.get(input.roomId);
    if (room === undefined) return { status: "error", code: "room_not_found" };
    if (room.status !== "lobby" || this.heads.has(input.roomId)) {
      return { status: "error", code: "game_already_started" };
    }
    if ((this.seats.get(input.roomId)?.length ?? 0) < 2) {
      return { status: "error", code: "not_enough_players" };
    }
    room.status = "playing";
    room.latestRevision = input.head.revision;
    this.heads.set(input.roomId, clone(input.head));
    this.publicStates.set(input.roomId, clone(input.publicState));
    this.snapshots.get(input.roomId)?.push(clone(input.head));
    this.commands.get(input.roomId)?.push({
      roomId: input.roomId,
      commandId: input.commandId,
      actorId: input.actorId,
      revision: input.head.revision,
      command: { type: "START_GAME" },
    });
    const record: ProcessedCommandRecord = {
      roomId: input.roomId,
      commandId: input.commandId,
      actorId: input.actorId,
      response: clone(input.response),
    };
    this.processed.set(`${input.roomId}:${input.commandId}`, record);
    this.notify(input.roomId, input.publicState);
    return { status: "ok", value: clone(input.response) };
  }

  async commitTransition(input: CommitTransitionInput): Promise<StoreResult<CommandSuccess>> {
    const commandKey = `${input.roomId}:${input.commandId}`;
    const processed = this.processed.get(commandKey);
    if (processed !== undefined) return { status: "duplicate", processed: clone(processed) };
    const current = this.heads.get(input.roomId);
    const room = this.rooms.get(input.roomId);
    if (room === undefined) return { status: "error", code: "room_not_found" };
    if (room.status === "abandoned" || room.status === "finished") {
      return { status: "error", code: "session_not_active" };
    }
    if (
      current === undefined ||
      current.revision !== input.expectedRevision ||
      current.stateHash !== input.previousHead.stateHash
    ) {
      return { status: "error", code: "stale" };
    }
    if (input.nextHead.revision !== input.expectedRevision + 1) {
      throw new Error("A committed engine transition must advance exactly one revision");
    }
    if (input.privateSubmission !== null) {
      const privateKey = `${input.roomId}:${input.privateSubmission.windowId}:${input.actorId}`;
      if (this.privateSubmissions.has(privateKey)) {
        return { status: "error", code: "private_duplicate" };
      }
    }

    this.heads.set(input.roomId, clone(input.nextHead));
    this.publicStates.set(input.roomId, clone(input.publicState));
    this.snapshots.get(input.roomId)?.push(clone(input.nextHead));
    this.commands.get(input.roomId)?.push({
      roomId: input.roomId,
      commandId: input.commandId,
      actorId: input.actorId,
      revision: input.nextHead.revision,
      command: clone(input.command),
    });

    const publicRows = this.publicEvents.get(input.roomId) ?? [];
    const fullRows = this.fullEvents.get(input.roomId) ?? [];
    let previousHash = fullRows.at(-1)?.eventHash ?? "GENESIS";
    for (let index = 0; index < input.fullEvents.length; index += 1) {
      const fullEvent = input.fullEvents[index];
      const publicEvent = input.publicEvents[index];
      if (fullEvent === undefined || publicEvent === undefined) {
        throw new Error("Full and public event lists must have the same length");
      }
      const sequence = fullRows.length + 1;
      const eventHash = `${previousHash}:${input.nextHead.stateHash}:${input.commandId}:${sequence}`;
      fullRows.push({
        roomId: input.roomId,
        sequence,
        revision: input.nextHead.revision,
        commandId: input.commandId,
        actorId: input.actorId,
        event: clone(fullEvent),
        previousHash,
        eventHash,
        stateHash: input.nextHead.stateHash,
      });
      publicRows.push({
        roomId: input.roomId,
        sequence,
        revision: input.nextHead.revision,
        commandId: input.commandId,
        actorId: input.actorId,
        event: clone(publicEvent),
      });
      previousHash = eventHash;
    }
    this.fullEvents.set(input.roomId, fullRows);
    this.publicEvents.set(input.roomId, publicRows);

    if (input.privateSubmission !== null) {
      const record: PrivateSubmissionRecord = {
        roomId: input.roomId,
        windowId: input.privateSubmission.windowId,
        playerId: input.actorId,
        commandId: input.commandId,
        card: input.privateSubmission.card,
        revealedRevision: input.privateSubmission.revealed ? input.nextHead.revision : null,
      };
      this.privateSubmissions.set(
        `${input.roomId}:${input.privateSubmission.windowId}:${input.actorId}`,
        record,
      );
      if (input.privateSubmission.revealed) {
        for (const submission of this.privateSubmissions.values()) {
          if (submission.roomId === input.roomId && submission.windowId === input.privateSubmission.windowId) {
            submission.revealedRevision = input.nextHead.revision;
          }
        }
      }
    }

    room.latestRevision = input.nextHead.revision;
    if (input.nextHead.state.phase.type === "finished") room.status = "finished";
    const processedRecord: ProcessedCommandRecord = {
      roomId: input.roomId,
      commandId: input.commandId,
      actorId: input.actorId,
      response: clone(input.response),
    };
    this.processed.set(commandKey, processedRecord);
    this.notify(input.roomId, input.publicState);
    return { status: "ok", value: clone(input.response) };
  }

  async loadPrivateSubmissions(roomId: string, windowId: string): Promise<PrivateSubmissionRecord[]> {
    return clone(
      [...this.privateSubmissions.values()].filter(
        (submission) =>
          submission.roomId === roomId &&
          submission.windowId === windowId &&
          submission.revealedRevision === null,
      ),
    );
  }

  async findOwnPendingSubmission(
    roomId: string,
    playerId: PlayerId,
  ): Promise<PrivateSubmissionRecord | null> {
    const submission = [...this.privateSubmissions.values()].find(
      (candidate) =>
        candidate.roomId === roomId &&
        candidate.playerId === playerId &&
        candidate.revealedRevision === null,
    );
    return submission === undefined ? null : clone(submission);
  }

  async listPublicEvents(roomId: string, afterSequence = 0): Promise<PublicEventRecord[]> {
    return clone(
      (this.publicEvents.get(roomId) ?? []).filter((event) => event.sequence > afterSequence),
    );
  }

  subscribePublic(roomId: string, listener: PublicStateListener): () => void {
    const roomListeners = this.listeners.get(roomId) ?? new Set<PublicStateListener>();
    roomListeners.add(listener);
    this.listeners.set(roomId, roomListeners);
    return () => roomListeners.delete(listener);
  }

  audit(): InMemoryStoreAudit {
    return clone({
      credentials: [...this.credentialHashes.entries()].map(([key, value]) => ({
        roomId: value.roomId,
        seatId: value.seatId,
        tokenHash: key.slice(value.roomId.length + 1),
      })),
      heads: [...this.heads.values()],
      snapshots: [...this.snapshots.values()].flat(),
      commands: [...this.commands.values()].flat(),
      fullEvents: [...this.fullEvents.values()].flat(),
      privateSubmissions: [...this.privateSubmissions.values()],
    });
  }

  private notify(roomId: string, state?: PublicGameState): void {
    const currentState = state ?? this.publicStates.get(roomId);
    const room = this.rooms.get(roomId);
    for (const listener of this.listeners.get(roomId) ?? []) {
      try {
        listener({
          roomId,
          revision: currentState?.revision ?? room?.latestRevision ?? 0,
          eventSequence: currentState?.eventSequence ?? 0,
        });
      } catch {
        // Realtime notifications are advisory and cannot roll back an authoritative commit.
      }
    }
  }
}
