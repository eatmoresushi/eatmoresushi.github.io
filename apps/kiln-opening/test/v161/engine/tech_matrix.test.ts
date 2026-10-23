/**
 * Every Advanced Tech and every Kiln Tradition is exercised (DESIGN §8.2 `tech_matrix`; AGENTS
 * "all 18 [Techs]" and "all five Kiln abilities"): one scenario per Tech ID and Kiln ID, run
 * through the canonical enumerator and the dispatcher with invariants on. The table fails if a
 * Tech or Kiln is missing. The fuzz test reports how often each one fired in random play.
 */

import { describe, expect, it } from "vitest";
import { KILN_IDS, TECH_IDS } from "../../../src/game/content.ts";
import { legalCommands } from "../../../src/game/legalActions.ts";
import { ABILITY_CASES, applyCommand } from "./ability_cases.ts";

describe("tech matrix", () => {
  it("has exactly one scenario per Tech ID and per Kiln ID", () => {
    const covered = ABILITY_CASES.map((c) => c.ability).sort();
    expect(covered).toEqual([...TECH_IDS, ...KILN_IDS].sort());
  });

  it.each(ABILITY_CASES.map((c) => [c.ability, c] as const))("%s resolves through a canonical command", (_id, c) => {
    const table = c.table();
    if (c.ability === "T19") {
      // Game-end scoring only (L620): no command uses it.
      expect(c.used([], table.state)).toBe(true);
      return;
    }
    expect(table.prompt().actorIds).toContain(c.actor);
    const commands = legalCommands(table.view(c.actor), { mode: "canonical" });
    const use = commands.find((command) => c.uses(command));
    expect(use, `no canonical command uses ${c.ability}`).toBeDefined();
    if (use === undefined) {
      return;
    }
    const events = applyCommand(table, c.actor, use);
    const extra = c.after?.(table) ?? [];
    expect(c.used([...events, ...extra], table.state), `${c.ability} did not resolve`).toBe(true);
  });
});
