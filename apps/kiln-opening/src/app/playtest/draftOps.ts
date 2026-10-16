/**
 * Pure edits of a Playtest Form V3 draft (owner: B3). The form components call these; they are
 * unit-tested in node. Rules about the form come from `src/playtest` (`model.ts`, `schema.ts`):
 * - a Tech change re-runs `reconcileFiringTechOwnership`, so a −2/+2 Contribution or a used
 *   Firing Tech never outlives its owner;
 * - choosing Bank −2 or Stoke +2 (Fuel Ledger) ticks Fuel Ledger for that round, and going back
 *   to ±1 unticks it; unticking Fuel Ledger turns a ±2 Contribution back into ±1 (V1.4 form
 *   behaviour, kept).
 */
import type { PlayerCount, TechDiscipline, TechId } from "../../game/index.ts";
import { reconcileFiringTechOwnership, resizePlayers } from "../../playtest/model.ts";
import { FUEL_LEDGER_TECH_ID, TECH_FIELDS } from "../../playtest/schema.ts";
import type { FireContribution, PlaytestDraft, RoundMetrics } from "../../playtest/types.ts";

export type DraftPlayer = PlaytestDraft["players"][number];
export type DraftRoundPlayer = RoundMetrics["players"][number];
export type DraftEdit = (draft: PlaytestDraft) => PlaytestDraft;

const FUEL_CONTRIBUTIONS: ReadonlySet<FireContribution> = new Set(["bank_2", "stoke_2"]);

export function isFuelContribution(contribution: FireContribution | null): boolean {
  return contribution !== null && FUEL_CONTRIBUTIONS.has(contribution);
}

export const setPlayerCount = (playerCount: PlayerCount): DraftEdit => (draft) => reconcileFiringTechOwnership(resizePlayers(draft, playerCount));

export const updatePlayer = (index: number, patch: Partial<DraftPlayer>): DraftEdit => (draft) => ({
  ...draft,
  players: draft.players.map((player, playerIndex) => (playerIndex === index ? { ...player, ...patch } : player)),
});

export const setTech = (index: number, discipline: TechDiscipline, techId: TechId | null): DraftEdit => (draft) =>
  reconcileFiringTechOwnership(updatePlayer(index, { [TECH_FIELDS[discipline]]: techId } as Partial<DraftPlayer>)(draft));

export const updateRound = (roundIndex: number, patch: Partial<RoundMetrics>): DraftEdit => (draft) => ({
  ...draft,
  rounds: draft.rounds.map((round, index) => (index === roundIndex ? { ...round, ...patch } : round)),
});

export const updateRoundPlayer = (roundIndex: number, playerIndex: number, patch: Partial<DraftRoundPlayer>): DraftEdit => (draft) => ({
  ...draft,
  rounds: draft.rounds.map((round, index) =>
    index === roundIndex
      ? { ...round, players: round.players.map((player, current) => (current === playerIndex ? { ...player, ...patch } : player)) }
      : round,
  ),
});

/** Sets a Contribution; a ±2 Contribution ticks Fuel Ledger for the round, and none unticks it. */
export const setContribution = (roundIndex: number, playerIndex: number, contribution: FireContribution | null): DraftEdit => (draft) => ({
  ...draft,
  rounds: draft.rounds.map((round, index) => {
    if (index !== roundIndex) return round;
    const players = round.players.map((player, current) => (current === playerIndex ? { ...player, contribution } : player));
    const fuelUsed = players.some((player) => isFuelContribution(player.contribution));
    const others = round.firingTechIds.filter((techId) => techId !== FUEL_LEDGER_TECH_ID);
    return { ...round, players, firingTechIds: fuelUsed ? [...others, FUEL_LEDGER_TECH_ID] : others };
  }),
});

/** Ticks or unticks a Firing Tech for a round; unticking Fuel Ledger turns ±2 back into ±1. */
export const toggleFiringTech = (roundIndex: number, techId: TechId, used: boolean): DraftEdit => (draft) => ({
  ...draft,
  rounds: draft.rounds.map((round, index) => {
    if (index !== roundIndex) return round;
    const players = techId === FUEL_LEDGER_TECH_ID && !used
      ? round.players.map((player) => ({
        ...player,
        contribution: player.contribution === "bank_2" ? ("bank" as const) : player.contribution === "stoke_2" ? ("stoke" as const) : player.contribution,
      }))
      : round.players;
    const others = round.firingTechIds.filter((current) => current !== techId);
    return { ...round, players, firingTechIds: used ? [...others, techId] : others };
  }),
});

export const addCompletedOrder = (playerIndex: number): DraftEdit => (draft) => {
  const player = draft.players[playerIndex];
  return player === undefined ? draft : updatePlayer(playerIndex, { completedOrderIds: [...player.completedOrderIds, "" as DraftPlayer["completedOrderIds"][number]] })(draft);
};

export const setCompletedOrder = (playerIndex: number, orderIndex: number, orderId: string): DraftEdit => (draft) => {
  const player = draft.players[playerIndex];
  if (player === undefined) return draft;
  return updatePlayer(playerIndex, {
    completedOrderIds: player.completedOrderIds.map((current, index) => (index === orderIndex ? (orderId as typeof current) : current)),
  })(draft);
};

export const removeCompletedOrder = (playerIndex: number, orderIndex: number): DraftEdit => (draft) => {
  const player = draft.players[playerIndex];
  if (player === undefined) return draft;
  return updatePlayer(playerIndex, { completedOrderIds: player.completedOrderIds.filter((_, index) => index !== orderIndex) })(draft);
};

/** The index of the player who owns Fuel Ledger, or −1. */
export function fuelLedgerOwnerIndex(draft: PlaytestDraft): number {
  return draft.players.findIndex((player) => player.firingTechId === FUEL_LEDGER_TECH_ID);
}

/** Global Heat = Base Heat + the Fire card (L249), for the round summary (`src/playtest/model.ts`, CR B3-3). */
export { roundGlobalHeat } from "../../playtest/model.ts";

/** Parses a number input: empty → null. */
export function numberFromInput(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** What each form section receives: the draft and a way to edit it. */
export interface SectionProps {
  draft: PlaytestDraft;
  edit: (change: DraftEdit) => void;
}
