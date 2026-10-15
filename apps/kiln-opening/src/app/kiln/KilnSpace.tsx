/**
 * KilnSpace (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * Source: wireframe `sharedKiln` cell: zone and modifier, stacks, Setter's Mark, Kiln Furniture, markers, pending chips, target button.
 *
 * Phase A stub created by A2 (§4.3 rule 1): it has its final export name and props and renders
 * a `Placeholder` until its owner lands the component.
 */
import type { KilnSpaceId } from "../../game/index.ts";
import { Placeholder } from "../screens/Placeholder.tsx";

export interface KilnSpaceProps {
  /** The Shared Kiln space. */
  spaceId: KilnSpaceId;
}

export function KilnSpace(_props: KilnSpaceProps) {
  return <Placeholder name="KilnSpace" />;
}
