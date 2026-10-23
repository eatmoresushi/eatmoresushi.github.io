/**
 * Helpers shared by P3's suites (Workshop actions and kiln loading). Not a test file.
 *
 * - `table(spec)`: a `LocalTable` on `buildState(spec)` with the halting flow, so a worker
 *   action stops at `workerActionDone` instead of reaching P4's `work/turn`.
 * - `reject(...)`: the command fails with the code, leaves the state untouched and documents
 *   every `details` key (DESIGN §6.10).
 * - `expectPublicEvents(...)`: no event carries a `secret`, so its public projection is the
 *   event itself (DESIGN §4.4).
 * - `keySorted(...)`: the Postgres `jsonb` key order (length, then bytes) for round-trip
 *   determinism checks (DESIGN §7).
 * - `scrambleHidden(...)`: the same public state with different hidden contents (hands, deck
 *   orders); validators see only views, so their verdicts must not change (DESIGN §1.3).
 */

import { expect } from "vitest";
import { validateAction } from "../../../src/game/engine.ts";
import type { GameAction, GameEvent, GameRuleError, GameRuleErrorCode, GameState, PlayerId } from "../../../src/game/types.ts";
import { actorViewOf, projectEvent } from "../../../src/game/view.ts";
import { buildState, type StateSpec } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

export function table(spec: StateSpec = {}): LocalTable {
  return new LocalTable(buildState(spec), { flow: "halt" });
}

export function reject(t: LocalTable, actorId: PlayerId, action: GameAction, code: GameRuleErrorCode): GameRuleError {
  const error = t.expectRuleError(actorId, action, code);
  expectDocumentedDetails(error);
  return error;
}

/** `validateAction` on the actor's view: null or the error code (details documented). */
export function verdict(state: GameState, actorId: PlayerId, action: GameAction): GameRuleErrorCode | null {
  const error = validateAction(actorViewOf(state, actorId), action);
  if (error !== null) {
    expectDocumentedDetails(error);
  }
  return error?.code ?? null;
}

export function expectPublicEvents(events: readonly GameEvent[]): void {
  for (const event of events) {
    expect(Object.hasOwn(event, "secret"), `${event.type} must not carry a secret`).toBe(false);
    expect(projectEvent(event)).toEqual(event);
  }
}

export function types(events: readonly GameEvent[]): string[] {
  return events.map((event) => event.type);
}

export function keySorted<T>(value: T): T {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (input !== null && typeof input === "object") {
      const entries = Object.entries(input as Record<string, unknown>).sort(([a], [b]) =>
        a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0,
      );
      return Object.fromEntries(entries.map(([key, item]) => [key, sort(item)]));
    }
    return input;
  };
  return sort(value) as T;
}

/** Same public state, different secrets: hands swapped with deck cards (same counts) and every
 * hidden deck reversed. */
export function scrambleHidden(state: GameState): GameState {
  const copy = structuredClone(state);
  const hidden = copy.hidden;
  hidden.mainDeck.reverse();
  hidden.fireDeck.reverse();
  hidden.techDecks.workshop.reverse();
  hidden.techDecks.glazing_loading.reverse();
  hidden.techDecks.firing.reverse();
  for (const playerId of copy.playerOrder) {
    const hand = hidden.orderHands[playerId] ?? [];
    const replacement = hidden.mainDeck.splice(0, hand.length);
    hidden.mainDeck.push(...hand);
    hidden.orderHands[playerId] = replacement;
  }
  return copy;
}

/** A spec with secret hands, so privacy checks have something to leak. */
export function withHands(spec: StateSpec): StateSpec {
  const players = typeof spec.players === "object" ? spec.players : Array.from({ length: spec.players ?? 2 }, () => ({}));
  return {
    ...spec,
    players: players.map((p, seat) => ({ hand: seat === 0 ? ["S01", "O40"] : ["S02", "O41"], ...p })),
  };
}

export { buildState };
