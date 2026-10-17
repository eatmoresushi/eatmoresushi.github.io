/**
 * Turn toasts, the pure part (owner review 2026-10-17, item 7; B1): `shell/turnToasts.ts`.
 *
 * - the log present at mount is history; only newer entries make turns;
 * - one turn per other player's turn: the viewer's own commands and turn markers end it, table
 *   events and other players' events are no lines, an Order reward's Coins fold into the
 *   completion; a turn spans several updates under one key;
 * - lines are the game log's public words, never an own secret;
 * - the stack keeps one toast per player holding every turn of theirs that one update brought
 *   (a computer batch's Order turn and next Work turn alike), replaces it when a later update
 *   brings them a new turn, keeps it when the update only continues its last turn, closes each
 *   `TOAST_MS` after it changed, pauses and resumes with the time left, and dismisses one;
 * - a toast shows its newest `MAX_TOAST_TURNS` turns and counts the earlier ones;
 * - the stylesheet places the stack in the world's cell, makes the list the toasts' offset parent,
 *   and animates only without reduced motion, never with a slide that would overflow the list.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GameEvent, PlayerId, PublicGameEvent } from "../../../../src/game/index.ts";
import { eventText, publicEventText } from "../../../../src/app/i18n/events.ts";
import { createTranslator } from "../../../../src/app/i18n/translator.ts";
import type { LogEntry } from "../../../../src/app/session/gameSource.ts";
import { logCeramicView } from "../../../../src/app/shell/logCeramics.ts";
import {
  MAX_TOAST_LINES,
  MAX_TOAST_TURNS,
  NO_TOASTS,
  TOAST_MS,
  advanceTurns,
  isToastLine,
  nextDeadline,
  startTurnTracker,
  toastLines,
  toastReducer,
  toastTurns,
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
    const own: GameEvent = { type: "PRIVATE_LOOK_OPENED", playerId: other, kind: "commission_top_three", discipline: null, count: 3, secret } as GameEvent;
    const { secret: _drop, ...event } = own as GameEvent & { secret: unknown };
    const entry: LogEntry = { sequence: 81, revision: BASE + 1, actorId: other, event: event as PublicGameEvent, own };
    const context = { t: en, view, viewerId: other };
    // The log shows its owner the cards; a toast formats the public event only.
    expect(eventText(entry, context)).toContain("O33");
    const line = publicEventText(entry.event, context);
    expect(line).toBe(`${nameOf(other)} is looking at the top 3 Main Orders`);
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

  it("keep the newest turns and count the earlier ones", () => {
    expect(toastTurns(["a", "b"])).toEqual({ shown: ["a", "b"], earlier: 0 });
    const many = Array.from({ length: MAX_TOAST_TURNS + 2 }, (_, index) => String(index));
    const { shown, earlier } = toastTurns(many);
    expect(shown).toEqual(many.slice(-MAX_TOAST_TURNS));
    expect(earlier).toBe(2);
    expect(en("shell.toast.earlier", { n: 1 })).toBe("1 earlier turn is in the game log");
    expect(en("shell.toast.earlier", { n: 2 })).toBe("2 earlier turns are in the game log");
    expect(zh("shell.toast.earlier", { n: 2 })).toBe("此前另有2个回合，见对局记录");
  });
});

describe("toastReducer", () => {
  const turn = (playerId: PlayerId, key: number): Turn => ({ key, playerId, entries: entries(key, BASE + 1, playerId, [placed(playerId)]) });
  const players = (state: ToastState) => state.items.map((item) => [item.playerId, item.turns.map((shown) => shown.key)]);
  const types = (state: ToastState) => state.items.map((item) => [item.playerId, item.turns.map((shown) => shown.entries.map((entry) => entry.event.type))]);

  it("shows each update for TOAST_MS, one toast per player, the newest last", () => {
    let state = toastReducer(NO_TOASTS, { type: "turns", turns: [turn(other, 1), turn(third, 2)], now: 1_000 });
    expect(players(state)).toEqual([
      [other, [1]],
      [third, [2]],
    ]);
    expect(nextDeadline(state)).toBe(1_000 + TOAST_MS);
    // A later update with the same player's next turn replaces their toast and moves it last.
    state = toastReducer(state, { type: "turns", turns: [turn(other, 5)], now: 2_000 });
    expect(players(state)).toEqual([
      [third, [2]],
      [other, [5]],
    ]);
    expect(toastReducer(state, { type: "expire", now: 1_000 + TOAST_MS - 1 })).toBe(state);
    state = toastReducer(state, { type: "expire", now: 1_000 + TOAST_MS });
    expect(players(state)).toEqual([[other, [5]]]);
    state = toastReducer(state, { type: "expire", now: 2_000 + TOAST_MS });
    expect(state).toEqual({ items: [], pausedAt: null, updates: 2 });
    expect(nextDeadline(state)).toBeNull();
  });

  it("keeps every turn of one player that one update brings: an Order turn and the next Work turn", () => {
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
    const state = toastReducer(NO_TOASTS, { type: "turns", turns, now: 0 });
    expect(types(state)).toEqual([[other, [["ORDER_COMPLETED", "ORDER_TURN_ENDED"], ["WORKER_PLACED"]]]]);
    expect(state.items[0]!.update).toBe(1);
  });

  it("keeps each player's turns of one update in their own toast, in the order the players first moved", () => {
    // Both computers' last placements, then both Contributions, in one batch.
    const log = [
      ...entries(110, BASE + 1, other, [placed(other), turnEnded(other)]),
      ...entries(112, BASE + 1, third, [placed(third, "guild_hall"), turnEnded(third)]),
      ...entries(114, BASE + 1, other, [contribution(other)]),
      ...entries(115, BASE + 1, third, [contribution(third)]),
    ];
    const { turns } = advanceTurns(startTurnTracker([], BASE), log, viewer);
    expect(turns).toHaveLength(4);
    const state = toastReducer(NO_TOASTS, { type: "turns", turns, now: 0 });
    expect(players(state)).toEqual([
      [other, [110, 114]],
      [third, [112, 115]],
    ]);
  });

  it("keeps a toast's earlier turns when the update only continues its last turn", () => {
    const grown = (key: number): Turn => ({ key, playerId: other, entries: [...entries(key, BASE + 1, other, [placed(other)]), ...entries(key + 1, BASE + 2, other, [coins(other, 2)])] });
    let state = toastReducer(NO_TOASTS, { type: "turns", turns: [turn(other, 1), turn(other, 3)], now: 0 });
    state = toastReducer(state, { type: "turns", turns: [grown(3)], now: 1_000 });
    expect(players(state)).toEqual([[other, [1, 3]]]);
    expect(state.items[0]!.turns[1]!.entries).toHaveLength(2);
    expect(state.items[0]!.deadline).toBe(1_000 + TOAST_MS);
    expect(state.items[0]!.update).toBe(2);
    // The continuation and a new turn in one update: still the same toast, one more turn.
    state = toastReducer(state, { type: "turns", turns: [grown(3), turn(other, 9)], now: 1_500 });
    expect(players(state)).toEqual([[other, [1, 3, 9]]]);
    // A new turn of theirs in a later update replaces the toast.
    state = toastReducer(state, { type: "turns", turns: [turn(other, 12)], now: 2_000 });
    expect(players(state)).toEqual([[other, [12]]]);
  });

  it("pauses while hovered or focused and resumes with the time left", () => {
    let state = toastReducer(NO_TOASTS, { type: "turns", turns: [turn(other, 1)], now: 0 });
    state = toastReducer(state, { type: "pause", now: 1_000 });
    expect(nextDeadline(state)).toBeNull();
    expect(toastReducer(state, { type: "expire", now: 10_000 })).toBe(state);
    // A turn arriving while paused is updated in place and gets its full time after the pause.
    state = toastReducer(state, { type: "turns", turns: [turn(third, 2)], now: 5_000 });
    state = toastReducer(state, { type: "turns", turns: [turn(other, 3)], now: 6_000 });
    expect(players(state)).toEqual([
      [other, [3]],
      [third, [2]],
    ]);
    expect(state.items.map((item) => item.update)).toEqual([3, 2]);
    state = toastReducer(state, { type: "resume", now: 9_000 });
    expect(state.pausedAt).toBeNull();
    expect(state.items.map((item) => item.deadline)).toEqual([9_000 + TOAST_MS, 9_000 + TOAST_MS]);
  });

  it("dismisses one toast, and an empty stack is never paused", () => {
    let state = toastReducer(NO_TOASTS, { type: "turns", turns: [turn(other, 1), turn(third, 2)], now: 0 });
    state = toastReducer(state, { type: "pause", now: 100 });
    state = toastReducer(state, { type: "dismiss", playerId: other });
    expect(players(state)).toEqual([[third, [2]]]);
    expect(state.pausedAt).toBe(100);
    state = toastReducer(state, { type: "dismiss", playerId: third });
    expect(state).toEqual({ items: [], pausedAt: null, updates: 1 });
    expect(toastReducer(state, { type: "pause", now: 200 })).toBe(state);
  });
});

describe("toast stylesheet", () => {
  const css = (file: string) => readFileSync(join(ROOT, "src/app", file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  it("sits in the world's grid cell, at its bottom, letting the pointer through", () => {
    const shell = css("shell/GameShell.css");
    const rule = /\.shell-toasts\s*\{([^}]*)\}/.exec(shell)?.[1] ?? "";
    expect(rule).toMatch(/grid-area:\s*world;/);
    expect(rule).toMatch(/align-self:\s*end;/);
    expect(rule).toMatch(/pointer-events:\s*none;/);
    expect(css("shell/TurnToasts.css")).toMatch(/\.turn-toasts\s*\{[^}]*pointer-events:\s*auto;/);
  });

  it("animates only when motion is welcome", () => {
    const toasts = css("shell/TurnToasts.css");
    const motion = toasts.indexOf("@media (prefers-reduced-motion: no-preference)");
    expect(motion).toBeGreaterThan(0);
    expect(toasts.indexOf("animation")).toBeGreaterThan(motion);
    expect(toasts.indexOf("transition")).toBe(-1);
  });

  it("never slides a toast past the scrolling list's end, and is the toasts' offset parent", () => {
    const toasts = css("shell/TurnToasts.css");
    const keyframes = /@keyframes turn-toast-in\s*\{([\s\S]*?)\}\s*\}/.exec(toasts)?.[1] ?? "";
    expect(keyframes).toMatch(/opacity:\s*0;/);
    // A transform or a moved box grows the list's scrollable overflow while it runs.
    expect(keyframes).not.toMatch(/transform|translate|inset|margin|top:|bottom:|height|padding/);
    const list = /\.turn-toasts\s*\{([^}]*)\}/.exec(toasts)?.[1] ?? "";
    expect(list).toMatch(/position:\s*relative;/);
    expect(list).toMatch(/overflow-y:\s*auto;/);
    // Too little room for one toast: hidden, but keeping its layout so it can be measured again.
    expect(toasts).toMatch(/\.turn-toasts\[data-cramped\]\s*\{\s*visibility:\s*hidden;\s*\}/);
  });
});
