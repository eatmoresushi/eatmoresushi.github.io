import { createClient } from "@supabase/supabase-js";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type {
  AuthoritativeCommand,
  CommandSuccess,
  MultiplayerResult,
  ReconnectResult,
  RoomConnection,
} from "./types";

export interface GameApi {
  createRoom(displayName: string): Promise<MultiplayerResult<RoomConnection>>;
  joinRoom(roomCode: string, displayName: string): Promise<MultiplayerResult<RoomConnection>>;
  reconnect(roomCode: string, seatToken: string): Promise<MultiplayerResult<ReconnectResult>>;
  startGame(
    roomCode: string,
    seatToken: string,
    commandId: string,
  ): Promise<MultiplayerResult<CommandSuccess>>;
  executeCommand(input: {
    roomCode: string;
    seatToken: string;
    commandId: string;
    expectedRevision: number;
    command: AuthoritativeCommand;
  }): Promise<MultiplayerResult<CommandSuccess>>;
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

  executeCommand(input: {
    roomCode: string;
    seatToken: string;
    commandId: string;
    expectedRevision: number;
    command: AuthoritativeCommand;
  }): Promise<MultiplayerResult<CommandSuccess>> {
    return this.call({ operation: "game_action", ...input });
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

  executeCommand(input: {
    roomCode: string;
    seatToken: string;
    commandId: string;
    expectedRevision: number;
    command: AuthoritativeCommand;
  }): Promise<MultiplayerResult<CommandSuccess>> {
    return this.call("game_action", input);
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
