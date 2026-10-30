/**
 * "End the turn afterwards" (owner UI decision D21, 2026-10-30; ENGINE_V1.6.2_DELTA.md §16.24):
 * the optional `endTurn` field on every command that can finish a worker action and on the free
 * actions, so a Work turn (or an Order Phase turn) ends in the same command as its last confirm.
 *
 * - Absent means today's behaviour exactly; `false` on a single command changes nothing.
 * - Worker action: `true` ends the turn when the action finishes instead of opening the
 *   after-action step. A request on a command that does not finish the action (a placement that
 *   opens a Select or a Guild Hall inspection, a first take) is remembered on the public
 *   `work_turn.endTurnAfterAction` for the rest of the action; a later command of the action that
 *   carries the field replaces it.
 * - After the action and in the Order Phase: a free action (or the swap's Select) with `true`
 *   applies, then ends the turn as `END_TURN` / `END_ORDER_TURN` would.
 * - Before the action: `true` on a free action or a swap's Select is `WORKER_ACTION_REQUIRED`;
 *   `false` is accepted and ignored.
 * - Events and state are those of the two-command path; only the command count differs, and
 *   `WORK_TURN_ENDED.automatic` is false exactly when an after-action step that would have opened
 *   (public facts, R27) was skipped. This holds where the turn's end hands the phase over too
 *   (the last Work turn into the Firing, the last Order Phase turn into Cleanup); a hand trim the
 *   command opens records that command's own revision (`openedAtRevision`, one lower).
 */

import { describe, expect, it } from "vitest";
import { validateAction } from "../../../src/game/engine.ts";
import { END_TURN_COMMAND_TYPES } from "../../../src/game/freeActionWindow.ts";
import { assertInvariants, invariantViolations } from "../../../src/game/invariants.ts";
import { legalActions } from "../../../src/game/legalActions.ts";
import { RULE_ERROR_TEXT, formatRuleError } from "../../../src/game/ruleErrorText.ts";
import { SeededRandom } from "../../../src/game/rng.ts";
import { endTurnOptions } from "../../../src/game/selectors.ts";
import type { EndTurnCommandType, GameAction, GameEvent, GameState, OrderId, PlayerId, TechId } from "../../../src/game/types.ts";
import { type CeramicSpec, type PlacementSpec, type StateSpec, buildState } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

const FLAWED_BOWL: CeramicSpec = { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "flawed" };
const FLAWED_PLATE: CeramicSpec = { owner: "p1", stage: "finished", shape: "plate", glaze: "white", quality: "flawed" };
const STANDARD_PLATE: CeramicSpec = { owner: "p1", stage: "finished", shape: "plate", glaze: "white", quality: "standard" };
const STANDARD_BOWL: CeramicSpec = { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "standard" };
const SHAPED_BOWL: CeramicSpec = { owner: "p1", stage: "shaped", shape: "bowl" };
const SHAPED_PLATE: CeramicSpec = { owner: "p1", stage: "shaped", shape: "plate" };
const SHAPED_VASE: CeramicSpec = { owner: "p1", stage: "shaped", shape: "vase" };

const END_TURN: GameAction = { type: "END_TURN" };
const END_ORDER_TURN: GameAction = { type: "END_ORDER_TURN" };
const WHARF: GameAction = { type: "PLACE_CANAL_WHARF", workerId: "p1:apprentice:1" };
const CROWN_DISPLAY: OrderId[] = ["O01", "O17", "O03", "O39", "O05", "O06"];

/** The command with `endTurn` set, or removed for `undefined`. */
function withEndTurn(action: GameAction, endTurn: boolean | undefined): GameAction {
  const { endTurn: _drop, ...rest } = action as GameAction & { endTurn?: boolean };
  return (endTurn === undefined ? rest : { ...rest, endTurn }) as GameAction;
}

type Step = GameAction | [PlayerId, GameAction];

/** A table from `spec` that played `steps` (p1 by default), every command accepted. */
function play(spec: StateSpec, steps: readonly Step[], flow: "full" | "halt" = "full"): LocalTable {
  const t = new LocalTable(buildState(spec), { flow });
  for (const step of steps) {
    const [actor, action] = Array.isArray(step) ? step : (["p1", step] as const);
    t.act(actor, action);
  }
  return t;
}

/** The one-command path equals the two-command path in events and state; only the command
 * count (and so the revision) differs, by `saved`. */
function expectSameAsTwoCommands(single: LocalTable, double: LocalTable, saved = 1): void {
  expect(single.events).toEqual(double.events);
  expect(single.commandMarks).toHaveLength(double.commandMarks.length - saved);
  expect(single.state.revision).toBe(double.state.revision - saved);
  expect({ ...single.state, revision: 0 }).toEqual({ ...double.state, revision: 0 });
}

/** `expectSameAsTwoCommands` for a turn end that hands the phase over: the RNG and the private
 * firing state match too, and a hand trim the last command opened records that command's own
 * revision, so `openedAtRevision` is one lower on the one-command path (and nothing else differs). */
function expectSameAcrossHandOver(single: LocalTable, double: LocalTable): void {
  expect(single.events).toEqual(double.events);
  expect(single.commandMarks).toHaveLength(double.commandMarks.length - 1);
  expect(single.state.revision).toBe(double.state.revision - 1);
  expect((single.rng as SeededRandom).getState()).toBe((double.rng as SeededRandom).getState());
  expect(single.privateState).toEqual(double.privateState);
  const comparable = (t: LocalTable): unknown => {
    const phase = t.state.phase;
    return { ...t.state, revision: 0, phase: phase.type === "cleanup_hand_limit" ? { ...phase, openedAtRevision: 0 } : phase };
  };
  expect(comparable(single)).toEqual(comparable(double));
}

function workTurnEnded(events: readonly GameEvent[]): Array<Extract<GameEvent, { type: "WORK_TURN_ENDED" }>> {
  return events.filter((event): event is Extract<GameEvent, { type: "WORK_TURN_ENDED" }> => event.type === "WORK_TURN_ENDED");
}

function orderTurnEnded(events: readonly GameEvent[]): Array<Extract<GameEvent, { type: "ORDER_TURN_ENDED" }>> {
  return events.filter((event): event is Extract<GameEvent, { type: "ORDER_TURN_ENDED" }> => event.type === "ORDER_TURN_ENDED");
}

function count(events: readonly GameEvent[], type: GameEvent["type"]): number {
  return events.filter((event) => event.type === type).length;
}

function stepOf(t: LocalTable): string {
  const phase = t.state.phase;
  return phase.type === "work_turn" ? `${phase.activePlayerId}:${phase.step.kind}` : phase.type;
}

function requestOf(t: LocalTable): boolean | undefined {
  const phase = t.state.phase;
  return phase.type === "work_turn" ? phase.endTurnAfterAction : undefined;
}

/** p1 holds a Finished Flawed bowl (c1), so the after-action step always opens (R27), and two
 * Shaped vessels (c2, c3) for the loads. Rich enough for every placement. */
const OPEN_AFTER: StateSpec = {
  players: [{ resources: { clay: 6, wood: 6, coins: 12 } }, {}],
  ceramics: [FLAWED_BOWL, SHAPED_BOWL, SHAPED_PLATE],
};
/** The same without the Flawed bowl: after a placement nothing public is left (R27). */
const CLOSED_AFTER: StateSpec = {
  players: [{ resources: { clay: 6, wood: 6, coins: 12 } }, {}],
  ceramics: [SHAPED_BOWL, SHAPED_PLATE],
};

/** Every single-command placement, by an Apprentice. */
const PLACEMENTS: ReadonlyArray<[string, GameAction]> = [
  ["Materials Yard", { type: "PLACE_MATERIALS_YARD", workerId: "p1:apprentice:1", clay: 2, wood: 2 }],
  ["Form & Decorate", { type: "PLACE_FORM_DECORATE", workerId: "p1:apprentice:1", vessels: [{ shape: "bowl", decoration: "plain" }] }],
  [
    "Glaze & Load",
    { type: "PLACE_GLAZE_LOAD", workerId: "p1:apprentice:1", loads: [{ ceramicId: "c2", glaze: "white", destination: { kiln: "shared", spaceId: "high_1" } }] },
  ],
  ["Guild Hall (Apprentice buy)", { type: "PLACE_GUILD_HALL", workerId: "p1:apprentice:1", choice: { kind: "buy_face_up", techId: "T01" } }],
  ["Canal Wharf", WHARF],
  ["Magistrate's Hall", { type: "PLACE_MAGISTRATES_HALL", workerId: "p1:apprentice:1" }],
];

describe("a single-command worker action (D21: Place · end turn)", () => {
  it.each(PLACEMENTS)("%s: absent or false opens the after-action step; true ends the turn as END_TURN would", (_name, placement) => {
    const absent = play(OPEN_AFTER, [placement]);
    expect(stepOf(absent)).toBe("p1:after_action");
    const declined = play(OPEN_AFTER, [withEndTurn(placement, false)]);
    expect(declined.events).toEqual(absent.events);
    expect(declined.state).toEqual(absent.state);

    const single = play(OPEN_AFTER, [withEndTurn(placement, true)]);
    const double = play(OPEN_AFTER, [placement, END_TURN]);
    expectSameAsTwoCommands(single, double);
    expect(workTurnEnded(single.events)).toEqual([{ type: "WORK_TURN_ENDED", playerId: "p1", automatic: false }]);
    expect(stepOf(single)).toBe("p2:before_action");
    expect(requestOf(single)).toBeUndefined();
  });

  it.each(PLACEMENTS)("%s: when the after-action step would not open, true changes nothing (automatic: true)", (_name, placement) => {
    const absent = play(CLOSED_AFTER, [placement]);
    expect(workTurnEnded(absent.events)).toEqual([{ type: "WORK_TURN_ENDED", playerId: "p1", automatic: true }]);
    const single = play(CLOSED_AFTER, [withEndTurn(placement, true)]);
    expect(single.events).toEqual(absent.events);
    expect(single.state).toEqual(absent.state);
  });

  it("the deferred Tech refill runs once, at the end of the turn, after an Apprentice buy", () => {
    const single = play(OPEN_AFTER, [withEndTurn(PLACEMENTS[3]![1], true)]);
    expect(count(single.events, "TECH_DISPLAY_REFILLED")).toBe(1);
    expect(single.events.map((event) => event.type).slice(-3)).toEqual(["TECH_DISPLAY_REFILLED", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
  });
});

describe("a request remembered through the worker action's sub-steps", () => {
  const market = (worker: "shifu" | 1, endTurn?: boolean): GameAction =>
    withEndTurn({ type: "PLACE_COMMISSION_MARKET", workerId: worker === "shifu" ? "p1:shifu" : "p1:apprentice:1" }, endTurn);
  const lookedFirst = (t: LocalTable, endTurn?: boolean): GameAction => {
    const look = t.state.hidden.pendingLook;
    if (look === null || look.kind === "guild_inspection" || look.orderIds[0] === undefined) throw new Error("no Select look is open");
    return withEndTurn({ type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: look.orderIds[0] }] }, endTurn);
  };

  it("Commission Market: the placement's request carries through the Select; the Select's own value overrides it", () => {
    const placed = play(OPEN_AFTER, [market(1, true)]);
    expect(stepOf(placed)).toBe("p1:commission_market");
    expect(requestOf(placed)).toBe(true);
    assertInvariants(placed.state, { live: true });
    expect(endTurnOptions(placed.view("p1"))).toMatchObject({ stage: "worker_action", commandTypes: ["SELECT_CHOOSE"], requested: true });
    // Public: every seat sees the request, which names nothing hidden.
    expect(placed.view("p2").game.phase).toMatchObject({ endTurnAfterAction: true });

    const single = play(OPEN_AFTER, [market(1, true)]);
    single.act("p1", lookedFirst(single));
    const double = play(OPEN_AFTER, [market(1)]);
    double.act("p1", lookedFirst(double));
    double.act("p1", END_TURN);
    expectSameAsTwoCommands(single, double);
    expect(workTurnEnded(single.events)).toEqual([{ type: "WORK_TURN_ENDED", playerId: "p1", automatic: false }]);

    // The Select's endTurn: false withdraws the request; true on the Select alone ends the turn.
    const withdrawn = play(OPEN_AFTER, [market(1, true)]);
    withdrawn.act("p1", lookedFirst(withdrawn, false));
    expect(stepOf(withdrawn)).toBe("p1:after_action");
    expect(requestOf(withdrawn)).toBeUndefined();
    const late = play(OPEN_AFTER, [market(1)]);
    late.act("p1", lookedFirst(late, true));
    expectSameAsTwoCommands(late, double);
    const declined = play(OPEN_AFTER, [market(1, false)]);
    expect(requestOf(declined)).toBeUndefined();
    declined.act("p1", lookedFirst(declined));
    expect(stepOf(declined)).toBe("p1:after_action");
  });

  it("Commission Market Shifu: two face-up reservations refill the display once, at the end of the turn", () => {
    const pick2: GameAction = {
      type: "SELECT_CHOOSE",
      reservations: [
        { kind: "face_up", slotIndex: 0, orderId: "O01" },
        { kind: "face_up", slotIndex: 1, orderId: "O02" },
      ],
    };
    const spec: StateSpec = { ...OPEN_AFTER, display: ["O01", "O02", "O03", "O04", "O05", "O06"] };
    const single = play(spec, [market("shifu", true), pick2]);
    const double = play(spec, [market("shifu"), pick2, END_TURN]);
    expectSameAsTwoCommands(single, double);
    expect(count(single.events, "DISPLAY_REFILLED")).toBe(1);
    expect(single.state.market.refillPendingFor).toBeNull();
    expect(single.state.market.display.every((orderId) => orderId !== null)).toBe(true);
  });

  it("Guild Hall Apprentice buying Colour Samples: the request carries through its Select 3", () => {
    const buy = (endTurn?: boolean): GameAction =>
      withEndTurn({ type: "PLACE_GUILD_HALL", workerId: "p1:apprentice:1", choice: { kind: "buy_face_up", techId: "T10" } }, endTurn);
    const spec: StateSpec = { players: [{ resources: { coins: 3 } }, {}] };
    const single = play(spec, [buy(true)]);
    expect(stepOf(single)).toBe("p1:colour_samples");
    expect(requestOf(single)).toBe(true);
    single.act("p1", lookedFirst(single));
    const double = play(spec, [buy()]);
    double.act("p1", lookedFirst(double));
    // The swap is ready with an Order held: the after-action step opened on that path.
    expect(stepOf(double)).toBe("p1:after_action");
    double.act("p1", END_TURN);
    expectSameAsTwoCommands(single, double);
    expect(workTurnEnded(single.events)).toEqual([{ type: "WORK_TURN_ENDED", playerId: "p1", automatic: false }]);
  });

  describe("Guild Hall Shifu inspection", () => {
    const inspect = (endTurn?: boolean): GameAction =>
      withEndTurn({ type: "PLACE_GUILD_HALL", workerId: "p1:shifu", choice: { kind: "inspect", discipline: "firing" } }, endTurn);
    const take = (kind: "face_up" | "inspected", techId: TechId, endTurn?: boolean): GameAction => withEndTurn({ type: "GUILD_TAKE", take: { kind, techId } }, endTurn);
    const finish = (bottomOrder: TechId[], endTurn?: boolean): GameAction => withEndTurn({ type: "GUILD_FINISH", bottomOrder }, endTurn);
    const coins = (n: number): StateSpec => ({ players: [{ resources: { coins: n } }, {}], ceramics: [FLAWED_BOWL] });

    it("1 take that closes the step by itself ends the turn", () => {
      const single = play(coins(3), [inspect(true)]);
      expect(stepOf(single)).toBe("p1:guild_inspection");
      expect(requestOf(single)).toBe(true);
      expect(endTurnOptions(single.view("p1"))).toMatchObject({ stage: "worker_action", commandTypes: ["GUILD_TAKE", "GUILD_FINISH"], requested: true });
      single.act("p1", take("inspected", "T13"));
      const double = play(coins(3), [inspect(), take("inspected", "T13"), END_TURN]);
      expectSameAsTwoCommands(single, double);
      expect(workTurnEnded(single.events)).toEqual([{ type: "WORK_TURN_ENDED", playerId: "p1", automatic: false }]);
    });

    it("1 take and GUILD_FINISH: the request waits through the take", () => {
      const single = play(coins(5), [inspect(true), take("face_up", "T01")]);
      expect(stepOf(single)).toBe("p1:guild_inspection");
      expect(requestOf(single)).toBe(true);
      single.act("p1", finish(["T14", "T13"]));
      const double = play(coins(5), [inspect(), take("face_up", "T01"), finish(["T14", "T13"]), END_TURN]);
      expectSameAsTwoCommands(single, double);
      // Each display refills once, when the turn ends (v1.6.2 L239).
      expect(count(single.events, "TECH_DISPLAY_REFILLED")).toBe(1);
    });

    it("2 takes that close the step by themselves end the turn", () => {
      const single = play(coins(5), [inspect(true), take("face_up", "T01"), take("inspected", "T13")]);
      const double = play(coins(5), [inspect(), take("face_up", "T01"), take("inspected", "T13"), END_TURN]);
      expectSameAsTwoCommands(single, double);
      expect(workTurnEnded(single.events)).toEqual([{ type: "WORK_TURN_ENDED", playerId: "p1", automatic: false }]);
    });

    it("a request made on the first take, or withdrawn on GUILD_FINISH", () => {
      const onTake = play(coins(5), [inspect(), take("face_up", "T01", true)]);
      expect(requestOf(onTake)).toBe(true);
      onTake.act("p1", finish(["T14", "T13"]));
      const double = play(coins(5), [inspect(), take("face_up", "T01"), finish(["T14", "T13"]), END_TURN]);
      expectSameAsTwoCommands(onTake, double);

      const withdrawn = play(coins(5), [inspect(true), take("face_up", "T01"), finish(["T14", "T13"], false)]);
      expect(stepOf(withdrawn)).toBe("p1:after_action");
      expect(requestOf(withdrawn)).toBeUndefined();
    });

    it("taking Colour Samples: the request waits through its Select and the resumed inspection", () => {
      const spec: StateSpec = { players: [{ resources: { coins: 6 } }, {}] };
      const single = play(spec, [inspect(true), take("face_up", "T10")]);
      expect(stepOf(single)).toBe("p1:colour_samples");
      expect(requestOf(single)).toBe(true);
      single.act("p1", lookedFirst(single));
      expect(stepOf(single)).toBe("p1:guild_inspection");
      expect(requestOf(single)).toBe(true);
      single.act("p1", take("inspected", "T13"));
      const double = play(spec, [inspect(), take("face_up", "T10")]);
      double.act("p1", lookedFirst(double));
      double.act("p1", take("inspected", "T13"));
      double.act("p1", END_TURN);
      expectSameAsTwoCommands(single, double);
    });
  });

  it("Magistrate's Hall Shifu with a Crown Order: one command, one display refill", () => {
    const hall = (endTurn?: boolean): GameAction =>
      withEndTurn({ type: "PLACE_MAGISTRATES_HALL", workerId: "p1:shifu", crownOrder: { slotIndex: 3, orderId: "O39" } }, endTurn);
    const spec: StateSpec = { players: [{ resources: { coins: 4 } }, {}], display: CROWN_DISPLAY, ceramics: [STANDARD_PLATE] };
    // The Crown Order raises the hand to 1 beside a Finished ceramic: the step would open (R27).
    expect(stepOf(play(spec, [hall()]))).toBe("p1:after_action");
    const single = play(spec, [hall(true)]);
    const double = play(spec, [hall(), END_TURN]);
    expectSameAsTwoCommands(single, double);
    expect(count(single.events, "DISPLAY_REFILLED")).toBe(1);
    expect(workTurnEnded(single.events)).toEqual([{ type: "WORK_TURN_ENDED", playerId: "p1", automatic: false }]);
  });
});

/** p1 at Recognition 3 (Imperial Kiln, token held) with S08 in hand: c1 a Finished Flawed bowl,
 * c2 a Finished Standard plate, c3 a Shaped vase; c4 a second Flawed plate keeps the window
 * open after one sale. */
const ALL_FREE: StateSpec = {
  players: [{ recognition: 3, hand: ["S08"] }, {}],
  ceramics: [FLAWED_BOWL, STANDARD_PLATE, SHAPED_VASE, FLAWED_PLATE],
};
const SELL: GameAction = { type: "SELL_FLAWED", ceramicId: "c1" };
const COMPLETE: GameAction = { type: "COMPLETE_ORDER", orderId: "S08", ceramicIds: ["c2"] };
const PRIORITY: GameAction = { type: "USE_IMPERIAL_PRIORITY", ceramicId: "c3", glaze: "celadon", imperialModifier: 0 };
const FREE_ACTIONS: ReadonlyArray<[string, GameAction]> = [
  ["SELL_FLAWED", SELL],
  ["COMPLETE_ORDER", COMPLETE],
  ["USE_IMPERIAL_PRIORITY", PRIORITY],
];

describe("after the worker action (D21: ⟨Action⟩ · end turn)", () => {
  it.each(FREE_ACTIONS)("%s with true applies, then ends the turn as END_TURN would; false and absent keep the step open", (_name, action) => {
    const single = play(ALL_FREE, [WHARF, withEndTurn(action, true)]);
    const double = play(ALL_FREE, [WHARF, action, END_TURN]);
    expectSameAsTwoCommands(single, double);
    expect(workTurnEnded(single.events)).toEqual([{ type: "WORK_TURN_ENDED", playerId: "p1", automatic: false }]);

    const absent = play(ALL_FREE, [WHARF, action]);
    expect(stepOf(absent)).toBe("p1:after_action");
    const declined = play(ALL_FREE, [WHARF, withEndTurn(action, false)]);
    expect(declined.events).toEqual(absent.events);
    expect(declined.state).toEqual(absent.state);
  });

  it("when the free action leaves nothing, the turn ends by itself and the request changes nothing", () => {
    const spec: StateSpec = { players: [{}, {}], ceramics: [FLAWED_BOWL] };
    const absent = play(spec, [WHARF, SELL]);
    expect(workTurnEnded(absent.events)).toEqual([{ type: "WORK_TURN_ENDED", playerId: "p1", automatic: true }]);
    const single = play(spec, [WHARF, withEndTurn(SELL, true)]);
    expect(single.events).toEqual(absent.events);
    expect(single.state).toEqual(absent.state);
  });

  it("the Colour Samples swap used after the action: its Select with true ends the turn", () => {
    const spec: StateSpec = { players: [{ techs: ["T10"], hand: ["O40", "S01"] }, {}], ceramics: [FLAWED_BOWL] };
    const swapped = (t: LocalTable, endTurn?: boolean): void => {
      t.act("p1", { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: "O40" });
      const look = t.state.hidden.pendingLook;
      if (look?.kind !== "colour_samples_swap") throw new Error("no swap look");
      expect(endTurnOptions(t.view("p1"))).toMatchObject({ stage: "colour_samples_swap", commandTypes: ["SELECT_CHOOSE"] });
      t.act("p1", withEndTurn({ type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: look.orderIds[0] as OrderId }] }, endTurn));
    };
    const single = play(spec, [WHARF]);
    swapped(single, true);
    const double = play(spec, [WHARF]);
    swapped(double);
    expect(stepOf(double)).toBe("p1:after_action");
    double.act("p1", END_TURN);
    expectSameAsTwoCommands(single, double);
    expect(workTurnEnded(single.events)).toEqual([{ type: "WORK_TURN_ENDED", playerId: "p1", automatic: false }]);

    // false on that Select is accepted and changes nothing: the step stays open, as without it.
    const absent = play(spec, [WHARF]);
    swapped(absent);
    const declined = play(spec, [WHARF]);
    swapped(declined, false);
    expect(stepOf(declined)).toBe("p1:after_action");
    expect(declined.events).toEqual(absent.events);
    expect(declined.state).toEqual(absent.state);
  });
});

describe("before the worker action: the placement is still due", () => {
  it.each(FREE_ACTIONS)("%s with true is WORKER_ACTION_REQUIRED; with false it is accepted and ignored", (name, action) => {
    const t = play(ALL_FREE, []);
    const error = t.expectRuleError("p1", withEndTurn(action, true), "WORKER_ACTION_REQUIRED");
    expect(error.details).toEqual({ field: "endTurn", actionType: name, step: "before_action" });
    expectDocumentedDetails(error);
    expect(formatRuleError(error, "en")).toBe(RULE_ERROR_TEXT.WORKER_ACTION_REQUIRED.en);
    expect(formatRuleError(error, "zh")).toBe(RULE_ERROR_TEXT.WORKER_ACTION_REQUIRED.zh);

    const absent = play(ALL_FREE, [action]);
    const declined = play(ALL_FREE, [withEndTurn(action, false)]);
    expect(declined.events).toEqual(absent.events);
    expect(declined.state).toEqual(absent.state);
    expect(stepOf(declined)).toBe("p1:before_action");
  });

  it("the swap used before the action: its Select refuses true and accepts false", () => {
    const t = play({ players: [{ techs: ["T10"], hand: ["O40", "S01"] }, {}] }, [{ type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: "O40" }]);
    expect(endTurnOptions(t.view("p1"))).toMatchObject({ stage: "colour_samples_swap", commandTypes: [] });
    const look = t.state.hidden.pendingLook;
    if (look?.kind !== "colour_samples_swap") throw new Error("no swap look");
    const pick: GameAction = { type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: look.orderIds[0] as OrderId }] };
    const error = t.expectRuleError("p1", withEndTurn(pick, true), "WORKER_ACTION_REQUIRED");
    expect(error.details).toEqual({ field: "endTurn", actionType: "SELECT_CHOOSE", step: "colour_samples_swap" });
    expectDocumentedDetails(error);
    t.act("p1", withEndTurn(pick, false));
    expect(stepOf(t)).toBe("p1:before_action");
  });

  it("END_TURN itself stays WORKER_ACTION_REQUIRED there", () => {
    play(ALL_FREE, []).expectRuleError("p1", END_TURN, "WORKER_ACTION_REQUIRED");
  });

  /** Free actions that are illegal on their own terms in ALL_FREE: c2 is a Standard plate (not
   * sellable), c1 a Flawed bowl (it completes no Order), c1 a Finished ceramic (Imperial Priority
   * loads a Shaped vessel). */
  const ILLEGAL_FREE_ACTIONS: ReadonlyArray<[string, GameAction]> = [
    ["SELL_FLAWED", { type: "SELL_FLAWED", ceramicId: "c2" }],
    ["COMPLETE_ORDER", { type: "COMPLETE_ORDER", orderId: "S08", ceramicIds: ["c1"] }],
    ["USE_IMPERIAL_PRIORITY", { type: "USE_IMPERIAL_PRIORITY", ceramicId: "c1", glaze: "celadon", imperialModifier: 0 }],
  ];

  it.each(ILLEGAL_FREE_ACTIONS)("%s: the request is checked after the window and before the action's own checks", (name, action) => {
    const t = play(ALL_FREE, []);
    const own = t.expectRuleError("p1", action);
    expect(own.code).not.toBe("WORKER_ACTION_REQUIRED");
    const error = t.expectRuleError("p1", withEndTurn(action, true), "WORKER_ACTION_REQUIRED");
    expect(error.details).toEqual({ field: "endTurn", actionType: name, step: "before_action" });
    // The seat and window checks come first: another player's turn, and a worker action's sub-step.
    t.expectRuleError("p2", withEndTurn(action, true), "NOT_YOUR_DECISION");
    const midAction = play(ALL_FREE, [{ type: "PLACE_COMMISSION_MARKET", workerId: "p1:apprentice:1" }]);
    expect(stepOf(midAction)).toBe("p1:commission_market");
    midAction.expectRuleError("p1", withEndTurn(action, true), "WORKER_ACTION_IN_PROGRESS");
  });

  it("the swap used before the action: an invalid pick with true is WORKER_ACTION_REQUIRED, not the Select's own error", () => {
    const t = play({ players: [{ techs: ["T10"], hand: ["O40", "S01"] }, {}] }, [{ type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: "O40" }]);
    const look = t.state.hidden.pendingLook;
    if (look?.kind !== "colour_samples_swap" || look.orderIds.length < 2) throw new Error("no swap look");
    const [first, second] = look.orderIds as [OrderId, OrderId];
    // Two picks where the swap reserves exactly 1.
    const tooMany: GameAction = { type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: first }, { kind: "looked", orderId: second }] };
    expect(t.expectRuleError("p1", tooMany).code).not.toBe("WORKER_ACTION_REQUIRED");
    const error = t.expectRuleError("p1", withEndTurn(tooMany, true), "WORKER_ACTION_REQUIRED");
    expect(error.details).toEqual({ field: "endTurn", actionType: "SELECT_CHOOSE", step: "colour_samples_swap" });
  });
});

describe("the Order Phase turn (D21: Deliver · done)", () => {
  const ORDERS: StateSpec = { ...ALL_FREE, round: 2, phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 } };

  it.each(FREE_ACTIONS)("%s with true applies, then ends the turn as END_ORDER_TURN would", (_name, action) => {
    const single = play(ORDERS, [withEndTurn(action, true)], "halt");
    const double = play(ORDERS, [action, END_ORDER_TURN], "halt");
    expectSameAsTwoCommands(single, double);
    expect(orderTurnEnded(single.events)[0]).toEqual({ type: "ORDER_TURN_ENDED", playerId: "p1", automatic: false });

    const absent = play(ORDERS, [action], "halt");
    expect(absent.prompt().actorIds).toEqual(["p1"]);
    const declined = play(ORDERS, [withEndTurn(action, false)], "halt");
    expect(declined.events).toEqual(absent.events);
    expect(declined.state).toEqual(absent.state);
  });

  it("deliver · done when the delivery was the last thing: the turn ended by itself (automatic: true)", () => {
    const spec: StateSpec = { players: [{ hand: ["S08"] }, {}], ceramics: [STANDARD_BOWL], round: 2, phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 } };
    const absent = play(spec, [{ type: "COMPLETE_ORDER", orderId: "S08", ceramicIds: ["c1"] }], "halt");
    expect(orderTurnEnded(absent.events)[0]).toEqual({ type: "ORDER_TURN_ENDED", playerId: "p1", automatic: true });
    const single = play(spec, [{ type: "COMPLETE_ORDER", orderId: "S08", ceramicIds: ["c1"], endTurn: true }], "halt");
    expect(single.events).toEqual(absent.events);
    expect(single.state).toEqual(absent.state);
  });

  it("endTurnOptions offers the three free actions there, and nothing to other seats", () => {
    const t = play(ORDERS, [], "halt");
    expect(endTurnOptions(t.view("p1"))).toEqual({
      stage: "order_phase",
      commandTypes: ["USE_IMPERIAL_PRIORITY", "SELL_FLAWED", "COMPLETE_ORDER"],
      afterActionWouldOpen: false,
      requested: false,
    });
    expect(endTurnOptions(t.view("p2"))).toBeNull();
    expect(endTurnOptions(t.view(null))).toBeNull();
  });
});

describe("a turn end that hands the phase over", () => {
  /** p1's last available worker is Apprentice 1; p2 has placed all four. */
  const LAST_WORK_TURN: PlacementSpec[] = [
    { player: "p1", worker: "shifu", locationId: "canal_wharf" },
    { player: "p1", worker: 2, locationId: "canal_wharf" },
    { player: "p1", worker: 3, locationId: "canal_wharf" },
    ...(["shifu", 1, 2, 3] as const).map((worker): PlacementSpec => ({ player: "p2", worker, locationId: "canal_wharf" })),
  ];
  /** p1 holds two Finished Flawed ceramics (c1, c2), so the after-action step opens and stays
   * open after one sale (R27). */
  const lastWorkTurn = (loaded: boolean): StateSpec => ({
    players: [{ resources: { coins: 6 } }, {}],
    placements: LAST_WORK_TURN,
    ceramics: [FLAWED_BOWL, FLAWED_PLATE, ...(loaded ? [{ owner: "p2", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1" } as CeramicSpec] : [])],
  });
  const lookedFirst = (t: LocalTable): GameAction => {
    const look = t.state.hidden.pendingLook;
    if (look === null || look.kind === "guild_inspection" || look.orderIds[0] === undefined) throw new Error("no Select look is open");
    return { type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: look.orderIds[0] }] };
  };
  const MARKET: GameAction = { type: "PLACE_COMMISSION_MARKET", workerId: "p1:apprentice:1" };

  /** The last Work turn ended three ways: the placement, a request remembered through the
   * Commission Market Select, and a free action after the placement. */
  const LAST_TURN_ENDS: ReadonlyArray<[string, (t: LocalTable, endTurn?: boolean) => void]> = [
    ["the placement (Place · end turn)", (t, endTurn) => t.act("p1", withEndTurn(WHARF, endTurn))],
    [
      "the Commission Market Select (a remembered request)",
      (t, endTurn) => {
        t.act("p1", withEndTurn(MARKET, endTurn));
        t.act("p1", lookedFirst(t));
      },
    ],
    [
      "a sale after the placement (⟨Action⟩ · end turn)",
      (t, endTurn) => {
        t.act("p1", WHARF);
        t.act("p1", withEndTurn(SELL, endTurn));
      },
    ],
  ];

  describe.each([
    ["into the Firing's Contributions", true, "firing_contributions"],
    ["through a skipped firing into the Order Phase", false, "orders"],
  ] as const)("the last Work turn, %s", (_name, loaded, landsIn) => {
    it.each(LAST_TURN_ENDS)("ended by %s: the same events, state, RNG and private state as the two-command path", (_how, end) => {
      const single = play(lastWorkTurn(loaded), []);
      end(single, true);
      const double = play(lastWorkTurn(loaded), []);
      end(double);
      expect(stepOf(double)).toBe("p1:after_action");
      double.act("p1", END_TURN);

      expectSameAcrossHandOver(single, double);
      expect(workTurnEnded(single.events).at(-1)).toEqual({ type: "WORK_TURN_ENDED", playerId: "p1", automatic: false });
      expect(single.events.map((event) => event.type)).toContain("WORK_PHASE_ENDED");
      expect(single.state.phase.type).toBe(landsIn);
      assertInvariants(single.state, { live: true });
    });
  });

  /** The last Order Phase turn: p2 has had theirs; p1 holds S08 (completed with the Standard plate
   * c1) and the Flawed bowl c2, so the turn stays open after either free action (R28). */
  const lastOrderTurn = (p2Hand: OrderId[]): StateSpec => ({
    round: 2,
    firstPlayerId: "p2",
    players: [{ hand: ["S08"] }, { hand: p2Hand }],
    ceramics: [STANDARD_PLATE, FLAWED_BOWL],
    phase: { type: "orders", turnOrder: ["p2", "p1"], index: 1 },
  });
  const LAST_ORDER_ACTIONS: ReadonlyArray<[string, GameAction]> = [
    ["COMPLETE_ORDER (Deliver · done)", { type: "COMPLETE_ORDER", orderId: "S08", ceramicIds: ["c1"] }],
    ["SELL_FLAWED", { type: "SELL_FLAWED", ceramicId: "c2" }],
  ];

  it.each(LAST_ORDER_ACTIONS)("the last Order Phase turn ended by %s into a pending hand trim: openedAtRevision is that command's revision", (_name, action) => {
    const over = lastOrderTurn(["O01", "O02", "O03", "O04", "O05"]);
    const single = play(over, [withEndTurn(action, true)]);
    const double = play(over, [action]);
    expect(double.prompt().actorIds).toEqual(["p1"]);
    double.act("p1", END_ORDER_TURN);

    expectSameAcrossHandOver(single, double);
    expect(orderTurnEnded(single.events).at(-1)).toEqual({ type: "ORDER_TURN_ENDED", playerId: "p1", automatic: false });
    for (const t of [single, double]) {
      const phase = t.state.phase;
      if (phase.type !== "cleanup_hand_limit") throw new Error(`expected the hand trim, got ${phase.type}`);
      expect(phase.pendingPlayerIds).toEqual(["p2"]);
      // revision + 1 of the command that opened the window: the command just committed.
      expect(phase.openedAtRevision).toBe(t.state.revision);
    }

    // p2's trim then leaves the two rooms equal again, apart from the revision.
    const trim: GameAction = { type: "DISCARD_TO_HAND_LIMIT", orderIds: ["O05"] };
    single.act("p2", trim);
    double.act("p2", trim);
    expectSameAsTwoCommands(single, double);
    expect((single.rng as SeededRandom).getState()).toBe((double.rng as SeededRandom).getState());
  });

  it.each(LAST_ORDER_ACTIONS)("the last Order Phase turn ended by %s, nobody to trim: on into the next round", (_name, action) => {
    const spec = lastOrderTurn([]);
    const single = play(spec, [withEndTurn(action, true)]);
    const double = play(spec, [action, END_ORDER_TURN]);
    expectSameAcrossHandOver(single, double);
    expect(single.state.round).toBe(3);
    expect(single.events.map((event) => event.type)).toEqual(expect.arrayContaining(["ORDER_TURN_ENDED", "KILN_DIE_ROLLED"]));
  });
});

describe("once-per-round completion effects are unaffected (L176)", () => {
  /** p1's two held Orders and the ceramics that complete them; each completion would trigger the
   * Kiln ability and Canal Barge. */
  const CASES: ReadonlyArray<[string, StateSpec]> = [
    [
      "Guan (a Crown Order) and Canal Barge",
      {
        players: [{ kilnId: "GU", techs: ["T23"], hand: ["O20", "O17"] }, { kilnId: "RU" }],
        ceramics: [
          { owner: "p1", stage: "finished", shape: "bowl", glaze: "moon_white", decoration: "carved", quality: "fine" },
          { owner: "p1", stage: "finished", shape: "washer", glaze: "white", decoration: "painted", quality: "fine" },
        ],
      },
    ],
    [
      "Ru (a plain Celadon Masterpiece) and Canal Barge",
      {
        players: [{ kilnId: "RU", techs: ["T23"], hand: ["O01", "O02"] }, { kilnId: "GU" }],
        ceramics: [
          { owner: "p1", stage: "finished", shape: "bowl", glaze: "celadon", decoration: "plain", quality: "masterpiece" },
          { owner: "p1", stage: "finished", shape: "plate", glaze: "celadon", decoration: "plain", quality: "masterpiece" },
        ],
      },
    ],
  ];

  it.each(CASES)("%s pay on the round's first completion when it ends the turn, and not again in the round", (_name, spec) => {
    const hand = (spec.players as Array<{ hand: OrderId[] }>)[0]!.hand;
    const first: GameAction = { type: "COMPLETE_ORDER", orderId: hand[0]!, ceramicIds: ["c1"] };
    const single = play(spec, [WHARF, withEndTurn(first, true)]);
    const double = play(spec, [WHARF, first, END_TURN]);
    expectSameAsTwoCommands(single, double);
    expect(count(single.events, "KILN_ABILITY_USED")).toBe(1);
    expect(single.events.filter((event) => event.type === "TECH_USED")).toEqual([{ type: "TECH_USED", playerId: "p1", techId: "T23" }]);
    expect(single.events.find((event) => event.type === "ORDER_COMPLETED")).toMatchObject({ record: { canalBargeCoins: 2 } });
    expect(stepOf(single)).toBe("p2:before_action");

    // Later in the same round, the second completion (its own free-action window) triggers neither.
    single.act("p2", { type: "PLACE_CANAL_WHARF", workerId: "p2:apprentice:1" });
    expect(stepOf(single)).toBe("p1:before_action");
    const second = single.act("p1", { type: "COMPLETE_ORDER", orderId: hand[1]!, ceramicIds: ["c2"] });
    expect(second.find((event) => event.type === "ORDER_COMPLETED")).toMatchObject({ record: { canalBargeCoins: 0 } });
    expect(second.some((event) => event.type === "TECH_USED" || event.type === "KILN_ABILITY_USED")).toBe(false);
  });
});

describe("endTurnOptions (public facts and the viewer's own request only)", () => {
  it("before the action offers the placements; after it the free actions; nothing to another seat", () => {
    const before = play(ALL_FREE, []);
    expect(endTurnOptions(before.view("p1"))).toEqual({
      stage: "before_action",
      commandTypes: [
        "PLACE_MATERIALS_YARD",
        "PLACE_FORM_DECORATE",
        "PLACE_GLAZE_LOAD",
        "PLACE_COMMISSION_MARKET",
        "PLACE_GUILD_HALL",
        "PLACE_CANAL_WHARF",
        "PLACE_MAGISTRATES_HALL",
      ],
      afterActionWouldOpen: true,
      requested: false,
    });
    expect(endTurnOptions(before.view("p2"))).toBeNull();
    const after = play(ALL_FREE, [WHARF]);
    expect(endTurnOptions(after.view("p1"))).toEqual({
      stage: "after_action",
      commandTypes: ["USE_IMPERIAL_PRIORITY", "SELL_FLAWED", "COMPLETE_ORDER"],
      afterActionWouldOpen: true,
      requested: false,
    });
    expect(endTurnOptions(play(CLOSED_AFTER, []).view("p1"))).toMatchObject({ afterActionWouldOpen: false });
  });

  it("two hands of the same size give the same options (R27)", () => {
    // S08 is completable with the Standard plate; O20 (a Moon White carved bowl) is not.
    const completable = play({ players: [{ hand: ["S08"] }, {}], ceramics: [STANDARD_PLATE] }, []);
    const blocked = play({ players: [{ hand: ["O20"] }, {}], ceramics: [STANDARD_PLATE] }, []);
    expect(endTurnOptions(completable.view("p1"))).toEqual(endTurnOptions(blocked.view("p1")));
    completable.act("p1", WHARF);
    blocked.act("p1", WHARF);
    expect(endTurnOptions(completable.view("p1"))).toEqual(endTurnOptions(blocked.view("p1")));
  });

  it("every listed command type accepts true and every unlisted free action refuses it, as the validators decide", () => {
    for (const steps of [[], [WHARF]] as const) {
      const t = play(ALL_FREE, steps);
      const view = t.actorView("p1");
      const listed = new Set<EndTurnCommandType>(endTurnOptions(view)?.commandTypes ?? []);
      for (const action of legalActions(view, { mode: "canonical" })) {
        if (!(END_TURN_COMMAND_TYPES as readonly string[]).includes(action.type)) continue;
        const verdict = validateAction(view, withEndTurn(action, true));
        expect(verdict === null, `${action.type} endTurn: true in ${stepOf(t)}`).toBe(listed.has(action.type as EndTurnCommandType));
        expect(validateAction(view, withEndTurn(action, false)), `${action.type} endTurn: false`).toBeNull();
      }
    }
  });
});

describe("legality and invariants", () => {
  it("canonical legal commands never carry the field (computer players and the fallback omit it)", () => {
    for (const steps of [[], [WHARF]] as const) {
      const t = play(ALL_FREE, steps);
      for (const action of legalActions(t.actorView("p1"), { mode: "canonical" })) {
        expect(Object.hasOwn(action, "endTurn"), action.type).toBe(false);
      }
    }
  });

  it("reports a request that outlived its worker action, or that is not true", () => {
    const after: GameState = buildState({ ...OPEN_AFTER, placements: [{ player: "p1", worker: 1, locationId: "canal_wharf" }], phase: { type: "work_turn", activePlayerId: "p1", step: { kind: "after_action" }, endTurnAfterAction: true } });
    expect(invariantViolations(after, { live: true }).join("\n")).toMatch(/an end-turn request outlived its worker action \(after_action\)/);
    const malformed = buildState(OPEN_AFTER);
    (malformed.phase as { endTurnAfterAction?: unknown }).endTurnAfterAction = false;
    expect(invariantViolations(malformed).join("\n")).toMatch(/the end-turn request is not `true`/);
  });
});
