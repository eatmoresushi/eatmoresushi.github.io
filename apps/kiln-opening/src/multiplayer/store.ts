/**
 * Persistence port of the authoritative service. Two adapters implement it:
 * `InMemoryMultiplayerStore` (tests and the local E2E backend) and
 * `supabase/functions/_shared/supabaseStore.ts` (production RPCs). Both must behave the
 * same, including compare-and-swap on the head and on private submissions.
 */

import type { ContributionCardId, GameEvent, PlayerId } from "../game/index.ts";
import type {
  AuthoritativeHead,
  CommandSuccess,
  PrivateEventRecord,
  PrivateSubmissionRecord,
  ProcessedCommandRecord,
  PublicEventRecord,
  PublicGameEvent,
  PublicGameState,
  PublicStateListener,
  StoredRoom,
  StoredSeat,
} from "./types.ts";

export type StoreFailureCode =
  | "room_code_conflict"
  | "room_not_found"
  | "room_full"
  | "game_already_started"
  | "not_enough_players"
  | "seat_already_joined"
  | "host_only"
  | "session_not_active"
  | "duplicate"
  | "stale"
  | "private_duplicate"
  | "not_computer_seat";

export type StoreResult<T> =
  | { status: "ok"; value: T }
  | { status: "error"; code: StoreFailureCode }
  | { status: "duplicate"; processed: ProcessedCommandRecord };

export interface CreateRoomRecord {
  room: StoredRoom;
  hostSeat: StoredSeat;
  tokenHash: string;
}

export interface JoinRoomRecord {
  roomCode: string;
  seatId: string;
  displayName: string;
  colour: string;
  authUserId: string | null;
  tokenHash: string;
}

export interface AddComputerSeatRecord {
  roomId: string;
  hostSeatId: string;
  seatId: string;
  displayName: string;
  aiSeed: number;
  /** Stamped on the seat (`room_ai_seats.policy_version`); `rules-v1.6.2-…`. */
  policyVersion: string;
  commandId: string;
}

export interface RemoveComputerSeatRecord {
  roomId: string;
  hostSeatId: string;
  computerSeatId: string;
}

export interface AuthenticatedSeat {
  room: StoredRoom;
  seat: StoredSeat;
}

export interface CommitStartInput {
  roomId: string;
  commandId: string;
  actorId: PlayerId;
  head: AuthoritativeHead;
  publicState: PublicGameState;
  /** `createGame`'s events (incl. each seat's secret deal), persisted like any command's. */
  fullEvents: GameEvent[];
  /** The same events with every `secret` removed; same length and order. */
  publicEvents: PublicGameEvent[];
  response: CommandSuccess;
}

export interface PrivateCommitInput {
  windowId: string;
  card: ContributionCardId;
  /** Fuel Ledger commitment (`use_fuel_ledger`). Dropping it would turn ±2 into ±1. */
  fuelLedger: boolean;
  /** This submission was the last one and revealed the window. */
  revealed: boolean;
}

export interface CommitTransitionInput {
  roomId: string;
  commandId: string;
  actorId: PlayerId;
  expectedRevision: number;
  command: unknown;
  previousHead: AuthoritativeHead;
  nextHead: AuthoritativeHead;
  fullEvents: GameEvent[];
  publicEvents: PublicGameEvent[];
  publicState: PublicGameState;
  response: CommandSuccess;
  privateSubmission: PrivateCommitInput | null;
}

export interface EndSessionRecord {
  roomId: string;
  hostSeatId: string;
  actorId: PlayerId;
  commandId: string;
}

export interface MultiplayerStore {
  createRoom(input: CreateRoomRecord): Promise<StoreResult<AuthenticatedSeat>>;
  joinRoom(input: JoinRoomRecord): Promise<StoreResult<AuthenticatedSeat>>;
  addComputerSeat(input: AddComputerSeatRecord): Promise<StoreResult<StoredSeat>>;
  removeComputerSeat(input: RemoveComputerSeatRecord): Promise<StoreResult<boolean>>;
  authenticate(roomCode: string, tokenHash: string): Promise<AuthenticatedSeat | null>;
  getSeats(roomId: string): Promise<StoredSeat[]>;
  loadHead(roomId: string): Promise<AuthoritativeHead | null>;
  loadPublicState(roomId: string): Promise<PublicGameState | null>;
  getProcessed(roomId: string, commandId: string): Promise<ProcessedCommandRecord | null>;
  endSession(input: EndSessionRecord): Promise<StoreResult<StoredRoom>>;
  commitStart(input: CommitStartInput): Promise<StoreResult<CommandSuccess>>;
  commitTransition(input: CommitTransitionInput): Promise<StoreResult<CommandSuccess>>;
  /** Unrevealed submissions of one window, with their Fuel Ledger commitments. */
  loadPrivateSubmissions(roomId: string, windowId: string): Promise<PrivateSubmissionRecord[]>;
  findOwnPendingSubmission(roomId: string, playerId: PlayerId): Promise<PrivateSubmissionRecord | null>;
  listPublicEvents(roomId: string, afterSequence?: number): Promise<PublicEventRecord[]>;
  /**
   * The events whose `secret.visibleTo` is `playerId`, secret intact, after `afterSequence`.
   * `tokenHash` must be that seat's live credential (`server_list_private_events` checks it
   * again), so the adapter can never be asked for another seat's secrets.
   */
  listPrivateEvents(
    roomId: string,
    playerId: PlayerId,
    tokenHash: string,
    afterSequence?: number,
  ): Promise<PrivateEventRecord[]>;
  subscribePublic(roomId: string, listener: PublicStateListener): () => void;
}
