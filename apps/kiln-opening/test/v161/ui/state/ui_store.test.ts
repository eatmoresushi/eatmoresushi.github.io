/**
 * `uiStore`, `layoutMode` and `theme` (UI_V1.6.1_ARCHITECTURE §3.3, §7.1, §8.1): the wireframe's
 * `resetApp` defaults per window, choices kept only for the window they were made in, the
 * viewport-dependent click behaviours per layout mode, and the theme choice.
 */
import { describe, expect, it } from "vitest";
import { decisionWindow } from "../../../../src/app/state/decisionWindow.ts";
import type { DecisionWindow } from "../../../../src/app/state/decisionWindow.ts";
import { fixedLayoutSource, layoutModeFrom, mediaLayoutSource } from "../../../../src/app/state/layoutMode.ts";
import type { LayoutMode } from "../../../../src/app/state/layoutMode.ts";
import { SECTION_TAB, UiStore, WINDOW_UI_DEFAULTS, sectionOrder, windowUiDefaults } from "../../../../src/app/state/uiStore.ts";
import type { UiEffects, WorldSectionId } from "../../../../src/app/state/uiStore.ts";
import { applyTheme, isThemeChoice, resolveTheme } from "../../../../src/app/theme.ts";
import { fixture } from "../support/fixtures.ts";

function recorder(): UiEffects & { scrolls: WorldSectionId[]; themes: string[] } {
  const scrolls: WorldSectionId[] = [];
  const themes: string[] = [];
  return {
    scrolls,
    themes,
    scrollToSection: (section) => scrolls.push(section),
    applyTheme: (choice) => themes.push(`apply:${choice}`),
    storeTheme: (choice) => themes.push(`store:${choice}`),
  };
}

const windowOf = (id: string): DecisionWindow => decisionWindow(fixture(id).playerView);

function store(mode: LayoutMode, effects = recorder()) {
  return { ui: new UiStore({ layout: fixedLayoutSource(mode), effects }), effects };
}

describe("window defaults (wireframe resetApp)", () => {
  it("match the wireframe for the windows it designed", () => {
    expect(WINDOW_UI_DEFAULTS.work).toEqual({ section: "workshop", sheet: "peek" });
    expect(WINDOW_UI_DEFAULTS.contributions).toEqual({ section: "kiln", sheet: "peek" });
    expect(WINDOW_UI_DEFAULTS.heat_markers).toEqual({ section: "kiln", sheet: "peek" });
    expect(WINDOW_UI_DEFAULTS.after_quality).toEqual({ section: "kiln", sheet: "open" });
    expect(WINDOW_UI_DEFAULTS.orders).toEqual({ section: "orders", sheet: "open" });
    expect(WINDOW_UI_DEFAULTS.hand_limit).toEqual({ section: "orders", sheet: "open" });
    expect(WINDOW_UI_DEFAULTS.final).toEqual({ section: "table", sheet: "peek" });
  });

  it("let a waiting viewer watch the part of the table that moves", () => {
    expect(windowUiDefaults(windowOf("t-imperial-only-firing"), "firing")).toEqual({ section: "kiln", sheet: "peek" });
    expect(windowUiDefaults(windowOf("m10b_setters_mark_on_space"), "work")).toEqual({ section: "table", sheet: "peek" });
    expect(windowUiDefaults(null, null)).toEqual({ section: "table", sheet: "peek" });
  });

  it("apply when a new window opens, and choices last only for their window", () => {
    const { ui } = store("phone");
    const work = { window: windowOf("m1_work_phase_r2_3p"), phase: "work" as const };
    expect(ui.stateFor(work)).toMatchObject({ section: "workshop", sheet: "peek" });
    ui.actions.setSection("orders");
    ui.actions.setSheet("open");
    expect(ui.stateFor(work)).toMatchObject({ section: "orders", sheet: "open" });
    const firing = { window: windowOf("m9_contributions_step1_3p"), phase: "firing" as const };
    expect(ui.stateFor(firing)).toMatchObject({ section: "kiln", sheet: "peek" });
  });

  it("returns the same state object while nothing changes", () => {
    const { ui } = store("desktop");
    const context = { window: windowOf("m1_work_phase_r2_3p"), phase: "work" as const };
    expect(ui.stateFor(context)).toBe(ui.stateFor(context));
  });
});

describe("viewport-dependent actions (§8.1)", () => {
  const context = { window: windowOf("m1_work_phase_r2_3p"), phase: "work" as const };

  it("phones: a seat chip opens the Workshop section and collapses an open sheet", () => {
    const { ui, effects } = store("phone");
    ui.stateFor(context);
    ui.actions.setSheet("open");
    ui.actions.showBoard("p2");
    expect(ui.stateFor(context)).toMatchObject({ boardShown: "p2", section: "workshop", sheet: "peek" });
    expect(effects.scrolls).toEqual([]);
  });

  it("short landscape: a seat chip switches section but leaves the side pane open", () => {
    const { ui } = store("phone-landscape");
    ui.stateFor(context);
    ui.actions.setSheet("open");
    ui.actions.showBoard("p2");
    expect(ui.stateFor(context)).toMatchObject({ boardShown: "p2", section: "workshop", sheet: "open" });
  });

  it("desktop and tablet: a seat chip scrolls to the workshops section", () => {
    for (const mode of ["desktop", "tablet"] as const) {
      const { ui, effects } = store(mode);
      ui.stateFor(context);
      ui.actions.showBoard("p1");
      expect(ui.stateFor(context).boardShown).toBe("p1");
      expect(effects.scrolls).toEqual(["workshops"]);
    }
  });

  it("phones: a Place shortcut opens the sheet; desktop leaves it", () => {
    const phone = store("phone").ui;
    phone.stateFor(context);
    phone.actions.placeShortcut();
    expect(phone.stateFor(context).sheet).toBe("open");
    const desktop = store("desktop").ui;
    desktop.stateFor(context);
    desktop.actions.placeShortcut();
    expect(desktop.stateFor(context).sheet).toBe("peek");
  });

  it("jumpTo switches the phone section, or scrolls on desktop", () => {
    const phone = store("phone");
    phone.ui.stateFor(context);
    phone.ui.actions.jumpTo("firing");
    expect(phone.ui.stateFor(context).section).toBe(SECTION_TAB.firing);
    const desktop = store("desktop");
    desktop.ui.stateFor(context);
    desktop.ui.actions.jumpTo("kiln");
    expect(desktop.effects.scrolls).toEqual(["kiln"]);
  });

  it("the log and the theme", () => {
    const { ui, effects } = store("desktop");
    ui.actions.setLogOpen(true);
    ui.actions.setTheme("dark");
    expect(ui.stateFor(context)).toMatchObject({ logOpen: true, theme: "dark" });
    expect(effects.themes).toEqual(["store:dark", "apply:dark"]);
  });
});

describe("sectionOrder (wireframe)", () => {
  it("puts the firing first during the Firing Phase and the results first at the end", () => {
    expect(sectionOrder("firing")[0]).toBe("firing");
    expect(sectionOrder("final")[0]).toBe("results");
    expect(sectionOrder("work")).toEqual(["table", "orders", "progress", "kiln", "workshops"]);
    expect(sectionOrder("cleanup")[0]).toBe("orders");
  });
});

describe("layoutMode", () => {
  it("decides short landscape by height first, then width", () => {
    expect(layoutModeFrom({ shortLandscape: true, phone: true, tablet: true })).toBe("phone-landscape");
    expect(layoutModeFrom({ shortLandscape: false, phone: true, tablet: true })).toBe("phone");
    expect(layoutModeFrom({ shortLandscape: false, phone: false, tablet: true })).toBe("tablet");
    expect(layoutModeFrom({ shortLandscape: false, phone: false, tablet: false })).toBe("desktop");
  });

  it("follows matchMedia changes, with a desktop server snapshot", () => {
    const lists = new Map<string, { matches: boolean; listeners: Set<() => void> }>();
    const matchMedia = (query: string) => {
      let entry = lists.get(query);
      if (entry === undefined) {
        entry = { matches: false, listeners: new Set() };
        lists.set(query, entry);
      }
      const current = entry;
      return {
        get matches() {
          return current.matches;
        },
        addEventListener: (_: string, listener: () => void) => current.listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => current.listeners.delete(listener),
      } as unknown as MediaQueryList;
    };
    const source = mediaLayoutSource({ matchMedia });
    expect(source.getSnapshot()).toBe("desktop");
    expect(source.getServerSnapshot()).toBe("desktop");
    let changes = 0;
    const stop = source.subscribe(() => {
      changes += 1;
    });
    const phone = lists.get("(max-width: 899px)")!;
    phone.matches = true;
    for (const listener of phone.listeners) listener();
    expect(source.getSnapshot()).toBe("phone");
    expect(changes).toBe(1);
    stop();
    expect(phone.listeners.size).toBe(0);
  });
});

describe("theme", () => {
  it("resolves the choice", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(isThemeChoice("dark")).toBe(true);
    expect(isThemeChoice("sepia")).toBe(false);
  });

  it("is a no-op without a document", () => {
    expect(applyTheme("dark")).toBe("dark");
    expect(applyTheme("system")).toBe("light");
  });
});
