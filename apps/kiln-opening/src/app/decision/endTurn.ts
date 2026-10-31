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
 * **The second button** is left out where the after-action step certainly will not open
 * (`afterActionMayOpen`): the selector's public answer (R27) is no, and what this action brings cannot
 * change it. That is said here once, over the viewer's public summary only (no hand), and a wrong "may
 * open" is the safe side: the button then ends the turn, as the engine does when the step has nothing
 * to offer. `test/v161/ui/decision/split_agrees_with_engine.test.ts` plays random games against it.
 */
import { endTurnOptions } from "../../game/index.ts";
import type { AuthoritativeCommand, EndTurnCommandType, EndTurnOptions } from "../../game/index.ts";
import { RULE_NUMBERS } from "../i18n/content.ts";
import type { EngineView, GameModel } from "../state/model.ts";
import { viewMemo } from "./work/context.ts";

/** Colour Samples: its swap is one of the things the after-action step opens on (R27). */
const COLOUR_SAMPLES = "T10";

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

/** What the worker action, or its last step, brings that the after-action step opens on (R27). */
export interface ActionBrings {
  /** An Order into the hand. */
  order?: boolean;
  /** A Shaped vessel (Form & Decorate, Prepared Clay at the Materials Yard). */
  vessel?: boolean;
  /** The Imperial Recognition it reaches (the Magistrate's Hall). */
  recognition?: number | null;
  /** The Colour Samples Tech. */
  colourSamples?: boolean;
}

/**
 * Whether the after-action step may open once this action is done. `afterActionWouldOpen` is the
 * public answer now; the action may still change the facts it reads, from the same public view:
 * - a held Order counts with a Finished ceramic (a Flawed one has already opened it) or a ready swap;
 * - a Shaped vessel or the Imperial Priority token counts with the other half of Imperial Priority;
 * - Colour Samples counts with a held Order.
 * Everything else a worker action does (Clay, Wood, Coins, a load, another Tech) cannot open it.
 */
export function afterActionMayOpen(model: GameModel, engine: EngineView, brings: ActionBrings = {}): boolean {
  if (endTurnOf(engine)?.afterActionWouldOpen === true) return true;
  const me = model.me;
  if (me === null) return false;
  if (brings.colourSamples === true && (me.orderHandCount > 0 || brings.order === true)) return true;
  if (brings.order === true && (me.finishedCeramicIds.length > 0 || me.techs.some((tech) => tech.techId === COLOUR_SAMPLES && tech.ready))) return true;
  const kilnEmpty = me.imperial.kilnGained && me.imperial.kilnCeramic === null;
  if (brings.vessel === true && me.imperial.priority === "held" && kilnEmpty) return true;
  return brings.recognition === RULE_NUMBERS.imperialPrioritySpace && kilnEmpty && me.shapedCeramicIds.length > 0;
}
