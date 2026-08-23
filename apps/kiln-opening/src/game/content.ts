import actionLocationsJson from "../../data/action_locations.json" with { type: "json" };
import componentsJson from "../../data/components.json" with { type: "json" };
import firingJson from "../../data/firing.json" with { type: "json" };
import gameConfigJson from "../../data/game_config.json" with { type: "json" };
import imperialProgressJson from "../../data/imperial_progress.json" with { type: "json" };
import kilnsJson from "../../data/kilns.json" with { type: "json" };
import ordersJson from "../../data/orders.json" with { type: "json" };
import techniquesJson from "../../data/techniques.json" with { type: "json" };
import type {
  ContributionCardId,
  Decoration,
  FireModifier,
  Glaze,
  KilnId,
  KilnSpaceId,
  LocationId,
  OrderId,
  PlayerCount,
  Quality,
  Shape,
  TechniqueDiscipline,
  TechniqueId,
} from "./types.ts";

interface GameConfigDefinition {
  rulesVersion: "1.1.5";
  players: { min: number; max: number };
  rounds: number;
  startingResources: { clay: number; wood: number; coins: number };
  workers: {
    shifu: number;
    apprenticesTotal: number;
    apprenticesStarting: number;
    apprenticeUnlockProgress: number[];
  };
  orderDisplay: {
    market: number;
    imperial: number;
    baseHandLimit: number;
  };
  techniques: { maxOwned: number; faceUpPerDiscipline: number };
  kiln: {
    spaces: Record<"high" | "middle" | "low", number>;
    zoneModifier: Record<"high" | "middle" | "low", number>;
    activeSpacesByPlayerCount: Record<"2" | "3" | "4", KilnSpaceId[]>;
  };
  fireDeck: Record<"-2" | "-1" | "0" | "1" | "2", number>;
  glazes: Record<Glaze, number>;
  decorations: Record<Decoration, number>;
  shapes: Record<Shape, number>;
  shapeSupplyEach: number;
  imperialProgressEndGameVp: [number, number, number, number, number, number];
  imperialSealVp: number;
  coinEndGame: { coinsPerVp: number; maxVp: number };
}

interface LocationDefinition {
  id: LocationId;
  name: string;
  nameZh: string;
  apprentice: string;
  apprenticeZh: string;
  shifu: string;
  shifuZh: string;
  capacity: Record<"2" | "3" | "4", number>;
}

export interface OrderRequirementDefinition {
  shape?: Shape;
  shapes?: Shape[];
  glaze?: Glaze;
  glazes?: Glaze[];
  decoration?: Decoration;
}

export interface OrderDefinition {
  id: OrderId;
  ceramics: OrderRequirementDefinition[];
  relations?: OrderRelationDefinition[];
  minQuality: Quality;
  vp: number;
  coins: number;
  imperialProgressReward?: 1 | 2 | 3;
}

export type OrderRelationDefinition =
  | { type: "same_glaze"; indices: number[] }
  | { type: "same_shape"; indices: number[] }
  | { type: "different_glaze"; indices: number[] }
  | { type: "all_different_glaze"; indices: number[] }
  | { type: "different_shape"; indices: number[] }
  | { type: "all_different_shape"; indices: number[] }
  | { type: "same_decoration"; indices: number[] }
  | { type: "different_decoration"; indices: number[] }
  | { type: "at_least_n_quality"; quality: Quality; count: number }
  | { type: "at_least_n_distinct_glazes"; indices: number[]; count: number }
  | { type: "glaze_categories"; indices: number[]; categories: Glaze[][] };

export interface TechniqueDefinition {
  id: TechniqueId;
  discipline: TechniqueDiscipline;
  name: string;
  nameZh: string;
  cost: number;
  ability: string;
  abilityZh: string;
  oncePerRound: boolean;
}

export interface ContributionCardDefinition {
  id: ContributionCardId;
  name: string;
  nameZh: string;
  woodCost: number;
  heatAdjustment: number;
  meaning: string;
  meaningZh: string;
}

interface FiringDefinition {
  rulesVersion: "1.1.5";
  kilnSpaces: Array<{ id: KilnSpaceId; zone: "high" | "middle" | "low"; modifier: -1 | 0 | 1 }>;
  fireDeck: FireModifier[];
  contributionCards: ContributionCardDefinition[];
  baseHeatRule: { formula: string; start: number; minimum: number; maximum: number; contributors: string };
}

interface ComponentDefinition {
  name: string;
  qty: number | string;
}

export interface KilnDefinition {
  id: KilnId;
  name: string;
  nameZh: string;
  abilityName: string;
  abilityNameZh: string;
  ability: string;
  abilityZh: string;
}

export const GAME_CONFIG = gameConfigJson as unknown as GameConfigDefinition;
const ACTION_LOCATION_FILE = actionLocationsJson as unknown as {
  rulesVersion: "1.1.5";
  locations: LocationDefinition[];
};
const ORDER_FILE = ordersJson as unknown as {
  market: OrderDefinition[];
  imperial: OrderDefinition[];
};
const TECHNIQUE_FILE = techniquesJson as unknown as TechniqueDefinition[];
const FIRING_FILE = firingJson as unknown as FiringDefinition;
const COMPONENT_FILE = componentsJson as unknown as {
  rulesVersion: "1.1.5";
  components: ComponentDefinition[];
};

export const LOCATION_IDS: readonly LocationId[] = [
  "materials_yard",
  "forming_studio",
  "glaze_workshop",
  "kiln_yard",
  "market_imperial_office",
  "guild_academy",
  "labour",
  "court_patronage",
];

export const SHAPES: readonly Shape[] = ["bowl", "plate", "washer", "vase", "censer"];
export const GLAZES: readonly Glaze[] = ["white", "celadon", "grey_green", "moon_white"];
export const DECORATIONS: readonly Decoration[] = ["plain", "carved", "impressed", "crackle"];
export const DISCIPLINES: readonly TechniqueDiscipline[] = ["forming", "glazing", "firing"];
export const KILN_DEFINITIONS = Object.fromEntries(
  (kilnsJson as unknown as KilnDefinition[]).map((kiln) => [kiln.id, kiln]),
) as Record<KilnId, KilnDefinition>;
export const KILN_IDS = Object.keys(KILN_DEFINITIONS) as KilnId[];
export const KILN_SPACE_IDS = FIRING_FILE.kilnSpaces.map((space) => space.id);

export const LOCATION_DEFINITIONS = Object.fromEntries(
  ACTION_LOCATION_FILE.locations.map((location) => [location.id, location]),
) as Record<LocationId, LocationDefinition>;

export const MARKET_ORDERS = ORDER_FILE.market;
export const IMPERIAL_ORDERS = ORDER_FILE.imperial;
export const ORDER_DEFINITIONS = Object.fromEntries(
  [...MARKET_ORDERS, ...IMPERIAL_ORDERS].map((order) => [order.id, order]),
) as Record<OrderId, OrderDefinition>;

export const TECHNIQUES = TECHNIQUE_FILE;
export const TECHNIQUE_DEFINITIONS = Object.fromEntries(
  TECHNIQUE_FILE.map((technique) => [technique.id, technique]),
) as Record<TechniqueId, TechniqueDefinition>;

export const FIRE_CARDS = FIRING_FILE.fireDeck;
export const KILN_SPACE_DEFINITIONS = Object.fromEntries(
  FIRING_FILE.kilnSpaces.map((space) => [space.id, space]),
) as Record<KilnSpaceId, FiringDefinition["kilnSpaces"][number]>;
export const SHAPE_COSTS = GAME_CONFIG.shapes;
export const DECORATION_COSTS = GAME_CONFIG.decorations;

export interface ImperialProgressDefinition {
  rulesVersion: "1.1.5";
  track: Array<{
    space: number;
    title: string;
    titleZh: string;
    reward: string | null;
    rewardZh: string | null;
    endGameVp: number;
    unlocksApprentice: boolean;
  }>;
  imperialSealVp: number;
  exhibition: {
    capacityByProgress: [number, number, number, number, number, number];
    diversityEligibleSpaces: number[];
    minimumQuality: Quality;
    qualityVp: Record<"standard" | "fine" | "masterpiece", number>;
    threeDifferentShapesBonus: number;
    threeDifferentGlazesBonus: number;
    flawedEligible: boolean;
    emptyExhibitionPenalty: number;
  };
}

export const IMPERIAL_PROGRESS = imperialProgressJson as unknown as ImperialProgressDefinition;

/** The three v1.1.4 Contribution cards, in Bank / Tend / Stoke order. */
export const CONTRIBUTION_CARDS: readonly ContributionCardDefinition[] = FIRING_FILE.contributionCards;

export const CONTRIBUTION_CARD_DEFINITIONS = Object.fromEntries(
  CONTRIBUTION_CARDS.map((card) => [card.id, card]),
) as Record<ContributionCardId, ContributionCardDefinition>;

export const CONTRIBUTION_CARD_IDS: readonly ContributionCardId[] =
  CONTRIBUTION_CARDS.map((card) => card.id);

/** Where Base Heat starts before any Contribution card is applied. */
export const BASE_HEAT_START = FIRING_FILE.baseHeatRule.start;

export function locationCapacity(locationId: LocationId, playerCount: PlayerCount): number {
  return LOCATION_DEFINITIONS[locationId].capacity[String(playerCount) as "2" | "3" | "4"];
}

export function activeKilnSpaceIds(playerCount: PlayerCount): KilnSpaceId[] {
  return [...GAME_CONFIG.kiln.activeSpacesByPlayerCount[String(playerCount) as "2" | "3" | "4"]];
}

function componentQuantity(name: string): number {
  const component = COMPONENT_FILE.components.find((entry) => entry.name === name);
  if (component === undefined || typeof component.qty !== "number") {
    throw new Error(`Missing numeric component quantity for ${name}`);
  }
  return component.qty;
}

export const COMMON_SUPPLY = {
  clay: componentQuantity("Clay"),
  wood: componentQuantity("Wood"),
  coins: componentQuantity("Coins"),
};

function validateContent(): void {
  if (
    GAME_CONFIG.rulesVersion !== "1.1.5" ||
    ACTION_LOCATION_FILE.rulesVersion !== "1.1.5" ||
    FIRING_FILE.rulesVersion !== "1.1.5" ||
    COMPONENT_FILE.rulesVersion !== "1.1.5" ||
    IMPERIAL_PROGRESS.rulesVersion !== "1.1.5"
  ) {
    throw new Error("Rules content version mismatch");
  }
  const actualLocationIds = new Set(ACTION_LOCATION_FILE.locations.map((location) => location.id));
  if (
    ACTION_LOCATION_FILE.locations.length !== 8 ||
    new Set(LOCATION_IDS).size !== 8 ||
    LOCATION_IDS.some((locationId) => !actualLocationIds.has(locationId))
  ) {
    throw new Error("Expected exactly six action locations");
  }
  if (MARKET_ORDERS.length !== 30 || IMPERIAL_ORDERS.length !== 22) {
    throw new Error("Order deck size mismatch");
  }
  if (
    MARKET_ORDERS.some((order) => order.imperialProgressReward !== undefined) ||
    IMPERIAL_ORDERS.some((order) => order.imperialProgressReward === undefined)
  ) {
    throw new Error("Imperial Order progress rewards mismatch");
  }
  if (TECHNIQUES.length !== 15 || KILN_IDS.length !== 5 || KILN_SPACE_IDS.length !== 7) {
    throw new Error("Technique, Kiln, or kiln-space count mismatch");
  }
  if (new Set([...MARKET_ORDERS, ...IMPERIAL_ORDERS].map((order) => order.id)).size !== 52) {
    throw new Error("Order IDs must be unique");
  }
  if (new Set(TECHNIQUES.map((technique) => technique.id)).size !== 15) {
    throw new Error("Technique IDs must be unique");
  }
  for (const modifier of [-2, -1, 0, 1, 2] as const) {
    const configured = GAME_CONFIG.fireDeck[String(modifier) as keyof GameConfigDefinition["fireDeck"]];
    const actual = FIRE_CARDS.filter((card) => card === modifier).length;
    if (configured !== actual) throw new Error(`Fire card count mismatch for ${modifier}`);
  }
  if (FIRE_CARDS.length !== 12) throw new Error("Fire deck must contain exactly 12 cards");
}

validateContent();
