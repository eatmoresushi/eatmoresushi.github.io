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

  // Setup step 9: reverse-order Kiln and face-up Main Order choice over all five Kilns (rev. 4
  // L130, R1, R23).
  {
    const created = createGame({ gameId: "scenario-setup", players: [{ id: "p1", displayName: "A" }, { id: "p2", displayName: "B" }, { id: "p3", displayName: "C" }] }, new SeededRandom(3));
    if (!created.ok) {
      throw new Error("createGame failed");
    }
    const table = new LocalTable(created.state, { seed: 3 });
    add("Kiln and Main Order choice", table, table.prompt().actorIds[0] as PlayerId, (c) => c.type === "SELECT_KILN");
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
    "before the worker action: Colour Samples swap, Imperial Priority with Reworking Table, Ding",
    work({
      players: [{ kilnId: "DI", techs: ["T05", "T10", "T14"], recognition: 3, resources: RICH, hand: ["O01", "S01"] }, { kilnId: "RU" }],
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

  add(
    "before the worker action: Kiln Master at loading, the Magistrate's Hall Shifu's Crown Order, the kiln fuel",
    work({
      players: [{ techs: ["T24"], recognition: 1, resources: RICH }, {}],
      display: ["O01", "O17", "O02", "O40", "O03", "O04"],
      ceramics: [
        { owner: "p1", stage: "shaped", shape: "bowl" },
        { owner: "p1", stage: "shaped", shape: "plate", decoration: "carved" },
      ],
    }),
    "p1",
    (c) => c.type === "PLACE_CANAL_WHARF",
  );

  {
    const table = work({ players: [{ resources: RICH }, {}] });
    table.act("p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:shifu" });
    add(
      "Commission Market: Shifu top-3 look, 2 reservations",
      table,
      "p1",
      (c) => c.type === "SELECT_CHOOSE" && c.reservations.length === 2 && c.reservations.some((pick) => pick.kind === "looked"),
    );
  }
  {
    const table = work({ players: [{ resources: RICH }, {}] });
    table.act("p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:apprentice:1" });
    add("Commission Market: Apprentice top-2 look, 1 reservation", table, "p1", (c) => c.type === "SELECT_CHOOSE" && c.reservations[0]?.kind === "looked");
  }
  {
    const table = work({ players: [{ resources: RICH, techs: ["T01"] }, {}] });
    table.act("p1", { type: "PLACE_GUILD_HALL", workerId: "p1:shifu", choice: { kind: "inspect", discipline: "firing" } });
    add("Guild Hall: Shifu inspection", table, "p1", (c) => c.type === "GUILD_TAKE");
  }
  {
    const table = work({ players: [{ resources: RICH }, {}], techDisplay: { glazing_loading: ["T10", "T20"] } });
    table.act("p1", { type: "PLACE_GUILD_HALL", workerId: "p1:apprentice:1", choice: { kind: "buy_face_up", techId: "T10" } });
    add("Colour Samples choice", table, "p1", (c) => c.type === "SELECT_CHOOSE" && c.reservations[0]?.kind === "looked");
  }
  {
    const table = work({ players: [{ techs: ["T10"], hand: ["O40", "S01"] }, {}] });
    table.act("p1", { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: "S01" });
    add("Colour Samples swap look", table, "p1", (c) => c.type === "SELECT_CHOOSE" && c.reservations[0]?.kind === "looked");
  }
  {
    const table = work({
      players: [{ techs: ["T10"], recognition: 3, hand: ["O01"] }, {}],
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
    add("Second Firing choice with Jun (R7)", table, "p1", (c) => c.type === "SECOND_FIRING_CHOOSE" && c.cardIndex === 0 && c.jun === null);
  }
  // Free actions after the worker action (rev. 5 L168–176, R27): a held Order with a Finished
  // ceramic and a Finished Flawed ceramic open the window; the player may complete, sell, or end.
  {
    const table = work({
      players: [{ hand: ["S08"] }, {}],
      ceramics: [
        { owner: "p1", stage: "finished", shape: "plate", glaze: "white", quality: "standard" },
        { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "flawed" },
      ],
    });
    table.act("p1", { type: "PLACE_CANAL_WHARF", workerId: "p1:apprentice:1" });
    add("After the worker action: complete an Order and sell (free actions)", table, "p1", (c) => c.type === "END_TURN");
  }
  // Imperial Priority in the Order Phase (rev. 5 L174, L314, R28): the token alone opens the turn;
  // the ceramic would wait for the next round's firing.
  add(
    "Order Phase: Imperial Priority",
    new LocalTable(
      buildState({
        round: 2,
        players: [{ recognition: 3 }, {}],
        phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 },
        ceramics: [{ owner: "p1", stage: "shaped", shape: "vase" }],
      }),
    ),
    "p1",
    (c) => c.type === "END_ORDER_TURN",
  );
  // The Order Phase turn opens for a Finished Flawed ceramic even with nothing to complete (R28);
  // the player may sell it (SELL_FLAWED, a free action) or end the turn.
  add(
    "Order Phase: sell a Flawed ceramic",
    new LocalTable(
      buildState({
        players: [{ hand: ["O22"] }, {}],
        phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 },
        ceramics: [{ owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "flawed" }],
      }),
    ),
    "p1",
    (c) => c.type === "END_ORDER_TURN",
  );
  add(
    "Order Phase with Ru and Tribute Ware",
    new LocalTable(
      buildState({
        players: [{ kilnId: "RU", techs: ["T25"], hand: ["O22", "O18", "S01"] }, { kilnId: "GE" }],
        phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 },
        ceramics: [
          { owner: "p1", stage: "finished", shape: "bowl", glaze: "celadon", decoration: "plain", quality: "masterpiece" },
          { owner: "p1", stage: "finished", shape: "plate", glaze: "celadon", decoration: "plain", quality: "masterpiece" },
          { owner: "p1", stage: "finished", shape: "vase", glaze: "celadon", quality: "fine" },
          { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "standard" },
        ],
      }),
      { flow: "halt", pass: ["worker_action_done"] },
    ),
    "p1",
    (c) => c.type === "END_ORDER_TURN",
  );
  // Only Ge makes Crackle (rev. 5 L482), so the wildcard scenario is a Ge owner's. Since change 39
  // a Crackle ceramic keeps its Quality: the crackled Masterpiece may declare Painted for O13
  // (Masterpiece), the crackled Fine vase a Carved, Impressed or Painted Decoration for S07.
  add(
    "Order Phase with a Crackle wildcard",
    new LocalTable(
      buildState({
        players: [{ kilnId: "GE", hand: ["O13", "S07", "S01"] }, { kilnId: "RU" }],
        phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 },
        ceramics: [
          { owner: "p1", stage: "finished", shape: "plate", glaze: "celadon", decoration: "plain", quality: "masterpiece", crackle: true },
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
