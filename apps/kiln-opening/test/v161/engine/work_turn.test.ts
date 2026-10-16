/**
 * Work Phase turns (L134–144, L191, L391, L631, L293; DESIGN §3.2, §3.6, §3.7, §4.5, §7):
 * First Player clockwise, 1 worker per turn, no passing, until every worker is placed; the
 * after-action window (Canal Barge unused / Imperial Priority usable, regardless of the hand);
 * END_TURN; the deferred Main display refill at the end of the reserving player's turn; and
 * storage-order independence.
 */

import { describe, expect, it } from "vitest";
import { applyAction } from "../../../src/game/engine.ts";
import { SeededRandom } from "../../../src/game/rng.ts";
import { availableWorkers } from "../../../src/game/placement.ts";
import { projectPublicState } from "../../../src/game/view.ts";
import type { GameAction, GameEvent, GameState, PlayerId } from "../../../src/game/types.ts";
import {
  afterActionWindowOpen,
  afterWindowAbilityUsed,
  completeWorkerAction,
  endTurn,
  imperialPriorityUsable,
  openWorkPhase,
} from "../../../src/game/work/turn.ts";
import { type StateSpec, buildState, testContext } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

function table(spec: StateSpec = {}): LocalTable {
  return new LocalTable(buildState(spec), { flow: "halt", pass: ["worker_action_done"] });
}

function types(events: readonly GameEvent[]): string[] {
  return events.map((event) => event.type);
}

/** Canal Wharf with the player's first available worker (always legal, L143). */
function wharf(state: GameState, playerId: PlayerId): GameAction {
  const worker = availableWorkers(state, playerId)[0];
  if (worker === undefined) throw new Error(`${playerId} has no worker`);
  return { type: "PLACE_CANAL_WHARF", workerId: worker.id };
}

describe("opening the Work Phase (L132, L136)", () => {
  it("the First Player takes the first turn", () => {
    const state = buildState({ players: 3, firstPlayerId: "p2", phase: { type: "round_start_setters_mark", queue: { actorIds: [], index: 0 } } });
    const ctx = testContext();
    openWorkPhase(state, ctx);
    expect(state.phase).toEqual({ type: "work_turn", activePlayerId: "p2", step: { kind: "before_action" } });
    expect(ctx.events).toEqual([{ type: "WORK_TURN_STARTED", playerId: "p2" }]);
    expect(ctx.halts).toEqual([]);
  });

  it("is reached from the Start of Round through the production flow", () => {
    const t = LocalTable.newGame(7, 3, { flow: "halt", pass: ["setup_done", "round_start_done", "worker_action_done"] });
    const first = t.state.firstPlayerId;
    expect(t.state.phase).toEqual({ type: "work_turn", activePlayerId: first, step: { kind: "before_action" } });
    expect(t.events.at(-1)).toEqual({ type: "WORK_TURN_STARTED", playerId: first });
  });

  it("skips a First Player without workers, and ends at once when nobody has one", () => {
    const allPlaced = (player: string) =>
      (["shifu", 1, 2, 3] as const).map((worker) => ({ player, worker, locationId: "canal_wharf" as const }));
    const skip = buildState({ placements: allPlaced("p1"), phase: { type: "round_start_setters_mark", queue: { actorIds: [], index: 0 } } });
    openWorkPhase(skip, testContext());
    expect(skip.phase).toMatchObject({ type: "work_turn", activePlayerId: "p2" });

    const none = buildState({
      placements: [...allPlaced("p1"), ...allPlaced("p2")],
      phase: { type: "round_start_setters_mark", queue: { actorIds: [], index: 0 } },
    });
    const ctx = testContext();
    openWorkPhase(none, ctx);
    expect(ctx.events).toEqual([{ type: "WORK_PHASE_ENDED", round: 1 }]);
    expect(ctx.halts).toEqual([{ kind: "continue_after", milestone: "work_phase_done" }]);
  });
});

describe("turn order and placements (L136, L138)", () => {
  it("First Player clockwise, 1 worker per turn, until every player has placed all 4 workers", () => {
    const t = table({ players: 3, firstPlayerId: "p2" });
    const actors: PlayerId[] = [];
    while (t.state.phase.type === "work_turn" && t.halts.length === 0) {
      const actor = t.prompt().actorIds[0] as PlayerId;
      actors.push(actor);
      const events = t.act(actor, wharf(t.state, actor));
      const ended = events.find((event) => event.type === "WORK_TURN_ENDED");
      expect(ended).toEqual({ type: "WORK_TURN_ENDED", playerId: actor, automatic: true });
    }
    expect(actors).toEqual(["p2", "p3", "p1", "p2", "p3", "p1", "p2", "p3", "p1", "p2", "p3", "p1"]);
    expect(t.halts).toEqual([{ kind: "continue_after", milestone: "work_phase_done" }]);
    expect(types(t.events).slice(-2)).toEqual(["WORK_TURN_ENDED", "WORK_PHASE_ENDED"]);
    expect(t.events.at(-1)).toEqual({ type: "WORK_PHASE_ENDED", round: 1 });
    for (const playerId of ["p1", "p2", "p3"]) {
      expect(availableWorkers(t.state, playerId)).toEqual([]);
      // 20 placements over the game: 4 per round, the Shifu among them (L138).
      expect(Object.values(t.player(playerId).workers).map((w) => w.placement?.locationId)).toEqual(Array(4).fill("canal_wharf"));
      expect(t.player(playerId).resources.coins).toBe(3 + 4 + 2 + 2 + 2);
    }
  });

  it("a player with no available worker is skipped; the others keep placing", () => {
    const t = table({
      placements: [
        { player: "p2", worker: "shifu", locationId: "canal_wharf" },
        { player: "p2", worker: 1, locationId: "canal_wharf" },
        { player: "p2", worker: 2, locationId: "canal_wharf" },
      ],
    });
    const actors: PlayerId[] = [];
    while (t.halts.length === 0) {
      const actor = t.prompt().actorIds[0] as PlayerId;
      actors.push(actor);
      t.act(actor, wharf(t.state, actor));
    }
    expect(actors).toEqual(["p1", "p2", "p1", "p1", "p1"]);
  });

  it("you may not pass (L143): END_TURN before the worker action is WORKER_ACTION_REQUIRED", () => {
    const t = table();
    const error = t.expectRuleError("p1", { type: "END_TURN" }, "WORKER_ACTION_REQUIRED");
    expectDocumentedDetails(error);
    t.expectRuleError("p2", { type: "END_TURN" }, "NOT_YOUR_DECISION");
    // The always-legal exit (DESIGN §3.6).
    t.act("p1", wharf(t.state, "p1"));
    expect(t.prompt().actorIds).toEqual(["p2"]);
  });

  it("END_TURN is refused while a worker action is still resolving", () => {
    const t = table();
    t.act("p1", { type: "PLACE_GUILD_HALL", workerId: "p1:shifu", choice: { kind: "inspect", discipline: "firing" } });
    const error = t.expectRuleError("p1", { type: "END_TURN" }, "WRONG_PHASE");
    expect(error.details).toMatchObject({ step: "guild_inspection" });
    expectDocumentedDetails(error);
  });
});

describe("the after-action window (DESIGN §3.2 step 3, §4.5)", () => {
  it("opens when Canal Barge is unused this round, and END_TURN closes it (not automatic)", () => {
    const t = table({ players: [{ techs: ["T23"] }, {}] });
    const events = t.act("p1", wharf(t.state, "p1"));
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED"]);
    expect(t.state.phase).toEqual({ type: "work_turn", activePlayerId: "p1", step: { kind: "after_action" } });
    t.expectRuleError("p1", wharf(t.state, "p1"), "WORKER_ACTION_ALREADY_TAKEN");
    const ended = t.act("p1", { type: "END_TURN" });
    expect(types(ended)).toEqual(["WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(ended[0]).toEqual({ type: "WORK_TURN_ENDED", playerId: "p1", automatic: false });
  });

  it("stays shut when Canal Barge is spent and Imperial Priority unusable: the turn ends automatically (DESIGN §3.7)", () => {
    const t = table({ players: [{ techs: [{ id: "T23", usedThisRound: true }] }, {}] });
    expect(afterActionWindowOpen(t.state, "p1")).toBe(false);
    const events = t.act("p1", wharf(t.state, "p1"));
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
  });

  it("opens when Imperial Priority is usable: token held, Imperial Kiln gained and empty, a Shaped vessel", () => {
    const usable: StateSpec = { players: [{ recognition: 3 }, {}], ceramics: [{ owner: "p1", shape: "bowl", stage: "shaped" }] };
    expect(imperialPriorityUsable(buildState(usable), "p1")).toBe(true);
    expect(afterActionWindowOpen(buildState(usable), "p1")).toBe(true);
    expect(afterActionWindowOpen(buildState(usable), "p2")).toBe(false);
    const t = table(usable);
    t.act("p1", wharf(t.state, "p1"));
    expect(t.state.phase).toMatchObject({ step: { kind: "after_action" } });
  });

  it("ignores the hand: holding a completable Order or not, the public result is the same (DESIGN §4.5)", () => {
    const ceramics: StateSpec["ceramics"] = [{ owner: "p1", shape: "bowl", stage: "finished", glaze: "white", quality: "standard" }];
    // S01 is "any Bowl, Standard+" (completable with c1); S02 needs a Plate.
    const completable = table({ players: [{ techs: ["T23"], hand: ["S01"] }, {}], ceramics });
    const notCompletable = table({ players: [{ techs: ["T23"], hand: ["S02"] }, {}], ceramics });
    completable.act("p1", wharf(completable.state, "p1"));
    notCompletable.act("p1", wharf(notCompletable.state, "p1"));
    expect(completable.state.phase).toMatchObject({ step: { kind: "after_action" } });
    expect(projectPublicState(completable.state)).toEqual(projectPublicState(notCompletable.state));
    expect(completable.view("p2")).toEqual(notCompletable.view("p2"));
  });

  it("afterWindowAbilityUsed: nothing changes before the action; after it the turn ends once nothing is left", () => {
    const before = buildState({ players: [{ techs: [{ id: "T23", usedThisRound: true }] }, {}] });
    const ctx = testContext();
    afterWindowAbilityUsed(before, "p1", ctx);
    expect(before.phase).toEqual({ type: "work_turn", activePlayerId: "p1", step: { kind: "before_action" } });
    expect(ctx.events).toEqual([]);

    const after = buildState({
      players: [{ techs: [{ id: "T23", usedThisRound: true }] }, {}],
      placements: [{ player: "p1", worker: 1, locationId: "canal_wharf" }],
      phase: { type: "work_turn", activePlayerId: "p1", step: { kind: "after_action" } },
    });
    const afterCtx = testContext();
    afterWindowAbilityUsed(after, "p1", afterCtx);
    expect(afterCtx.events).toEqual([
      { type: "WORK_TURN_ENDED", playerId: "p1", automatic: true },
      { type: "WORK_TURN_STARTED", playerId: "p2" },
    ]);
  });

  it("completeWorkerAction is the production workerActionDone (DESIGN §2.5)", () => {
    const state = buildState({ placements: [{ player: "p1", worker: 1, locationId: "canal_wharf" }] });
    const ctx = testContext();
    completeWorkerAction(state, "p1", ctx);
    expect(state.phase).toEqual({ type: "work_turn", activePlayerId: "p2", step: { kind: "before_action" } });
    expect(types(ctx.events)).toEqual(["WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
  });
});

describe("the deferred Main display refill (L191, L391; INT)", () => {
  it("runs at the end of the reserving player's turn, before WORK_TURN_ENDED, and only for them", () => {
    const state = buildState({
      display: [null, "O02", "O03", null, "O05", "O06"],
      refillPendingFor: "p1",
      placements: [{ player: "p1", worker: 1, locationId: "commission_market" }],
      phase: { type: "work_turn", activePlayerId: "p1", step: { kind: "after_action" } },
      players: [{ hand: ["O01", "O04"] }, {}],
    });
    const deckTop = state.hidden.mainDeck.slice(0, 2);
    const ctx = testContext();
    endTurn(state, "p1", false, ctx);
    expect(types(ctx.events)).toEqual(["DISPLAY_REFILLED", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(ctx.events[0]).toEqual({
      type: "DISPLAY_REFILLED",
      cause: "end_of_turn",
      revealedOrderIds: deckTop,
      display: ["O02", "O03", "O05", "O06", ...deckTop],
    });
    expect(state.market.refillPendingFor).toBeNull();

    // A turn without a face-up reservation refills nothing.
    const quiet = buildState({ placements: [{ player: "p1", worker: 1, locationId: "canal_wharf" }] });
    const quietCtx = testContext();
    endTurn(quiet, "p1", true, quietCtx);
    expect(types(quietCtx.events)).toEqual(["WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
  });
});

/** Postgres `jsonb` key order: by length, then bytes (DESIGN §2.3, §7). */
function keySorted<T>(value: T): T {
  const sort = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(sort);
    if (node !== null && typeof node === "object") {
      const entries = Object.entries(node as Record<string, unknown>).sort(([a], [b]) =>
        a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0,
      );
      return Object.fromEntries(entries.map(([key, child]) => [key, sort(child)]));
    }
    return node;
  };
  return JSON.parse(JSON.stringify(sort(value))) as T;
}

describe("determinism and storage key order (DESIGN §7)", () => {
  it("a scripted sequence gives identical events, states and RNG whether or not keys are re-sorted", () => {
    const script: Array<[PlayerId, GameAction]> = [
      ["p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:shifu", first: { kind: "look_top_three" } }],
      ["p1", { type: "COMMISSION_CHOOSE_LOOKED", orderId: "O08" }],
      ["p1", { type: "COMMISSION_GAIN", resource: "wood" }],
      ["p1", { type: "COMMISSION_RESERVE", choice: { kind: "face_up", slotIndex: 1, orderId: "O02", gain: "clay" } }],
      ["p1", { type: "END_TURN" }],
      ["p2", { type: "PLACE_GUILD_HALL", workerId: "p2:shifu", choice: { kind: "inspect", discipline: "glazing_loading" } }],
      ["p2", { type: "GUILD_TAKE", take: { kind: "face_up", techId: "T10" }, bottomOrder: ["T21", "T15"] }],
      ["p2", { type: "COLOUR_SAMPLES_CHOOSE", orderId: "O11" }],
      ["p1", { type: "PLACE_GUILD_HALL", workerId: "p1:apprentice:1", choice: { kind: "buy_face_up", techId: "T01" } }],
      ["p1", { type: "USE_CANAL_BARGE", orderId: "S01", ceramicIds: ["c1"] }],
      ["p2", { type: "PLACE_CANAL_WHARF", workerId: "p2:apprentice:1" }],
    ];
    const run = (resort: boolean) => {
      let state = buildState({
        players: [{ techs: ["T23"], hand: ["S01"] }, {}],
        ceramics: [{ owner: "p1", shape: "bowl", stage: "finished", glaze: "white", quality: "standard" }],
      });
      const rng = new SeededRandom(42);
      const events: GameEvent[] = [];
      for (const [actor, action] of script) {
        if (resort) state = keySorted(state);
        const result = applyAction(state, actor, action, rng, { checkInvariants: true });
        if (!result.ok) throw new Error(`${actor} ${action.type}: ${result.error.code}`);
        state = result.state;
        events.push(...result.events);
      }
      return { state, events, rng: rng.getState() };
    };
    const plain = run(false);
    const sorted = run(true);
    expect(sorted.events).toEqual(plain.events);
    expect(sorted.state).toEqual(plain.state);
    expect(sorted.rng).toBe(plain.rng);
    expect(plain.state.hidden.orderHands["p1"]).toEqual(["O08", "O02"]);
    expect(plain.state.market.display).toEqual(["O01", "O03", "O04", "O05", "O06", "O10"]);
    expect(plain.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "before_action" } });
    expect(plain.state.hidden.orderHands["p2"]).toEqual(["O11"]);
  });
});
