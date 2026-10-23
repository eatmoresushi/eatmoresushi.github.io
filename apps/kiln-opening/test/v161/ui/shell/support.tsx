/**
 * Helpers for the B1 shell, log and lobby tests (UI_V1.6.1_ARCHITECTURE §9.2, §9.3). Owner: B1.
 */
import type { PlayerView } from "../../../../src/game/index.ts";
import type { PublicRoom, PublicSeat, StoredRulesVersion } from "../../../../src/multiplayer/types.ts";
import { EMPTY_SNAPSHOT } from "../../../../src/app/session/gameSource.ts";
import type { GameSnapshot, GameSource, SubmitOutcome } from "../../../../src/app/session/gameSource.ts";
import type { LobbyOutcome, SessionActions } from "../../../../src/app/session/sessionStore.ts";
import { fixture } from "../support/fixtures.ts";
import type { FixtureSourceOptions } from "../../../../src/app/session/fixtureSource.ts";
import { fixtureSnapshot } from "../../../../src/app/session/fixtureSource.ts";
import { gameModelOf } from "../../../../src/app/state/model.ts";
import type { GameModel } from "../../../../src/app/state/model.ts";

/** A source over a fixed snapshot that the test may replace. */
export class StaticSource implements GameSource {
  private listeners = new Set<() => void>();
  constructor(private snapshot: GameSnapshot) {}
  getSnapshot = (): GameSnapshot => this.snapshot;
  getServerSnapshot = (): GameSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  set(snapshot: GameSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of [...this.listeners]) listener();
  }
  readonly calls: string[] = [];
  async submit(): Promise<SubmitOutcome> {
    return { kind: "ignored" };
  }
  async resend(): Promise<SubmitOutcome> {
    this.calls.push("resend");
    return { kind: "ignored" };
  }
  async reconnect(): Promise<void> {
    this.calls.push("reconnect");
  }
  retryComputers(): void {
    this.calls.push("retryComputers");
  }
}

/** Session actions that record their calls. */
export function recordingSession(outcome: LobbyOutcome = { ok: true }): SessionActions & { calls: Array<[string, ...unknown[]]> } {
  const calls: Array<[string, ...unknown[]]> = [];
  const done = (name: string, ...args: unknown[]) => {
    calls.push([name, ...args]);
    return Promise.resolve(outcome);
  };
  return {
    calls,
    restore: async () => null,
    create: (name) => done("create", name),
    join: (code, name) => done("join", code, name),
    resume: (code) => done("resume", code),
    start: () => done("start"),
    addComputer: () => done("addComputer"),
    removeComputer: (seatId) => done("removeComputer", seatId),
    endSession: () => done("endSession"),
    leave: () => {
      calls.push(["leave"]);
    },
    forgetSeat: (code) => {
      calls.push(["forgetSeat", code]);
    },
    clearError: () => {
      calls.push(["clearError"]);
    },
  };
}

/** Text nodes plus the values of `aria-label`, `title` and `alt`: what a player can perceive. */
export function perceivable(html: string): string {
  const attributes = [...html.matchAll(/\s(?:aria-label|title|alt)="([^"]*)"/g)].map((match) => match[1]);
  const text = html.replace(/<[^>]*>/g, " ");
  return [text, ...attributes].join(" ");
}

/** A lobby snapshot from a fixture's players: seat 0 hosts, seats `computers` are computers. */
export function lobbySnapshot(
  fixtureId: string,
  options: { viewerSeat?: number; seatCount?: number; computers?: readonly number[]; status?: PublicRoom["status"]; endedBy?: number | null } = {},
): GameSnapshot {
  const view: PlayerView = fixture(fixtureId).playerView;
  const order = view.game.playerOrder.slice(0, options.seatCount ?? view.game.playerOrder.length);
  const roomId = "test-room";
  const computers = new Set(options.computers ?? []);
  const seats: PublicSeat[] = order.map((playerId, seatIndex) => ({
    seatId: `seat-${seatIndex}`,
    roomId,
    playerId,
    seatIndex,
    displayName: view.game.players[playerId]?.displayName ?? playerId,
    colour: "",
    isHost: seatIndex === 0,
    isComputer: computers.has(seatIndex),
    aiPolicyVersion: computers.has(seatIndex) ? ("v161-strategic-1" as PublicSeat["aiPolicyVersion"]) : null,
  }));
  const endedBy = options.endedBy ?? null;
  const room: PublicRoom = {
    id: roomId,
    code: "KILN42",
    status: options.status ?? "lobby",
    hostSeatId: "seat-0",
    rulesVersion: view.game.rulesVersion as StoredRulesVersion,
    latestRevision: 0,
    endedAt: options.status === "abandoned" ? "2026-10-15T12:00:00.000Z" : null,
    endedByPlayerId: endedBy === null ? null : (seats[endedBy]?.playerId ?? null),
  };
  return { ...EMPTY_SNAPSHOT, room, seats, seat: seats[options.viewerSeat ?? 0] ?? null };
}


/** The `GameModel` a fixture source shows. */
export function modelOf(id: string, options: FixtureSourceOptions = {}): GameModel {
  const snapshot = fixtureSnapshot(structuredClone(fixture(id)), options);
  if (snapshot.view === null) throw new Error(`${id} has no view`);
  return gameModelOf(snapshot.view, snapshot.seats);
}

/** The chunks of markup between `<li class="seat-chips-item">` openings, in order. */
export function seatChips(html: string): string[] {
  return html.split('<li class="seat-chips-item">').slice(1);
}

/** The value of one attribute in a chunk of markup. */
export function attr(html: string, name: string): string | null {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(html);
  return match === null ? null : (match[1] ?? "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
}
