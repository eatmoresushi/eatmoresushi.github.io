/**
 * Final scoring, tie-breakers and the score preview (L442–452, L488–498, L620, R13, A1).
 *
 * A player's total (L492–494) is:
 * 1. VP recorded during play (`ScoreLedger`): Orders, Ru/Guan, Imperial Audience, Crowns
 *    beyond Recognition 4 and — owner amendment A1, overriding L379/L492/L609/L755 — 1 VP
 *    per Advanced Tech, recorded when the Tech is gained and no longer added at game end.
 *    The breakdown keeps a separate `techs` line, read from the ledger, so players see where
 *    those points came from; no effect removes a Tech, so totals and ties are unchanged;
 * 2. the End-game Exhibition, automatic (INT: Exhibition): every Finished, undelivered
 *    ceramic of Standard or better (never Flawed, L452) scores 2/3/5 by Quality, plus +3 for
 *    ≥ 3 different Shapes and +3 for ≥ 3 different Glazes (L446–452); Connoisseur's Cabinet
 *    (T19, L620) adds +1 per exhibited Fine or Masterpiece, up to +5;
 * 3. 1 VP per 3 Coins, at most 5 (L494).
 * No end-game penalties (L510).
 *
 * Ties (L498): farther Recognition → more printed Crowns on completed Orders (Tribute Ware's
 * bonus Crown excluded, R13) → more Masterpieces delivered or exhibited → shared victory.
 *
 * Everything here is public information (L504, L508), so `scorePreview` is safe for any viewer.
 * Players are iterated in seat order and ceramics in sequence order, never by `Record` keys.
 *
 * Layer 4: imports layer 0–3.
 */

import { GAME_CONFIG, IMPERIAL_TRACK, QUALITY_RANK, TECHS } from "./content.ts";
import { ceramicsInOrder, ceramicsOf, emit, player } from "./state.ts";
import { ownsTech } from "./techs.ts";
import type {
  CeramicState,
  ExhibitionScore,
  FinalResult,
  FinalScoreBreakdown,
  FinalStanding,
  FinishedCeramic,
  GameState,
  PlayerId,
  PublicCore,
  ResolveContext,
  ScoreBreakdownRow,
  ScorePreview,
  TieBreakStep,
  TieBreakValues,
} from "./types.ts";

const CONNOISSEURS_CABINET = "T19";

/**
 * The final score table's rows in L492–494 order: VP recorded during play (Orders, Kiln
 * Tradition abilities, Imperial Audience, Crowns beyond Recognition 4), 1 VP per Advanced
 * Tech (recorded when gained, A1), the End-game Exhibition, Connoisseur's Cabinet (T19, part
 * of the Exhibition scoring, L620), Coins, then the total. Every `FinalScoreBreakdown` key
 * exactly once (UI_V1.6.1_ARCHITECTURE §5 gap 9).
 */
export const SCORE_BREAKDOWN_ROWS: readonly ScoreBreakdownRow[] = Object.freeze([
  "orders",
  "kilnAbilities",
  "imperialAudience",
  "recognitionOverflow",
  "techs",
  "exhibition",
  "connoisseur",
  "coins",
  "total",
] as const);

/**
 * The tie-breakers after total VP, in L498 order; if all tie, victory is shared. Final
 * scoring ranks by exactly this list (`CRITERIA`), so the results table and the engine agree.
 */
export const TIE_BREAK_ORDER: readonly TieBreakStep[] = Object.freeze([
  Object.freeze({ key: "recognition", resolvedBy: "imperial_recognition" }),
  Object.freeze({ key: "printedCrowns", resolvedBy: "printed_crowns" }),
  Object.freeze({ key: "masterpieces", resolvedBy: "masterpieces" }),
] as const satisfies readonly TieBreakStep[]);

/** Every ceramic the player would exhibit now: Finished, undelivered, Standard or better. */
function exhibitedCeramics(game: PublicCore, playerId: PlayerId): FinishedCeramic[] {
  const minimum = QUALITY_RANK[IMPERIAL_TRACK.exhibition.minimumQuality];
  return ceramicsOf(game, playerId, "finished").filter((c) => c.quality !== "flawed" && QUALITY_RANK[c.quality] >= minimum);
}

function exhibitionScore(exhibited: readonly FinishedCeramic[]): ExhibitionScore {
  const rules = IMPERIAL_TRACK.exhibition;
  let qualityVp = 0;
  for (const c of exhibited) {
    if (c.quality !== "flawed") {
      qualityVp += rules.qualityVp[c.quality];
    }
  }
  const shapes = new Set(exhibited.map((c) => c.shape)).size;
  const glazes = new Set(exhibited.map((c) => c.glaze)).size;
  const shapesBonus = shapes >= rules.distinctShapes.threshold ? rules.distinctShapes.vp : 0;
  const glazesBonus = glazes >= rules.distinctGlazes.threshold ? rules.distinctGlazes.vp : 0;
  return {
    ceramicIds: exhibited.map((c) => c.id),
    qualityVp,
    shapesBonus: shapesBonus as 0 | 3,
    glazesBonus: glazesBonus as 0 | 3,
    total: qualityVp + shapesBonus + glazesBonus,
  };
}

function connoisseurVp(game: PublicCore, playerId: PlayerId, exhibited: readonly FinishedCeramic[]): number {
  if (!ownsTech(player(game, playerId), CONNOISSEURS_CABINET)) {
    return 0;
  }
  const params = TECHS.T19.params;
  const counted = exhibited.filter((c) => params.qualities.includes(c.quality)).length;
  return Math.min(counted * params.vpPerCeramic, params.maxVp);
}

function coinVp(coins: number): number {
  const rule = GAME_CONFIG.coinEndGame;
  return Math.min(Math.floor(coins / rule.coinsPerVp), rule.maxVp);
}

function breakdownFor(game: PublicCore, playerId: PlayerId): FinalScoreBreakdown {
  const p = player(game, playerId);
  const exhibited = exhibitedCeramics(game, playerId);
  const exhibition = exhibitionScore(exhibited);
  // Recorded when each Tech was gained (A1), never recomputed here.
  const techs = p.score.techs;
  const connoisseur = connoisseurVp(game, playerId, exhibited);
  const coins = coinVp(p.resources.coins);
  const total =
    p.score.orders +
    p.score.kilnAbilities +
    p.score.recognitionOverflow +
    p.score.imperialAudience +
    techs +
    exhibition.total +
    connoisseur +
    coins;
  return {
    orders: p.score.orders,
    kilnAbilities: p.score.kilnAbilities,
    recognitionOverflow: p.score.recognitionOverflow,
    imperialAudience: p.score.imperialAudience,
    techs,
    exhibition,
    connoisseur,
    coins,
    total,
  };
}

function isMasterpieceOf(c: CeramicState, playerId: PlayerId): boolean {
  return c.ownerId === playerId && (c.stage === "delivered" || c.stage === "finished") && c.quality === "masterpiece";
}

function tieBreakFor(game: PublicCore, playerId: PlayerId): TieBreakValues {
  const p = player(game, playerId);
  return {
    recognition: p.imperial.recognition,
    // Tie-breaker 2 counts printed Crowns only (R13).
    printedCrowns: p.completedOrders.reduce((sum, record) => sum + record.printedCrowns, 0),
    // Delivered or exhibited (every Finished Masterpiece is exhibited automatically).
    masterpieces: ceramicsInOrder(game).filter((c) => isMasterpieceOf(c, playerId)).length,
  };
}

type Criterion = Exclude<FinalResult["resolvedBy"], "shared_victory">;

/** The tie-breaker ladder (L496, L498), best first: total VP, then `TIE_BREAK_ORDER`. */
const CRITERIA: ReadonlyArray<[Criterion, (s: FinalStanding) => number]> = [
  ["total_vp", (s) => s.total],
  ...TIE_BREAK_ORDER.map((step): [Criterion, (s: FinalStanding) => number] => [step.resolvedBy, (s) => s.tieBreak[step.key]]),
];

/** Negative when `a` ranks ahead of `b`; 0 when every criterion ties (L498 step 4). */
function compareStandings(a: FinalStanding, b: FinalStanding): number {
  for (const [, value] of CRITERIA) {
    const diff = value(b) - value(a);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Final scores and standings from public state (L490–498). Standings are best first;
 * players tied on every criterion share a rank (standard competition ranking: 1, 1, 3) and
 * keep seat order. `resolvedBy` is `shared_victory` when several players share first place,
 * else the first criterion that separates the winner from the runner-up.
 */
export function computeFinalResult(game: PublicCore): FinalResult {
  const scores: Record<PlayerId, FinalScoreBreakdown> = {};
  const unranked: FinalStanding[] = game.playerOrder.map((playerId) => {
    const breakdown = breakdownFor(game, playerId);
    scores[playerId] = breakdown;
    return { playerId, rank: 0, total: breakdown.total, tieBreak: tieBreakFor(game, playerId) };
  });
  // Array.prototype.sort is stable, so full ties keep seat order.
  const sorted = [...unranked].sort(compareStandings);
  const standings = sorted.map((standing) => ({
    ...standing,
    rank: 1 + sorted.filter((other) => compareStandings(other, standing) < 0).length,
  }));
  const winnerIds = standings.filter((s) => s.rank === 1).map((s) => s.playerId);
  let resolvedBy: FinalResult["resolvedBy"] = "shared_victory";
  const winner = standings[0];
  const runnerUp = standings[1];
  if (winnerIds.length === 1 && winner !== undefined && runnerUp !== undefined) {
    const separating = CRITERIA.find(([, value]) => value(winner) !== value(runnerUp));
    resolvedBy = separating?.[0] ?? "shared_victory";
  }
  return { scores, standings, winnerIds, resolvedBy };
}

/** What the player would score if the game ended now (public information only). */
export function scorePreview(game: PublicCore, playerId: PlayerId): ScorePreview {
  return { playerId, breakdown: breakdownFor(game, playerId) };
}

/** After Round 5 Cleanup (wired to `game_over`, L490): score, record, finish. */
export function finishGame(draft: GameState, ctx: ResolveContext): void {
  const result = computeFinalResult(draft);
  draft.finalResult = result;
  draft.phase = { type: "finished" };
  emit(ctx, { type: "FINAL_SCORE_CALCULATED", result: structuredClone(result) });
}
