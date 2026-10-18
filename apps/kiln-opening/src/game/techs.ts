/**
 * Owned-Tech helpers: readiness, hand limit, acquisition limits, prices, unlocking and the
 * Contribution cards a Tech brings (v1.6.2 L212–220, L379–384, Appendix B). Gaining a Tech
 * scores no VP (v1.6.2 change 27, which superseded owner amendment A1).
 *
 * Layer 2 (imports `state.ts` within P0).
 */

import { GAME_CONFIG, TECHS, contributionCardsOfTech } from "./content.ts";
import { invariant, ruleError } from "./errors.ts";
import { emit, player } from "./state.ts";
import type {
  GameRuleError,
  GameState,
  OwnedTechState,
  PlayerId,
  PlayerState,
  ResolveContext,
  TechId,
} from "./types.ts";

function ownedTech(p: PlayerState, techId: TechId): OwnedTechState | undefined {
  return p.techs.find((tech) => tech.id === techId);
}

export function ownsTech(p: PlayerState, techId: TechId): boolean {
  return ownedTech(p, techId) !== undefined;
}

/** Owned, and its once-per-round use (if it has one) is unspent (L378). */
export function techReady(p: PlayerState, techId: TechId): boolean {
  const owned = ownedTech(p, techId);
  if (owned === undefined) {
    return false;
  }
  return !(TECHS[techId].oncePerRound && owned.usedThisRound);
}

/**
 * Records a use and emits `TECH_USED`. Only once-per-round Techs consume an allowance;
 * declining an optional use never calls this (R4). Using a spent Tech is an engine bug.
 */
export function markTechUsed(draft: GameState, playerId: PlayerId, techId: TechId, ctx: ResolveContext): void {
  const owner = player(draft, playerId);
  const owned = ownedTech(owner, techId);
  invariant(owned !== undefined, `${playerId} does not own ${techId}`);
  if (TECHS[techId].oncePerRound) {
    invariant(!owned.usedThisRound, `${playerId} already used ${techId} this round`);
    owned.usedThisRound = true;
  }
  emit(ctx, { type: "TECH_USED", playerId, techId });
}

/** Start of Round: ready every once-per-round Tech and Kiln Tradition (L132). No event;
 * `round.ts` emits `ABILITIES_READIED`. */
export function readyAllAbilities(draft: GameState): void {
  for (const playerId of draft.playerOrder) {
    const p = player(draft, playerId);
    for (const tech of p.techs) {
      tech.usedThisRound = false;
    }
    p.kilnAbilityUsedThisRound = false;
  }
}

/** 4, or 5 with Colour Samples (L200, L304, L626). */
export function handLimit(p: PlayerState): number {
  return ownsTech(p, "T10") ? TECHS.T10.params.handLimit : GAME_CONFIG.handLimit.base;
}

/** At most 3 Techs and at most 1 per discipline (L211, L375). */
export function acquisitionError(p: PlayerState, techId: TechId): GameRuleError | null {
  const limits = GAME_CONFIG.techs;
  if (p.techs.length >= limits.maxOwned) {
    return ruleError("TECH_LIMIT", `A player may own at most ${limits.maxOwned} Advanced Techs.`, {
      techId,
      maxOwned: limits.maxOwned,
    });
  }
  const discipline = TECHS[techId].discipline;
  const sameDiscipline = p.techs.filter((tech) => TECHS[tech.id].discipline === discipline).length;
  if (sameDiscipline >= limits.maxPerDiscipline) {
    return ruleError("TECH_DISCIPLINE_OWNED", "A player may own at most 1 Advanced Tech from each discipline.", {
      techId,
      discipline,
    });
  }
  return null;
}

/** What a Guild Hall take pays: the printed cost, for the Apprentice and the Shifu alike
 * (v1.6.2 L206–207; V1.6.2 removed the Shifu discount). */
export function techPrice(techId: TechId): number {
  return TECHS[techId].cost;
}

/**
 * Adds the Tech, hands over any Contribution cards it brings (Fuel Ledger's 2, v1.6.2 L111,
 * L634, change 26; `CONTRIBUTION_CARDS_GAINED`) and unlocks the second space of the matching
 * personal location (L212), emitting `PERSONAL_SPACE_UNLOCKED`. No VP is scored (v1.6.2 change
 * 27). Every path that grants a Tech goes through here. Does not pay, does not emit
 * `TECH_ACQUIRED` and does not resolve when-acquired effects (`work/guildHall.ts` does those).
 * An acquisition that `acquisitionError` rejects is an engine bug.
 */
export function grantTech(draft: GameState, playerId: PlayerId, techId: TechId, ctx: ResolveContext): void {
  const owner = player(draft, playerId);
  const error = acquisitionError(owner, techId);
  invariant(error === null, `${playerId} cannot acquire ${techId}: ${error?.code}`);
  owner.techs.push({ id: techId, acquiredInRound: draft.round, usedThisRound: false });
  const cards = contributionCardsOfTech(techId);
  if (cards.length > 0) {
    invariant(cards.every((card) => !owner.contributionCards.includes(card)), `${playerId} already holds ${techId}'s Contribution cards`);
    owner.contributionCards.push(...cards);
    emit(ctx, { type: "CONTRIBUTION_CARDS_GAINED", playerId, techId, cards: [...cards] });
  }
  const unlocks = TECHS[techId].unlocks;
  if (unlocks !== null) {
    const space = owner.personalSpaces[unlocks][1];
    if (!space.unlocked) {
      space.unlocked = true;
      emit(ctx, { type: "PERSONAL_SPACE_UNLOCKED", playerId, locationId: unlocks });
    }
  }
}
