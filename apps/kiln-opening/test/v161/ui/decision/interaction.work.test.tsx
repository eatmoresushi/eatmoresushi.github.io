// @vitest-environment happy-dom
/**
 * B4's interaction tier (UI_V1.6.1_ARCHITECTURE §8.1, §9.3): what static markup cannot show.
 * Owner: B4.
 * - Rules details (D10) open on keyboard focus; Escape closes them and returns focus.
 * - The work turn: choosing a worker and a location opens that location's sub-editor as the
 *   sibling region its radio names in `aria-controls`; Confirm sends the placement.
 * - Moving between locations keeps each location's sub-draft (§3.5 `perLocation`).
 * - A Place shortcut on the table changes the pane's draft synchronously (§3.5).
 * - A language switch keeps the draft and re-renders the ConfirmBar sentence.
 * - The Guild Hall inspection's bottom order: Move up / Move down, then Confirm (§8.1).
 * - Kiln selection: a Kiln another player took is focusable but cannot be chosen.
 */
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guildInspectionOptions } from "../../../../src/game/index.ts";
import { DecisionPane } from "../../../../src/app/decision/DecisionPane.tsx";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { I18nProvider } from "../../../../src/app/i18n/I18nProvider.tsx";
import { LanguageToggle } from "../../../../src/app/kit/LanguageToggle.tsx";
import { DraftStore } from "../../../../src/app/state/draftStore.ts";
import { GameProvider, useTableSelection } from "../../../../src/app/state/hooks.ts";
import { fixedLayoutSource } from "../../../../src/app/state/layoutMode.ts";
import { UiStore } from "../../../../src/app/state/uiStore.ts";
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

function mount(source: ControlledSource, element: ReactElement): void {
  const layout = fixedLayoutSource("desktop");
  act(() =>
    root.render(
      <I18nProvider defaultLocale="en" strict>
        <GameProvider source={source} registry={WINDOWS} drafts={new DraftStore()} ui={new UiStore({ layout })} layout={layout} devTools={false}>
          {element}
        </GameProvider>
      </I18nProvider>,
    ),
  );
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

/** The worker entry ID the engine names for a fixture's Shifu. */
function shifuId(id: string): string {
  const view = fixture(id).playerView;
  const me = view.viewerId === null ? undefined : view.game.players[view.viewerId];
  const worker = Object.values(me?.workers ?? {}).find((candidate) => candidate.kind === "shifu" && candidate.placement === null);
  if (worker === undefined) throw new Error("no free Shifu");
  return worker.id;
}

describe("rules details (D10)", () => {
  it("a location's rules open on keyboard focus and close on Escape, returning focus", () => {
    mount(new ControlledSource("m1_work_phase_r2_3p"), <DecisionPane />);
    const trigger = $<HTMLButtonElement>('.rd-piece--button .kit-detail-trigger[aria-label="Rules: Materials Yard"]');
    // The panel lives in the kit's body-level layer (CR B2-6, B3-5), named by aria-controls.
    const panel = document.getElementById(trigger.getAttribute("aria-controls") ?? "")!;
    expect(panel.querySelector('[data-rules="location"]')).not.toBeNull();
    expect(panel.hidden).toBe(true);
    act(() => trigger.focus());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain("Owner ruling R12");
    act(() => {
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it("a Kiln board's rules open on click and show its short text with the timing in bold", () => {
    mount(new ControlledSource("m15_kiln_selection"), <DecisionPane />);
    const trigger = $<HTMLButtonElement>('.rd-piece--button .kit-detail-trigger[aria-label^="Rules: Ru Kiln"]');
    click(trigger);
    const panel = document.getElementById(trigger.getAttribute("aria-controls") ?? "")!;
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('[data-rules="kiln"] .rd-short strong')?.textContent).toMatch(/:$/);
    // Opening the rules never chooses the Kiln.
    expect(radio("kilnId", "RU").checked).toBe(false);
  });
});

describe("the work turn", () => {
  it("worker, then location: the sub-editor opens beside the radio, and Confirm sends the placement", () => {
    const id = "m1_work_phase_r2_3p";
    const source = new ControlledSource(id);
    mount(source, <DecisionPane />);
    expect($('[data-action="confirm"]').getAttribute("aria-disabled")).toBe("true");
    click(radio("worker", "shifu"));
    click(radio("locationId", "canal_wharf"));
    const input = radio("locationId", "canal_wharf");
    const region = $(`#${CSS.escape(input.getAttribute("aria-controls") ?? "")}`);
    expect(region.querySelector('[data-location="canal_wharf"]')).not.toBeNull();
    expect(input.closest("label")?.contains(region)).toBe(false);
    expect(summary()).toBe("Place Shifu at Canal Wharf — +4 Coins");
    click($('[data-action="confirm"]'));
    expect(source.submitted).toEqual([{ type: "PLACE_CANAL_WHARF", workerId: shifuId(id) }]);
  });

  it("an unavailable location stays focusable but cannot be chosen", () => {
    mount(new ControlledSource("m1_work_phase_r2_3p"), <DecisionPane />);
    click(radio("worker", "shifu"));
    const guild = radio("locationId", "guild_hall");
    expect(guild.getAttribute("aria-disabled")).toBe("true");
    expect(guild.getAttribute("aria-describedby")).not.toBeNull();
    click(guild);
    expect(guild.checked).toBe(false);
    expect(container.querySelector('[data-location="guild_hall"]')).toBeNull();
  });

  it("keeps each location's choices while the player looks at another", () => {
    mount(new ControlledSource("w-before-the-worker-action-rich-4-player-start"), <DecisionPane />);
    click(radio("worker", "shifu"));
    click(radio("locationId", "materials_yard"));
    click(radio("clay", "1"));
    expect(radio("clay", "1").checked).toBe(true);
    click(radio("locationId", "canal_wharf"));
    expect(container.querySelector('input[name="clay"]')).toBeNull();
    click(radio("locationId", "materials_yard"));
    expect(radio("clay", "1").checked).toBe(true);
    expect(summary()).toMatch(/Materials Yard — 1 Clay \+ 3 Wood/);
  });

  it("a Place shortcut on the table sets worker and location in the pane at once", () => {
    function PlaceShortcut() {
      const table = useTableSelection();
      const entries = table.placeTargets.get("canal_wharf") ?? [];
      return (
        <button type="button" data-test-place="" data-active={table.activePlacement?.locationId ?? ""} onClick={() => table.act({ type: "place", locationId: "canal_wharf", workerKey: "shifu" })}>
          {entries.length}
        </button>
      );
    }
    mount(
      new ControlledSource("m1_work_phase_r2_3p"),
      <>
        <PlaceShortcut />
        <DecisionPane />
      </>,
    );
    expect($("[data-test-place]").textContent).not.toBe("0");
    click($("[data-test-place]"));
    expect(radio("worker", "shifu").checked).toBe(true);
    expect(radio("locationId", "canal_wharf").checked).toBe(true);
    expect($("[data-test-place]").getAttribute("data-active")).toBe("canal_wharf");
  });

  it("a language switch keeps the draft and re-renders the sentence", () => {
    mount(
      new ControlledSource("m1_work_phase_r2_3p"),
      <>
        <LanguageToggle />
        <DecisionPane />
      </>,
    );
    click(radio("worker", "shifu"));
    click(radio("locationId", "canal_wharf"));
    expect(summary()).toBe("Place Shifu at Canal Wharf — +4 Coins");
    const toggle = [...container.querySelectorAll("button")].find((button) => button.textContent === "中文");
    if (toggle === undefined) throw new Error("no language toggle");
    click(toggle);
    expect(summary()).toBe("派师傅到漕运码头：得4铜钱");
    expect(radio("locationId", "canal_wharf").checked).toBe(true);
  });
});

describe("the Guild Hall inspection", () => {
  it("orders the untaken Techs with Move up / Move down and sends that bottom order", () => {
    const id = "m12_guild_shifu_inspection";
    const options = guildInspectionOptions(fixture(id).playerView);
    if (options === null) throw new Error("no inspection");
    const take = options.faceUp.find((option) => option.legal) ?? options.inspected.find((option) => option.legal);
    if (take === undefined) throw new Error("nothing to take");
    const source = new ControlledSource(id);
    mount(source, <DecisionPane />);
    click(radio("take", take.techId));
    const before = [...container.querySelectorAll(".kit-reorder-list > li")].length;
    expect(before).toBe(options.faceUp.some((option) => option.techId === take.techId) ? options.inspected.length : options.inspected.length - 1);
    const expected = options.inspected.map((option) => option.techId).filter((techId) => techId !== take.techId);
    if (expected.length > 1) {
      const down = container.querySelector<HTMLButtonElement>(".kit-reorder-list > li button[aria-label^='Move'][aria-label$='down']");
      if (down === null) throw new Error("no Move down");
      click(down);
      [expected[0], expected[1]] = [expected[1]!, expected[0]!];
    }
    click($('[data-action="confirm"]'));
    expect(source.submitted).toEqual([{ type: "GUILD_TAKE", take: { kind: options.faceUp.some((option) => option.techId === take.techId) ? "face_up" : "inspected", techId: take.techId }, bottomOrder: expected }]);
  });
});

describe("Kiln selection", () => {
  it("a Kiln another player took is focusable but cannot be chosen; a free one is sent", () => {
    const source = new ControlledSource("w-kiln-selection");
    mount(source, <DecisionPane />);
    const taken = [...container.querySelectorAll<HTMLInputElement>('input[name="kilnId"]')].find((input) => input.getAttribute("aria-disabled") === "true");
    if (taken !== undefined) {
      click(taken);
      expect(taken.checked).toBe(false);
    }
    const free = [...container.querySelectorAll<HTMLInputElement>('input[name="kilnId"]')].find((input) => input.getAttribute("aria-disabled") !== "true");
    if (free === undefined) throw new Error("no free Kiln");
    click(free);
    click($('[data-action="confirm"]'));
    expect(source.submitted).toEqual([{ type: "SELECT_KILN", kilnId: free.value }]);
  });
});
