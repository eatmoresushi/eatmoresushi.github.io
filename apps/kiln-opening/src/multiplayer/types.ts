/**
 * Transport contract of the V1.6.2 multiplayer layer (DESIGN §4.6; ENGINE_V1.6.2_DELTA.md §9).
 *
 * The game vocabulary (`PublicGameState`, `PlayerView`, `PrivatePlayerView`,
 * `PublicGameEvent`, `DecisionPrompt`, commands) is re-exported from the engine contract;
 * nothing here re-declares a game shape. What remains is the room, seat, store and
 * response vocabulary of the authoritative service.
 *
 * Privacy boundary:
 * - `PublicGameState` / `PublicGameEvent` are safe for every seat, Realtime and logs.
 * - `PrivatePlayerView` and `PrivateEventRecord` reach only the authenticated seat they
 *   belong to (`ownPrivateView`, `ownSecrets`).
 * - `GameState`, `PrivateFiringState` and full `GameEvent`s never leave the server.
 */

import type {
  AuthoritativeCommand,
  ContributionCardId,
  DecisionPrompt,
  GameEvent,
  GameRuleErrorCode,
  GameState,
  PlayerId,
  PlayerView,
  PrivatePlayerView,
  PublicGameEvent,
  PublicGameState,
  SubmitContributionCommand,
} from "../game/index.ts";

export type {
  AuthoritativeCommand,
  DecisionPrompt,
  PlayerView,
  PrivatePlayerView,
  PublicGameEvent,
  PublicGameState,
  SubmitContributionCommand,
};

export type RoomStatus = "lobby" | "playing" | "finished" | "abandoned";

/** Every rules version a stored room may carry. Only the current one is playable. */
export type StoredRulesVersion =
  | "0.4" | "0.5" | "0.6.1" | "0.6.3" | "0.6.5" | "1.0.0" | "1.0.1" | "1.0.2" | "1.0.4" | "1.0.9"
  | "1.1.1" | "1.1.4" | "1.1.5" | "1.1.6" | "1.2.2" | "1.2.4" | "1.2.5" | "1.2.6" | "1.2.7" | "1.4"
  | "1.6.1" | "1.6.2";

/** The rules version new rooms are created under and the only one the service accepts. */
export type CurrentRulesVersion = "1.6.2";

/** Historical computer policy labels, kept so old seat rows stay readable. */
export type LegacyComputerPolicyVersion =
  | "selfplay-003" | "rules-v1.1.1-wood-001" | "rules-v1.1.4-contribution-001" | "rules-v1.1.5-order-001"
  | "rules-v1.2.2-heuristic-001" | "rules-v1.2.4-heuristic-001" | "rules-v1.2.5-heuristic-001"
  | "rules-v1.2.6-heuristic-001" | "rules-v1.2.6-strategic-002" | "rules-v1.2.7-strategic-002"
  | "rules-v1.4-strategic-001" | "rules-v1.6.1-strategic-001" | "rules-v1.6.1-canonical-001";

/**
 * A V1.6.2 computer policy label, `rules-v1.6.2-<name>-<nnn>`. The database accepts any
 * label of this shape (`room_ai_seats_policy_version_check`), so a new policy needs no
 * migration.
 */
export type ComputerPolicyVersion = `rules-v1.6.2-${string}`;

export interface PublicRoom {
  id: string;
  code: string;
  status: RoomStatus;
  hostSeatId: string;
  rulesVersion: StoredRulesVersion;
  latestRevision: number;
  endedAt: string | null;
  endedByPlayerId: PlayerId | null;
}

export interface PublicSeat {
  seatId: string;
  roomId: string;
  playerId: PlayerId;
  seatIndex: number;
  displayName: string;
  colour: string;
  isHost: boolean;
  isComputer: boolean;
  aiPolicyVersion: LegacyComputerPolicyVersion | ComputerPolicyVersion | null;
}

/** One public event as stored in `public.game_public_events`. */
export interface PublicEventRecord {
  roomId: string;
  sequence: number;
  revision: number;
  commandId: string;
  actorId: PlayerId;
  event: PublicGameEvent;
}

/**
 * One event carrying a `secret` visible to the requesting seat, with that secret intact.
 * Delivered only to `event.secret.visibleTo` (command responses, reconnect and
 * `server_list_private_events`, DESIGN §4.6).
 */
export interface PrivateEventRecord {
  roomId: string;
  sequence: number;
  revision: number;
  commandId: string;
  actorId: PlayerId;
  event: GameEvent;
}

/** Room and seats without game state: the create and join responses. */
export interface RoomConnection {
  room: PublicRoom;
  seats: PublicSeat[];
  seat: PublicSeat;
  seatToken: string;
  game: PublicGameState | null;
  /** This seat's private view (hand, own look and peek, own sealed Contribution). */
  ownPrivateView: PrivatePlayerView | null;
  /** Secret payloads addressed to this seat so far, in sequence order. */
  ownSecrets: PrivateEventRecord[];
}

export interface ReconnectResult {
  room: PublicRoom;
  seats: PublicSeat[];
  seat: PublicSeat;
  game: PublicGameState | null;
  /** Rebuilt from the authoritative head and the open window's stored submissions. */
  ownPrivateView: PrivatePlayerView | null;
  /** Every secret addressed to this seat, including its setup deal (`ORDERS_DEALT`). */
  ownSecrets: PrivateEventRecord[];
}

export type MultiplayerErrorCode =
  | "INVALID_REQUEST"
  | "ROOM_NOT_FOUND"
  | "ROOM_CODE_CONFLICT"
  | "ROOM_FULL"
  | "GAME_ALREADY_STARTED"
  | "GAME_NOT_STARTED"
  | "AUTHENTICATION_FAILED"
  | "HOST_ONLY"
  | "NOT_ENOUGH_PLAYERS"
  | "STALE_REVISION"
  | "DUPLICATE_COMMAND"
  | "PERSISTENCE_CONFLICT"
  | "SESSION_ENDED"
  | "UNSUPPORTED_RULES_VERSION"
  | "RULES_FINGERPRINT_MISMATCH"
  | "COMPUTER_TURN_FAILED"
  // Transport and backend-plane failures. These are not rule outcomes: they mean the
  // request never reached a rules decision, so they must stay distinguishable from
  // PERSISTENCE_CONFLICT, which reports a genuine revision/commit conflict.
  | "SERVER_CONFIGURATION_ERROR"
  | "INTERNAL_SERVER_ERROR"
  | "METHOD_NOT_ALLOWED"
  | "SERVICE_UNAVAILABLE"
  | GameRuleErrorCode;

export interface MultiplayerError {
  code: MultiplayerErrorCode;
  message: string;
  details: Record<string, string | number | boolean>;
  currentRevision: number | null;
}

export type MultiplayerResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: MultiplayerError };

export interface CreateRoomRequest {
  displayName: string;
  authUserId: string | null;
}

export interface JoinRoomRequest {
  roomCode: string;
  displayName: string;
  authUserId: string | null;
}

export interface SeatRequest {
  roomCode: string;
  seatToken: string;
}

export interface StartGameRequest extends SeatRequest {
  commandId: string;
}

export interface EndSessionRequest extends SeatRequest {
  commandId: string;
}

export interface EndSessionSuccess {
  commandId: string;
  room: PublicRoom;
}

export interface AddComputerSeatRequest extends SeatRequest {
  commandId: string;
}

export interface RemoveComputerSeatRequest extends SeatRequest {
  computerSeatId: string;
}

export interface ListPrivateEventsRequest extends SeatRequest {
  afterSequence: number;
}

export interface LobbySeatUpdateSuccess {
  room: PublicRoom;
  seats: PublicSeat[];
}

export interface AdvanceComputersRequest extends SeatRequest {
  expectedRevision: number;
}

export interface ComputerAdvanceSuccess {
  room: PublicRoom;
  revision: number;
  game: PublicGameState;
  /** Public events of every committed computer command, in order. */
  events: PublicGameEvent[];
  advancedActions: number;
  actorIds: PlayerId[];
  stoppedReason: "human_turn" | "finished" | "action_limit";
  /** The requesting seat's private view after the computers acted. */
  ownPrivateView: PrivatePlayerView | null;
  /** Secrets addressed to the requesting seat in these commands (normally none). */
  ownSecrets: PrivateEventRecord[];
}

export interface CommandRequest extends SeatRequest {
  commandId: string;
  expectedRevision: number;
  /**
   * Untrusted client JSON, typed `unknown` on purpose: `parseCommand` shape-checks it into
   * an `AuthoritativeCommand` before anything branches on it (DESIGN §2.5).
   */
  command: unknown;
}

export interface CommandSuccess {
  commandId: string;
  room: PublicRoom;
  actorId: PlayerId;
  revision: number;
  game: PublicGameState;
  /** The command's events with every `secret` removed. */
  events: PublicGameEvent[];
  /**
   * The acting seat's private view after the command. Null in the stored record of a
   * computer command, which no client ever receives.
   */
  ownPrivateView: PrivatePlayerView | null;
  /** The acting seat's own secrets from this command's events (DESIGN §4.6). */
  ownSecrets: PrivateEventRecord[];
}

/** The authoritative head: server-only. */
export interface AuthoritativeHead {
  roomId: string;
  revision: number;
  state: GameState;
  rngState: number;
  rootSeed: number;
  stateHash: string;
}

/** One sealed Contribution as stored in `private.private_submissions`. */
export interface PrivateSubmissionRecord {
  roomId: string;
  windowId: string;
  playerId: PlayerId;
  commandId: string;
  /** The sealed card: Bank, Tend, Stoke, or a Fuel Ledger card (v1.6.2 change 26). */
  card: ContributionCardId;
  revealedRevision: number | null;
}

export interface ProcessedCommandRecord {
  roomId: string;
  commandId: string;
  actorId: PlayerId;
  response: CommandSuccess;
}

export interface StoredRoom extends PublicRoom {
  contentVersion: StoredRulesVersion;
  /**
   * Rules fingerprint at room creation, `r<revision>-<digest>`. V1.6.2 rooms always carry
   * an `r32-` fingerprint; a missing or different one (an `r31-` room from before owner
   * revision 4, an `r30-` room from before revision 3 or a V1.6.1 `r29-` room included) is
   * rejected, never reinterpreted.
   */
  contentDigest: string | null;
}

export interface StoredSeat extends PublicSeat {
  authUserId: string | null;
  aiSeed: number | null;
  aiCreatedCommandId: string | null;
}

export interface SecurityProvider {
  randomId(): string;
  randomRoomCode(): string;
  randomSeatToken(): string;
  randomSeed(): number;
  hashSecret(value: string): Promise<string>;
  /** Must be independent of object key order (Postgres `jsonb` reorders keys). */
  hashJson(value: unknown): Promise<string>;
}

export interface PublicStateNotification {
  roomId: string;
  revision: number;
  eventSequence: number;
}

export type PublicStateListener = (notification: PublicStateNotification) => void;
