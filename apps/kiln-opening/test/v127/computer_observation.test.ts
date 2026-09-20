import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/index.ts";
import { createComputerObservation } from "../../src/multiplayer/index.ts";
import {
  fallbackComputerCommands,
  selectFirstLegalComputerCommand,
} from "../../src/multiplayer/computerFallback.ts";
import {
  addTechnique,
  createdGame,
  mustApply,
  setWorkTurn,
  startedGame,
  workerId,
} from "./helpers.ts";

describe("V1.2.7 computer observation boundary", () => {
  it("reveals only the acting computer's secretly dealt Starting and Main Orders", () => {
    const { state } = createdGame(3, 12_601);
    if (state.phase.type !== "setup_kiln_selection") throw new Error("Expected kiln selection");

    const observation = createComputerObservation(state, "P2");
    expect(observation.ownPrivate.orderHand).toEqual(state.players["P2"]!.orderHand);
    expect(observation.ownPrivate.orderHand.filter((id) => id.startsWith("S"))).toHaveLength(1);
    expect(observation.ownPrivate.orderHand.filter((id) => id.startsWith("O"))).toHaveLength(1);
    expect(observation.ownPrivate.startingOrderOffer).toEqual([]);
    for (const player of Object.values(observation.game.players)) {
      expect(player.orderHand).toEqual([]);
      expect(player.orderHandCount).toBe(2);
    }
    for (const playerId of ["P1", "P3"]) {
      for (const orderId of state.players[playerId]!.orderHand) {
        expect(JSON.stringify(observation)).not.toContain(`"${orderId}"`);
      }
    }
  });

  it("contains deck counts rather than hidden deck order and exposes only its own Fire peek", () => {
    const { state } = startedGame(2, 12_602);
    const expectedMarketCount = state.marketDeck.length;
    state.privateFirePeeks = { P1: -1, P2: 1 };
    state.phase = {
      type: "firing_contributions",
      windowId: `${state.gameId}:privacy-window`,
      eligiblePlayerIds: ["P1", "P2"],
      submittedPlayerIds: [],
    };
    state.firingContext = null;

    const observation = createComputerObservation(state, "P1");
    expect(observation.game.decks.marketRemaining).toBe(expectedMarketCount);
    expect(observation.game).not.toHaveProperty("marketDeck");
    expect(observation.game).not.toHaveProperty("techniqueDecks");
    expect(observation.game).not.toHaveProperty("fireDeck");
    expect(observation.game).not.toHaveProperty("privateFirePeeks");
    expect(observation.ownPrivate.firePeek).toBe(-1);
    expect(JSON.stringify(observation)).not.toContain('"P2":1');
  });

  it("falls back deterministically only after authoritative preflight rejects the strategy", () => {
    const strategic = { type: "PASS_WORK_PHASE" } as const;
    const firstFallback = { type: "USE_LABOUR", workerId: "P1:A1" } as const;
    const laterFallback = { type: "USE_LABOUR", workerId: "P1:A2" } as const;
    const attempted: string[] = [];
    const selected = selectFirstLegalComputerCommand(
      strategic,
      [strategic, firstFallback, laterFallback],
      (command) => {
        attempted.push(command.type === "USE_LABOUR" ? command.workerId : command.type);
        return command === firstFallback
          ? { ok: true as const }
          : { ok: false as const, code: "NOT_LEGAL", message: "Rejected by engine" };
      },
    );

    expect(attempted).toEqual(["PASS_WORK_PHASE", "P1:A1"]);
    expect(selected).toEqual({
      command: firstFallback,
      usedFallback: true,
      rejected: [{ command: strategic, code: "NOT_LEGAL", message: "Rejected by engine" }],
    });
  });

  it("offers only legal looked-at and face-up Colour Samples fallback choices", () => {
    const { state: initial, rng } = startedGame(2, 12_603);
    let state = structuredClone(initial);
    addTechnique(state, "P1", "T10");
    setWorkTurn(state, "P1");
    state = mustApply(state, "P1", {
      type: "BEGIN_OFFICE_ORDERS",
      workerId: workerId(state, "P1", "apprentice"),
      mode: "take_one",
    }, rng);
    state = mustApply(state, "P1", { type: "OFFICE_USE_COLOUR_SAMPLES", deck: "market" }, rng);
    const observation = createComputerObservation(state, "P1");
    const commands = fallbackComputerCommands(observation);
    const expectedOrderIds = [
      ...observation.ownPrivate.colourSamplesChoices,
      ...observation.game.displays.market,
    ];

    expect(commands).toEqual(expectedOrderIds.map((orderId) => ({
      type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER",
      orderId,
    })));
    expect(commands).not.toContainEqual({ type: "OFFICE_SKIP_COLOUR_SAMPLES" });
    for (const command of commands) {
      if (command.type === "SUBMIT_WOOD_CONTRIBUTION") {
        throw new Error("Contribution command cannot be a Colour Samples choice");
      }
      expect(applyAction(state, "P1", command, rng).ok).toBe(true);
    }
  });
});
