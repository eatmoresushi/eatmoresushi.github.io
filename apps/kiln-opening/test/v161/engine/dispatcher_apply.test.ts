/**
 * The dispatcher's success path (DESIGN §2.5) with test doubles in place of other packages'
 * modules, so it holds before and after they land: clone-then-resolve, revision and
 * `eventSequence`, the flow override, the RNG hand-through, `checkInvariants`, `createGame`
 * and `submitContribution`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { FLOW, applyAction, createGame, submitContribution } from "../../../src/game/engine.ts";
import { applyContribution, validateContribution } from "../../../src/game/firing/contributions.ts";
import { assertInvariants } from "../../../src/game/invariants.ts";
import { SeededRandom } from "../../../src/game/rng.ts";
import { createInitialState } from "../../../src/game/setup.ts";
import { emit } from "../../../src/game/state.ts";
import type {
  ActorView,
  GameEvent,
  GameState,
  PrivateFiringState,
  ResolveContext,
  SubmitContributionCommand,
} from "../../../src/game/types.ts";
import { completeWorkerAction } from "../../../src/game/work/turn.ts";
import { buildState } from "./support/fixtures.ts";
import { type FlowHalt, haltingFlow } from "./support/flow.ts";

const seen = vi.hoisted(() => ({ views: [] as unknown[], contexts: [] as unknown[], resolved: 0 }));

vi.mock("../../../src/game/work/centralSimple.ts", async () => {
  const { gain } = await import("../../../src/game/state.ts");
  const { placeWorker } = await import("../../../src/game/placement.ts");
  const { ruleError } = await import("../../../src/game/errors.ts");
  type Wharf = { workerId: string };
  return {
    handlers: {
      PLACE_CANAL_WHARF: {
        phases: ["work_turn"],
        validate: (view: unknown) => {
          seen.views.push(structuredClone(view));
          return null;
        },
        resolve: (draft: GameState, actorId: string, action: Wharf, ctx: ResolveContext) => {
          seen.contexts.push(ctx);
          seen.resolved += 1;
          placeWorker(draft, actorId, action.workerId, "canal_wharf", false, ctx);
          gain(draft, actorId, { coins: 2 }, "canal_wharf", ctx);
          ctx.flow.workerActionDone(draft, actorId, ctx);
        },
      },
      PLACE_MAGISTRATES_HALL: {
        phases: ["work_turn"],
        validate: () => ruleError("RECOGNITION_GATE", "Test double: always rejects.", {}),
        resolve: () => {
          seen.resolved += 1;
        },
      },
    },
  };
});

vi.mock("../../../src/game/work/turn.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/game/work/turn.ts")>()),
  completeWorkerAction: vi.fn(),
}));

vi.mock("../../../src/game/invariants.ts", () => ({ assertInvariants: vi.fn() }));

vi.mock("../../../src/game/setup.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/game/setup.ts")>()),
  createInitialState: vi.fn(),
}));

vi.mock("../../../src/game/firing/contributions.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/game/firing/contributions.ts")>()),
  validateContribution: vi.fn(),
  applyContribution: vi.fn(),
}));

beforeEach(() => {
  seen.views.length = 0;
  seen.contexts.length = 0;
  seen.resolved = 0;
  vi.mocked(completeWorkerAction).mockReset();
  vi.mocked(assertInvariants).mockReset();
  vi.mocked(createInitialState).mockReset();
  vi.mocked(validateContribution).mockReset();
  vi.mocked(applyContribution).mockReset();
});

const WHARF = { type: "PLACE_CANAL_WHARF", workerId: "p1:apprentice:1" } as const;

describe("applyAction", () => {
  it("resolves on a clone, bumps the revision once and counts the events", () => {
    const state = buildState({ players: [{ hand: ["S01", "O10"] }, {}] });
    state.revision = 7;
    state.eventSequence = 40;
    const before = structuredClone(state);
    const halts: FlowHalt[] = [];
    const result = applyAction(state, "p1", WHARF, new SeededRandom(3), { flow: haltingFlow(halts) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(state).toEqual(before);
    expect(result.state).not.toBe(state);
    expect(result.state.revision).toBe(8);
    expect(result.events.map((event) => event.type)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED"]);
    expect(result.state.eventSequence).toBe(42);
    expect(result.state.players["p1"]?.resources.coins).toBe(5);
    expect(halts).toEqual([{ kind: "worker_action_done", playerId: "p1" }]);
    expect(completeWorkerAction).not.toHaveBeenCalled();
  });

  it("validates on the actor's view: no hidden state, the actor's own hand only", () => {
    const state = buildState({ players: [{ hand: ["S01", "O10"] }, { hand: ["S02"] }] });
    applyAction(state, "p1", WHARF, new SeededRandom(1), { flow: haltingFlow([]) });
    const view = seen.views[0] as ActorView;
    expect(view.viewerId).toBe("p1");
    expect("hidden" in view.game).toBe(false);
    expect(view.own.orderHand).toEqual(["S01", "O10"]);
    expect(view.game.counts.orderHands).toEqual({ p1: 2, p2: 1 });
  });

  it("uses the production FLOW by default and passes the caller's RNG", () => {
    const rng = new SeededRandom(9);
    const result = applyAction(buildState(), "p1", WHARF, rng);
    expect(result.ok).toBe(true);
    const ctx = seen.contexts[0] as ResolveContext;
    expect(ctx.flow).toBe(FLOW);
    expect(ctx.rng).toBe(rng);
    expect(completeWorkerAction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(completeWorkerAction).mock.calls[0]?.[1]).toBe("p1");
    expect(vi.mocked(completeWorkerAction).mock.calls[0]?.[2]).toBe(ctx);
  });

  it("returns the validator's error without resolving", () => {
    const state = buildState();
    const before = structuredClone(state);
    const result = applyAction(state, "p1", { type: "PLACE_MAGISTRATES_HALL", workerId: "p1:shifu" }, new SeededRandom(1));
    expect(result).toEqual({ ok: false, error: { code: "RECOGNITION_GATE", message: "Test double: always rejects.", details: {} } });
    expect(seen.resolved).toBe(0);
    expect(state).toEqual(before);
  });

  it("runs assertInvariants on the new state only when asked", () => {
    const off = applyAction(buildState(), "p1", WHARF, new SeededRandom(1), { flow: haltingFlow([]) });
    expect(off.ok).toBe(true);
    expect(assertInvariants).not.toHaveBeenCalled();
    const on = applyAction(buildState(), "p1", WHARF, new SeededRandom(1), { flow: haltingFlow([]), checkInvariants: true });
    expect(on.ok).toBe(true);
    expect(assertInvariants).toHaveBeenCalledTimes(1);
    if (on.ok) {
      expect(vi.mocked(assertInvariants).mock.calls[0]?.[0]).toBe(on.state);
    }
  });
});

describe("createGame", () => {
  it("returns setup's state with eventSequence equal to the persisted creation events", () => {
    const events: GameEvent[] = [
      { type: "GAME_CREATED", playerOrder: ["p1", "p2"], firstPlayerId: "p1", playerCount: 2 },
      { type: "ORDERS_DEALT", playerId: "p1", startingCount: 2, mainCount: 1, secret: { visibleTo: "p1", startingOrderIds: ["S01", "S02"], mainOrderIds: ["O01"] } },
    ];
    vi.mocked(createInitialState).mockImplementation(() => ({ ok: true, state: buildState(), events }));
    const rng = new SeededRandom(5);
    const result = createGame({ gameId: "g", players: [{ id: "p1", displayName: "A" }, { id: "p2", displayName: "B" }] }, rng, {
      checkInvariants: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.eventSequence).toBe(2);
    expect(result.events).toBe(events);
    expect(vi.mocked(createInitialState).mock.calls[0]?.[1]).toBe(rng);
    expect(assertInvariants).toHaveBeenCalledWith(result.state);
  });

  it("passes setup failures through", () => {
    const error = { code: "INVALID_SETUP" as const, message: "Two to four players are required.", details: { players: 1 } };
    vi.mocked(createInitialState).mockReturnValue({ ok: false, error });
    expect(createGame({ gameId: "g", players: [{ id: "p1", displayName: "A" }] }, new SeededRandom(1))).toEqual({ ok: false, error });
    expect(assertInvariants).not.toHaveBeenCalled();
  });
});

describe("submitContribution", () => {
  const WINDOW = "test-game:r1:contributions";

  function windowState(): GameState {
    return buildState({
      phase: { type: "firing_contributions", windowId: WINDOW, eligiblePlayerIds: ["p1", "p2"], submittedPlayerIds: [] },
    });
  }

  const command: SubmitContributionCommand = { type: "SUBMIT_CONTRIBUTION", windowId: WINDOW, card: "FUEL_LEDGER_BANK" };

  it("validates on the actor's view including its sealed choice, then applies on clones", () => {
    vi.mocked(validateContribution).mockReturnValue(null);
    vi.mocked(applyContribution).mockImplementation((draft, privateDraft, actorId, cmd, ctx) => {
      privateDraft.submissions[actorId] = { card: cmd.card };
      if (draft.phase.type === "firing_contributions") {
        draft.phase.submittedPlayerIds.push(actorId);
      }
      emit(ctx, { type: "CONTRIBUTION_SUBMITTED", playerId: actorId, windowId: cmd.windowId });
    });
    const state = windowState();
    const sealed: PrivateFiringState = { gameId: "test-game", windowId: WINDOW, submissions: { p2: { card: "TEND" } } };
    const before = structuredClone(state);
    const sealedBefore = structuredClone(sealed);
    const result = submitContribution(state, sealed, "p2", { ...command, card: "STOKE" }, new SeededRandom(1));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [view, privateArg] = vi.mocked(validateContribution).mock.calls[0]!;
    expect(view.viewerId).toBe("p2");
    expect(view.own.pendingContribution).toEqual({ card: "TEND", windowId: WINDOW });
    expect(privateArg).toBe(sealed);
    expect(state).toEqual(before);
    expect(sealed).toEqual(sealedBefore);
    expect(result.privateState.submissions["p2"]).toEqual({ card: "STOKE" });
    expect(result.state.revision).toBe(1);
    expect(result.state.eventSequence).toBe(1);
    expect(result.events).toEqual([{ type: "CONTRIBUTION_SUBMITTED", playerId: "p2", windowId: WINDOW }]);
  });

  it("returns validateContribution's error without applying", () => {
    const error = { code: "NOT_CONTRIBUTOR" as const, message: "Only players with a ceramic in the Shared Kiln contribute.", details: {} };
    vi.mocked(validateContribution).mockReturnValue(error);
    const result = submitContribution(windowState(), { gameId: "test-game", windowId: WINDOW, submissions: {} }, "p1", command, new SeededRandom(1));
    expect(result).toEqual({ ok: false, error });
    expect(applyContribution).not.toHaveBeenCalled();
  });
});
