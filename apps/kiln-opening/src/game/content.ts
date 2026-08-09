import actionLocationsJson from "../../data/action_locations.json" with { type: "json" };
import componentsJson from "../../data/components.json" with { type: "json" };
import firingJson from "../../data/firing.json" with { type: "json" };
import gameConfigJson from "../../data/game_config.json" with { type: "json" };
import imperialProgressJson from "../../data/imperial_progress.json" with { type: "json" };
import kilnsJson from "../../data/kilns.json" with { type: "json" };
import ordersJson from "../../data/orders.json" with { type: "json" };
import techniquesJson from "../../data/techniques.json" with { type: "json" };
import type {
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
  rulesVersion: "1.0.0";
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
    guanHandLimit: number;
  };
  techniques: { maxOwned: number; faceUpPerDiscipline: number };
  kiln: {
    spaces: Record<"high" | "middle" | "low", number>;
    zoneModifier: Record<"high" | "middle" | "low", number>;
    activeSpacesByPlayerCount: Record<"2" | "3" | "4", KilnSpaceId[]>;
  };
  fireDeck: Record<"-1" | "0" | "1", number>;
  glazes: Record<Glaze, number>;
  decorations: Record<Decoration, number>;
  shapes: Record<Shape, number>;
  shapeSupplyEach: number;
  coinEndGame: { coinsPerVp: number; maxVp: number };
}

interface LocationDefinition {
  id: LocationId;
  name: string;
  capacity: Record<"2" | "3" | "4", number>;
}

export interface OrderRequirementDefinition {
  shape?: Shape;
  shapes?: Shape[];
  glaze?: Glaze;
  decoration?: Decoration;
}

export interface OrderDefinition {
  id: OrderId;
  ceramics: OrderRequirementDefinition[];
  relations?: OrderRelationDefinition[];
  minQuality: Quality;
  vp: number;
  coins: number;
  imperialProgressReward?: 1 | 2;
}

export type OrderRelationDefinition =
  | { type: "same_glaze"; indices: number[] }
  | { type: "different_glaze"; indices: number[] }
  | { type: "all_different_glaze"; indices: number[] }
  | { type: "different_shape"; indices: number[] }
  | { type: "all_different_shape"; indices: number[] }
  | { type: "same_decoration"; indices: number[] }
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
  oncePerRound: boolean;
}

interface FiringDefinition {
  rulesVersion: "1.0.0";
  kilnSpaces: Array<{ id: KilnSpaceId; zone: "high" | "middle" | "low"; modifier: -1 | 0 | 1 }>;
  fireDeck: FireModifier[];
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
  ability: string;
}

export const GAME_CONFIG = gameConfigJson as unknown as GameConfigDefinition;
const ACTION_LOCATION_FILE = actionLocationsJson as unknown as {
  rulesVersion: "1.0.0";
  locations: LocationDefinition[];
};
const ORDER_FILE = ordersJson as unknown as {
  market: OrderDefinition[];
  imperial: OrderDefinition[];
};
const TECHNIQUE_FILE = techniquesJson as unknown as TechniqueDefinition[];
const FIRING_FILE = firingJson as unknown as FiringDefinition;
const COMPONENT_FILE = componentsJson as unknown as { rulesVersion: "1.0.0"; components: ComponentDefinition[] };

export const LOCATION_IDS: readonly LocationId[] = [
  "materials_yard",
  "forming_studio",
  "glaze_workshop",
  "kiln_yard",
  "market_imperial_office",
  "guild_academy",
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
  rulesVersion: "1.0.0";
  track: Array<{ space: number; title: string; reward: string | null; endGameVp: number }>;
  imperialSealVp: number;
  presentation: {
    eligibleSpaces: number[];
    maxCeramics: number;
    minimumQuality: Quality;
    qualityVp: Record<"standard" | "fine" | "masterpiece", number>;
    threeDifferentShapesBonus: number;
    threeDifferentGlazesBonus: number;
    flawedEligible: boolean;
    emptyPresentationPenalty: number;
  };
}

export const IMPERIAL_PROGRESS = imperialProgressJson as unknown as ImperialProgressDefinition;

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
    GAME_CONFIG.rulesVersion !== "1.0.0" ||
    ACTION_LOCATION_FILE.rulesVersion !== "1.0.0" ||
    FIRING_FILE.rulesVersion !== "1.0.0" ||
    COMPONENT_FILE.rulesVersion !== "1.0.0" ||
    IMPERIAL_PROGRESS.rulesVersion !== "1.0.0"
  ) {
    throw new Error("Rules content version mismatch");
  }
  const actualLocationIds = new Set(ACTION_LOCATION_FILE.locations.map((location) => location.id));
  if (
    ACTION_LOCATION_FILE.locations.length !== 6 ||
    new Set(LOCATION_IDS).size !== 6 ||
    LOCATION_IDS.some((locationId) => !actualLocationIds.has(locationId))
  ) {
    throw new Error("Expected exactly six action locations");
  }
  if (MARKET_ORDERS.length !== 23 || IMPERIAL_ORDERS.length !== 13) {
    throw new Error("Order deck size mismatch");
  }
  if (
    MARKET_ORDERS.some((order) => order.imperialProgressReward !== undefined) ||
    IMPERIAL_ORDERS.some((order) => order.imperialProgressReward === undefined)
  ) {
    throw new Error("Imperial Order progress rewards mismatch");
  }
  if (TECHNIQUES.length !== 15 || KILN_IDS.length !== 5 || KILN_SPACE_IDS.length !== 8) {
    throw new Error("Technique, Kiln, or kiln-space count mismatch");
  }
  if (new Set([...MARKET_ORDERS, ...IMPERIAL_ORDERS].map((order) => order.id)).size !== 36) {
    throw new Error("Order IDs must be unique");
  }
  if (new Set(TECHNIQUES.map((technique) => technique.id)).size !== 15) {
    throw new Error("Technique IDs must be unique");
  }
}

validateContent();
