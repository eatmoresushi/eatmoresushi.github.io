import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AVAILABLE_KILN_IDS,
  KILN_DEFINITIONS,
  KILN_IDS,
  applyAction,
  currentDecisionActor,
} from "../../src/game/index.ts";
import { fallbackComputerCommands } from "../../src/multiplayer/computerFallback.ts";
import { createComputerObservation } from "../../src/multiplayer/computerObservation.ts";
import { chooseOnlineComputerAction, ONLINE_COMPUTER_POLICY_VERSION } from "../../src/multiplayer/computerPlayer.ts";
import { projectPublicGameState } from "../../src/multiplayer/projection.ts";
import type { StoredSeat } from "../../src/multiplayer/types.ts";
import { createPlaytestDraft, submissionCandidate } from "../../src/playtest/model.ts";
import { validatePlaytestSubmission } from "../../src/playtest/schema.ts";
import { ActionPanel } from "../../src/ui/ActionPanel.tsx";
import { LanguageProvider } from "../../src/ui/i18n.tsx";
import { PlaytestFormPage } from "../../src/ui/PlaytestFormPage.tsx";
import { createdGame, expectError, mustApply, startedGame } from "../v127/helpers.ts";

describe("Ding disabled for new games", () => {
  it("keeps Ding's stable definition while offering exactly four active traditions", () => {
    expect(KILN_IDS).toEqual(["RU", "GU", "GE", "DI", "JU"]);
    expect(KILN_DEFINITIONS.DI).toMatchObject({ id: "DI", enabled: false, name: "Ding Kiln" });
    expect(AVAILABLE_KILN_IDS).toEqual(["RU", "GU", "GE", "JU"]);
  });

  it.each([2, 3, 4] as const)("rejects Ding atomically during %i-player authoritative setup", (playerCount) => {
    const { state, rng } = createdGame(playerCount, 40_200 + playerCount);
    const before = structuredClone(state);
    const actorId = currentDecisionActor(state.phase)!;
    expectError(applyAction(state, actorId, { type: "SELECT_KILN", kilnId: "DI" }, rng), "KILN_UNAVAILABLE");
    expect(state).toEqual(before);
    expect(Object.values(state.players).every(({ kilnId }) => kilnId === null)).toBe(true);
    // Rejection leaves the same actor able to choose a legal tradition.
    const next = mustApply(state, actorId, { type: "SELECT_KILN", kilnId: "JU" }, rng);
    expect(next.players[actorId]!.kilnId).toBe("JU");
  });

  it("allows all four players to finish setup with distinct active traditions", () => {
    const { state } = startedGame(4, 40_204);
    expect(state.phase.type).toBe("work");
    expect(Object.values(state.players).map(({ kilnId }) => kilnId).sort()).toEqual([...AVAILABLE_KILN_IDS].sort());
  });

  it.each([11, 97, 401, 1_003])("keeps strategic and fallback setup choices legal through the last seat (seed %i)", async (seed) => {
    const fixture = createdGame(4, seed);
    let state = fixture.state;
    let selections = 0;
    while (state.phase.type === "setup_kiln_selection") {
      const playerId = currentDecisionActor(state.phase)!;
      const seat: StoredSeat = {
        roomId: "ding-test", seatId: `seat-${playerId}`, playerId,
        seatIndex: state.players[playerId]!.seatIndex, displayName: "Computer",
        colour: "cinnabar", isHost: false, isComputer: true, authUserId: null,
        aiPolicyVersion: ONLINE_COMPUTER_POLICY_VERSION, aiSeed: seed + selections,
        aiCreatedCommandId: null,
      };
      const occupied = new Set(Object.values(state.players).map(({ kilnId }) => kilnId));
      const remaining = AVAILABLE_KILN_IDS.filter((kilnId) => !occupied.has(kilnId));
      const observation = createComputerObservation(state, playerId);
      expect(fallbackComputerCommands(observation)).toEqual(remaining.map((kilnId) => ({ type: "SELECT_KILN", kilnId })));
      const command = await chooseOnlineComputerAction(observation, seat);
      expect(command.type).toBe("SELECT_KILN");
      if (command.type !== "SELECT_KILN") throw new Error("Expected Kiln selection");
      expect(remaining).toContain(command.kilnId);
      state = mustApply(state, playerId, command, fixture.rng);
      selections += 1;
    }
    expect(selections).toBe(4);
    expect(state.phase.type).toBe("setup_starting_tech");
    expect(Object.values(state.players).map(({ kilnId }) => kilnId).sort()).toEqual([...AVAILABLE_KILN_IDS].sort());
  });

  it.each(["en", "zh-CN"] as const)("hides Ding in the %s online setup chooser", (locale) => {
    const { state } = createdGame(4, 40_205);
    const markup = renderToStaticMarkup(createElement(LanguageProvider, {
      initialLocale: locale,
      children: createElement(ActionPanel, {
        game: projectPublicGameState(state), ownPlayerId: currentDecisionActor(state.phase)!,
        ownPendingContribution: null, busy: false, send: async () => true,
      }),
    }));
    expect(markup.match(/class="kiln-choice"/g)).toHaveLength(4);
    for (const id of AVAILABLE_KILN_IDS) {
      expect(markup).toContain(KILN_DEFINITIONS[id].name);
      expect(markup).toContain(KILN_DEFINITIONS[id].nameZh);
    }
    expect(markup).not.toContain(KILN_DEFINITIONS.DI.name);
    expect(markup).not.toContain(KILN_DEFINITIONS.DI.nameZh);
  });

  it("omits Ding from the playtest form and rejects a forged Ding submission", () => {
    const markup = renderToStaticMarkup(createElement(PlaytestFormPage));
    expect(markup).not.toContain('<option value="DI"');
    for (const id of AVAILABLE_KILN_IDS) expect(markup).toContain(`<option value="${id}"`);

    const draft = createPlaytestDraft(4);
    draft.playedOn = "2026-10-02";
    draft.players = draft.players.map((player, index) => ({
      ...player, kilnId: AVAILABLE_KILN_IDS[index]!, startingTechniqueId: "ST01",
      recognition: 0, coinsRemaining: 0, clayRemaining: 0, woodRemaining: 0, finalVp: 0,
    }));
    expect(validatePlaytestSubmission(submissionCandidate(draft)).ok).toBe(true);
    draft.players[0]!.kilnId = "DI";
    const result = validatePlaytestSubmission(submissionCandidate(draft));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some(({ path }) => path === "players.0.kilnId")).toBe(true);
  });
});
