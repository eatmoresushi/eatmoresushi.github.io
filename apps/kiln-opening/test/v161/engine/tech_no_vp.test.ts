/**
 * V1.6.2 rulebook change 27 (owner revision 3, 2026-10-18; v1.6.2 L37, L496, L605): Advanced
 * Techs no longer score 1 VP when gained, and nothing is added for them at game end. It
 * supersedes owner amendment A1 (Tech VP recorded on gain). Connoisseur's Cabinet keeps its
 * end-game VP (L616); printed costs are unchanged.
 *
 * Covered here: the score ledger, `TECH_ACQUIRED`, `playerSummary.recordedVp` and `scorePreview`
 * right after every acquisition path (Apprentice buy, Shifu inspected take, Shifu face-up take,
 * a Shifu's second take, Colour Samples while its when-acquired Select is still open, Fuel
 * Ledger with its 2 cards); the final breakdown without a Tech line and Connoisseur's Cabinet's
 * end-game VP; the config; and seeded full games whose totals have no Tech VP.
 */

import { describe, expect, it } from "vitest";
import { GAME_CONFIG, TECHS } from "../../../src/game/content.ts";
import { SCORE_BREAKDOWN_ROWS, computeFinalResult } from "../../../src/game/scoring.ts";
import { playerSummary, scorePreview } from "../../../src/game/selectors.ts";
import type { FinalScoreBreakdown, GameAction, GameEvent, GameState, PlayerCount, PlayerId, TechDiscipline, TechId } from "../../../src/game/types.ts";
import { viewOf } from "../../../src/game/view.ts";
import { playFuzzGame } from "./p7_support.ts";
import { buildState, stageCeramic } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";

function table(spec: Parameters<typeof buildState>[0] = {}): LocalTable {
  return new LocalTable(buildState(spec), { flow: "halt", pass: ["worker_action_done"] });
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

const EMPTY_LEDGER = { orders: 0, kilnAbilities: 0, recognitionOverflow: 0, imperialAudience: 0 };

/** Every public score surface agrees that owning Techs scores nothing. */
function expectNoTechVp(state: GameState, playerId: PlayerId): void {
  const p = state.players[playerId]!;
  expect(p.score).toEqual(EMPTY_LEDGER);
  for (const viewer of [null, "p1", "p2"] as const) {
    const view = viewOf(state, viewer);
    const summary = playerSummary(view, playerId);
    expect(summary.recorded).toEqual(EMPTY_LEDGER);
    expect(summary.recordedVp).toBe(0);
    const preview = scorePreview(view, playerId).breakdown;
    expect(preview).not.toHaveProperty("techs");
    expect(preview.total).toBe(summary.recordedVp + preview.exhibition.total + preview.connoisseur + preview.coins);
  }
}

describe("change 27: gaining an Advanced Tech scores no VP", () => {
  it("the config has no Tech VP and the score table has no Tech row", () => {
    expect(GAME_CONFIG.techs).toEqual({ perDiscipline: 6, faceUpPerDiscipline: 2, maxOwned: 3, maxPerDiscipline: 1 });
    expect(SCORE_BREAKDOWN_ROWS).not.toContain("techs");
    // Printed costs are unchanged by change 27 (Fuel Ledger's 4 is change 30, rev. 4 L625).
    expect([TECHS.T10.cost, TECHS.T12.cost, TECHS.T19.cost, TECHS.T25.cost]).toEqual([2, 4, 3, 4]);
  });

  it("Apprentice buy: no VP in the ledger, the event, the summary or the preview", () => {
    const t = table();
    expectNoTechVp(t.state, "p1");
    const events = t.act("p1", buy("T01"));
    expect(acquired(events)).toEqual([{ type: "TECH_ACQUIRED", playerId: "p1", techId: "T01", source: "face_up", cost: 2 }]);
    expectNoTechVp(t.state, "p1");
    expectNoTechVp(t.state, "p2");
  });

  it("Shifu inspected take", () => {
    const t = table();
    t.act("p1", inspect("firing"));
    const events = t.act("p1", { type: "GUILD_TAKE", take: { kind: "inspected", techId: "T13" } });
    expect(acquired(events)).toEqual([{ type: "TECH_ACQUIRED", playerId: "p1", techId: "T13", source: "inspected", cost: 3 }]);
    expectNoTechVp(t.state, "p1");
  });

  it("Shifu face-up take and a second take (v1.6.2 L207)", () => {
    const t = table({ players: [{ resources: { coins: 5 } }, {}] });
    t.act("p1", inspect("firing"));
    expect(acquired(t.act("p1", { type: "GUILD_TAKE", take: { kind: "face_up", techId: "T20" } }))).toEqual([
      { type: "TECH_ACQUIRED", playerId: "p1", techId: "T20", source: "face_up", cost: 3 },
    ]);
    expectNoTechVp(t.state, "p1");
    t.act("p1", { type: "GUILD_TAKE", take: { kind: "inspected", techId: "T14" } });
    expect(t.player("p1").techs.map((tech) => tech.id)).toEqual(["T20", "T14"]);
    expectNoTechVp(t.state, "p1");
  });

  it("Colour Samples, before and after its when-acquired Select 3", () => {
    const t = table();
    t.act("p1", buy("T10"));
    expect(t.state.phase).toMatchObject({ type: "work_turn", step: { kind: "colour_samples" } });
    expectNoTechVp(t.state, "p1");
    const look = t.state.hidden.pendingLook;
    const orderId = look !== null && look.kind === "colour_samples" ? look.orderIds[0] : undefined;
    t.act("p1", { type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: orderId! }] });
    expectNoTechVp(t.state, "p1");
  });

  it("Fuel Ledger brings its 2 Contribution cards, and still no VP", () => {
    // Fuel Ledger costs 4 (rev. 4 L625).
    const t = table({ players: [{ resources: { coins: 4 } }, {}], techDisplay: { firing: ["T12", "T13"] } });
    const events = t.act("p1", buy("T12"));
    expect(events.find((event) => event.type === "CONTRIBUTION_CARDS_GAINED")).toEqual({
      type: "CONTRIBUTION_CARDS_GAINED",
      playerId: "p1",
      techId: "T12",
      cards: ["FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"],
    });
    expectNoTechVp(t.state, "p1");
  });
});

describe("final scoring without Tech VP (v1.6.2 L494–498)", () => {
  it("three owned Techs add nothing; Connoisseur's Cabinet keeps its end-game VP", () => {
    const state = buildState({ round: 5, players: [{ kilnId: null, techs: ["T19", "T23", "T25"], resources: { clay: 0, wood: 0, coins: 0 }, score: { orders: 7 } }, { kilnId: null, resources: { clay: 0, wood: 0, coins: 0 } }] });
    stageCeramic(state, { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", decoration: "plain", quality: "fine" });
    expect(state.players["p1"]!.score).toEqual({ ...EMPTY_LEDGER, orders: 7 });
    const result = computeFinalResult(state);
    const b = result.scores["p1"] as FinalScoreBreakdown;
    expect(b).not.toHaveProperty("techs");
    expect(Object.keys(b).sort()).toEqual([...SCORE_BREAKDOWN_ROWS].sort());
    // orders 7 + Exhibition 3 (Fine) + Cabinet 1; no Tech VP for the 3 Techs.
    expect(b.connoisseur).toBe(1);
    expect(b.total).toBe(7 + 3 + 1);
  });

  it("the same table without the Techs scores the same, but for the Cabinet", () => {
    const withTechs = buildState({ round: 5, players: [{ kilnId: null, techs: ["T23", "T25"], score: { orders: 4 } }, { kilnId: null }] });
    const without = buildState({ round: 5, players: [{ kilnId: null, score: { orders: 4 } }, { kilnId: null }] });
    expect(computeFinalResult(withTechs).scores["p1"]?.total).toBe(computeFinalResult(without).scores["p1"]?.total);
  });
});

describe("seeded full games: no Tech VP anywhere", () => {
  it.each([2, 3, 4] as const)("%i players: totals are play VP + Exhibition + Cabinet + Coins only", (playerCount: PlayerCount) => {
    const seed = 9_400 + playerCount;
    const result = playFuzzGame({ start: "new", seed, chooserSeed: seed * 31 + 17, playerCount });
    const state = result.table.state;
    expect(state.phase.type).toBe("finished");
    const final = state.finalResult!;
    let anyTech = false;
    for (const playerId of state.playerOrder) {
      const p = state.players[playerId]!;
      anyTech ||= p.techs.length > 0;
      expect(p.score).not.toHaveProperty("techs");
      for (const event of acquired(result.table.events)) expect(event).not.toHaveProperty("vp");
      const b = final.scores[playerId]!;
      expect(b).not.toHaveProperty("techs");
      const expected = p.score.orders + p.score.kilnAbilities + p.score.recognitionOverflow + p.score.imperialAudience + b.exhibition.total + b.connoisseur + b.coins;
      expect(b.total, playerId).toBe(expected);
    }
    expect(anyTech).toBe(true);
  });
});
