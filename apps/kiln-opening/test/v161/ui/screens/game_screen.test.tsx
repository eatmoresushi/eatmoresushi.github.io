/**
 * The full `GameScreen` over every scenario and moment, in English and Chinese, through the
 * phase A frame and stubs (UI_V1.6.1_ARCHITECTURE §4.1, §9.2). B6's `rendered_text.test.ts`
 * tightens this into the full vocabulary check once phase B lands; this proves the composition
 * renders every window and keeps the frame's own guarantees:
 * - the pane form carries `data-window` (test-driver contract, §9.6);
 * - the pane landmark is named "Your decision" / 你的决断 in every window (§8.1);
 * - no ceramic or worker ID reaches text, `aria-label`, `title` or `alt` (D9, K14);
 * - none of the fixture's secret Order and Tech IDs appears anywhere in the markup;
 * - EN and ZH yield the same `data-*` attributes (stable IDs);
 * - the screen switch picks home, lobby, ended, loading and game from the session state.
 */
import { describe, expect, it } from "vitest";
import { screenOf } from "../../../../src/app/App.tsx";
import { EMPTY_SNAPSHOT } from "../../../../src/app/session/gameSource.ts";
import { fixtureSnapshot } from "../../../../src/app/session/fixtureSource.ts";
import { decisionWindow } from "../../../../src/app/state/decisionWindow.ts";
import { allFixtures, fixture, fixtureSource, secretIds } from "../support/fixtures.ts";
import { renderScreen, renderWindow } from "../support/render.tsx";

/** Text nodes plus the values of `aria-label`, `title` and `alt`: what a player can perceive. */
function perceivable(html: string): string {
  const attributes = [...html.matchAll(/\s(?:aria-label|title|alt)="([^"]*)"/g)].map((match) => match[1]);
  const text = html.replace(/<[^>]*>/g, " ");
  return [text, ...attributes].join(" ");
}

function dataAttributes(html: string): string[] {
  return [...html.matchAll(/\sdata-[\w-]+="[^"]*"/g)].map((match) => match[0]);
}

const ENTRIES = allFixtures().map((entry) => [entry.id] as const);

describe("ID detectors", () => {
  it("catch ceramic and worker IDs in text and labels, not in data attributes", () => {
    expect(perceivable('<p>Lin placed c12</p>')).toMatch(/\bc\d+\b/);
    expect(perceivable('<span aria-label="p2:apprentice:3"></span>')).toMatch(/\b[pP]\d+:(?:shifu|apprentice)(?::\d+)?\b/);
    expect(perceivable('<span data-ceramic-id="c12">Celadon Vase</span>')).not.toMatch(/\bc\d+\b/);
  });
});

describe("GameScreen renders every fixture", () => {
  it.each(ENTRIES)("%s in EN and ZH", (id) => {
    const entry = fixture(id);
    const window = decisionWindow(entry.playerView);
    const en = renderScreen(fixtureSource(id), { locale: "en" });
    const zh = renderScreen(fixtureSource(id), { locale: "zh-CN" });
    for (const html of [en, zh]) {
      expect(html).toContain(`<form class="pane-form" data-window="${window.kind}"`);
      expect(html).toMatch(/<main[^>]*>/);
      expect(html).toMatch(/<aside class="pane"/);
      expect(html).toMatch(/<h2 [^>]*class="pane-heading"[^>]*tabindex="-1"/);
      const seen = perceivable(html);
      expect(seen, "ceramic ID in perceivable text").not.toMatch(/\bc\d+\b/);
      expect(seen, "worker ID in perceivable text").not.toMatch(/\b[pP]\d+:(?:shifu|apprentice)(?::\d+)?\b/);
      expect(html, "worker ID anywhere in the markup").not.toMatch(/\b[pP]\d+:(?:shifu|apprentice)/);
      for (const secret of secretIds(id)) expect(html, `secret ${secret}`).not.toMatch(new RegExp(`\\b${secret}\\b`));
    }
    // §8.1: the pane landmark has one stable name in every window, never the window title.
    expect(en).toContain('<aside class="pane" aria-label="Your decision"');
    expect(zh).toContain('<aside class="pane" aria-label="你的决断"');
    expect(en).not.toMatch(/<aside[^>]*aria-labelledby/);
    expect(dataAttributes(zh)).toEqual(dataAttributes(en));
    if (window.kind === "work") expect(en).toContain(`data-step="${window.step}"`);
  });

  it("shows ConfirmBar only in an acting window, and the dev button only with dev tools", () => {
    const acting = renderWindow(fixtureSource("m1_work_phase_r2_3p"));
    expect(acting).toContain('data-action="confirm"');
    expect(acting).not.toContain('data-dev="canonical-move"');
    const waiting = renderWindow(fixtureSource("t-imperial-only-firing"));
    expect(waiting).not.toContain('data-action="confirm"');
    const dev = renderWindow(fixtureSource("w-kiln-and-main-order-choice"), { devTools: true });
    expect(dev).toContain('data-dev="canonical-move"');
    expect(renderWindow(fixtureSource("t-imperial-only-firing"), { devTools: true })).not.toContain('data-dev="canonical-move"');
    // The work turn hides the pane until a placement is chosen (owner review, 2026-10-17): the
    // dev button stays in it, once, and adds nothing to the bar above the world.
    const hidden = renderScreen(fixtureSource("m1_work_phase_r2_3p"), { devTools: true });
    expect(hidden.match(/data-dev="canonical-move"/g)).toHaveLength(1);
    expect(hidden).toMatch(/<aside class="pane"[^>]*hidden="">(?:(?!<\/aside>).)*data-dev="canonical-move"/s);
    expect(hidden).toMatch(/<section class="pane-openers"[^>]*><p [^>]*>Your turn: place a worker · \d left<\/p><\/section>/);
  });

  it("names the waiting window after who acts", () => {
    const entry = fixture("t-imperial-only-firing");
    const actor = entry.playerView.game.players[decisionWindow(entry.playerView).actorIds[0]!]!.displayName;
    expect(renderWindow(fixtureSource(entry.id), { locale: "en" })).toContain(`Waiting for ${actor}…`);
    expect(renderWindow(fixtureSource(entry.id), { locale: "zh-CN" })).toContain(`等候${actor}……`);
  });

  it("keeps the pane's own summary private to the viewer", () => {
    const html = renderWindow(fixtureSource("m1_work_phase_r2_3p"));
    const me = fixture("m1_work_phase_r2_3p").playerView;
    expect(html).toContain(`${me.game.players[me.viewerId!]!.displayName} (you)`);
    expect(html).toContain('class="own"');
  });

  it("formats a stored rejection in the current language", () => {
    const options = { status: { error: { kind: "rule" as const, error: { code: "NOT_YOUR_DECISION" as const, message: "", details: {} } } } };
    const en = renderWindow(fixtureSource("m1_work_phase_r2_3p", options), { locale: "en" });
    const zh = renderWindow(fixtureSource("m1_work_phase_r2_3p", options), { locale: "zh-CN" });
    const text = (html: string) => /<p class="confirm-error"[^>]*>([^<]*)<\/p>/.exec(html)?.[1] ?? "";
    expect(text(en)).not.toBe("");
    expect(text(zh)).not.toBe("");
    expect(text(zh)).not.toBe(text(en));
  });
});

describe("screenOf", () => {
  it("switches screens by session state", () => {
    expect(screenOf(EMPTY_SNAPSHOT)).toBe("home");
    const game = fixtureSnapshot(fixture("m1_work_phase_r2_3p"));
    expect(screenOf(game)).toBe("game");
    expect(screenOf({ ...game, view: null })).toBe("loading");
    expect(screenOf({ ...game, room: { ...game.room!, status: "lobby" } })).toBe("lobby");
    expect(screenOf({ ...game, room: { ...game.room!, status: "abandoned" } })).toBe("ended");
    expect(screenOf({ ...game, room: { ...game.room!, endedAt: "2026-10-15T00:00:00Z" } })).toBe("ended");
    expect(screenOf(fixtureSnapshot(fixture("t-final-2p")))).toBe("game");
  });
});
