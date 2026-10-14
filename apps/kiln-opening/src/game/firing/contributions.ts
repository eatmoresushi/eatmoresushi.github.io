/**
 * Opening the Firing Phase and the secret Contribution window (L236–262, L670–674, change 16).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P5.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "../errors.ts";
import type {
  ActorView,
  GameRuleError,
  GameState,
  PlayerId,
  PlayerView,
  PrivateFiringState,
  ResolveContext,
  SubmitContributionCommand,
} from "../types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`firing/contributions.${name}`);
}

export function openFiringPhase(_draft: GameState, _ctx: ResolveContext): void {
  return notImplemented("openFiringPhase");
}

export function createPrivateFiringState(_state: GameState): PrivateFiringState {
  return notImplemented("createPrivateFiringState");
}

export function validateContribution(
  _view: ActorView,
  _privateState: PrivateFiringState,
  _command: SubmitContributionCommand,
): GameRuleError | null {
  return notImplemented("validateContribution");
}

export function applyContribution(
  _draft: GameState,
  _privateDraft: PrivateFiringState,
  _actorId: PlayerId,
  _command: SubmitContributionCommand,
  _ctx: ResolveContext,
): void {
  return notImplemented("applyContribution");
}

export function legalContributions(_view: PlayerView): SubmitContributionCommand[] {
  return notImplemented("legalContributions");
}
