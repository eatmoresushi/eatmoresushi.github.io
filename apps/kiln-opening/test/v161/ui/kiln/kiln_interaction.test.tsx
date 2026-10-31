// @vitest-environment happy-dom
/**
 * Kiln interaction (B3; UI_V1.6.1_ARCHITECTURE §3.5, §8.1, §9.3; D10):
 * - keyboard focus on a kiln tile opens its rules details; Escape closes them and keeps focus;
 *   a click pins them open;
 * - a click on a kiln target becomes a draft action of the open window (the Setter's Mark toy
 *   adapter), synchronously, and the target's `aria-pressed` follows the draft.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KilnBlock } from "../../../../src/app/kiln/KilnBlock.tsx";
import { settersMarkOptions } from "../../../../src/game/index.ts";
import { fixture, fixtureSource } from "../support/fixtures.ts";
import { harness } from "../support/render.tsx";
import { TOY_WINDOWS } from "../support/toyWindows.tsx";

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

function key(target: Element, keyName: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: keyName, bubbles: true, cancelable: true }));
  });
}

describe("kiln tile rules details (D10)", () => {
  it("opens on keyboard focus, closes on Escape with focus kept, and pins on click", () => {
    // m9: Zhao's Setter's Mark tile on High 1.
    const setup = harness(fixtureSource("m9_contributions_step1_3p"));
    act(() => root.render(setup.wrap(<KilnBlock />)));
    const cell = container.querySelector('[data-space="high_1"]');
    const trigger = cell?.querySelector<HTMLButtonElement>(".ktile-detail .kit-detail-trigger");
    expect(trigger).toBeTruthy();
    const panel = document.getElementById(trigger!.getAttribute("aria-controls")!);
    expect(panel?.hidden).toBe(true);
    act(() => trigger!.focus());
    expect(trigger!.getAttribute("aria-expanded")).toBe("true");
    expect(panel?.hidden).toBe(false);
    expect(panel?.textContent).toContain("Full rule");
    expect(panel?.textContent).toContain("Clarifications");
    key(trigger!, "Escape");
    expect(trigger!.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    act(() => trigger!.click());
    expect(trigger!.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("kiln targets (§3.5)", () => {
  it("turn a click into a draft action of the open window, synchronously", () => {
    const id = "w-setters-mark-window";
    const offered = settersMarkOptions(fixture(id).playerView);
    const setup = harness(fixtureSource(id), { registry: TOY_WINDOWS });
    act(() => root.render(setup.wrap(<KilnBlock />)));
    const [first, second] = offered;
    const button = (spaceId: string) => container.querySelector<HTMLButtonElement>(`button[data-space="${spaceId}"]`)!;
    expect(button(first!).getAttribute("aria-pressed")).toBe("false");
    act(() => button(first!).click());
    expect(button(first!).getAttribute("aria-pressed")).toBe("true");
    act(() => button(second!).click());
    expect(button(first!).getAttribute("aria-pressed")).toBe("false");
    expect(button(second!).getAttribute("aria-pressed")).toBe("true");
  });
});
