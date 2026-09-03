import { LOCATION_DEFINITIONS, LOCATION_IDS } from "../../game";
import type { KilnId, LocationId, TechniqueId } from "../../game";

const base = `${import.meta.env.BASE_URL}assets/tabletop`;

export const TABLETOP_ASSETS = {
  centralTable: `${base}/central-table.webp`,
  playerBoards: `${base}/player-boards.webp`,
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

/**
 * Order card art, once V1.2.2 fronts exist.
 *
 * The V0.4 sheets this read were the obsolete 20-Market / 10-Imperial split, keyed by `M`
 * and `I` ids. V1.2.2 ships 16 Starting + 48 unified Main Orders as `S`/`O`, so neither
 * branch could ever match and every card already fell through to the live-data card below.
 * `docs/V0.4_ASSETS_TO_REGENERATE.md` §1 tracks regenerating all 64 fronts; this stays as
 * the seam they plug into rather than pretending obsolete sheets still apply.
 */
export function orderSprite(_orderId: string): SpriteCrop | null {
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

/**
 * Board labels come from the V1.2.2 action-location data, never a hand-copied list.
 * The ids are stable legacy keys: `market_imperial_office` is V1.2.2's Commission
 * Market. A fourth hardcoded copy is exactly how "Market & Imperial Office" outlived
 * the rename, so read the names the rules ship with.
 */
export const LOCATION_LABELS: Record<LocationId, string> = Object.fromEntries(
  LOCATION_IDS.map((id) => [id, LOCATION_DEFINITIONS[id].name]),
) as Record<LocationId, string>;
