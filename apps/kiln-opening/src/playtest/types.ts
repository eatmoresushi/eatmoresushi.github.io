/**
 * Playtest Form V3 for rules V1.6.1.
 *
 * Changes from Form V2 (V1.4): no Starting Tech (V1.6.1 has none); up to three Techs, at
 * most one per discipline (L210), recorded per discipline; all five Kilns; the round's
 * Kiln Die, because Base Heat is the Kiln Die plus the revealed Contributions (L262); and
 * the V1.6.1 Firing Techs. Every option list comes from the V1.6.1 content API, never
 * from literals here.
 */

import type { KilnId, OrderId, TechId } from "../game/types.ts";

/** A revealed Contribution: Bank/Tend/Stoke, or Fuel Ledger's Bank −2 / Stoke +2 (L638). */
export type FireContribution = "bank_2" | "bank" | "tend" | "stoke" | "stoke_2";

export interface PlayerMetrics {
  name: string;
  kilnId: KilnId;
  /** The player's Tech of each discipline, if any (at most one each, L210). */
  workshopTechId: TechId | null;
  glazingLoadingTechId: TechId | null;
  firingTechId: TechId | null;
  completedOrderIds: OrderId[];
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
  /** The round's public Kiln Die (L125), 1–3. */
  kilnDie: number | null;
  players: RoundPlayerMetrics[];
  fireModifier: number | null;
  /** Firing-discipline Techs used this round (content `techsOfDiscipline("firing")`). */
  firingTechIds: TechId[];
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

export const PLAYTEST_FORM_VERSION = 3;

export interface PlaytestSubmission {
  formVersion: typeof PLAYTEST_FORM_VERSION;
  rulesVersion: "1.6.1";
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
  "kilnId" | "recognition" | "coinsRemaining" | "clayRemaining" | "woodRemaining" | "kilnAbilityUses" | "finalVp"
> & {
  kilnId: KilnId | null;
  recognition: number | null;
  coinsRemaining: number | null;
  clayRemaining: number | null;
  woodRemaining: number | null;
  finalVp: number | null;
};

export interface PlaytestDraft {
  formVersion: typeof PLAYTEST_FORM_VERSION;
  rulesVersion: "1.6.1";
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
