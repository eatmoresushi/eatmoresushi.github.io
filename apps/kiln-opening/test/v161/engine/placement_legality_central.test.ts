/**
 * Canal Wharf and Magistrate's Hall placement legality (L162–165, L254–262).
 * - Canal Wharf: uncapped, costless, so always legal for an available worker (L165).
 * - Magistrate's Hall: 1/1/2 spaces; Recognition 0–2 (L254, L261–262); 4 Coins (Apprentice) or
 *   3 Coins (Shifu); no Crown requirement; Senior Apprentice never applies (R12).
 */

import { describe, expect, it } from "vitest";
import { validatePlacement } from "../../../src/game/placement.ts";
import type { GameAction, PlayerCount, Recognition } from "../../../src/game/types.ts";
import { actorViewOf } from "../../../src/game/view.ts";
import type { PlacementSpec } from "./support/fixtures.ts";
import { buildState, verdict } from "./workshop_support.ts";

const wharf = (workerId: string): GameAction => ({ type: "PLACE_CANAL_WHARF", workerId });
const hall = (workerId: string): GameAction => ({ type: "PLACE_MAGISTRATES_HALL", workerId });

describe("Canal Wharf is always a legal placement (L165)", () => {
  it.each([2, 3, 4] as const)("%i players: with no resources and every capped location full", (n: PlayerCount) => {
    // Every worker except p1's Shifu and first Apprentice fills the capped central locations.
    const pool: Array<Pick<PlacementSpec, "player" | "worker">> = [
      { player: "p1", worker: 2 },
      { player: "p1", worker: 3 },
      ...["p2", "p3", "p4"].slice(0, n - 1).flatMap((player) => ([1, 2, 3, "shifu"] as const).map((worker) => ({ player, worker }))),
    ];
    const capped = ["materials_yard", "commission_market", "guild_hall"] as const;
    const placements: PlacementSpec[] = capped.flatMap((locationId, block) =>
      pool.slice(block * n, block * n + n).map((worker) => ({ ...worker, locationId })),
    );
    expect(placements).toHaveLength(3 * n);
    const state = buildState({ players: Array.from({ length: n }, () => ({ resources: { clay: 0, wood: 0, coins: 0 } })), placements });
    expect(verdict(state, "p1", { type: "PLACE_MATERIALS_YARD", workerId: "p1:shifu", clay: 4, wood: 0 })).toBe("LOCATION_FULL");
    expect(verdict(state, "p1", wharf("p1:apprentice:1"))).toBeNull();
    expect(verdict(state, "p1", wharf("p1:shifu"))).toBeNull();
    expect(verdict(state, "p1", hall("p1:shifu"))).toBe("INSUFFICIENT_RESOURCES");
  });

  it("still needs an available worker and your turn", () => {
    const placed = buildState({ placements: [{ player: "p1", worker: "shifu", locationId: "canal_wharf" }] });
    expect(verdict(placed, "p1", wharf("p1:shifu"))).toBe("WORKER_UNAVAILABLE");
    expect(verdict(buildState(), "p2", wharf("p2:shifu"))).toBe("NOT_YOUR_DECISION");
  });
});

describe("Magistrate's Hall legality", () => {
  it.each([0, 1, 2] as const)("is usable at Recognition %i (L254)", (recognition: Recognition) => {
    const state = buildState({ players: [{ recognition, resources: { coins: 4 } }, {}] });
    expect(verdict(state, "p1", hall("p1:apprentice:1"))).toBeNull();
    expect(verdict(state, "p1", hall("p1:shifu"))).toBeNull();
  });

  it.each([3, 4] as const)("is closed at Recognition %i, whatever the Coins (L262)", (recognition: Recognition) => {
    const state = buildState({ players: [{ recognition, resources: { coins: 9 } }, {}] });
    expect(verdict(state, "p1", hall("p1:apprentice:1"))).toBe("RECOGNITION_GATE");
    expect(verdict(state, "p1", hall("p1:shifu"))).toBe("RECOGNITION_GATE");
  });

  it("costs 4 Coins for either worker (L258–259, change 33)", () => {
    const three = buildState({ players: [{ resources: { coins: 3 } }, {}] });
    expect(verdict(three, "p1", hall("p1:apprentice:1"))).toBe("INSUFFICIENT_RESOURCES");
    expect(verdict(three, "p1", hall("p1:shifu"))).toBe("INSUFFICIENT_RESOURCES");
    const four = buildState({ players: [{ resources: { coins: 4 } }, {}] });
    expect(verdict(four, "p1", hall("p1:apprentice:1"))).toBeNull();
    // The Crown Order is optional (R21): no Crown Order showing never refuses the Shifu.
    expect(verdict(four, "p1", hall("p1:shifu"))).toBeNull();
  });

  it("has 1 space at 2–3 players and 2 at 4 (L254)", () => {
    for (const n of [2, 3] as const) {
      const state = buildState({ players: Array.from({ length: n }, () => ({ resources: { coins: 9 } })), placements: [{ player: "p2", worker: 1, locationId: "magistrates_hall" }] });
      expect(verdict(state, "p1", hall("p1:shifu"))).toBe("LOCATION_FULL");
    }
    const four = buildState({ players: Array.from({ length: 4 }, () => ({ resources: { coins: 9 } })), placements: [{ player: "p2", worker: 1, locationId: "magistrates_hall" }] });
    expect(verdict(four, "p1", hall("p1:shifu"))).toBeNull();
  });

  it("never takes Senior Apprentice (R12)", () => {
    const state = buildState({ players: [{ techs: ["T18"], resources: { coins: 9 } }, {}] });
    expect(validatePlacement(actorViewOf(state, "p1"), "p1:apprentice:1", "magistrates_hall", true)?.code).toBe("SENIOR_APPRENTICE_NOT_APPLICABLE");
  });
});
