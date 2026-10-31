/**
 * Pins the Order data to the documented relation semantics (types.ts
 * `OrderRelationDefinition`): `different_*` means every listed slot is pairwise different,
 * so "3 different Decorations" (O45, O47; L608, L610) is `different_decoration` over all 3
 * slots, and "at least 2 different Decorations" (O48, L611) is
 * `at_least_n_distinct_decorations` with count 2. The matcher's behaviour on these Orders
 * is tested with P6's `orders/matching.ts`.
 */

import { describe, expect, it } from "vitest";
import { ORDERS } from "../../../src/game/content.ts";
import type { OrderId } from "../../../src/game/types.ts";

function relationsOf(orderId: OrderId) {
  return ORDERS[orderId].relations ?? [];
}

describe("Order relation semantics", () => {
  it.each(["O45", "O47"] as const)("%s: 3 different Decorations is pairwise different_decoration over all 3 slots", (orderId) => {
    expect(ORDERS[orderId].requirements).toContain("3 different Decorations");
    expect(relationsOf(orderId)).toContainEqual({ type: "different_decoration", indices: [0, 1, 2] });
    expect(relationsOf(orderId).some((r) => r.type === "at_least_n_distinct_decorations")).toBe(false);
  });

  it("O48: at least 2 different Decorations uses at_least_n_distinct_decorations, not different_decoration", () => {
    expect(ORDERS.O48.requirements).toContain("at least 2 different Decorations");
    expect(relationsOf("O48")).toContainEqual({ type: "at_least_n_distinct_decorations", indices: [0, 1, 2], count: 2 });
    expect(relationsOf("O48").some((r) => r.type === "different_decoration")).toBe(false);
  });

  it("every 'N different' Order text over 3 slots maps to a pairwise relation", () => {
    for (const orderId of Object.keys(ORDERS) as OrderId[]) {
      const order = ORDERS[orderId];
      for (const relation of order.relations ?? []) {
        if (relation.type === "different_decoration" && relation.indices.length === 3) {
          expect(order.requirements, orderId).toContain("3 different Decorations");
        }
      }
    }
  });
});
