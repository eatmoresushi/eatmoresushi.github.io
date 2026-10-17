// @vitest-environment happy-dom
/**
 * The hidden decision pane (owner review item 2, 2026-10-17; `state/pane.ts`, `workPane`,
 * `PaneOpeners`, `GameShell`, `DecisionPane`). Owner: B4.
 *
 * During the viewer's work turn, while no placement is chosen, the pane is hidden: the world takes
 * its column on desktop and tablet, phones show no bottom sheet. A Place shortcut on the table
 * brings it back with that space's choices and Confirm, and focus moves into it; Clear (or going
 * back to placing) hides it again and focus returns to the table. Every other window keeps the
 * pane, and so does a pending server error. While it is hidden a slim bar above the world says it
 * is the viewer's turn, what to do and how many workers are left, and an ability that may come
 * before the worker action is opened from that bar ("Or first:"), generic over the openers the
 * window names. Focus goes back to the placement control the player used (found again when it was
 * drawn anew); the world scrolls to it after the player's own Clear, and at a new turn only for a
 * keyboard player.
 */
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocationId, PlayerView } from "../../../../src/game/index.ts";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { workPane } from "../../../../src/app/decision/work/windows.work.ts";
import { workDraft } from "../../../../src/app/decision/work/workDraft.ts";
import type { WorkDraft } from "../../../../src/app/decision/work/workDraft.ts";
import { I18nProvider } from "../../../../src/app/i18n/I18nProvider.tsx";
import { createTranslator } from "../../../../src/app/i18n/translator.ts";
import type { RichMessage } from "../../../../src/app/i18n/translator.ts";
import { GameScreen } from "../../../../src/app/screens/GameScreen.tsx";
import { decisionWindow } from "../../../../src/app/state/decisionWindow.ts";
import { DraftStore } from "../../../../src/app/state/draftStore.ts";
import { GameProvider } from "../../../../src/app/state/hooks.ts";
import { fixedLayoutSource } from "../../../../src/app/state/layoutMode.ts";
import type { LayoutMode } from "../../../../src/app/state/layoutMode.ts";
import { buildGameModel, engineViewOf } from "../../../../src/app/state/model.ts";
import { focusTable, tableFocusTarget } from "../../../../src/app/state/pane.ts";
import { UiStore } from "../../../../src/app/state/uiStore.ts";
import { ControlledSource } from "../support/controlledSource.ts";
import { allFixtures, fixture, fixtureSource } from "../support/fixtures.ts";
import { renderScreen } from "../support/render.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const M1 = "m1_work_phase_r2_3p";
const DING = "w-before-the-worker-action-canal-barge-imperial-priority-with-reworking-table-ding";
/** Canal Barge is the only ability that may come before the worker action here. */
const RICH = "w-before-the-worker-action-rich-4-player-start";
const EN = createTranslator("en", { strict: true });
const ZH = createTranslator("zh-CN", { strict: true });

/** The model, engine view and initial work draft of a fixture. */
function workOf(id: string) {
  const view = fixture(id).playerView;
  const model = buildGameModel(view, []);
  const engine = engineViewOf(view);
  return { model, engine, initial: workDraft.initial(model, engine) };
}

/** The work draft after a table Place shortcut, as a player makes it. */
function placed(id: string, locationId: LocationId, workerKey: string): WorkDraft {
  const { model, engine, initial } = workOf(id);
  const action = WINDOWS.work.table?.act(initial, { type: "place", locationId, workerKey }, model, engine);
  if (action === null || action === undefined) throw new Error(`${id}: no Place for ${workerKey} at ${locationId}`);
  return workDraft.reduce(initial, action as never, model, engine);
}

describe("which drafts hide the pane (workPane)", () => {
  it("only the viewer's work turn before the action, with nothing chosen; every other window has no pane rule", () => {
    for (const kind of Object.keys(WINDOWS) as (keyof typeof WINDOWS)[]) {
      if (kind !== "work") expect(WINDOWS[kind].pane, kind).toBeUndefined();
    }
    expect(WINDOWS.work.pane).toBe(workPane);
    const work = allFixtures().filter((entry) => decisionWindow(entry.playerView).kind === "work");
    expect(work.length).toBeGreaterThan(3);
    for (const entry of work) {
      const { model, engine, initial } = workOf(entry.id);
      const before = model.window.kind === "work" && model.window.step === "before_action";
      const chosen = workDraft.options(initial, model, engine).active !== null;
      expect(workPane(initial, model, engine).hidden, entry.id).toBe(before && !chosen);
    }
  });

  it("a chosen placement or an ability's form shows it", () => {
    const { model, engine, initial } = workOf(DING);
    expect(workPane(initial, model, engine).hidden).toBe(true);
    expect(workPane(placed(DING, "canal_wharf", "shifu"), model, engine).hidden).toBe(false);
    const ability = workDraft.reduce(initial, { type: "mode", mode: "imperial_priority" }, model, engine);
    expect(workPane(ability, model, engine).hidden).toBe(false);
    // Back to placing, with nothing chosen: hidden again.
    expect(workPane(workDraft.reduce(ability, { type: "mode", mode: "place" }, model, engine), model, engine).hidden).toBe(true);
  });

  it("names an opener per ability that may come first, from the window's own modes", () => {
    const ding = workOf(DING);
    const presence = workPane(ding.initial, ding.model, ding.engine);
    if (!presence.hidden) throw new Error("shown");
    const modes = workDraft.options(ding.initial, ding.model, ding.engine).modes.map((option) => option.mode);
    expect(presence.openers.map((opener) => opener.key)).toEqual(modes.filter((mode) => mode !== "place"));
    expect(presence.openers.map((opener) => opener.key)).toEqual(["imperial_priority", "canal_barge"]);
    expect(presence.openers.map((opener) => opener.action)).toEqual([
      { type: "mode", mode: "imperial_priority" },
      { type: "mode", mode: "canal_barge" },
    ]);
    expect(presence.openers.map((opener) => EN.richMessage(opener.label as RichMessage))).toEqual(["Imperial Priority", "Canal Barge"]);
    // The cue says whose turn it is, what to do and how many workers are left; the label names the openers.
    const left = workDraft.options(ding.initial, ding.model, ding.engine).workersLeft;
    expect(left).toBeGreaterThan(0);
    expect(EN.message(presence.lead as RichMessage)).toBe(`Your turn: place a worker · ${String(left)} left`);
    expect(ZH.message(presence.lead as RichMessage)).toBe(`轮到你了：派工 · 还剩${String(left)}名工人`);
    expect(EN.richMessage(presence.openersLabel as RichMessage)).toBe("Or first:");
    expect(ZH.richMessage(presence.openersLabel as RichMessage)).toBe("也可以先用：");
    // Nothing may come first: no openers and no label, and the cue is still there.
    const m1 = workOf(M1);
    const plain = workPane(m1.initial, m1.model, m1.engine);
    if (!plain.hidden) throw new Error("shown");
    expect(plain.openers).toEqual([]);
    expect(plain.openersLabel).toBeNull();
    const m1Left = workDraft.options(m1.initial, m1.model, m1.engine).workersLeft;
    expect(EN.message(plain.lead as RichMessage)).toBe(`Your turn: place a worker · ${String(m1Left)} left`);
    expect(ZH.message(plain.lead as RichMessage)).toBe(`轮到你了：派工 · 还剩${String(m1Left)}名工人`);
  });
});

describe("the step choice before the worker action (stepChoices, heading, backToPlacing)", () => {
  const steps = (draft: WorkDraft, id: string) => {
    const { model, engine } = workOf(id);
    const options = workDraft.options(draft, model, engine);
    return { choices: options.stepChoices.map((choice) => choice.mode), heading: options.heading, back: options.backToPlacing };
  };
  /** The work window's heading (and phone sheet strip) for a draft, in English and Chinese. */
  const titles = (draft: WorkDraft, id: string) => {
    const { model, engine } = workOf(id);
    const title = WINDOWS.work.title(model, engine, draft) as RichMessage;
    return [EN.richMessage(title), ZH.richMessage(title)];
  };

  it("offers Place a worker only while a placement is chosen, so moving through the radios never hides the pane", () => {
    const { model, engine, initial } = workOf(DING);
    // Nothing chosen (the pane is hidden): placing a worker.
    expect(steps(initial, DING)).toEqual({ choices: ["imperial_priority", "canal_barge"], heading: "place", back: false });
    expect(titles(initial, DING)).toEqual(["Place a worker", "派工"]);
    // An ability opened from the bar, nothing placed: the abilities only, and a separate way back.
    // The heading says what the pane shows, not "Place a worker" (verifier, 2026-10-17).
    const ability = workDraft.reduce(initial, { type: "mode", mode: "imperial_priority" }, model, engine);
    expect(steps(ability, DING)).toEqual({ choices: ["imperial_priority", "canal_barge"], heading: "before_action", back: true });
    expect(titles(ability, DING)).toEqual(["Before your worker action", "工人行动之前"]);
    for (const mode of ["imperial_priority", "canal_barge"] as const) {
      expect(workPane(workDraft.reduce(ability, { type: "mode", mode }, model, engine), model, engine).hidden, mode).toBe(false);
    }
    // A placement chosen: Place a worker is a choice too, and the placement stays while an ability is open.
    const chosen = placed(DING, "canal_wharf", "shifu");
    expect(steps(chosen, DING)).toEqual({ choices: ["place", "imperial_priority", "canal_barge"], heading: "place", back: false });
    expect(titles(chosen, DING)).toEqual(["Place a worker", "派工"]);
    const both = workDraft.reduce(chosen, { type: "mode", mode: "canal_barge" }, model, engine);
    expect(steps(both, DING)).toEqual({ choices: ["place", "imperial_priority", "canal_barge"], heading: "before_action", back: false });
    expect(titles(both, DING)).toEqual(["Before your worker action", "工人行动之前"]);
    for (const mode of ["place", "imperial_priority", "canal_barge"] as const) {
      expect(workPane(workDraft.reduce(both, { type: "mode", mode }, model, engine), model, engine).hidden, mode).toBe(false);
    }
    expect(workDraft.options(workDraft.reduce(both, { type: "mode", mode: "place" }, model, engine), model, engine).active?.locationId).toBe("canal_wharf");
  });

  it("offers no lone radio: one ability opened with nothing placed is named by the heading", () => {
    const { model, engine, initial } = workOf(RICH);
    expect(workDraft.options(initial, model, engine).modes.map((option) => option.mode)).toEqual(["place", "canal_barge"]);
    expect(steps(initial, RICH)).toEqual({ choices: [], heading: "place", back: false });
    const barge = workDraft.reduce(initial, { type: "mode", mode: "canal_barge" }, model, engine);
    expect(steps(barge, RICH)).toEqual({ choices: [], heading: "canal_barge", back: true });
    expect(titles(barge, RICH)).toEqual(["Canal Barge", "漕船"]);
    expect(workPane(barge, model, engine).hidden).toBe(false);
    // With a placement chosen there is a choice again: Place a worker or Canal Barge first.
    const chosen = placed(RICH, "canal_wharf", "shifu");
    expect(steps(chosen, RICH)).toEqual({ choices: ["place", "canal_barge"], heading: "place", back: false });
    const both = workDraft.reduce(chosen, { type: "mode", mode: "canal_barge" }, model, engine);
    expect(steps(both, RICH)).toEqual({ choices: ["place", "canal_barge"], heading: "before_action", back: false });
  });

  it("is empty when nothing may come first, and after the worker action (ActionWindow lists the modes there)", () => {
    expect(steps(placed(M1, "canal_wharf", "shifu"), M1)).toEqual({ choices: [], heading: "place", back: false });
    const after = workOf("w-after-the-worker-action");
    expect(workDraft.options(after.initial, after.model, after.engine)).toMatchObject({ stepChoices: [], heading: "after_action", backToPlacing: false });
    expect(titles(after.initial, "w-after-the-worker-action")).toEqual(["After your worker action", "工人行动之后"]);
    for (const mode of ["imperial_priority", "canal_barge", "end_turn"] as const) {
      const draft = workDraft.reduce(after.initial, { type: "mode", mode }, after.model, after.engine);
      expect(workDraft.options(draft, after.model, after.engine).heading, mode).toBe("after_action");
    }
  });
});

describe("the hidden pane in the markup", () => {
  /** The hidden pane's bar: the markup of the shell's `bar` cell. */
  const barOf = (html: string) => /<div class="shell-bar">(.*?)<\/div><div class="shell-(?:jump|toasts)">/s.exec(html)?.[1] ?? "";

  it("keeps the pane's markup (the test-driver contract) but hidden, and gives the world its column", () => {
    const html = renderScreen(fixtureSource(M1));
    expect(html).toContain('<div class="shell" data-shell="" data-pane="hidden">');
    expect(html).toMatch(/<aside class="pane" aria-label="Your decision" data-window="work" data-revision="\d+" hidden="">/);
    expect(html).toContain('<form class="pane-form" data-window="work" data-step="before_action"');
    // No "Go to…" hint any more.
    expect(html).not.toMatch(/data-b4="place-hint"|data-goto="table"|data-goto="workshop"/);
  });

  it("says above the world that it is the viewer's turn, what to do and how many workers are left, with nothing to open, in English and Chinese", () => {
    const m1 = workOf(M1);
    const left = String(workDraft.options(m1.initial, m1.model, m1.engine).workersLeft);
    const en = barOf(renderScreen(fixtureSource(M1)));
    expect(en).toBe(`<section class="pane-openers" aria-label="Your decision" data-pane-openers=""><p class="pane-openers-lead" tabindex="-1" data-focus-heading="">Your turn: place a worker · ${left} left</p></section>`);
    expect(en).not.toContain("data-pane-opener=");
    expect(en).not.toContain('role="group"');
    const zh = barOf(renderScreen(fixtureSource(M1), { locale: "zh-CN" }));
    expect(zh).toContain('<section class="pane-openers" aria-label="你的决断"');
    expect(zh).toContain(`>轮到你了：派工 · 还剩${left}名工人</p>`);
  });

  it("shows the openers above the world, after the lead and before the world in the markup, in English and Chinese", () => {
    const html = renderScreen(fixtureSource(DING));
    const bar = barOf(html);
    expect(bar).toMatch(/^<section class="pane-openers" aria-label="Your decision" data-pane-openers="">/);
    // The lead, then the openers' group as one sibling (so label and buttons move together),
    // named by its label, which comes first in it.
    expect(bar).toMatch(
      /<p class="pane-openers-lead" tabindex="-1" data-focus-heading="">Your turn: place a worker · \d left<\/p><div class="pane-openers-row" role="group" aria-labelledby="([^"]+)"><span id="\1" class="pane-openers-label">Or first:<\/span><button/,
    );
    expect([...bar.matchAll(/data-pane-opener="([^"]+)"[^>]*>([^<]+)</g)].map((match) => [match[1], match[2]])).toEqual([
      ["imperial_priority", "Imperial Priority"],
      ["canal_barge", "Canal Barge"],
    ]);
    expect(html.indexOf("pane-openers")).toBeLessThan(html.indexOf("<main"));
    const zh = renderScreen(fixtureSource(DING), { locale: "zh-CN" });
    expect(zh).toContain('<section class="pane-openers" aria-label="你的决断"');
    expect(zh).toMatch(/>轮到你了：派工 · 还剩\d名工人<\/p>/);
    expect(zh).toContain('<span id="' + /<span id="([^"]+)" class="pane-openers-label">/.exec(zh)?.[1] + '" class="pane-openers-label">也可以先用：</span>');
    expect(zh).toMatch(/data-pane-opener="imperial_priority"[^>]*>御烧优先</);
  });

  it("keeps the pane in every other window, and once a placement is chosen", () => {
    for (const id of ["w-kiln-selection", "w-after-the-worker-action", "m17_after_action", "m10b_setters_mark_on_space", "m9_contributions_step1_3p", "m8_final_results_3p"]) {
      const html = renderScreen(fixtureSource(id));
      expect(html, id).not.toContain('data-pane="hidden"');
      expect(html, id).not.toMatch(/<aside class="pane"[^>]*hidden=""/);
    }
    const html = renderScreen(fixtureSource(M1), { draft: placed(M1, "canal_wharf", "shifu") });
    expect(html).not.toContain('data-pane="hidden"');
    expect(html).toContain('data-b4="chosen"');
  });
});

// ── Interaction ───────────────────────────────────────────────────────────────────────────

let container: HTMLDivElement;
let root: Root;
let consoleErrors: unknown[][] = [];
let restoreConsole: () => void = () => undefined;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  consoleErrors = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args);
  });
  restoreConsole = () => spy.mockRestore();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  restoreConsole();
  expect(consoleErrors).toEqual([]);
});

function mount(source: ControlledSource, element: ReactElement = <GameScreen />, layoutMode: LayoutMode = "desktop"): UiStore {
  const layout = fixedLayoutSource(layoutMode);
  const ui = new UiStore({ layout });
  act(() =>
    root.render(
      <I18nProvider defaultLocale="en" strict>
        <GameProvider source={source} registry={WINDOWS} drafts={new DraftStore()} ui={ui} layout={layout} devTools={false}>
          {element}
        </GameProvider>
      </I18nProvider>,
    ),
  );
  return ui;
}

const $ = <E extends Element = HTMLElement>(selector: string): E => {
  const found = container.querySelector<E>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
};

/** A real press: focus first (as a pointer or keyboard does), then click. */
function press(target: Element): void {
  act(() => (target as HTMLElement).focus());
  act(() => (target as HTMLElement).click());
}

const pane = () => $<HTMLElement>("aside.pane");
/** Presses the pane's Clear (back to placing, nothing chosen). */
function pressClear(): void {
  const clear = [...pane().querySelectorAll<HTMLButtonElement>(".confirm-buttons button")].find((button) => button.textContent === "Clear");
  if (clear === undefined) throw new Error("no Clear");
  press(clear);
}
const shell = () => $<HTMLElement>(".shell");
const paneHeading = () => $<HTMLElement>("aside.pane .pane-heading");
const placeButton = (locationId: string, worker: string) => $<HTMLButtonElement>(`button[data-act="place"][data-location-id="${locationId}"][data-worker="${worker}"]`);
const sheetOf = (ui: UiStore, id: string) => {
  const model = buildGameModel(fixture(id).playerView, []);
  return ui.stateFor({ window: model.window, phase: model.roundPhase }).sheet;
};

/** The same view one round on: a new turn of the same viewer (a new window key), nothing chosen. */
function nextTurn(view: PlayerView): PlayerView {
  return { ...view, game: { ...view.game, revision: view.game.revision + 1, round: (view.game.round + 1) as PlayerView["game"]["round"] } };
}

describe("the pane appears with a placement and hides again", () => {
  it("a Place shortcut shows the pane with that space's choices and moves focus into it; Clear hides it and focus returns to the shortcut", () => {
    mount(new ControlledSource(M1));
    expect(pane().hidden).toBe(true);
    expect(shell().getAttribute("data-pane")).toBe("hidden");
    press(placeButton("canal_wharf", "shifu"));
    expect(pane().hidden).toBe(false);
    expect(shell().hasAttribute("data-pane")).toBe(false);
    expect(document.activeElement).toBe(paneHeading());
    expect($('[data-b4="chosen"]').getAttribute("data-location-id")).toBe("canal_wharf");
    // Another Place while the pane shows: the choice changes, focus stays on the table.
    press(placeButton("materials_yard", "shifu"));
    expect($('[data-b4="chosen"]').getAttribute("data-location-id")).toBe("materials_yard");
    expect(document.activeElement).toBe(placeButton("materials_yard", "shifu"));
    // Into the pane, then Clear: back to placing.
    const clear = [...pane().querySelectorAll<HTMLButtonElement>(".confirm-buttons button")].find((button) => button.textContent === "Clear");
    if (clear === undefined) throw new Error("no Clear");
    press(clear);
    expect(pane().hidden).toBe(true);
    expect(shell().getAttribute("data-pane")).toBe("hidden");
    expect(document.activeElement).toBe(placeButton("materials_yard", "shifu"));
    expect(placeButton("materials_yard", "shifu").getAttribute("aria-pressed")).toBe("false");
  });

  it("after Confirm, a new turn of the viewer's hides the pane again and focus goes back to the table", async () => {
    const source = new ControlledSource(M1);
    mount(source);
    press(placeButton("canal_wharf", "shifu"));
    press($('[data-action="confirm"]'));
    expect(source.submitted).toHaveLength(1);
    expect(document.activeElement).toBe($('[data-action="confirm"]'));
    await act(async () => source.answer({ view: nextTurn(fixture(M1).playerView) }));
    expect(pane().hidden).toBe(true);
    expect(document.activeElement).toBe(placeButton("canal_wharf", "shifu"));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("after another player's turn redrew the shortcuts, finds the one used again by its data attributes", async () => {
    const source = new ControlledSource(M1);
    mount(source);
    const used = placeButton("canal_wharf", "shifu");
    press(used);
    press($('[data-action="confirm"]'));
    // Another player's turn: the viewer waits, and the table offers no Place shortcuts.
    const view = fixture(M1).playerView;
    const other = view.game.playerOrder.find((playerId) => playerId !== view.viewerId);
    if (other === undefined || view.game.phase.type !== "work_turn") throw new Error("fixture");
    const waiting: PlayerView = { ...view, game: { ...view.game, revision: view.game.revision + 1, phase: { ...view.game.phase, activePlayerId: other } } };
    await act(async () => source.answer({ view: waiting }));
    expect(pane().getAttribute("data-window")).toBe("waiting");
    expect(container.querySelector('[data-act="place"]')).toBeNull();
    expect(used.isConnected).toBe(false);
    // The viewer's next turn: the pane hides, and focus goes to the shortcut drawn anew.
    act(() => source.setView(nextTurn({ ...view, game: { ...view.game, revision: view.game.revision + 1 } })));
    expect(pane().hidden).toBe(true);
    expect(document.activeElement).toBe(placeButton("canal_wharf", "shifu"));
    expect(document.activeElement).not.toBe(used);
  });

  it("falls back to another worker's Place at the same location, then to the Table section's heading", () => {
    mount(new ControlledSource(M1));
    const heading = $<HTMLElement>("#sec-table-h");
    const gone = (attributes: Record<string, string>) => {
      const button = document.createElement("button");
      for (const [name, value] of Object.entries(attributes)) button.setAttribute(name, value);
      return button;
    };
    const atWharf = container.querySelector('[data-act="place"][data-location-id="canal_wharf"]');
    expect(atWharf).not.toBeNull();
    expect(tableFocusTarget(document, gone({ "data-act": "place", "data-location-id": "canal_wharf", "data-worker": "apprentice-senior" }))).toBe(atWharf);
    expect(tableFocusTarget(document, gone({ "data-pane-opener": "imperial_priority" }))).toBe(heading);
    expect(tableFocusTarget(document, gone({}))).toBe(heading);
    expect(tableFocusTarget(document, null)).toBe(heading);
  });

  it("stays up while a server error is pending, so the error is never hidden with it", () => {
    const source = new ControlledSource(M1);
    mount(source);
    expect(pane().hidden).toBe(true);
    act(() => source.setStatus({ error: { kind: "mp", code: "SERVICE_UNAVAILABLE" } }));
    expect(pane().hidden).toBe(false);
    expect(shell().hasAttribute("data-pane")).toBe(false);
    expect(container.querySelector("[data-pane-openers]")).toBeNull();
    expect($(".confirm-error").textContent).toBe("The online service cannot be reached. Please try again shortly.");
    act(() => source.setStatus({ error: null }));
    expect(pane().hidden).toBe(true);
    expect(shell().getAttribute("data-pane")).toBe("hidden");
  });

  it("a clicked shortcut counts even when the click gives it no focus (WebKit)", () => {
    mount(new ControlledSource(M1));
    act(() => placeButton("glaze_load", "apprentice").click());
    expect(pane().hidden).toBe(false);
    pressClear();
    expect(pane().hidden).toBe(true);
    expect(document.activeElement).toBe(placeButton("glaze_load", "apprentice"));
  });

  it("scrolls the world (only) to the return target only when the focus ring shows (a keyboard player)", () => {
    mount(new ControlledSource(M1));
    const target = placeButton("canal_wharf", "shifu");
    const world = $<HTMLElement>("main.shell-world");
    const scrolled = vi.fn();
    world.scrollTo = scrolled as typeof world.scrollTo;
    const page = vi.spyOn(target, "scrollIntoView");
    const focus = vi.spyOn(target, "focus");
    let ring = false;
    const matches = target.matches.bind(target);
    target.matches = (selector: string) => (selector === ":focus-visible" ? ring : matches(selector));
    act(() => void focusTable(document, { preferred: target, scroll: "focus-visible" }));
    expect(document.activeElement).toBe(target);
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(scrolled).not.toHaveBeenCalled();
    ring = true;
    act(() => void focusTable(document, { preferred: target, scroll: "focus-visible" }));
    // An instant scroll of the world, even of 0px: it stops a jump's smooth scroll under way.
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled).toHaveBeenLastCalledWith({ top: 0, behavior: "instant" });
    ring = false;
    act(() => void focusTable(document, { preferred: target, scroll: true }));
    expect(scrolled).toHaveBeenCalledTimes(2);
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(page).not.toHaveBeenCalled();
  });

  it("after the player's own Clear the world always scrolls to the shortcut; at a new turn only with the focus ring", async () => {
    const source = new ControlledSource(M1);
    mount(source);
    const world = $<HTMLElement>("main.shell-world");
    const scrolled = vi.fn();
    world.scrollTo = scrolled as typeof world.scrollTo;
    // A pointer player: no focus ring anywhere.
    const original = Element.prototype.matches;
    let ring = false;
    const matches = vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
      return selector === ":focus-visible" ? ring : original.call(this, selector);
    });
    try {
      press(placeButton("canal_wharf", "shifu"));
      expect(scrolled).not.toHaveBeenCalled();
      pressClear();
      expect(document.activeElement).toBe(placeButton("canal_wharf", "shifu"));
      expect(scrolled).toHaveBeenCalledTimes(1);
      // Confirm, then a new turn: focus goes back to the table, and the view stays where it is.
      press(placeButton("canal_wharf", "shifu"));
      press($('[data-action="confirm"]'));
      await act(async () => source.answer({ view: nextTurn(fixture(M1).playerView) }));
      expect(pane().hidden).toBe(true);
      expect(document.activeElement).toBe(placeButton("canal_wharf", "shifu"));
      expect(scrolled).toHaveBeenCalledTimes(1);
      // The same with the focus ring (a keyboard player): the world shows the shortcut.
      ring = true;
      press(placeButton("canal_wharf", "shifu"));
      press($('[data-action="confirm"]'));
      await act(async () => source.answer({ view: nextTurn(nextTurn(fixture(M1).playerView)) }));
      expect(pane().hidden).toBe(true);
      expect(document.activeElement).toBe(placeButton("canal_wharf", "shifu"));
      expect(scrolled).toHaveBeenCalledTimes(2);
    } finally {
      matches.mockRestore();
    }
  });

  it("on phones a Place opens the sheet with the pane and focuses its heading", () => {
    const ui = mount(new ControlledSource(M1), <GameScreen />, "phone");
    expect(pane().hidden).toBe(true);
    press(placeButton("canal_wharf", "shifu"));
    expect(sheetOf(ui, M1)).toBe("open");
    expect(pane().hidden).toBe(false);
    expect($(".kit-sheet").getAttribute("data-sheet")).toBe("open");
    expect(document.activeElement).toBe(paneHeading());
  });

  it("the Guild Hall keeps taking the player to the Tech display, with the pane shown for Confirm; Clear returns to its Place, not the chooser", async () => {
    mount(new ControlledSource("m5_two_player_board_2p"));
    press(placeButton("guild_hall", "apprentice"));
    expect(pane().hidden).toBe(false);
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    expect(document.activeElement).toBe($("[data-tech-chooser]"));
    pressClear();
    expect(pane().hidden).toBe(true);
    expect(container.querySelector("[data-tech-chooser]")).toBeNull();
    expect(document.activeElement).toBe(placeButton("guild_hall", "apprentice"));
  });
});

describe("an ability that may come first opens the hidden pane", () => {
  it("its opener above the world shows the pane with the ability's form; the step's radios never hide it; Back to placing does, focus back on the opener", () => {
    mount(new ControlledSource(DING));
    expect(pane().hidden).toBe(true);
    const bar = $("[data-pane-openers]");
    expect(bar.getAttribute("aria-label")).toBe("Your decision");
    expect($("[data-pane-openers] .pane-openers-lead").textContent).toMatch(/^Your turn: place a worker · \d left$/);
    const group = $('[data-pane-openers] [role="group"]');
    expect(document.getElementById(group.getAttribute("aria-labelledby") ?? "")?.textContent).toBe("Or first:");
    press($('[data-pane-opener="imperial_priority"]'));
    expect(pane().hidden).toBe(false);
    expect(container.querySelector("[data-pane-openers]")).toBeNull();
    expect(document.activeElement).toBe(paneHeading());
    // The heading (and the phone sheet strip) says what the pane shows, never "Place a worker"
    // beside "Back to placing a worker".
    expect(paneHeading().textContent).toBe("Before your worker action");
    expect($(".pane-strip-title").textContent).toBe("Before your worker action");
    expect($<HTMLInputElement>('input[name="mode"][value="imperial_priority"]').checked).toBe(true);
    expect(container.querySelector('[data-b4="action-window"][data-source="before_action"]')).not.toBeNull();
    // Nothing placed: the step's radios are the abilities only (arrow keys select as they move,
    // and none of them empties the pane).
    expect([...pane().querySelectorAll<HTMLInputElement>('input[name="mode"]')].map((input) => input.value)).toEqual(["imperial_priority", "canal_barge"]);
    press($('input[name="mode"][value="canal_barge"]'));
    expect(pane().hidden).toBe(false);
    expect(document.activeElement).toBe($('input[name="mode"][value="canal_barge"]'));
    press($('input[name="mode"][value="imperial_priority"]'));
    expect(pane().hidden).toBe(false);
    // The way back to placing is a separate button: it hides the pane, and focus returns to the opener used.
    const back = $<HTMLButtonElement>('[data-b4="back-to-placing"]');
    expect(back.textContent).toBe("Back to placing a worker");
    press(back);
    expect(pane().hidden).toBe(true);
    expect(document.activeElement).toBe($('[data-pane-opener="imperial_priority"]'));
    expect(paneHeading().textContent).toBe("Place a worker");
  });

  it("the only ability that may come first opens with no lone radio: the heading names it", () => {
    mount(new ControlledSource(RICH));
    expect([...container.querySelectorAll("[data-pane-opener]")].map((opener) => opener.getAttribute("data-pane-opener"))).toEqual(["canal_barge"]);
    press($('[data-pane-opener="canal_barge"]'));
    expect(pane().hidden).toBe(false);
    expect(document.activeElement).toBe(paneHeading());
    expect(paneHeading().textContent).toBe("Canal Barge");
    expect($(".pane-strip-title").textContent).toBe("Canal Barge");
    // No "This step" group with a single checked radio; the form and the way back are there.
    expect(pane().querySelector('input[name="mode"]')).toBeNull();
    expect(pane().textContent).not.toContain("This step");
    expect(container.querySelector('[data-b4="action-window"][data-source="before_action"] [data-form="canal-barge"]')).not.toBeNull();
    press($('[data-b4="back-to-placing"]'));
    expect(pane().hidden).toBe(true);
    expect(document.activeElement).toBe($('[data-pane-opener="canal_barge"]'));
    // With a placement chosen there is a real choice again, under the placing heading.
    press(placeButton("canal_wharf", "shifu"));
    expect(paneHeading().textContent).toBe("Place a worker");
    expect([...pane().querySelectorAll<HTMLInputElement>('input[name="mode"]')].map((input) => input.value)).toEqual(["place", "canal_barge"]);
    press($('input[name="mode"][value="canal_barge"]'));
    expect(paneHeading().textContent).toBe("Before your worker action");
    press($('input[name="mode"][value="place"]'));
    expect(paneHeading().textContent).toBe("Place a worker");
  });

  it("names the open ability in Chinese too, in the heading and the phone sheet strip", () => {
    const { model, engine, initial } = workOf(RICH);
    const barge = workDraft.reduce(initial, { type: "mode", mode: "canal_barge" }, model, engine);
    const html = renderScreen(fixtureSource(RICH), { locale: "zh-CN", draft: barge, layoutMode: "phone" });
    expect(html).toMatch(/<h2[^>]*class="pane-heading"[^>]*>漕船<\/h2>/);
    expect(html).toMatch(/<span class="pane-strip-title">漕船<\/span>/);
    expect(html).not.toContain('name="mode"');
    expect(html).toMatch(/data-b4="back-to-placing"[^>]*>返回派工</);
    const ding = workOf(DING);
    const ability = workDraft.reduce(ding.initial, { type: "mode", mode: "canal_barge" }, ding.model, ding.engine);
    const zh = renderScreen(fixtureSource(DING), { locale: "zh-CN", draft: ability, layoutMode: "phone" });
    expect(zh).toMatch(/<h2[^>]*class="pane-heading"[^>]*>工人行动之前<\/h2>/);
    expect(zh).toMatch(/<span class="pane-strip-title">工人行动之前<\/span>/);
  });

  it("with a placement chosen, Place a worker is one of the step's radios and an ability keeps the placement", () => {
    mount(new ControlledSource(DING));
    press(placeButton("canal_wharf", "shifu"));
    expect([...pane().querySelectorAll<HTMLInputElement>('input[name="mode"]')].map((input) => input.value)).toEqual(["place", "imperial_priority", "canal_barge"]);
    press($('input[name="mode"][value="imperial_priority"]'));
    expect(pane().hidden).toBe(false);
    expect(container.querySelector('[data-b4="back-to-placing"]')).toBeNull();
    press($('input[name="mode"][value="place"]'));
    expect(pane().hidden).toBe(false);
    expect($('[data-b4="chosen"]').getAttribute("data-location-id")).toBe("canal_wharf");
  });

  it("on phones the opener opens the sheet", () => {
    const ui = mount(new ControlledSource(DING), <GameScreen />, "phone");
    press($('[data-pane-opener="canal_barge"]'));
    expect(sheetOf(ui, DING)).toBe("open");
    expect(pane().hidden).toBe(false);
    expect($<HTMLInputElement>('input[name="mode"][value="canal_barge"]').checked).toBe(true);
    expect(document.activeElement).toBe(paneHeading());
  });
});
