import { describe, expect, it } from "vitest";
import { SeededRandom, applyAction, createPrivateFiringState } from "../src/game";
import type { CeramicId, GameState, PlayerId } from "../src/game";
import type { AIAction } from "../src/ai/types.ts";
import { getLegalAIActions } from "../src/ai/legalActions.ts";
import { addLoaded, startedGame } from "./helpers.ts";

/**
 * The AI must offer exactly the actions the engine accepts.
 *
 * The rule-awareness suite proves the agent *prices* a rule. It cannot prove the agent is
 * ever *offered* the action. Those are different failures, and the second one is silent in
 * a nastier way: the engine happily accepts a move, the enumerator never lists it, and the
 * option simply does not exist as far as play is concerned.
 *
 * This has bitten repeatedly. The clearest case: Ge was widened to act at a Heat Difference
 * of 1 or 2, the engine accepted both, and `legalActions` kept filtering to exactly 1.
 * Measured over 1,800 seats the change looked inert -- Ge's win rate moved 26.1% to 26.4%
 * -- and the conclusion drawn was that the rule did not matter. With the enumerator fixed
 * the same change moved Ge from 26.9% to 36.7%.
 *
 * The check is a two-way set comparison against the engine itself, for the windows where a
 * target list is filtered: everything enumerated must be accepted, and everything accepted
 * must be enumerated.
 */

/** A firing paused before Quality, holding ceramics at a spread of Heat Differences. */
function abilityWindow(kilnId: "GE" | "JU"): { state: GameState; actor: PlayerId; owned: CeramicId[] } {
  const state = startedGame(3, 77_010).state;
  const actor = state.firstPlayerId;
  state.players[actor]!.kilnId = kilnId;
  state.players[actor]!.resources = { clay: 3, wood: 5, coins: 9 };
  state.players[actor]!.kilnAbilityUsedThisRound = false;

  const spaces = ["high_1", "middle_1", "low_1", "high_2"] as const;
  const owned = spaces.map((space, index) =>
    addLoaded(state, actor, "bowl", "celadon", "plain", space).id as CeramicId);

  // Preferred Heat for Celadon is 2; these give Heat Differences of 0, 1, 2 and 3.
  state.firingContext = {
    round: 1,
    contributors: [actor],
    contributions: { [actor]: "TEND" },
    fuelLedgerUpgradedBy: [],
    baseHeat: 2,
    fireModifier: 0,
    globalHeat: 2,
    saggerAdjustedCeramicIds: [],
    ceramicResults: Object.fromEntries(owned.map((id, index) => [id, {
      ceramicId: id,
      zoneModifier: 0,
      ignoredFireModifier: false,
      naturalActualHeat: 2 + index,
      naturalHeatDifference: index,
      naturalExactMatch: index === 0,
      finalActualHeat: 2 + index,
      finalHeatDifference: index,
      forcedQuality: null,
      assignedQuality: null,
    }])),
  } as unknown as GameState["firingContext"];
  state.phase = { type: "firing_before_quality", queue: { actors: [actor], currentIndex: 0 } };
  return { state, actor, owned };
}

/** Every action of this type the engine will actually accept from this position. */
function acceptedByEngine(state: GameState, actor: PlayerId, candidates: AIAction[]): string[] {
  return candidates
    .filter((action) => applyAction(state, actor, action as never, new SeededRandom(5)).ok)
    .map((action) => JSON.stringify(action))
    .sort();
}

function enumeratedByAi(state: GameState, actor: PlayerId, type: string): string[] {
  const priv = createPrivateFiringState(state);
  return getLegalAIActions(state, actor, priv, { exhaustive: true })
    .filter((action) => action.type === type)
    .map((action) => JSON.stringify(action))
    .sort();
}

describe("legal-action enumeration matches the engine", () => {
  it("offers every Ge target the engine accepts, and no others", () => {
    const { state, actor, owned } = abilityWindow("GE");
    const candidates: AIAction[] = [
      { type: "RESOLVE_GE", ceramicId: null },
      ...owned.map((ceramicId) => ({ type: "RESOLVE_GE" as const, ceramicId })),
    ];
    const accepted = acceptedByEngine(state, actor, candidates);
    const offered = enumeratedByAi(state, actor, "RESOLVE_GE");
    for (const action of offered) {
      expect(accepted, `offered but rejected by the engine: ${action}`).toContain(action);
    }
    for (const action of accepted) {
      expect(offered, `the engine accepts this Ge target but the AI never offers it: ${action}`).toContain(action);
    }
    // Celadon at Base Heat 2 gives differences 0/1/2/3, so exactly two targets qualify.
    expect(accepted.filter((a) => !a.includes("null")).length).toBe(2);
  });

  it("offers every Jun target and delta the engine accepts, and no others", () => {
    const { state, actor, owned } = abilityWindow("JU");
    const candidates: AIAction[] = [
      { type: "RESOLVE_JUN", ceramicId: null, delta: null },
      ...owned.flatMap((ceramicId) => ([-1, 1] as const).map((delta) =>
        ({ type: "RESOLVE_JUN" as const, ceramicId, delta }))),
    ];
    const accepted = acceptedByEngine(state, actor, candidates);
    const offered = enumeratedByAi(state, actor, "RESOLVE_JUN");
    for (const action of offered) {
      expect(accepted, `offered but rejected by the engine: ${action}`).toContain(action);
    }
    for (const action of accepted) {
      expect(offered, `the engine accepts this Jun move but the AI never offers it: ${action}`).toContain(action);
    }
  });

  it("offers every Contribution card the engine accepts, and no others", () => {
    const state = startedGame(3, 77_020).state;
    const actor = state.firstPlayerId;
    const other = state.playerOrder.find((id) => id !== actor)!;
    addLoaded(state, actor, "bowl", "celadon", "plain", "high_1");
    addLoaded(state, other, "washer", "white", "plain", "low_1");
    // One Wood affords Bank or Stoke; Tend is always payable.
    state.players[actor]!.resources = { clay: 2, wood: 1, coins: 4 };
    state.phase = {
      type: "firing_contributions",
      windowId: "parity-window",
      eligiblePlayerIds: [actor, other],
      submittedPlayerIds: [],
    };
    const priv = createPrivateFiringState(state);
    const offered = getLegalAIActions(state, actor, priv, { exhaustive: true })
      .filter((action) => action.type === "SUBMIT_WOOD_CONTRIBUTION")
      .map((action) => JSON.stringify(action)).sort();
    expect(offered.length).toBe(3);

    // At zero Wood only Tend remains payable, and the enumerator must reflect that.
    state.players[actor]!.resources.wood = 0;
    const poor = getLegalAIActions(state, actor, createPrivateFiringState(state), { exhaustive: true })
      .filter((action) => action.type === "SUBMIT_WOOD_CONTRIBUTION");
    expect(poor.length).toBe(1);
    expect(poor[0]).toMatchObject({ card: "TEND" });
  });
});
