import type { KilnSpaceId, LocationId } from "../../game";

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

// Coordinates are normalized against central-table.webp. They are presentation
// configuration only and are never persisted in GameState.
export const ACTION_ZONE_RECTS: Record<LocationId, NormalizedRect> = {
  labour: { x: 0.02, y: 0.86, width: 0.30, height: 0.12 },
  materials_yard: { x: 0.033, y: 0.123, width: 0.228, height: 0.242 },
  forming_studio: { x: 0.271, y: 0.123, width: 0.238, height: 0.242 },
  glaze_workshop: { x: 0.033, y: 0.377, width: 0.228, height: 0.247 },
  kiln_yard: { x: 0.271, y: 0.377, width: 0.238, height: 0.247 },
  market_imperial_office: { x: 0.033, y: 0.637, width: 0.228, height: 0.245 },
  guild_academy: { x: 0.271, y: 0.637, width: 0.238, height: 0.245 },
};

export const KILN_SLOT_POINTS: Record<KilnSpaceId, NormalizedPoint> = {
  // V1.1.1 board: 3 High / 2 Middle / 2 Low.
  high_1: { x: 0.608, y: 0.198 },
  high_2: { x: 0.690, y: 0.198 },
  high_3: { x: 0.773, y: 0.198 },
  middle_1: { x: 0.649, y: 0.355 },
  middle_2: { x: 0.732, y: 0.355 },
  low_1: { x: 0.649, y: 0.505 },
  low_2: { x: 0.732, y: 0.505 },
  // Retained so historical states still render; not printed on the V1.1.1 board.
  middle_3: { x: 0.815, y: 0.355 },
  middle_4: { x: 0.608, y: 0.505 },
  middle_5: { x: 0.815, y: 0.505 },
  low_3: { x: 0.773, y: 0.585 },
};

export const IMPERIAL_TRACK_POINTS: readonly NormalizedPoint[] = [
  { x: 0.565, y: 0.751 },
  { x: 0.634, y: 0.751 },
  { x: 0.705, y: 0.751 },
  { x: 0.775, y: 0.751 },
  { x: 0.846, y: 0.751 },
  { x: 0.916, y: 0.751 },
];

export function normalizedStyle(rect: NormalizedRect): Record<string, string> {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  };
}
