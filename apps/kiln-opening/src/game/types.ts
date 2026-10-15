/**
 * Kiln Opening / 开窑 — V1.6.1 rules-engine contract.
 *
 * Authority: `docs/KILN_OPENING_v1.6.1_EN_SOURCE.md` (the only rules source) and the owner
 * rulings recorded in `docs/RULEBOOK_AUDIT_V1.6.1.md`. In JSDoc below, `L124` cites a line
 * of the V1.6.1 source, `R1`–`R13` / `B1`–`B3` cite owner rulings, `INT:` cites a recorded
 * interpretation and `DIG:` a digital decision from the audit. `DESIGN §x` refers to
 * `docs/ENGINE_V1.6.1_DESIGN.md`.
 *
 * This file is types only: no imports and no runtime code. Every engine module, the
 * multiplayer layer and the UI import their shared vocabulary from here. Changing it is a
 * contract change that needs the engine lead's review (DESIGN §1).
 *
 * Conventions:
 * - Every deck/pile array is ordered top-first: index 0 is the top card.
 * - All ceramic data is public (L508). Everything secret lives under `GameState.hidden`,
 *   in `PrivateFiringState` (unrevealed Contributions) or under an event's `secret` field.
 * - Stable IDs never change meaning inside one rules version; retired IDs are never reused.
 */

// ═══════════════════════════════════════════════════════════════════════════════════════
// 1. Versioning and identifiers
// ═══════════════════════════════════════════════════════════════════════════════════════

/** DIG: the rulebook is "v1.6.1" (its title read "v1.61" until the owner's 2026-10-16 edits); the engine uses `1.6.1`. */
export type RulesVersion = "1.6.1";
/** DIG: state schema 6. V1.4 (schema 5) rooms are rejected, never migrated. */
export type SchemaVersion = 6;

export type PlayerId = string;
/** `${playerId}:shifu` or `${playerId}:apprentice:${1|2|3}`. */
export type WorkerId = string;
/** `c${sequence}`, minted from `GameState.nextCeramicSequence`; never reused. */
export type CeramicId = string;
/**
 * A physical Vessel card (`bowl-01` … `censer-10`) or a proxy (`bowl-proxy-1`). Vessel cards
 * are not a gameplay limit (L329): when a Shape's supply is empty a proxy ID is minted from
 * `GameState.nextProxySequence`.
 */
export type VesselInstanceId = string;

export type PlayerCount = 2 | 3 | 4;
export type RoundNumber = 1 | 2 | 3 | 4 | 5;

/** Stable IDs of the 16 Starting Orders (A0, L519–540). */
export type StartingOrderId =
  | "S01" | "S02" | "S03" | "S04" | "S05" | "S06" | "S07" | "S08"
  | "S09" | "S10" | "S11" | "S12" | "S13" | "S14" | "S15" | "S16";

/** Stable IDs of the 48 Main Orders (A1–A3, L542–605). */
export type MainOrderId =
  | "O01" | "O02" | "O03" | "O04" | "O05" | "O06" | "O07" | "O08"
  | "O09" | "O10" | "O11" | "O12" | "O13" | "O14" | "O15" | "O16"
  | "O17" | "O18" | "O19" | "O20" | "O21" | "O22" | "O23" | "O24"
  | "O25" | "O26" | "O27" | "O28" | "O29" | "O30" | "O31" | "O32"
  | "O33" | "O34" | "O35" | "O36" | "O37" | "O38" | "O39" | "O40"
  | "O41" | "O42" | "O43" | "O44" | "O45" | "O46" | "O47" | "O48";

export type OrderId = StartingOrderId | MainOrderId;

/**
 * Kiln Player Boards. All five are selectable (R1, L73); the V1.4 Ding exclusion is withdrawn.
 * RU 汝 Ru · GU 官 Guan · GE 哥 Ge · DI 定 Ding · JU 钧 Jun.
 */
export type KilnId = "RU" | "GU" | "GE" | "DI" | "JU";

/**
 * Tech disciplines (L374–376), renamed from V1.4's forming/glazing/firing to match the
 * rulebook: Workshop · Glazing & Loading · Firing.
 */
export type TechDiscipline = "workshop" | "glazing_loading" | "firing";

/**
 * The 18 Advanced Techs (Appendix B, L609–654). DIG: keep T01, T05, T10–T15 where the
 * tile carries the same idea; new tiles take T16–T25; retired IDs (T02–T04, T06–T09,
 * ST01–ST04) are never reused.
 *
 * | ID  | Discipline        | Tile                  | Cost | Source line | ID history                 |
 * |-----|-------------------|-----------------------|------|-------------|----------------------------|
 * | T01 | workshop          | Large Throwing Wheel  | 2    | L615        | kept                       |
 * | T16 | workshop          | Decorator's Kit       | 2    | L616        | new                        |
 * | T05 | workshop          | Reworking Table       | 2    | L617        | kept (was Forming)         |
 * | T17 | workshop          | Prepared Clay         | 3    | L618        | new (idea of retired ST01) |
 * | T18 | workshop          | Senior Apprentice     | 2    | L619        | new                        |
 * | T19 | workshop          | Connoisseur's Cabinet | 3    | L620        | new                        |
 * | T10 | glazing_loading   | Colour Samples        | 2    | L626        | kept                       |
 * | T20 | glazing_loading   | Kiln Tending          | 2    | L627        | new (idea of retired ST04) |
 * | T15 | glazing_loading   | Kiln Furniture        | 2    | L628        | kept (was Firing)          |
 * | T21 | glazing_loading   | Inverted Firing 覆烧   | 2    | L629        | new                        |
 * | T22 | glazing_loading   | Setter's Mark         | 2    | L630        | new                        |
 * | T23 | glazing_loading   | Canal Barge 漕船       | 2    | L631        | new                        |
 * | T11 | firing            | Protective Saggars    | 2    | L637        | kept                       |
 * | T12 | firing            | Fuel Ledger           | 3    | L638        | kept                       |
 * | T13 | firing            | Test Pieces 火照       | 3    | L639        | kept                       |
 * | T14 | firing            | Second Firing         | 2    | L640        | kept                       |
 * | T24 | firing            | Kiln Master 窑工       | 2    | L641        | new                        |
 * | T25 | firing            | Tribute Ware 贡瓷      | 4    | L642        | new                        |
 *
 * Costs and disciplines live in `data/techniques.json`; this table is documentation only.
 */
export type TechId =
  | "T01" | "T05" | "T10" | "T11" | "T12" | "T13" | "T14" | "T15"
  | "T16" | "T17" | "T18" | "T19" | "T20" | "T21" | "T22" | "T23" | "T24" | "T25";

/** Central locations (L49, L71). V1.4 IDs map: market_imperial_office→commission_market,
 * guild_academy→guild_hall, labour→canal_wharf, court_patronage→magistrates_hall. */
export type CentralLocationId =
  | "materials_yard"
  | "commission_market"
  | "guild_hall"
  | "canal_wharf"
  | "magistrates_hall";

/** Personal locations on each Kiln Player Board (L50, L144). V1.4 forming_studio →
 * form_decorate; glaze_workshop + kiln_yard → glaze_load. */
export type PersonalLocationId = "form_decorate" | "glaze_load";

export type LocationId = CentralLocationId | PersonalLocationId;

/** Each personal location has 2 spaces; index 1 starts locked (L73, L108). */
export type PersonalSpaceIndex = 0 | 1;

/**
 * Shared Kiln spaces: 3 High (+1), 3 Middle (0), 2 Low (−1) (L72). Active spaces by player
 * count (L100): 4p all 8; 3p 2-2-2; 2p 2-1-1. The exact active IDs are data
 * (`game_config.json` → `sharedKiln.activeSpacesByPlayerCount`).
 */
export type KilnSpaceId =
  | "high_1" | "high_2" | "high_3"
  | "middle_1" | "middle_2" | "middle_3"
  | "low_1" | "low_2";

export type KilnZone = "high" | "middle" | "low";

// ═══════════════════════════════════════════════════════════════════════════════════════
// 2. Game vocabulary
// ═══════════════════════════════════════════════════════════════════════════════════════

export type WorkerKind = "shifu" | "apprentice";
/** Which printed effect a placement resolves. An Apprentice resolves `shifu` only via
 * Senior Apprentice (T18, L619, R12). */
export type WorkerEffect = "apprentice" | "shifu";

/** Shapes and Clay costs (L321–327). `washer` = Brush Washer. */
export type Shape = "bowl" | "plate" | "washer" | "vase" | "censer";
/** Glazes and Preferred Heat 1/2/3/4 (L346–351). Chosen at loading (L344). */
export type Glaze = "white" | "celadon" | "grey_green" | "moon_white";
/** Decorations, all 2 Coins, chosen at forming (L333–340). Painted replaced Crackle (change 19). */
export type Decoration = "plain" | "carved" | "impressed" | "painted";
export type Quality = "flawed" | "standard" | "fine" | "masterpiece";
export type ResourceKind = "clay" | "wood" | "coins";
/** Commission Market "gain 1 Clay, 1 Wood or 1 Coin" (L196–197). */
export type GainResource = ResourceKind;

/** Fire deck 1/3/4/3/1 (Appendix C, L660–666). */
export type FireModifier = -2 | -1 | 0 | 1 | 2;
/** Kiln Die faces 1,1,2,2,3,3 (L93). */
export type KilnDieFace = 1 | 2 | 3;
/** Base Heat after the 0–5 clamp (L249). Global/Actual Heat are unclamped numbers. */
export type BaseHeat = 0 | 1 | 2 | 3 | 4 | 5;
/** High +1 / Middle 0 / Low −1 printed zone modifiers (L72). */
export type ZoneModifier = -1 | 0 | 1;
/** Imperial Kiln modifier chosen at loading (L57, L289, R10, R11). */
export type ImperialModifier = -1 | 0 | 1;
/** Kiln Furniture's chosen zone modifier (L628). */
export type KilnFurnitureModifier = -1 | 0 | 1;
/** A turned Heat marker or Kiln Master marker (L59, L641). */
export type HeatMarkerValue = 1 | -1;
/** Imperial Recognition 0–4 (L429–436). */
export type Recognition = 0 | 1 | 2 | 3 | 4;

/** Contribution cards (L253–259). */
export type ContributionCardId = "BANK" | "TEND" | "STOKE";
/** A revealed Contribution's Heat: ±1/0, or ±2 with a Fuel Ledger commitment (L638). */
export type ContributionHeat = -2 | -1 | 0 | 1 | 2;

// ═══════════════════════════════════════════════════════════════════════════════════════
// 3. Player state (all public — the Order hand lives in `HiddenState.orderHands`)
// ═══════════════════════════════════════════════════════════════════════════════════════

export interface ResourceState {
  clay: number;
  wood: number;
  coins: number;
}

/**
 * Where a placed worker sits. This is the single source of truth for location occupancy:
 * capacity checks and personal-space use are derived by scanning workers (DESIGN §2.3).
 */
export interface WorkerPlacement {
  locationId: LocationId;
  /** Personal locations: the space used (0 or 1). Central locations: display slot only. */
  spaceIndex: number;
  effect: WorkerEffect;
  /** True when an Apprentice resolved the Shifu effect through Senior Apprentice (T18). */
  viaSeniorApprentice: boolean;
  /** `GameState.placementSequence` at placement; orders meeples on a central location. */
  sequence: number;
}

export interface WorkerState {
  id: WorkerId;
  kind: WorkerKind;
  /** null = available. Workers return at Cleanup (L303). */
  placement: WorkerPlacement | null;
}

/** Lock state of one personal space. Occupancy is derived from `WorkerState.placement`
 * (each personal space is used at most once per round, L144). */
export interface PersonalSpaceState {
  /** Space 0 starts unlocked; space 1 is unlocked by a Tech of the matching discipline
   * (Workshop → form_decorate, Glazing & Loading → glaze_load) and may be used later the
   * same round (L212). Firing Techs unlock nothing. */
  unlocked: boolean;
}

export interface OwnedTechState {
  id: TechId;
  acquiredInRound: RoundNumber;
  /**
   * The once-per-round allowance has been consumed (L378). Readied at the Start of Round
   * (L132). Declining an optional use never sets this (R4). Unused for Techs without a
   * per-round limit (Fuel Ledger T12, Connoisseur's Cabinet T19, Colour Samples T10).
   */
  usedThisRound: boolean;
}

/** Imperial Recognition track state (L425–440). Each milestone is gained once (L440). */
export interface ImperialState {
  recognition: Recognition;
  /** Recognition 1: 1 Clay + 1 Wood + 1 Coin, fixed (L432, change 8). */
  grantReceived: boolean;
  /** Recognition 2: the private Imperial Kiln tile (L285). Its content is derived from
   * ceramics with `placement.kiln === "imperial"`. */
  kilnGained: boolean;
  /**
   * Recognition 3 token (L293): `on_track` until reached, `held` once taken, `spent` after
   * its single use. Free (R10).
   */
  priority: "on_track" | "held" | "spent";
  /** Recognition 4: 6 VP once (L435). */
  audienceReceived: boolean;
}

/**
 * VP recorded during play (L492). Exhibition, Connoisseur's Cabinet and Coins are computed at
 * game end; Tech VP is recorded when the Tech is gained (owner amendment A1).
 */
export interface ScoreLedger {
  /** Printed VP of completed Orders (L414). */
  orders: number;
  /** Ru 4 VP (L460) and Guan 1 VP (L464). */
  kilnAbilities: number;
  /** +1 VP per Crown gained at Recognition 4 (L438), incl. Tribute Ware's bonus Crown (R13). */
  recognitionOverflow: number;
  /** 6 VP Imperial Audience (L435). */
  imperialAudience: number;
  /**
   * 1 VP per Advanced Tech, recorded when the Tech is gained (owner amendment A1, overriding
   * L379/L492/L609/L755). Always `techs.length × GAME_CONFIG.techs.vpEach`: no effect
   * removes a Tech.
   */
  techs: number;
}

export interface CrackleDeclaration {
  ceramicId: CeramicId;
  /** The Decoration this Crackle ceramic counts as for this Order only (L470, INT: Ge). */
  decoration: Decoration;
}

export interface CompletedOrderRecord {
  orderId: OrderId;
  /** Delivered ceramics, placed beneath the Order (L413). */
  ceramicIds: CeramicId[];
  round: RoundNumber;
  /** Canal Barge completes an Order for every completion effect (R6, L631). */
  via: "order_phase" | "canal_barge";
  vp: number;
  coins: number;
  /** Printed Crowns — tie-breaker 2 (L498) counts only these (R13). */
  printedCrowns: 0 | 1 | 2 | 3;
  /** Tribute Ware's extra Crown (T25, L642, R13); never a printed Crown. */
  bonusCrowns: 0 | 1;
  crackleDeclarations: CrackleDeclaration[];
  /** Ru/Guan reward if it triggered and was not declined (R4). */
  kilnAbility: { kilnId: "RU" | "GU"; vp: number; coins: number } | null;
}

/**
 * Public per-player state. Deliberately not duplicated here (derive with selectors):
 * Order hand (`HiddenState.orderHands`, count in `PublicCounts`); own Heat marker and Kiln
 * Master marker (`LoadedCeramic.heatMarker`); Imperial Kiln content (loaded ceramic with
 * `placement.kiln === "imperial"`); Setter's Mark and Kiln Furniture positions
 * (`SharedKilnSpaceState`); personal-space occupancy (`WorkerState.placement`).
 */
export interface PlayerState {
  id: PlayerId;
  /** Clockwise seat; `GameState.playerOrder[seatIndex] === id`. */
  seatIndex: number;
  displayName: string;
  kilnId: KilnId | null;
  /** Resources are open information (L504). Supply is unlimited (L502). */
  resources: ResourceState;
  workers: Record<WorkerId, WorkerState>;
  personalSpaces: Record<PersonalLocationId, [PersonalSpaceState, PersonalSpaceState]>;
  /** At most 3 Techs and at most 1 per discipline (L211, L375). Each scores 1 VP when gained (A1). */
  techs: OwnedTechState[];
  /** Kiln Tradition once-per-round allowance (Ru, Guan, Ge, Ding, Jun all once per round). */
  kilnAbilityUsedThisRound: boolean;
  imperial: ImperialState;
  completedOrders: CompletedOrderRecord[];
  score: ScoreLedger;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 4. Ceramics (L355–360). All stages and attributes are public (L508).
// ═══════════════════════════════════════════════════════════════════════════════════════

export type CeramicStage = "shaped" | "loaded" | "finished" | "delivered";

/** How a vessel came to be formed. Prepared Clay is a Tech effect, not a worker action (L646). */
export type FormedBy = "form_decorate" | "ding_extra" | "prepared_clay";

export interface CeramicCore {
  id: CeramicId;
  ownerId: PlayerId;
  vesselInstanceId: VesselInstanceId;
  shape: Shape;
  /** Chosen and paid when formed (L333). Never changed by Crackle (L470). */
  decoration: Decoration;
  formedInRound: RoundNumber;
  formedBy: FormedBy;
}

/** Waits in the owner's workshop; may be loaded (L357). */
export interface ShapedCeramic extends CeramicCore {
  stage: "shaped";
}

/**
 * A ceramic's Heat marker while loaded. The player's own marker is placed face-down by the
 * Glaze & Load Shifu (L180, R9) and turned to ±1 or returned in the Heat-marker step
 * (L268). INT: nothing hidden is committed at placement — a face-down marker has no value
 * yet. Kiln Master's marker (T24, L641) is placed face up in that step and "is a Heat marker
 * for all rules". At most one marker per ceramic (L185, L648).
 * Invariants (DESIGN §8.3): markers exist only on `loaded` ceramics (structural: the field
 * lives on `LoadedCeramic`); at most 1 `own` marker per player (L76); at most 1
 * `kiln_master` marker in the game (one T24 tile, L83), and its owner owns T24.
 */
export type CeramicHeatMarker =
  | { source: "own"; faceDown: true }
  | { source: "own" | "kiln_master"; faceDown: false; value: HeatMarkerValue };

export type LoadPlacement =
  | {
      kiln: "shared";
      spaceId: KilnSpaceId;
      /**
       * Loaded through Inverted Firing onto a space already holding exactly 1 of the
       * owner's ceramics (T21, L629, R8). Kiln Furniture is stored on the space, not here,
       * because both ceramics in the space use it (R8).
       */
      stacked: boolean;
    }
  | {
      kiln: "imperial";
      /** Chosen when loaded, public (R11), noted on the ceramic (L289). */
      imperialModifier: ImperialModifier;
    };

/** In the Shared Kiln or the owner's Imperial Kiln until fired (L358). */
export interface LoadedCeramic extends CeramicCore {
  stage: "loaded";
  glaze: Glaze;
  loadedInRound: RoundNumber;
  /** Imperial Priority is a token effect, not a Glaze & Load action (L293, L646). */
  loadedBy: "glaze_load" | "imperial_priority";
  placement: LoadPlacement;
  heatMarker: CeramicHeatMarker | null;
}

/** Attributes every fired ceramic records (L359). */
export interface FiredCeramicCore extends CeramicCore {
  glaze: Glaze;
  firedInRound: RoundNumber;
}

/**
 * Quality together with the permanent Crackle marker from Ge (L468), kept until delivered or
 * exhibited (L94). The union makes "a Crackle ceramic is never a Masterpiece" (L470, L654)
 * a type error rather than a comment: Ge targets only a Standard ceramic and makes it Fine,
 * and nothing can change it afterwards (Protective Saggars and Second Firing target only
 * Flawed or Standard ceramics, L637, L640), so a Crackle ceramic is always exactly Fine.
 * `assertInvariants` checks the same fact at runtime (DESIGN §8.3).
 */
export type FinishedQuality =
  | { crackle: false; quality: Quality }
  | { crackle: true; quality: "fine" };

/** As `FinishedQuality`, but a delivered ceramic is never Flawed (L279). */
export type DeliveredQuality =
  | { crackle: false; quality: Exclude<Quality, "flawed"> }
  | { crackle: true; quality: "fine" };

/** Fired; in the owner's Finished Ceramics area (L359). */
export type FinishedCeramic = FiredCeramicCore & { stage: "finished" } & FinishedQuality;

/** Committed to a completed Order; never reused (L360, L419). */
export type DeliveredCeramic = FiredCeramicCore & {
  stage: "delivered";
  orderId: OrderId;
  deliveredInRound: RoundNumber;
} & DeliveredQuality;

export type CeramicState = ShapedCeramic | LoadedCeramic | FinishedCeramic | DeliveredCeramic;

// ═══════════════════════════════════════════════════════════════════════════════════════
// 5. Board, market and decks (public parts)
// ═══════════════════════════════════════════════════════════════════════════════════════

export interface SharedKilnSpaceState {
  /** Covered spaces are never empty or usable (L184). */
  active: boolean;
  /**
   * 0, 1 or 2 ceramics, in loading order; 2 only via Inverted Firing, both owned by the same
   * player (R8). Each ID is a `loaded` ceramic whose placement names this space.
   */
  ceramicIds: CeramicId[];
  /**
   * Setter's Mark (T22, L630): only its owner may load here this round. Returned when the
   * owner loads here, or at Cleanup (L303). Placement is optional (INT).
   * Invariants (DESIGN §8.3): only on an active, empty space (loading there returns it, so a
   * marked space never holds a ceramic); the owner owns T22; at most 1 Mark per owner.
   */
  setterMarkOwnerId: PlayerId | null;
  /**
   * Kiln Furniture tile (T15, L628) beneath a ceramic in this space: every ceramic in the
   * space uses `modifier` instead of the printed zone modifier (R8). Returned after firing
   * (Appendix D step 12).
   * Invariants (DESIGN §8.3): `underCeramicId` is in `ceramicIds`; its owner is `ownerId`;
   * `ownerId` owns T15; at most 1 tile in the whole Shared Kiln. A stacked space under Kiln
   * Furniture is unreachable (T15 and T21 are both Glazing & Loading, L211), but the R8
   * clause is still implemented.
   */
  kilnFurniture: { ownerId: PlayerId; modifier: KilnFurnitureModifier; underCeramicId: CeramicId } | null;
}

export interface SharedKilnState {
  /**
   * Never iterate this record's keys for rule order: Postgres `jsonb` reorders object keys
   * (DESIGN §2.3 "Iteration order"). Iterate `KILN_SPACE_IDS` instead.
   */
  spaces: Record<KilnSpaceId, SharedKilnSpaceState>;
}

/**
 * The 6-position Main Order display, oldest (index 0, leftmost) to newest (L389).
 * `null` is an empty position: either awaiting the deferred end-of-turn refill (L191, L391)
 * or left empty because the deck and discard are both exhausted (B1).
 */
export interface MainOrderMarketState {
  display: Array<OrderId | null>;
  /**
   * A face-up Order was reserved this turn: compact and refill when the reserving player's
   * turn ends, after any after-action Canal Barge / Imperial Priority (L391, INT).
   */
  refillPendingFor: PlayerId | null;
}

export interface KilnDieRoll {
  round: RoundNumber;
  /** Rolled publicly by the server at the Start of every round, incl. Round 1 (L126, INT). */
  value: KilnDieFace;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 6. Hidden information (server-only; never projected — DESIGN §4)
// ═══════════════════════════════════════════════════════════════════════════════════════

/** A private look visible only to `playerId` (B2, B3). At most one is pending at a time
 * because every look happens inside the active player's own Work turn. */
export type PendingLook =
  | {
      /** Commission Shifu top-3 selection (L197, B1, B3). */
      kind: "commission_top_three";
      playerId: PlayerId;
      /** Removed from the deck; as many as remained (B1). */
      orderIds: OrderId[];
    }
  | {
      /** Colour Samples' mandatory when-acquired reservation (L626, R4, B1, B3). */
      kind: "colour_samples";
      playerId: PlayerId;
      orderIds: OrderId[];
    }
  | {
      /** Guild Hall Shifu inspection (L208, B2). */
      kind: "guild_inspection";
      playerId: PlayerId;
      discipline: TechDiscipline;
      /** Drawn off the deck top; "or as many as remain" (L208) — may be empty. */
      techIds: TechId[];
    };

/** Test Pieces' private peek at the top Fire card (L639, INT: Test Pieces). */
export interface FirePeek {
  playerId: PlayerId;
  round: RoundNumber;
  modifier: FireModifier;
  /** null until the owner decides; the bury itself is public (TEST_PIECES_USED). */
  buried: boolean | null;
}

export interface HiddenState {
  /** Secret Order hands (L201, L401). Counts are public via `PublicCounts`. */
  orderHands: Record<PlayerId, OrderId[]>;
  /** Main Order deck, top first. */
  mainDeck: OrderId[];
  /** Face-down Main Order discard (B3); only its count is public. */
  mainDiscard: OrderId[];
  /** Undealt and discarded Starting Orders, returned to the box (L102, L304). */
  startingBox: StartingOrderId[];
  /** Tech decks per discipline, top first (L103). */
  techDecks: Record<TechDiscipline, TechId[]>;
  /** Fire deck, top first. A buried card is moved to the end (editorial note on L649). */
  fireDeck: FireModifier[];
  pendingLook: PendingLook | null;
  /** Kept for the rest of the firing so the owner can reconnect and still see it. */
  firePeeks: Partial<Record<PlayerId, FirePeek>>;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 7. Firing (Appendix D, L670–693)
// ═══════════════════════════════════════════════════════════════════════════════════════

export interface ContributionSubmission {
  card: ContributionCardId;
  /** Fuel Ledger's secret extra Wood (T12, L638): only with BANK or STOKE; makes it ±2. */
  fuelLedger: boolean;
}

export interface RevealedContribution extends ContributionSubmission {
  heat: ContributionHeat;
  woodPaid: number;
}

/** Unrevealed Contributions. Kept outside `GameState` (stored in
 * `private.private_submissions`) until every eligible participant has submitted (DESIGN §4). */
export interface PrivateFiringState {
  gameId: string;
  /** null when no Contribution window is open. */
  windowId: string | null;
  submissions: Partial<Record<PlayerId, ContributionSubmission>>;
}

/** Jun is not a cause: it adjusts Actual Heat before Quality is assigned (L478, L680). */
export type QualityChangeCause = "fired" | "protective_saggars" | "second_firing" | "ge_crackle";

export interface QualityChange {
  cause: QualityChangeCause;
  from: Quality | null;
  to: Quality;
}

export interface HeatCalculation {
  /** Fire modifier used: the round's card, or Second Firing's extra card. */
  fireModifier: FireModifier;
  /** Shared: Global Heat (Base Heat + Fire). Imperial: Kiln Die + Fire (L289). */
  heatSource: number;
  /** Zone modifier, Kiln Furniture modifier or Imperial modifier. */
  positionModifier: number;
  /** Fixed in the Heat-marker step; stays for Second Firing (L269, L648). 0 = no marker. */
  heatMarker: -1 | 0 | 1;
  /** heatSource + positionModifier + heatMarker (L245, L678). */
  actualHeat: number;
  /** Jun's ±1 (L478). Never carries into a Second Firing recalculation (L640). */
  junAdjustment: -1 | 0 | 1;
  finalActualHeat: number;
  heatDifference: number;
}

export interface FiringCeramicRecord {
  ceramicId: CeramicId;
  ownerId: PlayerId;
  kiln: "shared" | "imperial";
  spaceId: KilnSpaceId | null;
  glaze: Glaze;
  preferredHeat: number;
  positionSource: "zone" | "kiln_furniture" | "imperial";
  /** Set in step 7. */
  first: HeatCalculation | null;
  /**
   * Set when Second Firing recalculates this ceramic (T14). `second.fireModifier` is the
   * permanent record of the extra Fire card; the card itself is in `fireDiscard` once
   * resolved (or in `FiringContext.pendingExtraFire` during the R7 Jun window).
   */
  second: HeatCalculation | null;
  /** Current Quality from step 9 on; replaced by after-Quality effects (L640). */
  quality: Quality | null;
  history: QualityChange[];
  /** Ge Crackle applied this firing (L468). Invariant: `crackle ⇒ quality === "fine"`. */
  crackle: boolean;
  /** Discarded in step 11 (L281). */
  salvaged: boolean;
}

export interface TestPiecesRecord {
  playerId: PlayerId;
  /** Paid 1 Wood and peeked (public fact; the value is private). */
  peeked: boolean;
  /** Public bury decision (INT: Test Pieces). */
  buried: boolean;
}

export interface FiringContext {
  round: RoundNumber;
  kilnDie: KilnDieFace;
  /** Contribution participants: ≥1 ceramic in the Shared Kiln (L261, change 16). May be empty
   * (INT: no participants → skip Contributions, Base Heat = Kiln Die). */
  participantIds: PlayerId[];
  /** Players with ≥1 ceramic in this firing, Shared or Imperial (L290). */
  firingPlayerIds: PlayerId[];
  contributionWindowId: string | null;
  /** null until revealed (L673). Never contains unrevealed choices. */
  contributions: Partial<Record<PlayerId, RevealedContribution>> | null;
  /** Kiln Die + Σ Contributions before the clamp. */
  unclampedBaseHeat: number | null;
  baseHeat: BaseHeat | null;
  testPieces: TestPiecesRecord[];
  /** The round's Fire card (step 6). Discarded face up in step 12. */
  fireModifier: FireModifier | null;
  /** Base Heat + Fire; not clamped (L249). */
  globalHeat: number | null;
  /**
   * Keyed by ceramic ID. Never iterate the keys for rule order (DESIGN §2.3): iterate the
   * ceramics in sequence order, or First Player order where the rule says so.
   */
  ceramics: Partial<Record<CeramicId, FiringCeramicRecord>>;
  /**
   * Second Firing's extra Fire card while it is being resolved (T14, L640). Non-null only
   * while `firing_second_firing_jun` is open (R7); otherwise the card is drawn, resolved and
   * moved to `fireDiscard` inside one command. The card is in exactly one place at a time
   * (deck → here → discard), so card conservation counts it once (DESIGN §8.3). The history
   * of extra cards is `FiringCeramicRecord.second.fireModifier`.
   */
  pendingExtraFire: { playerId: PlayerId; ceramicId: CeramicId; modifier: FireModifier } | null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 8. Phases — explicit timing-window state machine (DESIGN §3)
// ═══════════════════════════════════════════════════════════════════════════════════════

/** An ordered decision queue, normally First Player order (L378, L482). */
export interface DecisionQueue {
  actorIds: PlayerId[];
  index: number;
}

/**
 * Steps of one Work turn. A worker action is a single command when everything it decides
 * is known at decision time; it opens a sub-step only where hidden information is revealed
 * mid-action (DESIGN §3.2).
 */
export type WorkTurnStep =
  | {
      /** Before-action window (L58, L631): USE_CANAL_BARGE, USE_IMPERIAL_PRIORITY, or a
       * PLACE_* worker action. END_TURN is illegal until the worker action resolves. */
      kind: "before_action";
    }
  | {
      kind: "commission_market";
      workerId: WorkerId;
      effect: WorkerEffect;
      /** 1 (Apprentice effect) or 2 (Shifu effect, incl. Senior Apprentice R12). */
      maxReservations: 1 | 2;
      reservationsMade: 0 | 1 | 2;
      /** The Shifu top-3 selection may replace 1 reservation (L197); false once used. */
      topThreeAvailable: boolean;
      /**
       * `reservation`: COMMISSION_RESERVE, or COMMISSION_STOP once ≥1 reservation is made.
       * `look_choice`: COMMISSION_CHOOSE_LOOKED (cards in `hidden.pendingLook`).
       * `resource`: COMMISSION_GAIN after each reservation (L197).
       */
      awaiting: "reservation" | "look_choice" | "resource";
    }
  | {
      /** Guild Hall Shifu: inspected Techs are in `hidden.pendingLook` (B2). Next: GUILD_TAKE. */
      kind: "guild_inspection";
      workerId: WorkerId;
      discipline: TechDiscipline;
      inspectedCount: number;
    }
  | {
      /** Colour Samples when acquired (L626, R4): COLOUR_SAMPLES_CHOOSE. */
      kind: "colour_samples";
      lookedCount: number;
    }
  | {
      /**
       * After-action window: USE_CANAL_BARGE, USE_IMPERIAL_PRIORITY, END_TURN. Opened only
       * if Canal Barge is owned and unused this round (regardless of the hand, so the
       * window itself leaks nothing — DESIGN §4.5) or Imperial Priority is usable;
       * otherwise the turn ends automatically.
       */
      kind: "after_action";
    };

export type GamePhase =
  | {
      /** Setup step 9 (L108): reverse turn order; all five Kilns available (R1). */
      type: "setup_kiln_selection";
      selectionOrder: PlayerId[];
      index: number;
    }
  | {
      /** Start of Work Phase: Setter's Mark owners in First Player order (T22, L630). */
      type: "round_start_setters_mark";
      queue: DecisionQueue;
    }
  | {
      type: "work_turn";
      activePlayerId: PlayerId;
      step: WorkTurnStep;
    }
  | {
      /** Appendix D steps 1–2. Secret, simultaneous; any eligible player may submit in any
       * order through `submitContribution` (not `applyAction`). */
      type: "firing_contributions";
      windowId: string;
      eligiblePlayerIds: PlayerId[];
      submittedPlayerIds: PlayerId[];
    }
  | {
      /** Step 4 (L675), First Player order. `bury` follows a private peek. */
      type: "firing_test_pieces";
      queue: DecisionQueue;
      awaiting: "decision" | "bury";
    }
  | {
      /**
       * Step 5 (L676), First Player order: own marker and Kiln Master. When the queue ends
       * (or no one is queued), step 6 (reveal Fire, L677) and step 7 (Actual Heat) run
       * automatically inside the same command; there is no reveal decision (DESIGN §3.3).
       */
      type: "firing_heat_markers";
      queue: DecisionQueue;
    }
  | {
      /** Step 8 (L679): Jun and any heat-adjustment abilities, First Player order. */
      type: "firing_heat_adjustment";
      queue: DecisionQueue;
    }
  | {
      /** Step 10 (L681): Saggars, Second Firing, Ge in each owner's chosen order. */
      type: "firing_after_quality";
      queue: DecisionQueue;
    }
  | {
      /** R7: unused Jun on the Second Firing ceramic after the extra card is revealed and
       * Actual Heat recalculated, before the new Quality. The extra card waits in
       * `FiringContext.pendingExtraFire`. RESOLVE_JUN assigns the new Quality, discards the
       * card and returns to `firing_after_quality`. */
      type: "firing_second_firing_jun";
      actorId: PlayerId;
      ceramicId: CeramicId;
    }
  | {
      /** Step 11 (L682): independent choices, so any pending player may act in any order
       * (`DecisionPrompt.mode === "parallel"`). */
      type: "firing_salvage";
      pendingPlayerIds: PlayerId[];
      /**
       * The revision at which this window first appears (the opener writes
       * `draft.revision + 1`, the revision its command commits, DESIGN §2.5). The service
       * accepts a command whose `expectedRevision` is at least this value (DESIGN §4.6).
       */
      openedAtRevision: number;
    }
  | {
      /** Phase 4 (L297): a single pass in First Player order; players with nothing
       * completable are skipped automatically (INT). */
      type: "orders";
      turnOrder: PlayerId[];
      index: number;
    }
  | {
      /** Cleanup step 2 (L304). Skipped in Round 5 (INT). Independent, any order
       * (`DecisionPrompt.mode === "parallel"`). */
      type: "cleanup_hand_limit";
      pendingPlayerIds: PlayerId[];
      /** As `firing_salvage.openedAtRevision`. */
      openedAtRevision: number;
    }
  | { type: "finished" };

export type GamePhaseType = GamePhase["type"];

// ═══════════════════════════════════════════════════════════════════════════════════════
// 9. Game state
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * The authoritative state. It must survive a JSON round trip unchanged, including through
 * Postgres `jsonb`, which reorders object keys: no `undefined` values (omit optional keys
 * instead), no `NaN`/`Infinity`, no class instances, and no rule that depends on the key
 * order of a `Record` (DESIGN §2.3, §7).
 */
export interface GameState {
  schemaVersion: SchemaVersion;
  rulesVersion: RulesVersion;
  gameId: string;
  /** Incremented once per accepted command or Contribution submission. */
  revision: number;
  /** Total events emitted; the store numbers public events from it. */
  eventSequence: number;
  nextCeramicSequence: number;
  nextProxySequence: number;
  /** Placement counter for meeple ordering; reset each round. */
  placementSequence: number;
  playerCount: PlayerCount;
  round: RoundNumber;
  /** Clockwise seat order. */
  playerOrder: PlayerId[];
  /** Random at setup (L108); passes clockwise at Cleanup (L305). */
  firstPlayerId: PlayerId;
  phase: GamePhase;
  /** Iterate `playerOrder` / `turnOrder`, never these keys (DESIGN §2.3). */
  players: Record<PlayerId, PlayerState>;
  /** Iterate in ceramic sequence order (`c1, c2, …, c10`), never these keys (DESIGN §2.3). */
  ceramics: Record<CeramicId, CeramicState>;
  /** Physical Vessel cards per Shape (10 each, L80); proxies are minted when empty (L329). */
  vesselSupply: Record<Shape, VesselInstanceId[]>;
  sharedKiln: SharedKilnState;
  market: MainOrderMarketState;
  /** Face-up Techs per discipline, 0–2 (L103, L210, L513). Iterate `DISCIPLINES`. */
  techDisplay: Record<TechDiscipline, TechId[]>;
  /** Open information (L512, change 12), oldest first. */
  fireDiscard: FireModifier[];
  kilnDie: KilnDieRoll | null;
  firing: FiringContext | null;
  /** The most recently finished firing, kept for the UI recap until the next one starts. */
  lastFiring: FiringContext | null;
  finalResult: FinalResult | null;
  /** Server-only. Never serialised to clients (DESIGN §4). */
  hidden: HiddenState;
}

/** Everything in `GameState` except `hidden`. Helpers typed against `PublicCore` accept both
 * the authoritative state (for resolving) and a projected view (for validating). */
export type PublicCore = Omit<GameState, "hidden">;

export interface PublicCounts {
  orderHands: Record<PlayerId, number>;
  mainDeck: number;
  mainDiscard: number;
  techDecks: Record<TechDiscipline, number>;
  fireDeck: number;
  /** Whose private look is pending and how many cards it shows — never which cards. */
  pendingLook: { playerId: PlayerId; kind: PendingLook["kind"]; count: number } | null;
}

/** The public projection: safe for `public.game_public_states`, realtime and logs. */
export interface PublicGameState extends PublicCore {
  counts: PublicCounts;
}

/** One seat's private data; returned only in that seat's authenticated response. */
export interface PrivatePlayerView {
  playerId: PlayerId;
  orderHand: OrderId[];
  /** Present only when the pending look belongs to this player. */
  pendingLook: PendingLook | null;
  firePeek: FirePeek | null;
  /**
   * This seat's own sealed Contribution, including the Fuel Ledger commitment, until the
   * reveal. Rebuilt on reconnect from the stored private submission (DESIGN §4.6); it
   * replaces the multiplayer layer's `PendingContribution`.
   */
  pendingContribution: (ContributionSubmission & { windowId: string }) | null;
}

/** What one viewer may know. Validators, selectors and `legalActions` take only this
 * (DESIGN §5: validate on the view, resolve on the state). `own` is null for spectators. */
export interface PlayerView {
  viewerId: PlayerId | null;
  game: PublicGameState;
  own: PrivatePlayerView | null;
}

/** A view whose viewer is a seated player; the input of every action validator. */
export interface ActorView extends PlayerView {
  viewerId: PlayerId;
  own: PrivatePlayerView;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 10. Commands
// ═══════════════════════════════════════════════════════════════════════════════════════

export interface PlayerSetup {
  id: PlayerId;
  displayName: string;
}

export interface CreateGameInput {
  gameId: string;
  /** 2–4 players in clockwise seat order. */
  players: PlayerSetup[];
}

export interface FormVesselSpec {
  shape: Shape;
  decoration: Decoration;
}

/**
 * One load of a Glaze & Load action, resolved in array order (R8: a later load may stack
 * on a ceramic loaded earlier by the same action).
 *
 * Per load, `validateLoads` checks in this order (DESIGN §2.4):
 * 1. the ceramic is your Shaped vessel, not already loaded by this command;
 * 2. `reworkShape` (L617 "you may first change its Shape"): the Shape every later check uses;
 * 3. the destination (R5), including Inverted Firing's Bowl/Plate/Brush Washer test on the
 *    reworked Shape (L629, R8);
 * 4. Kiln Furniture (Shared only, L647).
 * Once-per-round Techs (T05, T15, T21) may each appear at most once across the loads.
 * Placement legality (R5c) looks only at current Shapes, not at a Shape Reworking Table could
 * produce (DESIGN §11 Q3 default).
 */
export interface LoadSpec {
  ceramicId: CeramicId;
  /** Free choice at loading; no cost (L344). */
  glaze: Glaze;
  destination:
    | {
        kiln: "shared";
        spaceId: KilnSpaceId;
        /** Must be true iff the space already holds exactly 1 of your ceramics (T21, R5c, R8);
         * the ceramic's Shape after `reworkShape` must be a Bowl, Plate or Brush Washer. */
        invertedFiring?: boolean;
        /** Kiln Furniture tile placed beneath this ceramic (T15, L628). Never together with
         * `invertedFiring` in reachable play: T15 and T21 share a discipline (L211). */
        kilnFurniture?: KilnFurnitureModifier;
      }
    | {
        /** At most 1 load per action, into your own empty Imperial Kiln (L182). */
        kiln: "imperial";
        imperialModifier: ImperialModifier;
      };
  /** Reworking Table (T05, L617): change Shape first; no Clay; Decoration kept. */
  reworkShape?: Shape;
}

export type CommissionReservationChoice =
  | {
      /** Reserve a face-up Order; its position stays empty until your turn ends (L191).
       * `orderId` must match `market.display[slotIndex]`. The resource is known at decision
       * time, so it is part of this command (L196–197). */
      kind: "face_up";
      slotIndex: number;
      orderId: OrderId;
      gain: GainResource;
    }
  | {
      /** Top card of the deck without looking first (L192); needs a card after any
       * reshuffle (B1). The resource is chosen after the card is seen (COMMISSION_GAIN). */
      kind: "blind";
    }
  | {
      /** Shifu effect only, once (L197): look at the top 3 (as many as remain, B1). */
      kind: "look_top_three";
    };

export interface OrderCompletionSpec {
  /** Must be in your hand (L53, L297). */
  orderId: OrderId;
  /** Finished, undelivered, Standard+ ceramics you own (L411). */
  ceramicIds: CeramicId[];
  /**
   * Crackle wildcard declarations, made while completing the Order (L470, L485). Two modes,
   * never mixed:
   * - **Omitted:** the engine searches deterministically (`orders/matching.ts`, fixed
   *   enumeration order) for declarations that satisfy the Order and records the first found.
   * - **Present (possibly `[]`):** used exactly as given; the engine never searches or
   *   substitutes. Each entry must name a selected ceramic that carries a Crackle marker,
   *   each ceramic at most once; an undeclared Crackle ceramic counts with its printed
   *   Decoration. Otherwise → `INVALID_CRACKLE_DECLARATION`. If the declared set is
   *   well-formed but the Order is not satisfied → `INVALID_CRACKLE_DECLARATION` when some
   *   other declaration would satisfy it, else `ORDER_REQUIREMENTS_NOT_MET`.
   */
  crackleDeclarations?: CrackleDeclaration[];
  /** Ru/Guan are optional (R4); declining keeps the once-per-round use. */
  declineKilnAbility?: boolean;
  /** Tribute Ware is optional (R4); declining keeps the once-per-round use. */
  declineTributeWare?: boolean;
}

export type GameAction =
  // ── Setup ──────────────────────────────────────────────────────────────────────────
  | { type: "SELECT_KILN"; kilnId: KilnId }
  // ── Start of Round ─────────────────────────────────────────────────────────────────
  /** Setter's Mark on an empty active space, or null to decline (INT: optional). */
  | { type: "PLACE_SETTERS_MARK"; spaceId: KilnSpaceId | null }
  // ── Work: worker actions (one per turn; L136) ──────────────────────────────────────
  | {
      /**
       * Materials Yard (L160–163). clay + wood = 3 (Apprentice) or 4 (Shifu effect).
       * Resolution order, each step validated against the running totals
       * (`quoteMaterialsYard`, DESIGN §3.5): (1) gain the split; (2) `buyShifuBonus`: pay 1 Coin,
       * gain +1 Clay +1 Wood (L163 "Then"); (3) `preparedClay` (L618 "after gaining
       * resources"), so it may spend the bonus Clay.
       */
      type: "PLACE_MATERIALS_YARD";
      workerId: WorkerId;
      clay: number;
      wood: number;
      /** Senior Apprentice (T18): this Apprentice resolves the Shifu effect (R12). Never
       * together with `preparedClay` in reachable play (both Workshop, L211). */
      seniorApprentice?: boolean;
      /** Shifu effect: pay 1 Coin for +1 Clay +1 Wood, after the 4 resources (L163). */
      buyShifuBonus?: boolean;
      /**
       * Prepared Clay (T17, L618), after gaining resources: Clay cost +1 and a Decoration.
       * `useDecoratorsKit` implements the audit INT (Kit may reduce that Decoration), but the
       * combination is unreachable: T16 and T17 are both Workshop Techs (L211). Validators
       * keep the branch; enumeration never generates it (DESIGN §5.2).
       */
      preparedClay?: { shape: Shape; decoration: Decoration; useDecoratorsKit?: boolean };
    }
  | {
      /**
       * Form & Decorate (L167–173), on your first free unlocked space. Placement is legal if
       * at least 1 single vessel (Shape × Decoration) is affordable after every ready
       * Workshop discount: Large Throwing Wheel (Vase/Censer Clay to 0) and Decorator's Kit
       * (non-Plain −1 Coin) (L172, R4 "apply valid discounts before payment"; `canFormAny`).
       */
      type: "PLACE_FORM_DECORATE";
      workerId: WorkerId;
      /** 1 (Apprentice) or 1–2 (Shifu). Forming 2 with the Shifu reduces one Decoration by
       * 1 Coin (L170); the engine applies it. */
      vessels: FormVesselSpec[];
      /** Ding (L474, R1): after forming a Bowl/Plate/Brush Washer, pay 1 Clay + 1 Coin for one
       * more of the same Shape; its Decoration costs that 1 Coin; outside every discount (L652). */
      dingExtra?: { copyOfVesselIndex: number; decoration: Decoration };
      /** Large Throwing Wheel (T01, L615): total Clay −2 (min 0) if ≥1 Vase/Censer formed. */
      useLargeThrowingWheel?: boolean;
      /** Decorator's Kit (T16, L616): −1 Coin on this vessel's Carved/Impressed/Painted.
       * Never together with `useLargeThrowingWheel` in reachable play (both Workshop, L211);
       * the validator still handles both. */
      decoratorsKitVesselIndex?: number;
    }
  | {
      /** Glaze & Load (L177–185), on your first free unlocked space. */
      type: "PLACE_GLAZE_LOAD";
      workerId: WorkerId;
      /** 1 (Apprentice) or 1–2 (Shifu). */
      loads: LoadSpec[];
      /** Shifu only, optional (R9): your Heat marker face down on one of your loaded ceramics
       * (Shared or Imperial) without a marker, incl. one loaded earlier or by Imperial Priority. */
      heatMarkerCeramicId?: CeramicId;
    }
  | {
      /** Commission Market (L187–201). The first reservation is mandatory and part of the
       * placement; later steps follow in `WorkTurnStep.commission_market`. */
      type: "PLACE_COMMISSION_MARKET";
      workerId: WorkerId;
      seniorApprentice?: boolean;
      first: CommissionReservationChoice;
    }
  | {
      /** Guild Hall (L203–214). Apprentice: `buy_face_up` at printed cost. Shifu: `inspect`
       * a discipline (even one already owned, B2), then GUILD_TAKE. */
      type: "PLACE_GUILD_HALL";
      workerId: WorkerId;
      choice: { kind: "buy_face_up"; techId: TechId } | { kind: "inspect"; discipline: TechDiscipline };
    }
  | { /** Canal Wharf (L216–221): 2 / 4 Coins; uncapped, always legal (L143). */ type: "PLACE_CANAL_WHARF"; workerId: WorkerId }
  | { /** Magistrate's Hall (L223–233): 4 / 3 Coins, +1 Recognition, only at 0–2. */ type: "PLACE_MAGISTRATES_HALL"; workerId: WorkerId }
  // ── Work: sub-steps that follow a private reveal ───────────────────────────────────
  | { type: "COMMISSION_RESERVE"; choice: CommissionReservationChoice }
  | { /** Reserve 1 looked-at Order; the rest go face down to the discard (L197). */ type: "COMMISSION_CHOOSE_LOOKED"; orderId: OrderId }
  | { type: "COMMISSION_GAIN"; resource: GainResource }
  | { /** Shifu effect: stop after the first reservation (L199). */ type: "COMMISSION_STOP" }
  | {
      /** Guild Shifu: take 1 face-up Tech (any discipline) or 1 inspected Tech at −1 Coin
       * (min 0) (L208). `bottomOrder` lists every untaken inspected Tech exactly once, top to
       * bottom as they will sit at the deck bottom (B2: private). Returned before refilling. */
      type: "GUILD_TAKE";
      take: { kind: "face_up"; techId: TechId } | { kind: "inspected"; techId: TechId };
      bottomOrder: TechId[];
    }
  | { /** Colour Samples when acquired: reserve 1 looked-at Order, discard the rest (L626). */ type: "COLOUR_SAMPLES_CHOOSE"; orderId: OrderId }
  // ── Work: before/after-action window ───────────────────────────────────────────────
  | ({ /** Canal Barge (T23, L631, R6). */ type: "USE_CANAL_BARGE" } & OrderCompletionSpec)
  | {
      /** Imperial Priority (L293, R10): free; Shaped vessel → your empty Imperial Kiln. */
      type: "USE_IMPERIAL_PRIORITY";
      ceramicId: CeramicId;
      glaze: Glaze;
      imperialModifier: ImperialModifier;
      /** Reworking Table if unused this round (DESIGN §11 open question Q1). */
      reworkShape?: Shape;
    }
  | { /** End your Work turn; triggers the deferred Main display refill (L191). */ type: "END_TURN" }
  // ── Firing ─────────────────────────────────────────────────────────────────────────
  | { /** Test Pieces: pay 1 Wood and peek privately, or decline (L639). */ type: "TEST_PIECES_DECIDE"; peek: boolean }
  | { /** After the peek: bury the card at the bottom of the Fire deck or leave it. */ type: "TEST_PIECES_BURY"; bury: boolean }
  | {
      /**
       * Heat-marker step (L268, L676, INT). `ownMarker` is required iff you have a face-down
       * marker: turn to +1/−1 or return it. `kilnMaster` (T24, optional R4): your ceramic in
       * this firing that carries no Heat marker after `ownMarker` resolves (INT: a returned
       * own marker frees its ceramic).
       */
      type: "RESOLVE_HEAT_MARKERS";
      ownMarker?: HeatMarkerValue | "return";
      kilnMaster?: { ceramicId: CeramicId; value: HeatMarkerValue };
    }
  | {
      /** Jun (L478, R7): pay 1 Wood, ±1 on one of your ceramics; null declines (R4). In
       * `firing_second_firing_jun` the ceramic must be the Second Firing ceramic. */
      type: "RESOLVE_JUN";
      adjustment: { ceramicId: CeramicId; delta: HeatMarkerValue } | null;
    }
  | { /** T11 (L637): 1 Wood; Flawed→Standard or Standard→Fine; never Masterpiece. */ type: "USE_PROTECTIVE_SAGGARS"; ceramicId: CeramicId }
  | {
      /** T14 (L640): extra Fire card; recalculate; may open the R7 Jun window. Otherwise the
       * new Quality is assigned and the card discarded in this command. */
      type: "USE_SECOND_FIRING";
      ceramicId: CeramicId;
    }
  | { /** Ge (L468): one of your Standard ceramics from this firing → Fine + Crackle. */ type: "USE_GE_CRACKLE"; ceramicId: CeramicId }
  | { /** Finish your after-Quality turn; remaining abilities are declined (R4). */ type: "END_AFTER_QUALITY" }
  | { /** Step 11: discard 1 still-Flawed ceramic from this firing for 2 Coins, or null. */ type: "SALVAGE_FLAWED"; ceramicId: CeramicId | null }
  // ── Order Phase ────────────────────────────────────────────────────────────────────
  | ({ type: "COMPLETE_ORDER" } & OrderCompletionSpec)
  | { type: "END_ORDER_TURN" }
  // ── Cleanup ────────────────────────────────────────────────────────────────────────
  | { /** Discard exactly hand − limit Orders (4, or 5 with Colour Samples) (L304). */ type: "DISCARD_TO_HAND_LIMIT"; orderIds: OrderId[] };

export type GameActionType = GameAction["type"];

/** Secret Contribution (Appendix D step 1). Applied through `submitContribution`, which
 * also receives and returns the `PrivateFiringState`. Shape-checked by `parseCommand`
 * like every other command (DESIGN §2.5). */
export interface SubmitContributionCommand {
  type: "SUBMIT_CONTRIBUTION";
  windowId: string;
  card: ContributionCardId;
  fuelLedger: boolean;
}

export type AuthoritativeCommand = GameAction | SubmitContributionCommand;

// ═══════════════════════════════════════════════════════════════════════════════════════
// 11. Events (UI presentation timeline and logs — DESIGN §4.4)
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * A private event payload. Projection removes `secret` for the public log and keeps it only
 * in the `visibleTo` seat's own view. An event without `secret` is entirely public.
 */
export type Secret<P> = { visibleTo: PlayerId } & P;

export type OrderReservationSource = "face_up" | "blind" | "top_three" | "colour_samples";

export type ResourceChangeReason =
  | "materials_yard"
  | "materials_yard_bonus"
  | "form_decorate"
  | "prepared_clay"
  | "ding_extra"
  | "commission_market"
  | "guild_hall"
  | "canal_wharf"
  | "magistrates_hall"
  | "kiln_tending"
  | "contribution"
  | "test_pieces"
  | "jun"
  | "protective_saggars"
  | "salvage"
  | "order_reward"
  | "guan"
  | "imperial_grant";

export interface CeramicHeatResult {
  ceramicId: CeramicId;
  calculation: HeatCalculation;
}

export type GameEvent =
  // ── Setup and rounds ───────────────────────────────────────────────────────────────
  | { type: "GAME_CREATED"; playerOrder: PlayerId[]; firstPlayerId: PlayerId; playerCount: PlayerCount }
  | {
      /** Setup step 2 (L101). Public: the counts. Private: the cards. */
      type: "ORDERS_DEALT";
      playerId: PlayerId;
      startingCount: number;
      mainCount: number;
      secret: Secret<{ startingOrderIds: StartingOrderId[]; mainOrderIds: MainOrderId[] }>;
    }
  | { type: "KILN_SELECTED"; playerId: PlayerId; kilnId: KilnId }
  | { type: "ROUND_STARTED"; round: RoundNumber; firstPlayerId: PlayerId }
  | { /** Public roll (L126, INT). */ type: "KILN_DIE_ROLLED"; round: RoundNumber; value: KilnDieFace }
  | {
      /** Rounds 2–5 rotation (L128–130, B1). The discarded Orders were public. */
      type: "MAIN_DISPLAY_ROTATED";
      round: RoundNumber;
      discardedOrderIds: OrderId[];
      display: Array<OrderId | null>;
    }
  | {
      /** Compact-and-refill after a turn with a face-up reservation, or the rotation's reveal. */
      type: "DISPLAY_REFILLED";
      cause: "end_of_turn" | "round_start" | "setup";
      revealedOrderIds: OrderId[];
      display: Array<OrderId | null>;
    }
  | { type: "MAIN_DECK_RESHUFFLED"; cardCount: number }
  | { type: "ABILITIES_READIED"; round: RoundNumber }
  | { type: "SETTERS_MARK_PLACED"; playerId: PlayerId; spaceId: KilnSpaceId | null }
  | { type: "SETTERS_MARK_RETURNED"; playerId: PlayerId; spaceId: KilnSpaceId; cause: "loaded_there" | "cleanup" }
  // ── Work ───────────────────────────────────────────────────────────────────────────
  | { type: "WORK_TURN_STARTED"; playerId: PlayerId }
  | {
      type: "WORKER_PLACED";
      playerId: PlayerId;
      workerId: WorkerId;
      kind: WorkerKind;
      locationId: LocationId;
      spaceIndex: number;
      effect: WorkerEffect;
      viaSeniorApprentice: boolean;
    }
  | {
      type: "RESOURCES_CHANGED";
      playerId: PlayerId;
      clay: number;
      wood: number;
      coins: number;
      reason: ResourceChangeReason;
    }
  | {
      type: "CERAMIC_FORMED";
      playerId: PlayerId;
      ceramicId: CeramicId;
      shape: Shape;
      decoration: Decoration;
      formedBy: FormedBy;
    }
  | { type: "CERAMIC_RESHAPED"; playerId: PlayerId; ceramicId: CeramicId; from: Shape; to: Shape }
  | {
      type: "CERAMIC_LOADED";
      playerId: PlayerId;
      ceramicId: CeramicId;
      glaze: Glaze;
      placement: LoadPlacement;
      loadedBy: LoadedCeramic["loadedBy"];
    }
  | { type: "KILN_FURNITURE_PLACED"; playerId: PlayerId; spaceId: KilnSpaceId; modifier: KilnFurnitureModifier }
  | { /** Face down (L180); no value exists yet (INT). */ type: "HEAT_MARKER_PLACED"; playerId: PlayerId; ceramicId: CeramicId }
  | {
      type: "ORDER_RESERVED";
      playerId: PlayerId;
      via: "commission_market" | "colour_samples";
      source: OrderReservationSource;
      /** Display position for `face_up`, else null. */
      slotIndex: number | null;
      /** Public only for `face_up` (the card was already showing). */
      orderId: OrderId | null;
      /** Present for `blind`, `top_three` and `colour_samples` (B3). */
      secret?: Secret<{ orderId: OrderId }>;
    }
  | {
      type: "PRIVATE_LOOK_OPENED";
      playerId: PlayerId;
      kind: PendingLook["kind"];
      discipline: TechDiscipline | null;
      count: number;
      secret: Secret<{ orderIds: OrderId[]; techIds: TechId[] }>;
    }
  | {
      /** Unchosen looked-at Orders go face down to the Main discard (L197, L626, B3). */
      type: "LOOKED_ORDERS_DISCARDED";
      playerId: PlayerId;
      count: number;
      secret: Secret<{ orderIds: OrderId[] }>;
    }
  | {
      type: "TECH_ACQUIRED";
      playerId: PlayerId;
      techId: TechId;
      source: "face_up" | "inspected";
      cost: number;
      /** The Tech's VP, recorded immediately in `ScoreLedger.techs` (owner amendment A1). */
      vp: number;
    }
  | {
      /** B2: the identities and order are private to the acting player. */
      type: "TECHS_RETURNED_TO_BOTTOM";
      playerId: PlayerId;
      discipline: TechDiscipline;
      count: number;
      secret: Secret<{ techIds: TechId[] }>;
    }
  | { type: "TECH_DISPLAY_REFILLED"; discipline: TechDiscipline; revealedTechIds: TechId[]; display: TechId[] }
  | { type: "PERSONAL_SPACE_UNLOCKED"; playerId: PlayerId; locationId: PersonalLocationId }
  | { type: "TECH_USED"; playerId: PlayerId; techId: TechId }
  | { type: "KILN_ABILITY_USED"; playerId: PlayerId; kilnId: KilnId }
  | { type: "IMPERIAL_PRIORITY_USED"; playerId: PlayerId; ceramicId: CeramicId }
  | { type: "WORK_TURN_ENDED"; playerId: PlayerId; automatic: boolean }
  | { type: "WORK_PHASE_ENDED"; round: RoundNumber }
  // ── Imperial Recognition ───────────────────────────────────────────────────────────
  | {
      /** One step at a time (L416, L439). */
      type: "RECOGNITION_ADVANCED";
      playerId: PlayerId;
      from: Recognition;
      to: Recognition;
      source: "printed_crown" | "tribute_crown" | "magistrates_hall";
      orderId: OrderId | null;
    }
  | { /** A Crown gained at Recognition 4 (L438). */ type: "CROWN_OVERFLOW_VP"; playerId: PlayerId; source: "printed_crown" | "tribute_crown"; vp: 1 }
  | { type: "IMPERIAL_GRANT_RECEIVED"; playerId: PlayerId; clay: 1; wood: 1; coins: 1 }
  | { type: "IMPERIAL_KILN_GAINED"; playerId: PlayerId }
  | { type: "IMPERIAL_PRIORITY_GAINED"; playerId: PlayerId }
  | { type: "IMPERIAL_AUDIENCE_GAINED"; playerId: PlayerId; vp: 6 }
  // ── Firing ─────────────────────────────────────────────────────────────────────────
  | { /** Nothing loaded: no Fire card is revealed (L237). */ type: "FIRING_SKIPPED"; round: RoundNumber }
  | { type: "FIRING_STARTED"; round: RoundNumber; participantIds: PlayerId[]; firingPlayerIds: PlayerId[] }
  | { /** Never carries the card (DESIGN §4.2). */ type: "CONTRIBUTION_SUBMITTED"; playerId: PlayerId; windowId: string }
  | {
      type: "CONTRIBUTIONS_REVEALED";
      windowId: string | null;
      contributions: Partial<Record<PlayerId, RevealedContribution>>;
    }
  | {
      type: "BASE_HEAT_DETERMINED";
      kilnDie: KilnDieFace;
      contributionSum: number;
      unclamped: number;
      baseHeat: BaseHeat;
    }
  | { /** The peek's value is private (INT: Test Pieces). */ type: "TEST_PIECES_PEEKED"; playerId: PlayerId; secret: Secret<{ modifier: FireModifier }> }
  | { /** Public: whether the top card was buried. */ type: "TEST_PIECES_USED"; playerId: PlayerId; buried: boolean }
  | { type: "HEAT_MARKER_TURNED"; playerId: PlayerId; ceramicId: CeramicId; value: HeatMarkerValue }
  | { type: "HEAT_MARKER_RETURNED"; playerId: PlayerId; ceramicId: CeramicId }
  | { type: "KILN_MASTER_PLACED"; playerId: PlayerId; ceramicId: CeramicId; value: HeatMarkerValue }
  | { type: "FIRE_REVEALED"; modifier: FireModifier; baseHeat: BaseHeat; globalHeat: number }
  | { type: "FIRE_DECK_RESHUFFLED"; cardCount: number }
  | { type: "ACTUAL_HEAT_CALCULATED"; results: CeramicHeatResult[] }
  | { type: "JUN_ADJUSTED"; playerId: PlayerId; ceramicId: CeramicId; delta: HeatMarkerValue; finalActualHeat: number; during: "first_firing" | "second_firing" }
  | { type: "QUALITY_ASSIGNED"; ceramicId: CeramicId; quality: Quality; heatDifference: number; cause: "fired" | "second_firing" }
  | { type: "QUALITY_IMPROVED"; ceramicId: CeramicId; from: Quality; to: Quality; cause: "protective_saggars" | "ge_crackle" }
  | { type: "SECOND_FIRING_REVEALED"; playerId: PlayerId; ceramicId: CeramicId; modifier: FireModifier; calculation: HeatCalculation }
  | { type: "CRACKLE_APPLIED"; playerId: PlayerId; ceramicId: CeramicId }
  | { type: "CERAMIC_SALVAGED"; playerId: PlayerId; ceramicId: CeramicId; coins: number }
  | { type: "FIRING_FINISHED"; round: RoundNumber; finishedCeramicIds: CeramicId[] }
  // ── Orders ─────────────────────────────────────────────────────────────────────────
  | { type: "ORDER_TURN_STARTED"; playerId: PlayerId }
  | {
      /** The Order is revealed when completed (L410). */
      type: "ORDER_COMPLETED";
      playerId: PlayerId;
      record: CompletedOrderRecord;
    }
  | { type: "ORDER_TURN_ENDED"; playerId: PlayerId; automatic: boolean }
  // ── Cleanup and end ────────────────────────────────────────────────────────────────
  | { type: "WORKERS_RETURNED"; round: RoundNumber }
  | {
      type: "HAND_TRIMMED";
      playerId: PlayerId;
      count: number;
      secret: Secret<{ orderIds: OrderId[] }>;
    }
  | { type: "FIRST_PLAYER_PASSED"; from: PlayerId; to: PlayerId }
  | { type: "FINAL_SCORE_CALCULATED"; result: FinalResult };

export type GameEventType = GameEvent["type"];

/** An event with any private payload removed. */
export type WithoutSecret<E> = E extends unknown ? Omit<E, "secret"> : never;
/** Safe for the public log and realtime payloads. */
export type PublicGameEvent = WithoutSecret<GameEvent>;

// ═══════════════════════════════════════════════════════════════════════════════════════
// 12. Rule errors
// ═══════════════════════════════════════════════════════════════════════════════════════

export type GameRuleErrorCode =
  // General
  | "INVALID_SETUP"
  | "MALFORMED_ACTION"
  | "UNKNOWN_PLAYER"
  | "WRONG_PHASE"
  | "NOT_YOUR_DECISION"
  | "GAME_FINISHED"
  | "STALE_CHOICE"
  /** A well-formed choice that this worker effect or window does not offer (e.g. a Shifu
   * `buy_face_up` at the Guild Hall, an Apprentice `look_top_three`). */
  | "INVALID_CHOICE"
  // Setup
  | "KILN_UNAVAILABLE"
  // Placement (L140–144)
  | "WORKER_UNAVAILABLE"
  | "WORKER_ACTION_ALREADY_TAKEN"
  | "WORKER_ACTION_REQUIRED"
  | "LOCATION_FULL"
  | "PERSONAL_SPACE_LOCKED"
  | "PERSONAL_SPACE_USED"
  | "NO_MAIN_ACTION_POSSIBLE"
  | "NOT_SHIFU_EFFECT"
  | "SENIOR_APPRENTICE_NOT_APPLICABLE"
  // Resources and production
  | "INSUFFICIENT_RESOURCES"
  | "INVALID_RESOURCE_SPLIT"
  | "TOO_MANY_VESSELS"
  | "INVALID_VESSEL_CHOICE"
  | "CERAMIC_NOT_FOUND"
  | "CERAMIC_NOT_OWNED"
  | "ILLEGAL_CERAMIC_STAGE"
  | "DUPLICATE_CERAMIC"
  // Loading (R5)
  | "KILN_SPACE_UNAVAILABLE"
  | "KILN_SPACE_MARKED"
  | "IMPERIAL_KILN_UNAVAILABLE"
  | "INVERTED_FIRING_INVALID"
  | "HEAT_MARKER_INVALID"
  // Orders and market (B1)
  | "ORDER_NOT_AVAILABLE"
  | "ORDER_NOT_HELD"
  | "ORDER_SUPPLY_EMPTY"
  | "RESERVATION_LIMIT"
  | "ORDER_REQUIREMENTS_NOT_MET"
  | "INVALID_CRACKLE_DECLARATION"
  | "HAND_LIMIT_DISCARD_COUNT"
  // Techs and abilities (R4)
  | "TECH_NOT_AVAILABLE"
  | "TECH_LIMIT"
  | "TECH_DISCIPLINE_OWNED"
  | "TECH_NOT_OWNED"
  | "TECH_ALREADY_USED"
  | "INVALID_BOTTOM_ORDER"
  | "KILN_ABILITY_NOT_OWNED"
  | "ABILITY_ALREADY_USED"
  | "INVALID_TARGET"
  // Recognition
  | "RECOGNITION_GATE"
  | "IMPERIAL_PRIORITY_UNAVAILABLE"
  // Contributions (DESIGN §4.2)
  | "NOT_CONTRIBUTOR"
  | "CONTRIBUTION_ALREADY_SUBMITTED"
  | "INVALID_CONTRIBUTION"
  | "PRIVATE_WINDOW_MISMATCH";

/**
 * A typed, user-readable rule failure. `message` is English; the UI localises from `code` +
 * `details` (keys documented per code in the i18n catalogue).
 */
export interface GameRuleError {
  code: GameRuleErrorCode;
  message: string;
  details: Record<string, string | number | boolean>;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 13. Results
// ═══════════════════════════════════════════════════════════════════════════════════════

export interface ExhibitionScore {
  /** Every Finished, undelivered Standard+ ceramic, automatically (L444, INT). */
  ceramicIds: CeramicId[];
  /** Standard 2 / Fine 3 / Masterpiece 5 (L446–450). */
  qualityVp: number;
  /** +3 for ≥3 different Shapes (L452). */
  shapesBonus: 0 | 3;
  /** +3 for ≥3 different Glazes (L452). */
  glazesBonus: 0 | 3;
  total: number;
}

export interface FinalScoreBreakdown {
  /** L492. */
  orders: number;
  kilnAbilities: number;
  recognitionOverflow: number;
  imperialAudience: number;
  /** 1 VP per owned Tech, recorded when gained (A1); the ledger's `techs`. */
  techs: number;
  exhibition: ExhibitionScore;
  /** Connoisseur's Cabinet (T19, L620): +1 per exhibited Fine/Masterpiece, max +5. */
  connoisseur: number;
  /** 1 VP per 3 Coins, max 5 (L494). */
  coins: number;
  total: number;
}

/** Tie-breaker values (L498). */
export interface TieBreakValues {
  recognition: Recognition;
  /** Printed Crowns across completed Orders; Tribute Ware's Crown excluded (R13). */
  printedCrowns: number;
  /** Masterpieces delivered or exhibited. */
  masterpieces: number;
}

export interface FinalStanding {
  playerId: PlayerId;
  rank: number;
  total: number;
  tieBreak: TieBreakValues;
}

export interface FinalResult {
  scores: Record<PlayerId, FinalScoreBreakdown>;
  standings: FinalStanding[];
  winnerIds: PlayerId[];
  /** The criterion that separated the winner(s) from the runner-up. */
  resolvedBy: "total_vp" | "imperial_recognition" | "printed_crowns" | "masterpieces" | "shared_victory";
}

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: GameRuleError };

export type CreateGameResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: GameRuleError };

export type SubmitContributionResult =
  | { ok: true; state: GameState; privateState: PrivateFiringState; events: GameEvent[] }
  | { ok: false; error: GameRuleError };

// ═══════════════════════════════════════════════════════════════════════════════════════
// 14. Content definitions (shapes of `data/*.json` — DESIGN §6)
// ═══════════════════════════════════════════════════════════════════════════════════════

export interface LocalizedText {
  en: string;
  zh: string;
}

/** One ceramic slot of an Order. Single-ceramic Orders put Glaze/Decoration here;
 * multi-ceramic Orders fix only Shapes here and use independent relations (L423). */
export interface OrderSlotDefinition {
  shape?: Shape;
  /** Any one of these Shapes (S14, S15, O14, O15). */
  shapes?: Shape[];
  glaze?: Glaze;
  decoration?: Decoration;
}

/**
 * Independent multi-ceramic requirements (L423), V1.2.7 vocabulary. Every `indices` list
 * must name all slots (content-validated), so relations apply to the whole selection.
 * Decoration relations use each Crackle ceramic's declared Decoration (L470).
 *
 * `same_*`: every listed slot has the same value. `different_*`: every listed slot is
 * pairwise different, exactly as `all_different_*` (never "not all the same"), so
 * `different_decoration` over [0,1,2] means 3 different Decorations (O45, O47; L602, L604).
 * "At least N different" is `at_least_n_distinct_decorations` (O48, L605).
 */
export type OrderRelationDefinition =
  | { type: "same_shape"; indices: number[] }
  | { /** All listed slots pairwise different (same as `all_different_shape`). */ type: "different_shape"; indices: number[] }
  | { type: "all_different_shape"; indices: number[] }
  | { type: "same_glaze"; indices: number[] }
  | { /** All listed slots pairwise different (same as `all_different_glaze`). */ type: "different_glaze"; indices: number[] }
  | { type: "all_different_glaze"; indices: number[] }
  | { type: "same_decoration"; indices: number[] }
  | { /** All listed slots pairwise different: over 3 slots, 3 different Decorations. */ type: "different_decoration"; indices: number[] }
  | { type: "at_least_n_distinct_decorations"; indices: number[]; count: number }
  /** Multiset inclusion: e.g. ["white","moon_white"] = "one White, one Moon White". */
  | { type: "required_glazes"; values: Glaze[] }
  /** Multiset inclusion: ["plain"] = "at least one Plain" (O31). */
  | { type: "required_decorations"; values: Decoration[] }
  /** "≥1 Masterpiece" etc. (O32–O34, O40–O42, O47, O48). */
  | { type: "at_least_n_quality"; quality: Quality; count: number };

export interface OrderDefinition {
  id: OrderId;
  deck: "starting" | "main";
  ceramics: OrderSlotDefinition[];
  relations?: OrderRelationDefinition[];
  /** Minimum Quality for every ceramic. */
  minQuality: Exclude<Quality, "flawed">;
  vp: number;
  coins: number;
  crowns: 0 | 1 | 2 | 3;
  requirements: string;
  /** Song-dynasty workshop register (owner instruction, `GLOSSARY_ZH_V1.6.1.md`). */
  requirementsZh: string;
}

/** When a Tech acts (Appendix D timing vocabulary L687–693 and Appendix B). */
export type TechTiming =
  | "form_decorate_action"
  | "glaze_and_load"
  | "materials_yard_action"
  | "worker_placement"
  | "when_acquired_and_ongoing"
  | "glaze_load_action_after"
  | "loading_shared_kiln"
  | "work_phase_start"
  | "before_or_after_worker_action"
  | "after_quality"
  | "contributions"
  | "after_base_heat"
  | "heat_marker_step"
  | "order_completion"
  | "game_end";

/** Mechanical parameters per Tech, mirrored from the printed text (DESIGN §6.5). */
export interface TechParamsById {
  T01: { clayReduction: number; triggerShapes: Shape[] };
  T16: { coinReduction: number; decorations: Decoration[] };
  T05: Record<string, never>;
  T17: { claySurcharge: number };
  T18: { locations: CentralLocationId[] };
  T19: { vpPerCeramic: number; qualities: Quality[]; maxVp: number };
  T10: { lookSize: number; handLimit: number };
  T20: { clay: number; wood: number };
  T15: { modifiers: KilnFurnitureModifier[] };
  T21: { shapes: Shape[] };
  T22: Record<string, never>;
  T23: Record<string, never>;
  T11: { wood: number };
  T12: { extraWood: number; heat: number };
  T13: { wood: number };
  T14: Record<string, never>;
  T24: { values: HeatMarkerValue[] };
  T25: { bonusCrowns: number };
}

/**
 * One rules clarification shown in a component's rules details (owner decision D10, UI
 * architecture K15), parsed from `docs/KILN_OPENING_v1.6.1_CLARIFICATIONS.md`. Display prose:
 * outside the rules fingerprint (`PROSE_LIST_KEYS`), never read by a rule.
 */
export interface ClarificationDefinition {
  en: string;
  zh: string;
  /**
   * The source label, one or more tags joined by " · ": `L124` (rulebook line), `A1`
   * (amendment), `R1`–`R13` / `B1`–`B3` (owner rulings), `ED L124` (editorial correction),
   * `INT <name>` (recorded interpretation), `P1`–`P3` (provisional ruling), `D7` (owner UI decision).
   */
  source: string;
}

/**
 * Short component text convention (`shortText` / `shortTextZh`, from
 * `docs/KILN_OPENING_v1.6.1_COMPONENT_TEXT_SOURCE.md`): plain text, no Markdown. The timing
 * clause is everything before the first colon (":" or "："); after it, the secondary labels
 * "Ongoing:" / "持续：" and "Orders:" / "完成委托时：" start a second clause. The UI bolds the
 * timing clause and the secondary labels (`shortTextSegments` in `content.ts`).
 */
export interface TechDefinition<Id extends TechId = TechId> {
  id: Id;
  discipline: TechDiscipline;
  cost: number;
  oncePerRound: boolean;
  /**
   * Informational: the tile's usual window, for UI grouping and reminders. No rule reads it;
   * a Tech applies wherever its ability text applies (e.g. T16 also reduces a Decoration
   * paid through Prepared Clay, T17, at the Materials Yard; audit, L616). DESIGN §6.5.
   */
  timing: TechTiming;
  /** Workshop → form_decorate, Glazing & Loading → glaze_load, Firing → null (L376). */
  unlocks: PersonalLocationId | null;
  params: TechParamsById[Id];
  name: string;
  nameZh: string;
  /** Appendix B Ability cell of the English rulebook, verbatim (bold markup removed). */
  ability: string;
  /** The same cell of the Chinese rulebook edition `docs/KILN_OPENING_v1.6.1_ZH.md`. */
  abilityZh: string;
  shortText: string;
  shortTextZh: string;
  /** D10 clarifications for this Tech only. */
  clarifications: ClarificationDefinition[];
}

export interface KilnParamsById {
  RU: { vp: number; glaze: Glaze; decoration: Decoration; quality: Quality };
  GU: { coins: number; vp: number; minPrintedCrowns: number };
  GE: { fromQuality: Quality; toQuality: Quality };
  DI: { shapes: Shape[]; clay: number; coins: number };
  JU: { wood: number; deltas: HeatMarkerValue[] };
}

export interface KilnDefinition<Id extends KilnId = KilnId> {
  id: Id;
  oncePerRound: true;
  params: KilnParamsById[Id];
  name: string;
  nameZh: string;
  abilityName: string;
  abilityNameZh: string;
  /** The Kiln Tradition Abilities section of the English rulebook, paragraphs joined by a space. */
  ability: string;
  /** The same section of the Chinese rulebook edition `docs/KILN_OPENING_v1.6.1_ZH.md`, paragraphs joined. */
  abilityZh: string;
  shortText: string;
  shortTextZh: string;
  /** D10 clarifications for this Kiln only. */
  clarifications: ClarificationDefinition[];
}

/** Printed location effects, mechanical half (DESIGN §6.3). */
export interface LocationEffectsById {
  materials_yard: {
    apprentice: { resources: number };
    shifu: {
      resources: number;
      /** Optional purchase (L163): pay `coins` Coins to gain `clay` Clay and `wood` Wood.
       * `coins` is a cost, never a gain. */
      bonus: { coins: number; clay: number; wood: number };
    };
  };
  form_decorate: {
    apprentice: { maxVessels: number };
    shifu: { maxVessels: number; twoVesselDecorationDiscount: number };
  };
  glaze_load: {
    apprentice: { maxLoads: number; maxImperialLoads: number };
    shifu: { maxLoads: number; maxImperialLoads: number; placesHeatMarker: boolean };
  };
  commission_market: {
    apprentice: { maxReservations: number; gainAfterEach: number };
    shifu: { maxReservations: number; gainAfterEach: number; topThreeLooks: number; lookSize: number };
  };
  guild_hall: {
    apprentice: { discount: number };
    shifu: { inspectCount: number; discount: number };
  };
  canal_wharf: {
    apprentice: { coins: number };
    shifu: { coins: number };
  };
  magistrates_hall: {
    apprentice: { coins: number; recognitionSteps: number };
    shifu: { coins: number; recognitionSteps: number };
  };
}

export interface LocationDefinition<Id extends LocationId = LocationId> {
  id: Id;
  scope: Id extends PersonalLocationId ? "personal" : "central";
  /** Central: capacity by player count, null = uncapped (Canal Wharf). Personal: null. */
  capacity: Record<"2" | "3" | "4", number | null> | null;
  /** Personal locations: 2 spaces, 1 unlocked at start. */
  personalSpaces: { total: number; unlockedAtStart: number } | null;
  /** Magistrate's Hall: usable at Recognition 0–2 (L225, L233). */
  usableAtRecognition: Recognition[] | null;
  effects: LocationEffectsById[Id];
  name: string;
  nameZh: string;
  apprenticeText: string;
  apprenticeTextZh: string;
  shifuText: string;
  shifuTextZh: string;
  /** D10 clarifications for this location only. */
  clarifications: ClarificationDefinition[];
}

export interface GameConfigDefinition {
  rulesVersion: RulesVersion;
  players: { min: 2; max: 4 };
  rounds: 5;
  startingResources: ResourceState;
  workers: { shifu: number; apprentices: number };
  setupDeal: { startingOrders: number; mainOrders: number };
  mainMarket: { displaySize: number; roundStartDiscard: number };
  /** Base hand limit 4 (L200); Colour Samples' 5 lives in its params (T10). */
  handLimit: { base: number };
  techs: {
    perDiscipline: number;
    faceUpPerDiscipline: number;
    maxOwned: number;
    maxPerDiscipline: number;
    /** VP per Advanced Tech, scored when gained (owner amendment A1). */
    vpEach: number;
  };
  sharedKiln: { activeSpacesByPlayerCount: Record<"2" | "3" | "4", KilnSpaceId[]> };
  shapes: Record<Shape, number>;
  shapeSupplyEach: number;
  decorations: Record<Decoration, number>;
  glazes: Record<Glaze, number>;
  coinEndGame: { coinsPerVp: number; maxVp: number };
}

export interface ContributionCardDefinition {
  id: ContributionCardId;
  woodCost: number;
  heat: number;
  name: string;
  nameZh: string;
}

export interface FiringDefinition {
  rulesVersion: RulesVersion;
  kilnSpaces: Array<{ id: KilnSpaceId; zone: KilnZone; modifier: ZoneModifier }>;
  kilnDie: { faces: KilnDieFace[] };
  baseHeat: { minimum: 0; maximum: 5 };
  fireDeck: FireModifier[];
  qualityByHeatDifference: Array<{ maxDifference: number | null; quality: Quality }>;
  contributionCards: ContributionCardDefinition[];
  imperialModifiers: ImperialModifier[];
  salvageCoins: number;
}

export interface ImperialTrackDefinition {
  rulesVersion: RulesVersion;
  track: Array<{
    space: Recognition;
    id: "local_workshop" | "imperial_grant" | "imperial_gift" | "imperial_priority" | "imperial_audience";
    reward:
      | null
      | { kind: "resources"; clay: number; wood: number; coins: number }
      | { kind: "imperial_kiln" }
      | { kind: "imperial_priority" }
      | { kind: "vp"; vp: number };
    title: string;
    titleZh: string;
    rewardText: string | null;
    rewardTextZh: string | null;
    /** D10 clarifications for this milestone (none for Recognition 0). */
    clarifications: ClarificationDefinition[];
  }>;
  overflowVpPerCrown: number;
  /** D10 clarifications for Crowns beyond Recognition 4 (`overflowVpPerCrown`). */
  clarifications: { imperial_overflow: ClarificationDefinition[] };
  exhibition: {
    minimumQuality: Exclude<Quality, "flawed">;
    qualityVp: Record<Exclude<Quality, "flawed">, number>;
    distinctShapes: { threshold: number; vp: number };
    distinctGlazes: { threshold: number; vp: number };
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 15. Randomness and engine-internal module contract (DESIGN §2)
// ═══════════════════════════════════════════════════════════════════════════════════════

/** Every random draw goes through this (DESIGN §7). `SeededRandom` implements it. */
export interface RandomSource {
  nextUint32(): number;
  /** Uniform integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
  getState(): number;
}

/** Points where one phase hands over to the next. Wired by `engine.ts` so phase modules
 * never import each other's openers (no import cycles). */
export type FlowMilestone =
  | "setup_done"
  | "round_start_done"
  | "work_phase_done"
  | "firing_done"
  | "order_phase_done"
  /** Rounds 1–4: First Player passed and round advanced; next is `startRound`. */
  | "cleanup_done"
  /** After Round 5 Cleanup (L305, L490): final scoring. */
  | "game_over";

/**
 * The hand-over points between modules owned by different packages (DESIGN §2.2, §2.5).
 * Modules call these instead of importing each other. `engine.ts` wires the production
 * controller; tests may pass a halting controller through `EngineOptions.flow` so a module
 * can be tested before the module it hands over to exists (DESIGN §8.1).
 */
export interface FlowController {
  continueAfter(milestone: FlowMilestone, draft: GameState, ctx: ResolveContext): void;
  /**
   * Every `work/*` resolver calls this once its worker action, including any sub-steps,
   * has fully resolved. Production wiring: `work/turn.completeWorkerAction`.
   */
  workerActionDone(draft: GameState, playerId: PlayerId, ctx: ResolveContext): void;
}

/** Optional engine settings for tests and development. Production passes nothing. */
export interface EngineOptions {
  /** Replaces the production flow controller (test only). */
  flow?: FlowController;
  /** Run `assertInvariants` after every command. Default false; the engine reads no
   * environment. Test harnesses pass true; the service passes true when its own
   * `KILN_ENGINE_INVARIANTS=1` is set. */
  checkInvariants?: boolean;
}

/** Passed to every resolver. Resolvers mutate `draft` (already a private clone). */
export interface ResolveContext {
  readonly rng: RandomSource;
  readonly events: GameEvent[];
  readonly flow: FlowController;
}

/**
 * One handler per `GameAction["type"]`. `validate` sees only the actor's view and must not
 * mutate it; `resolve` runs only after `validate` returned null.
 */
export interface ActionHandler<A extends GameAction = GameAction> {
  readonly phases: readonly GamePhaseType[];
  validate(view: ActorView, action: A): GameRuleError | null;
  resolve(draft: GameState, actorId: PlayerId, action: A, ctx: ResolveContext): void;
}

export type ActionHandlerTable = {
  readonly [K in GameActionType]: ActionHandler<Extract<GameAction, { type: K }>>;
};

// ═══════════════════════════════════════════════════════════════════════════════════════
// 16. Legal actions and UI view models (DESIGN §5)
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * `canonical`: one representative per strategically distinct choice (equivalent vessels and
 * kiln spaces collapsed; each optional ability both used and declined; DESIGN §5.2).
 * `exhaustive`: every distinct legal command (lazy; very large for Glaze & Load, so only
 * ever consumed with a limit).
 */
export type LegalActionMode = "canonical" | "exhaustive";

export interface LegalActionOptions {
  mode: LegalActionMode;
  /** Stop after this many actions in total (enumeration order is deterministic). */
  limit?: number;
  /**
   * Stop each action family after this many candidates, so one large family (Glaze & Load
   * pairs) cannot crowd out the others. Default: 64 in `canonical`, unlimited in
   * `exhaustive`.
   */
  perFamilyLimit?: number;
}

/**
 * How the current actors may act:
 * - `single`: exactly one actor (a queue head, the active player, …);
 * - `parallel`: several actors, independent public choices in any order
 *   (`firing_salvage`, `cleanup_hand_limit`);
 * - `simultaneous_secret`: the Contribution window; choices sealed until all submit.
 */
export type DecisionMode = "single" | "parallel" | "simultaneous_secret";

/** Who must act now (DESIGN §3.4). Exported from the barrel for the client and the service. */
export interface DecisionPrompt {
  phaseType: GamePhaseType;
  actorIds: PlayerId[];
  mode: DecisionMode;
}

export type CostLineKind =
  | "shape_clay"
  | "decoration"
  | "shifu_decoration_discount"
  | "decorators_kit"
  | "large_throwing_wheel"
  | "ding_extra"
  | "prepared_clay_surcharge"
  | "tech_price"
  | "guild_shifu_discount"
  | "magistrates_hall"
  | "wood";

export interface CostLine {
  kind: CostLineKind;
  resource: ResourceKind;
  /** Positive = pay, negative = discount. */
  amount: number;
  /** Index into the command's vessels/loads when the line belongs to one item. */
  itemIndex: number | null;
}

export interface CostQuote {
  ok: boolean;
  error: GameRuleError | null;
  pay: ResourceState;
  gain: ResourceState;
  lines: CostLine[];
}

/**
 * One way to place a worker at a location. Legality can differ by effect (e.g. the Guild
 * Hall Shifu price after its discount, L213), so the UI never recomputes it.
 */
export interface PlacementWorkerOption {
  /** The worker the command would name: the Shifu, or the lowest-ID available Apprentice. */
  workerId: WorkerId;
  kind: WorkerKind;
  effect: WorkerEffect;
  /** An Apprentice resolving the Shifu effect through Senior Apprentice (T18, L619, R12). */
  seniorApprentice: boolean;
  legal: boolean;
  reason: GameRuleErrorCode | null;
  /** The validator's error behind `reason`, with its details (e.g. the Magistrate's Hall
   * Coins), for `formatRuleError`; null when legal (§5 gap 12). */
  error: GameRuleError | null;
}

export interface PlacementOption {
  locationId: LocationId;
  /** True if any entry of `workers` is legal. */
  legal: boolean;
  /** When nothing is legal: the location-level reason (capacity, lock, used space, …). */
  reason: GameRuleErrorCode | null;
  /** Workers that may be placed here now (Shifu and/or Apprentices). */
  workerIds: WorkerId[];
  /** Shifu, Apprentice and (when offered) Apprentice-via-Senior-Apprentice entries. */
  workers: PlacementWorkerOption[];
  /** Senior Apprentice is usable here now: T18 ready, this location in its params, and an
   * Apprentice available (L619). Never at the Magistrate's Hall (R12). */
  seniorApprentice: boolean;
  occupancy: number;
  capacity: number | null;
  /** Personal locations: the space index the next placement would use. */
  nextSpaceIndex: number | null;
}

export interface LoadDestinationOption {
  destination: LoadSpec["destination"];
  /** Printed zone modifier, or the chosen Imperial/Kiln Furniture modifier. */
  modifier: number;
  requiresInvertedFiring: boolean;
  returnsSettersMark: boolean;
}

/** One complete, legal way to complete a held Order (Order Phase or Canal Barge). */
export interface OrderMatchOption {
  orderId: OrderId;
  ceramicIds: CeramicId[];
  /** The declarations that would be recorded (L470); `[]` when no Crackle ceramic is used. */
  crackleDeclarations: CrackleDeclaration[];
  vp: number;
  coins: number;
  printedCrowns: number;
  /** Optional effects this completion would trigger if not declined (R4, R6, R13). */
  triggers: { ru: boolean; guan: boolean; tributeWare: boolean };
}

/**
 * Live check of an Order picker's current selection (`orderSelectionCheck`, DESIGN §5.4).
 * It runs the same matcher as the validator, so the picker never re-implements Order rules.
 */
export type OrderSelectionCheck =
  | { ok: true; match: OrderMatchOption }
  | {
      ok: false;
      error: GameRuleError;
      /** Adding more of your eligible Finished ceramics could still complete the Order. */
      extendable: boolean;
    };

/** Per-ceramic firing preview for the UI heat ladder (public information only). */
export interface HeatPreview {
  ceramicId: CeramicId;
  preferredHeat: number;
  /** Actual Heat before the Fire card, when Base Heat and markers are known. */
  heatBeforeFire: number | null;
  qualityByFire: Record<"-2" | "-1" | "0" | "1" | "2", Quality> | null;
}

export interface ScorePreview {
  playerId: PlayerId;
  /** What the player would score if the game ended now (public information only). */
  breakdown: FinalScoreBreakdown;
}

// ── Step-wise option selectors (DESIGN §5.4). All derive from validators; none is a rule. ──

export interface KilnSelectionOption {
  kilnId: KilnId;
  available: boolean;
  chosenBy: PlayerId | null;
}

/** Commission Market choices for a given worker effect, at placement or in the sub-step. */
export interface CommissionOptions {
  effect: WorkerEffect;
  /** Display positions holding an Order that may be reserved now (L191, L199). */
  faceUpSlots: number[];
  /** A blind reservation needs a card in the deck after any reshuffle (B1). */
  blind: boolean;
  /** Shifu effect only, once per action (L197). */
  lookTopThree: boolean;
  /** In the sub-step: `COMMISSION_GAIN` is due now. */
  gainNow: boolean;
  /** In the sub-step: `COMMISSION_STOP` is allowed (≥1 reservation made, L199). */
  canStop: boolean;
  maxReservations: 1 | 2;
  reservationsMade: 0 | 1 | 2;
}

/** A private top-3 look awaiting its choice (Commission Shifu or Colour Samples). */
export interface LookedOrderOptions {
  kind: "commission_top_three" | "colour_samples";
  /** From `own.pendingLook`: reserve 1; the rest go face down to the discard (L197, L626). */
  orderIds: OrderId[];
}

export interface GuildTechOption {
  techId: TechId;
  discipline: TechDiscipline;
  source: "face_up" | "inspected";
  printedCost: number;
  /** Price after the Shifu discount (−1, minimum 0) when the effect is `shifu` (L208). */
  price: number;
  legal: boolean;
  /** e.g. `TECH_DISCIPLINE_OWNED`, `TECH_LIMIT`, `INSUFFICIENT_RESOURCES`. */
  reason: GameRuleErrorCode | null;
}

/** Guild Hall choices at placement time for a given worker effect. */
export interface GuildOptions {
  effect: WorkerEffect;
  /** Apprentice: Techs to buy now. Shifu: the face-up Techs it could take after inspecting. */
  faceUp: GuildTechOption[];
  /** Shifu only: any discipline, including an owned one (B2), with its public deck count. */
  inspect: Array<{ discipline: TechDiscipline; deckCount: number }>;
}

/** Guild Hall Shifu after inspecting (`guild_inspection` step; private to the actor). */
export interface GuildInspectionOptions {
  discipline: TechDiscipline;
  inspected: GuildTechOption[];
  faceUp: GuildTechOption[];
  /** Required `GUILD_TAKE.bottomOrder` length: every inspected Tech not taken (B2). */
  bottomOrderLengthIfInspectedTaken: number;
  bottomOrderLengthIfFaceUpTaken: number;
}

export interface TestPiecesOptions {
  awaiting: "decision" | "bury";
  woodCost: number;
  canPeek: boolean;
  /** Your private peek, once made (from `own.firePeek`). */
  peekedModifier: FireModifier | null;
}

export interface ContributionOption {
  command: SubmitContributionCommand;
  /** Card Wood plus Fuel Ledger's extra Wood (L638). */
  woodCost: number;
  heat: ContributionHeat;
  affordable: boolean;
}

export interface HeatMarkerStepOptions {
  /** Your face-down marker's ceramic; when set, `ownMarker` is required. */
  ownMarkerCeramicId: CeramicId | null;
  /** Kiln Master (T24), if owned: eligible ceramics as things stand, and if your own marker
   * is returned first (INT: Heat-marker step). */
  kilnMaster: { ready: boolean; targets: CeramicId[]; targetsIfOwnReturned: CeramicId[] } | null;
}

export interface JunOptions {
  during: "first_firing" | "second_firing";
  ready: boolean;
  woodCost: number;
  ceramicIds: CeramicId[];
}

export type AfterQualityAbility = "protective_saggars" | "second_firing" | "ge_crackle";

export interface AfterQualityOption {
  ability: AfterQualityAbility;
  /** Your eligible ceramics from this firing at this moment (rechecked after each use). */
  ceramicIds: CeramicId[];
  cost: ResourceState;
}

export interface SalvageOptions {
  ceramicIds: CeramicId[];
  coins: number;
}

// ── Board and player view models (DESIGN §5.4). Public information only. ──────────────

export interface LocationOccupant {
  playerId: PlayerId;
  workerId: WorkerId;
  kind: WorkerKind;
  effect: WorkerEffect;
  viaSeniorApprentice: boolean;
  spaceIndex: number;
  /** Placement order this round (meeple order on the board). */
  sequence: number;
}

export interface CentralLocationView {
  locationId: CentralLocationId;
  capacity: number | null;
  /** In placement order. */
  occupants: LocationOccupant[];
  /** Magistrate's Hall: Recognition values at which it may be used (L225); else null. */
  usableAtRecognition: Recognition[] | null;
}

export interface PersonalSpaceView {
  locationId: PersonalLocationId;
  spaceIndex: PersonalSpaceIndex;
  /** Internal name; player-facing text says a space is "added", never (un)locked (D7). */
  unlocked: boolean;
  occupant: LocationOccupant | null;
  /** The owned Tech whose `unlocks` added this space ("Added by ⟨Tech⟩", D7); null for the
   * space every board starts with and for a space not yet added (§5 gap 11). */
  addedByTechId: TechId | null;
}

export interface KilnSpaceView {
  spaceId: KilnSpaceId;
  zone: KilnZone;
  zoneModifier: ZoneModifier;
  active: boolean;
  /** Loading order; 2 only when stacked (R8). */
  ceramics: LoadedCeramic[];
  setterMarkOwnerId: PlayerId | null;
  kilnFurniture: SharedKilnSpaceState["kilnFurniture"];
  /** The modifier the ceramics here use: Kiln Furniture's, else the zone's (R8). */
  effectiveModifier: number;
}

export interface BoardView {
  round: RoundNumber;
  prompt: DecisionPrompt;
  firstPlayerId: PlayerId;
  /** First Player, then clockwise. */
  turnOrder: PlayerId[];
  kilnDie: KilnDieRoll | null;
  /** In `CENTRAL_LOCATION_IDS` order. */
  centralLocations: CentralLocationView[];
  /** In `KILN_SPACE_IDS` order. */
  kilnSpaces: KilnSpaceView[];
  mainDisplay: Array<OrderId | null>;
  /** In `DISCIPLINES` order. */
  techDisplay: Array<{ discipline: TechDiscipline; techIds: TechId[]; deckCount: number }>;
  counts: PublicCounts;
  fireDiscard: FireModifier[];
  /** The current firing, else the most recent one (for the recap). */
  firing: FiringContext | null;
}

export interface TechStatus {
  techId: TechId;
  discipline: TechDiscipline;
  oncePerRound: boolean;
  /** Owned and its once-per-round use unspent (always true without a per-round limit). */
  ready: boolean;
}

export interface PlayerSummary {
  playerId: PlayerId;
  displayName: string;
  seatIndex: number;
  isFirstPlayer: boolean;
  kilnId: KilnId | null;
  kilnAbilityReady: boolean;
  resources: ResourceState;
  /** Sum of `recorded` (L492), including Tech VP (A1). End-game VP is in `scorePreview`. */
  recordedVp: number;
  recorded: ScoreLedger;
  techs: TechStatus[];
  /** Available workers, Shifu first, then Apprentices by ID. */
  availableWorkerIds: WorkerId[];
  personalSpaces: PersonalSpaceView[];
  recognition: Recognition;
  imperial: {
    kilnGained: boolean;
    /** This firing's Imperial Kiln ceramic, with its public modifier (R11). */
    kilnCeramic: LoadedCeramic | null;
    priority: ImperialState["priority"];
    /** Imperial Priority may be used right now (before/after-action window). */
    priorityUsableNow: boolean;
  };
  /** The ceramic carrying your own Heat marker; the one carrying Kiln Master's marker. */
  heatMarkerCeramicId: CeramicId | null;
  kilnMasterCeramicId: CeramicId | null;
  orderHandCount: number;
  handLimit: number;
  /** Ceramic IDs by stage, in sequence order. */
  shapedCeramicIds: CeramicId[];
  loadedCeramicIds: CeramicId[];
  finishedCeramicIds: CeramicId[];
  completedOrders: CompletedOrderRecord[];
}

// ── Production UI additions (UI_V1.6.1_ARCHITECTURE.md §5, DESIGN §5.4). ─────────────────
// Additive view models and option lists. Every one is derived from the validators or from
// public state; none is a rule, and none carries a heat calculation, a preview or the
// Fire-deck count (owner decisions D3, D4).

/** Held Orders against the Cleanup hand limit (L200, L304; `handLimitStatus`, §5 gap 3). */
export interface HandLimitStatus {
  held: number;
  /** 4, or 5 with Colour Samples. */
  limit: number;
  mustDiscard: number;
  /** A Cleanup trim would be due: Rounds 1–4 only (Round 5 skips it, INT) and
   * `mustDiscard > 0`. The same predicate as Cleanup (`isFinalRound`). */
  trimDue: boolean;
}

/** The Shared Kiln cover for this player count (L100; `kilnLayout`, §5 gap 5). All lists in
 * `KILN_SPACE_IDS` order. Layout only: the UI's row order (owner decision D8) is presentation. */
export interface KilnLayoutView {
  activeSpaceIds: KilnSpaceId[];
  coveredSpaceIds: KilnSpaceId[];
  /** Active spaces holding no ceramic. A Setter's Mark does not fill a space. */
  emptyActiveSpaceIds: KilnSpaceId[];
}

/** Appendix D firing steps (L670–693): 1 Contributions … 12 Finish. */
export type FiringStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** One Contribution participant (L261) on the firing stage. */
export interface FiringStageContribution {
  playerId: PlayerId;
  /** null until every Contribution is revealed together (step 2, L673). */
  revealed: { card: ContributionCardId; heat: ContributionHeat; woodPaid: number } | null;
}

/** One ceramic of the firing as the table shows it: position, marker and the recorded result. */
export interface FiringStageCeramic {
  id: CeramicId;
  ownerId: PlayerId;
  kiln: "shared" | "imperial";
  spaceId: KilnSpaceId | null;
  /** The Heat marker on the ceramic while it is loaded (face down, or turned with its value);
   * null without a marker and once the markers are removed (step 12). */
  marker: CeramicHeatMarker | null;
  /** Recorded from step 9 on (L274–279); null before. */
  quality: Quality | null;
  /** Ge Crackle applied this firing (L468). */
  crackle: boolean;
  /** Discarded in step 11 (L281). */
  salvaged: boolean;
  /** Second Firing's extra Fire card (T14, L640); null when not second-fired. */
  secondFireModifier: FireModifier | null;
}

/**
 * The firing as the physical table shows it (`firingStageView` / `firingRecapView`, §5 gaps 7
 * and 18; owner decisions D3, D4): the step, the Kiln Die, the Contributions once revealed,
 * Base Heat, the Fire card once turned, Global Heat, the open Fire discard, each ceramic's
 * position, marker and recorded Quality.
 *
 * Deliberately absent (D3, D4): Actual Heat, heat sources, Heat Differences, Quality
 * previews, before-Fire predictions and the Fire-deck count. A key allow-list test fails on
 * any new key until it is reviewed against D3.
 */
export interface FiringStageView {
  round: RoundNumber;
  /** The Appendix D step now open (1, 4, 5, 8, 10 or 11), or 12 for a finished firing. */
  step: FiringStep;
  /** The Appendix D steps resolved in First Player order (4, 5, 8, 10), for the step rail. */
  firstPlayerOrder: FiringStep[];
  /** The decision queue of a queued step (4, 5, 8, 10), else null. */
  queue: { actorIds: PlayerId[]; index: number } | null;
  /** Who has submitted a Contribution (public; never what, until the reveal). */
  submittedPlayerIds: PlayerId[];
  kilnDie: KilnDieFace;
  /** Contribution participants in First Player order; empty when nobody has a ceramic in the
   * Shared Kiln (INT: Base Heat = Kiln Die). */
  contributions: FiringStageContribution[];
  /** After the 0–5 clamp (L249); null until step 3. */
  baseHeat: BaseHeat | null;
  /** The round's Fire card once revealed (step 6); null before. */
  fireModifier: FireModifier | null;
  /** Base Heat + Fire, unclamped (L249); null before step 6. */
  globalHeat: number | null;
  /** The open Fire discard, oldest first (L512): the only Fire-deck information (D4). */
  fireDiscard: FireModifier[];
  /** Public Test Pieces records: who paid and peeked, and whether they buried (never the card). */
  testPieces: TestPiecesRecord[];
  /** Second Firing's extra Fire card while the R7 Jun window is open; else null. */
  extraFire: { playerId: PlayerId; ceramicId: CeramicId; modifier: FireModifier } | null;
  /** In ceramic sequence order. */
  ceramics: FiringStageCeramic[];
}

/** One Decoration a selected Crackle ceramic could declare (L470), or none. */
export interface CrackleDeclarationOption {
  /** null = left undeclared: the ceramic counts with its printed Decoration. */
  decoration: Decoration | null;
  /** `orderSelectionCheck` with this ceramic's declaration replaced and the others as given. */
  check: OrderSelectionCheck;
}

/** `crackleDeclarationChecks` (§5 gap 8): validator verdicts for a Crackle declaration picker. */
export interface CrackleDeclarationChecks {
  orderId: OrderId;
  ceramicIds: CeramicId[];
  /** Declarations omitted: the engine searches (the picker's explicit "auto" mode). */
  auto: OrderSelectionCheck;
  /** The declarations exactly as given. */
  declared: OrderSelectionCheck;
  /** One entry per selected Crackle ceramic, in selection order. */
  ceramics: Array<{ ceramicId: CeramicId; printedDecoration: Decoration; options: CrackleDeclarationOption[] }>;
}

/** A row of the final score table (L492–494), in `SCORE_BREAKDOWN_ROWS` order. */
export type ScoreBreakdownRow = keyof FinalScoreBreakdown;

/** One tie-breaker (L498), in `TIE_BREAK_ORDER` order. */
export interface TieBreakStep {
  /** The `TieBreakValues` field it compares (higher wins). */
  key: keyof TieBreakValues;
  /** The `FinalResult.resolvedBy` value when this tie-breaker separates the winner. */
  resolvedBy: Exclude<FinalResult["resolvedBy"], "total_vp" | "shared_victory">;
}

/** `placementLimits` (§5 gap 10): the printed effect record of one location and worker effect. */
export type PlacementLimits<L extends LocationId = LocationId, E extends WorkerEffect = WorkerEffect> = LocationEffectsById[L][E];

/** Materials Yard choices for one worker option (L160–163, L618, L350; §5 gap 14). */
export interface MaterialsYardOptions {
  /** Resources split freely between Clay and Wood: 3 (Apprentice effect) or 4 (Shifu effect). */
  resources: number;
  /** The Shifu effect's optional purchase (L163), quoted (`ok` = affordable); null for the
   * Apprentice effect. */
  shifuBonus: CostQuote | null;
  /**
   * Prepared Clay (T17, L618) for this worker option. null for a Senior Apprentice placement
   * (both Form & Decorate Techs, L211, L350) or when T17 is not owned and ready.
   * - `pairs`: every Shape + Decoration combination some legal command names (some Clay/Wood
   *   split, with or without the Shifu bonus; see `withShifuBonus`), in Shape then Decoration
   *   order. Legality belongs
   *   to the pair: the Shape's Clay (which the split and bonus supply) and the Decoration's
   *   Coins (which the bonus also spends) compete, so a form offers a Decoration per chosen
   *   Shape from `pairs`, never the cross product of `shapes` and `decorations`.
   * - `shapes` / `decorations`: the projections of `pairs` (each value in some legal pair).
   * The full draft (split, bonus and pair together) is still gated by `quoteMaterialsYard`.
   */
  preparedClay: { shapes: Shape[]; decorations: Decoration[]; pairs: PreparedClayPair[] } | null;
}

/** One legal Prepared Clay choice (T17, L618; §5 gap 14). */
export interface PreparedClayPair {
  shape: Shape;
  decoration: Decoration;
  /**
   * Whether this pair is also legal together with the Shifu effect's 1-Coin bonus (L163) for
   * some split. false for the Apprentice effect, and when the bonus Coin would leave too few
   * Coins for the Decoration: a form then offers the pair or the bonus, not both.
   */
  withShifuBonus: boolean;
}

/** One Shaped vessel a Glaze & Load load may name after `earlierLoads` (L177–185; §5 gap 15). */
export interface GlazeLoadVesselOption {
  ceramicId: CeramicId;
  /** Glazes it may take (free choice, L344); empty when it has no legal destination. */
  glazes: Glaze[];
  /** Reworking Table Shapes (T05, L617) with a legal destination; empty unless T05 is ready and
   * no earlier load of this action was reworked. */
  reworkShapes: Shape[];
}

/** One Shaped vessel Imperial Priority may load (L293, R10, DESIGN §11 Q1; §5 gap 16). */
export interface ImperialPriorityCeramicOption {
  ceramicId: CeramicId;
  glazes: Glaze[];
  imperialModifiers: ImperialModifier[];
  /** Reworking Table Shapes; empty unless T05 is ready. */
  reworkShapes: Shape[];
}

export interface ImperialPriorityOptions {
  usable: boolean;
  ceramicIds: CeramicId[];
  ceramics: ImperialPriorityCeramicOption[];
}

/** The five round phases of `data/round_structure.json` (L114–132). */
export type RoundPhaseId = "start" | "work" | "firing" | "orders" | "cleanup";

export interface RoundPhaseDefinition {
  order: number;
  id: RoundPhaseId;
  name: string;
  nameZh: string;
  summary: string;
  summaryZh: string;
}

/** `data/round_structure.json`: display text only, never a rules-fingerprint input (§5 gap 17). */
export interface RoundStructureDefinition {
  rulesVersion: RulesVersion;
  roundCount: number;
  phases: RoundPhaseDefinition[];
}
