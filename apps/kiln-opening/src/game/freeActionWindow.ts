/**
 * Free-action windows (rev. 5 L168–176; change 36; DELTA §16.5, §16.10.1): the public-fact
 * predicates every layer above shares.
 *
 * - **Where** (L170, L176): on your own turn before or after your worker action, not during it,
 *   and after the firing in turn order (your Order Phase turn). There are no free actions on
 *   other players' turns, during the firing, at Setup, in the Setter's Mark window or at Cleanup
 *   (R26: owner ruling R20's after-Quality and Cleanup sale windows are withdrawn).
 * - **What** (L172–174): sell a Finished Flawed ceramic (`sellableFlawed`), complete held Orders
 *   (`orders/completion.ts`), spend Imperial Priority (`imperialPriorityUsable`). Any number, in
 *   any order. The Colour Samples swap is a Work-turn before/after ability (L632), not a free
 *   action (R28).
 * - **The after-action window** (R27) is offered only while it has something to offer on public
 *   facts alone (DESIGN §4.5), so whether it opens reveals nothing about the hand
 *   (`afterActionWindowOpen`).
 * - **"End the turn afterwards"** (owner UI decision D21, DELTA §16.24): which commands take
 *   `endTurn` (`END_TURN_COMMAND_TYPES`) and where `endTurn: true` is refused
 *   (`endTurnRequestError`: before the worker action, the placement is still due).
 *
 * Layer 3: imports layers 0–2 only (`types`, `errors`, `state`, `techs`, `view`).
 */

import { ruleError } from "./errors.ts";
import { ceramicSequence, ceramicsOf, imperialKilnCeramic, lookup, player } from "./state.ts";
import { techReady } from "./techs.ts";
import type {
  CeramicId,
  EndTurnCommandType,
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
 * still wait there, R28), and the player has at least 1 Shaped vessel. All public facts.
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
 * The after-action window has something to offer (R27), on public facts only (DESIGN §4.5): the
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

// ── "End the turn afterwards" (owner UI decision D21; DELTA §16.24) ───────────────────

/** The commands that can finish a worker action (D21): they take `endTurn` in every step where
 * they are legal. */
export const WORKER_ACTION_END_TURN_TYPES = [
  "PLACE_MATERIALS_YARD",
  "PLACE_FORM_DECORATE",
  "PLACE_GLAZE_LOAD",
  "PLACE_COMMISSION_MARKET",
  "PLACE_GUILD_HALL",
  "PLACE_CANAL_WHARF",
  "PLACE_MAGISTRATES_HALL",
  "SELECT_CHOOSE",
  "GUILD_TAKE",
  "GUILD_FINISH",
] as const satisfies readonly EndTurnCommandType[];

/** The free actions (rev. 5 L172–174), which take `endTurn` after the worker action and in the
 * Order Phase, in `GameAction` declaration order. */
export const FREE_ACTION_END_TURN_TYPES = ["USE_IMPERIAL_PRIORITY", "SELL_FLAWED", "COMPLETE_ORDER"] as const satisfies readonly EndTurnCommandType[];

/** Every command type that takes `endTurn` (`EndTurnRequest`), in `GameAction` declaration
 * order. The compile-time check below keeps it equal to `EndTurnCommandType`. */
export const END_TURN_COMMAND_TYPES: readonly EndTurnCommandType[] = [...WORKER_ACTION_END_TURN_TYPES, ...FREE_ACTION_END_TURN_TYPES];

type ListedEndTurnType = (typeof WORKER_ACTION_END_TURN_TYPES)[number] | (typeof FREE_ACTION_END_TURN_TYPES)[number];
const _listsCoverEndTurnTypes: [Exclude<EndTurnCommandType, ListedEndTurnType>] extends [never] ? true : never = true;
void _listsCoverEndTurnTypes;

function isFreeActionType(type: EndTurnCommandType): boolean {
  return (FREE_ACTION_END_TURN_TYPES as readonly EndTurnCommandType[]).includes(type);
}

/**
 * Null unless `action` asks to end the turn (`endTurn: true`) where that would end it before the
 * worker action (D21): a free action in the before-action step, or the `SELECT_CHOOSE` of a
 * Colour Samples swap used there (`returnTo: "before_action"`). That is
 * `WORKER_ACTION_REQUIRED`, as `END_TURN` there is: a player may not pass (L165). Everywhere else
 * the request is accepted (worker-action commands, after the action, the Order Phase turn).
 * Reads only the phase and step (public); the handlers call it after their window checks.
 */
export function endTurnRequestError(game: PublicCore, viewerId: PlayerId, action: { type: EndTurnCommandType; endTurn?: boolean }): GameRuleError | null {
  const phase = game.phase;
  if (action.endTurn !== true || phase.type !== "work_turn" || phase.activePlayerId !== viewerId) {
    return null;
  }
  const step = phase.step;
  const beforeAction =
    (step.kind === "before_action" && isFreeActionType(action.type)) ||
    (step.kind === "colour_samples_swap" && step.returnTo === "before_action" && action.type === "SELECT_CHOOSE");
  if (!beforeAction) {
    return null;
  }
  return ruleError("WORKER_ACTION_REQUIRED", "You may not end your turn before your worker action: place 1 worker first.", {
    field: "endTurn",
    actionType: action.type,
    step: step.kind,
  });
}

/** The public view of an authoritative state (no `hidden`, with the public counts), for the
 * public-fact predicates above. Shares the state's objects: read only. */
export function publicGameOf(state: GameState): PublicGameState {
  const { hidden: _hidden, ...core } = state;
  return { ...core, counts: publicCounts(state) };
}
