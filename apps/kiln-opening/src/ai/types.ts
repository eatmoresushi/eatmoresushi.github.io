import type {
  ActiveImperialTrackRules,
  Decoration,
  FireModifier,
  Glaze,
  KilnId,
  PlayerCount,
  PlayerId,
  Quality,
  Shape,
} from "../game/index.ts";
import type {
  AuthoritativeCommand,
  PendingContribution,
  PublicGameState,
} from "../multiplayer/types.ts";

export const AI_POLICY_VERSION = "selfplay-003" as const;
export const AI_SIMULATION_VERSION = "v1.0.2-selfplay-003-compat" as const;
export const AI_POLICY_V4_VERSION = "selfplay-004" as const;
export const AI_SIMULATION_V4_VERSION = "v1.0.2-selfplay-004-compat" as const;
export const AI_POLICY_V5_VERSION = "selfplay-005" as const;
export const AI_SIMULATION_V5_VERSION = "v1.0.2-selfplay-005-compat" as const;
export const AI_POLICY_V6_VERSION = "selfplay-006" as const;
/** V1.1.1 candidate: frozen V003 play with a computed Wood bid. */
export const AI_POLICY_V114_VERSION = "rules-v1.1.4-contribution-001" as const;
export const AI_SIMULATION_V114_VERSION = "v1.1.4-contribution-001" as const;
/** V1.1.5: frozen V003 scoring with a retry-aware Order feasibility model. */
export const AI_POLICY_V115_VERSION = "rules-v1.1.5-order-001" as const;
export const AI_SIMULATION_V115_VERSION = "v1.1.5-order-001" as const;
/** V1.1.1 joint candidate: chooses kiln zone and Wood bid for one target Base Heat. */
export const AI_SIMULATION_V6_VERSION = "v1.0.2-selfplay-006-leaf-001" as const;

export type AIPolicyVersion =
  | typeof AI_POLICY_VERSION
  | typeof AI_POLICY_V4_VERSION
  | typeof AI_POLICY_V5_VERSION
  | typeof AI_POLICY_V6_VERSION
  | typeof AI_POLICY_V114_VERSION
  | typeof AI_POLICY_V115_VERSION;

export type AIAction = AuthoritativeCommand;

export type StrategyTag =
  | "Market-heavy"
  | "Imperial-heavy"
  | "Hybrid"
  | "Quality"
  | "Volume"
  | "Technique"
  | "Firing-control"
  | "Presentation"
  | "Coin-economy";

export type StrategyIntent =
  | "Market"
  | "Imperial"
  | "Hybrid"
  | "Quality-control"
  | "Volume-multi"
  | "Technique-economy";

export type PlanReason =
  | "ready"
  | "pipeline_work"
  | "resource_shortage"
  | "quality_risk"
  | "relation_conflict"
  | "ceramic_conflict"
  | "insufficient_time"
  | "unreachable_imperial_route";

export interface CeramicSpecification {
  requirementIndex: number;
  shape: Shape;
  glaze: Glaze;
  decoration: Decoration;
  minQuality: Quality;
}

export interface PlannedCeramicAssignment extends CeramicSpecification {
  ceramicId: string | null;
  currentStage: "missing" | "shaped" | "glazed" | "loaded" | "finished";
  stageDebt: number;
  qualityProbability: number;
}

export interface OrderFeasibility {
  orderId: string;
  probability: number;
  feasible: boolean;
  assignments: PlannedCeramicAssignment[];
  missingSpecifications: CeramicSpecification[];
  actionDebt: number;
  resourceDebt: { clay: number; wood: number; coins: number };
  earliestCompletionRound: number;
  relationConflicts: number;
  reasons: PlanReason[];
}

export interface ResourceDemand {
  clay: number;
  wood: number;
  coins: number;
  claySafety: number;
  woodSafety: number;
  coinSafety: number;
}

export interface PlayerPlan {
  assignedIntent: StrategyIntent;
  primaryOrderId: string | null;
  secondaryOrderIds: string[];
  orderFeasibilities: OrderFeasibility[];
  resourceDemand: ResourceDemand;
  pipeline: { shaped: number; glazed: number; loaded: number; finished: number };
  conversionUrgency: number;
  remainingRounds: number;
  handConflictCount: number;
  reachableImperialSpace: number;
  terminalForecast: TerminalConversionForecast;
  imperialRoute: ImperialRouteForecast;
  multiRoundRoute: MultiRoundRoutePlan;
}

export type StrategicStepId =
  | "gain_materials"
  | "gain_coins"
  | "form"
  | "glaze"
  | "load"
  | "fire"
  | "complete_order"
  | "acquire_order"
  | "acquire_technique"
  | "present"
  | "pass";

export interface OrderRouteForecast {
  orderId: string;
  estimatedWorkerActions: number;
  requiredFirings: number;
  completionRound: number;
  completionProbability: number;
  expectedValue: number;
  fitsActionBudget: boolean;
  bottleneck: StrategicStepId;
}

export interface RouteRoundForecast {
  round: number;
  availableWorkerActions: number;
  plannedSteps: StrategicStepId[];
}

export interface MultiRoundRoutePlan {
  totalWorkerActionsAvailable: number;
  totalWorkerActionsRequired: number;
  actionSlack: number;
  projectedOrderCompletions: number;
  projectedOrderVp: number;
  strandedPipelineRisk: number;
  nextSteps: StrategicStepId[];
  rounds: RouteRoundForecast[];
  orders: OrderRouteForecast[];
}

export interface TerminalConversionForecast {
  remainingWorkerActions: number;
  remainingFirings: number;
  plannedDestinations: number;
  presentationCapacity: number;
  finishedAssignable: number;
  unfinishedAssignable: number;
  surplusCeramics: number;
  shouldStartSpeculativeCeramic: boolean;
}

export interface ImperialRouteForecast {
  viable: boolean;
  projectedProgress: number;
  projectedOrderProgress: number;
  patronageReachable: boolean;
  presentationReachable: boolean;
  sealReachable: boolean;
  preferredPath: "order" | "order_then_patronage" | "presentation" | "seal" | "fallback";
  reasonCodes: string[];
}

export interface PlayerObservation {
  /** Rules contract used to interpret every public and private field below. */
  rulesVersion: "1.0.2" | "1.0.4" | "1.0.9" | "1.1.1" | "1.1.4" | "1.1.5";
  playerId: PlayerId;
  game: PublicGameState;
  ownPendingContribution: PendingContribution | null;
  /** Private Test Pieces information for this player only. */
  ownFireModifierPeek: FireModifier | null;
  knownFireRemaining: Record<"-2" | "-1" | "0" | "1" | "2", number>;
  junActivationCoinCost: 0 | 1 | 2;
  imperialTrackRules: ActiveImperialTrackRules;
}

export interface EvaluationFactors {
  immediateVP: number;
  futureVP: number;
  resourceEfficiency: number;
  imperialValue: number;
  qualityValue: number;
  blocking: number;
  /**
   * Value of what this placement denies opponents. Always 0 under frozen V003, which has
   * no denial term; written only by the V1.1.5 denial lineage. Distinct from `blocking`,
   * which the evaluator uses for the Technique-forecast penalty.
   */
  opponentDenial: number;
  risk: number;
  learned: number;
  orderFeasibility: number;
  planProgress: number;
  conversionUrgency: number;
  resourceDemand: number;
  opportunityCost: number;
}

export interface ScoredAIAction {
  action: AIAction;
  totalScore: number;
  factors: EvaluationFactors;
  diagnostics: AIDecisionDiagnostics;
}

export type OptionalEffectId =
  | "sagger_selection"
  | "ge"
  | "jun"
  | "protective_saggars"
  | "fuel_ledger"
  | "second_firing";

export interface OptionalEffectDiagnostic {
  effectId: OptionalEffectId;
  eligibleTargetIds: string[];
  selected: boolean;
  selectedTargetId: string | null;
  selectedDelta: -1 | 1 | null;
  naturalQuality: Quality | null;
  projectedQuality: Quality | null;
  qualityRankDelta: number;
  compatibleOrdersBefore: number;
  compatibleOrdersAfter: number;
  orderValueDelta: number;
  coinCost: number;
  woodCost: number;
  opportunityCost: number;
  grossBenefit: number;
  projectedNetValue: number;
  reasonCode: string;
}

export interface TechniqueAcquisitionForecast {
  techniqueId: string;
  remainingRounds: number;
  expectedWindows: number;
  opportunityProbability: number;
  expectedBeneficialUses: number;
  grossBenefit: number;
  purchaseCost: number;
  activationCost: number;
  workerOpportunityCost: number;
  netValue: number;
  planCompatibility: number;
  reasonCodes: string[];
}

export interface AIDecisionDiagnostics {
  optionalEffect: OptionalEffectDiagnostic | null;
  techniqueForecast: TechniqueAcquisitionForecast | null;
  search: V4SearchDiagnostic | null;
  oracle: DecisionOracleDiagnostic | null;
}

export interface V4SearchConfig {
  depth: 1 | 2 | 3;
  beamWidth: number;
  rootWidth: number;
  maxNodes: number;
  futureDiscount: number;
  lookaheadWeight: number;
  opponentWeight: number;
  terminalWeight: number;
}

export interface V4SearchDiagnostic {
  baseScore: number;
  lookaheadValue: number;
  opponentPressure: number;
  terminalConversionValue: number;
  longHorizonTechniqueValue: number;
  adjustedScore: number;
  searchedNodes: number;
  completedDepth: number;
  principalVariation: StrategicStepId[];
  cutoffReason: "depth" | "node_budget";
}

export interface V5RolloutConfig {
  rootWidth: number;
  samplesPerAction: number;
  horizonDecisions: number;
  rolloutWeight: number;
  baseScoreWeight: number;
  maxOracleActions: number;
  baseScoreConfidenceMargin: number;
}

export interface OracleActionEstimate {
  action: AIAction;
  baseScore: number;
  rolloutMean: number;
  rolloutStandardDeviation: number;
  successfulSamples: number;
  failedSamples: number;
  combinedScore: number;
}

export interface DecisionOracleDiagnostic {
  oracleVersion: "decision-oracle-001" | "decision-oracle-002";
  leafModelId: string | null;
  publicStateFingerprint: string;
  beliefSamples: number;
  horizonDecisions: number;
  candidateCount: number;
  selectedActionKey: string;
  selectedRolloutMean: number;
  predictedRegret: number;
  estimates: OracleActionEstimate[];
  fallbackReason: null | "unsupported_phase" | "single_legal_action" | "no_successful_rollout";
}

export interface AIDecisionContext {
  gameSequence: number;
  decisionIndex: number;
  learningPhase: "early" | "developing" | "mature";
  assignedTradition: KilnId;
  assignedIntent?: StrategyIntent;
  explorationRate: number;
  mode: "selfplay" | "live" | "regression";
}

export interface AIPolicyDecision {
  action: AIAction;
  score: number;
  factors: EvaluationFactors;
  alternatives: ScoredAIAction[];
  explored: boolean;
  strategyTags: StrategyTag[];
  plan: PlayerPlan;
  diagnostics: AIDecisionDiagnostics;
  durationMs: number;
}

export interface AIPolicy {
  chooseAction(
    observation: PlayerObservation,
    legalActions: AIAction[],
    context: AIDecisionContext,
  ): Promise<AIPolicyDecision>;
}

export interface AIStrategyProfile {
  /** Rules used to create or train this serialized profile. */
  rulesVersion: "1.0.1" | "1.0.2" | "1.0.4" | "1.0.9" | "1.1.1" | "1.1.4" | "1.1.5";
  /** Current engine rules; permits an explicit historical-policy compatibility audit. */
  currentRulesVersion?: "1.0.2" | "1.0.4" | "1.0.9" | "1.1.1" | "1.1.4" | "1.1.5";
  aiPolicyVersion: AIPolicyVersion;
  playerCount: PlayerCount;
  gamesLearned: number;
  actionWeights: Record<string, number>;
  orderValues: Record<string, number>;
  techniqueValues: Record<string, number>;
  traditionValues: Record<KilnId, number>;
  resourceValues: { clay: number; wood: number; coins: number };
  strategicPriors: Record<StrategyTag, number>;
  intentPriors: Record<StrategyIntent, number>;
  qualityParameters: {
    masterpiece: number;
    fine: number;
    standard: number;
    flawed: number;
    riskTolerance: number;
  };
  exploration: {
    early: number;
    developing: number;
    mature: number;
  };
  /**
   * How many firing attempts an outstanding Order requirement is assumed to get before the
   * game ends. Frozen V003 leaves this undefined, which means 1 -- every requirement must
   * land on a single simultaneous attempt, so a two-ceramic Order is charged the product of
   * two single-shot probabilities. That is why V003 completes 68% single-ceramic Orders and
   * averages 7.84 VP against a two-ceramic band worth 10.21. Set by the V1.1.5 lineage.
   */
  orderRetryHorizon?: number;
}

export interface AIDecisionLog {
  decisionId: string;
  gameId: string;
  playerId: PlayerId;
  policyVersion: AIPolicyVersion;
  round: number;
  phase: string;
  legalActionCount: number;
  chosenActionType: string;
  chosenActionScore: number;
  topAlternatives: Array<{ actionType: string; score: number }>;
  strategyTags: StrategyTag[];
  assignedIntent: StrategyIntent;
  plan: PlayerPlan;
  diagnostics: AIDecisionDiagnostics;
  factors: EvaluationFactors;
  decisionDurationMs: number;
  explored: boolean;
}

export interface FireExpectation {
  modifier: FireModifier;
  probability: number;
}
