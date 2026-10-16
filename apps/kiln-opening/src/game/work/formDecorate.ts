/**
 * Form & Decorate (L165–173, L321–340), incl. the Shifu's two-vessel Decoration discount
 * (L170), Large Throwing Wheel (T01, L615), Decorator's Kit (T16, L616) and Ding (L474, R1).
 *
 * Costs (L652: three separate reductions):
 * - Clay: each vessel's Shape cost (L321–327). Large Throwing Wheel, if used and at least 1
 *   Vase or Censer is formed, reduces the action's total Clay by 2, to a minimum of 0.
 * - Coins: each vessel's Decoration (2 Coins, L333–340). Forming 2 with the Shifu effect
 *   reduces one Decoration by 1 (automatic, DESIGN §3.7). Decorator's Kit, if used, reduces
 *   one Carved/Impressed/Painted Decoration by 1 and may hit the same Decoration as the
 *   Shifu discount (a Carved for 0).
 * - Ding: after forming a Bowl/Plate/Brush Washer, 1 Clay + 1 Coin for one more of the same
 *   Shape with any Decoration; outside the vessel limit and every discount (L474, L652); either
 *   worker type (R1).
 *
 * Placement legality (L172, R4, `canFormAny`): at least 1 single vessel is affordable after
 * every ready Workshop discount.
 *
 * Layer 4. Hands over through `ctx.flow.workerActionDone` (DESIGN §2.2).
 */

import { DECORATIONS, KILNS, LOCATIONS, SHAPES, TECHS, decorationCost, shapeClay } from "../content.ts";
import { invariant, ruleError } from "../errors.ts";
import { hasKiln, kilnAbilityReady, markKilnAbilityUsed } from "../kilns.ts";
import { placeWorker, validatePlacement, workerEffectFor } from "../placement.ts";
import { canAfford, formCeramic, lookup, player, spend } from "../state.ts";
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
  // Clay (L321–327) and Large Throwing Wheel (L615).
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

  // Decorations (L333–340), Decorator's Kit (L616) and the Shifu discount (L170).
  const remaining = vessels.map((vessel) => decorationCost(vessel.decoration));
  vessels.forEach((_, index) => {
    lines.push({ kind: "decoration", resource: "coins", amount: remaining[index] ?? 0, itemIndex: index });
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
    if (!TECHS.T16.params.decorations.includes(target.decoration)) {
      return failed(
        ruleError("INVALID_VESSEL_CHOICE", "Decorator's Kit reduces only a Carved, Impressed or Painted Decoration.", {
          vesselIndex: kitIndex,
          decoration: target.decoration,
          field: "decoratorsKitVesselIndex",
        }),
      );
    }
    const reduction = Math.min(TECHS.T16.params.coinReduction, remaining[kitIndex] ?? 0);
    remaining[kitIndex] = (remaining[kitIndex] ?? 0) - reduction;
    lines.push({ kind: "decorators_kit", resource: "coins", amount: -reduction, itemIndex: kitIndex });
  }
  if (effect === "shifu" && vessels.length === 2) {
    // Automatic (DESIGN §3.7). Every Decoration costs the same, so which vessel takes it never
    // changes the total; it goes to the first vessel with Coins left to reduce.
    const discount = LOCATIONS.form_decorate.effects.shifu.twoVesselDecorationDiscount;
    const index = remaining.findIndex((cost) => cost > 0);
    if (index >= 0) {
      const reduction = Math.min(discount, remaining[index] ?? 0);
      remaining[index] = (remaining[index] ?? 0) - reduction;
      lines.push({ kind: "shifu_decoration_discount", resource: "coins", amount: -reduction, itemIndex: index });
    }
  }
  const vesselCost: ResourceState = { clay, wood: 0, coins: remaining.reduce((sum, cost) => sum + cost, 0) };

  // Ding (L474, R1): outside the vessel limit and every discount (L652).
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
 * The engine-computed cost of a Form & Decorate command (DESIGN §3.5, §5.4): Shape Clay,
 * Decorations, the Shifu −1 when forming 2, Decorator's Kit, Large Throwing Wheel and Ding.
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
 * L172 with R4: some single Shape × Decoration is affordable after every ready Workshop
 * discount — Large Throwing Wheel on a Vase/Censer, Decorator's Kit on a non-Plain
 * Decoration. Forming 2 is never cheaper than forming 1, so singles suffice; Ding needs a
 * vessel formed first, so it never makes the placement legal.
 */
export function canFormAny(game: PublicCore, playerId: PlayerId): boolean {
  const p = player(game, playerId);
  const wheel = techReady(p, LARGE_THROWING_WHEEL) ? TECHS.T01.params : null;
  const kit = techReady(p, DECORATORS_KIT) ? TECHS.T16.params : null;
  return SHAPES.some((shape: Shape) => {
    const baseClay = shapeClay(shape);
    const clay = wheel !== null && wheel.triggerShapes.includes(shape) ? Math.max(0, baseClay - wheel.clayReduction) : baseClay;
    return DECORATIONS.some((decoration) => {
      const baseCoins = decorationCost(decoration);
      const coins = kit !== null && kit.decorations.includes(decoration) ? Math.max(0, baseCoins - kit.coinReduction) : baseCoins;
      return canAfford(p.resources, { clay, coins });
    });
  });
}

function validate(view: ActorView, action: FormDecorateAction): GameRuleError | null {
  const placementError = validatePlacement(view, action.workerId, "form_decorate", false);
  if (placementError !== null) {
    return placementError;
  }
  if (!canFormAny(view.game, view.viewerId)) {
    return ruleError("NO_MAIN_ACTION_POSSIBLE", "You cannot pay the Clay and a Decoration for even 1 vessel.", {
      locationId: "form_decorate",
      workerId: action.workerId,
      effect: workerEffectFor(view, action.workerId, false),
    });
  }
  return quoteFormDecorate(view, action).error;
}

function resolve(draft: GameState, playerId: PlayerId, action: FormDecorateAction, ctx: ResolveContext): void {
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
    // Counts as formed by this action for effects that refer to it (L474).
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
