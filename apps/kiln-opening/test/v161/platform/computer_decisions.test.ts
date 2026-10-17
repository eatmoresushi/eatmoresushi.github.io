/**
 * The strategic computer player makes sensible choices in clear-cut situations (DESIGN §9.2
 * P9): Glazes aimed at the expected heat, Contributions that steer Base Heat toward its own
 * loads (Fuel Ledger's free Bank and Stoke included), Heat markers, Jun, Ge, Protective
 * Saggars, Second Firing (the better of its 2 cards) and salvage used when they pay, Orders
 * completed greedily by value and only in the Order Phase, vessels formed for held Orders
 * (S07's Decoration choice included), reservations that fit its pipeline, the Colour Samples
 * swap, the Guild Hall Shifu's 2 takes, and hand-limit discards of the least achievable
 * Orders. Every choice is also checked against the engine.
 */

import { describe, expect, it } from "vitest";
import { SeededRandom, TECHS, createGame, preferredHeat, validateAction, zoneModifier } from "../../../src/game/index.ts";
import type { AuthoritativeCommand, Glaze, KilnSpaceId, PlayerId, TechId } from "../../../src/game/index.ts";
import { chooseStrategicCommand } from "../../../src/multiplayer/index.ts";
import { buildState, type StateSpec } from "../engine/support/fixtures.ts";
import { openFiringTable, tendAll } from "../engine/support/firing.ts";
import { LocalTable } from "../engine/support/localTable.ts";

const RICH = { clay: 9, wood: 9, coins: 9 };

function decide(table: LocalTable, playerId: PlayerId = "p1"): AuthoritativeCommand {
  const view = table.actorView(playerId);
  const choice = chooseStrategicCommand(view, { playerId, displayName: playerId, aiSeed: 5, aiPolicyVersion: null });
  if (choice === null) throw new Error(`No strategic choice in ${table.state.phase.type}`);
  if (choice.type !== "SUBMIT_CONTRIBUTION") {
    expect(validateAction(view, choice), JSON.stringify(choice)).toBeNull();
  }
  return choice;
}

/** Plays a decision other than a Contribution (those go through `table.contribute`). */
function play(table: LocalTable, choice: AuthoritativeCommand, playerId: PlayerId = "p1"): void {
  if (choice.type === "SUBMIT_CONTRIBUTION") throw new Error("Contributions go through table.contribute");
  table.act(playerId, choice);
}

function work(spec: StateSpec): LocalTable {
  return new LocalTable(buildState(spec));
}

/** A fired 2-player table (Kiln Die 2, everyone tends) with a fixed Fire deck, top first. */
function fired(spec: StateSpec, fireDeck: Array<-2 | -1 | 0 | 1 | 2>): LocalTable {
  const table = openFiringTable({ ...spec, fireDeck });
  tendAll(table);
  return table;
}

describe("strategic computer choices", () => {
  it("chooses Jun first among the five Kiln boards", () => {
    const created = createGame({ gameId: "kiln-pick", players: [{ id: "p1", displayName: "A" }, { id: "p2", displayName: "B" }] }, new SeededRandom(4));
    if (!created.ok) throw new Error("createGame failed");
    const table = new LocalTable(created.state, { seed: 4 });
    const actor = table.prompt().actorIds[0] as PlayerId;
    expect(decide(table, actor)).toEqual({ type: "SELECT_KILN", kilnId: "JU" });
  });

  it("glazes for the expected heat of each kiln space when it loads", () => {
    // Round 5: only the Shifu is left, so loading is clearly best; the Kiln Die shows 2.
    const table = work({
      round: 5,
      players: [{ kilnId: "GE", resources: RICH, hand: ["S08"] }, { kilnId: "DI" }],
      ceramics: [
        { owner: "p1", stage: "shaped", shape: "bowl" },
        { owner: "p1", stage: "shaped", shape: "plate" },
      ],
      placements: [
        { player: "p1", worker: 1, locationId: "canal_wharf" },
        { player: "p1", worker: 2, locationId: "canal_wharf" },
        { player: "p1", worker: 3, locationId: "canal_wharf" },
      ],
    });
    const choice = decide(table);
    expect(choice.type).toBe("PLACE_GLAZE_LOAD");
    if (choice.type !== "PLACE_GLAZE_LOAD") return;
    expect(choice.loads).toHaveLength(2);
    for (const load of choice.loads) {
      expect(load.destination.kiln).toBe("shared");
      if (load.destination.kiln !== "shared") continue;
      const heat = 2 + zoneModifier(load.destination.spaceId);
      expect(Math.abs(preferredHeat(load.glaze) - heat), JSON.stringify(load)).toBeLessThanOrEqual(1);
    }
    expect(choice.loads.some((load) => load.destination.kiln === "shared" && preferredHeat(load.glaze) === 2 + zoneModifier(load.destination.spaceId))).toBe(true);
    // The Glaze & Load Shifu always places its face-down Heat marker (R9).
    expect(choice.heatMarkerCeramicId).toBeDefined();
  });

  it("spends Imperial Priority with a modifier that makes the Imperial heat exact", () => {
    const table = work({
      players: [{ kilnId: "GE", recognition: 3, hand: ["S02"] }, { kilnId: "DI" }],
      kilnDie: 3,
      ceramics: [{ owner: "p1", stage: "shaped", shape: "vase", decoration: "carved" }],
    });
    const choice = decide(table);
    expect(choice.type).toBe("USE_IMPERIAL_PRIORITY");
    if (choice.type !== "USE_IMPERIAL_PRIORITY") return;
    expect(preferredHeat(choice.glaze)).toBe(3 + choice.imperialModifier);
  });

  it.each([
    ["high_1", "celadon", "BANK"],
    ["high_1", "moon_white", "STOKE"],
    ["middle_1", "celadon", "TEND"],
  ] as Array<[KilnSpaceId, Glaze, "BANK" | "TEND" | "STOKE"]>)("steers Base Heat for its own load (%s, %s → %s)", (at, glaze, card) => {
    const table = openFiringTable({
      players: [{ kilnId: "GE", resources: { wood: 3 } }, { kilnId: "DI" }],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze, at },
        // The rival's White in a Low space is exact at the die's Base Heat: it tends.
        { owner: "p2", stage: "loaded", shape: "plate", glaze: "white", at: "low_1" },
      ],
    });
    expect(decide(table)).toMatchObject({ type: "SUBMIT_CONTRIBUTION", card, fuelLedger: false });
  });

  it("turns its Heat marker toward the Preferred Heat once Base Heat is known", () => {
    const table = fired(
      {
        players: [{ kilnId: "GE" }, { kilnId: "DI" }],
        ceramics: [{ owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1", heatMarker: { source: "own", faceDown: true } }],
      },
      [0, 1, -1],
    );
    expect(table.state.phase.type).toBe("firing_heat_markers");
    expect(decide(table)).toEqual({ type: "RESOLVE_HEAT_MARKERS", ownMarker: -1 });
  });

  it("uses Jun when one step makes a Masterpiece, and declines when nothing improves", () => {
    const improve = fired(
      {
        players: [{ kilnId: "JU", resources: { wood: 2 } }, { kilnId: "DI" }],
        ceramics: [{ owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "high_1" }],
      },
      [0, 1, -1],
    );
    expect(improve.state.phase.type).toBe("firing_heat_adjustment");
    const used = decide(improve);
    expect(used).toMatchObject({ type: "RESOLVE_JUN", adjustment: { delta: -1 } });

    const exact = fired(
      {
        players: [{ kilnId: "JU", resources: { wood: 2 } }, { kilnId: "DI" }],
        ceramics: [{ owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" }],
      },
      [0, 1, -1],
    );
    expect(decide(exact)).toEqual({ type: "RESOLVE_JUN", adjustment: null });
  });

  it("crackles a Standard ceramic with Ge", () => {
    // Celadon (2) in a High space with Fire +1: heat 4, Standard.
    const table = fired(
      {
        players: [{ kilnId: "GE" }, { kilnId: "DI" }],
        ceramics: [{ owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "high_1" }],
      },
      [1, 0, -1],
    );
    expect(table.state.phase.type).toBe("firing_after_quality");
    expect(decide(table)).toMatchObject({ type: "USE_GE_CRACKLE" });
  });

  it("lifts a Standard ceramic with Protective Saggars, which costs no Wood (v1.6.2 L628)", () => {
    const table = fired(
      {
        players: [{ kilnId: "DI", techs: ["T11"], resources: { wood: 0 } }, { kilnId: "RU" }],
        ceramics: [{ owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "high_1" }],
      },
      [1, 0, -1],
    );
    expect(decide(table)).toMatchObject({ type: "USE_PROTECTIVE_SAGGARS" });
  });

  it.each([
    ["high_1", "celadon", "BANK"],
    ["high_1", "moon_white", "STOKE"],
  ] as Array<[KilnSpaceId, Glaze, "BANK" | "STOKE"]>)(
    "spends Fuel Ledger's free Wood card with no Wood at all (%s, %s → %s; v1.6.2 L629)",
    (at, glaze, card) => {
      const spec = (techs: TechId[]): StateSpec => ({
        players: [{ kilnId: "GE", techs, resources: { wood: 0 } }, { kilnId: "DI" }],
        ceramics: [
          { owner: "p1", stage: "loaded", shape: "bowl", glaze, at },
          { owner: "p2", stage: "loaded", shape: "plate", glaze: "white", at: "low_1" },
        ],
      });
      // Fuel Ledger's Bank and Stoke cost no Wood, so the owner steers without any.
      expect(decide(openFiringTable(spec(["T12"])))).toMatchObject({ type: "SUBMIT_CONTRIBUTION", card, fuelLedger: false });
      // Without it, a seat with no Wood can only Tend (L261).
      expect(decide(openFiringTable(spec([])))).toMatchObject({ type: "SUBMIT_CONTRIBUTION", card: "TEND", fuelLedger: false });
    },
  );

  it("refires a Flawed ceramic with Second Firing when the unseen Fire cards can save it", () => {
    // Moon White (4) in a Low space with Fire 0: heat 1, Flawed. The unseen cards are +2 and
    // +1 (the rest of the deck is in the open discard), so a refire can only help.
    const refire = fired(
      {
        players: [{ kilnId: "DI", techs: ["T14"] }, { kilnId: "RU" }],
        ceramics: [{ owner: "p1", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_1" }],
      },
      [0, 2, 1],
    );
    expect(decide(refire)).toEqual({ type: "USE_SECOND_FIRING", ceramicId: "c1" });
    // With only −2 and −1 unseen, refiring cannot help: it ends the step, then salvages.
    const hopeless = fired(
      {
        players: [{ kilnId: "DI", techs: ["T14"] }, { kilnId: "RU" }],
        ceramics: [{ owner: "p1", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_1" }],
      },
      [0, -2, -1],
    );
    expect(decide(hopeless)).toEqual({ type: "END_AFTER_QUALITY" });
    hopeless.act("p1", { type: "END_AFTER_QUALITY" });
    expect(hopeless.state.phase.type).toBe("firing_salvage");
    expect(decide(hopeless)).toEqual({ type: "SALVAGE_FLAWED", ceramicId: "c1" });
  });

  it("chooses the better of Second Firing's 2 cards, with Jun's step when it pays (v1.6.2 L631, R7)", () => {
    // A White Bowl in a High space: Base 2 + Fire 0 + 1 = 3, Heat Difference 2, Standard. The
    // 2 extra cards are +1 (heat 4, Flawed) and −1 (heat 2, Fine).
    const spec = (kilnId: "DI" | "JU"): StateSpec => ({
      players: [{ kilnId, techs: ["T14"], resources: { wood: 2 } }, { kilnId: "RU" }],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1" },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
      ],
    });
    const plain = fired(spec("DI"), [0, 1, -1]);
    expect(plain.state.phase.type).toBe("firing_after_quality");
    expect(decide(plain)).toEqual({ type: "USE_SECOND_FIRING", ceramicId: "c1" });
    plain.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    expect(plain.state.phase.type).toBe("firing_second_firing_choice");
    expect(decide(plain)).toEqual({ type: "SECOND_FIRING_CHOOSE", cardIndex: 1, jun: null });

    // Jun kept for the Second Firing (R7): the −1 card and Jun's −1 give heat 1, a Masterpiece.
    const jun = fired(spec("JU"), [0, 1, -1]);
    expect(jun.state.phase.type).toBe("firing_heat_adjustment");
    jun.act("p1", { type: "RESOLVE_JUN", adjustment: null });
    jun.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    expect(decide(jun)).toEqual({ type: "SECOND_FIRING_CHOOSE", cardIndex: 1, jun: { delta: -1 } });
  });

  it("completes the most valuable Order its ceramics allow", () => {
    const table = new LocalTable(
      buildState({
        players: [{ kilnId: "GE", hand: ["S08", "O16"] }, { kilnId: "DI" }],
        phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 },
        ceramics: [{ owner: "p1", stage: "finished", shape: "bowl", glaze: "celadon", quality: "masterpiece" }],
      }),
      { flow: "halt", pass: ["worker_action_done"] },
    );
    expect(decide(table)).toMatchObject({ type: "COMPLETE_ORDER", orderId: "O16" });
  });

  it("chooses a whole set of completions, keeping back the only ceramic a second Order can use", () => {
    // Round 5 (verifier seed 70304): O16 takes any Masterpiece, O04 only the Moon White Vase.
    // Completing O16 with the Vase first would strand O04; the set {O04: c1, O16: c2} wins.
    const table = new LocalTable(
      buildState({
        round: 5,
        players: [{ kilnId: "GE", hand: ["O04", "O16"] }, { kilnId: "DI" }],
        phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 },
        ceramics: [
          { owner: "p1", stage: "finished", shape: "vase", glaze: "moon_white", quality: "masterpiece" },
          { owner: "p1", stage: "finished", shape: "censer", glaze: "celadon", quality: "masterpiece" },
        ],
      }),
      { flow: "halt", pass: ["worker_action_done"] },
    );
    const first = decide(table);
    expect(first.type).toBe("COMPLETE_ORDER");
    if (first.type !== "COMPLETE_ORDER") return;
    expect(first).not.toMatchObject({ orderId: "O16", ceramicIds: ["c1"] });
    table.act("p1", first);
    const second = decide(table);
    expect(second.type).toBe("COMPLETE_ORDER");
    if (second.type !== "COMPLETE_ORDER") return;
    table.act("p1", second);
    expect(table.state.players["p1"]?.completedOrders.map((record) => record.orderId).sort()).toEqual(["O04", "O16"]);
  });

  it.each([
    [3, "O35"],
    [5, "O26"],
  ] as const)("values a Crown by what its milestone can still do (Round %i → %s)", (round, expected) => {
    // A Fine Celadon Bowl and Plate fit O35 (11 VP, 2 Coins, 1 Crown) and O26 (11 VP, 5 Coins,
    // v1.6.2 change 24). Early, the Imperial Grant's Clay, Wood and Coin and the road to the
    // Imperial Kiln are worth the Crown; after the last firing the Grant is only its Coin, so
    // O26's Coins score more (7 Coins → 2 VP against 5 Coins → 1 VP).
    const table = new LocalTable(
      buildState({
        round,
        players: [{ kilnId: "GE", hand: ["O35", "O26"], resources: { coins: 2 } }, { kilnId: "DI" }],
        phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 },
        ceramics: [
          { owner: "p1", stage: "finished", shape: "bowl", glaze: "celadon", quality: "fine" },
          { owner: "p1", stage: "finished", shape: "plate", glaze: "celadon", quality: "fine" },
        ],
      }),
      { flow: "halt", pass: ["worker_action_done"] },
    );
    expect(decide(table)).toMatchObject({ type: "COMPLETE_ORDER", orderId: expected });
  });

  it("forms the vessel its held Order needs", () => {
    // Only an Apprentice is left and every central location it could use is full.
    const table = work({
      players: [{ kilnId: "GE", resources: RICH, recognition: 3, hand: ["O05"] }, { kilnId: "DI" }],
      placements: [
        { player: "p2", worker: "shifu", locationId: "materials_yard" },
        { player: "p2", worker: 1, locationId: "materials_yard" },
        { player: "p2", worker: 2, locationId: "commission_market" },
        { player: "p2", worker: 3, locationId: "commission_market" },
        { player: "p1", worker: "shifu", locationId: "guild_hall" },
        { player: "p1", worker: 1, locationId: "guild_hall" },
        { player: "p1", worker: 2, locationId: "canal_wharf" },
      ],
    });
    const choice = decide(table);
    expect(choice).toMatchObject({ type: "PLACE_FORM_DECORATE", vessels: [{ shape: "censer", decoration: "carved" }] });
  });

  it("reserves the looked-at Order its finished ceramics already complete", () => {
    // Round 5: an Order needing new vessels can hardly be finished; O02 is complete now.
    const table = work({
      round: 5,
      players: [{ kilnId: "GE", resources: RICH, hand: ["S08"] }, { kilnId: "DI" }],
      ceramics: [{ owner: "p1", stage: "finished", shape: "plate", glaze: "celadon", quality: "fine" }],
      // The display offers only Orders that need several new vessels (v1.6.2 L196: the Shifu
      // chooses from the display and the 3 looked cards).
      display: ["O41", "O42", "O43", "O44", "O45", "O46"],
      mainDeck: ["O47", "O02", "O48"],
    });
    table.act("p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:shifu" });
    const choice = decide(table);
    expect(choice.type).toBe("COMMISSION_CHOOSE");
    if (choice.type !== "COMMISSION_CHOOSE") return;
    expect(choice.reservations[0]).toEqual({ kind: "looked", orderId: "O02" });
    expect(choice.reservations.length).toBeLessThanOrEqual(2);
  });

  it("reserves the face-up Order its finished ceramics complete when the look holds nothing better (Apprentice top 2)", () => {
    const table = work({
      round: 5,
      players: [{ kilnId: "GE", resources: RICH, hand: ["S08"] }, { kilnId: "DI" }],
      ceramics: [{ owner: "p1", stage: "finished", shape: "plate", glaze: "celadon", quality: "fine" }],
      display: ["O41", "O42", "O02", "O44", "O45", "O46"],
      mainDeck: ["O47", "O48"],
    });
    table.act("p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:apprentice:1" });
    expect(decide(table)).toEqual({ type: "COMMISSION_CHOOSE", reservations: [{ kind: "face_up", slotIndex: 2, orderId: "O02" }] });
  });

  it("swaps an Order it cannot complete with Colour Samples, keeps the looked card it can, and sends the other under the deck (v1.6.2 L617, change 24)", () => {
    // O47 needs three new vessels with two Masterpieces; O02 takes the Fine Celadon Plate now.
    const table = work({
      round: 4,
      players: [{ kilnId: "GE", techs: ["T10"], resources: RICH, hand: ["O47"] }, { kilnId: "DI" }],
      ceramics: [{ owner: "p1", stage: "finished", shape: "plate", glaze: "celadon", quality: "fine" }],
      display: ["O41", "O42", "O43", "O44", "O45", "O46"],
      mainDeck: ["O48", "O02", "O40"],
    });
    const swap = decide(table);
    expect(swap).toEqual({ type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: "O47" });
    play(table, swap);
    expect(table.state.phase).toMatchObject({ type: "work_turn", step: { kind: "colour_samples_swap", returnTo: "before_action" } });
    const choice = decide(table);
    expect(choice).toEqual({ type: "COLOUR_SAMPLES_SWAP_CHOOSE", orderId: "O02" });
    play(table, choice);
    expect(table.state.hidden.orderHands["p1"]).toEqual(["O02"]);
    expect(table.state.hidden.mainDeck).toEqual(["O40", "O48"]);
    expect(table.state.hidden.mainDiscard).toContain("O47");
    // Once per round: the next decision is a worker placement.
    expect(decide(table).type).toMatch(/^PLACE_/);
  });

  it("keeps its Colour Samples swap when its only held Order is already complete", () => {
    const table = work({
      round: 3,
      players: [{ kilnId: "GE", techs: ["T10"], resources: RICH, hand: ["O02"] }, { kilnId: "DI" }],
      ceramics: [{ owner: "p1", stage: "finished", shape: "plate", glaze: "celadon", quality: "fine" }],
    });
    expect(decide(table).type).toMatch(/^PLACE_/);
  });

  it("forms a Carved, Impressed or Painted vessel for S07, never a Plain one (change 23)", () => {
    for (const kilnId of ["GE", "RU", "GU", "JU", "DI"] as const) {
      // Only an Apprentice is left and every central location it could use is full.
      const table = work({
        players: [{ kilnId, resources: RICH, hand: ["S07"] }, { kilnId: kilnId === "DI" ? "GE" : "DI" }],
        placements: [
          { player: "p2", worker: "shifu", locationId: "materials_yard" },
          { player: "p2", worker: 1, locationId: "materials_yard" },
          { player: "p2", worker: 2, locationId: "commission_market" },
          { player: "p2", worker: 3, locationId: "commission_market" },
          { player: "p1", worker: "shifu", locationId: "guild_hall" },
          { player: "p1", worker: 1, locationId: "guild_hall" },
          { player: "p1", worker: 2, locationId: "canal_wharf" },
        ],
      });
      const choice = decide(table);
      expect(choice.type, kilnId).toBe("PLACE_FORM_DECORATE");
      if (choice.type !== "PLACE_FORM_DECORATE") continue;
      expect(["carved", "impressed", "painted"], kilnId).toContain(choice.vessels[0]?.decoration);
    }
  });

  it("takes 2 Techs from different disciplines at printed cost at the Guild Hall, then returns the inspected Techs in look order (v1.6.2 L207, B2)", () => {
    const table = work({ round: 1, players: [{ kilnId: "GE", resources: { clay: 3, wood: 3, coins: 9 } }, { kilnId: "DI" }] });
    table.act("p1", { type: "PLACE_GUILD_HALL", workerId: "p1:shifu", choice: { kind: "inspect", discipline: "firing" } });
    const inspected = table.state.hidden.pendingLook?.kind === "guild_inspection" ? [...table.state.hidden.pendingLook.techIds] : [];
    expect(inspected).toHaveLength(2);
    const takes: string[] = [];
    let finish: AuthoritativeCommand | null = null;
    for (let step = 0; step < 6; step += 1) {
      const phase = table.state.phase;
      if (phase.type !== "work_turn" || phase.step.kind === "after_action") break;
      const choice = decide(table);
      if (choice.type === "GUILD_TAKE") takes.push(choice.take.techId);
      if (choice.type === "GUILD_FINISH") finish = choice;
      play(table, choice);
    }
    const owned = table.state.players["p1"]?.techs.map((tech) => tech.id) ?? [];
    expect(owned).toEqual(takes);
    expect(takes).toHaveLength(2);
    expect(new Set(takes.map((techId) => TECHS[techId as TechId].discipline)).size).toBe(2);
    expect(table.state.players["p1"]?.resources.coins).toBe(9 - takes.reduce((sum, techId) => sum + TECHS[techId as TechId].cost, 0));
    const untaken = inspected.filter((techId) => !takes.includes(techId));
    if (untaken.length > 1) expect(finish).toEqual({ type: "GUILD_FINISH", bottomOrder: untaken });
    expect(table.state.hidden.techDecks.firing.slice(-untaken.length)).toEqual(untaken);
  });

  it("has no Canal Barge decision in the Work Phase and completes the Order in the Order Phase, for its 2 Coins (v1.6.2 L622)", () => {
    // A completable Order in hand opens no after-action window for Canal Barge: the turn passes.
    const table = work({
      round: 3,
      players: [{ kilnId: "GE", techs: ["T23"], resources: RICH, hand: ["O02"] }, { kilnId: "DI" }],
      ceramics: [{ owner: "p1", stage: "finished", shape: "plate", glaze: "celadon", quality: "fine" }],
    });
    table.act("p1", { type: "PLACE_CANAL_WHARF", workerId: "p1:apprentice:1" });
    expect(table.state.phase).toMatchObject({ type: "work_turn", activePlayerId: "p2", step: { kind: "before_action" } });
    expect(table.state.players["p1"]?.completedOrders).toEqual([]);

    const orders = new LocalTable(
      buildState({
        round: 3,
        players: [{ kilnId: "GE", techs: ["T23"], hand: ["O02"], resources: { coins: 1 } }, { kilnId: "DI" }],
        phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 },
        ceramics: [{ owner: "p1", stage: "finished", shape: "plate", glaze: "celadon", quality: "fine" }],
      }),
      { flow: "halt", pass: ["worker_action_done"] },
    );
    const complete = decide(orders);
    expect(complete).toMatchObject({ type: "COMPLETE_ORDER", orderId: "O02" });
    play(orders, complete);
    expect(orders.state.players["p1"]?.resources.coins).toBe(1 + 3 + 2);
  });

  it("discards its least achievable Order at the hand limit", () => {
    const table = new LocalTable(
      buildState({
        players: [{ kilnId: "GE", hand: ["S08", "O01", "O47", "S07", "S01"] }, { kilnId: "DI" }],
        phase: { type: "cleanup_hand_limit", pendingPlayerIds: ["p1"], openedAtRevision: 1 },
      }),
      { flow: "halt" },
    );
    expect(decide(table)).toEqual({ type: "DISCARD_TO_HAND_LIMIT", orderIds: ["O47"] });
  });
});
