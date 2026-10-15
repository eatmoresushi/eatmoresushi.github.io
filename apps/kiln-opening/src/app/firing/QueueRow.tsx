/**
 * QueueRow (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * Source: wireframe `queueRow`, `submitRow`: who acts in a queued step, who has submitted a Contribution.
 *
 * Phase A stub created by A2 (§4.3 rule 1): it has its final export name and props and renders
 * a `Placeholder` until its owner lands the component.
 */
import type { FiringStageView } from "../../game/index.ts";
import { Placeholder } from "../screens/Placeholder.tsx";

export interface QueueRowProps {
  /** The firing shown. */
  stage: FiringStageView;
}

export function QueueRow(_props: QueueRowProps) {
  return <Placeholder name="QueueRow" />;
}
