/**
 * Imperial Priority (rev. 5 L174, L314, L448, R10, R11; DESIGN §11 Q1 / audit P1; change 36, I3,
 * P7): once per game, as a free action, spend the token — free — to give 1 of your Shaped vessels
 * a Glaze and load it into your empty Imperial Kiln with a chosen public modifier. Any free-action
 * window: before or after your worker action, or your Order Phase turn, whose ceramic waits for
 * the next round's firing (in Round 5 it is never fired). It is a token effect, not a Glaze &
 * Load action, and burns no kiln fuel. Reworking Table may change the Shape first; Kiln Master's
 * marker may go on the load (R22, `kiln_master.test.ts`), and while it waits on an Order Phase
 * load it cannot be placed again (P7).
 */

import { describe, expect, it } from "vitest";
import { freeActionOptions, imperialPriorityOptions, kilnMasterOption } from "../../../src/game/selectors.ts";
import { legalActionFamilies } from "../../../src/game/legalActions.ts";
import { formatRuleError } from "../../../src/game/ruleErrorText.ts";
import { projectPublicState } from "../../../src/game/view.ts";
import type { GameAction, GameEvent, LoadedCeramic, RoundNumber } from "../../../src/game/types.ts";
import { imperialPriorityUsable } from "../../../src/game/work/turn.ts";
import { type PlayerSpec, type StateSpec, buildState, stageCeramic } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

function table(spec: StateSpec = {}): LocalTable {
  return new LocalTable(buildState(spec), { flow: "halt", pass: ["worker_action_done"] });
}

function types(events: readonly GameEvent[]): string[] {
  return events.map((event) => event.type);
}

function priority(ceramicId: string, extra: Partial<Extract<GameAction, { type: "USE_IMPERIAL_PRIORITY" }>> = {}): GameAction {
  return { type: "USE_IMPERIAL_PRIORITY", ceramicId, glaze: "celadon", imperialModifier: 1, ...extra };
}

/** A whole Commission Market action reserving the face-up Order at position 0 (v1.6.2 L225):
 * the placement opens the look, then `SELECT_CHOOSE`. Returns the reservation's events. */
function reserveFaceUp(t: LocalTable, workerId: string): GameEvent[] {
  const orderId = t.state.market.display[0];
  if (orderId === null || orderId === undefined) throw new Error("no Order at 0");
  const playerId = workerId.split(":")[0] as string;
  t.act(playerId, { type: "PLACE_COMMISSION_MARKET", workerId });
  return t.act(playerId, { type: "SELECT_CHOOSE", reservations: [{ kind: "face_up", slotIndex: 0, orderId }] });
}

/** p1 at Recognition 3: Imperial Kiln gained, token held (L306, L314). */
function holder(extra: StateSpec = {}): StateSpec {
  return {
    players: [{ recognition: 3 }, {}],
    ceramics: [{ owner: "p1", shape: "vase", stage: "shaped", decoration: "carved" }],
    ...extra,
  };
}

describe("using the token", () => {
  it("before the worker action: free, loads the vessel with the chosen modifier, and spends the token for the game", () => {
    const t = table(holder());
    const resources = { ...t.player("p1").resources };
    const events = t.act("p1", priority("c1"));

    expect(types(events)).toEqual(["IMPERIAL_PRIORITY_USED", "CERAMIC_LOADED"]);
    expect(events[0]).toEqual({ type: "IMPERIAL_PRIORITY_USED", playerId: "p1", ceramicId: "c1", window: "before_action" });
    expect(events[1]).toMatchObject({
      ceramicId: "c1",
      glaze: "celadon",
      placement: { kiln: "imperial", imperialModifier: 1 },
      loadedBy: "imperial_priority",
    });
    expect(t.player("p1").resources).toEqual(resources);
    expect(t.player("p1").imperial.priority).toBe("spent");
    expect(t.state.ceramics["c1"]).toMatchObject({
      stage: "loaded",
      shape: "vase",
      decoration: "carved",
      glaze: "celadon",
      loadedBy: "imperial_priority",
      placement: { kiln: "imperial", imperialModifier: 1 },
    });
    // R11: the modifier is public.
    expect(projectPublicState(t.state).ceramics["c1"]).toMatchObject({ placement: { kiln: "imperial", imperialModifier: 1 } });
    // Not a worker action: the worker action is still due.
    expect(t.state.phase).toEqual({ type: "work_turn", activePlayerId: "p1", step: { kind: "before_action" } });
    t.expectRuleError("p1", { type: "END_TURN" }, "WORKER_ACTION_REQUIRED");

    const placed = reserveFaceUp(t, "p1:apprentice:1");
    expect(placed.find((event) => event.type === "WORK_TURN_ENDED")).toMatchObject({ automatic: true });
  });

  it("burns no kiln fuel: usable with no Wood, unlike a Shared Kiln load (L309, change 34)", () => {
    const t = table(holder({ players: [{ recognition: 3, resources: { clay: 0, wood: 0, coins: 0 } }, {}] }));
    const events = t.act("p1", priority("c1"));
    expect(types(events)).toEqual(["IMPERIAL_PRIORITY_USED", "CERAMIC_LOADED"]);
    expect(t.player("p1").resources).toEqual({ clay: 0, wood: 0, coins: 0 });
  });

  it("after the worker action: the window opens because the token is usable, and closes once it is spent", () => {
    const t = table(holder());
    reserveFaceUp(t, "p1:apprentice:1");
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "after_action" } });
    const events = t.act("p1", priority("c1", { imperialModifier: -1 }));
    expect(types(events)).toEqual(["IMPERIAL_PRIORITY_USED", "CERAMIC_LOADED", "DISPLAY_REFILLED", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(t.state.ceramics["c1"]).toMatchObject({ placement: { kiln: "imperial", imperialModifier: -1 } });
  });

  it("with the Colour Samples swap also ready the window stays open until both are used or the turn is ended", () => {
    const t = table(holder({ players: [{ recognition: 3, techs: ["T10"], hand: ["S01"] }, {}] }));
    reserveFaceUp(t, "p1:apprentice:1");
    t.act("p1", priority("c1"));
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "after_action" } });
    const ended = t.act("p1", { type: "END_TURN" });
    expect(ended.find((event) => event.type === "WORK_TURN_ENDED")).toMatchObject({ automatic: false });
  });

  it("Canal Barge does not open the window by itself: with held Orders but no Finished ceramic the turn ends (I2)", () => {
    const t = table({ players: [{ techs: ["T23"], hand: ["S01"] }, {}] });
    const placed = reserveFaceUp(t, "p1:apprentice:1");
    expect(placed.find((event) => event.type === "WORK_TURN_ENDED")).toMatchObject({ playerId: "p1", automatic: true });
  });

  it("is not a Glaze & Load action (L652): no personal space is used and Kiln Tending does not trigger", () => {
    const t = table(holder({ players: [{ recognition: 3, techs: ["T20"] }, {}] }));
    const events = t.act("p1", priority("c1"));
    expect(events.filter((event) => event.type === "RESOURCES_CHANGED")).toEqual([]);
    expect(t.player("p1").techs).toEqual([{ id: "T20", acquiredInRound: 1, usedThisRound: false }]);
    expect(Object.values(t.player("p1").workers).every((worker) => worker.placement === null)).toBe(true);
  });
});

describe("a token gained during the worker action (L314, L448)", () => {
  it("reaching Recognition 3 at the Magistrate's Hall opens the after-action window for it", () => {
    const t = table(holder({ players: [{ recognition: 2, resources: { coins: 4 } }, {}] }));
    expect(imperialPriorityUsable(t.state, "p1")).toBe(false);
    const events = t.act("p1", { type: "PLACE_MAGISTRATES_HALL", workerId: "p1:apprentice:1" });
    expect(types(events)).toContain("IMPERIAL_PRIORITY_GAINED");
    expect(t.state.phase).toEqual({ type: "work_turn", activePlayerId: "p1", step: { kind: "after_action" } });
    t.act("p1", priority("c1"));
    expect(t.state.phase).toMatchObject({ activePlayerId: "p2" });
    expect(t.player("p1").imperial).toMatchObject({ recognition: 3, priority: "spent" });
  });
});

describe("Reworking Table with Imperial Priority (DESIGN §11 Q1, audit P1: allowed)", () => {
  it("changes the Shape first and uses Reworking Table's once-per-round allowance", () => {
    const t = table(holder({ players: [{ recognition: 3, techs: ["T05"] }, {}] }));
    const vesselBefore = (t.state.ceramics["c1"] as { vesselInstanceId: string }).vesselInstanceId;
    const events = t.act("p1", priority("c1", { reworkShape: "bowl" }));
    expect(types(events)).toEqual(["IMPERIAL_PRIORITY_USED", "TECH_USED", "CERAMIC_RESHAPED", "CERAMIC_LOADED"]);
    expect(events[2]).toEqual({ type: "CERAMIC_RESHAPED", playerId: "p1", ceramicId: "c1", from: "vase", to: "bowl" });
    expect(t.state.ceramics["c1"]).toMatchObject({ stage: "loaded", shape: "bowl", decoration: "carved" });
    expect(t.state.vesselSupply.vase).toContain(vesselBefore);
    expect(t.player("p1").techs).toEqual([{ id: "T05", acquiredInRound: 1, usedThisRound: true }]);
  });

  it("refuses a rework without a ready Reworking Table or to the same Shape", () => {
    expectDocumentedDetails(table(holder()).expectRuleError("p1", priority("c1", { reworkShape: "bowl" }), "TECH_NOT_OWNED"));
    const used = table(holder({ players: [{ recognition: 3, techs: [{ id: "T05", usedThisRound: true }] }, {}] }));
    expectDocumentedDetails(used.expectRuleError("p1", priority("c1", { reworkShape: "bowl" }), "TECH_ALREADY_USED"));
    const same = table(holder({ players: [{ recognition: 3, techs: ["T05"] }, {}] }));
    expectDocumentedDetails(same.expectRuleError("p1", priority("c1", { reworkShape: "vase" }), "INVALID_VESSEL_CHOICE"));
  });
});

describe("when the token cannot be used", () => {
  it("once per game: a spent or not-yet-earned token is IMPERIAL_PRIORITY_UNAVAILABLE", () => {
    const spent = table(holder({ players: [{ recognition: 3, imperial: { priority: "spent" } }, {}] }));
    expectDocumentedDetails(spent.expectRuleError("p1", priority("c1"), "IMPERIAL_PRIORITY_UNAVAILABLE"));
    const early = table(holder({ players: [{ recognition: 2 }, {}] }));
    expectDocumentedDetails(early.expectRuleError("p1", priority("c1"), "IMPERIAL_PRIORITY_UNAVAILABLE"));

    const t = table(holder());
    t.act("p1", priority("c1"));
    t.expectRuleError("p1", priority("c1"), "IMPERIAL_PRIORITY_UNAVAILABLE");
  });

  it("needs an empty Imperial Kiln (1 ceramic per firing, L308)", () => {
    const t = table(
      holder({
        ceramics: [
          { owner: "p1", shape: "vase", stage: "shaped" },
          { owner: "p1", shape: "bowl", stage: "loaded", glaze: "white", at: "imperial" },
        ],
      }),
    );
    expectDocumentedDetails(t.expectRuleError("p1", priority("c1"), "IMPERIAL_KILN_UNAVAILABLE"));
    expect(imperialPriorityUsable(t.state, "p1")).toBe(false);
  });

  it("needs one of your own Shaped vessels", () => {
    const t = table(
      holder({
        ceramics: [
          { owner: "p1", shape: "vase", stage: "finished", glaze: "white", quality: "fine" },
          { owner: "p2", shape: "bowl", stage: "shaped" },
          { owner: "p1", shape: "bowl", stage: "shaped" },
        ],
      }),
    );
    expectDocumentedDetails(t.expectRuleError("p1", priority("c1"), "ILLEGAL_CERAMIC_STAGE"));
    expectDocumentedDetails(t.expectRuleError("p1", priority("c2"), "CERAMIC_NOT_OWNED"));
    expectDocumentedDetails(t.expectRuleError("p1", priority("c99"), "CERAMIC_NOT_FOUND"));
    t.act("p1", priority("c3"));
  });

  it("is not usable in the middle of a worker action or on another player's turn", () => {
    const t = table(holder());
    t.act("p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:shifu" });
    const error = t.expectRuleError("p1", priority("c1"), "WORKER_ACTION_IN_PROGRESS");
    expect(error.details).toEqual({ phase: "work_turn", actionType: "USE_IMPERIAL_PRIORITY", step: "commission_market" });
    expect(formatRuleError(error, "en")).toBe("Finish your worker action first: this can be done before or after it, not during it.");
    expect(formatRuleError(error, "zh")).toBe("先完成工人行动：这一步只能在工人行动之前或之后进行，不能在行动中途进行");
    expectDocumentedDetails(error);
    const other = table(holder({ firstPlayerId: "p2" }));
    other.expectRuleError("p1", priority("c1"), "NOT_YOUR_DECISION");
  });

  it("does not open the after-action window when unusable", () => {
    for (const spec of [
      holder({ ceramics: [] }),
      holder({ players: [{ recognition: 3, imperial: { priority: "spent" } }, {}] }),
      holder({ players: [{ recognition: 2 }, {}] }),
    ]) {
      const t = table(spec);
      expect(imperialPriorityUsable(t.state, "p1")).toBe(false);
      reserveFaceUp(t, "p1:apprentice:1");
      expect(t.state.phase).toMatchObject({ activePlayerId: "p2", step: { kind: "before_action" } });
    }
  });
});

// ── The Order Phase (rev. 5 L174, L314, L318; I3) ────────────────────────────────────────

/** p1 holds the token (Recognition 3) and a Shaped Vase in round `round`'s Order Phase, First
 * Player p1; nothing else is loaded, nobody holds an Order or a Finished ceramic. */
function orderPhaseHolder(round: RoundNumber, p1: PlayerSpec = {}): LocalTable {
  return new LocalTable(
    buildState({
      round,
      players: [{ recognition: 3, ...p1 }, {}],
      phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 },
      ceramics: [{ owner: "p1", shape: "vase", stage: "shaped", decoration: "carved" }],
    }),
  );
}

/** Every player places every remaining worker at the Canal Wharf, until the Work Phase ends. */
function placeEveryWorker(t: LocalTable): void {
  while (t.state.phase.type === "work_turn") {
    const phase = t.state.phase;
    const actor = phase.activePlayerId;
    if (phase.step.kind === "after_action") {
      t.act(actor, { type: "END_TURN" });
      continue;
    }
    const worker = Object.values(t.player(actor).workers).find((w) => w.placement === null);
    if (worker === undefined) throw new Error(`${actor} has no worker`);
    t.act(actor, { type: "PLACE_CANAL_WHARF", workerId: worker.id });
  }
}

describe("Imperial Priority in the Order Phase (rev. 5 L174, L314; I3)", () => {
  it("opens the Order Phase turn by itself, is legal there with no Wood, and the turn ends once it is spent", () => {
    const t = orderPhaseHolder(2, { resources: { clay: 0, wood: 0, coins: 0 } });
    expect(t.prompt()).toEqual({ phaseType: "orders", actorIds: ["p1"], mode: "single" });
    expect(freeActionOptions(t.view("p1"))).toEqual({ window: "order_phase", completableOrderIds: [], sellableCeramicIds: [], imperialPriority: true });
    expect(imperialPriorityOptions(t.view("p1")).usable).toBe(true);
    expect(legalActionFamilies(t.view("p1"))).toEqual(["USE_IMPERIAL_PRIORITY", "END_ORDER_TURN"]);
    // The Colour Samples swap is not a free action: never in the Order Phase.
    const swapTable = orderPhaseHolder(2, { techs: ["T10"], hand: ["S01"] });
    expectDocumentedDetails(swapTable.expectRuleError("p1", { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: "S01" }, "WRONG_PHASE"));

    const events = t.act("p1", priority("c1", { imperialModifier: -1 }));
    expect(events.slice(0, 2)).toEqual([
      { type: "IMPERIAL_PRIORITY_USED", playerId: "p1", ceramicId: "c1", window: "order_phase" },
      expect.objectContaining({ type: "CERAMIC_LOADED", ceramicId: "c1", loadedBy: "imperial_priority" }),
    ]);
    expect(events[2]).toEqual({ type: "ORDER_TURN_ENDED", playerId: "p1", automatic: true });
    expect(t.player("p1").resources).toEqual({ clay: 0, wood: 0, coins: 0 });
    expect(t.player("p1").imperial.priority).toBe("spent");
  });

  it("waits loaded through Cleanup and Start of Round, blocks the Imperial Kiln, and is fired in the next round with that round's Kiln Die", () => {
    const t = orderPhaseHolder(2, { techs: ["T13"], resources: { wood: 5 } });
    t.act("p1", priority("c1"));
    // The command ran through Cleanup and Round 3's Start of Round into its Work Phase.
    expect(t.state.round).toBe(3);
    expect(t.state.phase).toMatchObject({ type: "work_turn", activePlayerId: "p2" });
    expect(t.state.ceramics["c1"]).toMatchObject({ stage: "loaded", loadedInRound: 2, loadedBy: "imperial_priority", placement: { kiln: "imperial" } });
    // R5 (b): the Imperial Kiln holds a ceramic, so no Glaze & Load may load into it this round.
    t.act("p2", { type: "PLACE_CANAL_WHARF", workerId: "p2:apprentice:1" });
    const bowl = stageCeramic(t.state, { owner: "p1", stage: "shaped", shape: "bowl" }).id;
    const blocked = t.expectRuleError(
      "p1",
      { type: "PLACE_GLAZE_LOAD", workerId: "p1:apprentice:1", loads: [{ ceramicId: bowl, glaze: "white", destination: { kiln: "imperial", imperialModifier: 0 } }] },
      "IMPERIAL_KILN_UNAVAILABLE",
    );
    expectDocumentedDetails(blocked);
    placeEveryWorker(t);
    // Round 3's firing happens for the waiting ceramic alone: no Contribution participant (it is
    // not in the Shared Kiln), and it makes p1 eligible for Test Pieces (L267, L314).
    const started = t.events.filter((e) => e.type === "FIRING_STARTED").at(-1);
    expect(started).toEqual({ type: "FIRING_STARTED", round: 3, participantIds: [], firingPlayerIds: ["p1"] });
    expect(t.state.phase).toMatchObject({ type: "firing_test_pieces", queue: { actorIds: ["p1"] } });
    t.act("p1", { type: "TEST_PIECES_DECIDE", peek: false });
    const record = t.state.lastFiring?.ceramics["c1"];
    const roundThreeDie = t.events.find((e) => e.type === "KILN_DIE_ROLLED" && e.round === 3);
    expect(roundThreeDie?.type === "KILN_DIE_ROLLED" ? roundThreeDie.value : null).toBe(t.state.lastFiring?.kilnDie);
    expect(record?.first?.heatSource).toBe((t.state.lastFiring?.kilnDie ?? 0) + (record?.first?.fireModifier ?? 0));
    expect(t.state.lastFiring?.round).toBe(3);
    expect(t.state.ceramics["c1"]).toMatchObject({ stage: "finished", firedInRound: 3 });
  });

  it("is legal in Round 5 too, but its ceramic is never fired and scores nothing", () => {
    const t = orderPhaseHolder(5);
    t.act("p1", priority("c1"));
    expect(t.state.phase).toEqual({ type: "finished" });
    expect(t.state.ceramics["c1"]).toMatchObject({ stage: "loaded", loadedInRound: 5 });
    expect(t.state.finalResult?.scores["p1"]?.exhibition.ceramicIds).toEqual([]);
  });

  it("uses that round's Reworking Table allowance at loading", () => {
    const t = orderPhaseHolder(2, { techs: ["T05"] });
    const events = t.act("p1", priority("c1", { reworkShape: "bowl" }));
    expect(events.map((e) => e.type).slice(0, 4)).toEqual(["IMPERIAL_PRIORITY_USED", "TECH_USED", "CERAMIC_RESHAPED", "CERAMIC_LOADED"]);
    expect(t.state.ceramics["c1"]).toMatchObject({ stage: "loaded", shape: "bowl" });
    // Readied at the next Start of Round: Reworking Table is free again in round 3.
    expect(t.player("p1").techs).toEqual([{ id: "T05", acquiredInRound: 2, usedThisRound: false }]);
  });
});

describe("Kiln Master's one marker on an Order Phase load (P7)", () => {
  it("stays on the waiting ceramic until the next round's firing finishes; meanwhile it cannot be placed (TECH_MARKER_IN_KILN)", () => {
    const t = orderPhaseHolder(2, { techs: ["T24"], resources: { wood: 5 } });
    expect(imperialPriorityOptions(t.view("p1")).kilnMaster).toBe(true);
    const events = t.act("p1", priority("c1", { kilnMaster: 1 }));
    expect(events.map((e) => e.type)).toContain("KILN_MASTER_PLACED");
    // Round 3: T24 is readied, but its marker is still on c1.
    expect(t.state.round).toBe(3);
    expect(t.player("p1").techs).toEqual([{ id: "T24", acquiredInRound: 2, usedThisRound: false }]);
    expect((t.state.ceramics["c1"] as LoadedCeramic).kilnMasterMarker).toBe(1);
    expect(kilnMasterOption(t.view("p1"), "p1")).toEqual({ ready: false, values: [1, -1] });
    // p2 places, then p1 tries to put the marker on a new Shared Kiln load.
    t.act("p2", { type: "PLACE_CANAL_WHARF", workerId: "p2:apprentice:1" });
    const bowl = stageCeramic(t.state, { owner: "p1", stage: "shaped", shape: "bowl" }).id;
    const refused = t.expectRuleError(
      "p1",
      { type: "PLACE_GLAZE_LOAD", workerId: "p1:apprentice:1", loads: [{ ceramicId: bowl, glaze: "white", destination: { kiln: "shared", spaceId: "high_1" }, kilnMaster: -1 }] },
      "TECH_MARKER_IN_KILN",
    );
    expect(refused.details).toEqual({ techId: "T24", ceramicId: "c1", field: "loads[0].kilnMaster" });
    expectDocumentedDetails(refused);
    expect(formatRuleError(refused, "zh")).toBe("窑工标还在窑中的器物上，要到那次烧窑开窑取器时才收回");
    // The same load without the marker is fine.
    t.act("p1", { type: "PLACE_GLAZE_LOAD", workerId: "p1:apprentice:1", loads: [{ ceramicId: bowl, glaze: "white", destination: { kiln: "shared", spaceId: "high_1" } }] });
    placeEveryWorker(t);
    // Contributions (p1 has a Shared ceramic now), then the firing finishes and the marker returns.
    for (const actor of [...t.prompt().actorIds]) t.contribute(actor, "TEND");
    while (t.state.phase.type === "firing_after_quality") t.act(t.prompt().actorIds[0] as string, { type: "END_AFTER_QUALITY" });
    expect(t.state.lastFiring?.ceramics["c1"]?.first?.kilnMasterMarker).toBe(1);
    expect(t.state.ceramics["c1"]).toMatchObject({ stage: "finished" });
    expect(kilnMasterOption(t.view("p1"), "p1")?.ready).toBe(true);
  });
});
