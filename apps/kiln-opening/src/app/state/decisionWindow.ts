/**
 * Decision windows (UI_V1.6.1_ARCHITECTURE §3.4). Frozen after phase A; changes go through B6.
 *
 * `decisionWindow(view)` maps the public phase to the one window the decision pane shows. It
 * is an exhaustive `switch` over `GamePhaseType` and `WorkTurnStep["kind"]`, so a new engine
 * phase or step fails `typecheck` here. It routes; it decides no rule: who acts comes from
 * `decisionPrompt`, and every choice comes from the window's selectors.
 *
 * Each window carries an `openKey` (§3.5). The draft store resets a window's draft when its
 * `kind` or `openKey` changes, and keeps (and revalidates) it otherwise:
 * - Kiln selection: the selection index;
 * - Setter's Mark and the queued firing steps (Test Pieces, Heat markers, Jun, after-Quality):
 *   the round and the queue index (plus the Test Pieces sub-step); Second Firing's choice: the
 *   round and the ceramic;
 * - the work turn and its sub-steps: the round, the active player and how many of their workers
 *   are placed (one per turn), plus the step (and, at the Guild Hall, how many Techs the Shifu
 *   has taken, so each take starts from a fresh draft);
 * - Contributions: the engine's `windowId`;
 * - Salvage and the hand trim: `openedAtRevision`;
 * - the Order Phase: the round and the turn index.
 *
 * The viewer who does not act sees `waiting` (B5's `Waiting.tsx`), and a finished game `final`.
 */

import { decisionPrompt } from "../../game/index.ts";
import type {
  CeramicId,
  DecisionMode,
  GamePhase,
  GamePhaseType,
  PlayerId,
  PlayerView,
  PublicGameState,
  TechDiscipline,
  WorkerEffect,
} from "../../game/index.ts";

/** Every window kind, in play order. */
export const DECISION_WINDOW_KINDS = [
  "kiln_selection",
  "setters_mark",
  "work",
  "commission",
  "guild_inspection",
  "colour_samples",
  "colour_samples_swap",
  "contributions",
  "test_pieces",
  "heat_markers",
  "jun",
  "after_quality",
  "second_firing",
  "salvage",
  "orders",
  "hand_limit",
  "final",
  "waiting",
] as const;

export type DecisionWindowKind = (typeof DECISION_WINDOW_KINDS)[number];

/** The kinds in which the viewer makes a decision (all but `final` and `waiting`). */
export type ActingWindowKind = Exclude<DecisionWindowKind, "final" | "waiting">;

interface WindowBase<K extends DecisionWindowKind> {
  kind: K;
  /** The engine phase this window belongs to. */
  phaseType: GamePhaseType;
  /** Who must act now (`decisionPrompt(game).actorIds`); the viewer is one of them in an acting window. */
  actorIds: readonly PlayerId[];
  mode: DecisionMode;
  /** Changes when the window opens anew (§3.5). */
  openKey: string;
}

export type DecisionWindow =
  | (WindowBase<"kiln_selection"> & { selectionIndex: number })
  | (WindowBase<"setters_mark"> & { queueIndex: number })
  | (WindowBase<"work"> & { step: "before_action" | "after_action" })
  | (WindowBase<"commission"> & {
      /** The placement's effect (Senior Apprentice gives an Apprentice the Shifu effect, R12). */
      effect: WorkerEffect;
      /** 2 or 3 (v1.6.2 L195–196). */
      lookSize: 2 | 3;
      /** 1 or 2; at least 1 is always required. */
      maxReservations: 1 | 2;
      /** Cards the private look shows (up to `lookSize`, possibly 0, B1). */
      lookedCount: number;
    })
  | (WindowBase<"guild_inspection"> & {
      discipline: TechDiscipline;
      /** Techs the Shifu has taken in this action so far (0 or 1; v1.6.2 L207). */
      takes: number;
    })
  | WindowBase<"colour_samples">
  | (WindowBase<"colour_samples_swap"> & {
      /** The work step the swap was used in, and returns to (v1.6.2 L617). */
      returnTo: "before_action" | "after_action";
    })
  | (WindowBase<"contributions"> & { windowId: string })
  | (WindowBase<"test_pieces"> & { awaiting: "decision" | "bury"; queueIndex: number })
  | WindowBase<"heat_markers"> & { queueIndex: number }
  | (WindowBase<"jun"> & { queueIndex: number })
  | (WindowBase<"after_quality"> & { queueIndex: number })
  | (WindowBase<"second_firing"> & {
      /** The ceramic Second Firing recalculates with the chosen card (v1.6.2 L639, R7). */
      ceramicId: CeramicId;
    })
  | (WindowBase<"salvage"> & { openedAtRevision: number })
  | (WindowBase<"orders"> & { index: number })
  | (WindowBase<"hand_limit"> & { openedAtRevision: number })
  | WindowBase<"final">
  | WindowBase<"waiting">;

/** The window of one kind. */
export type WindowOf<K extends DecisionWindowKind> = Extract<DecisionWindow, { kind: K }>;

/** The draft-store identity of a window: kind and open key (§3.5). */
export function windowDraftKey(window: DecisionWindow): string {
  return `${window.kind}|${window.openKey}`;
}

function placedWorkers(game: PublicGameState, playerId: PlayerId): number {
  const player = game.players[playerId];
  if (player === undefined) return 0;
  return Object.values(player.workers).filter((worker) => worker.placement !== null).length;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled decision window input: ${JSON.stringify(value)}`);
}

type Acting = Exclude<DecisionWindow, { kind: "final" | "waiting" }>;
type Base = Pick<WindowBase<DecisionWindowKind>, "phaseType" | "actorIds" | "mode">;

/** The window this phase opens for an acting viewer. Exhaustive over phases and steps. */
function actingWindow(game: PublicGameState, phase: Exclude<GamePhase, { type: "finished" }>, base: Base): Acting {
  const round = game.round;
  switch (phase.type) {
    case "setup_kiln_selection":
      return { ...base, kind: "kiln_selection", selectionIndex: phase.index, openKey: `select:${phase.index}` };
    case "round_start_setters_mark":
      return { ...base, kind: "setters_mark", queueIndex: phase.queue.index, openKey: `r${round}:q${phase.queue.index}` };
    case "work_turn": {
      const turn = `r${round}:${phase.activePlayerId}:p${placedWorkers(game, phase.activePlayerId)}`;
      const step = phase.step;
      switch (step.kind) {
        case "before_action":
        case "after_action":
          return { ...base, kind: "work", step: step.kind, openKey: `${turn}:${step.kind}` };
        case "commission_market":
          return {
            ...base,
            kind: "commission",
            effect: step.effect,
            lookSize: step.lookSize,
            maxReservations: step.maxReservations,
            lookedCount: step.lookedCount,
            openKey: `${turn}:commission`,
          };
        case "guild_inspection":
          return {
            ...base,
            kind: "guild_inspection",
            discipline: step.discipline,
            takes: step.takes.length,
            openKey: `${turn}:guild:${step.discipline}:t${step.takes.length}`,
          };
        case "colour_samples":
          return { ...base, kind: "colour_samples", openKey: `${turn}:colour_samples` };
        case "colour_samples_swap":
          return { ...base, kind: "colour_samples_swap", returnTo: step.returnTo, openKey: `${turn}:swap:${step.returnTo}` };
        default:
          return assertNever(step);
      }
    }
    case "firing_contributions":
      return { ...base, kind: "contributions", windowId: phase.windowId, openKey: phase.windowId };
    case "firing_test_pieces":
      return { ...base, kind: "test_pieces", awaiting: phase.awaiting, queueIndex: phase.queue.index, openKey: `r${round}:q${phase.queue.index}:${phase.awaiting}` };
    case "firing_heat_markers":
      return { ...base, kind: "heat_markers", queueIndex: phase.queue.index, openKey: `r${round}:q${phase.queue.index}` };
    case "firing_heat_adjustment":
      return { ...base, kind: "jun", queueIndex: phase.queue.index, openKey: `r${round}:q${phase.queue.index}` };
    case "firing_after_quality":
      return { ...base, kind: "after_quality", queueIndex: phase.queue.index, openKey: `r${round}:q${phase.queue.index}` };
    case "firing_second_firing_choice":
      return { ...base, kind: "second_firing", ceramicId: phase.ceramicId, openKey: `r${round}:second:${phase.ceramicId}` };
    case "firing_salvage":
      return { ...base, kind: "salvage", openedAtRevision: phase.openedAtRevision, openKey: `rev${phase.openedAtRevision}` };
    case "orders":
      return { ...base, kind: "orders", index: phase.index, openKey: `r${round}:t${phase.index}` };
    case "cleanup_hand_limit":
      return { ...base, kind: "hand_limit", openedAtRevision: phase.openedAtRevision, openKey: `rev${phase.openedAtRevision}` };
    default:
      return assertNever(phase);
  }
}

/** The window the decision pane shows for this view (§3.4). */
export function decisionWindow(view: PlayerView): DecisionWindow {
  const game = view.game;
  const phase = game.phase;
  const prompt = decisionPrompt(game);
  const base: Base = { phaseType: phase.type, actorIds: [...prompt.actorIds], mode: prompt.mode };
  if (phase.type === "finished") return { ...base, kind: "final", openKey: "final" };
  const viewer = view.viewerId;
  const seated = viewer !== null && view.own !== null && game.players[viewer] !== undefined;
  if (!seated || !prompt.actorIds.includes(viewer)) {
    return { ...base, kind: "waiting", openKey: `${phase.type}:${prompt.actorIds.join(",")}` };
  }
  return actingWindow(game, phase, base);
}

/** True when the viewer decides something in this window. */
export function isActingWindow(window: DecisionWindow): window is Acting {
  return window.kind !== "final" && window.kind !== "waiting";
}
