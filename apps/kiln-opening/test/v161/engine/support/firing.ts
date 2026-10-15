/**
 * Firing scenario helpers (P5, additive). A firing table is a `buildState` scenario whose
 * Firing Phase has just been opened by `openFiringPhase` — exactly what the production
 * `work_phase_done` hand-over does — on a `LocalTable` with a halting flow, so the
 * `firing_done` hand-over is recorded instead of reaching the Order Phase.
 */

import { openFiringPhase } from "../../../../src/game/firing/contributions.ts";
import { SeededRandom } from "../../../../src/game/rng.ts";
import type { GameEvent, GameEventType, ResolveContext } from "../../../../src/game/types.ts";
import { buildState, type StateSpec } from "./fixtures.ts";
import { type FlowHalt, haltingFlow } from "./flow.ts";
import { LocalTable } from "./localTable.ts";

export interface FiringTableOptions {
  seed?: number;
}

/** `buildState(spec)`, then `openFiringPhase` on it, on a halting `LocalTable`. The opener's
 * events and hand-overs are recorded on the table. */
export function openFiringTable(spec: StateSpec, options: FiringTableOptions = {}): LocalTable {
  const state = buildState(spec);
  const rng = new SeededRandom(options.seed ?? 1);
  const halts: FlowHalt[] = [];
  const ctx: ResolveContext = { rng, events: [], flow: haltingFlow(halts) };
  openFiringPhase(state, ctx);
  const table = new LocalTable(state, { flow: "halt", rng });
  table.events.push(...ctx.events);
  table.halts.push(...halts);
  return table;
}

/** Every pending contributor submits Tend (always legal, L260). Returns the events. */
export function tendAll(table: LocalTable): GameEvent[] {
  const events: GameEvent[] = [];
  for (const playerId of [...table.prompt().actorIds]) {
    events.push(...table.contribute(playerId, "TEND"));
  }
  return events;
}

export function typesOf(events: readonly GameEvent[]): GameEventType[] {
  return events.map((event) => event.type);
}

export function eventsOfType<T extends GameEventType>(events: readonly GameEvent[], type: T): Array<Extract<GameEvent, { type: T }>> {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

/** Keys sorted by length, then bytes — the order Postgres `jsonb` stores them in (DESIGN §7). */
export function keySortedJsonRoundTrip<T>(value: T): T {
  const sortKeys = (item: unknown): unknown => {
    if (Array.isArray(item)) {
      return item.map(sortKeys);
    }
    if (item !== null && typeof item === "object") {
      const entries = Object.entries(item as Record<string, unknown>).sort(([a], [b]) =>
        a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0,
      );
      return Object.fromEntries(entries.map(([key, inner]) => [key, sortKeys(inner)]));
    }
    return item;
  };
  return sortKeys(JSON.parse(JSON.stringify(value))) as T;
}
