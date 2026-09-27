import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GameState, Quality } from "../../src/game/index.ts";
import { fallbackComputerCommands } from "../../src/multiplayer/computerFallback.ts";
import { createComputerObservation } from "../../src/multiplayer/computerObservation.ts";
import { chooseOnlineComputerAction, ONLINE_COMPUTER_POLICY_VERSION } from "../../src/multiplayer/computerPlayer.ts";
import { projectPublicGameState } from "../../src/multiplayer/projection.ts";
import type { StoredSeat } from "../../src/multiplayer/types.ts";
import { ActionPanel } from "../../src/ui/ActionPanel.tsx";
import { LanguageProvider } from "../../src/ui/i18n.tsx";
import type { Locale } from "../../src/ui/i18n.tsx";
import { addFinished, addLoaded, addTechnique, mustApply, startedGame } from "./helpers.ts";

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
  const ceramic = addFinished(state, "P1", "bowl", "fine", "white", "plain");
  ceramic.crackle = true;
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
  it.each([false, true])("offers Fine Orders without spending the Crackle creation use (already used: %s)", (abilityUsed) => {
    const { state } = orderFixture("O06", abilityUsed);
    const english = panelMarkup(state);
    expect(english).toContain(">Complete O06</button>");
    expect(english).toContain("Plain · Crackle · Fine");
    expect(english).not.toContain("Use Ge: treat the selected");
    const chinese = panelMarkup(state, "zh-CN");
    expect(chinese).toContain(">完成O06</button>");
    expect(chinese).toContain("素面 · 开片 · 上品");
  });

  it("offers the combined Fine and virtual Glaze match even when the round’s Crackle creation is spent", () => {
    const { state } = orderFixture("O07");
    expect(panelMarkup(state)).toContain(">Complete O07</button>");
    state.players["P1"]!.kilnAbilityUsedThisRound = true;
    expect(panelMarkup(state)).toContain(">Complete O07</button>");
  });

  it("shows actual Fine Exhibition quality and separate public Crackle", () => {
    const { state, ceramic } = orderFixture();
    state.phase = { type: "presentation", eligiblePlayerIds: ["P1", "P2"], submittedPlayerIds: [] };
    expect(panelMarkup(state)).toContain("Plain · Crackle · Fine");
    expect(panelMarkup(state, "zh-CN")).toContain("素面 · 开片 · 上品");
    expect(projectPublicGameState(state).ceramics[ceramic.id]).toMatchObject({ quality: "fine", decoration: "plain", crackle: true });
  });

  it("does not offer a Decoration-restricted Order for Plain Crackle", () => {
    const { state } = orderFixture("O10");
    expect(panelMarkup(state)).not.toContain(">Complete O10</button>");
    expect(panelMarkup(state, "zh-CN")).not.toContain(">完成O10</button>");
  });

  it("does not offer Fine Orders for another kiln's Standard Crackle", () => {
    const { state, ceramic } = orderFixture();
    ceramic.quality = "standard";
    state.players["P1"]!.kilnId = "DI";
    expect(panelMarkup(state)).not.toContain(">Complete O06</button>");
  });
});

describe("Ge computer Order decisions", () => {
  it.each([false, true])("uses passive Fine matching without sending a Glaze substitution (already used: %s)", async (abilityUsed) => {
    const { state, ceramic, rng } = orderFixture("O06", abilityUsed);
    const action = await chooseOnlineComputerAction(createComputerObservation(state, "P1"), computerSeat);
    expect(action).toEqual({ type: "COMPLETE_ORDER", orderId: "O06", ceramicIds: [ceramic.id] });
    if (action.type !== "COMPLETE_ORDER") throw new Error("Expected Order completion");
    const resolved = mustApply(state, "P1", action, rng);
    expect(resolved.players["P1"]!.kilnAbilityUsedThisRound).toBe(abilityUsed);
    expect(resolved.ceramics[ceramic.id]).toMatchObject({ stage: "delivered", quality: "fine", glaze: "white", decoration: "plain", crackle: true });
  });

  it("combines passive Fine matching with one consistent virtual Glaze", async () => {
    const { state, ceramic, rng } = orderFixture("O07");
    const action = await chooseOnlineComputerAction(createComputerObservation(state, "P1"), computerSeat);
    expect(action).toEqual({ type: "COMPLETE_ORDER", orderId: "O07", ceramicIds: [ceramic.id], geGlazes: [{ ceramicId: ceramic.id, glaze: "celadon" }] });
    if (action.type !== "COMPLETE_ORDER") throw new Error("Expected Order completion");
    const resolved = mustApply(state, "P1", action, rng);
    expect(resolved.players["P1"]!.kilnAbilityUsedThisRound).toBe(false);
    expect(resolved.ceramics[ceramic.id]).toMatchObject({ stage: "delivered", quality: "fine", glaze: "white", decoration: "plain", crackle: true });
  });

  it("allows Crackle substitution after its creation ability is spent", async () => {
    const { state, ceramic } = orderFixture("O07", true);
    expect(await chooseOnlineComputerAction(createComputerObservation(state, "P1"), computerSeat)).toEqual({ type: "COMPLETE_ORDER", orderId: "O07", ceramicIds: [ceramic.id], geGlazes: [{ ceramicId: ceramic.id, glaze: "celadon" }] });
  });

  it("does not substitute a missing Decoration", async () => {
    const { state } = orderFixture("O10");
    expect(await chooseOnlineComputerAction(createComputerObservation(state, "P1"), computerSeat)).toEqual({ type: "END_ORDER_TURN" });
  });

  it("does not promote a Standard Crackle to Masterpiece", async () => {
    const { state } = orderFixture("O11");
    expect(await chooseOnlineComputerAction(createComputerObservation(state, "P1"), computerSeat)).toEqual({ type: "END_ORDER_TURN" });
  });
});


function firingFixture(quality: Quality = "standard", withTechniques = true) {
  const { state, rng } = startedGame(2, 127_902);
  state.players["P1"]!.kilnId = "GE";
  state.players["P2"]!.kilnId = "RU";
  state.players["P1"]!.resources.wood = 1;
  const ceramic = addLoaded(state, "P1", "bowl", "white", "painted", "imperial");
  if (withTechniques) {
    addTechnique(state, "P1", "T11");
    addTechnique(state, "P1", "T14");
  }
  state.phase = {
    type: "firing_after_quality", queue: { actors: ["P1"], currentIndex: 0 },
    techniqueIds: withTechniques ? ["T11", "T14"] : [], declinedTechniqueIds: {},
    geAvailable: quality === "standard", declinedGePlayerIds: [],
  };
  state.firingContext = {
    round: 1, contributors: ["P1"], contributions: { P1: "TEND" },
    baseHeat: 2, fireModifier: 1, globalHeat: 3, kilnYardShifuAdjustments: [],
    ceramicResults: { [ceramic.id]: { ceramicId: ceramic.id, zoneModifier: 0, naturalActualHeat: 3, naturalHeatDifference: 2, naturalExactMatch: false, finalActualHeat: 3, finalHeatDifference: 2, forcedQuality: null, assignedQuality: quality } },
  };
  return { state, rng, ceramic };
}

function controlMarkup(state: GameState, title: string): string {
  return panelMarkup(state).split('<section class="control-section">')
    .find((section) => section.startsWith(`<h3>${title}</h3>`))?.split("</section>")[0] ?? "";
}

describe("Ge firing controls", () => {
  it("offers Ge and both Techs together and explains the player's choice of order", () => {
    const { state } = firingFixture();
    const english = panelMarkup(state);
    expect(english).toContain("Ge · Crackle from Fire");
    expect(english).toContain("Protective Saggars");
    expect(english).toContain("Second Firing");
    expect(english).toContain("Use after-Quality abilities in your chosen order");
    expect(english).toContain("After each use, the remaining abilities and eligible ceramics are checked again");
    expect(english).toContain("permanent Crackle");
    expect(english).toContain("Painted");
    expect(english).not.toContain("After other Quality abilities");
    const chinese = panelMarkup(state, "zh-CN");
    expect(chinese).toContain("良品提升为上品");
    expect(chinese).toContain("按你选择的顺序使用品质判定后能力");
  });

  it("removes a Ge-upgraded ceramic from both remaining Tech target lists", () => {
    const { state, rng, ceramic } = firingFixture();
    const other = addLoaded(state, "P1", "plate", "white", "plain", "middle_1");
    state.firingContext!.ceramicResults[other.id] = { ...state.firingContext!.ceramicResults[ceramic.id]!, ceramicId: other.id };

    const resolved = mustApply(state, "P1", { type: "RESOLVE_GE", ceramicId: ceramic.id }, rng);

    expect(panelMarkup(resolved)).not.toContain("Ge · Crackle from Fire");
    for (const title of ["Protective Saggars", "Second Firing"]) {
      const controls = controlMarkup(resolved, title);
      expect(controls).toContain("Plate");
      expect(controls).not.toContain("Bowl");
    }
  });

  it("offers Ge as soon as Protective Saggars makes a Flawed ceramic Standard", () => {
    const { state, rng, ceramic } = firingFixture("flawed");
    expect(panelMarkup(state)).not.toContain("Ge · Crackle from Fire");

    const resolved = mustApply(state, "P1", { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: ceramic.id }, rng);

    expect(controlMarkup(resolved, "Ge · Crackle from Fire")).toContain("Bowl");
    expect(controlMarkup(resolved, "Second Firing")).toContain("Bowl");
    expect(panelMarkup(resolved)).not.toContain("<h3>Protective Saggars</h3>");
  });
});

describe("Ge computer after-Quality choices", () => {
  it("uses free Ge before spending Wood on Protective Saggars for a Standard ceramic", async () => {
    const { state, rng, ceramic } = firingFixture();
    const command = await chooseOnlineComputerAction(createComputerObservation(state, "P1"), computerSeat);
    expect(command).toEqual({ type: "RESOLVE_GE", ceramicId: ceramic.id });
    if (command.type !== "RESOLVE_GE") throw new Error("Expected Ge");
    const resolved = mustApply(state, "P1", command, rng);
    expect(resolved.players["P1"]!.resources.wood).toBe(1);
    expect(resolved.ceramics[ceramic.id]).toMatchObject({ quality: "fine", crackle: true });
  });

  it("uses Ge on the new Standard target after Saggars, then cannot select the upgraded ceramic again", async () => {
    const { state, rng, ceramic } = firingFixture("flawed");
    const first = await chooseOnlineComputerAction(createComputerObservation(state, "P1"), computerSeat);
    expect(first).toEqual({ type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: ceramic.id });
    if (first.type !== "RESOLVE_PROTECTIVE_SAGGARS") throw new Error("Expected Saggars");
    const afterSaggars = mustApply(state, "P1", first, rng);
    const second = await chooseOnlineComputerAction(createComputerObservation(afterSaggars, "P1"), computerSeat);
    expect(second).toEqual({ type: "RESOLVE_GE", ceramicId: ceramic.id });
    if (second.type !== "RESOLVE_GE") throw new Error("Expected Ge");
    const afterGe = mustApply(afterSaggars, "P1", second, rng);
    expect(afterGe.phase.type).not.toBe("firing_after_quality");
    expect(afterGe.ceramics[ceramic.id]).toMatchObject({ quality: "fine", crackle: true });
  });

  it("fallback can decline a Ge-only decision without inventing an unavailable Tech", () => {
    const { state, rng } = firingFixture("standard", false);
    const commands = fallbackComputerCommands(createComputerObservation(state, "P1"));
    expect(commands).toEqual([{ type: "RESOLVE_GE", ceramicId: null }]);
    expect(mustApply(state, "P1", { type: "RESOLVE_GE", ceramicId: null }, rng).phase.type).not.toBe("firing_after_quality");
  });
});
