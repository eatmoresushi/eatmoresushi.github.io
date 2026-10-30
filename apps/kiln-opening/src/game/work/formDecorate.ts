/**
 * Form & Decorate (rev. 5 L197–205, L354, change 30), incl. the Shifu's two-vessel discount
 * (rev. 5 L202), Large Throwing Wheel (T01, rev. 5 L621), Decorator's Kit (T16, rev. 5 L622,
 * change 37) and Ding (rev. 5 L488, change 40, R1).
 *
 * Costs (rev. 5 L658: the Shifu's discount and Decorator's Kit are two separate reductions and
 * may apply to the same vessel):
 * - Clay: each vessel's Shape cost (L342–348). Large Throwing Wheel, if used and at least 1
 *   Vase or Censer is formed, reduces the action's total Clay by 2, to a minimum of 0.
 * - Coins: each vessel costs 2 Coins, whatever its Decoration (rev. 5 L201, L354; there is no
 *   Decoration cost table since change 30). Forming 2 with the Shifu effect makes one vessel
 *   cost 1 Coin less (automatic, DESIGN §3.7). Decorator's Kit, if used, makes any one vessel
 *   of the action cost 1 Coin less (change 37: Plain included) and may hit the same vessel as
 *   the Shifu discount (its 2 Coins become 0, rev. 5 L622, L658).
 * - Ding: after forming a Bowl/Plate/Brush Washer, 1 Clay + 2 Coins for one more of the same
 *   Shape with any Decoration (rev. 5 L488, change 40); outside the action's vessel limit, so
 *   the Shifu's "If you form 2" counts only the action's ordinary vessels (R29); either
 *   worker type (R1). Change 40 dropped the no-discount clause, but each reduction is once per
 *   action or round and the vessel that triggers Ding can always carry it, so the engine keeps
 *   the reductions on the ordinary vessels: the total and the affordability are the same
 *   wherever a reduction sits (R29).
 *
 * Placement legality (rev. 5 L204, `canFormAny`): the full cost of at least 1 vessel is
 * affordable after every reduction a ready Workshop Tech gives.
 *
 * Layer 4. Hands over through `ctx.flow.workerActionDone` (DESIGN §2.2), after recording the
 * command's `endTurn` (owner UI decision D21, `state.noteEndTurnRequest`; DELTA §16.24).
 */

import { DECORATIONS, KILNS, LOCATIONS, SHAPES, TECHS, shapeClay, vesselCoins } from "../content.ts";
import { invariant, ruleError } from "../errors.ts";
import { hasKiln, kilnAbilityReady, markKilnAbilityUsed } from "../kilns.ts";
import { placeWorker, validatePlacement, workerEffectFor } from "../placement.ts";
import { canAfford, formCeramic, lookup, noteEndTurnRequest, player, spend } from "../state.ts";
import { markTechUsed, ownsTech, techReady } from "../techs.ts";
import type {
  ActionHandlerTable,
  ActorView,
  CostLine,
  CostQuote,
  GameAction,
  GameRuleError,
  GameState,
  PlayerId,
  PlayerState,
  PublicCore,
  ResolveContext,
  ResourceState,
  Shape,
  TechId,
  WorkerEffect,
} from "../types.ts";

type FormDecorateAction = Extract<GameAction, { type: "PLACE_FORM_DECORATE" }>;

const LARGE_THROWING_WHEEL: TechId = "T01";
const DECORATORS_KIT: TechId = "T16";

function zero(): ResourceState {
  return { clay: 0, wood: 0, coins: 0 };
}

function techError(p: PlayerState, techId: TechId, field: string): GameRuleError | null {
  if (!ownsTech(p, techId)) {
    return ruleError("TECH_NOT_OWNED", `You do not own ${TECHS[techId].name}.`, { techId, field });
  }
  if (!techReady(p, techId)) {
    return ruleError("TECH_ALREADY_USED", `${TECHS[techId].name} has already been used this round.`, { techId, field });
  }
  return null;
}

/** The F&D action's cost split into the vessels' part and Ding's part (spent separately). */
interface FormDecorateCost {
  quote: CostQuote;
  vessels: ResourceState;
  ding: ResourceState;
}

function failed(error: GameRuleError, lines: CostLine[] = [], pay: ResourceState = zero()): FormDecorateCost {
  return { quote: { ok: false, error, pay, gain: zero(), lines }, vessels: zero(), ding: zero() };
}

function computeCost(game: PublicCore, playerId: PlayerId, action: FormDecorateAction, effect: WorkerEffect): FormDecorateCost {
  const p = player(game, playerId);
  const vessels = action.vessels;
  const maxVessels = LOCATIONS.form_decorate.effects[effect].maxVessels;
  if (vessels.length === 0) {
    return failed(
      ruleError("INVALID_CHOICE", "Form at least 1 vessel (\"up to\" means 1 or more, never 0).", { field: "vessels", value: 0 }),
    );
  }
  if (vessels.length > maxVessels) {
    return failed(
      ruleError("TOO_MANY_VESSELS", `This action forms at most ${maxVessels} vessel(s).`, {
        limit: maxVessels,
        count: vessels.length,
      }),
    );
  }
  for (const [index, vessel] of vessels.entries()) {
    if (!SHAPES.includes(vessel.shape) || !DECORATIONS.includes(vessel.decoration)) {
      return failed(
        ruleError("INVALID_VESSEL_CHOICE", "Unknown Shape or Decoration.", {
          vesselIndex: index,
          shape: String(vessel.shape),
          decoration: String(vessel.decoration),
        }),
      );
    }
  }

  const lines: CostLine[] = [];
  // Clay (L342–348) and Large Throwing Wheel (rev. 5 L621).
  let clay = 0;
  for (const [index, vessel] of vessels.entries()) {
    const amount = shapeClay(vessel.shape);
    clay += amount;
    lines.push({ kind: "shape_clay", resource: "clay", amount, itemIndex: index });
  }
  if (action.useLargeThrowingWheel === true) {
    const error = techError(p, LARGE_THROWING_WHEEL, "useLargeThrowingWheel");
    if (error !== null) {
      return failed(error);
    }
    const wheel = TECHS.T01.params;
    if (!vessels.some((vessel) => wheel.triggerShapes.includes(vessel.shape))) {
      return failed(
        ruleError("INVALID_CHOICE", "Large Throwing Wheel needs at least 1 Vase or Censer formed by this action.", {
          techId: LARGE_THROWING_WHEEL,
          field: "useLargeThrowingWheel",
        }),
      );
    }
    const reduction = Math.min(wheel.clayReduction, clay);
    clay -= reduction;
    lines.push({ kind: "large_throwing_wheel", resource: "clay", amount: -reduction, itemIndex: null });
  }

  // Each vessel's 2 Coins (rev. 5 L201, L354), Decorator's Kit on any vessel (rev. 5 L622,
  // change 37) and the Shifu discount (rev. 5 L202).
  const remaining = vessels.map(() => vesselCoins());
  vessels.forEach((_, index) => {
    lines.push({ kind: "vessel_coins", resource: "coins", amount: remaining[index] ?? 0, itemIndex: index });
  });
  const kitIndex = action.decoratorsKitVesselIndex;
  if (kitIndex !== undefined) {
    const error = techError(p, DECORATORS_KIT, "decoratorsKitVesselIndex");
    if (error !== null) {
      return failed(error);
    }
    const target = vessels[kitIndex];
    if (target === undefined) {
      return failed(
        ruleError("INVALID_VESSEL_CHOICE", "Decorator's Kit must name one of this action's vessels.", {
          vesselIndex: kitIndex,
          field: "decoratorsKitVesselIndex",
        }),
      );
    }
    const reduction = Math.min(TECHS.T16.params.coinReduction, remaining[kitIndex] ?? 0);
    remaining[kitIndex] = (remaining[kitIndex] ?? 0) - reduction;
    lines.push({ kind: "decorators_kit", resource: "coins", amount: -reduction, itemIndex: kitIndex });
  }
  if (effect === "shifu" && vessels.length === 2) {
    // Automatic (DESIGN §3.7). Every vessel costs the same, so which one takes it never
    // changes the total; it goes to the first vessel with Coins left to reduce. `vessels` are
    // the action's ordinary vessels: Ding's does not count toward the 2 (R29).
    const discount = LOCATIONS.form_decorate.effects.shifu.twoVesselDiscount;
    const index = remaining.findIndex((cost) => cost > 0);
    if (index >= 0) {
      const reduction = Math.min(discount, remaining[index] ?? 0);
      remaining[index] = (remaining[index] ?? 0) - reduction;
      lines.push({ kind: "shifu_discount", resource: "coins", amount: -reduction, itemIndex: index });
    }
  }
  const vesselCost: ResourceState = { clay, wood: 0, coins: remaining.reduce((sum, cost) => sum + cost, 0) };

  // Ding (rev. 5 L488, change 40, R1): 1 Clay + 2 Coins, outside the vessel limit. The
  // reductions stay on the ordinary vessels (R29): same total, same affordability.
  const dingCost = zero();
  const ding = action.dingExtra;
  if (ding !== undefined) {
    if (!hasKiln(p, "DI")) {
      return failed(ruleError("KILN_ABILITY_NOT_OWNED", "Only the Ding Kiln forms an extra vessel.", { kilnId: "DI", field: "dingExtra" }));
    }
    if (!kilnAbilityReady(p, "DI")) {
      return failed(ruleError("ABILITY_ALREADY_USED", "Ding has already been used this round.", { kilnId: "DI", field: "dingExtra" }));
    }
    const copied = vessels[ding.copyOfVesselIndex];
    const dingParams = KILNS.DI.params;
    if (copied === undefined || !dingParams.shapes.includes(copied.shape)) {
      return failed(
        ruleError("INVALID_VESSEL_CHOICE", "Ding copies a Bowl, Plate or Brush Washer formed by this action.", {
          vesselIndex: ding.copyOfVesselIndex,
          ...(copied === undefined ? {} : { shape: copied.shape }),
          field: "dingExtra.copyOfVesselIndex",
        }),
      );
    }
    if (!DECORATIONS.includes(ding.decoration)) {
      return failed(
        ruleError("INVALID_VESSEL_CHOICE", "Unknown Decoration.", { decoration: String(ding.decoration), field: "dingExtra.decoration" }),
      );
    }
    dingCost.clay = dingParams.clay;
    dingCost.coins = dingParams.coins;
    lines.push({ kind: "ding_extra", resource: "clay", amount: dingParams.clay, itemIndex: null });
    lines.push({ kind: "ding_extra", resource: "coins", amount: dingParams.coins, itemIndex: null });
  }

  const pay: ResourceState = {
    clay: vesselCost.clay + dingCost.clay,
    wood: 0,
    coins: vesselCost.coins + dingCost.coins,
  };
  for (const resource of ["clay", "coins"] as const) {
    if (p.resources[resource] < pay[resource]) {
      return failed(
        ruleError("INSUFFICIENT_RESOURCES", `Not enough ${resource}: you need ${pay[resource]} and have ${p.resources[resource]}.`, {
          resource,
          needed: pay[resource],
          have: p.resources[resource],
        }),
        lines,
        pay,
      );
    }
  }
  return { quote: { ok: true, error: null, pay, gain: zero(), lines }, vessels: vesselCost, ding: dingCost };
}

/**
 * The engine-computed cost of a Form & Decorate command (DESIGN §3.5, §5.4): Shape Clay, each
 * vessel's 2 Coins, the Shifu −1 when forming 2, Decorator's Kit, Large Throwing Wheel and Ding.
 * `lines` itemise every amount; `itemIndex` points into `vessels` (Ding's vessel: null).
 */
export function quoteFormDecorate(view: ActorView, action: FormDecorateAction): CostQuote {
  const p = player(view.game, view.viewerId);
  if (lookup(p.workers, action.workerId) === undefined) {
    return failed(ruleError("WORKER_UNAVAILABLE", "That worker is not available.", { workerId: action.workerId })).quote;
  }
  return computeCost(view.game, view.viewerId, action, workerEffectFor(view, action.workerId, false)).quote;
}

/**
 * rev. 5 L204 ("the full cost of at least 1 vessel, after any reductions"): some single Shape is
 * affordable after every reduction a ready Workshop Tech gives — Large Throwing Wheel on a
 * Vase/Censer, Decorator's Kit on any vessel (rev. 5 L622, change 37). Every Decoration costs
 * the same 2 Coins. Forming 2 is never cheaper than forming 1 (the Shifu's −1 needs a second
 * vessel at full price), so singles suffice; Ding needs a vessel formed first, so it never
 * makes the placement legal.
 */
export function canFormAny(game: PublicCore, playerId: PlayerId): boolean {
  const p = player(game, playerId);
  const wheel = techReady(p, LARGE_THROWING_WHEEL) ? TECHS.T01.params : null;
  const kit = techReady(p, DECORATORS_KIT) ? TECHS.T16.params : null;
  const baseCoins = vesselCoins();
  const coins = kit !== null ? Math.max(0, baseCoins - kit.coinReduction) : baseCoins;
  return SHAPES.some((shape: Shape) => {
    const baseClay = shapeClay(shape);
    const clay = wheel !== null && wheel.triggerShapes.includes(shape) ? Math.max(0, baseClay - wheel.clayReduction) : baseClay;
    return canAfford(p.resources, { clay, coins });
  });
}

function validate(view: ActorView, action: FormDecorateAction): GameRuleError | null {
  const placementError = validatePlacement(view, action.workerId, "form_decorate", false);
  if (placementError !== null) {
    return placementError;
  }
  if (!canFormAny(view.game, view.viewerId)) {
    return ruleError("NO_MAIN_ACTION_POSSIBLE", "You cannot pay the full cost of even 1 vessel, after any reductions.", {
      locationId: "form_decorate",
      workerId: action.workerId,
      effect: workerEffectFor(view, action.workerId, false),
    });
  }
  return quoteFormDecorate(view, action).error;
}

function resolve(draft: GameState, playerId: PlayerId, action: FormDecorateAction, ctx: ResolveContext): void {
  noteEndTurnRequest(draft, playerId, action.endTurn);
  const placement = placeWorker(draft, playerId, action.workerId, "form_decorate", false, ctx);
  const cost = computeCost(draft, playerId, action, placement.effect);
  invariant(cost.quote.ok, "Form & Decorate command must be validated first");
  if (action.useLargeThrowingWheel === true) {
    markTechUsed(draft, playerId, LARGE_THROWING_WHEEL, ctx);
  }
  if (action.decoratorsKitVesselIndex !== undefined) {
    markTechUsed(draft, playerId, DECORATORS_KIT, ctx);
  }
  spend(draft, playerId, cost.vessels, "form_decorate", ctx);
  for (const vessel of action.vessels) {
    formCeramic(draft, playerId, vessel.shape, vessel.decoration, "form_decorate", ctx);
  }
  const ding = action.dingExtra;
  if (ding !== undefined) {
    const copied = action.vessels[ding.copyOfVesselIndex];
    invariant(copied !== undefined, "Ding must copy a vessel of this action");
    markKilnAbilityUsed(draft, playerId, ctx);
    spend(draft, playerId, cost.ding, "ding_extra", ctx);
    // Counts as formed by this action for effects that refer to it (rev. 5 L488).
    formCeramic(draft, playerId, copied.shape, ding.decoration, "ding_extra", ctx);
  }
  ctx.flow.workerActionDone(draft, playerId, ctx);
}

export const handlers: Pick<ActionHandlerTable, "PLACE_FORM_DECORATE"> = {
  PLACE_FORM_DECORATE: {
    phases: ["work_turn"],
    validate,
    resolve,
  },
};
