import { describe, expect, it } from "vitest";
import { InvariantError } from "../../../src/game/errors.ts";
import {
  availableWorkers,
  centralCapacity,
  nextPersonalSpace,
  placeWorker,
  validatePlacement,
  workerEffectFor,
  workersAt,
} from "../../../src/game/placement.ts";
import type { GameState, PlayerCount } from "../../../src/game/types.ts";
import { actorViewOf } from "../../../src/game/view.ts";
import { buildState, testContext, type StateSpec } from "./support/fixtures.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

function check(state: GameState, actorId: string, workerId: string, locationId: Parameters<typeof validatePlacement>[2], senior = false) {
  const error = validatePlacement(actorViewOf(state, actorId), workerId, locationId, senior);
  if (error !== null) {
    expectDocumentedDetails(error);
  }
  return error?.code ?? null;
}

describe("availableWorkers / workersAt", () => {
  it("lists the Shifu first, then Apprentices by ID, excluding placed workers", () => {
    const state = buildState({ placements: [{ player: "p1", worker: 2, locationId: "canal_wharf" }] });
    expect(availableWorkers(state, "p1").map((w) => w.id)).toEqual(["p1:shifu", "p1:apprentice:1", "p1:apprentice:3"]);
    expect(availableWorkers(state, "p2")).toHaveLength(4);
  });

  it("lists every worker at a location in placement order across players", () => {
    const state = buildState({
      players: 3,
      placements: [
        { player: "p3", worker: 1, locationId: "materials_yard" },
        { player: "p1", worker: "shifu", locationId: "canal_wharf" },
        { player: "p1", worker: 1, locationId: "materials_yard" },
        { player: "p2", worker: 3, locationId: "materials_yard" },
      ],
    });
    expect(workersAt(state, "materials_yard").map(({ playerId, worker }) => [playerId, worker.id])).toEqual([
      ["p3", "p3:apprentice:1"],
      ["p1", "p1:apprentice:1"],
      ["p2", "p2:apprentice:3"],
    ]);
  });
});

describe("capacity (L140, L148–156)", () => {
  it.each([2, 3, 4] as const)("%i players: Materials Yard, Commission Market and Guild Hall hold n; Canal Wharf is uncapped", (n: PlayerCount) => {
    const state = buildState({ players: n });
    expect(centralCapacity(state, "materials_yard")).toBe(n);
    expect(centralCapacity(state, "commission_market")).toBe(n);
    expect(centralCapacity(state, "guild_hall")).toBe(n);
    expect(centralCapacity(state, "canal_wharf")).toBeNull();
    expect(centralCapacity(state, "magistrates_hall")).toBe(n === 4 ? 2 : 1);
  });

  it("capacity is absolute: neither an Apprentice nor the Shifu may overfill (L140)", () => {
    const state = buildState({
      placements: [
        { player: "p2", worker: 1, locationId: "materials_yard" },
        { player: "p1", worker: 1, locationId: "materials_yard" },
      ],
    });
    expect(check(state, "p1", "p1:shifu", "materials_yard")).toBe("LOCATION_FULL");
    expect(check(state, "p1", "p1:apprentice:2", "materials_yard")).toBe("LOCATION_FULL");
    expect(check(state, "p1", "p1:shifu", "guild_hall")).toBeNull();
  });

  it("the Magistrate's Hall has 1 space at 2 players and 2 at 4 (L225), usable twice by one player", () => {
    const two = buildState({ placements: [{ player: "p2", worker: "shifu", locationId: "magistrates_hall" }] });
    expect(check(two, "p1", "p1:apprentice:1", "magistrates_hall")).toBe("LOCATION_FULL");
    const four = buildState({ players: 4, placements: [{ player: "p1", worker: 1, locationId: "magistrates_hall" }] });
    expect(check(four, "p1", "p1:apprentice:2", "magistrates_hall")).toBeNull();
  });

  it("the Canal Wharf always takes another worker (L143)", () => {
    const spec: StateSpec = {
      players: 4,
      placements: ["p2", "p3", "p4"].flatMap((player) =>
        (["shifu", 1, 2, 3] as const).map((worker) => ({ player, worker, locationId: "canal_wharf" as const })),
      ),
    };
    expect(check(buildState(spec), "p1", "p1:apprentice:1", "canal_wharf")).toBeNull();
  });
});

describe("personal spaces (L144, L212)", () => {
  it("uses space 0, then needs the unlocked space 1; each once per round", () => {
    const locked = buildState({ placements: [{ player: "p1", worker: 1, locationId: "form_decorate" }] });
    expect(nextPersonalSpace(locked, "p1", "form_decorate")).toBeNull();
    expect(check(locked, "p1", "p1:shifu", "form_decorate")).toBe("PERSONAL_SPACE_LOCKED");
    expect(check(locked, "p1", "p1:shifu", "glaze_load")).toBeNull();

    const unlocked = buildState({
      players: [{ techs: ["T01"] }, {}],
      placements: [{ player: "p1", worker: 1, locationId: "form_decorate" }],
    });
    expect(nextPersonalSpace(unlocked, "p1", "form_decorate")).toBe(1);
    expect(check(unlocked, "p1", "p1:shifu", "form_decorate")).toBeNull();

    const full = buildState({
      players: [{ techs: ["T01"] }, {}],
      placements: [
        { player: "p1", worker: 1, locationId: "form_decorate" },
        { player: "p1", worker: 2, locationId: "form_decorate" },
      ],
    });
    expect(check(full, "p1", "p1:shifu", "form_decorate")).toBe("PERSONAL_SPACE_USED");
  });

  it("another player's personal location never limits yours", () => {
    const state = buildState({ placements: [{ player: "p2", worker: 1, locationId: "glaze_load" }] });
    expect(nextPersonalSpace(state, "p1", "glaze_load")).toBe(0);
  });
});

describe("validatePlacement: turn and worker checks", () => {
  it("requires the Work Phase, the active player and the before-action step", () => {
    expect(check(buildState({ phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 } }), "p1", "p1:shifu", "canal_wharf")).toBe(
      "WRONG_PHASE",
    );
    expect(check(buildState(), "p2", "p2:shifu", "canal_wharf")).toBe("NOT_YOUR_DECISION");
    const after = buildState({ phase: { type: "work_turn", activePlayerId: "p1", step: { kind: "after_action" } } });
    expect(check(after, "p1", "p1:shifu", "canal_wharf")).toBe("WORKER_ACTION_ALREADY_TAKEN");
  });

  it("requires one of your own available workers", () => {
    const state = buildState({ placements: [{ player: "p1", worker: "shifu", locationId: "canal_wharf" }] });
    expect(check(state, "p1", "p1:shifu", "canal_wharf")).toBe("WORKER_UNAVAILABLE");
    expect(check(state, "p1", "p2:apprentice:1", "canal_wharf")).toBe("WORKER_UNAVAILABLE");
    expect(check(state, "p1", "p1:apprentice:9", "canal_wharf")).toBe("WORKER_UNAVAILABLE");
  });
});

describe("Senior Apprentice (L619, L653, R12)", () => {
  const owner = { techs: ["T18" as const] };

  it("lets 1 Apprentice resolve the Shifu effect at the Materials Yard or Commission Market", () => {
    const state = buildState({ players: [owner, {}] });
    expect(check(state, "p1", "p1:apprentice:1", "materials_yard", true)).toBeNull();
    expect(check(state, "p1", "p1:apprentice:1", "commission_market", true)).toBeNull();
    expect(workerEffectFor(actorViewOf(state, "p1"), "p1:apprentice:1", true)).toBe("shifu");
    expect(workerEffectFor(actorViewOf(state, "p1"), "p1:apprentice:1", false)).toBe("apprentice");
    expect(workerEffectFor(actorViewOf(state, "p1"), "p1:shifu", false)).toBe("shifu");
  });

  it("never applies to the Shifu, at the Magistrate's Hall or at other locations", () => {
    const state = buildState({ players: [owner, {}] });
    expect(check(state, "p1", "p1:shifu", "materials_yard", true)).toBe("SENIOR_APPRENTICE_NOT_APPLICABLE");
    expect(check(state, "p1", "p1:apprentice:1", "magistrates_hall", true)).toBe("SENIOR_APPRENTICE_NOT_APPLICABLE");
    expect(check(state, "p1", "p1:apprentice:1", "guild_hall", true)).toBe("SENIOR_APPRENTICE_NOT_APPLICABLE");
    expect(check(state, "p1", "p1:apprentice:1", "form_decorate", true)).toBe("SENIOR_APPRENTICE_NOT_APPLICABLE");
  });

  it("needs the Tech, unused this round", () => {
    expect(check(buildState(), "p1", "p1:apprentice:1", "materials_yard", true)).toBe("TECH_NOT_OWNED");
    const used = buildState({ players: [{ techs: [{ id: "T18", usedThisRound: true }] }, {}] });
    expect(check(used, "p1", "p1:apprentice:1", "materials_yard", true)).toBe("TECH_ALREADY_USED");
  });
});

describe("placeWorker", () => {
  it("records the placement, advances the sequence and emits WORKER_PLACED", () => {
    const state = buildState({ placements: [{ player: "p2", worker: 1, locationId: "materials_yard" }] });
    const ctx = testContext();
    const placement = placeWorker(state, "p1", "p1:shifu", "materials_yard", false, ctx);
    expect(placement).toEqual({ locationId: "materials_yard", spaceIndex: 1, effect: "shifu", viaSeniorApprentice: false, sequence: 1 });
    expect(state.players["p1"]?.workers["p1:shifu"]?.placement).toEqual(placement);
    expect(state.placementSequence).toBe(2);
    expect(ctx.events).toEqual([
      {
        type: "WORKER_PLACED",
        playerId: "p1",
        workerId: "p1:shifu",
        kind: "shifu",
        locationId: "materials_yard",
        spaceIndex: 1,
        effect: "shifu",
        viaSeniorApprentice: false,
      },
    ]);
  });

  it("takes the next free unlocked personal space", () => {
    const state = buildState({
      players: [{ techs: ["T21"] }, {}],
      placements: [{ player: "p1", worker: 1, locationId: "glaze_load" }],
    });
    const placement = placeWorker(state, "p1", "p1:apprentice:2", "glaze_load", false, testContext());
    expect(placement.spaceIndex).toBe(1);
    expect(placement.effect).toBe("apprentice");
  });

  it("with Senior Apprentice resolves the Shifu effect and marks T18 used (TECH_USED after WORKER_PLACED)", () => {
    const state = buildState({ players: [{ techs: ["T18"] }, {}] });
    const ctx = testContext();
    const placement = placeWorker(state, "p1", "p1:apprentice:3", "commission_market", true, ctx);
    expect(placement).toMatchObject({ effect: "shifu", viaSeniorApprentice: true });
    expect(state.players["p1"]?.techs[0]?.usedThisRound).toBe(true);
    expect(ctx.events.map((event) => event.type)).toEqual(["WORKER_PLACED", "TECH_USED"]);
  });

  it("treats an unavailable worker as an engine bug", () => {
    const state = buildState({ placements: [{ player: "p1", worker: 1, locationId: "canal_wharf" }] });
    expect(() => placeWorker(state, "p1", "p1:apprentice:1", "canal_wharf", false, testContext())).toThrow(InvariantError);
    expect(() => placeWorker(state, "p1", "p1:shifu", "canal_wharf", true, testContext())).toThrow(InvariantError);
  });
});
