/**
 * The room the turn toast takes from the world (owner review 2026-10-17, item 3; D17). Owner: B1
 * (shell, log, lobby).
 *
 * The toast sits at the top of the world's cell and is drawn over nothing: while it shows, the
 * world gives up a band of its cell as tall as the toast's holder (`--turn-toast-band`, the
 * world's top margin, GameShell.css), so no part of the world lies under it. The table keeps its
 * place on screen whatever the band does, also at the top of the world and in a section too short
 * to scroll:
 *
 * - **The band opens or grows:** the world scrolls by as much, so what the band takes is scrolled
 *   out of view at the top, not covered (scrolling brings it back). A section too short to scroll
 *   that far gets the room it needs at its bottom, below the table (`--turn-toast-tail`).
 * - **The band shrinks or closes:** the world scrolls back by as much. What the scroll cannot give
 *   back (the world is scrolled to its top) stays as empty room at the top of the table, where
 *   the toast was (`--turn-toast-lead`), so nothing moves under the pointer. The next toast takes
 *   that room first.
 * - **That room goes only when nothing on screen moves for it:** once the player has scrolled past
 *   it (when their scroll settles), or when the phone section changes (the table shown changes
 *   anyway). The bottom room never stays longer than a scroll needs it.
 * - **A scroll under way is never stopped:** while the world scrolls (the player's own scroll or
 *   fling, or a jump's smooth scroll), the band changes alone. Setting the scroll then would stop
 *   that scroll short of where it was going, and the table is moving anyway. (The world's content
 *   then moves with its top, so a control in view stays in view, unless a growing band pushes it
 *   below the world's bottom: see the next point.)
 * - **The keyboard focus is never scrolled out of view:** when the band opens or grows while the
 *   focus ring shows on a control near the world's top (the placement control the hidden pane
 *   gave focus back to at the start of the viewer's turn, which the world has just scrolled to
 *   its top), the world scrolls only as far as keeps that control `FOCUS_GAP` below the world's
 *   top (or where it is, if nearer), and the table moves down for the rest. A control with the
 *   focus ring near the world's bottom that a band changing alone would push below it (the
 *   world counts as scrolling just after the pane's own instant scroll to that control) keeps
 *   its place with the table instead. Only for the keyboard: a pointer player's table keeps its
 *   place; a control already out of view is left there.
 *
 * `keepInPlace` and `keepFocusInView` are the arithmetic; `ToastRoom` applies them to one shell
 * and its world.
 */

/** The custom properties GameShell.css reads (set on the shell). */
export const BAND_PROPERTY = "--turn-toast-band";
export const LEAD_PROPERTY = "--turn-toast-lead";
export const TAIL_PROPERTY = "--turn-toast-tail";

/** The world counts as scrolling until this long after its last scroll event that the room did not cause. */
export const SCROLL_SETTLE_MS = 150;

/** The band (the world's top margin), the room at the top of the world's content, and the world's scroll. */
export interface RoomLayout {
  band: number;
  lead: number;
  scrollTop: number;
}

/**
 * The layout after the band becomes `band`, with the table where it was on screen: the table's top
 * lies `band + lead − scrollTop` below the world's cell, so the scroll takes the change, and what
 * it cannot take (it would go below 0) stays as room at the top. The room at the top is always
 * the least that keeps the table still: `keepInPlace(layout, layout.band)` gives back what the
 * scroll has passed.
 */
export function keepInPlace(current: RoomLayout, band: number): RoomLayout {
  const offset = current.band + current.lead - current.scrollTop;
  const scrollTop = band - offset;
  return scrollTop >= 0 ? { band, lead: 0, scrollTop } : { band, lead: -scrollTop, scrollTop: 0 };
}

/** Room kept between the keyboard focus and the world's top, in px (the room `revealInWorld` leaves, `state/pane.ts`). */
export const FOCUS_GAP = 8;

/**
 * `next` (from `keepInPlace(current, …)`) with no more scroll than keeps the keyboard focus in
 * view. `focusTop` is the top of the control with the focus ring below the world's top now (null:
 * no focus ring in the world). A control the scroll would take out of view at the top stays
 * `FOCUS_GAP` below it (or where it is, if nearer) and the table moves down for the rest; a
 * control already out of view at the top (the player scrolled away from it) is left there.
 */
export function keepFocusInView(current: RoomLayout, next: RoomLayout, focusTop: number | null): RoomLayout {
  if (focusTop === null || focusTop < 0) return next;
  // The control's top in the world's content, under the room at its top.
  const content = focusTop + current.scrollTop - current.lead;
  const most = content + next.lead - Math.min(FOCUS_GAP, focusTop);
  return next.scrollTop <= most ? next : { ...next, scrollTop: Math.max(0, most) };
}

/** The control with the focus ring, below the world's top: its top and bottom, and the world's height. */
interface FocusRing {
  top: number;
  bottom: number;
  height: number;
}

/**
 * The focused control, when it is in the world, its focus ring shows (the player is on the
 * keyboard) and its top is in view.
 */
function focusRing(world: HTMLElement): FocusRing | null {
  const active = world.ownerDocument.activeElement;
  if (active === null || active === world || !world.contains(active) || active.getClientRects().length === 0) return null;
  try {
    if (!active.matches(":focus-visible")) return null;
  } catch {
    return null;
  }
  const box = world.getBoundingClientRect();
  const rect = active.getBoundingClientRect();
  const top = rect.top - box.top;
  return top >= 0 && top < box.height ? { top, bottom: rect.bottom - box.top, height: box.height } : null;
}

/** Whether a band `grow` px taller, changing alone, would push the focused control below the world's bottom. */
function pushedBelow(focus: FocusRing | null, grow: number): boolean {
  return focus !== null && grow > 0 && focus.bottom <= focus.height + 0.5 && focus.bottom > focus.height - grow;
}

/** The band, the room at the top and at the bottom of one shell's world. */
export class ToastRoom {
  private band = 0;
  private lead = 0;
  private tail = 0;
  /** A scroll position this room set: its scroll event is not the player's. */
  private expected: number | null = null;
  private scrolledAt = Number.NEGATIVE_INFINITY;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly shell: HTMLElement,
    readonly world: HTMLElement,
    private readonly now: () => number = Date.now,
  ) {
    world.addEventListener("scroll", this.onScroll, { passive: true });
  }

  /** The band now taken. */
  get height(): number {
    return this.band;
  }

  /**
   * Gives the toast a band `height` tall (0: none), keeping the table where it is on screen, or,
   * for the keyboard, the focused control in view.
   */
  setBand(height: number): void {
    const band = Math.max(0, height);
    if (band === this.band) return;
    const focus = focusRing(this.world);
    if (this.scrolling() && !pushedBelow(focus, band - this.band)) {
      // The table is moving anyway: setting the scroll would stop that scroll short. The world's
      // content moves with its top, so the focus keeps its place in the world (a control the band
      // would push below the bottom keeps its place on screen instead: the path below).
      this.band = band;
      this.write(BAND_PROPERTY, band);
      this.schedule();
      return;
    }
    const current = { band: this.band, lead: this.lead, scrollTop: this.world.scrollTop };
    this.place(keepFocusInView(current, keepInPlace(current, band), focus?.top ?? null));
  }

  /** The table shown changed (the phone section): the room at the top goes, and the bottom room is fitted again. */
  dropLead(): void {
    if (this.lead === 0 && this.tail === 0) return;
    this.place({ band: this.band, lead: 0, scrollTop: this.world.scrollTop });
  }

  /** Takes every room back and stops listening (the toasts are gone from the shell). */
  dispose(): void {
    this.world.removeEventListener("scroll", this.onScroll);
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    for (const property of [BAND_PROPERTY, LEAD_PROPERTY, TAIL_PROPERTY]) this.shell.style.removeProperty(property);
    this.band = 0;
    this.lead = 0;
    this.tail = 0;
  }

  private scrolling(): boolean {
    return this.now() - this.scrolledAt < SCROLL_SETTLE_MS;
  }

  private readonly onScroll = (): void => {
    const top = this.world.scrollTop;
    const expected = this.expected;
    this.expected = null;
    if (expected !== null && Math.abs(top - expected) < 1) return;
    this.scrolledAt = this.now();
    if (this.lead > 0 || this.tail > 0) this.schedule();
  };

  /** Once the scroll settles, gives back the room it has passed (nothing on screen moves). */
  private schedule(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.lead === 0 && this.tail === 0) return;
      if (this.scrolling()) {
        this.schedule();
        return;
      }
      this.place(keepInPlace({ band: this.band, lead: this.lead, scrollTop: this.world.scrollTop }, this.band));
    }, SCROLL_SETTLE_MS);
  }

  /**
   * Applies `next`: the band and the room at the top, then the scroll, with only the room at the
   * bottom that this scroll needs (none unless the content is too short to scroll so far: first
   * room enough for any content, then trimmed to what is needed). The scroll is set as an absolute
   * value after the change, whatever the browser's own scroll anchoring did in between.
   */
  private place(next: RoomLayout): void {
    this.band = next.band;
    this.lead = next.lead;
    this.write(BAND_PROPERTY, next.band);
    this.write(LEAD_PROPERTY, next.lead);
    this.tail = 0;
    this.write(TAIL_PROPERTY, 0);
    this.scrollTo(next.scrollTop);
    if (this.world.scrollTop < next.scrollTop - 0.5) {
      const ample = Math.ceil(next.scrollTop + this.world.clientHeight);
      this.write(TAIL_PROPERTY, ample);
      const excess = this.world.scrollHeight - this.world.clientHeight - next.scrollTop;
      this.tail = Math.max(0, Math.ceil(ample - Math.max(0, excess)));
      this.write(TAIL_PROPERTY, this.tail);
      this.scrollTo(next.scrollTop);
    }
  }

  private scrollTo(top: number): void {
    if (Math.abs(this.world.scrollTop - top) < 0.5) return;
    this.expected = top;
    this.world.scrollTop = top;
  }

  private write(property: string, value: number): void {
    if (value > 0) this.shell.style.setProperty(property, `${value}px`);
    else this.shell.style.removeProperty(property);
  }
}
