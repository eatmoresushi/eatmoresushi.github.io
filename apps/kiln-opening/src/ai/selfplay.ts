import {
  GLAZES,
  contributionWoodCost,
  preferredHeat,
  KILN_IDS,
  ORDER_DEFINITIONS,
  SeededRandom,
  activeKilnSpaceIds,
  applyAction,
  createGame,
  createPrivateFiringState,
  currentDecisionActor,
  submitWoodContribution,
} from "../game/index.ts";
import type {
  ContributionCardId,
  CeramicState,
  GameEvent,
  GameExperimentConfig,
  GameState,
  KilnId,
  PlayerCount,
  PlayerId,
  PrivateFiringState,
} from "../game/index.ts";
import { createPlayerObservation } from "./observation.ts";
import { getLegalAIActions } from "./legalActions.ts";
import { actionTechniqueId } from "./legalActions.ts";
import { HeuristicAIPolicy } from "./policy.ts";
import { LookaheadAIPolicy, V4_SEARCH_CONFIGS } from "./lookaheadPolicy.ts";
import { RolloutAIPolicy } from "./rolloutPolicy.ts";
import { V114Policy } from "./v114Policy.ts";
import { V5_ROLLOUT_CONFIGS } from "./decisionOracle.ts";
import { learningPhase } from "./strategy.ts";
import { createV6LeafEvaluator } from "./v6LeafModel.ts";
import type { V6LeafModel } from "./v6LeafModel.ts";
import type {
  AIAction,
  AIDecisionContext,
  AIDecisionLog,
  AIPolicy,
  AIPolicyVersion,
  AIStrategyProfile,
  PlayerObservation,
  StrategyIntent,
  StrategyTag,
  V4SearchConfig,
  V5RolloutConfig,
} from "./types.ts";
import {
  AI_POLICY_V114_VERSION,
  AI_POLICY_V4_VERSION,
  AI_POLICY_V5_VERSION,
  AI_POLICY_V6_VERSION,
  AI_POLICY_VERSION,
} from "./types.ts";

export interface SelfPlayGameConfig {
  gameId: string;
  gameSequence: number;
  playerCount: PlayerCount;
  gameSeed: number;
  aiSeed: number;
  assignedTraditions: Record<PlayerId, KilnId>;
  assignedIntents?: Record<PlayerId, StrategyIntent>;
  datasetSplit?: "training" | "holdout" | "ab_evaluation";
  profile: AIStrategyProfile;
  policyVersion?: AIPolicyVersion;
  profilesByPlayer?: Partial<Record<PlayerId, AIStrategyProfile>>;
  policyVersionsByPlayer?: Partial<Record<PlayerId, AIPolicyVersion>>;
  v4SearchConfig?: V4SearchConfig;
  v5RolloutConfig?: V5RolloutConfig;
  v6LeafModel?: V6LeafModel;
  decisionObserver?: (snapshot: SelfPlayDecisionSnapshot) => void | Promise<void>;
  explorationRate?: number;
  maxDecisions?: number;
  learningPhaseOverride?: "early" | "developing" | "mature";
  experimentConfig?: GameExperimentConfig;
  experimentMetadata?: {
    readonly pairId: string;
    readonly replacementIndex: number;
    readonly frozenProfileHash: string;
    readonly policyVersion: "selfplay-003-frozen";
    readonly simulationVersion:
      | "v1.0.1-jun-ab-001-control"
      | "v1.0.1-jun-ab-001-jun-cost-1"
      | "v1.0.1-imperial-track-ab-001-candidate-a"
      | "v1.0.1-imperial-track-ab-001-candidate-b";
    readonly archivedControlGameId?: string;
    readonly matchedScenarioId?: string;
  };
}

export interface SelfPlayDecisionSnapshot {
  gameId: string;
  decisionIndex: number;
  observation: PlayerObservation;
  legalActions: AIAction[];
  context: AIDecisionContext;
}

export interface SelfPlayActionRow {
  gameId: string;
  decisionIndex: number;
  round: number;
  phase: string;
  playerId: PlayerId;
  seat: number;
  tradition: KilnId | null;
  actionType: string;
  actionJson: string;
  legalActionCount: number;
  workerKind: "shifu" | "apprentice" | null;
  locationId: string | null;
  clayBefore: number;
  woodBefore: number;
  coinsBefore: number;
  clayAfter: number;
  woodAfter: number;
  coinsAfter: number;
  explored: boolean;
  legalTechniqueIdsJson: string;
  traditionAbilityOpportunity: boolean;
}

export interface SelfPlayEventRow {
  gameId: string;
  decisionIndex: number;
  round: number;
  actorId: PlayerId;
  eventType: string;
  eventJson: string;
}

export interface DisplayExposureRow {
  gameId: string;
  round: number;
  kind: "market_order" | "imperial_order" | "technique";
  itemId: string;
}

export interface FiringCeramicRow {
  gameId: string;
  playerCount: PlayerCount;
  round: number;
  ownerId: PlayerId;
  ceramicId: string;
  shape: string;
  glaze: string;
  decoration: string;
  preferredHeat: number;
  kilnZone: "high" | "middle" | "low";
  zoneModifier: number;
  contributorCount: number;
  /** The Contribution card this ceramic's owner revealed. */
  contributionCard: ContributionCardId;
  /** Wood paid by every contributor this firing, at the cards' printed costs. */
  totalWood: number;
  baseHeat: number;
  fireModifier: number;
  preAbilityGlobalHeat: number;
  preFireHeat: number;
  preFireHeatDifference: number;
  preFireSignedError: number;
  naturalActualHeat: number;
  naturalHeatDifference: number;
  naturalQuality: string;
  fuelLedger: boolean;
  saggerSelection: boolean;
  jun: boolean;
  ge: boolean;
  protectiveSaggars: boolean;
  secondFiring: boolean;
  secondFiringOrigin: boolean;
  finalActualHeat: number;
  finalHeatDifference: number;
  finalQuality: string;
  eventualDestination: "order" | "presentation" | "sold" | "re-fired" | "unused";
}

export interface KilnFiringRow {
  gameId: string;
  playerCount: PlayerCount;
  round: number;
  activeSpaces: number;
  occupiedSpaces: number;
  occupancyRate: number;
  highOccupied: number;
  middleOccupied: number;
  lowOccupied: number;
  contributorCount: number;
  contributionsJson: string;
  totalWood: number;
  baseHeat: number;
  fireModifier: number;
  globalHeat: number;
}

export interface SelfPlayGameResult {
  config: SelfPlayGameConfig;
  initialFirstPlayerId: PlayerId;
  state: GameState;
  decisions: AIDecisionLog[];
  actions: SelfPlayActionRow[];
  events: SelfPlayEventRow[];
  displayExposures: DisplayExposureRow[];
  firings: FiringCeramicRow[];
  kilnFirings: KilnFiringRow[];
  durationMs: number;
  illegalActionAttempts: number;
  strategyTagsByPlayer: Record<PlayerId, StrategyTag[]>;
}

function actionLocation(action: AIAction): string | null {
  switch (action.type) {
    case "GAIN_MATERIALS": return "materials_yard";
    case "FORM_CERAMICS": return "forming_studio";
    case "GLAZE_CERAMICS": return "glaze_workshop";
    case "USE_KILN_YARD": return "kiln_yard";
    case "USE_LABOUR": return "labour";
    case "USE_COURT_PATRONAGE": return "court_patronage";
    case "BEGIN_OFFICE_ORDERS": return "market_imperial_office";
    case "BEGIN_GUILD_ACTION": return "guild_academy";
    default: return null;
  }
}

function isTraditionAbilityAction(action: AIAction, kilnId: KilnId | null): boolean {
  return (
    (kilnId === "DI" && action.type === "FORM_CERAMICS" && action.dingExtraShape !== undefined) ||
    (kilnId === "GU" && action.type === "COMPLETE_ORDER" && action.useGuanWaiver) ||
    (kilnId === "GE" && action.type === "RESOLVE_GE" && action.ceramicId !== null) ||
    (kilnId === "JU" && action.type === "RESOLVE_JUN" && action.ceramicId !== null)
  );
}

function workerId(action: AIAction): string | null {
  return "workerId" in action && typeof action.workerId === "string" ? action.workerId : null;
}

function nextActor(state: GameState): PlayerId | null {
  if (state.phase.type === "firing_contributions") {
    const phase = state.phase;
    return phase.eligiblePlayerIds.find((id) => !phase.submittedPlayerIds.includes(id)) ?? null;
  }
  if (state.phase.type === "presentation") {
    const phase = state.phase;
    return phase.eligiblePlayerIds.find((id) => !phase.submittedPlayerIds.includes(id)) ?? null;
  }
  return currentDecisionActor(state.phase);
}

function zoneFromSpace(spaceId: string): "high" | "middle" | "low" {
  if (spaceId.startsWith("high")) return "high";
  if (spaceId.startsWith("low")) return "low";
  return "middle";
}

function activeSpaceCount(playerCount: PlayerCount): number {
  return activeKilnSpaceIds(playerCount).length;
}

interface CurrentFiringAbilities {
  fuelLedger: Set<PlayerId>;
  saggerSelection: Set<string>;
  jun: Set<string>;
  ge: Set<string>;
  protectiveSaggars: Set<string>;
  secondFiring: Set<string>;
}

function emptyFiringAbilities(): CurrentFiringAbilities {
  return {
    fuelLedger: new Set(),
    saggerSelection: new Set(),
    jun: new Set(),
    ge: new Set(),
    protectiveSaggars: new Set(),
    secondFiring: new Set(),
  };
}

function trackAbility(action: AIAction, actorId: PlayerId, abilities: CurrentFiringAbilities): void {
  if (action.type === "RESOLVE_FUEL_LEDGER" && action.use) abilities.fuelLedger.add(actorId);
  if (action.type === "RESOLVE_SAGGER_SELECTION" && action.ceramicId !== null) abilities.saggerSelection.add(action.ceramicId);
  if (action.type === "RESOLVE_JUN" && action.ceramicId !== null) abilities.jun.add(action.ceramicId);
  if (action.type === "RESOLVE_GE" && action.ceramicId !== null) abilities.ge.add(action.ceramicId);
  if (action.type === "RESOLVE_PROTECTIVE_SAGGARS" && action.ceramicId !== null) abilities.protectiveSaggars.add(action.ceramicId);
  if (action.type === "RESOLVE_SECOND_FIRING" && action.ceramicId !== null) abilities.secondFiring.add(action.ceramicId);
}

function loadedBefore(before: GameState, ceramicId: string): Extract<CeramicState, { stage: "loaded" }> | null {
  const ceramic = before.ceramics[ceramicId];
  return ceramic?.stage === "loaded" ? ceramic : null;
}

function destinationFor(state: GameState, ceramicId: string): FiringCeramicRow["eventualDestination"] {
  const ceramic = state.ceramics[ceramicId];
  if (ceramic?.stage === "delivered") return "order";
  if (ceramic?.stage === "presented") return "presentation";
  if (ceramic?.stage === "sold") return "sold";
  return "unused";
}

function applyDestinations(rows: FiringCeramicRow[], state: GameState): void {
  const lastIndex = new Map<string, number>();
  rows.forEach((row, index) => lastIndex.set(row.ceramicId, index));
  const awaitingRefire = new Set<string>();
  rows.forEach((row, index) => {
    if (awaitingRefire.has(row.ceramicId)) {
      row.secondFiringOrigin = true;
      awaitingRefire.delete(row.ceramicId);
    }
    if (row.secondFiring) awaitingRefire.add(row.ceramicId);
    row.eventualDestination = row.secondFiring || lastIndex.get(row.ceramicId) !== index ? "re-fired" : destinationFor(state, row.ceramicId);
  });
}

function deriveKilnFirings(rows: readonly FiringCeramicRow[], playerCount: PlayerCount): KilnFiringRow[] {
  const groups = new Map<string, FiringCeramicRow[]>();
  for (const row of rows) {
    const key = `${row.gameId}:${row.round}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((group) => {
    const first = group[0]!;
    const contributions = Object.fromEntries(group.map((row) => [row.ownerId, row.contributionCard]));
    const active = activeSpaceCount(playerCount);
    return {
      gameId: first.gameId,
      playerCount,
      round: first.round,
      activeSpaces: active,
      occupiedSpaces: group.length,
      occupancyRate: group.length / active,
      highOccupied: group.filter((row) => row.kilnZone === "high").length,
      middleOccupied: group.filter((row) => row.kilnZone === "middle").length,
      lowOccupied: group.filter((row) => row.kilnZone === "low").length,
      contributorCount: first.contributorCount,
      contributionsJson: JSON.stringify(contributions),
      totalWood: first.totalWood,
      baseHeat: first.baseHeat,
      fireModifier: first.fireModifier,
      globalHeat: first.preAbilityGlobalHeat,
    };
  });
}

function visibleDisplayKeys(state: GameState): Array<{ kind: DisplayExposureRow["kind"]; itemId: string }> {
  return [
    ...state.marketDisplay.map((itemId) => ({ kind: "market_order" as const, itemId })),
    ...state.imperialDisplay.map((itemId) => ({ kind: "imperial_order" as const, itemId })),
    ...Object.values(state.techniqueDisplay).flat().map((itemId) => ({ kind: "technique" as const, itemId })),
  ];
}

function recordFiringEvents(
  before: GameState,
  events: readonly GameEvent[],
  abilities: CurrentFiringAbilities,
  firings: FiringCeramicRow[],
): void {
  const fire = events.find((event): event is Extract<GameEvent, { type: "FIRE_REVEALED" }> => event.type === "FIRE_REVEALED");
  const wood = events.find((event): event is Extract<GameEvent, { type: "WOOD_REVEALED" }> => event.type === "WOOD_REVEALED");
  const context = before.firingContext;
  const resolved = events.filter((event): event is Extract<GameEvent, { type: "FIRING_RESOLVED" }> => event.type === "FIRING_RESOLVED");
  const effectiveContext = context ?? (fire === undefined ? null : before.firingContext);
  if (resolved.length === 0) return;
  const baseHeat = effectiveContext?.baseHeat ?? fire?.baseHeat ?? before.lastFiringResult?.baseHeat ?? 2;
  const fireModifier = effectiveContext?.fireModifier ?? fire?.modifier ?? before.lastFiringResult?.fireModifier ?? 0;
  const globalHeat = effectiveContext?.globalHeat ?? fire?.globalHeat ?? baseHeat + fireModifier;
  const contributions = effectiveContext?.contributions ?? wood?.contributions ?? {};
  const loaded = resolved.map((event) => loadedBefore(before, event.ceramicId)).filter((ceramic): ceramic is Extract<CeramicState, { stage: "loaded" }> => ceramic !== null);
  for (const event of resolved) {
    const ceramic = loadedBefore(before, event.ceramicId);
    if (ceramic === null) continue;
    const preFireHeat = baseHeat + event.zoneModifier;
    const preFireSignedError = preFireHeat - GAME_CONFIG_GLAZE_HEAT[ceramic.glaze]!;
    firings.push({
      gameId: before.gameId,
      playerCount: before.playerCount,
      round: before.round,
      ownerId: ceramic.ownerId,
      ceramicId: ceramic.id,
      shape: ceramic.shape,
      glaze: ceramic.glaze,
      decoration: ceramic.decoration,
      preferredHeat: GAME_CONFIG_GLAZE_HEAT[ceramic.glaze] ?? 0,
      kilnZone: zoneFromSpace(ceramic.kilnSpaceId),
      zoneModifier: event.zoneModifier,
      contributorCount: Object.keys(contributions).length,
      contributionCard: contributions[ceramic.ownerId] ?? "TEND",
      totalWood: Object.values(contributions).reduce((sum, card) => sum + contributionWoodCost(card), 0),
      baseHeat,
      fireModifier: event.fireModifier,
      preAbilityGlobalHeat: globalHeat,
      preFireHeat,
      preFireHeatDifference: Math.abs(preFireSignedError),
      preFireSignedError,
      naturalActualHeat: event.naturalActualHeat,
      naturalHeatDifference: event.naturalHeatDifference,
      naturalQuality: event.naturalQuality,
      fuelLedger: abilities.fuelLedger.has(ceramic.ownerId),
      saggerSelection: abilities.saggerSelection.has(ceramic.id),
      jun: abilities.jun.has(ceramic.id),
      ge: abilities.ge.has(ceramic.id),
      protectiveSaggars: abilities.protectiveSaggars.has(ceramic.id),
      secondFiring: abilities.secondFiring.has(ceramic.id),
      secondFiringOrigin: false,
      finalActualHeat: event.finalActualHeat,
      finalHeatDifference: event.finalHeatDifference,
      finalQuality: event.finalQuality,
      eventualDestination: "unused",
    });
  }
}

function recordSecondFiringChoice(
  before: GameState,
  action: AIAction,
  abilities: CurrentFiringAbilities,
  firings: FiringCeramicRow[],
): void {
  if (action.type !== "RESOLVE_SECOND_FIRING" || action.ceramicId === null) return;
  const ceramic = loadedBefore(before, action.ceramicId);
  const context = before.firingContext;
  const result = context?.ceramicResults[action.ceramicId];
  if (
    ceramic === null ||
    context === null ||
    context.baseHeat === null ||
    context.fireModifier === null ||
    context.globalHeat === null ||
    result === undefined ||
    result.assignedQuality === null
  ) return;
  const preFireHeat = context.baseHeat + result.zoneModifier;
  const preFireSignedError = preFireHeat - GAME_CONFIG_GLAZE_HEAT[ceramic.glaze]!;
  firings.push({
    gameId: before.gameId,
    playerCount: before.playerCount,
    round: before.round,
    ownerId: ceramic.ownerId,
    ceramicId: ceramic.id,
    shape: ceramic.shape,
    glaze: ceramic.glaze,
    decoration: ceramic.decoration,
    preferredHeat: GAME_CONFIG_GLAZE_HEAT[ceramic.glaze]!,
    kilnZone: zoneFromSpace(ceramic.kilnSpaceId),
    zoneModifier: result.zoneModifier,
    contributorCount: context.contributors.length,
    contributionCard: context.contributions[ceramic.ownerId] ?? "TEND",
    totalWood: Object.values(context.contributions).reduce((sum, card) => sum + contributionWoodCost(card), 0),
    baseHeat: context.baseHeat,
    fireModifier: context.fireModifier,
    preAbilityGlobalHeat: context.globalHeat,
    preFireHeat,
    preFireHeatDifference: Math.abs(preFireSignedError),
    preFireSignedError,
    naturalActualHeat: result.naturalActualHeat,
    naturalHeatDifference: result.naturalHeatDifference,
    naturalQuality: result.naturalHeatDifference === 0 ? "masterpiece" : result.naturalHeatDifference === 1 ? "fine" : result.naturalHeatDifference === 2 ? "standard" : "flawed",
    fuelLedger: abilities.fuelLedger.has(ceramic.ownerId),
    saggerSelection: abilities.saggerSelection.has(ceramic.id),
    jun: abilities.jun.has(ceramic.id),
    ge: abilities.ge.has(ceramic.id),
    protectiveSaggars: abilities.protectiveSaggars.has(ceramic.id),
    secondFiring: true,
    secondFiringOrigin: false,
    finalActualHeat: result.finalActualHeat,
    finalHeatDifference: result.finalHeatDifference,
    finalQuality: result.assignedQuality,
    eventualDestination: "re-fired",
  });
}

/**
 * Preferred Heat for firing telemetry, read from the authoritative content rather than
 * duplicated here. The previous hard-coded copy still carried the pre-V1.1.1 values
 * (grey_green 2, moon_white 3) against the shipped 3 and 4, so every pre-fire alignment
 * figure for those two Glazes was measured one step off. The engine was never affected --
 * it assigns Quality from its own preferredHeat() -- so only this telemetry was wrong.
 */
export const GAME_CONFIG_GLAZE_HEAT: Record<string, number> = Object.fromEntries(
  GLAZES.map((glaze) => [glaze, preferredHeat(glaze)]),
);

export async function runSelfPlayGame(config: SelfPlayGameConfig): Promise<SelfPlayGameResult> {
  const started = performance.now();
  const gameRng = new SeededRandom(config.gameSeed);
  const created = createGame(
    {
      gameId: config.gameId,
      players: Array.from({ length: config.playerCount }, (_, seat) => ({
        id: `P${seat + 1}`,
        displayName: `AI ${seat + 1}`,
      })),
      ...(config.experimentConfig === undefined ? {} : { experimentConfig: config.experimentConfig }),
    },
    gameRng,
  );
  if (!created.ok) throw new Error(`Game setup failed: ${created.error.code} ${created.error.message}`);
  let state = created.state;
  const initialFirstPlayerId = state.firstPlayerId;
  let privateFiringState = createPrivateFiringState(state);
  const profileFor = (playerId: PlayerId) => config.profilesByPlayer?.[playerId] ?? config.profile;
  const policyVersionFor = (playerId: PlayerId): AIPolicyVersion => config.policyVersionsByPlayer?.[playerId] ??
    config.policyVersion ?? profileFor(playerId).aiPolicyVersion ?? AI_POLICY_VERSION;
  const policies = Object.fromEntries(
    state.playerOrder.map((playerId, index) => {
      const profile = profileFor(playerId);
      const rng = new SeededRandom((config.aiSeed + (index + 1) * 0x9e3779b9) >>> 0);
      const version = policyVersionFor(playerId);
      const policy: AIPolicy = version === AI_POLICY_V114_VERSION
        ? new V114Policy(profile, rng)
        : version === AI_POLICY_V6_VERSION
        ? (() => {
            if (config.v6LeafModel === undefined) throw new Error("Selfplay-006 requires a calibrated V1.0.2 leaf model");
            return new RolloutAIPolicy(
              profile,
              rng,
              config.v5RolloutConfig ?? V5_ROLLOUT_CONFIGS.fast,
              (config.aiSeed + (index + 1) * 0x6006_9e37) >>> 0,
              {
                leafEvaluator: createV6LeafEvaluator(config.v6LeafModel),
                oracleVersion: "decision-oracle-002",
                leafModelId: config.v6LeafModel.modelId,
              },
            );
          })()
        : version === AI_POLICY_V5_VERSION
        ? new RolloutAIPolicy(
            profile,
            rng,
            config.v5RolloutConfig ?? V5_ROLLOUT_CONFIGS.fast,
            (config.aiSeed + (index + 1) * 0x5005_9e37) >>> 0,
          )
        : version === AI_POLICY_V4_VERSION
          ? new LookaheadAIPolicy(profile, rng, config.v4SearchConfig ?? V4_SEARCH_CONFIGS.balanced)
          : new HeuristicAIPolicy(profile, rng);
      return [playerId, policy];
    }),
  ) as Record<PlayerId, AIPolicy>;
  const decisions: AIDecisionLog[] = [];
  const actions: SelfPlayActionRow[] = [];
  const eventRows: SelfPlayEventRow[] = [];
  const displayExposures: DisplayExposureRow[] = [];
  const displayed = new Set<string>();
  const recordNewDisplays = (displayState: GameState) => {
    for (const visible of visibleDisplayKeys(displayState)) {
      const key = `${visible.kind}:${visible.itemId}`;
      if (displayed.has(key)) continue;
      displayed.add(key);
      displayExposures.push({ gameId: config.gameId, round: displayState.round, ...visible });
    }
  };
  recordNewDisplays(state);
  const firings: FiringCeramicRow[] = [];
  const tagsByPlayer: Record<PlayerId, StrategyTag[]> = {};
  let abilities = emptyFiringAbilities();
  let illegalActionAttempts = 0;
  const maximum = config.maxDecisions ?? 2_500;

  for (let decisionIndex = 1; state.phase.type !== "finished"; decisionIndex += 1) {
    if (decisionIndex > maximum) throw new Error(`Decision guard exceeded at ${state.phase.type}`);
    if (state.phase.type === "firing_contributions" && privateFiringState.windowId !== state.phase.windowId) {
      privateFiringState = createPrivateFiringState(state);
      abilities = emptyFiringAbilities();
    }
    const actorId = nextActor(state);
    if (actorId === null) throw new Error(`No actor for unfinished phase ${state.phase.type}`);
    const legalActions = getLegalAIActions(state, actorId, privateFiringState);
    if (legalActions.length === 0) throw new Error(`No legal actions for ${actorId} in ${state.phase.type}`);
    const observation = createPlayerObservation(state, actorId, privateFiringState);
    const phase = config.learningPhaseOverride ?? learningPhase(config.gameSequence);
    const explorationRate = config.explorationRate ?? profileFor(actorId).exploration[phase];
    const policy = policies[actorId];
    if (policy === undefined) throw new Error(`Missing policy for ${actorId}`);
    const decisionContext: AIDecisionContext = {
      gameSequence: config.gameSequence,
      decisionIndex,
      learningPhase: phase,
      assignedTradition: config.assignedTraditions[actorId] ?? KILN_IDS[0]!,
      assignedIntent: config.assignedIntents?.[actorId] ?? "Hybrid",
      explorationRate,
      mode: "selfplay",
    };
    await config.decisionObserver?.({
      gameId: config.gameId,
      decisionIndex,
      observation: structuredClone(observation),
      legalActions: structuredClone(legalActions),
      context: structuredClone(decisionContext),
    });
    const decision = await policy.chooseAction(observation, legalActions, decisionContext);
    tagsByPlayer[actorId] = decision.strategyTags;
    const playerBefore = state.players[actorId];
    if (playerBefore === undefined) throw new Error(`Missing actor state for ${actorId}`);
    const before = state;
    trackAbility(decision.action, actorId, abilities);
    recordSecondFiringChoice(before, decision.action, abilities, firings);
    let result: { ok: true; state: GameState; events: GameEvent[] };
    if (decision.action.type === "SUBMIT_WOOD_CONTRIBUTION") {
      const contributionResult = submitWoodContribution(
        state,
        privateFiringState,
        actorId,
        decision.action.card,
        gameRng,
      );
      if (!contributionResult.ok) {
        illegalActionAttempts += 1;
        throw new Error(`Legal-action contract failed: ${contributionResult.error.code}: ${contributionResult.error.message}; action=${JSON.stringify(decision.action)}`);
      }
      privateFiringState = contributionResult.privateState;
      result = contributionResult;
    } else {
      const actionResult = applyAction(state, actorId, decision.action, gameRng);
      if (!actionResult.ok) {
        illegalActionAttempts += 1;
        throw new Error(`Legal-action contract failed: ${actionResult.error.code}: ${actionResult.error.message}; action=${JSON.stringify(decision.action)}`);
      }
      result = actionResult;
    }
    state = result.state;
    recordNewDisplays(state);
    const playerAfter = state.players[actorId];
    if (playerAfter === undefined) throw new Error(`Missing post-action state for ${actorId}`);
    const selectedWorkerId = workerId(decision.action);
    actions.push({
      gameId: config.gameId,
      decisionIndex,
      round: before.round,
      phase: before.phase.type,
      playerId: actorId,
      seat: playerBefore.seatIndex,
      tradition: playerBefore.kilnId,
      actionType: decision.action.type,
      actionJson: JSON.stringify(decision.action),
      legalActionCount: legalActions.length,
      workerKind: selectedWorkerId === null ? null : playerBefore.workers[selectedWorkerId]?.kind ?? null,
      locationId: actionLocation(decision.action),
      clayBefore: playerBefore.resources.clay,
      woodBefore: playerBefore.resources.wood,
      coinsBefore: playerBefore.resources.coins,
      clayAfter: playerAfter.resources.clay,
      woodAfter: playerAfter.resources.wood,
      coinsAfter: playerAfter.resources.coins,
      explored: decision.explored,
      legalTechniqueIdsJson: JSON.stringify([
        ...new Set(legalActions.map(actionTechniqueId).filter((id): id is string => id !== null)),
      ]),
      traditionAbilityOpportunity: legalActions.some((action) => isTraditionAbilityAction(action, playerBefore.kilnId)),
    });
    decisions.push({
      decisionId: `${config.gameId}:D${decisionIndex}`,
      gameId: config.gameId,
      playerId: actorId,
      policyVersion: policyVersionFor(actorId),
      round: before.round,
      phase: before.phase.type,
      legalActionCount: legalActions.length,
      chosenActionType: decision.action.type,
      chosenActionScore: decision.score,
      topAlternatives: decision.alternatives.map((alternative) => ({
        actionType: alternative.action.type,
        score: alternative.totalScore,
      })),
      strategyTags: decision.strategyTags,
      assignedIntent: config.assignedIntents?.[actorId] ?? "Hybrid",
      plan: decision.plan,
      diagnostics: decision.diagnostics,
      factors: decision.factors,
      decisionDurationMs: decision.durationMs,
      explored: decision.explored,
    });
    for (const event of result.events) {
      eventRows.push({
        gameId: config.gameId,
        decisionIndex,
        round: before.round,
        actorId,
        eventType: event.type,
        eventJson: JSON.stringify(event),
      });
      if (event.type === "STARTING_ORDERS_REVEALED") {
        for (const [startingPlayerId, orderIds] of Object.entries(event.ordersByPlayer)) {
          for (const orderId of orderIds) {
            eventRows.push({
              gameId: config.gameId,
              decisionIndex,
              round: before.round,
              actorId: startingPlayerId,
              eventType: "STARTING_ORDER_KEPT",
              eventJson: JSON.stringify({
                type: "STARTING_ORDER_KEPT",
                playerId: startingPlayerId,
                orderId,
                telemetryOnlyOpeningPair: true,
              }),
            });
          }
        }
      }
    }
    if (before.phase.type === "setup_kiln_selection" && state.phase.type !== "setup_kiln_selection") {
      const awaitingDecision = state.phase.type === "setup_starting_orders"
        ? new Set(state.phase.decisionOrder)
        : new Set<PlayerId>();
      for (const startingPlayerId of state.playerOrder) {
        if (awaitingDecision.has(startingPlayerId)) continue;
        const orderId = state.players[startingPlayerId]?.orderHand[0];
        if (orderId === undefined) continue;
        eventRows.push({
          gameId: config.gameId,
          decisionIndex,
          round: before.round,
          actorId: startingPlayerId,
          eventType: "STARTING_ORDER_KEPT",
          eventJson: JSON.stringify({
            type: "STARTING_ORDER_KEPT",
            playerId: startingPlayerId,
            orderId,
            telemetryOnlyAutomaticKeep: true,
          }),
        });
      }
    }
    recordFiringEvents(before, result.events, abilities, firings);
  }

  if (state.finalResult === null) throw new Error("Finished game has no final result");
  applyDestinations(firings, state);
  return {
    config,
    initialFirstPlayerId,
    state,
    decisions,
    actions,
    events: eventRows,
    displayExposures,
    firings,
    kilnFirings: deriveKilnFirings(firings, state.playerCount),
    durationMs: performance.now() - started,
    illegalActionAttempts,
    strategyTagsByPlayer: tagsByPlayer,
  };
}

export function traditionCombinations(playerCount: PlayerCount): KilnId[][] {
  const result: KilnId[][] = [];
  const choose = (start: number, selected: KilnId[]) => {
    if (selected.length === playerCount) {
      result.push([...selected]);
      return;
    }
    for (let index = start; index < KILN_IDS.length; index += 1) {
      const tradition = KILN_IDS[index];
      if (tradition !== undefined) choose(index + 1, [...selected, tradition]);
    }
  };
  choose(0, []);
  return result;
}

export function assignedTraditionsForGame(
  playerCount: PlayerCount,
  sequence: number,
): Record<PlayerId, KilnId> {
  const combinations = traditionCombinations(playerCount);
  const set = combinations[(sequence - 1) % combinations.length];
  if (set === undefined) throw new Error("Tradition schedule is empty");
  const cycle = Math.floor((sequence - 1) / combinations.length);
  return Object.fromEntries(
    Array.from({ length: playerCount }, (_, seat) => [
      `P${seat + 1}`,
      set[(seat + cycle) % playerCount],
    ]),
  ) as Record<PlayerId, KilnId>;
}

const STRATEGY_INTENTS: readonly StrategyIntent[] = [
  "Market",
  "Imperial",
  "Hybrid",
  "Quality-control",
  "Volume-multi",
  "Technique-economy",
];

export function assignedStrategyIntentsForGame(
  playerCount: PlayerCount,
  sequence: number,
): Record<PlayerId, StrategyIntent> {
  const offset = ((sequence - 1) * playerCount) % STRATEGY_INTENTS.length;
  return Object.fromEntries(Array.from({ length: playerCount }, (_, seat) => [
    `P${seat + 1}`,
    STRATEGY_INTENTS[(offset + seat) % STRATEGY_INTENTS.length]!,
  ])) as Record<PlayerId, StrategyIntent>;
}

export function orderLearningRows(result: SelfPlayGameResult): Array<{
  playerId: PlayerId;
  won: boolean;
  finalScore: number;
  actionCounts: Record<string, number>;
  completedOrderIds: string[];
  uncompletedOrders: Array<{ orderId: string; acquisitionFeasibility: number; actionsInvested: number }>;
  acquiredTechniqueIds: string[];
  techniquePerformance: Array<{ techniqueId: string; opportunities: number; uses: number; contribution: number }>;
  traditionId: KilnId;
  assignedIntent: StrategyIntent;
  realizedTags: StrategyTag[];
  resourceRemainder: { clay: number; wood: number; coins: number };
  naturalMasterpieces: number;
  finalMasterpieces: number;
  flawedCeramics: number;
  firedCeramics: number;
  unusedFinishedCeramics: number;
}> {
  const final = result.state.finalResult;
  if (final === null) return [];
  return result.state.playerOrder.map((playerId) => {
    const player = result.state.players[playerId]!;
    const actionCounts = result.actions.filter((row) => row.playerId === playerId).reduce<Record<string, number>>((counts, row) => {
      counts[row.actionType] = (counts[row.actionType] ?? 0) + 1;
      return counts;
    }, {});
    const playerFirings = result.firings.filter((row) => row.ownerId === playerId);
    const playerDecisions = result.decisions.filter((row) => row.playerId === playerId);
    const pipelineTypes = new Set(["FORM_CERAMICS", "GLAZE_CERAMICS", "USE_KILN_YARD", "SUBMIT_WOOD_CONTRIBUTION"]);
    const uncompletedOrders = player.orderHand.map((orderId) => {
      const acquisition = playerDecisions.find((decision) => (
        decision.chosenActionType === "OFFICE_TAKE_ORDER" || decision.chosenActionType === "OFFICE_DRAW_BLIND_ORDER"
      ) && decision.plan.orderFeasibilities.some((feasibility) => feasibility.orderId === orderId));
      const planned = playerDecisions.filter((decision) => (
        decision.plan.primaryOrderId === orderId || decision.plan.secondaryOrderIds.includes(orderId)
      ));
      return {
        orderId,
        acquisitionFeasibility: acquisition?.plan.orderFeasibilities.find((feasibility) => feasibility.orderId === orderId)?.probability
          ?? planned[0]?.plan.orderFeasibilities.find((feasibility) => feasibility.orderId === orderId)?.probability
          ?? 0.25,
        actionsInvested: planned.filter((decision) => pipelineTypes.has(decision.chosenActionType)).length,
      };
    });
    const techniquePerformance = player.techniques.map(({ id }) => {
      const opportunities = result.actions.filter((row) => row.playerId === playerId && (JSON.parse(row.legalTechniqueIdsJson) as string[]).includes(id)).length;
      const uses = result.events.filter((row) => {
        const event = JSON.parse(row.eventJson) as GameEvent & { playerId?: PlayerId; techniqueId?: string };
        return event.type === "TECHNIQUE_USED" && event.playerId === playerId && event.techniqueId === id;
      }).length;
      return { techniqueId: id, opportunities, uses, contribution: uses > 0 ? 1 : -0.25 };
    });
    const finalTags = result.strategyTagsByPlayer[playerId] ?? [];
    return {
      playerId,
      won: final.winnerIds.includes(playerId),
      finalScore: final.scores[playerId]?.total ?? 0,
      actionCounts,
      completedOrderIds: player.completedOrders.map(({ orderId }) => orderId),
      uncompletedOrders,
      acquiredTechniqueIds: player.techniques.map(({ id }) => id),
      techniquePerformance,
      traditionId: player.kilnId!,
      assignedIntent: result.config.assignedIntents?.[playerId] ?? "Hybrid",
      realizedTags: finalTags,
      resourceRemainder: { ...player.resources },
      naturalMasterpieces: playerFirings.filter((row) => row.naturalQuality === "masterpiece").length,
      finalMasterpieces: playerFirings.filter((row) => row.finalQuality === "masterpiece").length,
      flawedCeramics: playerFirings.filter((row) => row.finalQuality === "flawed").length,
      firedCeramics: playerFirings.length,
      unusedFinishedCeramics: Object.values(result.state.ceramics).filter((ceramic) => ceramic.ownerId === playerId && ceramic.stage === "finished").length,
    };
  });
}

export function orderDefinitionExists(id: string): boolean {
  return ORDER_DEFINITIONS[id] !== undefined;
}
