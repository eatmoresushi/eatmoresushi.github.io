import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { projectPublicGameState } from "../../src/multiplayer/index.ts";
import { ActionPanel } from "../../src/ui/ActionPanel.tsx";
import { TabletopGameExperience } from "../../src/ui/TabletopGameExperience.tsx";
import { LanguageProvider } from "../../src/ui/i18n.tsx";
import type { Locale } from "../../src/ui/i18n.tsx";
import { addFinished, addLoaded, startedGame, workerId } from "./helpers.ts";

function localizedMarkup(locale: Locale, child: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(createElement(LanguageProvider, { initialLocale: locale, children: child }));
}

describe("V1.2.6 functional tabletop", () => {
  it("renders the approved board from live public state with owned pieces and player-count locks", () => {
    const state = structuredClone(startedGame(2, 12_660).state);
    const marked = addLoaded(state, "P1", "plate", "celadon", "carved", "high_1", true);
    addFinished(state, "P1", "censer", "fine", "grey_green", "crackle");
    state.players["P1"]!.kilnYardShifuCeramicId = marked.id;
    state.players["P1"]!.kilnYardShifuUsedThisRound = true;

    const placedWorkerId = workerId(state, "P2", "apprentice");
    state.players["P2"]!.workers[placedWorkerId]!.status = "placed";
    state.players["P2"]!.workers[placedWorkerId]!.locationId = "materials_yard";
    state.actionBoard.placements.materials_yard.push(placedWorkerId);

    const game = projectPublicGameState(state);
    const markup = localizedMarkup("en", createElement(TabletopGameExperience, {
      game,
      ownPlayerId: "P1",
      ownPendingContribution: null,
      events: [],
      describeEvent: (record) => record.event.type,
      busy: false,
      send: async () => true,
    }));

    expect(markup).toContain('data-testid="tabletop-live-ui"');
    expect(markup).toContain("SERVER-AUTHORITATIVE");
    expect(markup).toContain("Face-up Main Orders");
    expect(markup).toContain("Shared Kiln");
    expect(markup).toContain("Face-up Techs");
    expect(markup).toContain('data-min-players="3"');
    expect(markup).toContain('data-min-players="4"');
    expect(markup).toMatch(/class="[^"]*is-locked[^"]*" data-min-players="3"/);
    expect(markup).toMatch(/class="[^"]*is-locked[^"]*" data-min-players="4"/);

    expect(markup).toContain('data-player-id="P2"');
    expect(markup).toContain('data-worker-kind="apprentice"');
    expect(markup).toContain('data-worker-kind="shifu"');
    expect(markup).toContain('class="kiln-tabletop-worker-hat"');
    expect(markup).toContain('>S</text>');
    expect(markup).toContain('>A</text>');

    expect(markup).toContain('data-shape="plate"');
    expect(markup).toContain('data-glaze="celadon"');
    expect(markup).toContain('data-decoration="carved"');
    expect(markup).toContain('class="kiln-tabletop-decoration-pattern is-carved"');
    expect(markup).toContain('class="kiln-tabletop-decoration-pattern is-crackle"');
    expect(markup).toContain("BELONGS TO");
    expect(markup).toContain("Preferred Heat");
    expect(markup).toContain("Furniture");
    expect(markup).toContain('class="kiln-tabletop-quality-badge is-fine"');
    expect(markup).toContain(">Fine</b>");
    expect(markup).toMatch(/class="kiln-tabletop-shifu-marker"[^>]*>S<\/em>/);
    expect(markup).not.toMatch(/<i>素<\/i>|<i>刻<\/i>|<i>印<\/i>|<i>裂<\/i>/);
  });

  it("uses a tabletop selection only to focus the existing authoritative form", () => {
    const state = startedGame(2, 12_661).state;
    const selectedWorkerId = workerId(state, "P1", "apprentice", 1);
    const game = projectPublicGameState(state);
    const markup = localizedMarkup("en", createElement(ActionPanel, {
      game,
      ownPlayerId: "P1",
      ownPendingContribution: null,
      selectedLocation: "labour",
      selectedWorkerId,
      busy: false,
      send: async () => true,
    }));

    expect(markup).toContain("Send to Labour");
    expect(markup).not.toContain("Gather materials");
    expect(markup).not.toContain("Shape vessels");
    expect(markup).toContain(`value="${selectedWorkerId}" selected=""`);
  });

  it("renders the live surface in Simplified Chinese without changing state", () => {
    const game = projectPublicGameState(startedGame(3, 12_662).state);
    const before = JSON.stringify(game);
    const markup = localizedMarkup("zh-CN", createElement(TabletopGameExperience, {
      game,
      ownPlayerId: "P1",
      ownPendingContribution: null,
      events: [],
      describeEvent: (record) => record.event.type,
      busy: false,
      send: async () => true,
    }));

    expect(markup).toContain("服务器权威状态");
    expect(markup).toContain("公开主委托");
    expect(markup).toContain("共窑");
    expect(markup).toContain("御府声望");
    expect(markup).toContain("你的作坊");
    expect(JSON.stringify(game)).toBe(before);
  });
});
