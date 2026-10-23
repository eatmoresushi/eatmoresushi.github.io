/**
 * Hidden information across complete V1.6.2 games played through the authoritative service
 * (AGENTS.md "Hidden information", DESIGN §4, ENGINE_V1.6.2_DELTA.md §7). Every seat is a
 * human seat driven by the strategic policy, so the games reach every private V1.6.2 moment
 * in the course of play: the Commission Market's Select 2 or Select 3 (v1.6.2 L64, L201–202),
 * Colour Samples' Select 3 when acquired and in its swap (L622, change 25), the Guild Hall
 * Shifu's inspection (L213, B2), the Canal Wharf Shifu's card taken unseen (L226), and the
 * looked cards not reserved that go face down under the Main Order deck (changes 24–25, B3;
 * line citations are revision-3 lines). They also reach Orders a seat saw and that then moved
 * where only another seat saw them go (`rehidden`: a face-up Order later given up for a swap or
 * a trim, a card put under the deck and later drawn by another seat).
 *
 * The fixture privacy oracle (`tools/fixturePrivacy.ts`) checks, against the authoritative
 * head and the full event log: the acting seat's response, every seat's reconnect payload, and
 * the stored public state and public event rows as a spectator sees them. It runs after every
 * command that opens, answers or follows a look or deals a secret, and after every 10th
 * revision. Realtime notifications carry no game data at all.
 */

import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { decisionPrompt } from "../../../src/game/index.ts";
import type { ActorView, GameEvent, GameState, PlayerCount, PlayerId, PrivateFiringState } from "../../../src/game/index.ts";
import { createStrategicComputerPolicy } from "../../../src/multiplayer/index.ts";
import type { PrivateEventRecord, PublicEventRecord, PublicStateNotification } from "../../../src/multiplayer/index.ts";
import { entryPrivacyProblems, foreignSecrets, walk, type PrivacyCheckedEntry } from "../../../tools/fixturePrivacy.ts";
import { command, connectionFor, headState, started, valueOf, type Harness } from "./support.ts";

/** The strategic policy with a budget no loaded test machine can trip (see computer_full_games). */
const STRATEGIC = createStrategicComputerPolicy({ decisionBudgetMs: 10_000 });

/** A viewer ID no seat has: everything secret is forbidden to it. */
const SPECTATOR = "spectator";

/** The private moments the games must reach, so the sweep is known to cover them. */
type Moment = "commission_market" | "colour_samples" | "colour_samples_swap" | "guild_inspection" | "canal_wharf_draw" | "looked_to_bottom" | "rehidden";

interface SweepResult {
  state: GameState;
  problems: string[];
  moments: Set<Moment>;
  checks: number;
}

async function privateFiringOf(harness: Harness, state: GameState): Promise<PrivateFiringState | null> {
  if (state.phase.type !== "firing_contributions") return null;
  const windowId = state.phase.windowId;
  const submissions: PrivateFiringState["submissions"] = {};
  for (const row of await harness.store.loadPrivateSubmissions(harness.roomId, windowId)) {
    submissions[row.playerId] = { card: row.card };
  }
  return { gameId: state.gameId, windowId, submissions };
}

function fullEventsOf(harness: Harness): GameEvent[] {
  return harness.store
    .audit()
    .fullEvents.filter((record) => record.roomId === harness.roomId)
    .sort((a, b) => a.sequence - b.sequence)
    .map((record) => record.event);
}

function entryOf(
  id: string,
  viewerId: PlayerId,
  view: ActorView["game"],
  own: ActorView["own"] | null,
  recent: readonly PublicEventRecord[],
  ownSecrets: readonly PrivateEventRecord[],
): PrivacyCheckedEntry {
  return {
    id,
    viewerId,
    playerView: { viewerId, game: view, own },
    recentPublicEvents: recent,
    ownSecrets,
  };
}

/**
 * Problems of a payload a spectator could see: no `hidden`, no `secret`, no hidden ID. Event
 * rows (`history`) show what was public when each event happened, so they may name an ID that
 * has moved unseen since (`rehidden`, such as a face-up Order later given up for a swap); the
 * public state never may.
 */
function spectatorProblems(label: string, state: GameState, payload: unknown, events: readonly GameEvent[], history: boolean): string[] {
  const { unseen, rehidden } = foreignSecrets(state, SPECTATOR, events);
  const problems: string[] = [];
  walk(payload, (path, value) => {
    const key = path[path.length - 1];
    if (key === "hidden" || key === "secret") problems.push(`${label}: key ${String(key)} at ${path.join(".")}`);
    if (typeof value !== "string") return;
    if (unseen.has(value)) problems.push(`${label}: ${value} from ${unseen.get(value)} at ${path.join(".")}`);
    else if (!history && rehidden.has(value)) problems.push(`${label}: ${value} from ${rehidden.get(value)} at ${path.join(".")}`);
  });
  return problems;
}

function noteMoments(moments: Set<Moment>, state: GameState, rows: readonly PublicEventRecord[]): void {
  const look = state.hidden.pendingLook;
  if (look !== null) moments.add(look.kind);
  for (const { event } of rows) {
    if (event.type === "ORDER_RESERVED" && event.source === "deck_top") moments.add("canal_wharf_draw");
    if (event.type === "LOOKED_ORDERS_TO_BOTTOM" && event.count > 0) moments.add("looked_to_bottom");
  }
}

const SWEEPS = new Map<string, Promise<SweepResult>>();

/** One sweep per table, shared by the tests below. */
function sweepOnce(players: PlayerCount, seedBase: number): Promise<SweepResult> {
  const key = `${players}:${seedBase}`;
  const cached = SWEEPS.get(key);
  if (cached !== undefined) return cached;
  const running = sweep(players, seedBase);
  SWEEPS.set(key, running);
  return running;
}

async function sweep(players: PlayerCount, seedBase: number): Promise<SweepResult> {
  const { harness } = await started({ humans: players, seedBase });
  const notifications: PublicStateNotification[] = [];
  const unsubscribe = harness.store.subscribePublic(harness.roomId, (notification) => notifications.push(notification));
  const problems: string[] = [];
  const moments = new Set<Moment>();
  let checks = 0;
  try {
    for (let step = 0; step < 4_000; step += 1) {
      // The in-memory store resolves in microtasks; yield a macrotask now and then so Vitest's
      // worker RPCs are answered on a slow machine (see fuzz.test.ts).
      if (step % 50 === 0) await yieldToEventLoop();
      const head = await headState(harness);
      if (head.phase.type === "finished") {
        for (const notification of notifications) expect(Object.keys(notification).sort()).toEqual(["eventSequence", "revision", "roomId"]);
        return { state: head, problems, moments, checks };
      }
      const actor = decisionPrompt(head).actorIds[0];
      if (actor === undefined) throw new Error(`No actor in ${head.phase.type}`);
      const reconnect = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, actor).seatToken }));
      if (reconnect.game === null || reconnect.ownPrivateView === null) throw new Error("No game view");
      const view: ActorView = { viewerId: actor, game: reconnect.game, own: reconnect.ownPrivateView };
      const choice = await STRATEGIC.chooseCommand(view, { playerId: actor, displayName: actor, aiSeed: seedBase, aiPolicyVersion: null });
      if (choice === null) throw new Error(`No strategic command in ${head.phase.type}`);
      const before = head.eventSequence;
      const response = await command(harness, actor, choice, head.revision);
      const next = await headState(harness);
      const recent = await harness.store.listPublicEvents(harness.roomId, before);
      noteMoments(moments, next, recent);
      const secretDealt = recent.some(({ event }) => event.type === "ORDER_RESERVED" || event.type === "ORDERS_DEALT" || event.type === "HELD_ORDER_DISCARDED");
      const private_ = head.hidden.pendingLook !== null || next.hidden.pendingLook !== null || response.ownSecrets.length > 0 || secretDealt;
      if (!private_ && next.revision % 10 !== 0) continue;
      const events = fullEventsOf(harness);
      const privateFiring = await privateFiringOf(harness, next);
      const where = `${players}p ${seedBase} r${next.revision} ${next.phase.type} ${choice.type}`;
      // The acting seat's own response, its public events included.
      const responseEntry: PrivacyCheckedEntry = { ...entryOf(`${where} response`, actor, response.game, response.ownPrivateView, recent, response.ownSecrets), events: response.events };
      problems.push(...entryPrivacyProblems(next, privateFiring, responseEntry, events));
      // Every seat's reconnect payload, with every secret addressed to it so far.
      for (const playerId of next.playerOrder) {
        if (foreignSecrets(next, playerId, events).rehidden.size > 0) moments.add("rehidden");
        const seat = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, playerId).seatToken }));
        if (seat.game === null) throw new Error("No game on reconnect");
        problems.push(...entryPrivacyProblems(next, privateFiring, entryOf(`${where} reconnect ${playerId}`, playerId, seat.game, seat.ownPrivateView, recent, seat.ownSecrets), events));
      }
      // The stored public state and public event rows, as a spectator sees them.
      problems.push(...spectatorProblems(`${where} public state`, next, await harness.store.loadPublicState(harness.roomId), events, false));
      problems.push(...spectatorProblems(`${where} public events`, next, recent, events, true));
      checks += 1;
    }
  } finally {
    unsubscribe();
  }
  throw new Error(`The ${players}-player game ${seedBase} did not finish`);
}

describe("V1.6.2 privacy across complete service games", () => {
  it.each([
    [2, 31_201],
    [3, 31_301],
    [4, 31_401],
  ] as const)("no seat, public row or payload ever holds another seat's secret (%i players, seed %i)", async (players, seedBase) => {
    const result = await sweepOnce(players, seedBase);
    expect(result.state.phase.type).toBe("finished");
    expect(result.problems).toEqual([]);
    expect(result.checks).toBeGreaterThan(15);
    // The strategic seats always visit the Commission Market, which always looks and returns
    // the unreserved cards under the deck (L195–196, change 24); the Canal Wharf Shifu's draw
    // is the commonest Shifu opening.
    for (const moment of ["commission_market", "looked_to_bottom", "canal_wharf_draw"] as const) expect(result.moments, moment).toContain(moment);
  }, 300_000);

  it("reaches every V1.6.2 private look over the seeded games", async () => {
    const moments = new Set<Moment>();
    for (const [players, seedBase] of [
      [2, 31_201],
      [3, 31_301],
      [4, 31_401],
      // Re-baselined for owner revision 4 (changes 28–35): 31 302 and 31 402 no longer reach a
      // Guild Hall Shifu inspection with the new costs and resources; 31 303 and 31 403 do.
      [3, 31_303],
      [4, 31_403],
    ] as const) {
      const result = await sweepOnce(players, seedBase);
      expect(result.problems).toEqual([]);
      for (const moment of result.moments) moments.add(moment);
    }
    for (const moment of ["commission_market", "colour_samples", "colour_samples_swap", "guild_inspection", "canal_wharf_draw", "looked_to_bottom", "rehidden"] as const) {
      expect(moments, moment).toContain(moment);
    }
  }, 600_000);
});
