/**
 * Imperial Priority (L293, L288, L434, v1.6.2 L645, R10, R11; DESIGN §11 Q1 / audit P1): once per
 * game, before or after your worker action, spend the token — free — to give 1 of your Shaped
 * vessels a Glaze and load it into your empty Imperial Kiln with a chosen public modifier. It
 * is a token effect, not a Glaze & Load action, and burns no kiln fuel (rev. 4 L291). Reworking
 * Table may change the Shape first; Kiln Master's marker may go on the load (R22,
 * `kiln_master.test.ts`).
 */

import { describe, expect, it } from "vitest";
import { projectPublicState } from "../../../src/game/view.ts";
import type { GameAction, GameEvent } from "../../../src/game/types.ts";
import { imperialPriorityUsable } from "../../../src/game/work/turn.ts";
import { type StateSpec, buildState } from "./support/fixtures.ts";
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

/** A whole Commission Market action reserving the face-up Order at position 0 (v1.6.2 L195):
 * the placement opens the look, then `SELECT_CHOOSE`. Returns the reservation's events. */
function reserveFaceUp(t: LocalTable, workerId: string): GameEvent[] {
  const orderId = t.state.market.display[0];
  if (orderId === null || orderId === undefined) throw new Error("no Order at 0");
  const playerId = workerId.split(":")[0] as string;
  t.act(playerId, { type: "PLACE_COMMISSION_MARKET", workerId });
  return t.act(playerId, { type: "SELECT_CHOOSE", reservations: [{ kind: "face_up", slotIndex: 0, orderId }] });
}

/** p1 at Recognition 3: Imperial Kiln gained, token held (L285, L293). */
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
    expect(events[0]).toEqual({ type: "IMPERIAL_PRIORITY_USED", playerId: "p1", ceramicId: "c1" });
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

  it("burns no kiln fuel: usable with no Wood, unlike a Shared Kiln load (rev. 4 L291, change 34)", () => {
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

  it("Canal Barge no longer opens the window (v1.6.2 L630): with only it owned the turn ends by itself", () => {
    const t = table({ players: [{ techs: ["T23"], hand: ["S01"] }, {}] });
    const placed = reserveFaceUp(t, "p1:apprentice:1");
    expect(placed.find((event) => event.type === "WORK_TURN_ENDED")).toMatchObject({ playerId: "p1", automatic: true });
  });

  it("is not a Glaze & Load action (L646): no personal space is used and Kiln Tending does not trigger", () => {
    const t = table(holder({ players: [{ recognition: 3, techs: ["T20"] }, {}] }));
    const events = t.act("p1", priority("c1"));
    expect(events.filter((event) => event.type === "RESOURCES_CHANGED")).toEqual([]);
    expect(t.player("p1").techs).toEqual([{ id: "T20", acquiredInRound: 1, usedThisRound: false }]);
    expect(Object.values(t.player("p1").workers).every((worker) => worker.placement === null)).toBe(true);
  });
});

describe("a token gained during the worker action (L293, L434)", () => {
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

  it("needs an empty Imperial Kiln (1 ceramic per firing, L287)", () => {
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
    const error = t.expectRuleError("p1", priority("c1"), "WRONG_PHASE");
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
