import { describe, expect, it } from "vitest";
import { COMMAND_TYPES, parseCommand } from "../../../src/game/actionGuard.ts";
import { isGameRuleError } from "../../../src/game/errors.ts";
import { END_TURN_COMMAND_TYPES } from "../../../src/game/freeActionWindow.ts";
import type { AuthoritativeCommand } from "../../../src/game/types.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

/** One well-formed example of every command type (DESIGN §2.5). */
const VALID: { [K in AuthoritativeCommand["type"]]: Array<Extract<AuthoritativeCommand, { type: K }>> } = {
  // Setup step 9: the Kiln and a face-up Main Order in one command (L130, R23).
  SELECT_KILN: [{ type: "SELECT_KILN", kilnId: "DI", mainOrder: { slotIndex: 3, orderId: "O12" } }],
  PLACE_SETTERS_MARK: [
    { type: "PLACE_SETTERS_MARK", spaceId: "high_1" },
    { type: "PLACE_SETTERS_MARK", spaceId: null },
  ],
  PLACE_MATERIALS_YARD: [
    { type: "PLACE_MATERIALS_YARD", workerId: "p1:apprentice:1", clay: 2, wood: 1 },
    {
      type: "PLACE_MATERIALS_YARD",
      workerId: "p1:shifu",
      clay: 8,
      wood: 0,
      seniorApprentice: false,
      preparedClay: { shape: "vase", decoration: "painted", useDecoratorsKit: false },
    },
  ],
  PLACE_FORM_DECORATE: [
    {
      type: "PLACE_FORM_DECORATE",
      workerId: "p1:shifu",
      vessels: [
        { shape: "bowl", decoration: "carved" },
        { shape: "censer", decoration: "plain" },
      ],
      dingExtra: { copyOfVesselIndex: 0, decoration: "impressed" },
      useLargeThrowingWheel: true,
      decoratorsKitVesselIndex: 0,
    },
  ],
  PLACE_GLAZE_LOAD: [
    {
      type: "PLACE_GLAZE_LOAD",
      workerId: "p1:shifu",
      loads: [
        { ceramicId: "c1", glaze: "celadon", destination: { kiln: "shared", spaceId: "low_2", kilnFurniture: -1 } },
        {
          ceramicId: "c12",
          glaze: "moon_white",
          destination: { kiln: "shared", spaceId: "low_2", invertedFiring: true },
          reworkShape: "plate",
        },
        // Kiln Master's marker at loading (L647, R22).
        { ceramicId: "c3", glaze: "white", destination: { kiln: "imperial", imperialModifier: 1 }, kilnMaster: -1 },
      ],
    },
  ],
  PLACE_COMMISSION_MARKET: [
    { type: "PLACE_COMMISSION_MARKET", workerId: "p1:apprentice:2", seniorApprentice: true },
    { type: "PLACE_COMMISSION_MARKET", workerId: "p1:shifu" },
  ],
  PLACE_GUILD_HALL: [
    { type: "PLACE_GUILD_HALL", workerId: "p1:apprentice:3", choice: { kind: "buy_face_up", techId: "T25" } },
    { type: "PLACE_GUILD_HALL", workerId: "p1:shifu", choice: { kind: "inspect", discipline: "glazing_loading" } },
  ],
  PLACE_CANAL_WHARF: [{ type: "PLACE_CANAL_WHARF", workerId: "player-a:apprentice:1" }],
  PLACE_MAGISTRATES_HALL: [
    { type: "PLACE_MAGISTRATES_HALL", workerId: "p2:shifu" },
    // The Shifu's optional Crown Order (L259, R21).
    { type: "PLACE_MAGISTRATES_HALL", workerId: "p2:shifu", crownOrder: { slotIndex: 0, orderId: "O17" } },
  ],
  // One command for every Select: the Commission Market's and both Colour Samples looks
  // (v1.6.2 L80, change 25).
  SELECT_CHOOSE: [
    { type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: "O07" }] },
    { type: "SELECT_CHOOSE", reservations: [{ kind: "face_up", slotIndex: 5, orderId: "O48" }, { kind: "looked", orderId: "O07" }] },
    { type: "SELECT_CHOOSE", reservations: [{ kind: "face_up", slotIndex: 0, orderId: "O31" }] },
    // The count is the validator's business (RESERVATION_REQUIRED / RESERVATION_LIMIT).
    { type: "SELECT_CHOOSE", reservations: [] },
  ],
  GUILD_TAKE: [
    { type: "GUILD_TAKE", take: { kind: "inspected", techId: "T13" } },
    { type: "GUILD_TAKE", take: { kind: "face_up", techId: "T01" } },
  ],
  GUILD_FINISH: [
    { type: "GUILD_FINISH", bottomOrder: ["T14"] },
    // The permutation is the validator's business (INVALID_BOTTOM_ORDER).
    { type: "GUILD_FINISH", bottomOrder: [] },
  ],
  USE_COLOUR_SAMPLES_SWAP: [
    { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: "O40" },
    // A Starting Order may be discarded too (to the box, v1.6.2 L656).
    { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: "S03" },
  ],
  USE_IMPERIAL_PRIORITY: [
    { type: "USE_IMPERIAL_PRIORITY", ceramicId: "c9", glaze: "grey_green", imperialModifier: -1, reworkShape: "washer" },
    { type: "USE_IMPERIAL_PRIORITY", ceramicId: "c9", glaze: "white", imperialModifier: 0, kilnMaster: 1 },
  ],
  END_TURN: [{ type: "END_TURN" }],
  TEST_PIECES_DECIDE: [{ type: "TEST_PIECES_DECIDE", peek: true }],
  TEST_PIECES_BURY: [{ type: "TEST_PIECES_BURY", bury: false }],
  RESOLVE_JUN: [
    { type: "RESOLVE_JUN", adjustment: null },
    { type: "RESOLVE_JUN", adjustment: { ceramicId: "c2", delta: 1 } },
  ],
  USE_PROTECTIVE_SAGGARS: [{ type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c1" }],
  USE_SECOND_FIRING: [{ type: "USE_SECOND_FIRING", ceramicId: "c1" }],
  SECOND_FIRING_CHOOSE: [
    { type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: null },
    { type: "SECOND_FIRING_CHOOSE", cardIndex: 1, jun: { delta: -1 } },
  ],
  USE_GE_CRACKLE: [{ type: "USE_GE_CRACKLE", ceramicId: "c1" }],
  END_AFTER_QUALITY: [{ type: "END_AFTER_QUALITY" }],
  // R20: one Flawed ceramic per sale.
  SELL_FLAWED: [{ type: "SELL_FLAWED", ceramicId: "c7" }],
  COMPLETE_ORDER: [
    { type: "COMPLETE_ORDER", orderId: "O01", ceramicIds: ["c1"] },
    { type: "COMPLETE_ORDER", orderId: "O02", ceramicIds: ["c1", "c2"], crackleDeclarations: [] },
  ],
  END_ORDER_TURN: [{ type: "END_ORDER_TURN" }],
  DISCARD_TO_HAND_LIMIT: [{ type: "DISCARD_TO_HAND_LIMIT", orderIds: ["S01", "O40"] }],
  // The 5 V1.6.2 cards (change 26); whether the player holds one is the validator's business.
  SUBMIT_CONTRIBUTION: [
    { type: "SUBMIT_CONTRIBUTION", windowId: "g1:r2:contributions", card: "STOKE" },
    { type: "SUBMIT_CONTRIBUTION", windowId: "g1:r2:contributions", card: "FUEL_LEDGER_BANK" },
    { type: "SUBMIT_CONTRIBUTION", windowId: "g1:r2:contributions", card: "FUEL_LEDGER_STOKE" },
  ],
};

function expectMalformed(input: unknown, field: string): void {
  const result = parseCommand(input);
  expect(isGameRuleError(result), JSON.stringify(input)).toBe(true);
  if (!isGameRuleError(result)) {
    return;
  }
  expect(result.code).toBe("MALFORMED_ACTION");
  expect(result.details).toEqual({ field });
  expectDocumentedDetails(result);
}

describe("parseCommand: well-formed commands", () => {
  it("has an example for every command type, SUBMIT_CONTRIBUTION included", () => {
    expect(Object.keys(VALID).sort()).toEqual([...COMMAND_TYPES].sort());
    expect(COMMAND_TYPES).toContain("SUBMIT_CONTRIBUTION");
    // 31 before owner revision 3; change 25 merged three Select choices into SELECT_CHOOSE;
    // revision 4 removed RESOLVE_HEAT_MARKERS (changes 28, 31).
    expect(COMMAND_TYPES).toHaveLength(28);
  });

  it.each(Object.values(VALID).flat().map((command) => [command.type, command] as const))(
    "accepts %s and returns a fresh, equal object",
    (_type, command) => {
      const input = JSON.parse(JSON.stringify(command)) as unknown;
      const parsed = parseCommand(input);
      expect(isGameRuleError(parsed)).toBe(false);
      expect(parsed).toEqual(command);
      expect(parsed).not.toBe(input);
    },
  );

  it("never aliases nested input objects", () => {
    const input = {
      type: "PLACE_GLAZE_LOAD",
      workerId: "p1:apprentice:1",
      loads: [{ ceramicId: "c1", glaze: "white", destination: { kiln: "shared", spaceId: "high_1" } }],
    };
    const parsed = parseCommand(input);
    input.loads[0]!.destination.spaceId = "low_1";
    expect(parsed).toEqual({
      type: "PLACE_GLAZE_LOAD",
      workerId: "p1:apprentice:1",
      loads: [{ ceramicId: "c1", glaze: "white", destination: { kiln: "shared", spaceId: "high_1" } }],
    });
  });

  it("normalises -0 counts to +0 so parsed commands survive a jsonb round trip unchanged", () => {
    const parsed = parseCommand(JSON.parse('{"type":"PLACE_MATERIALS_YARD","workerId":"p1:shifu","clay":-0,"wood":4}'));
    expect(parsed).toEqual({ type: "PLACE_MATERIALS_YARD", workerId: "p1:shifu", clay: 0, wood: 4 });
    expect(Object.is((parsed as { clay: number }).clay, -0)).toBe(false);
  });

  it("treats an optional key holding undefined as absent, so the result is JSON-safe", () => {
    const parsed = parseCommand({
      type: "PLACE_MATERIALS_YARD",
      workerId: "p1:shifu",
      clay: 8,
      wood: 0,
      seniorApprentice: undefined,
      preparedClay: undefined,
    });
    expect(parsed).toEqual({ type: "PLACE_MATERIALS_YARD", workerId: "p1:shifu", clay: 8, wood: 0 });
    expect(Object.keys(parsed)).not.toContain("seniorApprentice");
  });
});

const MALFORMED: Array<[label: string, input: unknown, field: string]> = [
  ["a non-object", "PLACE_CANAL_WHARF", "command"],
  ["null", null, "command"],
  ["an array", [{ type: "END_TURN" }], "command"],
  ["a class instance", new Date(0), "command"],
  ["a missing type", { workerId: "p1:shifu" }, "type"],
  ["an unknown type", { type: "REVEAL_FIRE" }, "type"],
  ["a non-string type", { type: 7 }, "type"],
  ["an inherited type name", { type: "toString" }, "type"],
  ["an unknown key", { type: "END_TURN", extra: true }, "extra"],
  ["a missing field", { type: "PLACE_CANAL_WHARF" }, "workerId"],
  ["a malformed worker ID", { type: "PLACE_CANAL_WHARF", workerId: "__proto__" }, "workerId"],
  ["an Apprentice ID without a number", { type: "PLACE_CANAL_WHARF", workerId: "p1:apprentice" }, "workerId"],
  ["a malformed ceramic ID", { type: "USE_GE_CRACKLE", ceramicId: "constructor" }, "ceramicId"],
  ["an unknown Kiln", { type: "SELECT_KILN", kilnId: "XX", mainOrder: { slotIndex: 0, orderId: "O01" } }, "kilnId"],
  ["a lower-case Kiln", { type: "SELECT_KILN", kilnId: "ru", mainOrder: { slotIndex: 0, orderId: "O01" } }, "kilnId"],
  // Revision 4 (change 32, R23): the Setup Main Order is part of the Kiln choice.
  ["a Kiln choice without the Main Order", { type: "SELECT_KILN", kilnId: "RU" }, "mainOrder"],
  ["a Setup Main Order without a slot", { type: "SELECT_KILN", kilnId: "RU", mainOrder: { orderId: "O01" } }, "mainOrder.slotIndex"],
  ["a Setup Main Order at a negative slot", { type: "SELECT_KILN", kilnId: "RU", mainOrder: { slotIndex: -1, orderId: "O01" } }, "mainOrder.slotIndex"],
  ["a Setup Starting-like unknown Order", { type: "SELECT_KILN", kilnId: "RU", mainOrder: { slotIndex: 0, orderId: "S17" } }, "mainOrder.orderId"],
  ["an extra key in the Setup Main Order", { type: "SELECT_KILN", kilnId: "RU", mainOrder: { slotIndex: 0, orderId: "O01", blind: true } }, "mainOrder.blind"],
  ["an unknown space", { type: "PLACE_SETTERS_MARK", spaceId: "high_4" }, "spaceId"],
  ["a missing nullable space", { type: "PLACE_SETTERS_MARK" }, "spaceId"],
  ["a negative resource split", { type: "PLACE_MATERIALS_YARD", workerId: "p1:shifu", clay: -1, wood: 5 }, "clay"],
  ["a fractional resource split", { type: "PLACE_MATERIALS_YARD", workerId: "p1:shifu", clay: 1.5, wood: 2 }, "clay"],
  ["a string resource split", { type: "PLACE_MATERIALS_YARD", workerId: "p1:shifu", clay: "3", wood: 0 }, "clay"],
  [
    "a non-boolean option",
    { type: "PLACE_MATERIALS_YARD", workerId: "p1:apprentice:1", clay: 6, wood: 0, seniorApprentice: "yes" },
    "seniorApprentice",
  ],
  // V1.6.2 removed the Shifu's 1-Coin +1 Clay +1 Wood option (v1.6.2 L195).
  ["the retired Materials Yard bonus", { type: "PLACE_MATERIALS_YARD", workerId: "p1:shifu", clay: 6, wood: 0, buyShifuBonus: true }, "buyShifuBonus"],
  [
    "an unknown Prepared Clay key",
    { type: "PLACE_MATERIALS_YARD", workerId: "p1:shifu", clay: 4, wood: 0, preparedClay: { shape: "bowl", decoration: "plain", glaze: "white" } },
    "preparedClay.glaze",
  ],
  ["a retired Decoration", { type: "PLACE_FORM_DECORATE", workerId: "p1:shifu", vessels: [{ shape: "bowl", decoration: "crackle" }] }, "vessels[0].decoration"],
  ["a non-array vessel list", { type: "PLACE_FORM_DECORATE", workerId: "p1:shifu", vessels: { shape: "bowl" } }, "vessels"],
  [
    "an oversized array",
    { type: "COMPLETE_ORDER", orderId: "O01", ceramicIds: Array.from({ length: 65 }, (_, i) => `c${i + 1}`) },
    "ceramicIds",
  ],
  [
    "an unknown load destination",
    { type: "PLACE_GLAZE_LOAD", workerId: "p1:shifu", loads: [{ ceramicId: "c1", glaze: "white", destination: { kiln: "court" } }] },
    "loads[0].destination.kiln",
  ],
  [
    "an Imperial load without a modifier",
    { type: "PLACE_GLAZE_LOAD", workerId: "p1:shifu", loads: [{ ceramicId: "c1", glaze: "white", destination: { kiln: "imperial" } }] },
    "loads[0].destination.imperialModifier",
  ],
  [
    "an Imperial modifier of 2",
    { type: "USE_IMPERIAL_PRIORITY", ceramicId: "c1", glaze: "white", imperialModifier: 2 },
    "imperialModifier",
  ],
  [
    "a Kiln Furniture modifier on an Imperial load",
    {
      type: "PLACE_GLAZE_LOAD",
      workerId: "p1:shifu",
      loads: [{ ceramicId: "c1", glaze: "white", destination: { kiln: "imperial", imperialModifier: 0, kilnFurniture: 1 } }],
    },
    "loads[0].destination.kilnFurniture",
  ],
  ["an unknown Glaze", { type: "USE_IMPERIAL_PRIORITY", ceramicId: "c1", glaze: "black", imperialModifier: 0 }, "glaze"],
  // V1.6.2: the look always comes first, so the placement names no reservation (v1.6.2 L225–226).
  ["a reservation in the placement", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:shifu", first: { kind: "blind" } }, "first"],
  // The blind reservation and the resource after each reservation are gone (v1.6.2 L31).
  ["a blind reservation", { type: "SELECT_CHOOSE", reservations: [{ kind: "blind" }] }, "reservations[0].kind"],
  ["a top-3 selection", { type: "SELECT_CHOOSE", reservations: [{ kind: "look_top_three" }] }, "reservations[0].kind"],
  [
    "a face-up pick with a resource",
    { type: "SELECT_CHOOSE", reservations: [{ kind: "face_up", slotIndex: 0, orderId: "O01", gain: "clay" }] },
    "reservations[0].gain",
  ],
  ["a looked pick without an Order", { type: "SELECT_CHOOSE", reservations: [{ kind: "looked" }] }, "reservations[0].orderId"],
  ["a looked pick with a slot", { type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: "O07", slotIndex: 0 }] }, "reservations[0].slotIndex"],
  ["an unknown Order", { type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: "O49" }] }, "reservations[0].orderId"],
  ["a reservation list that is not an array", { type: "SELECT_CHOOSE", reservations: { kind: "looked", orderId: "O07" } }, "reservations"],
  ["a retired Commission sub-command", { type: "COMMISSION_RESERVE", choice: { kind: "blind" } }, "type"],
  ["the retired Commission resource", { type: "COMMISSION_GAIN", resource: "wood" }, "type"],
  ["the retired Commission stop", { type: "COMMISSION_STOP" }, "type"],
  ["the retired top-3 choice", { type: "COMMISSION_CHOOSE_LOOKED", orderId: "O07" }, "type"],
  // V1.6.2: Canal Barge no longer completes Orders (v1.6.2 L637); it has no command.
  ["the retired Canal Barge completion", { type: "USE_CANAL_BARGE", orderId: "O01", ceramicIds: ["c1"] }, "type"],
  // V1.6.2: Jun during Second Firing is part of SECOND_FIRING_CHOOSE (R7).
  ["a Second Firing card outside the 2 revealed", { type: "SECOND_FIRING_CHOOSE", cardIndex: 2, jun: null }, "cardIndex"],
  ["a Second Firing choice without the Jun field", { type: "SECOND_FIRING_CHOOSE", cardIndex: 0 }, "jun"],
  ["a Second Firing Jun of 2", { type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: { delta: 2 } }, "jun.delta"],
  ["a Second Firing Jun naming a ceramic", { type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: { ceramicId: "c1", delta: 1 } }, "jun.ceramicId"],
  ["a swap without the Order", { type: "USE_COLOUR_SAMPLES_SWAP" }, "discardOrderId"],
  ["a swap of an unknown Order", { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: "O49" }, "discardOrderId"],
  ["a swap naming the look in advance", { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: "O40", orderId: "O12" }, "orderId"],
  ["a Select pick of an unknown Order", { type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: "S17" }] }, "reservations[0].orderId"],
  // V1.6.2 change 25: the three per-look choices became SELECT_CHOOSE.
  ["the retired Commission choice", { type: "COMMISSION_CHOOSE", reservations: [{ kind: "looked", orderId: "O07" }] }, "type"],
  ["the retired Colour Samples choice", { type: "COLOUR_SAMPLES_CHOOSE", orderId: "O07" }, "type"],
  ["the retired swap choice", { type: "COLOUR_SAMPLES_SWAP_CHOOSE", orderId: "O07" }, "type"],
  ["a retired Tech", { type: "PLACE_GUILD_HALL", workerId: "p1:shifu", choice: { kind: "buy_face_up", techId: "T02" } }, "choice.techId"],
  ["a V1.4 discipline", { type: "PLACE_GUILD_HALL", workerId: "p1:shifu", choice: { kind: "inspect", discipline: "forming" } }, "choice.discipline"],
  ["a bottom order that is not an array", { type: "GUILD_FINISH", bottomOrder: "T05" }, "bottomOrder"],
  ["a retired Tech in a bottom order", { type: "GUILD_FINISH", bottomOrder: ["T02"] }, "bottomOrder[0]"],
  // V1.6.2 (owner revision 2026-10-17): each take is its own command; the bottom order comes with GUILD_FINISH.
  ["a take carrying the V1.6.1 bottom order", { type: "GUILD_TAKE", take: { kind: "face_up", techId: "T01" }, bottomOrder: [] }, "bottomOrder"],
  ["a take of an unknown kind", { type: "GUILD_TAKE", take: { kind: "revealed", techId: "T01" } }, "take.kind"],
  [
    "a malformed Crackle declaration",
    { type: "COMPLETE_ORDER", orderId: "O01", ceramicIds: ["c1"], crackleDeclarations: [{ ceramicId: "c1" }] },
    "crackleDeclarations[0].decoration",
  ],
  // Revision 4 (changes 28, 31): no Heat marker; Kiln Master's marker is chosen at loading.
  ["the retired Heat-marker step", { type: "RESOLVE_HEAT_MARKERS", ownMarker: 1 }, "type"],
  [
    "the retired Glaze & Load Heat marker",
    { type: "PLACE_GLAZE_LOAD", workerId: "p1:shifu", loads: [{ ceramicId: "c1", glaze: "white", destination: { kiln: "imperial", imperialModifier: 0 } }], heatMarkerCeramicId: "c1" },
    "heatMarkerCeramicId",
  ],
  [
    "a Kiln Master value of 0 at loading",
    { type: "PLACE_GLAZE_LOAD", workerId: "p1:shifu", loads: [{ ceramicId: "c1", glaze: "white", destination: { kiln: "imperial", imperialModifier: 0 }, kilnMaster: 0 }] },
    "loads[0].kilnMaster",
  ],
  ["a Kiln Master value of 2 at Imperial Priority", { type: "USE_IMPERIAL_PRIORITY", ceramicId: "c1", glaze: "white", imperialModifier: 0, kilnMaster: 2 }, "kilnMaster"],
  // Revision 4 (change 33, R21): the Magistrate's Hall Shifu's Crown Order.
  ["a Crown Order without a slot", { type: "PLACE_MAGISTRATES_HALL", workerId: "p1:shifu", crownOrder: { orderId: "O17" } }, "crownOrder.slotIndex"],
  ["a Crown Order of an unknown Order", { type: "PLACE_MAGISTRATES_HALL", workerId: "p1:shifu", crownOrder: { slotIndex: 0, orderId: "O99" } }, "crownOrder.orderId"],
  ["an unknown Magistrate's Hall key", { type: "PLACE_MAGISTRATES_HALL", workerId: "p1:shifu", crown: true }, "crown"],
  ["a missing Jun adjustment", { type: "RESOLVE_JUN" }, "adjustment"],
  ["a Jun delta of 2", { type: "RESOLVE_JUN", adjustment: { ceramicId: "c1", delta: 2 } }, "adjustment.delta"],
  // Revision 4 (change 30, R20): the firing-step salvage is gone; a sale names one ceramic.
  ["the retired salvage step", { type: "SALVAGE_FLAWED", ceramicId: null }, "type"],
  ["a sale without a ceramic", { type: "SELL_FLAWED" }, "ceramicId"],
  ["a sale that declines", { type: "SELL_FLAWED", ceramicId: null }, "ceramicId"],
  ["a sale of several ceramics", { type: "SELL_FLAWED", ceramicIds: ["c1"] }, "ceramicIds"],
  ["a non-boolean peek", { type: "TEST_PIECES_DECIDE", peek: 1 }, "peek"],
  ["an Order list with a bad entry", { type: "DISCARD_TO_HAND_LIMIT", orderIds: ["S01", 3] }, "orderIds[1]"],
  ["a contribution without a window", { type: "SUBMIT_CONTRIBUTION", card: "BANK" }, "windowId"],
  ["a contribution with an empty window", { type: "SUBMIT_CONTRIBUTION", windowId: "", card: "BANK" }, "windowId"],
  ["an unknown contribution card", { type: "SUBMIT_CONTRIBUTION", windowId: "w", card: "SMOTHER" }, "card"],
  // V1.6.2 change 26: no Fuel Ledger commitment beside the card, whatever its value.
  ["a retired Fuel Ledger commitment", { type: "SUBMIT_CONTRIBUTION", windowId: "w", card: "STOKE", fuelLedger: true }, "fuelLedger"],
  ["a retired Fuel Ledger flag set false", { type: "SUBMIT_CONTRIBUTION", windowId: "w", card: "TEND", fuelLedger: false }, "fuelLedger"],
  ["a V1.4 Fuel Ledger card", { type: "SUBMIT_CONTRIBUTION", windowId: "w", card: "STOKE_2" }, "card"],
  ["a numeric contribution card", { type: "SUBMIT_CONTRIBUTION", windowId: "w", card: 1 }, "card"],
];

describe("parseCommand: MALFORMED_ACTION", () => {
  it.each(MALFORMED)("rejects %s", (_label, input, field) => {
    expectMalformed(input, field);
  });

  it("returns a typed, user-readable error naming the field", () => {
    const result = parseCommand({ type: "SUBMIT_CONTRIBUTION", windowId: "w", card: "BANK", fuelLedger: "no" });
    expect(result).toEqual({
      code: "MALFORMED_ACTION",
      message: "Malformed command: fuelLedger is not allowed.",
      details: { field: "fuelLedger" },
    });
  });
});

describe("parseCommand: the optional endTurn (owner UI decision D21)", () => {
  const takesEndTurn = new Set<string>(END_TURN_COMMAND_TYPES);
  const examples = Object.values(VALID)
    .flat()
    .map((command) => [command.type, command] as const);

  it("END_TURN_COMMAND_TYPES lists the 10 worker-action commands and the 3 free actions", () => {
    expect([...END_TURN_COMMAND_TYPES]).toEqual([
      "PLACE_MATERIALS_YARD",
      "PLACE_FORM_DECORATE",
      "PLACE_GLAZE_LOAD",
      "PLACE_COMMISSION_MARKET",
      "PLACE_GUILD_HALL",
      "PLACE_CANAL_WHARF",
      "PLACE_MAGISTRATES_HALL",
      "SELECT_CHOOSE",
      "GUILD_TAKE",
      "GUILD_FINISH",
      "USE_IMPERIAL_PRIORITY",
      "SELL_FLAWED",
      "COMPLETE_ORDER",
    ]);
    // In `GameAction` declaration order, like COMMAND_TYPES.
    const order = END_TURN_COMMAND_TYPES.map((type) => COMMAND_TYPES.indexOf(type));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it.each(examples)("%s: endTurn true and false parse exactly on the listed types; anywhere else it is not allowed", (type, command) => {
    for (const endTurn of [true, false]) {
      const input = { ...JSON.parse(JSON.stringify(command)), endTurn } as unknown;
      const parsed = parseCommand(input);
      if (takesEndTurn.has(type)) {
        expect(parsed).toEqual({ ...command, endTurn });
      } else {
        expectMalformed(input, "endTurn");
        expect(isGameRuleError(parsed) ? parsed.message : null).toBe("Malformed command: endTurn is not allowed.");
      }
    }
  });

  it.each([...END_TURN_COMMAND_TYPES])("%s: a non-boolean endTurn is a typed shape error; undefined is absent", (type) => {
    const command = VALID[type][0]!;
    for (const value of ["yes", 1, 0, null, {}, []]) {
      const input = { ...JSON.parse(JSON.stringify(command)), endTurn: value } as unknown;
      expectMalformed(input, "endTurn");
      const result = parseCommand(input);
      expect(isGameRuleError(result) ? result.message : null).toBe("Malformed command: endTurn must be a boolean.");
    }
    const parsed = parseCommand({ ...command, endTurn: undefined });
    expect(parsed).toEqual(command);
    expect(Object.keys(parsed)).not.toContain("endTurn");
  });
});
