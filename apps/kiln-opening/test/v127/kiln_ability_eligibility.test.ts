import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BaseHeat, FireModifier, FiringContext, GameState, KilnId, PlayerCount } from "../../src/game/index.ts";
import { projectPublicGameState } from "../../src/multiplayer/index.ts";
import { ActionPanel } from "../../src/ui/ActionPanel.tsx";
import { kilnShortPlainText } from "../../src/ui/TechniqueDescription.tsx";
import { LanguageProvider } from "../../src/ui/i18n.tsx";
import { addLoaded, addTechnique, mustApply, mustResult, startedGame } from "./helpers.ts";

function revealFixture(baseHeat: BaseHeat = 2, playerCount: PlayerCount = 2) {
  const { state, rng } = startedGame(playerCount, 1460);
  for (const player of Object.values(state.players)) {
    player.kilnId = "RU";
    player.resources.wood = 0;
    player.kilnAbilityUsedThisRound = false;
  }
  state.firstPlayerId = "P1";
  state.phase = { type: "firing_reveal_fire", actorId: "P1" };
  state.fireDeck = [0];
  state.fireDiscard = [];
  state.firingContext = {
    round: state.round,
    contributors: ["P1"],
    contributions: { P1: "TEND" },
    fuelLedgerUpgradedBy: [],
    baseHeat,
    fireModifier: null,
    globalHeat: null,
    kilnYardShifuAdjustments: [],
    ceramicResults: {},
  } satisfies FiringContext;
  return { state, rng };
}

function secondFiringFixture(kilnId: KilnId, fireModifier: FireModifier, wood = 0, used = false) {
  const { state, rng } = revealFixture();
  const ceramic = addLoaded(state, "P1", "bowl", "celadon", "plain", "middle_1");
  state.players["P1"]!.kilnId = kilnId;
  state.players["P1"]!.resources.wood = wood;
  state.players["P1"]!.kilnAbilityUsedThisRound = used;
  addTechnique(state, "P1", "T14");
  state.fireDeck = [fireModifier];
  const context = state.firingContext!;
  context.fireModifier = 2;
  context.globalHeat = 4;
  context.ceramicResults[ceramic.id] = {
    ceramicId: ceramic.id,
    zoneModifier: 0,
    naturalActualHeat: 4,
    naturalHeatDifference: 2,
    naturalExactMatch: false,
    finalActualHeat: 4,
    finalHeatDifference: 2,
    forcedQuality: null,
    assignedQuality: "standard",
  };
  state.phase = {
    type: "firing_after_quality",
    queue: { actors: ["P1"], currentIndex: 0 },
    techniqueIds: ["T14"],
    declinedTechniqueIds: {},
  };
  return { state, rng, ceramic };
}

function renderPanel(state: GameState): string {
  return renderToStaticMarkup(createElement(LanguageProvider, {
    initialLocale: "en",
    children: createElement(ActionPanel, {
      game: projectPublicGameState(state),
      ownPlayerId: "P1",
      ownPendingContribution: null,
      busy: false,
      send: async () => true,
    }),
  }));
}

describe("V1.2.7 eligibility for before-Quality Kiln ability prompts", () => {
  it.each([
    { difference: 0, baseHeat: 2 },
    { difference: 2, baseHeat: 4 },
    { difference: 3, baseHeat: 5 },
  ] as const)("assigns Quality directly when Ge's ceramic has Heat difference $difference", ({ difference, baseHeat }) => {
    const { state, rng } = revealFixture(baseHeat);
    state.players["P1"]!.kilnId = "GE";
    const ceramic = addLoaded(state, "P1", "bowl", "celadon", "plain", "middle_1");

    const result = mustResult(state, "P1", { type: "REVEAL_FIRE_CARD" }, rng);

    expect(result.state.phase.type).not.toBe("firing_before_quality");
    expect(result.events).toContainEqual(expect.objectContaining({ type: "QUALITY_ASSIGNED", ceramicId: ceramic.id }));
    expect(result.state.players["P1"]!.kilnAbilityUsedThisRound).toBe(false);
    expect(renderPanel(result.state)).not.toContain("Ge · Crackle from Fire");
    if (difference === 0) expect(renderPanel(result.state)).not.toContain("Skip");
  });

  it.each([
    { offset: -1, baseHeat: 1 },
    { offset: 1, baseHeat: 3 },
  ] as const)("does not adjust Ge at Heat offset $offset", ({ baseHeat }) => {
    const { state, rng } = revealFixture(baseHeat);
    state.players["P1"]!.kilnId = "GE";
    const ceramic = addLoaded(state, "P1", "bowl", "celadon", "plain", "middle_1");
    const revealed = mustResult(state, "P1", { type: "REVEAL_FIRE_CARD" }, rng);

    expect(revealed.state.phase.type).not.toBe("firing_before_quality");
    expect(revealed.state.ceramics[ceramic.id]).toEqual(expect.objectContaining({ stage: "finished", quality: "fine", decoration: "plain" }));
    expect(revealed.state.players["P1"]!.kilnAbilityUsedThisRound).toBe(false);

  });

  it("does not offer Ge because another player's ceramic is eligible", () => {
    const { state, rng } = revealFixture();
    state.players["P1"]!.kilnId = "GE";
    addLoaded(state, "P1", "bowl", "celadon", "plain", "middle_1");
    addLoaded(state, "P2", "plate", "celadon", "plain", "high_1");

    const result = mustResult(state, "P1", { type: "REVEAL_FIRE_CARD" }, rng);

    expect(result.state.phase.type).not.toBe("firing_before_quality");
    expect(result.events.filter((event) => event.type === "QUALITY_ASSIGNED")).toHaveLength(2);
  });

  it.each(["GE", "JU"] as const)("does not offer %s after its once-per-round ability was used", (kilnId) => {
    const { state, rng } = revealFixture(3);
    state.players["P1"]!.kilnId = kilnId;
    state.players["P1"]!.kilnAbilityUsedThisRound = true;
    state.players["P1"]!.resources.wood = 1;
    addLoaded(state, "P1", "bowl", "celadon", "plain", "middle_1");

    const result = mustResult(state, "P1", { type: "REVEAL_FIRE_CARD" }, rng);

    expect(result.state.phase.type).not.toBe("firing_before_quality");
    expect(result.events.some((event) => event.type === "QUALITY_ASSIGNED")).toBe(true);
  });

  it.each(["GE", "JU"] as const)("does not offer %s without an owned ceramic in this firing", (kilnId) => {
    const { state, rng } = revealFixture(3);
    state.players["P1"]!.kilnId = kilnId;
    state.players["P1"]!.resources.wood = 1;
    addLoaded(state, "P2", "bowl", "celadon", "plain", "middle_1");

    const result = mustResult(state, "P1", { type: "REVEAL_FIRE_CARD" }, rng);

    expect(result.state.phase.type).not.toBe("firing_before_quality");
    expect(result.events.some((event) => event.type === "QUALITY_ASSIGNED")).toBe(true);
  });

  it.each([0, 1])("offers Jun only when its 1-Wood cost is affordable (%i Wood)", (wood) => {
    const { state, rng } = revealFixture();
    state.players["P1"]!.kilnId = "JU";
    state.players["P1"]!.resources.wood = wood;
    const ceramic = addLoaded(state, "P1", "bowl", "celadon", "plain", "middle_1");
    const result = mustResult(state, "P1", { type: "REVEAL_FIRE_CARD" }, rng);

    if (wood === 0) {
      expect(result.state.phase.type).not.toBe("firing_before_quality");
      expect(result.events).toContainEqual({ type: "QUALITY_ASSIGNED", ceramicId: ceramic.id, quality: "masterpiece" });
    } else {
      expect(result.state.phase).toEqual({ type: "firing_before_quality", queue: { actors: ["P1"], currentIndex: 0 } });
      expect(result.events.some((event) => event.type === "QUALITY_ASSIGNED")).toBe(false);
    }
  });

  it("keeps eligible Ge and Jun decisions clockwise from the First Player", () => {
    const { state, rng } = revealFixture(3, 3);
    state.players["P1"]!.kilnId = "GE";
    state.players["P3"]!.kilnId = "JU";
    state.players["P3"]!.resources.wood = 1;
    state.firstPlayerId = "P2";
    state.phase = { type: "firing_reveal_fire", actorId: "P2" };
    addLoaded(state, "P1", "bowl", "celadon", "plain", "middle_1");
    addLoaded(state, "P3", "plate", "celadon", "plain", "middle_2");

    const next = mustApply(state, "P2", { type: "REVEAL_FIRE_CARD" }, rng);
    expect(next.phase).toEqual({ type: "firing_before_quality", queue: { actors: ["P3"], currentIndex: 0 } });
    const result = mustResult(next, "P3", { type: "RESOLVE_JUN", ceramicId: null, delta: null }, rng);
    expect(result.events.filter((event) => event.type === "QUALITY_ASSIGNED")).toHaveLength(2);

  });

  it.each([
    { kilnId: "GE", fireModifier: 0, wood: 0, used: false },
    { kilnId: "GE", fireModifier: 2, wood: 0, used: false },
    { kilnId: "GE", fireModifier: 1, wood: 0, used: true },
    { kilnId: "JU", fireModifier: 1, wood: 0, used: false },
    { kilnId: "JU", fireModifier: 1, wood: 1, used: true },
  ] as const)("skips ineligible Kiln prompts during Second Firing: $kilnId, Fire $fireModifier, Wood $wood, used $used", ({ kilnId, fireModifier, wood, used }) => {
    const { state, rng, ceramic } = secondFiringFixture(kilnId, fireModifier, wood, used);

    const result = mustResult(state, "P1", { type: "RESOLVE_SECOND_FIRING", ceramicId: ceramic.id }, rng);

    expect(result.state.phase.type).not.toBe("firing_second_before_quality");
    expect(result.events).toContainEqual(expect.objectContaining({ type: "SECOND_FIRING_RESOLVED", ceramicId: ceramic.id }));
    expect(result.state.ceramics[ceramic.id]).toEqual(expect.objectContaining({ stage: "finished" }));
  });
});
