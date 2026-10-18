/**
 * `SELECT_CHOOSE`: the reservations of an open Select (v1.6.2 L64, change 25; the model is
 * `work/select.ts`). One command for every Select, continued by the step that opened it:
 *
 * - `commission_market` (v1.6.2 L201–204): the worker action ends (`ctx.flow.workerActionDone`);
 * - `colour_samples`, when acquired (v1.6.2 L622): the Guild Hall Shifu's inspection resumes, or
 *   the Apprentice's action ends (`guildHall.afterColourSamples`);
 * - `colour_samples_swap` (v1.6.2 L622, L646): back to the window the swap was used in, then
 *   `work/turn.afterWindowAbilityUsed`, which ends the turn after the worker action when the
 *   window has nothing left.
 *
 * Layer 4 (P4). Imports layers 0–3, the Select model, `work/guildHall` and `work/turn`; none of
 * them imports this module (no cycle).
 */

import { invariant, ruleError } from "../errors.ts";
import { phaseAs, selectStep } from "../state.ts";
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
      return selectPicksError(view, step.kind, step.select, action.reservations);
    },
    resolve: (draft, actorId, action, ctx) => {
      const phase = phaseAs(draft, "work_turn");
      invariant(phase.activePlayerId === actorId, `${actorId} is not the active player`);
      const step = selectStep(draft);
      invariant(step !== null, `Expected a Select step, found ${phase.step.kind}`);
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
          afterWindowAbilityUsed(draft, actorId, ctx);
          return;
        default: {
          const unknown: never = step;
          invariant(false, `Unknown Select step ${String(unknown)}`);
        }
      }
    },
  },
};
