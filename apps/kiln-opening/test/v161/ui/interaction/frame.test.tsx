// @vitest-environment happy-dom
/**
 * The frame's interaction tier (UI_V1.6.1_ARCHITECTURE §9.3; A2, B6 after phase A): what static
 * markup cannot show.
 * - Sending: only `.pane-scroll` is `inert`; Confirm keeps focus with `aria-busy`; a second
 *   submit is ignored (§3.6, U3).
 * - A window change moves focus to the pane heading, or to the sheet strip when the heading is
 *   hidden (a phone sheet in `peek`) (§8.2).
 * - A table click (Place shortcut, kiln target) changes the pane's draft synchronously (§3.5).
 * - A language switch keeps the draft and re-renders the stored error in the new language (§6.1).
 * - The heading block (wireframe `promptBlock`, `ownSummary`): an eyebrow with the round phase and
 *   "Your turn" when the viewer acts, and the viewer's Imperial Recognition in the own summary.
 */
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PlayerView } from "../../../../src/game/index.ts";
import { DecisionPane } from "../../../../src/app/decision/DecisionPane.tsx";
import { RULE_NUMBERS, roundPhases } from "../../../../src/app/i18n/content.ts";
import { I18nProvider } from "../../../../src/app/i18n/I18nProvider.tsx";
import { LanguageToggle } from "../../../../src/app/kit/LanguageToggle.tsx";
import { DraftStore } from "../../../../src/app/state/draftStore.ts";
import { GameProvider, useTableSelection } from "../../../../src/app/state/hooks.ts";
import { fixedLayoutSource } from "../../../../src/app/state/layoutMode.ts";
import { UiStore } from "../../../../src/app/state/uiStore.ts";
import { ControlledSource } from "../support/controlledSource.ts";
import { fixture } from "../support/fixtures.ts";
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

function mount(source: ControlledSource, element: ReactElement, locale: "en" | "zh-CN" = "en"): void {
  const layout = fixedLayoutSource("desktop");
  const ui = new UiStore({ layout });
  const drafts = new DraftStore();
  act(() =>
    root.render(
      <I18nProvider defaultLocale={locale} strict>
        <GameProvider source={source} registry={TOY_WINDOWS} drafts={drafts} ui={ui} layout={layout} devTools={false}>
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

/** The Kiln selection view after the viewer chose: the next player selects. */
function afterSelection(view: PlayerView): PlayerView {
  const phase = view.game.phase as { type: "setup_kiln_selection"; selectionOrder: string[]; index: number };
  return {
    ...view,
    game: { ...view.game, revision: view.game.revision + 1, phase: { ...phase, index: phase.index + 1 } },
  };
}

describe("sending (§3.6)", () => {
  it("makes only the fields inert, keeps focus on a busy Confirm and ignores a second submit", async () => {
    const source = new ControlledSource("w-kiln-and-main-order-choice");
    mount(source, <DecisionPane />);
    const confirm = $<HTMLButtonElement>('[data-action="confirm"]');
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    click($('input[name="kilnId"][value="JU"]'));
    expect(confirm.getAttribute("aria-disabled")).toBeNull();
    act(() => confirm.focus());
    click(confirm);
    // The toy starts on the first face-up Main Order (rev. 4 change 32, R23).
    const display = fixture("w-kiln-and-main-order-choice").playerView.game.market.display;
    expect(source.submitted).toEqual([{ type: "SELECT_KILN", kilnId: "JU", mainOrder: { slotIndex: 0, orderId: display[0] } }]);
    expect($(".pane-scroll").hasAttribute("inert")).toBe(true);
    expect(confirm.closest("[inert]")).toBeNull();
    expect(confirm.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(confirm);
    click(confirm);
    act(() => {
      $<HTMLFormElement>("form[data-window]").requestSubmit();
    });
    expect(source.submitted).toHaveLength(1);
    await act(async () => source.answer({ reject: { kind: "rule", error: { code: "NOT_YOUR_DECISION", message: "", details: {} } } }));
    expect($(".pane-scroll").hasAttribute("inert")).toBe(false);
    expect(confirm.getAttribute("aria-busy")).toBeNull();
    expect($(".confirm-error").textContent).not.toBe("");
  });
});

describe("focus on a window change (§8.2)", () => {
  it("moves to the pane heading when focus was in the pane", async () => {
    const source = new ControlledSource("w-kiln-and-main-order-choice");
    mount(source, <DecisionPane />);
    click($('input[name="kilnId"][value="JU"]'));
    const confirm = $<HTMLButtonElement>('[data-action="confirm"]');
    act(() => confirm.focus());
    click(confirm);
    await act(async () => source.answer({ view: afterSelection(fixture("w-kiln-and-main-order-choice").playerView) }));
    expect($("form[data-window]").getAttribute("data-window")).toBe("waiting");
    expect(document.activeElement).toBe($("h2.pane-heading"));
  });

  it("moves to the sheet strip when the heading is hidden (phone sheet in peek)", () => {
    const source = new ControlledSource("w-kiln-and-main-order-choice");
    mount(source, <DecisionPane />);
    const heading = $("h2.pane-heading");
    heading.getClientRects = () => ({ length: 0 }) as unknown as DOMRectList;
    act(() => $<HTMLInputElement>('input[name="kilnId"][value="RU"]').focus());
    act(() => source.setView(afterSelection(fixture("w-kiln-and-main-order-choice").playerView)));
    expect(document.activeElement).toBe($(".kit-sheet-strip"));
  });

  it("leaves focus alone when it was outside the pane", () => {
    const source = new ControlledSource("w-kiln-and-main-order-choice");
    mount(
      source,
      <>
        <button type="button" id="outside">
          outside
        </button>
        <DecisionPane />
      </>,
    );
    const outside = $<HTMLButtonElement>("#outside");
    act(() => outside.focus());
    act(() => source.setView(afterSelection(fixture("w-kiln-and-main-order-choice").playerView)));
    expect(document.activeElement).toBe(outside);
  });
});

/** jsdom keeps no scroll position: a `scrollTop` on the element itself, read back by the test. */
function fakeScroll(element: HTMLElement, initial: number): () => number {
  let top = initial;
  Object.defineProperty(element, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = value;
    },
  });
  return () => top;
}

describe("scroll on a window change", () => {
  it("opens a new acting window at the top of its fields, not where the last one was scrolled to", () => {
    // Before the worker action, then the Commission Market's Select: the same `.pane-scroll` element.
    const source = new ControlledSource("w-before-the-worker-action-rich-4-player-start");
    mount(source, <DecisionPane />);
    const scroll = $(".pane-scroll");
    const top = fakeScroll(scroll, 1001);
    act(() => source.setView(fixture("w-commission-market-shifu-top-3-look-2-reservations").playerView));
    expect($("form[data-window]").getAttribute("data-window")).toBe("commission");
    expect($(".pane-scroll")).toBe(scroll);
    expect(top()).toBe(0);
  });

  it("starts the fields at the top when the viewer's window becomes a waiting one", () => {
    const source = new ControlledSource("w-kiln-and-main-order-choice");
    mount(source, <DecisionPane />);
    const top = fakeScroll($(".pane-scroll"), 240);
    act(() => source.setView(afterSelection(fixture("w-kiln-and-main-order-choice").playerView)));
    expect($("form[data-window]").getAttribute("data-window")).toBe("waiting");
    expect(top()).toBe(0);
  });

  it("keeps a waiting window's place when only the player it waits for changes", () => {
    const waiting = afterSelection(fixture("w-kiln-and-main-order-choice").playerView);
    const source = new ControlledSource("w-kiln-and-main-order-choice");
    mount(source, <DecisionPane />);
    act(() => source.setView(waiting));
    const top = fakeScroll($(".pane-scroll"), 120);
    act(() => source.setView(afterSelection(waiting)));
    expect($("form[data-window]").getAttribute("data-window")).toBe("waiting");
    expect(top()).toBe(120);
  });

  it("keeps the place while the same window re-renders (a choice in a long list)", () => {
    const source = new ControlledSource("w-kiln-and-main-order-choice");
    mount(source, <DecisionPane />);
    const top = fakeScroll($(".pane-scroll"), 300);
    click($('input[name="kilnId"][value="JU"]'));
    expect(top()).toBe(300);
  });
});

describe("table selection (§3.5)", () => {
  function KilnTargets() {
    const table = useTableSelection();
    return (
      <div>
        {[...table.kilnTargets].map(([spaceId, target]) => (
          <button key={spaceId} type="button" data-act="dest" data-space={spaceId} aria-pressed={target.pressed} onClick={() => table.act({ type: "kilnSpace", spaceId })}>
            {spaceId}
          </button>
        ))}
      </div>
    );
  }

  it("a kiln-target click changes the pane's draft in the same render", () => {
    const source = new ControlledSource("w-setters-mark-window");
    mount(
      source,
      <>
        <KilnTargets />
        <DecisionPane />
      </>,
    );
    const target = $<HTMLButtonElement>('[data-act="dest"]');
    const spaceId = target.getAttribute("data-space")!;
    expect($('[data-toy="mark"]').textContent).toBe("none");
    click(target);
    expect($('[data-toy="mark"]').textContent).toBe(spaceId);
    expect($(`[data-space="${spaceId}"]`).getAttribute("aria-pressed")).toBe("true");
  });

  it("offers the spec's alternative as data-action=alt", () => {
    const source = new ControlledSource("w-setters-mark-window");
    mount(source, <DecisionPane />);
    click($('[data-action="alt"]'));
    expect(source.submitted).toEqual([{ type: "PLACE_SETTERS_MARK", spaceId: null }]);
  });
});

describe("language switch (§6.1, §9.3)", () => {
  it("keeps the draft and re-renders the stored error in the new language", () => {
    const source = new ControlledSource("w-kiln-and-main-order-choice", {
      status: { error: { kind: "rule", error: { code: "NOT_YOUR_DECISION", message: "", details: {} } } },
    });
    mount(
      source,
      <>
        <LanguageToggle />
        <DecisionPane />
      </>,
    );
    click($('input[name="kilnId"][value="GE"]'));
    const english = $(".confirm-error").textContent;
    click($('button[lang="zh-Hans"]'));
    expect($<HTMLInputElement>('input[name="kilnId"][value="GE"]').checked).toBe(true);
    const chinese = $(".confirm-error").textContent;
    expect(chinese).not.toBe(english);
    expect(chinese).toMatch(/[一-鿿]/);
    expect($('[data-action="confirm"]').textContent).toBe("确认");
  });
});

describe("heading block (wireframe promptBlock, ownSummary)", () => {
  const phaseName = (id: string, locale: "en" | "zh-CN") => roundPhases(locale).find((phase) => phase.id === id)!.name;

  it("puts the round phase and Your turn above the heading, and Recognition in the own summary", () => {
    const source = new ControlledSource("m1_work_phase_r2_3p");
    mount(source, <DecisionPane />);
    const eyebrow = $(".pane-eyebrow");
    expect(eyebrow.textContent).toBe(`${phaseName("work", "en")} · Your turn`);
    // Above the heading, which stays the focus target.
    expect(eyebrow.nextElementSibling?.matches("h2.pane-heading")).toBe(true);
    const recognition = $(".own .own-recognition");
    const n = Number(recognition.getAttribute("data-recognition"));
    expect(recognition.textContent).toBe(`Recognition ${n}/${RULE_NUMBERS.recognitionMax}`);
  });

  it("reads the same in Chinese", () => {
    const source = new ControlledSource("m1_work_phase_r2_3p");
    mount(source, <DecisionPane />, "zh-CN");
    expect($(".pane-eyebrow").textContent).toBe(`${phaseName("work", "zh-CN")}·轮到你了`);
    const recognition = $(".own .own-recognition");
    expect(recognition.textContent).toBe(`声望${recognition.getAttribute("data-recognition")}／${RULE_NUMBERS.recognitionMax}`);
  });

  it("shows only the phase when the viewer does not act, and Final scoring once the game is over", () => {
    const source = new ControlledSource("m8_final_results_3p");
    mount(source, <DecisionPane />);
    expect($(".pane-eyebrow").textContent).toBe("Final scoring");
  });
});
