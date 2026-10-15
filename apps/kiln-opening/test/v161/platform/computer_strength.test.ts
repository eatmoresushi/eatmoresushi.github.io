/**
 * Strength and speed of the strategic computer player (DESIGN §9.2 P9). Thirty seeded
 * 3-player games, each with one strategic seat (rotating through the seats) against two seats
 * playing the random legal policy (`sampleLegalAction`, DESIGN §5.3). The strategic seat must
 * score clearly more, complete Orders in most games, never need the fallback, and decide well
 * inside the per-decision budget.
 */

import { describe, expect, it } from "vitest";
import { chooseStrategicCommand } from "../../../src/multiplayer/index.ts";
import { finalSummary, playEngineTable, randomChooser } from "./computer_support.ts";

const GAMES = 30;
const SEED_BASE = 7_300;

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

describe("strategic computer strength", () => {
  it(`beats the random policy over ${GAMES} seeded 3-player games`, () => {
    const strategicVp: number[] = [];
    const strategicOrders: number[] = [];
    const randomVp: number[] = [];
    const randomOrders: number[] = [];
    const decisionMs: number[] = [];
    let wins = 0;
    let strategicFallbacks = 0;
    for (let game = 0; game < GAMES; game += 1) {
      const seed = SEED_BASE + game;
      const strategicSeat = game % 3;
      const strategicId = `p${strategicSeat + 1}`;
      const result = playEngineTable({
        seed,
        playerCount: 3,
        chooserFor: (playerId, seatIndex) => {
          if (seatIndex !== strategicSeat) return randomChooser(seed * 7 + seatIndex);
          return (view) => {
            const started = performance.now();
            const choice = chooseStrategicCommand(view, { playerId, displayName: playerId, aiSeed: seed, aiPolicyVersion: null });
            decisionMs.push(performance.now() - started);
            return choice;
          };
        },
      });
      expect(result.state.phase.type).toBe("finished");
      strategicFallbacks += result.fallbacks.filter((fallback) => fallback.playerId === strategicId).length;
      for (const entry of finalSummary(result.state)) {
        if (entry.playerId === strategicId) {
          strategicVp.push(entry.total);
          strategicOrders.push(entry.orders);
        } else {
          randomVp.push(entry.total);
          randomOrders.push(entry.orders);
        }
      }
      if (result.state.finalResult?.winnerIds.includes(strategicId) === true) wins += 1;
    }
    const summary = {
      games: GAMES,
      strategicMeanVp: Number(mean(strategicVp).toFixed(2)),
      randomMeanVp: Number(mean(randomVp).toFixed(2)),
      strategicMeanOrders: Number(mean(strategicOrders).toFixed(2)),
      randomMeanOrders: Number(mean(randomOrders).toFixed(2)),
      gamesWithStrategicOrders: strategicOrders.filter((orders) => orders > 0).length,
      strategicWins: wins,
      decisions: decisionMs.length,
      medianDecisionMs: Number(percentile(decisionMs, 0.5).toFixed(3)),
      p95DecisionMs: Number(percentile(decisionMs, 0.95).toFixed(3)),
    };
    console.info(`[computer_strength] ${JSON.stringify(summary)}`);
    expect(strategicFallbacks).toBe(0);
    // Clearly stronger: at least three times the random seats' mean, and a real score.
    expect(summary.strategicMeanVp).toBeGreaterThan(3 * summary.randomMeanVp);
    expect(summary.strategicMeanVp).toBeGreaterThan(25);
    // Completes Orders in most games, and wins nearly every game.
    expect(summary.gamesWithStrategicOrders).toBeGreaterThanOrEqual(Math.ceil(GAMES * 0.8));
    expect(summary.strategicWins).toBeGreaterThanOrEqual(Math.ceil(GAMES * 0.9));
    // Per-decision budget: typical decisions well under 50 ms.
    expect(summary.medianDecisionMs).toBeLessThanOrEqual(50);
    expect(summary.p95DecisionMs).toBeLessThanOrEqual(50);
  }, 300_000);
});
