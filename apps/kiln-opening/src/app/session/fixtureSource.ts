/**
 * `FixtureGameSource`: a read-only `GameSource` over one JSON engine fixture (UI plan §3.1,
 * §9.1), for SSR tests and the dev scenario gallery.
 *
 * It never builds or changes a state, so `src/app` needs no test code and no engine
 * dispatcher. `submit` checks the command the way ConfirmBar does — `validateAction`, or,
 * for a Contribution, the affordability flag of `contributionOptions` — and records it
 * ("Would send …" in the gallery).
 *
 * Entries come from `test/v161/ui/fixtures/{scenarios,moments}.json` (A1). The entry type
 * below accepts both the scenario shape (`name`) and the moment shape (`title`), and event
 * records numbered either `seq` or `sequence`.
 */

import { contributionOptions, validateAction } from "../../game/index.ts";
import type {
  AuthoritativeCommand,
  GameEvent,
  GameRuleError,
  PlayerId,
  PlayerView,
  PublicGameEvent,
} from "../../game/index.ts";
import type { PublicRoom, PublicSeat, StoredRulesVersion } from "../../multiplayer/types.ts";
import { EMPTY_SNAPSHOT, IDLE_STATUS } from "./gameSource.ts";
import type { GameSnapshot, GameSource, LogEntry, SessionStatus, SubmitOutcome } from "./gameSource.ts";

export interface FixtureEventRecord {
  seq?: number;
  sequence?: number;
  revision?: number;
  actorId?: PlayerId;
  event: PublicGameEvent;
}

export interface FixtureSecretRecord {
  seq?: number;
  sequence?: number;
  revision?: number;
  actorId?: PlayerId;
  event: GameEvent;
}

export interface FixtureEntry {
  id: string;
  name?: string;
  title?: string;
  kind?: string;
  viewerId: PlayerId;
  playerView: PlayerView;
  recentPublicEvents?: readonly FixtureEventRecord[];
  ownSecrets?: readonly FixtureSecretRecord[];
}

export interface FixtureSourceOptions {
  /** Seats shown as computer players (the fixtures carry no seats). */
  computerPlayerIds?: readonly PlayerId[];
  /** Shell-state fixtures: reconnecting, offline, a latched computer failure, … */
  status?: Partial<SessionStatus>;
  /** The room status; default `finished` for a finished game, else `playing`. */
  roomStatus?: PublicRoom["status"];
}

export interface RecordedSubmission {
  command: AuthoritativeCommand;
  error: GameRuleError | null;
}

function sequenceOf(record: { seq?: number; sequence?: number }): number | null {
  const value = record.sequence ?? record.seq;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function actorOf(record: FixtureEventRecord, fallback: PlayerId): PlayerId {
  if (record.actorId !== undefined) return record.actorId;
  const named = (record.event as { playerId?: unknown }).playerId;
  return typeof named === "string" ? named : fallback;
}

/** The snapshot a fixture entry stands for. Pure; exported for tests. */
export function fixtureSnapshot(entry: FixtureEntry, options: FixtureSourceOptions = {}): GameSnapshot {
  const view = entry.playerView;
  const game = view.game;
  const roomId = `fixture:${entry.id}`;
  const computers = new Set(options.computerPlayerIds ?? []);
  const seats: PublicSeat[] = game.playerOrder.map((playerId, seatIndex) => ({
    seatId: `fixture-seat-${seatIndex}`,
    roomId,
    playerId,
    seatIndex,
    displayName: game.players[playerId]?.displayName ?? playerId,
    colour: "",
    isHost: seatIndex === 0,
    isComputer: computers.has(playerId),
    aiPolicyVersion: null,
  }));
  const room: PublicRoom = {
    id: roomId,
    code: "FIXTURE",
    status: options.roomStatus ?? (game.phase.type === "finished" ? "finished" : "playing"),
    hostSeatId: seats[0]?.seatId ?? "",
    rulesVersion: game.rulesVersion as StoredRulesVersion,
    latestRevision: game.revision,
    endedAt: null,
    endedByPlayerId: null,
  };
  const secrets = new Map<number, GameEvent>();
  for (const secret of entry.ownSecrets ?? []) {
    const sequence = sequenceOf(secret);
    if (sequence !== null) secrets.set(sequence, secret.event);
  }
  const log: LogEntry[] = [];
  for (const record of entry.recentPublicEvents ?? []) {
    const sequence = sequenceOf(record);
    if (sequence === null) continue;
    const own = secrets.get(sequence);
    log.push({
      sequence,
      revision: record.revision ?? game.revision,
      actorId: actorOf(record, entry.viewerId),
      event: record.event,
      ...(own === undefined ? {} : { own }),
    });
  }
  log.sort((a, b) => a.sequence - b.sequence);
  return Object.freeze({
    ...EMPTY_SNAPSHOT,
    room,
    seats,
    seat: seats.find((seat) => seat.playerId === entry.viewerId) ?? null,
    view,
    log,
    status: { ...IDLE_STATUS, ...options.status },
  });
}

/** The check ConfirmBar runs before sending (§3.6 step 2), on a fixture's view. */
export function checkCommand(view: PlayerView, command: AuthoritativeCommand): GameRuleError | null {
  const viewerId = view.viewerId;
  const own = view.own;
  if (viewerId === null || own === null) {
    return { code: "UNKNOWN_PLAYER", message: "You are not seated in this game.", details: { playerId: String(viewerId) } };
  }
  if (command.type === "SUBMIT_CONTRIBUTION") {
    const option = contributionOptions(view).find((candidate) => candidate.command.windowId === command.windowId && candidate.command.card === command.card);
    if (option?.affordable === true) return null;
    return {
      code: "INVALID_CONTRIBUTION",
      message: "That Contribution cannot be submitted.",
      details: { card: command.card },
    };
  }
  return validateAction({ ...view, viewerId, own }, command);
}

export class FixtureGameSource implements GameSource {
  private snapshot: GameSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly recorded: RecordedSubmission[] = [];

  constructor(readonly entry: FixtureEntry, options: FixtureSourceOptions = {}) {
    this.snapshot = fixtureSnapshot(entry, options);
  }

  getSnapshot = (): GameSnapshot => this.snapshot;

  getServerSnapshot = (): GameSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Every command submitted so far, with its check result (newest last). */
  submissions(): readonly RecordedSubmission[] {
    return this.recorded;
  }

  async submit(command: AuthoritativeCommand): Promise<SubmitOutcome> {
    const view = this.snapshot.view;
    if (view === null) return { kind: "ignored" };
    const error = checkCommand(view, command);
    this.recorded.push({ command, error });
    this.setStatus({ error: error === null ? null : { kind: "rule", error } });
    return error === null ? { kind: "recorded", command } : { kind: "rejected", error: { kind: "rule", error } };
  }

  async resend(): Promise<SubmitOutcome> {
    return { kind: "ignored" };
  }

  async reconnect(): Promise<void> {
    // A fixture is always current.
  }

  retryComputers(): void {
    // No computers act in a fixture.
  }

  private setStatus(patch: Partial<SessionStatus>): void {
    this.snapshot = Object.freeze({ ...this.snapshot, status: { ...this.snapshot.status, ...patch } });
    for (const listener of [...this.listeners]) listener();
  }
}
