/**
 * Test Pieces, Fire reveal, Actual Heat, Jun and Quality (Appendix D steps 1–4 as owner
 * revision 4 left them, L674–683, L645, L647; changes 28, 31).
 *
 * Revision 4 removed the player Heat marker and its step (changes 28, 31): the firing runs
 * Contributions (Base Heat) → Test Pieces → Fire → Actual Heat (Jun) → Quality. Kiln Master's
 * marker is chosen when the ceramic is loaded (T24, L647, R22; `kilnLoading.ts`), so it
 * is already on the ceramic here.
 *
 * - `firing_test_pieces` (T13, L645, L689: after Base Heat is determined, before the
 *   Fire card is revealed; INT): First Player order; queued when Test Pieces is ready, the
 *   owner has a ceramic in this firing (Imperial included) and 1 Wood.
 *   `TEST_PIECES_DECIDE{peek}` pays and peeks privately (`hidden.firePeeks`,
 *   `TEST_PIECES_PEEKED.secret`), then `TEST_PIECES_BURY{bury}` publicly leaves the card or
 *   moves it to the bottom. The peek reshuffles the discard on top when only buried cards
 *   are left (R15), so the buried card is drawn last (v1.6.2 L655).
 * - Fire and Actual Heat are automatic (L679–680): the command that ends Test Pieces (or
 *   the one that determines Base Heat when nobody uses Test Pieces) reveals the Fire card and
 *   calculates Actual Heat, Kiln Master's marker included.
 * - `firing_heat_adjustment` (L497, L680): Jun in First Player order (ready, a ceramic
 *   in this firing, 1 Wood). Quality is then assigned automatically (L295–300); a Protective
 *   Saggars owner's ceramics are never Flawed (T11, v1.6.2 L643), in the Shared and Imperial
 *   Kilns alike (L657).
 *
 * Layer 4: imports layers 0–3 and, inside P5, `firing/afterQuality` (DESIGN §2.4).
 */

import { KILNS, TECHS } from "../content.ts";
import { invariant, ruleError } from "../errors.ts";
import { hasKiln, kilnAbilityReady, markKilnAbilityUsed } from "../kilns.ts";
import { canAfford, emit, loadedCeramics, lookup, phaseAs, player, spend, turnOrder } from "../state.ts";
import { markTechUsed, ownsTech, techReady } from "../techs.ts";
import type {
  ActionHandlerTable,
  CeramicHeatResult,
  GameRuleError,
  GameState,
  JunOptions,
  PlayerId,
  PlayerView,
  PublicCore,
  ResolveContext,
  TechId,
  TestPiecesOptions,
} from "../types.ts";
import { openAfterQuality, ownFiringCeramic } from "./afterQuality.ts";
import { buryTopFire, drawFire, peekFire } from "./fireDeck.ts";
import {
  firingRecord,
  firingRecordsInOrder,
  heatCalculation,
  positionFor,
  qualityFor,
  requireFiring,
  saggarsFloored,
  saggarsProtects,
  withJunAdjustment,
} from "./heat.ts";

const TEST_PIECES: TechId = "T13";

/** The first index ≥ `from` whose player is still eligible, or `actorIds.length`. */
function nextEligible(actorIds: readonly PlayerId[], from: number, eligible: (playerId: PlayerId) => boolean): number {
  let index = from;
  while (index < actorIds.length && !eligible(actorIds[index] as PlayerId)) {
    index += 1;
  }
  return index;
}

function inThisFiring(game: PublicCore, playerId: PlayerId): boolean {
  return game.firing !== null && game.firing.firingPlayerIds.includes(playerId);
}

function techUseError(game: PublicCore, playerId: PlayerId, techId: TechId): GameRuleError | null {
  const p = player(game, playerId);
  if (!ownsTech(p, techId)) {
    return ruleError("TECH_NOT_OWNED", `You do not own ${TECHS[techId].name}.`, { techId });
  }
  if (!techReady(p, techId)) {
    return ruleError("TECH_ALREADY_USED", `${TECHS[techId].name} has already been used this round.`, { techId });
  }
  return null;
}

function woodError(game: PublicCore, playerId: PlayerId, needed: number): GameRuleError | null {
  const have = player(game, playerId).resources.wood;
  return have < needed ? ruleError("INSUFFICIENT_RESOURCES", `You need ${needed} Wood.`, { resource: "wood", needed, have }) : null;
}

// ── Test Pieces (end of Appendix D step 1) ────────────────────────────────────────────

function testPiecesEligible(game: PublicCore, playerId: PlayerId): boolean {
  const p = player(game, playerId);
  return techReady(p, TEST_PIECES) && inThisFiring(game, playerId) && canAfford(p.resources, { wood: TECHS.T13.params.wood });
}

/**
 * Continues after Base Heat (the end of Appendix D step 1): opens Test Pieces for its eligible
 * owners in First Player order (L645, L689), else reveals the Fire card at once.
 */
export function openAfterBaseHeat(draft: GameState, ctx: ResolveContext): void {
  const firing = requireFiring(draft);
  invariant(firing.baseHeat !== null, "Base Heat is not determined yet");
  const actorIds = turnOrder(draft).filter((pid) => testPiecesEligible(draft, pid));
  if (actorIds.length > 0) {
    draft.phase = { type: "firing_test_pieces", queue: { actorIds, index: 0 }, awaiting: "decision" };
    return;
  }
  revealFireAndCalculate(draft, ctx);
}

function advanceTestPieces(draft: GameState, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "firing_test_pieces");
  const index = nextEligible(phase.queue.actorIds, phase.queue.index + 1, (pid) => testPiecesEligible(draft, pid));
  if (index >= phase.queue.actorIds.length) {
    revealFireAndCalculate(draft, ctx);
    return;
  }
  phase.queue.index = index;
  phase.awaiting = "decision";
}

/** The viewer's Test Pieces choice while it is their turn; otherwise null. */
export function testPiecesOptions(view: PlayerView): TestPiecesOptions | null {
  const game = view.game;
  const viewerId = view.viewerId;
  if (viewerId === null || game.phase.type !== "firing_test_pieces") {
    return null;
  }
  const phase = game.phase;
  if (phase.queue.actorIds[phase.queue.index] !== viewerId) {
    return null;
  }
  const woodCost = TECHS.T13.params.wood;
  const peek = view.own?.firePeek ?? null;
  return {
    awaiting: phase.awaiting,
    woodCost,
    canPeek: phase.awaiting === "decision" && testPiecesEligible(game, viewerId),
    peekedModifier: peek !== null && peek.round === game.round ? peek.modifier : null,
  };
}

// ── Fire and Actual Heat (Appendix D steps 2–3, automatic) ────────────────────────────

/**
 * Step 2 (L679): reveal the top Fire card (reshuffling only if the deck is empty);
 * Global Heat = Base Heat + Fire, unclamped. Step 3 (L680): every ceramic's Actual Heat —
 * Shared: Global Heat + (Kiln Furniture ?? zone) + Kiln Master marker; Imperial: Kiln Die + Fire
 * + Imperial modifier + Kiln Master marker, whatever the Contributions were (L310). Then
 * Jun.
 */
function revealFireAndCalculate(draft: GameState, ctx: ResolveContext): void {
  const firing = requireFiring(draft);
  const base = firing.baseHeat;
  invariant(base !== null, "Base Heat is not determined yet");
  const loaded = loadedCeramics(draft);
  const fire = drawFire(draft, ctx);
  const globalHeat = base + fire;
  firing.fireModifier = fire;
  firing.globalHeat = globalHeat;
  emit(ctx, { type: "FIRE_REVEALED", modifier: fire, baseHeat: base, globalHeat });
  const results: CeramicHeatResult[] = [];
  for (const ceramic of loaded) {
    const record = firingRecord(firing, ceramic.id);
    invariant(record !== null, `${ceramic.id} is loaded but not in this firing`);
    const position = positionFor(draft, ceramic);
    record.positionSource = position.source;
    record.first = heatCalculation({
      fireModifier: fire,
      heatSource: ceramic.placement.kiln === "imperial" ? firing.kilnDie + fire : globalHeat,
      positionModifier: position.modifier,
      kilnMasterMarker: ceramic.kilnMasterMarker ?? 0,
      junAdjustment: 0,
      preferredHeat: record.preferredHeat,
    });
    results.push({ ceramicId: ceramic.id, calculation: { ...record.first } });
  }
  emit(ctx, { type: "ACTUAL_HEAT_CALCULATED", results });
  openHeatAdjustment(draft, ctx);
}

// ── Jun and Quality (Appendix D steps 3–4) ────────────────────────────────────────────

function junEligible(game: PublicCore, playerId: PlayerId): boolean {
  const p = player(game, playerId);
  return kilnAbilityReady(p, "JU") && inThisFiring(game, playerId) && canAfford(p.resources, { wood: KILNS.JU.params.wood });
}

function openHeatAdjustment(draft: GameState, ctx: ResolveContext): void {
  const actorIds = turnOrder(draft).filter((pid) => junEligible(draft, pid));
  if (actorIds.length > 0) {
    draft.phase = { type: "firing_heat_adjustment", queue: { actorIds, index: 0 } };
    return;
  }
  assignQuality(draft, ctx);
}

function advanceHeatAdjustment(draft: GameState, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "firing_heat_adjustment");
  const index = nextEligible(phase.queue.actorIds, phase.queue.index + 1, (pid) => junEligible(draft, pid));
  if (index >= phase.queue.actorIds.length) {
    assignQuality(draft, ctx);
    return;
  }
  phase.queue.index = index;
}

/**
 * Step 4 (L295–300, L681): Quality from each ceramic's final Heat Difference, then the
 * after-Quality abilities (step 5).
 * Protective Saggars' owner never gets Flawed: a difference of 3+ is Standard (v1.6.2 L643),
 * recorded as `saggarsFloor`; the Heat Difference stays the real one.
 */
function assignQuality(draft: GameState, ctx: ResolveContext): void {
  const firing = requireFiring(draft);
  for (const record of firingRecordsInOrder(firing)) {
    const first = record.first;
    invariant(first !== null, `${record.ceramicId} has no Actual Heat`);
    const neverFlawed = saggarsProtects(player(draft, record.ownerId));
    const quality = qualityFor(first.heatDifference, neverFlawed);
    const saggarsFloor = saggarsFloored(first.heatDifference, neverFlawed);
    record.quality = quality;
    record.saggarsFloor = saggarsFloor;
    record.history.push({ cause: "fired", from: null, to: quality });
    emit(ctx, {
      type: "QUALITY_ASSIGNED",
      ceramicId: record.ceramicId,
      quality,
      heatDifference: first.heatDifference,
      cause: "fired",
      saggarsFloor,
    });
  }
  openAfterQuality(draft, ctx);
}

/** The viewer's Jun choice (Appendix D step 3); otherwise null. Jun during Second Firing (rev. 4
 * L646, formerly R7) is part of `secondFiringChoiceOptions`. */
export function junOptions(view: PlayerView): JunOptions | null {
  const game = view.game;
  const viewerId = view.viewerId;
  if (viewerId === null) {
    return null;
  }
  const woodCost = KILNS.JU.params.wood;
  const phase = game.phase;
  if (phase.type === "firing_heat_adjustment") {
    if (phase.queue.actorIds[phase.queue.index] !== viewerId) {
      return null;
    }
    const ready = kilnAbilityReady(player(game, viewerId), "JU");
    const usable = ready && woodError(game, viewerId, woodCost) === null;
    const firing = game.firing;
    const ceramicIds =
      usable && firing !== null
        ? firingRecordsInOrder(firing)
            .filter((record) => record.ownerId === viewerId && lookup(game.ceramics, record.ceramicId)?.stage === "loaded")
            .map((record) => record.ceramicId)
        : [];
    return { during: "first_firing", ready, woodCost, ceramicIds };
  }
  return null;
}

// ── Handlers ──────────────────────────────────────────────────────────────────────────

function stepMismatch(phaseType: string, step: string, actionType: string): GameRuleError {
  return ruleError("WRONG_PHASE", "That choice is not due at this step.", { phase: phaseType, step, actionType });
}

export const handlers: Pick<ActionHandlerTable, "TEST_PIECES_DECIDE" | "TEST_PIECES_BURY" | "RESOLVE_JUN"> = {
  TEST_PIECES_DECIDE: {
    phases: ["firing_test_pieces"],
    validate(view, action) {
      const phase = phaseAs(view.game, "firing_test_pieces");
      if (phase.awaiting !== "decision") {
        return stepMismatch(phase.type, phase.awaiting, action.type);
      }
      if (!action.peek) {
        return null;
      }
      const techError = techUseError(view.game, view.viewerId, TEST_PIECES);
      if (techError !== null) {
        return techError;
      }
      if (!inThisFiring(view.game, view.viewerId)) {
        return ruleError("INVALID_CHOICE", "Test Pieces needs one of your ceramics in this firing.", { field: "peek" });
      }
      return woodError(view.game, view.viewerId, TECHS.T13.params.wood);
    },
    resolve(draft, actorId, action, ctx) {
      const firing = requireFiring(draft);
      if (!action.peek) {
        firing.testPieces.push({ playerId: actorId, peeked: false, buried: false });
        advanceTestPieces(draft, ctx);
        return;
      }
      spend(draft, actorId, { wood: TECHS.T13.params.wood }, "test_pieces", ctx);
      markTechUsed(draft, actorId, TEST_PIECES, ctx);
      const modifier = peekFire(draft, ctx);
      draft.hidden.firePeeks[actorId] = { playerId: actorId, round: draft.round, modifier, buried: null };
      firing.testPieces.push({ playerId: actorId, peeked: true, buried: false });
      emit(ctx, { type: "TEST_PIECES_PEEKED", playerId: actorId, secret: { visibleTo: actorId, modifier } });
      phaseAs(draft, "firing_test_pieces").awaiting = "bury";
    },
  },
  TEST_PIECES_BURY: {
    phases: ["firing_test_pieces"],
    validate(view, action) {
      const phase = phaseAs(view.game, "firing_test_pieces");
      return phase.awaiting === "bury" ? null : stepMismatch(phase.type, phase.awaiting, action.type);
    },
    resolve(draft, actorId, action, ctx) {
      const firing = requireFiring(draft);
      const peek = lookup(draft.hidden.firePeeks, actorId);
      invariant(peek !== undefined && peek.buried === null, `${actorId} has no undecided Test Pieces peek`);
      invariant(draft.hidden.fireDeck[0] === peek.modifier, "The peeked card is no longer on top of the Fire deck");
      if (action.bury) {
        buryTopFire(draft);
      }
      peek.buried = action.bury;
      const record = [...firing.testPieces].reverse().find((entry) => entry.playerId === actorId && entry.peeked);
      invariant(record !== undefined, `${actorId} has no Test Pieces record`);
      record.buried = action.bury;
      emit(ctx, { type: "TEST_PIECES_USED", playerId: actorId, buried: action.bury });
      advanceTestPieces(draft, ctx);
    },
  },
  RESOLVE_JUN: {
    phases: ["firing_heat_adjustment"],
    validate(view, action) {
      const adjustment = action.adjustment;
      if (adjustment === null) {
        return null;
      }
      const game = view.game;
      const p = player(game, view.viewerId);
      if (!hasKiln(p, "JU")) {
        return ruleError("KILN_ABILITY_NOT_OWNED", "Only the Jun Kiln adjusts Actual Heat.", { kilnId: "JU" });
      }
      if (!kilnAbilityReady(p, "JU")) {
        return ruleError("ABILITY_ALREADY_USED", "Jun has already been used this round.", { kilnId: "JU" });
      }
      const target = ownFiringCeramic(game, view.viewerId, adjustment.ceramicId);
      if (target.error !== null) {
        return target.error;
      }
      return woodError(game, view.viewerId, KILNS.JU.params.wood);
    },
    resolve(draft, actorId, action, ctx) {
      const adjustment = action.adjustment;
      if (adjustment !== null) {
        const record = firingRecord(requireFiring(draft), adjustment.ceramicId);
        invariant(record !== null && record.first !== null, `${adjustment.ceramicId} has no Actual Heat`);
        spend(draft, actorId, { wood: KILNS.JU.params.wood }, "jun", ctx);
        markKilnAbilityUsed(draft, actorId, ctx);
        record.first = withJunAdjustment(record.first, adjustment.delta, record.preferredHeat);
        emit(ctx, {
          type: "JUN_ADJUSTED",
          playerId: actorId,
          ceramicId: adjustment.ceramicId,
          delta: adjustment.delta,
          finalActualHeat: record.first.finalActualHeat,
          during: "first_firing",
        });
      }
      advanceHeatAdjustment(draft, ctx);
    },
  },
};
