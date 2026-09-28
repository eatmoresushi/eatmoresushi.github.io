import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { projectPublicGameState } from "../../src/multiplayer/index.ts";
import { ActionPanel } from "../../src/ui/ActionPanel.tsx";
import { LanguageProvider } from "../../src/ui/i18n.tsx";
import type { Locale } from "../../src/ui/i18n.tsx";
import { addShaped, startedGame } from "../v127/helpers.ts";

function priorityState() {
  const state = structuredClone(startedGame(2, 28_930).state);
  const player = state.players["P1"]!;
  player.imperialKilnUnlocked = true;
  player.imperialPriorityAvailable = true;
  addShaped(state, "P1", "bowl");
  return state;
}

function render(state: ReturnType<typeof priorityState>, locale: Locale = "en") {
  return renderToStaticMarkup(createElement(LanguageProvider, {
    initialLocale: locale,
    children: createElement(ActionPanel, {
      game: projectPublicGameState(state), ownPlayerId: "P1", ownPendingContribution: null,
      selectedLocation: "labour", busy: false, send: async () => true,
    }),
  }));
}

describe("Imperial Priority optional controls", () => {
  it.each(["en", "zh-CN"] as const)("starts collapsed below the worker action with both timings in %s", (locale) => {
    const markup = render(priorityState(), locale);
    expect(markup).toContain('<details class="optional-action">');
    expect(markup.indexOf('class="action-card ')).toBeLessThan(markup.indexOf('<details'));
    expect(markup).toContain(locale === "en" ? "before or after your worker action" : "工人行动之前或之后");
    expect(markup).toContain(locale === "en" ? "Use before action" : "在行动前使用");
    expect(markup).not.toContain(locale === "en" ? "Keep the token" : "保留标记");
  });

  it("keeps the after-action decision and decline available even after the last worker", () => {
    const state = priorityState();
    state.phase = { type: "work_imperial_priority", actorId: "P1" };
    for (const worker of Object.values(state.players["P1"]!.workers)) {
      worker.status = "placed";
      worker.locationId = "labour";
    }
    const markup = render(state);
    expect(markup).not.toContain('<details');
    expect(markup).toContain("Use after action");
    expect(markup).toContain("Keep the token");
    expect(markup).toContain("before or after your worker action");
  });

  it("removes the optional section once the token has been used", () => {
    const state = priorityState();
    state.players["P1"]!.imperialPriorityAvailable = false;
    expect(render(state)).not.toContain('class="optional-action"');
  });

  it("does not offer another player's after-action decision", () => {
    const state = priorityState();
    state.phase = { type: "work_imperial_priority", actorId: "P2" };
    expect(render(state)).not.toContain("Use after action");
    expect(render(state)).not.toContain("Keep the token");
  });
});
