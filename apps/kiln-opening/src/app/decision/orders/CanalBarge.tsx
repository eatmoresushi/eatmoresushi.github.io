/**
 * CanalBarge (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B5 (firing, Order, Cleanup and Results decisions).
 * Source: §3.4, §4.3: the Canal Barge form, composed by B4's ActionWindow before and after the action.
 *
 * Phase A stub created by A2 (§4.3 rule 1): it has its final export name and props and renders
 * a `Placeholder` until its owner lands the component.
 */
import { Placeholder } from "../../screens/Placeholder.tsx";

export interface CanalBargeProps {
  /** Which window composes it. */
  source: "before_action" | "after_action";
}

export function CanalBarge(_props: CanalBargeProps) {
  return <Placeholder name="CanalBarge" />;
}
