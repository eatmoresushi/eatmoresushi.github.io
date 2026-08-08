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
  materials_yard: { x: 0.033, y: 0.123, width: 0.228, height: 0.242 },
  forming_studio: { x: 0.271, y: 0.123, width: 0.238, height: 0.242 },
  glaze_workshop: { x: 0.033, y: 0.377, width: 0.228, height: 0.247 },
  kiln_yard: { x: 0.271, y: 0.377, width: 0.238, height: 0.247 },
  market_imperial_office: { x: 0.033, y: 0.637, width: 0.228, height: 0.245 },
  guild_academy: { x: 0.271, y: 0.637, width: 0.238, height: 0.245 },
};

export const KILN_SLOT_POINTS: Record<KilnSpaceId, NormalizedPoint> = {
  high_1: { x: 0.632, y: 0.198 },
  high_2: { x: 0.756, y: 0.198 },
  middle_1: { x: 0.608, y: 0.355 },
  middle_2: { x: 0.690, y: 0.355 },
  middle_3: { x: 0.773, y: 0.355 },
  low_1: { x: 0.608, y: 0.505 },
  low_2: { x: 0.690, y: 0.505 },
  low_3: { x: 0.773, y: 0.505 },
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
