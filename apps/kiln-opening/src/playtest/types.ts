import type { KilnId, StartingTechniqueId, TechniqueId } from "../game/types.ts";

export type FireContribution = "bank_2" | "bank" | "tend" | "stoke" | "stoke_2";
export type FiringTechniqueId = "T11" | "T12" | "T13" | "T14" | "T15";

export interface PlayerMetrics {
  name: string;
  kilnId: KilnId;
  startingTechniqueId: StartingTechniqueId;
  advancedTechnique1Id: TechniqueId | null;
  advancedTechnique2Id: TechniqueId | null;
  completedOrderIds: string[];
  recognition: number;
  coinsRemaining: number;
  clayRemaining: number;
  woodRemaining: number;
  /** Derived from the five per-round counters before submission. */
  kilnAbilityUses: number;
  finalVp: number;
  orderVp: number | null;
  traditionVp: number | null;
  exhibitionVp: number | null;
  coinVp: number | null;
}

export interface RoundPlayerMetrics {
  playerIndex: number;
  contribution: FireContribution | null;
  sharedLoaded: number | null;
  imperialLoaded: number;
  ordersCompleted: number | null;
  kilnAbilityUses: number;
}

export interface RoundMetrics {
  round: number;
  players: RoundPlayerMetrics[];
  fireModifier: number | null;
  firingTechniqueIds: FiringTechniqueId[];
}

export interface PlaytestFeedback {
  strongest: string;
  weakest: string;
  blockedOrIdleWorkers: string;
  softLock: string;
  impossibleOrder: string;
  sharedKilnNegotiation: string;
  heatHedging: string;
  tendMeaningful: string;
  recognitionWorthwhile: string;
  traditionConcern: string;
  techConcern: string;
  rulesAmbiguity: string;
  minorTuning: string;
}

export interface PlaytestSubmission {
  formVersion: 2;
  rulesVersion: "1.2.4";
  playedOn: string;
  playerCount: 2 | 3 | 4;
  firstPlayerIndex: number;
  winnerIndex: number;
  players: PlayerMetrics[];
  rounds: RoundMetrics[];
  feedback: PlaytestFeedback;
}

type DraftPlayerMetrics = Omit<
  PlayerMetrics,
  | "kilnId"
  | "startingTechniqueId"
  | "recognition"
  | "coinsRemaining"
  | "clayRemaining"
  | "woodRemaining"
  | "kilnAbilityUses"
  | "finalVp"
> & {
  kilnId: KilnId | null;
  startingTechniqueId: StartingTechniqueId | null;
  recognition: number | null;
  coinsRemaining: number | null;
  clayRemaining: number | null;
  woodRemaining: number | null;
  finalVp: number | null;
};

export interface PlaytestDraft {
  formVersion: 2;
  rulesVersion: "1.2.4";
  playedOn: string;
  playerCount: 2 | 3 | 4;
  firstPlayerIndex: number;
  winnerIndex: number;
  players: DraftPlayerMetrics[];
  rounds: RoundMetrics[];
  feedback: PlaytestFeedback;
}

export interface PlaytestValidationIssue {
  path: string;
  message: string;
}

export type PlaytestValidationResult =
  | { ok: true; value: PlaytestSubmission }
  | { ok: false; issues: PlaytestValidationIssue[] };

export type PlaytestSubmitResult =
  | { ok: true; gameId: string }
  | { ok: false; code: string; message: string };
