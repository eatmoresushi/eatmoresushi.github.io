import { LOCATION_IDS, QUALITY_RANK, SeededRandom, TECHNIQUE_DEFINITIONS, locationCapacity } from "../game/index.ts";
import type { LocationId } from "../game/index.ts";
import { evaluateAction, strategyTags } from "./evaluator.ts";
import { buildPlayerPlan } from "./planning.ts";
import { forecastTechniqueAcquisition } from "./techniqueForecast.ts";
import type {
  AIAction,
  AIDecisionContext,
  AIPolicy,
  AIPolicyDecision,
  AIStrategyProfile,
  PlayerObservation,
  PlayerPlan,
  ScoredAIAction,
  StrategicStepId,
  V4SearchConfig,
  V4SearchDiagnostic,
} from "./types.ts";

export const V4_SEARCH_CONFIGS = {
  conservative: {
    depth: 2,
    beamWidth: 4,
    rootWidth: 6,
    maxNodes: 72,
    futureDiscount: 0.72,
    lookaheadWeight: 0.68,
    opponentWeight: 0.45,
    terminalWeight: 0.7,
  },
  balanced: {
    depth: 3,
    beamWidth: 5,
    rootWidth: 7,
    maxNodes: 140,
    futureDiscount: 0.74,
    lookaheadWeight: 0.82,
    opponentWeight: 0.62,
    terminalWeight: 0.82,
  },
  hard: {
    depth: 3,
    beamWidth: 7,
    rootWidth: 9,
    maxNodes: 240,
    futureDiscount: 0.76,
    lookaheadWeight: 0.95,
    opponentWeight: 0.75,
    terminalWeight: 0.95,
  },
} as const satisfies Record<string, V4SearchConfig>;

export type V4SearchPreset = keyof typeof V4_SEARCH_CONFIGS;

interface AbstractRouteState {
  debts: Record<"materials" | "coins" | "form" | "glaze" | "load" | "fire" | "complete", number>;
  initialDebt: number;
  actionsRemaining: number;
  projectedVp: number;
  strandedRisk: number;
}

interface BeamNode {
  state: AbstractRouteState;
  value: number;
  path: StrategicStepId[];
}

const STEP_TO_DEBT = {
  gain_materials: "materials",
  gain_coins: "coins",
  form: "form",
  glaze: "glaze",
  load: "load",
  fire: "fire",
  complete_order: "complete",
} as const;

function stableActionKey(action: AIAction): string {
  return JSON.stringify(action);
}

function copyState(state: AbstractRouteState): AbstractRouteState {
  return { ...state, debts: { ...state.debts } };
}

function selectedAssignments(plan: PlayerPlan) {
  const selected = new Set([plan.primaryOrderId, ...plan.secondaryOrderIds]);
  return plan.orderFeasibilities
    .filter(({ orderId }) => selected.has(orderId))
    .flatMap(({ assignments }) => assignments);
}

/** A V004-only recurring-use valuation. It never changes the frozen V003 forecast. */
export function longHorizonTechniqueValue(
  observation: PlayerObservation,
  plan: PlayerPlan,
  techniqueId: string,
  workerKind: "shifu" | "apprentice" | null = null,
): number {
  const technique = TECHNIQUE_DEFINITIONS[techniqueId];
  if (technique === undefined) return -20;
  const player = observation.game.players[observation.playerId]!;
  const assignments = selectedAssignments(plan);
  const missing = assignments.filter(({ currentStage }) => currentStage === "missing");
  const remainingRounds = Math.max(0, 6 - observation.game.round);
  const pipeline = plan.pipeline.shaped + plan.pipeline.glazed + plan.pipeline.loaded + missing.length;
  const qualityTargets = assignments.filter(({ minQuality }) => QUALITY_RANK[minQuality] >= QUALITY_RANK.fine).length;
  let uses = 0;
  let benefitPerUse = 0;
  switch (techniqueId) {
    case "T01":
      uses = Math.min(remainingRounds, missing.filter(({ shape }) => shape === "vase" || shape === "censer").length);
      benefitPerUse = 1.25;
      break;
    case "T02":
      uses = Math.min(remainingRounds, Math.floor(missing.length / 2), new Set(missing.map(({ shape }) => shape)).size >= 2 ? 2 : 0);
      benefitPerUse = 1.8;
      break;
    case "T03":
      uses = Math.min(remainingRounds, missing.length, plan.resourceDemand.claySafety);
      benefitPerUse = player.resources.coins > plan.resourceDemand.coins ? 1.35 : 0.35;
      break;
    case "T04":
      uses = Math.min(remainingRounds, missing.length);
      benefitPerUse = 1.05;
      break;
    case "T05":
    case "T06": {
      const decoration = techniqueId === "T05" ? "carved" : "impressed";
      uses = Math.min(remainingRounds, assignments.filter((assignment) => (
        (assignment.currentStage === "missing" || assignment.currentStage === "shaped") && assignment.decoration === decoration
      )).length);
      benefitPerUse = 1.8;
      break;
    }
    case "T08":
      uses = observation.game.round <= 3 ? Math.min(remainingRounds, Math.max(0, 3 - player.orderHand.length)) : 0;
      benefitPerUse = 1.45;
      break;
    case "T09":
      uses = Math.min(remainingRounds, Math.ceil(pipeline / 2));
      benefitPerUse = qualityTargets > 0 ? 1.9 : 1.1;
      break;
    case "T10":
      uses = Math.min(remainingRounds, qualityTargets, Math.ceil(pipeline / 2));
      benefitPerUse = player.resources.coins >= 2 ? 2.15 : 0.8;
      break;
    case "T11":
      uses = pipeline >= 3 ? Math.min(remainingRounds, Math.floor(pipeline / 2)) : 0;
      benefitPerUse = player.resources.wood >= 2 && player.resources.coins >= 2 ? 2.1 : 0.7;
      break;
    case "T12":
      uses = Math.min(remainingRounds, Math.ceil(pipeline / 2));
      benefitPerUse = 1.05;
      break;
    case "T13":
      uses = pipeline >= 4 ? Math.min(remainingRounds, Math.floor(pipeline / 2)) : 0;
      benefitPerUse = 1.65;
      break;
    case "T14": {
      const reserved = new Set(assignments.flatMap(({ ceramicId }) => ceramicId === null ? [] : [ceramicId]));
      const surplus = Object.values(observation.game.ceramics).filter(({ id, ownerId, stage, ...ceramic }) => (
        ownerId === observation.playerId && stage === "finished" && "quality" in ceramic && ceramic.quality === "masterpiece" && !reserved.has(id)
      )).length;
      uses = Math.min(remainingRounds, surplus + (pipeline >= 4 ? 1 : 0));
      benefitPerUse = 2.35;
      break;
    }
    case "T15":
      uses = remainingRounds >= 2 ? Math.min(qualityTargets, Math.floor(pipeline / 2)) : 0;
      benefitPerUse = 2.2;
      break;
    case "T16":
      uses = Math.min(remainingRounds, qualityTargets, Math.ceil(pipeline / 2));
      benefitPerUse = player.resources.coins >= 4 ? 2.3 : 0.9;
      break;
  }
  const purchaseCoins = workerKind === "shifu" ? Math.max(1, technique.cost - 1) : technique.cost;
  const acquisitionCost = purchaseCoins * 0.55 + 1.1;
  const timingPenalty = observation.game.round >= 4 ? 1.5 * (observation.game.round - 3) : 0;
  return uses * benefitPerUse - acquisitionCost - timingPenalty;
}

function initialRouteState(plan: PlayerPlan): AbstractRouteState {
  const assignments = selectedAssignments(plan);
  const resourceDebt = plan.orderFeasibilities
    .filter(({ orderId }) => orderId === plan.primaryOrderId || plan.secondaryOrderIds.includes(orderId))
    .reduce((sum, route) => ({
      clay: sum.clay + route.resourceDebt.clay,
      wood: sum.wood + route.resourceDebt.wood,
      coins: sum.coins + route.resourceDebt.coins,
    }), { clay: 0, wood: 0, coins: 0 });
  const debts = {
    materials: Math.max(Math.ceil(resourceDebt.clay / 3), Math.ceil(resourceDebt.wood / 3)),
    coins: Math.ceil(resourceDebt.coins / 4),
    form: Math.ceil(assignments.filter(({ currentStage }) => currentStage === "missing").length / 2),
    glaze: Math.ceil(assignments.filter(({ currentStage }) => currentStage === "missing" || currentStage === "shaped").length / 2),
    load: Math.ceil(assignments.filter(({ currentStage }) => currentStage === "missing" || currentStage === "shaped" || currentStage === "glazed").length / 2),
    fire: assignments.some(({ currentStage }) => currentStage !== "finished") ? 1 : 0,
    complete: plan.primaryOrderId === null ? 0 : 1,
  };
  return {
    debts,
    initialDebt: Math.max(1, Object.values(debts).reduce((sum, value) => sum + value, 0)),
    actionsRemaining: plan.multiRoundRoute.totalWorkerActionsAvailable,
    projectedVp: plan.multiRoundRoute.projectedOrderVp,
    strandedRisk: plan.multiRoundRoute.strandedPipelineRisk,
  };
}

function reduceDebt(state: AbstractRouteState, step: keyof AbstractRouteState["debts"], amount = 1): void {
  state.debts[step] = Math.max(0, state.debts[step] - amount);
}

function actionRouteStep(action: AIAction): StrategicStepId | null {
  switch (action.type) {
    case "GAIN_MATERIALS": return "gain_materials";
    case "OFFICE_GAIN_COINS": return "gain_coins";
    case "FORM_CERAMICS": return "form";
    case "GLAZE_CERAMICS": return "glaze";
    case "USE_KILN_YARD": return "load";
    case "SUBMIT_WOOD_CONTRIBUTION": return "fire";
    case "COMPLETE_ORDER": return "complete_order";
    case "OFFICE_TAKE_ORDER":
    case "OFFICE_DRAW_BLIND_ORDER": return "acquire_order";
    case "GUILD_BUY_TECHNIQUE": return "acquire_technique";
    case "SUBMIT_PRESENTATION": return "present";
    case "PASS_WORK_PHASE": return "pass";
    default: return null;
  }
}

function applyRootAction(
  state: AbstractRouteState,
  action: AIAction,
  observation: PlayerObservation,
  plan: PlayerPlan,
): { state: AbstractRouteState; immediate: number; step: StrategicStepId | null; techniqueValue: number } {
  const next = copyState(state);
  const step = actionRouteStep(action);
  let immediate = 0;
  let techniqueValue = 0;
  const assignments = selectedAssignments(plan);
  switch (action.type) {
    case "GAIN_MATERIALS": {
      const needed = plan.resourceDemand.claySafety + plan.resourceDemand.woodSafety;
      const useful = Math.min(action.clay + action.wood, needed);
      reduceDebt(next, "materials", useful > 0 ? 1 : 0);
      immediate += useful * 0.7 - Math.max(0, action.clay + action.wood - useful) * 0.45;
      next.actionsRemaining -= 1;
      break;
    }
    case "OFFICE_GAIN_COINS":
      reduceDebt(next, "coins");
      immediate += next.debts.coins === 0 ? 0.8 : 0;
      next.actionsRemaining -= 1;
      break;
    case "FORM_CERAMICS": {
      const needed = [...assignments.filter(({ currentStage }) => currentStage === "missing")];
      let matched = 0;
      for (const shape of action.shapes) {
        const index = needed.findIndex((assignment) => assignment.shape === shape);
        if (index >= 0) {
          matched += 1;
          needed.splice(index, 1);
        }
      }
      reduceDebt(next, "form", matched > 0 ? 1 : 0);
      immediate += matched * 1.1 - Math.max(0, action.shapes.length - matched) * (observation.game.round >= 4 ? 2.5 : 0.8);
      next.actionsRemaining -= 1;
      break;
    }
    case "GLAZE_CERAMICS": {
      const matched = action.selections.filter((selection) => assignments.some((assignment) => (
        assignment.ceramicId === selection.ceramicId &&
        assignment.glaze === selection.glaze &&
        assignment.decoration === selection.decoration
      ))).length;
      reduceDebt(next, "glaze", matched > 0 ? 1 : 0);
      immediate += matched * 1.25 - Math.max(0, action.selections.length - matched) * 1.4;
      next.actionsRemaining -= 1;
      break;
    }
    case "USE_KILN_YARD": {
      const matched = action.loads.filter(({ ceramicId }) => assignments.some((assignment) => assignment.ceramicId === ceramicId)).length;
      reduceDebt(next, "load", matched > 0 ? 1 : 0);
      immediate += matched * (1.1 + plan.conversionUrgency * 0.3) - Math.max(0, action.loads.length - matched);
      next.actionsRemaining -= 1;
      break;
    }
    case "SUBMIT_WOOD_CONTRIBUTION":
      if (Object.values(observation.game.ceramics).some(({ ownerId, stage }) => ownerId === observation.playerId && stage === "loaded")) {
        reduceDebt(next, "fire");
        immediate += 0.7;
      }
      break;
    case "COMPLETE_ORDER":
      reduceDebt(next, "complete");
      immediate += action.orderId === plan.primaryOrderId ? 2 : 0.8;
      break;
    case "PASS_WORK_PHASE":
      immediate -= Math.max(0, -plan.multiRoundRoute.actionSlack) * 1.4;
      immediate -= plan.multiRoundRoute.nextSteps.length > 0 ? 2.5 : 0;
      break;
    case "SUBMIT_PRESENTATION":
      immediate += action.ceramicIds.length * 0.5;
      break;
    case "BEGIN_GUILD_ACTION": {
      const workerKind = observation.game.players[observation.playerId]?.workers[action.workerId]?.kind ?? null;
      techniqueValue = Math.max(...Object.values(observation.game.displays.techniques).flat().map((id) => (
        longHorizonTechniqueValue(observation, plan, id, workerKind)
      )), -20);
      break;
    }
    case "GUILD_BUY_TECHNIQUE": {
      const workerKind = observation.game.phase.type === "work_guild"
        ? observation.game.players[observation.playerId]?.workers[observation.game.phase.workerId]?.kind ?? null
        : null;
      techniqueValue = longHorizonTechniqueValue(observation, plan, action.techniqueId, workerKind);
      break;
    }
  }
  return { state: next, immediate, step, techniqueValue };
}

function dependenciesMet(state: AbstractRouteState, step: StrategicStepId): boolean {
  if (step === "glaze") return state.debts.form === 0;
  if (step === "load") return state.debts.form === 0 && state.debts.glaze === 0;
  if (step === "fire") return state.debts.form === 0 && state.debts.glaze === 0 && state.debts.load === 0;
  if (step === "complete_order") return state.debts.form + state.debts.glaze + state.debts.load + state.debts.fire === 0;
  return true;
}

function futureSteps(state: AbstractRouteState): StrategicStepId[] {
  const steps: StrategicStepId[] = (Object.entries(STEP_TO_DEBT) as Array<[keyof typeof STEP_TO_DEBT, keyof AbstractRouteState["debts"]]>)
    .filter(([step, debt]) => state.debts[debt] > 0 && dependenciesMet(state, step))
    .map(([step]) => step);
  if (steps.length === 0) steps.push("pass");
  return steps;
}

function applyFutureStep(state: AbstractRouteState, step: StrategicStepId): AbstractRouteState {
  const next = copyState(state);
  const debt = STEP_TO_DEBT[step as keyof typeof STEP_TO_DEBT];
  if (debt !== undefined) reduceDebt(next, debt);
  if (["gain_materials", "gain_coins", "form", "glaze", "load"].includes(step)) next.actionsRemaining -= 1;
  return next;
}

function strategicStateValue(state: AbstractRouteState): number {
  const remaining = Object.values(state.debts).reduce((sum, value) => sum + value, 0);
  const progress = 1 - remaining / state.initialDebt;
  const overBudget = Math.max(0, remaining - Math.max(0, state.actionsRemaining));
  const completion = remaining === 0 ? 2.5 : 0;
  return progress * (2.5 + state.projectedVp * 0.28) + completion - overBudget * 1.3 - state.strandedRisk * (0.45 + remaining * 0.08);
}

function boundedSearch(
  initial: AbstractRouteState,
  config: V4SearchConfig,
): { value: number; nodes: number; depth: number; path: StrategicStepId[]; cutoff: V4SearchDiagnostic["cutoffReason"] } {
  const baseline = strategicStateValue(initial);
  let beam: BeamNode[] = [{ state: initial, value: baseline, path: [] }];
  let best = beam[0]!;
  let nodes = 1;
  let completedDepth = 0;
  let cutoff: V4SearchDiagnostic["cutoffReason"] = "depth";
  for (let depth = 1; depth < config.depth; depth += 1) {
    const expanded: BeamNode[] = [];
    for (const node of beam) {
      for (const step of futureSteps(node.state)) {
        if (nodes >= config.maxNodes) {
          cutoff = "node_budget";
          break;
        }
        const state = applyFutureStep(node.state, step);
        const value = strategicStateValue(state) * config.futureDiscount ** depth;
        expanded.push({ state, value, path: [...node.path, step] });
        nodes += 1;
      }
      if (cutoff === "node_budget") break;
    }
    if (expanded.length === 0) break;
    expanded.sort((left, right) => right.value - left.value || left.path.join(":").localeCompare(right.path.join(":")));
    beam = expanded.slice(0, config.beamWidth);
    if (beam[0]!.value > best.value) best = beam[0]!;
    completedDepth = depth;
    if (cutoff === "node_budget") break;
  }
  return { value: best.value - baseline, nodes, depth: completedDepth + 1, path: best.path, cutoff };
}

function actionLocation(action: AIAction): LocationId | null {
  switch (action.type) {
    case "GAIN_MATERIALS": return "materials_yard";
    case "FORM_CERAMICS": return "forming_studio";
    case "GLAZE_CERAMICS": return "glaze_workshop";
    case "USE_KILN_YARD": return "kiln_yard";
    case "OFFICE_GAIN_COINS":
    case "BEGIN_OFFICE_ORDERS":
    case "USE_COURT_PATRONAGE": return "market_imperial_office";
    case "BEGIN_GUILD_ACTION": return "guild_academy";
    default: return null;
  }
}

function opponentNeed(observation: PlayerObservation, location: LocationId): number {
  return Object.values(observation.game.players)
    .filter(({ id }) => id !== observation.playerId)
    .reduce((sum, player) => {
      const ceramics = Object.values(observation.game.ceramics).filter(({ ownerId }) => ownerId === player.id);
      const available = Object.values(player.workers).some(({ status }) => status === "available") ? 1 : 0;
      if (available === 0) return sum;
      switch (location) {
        case "materials_yard": return sum + (player.resources.clay <= 2 || player.resources.wood <= 1 ? 1 : 0.25);
        case "forming_studio": return sum + (player.orderHand.length > 0 && ceramics.length < 3 ? 0.8 : 0.2);
        case "glaze_workshop": return sum + (ceramics.some(({ stage }) => stage === "shaped") ? 1 : 0.1);
        case "kiln_yard": return sum + (ceramics.some(({ stage }) => stage === "glazed") ? 1 : 0.1);
        case "market_imperial_office": return sum + (player.orderHand.length < (player.kilnId === "GU" ? 4 : 3) ? 0.6 : 0.15);
        case "guild_academy": return sum + (player.techniques.length < 2 && player.resources.coins >= 2 ? 0.55 : 0.1);
      }
    }, 0);
}

function opponentPressure(observation: PlayerObservation, action: AIAction): number {
  const location = actionLocation(action);
  if (location === null || !LOCATION_IDS.includes(location)) return 0;
  const capacity = locationCapacity(location, observation.game.playerCount);
  const occupied = observation.game.actionBoard.placements[location].length;
  const remaining = Math.max(1, capacity - occupied);
  return Math.min(2.5, opponentNeed(observation, location) / remaining);
}

function terminalConversionValue(observation: PlayerObservation, plan: PlayerPlan, action: AIAction): number {
  const roundWeight = Math.max(0, observation.game.round - 2) / 3;
  switch (action.type) {
    case "GLAZE_CERAMICS": return action.selections.length * plan.conversionUrgency * 0.45 * roundWeight;
    case "USE_KILN_YARD": return action.loads.length * plan.conversionUrgency * 0.7 * roundWeight;
    case "COMPLETE_ORDER": return 1.2 * roundWeight;
    case "FORM_CERAMICS": return -Math.max(0, action.shapes.length - plan.multiRoundRoute.actionSlack) * 0.8 * roundWeight;
    case "PASS_WORK_PHASE": return plan.multiRoundRoute.nextSteps.length > 0 ? -1.8 * roundWeight : 0.4;
    default: return 0;
  }
}

function scoreWithLookahead(
  base: ScoredAIAction,
  observation: PlayerObservation,
  plan: PlayerPlan,
  profile: AIStrategyProfile,
  config: V4SearchConfig,
): ScoredAIAction {
  const initial = initialRouteState(plan);
  const root = applyRootAction(initial, base.action, observation, plan);
  const search = boundedSearch(root.state, config);
  const pressure = opponentPressure(observation, base.action);
  const terminal = terminalConversionValue(observation, plan, base.action);
  let techniqueCorrection = 0;
  if (root.techniqueValue > 0 && base.action.type === "GUILD_BUY_TECHNIQUE") {
    const frozen = base.diagnostics.techniqueForecast?.netValue ?? -20;
    const frozenContribution = frozen > 0 ? frozen : frozen - 25;
    techniqueCorrection = root.techniqueValue - frozenContribution;
  } else if (root.techniqueValue > 0 && base.action.type === "BEGIN_GUILD_ACTION") {
    const workerKind = observation.game.players[observation.playerId]?.workers[base.action.workerId]?.kind ?? null;
    const frozen = Math.max(...Object.values(observation.game.displays.techniques).flat().map((techniqueId) => (
      forecastTechniqueAcquisition(observation, profile, plan, techniqueId, workerKind).netValue
    )), -20);
    techniqueCorrection = root.techniqueValue - (frozen > 0 ? frozen : -18);
  }
  const lookaheadValue = root.immediate + search.value + techniqueCorrection;
  const adjustment = lookaheadValue * config.lookaheadWeight +
    pressure * config.opponentWeight + terminal * config.terminalWeight;
  return {
    ...base,
    totalScore: base.totalScore + adjustment,
    diagnostics: {
      ...base.diagnostics,
      search: {
        baseScore: base.totalScore,
        lookaheadValue,
        opponentPressure: pressure,
        terminalConversionValue: terminal,
        longHorizonTechniqueValue: root.techniqueValue,
        adjustedScore: base.totalScore + adjustment,
        searchedNodes: search.nodes,
        completedDepth: search.depth,
        principalVariation: root.step === null ? search.path : [root.step, ...search.path],
        cutoffReason: search.cutoff,
      },
    },
  };
}

function validConfig(config: V4SearchConfig): V4SearchConfig {
  return {
    depth: Math.max(1, Math.min(3, config.depth)) as 1 | 2 | 3,
    beamWidth: Math.max(1, Math.floor(config.beamWidth)),
    rootWidth: Math.max(1, Math.floor(config.rootWidth)),
    maxNodes: Math.max(4, Math.floor(config.maxNodes)),
    futureDiscount: Math.max(0, Math.min(1, config.futureDiscount)),
    lookaheadWeight: Math.max(0, config.lookaheadWeight),
    opponentWeight: Math.max(0, config.opponentWeight),
    terminalWeight: Math.max(0, config.terminalWeight),
  };
}

export class LookaheadAIPolicy implements AIPolicy {
  private readonly config: V4SearchConfig;
  private readonly profile: AIStrategyProfile;
  private readonly rng: SeededRandom;

  constructor(
    profile: AIStrategyProfile,
    rng: SeededRandom,
    config: V4SearchConfig = V4_SEARCH_CONFIGS.balanced,
  ) {
    this.profile = profile;
    this.rng = rng;
    this.config = validConfig(config);
  }

  async chooseAction(
    observation: PlayerObservation,
    legalActions: AIAction[],
    context: AIDecisionContext,
  ): Promise<AIPolicyDecision> {
    const started = performance.now();
    if (legalActions.length === 0) throw new Error(`AI ${observation.playerId} received no legal actions`);
    const plan = buildPlayerPlan(observation, this.profile, context.assignedIntent ?? "Hybrid");
    const base = legalActions
      .map((action) => evaluateAction(observation, action, context, this.profile, plan))
      .sort((left, right) => right.totalScore - left.totalScore || stableActionKey(left.action).localeCompare(stableActionKey(right.action)));
    const searched = base.slice(0, this.config.rootWidth).map((candidate) => scoreWithLookahead(candidate, observation, plan, this.profile, this.config));
    const scored = [...searched, ...base.slice(this.config.rootWidth)]
      .sort((left, right) => right.totalScore - left.totalScore || stableActionKey(left.action).localeCompare(stableActionKey(right.action)));
    const explorationRate = Math.max(0, Math.min(1, context.explorationRate));
    const safe = scored.filter((candidate) => {
      const optional = candidate.diagnostics.optionalEffect;
      const forecast = candidate.diagnostics.techniqueForecast;
      if (optional?.selected === true && optional.projectedNetValue <= 0) return false;
      if (forecast !== null && forecast.netValue <= 0) return false;
      return candidate.totalScore >= (scored[0]?.totalScore ?? candidate.totalScore) - 3.5;
    });
    const explored = scored.length > 1 && this.rng.nextUint32() / 0x1_0000_0000 < explorationRate;
    const poolSize = Math.max(1, Math.min(4, Math.ceil(safe.length * 0.1)));
    const chosen = explored ? safe[this.rng.nextInt(poolSize)] ?? scored[0] : scored[0];
    if (chosen === undefined) throw new Error("AI scoring produced no candidate");
    return {
      action: chosen.action,
      score: chosen.totalScore,
      factors: chosen.factors,
      alternatives: scored.slice(0, 3),
      explored,
      strategyTags: strategyTags(observation),
      plan,
      diagnostics: chosen.diagnostics,
      durationMs: performance.now() - started,
    };
  }
}
