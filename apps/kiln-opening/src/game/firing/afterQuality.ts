/**
 * Protective Saggars, Second Firing (+ Jun), Ge and finishing the firing (Appendix D steps 5–6,
 * rev. 4 L663–664; L624, L627, L463–465, L641).
 *
 * Step 5 (`firing_after_quality`, rev. 4 L663): players act in First Player order. The head of
 * the queue uses its after-Quality abilities in any order; eligibility is rechecked after each
 * use, and a player with nothing eligible left is advanced automatically (DESIGN §3.3, §3.7).
 * One player's turn holds at most one of Protective Saggars / Second Firing (both Firing
 * Techs, L210) plus Ge if they own the Ge Kiln, so the order matters only between Ge and that
 * Tech. The queue head may also sell a Flawed ceramic (R20; `flawedSale.ts`), one of this
 * firing included; `continueAfterSale` then lets the turn pass when no ability is left.
 *
 * Protective Saggars (T11, rev. 4 L624): its floor (never Flawed) is applied when Quality is
 * assigned (`pipeline.assignQuality`) and on any recalculation. Its optional once-per-round step
 * here turns 1 of the owner's Standard ceramics from this firing Fine, without Wood, never into
 * a Masterpiece (R4: declining keeps the use).
 *
 * Ge (rev. 4 L463, L641, change 29): once per round, 1 of the owner's Fine or Standard ceramics
 * from this firing develops Crackle and is Fine (a Standard one becomes Fine, a Fine one stays
 * Fine). Saggars' Standard → Fine step and then Crackle may both apply to one ceramic; Crackle
 * first leaves no Standard for Saggars' step. A Crackle ceramic stays Fine: nothing raises it
 * afterwards. Its 1 VP per delivered Crackle ceramic is scored at Order completion
 * (`orders/completion.ts`, rev. 4 L465).
 *
 * Second Firing (T14, rev. 4 L627): `USE_SECOND_FIRING` reveals 2 extra Fire cards
 * (reshuffling the discard when the deck runs out, R15) and opens `firing_second_firing_choice`
 * with them in `firing.pendingExtraFire`. `SECOND_FIRING_CHOOSE` picks 1 and recalculates with
 * the same Base Heat (the Kiln Die for the Imperial Kiln), position modifier and Kiln Master
 * marker, no carried-over Jun; then an unused Jun adjustment, if chosen (rev. 4 L627, formerly
 * R7); then the new Quality, which replaces the old even if worse; then both cards go face up to
 * the discard in reveal order.
 *
 * Step 6 (`finishFiring`, rev. 4 L664): ceramics become Finished, kilns empty, Kiln Furniture and
 * the Kiln Master marker return, the Fire card goes face up to the discard, `lastFiring` records
 * the firing, Test Pieces peeks are forgotten, then `continueAfter("firing_done")`. Revision 3's
 * salvage step is gone (change 30): a Flawed ceramic is sold during its owner's turn instead.
 *
 * Layer 4: imports layers 0–3 (DESIGN §2.2).
 */

import { KILNS, KILN_SPACE_IDS, TECHS } from "../content.ts";
import { InvariantError, invariant, ruleError } from "../errors.ts";
import { hasKiln, kilnAbilityReady, markKilnAbilityUsed } from "../kilns.ts";
import { canAfford, emit, loadedCeramics, lookup, phaseAs, player, spend, turnOrder } from "../state.ts";
import { markTechUsed, ownsTech, techReady } from "../techs.ts";
import type {
  ActionHandlerTable,
  ActorView,
  AfterQualityAbility,
  AfterQualityOption,
  CeramicId,
  FinishedCeramic,
  FiringCeramicRecord,
  GameAction,
  GameRuleError,
  GameState,
  PlayerId,
  PlayerView,
  PublicCore,
  Quality,
  ResolveContext,
  SecondFiringChoiceOptions,
  TechId,
} from "../types.ts";
import { discardFire, drawFire } from "./fireDeck.ts";
import {
  firingRecord,
  firingRecordsInOrder,
  heatCalculation,
  qualityFor,
  requireFiring,
  saggarsFloored,
  saggarsProtects,
  withJunAdjustment,
} from "./heat.ts";

const PROTECTIVE_SAGGARS: TechId = "T11";
const SECOND_FIRING: TechId = "T14";

/** Second Firing targets only Flawed or Standard ceramics (rev. 4 L627). */
const SECOND_FIRING_TARGETS: readonly Quality[] = ["flawed", "standard"];

// ── Shared firing helpers (also used by `firing/pipeline.ts`) ─────────────────────────

/**
 * Validates "1 of your ceramics from this firing" (rev. 4 L463, L478, L624, L627) on a view: it
 * exists, it is the viewer's, and it is a loaded ceramic of the current firing (not sold, R20).
 * Returns the firing record or a rule error.
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
  if (record === null || found.stage !== "loaded" || record.sold) {
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

const ZERO_COST = Object.freeze({ clay: 0, wood: 0, coins: 0 });

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

// ── Step 5 options ───────────────────────────────────────────────────────────────────

function ownRecords(game: PublicCore, playerId: PlayerId): FiringCeramicRecord[] {
  const firing = game.firing;
  if (firing === null) {
    return [];
  }
  return firingRecordsInOrder(firing).filter(
    (record) =>
      record.ownerId === playerId &&
      !record.sold &&
      record.quality !== null &&
      lookup(game.ceramics, record.ceramicId)?.stage === "loaded",
  );
}

/** Every after-Quality ability `playerId` could use now, with its eligible ceramics (rev. 4 L663). */
function optionsFor(game: PublicCore, playerId: PlayerId): AfterQualityOption[] {
  const p = player(game, playerId);
  const records = ownRecords(game, playerId);
  const options: AfterQualityOption[] = [];
  if (techReady(p, PROTECTIVE_SAGGARS)) {
    // Rev. 4 L624: 1 of your Standard ceramics from this firing becomes Fine; no Wood.
    const ceramicIds = records.filter((r) => r.quality === TECHS.T11.params.upgradeFrom).map((r) => r.ceramicId);
    if (ceramicIds.length > 0) {
      options.push({ ability: "protective_saggars", ceramicIds, cost: { ...ZERO_COST } });
    }
  }
  if (techReady(p, SECOND_FIRING)) {
    const ceramicIds = records.filter((r) => r.quality !== null && SECOND_FIRING_TARGETS.includes(r.quality)).map((r) => r.ceramicId);
    if (ceramicIds.length > 0) {
      options.push({ ability: "second_firing", ceramicIds, cost: { ...ZERO_COST } });
    }
  }
  if (kilnAbilityReady(p, "GE")) {
    // Rev. 4 L463: 1 of your Fine or Standard ceramics from this firing.
    const ceramicIds = records.filter((r) => r.quality !== null && geTargets().includes(r.quality)).map((r) => r.ceramicId);
    if (ceramicIds.length > 0) {
      options.push({ ability: "ge_crackle", ceramicIds, cost: { ...ZERO_COST } });
    }
  }
  return options;
}

/** The viewer's after-Quality options while it is their step-5 turn; otherwise `[]`. */
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

// ── Step 5 queue (Appendix D, rev. 4 L663) ─────────────────────────────────────────────

/** Opens step 5 for every player with an eligible after-Quality ability, in First Player
 * order (rev. 4 L663); with none, the firing finishes (step 6). */
export function openAfterQuality(draft: GameState, ctx: ResolveContext): void {
  requireFiring(draft);
  const actorIds = turnOrder(draft).filter((pid) => optionsFor(draft, pid).length > 0);
  if (actorIds.length === 0) {
    finishFiring(draft, ctx);
    return;
  }
  draft.phase = { type: "firing_after_quality", queue: { actorIds, index: 0 } };
}

/** Moves to the next queued player who still has an option, or finishes the firing. */
function advanceAfterQuality(draft: GameState, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "firing_after_quality");
  const queue = phase.queue;
  let index = queue.index + 1;
  while (index < queue.actorIds.length && optionsFor(draft, queue.actorIds[index] as PlayerId).length === 0) {
    index += 1;
  }
  if (index >= queue.actorIds.length) {
    finishFiring(draft, ctx);
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

/**
 * After the queue head sold a Flawed ceramic (R20, `SELL_FLAWED`): as after an ability use, the
 * turn continues while an after-Quality ability is still eligible and otherwise passes. A sale
 * alone never keeps the turn open: a Flawed ceramic of this firing left unsold becomes a
 * Finished one, sellable in its owner's Order Phase turn.
 */
export function continueAfterSale(draft: GameState, actorId: PlayerId, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "firing_after_quality");
  invariant(phase.queue.actorIds[phase.queue.index] === actorId, `${actorId} is not the after-Quality actor`);
  afterAbilityUsed(draft, actorId, ctx);
}

// ── Step 5 abilities ─────────────────────────────────────────────────────────────────

/** Ge's targets (rev. 4 L463): the qualities in `KILNS.GE.params.fromQualities`. */
function geTargets(): readonly Quality[] {
  return KILNS.GE.params.fromQualities;
}

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

/** Rev. 4 L627 (formerly R7): an unused Jun adjustment may apply to the Second Firing
 * recalculation, if affordable. */
function secondFiringJunAvailable(game: PublicCore, playerId: PlayerId): boolean {
  const p = player(game, playerId);
  return kilnAbilityReady(p, "JU") && canAfford(p.resources, { wood: KILNS.JU.params.wood });
}

/** The viewer's Second Firing choice while `firing_second_firing_choice` is theirs; else null. */
export function secondFiringChoiceOptions(view: PlayerView): SecondFiringChoiceOptions | null {
  const game = view.game;
  const viewerId = view.viewerId;
  const phase = game.phase;
  const pending = game.firing?.pendingExtraFire ?? null;
  if (viewerId === null || phase.type !== "firing_second_firing_choice" || phase.actorId !== viewerId || pending === null) {
    return null;
  }
  return {
    ceramicId: phase.ceramicId,
    modifiers: [pending.modifiers[0], pending.modifiers[1]],
    jun: { ready: secondFiringJunAvailable(game, viewerId), woodCost: KILNS.JU.params.wood },
  };
}

/** Second Firing reveals 2 extra cards and uses 1 (rev. 4 L627; T14 params). */
function secondFiringCardCounts(): { extra: 2; chosen: 1 } {
  const { extraCards, chosenCards } = TECHS.T14.params;
  invariant(extraCards === 2 && chosenCards === 1, `Second Firing reveals 2 cards and uses 1, not ${extraCards}/${chosenCards}`);
  return { extra: 2, chosen: 1 };
}

/**
 * `SECOND_FIRING_CHOOSE` (rev. 4 L627): the chosen card recalculates the ceramic; then Jun if
 * given; then the new Quality (Protective Saggars' floor applies to its owner, L650), which
 * replaces the old one even if worse; both cards go face up to the discard in reveal order;
 * and the actor's step-5 turn continues.
 */
function resolveSecondFiringChoice(
  draft: GameState,
  actorId: PlayerId,
  action: Extract<GameAction, { type: "SECOND_FIRING_CHOOSE" }>,
  ctx: ResolveContext,
): void {
  const phase = phaseAs(draft, "firing_second_firing_choice");
  invariant(phase.actorId === actorId, `${actorId} is not the Second Firing actor`);
  const firing = requireFiring(draft);
  const pending = firing.pendingExtraFire;
  invariant(
    pending !== null && pending.playerId === actorId && pending.ceramicId === phase.ceramicId,
    "No Second Firing cards are waiting for a choice",
  );
  const record = draftRecord(draft, phase.ceramicId);
  const first = record.first;
  invariant(first !== null && firing.baseHeat !== null, `${record.ceramicId} has no first calculation`);
  const [revealedA, revealedB] = pending.modifiers;
  const chosen = action.cardIndex === 0 ? revealedA : revealedB;
  // Same Base Heat (the Kiln Die for the Imperial Kiln), position modifier and Kiln Master
  // marker; Jun from the first calculation does not carry over (rev. 4 L627, L289).
  const source = record.kiln === "imperial" ? firing.kilnDie : firing.baseHeat;
  let second = heatCalculation({
    fireModifier: chosen,
    heatSource: source + chosen,
    positionModifier: first.positionModifier,
    kilnMasterMarker: first.kilnMasterMarker,
    junAdjustment: 0,
    preferredHeat: record.preferredHeat,
  });
  record.secondFiringCards = [revealedA, revealedB];
  emit(ctx, {
    type: "SECOND_FIRING_CHOSEN",
    playerId: actorId,
    ceramicId: record.ceramicId,
    cardIndex: action.cardIndex,
    modifier: chosen,
    calculation: { ...second },
  });
  if (action.jun !== null) {
    // Rev. 4 L627 (formerly R7): an unused Jun on the recalculated heat, before the new Quality.
    spend(draft, actorId, { wood: KILNS.JU.params.wood }, "jun", ctx);
    markKilnAbilityUsed(draft, actorId, ctx);
    second = withJunAdjustment(second, action.jun.delta, record.preferredHeat);
    emit(ctx, {
      type: "JUN_ADJUSTED",
      playerId: actorId,
      ceramicId: record.ceramicId,
      delta: action.jun.delta,
      finalActualHeat: second.finalActualHeat,
      during: "second_firing",
    });
  }
  record.second = second;
  const neverFlawed = saggarsProtects(player(draft, record.ownerId));
  const quality = qualityFor(second.heatDifference, neverFlawed);
  const saggarsFloor = saggarsFloored(second.heatDifference, neverFlawed);
  setQuality(record, quality, "second_firing");
  record.saggarsFloor = saggarsFloor;
  emit(ctx, {
    type: "QUALITY_ASSIGNED",
    ceramicId: record.ceramicId,
    quality,
    heatDifference: second.heatDifference,
    cause: "second_firing",
    saggarsFloor,
  });
  // "Discard both extra Fire cards after resolving" (rev. 4 L627), in reveal order.
  firing.pendingExtraFire = null;
  discardFire(draft, revealedA);
  discardFire(draft, revealedB);
  // Back to step 5: the actor's turn continues; players after them in First Player order
  // have not acted yet, so their eligibility is unchanged since step 5 opened.
  const order = turnOrder(draft);
  const later = order.slice(order.indexOf(actorId) + 1).filter((pid) => optionsFor(draft, pid).length > 0);
  draft.phase = { type: "firing_after_quality", queue: { actorIds: [actorId, ...later], index: 0 } };
  afterAbilityUsed(draft, actorId, ctx);
}

function validateSecondFiringTarget(view: ActorView, ceramicId: CeramicId): GameRuleError | null {
  const target = ownFiringCeramic(view.game, view.viewerId, ceramicId);
  if (target.error !== null) {
    return target.error;
  }
  const quality = target.record.quality;
  if (quality === null || !SECOND_FIRING_TARGETS.includes(quality)) {
    return ruleError("INVALID_TARGET", "Choose one of your Flawed or Standard ceramics from this firing.", { ceramicId, reason: "not_flawed_or_standard" });
  }
  return null;
}

function validateSaggarsTarget(view: ActorView, ceramicId: CeramicId): GameRuleError | null {
  const target = ownFiringCeramic(view.game, view.viewerId, ceramicId);
  if (target.error !== null) {
    return target.error;
  }
  if (target.record.quality !== TECHS.T11.params.upgradeFrom) {
    return ruleError("INVALID_TARGET", "Choose one of your Standard ceramics from this firing.", { ceramicId, reason: "not_standard" });
  }
  return null;
}

// ── Step 6: finish ───────────────────────────────────────────────────────────────────

/**
 * Appendix D step 6 (rev. 4 L664): loaded ceramics become Finished with their Quality and
 * Crackle; every kiln space is emptied and Kiln Furniture returned (the Kiln Master marker
 * vanishes with the loaded state); the round's Fire card goes face up to the discard;
 * `lastFiring` records the firing; Test Pieces peeks are forgotten; then
 * `continueAfter("firing_done")`. A ceramic sold during the firing (R20) is already gone.
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
      // Rev. 4 L624: Standard → Fine, no Wood; never a Masterpiece.
      invariant(record.quality === TECHS.T11.params.upgradeFrom, `${ceramicId} is not Standard`);
      markTechUsed(draft, actorId, PROTECTIVE_SAGGARS, ctx);
      const to = TECHS.T11.params.upgradeTo;
      const from = setQuality(record, to, "protective_saggars");
      emit(ctx, { type: "QUALITY_IMPROVED", ceramicId, from, to, cause: "protective_saggars" });
      break;
    }
    case "ge_crackle": {
      // Rev. 4 L463: a Fine or Standard ceramic develops Crackle and is Fine; only a Standard one
      // changes Quality (QUALITY_IMPROVED). The history records Fine → Fine too.
      invariant(record.quality !== null && geTargets().includes(record.quality), `${ceramicId} is not Fine or Standard`);
      markKilnAbilityUsed(draft, actorId, ctx);
      const to = KILNS.GE.params.toQuality;
      const from = setQuality(record, to, "ge_crackle");
      record.crackle = true;
      if (from !== to) {
        emit(ctx, { type: "QUALITY_IMPROVED", ceramicId, from, to, cause: "ge_crackle" });
      }
      emit(ctx, { type: "CRACKLE_APPLIED", playerId: actorId, ceramicId });
      break;
    }
    case "second_firing": {
      // Rev. 4 L627: reveal 2 extra Fire cards face up (each draw reshuffles the discard when the
      // deck runs out, R15), then the owner chooses 1 in `firing_second_firing_choice`.
      markTechUsed(draft, actorId, SECOND_FIRING, ctx);
      const firing = requireFiring(draft);
      invariant(record.first !== null && firing.baseHeat !== null, `${ceramicId} has no first calculation`);
      secondFiringCardCounts();
      const revealedA = drawFire(draft, ctx);
      const revealedB = drawFire(draft, ctx);
      firing.pendingExtraFire = { playerId: actorId, ceramicId, modifiers: [revealedA, revealedB] };
      emit(ctx, { type: "SECOND_FIRING_REVEALED", playerId: actorId, ceramicId, modifiers: [revealedA, revealedB] });
      draft.phase = { type: "firing_second_firing_choice", actorId, ceramicId };
      return;
    }
    default: {
      const unreachable: never = ability;
      throw new InvariantError(`Unknown after-Quality ability ${String(unreachable)}`);
    }
  }
  afterAbilityUsed(draft, actorId, ctx);
}

export const handlers: Pick<
  ActionHandlerTable,
  "USE_PROTECTIVE_SAGGARS" | "USE_SECOND_FIRING" | "SECOND_FIRING_CHOOSE" | "USE_GE_CRACKLE" | "END_AFTER_QUALITY"
> = {
  USE_PROTECTIVE_SAGGARS: {
    phases: ["firing_after_quality"],
    validate(view, action) {
      return techUseError(view.game, view.viewerId, PROTECTIVE_SAGGARS) ?? validateSaggarsTarget(view, action.ceramicId);
    },
    resolve(draft, actorId, action, ctx) {
      useAbilityAndContinue(draft, actorId, "protective_saggars", action.ceramicId, ctx);
    },
  },
  USE_SECOND_FIRING: {
    phases: ["firing_after_quality"],
    validate(view, action) {
      return techUseError(view.game, view.viewerId, SECOND_FIRING) ?? validateSecondFiringTarget(view, action.ceramicId);
    },
    resolve(draft, actorId, action, ctx) {
      useAbilityAndContinue(draft, actorId, "second_firing", action.ceramicId, ctx);
    },
  },
  SECOND_FIRING_CHOOSE: {
    phases: ["firing_second_firing_choice"],
    validate(view, action) {
      const game = view.game;
      const pending = game.firing?.pendingExtraFire ?? null;
      if (pending === null || pending.playerId !== view.viewerId) {
        return ruleError("INVALID_CHOICE", "No Second Firing cards are waiting for your choice.", { choice: "second_firing" });
      }
      if (action.cardIndex !== 0 && action.cardIndex !== 1) {
        return ruleError("INVALID_CHOICE", "Choose one of the 2 revealed Fire cards.", { cardIndex: String(action.cardIndex) });
      }
      if (action.jun === null) {
        return null;
      }
      const p = player(game, view.viewerId);
      if (!hasKiln(p, "JU")) {
        return ruleError("KILN_ABILITY_NOT_OWNED", "Only the Jun Kiln adjusts Actual Heat.", { kilnId: "JU" });
      }
      if (!kilnAbilityReady(p, "JU")) {
        return ruleError("ABILITY_ALREADY_USED", "Jun has already been used this round.", { kilnId: "JU" });
      }
      const needed = KILNS.JU.params.wood;
      return p.resources.wood < needed ? insufficientWood(needed, p.resources.wood) : null;
    },
    resolve(draft, actorId, action, ctx) {
      resolveSecondFiringChoice(draft, actorId, action, ctx);
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
      const quality = target.record.quality;
      if (quality === null || !geTargets().includes(quality)) {
        return ruleError("INVALID_TARGET", "Crackle needs one of your Fine or Standard ceramics from this firing.", {
          ceramicId: action.ceramicId,
          reason: "not_fine_or_standard",
        });
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
};
