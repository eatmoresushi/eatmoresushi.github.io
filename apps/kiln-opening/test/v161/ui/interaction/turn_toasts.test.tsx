// @vitest-environment happy-dom
/**
 * Turn toasts in the DOM (owner review 2026-10-17, item 7, and item 3: top right, one at a
 * time; B1): what static markup cannot show.
 * - another player's turn shows one toast in the game log's words and closes after 3s; the
 *   viewer's own move and the log present at mount show none;
 * - one toast at a time in turn order (the owner's 3-player example: Computer 1's turn for 3s,
 *   then Computer 2's); turns arriving while one shows wait; a computer batch with a player's
 *   Order turn and next Work turn plays both; a turn that grows updates its toast and restarts
 *   its time; a batch of many turns plays every one, none dropped;
 * - the toast is in the shell's holder, before the world, in a band the world gives up: on
 *   desktop and tablet right after the jump bar, a row of its own above the world (so Tab goes
 *   jump bar, seat chips, toast, table); on phones under the top bar; the world scrolls by the
 *   band, so the table keeps its place on screen and nothing lies under the toast, and the band
 *   closes with the queue;
 * - its resize observer watches only the toast and its holder, never the world whose box the band
 *   sets, so a band it changes in its callback (the phone sheet opening or closing, a font swapped
 *   in) resizes nothing it watches: no "ResizeObserver loop" page error;
 * - a room too short for the toast (the phone's open decision sheet) hides it, and its turn waits
 *   (the clock stops) until the room comes back; so does a hidden page, and nothing played while
 *   the page is hidden or the connection offline (nor what the store's reconnect on the return
 *   brings, even when its entries come after its new state) is queued;
 * - while the viewer is there, every turn plays: also when its entries come after a view that
 *   already shows it (a poll that read the records before a newer head), and when later entries
 *   come first (a gap in the log is waited for, so the turns in it play in turn order);
 * - the world keeps the table still at its top too: what a shrinking toast gives back that the
 *   scroll cannot stays as room at the table's top (`toastRoom.ts` has the cases);
 * - a toast names a ceramic as it was when the turn ended;
 * - hovering or focusing pauses it, leaving resumes it with the time left;
 * - the close button and Escape dismiss it and the next turn shows: from the keyboard focus stays
 *   on the close button (now the next toast's), from the pointer it goes back to where it was;
 * - it is not a live region: the one polite region (LiveAnnouncer) says the moves, once;
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
import type { GameSnapshot, LogEntry, SessionStatus } from "../../../../src/app/session/gameSource.ts";
import { fixtureSnapshot } from "../../../../src/app/session/fixtureSource.ts";
import { GameShell } from "../../../../src/app/shell/GameShell.tsx";
import { LanguageSwitch } from "../../../../src/app/shell/LanguageSwitch.tsx";
import { LiveAnnouncer } from "../../../../src/app/shell/LiveAnnouncer.tsx";
import { TurnToasts } from "../../../../src/app/shell/TurnToasts.tsx";
import { ANNOUNCE_INTERVAL_MS } from "../../../../src/app/shell/announce.ts";
import { GAP_WAIT_MS, TOAST_MS } from "../../../../src/app/shell/turnToasts.ts";
import { DraftStore } from "../../../../src/app/state/draftStore.ts";
import { GameProvider } from "../../../../src/app/state/hooks.ts";
import { fixedLayoutSource } from "../../../../src/app/state/layoutMode.ts";
import type { LayoutMode } from "../../../../src/app/state/layoutMode.ts";
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

function mount(source: StaticSource, element: ReactElement, mode: LayoutMode = "desktop"): UiStore {
  const layout = fixedLayoutSource(mode);
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
  return ui;
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

type Commands = ReadonlyArray<readonly [PlayerId, readonly PublicGameEvent[]]>;

/**
 * A table whose log grows, every update with a new view, as the store merges them: `play` appends
 * one command's events by `actorId`; `batch` appends several commands in one update (a computer
 * batch), with `connection` set in that same update when given (a reconnect that brings what was
 * missed); `connect` changes the connection alone; `reconnect` moves the view `ahead` revisions
 * on with no log entries (a reconnect, or a poll that read the records before a newer head,
 * brings the new state first; the entries of those revisions come with a later batch; `0` is the
 * store's reconnect when nothing was missed). `reserve` numbers commands without delivering them,
 * and `deliver` brings reserved entries in one update, in any order (a gap in the log).
 */
function table(): {
  source: StaticSource;
  play(actorId: PlayerId, events: readonly PublicGameEvent[]): void;
  batch(commands: Commands, connection?: SessionStatus["connection"]): void;
  connect(connection: SessionStatus["connection"]): void;
  reconnect(ahead: number): void;
  reserve(commands: Commands): LogEntry[];
  deliver(entries: readonly LogEntry[]): void;
} {
  const snapshot: GameSnapshot = fixtureSnapshot(structuredClone(base));
  const source = new StaticSource(snapshot);
  let log: readonly LogEntry[] = snapshot.log;
  let sequence = (log[log.length - 1]?.sequence ?? 0) + 1;
  let revision = REVISION;
  let status: SessionStatus = snapshot.status;
  const viewAt = (head: number) => {
    const view = source.getSnapshot().view!;
    return { ...view, game: { ...view.game, revision: Math.max(view.game.revision, head) } };
  };
  const reserve = (commands: Commands): LogEntry[] => {
    const added: LogEntry[] = [];
    for (const [actorId, events] of commands) {
      revision += 1;
      for (const event of events) added.push({ sequence: sequence++, revision, actorId, event });
    }
    return added;
  };
  const deliver = (added: readonly LogEntry[], connection?: SessionStatus["connection"]) => {
    log = [...log, ...added].sort((a, b) => a.sequence - b.sequence);
    if (connection !== undefined) status = { ...status, connection };
    const events = added.map((entry) => entry.event);
    const head = Math.max(...added.map((entry) => entry.revision));
    act(() => source.set({ ...source.getSnapshot(), view: viewAt(head), status, log, lastBatch: { revision: head, firstSequence: added[0]!.sequence, events, origin: added.length > 1 ? "computers" : "remote" } }));
  };
  return {
    source,
    play(actorId, events) {
      this.batch([[actorId, events]]);
    },
    batch(commands, connection) {
      deliver(reserve(commands), connection);
    },
    connect(connection) {
      status = { ...status, connection };
      act(() => source.set({ ...source.getSnapshot(), status }));
    },
    reconnect(ahead) {
      act(() => source.set({ ...source.getSnapshot(), view: viewAt(revision + ahead) }));
    },
    reserve,
    deliver(entries) {
      deliver(entries);
    },
  };
}

const toasts = () => [...container.querySelectorAll<HTMLElement>(".turn-toast")];
/** The player of the toast showing, or null. */
const showing = () => toasts()[0]?.dataset["playerId"] ?? null;
const textOf = (toast: HTMLElement | undefined) => [...(toast?.querySelectorAll(".turn-toast-line") ?? [])].map((line) => line.textContent);
const closeButton = () => container.querySelector<HTMLButtonElement>(".turn-toast-close")!;
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

/** What a resize observer watches: an element, in one of its boxes. */
interface Watched {
  target: Element;
  box: ResizeObserverBoxOptions;
}

/** An element's depth in the document (the resize observer's loop rule compares depths). */
function depthOf(element: Element): number {
  let depth = 0;
  for (let node = element.parentElement; node !== null; node = node.parentElement) depth += 1;
  return depth;
}

/**
 * A ResizeObserver whose callbacks the test runs: happy-dom lays nothing out.
 * - `resize()` runs every connected observer's callback;
 * - `watched()` lists what the connected observers watch;
 * - `frame(sizeOf)` runs them as a browser's rendering update does, every watched box delivered,
 *   with the sizes `sizeOf` gives (the test's model of the layout), and returns the watched
 *   elements a callback resized at a depth no deeper than the shallowest it was given: the browser
 *   cannot deliver those before paint, and reports "ResizeObserver loop completed with undelivered
 *   notifications" (a page error).
 */
function fakeResizeObserver(): { resize(): void; watched(): Watched[]; frame(sizeOf: (target: Element) => number): Element[] } {
  const connected = new Set<FakeResizeObserver>();
  class FakeResizeObserver {
    readonly targets: Watched[] = [];
    constructor(readonly callback: ResizeObserverCallback) {
      connected.add(this);
    }
    observe(target: Element, options?: ResizeObserverOptions): void {
      this.targets.push({ target, box: options?.box ?? "content-box" });
    }
    unobserve(target: Element): void {
      const index = this.targets.findIndex((watched) => watched.target === target);
      if (index >= 0) this.targets.splice(index, 1);
    }
    disconnect(): void {
      this.targets.length = 0;
      connected.delete(this);
    }
  }
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  return {
    resize() {
      act(() => {
        for (const observer of [...connected]) observer.callback([], observer as unknown as ResizeObserver);
      });
    },
    watched: () => [...connected].flatMap((observer) => observer.targets),
    frame(sizeOf) {
      const undelivered: Element[] = [];
      act(() => {
        for (const observer of [...connected]) {
          const targets = [...observer.targets];
          if (targets.length === 0) continue;
          const before = targets.map(({ target }) => sizeOf(target));
          const shallowest = Math.min(...targets.map(({ target }) => depthOf(target)));
          observer.callback([], observer as unknown as ResizeObserver);
          targets.forEach(({ target }, index) => {
            if (sizeOf(target) !== before[index] && depthOf(target) <= shallowest) undelivered.push(target);
          });
        }
      });
      return undelivered;
    },
  };
}

describe("turn toasts", () => {
  it("shows another player's turn in the log's words, and closes it after 3s", () => {
    const game = table();
    mount(game.source, <TurnToasts />);
    expect(container.innerHTML).toBe("");
    game.play(other, [placed(other), coins(other, 3), turnEnded(other)]);
    expect(toasts()).toHaveLength(1);
    expect(showing()).toBe(other);
    expect(textOf(toasts()[0])).toEqual([`${nameOf(other)} placed their Shifu at Canal Wharf`, `${nameOf(other)}: +3 Coins (Canal Wharf)`]);
    const group = container.querySelector(".turn-toasts")!;
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("Other players’ latest moves");
    expect(closeButton().getAttribute("aria-label")).toBe(`Dismiss ${nameOf(other)}’s moves`);
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

  it("shows one turn at a time in turn order: Computer 1's for 3s, then Computer 2's", () => {
    const game = table();
    mount(game.source, <TurnToasts />);
    // The owner's example: the viewer's turn ends and both computers play theirs in one batch.
    game.batch([
      [viewer, [placed(viewer), turnEnded(viewer), turnStarted(other)]],
      [other, [placed(other), turnEnded(other), turnStarted(third)]],
      [third, [placed(third, "guild_hall"), turnEnded(third), turnStarted(viewer)]],
    ]);
    expect(toasts()).toHaveLength(1);
    expect(showing()).toBe(other);
    expect(textOf(toasts()[0])).toEqual([`${nameOf(other)} placed their Shifu at Canal Wharf`]);
    const toast = toasts()[0]!;
    const lines = toast.querySelector(".turn-toast-body");
    advance(TOAST_MS - 1);
    expect(showing()).toBe(other);
    advance(1);
    expect(toasts()).toHaveLength(1);
    expect(showing()).toBe(third);
    expect(textOf(toasts()[0])).toEqual([`${nameOf(third)} placed their Shifu at Guild Hall`]);
    expect(closeButton().getAttribute("aria-label")).toBe(`Dismiss ${nameOf(third)}’s moves`);
    // The same toast (so focus can stay on its close button), the next turn's lines in it.
    expect(toasts()[0]).toBe(toast);
    expect(toast.querySelector(".turn-toast-body")).not.toBe(lines);
    advance(TOAST_MS);
    expect(toasts()).toHaveLength(0);
  });

  it("queues turns that arrive while one shows, and plays each for its own 3s", () => {
    const game = table();
    mount(game.source, <TurnToasts />);
    game.play(other, [placed(other), turnEnded(other)]);
    advance(1_000);
    game.play(third, [placed(third, "guild_hall"), turnEnded(third)]);
    expect(showing()).toBe(other);
    advance(TOAST_MS - 1_000);
    expect(showing()).toBe(third);
    game.play(other, [placed(other, "guild_hall"), turnEnded(other)]);
    expect(showing()).toBe(third);
    advance(TOAST_MS - 1);
    expect(showing()).toBe(third);
    advance(1);
    expect(showing()).toBe(other);
    expect(textOf(toasts()[0])).toEqual([`${nameOf(other)} placed their Shifu at Guild Hall`]);
    advance(TOAST_MS);
    expect(toasts()).toHaveLength(0);
  });

  it("updates the toast of a turn that grows and gives it its time again", () => {
    const game = table();
    mount(game.source, <TurnToasts />);
    game.play(other, [placed(other, "guild_hall")]);
    advance(2_000);
    // The same turn's second command.
    game.play(other, [coins(other, -2), turnEnded(other)]);
    expect(toasts()).toHaveLength(1);
    expect(textOf(toasts()[0])).toHaveLength(2);
    advance(TOAST_MS - 1);
    expect(toasts()).toHaveLength(1);
    advance(1);
    expect(toasts()).toHaveLength(0);
  });

  it("plays a player's Order turn and their next Work turn of one computer batch, one after the other", () => {
    const game = table();
    mount(game.source, <TurnToasts />);
    game.batch([
      [other, [{ type: "ORDER_TURN_STARTED", playerId: other }, completed(other, "S14", 3), { type: "ORDER_TURN_ENDED", playerId: other, automatic: false }]],
      [other, [{ type: "ROUND_STARTED", round: 3, firstPlayerId: other } as PublicGameEvent, turnStarted(other), placed(other, "guild_hall"), turnEnded(other)]],
      [third, [contribution(third)]],
    ]);
    expect(showing()).toBe(other);
    expect(textOf(toasts()[0])[0]).toContain("S14");
    advance(TOAST_MS);
    expect(showing()).toBe(other);
    expect(textOf(toasts()[0])).toEqual([`${nameOf(other)} placed their Shifu at Guild Hall`]);
    advance(TOAST_MS);
    expect(showing()).toBe(third);
    expect(textOf(toasts()[0])).toEqual([`${nameOf(third)} chose a Contribution in secret`]);
    expect(container.querySelector(".turn-toast-earlier")).toBeNull();
  });

  it("plays every turn of a long batch, in order, none dropped", () => {
    const game = table();
    mount(game.source, <TurnToasts />);
    // A 4-player round's end: many turns of the others, with no decision of the viewer's between.
    const count = 14;
    const commands: Array<readonly [PlayerId, readonly PublicGameEvent[]]> = [];
    for (let index = 0; index < count; index += 1) {
      const who = index % 2 === 0 ? other : third;
      commands.push([who, [turnStarted(who), placed(who, index === count - 1 ? "guild_hall" : "canal_wharf"), turnEnded(who)]]);
    }
    game.batch(commands);
    const seen: Array<string | null> = [];
    // Each toast schedules the next once it renders: one advance per toast.
    for (let index = 0; index < count; index += 1) {
      seen.push(showing());
      if (index === count - 1) expect(textOf(toasts()[0])).toEqual([`${nameOf(third)} placed their Shifu at Guild Hall`]);
      advance(TOAST_MS);
    }
    expect(seen).toEqual(commands.map(([who]) => who));
    expect(toasts()).toHaveLength(0);
  });

  it("on desktop and tablet sits under the jump bar (its own row, after the seat chips in the Tab order), in a band the world gives up; the table keeps its place", () => {
    const observer = fakeResizeObserver();
    try {
      const game = table();
      const world = (
        <section className="world-section">
          <button type="button">Table target</button>
        </section>
      );
      mount(game.source, <GameShell skipLink={null} top={<button type="button">Log</button>} banner={null} world={world} pane={null} nav={null} live={null} paneBar={null} />);
      const shell = container.querySelector<HTMLElement>(".shell")!;
      const worldElement = container.querySelector<HTMLElement>(".shell-world")!;
      const holder = container.querySelector<HTMLElement>(".shell-toasts")!;
      // The jump bar is a row of the shell, not part of the world's scroll area: nothing of the
      // world can lie under it, nor under the toast drawn below it.
      const jump = container.querySelector<HTMLElement>(".shell-jump > nav.jump-nav")!;
      expect(jump).not.toBeNull();
      expect(worldElement.contains(jump)).toBe(false);
      expect(jump.querySelectorAll(".seat-chips").length).toBe(1);
      let height = 96;
      Object.defineProperty(holder, "getBoundingClientRect", { configurable: true, value: () => ({ x: 0, y: 96, top: 96, bottom: 96 + height, left: 0, right: 1040, width: 1040, height, toJSON: () => ({}) }) });
      worldElement.scrollTop = 200;
      game.batch([
        [other, [placed(other), turnEnded(other)]],
        [third, [placed(third, "guild_hall"), turnEnded(third)]],
      ]);
      expect(holder.querySelector(".turn-toasts .turn-toast")).not.toBeNull();
      // Tab: the top bar, the jump buttons and the seat chips, then the toast's close button, then the table.
      const focusable = [...container.querySelectorAll<HTMLElement>("button, [href], input, select, [tabindex]:not([tabindex='-1'])")];
      const close = focusable.indexOf(closeButton());
      expect(focusable[0]!.textContent).toBe("Log");
      expect(focusable.slice(1, close).every((element) => jump.contains(element))).toBe(true);
      expect(focusable[close - 1]!.closest(".seat-chips")).not.toBeNull();
      expect(focusable[close + 1]!.textContent).toBe("Table target");
      // The world gives up the band and scrolls by as much: it stays where it was on screen.
      expect(shell.style.getPropertyValue("--turn-toast-band")).toBe("96px");
      expect(worldElement.scrollTop).toBe(296);
      // The next turn is taller: the band follows in the same commit, without waiting for a
      // resize callback, and so does the scroll.
      height = 120;
      advance(TOAST_MS);
      expect(showing()).toBe(third);
      expect(shell.style.getPropertyValue("--turn-toast-band")).toBe("120px");
      expect(worldElement.scrollTop).toBe(320);
      // A later change of size (a change of layout) comes through the resize observer.
      height = 110;
      observer.resize();
      expect(shell.style.getPropertyValue("--turn-toast-band")).toBe("110px");
      expect(worldElement.scrollTop).toBe(310);
      // The queue is done: no band, the table back where it was.
      advance(TOAST_MS);
      expect(toasts()).toHaveLength(0);
      expect(holder.childElementCount).toBe(0);
      expect(shell.style.getPropertyValue("--turn-toast-band")).toBe("");
      expect(worldElement.scrollTop).toBe(200);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("on phones lies across the top of the world in a band the world gives up, before the world in the Tab order", () => {
    const observer = fakeResizeObserver();
    try {
      const game = table();
      const world = (
        <section className="world-section">
          <button type="button">Table target</button>
        </section>
      );
      mount(game.source, <GameShell skipLink={null} top={<button type="button">Log</button>} banner={null} world={world} pane={null} nav={null} live={null} paneBar={null} />, "phone");
      const shell = container.querySelector<HTMLElement>(".shell")!;
      const worldElement = container.querySelector<HTMLElement>(".shell-world")!;
      const holder = container.querySelector<HTMLElement>(".shell-toasts")!;
      let height = 96;
      Object.defineProperty(holder, "getBoundingClientRect", { configurable: true, value: () => ({ x: 0, y: 56, top: 56, bottom: 56 + height, left: 0, right: 390, width: 390, height, toJSON: () => ({}) }) });
      worldElement.scrollTop = 40;
      game.play(other, [placed(other), coins(other, 3), turnEnded(other)]);
      // In the shell's holder, before the world. (Phones draw no jump bar: the phone CSS hides
      // its row, which happy-dom does not apply, so its buttons are left out here.)
      expect(holder.querySelector(".turn-toast")).not.toBeNull();
      expect(container.querySelector(".jump-nav .seat-chips")).toBeNull();
      const focusable = [...container.querySelectorAll<HTMLElement>("button")].filter((button) => button.closest(".shell-jump") === null).map((button) => button.textContent || button.getAttribute("aria-label"));
      expect(focusable.indexOf(`Dismiss ${nameOf(other)}’s moves`)).toBe(focusable.indexOf("Log") + 1);
      expect(focusable.indexOf("Table target")).toBeGreaterThan(focusable.indexOf(`Dismiss ${nameOf(other)}’s moves`));
      // The world gives up the band and scrolls by as much: nothing lies under the toast.
      expect(shell.style.getPropertyValue("--turn-toast-band")).toBe("96px");
      expect(worldElement.scrollTop).toBe(136);
      height = 64;
      observer.resize();
      expect(shell.style.getPropertyValue("--turn-toast-band")).toBe("64px");
      expect(worldElement.scrollTop).toBe(104);
      advance(TOAST_MS);
      expect(toasts()).toHaveLength(0);
      expect(shell.style.getPropertyValue("--turn-toast-band")).toBe("");
      expect(worldElement.scrollTop).toBe(40);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("at the top of the world, keeps the room a shrinking toast gives back, so nothing on the table moves; a phone section change drops it", () => {
    const observer = fakeResizeObserver();
    try {
      const game = table();
      const world = (
        <section className="world-section">
          <button type="button">Table target</button>
        </section>
      );
      const ui = mount(game.source, <GameShell skipLink={null} top={<button type="button">Log</button>} banner={null} world={world} pane={null} nav={null} live={null} paneBar={null} />, "phone");
      const shell = container.querySelector<HTMLElement>(".shell")!;
      const worldElement = container.querySelector<HTMLElement>(".shell-world")!;
      const holder = container.querySelector<HTMLElement>(".shell-toasts")!;
      const px = (property: string) => Number.parseFloat(shell.style.getPropertyValue(property) || "0");
      // The table's top below the world's cell: what must not move.
      const tableTop = () => px("--turn-toast-band") + px("--turn-toast-lead") - worldElement.scrollTop;
      let height = 96;
      Object.defineProperty(holder, "getBoundingClientRect", { configurable: true, value: () => ({ x: 0, y: 56, top: 56, bottom: 56 + height, left: 0, right: 390, width: 390, height, toJSON: () => ({}) }) });
      game.batch([
        [other, [placed(other), turnEnded(other)]],
        [third, [placed(third), turnEnded(third)]],
      ]);
      expect(worldElement.scrollTop).toBe(96);
      // The player scrolls back to the very top, to what the band scrolled out of view.
      act(() => {
        worldElement.scrollTop = 0;
        worldElement.dispatchEvent(new Event("scroll"));
      });
      advance(200);
      const top = tableTop();
      // The next turn's toast is shorter: the room it gives back stays at the table's top.
      advance(TOAST_MS - 200);
      expect(showing()).toBe(third);
      height = 64;
      observer.resize();
      expect([px("--turn-toast-band"), px("--turn-toast-lead"), worldElement.scrollTop, tableTop()]).toEqual([64, 32, 0, top]);
      // The queue ends: the whole band stays as room, and nothing moves.
      advance(TOAST_MS);
      expect(toasts()).toHaveLength(0);
      expect([px("--turn-toast-band"), px("--turn-toast-lead"), tableTop()]).toEqual([0, 96, top]);
      // The player shows another section: the table shown changes, and the room goes.
      act(() => ui.actions.setSection("orders"));
      expect(shell.style.getPropertyValue("--turn-toast-lead")).toBe("");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("hides the toast while its room is shorter than it, and its turn waits, keeping its time, until the room returns", () => {
    const observer = fakeResizeObserver();
    try {
      const game = table();
      mount(game.source, <TurnToasts />, "phone");
      game.play(other, [placed(other), turnEnded(other)]);
      game.play(third, [placed(third), turnEnded(third)]);
      const group = container.querySelector<HTMLElement>(".turn-toasts")!;
      // happy-dom lays nothing out: nothing measured, nothing hidden.
      expect(group.hasAttribute("data-cramped")).toBe(false);
      advance(1_000);
      // The phone's decision sheet opens: the room is shorter than the toast.
      let room = 8;
      Object.defineProperty(group, "clientHeight", { configurable: true, get: () => room });
      Object.defineProperty(toasts()[0]!, "offsetHeight", { configurable: true, get: () => 60 });
      observer.resize();
      expect(group.hasAttribute("data-cramped")).toBe(true);
      // Hidden, its clock stopped: unseen, it neither closes nor gives way to the next turn.
      advance(TOAST_MS * 5);
      expect(showing()).toBe(other);
      // The room comes back: it shows for the time it had left, then the next turn for its own.
      room = 200;
      observer.resize();
      expect(group.hasAttribute("data-cramped")).toBe(false);
      advance(TOAST_MS - 1_000 - 1);
      expect(showing()).toBe(other);
      advance(1);
      expect(showing()).toBe(third);
      advance(TOAST_MS);
      expect(toasts()).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("watches only the boxes it measures, never the world whose box the band sets, so a band its resize callback changes resizes nothing it watches (no resize-observer loop)", () => {
    const observer = fakeResizeObserver();
    try {
      const game = table();
      const world = (
        <section className="world-section">
          <button type="button">Table target</button>
        </section>
      );
      mount(game.source, <GameShell skipLink={null} top={<button type="button">Log</button>} banner={null} world={world} pane={null} nav={null} live={null} paneBar={null} />, "phone");
      const shell = container.querySelector<HTMLElement>(".shell")!;
      const worldElement = container.querySelector<HTMLElement>(".shell-world")!;
      const holder = container.querySelector<HTMLElement>(".shell-toasts")!;
      // The layout (happy-dom has none): the holder as tall as its toast plus its top padding,
      // capped at the world's cell; the group as tall as the holder lets it be; the world's box
      // its cell less the band (its top margin) and the room at its top and bottom (its padding).
      let toastHeight = 80;
      const padding = 16;
      let cell = 600;
      const holderHeight = () => Math.min(cell, toastHeight + padding);
      const px = (property: string) => Number.parseFloat(shell.style.getPropertyValue(property) || "0");
      Object.defineProperty(holder, "getBoundingClientRect", { configurable: true, value: () => ({ x: 0, y: 56, top: 56, bottom: 56 + holderHeight(), left: 0, right: 390, width: 390, height: holderHeight(), toJSON: () => ({}) }) });
      game.play(other, [placed(other), coins(other, 3), turnEnded(other)]);
      const group = container.querySelector<HTMLElement>(".turn-toasts")!;
      const toast = toasts()[0]!;
      Object.defineProperty(group, "clientHeight", { configurable: true, get: () => holderHeight() - padding });
      Object.defineProperty(toast, "offsetHeight", { configurable: true, get: () => toastHeight });
      const sizeOf = (target: Element) => {
        if (target === worldElement) return Math.max(0, cell - px("--turn-toast-band")) - px("--turn-toast-lead") - px("--turn-toast-tail");
        if (target === holder) return holderHeight();
        if (target === group) return group.clientHeight;
        if (target === toast) return toast.offsetHeight;
        return 0;
      };
      expect(shell.style.getPropertyValue("--turn-toast-band")).toBe("96px");
      // Watched: the group, the toast and the holder, in the boxes the measure reads; nothing of
      // the world, and nothing that holds it.
      expect(observer.watched().map(({ target, box }) => [target.className, box])).toEqual([
        ["turn-toasts", "content-box"],
        ["turn-toast", "border-box"],
        ["shell-toasts", "border-box"],
      ]);
      for (const { target } of observer.watched()) {
        expect(holder.contains(target)).toBe(true);
        expect(target.contains(worldElement)).toBe(false);
      }
      // The phone's decision sheet opens: the world's cell is shorter than the toast. The toast is
      // hidden and the band closes, in the observer's callback; nothing it watches changed size.
      cell = 40;
      expect(observer.frame(sizeOf)).toEqual([]);
      expect(group.hasAttribute("data-cramped")).toBe(true);
      expect(shell.style.getPropertyValue("--turn-toast-band")).toBe("");
      // The sheet closes: the band opens again, in the callback, as quietly.
      cell = 600;
      expect(observer.frame(sizeOf)).toEqual([]);
      expect(group.hasAttribute("data-cramped")).toBe(false);
      expect(shell.style.getPropertyValue("--turn-toast-band")).toBe("96px");
      // A change the commit did not measure (a font swapped in after a language switch): the same.
      toastHeight = 74;
      expect(observer.frame(sizeOf)).toEqual([]);
      expect(shell.style.getPropertyValue("--turn-toast-band")).toBe("90px");
      advance(TOAST_MS);
      expect(toasts()).toHaveLength(0);
      expect(observer.watched()).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("queues nothing played while the page is hidden; the turns already waiting keep their place and time", () => {
    let visibility: DocumentVisibilityState = "visible";
    const descriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    const setVisibility = (next: DocumentVisibilityState) =>
      act(() => {
        visibility = next;
        document.dispatchEvent(new Event("visibilitychange"));
      });
    try {
      const game = table();
      mount(game.source, <TurnToasts />);
      game.play(other, [placed(other), turnEnded(other)]);
      game.play(third, [placed(third), turnEnded(third)]);
      advance(1_000);
      // Another tab: the queue's clock stops; what is played meanwhile is not queued.
      setVisibility("hidden");
      game.play(other, [placed(other, "guild_hall"), turnEnded(other)]);
      game.batch([
        [third, [placed(third, "guild_hall"), turnEnded(third)]],
        [other, [contribution(other)]],
      ]);
      advance(TOAST_MS * 10);
      expect(showing()).toBe(other);
      expect(textOf(toasts()[0])).toEqual([`${nameOf(other)} placed their Shifu at Canal Wharf`]);
      // Back: the waiting turns play on, in order, the one showing for the time it had left. The
      // store reconnects on the return: its new state shows two moves the viewer missed.
      setVisibility("visible");
      game.reconnect(2);
      advance(TOAST_MS - 1_000);
      expect(showing()).toBe(third);
      expect(textOf(toasts()[0])).toEqual([`${nameOf(third)} placed their Shifu at Canal Wharf`]);
      advance(TOAST_MS);
      expect(toasts()).toHaveLength(0);
      // Those two moves' entries come with the next batch: history; only the move after them shows.
      game.batch([
        [other, [placed(other, "guild_hall"), turnEnded(other)]],
        [third, [placed(third, "guild_hall"), turnEnded(third)]],
        [third, [contribution(third)]],
      ]);
      expect(showing()).toBe(third);
      expect(textOf(toasts()[0])).toEqual([`${nameOf(third)} chose a Contribution in secret`]);
      advance(TOAST_MS);
      expect(toasts()).toHaveLength(0);
      // Turns played after the return show again.
      game.play(other, [contribution(other)]);
      expect(showing()).toBe(other);
    } finally {
      if (descriptor === undefined) delete (document as { visibilityState?: unknown }).visibilityState;
      else Object.defineProperty(document, "visibilityState", descriptor);
    }
  });

  it("queues nothing played while offline, nor what the reconnect brings, as after a reload", () => {
    const game = table();
    mount(game.source, <TurnToasts />);
    game.connect("offline");
    game.play(other, [placed(other), turnEnded(other)]);
    expect(toasts()).toHaveLength(0);
    // The reconnect brings what was missed in the update that sets the connection live again.
    game.batch(
      [
        [third, [placed(third), turnEnded(third)]],
        [other, [placed(other, "guild_hall"), turnEnded(other)]],
      ],
      "live",
    );
    expect(toasts()).toHaveLength(0);
    // Back and live: the next turn shows.
    game.play(third, [placed(third, "guild_hall"), turnEnded(third)]);
    expect(showing()).toBe(third);
    expect(textOf(toasts()[0])).toEqual([`${nameOf(third)} placed their Shifu at Guild Hall`]);
    // Live again on its own: the store's reconnect follows, with a state two moves on; their
    // entries come later, and only the move after them shows.
    advance(TOAST_MS);
    game.connect("offline");
    game.connect("live");
    expect(toasts()).toHaveLength(0);
    game.reconnect(2);
    game.batch([
      [other, [placed(other), turnEnded(other)]],
      [third, [placed(third), turnEnded(third)]],
      [other, [contribution(other)]],
    ]);
    expect(showing()).toBe(other);
    expect(textOf(toasts()[0])).toEqual([`${nameOf(other)} chose a Contribution in secret`]);
    advance(TOAST_MS);
    expect(toasts()).toHaveLength(0);
    // Nothing missed: the reconnect's state is where the viewer left it; the next turn is not lost.
    game.connect("offline");
    game.connect("live");
    game.reconnect(0);
    game.play(third, [contribution(third)]);
    expect(showing()).toBe(third);
  });

  it("plays the turns whose entries come after a live view that already shows them", () => {
    const game = table();
    mount(game.source, <TurnToasts />);
    // Live and visible: a poll read the records, then a newer head (or a room check brought the
    // head alone). The view is two moves on; nothing to show yet.
    game.reconnect(2);
    expect(toasts()).toHaveLength(0);
    // Their entries come with the next read, and one move after them: all three play, in order.
    game.batch([
      [other, [placed(other), turnEnded(other)]],
      [third, [placed(third), turnEnded(third)]],
      [other, [placed(other, "guild_hall"), turnEnded(other)]],
    ]);
    const seen: Array<readonly (string | null)[]> = [];
    for (let index = 0; index < 3; index += 1) {
      seen.push(textOf(toasts()[0]));
      advance(TOAST_MS);
    }
    expect(seen).toEqual([
      [`${nameOf(other)} placed their Shifu at Canal Wharf`],
      [`${nameOf(third)} placed their Shifu at Canal Wharf`],
      [`${nameOf(other)} placed their Shifu at Guild Hall`],
    ]);
    expect(toasts()).toHaveLength(0);
  });

  it("waits for the turns a gap in the log holds, and plays them in turn order once they come", () => {
    const game = table();
    mount(game.source, <TurnToasts />);
    game.play(other, [turnStarted(other), placed(other)]);
    expect(showing()).toBe(other);
    // The rest of Computer 1's turn and Computer 2's turn are committed, but the viewer's own next
    // command comes back first (its view was already at its turn): a gap.
    const missing = game.reserve([
      [other, [coins(other, 2), turnEnded(other), turnStarted(third)]],
      [third, [placed(third, "guild_hall"), turnEnded(third)]],
    ]);
    const own = game.reserve([[viewer, [contribution(viewer)]]]);
    game.deliver(own);
    advance(TOAST_MS);
    expect(toasts()).toHaveLength(0);
    // The next read fills it: Computer 1's turn shows again, grown, then Computer 2's.
    game.deliver(missing);
    expect(showing()).toBe(other);
    expect(textOf(toasts()[0])).toEqual([`${nameOf(other)} placed their Shifu at Canal Wharf`, `${nameOf(other)}: +2 Coins (Canal Wharf)`]);
    advance(TOAST_MS);
    expect(showing()).toBe(third);
    expect(textOf(toasts()[0])).toEqual([`${nameOf(third)} placed their Shifu at Guild Hall`]);
    advance(TOAST_MS);
    expect(toasts()).toHaveLength(0);
    // A gap that is never filled holds the turns after it only so long.
    game.reserve([[other, [contribution(other)]]]);
    game.deliver(game.reserve([[third, [contribution(third)]]]));
    expect(toasts()).toHaveLength(0);
    advance(GAP_WAIT_MS);
    expect(showing()).toBe(third);
  });

  it("names a ceramic as it was when the turn ended, even when the toast shows after a later move", () => {
    const game = table();
    mount(game.source, <TurnToasts />);
    const formed = (id: string): PublicGameEvent => ({ type: "CERAMIC_FORMED", playerId: other, ceramicId: id, shape: "vase", decoration: "painted", formedBy: "form_decorate" }) as PublicGameEvent;
    const loaded = (id: string, spaceId: string): PublicGameEvent =>
      ({ type: "CERAMIC_LOADED", playerId: other, ceramicId: id, glaze: "grey_green", placement: { kiln: "shared", spaceId, inverted: false }, loadedBy: "glaze_load" }) as unknown as PublicGameEvent;
    const delivered: PublicGameEvent = { type: "ORDER_COMPLETED", playerId: other, record: { orderId: "S01", vp: 3, coins: 0, crowns: 0, ceramicIds: ["x1"], via: "order_phase" } } as unknown as PublicGameEvent;
    // Computer 1 forms two like vases and loads them; Computer 2's turn waits behind; then, before
    // the loading turn's toast closes, Computer 1 delivers one of them.
    game.batch([
      [other, [turnStarted(other), formed("x1"), formed("x2"), turnEnded(other)]],
      [other, [turnStarted(other), loaded("x1", "high_2"), loaded("x2", "middle_1"), turnEnded(other)]],
    ]);
    advance(TOAST_MS);
    const before = textOf(toasts()[0]);
    expect(before.join(" ")).toMatch(/High 2/);
    game.batch([[other, [{ type: "ORDER_TURN_STARTED", playerId: other }, delivered, { type: "ORDER_TURN_ENDED", playerId: other, automatic: false }]]]);
    expect(textOf(toasts()[0])).toEqual(before);
    expect(before.join(" ")).not.toMatch(/delivered/);
  });

  it("pauses while hovered and resumes with the time left; the next turn waits", () => {
    const game = table();
    mount(game.source, <TurnToasts />);
    game.play(other, [placed(other), turnEnded(other)]);
    advance(1_000);
    const toast = toasts()[0]!;
    pointer(toast, "pointerover", document.body);
    game.play(third, [placed(third), turnEnded(third)]);
    advance(TOAST_MS * 3);
    expect(showing()).toBe(other);
    pointer(toast, "pointerout", document.body);
    advance(TOAST_MS - 1_000 - 1);
    expect(showing()).toBe(other);
    advance(1);
    expect(showing()).toBe(third);
  });

  it("pauses while focused; Escape on the last toast dismisses it and returns focus to where it was", () => {
    const outside = document.createElement("button");
    outside.textContent = "Outside";
    document.body.appendChild(outside);
    try {
      const game = table();
      mount(game.source, <TurnToasts />);
      game.play(other, [placed(other), turnEnded(other)]);
      act(() => outside.focus());
      const close = closeButton();
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

  it("from the keyboard, dismissing shows the next turn with focus still on the close button, paused until focus leaves", () => {
    const outside = document.createElement("button");
    outside.textContent = "Outside";
    document.body.appendChild(outside);
    try {
      const game = table();
      mount(game.source, <TurnToasts />);
      game.play(other, [placed(other), turnEnded(other)]);
      game.play(third, [placed(third), turnEnded(third)]);
      game.play(other, [placed(other, "guild_hall"), turnEnded(other)]);
      act(() => outside.focus());
      const close = closeButton();
      act(() => close.focus());
      // Escape, then Enter (a click with no pointer detail): each shows the next turn.
      act(() => {
        close.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(showing()).toBe(third);
      expect(document.activeElement).toBe(close);
      expect(close.getAttribute("aria-label")).toBe(`Dismiss ${nameOf(third)}’s moves`);
      advance(TOAST_MS * 2);
      expect(showing()).toBe(third);
      act(() => close.click());
      expect(showing()).toBe(other);
      expect(document.activeElement).toBe(close);
      // Focus leaves: the toast shows its full time, then closes.
      act(() => outside.focus());
      advance(TOAST_MS - 1);
      expect(showing()).toBe(other);
      advance(1);
      expect(toasts()).toHaveLength(0);
    } finally {
      outside.remove();
    }
  });

  it("from the pointer, closing shows the next turn and returns focus, so nothing stays paused", () => {
    const outside = document.createElement("button");
    outside.textContent = "Outside";
    document.body.appendChild(outside);
    try {
      const game = table();
      mount(game.source, <TurnToasts />);
      game.play(other, [placed(other), turnEnded(other)]);
      game.play(third, [placed(third), turnEnded(third)]);
      act(() => outside.focus());
      // A pointer click focuses the button first (most browsers).
      act(() => closeButton().focus());
      act(() => {
        closeButton().dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
      });
      expect(showing()).toBe(third);
      expect(document.activeElement).toBe(outside);
      advance(TOAST_MS);
      expect(toasts()).toHaveLength(0);
    } finally {
      outside.remove();
    }
  });

  it("does not stay paused when a pointer click closes the focused toast and focus has nowhere to return", () => {
    const game = table();
    mount(game.source, <TurnToasts />);
    game.play(other, [placed(other), turnEnded(other)]);
    game.play(third, [placed(third), turnEnded(third)]);
    (document.activeElement as HTMLElement | null)?.blur();
    act(() => closeButton().focus());
    act(() => {
      closeButton().dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    });
    expect(showing()).toBe(third);
    expect(container.contains(document.activeElement)).toBe(false);
    advance(TOAST_MS);
    expect(toasts()).toHaveLength(0);
    // The last one, by pointer, with nowhere to return to.
    game.play(other, [placed(other, "guild_hall"), turnEnded(other)]);
    act(() => closeButton().focus());
    act(() => {
      closeButton().dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    });
    expect(toasts()).toHaveLength(0);
    game.play(third, [placed(third, "guild_hall"), turnEnded(third)]);
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
    const group = container.querySelector(".turn-toasts")!;
    expect(group.closest("[aria-live], [role='status'], [role='alert'], [role='log']")).toBeNull();
    expect(group.querySelector("[aria-live], [role='status'], [role='alert'], [role='log']")).toBeNull();
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
    const line = `${nameOf(other)} placed their Shifu at Canal Wharf`;
    expect(container.querySelector("[data-live='polite']")!.textContent!.split(line)).toHaveLength(2);
  });

  it("sits after the top bar, the banner and the jump bar and before the world in the shell, where it is drawn", () => {
    const game = table();
    mount(game.source, <GameShell skipLink={null} top={<p>Top</p>} banner={null} world={<p>World</p>} pane={<p>Pane</p>} nav={null} live={null} />);
    game.play(other, [placed(other), turnEnded(other)]);
    const shell = container.querySelector(".shell")!;
    const order = [...shell.children].map((child) => child.className);
    expect(order.indexOf("shell-world")).toBe(order.indexOf("shell-toasts") + 1);
    // Desktop and tablet draw it under the jump bar's row.
    expect(order.indexOf("shell-toasts")).toBe(order.indexOf("shell-jump") + 1);
    expect(order.indexOf("shell-top")).toBeLessThan(order.indexOf("shell-toasts"));
    expect(order.indexOf("shell-banner")).toBeLessThan(order.indexOf("shell-toasts"));
    expect(order.indexOf("shell-pane")).toBeGreaterThan(order.indexOf("shell-world"));
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
    expect(closeButton().getAttribute("aria-label")).toBe(`关闭${nameOf(other)}的行动提示`);
  });
});
