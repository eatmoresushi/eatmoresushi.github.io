/**
 * Scripted decisions covering every phase and Work-turn step (DESIGN §3.1–3.6), for the
 * `legal_actions` and `selector_agreement` suites. Each scenario is a `LocalTable` (production
 * flow unless noted) positioned at a decision, plus the actor and the §3.6 always-legal exit.
 */

import { SeededRandom } from "../../../src/game/rng.ts";
import { createGame } from "../../../src/game/engine.ts";
import type { AuthoritativeCommand, GamePhaseType, PlayerId } from "../../../src/game/types.ts";
import { richStartState } from "./p7_support.ts";
import { buildState, type StateSpec } from "./support/fixtures.ts";
import { openFiringTable, tendAll } from "./support/firing.ts";
import { LocalTable } from "./support/localTable.ts";

export interface PhaseScenario {
  name: string;
  phase: GamePhaseType;
  table: LocalTable;
  actor: PlayerId;
  /** The §3.6 always-legal exit, when the phase has one independent of the scenario. */
  exit: ((command: AuthoritativeCommand) => boolean) | null;
}

const RICH = { clay: 9, wood: 9, coins: 9 };

function work(spec: StateSpec): LocalTable {
  return new LocalTable(buildState(spec));
}

function fired(spec: StateSpec): LocalTable {
  const table = openFiringTable({ fireDeck: [0, 1, -1], ...spec });
  tendAll(table);
  return table;
}

/** Every scenario, freshly built (tables are mutable). */
export function phaseScenarios(): PhaseScenario[] {
  const scenarios: PhaseScenario[] = [];
  const add = (name: string, table: LocalTable, actor: PlayerId, exit: PhaseScenario["exit"]) => {
    scenarios.push({ name, phase: table.state.phase.type, table, actor, exit });
  };

  // Setup: reverse-order Kiln selection over all five Kilns (L108, R1).
  {
    const created = createGame({ gameId: "scenario-setup", players: [{ id: "p1", displayName: "A" }, { id: "p2", displayName: "B" }, { id: "p3", displayName: "C" }] }, new SeededRandom(3));
    if (!created.ok) {
      throw new Error("createGame failed");
    }
    const table = new LocalTable(created.state, { seed: 3 });
    add("Kiln selection", table, table.prompt().actorIds[0] as PlayerId, (c) => c.type === "SELECT_KILN");
  }

  add(
    "Setter's Mark window",
    work({ players: [{ techs: ["T22"] }, {}], phase: { type: "round_start_setters_mark", queue: { actorIds: ["p1"], index: 0 } } }),
    "p1",
    (c) => c.type === "PLACE_SETTERS_MARK" && c.spaceId === null,
  );

  add("before the worker action (rich 4-player start)", new LocalTable(richStartState(11, 4)), "", (c) => c.type === "PLACE_CANAL_WHARF");
  const rich = scenarios[scenarios.length - 1];
  if (rich !== undefined) {
    rich.actor = rich.table.prompt().actorIds[0] as PlayerId;
  }

  add(
    "before the worker action: Canal Barge, Imperial Priority with Reworking Table, Ding",
    work({
      players: [{ kilnId: "DI", techs: ["T05", "T23", "T14"], recognition: 3, resources: RICH, hand: ["O01", "S01"] }, { kilnId: "RU" }],
      ceramics: [
        { owner: "p1", stage: "shaped", shape: "vase", decoration: "carved" },
        { owner: "p1", stage: "shaped", shape: "bowl" },
        { owner: "p1", stage: "shaped", shape: "bowl" },
        { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "standard" },
      ],
    }),
    "p1",
    (c) => c.type === "PLACE_CANAL_WHARF",
  );

  add(
    "before the worker action: Kiln Furniture, Inverted Firing targets, Setter's Marks, Senior Apprentice",
    work({
      players: [{ techs: ["T21", "T18"], resources: RICH }, { techs: ["T22"] }, {}],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "plate", glaze: "white", at: "middle_1" },
        { owner: "p1", stage: "shaped", shape: "bowl" },
        { owner: "p1", stage: "shaped", shape: "censer", decoration: "painted" },
      ],
      settersMarks: { high_1: "p2" },
    }),
    "p1",
    (c) => c.type === "PLACE_CANAL_WHARF",
  );

  {
    const table = work({ players: [{ resources: RICH }, {}] });
    const orderId = table.state.market.display[0];
    if (orderId === null || orderId === undefined) {
      throw new Error("no display");
    }
    table.act("p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:shifu", first: { kind: "face_up", slotIndex: 0, orderId, gain: "clay" } });
    add("Commission Market: second reservation or stop", table, "p1", (c) => c.type === "COMMISSION_STOP");
  }
  {
    const table = work({ players: [{ resources: RICH }, {}] });
    table.act("p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:shifu", first: { kind: "look_top_three" } });
    add("Commission Market: top-3 choice", table, "p1", (c) => c.type === "COMMISSION_CHOOSE_LOOKED");
  }
  {
    const table = work({ players: [{ resources: RICH }, {}] });
    table.act("p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:apprentice:1", first: { kind: "blind" } });
    add("Commission Market: resource after a blind reservation", table, "p1", (c) => c.type === "COMMISSION_GAIN");
  }
  {
    const table = work({ players: [{ resources: RICH, techs: ["T01"] }, {}] });
    table.act("p1", { type: "PLACE_GUILD_HALL", workerId: "p1:shifu", choice: { kind: "inspect", discipline: "firing" } });
    add("Guild Hall: Shifu inspection", table, "p1", (c) => c.type === "GUILD_TAKE");
  }
  {
    const table = work({ players: [{ resources: RICH }, {}], techDisplay: { glazing_loading: ["T10", "T20"] } });
    table.act("p1", { type: "PLACE_GUILD_HALL", workerId: "p1:apprentice:1", choice: { kind: "buy_face_up", techId: "T10" } });
    add("Colour Samples choice", table, "p1", (c) => c.type === "COLOUR_SAMPLES_CHOOSE");
  }
  {
    const table = work({
      players: [{ techs: ["T23"], recognition: 3, hand: ["O01"] }, {}],
      ceramics: [
        { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "standard" },
        { owner: "p1", stage: "shaped", shape: "plate" },
      ],
    });
    table.act("p1", { type: "PLACE_CANAL_WHARF", workerId: "p1:apprentice:1" });
    add("after the worker action", table, "p1", (c) => c.type === "END_TURN");
  }

  add(
    "secret Contributions with Fuel Ledger",
    openFiringTable({
      players: [{ techs: ["T12"], resources: { wood: 3 } }, {}],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1" },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1" },
      ],
    }),
    "p1",
    (c) => c.type === "SUBMIT_CONTRIBUTION" && c.card === "TEND",
  );

  {
    const table = fired({
      players: [{ techs: ["T13"] }, { kilnId: "JU" }],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1" },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_1" },
      ],
    });
    add("Test Pieces decision", table, "p1", (c) => c.type === "TEST_PIECES_DECIDE" && !c.peek);
  }
  {
    const table = fired({
      players: [{ techs: ["T13"] }, {}],
      ceramics: [{ owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1" }],
    });
    table.act("p1", { type: "TEST_PIECES_DECIDE", peek: true });
    add("Test Pieces bury", table, "p1", (c) => c.type === "TEST_PIECES_BURY" && !c.bury);
  }
  add(
    "Heat-marker step with a face-down marker and Kiln Master",
    fired({
      players: [{ techs: ["T24"] }, {}],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1", heatMarker: { source: "own", faceDown: true } },
        { owner: "p1", stage: "loaded", shape: "plate", glaze: "celadon", at: "high_1" },
      ],
    }),
    "p1",
    (c) => c.type === "RESOLVE_HEAT_MARKERS" && c.ownMarker === "return" && c.kilnMaster === undefined,
  );
  add(
    "Jun heat adjustment",
    fired({
      players: [{ kilnId: "JU" }, {}],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1" },
        { owner: "p1", stage: "loaded", shape: "plate", glaze: "celadon", at: "high_1" },
      ],
    }),
    "p1",
    (c) => c.type === "RESOLVE_JUN" && c.adjustment === null,
  );
  add(
    "after Quality: Saggars and Ge",
    fired({
      players: [{ kilnId: "GE", techs: ["T11"] }, {}],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "middle_1" },
        { owner: "p1", stage: "loaded", shape: "plate", glaze: "moon_white", at: "low_1" },
        { owner: "p1", stage: "loaded", shape: "vase", glaze: "celadon", at: "high_1" },
      ],
    }),
    "p1",
    (c) => c.type === "END_AFTER_QUALITY",
  );
  {
    const table = fired({
      players: [{ kilnId: "JU", techs: ["T14"] }, {}],
      ceramics: [{ owner: "p1", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_1" }],
    });
    table.act("p1", { type: "RESOLVE_JUN", adjustment: null });
    table.act("p1", { type: "USE_SECOND_FIRING", ceramicId: "c1" });
    add("Jun during Second Firing (R7)", table, "p1", (c) => c.type === "RESOLVE_JUN" && c.adjustment === null);
  }
  add(
    "salvage",
    fired({
      players: [{}, {}],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "low_1" },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "moon_white", at: "middle_1" },
      ],
    }),
    "p1",
    (c) => c.type === "SALVAGE_FLAWED" && c.ceramicId === null,
  );
  add(
    "Order Phase with Ru, Tribute Ware and a Crackle wildcard",
    new LocalTable(
      buildState({
        players: [{ kilnId: "RU", techs: ["T25"], hand: ["O22", "O18", "S01", "S13"] }, { kilnId: "GE" }],
        phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 },
        ceramics: [
          { owner: "p1", stage: "finished", shape: "bowl", glaze: "celadon", decoration: "plain", quality: "masterpiece" },
          { owner: "p1", stage: "finished", shape: "plate", glaze: "celadon", decoration: "plain", quality: "masterpiece" },
          { owner: "p1", stage: "finished", shape: "vase", glaze: "celadon", quality: "fine", crackle: true },
          { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "standard" },
        ],
      }),
      { flow: "halt", pass: ["worker_action_done"] },
    ),
    "p1",
    (c) => c.type === "END_ORDER_TURN",
  );
  add(
    "Cleanup hand limit",
    new LocalTable(
      buildState({
        players: [{ hand: ["S01", "S02", "O01", "O02", "O03", "O04"] }, {}],
        phase: { type: "cleanup_hand_limit", pendingPlayerIds: ["p1"], openedAtRevision: 1 },
      }),
      { flow: "halt" },
    ),
    "p1",
    null,
  );
  return scenarios;
}
