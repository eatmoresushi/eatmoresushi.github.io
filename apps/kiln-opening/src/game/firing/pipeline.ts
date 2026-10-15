/**
 * Test Pieces, Heat markers, Fire reveal, Actual Heat, Jun and Quality (Appendix D steps
 * 4–9, L243–246, L267–279, L639, L641, L675–680).
 *
 * - Step 4 `firing_test_pieces` (L639, INT): First Player order; queued when Test Pieces
 *   (T13) is ready, the owner has a ceramic in this firing (Imperial included) and 1 Wood.
 *   `TEST_PIECES_DECIDE{peek}` pays and peeks privately (`hidden.firePeeks`,
 *   `TEST_PIECES_PEEKED.secret`), then `TEST_PIECES_BURY{bury}` publicly leaves the card or
 *   moves it to the bottom.
 * - Step 5 `firing_heat_markers` (L268, L676, INT): First Player order; players with a
 *   face-down own marker (who must turn or return it) or a ready Kiln Master (T24) with an
 *   eligible ceramic. One `RESOLVE_HEAT_MARKERS` per player; the own marker resolves first,
 *   so a returned marker frees its ceramic for Kiln Master.
 * - Steps 6–7 are automatic (L677–678): the command that ends step 5 (or the one that ends
 *   step 4 / 3 when step 5 has no actor) reveals the Fire card and calculates Actual Heat.
 * - Step 8 `firing_heat_adjustment` (L478, L679): Jun in First Player order (ready, a ceramic
 *   in this firing, 1 Wood). Step 9 assigns Quality automatically (L274–279).
 *
 * Layer 4: imports layers 0–3 and, inside P5, `firing/afterQuality` (DESIGN §2.4).
 */

import { KILNS, TECHS } from "../content.ts";
import { invariant, ruleError } from "../errors.ts";
import { hasKiln, kilnAbilityReady, markKilnAbilityUsed } from "../kilns.ts";
import { canAfford, emit, heatMarkerOf, loadedCeramics, lookup, phaseAs, player, spend, turnOrder } from "../state.ts";
import { markTechUsed, ownsTech, techReady } from "../techs.ts";
import type {
  ActionHandlerTable,
  CeramicHeatResult,
  CeramicId,
  GameRuleError,
  GameState,
  HeatMarkerStepOptions,
  JunOptions,
  LoadedCeramic,
  PlayerId,
  PlayerView,
  PublicCore,
  ResolveContext,
  TechId,
  TestPiecesOptions,
} from "../types.ts";
import { openAfterQuality, ownFiringCeramic, resolveSecondFiringJun } from "./afterQuality.ts";
import { buryTopFire, drawFire, peekFire } from "./fireDeck.ts";
import {
  firingRecord,
  firingRecordsInOrder,
  heatCalculation,
  markerValue,
  positionFor,
  qualityOf,
  requireFiring,
  withJunAdjustment,
} from "./heat.ts";

const TEST_PIECES: TechId = "T13";
const KILN_MASTER: TechId = "T24";

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

// ── Step 4: Test Pieces ───────────────────────────────────────────────────────────────

function testPiecesEligible(game: PublicCore, playerId: PlayerId): boolean {
  const p = player(game, playerId);
  return techReady(p, TEST_PIECES) && inThisFiring(game, playerId) && canAfford(p.resources, { wood: TECHS.T13.params.wood });
}

/**
 * Continues after Base Heat (step 3): opens Test Pieces for its eligible owners in First
 * Player order (L675), else goes straight on to the Heat-marker step.
 */
export function openAfterBaseHeat(draft: GameState, ctx: ResolveContext): void {
  const firing = requireFiring(draft);
  invariant(firing.baseHeat !== null, "Base Heat is not determined yet");
  const actorIds = turnOrder(draft).filter((pid) => testPiecesEligible(draft, pid));
  if (actorIds.length > 0) {
    draft.phase = { type: "firing_test_pieces", queue: { actorIds, index: 0 }, awaiting: "decision" };
    return;
  }
  openHeatMarkerStep(draft, ctx);
}

function advanceTestPieces(draft: GameState, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "firing_test_pieces");
  const index = nextEligible(phase.queue.actorIds, phase.queue.index + 1, (pid) => testPiecesEligible(draft, pid));
  if (index >= phase.queue.actorIds.length) {
    openHeatMarkerStep(draft, ctx);
    return;
  }
  phase.queue.index = index;
  phase.awaiting = "decision";
}

/** The viewer's Test Pieces choice while it is their turn in step 4; otherwise null. */
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

// ── Step 5: Heat markers ──────────────────────────────────────────────────────────────

/** The viewer's ceramic carrying their own face-down Heat marker (R9, L268), if any. */
function ownFaceDownMarker(game: PublicCore, playerId: PlayerId): LoadedCeramic | null {
  const carrier = heatMarkerOf(game, playerId, "own");
  return carrier !== null && carrier.heatMarker?.faceDown === true ? carrier : null;
}

/** Kiln Master targets (T24, L641, L648): your ceramics in this firing without a Heat
 * marker — also the one carrying your own face-down marker if you return it first (INT). */
function kilnMasterTargets(game: PublicCore, playerId: PlayerId, ownReturned: boolean): CeramicId[] {
  const firing = game.firing;
  if (firing === null) {
    return [];
  }
  const targets: CeramicId[] = [];
  for (const record of firingRecordsInOrder(firing)) {
    const found = lookup(game.ceramics, record.ceramicId);
    if (record.ownerId !== playerId || found === undefined || found.stage !== "loaded") {
      continue;
    }
    const marker = found.heatMarker;
    if (marker === null || (ownReturned && marker.source === "own" && marker.faceDown)) {
      targets.push(found.id);
    }
  }
  return targets;
}

function heatMarkerStepEligible(game: PublicCore, playerId: PlayerId): boolean {
  if (ownFaceDownMarker(game, playerId) !== null) {
    return true;
  }
  return techReady(player(game, playerId), KILN_MASTER) && kilnMasterTargets(game, playerId, true).length > 0;
}

function openHeatMarkerStep(draft: GameState, ctx: ResolveContext): void {
  const actorIds = turnOrder(draft).filter((pid) => heatMarkerStepEligible(draft, pid));
  if (actorIds.length > 0) {
    draft.phase = { type: "firing_heat_markers", queue: { actorIds, index: 0 } };
    return;
  }
  revealFireAndCalculate(draft, ctx);
}

function advanceHeatMarkers(draft: GameState, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "firing_heat_markers");
  const index = nextEligible(phase.queue.actorIds, phase.queue.index + 1, (pid) => heatMarkerStepEligible(draft, pid));
  if (index >= phase.queue.actorIds.length) {
    revealFireAndCalculate(draft, ctx);
    return;
  }
  phase.queue.index = index;
}

/** The viewer's Heat-marker step choices while it is their turn in step 5; otherwise null. */
export function heatMarkerStepOptions(view: PlayerView): HeatMarkerStepOptions | null {
  const game = view.game;
  const viewerId = view.viewerId;
  if (viewerId === null || game.phase.type !== "firing_heat_markers") {
    return null;
  }
  const queue = game.phase.queue;
  if (queue.actorIds[queue.index] !== viewerId) {
    return null;
  }
  const p = player(game, viewerId);
  const own = ownFaceDownMarker(game, viewerId);
  let kilnMaster: HeatMarkerStepOptions["kilnMaster"] = null;
  if (ownsTech(p, KILN_MASTER)) {
    const ready = techReady(p, KILN_MASTER);
    kilnMaster = {
      ready,
      targets: ready ? kilnMasterTargets(game, viewerId, false) : [],
      targetsIfOwnReturned: ready ? kilnMasterTargets(game, viewerId, own !== null) : [],
    };
  }
  return { ownMarkerCeramicId: own?.id ?? null, kilnMaster };
}

// ── Steps 6–7: Fire and Actual Heat (automatic) ───────────────────────────────────────

/**
 * Step 6 (L677): reveal the top Fire card (reshuffling only if the deck is empty); Global
 * Heat = Base Heat + Fire, unclamped. Step 7 (L678): every ceramic's Actual Heat — Shared:
 * Global Heat + (Kiln Furniture ?? zone) + marker; Imperial: Kiln Die + Fire + Imperial
 * modifier + marker, whatever the Contributions were (L289). Then step 8.
 */
function revealFireAndCalculate(draft: GameState, ctx: ResolveContext): void {
  const firing = requireFiring(draft);
  const base = firing.baseHeat;
  invariant(base !== null, "Base Heat is not determined yet");
  const loaded = loadedCeramics(draft);
  invariant(
    loaded.every((c) => c.heatMarker === null || !c.heatMarker.faceDown),
    "Every face-down Heat marker is turned or returned before the Fire card",
  );
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
      heatMarker: markerValue(ceramic.heatMarker),
      junAdjustment: 0,
      preferredHeat: record.preferredHeat,
    });
    results.push({ ceramicId: ceramic.id, calculation: { ...record.first } });
  }
  emit(ctx, { type: "ACTUAL_HEAT_CALCULATED", results });
  openHeatAdjustment(draft, ctx);
}

// ── Steps 8–9: Jun and Quality ────────────────────────────────────────────────────────

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

/** Step 9 (L274–279, L680): Quality from each ceramic's final Heat Difference, then step 10. */
function assignQuality(draft: GameState, ctx: ResolveContext): void {
  const firing = requireFiring(draft);
  for (const record of firingRecordsInOrder(firing)) {
    const first = record.first;
    invariant(first !== null, `${record.ceramicId} has no Actual Heat`);
    const quality = qualityOf(first);
    record.quality = quality;
    record.history.push({ cause: "fired", from: null, to: quality });
    emit(ctx, { type: "QUALITY_ASSIGNED", ceramicId: record.ceramicId, quality, heatDifference: first.heatDifference, cause: "fired" });
  }
  openAfterQuality(draft, ctx);
}

/** The viewer's Jun choice in step 8 or the R7 Second Firing window; otherwise null. */
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
  if (phase.type === "firing_second_firing_jun") {
    if (phase.actorId !== viewerId) {
      return null;
    }
    const ready = kilnAbilityReady(player(game, viewerId), "JU");
    const usable = ready && woodError(game, viewerId, woodCost) === null;
    return { during: "second_firing", ready, woodCost, ceramicIds: usable ? [phase.ceramicId] : [] };
  }
  return null;
}

// ── Handlers ──────────────────────────────────────────────────────────────────────────

function stepMismatch(phaseType: string, step: string, actionType: string): GameRuleError {
  return ruleError("WRONG_PHASE", "That choice is not due at this step.", { phase: phaseType, step, actionType });
}

export const handlers: Pick<ActionHandlerTable, "TEST_PIECES_DECIDE" | "TEST_PIECES_BURY" | "RESOLVE_HEAT_MARKERS" | "RESOLVE_JUN"> = {
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
  RESOLVE_HEAT_MARKERS: {
    phases: ["firing_heat_markers"],
    validate(view, action) {
      const game = view.game;
      const own = ownFaceDownMarker(game, view.viewerId);
      if (own !== null && action.ownMarker === undefined) {
        return ruleError("INVALID_CHOICE", "Turn your face-down Heat marker to +1 or −1, or return it.", {
          field: "ownMarker",
          ceramicId: own.id,
        });
      }
      if (own === null && action.ownMarker !== undefined) {
        return ruleError("INVALID_CHOICE", "You have no face-down Heat marker to resolve.", { field: "ownMarker" });
      }
      const kilnMaster = action.kilnMaster;
      if (kilnMaster === undefined) {
        return null;
      }
      const techError = techUseError(game, view.viewerId, KILN_MASTER);
      if (techError !== null) {
        return techError;
      }
      const target = ownFiringCeramic(game, view.viewerId, kilnMaster.ceramicId);
      if (target.error !== null) {
        return target.error;
      }
      const carrier = lookup(game.ceramics, kilnMaster.ceramicId);
      const marker = carrier?.stage === "loaded" ? carrier.heatMarker : null;
      const freedByReturn = own !== null && own.id === kilnMaster.ceramicId && action.ownMarker === "return";
      if (marker !== null && !freedByReturn) {
        return ruleError("HEAT_MARKER_INVALID", "That ceramic already carries a Heat marker.", {
          ceramicId: kilnMaster.ceramicId,
          source: marker.source,
        });
      }
      return null;
    },
    resolve(draft, actorId, action, ctx) {
      const own = ownFaceDownMarker(draft, actorId);
      if (own !== null) {
        const choice = action.ownMarker;
        invariant(choice !== undefined, `${actorId} must resolve their face-down Heat marker`);
        if (choice === "return") {
          own.heatMarker = null;
          emit(ctx, { type: "HEAT_MARKER_RETURNED", playerId: actorId, ceramicId: own.id });
        } else {
          own.heatMarker = { source: "own", faceDown: false, value: choice };
          emit(ctx, { type: "HEAT_MARKER_TURNED", playerId: actorId, ceramicId: own.id, value: choice });
        }
      }
      const kilnMaster = action.kilnMaster;
      if (kilnMaster !== undefined) {
        const target = lookup(draft.ceramics, kilnMaster.ceramicId);
        invariant(target !== undefined && target.stage === "loaded" && target.heatMarker === null, "Kiln Master needs an unmarked ceramic");
        markTechUsed(draft, actorId, KILN_MASTER, ctx);
        target.heatMarker = { source: "kiln_master", faceDown: false, value: kilnMaster.value };
        emit(ctx, { type: "KILN_MASTER_PLACED", playerId: actorId, ceramicId: target.id, value: kilnMaster.value });
      }
      advanceHeatMarkers(draft, ctx);
    },
  },
  RESOLVE_JUN: {
    phases: ["firing_heat_adjustment", "firing_second_firing_jun"],
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
      if (game.phase.type === "firing_second_firing_jun" && adjustment.ceramicId !== game.phase.ceramicId) {
        return ruleError("INVALID_TARGET", "During Second Firing, Jun may adjust only the Second Firing ceramic.", {
          ceramicId: adjustment.ceramicId,
        });
      }
      return woodError(game, view.viewerId, KILNS.JU.params.wood);
    },
    resolve(draft, actorId, action, ctx) {
      if (draft.phase.type === "firing_second_firing_jun") {
        resolveSecondFiringJun(draft, actorId, action.adjustment, ctx);
        return;
      }
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
