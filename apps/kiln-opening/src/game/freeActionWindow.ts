/**
 * Free-action windows (rev. 5 L168–176; change 36; DELTA §16.5, §16.10.1): the public-fact
 * predicates every layer above shares.
 *
 * - **Where** (L170, L176): on your own turn before or after your worker action, not during it,
 *   and after the firing in turn order (your Order Phase turn). There are no free actions on
 *   other players' turns, during the firing, at Setup, in the Setter's Mark window or at Cleanup
 *   (I1: owner ruling R20's after-Quality and Cleanup sale windows are withdrawn).
 * - **What** (L172–174): sell a Finished Flawed ceramic (`sellableFlawed`), complete held Orders
 *   (`orders/completion.ts`), spend Imperial Priority (`imperialPriorityUsable`). Any number, in
 *   any order. The Colour Samples swap is a Work-turn before/after ability (L632), not a free
 *   action (I3).
 * - **The after-action window** (I2) is offered only while it has something to offer on public
 *   facts alone (DESIGN §4.5), so whether it opens reveals nothing about the hand
 *   (`afterActionWindowOpen`).
 *
 * Layer 3: imports layers 0–2 only (`types`, `errors`, `state`, `techs`, `view`).
 */

import { ruleError } from "./errors.ts";
import { ceramicSequence, ceramicsOf, imperialKilnCeramic, lookup, player } from "./state.ts";
import { techReady } from "./techs.ts";
import type {
  CeramicId,
  FreeActionWindow,
  GameActionType,
  GameRuleError,
  GameState,
  PlayerId,
  PublicCore,
  PublicGameState,
  TechId,
} from "./types.ts";
import { publicCounts } from "./view.ts";

/** Colour Samples (T10, rev. 5 L632): its swap is once per round, before or after a worker action. */
const COLOUR_SAMPLES: TechId = "T10";

/**
 * `playerId`'s free-action window now (rev. 5 L170, L176), or null: the before- or after-action
 * step of their own Work turn, or their own Order Phase turn. Every other Work step
 * (`commission_market`, `colour_samples`, `colour_samples_swap`, `guild_inspection`) is "during
 * the worker action"; every other phase has none.
 */
export function freeActionWindowOf(game: PublicCore, playerId: PlayerId): FreeActionWindow | null {
  const phase = game.phase;
  if (phase.type === "work_turn") {
    if (phase.activePlayerId !== playerId) {
      return null;
    }
    const kind = phase.step.kind;
    return kind === "before_action" || kind === "after_action" ? kind : null;
  }
  if (phase.type === "orders") {
    return phase.turnOrder[phase.index] === playerId ? "order_phase" : null;
  }
  return null;
}

/**
 * Null when `viewerId` is in a free-action window; otherwise why not:
 * `WORKER_ACTION_IN_PROGRESS` for the active player in a Work sub-step (L170: "not during it";
 * with `techId` while the Colour Samples swap's Select is open),
 * `NOT_YOUR_DECISION` in a Work or Order Phase turn that is another player's, `WRONG_PHASE`
 * anywhere else (L176). The dispatcher answers the last two first (its `phases` and actor
 * checks); this is the free-action handlers' own check.
 */
export function freeActionWindowError(game: PublicCore, viewerId: PlayerId, actionType: GameActionType): GameRuleError | null {
  if (freeActionWindowOf(game, viewerId) !== null) {
    return null;
  }
  const phase = game.phase;
  if (phase.type === "work_turn" && phase.activePlayerId === viewerId) {
    return workerActionInProgress(game, actionType);
  }
  if (phase.type === "work_turn" || phase.type === "orders") {
    return ruleError("NOT_YOUR_DECISION", "Free actions are taken only on your own turn.", { playerId: viewerId });
  }
  return ruleError("WRONG_PHASE", "Free actions are taken before or after your worker action, or in your Order Phase turn.", {
    phase: phase.type,
    actionType,
  });
}

/**
 * `WORKER_ACTION_IN_PROGRESS` for the active player in a Work sub-step (rev. 5 L170). The Colour
 * Samples swap's Select (`colour_samples_swap`) is no worker action: it may be open before the
 * worker is placed (`returnTo: "before_action"`) or after it. There the error names the Tech
 * (`techId`), and the message asks the player to finish that Select first, not a worker action.
 */
export function workerActionInProgress(game: PublicCore, actionType: GameActionType): GameRuleError {
  const phase = game.phase;
  const details: GameRuleError["details"] = { phase: phase.type, actionType };
  if (phase.type === "work_turn") {
    details["step"] = phase.step.kind;
    if (phase.step.kind === "colour_samples_swap") {
      details["techId"] = COLOUR_SAMPLES;
      return ruleError(
        "WORKER_ACTION_IN_PROGRESS",
        "Finish the Colour Samples Select first: this can be done before or after it, not during it.",
        details,
      );
    }
  }
  return ruleError("WORKER_ACTION_IN_PROGRESS", "Finish your worker action first: this can be done before or after it, not during it.", details);
}

/**
 * Imperial Priority may be spent now, window aside (rev. 5 L174, L314, R10): the token is held,
 * the Imperial Kiln has been gained and is empty (a ceramic loaded in an earlier Order Phase may
 * still wait there, I3), and the player has at least 1 Shaped vessel. All public facts.
 */
export function imperialPriorityUsable(game: PublicCore, playerId: PlayerId): boolean {
  const imperial = player(game, playerId).imperial;
  return (
    imperial.priority === "held" &&
    imperial.kilnGained &&
    imperialKilnCeramic(game, playerId) === null &&
    ceramicsOf(game, playerId, "shaped").length > 0
  );
}

/**
 * The Colour Samples swap may be offered now, window aside (rev. 5 L632): T10 owned and unused
 * this round, and at least 1 held Order. Both facts are public (the hand count is public); the
 * hand's content, its Starting/Main mix and the Main supply are deliberately ignored, so offering
 * the window reveals nothing (DESIGN §4.5). Whether a particular discard works is the validator's.
 */
export function colourSamplesSwapUsable(game: PublicGameState, playerId: PlayerId): boolean {
  return techReady(player(game, playerId), COLOUR_SAMPLES) && (lookup(game.counts.orderHands, playerId) ?? 0) > 0;
}

/**
 * The player's sellable ceramics, window aside (rev. 5 L172, L300, L302): their Finished Flawed
 * ceramics, in ceramic sequence order. A ceramic still in a kiln is never sold: ceramics fired
 * this round become available only after the firing (L176).
 */
export function sellableFlawed(game: PublicCore, playerId: PlayerId): CeramicId[] {
  return ceramicsOf(game, playerId, "finished")
    .filter((c) => c.quality === "flawed")
    .map((c) => c.id)
    .sort((a, b) => ceramicSequence(a) - ceramicSequence(b));
}

/**
 * The after-action window has something to offer (I2), on public facts only (DESIGN §4.5): the
 * Colour Samples swap, Imperial Priority, a Finished Flawed ceramic to sell, or a completion
 * that public facts cannot rule out (at least 1 held Order and at least 1 Finished ceramic that
 * is not Flawed). Two hands of the same size always give the same answer.
 */
export function afterActionWindowOpen(game: PublicGameState, playerId: PlayerId): boolean {
  if (colourSamplesSwapUsable(game, playerId) || imperialPriorityUsable(game, playerId) || sellableFlawed(game, playerId).length > 0) {
    return true;
  }
  const handCount = lookup(game.counts.orderHands, playerId) ?? 0;
  return handCount > 0 && ceramicsOf(game, playerId, "finished").some((c) => c.quality !== "flawed");
}

/** The public view of an authoritative state (no `hidden`, with the public counts), for the
 * public-fact predicates above. Shares the state's objects: read only. */
export function publicGameOf(state: GameState): PublicGameState {
  const { hidden: _hidden, ...core } = state;
  return { ...core, counts: publicCounts(state) };
}
