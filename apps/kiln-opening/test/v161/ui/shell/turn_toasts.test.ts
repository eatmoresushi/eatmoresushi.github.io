/**
 * Turn toasts, the pure part (owner review 2026-10-17, item 7, and item 3: top right, one at a
 * time; B1): `shell/turnToasts.ts`.
 *
 * - the log present at mount is history; only newer entries make turns; so is what is played
 *   while the viewer is away (the page hidden, offline) and what the update bringing them back
 *   holds (`skipTurns`); in live play, entries that come after a view already showing them are
 *   news, and a gap in the log (later entries first) is waited for, so its turns play in order
 *   (passed after `GAP_WAIT_MS`; a gap of history is not waited for);
 * - one turn per other player's turn: the viewer's own commands and turn markers end it, table
 *   events and other players' events are no lines, an Order reward's Coins fold into the
 *   completion; a turn spans several updates under one key;
 * - lines are the game log's public words, never an own secret;
 * - the queue shows one turn at a time in the order they were played (the owner's 3-player
 *   example: Computer 1's turn, then Computer 2's), each for `TOAST_MS`; turns that arrive while
 *   one shows wait behind it, however many (no turn is ever dropped: a 4-player round's end
 *   brings ten turns and more in one batch); a turn that grows is updated in its place (the one
 *   showing gets its time again), one that grows after its toast closed joins the queue again;
 *   a hold (hover, focus, no room, the page hidden) pauses it with the time left, and may begin
 *   before any turn waits; dismissing shows the next;
 * - the stylesheet draws the jump bar as a row of its own above the world (no sticky overlay),
 *   and the toast at the top of the world's cell, in a band the world gives up (at its right end
 *   on desktop and tablet, across it on phones and in short landscape), so it is drawn over
 *   nothing, with the room that keeps the table still added to the world's own top and bottom
 *   room (read by no other rule, so the band resizes the world alone), and animates only without
 *   reduced motion.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GameEvent, PlayerId, PublicGameEvent } from "../../../../src/game/index.ts";
import { shell as shellCatalog } from "../../../../src/app/i18n/catalog/shell.ts";
import { eventText, publicEventText } from "../../../../src/app/i18n/events.ts";
import { createTranslator } from "../../../../src/app/i18n/translator.ts";
import type { LogEntry } from "../../../../src/app/session/gameSource.ts";
import { ceramicLabel } from "../../../../src/app/i18n/ceramicLabel.ts";
import { ceramicViewAsOf, logCeramicView } from "../../../../src/app/shell/logCeramics.ts";
import {
  GAP_WAIT_MS,
  MAX_TOAST_LINES,
  NO_TOASTS,
  TOAST_MS,
  advanceTurns,
  isToastLine,
  nextDeadline,
  showingToast,
  skipTurns,
  startTurnTracker,
  toastLines,
  toastReducer,
} from "../../../../src/app/shell/turnToasts.ts";
import type { ToastState, Turn } from "../../../../src/app/shell/turnToasts.ts";
import { ROOT } from "../../support/glossary.ts";
import { modelOf } from "./support.tsx";

const en = createTranslator("en", { strict: true });
const zh = createTranslator("zh-CN", { strict: true });

const model = modelOf("m1_work_phase_r2_3p");
const viewer = model.viewerId!;
const [other, third] = model.players.map((player) => player.playerId).filter((id) => id !== viewer) as [PlayerId, PlayerId];
const nameOf = (id: PlayerId) => model.players.find((player) => player.playerId === id)!.displayName;
const BASE = model.revision;

const placed = (playerId: PlayerId, locationId: "canal_wharf" | "guild_hall" = "canal_wharf"): PublicGameEvent => ({
  type: "WORKER_PLACED",
  playerId,
  workerId: `${playerId}:shifu`,
  kind: "shifu",
  locationId,
  spaceIndex: 0,
  effect: "shifu",
  viaSeniorApprentice: false,
});
const coins = (playerId: PlayerId, amount: number, reason: "canal_wharf" | "order_reward" = "canal_wharf"): PublicGameEvent => ({ type: "RESOURCES_CHANGED", playerId, clay: 0, wood: 0, coins: amount, reason });
const turnEnded = (playerId: PlayerId): PublicGameEvent => ({ type: "WORK_TURN_ENDED", playerId, automatic: false });
const turnStarted = (playerId: PlayerId): PublicGameEvent => ({ type: "WORK_TURN_STARTED", playerId });
const completed = (playerId: PlayerId, orderId: string, vp: number): PublicGameEvent =>
  ({ type: "ORDER_COMPLETED", playerId, record: { orderId, vp, coins: 0, crowns: 0, ceramicIds: [], via: "order_phase" } }) as unknown as PublicGameEvent;
const orderTurnStarted = (playerId: PlayerId): PublicGameEvent => ({ type: "ORDER_TURN_STARTED", playerId });
const orderTurnEnded = (playerId: PlayerId): PublicGameEvent => ({ type: "ORDER_TURN_ENDED", playerId, automatic: false });
const contribution = (playerId: PlayerId): PublicGameEvent => ({ type: "CONTRIBUTION_SUBMITTED", playerId, windowId: "w" }) as PublicGameEvent;

/** Log entries numbered from `first`, one revision per call, by `actorId`. */
function entries(first: number, revision: number, actorId: PlayerId, events: readonly PublicGameEvent[]): LogEntry[] {
  return events.map((event, index) => ({ sequence: first + index, revision, actorId, event }));
}

const keysOf = (turns: readonly Turn[]) => turns.map((turn) => [turn.playerId, turn.entries.map((entry) => entry.event.type)]);

describe("advanceTurns", () => {
  it("treats the log present at mount, and anything up to the mount revision, as history", () => {
    const history = entries(1, BASE - 1, other, [placed(other), coins(other, 2)]);
    const tracker = startTurnTracker(history, BASE);
    expect(advanceTurns(tracker, history, viewer).turns).toEqual([]);
    // Older entries that arrive after mount (a reconnect fills the log in) are history too.
    const late = [...history, ...entries(3, BASE, third, [placed(third)])];
    expect(advanceTurns(tracker, late, viewer).turns).toEqual([]);
  });

  it("makes one turn per other player's turn, oldest first, and never one of the viewer's", () => {
    const log = [
      ...entries(10, BASE + 1, viewer, [placed(viewer), coins(viewer, 2), turnEnded(viewer), turnStarted(other)]),
      ...entries(14, BASE + 2, other, [placed(other, "guild_hall"), coins(other, -2), turnEnded(other), turnStarted(third)]),
      ...entries(18, BASE + 3, third, [placed(third), coins(third, 2), turnEnded(third), turnStarted(viewer)]),
    ];
    const { turns, tracker } = advanceTurns(startTurnTracker([], BASE), log, viewer);
    expect(keysOf(turns)).toEqual([
      [other, ["WORKER_PLACED", "RESOURCES_CHANGED"]],
      [third, ["WORKER_PLACED", "RESOURCES_CHANGED"]],
    ]);
    expect(turns.map((turn) => turn.key)).toEqual([14, 18]);
    expect(tracker.open).toBeNull();
    expect(tracker.lastSequence).toBe(21);
    // Nothing new: nothing changes.
    expect(advanceTurns(tracker, log, viewer).turns).toEqual([]);
  });

  it("states only the actor's own events, not table events or another player's", () => {
    const log = entries(30, BASE + 1, other, [
      placed(other),
      { type: "DISPLAY_REFILLED", revealedOrderIds: [], display: [] } as unknown as PublicGameEvent,
      { type: "KILN_DIE_ROLLED", round: 2, value: 3 } as PublicGameEvent,
      coins(third, 1),
      { type: "QUALITY_ASSIGNED", ceramicId: "c1", quality: "fine", heatDifference: 0, cause: "fired" } as PublicGameEvent,
      { type: "QUALITY_ASSIGNED", ceramicId: "c1", quality: "fine", heatDifference: 0, cause: "second_firing" } as PublicGameEvent,
      { type: "QUALITY_IMPROVED", ceramicId: "c1", from: "standard", to: "fine", cause: "protective_saggars" } as PublicGameEvent,
    ]);
    const { turns } = advanceTurns(startTurnTracker([], BASE), log, viewer);
    expect(keysOf(turns)).toEqual([[other, ["WORKER_PLACED", "QUALITY_ASSIGNED", "QUALITY_IMPROVED"]]]);
    expect((turns[0]!.entries[1]!.event as { cause: string }).cause).toBe("second_firing");
  });

  it("folds an Order reward's Coins into the completion line, as the log does", () => {
    const completed = {
      type: "ORDER_COMPLETED",
      playerId: other,
      record: { orderId: "S01", vp: 3, coins: 2, crowns: 0, ceramicIds: [], via: "order_phase" },
    } as unknown as PublicGameEvent;
    const log = entries(40, BASE + 1, other, [completed, coins(other, 2, "order_reward")]);
    expect(isToastLine(log[1]!, log[0])).toBe(false);
    expect(keysOf(advanceTurns(startTurnTracker([], BASE), log, viewer).turns)).toEqual([[other, ["ORDER_COMPLETED"]]]);
  });

  it("folds Canal Barge's Coins into its line, as the log does (v1.6.2 L622)", () => {
    const used: PublicGameEvent = { type: "TECH_USED", playerId: other, techId: "T23" };
    const barge: PublicGameEvent = { type: "RESOURCES_CHANGED", playerId: other, clay: 0, wood: 0, coins: 2, reason: "canal_barge" };
    const log = entries(45, BASE + 1, other, [orderTurnStarted(other), used, barge, orderTurnEnded(other)]);
    expect(isToastLine(log[2]!, log[1])).toBe(false);
    const { turns } = advanceTurns(startTurnTracker([], BASE), log, viewer);
    expect(keysOf(turns)).toEqual([[other, ["TECH_USED", "ORDER_TURN_ENDED"]]]);
    expect(publicEventText(used, { t: en, view: logCeramicView(model, []), viewerId: viewer })).toBe(`${nameOf(other)} used Canal Barge: +2 Coins`);
  });

  it("folds a Guild Hall payment into the acquisition line after it, as the log does", () => {
    const paid: PublicGameEvent = { type: "RESOURCES_CHANGED", playerId: other, clay: 0, wood: 0, coins: -2, reason: "guild_hall" };
    const acquired: PublicGameEvent = { type: "TECH_ACQUIRED", playerId: other, techId: "T10", source: "face_up", cost: 2 };
    const log = entries(150, BASE + 1, other, [placed(other, "guild_hall"), paid, acquired]);
    expect(isToastLine(log[1]!, log[0], log[2])).toBe(false);
    expect(keysOf(advanceTurns(startTurnTracker([], BASE), log, viewer).turns)).toEqual([[other, ["WORKER_PLACED", "TECH_ACQUIRED"]]]);
    // No VP for a Tech (v1.6.2 change 27).
    expect(publicEventText(acquired, { t: en, view: logCeramicView(model, []), viewerId: viewer })).toBe(`${nameOf(other)} acquired Colour Samples: pay 2 Coins`);
  });

  it("shows the Contribution cards that come with Fuel Ledger as their own line, after the acquisition (v1.6.2 change 26)", () => {
    const paid: PublicGameEvent = { type: "RESOURCES_CHANGED", playerId: other, clay: 0, wood: 0, coins: -2, reason: "guild_hall" };
    const acquired: PublicGameEvent = { type: "TECH_ACQUIRED", playerId: other, techId: "T12", source: "face_up", cost: 2 };
    const cards: PublicGameEvent = { type: "CONTRIBUTION_CARDS_GAINED", playerId: other, techId: "T12", cards: ["FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"] };
    const log = entries(160, BASE + 1, other, [placed(other, "guild_hall"), paid, acquired, cards, turnEnded(other)]);
    expect(isToastLine(log[3]!, log[2], log[4])).toBe(true);
    expect(keysOf(advanceTurns(startTurnTracker([], BASE), log, viewer).turns)).toEqual([[other, ["WORKER_PLACED", "TECH_ACQUIRED", "CONTRIBUTION_CARDS_GAINED"]]]);
    expect(publicEventText(cards, { t: en, view: logCeramicView(model, []), viewerId: viewer })).toBe(`${nameOf(other)} took the Contribution cards that come with Fuel Ledger: Fuel Ledger Bank, Fuel Ledger Stoke`);
  });

  it("fits a Form & Decorate turn with Ding's extra vessel in the toast's 4 lines: no \"used Moulded Production\", no separate Ding cost line", () => {
    const formed = (ceramicId: string, formedBy: "form_decorate" | "ding_extra"): PublicGameEvent => ({ type: "CERAMIC_FORMED", playerId: other, ceramicId, shape: "plate", decoration: "plain", formedBy });
    const log = entries(200, BASE + 1, other, [
      { ...placed(other), locationId: "form_decorate", kind: "apprentice", workerId: `${other}:apprentice:1`, effect: "apprentice" } as PublicGameEvent,
      { type: "RESOURCES_CHANGED", playerId: other, clay: -1, wood: 0, coins: -2, reason: "form_decorate" },
      formed("c901", "form_decorate"),
      { type: "KILN_ABILITY_USED", playerId: other, kilnId: "DI" },
      { type: "RESOURCES_CHANGED", playerId: other, clay: -1, wood: 0, coins: -1, reason: "ding_extra" },
      formed("c902", "ding_extra"),
      turnEnded(other),
    ]);
    const { turns } = advanceTurns(startTurnTracker([], BASE), log, viewer);
    expect(keysOf(turns)).toEqual([[other, ["WORKER_PLACED", "RESOURCES_CHANGED", "CERAMIC_FORMED", "CERAMIC_FORMED"]]]);
    const context = { t: zh, view: logCeramicView(model, []), viewerId: viewer };
    const lines = turns[0]!.entries.map((entry) => publicEventText(entry.event, context));
    expect(toastLines(lines).more).toBe(0);
    expect(lines.at(-1)).toBe(`${nameOf(other)}制坯：盘 · 素面（「范制成器」：−1泥 · −1铜钱）`);
  });

  it("states a Jun adjustment in one line, and Ge's use in its Quality and Crackle lines only", () => {
    const jun = entries(220, BASE + 1, other, [
      { type: "RESOURCES_CHANGED", playerId: other, clay: 0, wood: -1, coins: 0, reason: "jun" },
      { type: "KILN_ABILITY_USED", playerId: other, kilnId: "JU" },
      { type: "JUN_ADJUSTED", playerId: other, ceramicId: "c903", delta: 1, finalActualHeat: 2, during: "first_firing" },
    ]);
    expect(keysOf(advanceTurns(startTurnTracker([], BASE), jun, viewer).turns)).toEqual([[other, ["JUN_ADJUSTED"]]]);
    const ge = entries(230, BASE + 1, other, [
      { type: "KILN_ABILITY_USED", playerId: other, kilnId: "GE" },
      { type: "QUALITY_IMPROVED", ceramicId: "c904", from: "standard", to: "fine", cause: "ge_crackle" },
      { type: "CRACKLE_APPLIED", playerId: other, ceramicId: "c904" },
    ]);
    expect(keysOf(advanceTurns(startTurnTracker([], BASE), ge, viewer).turns)).toEqual([[other, ["QUALITY_IMPROVED", "CRACKLE_APPLIED"]]]);
  });

  it("states another player's Colour Samples swap in public words only (v1.6.2 L617)", () => {
    const swap: GameEvent[] = [
      { type: "TECH_USED", playerId: other, techId: "T10" },
      { type: "HELD_ORDER_DISCARDED", playerId: other, cause: "colour_samples_swap", to: "main_discard", secret: { visibleTo: other, orderId: "O41" } },
      { type: "PRIVATE_LOOK_OPENED", playerId: other, kind: "colour_samples_swap", discipline: null, count: 2, secret: { visibleTo: other, orderIds: ["O12", "O33"], techIds: [] } },
      { type: "ORDER_RESERVED", playerId: other, via: "colour_samples_swap", source: "looked", slotIndex: null, orderId: null, secret: { visibleTo: other, orderId: "O33" } },
      { type: "LOOKED_ORDERS_TO_BOTTOM", playerId: other, count: 1, secret: { visibleTo: other, orderIds: ["O12"] } },
    ];
    const log: LogEntry[] = swap.map((own, index) => {
      const { secret: _drop, ...event } = own as GameEvent & { secret?: unknown };
      return { sequence: 46 + index, revision: BASE + 1, actorId: other, event: event as PublicGameEvent, own };
    });
    const { turns } = advanceTurns(startTurnTracker([], BASE), log, viewer);
    expect(keysOf(turns)).toEqual([[other, swap.map((event) => event.type)]]);
    const context = { t: en, view: logCeramicView(model, []), viewerId: viewer };
    const lines = turns[0]!.entries.map((entry) => publicEventText(entry.event, context));
    expect(lines).toEqual([
      `${nameOf(other)} used Colour Samples to swap a held Order`,
      `${nameOf(other)} discarded a held Order face down`,
      `${nameOf(other)} looked at the top 2 Main Orders`,
      `${nameOf(other)} reserved one of the Orders they looked at (Colour Samples swap)`,
      `${nameOf(other)} put 1 looked-at Order face down on the bottom of the Main Order deck`,
    ]);
    for (const line of [...lines, ...turns[0]!.entries.map((entry) => publicEventText(entry.event, { ...context, t: zh }))]) expect(line).not.toMatch(/O41|O12|O33/);
  });

  it("keeps one turn open across updates until it ends, under the same key", () => {
    const first = entries(50, BASE + 1, other, [placed(other)]);
    const step1 = advanceTurns(startTurnTracker([], BASE), first, viewer);
    expect(step1.tracker.open?.key).toBe(50);
    const second = [...first, ...entries(51, BASE + 2, other, [coins(other, 2), turnEnded(other), turnStarted(third)])];
    const step2 = advanceTurns(step1.tracker, second, viewer);
    expect(step2.turns).toHaveLength(1);
    expect(step2.turns[0]!.key).toBe(50);
    expect(step2.turns[0]!.entries.map((entry) => entry.sequence)).toEqual([50, 51]);
    expect(step2.tracker.open).toBeNull();
    // The same player's next turn is a new one.
    const third_ = [...second, ...entries(54, BASE + 3, other, [placed(other, "guild_hall")])];
    expect(advanceTurns(step2.tracker, third_, viewer).turns.map((turn) => turn.key)).toEqual([54]);
  });

  it("ends a turn when the viewer acts, so the next lines start a new one", () => {
    const log = [
      ...entries(60, BASE + 1, other, [{ type: "CONTRIBUTION_SUBMITTED", playerId: other, windowId: "w" }]),
      ...entries(61, BASE + 2, viewer, [{ type: "CONTRIBUTION_SUBMITTED", playerId: viewer, windowId: "w" }]),
      ...entries(62, BASE + 3, other, [{ type: "HEAT_MARKER_RETURNED", playerId: other, ceramicId: "c2" }]),
    ];
    const { turns } = advanceTurns(startTurnTracker([], BASE), log, viewer);
    expect(turns.map((turn) => [turn.playerId, turn.key])).toEqual([
      [other, 60],
      [other, 62],
    ]);
  });

  it("shows every player's moves to a spectator", () => {
    const log = entries(70, BASE + 1, viewer, [placed(viewer)]);
    expect(keysOf(advanceTurns(startTurnTracker([], BASE), log, null).turns)).toEqual([[viewer, ["WORKER_PLACED"]]]);
  });

  it("skips what was played while the viewer was away, as a reload does, and ends the open turn", () => {
    // Computer 1's turn starts while the viewer watches…
    const watched = entries(80, BASE + 1, other, [turnStarted(other), placed(other)]);
    const first = advanceTurns(startTurnTracker([], BASE), watched, viewer);
    expect(keysOf(first.turns)).toEqual([[other, ["WORKER_PLACED"]]]);
    expect(first.tracker.open?.key).toBe(81);
    // …then the page is hidden: the rest of it and Computer 2's turn make no turn.
    const away = [...watched, ...entries(82, BASE + 2, other, [coins(other, 2), turnEnded(other), turnStarted(third)]), ...entries(85, BASE + 3, third, [placed(third), turnEnded(third)])];
    const skipped = skipTurns(first.tracker, away, BASE + 3);
    expect(skipped).toEqual({ lastSequence: 86, sinceRevision: BASE + 3, open: null, gap: null });
    expect(advanceTurns(skipped, away, viewer).turns).toEqual([]);
    // What the update that brings the viewer back holds, up to its revision, is history too,
    // even when it is read later; the turns after it are news again, each its own.
    const back = [...away, ...entries(87, BASE + 4, other, [placed(other, "guild_hall")])];
    const returned = skipTurns(skipped, away, BASE + 4);
    expect(advanceTurns(returned, back, viewer).turns).toEqual([]);
    const later = [...back, ...entries(88, BASE + 5, third, [turnStarted(third), placed(third, "guild_hall")])];
    expect(keysOf(advanceTurns(returned, later, viewer).turns)).toEqual([[third, ["WORKER_PLACED"]]]);
    // Never backwards: an empty log or an older revision keeps the tracker's place.
    expect(skipTurns(skipped, [], BASE)).toEqual(skipped);
  });

  it("plays the entries that come after a view already showing them: in live play they are news", () => {
    // A poll reads the records, then a newer head: the view is ahead of the log for a while.
    const tracker = startTurnTracker([], BASE);
    const watched = entries(90, BASE + 1, other, [turnStarted(other), placed(other)]);
    const first = advanceTurns(tracker, watched, viewer, 0);
    expect(keysOf(first.turns)).toEqual([[other, ["WORKER_PLACED"]]]);
    // The rest of the batch arrives with the next poll: every turn in it plays, the open one grown.
    const filled = [
      ...watched,
      ...entries(92, BASE + 2, other, [coins(other, 2), turnEnded(other), turnStarted(third)]),
      ...entries(95, BASE + 3, third, [placed(third), turnEnded(third)]),
    ];
    const after = advanceTurns(first.tracker, filled, viewer, 0);
    expect(keysOf(after.turns)).toEqual([
      [other, ["WORKER_PLACED", "RESOURCES_CHANGED"]],
      [third, ["WORKER_PLACED"]],
    ]);
    expect(after.turns[0]!.key).toBe(91);
    expect(after.tracker.sinceRevision).toBe(BASE);
  });

  it("waits at a gap in the log, so the turns in it play in their place once they arrive", () => {
    // Computer 1's turn begins; the view moves on to the viewer's turn before the rest arrives,
    // and the viewer's own command comes first: a gap at 92–96.
    const watched = entries(90, BASE + 1, other, [turnStarted(other), placed(other)]);
    const first = advanceTurns(startTurnTracker([], BASE), watched, viewer, 1_000);
    const own = entries(97, BASE + 4, viewer, [placed(viewer), turnEnded(viewer)]);
    const waiting = advanceTurns(first.tracker, [...watched, ...own], viewer, 2_000);
    expect(waiting.turns).toEqual([]);
    expect(waiting.tracker.lastSequence).toBe(91);
    expect(waiting.tracker.gap).toEqual({ sequence: 92, since: 2_000 });
    // Still open a little later: it keeps waiting, from when it was first met.
    expect(advanceTurns(waiting.tracker, [...watched, ...own], viewer, 5_000).tracker.gap).toEqual({ sequence: 92, since: 2_000 });
    // The next read fills it: Computer 1's turn grows and Computer 2's plays, in turn order; the
    // viewer's own move after them makes none, and Computer 1's next move is news again.
    const filled = [
      ...watched,
      ...entries(92, BASE + 2, other, [coins(other, 2), turnEnded(other), turnStarted(third)]),
      ...entries(95, BASE + 3, third, [placed(third), turnEnded(third)]),
      ...own,
      ...entries(99, BASE + 5, other, [contribution(other)]),
    ];
    const after = advanceTurns(waiting.tracker, filled, viewer, 6_000);
    expect(keysOf(after.turns)).toEqual([
      [other, ["WORKER_PLACED", "RESOURCES_CHANGED"]],
      [third, ["WORKER_PLACED"]],
      [other, ["CONTRIBUTION_SUBMITTED"]],
    ]);
    expect(after.tracker).toEqual({ lastSequence: 99, sinceRevision: BASE, open: { key: 99, playerId: other, entries: [filled[filled.length - 1]] }, gap: null });
  });

  it("passes a gap still open after GAP_WAIT_MS, ending the turn being collected; a gap of history is not waited for", () => {
    const watched = entries(90, BASE + 1, other, [turnStarted(other), placed(other)]);
    const first = advanceTurns(startTurnTracker([], BASE), watched, viewer, 0);
    const later = [...watched, ...entries(95, BASE + 3, other, [coins(other, 2), turnEnded(other)])];
    const waiting = advanceTurns(first.tracker, later, viewer, 0);
    expect(waiting.turns).toEqual([]);
    expect(advanceTurns(waiting.tracker, later, viewer, GAP_WAIT_MS - 1).turns).toEqual([]);
    const passed = advanceTurns(waiting.tracker, later, viewer, GAP_WAIT_MS);
    // A turn of its own: what the gap held is unknown.
    expect(passed.turns.map((turn) => [turn.key, turn.entries.map((entry) => entry.event.type)])).toEqual([[95, ["RESOURCES_CHANGED"]]]);
    expect(passed.tracker).toEqual({ lastSequence: 96, sinceRevision: BASE, open: null, gap: null });
    // History (up to the mount or the return) has no turn to wait for: the gap is passed at once.
    const history = startTurnTracker(entries(1, BASE - 2, other, [placed(other)]), BASE);
    const afterHistory = [...entries(1, BASE - 2, other, [placed(other)]), ...entries(4, BASE, third, [placed(third)]), ...entries(5, BASE + 1, third, [contribution(third)])];
    const quick = advanceTurns(history, afterHistory, viewer, 0);
    expect(keysOf(quick.turns)).toEqual([[third, ["CONTRIBUTION_SUBMITTED"]]]);
    expect(quick.tracker.gap).toBeNull();
  });
});

describe("toast lines", () => {
  const view = logCeramicView(model, []);

  it("are the game log's public words", () => {
    const [entry] = entries(80, BASE + 1, other, [placed(other, "guild_hall")]);
    const context = { t: en, view, viewerId: viewer };
    expect(publicEventText(entry!.event, context)).toBe(`${nameOf(other)} placed their Shifu at Guild Hall`);
    expect(publicEventText(entry!.event, { ...context, t: zh })).toBe(`${nameOf(other)}派师傅到陶工行`);
  });

  it("never carry the looker's secret, even when the entry holds one", () => {
    const secret = { visibleTo: other, orderIds: ["O33", "O12", "O07"], techIds: [] };
    const own: GameEvent = { type: "PRIVATE_LOOK_OPENED", playerId: other, kind: "commission_market", discipline: null, count: 3, secret } as GameEvent;
    const { secret: _drop, ...event } = own as GameEvent & { secret: unknown };
    const entry: LogEntry = { sequence: 81, revision: BASE + 1, actorId: other, event: event as PublicGameEvent, own };
    const context = { t: en, view, viewerId: other };
    // The log shows its owner the cards; a toast formats the public event only.
    expect(eventText(entry, context)).toContain("O33");
    const line = publicEventText(entry.event, context);
    expect(line).toBe(`${nameOf(other)} looked at the top 3 Main Orders`);
    expect(line).not.toMatch(/O33|O12|O07/);
  });

  it("count the rest beyond the cap", () => {
    expect(toastLines(["a", "b"])).toEqual({ shown: ["a", "b"], more: 0 });
    const many = Array.from({ length: MAX_TOAST_LINES + 2 }, (_, index) => String(index));
    const { shown, more } = toastLines(many);
    expect(shown).toHaveLength(MAX_TOAST_LINES - 1);
    expect(more).toBe(3);
    expect(en("shell.toast.more", { n: 3 })).toBe("and 3 more lines in the game log");
    expect(zh("shell.toast.more", { n: 3 })).toBe("另有3条，见对局记录");
  });

  it("name a ceramic as it was when the turn ended, never as a later move left it", () => {
    // Two like vases of Computer 1's, both loaded; the first is delivered on a later turn.
    const formed = (id: string): PublicGameEvent => ({ type: "CERAMIC_FORMED", playerId: other, ceramicId: id, shape: "vase", decoration: "painted", formedBy: "form_decorate" }) as PublicGameEvent;
    const loaded = (id: string, spaceId: string): PublicGameEvent =>
      ({ type: "CERAMIC_LOADED", playerId: other, ceramicId: id, glaze: "grey_green", placement: { kiln: "shared", spaceId, inverted: false }, loadedBy: "glaze_load" }) as unknown as PublicGameEvent;
    const delivered: PublicGameEvent = { type: "ORDER_COMPLETED", playerId: other, record: { orderId: "S01", vp: 3, coins: 0, crowns: 0, ceramicIds: ["x1"], via: "order_phase" } } as unknown as PublicGameEvent;
    const log = [
      ...entries(200, BASE + 1, other, [formed("x1"), formed("x2")]),
      ...entries(202, BASE + 2, other, [loaded("x1", "high_2"), loaded("x2", "middle_1")]),
      ...entries(204, BASE + 3, other, [delivered]),
      ...entries(205, BASE + 4, other, [formed("x3")]),
    ];
    const label = (view: Parameters<typeof ceramicLabel>[1]) => ceramicLabel("x1" as never, view, { locale: en });
    // The game log names it as it is now: delivered.
    expect(label(logCeramicView(model, log))).toMatch(/\(delivered\)/);
    // The toast of the loading turn names it as it was then: in High 2, beside its twin.
    const asOfLoad = ceramicViewAsOf(model, log, 203);
    expect(label(asOfLoad)).toMatch(/High 2/);
    expect(label(asOfLoad)).not.toMatch(/delivered/);
    expect(asOfLoad.ceramics?.["x1" as never]?.stage).toBe("loaded");
    // A ceramic formed after the turn is not there yet; one older than the log comes from the model.
    expect(asOfLoad.ceramics?.["x3" as never]).toBeUndefined();
    for (const id of Object.keys(model.ceramics)) expect(asOfLoad.ceramics?.[id as never]?.ownerId).toBe(model.ceramics[id as never]!.ownerId);
    // As of the delivery, it is delivered.
    expect(ceramicViewAsOf(model, log, 204).ceramics?.["x1" as never]?.stage).toBe("delivered");
  });

  it("have no count of dropped turns: none is ever dropped", () => {
    expect(Object.keys(shellCatalog.en).filter((key) => key.startsWith("toast."))).toEqual(["toast.label", "toast.close", "toast.more"]);
    expect(Object.keys(shellCatalog.zh).filter((key) => key.startsWith("toast."))).toEqual(["toast.label", "toast.close", "toast.more"]);
  });
});

describe("toastReducer", () => {
  const turn = (playerId: PlayerId, key: number, count = 1): Turn => ({
    key,
    playerId,
    entries: entries(key, BASE + 1, playerId, Array.from({ length: count }, (_, index) => (index === 0 ? placed(playerId) : coins(playerId, index)))),
  });
  /** The queue as [player, turn key] pairs, the toast showing first. */
  const queue = (state: ToastState) => state.items.map((item) => [item.turn.playerId, item.turn.key]);
  const at = (now: number) => ({ now });

  it("shows one turn at a time, in the order they were played, each for TOAST_MS", () => {
    // The owner's example: in a 3-player game, after the viewer's turn ends, Computer 1's turn
    // shows for 3 seconds, then Computer 2's, then it is the viewer's turn again.
    const log = [
      ...entries(10, BASE + 1, viewer, [placed(viewer), turnEnded(viewer), turnStarted(other)]),
      ...entries(13, BASE + 2, other, [placed(other), coins(other, 2), turnEnded(other), turnStarted(third)]),
      ...entries(17, BASE + 3, third, [placed(third, "guild_hall"), turnEnded(third), turnStarted(viewer)]),
    ];
    const { turns } = advanceTurns(startTurnTracker([], BASE), log, viewer);
    let state = toastReducer(NO_TOASTS, { type: "turns", turns, ...at(1_000) });
    expect(queue(state)).toEqual([
      [other, 13],
      [third, 17],
    ]);
    expect(showingToast(state)!.turn.playerId).toBe(other);
    expect(nextDeadline(state)).toBe(1_000 + TOAST_MS);
    expect(toastReducer(state, { type: "expire", ...at(1_000 + TOAST_MS - 1) })).toBe(state);
    // Computer 2's turn shows next, for its own 3 seconds from when it appears.
    state = toastReducer(state, { type: "expire", ...at(1_000 + TOAST_MS + 40) });
    expect(queue(state)).toEqual([[third, 17]]);
    expect(nextDeadline(state)).toBe(1_000 + TOAST_MS + 40 + TOAST_MS);
    state = toastReducer(state, { type: "expire", ...at(1_000 + 2 * TOAST_MS + 40) });
    expect(state).toEqual(NO_TOASTS);
    expect(showingToast(state)).toBeNull();
    expect(nextDeadline(state)).toBeNull();
  });

  it("queues turns that arrive while one shows, behind the ones already waiting", () => {
    let state = toastReducer(NO_TOASTS, { type: "turns", turns: [turn(other, 1)], ...at(0) });
    state = toastReducer(state, { type: "turns", turns: [turn(third, 2)], ...at(1_000) });
    state = toastReducer(state, { type: "turns", turns: [turn(other, 3), turn(third, 4)], ...at(2_000) });
    expect(queue(state)).toEqual([
      [other, 1],
      [third, 2],
      [other, 3],
      [third, 4],
    ]);
    // The toast showing keeps its time: nothing waiting moves it.
    expect(nextDeadline(state)).toBe(TOAST_MS);
  });

  it("keeps every turn of one player that one batch brings, each its own toast: an Order turn and the next Work turn", () => {
    // The reviewer's case: Computer 2 completes an Order, the round turns over and Computer 2,
    // first player, places a worker, all in one computer batch.
    const log = entries(100, BASE + 1, other, [
      orderTurnStarted(other),
      completed(other, "S14", 3),
      orderTurnEnded(other),
      { type: "ROUND_STARTED", round: 3, firstPlayerId: other } as PublicGameEvent,
      turnStarted(other),
      placed(other, "guild_hall"),
      turnEnded(other),
    ]);
    const { turns } = advanceTurns(startTurnTracker([], BASE), log, viewer);
    expect(keysOf(turns)).toEqual([
      [other, ["ORDER_COMPLETED", "ORDER_TURN_ENDED"]],
      [other, ["WORKER_PLACED"]],
    ]);
    const state = toastReducer(NO_TOASTS, { type: "turns", turns, ...at(0) });
    expect(queue(state)).toEqual([
      [other, 101],
      [other, 105],
    ]);
  });

  it("plays both players' last placements and both Contributions of one batch in the order they were played", () => {
    const log = [
      ...entries(110, BASE + 1, other, [placed(other), turnEnded(other)]),
      ...entries(112, BASE + 1, third, [placed(third, "guild_hall"), turnEnded(third)]),
      ...entries(114, BASE + 1, other, [contribution(other)]),
      ...entries(115, BASE + 1, third, [contribution(third)]),
    ];
    const { turns } = advanceTurns(startTurnTracker([], BASE), log, viewer);
    const state = toastReducer(NO_TOASTS, { type: "turns", turns, ...at(0) });
    expect(queue(state)).toEqual([
      [other, 110],
      [third, 112],
      [other, 114],
      [third, 115],
    ]);
  });

  it("updates a turn that grows in its place; the one showing gets its full time again", () => {
    let state = toastReducer(NO_TOASTS, { type: "turns", turns: [turn(other, 1), turn(third, 2)], ...at(0) });
    // The toast showing grows (a turn of several commands): same place, TOAST_MS from now.
    state = toastReducer(state, { type: "turns", turns: [turn(other, 1, 2)], ...at(1_000) });
    expect(queue(state)).toEqual([
      [other, 1],
      [third, 2],
    ]);
    expect(showingToast(state)!.turn.entries).toHaveLength(2);
    expect(nextDeadline(state)).toBe(1_000 + TOAST_MS);
    // A waiting turn grows: updated where it waits; the toast showing keeps its time.
    state = toastReducer(state, { type: "turns", turns: [turn(third, 2, 3), turn(other, 7)], ...at(2_000) });
    expect(queue(state)).toEqual([
      [other, 1],
      [third, 2],
      [other, 7],
    ]);
    expect(state.items[1]!.turn.entries).toHaveLength(3);
    expect(nextDeadline(state)).toBe(1_000 + TOAST_MS);
  });

  it("queues a turn again when it grows after its toast closed", () => {
    let state = toastReducer(NO_TOASTS, { type: "turns", turns: [turn(other, 1)], ...at(0) });
    state = toastReducer(state, { type: "expire", ...at(TOAST_MS) });
    expect(state).toEqual(NO_TOASTS);
    state = toastReducer(state, { type: "turns", turns: [turn(other, 1, 2)], ...at(5_000) });
    expect(queue(state)).toEqual([[other, 1]]);
    expect(showingToast(state)!.turn.entries).toHaveLength(2);
    expect(nextDeadline(state)).toBe(5_000 + TOAST_MS);
  });

  it("pauses while hovered or focused and resumes with the time left", () => {
    let state = toastReducer(NO_TOASTS, { type: "turns", turns: [turn(other, 1)], ...at(0) });
    state = toastReducer(state, { type: "pause", ...at(1_000) });
    expect(nextDeadline(state)).toBeNull();
    expect(toastReducer(state, { type: "expire", ...at(10_000) })).toBe(state);
    // Turns arriving while paused wait their turn.
    state = toastReducer(state, { type: "turns", turns: [turn(third, 2)], ...at(5_000) });
    expect(queue(state)).toEqual([
      [other, 1],
      [third, 2],
    ]);
    state = toastReducer(state, { type: "resume", ...at(9_000) });
    expect(state.pausedAt).toBeNull();
    // 2s were left when it paused.
    expect(nextDeadline(state)).toBe(9_000 + TOAST_MS - 1_000);
    expect(toastReducer(state, { type: "resume", ...at(9_500) })).toBe(state);
  });

  it("dismisses the toast showing and shows the next for its full time, even while paused", () => {
    let state = toastReducer(NO_TOASTS, { type: "turns", turns: [turn(other, 1), turn(third, 2), turn(other, 3)], ...at(0) });
    state = toastReducer(state, { type: "dismiss", key: 1, ...at(500) });
    expect(queue(state)).toEqual([
      [third, 2],
      [other, 3],
    ]);
    expect(nextDeadline(state)).toBe(500 + TOAST_MS);
    // A key no longer in the queue (the toast changed as it was pressed) changes nothing.
    expect(toastReducer(state, { type: "dismiss", key: 1, ...at(600) })).toBe(state);
    // Paused (the close button is focused): the next one waits, then gets its full time.
    state = toastReducer(state, { type: "pause", ...at(1_000) });
    state = toastReducer(state, { type: "dismiss", key: 2, ...at(1_500) });
    expect(queue(state)).toEqual([[other, 3]]);
    expect(state.pausedAt).toBe(1_000);
    state = toastReducer(state, { type: "resume", ...at(4_000) });
    expect(nextDeadline(state)).toBe(4_000 + TOAST_MS);
    // The last one, while held: the queue is empty, the hold stays until the screen releases it.
    state = toastReducer(state, { type: "pause", ...at(4_100) });
    state = toastReducer(state, { type: "dismiss", key: 3, ...at(4_200) });
    expect(state.items).toEqual([]);
    expect(nextDeadline(state)).toBeNull();
    expect(state.pausedAt).toBe(4_100);
    expect(toastReducer(state, { type: "resume", ...at(4_300) })).toEqual(NO_TOASTS);
  });

  it("holds before any turn waits: a turn arriving while held gets its full time from the release", () => {
    // The page is hidden, or the phone's sheet leaves no room, before the turn arrives.
    let state = toastReducer(NO_TOASTS, { type: "pause", ...at(1_000) });
    expect(state.pausedAt).toBe(1_000);
    expect(toastReducer(state, { type: "pause", ...at(1_500) })).toBe(state);
    state = toastReducer(state, { type: "turns", turns: [turn(other, 1), turn(third, 2)], ...at(5_000) });
    expect(nextDeadline(state)).toBeNull();
    expect(toastReducer(state, { type: "expire", ...at(60_000) })).toBe(state);
    state = toastReducer(state, { type: "resume", ...at(60_000) });
    expect(queue(state)).toEqual([
      [other, 1],
      [third, 2],
    ]);
    expect(nextDeadline(state)).toBe(60_000 + TOAST_MS);
    // Held again mid-toast (no room): it keeps the time it had left.
    state = toastReducer(state, { type: "pause", ...at(61_000) });
    state = toastReducer(state, { type: "resume", ...at(70_000) });
    expect(nextDeadline(state)).toBe(70_000 + TOAST_MS - 1_000);
    // Released with nothing waiting: back to the empty queue.
    expect(toastReducer(toastReducer(NO_TOASTS, { type: "pause", ...at(0) }), { type: "resume", ...at(10) })).toEqual(NO_TOASTS);
  });

  it("removes a waiting turn dismissed by its key without touching the toast showing", () => {
    let state = toastReducer(NO_TOASTS, { type: "turns", turns: [turn(other, 1), turn(third, 2), turn(other, 3)], ...at(0) });
    state = toastReducer(state, { type: "dismiss", key: 2, ...at(100) });
    expect(queue(state)).toEqual([
      [other, 1],
      [other, 3],
    ]);
    expect(nextDeadline(state)).toBe(TOAST_MS);
  });

  it("keeps every turn, however many wait: one 4-player end-of-round batch plays in full, in order", () => {
    // The reviewer's case: one computer batch with no decision of the viewer's in it brings the
    // last placements, the Contributions, the Heat markers, the after-Quality abilities, the
    // Order turns and the next round's placements of three computers: more than ten turns.
    const players = [other, third];
    const batch: Turn[] = Array.from({ length: 24 }, (_, index) => turn(players[index % 2]!, 200 + index));
    let state = toastReducer(NO_TOASTS, { type: "turns", turns: batch.slice(0, 14), ...at(0) });
    // The viewer decides quickly: the next batch arrives while the first still plays.
    state = toastReducer(state, { type: "expire", ...at(TOAST_MS) });
    state = toastReducer(state, { type: "turns", turns: batch.slice(14), ...at(TOAST_MS + 500) });
    expect(state.items).toHaveLength(23);
    const shown: number[] = [];
    let now = TOAST_MS;
    while (showingToast(state) !== null) {
      shown.push(showingToast(state)!.turn.key);
      now = nextDeadline(state)!;
      state = toastReducer(state, { type: "expire", now });
    }
    expect(shown).toEqual(batch.slice(1).map((item) => item.key));
    // Each for its own TOAST_MS, one after the other.
    expect(now).toBe(24 * TOAST_MS);
    expect(state).toEqual(NO_TOASTS);
  });
});

describe("toast stylesheet", () => {
  const css = (file: string) => readFileSync(join(ROOT, "src/app", file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  it("draws the jump bar as a row of its own above the world, so nothing of the world lies under it or under the toast below it", () => {
    const shell = css("shell/GameShell.css");
    // Desktop and tablet: the jump bar's row between the banner and the world, beside the pane.
    const grid = /\.shell\s*\{([^}]*)\}/.exec(shell)?.[1] ?? "";
    expect(grid).toMatch(/grid-template-rows:\s*auto auto auto minmax\(0, 1fr\);/);
    expect(grid).toMatch(/"top top"\s*"banner banner"\s*"jump pane"\s*"world pane"/);
    const hidden = /\.shell\[data-pane="hidden"\]\s*\{([^}]*)\}/.exec(shell)?.[1] ?? "";
    expect(hidden).toMatch(/"top"\s*"banner"\s*"bar"\s*"jump"\s*"world"/);
    expect(/\.shell-jump\s*\{([^}]*)\}/.exec(shell)?.[1] ?? "").toMatch(/grid-area:\s*jump;/);
    // Phones and short landscape: no jump bar (their grids have no "jump" area).
    for (const query of ["@container shell (max-width: 899px)", "@media (orientation: landscape) and (max-height: 500px)"]) {
      expect(/\.shell-jump\s*\{([^}]*)\}/.exec(shell.slice(shell.indexOf(query)))?.[1] ?? "", query).toMatch(/display:\s*none;/);
    }
    // The world starts below the bar with its own top room; the bar is no sticky overlay.
    const world = /\.shell-world\s*\{([^}]*)\}/.exec(shell)?.[1] ?? "";
    expect(world).toMatch(/--world-pad-start:\s*var\(--sp-7\);/);
    expect(world).toMatch(/--world-pad-end:\s*var\(--sp-8\);/);
    const sections = css("shell/WorldSections.css");
    expect(sections).not.toMatch(/sticky/);
    expect(sections).not.toMatch(/turn-toast/);
    expect(/\.world-section\s*\{([^}]*)\}/.exec(sections)?.[1] ?? "").toMatch(/scroll-margin-top:\s*var\(--sp-7\);/);
    // The toast at the band's right end on desktop and tablet; it takes the pointer, its holder does not.
    const holder = /\.shell-toasts\s*\{([^}]*)\}/.exec(shell)?.[1] ?? "";
    expect(holder).toMatch(/align-items:\s*flex-end;/);
    const toasts = css("shell/TurnToasts.css");
    expect(toasts).not.toMatch(/jump-bar/);
    const group = /\.turn-toasts\s*\{([^}]*)\}/.exec(toasts)?.[1] ?? "";
    expect(group).toMatch(/pointer-events:\s*auto;/);
    expect(group).toMatch(/width:\s*min\(24rem,\s*100%\);/);
    // Too little room for the toast: hidden, but keeping its layout so it can be measured again.
    expect(toasts).toMatch(/\.turn-toasts\[data-cramped\]\s*\{\s*visibility:\s*hidden;\s*\}/);
  });

  it("lies at the top of the world's cell, in the band the world gives up; across it on phones and in short landscape", () => {
    const shell = css("shell/GameShell.css");
    const rule = /\.shell-toasts\s*\{([^}]*)\}/.exec(shell)?.[1] ?? "";
    expect(rule).toMatch(/grid-area:\s*world;/);
    expect(rule).toMatch(/align-self:\s*start;/);
    expect(rule).toMatch(/max-height:\s*100%;/);
    expect(rule).toMatch(/pointer-events:\s*none;/);
    // The world moves down by the band TurnToasts.tsx measures (0 when no toast shows there); the
    // room that keeps the table still (toastRoom.ts) adds to its own top and bottom room, at
    // every width (the breakpoints set only the world's own room and its sides).
    const world = /\.shell-world\s*\{([^}]*)\}/.exec(shell)?.[1] ?? "";
    expect(world).toMatch(/margin-block-start:\s*var\(--turn-toast-band,\s*0px\);/);
    expect(world).toMatch(/padding:\s*calc\(var\(--world-pad-start\) \+ var\(--turn-toast-lead, 0px\)\) var\(--sp-7\) calc\(var\(--world-pad-end\) \+ var\(--turn-toast-tail, 0px\)\);/);
    const worldRules = [...shell.matchAll(/\.shell-world\s*\{([^}]*)\}/g)].map((match) => match[1] ?? "");
    expect(worldRules.length).toBeGreaterThan(1);
    for (const later of worldRules.slice(1)) expect(later).not.toMatch(/(^|[\s;])padding(-block|-top|-bottom)?\s*:/);
    const phone = shell.slice(shell.indexOf("@container shell (max-width: 899px)"));
    expect(/\.shell-toasts\s*\{([^}]*)\}/.exec(phone)?.[1] ?? "").toMatch(/align-items:\s*stretch;/);
    const landscape = shell.slice(shell.indexOf("@media (orientation: landscape) and (max-height: 500px)"));
    expect(/\.shell-toasts\s*\{([^}]*)\}/.exec(landscape)?.[1] ?? "").toMatch(/align-items:\s*stretch;/);
    const toasts = css("shell/TurnToasts.css");
    for (const query of ["@container shell (max-width: 899px)", "@media (orientation: landscape) and (max-height: 500px)"]) {
      expect(/\.turn-toasts\s*\{([^}]*)\}/.exec(toasts.slice(toasts.indexOf(query)))?.[1] ?? "", query).toMatch(/width:\s*100%;/);
    }
  });

  it("lets the band and its room resize the world alone: no other rule reads them, so the toast's resize observer, which watches the toast and its holder, never resizes what it watches in its own callback", () => {
    const files = readdirSync(join(ROOT, "src/app"), { recursive: true })
      .map(String)
      .filter((file) => file.endsWith(".css"))
      .sort();
    expect(files.length).toBeGreaterThan(10);
    const readers: string[] = [];
    for (const file of files) {
      for (const [, selector, body] of css(file).matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
        if (/var\(--turn-toast-(band|lead|tail)\b/.test(body ?? "")) readers.push(`${file}: ${(selector ?? "").trim()}`);
      }
    }
    expect(readers).toEqual(["shell/GameShell.css: .shell-world"]);
  });

  it("animates only when motion is welcome", () => {
    const toasts = css("shell/TurnToasts.css");
    const motion = toasts.indexOf("@media (prefers-reduced-motion: no-preference)");
    expect(motion).toBeGreaterThan(0);
    expect(toasts.indexOf("animation")).toBeGreaterThan(motion);
    expect(toasts.indexOf("@keyframes")).toBeGreaterThan(motion);
    expect(toasts.indexOf("transform")).toBeGreaterThan(motion);
    expect(toasts.indexOf("transition")).toBe(-1);
  });
});
