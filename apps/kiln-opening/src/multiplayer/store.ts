import type { GameEvent, PlayerId, WoodContribution } from "../game/index.ts";
import type {
  AuthoritativeHead,
  CommandSuccess,
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
  response: CommandSuccess;
}

export interface PrivateCommitInput {
  windowId: string;
  amount: WoodContribution;
  useFuelLedger: boolean;
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
  loadPrivateSubmissions(roomId: string, windowId: string): Promise<PrivateSubmissionRecord[]>;
  findOwnPendingSubmission(roomId: string, playerId: PlayerId): Promise<PrivateSubmissionRecord | null>;
  listPublicEvents(roomId: string, afterSequence?: number): Promise<PublicEventRecord[]>;
  subscribePublic(roomId: string, listener: PublicStateListener): () => void;
}
