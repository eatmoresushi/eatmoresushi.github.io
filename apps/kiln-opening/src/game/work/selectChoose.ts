/**
 * `SELECT_CHOOSE`: the reservations of an open Select (v1.6.2 L80, change 25; the model is
 * `work/select.ts`). One command for every Select, continued by the step that opened it:
 *
 * - `commission_market` (v1.6.2 L225–228): the worker action ends (`ctx.flow.workerActionDone`);
 * - `colour_samples`, when acquired (v1.6.2 L632): the Guild Hall Shifu's inspection resumes, or
 *   the Apprentice's action ends (`guildHall.afterColourSamples`);
 * - `colour_samples_swap` (v1.6.2 L632, L656): back to the window the swap was used in, then
 *   `work/turn.afterWindowAbilityUsed`, which ends the turn after the worker action when the
 *   window has nothing left.
 *
 * "End the turn afterwards" (owner UI decision D21, `EndTurnRequest`; DELTA §16.24): in the two
 * worker-action Selects the request is recorded for `completeWorkerAction`
 * (`state.noteEndTurnRequest`; it overrides one made by the placement or an earlier take). In the
 * swap's Select it ends the turn after the swap, as `END_TURN` would, when the swap was used
 * after the worker action; when it was used before, `endTurn: true` is
 * `WORKER_ACTION_REQUIRED` (`endTurnRequestError`).
 *
 * Layer 4 (P4). Imports layers 0–3, the Select model, `work/guildHall` and `work/turn`; none of
 * them imports this module (no cycle).
 */

import { invariant, ruleError } from "../errors.ts";
import { endTurnRequestError } from "../freeActionWindow.ts";
import { noteEndTurnRequest, phaseAs, selectStep } from "../state.ts";
import type { ActionHandlerTable } from "../types.ts";
import { afterColourSamples } from "./guildHall.ts";
import { resolveSelectPicks, selectPicksError } from "./select.ts";
import { afterWindowAbilityUsed } from "./turn.ts";

export const handlers: Pick<ActionHandlerTable, "SELECT_CHOOSE"> = {
  SELECT_CHOOSE: {
    phases: ["work_turn"],
    validate: (view, action) => {
      const phase = view.game.phase;
      if (phase.type !== "work_turn") {
        return ruleError("WRONG_PHASE", "A Select is resolved during the Work Phase.", { phase: phase.type });
      }
      if (phase.activePlayerId !== view.viewerId) {
        return ruleError("NOT_YOUR_DECISION", "It is not your Work turn.", { playerId: view.viewerId });
      }
      const step = selectStep(view.game);
      if (step === null) {
        return ruleError("WRONG_PHASE", "No Select is due now.", { phase: phase.type, step: phase.step.kind });
      }
      return endTurnRequestError(view.game, view.viewerId, action) ?? selectPicksError(view, step.kind, step.select, action.reservations);
    },
    resolve: (draft, actorId, action, ctx) => {
      const phase = phaseAs(draft, "work_turn");
      invariant(phase.activePlayerId === actorId, `${actorId} is not the active player`);
      const step = selectStep(draft);
      invariant(step !== null, `Expected a Select step, found ${phase.step.kind}`);
      if (step.kind !== "colour_samples_swap") {
        noteEndTurnRequest(draft, actorId, action.endTurn);
      }
      const look = resolveSelectPicks(draft, actorId, step.kind, action.reservations, ctx);
      switch (step.kind) {
        case "commission_market":
          ctx.flow.workerActionDone(draft, actorId, ctx);
          return;
        case "colour_samples":
          invariant(look.kind === "colour_samples", "The Colour Samples Select lost its look");
          afterColourSamples(draft, actorId, step.resume, look.inspection, ctx);
          return;
        case "colour_samples_swap":
          phase.step = { kind: step.returnTo };
          afterWindowAbilityUsed(draft, actorId, ctx, action.endTurn === true);
          return;
        default: {
          const unknown: never = step;
          invariant(false, `Unknown Select step ${String(unknown)}`);
        }
      }
    },
  },
};
