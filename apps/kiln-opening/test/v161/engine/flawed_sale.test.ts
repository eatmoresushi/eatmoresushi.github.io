/**
 * Selling a Flawed ceramic (change 30, rev. 4 L282, L284, L729; owner ruling R20; DELTA
 * §15.9.11): 1 Flawed ceramic per `SELL_FLAWED`, for 2 Coins, its Vessel card back to the
 * supply, only during its owner's own turn while the game waits for that player's decision:
 * the before- and after-action windows of their Work turn, their Order Phase turn, their own
 * after-Quality turn (`after_quality.test.ts`) and their pending Cleanup trim. Never during
 * another player's turn, the simultaneous Contribution choice, or the middle of resolving an
 * action. The sale is free: it never ends a turn or opens a window by itself. Revision 3's
 * salvage step is gone.
 */

import { describe, expect, it } from "vitest";
import { FIRING } from "../../../src/game/content.ts";
import { createGame } from "../../../src/game/engine.ts";
import { sellFlawedOptions } from "../../../src/game/flawedSale.ts";
import { legalActionFamilies } from "../../../src/game/legalActions.ts";
import { formatRuleError } from "../../../src/game/ruleErrorText.ts";
import { SeededRandom } from "../../../src/game/rng.ts";
import type { CeramicSpec, StateSpec } from "./support/fixtures.ts";
import { buildState } from "./support/fixtures.ts";
import { openFiringTable, tendAll } from "./support/firing.ts";
import { LocalTable } from "./support/localTable.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";
import { projectEvent } from "../../../src/game/view.ts";

const FLAWED_BOWL: CeramicSpec = { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "flawed" };

/** p1's Work turn, before the worker action: c1 Flawed and c2 Standard of p1's, c3 Flawed of p2's. */
function workSpec(extra: Partial<StateSpec> = {}): StateSpec {
  return {
    players: [{ hand: ["O40"] }, {}],
    ceramics: [
      FLAWED_BOWL,
      { owner: "p1", stage: "finished", shape: "plate", glaze: "white", quality: "standard" },
      { owner: "p2", stage: "finished", shape: "vase", glaze: "white", quality: "flawed" },
    ],
    ...extra,
  };
}

describe("the Work turn's windows (R20)", () => {
  it("before the worker action: 2 Coins, the Vessel card back in its supply, and the turn goes on", () => {
    const table = new LocalTable(buildState(workSpec()));
    expect(sellFlawedOptions(table.view("p1"))).toEqual({ ceramicIds: ["c1"], coins: FIRING.flawedSaleCoins });
    expect(sellFlawedOptions(table.view("p2"))).toBeNull();
    expect(legalActionFamilies(table.view("p1"))).toContain("SELL_FLAWED");
    const card = table.state.ceramics["c1"]?.vesselInstanceId;
    const coins = table.player("p1").resources.coins;
    const events = table.act("p1", { type: "SELL_FLAWED", ceramicId: "c1" });
    expect(events).toEqual([
      { type: "CERAMIC_SOLD", playerId: "p1", ceramicId: "c1", coins: 2, from: "finished" },
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: 0, coins: 2, reason: "flawed_sale" },
    ]);
    // Public: every ceramic and every sale is open information (L508).
    expect(events.map(projectEvent)).toEqual(events);
    expect(table.state.ceramics["c1"]).toBeUndefined();
    expect(table.state.vesselSupply.bowl).toContain(card);
    expect(table.state.vesselSupply.bowl).toEqual([...table.state.vesselSupply.bowl].sort());
    expect(table.player("p1").resources.coins).toBe(coins + 2);
    // Free: still p1's turn, before the worker action; nothing else is left to sell.
    expect(table.state.phase).toEqual({ type: "work_turn", activePlayerId: "p1", step: { kind: "before_action" } });
    expect(sellFlawedOptions(table.view("p1"))).toBeNull();
    expect(legalActionFamilies(table.view("p1"))).not.toContain("SELL_FLAWED");
  });

  it("only one of your Flawed ceramics: Standard, another player's, unknown or already sold are refused", () => {
    const table = new LocalTable(buildState(workSpec()));
    const standard = table.expectRuleError("p1", { type: "SELL_FLAWED", ceramicId: "c2" }, "INVALID_TARGET");
    expect(standard.details).toEqual({ ceramicId: "c2", reason: "not_flawed" });
    expectDocumentedDetails(standard);
    expect(formatRuleError(standard, "en")).toBe("That target is not allowed: the ceramic is not Flawed.");
    expect(formatRuleError(standard, "zh")).toBe("此目标不合法：器物不是瑕品");
    expectDocumentedDetails(table.expectRuleError("p1", { type: "SELL_FLAWED", ceramicId: "c3" }, "CERAMIC_NOT_OWNED"));
    expectDocumentedDetails(table.expectRuleError("p1", { type: "SELL_FLAWED", ceramicId: "c9" }, "CERAMIC_NOT_FOUND"));
    table.act("p1", { type: "SELL_FLAWED", ceramicId: "c1" });
    table.expectRuleError("p1", { type: "SELL_FLAWED", ceramicId: "c1" }, "CERAMIC_NOT_FOUND");
  });

  it("never during another player's Work turn", () => {
    const table = new LocalTable(buildState(workSpec()));
    expectDocumentedDetails(table.expectRuleError("p2", { type: "SELL_FLAWED", ceramicId: "c3" }, "NOT_YOUR_DECISION"));
    expect(sellFlawedOptions(table.view("p2"))).toBeNull();
  });

  it("after the worker action, in the after-action window; a Flawed ceramic opens no window by itself", () => {
    // Colour Samples with a held Order opens the after-action window (v1.6.2 L622).
    const table = new LocalTable(buildState(workSpec({ players: [{ techs: ["T10"], hand: ["O40"] }, {}] })));
    table.act("p1", { type: "PLACE_CANAL_WHARF", workerId: "p1:apprentice:1" });
    expect(table.state.phase).toMatchObject({ type: "work_turn", activePlayerId: "p1", step: { kind: "after_action" } });
    expect(legalActionFamilies(table.view("p1"))).toContain("SELL_FLAWED");
    table.act("p1", { type: "SELL_FLAWED", ceramicId: "c1" });
    expect(table.state.phase).toMatchObject({ type: "work_turn", activePlayerId: "p1", step: { kind: "after_action" } });

    // Without a window ability the turn ends at once, Flawed ceramic or not.
    const plain = new LocalTable(buildState(workSpec()));
    plain.act("p1", { type: "PLACE_CANAL_WHARF", workerId: "p1:apprentice:1" });
    expect(plain.state.phase).toMatchObject({ type: "work_turn", activePlayerId: "p2", step: { kind: "before_action" } });
    expect(plain.state.ceramics["c1"]).toMatchObject({ stage: "finished", quality: "flawed" });
  });

  it("never in the middle of a worker action: a Select is open (WRONG_PHASE, \"Finish your worker action first.\")", () => {
    const table = new LocalTable(buildState(workSpec()));
    table.act("p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:apprentice:1" });
    expect(table.state.phase).toMatchObject({ type: "work_turn", step: { kind: "commission_market" } });
    const error = table.expectRuleError("p1", { type: "SELL_FLAWED", ceramicId: "c1" }, "WRONG_PHASE");
    expect(error.message).toBe("Finish your worker action first.");
    expect(error.details).toEqual({ phase: "work_turn", step: "commission_market", actionType: "SELL_FLAWED" });
    expectDocumentedDetails(error);
    expect(sellFlawedOptions(table.view("p1"))).toBeNull();
    expect(legalActionFamilies(table.view("p1"))).not.toContain("SELL_FLAWED");
  });
});

describe("never outside its owner's turns (R20): WRONG_PHASE", () => {
  /** p1 (Test Pieces, the Jun Kiln) fires c1 and p2 (Second Firing) fires c2, Moon White Bowls
   * in Low (Flawed at Fire 0); p1 also holds c3, a Finished Flawed Bowl from an earlier round. */
  function firingSpec(): StateSpec {
    return {
      players: [{ kilnId: "JU", techs: ["T13"], resources: { wood: 5 } }, { kilnId: "RU", techs: ["T14"] }, { kilnId: "DI" }],
      fireDeck: [0, 1, -1],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_1" },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_2" },
        { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "flawed", firedInRound: 1 },
      ],
      round: 2,
    };
  }

  it("in the simultaneous Contribution choice, Test Pieces, Jun, another player's after-Quality turn and the Second Firing choice", () => {
    const table = openFiringTable(firingSpec());
    const refused = (actor: string, ceramicId: string, code: "WRONG_PHASE" | "NOT_YOUR_DECISION" = "WRONG_PHASE"): void => {
      const error = table.expectRuleError(actor, { type: "SELL_FLAWED", ceramicId }, code);
      expectDocumentedDetails(error);
      expect(sellFlawedOptions(table.view(actor))).toBeNull();
    };
    expect(table.state.phase.type).toBe("firing_contributions");
    refused("p1", "c3");
    tendAll(table);
    expect(table.state.phase.type).toBe("firing_test_pieces");
    refused("p1", "c3");
    table.act("p1", { type: "TEST_PIECES_DECIDE", peek: false });
    expect(table.state.phase.type).toBe("firing_heat_adjustment");
    refused("p1", "c3");
    table.act("p1", { type: "RESOLVE_JUN", adjustment: null });
    // p2's own after-Quality turn is p2's sale window (its c2 of this firing included), not p1's.
    expect(table.prompt()).toEqual({ phaseType: "firing_after_quality", actorIds: ["p2"], mode: "single" });
    expect(sellFlawedOptions(table.view("p2"))?.ceramicIds).toEqual(["c2"]);
    refused("p1", "c3", "NOT_YOUR_DECISION");
    refused("p1", "c1", "NOT_YOUR_DECISION");
    table.act("p2", { type: "USE_SECOND_FIRING", ceramicId: "c2" });
    expect(table.state.phase.type).toBe("firing_second_firing_choice");
    refused("p2", "c2");
    refused("p1", "c3");
  });

  it("in the Setter's Mark window and the Setup choice", () => {
    const marks = new LocalTable(
      buildState({
        players: [{ techs: ["T22"] }, {}],
        phase: { type: "round_start_setters_mark", queue: { actorIds: ["p1"], index: 0 } },
        ceramics: [FLAWED_BOWL],
      }),
    );
    expectDocumentedDetails(marks.expectRuleError("p1", { type: "SELL_FLAWED", ceramicId: "c1" }, "WRONG_PHASE"));

    const created = createGame({ gameId: "sale-setup", players: [{ id: "p1", displayName: "A" }, { id: "p2", displayName: "B" }] }, new SeededRandom(2));
    if (!created.ok) throw new Error("createGame failed");
    const setup = new LocalTable(created.state, { seed: 2 });
    const chooser = setup.prompt().actorIds[0] ?? "p2";
    setup.expectRuleError(chooser, { type: "SELL_FLAWED", ceramicId: "c1" }, "WRONG_PHASE");
  });
});

describe("the Order Phase turn and the Cleanup trim (R20)", () => {
  it("Round 5: the Order Phase turn is the last sale window before scoring (the trim is skipped)", () => {
    const table = new LocalTable(
      buildState({
        round: 5,
        players: [{ hand: ["O40"] }, {}],
        phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 },
        ceramics: [FLAWED_BOWL],
      }),
    );
    expect(table.prompt()).toEqual({ phaseType: "orders", actorIds: ["p1"], mode: "single" });
    expect(legalActionFamilies(table.view("p1"))).toEqual(["SELL_FLAWED", "END_ORDER_TURN"]);
    const coins = table.player("p1").resources.coins;
    const events = table.act("p1", { type: "SELL_FLAWED", ceramicId: "c1" });
    // Nothing left to complete or sell: the turn ends, p2 is skipped, and the game is scored.
    expect(events.map((e) => e.type)).toContain("FINAL_SCORE_CALCULATED");
    expect(table.state.phase).toEqual({ type: "finished" });
    expect(table.player("p1").resources.coins).toBe(coins + 2);
  });

  it("a pending player sells, stays pending, then trims; a player who is not pending may not sell", () => {
    const table = new LocalTable(
      buildState({
        players: [{ hand: ["S01", "S02", "O01", "O02", "O03"] }, {}],
        phase: { type: "cleanup_hand_limit", pendingPlayerIds: ["p1"], openedAtRevision: 0 },
        ceramics: [FLAWED_BOWL, { owner: "p2", stage: "finished", shape: "plate", glaze: "white", quality: "flawed" }],
      }),
    );
    expect(legalActionFamilies(table.view("p1"))).toEqual(["SELL_FLAWED", "DISCARD_TO_HAND_LIMIT"]);
    expectDocumentedDetails(table.expectRuleError("p2", { type: "SELL_FLAWED", ceramicId: "c2" }, "NOT_YOUR_DECISION"));
    table.act("p1", { type: "SELL_FLAWED", ceramicId: "c1" });
    expect(table.state.phase).toMatchObject({ type: "cleanup_hand_limit", pendingPlayerIds: ["p1"] });
    expect(table.prompt()).toEqual({ phaseType: "cleanup_hand_limit", actorIds: ["p1"], mode: "parallel" });
    table.act("p1", { type: "DISCARD_TO_HAND_LIMIT", orderIds: ["O03"] });
    expect(table.state.phase.type).not.toBe("cleanup_hand_limit");
    expect(table.state.ceramics["c2"]).toMatchObject({ stage: "finished", quality: "flawed" });
  });
});
