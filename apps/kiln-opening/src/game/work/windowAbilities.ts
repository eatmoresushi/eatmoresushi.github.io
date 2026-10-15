/**
 * Canal Barge and Imperial Priority in the before/after-action window (L292, L433, L631, L646,
 * R6, R10, R11; DESIGN §3.2 step 1 and 3, §11 Q1).
 *
 * - Both are usable in `before_action` and `after_action`, in either order (INT: before/after
 *   window). Neither is a worker action (L646): Canal Barge records `via: "canal_barge"`,
 *   Imperial Priority loads with `loadedBy: "imperial_priority"`.
 * - Canal Barge (T23): once per round, complete 1 held Order with every completion effect —
 *   Ru, Guan, Tribute Ware and Crackle wildcards — through `orders/completion` (R6).
 * - Imperial Priority: once per game, free, glaze and load 1 Shaped vessel into your empty
 *   Imperial Kiln with a chosen public modifier (L292, R10, R11). Reworking Table may change
 *   the Shape first (DESIGN §11 Q1 default P1: allowed, using its once-per-round allowance).
 * - After each use `work/turn.afterWindowAbilityUsed` rechecks the window and ends the turn
 *   when nothing is left after the worker action.
 *
 * Layer 4 (P4). Imports layers 0–3 and `work/turn` (DESIGN §2.4).
 */

import { ruleError } from "../errors.ts";
import { imperialKilnEmpty, loadCeramic, validateLoads } from "../kilnLoading.ts";
import { resolveOrderCompletion, validateOrderCompletion } from "../orders/completion.ts";
import { emit, player } from "../state.ts";
import { markTechUsed, ownsTech, techReady } from "../techs.ts";
import type {
  ActionHandlerTable,
  ActorView,
  GameAction,
  GameRuleError,
  LoadSpec,
  OrderCompletionSpec,
  TechId,
} from "../types.ts";
import { afterWindowAbilityUsed } from "./turn.ts";

const CANAL_BARGE: TechId = "T23";

type CanalBargeAction = Extract<GameAction, { type: "USE_CANAL_BARGE" }>;
type ImperialPriorityAction = Extract<GameAction, { type: "USE_IMPERIAL_PRIORITY" }>;

/** The window is open: the active player's turn, before or after the worker action. */
function windowError(view: ActorView): GameRuleError | null {
  const phase = view.game.phase;
  if (phase.type !== "work_turn") {
    return ruleError("WRONG_PHASE", "This ability is used before or after a worker action.", { phase: phase.type });
  }
  if (phase.activePlayerId !== view.viewerId) {
    return ruleError("NOT_YOUR_DECISION", "It is not your Work turn.", { playerId: view.viewerId });
  }
  const step = phase.step.kind;
  if (step !== "before_action" && step !== "after_action") {
    return ruleError("WRONG_PHASE", "Finish your worker action first.", { phase: phase.type, step });
  }
  return null;
}

function completionSpec(action: CanalBargeAction): OrderCompletionSpec {
  const { type: _type, ...spec } = action;
  return spec;
}

/** The Imperial Priority load as a Glaze & Load `LoadSpec` into the Imperial Kiln. */
function imperialLoad(action: ImperialPriorityAction): LoadSpec {
  return {
    ceramicId: action.ceramicId,
    glaze: action.glaze,
    destination: { kiln: "imperial", imperialModifier: action.imperialModifier },
    ...(action.reworkShape === undefined ? {} : { reworkShape: action.reworkShape }),
  };
}

export const handlers: Pick<ActionHandlerTable, "USE_CANAL_BARGE" | "USE_IMPERIAL_PRIORITY"> = {
  USE_CANAL_BARGE: {
    phases: ["work_turn"],
    validate: (view, action) => {
      const error = windowError(view);
      if (error !== null) {
        return error;
      }
      const p = player(view.game, view.viewerId);
      if (!ownsTech(p, CANAL_BARGE)) {
        return ruleError("TECH_NOT_OWNED", "You do not own Canal Barge.", { techId: CANAL_BARGE });
      }
      if (!techReady(p, CANAL_BARGE)) {
        return ruleError("TECH_ALREADY_USED", "Canal Barge has already been used this round.", { techId: CANAL_BARGE });
      }
      return validateOrderCompletion(view, completionSpec(action));
    },
    resolve: (draft, actorId, action, ctx) => {
      markTechUsed(draft, actorId, CANAL_BARGE, ctx);
      resolveOrderCompletion(draft, actorId, completionSpec(action), "canal_barge", ctx);
      afterWindowAbilityUsed(draft, actorId, ctx);
    },
  },
  USE_IMPERIAL_PRIORITY: {
    phases: ["work_turn"],
    validate: (view, action) => {
      const error = windowError(view);
      if (error !== null) {
        return error;
      }
      const p = player(view.game, view.viewerId);
      if (p.imperial.priority !== "held") {
        return ruleError("IMPERIAL_PRIORITY_UNAVAILABLE", "You do not hold the Imperial Priority token.", {});
      }
      if (!imperialKilnEmpty(view.game, view.viewerId)) {
        return ruleError("IMPERIAL_KILN_UNAVAILABLE", "You have no Imperial Kiln, or it already holds a ceramic this firing.", {});
      }
      return validateLoads(view, [imperialLoad(action)], 1, "imperial_priority");
    },
    resolve: (draft, actorId, action, ctx) => {
      player(draft, actorId).imperial.priority = "spent";
      emit(ctx, { type: "IMPERIAL_PRIORITY_USED", playerId: actorId, ceramicId: action.ceramicId });
      // Reworking Table, if chosen, changes the Shape first and uses its allowance (Q1).
      loadCeramic(draft, actorId, imperialLoad(action), "imperial_priority", ctx);
      afterWindowAbilityUsed(draft, actorId, ctx);
    },
  },
};
