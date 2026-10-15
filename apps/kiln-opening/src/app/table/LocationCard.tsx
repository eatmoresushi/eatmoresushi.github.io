/**
 * LocationCard (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `locCard`, `reasonFor`: one central location, its occupants, capacity and Place shortcuts.
 *
 * Phase A stub created by A2 (§4.3 rule 1): it has its final export name and props and renders
 * a `Placeholder` until its owner lands the component.
 */
import type { CentralLocationId } from "../../game/index.ts";
import { Placeholder } from "../screens/Placeholder.tsx";

export interface LocationCardProps {
  /** The central location shown. */
  locationId: CentralLocationId;
}

export function LocationCard(_props: LocationCardProps) {
  return <Placeholder name="LocationCard" />;
}
