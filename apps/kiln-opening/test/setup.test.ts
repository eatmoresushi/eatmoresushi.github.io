import { describe, expect, it } from "vitest";
import {
  GAME_CONFIG,
  KILN_IDS,
  SeededRandom,
  applyAction,
  createGame,
  currentDecisionActor,
  turnOrderFromFirst,
} from "../src/game";
import type { GameState, KilnId, PlayerCount } from "../src/game";
import { expectError, mustApply, playerInputs } from "./helpers";

describe("setup", () => {
  it.each([2, 3, 4] as const)("creates the complete %s-player starting state", (count) => {
    const rng = new SeededRandom(1000 + count);
    const result = createGame(
      { gameId: `setup-${count}`, players: playerInputs(count) },
      rng,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const state = result.state;
    expect(state.rulesVersion).toBe("0.5");
    expect(state.playerCount).toBe(count);
    expect(state.round).toBe(1);
    expect(state.phase.type).toBe("setup_kiln_selection");
    expect(state.marketDisplay).toHaveLength(4);
    expect(state.imperialDisplay).toHaveLength(3);
    expect(state.techniqueDisplay.forming).toHaveLength(2);
    expect(state.techniqueDisplay.glazing).toHaveLength(2);
    expect(state.techniqueDisplay.firing).toHaveLength(2);
    expect(state.fireDeck).toHaveLength(20);
    expect(new Set(state.fireDeck)).toEqual(new Set([-1, 0, 1]));
    expect(state.commonSupply).toEqual({
      clay: 40 - 2 * count,
      wood: 40 - 2 * count,
      coins: 50 - 3 * count,
    });

    for (const player of Object.values(state.players)) {
      expect(player.resources).toEqual({ clay: 2, wood: 2, coins: 3 });
      expect(Object.values(player.workers).filter((worker) => worker.kind === "shifu")).toHaveLength(1);
      expect(
        Object.values(player.workers).filter(
          (worker) => worker.kind === "apprentice" && worker.status === "available",
        ),
      ).toHaveLength(2);
      expect(
        Object.values(player.workers).filter(
          (worker) => worker.kind === "apprentice" && worker.status === "locked",
        ),
      ).toHaveLength(2);
      expect(player.imperialProgress).toBe(0);
      expect(player.orderHand).toEqual([]);
    }
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("rejects player counts outside 2–4 and duplicate player IDs", () => {
    const one = createGame(
      { gameId: "bad-one", players: playerInputs(1) },
      new SeededRandom(1),
    );
    expect(one.ok).toBe(false);
    if (!one.ok) expect(one.error.code).toBe("INVALID_SETUP");

    const five = createGame(
      { gameId: "bad-five", players: playerInputs(5) },
      new SeededRandom(1),
    );
    expect(five.ok).toBe(false);

    const duplicate = createGame(
      {
        gameId: "bad-duplicate",
        players: [
          { id: "P1", displayName: "One" },
          { id: "P1", displayName: "Two" },
        ],
      },
      new SeededRandom(1),
    );
    expect(duplicate.ok).toBe(false);
  });

  it("is deterministic for a fixed seed and varies deck order for another seed", () => {
    const input = { gameId: "deterministic", players: playerInputs(4) };
    const first = createGame(input, new SeededRandom(777));
    const second = createGame(input, new SeededRandom(777));
    const different = createGame(input, new SeededRandom(778));
    expect(first.ok && second.ok && different.ok).toBe(true);
    if (!first.ok || !second.ok || !different.ok) return;
    expect(first.state).toEqual(second.state);
    expect(first.state.marketDeck).not.toEqual(different.state.marketDeck);
  });

  it("selects Kilns in reverse turn order and begins Work with First Player", () => {
    const rng = new SeededRandom(44);
    const created = createGame(
      { gameId: "reverse-kilns", players: playerInputs(3) },
      rng,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    let state = created.state;
    expect(state.phase.type).toBe("setup_kiln_selection");
    if (state.phase.type !== "setup_kiln_selection") return;
    expect(state.phase.selectionOrder).toEqual([...turnOrderFromFirst(state)].reverse());

    const firstSelector = currentDecisionActor(state.phase)!;
    state = mustApply(state, firstSelector, { type: "SELECT_KILN", kilnId: "RU" }, rng);
    const duplicateAttempt = applyAction(
      state,
      currentDecisionActor(state.phase)!,
      { type: "SELECT_KILN", kilnId: "RU" },
      rng,
    );
    expectError(duplicateAttempt, "KILN_UNAVAILABLE");

    for (const kilnId of ["GU", "GE"] as KilnId[]) {
      const actorId = currentDecisionActor(state.phase);
      expect(actorId).not.toBeNull();
      state = mustApply(state, actorId!, { type: "SELECT_KILN", kilnId }, rng);
    }
    while (state.phase.type === "setup_starting_orders") {
      state = mustApply(
        state,
        currentDecisionActor(state.phase)!,
        { type: "KEEP_STARTING_ORDER" },
        rng,
      );
    }
    expect(state.phase).toEqual({ type: "work", activePlayerId: state.firstPlayerId });
    expect(Object.values(state.players).every((player) => player.orderHand.length === 1)).toBe(true);
  });

  it("deals all initial Orders before resolving eligible redraws in turn order", () => {
    const rng = new SeededRandom(12);
    const created = createGame(
      { gameId: "starting-redraw", players: playerInputs(2) },
      rng,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    let state: GameState = created.state;

    const forceToDeckTop = (orderId: string): void => {
      state.marketDisplay = state.marketDisplay.filter((id) => id !== orderId);
      state.marketDeck = state.marketDeck.filter((id) => id !== orderId);
      while (state.marketDisplay.length < GAME_CONFIG.orderDisplay.market) {
        const replacement = state.marketDeck.shift();
        if (replacement !== undefined) state.marketDisplay.push(replacement);
      }
      state.marketDeck.unshift(orderId);
    };
    forceToDeckTop("M15");

    let kilnIndex = 0;
    while (state.phase.type === "setup_kiln_selection") {
      state = mustApply(
        state,
        currentDecisionActor(state.phase)!,
        { type: "SELECT_KILN", kilnId: KILN_IDS[kilnIndex] as KilnId },
        rng,
      );
      kilnIndex += 1;
    }
    expect(Object.values(state.players).every((player) => player.orderHand.length === 1)).toBe(true);
    expect(state.phase.type).toBe("setup_starting_orders");
    if (state.phase.type !== "setup_starting_orders") return;

    const actorId = currentDecisionActor(state.phase)!;
    const discarded = state.phase.initialOrderIds[actorId]!;
    const replacement = state.marketDeck[0]!;
    state = mustApply(state, actorId, { type: "REDRAW_STARTING_ORDER" }, rng);
    expect(state.players[actorId]!.orderHand).toEqual([replacement]);
    expect(state.marketDiscard).toContain(discarded);
  });
});
