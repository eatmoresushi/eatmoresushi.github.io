import type {
  AuthenticatedSeat,
  CommitStartInput,
  CommitTransitionInput,
  CreateRoomRecord,
  EndSessionRecord,
  JoinRoomRecord,
  MultiplayerStore,
  StoreResult,
} from "../../../src/multiplayer/store.ts";
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
} from "../../../src/multiplayer/types.ts";

export class SupabaseMultiplayerStore implements MultiplayerStore {
  constructor(
    private readonly supabaseUrl: string,
    private readonly serviceRoleKey: string,
  ) {}

  createRoom(input: CreateRoomRecord): Promise<StoreResult<AuthenticatedSeat>> {
    return this.rpc("server_create_room", {
      p_room_id: input.room.id,
      p_code: input.room.code,
      p_seat_id: input.hostSeat.seatId,
      p_player_id: input.hostSeat.playerId,
      p_display_name: input.hostSeat.displayName,
      p_colour: input.hostSeat.colour,
      p_auth_user_id: input.hostSeat.authUserId,
      p_token_hash: input.tokenHash,
    });
  }

  joinRoom(input: JoinRoomRecord): Promise<StoreResult<AuthenticatedSeat>> {
    return this.rpc("server_join_room", {
      p_code: input.roomCode,
      p_seat_id: input.seatId,
      p_display_name: input.displayName,
      p_auth_user_id: input.authUserId,
      p_token_hash: input.tokenHash,
    });
  }

  async authenticate(roomCode: string, tokenHash: string): Promise<AuthenticatedSeat | null> {
    return this.rpc("server_authenticate_seat", { p_code: roomCode, p_token_hash: tokenHash });
  }

  async getSeats(roomId: string): Promise<StoredSeat[]> {
    return this.rpc("server_get_seats", { p_room_id: roomId });
  }

  async loadHead(roomId: string): Promise<AuthoritativeHead | null> {
    return this.rpc("server_load_head", { p_room_id: roomId });
  }

  async loadPublicState(roomId: string): Promise<PublicGameState | null> {
    return this.rpc("server_load_public_state", { p_room_id: roomId });
  }

  async getProcessed(roomId: string, commandId: string): Promise<ProcessedCommandRecord | null> {
    return this.rpc("server_get_processed", { p_room_id: roomId, p_command_id: commandId });
  }

  endSession(input: EndSessionRecord): Promise<StoreResult<StoredRoom>> {
    return this.rpc("server_end_session", {
      p_room_id: input.roomId,
      p_host_seat_id: input.hostSeatId,
      p_actor_player_id: input.actorId,
      p_command_id: input.commandId,
    });
  }

  commitStart(input: CommitStartInput): Promise<StoreResult<CommandSuccess>> {
    return this.rpc("server_commit_start", {
      p_room_id: input.roomId,
      p_command_id: input.commandId,
      p_actor_id: input.actorId,
      p_state: input.head.state,
      p_rng_state: input.head.rngState,
      p_root_seed: input.head.rootSeed,
      p_state_hash: input.head.stateHash,
      p_public_state: input.publicState,
      p_response: input.response,
    });
  }

  commitTransition(input: CommitTransitionInput): Promise<StoreResult<CommandSuccess>> {
    return this.rpc("server_commit_transition", {
      p_room_id: input.roomId,
      p_command_id: input.commandId,
      p_actor_id: input.actorId,
      p_expected_revision: input.expectedRevision,
      p_previous_state_hash: input.previousHead.stateHash,
      p_next_revision: input.nextHead.revision,
      p_next_state: input.nextHead.state,
      p_rng_state: input.nextHead.rngState,
      p_root_seed: input.nextHead.rootSeed,
      p_state_hash: input.nextHead.stateHash,
      p_command: input.command,
      p_full_events: input.fullEvents,
      p_public_events: input.publicEvents,
      p_public_state: input.publicState,
      p_response: input.response,
      p_private_submission: input.privateSubmission,
    });
  }

  async loadPrivateSubmissions(roomId: string, windowId: string): Promise<PrivateSubmissionRecord[]> {
    return this.rpc("server_load_private_submissions", {
      p_room_id: roomId,
      p_window_id: windowId,
    });
  }

  async findOwnPendingSubmission(
    roomId: string,
    playerId: string,
  ): Promise<PrivateSubmissionRecord | null> {
    return this.rpc("server_find_own_pending", {
      p_room_id: roomId,
      p_player_id: playerId,
    });
  }

  async listPublicEvents(roomId: string, afterSequence = 0): Promise<PublicEventRecord[]> {
    return this.rpc("server_list_public_events", {
      p_room_id: roomId,
      p_after_sequence: afterSequence,
    });
  }

  subscribePublic(_roomId: string, _listener: PublicStateListener): () => void {
    // Edge Functions commit rows; browser clients subscribe to the RLS-protected Realtime tables.
    return () => undefined;
  }

  private async rpc<T>(name: string, parameters: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: this.serviceRoleKey,
        authorization: `Bearer ${this.serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(parameters),
    });
    if (!response.ok) {
      const safeMessage = await response.text();
      throw new Error(`Supabase RPC ${name} failed (${response.status}): ${safeMessage.slice(0, 300)}`);
    }
    return (await response.json()) as T;
  }
}
