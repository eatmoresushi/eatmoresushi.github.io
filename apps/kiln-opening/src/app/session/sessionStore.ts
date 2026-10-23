/**
 * `SessionStore`: the live `GameSource` (UI plan §3.1–3.9).
 *
 * Plain TypeScript over a `GameApi` from `src/multiplayer/client.ts`; tested in node with a
 * fake API. It owns the room, the seat, the merged view, the event log and the session
 * status, and it implements the pre-game actions (create, join, resume, start, add and
 * remove computers, end session, leave, forget seat).
 *
 * Invariants:
 * - No optimistic state (K4). The view changes only when a server response arrives, and a
 *   game is merged only if its revision is not older than the current one (monotonic).
 *   Every merge creates a new view object, including a same-revision reconnect.
 * - One `commandId` per pending submission, reused by "Send again" after a transport
 *   failure, so a lost response can never turn into a false failure (§3.6).
 * - Public events are numbered from `game.eventSequence` and deduplicated by sequence, so
 *   nothing is announced twice (§3.2). Own secrets merge by sequence.
 * - Only the seat credential is written to storage (`savedSeat.ts`). The hand, looks, peeks
 *   and own secrets stay in memory.
 * - Computers are advanced whenever any current actor is a computer, routed only by
 *   `shouldAdvanceComputers` (§3.8).
 */

import { RULE_ERROR_TEXT } from "../../game/index.ts";
import type {
  AuthoritativeCommand,
  GameRuleErrorCode,
  PrivatePlayerView,
  PublicGameState,
} from "../../game/index.ts";
import { createGameApi, shouldAdvanceComputers } from "../../multiplayer/client.ts";
import type { GameApi } from "../../multiplayer/client.ts";
import type {
  CommandSuccess,
  MultiplayerError,
  MultiplayerErrorCode,
  MultiplayerResult,
  PrivateEventRecord,
  PublicEventRecord,
  PublicRoom,
  PublicSeat,
  RoomConnection,
} from "../../multiplayer/types.ts";
import {
  COMPUTER_TURN_TIMEOUT_MS,
  NON_HOST_ADVANCE_DELAY_MS,
  SYSTEM_CLOCK,
  requestComputerAdvance,
  transportError,
} from "./computerAdvance.ts";
import type { Clock } from "./computerAdvance.ts";
import {
  attachSecrets,
  batchOf,
  contiguousCursor,
  entriesFromCommand,
  entriesFromComputerBatch,
  entriesFromRecords,
  mergeLog,
  mergeSecrets,
} from "./eventLog.ts";
import { EMPTY_SNAPSHOT, IDLE_STATUS } from "./gameSource.ts";
import type {
  BatchOrigin,
  EventBatch,
  GameSnapshot,
  GameSource,
  LobbyAction,
  LogEntry,
  PendingSubmission,
  SessionStatus,
  StoredError,
  SubmitOutcome,
} from "./gameSource.ts";
import { SavedSeatStore, browserStorage } from "./savedSeat.ts";
import type { KeyValueStorage, SavedSeat } from "./savedSeat.ts";

/** Where the app finds the local in-memory backend, until the deletion commit (C2.2) moves it to `/test-api` (§3.9). */
export const LOCAL_BACKEND_ENDPOINT_V161 = "/test-api-v161";

export const SUBMIT_TIMEOUT_MS = 20_000;
export const ROOM_STATUS_INTERVAL_MS = { lobby: 1_000, playing: 5_000 } as const;

/** Reconnect failures after which the saved seat is forgotten (§3.9). */
export const FORGET_SEAT_CODES: ReadonlySet<MultiplayerErrorCode> = new Set<MultiplayerErrorCode>([
  "ROOM_NOT_FOUND",
  "AUTHENTICATION_FAILED",
  "UNSUPPORTED_RULES_VERSION",
  "RULES_FINGERPRINT_MISMATCH",
]);

/** Failures that mean the request may never have reached the rules engine (§3.6). */
export const TRANSPORT_CODES: ReadonlySet<MultiplayerErrorCode> = new Set<MultiplayerErrorCode>([
  "SERVICE_UNAVAILABLE",
  "INTERNAL_SERVER_ERROR",
]);

export type LobbyOutcome = { ok: true } | { ok: false; error: StoredError };

/** The pre-game and session actions (`useSession()` in `state/hooks.ts`). */
export interface SessionActions {
  /** Reconnects the saved seat of the last room, if any (on load). */
  restore(): Promise<LobbyOutcome | null>;
  create(displayName: string): Promise<LobbyOutcome>;
  join(roomCode: string, displayName: string): Promise<LobbyOutcome>;
  /** Resumes the saved seat of `roomCode`, or of the last room. */
  resume(roomCode?: string): Promise<LobbyOutcome>;
  start(): Promise<LobbyOutcome>;
  addComputer(): Promise<LobbyOutcome>;
  removeComputer(computerSeatId: string): Promise<LobbyOutcome>;
  /** Host only; ends the session for everyone. */
  endSession(): Promise<LobbyOutcome>;
  /** Leaves the view; the seat stays saved and can be resumed. */
  leave(): void;
  /** Forgets the saved seat of `roomCode` (default: the current or last room) and leaves it. */
  forgetSeat(roomCode?: string): void;
  clearError(): void;
}

/**
 * Phase 5's presentation hook (§8.4): called once per new batch with a function that
 * publishes the store's current snapshot. The phase 4 default applies at once.
 */
export type PresentBatch = (batch: EventBatch, apply: () => void) => void;

export interface SessionStoreOptions {
  api: GameApi;
  storage?: KeyValueStorage | null;
  clock?: Clock;
  newCommandId?: () => string;
  present?: PresentBatch;
  computerTimeoutMs?: number;
  nonHostDelayMs?: number;
  submitTimeoutMs?: number;
  roomStatusIntervalMs?: { lobby: number; playing: number };
}

/** The window/document events the store listens to in a browser (`attachToWindow`). */
export interface SessionWindow {
  addEventListener(type: "online" | "offline", listener: () => void): void;
  removeEventListener(type: "online" | "offline", listener: () => void): void;
  document: {
    visibilityState: string;
    addEventListener(type: "visibilitychange", listener: () => void): void;
    removeEventListener(type: "visibilitychange", listener: () => void): void;
  };
}

function isRuleCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(RULE_ERROR_TEXT, code);
}

/** A service error as a stored code plus details (§6.1). */
export function toStoredError(error: MultiplayerError): StoredError {
  if (isRuleCode(error.code)) {
    return {
      kind: "rule",
      error: { code: error.code as GameRuleErrorCode, message: error.message, details: { ...error.details } },
    };
  }
  return { kind: "mp", code: error.code, details: { ...error.details } };
}

function mpError(code: MultiplayerErrorCode, details?: Record<string, unknown>): StoredError {
  return details === undefined ? { kind: "mp", code } : { kind: "mp", code, details };
}

const ROOM_STATUS_RANK: Record<PublicRoom["status"], number> = { lobby: 0, playing: 1, finished: 2, abandoned: 2 };

/** The fresher of two room records; a room never moves back from playing or ended. */
function pickRoom(current: PublicRoom | null, incoming: PublicRoom | undefined): PublicRoom | null {
  if (incoming === undefined) return current;
  if (current === null || current.id !== incoming.id) return incoming;
  if (incoming.latestRevision < current.latestRevision) return current;
  if (ROOM_STATUS_RANK[incoming.status] < ROOM_STATUS_RANK[current.status]) return current;
  return incoming;
}

interface MergeInput {
  room?: PublicRoom;
  seats?: readonly PublicSeat[];
  seat?: PublicSeat;
  game: PublicGameState | null;
  own: PrivatePlayerView | null;
  ownSecrets: readonly PrivateEventRecord[];
  entries: readonly LogEntry[];
  /** Records read from the store: they may correct synthesized entries. */
  authoritative?: boolean;
  origin: BatchOrigin | null;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: MultiplayerError; transport: boolean };

export class SessionStore implements GameSource, SessionActions {
  private readonly api: GameApi;
  private readonly saved: SavedSeatStore;
  private readonly clock: Clock;
  private readonly newCommandId: () => string;
  private readonly present: PresentBatch;
  private readonly computerTimeoutMs: number;
  private readonly nonHostDelayMs: number;
  private readonly submitTimeoutMs: number;
  private readonly roomStatusIntervalMs: { lobby: number; playing: number };

  /** The truth; `published` is what subscribers see (equal unless a batch is presenting). */
  private current: GameSnapshot;
  private published: GameSnapshot;
  private readonly listeners = new Set<() => void>();

  private seatToken: string | null = null;
  private secrets: ReadonlyMap<number, PrivateEventRecord> = new Map();
  /** Bumped whenever the room connection changes; late results of an older one are dropped. */
  private generation = 0;
  private unsubscribeRoom: (() => void) | null = null;
  private historyRequested = false;

  private reconnectFlight: Promise<void> | null = null;
  private reconnectAgain = false;
  private pollFlight: Promise<void> | null = null;
  private pollAgain = false;
  private lastRoomCheckAt = 0;

  private advancing: { serial: number; controller: AbortController } | null = null;
  private advanceSerial = 0;
  private advanceTimer: { revision: number; handle: unknown } | null = null;
  /** The revision at which another client last won the advance race (backoff). */
  private raceRevision: number | null = null;
  private disposed = false;

  constructor(options: SessionStoreOptions) {
    this.api = options.api;
    this.saved = new SavedSeatStore(options.storage === undefined ? browserStorage() : options.storage);
    this.clock = options.clock ?? SYSTEM_CLOCK;
    this.newCommandId = options.newCommandId ?? (() => globalThis.crypto.randomUUID());
    this.present = options.present ?? ((_batch, apply) => apply());
    this.computerTimeoutMs = options.computerTimeoutMs ?? COMPUTER_TURN_TIMEOUT_MS;
    this.nonHostDelayMs = options.nonHostDelayMs ?? NON_HOST_ADVANCE_DELAY_MS;
    this.submitTimeoutMs = options.submitTimeoutMs ?? SUBMIT_TIMEOUT_MS;
    this.roomStatusIntervalMs = options.roomStatusIntervalMs ?? ROOM_STATUS_INTERVAL_MS;
    this.current = Object.freeze({ ...EMPTY_SNAPSHOT, savedRoomCode: this.saved.last()?.roomCode ?? null });
    this.published = this.current;
  }

  // ── GameSource ───────────────────────────────────────────────────────────────────

  getSnapshot = (): GameSnapshot => this.published;

  getServerSnapshot = (): GameSnapshot => this.published;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async submit(command: AuthoritativeCommand): Promise<SubmitOutcome> {
    const view = this.current.view;
    if (view === null || this.seatToken === null || this.current.room === null || this.current.status.sending) {
      return { kind: "ignored" };
    }
    const pending: PendingSubmission = { commandId: this.newCommandId(), expectedRevision: view.game.revision, command };
    return this.send(pending, true);
  }

  async resend(): Promise<SubmitOutcome> {
    const unsent = this.current.status.unsent;
    if (unsent === null || this.current.status.sending || this.seatToken === null) return { kind: "ignored" };
    return this.send(unsent, true);
  }

  reconnect(): Promise<void> {
    return this.reconnectOnce(false, true);
  }

  retryComputers(): void {
    const view = this.current.view;
    if (view === null || this.advancing !== null) return;
    this.cancelAdvanceTimer();
    this.raceRevision = null;
    this.setStatus({ computerFailure: null });
    if (this.canAdvanceComputers()) void this.advanceComputers(view.game.revision);
  }

  // ── Session actions ──────────────────────────────────────────────────────────────

  async restore(): Promise<LobbyOutcome | null> {
    this.saved.removeLegacyKeys();
    const last = this.saved.last();
    if (last === null) return null;
    return this.resume(last.roomCode);
  }

  async create(displayName: string): Promise<LobbyOutcome> {
    return this.lobby("create", () => this.api.createRoom(displayName), (value) => this.connect(value, value.seatToken));
  }

  async join(roomCode: string, displayName: string): Promise<LobbyOutcome> {
    return this.lobby("join", () => this.api.joinRoom(roomCode.trim().toUpperCase(), displayName), (value) =>
      this.connect(value, value.seatToken),
    );
  }

  async resume(roomCode?: string): Promise<LobbyOutcome> {
    const saved = roomCode === undefined ? this.saved.last() : this.saved.forRoom(roomCode);
    if (saved === null) {
      const error = mpError("AUTHENTICATION_FAILED", { reason: "no_saved_seat" });
      this.setStatus({ error });
      return { ok: false, error };
    }
    this.disconnect();
    const generation = this.generation;
    this.setStatus({ lobbyAction: "resume", error: null });
    const result = await this.call(() => this.api.reconnect(saved.roomCode, saved.seatToken));
    if (generation !== this.generation) return { ok: false, error: mpError("INVALID_REQUEST", { reason: "superseded" }) };
    if (!result.ok) {
      const error = toStoredError(result.error);
      if (FORGET_SEAT_CODES.has(result.error.code)) this.saved.forget(saved.roomCode);
      this.update({
        ...EMPTY_SNAPSHOT,
        savedRoomCode: this.saved.last()?.roomCode ?? null,
        status: { ...IDLE_STATUS, error, connection: result.transport ? "offline" : "live" },
      });
      return { ok: false, error };
    }
    this.connect({ ...result.value, seatToken: saved.seatToken }, saved.seatToken);
    this.setStatus({ lobbyAction: null });
    await this.fillHistory();
    return { ok: true };
  }

  async start(): Promise<LobbyOutcome> {
    const credentials = this.credentials();
    if (credentials === null) return { ok: false, error: mpError("GAME_NOT_STARTED") };
    return this.lobby("start", () => this.api.startGame(credentials.roomCode, credentials.seatToken, this.newCommandId()), (value) =>
      this.mergeCommand(value, "self"),
    );
  }

  async addComputer(): Promise<LobbyOutcome> {
    const credentials = this.credentials();
    if (credentials === null) return { ok: false, error: mpError("ROOM_NOT_FOUND") };
    return this.lobby(
      "add_computer",
      () => this.api.addComputerSeat(credentials.roomCode, credentials.seatToken, this.newCommandId()),
      (value) => this.merge({ room: value.room, seats: value.seats, game: null, own: null, ownSecrets: [], entries: [], origin: null }),
    );
  }

  async removeComputer(computerSeatId: string): Promise<LobbyOutcome> {
    const credentials = this.credentials();
    if (credentials === null) return { ok: false, error: mpError("ROOM_NOT_FOUND") };
    return this.lobby(
      "remove_computer",
      () => this.api.removeComputerSeat(credentials.roomCode, credentials.seatToken, computerSeatId),
      (value) => this.merge({ room: value.room, seats: value.seats, game: null, own: null, ownSecrets: [], entries: [], origin: null }),
    );
  }

  async endSession(): Promise<LobbyOutcome> {
    const credentials = this.credentials();
    if (credentials === null) return { ok: false, error: mpError("ROOM_NOT_FOUND") };
    return this.lobby(
      "end_session",
      () => this.api.endSession(credentials.roomCode, credentials.seatToken, this.newCommandId()),
      (value) => {
        this.cancelAdvanceTimer();
        this.merge({ room: value.room, game: null, own: null, ownSecrets: [], entries: [], origin: null });
      },
    );
  }

  leave(): void {
    this.disconnect();
    this.update({ ...EMPTY_SNAPSHOT, savedRoomCode: this.saved.last()?.roomCode ?? null });
  }

  forgetSeat(roomCode?: string): void {
    const code = roomCode ?? this.current.room?.code ?? this.saved.last()?.roomCode ?? null;
    if (code === null) return;
    this.saved.forget(code);
    if (this.current.room === null || this.current.room.code.toUpperCase() === code.toUpperCase()) {
      this.leave();
    } else {
      this.update({ savedRoomCode: this.saved.last()?.roomCode ?? null });
    }
  }

  clearError(): void {
    if (this.current.status.error !== null) this.setStatus({ error: null });
  }

  // ── Browser wiring ───────────────────────────────────────────────────────────────

  /** Reconnects when the page becomes visible or the network returns (§3.9). */
  attachToWindow(target: SessionWindow): () => void {
    const onVisibility = (): void => {
      if (target.document.visibilityState === "visible" && this.current.room !== null) void this.reconnectOnce(false);
    };
    const onOnline = (): void => {
      this.setStatus({ connection: "live" });
      if (this.current.room !== null) void this.reconnect();
    };
    const onOffline = (): void => {
      this.setStatus({ connection: "offline" });
    };
    target.document.addEventListener("visibilitychange", onVisibility);
    target.addEventListener("online", onOnline);
    target.addEventListener("offline", onOffline);
    return () => {
      target.document.removeEventListener("visibilitychange", onVisibility);
      target.removeEventListener("online", onOnline);
      target.removeEventListener("offline", onOffline);
    };
  }

  /** Stops every timer, request and subscription. */
  dispose(): void {
    this.disposed = true;
    this.disconnect();
    this.listeners.clear();
  }

  // ── Commands ─────────────────────────────────────────────────────────────────────

  private async send(pending: PendingSubmission, retryDuplicate: boolean): Promise<SubmitOutcome> {
    const credentials = this.credentials();
    if (credentials === null) return { kind: "ignored" };
    const generation = this.generation;
    this.setStatus({ sending: true, unsent: null, error: null });
    const result = await this.callWithTimeout(
      () =>
        this.api.executeCommand({
          roomCode: credentials.roomCode,
          seatToken: credentials.seatToken,
          commandId: pending.commandId,
          expectedRevision: pending.expectedRevision,
          command: pending.command,
        }),
      this.submitTimeoutMs,
      (late) => {
        // A response that arrives after the timeout is still authoritative.
        if (generation !== this.generation || !late.ok) return;
        this.mergeCommand(late.value, "self");
        if (this.current.status.unsent?.commandId === pending.commandId) this.setStatus({ unsent: null });
      },
    );
    if (generation !== this.generation) return { kind: "ignored" };
    if (result.ok) {
      this.setStatus({ sending: false, unsent: null });
      this.mergeCommand(result.value, "self");
      return { kind: "success", revision: result.value.revision };
    }
    if (result.transport) {
      this.setStatus({ sending: false, unsent: pending });
      void this.reconnect();
      return { kind: "unsent" };
    }
    const code = result.error.code;
    if (code === "STALE_REVISION") {
      // The service replays a committed commandId before it checks the revision, so a
      // stale answer means nothing was committed.
      this.setStatus({ sending: false });
      await this.reconnectOnce(true);
      return { kind: "stale" };
    }
    if (code === "SESSION_ENDED") {
      this.setStatus({ sending: false, error: mpError("SESSION_ENDED") });
      this.cancelAdvanceTimer();
      await this.reconnectOnce(true);
      return { kind: "ended" };
    }
    if (code === "DUPLICATE_COMMAND" && retryDuplicate) {
      // The ID belongs to another seat: retry once with a new one.
      this.setStatus({ sending: false });
      return this.send({ ...pending, commandId: this.newCommandId() }, false);
    }
    const error = toStoredError(result.error);
    this.setStatus({ sending: false, error });
    if (code === "PERSISTENCE_CONFLICT") void this.reconnectOnce(false);
    return { kind: "rejected", error };
  }

  // ── Computers ────────────────────────────────────────────────────────────────────

  private canAdvanceComputers(): boolean {
    const { view, room, seats, seat } = this.current;
    if (this.disposed || view === null || room === null || seat === null || this.seatToken === null) return false;
    if (room.status !== "playing") return false;
    return shouldAdvanceComputers(view.game, seats);
  }

  /** Called after every merge: starts or schedules the advance loop (§3.8 host first). */
  private scheduleComputers(): void {
    const view = this.current.view;
    if (view === null || !this.canAdvanceComputers()) {
      this.cancelAdvanceTimer();
      return;
    }
    if (this.advancing !== null) return;
    const revision = view.game.revision;
    if (this.current.status.computerFailure?.revision === revision) return;
    if (this.advanceTimer !== null && this.advanceTimer.revision === revision) return;
    this.cancelAdvanceTimer();
    // Host first; others (and the host after losing a race at this revision) wait.
    const isHost = this.current.seat?.isHost === true;
    const delay = isHost && this.raceRevision !== revision ? 0 : this.nonHostDelayMs;
    if (delay === 0) {
      void this.advanceComputers(revision);
      return;
    }
    const handle = this.clock.setTimeout(() => {
      this.advanceTimer = null;
      const now = this.current.view;
      if (now === null || now.game.revision !== revision || this.advancing !== null) return;
      if (this.current.status.computerFailure?.revision === revision) return;
      if (this.canAdvanceComputers()) void this.advanceComputers(revision);
    }, delay);
    this.advanceTimer = { revision, handle };
  }

  private cancelAdvanceTimer(): void {
    if (this.advanceTimer === null) return;
    this.clock.clearTimeout(this.advanceTimer.handle);
    this.advanceTimer = null;
  }

  private async advanceComputers(expectedRevision: number): Promise<void> {
    const credentials = this.credentials();
    if (credentials === null || this.advancing !== null) return;
    const generation = this.generation;
    const serial = ++this.advanceSerial;
    const controller = new AbortController();
    this.advancing = { serial, controller };
    this.setStatus({ advancingComputers: true });
    const outcome = await requestComputerAdvance({
      api: this.api,
      roomCode: credentials.roomCode,
      seatToken: credentials.seatToken,
      expectedRevision,
      clock: this.clock,
      timeoutMs: this.computerTimeoutMs,
      controller,
    });
    if (generation !== this.generation || this.advancing?.serial !== serial) return;
    this.advancing = null;
    switch (outcome.kind) {
      case "success": {
        this.raceRevision = null;
        const value = outcome.value;
        const synthesized = entriesFromComputerBatch(value.game, value.events, value.actorIds);
        const entries = await this.recordsFor(synthesized, value.game.eventSequence);
        if (generation !== this.generation) return;
        this.setStatus({ advancingComputers: false, computerFailure: null });
        this.merge({
          room: value.room,
          game: value.game,
          own: value.ownPrivateView,
          ownSecrets: value.ownSecrets,
          entries,
          authoritative: true,
          origin: "computers",
        });
        return;
      }
      case "race":
      case "ended":
        // Another client won (or the session ended): refresh, no latch and no banner.
        this.raceRevision = expectedRevision;
        this.setStatus({ advancingComputers: false });
        await this.reconnectOnce(true);
        return;
      case "failed":
        this.setStatus({
          advancingComputers: false,
          computerFailure: { revision: expectedRevision, error: toStoredError(outcome.error), timedOut: outcome.timedOut },
        });
        return;
    }
  }

  /**
   * The exact public records for a computer batch (revision and actor per command), read
   * once after the advance; the synthesized entries stand in for any the read misses.
   */
  private async recordsFor(synthesized: readonly LogEntry[], upTo: number): Promise<LogEntry[]> {
    const roomId = this.current.room?.id;
    const first = synthesized[0];
    if (roomId === undefined || first === undefined) return [...synthesized];
    let records: PublicEventRecord[] = [];
    try {
      records = await this.api.listPublicEvents(roomId, first.sequence - 1);
    } catch {
      records = [];
    }
    const bySequence = new Map<number, LogEntry>();
    for (const entry of synthesized) bySequence.set(entry.sequence, entry);
    for (const entry of entriesFromRecords(records)) {
      if (entry.sequence <= upTo && bySequence.has(entry.sequence)) bySequence.set(entry.sequence, entry);
    }
    return [...bySequence.values()];
  }

  // ── Reconnect and pings ──────────────────────────────────────────────────────────

  /**
   * Single-flight. Concurrent callers share the request in flight; `fresh` callers (who know
   * the head has moved since it started) get one more round after it.
   *
   * Only `announce` (the player's Reconnect, or a lost transport) shows the "Reconnecting…"
   * banner. The routine room check, the refresh after a stale command and the refresh after a
   * computer race run quietly: they are not a reconnection, and a banner that blinks for one
   * request shifts the whole screen.
   */
  private reconnectOnce(fresh: boolean, announce = false): Promise<void> {
    if (this.reconnectFlight !== null) {
      if (fresh) this.reconnectAgain = true;
      if (announce) this.setStatus({ reconnecting: true });
      return this.reconnectFlight;
    }
    const credentials = this.credentials();
    if (credentials === null) return Promise.resolve();
    const flight = (async () => {
      try {
        do {
          this.reconnectAgain = false;
          await this.runReconnect(credentials, announce);
        } while (this.reconnectAgain && this.credentials()?.seatToken === credentials.seatToken);
      } finally {
        this.reconnectFlight = null;
      }
    })();
    this.reconnectFlight = flight;
    return flight;
  }

  private async runReconnect(credentials: SavedSeat, announce: boolean): Promise<void> {
    const generation = this.generation;
    if (announce) this.setStatus({ reconnecting: true });
    this.lastRoomCheckAt = this.clock.now();
    const result = await this.call(() => this.api.reconnect(credentials.roomCode, credentials.seatToken));
    if (generation !== this.generation) return;
    if (!result.ok) {
      if (FORGET_SEAT_CODES.has(result.error.code)) {
        this.saved.forget(credentials.roomCode);
        this.disconnect();
        this.update({
          ...EMPTY_SNAPSHOT,
          savedRoomCode: this.saved.last()?.roomCode ?? null,
          status: { ...IDLE_STATUS, error: toStoredError(result.error) },
        });
        return;
      }
      this.setStatus({ reconnecting: false, connection: result.transport ? "offline" : this.current.status.connection });
      return;
    }
    const value = result.value;
    this.setStatus({ reconnecting: false, connection: "live" });
    this.merge({
      room: value.room,
      seats: value.seats,
      seat: value.seat,
      game: value.game,
      own: value.ownPrivateView,
      ownSecrets: value.ownSecrets,
      entries: [],
      origin: null,
    });
    if (value.game !== null && this.current.log.length === 0) await this.fillHistory();
  }

  /** The room's full public history, read once on resume (paginated by the API). */
  private async fillHistory(): Promise<void> {
    const roomId = this.current.room?.id;
    if (roomId === undefined || this.current.view === null || this.historyRequested) return;
    this.historyRequested = true;
    const generation = this.generation;
    let records: PublicEventRecord[] = [];
    try {
      records = await this.api.listPublicEvents(roomId, 0);
    } catch {
      this.historyRequested = false;
      return;
    }
    if (generation !== this.generation) return;
    // History is not announced: no batch.
    this.merge({ game: null, own: null, ownSecrets: [], entries: entriesFromRecords(records), authoritative: true, origin: null });
  }

  /**
   * A ping (Realtime row change, or the test backend's 500ms timer): read public events
   * after the contiguous cursor; reconnect only if there are new ones, or for a throttled
   * room-status check (§3.2).
   */
  private poll(): Promise<void> {
    if (this.pollFlight !== null) {
      this.pollAgain = true;
      return this.pollFlight;
    }
    const flight = (async () => {
      try {
        do {
          this.pollAgain = false;
          await this.runPoll();
        } while (this.pollAgain && this.current.room !== null);
      } finally {
        this.pollFlight = null;
      }
    })();
    this.pollFlight = flight;
    return flight;
  }

  private async runPoll(): Promise<void> {
    const room = this.current.room;
    const credentials = this.credentials();
    if (room === null || credentials === null) return;
    const generation = this.generation;
    let records: PublicEventRecord[] = [];
    try {
      records = await this.api.listPublicEvents(room.id, contiguousCursor(this.current.log));
    } catch {
      records = [];
    }
    if (generation !== this.generation) return;
    const known = new Set(this.current.log.map((entry) => entry.sequence));
    const fresh = records.filter((record) => !known.has(record.sequence));
    if (fresh.length > 0) {
      // Fetch the new head first, so the batch is published together with its view.
      if (this.reconnectFlight !== null) await this.reconnectFlight;
      if (generation !== this.generation) return;
      this.lastRoomCheckAt = this.clock.now();
      const result = await this.call(() => this.api.reconnect(credentials.roomCode, credentials.seatToken));
      if (generation !== this.generation) return;
      const entries = entriesFromRecords(records);
      if (result.ok) {
        const value = result.value;
        this.setStatus({ connection: "live" });
        this.merge({
          room: value.room,
          seats: value.seats,
          seat: value.seat,
          game: value.game,
          own: value.ownPrivateView,
          ownSecrets: value.ownSecrets,
          entries,
          authoritative: true,
          origin: "remote",
        });
      } else {
        this.merge({ game: null, own: null, ownSecrets: [], entries, authoritative: true, origin: "remote" });
        await this.reconnectOnce(true);
      }
      return;
    }
    const playing = this.current.view !== null && this.current.room?.status === "playing";
    const interval = playing ? this.roomStatusIntervalMs.playing : this.roomStatusIntervalMs.lobby;
    if (this.clock.now() - this.lastRoomCheckAt >= interval) await this.reconnectOnce(false);
  }

  // ── Connection lifecycle ─────────────────────────────────────────────────────────

  private connect(value: RoomConnection, seatToken: string): void {
    this.disconnect();
    this.seatToken = seatToken;
    this.saved.save({ roomCode: value.room.code, seatToken });
    this.current = Object.freeze({
      ...EMPTY_SNAPSHOT,
      room: value.room,
      seats: value.seats,
      seat: value.seat,
      savedRoomCode: value.room.code.toUpperCase(),
      status: { ...IDLE_STATUS, lobbyAction: this.current.status.lobbyAction },
    });
    this.lastRoomCheckAt = this.clock.now();
    this.merge({ game: value.game, own: value.ownPrivateView, ownSecrets: value.ownSecrets, entries: [], origin: null });
    const generation = this.generation;
    this.unsubscribeRoom = this.api.subscribe(value.room.id, () => {
      if (generation === this.generation) void this.poll();
    });
  }

  /** Drops the room connection: subscription, timers, the advance request, late results. */
  private disconnect(): void {
    this.generation += 1;
    this.unsubscribeRoom?.();
    this.unsubscribeRoom = null;
    this.cancelAdvanceTimer();
    this.advancing?.controller.abort();
    this.advancing = null;
    this.raceRevision = null;
    this.seatToken = null;
    this.secrets = new Map();
    this.historyRequested = false;
    this.reconnectAgain = false;
    this.pollAgain = false;
  }

  private credentials(): SavedSeat | null {
    const room = this.current.room;
    return room === null || this.seatToken === null ? null : { roomCode: room.code, seatToken: this.seatToken };
  }

  // ── Merging ──────────────────────────────────────────────────────────────────────

  private mergeCommand(value: CommandSuccess, origin: BatchOrigin): void {
    this.merge({
      room: value.room,
      game: value.game,
      own: value.ownPrivateView,
      ownSecrets: value.ownSecrets,
      entries: entriesFromCommand(value.game, value.events, value.actorId),
      origin,
    });
  }

  /** The monotonic merge of §3.2. */
  private merge(input: MergeInput): void {
    const before = this.current;
    const secrets = mergeSecrets(this.secrets, input.ownSecrets);
    this.secrets = secrets;
    const currentRevision = before.view?.game.revision ?? -1;
    const seat = input.seat ?? before.seat;
    const applied = input.game !== null && input.game.revision >= currentRevision && seat !== null;
    const stale = input.game !== null && !applied;

    const room = stale ? before.room : pickRoom(before.room, input.room);
    const seats = input.seats !== undefined && !stale ? input.seats : before.seats;
    const view =
      applied && input.game !== null && seat !== null
        ? { viewerId: seat.playerId, game: input.game, own: input.own }
        : before.view;

    const merged = mergeLog(before.log, input.entries, secrets, input.authoritative === true ? { authoritative: true } : {});
    const log = attachSecrets(merged.log, secrets);
    const batchRevision = Math.max(view?.game.revision ?? 0, ...merged.added.map((entry) => entry.revision));
    const batch = input.origin !== null && !stale ? batchOf(merged.added, input.origin, batchRevision) : null;

    let status = before.status;
    if (
      status.computerFailure !== null &&
      view !== null &&
      view.game.revision !== status.computerFailure.revision
    ) {
      status = { ...status, computerFailure: null };
    }

    const nextSeat = stale ? before.seat : seat;
    const unchanged =
      room === before.room &&
      seats === before.seats &&
      nextSeat === before.seat &&
      view === before.view &&
      log === before.log &&
      batch === null &&
      status === before.status;
    if (!unchanged) {
      this.current = Object.freeze({
        ...before,
        room,
        seats,
        seat: nextSeat,
        view,
        log,
        lastBatch: batch ?? before.lastBatch,
        status,
      });
    }
    if (batch !== null) this.present(batch, () => this.publish());
    else this.publish();
    if (applied || input.seats !== undefined || input.room !== undefined) this.scheduleComputers();
  }

  // ── Snapshot plumbing ────────────────────────────────────────────────────────────

  private setStatus(patch: Partial<SessionStatus>): void {
    this.update({ status: { ...this.current.status, ...patch } });
  }

  private update(patch: Partial<GameSnapshot>): void {
    this.current = Object.freeze({ ...this.current, ...patch });
    this.publish();
  }

  private publish(): void {
    if (this.published === this.current) return;
    this.published = this.current;
    for (const listener of [...this.listeners]) listener();
  }

  private async lobby<T>(action: LobbyAction, request: () => Promise<MultiplayerResult<T>>, apply: (value: T) => void): Promise<LobbyOutcome> {
    if (this.current.status.lobbyAction !== null) return { ok: false, error: mpError("INVALID_REQUEST", { reason: "busy" }) };
    const generation = this.generation;
    this.setStatus({ lobbyAction: action, error: null });
    const result = await this.call(request);
    // create/join replace the connection, so only a lobby action on the same room is dropped.
    if (action !== "create" && action !== "join" && generation !== this.generation) {
      return { ok: false, error: mpError("INVALID_REQUEST", { reason: "superseded" }) };
    }
    if (!result.ok) {
      const error = toStoredError(result.error);
      this.setStatus({ lobbyAction: null, error, ...(result.transport ? { connection: "offline" as const } : {}) });
      if (result.error.code === "SESSION_ENDED") void this.reconnectOnce(true);
      return { ok: false, error };
    }
    this.setStatus({ lobbyAction: null });
    apply(result.value);
    return { ok: true };
  }

  /** A request that never throws: a thrown transport error becomes `SERVICE_UNAVAILABLE`. */
  private async call<T>(request: () => Promise<MultiplayerResult<T>>): Promise<Outcome<T>> {
    try {
      const result = await request();
      if (result.ok) return { ok: true, value: result.value };
      return { ok: false, error: result.error, transport: TRANSPORT_CODES.has(result.error.code) };
    } catch {
      return { ok: false, error: transportError("request"), transport: true };
    }
  }

  /** `call` with a timeout; a response after the timeout goes to `late`. */
  private async callWithTimeout<T>(
    request: () => Promise<MultiplayerResult<T>>,
    timeoutMs: number,
    late: (result: Outcome<T>) => void,
  ): Promise<Outcome<T>> {
    let timedOut = false;
    let timer: unknown = null;
    const pending = this.call(request);
    const timeout = new Promise<Outcome<T>>((resolve) => {
      timer = this.clock.setTimeout(() => {
        timedOut = true;
        resolve({ ok: false, error: transportError("timeout"), transport: true });
      }, timeoutMs);
    });
    const result = await Promise.race([pending, timeout]);
    if (timer !== null) this.clock.clearTimeout(timer);
    if (timedOut) void pending.then(late);
    return result;
  }
}

/**
 * The browser store: the multiplayer client (Supabase, or the local backend at
 * `/test-api-v161` when `VITE_E2E_LOCAL_BACKEND=1`), `localStorage`, and window events.
 * A missing Supabase configuration yields a store whose every request fails with
 * `SERVER_CONFIGURATION_ERROR`, so the home screen can say so.
 */
export function createBrowserSessionStore(options: Omit<SessionStoreOptions, "api"> = {}): SessionStore {
  let api: GameApi;
  try {
    api = createGameApi({ localEndpoint: LOCAL_BACKEND_ENDPOINT_V161 });
  } catch {
    api = unavailableGameApi("SERVER_CONFIGURATION_ERROR");
  }
  const store = new SessionStore({ ...options, api });
  if (typeof window !== "undefined") store.attachToWindow(window);
  return store;
}

/** A `GameApi` whose every request fails with `code`. */
export function unavailableGameApi(code: MultiplayerErrorCode): GameApi {
  const failure = async <T>(): Promise<MultiplayerResult<T>> => ({
    ok: false,
    error: { code, message: "Online play is unavailable.", details: {}, currentRevision: null },
  });
  return {
    createRoom: failure,
    joinRoom: failure,
    reconnect: failure,
    startGame: failure,
    endSession: failure,
    addComputerSeat: failure,
    removeComputerSeat: failure,
    advanceComputers: failure,
    executeCommand: failure,
    listPrivateEvents: failure,
    listPublicEvents: async () => [],
    subscribe: () => () => undefined,
  };
}
