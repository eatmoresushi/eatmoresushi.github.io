/**
 * Top bar, phase strip, Kiln Die chip and the world's sections (UI_V1.6.1_ARCHITECTURE §4.1,
 * §7.3, §8.1, §9.2; B1).
 *
 * - the header holds brand (the screen's h1), round, phases, Kiln Die, then log, language and
 *   menu, then the seat chips, in the same markup at every width; the drawn order follows the
 *   markup, so the Tab order matches what is seen at every width (WCAG 2.4.3);
 * - the language control is one button naming the other language;
 * - the phase strip follows `roundPhaseOf`, marks the current phase `aria-current="step"` and adds
 *   the Appendix D step during the Firing Phase; a finished game adds Final scoring;
 * - the sections follow `sectionOrder`, each with a focusable heading and its phone tab, the
 *   current tab's sections marked `data-current`; the jump bar lists them in the same order.
 */
import { describe, expect, it } from "vitest";
import { roundPhaseOf } from "../../../../src/game/index.ts";
import { roundPhases } from "../../../../src/app/i18n/content.ts";
import { GameShell } from "../../../../src/app/shell/GameShell.tsx";
import { PhaseStrip } from "../../../../src/app/shell/PhaseStrip.tsx";
import { TopBar } from "../../../../src/app/shell/TopBar.tsx";
import { WorldSections } from "../../../../src/app/shell/WorldSections.tsx";
import { SECTION_TAB, sectionOrder, windowUiDefaults } from "../../../../src/app/state/uiStore.ts";
import { allFixtures, fixture, fixtureSource } from "../support/fixtures.ts";
import { renderComponent, renderScreen } from "../support/render.tsx";
import { attr, modelOf } from "./support.tsx";

function phaseItems(html: string): string[] {
  return html.split('<li class="phase-strip-item"').slice(1);
}

describe("top bar", () => {
  it("holds every control in one header, tools before the seat chips", () => {
    const html = renderComponent(fixtureSource("m1_work_phase_r2_3p"), <TopBar />);
    expect(html.startsWith('<header class="top-bar"><h1 class="top-bar-brand">Kiln Opening</h1>')).toBe(true);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(renderComponent(fixtureSource("m1_work_phase_r2_3p"), <TopBar />, { locale: "zh-CN" })).toContain('<h1 class="top-bar-brand">开窑</h1>');
    const order = ["top-bar-brand", "top-bar-round", "phase-strip", "die-chip", "top-bar-tools", "game-log", "language-switch", "kit-menu", "top-bar-seats", "seat-chips"];
    const positions = order.map((name) => html.indexOf(`class="${name}`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).toContain("Round <strong>2</strong>/5");
    expect(renderComponent(fixtureSource("m1_work_phase_r2_3p"), <TopBar />, { locale: "zh-CN" })).toContain("第<strong>2</strong>轮／共5轮");
  });

  it("shows this round's Kiln Die, or that it is not rolled yet", () => {
    const die = fixture("m1_work_phase_r2_3p").playerView.game.kilnDie!.value;
    expect(renderComponent(fixtureSource("m1_work_phase_r2_3p"), <TopBar />)).toContain(`Kiln Die: ${die}`);
    expect(renderComponent(fixtureSource("m15_kiln_selection"), <TopBar />)).toContain("Kiln Die not rolled yet");
  });

  it("has the log button, the always-visible language switch and the session menu", () => {
    const html = renderComponent(fixtureSource("m1_work_phase_r2_3p"), <TopBar />);
    expect(html).toMatch(/<button[^>]*class="game-log-button"[^>]*aria-expanded="false"[^>]*aria-label="Game log"/);
    // One button that names the other language, in that language.
    expect(html).toContain('<button type="button" class="language-switch" lang="zh-Hans" aria-label="中文">中文</button>');
    const zh = renderComponent(fixtureSource("m1_work_phase_r2_3p"), <TopBar />, { locale: "zh-CN" });
    expect(zh).toContain('<button type="button" class="language-switch" lang="en" aria-label="English">EN</button>');
    expect(html).not.toContain("kit-seg");
    expect(html).toMatch(/<button[^>]*aria-haspopup="menu"[^>]*aria-label="Session menu"/);
  });
});

describe("phase strip", () => {
  it.each(allFixtures().map((entry) => [entry.id] as const))("%s marks the current round phase", (id) => {
    const model = modelOf(id);
    const html = renderComponent(fixtureSource(id), <PhaseStrip />);
    const items = phaseItems(html);
    const phases = roundPhases("en");
    const current = items.filter((item) => item.includes('aria-current="step"'));
    expect(current).toHaveLength(1);
    if (model.roundPhase === "final") {
      expect(items).toHaveLength(phases.length + 1);
      expect(current[0]).toContain("Final scoring");
      expect(items.slice(0, phases.length).every((item) => item.includes('data-state="done"'))).toBe(true);
    } else {
      expect(items).toHaveLength(phases.length);
      const index = phases.findIndex((phase) => phase.id === roundPhaseOf(model.phaseType));
      expect(current[0]).toContain(phases[index]!.name);
      items.forEach((item, position) => {
        expect(attr(`<li ${item}`, "data-state")).toBe(position < index ? "done" : position === index ? "current" : "next");
      });
    }
    if (model.roundPhase === "firing" && model.firingStage !== null) expect(current[0]).toContain(`step ${model.firingStage.step}`);
    else expect(html).not.toContain("phase-strip-step");
  });

  it("names the firing step in Chinese", () => {
    const model = modelOf("m3_heat_marker_step_3p");
    expect(renderComponent(fixtureSource("m3_heat_marker_step_3p"), <PhaseStrip />, { locale: "zh-CN" })).toContain(`步骤${model.firingStage!.step}`);
  });
});

describe("world sections", () => {
  it.each(["m1_work_phase_r2_3p", "m4_after_quality_3p", "m6_order_phase_crackle_3p", "t-final-2p"])("%s follows the phase's section order", (id) => {
    const model = modelOf(id);
    const html = renderComponent(fixtureSource(id), <WorldSections />);
    const order = sectionOrder(model.roundPhase);
    const sections = [...html.matchAll(/<section id="sec-([a-z]+)"/g)].map((match) => match[1]);
    expect(sections).toEqual(order);
    const jump = [...html.matchAll(/data-jump="([a-z]+)"/g)].map((match) => match[1]);
    expect(jump).toEqual(order);
    const tab = windowUiDefaults(model.window, model.roundPhase).section;
    for (const id of order) {
      const section = html.slice(html.indexOf(`<section id="sec-${id}"`));
      const open = section.slice(0, section.indexOf(">"));
      expect(attr(open, "data-tab")).toBe(SECTION_TAB[id]);
      expect(open.includes("data-current")).toBe(SECTION_TAB[id] === tab);
      expect(attr(open, "aria-labelledby")).toBe(`sec-${id}-h`);
      expect(section).toMatch(new RegExp(`<h2 id="sec-${id}-h" class="world-section-title" tabindex="-1">`));
    }
  });

  it("follows a phone section the player chose", () => {
    const html = renderComponent(fixtureSource("m1_work_phase_r2_3p"), <WorldSections />, { ui: { section: "orders" } });
    expect(html).toMatch(/<section id="sec-orders"[^>]*data-current=""/);
    expect(html).not.toMatch(/<section id="sec-table"[^>]*data-current=""/);
  });

  it("names the sections in both languages and says the table's player count", () => {
    const players = modelOf("m1_work_phase_r2_3p").players.length;
    const en = renderComponent(fixtureSource("m1_work_phase_r2_3p"), <WorldSections />);
    const zh = renderComponent(fixtureSource("m1_work_phase_r2_3p"), <WorldSections />, { locale: "zh-CN" });
    expect(en).toContain(`Central Action Board · capacities for ${players} players`);
    expect(zh).toContain(`中央行动板 · ${players}人容量`);
    expect(en).toContain(">Recognition &amp; Techs</h2>");
    expect(zh).toContain(">声望与技艺</h2>");
    expect(en).toContain('<nav class="jump-nav" aria-label="Jump to">');
  });
});

describe("game shell", () => {
  it("lays out the slots with landmarks and the skip target", () => {
    const html = renderComponent(fixtureSource("m1_work_phase_r2_3p"), <GameShell skipLink="S" top="T" banner="B" world="W" pane="P" nav="N" live="L" />);
    expect(html).toMatch(/^<div class="shell" data-shell="">/);
    expect(html).toContain('<main class="shell-world" id="world" data-focus-fallback="">W</main>');
    expect(html).toContain('<div class="shell-pane" id="decision">P</div>');
  });

  it("puts the skip link first in the full screen, pointing at the decision", () => {
    const html = renderScreen(fixtureSource("m1_work_phase_r2_3p"));
    const firstFocusable = /<(a|button|input|select|textarea)\b[^>]*>/.exec(html)?.[0] ?? "";
    expect(firstFocusable).toContain('class="skip-link"');
    expect(firstFocusable).toContain('href="#decision"');
    expect(html).toContain(">Skip to your decision</a>");
    expect(html).toContain('id="decision"');
    expect(renderScreen(fixtureSource("m1_work_phase_r2_3p"), { locale: "zh-CN" })).toContain(">跳到你的决断</a>");
  });
});
