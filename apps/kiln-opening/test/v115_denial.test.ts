import { describe, expect, it } from "vitest";
import { SeededRandom, createPrivateFiringState, locationCapacity } from "../src/game";
import type { GameState, PlayerId, PrivateFiringState } from "../src/game";
import { createPlayerObservation } from "../src/ai/observation.ts";
import { getLegalAIActions } from "../src/ai/legalActions.ts";
import { evaluateAction } from "../src/ai/evaluator.ts";
import { createProductionV3Profile } from "../src/ai/productionProfile.ts";
import { HeuristicAIPolicy } from "../src/ai/policy.ts";
import { V115Policy, createV115Profile } from "../src/ai/v115Policy.ts";
import { assessDenial, actionLocation, V115_DENIAL_OFF, V115_DENIAL_WEIGHTS } from "../src/ai/v115Denial.ts";
import type { AIAction, AIDecisionContext, PlayerObservation } from "../src/ai/types.ts";
import { addGlazed, addShaped, setActive, startedGame, workerId } from "./helpers.ts";

const CONTEXT: AIDecisionContext = {
  gameSequence: 1,
  decisionIndex: 1,
  learningPhase: "mature",
  assignedTradition: "RU",
  assignedIntent: "Hybrid",
  explorationRate: 0,
  mode: "live",
};

const ZERO_WEIGHTS = V115_DENIAL_OFF;

/** `assessDenial` reads only `action.type`; this stands in for a placement there. */
function placementAt(type: AIAction["type"]): AIAction {
  return { type } as AIAction;
}

function observe(state: GameState, playerId: PlayerId): PlayerObservation {
  return createPlayerObservation(state, playerId, createPrivateFiringState(state));
}

function legal(state: GameState, playerId: PlayerId, priv?: PrivateFiringState): AIAction[] {
  return getLegalAIActions(state, playerId, priv ?? createPrivateFiringState(state), { maxCandidates: 400 });
}

function twoPlayerPosition(seed: number): { state: GameState; actor: PlayerId; rival: PlayerId } {
  const state = startedGame(2, seed).state;
  const [actor, rival] = state.playerOrder as [PlayerId, PlayerId];
  state.players[actor]!.resources = { clay: 4, wood: 4, coins: 6 };
  state.players[rival]!.resources = { clay: 3, wood: 3, coins: 5 };
  setActive(state, actor);
  return { state, actor, rival };
}

describe("V1.1.5 denial modelling", () => {
  it("the 2-player board makes a Forming or Glaze lockout possible at all", () => {
    // Premise of the whole lineage: at 2 players these steps hold two workers, so one
    // player can hold both. If content changes this, the denial weights need revisiting.
    expect(locationCapacity("forming_studio", 2)).toBe(2);
    expect(locationCapacity("glaze_workshop", 2)).toBe(2);
    expect(locationCapacity("kiln_yard", 2)).toBeGreaterThan(2);
  });

  it("values closing a location above merely crowding it", () => {
    const { state, actor, rival } = twoPlayerPosition(77_001);
    addShaped(state, rival, "bowl");
    addShaped(state, rival, "vase");
    const action = placementAt("GLAZE_CERAMICS");

    const open = assessDenial(observe(state, actor), action);
    expect(open.lockout).toBe(false);
    expect(open.remainingAfter).toBe(1);

    // Fill one of the two Glaze spaces; the same placement now closes the location.
    state.actionBoard.placements.glaze_workshop.push(workerId(state, rival, "apprentice"));
    const closing = assessDenial(observe(state, actor), action);
    expect(closing.lockout).toBe(true);
    expect(closing.remainingAfter).toBe(0);
    expect(closing.value).toBeGreaterThan(open.value);
  });

  it("treats a committed pipeline as more valuable to block than a speculative one", () => {
    const { state, actor, rival } = twoPlayerPosition(77_002);
    const speculative = assessDenial(observe(state, actor), placementAt("GLAZE_CERAMICS"));

    addShaped(state, rival, "bowl");
    addShaped(state, rival, "vase");
    const stranded = assessDenial(observe(state, actor), placementAt("GLAZE_CERAMICS"));

    expect(stranded.opponentNeed).toBeGreaterThan(speculative.opponentNeed);
    expect(stranded.value).toBeGreaterThan(speculative.value);
  });

  it("scores no denial for Labour and Court Patronage, which cannot be crowded", () => {
    const { state, actor } = twoPlayerPosition(77_003);
    const observation = observe(state, actor);
    expect(assessDenial(observation, placementAt("USE_LABOUR")).value).toBe(0);
    expect(assessDenial(observation, placementAt("USE_COURT_PATRONAGE")).value).toBe(0);
  });

  it("scores no denial for actions that occupy no location", () => {
    const { state, actor } = twoPlayerPosition(77_004);
    expect(actionLocation(placementAt("PASS_WORK_PHASE"))).toBeNull();
    expect(assessDenial(observe(state, actor), placementAt("PASS_WORK_PHASE")).value).toBe(0);
  });

  it("ignores opponents who have no worker left to be denied", () => {
    const { state, actor, rival } = twoPlayerPosition(77_005);
    addShaped(state, rival, "bowl");
    const action = placementAt("GLAZE_CERAMICS");
    expect(assessDenial(observe(state, actor), action).opponentNeed).toBeGreaterThan(0);

    for (const worker of Object.values(state.players[rival]!.workers)) worker.status = "placed";
    const after = assessDenial(observe(state, actor), action);
    expect(after.opponentNeed).toBe(0);
    expect(after.value).toBe(0);
  });

  it("weights the final round higher, where a blocked step cannot be recovered", () => {
    const { state, actor, rival } = twoPlayerPosition(77_006);
    addGlazed(state, rival, "bowl", "celadon", "plain");
    const action = placementAt("USE_KILN_YARD");

    state.round = 3;
    const midGame = assessDenial(observe(state, actor), action);
    state.round = 5;
    const finalRound = assessDenial(observe(state, actor), action);
    expect(finalRound.value).toBeGreaterThan(midGame.value);
  });

  it("never lets denial exceed its cap", () => {
    const { state, actor, rival } = twoPlayerPosition(77_007);
    for (let i = 0; i < 6; i += 1) addShaped(state, rival, "bowl");
    state.round = 5;
    state.actionBoard.placements.glaze_workshop.push(workerId(state, rival, "apprentice"));
    const denial = assessDenial(observe(state, actor), placementAt("GLAZE_CERAMICS"));
    expect(denial.value).toBeLessThanOrEqual(V115_DENIAL_WEIGHTS.cap);
  });

  it("reproduces frozen V003's choice exactly when the denial weights are zero", async () => {
    // The lineage must be a pure addition. If this drifts, every V003 comparison is void.
    let compared = 0;
    for (const seed of [81_001, 81_002, 81_003, 81_004, 81_005, 81_006]) {
      for (const playerCount of [2, 3, 4] as const) {
        const state = startedGame(playerCount, seed).state;
        const actor = state.firstPlayerId;
        setActive(state, actor);
        addShaped(state, actor, "bowl");
        addGlazed(state, actor, "vase", "celadon", "plain");
        const observation = observe(state, actor);
        const actions = legal(state, actor);
        if (actions.length === 0) continue;

        const baseline = new HeuristicAIPolicy(
          createProductionV3Profile(playerCount), new SeededRandom(seed),
        );
        // Strip the Order-horizon opt-in too: this guard isolates the *denial* term, and
        // must keep isolating it as the lineage grows other opt-ins.
        const pureProfile = createV115Profile(playerCount);
        delete pureProfile.orderRetryHorizon;
        const candidate = new V115Policy(pureProfile, new SeededRandom(seed), ZERO_WEIGHTS);
        const a = await baseline.chooseAction(observation, actions, CONTEXT);
        const b = await candidate.chooseAction(observation, actions, CONTEXT);
        expect(JSON.stringify(b.action)).toBe(JSON.stringify(a.action));
        expect(b.score).toBeCloseTo(a.score, 9);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(0);
  });

  it("diverges from V003 once denial is priced", async () => {
    // The complement of the guard above: a term that never changes a choice is a no-op,
    // not a candidate. At least one contested position must resolve differently.
    let divergences = 0;
    for (const seed of [82_001, 82_002, 82_003, 82_004, 82_005, 82_006, 82_007, 82_008]) {
      const { state, actor, rival } = twoPlayerPosition(seed);
      addShaped(state, rival, "bowl");
      addShaped(state, rival, "vase");
      addShaped(state, actor, "plate");
      const observation = observe(state, actor);
      const actions = legal(state, actor);
      if (actions.length === 0) continue;

      const baseline = new HeuristicAIPolicy(createProductionV3Profile(2), new SeededRandom(seed));
      const candidate = new V115Policy(createV115Profile(2), new SeededRandom(seed), V115_DENIAL_WEIGHTS);
      const a = await baseline.chooseAction(observation, actions, CONTEXT);
      const b = await candidate.chooseAction(observation, actions, CONTEXT);
      if (JSON.stringify(a.action) !== JSON.stringify(b.action) || Math.abs(a.score - b.score) > 1e-9) {
        divergences += 1;
      }
    }
    expect(divergences).toBeGreaterThan(0);
  });

  it("leaves frozen V003's own evaluation free of any denial term", () => {
    // V003 stays the control: its evaluator must never write the new factor.
    const { state, actor, rival } = twoPlayerPosition(83_001);
    addShaped(state, rival, "bowl");
    const observation = observe(state, actor);
    const profile = createProductionV3Profile(2);
    const actions = legal(state, actor);
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      const scored = evaluateAction(observation, action, CONTEXT, profile);
      expect(scored.factors.opponentDenial).toBe(0);
    }
  });
});

describe("shipped configuration", () => {
  it("defaults denial off, matching the configuration that was actually evaluated", async () => {
    // The order-valuation A/B that passed its gates ran with denial zeroed. If the default
    // ever flips on, the online bot is running something no experiment measured.
    const { SeededRandom: RNG } = await import("../src/game");
    const { V115Policy: P, createV115Profile: mk } = await import("../src/ai/v115Policy.ts");
    const policy = new P(mk(2), new RNG(1));
    expect(V115_DENIAL_OFF.lockout).toBe(0);
    expect(V115_DENIAL_OFF.contention).toBe(0);
    expect(policy).toBeInstanceOf(P);
  });
});
