import { describe, expect, it } from "vitest";
import { SeededRandom, submitWoodContribution } from "../src/game";
import type { ContributionCardId, GameState, PlayerId, PrivateFiringState } from "../src/game";
import { addLoaded, startedGame } from "./helpers.ts";

/** Open a Contribution window with every listed player holding one loaded ceramic. */
function openWindow(playerCount: 2 | 3 | 4, seed = 4242) {
  const state: GameState = startedGame(playerCount, seed).state;
  const contributors = state.playerOrder.slice(0, playerCount);
  const spaces = ["high_1", "middle_1", "low_1", "high_2"] as const;
  contributors.forEach((playerId, index) => {
    addLoaded(state, playerId, "bowl", "celadon", "plain", spaces[index]!);
  });
  state.phase = {
    type: "firing_contributions",
    windowId: "window-1",
    eligiblePlayerIds: [...contributors],
    submittedPlayerIds: [],
  };
  const privateState: PrivateFiringState = {
    gameId: state.gameId,
    windowId: "window-1",
    contributions: {},
  };
  return { state, privateState, contributors };
}

/** Reveal one card per contributor and return the resulting authoritative state. */
function reveal(playerCount: 2 | 3 | 4, cards: ContributionCardId[], wood = 5) {
  let { state, privateState, contributors } = openWindow(playerCount);
  for (const playerId of contributors) state.players[playerId]!.resources.wood = wood;
  const rng = new SeededRandom(7);
  contributors.forEach((playerId: PlayerId, index) => {
    const result = submitWoodContribution(state, privateState, playerId, cards[index]!, rng);
    if (!result.ok) throw new Error(`submission rejected: ${result.error.message}`);
    state = result.state;
    privateState = result.privateState;
  });
  return state;
}

describe("v1.1.4 Contribution cards through the engine", () => {
  it.each([
    [["TEND", "TEND", "TEND"], 2],
    [["STOKE", "TEND", "TEND"], 3],
    [["BANK", "TEND", "TEND"], 1],
    [["STOKE", "BANK", "TEND"], 2],
    [["STOKE", "STOKE", "TEND"], 4],
    [["BANK", "BANK", "TEND"], 0],
  ] as Array<[ContributionCardId[], number]>)("resolves %s to Base Heat %i", (cards, expected) => {
    const state = reveal(3, cards);
    expect(state.firingContext?.baseHeat).toBe(expected);
  });

  it("charges each card its printed Wood cost and nothing more", () => {
    const state = reveal(3, ["BANK", "TEND", "STOKE"], 4);
    const [bank, tend, stoke] = state.playerOrder;
    expect(state.players[bank!]?.resources.wood).toBe(3);
    expect(state.players[tend!]?.resources.wood).toBe(4);
    expect(state.players[stoke!]?.resources.wood).toBe(3);
  });

  it("records the revealed card rather than a number", () => {
    const state = reveal(2, ["STOKE", "BANK"]);
    const [first, second] = state.playerOrder;
    // A two-player firing resolves to the end in one pass, so the record is the summary.
    const contributions = state.firingContext?.contributions ?? state.lastFiringResult?.contributions;
    expect(contributions?.[first!]).toBe("STOKE");
    expect(contributions?.[second!]).toBe("BANK");
  });

  /** Spec §20 affordability: Tend is always payable; Bank and Stoke are not, at 0 Wood. */
  it("permits Tend but refuses Bank and Stoke at zero Wood", () => {
    const { state, privateState, contributors } = openWindow(2);
    const actor = contributors[0]!;
    state.players[actor]!.resources.wood = 0;
    const rng = new SeededRandom(3);
    for (const card of ["BANK", "STOKE"] as ContributionCardId[]) {
      const rejected = submitWoodContribution(state, privateState, actor, card, rng);
      expect(rejected.ok, card).toBe(false);
      if (!rejected.ok) expect(rejected.error.code).toBe("INVALID_CONTRIBUTION");
    }
    expect(submitWoodContribution(state, privateState, actor, "TEND", rng).ok).toBe(true);
  });

  it("refuses a card that is not in the v1.1.4 set", () => {
    const { state, privateState, contributors } = openWindow(2);
    const rng = new SeededRandom(3);
    const rejected = submitWoodContribution(
      state, privateState, contributors[0]!, "FIRE_HARD" as unknown as ContributionCardId, rng,
    );
    expect(rejected.ok).toBe(false);
  });

  it("grants no Wood for loading and pays no rebate after firing", () => {
    const before = reveal(3, ["TEND", "TEND", "TEND"], 5);
    // Every contributor Tended, so nobody paid and nobody was refunded.
    for (const playerId of before.playerOrder.slice(0, 3)) {
      expect(before.players[playerId]?.resources.wood).toBe(5);
    }
  });
});
