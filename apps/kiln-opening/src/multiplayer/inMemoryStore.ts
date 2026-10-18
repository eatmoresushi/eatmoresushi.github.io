/**
 * In-memory `MultiplayerStore` for tests and the local E2E backend. It mirrors the
 * Supabase RPCs (`supabase/migrations/*_v161_rules.sql`): the same version and fingerprint
 * gates, the same compare-and-swap on the head, the same private-submission uniqueness and
 * the same event numbering.
 *
 * `jsonbKeyOrder: true` makes every stored and loaded value pass through the key order
 * Postgres `jsonb` uses (keys sorted by length, then bytes), so a test can prove that no
 * rule depends on `Record` key order (DESIGN §2.3, §7).
 */

import type { GameEvent, PlayerId } from "../game/index.ts";
import { secretRecipient } from "./projection.ts";
import type {
  AddComputerSeatRecord,
  AuthenticatedSeat,
  CommitStartInput,
  CommitTransitionInput,
  CreateRoomRecord,
  EndSessionRecord,
  JoinRoomRecord,
  MultiplayerStore,
  RemoveComputerSeatRecord,
  StoreResult,
} from "./store.ts";
import type {
  AuthoritativeHead,
  CommandSuccess,
  PrivateEventRecord,
  PrivateSubmissionRecord,
  ProcessedCommandRecord,
  PublicEventRecord,
  PublicGameState,
  PublicStateListener,
  StoredRoom,
  StoredSeat,
} from "./types.ts";

const SEAT_COLOURS = ["cinnabar", "celadon", "ink", "moon-white"] as const;

/** The SQL gates: `rules_version = '1.6.2'`, `content_version = '1.6.2'`, `^r31-…`. */
export const CURRENT_ROOM_FINGERPRINT_PATTERN = /^r31-[0-9a-f]{16}$/;
/** `room_ai_seats_policy_version_check` for V1.6.2 seats. */
export const COMPUTER_POLICY_VERSION_PATTERN = /^rules-v1\.6\.2-[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** The V1.6.2 Contribution cards the SQL card check accepts (v1.6.2 change 26). */
const CONTRIBUTION_CARDS: ReadonlySet<string> = new Set(["BANK", "TEND", "STOKE", "FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"]);

/** Keys sorted by length, then bytes: the order Postgres `jsonb` stores object keys in. */
export function jsonbKeyOrder<T>(value: T): T {
  const sortKeys = (item: unknown): unknown => {
    if (Array.isArray(item)) {
      return item.map(sortKeys);
    }
    if (item !== null && typeof item === "object") {
      const entries = Object.entries(item as Record<string, unknown>).sort(([left], [right]) =>
        left.length !== right.length ? left.length - right.length : left < right ? -1 : left > right ? 1 : 0,
      );
      return Object.fromEntries(entries.map(([key, inner]) => [key, sortKeys(inner)]));
    }
    return item;
  };
  return sortKeys(JSON.parse(JSON.stringify(value))) as T;
}

function plainClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function currentRoom(room: StoredRoom): boolean {
  return (
    room.rulesVersion === "1.6.2" &&
    room.contentVersion === "1.6.2" &&
    room.contentDigest !== null &&
    CURRENT_ROOM_FINGERPRINT_PATTERN.test(room.contentDigest)
  );
}

function currentStateVersion(value: { schemaVersion?: unknown; rulesVersion?: unknown }): boolean {
  return value.schemaVersion === 8 && value.rulesVersion === "1.6.2";
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
  publicEvents: PublicEventRecord[];
  publicStates: PublicGameState[];
  processed: ProcessedCommandRecord[];
  privateSubmissions: PrivateSubmissionRecord[];
}

export interface InMemoryStoreOptions {
  /** Reorder object keys as Postgres `jsonb` does on every write and read. */
  jsonbKeyOrder?: boolean;
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
  private readonly clone: <T>(value: T) => T;

  constructor(options: InMemoryStoreOptions = {}) {
    this.clone = options.jsonbKeyOrder === true ? jsonbKeyOrder : plainClone;
  }

  async createRoom(input: CreateRoomRecord): Promise<StoreResult<AuthenticatedSeat>> {
    if (
      input.room.rulesVersion !== "1.6.2" ||
      input.room.contentVersion !== "1.6.2" ||
      input.room.contentDigest === null ||
      !CURRENT_ROOM_FINGERPRINT_PATTERN.test(input.room.contentDigest)
    ) {
      return { status: "error", code: "session_not_active" };
    }
    const code = input.room.code.toUpperCase();
    if (this.roomIdsByCode.has(code)) return { status: "error", code: "room_code_conflict" };
    const room = this.clone({ ...input.room, code });
    const seat = this.clone(input.hostSeat);
    this.rooms.set(room.id, room);
    this.roomIdsByCode.set(code, room.id);
    this.seats.set(room.id, [seat]);
    this.credentialHashes.set(`${room.id}:${input.tokenHash}`, { roomId: room.id, seatId: seat.seatId });
    this.publicEvents.set(room.id, []);
    this.fullEvents.set(room.id, []);
    this.snapshots.set(room.id, []);
    this.commands.set(room.id, []);
    return { status: "ok", value: { room: this.clone(room), seat: this.clone(seat) } };
  }

  async joinRoom(input: JoinRoomRecord): Promise<StoreResult<AuthenticatedSeat>> {
    const roomId = this.roomIdsByCode.get(input.roomCode.toUpperCase());
    if (roomId === undefined) return { status: "error", code: "room_not_found" };
    const room = this.rooms.get(roomId);
    if (room === undefined) return { status: "error", code: "room_not_found" };
    if (room.status !== "lobby") return { status: "error", code: "game_already_started" };
    if (!currentRoom(room)) return { status: "error", code: "session_not_active" };
    const roomSeats = this.seats.get(roomId) ?? [];
    if (input.authUserId !== null && roomSeats.some((seat) => seat.authUserId === input.authUserId)) {
      return { status: "error", code: "seat_already_joined" };
    }
    const seatIndex = [0, 1, 2, 3].find((index) => !roomSeats.some((seat) => seat.seatIndex === index));
    if (seatIndex === undefined) return { status: "error", code: "room_full" };
    const seat: StoredSeat = {
      seatId: input.seatId,
      roomId,
      playerId: `P${seatIndex + 1}`,
      seatIndex,
      displayName: input.displayName,
      colour: SEAT_COLOURS[seatIndex] ?? "ink",
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
    this.notify(roomId);
    return { status: "ok", value: { room: this.clone(room), seat: this.clone(seat) } };
  }

  async addComputerSeat(input: AddComputerSeatRecord): Promise<StoreResult<StoredSeat>> {
    const room = this.rooms.get(input.roomId);
    if (room === undefined) return { status: "error", code: "room_not_found" };
    const roomSeats = this.seats.get(input.roomId) ?? [];
    const host = roomSeats.find((seat) => seat.seatId === input.hostSeatId && seat.isHost && !seat.isComputer);
    if (room.hostSeatId !== input.hostSeatId || host === undefined) {
      return { status: "error", code: "host_only" };
    }
    if (room.status !== "lobby") return { status: "error", code: "game_already_started" };
    if (!currentRoom(room) || !COMPUTER_POLICY_VERSION_PATTERN.test(input.policyVersion)) {
      return { status: "error", code: "session_not_active" };
    }
    const prior = roomSeats.find((seat) => seat.aiCreatedCommandId === input.commandId);
    if (prior !== undefined) return { status: "ok", value: this.clone(prior) };
    const seatIndex = [0, 1, 2, 3].find((index) => !roomSeats.some((seat) => seat.seatIndex === index));
    if (seatIndex === undefined) return { status: "error", code: "room_full" };
    const seat: StoredSeat = {
      seatId: input.seatId,
      roomId: input.roomId,
      playerId: `P${seatIndex + 1}`,
      seatIndex,
      displayName: input.displayName,
      colour: SEAT_COLOURS[seatIndex] ?? "ink",
      isHost: false,
      isComputer: true,
      aiPolicyVersion: input.policyVersion as StoredSeat["aiPolicyVersion"],
      authUserId: null,
      aiSeed: input.aiSeed >>> 0,
      aiCreatedCommandId: input.commandId,
    };
    roomSeats.push(seat);
    roomSeats.sort((left, right) => left.seatIndex - right.seatIndex);
    this.seats.set(input.roomId, roomSeats);
    this.notify(input.roomId);
    return { status: "ok", value: this.clone(seat) };
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
    return { room: this.clone(room), seat: this.clone(seat) };
  }

  async getSeats(roomId: string): Promise<StoredSeat[]> {
    return this.clone(this.seats.get(roomId) ?? []);
  }

  async loadHead(roomId: string): Promise<AuthoritativeHead | null> {
    const head = this.heads.get(roomId);
    return head === undefined ? null : this.clone(head);
  }

  async loadPublicState(roomId: string): Promise<PublicGameState | null> {
    const state = this.publicStates.get(roomId);
    return state === undefined ? null : this.clone(state);
  }

  async getProcessed(roomId: string, commandId: string): Promise<ProcessedCommandRecord | null> {
    const record = this.processed.get(`${roomId}:${commandId}`);
    return record === undefined ? null : this.clone(record);
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
    return { status: "ok", value: this.clone(room) };
  }

  async commitStart(input: CommitStartInput): Promise<StoreResult<CommandSuccess>> {
    const processed = this.processed.get(`${input.roomId}:${input.commandId}`);
    if (processed !== undefined) return { status: "duplicate", processed: this.clone(processed) };
    const room = this.rooms.get(input.roomId);
    if (room === undefined) return { status: "error", code: "room_not_found" };
    if (room.status !== "lobby" || this.heads.has(input.roomId)) {
      return { status: "error", code: "game_already_started" };
    }
    if (!currentRoom(room) || !currentStateVersion(input.head.state) || !currentStateVersion(input.publicState)) {
      return { status: "error", code: "session_not_active" };
    }
    if ((this.seats.get(input.roomId)?.length ?? 0) < 2) {
      return { status: "error", code: "not_enough_players" };
    }
    if (input.fullEvents.length !== input.publicEvents.length) {
      throw new Error("Full and public event lists must have the same length");
    }
    room.status = "playing";
    room.latestRevision = input.head.revision;
    this.heads.set(input.roomId, this.clone(input.head));
    this.publicStates.set(input.roomId, this.clone(input.publicState));
    this.snapshots.get(input.roomId)?.push(this.clone(input.head));
    this.commands.get(input.roomId)?.push({
      roomId: input.roomId,
      commandId: input.commandId,
      actorId: input.actorId,
      revision: input.head.revision,
      command: { type: "START_GAME" },
    });
    this.appendEvents(input.roomId, input.commandId, input.actorId, input.head, input.fullEvents, input.publicEvents);
    this.processed.set(`${input.roomId}:${input.commandId}`, {
      roomId: input.roomId,
      commandId: input.commandId,
      actorId: input.actorId,
      response: this.clone(input.response),
    });
    this.notify(input.roomId, input.publicState);
    return { status: "ok", value: this.clone(input.response) };
  }

  async commitTransition(input: CommitTransitionInput): Promise<StoreResult<CommandSuccess>> {
    const commandKey = `${input.roomId}:${input.commandId}`;
    const processed = this.processed.get(commandKey);
    if (processed !== undefined) return { status: "duplicate", processed: this.clone(processed) };
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
    if (
      input.nextHead.revision !== input.expectedRevision + 1 ||
      input.nextHead.state.revision !== input.nextHead.revision ||
      input.publicState.revision !== input.nextHead.revision
    ) {
      throw new Error("A committed engine transition must advance exactly one revision");
    }
    if (
      !currentRoom(room) ||
      !currentStateVersion(current.state) ||
      !currentStateVersion(input.nextHead.state) ||
      !currentStateVersion(input.publicState)
    ) {
      throw new Error("unsupported rules or schema version");
    }
    if (input.fullEvents.length !== input.publicEvents.length) {
      throw new Error("Full and public event lists must have the same length");
    }
    const submission = input.privateSubmission;
    if (submission !== null) {
      // The SQL gate: one of the 5 V1.6.2 cards, and no Fuel Ledger flag beside it (change 26
      // replaced the commitment with the Fuel Ledger cards).
      if (!CONTRIBUTION_CARDS.has(submission.card) || Object.hasOwn(submission, "fuelLedger")) {
        throw new Error("invalid private Contribution payload");
      }
      if (this.privateSubmissions.has(`${input.roomId}:${submission.windowId}:${input.actorId}`)) {
        return { status: "error", code: "private_duplicate" };
      }
    }

    this.heads.set(input.roomId, this.clone(input.nextHead));
    this.publicStates.set(input.roomId, this.clone(input.publicState));
    this.snapshots.get(input.roomId)?.push(this.clone(input.nextHead));
    this.commands.get(input.roomId)?.push({
      roomId: input.roomId,
      commandId: input.commandId,
      actorId: input.actorId,
      revision: input.nextHead.revision,
      command: this.clone(input.command),
    });
    this.appendEvents(input.roomId, input.commandId, input.actorId, input.nextHead, input.fullEvents, input.publicEvents);

    if (submission !== null) {
      this.privateSubmissions.set(`${input.roomId}:${submission.windowId}:${input.actorId}`, {
        roomId: input.roomId,
        windowId: submission.windowId,
        playerId: input.actorId,
        commandId: input.commandId,
        card: submission.card,
        revealedRevision: null,
      });
      if (submission.revealed) {
        for (const record of this.privateSubmissions.values()) {
          if (record.roomId === input.roomId && record.windowId === submission.windowId && record.revealedRevision === null) {
            record.revealedRevision = input.nextHead.revision;
          }
        }
      }
    }

    room.latestRevision = input.nextHead.revision;
    if (input.nextHead.state.phase.type === "finished") room.status = "finished";
    this.processed.set(commandKey, {
      roomId: input.roomId,
      commandId: input.commandId,
      actorId: input.actorId,
      response: this.clone(input.response),
    });
    this.notify(input.roomId, input.publicState);
    return { status: "ok", value: this.clone(input.response) };
  }

  async loadPrivateSubmissions(roomId: string, windowId: string): Promise<PrivateSubmissionRecord[]> {
    return this.clone(
      [...this.privateSubmissions.values()].filter(
        (record) => record.roomId === roomId && record.windowId === windowId && record.revealedRevision === null,
      ),
    );
  }

  async findOwnPendingSubmission(roomId: string, playerId: PlayerId): Promise<PrivateSubmissionRecord | null> {
    const pending = [...this.privateSubmissions.values()].filter(
      (record) => record.roomId === roomId && record.playerId === playerId && record.revealedRevision === null,
    );
    const latest = pending.at(-1);
    return latest === undefined ? null : this.clone(latest);
  }

  async listPublicEvents(roomId: string, afterSequence = 0): Promise<PublicEventRecord[]> {
    return this.clone((this.publicEvents.get(roomId) ?? []).filter((record) => record.sequence > afterSequence));
  }

  async listPrivateEvents(
    roomId: string,
    playerId: PlayerId,
    tokenHash: string,
    afterSequence = 0,
  ): Promise<PrivateEventRecord[]> {
    const credential = this.credentialHashes.get(`${roomId}:${tokenHash}`);
    const seat = this.seats.get(roomId)?.find((candidate) => candidate.seatId === credential?.seatId);
    if (credential === undefined || seat === undefined || seat.playerId !== playerId) {
      return [];
    }
    return this.clone(
      (this.fullEvents.get(roomId) ?? [])
        .filter((record) => record.sequence > afterSequence && secretRecipient(record.event) === playerId)
        .map((record) => ({
          roomId: record.roomId,
          sequence: record.sequence,
          revision: record.revision,
          commandId: record.commandId,
          actorId: record.actorId,
          event: record.event,
        })),
    );
  }

  subscribePublic(roomId: string, listener: PublicStateListener): () => void {
    const roomListeners = this.listeners.get(roomId) ?? new Set<PublicStateListener>();
    roomListeners.add(listener);
    this.listeners.set(roomId, roomListeners);
    return () => roomListeners.delete(listener);
  }

  /** Every stored row, for privacy and persistence assertions in tests. */
  audit(): InMemoryStoreAudit {
    return plainClone({
      credentials: [...this.credentialHashes.entries()].map(([key, value]) => ({
        roomId: value.roomId,
        seatId: value.seatId,
        tokenHash: key.slice(value.roomId.length + 1),
      })),
      heads: [...this.heads.values()],
      snapshots: [...this.snapshots.values()].flat(),
      commands: [...this.commands.values()].flat(),
      fullEvents: [...this.fullEvents.values()].flat(),
      publicEvents: [...this.publicEvents.values()].flat(),
      publicStates: [...this.publicStates.values()],
      processed: [...this.processed.values()],
      privateSubmissions: [...this.privateSubmissions.values()],
    });
  }

  private appendEvents(
    roomId: string,
    commandId: string,
    actorId: PlayerId,
    head: AuthoritativeHead,
    fullEvents: CommitTransitionInput["fullEvents"],
    publicEvents: CommitTransitionInput["publicEvents"],
  ): void {
    const publicRows = this.publicEvents.get(roomId) ?? [];
    const fullRows = this.fullEvents.get(roomId) ?? [];
    let previousHash = fullRows.at(-1)?.eventHash ?? "GENESIS";
    for (let index = 0; index < fullEvents.length; index += 1) {
      const fullEvent = fullEvents[index];
      const publicEvent = publicEvents[index];
      if (fullEvent === undefined || publicEvent === undefined) {
        throw new Error("Full and public event lists must have the same length");
      }
      const sequence = fullRows.length + 1;
      const eventHash = `${previousHash}:${head.stateHash}:${commandId}:${sequence}`;
      fullRows.push({
        roomId,
        sequence,
        revision: head.revision,
        commandId,
        actorId,
        event: this.clone(fullEvent),
        previousHash,
        eventHash,
        stateHash: head.stateHash,
      });
      publicRows.push({ roomId, sequence, revision: head.revision, commandId, actorId, event: this.clone(publicEvent) });
      previousHash = eventHash;
    }
    if (fullRows.length !== head.state.eventSequence) {
      throw new Error("The persisted event count must equal the state's eventSequence");
    }
    this.fullEvents.set(roomId, fullRows);
    this.publicEvents.set(roomId, publicRows);
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
