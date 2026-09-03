export type PlayerId = string;
export type RulesVersion = "1.2.4";

/**
 * The three v1.1.4 Contribution cards. Bank (-1 Heat, 1 Wood), Tend (0, 0) and
 * Stoke (+1, 1). There is deliberately no fourth card: Fire the Kiln Hard was removed
 * from the set, so no FIRE_HARD value exists to be chosen by mistake.
 */
export type ContributionCardId = "BANK" | "TEND" | "STOKE";
export type ContributionHeatAdjustment = -2 | -1 | 0 | 1 | 2;
export type WorkerId = string;
export type CeramicId = string;
export type VesselInstanceId = string;
export type OrderId = string;
export type TechniqueId = string;
export type StartingTechniqueId = "ST01" | "ST02" | "ST03" | "ST04";

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
export type KilnId = "RU" | "GU" | "GE" | "DI" | "JU";
export type LocationId =
  | "materials_yard"
  | "forming_studio"
  | "glaze_workshop"
  | "kiln_yard"
  | "market_imperial_office"
  | "guild_academy"
  | "labour";
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
  startingTechniqueId: StartingTechniqueId | null;
  workshopSpaces: {
    pottersWheelUnlocked: 1 | 2;
    glazeDecorationUnlocked: 1 | 2;
  };
  imperialRecognition: 0 | 1 | 2 | 3 | 4 | 5;
  imperialGrantResolved: boolean;
  imperialKilnUnlocked: boolean;
  imperialPriorityAvailable: boolean;
  imperialAudienceVpAwarded: boolean;
  passedWorkPhase: boolean;
  kilnAbilityUsedThisRound: boolean;
  kilnYardShifuUsedThisRound: boolean;
  /** Distinct Shapes formed this round, used by Measuring Calipers. */
  shapesFormedThisRound: Shape[];
  presentationCeramicIds: CeramicId[];
  /** The three exhibited ceramics chosen for the two diversity bonuses. */
  presentationFeaturedCeramicIds: CeramicId[];
  score: ImmediateScoreState;
}

interface CeramicCore {
  id: CeramicId;
  vesselInstanceId: VesselInstanceId;
  ownerId: PlayerId;
  shape: Shape;
  /** Set on creation so delayed loading effects remain deterministic after reconnect. */
  formedInRound?: RoundNumber;
  /** Drying Frames vessels cannot be loaded before this round number. */
  loadableFromRound?: number;
  /** Allows the later Glaze Workshop action to change Decoration without changing Glaze. */
  dryingFramesApplied?: boolean;
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
  kilnSpaceId: KilnSpaceId | "imperial";
  kilnFurnitureUsed?: boolean;
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
export type OrderDeck = "market";

export interface OrderedDecisionQueue {
  actors: PlayerId[];
  currentIndex: number;
}

export interface FiringCeramicResult {
  ceramicId: CeramicId;
  zoneModifier: -1 | 0 | 1;
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
  ceramicResults: Record<CeramicId, FiringCeramicResult>;
}

export interface FiringResultSummary {
  round: RoundNumber;
  /** Present on states produced after the firing-recap UI update. */
  contributors?: PlayerId[];
  /** Contribution cards revealed simultaneously for this firing. */
  contributions?: Record<PlayerId, ContributionCardId>;
  /** Public Heat values after any simultaneously revealed Fuel Ledger commitments. */
  effectiveHeatAdjustments?: Record<PlayerId, ContributionHeatAdjustment>;
  baseHeat: BaseHeat;
  fireModifier: FireModifier;
  globalHeat: number;
}

export interface FinalScoreBreakdown {
  orders: number;
  imperialAudience: number;
  presentation: number;
  immediateAbilities: number;
  leftoverCoins: number;
  total: number;
}

export interface FinalResult {
  scores: Record<PlayerId, FinalScoreBreakdown>;
  winnerIds: PlayerId[];
  resolvedBy:
    | "total_vp"
    | "imperial_recognition"
    | "completed_crowns"
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
      type: "setup_starting_tech";
      decisionOrder: PlayerId[];
      currentIndex: number;
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
      type: "work_guild";
      actorId: PlayerId;
      workerId: WorkerId;
      step: "inspect" | "buy";
      /** V1.2.4 Shifu: the top Techs drawn off one discipline, private to the actor. */
      inspectedDiscipline?: TechniqueDiscipline;
      inspectedTechniqueIds?: TechniqueId[];
    }
  | {
      type: "work_commission_advance";
      actorId: PlayerId;
      workerId: WorkerId;
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
  | {
      type: "firing_before_quality";
      queue: OrderedDecisionQueue;
    }
  | {
      type: "firing_after_quality";
      queue: OrderedDecisionQueue;
      techniqueIds: TechniqueId[];
    }
  | { type: "firing_workshop_seconds"; queue: OrderedDecisionQueue }
  | {
      type: "orders";
      turnOrder: PlayerId[];
      currentIndex: number;
      activePlayerId: PlayerId;
      completedInCircuit: number;
    }
  | { type: "cleanup_orders"; queue: OrderedDecisionQueue }
  | {
      type: "presentation";
      eligiblePlayerIds: PlayerId[];
      submittedPlayerIds: PlayerId[];
    }
  | { type: "finished" };

export interface GameState {
  schemaVersion: 2;
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
  /** Separate setup-only Starting Order deck; never enters the Main Order market. */
  startingOrderDeck: OrderId[];
  /** Starting Orders returned to the box during setup or discarded from hand. */
  returnedStartingOrderIds: OrderId[];
  techniqueDecks: TechniqueDeckState;
  techniqueDisplay: TechniqueDisplayState;
  fireDeck: FireModifier[];
  fireDiscard: FireModifier[];
  firingContext: FiringContext | null;
  lastFiringResult: FiringResultSummary | null;
  finalResult: FinalResult | null;
  privateFirePeeks?: Record<PlayerId, FireModifier>;
}

export interface PlayerSetup {
  id: PlayerId;
  displayName: string;
}

export interface CreateGameInput {
  gameId: string;
  players: PlayerSetup[];
}

export interface GlazeSelection {
  ceramicId: CeramicId;
  glaze: Glaze;
  decoration: Decoration;
  newShape?: Shape;
}

export interface MaterialExchange {
  give: "clay" | "wood";
  amount: number;
}

export interface DryingFramesSelection {
  formedIndex: number;
  glaze: Glaze;
}

export interface WhiteSlipSelection {
  formedIndex: number;
  decoration: Decoration;
}

export interface KilnLoadSelection {
  ceramicId: CeramicId;
  kilnSpaceId: KilnSpaceId | "imperial";
  useKilnFurniture?: boolean;
}

export type GameAction =
  | { type: "SELECT_KILN"; kilnId: KilnId }
  | { type: "SUBMIT_STARTING_ORDERS"; orderIds: OrderId[] }
  | { type: "SELECT_STARTING_TECH"; techniqueId: StartingTechniqueId }
  | { type: "PASS_WORK_PHASE" }
  | {
      type: "GAIN_MATERIALS";
      workerId: WorkerId;
      clay: number;
      wood: number;
      exchange?: MaterialExchange;
      buyShifuBonus?: boolean;
      preparedClayShape?: Shape;
    }
  | {
      type: "FORM_CERAMICS";
      workerId: WorkerId;
      shapes: Shape[];
      useTechniqueIds?: TechniqueId[];
      dryingFrames?: DryingFramesSelection;
      whiteSlip?: WhiteSlipSelection;
      dingExtraShape?: Shape;
    }
  | {
      type: "GLAZE_CERAMICS";
      workerId: WorkerId;
      selections: GlazeSelection[];
      freeDecorationCeramicId?: CeramicId;
      useTechniqueIds?: TechniqueId[];
      glazePalette?: { ceramicId: CeramicId; glaze: Glaze };
      rapidDrying?: { ceramicId: CeramicId; kilnSpaceId: KilnSpaceId | "imperial" };
    }
  | {
      type: "USE_KILN_YARD";
      workerId: WorkerId;
      loads: KilnLoadSelection[];
      useImperialPriority?: boolean;
      kilnTendingClay?: number;
      kilnTendingWood?: number;
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
  | { type: "OFFICE_TAKE_TOP_ORDER" }
  | { type: "OFFICE_END_ORDERS" }
  | { type: "OFFICE_USE_COLOUR_SAMPLES"; deck?: OrderDeck }
  | { type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER"; orderId: OrderId }
  | { type: "OFFICE_SKIP_COLOUR_SAMPLES" }
  | { type: "COMMISSION_GAIN_ADVANCE"; resource: "clay" | "wood" | "coins" }
  | { type: "BEGIN_GUILD_ACTION"; workerId: WorkerId }
  | { type: "GUILD_INSPECT_DISCIPLINE"; discipline: TechniqueDiscipline }
  | {
      type: "GUILD_BUY_TECHNIQUE";
      techniqueId: TechniqueId;
      unlockWorkshop?: "potters_wheel" | "glaze_decoration";
    }
  | { type: "RESOLVE_KILN_YARD_REPOSITION"; ceramicId: CeramicId | null; toSpaceId: KilnSpaceId | null }
  | { type: "RESOLVE_JUN"; ceramicId: CeramicId | null; delta: -1 | 1 | null }
  | { type: "RESOLVE_GE"; ceramicId: CeramicId | null }
  | { type: "RESOLVE_PROTECTIVE_SAGGARS"; ceramicId: CeramicId | null }
  | { type: "RESOLVE_SECOND_FIRING"; ceramicId: CeramicId | null }
  | { type: "RESOLVE_TEST_PIECES"; use: boolean }
  | { type: "RESOLVE_WORKSHOP_SECONDS"; ceramicId: CeramicId | null }
  | {
      type: "COMPLETE_ORDER";
      orderId: OrderId;
      ceramicIds: CeramicId[];
      imperialGrantChoice?: "coins" | "resources";
    }
  | { type: "END_ORDER_TURN" }
  | { type: "DISCARD_ORDERS_FOR_CLEANUP"; orderIds: OrderId[] }
  | {
      type: "SUBMIT_PRESENTATION";
      ceramicIds: CeramicId[];
      /** Required when three or more ceramics are exhibited; optional for old callers. */
      featuredCeramicIds?: CeramicId[];
    };

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
  | { type: "STARTING_TECH_SELECTED"; playerId: PlayerId; techniqueId: StartingTechniqueId }
  | { type: "STARTING_ORDERS_SUBMITTED"; playerId: PlayerId }
  | { type: "STARTING_ORDERS_REVEALED"; ordersByPlayer: Record<PlayerId, OrderId[]> }
  | { type: "WORKER_PLACED"; playerId: PlayerId; workerId: WorkerId; locationId: LocationId }
  | { type: "PLAYER_PASSED"; playerId: PlayerId }
  | { type: "RESOURCES_CHANGED"; playerId: PlayerId; clay: number; wood: number; coins: number }
  | { type: "CERAMIC_SHAPED"; playerId: PlayerId; ceramicId: CeramicId; shape: Shape }
  | { type: "CERAMIC_GLAZED"; playerId: PlayerId; ceramicId: CeramicId; glaze: Glaze; decoration: Decoration }
  | { type: "CERAMIC_LOADED"; playerId: PlayerId; ceramicId: CeramicId; kilnSpaceId: KilnSpaceId | "imperial" }
  | {
      type: "ORDER_TAKEN";
      playerId: PlayerId;
      orderId: OrderId;
      deck: OrderDeck;
      acquisition: "face_up" | "colour_samples" | "blind_deck";
    }
  | {
      type: "COLOUR_SAMPLES_USED";
      playerId: PlayerId;
      deck: OrderDeck;
      /** V1.2.4 discards every looked-at Order the player did not reserve. */
      discardedOrderIds: OrderId[];
      selectedOrderId: OrderId;
      reservedFromDisplay: boolean;
    }
  | { type: "GUILD_DISCIPLINE_INSPECTED"; playerId: PlayerId; discipline: TechniqueDiscipline; count: number }
  | { type: "TECHNIQUE_ACQUIRED"; playerId: PlayerId; techniqueId: TechniqueId; cost: number }
  | { type: "TECHNIQUE_USED"; playerId: PlayerId; techniqueId: TechniqueId }
  | { type: "KILN_ABILITY_USED"; playerId: PlayerId; kilnId: KilnId }
  | { type: "IMPERIAL_PRIORITY_USED"; playerId: PlayerId }
  | { type: "JUN_ACTIVATION_PAID"; playerId: PlayerId; wood: number }
  | { type: "WORK_PHASE_ENDED" }
  | { type: "WOOD_SUBMITTED"; playerId: PlayerId; windowId: string }
  | {
      type: "WOOD_REVEALED";
      contributions: Record<PlayerId, ContributionCardId>;
      effectiveHeatAdjustments: Record<PlayerId, ContributionHeatAdjustment>;
    }
  | { type: "FIRE_REVEALED"; modifier: FireModifier; baseHeat: BaseHeat; globalHeat: number }
  | { type: "QUALITY_ASSIGNED"; ceramicId: CeramicId; quality: Quality }
  | { type: "SECOND_FIRING_RESOLVED"; playerId: PlayerId; ceramicId: CeramicId; fireModifier: FireModifier; quality: Quality }
  | { type: "WORKSHOP_SECONDS_SOLD"; playerId: PlayerId; ceramicId: CeramicId; coins: number }
  | {
      type: "FIRING_RESOLVED";
      ceramicId: CeramicId;
      fireModifier: FireModifier;
      zoneModifier: -1 | 0 | 1;
      naturalActualHeat: number;
      naturalHeatDifference: number;
      naturalQuality: Quality;
      finalActualHeat: number;
      finalHeatDifference: number;
      finalQuality: Quality;
    }
  | { type: "ORDER_COMPLETED"; playerId: PlayerId; orderId: OrderId; ceramicIds: CeramicId[] }
  | {
      type: "IMPERIAL_RECOGNITION_ADVANCED";
      playerId: PlayerId;
      orderId: OrderId;
      from: 0 | 1 | 2 | 3 | 4 | 5;
      to: 0 | 1 | 2 | 3 | 4 | 5;
      crowns: 1 | 2 | 3;
      appliedCrowns: number;
    }
  | {
      type: "IMPERIAL_GRANT_RECEIVED";
      playerId: PlayerId;
      choice: "coins" | "resources";
      clay: number;
      wood: number;
      coins: number;
    }
  | { type: "IMPERIAL_KILN_UNLOCKED"; playerId: PlayerId }
  | { type: "IMPERIAL_PRIORITY_GAINED"; playerId: PlayerId }
  | { type: "IMPERIAL_AUDIENCE_GAINED"; playerId: PlayerId; vp: 6 }
  | { type: "ORDERS_DISCARDED_FOR_CLEANUP"; playerId: PlayerId; orderIds: OrderId[] }
  | {
      type: "ORDER_DISPLAYS_ROTATED";
      round: 2 | 3 | 4 | 5;
      marketOrderIds: OrderId[];
    }
  | { type: "ROUND_STARTED"; round: RoundNumber; firstPlayerId: PlayerId }
  | {
      type: "PRESENTATION_SUBMITTED";
      playerId: PlayerId;
      ceramicIds: CeramicId[];
      featuredCeramicIds: CeramicId[];
    }
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
  fuelLedgerCommittedBy: PlayerId[];
}

export type SubmitContributionResult =
  | {
      ok: true;
      state: GameState;
      privateState: PrivateFiringState;
      events: GameEvent[];
    }
  | { ok: false; error: GameRuleError };
