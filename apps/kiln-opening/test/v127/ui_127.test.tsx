import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/index.ts";
import { projectPublicGameState } from "../../src/multiplayer/index.ts";
import { ActionPanel } from "../../src/ui/ActionPanel.tsx";
import { LanguageProvider } from "../../src/ui/i18n.tsx";
import type { Locale } from "../../src/ui/i18n.tsx";
import { TabletopGameExperience } from "../../src/ui/TabletopGameExperience.tsx";
import { eventDescription } from "../../src/ui/PlaytestExperience.tsx";
import { addLoaded, startedGame, workerId } from "./helpers.ts";

function localizedMarkup(locale: Locale, child: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(
    createElement(LanguageProvider, { initialLocale: locale, children: child }),
  );
}

describe("V1.2.7 player-facing controls", () => {
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
    const scene = createElement(TabletopGameExperience, {
      game,
      ownPlayerId: "P1",
      ownPendingContribution: null,
      events: [],
      describeEvent: (record) => record.event.type,
      busy: false,
      send: async () => true,
    });

    const english = localizedMarkup("en", scene);
    expect(english).toContain("kiln-tabletop-shifu-marker");
    expect(english).toContain("Kiln Yard Shifu committed to this ceramic");
    expect(english).toMatch(/class="kiln-tabletop-shifu-marker"[^>]*>S<\/em>/);
    const chinese = localizedMarkup("zh-CN", scene);
    expect(chinese).toContain("窑坊师傅已标记此陶瓷");
  });

  it("offers free +1/−1 Heat markers or decline only for the committed ceramic", () => {
    const state = structuredClone(startedGame(2, 12_622).state);
    const marked = addLoaded(state, "P1", "bowl", "celadon", "plain", "high_1");
    const other = addLoaded(state, "P1", "plate", "white", "plain", "high_2");
    state.players["P1"]!.kilnYardShifuCeramicId = marked.id;
    state.players["P1"]!.kilnYardShifuUsedThisRound = true;
    state.players["P1"]!.resources.wood = 0;
    state.phase = { type: "firing_shifu_adjustment", queue: { actors: ["P1"], currentIndex: 0 } };
    const game = projectPublicGameState(state);
    const makePanel = () => createElement(ActionPanel, {
      game,
      ownPlayerId: "P1",
      ownPendingContribution: null,
      busy: false,
      send: async () => true,
    });

    const english = localizedMarkup("en", makePanel());
    expect(english).toContain("resolve in First Player order");
    expect(english).toContain("no Wood cost");
    expect(english).toContain("Place +1 Heat marker");
    expect(english).toContain("Place −1 Heat marker");
    expect(english).toContain("Leave unadjusted");
    expect(english).not.toContain('disabled=""');
    expect(english).not.toContain("Empty destination");
    expect(english).not.toContain("Move ceramic");
    expect(english).toContain(marked.id);
    expect(english).not.toContain(other.id);
    const chinese = localizedMarkup("zh-CN", makePanel());
    expect(chinese).toContain("师傅所在的那件共窑陶瓷");
    expect(chinese).toContain("放置+1火候标记");
    expect(chinese).toContain("放置−1火候标记");
    expect(chinese).toContain("不调整火候");
  });

  it.each([-1, 1] as const)("shows the %s Shifu Heat marker publicly in place of the Shifu", (adjustment) => {
    const state = structuredClone(startedGame(2, 12_623).state);
    const ceramic = addLoaded(state, "P2", "plate", "celadon", "carved", "high_1", true);
    ceramic.shifuHeatAdjustment = adjustment;
    state.players["P2"]!.kilnYardShifuCeramicId = null;
    const game = projectPublicGameState(state);
    const scene = createElement(TabletopGameExperience, {
      game, ownPlayerId: "P1", ownPendingContribution: null, events: [],
      describeEvent: (record) => record.event.type, busy: false, send: async () => true,
    });
    const signed = adjustment === 1 ? "+1" : "-1";
    for (const locale of ["en", "zh-CN"] as const) {
      const markup = localizedMarkup(locale, scene);
      expect(markup).toContain("kiln-tabletop-shifu-heat-marker");
      expect(markup).toContain(`>${signed}</em>`);
      expect(markup).not.toContain('class="kiln-tabletop-shifu-marker"');
      expect(markup).toContain(locale === "en" ? "Shifu Heat marker:" : "师傅火候标记：");
      expect(markup).toContain("kiln-live-furniture-marker");
    }
  });

  it("describes Shifu adjustment and decline without movement in both locales", () => {
    const state = structuredClone(startedGame(2, 12_624).state);
    const ceramic = addLoaded(state, "P1", "bowl", "celadon", "plain", "high_1");
    const game = projectPublicGameState(state);
    const adjusted = { type: "KILN_YARD_SHIFU_ADJUSTED", playerId: "P1", ceramicId: ceramic.id, adjustment: 1 } as const;
    const declined = { type: "KILN_YARD_SHIFU_ADJUSTMENT_DECLINED", playerId: "P1", ceramicId: ceramic.id } as const;
    expect(eventDescription(adjusted, game, "en")).toContain("+1 Heat marker");
    expect(eventDescription(adjusted, game, "en")).toContain("stays in its space");
    expect(eventDescription(adjusted, game, "zh-CN")).toContain("无需支付柴");
    expect(eventDescription(declined, game, "en")).toContain("unadjusted");
    expect(eventDescription(declined, game, "zh-CN")).toContain("不调整");
  });

  it("includes the fixed Shifu marker in the Actual Heat equation with Kiln Furniture", () => {
    const initial = startedGame(2, 12_625);
    const state = structuredClone(initial.state);
    const ceramic = addLoaded(state, "P1", "bowl", "celadon", "plain", "high_1", true);
    ceramic.shifuHeatAdjustment = -1;
    state.firstPlayerId = "P1";
    state.fireDeck = [0];
    state.phase = { type: "firing_reveal_fire", actorId: "P1" };
    state.firingContext = {
      round: state.round, contributors: ["P1"], contributions: { P1: "TEND" },
      fuelLedgerUpgradedBy: [], baseHeat: 2, fireModifier: null, globalHeat: null,
      kilnYardShifuAdjustments: [{ playerId: "P1", ceramicId: ceramic.id, adjustment: -1 }], ceramicResults: {},
    };
    const result = applyAction(state, "P1", { type: "REVEAL_FIRE_CARD" }, initial.rng);
    if (!result.ok) throw new Error(result.error.message);
    const panel = createElement(ActionPanel, {
      game: projectPublicGameState(result.state), ownPlayerId: "P1", ownPendingContribution: null,
      busy: false, send: async () => true,
    });
    for (const locale of ["en", "zh-CN"] as const) {
      const markup = localizedMarkup(locale, panel);
      expect(markup).toContain("2 + 0 − 1 = 1");
      expect(markup).not.toContain("2 + 0 = 1");
    }
  });
});
