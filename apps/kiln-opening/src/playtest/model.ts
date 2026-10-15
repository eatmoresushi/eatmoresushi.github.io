/**
 * Draft model of Playtest Form V3 (rules V1.6.1): empty drafts, resizing, derived values
 * and restoring a saved draft. Option lists and capacities come from the V1.6.1 content
 * API through `schema.ts`.
 */

import { GAME_CONFIG } from "../game/content.ts";
import type { PlayerCount } from "../game/types.ts";
import { FUEL_LEDGER_TECH_ID, baseHeatFor, sharedKilnCapacityFor } from "./schema.ts";
import { PLAYTEST_FORM_VERSION } from "./types.ts";
import type { PlaytestDraft, PlaytestFeedback, PlayerMetrics, RoundMetrics, RoundPlayerMetrics } from "./types.ts";

function localIsoDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function emptyPlayer(): PlaytestDraft["players"][number] {
  return {
    name: "",
    kilnId: null,
    workshopTechId: null,
    glazingLoadingTechId: null,
    firingTechId: null,
    completedOrderIds: [],
    recognition: null,
    coinsRemaining: null,
    clayRemaining: null,
    woodRemaining: null,
    finalVp: null,
    orderVp: null,
    traditionVp: null,
    exhibitionVp: null,
    coinVp: null,
  };
}

function emptyRoundPlayer(playerIndex: number): RoundPlayerMetrics {
  return {
    playerIndex,
    contribution: null,
    sharedLoaded: null,
    imperialLoaded: 0,
    ordersCompleted: null,
    kilnAbilityUses: 0,
  };
}

export function emptyRound(round: number, playerCount: PlayerCount): RoundMetrics {
  return {
    round,
    kilnDie: null,
    players: Array.from({ length: playerCount }, (_, playerIndex) => emptyRoundPlayer(playerIndex)),
    fireModifier: null,
    firingTechIds: [],
  };
}

function emptyFeedback(): PlaytestFeedback {
  return {
    strongest: "",
    weakest: "",
    blockedOrIdleWorkers: "",
    softLock: "",
    impossibleOrder: "",
    sharedKilnNegotiation: "",
    heatHedging: "",
    tendMeaningful: "",
    recognitionWorthwhile: "",
    traditionConcern: "",
    techConcern: "",
    rulesAmbiguity: "",
    minorTuning: "",
  };
}

export function createPlaytestDraft(playerCount: PlayerCount = 2): PlaytestDraft {
  return {
    formVersion: PLAYTEST_FORM_VERSION,
    rulesVersion: GAME_CONFIG.rulesVersion,
    playedOn: localIsoDate(),
    playerCount,
    firstPlayerIndex: 0,
    winnerIndex: 0,
    players: Array.from({ length: playerCount }, emptyPlayer),
    rounds: Array.from({ length: GAME_CONFIG.rounds }, (_, index) => emptyRound(index + 1, playerCount)),
    feedback: emptyFeedback(),
  };
}

export function resizePlayers(draft: PlaytestDraft, playerCount: PlayerCount): PlaytestDraft {
  return {
    ...draft,
    playerCount,
    players: Array.from({ length: playerCount }, (_, index) => draft.players[index] ?? emptyPlayer()),
    rounds: draft.rounds.map((round) => ({
      ...round,
      players: Array.from({ length: playerCount }, (_, index) => round.players[index] ?? emptyRoundPlayer(index)),
    })),
    firstPlayerIndex: Math.min(draft.firstPlayerIndex, playerCount - 1),
    winnerIndex: Math.min(draft.winnerIndex, playerCount - 1),
  };
}

export function sharedKilnCapacity(playerCount: PlayerCount): number {
  return sharedKilnCapacityFor(playerCount);
}

/** The round's Base Heat from its Kiln Die and revealed Contributions, or null without a die. */
export function roundBaseHeat(round: RoundMetrics): number | null {
  return baseHeatFor(
    round.kilnDie,
    round.players.map((player) => player.contribution),
  );
}

/** Remove firing-use data that no longer has a matching owner in player setup. */
export function reconcileFiringTechOwnership(draft: PlaytestDraft): PlaytestDraft {
  const ownedFiringTechIds = new Set(draft.players.flatMap((player) => (player.firingTechId === null ? [] : [player.firingTechId])));
  const fuelLedgerOwnerIndex = draft.players.findIndex((player) => player.firingTechId === FUEL_LEDGER_TECH_ID);
  return {
    ...draft,
    rounds: draft.rounds.map((round) => {
      const players = round.players.map((player, playerIndex) => ({
        ...player,
        contribution:
          playerIndex === fuelLedgerOwnerIndex
            ? player.contribution
            : player.contribution === "bank_2"
              ? ("bank" as const)
              : player.contribution === "stoke_2"
                ? ("stoke" as const)
                : player.contribution,
      }));
      const adjustedContributionRecorded = players.some(
        (player) => player.contribution === "bank_2" || player.contribution === "stoke_2",
      );
      return {
        ...round,
        players,
        firingTechIds: round.firingTechIds.filter(
          (techId) => ownedFiringTechIds.has(techId) && (techId !== FUEL_LEDGER_TECH_ID || adjustedContributionRecorded),
        ),
      };
    }),
  };
}

export function submissionCandidate(draft: PlaytestDraft): unknown {
  return {
    ...draft,
    players: draft.players.map((player, playerIndex) => ({
      ...player,
      completedOrderIds: player.completedOrderIds.filter((orderId) => (orderId as string) !== ""),
      kilnAbilityUses: draft.rounds.reduce((total, round) => total + (round.players[playerIndex]?.kilnAbilityUses ?? 0), 0),
    })) as PlayerMetrics[],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Restores a saved Form V3 draft; older form versions are not migrated. */
export function restorePlaytestDraft(serialized: string): PlaytestDraft | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || value["formVersion"] !== PLAYTEST_FORM_VERSION) return null;
    if (value["rulesVersion"] !== GAME_CONFIG.rulesVersion) return null;
    if (![2, 3, 4].includes(Number(value["playerCount"]))) return null;
    if (!Array.isArray(value["players"]) || !Array.isArray(value["rounds"])) return null;
    if (!isRecord(value["feedback"])) return null;
    if (value["players"].length !== value["playerCount"] || value["rounds"].length !== GAME_CONFIG.rounds) return null;
    if (!value["players"].every((player) => isRecord(player) && Array.isArray(player["completedOrderIds"]))) return null;
    if (
      !value["rounds"].every(
        (round) =>
          isRecord(round) &&
          Array.isArray(round["players"]) &&
          Array.isArray(round["firingTechIds"]) &&
          round["players"].length === value["playerCount"],
      )
    ) {
      return null;
    }
    return reconcileFiringTechOwnership(value as unknown as PlaytestDraft);
  } catch {
    return null;
  }
}
