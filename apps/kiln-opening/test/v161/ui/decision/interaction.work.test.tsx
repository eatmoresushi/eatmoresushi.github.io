// @vitest-environment happy-dom
/**
 * B4's interaction tier (UI_V1.6.1_ARCHITECTURE §8.1, §9.3): what static markup cannot show.
 * Owner: B4.
 * - Workers are placed on the table (owner review, 2026-10-17): a Place shortcut on a location
 *   card or on the viewer's own personal space chooses worker and location at once and opens the
 *   chosen placement's sub-editor in the pane; Confirm sends the placement. Illegal entries have
 *   no shortcut.
 * - The pane is hidden until a placement is chosen (owner review, 2026-10-17); its focus moves
 *   and openers are tested in `hidden_pane.test.tsx`.
 * - Moving between locations keeps each location's sub-draft (§3.5 `perLocation`).
 * - The Guild Hall: placing there takes the player to the Tech display (scroll on desktop, the
 *   section and a collapsed sheet on phones; focus on the chooser's prompt), where a face-up Tech
 *   (Apprentice) or a discipline's deck (Shifu) is chosen; a Tech the worker cannot buy is
 *   focusable but cannot be chosen, with its reason.
 * - A language switch keeps the draft and re-renders the ConfirmBar sentence.
 * - The Guild Hall inspection (v1.6.2 L237): one take per Confirm; after a take, stopping with the
 *   bottom order set by Move up / Move down, then Confirm (§8.1); a single untaken Tech is named,
 *   not ordered. The face-up Techs may be chosen on the Tech display for either take (D14), and a
 *   refused take shows the engine's reason in words.
 * - The Colour Samples swap (v1.6.2 L632): after the action, the held Order to give up, chosen
 *   in the pane or on the hand row; Confirm sends the swap.
 * - Kiln selection: no Full rules button; a Kiln another player took is focusable but cannot be
 *   chosen.
 */
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guildInspectionOptions, guildOptions } from "../../../../src/game/index.ts";
import { PersonalSpaces } from "../../../../src/app/boards/PersonalSpaces.tsx";
import { DecisionPane } from "../../../../src/app/decision/DecisionPane.tsx";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { I18nProvider } from "../../../../src/app/i18n/I18nProvider.tsx";
import { disciplineName, techText } from "../../../../src/app/i18n/content.ts";
import { LanguageToggle } from "../../../../src/app/kit/LanguageToggle.tsx";
import { DraftStore } from "../../../../src/app/state/draftStore.ts";
import { GameProvider, useGame } from "../../../../src/app/state/hooks.ts";
import { fixedLayoutSource } from "../../../../src/app/state/layoutMode.ts";
import type { LayoutMode } from "../../../../src/app/state/layoutMode.ts";
import { UiStore } from "../../../../src/app/state/uiStore.ts";
import type { UiContext, UiEffects, WorldSectionId } from "../../../../src/app/state/uiStore.ts";
import { decisionWindow } from "../../../../src/app/state/decisionWindow.ts";
import { buildGameModel } from "../../../../src/app/state/model.ts";
import { CentralBoard } from "../../../../src/app/table/CentralBoard.tsx";
import { TechDisplay } from "../../../../src/app/table/TechDisplay.tsx";
import { ControlledSource } from "../support/controlledSource.ts";
import { fixture } from "../support/fixtures.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  // React reports invalid nesting (a control inside a label), missing keys and the like here.
  expect(consoleErrors).toEqual([]);
});

interface Mounted {
  ui: UiStore;
  scrolled: WorldSectionId[];
}

function mount(source: ControlledSource, element: ReactElement, layoutMode: LayoutMode = "desktop"): Mounted {
  const layout = fixedLayoutSource(layoutMode);
  const scrolled: WorldSectionId[] = [];
  const effects: UiEffects = { scrollToSection: (section) => scrolled.push(section), applyTheme: () => undefined, storeTheme: () => undefined };
  const ui = new UiStore({ layout, effects });
  act(() =>
    root.render(
      <I18nProvider defaultLocale="en" strict>
        <GameProvider source={source} registry={WINDOWS} drafts={new DraftStore()} ui={ui} layout={layout} devTools={false}>
          {element}
        </GameProvider>
      </I18nProvider>,
    ),
  );
  return { ui, scrolled };
}

/** The viewer's own Form & Decorate and Glaze & Load spaces (their board's personal locations). */
function OwnSpaces() {
  const model = useGame();
  return model.viewerId === null ? null : <PersonalSpaces playerId={model.viewerId} />;
}

/** The table a work turn is played on: the central locations, the Tech display and the viewer's spaces, beside the pane. */
function Table() {
  return (
    <>
      <CentralBoard />
      <OwnSpaces />
      <TechDisplay />
      <DecisionPane />
    </>
  );
}

/** The UI store's window context for a fixture (its open window and round phase). */
function fixtureWindow(id: string): UiContext {
  const view = fixture(id).playerView;
  return { window: decisionWindow(view), phase: buildGameModel(view, []).roundPhase };
}

/** Waits for the next animation frame (the Guild Hall's focus move). */
async function nextFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

const $ = <E extends Element = HTMLElement>(selector: string): E => {
  const found = container.querySelector<E>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
};

function click(target: Element): void {
  act(() => {
    (target as HTMLElement).click();
  });
}

const radio = (name: string, value: string) => $<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
const summary = () => $(".confirm-summary").textContent;
const placeButton = (locationId: string, worker: string) => $<HTMLButtonElement>(`button[data-act="place"][data-location-id="${locationId}"][data-worker="${worker}"]`);
const chosen = () => container.querySelector<HTMLElement>('[data-b4="chosen"]');

/** The worker entry ID the engine names for a fixture's Shifu. */
function shifuId(id: string): string {
  const view = fixture(id).playerView;
  const me = view.viewerId === null ? undefined : view.game.players[view.viewerId];
  const worker = Object.values(me?.workers ?? {}).find((candidate) => candidate.kind === "shifu" && candidate.placement === null);
  if (worker === undefined) throw new Error("no free Shifu");
  return worker.id;
}

describe("rules details (owner review, 2026-10-17)", () => {
  it("the work pane and the location cards open no location rules", () => {
    mount(new ControlledSource("w-before-the-worker-action-rich-4-player-start"), <Table />);
    expect(container.querySelector('[aria-label="Full rules: Commission Market"]')).toBeNull();
    expect(container.querySelector('article[data-location-id] .kit-detail-trigger')).toBeNull();
    click(placeButton("commission_market", "shifu"));
    expect(chosen()?.querySelector(".kit-detail-trigger[aria-label^='Full rules: Commission Market']")).toBeNull();
  });

  it("the Kiln options carry no Full rules button; clicking an option chooses it", () => {
    mount(new ControlledSource("m15_kiln_selection"), <DecisionPane />);
    expect(container.querySelector(".kit-detail-trigger")).toBeNull();
    const free = [...container.querySelectorAll<HTMLInputElement>('input[name="kilnId"]')].find((input) => input.getAttribute("aria-disabled") !== "true");
    if (free === undefined) throw new Error("no free Kiln");
    click(free);
    expect(free.checked).toBe(true);
  });
});

describe("the work turn: workers are placed on the table", () => {
  it("a Place shortcut chooses worker and location; the pane shows the placement and its sub-editor, and Confirm sends it", () => {
    const id = "w-before-the-worker-action-rich-4-player-start";
    const source = new ControlledSource(id);
    mount(source, <Table />);
    expect($('[data-action="confirm"]').getAttribute("aria-disabled")).toBe("true");
    // The pane offers no worker or location of its own, and it is hidden until a placement is
    // chosen (owner review, 2026-10-17): no hint, no way to the table, nothing to read.
    expect(container.querySelector('form input[name="worker"], form input[name="locationId"]')).toBeNull();
    expect($<HTMLElement>("aside.pane").hidden).toBe(true);
    expect(container.querySelector('[data-b4="place-hint"], [data-goto="table"], [data-goto="workshop"]')).toBeNull();
    const shortcut = placeButton("canal_wharf", "shifu");
    expect(shortcut.getAttribute("aria-label")).toBe("Place Shifu at Canal Wharf");
    click(shortcut);
    expect(placeButton("canal_wharf", "shifu").getAttribute("aria-pressed")).toBe("true");
    expect($('article[data-location-id="canal_wharf"]').className).toContain("loc--chosen");
    expect($<HTMLElement>("aside.pane").hidden).toBe(false);
    const region = chosen()?.querySelector<HTMLElement>(".b4-sub-region");
    expect(region?.getAttribute("role")).toBe("group");
    expect(region?.querySelector('[data-location="canal_wharf"]')).not.toBeNull();
    expect(chosen()?.querySelector("h3")?.textContent).toBe("Shifu at Canal Wharf");
    expect(summary()).toBe("Place Shifu at Canal Wharf — +4 Coins and the top Main Order card, unseen");
    click($('[data-action="confirm"]'));
    expect(source.submitted).toEqual([{ type: "PLACE_CANAL_WHARF", workerId: shifuId(id), endTurn: true }]);
  });

  it("a personal space's Place shortcut on the viewer's own board chooses that space", () => {
    const id = "w-before-the-worker-action-rich-4-player-start";
    mount(new ControlledSource(id), <Table />);
    const shortcut = $<HTMLButtonElement>('.pspaces button[data-act="place"][data-location-id="form_decorate"]');
    click(shortcut);
    expect(chosen()?.getAttribute("data-location-id")).toBe("form_decorate");
    expect(chosen()?.querySelector('[data-location="form_decorate"]')).not.toBeNull();
    expect(chosen()?.textContent).toMatch(/your space \d/);
  });

  it("an entry the engine refuses has no shortcut; the card gives the reason", () => {
    mount(new ControlledSource("w-before-the-worker-action-rich-4-player-start"), <Table />);
    const guild = $('article[data-location-id="guild_hall"]');
    expect(guild.querySelector('[data-act="place"]')).toBeNull();
    expect(guild.textContent).toContain("Can’t place here");
    expect(chosen()).toBeNull();
  });

  it("keeps each location's choices while the player looks at another", () => {
    mount(new ControlledSource("w-before-the-worker-action-rich-4-player-start"), <Table />);
    click(placeButton("materials_yard", "shifu"));
    click(radio("clay", "1"));
    expect(radio("clay", "1").checked).toBe(true);
    click(placeButton("canal_wharf", "shifu"));
    expect(container.querySelector('input[name="clay"]')).toBeNull();
    click(placeButton("materials_yard", "shifu"));
    expect(radio("clay", "1").checked).toBe(true);
    // The Shifu effect gains 8 in any split (rev. 4).
    expect(summary()).toMatch(/Materials Yard — 1 Clay \+ 7 Wood/);
  });

  it("a language switch keeps the draft and re-renders the sentence", () => {
    mount(
      new ControlledSource("w-before-the-worker-action-rich-4-player-start"),
      <>
        <LanguageToggle />
        <Table />
      </>,
    );
    click(placeButton("canal_wharf", "shifu"));
    expect(summary()).toBe("Place Shifu at Canal Wharf — +4 Coins and the top Main Order card, unseen");
    const toggle = [...container.querySelectorAll("button")].find((button) => button.textContent === "中文");
    if (toggle === undefined) throw new Error("no language toggle");
    click(toggle);
    expect(summary()).toBe("派师傅到漕运码头：得4铜钱，并不看牌面拿取主委托牌堆顶的牌");
    expect(placeButton("canal_wharf", "shifu").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("the Guild Hall choice is made on the Tech display", () => {
  it("an Apprentice there: the display becomes the chooser, focus moves to its prompt, a Tech it cannot buy cannot be chosen", async () => {
    const id = "w-before-the-worker-action-kiln-furniture-inverted-firing-targets-setters-marks-senior-apprentice";
    const offered = guildOptions(fixture(id).playerView, "apprentice").faceUp;
    const legal = offered.find((option) => option.legal)!;
    const illegal = offered.find((option) => !option.legal)!;
    const source = new ControlledSource(id);
    const { scrolled } = mount(source, <Table />);
    expect(container.querySelector('[data-act="tech"]')).toBeNull();
    click(placeButton("guild_hall", "apprentice"));
    // Desktop: the world scrolls to Recognition & Techs, and focus lands on the chooser's prompt.
    expect(scrolled).toEqual(["progress"]);
    await nextFrame();
    const prompt = $("[data-tech-chooser]");
    expect(document.activeElement).toBe(prompt);
    expect(prompt.textContent).toBe("Apprentice at the Guild Hall: choose a face-up Tech to buy");
    expect($(".techs").getAttribute("role")).toBe("group");
    expect($(".techs").getAttribute("aria-labelledby")).toBe(prompt.id);
    // The pane asks for the choice on the table and lists no Tech.
    expect(chosen()?.textContent).toContain("Choose a face-up Tech on the Advanced Techs display.");
    expect(chosen()?.querySelector('input[name="techId"]')).toBeNull();
    // Every face-up Tech is a target; one the Apprentice cannot buy is greyed out with its reason.
    expect([...container.querySelectorAll<HTMLButtonElement>('[data-act="tech"]')].map((button) => button.getAttribute("data-tech-id"))).toEqual(offered.map((option) => option.techId));
    const refused = $<HTMLButtonElement>(`[data-act="tech"][data-tech-id="${illegal.techId}"]`);
    expect(refused.getAttribute("aria-disabled")).toBe("true");
    expect(refused.closest(".tech")?.className).toContain("tech--unavailable");
    const reasonIds = (refused.getAttribute("aria-describedby") ?? "").split(" ");
    expect(document.getElementById(reasonIds[0]!)?.textContent).toMatch(/already own|Not enough|at most/i);
    click(refused);
    expect(refused.getAttribute("aria-pressed")).toBe("false");
    // A chooser tile opens no rules details.
    expect(refused.closest(".tech")?.querySelector(".kit-detail-trigger")).toBeNull();
    const pick = $<HTMLButtonElement>(`[data-act="tech"][data-tech-id="${legal.techId}"]`);
    expect(pick.getAttribute("aria-labelledby")?.split(" ").map((part) => document.getElementById(part)?.textContent).join(" ")).toContain(techText(legal.techId, "en").name);
    click(pick);
    expect($<HTMLButtonElement>(`[data-act="tech"][data-tech-id="${legal.techId}"]`).getAttribute("aria-pressed")).toBe("true");
    expect(chosen()?.querySelector(`[data-guild-choice="${legal.techId}"]`)?.textContent).toContain(techText(legal.techId, "en").name);
    expect(summary()).toBe(`Place Apprentice at Guild Hall — buy ${techText(legal.techId, "en").name} for ${legal.cost} ${legal.cost === 1 ? "Coin" : "Coins"}`);
    click($('[data-action="confirm"]'));
    expect(source.submitted).toEqual([{ type: "PLACE_GUILD_HALL", workerId: expect.any(String), choice: { kind: "buy_face_up", techId: legal.techId }, endTurn: true }]);
  });

  it("a Shifu there: each discipline offers its deck to inspect; the Techs stay display tiles with their rules details", async () => {
    const id = "w-before-the-worker-action-kiln-furniture-inverted-firing-targets-setters-marks-senior-apprentice";
    const source = new ControlledSource(id);
    mount(source, <Table />);
    click(placeButton("guild_hall", "shifu"));
    await nextFrame();
    expect($("[data-tech-chooser]").textContent).toBe("Shifu at the Guild Hall: choose a discipline and inspect the top of its deck");
    expect(container.querySelector('[data-act="tech"]')).toBeNull();
    expect(container.querySelector(".techs .tech .kit-detail-trigger")).not.toBeNull();
    const inspect = [...container.querySelectorAll<HTMLButtonElement>('[data-act="inspect"]')];
    expect(inspect.map((button) => button.getAttribute("data-discipline"))).toEqual(["workshop", "glazing_loading", "firing"]);
    const firing = $<HTMLButtonElement>('[data-act="inspect"][data-discipline="firing"]');
    expect(firing.getAttribute("aria-label")).toBe("Inspect the deck: Firing (only you see the cards)");
    click(firing);
    expect($('[data-act="inspect"][data-discipline="firing"]').getAttribute("aria-pressed")).toBe("true");
    expect(chosen()?.textContent).toContain("Inspect the Firing deck");
    click($('[data-action="confirm"]'));
    expect(source.submitted).toEqual([{ type: "PLACE_GUILD_HALL", workerId: expect.any(String), choice: { kind: "inspect", discipline: "firing" } }]);
  });

  it("on phones the Guild Hall shortcut lowers the sheet onto the Table section, and a Tech choice opens it for Confirm", async () => {
    const id = "w-before-the-worker-action-kiln-furniture-inverted-firing-targets-setters-marks-senior-apprentice";
    const legal = guildOptions(fixture(id).playerView, "apprentice").faceUp.find((option) => option.legal)!;
    const { ui, scrolled } = mount(new ControlledSource(id), <Table />, "phone");
    const context = fixtureWindow(id);
    click(placeButton("guild_hall", "apprentice"));
    expect(ui.stateFor(context).section).toBe("table");
    expect(ui.stateFor(context).sheet).toBe("peek");
    expect(scrolled).toEqual([]);
    await nextFrame();
    expect(document.activeElement).toBe($("[data-tech-chooser]"));
    click($(`[data-act="tech"][data-tech-id="${legal.techId}"]`));
    expect(ui.stateFor(context).sheet).toBe("open");
    // The pane's button goes back to the chooser.
    act(() => ui.actions.setSection("workshop"));
    click($('[data-goto="techs"]'));
    expect(ui.stateFor(context).section).toBe("table");
    expect(ui.stateFor(context).sheet).toBe("peek");
  });
});

describe("the Guild Hall inspection (v1.6.2 L237)", () => {
  it("the first take: one Tech, sent alone, with no bottom order yet", () => {
    const id = "m12_guild_shifu_inspection";
    const options = guildInspectionOptions(fixture(id).playerView);
    if (options === null) throw new Error("no inspection");
    const take = options.faceUp.find((option) => option.legal) ?? options.inspected.find((option) => option.legal);
    if (take === undefined) throw new Error("nothing to take");
    const source = new ControlledSource(id);
    mount(source, <DecisionPane />);
    expect(container.querySelector('input[name="take"][value="finish"]')).toBeNull();
    click(radio("take", take.techId));
    expect(container.querySelector(".kit-reorder-list")).toBeNull();
    click($('[data-action="confirm"]'));
    expect(source.submitted).toEqual([{ type: "GUILD_TAKE", take: { kind: take.source, techId: take.techId } }]);
  });

  it("after a take: stop, order the untaken Techs with Move up / Move down, and send that bottom order", () => {
    const source = new ControlledSource("w-guild-hall-shifu-inspection");
    const view = structuredClone(source.getSnapshot().view!);
    const phase = view.game.phase;
    if (phase.type !== "work_turn" || phase.step.kind !== "guild_inspection") throw new Error("fixture changed");
    const techId = view.game.techDisplay.glazing_loading[0]!;
    view.game.techDisplay.glazing_loading = view.game.techDisplay.glazing_loading.slice(1);
    phase.step = { ...phase.step, takes: [{ kind: "face_up", techId }] };
    const me = view.game.players[view.viewerId!]!;
    me.techs = [...me.techs, { id: techId, acquiredInRound: 1, usedThisRound: false }];
    source.setView(view);
    mount(source, <DecisionPane />);
    const options = guildInspectionOptions(view);
    if (options === null) throw new Error("no inspection");
    expect($("[data-b4='guild-taken']").textContent).toContain(techText(techId, "en").name);
    click(radio("take", "finish"));
    const expected = options.inspected.map((option) => option.techId);
    expect([...container.querySelectorAll(".kit-reorder-list > li")].length).toBe(expected.length);
    expect(expected.length).toBeGreaterThan(1);
    const down = container.querySelector<HTMLButtonElement>(".kit-reorder-list > li button[aria-label^='Move'][aria-label$='down']");
    if (down === null) throw new Error("no Move down");
    click(down);
    [expected[0], expected[1]] = [expected[1]!, expected[0]!];
    click($('[data-action="confirm"]'));
    expect(source.submitted).toEqual([{ type: "GUILD_FINISH", bottomOrder: expected, endTurn: true }]);
  });
});

describe("the Guild Hall inspection on the Tech display (D14, v1.6.2 L237)", () => {
  it("a face-up Tech chosen on the display is the pane's take; one the Shifu cannot take cannot be chosen", () => {
    const id = "m12_guild_shifu_inspection";
    const options = guildInspectionOptions(fixture(id).playerView);
    const legal = options?.faceUp.find((option) => option.legal);
    if (options === null || legal === undefined) throw new Error("fixture changed");
    const source = new ControlledSource(id);
    mount(source, <Table />);
    expect($("[data-tech-chooser]").textContent).toBe("Shifu at the Guild Hall: take a face-up Tech here, or one of the Techs you inspected");
    // The inspected Techs are only in the pane.
    for (const option of options.inspected) expect(container.querySelector(`[data-act="tech"][data-tech-id="${option.techId}"]`)).toBeNull();
    click($(`[data-act="tech"][data-tech-id="${legal.techId}"]`));
    expect(radio("take", legal.techId).checked).toBe(true);
    expect($(`[data-act="tech"][data-tech-id="${legal.techId}"]`).getAttribute("aria-pressed")).toBe("true");
    // And back: a radio in the pane presses the display's tile.
    const other = options.faceUp.find((option) => option.legal && option.techId !== legal.techId);
    if (other !== undefined) {
      click(radio("take", other.techId));
      expect($(`[data-act="tech"][data-tech-id="${other.techId}"]`).getAttribute("aria-pressed")).toBe("true");
      expect($(`[data-act="tech"][data-tech-id="${legal.techId}"]`).getAttribute("aria-pressed")).toBe("false");
      click($(`[data-act="tech"][data-tech-id="${legal.techId}"]`));
    }
    click($('[data-action="confirm"]'));
    expect(source.submitted).toEqual([{ type: "GUILD_TAKE", take: { kind: "face_up", techId: legal.techId } }]);
  });

  it("the second take: the taken discipline's Techs are refused on the display with the reason; another discipline's is sent", () => {
    const id = "d-guild-hall-after-a-take";
    const options = guildInspectionOptions(fixture(id).playerView);
    const refused = options?.faceUp.find((option) => option.discipline === "glazing_loading");
    const second = options?.faceUp.find((option) => option.legal);
    if (options === null || refused === undefined || second === undefined) throw new Error("fixture changed");
    const source = new ControlledSource(id);
    mount(source, <Table />);
    expect($("[data-tech-chooser]").textContent).toBe("Shifu at the Guild Hall: take a second Tech from another discipline, or stop");
    const button = $<HTMLButtonElement>(`[data-act="tech"][data-tech-id="${refused.techId}"]`);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    const why = button.getAttribute("aria-describedby")?.split(" ")[0] ?? "";
    expect(document.getElementById(why)?.textContent).toBe("You already own a Glazing & Loading Tech.");
    click(button);
    expect(container.querySelector('input[name="take"]:checked')).toBeNull();
    click($(`[data-act="tech"][data-tech-id="${second.techId}"]`));
    click($('[data-action="confirm"]'));
    expect(source.submitted).toEqual([{ type: "GUILD_TAKE", take: { kind: "face_up", techId: second.techId } }]);
  });

  it("stopping with a single untaken inspected Tech names it in a sentence (no order to set) and sends it", () => {
    const source = new ControlledSource("w-guild-hall-shifu-inspection");
    const view = structuredClone(source.getSnapshot().view!);
    const phase = view.game.phase;
    const look = view.own?.pendingLook;
    if (phase.type !== "work_turn" || phase.step.kind !== "guild_inspection" || look?.kind !== "guild_inspection") throw new Error("fixture changed");
    const [taken, left] = look.techIds;
    if (taken === undefined || left === undefined) throw new Error("fixture changed");
    look.techIds = [left];
    phase.step = { ...phase.step, takes: [{ kind: "inspected", techId: taken }] };
    const me = view.game.players[view.viewerId!]!;
    me.techs = [...me.techs, { id: taken, acquiredInRound: 1, usedThisRound: false }];
    source.setView(view);
    mount(source, <DecisionPane />);
    click(radio("take", "finish"));
    expect(container.querySelector(".kit-reorder-list")).toBeNull();
    expect($("[data-b4='guild-return-one']").textContent).toBe(`${techText(left, "en").name} goes back to the bottom of the Firing deck.`);
    click($('[data-action="confirm"]'));
    expect(source.submitted).toEqual([{ type: "GUILD_FINISH", bottomOrder: [left], endTurn: true }]);
  });

  it("a take the server refuses shows the engine's reason in the player's words", async () => {
    const id = "m12_guild_shifu_inspection";
    const legal = guildInspectionOptions(fixture(id).playerView)?.faceUp.find((option) => option.legal);
    if (legal === undefined) throw new Error("fixture changed");
    const source = new ControlledSource(id);
    mount(source, <DecisionPane />);
    click(radio("take", legal.techId));
    click($('[data-action="confirm"]'));
    await act(async () => source.answer({ reject: { kind: "rule", error: { code: "TECH_DISCIPLINE_OWNED", message: "", details: { techId: legal.techId, discipline: legal.discipline } } } }));
    expect(container.textContent).toContain(`You already own a ${disciplineName(legal.discipline, "en")} Tech.`);
    expect(container.textContent).not.toContain(legal.techId);
  });
});

describe("the Colour Samples swap (v1.6.2 L632)", () => {
  it("after the action: the held Order to give up, chosen in the pane; Confirm sends the swap", () => {
    const id = "m17_after_action";
    const source = new ControlledSource(id);
    mount(source, <DecisionPane />);
    // The swap is m17's only free-action entry; it waits for the player's own press (D21).
    expect(radio("freeAction", "colour_samples_swap").checked).toBe(false);
    click(radio("freeAction", "colour_samples_swap"));
    const hand = fixture(id).playerView.own?.orderHand ?? [];
    expect([...container.querySelectorAll<HTMLInputElement>('input[name="discardOrderId"]')].map((input) => input.value)).toEqual(hand);
    expect($('[data-action="confirm"]').getAttribute("aria-disabled")).toBe("true");
    click(radio("discardOrderId", hand[0]!));
    expect(summary()).toBe(`Colour Samples: give up ${hand[0]!}, then Select 3`);
    click($('[data-action="confirm"]'));
    expect(source.submitted).toEqual([{ type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: hand[0] }]);
  });
});

describe("Kiln selection", () => {
  it("a Kiln another player took is focusable but cannot be chosen; a free one is sent", () => {
    const source = new ControlledSource("w-kiln-and-main-order-choice");
    mount(source, <DecisionPane />);
    const taken = [...container.querySelectorAll<HTMLInputElement>('input[name="kilnId"]')].find((input) => input.getAttribute("aria-disabled") === "true");
    if (taken !== undefined) {
      click(taken);
      expect(taken.checked).toBe(false);
    }
    const free = [...container.querySelectorAll<HTMLInputElement>('input[name="kilnId"]')].find((input) => input.getAttribute("aria-disabled") !== "true");
    if (free === undefined) throw new Error("no free Kiln");
    click(free);
    // A Kiln alone is not enough: the pick also takes a face-up Main Order (rev. 4 change 32, R23).
    expect($('[data-action="confirm"]').getAttribute("aria-disabled")).toBe("true");
    const order = container.querySelector<HTMLInputElement>('input[name="mainOrder"]');
    if (order === null) throw new Error("no Main Order to choose");
    click(order);
    click($('[data-action="confirm"]'));
    const slotIndex = Number(order.value);
    const orderId = fixture("w-kiln-and-main-order-choice").playerView.game.market.display[slotIndex];
    expect(source.submitted).toEqual([{ type: "SELECT_KILN", kilnId: free.value, mainOrder: { slotIndex, orderId } }]);
  });
});
