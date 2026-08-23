import { describe, expect, it } from "vitest";
import { FUEL_LEDGER_WOOD, TECHNIQUE_DEFINITIONS } from "../src/game";

/**
 * A Technique's printed text must state the price the engine actually charges.
 *
 * Fuel Ledger's card said "2 additional Wood" while `FUEL_LEDGER_WOOD` was 1, left behind
 * when v1.1.5 halved the surcharge. Nothing failed: the engine charged the right amount and
 * only the player was misinformed, which is the worst version of this -- someone plans a
 * firing around a cost that is not real, and no test, typecheck or build has any opinion.
 */
describe("Technique text agrees with the engine", () => {
  it("states Fuel Ledger's surcharge as the engine charges it", () => {
    const fuelLedger = Object.values(TECHNIQUE_DEFINITIONS).find(({ name }) => name === "Fuel Ledger");
    expect(fuelLedger).toBeDefined();
    if (fuelLedger === undefined) return;
    expect(fuelLedger.ability).toContain(`${FUEL_LEDGER_WOOD} additional Wood`);
    expect(fuelLedger.abilityZh).toContain(`额外花费${FUEL_LEDGER_WOOD}柴薪`);
  });

  it("keeps every Wood price on a Technique card matching its handler", () => {
    // Verified against the engine on 2026-08-24: Protective Saggars -1, Test Pieces -1,
    // Sagger Selection -2, Fuel Ledger -1. If a handler is repriced, the card must move too.
    const expected: Record<string, number> = {
      "Protective Saggars": 1,
      "Test Pieces": 1,
      "Sagger Selection": 2,
      "Fuel Ledger": FUEL_LEDGER_WOOD,
    };
    for (const [name, wood] of Object.entries(expected)) {
      const technique = Object.values(TECHNIQUE_DEFINITIONS).find((t) => t.name === name);
      expect(technique, name).toBeDefined();
      expect(technique?.ability, `${name} must print ${wood} Wood`).toMatch(
        new RegExp(`\\b${wood}\\s+(additional\\s+)?Wood\\b`),
      );
    }
  });
});
