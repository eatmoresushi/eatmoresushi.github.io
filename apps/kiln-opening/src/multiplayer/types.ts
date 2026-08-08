import type {
  ActionBoardState,
  CeramicState,
  FinalResult,
  FireModifier,
  FiringContext,
  FiringResultSummary,
  GameAction,
  GameEvent,
  GamePhase,
  GameRuleErrorCode,
  Glaze,
  KilnId,
  OrderId,
  PlayerCount,
  PlayerId,
  PlayerState,
  Quality,
  ResourceState,
  RoundNumber,
  Shape,
  TechniqueDiscipline,
  TechniqueId,
  WoodContribution,
} from "../game/index.ts";

export type RoomStatus = "lobby" | "playing" | "finished" | "abandoned";
export type StoredRulesVersion = "0.4" | "0.5" | "0.6.1" | "0.6.3";

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
}

export interface PublicPlayerState {
  id: PlayerId;
  seatIndex: number;
  displayName: string;
  kilnId: KilnId | null;
  resources: ResourceState;
  workers: PlayerState["workers"];
  orderHand: OrderId[];
  completedOrders: PlayerState["completedOrders"];
  techniques: PlayerState["techniques"];
  imperialProgress: 0 | 1 | 2 | 3 | 4 | 5;
  passedWorkPhase: boolean;
  pendingApprenticeUnlocks: number;
  kilnAbilityUsedThisRound: boolean;
  presentationCeramicIds: string[];
  score: PlayerState["score"];
}

export interface PublicDeckState {
  marketRemaining: number;
  imperialRemaining: number;
  techniqueRemaining: Record<TechniqueDiscipline, number>;
  fireRemaining: number;
}

export interface PublicDisplays {
  market: OrderId[];
  imperial: OrderId[];
  techniques: Record<TechniqueDiscipline, TechniqueId[]>;
}

export interface PublicDiscards {
  market: OrderId[];
  imperial: OrderId[];
  fire: FireModifier[];
}

export interface PublicGameState {
  schemaVersion: 1;
  rulesVersion: "0.6.3";
  gameId: string;
  revision: number;
  eventSequence: number;
  playerCount: PlayerCount;
  round: RoundNumber;
  playerOrder: PlayerId[];
  firstPlayerId: PlayerId;
  phase: GamePhase;
  players: Record<PlayerId, PublicPlayerState>;
  actionBoard: ActionBoardState;
  ceramics: Record<string, CeramicState>;
  commonSupply: ResourceState;
  vesselSupplyCounts: Record<Shape, number>;
  decks: PublicDeckState;
  displays: PublicDisplays;
  discards: PublicDiscards;
  imperialSealOwnerId: PlayerId | null;
  firingContext: FiringContext | null;
  lastFiringResult: FiringResultSummary | null;
  finalResult: FinalResult | null;
}

export type PublicGameEvent = GameEvent;

export interface PublicEventRecord {
  roomId: string;
  sequence: number;
  revision: number;
  commandId: string;
  actorId: PlayerId;
  event: PublicGameEvent;
}

export interface PendingContribution {
  windowId: string;
  amount: WoodContribution;
  submitted: true;
}

export interface RoomConnection {
  room: PublicRoom;
  seats: PublicSeat[];
  seat: PublicSeat;
  seatToken: string;
  game: PublicGameState | null;
  ownPendingContribution: PendingContribution | null;
}

export interface ReconnectResult {
  room: PublicRoom;
  seats: PublicSeat[];
  seat: PublicSeat;
  game: PublicGameState | null;
  ownPendingContribution: PendingContribution | null;
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

export interface SubmitWoodCommand {
  type: "SUBMIT_WOOD_CONTRIBUTION";
  windowId: string;
  amount: WoodContribution;
}

export type AuthoritativeCommand = GameAction | SubmitWoodCommand;

export interface CommandRequest extends SeatRequest {
  commandId: string;
  expectedRevision: number;
  command: AuthoritativeCommand;
}

export interface CommandSuccess {
  commandId: string;
  room: PublicRoom;
  actorId: PlayerId;
  revision: number;
  game: PublicGameState;
  events: PublicGameEvent[];
  ownPendingContribution: PendingContribution | null;
}

export interface AuthoritativeHead {
  roomId: string;
  revision: number;
  state: import("../game/index.ts").GameState;
  rngState: number;
  rootSeed: number;
  stateHash: string;
}

export interface PrivateSubmissionRecord {
  roomId: string;
  windowId: string;
  playerId: PlayerId;
  commandId: string;
  amount: WoodContribution;
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
}

export interface StoredSeat extends PublicSeat {
  authUserId: string | null;
}

export interface SecurityProvider {
  randomId(): string;
  randomRoomCode(): string;
  randomSeatToken(): string;
  randomSeed(): number;
  hashSecret(value: string): Promise<string>;
  hashJson(value: unknown): Promise<string>;
}

export interface PublicStateNotification {
  roomId: string;
  revision: number;
  eventSequence: number;
}

export type PublicStateListener = (notification: PublicStateNotification) => void;

// Keep these imports exercised as part of the transport contract.
export type PublicRulesScalars = Glaze | Quality;
