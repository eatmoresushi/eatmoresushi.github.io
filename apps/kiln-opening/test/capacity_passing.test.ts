import { describe, expect, it } from "vitest";
import { applyAction, locationCapacity } from "../src/game";
import type { GameAction, LocationId, PlayerCount } from "../src/game";
import { expectError, mustApply, setActive, startedGame, workerId } from "./helpers";

const capacities: Record<LocationId, Record<PlayerCount, number>> = {
  labour: { 2: 12, 3: 18, 4: 24 },
  court_patronage: { 2: 12, 3: 18, 4: 24 },
  materials_yard: { 2: 2, 3: 3, 4: 4 },
  forming_studio: { 2: 2, 3: 3, 4: 4 },
  glaze_workshop: { 2: 2, 3: 3, 4: 4 },
  kiln_yard: { 2: 3, 3: 4, 4: 5 },
  market_imperial_office: { 2: 2, 3: 3, 4: 4 },
  guild_academy: { 2: 1, 3: 2, 4: 3 },
};

function actionFor(locationId: LocationId, selectedWorkerId: string): GameAction {
  switch (locationId) {
    case "labour":
      return { type: "USE_LABOUR", workerId: selectedWorkerId };
    case "court_patronage":
      return { type: "USE_COURT_PATRONAGE", workerId: selectedWorkerId };
    case "materials_yard":
      return { type: "GAIN_MATERIALS", workerId: selectedWorkerId, clay: 3, wood: 0 };
    case "forming_studio":
      return { type: "FORM_CERAMICS", workerId: selectedWorkerId, shapes: [] };
    case "glaze_workshop":
      return {
        type: "GLAZE_CERAMICS",
        workerId: selectedWorkerId,
        selections: [],
        shifuMode: "normal",
      };
    case "kiln_yard":
      return {
        type: "USE_KILN_YARD",
        workerId: selectedWorkerId,
        loads: [],
      };
    case "market_imperial_office":
      return { type: "BEGIN_OFFICE_ORDERS", workerId: selectedWorkerId, mode: "take_one" };
    case "guild_academy":
      return { type: "BEGIN_GUILD_ACTION", workerId: selectedWorkerId };
  }
}

describe("action capacity", () => {
  it.each([2, 3, 4] as const)("matches every structured capacity at %s players", (count) => {
    for (const locationId of Object.keys(capacities) as LocationId[]) {
      expect(locationCapacity(locationId, count)).toBe(capacities[locationId][count]);
    }
  });

  it.each([2, 3, 4] as const)("rejects every capped location when full at %s players", (count) => {
    for (const locationId of Object.keys(capacities) as LocationId[]) {
      // Labour is deliberately uncapped, so it has no full state to reject.
      if (locationId === "labour" || locationId === "court_patronage") continue;
      const { state, rng } = startedGame(count, 4000 + count * 100 + locationId.length);
      const actorId = state.firstPlayerId;
      const capacity = capacities[locationId][count];
      state.actionBoard.placements[locationId] = Array.from(
        { length: capacity },
        (_, index) => `occupied:${index}`,
      );
      const result = applyAction(
        state,
        actorId,
        actionFor(locationId, workerId(state, actorId, "apprentice")),
        rng,
      );
      expectError(result, "LOCATION_FULL");
    }
  });

  /**
   * Labour exists so that a worker always has somewhere to go. Its capacity is every
   * worker that could exist at that player count, so it can never fill.
   */
  it.each([2, 3, 4] as const)("never fills Labour at %s players", (count) => {
    const maxWorkersInPlay = count * 6;
    expect(locationCapacity("labour", count)).toBeGreaterThanOrEqual(maxWorkersInPlay);
    const { state, rng } = startedGame(count, 4700 + count);
    const actorId = state.firstPlayerId;
    state.actionBoard.placements["labour"] = Array.from(
      { length: maxWorkersInPlay - 1 },
      (_, index) => `occupied:${index}`,
    );
    const result = applyAction(
      state,
      actorId,
      { type: "USE_LABOUR", workerId: workerId(state, actorId, "apprentice") },
      rng,
    );
    expect(result.ok).toBe(true);
  });

  it("allows a player to occupy the same location more than once while space remains", () => {
    let { state, rng } = startedGame(2, 410);
    const actorId = state.firstPlayerId;
    const otherId = state.playerOrder.find((id) => id !== actorId)!;
    setActive(state, otherId);
    state = mustApply(state, otherId, { type: "PASS_WORK_PHASE" }, rng);
    expect(state.phase).toEqual({ type: "work", activePlayerId: actorId });

    state = mustApply(
      state,
      actorId,
      {
        type: "GAIN_MATERIALS",
        workerId: workerId(state, actorId, "apprentice"),
        clay: 1,
        wood: 2,
      },
      rng,
    );
    expect(state.phase).toEqual({ type: "work", activePlayerId: actorId });
    state = mustApply(
      state,
      actorId,
      {
        type: "GAIN_MATERIALS",
        workerId: workerId(state, actorId, "apprentice"),
        clay: 3,
        wood: 0,
      },
      rng,
    );
    expect(state.actionBoard.placements.materials_yard).toHaveLength(2);
    expect(
      state.actionBoard.placements.materials_yard.every((id) => id.startsWith(`${actorId}:`)),
    ).toBe(true);
  });
});

describe("passing and Work turn rotation", () => {
  it("allows passing with all workers unused, permanently skips that player, and gives no benefit", () => {
    let { state, rng } = startedGame(2, 420);
    const firstId = state.firstPlayerId;
    const secondId = state.playerOrder.find((id) => id !== firstId)!;
    const resourcesBefore = { ...state.players[firstId]!.resources };
    const workersBefore = Object.values(state.players[firstId]!.workers).filter(
      (worker) => worker.status === "available",
    ).length;

    state = mustApply(state, firstId, { type: "PASS_WORK_PHASE" }, rng);
    expect(state.players[firstId]!.passedWorkPhase).toBe(true);
    expect(state.players[firstId]!.resources).toEqual(resourcesBefore);
    expect(
      Object.values(state.players[firstId]!.workers).filter((worker) => worker.status === "available"),
    ).toHaveLength(workersBefore);
    expect(state.phase).toEqual({ type: "work", activePlayerId: secondId });

    state = mustApply(
      state,
      secondId,
      {
        type: "GAIN_MATERIALS",
        workerId: workerId(state, secondId, "apprentice"),
        clay: 0,
        wood: 3,
      },
      rng,
    );
    expect(state.phase).toEqual({ type: "work", activePlayerId: secondId });

    state = mustApply(state, secondId, { type: "PASS_WORK_PHASE" }, rng);
    expect(state.phase).toEqual(
      expect.objectContaining({ type: "orders", activePlayerId: state.firstPlayerId }),
    );
  });

  it("rejects out-of-turn actions without mutating state", () => {
    const { state, rng } = startedGame(3, 421);
    const inactiveId = state.playerOrder.find((id) => id !== state.firstPlayerId)!;
    const before = JSON.parse(JSON.stringify(state));
    const result = applyAction(
      state,
      inactiveId,
      {
        type: "GAIN_MATERIALS",
        workerId: workerId(state, inactiveId, "apprentice"),
        clay: 1,
        wood: 2,
      },
      rng,
    );
    expectError(result, "NOT_ACTIVE_PLAYER");
    expect(state).toEqual(before);
  });

  it("does not permit passing in the middle of an unresolved Office or Guild action", () => {
    const office = startedGame(2, 422);
    const officeActor = office.state.firstPlayerId;
    const pendingOffice = mustApply(
      office.state,
      officeActor,
      {
        type: "BEGIN_OFFICE_ORDERS",
        workerId: workerId(office.state, officeActor, "shifu"),
        mode: "take_up_to_two",
      },
      office.rng,
    );
    expectError(
      applyAction(pendingOffice, officeActor, { type: "PASS_WORK_PHASE" }, office.rng),
      "WRONG_PHASE",
    );
    // Labour is not an Office action: it resolves in one step and never strands the
    // player in a sub-phase, which is what makes it a safe fallback for an idle worker.
    const afterLabour = mustApply(
      office.state,
      officeActor,
      {
        type: "USE_LABOUR",
        workerId: workerId(office.state, officeActor, "apprentice"),
      },
      office.rng,
    );
    expect(afterLabour.phase.type).toBe("work");

    const guild = startedGame(2, 423);
    const guildActor = guild.state.firstPlayerId;
    const pendingGuild = mustApply(
      guild.state,
      guildActor,
      { type: "BEGIN_GUILD_ACTION", workerId: workerId(guild.state, guildActor, "shifu") },
      guild.rng,
    );
    expectError(
      applyAction(pendingGuild, guildActor, { type: "PASS_WORK_PHASE" }, guild.rng),
      "WRONG_PHASE",
    );
  });
});
