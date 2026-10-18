/**
 * Engine-level tables for the computer-player suites (P9): every seat is driven by a policy
 * that sees only `createComputerObservation(state, seat, privateFiring)`, exactly as the
 * service builds it. Contributions go through `submitContribution` with the table's
 * `PrivateFiringState`; everything else through `applyAction`. A policy that returns null,
 * throws or proposes an illegal command falls back to `fallbackComputerCommands`, as the
 * service does, and the table counts it.
 */

import {
  SeededRandom,
  applyAction,
  createGame,
  decisionPrompt,
  legalContributions,
  sampleLegalAction,
  submitContribution,
} from "../../../src/game/index.ts";
import type {
  ActorView,
  AuthoritativeCommand,
  GameState,
  PlayerCount,
  PlayerId,
  PrivateFiringState,
  SubmitContributionCommand,
} from "../../../src/game/index.ts";
import { createComputerObservation, fallbackComputerCommands } from "../../../src/multiplayer/index.ts";

export type SeatChooser = (view: ActorView) => AuthoritativeCommand | null;

export interface EngineTableOptions {
  seed: number;
  playerCount: PlayerCount;
  /** The chooser for each seat (`p1`…`pN`). */
  chooserFor: (playerId: PlayerId, seatIndex: number) => SeatChooser;
  maxCommands?: number;
  /**
   * Start from this state instead of `createGame` (e.g. the engine fuzz's `richStartState`,
   * whose seats already own a Tech per discipline). Its players must be `p1`…`pN`.
   */
  start?: GameState;
  /** Called before each decision with the observation the chooser receives. */
  observe?: (state: GameState, playerId: PlayerId, view: ActorView, privateFiring: PrivateFiringState) => void;
}

export interface EngineTableResult {
  state: GameState;
  commands: number;
  /** Decisions where the chooser's proposal was missing, threw or did not validate. */
  fallbacks: Array<{ playerId: PlayerId; phase: string; reason: string }>;
  /** Per-decision chooser time in ms. */
  decisionMs: number[];
}

function emptyPrivate(state: GameState): PrivateFiringState {
  return {
    gameId: state.gameId,
    windowId: state.phase.type === "firing_contributions" ? state.phase.windowId : null,
    submissions: {},
  };
}

/** Plays one complete game; throws if it does not reach `finished` within the bound. */
export function playEngineTable(options: EngineTableOptions): EngineTableResult {
  const rng = new SeededRandom(options.seed);
  const players = Array.from({ length: options.playerCount }, (_, seat) => ({ id: `p${seat + 1}`, displayName: `Seat ${seat + 1}` }));
  let state: GameState;
  if (options.start === undefined) {
    const created = createGame({ gameId: `p9-${options.seed}-${options.playerCount}`, players }, rng);
    if (!created.ok) throw new Error(`createGame failed: ${created.error.code}`);
    state = created.state;
  } else {
    state = structuredClone(options.start);
  }
  let privateFiring = emptyPrivate(state);
  const choosers = new Map(players.map((p, seat) => [p.id, options.chooserFor(p.id, seat)]));
  const fallbacks: EngineTableResult["fallbacks"] = [];
  const decisionMs: number[] = [];
  const maxCommands = options.maxCommands ?? 2_000;
  let commands = 0;
  while (state.phase.type !== "finished") {
    if (commands >= maxCommands) throw new Error(`Game ${options.seed} did not finish within ${maxCommands} commands (${state.phase.type})`);
    if (state.phase.type === "firing_contributions" && privateFiring.windowId !== state.phase.windowId) {
      privateFiring = emptyPrivate(state);
    }
    const actor = decisionPrompt(state).actorIds[0];
    if (actor === undefined) throw new Error(`No actor in ${state.phase.type}`);
    const view = createComputerObservation(state, actor, privateFiring) as ActorView;
    options.observe?.(state, actor, view, privateFiring);
    const chooser = choosers.get(actor);
    if (chooser === undefined) throw new Error(`No chooser for ${actor}`);
    let proposal: AuthoritativeCommand | null = null;
    let reason = "null proposal";
    const started = performance.now();
    try {
      proposal = chooser(view);
    } catch (cause) {
      reason = cause instanceof Error ? `threw ${cause.name}` : "threw";
    }
    decisionMs.push(performance.now() - started);
    const apply = (command: AuthoritativeCommand): boolean => {
      if (command.type === "SUBMIT_CONTRIBUTION") {
        const result = submitContribution(state, privateFiring, actor, command, rng);
        if (!result.ok) {
          reason = result.error.code;
          return false;
        }
        state = result.state;
        privateFiring = result.privateState;
        return true;
      }
      const result = applyAction(state, actor, command, rng);
      if (!result.ok) {
        reason = result.error.code;
        return false;
      }
      state = result.state;
      return true;
    };
    if (proposal !== null && apply(proposal)) {
      commands += 1;
      continue;
    }
    fallbacks.push({ playerId: actor, phase: state.phase.type, reason });
    const fallback = fallbackComputerCommands(view).find((candidate) => apply(candidate));
    if (fallback === undefined) throw new Error(`No legal fallback for ${actor} in ${state.phase.type}`);
    commands += 1;
  }
  return { state, commands, fallbacks, decisionMs };
}

/** The random baseline: `sampleLegalAction` (DESIGN §5.3), or a random affordable Contribution. */
export function randomChooser(seed: number): SeatChooser {
  const rng = new SeededRandom(seed);
  return (view) => {
    if (view.game.phase.type === "firing_contributions") {
      const options: SubmitContributionCommand[] = legalContributions(view);
      return options[rng.nextInt(options.length)] ?? null;
    }
    return sampleLegalAction(view, rng);
  };
}

/** Final VP and completed-Order counts per seat. */
export function finalSummary(state: GameState): Array<{ playerId: PlayerId; total: number; orders: number }> {
  const result = state.finalResult;
  if (result === null) throw new Error("The game has no final result");
  return state.playerOrder.map((playerId) => ({
    playerId,
    total: result.scores[playerId]?.total ?? 0,
    orders: state.players[playerId]?.completedOrders.length ?? 0,
  }));
}
