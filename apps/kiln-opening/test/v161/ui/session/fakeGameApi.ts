/**
 * Test doubles for the session layer (UI plan §9.1 item 4, §9.2):
 * - `ServiceGameApi`: a `GameApi` over the real `AuthoritativeGameService` and in-memory
 *   store, with injectable faults (throw, lost response, error, held or hanging request),
 *   manual pings and a call log. Responses are JSON round-tripped, as over the wire.
 * - `FakeClock`: manual timers for the advance delay, timeouts and throttles.
 * - `MemoryStorage`: a `KeyValueStorage` that records every write.
 *
 * Shell-state fixtures (reconnecting, offline, computer failure, unsent command, ended
 * session) are driven through these.
 */

import type { ActorView, PlayerId } from "../../../../src/game/index.ts";
import type { GameApi, ExecuteCommandInput } from "../../../../src/multiplayer/client.ts";
import type {
  AuthoritativeGameService,
  ComputerAdvanceSuccess,
  CommandSuccess,
  EndSessionSuccess,
  InMemoryMultiplayerStore,
  LobbySeatUpdateSuccess,
  MultiplayerError,
  MultiplayerErrorCode,
  MultiplayerResult,
  PrivateEventRecord,
  PublicEventRecord,
  ReconnectResult,
  RoomConnection,
} from "../../../../src/multiplayer/index.ts";
import type { Clock } from "../../../../src/app/session/computerAdvance.ts";
import type { KeyValueStorage } from "../../../../src/app/session/savedSeat.ts";
import type { SessionStore } from "../../../../src/app/session/sessionStore.ts";

export type ApiOperation =
  | "createRoom"
  | "joinRoom"
  | "reconnect"
  | "startGame"
  | "endSession"
  | "addComputerSeat"
  | "removeComputerSeat"
  | "advanceComputers"
  | "executeCommand"
  | "listPublicEvents"
  | "listPrivateEvents";

export type Fault =
  /** The request never reaches the service: a network error. */
  | { kind: "throw" }
  /** The service runs and commits, then the response is lost: a network error. */
  | { kind: "lose_response" }
  /** The service is not called; this failure is returned. */
  | { kind: "error"; code: MultiplayerErrorCode; currentRevision?: number | null }
  /** The service runs now; its response is returned only after `release()`. */
  | { kind: "hold_response"; gate: Promise<void> }
  /** Never answers unless aborted (abort rejects with an AbortError). */
  | { kind: "hang" };

export interface ApiCall {
  operation: ApiOperation;
  args: unknown[];
}

export function deferred(): { promise: Promise<void>; release: () => void } {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

export function failure(code: MultiplayerErrorCode, currentRevision: number | null = null): MultiplayerError {
  return { code, message: `injected ${code}`, details: {}, currentRevision };
}

function wire<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class ServiceGameApi implements GameApi {
  readonly calls: ApiCall[] = [];
  private readonly faults = new Map<ApiOperation, Fault[]>();
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(
    readonly service: AuthoritativeGameService,
    readonly store: InMemoryMultiplayerStore,
    readonly authUserId = "auth-test",
  ) {}

  /** Queues a fault for the next call of `operation`. */
  fault(operation: ApiOperation, fault: Fault): void {
    const queue = this.faults.get(operation) ?? [];
    queue.push(fault);
    this.faults.set(operation, queue);
  }

  callsOf(operation: ApiOperation): ApiCall[] {
    return this.calls.filter((call) => call.operation === operation);
  }

  /** A subscription ping (Realtime row change / the test backend's timer). */
  ping(roomId?: string): void {
    for (const [room, listeners] of this.listeners) {
      if (roomId !== undefined && room !== roomId) continue;
      for (const listener of [...listeners]) listener();
    }
  }

  subscriberCount(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }

  createRoom(displayName: string): Promise<MultiplayerResult<RoomConnection>> {
    return this.run("createRoom", [displayName], () => this.service.createRoom({ displayName, authUserId: this.authUserId }));
  }

  joinRoom(roomCode: string, displayName: string): Promise<MultiplayerResult<RoomConnection>> {
    return this.run("joinRoom", [roomCode, displayName], () => this.service.joinRoom({ roomCode, displayName, authUserId: this.authUserId }));
  }

  reconnect(roomCode: string, seatToken: string): Promise<MultiplayerResult<ReconnectResult>> {
    return this.run("reconnect", [roomCode, seatToken], () => this.service.reconnect({ roomCode, seatToken }));
  }

  startGame(roomCode: string, seatToken: string, commandId: string): Promise<MultiplayerResult<CommandSuccess>> {
    return this.run("startGame", [roomCode, seatToken, commandId], () => this.service.startGame({ roomCode, seatToken, commandId }));
  }

  endSession(roomCode: string, seatToken: string, commandId: string): Promise<MultiplayerResult<EndSessionSuccess>> {
    return this.run("endSession", [roomCode, seatToken, commandId], () => this.service.endSession({ roomCode, seatToken, commandId }));
  }

  addComputerSeat(roomCode: string, seatToken: string, commandId: string): Promise<MultiplayerResult<LobbySeatUpdateSuccess>> {
    return this.run("addComputerSeat", [roomCode, seatToken, commandId], () => this.service.addComputerSeat({ roomCode, seatToken, commandId }));
  }

  removeComputerSeat(roomCode: string, seatToken: string, computerSeatId: string): Promise<MultiplayerResult<LobbySeatUpdateSuccess>> {
    return this.run("removeComputerSeat", [roomCode, seatToken, computerSeatId], () =>
      this.service.removeComputerSeat({ roomCode, seatToken, computerSeatId }),
    );
  }

  advanceComputers(
    roomCode: string,
    seatToken: string,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<MultiplayerResult<ComputerAdvanceSuccess>> {
    return this.run(
      "advanceComputers",
      [roomCode, seatToken, expectedRevision],
      () => this.service.advanceComputerTurns({ roomCode, seatToken, expectedRevision }),
      signal,
    );
  }

  executeCommand(input: ExecuteCommandInput): Promise<MultiplayerResult<CommandSuccess>> {
    return this.run("executeCommand", [wire(input)], () => this.service.executeCommand(wire(input)));
  }

  async listPublicEvents(roomId: string, afterSequence = 0): Promise<PublicEventRecord[]> {
    const result = await this.run("listPublicEvents", [roomId, afterSequence], async () => ({
      ok: true as const,
      value: await this.store.listPublicEvents(roomId, afterSequence),
    }));
    return result.ok ? result.value : [];
  }

  listPrivateEvents(roomCode: string, seatToken: string, afterSequence = 0): Promise<MultiplayerResult<PrivateEventRecord[]>> {
    return this.run("listPrivateEvents", [roomCode, seatToken, afterSequence], () =>
      this.service.listPrivateEvents({ roomCode, seatToken, afterSequence }),
    );
  }

  subscribe(roomId: string, onPublicChange: () => void): () => void {
    const set = this.listeners.get(roomId) ?? new Set<() => void>();
    set.add(onPublicChange);
    this.listeners.set(roomId, set);
    return () => {
      set.delete(onPublicChange);
    };
  }

  private async run<T>(
    operation: ApiOperation,
    args: unknown[],
    invoke: () => Promise<MultiplayerResult<T>>,
    signal?: AbortSignal,
  ): Promise<MultiplayerResult<T>> {
    this.calls.push({ operation, args });
    const fault = this.faults.get(operation)?.shift();
    if (fault?.kind === "throw") throw new TypeError("Failed to fetch");
    if (fault?.kind === "error") return { ok: false, error: failure(fault.code, fault.currentRevision ?? null) };
    if (fault?.kind === "hang") {
      return new Promise<MultiplayerResult<T>>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    const result = wire(await invoke());
    if (fault?.kind === "lose_response") throw new TypeError("Failed to fetch");
    if (fault?.kind === "hold_response") await fault.gate;
    return result;
  }
}

export class FakeClock implements Clock {
  time = 1_000_000;
  private nextId = 1;
  private timers: Array<{ id: number; at: number; callback: () => void }> = [];

  now(): number {
    return this.time;
  }

  setTimeout(callback: () => void, ms: number): unknown {
    const id = this.nextId;
    this.nextId += 1;
    this.timers.push({ id, at: this.time + ms, callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers = this.timers.filter((timer) => timer.id !== handle);
  }

  pending(): number {
    return this.timers.length;
  }

  /** Moves time forward, firing due timers in order, and lets promises settle. */
  async advance(ms: number): Promise<void> {
    const target = this.time + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = this.timers[0];
      if (next === undefined || next.at > target) break;
      this.timers.shift();
      this.time = next.at;
      next.callback();
      await settle();
    }
    this.time = target;
    await settle();
  }
}

export class MemoryStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  readonly writes: Array<{ key: string; value: string }> = [];

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes.push({ key, value });
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** Lets every pending promise chain run (the fake API resolves in microtasks). */
export async function settle(rounds = 25): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/** The store's current view as an `ActorView`, for building commands. */
export function actorViewOfStore(store: SessionStore): ActorView {
  const view = store.getSnapshot().view;
  if (view === null || view.viewerId === null || view.own === null) throw new Error("No seated view");
  return { ...view, viewerId: view.viewerId, own: view.own };
}

export function playerOf(store: SessionStore): PlayerId {
  const seat = store.getSnapshot().seat;
  if (seat === null) throw new Error("No seat");
  return seat.playerId;
}
