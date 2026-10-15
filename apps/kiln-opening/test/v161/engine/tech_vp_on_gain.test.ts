/**
 * Owner amendment A1 (2026-10-15, docs/RULEBOOK_AUDIT_V1.6.1.md "Owner amendments"): each
 * Advanced Tech scores its 1 VP immediately when the player gains it, recorded in the score
 * ledger like other in-game VP, and is no longer added at game end (overriding L378, L492,
 * L609, L755). No effect removes a Tech, so final totals and tie-breakers are unchanged.
 *
 * Covered here: the ledger, `TECH_ACQUIRED.vp`, `playerSummary.recordedVp` and `scorePreview`
 * right after every acquisition path (Apprentice buy, Shifu inspected take, Shifu face-up
 * take, Colour Samples while its when-acquired look is still open); the final breakdown's
 * single Tech line; and seeded full games whose totals equal the old end-game method.
 */

import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../../../src/game/content.ts";
import { computeFinalResult } from "../../../src/game/scoring.ts";
import { playerSummary, scorePreview } from "../../../src/game/selectors.ts";
import type { FinalScoreBreakdown, GameAction, GameEvent, GameState, PlayerCount, PlayerId, TechDiscipline, TechId } from "../../../src/game/types.ts";
import { viewOf } from "../../../src/game/view.ts";
import { playFuzzGame } from "./p7_support.ts";
import { buildState, stageCeramic } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";

function table(): LocalTable {
  return new LocalTable(buildState({}), { flow: "halt", pass: ["worker_action_done"] });
}

function buy(techId: TechId): GameAction {
  return { type: "PLACE_GUILD_HALL", workerId: "p1:apprentice:1", choice: { kind: "buy_face_up", techId } };
}

function inspect(discipline: TechDiscipline): GameAction {
  return { type: "PLACE_GUILD_HALL", workerId: "p1:shifu", choice: { kind: "inspect", discipline } };
}

function acquired(events: readonly GameEvent[]): Array<Extract<GameEvent, { type: "TECH_ACQUIRED" }>> {
  return events.filter((event): event is Extract<GameEvent, { type: "TECH_ACQUIRED" }> => event.type === "TECH_ACQUIRED");
}

/** Every public score surface agrees that `vp` Tech VP is already scored. */
function expectTechVpEverywhere(state: GameState, playerId: PlayerId, vp: number): void {
  const p = state.players[playerId]!;
  expect(p.score.techs).toBe(vp);
  for (const viewer of [null, "p1", "p2"] as const) {
    const view = viewOf(state, viewer);
    const summary = playerSummary(view, playerId);
    expect(summary.recorded.techs).toBe(vp);
    expect(summary.recordedVp).toBe(p.score.orders + p.score.kilnAbilities + p.score.recognitionOverflow + p.score.imperialAudience + vp);
    const preview = scorePreview(view, playerId).breakdown;
    expect(preview.techs).toBe(vp);
    expect(preview.total).toBe(summary.recordedVp + preview.exhibition.total + preview.connoisseur + preview.coins);
  }
}

describe("A1: a Tech's 1 VP is recorded the moment it is gained", () => {
  it("the Tech VP is 1 each", () => {
    expect(GAME_CONFIG.techs.vpEach).toBe(1);
  });

  it("Apprentice buy: ledger, event, summary and preview at once", () => {
    const t = table();
    expectTechVpEverywhere(t.state, "p1", 0);
    const events = t.act("p1", buy("T01"));
    expect(acquired(events)).toEqual([{ type: "TECH_ACQUIRED", playerId: "p1", techId: "T01", source: "face_up", cost: 2, vp: 1 }]);
    expectTechVpEverywhere(t.state, "p1", 1);
    expectTechVpEverywhere(t.state, "p2", 0);
  });

  it("Shifu inspected take", () => {
    const t = table();
    t.act("p1", inspect("firing"));
    expectTechVpEverywhere(t.state, "p1", 0);
    const events = t.act("p1", { type: "GUILD_TAKE", take: { kind: "inspected", techId: "T13" }, bottomOrder: ["T14"] });
    expect(acquired(events)).toEqual([{ type: "TECH_ACQUIRED", playerId: "p1", techId: "T13", source: "inspected", cost: 2, vp: 1 }]);
    expectTechVpEverywhere(t.state, "p1", 1);
  });

  it("Shifu face-up take", () => {
    const t = table();
    t.act("p1", inspect("firing"));
    const events = t.act("p1", { type: "GUILD_TAKE", take: { kind: "face_up", techId: "T20" }, bottomOrder: ["T14", "T13"] });
    expect(acquired(events)).toEqual([{ type: "TECH_ACQUIRED", playerId: "p1", techId: "T20", source: "face_up", cost: 1, vp: 1 }]);
    expectTechVpEverywhere(t.state, "p1", 1);
  });

  it("Colour Samples scores its own VP before its when-acquired reservation resolves", () => {
    const t = table();
    const events = t.act("p1", buy("T10"));
    expect(acquired(events)).toEqual([{ type: "TECH_ACQUIRED", playerId: "p1", techId: "T10", source: "face_up", cost: 2, vp: 1 }]);
    expect(t.state.phase).toMatchObject({ type: "work_turn", step: { kind: "colour_samples" } });
    expectTechVpEverywhere(t.state, "p1", 1);
    const look = t.state.hidden.pendingLook;
    expect(look?.kind).toBe("colour_samples");
    const orderId = look !== null && look.kind === "colour_samples" ? look.orderIds[0] : undefined;
    t.act("p1", { type: "COLOUR_SAMPLES_CHOOSE", orderId: orderId! });
    expectTechVpEverywhere(t.state, "p1", 1);
  });

  it("accumulates per Tech and is never recounted at game end: the breakdown shows the Tech line once", () => {
    const state = buildState({ round: 5, players: [{ kilnId: null, techs: ["T19", "T23", "T25"], resources: { clay: 0, wood: 0, coins: 0 }, score: { orders: 7 } }, { kilnId: null, resources: { clay: 0, wood: 0, coins: 0 } }] });
    stageCeramic(state, { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", decoration: "plain", quality: "fine" });
    expect(state.players["p1"]!.score).toMatchObject({ orders: 7, techs: 3 });
    const result = computeFinalResult(state);
    const b = result.scores["p1"] as FinalScoreBreakdown;
    expect(b.techs).toBe(3);
    // orders 7 + techs 3 + Exhibition 3 (Fine) + Cabinet 1 — the Tech VP appears exactly once.
    expect(b.total).toBe(7 + 3 + 3 + 1);
    expect(Object.entries(b).filter(([key]) => key === "techs")).toHaveLength(1);
  });
});

/** The pre-A1 total: the ledger without Tech VP, plus 1 VP per owned Tech at game end. */
function oldEndGameTotal(state: GameState, playerId: PlayerId): number {
  const p = state.players[playerId]!;
  const b = computeFinalResult(state).scores[playerId]!;
  const ledgerWithoutTechs = p.score.orders + p.score.kilnAbilities + p.score.recognitionOverflow + p.score.imperialAudience;
  return ledgerWithoutTechs + p.techs.length * GAME_CONFIG.techs.vpEach + b.exhibition.total + b.connoisseur + b.coins;
}

describe("A1 leaves seeded full games' totals and ranking unchanged", () => {
  it.each([2, 3, 4] as const)("%i players: final totals equal the old end-game recomputation", (playerCount: PlayerCount) => {
    const seed = 9_400 + playerCount;
    const result = playFuzzGame({ start: "new", seed, chooserSeed: seed * 31 + 17, playerCount });
    const state = result.table.state;
    expect(state.phase.type).toBe("finished");
    const final = state.finalResult!;
    let anyTech = false;
    for (const playerId of state.playerOrder) {
      const p = state.players[playerId]!;
      anyTech ||= p.techs.length > 0;
      const gainedVp = acquired(result.table.events)
        .filter((event) => event.playerId === playerId)
        .reduce((sum, event) => sum + event.vp, 0);
      expect(gainedVp, playerId).toBe(p.techs.length);
      expect(final.scores[playerId]!.techs, playerId).toBe(p.techs.length);
      expect(final.scores[playerId]!.total, playerId).toBe(oldEndGameTotal(state, playerId));
      expect(final.standings.find((s) => s.playerId === playerId)?.total).toBe(oldEndGameTotal(state, playerId));
    }
    expect(anyTech).toBe(true);
  });
});
