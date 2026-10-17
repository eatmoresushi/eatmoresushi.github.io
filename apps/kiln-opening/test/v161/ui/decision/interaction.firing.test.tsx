// @vitest-environment happy-dom
/**
 * B5's interaction tier (UI_V1.6.1_ARCHITECTURE §9.3): what static markup cannot show. Owner: B5.
 * - Rules details (D10) open on keyboard focus, and Escape closes them and returns focus; near a
 *   clipping edge the panel takes the roomier side and is capped to the room there.
 * - The Order Phase form: choosing an Order with one group preselects it; Confirm sends
 *   `COMPLETE_ORDER`; the alternative sends `END_ORDER_TURN`.
 * - Second Firing's choice (v1.6.2 L631): a revealed card and R7's Jun side; Confirm sends
 *   `SECOND_FIRING_CHOOSE`; Clear forgets both; a rejection reads in the engine's words.
 * - Contributions with Fuel Ledger (v1.6.2 L637): the commitment for Bank and Stoke only, and
 *   the free Bank without it.
 * - After-Quality: Protective Saggars' Standard → Fine with Confirm; "Done" declines (R4).
 * - The hand trim: a table click on an Order card toggles it in the pane synchronously.
 * - A language switch keeps the draft and re-renders the ConfirmBar summary.
 */
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KILNS } from "../../../../src/game/index.ts";
import { DecisionPane } from "../../../../src/app/decision/DecisionPane.tsx";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { I18nProvider } from "../../../../src/app/i18n/I18nProvider.tsx";
import { kilnText } from "../../../../src/app/i18n/content.ts";
import { LanguageToggle } from "../../../../src/app/kit/LanguageToggle.tsx";
import { DraftStore } from "../../../../src/app/state/draftStore.ts";
import { GameProvider, useTableSelection } from "../../../../src/app/state/hooks.ts";
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
    // Only the full rule and the clarifications, as plain text (owner review, 2026-10-17).
    expect(panel.getAttribute("aria-label")).toBe(`Full rules: ${kilnText("JU", "en").name} · ${kilnText("JU", "en").abilityName}`);
    expect([...panel.querySelectorAll(".rd-h")].map((heading) => heading.textContent)).toEqual(["Full rule", ...(KILNS.JU.clarifications.length > 0 ? ["Clarifications"] : [])]);
    expect(panel.querySelector(".rd-rule")?.textContent).toBe(kilnText("JU", "en").ability);
    for (const item of KILNS.JU.clarifications) expect(panel.textContent).toContain(item.en);
    expect(panel.textContent).not.toMatch(/Source:|Owner ruling/);
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
    click($('input[name="orderId"][value="O30"]'));
    expect($<HTMLInputElement>('input[name="ceramicIds"][value="c6+c16"]').checked).toBe(true);
    expect($(".confirm-summary").textContent).toBe("Complete O30 with White Bowl, Plain · Masterpiece, Moon White Brush Washer, Plain · Masterpiece");
    click($('[data-action="confirm"]'));
    expect(source.submitted.at(-1)).toEqual({ type: "COMPLETE_ORDER", orderId: "O30", ceramicIds: ["c6", "c16"] });
    await act(async () => source.answer({ reject: null }));
    click($('[data-action="alt"]'));
    expect(source.submitted.at(-1)).toEqual({ type: "END_ORDER_TURN" });
  });

  it("a blocked Order cannot be chosen", () => {
    mount(new ControlledSource("m6_order_phase_crackle_3p"), <DecisionPane />);
    const blocked = $<HTMLInputElement>('input[name="orderId"][value="O48"]');
    expect(blocked.getAttribute("aria-disabled")).toBe("true");
    click(blocked);
    expect(blocked.checked).toBe(false);
    expect(container.querySelector('input[name="ceramicIds"]')).toBeNull();
  });
});

describe("Second Firing's choice (v1.6.2 L631, R7)", () => {
  it("chooses a revealed card and Jun's side, and Confirm sends SECOND_FIRING_CHOOSE", () => {
    const source = new ControlledSource("w-second-firing-choice-with-jun-r7");
    mount(source, <DecisionPane />);
    expect($('[data-action="confirm"]').getAttribute("aria-disabled")).toBe("true");
    expect(container.querySelector('[data-action="alt"]')).toBeNull();
    // Jun starts unused (R4): "Do not use" is the checked side.
    expect($<HTMLInputElement>('input[name="jun"][value="none"]').checked).toBe(true);
    click($('input[name="cardIndex"][value="1"]'));
    expect($<HTMLInputElement>('input[name="cardIndex"][value="1"]').checked).toBe(true);
    expect($(".confirm-summary").textContent).toMatch(/^Fire .+ again with Fire card −1$/);
    click($('input[name="jun"][value="1"]'));
    expect($(".confirm-summary").textContent).toMatch(/then Kiln Transformation \+1 for 1 Wood$/);
    click($('[data-action="confirm"]'));
    expect(source.submitted).toEqual([{ type: "SECOND_FIRING_CHOOSE", cardIndex: 1, jun: { delta: 1 } }]);
  });

  it("without Jun ready, only the card is chosen", () => {
    // The R7 scenario with the viewer on the Ding Kiln instead: Jun is not their ability.
    const source = new ControlledSource("w-second-firing-choice-with-jun-r7");
    const view = structuredClone(source.getSnapshot().view);
    if (view === null) throw new Error("fixture has no view");
    view.game.players[view.viewerId!]!.kilnId = "DI";
    source.setView(view);
    mount(source, <DecisionPane />);
    expect(container.querySelector('input[name="jun"]')).toBeNull();
    click($('input[name="cardIndex"][value="0"]'));
    click($('[data-action="confirm"]'));
    expect(source.submitted).toEqual([{ type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: null }]);
  });
});

describe("Second Firing: Clear and a server rejection in the player's words", () => {
  it("Clear forgets the card and Jun; a rejection shows the engine's text in English and Chinese", () => {
    const source = new ControlledSource("w-second-firing-choice-with-jun-r7");
    mount(source, <DecisionPane />);
    click($('input[name="cardIndex"][value="0"]'));
    click($('input[name="jun"][value="-1"]'));
    const clear = [...container.querySelectorAll("button")].find((button) => button.textContent === "Clear");
    expect(clear).toBeDefined();
    click(clear!);
    expect($<HTMLInputElement>('input[name="cardIndex"][value="0"]').checked).toBe(false);
    expect($<HTMLInputElement>('input[name="jun"][value="none"]').checked).toBe(true);
    expect($(".confirm-summary").textContent).toBe("Choose one of the Fire cards.");
    click($('input[name="cardIndex"][value="1"]'));
    click($('input[name="jun"][value="1"]'));
    click($('[data-action="confirm"]'));
    expect(source.submitted).toEqual([{ type: "SECOND_FIRING_CHOOSE", cardIndex: 1, jun: { delta: 1 } }]);
    act(() => source.answer({ reject: { kind: "rule", error: { code: "INSUFFICIENT_RESOURCES", message: "", details: { resource: "wood", needed: 1, have: 0 } } } }));
    expect($(".confirm-error").textContent).toBe("Not enough Wood: you need 1 and have 0.");
  });
});

describe("Contributions with Fuel Ledger (v1.6.2 L637)", () => {
  it("the commitment applies to Bank and Stoke only; Confirm sends the secret card with it", () => {
    const source = new ControlledSource("w-secret-contributions-with-fuel-ledger");
    mount(source, <DecisionPane />);
    const tend = () => $<HTMLInputElement>('input[name="card"][value="TEND"]');
    click(tend());
    expect(tend().checked).toBe(true);
    click($('input[name="fuelLedger"]'));
    expect($<HTMLInputElement>('input[name="fuelLedger"]').checked).toBe(true);
    // Tend cannot take the commitment: it is greyed out with the reason and dropped.
    expect(tend().getAttribute("aria-disabled")).toBe("true");
    expect(tend().checked).toBe(false);
    expect(document.getElementById(tend().getAttribute("aria-describedby")!.split(" ")[0]!)?.textContent).toBe("Only with Bank the Fire or Stoke the Fire.");
    click(tend());
    expect(tend().checked).toBe(false);
    click($('input[name="card"][value="STOKE"]'));
    expect($(".confirm-summary").textContent).toBe("Submit Stoke the Fire with Fuel Ledger in secret: Heat +2, 1 Wood at reveal");
    click($('[data-action="confirm"]'));
    expect(source.submitted).toEqual([{ type: "SUBMIT_CONTRIBUTION", windowId: "test-game:r1:contributions", card: "STOKE", fuelLedger: true }]);
  });

  it("without the commitment, Bank costs no Wood", () => {
    const source = new ControlledSource("w-secret-contributions-with-fuel-ledger");
    mount(source, <DecisionPane />);
    click($('input[name="card"][value="BANK"]'));
    expect($(".confirm-summary").textContent).toBe("Submit Bank the Fire in secret: Heat −1, no Wood");
    click($('[data-action="confirm"]'));
    expect(source.submitted).toEqual([{ type: "SUBMIT_CONTRIBUTION", windowId: "test-game:r1:contributions", card: "BANK", fuelLedger: false }]);
  });
});

describe("after-Quality: Protective Saggars (v1.6.2 L628, R4)", () => {
  it("turns a Standard ceramic Fine with Confirm, or declines with the alternative", () => {
    const source = new ControlledSource("w-after-quality-saggars-and-ge");
    mount(source, <DecisionPane />);
    click($('input[name="afterQuality"][value="protective_saggars:c2"]'));
    expect($(".confirm-summary").textContent).toBe("Use Protective Saggars: Moon White Plate, Plain · Standard becomes Fine");
    click($('[data-action="confirm"]'));
    expect(source.submitted).toEqual([{ type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c2" }]);
    const other = new ControlledSource("w-after-quality-saggars-and-ge");
    act(() => root.unmount());
    root = createRoot(container);
    mount(other, <DecisionPane />);
    expect($('[data-action="alt"]').textContent).toBe("Done — decline the rest");
    click($('[data-action="alt"]'));
    expect(other.submitted).toEqual([{ type: "END_AFTER_QUALITY" }]);
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
