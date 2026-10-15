/**
 * Materials Yard (L158–163), incl. Senior Apprentice (T18, L619, R12) and Prepared Clay (T17,
 * L618).
 *
 * One atomic command resolved in this order (DESIGN §3.5), each step validated against the
 * running totals:
 * 1. gain the split: 3 (Apprentice effect) or 4 (Shifu effect) Clay/Wood in any mix (L162–163);
 * 2. `buyShifuBonus` (Shifu effect, optional): pay 1 Coin, gain +1 Clay +1 Wood (L163 "Then");
 * 3. `preparedClay` (optional, L618 "after gaining resources"): form 1 vessel paying its Clay
 *    cost +1 and a Decoration cost, so it may spend Clay gained in steps 1–2. A Tech effect,
 *    not a Form & Decorate action (L646): Ding, Large Throwing Wheel and the Shifu discount
 *    never apply. Decorator's Kit may reduce its Decoration (audit INT; unreachable under
 *    L211 because T16 and T17 are both Workshop Techs, but the branch is implemented).
 *
 * The main action (gain resources) is always possible, so placement legality is only the
 * shared placement check (L142).
 *
 * Layer 4. Hands over through `ctx.flow.workerActionDone` (DESIGN §2.2).
 */

import { LOCATIONS, TECHS, decorationCost, shapeClay } from "../content.ts";
import { invariant, ruleError } from "../errors.ts";
import { placeWorker, validatePlacement, workerEffectFor } from "../placement.ts";
import { formCeramic, gain, lookup, player, spend } from "../state.ts";
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
  ResourceKind,
  ResourceState,
  TechId,
  WorkerEffect,
} from "../types.ts";

type MaterialsYardAction = Extract<GameAction, { type: "PLACE_MATERIALS_YARD" }>;
type PreparedClaySpec = NonNullable<MaterialsYardAction["preparedClay"]>;

const PREPARED_CLAY: TechId = "T17";
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

function shortfall(resource: ResourceKind, needed: number, have: number): GameRuleError {
  return ruleError("INSUFFICIENT_RESOURCES", `Not enough ${resource}: you need ${needed} and have ${have}.`, {
    resource,
    needed,
    have,
  });
}

/** Prepared Clay's cost (L618): Clay cost +1 and the Decoration cost, less Decorator's Kit. */
function preparedClayCost(spec: PreparedClaySpec): { clay: number; coins: number; lines: CostLine[] } {
  const shapeCost = shapeClay(spec.shape);
  const surcharge = TECHS.T17.params.claySurcharge;
  const decoration = decorationCost(spec.decoration);
  const kit = spec.useDecoratorsKit === true ? Math.min(TECHS.T16.params.coinReduction, decoration) : 0;
  const lines: CostLine[] = [
    { kind: "shape_clay", resource: "clay", amount: shapeCost, itemIndex: null },
    { kind: "prepared_clay_surcharge", resource: "clay", amount: surcharge, itemIndex: null },
    { kind: "decoration", resource: "coins", amount: decoration, itemIndex: null },
  ];
  if (kit > 0) {
    lines.push({ kind: "decorators_kit", resource: "coins", amount: -kit, itemIndex: null });
  }
  return { clay: shapeCost + surcharge, coins: decoration - kit, lines };
}

function failed(error: GameRuleError, pay: ResourceState, gained: ResourceState, lines: CostLine[]): CostQuote {
  return { ok: false, error, pay, gain: gained, lines };
}

/**
 * The quote for a given worker effect. Steps run in the documented order against the running
 * totals; the first failing step's error is returned with the totals computed so far.
 */
function quoteFor(game: PublicCore, playerId: PlayerId, action: MaterialsYardAction, effect: WorkerEffect): CostQuote {
  const p = player(game, playerId);
  const running: ResourceState = { ...p.resources };
  const pay = zero();
  const gained = zero();
  const lines: CostLine[] = [];

  // 1. The split (L162–163).
  const total = LOCATIONS.materials_yard.effects[effect].resources;
  const validCount = (n: number) => Number.isSafeInteger(n) && n >= 0;
  if (!validCount(action.clay) || !validCount(action.wood) || action.clay + action.wood !== total) {
    return failed(
      ruleError("INVALID_RESOURCE_SPLIT", `Gain exactly ${total} Clay and Wood in total.`, {
        total,
        clay: action.clay,
        wood: action.wood,
      }),
      pay,
      gained,
      lines,
    );
  }
  running.clay += action.clay;
  running.wood += action.wood;
  gained.clay += action.clay;
  gained.wood += action.wood;

  // 2. The Shifu's optional 1-Coin bonus (L163, R12 incl. Senior Apprentice).
  if (action.buyShifuBonus === true) {
    if (effect !== "shifu") {
      return failed(
        ruleError("NOT_SHIFU_EFFECT", "Only the Shifu effect may buy +1 Clay +1 Wood.", {
          workerId: action.workerId,
          effect,
          locationId: "materials_yard",
          field: "buyShifuBonus",
        }),
        pay,
        gained,
        lines,
      );
    }
    const bonus = LOCATIONS.materials_yard.effects.shifu.bonus;
    if (running.coins < bonus.coins) {
      return failed(shortfall("coins", bonus.coins, running.coins), { ...pay, coins: pay.coins + bonus.coins }, gained, lines);
    }
    running.coins -= bonus.coins;
    pay.coins += bonus.coins;
    running.clay += bonus.clay;
    running.wood += bonus.wood;
    gained.clay += bonus.clay;
    gained.wood += bonus.wood;
  }

  // 3. Prepared Clay (L618), after gaining resources.
  const prepared = action.preparedClay;
  if (prepared !== undefined) {
    const tech = techError(p, PREPARED_CLAY, "preparedClay");
    if (tech !== null) {
      return failed(tech, pay, gained, lines);
    }
    if (prepared.useDecoratorsKit === true) {
      const kit = techError(p, DECORATORS_KIT, "preparedClay.useDecoratorsKit");
      if (kit !== null) {
        return failed(kit, pay, gained, lines);
      }
      if (!TECHS.T16.params.decorations.includes(prepared.decoration)) {
        return failed(
          ruleError("INVALID_VESSEL_CHOICE", "Decorator's Kit reduces only a Carved, Impressed or Painted Decoration.", {
            decoration: prepared.decoration,
            field: "preparedClay.useDecoratorsKit",
          }),
          pay,
          gained,
          lines,
        );
      }
    }
    const cost = preparedClayCost(prepared);
    lines.push(...cost.lines);
    pay.clay += cost.clay;
    pay.coins += cost.coins;
    if (running.clay < cost.clay) {
      return failed(shortfall("clay", cost.clay, running.clay), pay, gained, lines);
    }
    if (running.coins < cost.coins) {
      return failed(shortfall("coins", cost.coins, running.coins), pay, gained, lines);
    }
  }
  return { ok: true, error: null, pay, gain: gained, lines };
}

/**
 * The engine's cost and gain for a Materials Yard command (DESIGN §3.5, §5.4): split → Shifu
 * bonus → Prepared Clay, each validated against the running totals. `pay` holds the bonus
 * Coin and Prepared Clay's cost; `gain` holds the split and the bonus. `lines` itemise
 * Prepared Clay's cost (the bonus has no cost-line kind and shows in `pay`/`gain` only).
 */
export function quoteMaterialsYard(view: ActorView, action: MaterialsYardAction): CostQuote {
  const p = player(view.game, view.viewerId);
  if (lookup(p.workers, action.workerId) === undefined) {
    return failed(ruleError("WORKER_UNAVAILABLE", "That worker is not available.", { workerId: action.workerId }), zero(), zero(), []);
  }
  const effect = workerEffectFor(view, action.workerId, action.seniorApprentice === true);
  return quoteFor(view.game, view.viewerId, action, effect);
}

function validate(view: ActorView, action: MaterialsYardAction): GameRuleError | null {
  const placementError = validatePlacement(view, action.workerId, "materials_yard", action.seniorApprentice === true);
  if (placementError !== null) {
    return placementError;
  }
  return quoteMaterialsYard(view, action).error;
}

function resolve(draft: GameState, playerId: PlayerId, action: MaterialsYardAction, ctx: ResolveContext): void {
  const placement = placeWorker(draft, playerId, action.workerId, "materials_yard", action.seniorApprentice === true, ctx);
  invariant(quoteFor(draft, playerId, action, placement.effect).ok, "Materials Yard command must be validated first");

  gain(draft, playerId, { clay: action.clay, wood: action.wood }, "materials_yard", ctx);
  if (action.buyShifuBonus === true) {
    const bonus = LOCATIONS.materials_yard.effects.shifu.bonus;
    spend(draft, playerId, { coins: bonus.coins }, "materials_yard_bonus", ctx);
    gain(draft, playerId, { clay: bonus.clay, wood: bonus.wood }, "materials_yard_bonus", ctx);
  }
  const prepared = action.preparedClay;
  if (prepared !== undefined) {
    markTechUsed(draft, playerId, PREPARED_CLAY, ctx);
    if (prepared.useDecoratorsKit === true) {
      markTechUsed(draft, playerId, DECORATORS_KIT, ctx);
    }
    const cost = preparedClayCost(prepared);
    spend(draft, playerId, { clay: cost.clay, coins: cost.coins }, "prepared_clay", ctx);
    formCeramic(draft, playerId, prepared.shape, prepared.decoration, "prepared_clay", ctx);
  }
  ctx.flow.workerActionDone(draft, playerId, ctx);
}

export const handlers: Pick<ActionHandlerTable, "PLACE_MATERIALS_YARD"> = {
  PLACE_MATERIALS_YARD: {
    phases: ["work_turn"],
    validate,
    resolve,
  },
};
