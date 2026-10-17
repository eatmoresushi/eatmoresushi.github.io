/**
 * Table-state scenarios for the UI fixtures (UI_V1.6.1_ARCHITECTURE.md §9.1): public table
 * states the decision-window scenarios (`phaseScenarios`) do not reach. Each is a real engine
 * state on a `LocalTable` (production flow unless noted), reached by engine commands where the
 * state is a consequence of play (a skipped firing, a reshuffle, an overflow Crown, the final
 * scoring), and built with `buildState` otherwise. Every state passes `assertInvariants`.
 *
 * `tools/uiFixtures.ts --target tests` projects each one for its `viewerId` into
 * `scenarios.json` (kind `table`). Never imported by `src/app`.
 */

import { FIRING, MAIN_ORDER_IDS, ORDERS, SHAPES } from "../../../../src/game/content.ts";
import { assertInvariants } from "../../../../src/game/invariants.ts";
import { matchOrder } from "../../../../src/game/orders/matching.ts";
import { player, takeVesselCard } from "../../../../src/game/state.ts";
import type {
  CompletedOrderRecord,
  Decoration,
  FinishedCeramic,
  FiringContext,
  GameState,
  Glaze,
  MainOrderId,
  OrderDefinition,
  OrderId,
  PlayerId,
  Quality,
  RoundNumber,
  Shape,
} from "../../../../src/game/types.ts";
import { openFiringTable, tendAll } from "../../engine/support/firing.ts";
import { buildState } from "../../engine/support/fixtures.ts";
import { LocalTable } from "../../engine/support/localTable.ts";

export interface TableScenario {
  /** Stable fixture ID (`t-…`). */
  id: string;
  name: string;
  table: LocalTable;
  viewerId: PlayerId;
}

const GLAZE_ORDER: readonly Glaze[] = ["white", "celadon", "grey_green", "moon_white"];
const DECORATION_ORDER: readonly Decoration[] = ["plain", "carved", "impressed", "painted"];

/** One satisfying ceramic group for an Order (Masterpieces, so every Quality rule holds). */
function ceramicsFor(order: OrderDefinition): Array<{ shape: Shape; glaze: Glaze; decoration: Decoration; quality: Quality }> {
  const relation = <T extends string>(type: T) => (order.relations ?? []).find((r) => r.type === type);
  const requiredGlazes = (relation("required_glazes") as { values: Glaze[] } | undefined)?.values;
  const requiredDecorations = (relation("required_decorations") as { values: Decoration[] } | undefined)?.values;
  const sameShape = relation("same_shape") !== undefined;
  const sameGlaze = relation("same_glaze") !== undefined;
  const sameDecoration = relation("same_decoration") !== undefined;
  return order.ceramics.map((slot, index) => ({
    shape: slot.shape ?? slot.shapes?.[0] ?? (sameShape ? "bowl" : (SHAPES[index] as Shape)),
    glaze: slot.glaze ?? requiredGlazes?.[index] ?? (sameGlaze ? "white" : (GLAZE_ORDER[index] as Glaze)),
    decoration: slot.decoration ?? requiredDecorations?.[index] ?? (sameDecoration ? "plain" : (DECORATION_ORDER[index] as Decoration)),
    quality: "masterpiece",
  }));
}

/**
 * Records `orderIds` as completed by `playerId` in earlier rounds, with delivered ceramics that
 * satisfy each Order (checked by the engine's matcher) and the ledger's Order VP. Only
 * crownless Orders, so Recognition is untouched. Removes the Orders from the Main deck.
 */
function completeEarlier(state: GameState, playerId: PlayerId, orderIds: readonly MainOrderId[], round: RoundNumber): void {
  const p = player(state, playerId);
  for (const orderId of orderIds) {
    const order = ORDERS[orderId];
    if (order.crowns !== 0) throw new Error(`tableScenarios: ${orderId} has Crowns`);
    const finished: FinishedCeramic[] = ceramicsFor(order).map((spec) => {
      const id = `c${state.nextCeramicSequence}`;
      state.nextCeramicSequence += 1;
      return {
        id,
        ownerId: playerId,
        vesselInstanceId: takeVesselCard(state, spec.shape),
        shape: spec.shape,
        decoration: spec.decoration,
        formedInRound: round,
        formedBy: "form_decorate",
        glaze: spec.glaze,
        firedInRound: round,
        stage: "finished",
        crackle: false,
        quality: spec.quality,
      };
    });
    if (matchOrder(order, finished) === null) throw new Error(`tableScenarios: no satisfying group built for ${orderId}`);
    for (const c of finished) {
      const quality = c.quality;
      if (quality === "flawed") throw new Error("unreachable");
      state.ceramics[c.id] = { ...c, stage: "delivered", orderId, deliveredInRound: round, crackle: false, quality };
    }
    const record: CompletedOrderRecord = {
      orderId,
      ceramicIds: finished.map((c) => c.id),
      round,
      canalBargeCoins: 0,
      vp: order.vp,
      coins: order.coins,
      printedCrowns: 0,
      bonusCrowns: 0,
      crackleDeclarations: [],
      kilnAbility: null,
    };
    p.completedOrders.push(record);
    p.score.orders += order.vp;
    state.hidden.mainDeck = state.hidden.mainDeck.filter((id) => id !== orderId);
  }
}

/** A finished Round 1 firing (all Tend, no decisions) to keep as the recap of a later round. */
function roundOneRecap(): FiringContext {
  const table = openFiringTable({
    players: [{}, {}],
    ceramics: [
      { owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", decoration: "carved", at: "middle_1" },
      { owner: "p2", stage: "loaded", shape: "vase", glaze: "white", at: "high_1" },
    ],
  });
  tendAll(table);
  const last = table.state.lastFiring;
  if (last === null) throw new Error("tableScenarios: the Round 1 firing did not finish");
  return last;
}

function checked(table: LocalTable): LocalTable {
  assertInvariants(table.state, { live: true });
  return table;
}

/** Every table-state scenario, freshly built (tables are mutable). */
export function tableScenarios(): TableScenario[] {
  const scenarios: TableScenario[] = [];
  const add = (id: string, name: string, table: LocalTable, viewerId: PlayerId) => scenarios.push({ id, name, table: checked(table), viewerId });

  // 1. A round with nothing loaded: the Firing Phase is skipped (L237), and the previous
  //    firing's recap stays until the next firing starts.
  {
    const recap = roundOneRecap();
    const round1 = recap.ceramics;
    const table = new LocalTable(
      buildState({
        round: 2,
        players: [{ resources: { coins: 5 } }, {}],
        ceramics: [
          { owner: "p1", stage: "finished", shape: "bowl", glaze: "celadon", decoration: "carved", quality: round1["c1"]?.quality ?? "standard", firedInRound: 1, formedInRound: 1 },
          { owner: "p2", stage: "finished", shape: "vase", glaze: "white", quality: round1["c2"]?.quality ?? "standard", firedInRound: 1, formedInRound: 1 },
        ],
        lastFiring: recap,
        placements: [
          { player: "p1", worker: "shifu", locationId: "canal_wharf" },
          { player: "p1", worker: 1, locationId: "canal_wharf" },
          { player: "p1", worker: 2, locationId: "materials_yard" },
          { player: "p1", worker: 3, locationId: "commission_market" },
          { player: "p2", worker: "shifu", locationId: "canal_wharf" },
          { player: "p2", worker: 1, locationId: "guild_hall" },
          { player: "p2", worker: 2, locationId: "canal_wharf" },
        ],
        phase: { type: "work_turn", activePlayerId: "p2", step: { kind: "before_action" } },
      }),
      { seed: 7 },
    );
    table.act("p2", { type: "PLACE_CANAL_WHARF", workerId: "p2:apprentice:3" });
    add("t-firing-skipped", "A round with nothing loaded: firing skipped, then Round 3 begins", table, "p1");
  }

  // 2. An Imperial-only firing: no Contribution participants, Base Heat = Kiln Die (INT).
  add(
    "t-imperial-only-firing",
    "Imperial-only firing: no Contributions, Base Heat equals the Kiln Die",
    openFiringTable({
      kilnDie: 3,
      players: [{ recognition: 2, displayName: "Lin" }, { displayName: "Zhao" }],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "vase", glaze: "moon_white", decoration: "painted", at: "imperial", imperialModifier: 1, heatMarker: { source: "own", faceDown: true } },
      ],
    }),
    "p2",
  );

  // 3. A Fire-deck reshuffle: the deck is empty at the reveal, so the open discard is shuffled
  //    back and empties (L512); Jun keeps the firing open at step 8.
  {
    const table = openFiringTable({
      players: [{ kilnId: "JU", resources: { wood: 3 } }, {}, {}],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
        { owner: "p2", stage: "loaded", shape: "plate", glaze: "white", at: "high_1" },
        { owner: "p3", stage: "loaded", shape: "censer", glaze: "grey_green", decoration: "impressed", at: "low_1" },
      ],
      fireDeck: [],
      fireDiscard: [...FIRING.fireDeck],
    });
    tendAll(table);
    if (!table.events.some((event) => event.type === "FIRE_DECK_RESHUFFLED")) throw new Error("tableScenarios: no reshuffle");
    add("t-fire-deck-reshuffle", "Fire-deck reshuffle: the open discard empties", table, "p2");
  }

  // 4. An empty Main Order supply with a partial display (B1): late in a 4-player game the
  //    deck and discard are exhausted, so two display positions stay empty.
  {
    const crownless = MAIN_ORDER_IDS.filter((id) => ORDERS[id].crowns === 0);
    const state = buildState({
      round: 5,
      players: [
        { hand: ["O21", "O22", "O23", "O24"] },
        { hand: ["O35", "O36", "O37", "O38"] },
        { hand: ["O39", "O40", "O41", "O42"] },
        { hand: ["O45", "O46", "O47", "O48"] },
      ],
      display: ["O17", "O18", "O19", "O20", null, null],
      mainDeck: [...crownless],
      mainDiscard: [],
    });
    crownless.forEach((orderId, index) => {
      completeEarlier(state, `p${(index % 4) + 1}`, [orderId], ((index % 4) + 1) as RoundNumber);
    });
    if (state.hidden.mainDeck.length !== 0 || state.hidden.mainDiscard.length !== 0) throw new Error("tableScenarios: supply not empty");
    add("t-empty-main-supply", "Empty Main Order supply: the display stays partly empty", new LocalTable(state), "p1");
  }

  // 5. Round 5 with an over-limit hand: Cleanup skips the trim in the last round (INT), so the
  //    viewer's six Orders show no discard due (trimDue false).
  add(
    "t-round5-over-limit",
    "Round 5 Order Phase with six Orders held: no trim at the last Cleanup",
    new LocalTable(
      buildState({
        round: 5,
        players: [{ kilnId: "GE", hand: ["S01", "S02", "O01", "O02", "O03", "O04"] }, { kilnId: "RU" }],
        phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 },
        ceramics: [{ owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "standard" }],
      }),
      { flow: "halt", pass: ["worker_action_done"] },
    ),
    "p1",
  );

  // 6. A winner by tie-breaker: equal VP, decided by Imperial Recognition (L498).
  {
    const table = new LocalTable(
      buildState({
        round: 5,
        players: [{ kilnId: "GU", techs: ["T01"], recognition: 2 }, { kilnId: "JU", techs: ["T16"], recognition: 1 }],
        phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 },
      }),
      { seed: 3 },
    );
    table.act("p1", { type: "END_ORDER_TURN" });
    if (table.state.finalResult?.resolvedBy !== "imperial_recognition") throw new Error("tableScenarios: the tie was not broken by Recognition");
    add("t-tie-break-winner", "Final results: equal VP, won on Imperial Recognition", table, "p2");
  }

  // 7. Recognition overflow: a Crown gained at Recognition 4 scores +1 VP (L438).
  {
    const table = new LocalTable(
      buildState({
        round: 3,
        players: [
          { kilnId: "GE", recognition: 4, hand: ["O18"] },
          { kilnId: "RU", hand: ["S01"] },
        ],
        phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 },
        ceramics: [
          { owner: "p1", stage: "finished", shape: "vase", glaze: "celadon", decoration: "carved", quality: "fine" },
          { owner: "p2", stage: "finished", shape: "bowl", glaze: "white", quality: "standard" },
        ],
      }),
      { seed: 5 },
    );
    table.act("p1", { type: "COMPLETE_ORDER", orderId: "O18", ceramicIds: ["c1"] });
    if (!table.events.some((event) => event.type === "CROWN_OVERFLOW_VP")) throw new Error("tableScenarios: no overflow Crown");
    add("t-recognition-overflow", "A Crown beyond Recognition 4 scores 1 VP", table, "p1");
  }

  // 8. A 2-player and a 4-player final, reached through the last Order Phase.
  {
    const table = new LocalTable(
      buildState({
        round: 5,
        players: [
          { displayName: "Lin", kilnId: "RU", techs: ["T19", "T12"], resources: { coins: 7 }, hand: ["S01", "O22"] },
          { displayName: "Zhao", kilnId: "GE", techs: ["T21"], resources: { coins: 2 }, hand: ["S06"] },
        ],
        phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 },
        ceramics: [
          { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "standard" },
          { owner: "p1", stage: "finished", shape: "plate", glaze: "celadon", quality: "masterpiece" },
          { owner: "p1", stage: "finished", shape: "vase", glaze: "grey_green", decoration: "carved", quality: "fine" },
          { owner: "p1", stage: "finished", shape: "washer", glaze: "moon_white", decoration: "impressed", quality: "fine" },
          { owner: "p2", stage: "finished", shape: "vase", glaze: "white", decoration: "painted", quality: "standard" },
          { owner: "p2", stage: "finished", shape: "censer", glaze: "celadon", decoration: "carved", quality: "fine", crackle: true },
          { owner: "p2", stage: "finished", shape: "bowl", glaze: "moon_white", quality: "flawed" },
        ],
      }),
      { seed: 11 },
    );
    table.act("p1", { type: "COMPLETE_ORDER", orderId: "S01", ceramicIds: ["c1"] });
    table.act("p1", { type: "COMPLETE_ORDER", orderId: "O22", ceramicIds: ["c2"] });
    if (table.state.phase.type === "orders") table.act("p2", { type: "COMPLETE_ORDER", orderId: "S06", ceramicIds: ["c5"] });
    if (table.state.phase.type !== "finished") throw new Error(`tableScenarios: the 2-player game ended in ${table.state.phase.type}`);
    add("t-final-2p", "2-player final results", table, "p1");
  }
  {
    const table = new LocalTable(
      buildState({
        round: 5,
        players: [
          { displayName: "Lin", kilnId: "DI", techs: ["T05", "T22"], recognition: 3, hand: ["S05"] },
          { displayName: "Zhao", kilnId: "JU", techs: ["T17", "T10", "T14"], recognition: 1, hand: ["O05"] },
          { displayName: "Wen", kilnId: "GU", techs: ["T18"], recognition: 2, hand: ["S01", "O17"] },
          { displayName: "Su", kilnId: "RU", resources: { coins: 11 }, hand: ["S06"] },
        ],
        phase: { type: "orders", turnOrder: ["p1", "p2", "p3", "p4"], index: 0 },
        ceramics: [
          { owner: "p1", stage: "finished", shape: "plate", glaze: "grey_green", quality: "fine" },
          { owner: "p1", stage: "finished", shape: "bowl", glaze: "moon_white", decoration: "painted", quality: "masterpiece" },
          { owner: "p2", stage: "finished", shape: "censer", glaze: "celadon", decoration: "carved", quality: "fine" },
          { owner: "p2", stage: "finished", shape: "vase", glaze: "white", quality: "standard" },
          { owner: "p3", stage: "finished", shape: "bowl", glaze: "white", quality: "standard" },
          { owner: "p3", stage: "finished", shape: "washer", glaze: "white", decoration: "painted", quality: "fine" },
          { owner: "p4", stage: "finished", shape: "vase", glaze: "celadon", decoration: "impressed", quality: "masterpiece" },
        ],
      }),
      { seed: 13 },
    );
    const complete = (pid: PlayerId, orderId: OrderId, ceramicIds: string[]) => {
      if (table.state.phase.type === "orders" && table.prompt().actorIds.includes(pid)) {
        table.act(pid, { type: "COMPLETE_ORDER", orderId, ceramicIds });
      }
    };
    complete("p1", "S05", ["c1"]);
    complete("p2", "O05", ["c3"]);
    complete("p3", "S01", ["c5"]);
    complete("p3", "O17", ["c6"]);
    complete("p4", "S06", ["c7"]);
    if (table.state.phase.type !== "finished") throw new Error(`tableScenarios: the 4-player game ended in ${table.state.phase.type}`);
    add("t-final-4p", "4-player final results", table, "p3");
  }

  // 9. Glaze & Load into an Imperial Kiln (−1/0/+1 chosen when loading, R11) or onto Kiln
  //    Furniture (−1/0/+1 tile, L628): the viewer's Work turn, before the action.
  add(
    "t-glaze-load-imperial-furniture",
    "Glaze & Load choices: Imperial modifier and Kiln Furniture",
    new LocalTable(
      buildState({
        round: 3,
        players: [{ displayName: "Lin", techs: ["T15", "T01"], recognition: 2, resources: { coins: 4 } }, { displayName: "Zhao" }, { displayName: "Wen" }],
        ceramics: [
          { owner: "p1", stage: "shaped", shape: "bowl", decoration: "carved", formedInRound: 2 },
          { owner: "p1", stage: "shaped", shape: "vase", decoration: "painted", formedInRound: 2 },
          { owner: "p2", stage: "loaded", shape: "plate", glaze: "white", at: "high_1" },
          { owner: "p3", stage: "loaded", shape: "censer", glaze: "grey_green", at: "low_2" },
        ],
      }),
    ),
    "p1",
  );

  return scenarios;
}
