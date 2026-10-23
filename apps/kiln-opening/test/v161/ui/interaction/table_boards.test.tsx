// @vitest-environment happy-dom
/**
 * Table and boards interaction tier (B2; UI_V1.6.1_ARCHITECTURE §9.3): what static markup
 * cannot show.
 * - D10: keyboard focus on a Tech tile, Order card or milestone opens its rules details; leaving
 *   closes them; a click pins them; Escape returns focus to the piece. The action space cards
 *   open none (owner review, 2026-10-17).
 * - D1: the board tabs follow the ARIA tabs pattern (arrows move the selection and the board).
 * - Table targets change the open window's draft synchronously: a Place shortcut, an Order card.
 * - "Open Kiln" goes to the Kiln section (scroll on desktop, the Kiln tab on phones).
 */
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TECHS, completableOrders } from "../../../../src/game/index.ts";
import type { TechId } from "../../../../src/game/index.ts";
import { BoardArea } from "../../../../src/app/boards/BoardArea.tsx";
import { I18nProvider } from "../../../../src/app/i18n/I18nProvider.tsx";
import { recognitionMilestones, rulesClarifications, techText } from "../../../../src/app/i18n/content.ts";
import { decisionWindow } from "../../../../src/app/state/decisionWindow.ts";
import { DraftStore } from "../../../../src/app/state/draftStore.ts";
import { GameProvider } from "../../../../src/app/state/hooks.ts";
import { fixedLayoutSource } from "../../../../src/app/state/layoutMode.ts";
import type { LayoutMode } from "../../../../src/app/state/layoutMode.ts";
import { UiStore } from "../../../../src/app/state/uiStore.ts";
import type { UiEffects, WorldSectionId } from "../../../../src/app/state/uiStore.ts";
import { CentralBoard } from "../../../../src/app/table/CentralBoard.tsx";
import { HandRow } from "../../../../src/app/table/HandRow.tsx";
import { KilnMini } from "../../../../src/app/table/KilnMini.tsx";
import { RecognitionTrack } from "../../../../src/app/table/RecognitionTrack.tsx";
import { TechDisplay } from "../../../../src/app/table/TechDisplay.tsx";
import { fixture, fixtureSource } from "../support/fixtures.ts";
import { TABLE_WINDOWS } from "../table/tableWindows.tsx";

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
});

interface Mounted {
  ui: UiStore;
  drafts: DraftStore;
  scrolled: WorldSectionId[];
}

function mount(id: string, element: ReactElement, options: { layoutMode?: LayoutMode; locale?: "en" | "zh-CN" } = {}): Mounted {
  const layout = fixedLayoutSource(options.layoutMode ?? "desktop");
  const scrolled: WorldSectionId[] = [];
  const effects: UiEffects = { scrollToSection: (section) => scrolled.push(section), applyTheme: () => undefined, storeTheme: () => undefined };
  const ui = new UiStore({ layout, effects });
  const drafts = new DraftStore();
  act(() =>
    root.render(
      <I18nProvider defaultLocale={options.locale ?? "en"} strict>
        <GameProvider source={fixtureSource(id)} registry={TABLE_WINDOWS} drafts={drafts} ui={ui} layout={layout} devTools={false}>
          {element}
        </GameProvider>
      </I18nProvider>,
    ),
  );
  return { ui, drafts, scrolled };
}

const $ = <E extends Element = HTMLElement>(selector: string): E => {
  const found = container.querySelector<E>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
};

const $$ = <E extends Element = HTMLElement>(selector: string): E[] => Array.from(container.querySelectorAll<E>(selector));

function key(target: Element, keyName: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: keyName, bubbles: true, cancelable: true }));
  });
}

function click(target: Element): void {
  act(() => {
    (target as HTMLElement).click();
  });
}

function focus(target: HTMLElement): void {
  act(() => target.focus());
}

/** The panel a trigger button controls. */
function panelOf(trigger: HTMLElement): HTMLElement {
  const id = trigger.getAttribute("aria-controls") ?? "";
  const panel = document.getElementById(id);
  if (panel === null) throw new Error(`no panel ${id}`);
  return panel;
}

describe("D10: rules details open on keyboard focus, click or tap", () => {
  it("a Tech tile opens on focus, closes when focus leaves, pins on click and returns focus on Escape", () => {
    mount("m1_work_phase_r2_3p", <><TechDisplay /><button id="after">after</button></>);
    const trigger = $<HTMLButtonElement>(".tech .kit-detail-trigger");
    const panel = panelOf(trigger);
    expect(panel.hidden).toBe(true);
    focus(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    const techId = trigger.closest(".tech")?.getAttribute("data-tech-id") as TechId;
    expect(panel.getAttribute("aria-label")).toBe(`Full rules: ${techText(techId, "en").name}`);
    // The full rule, then the clarifications, as plain text (owner review, 2026-10-17).
    expect([...panel.querySelectorAll(".rd-h")].map((heading) => heading.textContent)).toEqual(["Full rule", ...(TECHS[techId].clarifications.length > 0 ? ["Clarifications"] : [])]);
    expect(panel.querySelector(".rd-rule")?.textContent).toBe(techText(techId, "en").ability);
    focus($<HTMLButtonElement>("#after"));
    expect(panel.hidden).toBe(true);
    click(trigger);
    expect(panel.hidden).toBe(false);
    focus($<HTMLButtonElement>("#after"));
    expect(panel.hidden).toBe(false);
    key(panel, "Escape");
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it("a location card opens no rules details; a Recognition milestone opens its rules details on focus", () => {
    mount("m1_work_phase_r2_3p", <><CentralBoard /><RecognitionTrack /></>);
    expect(container.querySelector('[data-location-id="guild_hall"] .kit-detail-trigger')).toBeNull();
    expect(container.querySelector('[data-location-id] [aria-label^="Full rules"]')).toBeNull();
    // Focus on the card's Place shortcut opens nothing either.
    const place = $<HTMLButtonElement>('[data-location-id="canal_wharf"] [data-act="place"]');
    focus(place);
    expect(document.querySelector(".kit-detail-panel:not([hidden])")).toBeNull();
    const milestone = $<HTMLButtonElement>('[data-recognition="4"] .kit-detail-trigger');
    focus(milestone);
    expect(panelOf(milestone).hidden).toBe(false);
    // Recognition 4's reward, then its clarifications with the Crowns beyond it, without source labels.
    expect(panelOf(milestone).querySelector(".rd-rule")?.textContent).toBe(recognitionMilestones("en").find((entry) => entry.space === 4)?.reward);
    for (const item of rulesClarifications({ kind: "recognition", space: 4 }, "en")) expect(panelOf(milestone).textContent).toContain(item.text);
    expect(panelOf(milestone).textContent).not.toMatch(/Source:|Owner ruling/);
  });
});

describe("D1 board tabs", () => {
  it("arrow keys move between boards; Your workshop returns to the viewer's own", () => {
    const { ui } = mount("m1_work_phase_r2_3p", <BoardArea />);
    const tabs = () => $$<HTMLButtonElement>('[role="tab"]');
    expect(tabs().map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    // m1's viewer is Zhao (p2), who is also the First Player.
    expect($('[role="tabpanel"] article').getAttribute("data-player-id")).toBe("p2");
    focus(tabs()[0]!);
    // The other boards follow the players' order from the First Player (Wen, then Lin).
    key(tabs()[0]!, "ArrowRight");
    expect(tabs()[1]!.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs()[1]);
    expect($('[role="tabpanel"] article').getAttribute("data-player-id")).toBe("p3");
    expect(ui.stateFor({ window: null, phase: null }).boardShown).toBe("p3");
    key(tabs()[1]!, "End");
    expect($('[role="tabpanel"] article').getAttribute("data-player-id")).toBe("p1");
    click(tabs()[0]!);
    expect($('[role="tabpanel"] article').getAttribute("data-player-id")).toBe("p2");
    expect(ui.stateFor({ window: null, phase: null }).boardShown).toBeNull();
  });
});

describe("table targets change the pane's draft synchronously", () => {
  it("a Place shortcut chooses that location and worker", () => {
    const { drafts } = mount("m1_work_phase_r2_3p", <CentralBoard />);
    const shifu = $<HTMLButtonElement>('[data-location-id="canal_wharf"] .pbtn[data-worker="shifu"]');
    expect(shifu.getAttribute("aria-pressed")).toBe("false");
    click(shifu);
    expect($<HTMLButtonElement>('[data-location-id="canal_wharf"] .pbtn[data-worker="shifu"]').getAttribute("aria-pressed")).toBe("true");
    expect($('article[data-location-id="canal_wharf"]').className).toContain("loc--chosen");
    expect(drafts.getVersion()).toBeGreaterThan(0);
  });

  it("an Order card's toggle chooses that Order in the Order Phase (m6)", () => {
    const id = "m6_order_phase_crackle_3p";
    const chosen = completableOrders(fixture(id).playerView)[0]!.orderId;
    mount(id, <HandRow />);
    const pick = $<HTMLButtonElement>(`article[data-order-id="${chosen}"] .ord-pick`);
    expect(pick.getAttribute("aria-pressed")).toBe("false");
    click(pick);
    expect($(`article[data-order-id="${chosen}"]`).getAttribute("data-target")).toBe("chosen");
    expect($<HTMLButtonElement>(`article[data-order-id="${chosen}"] .ord-pick`).getAttribute("aria-pressed")).toBe("true");
    // The card face itself opens the Order's rules details, not the choice.
    const face = $<HTMLButtonElement>(`article[data-order-id="${chosen}"] .kit-detail-trigger`);
    click(face);
    expect(panelOf(face).hidden).toBe(false);
    expect(panelOf(face).getAttribute("aria-label")).toBe(`Full rules: Order ${chosen}`);
  });
});

describe("Open Kiln", () => {
  it("scrolls to the Kiln section on desktop and switches to the Kiln tab on phones", () => {
    const desktop = mount("m1_work_phase_r2_3p", <KilnMini />);
    click($(".kmini-open"));
    expect(desktop.scrolled).toEqual(["kiln"]);
    act(() => root.unmount());
    root = createRoot(container);
    const phone = mount("m1_work_phase_r2_3p", <KilnMini />, { layoutMode: "phone" });
    click($(".kmini-open"));
    expect(phone.scrolled).toEqual([]);
    expect(phone.ui.stateFor({ window: decisionWindow(fixture("m1_work_phase_r2_3p").playerView), phase: "work" }).section).toBe("kiln");
  });
});
