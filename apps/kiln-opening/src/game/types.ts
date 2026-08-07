export type PlayerId = string;
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
export type FireModifier = -1 | 0 | 1;
export type TechniqueDiscipline = "forming" | "glazing" | "firing";
export type WoodContribution = 0 | 1 | 2 | 3;
export type KilnId = "RU" | "GU" | "GE" | "DI" | "JU";
export type LocationId =
  | "materials_yard"
  | "forming_studio"
  | "glaze_workshop"
  | "kiln_yard"
  | "market_imperial_office"
  | "guild_academy";
export type KilnSpaceId =
  | "high_1"
  | "high_2"
  | "middle_1"
  | "middle_2"
  | "middle_3"
  | "low_1"
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
  passedWorkPhase: boolean;
  progressAdvancedThisRound: boolean;
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

export type OfficeOrderMode =
  | "take_one"
  | "take_up_to_two"
  | "take_one_and_gain_two_coins";

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
  contributions: Record<PlayerId, number>;
  baseHeat: 1 | 2 | 3 | null;
  fireModifier: FireModifier | null;
  globalHeat: number | null;
  ceramicResults: Record<CeramicId, FiringCeramicResult>;
}

export interface FinalScoreBreakdown {
  orders: number;
  imperialProgress: number;
  imperialSeal: number;
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
      initialOrderIds: Record<PlayerId, OrderId>;
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
      step: "take_or_end" | "colour_samples";
      lastTakenDeck: "market" | "imperial" | null;
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
    }
  | {
      type: "firing_contributions";
      windowId: string;
      eligiblePlayerIds: PlayerId[];
      submittedPlayerIds: PlayerId[];
    }
  | {
      type: "firing_after_reveal";
      queue: OrderedDecisionQueue;
    }
  | {
      type: "firing_before_quality";
      queue: OrderedDecisionQueue;
    }
  | {
      type: "firing_after_quality";
      queue: OrderedDecisionQueue;
    }
  | {
      type: "firing_after_firing";
      queue: OrderedDecisionQueue;
    }
  | {
      type: "orders";
      turnOrder: PlayerId[];
      currentIndex: number;
      activePlayerId: PlayerId;
    }
  | {
      type: "presentation";
      eligiblePlayerIds: PlayerId[];
      submittedPlayerIds: PlayerId[];
    }
  | { type: "finished" };

export interface GameState {
  schemaVersion: 1;
  rulesVersion: "0.4";
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
  finalResult: FinalResult | null;
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
}

export interface KilnLoadSelection {
  ceramicId: CeramicId;
  kilnSpaceId: KilnSpaceId;
}

export type GameAction =
  | { type: "SELECT_KILN"; kilnId: KilnId }
  | { type: "KEEP_STARTING_ORDER" }
  | { type: "REDRAW_STARTING_ORDER" }
  | { type: "PASS_WORK_PHASE" }
  | {
      type: "GAIN_MATERIALS";
      workerId: WorkerId;
      clay: number;
      wood: number;
    }
  | {
      type: "FORM_CERAMICS";
      workerId: WorkerId;
      shapes: Shape[];
      useTechniqueIds?: TechniqueId[];
      claySubstitutionTarget?: "base" | "ding";
      dingExtraShape?: Shape;
    }
  | {
      type: "GLAZE_CERAMICS";
      workerId: WorkerId;
      selections: GlazeSelection[];
      shifuMode: "normal" | "free_single";
      useTechniqueIds?: TechniqueId[];
    }
  | {
      type: "USE_KILN_YARD";
      workerId: WorkerId;
      gainWood: boolean;
      loads: KilnLoadSelection[];
    }
  | { type: "OFFICE_GAIN_COINS"; workerId: WorkerId }
  | {
      type: "OFFICE_SELL_FLAWED";
      workerId: WorkerId;
      ceramicIds: CeramicId[];
    }
  | {
      type: "BEGIN_OFFICE_ORDERS";
      workerId: WorkerId;
      mode: OfficeOrderMode;
    }
  | {
      type: "OFFICE_TAKE_ORDER";
      orderId: OrderId;
    }
  | { type: "OFFICE_END_ORDERS" }
  | { type: "OFFICE_USE_COLOUR_SAMPLES"; orderId: OrderId }
  | { type: "OFFICE_SKIP_COLOUR_SAMPLES" }
  | { type: "BEGIN_GUILD_ACTION"; workerId: WorkerId }
  | { type: "GUILD_REFRESH_TECHNIQUE"; techniqueId: TechniqueId }
  | { type: "GUILD_SKIP_REFRESH" }
  | { type: "GUILD_BUY_TECHNIQUE"; techniqueId: TechniqueId }
  | {
      type: "RESOLVE_KILN_SETTING";
      ceramicId: CeramicId | null;
      toSpaceId: KilnSpaceId | null;
    }
  | { type: "RESOLVE_FUEL_LEDGER"; use: boolean }
  | { type: "RESOLVE_JUN"; ceramicId: CeramicId | null; delta: -1 | 1 | null }
  | { type: "RESOLVE_GE"; ceramicId: CeramicId | null }
  | { type: "RESOLVE_PROTECTIVE_SAGGARS"; ceramicId: CeramicId | null }
  | { type: "RESOLVE_TEST_PIECES"; use: boolean }
  | {
      type: "COMPLETE_ORDER";
      orderId: OrderId;
      ceramicIds: CeramicId[];
      useGuanWaiver: boolean;
    }
  | { type: "END_ORDER_TURN" }
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
  | { type: "STARTING_ORDER_KEPT"; playerId: PlayerId; orderId: OrderId }
  | {
      type: "STARTING_ORDER_REDRAWN";
      playerId: PlayerId;
      discardedOrderId: OrderId;
      drawnOrderId: OrderId;
    }
  | { type: "WORKER_PLACED"; playerId: PlayerId; workerId: WorkerId; locationId: LocationId }
  | { type: "PLAYER_PASSED"; playerId: PlayerId }
  | { type: "RESOURCES_CHANGED"; playerId: PlayerId; clay: number; wood: number; coins: number }
  | { type: "CERAMIC_SHAPED"; playerId: PlayerId; ceramicId: CeramicId; shape: Shape }
  | { type: "CERAMIC_GLAZED"; playerId: PlayerId; ceramicId: CeramicId; glaze: Glaze; decoration: Decoration }
  | { type: "CERAMIC_LOADED"; playerId: PlayerId; ceramicId: CeramicId; kilnSpaceId: KilnSpaceId }
  | { type: "CERAMIC_SOLD"; playerId: PlayerId; ceramicId: CeramicId }
  | { type: "ORDER_TAKEN"; playerId: PlayerId; orderId: OrderId; deck: "market" | "imperial" }
  | { type: "TECHNIQUE_REFRESHED"; playerId: PlayerId; techniqueId: TechniqueId }
  | { type: "TECHNIQUE_ACQUIRED"; playerId: PlayerId; techniqueId: TechniqueId; cost: number }
  | { type: "TECHNIQUE_USED"; playerId: PlayerId; techniqueId: TechniqueId }
  | { type: "KILN_ABILITY_USED"; playerId: PlayerId; kilnId: KilnId }
  | { type: "WORK_PHASE_ENDED" }
  | { type: "WOOD_SUBMITTED"; playerId: PlayerId; windowId: string }
  | { type: "WOOD_REVEALED"; contributions: Record<PlayerId, number> }
  | { type: "FIRE_REVEALED"; modifier: FireModifier; baseHeat: 1 | 2 | 3; globalHeat: number }
  | { type: "QUALITY_ASSIGNED"; ceramicId: CeramicId; quality: Quality }
  | { type: "ORDER_COMPLETED"; playerId: PlayerId; orderId: OrderId; ceramicIds: CeramicId[] }
  | { type: "IMPERIAL_PROGRESS_ADVANCED"; playerId: PlayerId; space: number }
  | { type: "IMPERIAL_SEAL_CLAIMED"; playerId: PlayerId }
  | { type: "APPRENTICE_UNLOCKED"; playerId: PlayerId; workerId: WorkerId }
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
  contributions: Record<PlayerId, WoodContribution>;
}

export type SubmitContributionResult =
  | {
      ok: true;
      state: GameState;
      privateState: PrivateFiringState;
      events: GameEvent[];
    }
  | { ok: false; error: GameRuleError };
