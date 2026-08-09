import type { KilnId, LocationId, TechniqueId } from "../../game";

const base = `${import.meta.env.BASE_URL}assets/tabletop`;

export const TABLETOP_ASSETS = {
  centralTable: `${base}/central-table.webp`,
  playerBoards: `${base}/player-boards.webp`,
  marketOrders: `${base}/market-orders.webp`,
  imperialOrders: `${base}/imperial-orders.webp`,
  techniques: `${base}/techniques.webp`,
  vessels: `${base}/vessels.webp`,
  tokens: `${base}/tokens.webp`,
  firingCards: `${base}/firing-cards.webp`,
} as const;

export interface SpriteCrop {
  image: string;
  columns: number;
  rows: number;
  column: number;
  row: number;
}

export function orderSprite(orderId: string): SpriteCrop | null {
  const number = Number(orderId.slice(1));
  if (!Number.isInteger(number) || number < 1) return null;
  if (orderId.startsWith("M") && number <= 20) {
    const index = number - 1;
    return {
      image: TABLETOP_ASSETS.marketOrders,
      columns: 4,
      rows: 5,
      column: index % 4,
      row: Math.floor(index / 4),
    };
  }
  if (orderId.startsWith("I") && number <= 10) {
    const index = number - 1;
    return {
      image: TABLETOP_ASSETS.imperialOrders,
      columns: 5,
      rows: 2,
      column: index % 5,
      row: Math.floor(index / 5),
    };
  }
  return null;
}

export function techniqueSprite(techniqueId: TechniqueId): SpriteCrop | null {
  const index = Number(techniqueId.slice(1)) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= 12) return null;
  return {
    image: TABLETOP_ASSETS.techniques,
    columns: 4,
    rows: 3,
    column: index % 4,
    row: Math.floor(index / 4),
  };
}

export const WORKSHOP_CROPS: Record<KilnId, {
  x: number;
  y: number;
  width: number;
  height: number;
}> = {
  RU: { x: 0, y: 0, width: 0.333, height: 0.555 },
  GU: { x: 0.334, y: 0, width: 0.333, height: 0.555 },
  GE: { x: 0.668, y: 0, width: 0.332, height: 0.555 },
  DI: { x: 0.126, y: 0.558, width: 0.357, height: 0.442 },
  JU: { x: 0.498, y: 0.558, width: 0.357, height: 0.442 },
};

export const LOCATION_LABELS: Record<LocationId, string> = {
  materials_yard: "Materials Yard",
  forming_studio: "Forming Studio",
  glaze_workshop: "Glaze Workshop",
  kiln_yard: "Kiln Yard",
  market_imperial_office: "Market & Imperial Office",
  guild_academy: "Guild & Academy",
};
