// @vitest-environment happy-dom
/**
 * Turn toasts in the DOM (owner review 2026-10-17, item 7; B1): what static markup cannot show.
 * - another player's turn shows one toast in the game log's words and closes after 3s; the
 *   viewer's own move and the log present at mount show none;
 * - several players: one toast each, in turn order; a player's next turn replaces theirs;
 * - one update with several turns of one player (a computer batch) shows each turn as its own
 *   group in that player's toast, nothing dropped; past `MAX_TOAST_TURNS` the earlier are counted;
 * - a stack taller than its room brings the first toast an update changed to the top, never
 *   while paused; a room too short for one toast (the phone's open decision sheet) hides it until
 *   the room comes back;
 * - hovering or focusing pauses every toast, leaving resumes them with the time left;
 * - the close button and Escape dismiss one; focus moves to the next toast (keyboard) or back to
 *   where it was;
 * - it is not a live region: the one polite region (LiveAnnouncer) says the moves, once;
 * - it sits between the world and the decision pane in the shell's markup;
 * - a language switch re-renders it.
 */
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerId, PublicGameEvent } from "../../../../src/game/index.ts";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { I18nProvider } from "../../../../src/app/i18n/I18nProvider.tsx";
import type { GameSnapshot, LogEntry } from "../../../../src/app/session/gameSource.ts";
import { fixtureSnapshot } from "../../../../src/app/session/fixtureSource.ts";
import { GameShell } from "../../../../src/app/shell/GameShell.tsx";
import { LanguageSwitch } from "../../../../src/app/shell/LanguageSwitch.tsx";
import { LiveAnnouncer } from "../../../../src/app/shell/LiveAnnouncer.tsx";
import { TurnToasts } from "../../../../src/app/shell/TurnToasts.tsx";
import { ANNOUNCE_INTERVAL_MS } from "../../../../src/app/shell/announce.ts";
import { MAX_TOAST_TURNS, TOAST_MS } from "../../../../src/app/shell/turnToasts.ts";
import { DraftStore } from "../../../../src/app/state/draftStore.ts";
import { GameProvider } from "../../../../src/app/state/hooks.ts";
import { fixedLayoutSource } from "../../../../src/app/state/layoutMode.ts";
import { UiStore } from "../../../../src/app/state/uiStore.ts";
import { fixture } from "../support/fixtures.ts";
import { StaticSource } from "../shell/support.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function mount(source: StaticSource, element: ReactElement): void {
  const layout = fixedLayoutSource("desktop");
  const ui = new UiStore({ layout, initial: {} });
  act(() =>
    root.render(
      <I18nProvider defaultLocale="en" strict>
        <GameProvider source={source} session={null} registry={WINDOWS} drafts={new DraftStore()} ui={ui} layout={layout} devTools={false}>
          {element}
        </GameProvider>
      </I18nProvider>,
    ),
  );
}

const base = fixture("m1_work_phase_r2_3p");
const viewer = base.viewerId as PlayerId;
const [other, third] = base.playerView.game.playerOrder.filter((id) => id !== viewer) as [PlayerId, PlayerId];
const nameOf = (id: PlayerId) => base.playerView.game.players[id]!.displayName;
const REVISION = base.playerView.game.revision;

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
const coins = (playerId: PlayerId, amount: number): PublicGameEvent => ({ type: "RESOURCES_CHANGED", playerId, clay: 0, wood: 0, coins: amount, reason: "canal_wharf" });
const turnEnded = (playerId: PlayerId): PublicGameEvent => ({ type: "WORK_TURN_ENDED", playerId, automatic: false });
const turnStarted = (playerId: PlayerId): PublicGameEvent => ({ type: "WORK_TURN_STARTED", playerId });
const contribution = (playerId: PlayerId): PublicGameEvent => ({ type: "CONTRIBUTION_SUBMITTED", playerId, windowId: "w" }) as PublicGameEvent;
const completed = (playerId: PlayerId, orderId: string, vp: number): PublicGameEvent =>
  ({ type: "ORDER_COMPLETED", playerId, record: { orderId, vp, coins: 0, crowns: 0, ceramicIds: [], via: "order_phase" } }) as unknown as PublicGameEvent;

/** A table whose log grows: `play` appends one command's events by `actorId`; `batch` appends several commands in one update (a computer batch). */
function table(): {
  source: StaticSource;
  play(actorId: PlayerId, events: readonly PublicGameEvent[]): void;
  batch(commands: ReadonlyArray<readonly [PlayerId, readonly PublicGameEvent[]]>): void;
} {
  const snapshot: GameSnapshot = fixtureSnapshot(structuredClone(base));
  const source = new StaticSource(snapshot);
  let log: readonly LogEntry[] = snapshot.log;
  let sequence = (log[log.length - 1]?.sequence ?? 0) + 1;
  let revision = REVISION;
  return {
    source,
    play(actorId, events) {
      this.batch([[actorId, events]]);
    },
    batch(commands) {
      const added: LogEntry[] = [];
      for (const [actorId, events] of commands) {
        revision += 1;
        for (const event of events) added.push({ sequence: sequence++, revision, actorId, event });
      }
      log = [...log, ...added];
      const events = added.map((entry) => entry.event);
      act(() => source.set({ ...snapshot, log, lastBatch: { revision, firstSequence: added[0]!.sequence, events, origin: commands.length > 1 ? "computers" : "remote" } }));
    },
  };
}

const toasts = () => [...container.querySelectorAll<HTMLElement>(".turn-toast")];
const textOf = (toast: HTMLElement | undefined) => [...(toast?.querySelectorAll(".turn-toast-line") ?? [])].map((line) => line.textContent);
/** A toast's turns, each its lines' text. */
const groupsOf = (toast: HTMLElement | undefined) =>
  [...(toast?.querySelectorAll<HTMLElement>(".turn-toast-lines") ?? [])].map((group) => [...group.querySelectorAll(".turn-toast-line")].map((line) => line.textContent));
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

function pointer(target: Element, type: "pointerover" | "pointerout", related: Element): void {
  const Pointer = (globalThis as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  act(() => {
    target.dispatchEvent(new Pointer(type, { bubbles: true, relatedTarget: related }));
  });
}

describe("turn toasts", () => {
  it("shows another player's turn in the log's words, and closes it after 3s", () => {
    const game = table();
    mount(game.source, <TurnToasts />);
    expect(container.innerHTML).toBe("");
    game.play(other, [placed(other), coins(other, 3), turnEnded(other)]);
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]!.dataset["playerId"]).toBe(other);
    expect(textOf(toasts()[0])).toEqual([`${nameOf(other)} placed their Shifu at Canal Wharf`, `${nameOf(other)}: +3 Coins (Canal Wharf)`]);
    const list = container.querySelector(".turn-toasts")!;
    expect(list.tagName).toBe("OL");
    expect(list.getAttribute("aria-label")).toBe("Other players’ latest moves");
    expect(toasts()[0]!.querySelector("button")!.getAttribute("aria-label")).toBe(`Dismiss ${nameOf(other)}’s moves`);
    advance(TOAST_MS - 1);
    expect(toasts()).toHaveLength(1);
    advance(1);
    expect(toasts()).toHaveLength(0);
    expect(container.innerHTML).toBe("");
  });

  it("shows nothing for the viewer's own move or the log present at mount", () => {
    const game = table();
    game.play(other, [placed(other)]);
    mount(game.source, <TurnToasts />);
    expect(toasts()).toHaveLength(0);
    game.play(viewer, [placed(viewer), coins(viewer, 3), turnEnded(viewer)]);
    expect(toasts()).toHaveLength(0);
  });

  it("stacks one toast per player in turn order, a player's next turn replacing theirs", () => {
    const game = table();
    mount(game.source, <TurnToasts />);
    game.play(other, [placed(other), turnEnded(other)]);
    advance(1_000);
    game.play(third, [placed(third, "guild_hall"), turnEnded(third)]);
    expect(toasts().map((toast) => toast.dataset["playerId"])).toEqual([other, third]);
    // Each closes 3s after it appeared.
    advance(TOAST_MS - 1_000);
    expect(toasts().map((toast) => toast.dataset["playerId"])).toEqual([third]);
    game.play(other, [placed(other, "guild_hall")]);
    expect(toasts().map((toast) => toast.dataset["playerId"])).toEqual([third, other]);
    expect(textOf(toasts()[1])).toEqual([`${nameOf(other)} placed their Shifu at Guild Hall`]);
    // The same turn growing (a second command) updates its toast and gives it its time again.
    advance(2_000);
    game.play(other, [coins(other, -2), turnEnded(other)]);
    expect(toasts().map((toast) => toast.dataset["playerId"])).toEqual([other]);
    expect(textOf(toasts()[0])).toHaveLength(2);
    advance(TOAST_MS - 1);
    expect(toasts()).toHaveLength(1);
    advance(1);
    expect(toasts()).toHaveLength(0);
  });

  it("keeps every turn of a player that one update brings, each its own group, nothing dropped", () => {
    const game = table();
    mount(game.source, <TurnToasts />);
    // One computer batch: both last placements, then both Contributions.
    game.batch([
      [other, [placed(other), turnEnded(other)]],
      [third, [placed(third, "guild_hall"), turnEnded(third)]],
      [other, [contribution(other)]],
      [third, [contribution(third)]],
    ]);
    expect(toasts().map((toast) => toast.dataset["playerId"])).toEqual([other, third]);
    expect(groupsOf(toasts()[0])).toEqual([[`${nameOf(other)} placed their Shifu at Canal Wharf`], [`${nameOf(other)} chose a Contribution in secret`]]);
    expect(groupsOf(toasts()[1])).toEqual([[`${nameOf(third)} placed their Shifu at Guild Hall`], [`${nameOf(third)} chose a Contribution in secret`]]);
    expect(container.querySelector(".turn-toast-earlier")).toBeNull();
    // An Order turn and the next Work turn of one player in one batch: both stay.
    game.batch([
      [other, [{ type: "ORDER_TURN_STARTED", playerId: other }, completed(other, "S14", 3), { type: "ORDER_TURN_ENDED", playerId: other, automatic: false }]],
      [other, [{ type: "ROUND_STARTED", round: 3, firstPlayerId: other } as PublicGameEvent, turnStarted(other), placed(other, "guild_hall"), turnEnded(other)]],
    ]);
    expect(toasts().map((toast) => toast.dataset["playerId"])).toEqual([third, other]);
    const groups = groupsOf(toasts()[1]);
    expect(groups).toHaveLength(2);
    expect(groups[0]![0]).toContain("S14");
    expect(groups[1]).toEqual([`${nameOf(other)} placed their Shifu at Guild Hall`]);
    advance(TOAST_MS);
    expect(toasts()).toHaveLength(0);
  });

  it("shows a player's newest turns and counts the earlier ones", () => {
    const game = table();
    mount(game.source, <TurnToasts />);
    // A reconnect after a long absence: more of one player's turns than a toast shows.
    const commands: Array<readonly [PlayerId, readonly PublicGameEvent[]]> = [];
    for (let index = 0; index < MAX_TOAST_TURNS + 2; index += 1) {
      commands.push([other, [turnStarted(other), placed(other, index === MAX_TOAST_TURNS + 1 ? "guild_hall" : "canal_wharf"), turnEnded(other)]]);
      commands.push([viewer, [turnStarted(viewer), placed(viewer), turnEnded(viewer)]]);
    }
    game.batch(commands);
    expect(toasts()).toHaveLength(1);
    expect(groupsOf(toasts()[0])).toHaveLength(MAX_TOAST_TURNS);
    expect(groupsOf(toasts()[0]).at(-1)).toEqual([`${nameOf(other)} placed their Shifu at Guild Hall`]);
    expect(container.querySelector(".turn-toast-earlier")!.textContent).toBe("2 earlier turns are in the game log");
  });

  it("brings the first toast an update changed to the top of a stack taller than its room, never while paused", () => {
    // happy-dom lays nothing out: each toast stands 100px below the one before it.
    const offset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");
    Object.defineProperty(HTMLElement.prototype, "offsetTop", {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains("turn-toast") && this.parentElement !== null ? 8 + [...this.parentElement.children].indexOf(this) * 100 : 0;
      },
    });
    try {
      const game = table();
      mount(game.source, <TurnToasts />);
      game.batch([
        [other, [placed(other), turnEnded(other)]],
        [third, [placed(third), turnEnded(third)]],
      ]);
      const list = container.querySelector<HTMLElement>(".turn-toasts")!;
      expect(list.scrollTop).toBe(0);
      // The next update changes only the first player's toast, which moves last: it comes to the top.
      game.play(other, [placed(other, "guild_hall"), turnEnded(other)]);
      expect(toasts().map((toast) => toast.dataset["playerId"])).toEqual([third, other]);
      expect(list.scrollTop).toBe(100);
      // While the player reads (hover), an update does not scroll; leaving brings it into view.
      list.scrollTop = 77;
      pointer(toasts()[0]!, "pointerover", document.body);
      game.play(third, [placed(third, "guild_hall"), turnEnded(third)]);
      expect(list.scrollTop).toBe(77);
      // Paused, the changed toast stayed in place (the first); resuming scrolls to it once.
      expect(toasts().map((toast) => toast.dataset["playerId"])).toEqual([third, other]);
      pointer(toasts()[0]!, "pointerout", document.body);
      expect(list.scrollTop).toBe(0);
      list.scrollTop = 50;
      pointer(toasts()[0]!, "pointerover", document.body);
      pointer(toasts()[0]!, "pointerout", document.body);
      // No new update since: a pause and resume alone never scroll.
      expect(list.scrollTop).toBe(50);
    } finally {
      if (offset === undefined) delete (HTMLElement.prototype as { offsetTop?: number }).offsetTop;
      else Object.defineProperty(HTMLElement.prototype, "offsetTop", offset);
    }
  });

  it("hides the stack while its room is shorter than a toast, and shows it again when the room returns", () => {
    const observers: Array<() => void> = [];
    class FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        observers.push(() => callback([], this as unknown as ResizeObserver));
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    try {
      const game = table();
      mount(game.source, <TurnToasts />);
      game.play(other, [placed(other), turnEnded(other)]);
      const list = container.querySelector<HTMLElement>(".turn-toasts")!;
      // happy-dom lays nothing out: nothing measured, nothing hidden.
      expect(list.hasAttribute("data-cramped")).toBe(false);
      let room = 8;
      Object.defineProperty(list, "clientHeight", { configurable: true, get: () => room });
      Object.defineProperty(toasts()[0]!, "offsetHeight", { configurable: true, get: () => 60 });
      act(() => observers.at(-1)!());
      expect(list.hasAttribute("data-cramped")).toBe(true);
      // Still a toast, still closing on time; it comes back when the room does.
      expect(toasts()).toHaveLength(1);
      room = 200;
      act(() => observers.at(-1)!());
      expect(list.hasAttribute("data-cramped")).toBe(false);
      advance(TOAST_MS);
      expect(toasts()).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("pauses while hovered and resumes with the time left", () => {
    const game = table();
    mount(game.source, <TurnToasts />);
    game.play(other, [placed(other), turnEnded(other)]);
    advance(1_000);
    const toast = toasts()[0]!;
    pointer(toast, "pointerover", document.body);
    advance(TOAST_MS * 3);
    expect(toasts()).toHaveLength(1);
    pointer(toast, "pointerout", document.body);
    advance(TOAST_MS - 1_000 - 1);
    expect(toasts()).toHaveLength(1);
    advance(1);
    expect(toasts()).toHaveLength(0);
  });

  it("pauses while focused; Escape dismisses and returns focus to where it was", () => {
    const outside = document.createElement("button");
    outside.textContent = "Outside";
    document.body.appendChild(outside);
    try {
      const game = table();
      mount(game.source, <TurnToasts />);
      game.play(other, [placed(other), turnEnded(other)]);
      act(() => outside.focus());
      const close = toasts()[0]!.querySelector("button")!;
      act(() => close.focus());
      expect(document.activeElement).toBe(close);
      advance(TOAST_MS * 2);
      expect(toasts()).toHaveLength(1);
      act(() => {
        close.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(toasts()).toHaveLength(0);
      expect(document.activeElement).toBe(outside);
      // Nothing is left paused: the next toast closes on time.
      game.play(third, [placed(third), turnEnded(third)]);
      advance(TOAST_MS);
      expect(toasts()).toHaveLength(0);
    } finally {
      outside.remove();
    }
  });

  it("closes one toast with its button; from the keyboard, focus moves to the next toast", () => {
    const game = table();
    mount(game.source, <TurnToasts />);
    game.play(other, [placed(other), turnEnded(other)]);
    game.play(third, [placed(third), turnEnded(third)]);
    const [first, second] = toasts().map((toast) => toast.querySelector<HTMLButtonElement>("button")!);
    act(() => first!.focus());
    // A keyboard press is a click without pointer detail.
    act(() => first!.click());
    expect(toasts().map((toast) => toast.dataset["playerId"])).toEqual([third]);
    expect(document.activeElement).toBe(second);
    // A pointer click on the last one closes it; nothing stays paused afterwards.
    act(() => {
      second!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    });
    expect(toasts()).toHaveLength(0);
    game.play(other, [placed(other, "guild_hall"), turnEnded(other)]);
    advance(TOAST_MS);
    expect(toasts()).toHaveLength(0);
  });

  it("does not stay paused when a pointer click closes the focused toast and focus has nowhere to return", () => {
    const game = table();
    mount(game.source, <TurnToasts />);
    game.play(other, [placed(other), turnEnded(other)]);
    game.play(third, [placed(third), turnEnded(third)]);
    (document.activeElement as HTMLElement | null)?.blur();
    const first = toasts()[0]!.querySelector<HTMLButtonElement>("button")!;
    act(() => first.focus());
    act(() => {
      first.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    });
    expect(toasts().map((toast) => toast.dataset["playerId"])).toEqual([third]);
    advance(TOAST_MS);
    expect(toasts()).toHaveLength(0);
  });

  it("is not a live region: the one polite region says the move, once", () => {
    const game = table();
    mount(
      game.source,
      <>
        <LiveAnnouncer />
        <TurnToasts />
      </>,
    );
    advance(ANNOUNCE_INTERVAL_MS * 2);
    game.play(other, [placed(other), turnEnded(other)]);
    advance(ANNOUNCE_INTERVAL_MS);
    const list = container.querySelector(".turn-toasts")!;
    expect(list.closest("[aria-live], [role='status'], [role='alert'], [role='log']")).toBeNull();
    expect(list.querySelector("[aria-live], [role='status'], [role='alert'], [role='log']")).toBeNull();
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
    const line = `${nameOf(other)} placed their Shifu at Canal Wharf`;
    expect(container.querySelector("[data-live='polite']")!.textContent!.split(line)).toHaveLength(2);
  });

  it("sits between the world and the decision pane in the shell", () => {
    const game = table();
    mount(game.source, <GameShell skipLink={null} top={null} banner={null} world={<p>World</p>} pane={<p>Pane</p>} nav={null} live={null} />);
    game.play(other, [placed(other), turnEnded(other)]);
    const shell = container.querySelector(".shell")!;
    const order = [...shell.children].map((child) => child.className);
    expect(order.indexOf("shell-toasts")).toBe(order.indexOf("shell-world") + 1);
    expect(order.indexOf("shell-pane")).toBe(order.indexOf("shell-toasts") + 1);
    expect(shell.querySelector(".shell-toasts .turn-toast")).not.toBeNull();
  });

  it("re-renders in the new language", () => {
    const game = table();
    mount(
      game.source,
      <>
        <LanguageSwitch />
        <TurnToasts />
      </>,
    );
    game.play(other, [placed(other, "guild_hall"), turnEnded(other)]);
    act(() => container.querySelector<HTMLButtonElement>(".language-switch")!.click());
    expect(textOf(toasts()[0])).toEqual([`${nameOf(other)}派师傅到陶工行`]);
    expect(container.querySelector(".turn-toasts")!.getAttribute("aria-label")).toBe("其他玩家的最新行动");
  });
});
