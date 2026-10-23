/**
 * Optional abilities (R4; DESIGN §8.2 `optional_abilities`): every optional Tech and Kiln
 * ability is offered by the canonical enumerator both used and declined, and declining keeps
 * its once-per-round use. Table-driven over `ABILITY_CASES`; the abilities without a decline
 * are automatic or mandatory and say why.
 */

import { describe, expect, it } from "vitest";
import { KILN_IDS, TECHS, TECH_IDS } from "../../../src/game/content.ts";
import { legalCommands } from "../../../src/game/legalActions.ts";
import { techReady } from "../../../src/game/techs.ts";
import { ABILITY_CASES, applyCommand } from "./ability_cases.ts";
import { buildState } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";

const OPTIONAL = ABILITY_CASES.filter((c) => c.declines !== undefined);

describe("optional abilities (R4)", () => {
  it("every Tech and Kiln ability is either optional here or documented as automatic or mandatory", () => {
    for (const id of [...TECH_IDS, ...KILN_IDS]) {
      const c = ABILITY_CASES.find((entry) => entry.ability === id);
      expect(c, id).toBeDefined();
      expect(c?.declines !== undefined || (c?.notOptional ?? "").length > 0, id).toBe(true);
    }
    // The automatic ones are exactly Connoisseur's Cabinet, Kiln Tending and Canal Barge (v1.6.2
    // L630). Colour Samples' swap, Protective Saggars' Standard → Fine step and Second Firing are
    // optional (R4); the Saggars floor and Fuel Ledger's free Bank and Stoke are not choices.
    expect(ABILITY_CASES.filter((c) => c.declines === undefined).map((c) => c.ability).sort()).toEqual(["T19", "T20", "T23"]);
  });

  it.each(OPTIONAL.map((c) => [c.ability, c] as const))("%s: offered used and declined; declining keeps the use", (id, c) => {
    const table = c.table();
    expect(c.ready(table.state), `${id} starts ready`).toBe(true);
    const commands = legalCommands(table.view(c.actor), { mode: "canonical" });
    expect(commands.some((command) => c.uses(command)), `${id} is offered used`).toBe(true);
    const decline = commands.find((command) => c.declines?.(command) === true);
    expect(decline, `${id} is offered declined`).toBeDefined();
    if (decline === undefined) {
      return;
    }
    const events = [...applyCommand(table, c.actor, decline), ...(c.after?.(table) ?? [])];
    expect(c.ready(table.state), `${id} is still ready after declining`).toBe(true);
    const marked = events.filter(
      (e) => (e.type === "TECH_USED" && e.techId === id) || (e.type === "KILN_ABILITY_USED" && e.kilnId === id),
    );
    expect(marked, `${id} was marked used`).toEqual([]);
    if (id in TECHS) {
      expect(techReady(table.player("p1"), id as keyof typeof TECHS) || !TECHS[id as keyof typeof TECHS].oncePerRound).toBe(true);
    }
  });

  it("a Colour Samples swap declined before the worker action is still usable after it, the same round", () => {
    const table = new LocalTable(buildState({ players: [{ techs: ["T10"], hand: ["O40"] }, {}] }));
    table.act("p1", { type: "PLACE_CANAL_WHARF", workerId: "p1:apprentice:1" });
    expect(table.state.phase).toMatchObject({ type: "work_turn", activePlayerId: "p1", step: { kind: "after_action" } });
    const swap = legalCommands(table.view("p1"), { mode: "canonical" }).find((command) => command.type === "USE_COLOUR_SAMPLES_SWAP");
    expect(swap).toBeDefined();
    if (swap !== undefined) {
      const events = applyCommand(table, "p1", swap);
      expect(events.some((e) => e.type === "PRIVATE_LOOK_OPENED" && e.kind === "colour_samples_swap")).toBe(true);
    }
  });
});
