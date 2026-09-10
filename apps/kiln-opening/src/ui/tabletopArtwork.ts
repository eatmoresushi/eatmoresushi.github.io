import type {
  LocationId,
  OrderId,
  StartingTechniqueId,
  TechniqueId,
} from "../game";

/**
 * Optional, decorative artwork for the live tabletop.
 *
 * Rules-bearing text, costs, rewards, capacities, and legal-move state stay in the
 * structured V1.2.6 data and React markup. That makes an illustration replaceable
 * without changing the engine, commands, localization, or accessibility text.
 */
export interface TabletopArtworkManifest {
  sharedBoard?: string;
  actionSpaces: Partial<Record<LocationId, string>>;
  orders: Partial<Record<OrderId, string>>;
  techniques: Partial<Record<TechniqueId | StartingTechniqueId, string>>;
}

/** Populate these slots with approved assets when final illustrations are ready. */
export const TABLETOP_ARTWORK: TabletopArtworkManifest = {
  actionSpaces: {},
  orders: {},
  techniques: {},
};
