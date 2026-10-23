/**
 * Completing one Order, in the Order Phase, the only place Orders are completed (L406–419,
 * L460–464, v1.6.2 L296, L402, L484, L630, L641, R4, R13).
 *
 * Steps (L410–417): reveal a held Order; deliver the selected Finished ceramics beneath it;
 * record the printed VP; gain the printed Coins; resolve the printed Crowns one at a time
 * (`recognition.gainCrown`). Then the completion abilities, each once per round:
 * - Tribute Ware (T25, L642): an Order showing ≥ 1 printed Crown gains 1 bonus Crown,
 *   resolved like any Crown; it is not a printed Crown (R13). Optional (R4).
 * - Ru (L460): delivering an actual Celadon, Plain (printed) Masterpiece scores 4 VP. Optional.
 * - Guan (L464): an Order showing ≥ 1 printed Crown gains 2 Coins and 1 VP (Tribute
 *   Ware's Crown never counts, R13). Optional.
 * - Canal Barge (T23, v1.6.2 L630): 2 Coins on the first Order its owner completes each round,
 *   Starting Orders included (L520). Automatic (INT: Canal Barge): declining could only move
 *   the same 2 Coins to a later completion of the same Order-Phase turn.
 * - Crackle VP (Ge, rev. 4 L465, L480, change 29): 1 VP for each Crackle ceramic delivered,
 *   recorded with the Order (`CompletedOrderRecord.crackleVp`) as Kiln Tradition VP (rev. 4
 *   L487). Automatic, no once-per-round limit, never declined (INT Ge Crackle, revision 4).
 *
 * Validation sees only the actor's view (DESIGN §1.3); errors name only what the actor chose.
 *
 * Layer 3: imports layer 0–2 and `recognition`.
 */

import { KILNS, ORDERS, TECHS } from "../content.ts";
import { invariant, ruleError } from "../errors.ts";
import { hasKiln, kilnAbilityReady, markKilnAbilityUsed } from "../kilns.ts";
import { gainCrown } from "../recognition.ts";
import { ceramic, ceramicsOf, emit, gain, lookup, player } from "../state.ts";
import { markTechUsed, techReady } from "../techs.ts";
import type {
  ActorView,
  CeramicId,
  CompletedOrderRecord,
  DeliveredCeramic,
  FinishedCeramic,
  GameRuleError,
  GameState,
  OrderCompletionSpec,
  OrderDefinition,
  OrderId,
  PlayerId,
  PlayerState,
  PublicCore,
  ResolveContext,
} from "../types.ts";
import { explainOrderMismatch, findOrderMatches, matchOrder, ruTriggers } from "./matching.ts";

const TRIBUTE_WARE = "T25";
const CANAL_BARGE = "T23";

function orderDefinition(orderId: OrderId): OrderDefinition | undefined {
  return lookup(ORDERS, orderId);
}

/** The completion abilities this completion would trigger (R4, R13): Ru, Guan and Tribute
 * Ware unless declined; Canal Barge and the Crackle VP always (they are never declined). */
export interface CompletionTriggers {
  ru: boolean;
  guan: boolean;
  tributeWare: boolean;
  canalBarge: boolean;
  /** 1 VP per delivered Crackle ceramic (rev. 4 L465). */
  crackleVp: number;
}

/** The Crackle VP of delivering `ceramics` (rev. 4 L465): 1 per Crackle ceramic. */
export function crackleVpOf(ceramics: readonly FinishedCeramic[]): number {
  return ceramics.filter((c) => c.crackle).length * KILNS.GE.params.vpPerDeliveredCrackle;
}

/**
 * Which completion abilities apply to completing `order` with `ceramics`, before any decline:
 * Ru (actual Celadon Plain Masterpiece delivered), Guan and Tribute Ware (an Order showing ≥ 1
 * printed Crown) and Canal Barge (any Order), each only while its once-per-round use is unspent;
 * and the Crackle VP of the delivered Crackle ceramics.
 */
export function completionTriggers(
  p: PlayerState,
  order: OrderDefinition,
  ceramics: readonly FinishedCeramic[],
): CompletionTriggers {
  return {
    ru: kilnAbilityReady(p, "RU") && ruTriggers(ceramics),
    guan: kilnAbilityReady(p, "GU") && order.crowns >= KILNS.GU.params.minPrintedCrowns,
    tributeWare: techReady(p, TRIBUTE_WARE) && order.crowns >= 1,
    canalBarge: techReady(p, CANAL_BARGE),
    crackleVp: crackleVpOf(ceramics),
  };
}

/**
 * Checks one completion against the actor's view (L410–419): the Order is held; the
 * ceramics are distinct, exist, are the actor's own and Finished (never delivered, L419);
 * Crackle declarations, when given, are well formed; and the selection meets every
 * requirement (`matchOrder`). Error codes follow the `OrderCompletionSpec` JSDoc.
 */
export function validateOrderCompletion(view: ActorView, spec: OrderCompletionSpec): GameRuleError | null {
  const game = view.game;
  const actorId = view.viewerId;
  const order = orderDefinition(spec.orderId);
  if (order === undefined || !view.own.orderHand.includes(spec.orderId)) {
    return ruleError("ORDER_NOT_HELD", "You can complete only Orders in your hand.", { orderId: spec.orderId });
  }
  const selected: FinishedCeramic[] = [];
  const seen = new Set<CeramicId>();
  for (const ceramicId of spec.ceramicIds) {
    if (seen.has(ceramicId)) {
      return ruleError("DUPLICATE_CERAMIC", "The same ceramic cannot be chosen twice.", { ceramicId });
    }
    seen.add(ceramicId);
    const found = lookup(game.ceramics, ceramicId);
    if (found === undefined) {
      return ruleError("CERAMIC_NOT_FOUND", "That ceramic does not exist.", { ceramicId });
    }
    if (found.ownerId !== actorId) {
      return ruleError("CERAMIC_NOT_OWNED", "That ceramic is not yours.", { ceramicId, ownerId: found.ownerId });
    }
    if (found.stage !== "finished") {
      return ruleError("ILLEGAL_CERAMIC_STAGE", `That ceramic is ${found.stage}; only Finished ceramics complete Orders.`, {
        ceramicId,
        stage: found.stage,
        expectedStage: "finished",
      });
    }
    selected.push(found);
  }
  const declared = spec.crackleDeclarations;
  if (declared !== undefined) {
    const declaredIds = new Set<CeramicId>();
    for (const entry of declared) {
      const target = selected.find((c) => c.id === entry.ceramicId);
      const reason =
        target === undefined
          ? "crackle_not_selected"
          : !target.crackle
            ? "not_crackle"
            : declaredIds.has(entry.ceramicId)
              ? "crackle_declared_twice"
              : null;
      if (reason !== null) {
        return ruleError(
          "INVALID_CRACKLE_DECLARATION",
          "Each declaration must name a different selected Crackle ceramic.",
          { ceramicId: entry.ceramicId, decoration: entry.decoration, orderId: spec.orderId, reason },
        );
      }
      declaredIds.add(entry.ceramicId);
    }
  }
  if (matchOrder(order, selected, declared) !== null) {
    return null;
  }
  if (declared !== undefined && matchOrder(order, selected) !== null) {
    // Well formed, but another declaration would satisfy the Order (OrderCompletionSpec JSDoc).
    return ruleError("INVALID_CRACKLE_DECLARATION", "These Crackle declarations do not satisfy the Order; others would.", {
      orderId: spec.orderId,
      reason: "declaration_does_not_satisfy",
    });
  }
  const mismatch = explainOrderMismatch(order, selected, declared);
  invariant(mismatch !== null, `${spec.orderId}: no match but no mismatch`);
  const details: GameRuleError["details"] = { orderId: spec.orderId, reason: mismatch.reason };
  if (mismatch.ceramicId !== null) details["ceramicId"] = mismatch.ceramicId;
  if (mismatch.slotIndex !== null) details["slotIndex"] = mismatch.slotIndex;
  return ruleError("ORDER_REQUIREMENTS_NOT_MET", `The chosen ceramics do not meet Order ${spec.orderId} (${mismatch.reason}).`, details);
}

function deliver(draft: GameState, finished: FinishedCeramic, orderId: OrderId): void {
  const { stage: _stage, quality, crackle, ...core } = finished;
  const base = { ...core, stage: "delivered" as const, orderId, deliveredInRound: draft.round };
  let delivered: DeliveredCeramic;
  if (crackle) {
    delivered = { ...base, crackle: true, quality: "fine" };
  } else {
    invariant(quality !== "flawed", `${finished.id} is Flawed and cannot be delivered (L279)`);
    delivered = { ...base, crackle: false, quality };
  }
  draft.ceramics[finished.id] = delivered;
}

/**
 * Resolves a completion that `validateOrderCompletion` accepted (L410–417), then Tribute
 * Ware, Ru and Guan unless declined (R4), then Canal Barge's 2 Coins, then the Crackle VP, and
 * returns the record.
 *
 * Event order: `ORDER_COMPLETED` (the reveal, with the full record, `crackleVp` included);
 * `RESOURCES_CHANGED` (printed Coins); each printed Crown (`RECOGNITION_ADVANCED` + milestone
 * events, or `CROWN_OVERFLOW_VP`); Tribute Ware (`TECH_USED`, then its Crown); Ru or Guan
 * (`KILN_ABILITY_USED`, then Guan's Coins); Canal Barge (`TECH_USED`, then
 * `RESOURCES_CHANGED{reason: "canal_barge"}`). The Crackle VP has no event of its own: the
 * record carries it.
 */
export function resolveOrderCompletion(
  draft: GameState,
  playerId: PlayerId,
  spec: OrderCompletionSpec,
  ctx: ResolveContext,
): CompletedOrderRecord {
  const owner = player(draft, playerId);
  const order = orderDefinition(spec.orderId);
  invariant(order !== undefined, `Unknown Order ${spec.orderId}`);
  const hand = draft.hidden.orderHands[playerId] ?? [];
  const handIndex = hand.indexOf(spec.orderId);
  invariant(handIndex >= 0, `${playerId} does not hold ${spec.orderId}`);

  const selected = spec.ceramicIds.map((id) => {
    const found = ceramic(draft, id);
    invariant(found.stage === "finished" && found.ownerId === playerId, `${id} is not ${playerId}'s Finished ceramic`);
    return found;
  });
  const match = matchOrder(order, selected, spec.crackleDeclarations);
  invariant(match !== null, `${spec.ceramicIds.join(", ")} do not complete ${spec.orderId}`);

  const triggers = completionTriggers(owner, order, selected);
  const useTribute = triggers.tributeWare && spec.declineTributeWare !== true;
  const useRu = triggers.ru && spec.declineKilnAbility !== true;
  const useGuan = triggers.guan && spec.declineKilnAbility !== true;
  invariant(!(useRu && useGuan), "A player has one Kiln");
  const useBarge = triggers.canalBarge;
  const bargeCoins = useBarge ? TECHS.T23.params.coins : 0;
  invariant(bargeCoins === 0 || bargeCoins === 2, "Canal Barge gives 2 Coins (v1.6.2 L630)");

  const bonusCrowns = useTribute ? TECHS.T25.params.bonusCrowns : 0;
  invariant(bonusCrowns === 0 || bonusCrowns === 1, "Tribute Ware grants 1 bonus Crown (L642)");
  const crackleVp = triggers.crackleVp;
  let kilnAbility: CompletedOrderRecord["kilnAbility"] = null;
  if (useRu) {
    kilnAbility = { kilnId: "RU", vp: KILNS.RU.params.vp, coins: 0 };
  } else if (useGuan) {
    kilnAbility = { kilnId: "GU", vp: KILNS.GU.params.vp, coins: KILNS.GU.params.coins };
  }

  // Steps 1–4 and 8: reveal, deliver beneath the Order, move it to the scoring area.
  hand.splice(handIndex, 1);
  for (const finished of selected) {
    deliver(draft, finished, spec.orderId);
  }
  const record: CompletedOrderRecord = {
    orderId: spec.orderId,
    ceramicIds: match.ceramicIds,
    round: draft.round,
    canalBargeCoins: bargeCoins as 0 | 2,
    vp: order.vp,
    coins: order.coins,
    printedCrowns: order.crowns,
    bonusCrowns: bonusCrowns as 0 | 1,
    crackleDeclarations: match.crackleDeclarations,
    kilnAbility,
    crackleVp,
  };
  owner.completedOrders.push(record);
  emit(ctx, { type: "ORDER_COMPLETED", playerId, record: structuredClone(record) });

  // Step 5–6: printed VP and Coins.
  owner.score.orders += order.vp;
  gain(draft, playerId, { coins: order.coins }, "order_reward", ctx);

  // Step 7: printed Crowns, one at a time (L416, L439).
  for (let crown = 0; crown < order.crowns; crown += 1) {
    gainCrown(draft, playerId, "printed_crown", spec.orderId, ctx);
  }

  // Tribute Ware: a bonus Crown, resolved like any other (R13).
  if (useTribute) {
    markTechUsed(draft, playerId, TRIBUTE_WARE, ctx);
    for (let crown = 0; crown < bonusCrowns; crown += 1) {
      gainCrown(draft, playerId, "tribute_crown", spec.orderId, ctx);
    }
  }

  // Ru / Guan (L460, L464).
  if (kilnAbility !== null) {
    invariant(hasKiln(owner, kilnAbility.kilnId), `${playerId} does not have ${kilnAbility.kilnId}`);
    markKilnAbilityUsed(draft, playerId, ctx);
    owner.score.kilnAbilities += kilnAbility.vp;
    gain(draft, playerId, { coins: kilnAbility.coins }, "guan", ctx);
  }

  // Canal Barge (v1.6.2 L630): automatic on the first completion of the round.
  if (useBarge) {
    markTechUsed(draft, playerId, CANAL_BARGE, ctx);
    gain(draft, playerId, { coins: bargeCoins }, "canal_barge", ctx);
  }

  // Crackle VP (rev. 4 L465, L487): 1 per delivered Crackle ceramic, as Kiln Tradition VP.
  owner.score.kilnAbilities += crackleVp;
  return record;
}

/**
 * Held Orders (in hand order) that the player's Finished ceramics can complete now. Takes
 * the hand explicitly because it is hidden: resolvers pass `hidden.orderHands[pid]`, a
 * view passes `own.orderHand`.
 */
export function completableOrderIds(game: PublicCore, playerId: PlayerId, hand: readonly OrderId[]): OrderId[] {
  const pool = ceramicsOf(game, playerId, "finished");
  if (pool.length === 0) {
    return [];
  }
  return hand.filter((orderId) => {
    const order = orderDefinition(orderId);
    return order !== undefined && findOrderMatches(order, pool, 1).length > 0;
  });
}
