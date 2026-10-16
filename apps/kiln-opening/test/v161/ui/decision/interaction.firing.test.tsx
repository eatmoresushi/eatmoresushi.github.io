// @vitest-environment happy-dom
/**
 * B5's interaction tier (UI_V1.6.1_ARCHITECTURE §9.3): what static markup cannot show. Owner: B5.
 * - Rules details (D10) open on keyboard focus, and Escape closes them and returns focus; near a
 *   clipping edge the panel takes the roomier side and is capped to the room there.
 * - The Order Phase form: choosing an Order with one group preselects it; Confirm sends
 *   `COMPLETE_ORDER`; the alternative sends `END_ORDER_TURN`.
 * - The Canal Barge form: composed by the work window (B4's `CanalBargeFormProvider`), it edits
 *   the work draft's sub-draft and the window's Confirm sends `USE_CANAL_BARGE`; standalone, its
 *   own button sends it once an Order is chosen, and never before.
 * - The hand trim: a table click on an Order card toggles it in the pane synchronously.
 * - A language switch keeps the draft and re-renders the ConfirmBar summary.
 */
import { act, useState } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DecisionPane } from "../../../../src/app/decision/DecisionPane.tsx";
import { CanalBarge } from "../../../../src/app/decision/orders/CanalBarge.tsx";
import { canalBargeDraft } from "../../../../src/app/decision/orders/canalBargeDraft.ts";
import type { CanalBargeAction, CanalBargeDraft } from "../../../../src/app/decision/orders/canalBargeDraft.ts";
import { CanalBargeFormProvider } from "../../../../src/app/decision/work/composedForms.tsx";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { I18nProvider } from "../../../../src/app/i18n/I18nProvider.tsx";
import { LanguageToggle } from "../../../../src/app/kit/LanguageToggle.tsx";
import { DraftStore } from "../../../../src/app/state/draftStore.ts";
import { GameProvider, useEngineView, useGame, useTableSelection } from "../../../../src/app/state/hooks.ts";
import { fixedLayoutSource } from "../../../../src/app/state/layoutMode.ts";
import { UiStore } from "../../../../src/app/state/uiStore.ts";
import { ControlledSource } from "../support/controlledSource.ts";

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
  // React reports invalid nesting, missing keys and the like through console.error.
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

describe("rules details (D10)", () => {
  it("open on keyboard focus and close on Escape, returning focus", () => {
    mount(new ControlledSource("m13_jun_heat_adjustment"), <DecisionPane />);
    const trigger = $<HTMLButtonElement>(".rd-piece--name .kit-detail-trigger");
    // The panel lives in the kit's body-level layer (CR B2-6, B3-5), named by aria-controls.
    const panel = document.getElementById(trigger.getAttribute("aria-controls") ?? "")!;
    expect(panel.closest("#kit-detail-layer")).not.toBeNull();
    expect(panel.hidden).toBe(true);
    act(() => trigger.focus());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain("Kiln Tradition");
    expect(panel.textContent).toContain("Owner ruling R7");
    act(() => {
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });
});

describe("rules details stay inside the viewport (kit PieceDetail, CR B2-6, B3-5)", () => {
  it("near the bottom edge, the panel opens above the trigger, capped to the room there", async () => {
    mount(new ControlledSource("m13_jun_heat_adjustment"), <DecisionPane />);
    const trigger = $<HTMLButtonElement>(".rd-piece--name .kit-detail-trigger");
    const panel = document.getElementById(trigger.getAttribute("aria-controls") ?? "")!;
    const bottom = window.innerHeight - 44;
    trigger.getBoundingClientRect = () => ({ x: 20, y: bottom - 24, top: bottom - 24, bottom, left: 20, right: 120, width: 100, height: 24, toJSON: () => ({}) }) as DOMRect;
    Object.defineProperty(panel, "scrollHeight", { configurable: true, value: 500 });
    click(trigger);
    await act(async () => undefined);
    expect(panel.getAttribute("data-above")).toBe("true");
    expect(panel.style.getPropertyValue("--detail-max-h")).toBe(`${Math.floor(bottom - 24 - 6 - 8)}px`);
    expect(panel.style.getPropertyValue("--detail-bottom")).toBe(`${window.innerHeight - (bottom - 24) + 6}px`);
    click(trigger);
    await act(async () => undefined);
    expect(panel.hidden).toBe(true);
    expect(panel.getAttribute("data-above")).toBeNull();
  });
});

describe("the Order Phase form", () => {
  it("chooses an Order (its only group preselected), confirms COMPLETE_ORDER, ends with END_ORDER_TURN", async () => {
    const source = new ControlledSource("m6_order_phase_crackle_3p");
    mount(source, <DecisionPane />);
    expect($('[data-action="confirm"]').getAttribute("aria-disabled")).toBe("true");
    click($('input[name="orderId"][value="O05"]'));
    expect($<HTMLInputElement>('input[name="ceramicIds"][value="c20"]').checked).toBe(true);
    expect($(".confirm-summary").textContent).toBe("Complete O05 with Moon White Censer, Carved · Fine");
    click($('[data-action="confirm"]'));
    expect(source.submitted.at(-1)).toEqual({ type: "COMPLETE_ORDER", orderId: "O05", ceramicIds: ["c20"] });
    await act(async () => source.answer({ reject: null }));
    click($('[data-action="alt"]'));
    expect(source.submitted.at(-1)).toEqual({ type: "END_ORDER_TURN" });
  });

  it("a blocked Order cannot be chosen", () => {
    mount(new ControlledSource("m6_order_phase_crackle_3p"), <DecisionPane />);
    const blocked = $<HTMLInputElement>('input[name="orderId"][value="O37"]');
    expect(blocked.getAttribute("aria-disabled")).toBe("true");
    click(blocked);
    expect(blocked.checked).toBe(false);
    expect(container.querySelector('input[name="ceramicIds"]')).toBeNull();
  });
});

/** A stand-in for B4's work draft: holds the Canal Barge sub-draft and records each action. */
function ComposedHarness({ actions }: { actions: CanalBargeAction[] }) {
  const model = useGame();
  const engine = useEngineView();
  const [draft, setDraft] = useState<CanalBargeDraft>(() => canalBargeDraft.initial(model, engine));
  return (
    <CanalBargeFormProvider
      value={{
        source: "after_action",
        draft,
        options: canalBargeDraft.options(draft, model, engine),
        dispatch: (action) => {
          actions.push(action);
          setDraft((current) => canalBargeDraft.reduce(current, action, model, engine));
        },
      }}
    >
      <CanalBarge source="after_action" />
    </CanalBargeFormProvider>
  );
}

describe("the Canal Barge form composed by the work window", () => {
  it("edits the composed sub-draft, with the command's field names and no button of its own", () => {
    const actions: CanalBargeAction[] = [];
    const source = new ControlledSource("w-after-the-worker-action");
    mount(source, <ComposedHarness actions={actions} />);
    expect(container.querySelector('[data-form-action="canal-barge"]')).toBeNull();
    expect(container.querySelector('input[name^="canalBarge."]')).toBeNull();
    expect($(".ord-barge .rd-name").textContent).toBe("Canal Barge");
    click($('input[name="orderId"][value="O01"]'));
    expect(actions).toEqual([{ type: "order", orderId: "O01" }]);
    expect($<HTMLInputElement>('input[name="orderId"][value="O01"]').checked).toBe(true);
    expect($<HTMLInputElement>('input[name="ceramicIds"][value="c1"]').checked).toBe(true);
    expect(source.submitted).toEqual([]);
  });

  it("in the after-action window, Confirm sends the composed USE_CANAL_BARGE", () => {
    const source = new ControlledSource("w-after-the-worker-action");
    mount(source, <DecisionPane />);
    const mode = container.querySelector<HTMLInputElement>('input[name="mode"][value="canal_barge"]');
    expect(mode, "B4 offers Canal Barge after the action").not.toBeNull();
    click(mode!);
    expect(container.querySelector('[data-form-action="canal-barge"]')).toBeNull();
    click($('input[name="orderId"][value="O01"]'));
    expect($(".confirm-summary").textContent).toContain("O01");
    click($('[data-action="confirm"]'));
    expect(source.submitted).toEqual([{ type: "USE_CANAL_BARGE", orderId: "O01", ceramicIds: ["c1"] }]);
  });
});

describe("the standalone Canal Barge form", () => {
  it("sends USE_CANAL_BARGE from its own button once an Order is chosen", () => {
    const source = new ControlledSource("w-after-the-worker-action");
    mount(source, <CanalBarge source="after_action" />);
    const button = $<HTMLButtonElement>('[data-form-action="canal-barge"]');
    expect(button.getAttribute("aria-disabled")).toBe("true");
    click(button);
    expect(source.submitted).toEqual([]);
    click($('input[name="canalBarge.orderId"][value="O01"]'));
    expect($<HTMLButtonElement>('[data-form-action="canal-barge"]').getAttribute("aria-disabled")).toBeNull();
    click($('[data-form-action="canal-barge"]'));
    expect(source.submitted).toEqual([{ type: "USE_CANAL_BARGE", orderId: "O01", ceramicIds: ["c1"] }]);
  });

  it("renders nothing for a player without Canal Barge", () => {
    mount(new ControlledSource("m1_work_phase_r2_3p"), <CanalBarge source="before_action" />);
    expect(container.innerHTML).toBe("");
  });
});

function TrimTableClick({ orderId }: { orderId: string }) {
  const table = useTableSelection();
  return (
    <button type="button" data-test-order={orderId} data-state={table.orderTargets.get(orderId)?.state ?? ""} onClick={() => table.act({ type: "order", key: orderId })}>
      {orderId}
    </button>
  );
}

describe("the hand trim", () => {
  it("a table click on an Order card toggles it in the pane synchronously", () => {
    mount(
      new ControlledSource("w-cleanup-hand-limit"),
      <>
        <DecisionPane />
        <TrimTableClick orderId="O02" />
      </>,
    );
    expect($('[data-test-order="O02"]').getAttribute("data-state")).toBe("choosable");
    click($('[data-test-order="O02"]'));
    expect($<HTMLInputElement>('input[name="orderIds"][value="O02"]').checked).toBe(true);
    expect($('[data-test-order="O02"]').getAttribute("data-state")).toBe("discard");
    expect($(".confirm-summary").textContent).toBe("1 of 2 chosen");
  });

  it("a language switch keeps the draft and re-renders the summary", () => {
    mount(
      new ControlledSource("w-cleanup-hand-limit"),
      <>
        <LanguageToggle />
        <DecisionPane />
      </>,
    );
    click($('input[name="orderIds"][value="S01"]'));
    click($('input[name="orderIds"][value="O04"]'));
    expect($(".confirm-summary").textContent).toBe("Discard S01, O04");
    const toggle = [...container.querySelectorAll("button")].find((button) => button.textContent === "中文");
    expect(toggle).toBeDefined();
    click(toggle!);
    expect($(".confirm-summary").textContent).toBe("弃置S01、O04");
    expect($<HTMLInputElement>('input[name="orderIds"][value="O04"]').checked).toBe(true);
  });
});
