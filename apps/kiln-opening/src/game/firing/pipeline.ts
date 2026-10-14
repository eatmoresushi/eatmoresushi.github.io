/**
 * Test Pieces, Heat markers, Fire reveal, Actual Heat, Jun and Quality (Appendix D steps 3–9).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P5.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "../errors.ts";
import type {
  ActionHandlerTable,
  GameState,
  HeatMarkerStepOptions,
  JunOptions,
  PlayerView,
  ResolveContext,
  TestPiecesOptions,
} from "../types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`firing/pipeline.${name}`);
}

export function openAfterBaseHeat(_draft: GameState, _ctx: ResolveContext): void {
  return notImplemented("openAfterBaseHeat");
}

export function heatMarkerStepOptions(_view: PlayerView): HeatMarkerStepOptions | null {
  return notImplemented("heatMarkerStepOptions");
}

export function testPiecesOptions(_view: PlayerView): TestPiecesOptions | null {
  return notImplemented("testPiecesOptions");
}

export function junOptions(_view: PlayerView): JunOptions | null {
  return notImplemented("junOptions");
}

export const handlers: Pick<ActionHandlerTable, "TEST_PIECES_DECIDE" | "TEST_PIECES_BURY" | "RESOLVE_HEAT_MARKERS" | "RESOLVE_JUN"> = {
  TEST_PIECES_DECIDE: {
    phases: ["firing_test_pieces"],
    validate: () => notImplemented("TEST_PIECES_DECIDE.validate"),
    resolve: () => notImplemented("TEST_PIECES_DECIDE.resolve"),
  },
  TEST_PIECES_BURY: {
    phases: ["firing_test_pieces"],
    validate: () => notImplemented("TEST_PIECES_BURY.validate"),
    resolve: () => notImplemented("TEST_PIECES_BURY.resolve"),
  },
  RESOLVE_HEAT_MARKERS: {
    phases: ["firing_heat_markers"],
    validate: () => notImplemented("RESOLVE_HEAT_MARKERS.validate"),
    resolve: () => notImplemented("RESOLVE_HEAT_MARKERS.resolve"),
  },
  RESOLVE_JUN: {
    phases: ["firing_heat_adjustment", "firing_second_firing_jun"],
    validate: () => notImplemented("RESOLVE_JUN.validate"),
    resolve: () => notImplemented("RESOLVE_JUN.resolve"),
  },
};
