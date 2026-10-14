/**
 * Protective Saggars, Second Firing (+R7 Jun), Ge, salvage and finishing the firing (Appendix D steps 10–12).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P5.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "../errors.ts";
import type {
  ActionHandlerTable,
  AfterQualityOption,
  GameAction,
  GameState,
  PlayerId,
  PlayerView,
  ResolveContext,
  SalvageOptions,
} from "../types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`firing/afterQuality.${name}`);
}

export function openAfterQuality(_draft: GameState, _ctx: ResolveContext): void {
  return notImplemented("openAfterQuality");
}

export function resolveSecondFiringJun(
  _draft: GameState,
  _actorId: PlayerId,
  _adjustment: Extract<GameAction, { type: "RESOLVE_JUN" }>["adjustment"],
  _ctx: ResolveContext,
): void {
  return notImplemented("resolveSecondFiringJun");
}

export function finishFiring(_draft: GameState, _ctx: ResolveContext): void {
  return notImplemented("finishFiring");
}

export function afterQualityOptions(_view: PlayerView): AfterQualityOption[] {
  return notImplemented("afterQualityOptions");
}

export function salvageOptions(_view: PlayerView): SalvageOptions | null {
  return notImplemented("salvageOptions");
}

export const handlers: Pick<ActionHandlerTable, "USE_PROTECTIVE_SAGGARS" | "USE_SECOND_FIRING" | "USE_GE_CRACKLE" | "END_AFTER_QUALITY" | "SALVAGE_FLAWED"> = {
  USE_PROTECTIVE_SAGGARS: {
    phases: ["firing_after_quality"],
    validate: () => notImplemented("USE_PROTECTIVE_SAGGARS.validate"),
    resolve: () => notImplemented("USE_PROTECTIVE_SAGGARS.resolve"),
  },
  USE_SECOND_FIRING: {
    phases: ["firing_after_quality"],
    validate: () => notImplemented("USE_SECOND_FIRING.validate"),
    resolve: () => notImplemented("USE_SECOND_FIRING.resolve"),
  },
  USE_GE_CRACKLE: {
    phases: ["firing_after_quality"],
    validate: () => notImplemented("USE_GE_CRACKLE.validate"),
    resolve: () => notImplemented("USE_GE_CRACKLE.resolve"),
  },
  END_AFTER_QUALITY: {
    phases: ["firing_after_quality"],
    validate: () => notImplemented("END_AFTER_QUALITY.validate"),
    resolve: () => notImplemented("END_AFTER_QUALITY.resolve"),
  },
  SALVAGE_FLAWED: {
    phases: ["firing_salvage"],
    validate: () => notImplemented("SALVAGE_FLAWED.validate"),
    resolve: () => notImplemented("SALVAGE_FLAWED.resolve"),
  },
};
