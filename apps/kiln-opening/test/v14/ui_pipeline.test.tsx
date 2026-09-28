import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GameState, LocationId } from "../../src/game";
import { projectPublicGameState } from "../../src/multiplayer";
import { ActionPanel } from "../../src/ui/ActionPanel";
import { LanguageProvider, type Locale } from "../../src/ui/i18n";
import { addLoaded, addShaped, addTechnique, startedGame, workerId } from "../v127/helpers";

function panel(state: GameState, location?: LocationId, locale: Locale = "en"): string {
  return renderToStaticMarkup(createElement(LanguageProvider, { initialLocale: locale, children: createElement(ActionPanel, {
    game: projectPublicGameState(state), ownPlayerId: "P1", ownPendingContribution: null,
    selectedLocation: location, busy: false, send: async () => true,
  }) }));
}

function context(state: GameState, ceramicId: string): void {
  state.firingContext = {
    round: 1, contributors: ["P1"], contributions: { P1: "TEND" }, baseHeat: 2,
    fireModifier: -1, globalHeat: 1, kilnYardShifuAdjustments: [],
    ceramicResults: { [ceramicId]: {
      ceramicId, zoneModifier: 0, naturalActualHeat: 4, naturalHeatDifference: 3,
      naturalExactMatch: false, finalActualHeat: 4, finalHeatDifference: 3,
      forcedQuality: null, assignedQuality: null,
    } },
  };
}

describe("V1.4 production and firing controls", () => {
  it("separates optional Decoration from glazing and loading Plain workshop ceramics", () => {
    const { state } = startedGame(2, 14001);
    addShaped(state, "P1", "bowl");
    const decoration = panel(state, "glaze_workshop");
    expect(decoration).toContain('data-choice-value="painted"');
    expect(decoration).not.toContain('data-choice-value="plain"');
    expect(decoration).not.toContain('data-choice-group="glaze1"');
    const loading = panel(state, "kiln_yard");
    expect(loading).toContain("Bowl · Plain");
    expect(loading).toContain("Glaze 1 (1 Coin)");
    expect(loading).toContain('data-choice-value="moon_white"');
  });

  it("requires a Coin for loading even if the workshop vessel is Plain", () => {
    const { state } = startedGame(2, 14002);
    addShaped(state, "P1");
    state.players["P1"]!.resources.coins = 0;
    expect(panel(state, "kiln_yard")).toContain("Glazing and loading requires 1 Coin per ceramic.");
    expect(panel(state, "kiln_yard", "zh-CN")).toContain("每件需要1铜钱");
  });

  it("offers Glaze Palette only at the end of Work on already loaded ceramics", () => {
    const { state } = startedGame(2, 14003);
    addShaped(state, "P1");
    addTechnique(state, "P1", "T06");
    expect(panel(state, "kiln_yard")).not.toContain("Glaze Palette: choose the load");
    addLoaded(state, "P1", "plate", "white", "plain", "imperial");
    state.phase = { type: "work_glaze_palette", queue: { actors: ["P1"], currentIndex: 0 } };
    const markup = panel(state);
    expect(markup).toContain("before Test Pieces and Contributions");
    expect(markup).toContain("Plate · White · Plain · Imperial Kiln");
    expect(markup).not.toContain("Bowl · Plain");
    expect(markup).toContain("Keep existing Glazes");
  });

  it("offers all five real cards only to Fuel Ledger and prices its cards at two Wood", () => {
    const { state } = startedGame(2, 14004);
    state.phase = { type: "firing_contributions", windowId: "v14", eligiblePlayerIds: ["P1"], submittedPlayerIds: [] };
    expect(panel(state).match(/class="wood-card-choice/g)).toHaveLength(3);
    addTechnique(state, "P1", "T12");
    const markup = panel(state);
    expect(markup.match(/class="wood-card-choice/g)).toHaveLength(5);
    expect(markup).toContain("2 Wood, -2 Heat");
    expect(markup).toContain("2 Wood, +2 Heat");
    expect(markup).not.toContain("extra Wood");
  });

  it("lets a committed Imperial Kiln Shifu choose either marker", () => {
    const { state } = startedGame(2, 14005);
    const ceramic = addLoaded(state, "P1", "vase", "moon_white", "plain", "imperial");
    state.players["P1"]!.kilnYardShifuCeramicId = ceramic.id;
    state.phase = { type: "firing_shifu_adjustment", queue: { actors: ["P1"], currentIndex: 0 } };
    expect(panel(state)).toMatch(/<button[^>]*>Place \+1 Heat marker<\/button>/);
    expect(panel(state)).not.toMatch(/<button[^>]*disabled[^>]*>Place/);
  });

  it("shows the already revealed extra Fire and recalculated heat before unused Jun", () => {
    const { state } = startedGame(2, 14006);
    state.players["P1"]!.kilnId = "JU";
    const ceramic = addLoaded(state, "P1", "bowl", "white", "plain", "imperial");
    context(state, ceramic.id);
    state.phase = { type: "firing_second_before_quality", actorId: "P1", ceramicId: ceramic.id, fireModifier: 2,
      afterQualityPhase: { queue: { actors: ["P1"], currentIndex: 0 }, techniqueIds: [], declinedTechniqueIds: {}, geAvailable: false, declinedGePlayerIds: [] } };
    const markup = panel(state);
    expect(markup).toContain("The new Second Firing card is revealed: +2");
    expect(markup).toContain("New Actual Heat: 4");
    expect(markup).toContain("4 + 0 = 4");
    expect(markup).not.toContain("1 + 0 = 4");
    expect(markup).toContain("Skip Jun ability");
  });

  it("limits Ding’s extra vessel to Apprentice Potter’s Wheel controls", () => {
    const { state } = startedGame(2, 14007);
    state.players["P1"]!.kilnId = "DI";
    state.players["P1"]!.resources.clay = 5;
    expect(panel(state, "forming_studio")).not.toContain('data-choice-group="ding"');
    const shifu = state.players["P1"]!.workers[workerId(state, "P1", "shifu")]!;
    shifu.status = "placed";
    shifu.locationId = "labour";
    expect(panel(state, "forming_studio")).toContain('data-choice-group="ding"');
  });
});
