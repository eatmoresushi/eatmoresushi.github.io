/**
 * Protective Saggars, Second Firing (+R7 Jun), Ge, salvage and finishing the firing
 * (Appendix D steps 10–12, L280, L637, L640, L467, L681–683).
 *
 * Step 10 (`firing_after_quality`): players act in First Player order (L681). The head of the
 * queue uses its after-Quality abilities in any order; eligibility is rechecked after each
 * use, and a player with nothing eligible left is advanced automatically (DESIGN §3.3, §3.7).
 * One player's turn holds at most one of Protective Saggars / Second Firing (both Firing
 * Techs, L210) plus Ge if they own the Ge Kiln, so the order matters only between Ge and that
 * Tech (Ge may follow Saggars on the same ceramic, L654).
 *
 * Second Firing (T14, L640, R7): an extra Fire card, the same Base Heat (Kiln Die for the
 * Imperial Kiln), position modifier and Heat marker, no carried-over Jun. If the actor's Jun
 * is unused and affordable, the R7 window (`firing_second_firing_jun`) opens with the card in
 * `firing.pendingExtraFire`; otherwise the new Quality is assigned (replacing the old one even
 * if worse) and the card discarded inside `USE_SECOND_FIRING`.
 *
 * Step 11 (`firing_salvage`, parallel): each player with a still-Flawed ceramic from this
 * firing may discard 1 for 2 Coins and return its Vessel card (L280, L682).
 *
 * Step 12 (`finishFiring`): ceramics become Finished, kilns empty, Kiln Furniture and markers
 * return, the Fire card goes face up to the discard, `lastFiring` records the firing, Test
 * Pieces peeks are forgotten, then `continueAfter("firing_done")` (L683).
 *
 * Layer 4: imports layers 0–3 (DESIGN §2.2).
 */

import { FIRING, KILNS, KILN_SPACE_IDS, TECHS } from "../content.ts";
import { InvariantError, invariant, ruleError } from "../errors.ts";
import { hasKiln, kilnAbilityReady, markKilnAbilityUsed } from "../kilns.ts";
import {
  canAfford,
  emit,
  gain,
  loadedCeramics,
  lookup,
  phaseAs,
  player,
  returnVesselCard,
  spend,
  turnOrder,
} from "../state.ts";
import { markTechUsed, ownsTech, techReady } from "../techs.ts";
import type {
  ActionHandlerTable,
  ActorView,
  AfterQualityAbility,
  AfterQualityOption,
  CeramicId,
  FinishedCeramic,
  FireModifier,
  FiringCeramicRecord,
  GameAction,
  GameRuleError,
  GameState,
  PlayerId,
  PlayerView,
  PublicCore,
  Quality,
  ResolveContext,
  SalvageOptions,
  TechId,
} from "../types.ts";
import { discardFire, drawFire } from "./fireDeck.ts";
import { firingRecord, firingRecordsInOrder, heatCalculation, qualityOf, requireFiring, withJunAdjustment } from "./heat.ts";

const PROTECTIVE_SAGGARS: TechId = "T11";
const SECOND_FIRING: TechId = "T14";

/** Protective Saggars: Flawed → Standard, Standard → Fine; never to Masterpiece (L637). */
const SAGGARS_STEP: Readonly<Partial<Record<Quality, Quality>>> = { flawed: "standard", standard: "fine" };
/** Saggars and Second Firing target only Flawed or Standard ceramics (L637, L640). */
const IMPROVABLE: readonly Quality[] = ["flawed", "standard"];

// ── Shared firing helpers (also used by `firing/pipeline.ts`) ─────────────────────────

/**
 * Validates "1 of your ceramics from this firing" (L637, L640, L641, L467, L477, L280) on a
 * view: it exists, it is the viewer's, and it is a loaded ceramic of the current firing (not
 * salvaged). Returns the firing record or a rule error.
 */
export function ownFiringCeramic(
  game: PublicCore,
  viewerId: PlayerId,
  ceramicId: CeramicId,
): { record: FiringCeramicRecord; error: null } | { record: null; error: GameRuleError } {
  const found = lookup(game.ceramics, ceramicId);
  if (found === undefined) {
    return { record: null, error: ruleError("CERAMIC_NOT_FOUND", "That ceramic does not exist.", { ceramicId }) };
  }
  if (found.ownerId !== viewerId) {
    return { record: null, error: ruleError("CERAMIC_NOT_OWNED", "That ceramic is not yours.", { ceramicId }) };
  }
  const record = game.firing === null ? null : firingRecord(game.firing, ceramicId);
  if (record === null || found.stage !== "loaded" || record.salvaged) {
    return {
      record: null,
      error: ruleError("INVALID_TARGET", "That ceramic is not in this firing.", { ceramicId, reason: "not_this_firing" }),
    };
  }
  return { record, error: null };
}

function insufficientWood(needed: number, have: number): GameRuleError {
  return ruleError("INSUFFICIENT_RESOURCES", `You need ${needed} Wood.`, { resource: "wood", needed, have });
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

// ── Step 10 options ──────────────────────────────────────────────────────────────────

function ownRecords(game: PublicCore, playerId: PlayerId): FiringCeramicRecord[] {
  const firing = game.firing;
  if (firing === null) {
    return [];
  }
  return firingRecordsInOrder(firing).filter(
    (record) =>
      record.ownerId === playerId &&
      !record.salvaged &&
      record.quality !== null &&
      lookup(game.ceramics, record.ceramicId)?.stage === "loaded",
  );
}

/** Every after-Quality ability `playerId` could use now, with its eligible ceramics (L681). */
function optionsFor(game: PublicCore, playerId: PlayerId): AfterQualityOption[] {
  const p = player(game, playerId);
  const records = ownRecords(game, playerId);
  const options: AfterQualityOption[] = [];
  const saggarsWood = TECHS.T11.params.wood;
  if (techReady(p, PROTECTIVE_SAGGARS) && canAfford(p.resources, { wood: saggarsWood })) {
    const ceramicIds = records.filter((r) => r.quality !== null && IMPROVABLE.includes(r.quality)).map((r) => r.ceramicId);
    if (ceramicIds.length > 0) {
      options.push({ ability: "protective_saggars", ceramicIds, cost: { clay: 0, wood: saggarsWood, coins: 0 } });
    }
  }
  if (techReady(p, SECOND_FIRING)) {
    const ceramicIds = records.filter((r) => r.quality !== null && IMPROVABLE.includes(r.quality)).map((r) => r.ceramicId);
    if (ceramicIds.length > 0) {
      options.push({ ability: "second_firing", ceramicIds, cost: { clay: 0, wood: 0, coins: 0 } });
    }
  }
  if (kilnAbilityReady(p, "GE")) {
    const ceramicIds = records.filter((r) => r.quality === KILNS.GE.params.fromQuality).map((r) => r.ceramicId);
    if (ceramicIds.length > 0) {
      options.push({ ability: "ge_crackle", ceramicIds, cost: { clay: 0, wood: 0, coins: 0 } });
    }
  }
  return options;
}

/** The viewer's after-Quality options while it is their step-10 turn; otherwise `[]`. */
export function afterQualityOptions(view: PlayerView): AfterQualityOption[] {
  const game = view.game;
  const viewerId = view.viewerId;
  if (viewerId === null || game.phase.type !== "firing_after_quality") {
    return [];
  }
  const queue = game.phase.queue;
  if (queue.actorIds[queue.index] !== viewerId) {
    return [];
  }
  return optionsFor(game, viewerId);
}

// ── Step 10 queue ─────────────────────────────────────────────────────────────────────

/** Opens step 10 for every player with an eligible after-Quality ability, in First Player
 * order (L681); with none, continues to salvage. */
export function openAfterQuality(draft: GameState, ctx: ResolveContext): void {
  requireFiring(draft);
  const actorIds = turnOrder(draft).filter((pid) => optionsFor(draft, pid).length > 0);
  if (actorIds.length === 0) {
    openSalvage(draft, ctx);
    return;
  }
  draft.phase = { type: "firing_after_quality", queue: { actorIds, index: 0 } };
}

/** Moves to the next queued player who still has an option, or on to salvage. */
function advanceAfterQuality(draft: GameState, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "firing_after_quality");
  const queue = phase.queue;
  let index = queue.index + 1;
  while (index < queue.actorIds.length && optionsFor(draft, queue.actorIds[index] as PlayerId).length === 0) {
    index += 1;
  }
  if (index >= queue.actorIds.length) {
    openSalvage(draft, ctx);
    return;
  }
  queue.index = index;
}

/** After each ability use: the actor keeps the turn while something is still eligible
 * (rechecked), otherwise the turn passes automatically (DESIGN §3.7). */
function afterAbilityUsed(draft: GameState, actorId: PlayerId, ctx: ResolveContext): void {
  if (optionsFor(draft, actorId).length > 0) {
    return;
  }
  advanceAfterQuality(draft, ctx);
}

// ── Step 10 abilities ─────────────────────────────────────────────────────────────────

function setQuality(record: FiringCeramicRecord, to: Quality, cause: FiringCeramicRecord["history"][number]["cause"]): Quality {
  const from = record.quality;
  invariant(from !== null, `${record.ceramicId} has no Quality yet`);
  record.quality = to;
  record.history.push({ cause, from, to });
  return from;
}

function draftRecord(draft: GameState, ceramicId: CeramicId): FiringCeramicRecord {
  const record = firingRecord(requireFiring(draft), ceramicId);
  invariant(record !== null, `${ceramicId} is not in this firing`);
  return record;
}

/** Assigns Second Firing's new Quality (replacing the old one even if worse, L640) and
 * discards the extra card (L640 "Discard the extra Fire card after resolving it"). */
function completeSecondFiring(draft: GameState, record: FiringCeramicRecord, extra: FireModifier, ctx: ResolveContext): void {
  const second = record.second;
  invariant(second !== null, `${record.ceramicId} has no Second Firing calculation`);
  const quality = qualityOf(second);
  setQuality(record, quality, "second_firing");
  emit(ctx, { type: "QUALITY_ASSIGNED", ceramicId: record.ceramicId, quality, heatDifference: second.heatDifference, cause: "second_firing" });
  discardFire(draft, extra);
}

/** R7: Jun is usable on the Second Firing ceramic if unused this round and affordable. */
function secondFiringJunAvailable(game: PublicCore, playerId: PlayerId): boolean {
  const p = player(game, playerId);
  return kilnAbilityReady(p, "JU") && canAfford(p.resources, { wood: KILNS.JU.params.wood });
}

/**
 * Resolves the R7 Jun window: optional Jun on the Second Firing ceramic (1 Wood, ±1), then
 * the new Quality, the extra card to the discard, and back to the actor's step-10 turn.
 * Called by `RESOLVE_JUN` in `firing_second_firing_jun` (validated there).
 */
export function resolveSecondFiringJun(
  draft: GameState,
  actorId: PlayerId,
  adjustment: Extract<GameAction, { type: "RESOLVE_JUN" }>["adjustment"],
  ctx: ResolveContext,
): void {
  const phase = phaseAs(draft, "firing_second_firing_jun");
  invariant(phase.actorId === actorId, `${actorId} is not the Second Firing Jun actor`);
  const firing = requireFiring(draft);
  const pending = firing.pendingExtraFire;
  invariant(
    pending !== null && pending.playerId === actorId && pending.ceramicId === phase.ceramicId,
    "No Second Firing card is waiting for Jun",
  );
  const record = draftRecord(draft, phase.ceramicId);
  const second = record.second;
  invariant(second !== null, `${record.ceramicId} has no Second Firing calculation`);
  if (adjustment !== null) {
    invariant(adjustment.ceramicId === phase.ceramicId, "Jun in Second Firing targets the Second Firing ceramic");
    spend(draft, actorId, { wood: KILNS.JU.params.wood }, "jun", ctx);
    markKilnAbilityUsed(draft, actorId, ctx);
    record.second = withJunAdjustment(second, adjustment.delta, record.preferredHeat);
    emit(ctx, {
      type: "JUN_ADJUSTED",
      playerId: actorId,
      ceramicId: record.ceramicId,
      delta: adjustment.delta,
      finalActualHeat: record.second.finalActualHeat,
      during: "second_firing",
    });
  }
  firing.pendingExtraFire = null;
  completeSecondFiring(draft, record, pending.modifier, ctx);
  // Back to step 10: the actor's turn continues; players after them in First Player order
  // have not acted yet, so their eligibility is unchanged since step 10 opened.
  const order = turnOrder(draft);
  const later = order.slice(order.indexOf(actorId) + 1).filter((pid) => optionsFor(draft, pid).length > 0);
  draft.phase = { type: "firing_after_quality", queue: { actorIds: [actorId, ...later], index: 0 } };
  afterAbilityUsed(draft, actorId, ctx);
}

function validateImprovableTarget(view: ActorView, ceramicId: CeramicId): GameRuleError | null {
  const target = ownFiringCeramic(view.game, view.viewerId, ceramicId);
  if (target.error !== null) {
    return target.error;
  }
  const quality = target.record.quality;
  if (quality === null || !IMPROVABLE.includes(quality)) {
    return ruleError("INVALID_TARGET", "Choose one of your Flawed or Standard ceramics from this firing.", { ceramicId });
  }
  return null;
}

// ── Step 11: salvage ──────────────────────────────────────────────────────────────────

function salvageable(game: PublicCore, playerId: PlayerId): CeramicId[] {
  return ownRecords(game, playerId)
    .filter((record) => record.quality === "flawed")
    .map((record) => record.ceramicId);
}

/** Step 11 (L682): every player with a still-Flawed ceramic from this firing decides, in any
 * order; with nobody eligible, the firing finishes. */
function openSalvage(draft: GameState, ctx: ResolveContext): void {
  const pendingPlayerIds = turnOrder(draft).filter((pid) => salvageable(draft, pid).length > 0);
  if (pendingPlayerIds.length === 0) {
    finishFiring(draft, ctx);
    return;
  }
  draft.phase = { type: "firing_salvage", pendingPlayerIds, openedAtRevision: draft.revision + 1 };
}

/** The viewer's salvage choice while they are pending in step 11; otherwise null. */
export function salvageOptions(view: PlayerView): SalvageOptions | null {
  const game = view.game;
  const viewerId = view.viewerId;
  if (viewerId === null || game.phase.type !== "firing_salvage" || !game.phase.pendingPlayerIds.includes(viewerId)) {
    return null;
  }
  return { ceramicIds: salvageable(game, viewerId), coins: FIRING.salvageCoins };
}

/** Discards a salvaged ceramic: off its kiln space (with any Kiln Furniture beneath it,
 * which would return after firing anyway), its Vessel card back to the supply (L280). */
function discardSalvagedCeramic(draft: GameState, ceramicId: CeramicId): void {
  const salvaged = lookup(draft.ceramics, ceramicId);
  invariant(salvaged !== undefined && salvaged.stage === "loaded", `${ceramicId} is not a loaded ceramic`);
  if (salvaged.placement.kiln === "shared") {
    const space = draft.sharedKiln.spaces[salvaged.placement.spaceId];
    space.ceramicIds = space.ceramicIds.filter((id) => id !== ceramicId);
    const furniture = space.kilnFurniture;
    if (furniture !== null && furniture.underCeramicId === ceramicId) {
      const remaining = space.ceramicIds[0];
      space.kilnFurniture = remaining === undefined ? null : { ...furniture, underCeramicId: remaining };
    }
  }
  delete draft.ceramics[ceramicId];
  returnVesselCard(draft, salvaged.vesselInstanceId);
}

// ── Step 12: finish ───────────────────────────────────────────────────────────────────

/**
 * Appendix D step 12 (L683): loaded ceramics become Finished with their Quality and Crackle;
 * every kiln space is emptied and Kiln Furniture returned (Heat markers vanish with the
 * loaded state); the round's Fire card goes face up to the discard; `lastFiring` records the
 * firing; Test Pieces peeks are forgotten; then `continueAfter("firing_done")`.
 */
export function finishFiring(draft: GameState, ctx: ResolveContext): void {
  const firing = requireFiring(draft);
  invariant(firing.pendingExtraFire === null, "A Second Firing card is still pending");
  const finishedCeramicIds: CeramicId[] = [];
  for (const loaded of loadedCeramics(draft)) {
    const record = firingRecord(firing, loaded.id);
    invariant(record !== null && record.quality !== null, `${loaded.id} has no Quality from this firing`);
    const core = {
      id: loaded.id,
      ownerId: loaded.ownerId,
      vesselInstanceId: loaded.vesselInstanceId,
      shape: loaded.shape,
      decoration: loaded.decoration,
      formedInRound: loaded.formedInRound,
      formedBy: loaded.formedBy,
      glaze: loaded.glaze,
      firedInRound: firing.round,
      stage: "finished" as const,
    };
    let finished: FinishedCeramic;
    if (record.crackle) {
      if (record.quality !== "fine") {
        throw new InvariantError(`Crackle ceramic ${loaded.id} must be Fine, not ${record.quality}`);
      }
      finished = { ...core, crackle: true, quality: "fine" };
    } else {
      finished = { ...core, crackle: false, quality: record.quality };
    }
    draft.ceramics[loaded.id] = finished;
    finishedCeramicIds.push(loaded.id);
  }
  for (const spaceId of KILN_SPACE_IDS) {
    const space = draft.sharedKiln.spaces[spaceId];
    space.ceramicIds = [];
    space.kilnFurniture = null;
  }
  if (firing.fireModifier !== null) {
    discardFire(draft, firing.fireModifier);
  }
  draft.lastFiring = firing;
  draft.firing = null;
  draft.hidden.firePeeks = {};
  emit(ctx, { type: "FIRING_FINISHED", round: firing.round, finishedCeramicIds });
  ctx.flow.continueAfter("firing_done", draft, ctx);
}

// ── Handlers ──────────────────────────────────────────────────────────────────────────

function useAbilityAndContinue(draft: GameState, actorId: PlayerId, ability: AfterQualityAbility, ceramicId: CeramicId, ctx: ResolveContext): void {
  const record = draftRecord(draft, ceramicId);
  switch (ability) {
    case "protective_saggars": {
      spend(draft, actorId, { wood: TECHS.T11.params.wood }, "protective_saggars", ctx);
      markTechUsed(draft, actorId, PROTECTIVE_SAGGARS, ctx);
      const to = record.quality === null ? undefined : SAGGARS_STEP[record.quality];
      invariant(to !== undefined, `${ceramicId} cannot be improved by Protective Saggars`);
      const from = setQuality(record, to, "protective_saggars");
      emit(ctx, { type: "QUALITY_IMPROVED", ceramicId, from, to, cause: "protective_saggars" });
      break;
    }
    case "ge_crackle": {
      markKilnAbilityUsed(draft, actorId, ctx);
      const to = KILNS.GE.params.toQuality;
      const from = setQuality(record, to, "ge_crackle");
      record.crackle = true;
      emit(ctx, { type: "QUALITY_IMPROVED", ceramicId, from, to, cause: "ge_crackle" });
      emit(ctx, { type: "CRACKLE_APPLIED", playerId: actorId, ceramicId });
      break;
    }
    case "second_firing": {
      markTechUsed(draft, actorId, SECOND_FIRING, ctx);
      const firing = requireFiring(draft);
      const first = record.first;
      invariant(first !== null && firing.baseHeat !== null, `${ceramicId} has no first calculation`);
      const extra = drawFire(draft, ctx);
      // Same Base Heat (Kiln Die for the Imperial Kiln), position modifier and Heat marker;
      // Jun from the first calculation does not carry over (L640, L288).
      const source = record.kiln === "imperial" ? firing.kilnDie : firing.baseHeat;
      record.second = heatCalculation({
        fireModifier: extra,
        heatSource: source + extra,
        positionModifier: first.positionModifier,
        heatMarker: first.heatMarker,
        junAdjustment: 0,
        preferredHeat: record.preferredHeat,
      });
      emit(ctx, { type: "SECOND_FIRING_REVEALED", playerId: actorId, ceramicId, modifier: extra, calculation: { ...record.second } });
      if (secondFiringJunAvailable(draft, actorId)) {
        firing.pendingExtraFire = { playerId: actorId, ceramicId, modifier: extra };
        draft.phase = { type: "firing_second_firing_jun", actorId, ceramicId };
        return;
      }
      completeSecondFiring(draft, record, extra, ctx);
      break;
    }
    default: {
      const unreachable: never = ability;
      throw new InvariantError(`Unknown after-Quality ability ${String(unreachable)}`);
    }
  }
  afterAbilityUsed(draft, actorId, ctx);
}

export const handlers: Pick<ActionHandlerTable, "USE_PROTECTIVE_SAGGARS" | "USE_SECOND_FIRING" | "USE_GE_CRACKLE" | "END_AFTER_QUALITY" | "SALVAGE_FLAWED"> = {
  USE_PROTECTIVE_SAGGARS: {
    phases: ["firing_after_quality"],
    validate(view, action) {
      const techError = techUseError(view.game, view.viewerId, PROTECTIVE_SAGGARS);
      if (techError !== null) {
        return techError;
      }
      const targetError = validateImprovableTarget(view, action.ceramicId);
      if (targetError !== null) {
        return targetError;
      }
      const needed = TECHS.T11.params.wood;
      const have = player(view.game, view.viewerId).resources.wood;
      return have < needed ? insufficientWood(needed, have) : null;
    },
    resolve(draft, actorId, action, ctx) {
      useAbilityAndContinue(draft, actorId, "protective_saggars", action.ceramicId, ctx);
    },
  },
  USE_SECOND_FIRING: {
    phases: ["firing_after_quality"],
    validate(view, action) {
      return techUseError(view.game, view.viewerId, SECOND_FIRING) ?? validateImprovableTarget(view, action.ceramicId);
    },
    resolve(draft, actorId, action, ctx) {
      useAbilityAndContinue(draft, actorId, "second_firing", action.ceramicId, ctx);
    },
  },
  USE_GE_CRACKLE: {
    phases: ["firing_after_quality"],
    validate(view, action) {
      const p = player(view.game, view.viewerId);
      if (!hasKiln(p, "GE")) {
        return ruleError("KILN_ABILITY_NOT_OWNED", "Only the Ge Kiln develops Crackle.", { kilnId: "GE" });
      }
      if (!kilnAbilityReady(p, "GE")) {
        return ruleError("ABILITY_ALREADY_USED", "Ge's Crackle has already been used this round.", { kilnId: "GE" });
      }
      const target = ownFiringCeramic(view.game, view.viewerId, action.ceramicId);
      if (target.error !== null) {
        return target.error;
      }
      if (target.record.quality !== KILNS.GE.params.fromQuality) {
        return ruleError("INVALID_TARGET", "Crackle needs one of your Standard ceramics from this firing.", { ceramicId: action.ceramicId });
      }
      return null;
    },
    resolve(draft, actorId, action, ctx) {
      useAbilityAndContinue(draft, actorId, "ge_crackle", action.ceramicId, ctx);
    },
  },
  END_AFTER_QUALITY: {
    phases: ["firing_after_quality"],
    validate() {
      return null;
    },
    resolve(draft, _actorId, _action, ctx) {
      advanceAfterQuality(draft, ctx);
    },
  },
  SALVAGE_FLAWED: {
    phases: ["firing_salvage"],
    validate(view, action) {
      if (action.ceramicId === null) {
        return null;
      }
      const target = ownFiringCeramic(view.game, view.viewerId, action.ceramicId);
      if (target.error !== null) {
        return target.error;
      }
      if (target.record.quality !== "flawed") {
        return ruleError("INVALID_TARGET", "Only a ceramic still Flawed from this firing can be salvaged.", {
          ceramicId: action.ceramicId,
        });
      }
      return null;
    },
    resolve(draft, actorId, action, ctx) {
      const phase = phaseAs(draft, "firing_salvage");
      if (action.ceramicId !== null) {
        draftRecord(draft, action.ceramicId).salvaged = true;
        discardSalvagedCeramic(draft, action.ceramicId);
        emit(ctx, { type: "CERAMIC_SALVAGED", playerId: actorId, ceramicId: action.ceramicId, coins: FIRING.salvageCoins });
        gain(draft, actorId, { coins: FIRING.salvageCoins }, "salvage", ctx);
      }
      phase.pendingPlayerIds = phase.pendingPlayerIds.filter((pid) => pid !== actorId);
      if (phase.pendingPlayerIds.length === 0) {
        finishFiring(draft, ctx);
      }
    },
  },
};
