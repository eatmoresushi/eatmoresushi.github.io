// @vitest-environment happy-dom
/**
 * The Kiln section's strip between firings (B3; owner review 2026-10-17; D4; UI_V1.6.1_ARCHITECTURE
 * §4.2, §8.1). It replaces the "Last firing" recap:
 * - only this round's Kiln Die (the die piece and its number; "not rolled yet" before the roll),
 *   in English and Chinese, one sentence for assistive technology;
 * - a "Fire discard" disclosure button (`aria-expanded`, `aria-controls`) whose panel lists every
 *   discarded Fire card in discard order, oldest first, or "empty"; no count anywhere (D4);
 * - Escape closes the panel and keeps focus on the button; a second click closes it too;
 * - no recap: no "Last firing", equation, Quality, skipped-round note or "No firing yet";
 * - it sits in the Kiln section, above the kiln, outside the Firing Phase.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FireModifier } from "../../../../src/game/index.ts";
import { IdleFiringRecap } from "../../../../src/app/kiln/IdleFiringRecap.tsx";
import { fixture, fixtureSource } from "../support/fixtures.ts";
import { harness, renderComponent, renderScreen } from "../support/render.tsx";
import { elementAt, perceivable } from "./support.ts";

const render = (id: string, locale: "en" | "zh-CN" = "en") => renderComponent(fixtureSource(id), <IdleFiringRecap />, { locale });

/** The discard button and the panel it controls, from static markup. */
function parts(html: string): { button: string; panel: string } {
  const button = elementAt(html, /<button[^>]*aria-controls="/);
  const controls = /aria-controls="([^"]+)"/.exec(button)?.[1] ?? "";
  const panel = elementAt(html, new RegExp(`<div id="${controls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  return { button, panel };
}

const discardValues = (html: string): FireModifier[] => [...html.matchAll(/data-fire="(-?\d)"/g)].map((match) => Number(match[1]) as FireModifier);

describe("the Kiln section strip: this round's Kiln Die", () => {
  it("shows the Kiln Die number with the die piece, in both languages", () => {
    const die = fixture("m1_work_phase_r2_3p").playerView.game.kilnDie?.value;
    expect(die).toBeDefined();
    const en = render("m1_work_phase_r2_3p");
    expect(en).toMatch(new RegExp(`class="die"[^>]*><span aria-hidden="true">${String(die)}</span>`));
    expect(perceivable(en)).toContain("Kiln Die this round");
    // One sentence for assistive technology; the visible label and the die are hidden from it.
    expect(en).toContain(`<span class="sr-only">Kiln Die this round: ${String(die)}</span>`);
    expect(en).toMatch(/<span class="kstrip-die-label" aria-hidden="true">/);
    expect(en).toMatch(/<span class="kstrip-die-piece" aria-hidden="true">/);
    const zh = render("m1_work_phase_r2_3p", "zh-CN");
    expect(zh).toContain(`<span class="sr-only">本轮窑骰：${String(die)}</span>`);
    expect(perceivable(zh)).toContain("本轮窑骰");
  });

  it("says the Kiln Die is not rolled yet before the roll", () => {
    expect(fixture("m15_kiln_selection").playerView.game.kilnDie).toBeNull();
    const en = render("m15_kiln_selection");
    expect(perceivable(en)).toContain("not rolled yet");
    expect(en).toContain('<span class="sr-only">Kiln Die this round: not rolled yet</span>');
    expect(render("m15_kiln_selection", "zh-CN")).toContain('<span class="sr-only">本轮窑骰：尚未掷出</span>');
  });
});

describe("the Kiln section strip: the Fire discard button (D4)", () => {
  it("is a collapsed disclosure button whose panel lists every discarded Fire card, oldest first", () => {
    for (const id of ["m1_work_phase_r2_3p", "m6_order_phase_crackle_3p", "m7_cleanup_hand_limit_3p"]) {
      const discard = fixture(id).playerView.game.fireDiscard;
      expect(discard.length).toBeGreaterThan(0);
      for (const locale of ["en", "zh-CN"] as const) {
        const { button, panel } = parts(render(id, locale));
        expect(button).toContain('aria-expanded="false"');
        expect(button).toContain('type="button"');
        expect(perceivable(button)).toContain(locale === "en" ? "Fire discard" : "窑火弃牌堆");
        expect(panel).toMatch(/^<div id="[^"]+" class="kstrip-panel" hidden="">/);
        expect(discardValues(panel), `${id} ${locale}`).toEqual(discard);
        expect(panel).toContain(locale === "en" ? 'aria-label="Fire discard, oldest first"' : 'aria-label="窑火弃牌堆，最早在前"');
        expect(perceivable(panel)).toContain(locale === "en" ? "Oldest first" : "最早在前");
      }
    }
  });

  it("reads 'empty' when nothing has been discarded", () => {
    // Round 1, before the first firing.
    const id = "w-guild-hall-shifu-inspection";
    expect(fixture(id).playerView.game.fireDiscard).toEqual([]);
    const { panel } = parts(render(id));
    expect(perceivable(panel)).toContain("empty");
    expect(perceivable(panel)).not.toContain("none yet");
    expect(panel).not.toContain("fdiscard-list");
    expect(panel).not.toContain("Oldest first");
    expect(perceivable(parts(render(id, "zh-CN")).panel)).toContain("暂无");
  });

  it("shows no count of cards, on the button or anywhere in the strip", () => {
    for (const id of ["m1_work_phase_r2_3p", "m6_order_phase_crackle_3p", "m12_guild_shifu_inspection"]) {
      const deck = fixture(id).playerView.game.counts.fireDeck;
      for (const locale of ["en", "zh-CN"] as const) {
        const html = render(id, locale);
        expect(perceivable(parts(html).button)).not.toMatch(/\d/);
        expect(perceivable(html)).not.toMatch(/cards left|cards remaining|left in the deck|odds|chance|余张|剩余|概率/i);
        expect(perceivable(html)).not.toMatch(new RegExp(`(?<![−+\\d])${String(deck)}(?!\\d)\\s*(Fire cards|cards|张)`));
        expect(html).not.toMatch(/data-[\w-]*(deck|count)[\w-]*="/i);
      }
    }
  });
});

describe("the Kiln section strip: no firing recap (owner review, 2026-10-17)", () => {
  it("has no Last firing row, equation, Qualities, skipped-round note or 'No firing yet'", () => {
    for (const id of ["m1_work_phase_r2_3p", "t-firing-skipped", "m12_guild_shifu_inspection", "m7_cleanup_hand_limit_3p"]) {
      for (const locale of ["en", "zh-CN"] as const) {
        const html = render(id, locale);
        const text = perceivable(html);
        expect(text, `${id} ${locale}`).not.toMatch(/Last firing|No firing yet|Base Heat|Global Heat|Contributions|nothing was loaded|Qualities/);
        expect(text, `${id} ${locale}`).not.toMatch(/上次烧窑|尚未烧窑|基础火候|全窑火候|控火|没有器物装窑|所定品质/);
        expect(html).not.toMatch(/data-quality=|class="recap/);
      }
    }
  });

  it("sits in the Kiln section outside the Firing Phase, above the kiln", () => {
    const html = renderScreen(fixtureSource("m7_cleanup_hand_limit_3p"));
    const section = elementAt(html, /<section id="sec-kiln"/);
    expect(section.indexOf('class="kstrip"')).toBeGreaterThan(-1);
    expect(section.indexOf('class="kstrip"')).toBeLessThan(section.indexOf('class="kilnbox"'));
    expect(section).not.toContain('class="recap"');
  });
});

// ── Interaction (happy-dom) ─────────────────────────────────────────────────────────────────

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

describe("the Fire discard button (keyboard and pointer)", () => {
  it("opens on click, closes on Escape with focus back on the button, and toggles on a second click", () => {
    const setup = harness(fixtureSource("m6_order_phase_crackle_3p"));
    act(() => root.render(setup.wrap(<IdleFiringRecap />)));
    const button = container.querySelector<HTMLButtonElement>(".kstrip button[aria-controls]");
    expect(button).toBeTruthy();
    const panel = document.getElementById(button!.getAttribute("aria-controls")!);
    expect(panel).toBeTruthy();
    expect(button!.getAttribute("aria-expanded")).toBe("false");
    expect(panel!.hidden).toBe(true);

    act(() => button!.click());
    expect(button!.getAttribute("aria-expanded")).toBe("true");
    expect(panel!.hidden).toBe(false);
    const values = [...panel!.querySelectorAll("[data-fire]")].map((card) => Number(card.getAttribute("data-fire")));
    expect(values).toEqual(fixture("m6_order_phase_crackle_3p").playerView.game.fireDiscard);

    // Escape from inside the strip closes it and returns focus to the button; the page above
    // does not also see that Escape (it closed the panel).
    const page: string[] = [];
    const listener = (event: KeyboardEvent) => page.push(event.key);
    document.body.addEventListener("keydown", listener);
    const card = panel!.querySelector("[data-fire]")!;
    act(() => button!.blur());
    key(card, "Escape");
    expect(button!.getAttribute("aria-expanded")).toBe("false");
    expect(panel!.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
    expect(page).toEqual([]);

    // Escape on a closed strip is left to the page.
    key(button!, "Escape");
    expect(page).toEqual(["Escape"]);
    document.body.removeEventListener("keydown", listener);

    act(() => button!.click());
    expect(button!.getAttribute("aria-expanded")).toBe("true");
    act(() => button!.click());
    expect(button!.getAttribute("aria-expanded")).toBe("false");
    expect(panel!.hidden).toBe(true);
  });
});
