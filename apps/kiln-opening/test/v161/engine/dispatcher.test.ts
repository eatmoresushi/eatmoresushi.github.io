/**
 * Dispatcher checks that run before any action validator (DESIGN §2.5): GAME_FINISHED,
 * UNKNOWN_PLAYER, WRONG_PHASE, NOT_YOUR_DECISION, and the Contribution window gate. None of
 * these reach a handler, so they hold with P0's stub handlers and with the real ones.
 */

import { describe, expect, it } from "vitest";
import { COMMAND_TYPES } from "../../../src/game/actionGuard.ts";
import { HANDLERS, applyAction, submitContribution, validateAction } from "../../../src/game/engine.ts";
import { SeededRandom } from "../../../src/game/rng.ts";
import type {
  ActorView,
  GameAction,
  GamePhase,
  GameRuleErrorCode,
  GameState,
  PrivateFiringState,
  SubmitContributionCommand,
} from "../../../src/game/types.ts";
import { actorViewOf } from "../../../src/game/view.ts";
import { buildState } from "./support/fixtures.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

const WHARF: GameAction = { type: "PLACE_CANAL_WHARF", workerId: "p1:apprentice:1" };

function codeOf(view: ActorView, action: GameAction): GameRuleErrorCode | null {
  const error = validateAction(view, action);
  if (error !== null) {
    expectDocumentedDetails(error);
  }
  return error?.code ?? null;
}

function expectRejected(state: GameState, actorId: string, action: GameAction, code: GameRuleErrorCode): void {
  const before = structuredClone(state);
  const result = applyAction(state, actorId, action, new SeededRandom(1));
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe(code);
    expect(typeof result.error.message).toBe("string");
    expectDocumentedDetails(result.error);
  }
  expect(state).toEqual(before);
}

describe("handler table", () => {
  it("has exactly one handler per GameAction type", () => {
    const gameActions = COMMAND_TYPES.filter((type) => type !== "SUBMIT_CONTRIBUTION");
    expect(Object.keys(HANDLERS).sort()).toEqual([...gameActions].sort());
  });

  it("every handler names the phases it may run in", () => {
    for (const [type, handler] of Object.entries(HANDLERS)) {
      expect(handler.phases.length, type).toBeGreaterThan(0);
    }
    expect(HANDLERS.RESOLVE_JUN.phases).toEqual(expect.arrayContaining(["firing_heat_adjustment", "firing_second_firing_jun"]));
    expect(HANDLERS.SELECT_KILN.phases).toEqual(["setup_kiln_selection"]);
    expect(HANDLERS.SALVAGE_FLAWED.phases).toEqual(["firing_salvage"]);
  });
});

describe("validateAction", () => {
  it("GAME_FINISHED once the game is over, before anything else", () => {
    const state = buildState({ phase: { type: "finished" } });
    expect(codeOf(actorViewOf(state, "p1"), WHARF)).toBe("GAME_FINISHED");
    const ghost = { ...actorViewOf(state, "p1"), viewerId: "ghost" };
    expect(codeOf(ghost, WHARF)).toBe("GAME_FINISHED");
    expectRejected(state, "p2", { type: "END_ORDER_TURN" }, "GAME_FINISHED");
  });

  it("UNKNOWN_PLAYER for a viewer who is not seated", () => {
    const state = buildState();
    const ghost: ActorView = { ...actorViewOf(state, "p1"), viewerId: "ghost" };
    expect(codeOf(ghost, WHARF)).toBe("UNKNOWN_PLAYER");
    const proto: ActorView = { ...actorViewOf(state, "p1"), viewerId: "__proto__" };
    expect(codeOf(proto, WHARF)).toBe("UNKNOWN_PLAYER");
  });

  it("UNKNOWN_PLAYER from applyAction before any view is built, even when finished", () => {
    expectRejected(buildState(), "p9", WHARF, "UNKNOWN_PLAYER");
    expectRejected(buildState({ phase: { type: "finished" } }), "constructor", WHARF, "UNKNOWN_PLAYER");
  });

  const wrongPhase: Array<[GameAction, GamePhase]> = [
    [{ type: "SELECT_KILN", kilnId: "RU" }, { type: "work_turn", activePlayerId: "p1", step: { kind: "before_action" } }],
    [WHARF, { type: "orders", turnOrder: ["p1", "p2"], index: 0 }],
    [{ type: "END_ORDER_TURN" }, { type: "work_turn", activePlayerId: "p1", step: { kind: "after_action" } }],
    [{ type: "RESOLVE_JUN", adjustment: null }, { type: "firing_after_quality", queue: { actorIds: ["p1"], index: 0 } }],
    [{ type: "PLACE_SETTERS_MARK", spaceId: null }, { type: "setup_kiln_selection", selectionOrder: ["p2", "p1"], index: 1 }],
    [{ type: "DISCARD_TO_HAND_LIMIT", orderIds: [] }, { type: "firing_salvage", pendingPlayerIds: ["p1"], openedAtRevision: 0 }],
    [
      { type: "SALVAGE_FLAWED", ceramicId: null },
      { type: "firing_contributions", windowId: "w", eligiblePlayerIds: ["p1"], submittedPlayerIds: [] },
    ],
  ];

  it.each(wrongPhase.map(([action, phase]) => [action.type, phase.type, action, phase] as const))(
    "WRONG_PHASE: %s during %s",
    (_type, _phase, action, phase) => {
      const state = buildState({ phase });
      expect(codeOf(actorViewOf(state, "p1"), action)).toBe("WRONG_PHASE");
      expectRejected(state, "p1", action, "WRONG_PHASE");
    },
  );

  it("NOT_YOUR_DECISION for a seated player who is not an actor now", () => {
    const work = buildState();
    expect(codeOf(actorViewOf(work, "p2"), { type: "PLACE_CANAL_WHARF", workerId: "p2:apprentice:1" })).toBe("NOT_YOUR_DECISION");
    expectRejected(work, "p2", { type: "END_TURN" }, "NOT_YOUR_DECISION");

    const salvage = buildState({ players: 3, phase: { type: "firing_salvage", pendingPlayerIds: ["p1", "p3"], openedAtRevision: 0 } });
    expect(codeOf(actorViewOf(salvage, "p2"), { type: "SALVAGE_FLAWED", ceramicId: null })).toBe("NOT_YOUR_DECISION");

    const queue = buildState({ phase: { type: "firing_after_quality", queue: { actorIds: ["p1", "p2"], index: 1 } } });
    expect(codeOf(actorViewOf(queue, "p1"), { type: "END_AFTER_QUALITY" })).toBe("NOT_YOUR_DECISION");

    const setup = buildState({ phase: { type: "setup_kiln_selection", selectionOrder: ["p2", "p1"], index: 0 } });
    expect(codeOf(actorViewOf(setup, "p1"), { type: "SELECT_KILN", kilnId: "GE" })).toBe("NOT_YOUR_DECISION");

    const orders = buildState({ phase: { type: "orders", turnOrder: ["p2", "p1"], index: 0 } });
    expectRejected(orders, "p1", { type: "END_ORDER_TURN" }, "NOT_YOUR_DECISION");
  });

  it("MALFORMED_ACTION for an action type with no handler", () => {
    const state = buildState();
    const bogus = { type: "REVEAL_FIRE" } as unknown as GameAction;
    expect(codeOf(actorViewOf(state, "p1"), bogus)).toBe("MALFORMED_ACTION");
    const inherited = { type: "toString" } as unknown as GameAction;
    expect(codeOf(actorViewOf(state, "p1"), inherited)).toBe("MALFORMED_ACTION");
  });

  it("never mutates the view it validates", () => {
    const state = buildState({ phase: { type: "orders", turnOrder: ["p2", "p1"], index: 0 } });
    const view = actorViewOf(state, "p1");
    const before = structuredClone(view);
    validateAction(view, { type: "END_ORDER_TURN" });
    validateAction(view, WHARF);
    expect(view).toEqual(before);
  });
});

describe("submitContribution gate", () => {
  const WINDOW = "test-game:r1:contributions";

  function contributionState(): GameState {
    return buildState({
      phase: { type: "firing_contributions", windowId: WINDOW, eligiblePlayerIds: ["p1", "p2"], submittedPlayerIds: [] },
    });
  }

  function privateState(overrides: Partial<PrivateFiringState> = {}): PrivateFiringState {
    return { gameId: "test-game", windowId: WINDOW, submissions: {}, ...overrides };
  }

  function command(overrides: Partial<SubmitContributionCommand> = {}): SubmitContributionCommand {
    return { type: "SUBMIT_CONTRIBUTION", windowId: WINDOW, card: "TEND", fuelLedger: false, ...overrides };
  }

  function codeFor(state: GameState, sealed: PrivateFiringState, actorId: string, cmd: SubmitContributionCommand) {
    const before = structuredClone(state);
    const sealedBefore = structuredClone(sealed);
    const result = submitContribution(state, sealed, actorId, cmd, new SeededRandom(1));
    expect(state).toEqual(before);
    expect(sealed).toEqual(sealedBefore);
    if (!result.ok) {
      expectDocumentedDetails(result.error);
    }
    return result.ok ? null : result.error.code;
  }

  it("UNKNOWN_PLAYER and GAME_FINISHED", () => {
    expect(codeFor(contributionState(), privateState(), "p9", command())).toBe("UNKNOWN_PLAYER");
    expect(codeFor(buildState({ phase: { type: "finished" } }), privateState(), "p1", command())).toBe("GAME_FINISHED");
  });

  it("PRIVATE_WINDOW_MISMATCH (not WRONG_PHASE) when no Contribution window is open (§2.5 step 1)", () => {
    // A late submission that arrives after the last one revealed the window and the phase moved on.
    const state = buildState();
    expect(codeFor(state, privateState(), "p1", command())).toBe("PRIVATE_WINDOW_MISMATCH");
    const result = submitContribution(state, privateState({ windowId: null }), "p1", command(), new SeededRandom(1));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details).toEqual({ windowId: WINDOW });
    }
  });

  it("PRIVATE_WINDOW_MISMATCH when the command, private state or game does not match the open window", () => {
    const state = contributionState();
    expect(codeFor(state, privateState(), "p1", command({ windowId: "test-game:r0:contributions" }))).toBe("PRIVATE_WINDOW_MISMATCH");
    expect(codeFor(state, privateState({ windowId: null }), "p1", command())).toBe("PRIVATE_WINDOW_MISMATCH");
    expect(codeFor(state, privateState({ windowId: "stale" }), "p1", command())).toBe("PRIVATE_WINDOW_MISMATCH");
    expect(codeFor(state, privateState({ gameId: "another-game" }), "p1", command())).toBe("PRIVATE_WINDOW_MISMATCH");
  });
});
