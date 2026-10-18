/**
 * Commission Market incl. Senior Apprentice (v1.6.2 L195–206, L395, L401, L644, L649; changes
 * 21, 24, 25; R12, B1, B3; DESIGN §3.2 as amended by ENGINE_V1.6.2_DELTA.md §4.2).
 *
 * - `PLACE_COMMISSION_MARKET` places the worker and always opens the Select (`work/select.ts`,
 *   v1.6.2 L64): Select 2 for the Apprentice effect, Select 3 reserving up to 2 for the Shifu
 *   effect (incl. Senior Apprentice, R12), the look as many cards as remain (B1). The look
 *   happens before any reservation is chosen (INT: Commission Market looks), so the step opens
 *   whatever the cards are.
 * - `SELECT_CHOOSE` (`work/selectChoose.ts`) then makes the reservations: exactly 1 (Apprentice
 *   effect) or 1–2 (Shifu effect), each a face-up Order or a looked card, in any mix (v1.6.2
 *   L201–204). The looked cards not reserved go face down to the bottom of the Main deck, in
 *   random order (change 24; owner ruling R19). No resource is gained.
 * - A face-up position stays empty until the turn ends (v1.6.2 L197, L395): both of a Shifu's
 *   reservations choose from the Orders showing now, and `work/turn.endTurn` refills once.
 * - Placement legality reads public counts only (`market.reservable`): a display Order or a
 *   non-empty deck plus discard, so at least 1 reservation always exists (L144, B1).
 * - Looked identities are private (B3): `PRIVATE_LOOK_OPENED.secret`, `ORDER_RESERVED.secret`
 *   and `LOOKED_ORDERS_TO_BOTTOM.secret`; public payloads carry counts and face-up IDs only.
 *
 * Layer 4 (P4). Imports layers 0–3 and the Select model; the reservation hands over through
 * `ctx.flow.workerActionDone` in `work/selectChoose.ts`.
 */

import { LOCATIONS } from "../content.ts";
import { invariant, ruleError } from "../errors.ts";
import { reservable } from "../market.ts";
import { placeWorker, validatePlacement, workerEffectFor } from "../placement.ts";
import { phaseAs } from "../state.ts";
import type { ActionHandlerTable, WorkerEffect } from "../types.ts";
import { openSelect } from "./select.ts";

const LOCATION = "commission_market";
const EFFECTS = LOCATIONS.commission_market.effects;

/** The printed Select of a worker effect (v1.6.2 L201–202): Select 2 with 1 reservation, or
 * Select 3 with up to 2. */
export function commissionLimits(effect: WorkerEffect): { n: 2 | 3; maxReservations: 1 | 2 } {
  const { select, maxReservations } = EFFECTS[effect];
  invariant(select === 2 || select === 3, `Unexpected Commission Select ${select}`);
  invariant(maxReservations === 1 || maxReservations === 2, `Unexpected reservation limit ${maxReservations}`);
  return { n: select, maxReservations };
}

// ── Handlers ─────────────────────────────────────────────────────────────────────────

export const handlers: Pick<ActionHandlerTable, "PLACE_COMMISSION_MARKET"> = {
  PLACE_COMMISSION_MARKET: {
    phases: ["work_turn"],
    validate: (view, action) => {
      const seniorApprentice = action.seniorApprentice === true;
      const placementError = validatePlacement(view, action.workerId, LOCATION, seniorApprentice);
      if (placementError !== null) {
        return placementError;
      }
      const supply = reservable(view.game);
      if (supply.faceUpSlots.length === 0 && !supply.supply) {
        return ruleError("NO_MAIN_ACTION_POSSIBLE", "There is no Main Order to reserve.", {
          locationId: LOCATION,
          workerId: action.workerId,
          effect: workerEffectFor(view, action.workerId, seniorApprentice),
        });
      }
      return null;
    },
    resolve: (draft, actorId, action, ctx) => {
      const placement = placeWorker(draft, actorId, action.workerId, LOCATION, action.seniorApprentice === true, ctx);
      const effect = placement.effect;
      const { n, maxReservations } = commissionLimits(effect);
      const select = openSelect(draft, actorId, "commission_market", n, maxReservations, ctx);
      phaseAs(draft, "work_turn").step = { kind: "commission_market", workerId: action.workerId, effect, select };
    },
  },
};
