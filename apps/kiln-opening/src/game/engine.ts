/**
 * The dispatcher (DESIGN §2.5): `createGame`, `validateAction`, `applyAction`,
 * `submitContribution`, the handler table and the production flow wiring.
 *
 * - `validateAction(view, action)` is the single legality function. The UI,
 *   `legalActions`, the computer player and `applyAction` all call it, so nothing a client
 *   is offered can be rejected for a reason the client could not see.
 * - Resolvers mutate a private clone; a failed command never changes the input state.
 * - Phase hand-overs go through `ctx.flow` (DESIGN §2.2). Production wiring is `FLOW`;
 *   tests may replace it through `EngineOptions.flow`.
 *
 * Layer 6.
 */

import { fail, ruleError } from "./errors.ts";
import { handlers as afterQualityHandlers } from "./firing/afterQuality.ts";
import { applyContribution, openFiringPhase, validateContribution } from "./firing/contributions.ts";
import { handlers as pipelineHandlers } from "./firing/pipeline.ts";
import { handlers as freeActionHandlers } from "./freeActions.ts";
import { assertInvariants } from "./invariants.ts";
import { handlers as orderPhaseHandlers, openOrderPhase } from "./orders/phase.ts";
import { handlers as roundHandlers, openCleanup, startRound } from "./round.ts";
import { finishGame } from "./scoring.ts";
import { createInitialState, handlers as setupHandlers } from "./setup.ts";
import { cloneState, decisionPrompt, isSeated, lookup } from "./state.ts";
import { actorViewOf } from "./view.ts";
import { handlers as centralSimpleHandlers } from "./work/centralSimple.ts";
import { handlers as commissionMarketHandlers } from "./work/commissionMarket.ts";
import { handlers as formDecorateHandlers } from "./work/formDecorate.ts";
import { handlers as glazeLoadHandlers } from "./work/glazeLoad.ts";
import { handlers as guildHallHandlers } from "./work/guildHall.ts";
import { handlers as materialsYardHandlers } from "./work/materialsYard.ts";
import { handlers as selectChooseHandlers } from "./work/selectChoose.ts";
import { completeWorkerAction, handlers as turnHandlers, openWorkPhase } from "./work/turn.ts";
import { handlers as windowAbilitiesHandlers } from "./work/windowAbilities.ts";
import type {
  ActionHandler,
  ActionHandlerTable,
  ActorView,
  ApplyResult,
  CreateGameInput,
  CreateGameResult,
  EngineOptions,
  FlowController,
  FlowMilestone,
  GameAction,
  GameEvent,
  GameRuleError,
  GameState,
  PlayerId,
  PrivateFiringState,
  RandomSource,
  ResolveContext,
  SubmitContributionCommand,
  SubmitContributionResult,
} from "./types.ts";

// ── Handler table ────────────────────────────────────────────────────────────────────

/** Every module's `Pick<ActionHandlerTable, …>`, in DESIGN §2.1 order. */
const HANDLER_PARTS = [
  setupHandlers,
  roundHandlers,
  materialsYardHandlers,
  formDecorateHandlers,
  glazeLoadHandlers,
  centralSimpleHandlers,
  turnHandlers,
  commissionMarketHandlers,
  guildHallHandlers,
  selectChooseHandlers,
  windowAbilitiesHandlers,
  pipelineHandlers,
  afterQualityHandlers,
  orderPhaseHandlers,
  freeActionHandlers,
] as const;

/** The action types that more than one module claims; must be `never`. */
type Overlap<Parts extends readonly unknown[], Seen = never> = Parts extends readonly [infer Head, ...infer Rest]
  ? (keyof Head & Seen) | Overlap<Rest, Seen | keyof Head>
  : never;
const _noDuplicateHandlers: [Overlap<typeof HANDLER_PARTS>] extends [never] ? true : never = true;
void _noDuplicateHandlers;

/** One handler per action type. A missing type fails the annotation; a duplicate fails
 * `_noDuplicateHandlers`. */
export const HANDLERS: ActionHandlerTable = {
  ...setupHandlers,
  ...roundHandlers,
  ...materialsYardHandlers,
  ...formDecorateHandlers,
  ...glazeLoadHandlers,
  ...centralSimpleHandlers,
  ...turnHandlers,
  ...commissionMarketHandlers,
  ...guildHallHandlers,
  ...selectChooseHandlers,
  ...windowAbilitiesHandlers,
  ...pipelineHandlers,
  ...afterQualityHandlers,
  ...orderPhaseHandlers,
  ...freeActionHandlers,
};

function handlerFor(type: string): ActionHandler<GameAction> | null {
  const handler = lookup(HANDLERS as unknown as { readonly [type: string]: ActionHandler<GameAction> }, type);
  return handler ?? null;
}

// ── Flow wiring ──────────────────────────────────────────────────────────────────────

/** The opener each milestone hands over to (DESIGN §2.5). */
export const FLOW_OPENERS: { readonly [M in FlowMilestone]: (draft: GameState, ctx: ResolveContext) => void } = {
  setup_done: startRound,
  round_start_done: openWorkPhase,
  work_phase_done: openFiringPhase,
  firing_done: openOrderPhase,
  order_phase_done: openCleanup,
  cleanup_done: startRound,
  game_over: finishGame,
};

/** The production flow controller (DESIGN §2.5). */
export const FLOW: FlowController = {
  continueAfter(milestone, draft, ctx) {
    FLOW_OPENERS[milestone](draft, ctx);
  },
  workerActionDone(draft, playerId, ctx) {
    completeWorkerAction(draft, playerId, ctx);
  },
};

// ── Public API ───────────────────────────────────────────────────────────────────────

/** `setup.createInitialState`; the creation events are persisted, so `eventSequence`
 * starts at their count (DESIGN §2.5, §4.6). */
export function createGame(input: CreateGameInput, rng: RandomSource, options: EngineOptions = {}): CreateGameResult {
  const result = createInitialState(input, rng);
  if (!result.ok) {
    return result;
  }
  result.state.eventSequence = result.events.length;
  if (options.checkInvariants === true) {
    assertInvariants(result.state);
  }
  return result;
}

/**
 * The single legality function (DESIGN §2.5): game over, seat, phase, actor, then the
 * action's own validator. Never consumes randomness; never mutates the view.
 */
export function validateAction(view: ActorView, action: GameAction): GameRuleError | null {
  const game = view.game;
  if (game.phase.type === "finished") {
    return ruleError("GAME_FINISHED", "The game is over.", {});
  }
  if (typeof view.viewerId !== "string" || !isSeated(game, view.viewerId) || view.own === null) {
    return ruleError("UNKNOWN_PLAYER", "You are not seated in this game.", { playerId: String(view.viewerId) });
  }
  const handler = handlerFor(action.type);
  if (handler === null) {
    return ruleError("MALFORMED_ACTION", "Unknown action type.", { field: "type" });
  }
  if (!handler.phases.includes(game.phase.type)) {
    return ruleError("WRONG_PHASE", "That action is not available in this phase.", {
      phase: game.phase.type,
      actionType: action.type,
    });
  }
  if (!decisionPrompt(game).actorIds.includes(view.viewerId)) {
    return ruleError("NOT_YOUR_DECISION", "It is not your decision.", { playerId: view.viewerId });
  }
  return handler.validate(view, action);
}

function unknownPlayer(actorId: PlayerId): GameRuleError {
  return ruleError("UNKNOWN_PLAYER", "You are not seated in this game.", { playerId: actorId });
}

function finalise(draft: GameState, events: readonly GameEvent[], options: EngineOptions): void {
  draft.revision += 1;
  draft.eventSequence += events.length;
  if (options.checkInvariants === true) {
    assertInvariants(draft);
  }
}

/** Validates on the actor's view, then resolves on a clone of the authoritative state. */
export function applyAction(
  state: GameState,
  actorId: PlayerId,
  action: GameAction,
  rng: RandomSource,
  options: EngineOptions = {},
): ApplyResult {
  if (!isSeated(state, actorId)) {
    return fail(unknownPlayer(actorId));
  }
  const error = validateAction(actorViewOf(state, actorId), action);
  if (error !== null) {
    return fail(error);
  }
  const handler = handlerFor(action.type);
  if (handler === null) {
    return fail(ruleError("MALFORMED_ACTION", "Unknown action type.", { field: "type" }));
  }
  const draft = cloneState(state);
  const events: GameEvent[] = [];
  const ctx: ResolveContext = { rng, events, flow: options.flow ?? FLOW };
  handler.resolve(draft, actorId, action, ctx);
  finalise(draft, events, options);
  return { ok: true, state: draft, events };
}

/**
 * A secret Contribution (Appendix D steps 1–2). When the last eligible player submits,
 * `applyContribution` reveals, pays and continues into Base Heat and the steps after it;
 * the returned `privateState` then has `windowId: null`.
 */
export function submitContribution(
  state: GameState,
  privateState: PrivateFiringState,
  actorId: PlayerId,
  command: SubmitContributionCommand,
  rng: RandomSource,
  options: EngineOptions = {},
): SubmitContributionResult {
  if (!isSeated(state, actorId)) {
    return fail(unknownPlayer(actorId));
  }
  const phase = state.phase;
  if (phase.type === "finished") {
    return fail(ruleError("GAME_FINISHED", "The game is over.", {}));
  }
  // §2.5 step 1: with no Contribution window open (for example a late submission after the
  // last one revealed the window), the command's window is stale → PRIVATE_WINDOW_MISMATCH.
  if (
    phase.type !== "firing_contributions" ||
    command.windowId !== phase.windowId ||
    privateState.windowId !== phase.windowId ||
    privateState.gameId !== state.gameId
  ) {
    return fail(
      ruleError("PRIVATE_WINDOW_MISMATCH", "That Contribution is for a window that is not open.", {
        windowId: command.windowId,
      }),
    );
  }
  const error = validateContribution(actorViewOf(state, actorId, privateState), privateState, command);
  if (error !== null) {
    return fail(error);
  }
  const draft = cloneState(state);
  const privateDraft = structuredClone(privateState);
  const events: GameEvent[] = [];
  const ctx: ResolveContext = { rng, events, flow: options.flow ?? FLOW };
  applyContribution(draft, privateDraft, actorId, command, ctx);
  finalise(draft, events, options);
  return { ok: true, state: draft, privateState: privateDraft, events };
}
