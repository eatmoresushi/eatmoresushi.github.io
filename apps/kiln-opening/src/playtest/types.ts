import type { KilnId, StartingTechniqueId, TechniqueId } from "../game/types.ts";

export type YesNo = boolean | null;

export interface PlayerMetrics {
  name: string;
  kilnId: KilnId;
  startingTechniqueId: StartingTechniqueId;
  advancedTechnique1Id: TechniqueId | null;
  advancedTechnique2Id: TechniqueId | null;
  completedOrderIds: string[];
  recognition: number;
  kilnAbilityUses: number;
  finalVp: number;
  orderVp: number | null;
  traditionVp: number | null;
  exhibitionVp: number | null;
  coinVp: number | null;
}

export interface RoundMetrics {
  round: number;
  sharedLoaded: number | null;
  imperialLoaded: number | null;
  bank: number | null;
  tend: number | null;
  stoke: number | null;
  baseHeat: number | null;
  fireModifier: number | null;
  whiteLoaded: number | null;
  celadonLoaded: number | null;
  greyGreenLoaded: number | null;
  moonWhiteLoaded: number | null;
  heatConflict: YesNo;
  orderStolen: YesNo;
  shifuRepositionUsed: YesNo;
  fuelLedgerUsed: YesNo;
  notes: string;
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
  formVersion: 1;
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
  "kilnId" | "startingTechniqueId" | "kilnAbilityUses" | "finalVp"
> & {
  kilnId: KilnId | null;
  startingTechniqueId: StartingTechniqueId | null;
  kilnAbilityUses: number | null;
  finalVp: number | null;
};

export interface PlaytestDraft {
  formVersion: 1;
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
