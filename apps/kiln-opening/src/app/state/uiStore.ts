/**
 * UI state (UI_V1.6.1_ARCHITECTURE §3.3, §8.1). Frozen after phase A; changes go through B6.
 *
 * Holds what is not game state: the board shown (D1), the phone section and sheet, the log
 * dropdown and the theme. It ports the wireframe's `resetApp` section and sheet defaults, `A.board`,
 * and the viewport-dependent click behaviours:
 * - on phones, a Place shortcut or a location opens the sheet;
 * - on phones, a seat chip switches to the Workshop section and collapses an open sheet to
 *   `peek`, except in short landscape (where the pane is a side column);
 * - on desktop and tablet, KilnMini and seat chips scroll to their section (`jumpTo`).
 *
 * **Defaults follow the window, synchronously.** The section and sheet a player chose are kept
 * only for the window they chose them in (its draft key). When a new window opens, its defaults
 * apply again — the wireframe's automatic section switch — without an effect, so SSR markup
 * shows them. The board shown and the theme are sticky.
 */

import type { PlayerId, RoundPhaseId } from "../../game/index.ts";
import type { SheetState } from "../kit/Sheet.tsx";
import type { ThemeChoice } from "../kit/ThemeToggle.tsx";
import { applyTheme, readStoredTheme, storeTheme } from "../theme.ts";
import { windowDraftKey } from "./decisionWindow.ts";
import type { DecisionWindow, DecisionWindowKind } from "./decisionWindow.ts";
import { fixedLayoutSource, isPhone } from "./layoutMode.ts";
import type { LayoutSource } from "./layoutMode.ts";

/** The four phone sections (D5). */
export type PhoneSection = "table" | "kiln" | "workshop" | "orders";

export const PHONE_SECTIONS: readonly PhoneSection[] = ["table", "kiln", "workshop", "orders"];

/** The world's sections (wireframe `sectionHtml`). */
export type WorldSectionId = "firing" | "results" | "table" | "orders" | "progress" | "kiln" | "workshops";

/** Which phone section shows each world section (wireframe `SEC_TAB`). */
export const SECTION_TAB: Readonly<Record<WorldSectionId, PhoneSection>> = Object.freeze({
  results: "table",
  table: "table",
  progress: "table",
  orders: "orders",
  kiln: "kiln",
  firing: "kiln",
  workshops: "workshop",
});

/** The world's section order per round phase (wireframe `sectionOrder`). */
export function sectionOrder(phase: RoundPhaseId | "final"): readonly WorldSectionId[] {
  switch (phase) {
    case "firing":
      return ["firing", "orders", "table", "progress", "workshops"];
    case "orders":
    case "cleanup":
      return ["orders", "table", "progress", "kiln", "workshops"];
    case "final":
      return ["results", "orders", "progress", "table", "kiln", "workshops"];
    case "start":
    case "work":
      return ["table", "orders", "progress", "kiln", "workshops"];
  }
}

export interface WindowUiDefaults {
  section: PhoneSection;
  sheet: SheetState;
}

/** Per window kind (wireframe `resetApp`; the windows it did not design follow the same idea). */
export const WINDOW_UI_DEFAULTS: Readonly<Record<Exclude<DecisionWindowKind, "waiting">, WindowUiDefaults>> = Object.freeze({
  kiln_selection: { section: "workshop", sheet: "open" },
  setters_mark: { section: "kiln", sheet: "peek" },
  work: { section: "workshop", sheet: "peek" },
  commission: { section: "orders", sheet: "open" },
  guild_inspection: { section: "table", sheet: "open" },
  colour_samples: { section: "orders", sheet: "open" },
  colour_samples_swap: { section: "orders", sheet: "open" },
  contributions: { section: "kiln", sheet: "peek" },
  test_pieces: { section: "kiln", sheet: "open" },
  heat_markers: { section: "kiln", sheet: "peek" },
  jun: { section: "kiln", sheet: "open" },
  after_quality: { section: "kiln", sheet: "open" },
  second_firing: { section: "kiln", sheet: "open" },
  salvage: { section: "kiln", sheet: "open" },
  orders: { section: "orders", sheet: "open" },
  hand_limit: { section: "orders", sheet: "open" },
  final: { section: "table", sheet: "peek" },
});

/** The defaults for a window. A waiting viewer watches the part of the table that is moving. */
export function windowUiDefaults(window: DecisionWindow | null, phase: RoundPhaseId | "final" | null): WindowUiDefaults {
  if (window === null) return { section: "table", sheet: "peek" };
  if (window.kind !== "waiting") return WINDOW_UI_DEFAULTS[window.kind];
  const section: PhoneSection = phase === "firing" ? "kiln" : phase === "orders" || phase === "cleanup" ? "orders" : "table";
  return { section, sheet: "peek" };
}

export interface UiState {
  /** The board the board area shows (D1); null = the viewer's own. */
  boardShown: PlayerId | null;
  section: PhoneSection;
  sheet: SheetState;
  logOpen: boolean;
  theme: ThemeChoice;
}

export interface UiActions {
  /** D1: show a player's board (null = your own), with the §8.1 viewport behaviour. */
  showBoard(playerId: PlayerId | null): void;
  setSection(section: PhoneSection): void;
  setSheet(state: SheetState): void;
  setLogOpen(open: boolean): void;
  setTheme(choice: ThemeChoice): void;
  /** §8.1: a Place shortcut or a location was used; on phones the sheet opens. */
  placeShortcut(): void;
  /** Desktop and tablet scroll to the section; phones switch to its section tab. */
  jumpTo(section: WorldSectionId): void;
}

/** DOM side effects, injected so the store stays node-testable. */
export interface UiEffects {
  scrollToSection(section: WorldSectionId): void;
  applyTheme(choice: ThemeChoice): void;
  storeTheme(choice: ThemeChoice): void;
}

/**
 * The browser effects: scroll `#sec-<id>` to the top of the world's scroll area (with the room of
 * the section's `scroll-margin-top`; the jump bar is a row of its own above the world, `GameShell`);
 * apply and store the theme. Only the world
 * scrolls: `scrollIntoView` would also scroll every other ancestor, the page included.
 */
export const BROWSER_UI_EFFECTS: UiEffects = {
  scrollToSection(section) {
    if (typeof document === "undefined") return;
    const target = document.getElementById(`sec-${section}`);
    if (target === null) return;
    const reduce = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = reduce ? "auto" : "smooth";
    const world = target.closest<HTMLElement>(".shell-world");
    if (world === null) {
      target.scrollIntoView({ behavior, block: "start" });
      return;
    }
    const margin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    const top = target.getBoundingClientRect().top - world.getBoundingClientRect().top + world.scrollTop - margin;
    world.scrollTo({ top: Math.max(0, top), behavior });
  },
  applyTheme(choice) {
    applyTheme(choice);
  },
  storeTheme,
};

export const NO_UI_EFFECTS: UiEffects = {
  scrollToSection: () => undefined,
  applyTheme: () => undefined,
  storeTheme: () => undefined,
};

interface StoredUi {
  boardShown: PlayerId | null;
  /** A chosen section and sheet state, kept only for the window (draft key) they were chosen in. */
  section: { key: string; value: PhoneSection } | null;
  sheet: { key: string; value: SheetState } | null;
  logOpen: boolean;
  theme: ThemeChoice;
}

export interface UiStoreOptions {
  layout?: LayoutSource;
  effects?: UiEffects;
  /** Seeds (tests, the gallery): applied as choices for whatever window is open. */
  initial?: Partial<UiState>;
  /** Default: the stored theme in a browser, else `system`. */
  theme?: ThemeChoice;
}

/** The window context `useUi()` passes: the open window and the round phase. */
export interface UiContext {
  window: DecisionWindow | null;
  phase: RoundPhaseId | "final" | null;
}

const ANY_WINDOW = "*";

export class UiStore {
  private stored: StoredUi;
  private readonly layout: LayoutSource;
  private readonly effects: UiEffects;
  private context: UiContext = { window: null, phase: null };
  private cache: { stored: StoredUi; key: string; state: UiState } | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(options: UiStoreOptions = {}) {
    this.layout = options.layout ?? fixedLayoutSource("desktop");
    this.effects = options.effects ?? NO_UI_EFFECTS;
    const initial = options.initial ?? {};
    this.stored = {
      boardShown: initial.boardShown ?? null,
      section: initial.section === undefined ? null : { key: ANY_WINDOW, value: initial.section },
      sheet: initial.sheet === undefined ? null : { key: ANY_WINDOW, value: initial.sheet },
      logOpen: initial.logOpen ?? false,
      theme: initial.theme ?? options.theme ?? "system",
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The stored choices (the `useSyncExternalStore` snapshot; replaced on every change). */
  getStored = (): unknown => this.stored;

  /** The effective state for a window: its defaults, overridden by choices made in it. */
  stateFor(context: UiContext): UiState {
    this.context = context;
    const key = context.window === null ? "" : windowDraftKey(context.window);
    const cache = this.cache;
    if (cache !== null && cache.stored === this.stored && cache.key === key) return cache.state;
    const defaults = windowUiDefaults(context.window, context.phase);
    const pick = <T>(choice: { key: string; value: T } | null, fallback: T): T =>
      choice !== null && (choice.key === key || choice.key === ANY_WINDOW) ? choice.value : fallback;
    const state: UiState = {
      boardShown: this.stored.boardShown,
      section: pick(this.stored.section, defaults.section),
      sheet: pick(this.stored.sheet, defaults.sheet),
      logOpen: this.stored.logOpen,
      theme: this.stored.theme,
    };
    this.cache = { stored: this.stored, key, state };
    return state;
  }

  /** The actions, bound to the last window context `stateFor` saw. */
  readonly actions: UiActions = {
    showBoard: (playerId) => {
      const mode = this.layout.getSnapshot();
      const patch: Partial<StoredUi> = { boardShown: playerId };
      if (isPhone(mode)) {
        patch.section = this.choice("workshop");
        if (mode === "phone" && this.current().sheet === "open") patch.sheet = this.choice<SheetState>("peek");
      } else {
        this.effects.scrollToSection("workshops");
      }
      this.update(patch);
    },
    setSection: (section) => this.update({ section: this.choice(section) }),
    setSheet: (state) => this.update({ sheet: this.choice(state) }),
    setLogOpen: (open) => this.update({ logOpen: open }),
    setTheme: (choice) => {
      this.effects.storeTheme(choice);
      this.effects.applyTheme(choice);
      this.update({ theme: choice });
    },
    placeShortcut: () => {
      if (isPhone(this.layout.getSnapshot())) this.update({ sheet: this.choice<SheetState>("open") });
    },
    jumpTo: (section) => {
      if (isPhone(this.layout.getSnapshot())) this.update({ section: this.choice(SECTION_TAB[section]) });
      else this.effects.scrollToSection(section);
    },
  };

  private current(): UiState {
    return this.stateFor(this.context);
  }

  private choice<T>(value: T): { key: string; value: T } {
    const window = this.context.window;
    return { key: window === null ? ANY_WINDOW : windowDraftKey(window), value };
  }

  private update(patch: Partial<StoredUi>): void {
    this.stored = { ...this.stored, ...patch };
    for (const listener of [...this.listeners]) listener();
  }
}

/** A browser store: media-query layout, DOM effects, the stored theme. */
export function createBrowserUiStore(layout: LayoutSource): UiStore {
  return new UiStore({ layout, effects: BROWSER_UI_EFFECTS, theme: readStoredTheme() });
}
