/**
 * `haltingFlow` (DESIGN §8.1): a `FlowController` that records each cross-package hand-over
 * and leaves the draft exactly as the resolver left it, so a Phase 2 module can be tested
 * before the module it hands over to exists.
 *
 * `pass` lists hand-over points that should run the production wiring instead of halting
 * (e.g. halt at `work_phase_done` but let `worker_action_done` reach `work/turn`). A passed
 * hand-over keeps this controller in `ctx.flow`, so later hand-overs still halt or pass.
 */

import { FLOW } from "../../../../src/game/engine.ts";
import type { FlowController, FlowMilestone, PlayerId } from "../../../../src/game/types.ts";

export type FlowHalt =
  | { kind: "continue_after"; milestone: FlowMilestone }
  | { kind: "worker_action_done"; playerId: PlayerId };

export type HaltPoint = FlowMilestone | "worker_action_done";

export interface HaltingFlowOptions {
  pass?: readonly HaltPoint[];
}

export function haltingFlow(halts: FlowHalt[], options: HaltingFlowOptions = {}): FlowController {
  const pass = new Set<HaltPoint>(options.pass ?? []);
  return {
    continueAfter(milestone, draft, ctx) {
      if (pass.has(milestone)) {
        FLOW.continueAfter(milestone, draft, ctx);
        return;
      }
      halts.push({ kind: "continue_after", milestone });
    },
    workerActionDone(draft, playerId, ctx) {
      if (pass.has("worker_action_done")) {
        FLOW.workerActionDone(draft, playerId, ctx);
        return;
      }
      halts.push({ kind: "worker_action_done", playerId });
    },
  };
}
