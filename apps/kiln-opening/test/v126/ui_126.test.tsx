import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { projectPublicGameState } from "../../src/multiplayer/index.ts";
import { ActionPanel } from "../../src/ui/ActionPanel.tsx";
import { LanguageProvider } from "../../src/ui/i18n.tsx";
import type { Locale } from "../../src/ui/i18n.tsx";
import { TabletopScene } from "../../src/ui/tabletop/TabletopScene.tsx";
import { addLoaded, startedGame, workerId } from "./helpers.ts";

function localizedMarkup(locale: Locale, child: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(
    createElement(LanguageProvider, { initialLocale: locale, children: child }),
  );
}

describe("V1.2.6 player-facing controls", () => {
  it("shows Ding's separate 1-Clay payment in English and Chinese", () => {
    const state = structuredClone(startedGame(2, 12_620).state);
    state.players["P1"]!.kilnId = "DI";
    state.players["P1"]!.resources.clay = 5;
    state.phase = { type: "work", activePlayerId: "P1" };
    const game = projectPublicGameState(state);
    const panel = createElement(ActionPanel, {
      game,
      ownPlayerId: "P1",
      ownPendingContribution: null,
      busy: false,
      send: async () => true,
    });

    expect(localizedMarkup("en", panel)).toContain("pay 1 Clay");
    const chinese = localizedMarkup("zh-CN", panel);
    expect(chinese).toContain("范制成器");
    expect(chinese).toContain("额外支付1泥");
  });

  it("renders the committed Shifu on the marked Shared-Kiln ceramic in both locales", () => {
    const state = structuredClone(startedGame(2, 12_621).state);
    const marked = addLoaded(state, "P1", "bowl", "celadon", "plain", "high_1");
    const shifuId = workerId(state, "P1", "shifu");
    state.players["P1"]!.kilnYardShifuCeramicId = marked.id;
    state.players["P1"]!.kilnYardShifuUsedThisRound = true;
    state.players["P1"]!.workers[shifuId]!.status = "placed";
    state.players["P1"]!.workers[shifuId]!.locationId = "kiln_yard";
    state.actionBoard.placements.kiln_yard.push(shifuId);
    const game = projectPublicGameState(state);
    const scene = createElement(TabletopScene, {
      game,
      ownPlayerId: "P1",
      selection: { workerId: null, locationId: null },
      onSelectWorker: () => undefined,
      onSelectLocation: () => undefined,
      onClearSelection: () => undefined,
    });

    const english = localizedMarkup("en", scene);
    expect(english).toContain("is-shifu-marked");
    expect(english).toContain("kiln-shifu-marker");
    expect(english).toContain("marked by its Shifu");
    const chinese = localizedMarkup("zh-CN", scene);
    expect(chinese).toContain("师傅位于此陶瓷");
  });

  it("offers repositioning only for the ceramic committed during the Kiln Yard action", () => {
    const state = structuredClone(startedGame(2, 12_622).state);
    const marked = addLoaded(state, "P1", "bowl", "celadon", "plain", "high_1");
    const other = addLoaded(state, "P1", "plate", "white", "plain", "high_2");
    state.players["P1"]!.kilnYardShifuCeramicId = marked.id;
    state.players["P1"]!.kilnYardShifuUsedThisRound = true;
    state.phase = { type: "firing_reposition", queue: { actors: ["P1"], currentIndex: 0 } };
    const game = projectPublicGameState(state);
    const makePanel = () => createElement(ActionPanel, {
      game,
      ownPlayerId: "P1",
      ownPendingContribution: null,
      busy: false,
      send: async () => true,
    });

    const english = localizedMarkup("en", makePanel());
    expect(english).toContain("only the ceramic marked by this Shifu during the Kiln Yard action");
    expect(english).toContain(marked.id);
    expect(english).not.toContain(other.id);
    expect(localizedMarkup("zh-CN", makePanel())).toContain("师傅所在的那件共窑陶瓷");
  });
});
