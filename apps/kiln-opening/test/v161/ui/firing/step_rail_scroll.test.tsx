// @vitest-environment happy-dom
/**
 * The firing step rail scrolls itself to the open step (B3; UI_V1.6.1_ARCHITECTURE §4.2, §9.3;
 * wireframe `ol.scrollLeft = st.offsetLeft - 40`): on a narrow stage the rail is a scroll box, and
 * every time the open step changes the rail (never the page) moves so that step sits 40px from
 * its start edge. happy-dom has no layout, so the items' boxes are stubbed as a 96px-per-step
 * rail 390px wide (a phone stage).
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { firingStageView } from "../../../../src/game/index.ts";
import { STEP_RAIL_LEAD_PX, StepRail } from "../../../../src/app/firing/StepRail.tsx";
import { fixture, fixtureSource } from "../support/fixtures.ts";
import { harness } from "../support/render.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEM_PX = 96;
const RAIL_PX = 390;

const stage = (id: string) => {
  const view = firingStageView(fixture(id).playerView);
  if (view === null) throw new Error(`${id} has no firing`);
  return view;
};

function box(left: number, width: number): DOMRect {
  return { left, right: left + width, x: left, y: 0, top: 0, bottom: 44, width, height: 44, toJSON: () => ({}) } as DOMRect;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("steps")) return box(0, RAIL_PX);
    const step = Number(this.dataset["step"] ?? "0");
    const rail = this.closest<HTMLElement>(".steps");
    return box((step - 1) * ITEM_PX - (rail?.scrollLeft ?? 0), ITEM_PX);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("step rail scrolls to the open step (390px stage)", () => {
  it("scrolls the rail, not the page, to the open step on mount and whenever the step changes", () => {
    const pageScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const original = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    const intoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, writable: true, value: intoView });
    onTestFinished(() => {
      if (original) Object.defineProperty(Element.prototype, "scrollIntoView", original);
      else delete (Element.prototype as Partial<Element>).scrollIntoView;
    });
    const first = stage("m11b_test_pieces_bury");
    const later = stage("m3_kiln_master_marker_3p");
    expect(first.step).not.toBe(later.step);
    const setup = harness(fixtureSource("m3_kiln_master_marker_3p"));
    act(() => root.render(setup.wrap(<StepRail stage={first} />)));
    const rail = container.querySelector<HTMLOListElement>("ol.steps")!;
    const expected = (step: number) => Math.max(0, (step - 1) * ITEM_PX - STEP_RAIL_LEAD_PX);
    expect(rail.scrollLeft).toBe(expected(first.step));
    act(() => root.render(setup.wrap(<StepRail stage={later} />)));
    expect(rail.querySelector('[aria-current="step"]')?.getAttribute("data-step")).toBe(String(later.step));
    expect(rail.scrollLeft).toBe(expected(later.step));
    // The open step's box now starts STEP_RAIL_LEAD_PX inside the rail, so it is visible.
    const current = rail.querySelector<HTMLElement>('[aria-current="step"]')!.getBoundingClientRect();
    expect(current.left).toBe(STEP_RAIL_LEAD_PX);
    expect(current.right).toBeLessThanOrEqual(RAIL_PX);
    expect(pageScroll).not.toHaveBeenCalled();
    expect(intoView).not.toHaveBeenCalled();
  });
});
