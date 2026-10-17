// @vitest-environment happy-dom
/**
 * The shell's interaction tier (UI_V1.6.1_ARCHITECTURE §8.1–§8.3, §9.3; B1): what static markup
 * cannot show.
 * - Focus rescue: a revision that removes the focused table control moves focus to its section's
 *   heading, then the current section's, then the pane's; deliberate focus elsewhere is kept.
 * - The skip link opens the phone sheet from `peek` and lands on the pane heading; while the pane
 *   is hidden (the work turn before a placement is chosen, owner review 2026-10-17) it lands on
 *   the openers above the world, else on the table.
 * - The log dropdown: Escape closes it and returns focus to its button; Show earlier adds a page
 *   and keeps focus in the panel.
 * - A seat chip opens that player's board (D1) and, on a phone, the Workshop section; a row that
 *   scrolls keeps the acting (else the viewer's) chip in view, scrolling the row only.
 * - The language switch changes the language and keeps focus on itself.
 * - The live region coalesces announcements at least 1.5s apart, "your turn" last.
 * - The lobby: a missing name is said and focused; create and join call the session.
 */
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../../src/app/i18n/I18nProvider.tsx";
import { HomeScreen } from "../../../../src/app/lobby/HomeScreen.tsx";
import { GameScreen } from "../../../../src/app/screens/GameScreen.tsx";
import type { GameSnapshot, GameSource } from "../../../../src/app/session/gameSource.ts";
import { EMPTY_SNAPSHOT } from "../../../../src/app/session/gameSource.ts";
import { fixtureSnapshot } from "../../../../src/app/session/fixtureSource.ts";
import type { SessionActions } from "../../../../src/app/session/sessionStore.ts";
import { GameLog, LOG_PAGE } from "../../../../src/app/shell/GameLog.tsx";
import { GameShell } from "../../../../src/app/shell/GameShell.tsx";
import { LiveAnnouncer } from "../../../../src/app/shell/LiveAnnouncer.tsx";
import { SeatChips, revealInRow, seatInViewOf } from "../../../../src/app/shell/SeatChips.tsx";
import { TopBar } from "../../../../src/app/shell/TopBar.tsx";
import { ANNOUNCE_INTERVAL_MS, announcePolite } from "../../../../src/app/shell/announce.ts";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { DraftStore } from "../../../../src/app/state/draftStore.ts";
import { GameProvider } from "../../../../src/app/state/hooks.ts";
import { fixedLayoutSource } from "../../../../src/app/state/layoutMode.ts";
import type { LayoutMode } from "../../../../src/app/state/layoutMode.ts";
import { BROWSER_UI_EFFECTS, UiStore } from "../../../../src/app/state/uiStore.ts";
import type { UiState } from "../../../../src/app/state/uiStore.ts";
import { allFixtures, fixture } from "../support/fixtures.ts";
import { StaticSource, modelOf, recordingSession } from "../shell/support.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

interface Mounted {
  ui: UiStore;
  rerender(element: ReactElement): void;
}

function mount(source: GameSource, element: ReactElement, options: { layout?: LayoutMode; ui?: Partial<UiState>; session?: SessionActions } = {}): Mounted {
  const layout = fixedLayoutSource(options.layout ?? "desktop");
  const ui = new UiStore({ layout, initial: options.ui ?? {} });
  const drafts = new DraftStore();
  const wrap = (child: ReactElement) => (
    <I18nProvider defaultLocale="en" strict>
      <GameProvider source={source} session={options.session ?? null} registry={WINDOWS} drafts={drafts} ui={ui} layout={layout} devTools={false}>
        {child}
      </GameProvider>
    </I18nProvider>
  );
  act(() => root.render(wrap(element)));
  return { ui, rerender: (next) => act(() => root.render(wrap(next))) };
}

const $ = <E extends Element = HTMLElement>(selector: string): E => {
  const found = container.querySelector<E>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
};

function key(target: Element, keyName: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: keyName, bubbles: true }));
  });
}

async function flushMutations(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

const m1 = (): GameSnapshot => fixtureSnapshot(structuredClone(fixture("m1_work_phase_r2_3p")));
/** A window whose pane always shows (Kiln selection, the viewer choosing). */
const kilns = (): GameSnapshot => fixtureSnapshot(structuredClone(fixture("w-kiln-selection")));

/** The UI state for a fixture's open window (choices are kept per window, §3.3). */
function uiState(ui: UiStore, id = "m1_work_phase_r2_3p"): UiState {
  const model = modelOf(id);
  return ui.stateFor({ window: model.window, phase: model.roundPhase });
}

describe("focus rescue", () => {
  function world(withButton: boolean): ReactElement {
    return (
      <GameShell
        skipLink={null}
        top={null}
        banner={null}
        world={
          <>
            <section data-focus-fallback="" data-section="table" data-current="">
              <h2 tabIndex={-1} id="table-h">
                Table
              </h2>
              {withButton ? <button type="button" id="place">Place</button> : null}
            </section>
            <section data-focus-fallback="" data-section="orders">
              <h2 tabIndex={-1} id="orders-h">
                Orders
              </h2>
              <button type="button" id="other">Other</button>
            </section>
          </>
        }
        pane={<h2 className="pane-heading" tabIndex={-1}>Decide</h2>}
        nav={null}
        live={null}
      />
    );
  }

  it("moves focus to the section heading when a revision removes the focused control", async () => {
    const view = mount(new StaticSource(m1()), world(true));
    act(() => $("#place").focus());
    expect(document.activeElement?.id).toBe("place");
    view.rerender(world(false));
    await flushMutations();
    expect(document.activeElement?.id).toBe("table-h");
  });

  it("falls back to the current section, then the pane heading, when the section is gone too", async () => {
    const view = mount(new StaticSource(m1()), world(true));
    act(() => $("#place").focus());
    // The whole table section is hidden: its heading has no box.
    const tableHeading = $("#table-h");
    const section = tableHeading.closest("section")!;
    section.getClientRects = () => ({ length: 0 }) as unknown as DOMRectList;
    tableHeading.getClientRects = () => ({ length: 0 }) as unknown as DOMRectList;
    section.removeAttribute("data-current");
    $("#orders-h").closest("section")!.setAttribute("data-current", "");
    view.rerender(world(false));
    await flushMutations();
    expect(document.activeElement?.id).toBe("orders-h");
  });

  it("moves focus without scrolling the view (preventScroll)", async () => {
    // Regression (owner review, 2026-10-17): a rescue after another player's move scrolled the
    // screen, which looked like the page flashing.
    const view = mount(new StaticSource(m1()), world(true));
    act(() => $("#place").focus());
    const heading = $("#table-h");
    const calls: Array<FocusOptions | undefined> = [];
    const original = heading.focus.bind(heading);
    heading.focus = (options?: FocusOptions) => {
      calls.push(options);
      original(options);
    };
    view.rerender(world(false));
    await flushMutations();
    expect(document.activeElement?.id).toBe("table-h");
    expect(calls).toEqual([{ preventScroll: true }]);
  });

  it("leaves deliberate focus alone", async () => {
    const view = mount(new StaticSource(m1()), world(true));
    act(() => $("#other").focus());
    act(() => ($("#other") as HTMLButtonElement).blur());
    expect(document.activeElement).toBe(document.body);
    view.rerender(world(false));
    await flushMutations();
    expect(document.activeElement).toBe(document.body);
  });
});

describe("jump bar (desktop and tablet)", () => {
  it("scrolls the world only, never the page or the shell", () => {
    // Regression (owner review, 2026-10-17): scrollIntoView also scrolled the clipped shell, and
    // the player could not scroll back to the top.
    const world = document.createElement("div");
    world.className = "shell-world";
    const section = document.createElement("section");
    section.id = "sec-orders";
    world.appendChild(section);
    document.body.appendChild(world);
    const scrolls: ScrollToOptions[] = [];
    world.scrollTo = ((options: ScrollToOptions) => {
      scrolls.push(options);
    }) as typeof world.scrollTo;
    let intoView = 0;
    section.scrollIntoView = () => {
      intoView += 1;
    };
    BROWSER_UI_EFFECTS.scrollToSection("orders");
    world.remove();
    expect(intoView).toBe(0);
    expect(scrolls).toHaveLength(1);
    expect(scrolls[0]?.top).toBeGreaterThanOrEqual(0);
  });
});

describe("automatic section switch (phones)", () => {
  it("moves focus to the new section's heading when the switch hides the focused element", async () => {
    // Emulate the phone CSS: a section of another tab has no box.
    const original = Element.prototype.getClientRects;
    Element.prototype.getClientRects = function (this: Element) {
      return this.closest("[data-section]:not([data-current])") === null ? original.call(this) : ({ length: 0 } as unknown as DOMRectList);
    };
    try {
      const view = mount(new StaticSource(m1()), <GameScreen />, { layout: "phone" });
      const before = $<HTMLElement>("#sec-workshops-h");
      expect(before.closest("section")?.hasAttribute("data-current")).toBe(true);
      act(() => before.focus());
      act(() => view.ui.actions.setSection("orders"));
      await flushMutations();
      expect(document.activeElement?.id).toBe("sec-orders-h");
      // Focus that is still visible stays where it is.
      act(() => view.ui.actions.setSection("orders"));
      await flushMutations();
      expect(document.activeElement?.id).toBe("sec-orders-h");
    } finally {
      Element.prototype.getClientRects = original;
    }
  });
});

describe("skip link", () => {
  it("opens the phone sheet from peek and lands on the pane heading", async () => {
    const view = mount(new StaticSource(kilns()), <GameScreen />, { layout: "phone", ui: { sheet: "peek" } });
    const link = $<HTMLAnchorElement>(".skip-link");
    act(() => link.focus());
    act(() => link.click());
    expect(uiState(view.ui, "w-kiln-selection").sheet).toBe("open");
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    expect(document.activeElement?.classList.contains("pane-heading")).toBe(true);
  });

  it("focuses the pane heading directly on a wide screen", () => {
    mount(new StaticSource(kilns()), <GameScreen />);
    act(() => $<HTMLAnchorElement>(".skip-link").click());
    expect(document.activeElement?.classList.contains("pane-heading")).toBe(true);
  });

  it("while the work turn hides the pane, lands on the table, where the worker is placed (owner review, 2026-10-17)", () => {
    const view = mount(new StaticSource(m1()), <GameScreen />, { layout: "phone", ui: { sheet: "peek" } });
    expect($("aside.pane").hidden).toBe(true);
    act(() => $<HTMLAnchorElement>(".skip-link").click());
    // No sheet to open, and nothing to open in the bar above the world: the decision starts on
    // the table (the bar's cue "Your turn: place a worker · 4 left" is shown but skipped).
    expect(uiState(view.ui).sheet).toBe("peek");
    expect($("[data-pane-openers]").textContent).toMatch(/^Your turn: place a worker · \d left$/);
    expect(document.activeElement?.id).toBe("sec-table-h");
  });

  it("while the pane is hidden, lands on the openers when an ability may come first", () => {
    mount(new StaticSource(fixtureSnapshot(structuredClone(fixture("w-before-the-worker-action-colour-samples-swap-imperial-priority-with-reworking-table-ding")))), <GameScreen />);
    act(() => $<HTMLAnchorElement>(".skip-link").click());
    expect(document.activeElement).toBe($("[data-pane-openers] [data-focus-heading]"));
    expect(document.activeElement?.textContent).toMatch(/^Your turn: place a worker · \d left$/);
    // Its openers follow it in the Tab order, after the words that name them.
    expect($("[data-pane-openers] [role='group']").textContent).toBe("Or first:Imperial PriorityColour Samples swap");
  });
});

describe("game log", () => {
  function longLog(count: number): StaticSource {
    const snapshot = m1();
    const players = snapshot.view!.game.playerOrder;
    return new StaticSource({
      ...snapshot,
      log: Array.from({ length: count }, (_, index) => ({
        sequence: index + 1,
        revision: index + 1,
        actorId: players[0]!,
        event: { type: "WORK_TURN_STARTED" as const, playerId: players[index % players.length]! },
      })),
    });
  }

  it("opens, closes on Escape and returns focus to its button", () => {
    mount(new StaticSource(m1()), <GameLog />);
    const button = $<HTMLButtonElement>(".game-log-button");
    act(() => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelectorAll(".game-log-entry").length).toBeGreaterThan(0);
    const entry = $(".game-log-panel");
    key(entry, "Escape");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("closes on a press outside it", () => {
    mount(new StaticSource(m1()), <GameLog />, { ui: { logOpen: true } });
    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect($(".game-log-button").getAttribute("aria-expanded")).toBe("false");
  });

  it("shows earlier entries a page at a time, keeping focus in the panel", () => {
    mount(longLog(LOG_PAGE + 5), <GameLog />, { ui: { logOpen: true } });
    expect(container.querySelectorAll(".game-log-entry")).toHaveLength(LOG_PAGE);
    const earlier = $<HTMLButtonElement>(".game-log-earlier");
    act(() => earlier.focus());
    act(() => earlier.click());
    expect(container.querySelectorAll(".game-log-entry")).toHaveLength(LOG_PAGE + 5);
    expect(container.querySelector(".game-log-earlier")).toBeNull();
    expect(document.activeElement?.classList.contains("game-log-title")).toBe(true);
  });
});

describe("seat chips (D1)", () => {
  it("open a player's board and, on a phone, the Workshop section", () => {
    const snapshot = m1();
    const other = snapshot.view!.game.playerOrder.find((id) => id !== snapshot.view!.viewerId)!;
    const view = mount(new StaticSource(snapshot), <SeatChips />, { layout: "phone", ui: { section: "table" } });
    act(() => $<HTMLButtonElement>(`.seat-chip[data-player-id="${other}"]`).click());
    const state = uiState(view.ui);
    expect(state.boardShown).toBe(other);
    expect(state.section).toBe("workshop");
    expect($(`.seat-chip[data-player-id="${other}"]`).getAttribute("aria-pressed")).toBe("true");
    act(() => $<HTMLButtonElement>(`.seat-chip[data-me]`).click());
    expect(uiState(view.ui).boardShown).toBeNull();
  });
});

describe("seat chips in a scrolling row", () => {
  /** Lays the chips out 150px apart in a 200px row (happy-dom has no layout). */
  function fakeLayout(): void {
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("top-bar-seats") ? 600 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("top-bar-seats") ? 200 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const row = this.closest<HTMLElement>(".top-bar-seats");
      if (this.classList.contains("top-bar-seats")) return new DOMRect(0, 0, 200, 40);
      if (row === null || !this.classList.contains("seat-chip")) return new DOMRect(0, 0, 0, 0);
      const index = [...row.querySelectorAll(".seat-chip")].indexOf(this);
      return new DOMRect(index * 150 - row.scrollLeft, 0, 140, 40);
    });
  }

  afterEach(() => vi.restoreAllMocks());

  it("chooses the viewer when acting, else the first actor, else the viewer", () => {
    expect(seatInViewOf(["p2", "p1"], "p1", false)).toBe("p1");
    expect(seatInViewOf(["p3", "p2"], "p1", false)).toBe("p3");
    expect(seatInViewOf([], "p1", false)).toBe("p1");
    expect(seatInViewOf(["p3"], "p1", true)).toBe("p1");
    expect(seatInViewOf([], null, false)).toBeNull();
  });

  it("scrolls the row, never the page, so a chip is fully visible", () => {
    const row = { scrollWidth: 600, clientWidth: 200, scrollLeft: 0, getBoundingClientRect: () => ({ left: 0, right: 200 }) };
    const chip = (left: number, width = 140) => ({ getBoundingClientRect: () => ({ left: left - row.scrollLeft, right: left + width - row.scrollLeft }) });
    expect(revealInRow(row as unknown as HTMLElement, chip(20) as unknown as HTMLElement)).toBeNull();
    expect(revealInRow(row as unknown as HTMLElement, chip(300) as unknown as HTMLElement)).toBe(244);
    expect(revealInRow(row as unknown as HTMLElement, chip(100) as unknown as HTMLElement)).toBe(96);
    // A chip wider than the row shows its start.
    expect(revealInRow(row as unknown as HTMLElement, chip(400, 260) as unknown as HTMLElement)).toBe(396);
    const fits = { ...row, scrollWidth: 200 };
    expect(revealInRow(fits as unknown as HTMLElement, chip(300) as unknown as HTMLElement)).toBeNull();
  });

  it("brings the acting chip into view on mount and when the actor changes", () => {
    fakeLayout();
    const inViewIndex = (id: string): number => {
      const model = modelOf(id);
      const target = seatInViewOf(model.prompt.actorIds, model.viewerId, model.roundPhase === "final");
      return model.players.findIndex((player) => player.playerId === target);
    };
    const far = allFixtures().find((entry) => inViewIndex(entry.id) >= 2)!.id;
    const near = allFixtures().find((entry) => inViewIndex(entry.id) === 0)!.id;
    const scrollTo = vi.spyOn(window, "scrollTo");
    const source = new StaticSource(fixtureSnapshot(structuredClone(fixture(far))));
    mount(source, <div className="top-bar-seats"><SeatChips /></div>, { layout: "phone" });
    const row = $(".top-bar-seats");
    // The far chip's right edge (index × 150 + 140) sits 4px inside the 200px row.
    expect(row.scrollLeft).toBe(inViewIndex(far) * 150 + 140 - 200 + 4);
    act(() => source.set(fixtureSnapshot(structuredClone(fixture(near)))));
    expect(row.scrollLeft).toBeLessThanOrEqual(0);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe("language switch", () => {
  it("switches the language and keeps focus on itself", () => {
    mount(new StaticSource(m1()), <TopBar />);
    const button = $<HTMLButtonElement>(".language-switch");
    expect(button.textContent).toBe("中文");
    expect(button.getAttribute("aria-label")).toBe("中文");
    act(() => button.focus());
    act(() => button.click());
    expect($(".language-switch")).toBe(button);
    expect(button.textContent).toBe("EN");
    expect(button.getAttribute("aria-label")).toBe("English");
    expect(button.getAttribute("lang")).toBe("en");
    expect(document.activeElement).toBe(button);
    expect($(".top-bar-brand").textContent).toBe("开窑");
    act(() => button.click());
    expect(button.textContent).toBe("中文");
  });
});

describe("live announcer", () => {
  it("coalesces announcements at least 1.5s apart, your turn last", () => {
    vi.useFakeTimers();
    const snapshot = m1();
    const source = new StaticSource(snapshot);
    mount(source, <LiveAnnouncer />);
    const polite = () => $("[data-live='polite']").textContent ?? "";
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(polite()).toMatch(/^Your turn: place a worker\./);

    // Two batches arrive inside the interval: one summary, after the interval.
    const players = snapshot.view!.game.playerOrder;
    const name = (id: string) => snapshot.view!.game.players[id]!.displayName;
    const nextBatch = (sequence: number, playerId: string) => ({
      revision: 100 + sequence,
      firstSequence: sequence,
      origin: "remote" as const,
      events: [{ type: "CONTRIBUTION_SUBMITTED" as const, playerId, windowId: "w" }],
    });
    act(() => source.set({ ...snapshot, lastBatch: nextBatch(1_000, players[0]!) }));
    act(() => source.set({ ...snapshot, lastBatch: nextBatch(1_001, players[1]!) }));
    act(() => {
      vi.advanceTimersByTime(ANNOUNCE_INTERVAL_MS - 10);
    });
    expect(polite()).toMatch(/^Your turn/);
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(polite()).toBe(`${name(players[0]!)} chose a Contribution in secret. ${name(players[1]!)} chose a Contribution in secret. `);

    // A batch already announced is never said again.
    act(() => source.set({ ...snapshot, lastBatch: nextBatch(1_001, players[1]!) }));
    act(() => {
      vi.advanceTimersByTime(ANNOUNCE_INTERVAL_MS * 2);
    });
    expect(polite()).toBe(`${name(players[0]!)} chose a Contribution in secret. ${name(players[1]!)} chose a Contribution in secret. `);
  });

  it("announces a batch of every origin: your own move, the computers' and a remote player's", () => {
    vi.useFakeTimers();
    const base = fixture("m1_work_phase_r2_3p");
    const players = base.playerView.game.playerOrder;
    const viewer = base.viewerId;
    const computer = players.find((id) => id !== viewer)!;
    const remote = players.find((id) => id !== viewer && id !== computer)!;
    const snapshot = fixtureSnapshot(structuredClone(base), { computerPlayerIds: [computer] });
    const name = (id: string) => snapshot.view!.game.players[id]!.displayName;
    const source = new StaticSource(snapshot);
    mount(source, <LiveAnnouncer />);
    const polite = () => $("[data-live='polite']").textContent ?? "";
    const placed = (playerId: string) => ({ type: "WORKER_PLACED" as const, playerId, workerId: `${playerId}-w`, kind: "apprentice" as const, locationId: "canal_wharf" as const, spaceIndex: 0, effect: "apprentice" as const, viaSeniorApprentice: false });
    const say = (sequence: number, origin: "self" | "computers" | "remote", playerId: string) => {
      act(() => source.set({ ...snapshot, lastBatch: { revision: 200 + sequence, firstSequence: sequence, origin, events: [placed(playerId)] } }));
      act(() => {
        vi.advanceTimersByTime(ANNOUNCE_INTERVAL_MS * 2);
      });
      return polite();
    };
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(say(2_000, "self", viewer)).toBe(`${name(viewer)} placed their Apprentice at Canal Wharf. `);
    expect(say(2_001, "computers", computer)).toBe(`${name(computer)} moved: ${name(computer)} placed their Apprentice at Canal Wharf. `);
    expect(say(2_002, "remote", remote)).toBe(`${name(remote)} placed their Apprentice at Canal Wharf. `);
  });

  it("speaks a control's own sentence through the one polite region", () => {
    vi.useFakeTimers();
    const source = new StaticSource(m1());
    mount(source, <LiveAnnouncer />);
    act(() => {
      vi.advanceTimersByTime(ANNOUNCE_INTERVAL_MS * 2);
    });
    act(() => announcePolite("Celadon Glazes moved to position 1"));
    act(() => {
      vi.advanceTimersByTime(ANNOUNCE_INTERVAL_MS * 2);
    });
    expect($("[data-live='polite']").textContent).toBe("Celadon Glazes moved to position 1 ");
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
  });

  it("says a rejection in the alert region, unless the banner says it", () => {
    const snapshot = m1();
    const source = new StaticSource({ ...snapshot, status: { ...snapshot.status, error: { kind: "mp", code: "ROOM_FULL" } } });
    mount(source, <LiveAnnouncer />);
    expect($("[data-live='alert']").textContent).not.toBe("");
    act(() => source.set({ ...snapshot, status: { ...snapshot.status, error: { kind: "mp", code: "SERVICE_UNAVAILABLE" }, unsent: { commandId: "x", expectedRevision: 1, command: { type: "END_TURN" } } } }));
    expect($("[data-live='alert']").textContent).toBe("");
  });
});

describe("home screen", () => {
  function type(input: HTMLInputElement, value: string): void {
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("asks for a name first, then creates a room with it", () => {
    const session = recordingSession();
    mount(new StaticSource(EMPTY_SNAPSHOT), <HomeScreen />, { session });
    const create = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Create room")!;
    act(() => create.click());
    expect(session.calls.filter(([name]) => name === "create")).toEqual([]);
    const name = container.querySelector<HTMLInputElement>("input")!;
    expect(document.activeElement).toBe(name);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(container.textContent).toContain("Enter your name first.");
    type(name, "  Lin ");
    act(() => create.click());
    expect(session.calls.filter(([call]) => call === "create")).toEqual([["create", "Lin"]]);
  });

  it("joins with an upper-case room code", () => {
    const session = recordingSession();
    mount(new StaticSource(EMPTY_SNAPSHOT), <HomeScreen />, { session });
    const [name, code] = [...container.querySelectorAll<HTMLInputElement>("input")];
    const join = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Join room")!;
    type(name!, "Zhao");
    act(() => join.click());
    expect(container.textContent).toContain("Enter the room code.");
    expect(document.activeElement).toBe(code);
    type(code!, "kiln42");
    act(() => join.click());
    expect(session.calls.filter(([call]) => call === "join")).toEqual([["join", "KILN42", "Zhao"]]);
  });
});
