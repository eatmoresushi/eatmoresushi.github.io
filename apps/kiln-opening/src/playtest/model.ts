import { GAME_CONFIG, TECHNIQUES } from "../game/content.ts";
import type {
  PlaytestDraft,
  PlaytestFeedback,
  PlayerMetrics,
  RoundMetrics,
  RoundPlayerMetrics,
} from "./types.ts";

function localIsoDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function emptyPlayer(): PlaytestDraft["players"][number] {
  return {
    name: "",
    kilnId: null,
    startingTechniqueId: null,
    advancedTechnique1Id: null,
    advancedTechnique2Id: null,
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

export function emptyRound(round: number, playerCount: 2 | 3 | 4): RoundMetrics {
  return {
    round,
    players: Array.from({ length: playerCount }, (_, playerIndex) => emptyRoundPlayer(playerIndex)),
    fireModifier: null,
    shifuRepositionUsed: false,
    firingTechniqueIds: [],
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

export function createPlaytestDraft(playerCount: 2 | 3 | 4 = 2): PlaytestDraft {
  return {
    formVersion: 2,
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

export function resizePlayers(draft: PlaytestDraft, playerCount: 2 | 3 | 4): PlaytestDraft {
  return {
    ...draft,
    playerCount,
    players: Array.from(
      { length: playerCount },
      (_, index) => draft.players[index] ?? emptyPlayer(),
    ),
    rounds: draft.rounds.map((round) => ({
      ...round,
      players: Array.from(
        { length: playerCount },
        (_, index) => round.players[index] ?? emptyRoundPlayer(index),
      ),
    })),
    firstPlayerIndex: Math.min(draft.firstPlayerIndex, playerCount - 1),
    winnerIndex: Math.min(draft.winnerIndex, playerCount - 1),
  };
}

export function sharedKilnCapacity(playerCount: 2 | 3 | 4): number {
  return playerCount === 2 ? 5 : playerCount === 3 ? 6 : 7;
}

const FIRING_TECHNIQUE_IDS = new Set(
  TECHNIQUES.filter((technique) => technique.discipline === "firing").map((technique) => technique.id),
);

/** Remove firing-use data that no longer has a matching owner in player setup. */
export function reconcileFiringTechniqueOwnership(draft: PlaytestDraft): PlaytestDraft {
  const ownedFiringTechniqueIds = new Set(
    draft.players
      .flatMap((player) => [player.advancedTechnique1Id, player.advancedTechnique2Id])
      .filter((techniqueId): techniqueId is NonNullable<typeof techniqueId> => (
        techniqueId !== null && FIRING_TECHNIQUE_IDS.has(techniqueId)
      )),
  );
  const fuelLedgerOwnerIndex = draft.players.findIndex((player) => (
    player.advancedTechnique1Id === "T12" || player.advancedTechnique2Id === "T12"
  ));

  return {
    ...draft,
    rounds: draft.rounds.map((round) => {
      const players = round.players.map((player, playerIndex) => ({
        ...player,
        contribution: playerIndex === fuelLedgerOwnerIndex
          ? player.contribution
          : player.contribution === "bank_2"
            ? "bank" as const
            : player.contribution === "stoke_2" ? "stoke" as const : player.contribution,
      }));
      const adjustedContributionRecorded = players.some((player) => (
        player.contribution === "bank_2" || player.contribution === "stoke_2"
      ));
      return {
        ...round,
        players,
        firingTechniqueIds: round.firingTechniqueIds.filter((techniqueId) => (
          ownedFiringTechniqueIds.has(techniqueId)
          && (techniqueId !== "T12" || adjustedContributionRecorded)
        )),
      };
    }),
  };
}

export function submissionCandidate(draft: PlaytestDraft): unknown {
  return {
    ...draft,
    players: draft.players.map((player, playerIndex) => ({
      ...player,
      completedOrderIds: player.completedOrderIds.filter((orderId) => orderId !== ""),
      kilnAbilityUses: draft.rounds.reduce(
        (total, round) => total + (round.players[playerIndex]?.kilnAbilityUses ?? 0),
        0,
      ),
    })) as PlayerMetrics[],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function restorePlaytestDraft(serialized: string): PlaytestDraft | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || value["formVersion"] !== 2) return null;
    if (![2, 3, 4].includes(Number(value["playerCount"]))) return null;
    if (!Array.isArray(value["players"]) || !Array.isArray(value["rounds"])) return null;
    if (!isRecord(value["feedback"])) return null;
    if (value["players"].length !== value["playerCount"] || value["rounds"].length !== 5) return null;
    if (!value["players"].every((player) => isRecord(player) && Array.isArray(player["completedOrderIds"]))) return null;
    if (!value["rounds"].every((round) => (
      isRecord(round)
      && Array.isArray(round["players"])
      && Array.isArray(round["firingTechniqueIds"])
      && round["players"].length === value["playerCount"]
    ))) return null;
    return reconcileFiringTechniqueOwnership(value as unknown as PlaytestDraft);
  } catch {
    return null;
  }
}
