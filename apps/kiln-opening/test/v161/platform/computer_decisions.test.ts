/**
 * The strategic computer player makes sensible choices in clear-cut situations (DESIGN §9.2
 * P9): Glazes aimed at the expected heat, Contributions that steer Base Heat toward its own
 * loads, Heat markers, Jun, Ge, Protective Saggars, Second Firing and salvage used when they
 * pay, Orders completed greedily by value, vessels formed for held Orders, reservations that
 * fit its pipeline, and hand-limit discards of the least achievable Orders. Every choice is
 * also checked against the engine.
 */

import { describe, expect, it } from "vitest";
import { SeededRandom, createGame, preferredHeat, validateAction, zoneModifier } from "../../../src/game/index.ts";
import type { AuthoritativeCommand, Glaze, KilnSpaceId, PlayerId } from "../../../src/game/index.ts";
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
      players: [{ kilnId: "GE", resources: RICH, hand: ["S16"] }, { kilnId: "DI" }],
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
      players: [{ kilnId: "GE", recognition: 3, hand: ["S07"] }, { kilnId: "DI" }],
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

  it("lifts a Standard ceramic with Protective Saggars", () => {
    const table = fired(
      {
        players: [{ kilnId: "DI", techs: ["T11"], resources: { wood: 2 } }, { kilnId: "RU" }],
        ceramics: [{ owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "high_1" }],
      },
      [1, 0, -1],
    );
    expect(decide(table)).toMatchObject({ type: "USE_PROTECTIVE_SAGGARS" });
  });

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

  it("completes the most valuable Order its ceramics allow", () => {
    const table = new LocalTable(
      buildState({
        players: [{ kilnId: "GE", hand: ["S16", "O16"] }, { kilnId: "DI" }],
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
    [3, "O18"],
    [5, "O15"],
  ] as const)("values a Crown by what its milestone can still do (Round %i → %s)", (round, expected) => {
    // One Fine Celadon Vase fits O18 (6 VP, 2 Coins, 1 Crown) and O15 (6 VP, 4 Coins). Early,
    // the Imperial Grant's Clay, Wood and Coin and the road to the Imperial Kiln are worth the
    // Crown; after the last firing the Grant is only its Coin, so O15's Coins score more.
    const table = new LocalTable(
      buildState({
        round,
        players: [{ kilnId: "GE", hand: ["O18", "O15"], resources: { coins: 2 } }, { kilnId: "DI" }],
        phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 },
        ceramics: [{ owner: "p1", stage: "finished", shape: "vase", glaze: "celadon", quality: "fine" }],
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
      players: [{ kilnId: "GE", resources: RICH, hand: ["S16"] }, { kilnId: "DI" }],
      ceramics: [{ owner: "p1", stage: "finished", shape: "plate", glaze: "celadon", quality: "fine" }],
      mainDeck: ["O47", "O02", "O48"],
    });
    table.act("p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:shifu", first: { kind: "look_top_three" } });
    expect(decide(table)).toEqual({ type: "COMMISSION_CHOOSE_LOOKED", orderId: "O02" });
  });

  it("discards its least achievable Order at the hand limit", () => {
    const table = new LocalTable(
      buildState({
        players: [{ kilnId: "GE", hand: ["S16", "O01", "O47", "S10", "S01"] }, { kilnId: "DI" }],
        phase: { type: "cleanup_hand_limit", pendingPlayerIds: ["p1"], openedAtRevision: 1 },
      }),
      { flow: "halt" },
    );
    expect(decide(table)).toEqual({ type: "DISCARD_TO_HAND_LIMIT", orderIds: ["O47"] });
  });
});
