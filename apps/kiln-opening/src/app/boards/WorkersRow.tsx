/**
 * WorkersRow (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `workersRow`.
 *
 * Phase A stub created by A2 (§4.3 rule 1): it has its final export name and props and renders
 * a `Placeholder` until its owner lands the component.
 */
import type { PlayerId } from "../../game/index.ts";
import { Placeholder } from "../screens/Placeholder.tsx";

export interface WorkersRowProps {
  /** Whose workers. */
  playerId: PlayerId;
}

export function WorkersRow(_props: WorkersRowProps) {
  return <Placeholder name="WorkersRow" />;
}
