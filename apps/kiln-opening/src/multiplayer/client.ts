/**
 * Browser transport for the V1.6.2 multiplayer service: the Supabase Edge Function in
 * production, the Vite test backend in local E2E runs.
 *
 * The client never decides who acts by a rule of its own: `shouldAdvanceComputers` routes
 * on `decisionPrompt(game)` alone (DESIGN §3.4, §4.6), in every decision mode.
 */

import { FunctionsHttpError, createClient } from "@supabase/supabase-js";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { decisionPrompt } from "../game/index.ts";
import type {
  ComputerAdvanceSuccess,
  CommandSuccess,
  EndSessionSuccess,
  LobbySeatUpdateSuccess,
  MultiplayerError,
  MultiplayerResult,
  PrivateEventRecord,
  PublicEventRecord,
  PublicGameEvent,
  PublicGameState,
  PublicSeat,
  ReconnectResult,
  RoomConnection,
} from "./types.ts";

const EXPECTED_RULES_VERSION = "1.6.2";
const EXPECTED_SCHEMA_VERSION = 9;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * True when any current actor is a computer seat, whatever the decision mode: the client
 * then calls `advance_computers` (DESIGN §3.4). In `parallel` and `simultaneous_secret`
 * windows a human may act at the same time; the service tolerates the revision race.
 */
export function shouldAdvanceComputers(game: PublicGameState | null, seats: readonly PublicSeat[]): boolean {
  if (game === null || game.phase.type === "finished") return false;
  const computers = new Set(seats.filter((seat) => seat.isComputer).map((seat) => seat.playerId));
  return decisionPrompt(game).actorIds.some((actorId) => computers.has(actorId));
}

/**
 * An older Edge deployment can accept its own old rooms; that does not make their
 * snapshots compatible with this client. Check before installing them, and drop the whole
 * payload (hand, seat token) rather than pass any of it on.
 */
export function snapshotCompatibilityError(response: unknown): MultiplayerError | null {
  if (!record(response) || response["ok"] !== true || !record(response["value"])) return null;
  const value = response["value"];
  const room = record(value["room"]) ? value["room"] : null;
  const game = record(value["game"]) ? value["game"] : null;
  if (
    (room !== null && room["rulesVersion"] !== EXPECTED_RULES_VERSION) ||
    (game !== null && (game["rulesVersion"] !== EXPECTED_RULES_VERSION || game["schemaVersion"] !== EXPECTED_SCHEMA_VERSION))
  ) {
    const revision = game?.["revision"] ?? room?.["latestRevision"];
    return {
      code: "UNSUPPORTED_RULES_VERSION",
      message:
        "The multiplayer service returned a room or saved game that does not match V1.6.2. Update the game service and create a compatible room before continuing.",
      details: { expectedRulesVersion: EXPECTED_RULES_VERSION, expectedSchemaVersion: EXPECTED_SCHEMA_VERSION },
      currentRevision: typeof revision === "number" && Number.isFinite(revision) ? revision : null,
    };
  }
  return null;
}

function isMultiplayerFailure(value: unknown): value is { ok: false; error: MultiplayerError } {
  if (!record(value) || value["ok"] !== false || !record(value["error"])) return false;
  const failure = value["error"];
  return (
    typeof failure["code"] === "string" &&
    typeof failure["message"] === "string" &&
    record(failure["details"]) &&
    (failure["currentRevision"] === null || typeof failure["currentRevision"] === "number")
  );
}

/**
 * Salvage a failure that carries a usable `error.code` but omits the rest of the envelope,
 * so a deployment or migration problem is never reported as a commit conflict.
 */
function salvageMultiplayerFailure(value: unknown): { ok: false; error: MultiplayerError } | null {
  if (!record(value) || value["ok"] !== false || !record(value["error"])) return null;
  const failure = value["error"];
  const code = failure["code"];
  if (typeof code !== "string" || code.length === 0) return null;
  const message = failure["message"];
  const details = failure["details"];
  const currentRevision = failure["currentRevision"];
  return {
    ok: false,
    error: {
      code: code as MultiplayerError["code"],
      message: typeof message === "string" && message.length > 0 ? message : "The multiplayer service rejected the request.",
      details: record(details) ? (details as MultiplayerError["details"]) : {},
      currentRevision: typeof currentRevision === "number" ? currentRevision : null,
    },
  };
}

export async function parseMultiplayerFunctionFailure(error: unknown): Promise<{ ok: false; error: MultiplayerError } | null> {
  if (!(error instanceof FunctionsHttpError)) return null;
  const context = error.context as { json?: () => Promise<unknown> };
  if (typeof context.json !== "function") return null;
  try {
    const value = await context.json();
    return isMultiplayerFailure(value) ? value : salvageMultiplayerFailure(value);
  } catch {
    return null;
  }
}

export interface ExecuteCommandInput {
  roomCode: string;
  seatToken: string;
  commandId: string;
  expectedRevision: number;
  /** An `AuthoritativeCommand`; the service shape-checks it with `parseCommand`. */
  command: unknown;
}

export interface GameApi {
  createRoom(displayName: string): Promise<MultiplayerResult<RoomConnection>>;
  joinRoom(roomCode: string, displayName: string): Promise<MultiplayerResult<RoomConnection>>;
  reconnect(roomCode: string, seatToken: string): Promise<MultiplayerResult<ReconnectResult>>;
  startGame(roomCode: string, seatToken: string, commandId: string): Promise<MultiplayerResult<CommandSuccess>>;
  endSession(roomCode: string, seatToken: string, commandId: string): Promise<MultiplayerResult<EndSessionSuccess>>;
  addComputerSeat(roomCode: string, seatToken: string, commandId: string): Promise<MultiplayerResult<LobbySeatUpdateSuccess>>;
  removeComputerSeat(roomCode: string, seatToken: string, computerSeatId: string): Promise<MultiplayerResult<LobbySeatUpdateSuccess>>;
  advanceComputers(
    roomCode: string,
    seatToken: string,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<MultiplayerResult<ComputerAdvanceSuccess>>;
  executeCommand(input: ExecuteCommandInput): Promise<MultiplayerResult<CommandSuccess>>;
  listPublicEvents(roomId: string, afterSequence?: number): Promise<PublicEventRecord[]>;
  /** This seat's secret event payloads (its setup deal, own looks, chosen bottom order…). */
  listPrivateEvents(roomCode: string, seatToken: string, afterSequence?: number): Promise<MultiplayerResult<PrivateEventRecord[]>>;
  subscribe(roomId: string, onPublicChange: () => void): () => void;
}

/** The V1.4 app's local backend path, and the default of `createGameApi`. */
export const DEFAULT_LOCAL_ENDPOINT = "/test-api";

class TestHttpGameApi implements GameApi {
  constructor(private readonly endpoint: string = DEFAULT_LOCAL_ENDPOINT) {}

  private async call<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<MultiplayerResult<T>> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-e2e-user": this.testUserId() },
      body: JSON.stringify(body),
      ...(signal === undefined ? {} : { signal }),
    });
    const data: unknown = await response.json();
    const compatibilityError = snapshotCompatibilityError(data);
    if (compatibilityError !== null) return { ok: false, error: compatibilityError };
    return data as MultiplayerResult<T>;
  }

  createRoom(displayName: string): Promise<MultiplayerResult<RoomConnection>> {
    return this.call({ operation: "create_room", displayName });
  }

  joinRoom(roomCode: string, displayName: string): Promise<MultiplayerResult<RoomConnection>> {
    return this.call({ operation: "join_room", roomCode, displayName });
  }

  reconnect(roomCode: string, seatToken: string): Promise<MultiplayerResult<ReconnectResult>> {
    return this.call({ operation: "reconnect", roomCode, seatToken });
  }

  startGame(roomCode: string, seatToken: string, commandId: string): Promise<MultiplayerResult<CommandSuccess>> {
    return this.call({ operation: "start_game", roomCode, seatToken, commandId });
  }

  endSession(roomCode: string, seatToken: string, commandId: string): Promise<MultiplayerResult<EndSessionSuccess>> {
    return this.call({ operation: "end_session", roomCode, seatToken, commandId });
  }

  addComputerSeat(roomCode: string, seatToken: string, commandId: string): Promise<MultiplayerResult<LobbySeatUpdateSuccess>> {
    return this.call({ operation: "add_computer", roomCode, seatToken, commandId });
  }

  removeComputerSeat(roomCode: string, seatToken: string, computerSeatId: string): Promise<MultiplayerResult<LobbySeatUpdateSuccess>> {
    return this.call({ operation: "remove_computer", roomCode, seatToken, computerSeatId });
  }

  advanceComputers(
    roomCode: string,
    seatToken: string,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<MultiplayerResult<ComputerAdvanceSuccess>> {
    return this.call({ operation: "advance_computers", roomCode, seatToken, expectedRevision }, signal);
  }

  executeCommand(input: ExecuteCommandInput): Promise<MultiplayerResult<CommandSuccess>> {
    return this.call({ operation: "game_action", ...input });
  }

  async listPublicEvents(roomId: string, afterSequence = 0): Promise<PublicEventRecord[]> {
    const result = await this.call<PublicEventRecord[]>({ operation: "list_public_events", roomId, afterSequence });
    return result.ok ? result.value : [];
  }

  listPrivateEvents(roomCode: string, seatToken: string, afterSequence = 0): Promise<MultiplayerResult<PrivateEventRecord[]>> {
    return this.call({ operation: "list_private_events", roomCode, seatToken, afterSequence });
  }

  subscribe(_roomId: string, onPublicChange: () => void): () => void {
    const timer = window.setInterval(onPublicChange, 500);
    return () => window.clearInterval(timer);
  }

  private testUserId(): string {
    const key = "kiln-opening:e2e-user";
    const existing = sessionStorage.getItem(key);
    if (existing !== null) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(key, created);
    return created;
  }
}

class SupabaseGameApi implements GameApi {
  private readonly client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  }

  createRoom(displayName: string): Promise<MultiplayerResult<RoomConnection>> {
    return this.call("create_room", { displayName });
  }

  joinRoom(roomCode: string, displayName: string): Promise<MultiplayerResult<RoomConnection>> {
    return this.call("join_room", { roomCode, displayName });
  }

  reconnect(roomCode: string, seatToken: string): Promise<MultiplayerResult<ReconnectResult>> {
    return this.call("reconnect", { roomCode, seatToken });
  }

  startGame(roomCode: string, seatToken: string, commandId: string): Promise<MultiplayerResult<CommandSuccess>> {
    return this.call("start_game", { roomCode, seatToken, commandId });
  }

  endSession(roomCode: string, seatToken: string, commandId: string): Promise<MultiplayerResult<EndSessionSuccess>> {
    return this.call("end_session", { roomCode, seatToken, commandId });
  }

  addComputerSeat(roomCode: string, seatToken: string, commandId: string): Promise<MultiplayerResult<LobbySeatUpdateSuccess>> {
    return this.call("add_computer", { roomCode, seatToken, commandId });
  }

  removeComputerSeat(roomCode: string, seatToken: string, computerSeatId: string): Promise<MultiplayerResult<LobbySeatUpdateSuccess>> {
    return this.call("remove_computer", { roomCode, seatToken, computerSeatId });
  }

  advanceComputers(
    roomCode: string,
    seatToken: string,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<MultiplayerResult<ComputerAdvanceSuccess>> {
    return this.call("advance_computers", { roomCode, seatToken, expectedRevision }, signal);
  }

  executeCommand(input: ExecuteCommandInput): Promise<MultiplayerResult<CommandSuccess>> {
    return this.call("game_action", { ...input });
  }

  listPrivateEvents(roomCode: string, seatToken: string, afterSequence = 0): Promise<MultiplayerResult<PrivateEventRecord[]>> {
    return this.call("list_private_events", { roomCode, seatToken, afterSequence });
  }

  async listPublicEvents(roomId: string, afterSequence = 0): Promise<PublicEventRecord[]> {
    await this.ensureSession();
    const events: PublicEventRecord[] = [];
    let cursor = afterSequence;
    while (true) {
      const { data, error } = await this.client
        .from("game_public_events")
        .select("room_id, sequence, revision, command_id, actor_player_id, payload")
        .eq("room_id", roomId)
        .gt("sequence", cursor)
        .order("sequence", { ascending: true })
        .limit(500);
      if (error !== null || data === null) return [];
      // An API row cap may be smaller than the page size. Only an empty page establishes
      // that the entire public history has been read.
      if (data.length === 0) return events;
      const nextCursor = Number(data[data.length - 1]?.sequence);
      if (!Number.isFinite(nextCursor) || nextCursor <= cursor) return [];
      events.push(
        ...data.map((row) => ({
          roomId: String(row.room_id),
          sequence: Number(row.sequence),
          revision: Number(row.revision),
          commandId: String(row.command_id),
          actorId: String(row.actor_player_id),
          event: row.payload as PublicGameEvent,
        })),
      );
      cursor = nextCursor;
    }
  }

  subscribe(roomId: string, onPublicChange: () => void): () => void {
    const channel: RealtimeChannel = this.client
      .channel(`kiln-opening:${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_public_states", filter: `room_id=eq.${roomId}` }, onPublicChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` }, onPublicChange)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, onPublicChange)
      .subscribe();
    return () => {
      void this.client.removeChannel(channel);
    };
  }

  private async call<T>(operation: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<MultiplayerResult<T>> {
    await this.ensureSession();
    const { data, error } = await this.client.functions.invoke("game-action", {
      body: { operation, ...body },
      ...(signal === undefined ? {} : { signal }),
    });
    if (error !== null) {
      const ruleFailure = await parseMultiplayerFunctionFailure(error);
      if (ruleFailure !== null) return ruleFailure;
      // Nothing structured came back, so the request never reached the rules engine.
      return {
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: `The multiplayer service could not be reached (${operation}).`,
          details: { operation },
          currentRevision: null,
        },
      };
    }
    const compatibilityError = snapshotCompatibilityError(data);
    if (compatibilityError !== null) return { ok: false, error: compatibilityError };
    return data as MultiplayerResult<T>;
  }

  private async ensureSession(): Promise<void> {
    const { data } = await this.client.auth.getSession();
    if (data.session !== null) return;
    const { error } = await this.client.auth.signInAnonymously();
    if (error !== null) throw error;
  }
}

export interface CreateGameApiOptions {
  /**
   * The local test backend's path, used only when `VITE_E2E_LOCAL_BACKEND=1`. Defaults to
   * `/test-api`. The V1.6.1 app passes `/test-api-v161` until cutover (UI plan §3.9), when
   * this option is removed again.
   */
  localEndpoint?: string;
}

export function createGameApi(options: CreateGameApiOptions = {}): GameApi {
  if (import.meta.env.VITE_E2E_LOCAL_BACKEND === "1") return new TestHttpGameApi(options.localEndpoint ?? DEFAULT_LOCAL_ENDPOINT);
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (url === undefined || anonKey === undefined) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
  }
  return new SupabaseGameApi(url, anonKey);
}
