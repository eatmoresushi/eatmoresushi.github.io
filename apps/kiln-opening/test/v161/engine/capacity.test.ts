/**
 * Absolute capacity by player count (L140, L148–156): Materials Yard, Commission Market and
 * Guild Hall 2/3/4; Magistrate's Hall 1/1/2; Canal Wharf uncapped. No worker, the Shifu
 * included, may overfill a location (L140–141). Personal locations are per player.
 *
 * P3's locations go through the full validator (`validateAction`); the Commission Market and
 * Guild Hall belong to P4, so their capacity is checked through the shared placement check
 * that their validators run first (`validatePlacement`, DESIGN §2.3).
 */

import { describe, expect, it } from "vitest";
import { validatePlacement } from "../../../src/game/placement.ts";
import type { CentralLocationId, GameAction, PlayerCount } from "../../../src/game/types.ts";
import { actorViewOf } from "../../../src/game/view.ts";
import type { PlacementSpec, PlayerSpec, StateSpec } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";
import { buildState, reject, table, verdict } from "./workshop_support.ts";

const CAPACITY: Record<CentralLocationId, Record<PlayerCount, number | null>> = {
  materials_yard: { 2: 2, 3: 3, 4: 4 },
  commission_market: { 2: 2, 3: 3, 4: 4 },
  guild_hall: { 2: 2, 3: 3, 4: 4 },
  canal_wharf: { 2: null, 3: null, 4: null },
  magistrates_hall: { 2: 1, 3: 1, 4: 2 },
};

/** `count` workers of the players after p1 (Apprentices first, then Shifu), round-robin. */
function others(n: PlayerCount, locationId: CentralLocationId, count: number): PlacementSpec[] {
  const placements: PlacementSpec[] = [];
  const workers = [1, 2, 3, "shifu"] as const;
  for (let index = 0; index < count; index += 1) {
    const player = `p${2 + (index % (n - 1))}`;
    const worker = workers[Math.floor(index / (n - 1))];
    if (worker === undefined) throw new Error("too many placements");
    placements.push({ player, worker, locationId });
  }
  return placements;
}

function rich(n: PlayerCount): PlayerSpec[] {
  return Array.from({ length: n }, () => ({ resources: { clay: 5, wood: 5, coins: 9 } }));
}

const PLACE: Record<"materials_yard" | "canal_wharf" | "magistrates_hall", (workerId: string) => GameAction> = {
  materials_yard: (workerId) => ({ type: "PLACE_MATERIALS_YARD", workerId, clay: workerId.endsWith("shifu") ? 4 : 3, wood: 0 }),
  canal_wharf: (workerId) => ({ type: "PLACE_CANAL_WHARF", workerId }),
  magistrates_hall: (workerId) => ({ type: "PLACE_MAGISTRATES_HALL", workerId }),
};

describe.each([2, 3, 4] as const)("%i players", (n) => {
  it.each(["materials_yard", "magistrates_hall"] as const)("%s holds exactly its capacity, Shifu included", (locationId) => {
    const capacity = CAPACITY[locationId][n] ?? 0;
    const almost = buildState({ players: rich(n), placements: others(n, locationId, capacity - 1) });
    expect(verdict(almost, "p1", PLACE[locationId]("p1:shifu"))).toBeNull();
    expect(verdict(almost, "p1", PLACE[locationId]("p1:apprentice:1"))).toBeNull();
    const full = buildState({ players: rich(n), placements: others(n, locationId, capacity) });
    expect(verdict(full, "p1", PLACE[locationId]("p1:shifu"))).toBe("LOCATION_FULL");
    expect(verdict(full, "p1", PLACE[locationId]("p1:apprentice:1"))).toBe("LOCATION_FULL");
  });

  it.each(["commission_market", "guild_hall"] as const)("%s holds exactly its capacity (shared placement check)", (locationId) => {
    const capacity = CAPACITY[locationId][n] ?? 0;
    const almost = buildState({ players: n, placements: others(n, locationId, capacity - 1) });
    expect(validatePlacement(actorViewOf(almost, "p1"), "p1:shifu", locationId, false)).toBeNull();
    const full = buildState({ players: n, placements: others(n, locationId, capacity) });
    expect(validatePlacement(actorViewOf(full, "p1"), "p1:shifu", locationId, false)?.code).toBe("LOCATION_FULL");
    expect(validatePlacement(actorViewOf(full, "p1"), "p1:apprentice:1", locationId, false)?.code).toBe("LOCATION_FULL");
  });

  it("the Canal Wharf is uncapped: every other worker in the game may already be there", () => {
    const state = buildState({ players: n, placements: others(n, "canal_wharf", 4 * (n - 1)) });
    expect(verdict(state, "p1", PLACE.canal_wharf("p1:shifu"))).toBeNull();
    expect(verdict(state, "p1", PLACE.canal_wharf("p1:apprentice:3"))).toBeNull();
  });

  it("your own workers count toward capacity like anyone's (L140)", () => {
    const capacity = CAPACITY.materials_yard[n] ?? 0;
    const own: PlacementSpec[] = ([1, 2, 3] as const).slice(0, capacity).map((worker) => ({ player: "p1", worker, locationId: "materials_yard" }));
    const state = buildState({ players: n, placements: [...own, ...others(n, "materials_yard", capacity - own.length)] });
    expect(verdict(state, "p1", PLACE.materials_yard("p1:shifu"))).toBe("LOCATION_FULL");
  });
});

describe("no Shifu overfill (L140–141; the V1.4 over-capacity rule is gone)", () => {
  it("multiple Shifu fill the Materials Yard like any worker, and then nobody fits", () => {
    const spec: StateSpec = {
      players: 4,
      placements: [
        { player: "p2", worker: "shifu", locationId: "materials_yard" },
        { player: "p3", worker: "shifu", locationId: "materials_yard" },
        { player: "p4", worker: "shifu", locationId: "materials_yard" },
      ],
    };
    const t = table(spec);
    t.act("p1", PLACE.materials_yard("p1:shifu"));
    reject(t, "p1", PLACE.materials_yard("p1:apprentice:1"), "LOCATION_FULL");
    expect(verdict(t.state, "p1", PLACE.canal_wharf("p1:apprentice:1"))).toBeNull();
  });

  it("through real turns: two Shifu fill a 2-player Materials Yard, then the next worker is refused", () => {
    const flowing = new LocalTable(buildState({ players: 2 }), { flow: "halt", pass: ["worker_action_done"] });
    flowing.act("p1", PLACE.materials_yard("p1:shifu"));
    expect(flowing.prompt().actorIds).toEqual(["p2"]);
    flowing.act("p2", PLACE.materials_yard("p2:shifu"));
    expect(flowing.prompt().actorIds).toEqual(["p1"]);
    reject(flowing, "p1", PLACE.materials_yard("p1:apprentice:1"), "LOCATION_FULL");
    flowing.act("p1", PLACE.canal_wharf("p1:apprentice:1"));
  });
});

describe("personal locations are per player (L144, L155–156)", () => {
  it("another player's Form & Decorate or Glaze & Load use never blocks yours", () => {
    const state = buildState({
      ceramics: [{ owner: "p1", shape: "bowl", stage: "shaped" }],
      placements: [
        { player: "p2", worker: "shifu", locationId: "form_decorate" },
        { player: "p2", worker: 1, locationId: "glaze_load" },
      ],
    });
    expect(
      verdict(state, "p1", { type: "PLACE_FORM_DECORATE", workerId: "p1:shifu", vessels: [{ shape: "bowl", decoration: "plain" }] }),
    ).toBeNull();
    expect(
      verdict(state, "p1", {
        type: "PLACE_GLAZE_LOAD",
        workerId: "p1:apprentice:1",
        loads: [{ ceramicId: "c1", glaze: "white", destination: { kiln: "shared", spaceId: "high_1" } }],
      }),
    ).toBeNull();
  });
});
