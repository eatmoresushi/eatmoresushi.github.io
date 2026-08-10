import { FunctionsHttpError, createClient } from "@supabase/supabase-js";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type {
  ComputerAdvanceSuccess,
  AuthoritativeCommand,
  CommandSuccess,
  EndSessionSuccess,
  LobbySeatUpdateSuccess,
  MultiplayerError,
  MultiplayerResult,
  PublicEventRecord,
  PublicGameEvent,
  ReconnectResult,
  RoomConnection,
} from "./types";

function isMultiplayerFailure(value: unknown): value is { ok: false; error: MultiplayerError } {
  if (typeof value !== "object" || value === null || !("ok" in value) || value.ok !== false) {
    return false;
  }
  if (!("error" in value) || typeof value.error !== "object" || value.error === null) {
    return false;
  }
  const failure = value.error as Record<string, unknown>;
  return (
    typeof failure["code"] === "string" &&
    typeof failure["message"] === "string" &&
    typeof failure["details"] === "object" &&
    failure["details"] !== null &&
    (failure["currentRevision"] === null || typeof failure["currentRevision"] === "number")
  );
}

export async function parseMultiplayerFunctionFailure(
  error: unknown,
): Promise<{ ok: false; error: MultiplayerError } | null> {
  if (!(error instanceof FunctionsHttpError)) return null;
  const context = error.context as { json?: () => Promise<unknown> };
  if (typeof context.json !== "function") return null;
  try {
    const value = await context.json();
    return isMultiplayerFailure(value) ? value : null;
  } catch {
    return null;
  }
}

export interface GameApi {
  createRoom(displayName: string): Promise<MultiplayerResult<RoomConnection>>;
  joinRoom(roomCode: string, displayName: string): Promise<MultiplayerResult<RoomConnection>>;
  reconnect(roomCode: string, seatToken: string): Promise<MultiplayerResult<ReconnectResult>>;
  startGame(
    roomCode: string,
    seatToken: string,
    commandId: string,
  ): Promise<MultiplayerResult<CommandSuccess>>;
  endSession(
    roomCode: string,
    seatToken: string,
    commandId: string,
  ): Promise<MultiplayerResult<EndSessionSuccess>>;
  addComputerSeat(
    roomCode: string,
    seatToken: string,
    commandId: string,
  ): Promise<MultiplayerResult<LobbySeatUpdateSuccess>>;
  removeComputerSeat(
    roomCode: string,
    seatToken: string,
    computerSeatId: string,
  ): Promise<MultiplayerResult<LobbySeatUpdateSuccess>>;
  advanceComputers(
    roomCode: string,
    seatToken: string,
    expectedRevision: number,
  ): Promise<MultiplayerResult<ComputerAdvanceSuccess>>;
  executeCommand(input: {
    roomCode: string;
    seatToken: string;
    commandId: string;
    expectedRevision: number;
    command: AuthoritativeCommand;
  }): Promise<MultiplayerResult<CommandSuccess>>;
  listPublicEvents(roomId: string, afterSequence?: number): Promise<PublicEventRecord[]>;
  subscribe(roomId: string, onPublicChange: () => void): () => void;
}

class TestHttpGameApi implements GameApi {
  private async call<T>(body: Record<string, unknown>): Promise<MultiplayerResult<T>> {
    const response = await fetch("/test-api", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-e2e-user": this.testUserId(),
      },
      body: JSON.stringify(body),
    });
    return await response.json() as MultiplayerResult<T>;
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

  startGame(
    roomCode: string,
    seatToken: string,
    commandId: string,
  ): Promise<MultiplayerResult<CommandSuccess>> {
    return this.call({ operation: "start_game", roomCode, seatToken, commandId });
  }

  endSession(
    roomCode: string,
    seatToken: string,
    commandId: string,
  ): Promise<MultiplayerResult<EndSessionSuccess>> {
    return this.call({ operation: "end_session", roomCode, seatToken, commandId });
  }

  addComputerSeat(
    roomCode: string,
    seatToken: string,
    commandId: string,
  ): Promise<MultiplayerResult<LobbySeatUpdateSuccess>> {
    return this.call({ operation: "add_computer", roomCode, seatToken, commandId });
  }

  removeComputerSeat(
    roomCode: string,
    seatToken: string,
    computerSeatId: string,
  ): Promise<MultiplayerResult<LobbySeatUpdateSuccess>> {
    return this.call({ operation: "remove_computer", roomCode, seatToken, computerSeatId });
  }

  advanceComputers(
    roomCode: string,
    seatToken: string,
    expectedRevision: number,
  ): Promise<MultiplayerResult<ComputerAdvanceSuccess>> {
    return this.call({ operation: "advance_computers", roomCode, seatToken, expectedRevision });
  }

  executeCommand(input: {
    roomCode: string;
    seatToken: string;
    commandId: string;
    expectedRevision: number;
    command: AuthoritativeCommand;
  }): Promise<MultiplayerResult<CommandSuccess>> {
    return this.call({ operation: "game_action", ...input });
  }

  async listPublicEvents(roomId: string, afterSequence = 0): Promise<PublicEventRecord[]> {
    const result = await this.call<PublicEventRecord[]>({
      operation: "list_public_events",
      roomId,
      afterSequence,
    });
    return result.ok ? result.value : [];
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
    this.client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
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

  startGame(
    roomCode: string,
    seatToken: string,
    commandId: string,
  ): Promise<MultiplayerResult<CommandSuccess>> {
    return this.call("start_game", { roomCode, seatToken, commandId });
  }

  endSession(
    roomCode: string,
    seatToken: string,
    commandId: string,
  ): Promise<MultiplayerResult<EndSessionSuccess>> {
    return this.call("end_session", { roomCode, seatToken, commandId });
  }

  addComputerSeat(
    roomCode: string,
    seatToken: string,
    commandId: string,
  ): Promise<MultiplayerResult<LobbySeatUpdateSuccess>> {
    return this.call("add_computer", { roomCode, seatToken, commandId });
  }

  removeComputerSeat(
    roomCode: string,
    seatToken: string,
    computerSeatId: string,
  ): Promise<MultiplayerResult<LobbySeatUpdateSuccess>> {
    return this.call("remove_computer", { roomCode, seatToken, computerSeatId });
  }

  advanceComputers(
    roomCode: string,
    seatToken: string,
    expectedRevision: number,
  ): Promise<MultiplayerResult<ComputerAdvanceSuccess>> {
    return this.call("advance_computers", { roomCode, seatToken, expectedRevision });
  }

  executeCommand(input: {
    roomCode: string;
    seatToken: string;
    commandId: string;
    expectedRevision: number;
    command: AuthoritativeCommand;
  }): Promise<MultiplayerResult<CommandSuccess>> {
    return this.call("game_action", input);
  }

  async listPublicEvents(roomId: string, afterSequence = 0): Promise<PublicEventRecord[]> {
    await this.ensureSession();
    const { data, error } = await this.client
      .from("game_public_events")
      .select("room_id, sequence, revision, command_id, actor_player_id, payload")
      .eq("room_id", roomId)
      .gt("sequence", afterSequence)
      .order("sequence", { ascending: true });
    if (error !== null || data === null) return [];
    return data.map((row) => ({
      roomId: String(row.room_id),
      sequence: Number(row.sequence),
      revision: Number(row.revision),
      commandId: String(row.command_id),
      actorId: String(row.actor_player_id),
      event: row.payload as PublicGameEvent,
    }));
  }

  subscribe(roomId: string, onPublicChange: () => void): () => void {
    const channel: RealtimeChannel = this.client
      .channel(`kiln-opening:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_public_states", filter: `room_id=eq.${roomId}` },
        onPublicChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
        onPublicChange,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        onPublicChange,
      )
      .subscribe();
    return () => {
      void this.client.removeChannel(channel);
    };
  }

  private async call<T>(
    operation: string,
    body: Record<string, unknown>,
  ): Promise<MultiplayerResult<T>> {
    await this.ensureSession();
    const { data, error } = await this.client.functions.invoke("game-action", {
      body: { operation, ...body },
    });
    if (error !== null) {
      const ruleFailure = await parseMultiplayerFunctionFailure(error);
      if (ruleFailure !== null) return ruleFailure;
      return {
        ok: false,
        error: {
          code: "PERSISTENCE_CONFLICT",
          message: "The multiplayer service is temporarily unavailable.",
          details: {},
          currentRevision: null,
        },
      };
    }
    return data as MultiplayerResult<T>;
  }

  private async ensureSession(): Promise<void> {
    const { data } = await this.client.auth.getSession();
    if (data.session !== null) return;
    const { error } = await this.client.auth.signInAnonymously();
    if (error !== null) throw error;
  }
}

export function createGameApi(): GameApi {
  if (import.meta.env.VITE_E2E_LOCAL_BACKEND === "1") return new TestHttpGameApi();
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (url === undefined || anonKey === undefined) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
  }
  return new SupabaseGameApi(url, anonKey);
}
