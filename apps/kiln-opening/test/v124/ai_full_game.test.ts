import { describe, expect, it } from "vitest";
import {
  SeededRandom,
  applyAction,
  createGame,
  createPrivateFiringState,
  submitWoodContribution,
} from "../../src/game/index.ts";
import type { GameState, PlayerCount, PrivateFiringState } from "../../src/game/index.ts";
import {
  ONLINE_COMPUTER_POLICY_VERSION,
  chooseOnlineComputerAction,
  nextOnlineDecisionActor,
} from "../../src/multiplayer/computerPlayer.ts";
import type { StoredSeat } from "../../src/multiplayer/types.ts";

function computerSeat(playerId: string, seatIndex: number, seed: number): StoredSeat {
  return {
    seatId: `seat-${playerId}`,
    roomId: "ai-v122",
    playerId,
    seatIndex,
    displayName: `Computer ${seatIndex + 1}`,
    colour: ["cinnabar", "celadon", "ink", "moon-white"][seatIndex]!,
    isHost: seatIndex === 0,
    isComputer: true,
    aiPolicyVersion: ONLINE_COMPUTER_POLICY_VERSION,
    authUserId: null,
    aiSeed: seed,
    aiCreatedCommandId: `ai-command-${playerId}`,
  };
}

async function playComputerGame(playerCount: PlayerCount, seed: number): Promise<{
  state: GameState;
  actionCount: number;
}> {
  const rng = new SeededRandom(seed);
  const seats = Array.from({ length: playerCount }, (_, index) =>
    computerSeat(`P${index + 1}`, index, seed + index * 17),
  );
  const created = createGame({
    gameId: `ai-v122-${playerCount}-${seed}`,
    players: seats.map((seat) => ({ id: seat.playerId, displayName: seat.displayName })),
  }, rng);
  if (!created.ok) throw new Error(created.error.message);
  let state = created.state;
  let privateState: PrivateFiringState = createPrivateFiringState(state);
  let actionCount = 0;

  while (state.phase.type !== "finished" && actionCount < 2_000) {
    const actorId = nextOnlineDecisionActor(state);
    if (actorId === null) throw new Error(`No actor in phase ${state.phase.type}`);
    const seat = seats.find((candidate) => candidate.playerId === actorId);
    if (seat === undefined) throw new Error(`Missing AI seat for ${actorId}`);
    if (
      state.phase.type === "firing_contributions" &&
      privateState.windowId !== state.phase.windowId
    ) {
      privateState = createPrivateFiringState(state);
    }
    const action = await chooseOnlineComputerAction(state, privateState, seat);
    if (action.type === "SUBMIT_WOOD_CONTRIBUTION") {
      const result = submitWoodContribution(
        state,
        privateState,
        actorId,
        action.card,
        action.useFuelLedger,
        rng,
      );
      if (!result.ok) {
        throw new Error(`${state.phase.type}: ${JSON.stringify(action)} => ${JSON.stringify(result.error)}`);
      }
      state = result.state;
      privateState = result.privateState;
    } else {
      const result = applyAction(state, actorId, action, rng);
      if (!result.ok) {
        throw new Error(`${state.phase.type}: ${JSON.stringify(action)} => ${JSON.stringify(result.error)}`);
      }
      state = result.state;
    }
    actionCount += 1;
  }
  return { state, actionCount };
}

describe("V1.2.4 online computer policy", () => {
  for (const playerCount of [2, 3, 4] as const) {
    it(`completes a legal five-round ${playerCount}-player game`, async () => {
      const { state, actionCount } = await playComputerGame(playerCount, 1_220 + playerCount);
      expect(state.phase.type).toBe("finished");
      expect(state.round).toBe(5);
      expect(state.finalResult).not.toBeNull();
      expect(actionCount).toBeLessThan(2_000);
    });
  }
});
