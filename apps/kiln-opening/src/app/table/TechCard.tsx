/**
 * TechCard (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `techCard`: one Tech tile with its rules details (D10).
 *
 * Phase A stub created by A2 (§4.3 rule 1): it has its final export name and props and renders
 * a `Placeholder` until its owner lands the component.
 */
import type { TechId } from "../../game/index.ts";
import { Placeholder } from "../screens/Placeholder.tsx";

export interface TechCardProps {
  /** The Tech shown. */
  techId: TechId;
}

export function TechCard(_props: TechCardProps) {
  return <Placeholder name="TechCard" />;
}
