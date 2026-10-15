/**
 * P6 `scoring.ts` (L441–451, L487–498, L378, L492, L510, L620, R13; DESIGN §8.2 "Automatic
 * Exhibition 2/3/5, +3/+3, Connoisseur's Cabinet", "Coin VP; all tie-breakers", "1 VP each").
 */

import { describe, expect, it } from "vitest";
import { GAME_CONFIG, IMPERIAL_TRACK, TECHS } from "../../../src/game/content.ts";
import { resolveOrderCompletion } from "../../../src/game/orders/completion.ts";
import { computeFinalResult, finishGame, scorePreview } from "../../../src/game/scoring.ts";
import { player } from "../../../src/game/state.ts";
import type { Decoration, FinalScoreBreakdown, GameState, Glaze, PlayerId, Quality, Shape } from "../../../src/game/types.ts";
import { projectEvent, projectPublicState } from "../../../src/game/view.ts";
import { buildState, type PlayerSpec, stageCeramic, testContext } from "./support/fixtures.ts";

const Q: Record<string, Quality> = { std: "standard", fine: "fine", mp: "masterpiece", flawed: "flawed" };

function fin(state: GameState, owner: PlayerId, spec: string): string {
  const [shape, glaze, decoration, quality, crackle] = spec.split(" ");
  return stageCeramic(state, {
    owner,
    stage: "finished",
    shape: shape as Shape,
    glaze: glaze as Glaze,
    decoration: decoration as Decoration,
    quality: Q[quality ?? ""] as Quality,
    ...(crackle === "crackle" ? { crackle: true } : {}),
  }).id;
}

const NO_COINS = { clay: 0, wood: 0, coins: 0 };

function game(players: PlayerSpec[]): GameState {
  return buildState({ round: 5, players: players.map((p) => ({ kilnId: null, ...p, resources: { ...NO_COINS, ...p.resources } })) });
}

function breakdown(state: GameState, playerId: PlayerId): FinalScoreBreakdown {
  return scorePreview(state, playerId).breakdown;
}

describe("scoring values are the printed ones", () => {
  it("Exhibition 2/3/5, +3 Shapes at 3, +3 Glazes at 3; Coins 1 per 3, max 5; 1 VP per Tech; Cabinet +1 max 5", () => {
    expect(IMPERIAL_TRACK.exhibition).toEqual({
      minimumQuality: "standard",
      qualityVp: { standard: 2, fine: 3, masterpiece: 5 },
      distinctShapes: { threshold: 3, vp: 3 },
      distinctGlazes: { threshold: 3, vp: 3 },
    });
    expect(GAME_CONFIG.coinEndGame).toEqual({ coinsPerVp: 3, maxVp: 5 });
    expect(GAME_CONFIG.techs.endGameVpEach).toBe(1);
    expect(TECHS.T19.params).toEqual({ vpPerCeramic: 1, qualities: ["fine", "masterpiece"], maxVp: 5 });
  });
});

describe("End-game Exhibition (L443–451, INT: automatic)", () => {
  it("exhibits every Finished, undelivered Standard+ ceramic: 2 / 3 / 5", () => {
    const state = game([{}, {}]);
    const std = fin(state, "p1", "bowl white plain std");
    const fine = fin(state, "p1", "bowl white plain fine");
    const mp = fin(state, "p1", "plate white plain mp");
    fin(state, "p1", "vase celadon plain flawed");
    stageCeramic(state, { owner: "p1", stage: "shaped", shape: "censer" });
    fin(state, "p2", "censer moon_white plain mp");
    const exhibition = breakdown(state, "p1").exhibition;
    expect(exhibition).toEqual({ ceramicIds: [std, fine, mp], qualityVp: 10, shapesBonus: 0, glazesBonus: 0, total: 10 });
  });

  it("+3 for at least 3 different Shapes and +3 for at least 3 different Glazes, each once", () => {
    const state = game([{}, {}]);
    fin(state, "p1", "bowl white plain std");
    fin(state, "p1", "plate celadon plain std");
    expect(breakdown(state, "p1").exhibition).toMatchObject({ shapesBonus: 0, glazesBonus: 0, total: 4 });
    fin(state, "p1", "vase grey_green plain std");
    expect(breakdown(state, "p1").exhibition).toMatchObject({ shapesBonus: 3, glazesBonus: 3, total: 12 });
    fin(state, "p1", "censer moon_white plain std");
    fin(state, "p1", "washer white plain std");
    expect(breakdown(state, "p1").exhibition).toMatchObject({ qualityVp: 10, shapesBonus: 3, glazesBonus: 3, total: 16 });
  });

  it("a Flawed ceramic never counts, not even toward diversity", () => {
    const state = game([{}, {}]);
    fin(state, "p1", "bowl white plain std");
    fin(state, "p1", "plate celadon plain std");
    fin(state, "p1", "vase grey_green plain flawed");
    expect(breakdown(state, "p1").exhibition).toMatchObject({ qualityVp: 4, shapesBonus: 0, glazesBonus: 0 });
  });

  it("a Crackle ceramic is exhibited at Fine with its actual Glaze", () => {
    const state = game([{}, {}]);
    const crackle = fin(state, "p1", "bowl moon_white plain fine crackle");
    expect(breakdown(state, "p1").exhibition).toEqual({ ceramicIds: [crackle], qualityVp: 3, shapesBonus: 0, glazesBonus: 0, total: 3 });
  });

  it("delivered ceramics are not exhibited", () => {
    const state = game([{ hand: ["S16"] }, {}]);
    const vase = fin(state, "p1", "vase white plain mp");
    const kept = fin(state, "p1", "bowl white plain std");
    resolveOrderCompletion(state, "p1", { orderId: "S16", ceramicIds: [vase] }, "order_phase", testContext());
    expect(breakdown(state, "p1").exhibition.ceramicIds).toEqual([kept]);
  });

  it("Connoisseur's Cabinet: +1 per exhibited Fine or Masterpiece, up to +5 (L620)", () => {
    const state = game([{ techs: ["T19"] }, {}]);
    fin(state, "p1", "bowl white plain std");
    fin(state, "p1", "bowl white plain fine crackle");
    fin(state, "p1", "bowl white plain mp");
    expect(breakdown(state, "p1").connoisseur).toBe(2);
    for (let n = 0; n < 4; n += 1) fin(state, "p1", "plate white plain fine");
    expect(breakdown(state, "p1").connoisseur).toBe(5);
    expect(breakdown(state, "p2").connoisseur).toBe(0);
  });
});

describe("the total (L489–494)", () => {
  it("adds recorded VP, 1 VP per Tech, the Exhibition, the Cabinet and capped Coin VP", () => {
    const state = game([
      {
        techs: ["T19", "T23", "T25"],
        resources: { coins: 17 },
        score: { orders: 20, kilnAbilities: 5, recognitionOverflow: 2, imperialAudience: 6 },
        imperial: { recognition: 4, grantReceived: true, kilnGained: true, priority: "spent", audienceReceived: true },
      },
      {},
    ]);
    fin(state, "p1", "bowl white plain fine");
    fin(state, "p1", "plate celadon plain mp");
    fin(state, "p1", "vase grey_green plain std");
    expect(breakdown(state, "p1")).toEqual({
      orders: 20,
      kilnAbilities: 5,
      recognitionOverflow: 2,
      imperialAudience: 6,
      techs: 3,
      exhibition: expect.objectContaining({ qualityVp: 10, shapesBonus: 3, glazesBonus: 3, total: 16 }),
      connoisseur: 2,
      coins: 5,
      total: 20 + 5 + 2 + 6 + 3 + 16 + 2 + 5,
    });
  });

  it.each([
    [0, 0],
    [2, 0],
    [3, 1],
    [8, 2],
    [14, 4],
    [15, 5],
    [40, 5],
  ])("%i Coins score %i VP (1 per 3, max 5)", (coins, vp) => {
    const state = game([{ resources: { coins } }, {}]);
    expect(breakdown(state, "p1").coins).toBe(vp);
  });

  it("uncompleted Orders and unused ceramics cost nothing (L510)", () => {
    const empty = game([{}, {}]);
    const loaded = game([{ hand: ["O47", "O48", "O46"] }, {}]);
    stageCeramic(loaded, { owner: "p1", stage: "shaped", shape: "bowl" });
    fin(loaded, "p1", "bowl white plain flawed");
    expect(breakdown(loaded, "p1")).toEqual(breakdown(empty, "p1"));
    expect(breakdown(loaded, "p1").total).toBe(0);
  });

  it("the preview uses public information only: identical on the projection, blind to hands", () => {
    const state = game([{ hand: ["S16", "O01"], resources: { coins: 7 } }, {}]);
    fin(state, "p1", "bowl white plain fine");
    const other = structuredClone(state);
    other.hidden.orderHands["p1"] = ["O02", "O03"];
    expect(scorePreview(projectPublicState(state), "p1")).toEqual(scorePreview(state, "p1"));
    expect(scorePreview(other, "p1")).toEqual(scorePreview(state, "p1"));
    expect(scorePreview(state, "p1").playerId).toBe("p1");
  });
});

describe("winner and tie-breakers (L496, L498, R13)", () => {
  it("most VP wins", () => {
    const state = game([{ score: { orders: 10 } }, { score: { orders: 12 } }, { score: { orders: 3 } }]);
    const result = computeFinalResult(state);
    expect(result.winnerIds).toEqual(["p2"]);
    expect(result.resolvedBy).toBe("total_vp");
    expect(result.standings.map((s) => [s.playerId, s.rank, s.total])).toEqual([
      ["p2", 1, 12],
      ["p1", 2, 10],
      ["p3", 3, 3],
    ]);
  });

  it("1. farther along Imperial Recognition", () => {
    const state = game([{ score: { orders: 10 }, recognition: 2 }, { score: { orders: 10 }, recognition: 3 }]);
    const result = computeFinalResult(state);
    expect(result.winnerIds).toEqual(["p2"]);
    expect(result.resolvedBy).toBe("imperial_recognition");
    expect(result.standings.map((s) => s.tieBreak.recognition)).toEqual([3, 2]);
  });

  it("2. more printed Crowns on completed Orders; Tribute Ware's Crown does not count (R13)", () => {
    const state = game([
      { kilnId: "GE", techs: ["T25"], hand: ["O18"] },
      { kilnId: "JU", hand: ["O39"] },
    ]);
    // p1: O18 (6 VP, 2 Coins, 1 printed Crown) + Tribute Ware's bonus Crown → Recognition 2.
    const vase = fin(state, "p1", "vase celadon carved fine");
    resolveOrderCompletion(state, "p1", { orderId: "O18", ceramicIds: [vase] }, "order_phase", testContext());
    // p2: O39 (14 VP, 1 Coin, 2 printed Crowns) → Recognition 2.
    const p2Vase = fin(state, "p2", "vase celadon plain fine");
    const censer = fin(state, "p2", "censer moon_white painted fine");
    resolveOrderCompletion(state, "p2", { orderId: "O39", ceramicIds: [p2Vase, censer] }, "order_phase", testContext());
    // p1: 6 VP + 1 Coin VP + 1 Tech VP; the Exhibition (3 + 3) levels the totals at 14.
    fin(state, "p1", "bowl white plain fine");
    fin(state, "p1", "plate white plain fine");
    const result = computeFinalResult(state);
    expect(result.standings.map((s) => [s.playerId, s.total, s.tieBreak.recognition, s.tieBreak.printedCrowns])).toEqual([
      ["p2", 14, 2, 2],
      ["p1", 14, 2, 1],
    ]);
    expect(player(state, "p1").completedOrders[0]).toMatchObject({ printedCrowns: 1, bonusCrowns: 1 });
    expect(result.winnerIds).toEqual(["p2"]);
    expect(result.resolvedBy).toBe("printed_crowns");
    expect(result.standings.map((s) => [s.playerId, s.rank])).toEqual([
      ["p2", 1],
      ["p1", 2],
    ]);
  });

  it("3. more Masterpieces delivered or exhibited", () => {
    const state = game([{ hand: ["S16"] }, {}]);
    // p1: 1 delivered Masterpiece (S16: 2 VP, Coins spent); p2: 1 exhibited Standard (2 VP).
    const delivered = fin(state, "p1", "vase white plain mp");
    resolveOrderCompletion(state, "p1", { orderId: "S16", ceramicIds: [delivered] }, "order_phase", testContext());
    player(state, "p1").resources.coins = 0;
    fin(state, "p2", "bowl white plain std");
    player(state, "p2").score.orders = 0;
    const result = computeFinalResult(state);
    expect(result.standings.map((s) => [s.playerId, s.total, s.tieBreak.masterpieces])).toEqual([
      ["p1", 2, 1],
      ["p2", 2, 0],
    ]);
    expect(result.winnerIds).toEqual(["p1"]);
    expect(result.resolvedBy).toBe("masterpieces");

    // An exhibited Masterpiece counts the same as a delivered one.
    const exhibited = game([{ score: { orders: 5 } }, {}]);
    fin(exhibited, "p2", "bowl white plain mp");
    expect(computeFinalResult(exhibited).resolvedBy).toBe("masterpieces");
    expect(computeFinalResult(exhibited).winnerIds).toEqual(["p2"]);
  });

  it("4. still tied: shared victory, shared rank, seat order kept", () => {
    const state = game([{ score: { orders: 5 } }, { score: { orders: 9 } }, { score: { orders: 9 } }, { score: { orders: 9 } }]);
    const result = computeFinalResult(state);
    expect(result.winnerIds).toEqual(["p2", "p3", "p4"]);
    expect(result.resolvedBy).toBe("shared_victory");
    expect(result.standings.map((s) => [s.playerId, s.rank])).toEqual([
      ["p2", 1],
      ["p3", 1],
      ["p4", 1],
      ["p1", 4],
    ]);
  });

  it("ties below first place share a rank too", () => {
    const state = game([{ score: { orders: 1 } }, { score: { orders: 9 } }, { score: { orders: 1 } }]);
    expect(computeFinalResult(state).standings.map((s) => [s.playerId, s.rank])).toEqual([
      ["p2", 1],
      ["p1", 2],
      ["p3", 2],
    ]);
  });
});

describe("finishGame (L489)", () => {
  it("records the result, finishes the game and emits a public FINAL_SCORE_CALCULATED", () => {
    const state = game([{ score: { orders: 4 }, resources: { coins: 9 } }, { score: { orders: 6 } }]);
    fin(state, "p1", "bowl white plain fine");
    const ctx = testContext();
    finishGame(state, ctx);
    const expected = computeFinalResult(state);
    expect(state.finalResult).toEqual(expected);
    expect(state.phase).toEqual({ type: "finished" });
    expect(ctx.events).toEqual([{ type: "FINAL_SCORE_CALCULATED", result: expected }]);
    expect(projectEvent(ctx.events[0]!)).toEqual(ctx.events[0]);
    expect(ctx.halts).toEqual([]);
    // Totals are the sum of their breakdown.
    for (const playerId of state.playerOrder) {
      const b = expected.scores[playerId]!;
      expect(b.total).toBe(
        b.orders + b.kilnAbilities + b.recognitionOverflow + b.imperialAudience + b.techs + b.exhibition.total + b.connoisseur + b.coins,
      );
    }
    expect(expected.winnerIds).toEqual(["p1"]);
    expect(expected.scores["p1"]?.total).toBe(4 + 3 + 3);
  });

  it("is independent of the key order of state Records", () => {
    const state = game([{ score: { orders: 4 }, techs: ["T19"] }, { score: { orders: 4 } }, { score: { orders: 1 } }]);
    fin(state, "p2", "bowl white plain mp");
    fin(state, "p1", "plate celadon plain fine");
    fin(state, "p3", "vase moon_white plain std");
    fin(state, "p1", "bowl white plain fine");
    const reversed = structuredClone(state);
    reversed.ceramics = Object.fromEntries(Object.entries(reversed.ceramics).reverse());
    reversed.players = Object.fromEntries(Object.entries(reversed.players).reverse());
    expect(JSON.stringify(computeFinalResult(reversed))).toBe(JSON.stringify(computeFinalResult(state)));
  });
});
