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
 * is the viewer's turn, what to do and how many workers are left, followed by the "Free actions"
 * chips (owner UI decision D21), generic over the openers the window names. Focus goes back to the placement control the player used (found again when it was
 * drawn anew); the world scrolls to it after the player's own Clear, and at a new turn only for a
 * keyboard player.
 */
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TECHS, freeActionOptions } from "../../../../src/game/index.ts";
import type { LocationId, PlayerView } from "../../../../src/game/index.ts";
import { freeActionItems } from "../../../../src/app/decision/freeActions.ts";
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
const DING = "w-before-the-worker-action-colour-samples-swap-imperial-priority-with-reworking-table-ding";
/** The Colour Samples swap is the only ability that may come before the worker action here
 * (DING after its Imperial Priority token was spent; a derived test fixture). */
const SWAP_ONLY = "d-colour-samples-swap-only";
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

  it("names a chip per thing the viewer can do right now, in D21's order, from the selectors", () => {
    const ding = workOf(DING);
    const presence = workPane(ding.initial, ding.model, ding.engine);
    if (!presence.hidden) throw new Error("shown");
    // One per item of the free-action list: Deliver per completable held Order, Sell, Imperial Priority, the swap.
    const options = workDraft.options(ding.initial, ding.model, ding.engine);
    expect(presence.openers.map((opener) => opener.key)).toEqual(options.freeActions.map((item) => item.key));
    const completable = freeActionOptions(ding.engine.view)?.completableOrderIds ?? [];
    expect(completable).toEqual(["O01", "S01"]);
    expect(presence.openers.map((opener) => opener.key)).toEqual(["complete-O01", "complete-S01", "imperial_priority", "colour_samples_swap"]);
    expect(presence.openers.map((opener) => opener.action)).toEqual([
      { type: "freeAction", key: "complete-O01" },
      { type: "freeAction", key: "complete-S01" },
      { type: "freeAction", key: "imperial_priority" },
      { type: "freeAction", key: "colour_samples_swap" },
    ]);
    expect(presence.openers.map((opener) => EN.message(opener.label as RichMessage))).toEqual(["Deliver O01", "Deliver S01", "Imperial Priority", "Colour Samples swap"]);
    expect(presence.openers.map((opener) => ZH.message(opener.label as RichMessage))).toEqual(["交付O01", "交付S01", "御烧优先", "色样簿换单"]);
    // The cue says whose turn it is, what to do and how many workers are left; the label names the chips.
    const left = options.workersLeft;
    expect(left).toBeGreaterThan(0);
    expect(EN.message(presence.lead as RichMessage)).toBe(`Your turn: place a worker · ${String(left)} left`);
    expect(ZH.message(presence.lead as RichMessage)).toBe(`轮到你了：派工 · 还剩${String(left)}名工人`);
    expect(EN.richMessage(presence.openersLabel as RichMessage)).toBe("Free actions");
    expect(ZH.richMessage(presence.openersLabel as RichMessage)).toBe("自由行动");
    // A Flawed ceramic may be sold first (a free action, change 36): a chip of its own, not a worker action.
    const sale = workOf("t-work-turn-sale");
    const selling = workPane(sale.initial, sale.model, sale.engine);
    if (!selling.hidden) throw new Error("shown");
    expect(selling.openers.map((opener) => opener.key)).toContain("sell_flawed");
    const sellOpener = selling.openers.find((opener) => opener.key === "sell_flawed")!;
    expect(sellOpener.action).toEqual({ type: "freeAction", key: "sell_flawed" });
    expect(EN.message(sellOpener.label as RichMessage)).toBe("Sell Flawed (+2 Coins)");
    expect(ZH.message(sellOpener.label as RichMessage)).toBe("卖出瑕品（+2铜钱）");
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

  it("Canal Barge, owned and ready, has no opener: it pays its Coins on a completion, whichever window (rev. 5 L637)", () => {
    const view = structuredClone(fixture(DING).playerView);
    const me = view.game.players[view.viewerId!]!;
    if (me.techs.some((tech) => tech.id === "T23")) throw new Error("fixture changed");
    me.techs = [...me.techs.filter((tech) => TECHS[tech.id].discipline !== "glazing_loading"), { id: "T23", acquiredInRound: 1, usedThisRound: false }];
    const model = buildGameModel(view, []);
    const engine = engineViewOf(view);
    const initial = workDraft.initial(model, engine);
    const presence = workPane(initial, model, engine);
    if (!presence.hidden) throw new Error("shown");
    expect(presence.openers.map((opener) => opener.key)).toEqual(["complete-O01", "complete-S01", "imperial_priority"]);
    expect(workDraft.options(initial, model, engine).modes.map((option) => option.mode)).toEqual(["place", "complete_order", "imperial_priority"]);
  });
});

describe("an action's form before the worker action (heading, backToPlacing; D21: no step choice)", () => {
  const steps = (draft: WorkDraft, id: string) => {
    const { model, engine } = workOf(id);
    const options = workDraft.options(draft, model, engine);
    return { heading: options.heading, back: options.backToPlacing };
  };
  /** The work window's heading (and phone sheet strip) for a draft, in English and Chinese. */
  const titles = (draft: WorkDraft, id: string) => {
    const { model, engine } = workOf(id);
    const title = WINDOWS.work.title(model, engine, draft) as RichMessage;
    return [EN.message(title), ZH.message(title)];
  };

  it("the heading names the action whose form is open, and going back returns to a placement kept meanwhile", () => {
    const { model, engine, initial } = workOf(DING);
    // Nothing chosen (the pane is hidden): placing a worker.
    expect(steps(initial, DING)).toEqual({ heading: "place", back: false });
    expect(titles(initial, DING)).toEqual(["Place a worker", "派工"]);
    // A chip: the action's form, under its own name.
    const ability = workDraft.reduce(initial, { type: "freeAction", key: "imperial_priority" }, model, engine);
    expect(steps(ability, DING)).toEqual({ heading: "imperial_priority", back: true });
    expect(titles(ability, DING)).toEqual(["Imperial Priority", "御烧优先"]);
    expect(workPane(ability, model, engine).hidden).toBe(false);
    const deliver = workDraft.reduce(initial, { type: "freeAction", key: "complete-O01" }, model, engine);
    expect(steps(deliver, DING)).toEqual({ heading: "complete_order", back: true });
    expect(titles(deliver, DING)).toEqual(["Deliver O01", "交付O01"]);
    // A placement chosen stays while a piece's own button opens a form, and going back returns to it.
    const chosen = placed(DING, "canal_wharf", "shifu");
    expect(steps(chosen, DING)).toEqual({ heading: "place", back: false });
    expect(titles(chosen, DING)).toEqual(["Place a worker", "派工"]);
    const both = workDraft.reduce(chosen, { type: "freeAction", key: "colour_samples_swap" }, model, engine);
    expect(steps(both, DING)).toEqual({ heading: "colour_samples_swap", back: true });
    expect(workDraft.options(workDraft.reduce(both, { type: "mode", mode: "place" }, model, engine), model, engine).active?.locationId).toBe("canal_wharf");
  });

  it("the only thing that may come first is a chip like any other", () => {
    const { model, engine, initial } = workOf(SWAP_ONLY);
    expect(workDraft.options(initial, model, engine).modes.map((option) => option.mode)).toEqual(["place", "colour_samples_swap"]);
    expect(steps(initial, SWAP_ONLY)).toEqual({ heading: "place", back: false });
    const swap = workDraft.reduce(initial, { type: "freeAction", key: "colour_samples_swap" }, model, engine);
    expect(steps(swap, SWAP_ONLY)).toEqual({ heading: "colour_samples_swap", back: true });
    expect(titles(swap, SWAP_ONLY)).toEqual(["Colour Samples swap", "色样簿换单"]);
    expect(workPane(swap, model, engine).hidden).toBe(false);
  });

  it("after the worker action the heading says so and there is no way back", () => {
    expect(steps(placed(M1, "canal_wharf", "apprentice"), M1)).toEqual({ heading: "place", back: false });
    const after = workOf("w-after-the-worker-action");
    expect(workDraft.options(after.initial, after.model, after.engine)).toMatchObject({ heading: "after_action", backToPlacing: false });
    expect(titles(after.initial, "w-after-the-worker-action")).toEqual(["After your worker action", "工人行动之后"]);
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
      /<p class="pane-openers-lead" tabindex="-1" data-focus-heading="">Your turn: place a worker · \d left<\/p><div class="pane-openers-row" role="group" aria-labelledby="([^"]+)"><span id="\1" class="pane-openers-label">Free actions<\/span><button/,
    );
    expect([...bar.matchAll(/data-pane-opener="([^"]+)"[^>]*>([^<]+)</g)].map((match) => [match[1], match[2]])).toEqual([
      ["complete-O01", "Deliver O01"],
      ["complete-S01", "Deliver S01"],
      ["imperial_priority", "Imperial Priority"],
      ["colour_samples_swap", "Colour Samples swap"],
    ]);
    expect(html.indexOf("pane-openers")).toBeLessThan(html.indexOf("<main"));
    const zh = renderScreen(fixtureSource(DING), { locale: "zh-CN" });
    expect(zh).toContain('<section class="pane-openers" aria-label="你的决断"');
    expect(zh).toMatch(/>轮到你了：派工 · 还剩\d名工人<\/p>/);
    expect(zh).toContain('<span id="' + /<span id="([^"]+)" class="pane-openers-label">/.exec(zh)?.[1] + '" class="pane-openers-label">自由行动</span>');
    expect(zh).toMatch(/data-pane-opener="imperial_priority"[^>]*>御烧优先</);
  });

  it("keeps the pane in every other window, and once a placement is chosen", () => {
    for (const id of ["w-kiln-and-main-order-choice", "w-after-the-worker-action", "m17_after_action", "w-setters-mark-window", "m9_contributions_step1_3p", "m8_final_results_3p"]) {
      const html = renderScreen(fixtureSource(id));
      expect(html, id).not.toContain('data-pane="hidden"');
      expect(html, id).not.toMatch(/<aside class="pane"[^>]*hidden=""/);
    }
    const html = renderScreen(fixtureSource(M1), { draft: placed(M1, "canal_wharf", "apprentice") });
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
    press(placeButton("canal_wharf", "apprentice"));
    expect(pane().hidden).toBe(false);
    expect(shell().hasAttribute("data-pane")).toBe(false);
    expect(document.activeElement).toBe(paneHeading());
    expect($('[data-b4="chosen"]').getAttribute("data-location-id")).toBe("canal_wharf");
    // Another Place while the pane shows: the choice changes, focus stays on the table.
    press(placeButton("commission_market", "apprentice"));
    expect($('[data-b4="chosen"]').getAttribute("data-location-id")).toBe("commission_market");
    expect(document.activeElement).toBe(placeButton("commission_market", "apprentice"));
    // Into the pane, then Clear: back to placing.
    const clear = [...pane().querySelectorAll<HTMLButtonElement>(".confirm-buttons button")].find((button) => button.textContent === "Clear");
    if (clear === undefined) throw new Error("no Clear");
    press(clear);
    expect(pane().hidden).toBe(true);
    expect(shell().getAttribute("data-pane")).toBe("hidden");
    expect(document.activeElement).toBe(placeButton("commission_market", "apprentice"));
    expect(placeButton("commission_market", "apprentice").getAttribute("aria-pressed")).toBe("false");
  });

  it("after Confirm, a new turn of the viewer's hides the pane again and focus goes back to the table", async () => {
    const source = new ControlledSource(M1);
    mount(source);
    press(placeButton("canal_wharf", "apprentice"));
    press($('[data-action="confirm"]'));
    expect(source.submitted).toHaveLength(1);
    expect(document.activeElement).toBe($('[data-action="confirm"]'));
    await act(async () => source.answer({ view: nextTurn(fixture(M1).playerView) }));
    expect(pane().hidden).toBe(true);
    expect(document.activeElement).toBe(placeButton("canal_wharf", "apprentice"));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("after another player's turn redrew the shortcuts, finds the one used again by its data attributes", async () => {
    const source = new ControlledSource(M1);
    mount(source);
    const used = placeButton("canal_wharf", "apprentice");
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
    expect(document.activeElement).toBe(placeButton("canal_wharf", "apprentice"));
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
    const target = placeButton("canal_wharf", "apprentice");
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
      press(placeButton("canal_wharf", "apprentice"));
      expect(scrolled).not.toHaveBeenCalled();
      pressClear();
      expect(document.activeElement).toBe(placeButton("canal_wharf", "apprentice"));
      expect(scrolled).toHaveBeenCalledTimes(1);
      // Confirm, then a new turn: focus goes back to the table, and the view stays where it is.
      press(placeButton("canal_wharf", "apprentice"));
      press($('[data-action="confirm"]'));
      await act(async () => source.answer({ view: nextTurn(fixture(M1).playerView) }));
      expect(pane().hidden).toBe(true);
      expect(document.activeElement).toBe(placeButton("canal_wharf", "apprentice"));
      expect(scrolled).toHaveBeenCalledTimes(1);
      // The same with the focus ring (a keyboard player): the world shows the shortcut.
      ring = true;
      press(placeButton("canal_wharf", "apprentice"));
      press($('[data-action="confirm"]'));
      await act(async () => source.answer({ view: nextTurn(nextTurn(fixture(M1).playerView)) }));
      expect(pane().hidden).toBe(true);
      expect(document.activeElement).toBe(placeButton("canal_wharf", "apprentice"));
      expect(scrolled).toHaveBeenCalledTimes(2);
    } finally {
      matches.mockRestore();
    }
  });

  it("on phones a Place opens the sheet with the pane and focuses its heading", () => {
    const ui = mount(new ControlledSource(M1), <GameScreen />, "phone");
    expect(pane().hidden).toBe(true);
    press(placeButton("canal_wharf", "apprentice"));
    expect(sheetOf(ui, M1)).toBe("open");
    expect(pane().hidden).toBe(false);
    expect($(".kit-sheet").getAttribute("data-sheet")).toBe("open");
    expect(document.activeElement).toBe(paneHeading());
  });

  it("the Guild Hall keeps taking the player to the Tech display, with the pane shown for Confirm; Clear returns to its Place, not the chooser", async () => {
    mount(new ControlledSource("w-before-the-worker-action-kiln-furniture-inverted-firing-targets-setters-marks-senior-apprentice"));
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

describe("a chip or a piece's own button opens the hidden pane (D21)", () => {
  it("a chip shows the pane with that action's form; Back to placing hides it, focus back on the chip", () => {
    mount(new ControlledSource(DING));
    expect(pane().hidden).toBe(true);
    const bar = $("[data-pane-openers]");
    expect(bar.getAttribute("aria-label")).toBe("Your decision");
    expect($("[data-pane-openers] .pane-openers-lead").textContent).toMatch(/^Your turn: place a worker · \d left$/);
    const group = $('[data-pane-openers] [role="group"]');
    expect(document.getElementById(group.getAttribute("aria-labelledby") ?? "")?.textContent).toBe("Free actions");
    press($('[data-pane-opener="imperial_priority"]'));
    expect(pane().hidden).toBe(false);
    expect(container.querySelector("[data-pane-openers]")).toBeNull();
    expect(document.activeElement).toBe(paneHeading());
    // The heading (and the phone sheet strip) says what the pane shows, never "Place a worker"
    // beside "Back to placing a worker".
    expect(paneHeading().textContent).toBe("Imperial Priority");
    expect($(".pane-strip-title").textContent).toBe("Imperial Priority");
    expect(container.querySelector('[data-b4="action-window"][data-source="before_action"] [data-b4="imperial-priority"]')).not.toBeNull();
    // No choice of step any more: the mode cards are gone (D21).
    expect(pane().querySelector('input[name="mode"]')).toBeNull();
    expect(pane().querySelector('input[name="freeAction"]')).toBeNull();
    const back = $<HTMLButtonElement>('[data-b4="back-to-placing"]');
    expect(back.textContent).toBe("Back to placing a worker");
    press(back);
    expect(pane().hidden).toBe(true);
    expect(document.activeElement).toBe($('[data-pane-opener="imperial_priority"]'));
    expect(paneHeading().textContent).toBe("Place a worker");
  });

  it("nothing has to be dismissed: with a form open, placing a worker on the table moves on", () => {
    mount(new ControlledSource(DING));
    press($('[data-pane-opener="imperial_priority"]'));
    press(placeButton("canal_wharf", "shifu"));
    expect(paneHeading().textContent).toBe("Place a worker");
    expect($('[data-b4="chosen"]').getAttribute("data-location-id")).toBe("canal_wharf");
    expect(container.querySelector('[data-b4="back-to-placing"]')).toBeNull();
  });

  it("after a free action's Confirm the pane hides again for placing, in the same turn", async () => {
    const source = new ControlledSource(DING);
    mount(source);
    press($('[data-pane-opener="complete-O01"]'));
    press($('[data-action="confirm"]'));
    const command = source.submitted[0] as { type: string; endTurn?: boolean };
    expect(command.type).toBe("COMPLETE_ORDER");
    // Before placing the turn cannot end: a plain Confirm, no field and no split (L165).
    expect(command).not.toHaveProperty("endTurn");
    expect(container.querySelector('[data-action="confirm-stay"]')).toBeNull();
    const view = fixture(DING).playerView;
    await act(async () => source.answer({ view: { ...view, game: { ...view.game, revision: view.game.revision + 1 } } }));
    expect(pane().hidden).toBe(true);
    expect(container.querySelector("[data-pane-openers]")).not.toBeNull();
  });

  it("on a phone, a free action's Confirm from the Orders tab goes back to the Table tab, where the worker is placed (D20, D21)", async () => {
    const source = new ControlledSource(DING);
    const ui = mount(source, <GameScreen />, "phone");
    const sectionNow = () => ui.stateFor({ window: buildGameModel(fixture(DING).playerView, []).window, phase: "work" }).section;
    act(() => ui.actions.setSection("orders"));
    press($('.ord--own[data-order-id="O01"] [data-act="order"]'));
    expect(pane().hidden).toBe(false);
    expect(sectionNow()).toBe("orders");
    press($('[data-action="confirm"]'));
    const view = fixture(DING).playerView;
    await act(async () => source.answer({ view: { ...view, game: { ...view.game, revision: view.game.revision + 1 } } }));
    expect(pane().hidden).toBe(true);
    expect(sectionNow()).toBe("table");
    expect(container.querySelector('[data-section][data-current] [data-act="place"]')).not.toBeNull();
  });

  it("on a phone, Clear from the Orders tab goes back to the Table tab", () => {
    const ui = mount(new ControlledSource(DING), <GameScreen />, "phone");
    const sectionNow = () => ui.stateFor({ window: buildGameModel(fixture(DING).playerView, []).window, phase: "work" }).section;
    act(() => ui.actions.setSection("orders"));
    press($('.ord--own[data-order-id="O01"] [data-act="order"]'));
    pressClear();
    expect(pane().hidden).toBe(true);
    expect(sectionNow()).toBe("table");
  });

  it("on a phone, Clear keeps a section that has Place shortcuts of its own, and the desktop never switches", () => {
    const ui = mount(new ControlledSource(M1), <GameScreen />, "phone");
    const sectionNow = () => ui.stateFor({ window: buildGameModel(fixture(M1).playerView, []).window, phase: "work" }).section;
    act(() => ui.actions.setSection("workshop"));
    press($('[data-section][data-current] [data-act="place"]'));
    expect(pane().hidden).toBe(false);
    pressClear();
    expect(pane().hidden).toBe(true);
    expect(sectionNow()).toBe("workshop");
    act(() => root.unmount());
    root = createRoot(container);
    const desktop = mount(new ControlledSource(DING));
    act(() => desktop.actions.setSection("orders"));
    press($('.ord--own[data-order-id="O01"] [data-act="order"]'));
    pressClear();
    expect(desktop.stateFor({ window: buildGameModel(fixture(DING).playerView, []).window, phase: "work" }).section).toBe("orders");
  });

  it("on a phone the after-action step opens with its sheet open: the player has just asked for it (D21)", () => {
    const id = "t-after-action-free-actions";
    mount(new ControlledSource(id), <GameScreen />, "phone");
    expect(pane().hidden).toBe(false);
    expect($(".kit-sheet").getAttribute("data-sheet")).toBe("open");
    expect($<HTMLButtonElement>(".kit-sheet-strip").getAttribute("aria-expanded")).toBe("true");
  });

  it("names the open action in Chinese too, in the heading and the phone sheet strip", () => {
    const { model, engine, initial } = workOf(SWAP_ONLY);
    const swap = workDraft.reduce(initial, { type: "freeAction", key: "colour_samples_swap" }, model, engine);
    const html = renderScreen(fixtureSource(SWAP_ONLY), { locale: "zh-CN", draft: swap, layoutMode: "phone" });
    expect(html).toMatch(/<h2[^>]*class="pane-heading"[^>]*>色样簿换单<\/h2>/);
    expect(html).toMatch(/<span class="pane-strip-title">色样簿换单<\/span>/);
    expect(html).not.toContain('name="mode"');
    expect(html).toMatch(/data-b4="back-to-placing"[^>]*>返回派工</);
  });

  it("a table Sell button brings the pane up with the sale (on phones the sheet opens), and Clear returns focus to it (D14, a free action)", () => {
    const SALE = "t-work-turn-sale";
    const ui = mount(new ControlledSource(SALE), <GameScreen />, "phone");
    expect(pane().hidden).toBe(true);
    expect(sheetOf(ui, SALE)).not.toBe("open");
    const sell = $<HTMLButtonElement>('button[data-act="sell"]');
    press(sell);
    expect(sheetOf(ui, SALE)).toBe("open");
    expect(pane().hidden).toBe(false);
    expect($(".kit-sheet").getAttribute("data-sheet")).toBe("open");
    expect($<HTMLInputElement>(`input[name="work.sell"][value="${sell.getAttribute("data-ceramic-id") ?? ""}"]`).checked).toBe(true);
    // Desktop: Clear hides the pane again and focus goes back to the Sell button.
    act(() => root.unmount());
    root = createRoot(container);
    mount(new ControlledSource(SALE));
    const button = $<HTMLButtonElement>('button[data-act="sell"]');
    press(button);
    expect(pane().hidden).toBe(false);
    pressClear();
    expect(pane().hidden).toBe(true);
    expect(document.activeElement).toBe($<HTMLButtonElement>(`button[data-act="sell"][data-ceramic-id="${button.getAttribute("data-ceramic-id") ?? ""}"]`));
  });

  it("a Sell chip with one Flawed ceramic has it chosen already: chip + Confirm", () => {
    const source = new ControlledSource("t-work-turn-sale");
    mount(source);
    press($('[data-pane-opener="sell_flawed"]'));
    expect(paneHeading().textContent).toBe("Sell a Flawed ceramic");
    press($('[data-action="confirm"]'));
    expect(source.submitted.map((command) => command.type)).toEqual(["SELL_FLAWED"]);
  });

  it("a Deliver badge on a completable Order in the hand brings the pane up with its completion (on phones the sheet opens), and Clear returns focus to it (a free action, change 36)", () => {
    const ui = mount(new ControlledSource(DING), <GameScreen />, "phone");
    expect(pane().hidden).toBe(true);
    const toggle = () => $<HTMLButtonElement>('.ord--own[data-order-id="O01"] [data-act="order"]');
    expect(toggle().textContent).toContain("Deliver");
    press(toggle());
    expect(sheetOf(ui, DING)).toBe("open");
    expect(pane().hidden).toBe(false);
    expect(paneHeading().textContent).toBe("Deliver O01");
    // Desktop: Clear hides the pane again and focus goes back to the Order's toggle.
    act(() => root.unmount());
    root = createRoot(container);
    mount(new ControlledSource(DING));
    press(toggle());
    expect(pane().hidden).toBe(false);
    pressClear();
    expect(pane().hidden).toBe(true);
    expect(document.activeElement).toBe(toggle());
  });

  it("Use on the Imperial Priority token opens the same form as its chip, on the viewer's own board only (on phones the sheet opens)", () => {
    const ui = mount(new ControlledSource(DING), <GameScreen />, "phone");
    const uses = container.querySelectorAll<HTMLButtonElement>('[data-act="imperial-priority"]');
    expect(uses).toHaveLength(1);
    const use = uses[0]!;
    expect(use.textContent).toBe("Use");
    expect(use.getAttribute("aria-label")).toBe("Use: Imperial Priority token");
    expect(use.closest("[data-player-id]")?.getAttribute("data-player-id")).toBe(fixture(DING).playerView.viewerId);
    press(use);
    expect(sheetOf(ui, DING)).toBe("open");
    expect(paneHeading().textContent).toBe("Imperial Priority");
    expect(container.querySelector('[data-b4="imperial-priority"]')).not.toBeNull();
    // Desktop: Back to placing returns focus to the token's button.
    act(() => root.unmount());
    root = createRoot(container);
    mount(new ControlledSource(DING));
    press($('[data-act="imperial-priority"]'));
    press($('[data-b4="back-to-placing"]'));
    expect(pane().hidden).toBe(true);
    expect(document.activeElement).toBe($('[data-act="imperial-priority"]'));
  });

  it("a Deliver chip brings the pane up with that Order chosen, and focus returns to it when the pane hides", () => {
    mount(new ControlledSource(DING));
    press($('[data-pane-opener="complete-O01"]'));
    expect(pane().hidden).toBe(false);
    expect(document.activeElement).toBe(paneHeading());
    expect(paneHeading().textContent).toBe("Deliver O01");
    expect($('[data-b4="action-window"] .dw-sec-heading').textContent).toBe("O01");
    press($('[data-b4="back-to-placing"]'));
    expect(pane().hidden).toBe(true);
    expect(document.activeElement).toBe($('[data-pane-opener="complete-O01"]'));
  });

  it("on phones a chip opens the sheet", () => {
    const ui = mount(new ControlledSource(DING), <GameScreen />, "phone");
    press($('[data-pane-opener="colour_samples_swap"]'));
    expect(sheetOf(ui, DING)).toBe("open");
    expect(pane().hidden).toBe(false);
    expect(paneHeading().textContent).toBe("Colour Samples swap");
    expect(document.activeElement).toBe(paneHeading());
  });

  it("no chips on another player's turn or outside the work turn: the pane is not hidden, and the selector lists nothing", () => {
    for (const id of ["m9_contributions_step1_3p", "m4_after_quality_3p", "m7_cleanup_hand_limit_3p", "m6_order_phase_crackle_3p", "t-imperial-priority-carried", "w-after-the-worker-action"]) {
      const html = renderScreen(fixtureSource(id));
      expect(html, id).not.toContain("data-pane-opener");
    }
    // Not the viewer's turn, the firing, Cleanup: no free-action window at all.
    for (const id of ["m9_contributions_step1_3p", "m4_after_quality_3p", "m7_cleanup_hand_limit_3p", "t-imperial-priority-carried"]) {
      expect(freeActionItems(engineViewOf(fixture(id).playerView)), id).toEqual([]);
    }
  });
});
