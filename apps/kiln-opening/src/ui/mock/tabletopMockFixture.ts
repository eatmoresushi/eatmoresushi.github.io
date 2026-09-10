import type {
  Decoration,
  Glaze,
  KilnId,
  LocationId,
  OrderId,
  Quality,
  Shape,
  StartingTechniqueId,
  TechniqueDiscipline,
  TechniqueId,
  WorkerKind,
} from "../../game";

type Accent = "cinnabar" | "river" | "ochre" | "plum";

export interface MockPlayer {
  id: string;
  name: string;
  nameZh: string;
  kilnId: KilnId;
  accent: Accent;
  seat: number;
  vp: number;
  clay: number;
  wood: number;
  coins: number;
  recognition: number;
  workersRemaining: number;
  startingTechniqueId: StartingTechniqueId;
  imperialKilnUnlocked: boolean;
  imperialPriorityAvailable: boolean;
  orderIds: OrderId[];
  techniqueIds: TechniqueId[];
  isFirst?: boolean;
}

export interface MockCeramic {
  id: string;
  ownerId: string;
  stage: "shaped" | "glazed" | "loaded" | "finished";
  shape: Shape;
  glaze?: Glaze;
  decoration?: Decoration;
  quality?: Quality;
  shifuMarkedBy?: string;
}

export const PLAYERS: MockPlayer[] = [
  {
    id: "P1",
    name: "Luyuan",
    nameZh: "陆远",
    kilnId: "RU",
    accent: "cinnabar",
    seat: 1,
    vp: 18,
    clay: 4,
    wood: 3,
    coins: 6,
    recognition: 2,
    workersRemaining: 2,
    startingTechniqueId: "ST01",
    imperialKilnUnlocked: true,
    imperialPriorityAvailable: false,
    orderIds: ["O07", "O24"],
    techniqueIds: ["T02", "T11"],
    isFirst: true,
  },
  {
    id: "P2",
    name: "Qiao",
    nameZh: "乔",
    kilnId: "GU",
    accent: "river",
    seat: 2,
    vp: 23,
    clay: 2,
    wood: 5,
    coins: 4,
    recognition: 3,
    workersRemaining: 1,
    startingTechniqueId: "ST02",
    imperialKilnUnlocked: true,
    imperialPriorityAvailable: true,
    orderIds: ["O18", "O31", "O44"],
    techniqueIds: ["T06", "T12"],
  },
  {
    id: "P3",
    name: "Mei",
    nameZh: "梅",
    kilnId: "GE",
    accent: "ochre",
    seat: 3,
    vp: 15,
    clay: 6,
    wood: 2,
    coins: 3,
    recognition: 1,
    workersRemaining: 2,
    startingTechniqueId: "ST03",
    imperialKilnUnlocked: false,
    imperialPriorityAvailable: false,
    orderIds: ["O14", "O37"],
    techniqueIds: ["T03", "T08"],
  },
  {
    id: "P4",
    name: "Bo",
    nameZh: "博",
    kilnId: "JU",
    accent: "plum",
    seat: 4,
    vp: 20,
    clay: 3,
    wood: 4,
    coins: 7,
    recognition: 2,
    workersRemaining: 0,
    startingTechniqueId: "ST04",
    imperialKilnUnlocked: true,
    imperialPriorityAvailable: false,
    orderIds: ["O03", "O28"],
    techniqueIds: ["T05", "T14"],
  },
];

export const MOCK_PLAYER_COUNT = PLAYERS.length as 2 | 3 | 4;

export const MARKET_ORDER_IDS: OrderId[] = ["O09", "O21", "O27", "O39", "O47"];
export const FACE_UP_TECHNIQUES: Record<TechniqueDiscipline, TechniqueId[]> = {
  forming: ["T01", "T04"],
  glazing: ["T07", "T10"],
  firing: ["T13", "T15"],
};
export const TECH_DECK_REMAINING: Record<TechniqueDiscipline, number> = {
  forming: 0,
  glazing: 1,
  firing: 0,
};
export const MAIN_ORDER_DECK_REMAINING = 28;
export const ROTATED_MAIN_ORDER_COUNT = 6;
export const FIRE_DECK_REMAINING = 10;
export const MAIN_FIRE_CARDS_DISCARDED = 2;

export const BOARD_LOCATIONS: Array<{ id: LocationId; glyph: string; position: string }> = [
  { id: "materials_yard", glyph: "泥", position: "north-west" },
  { id: "forming_studio", glyph: "陶", position: "north" },
  { id: "glaze_workshop", glyph: "釉", position: "north-east" },
  { id: "market_imperial_office", glyph: "单", position: "west" },
  { id: "guild_academy", glyph: "艺", position: "east" },
  { id: "labour", glyph: "工", position: "south-west" },
  { id: "kiln_yard", glyph: "窑", position: "south" },
];

export const ACTION_OCCUPANCY: Partial<Record<LocationId, Array<{ playerId: string; kind: WorkerKind }>>> = {
  materials_yard: [{ playerId: "P2", kind: "apprentice" }],
  forming_studio: [
    { playerId: "P3", kind: "apprentice" },
    { playerId: "P4", kind: "shifu" },
  ],
  glaze_workshop: [{ playerId: "P4", kind: "apprentice" }],
  market_imperial_office: [{ playerId: "P2", kind: "shifu" }],
  guild_academy: [{ playerId: "P4", kind: "apprentice" }],
  kiln_yard: [
    { playerId: "P1", kind: "apprentice" },
    { playerId: "P1", kind: "apprentice" },
    { playerId: "P2", kind: "apprentice" },
    { playerId: "P3", kind: "shifu" },
    { playerId: "P4", kind: "apprentice" },
  ],
};

export const KILN_CERAMICS: Array<MockCeramic | null> = [
  { id: "C17", ownerId: "P1", stage: "loaded", shape: "bowl", glaze: "celadon", decoration: "plain" },
  { id: "C21", ownerId: "P2", stage: "loaded", shape: "vase", glaze: "moon_white", decoration: "carved" },
  null,
  { id: "C14", ownerId: "P3", stage: "loaded", shape: "washer", glaze: "grey_green", decoration: "crackle", shifuMarkedBy: "P3" },
  { id: "C19", ownerId: "P4", stage: "loaded", shape: "censer", glaze: "white", decoration: "impressed" },
  { id: "C15", ownerId: "P3", stage: "loaded", shape: "plate", glaze: "moon_white", decoration: "plain" },
  { id: "C12", ownerId: "P1", stage: "loaded", shape: "plate", glaze: "celadon", decoration: "carved" },
];

export const WORKSHOP_CERAMICS: MockCeramic[] = [
  { id: "C23", ownerId: "P1", stage: "glazed", shape: "vase", glaze: "moon_white", decoration: "plain" },
  { id: "C25", ownerId: "P1", stage: "shaped", shape: "washer" },
  { id: "C09", ownerId: "P1", stage: "finished", shape: "censer", glaze: "grey_green", decoration: "crackle", quality: "fine" },
];

export const TABLETOP_MOCK_FIXTURE = {
  players: PLAYERS,
  marketOrderIds: MARKET_ORDER_IDS,
  faceUpTechniques: FACE_UP_TECHNIQUES,
  techniqueDeckRemaining: TECH_DECK_REMAINING,
  mainOrderDeckRemaining: MAIN_ORDER_DECK_REMAINING,
  rotatedMainOrderCount: ROTATED_MAIN_ORDER_COUNT,
  actionOccupancy: ACTION_OCCUPANCY,
  kilnCeramics: KILN_CERAMICS,
  workshopCeramics: WORKSHOP_CERAMICS,
  fireDeckRemaining: FIRE_DECK_REMAINING,
  mainFireCardsDiscarded: MAIN_FIRE_CARDS_DISCARDED,
};
