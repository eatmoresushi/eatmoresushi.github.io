/**
 * Flow hand-overs (DESIGN §2.2, §2.5, §8.1): `haltingFlow` records every hand-over, and the
 * production `FLOW` maps each milestone and `workerActionDone` to the §2.5 openers. The
 * openers are replaced by spies, so this holds before and after their packages land.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { FLOW, FLOW_OPENERS } from "../../../src/game/engine.ts";
import { openFiringPhase } from "../../../src/game/firing/contributions.ts";
import { openOrderPhase } from "../../../src/game/orders/phase.ts";
import { openCleanup, startRound } from "../../../src/game/round.ts";
import { finishGame } from "../../../src/game/scoring.ts";
import type { FlowMilestone, GameState, ResolveContext } from "../../../src/game/types.ts";
import { completeWorkerAction, openWorkPhase } from "../../../src/game/work/turn.ts";
import { buildState, testContext } from "./support/fixtures.ts";
import { type FlowHalt, haltingFlow } from "./support/flow.ts";
import { LocalTable } from "./support/localTable.ts";

vi.mock("../../../src/game/round.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/game/round.ts")>()),
  startRound: vi.fn(),
  openCleanup: vi.fn(),
}));
vi.mock("../../../src/game/work/turn.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/game/work/turn.ts")>()),
  openWorkPhase: vi.fn(),
  completeWorkerAction: vi.fn(),
}));
vi.mock("../../../src/game/firing/contributions.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/game/firing/contributions.ts")>()),
  openFiringPhase: vi.fn(),
}));
vi.mock("../../../src/game/orders/phase.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/game/orders/phase.ts")>()),
  openOrderPhase: vi.fn(),
}));
vi.mock("../../../src/game/scoring.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/game/scoring.ts")>()),
  finishGame: vi.fn(),
}));
vi.mock("../../../src/game/work/centralSimple.ts", async () => {
  const { gain } = await import("../../../src/game/state.ts");
  const { placeWorker } = await import("../../../src/game/placement.ts");
  return {
    handlers: {
      PLACE_CANAL_WHARF: {
        phases: ["work_turn"],
        validate: () => null,
        resolve: (draft: GameState, actorId: string, action: { workerId: string }, ctx: ResolveContext) => {
          placeWorker(draft, actorId, action.workerId, "canal_wharf", false, ctx);
          gain(draft, actorId, { coins: 2 }, "canal_wharf", ctx);
          ctx.flow.workerActionDone(draft, actorId, ctx);
        },
      },
      PLACE_MAGISTRATES_HALL: { phases: ["work_turn"], validate: () => null, resolve: () => undefined },
    },
  };
});

const OPENERS = {
  setup_done: startRound,
  round_start_done: openWorkPhase,
  work_phase_done: openFiringPhase,
  firing_done: openOrderPhase,
  order_phase_done: openCleanup,
  cleanup_done: startRound,
  game_over: finishGame,
} as const satisfies Record<FlowMilestone, unknown>;

const ALL_SPIES = [startRound, openCleanup, openWorkPhase, completeWorkerAction, openFiringPhase, openOrderPhase, finishGame];

beforeEach(() => {
  for (const spy of ALL_SPIES) {
    vi.mocked(spy).mockReset();
  }
});

describe("production FLOW (DESIGN §2.5 table)", () => {
  it("FLOW_OPENERS names the §2.5 opener of every milestone", () => {
    expect(Object.keys(FLOW_OPENERS).sort()).toEqual(Object.keys(OPENERS).sort());
    for (const milestone of Object.keys(OPENERS) as FlowMilestone[]) {
      expect(FLOW_OPENERS[milestone], milestone).toBe(OPENERS[milestone]);
    }
  });

  it.each(Object.keys(OPENERS) as FlowMilestone[])("continueAfter(%s) calls only its opener with the draft and context", (milestone) => {
    const draft = buildState();
    const ctx = testContext(1, FLOW);
    FLOW.continueAfter(milestone, draft, ctx);
    const opener = vi.mocked(OPENERS[milestone]);
    expect(opener).toHaveBeenCalledTimes(1);
    expect(opener).toHaveBeenCalledWith(draft, ctx);
    const others = ALL_SPIES.filter((spy) => spy !== OPENERS[milestone]);
    for (const spy of others) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("workerActionDone calls work/turn.completeWorkerAction", () => {
    const draft = buildState();
    const ctx = testContext(1, FLOW);
    FLOW.workerActionDone(draft, "p2", ctx);
    expect(completeWorkerAction).toHaveBeenCalledWith(draft, "p2", ctx);
  });
});

describe("haltingFlow", () => {
  it("records every hand-over in order and leaves the draft as it was", () => {
    const halts: FlowHalt[] = [];
    const flow = haltingFlow(halts);
    const draft = buildState();
    const before = structuredClone(draft);
    const ctx = testContext(1, flow);
    flow.workerActionDone(draft, "p1", ctx);
    flow.continueAfter("work_phase_done", draft, ctx);
    flow.continueAfter("game_over", draft, ctx);
    expect(halts).toEqual([
      { kind: "worker_action_done", playerId: "p1" },
      { kind: "continue_after", milestone: "work_phase_done" },
      { kind: "continue_after", milestone: "game_over" },
    ]);
    expect(draft).toEqual(before);
    for (const spy of ALL_SPIES) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("passes chosen hand-overs to production wiring, keeping itself in ctx.flow", () => {
    vi.mocked(startRound).mockImplementation((draft, ctx) => {
      ctx.flow.continueAfter("round_start_done", draft, ctx);
    });
    const halts: FlowHalt[] = [];
    const flow = haltingFlow(halts, { pass: ["setup_done"] });
    const draft = buildState();
    flow.continueAfter("setup_done", draft, testContext(1, flow));
    expect(startRound).toHaveBeenCalledTimes(1);
    expect(openWorkPhase).not.toHaveBeenCalled();
    expect(halts).toEqual([{ kind: "continue_after", milestone: "round_start_done" }]);
  });
});

describe("LocalTable", () => {
  it('{ flow: "halt" } stops at the worker-action hand-over with the resolver\'s state', () => {
    const table = new LocalTable(buildState(), { flow: "halt" });
    const events = table.act("p1", { type: "PLACE_CANAL_WHARF", workerId: "p1:apprentice:1" });
    expect(events.map((event) => event.type)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED"]);
    expect(table.halts).toEqual([{ kind: "worker_action_done", playerId: "p1" }]);
    expect(table.player("p1").resources.coins).toBe(5);
    expect(table.state.revision).toBe(1);
    expect(table.events).toEqual(events);
    expect(completeWorkerAction).not.toHaveBeenCalled();
  });

  it('{ flow: "full" } reaches work/turn; `pass` reaches it from a halting table', () => {
    new LocalTable(buildState()).act("p1", { type: "PLACE_CANAL_WHARF", workerId: "p1:shifu" });
    expect(completeWorkerAction).toHaveBeenCalledTimes(1);
    const passing = new LocalTable(buildState(), { flow: "halt", pass: ["worker_action_done"] });
    passing.act("p1", { type: "PLACE_CANAL_WHARF", workerId: "p1:shifu" });
    expect(completeWorkerAction).toHaveBeenCalledTimes(2);
    expect(passing.halts).toEqual([]);
  });

  it("expectRuleError asserts the code and an unchanged state", () => {
    const table = new LocalTable(buildState(), { flow: "halt" });
    const error = table.expectRuleError("p2", { type: "PLACE_CANAL_WHARF", workerId: "p2:shifu" }, "NOT_YOUR_DECISION");
    expect(error.code).toBe("NOT_YOUR_DECISION");
    expect(table.state.revision).toBe(0);
    expect(() => table.act("p2", { type: "END_TURN" })).toThrow(/NOT_YOUR_DECISION/);
  });

  it("opens a private window matching an open Contribution window", () => {
    const table = new LocalTable(
      buildState({ phase: { type: "firing_contributions", windowId: "test-game:r1:contributions", eligiblePlayerIds: ["p1"], submittedPlayerIds: [] } }),
    );
    expect(table.privateState).toEqual({ gameId: "test-game", windowId: "test-game:r1:contributions", submissions: {} });
    expect(table.prompt()).toEqual({ phaseType: "firing_contributions", actorIds: ["p1"], mode: "simultaneous_secret" });
    expect(table.view("p1").own?.pendingContribution).toBeNull();
    expect(table.actorView("p1").viewerId).toBe("p1");
  });
});
