export type PlayerId = string;
export type RulesVersion = "1.0.4" | "1.0.9" | "1.1.1" | "1.1.4" | "1.1.5" | "1.1.6";

/**
 * The three v1.1.4 Contribution cards. Bank (-1 Heat, 1 Wood), Tend (0, 0) and
 * Stoke (+1, 1). There is deliberately no fourth card: Fire the Kiln Hard was removed
 * from the set, so no FIRE_HARD value exists to be chosen by mistake.
 */
export type ContributionCardId = "BANK" | "TEND" | "STOKE";
export type WorkerId = string;
export type CeramicId = string;
export type VesselInstanceId = string;
export type OrderId = string;
export type TechniqueId = string;

export type PlayerCount = 2 | 3 | 4;
export type RoundNumber = 1 | 2 | 3 | 4 | 5;
export type WorkerKind = "shifu" | "apprentice";
export type WorkerStatus = "locked" | "available" | "placed";
export type Shape = "bowl" | "plate" | "washer" | "vase" | "censer";
export type Glaze = "white" | "celadon" | "grey_green" | "moon_white";
export type Decoration = "plain" | "carved" | "impressed" | "crackle";
export type Quality = "flawed" | "standard" | "fine" | "masterpiece";
export type FireModifier = -2 | -1 | 0 | 1 | 2;
export type TechniqueDiscipline = "forming" | "glazing" | "firing";
/**
 * Legacy numeric contribution, retained only so serialized pre-v1.1.4 matches still
 * decode. v1.1.4 play uses ContributionCardId; nothing in the live rules produces this.
 */
export type WoodContribution = 0 | 1 | 2 | 3;
export type KilnId = "RU" | "GU" | "GE" | "DI" | "JU";
export type LocationId =
  | "materials_yard"
  | "forming_studio"
  | "glaze_workshop"
  | "kiln_yard"
  | "market_imperial_office"
  | "guild_academy"
  | "labour"
  | "court_patronage";
/** V1.1.1: Base Heat is a clamped formula result, not a three-band table. */
export type BaseHeat = 0 | 1 | 2 | 3 | 4 | 5;

export type KilnSpaceId =
  | "high_1"
  | "middle_1"
  | "middle_2"
  | "middle_3"
  | "middle_4"
  | "middle_5"
  | "low_1"
  | "high_2"
  | "high_3"
  | "low_2"
  | "low_3";

export interface ResourceState {
  clay: number;
  wood: number;
  coins: number;
}

export interface WorkerState {
  id: WorkerId;
  kind: WorkerKind;
  status: WorkerStatus;
  locationId: LocationId | null;
}

export interface OwnedTechniqueState {
  id: TechniqueId;
  exhausted: boolean;
}

export interface CompletedOrderState {
  orderId: OrderId;
  ceramicIds: CeramicId[];
  completedInRound: RoundNumber;
  vpAwarded: number;
  coinsAwarded: number;
  usedGuanWaiver: boolean;
}

export interface ImmediateScoreState {
  orderVp: number;
  kilnTraditionVp: number;
}

export interface PlayerState {
  id: PlayerId;
  seatIndex: number;
  displayName: string;
  kilnId: KilnId | null;
  resources: ResourceState;
  workers: Record<WorkerId, WorkerState>;
  orderHand: OrderId[];
  completedOrders: CompletedOrderState[];
  techniques: OwnedTechniqueState[];
  imperialProgress: 0 | 1 | 2 | 3 | 4 | 5;
  imperialStipendsReceived: Array<2 | 4>;
  passedWorkPhase: boolean;
  pendingApprenticeUnlocks: number;
  kilnAbilityUsedThisRound: boolean;
  presentationCeramicIds: CeramicId[];
  score: ImmediateScoreState;
}

interface CeramicCore {
  id: CeramicId;
  vesselInstanceId: VesselInstanceId;
  ownerId: PlayerId;
  shape: Shape;
}

export type ShapedCeramic = CeramicCore & {
  stage: "shaped";
};

export type GlazedCeramic = CeramicCore & {
  stage: "glazed";
  glaze: Glaze;
  decoration: Decoration;
};

export type LoadedCeramic = CeramicCore & {
  stage: "loaded";
  glaze: Glaze;
  decoration: Decoration;
  kilnSpaceId: KilnSpaceId;
};

export type FinishedCeramic = CeramicCore & {
  stage: "finished";
  glaze: Glaze;
  decoration: Decoration;
  quality: Quality;
  firedInRound: RoundNumber;
};

export type SoldCeramic = CeramicCore & {
  stage: "sold";
  soldInRound: RoundNumber;
};

export type DeliveredCeramic = CeramicCore & {
  stage: "delivered";
  glaze: Glaze;
  decoration: Decoration;
  quality: Quality;
  orderId: OrderId;
};

export type PresentedCeramic = CeramicCore & {
  stage: "presented";
  glaze: Glaze;
  decoration: Decoration;
  quality: Exclude<Quality, "flawed">;
};

export type CeramicState =
  | ShapedCeramic
  | GlazedCeramic
  | LoadedCeramic
  | FinishedCeramic
  | SoldCeramic
  | DeliveredCeramic
  | PresentedCeramic;

export interface ActionBoardState {
  placements: Record<LocationId, WorkerId[]>;
}

export interface TechniqueDeckState {
  forming: TechniqueId[];
  glazing: TechniqueId[];
  firing: TechniqueId[];
}

export interface TechniqueDisplayState {
  forming: TechniqueId[];
  glazing: TechniqueId[];
  firing: TechniqueId[];
}

/**
 * v1.1.5 moved Coin income to the Labour location and removed it from the Office, so the
 * old `take_one_and_gain_two_coins` mode is gone. It survived the v1.1.5 migration by
 * oversight and stayed playable, which meant Labour never actually replaced anything.
 */
export type OfficeOrderMode =
  | "take_one"
  | "take_up_to_two";
export type OrderDeck = "market" | "imperial";

export interface OrderedDecisionQueue {
  actors: PlayerId[];
  currentIndex: number;
}

export interface FiringCeramicResult {
  ceramicId: CeramicId;
  zoneModifier: -1 | 0 | 1;
  ignoredFireModifier: boolean;
  naturalActualHeat: number;
  naturalHeatDifference: number;
  naturalExactMatch: boolean;
  finalActualHeat: number;
  finalHeatDifference: number;
  forcedQuality: Quality | null;
  assignedQuality: Quality | null;
}

export interface FiringContext {
  round: RoundNumber;
  contributors: PlayerId[];
  /** The Contribution card each contributor revealed. */
  contributions: Record<PlayerId, ContributionCardId>;
  /**
   * Contributors whose Stoke was upgraded to +2 Heat by Fuel Ledger this firing. The
   * upgrade is resolved after the reveal and before Base Heat, so it cannot be read off
   * the revealed card alone.
   */
  fuelLedgerUpgradedBy: PlayerId[];
  baseHeat: BaseHeat | null;
  fireModifier: FireModifier | null;
  globalHeat: number | null;
  /**
   * V1.1.1 Sagger Selection moves the Fire modifier one step toward 0 for the chosen
   * ceramic rather than zeroing it, so the adjustment is per-ceramic, not a flag.
   */
  saggerAdjustedCeramicIds: CeramicId[];
  ceramicResults: Record<CeramicId, FiringCeramicResult>;
}

export interface FiringResultSummary {
  round: RoundNumber;
  /** Present on states produced after the firing-recap UI update. */
  contributors?: PlayerId[];
  /** Revealed effective contributions, including any Fuel Ledger adjustment. */
  contributions?: Record<PlayerId, ContributionCardId>;
  baseHeat: BaseHeat;
  fireModifier: FireModifier;
  globalHeat: number;
}

export interface FinalScoreBreakdown {
  orders: number;
  imperialProgress: number;
  imperialSeal: number;
  presentation: number;
  immediateAbilities: number;
  techniques?: number;
  leftoverCoins: number;
  total: number;
}

export interface FinalResult {
  scores: Record<PlayerId, FinalScoreBreakdown>;
  winnerIds: PlayerId[];
  resolvedBy:
    | "total_vp"
    | "imperial_progress"
    | "completed_imperial_orders"
    | "masterpieces_delivered_or_presented"
    | "shared_victory";
}

export type GamePhase =
  | {
      type: "setup_kiln_selection";
      selectionOrder: PlayerId[];
      currentIndex: number;
    }
  | {
      type: "setup_starting_orders";
      decisionOrder: PlayerId[];
      currentIndex: number;
      offeredOrderIds: Record<PlayerId, OrderId[]>;
      /** Historical save compatibility only. */
      initialOrderIds: Record<PlayerId, OrderId>;
      submittedPlayerIds: PlayerId[];
    }
  | {
      type: "work";
      activePlayerId: PlayerId;
    }
  | {
      type: "work_office_orders";
      actorId: PlayerId;
      workerId: WorkerId;
      mode: OfficeOrderMode;
      remainingTakes: 0 | 1 | 2;
      ordersTaken: number;
      step: "colour_samples_or_skip" | "colour_samples_choose" | "take_or_end";
      colourSamplesUsed: boolean;
      colourSamplesDeck?: OrderDeck;
      colourSamplesChoices?: OrderId[];
    }
  | {
      type: "work_office_sale";
      actorId: PlayerId;
      workerId: WorkerId;
    }
  | {
      type: "work_office_connoisseur";
      actorId: PlayerId;
      workerId: WorkerId;
    }
  | {
      type: "work_guild";
      actorId: PlayerId;
      workerId: WorkerId;
      step: "refresh_or_skip" | "buy";
    }
  | {
      type: "firing_before_contribution";
      queue: OrderedDecisionQueue;
      techniqueIds: TechniqueId[];
    }
  | {
      type: "firing_contributions";
      windowId: string;
      eligiblePlayerIds: PlayerId[];
      submittedPlayerIds: PlayerId[];
    }
  | { type: "firing_reposition"; queue: OrderedDecisionQueue }
  | { type: "firing_after_reveal"; queue: OrderedDecisionQueue }
  | {
      type: "firing_after_fire_reveal";
      queue: OrderedDecisionQueue;
    }
  | {
      type: "firing_before_quality";
      queue: OrderedDecisionQueue;
    }
  | {
      type: "firing_after_quality";
      queue: OrderedDecisionQueue;
      techniqueIds: TechniqueId[];
    }
  | {
      type: "firing_after_firing";
      queue: OrderedDecisionQueue;
      techniqueIds: TechniqueId[];
    }
  | {
      type: "orders";
      turnOrder: PlayerId[];
      currentIndex: number;
      activePlayerId: PlayerId;
    }
  | { type: "cleanup_orders"; queue: OrderedDecisionQueue }
  | {
      type: "presentation";
      eligiblePlayerIds: PlayerId[];
      submittedPlayerIds: PlayerId[];
    }
  | { type: "finished" };

export interface GameState {
  schemaVersion: 1;
  rulesVersion: RulesVersion;
  gameId: string;
  revision: number;
  eventSequence: number;
  nextCeramicSequence: number;
  playerCount: PlayerCount;
  round: RoundNumber;
  playerOrder: PlayerId[];
  firstPlayerId: PlayerId;
  phase: GamePhase;
  players: Record<PlayerId, PlayerState>;
  actionBoard: ActionBoardState;
  ceramics: Record<CeramicId, CeramicState>;
  commonSupply: ResourceState;
  vesselSupply: Record<Shape, VesselInstanceId[]>;
  marketDeck: OrderId[];
  marketDiscard: OrderId[];
  marketDisplay: OrderId[];
  imperialDeck: OrderId[];
  imperialDiscard: OrderId[];
  imperialDisplay: OrderId[];
  techniqueDecks: TechniqueDeckState;
  techniqueDisplay: TechniqueDisplayState;
  fireDeck: FireModifier[];
  fireDiscard: FireModifier[];
  imperialSealOwnerId: PlayerId | null;
  firingContext: FiringContext | null;
  lastFiringResult: FiringResultSummary | null;
  finalResult: FinalResult | null;
  privateFirePeeks?: Record<PlayerId, FireModifier>;
  experimentConfig?: GameExperimentConfig;
}

export type JunAbExperimentArm = "control" | "jun_cost_1";

export interface JunAbExperimentConfig {
  readonly experimentId: "jun-ab-001";
  readonly experimentArm: JunAbExperimentArm;
  readonly junActivationCoinCost: 0 | 1;
}

export type ImperialTrackExperimentArm =
  | "all_imperial_orders_progress_2"
  | "earlier_apprentices_track_002248_seal_2";

export interface ImperialTrackExperimentConfig {
  readonly experimentId: "imperial-track-ab-001";
  readonly experimentArm: ImperialTrackExperimentArm;
  readonly imperialOrderProgressMode: "all_two" | "printed";
  readonly imperialProgressTrackVp: readonly [number, number, number, number, number, number];
  readonly apprenticeMilestoneSpaces: readonly [number, number];
  readonly presentationSpaces: readonly [number, number];
  readonly imperialSealEnabled: true;
  readonly imperialSealVp: 2 | 3;
}









/**
 * Whether Ding's extra vessel pays its normal Clay cost. Shipped rules charge for it; the
 * `free` arm restores the pre-v1.1.5 behaviour so the two can be compared on one seed set
 * instead of across separate runs, where other changes confound the comparison.
 */
export type DingCostExperimentArm = "paid" | "free";

export interface DingCostExperimentConfig {
  readonly experimentId: "ding-cost-ab-001";
  readonly experimentArm: DingCostExperimentArm;
}

/**
 * Ru's trigger and award. Its ability needs three simultaneous conditions where every other
 * Tradition needs one, and the Masterpiece requirement is the binding one: a ceramic aimed
 * exactly at its Preferred Heat is Masterpiece 33.3% of the time and Fine-or-better 83.3%.
 */
export type RuTriggerExperimentArm = "control" | "fine_2" | "fine_3" | "master_6";

export interface RuTriggerExperimentConfig {
  readonly experimentId: "ru-trigger-ab-001";
  readonly experimentArm: RuTriggerExperimentArm;
  readonly ruMinQuality: "fine" | "masterpiece";
  readonly ruOrderVp: number;
}

/**
 * Jun's activation price. Jun leads the Tradition table at 36.2% pooled, and 68.8% of its
 * activations buy Fine -> Masterpiece, which unlocks the 8 Orders that require one (mean
 * 10.4 VP against 8.3 for the rest). This arm tests the cost lever in isolation.
 */
export type JunWoodExperimentArm = "control" | "wood_3" | "wood2_coin1";

export interface JunWoodExperimentConfig {
  readonly experimentId: "jun-wood-ab-001";
  readonly experimentArm: JunWoodExperimentArm;
  readonly junActivationWood: number;
  /** Coins charged alongside the Wood. Zero under the shipped rules. */
  readonly junActivationCoins?: number;
}

/**
 * Grants one player an extra available Apprentice at the start of Round 5, to measure what a
 * marginal Round-5 worker is actually worth. That number sets the correct award for the
 * Round-5 unlock: an Apprentice unlocked in Cleanup of Round 5 can never act, so it pays VP
 * instead, and if that award exceeds what a working Round-5 Apprentice earns, players are
 * paid to delay Imperial Progress.
 */
export type R5WorkerExperimentArm = "control" | "extra_worker";

export interface R5WorkerExperimentConfig {
  readonly experimentId: "r5-worker-ab-001";
  readonly experimentArm: R5WorkerExperimentArm;
  readonly beneficiaryPlayerId: string;
}

/**
 * End-game Exhibition values and capacity. The Exhibition is 5.8% of all VP scored today,
 * and the traditions taking most from it are Ge and Ding rather than the Masterpiece kilns,
 * so a general buff moves the table in a direction worth measuring before shipping.
 */
export type ExhibitionExperimentArm = "control" | "proposed";

export interface ExhibitionExperimentConfig {
  readonly experimentId: "exhibition-ab-001";
  readonly experimentArm: ExhibitionExperimentArm;
  readonly capacityByProgress: readonly [number, number, number, number, number, number];
  readonly qualityVp: { readonly standard: number; readonly fine: number; readonly masterpiece: number };
}

export type GameExperimentConfig =
  | JunAbExperimentConfig
  | ImperialTrackExperimentConfig
  | DingCostExperimentConfig
  | RuTriggerExperimentConfig
  | JunWoodExperimentConfig
  | R5WorkerExperimentConfig
  | ExhibitionExperimentConfig;

export interface PlayerSetup {
  id: PlayerId;
  displayName: string;
}

export interface CreateGameInput {
  gameId: string;
  players: PlayerSetup[];
  experimentConfig?: GameExperimentConfig;
}

export interface GlazeSelection {
  ceramicId: CeramicId;
  glaze: Glaze;
  decoration: Decoration;
}

export interface MaterialExchange {
  give: "clay" | "wood";
  amount: number;
}

export interface DryingFramesSelection {
  formedIndex: number;
  glaze: Glaze;
}

export interface KilnLoadSelection {
  ceramicId: CeramicId;
  kilnSpaceId: KilnSpaceId;
}

export type GameAction =
  | { type: "SELECT_KILN"; kilnId: KilnId }
  | { type: "SUBMIT_STARTING_ORDERS"; orderIds: OrderId[] }
  | { type: "KEEP_STARTING_ORDER" }
  | { type: "REDRAW_STARTING_ORDER" }
  | { type: "PASS_WORK_PHASE" }
  | {
      type: "GAIN_MATERIALS";
      workerId: WorkerId;
      clay: number;
      wood: number;
      exchange?: MaterialExchange;
    }
  | {
      type: "FORM_CERAMICS";
      workerId: WorkerId;
      shapes: Shape[];
      useTechniqueIds?: TechniqueId[];
      claySubstitutions?: number;
      /** Historical caller compatibility; translated to one substitution. */
      claySubstitutionTarget?: "base" | "ding";
      dryingFrames?: DryingFramesSelection;
      dingExtraShape?: Shape;
    }
  | {
      type: "GLAZE_CERAMICS";
      workerId: WorkerId;
      selections: GlazeSelection[];
      freeDecorationCeramicId?: CeramicId;
      /** Historical caller compatibility; V1.0.9 always uses the merged Shifu action. */
      shifuMode?: "normal" | "free_single";
      useTechniqueIds?: TechniqueId[];
    }
  | {
      type: "USE_KILN_YARD";
      workerId: WorkerId;
      loads: KilnLoadSelection[];
    }
  /**
   * Labour has no worker limit, so it is always available. It exists because the pipeline
   * is four actions deep and the last round otherwise strands workers with nothing worth
   * doing: measured across 60 three-player games, 68% of seats passed early in Round 5
   * against 0% in Round 1.
   */
  | { type: "USE_LABOUR"; workerId: WorkerId }
  | {
      type: "BEGIN_OFFICE_ORDERS";
      workerId: WorkerId;
      mode: OfficeOrderMode;
    }
  | {
      type: "OFFICE_TAKE_ORDER";
      orderId: OrderId;
    }
  | { type: "OFFICE_DRAW_BLIND_ORDER"; deck: OrderDeck }
  | { type: "OFFICE_END_ORDERS" }
  | { type: "OFFICE_USE_COLOUR_SAMPLES"; deck?: OrderDeck; orderId?: OrderId }
  | { type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER"; orderId: OrderId }
  | { type: "OFFICE_SKIP_COLOUR_SAMPLES" }
  | { type: "OFFICE_RESOLVE_FLAWED_SALE"; ceramicIds: CeramicId[] }
  | { type: "OFFICE_RESOLVE_CONNOISSEUR_NETWORK"; ceramicId: CeramicId | null }
  | { type: "USE_COURT_PATRONAGE"; workerId: WorkerId }
  | { type: "BEGIN_GUILD_ACTION"; workerId: WorkerId }
  | { type: "GUILD_REFRESH_TECHNIQUE"; techniqueId: TechniqueId }
  | { type: "GUILD_SKIP_REFRESH" }
  | { type: "GUILD_BUY_TECHNIQUE"; techniqueId: TechniqueId }
  | {
      type: "RESOLVE_KILN_SETTING";
      ceramicId: CeramicId | null;
      toSpaceId: KilnSpaceId | null;
    }
  | { type: "RESOLVE_KILN_YARD_REPOSITION"; ceramicId: CeramicId | null; toSpaceId: KilnSpaceId | null }
  | { type: "RESOLVE_FUEL_LEDGER"; use: boolean }
  | { type: "RESOLVE_SAGGER_SELECTION"; ceramicId: CeramicId | null }
  | { type: "RESOLVE_JUN"; ceramicId: CeramicId | null; delta: -1 | 1 | null }
  | { type: "RESOLVE_GE"; ceramicId: CeramicId | null }
  | { type: "RESOLVE_PROTECTIVE_SAGGARS"; ceramicId: CeramicId | null }
  | { type: "RESOLVE_SECOND_FIRING"; ceramicId: CeramicId | null }
  | { type: "RESOLVE_TEST_PIECES"; use: boolean }
  /**
   * Clay Substitution used inside the Firing Phase. The rulebook allows it on the owner's
   * turn or before Contribution cards are chosen; the Work Phase route is handled by the
   * Forming action's technique list, and this is the firing-window route.
   */
  | { type: "RESOLVE_FIRING_CLAY_SUBSTITUTION"; clay: number; wood: number; use: boolean }
  | { type: "RESOLVE_KILN_RECORDS"; use: boolean }
  | {
      type: "COMPLETE_ORDER";
      orderId: OrderId;
      ceramicIds: CeramicId[];
      useGuanWaiver: boolean;
    }
  | { type: "END_ORDER_TURN" }
  | { type: "DISCARD_ORDERS_FOR_CLEANUP"; orderIds: OrderId[] }
  | { type: "SUBMIT_PRESENTATION"; ceramicIds: CeramicId[] };

export type GameRuleErrorCode =
  | "INVALID_SETUP"
  | "UNKNOWN_PLAYER"
  | "WRONG_PHASE"
  | "NOT_ACTIVE_PLAYER"
  | "INVALID_ACTION"
  | "KILN_UNAVAILABLE"
  | "STARTING_ORDER_NOT_REDRAWABLE"
  | "WORKER_UNAVAILABLE"
  | "LOCATION_FULL"
  | "PLAYER_ALREADY_PASSED"
  | "INVALID_SELECTION"
  | "INSUFFICIENT_RESOURCES"
  | "SUPPLY_EMPTY"
  | "CERAMIC_NOT_FOUND"
  | "ILLEGAL_CERAMIC_STAGE"
  | "KILN_SPACE_OCCUPIED"
  | "ORDER_NOT_AVAILABLE"
  | "ORDER_HAND_LIMIT"
  | "TECHNIQUE_NOT_AVAILABLE"
  | "TECHNIQUE_LIMIT"
  | "TECHNIQUE_NOT_OWNED"
  | "TECHNIQUE_EXHAUSTED"
  | "ABILITY_ALREADY_USED"
  | "NOT_CONTRIBUTOR"
  | "CONTRIBUTION_ALREADY_SUBMITTED"
  | "INVALID_CONTRIBUTION"
  | "PRIVATE_WINDOW_MISMATCH"
  | "ORDER_REQUIREMENTS_NOT_MET"
  | "PRESENTATION_NOT_ELIGIBLE";

export interface GameRuleError {
  code: GameRuleErrorCode;
  message: string;
  details: Record<string, string | number | boolean>;
}

export type GameEvent =
  | { type: "KILN_SELECTED"; playerId: PlayerId; kilnId: KilnId }
  | { type: "STARTING_ORDERS_SUBMITTED"; playerId: PlayerId }
  | { type: "STARTING_ORDERS_REVEALED"; ordersByPlayer: Record<PlayerId, OrderId[]> }
  | { type: "STARTING_ORDER_KEPT"; playerId: PlayerId; orderId: OrderId }
  | { type: "STARTING_ORDER_REDRAWN"; playerId: PlayerId; discardedOrderId: OrderId; drawnOrderId: OrderId }
  | { type: "WORKER_PLACED"; playerId: PlayerId; workerId: WorkerId; locationId: LocationId }
  | { type: "PLAYER_PASSED"; playerId: PlayerId }
  | { type: "RESOURCES_CHANGED"; playerId: PlayerId; clay: number; wood: number; coins: number }
  | { type: "CERAMIC_SHAPED"; playerId: PlayerId; ceramicId: CeramicId; shape: Shape }
  | { type: "CERAMIC_GLAZED"; playerId: PlayerId; ceramicId: CeramicId; glaze: Glaze; decoration: Decoration }
  | { type: "CERAMIC_LOADED"; playerId: PlayerId; ceramicId: CeramicId; kilnSpaceId: KilnSpaceId }
  | { type: "CERAMIC_SOLD"; playerId: PlayerId; ceramicId: CeramicId }
  | { type: "CERAMIC_RETURNED_TO_GLAZED"; playerId: PlayerId; ceramicId: CeramicId }
  | {
      type: "ORDER_TAKEN";
      playerId: PlayerId;
      orderId: OrderId;
      deck: OrderDeck;
      acquisition: "face_up" | "blind_top";
    }
  | {
      type: "COLOUR_SAMPLES_USED";
      playerId: PlayerId;
      deck: OrderDeck;
      bottomedOrderId: OrderId;
      selectedOrderId?: OrderId;
      revealedOrderId?: OrderId | null;
    }
  | { type: "TECHNIQUE_REFRESHED"; playerId: PlayerId; techniqueId: TechniqueId }
  | { type: "TECHNIQUE_ACQUIRED"; playerId: PlayerId; techniqueId: TechniqueId; cost: number }
  | { type: "TECHNIQUE_USED"; playerId: PlayerId; techniqueId: TechniqueId }
  | { type: "KILN_ABILITY_USED"; playerId: PlayerId; kilnId: KilnId }
  | { type: "JUN_ACTIVATION_PAID"; playerId: PlayerId; wood: number }
  | { type: "WORK_PHASE_ENDED" }
  | { type: "WOOD_SUBMITTED"; playerId: PlayerId; windowId: string }
  | { type: "WOOD_REVEALED"; contributions: Record<PlayerId, ContributionCardId> }
  | { type: "FIRE_REVEALED"; modifier: FireModifier; baseHeat: BaseHeat; globalHeat: number }
  | { type: "QUALITY_ASSIGNED"; ceramicId: CeramicId; quality: Quality }
  | {
      type: "FIRING_RESOLVED";
      ceramicId: CeramicId;
      fireModifier: FireModifier;
      zoneModifier: -1 | 0 | 1;
      ignoredFireModifier: boolean;
      naturalActualHeat: number;
      naturalHeatDifference: number;
      naturalQuality: Quality;
      finalActualHeat: number;
      finalHeatDifference: number;
      finalQuality: Quality;
    }
  | { type: "ORDER_COMPLETED"; playerId: PlayerId; orderId: OrderId; ceramicIds: CeramicId[] }
  | {
      type: "IMPERIAL_PROGRESS_ADVANCED";
      playerId: PlayerId;
      source?: "imperial_order" | "court_patronage";
      orderId?: OrderId | null;
      requirementCeramicCount?: number | null;
      requirementCategory?:
        | "single_fine"
        | "single_masterpiece"
        | "multi_2"
        | "multi_3"
        | "court_patronage"
        | null;
      from: number;
      to: number;
      reward: 1 | 2 | 3;
      appliedGain?: number;
      crossedSpaces?: number[];
      capLoss?: number;
      apprenticeMilestonesTriggered?: number[];
      presentationMilestonesTriggered?: number[];
      stipendMilestonesTriggered?: number[];
      sealMilestoneTriggered?: boolean;
      trackVpBefore?: number;
      trackVpAfter?: number;
      sealVp?: number;
    }
  | {
      type: "COURT_PATRONAGE_USED";
      playerId: PlayerId;
      cost: number;
      from: 0 | 1 | 2 | 3;
      to: 1 | 2 | 3 | 4;
    }
  | { type: "IMPERIAL_SEAL_CLAIMED"; playerId: PlayerId; sealVp?: number }
  | { type: "APPRENTICE_UNLOCKED"; playerId: PlayerId; workerId: WorkerId }
  | { type: "ROUND_FIVE_UNLOCK_VP_REWARD"; playerId: PlayerId; vp: number }
  | { type: "ORDERS_DISCARDED_FOR_CLEANUP"; playerId: PlayerId; orderIds: OrderId[] }
  | { type: "IMPERIAL_STIPEND_RECEIVED"; playerId: PlayerId; space: 2 | 4; coins: number }
  | {
      type: "ORDER_DISPLAYS_ROTATED";
      round: 2 | 3 | 4 | 5;
      marketOrderIds: OrderId[];
      imperialOrderIds: OrderId[];
    }
  | { type: "ROUND_STARTED"; round: RoundNumber; firstPlayerId: PlayerId }
  | { type: "PRESENTATION_SUBMITTED"; playerId: PlayerId; ceramicIds: CeramicId[] }
  | { type: "FINAL_SCORE_CALCULATED"; result: FinalResult };

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: GameRuleError };

export type CreateGameResult =
  | { ok: true; state: GameState }
  | { ok: false; error: GameRuleError };

export interface PrivateFiringState {
  gameId: string;
  windowId: string | null;
  contributions: Record<PlayerId, ContributionCardId>;
}

export type SubmitContributionResult =
  | {
      ok: true;
      state: GameState;
      privateState: PrivateFiringState;
      events: GameEvent[];
    }
  | { ok: false; error: GameRuleError };
