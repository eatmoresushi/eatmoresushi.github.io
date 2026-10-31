/**
 * Guild Hall incl. the private Shifu inspection and Colour Samples when acquired (v1.6.2
 * L232–244, L389–393, L632, L656; R4, B1, B2, B3; DESIGN §3.2 as amended by
 * ENGINE_V1.6.2_DELTA.md §4.3).
 *
 * - Apprentice: `PLACE_GUILD_HALL{buy_face_up}` pays the printed cost and takes the face-up
 *   Tech, granting it (Cover-token removal, L241; Fuel Ledger's Contribution cards; no VP,
 *   change 27).
 * - Shifu: `PLACE_GUILD_HALL{inspect}` privately draws the top 2 Techs of any discipline, even
 *   one already owned, or as many as remain (v1.6.2 L237, B2). Then up to 2 `GUILD_TAKE`s, each 1 Tech
 *   face-up or inspected at its printed cost (no discount), from different disciplines (the
 *   1-per-discipline limit, L240). "Up to 2" is 1 or 2, never 0 (L164). `GUILD_FINISH` puts
 *   the untaken inspected Techs on the bottom in a private chosen order (B2). The step closes
 *   by itself when no decision is left on public facts (`decisionLeft`).
 * - Each gain resolves at once, before the next take (L243): the Cover token, any Contribution
 *   cards and any when-acquired effect. Colour Samples (T10, v1.6.2 L632, change 25) Selects 3
 *   (`work/select.ts`): it looks at the top 3 Main Orders (as many as remain, B1) and reserves 1
 *   of them or 1 face-up Main Order, mandatory whenever a reservation is possible (R4 as
 *   extended to the display, INT: Colour Samples Select); the looked cards not reserved are
 *   discarded face down (owner ruling R25); no resource. A face-up reservation
 *   leaves its position empty until the turn ends (v1.6.2 L656). When the Shifu takes it, the
 *   inspection waits in the Colour Samples look (`inspection`) and resumes after the reservation
 *   (`afterColourSamples`, called by `SELECT_CHOOSE`).
 * - A taken face-up Tech's position stays empty until the taker's turn ends; `work/turn`
 *   then refills each discipline to 2 (v1.6.2 L239), so a Shifu's second Tech is chosen from
 *   the Techs showing now, and the untaken inspected Techs are at the bottom before the
 *   refill (B2).
 * - Legality (v1.6.2 L242), for the Apprentice and the Shifu alike: an affordable face-up Tech
 *   from a discipline the player does not own, within the 3-total limit (L240).
 * - "End the turn afterwards" (owner UI decision D21, DELTA §16.24): `PLACE_GUILD_HALL`,
 *   `GUILD_TAKE` and `GUILD_FINISH` each record their `endTurn` first
 *   (`state.noteEndTurnRequest`), so a request made on the placement or a first take carries
 *   through the inspection and any Colour Samples Select to `completeWorkerAction`, unless a
 *   later command of the action carries the field.
 *
 * Layer 4 (P4). Imports layers 0–3 only; hands over through `ctx.flow.workerActionDone`.
 */

import { DISCIPLINES, GAME_CONFIG, LOCATIONS, TECHS } from "../content.ts";
import { invariant, ruleError } from "../errors.ts";
import { drawTechsForInspection, returnTechsToBottom, takeFaceUpTech } from "../market.ts";
import { placeWorker, validatePlacement, workerEffectFor } from "../placement.ts";
import { emit, noteEndTurnRequest, phaseAs, player, spend } from "../state.ts";
import { acquisitionError, grantTech, techPrice } from "../techs.ts";
import type {
  ActionHandlerTable,
  ActorView,
  GameRuleError,
  GameState,
  GuildInspectionStep,
  GuildTake,
  PlayerId,
  PlayerState,
  PublicCore,
  PublicGameState,
  ResolveContext,
  TechDiscipline,
  TechId,
} from "../types.ts";
import { publicCounts } from "../view.ts";
import { openSelect, selectReservable } from "./select.ts";

const LOCATION = "guild_hall";
const COLOUR_SAMPLES: TechId = "T10";
const EFFECTS = LOCATIONS.guild_hall.effects;

type WorkTurnPhase = Extract<GameState["phase"], { type: "work_turn" }>;
type InspectionLook = Extract<NonNullable<GameState["hidden"]["pendingLook"]>, { kind: "guild_inspection" }>;

function publicGame(draft: GameState): PublicGameState {
  const { hidden: _hidden, ...core } = draft;
  return { ...core, counts: publicCounts(draft) };
}

/** Face-up Techs in `DISCIPLINES` order (never `techDisplay` key order, DESIGN §2.3). */
function faceUpTechs(game: PublicCore): TechId[] {
  return DISCIPLINES.flatMap((discipline) => game.techDisplay[discipline]);
}

function isFaceUp(game: PublicCore, techId: TechId): boolean {
  return game.techDisplay[TECHS[techId].discipline].includes(techId);
}

/** Ownership limits (L240) and the printed price (v1.6.2 L236–237) for taking `techId`. */
function acquireError(p: PlayerState, techId: TechId): GameRuleError | null {
  const limitError = acquisitionError(p, techId);
  if (limitError !== null) {
    return limitError;
  }
  const price = techPrice(techId);
  if (price > p.resources.coins) {
    return ruleError("INSUFFICIENT_RESOURCES", "Not enough Coins for that Tech.", {
      resource: "coins",
      needed: price,
      have: p.resources.coins,
    });
  }
  return null;
}

/** v1.6.2 L242: an affordable face-up Tech from a discipline you do not own, within the
 * 3-total limit (L240). The same test for the Apprentice and the Shifu. */
function faceUpTakePossible(p: PlayerState, game: PublicCore): boolean {
  return faceUpTechs(game).some((techId) => acquireError(p, techId) === null);
}

/** Inspected Techs not yet taken, from public facts: the step's count less its inspected takes. */
function untakenCount(step: GuildInspectionStep): number {
  return step.inspectedCount - step.takes.filter((take) => take.kind === "inspected").length;
}

/**
 * Whether the Shifu still has a decision, judged on public facts only so that closing the
 * step by itself reveals nothing (DESIGN §4.5): a first take is always due; 2 untaken
 * inspected Techs leave a bottom order to choose; otherwise another take might be legal (a
 * face-up one the player can afford, or an inspected Tech of a discipline it may still own,
 * whose price is private and so is never used here).
 */
export function decisionLeft(game: PublicCore, p: PlayerState, step: GuildInspectionStep): boolean {
  if (step.takes.length === 0 || untakenCount(step) >= 2) {
    return true;
  }
  if (step.takes.length >= EFFECTS.shifu.maxTechs) {
    return false;
  }
  if (faceUpTakePossible(p, game)) {
    return true;
  }
  const ownsDiscipline = p.techs.some((tech) => TECHS[tech.id].discipline === step.discipline);
  return untakenCount(step) > 0 && !ownsDiscipline && p.techs.length < GAME_CONFIG.techs.maxOwned;
}

function techNotAvailable(techId: TechId): GameRuleError {
  return ruleError("TECH_NOT_AVAILABLE", "That Tech is not available to take.", {
    techId,
    discipline: TECHS[techId].discipline,
  });
}

/** The active player's step of `kind`, or the rule error. */
function stepError(view: ActorView, kind: "guild_inspection"): GameRuleError | null {
  const phase = view.game.phase;
  if (phase.type !== "work_turn") {
    return ruleError("WRONG_PHASE", "The Guild Hall is resolved during the Work Phase.", { phase: phase.type });
  }
  if (phase.activePlayerId !== view.viewerId) {
    return ruleError("NOT_YOUR_DECISION", "It is not your Work turn.", { playerId: view.viewerId });
  }
  if (phase.step.kind !== kind) {
    return ruleError("WRONG_PHASE", "That choice is not due now.", { phase: phase.type, step: phase.step.kind });
  }
  return null;
}

/** The viewer's own inspection while its step is due (validated by `stepError` first). */
function ownInspection(view: ActorView): { step: GuildInspectionStep; look: InspectionLook } | GameRuleError {
  const phase = view.game.phase;
  const look = view.own.pendingLook;
  if (phase.type !== "work_turn" || phase.step.kind !== "guild_inspection" || look === null || look.kind !== "guild_inspection") {
    return ruleError("INVALID_CHOICE", "No Guild Hall inspection is pending.", { choice: "guild_inspection" });
  }
  return { step: phase.step, look };
}

function isError<T extends object>(value: T | GameRuleError): value is GameRuleError {
  return "code" in value;
}

// ── Resolution ───────────────────────────────────────────────────────────────────────

function activePhase(draft: GameState, playerId: PlayerId): WorkTurnPhase {
  const phase = phaseAs(draft, "work_turn");
  invariant(phase.activePlayerId === playerId, `${playerId} is not the active player`);
  return phase;
}

function inspectionOf(draft: GameState, playerId: PlayerId): { phase: WorkTurnPhase; step: GuildInspectionStep; look: InspectionLook } {
  const phase = activePhase(draft, playerId);
  const step = phase.step;
  const look = draft.hidden.pendingLook;
  invariant(step.kind === "guild_inspection", `Expected the Guild Hall inspection step, found ${step.kind}`);
  invariant(look !== null && look.kind === "guild_inspection" && look.playerId === playerId, "No Guild Hall inspection is pending for the actor");
  return { phase, step, look };
}

/**
 * Pays the printed cost and takes the Tech: `RESOURCES_CHANGED`, `TECH_ACQUIRED` (no VP, v1.6.2
 * change 27), then whatever `grantTech` hands over (Fuel Ledger's `CONTRIBUTION_CARDS_GAINED`,
 * `PERSONAL_SPACE_UNLOCKED`, L241). A face-up Tech's position stays empty until the turn ends
 * (v1.6.2 L239).
 */
function acquire(draft: GameState, playerId: PlayerId, take: GuildTake, ctx: ResolveContext): void {
  const price = techPrice(take.techId);
  spend(draft, playerId, { coins: price }, "guild_hall", ctx);
  if (take.kind === "face_up") {
    takeFaceUpTech(draft, take.techId);
  }
  emit(ctx, { type: "TECH_ACQUIRED", playerId, techId: take.techId, source: take.kind, cost: price });
  grantTech(draft, playerId, take.techId, ctx);
}

/**
 * Colour Samples when acquired (v1.6.2 L632, change 25, R4, B1, R16): Select 3, opening the
 * `colour_samples` step (`SELECT_CHOOSE`: 1 reservation, a looked card or a face-up Main Order;
 * the looked cards not reserved are discarded, owner ruling R25). `resume` is the Shifu's
 * inspection to return to afterwards (its untaken Techs wait in the look). Returns false when no
 * reservation is possible (no face-up Main Order, and the deck and discard both empty, B1): there
 * is then nothing to reserve and no look.
 */
function openColourSamples(draft: GameState, playerId: PlayerId, resume: { step: GuildInspectionStep; look: InspectionLook } | null, ctx: ResolveContext): boolean {
  const n = TECHS.T10.params.select;
  if (!selectReservable(publicGame(draft), n)) {
    return false;
  }
  const waiting = resume === null ? null : { discipline: resume.look.discipline, techIds: [...resume.look.techIds] };
  // The Shifu's inspection waits inside the Colour Samples look until the reservation is made.
  draft.hidden.pendingLook = null;
  const select = openSelect(draft, playerId, "colour_samples", n, 1, ctx, waiting);
  activePhase(draft, playerId).step = {
    kind: "colour_samples",
    select,
    resume: resume === null ? null : structuredClone(resume.step),
  };
  return true;
}

/**
 * After Colour Samples' when-acquired reservation (`SELECT_CHOOSE`, `work/selectChoose.ts`): the
 * Guild Hall Shifu's inspection resumes, still private, with its untaken Techs (v1.6.2 L237,
 * L243), or, after an Apprentice buy, the worker action ends. No resource (v1.6.2 L632).
 */
export function afterColourSamples(
  draft: GameState,
  playerId: PlayerId,
  resume: GuildInspectionStep | null,
  inspection: { discipline: TechDiscipline; techIds: TechId[] } | null,
  ctx: ResolveContext,
): void {
  if (resume === null) {
    ctx.flow.workerActionDone(draft, playerId, ctx);
    return;
  }
  invariant(inspection !== null, "A resumed Guild Hall inspection lost its Techs");
  draft.hidden.pendingLook = { kind: "guild_inspection", playerId, discipline: inspection.discipline, techIds: [...inspection.techIds] };
  activePhase(draft, playerId).step = structuredClone(resume);
  continueInspection(draft, playerId, ctx);
}

/** B2: the untaken inspected Techs go to the bottom in the chosen private order, then the
 * worker action ends (the display refills when the turn ends, v1.6.2 L239). */
function finishInspection(draft: GameState, playerId: PlayerId, bottomOrder: readonly TechId[], ctx: ResolveContext): void {
  const { look } = inspectionOf(draft, playerId);
  draft.hidden.pendingLook = null;
  if (bottomOrder.length > 0) {
    returnTechsToBottom(draft, look.discipline, bottomOrder);
    emit(ctx, {
      type: "TECHS_RETURNED_TO_BOTTOM",
      playerId,
      discipline: look.discipline,
      count: bottomOrder.length,
      secret: { visibleTo: playerId, techIds: [...bottomOrder] },
    });
  }
  ctx.flow.workerActionDone(draft, playerId, ctx);
}

/** After a take and its effects: wait for the Shifu, or close the step when no decision is
 * left (at most 1 untaken inspected Tech, so its bottom order is forced). */
function continueInspection(draft: GameState, playerId: PlayerId, ctx: ResolveContext): void {
  const { step, look } = inspectionOf(draft, playerId);
  if (decisionLeft(draft, player(draft, playerId), step)) {
    return;
  }
  finishInspection(draft, playerId, [...look.techIds], ctx);
}

// ── Handlers ─────────────────────────────────────────────────────────────────────────

export const handlers: Pick<ActionHandlerTable, "PLACE_GUILD_HALL" | "GUILD_TAKE" | "GUILD_FINISH"> = {
  PLACE_GUILD_HALL: {
    phases: ["work_turn"],
    validate: (view, action) => {
      const placementError = validatePlacement(view, action.workerId, LOCATION, false);
      if (placementError !== null) {
        return placementError;
      }
      const effect = workerEffectFor(view, action.workerId, false);
      const p = player(view.game, view.viewerId);
      if (!faceUpTakePossible(p, view.game)) {
        return ruleError("NO_MAIN_ACTION_POSSIBLE", "You cannot afford a face-up Tech from a discipline you do not own.", {
          locationId: LOCATION,
          workerId: action.workerId,
          effect,
        });
      }
      const choice = action.choice;
      switch (choice.kind) {
        case "buy_face_up":
          if (effect !== "apprentice") {
            return ruleError("INVALID_CHOICE", "The Shifu inspects a Tech deck instead of buying directly.", {
              choice: choice.kind,
              effect,
            });
          }
          if (!isFaceUp(view.game, choice.techId)) {
            return techNotAvailable(choice.techId);
          }
          return acquireError(p, choice.techId);
        case "inspect":
          // Any discipline, including one already owned (B2), even with fewer than 2 cards left.
          return effect === "shifu"
            ? null
            : ruleError("INVALID_CHOICE", "Only the Shifu inspects a Tech deck.", { choice: choice.kind, effect });
        default: {
          const unknown: never = choice;
          return ruleError("MALFORMED_ACTION", "Unknown Guild Hall choice.", { field: "choice", value: String(unknown) });
        }
      }
    },
    resolve: (draft, actorId, action, ctx) => {
      noteEndTurnRequest(draft, actorId, action.endTurn);
      placeWorker(draft, actorId, action.workerId, LOCATION, false, ctx);
      const choice = action.choice;
      if (choice.kind === "buy_face_up") {
        acquire(draft, actorId, { kind: "face_up", techId: choice.techId }, ctx);
        if (choice.techId === COLOUR_SAMPLES && openColourSamples(draft, actorId, null, ctx)) {
          return;
        }
        ctx.flow.workerActionDone(draft, actorId, ctx);
        return;
      }
      const techIds = drawTechsForInspection(draft, choice.discipline, EFFECTS.shifu.inspectCount);
      draft.hidden.pendingLook = { kind: "guild_inspection", playerId: actorId, discipline: choice.discipline, techIds: [...techIds] };
      emit(ctx, {
        type: "PRIVATE_LOOK_OPENED",
        playerId: actorId,
        kind: "guild_inspection",
        discipline: choice.discipline,
        count: techIds.length,
        secret: { visibleTo: actorId, orderIds: [], techIds: [...techIds] },
      });
      activePhase(draft, actorId).step = {
        kind: "guild_inspection",
        workerId: action.workerId,
        discipline: choice.discipline,
        inspectedCount: techIds.length,
        takes: [],
      };
    },
  },
  GUILD_TAKE: {
    phases: ["work_turn"],
    validate: (view, action) => {
      const error = stepError(view, "guild_inspection");
      if (error !== null) {
        return error;
      }
      const inspection = ownInspection(view);
      if (isError(inspection)) {
        return inspection;
      }
      const max = EFFECTS.shifu.maxTechs;
      if (inspection.step.takes.length >= max) {
        return ruleError("TECH_TAKE_LIMIT", `This action takes at most ${max} Techs.`, { limit: max, techId: action.take.techId });
      }
      const take = action.take;
      const available = take.kind === "inspected" ? inspection.look.techIds.includes(take.techId) : isFaceUp(view.game, take.techId);
      if (!available) {
        return techNotAvailable(take.techId);
      }
      // A second Tech of the first take's discipline fails the 1-per-discipline limit (L240),
      // which is how "from different disciplines" (v1.6.2 L237) is enforced.
      return acquireError(player(view.game, view.viewerId), take.techId);
    },
    resolve: (draft, actorId, action, ctx) => {
      noteEndTurnRequest(draft, actorId, action.endTurn);
      const inspection = inspectionOf(draft, actorId);
      const take: GuildTake = { kind: action.take.kind, techId: action.take.techId };
      if (take.kind === "inspected") {
        inspection.look.techIds = inspection.look.techIds.filter((techId) => techId !== take.techId);
      }
      acquire(draft, actorId, take, ctx);
      inspection.step.takes.push(take);
      // L243: a when-acquired effect resolves now, before any second take.
      if (take.techId === COLOUR_SAMPLES && openColourSamples(draft, actorId, inspection, ctx)) {
        return;
      }
      continueInspection(draft, actorId, ctx);
    },
  },
  GUILD_FINISH: {
    phases: ["work_turn"],
    validate: (view, action) => {
      const error = stepError(view, "guild_inspection");
      if (error !== null) {
        return error;
      }
      const inspection = ownInspection(view);
      if (isError(inspection)) {
        return inspection;
      }
      if (inspection.step.takes.length === 0) {
        return ruleError("TECH_TAKE_REQUIRED", "Take at least 1 Tech.", {});
      }
      const untaken = inspection.look.techIds;
      const given = action.bottomOrder;
      const permutation =
        given.length === untaken.length && new Set(given).size === given.length && given.every((techId) => untaken.includes(techId));
      if (!permutation) {
        return ruleError(
          "INVALID_BOTTOM_ORDER",
          "Put every untaken inspected Tech on the bottom exactly once, in the order you choose.",
          { expected: untaken.length, given: given.length },
        );
      }
      return null;
    },
    resolve: (draft, actorId, action, ctx) => {
      noteEndTurnRequest(draft, actorId, action.endTurn);
      finishInspection(draft, actorId, action.bottomOrder, ctx);
    },
  },
};

