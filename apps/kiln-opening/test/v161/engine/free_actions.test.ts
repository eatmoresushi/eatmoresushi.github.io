/**
 * Free actions (rev. 5 L168–176, change 36; DELTA §16): selling a Flawed ceramic, completing held
 * Orders and spending Imperial Priority, any number, in any order, on your own turn before or
 * after your worker action (not during it) and in your Order Phase turn. Rewards gained before a
 * placement count for it; ceramics fired this round are first available after the firing; the
 * once-per-round completion effects (Ru, Guan, Tribute Ware, Canal Barge) have one use per round
 * across every window; there are no free actions on other players' turns, during the firing, at
 * Setup, in the Setter's Mark window or at Cleanup (I1).
 *
 * Window-specific detail lives in `flawed_sale.test.ts`, `order_phase.test.ts`,
 * `imperial_priority.test.ts`, `canal_barge.test.ts` and `work_turn.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { createGame, validateAction } from "../../../src/game/engine.ts";
import { freeActionWindowOf } from "../../../src/game/freeActionWindow.ts";
import { legalActionFamilies } from "../../../src/game/legalActions.ts";
import { formatRuleError } from "../../../src/game/ruleErrorText.ts";
import { SeededRandom } from "../../../src/game/rng.ts";
import { freeActionOptions } from "../../../src/game/selectors.ts";
import type { CeramicSpec, PlayerSpec, StateSpec } from "./support/fixtures.ts";
import { buildState } from "./support/fixtures.ts";
import type { FreeActionWindow, GameAction, GameEvent, GamePhase, GameRuleErrorCode, OrderId, PlayerId } from "../../../src/game/types.ts";
import { actorViewOf, projectEvent } from "../../../src/game/view.ts";
import { openFiringTable, tendAll } from "./support/firing.ts";
import { LocalTable } from "./support/localTable.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

const FLAWED_BOWL: CeramicSpec = { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "flawed" };
const STANDARD_PLATE: CeramicSpec = { owner: "p1", stage: "finished", shape: "plate", glaze: "white", quality: "standard" };
const STANDARD_BOWL: CeramicSpec = { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "standard" };
const SHAPED_VASE: CeramicSpec = { owner: "p1", stage: "shaped", shape: "vase" };
/** O18 asks for a Fine+ Celadon Vase and shows 1 Crown (6 VP, 2 Coins). */
const CELADON_VASE: CeramicSpec = { owner: "p1", stage: "finished", shape: "vase", glaze: "celadon", quality: "fine" };

const sell = (ceramicId: string): GameAction => ({ type: "SELL_FLAWED", ceramicId });
const complete = (orderId: OrderId, ceramicIds: string[], extra: Partial<Extract<GameAction, { type: "COMPLETE_ORDER" }>> = {}): GameAction => ({
  type: "COMPLETE_ORDER",
  orderId,
  ceramicIds,
  ...extra,
});
const priority = (ceramicId: string): GameAction => ({ type: "USE_IMPERIAL_PRIORITY", ceramicId, glaze: "celadon", imperialModifier: 0 });
const wharf = (playerId: PlayerId, worker: "shifu" | 1 | 2 | 3 = 1): GameAction => ({
  type: "PLACE_CANAL_WHARF",
  workerId: worker === "shifu" ? `${playerId}:shifu` : `${playerId}:apprentice:${worker}`,
});

function only<T extends GameEvent["type"]>(events: readonly GameEvent[], type: T): Extract<GameEvent, { type: T }> {
  const found = events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
  expect(found, `exactly one ${type}`).toHaveLength(1);
  return found[0] as Extract<GameEvent, { type: T }>;
}

/** The window each of the three free-action events carries. */
function windowsOf(events: readonly GameEvent[]): Array<[string, FreeActionWindow]> {
  const out: Array<[string, FreeActionWindow]> = [];
  for (const event of events) {
    if (event.type === "CERAMIC_SOLD" || event.type === "ORDER_COMPLETED" || event.type === "IMPERIAL_PRIORITY_USED") {
      out.push([event.type, event.window]);
    }
  }
  return out;
}

/** p1 at Recognition 3 (Imperial Kiln, token held) with S08 in hand: c1 a Finished Flawed Bowl,
 * c2 a Finished Standard Plate, c3 a Shaped Vase. */
function allThree(extra: Partial<StateSpec> = {}, p1: PlayerSpec = {}): StateSpec {
  return {
    players: [{ recognition: 3, hand: ["S08"], ...p1 }, {}],
    ceramics: [FLAWED_BOWL, STANDARD_PLATE, SHAPED_VASE],
    ...extra,
  };
}

describe("any number, in any order, in each free-action window (rev. 5 L170)", () => {
  it("before the worker action: a sale, a completion and Imperial Priority, then the worker action is still due", () => {
    const t = new LocalTable(buildState(allThree()));
    expect(freeActionOptions(t.view("p1"))).toEqual({ window: "before_action", completableOrderIds: ["S08"], sellableCeramicIds: ["c1"], imperialPriority: true });
    expect(legalActionFamilies(t.view("p1")).slice(0, 3)).toEqual(["USE_IMPERIAL_PRIORITY", "SELL_FLAWED", "COMPLETE_ORDER"]);
    const events = [...t.act("p1", priority("c3")), ...t.act("p1", complete("S08", ["c2"])), ...t.act("p1", sell("c1"))];
    expect(windowsOf(events)).toEqual([
      ["IMPERIAL_PRIORITY_USED", "before_action"],
      ["ORDER_COMPLETED", "before_action"],
      ["CERAMIC_SOLD", "before_action"],
    ]);
    // Public, like every completion (rev. 5 L424) and every sale.
    expect(events.map(projectEvent)).toEqual(events);
    expect(t.state.phase).toEqual({ type: "work_turn", activePlayerId: "p1", step: { kind: "before_action" } });
    t.expectRuleError("p1", { type: "END_TURN" }, "WORKER_ACTION_REQUIRED");
    // Nothing is left, so the after-action window does not open (I2).
    const placed = t.act("p1", wharf("p1"));
    expect(only(placed, "WORK_TURN_ENDED").automatic).toBe(true);
  });

  it("after the worker action: the window opens, stays open while something is left, and closes after the last", () => {
    const t = new LocalTable(buildState(allThree()));
    t.act("p1", wharf("p1"));
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "after_action" } });
    expect(freeActionOptions(t.view("p1"))?.window).toBe("after_action");
    expect(legalActionFamilies(t.view("p1"))).toEqual(["USE_IMPERIAL_PRIORITY", "SELL_FLAWED", "COMPLETE_ORDER", "END_TURN"]);
    const first = t.act("p1", sell("c1"));
    expect(windowsOf(first)).toEqual([["CERAMIC_SOLD", "after_action"]]);
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "after_action" } });
    const second = t.act("p1", complete("S08", ["c2"]));
    expect(windowsOf(second)).toEqual([["ORDER_COMPLETED", "after_action"]]);
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "after_action" } });
    const last = t.act("p1", priority("c3"));
    expect(windowsOf(last)).toEqual([["IMPERIAL_PRIORITY_USED", "after_action"]]);
    expect(only(last, "WORK_TURN_ENDED")).toEqual({ type: "WORK_TURN_ENDED", playerId: "p1", automatic: true });
    expect(t.state.phase).toMatchObject({ activePlayerId: "p2", step: { kind: "before_action" } });
  });

  it("in the Order Phase turn: the turn closes after the last one (I3)", () => {
    const t = new LocalTable(buildState(allThree({ round: 2, phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 } })), { flow: "halt" });
    expect(freeActionOptions(t.view("p1"))?.window).toBe("order_phase");
    const events = [...t.act("p1", complete("S08", ["c2"])), ...t.act("p1", priority("c3"))];
    expect(t.prompt().actorIds).toEqual(["p1"]);
    const last = t.act("p1", sell("c1"));
    expect(windowsOf([...events, ...last])).toEqual([
      ["ORDER_COMPLETED", "order_phase"],
      ["IMPERIAL_PRIORITY_USED", "order_phase"],
      ["CERAMIC_SOLD", "order_phase"],
    ]);
    expect(last.slice(2)).toEqual([
      { type: "ORDER_TURN_ENDED", playerId: "p1", automatic: true },
      { type: "ORDER_TURN_STARTED", playerId: "p2" },
      { type: "ORDER_TURN_ENDED", playerId: "p2", automatic: true },
    ]);
    expect(t.halts).toEqual([{ kind: "continue_after", milestone: "order_phase_done" }]);
  });
});

describe("not during a worker action: WORKER_ACTION_IN_PROGRESS (rev. 5 L170)", () => {
  const actions: GameAction[] = [sell("c1"), complete("S08", ["c2"]), priority("c3")];

  const WORKER_ACTION_TEXT = {
    en: "Finish your worker action first: this can be done before or after it, not during it.",
    zh: "先完成工人行动：这一步只能在工人行动之前或之后进行，不能在行动中途进行",
  };

  function refusedInSubStep(t: LocalTable, step: string, text: { en: string; zh: string } = WORKER_ACTION_TEXT, techId?: string): void {
    expect(t.state.phase).toMatchObject({ type: "work_turn", activePlayerId: "p1", step: { kind: step } });
    expect(freeActionWindowOf(t.state, "p1")).toBeNull();
    expect(freeActionOptions(t.view("p1"))).toBeNull();
    for (const action of actions) {
      const error = t.expectRuleError("p1", action, "WORKER_ACTION_IN_PROGRESS");
      expect(error.details).toEqual({ phase: "work_turn", step, actionType: action.type, ...(techId === undefined ? {} : { techId }) });
      expectDocumentedDetails(error);
      expect(formatRuleError(error, "en")).toBe(text.en);
      expect(formatRuleError(error, "zh")).toBe(text.zh);
    }
    const families = legalActionFamilies(t.view("p1"));
    for (const action of actions) expect(families).not.toContain(action.type);
  }

  /** The swap's Select is no worker action, so the message names the Select (rev. 5 L632, L170). */
  const SWAP_SELECT_TEXT = {
    en: "Finish the Colour Samples Select first: this can be done before or after it, not during it.",
    zh: "先完成色样簿的精选：这一步只能在精选之前或之后进行，不能在中途进行",
  };

  it("in the Commission Market's Select", () => {
    const t = new LocalTable(buildState(allThree()));
    t.act("p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:apprentice:1" });
    refusedInSubStep(t, "commission_market");
  });

  it("in the Guild Hall Shifu's inspection", () => {
    const t = new LocalTable(buildState(allThree({}, { resources: { coins: 9 } })));
    t.act("p1", { type: "PLACE_GUILD_HALL", workerId: "p1:shifu", choice: { kind: "inspect", discipline: "firing" } });
    refusedInSubStep(t, "guild_inspection");
  });

  it("in Colour Samples' Select when it is acquired", () => {
    const t = new LocalTable(buildState(allThree({ techDisplay: { glazing_loading: ["T10", "T20"] } }, { resources: { coins: 9 } })));
    t.act("p1", { type: "PLACE_GUILD_HALL", workerId: "p1:apprentice:1", choice: { kind: "buy_face_up", techId: "T10" } });
    refusedInSubStep(t, "colour_samples");
  });

  it("in the Colour Samples swap's Select opened before the worker action: no worker action has started, so the message names the Select", () => {
    const t = new LocalTable(buildState(allThree({}, { techs: ["T10"], hand: ["S08", "O40"] })));
    t.act("p1", { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: "O40" });
    expect(t.state.phase).toMatchObject({ step: { kind: "colour_samples_swap", returnTo: "before_action" } });
    expect(Object.values(t.state.players["p1"]?.workers ?? {}).every((worker) => worker.placement === null)).toBe(true);
    refusedInSubStep(t, "colour_samples_swap", SWAP_SELECT_TEXT, "T10");
  });

  it("in the Colour Samples swap's Select opened after the worker action: the same Select message", () => {
    const t = new LocalTable(buildState(allThree({}, { techs: ["T10"], hand: ["S08", "O40"] })));
    t.act("p1", wharf("p1"));
    t.act("p1", { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: "O40" });
    expect(t.state.phase).toMatchObject({ step: { kind: "colour_samples_swap", returnTo: "after_action" } });
    refusedInSubStep(t, "colour_samples_swap", SWAP_SELECT_TEXT, "T10");
  });
});

describe("only on your own turn (rev. 5 L176): NOT_YOUR_DECISION", () => {
  it("on another player's Work turn, before or after their action", () => {
    const spec = allThree({ firstPlayerId: "p2" });
    const t = new LocalTable(buildState(spec));
    for (const action of [sell("c1"), complete("S08", ["c2"]), priority("c3")]) {
      expectDocumentedDetails(t.expectRuleError("p1", action, "NOT_YOUR_DECISION"));
    }
    expect(freeActionOptions(t.view("p1"))).toBeNull();
    t.act("p2", wharf("p2"));
    // p2's turn ended (nothing to offer), so it is p1's own before-action window now.
    expect(freeActionWindowOf(t.state, "p1")).toBe("before_action");
  });

  it("on another player's Order Phase turn", () => {
    const t = new LocalTable(
      buildState({ ...allThree({ round: 2, phase: { type: "orders", turnOrder: ["p2", "p1"], index: 0 } }), players: [{ recognition: 3, hand: ["S08"] }, { hand: ["S01"] }], ceramics: [FLAWED_BOWL, STANDARD_PLATE, SHAPED_VASE, { ...STANDARD_BOWL, owner: "p2" }] }),
      { flow: "halt" },
    );
    expect(t.prompt().actorIds).toEqual(["p2"]);
    for (const action of [sell("c1"), complete("S08", ["c2"]), priority("c3")]) {
      expectDocumentedDetails(t.expectRuleError("p1", action, "NOT_YOUR_DECISION"));
    }
  });
});

describe("never during the firing, at Setup, in the Setter's Mark window or at Cleanup (rev. 5 L176, I1): WRONG_PHASE", () => {
  const actions: GameAction[] = [sell("c1"), complete("S08", ["c2"]), priority("c3")];

  function refused(t: LocalTable, actor: PlayerId, code: GameRuleErrorCode = "WRONG_PHASE"): void {
    expect(freeActionWindowOf(t.state, actor)).toBeNull();
    expect(freeActionOptions(t.view(actor))).toBeNull();
    for (const action of actions) {
      const error = t.expectRuleError(actor, action, code);
      expectDocumentedDetails(error);
    }
  }

  it("in every step of the firing", () => {
    // p1 (Test Pieces, Jun) fires c4 in Low; p2 (Second Firing) fires c5 in Middle (Standard); c1–c3 as above.
    const t = openFiringTable({
      players: [{ kilnId: "JU", recognition: 3, hand: ["S08"], techs: ["T13"], resources: { wood: 5 } }, { kilnId: "RU", techs: ["T14"] }],
      fireDeck: [0, 1, -1],
      ceramics: [
        FLAWED_BOWL,
        STANDARD_PLATE,
        SHAPED_VASE,
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_1" },
        { owner: "p2", stage: "loaded", shape: "plate", glaze: "moon_white", at: "middle_1" },
      ],
    });
    expect(t.state.phase.type).toBe("firing_contributions");
    refused(t, "p1");
    tendAll(t);
    expect(t.state.phase.type).toBe("firing_test_pieces");
    refused(t, "p1");
    t.act("p1", { type: "TEST_PIECES_DECIDE", peek: false });
    expect(t.state.phase.type).toBe("firing_heat_adjustment");
    refused(t, "p1");
    t.act("p1", { type: "RESOLVE_JUN", adjustment: null });
    expect(t.prompt()).toEqual({ phaseType: "firing_after_quality", actorIds: ["p2"], mode: "single" });
    refused(t, "p1");
    t.act("p2", { type: "USE_SECOND_FIRING", ceramicId: "c5" });
    expect(t.state.phase.type).toBe("firing_second_firing_choice");
    refused(t, "p1");
  });

  it("in the Setter's Mark window, the Cleanup trim and the Setup choice", () => {
    const marks = new LocalTable(buildState(allThree({ phase: { type: "round_start_setters_mark", queue: { actorIds: ["p1"], index: 0 } } }, { techs: ["T22"] })));
    refused(marks, "p1");
    const trim = new LocalTable(
      buildState(allThree({ phase: { type: "cleanup_hand_limit", pendingPlayerIds: ["p1"], openedAtRevision: 0 } }, { hand: ["S08", "S01", "O01", "O02", "O03"] })),
    );
    refused(trim, "p1");
    expect(legalActionFamilies(trim.view("p1"))).toEqual(["DISCARD_TO_HAND_LIMIT"]);
    const created = createGame({ gameId: "free-setup", players: [{ id: "p1", displayName: "A" }, { id: "p2", displayName: "B" }] }, new SeededRandom(3));
    if (!created.ok) throw new Error("createGame failed");
    const setup = new LocalTable(created.state, { seed: 3 });
    refused(setup, setup.prompt().actorIds[0] ?? "p2");
  });
});

describe("rewards count for the placement that follows (rev. 5 L176)", () => {
  it("a completion's Coins make the Guild Hall affordable", () => {
    const t = new LocalTable(buildState({ players: [{ hand: ["S08"], resources: { coins: 0 } }, {}], ceramics: [STANDARD_PLATE], techDisplay: { glazing_loading: ["T10", "T20"] } }));
    const buy: GameAction = { type: "PLACE_GUILD_HALL", workerId: "p1:apprentice:1", choice: { kind: "buy_face_up", techId: "T10" } };
    expect(validateAction(actorViewOf(t.state, "p1"), buy)).not.toBeNull();
    t.act("p1", complete("S08", ["c1"]));
    expect(t.player("p1").resources.coins).toBe(4);
    t.act("p1", buy);
    expect(t.player("p1").techs.map((tech) => tech.id)).toEqual(["T10"]);
  });

  it("a Crown to Recognition 2 gives the Imperial Kiln for this turn's Glaze & Load (no Wood)", () => {
    const t = new LocalTable(
      buildState({ players: [{ recognition: 1, hand: ["O18"], resources: { wood: 0 } }, {}], ceramics: [CELADON_VASE, { owner: "p1", stage: "shaped", shape: "bowl" }] }),
    );
    const load: GameAction = { type: "PLACE_GLAZE_LOAD", workerId: "p1:apprentice:1", loads: [{ ceramicId: "c2", glaze: "white", destination: { kiln: "imperial", imperialModifier: 1 } }] };
    expect(validateAction(actorViewOf(t.state, "p1"), load)).not.toBeNull();
    const events = t.act("p1", complete("O18", ["c1"]));
    expect(events.map((e) => e.type)).toContain("IMPERIAL_KILN_GAINED");
    expect(t.player("p1").imperial).toMatchObject({ recognition: 2, kilnGained: true });
    t.act("p1", load);
    expect(t.state.ceramics["c2"]).toMatchObject({ stage: "loaded", placement: { kiln: "imperial", imperialModifier: 1 } });
  });

  it("a Crown to Recognition 3 gives the Imperial Priority token, usable in the same window", () => {
    const t = new LocalTable(buildState({ players: [{ recognition: 2, hand: ["O18"] }, {}], ceramics: [CELADON_VASE, { owner: "p1", stage: "shaped", shape: "bowl" }] }));
    expect(validateAction(actorViewOf(t.state, "p1"), priority("c2"))).toMatchObject({ code: "IMPERIAL_PRIORITY_UNAVAILABLE" });
    expect(t.act("p1", complete("O18", ["c1"])).map((e) => e.type)).toContain("IMPERIAL_PRIORITY_GAINED");
    expect(freeActionOptions(t.view("p1"))?.imperialPriority).toBe(true);
    expect(windowsOf(t.act("p1", priority("c2")))).toEqual([["IMPERIAL_PRIORITY_USED", "before_action"]]);
  });

  it("a Crown to Recognition 3 makes the Magistrate's Hall illegal for the placement", () => {
    const t = new LocalTable(buildState({ players: [{ recognition: 2, hand: ["O18"], resources: { coins: 9 } }, {}], ceramics: [CELADON_VASE] }));
    const hall: GameAction = { type: "PLACE_MAGISTRATES_HALL", workerId: "p1:apprentice:1" };
    expect(validateAction(actorViewOf(t.state, "p1"), hall)).toBeNull();
    t.act("p1", complete("O18", ["c1"]));
    expectDocumentedDetails(t.expectRuleError("p1", hall, "RECOGNITION_GATE"));
  });
});

describe("reserve and deliver in one turn (rev. 5 L176; change 36; INT Same-turn delivery: L417's \"later\" is later than the reservation)", () => {
  it("a face-up Order taken by a before-action Colour Samples swap, completed before the worker action", () => {
    const t = new LocalTable(
      buildState({ players: [{ techs: ["T10"], hand: ["O40"] }, {}], ceramics: [STANDARD_BOWL], display: ["O01", "O02", "O03", "O04", "O05", "O06"] }),
    );
    t.act("p1", { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: "O40" });
    t.act("p1", { type: "SELECT_CHOOSE", reservations: [{ kind: "face_up", slotIndex: 0, orderId: "O01" }] });
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "before_action" } });
    expect(freeActionOptions(t.view("p1"))).toMatchObject({ window: "before_action", completableOrderIds: ["O01"] });
    expect(only(t.act("p1", complete("O01", ["c1"])), "ORDER_COMPLETED")).toMatchObject({ window: "before_action", record: { orderId: "O01" } });
    // The position stays empty until the turn ends (the deferred refill); the worker is still due.
    expect(t.state.market.display[0]).toBeNull();
    t.expectRuleError("p1", { type: "END_TURN" }, "WORKER_ACTION_REQUIRED");
  });

  it("a face-up Order reserved at the Commission Market, completed after the action", () => {
    const t = new LocalTable(buildState({ players: [{}, {}], ceramics: [STANDARD_BOWL], display: ["O01", "O02", "O03", "O04", "O05", "O06"] }));
    t.act("p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:apprentice:1" });
    t.act("p1", { type: "SELECT_CHOOSE", reservations: [{ kind: "face_up", slotIndex: 0, orderId: "O01" }] });
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "after_action" } });
    const events = t.act("p1", complete("O01", ["c1"]));
    expect(only(events, "ORDER_COMPLETED")).toMatchObject({ window: "after_action", record: { orderId: "O01" } });
    // The deferred refill still runs when the turn ends (rev. 5 L405 unchanged), here at once.
    expect(events.map((e) => e.type)).toEqual(["ORDER_COMPLETED", "RESOURCES_CHANGED", "DISPLAY_REFILLED", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
  });

  it("the Canal Wharf Shifu's unseen card, completed after the action", () => {
    const t = new LocalTable(buildState({ players: [{}, {}], ceramics: [STANDARD_BOWL], mainDeck: ["O01"] }));
    t.act("p1", wharf("p1", "shifu"));
    expect(t.state.hidden.orderHands["p1"]).toEqual(["O01"]);
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "after_action" } });
    expect(only(t.act("p1", complete("O01", ["c1"])), "ORDER_COMPLETED")).toMatchObject({ window: "after_action" });
  });

  it("the Magistrate's Hall Shifu's Crown Order, completed after the action for another Crown", () => {
    const t = new LocalTable(
      buildState({ players: [{ resources: { coins: 4 } }, {}], ceramics: [CELADON_VASE], display: ["O18", "O02", "O03", "O04", "O05", "O06"] }),
    );
    t.act("p1", { type: "PLACE_MAGISTRATES_HALL", workerId: "p1:shifu", crownOrder: { slotIndex: 0, orderId: "O18" } });
    expect(t.player("p1").imperial.recognition).toBe(1);
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "after_action" } });
    t.act("p1", complete("O18", ["c1"]));
    expect(t.player("p1").imperial).toMatchObject({ recognition: 2, kilnGained: true });
  });
});

describe("ceramics fired this round first become available after the firing (rev. 5 L176)", () => {
  it("a loaded ceramic cannot complete an Order or be sold (ILLEGAL_CERAMIC_STAGE, INVALID_TARGET)", () => {
    const t = new LocalTable(
      buildState({ players: [{ hand: ["S08"] }, {}], ceramics: [{ owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1" }] }),
    );
    const error = t.expectRuleError("p1", complete("S08", ["c1"]), "ILLEGAL_CERAMIC_STAGE");
    expect(error.details).toMatchObject({ ceramicId: "c1", stage: "loaded", expectedStage: "finished" });
    expectDocumentedDetails(error);
    expectDocumentedDetails(t.expectRuleError("p1", sell("c1"), "INVALID_TARGET"));
    expect(freeActionOptions(t.view("p1"))).toEqual({ window: "before_action", completableOrderIds: [], sellableCeramicIds: [], imperialPriority: false });
  });
});

describe("once-per-round completion effects share one use across the round's windows (rev. 5 L176)", () => {
  /** Moves a table from p1's Work turn to p1's Order Phase turn of the same round. */
  function toOrderPhase(t: LocalTable): void {
    const phase: GamePhase = { type: "orders", turnOrder: ["p1", "p2"], index: 0 };
    t.state.phase = phase;
  }
  const MOON_BOWL: CeramicSpec = { owner: "p1", stage: "finished", shape: "bowl", glaze: "moon_white", decoration: "carved", quality: "fine" };

  it("Guan: used in a Work-turn completion, not again in the Order Phase; declined there, kept for the Order Phase (R4)", () => {
    const spec: StateSpec = { round: 2, players: [{ kilnId: "GU", hand: ["O18", "O20"] }, { kilnId: "RU" }], ceramics: [CELADON_VASE, MOON_BOWL] };
    const used = new LocalTable(buildState(spec), { flow: "halt", pass: ["worker_action_done"] });
    expect(only(used.act("p1", complete("O18", ["c1"])), "ORDER_COMPLETED").record.kilnAbility).toEqual({ kilnId: "GU", vp: 1, coins: 2 });
    toOrderPhase(used);
    expect(only(used.act("p1", complete("O20", ["c2"])), "ORDER_COMPLETED").record.kilnAbility).toBeNull();

    const declined = new LocalTable(buildState(spec), { flow: "halt", pass: ["worker_action_done"] });
    const first = declined.act("p1", complete("O18", ["c1"], { declineKilnAbility: true }));
    expect(only(first, "ORDER_COMPLETED").record.kilnAbility).toBeNull();
    expect(declined.player("p1").kilnAbilityUsedThisRound).toBe(false);
    toOrderPhase(declined);
    expect(only(declined.act("p1", complete("O20", ["c2"])), "ORDER_COMPLETED").record.kilnAbility).toEqual({ kilnId: "GU", vp: 1, coins: 2 });
  });

  it("Ru: 4 VP on the round's first Celadon Plain Masterpiece delivery, whichever window", () => {
    const mp: CeramicSpec = { owner: "p1", stage: "finished", shape: "bowl", glaze: "celadon", decoration: "plain", quality: "masterpiece" };
    const t = new LocalTable(buildState({ round: 2, players: [{ kilnId: "RU", hand: ["S02", "O16"] }, {}], ceramics: [mp, { ...mp, shape: "plate" }] }), {
      flow: "halt",
      pass: ["worker_action_done"],
    });
    t.act("p1", wharf("p1"));
    const after = t.act("p1", complete("S02", ["c1"]));
    expect(only(after, "ORDER_COMPLETED")).toMatchObject({ window: "after_action", record: { kilnAbility: { kilnId: "RU", vp: 4, coins: 0 } } });
    toOrderPhase(t);
    expect(only(t.act("p1", complete("O16", ["c2"])), "ORDER_COMPLETED").record.kilnAbility).toBeNull();
    expect(t.player("p1").score.kilnAbilities).toBe(4);
  });

  it("Tribute Ware: 1 bonus Crown on the round's first Crown Order, whichever window", () => {
    const t = new LocalTable(buildState({ round: 2, players: [{ kilnId: "DI", techs: ["T25"], hand: ["O18", "O20"] }, {}], ceramics: [CELADON_VASE, MOON_BOWL] }), {
      flow: "halt",
      pass: ["worker_action_done"],
    });
    expect(only(t.act("p1", complete("O18", ["c1"])), "ORDER_COMPLETED").record.bonusCrowns).toBe(1);
    expect(t.player("p1").imperial.recognition).toBe(2);
    toOrderPhase(t);
    expect(only(t.act("p1", complete("O20", ["c2"])), "ORDER_COMPLETED").record.bonusCrowns).toBe(0);
    expect(t.player("p1").imperial.recognition).toBe(3);
  });
});
