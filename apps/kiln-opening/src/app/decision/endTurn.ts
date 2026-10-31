/**
 * "End the turn afterwards" (owner UI decision D21; ENGINE_V1.6.2_DELTA §16.24). Owner: B6.
 *
 * The confirming command of a worker action's last step, of a free action after the worker action
 * and of a free action in the Order Phase may carry `endTurn: true`, so that one command does what
 * the command and `END_TURN` (or `END_ORDER_TURN`) would, and the other players see one change.
 * Whether a command type accepts it now comes only from `endTurnOptions(view)`, which reads no
 * hand. The windows' `confirmSplit` (`state/draftStore.ts`) name the two buttons; `ConfirmBar`
 * sends the field through `withEndTurn`.
 *
 * The UI sends the choice on the action's last step, never earlier (a Commission Market or a
 * Guild Hall inspection placement has a plain Confirm). A request is only ever pending when a
 * step that may not be the last carried it (a Guild Hall take, a when-acquired Select with an
 * inspection behind it): the engine remembers it until the action ends, and "then free actions"
 * on a later step withdraws it with `endTurn: false` (`requested`).
 *
 * **The second button** is left out where the after-action step certainly will not open: the
 * engine's `afterActionMayOpen(view, brings)` (R27, public facts, no hand) says so, and
 * `windows.work.ts` says what each draft brings. A wrong "may open" is the safe side: the button
 * then ends the turn, as the engine does when the step has nothing to offer.
 * `test/v161/ui/decision/split_agrees_with_engine.test.ts` plays random games against it.
 */
import { endTurnOptions } from "../../game/index.ts";
import type { AuthoritativeCommand, EndTurnCommandType, EndTurnOptions } from "../../game/index.ts";
import type { EngineView } from "../state/model.ts";
import { viewMemo } from "./work/context.ts";

/** `endTurnOptions(view)`, once per view. */
export function endTurnOf(engine: EngineView): EndTurnOptions | null {
  return viewMemo(engine.view, "endTurnOptions", () => endTurnOptions(engine.view));
}

/** The command type accepts `endTurn: true` now (the selector says, never the hand). */
export function acceptsEndTurn(engine: EngineView, type: EndTurnCommandType): boolean {
  return endTurnOf(engine)?.commandTypes.includes(type) === true;
}

/** The command with the field set. Only for a type that takes it: `acceptsEndTurn` said so. */
export function withEndTurn(command: AuthoritativeCommand, endTurn: boolean): AuthoritativeCommand {
  return { ...command, endTurn } as AuthoritativeCommand;
}

/**
 * The secondary button's command: the command as it is ("the second omits it"), unless an earlier
 * step of this action asked to end the turn, which `endTurn: false` withdraws.
 */
export function stayCommand(command: AuthoritativeCommand, engine: EngineView): AuthoritativeCommand {
  return endTurnOf(engine)?.requested === true ? withEndTurn(command, false) : command;
}
