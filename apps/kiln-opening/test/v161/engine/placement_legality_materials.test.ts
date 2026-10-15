/**
 * Materials Yard placement legality (L140–142, L619, R12). Gaining resources is always
 * possible, so the only limits are the shared placement checks; optional bonuses never make a
 * placement illegal (L142 "Optional bonuses may still be declined").
 */

import { describe, expect, it } from "vitest";
import { validatePlacement } from "../../../src/game/placement.ts";
import type { GameAction, GamePhase } from "../../../src/game/types.ts";
import { actorViewOf } from "../../../src/game/view.ts";
import { buildState, verdict } from "./workshop_support.ts";

const my = (workerId: string, clay: number, extra: Partial<Extract<GameAction, { type: "PLACE_MATERIALS_YARD" }>> = {}): GameAction => ({
  type: "PLACE_MATERIALS_YARD",
  workerId,
  clay,
  wood: 0,
  ...extra,
});

describe("at least 1 instance of the main action (L142)", () => {
  it("is always possible: legal with no resources at all, for either worker", () => {
    const state = buildState({ players: [{ resources: { clay: 0, wood: 0, coins: 0 } }, {}] });
    expect(verdict(state, "p1", my("p1:apprentice:1", 3))).toBeNull();
    expect(verdict(state, "p1", my("p1:shifu", 4))).toBeNull();
  });

  it("an unaffordable optional bonus is declined, not a reason to refuse the placement", () => {
    const state = buildState({ players: [{ techs: ["T17"], resources: { clay: 0, wood: 0, coins: 0 } }, {}] });
    expect(verdict(state, "p1", my("p1:shifu", 4))).toBeNull();
    expect(verdict(state, "p1", my("p1:shifu", 4, { buyShifuBonus: true }))).toBe("INSUFFICIENT_RESOURCES");
    expect(verdict(state, "p1", my("p1:shifu", 4, { preparedClay: { shape: "bowl", decoration: "plain" } }))).toBe("INSUFFICIENT_RESOURCES");
  });
});

describe("shared placement checks through the Materials Yard validator", () => {
  it("refuses a full yard, a placed worker, another player's turn and a second worker action", () => {
    const full = buildState({
      placements: [
        { player: "p2", worker: 1, locationId: "materials_yard" },
        { player: "p2", worker: 2, locationId: "materials_yard" },
      ],
    });
    expect(verdict(full, "p1", my("p1:shifu", 4))).toBe("LOCATION_FULL");
    const placed = buildState({ placements: [{ player: "p1", worker: 1, locationId: "canal_wharf" }] });
    expect(verdict(placed, "p1", my("p1:apprentice:1", 3))).toBe("WORKER_UNAVAILABLE");
    expect(verdict(buildState(), "p2", my("p2:apprentice:1", 3))).toBe("NOT_YOUR_DECISION");
    const after: GamePhase = { type: "work_turn", activePlayerId: "p1", step: { kind: "after_action" } };
    expect(verdict(buildState({ phase: after }), "p1", my("p1:apprentice:1", 3))).toBe("WORKER_ACTION_ALREADY_TAKEN");
    const orders: GamePhase = { type: "orders", turnOrder: ["p1", "p2"], index: 0 };
    expect(verdict(buildState({ phase: orders }), "p1", my("p1:apprentice:1", 3))).toBe("WRONG_PHASE");
  });
});

describe("Senior Apprentice placement (L619, R12)", () => {
  it("needs an Apprentice, a ready T18, and the Materials Yard or Commission Market", () => {
    const ready = buildState({ players: [{ techs: ["T18"] }, {}] });
    expect(verdict(ready, "p1", my("p1:apprentice:1", 4, { seniorApprentice: true }))).toBeNull();
    expect(verdict(ready, "p1", my("p1:shifu", 4, { seniorApprentice: true }))).toBe("SENIOR_APPRENTICE_NOT_APPLICABLE");
    const used = buildState({ players: [{ techs: [{ id: "T18", usedThisRound: true }] }, {}] });
    expect(verdict(used, "p1", my("p1:apprentice:1", 4, { seniorApprentice: true }))).toBe("TECH_ALREADY_USED");
    expect(verdict(buildState(), "p1", my("p1:apprentice:1", 4, { seniorApprentice: true }))).toBe("TECH_NOT_OWNED");
    // Never at the Magistrate's Hall (R12) or anywhere else.
    for (const location of ["magistrates_hall", "canal_wharf", "guild_hall", "form_decorate", "glaze_load"] as const) {
      expect(validatePlacement(actorViewOf(ready, "p1"), "p1:apprentice:1", location, true)?.code).toBe("SENIOR_APPRENTICE_NOT_APPLICABLE");
    }
  });
});
