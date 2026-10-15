/**
 * OrderCard (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `orderCard`: one Order's printed face, its quality line and target state.
 *
 * Phase A stub created by A2 (§4.3 rule 1): it has its final export name and props and renders
 * a `Placeholder` until its owner lands the component.
 */
import type { OrderId } from "../../game/index.ts";
import { Placeholder } from "../screens/Placeholder.tsx";

export interface OrderCardProps {
  /** The Order shown. */
  orderId: OrderId;
  /** Its key in `orderTargets` (the OrderId, or `slot:<i>` on the display). */
  targetKey?: string;
}

export function OrderCard(_props: OrderCardProps) {
  return <Placeholder name="OrderCard" />;
}
