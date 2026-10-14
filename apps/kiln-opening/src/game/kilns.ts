/**
 * Kiln Tradition helpers (L453–485). Every Kiln ability is once per round; declining an
 * optional use never consumes it (R4). All five Kilns are selectable (R1).
 *
 * Layer 2 (imports `state.ts` within P0).
 */

import { KILN_IDS } from "./content.ts";
import { invariant } from "./errors.ts";
import { emit, player } from "./state.ts";
import type { GameState, KilnId, PlayerId, PlayerState, PublicCore, ResolveContext } from "./types.ts";

export function hasKiln(p: PlayerState, kilnId: KilnId): boolean {
  return p.kilnId === kilnId;
}

/** The player's Kiln is `kilnId` and its once-per-round use is unspent. */
export function kilnAbilityReady(p: PlayerState, kilnId: KilnId): boolean {
  return hasKiln(p, kilnId) && !p.kilnAbilityUsedThisRound;
}

/** Records the Kiln ability use and emits `KILN_ABILITY_USED`. A spent ability is an engine bug. */
export function markKilnAbilityUsed(draft: GameState, playerId: PlayerId, ctx: ResolveContext): void {
  const owner = player(draft, playerId);
  const kilnId = owner.kilnId;
  invariant(kilnId !== null, `${playerId} has no Kiln`);
  invariant(!owner.kilnAbilityUsedThisRound, `${playerId} already used the ${kilnId} ability this round`);
  owner.kilnAbilityUsedThisRound = true;
  emit(ctx, { type: "KILN_ABILITY_USED", playerId, kilnId });
}

/** All five Kilns (R1) minus those already chosen, in `KILN_IDS` order. */
export function availableKilns(game: PublicCore): KilnId[] {
  const chosen = new Set<KilnId>();
  for (const playerId of game.playerOrder) {
    const kilnId = player(game, playerId).kilnId;
    if (kilnId !== null) {
      chosen.add(kilnId);
    }
  }
  return KILN_IDS.filter((kilnId) => !chosen.has(kilnId));
}
