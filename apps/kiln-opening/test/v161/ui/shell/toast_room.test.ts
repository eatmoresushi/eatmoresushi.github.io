// @vitest-environment happy-dom
/**
 * The room the turn toast takes from the world (owner review 2026-10-17, item 3; D17; B1):
 * `shell/toastRoom.ts`. The table keeps its place on screen whatever the band does:
 * - the band opens or grows: the world scrolls by as much; a section too short to scroll that far
 *   gets room at its bottom;
 * - the band shrinks or closes: the world scrolls back; what the scroll cannot give back (the
 *   world at its top) stays as room at the table's top, which the next toast takes first and
 *   which goes once the player has scrolled past it (or the phone section changes);
 * - a scroll under way (the player's, a jump's smooth scroll) is never stopped: the band changes
 *   alone;
 * - the keyboard focus is never scrolled out of view: a control with the focus ring near the
 *   world's top (the hidden pane's return target at the start of the viewer's turn) stays in
 *   view, and the table moves down for the rest; a pointer player's table keeps its place.
 *
 * happy-dom lays nothing out, so the world here is a model of one: a cell `cell` px tall, of which
 * the band takes the top; content `content` px tall plus the room at its top and bottom; the
 * scroll clamped to what that allows; a scroll event a frame after the scroll moves; a control
 * at a fixed place in the content, drawn where that layout puts it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BAND_PROPERTY, FOCUS_GAP, LEAD_PROPERTY, SCROLL_SETTLE_MS, TAIL_PROPERTY, ToastRoom, keepFocusInView, keepInPlace } from "../../../../src/app/shell/toastRoom.ts";

describe("keepInPlace", () => {
  it("scrolls by the band's change, keeping the table's top where it was", () => {
    const top = (layout: { band: number; lead: number; scrollTop: number }) => layout.band + layout.lead - layout.scrollTop;
    const start = { band: 0, lead: 0, scrollTop: 200 };
    const open = keepInPlace(start, 96);
    expect(open).toEqual({ band: 96, lead: 0, scrollTop: 296 });
    const shorter = keepInPlace(open, 64);
    expect(shorter).toEqual({ band: 64, lead: 0, scrollTop: 264 });
    expect(keepInPlace(shorter, 0)).toEqual(start);
    for (const layout of [open, shorter]) expect(top(layout)).toBe(top(start));
  });

  it("leaves what the scroll cannot give back as room at the top, which the next band takes first", () => {
    // The player scrolled to the top while a toast 87px tall showed.
    const atTop = { band: 87, lead: 0, scrollTop: 0 };
    const shorter = keepInPlace(atTop, 66);
    expect(shorter).toEqual({ band: 66, lead: 21, scrollTop: 0 });
    const closed = keepInPlace(shorter, 0);
    expect(closed).toEqual({ band: 0, lead: 87, scrollTop: 0 });
    expect(keepInPlace(closed, 50)).toEqual({ band: 50, lead: 37, scrollTop: 0 });
    expect(keepInPlace(closed, 100)).toEqual({ band: 100, lead: 0, scrollTop: 13 });
    // The same band again gives back what the scroll has passed.
    expect(keepInPlace({ band: 0, lead: 87, scrollTop: 200 }, 0)).toEqual({ band: 0, lead: 0, scrollTop: 113 });
    expect(keepInPlace({ band: 0, lead: 87, scrollTop: 30 }, 0)).toEqual({ band: 0, lead: 57, scrollTop: 0 });
  });
});

describe("keepFocusInView", () => {
  /** The control's top below the world's top in a layout, for a control `content` px down the content. */
  const at = (layout: { lead: number; scrollTop: number }, content: number) => content + layout.lead - layout.scrollTop;

  it("scrolls no further than keeps the focused control FOCUS_GAP below the world's top; the table moves down for the rest", () => {
    // The pane put the return target 8px below the world's top: the world scrolled to it.
    const current = { band: 0, lead: 0, scrollTop: 1_200 };
    const content = 1_208;
    const open = keepFocusInView(current, keepInPlace(current, 66), at(current, content));
    expect(open).toEqual({ band: 66, lead: 0, scrollTop: 1_200 });
    expect(at(open, content)).toBe(FOCUS_GAP);
    // The next turn's lines make the toast taller: still in view.
    const grown = keepFocusInView(open, keepInPlace(open, 126), at(open, content));
    expect(grown).toEqual({ band: 126, lead: 0, scrollTop: 1_200 });
    // A control lower down only takes what keeps it in view, or nothing.
    expect(keepFocusInView(current, keepInPlace(current, 66), 40)).toEqual({ band: 66, lead: 0, scrollTop: 1_232 });
    expect(keepFocusInView(current, keepInPlace(current, 66), 364)).toEqual(keepInPlace(current, 66));
    // Nearer the top than the gap: kept where it is, not brought down.
    const near = keepFocusInView(current, keepInPlace(current, 66), 3);
    expect(at(near, 1_203)).toBe(3);
  });

  it("at the world's top and with room at the table's top, never scrolls below 0 and keeps the room", () => {
    const top = { band: 0, lead: 0, scrollTop: 0 };
    // The Table section's heading, 24px down the content (the world's own padding).
    expect(keepFocusInView(top, keepInPlace(top, 100), 24)).toEqual({ band: 100, lead: 0, scrollTop: 16 });
    // A closed toast left 87px at the table's top: the next one takes it first, nothing scrolls.
    const room = { band: 0, lead: 87, scrollTop: 0 };
    expect(keepFocusInView(room, keepInPlace(room, 50), 111)).toEqual(keepInPlace(room, 50));
    expect(keepFocusInView(room, keepInPlace(room, 100), 111)).toEqual({ band: 100, lead: 0, scrollTop: 13 });
    expect(keepFocusInView(room, keepInPlace(room, 120), 95)).toEqual({ band: 120, lead: 0, scrollTop: 0 });
  });

  it("leaves the layout alone without a focus ring in the world, for a control already out of view, and when the band shrinks", () => {
    const current = { band: 0, lead: 0, scrollTop: 400 };
    const next = keepInPlace(current, 96);
    expect(keepFocusInView(current, next, null)).toBe(next);
    expect(keepFocusInView(current, next, -30)).toBe(next);
    const shown = { band: 96, lead: 0, scrollTop: 496 };
    expect(keepFocusInView(shown, keepInPlace(shown, 0), 8)).toEqual(keepInPlace(shown, 0));
  });
});

/** A world model: see the file comment. */
function worldModel(options: { cell: number; content: number }) {
  const shell = document.createElement("div");
  const world = document.createElement("main");
  shell.appendChild(world);
  document.body.appendChild(shell);
  let content = options.content;
  let scrollTop = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  const px = (property: string) => Number.parseFloat(shell.style.getPropertyValue(property) || "0");
  const clientHeight = () => options.cell - px(BAND_PROPERTY);
  const scrollHeight = () => Math.max(clientHeight(), content + px(LEAD_PROPERTY) + px(TAIL_PROPERTY));
  const clamp = (value: number) => Math.min(Math.max(0, value), scrollHeight() - clientHeight());
  Object.defineProperty(world, "clientHeight", { configurable: true, get: clientHeight });
  Object.defineProperty(world, "scrollHeight", { configurable: true, get: scrollHeight });
  Object.defineProperty(world, "scrollTop", {
    configurable: true,
    get: () => {
      // A shorter scroll range clamps the scroll, as layout does.
      scrollTop = clamp(scrollTop);
      return scrollTop;
    },
    set: (value: number) => {
      const next = clamp(value);
      if (next === scrollTop) return;
      scrollTop = next;
      // One scroll event a frame later, whatever moved the scroll in between.
      pending ??= setTimeout(() => {
        pending = null;
        world.dispatchEvent(new Event("scroll"));
      }, 16);
    },
  });
  // The world's box: below the band, the rest of the cell tall.
  world.getBoundingClientRect = () => new DOMRect(0, px(BAND_PROPERTY), 1_000, clientHeight());
  return {
    shell,
    world,
    /** The table's top below the world's cell: what must not move. */
    tableTop: () => px(BAND_PROPERTY) + px(LEAD_PROPERTY) - world.scrollTop,
    /**
     * A focused button `at` px down the content, with the focus ring (the keyboard) or without
     * (the pointer); `top()` is its top below the world's top.
     */
    focusControl(at: number, ring: boolean) {
      const button = document.createElement("button");
      world.appendChild(button);
      const top = () => px(LEAD_PROPERTY) + at - world.scrollTop;
      button.getBoundingClientRect = () => new DOMRect(0, px(BAND_PROPERTY) + top(), 120, 44);
      button.getClientRects = () => [button.getBoundingClientRect()] as unknown as DOMRectList;
      const matches = button.matches.bind(button);
      button.matches = (selector: string) => (selector === ":focus-visible" ? ring : matches(selector));
      button.focus();
      return { button, top };
    },
    band: () => px(BAND_PROPERTY),
    lead: () => px(LEAD_PROPERTY),
    tail: () => px(TAIL_PROPERTY),
    /** The player scrolls (a wheel, a fling, a jump), and the frame's scroll event fires. */
    scrollBy(delta: number) {
      world.scrollTop = world.scrollTop + delta;
      vi.advanceTimersByTime(16);
    },
    setContent(height: number) {
      content = height;
    },
    remove: () => shell.remove(),
  };
}

describe("ToastRoom", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("scrolls the world by the band, so the table stays where it was", () => {
    const model = worldModel({ cell: 700, content: 2_000 });
    model.world.scrollTop = 200;
    vi.advanceTimersByTime(SCROLL_SETTLE_MS);
    const room = new ToastRoom(model.shell, model.world);
    const top = model.tableTop();
    room.setBand(96);
    expect([model.band(), model.world.scrollTop, model.tableTop()]).toEqual([96, 296, top]);
    vi.advanceTimersByTime(16);
    // Its own scroll is not the player's: the next change is kept still too.
    room.setBand(64);
    expect([model.band(), model.world.scrollTop, model.tableTop()]).toEqual([64, 264, top]);
    room.setBand(0);
    expect([model.band(), model.lead(), model.tail(), model.world.scrollTop]).toEqual([0, 0, 0, 200]);
    room.dispose();
  });

  it("at the world's top, leaves the room a shrinking toast gives back, so nothing moves; the next toast takes it first", () => {
    const model = worldModel({ cell: 700, content: 2_000 });
    const room = new ToastRoom(model.shell, model.world);
    room.setBand(87);
    vi.advanceTimersByTime(16);
    // The player scrolls back to the very top to reach what the band scrolled out of view.
    model.scrollBy(-87);
    vi.advanceTimersByTime(SCROLL_SETTLE_MS);
    const top = model.tableTop();
    expect(top).toBe(87);
    room.setBand(66);
    expect([model.lead(), model.world.scrollTop, model.tableTop()]).toEqual([21, 0, top]);
    room.setBand(50);
    expect([model.lead(), model.tableTop()]).toEqual([37, top]);
    // The queue ends: the whole band stays as room at the top.
    room.setBand(0);
    expect([model.band(), model.lead(), model.world.scrollTop, model.tableTop()]).toEqual([0, 87, 0, top]);
    // Nothing takes it while no one scrolls.
    vi.advanceTimersByTime(SCROLL_SETTLE_MS * 10);
    expect(model.lead()).toBe(87);
    // The next toast takes that room first, then scrolls.
    room.setBand(100);
    expect([model.band(), model.lead(), model.world.scrollTop, model.tableTop()]).toEqual([100, 0, 13, top]);
    room.dispose();
  });

  it("gives back the room at the top once the player has scrolled past it and the scroll has settled", () => {
    const model = worldModel({ cell: 700, content: 2_000 });
    const room = new ToastRoom(model.shell, model.world);
    room.setBand(87);
    vi.advanceTimersByTime(16);
    model.scrollBy(-87);
    vi.advanceTimersByTime(SCROLL_SETTLE_MS);
    room.setBand(0);
    expect(model.lead()).toBe(87);
    model.scrollBy(200);
    const top = model.tableTop();
    // Still scrolling: nothing changes under the scroll.
    vi.advanceTimersByTime(SCROLL_SETTLE_MS - 20);
    expect(model.lead()).toBe(87);
    vi.advanceTimersByTime(20);
    expect([model.lead(), model.world.scrollTop, model.tableTop()]).toEqual([0, 113, top]);
    room.dispose();
  });

  it("gives a section too short to scroll the room it needs at its bottom, and takes it back with the band", () => {
    // A phone's Kiln tab: 583px of content in a 630px world.
    const model = worldModel({ cell: 630, content: 583 });
    const room = new ToastRoom(model.shell, model.world);
    const top = model.tableTop();
    room.setBand(96);
    expect([model.band(), model.world.scrollTop, model.tableTop()]).toEqual([96, 96, top]);
    // Exactly the room the scroll needs: content + tail − (cell − band) = 96.
    expect(model.tail()).toBe(96 - (583 - (630 - 96)));
    vi.advanceTimersByTime(16);
    room.setBand(50);
    expect([model.world.scrollTop, model.tail(), model.tableTop()]).toEqual([50, 50 - (583 - 580), top]);
    vi.advanceTimersByTime(16);
    room.setBand(0);
    expect([model.band(), model.lead(), model.tail(), model.world.scrollTop, model.tableTop()]).toEqual([0, 0, 0, 0, top]);
    room.dispose();
  });

  it("never stops a scroll under way: while the world scrolls, the band changes alone", () => {
    const model = worldModel({ cell: 700, content: 3_000 });
    const room = new ToastRoom(model.shell, model.world);
    // A jump's smooth scroll: a scroll event every frame.
    model.scrollBy(120);
    room.setBand(100);
    expect([model.band(), model.world.scrollTop]).toEqual([100, 120]);
    model.scrollBy(120);
    room.setBand(60);
    expect([model.band(), model.world.scrollTop]).toEqual([60, 240]);
    // Settled: the next change is kept still again.
    vi.advanceTimersByTime(SCROLL_SETTLE_MS);
    const top = model.tableTop();
    room.setBand(0);
    expect([model.world.scrollTop, model.tableTop()]).toEqual([180, top]);
    room.dispose();
  });

  it("never scrolls the keyboard focus out of view: the control the pane gave focus back to stays below the world's top", () => {
    // The start of the viewer's turn: the pane hid and the world scrolled its return target (a
    // Place shortcut) to its top; then the other players' turns show, one toast after another.
    const model = worldModel({ cell: 773, content: 3_000 });
    model.world.scrollTop = 1_200;
    vi.advanceTimersByTime(SCROLL_SETTLE_MS);
    const room = new ToastRoom(model.shell, model.world);
    const shortcut = model.focusControl(1_208, true);
    expect(document.activeElement).toBe(shortcut.button);
    expect(shortcut.top()).toBe(FOCUS_GAP);
    const tableTop = model.tableTop();
    for (const band of [66, 107, 126]) {
      room.setBand(band);
      vi.advanceTimersByTime(16);
      expect([model.band(), shortcut.top()], `band ${String(band)}`).toEqual([band, FOCUS_GAP]);
    }
    // The table moved down with the world's top, as far as the band.
    expect(model.tableTop()).toBe(tableTop + 126);
    // The queue ends: nothing moves, the shortcut stays where it is.
    room.setBand(0);
    expect([model.band(), model.world.scrollTop, shortcut.top()]).toEqual([0, 1_074, FOCUS_GAP + 126]);
    room.dispose();
  });

  it("keeps the Table section's heading in view at the world's top, and a control lower down moves no more than it must", () => {
    const model = worldModel({ cell: 773, content: 3_000 });
    const room = new ToastRoom(model.shell, model.world);
    const heading = model.focusControl(24, true);
    room.setBand(100);
    expect([model.world.scrollTop, model.lead(), heading.top()]).toEqual([16, 0, FOCUS_GAP]);
    vi.advanceTimersByTime(16);
    room.setBand(0);
    expect([model.world.scrollTop, model.lead(), heading.top()]).toEqual([0, 84, 108]);
    room.dispose();
    // A shortcut 364px down the world: the band takes nothing from its view, so the table (and
    // the shortcut, 364px below the cell's top) keeps its place.
    const lower = worldModel({ cell: 773, content: 3_000 });
    lower.world.scrollTop = 1_200;
    vi.advanceTimersByTime(SCROLL_SETTLE_MS);
    const lowerRoom = new ToastRoom(lower.shell, lower.world);
    const shortcut = lower.focusControl(1_564, true);
    const tableTop = lower.tableTop();
    lowerRoom.setBand(126);
    expect([lower.world.scrollTop, lower.tableTop(), lower.band() + shortcut.top()]).toEqual([1_326, tableTop, 364]);
    lowerRoom.dispose();
  });

  it("keeps a pointer player's table in place, and leaves a focused control the player scrolled away from out of view", () => {
    const model = worldModel({ cell: 773, content: 3_000 });
    model.world.scrollTop = 1_200;
    vi.advanceTimersByTime(SCROLL_SETTLE_MS);
    const room = new ToastRoom(model.shell, model.world);
    // Focused by a click: no focus ring.
    const clicked = model.focusControl(1_208, false);
    const tableTop = model.tableTop();
    room.setBand(96);
    expect([model.world.scrollTop, model.tableTop(), clicked.top()]).toEqual([1_296, tableTop, FOCUS_GAP - 96]);
    vi.advanceTimersByTime(16);
    room.setBand(0);
    room.dispose();
    // The keyboard focus is above the world's top already (a wheel scroll took it away): the table keeps its place.
    const away = worldModel({ cell: 773, content: 3_000 });
    away.world.scrollTop = 1_200;
    vi.advanceTimersByTime(SCROLL_SETTLE_MS);
    const awayRoom = new ToastRoom(away.shell, away.world);
    const control = away.focusControl(1_100, true);
    const awayTop = away.tableTop();
    awayRoom.setBand(96);
    expect([away.world.scrollTop, away.tableTop(), control.top()]).toEqual([1_296, awayTop, -196]);
    awayRoom.dispose();
  });

  it("while the world scrolls, a growing band changes alone unless it would push the keyboard focus below the world's bottom", () => {
    // Just after a scroll (the pane's own instant scroll to its return target counts as one).
    const model = worldModel({ cell: 773, content: 3_000 });
    const room = new ToastRoom(model.shell, model.world);
    model.scrollBy(120);
    // A control with the focus ring in the middle of the world: the band changes alone, and the
    // control keeps its place in the world.
    const middle = model.focusControl(120 + 300, true);
    room.setBand(66);
    expect([model.band(), model.world.scrollTop, middle.top()]).toEqual([66, 120, 300]);
    room.dispose();
    // The control at the world's bottom (8px above it): the band alone would push it out, so the
    // table keeps its place and the control stays in view.
    const low = worldModel({ cell: 773, content: 3_000 });
    const lowRoom = new ToastRoom(low.shell, low.world);
    low.scrollBy(120);
    const bottom = low.focusControl(120 + 773 - 8 - 44, true);
    const tableTop = low.tableTop();
    lowRoom.setBand(96);
    expect([low.band(), low.world.scrollTop, low.tableTop()]).toEqual([96, 216, tableTop]);
    expect(bottom.top() + 44).toBeLessThanOrEqual(773 - 96);
    lowRoom.dispose();
  });

  it("drops the room at the top when the table shown changes, and takes every room back when disposed", () => {
    const model = worldModel({ cell: 700, content: 2_000 });
    const room = new ToastRoom(model.shell, model.world);
    room.setBand(80);
    vi.advanceTimersByTime(16);
    model.scrollBy(-80);
    vi.advanceTimersByTime(SCROLL_SETTLE_MS);
    room.setBand(30);
    expect(model.lead()).toBe(50);
    room.dropLead();
    expect([model.band(), model.lead()]).toEqual([30, 0]);
    room.dispose();
    for (const property of [BAND_PROPERTY, LEAD_PROPERTY, TAIL_PROPERTY]) expect(model.shell.style.getPropertyValue(property)).toBe("");
    // No longer listening: a scroll changes nothing.
    model.scrollBy(10);
    vi.advanceTimersByTime(SCROLL_SETTLE_MS);
    expect(model.lead()).toBe(0);
  });
});
