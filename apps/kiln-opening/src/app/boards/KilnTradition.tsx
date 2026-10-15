/**
 * KilnTradition (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `kilnTrad`, `hmLine`: the Kiln Player Board's tradition and marker line.
 *
 * Phase A stub created by A2 (§4.3 rule 1): it has its final export name and props and renders
 * a `Placeholder` until its owner lands the component.
 */
import type { PlayerId } from "../../game/index.ts";
import { Placeholder } from "../screens/Placeholder.tsx";

export interface KilnTraditionProps {
  /** Whose Kiln. */
  playerId: PlayerId;
}

export function KilnTradition(_props: KilnTraditionProps) {
  return <Placeholder name="KilnTradition" />;
}
