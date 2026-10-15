/**
 * The one data contract between the V1.6.1 app and wherever its game comes from
 * (UI plan §3.1, K3). Frozen after phase A; changes go through B6.
 *
 * Two implementations:
 * - `SessionStore` (`sessionStore.ts`): the multiplayer client, either the Supabase Edge
 *   Function or the local in-memory backend at `/test-api-v161`;
 * - `FixtureGameSource` (`fixtureSource.ts`): one JSON engine fixture, for SSR tests and the
 *   scenario gallery.
 *
 * Components never see this interface directly: the hooks in `src/app/state/hooks.ts` read
 * it through `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`.
 *
 * Additions to the §3.1 listing, all plain data:
 * - `savedRoomCode`: the room code of the saved seat on this device (never its token), so
 *   the home screen can offer Resume and Forget seat;
 * - `status.lobbyAction`: the lobby request in flight, so its button can show progress;
 * - `SubmitOutcome`, the result of `submit` and `resend`.
 */

import type {
  AuthoritativeCommand,
  GameEvent,
  GameRuleError,
  PlayerId,
  PlayerView,
  PublicGameEvent,
} from "../../game/index.ts";
import type { MultiplayerErrorCode, PublicRoom, PublicSeat } from "../../multiplayer/types.ts";

/** Where a batch of new public events came from (§3.2). */
export type BatchOrigin = "self" | "computers" | "remote";

export interface EventBatch {
  /** The game revision the batch brought the view to. */
  revision: number;
  firstSequence: number;
  events: readonly PublicGameEvent[];
  origin: BatchOrigin;
}

/**
 * One line of the game log: a public event, plus this seat's own secret version of the same
 * event when it has one (its setup deal, its own look, its chosen bottom order…). `own` is
 * held in memory only and never written to storage.
 */
export interface LogEntry {
  sequence: number;
  revision: number;
  actorId: PlayerId;
  event: PublicGameEvent;
  own?: GameEvent;
}

/**
 * An error kept as a code plus details and formatted at render time (§6.1), so a language
 * switch re-renders it.
 */
export type StoredError =
  | { kind: "rule"; error: GameRuleError }
  | { kind: "mp"; code: MultiplayerErrorCode; details?: Record<string, unknown> };

/** A command whose outcome is unknown after a transport failure. "Send again" reuses it. */
export interface PendingSubmission {
  commandId: string;
  expectedRevision: number;
  command: AuthoritativeCommand;
}

/** A lobby or session request in flight (status.lobbyAction). */
export type LobbyAction =
  | "create"
  | "join"
  | "resume"
  | "start"
  | "add_computer"
  | "remove_computer"
  | "end_session";

export interface SessionStatus {
  /** A game command is in flight (§3.6). */
  sending: boolean;
  /** Outcome unknown after a transport failure; "Send again" resends it unchanged. */
  unsent: PendingSubmission | null;
  reconnecting: boolean;
  advancingComputers: boolean;
  /** Latched for one revision; cleared when the revision moves or on Retry (§3.8). */
  computerFailure: { revision: number; error: StoredError; timedOut: boolean } | null;
  /** A code plus details, formatted at render time (§6.1). */
  error: StoredError | null;
  connection: "live" | "offline";
  lobbyAction: LobbyAction | null;
}

export interface GameSnapshot {
  room: PublicRoom | null;
  seats: readonly PublicSeat[];
  seat: PublicSeat | null;
  /** `{ viewerId, game: PublicGameState, own: PrivatePlayerView | null }`. A new object on every merge. */
  view: PlayerView | null;
  /** Public records merged with this seat's own secret records, by sequence, oldest first. */
  log: readonly LogEntry[];
  lastBatch: EventBatch | null;
  status: SessionStatus;
  /** The saved seat's room code on this device, or null. Never the seat token. */
  savedRoomCode: string | null;
}

/**
 * What `submit` and `resend` report. The draft store resets only on `success` (§3.5);
 * `stale` means the view was refreshed and the draft should be revalidated.
 */
export type SubmitOutcome =
  | { kind: "success"; revision: number }
  /** A rule or service rejection; nothing was committed. Also stored in `status.error`. */
  | { kind: "rejected"; error: StoredError }
  /** `STALE_REVISION`: nothing was committed; the store reconnected. */
  | { kind: "stale" }
  /** Transport failure: kept as `status.unsent` for "Send again". */
  | { kind: "unsent" }
  /** `SESSION_ENDED`: the host ended the session. */
  | { kind: "ended" }
  /** Another submission is in flight, there is nothing to resend, or no game is open. */
  | { kind: "ignored" }
  /** A fixture source checked the command and recorded it without changing the view. */
  | { kind: "recorded"; command: AuthoritativeCommand };

export interface GameSource {
  /** Immutable; replaced on every change. */
  getSnapshot(): GameSnapshot;
  /** The same snapshot; required by `useSyncExternalStore` under `renderToStaticMarkup`. */
  getServerSnapshot(): GameSnapshot;
  subscribe(listener: () => void): () => void;
  submit(command: AuthoritativeCommand): Promise<SubmitOutcome>;
  /** Resends `status.unsent` with its own `commandId` and `expectedRevision`. */
  resend(): Promise<SubmitOutcome>;
  reconnect(): Promise<void>;
  retryComputers(): void;
}

export const IDLE_STATUS: SessionStatus = Object.freeze({
  sending: false,
  unsent: null,
  reconnecting: false,
  advancingComputers: false,
  computerFailure: null,
  error: null,
  connection: "live",
  lobbyAction: null,
});

export const EMPTY_SNAPSHOT: GameSnapshot = Object.freeze({
  room: null,
  seats: Object.freeze([]) as readonly PublicSeat[],
  seat: null,
  view: null,
  log: Object.freeze([]) as readonly LogEntry[],
  lastBatch: null,
  status: IDLE_STATUS,
  savedRoomCode: null,
});
