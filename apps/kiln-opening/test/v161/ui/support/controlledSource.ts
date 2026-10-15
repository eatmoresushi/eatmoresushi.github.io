/**
 * A `GameSource` the test drives by hand (A2; B6 after phase A): it starts from a fixture
 * snapshot, holds every `submit` until the test answers it, and lets the test replace the view or
 * the status. It mirrors the store's sending state (§3.6): `status.sending` is true from submit
 * until the answer.
 */
import type { AuthoritativeCommand, PlayerView } from "../../../../src/game/index.ts";
import { fixtureSnapshot } from "../../../../src/app/session/fixtureSource.ts";
import type { FixtureSourceOptions } from "../../../../src/app/session/fixtureSource.ts";
import type { GameSnapshot, GameSource, SessionStatus, SubmitOutcome } from "../../../../src/app/session/gameSource.ts";
import { fixture } from "./fixtures.ts";

interface Pending {
  command: AuthoritativeCommand;
  resolve: (outcome: SubmitOutcome) => void;
}

export class ControlledSource implements GameSource {
  private snapshot: GameSnapshot;
  private readonly listeners = new Set<() => void>();
  readonly submitted: AuthoritativeCommand[] = [];
  private pending: Pending | null = null;

  constructor(fixtureId: string, options: FixtureSourceOptions = {}) {
    this.snapshot = fixtureSnapshot(structuredClone(fixture(fixtureId)), options);
  }

  getSnapshot = (): GameSnapshot => this.snapshot;
  getServerSnapshot = (): GameSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  submit(command: AuthoritativeCommand): Promise<SubmitOutcome> {
    if (this.pending !== null) return Promise.resolve({ kind: "ignored" });
    this.submitted.push(command);
    this.setStatus({ sending: true });
    return new Promise((resolve) => {
      this.pending = { command, resolve };
    });
  }

  /** Whether a submit is waiting for an answer. */
  get waiting(): boolean {
    return this.pending !== null;
  }

  /** Answers the pending submit: success with a new view, or a stored rejection. */
  answer(outcome: { view: PlayerView } | { reject: SessionStatus["error"] }): void {
    const pending = this.pending;
    if (pending === null) throw new Error("nothing is pending");
    this.pending = null;
    if ("view" in outcome) {
      this.snapshot = { ...this.snapshot, view: outcome.view, status: { ...this.snapshot.status, sending: false, error: null } };
      this.emit();
      pending.resolve({ kind: "success", revision: outcome.view.game.revision });
    } else {
      this.snapshot = { ...this.snapshot, status: { ...this.snapshot.status, sending: false, error: outcome.reject } };
      this.emit();
      pending.resolve(outcome.reject === null ? { kind: "ignored" } : { kind: "rejected", error: outcome.reject });
    }
  }

  /** Replaces the view (another player's commit, a reconnect). */
  setView(view: PlayerView): void {
    this.snapshot = { ...this.snapshot, view };
    this.emit();
  }

  setStatus(patch: Partial<SessionStatus>): void {
    this.snapshot = { ...this.snapshot, status: { ...this.snapshot.status, ...patch } };
    this.emit();
  }

  async resend(): Promise<SubmitOutcome> {
    return { kind: "ignored" };
  }
  async reconnect(): Promise<void> {}
  retryComputers(): void {}

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
