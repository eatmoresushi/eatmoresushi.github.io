/**
 * P6 `orders/matching.ts` and the matching half of `orders/completion.validateOrderCompletion`
 * (L420–437, L499; L482, L484, L499; DESIGN §6.6, §8.2).
 *
 * - Table-driven: every one of the 8 Starting (v1.6.2 change 23) and 48 Main Orders has a
 *   passing selection and a near miss with the expected mismatch reason, including S07's
 *   Decoration alternative (Carved, Impressed or Painted).
 * - Independent multi-ceramic requirements (L437), every relation in `data/orders.json`.
 * - Crackle wildcards: search mode (fixed order, first hit recorded) and declared mode (used
 *   exactly), both error codes. Since change 39 (rev. 5 L482) a Crackle ceramic keeps its own
 *   Quality: a crackled Fine one is refused by a Masterpiece requirement with the ordinary
 *   `masterpiece_required`, a crackled Masterpiece fills one, and a crackled Flawed one never
 *   counts.
 */

import { describe, expect, it } from "vitest";
import { MAIN_ORDER_IDS, ORDERS, STARTING_ORDER_IDS } from "../../../src/game/content.ts";
import { validateOrderCompletion } from "../../../src/game/orders/completion.ts";
import {
  explainOrderMismatch,
  findOrderMatches,
  matchOrder,
  ruTriggers,
  type OrderMismatchReason,
} from "../../../src/game/orders/matching.ts";
import type {
  CrackleDeclaration,
  Decoration,
  FinishedCeramic,
  GameRuleError,
  GameRuleErrorCode,
  Glaze,
  OrderCompletionSpec,
  OrderId,
  Quality,
  Shape,
} from "../../../src/game/types.ts";
import { actorViewOf } from "../../../src/game/view.ts";
import { buildState, stageCeramic } from "./support/fixtures.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

// ── Ceramic shorthand: "shape glaze decoration quality [crackle]" ────────────────────

const QUALITY_ALIASES: Record<string, Quality> = {
  flawed: "flawed",
  std: "standard",
  standard: "standard",
  fine: "fine",
  mp: "masterpiece",
  masterpiece: "masterpiece",
};

function fc(id: string, spec: string): FinishedCeramic {
  const [shape, glaze, decoration, quality, crackle] = spec.split(" ");
  const q = QUALITY_ALIASES[quality ?? ""];
  if (shape === undefined || glaze === undefined || decoration === undefined || q === undefined) {
    throw new Error(`bad ceramic spec ${spec}`);
  }
  const core = {
    id,
    ownerId: "p1",
    vesselInstanceId: `${shape}-01`,
    shape: shape as Shape,
    decoration: decoration as Decoration,
    formedInRound: 1 as const,
    formedBy: "form_decorate" as const,
    glaze: glaze as Glaze,
    firedInRound: 1 as const,
    stage: "finished" as const,
  };
  // Since change 39 a Crackle ceramic keeps any Quality (rev. 5 L482).
  return { ...core, crackle: crackle === "crackle", quality: q };
}

/** c1, c2, … in the given order. */
function set(...specs: string[]): FinishedCeramic[] {
  return specs.map((spec, index) => fc(`c${index + 1}`, spec));
}

// ── Every Order: a passing set and a near miss (Appendix A, L533–611) ────────────────

type Row = [OrderId, string[], string[], OrderMismatchReason];

const TABLE: Row[] = [
  // A0 Starting Orders (Standard+)
  ["S01", ["vase white painted std"], ["vase celadon painted fine"], "glaze_mismatch"],
  ["S02", ["bowl celadon plain std"], ["bowl grey_green plain std"], "glaze_mismatch"],
  ["S03", ["plate grey_green carved std"], ["plate moon_white carved std"], "glaze_mismatch"],
  ["S04", ["censer moon_white impressed std"], ["censer white impressed std"], "glaze_mismatch"],
  ["S05", ["washer white plain std"], ["vase white plain std"], "shape_mismatch"],
  ["S06", ["censer white plain std"], ["bowl white plain std"], "shape_mismatch"],
  ["S07", ["plate celadon impressed std"], ["plate celadon plain std"], "decoration_mismatch"],
  ["S08", ["vase white plain std"], ["vase white plain flawed"], "flawed"],
  // A1 Main single-ceramic Orders
  ["O01", ["bowl white plain std"], ["plate white plain std"], "shape_mismatch"],
  ["O02", ["plate white plain std"], ["plate white plain flawed"], "flawed"],
  ["O03", ["washer celadon carved std"], ["bowl celadon carved std"], "shape_mismatch"],
  ["O04", ["vase moon_white plain fine"], ["vase moon_white plain std"], "quality_too_low"],
  ["O05", ["censer white carved fine"], ["censer white impressed fine"], "decoration_mismatch"],
  ["O06", ["bowl white plain fine"], ["bowl celadon plain fine"], "glaze_mismatch"],
  ["O07", ["plate celadon plain mp"], ["plate celadon plain std"], "quality_too_low"],
  ["O08", ["vase grey_green carved fine"], ["vase moon_white carved fine"], "glaze_mismatch"],
  ["O09", ["censer moon_white painted fine"], ["censer grey_green painted fine"], "glaze_mismatch"],
  ["O10", ["bowl white plain fine"], ["bowl white painted fine"], "decoration_mismatch"],
  ["O11", ["bowl white carved mp"], ["bowl white carved fine"], "masterpiece_required"],
  ["O12", ["plate white impressed mp"], ["plate white plain fine crackle"], "masterpiece_required"],
  ["O13", ["vase celadon painted mp"], ["vase celadon painted fine"], "masterpiece_required"],
  ["O14", ["plate white plain fine"], ["censer white plain fine"], "shape_mismatch"],
  ["O15", ["vase white plain fine"], ["washer white plain fine"], "shape_mismatch"],
  ["O16", ["washer grey_green impressed mp"], ["washer grey_green impressed fine"], "masterpiece_required"],
  ["O17", ["washer white painted fine"], ["washer white carved fine"], "decoration_mismatch"],
  ["O18", ["vase celadon carved fine"], ["vase white carved fine"], "glaze_mismatch"],
  ["O19", ["censer grey_green impressed fine"], ["censer grey_green impressed std"], "quality_too_low"],
  ["O20", ["bowl moon_white carved fine"], ["plate moon_white carved fine"], "shape_mismatch"],
  ["O21", ["plate white plain mp"], ["plate white plain fine"], "masterpiece_required"],
  ["O22", ["censer celadon plain mp"], ["censer celadon carved mp"], "decoration_mismatch"],
  ["O23", ["vase grey_green painted mp"], ["vase grey_green painted fine crackle"], "masterpiece_required"],
  ["O24", ["bowl moon_white plain mp"], ["bowl white plain mp"], "glaze_mismatch"],
  // A2 Main two-ceramic Orders
  ["O25", ["bowl white plain std", "plate white plain std"], ["bowl white plain std", "bowl celadon carved fine"], "shape_mismatch"],
  ["O26", ["bowl celadon plain fine", "plate celadon carved fine"], ["bowl celadon plain fine", "plate white carved fine"], "glaze_mismatch"],
  ["O27", ["washer white plain fine", "vase celadon plain fine"], ["washer white plain fine", "vase white plain fine"], "glaze_mismatch"],
  ["O28", ["vase white plain fine", "vase celadon carved fine"], ["vase white plain fine", "bowl celadon carved fine"], "shape_mismatch"],
  ["O29", ["vase white plain fine", "censer white carved fine"], ["vase white plain fine", "censer white plain fine"], "decoration_mismatch"],
  ["O30", ["bowl white plain fine", "washer moon_white plain fine"], ["bowl white plain fine", "washer white plain fine"], "glaze_mismatch"],
  ["O31", ["plate celadon plain fine", "vase celadon carved fine"], ["plate celadon carved fine", "vase celadon painted fine"], "decoration_mismatch"],
  ["O32", ["vase white plain mp", "bowl white carved fine"], ["vase white plain fine", "bowl white carved fine"], "masterpiece_required"],
  ["O33", ["bowl grey_green plain mp", "censer grey_green painted fine"], ["bowl grey_green plain mp", "censer grey_green plain fine"], "decoration_mismatch"],
  ["O34", ["plate white carved mp", "vase celadon carved fine"], ["plate white carved mp", "vase celadon impressed fine"], "decoration_mismatch"],
  ["O35", ["bowl celadon plain fine", "plate celadon plain fine"], ["bowl celadon plain fine", "plate celadon plain std"], "quality_too_low"],
  ["O36", ["washer white plain fine", "vase moon_white impressed fine"], ["washer white plain fine", "vase moon_white plain fine"], "decoration_mismatch"],
  ["O37", ["censer grey_green painted fine", "bowl celadon painted fine"], ["censer celadon painted fine", "bowl celadon painted fine"], "glaze_mismatch"],
  ["O38", ["plate white carved fine", "washer moon_white carved fine"], ["plate white carved fine", "washer moon_white impressed fine"], "decoration_mismatch"],
  ["O39", ["vase celadon plain fine", "censer moon_white painted fine"], ["vase celadon plain fine", "censer moon_white plain fine"], "decoration_mismatch"],
  ["O40", ["bowl white impressed mp", "washer grey_green painted fine"], ["bowl white impressed fine", "washer grey_green painted fine"], "masterpiece_required"],
  ["O41", ["plate moon_white plain mp", "vase moon_white carved fine"], ["plate moon_white plain mp", "censer moon_white carved fine"], "shape_mismatch"],
  ["O42", ["washer white impressed mp", "censer celadon impressed fine"], ["washer white impressed mp", "censer white impressed fine"], "glaze_mismatch"],
  // A3 Main three-ceramic Orders
  [
    "O43",
    ["bowl white plain std", "plate white plain std", "vase white plain std"],
    ["bowl white plain std", "bowl white plain std", "vase white plain std"],
    "shape_mismatch",
  ],
  [
    "O44",
    ["bowl white plain fine", "plate celadon plain fine", "vase grey_green plain fine"],
    ["bowl white plain fine", "plate white plain fine", "vase grey_green plain fine"],
    "glaze_mismatch",
  ],
  [
    "O45",
    ["bowl white plain fine", "plate celadon carved fine", "vase grey_green impressed fine"],
    ["bowl white plain fine", "plate celadon plain fine", "vase grey_green carved fine"],
    "decoration_mismatch",
  ],
  [
    "O46",
    ["plate celadon carved fine", "vase grey_green impressed fine", "censer moon_white painted fine"],
    ["plate celadon carved fine", "vase grey_green impressed fine", "censer moon_white plain fine"],
    "decoration_mismatch",
  ],
  [
    "O47",
    ["bowl white plain mp", "plate celadon carved mp", "vase grey_green impressed fine"],
    ["bowl white plain mp", "plate celadon carved fine", "vase grey_green impressed fine"],
    "masterpiece_required",
  ],
  [
    "O48",
    ["washer white plain mp", "vase grey_green plain fine", "censer moon_white carved fine"],
    ["washer white plain mp", "vase grey_green plain fine", "censer moon_white plain fine"],
    "decoration_mismatch",
  ],
];

describe("every Order: a passing set and a near miss (Appendix A)", () => {
  it("covers all 8 Starting and 48 Main Orders exactly once", () => {
    const ids = TABLE.map(([id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...STARTING_ORDER_IDS, ...MAIN_ORDER_IDS].sort());
  });

  it.each(TABLE)("%s", (orderId, pass, miss, reason) => {
    const order = ORDERS[orderId];
    const passing = set(...pass);
    const match = matchOrder(order, passing);
    expect(match).toEqual({ ceramicIds: passing.map((c) => c.id), crackleDeclarations: [] });
    // The input order of the selection never matters (slots are assigned by permutation).
    const reversed = [...passing].reverse();
    expect(matchOrder(order, reversed)?.ceramicIds).toEqual(reversed.map((c) => c.id));
    expect(explainOrderMismatch(order, passing)).toBeNull();

    const nearMiss = set(...miss);
    expect(matchOrder(order, nearMiss)).toBeNull();
    expect(explainOrderMismatch(order, nearMiss)?.reason).toBe(reason);
    expect(findOrderMatches(order, nearMiss)).toEqual([]);
    expect(findOrderMatches(order, passing).map((m) => m.ceramicIds)).toEqual([passing.map((c) => c.id)]);
    // A Flawed ceramic never completes any Order (L300).
    const flawed = passing.map((c, index) => (index === 0 && !c.crackle ? { ...c, quality: "flawed" as const } : c));
    expect(matchOrder(order, flawed)).toBeNull();
    // Exactly one ceramic per slot (L437): one more or one fewer never matches.
    expect(matchOrder(order, [...passing, fc("c9", "bowl white plain mp")])).toBeNull();
    expect(matchOrder(order, passing.slice(1))).toBeNull();
    expect(explainOrderMismatch(order, passing.slice(1))?.reason).toBe("wrong_count");
  });
});

// ── S07: a Decoration alternative (v1.6.2 change 23, L545) ───────────────────────────

describe("S07 'any Shape · any Glaze · Carved, Impressed or Painted' (v1.6.2 change 23, L545)", () => {
  const OFFERED: readonly Decoration[] = ["carved", "impressed", "painted"];

  it("is filled by each listed Decoration, with any Shape and Glaze, at Standard or better", () => {
    expect(ORDERS.S07.ceramics).toEqual([{ decorations: [...OFFERED] }]);
    const shapes = ["bowl", "plate", "washer", "vase", "censer"];
    const glazes = ["white", "celadon", "grey_green", "moon_white"];
    OFFERED.forEach((decoration, index) => {
      for (const quality of ["std", "fine", "mp"]) {
        const ceramic = set(`${shapes[index]} ${glazes[index]} ${decoration} ${quality}`);
        expect(matchOrder(ORDERS.S07, ceramic), `${decoration} ${quality}`).toEqual({ ceramicIds: ["c1"], crackleDeclarations: [] });
      }
      const ceramic = set(`${shapes[index + 2]} ${glazes[3 - index]} ${decoration} std`);
      expect(matchOrder(ORDERS.S07, ceramic), decoration).not.toBeNull();
    });
  });

  it("refuses Plain, the one Decoration it does not list, whatever the Shape, Glaze or Quality", () => {
    for (const spec of ["bowl white plain std", "vase moon_white plain fine", "censer celadon plain mp"]) {
      const plain = set(spec);
      expect(matchOrder(ORDERS.S07, plain), spec).toBeNull();
      expect(explainOrderMismatch(ORDERS.S07, plain), spec).toEqual({ reason: "decoration_mismatch", ceramicId: "c1", slotIndex: 0 });
      expect(findOrderMatches(ORDERS.S07, plain), spec).toEqual([]);
    }
  });

  it("a printed-Plain Crackle ceramic fills it with its wildcard: searched, or declared as any listed Decoration", () => {
    const crackle = set("censer grey_green plain fine crackle");
    // Search mode records the first listed Decoration in DECORATIONS order (Carved).
    expect(matchOrder(ORDERS.S07, crackle)).toEqual({ ceramicIds: ["c1"], crackleDeclarations: [{ ceramicId: "c1", decoration: "carved" }] });
    for (const decoration of OFFERED) {
      const declared: CrackleDeclaration[] = [{ ceramicId: "c1", decoration }];
      expect(matchOrder(ORDERS.S07, crackle, declared), decoration).toEqual({ ceramicIds: ["c1"], crackleDeclarations: declared });
    }
    // Declared as Plain, or left undeclared ([] keeps its printed Plain), it does not.
    expect(matchOrder(ORDERS.S07, crackle, [{ ceramicId: "c1", decoration: "plain" }])).toBeNull();
    expect(matchOrder(ORDERS.S07, crackle, [])).toBeNull();
    // A Crackle ceramic printed with a listed Decoration needs no wildcard: any declaration that
    // names a listed Decoration, or none, matches.
    const carvedCrackle = set("bowl white carved fine crackle");
    expect(matchOrder(ORDERS.S07, carvedCrackle, [])).toEqual({ ceramicIds: ["c1"], crackleDeclarations: [] });
    expect(matchOrder(ORDERS.S07, carvedCrackle, [{ ceramicId: "c1", decoration: "painted" }])).not.toBeNull();
    expect(matchOrder(ORDERS.S07, carvedCrackle, [{ ceramicId: "c1", decoration: "plain" }])).toBeNull();
  });
});

// ── Independent multi-ceramic requirements (L437) ─────────────────────────────────────

describe("independent requirements unless paired (L437)", () => {
  it("O39 assigns Glazes and Decorations between the Shapes however you like", () => {
    // Printed: Vase + Censer; one Celadon, one Moon White; one Plain, one Painted.
    expect(matchOrder(ORDERS.O39, set("vase celadon plain fine", "censer moon_white painted fine"))).not.toBeNull();
    expect(matchOrder(ORDERS.O39, set("vase moon_white plain fine", "censer celadon painted fine"))).not.toBeNull();
    expect(matchOrder(ORDERS.O39, set("vase celadon painted fine", "censer moon_white plain fine"))).not.toBeNull();
    expect(matchOrder(ORDERS.O39, set("vase moon_white painted fine", "censer celadon plain fine"))).not.toBeNull();
  });

  it("O30 'one White, one Moon White' is exact multiset inclusion over both slots", () => {
    expect(matchOrder(ORDERS.O30, set("bowl moon_white plain fine", "washer white plain fine"))).not.toBeNull();
    expect(matchOrder(ORDERS.O30, set("bowl moon_white plain fine", "washer moon_white plain fine"))).toBeNull();
  });

  it("O31 'at least one Plain' accepts one or two Plain, never none", () => {
    expect(matchOrder(ORDERS.O31, set("plate celadon plain fine", "vase celadon plain fine"))).not.toBeNull();
    expect(matchOrder(ORDERS.O31, set("plate celadon carved fine", "vase celadon plain fine"))).not.toBeNull();
    expect(matchOrder(ORDERS.O31, set("plate celadon carved fine", "vase celadon carved fine"))).toBeNull();
    // "both Celadon"
    expect(matchOrder(ORDERS.O31, set("plate celadon plain fine", "vase white carved fine"))).toBeNull();
  });

  it("O45 / O47 '3 different Decorations' is pairwise: two distinct of three is not enough", () => {
    const two = set("bowl white plain fine", "plate celadon carved fine", "vase grey_green carved fine");
    expect(matchOrder(ORDERS.O45, two)).toBeNull();
    const three = set("bowl white plain fine", "plate celadon carved fine", "vase grey_green painted fine");
    expect(matchOrder(ORDERS.O45, three)).not.toBeNull();
    const o47 = set("bowl white plain mp", "plate celadon carved mp", "vase grey_green carved fine");
    expect(matchOrder(ORDERS.O47, o47)).toBeNull();
    expect(explainOrderMismatch(ORDERS.O47, o47)?.reason).toBe("decoration_mismatch");
  });

  it("O48 'at least 2 different Decorations' accepts 2 or 3 distinct, never 1", () => {
    const base = ["washer white plain mp", "vase grey_green carved fine"];
    expect(matchOrder(ORDERS.O48, set(...base, "censer moon_white carved fine"))).not.toBeNull();
    expect(matchOrder(ORDERS.O48, set(...base, "censer moon_white painted fine"))).not.toBeNull();
    expect(matchOrder(ORDERS.O48, set("washer white plain mp", "vase grey_green plain fine", "censer moon_white plain fine"))).toBeNull();
  });

  it("'≥N Masterpieces' counts Masterpieces among the selection (O47 needs 2, O48 needs 1)", () => {
    expect(matchOrder(ORDERS.O47, set("bowl white plain mp", "plate celadon carved mp", "vase grey_green impressed mp"))).not.toBeNull();
    expect(matchOrder(ORDERS.O48, set("washer white plain fine", "vase grey_green carved fine", "censer moon_white carved fine"))).toBeNull();
  });

  it("minimum Quality applies to every ceramic; Standard+ accepts Standard, Fine+ does not", () => {
    expect(matchOrder(ORDERS.O25, set("bowl white plain std", "plate white plain std"))).not.toBeNull();
    expect(matchOrder(ORDERS.O26, set("bowl white plain std", "plate white plain mp"))).toBeNull();
    expect(explainOrderMismatch(ORDERS.O26, set("bowl white plain std", "plate white plain mp"))).toEqual({
      reason: "quality_too_low",
      ceramicId: "c1",
      slotIndex: null,
    });
  });

  it("a single-slot near miss names the ceramic and the slot", () => {
    expect(explainOrderMismatch(ORDERS.O04, set("vase white plain fine"))).toEqual({
      reason: "glaze_mismatch",
      ceramicId: "c1",
      slotIndex: 0,
    });
  });

  it("a duplicated ceramic never matches", () => {
    const [bowl] = set("bowl white plain std");
    const plate = fc("c2", "plate white plain std");
    expect(matchOrder(ORDERS.O25, [bowl!, bowl!])).toBeNull();
    expect(matchOrder(ORDERS.O25, [bowl!, plate])).not.toBeNull();
  });
});

// ── Crackle wildcard (L484, L499, L660, INT: Ge Crackle) ─────────────────────────────

describe("Crackle wildcard: search mode", () => {
  it("a Crackle ceramic counts as any one Decoration and records the first hit", () => {
    // S07 needs Carved, Impressed or Painted (change 23); the Crackle ceramic is printed Plain.
    // The first Decoration that works, in DECORATIONS order, is Carved.
    const crackle = set("bowl white plain fine crackle");
    expect(matchOrder(ORDERS.S07, crackle)).toEqual({
      ceramicIds: ["c1"],
      crackleDeclarations: [{ ceramicId: "c1", decoration: "carved" }],
    });
    // O17: Brush Washer · White · Painted, Fine+.
    expect(matchOrder(ORDERS.O17, set("washer white carved fine crackle"))?.crackleDeclarations).toEqual([
      { ceramicId: "c1", decoration: "painted" },
    ]);
  });

  it("searches Crackle ceramics in sequence order, Decorations in DECORATIONS order, whatever the input order", () => {
    // O29: different Decorations. plain/plain fails; plain/carved is the first hit.
    const first = fc("c3", "vase white plain fine crackle");
    const second = fc("c7", "censer white plain fine crackle");
    const expected: CrackleDeclaration[] = [
      { ceramicId: "c3", decoration: "plain" },
      { ceramicId: "c7", decoration: "carved" },
    ];
    expect(matchOrder(ORDERS.O29, [first, second])).toEqual({ ceramicIds: ["c3", "c7"], crackleDeclarations: expected });
    expect(matchOrder(ORDERS.O29, [second, first])).toEqual({ ceramicIds: ["c7", "c3"], crackleDeclarations: expected });
  });

  it("declares each selected Crackle ceramic even when the Order has no Decoration requirement", () => {
    expect(matchOrder(ORDERS.S08, set("vase white carved fine crackle"))?.crackleDeclarations).toEqual([
      { ceramicId: "c1", decoration: "plain" },
    ]);
    // A non-Crackle partner gets no declaration.
    expect(matchOrder(ORDERS.O25, set("vase white carved fine crackle", "bowl white plain std"))?.crackleDeclarations).toEqual([
      { ceramicId: "c1", decoration: "plain" },
    ]);
  });

  it("never changes Glaze, Shape or Quality", () => {
    expect(matchOrder(ORDERS.S01, set("bowl celadon plain fine crackle"))).toBeNull();
    expect(matchOrder(ORDERS.S06, set("plate white plain fine crackle"))).toBeNull();
    expect(explainOrderMismatch(ORDERS.O20, set("bowl white carved fine crackle"))?.reason).toBe("glaze_mismatch");
  });

  it("a Crackle ceramic keeps its Quality: a crackled Fine one is refused by a Masterpiece requirement as masterpiece_required (L482, changes 29, 39)", () => {
    expect(matchOrder(ORDERS.O13, set("vase celadon plain fine crackle"))).toBeNull();
    expect(explainOrderMismatch(ORDERS.O13, set("vase celadon plain fine crackle"))?.reason).toBe("masterpiece_required");
    // O32 needs ≥1 Masterpiece: a Fine Crackle partner cannot supply it.
    const o32 = set("vase white plain fine crackle", "bowl white carved fine");
    expect(matchOrder(ORDERS.O32, o32)).toBeNull();
    expect(explainOrderMismatch(ORDERS.O32, o32)?.reason).toBe("masterpiece_required");
    // With a real Masterpiece partner, the Crackle wildcard fills the Decoration side.
    const ok = set("vase white plain fine crackle", "bowl white plain mp");
    expect(matchOrder(ORDERS.O32, ok)?.crackleDeclarations).toEqual([{ ceramicId: "c1", decoration: "carved" }]);
  });

  it("fills multiset and distinctness relations for several Crackle ceramics (O46)", () => {
    const o46 = set("plate celadon plain fine crackle", "vase grey_green plain fine crackle", "censer moon_white painted fine");
    expect(matchOrder(ORDERS.O46, o46)?.crackleDeclarations).toEqual([
      { ceramicId: "c1", decoration: "carved" },
      { ceramicId: "c2", decoration: "impressed" },
    ]);
  });
});

describe("Crackle wildcard: declared mode (used exactly)", () => {
  const crackleBowl = () => set("bowl white plain fine crackle");

  it("uses a valid declaration exactly and records it as given", () => {
    const declared: CrackleDeclaration[] = [{ ceramicId: "c1", decoration: "painted" }];
    expect(matchOrder(ORDERS.S07, crackleBowl(), declared)).toEqual({ ceramicIds: ["c1"], crackleDeclarations: declared });
  });

  it("never searches: a wrong or missing declaration fails even though another would match", () => {
    // S07 takes Carved, Impressed or Painted; a Plain declaration fails though another would match.
    expect(matchOrder(ORDERS.S07, crackleBowl(), [{ ceramicId: "c1", decoration: "plain" }])).toBeNull();
    expect(matchOrder(ORDERS.O17, set("washer white plain fine crackle"), [{ ceramicId: "c1", decoration: "carved" }])).toBeNull();
    // [] → the undeclared Crackle ceramic counts with its printed Plain.
    expect(matchOrder(ORDERS.S07, crackleBowl(), [])).toBeNull();
    expect(matchOrder(ORDERS.O10, crackleBowl(), [])).toEqual({ ceramicIds: ["c1"], crackleDeclarations: [] });
  });

  it("an undeclared Crackle ceramic counts with its printed Decoration beside a declared one", () => {
    // O36: different Decorations. Both printed Plain; declaring one as Carved is enough.
    const pair = set("washer white plain fine crackle", "vase moon_white plain fine crackle");
    expect(matchOrder(ORDERS.O36, pair, [{ ceramicId: "c2", decoration: "carved" }])).not.toBeNull();
    expect(matchOrder(ORDERS.O36, pair, [])).toBeNull();
  });

  it("a malformed declaration never matches", () => {
    const plain = set("bowl white plain fine");
    expect(matchOrder(ORDERS.O10, plain, [{ ceramicId: "c1", decoration: "plain" }])).toBeNull();
    expect(matchOrder(ORDERS.S07, crackleBowl(), [{ ceramicId: "c9", decoration: "painted" }])).toBeNull();
    expect(
      matchOrder(ORDERS.S07, crackleBowl(), [
        { ceramicId: "c1", decoration: "painted" },
        { ceramicId: "c1", decoration: "painted" },
      ]),
    ).toBeNull();
  });
});

describe("findOrderMatches", () => {
  it("lists every distinct group in sequence order, one match each, and honours the limit", () => {
    const pool = [
      fc("c4", "vase white plain std"),
      fc("c1", "bowl white plain std"),
      fc("c2", "bowl celadon plain flawed"),
      fc("c3", "plate white plain std"),
    ];
    // O25: 2 different Shapes. c2 is Flawed and ignored.
    expect(findOrderMatches(ORDERS.O25, pool).map((m) => m.ceramicIds)).toEqual([
      ["c1", "c3"],
      ["c1", "c4"],
      ["c3", "c4"],
    ]);
    expect(findOrderMatches(ORDERS.O25, pool, 1).map((m) => m.ceramicIds)).toEqual([["c1", "c3"]]);
    expect(findOrderMatches(ORDERS.O25, pool, 0)).toEqual([]);
    expect(findOrderMatches(ORDERS.O43, pool).map((m) => m.ceramicIds)).toEqual([["c1", "c3", "c4"]]);
    expect(findOrderMatches(ORDERS.O11, pool)).toEqual([]);
  });

  it("includes Crackle ceramics with their searched declarations", () => {
    const pool = [fc("c1", "bowl white plain fine crackle"), fc("c2", "plate celadon painted fine")];
    expect(findOrderMatches(ORDERS.S07, pool)).toEqual([
      { ceramicIds: ["c1"], crackleDeclarations: [{ ceramicId: "c1", decoration: "carved" }] },
      { ceramicIds: ["c2"], crackleDeclarations: [] },
    ]);
  });
});

describe("ruTriggers (L474)", () => {
  it("needs an actual Celadon, printed-Plain Masterpiece", () => {
    expect(ruTriggers(set("vase celadon plain mp"))).toBe(true);
    expect(ruTriggers(set("bowl white carved fine", "vase celadon plain mp"))).toBe(true);
    expect(ruTriggers(set("vase celadon plain fine"))).toBe(false);
    expect(ruTriggers(set("vase celadon carved mp"))).toBe(false);
    expect(ruTriggers(set("vase white plain mp"))).toBe(false);
    expect(ruTriggers(set("vase celadon plain fine crackle"))).toBe(false);
  });
});

describe("a Crackle ceramic keeps its own Quality (rev. 5 L482, change 39, R30)", () => {
  it("a crackled Masterpiece fills a Masterpiece requirement, with its wildcard Decoration", () => {
    // O13: any Shape · any Glaze · Painted, Masterpiece. A printed-Plain crackled Masterpiece
    // declares Painted.
    const crackledMasterpiece = set("plate celadon plain mp crackle");
    expect(matchOrder(ORDERS.O13, crackledMasterpiece)).toEqual({ ceramicIds: ["c1"], crackleDeclarations: [{ ceramicId: "c1", decoration: "painted" }] });
    // O22: Celadon · Plain, Masterpiece. A printed-Carved crackled Masterpiece declares Plain.
    expect(matchOrder(ORDERS.O22, set("censer celadon carved mp crackle"))).toEqual({ ceramicIds: ["c1"], crackleDeclarations: [{ ceramicId: "c1", decoration: "plain" }] });
    // A crackled Fine ceramic still falls short of a Masterpiece requirement.
    expect(explainOrderMismatch(ORDERS.O13, set("plate celadon plain fine crackle"))?.reason).toBe("masterpiece_required");
  });

  it("a crackled Standard ceramic counts as Standard; a crackled Flawed one never counts", () => {
    expect(matchOrder(ORDERS.S01, set("bowl white carved std crackle"))?.ceramicIds).toEqual(["c1"]);
    expect(explainOrderMismatch(ORDERS.O18, set("vase celadon carved std crackle"))?.reason).toBe("quality_too_low");
    for (const order of [ORDERS.S01, ORDERS.S07]) {
      expect(matchOrder(order, set("bowl white plain flawed crackle")), order.id).toBeNull();
      expect(explainOrderMismatch(order, set("bowl white plain flawed crackle"))?.reason, order.id).toBe("flawed");
    }
  });

  it("the wildcard works at every deliverable Quality", () => {
    for (const quality of ["std", "fine", "mp"] as const) {
      expect(matchOrder(ORDERS.S07, set(`bowl white plain ${quality} crackle`))?.crackleDeclarations, quality).toEqual([{ ceramicId: "c1", decoration: "carved" }]);
    }
  });

  it("Ru reads the actual Quality, Glaze and printed Decoration, Crackle or not", () => {
    expect(ruTriggers(set("vase celadon plain mp crackle"))).toBe(true);
    expect(ruTriggers(set("vase celadon carved mp crackle"))).toBe(false);
  });
});

// ── validateOrderCompletion: stage, ownership and both declaration error codes ────────

describe("validateOrderCompletion", () => {
  function scenario() {
    const state = buildState({ players: [{ kilnId: "GE", hand: ["S07", "O26", "S08"] }, { kilnId: "RU", hand: ["S01"] }] });
    const crackle = stageCeramic(state, { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "fine", crackle: true });
    const plate = stageCeramic(state, { owner: "p1", stage: "finished", shape: "plate", glaze: "celadon", quality: "fine" });
    const shaped = stageCeramic(state, { owner: "p1", stage: "shaped", shape: "vase" });
    const flawed = stageCeramic(state, { owner: "p1", stage: "finished", shape: "vase", glaze: "white", quality: "flawed" });
    const theirs = stageCeramic(state, { owner: "p2", stage: "finished", shape: "bowl", glaze: "white", quality: "fine" });
    return { state, view: actorViewOf(state, "p1"), crackle: crackle.id, plate: plate.id, shaped: shaped.id, flawed: flawed.id, theirs: theirs.id };
  }

  it("accepts a held Order in both declaration modes", () => {
    const { view, crackle } = scenario();
    expect(validateOrderCompletion(view, { orderId: "S07", ceramicIds: [crackle] })).toBeNull();
    expect(validateOrderCompletion(view, { orderId: "S07", ceramicIds: [crackle], crackleDeclarations: [{ ceramicId: crackle, decoration: "painted" }] })).toBeNull();
  });

  it("rejects Orders not in the hand, incl. face-up and another player's", () => {
    const { view, plate, state } = scenario();
    const faceUp = state.market.display[0]!;
    for (const orderId of [faceUp, "S01", "O01"] as OrderId[]) {
      const error = validateOrderCompletion(view, { orderId, ceramicIds: [plate] });
      expect(error).toMatchObject({ code: "ORDER_NOT_HELD", details: { orderId } });
      expectDocumentedDetails(error);
    }
  });

  it("rejects duplicated, unknown, foreign, unfinished ceramics with typed errors", () => {
    const { view, crackle, theirs, shaped } = scenario();
    const cases: Array<[OrderCompletionSpec, GameRuleErrorCode, GameRuleError["details"]]> = [
      [{ orderId: "S08", ceramicIds: [crackle, crackle] }, "DUPLICATE_CERAMIC", { ceramicId: crackle }],
      [{ orderId: "S08", ceramicIds: ["c99"] }, "CERAMIC_NOT_FOUND", { ceramicId: "c99" }],
      [{ orderId: "S08", ceramicIds: [theirs] }, "CERAMIC_NOT_OWNED", { ceramicId: theirs, ownerId: "p2" }],
      [{ orderId: "S08", ceramicIds: [shaped] }, "ILLEGAL_CERAMIC_STAGE", { ceramicId: shaped, stage: "shaped", expectedStage: "finished" }],
    ];
    for (const [spec, code, details] of cases) {
      const error = validateOrderCompletion(view, spec);
      expect(error).toMatchObject({ code, details });
      expectDocumentedDetails(error);
    }
  });

  it("rejects a Flawed ceramic and a wrong count with ORDER_REQUIREMENTS_NOT_MET", () => {
    const { view, flawed, plate } = scenario();
    const flawedError = validateOrderCompletion(view, { orderId: "S08", ceramicIds: [flawed] });
    expect(flawedError).toMatchObject({ code: "ORDER_REQUIREMENTS_NOT_MET", details: { orderId: "S08", reason: "flawed", ceramicId: flawed } });
    expectDocumentedDetails(flawedError);
    const countError = validateOrderCompletion(view, { orderId: "O26", ceramicIds: [plate] });
    expect(countError).toMatchObject({ code: "ORDER_REQUIREMENTS_NOT_MET", details: { orderId: "O26", reason: "wrong_count" } });
    expectDocumentedDetails(countError);
  });

  it("INVALID_CRACKLE_DECLARATION for a malformed declaration", () => {
    const { view, crackle, plate } = scenario();
    const notCrackle = validateOrderCompletion(view, {
      orderId: "S08",
      ceramicIds: [plate],
      crackleDeclarations: [{ ceramicId: plate, decoration: "painted" }],
    });
    expect(notCrackle).toMatchObject({
      code: "INVALID_CRACKLE_DECLARATION",
      details: { ceramicId: plate, decoration: "painted", orderId: "S08", reason: "not_crackle" },
    });
    expectDocumentedDetails(notCrackle);
    const notSelected = validateOrderCompletion(view, {
      orderId: "S08",
      ceramicIds: [plate],
      crackleDeclarations: [{ ceramicId: crackle, decoration: "painted" }],
    });
    expect(notSelected).toMatchObject({ code: "INVALID_CRACKLE_DECLARATION", details: { ceramicId: crackle, reason: "crackle_not_selected" } });
    expectDocumentedDetails(notSelected);
    const twice = validateOrderCompletion(view, {
      orderId: "S07",
      ceramicIds: [crackle],
      crackleDeclarations: [
        { ceramicId: crackle, decoration: "painted" },
        { ceramicId: crackle, decoration: "carved" },
      ],
    });
    expect(twice).toMatchObject({ code: "INVALID_CRACKLE_DECLARATION", details: { ceramicId: crackle, reason: "crackle_declared_twice" } });
    expectDocumentedDetails(twice);
  });

  it("a well-formed declaration that fails: INVALID_CRACKLE_DECLARATION if another would satisfy, else ORDER_REQUIREMENTS_NOT_MET", () => {
    const { view, crackle, plate } = scenario();
    const fixable = validateOrderCompletion(view, {
      orderId: "S07",
      ceramicIds: [crackle],
      crackleDeclarations: [{ ceramicId: crackle, decoration: "plain" }],
    });
    // The reason separates this RR8 case from a malformed declaration (same code).
    expect(fixable).toMatchObject({ code: "INVALID_CRACKLE_DECLARATION", details: { orderId: "S07", reason: "declaration_does_not_satisfy" } });
    expectDocumentedDetails(fixable);
    const empty = validateOrderCompletion(view, { orderId: "S07", ceramicIds: [crackle], crackleDeclarations: [] });
    expect(empty).toMatchObject({ code: "INVALID_CRACKLE_DECLARATION", details: { reason: "declaration_does_not_satisfy" } });
    // O26: Bowl + Plate, same Glaze. White Crackle bowl + Celadon plate fails on Glaze,
    // which no Decoration declaration can fix.
    const unfixable = validateOrderCompletion(view, {
      orderId: "O26",
      ceramicIds: [crackle, plate],
      crackleDeclarations: [{ ceramicId: crackle, decoration: "painted" }],
    });
    expect(unfixable).toMatchObject({ code: "ORDER_REQUIREMENTS_NOT_MET", details: { orderId: "O26", reason: "glaze_mismatch" } });
    expectDocumentedDetails(unfixable);
    // Search mode reports the same requirement failure.
    expect(validateOrderCompletion(view, { orderId: "O26", ceramicIds: [crackle, plate] })?.code).toBe("ORDER_REQUIREMENTS_NOT_MET");
  });

  it("never mutates the view", () => {
    const { view, crackle } = scenario();
    const before = structuredClone(view);
    validateOrderCompletion(view, { orderId: "S07", ceramicIds: [crackle] });
    validateOrderCompletion(view, { orderId: "O26", ceramicIds: [crackle, "c2"], crackleDeclarations: [] });
    expect(view).toEqual(before);
  });
});
