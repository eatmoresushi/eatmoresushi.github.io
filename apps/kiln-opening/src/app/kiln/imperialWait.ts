/**
 * A ceramic waiting in an Imperial Kiln for a later firing (owner revision 5; owner ruling R28).
 * Owner: B3.
 *
 * Imperial Priority is a free action, so it may be spent in the Order Phase, after this round's
 * firing: its ceramic then stays in the Imperial Kiln through Cleanup and the next Start of Round
 * and is fired in the next round's firing; in the last round it is never fired and scores
 * nothing. The engine records the round it was loaded (`LoadedCeramic.loadedInRound`) and how
 * (`loadedBy`), both public; this reads them with the public phase to say which case the tile
 * shows. It decides no rule: whether such a load is legal, and when it is fired, are the engine's.
 */
import type { GamePhaseType, LoadedCeramic, RoundNumber } from "../../game/index.ts";
import { RULE_NUMBERS } from "../i18n/content.ts";

/**
 * - `this_round`: loaded after an earlier round's firing, it is fired in this round's firing;
 * - `next_round`: loaded after this round's firing, it is fired in the next round's firing;
 * - `never`: loaded after the last round's firing, it is never fired.
 */
export type ImperialWait = "this_round" | "next_round" | "never";

/** The phases that come after this round's firing (the Order Phase, Cleanup, the end). */
const AFTER_FIRING: ReadonlySet<GamePhaseType> = new Set<GamePhaseType>(["orders", "cleanup_hand_limit", "finished"]);

export function imperialWait(ceramic: Pick<LoadedCeramic, "loadedBy" | "loadedInRound">, round: RoundNumber, phase: GamePhaseType): ImperialWait | null {
  if (ceramic.loadedBy !== "imperial_priority") return null;
  if (ceramic.loadedInRound < round) return "this_round";
  if (!AFTER_FIRING.has(phase)) return null;
  return round >= RULE_NUMBERS.rounds ? "never" : "next_round";
}
