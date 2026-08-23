import { describe, expect, it } from "vitest";
import {
  CONTRIBUTION_CARD_DEFINITIONS,
  GAME_CONFIG,
  IMPERIAL_ORDERS,
  IMPERIAL_PROGRESS,
  KILN_SPACE_DEFINITIONS,
  MARKET_ORDERS,
  TECHNIQUES,
  SeededRandom,
  createPrivateFiringState,
} from "../src/game";
import type { GameState } from "../src/game";
import { createPlayerObservation } from "../src/ai/observation.ts";
import { getLegalAIActions } from "../src/ai/legalActions.ts";
import { evaluateAction } from "../src/ai/evaluator.ts";
import { buildPlayerPlan } from "../src/ai/planning.ts";
import { createProductionV3Profile } from "../src/ai/productionProfile.ts";
import type { AIDecisionContext } from "../src/ai/types.ts";
import { addFinished, addGlazed, addLoaded, startedGame } from "./helpers.ts";

/**
 * Does the AI actually know the rules it plays under?
 *
 * The source-of-truth suite catches a rule that has been *copied* and drifted. It cannot
 * catch a rule the AI has simply never been told about — nothing errors, the agent plays
 * as though the rule does not exist, and the measurement that follows looks like a fact
 * about the game rather than a fact about the agent.
 *
 * That failure has bitten four times in this codebase. The evaluator charged a Contribution
 * card's index instead of its Wood cost; the self-play telemetry held a stale Glaze table;
 * the legal-action enumerator hard-coded Guan's Order hand limit twice; and the evaluator
 * had no term at all for end-game Coin scoring, so it priced a spare Coin at 0.08, refused
 * to send idle workers to Labour, and made Round 5 look structurally dead when it was not.
 *
 * The test below is a sensitivity probe. For each rule, it perturbs the authoritative
 * value, re-scores every legal action in several representative positions, and requires
 * the AI's evaluation to move. An agent that scores a position identically whether a
 * Masterpiece is worth 4 VP or 0 is not weighing that rule at all.
 */

const CONTEXT: AIDecisionContext = {
  gameSequence: 1,
  decisionIndex: 1,
  learningPhase: "mature",
  assignedTradition: "RU",
  assignedIntent: "Hybrid",
  explorationRate: 0,
  mode: "live",
};

/** Positions chosen so that between them every major decision type is live. */
function fixtures(): Array<{ name: string; state: GameState }> {
  const work = startedGame(3, 91_001).state;
  const actor = work.firstPlayerId;
  addGlazed(work, actor, "bowl", "celadon", "plain");
  addGlazed(work, actor, "vase", "moon_white", "carved");
  work.players[actor]!.resources = { clay: 4, wood: 4, coins: 8 };

  const firing = startedGame(3, 91_002).state;
  const fActor = firing.firstPlayerId;
  const others = firing.playerOrder.filter((id) => id !== fActor);
  addLoaded(firing, fActor, "bowl", "celadon", "plain", "high_1");
  addLoaded(firing, others[0]!, "washer", "moon_white", "plain", "middle_1");
  firing.players[fActor]!.resources = { clay: 2, wood: 4, coins: 6 };
  firing.phase = {
    type: "firing_contributions",
    windowId: "probe-window",
    eligiblePlayerIds: [fActor, others[0]!],
    submittedPlayerIds: [],
  };

  // Court Patronage needs a completed Imperial Order, Coins and a spare Shifu; it is the
  // cheapest position in which the Progress track is actually priced.
  const patronage = startedGame(3, 91_003).state;
  const pActor = patronage.firstPlayerId;
  patronage.players[pActor]!.resources = { clay: 2, wood: 2, coins: 12 };
  patronage.players[pActor]!.completedOrders.push({
    orderId: "I15", ceramicIds: [], completedInRound: 1,
    vpAwarded: 3, coinsAwarded: 0, usedGuanWaiver: false,
  });
  patronage.players[pActor]!.imperialProgress = 1;

  // Cleanup with an over-full hand: the discard choices themselves depend on the limit.
  const cleanup = startedGame(3, 91_004).state;
  const cActor = cleanup.firstPlayerId;
  cleanup.players[cActor]!.orderHand = ["M01", "M02", "M03", "M04", "M05"];
  cleanup.phase = { type: "cleanup_orders", queue: { actors: [cActor], currentIndex: 0 } };

  // Reaching Progress 5 is the only move that pays the Imperial Seal, and Court Patronage
  // cannot make it -- so this position completes an Imperial Order from Progress 4.
  const seal = startedGame(3, 91_005).state;
  const sActor = seal.firstPlayerId;
  seal.players[sActor]!.imperialProgress = 4;
  seal.players[sActor]!.orderHand = ["I15"];
  addFinished(seal, sActor, "washer", "fine", "celadon", "plain");
  seal.phase = { type: "orders", turnOrder: [...seal.playerOrder], currentIndex: 0, activePlayerId: sActor };

  // Only the Exhibition prices a presented ceramic's Quality.
  const exhibition = startedGame(3, 91_006).state;
  const eActor = exhibition.firstPlayerId;
  exhibition.players[eActor]!.imperialProgress = 4;
  addFinished(exhibition, eActor, "bowl", "masterpiece", "celadon", "plain");
  addFinished(exhibition, eActor, "vase", "fine", "white", "carved");
  addFinished(exhibition, eActor, "plate", "standard", "grey_green", "impressed");
  exhibition.phase = { type: "presentation", eligiblePlayerIds: [...exhibition.playerOrder], submittedPlayerIds: [] };

  return [
    { name: "work phase", state: work },
    { name: "firing contributions", state: firing },
    { name: "court patronage", state: patronage },
    { name: "cleanup discards", state: cleanup },
    { name: "imperial seal reach", state: seal },
    { name: "exhibition", state: exhibition },
  ];
}

/** Every legal action's score, as one comparable string. */
function fingerprint(): string {
  return fixtures().map(({ name, state }) => {
    const actor = state.firstPlayerId;
    const priv = createPrivateFiringState(state);
    const observation = createPlayerObservation(state, actor, priv);
    const profile = createProductionV3Profile(state.playerCount);
    const plan = buildPlayerPlan(observation, profile, "Hybrid");
    const actions = getLegalAIActions(state, actor, priv, { maxCandidates: 400 });
    const scored = actions
      .map((action) => `${action.type}:${evaluateAction(observation, action, CONTEXT, profile, plan).totalScore.toFixed(4)}`)
      .sort();
    return `${name}|${scored.join(",")}`;
  }).join("||");
}

/** Perturb one rule, take a fingerprint, and always put the rule back. */
function withRule(mutate: () => () => void): string {
  const restore = mutate();
  try {
    return fingerprint();
  } finally {
    restore();
  }
}

interface RuleProbe {
  rule: string;
  why: string;
  mutate: () => () => void;
}

const PROBES: RuleProbe[] = [
  {
    rule: "end-game Coin conversion",
    why: "Coins left at game end become VP. Missing this priced a spare Coin at 0.08 and stranded workers in Round 5.",
    mutate: () => {
      const { coinsPerVp, maxVp } = GAME_CONFIG.coinEndGame;
      const target = GAME_CONFIG.coinEndGame as { coinsPerVp: number; maxVp: number };
      target.coinsPerVp = 1;
      target.maxVp = 50;
      return () => { target.coinsPerVp = coinsPerVp; target.maxVp = maxVp; };
    },
  },
  {
    rule: "Glaze Preferred Heat",
    why: "A stale copy of this table measured Grey-Green and Moon White a full step off for months.",
    mutate: () => {
      const glazes = GAME_CONFIG.glazes as Record<string, number>;
      const before = { ...glazes };
      glazes["celadon"] = 5;
      glazes["moon_white"] = 0;
      return () => { for (const [k, v] of Object.entries(before)) glazes[k] = v; };
    },
  },
  {
    rule: "Contribution card Wood cost",
    why: "The evaluator once charged the card's index instead of its printed cost, inverting Bank and Tend.",
    mutate: () => {
      const bank = CONTRIBUTION_CARD_DEFINITIONS.BANK as { woodCost: number };
      const stoke = CONTRIBUTION_CARD_DEFINITIONS.STOKE as { woodCost: number };
      const before = [bank.woodCost, stoke.woodCost] as const;
      bank.woodCost = 9;
      stoke.woodCost = 9;
      return () => { bank.woodCost = before[0]; stoke.woodCost = before[1]; };
    },
  },
  {
    rule: "Contribution card Heat adjustment",
    why: "The whole firing negotiation hangs on these three numbers.",
    mutate: () => {
      const stoke = CONTRIBUTION_CARD_DEFINITIONS.STOKE as { heatAdjustment: number };
      const before = stoke.heatAdjustment;
      stoke.heatAdjustment = 3;
      return () => { stoke.heatAdjustment = before; };
    },
  },
  {
    rule: "kiln zone modifiers",
    why: "Which Glaze a zone serves at a given Base Heat depends entirely on these. Note the engine reads KILN_SPACE_DEFINITIONS, not GAME_CONFIG.kiln.zoneModifier -- the latter is a second copy that no gameplay path consults.",
    mutate: () => {
      const spaces = Object.values(KILN_SPACE_DEFINITIONS) as Array<{ modifier: number }>;
      const before = spaces.map((space) => space.modifier);
      // Shift every zone the same way. Negating them is symmetric about a Celadon at Base
      // Heat 2 and produces an identical Heat Difference, which would pass without
      // proving anything.
      for (const space of spaces) space.modifier = 2;
      return () => { spaces.forEach((space, index) => { space.modifier = before[index]!; }); };
    },
  },
  {
    rule: "Imperial Progress track VP",
    why: "Advancing is worth nothing at some spaces and 4 VP at others; an agent blind to this cannot value Imperial Orders.",
    mutate: () => {
      const track = IMPERIAL_PROGRESS.track;
      const before = track.map((space) => space.endGameVp);
      track.forEach((space, index) => { space.endGameVp = index === 5 ? 40 : 0; });
      return () => { track.forEach((space, index) => { space.endGameVp = before[index]!; }); };
    },
  },
  {
    rule: "Order hand limit",
    why: "Hard-coded in the legal-action enumerator twice, and it disagreed with the engine the moment Guan changed.",
    mutate: () => {
      const display = GAME_CONFIG.orderDisplay as { baseHandLimit: number };
      const before = display.baseHandLimit;
      display.baseHandLimit = 1;
      return () => { display.baseHandLimit = before; };
    },
  },
  {
    rule: "Shape Clay costs",
    why: "What a vessel costs to form should change what the agent forms.",
    mutate: () => {
      const shapes = GAME_CONFIG.shapes as unknown as Record<string, number>;
      const before = { ...shapes };
      for (const key of Object.keys(shapes)) shapes[key] = 5;
      return () => { for (const [k, v] of Object.entries(before)) shapes[k] = v; };
    },
  },
  {
    rule: "Decoration Coin costs",
    why: "Decoration prices drive both Glaze Workshop choices and which Orders are reachable.",
    mutate: () => {
      const decorations = GAME_CONFIG.decorations as Record<string, number>;
      const before = { ...decorations };
      for (const key of Object.keys(decorations)) decorations[key] = 9;
      return () => { for (const [k, v] of Object.entries(before)) decorations[k] = v; };
    },
  },
  {
    rule: "Imperial Seal VP",
    why: "The Seal is a one-off prize for reaching Progress 5; an agent blind to it cannot value the race.",
    mutate: () => {
      const progress = IMPERIAL_PROGRESS as { imperialSealVp: number };
      const before = progress.imperialSealVp;
      progress.imperialSealVp = 40;
      return () => { progress.imperialSealVp = before; };
    },
  },
  {
    rule: "Exhibition quality VP",
    why: "What a presented Masterpiece is worth should change whether a ceramic is worth keeping back.",
    mutate: () => {
      const quality = IMPERIAL_PROGRESS.exhibition.qualityVp as Record<string, number>;
      const before = { ...quality };
      quality["masterpiece"] = 40;
      quality["standard"] = 0;
      return () => { for (const [k, v] of Object.entries(before)) quality[k] = v; };
    },
  },
  {
    rule: "Exhibition capacity by Progress",
    why: "How many ceramics a Progress space lets you exhibit is a large part of what advancing buys.",
    mutate: () => {
      const capacity = IMPERIAL_PROGRESS.exhibition.capacityByProgress as unknown as number[];
      const before = [...capacity];
      capacity.forEach((_, index) => { capacity[index] = index === 0 ? 0 : 9; });
      return () => { before.forEach((v, index) => { capacity[index] = v; }); };
    },
  },
  {
    rule: "Technique Coin costs",
    why: "The Guild decision is entirely a price comparison.",
    mutate: () => {
      const before = TECHNIQUES.map((technique) => technique.cost);
      for (const technique of TECHNIQUES) (technique as { cost: number }).cost = 0;
      return () => { TECHNIQUES.forEach((technique, index) => { (technique as { cost: number }).cost = before[index]!; }); };
    },
  },
  {
    rule: "Order VP values",
    why: "Which Order to chase is the central strategic choice in the game.",
    mutate: () => {
      const orders = [...MARKET_ORDERS, ...IMPERIAL_ORDERS];
      const before = orders.map((order) => order.vp);
      for (const order of orders) (order as { vp: number }).vp = 1;
      return () => { orders.forEach((order, index) => { (order as { vp: number }).vp = before[index]!; }); };
    },
  },
  {
    rule: "Fire deck composition",
    why: "Every quality projection is an average over the remaining Fire cards.",
    mutate: () => {
      const deck = GAME_CONFIG.fireDeck as Record<string, number>;
      const before = { ...deck };
      deck["-2"] = 40; deck["0"] = 0; deck["2"] = 0;
      return () => { for (const [k, v] of Object.entries(before)) deck[k] = v; };
    },
  },
];

describe("the AI prices every rule it plays under", () => {
  const baseline = fingerprint();

  it("produces a stable baseline evaluation", () => {
    expect(fingerprint()).toBe(baseline);
    expect(baseline.length).toBeGreaterThan(100);
  });

  it.each(PROBES.map((probe) => [probe.rule, probe] as const))(
    "changes its evaluation when %s changes",
    (_rule, probe) => {
      const perturbed = withRule(probe.mutate);
      expect(
        perturbed,
        `The AI scored every legal action identically after changing ${probe.rule}, so it is not pricing that rule.\n${probe.why}`,
      ).not.toBe(baseline);
    },
  );

  it("restores every rule it perturbs", () => {
    for (const probe of PROBES) withRule(probe.mutate);
    expect(fingerprint()).toBe(baseline);
  });
});
