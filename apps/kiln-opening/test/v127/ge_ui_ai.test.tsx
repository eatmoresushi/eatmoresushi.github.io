import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GameState } from "../../src/game/index.ts";
import { createComputerObservation } from "../../src/multiplayer/computerObservation.ts";
import { chooseOnlineComputerAction, ONLINE_COMPUTER_POLICY_VERSION } from "../../src/multiplayer/computerPlayer.ts";
import { projectPublicGameState } from "../../src/multiplayer/projection.ts";
import type { StoredSeat } from "../../src/multiplayer/types.ts";
import { ActionPanel } from "../../src/ui/ActionPanel.tsx";
import { LanguageProvider } from "../../src/ui/i18n.tsx";
import type { Locale } from "../../src/ui/i18n.tsx";
import { addFinished, addLoaded, mustApply, startedGame } from "./helpers.ts";

const computerSeat: StoredSeat = {
  seatId: "seat-P1", roomId: "ge-rule", playerId: "P1", seatIndex: 0,
  displayName: "Computer", colour: "cinnabar", isHost: true, isComputer: true,
  aiPolicyVersion: ONLINE_COMPUTER_POLICY_VERSION, authUserId: null, aiSeed: 17,
  aiCreatedCommandId: "ge-command",
};

function orderFixture(orderId = "O06", abilityUsed = false) {
  const { state, rng } = startedGame(2, 127_901);
  state.players["P1"]!.kilnId = "GE";
  state.players["P1"]!.kilnAbilityUsedThisRound = abilityUsed;
  state.players["P1"]!.orderHand = [orderId];
  state.marketDisplay = [];
  state.players["P2"]!.orderHand = ["S01"];
  addFinished(state, "P2", "bowl", "standard");
  state.phase = { type: "orders", activePlayerId: "P1", turnOrder: ["P1", "P2"], currentIndex: 0, completedInCircuit: 0 };
  const ceramic = addFinished(state, "P1", "bowl", "standard", "white", "crackle");
  return { state, rng, ceramic };
}

function panelMarkup(state: GameState, locale: Locale = "en"): string {
  return renderToStaticMarkup(createElement(LanguageProvider, {
    initialLocale: locale,
    children: createElement(ActionPanel, {
      game: projectPublicGameState(state), ownPlayerId: "P1", ownPendingContribution: null,
      ownPrivateDecision: {
        orderHand: state.players["P1"]!.orderHand, startingOrderIds: [], colourSamplesOrderIds: [],
        guildInspectedTechniqueIds: [], fireModifierPeek: null,
      },
      busy: false, send: async () => true,
    }),
  }));
}

describe("Ge Order and Exhibition controls", () => {
  it.each([false, true])("offers Fine Orders without spending the Decoration use (already used: %s)", (abilityUsed) => {
    const { state } = orderFixture("O06", abilityUsed);
    const english = panelMarkup(state);
    expect(english).toContain(">Complete O06</button>");
    expect(english).toContain("Crackle · Standard · Ge: Fine for Orders and Exhibition");
    expect(english).not.toContain("Use Ge: treat the selected");
    const chinese = panelMarkup(state, "zh-CN");
    expect(chinese).toContain(">完成O06</button>");
    expect(chinese).toContain("哥窑：委托与陈列视为上品");
  });

  it("offers the combined Fine and virtual Decoration match only while the Decoration ability is available", () => {
    const { state } = orderFixture("O10");
    expect(panelMarkup(state)).toContain(">Complete O10</button>");
    state.players["P1"]!.kilnAbilityUsedThisRound = true;
    expect(panelMarkup(state)).not.toContain(">Complete O10</button>");
  });

  it("shows the Exhibition scoring exception while preserving the public ceramic's actual Quality", () => {
    const { state, ceramic } = orderFixture();
    state.phase = { type: "presentation", eligiblePlayerIds: ["P1", "P2"], submittedPlayerIds: [] };
    expect(panelMarkup(state)).toContain("Crackle · Standard · Ge: Fine for Orders and Exhibition");
    expect(panelMarkup(state, "zh-CN")).toContain("哥窑：委托与陈列视为上品");
    expect(projectPublicGameState(state).ceramics[ceramic.id]).toMatchObject({ quality: "standard", decoration: "crackle" });
  });

  it("does not offer Fine Orders for another kiln's Standard Crackle", () => {
    const { state } = orderFixture();
    state.players["P1"]!.kilnId = "DI";
    expect(panelMarkup(state)).not.toContain(">Complete O06</button>");
  });
});

describe("Ge computer Order decisions", () => {
  it.each([false, true])("uses passive Fine matching without sending a Decoration substitution (already used: %s)", async (abilityUsed) => {
    const { state, ceramic, rng } = orderFixture("O06", abilityUsed);
    const action = await chooseOnlineComputerAction(createComputerObservation(state, "P1"), computerSeat);
    expect(action).toEqual({ type: "COMPLETE_ORDER", orderId: "O06", ceramicIds: [ceramic.id] });
    if (action.type !== "COMPLETE_ORDER") throw new Error("Expected Order completion");
    const resolved = mustApply(state, "P1", action, rng);
    expect(resolved.players["P1"]!.kilnAbilityUsedThisRound).toBe(abilityUsed);
    expect(resolved.ceramics[ceramic.id]).toMatchObject({ stage: "delivered", quality: "standard", decoration: "crackle" });
  });

  it("combines passive Fine matching with one consistent virtual Decoration", async () => {
    const { state, ceramic, rng } = orderFixture("O10");
    const action = await chooseOnlineComputerAction(createComputerObservation(state, "P1"), computerSeat);
    expect(action).toEqual({ type: "COMPLETE_ORDER", orderId: "O10", ceramicIds: [ceramic.id], geDecoration: { ceramicId: ceramic.id, decoration: "plain" } });
    if (action.type !== "COMPLETE_ORDER") throw new Error("Expected Order completion");
    const resolved = mustApply(state, "P1", action, rng);
    expect(resolved.players["P1"]!.kilnAbilityUsedThisRound).toBe(true);
    expect(resolved.ceramics[ceramic.id]).toMatchObject({ stage: "delivered", quality: "standard", decoration: "crackle" });
  });

  it("does not reuse a spent Decoration substitution", async () => {
    const { state } = orderFixture("O10", true);
    expect(await chooseOnlineComputerAction(createComputerObservation(state, "P1"), computerSeat)).toEqual({ type: "END_ORDER_TURN" });
  });

  it("does not promote a Standard Crackle to Masterpiece", async () => {
    const { state } = orderFixture("O11");
    expect(await chooseOnlineComputerAction(createComputerObservation(state, "P1"), computerSeat)).toEqual({ type: "END_ORDER_TURN" });
  });
});


describe("Ge computer after-Quality decisions", () => {
  function firingFixture(technique: "T11" | "T14", decoration: "crackle" | "plain") {
    const { state } = startedGame(2, 127_902);
    state.players["P1"]!.kilnId = "GE";
    state.players["P1"]!.resources.wood = 2;
    state.players["P1"]!.techniques = [{ id: technique, exhausted: false }];
    const ceramic = addLoaded(state, "P1", "bowl", "white", decoration, "imperial");
    state.phase = { type: "firing_after_quality", queue: { actors: ["P1"], currentIndex: 0 }, techniqueIds: [technique], declinedTechniqueIds: {} };
    state.firingContext = {
      round: 1, contributors: ["P1"], contributions: { P1: "TEND" }, fuelLedgerUpgradedBy: [],
      baseHeat: 2, fireModifier: 1, globalHeat: 3, kilnYardShifuRepositions: [],
      ceramicResults: { [ceramic.id]: {
        ceramicId: ceramic.id, zoneModifier: 0, naturalActualHeat: 3, naturalHeatDifference: 2,
        naturalExactMatch: false, finalActualHeat: 3, finalHeatDifference: 2, forcedQuality: null,
        assignedQuality: "standard",
      } },
    };
    return { state, ceramic };
  }

  it("saves Saggars Wood when Standard Crackle already counts as Fine", async () => {
    const { state } = firingFixture("T11", "crackle");
    expect(await chooseOnlineComputerAction(createComputerObservation(state, "P1"), computerSeat))
      .toEqual({ type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: null });
    const plain = firingFixture("T11", "plain");
    expect(await chooseOnlineComputerAction(createComputerObservation(plain.state, "P1"), computerSeat))
      .toEqual({ type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: plain.ceramic.id });
  });

  it("compares Second Firing prospects against Ge's effective Fine scoring value", async () => {
    const { state } = firingFixture("T14", "crackle");
    expect(await chooseOnlineComputerAction(createComputerObservation(state, "P1"), computerSeat))
      .toEqual({ type: "RESOLVE_SECOND_FIRING", ceramicId: null });
    const plain = firingFixture("T14", "plain");
    expect(await chooseOnlineComputerAction(createComputerObservation(plain.state, "P1"), computerSeat))
      .toEqual({ type: "RESOLVE_SECOND_FIRING", ceramicId: plain.ceramic.id });
  });
});
