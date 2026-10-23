import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CENTRAL_LOCATION_IDS,
  BASE_CONTRIBUTION_CARD_IDS,
  CONTRIBUTION_CARD_IDS,
  DECORATIONS,
  DISCIPLINES,
  FIRING,
  GAME_CONFIG,
  GLAZES,
  IMPERIAL_TRACK,
  KILN_IDS,
  KILN_SPACE_IDS,
  KILNS,
  LOCATION_IDS,
  LOCATIONS,
  MAIN_ORDER_IDS,
  ORDER_CLARIFICATIONS,
  ORDER_IDS,
  ORDERS,
  PERSONAL_LOCATION_IDS,
  QUALITY_RANK,
  RULES_VERSION,
  SHAPES,
  STARTING_ORDER_IDS,
  TECH_IDS,
  TECHS,
  CLARIFICATION_TAG,
  SHORT_TEXT_SECONDARY_LABELS,
  activeKilnSpaces,
  clarificationSourceKind,
  clarificationTags,
  contributionCard,
  vesselCoins,
  isStartingOrderId,
  locationCapacity,
  preferredHeat,
  qualityForDifference,
  shapeClay,
  shortTextSegments,
  techsOfDiscipline,
  validateContentFiles,
  zoneModifier,
  zoneOf,
  type ContentFiles,
} from "../../../src/game/content.ts";
import { COMMON_DETAIL_KEYS, RULE_ERROR_TEXT } from "../../../src/game/ruleErrorText.ts";
import type {
  ClarificationDefinition,
  Decoration,
  Glaze,
  GameRuleErrorCode,
  KilnZone,
  LocationId,
  OrderDefinition,
  OrderRelationDefinition,
  OrderSlotDefinition,
  PlayerCount,
  Quality,
  Shape,
  TechDiscipline,
  TechId,
} from "../../../src/game/types.ts";

/**
 * P1 content contract (DESIGN §6, §8.2): every value in `data/*.json` is checked against the
 * V1.6.2 rulebook itself. The tables are parsed from the checked-in source, so a transcription
 * error on either side fails here. The Tech ID mapping is checked against the `TechId` JSDoc
 * in `types.ts`, and Tech, Kiln and location parameters against the DESIGN §6.3–6.5 tables as
 * amended by ENGINE_V1.6.2_DELTA.md §3.
 *
 * All display text derives from V1.6.2 (engine track stage 4, DELTA §3): the English and
 * Chinese Appendix A–B cells, Kiln Tradition sections, location rows, component and round
 * tables and Imperial milestones of both rulebook editions; the short text of the owner's
 * component text and its repository-format copy; and the clarifications of
 * `docs/KILN_OPENING_v1.6.2_CLARIFICATIONS.md`, whose tags resolve against the V1.6.2 source and
 * audit. The V1.6.1 rulebook is read only to show which five Tech abilities V1.6.2 rewrote.
 */

const ROOT = join(import.meta.dirname, "../../..");
const SOURCE = readFileSync(join(ROOT, "docs/KILN_OPENING_v1.6.2_EN_SOURCE.md"), "utf8");
const DESIGN = readFileSync(join(ROOT, "docs/ENGINE_V1.6.1_DESIGN.md"), "utf8");
const DELTA = readFileSync(join(ROOT, "docs/ENGINE_V1.6.2_DELTA.md"), "utf8");
const AUDIT = readFileSync(join(ROOT, "docs/RULEBOOK_AUDIT_V1.6.2.md"), "utf8");
const TYPES = readFileSync(join(ROOT, "src/game/types.ts"), "utf8");
/** The Chinese rulebook edition, translated to match the English rulebook sentence for sentence. */
const SOURCE_ZH = readFileSync(join(ROOT, "docs/KILN_OPENING_v1.6.2_ZH.md"), "utf8");
/** History: the V1.6.1 rows the V1.6.2 text is compared with (DELTA §3.1). */
const SOURCE_V161 = readFileSync(join(ROOT, "docs/KILN_OPENING_v1.6.1_EN_SOURCE.md"), "utf8");
const SOURCE_ZH_V161 = readFileSync(join(ROOT, "docs/KILN_OPENING_v1.6.1_ZH.md"), "utf8");
/** The owner's V1.6.2 short component text (DELTA §3.3), and its repository-format copy. */
const COMPONENT_TEXT = readFileSync(join(ROOT, "docs/KILN_OPENING_v1.6.2_COMPONENT_TEXT.md"), "utf8");
const COMPONENT_TEXT_SOURCE = readFileSync(join(ROOT, "docs/KILN_OPENING_v1.6.2_COMPONENT_TEXT_SOURCE.md"), "utf8");
/** The Techs whose ability text V1.6.2 rewrote with their mechanics (changes 22, v1.6.2 L32). */
const V162_TECHS: ReadonlySet<TechId> = new Set<TechId>(["T10", "T11", "T12", "T14", "T23"]);
/** The Tech abilities owner revision 4 rewrote (changes 28–31; rev. 4 L603, L605, L626–628): Decorator's Kit
 * and Prepared Clay (a vessel's cost), Test Pieces (before the Fire card), Second Firing (the Kiln
 * Master marker and Jun, already in V162_TECHS) and Kiln Master (at loading). */
const REV4_TECHS: ReadonlySet<TechId> = new Set<TechId>(["T13", "T14", "T16", "T17", "T24"]);
/** Every Tech ability that differs from V1.6.1. */
const CHANGED_TECHS: ReadonlySet<TechId> = new Set<TechId>([...V162_TECHS, ...REV4_TECHS]);
const CLARIFICATIONS_DOC = readFileSync(join(ROOT, "docs/KILN_OPENING_v1.6.2_CLARIFICATIONS.md"), "utf8");
const OWNER_DECISIONS = readFileSync(join(ROOT, "docs/ui-v1.6.1/OWNER_DECISIONS.md"), "utf8");

const clean = (text: string): string => text.replaceAll("**", "").replace(/\s+/g, " ").trim();
const cellsOf = (line: string): string[] => line.split("|").slice(1, -1).map(clean);
const numbersIn = (text: string): number[] => [...text.matchAll(/\b(\d+)\b/g)].map((match) => Number(match[1]));

/** The text from a heading line up to the next heading of the same or a higher level. */
function section(heading: string, source = SOURCE): string {
  const start = source.indexOf(`${heading}\n`);
  if (start < 0) throw new Error(`Missing section ${heading}`);
  const level = heading.match(/^#+/)?.[0].length ?? 2;
  const rest = source.slice(start + heading.length + 1);
  const next = rest.search(new RegExp(`\\n#{1,${level}} `));
  return next < 0 ? rest : rest.slice(0, next);
}

/** Table rows (no header separator) of a block of Markdown. */
function tableRows(block: string): string[][] {
  return block.split("\n").filter((line) => line.startsWith("|") && !/^\|\s*-/.test(line)).map(cellsOf);
}

function row(block: string, first: string): string[] {
  const found = tableRows(block).find((cells) => cells[0] === first);
  if (found === undefined) throw new Error(`Missing table row "${first}"`);
  return found;
}

/** Parses a DESIGN-doc object literal such as `{clayReduction:2, triggerShapes:["vase"]}`. */
function designLiteral(text: string): unknown {
  const json = text.replace(/([{,]\s*)([A-Za-z]+)\s*:/g, '$1"$2":').replace(/'/g, '"');
  return JSON.parse(json);
}

// ── Appendix A: an independent parser for the printed requirement text ──────────────────

const SHAPE_NAMES: Record<string, Shape> = { Bowl: "bowl", Plate: "plate", "Brush Washer": "washer", Vase: "vase", Censer: "censer" };
const GLAZE_NAMES: Record<string, Glaze> = { White: "white", Celadon: "celadon", "Grey-Green": "grey_green", "Moon White": "moon_white" };
const DECORATION_NAMES: Record<string, Decoration> = { Plain: "plain", Carved: "carved", Impressed: "impressed", Painted: "painted" };

function lookup<T>(table: Record<string, T>, name: string): T {
  const value = table[name.trim()];
  if (value === undefined) throw new Error(`Unknown printed term "${name}"`);
  return value;
}

/** "one White, one Moon White" → ["white", "moon_white"]. */
function oneEach<T>(table: Record<string, T>, text: string): T[] {
  return text.split(", ").map((part) => {
    if (!part.startsWith("one ")) throw new Error(`Unreadable list "${text}"`);
    return lookup(table, part.slice(4));
  });
}

interface ParsedOrder {
  ceramics: OrderSlotDefinition[];
  relations: OrderRelationDefinition[];
}

function parseRequirements(text: string): ParsedOrder {
  const singleParts = text.split(" · ");
  if (singleParts.length === 3) {
    const [shapeText = "", glazeText = "", decorationText = ""] = singleParts;
    const slot: OrderSlotDefinition = {};
    const pick = /^(.+), (.+) or (.+)$/.exec(shapeText) ?? /^(.+) or (.+)$/.exec(shapeText);
    if (shapeText === "any Shape") {
      // no Shape requirement
    } else if (pick !== null) {
      slot.shapes = pick.slice(1).map((name) => lookup(SHAPE_NAMES, name));
    } else {
      slot.shape = lookup(SHAPE_NAMES, shapeText);
    }
    if (glazeText !== "any Glaze") slot.glaze = lookup(GLAZE_NAMES, glazeText);
    // "Carved, Impressed or Painted" (S07, v1.6.2 change 23) is a Decoration alternative.
    const decorationPick = /^(.+), (.+) or (.+)$/.exec(decorationText) ?? /^(.+) or (.+)$/.exec(decorationText);
    if (decorationText === "any Decoration") {
      // no Decoration requirement
    } else if (decorationPick !== null) {
      slot.decorations = decorationPick.slice(1).map((name) => lookup(DECORATION_NAMES, name));
    } else {
      slot.decoration = lookup(DECORATION_NAMES, decorationText);
    }
    return { ceramics: [slot], relations: [] };
  }

  const [shapeText = "", glazeText = "", decorationText = ""] = text.split("; ");
  const relations: OrderRelationDefinition[] = [];
  let ceramics: OrderSlotDefinition[];
  const differentShapes = /^(\d) different Shapes$/.exec(shapeText);
  if (differentShapes !== null) {
    const count = Number(differentShapes[1]);
    ceramics = Array.from({ length: count }, () => ({}));
    relations.push({ type: count === 2 ? "different_shape" : "all_different_shape", indices: ceramics.map((_, i) => i) });
  } else if (shapeText === "2 ceramics of the same Shape") {
    ceramics = [{}, {}];
    relations.push({ type: "same_shape", indices: [0, 1] });
  } else {
    ceramics = shapeText.split(" + ").map((name) => ({ shape: lookup(SHAPE_NAMES, name) }));
  }
  const all = ceramics.map((_, i) => i);
  const count = ceramics.length;

  if (glazeText === "same Glaze") relations.push({ type: "same_glaze", indices: all });
  else if (glazeText === "different Glazes") relations.push({ type: "different_glaze", indices: all });
  else if (glazeText === "3 different Glazes") relations.push({ type: "all_different_glaze", indices: all });
  else if (glazeText.startsWith("both ")) relations.push({ type: "required_glazes", values: Array(count).fill(lookup(GLAZE_NAMES, glazeText.slice(5))) });
  else if (glazeText.startsWith("one ")) relations.push({ type: "required_glazes", values: oneEach(GLAZE_NAMES, glazeText) });
  else if (glazeText !== "any Glazes") throw new Error(`Unreadable Glaze requirement "${glazeText}"`);

  const atLeastOne = /^at least one (\w+), other Decoration any$/.exec(decorationText);
  const atLeastDistinct = /^at least (\d) different Decorations$/.exec(decorationText);
  if (decorationText === "same Decoration") relations.push({ type: "same_decoration", indices: all });
  else if (decorationText === "different Decorations" || decorationText === `${count} different Decorations`) {
    relations.push({ type: "different_decoration", indices: all });
  } else if (atLeastOne !== null) relations.push({ type: "required_decorations", values: [lookup(DECORATION_NAMES, atLeastOne[1] ?? "")] });
  else if (atLeastDistinct !== null) relations.push({ type: "at_least_n_distinct_decorations", indices: all, count: Number(atLeastDistinct[1]) });
  else if (decorationText.startsWith("both ")) relations.push({ type: "required_decorations", values: Array(count).fill(lookup(DECORATION_NAMES, decorationText.slice(5))) });
  else if (decorationText.startsWith("one ")) relations.push({ type: "required_decorations", values: oneEach(DECORATION_NAMES, decorationText) });
  else if (decorationText !== "any Decorations") throw new Error(`Unreadable Decoration requirement "${decorationText}"`);

  return { ceramics, relations };
}

function parseQuality(text: string): { minQuality: Exclude<Quality, "flawed">; masterpieces: number } {
  const match = /^(Standard\+|Fine\+|Masterpiece)(?: each| all)?(?:; ≥(\d) Masterpieces?)?$/.exec(text);
  if (match === null) throw new Error(`Unreadable Quality "${text}"`);
  const minQuality = match[1] === "Standard+" ? "standard" : match[1] === "Fine+" ? "fine" : "masterpiece";
  return { minQuality, masterpieces: Number(match[2] ?? 0) };
}

const appendixA = section("## Appendix A — Order Decks: 8 Starting + 48 Main");
const orderRows = tableRows(appendixA).filter((cells) => /^[SO]\d{2}$/.test(cells[0] ?? ""));

describe("Appendix A: all 8 Starting and 48 Main Orders", () => {
  it("prints exactly the Order IDs the data defines", () => {
    expect(orderRows.map((cells) => cells[0])).toEqual([...ORDER_IDS]);
    expect(STARTING_ORDER_IDS).toHaveLength(8);
    expect(MAIN_ORDER_IDS).toHaveLength(48);
  });

  it.each(orderRows.map((cells) => [cells[0] ?? "", cells] as const))("%s matches its printed row", (id, cells) => {
    const order = ORDERS[id as keyof typeof ORDERS];
    const starting = id.startsWith("S");
    const [, requirements = "", qualityText = "", vp = "", coins = "", crowns = "—"] = cells;
    const quality = parseQuality(qualityText);
    const parsed = parseRequirements(requirements);
    const masterpieceRelations: OrderRelationDefinition[] = quality.masterpieces === 0
      ? []
      : [{ type: "at_least_n_quality", quality: "masterpiece", count: quality.masterpieces }];

    expect(order.id).toBe(id);
    expect(order.deck).toBe(starting ? "starting" : "main");
    expect(isStartingOrderId(order.id)).toBe(starting);
    expect(order.requirements).toBe(requirements);
    expect(order.minQuality).toBe(quality.minQuality);
    expect(order.vp).toBe(Number(vp));
    expect(order.coins).toBe(Number(coins));
    expect(order.crowns).toBe(starting ? 0 : crowns === "—" ? 0 : Number(crowns));
    expect(order.ceramics).toEqual(parsed.ceramics);
    expect(order.relations ?? []).toEqual([...parsed.relations, ...masterpieceRelations]);
  });

  it("rebuilds the Starting deck as 8 cards (v1.6.2 change 23, L33)", () => {
    const starting = STARTING_ORDER_IDS.map((id) => [id, ORDERS[id].vp, ORDERS[id].coins]);
    expect(starting).toEqual([
      ["S01", 3, 4],
      ["S02", 3, 4],
      ["S03", 3, 4],
      ["S04", 4, 4],
      ["S05", 3, 4],
      ["S06", 3, 5],
      ["S07", 3, 3],
      ["S08", 2, 4],
    ]);
    // "Carved, Impressed or Painted": a Decoration alternative, like S05's Shape alternative.
    expect(ORDERS.S07.ceramics).toEqual([{ decorations: ["carved", "impressed", "painted"] }]);
    expect(ORDERS.S05.ceramics).toEqual([{ shapes: ["bowl", "plate", "washer"] }]);
    // 2 per player: a 4-player game deals the whole deck (L520).
    expect(GAME_CONFIG.setupDeal.startingOrders * GAME_CONFIG.players.max).toBe(STARTING_ORDER_IDS.length);
  });

  it("applies the Main Order re-pass as printed (v1.6.2 change 24, L34) and keeps the earlier changes", () => {
    const values = (ids: string[]) => ids.map((id) => [id, ORDERS[id as keyof typeof ORDERS].vp, ORDERS[id as keyof typeof ORDERS].coins]);
    expect(values(["O01", "O02", "O03", "O04", "O05", "O14", "O15", "O19", "O20", "O22"])).toEqual([
      ["O01", 4, 3],
      ["O02", 4, 3],
      ["O03", 4, 3],
      ["O04", 7, 3],
      ["O05", 6, 3],
      ["O14", 5, 3],
      ["O15", 5, 4],
      ["O19", 6, 2],
      ["O20", 6, 2],
      ["O22", 9, 1],
    ]);
    expect(values(["O26", "O27", "O28", "O30", "O32", "O33", "O34", "O38", "O39"])).toEqual([
      ["O26", 11, 5],
      ["O27", 12, 5],
      ["O28", 11, 5],
      ["O30", 13, 5],
      ["O32", 16, 5],
      ["O33", 15, 5],
      ["O34", 15, 5],
      ["O38", 12, 1],
      ["O39", 13, 1],
    ]);
    // Change 13's values that change 24 left alone.
    expect([ORDERS.O16.vp, ORDERS.O21.vp, ORDERS.O31.vp, ORDERS.O40.vp]).toEqual([9, 9, 12, 15]);
  });

  it("uses Painted where Crackle used to be a Decoration (change 19)", () => {
    expect(ORDERS.S07.ceramics).toEqual([{ decorations: ["carved", "impressed", "painted"] }]);
    expect(ORDERS.O13.ceramics).toEqual([{ decoration: "painted" }]);
    expect(ORDERS.O17.ceramics).toEqual([{ shape: "washer", glaze: "white", decoration: "painted" }]);
    expect(ORDERS.O23.ceramics).toEqual([{ shape: "vase", glaze: "grey_green", decoration: "painted" }]);
    expect(ORDERS.O39.relations).toContainEqual({ type: "required_decorations", values: ["plain", "painted"] });
    expect(ORDERS.O40.relations).toContainEqual({ type: "required_decorations", values: ["impressed", "painted"] });
    expect(ORDERS.O46.relations).toContainEqual({ type: "required_decorations", values: ["carved", "impressed", "painted"] });
    expect(ORDERS.O31.relations).toContainEqual({ type: "required_decorations", values: ["plain"] });
    expect(ORDERS.O48.relations).toContainEqual({ type: "at_least_n_distinct_decorations", indices: [0, 1, 2], count: 2 });
    expect(JSON.stringify(Object.values(ORDERS))).not.toContain("crackle");
  });

  it("keeps the Starting deck crownless and Standard+ (L521)", () => {
    for (const id of STARTING_ORDER_IDS) {
      expect(ORDERS[id]).toMatchObject({ deck: "starting", crowns: 0, minQuality: "standard" });
    }
  });
});

// The Chinese edition's Appendix A (owner revision 2): `requirementsZh` is its requirement cell
// verbatim, and its Quality, VP, Coin and Crown cells agree with the data and the English row.
const appendixAZh = section("## 附录A——委托牌堆：8张起始委托 + 48张主委托", SOURCE_ZH);
const orderRowsZh = tableRows(appendixAZh).filter((cells) => /^[SO]\d{2}$/.test(cells[0] ?? ""));
const QUALITY_ZH: Record<string, { minQuality: Exclude<Quality, "flawed">; masterpieces: number }> = {
  良品以上: { minQuality: "standard", masterpieces: 0 },
  均良品以上: { minQuality: "standard", masterpieces: 0 },
  上品以上: { minQuality: "fine", masterpieces: 0 },
  均上品以上: { minQuality: "fine", masterpieces: 0 },
  "均上品以上，至少1件臻品": { minQuality: "fine", masterpieces: 1 },
  "均上品以上，至少2件臻品": { minQuality: "fine", masterpieces: 2 },
  臻品: { minQuality: "masterpiece", masterpieces: 0 },
};

describe("Chinese Appendix A: all 8 Starting and 48 Main Orders (owner revision 2)", () => {
  it("prints exactly the Order IDs the data defines, in the same order as the English edition", () => {
    expect(orderRowsZh.map((cells) => cells[0])).toEqual([...ORDER_IDS]);
  });

  it.each(orderRowsZh.map((cells) => [cells[0] ?? "", cells] as const))("%s matches its Chinese row", (id, cells) => {
    const order = ORDERS[id as keyof typeof ORDERS];
    const [, requirementsZh = "", qualityZh = "", vp = "", coins = "", crowns = "—"] = cells;
    const quality = QUALITY_ZH[qualityZh];
    expect(quality, `${id} quality "${qualityZh}"`).toBeDefined();
    expect(order.requirementsZh).toBe(requirementsZh);
    expect(order.minQuality).toBe(quality?.minQuality);
    const masterpieces = (order.relations ?? []).find(
      (relation): relation is Extract<OrderRelationDefinition, { type: "at_least_n_quality" }> => relation.type === "at_least_n_quality",
    );
    expect(masterpieces === undefined ? 0 : masterpieces.count).toBe(quality?.masterpieces);
    expect(order.vp).toBe(Number(vp));
    expect(order.coins).toBe(Number(coins));
    expect(order.crowns).toBe(id.startsWith("S") || crowns === "—" ? 0 : Number(crowns));
  });
});

// ── Appendix B: all 18 Advanced Techs ────────────────────────────────────────────────────

const B_SECTIONS: ReadonlyArray<readonly [TechDiscipline, string]> = [
  ["workshop", "### B1. Form & Decorate — 6"],
  ["glazing_loading", "### B2. Glazing & Loading — 6"],
  ["firing", "### B3. Firing — 6"],
];

const techRowsOf = (source: string) => B_SECTIONS.flatMap(([discipline, heading]) =>
  tableRows(section(heading, source)).filter((cells) => /^\d+$/.test(cells[1] ?? "")).map((cells) => ({ discipline, cells })));
const techRows = techRowsOf(SOURCE);
const techRowsV161 = techRowsOf(SOURCE_V161);

function techByPrintedName(printed: string): { id: TechId; nameZh: string | null } {
  const zh = /\s([\u4e00-\u9fff]+)$/.exec(printed);
  const name = zh === null ? printed : printed.slice(0, zh.index);
  const id = TECH_IDS.find((techId) => TECHS[techId].name === name);
  if (id === undefined) throw new Error(`No Tech named "${name}"`);
  return { id, nameZh: zh?.[1] ?? null };
}

/** `| T01 | workshop | Large Throwing Wheel | 2 | L615 | kept |` rows of the TechId JSDoc. */
const techIdTable = TYPES.split("\n")
  .map((line) => line.replace(/^\s*\*\s?/, ""))
  .filter((line) => /^\|\s*T\d{2}\s*\|/.test(line))
  .map(cellsOf);

/** DESIGN §6.5: `| T01 | yes | form_decorate_action | `{...}` |`. */
const designTechRows = tableRows(section("### 6.5 `techniques.json` → `{rulesVersion, advanced: TechDefinition[18]}`", DESIGN))
  .filter((cells) => /^T\d{2}$/.test(cells[0] ?? ""));

describe("Appendix B: all 18 Advanced Techs", () => {
  it("prints 18 tiles, 6 per discipline, and the data has exactly those", () => {
    expect(techRows).toHaveLength(18);
    for (const discipline of DISCIPLINES) {
      expect(techRows.filter((entry) => entry.discipline === discipline)).toHaveLength(6);
      expect(techsOfDiscipline(discipline)).toHaveLength(GAME_CONFIG.techs.perDiscipline);
    }
    expect(new Set(techRows.map((entry) => techByPrintedName(entry.cells[0] ?? "").id))).toEqual(new Set(TECH_IDS));
  });

  it.each(techRows.map((entry) => [entry.cells[0] ?? "", entry] as const))("%s matches its printed row", (_, entry) => {
    const { id, nameZh } = techByPrintedName(entry.cells[0] ?? "");
    const tech = TECHS[id];
    expect(tech.discipline).toBe(entry.discipline);
    expect(tech.cost).toBe(Number(entry.cells[1]));
    expect(tech.ability).toBe(entry.cells[2]);
    // A once-per-round allowance wherever the text prints one: Colour Samples' swap and
    // Protective Saggars' Standard → Fine step sit after an ongoing clause (v1.6.2 L625, L636).
    expect(tech.oncePerRound).toBe(/once per round/i.test(tech.ability));
    expect(tech.unlocks).toBe(entry.discipline === "workshop" ? "form_decorate" : entry.discipline === "glazing_loading" ? "glaze_load" : null);
    if (nameZh !== null) expect(tech.nameZh).toBe(nameZh);
  });

  it("follows the Tech ID mapping of the TechId contract (audit: Stable IDs)", () => {
    expect(techIdTable).toHaveLength(18);
    for (const [id = "", discipline, name, cost] of techIdTable) {
      const tech = TECHS[id as TechId];
      expect(tech, id).toBeDefined();
      expect(tech.discipline, id).toBe(discipline);
      expect(tech.name, id).toBe(name?.replace(/\s[\u4e00-\u9fff]+$/, ""));
      expect(tech.cost, id).toBe(Number(cost));
    }
    for (const retired of ["T02", "T03", "T04", "T06", "T07", "T08", "T09", "ST01", "ST02", "ST03", "ST04"]) {
      expect(TECH_IDS as readonly string[]).not.toContain(retired);
    }
  });

  it("matches the DESIGN §6.5 timing and parameter table as amended by DELTA §3.1", () => {
    expect(designTechRows).toHaveLength(18);
    const expected = new Map<string, { oncePerRound: boolean; timing: string; params: unknown }>();
    for (const [id = "", once, timing = "", params = ""] of designTechRows) {
      expected.set(id, { oncePerRound: once === "yes", timing, params: designLiteral(params.replaceAll("`", "")) });
    }
    // DELTA §3.1: `| T11 Protective Saggars | `cost`, `params` | 3; `{…}` (L636) |`.
    const amended = tableRows(section("### 3.1 `techniques.json`", DELTA)).filter((cells) => /^T\d{2} /.test(cells[0] ?? ""));
    expect(amended.map((cells) => cells[0]?.slice(0, 3))).toEqual(["T18", "T20", "T11", "T12", "T10", "T14", "T23"]);
    for (const [label = "", fields = "", values = ""] of amended) {
      const entry = expected.get(label.slice(0, 3));
      if (entry === undefined) throw new Error(`DELTA §3.1 names unknown Tech ${label}`);
      const literals = [...values.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "");
      if (fields.includes("`params`")) entry.params = designLiteral(literals.find((literal) => literal.startsWith("{")) ?? "");
      if (fields.includes("`oncePerRound`")) entry.oncePerRound = literals[0] === "true";
      if (fields.includes("`timing`")) entry.timing = JSON.parse(literals[0] ?? "") as string;
    }
    // DELTA §15.8 (owner revision 4, changes 28, 31, R22): the DESIGN §6.5 row now reads that
    // Kiln Master acts when a ceramic is loaded, not in the retired Heat-marker step.
    expect(expected.get("T24")?.timing).toBe("when_loading");
    for (const id of TECH_IDS) {
      const tech = TECHS[id];
      expect(tech.oncePerRound, id).toBe(expected.get(id)?.oncePerRound);
      expect(tech.timing, id).toBe(expected.get(id)?.timing);
      expect(tech.params, id).toEqual(expected.get(id)?.params);
    }
  });

  it("charges the V1.6.2 costs (changes 22 and 30, v1.6.2 L32, rev. 4 L40, L625; L618, L626, L636)", () => {
    // Fuel Ledger: 2 since change 22, 4 since change 30 (owner revision 4).
    expect([TECHS.T18.cost, TECHS.T20.cost, TECHS.T11.cost, TECHS.T12.cost]).toEqual([3, 3, 3, 4]);
    expect(SOURCE.split("\n")[39]).toContain("Fuel Ledger costs 4.");
    // Test Pieces stays 3 (v1.6.2 L32).
    expect(TECHS.T13.cost).toBe(3);
    expect(SOURCE.split("\n")[31]).toContain("Senior Apprentice and Kiln Tending cost 3; Test Pieces stays at 3");
  });

  it("V1.6.2 rewrote exactly the Tech abilities whose mechanics changed (changes 22 and 28–31, DELTA §3.1, §15.8)", () => {
    const changed = TECH_IDS.filter((id) => {
      const now = techRows.find((row) => techByPrintedName(row.cells[0] ?? "").id === id)?.cells[2];
      const then = techRowsV161.find((row) => techByPrintedName(row.cells[0] ?? "").id === id)?.cells[2];
      return now !== then;
    });
    expect(new Set(changed)).toEqual(CHANGED_TECHS);
    // The mechanics follow the V1.6.2 text (v1.6.2 L625, L630, L636–637, L639).
    expect(TECHS.T10.ability).toContain("once per round, before or after one of your worker actions, you may discard 1 held Order");
    expect(TECHS.T23.ability).toBe("Once per round, when you complete an Order, gain 2 Coins.");
    expect(TECHS.T11.ability).toContain("a Heat Difference of 3 or more counts as Standard");
    expect(TECHS.T12.ability).toContain("Your Bank the Fire and Stoke the Fire cost no Wood");
    expect(TECHS.T14.ability).toContain("Reveal 2 extra Fire cards, choose 1 of them");
    expect(TECHS.T23.timing).toBe("order_completion");
    // Owner revision 4 (rev. 4 L603, L605, L626–628).
    expect(TECHS.T16.ability).toContain("a vessel you form with a Carved, Impressed or Painted Decoration costs 1 Coin less");
    expect(TECHS.T17.ability).toContain("pay its Clay cost +1 Clay and 2 Coins, choosing any Decoration");
    expect(TECHS.T13.ability).toContain("after Base Heat is determined and before the Fire card is revealed");
    expect(TECHS.T14.ability).toContain("an unused Jun adjustment may be applied to the recalculated heat");
    expect(TECHS.T24.ability).toBe("Once per round, when you load a ceramic, you may place a +1 or −1 marker on it. It adds its value to that ceramic's Actual Heat.");
    expect(TECHS.T24.timing).toBe("when_loading");
  });

  it("names exactly the printed Shapes, Decorations, locations and Qualities in Tech parameters", () => {
    expect(TECHS.T01.ability).toContain("Vase or Censer");
    expect(TECHS.T01.params.triggerShapes).toEqual(["vase", "censer"]);
    expect(TECHS.T16.ability).toContain("Carved, Impressed or Painted");
    expect(TECHS.T16.params.decorations).toEqual(["carved", "impressed", "painted"]);
    expect(TECHS.T21.ability).toContain("Bowl, Plate or Brush Washer");
    expect(TECHS.T21.params.shapes).toEqual(["bowl", "plate", "washer"]);
    expect(TECHS.T18.ability).toContain("Materials Yard or Commission Market");
    expect(TECHS.T18.params.locations).toEqual(["materials_yard", "commission_market"]);
    expect(TECHS.T19.ability).toContain("Fine or Masterpiece");
    expect(TECHS.T19.params.qualities).toEqual(["fine", "masterpiece"]);
    expect(TECHS.T15.params.modifiers).toEqual([...FIRING.imperialModifiers]);
  });
});

// ── Printed numbers equal the parameters (successor of the V1.2.7 printed-number guard) ──

const abs = (values: readonly number[]): number[] => values.map((value) => Math.abs(value));
const fd = LOCATIONS.form_decorate.effects;
const gl = LOCATIONS.glaze_load.effects;
const cm = LOCATIONS.commission_market.effects;
const gh = LOCATIONS.guild_hall.effects;
const my = LOCATIONS.materials_yard.effects;
const mh = LOCATIONS.magistrates_hall.effects;
const cw = LOCATIONS.canal_wharf.effects;
const ledgerBank = contributionCard("FUEL_LEDGER_BANK");
const ledgerStoke = contributionCard("FUEL_LEDGER_STOKE");
/** The smallest Heat Difference the Quality table calls Flawed (L274–279). */
const flawedFrom = (FIRING.qualityByHeatDifference.find((row) => row.quality === "standard")?.maxDifference ?? -1) + 1;

/** [label, printed English text, the exact number sequence the data implies]. */
const PRINTED_NUMBERS: Array<[string, string, number[]]> = [
  ["T01", TECHS.T01.ability, [1, TECHS.T01.params.clayReduction, 0]],
  // rev. 4 L603: "a vessel you form with a Carved, Impressed or Painted Decoration costs 1 Coin less".
  ["T16", TECHS.T16.ability, [TECHS.T16.params.coinReduction]],
  ["T05", TECHS.T05.ability, []],
  // rev. 4 L605: "form 1 vessel: pay its Clay cost +1 Clay and 2 Coins".
  ["T17", TECHS.T17.ability, [1, TECHS.T17.params.claySurcharge, vesselCoins()]],
  ["T18", TECHS.T18.ability, [1]],
  ["T19", TECHS.T19.ability, [TECHS.T19.params.vpPerCeramic, TECHS.T19.params.maxVp]],
  // v1.6.2 L622 (change 25): "When acquired: Select 3 … hand limit is 5 … discard 1 held Order to Select 3".
  ["T10", TECHS.T10.ability, [TECHS.T10.params.select, TECHS.T10.params.handLimit, TECHS.T10.params.swapDiscard, TECHS.T10.params.swapSelect]],
  ["T20", TECHS.T20.ability, [1, TECHS.T20.params.clay, TECHS.T20.params.wood]],
  ["T15", TECHS.T15.ability, [1, ...abs(TECHS.T15.params.modifiers)]],
  ["T21", TECHS.T21.ability, [1]],
  ["T22", TECHS.T22.ability, []],
  ["T23", TECHS.T23.ability, [TECHS.T23.params.coins]],
  // "a Heat Difference of 3 or more" is the first difference the Quality table calls Flawed.
  ["T11", TECHS.T11.ability, [flawedFrom, 1]],
  // v1.6.2 L634 (change 26): "Fuel Ledger Bank (1 Wood, −2) and Fuel Ledger Stoke (1 Wood, +2) …
  // choose among all 5 of your cards as usual, playing exactly 1".
  ["T12", TECHS.T12.ability, [ledgerBank.woodCost, -ledgerBank.heat, ledgerStoke.woodCost, ledgerStoke.heat, CONTRIBUTION_CARD_IDS.length, 1]],
  ["T13", TECHS.T13.ability, [1, TECHS.T13.params.wood]],
  ["T14", TECHS.T14.ability, [1, TECHS.T14.params.extraCards, TECHS.T14.params.chosenCards]],
  // rev. 4 L628: "place a +1 or −1 marker on it".
  ["T24", TECHS.T24.ability, [...abs(TECHS.T24.params.values)]],
  ["T25", TECHS.T25.ability, [KILNS.GU.params.minPrintedCrowns, TECHS.T25.params.bonusCrowns]],
  ["RU", KILNS.RU.ability, [KILNS.RU.params.vp]],
  ["GU", KILNS.GU.ability, [KILNS.GU.params.minPrintedCrowns, KILNS.GU.params.coins, KILNS.GU.params.vp]],
  // rev. 4 L463, L465: "choose 1 of your Fine or Standard ceramics …"; "… scores 1 VP".
  ["GE", KILNS.GE.ability, [1, KILNS.GE.params.vpPerDeliveredCrackle]],
  // rev. 4 L469: "pay 1 Clay and 1 Coin … not one of the 2 vessels for the Shifu's discount".
  ["DI", KILNS.DI.ability, [KILNS.DI.params.clay, KILNS.DI.params.coins, fd.shifu.maxVessels]],
  ["JU", KILNS.JU.ability, [KILNS.JU.params.wood, ...abs(KILNS.JU.params.deltas)]],
  ["materials_yard.apprentice", LOCATIONS.materials_yard.apprenticeText, [my.apprentice.resources]],
  ["materials_yard.shifu", LOCATIONS.materials_yard.shifuText, [my.shifu.resources]],
  // rev. 4 L183: "Form 1 vessel: pay its Clay cost plus 2 Coins …".
  ["form_decorate.apprentice", LOCATIONS.form_decorate.apprenticeText, [fd.apprentice.maxVessels, vesselCoins()]],
  ["form_decorate.shifu", LOCATIONS.form_decorate.shifuText, [fd.shifu.maxVessels, fd.shifu.maxVessels, fd.shifu.twoVesselDiscount]],
  ["glaze_load.apprentice", LOCATIONS.glaze_load.apprenticeText, [gl.apprentice.maxLoads]],
  // rev. 4 L194: the Shifu "simply loads up to 2" (no Heat marker, changes 28, 31).
  ["glaze_load.shifu", LOCATIONS.glaze_load.shifuText, [gl.shifu.maxLoads]],
  // v1.6.2 L201–202 (change 25): "Select 2."; "Select 3, reserving up to 2 Orders instead of 1,
  // in any mix of the 3 cards and the display".
  ["commission_market.apprentice", LOCATIONS.commission_market.apprenticeText, [cm.apprentice.select]],
  ["commission_market.shifu", LOCATIONS.commission_market.shifuText,
    [cm.shifu.select, cm.shifu.maxReservations, cm.apprentice.maxReservations, cm.shifu.select]],
  ["guild_hall.apprentice", LOCATIONS.guild_hall.apprenticeText, [gh.apprentice.maxTechs]],
  // v1.6.2 L207 (owner revision 2026-10-17): "Choose 1 discipline … top 2 … take up to 2".
  ["guild_hall.shifu", LOCATIONS.guild_hall.shifuText, [1, gh.shifu.inspectCount, gh.shifu.maxTechs]],
  ["canal_wharf.apprentice", LOCATIONS.canal_wharf.apprenticeText, [cw.apprentice.coins]],
  // "the top card of the Main Order deck" is `topMainOrders: 1`, which prints no numeral.
  ["canal_wharf.shifu", LOCATIONS.canal_wharf.shifuText, [cw.shifu.coins]],
  ["magistrates_hall.apprentice", LOCATIONS.magistrates_hall.apprenticeText, [mh.apprentice.coins, mh.apprentice.recognitionSteps]],
  // rev. 4 L241 (change 33): "Pay 4 Coins … by 1 step, then reserve 1 face-up Crown Order".
  ["magistrates_hall.shifu", LOCATIONS.magistrates_hall.shifuText, [mh.shifu.coins, mh.shifu.recognitionSteps, mh.shifu.crownOrders]],
];

describe("printed numbers equal the data parameters", () => {
  it.each(PRINTED_NUMBERS)("%s", (_, text, expected) => {
    expect(numbersIn(text), text).toEqual(expected);
  });

  it("guards every Tech, Kiln and location text", () => {
    const labels = new Set(PRINTED_NUMBERS.map(([label]) => label));
    const missing = [
      ...TECH_IDS.filter((id) => !labels.has(id)),
      ...KILN_IDS.filter((id) => !labels.has(id)),
      ...LOCATION_IDS.flatMap((id) => [`${id}.apprentice`, `${id}.shifu`]).filter((label) => !labels.has(label)),
    ];
    expect(missing).toEqual([]);
  });

  it("prints the Imperial track rewards from the reward data", () => {
    const [local, grant, gift, priority, audience] = IMPERIAL_TRACK.track;
    expect(local?.rewardText).toBeNull();
    const grantReward = grant?.reward;
    expect(grantReward).toEqual({ kind: "resources", clay: 1, wood: 1, coins: 1 });
    if (grantReward?.kind === "resources") {
      expect(numbersIn(grant?.rewardText ?? "")).toEqual([grantReward.clay, grantReward.wood, grantReward.coins]);
    }
    expect(numbersIn(gift?.rewardText ?? "x")).toEqual([]);
    expect(numbersIn(priority?.rewardText ?? "")).toEqual([1]);
    const audienceReward = audience?.reward;
    expect(audienceReward?.kind === "vp" ? numbersIn(audience?.rewardText ?? "") : null)
      .toEqual(audienceReward?.kind === "vp" ? [audienceReward.vp, IMPERIAL_TRACK.overflowVpPerCrown] : null);
  });

  it("keeps every number of an English ability in its Chinese text", () => {
    const pairs: Array<[string, string, string]> = [
      ...TECH_IDS.map((id) => [id, TECHS[id].ability, TECHS[id].abilityZh] as [string, string, string]),
      ...KILN_IDS.map((id) => [id, KILNS[id].ability, KILNS[id].abilityZh] as [string, string, string]),
      ...LOCATION_IDS.flatMap((id) => [
        [`${id}.apprentice`, LOCATIONS[id].apprenticeText, LOCATIONS[id].apprenticeTextZh] as [string, string, string],
        [`${id}.shifu`, LOCATIONS[id].shifuText, LOCATIONS[id].shifuTextZh] as [string, string, string],
      ]),
      ...IMPERIAL_TRACK.track.map((space) => [space.id, space.rewardText ?? "", space.rewardTextZh ?? ""] as [string, string, string]),
    ];
    for (const [label, en, zh] of pairs) {
      const zhNumbers = new Set(numbersIn(zh));
      for (const number of new Set(numbersIn(en))) expect(zhNumbers.has(number), `${label}: ${number} missing from "${zh}"`).toBe(true);
    }
  });

  it("prints the same numbers in the English and Chinese reminder text", () => {
    // Chinese counts with a measure word where English says "a" ("a Shaped vessel" / 1件坯),
    // so the Chinese may add a 1 and nothing else.
    for (const definition of [...TECH_IDS.map((id) => TECHS[id]), ...KILN_IDS.map((id) => KILNS[id])]) {
      const en = new Set(numbersIn(definition.shortText));
      const zh = new Set(numbersIn(definition.shortTextZh));
      for (const number of en) expect(zh.has(number), `${definition.id}: ${number} missing from the Chinese`).toBe(true);
      for (const number of zh) expect(number === 1 || en.has(number), `${definition.id}: ${number} not in the English`).toBe(true);
    }
  });
});

// ── Kilns, locations, capacity ───────────────────────────────────────────────────────────

describe("Kiln Traditions (L454–478)", () => {
  it("defines all five selectable Kilns (R1) with their full printed abilities", () => {
    expect(KILN_IDS).toEqual(["RU", "GU", "GE", "DI", "JU"]);
    expect(SOURCE).toContain("| Kiln Player Boards | 5 | Ru, Guan, Ge, Ding and Jun.");
    for (const id of KILN_IDS) {
      const kiln = KILNS[id];
      const heading = `### ${kiln.name} / ${kiln.nameZh} — ${kiln.abilityName}`;
      const body = section(heading).trim().split(/\n\s*\n/).map(clean).join(" ");
      expect(kiln.ability, id).toBe(body);
      expect(kiln.oncePerRound).toBe(true);
      expect(kiln.ability.startsWith("Once per round")).toBe(true);
    }
  });

  it("matches the DESIGN §6.4 parameter table", () => {
    const rows = tableRows(section("### 6.4 `kilns.json` → `{rulesVersion, kilns: KilnDefinition[5]}`", DESIGN))
      .filter((cells) => KILN_IDS.includes((cells[0] ?? "") as never));
    expect(rows).toHaveLength(5);
    for (const [id = "", params = ""] of rows) {
      expect(KILNS[id as keyof typeof KILNS].params, id).toEqual(designLiteral(params.replaceAll("`", "")));
    }
    expect(KILNS.RU.ability).toContain("Masterpiece with Celadon Glaze and Plain Decoration");
    expect(KILNS.DI.ability).toContain("Bowl, Plate or Brush Washer");
    // Owner revision 4 (change 29; rev. 4 L463, L465).
    expect(KILNS.GE.ability).toContain("choose 1 of your Fine or Standard ceramics from this firing: it develops Crackle and is Fine");
    expect(KILNS.GE.ability).toContain("Each Crackle ceramic you deliver to complete an Order scores 1 VP.");
    expect(KILNS.GE.ability).not.toContain("never a Masterpiece");
  });
});

const LOCATION_HEADINGS: Readonly<Record<LocationId, string>> = {
  materials_yard: "### Materials Yard",
  form_decorate: "### Form & Decorate (personal)",
  glaze_load: "### Glaze & Load (personal)",
  commission_market: "### Commission Market",
  guild_hall: "### Guild Hall",
  canal_wharf: "### Canal Wharf",
  magistrates_hall: "### Magistrate's Hall",
};

const LOCATION_HEADINGS_ZH: Readonly<Record<LocationId, string>> = {
  materials_yard: "### 泥柴场",
  form_decorate: "### 制坯饰纹（坊内）",
  glaze_load: "### 施釉装窑（坊内）",
  commission_market: "### 瓷牙行",
  guild_hall: "### 陶工行",
  canal_wharf: "### 漕运码头",
  magistrates_hall: "### 州衙",
};

describe("locations and capacity (L146–233)", () => {
  it("defines the five central and two personal locations", () => {
    expect([...CENTRAL_LOCATION_IDS, ...PERSONAL_LOCATION_IDS].sort()).toEqual([...LOCATION_IDS].sort());
    expect(SOURCE).toContain("Materials Yard, Commission Market, Guild Hall, Canal Wharf, Magistrate's Hall.");
    for (const id of CENTRAL_LOCATION_IDS) expect(LOCATIONS[id].scope).toBe("central");
    for (const id of PERSONAL_LOCATION_IDS) expect(LOCATIONS[id].scope).toBe("personal");
  });

  it("matches the Capacity by Player Count table", () => {
    const rows = tableRows(section("### Capacity by Player Count")).filter((cells) => cells[0] !== "Location");
    expect(rows).toHaveLength(7);
    for (const [printedName = "", two, three, four] of rows) {
      const id = LOCATION_IDS.find((locationId) => printedName.startsWith(LOCATIONS[locationId].name));
      expect(id, printedName).toBeDefined();
      if (id === undefined) continue;
      const location = LOCATIONS[id];
      if (printedName.endsWith("(personal)")) {
        expect(two).toBe("1 space; 2 once its Cover token is removed");
        expect(location.capacity).toBeNull();
        expect(location.personalSpaces).toEqual({ total: 2, unlockedAtStart: 1 });
        expect(() => locationCapacity(id, 2)).toThrow();
        continue;
      }
      const printed = [two, three, four].map((cell) => (cell === "uncapped" ? null : Number(cell)));
      expect([2, 3, 4].map((n) => locationCapacity(id, n as PlayerCount)), id).toEqual(printed);
    }
  });

  it.each(LOCATION_IDS)("%s prints its Apprentice and Shifu effects", (id) => {
    const block = section(LOCATION_HEADINGS[id]);
    expect(LOCATIONS[id].name).toBe(LOCATION_HEADINGS[id].replace("### ", "").replace(" (personal)", ""));
    expect(LOCATIONS[id].apprenticeText).toBe(row(block, "Apprentice")[1]);
    expect(LOCATIONS[id].shifuText).toBe(row(block, "Shifu")[1]);
  });

  it.each(LOCATION_IDS)("%s prints its Apprentice and Shifu effects in the Chinese edition", (id) => {
    const heading = LOCATION_HEADINGS_ZH[id];
    const block = section(heading, SOURCE_ZH);
    expect(heading.replace("### ", "").replace("（坊内）", "")).toBe(LOCATIONS[id].nameZh);
    expect(LOCATIONS[id].apprenticeTextZh).toBe(row(block, "学徒")[1]);
    expect(LOCATIONS[id].shifuTextZh).toBe(row(block, "师傅")[1]);
  });

  it("matches the DESIGN §6.3 effect table as amended by DELTA §3.2", () => {
    const rows = tableRows(section("### 6.3 `action_locations.json` → `{rulesVersion, locations: LocationDefinition[7]}`", DESIGN))
      .filter((cells) => /^`[a-z_]+`$/.test(cells[0] ?? ""));
    expect(rows).toHaveLength(7);
    const expected = new Map<LocationId, { apprentice: unknown; shifu: unknown }>();
    for (const cells of rows) {
      const id = (cells[0] ?? "").replaceAll("`", "") as LocationId;
      const literals = [...(cells[3] ?? "").matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "");
      expected.set(id, { apprentice: designLiteral(literals[0] ?? ""), shifu: designLiteral(literals[1] ?? "") });
    }
    // DELTA §3.2: `| `id` | apprentice `{…}`; shifu `{…}` | … |`, either effect optional.
    const amended = tableRows(section("### 3.2 `action_locations.json`", DELTA)).filter((cells) => /^`[a-z_]+`$/.test(cells[0] ?? ""));
    expect(amended.map((cells) => cells[0])).toEqual(["`materials_yard`", "`commission_market`", "`guild_hall`", "`canal_wharf`"]);
    for (const cells of amended) {
      const id = (cells[0] ?? "").replaceAll("`", "") as LocationId;
      const entry = expected.get(id);
      if (entry === undefined) throw new Error(`DELTA §3.2 names unknown location ${id}`);
      for (const effect of ["apprentice", "shifu"] as const) {
        const literal = new RegExp(`${effect} \`([^\`]+)\``).exec(cells[1] ?? "")?.[1];
        if (literal !== undefined) entry[effect] = designLiteral(literal);
      }
    }
    // DELTA §15.8 (owner revision 4): Materials Yard 4 / 8 (rev. 4 L176–177, change 34); the
    // Shifu's −1 Coin when forming 2 is a vessel's, not a Decoration's (rev. 4 L184, change 30);
    // the Glaze & Load fuel and no Heat marker (rev. 4 L194, L197, changes 31, 34, 35, R24); the
    // Magistrate's Hall Shifu pays 4 and reserves a Crown Order (rev. 4 L241, change 33, R21).
    const revision4: Partial<Record<LocationId, { apprentice: unknown; shifu: unknown }>> = {
      materials_yard: { apprentice: { resources: 4 }, shifu: { resources: 8 } },
      form_decorate: { apprentice: { maxVessels: 1 }, shifu: { maxVessels: 2, twoVesselDiscount: 1 } },
      glaze_load: {
        apprentice: { maxLoads: 1, maxImperialLoads: 1, sharedKilnWood: 1 },
        shifu: { maxLoads: 2, maxImperialLoads: 1, sharedKilnWood: 1 },
      },
      magistrates_hall: { apprentice: { coins: 4, recognitionSteps: 1 }, shifu: { coins: 4, recognitionSteps: 1, crownOrders: 1 } },
    };
    for (const [id, effects] of Object.entries(revision4) as Array<[LocationId, { apprentice: unknown; shifu: unknown }]>) {
      expected.set(id, effects);
    }
    for (const id of LOCATION_IDS) {
      expect(LOCATIONS[id].effects.apprentice, id).toEqual(expected.get(id)?.apprentice);
      expect(LOCATIONS[id].effects.shifu, id).toEqual(expected.get(id)?.shifu);
    }
    expect(LOCATIONS.magistrates_hall.usableAtRecognition).toEqual([0, 1, 2]);
    expect(SOURCE).toContain("may be used while at Recognition 0, **1 or 2**");
    for (const id of LOCATION_IDS.filter((locationId) => locationId !== "magistrates_hall")) {
      expect(LOCATIONS[id].usableAtRecognition, id).toBeNull();
    }
  });

  it("matches the Appendix E action summary numbers", () => {
    const summary = section("### Action Summary");
    const expectations: Record<LocationId, [number[], number[]]> = {
      materials_yard: [[my.apprentice.resources], [my.shifu.resources]],
      // rev. 4 L691: "Form 1: Clay + 2 Coins, any Decoration"; "Form up to 2; if 2, one costs 1 Coin less".
      form_decorate: [[fd.apprentice.maxVessels, vesselCoins()], [fd.shifu.maxVessels, fd.shifu.maxVessels, fd.shifu.twoVesselDiscount]],
      // rev. 4 L692: "Glaze and load 1 (1 Wood)"; "Glaze and load up to 2 (still 1 Wood)".
      glaze_load: [[gl.apprentice.maxLoads, gl.apprentice.sharedKilnWood], [gl.shifu.maxLoads, gl.shifu.sharedKilnWood]],
      commission_market: [[cm.apprentice.select], [cm.shifu.select, cm.shifu.maxReservations]],
      guild_hall: [[gh.apprentice.maxTechs], [gh.shifu.inspectCount, 1, gh.shifu.maxTechs]],
      canal_wharf: [[cw.apprentice.coins], [cw.shifu.coins]],
      magistrates_hall: [
        [mh.apprentice.coins, mh.apprentice.recognitionSteps,
          ...(LOCATIONS.magistrates_hall.usableAtRecognition ?? []).flatMap((r) => [r, r + mh.apprentice.recognitionSteps])],
        // rev. 4 L696: "Pay 4 Coins → same, and reserve 1 face-up Crown Order".
        [mh.shifu.coins, mh.shifu.crownOrders],
      ],
    };
    for (const id of LOCATION_IDS) {
      const [, apprentice = "", shifu = ""] = row(summary, LOCATIONS[id].name);
      expect(numbersIn(apprentice), `${id} apprentice`).toEqual(expectations[id][0]);
      expect(numbersIn(shifu), `${id} shifu`).toEqual(expectations[id][1]);
    }
    expect(summary).toContain("Materials Yard, Commission Market and Guild Hall use 2 / 3 / 4 spaces in 2 / 3 / 4-player games");
    expect(summary).toContain("The Magistrate's Hall has 1 / 1 / 2 spaces, usable at Recognition 0–2");
  });

  it("prints the V1.6.2 Guild Hall takes, deferred refill and placement rule (owner revision 2026-10-17)", () => {
    const block = section(LOCATION_HEADINGS.guild_hall);
    expect(block).toContain("Then take **up to 2 Advanced Techs from different disciplines**, face-up or revealed, paying the printed cost of each.");
    expect(block).toContain("A taken tile's position stays **empty until the end of your turn**; then refill each discipline to 2 if possible. A Shifu's second Tech is chosen from what is showing now.");
    expect(block).toContain("A placement here is legal only if you can afford at least 1 face-up Tech from a discipline you do not yet own.");
    // The Shifu discount is gone from the location, the summary and the change list (v1.6.2 L31).
    expect(block).not.toMatch(/Coins? less|discount/);
    expect(row(section("### Action Summary"), LOCATIONS.guild_hall.name)[2]).toContain("buy up to 2 Techs from different disciplines at cost");
    expect(SOURCE.split("\n")[30]).toContain("Guild Hall Shifu takes up to 2 Techs from different disciplines at printed cost (no discount)");
    expect(LOCATIONS.guild_hall.effects).toEqual({ apprentice: { maxTechs: 1 }, shifu: { inspectCount: 2, maxTechs: 2 } });
  });
});

// ── Components, setup, firing and scoring values ─────────────────────────────────────────

describe("setup, production, firing and scoring values", () => {
  it("sets up as L98–112 prints", () => {
    expect(SOURCE).toContain(`**2–4 players`);
    expect(GAME_CONFIG.players).toEqual({ min: 2, max: 4 });
    expect(SOURCE).toContain(`The game lasts exactly **${GAME_CONFIG.rounds} rounds**.`);
    const { clay, wood, coins } = GAME_CONFIG.startingResources;
    expect(SOURCE).toContain(`Each player receives **${clay} Clay, ${wood} Wood and ${coins} Coins**.`);
    // rev. 4 L125 (changes 34, 35): 3 Wood, and no seat Coin.
    expect([clay, wood, coins]).toEqual([2, 3, 3]);
    expect(SOURCE).not.toMatch(/starts with 1 extra Coin\.\s*$/m);
    expect(SOURCE).toContain(`takes ${GAME_CONFIG.workers.shifu} Shifu, ${GAME_CONFIG.workers.apprentices} Apprentices`);
    // rev. 4 L115, L122 (change 32, R23): 2 Starting Orders dealt; 1 face-up Main Order taken with the Kiln.
    expect(SOURCE).toContain(`Deal each player **${GAME_CONFIG.setupDeal.startingOrders} Starting Orders**, kept secret.`);
    expect(GAME_CONFIG.setupFaceUpMainOrders).toBe(1);
    expect(SOURCE).toContain("and takes **1 face-up Main Order** from the display into their hand; refill the display to 6 after each take.");
    // rev. 4 L116: the 6 are revealed straight off the deck (nothing Main is dealt first).
    expect(SOURCE).toContain(`Reveal **${GAME_CONFIG.mainMarket.displaySize} face-up Main Orders** from the Main Order deck, left to right.`);
    expect(SOURCE).toContain(`reveal **${GAME_CONFIG.techs.faceUpPerDiscipline} face-up tiles from each**`);
    expect(SOURCE).toContain(`Discard the **${GAME_CONFIG.mainMarket.roundStartDiscard} leftmost face-up Main Orders**`);
    expect(SOURCE).toContain(`hand limit of **${GAME_CONFIG.handLimit.base}** (${TECHS.T10.params.handLimit} with Colour Samples)`);
    expect(SOURCE).toContain(`at most **${GAME_CONFIG.techs.maxOwned} Advanced Techs and at most ${GAME_CONFIG.techs.maxPerDiscipline} from each discipline**`);
    expect(SOURCE).toContain(`Exactly ${GAME_CONFIG.techs.perDiscipline} Form & Decorate, ${GAME_CONFIG.techs.perDiscipline} Glazing & Loading and ${GAME_CONFIG.techs.perDiscipline} Firing`);
  });

  it("scores no VP for Advanced Techs, per rulebook change 27 (v1.6.2 L37; rev. 4 L487, L596, L737), which superseded owner amendment A1", () => {
    expect(GAME_CONFIG.techs).not.toHaveProperty("vpEach");
    const lines = SOURCE.split("\n");
    expect(lines[36]).toContain("27. **Tech VP removed.** Advanced Techs no longer score 1 VP when gained.");
    expect(lines[36]).toContain("Connoisseur's Cabinet keeps its end-game VP. Printed costs unchanged");
    // Change 20 (line 30, A1) stays in the change log as history; no rule line scores Tech VP.
    expect(lines[29]).toContain("20. **Tech VP scored on purchase.**");
    expect(SOURCE).not.toMatch(/Each Advanced Tech scores/);
    expect(SOURCE).not.toMatch(/Advanced Techs: \*\*1 VP each\*\*/);
    // Final scoring (rev. 4 L485–489): recorded VP without Techs, the Exhibition, Coins.
    expect(lines[486]).toBe("1. all VP recorded during play: Orders, Kiln Tradition abilities, **Imperial Audience** and VP from Crowns gained beyond Recognition 4;");
    expect(lines[487]).toBe("2. the end-game Exhibition;");
    expect(lines[488]).toBe(`3. **1 VP per 3 Coins remaining**, maximum **5 VP**.`);
    expect(lines[595]).toBe("Tech tiles use abbreviated reminder text; this appendix gives the full effects. A player owns at most 3 and at most 1 per discipline. **Form & Decorate** tiles remove the Cover token from your second Form & Decorate space, **Glazing & Loading** tiles the one from your second Glaze & Load space; **Firing** tiles remove nothing.");
    // Connoisseur's Cabinet keeps its end-game VP (Appendix B).
    expect(TECHS.T19.params).toEqual({ vpPerCeramic: 1, qualities: ["fine", "masterpiece"], maxVp: 5 });
    // The audit records A1 as superseded by change 27.
    const a1 = AUDIT.split("\n").find((line) => line.startsWith("| A1 |"));
    expect(a1).toBeDefined();
    const [id, date, amendment, overrides] = cellsOf(a1 ?? "");
    expect([id, date]).toEqual(["A1", "2026-10-15"]);
    // `cellsOf` strips the bold markup: the cell opens "**Superseded**".
    expect(amendment).toMatch(/^Superseded by rulebook change 27\b/);
    expect(amendment).toContain("change 27");
    expect(overrides).toContain("none");
  });

  it("prices Shapes, Decorations and Glazes as L319–353 print", () => {
    const shapes = section("### Shapes and Forming Costs");
    for (const shape of SHAPES) {
      const [, clay, cards] = row(shapes, Object.keys(SHAPE_NAMES).find((name) => SHAPE_NAMES[name] === shape) ?? "");
      expect(shapeClay(shape), shape).toBe(Number(clay));
      expect(GAME_CONFIG.shapeSupplyEach).toBe(Number(cards));
    }
    // rev. 4 L336 (change 30): one forming price, any Decoration; the cost table is gone.
    const decorations = section("### Decorations");
    expect(decorations).toContain(`Forming costs the Shape's Clay plus **${vesselCoins()} Coins**; choose any Decoration — Plain, Carved, Impressed or Painted — when the vessel is formed.`);
    expect(decorations).not.toContain("| Decoration | Cost |");
    expect(GAME_CONFIG.decorations).toEqual([...DECORATIONS]);
    expect(DECORATIONS.map((decoration) => Object.keys(DECORATION_NAMES).find((name) => DECORATION_NAMES[name] === decoration))).toEqual(["Plain", "Carved", "Impressed", "Painted"]);
    const glazes = section("### Glazes and Preferred Heat");
    for (const glaze of GLAZES) {
      const [, heat] = row(glazes, Object.keys(GLAZE_NAMES).find((name) => GLAZE_NAMES[name] === glaze) ?? "");
      expect(preferredHeat(glaze), glaze).toBe(Number(heat));
    }
  });

  it("builds the Shared Kiln of L72 and covers spaces as L100 prints", () => {
    expect(SOURCE).toContain("Eight spaces: 3 High (+1), 3 Middle (0), 2 Low (−1).");
    const counts: Record<KilnZone, number> = { high: 0, middle: 0, low: 0 };
    for (const id of KILN_SPACE_IDS) counts[zoneOf(id)] += 1;
    expect(counts).toEqual({ high: 3, middle: 3, low: 2 });
    for (const id of KILN_SPACE_IDS) expect(zoneModifier(id)).toBe({ high: 1, middle: 0, low: -1 }[zoneOf(id)]);
    const layout = (n: PlayerCount): string => {
      const active = activeKilnSpaces(n);
      return (["high", "middle", "low"] as const).map((zone) => active.filter((id) => zoneOf(id) === zone).length).join("-");
    };
    expect([layout(2), layout(3), layout(4)]).toEqual(["2-1-1", "2-2-2", "3-3-2"]);
    expect(SOURCE).toContain("**3 players** use 6 spaces, covering 1 High and 1 Middle space (2-2-2)");
    expect(SOURCE).toContain("**2 players** use 4 spaces, covering 1 High, 2 Middle and 1 Low space (2-1-1)");
    expect([activeKilnSpaces(2).length, activeKilnSpaces(3).length, activeKilnSpaces(4).length]).toEqual([4, 6, 8]);
  });

  it("rolls the Kiln Die of L93 and clamps Base Heat to 0–5 (L249)", () => {
    expect(SOURCE).toContain(`Six-sided, faces ${FIRING.kilnDie.faces.join(", ")}.`);
    expect(FIRING.kilnDie.faces).toEqual([1, 1, 2, 2, 3, 3]);
    expect(SOURCE).toContain(`Clamp Base Heat to ${FIRING.baseHeat.minimum}–${FIRING.baseHeat.maximum}.`);
  });

  it("uses the Appendix C Fire deck", () => {
    const rows = tableRows(section("## Appendix C — Fire Deck")).filter((cells) => /^[−+]?\d$/.test(cells[0] ?? ""));
    expect(rows).toHaveLength(5);
    for (const [modifier = "", cards] of rows) {
      const value = Number(modifier.replace("−", "-"));
      expect(FIRING.fireDeck.filter((card) => card === value).length, modifier).toBe(Number(cards));
    }
    expect(FIRING.fireDeck).toHaveLength(12);
  });

  it("matches the Contribution card table and Fuel Ledger's 2 cards (v1.6.2 L262–266, L634, change 26)", () => {
    const block = section("### Contribution Cards");
    expect(CONTRIBUTION_CARD_IDS).toEqual(["BANK", "TEND", "STOKE", "FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"]);
    expect(BASE_CONTRIBUTION_CARD_IDS).toEqual(["BANK", "TEND", "STOKE"]);
    for (const id of BASE_CONTRIBUTION_CARD_IDS) {
      const card = contributionCard(id);
      const [, wood, heat] = row(block, card.name);
      expect(card.woodCost, id).toBe(Number(wood));
      expect(card.heat, id).toBe(Number((heat ?? "").replace("−", "-").replace("+", "")));
      expect(card.techId, id).toBeNull();
    }
    // "The owner of **Fuel Ledger** holds 2 more cards, **Fuel Ledger Bank** (1 Wood, −2) and
    // **Fuel Ledger Stoke** (1 Wood, +2)" (L266), as Appendix B and the Quick Reference print them.
    for (const id of ["FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"] as const) {
      const card = contributionCard(id);
      const sign = card.heat < 0 ? "−" : "+";
      expect(block).toContain(`**${card.name}** (${card.woodCost} Wood, ${sign}${Math.abs(card.heat)})`);
      expect(SOURCE).toContain(`${card.name} ${card.woodCost} Wood / ${sign}${Math.abs(card.heat)}`);
      expect(card.techId).toBe("T12");
    }
    expect(TECHS.T12.params.cards).toEqual(["FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"]);
    expect(TECHS.T12.params.freeCards).toEqual(["BANK", "STOKE"]);
    expect(block).toContain("they still play exactly 1 card");
  });

  it("assigns Quality by the Quality table (L274–279)", () => {
    const block = section("### Quality Table");
    expect(row(block, "0")[1]).toBe("Masterpiece");
    expect(row(block, "1")[1]).toBe("Fine");
    expect(row(block, "2")[1]).toBe("Standard");
    expect(row(block, "3+")[1]).toBe("Flawed");
    expect([0, 1, 2, 3, 4, 7, -1, -2, -3].map(qualityForDifference))
      .toEqual(["masterpiece", "fine", "standard", "flawed", "flawed", "flawed", "fine", "standard", "flawed"]);
    expect(QUALITY_RANK.masterpiece > QUALITY_RANK.fine && QUALITY_RANK.fine > QUALITY_RANK.standard
      && QUALITY_RANK.standard > QUALITY_RANK.flawed).toBe(true);
    // Rev. 4 L282, L284 (change 30): a Flawed ceramic is sold for 2 Coins (during its owner's
    // turn, R20); the firing-step salvage is gone.
    expect(row(block, "3+")[2]).toBe(`Cannot complete Orders or enter the Exhibition; may be sold at any time for ${FIRING.flawedSaleCoins} Coins.`);
    expect(SOURCE).toContain(`A Flawed ceramic may be **sold at any time for ${FIRING.flawedSaleCoins} Coins**: return its Vessel card to the matching Shape supply.`);
    expect(SOURCE).toContain("choose a modifier of −1, 0 or +1");
    expect(FIRING.imperialModifiers).toEqual([-1, 0, 1]);
  });

  it("scores the Exhibition, Recognition and Coins as L429–494 print", () => {
    const exhibition = section("### End-game Exhibition");
    const vp = IMPERIAL_TRACK.exhibition.qualityVp;
    expect(row(exhibition, "Standard")[1]).toBe(String(vp.standard));
    expect(row(exhibition, "Fine")[1]).toBe(String(vp.fine));
    expect(row(exhibition, "Masterpiece")[1]).toBe(String(vp.masterpiece));
    const { distinctShapes, distinctGlazes } = IMPERIAL_TRACK.exhibition;
    expect(exhibition).toContain(`**+${distinctShapes.vp} VP** if your Exhibition contains at least **${distinctShapes.threshold} different Shapes**`);
    expect(exhibition).toContain(`**+${distinctGlazes.vp} VP** if it contains at least **${distinctGlazes.threshold} different Glazes**`);
    expect(SOURCE).toContain(`**1 VP per ${GAME_CONFIG.coinEndGame.coinsPerVp} Coins remaining**, maximum **${GAME_CONFIG.coinEndGame.maxVp} VP**`);

    const track = section("### Imperial Recognition Track");
    const titles = IMPERIAL_TRACK.track.map((space) => row(track, space.space === 0 ? "0" : `${space.space} (${space.space} Crown${space.space === 1 ? "" : "s"})`)[1]);
    expect(titles).toEqual(IMPERIAL_TRACK.track.map((space) => space.title));
    expect(row(track, "1 (1 Crown)")[2]).toBe(IMPERIAL_TRACK.track[1]?.rewardText);
    expect(row(track, "4 (4 Crowns)")[2]).toBe(`Gain ${(IMPERIAL_TRACK.track[4]?.reward as { vp: number }).vp} VP.`);
    expect(row(track, "Each further Crown")[2]).toBe(`+${IMPERIAL_TRACK.overflowVpPerCrown} VP`);

    const scoring = section("### Scoring");
    expect(scoring).toContain(`Standard ${vp.standard} / Fine ${vp.fine} / Masterpiece ${vp.masterpiece}`);
    expect(scoring).toContain(`Connoisseur's Cabinet +${TECHS.T19.params.vpPerCeramic} per Fine or Masterpiece, max +${TECHS.T19.params.maxVp}`);
    expect(scoring).toContain(`1 VP per ${GAME_CONFIG.coinEndGame.coinsPerVp}, maximum ${GAME_CONFIG.coinEndGame.maxVp}`);
  });
});

// ── Components, round structure and Imperial milestones (both editions) ──────────────────

const readData = <T,>(file: string): T => JSON.parse(readFileSync(join(ROOT, "data", file), "utf8")) as T;

interface ComponentRow {
  id: string;
  name: string;
  nameZh: string;
  qty: number | string;
  notes: string;
  notesZh: string;
}

/**
 * English component notes that deliberately differ from the English row, with the reason. The
 * Chinese edition prints these notes in their digital wording already, so the Chinese never differs.
 */
const COMPONENT_NOTE_ADAPTATIONS: Readonly<Record<string, string>> = {
  kiln_player_boards: "D7: the second space is added by learning a Tech, never under a token",
  lock_tokens: "D7: physical prototype only; the digital game has no Cover token",
};

describe("components, round phases and Imperial milestones are the rulebook tables in both editions", () => {
  const components = readData<{ components: ComponentRow[] }>("components.json").components;
  const componentsEn = tableRows(section("## Components")).slice(1);
  const componentsZh = tableRows(section("## 配件", SOURCE_ZH)).slice(1);

  it("lists every component of the Components table, in order, with its printed quantity (L71–96)", () => {
    expect(components.map((component) => [component.name, String(component.qty)])).toEqual(componentsEn.map((cells) => [cells[0], cells[1]]));
    // The one quantity that is not a number, "4 or 1" (VP Markers / Score Pad), prints as 4或1.
    expect(components.map((component) => [component.nameZh, String(component.qty).replace(" or ", "或")]))
      .toEqual(componentsZh.map((cells) => [cells[0], cells[1]]));
    // Change 23 (L33, L84): the Starting Order deck has 8 cards.
    expect(components.find((component) => component.id === "starting_order_cards")?.qty).toBe(STARTING_ORDER_IDS.length);
    expect(components.find((component) => component.id === "main_order_cards")?.qty).toBe(MAIN_ORDER_IDS.length);
  });

  it("prints each component's notes as the rows do, with the recorded D7 adaptations", () => {
    components.forEach((component, index) => {
      expect(component.notesZh, component.id).toBe(componentsZh[index]?.[2]);
      const printed = componentsEn[index]?.[2];
      if (component.id in COMPONENT_NOTE_ADAPTATIONS) expect(component.notes, component.id).not.toBe(printed);
      else expect(component.notes, component.id).toBe(printed);
    });
    for (const id of Object.keys(COMPONENT_NOTE_ADAPTATIONS)) expect(components.map((component) => component.id)).toContain(id);
  });

  it("names and summarises the five round phases as the Round Structure tables print them (L116–124)", () => {
    const phases = readData<{ phases: Array<{ order: number; name: string; nameZh: string; summary: string; summaryZh: string }> }>("round_structure.json").phases;
    const en = tableRows(section("## Round Structure")).slice(1);
    const zh = tableRows(section("## 每轮流程", SOURCE_ZH)).slice(1);
    expect(phases.map((phase) => [String(phase.order), phase.name, phase.summary])).toEqual(en);
    expect(phases.map((phase) => [String(phase.order), phase.nameZh, phase.summaryZh])).toEqual(zh);
  });

  it("prints the Imperial milestones as both track tables do (L428–437)", () => {
    const en = tableRows(section("### Imperial Recognition Track")).slice(1);
    const zh = tableRows(section("### 御府声望轨", SOURCE_ZH)).slice(1);
    for (const space of IMPERIAL_TRACK.track) {
      const [, title, reward] = en[space.space] ?? [];
      const [, titleZh, rewardZh] = zh[space.space] ?? [];
      expect([space.title, space.titleZh], space.id).toEqual([title, titleZh]);
      if (space.rewardText === null) {
        expect([reward, rewardZh, space.rewardTextZh], space.id).toEqual(["—", "—", null]);
      } else if (space.id === "imperial_audience") {
        // The milestone text adds the next row, "Each further Crown | +1 VP" (L435, L437).
        expect(space.rewardText).toBe(`${reward} After this, each further Crown scores ${IMPERIAL_TRACK.overflowVpPerCrown} VP immediately.`);
        expect(space.rewardTextZh).toBe(`${rewardZh}此后每获得1个御令，立即得${IMPERIAL_TRACK.overflowVpPerCrown}分。`);
      } else {
        expect([space.rewardText, space.rewardTextZh], space.id).toEqual([reward, rewardZh]);
      }
    }
    expect(en[5]).toEqual(["Each further Crown", "", `+${IMPERIAL_TRACK.overflowVpPerCrown} VP`]);
    expect(zh[5]).toEqual(["此后每个御令", "", `+${IMPERIAL_TRACK.overflowVpPerCrown}分`]);
  });

  it("names the Contribution cards as the Chinese Contribution table and Fuel Ledger's sentence print them", () => {
    const block = section("### 控火牌", SOURCE_ZH);
    for (const id of BASE_CONTRIBUTION_CARD_IDS) {
      const card = contributionCard(id);
      const [, wood, heat] = row(block, card.nameZh);
      expect(card.woodCost, id).toBe(Number(wood));
      expect(card.heat, id).toBe(Number((heat ?? "").replace("−", "-").replace("+", "")));
    }
    for (const id of ["FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"] as const) {
      const card = contributionCard(id);
      const sign = card.heat < 0 ? "−" : "+";
      expect(block).toContain(`**${card.nameZh}**（${card.woodCost}柴，${sign}${Math.abs(card.heat)}）`);
    }
  });
});

// ── Rule-error text table (DESIGN §6.10) ─────────────────────────────────────────────────

const ERROR_CODES = [...(TYPES.split("export type GameRuleErrorCode =")[1]?.split(";")[0] ?? "").matchAll(/"([A-Z_]+)"/g)]
  .map((match) => match[1] as GameRuleErrorCode);

describe("rule-error text", () => {
  it("has an entry for exactly the GameRuleErrorCode union", () => {
    expect(ERROR_CODES.length).toBeGreaterThan(40);
    expect(Object.keys(RULE_ERROR_TEXT).sort()).toEqual([...ERROR_CODES].sort());
  });

  it.each(ERROR_CODES)("%s has EN and ZH text whose placeholders are documented detail keys", (code) => {
    const entry = RULE_ERROR_TEXT[code];
    for (const template of [entry, ...(entry.fallbacks ?? [])]) {
      expect(template.en.trim().length).toBeGreaterThan(0);
      expect(template.zh.trim().length).toBeGreaterThan(0);
      const placeholders = (text: string): string[] => [...text.matchAll(/\{([A-Za-z]+)\}/g)].map((match) => match[1] ?? "");
      expect(placeholders(template.zh).sort()).toEqual(placeholders(template.en).sort());
      for (const key of placeholders(template.en)) expect(entry.detailKeys, `${code} uses {${key}}`).toContain(key);
    }
    for (const key of COMMON_DETAIL_KEYS) expect(entry.detailKeys).toContain(key);
    expect(new Set(entry.detailKeys).size).toBe(entry.detailKeys.length);
  });

  it("states the Magistrate's Hall gate with the location's data", () => {
    const usable = LOCATIONS.magistrates_hall.usableAtRecognition ?? [];
    const gate = [Math.min(...usable), Math.max(...usable), Math.max(...usable) + 2];
    expect(numbersIn(RULE_ERROR_TEXT.RECOGNITION_GATE.en)).toEqual(gate);
    expect(numbersIn(RULE_ERROR_TEXT.RECOGNITION_GATE.zh)).toEqual(gate);
  });
});

// ── Load-time validation (DESIGN §6.9) ───────────────────────────────────────────────────

function currentFiles(): ContentFiles {
  return structuredClone({
    gameConfig: GAME_CONFIG,
    firing: FIRING,
    actionLocations: { rulesVersion: RULES_VERSION, locations: LOCATION_IDS.map((id) => LOCATIONS[id]) },
    kilns: { rulesVersion: RULES_VERSION, kilns: KILN_IDS.map((id) => KILNS[id]) },
    techniques: { rulesVersion: RULES_VERSION, advanced: TECH_IDS.map((id) => TECHS[id]) },
    orders: {
      rulesVersion: RULES_VERSION,
      clarifications: ORDER_CLARIFICATIONS,
      starting: STARTING_ORDER_IDS.map((id) => ORDERS[id]),
      main: MAIN_ORDER_IDS.map((id) => ORDERS[id]),
    },
    imperialProgress: IMPERIAL_TRACK,
  }) as ContentFiles;
}

describe("content validation", () => {
  it("accepts the checked-in content and freezes it", () => {
    expect(validateContentFiles(currentFiles())).toEqual([]);
    expect(Object.isFrozen(ORDERS.O01)).toBe(true);
    expect(Object.isFrozen(ORDERS.O47.relations)).toBe(true);
    expect(Object.isFrozen(TECHS.T01.params.triggerShapes)).toBe(true);
    expect(Object.isFrozen(GAME_CONFIG.sharedKiln.activeSpacesByPlayerCount["2"])).toBe(true);
  });

  const mutations: Array<[string, (files: ContentFiles) => void]> = [
    ["a wrong rules version", (files) => { (files.orders as { rulesVersion: string }).rulesVersion = "1.4"; }],
    ["the V1.6.1 rules version", (files) => { (files.techniques as { rulesVersion: string }).rulesVersion = "1.6.1"; }],
    ["a Commission Select smaller than its reservations", (files) => {
      const market = files.actionLocations.locations.find((location) => location.id === "commission_market");
      (market?.effects as unknown as { shifu: { select: number } }).shifu.select = 1;
    }],
    ["a Commission effect that reserves nothing", (files) => {
      const market = files.actionLocations.locations.find((location) => location.id === "commission_market");
      (market?.effects as { apprentice: { maxReservations: number } }).apprentice.maxReservations = 0;
    }],
    ["the retired Materials Yard bonus", (files) => {
      const yard = files.actionLocations.locations.find((location) => location.id === "materials_yard");
      (yard?.effects.shifu as Record<string, unknown>)["bonus"] = { coins: 1, clay: 1, wood: 1 };
    }],
    ["a Canal Wharf Shifu without its Main Order draw", (files) => {
      const wharf = files.actionLocations.locations.find((location) => location.id === "canal_wharf");
      delete (wharf?.effects.shifu as Record<string, unknown>)["topMainOrders"];
    }],
    ["a missing Starting Order", (files) => { files.orders.starting.pop(); }],
    ["a Crown on a Starting Order", (files) => { (files.orders.starting[0] as { crowns: number }).crowns = 1; }],
    ["a relation that skips a slot", (files) => {
      const order = files.orders.main.find((candidate) => candidate.id === "O26") as OrderDefinition;
      order.relations = [{ type: "same_glaze", indices: [0] }];
    }],
    ["too many required Glazes", (files) => {
      const order = files.orders.main.find((candidate) => candidate.id === "O30") as OrderDefinition;
      order.relations = [{ type: "required_glazes", values: ["white", "moon_white", "celadon"] }];
    }],
    ["a seventh Form & Decorate Tech", (files) => { (files.techniques.advanced[6] as { discipline: string }).discipline = "workshop"; }],
    ["a Firing Tech that unlocks a space", (files) => {
      (files.techniques.advanced[12] as { unlocks: string | null }).unlocks = "glaze_load";
    }],
    ["a four-Kiln roster", (files) => { files.kilns.kilns.pop(); }],
    ["a fixed Fire deck", (files) => { files.firing.fireDeck[0] = 0; }],
    ["a six-sided ordinary die", (files) => { files.firing.kilnDie.faces = [1, 2, 3, 4, 5, 6] as never; }],
    ["a 3-2-3 Shared Kiln at 4 players", (files) => { files.firing.kilnSpaces[2] = { id: "high_3", zone: "low", modifier: -1 }; }],
    ["a 2-player layout that is not 2-1-1", (files) => {
      files.gameConfig.sharedKiln.activeSpacesByPlayerCount["2"] = ["high_1", "middle_1", "middle_2", "low_1"];
    }],
    ["a personal location with a central capacity", (files) => {
      (files.actionLocations.locations[1] as { capacity: unknown }).capacity = { 2: 1, 3: 1, 4: 1 };
    }],
    ["an empty Chinese name", (files) => { (files.techniques.advanced[0] as { nameZh: string }).nameZh = " "; }],
    ["an empty Chinese requirement", (files) => { (files.orders.main[0] as { requirementsZh: string }).requirementsZh = ""; }],
    ["a Tech whose clarifications are not an array", (files) => { (files.techniques.advanced[4] as { clarifications: unknown }).clarifications = "none"; }],
    ["a malformed clarification source tag", (files) => {
      (files.kilns.kilns[1]?.clarifications[0] as { source: string }).source = "Rule 4";
    }],
    ["a clarification with an extra field", (files) => {
      (files.actionLocations.locations[0]?.clarifications[0] as unknown as Record<string, string>)["note"] = "x";
    }],
    ["missing Order clarifications", (files) => { (files.orders as { clarifications: unknown }).clarifications = undefined; }],
    ["a short text with Markdown", (files) => { (files.techniques.advanced[0] as { shortText: string }).shortText = "**Once per round:** x"; }],
    ["a short text with no timing clause", (files) => { (files.kilns.kilns[0] as { shortTextZh: string }).shortTextZh = "得4分"; }],
  ];

  it.each(mutations)("rejects %s", (_, mutate) => {
    const files = currentFiles();
    mutate(files);
    expect(validateContentFiles(files).length).toBeGreaterThan(0);
  });
});

// ── One source per value ─────────────────────────────────────────────────────────────────

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe("one source per value", () => {
  const engineFiles = sourceFiles(join(ROOT, "src/game")).map((file) => relative(ROOT, file).replaceAll("\\", "/"));

  it("reads data/*.json only through content.ts and rulesFingerprint.ts (and the display-only round structure)", () => {
    const readers = engineFiles.filter((file) =>
      /from\s+["'][./]*data\/[a-z_]+\.json["']/.test(readFileSync(join(ROOT, file), "utf8")));
    // roundStructure.ts reads only data/round_structure.json: round-phase names and summaries
    // for display, no rule value and no fingerprint input (UI_V1.6.1_ARCHITECTURE §5 gap 17).
    expect(readers.sort()).toEqual(["src/game/content.ts", "src/game/roundStructure.ts", "src/game/rulesFingerprint.ts"]);
    const display = readFileSync(join(ROOT, "src/game/roundStructure.ts"), "utf8").match(/data\/[a-z_]+\.json/g);
    expect([...new Set(display)]).toEqual(["data/round_structure.json"]);
  });

  it("declares no Glaze heat literal outside content.ts", () => {
    const offenders: string[] = [];
    for (const file of engineFiles.filter((name) => name !== "src/game/content.ts")) {
      readFileSync(join(ROOT, file), "utf8").split("\n").forEach((line, index) => {
        const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
        if (code.trimStart().startsWith("*")) return;
        if (/\b(white|celadon|grey_green|moon_white)\b\s*["']?\s*[:,=]\s*[0-5]\b/.test(code)) offenders.push(`${file}:${index + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

// ── Full ability text: the English rulebook and its Chinese edition ─────────────────────

describe("full Tech and Kiln abilities are the rulebook text in both languages", () => {
  const ZH_B_SECTIONS: ReadonlyArray<readonly [TechDiscipline, string]> = [
    ["workshop", "### B1. 坯作——6张"],
    ["glazing_loading", "### B2. 釉作——6张"],
    ["firing", "### B3. 火作——6张"],
  ];
  const zhTechRowsOf = (source: string) => ZH_B_SECTIONS.flatMap(([discipline, heading]) =>
    tableRows(section(heading, source)).filter((cells) => /^\d+$/.test(cells[1] ?? "")).map((cells) => ({ discipline, cells })));
  const zhTechRows = zhTechRowsOf(SOURCE_ZH);
  const zhTechRowsV161 = zhTechRowsOf(SOURCE_ZH_V161);

  it("the Chinese Appendix B prints the same 18 tiles, disciplines and costs", () => {
    expect(zhTechRows).toHaveLength(18);
    for (const { discipline, cells } of zhTechRows) {
      const id = TECH_IDS.find((techId) => TECHS[techId].nameZh === cells[0]);
      expect(id, cells[0]).toBeDefined();
      if (id === undefined) continue;
      expect(TECHS[id].discipline, id).toBe(discipline);
      expect(TECHS[id].cost, id).toBe(Number(cells[1]));
    }
  });

  it.each(TECH_IDS)("Tech %s: ability is the English Appendix B cell, abilityZh the Chinese one", (id) => {
    const tech = TECHS[id];
    const en = techRows.find((entry) => techByPrintedName(entry.cells[0] ?? "").id === id);
    const zh = zhTechRows.find((entry) => entry.cells[0] === tech.nameZh);
    expect(tech.ability).toBe(en?.cells[2]);
    expect(tech.abilityZh).toBe(zh?.cells[2]);
  });

  it.each(KILN_IDS)("Kiln %s: ability and abilityZh are the Kiln Tradition Abilities sections", (id) => {
    const kiln = KILNS[id];
    const paragraphs = (heading: string, source: string): string[] => section(heading, source).trim().split(/\n\s*\n/).map(clean);
    expect(kiln.ability).toBe(paragraphs(`### ${kiln.name} / ${kiln.nameZh} — ${kiln.abilityName}`, SOURCE).join(" "));
    expect(kiln.abilityZh).toBe(paragraphs(`### ${kiln.nameZh} · ${kiln.abilityNameZh}`, SOURCE_ZH).join(""));
  });

  it("the Chinese edition rewrote the same Tech abilities as the English (changes 22 and 28–31)", () => {
    const changed = TECH_IDS.filter((id) => {
      const now = zhTechRows.find((entry) => entry.cells[0] === TECHS[id].nameZh)?.cells[2];
      const then = zhTechRowsV161.find((entry) => entry.cells[0] === TECHS[id].nameZh)?.cells[2];
      return now !== then;
    });
    expect(new Set(changed)).toEqual(CHANGED_TECHS);
  });

  it("the Chinese edition defers to the English rulebook", () => {
    expect(SOURCE_ZH.split("\n")[0]).toContain("v1.6.2");
    expect(SOURCE_ZH).toContain("规则如有出入，以英文版规则书为准");
  });
});

// ── Short component text (docs/KILN_OPENING_v1.6.2_COMPONENT_TEXT.md, DELTA §3.3) ──────────

/** One component of the owner's V1.6.2 component text: the heading line `### Name / 中文名`
 * (Kilns: `### Ru Kiln / 汝窑 — Quiet Perfection / 天青无瑕`), then the English line and the
 * Chinese line, each with its timing clauses in bold. */
interface ComponentText {
  heading: string;
  en: string;
  zh: string;
}

function componentTexts(): ComponentText[] {
  const found: ComponentText[] = [];
  let heading: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (heading !== null) found.push({ heading, en: lines[0] ?? "", zh: lines[1] ?? "" });
  };
  for (const line of COMPONENT_TEXT.split("\n")) {
    if (line.startsWith("#")) {
      flush();
      heading = line.startsWith("### ") ? line.slice(4) : null;
      lines = [];
      continue;
    }
    if (heading !== null && line.trim() !== "") lines.push(line.trim());
  }
  flush();
  return found;
}

/** Fuel Ledger's 2 Contribution cards, which carry component text (v1.6.2 change 26). */
const LEDGER_CARD_IDS = ["FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"] as const;
/** Every component with short text: the 18 Techs, the 2 Fuel Ledger cards and the 5 Kilns. */
const SHORT_TEXT_IDS: readonly string[] = [...TECH_IDS, ...LEDGER_CARD_IDS, ...KILN_IDS];

/** The component of a Tech, a Fuel Ledger card or a Kiln, found by its heading. */
function componentHeading(id: string): string {
  if ((TECH_IDS as readonly string[]).includes(id)) {
    const tech = TECHS[id as TechId];
    return `${tech.name} / ${tech.nameZh}`;
  }
  if ((LEDGER_CARD_IDS as readonly string[]).includes(id)) {
    const card = contributionCard(id as (typeof LEDGER_CARD_IDS)[number]);
    return `${card.name} / ${card.nameZh}`;
  }
  const kiln = KILNS[id as keyof typeof KILNS];
  return `${kiln.name} / ${kiln.nameZh} — ${kiln.abilityName} / ${kiln.abilityNameZh}`;
}

/** The data definition holding a component's `shortText` / `shortTextZh`. */
function shortTextOf(id: string): { id: string; shortText: string; shortTextZh: string } {
  if ((TECH_IDS as readonly string[]).includes(id)) return TECHS[id as TechId];
  if ((LEDGER_CARD_IDS as readonly string[]).includes(id)) {
    const card = contributionCard(id as (typeof LEDGER_CARD_IDS)[number]);
    return { id, shortText: card.shortText ?? "", shortTextZh: card.shortTextZh ?? "" };
  }
  return KILNS[id as keyof typeof KILNS];
}

/** The owner's bold runs of one line, in order. */
function boldSpans(line: string): string[] {
  return [...line.matchAll(/\*\*(.+?)\*\*/g)].map((match) => match[1] ?? "");
}

/** `### Name / 名 (T01)` sections of the repository-format copy, with `- EN:` and `- ZH:` lines;
 * its Review notes have none. */
function componentTextSource(): Map<string, { heading: string; en?: string; zh?: string }> {
  const found = new Map<string, { heading: string; en?: string; zh?: string }>();
  let current: { heading: string; en?: string; zh?: string } | null = null;
  for (const line of COMPONENT_TEXT_SOURCE.split("\n")) {
    if (line.startsWith("## ")) current = null;
    const heading = /^### (.+) \(([A-Z]{2}|T\d{2}|FUEL_LEDGER_(?:BANK|STOKE))\)$/.exec(line);
    if (heading !== null) {
      current = { heading: heading[1] ?? "" };
      found.set(heading[2] ?? "", current);
      continue;
    }
    if (current === null) continue;
    if (line.startsWith("- EN: ")) current.en = line.slice(6);
    if (line.startsWith("- ZH: ")) current.zh = line.slice(6);
  }
  return found;
}

describe("short component text (the owner's V1.6.2 component text)", () => {
  const texts = componentTexts();
  const source = componentTextSource();

  it("covers exactly the 18 Techs, the 2 Fuel Ledger Contribution cards and the 5 Kilns", () => {
    expect(texts).toHaveLength(SHORT_TEXT_IDS.length);
    expect(texts.map((text) => text.heading).sort()).toEqual(SHORT_TEXT_IDS.map(componentHeading).sort());
    // The keyword line of the introduction (v1.6.2 change 25; owner ruling R25: the rest are
    // discarded) names no component.
    expect(COMPONENT_TEXT).toContain("Keyword **Select N:** look at the top N cards of the Main Order deck, reserve 1 of them or 1 face-up Main Order from the display; the rest are discarded.");
    expect(COMPONENT_TEXT).toContain("关键词**精选N：**查看主委托牌堆顶N张，承接其中1张或委托榜上1张，其余弃置。");
  });

  it("has a repository-format copy keyed by ID, line for line the owner's text with the bold removed", () => {
    expect([...source.keys()].sort()).toEqual([...SHORT_TEXT_IDS].sort());
    for (const [id, entry] of source) {
      expect(entry.heading, id).toBe(componentHeading(id));
      const owner = texts.find((text) => text.heading === entry.heading);
      expect(entry.en, id).toBe(owner?.en.replaceAll("**", ""));
      expect(entry.zh, id).toBe(owner?.zh.replaceAll("**", ""));
    }
    // The same order as the owner's file, and the same discipline groups.
    expect([...source.values()].map((entry) => entry.heading)).toEqual(texts.map((text) => text.heading));
    expect(COMPONENT_TEXT_SOURCE).toContain("(./KILN_OPENING_v1.6.2_COMPONENT_TEXT.md)");
    for (const label of SHORT_TEXT_SECONDARY_LABELS) expect(COMPONENT_TEXT_SOURCE, label).toContain(label);
  });

  it("changed from V1.6.1 only on the Techs and the Kiln V1.6.2 rewrote and the 2 new Fuel Ledger cards (changes 22–26, 28–31)", () => {
    const previous = readFileSync(join(ROOT, "docs/KILN_OPENING_v1.6.1_COMPONENT_TEXT_SOURCE.md"), "utf8");
    const changed = [...source.entries()].filter(([id, entry]) =>
      !previous.includes(`(${id})\n- EN: ${entry.en ?? ""}\n- ZH: ${entry.zh ?? ""}\n`)).map(([id]) => id);
    // Owner revision 4 rewrote Decorator's Kit, Prepared Clay, Test Pieces, Kiln Master and Ge
    // (component text lines 15/17, 25/27, 84/86, 94/96, 128/130); Second Firing's line is unchanged.
    expect(new Set(changed)).toEqual(new Set([...V162_TECHS, "T13", "T16", "T17", "T24", "GE", ...LEDGER_CARD_IDS]));
  });

  it.each(SHORT_TEXT_IDS)("%s: shortText and shortTextZh equal the owner's lines, bold removed", (id) => {
    const definition = shortTextOf(id);
    const entry = texts.find((text) => text.heading === componentHeading(id));
    expect(definition.shortText).toBe(entry?.en.replaceAll("**", ""));
    expect(definition.shortTextZh).toBe(entry?.zh.replaceAll("**", ""));
  });

  it.each(SHORT_TEXT_IDS)("%s: the UI emphasis reproduces the owner's bold timing clauses", (id) => {
    const definition = shortTextOf(id);
    const entry = texts.find((text) => text.heading === componentHeading(id));
    for (const [text, line] of [[definition.shortText, entry?.en ?? ""], [definition.shortTextZh, entry?.zh ?? ""]] as const) {
      const emphasised = shortTextSegments(text).filter((segment) => segment.emphasis).map((segment) => segment.text);
      expect(emphasised, `${id}: ${text}`).toEqual(boldSpans(line));
    }
  });

  it("is plain text whose timing clause and secondary labels the UI emphasises", () => {
    const emphasised = new Map<string, string[]>();
    for (const definition of SHORT_TEXT_IDS.map(shortTextOf)) {
      for (const text of [definition.shortText, definition.shortTextZh]) {
        expect(text, definition.id).not.toMatch(/[*_`#\n]|<br>/);
        const segments = shortTextSegments(text);
        expect(segments.map((segment) => segment.text).join(""), definition.id).toBe(text);
        expect(segments[0]?.emphasis && /[:：]$/.test(segments[0].text), `${definition.id}: timing clause`).toBe(true);
        const labels = segments.slice(1).filter((segment) => segment.emphasis).map((segment) => segment.text);
        if (labels.length > 0) emphasised.set(`${definition.id}:${text === definition.shortText ? "en" : "zh"}`, labels);
      }
    }
    expect(Object.fromEntries(emphasised)).toEqual({
      "T10:en": ["Ongoing:", "Once per round, before or after one of your worker actions:"],
      "T10:zh": ["持续：", "每轮一次，你的一次工人行动之前或之后："],
      "T11:en": ["Once per round, after Quality is assigned:"],
      "T11:zh": ["每轮一次，定品后："],
      // Owner revision 3 (change 26): Fuel Ledger's second clause is "When acquired:".
      "T12:en": ["When acquired:"],
      "T12:zh": ["习得时："],
      "GE:en": ["Orders:"],
      "GE:zh": ["完成委托时："],
    });
    // Exactly the owner's bold clauses after the first one of a line (DELTA §3.3).
    const secondary = new Set(texts.flatMap((text) => [...boldSpans(text.en).slice(1), ...boldSpans(text.zh).slice(1)]));
    expect(new Set(SHORT_TEXT_SECONDARY_LABELS)).toEqual(secondary);
    expect(shortTextSegments("Game end: score.")).toEqual([{ text: "Game end:", emphasis: true }, { text: " score.", emphasis: false }]);
  });
});

// ── Clarifications (owner decision D10, UI architecture K15) ─────────────────────────────

/** `### <key> — <name>` sections of `- [source] English / 中文` items; header and notes skipped. */
function clarificationsDoc(text = CLARIFICATIONS_DOC): Map<string, { heading: string; items: ClarificationDefinition[] }> {
  const found = new Map<string, { heading: string; items: ClarificationDefinition[] }>();
  let current: { heading: string; items: ClarificationDefinition[] } | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) current = null;
    const heading = /^### (\S+) — (.+)$/.exec(line);
    if (heading !== null) {
      current = { heading: heading[2] ?? "", items: [] };
      found.set(heading[1] ?? "", current);
      continue;
    }
    if (current === null || !line.startsWith("- ")) continue;
    const item = /^- \[([^\]]+)\] (.+)$/.exec(line);
    const halves = item?.[2]?.split(" / ") ?? [];
    if (item === null || halves.length !== 2) throw new Error(`Malformed clarification line: ${line}`);
    current.items.push({ en: halves[0] ?? "", zh: halves[1] ?? "", source: item[1] ?? "" });
  }
  return found;
}

/** Every component's clarifications from data, keyed like the doc sections. */
function dataClarifications(): Map<string, { heading: string; items: readonly ClarificationDefinition[] }> {
  const found = new Map<string, { heading: string; items: readonly ClarificationDefinition[] }>();
  for (const id of TECH_IDS) found.set(id, { heading: `${TECHS[id].name} / ${TECHS[id].nameZh}`, items: TECHS[id].clarifications });
  for (const id of KILN_IDS) {
    const kiln = KILNS[id];
    found.set(id, { heading: `${kiln.name}, ${kiln.abilityName} / ${kiln.nameZh} · ${kiln.abilityNameZh}`, items: kiln.clarifications });
  }
  for (const id of LOCATION_IDS) found.set(id, { heading: `${LOCATIONS[id].name} / ${LOCATIONS[id].nameZh}`, items: LOCATIONS[id].clarifications });
  for (const space of IMPERIAL_TRACK.track) {
    if (space.reward !== null) found.set(space.id, { heading: `${space.title} / ${space.titleZh}`, items: space.clarifications });
  }
  found.set("imperial_overflow", { heading: "Crowns beyond Recognition 4 / 声望满后每个御令+1分", items: IMPERIAL_TRACK.clarifications.imperial_overflow });
  found.set("orders.starting", { heading: "Starting Orders / 起始委托", items: ORDER_CLARIFICATIONS.starting });
  found.set("orders.main", { heading: "Main Orders and Crown Orders / 主委托与御令委托", items: ORDER_CLARIFICATIONS.main });
  return found;
}

/** The V1.6.2 audit section with this heading. */
const AUDIT_SECTION = (heading: string): string => section(heading, AUDIT);

/** Owner rulings the V1.6.2 audit marks obsolete or superseded: a clarification never cites them. */
const RETIRED_RULINGS: ReadonlySet<string> = new Set(
  tableRows(AUDIT_SECTION("## Owner rulings (re-checked against V1.6.2)"))
    .filter((cells) => /^(?:Obsolete|Superseded)\b/.test(cells[2] ?? ""))
    .map((cells) => cells[0] ?? ""),
);

/** Where a source tag points, or null when it points nowhere. */
function resolveTag(tag: string): string | null {
  const lines = SOURCE.split("\n");
  const line = /^(?:ED )?L(\d+)$/.exec(tag);
  if (line !== null && !tag.startsWith("ED ")) {
    const text = lines[Number(line[1]) - 1] ?? "";
    return text.trim() === "" ? null : text;
  }
  if (line !== null) {
    const editorial = AUDIT_SECTION("### Editorial corrections (no rule change)");
    return editorial.split("\n").find((entry) => entry.startsWith(`- Line ${line[1]}:`)) ?? null;
  }
  if (/^A\d+$/.test(tag)) return tableRows(AUDIT_SECTION("## Owner amendments (carried over)")).find((cells) => cells[0] === tag)?.join(" | ") ?? null;
  if (/^[RB]\d+$/.test(tag)) {
    return tableRows(AUDIT_SECTION("## Owner rulings (re-checked against V1.6.2)")).find((cells) => cells[0] === tag)?.join(" | ") ?? null;
  }
  if (/^P\d$/.test(tag)) {
    return AUDIT_SECTION("### Provisional defaults (edge cases the text leaves open; owner may overrule)").split("\n")
      .find((entry) => entry.startsWith(`- **${tag} —`)) ?? null;
  }
  if (/^D\d+$/.test(tag)) return tableRows(OWNER_DECISIONS).find((cells) => cells[0] === tag)?.join(" | ") ?? null;
  if (tag.startsWith("INT ")) {
    // The bold label of an "Interpretations of V1.6.2 text" bullet containing every word of the name.
    const words = tag.slice(4).toLowerCase().split(" ");
    return AUDIT_SECTION("### Interpretations of V1.6.2 text, recorded for implementers").split("\n")
      .filter((entry) => entry.startsWith("- **"))
      .find((entry) => {
        const label = (/^- \*\*([^*]+)\*\*/.exec(entry)?.[1] ?? "").toLowerCase();
        return words.every((word) => label.includes(word));
      }) ?? null;
  }
  return null;
}

/**
 * Clauses that start by quoting their cited rulebook line but deliberately adapt it, with the
 * reason. Any other clause that opens with six or more words of a cited line must match that
 * line exactly.
 */
const QUOTE_ADAPTATIONS: ReadonlyArray<readonly [string, string, string]> = [
  ["T12", "A ceramic in an Imperial Kiln gives no say over the shared fire", "L266 abridged"],
  ["JU", "Jun's adjustment applies on top of Kiln Master's marker", "rev. 4 L635's \"it\" named"],
  ["magistrates_hall", "You may place a worker only if you can perform at least 1 instance of the main action", "L144 \"that location's\" made specific"],
  ["orders.starting", "Starting Orders and reserved Main Orders both count toward your hand limit of 4", "L199 and L303 combined"],
  ["orders.main", "Starting Orders and reserved Main Orders both count toward your hand limit of 4", "L199 and L303 combined"],
];

/**
 * Wording of V1.6.1 mechanics that V1.6.2 removed (changes 21–24; AGENTS.md "Removed by
 * V1.6.2"): a clarification that still says one of these describes the old rules.
 */
const RETIRED_CLARIFICATION_WORDING: ReadonlyArray<readonly [RegExp, string]> = [
  [/blind|盲接/i, "blind reservation"],
  [/top-3 selection|看三取一/, "the Commission Market top-3 selection"],
  [/resource after each|每次承接后/, "a Commission Market resource"],
  [/1 Coin for \+1 Clay|1铜钱再得1泥1柴/, "the Materials Yard Shifu's 1-Coin option"],
  [/through Canal Barge|Canal Barge (?:completes|used)|通过漕船|漕船完成/, "Canal Barge completing Orders (R6)"],
  [/Flawed → Standard|瑕品→良品|瑕品升为良品/, "Protective Saggars' Flawed → Standard upgrade"],
  [/extra Fire card is revealed|另翻1张/, "a single extra Fire card for Second Firing"],
  // Change 24's "discard the rest" retirement is gone: owner ruling R25 discards them again.
  [/Coins? less, minimum 0|少付2铜钱/, "the Guild Hall Shifu discount"],
  // Owner revision 3 (changes 25–27): the swap Selects 3, Fuel Ledger brings cards, no Tech VP.
  [/looks at the top 2|2 for a swap|换单看2张|查看牌堆顶2张。如果/, "the Colour Samples swap's look of 2"],
  [/takes only from the deck|只从牌堆取牌|takes from the deck\)|取自牌堆，委托榜不补牌/, "Colour Samples taking from the deck only"],
  [/commit(?:s|ted)? (?:1 )?Wood|commitment|暗附|柴簿加柴|押下的柴/, "the Fuel Ledger commitment"],
  [/1 VP immediately when you gain|its 1 VP|own 1 VP|立即得1分。$|它的1分|自身的1分/, "Tech VP (owner amendment A1)"],
  // Owner revision 4 (changes 28–35) and owner ruling R25.
  [/Heat marker|Heat-marker|火标/, "the player Heat marker (changes 28, 31)"],
  [/salvage|折卖/i, "the firing-step salvage (change 30; a Flawed ceramic is sold, R20)"],
  [/Every Decoration costs|Decoration discount|每种纹饰都是2铜钱|纹饰减免/, "Decoration costs (change 30)"],
  [/never a Masterpiece|永远不是臻品|永远不算臻品|cannot fill a Masterpiece requirement|不能满足任何臻品要求/, "Ge's 'never a Masterpiece' clause (change 29)"],
  [/cannot both apply|不能作用于同一件器物/, "Saggars' step and Crackle never on one ceramic (change 29)"],
  [/6 resources|6份资源/, "the Materials Yard Shifu's 6 resources (change 34)"],
  [/bottom of the (?:Main Order )?deck, in random order|go(?:es)? face down to the bottom of the Main Order deck|put the rest of the N on the bottom|放到主委托牌堆底|其余的放到牌堆底|哪几张放到牌堆底/, "looked cards to the deck bottom (change 24, R19; reversed by R25)"],
];

const CLARIFICATIONS_DOC_V161 = readFileSync(join(ROOT, "docs/KILN_OPENING_v1.6.1_CLARIFICATIONS.md"), "utf8");

describe("clarifications (owner decision D10, K15)", () => {
  const doc = clarificationsDoc();
  const data = dataClarifications();
  const all = [...data.entries()].flatMap(([key, entry]) => entry.items.map((item) => ({ key, item })));

  it("every doc item appears in data, in order, and vice versa", () => {
    const fromDoc = Object.fromEntries([...doc.entries()].map(([key, entry]) => [key, entry.items]));
    const fromData = Object.fromEntries([...data.entries()].map(([key, entry]) => [key, entry.items]));
    expect(fromData).toEqual(fromDoc);
    // Pruned to the component-specific items (owner review, 2026-10-17): no general rules, no
    // interactions the component's owner can never meet. A component may have none. V1.6.2
    // (stage 4) carried 120 items over, rewrote 29 and added 21; 7 were retired. Owner revision 4
    // removed 12 items and added 9 (the doc's revision notes).
    expect(all).toHaveLength(167);
    expect(IMPERIAL_TRACK.track.filter((space) => space.clarifications.length === 0).map((space) => space.id)).toEqual(["local_workshop", "imperial_grant"]);
  });

  it("keys every doc section to the component it names", () => {
    for (const [key, entry] of doc) expect(entry.heading, key).toBe(data.get(key)?.heading);
  });

  it("gives every item a well-formed source whose tags point at a rulebook line or an audit entry", () => {
    const unresolved: string[] = [];
    for (const { key, item } of all) {
      for (const tag of clarificationTags(item.source)) {
        expect(CLARIFICATION_TAG.test(tag), `${key}: ${tag}`).toBe(true);
        expect(() => clarificationSourceKind(tag)).not.toThrow();
        if (resolveTag(tag) === null) unresolved.push(`${key}: ${tag}`);
      }
      // Inline line references such as "(L212)" must exist too.
      for (const match of item.en.matchAll(/\(L(\d+)\)/g)) {
        if (resolveTag(`L${match[1]}`) === null) unresolved.push(`${key}: inline L${match[1]}`);
      }
    }
    expect(unresolved).toEqual([]);
    expect(clarificationSourceKind("L375")).toBe("rulebook");
    expect(clarificationSourceKind("ED L16")).toBe("editorial");
    expect(clarificationSourceKind("INT Ge Crackle")).toBe("interpretation");
    expect(clarificationSourceKind("P1")).toBe("provisional");
    expect(clarificationSourceKind("D7")).toBe("wording");
    expect(clarificationSourceKind("A1")).toBe("amendment");
    expect(clarificationSourceKind("B3")).toBe("ruling");
    expect(clarificationSourceKind("R18")).toBe("ruling");
    expect(clarificationSourceKind("R19")).toBe("ruling");
    // Owner rulings R20–R25 (2026-10-23).
    expect(clarificationSourceKind("R25")).toBe("ruling");
    for (const bad of ["L0", "R26", "B4", "P4", "P5", "INT", "ED 649", "l375"]) expect(CLARIFICATION_TAG.test(bad), bad).toBe(false);
    expect(resolveTag("L9999")).toBeNull();
    expect(resolveTag("INT Imaginary ruling")).toBeNull();
    expect(resolveTag("ED L16")).toContain("It is superseded by change 21 (L31, L202), change 22 (L32, L622) and change 25 (L35).");
  });

  it("cites no owner ruling V1.6.2 made obsolete or superseded (R3, R6, R9, R14, R19)", () => {
    // Owner revision 4 made R9 obsolete (no Heat marker) and owner ruling R25 made R19 obsolete.
    expect([...RETIRED_RULINGS].sort()).toEqual(["R14", "R19", "R3", "R6", "R9"]);
    const cited = all.flatMap(({ key, item }) => clarificationTags(item.source).filter((tag) => RETIRED_RULINGS.has(tag)).map((tag) => `${key}: ${tag}`));
    expect(cited).toEqual([]);
  });

  it("names none of the mechanics V1.6.2 removed (changes 21–35, owner ruling R25)", () => {
    const offences = all.flatMap(({ key, item }) => RETIRED_CLARIFICATION_WORDING
      .filter(([pattern]) => pattern.test(item.en) || pattern.test(item.zh)).map(([, label]) => `${key}: ${label}`));
    expect(offences).toEqual([]);
  });

  /** The owner's plain-register edits of 2026-10-18 (Chinese line 304: 于 → 到), which the clarification quoting that line follows. */
  const OWNER_ZH_EDITS: ReadonlyArray<readonly [string, string]> = [["它们要在派工阶段于瓷牙行承接", "它们要在派工阶段到瓷牙行承接"]];
  const followsOwnerZhEdit = (before: string, now: string): boolean =>
    OWNER_ZH_EDITS.some(([from, to]) => before.includes(from) && before.replace(from, to) === now);

  it("re-cites every item carried over from V1.6.1 to the same rulebook text, or to the line V1.6.2 rewrote", () => {
    const previous = clarificationsDoc(CLARIFICATIONS_DOC_V161);
    const linesBefore = SOURCE_V161.split("\n").map(clean);
    const linesNow = SOURCE.split("\n").map(clean);
    const lineTags = (source: string): number[] => clarificationTags(source).filter((tag) => /^L\d+$/.test(tag)).map((tag) => Number(tag.slice(1)));
    const words = (text: string): Set<string> => new Set(text.toLowerCase().match(/[a-z']+/g) ?? []);
    let carried = 0;
    const problems: string[] = [];
    for (const [key, entry] of doc) {
      for (const item of entry.items) {
        const before = previous.get(key)?.items.find((candidate) => candidate.en === item.en);
        if (before === undefined) continue;
        carried += 1;
        // An unchanged English item keeps its Chinese (apart from the owner's own wording edits
        // of the rulebook line it quotes) and cites the same number of lines.
        if (before.zh !== item.zh && !followsOwnerZhEdit(before.zh, item.zh)) problems.push(`${key}: Chinese changed for "${item.en}"`);
        const [then, now] = [lineTags(before.source), lineTags(item.source)];
        if (then.length !== now.length) problems.push(`${key}: ${before.source} → ${item.source}`);
        then.forEach((line, index) => {
          const old = linesBefore[line - 1] ?? "";
          const cited = linesNow[(now[index] ?? 0) - 1] ?? "";
          if (old === cited) return;
          // A line V1.6.2 rewrote: the old text is gone, and the new line is its rewrite.
          const shared = [...words(old)].filter((word) => words(cited).has(word)).length / words(old).size;
          if (linesNow.includes(old) || shared < 0.5) problems.push(`${key}: L${line} → L${now[index]}`);
        });
      }
    }
    expect(problems).toEqual([]);
    // 120 under owner revision 2; revision 3 removed the 2 Tech VP items (A1) and rewrote Fuel
    // Ledger's commitment items (changes 26–27). Owner revision 4 removed or rewrote 27 of the
    // 116 (the Heat marker, the salvage, the Decoration costs, Ge, the fuel, Kiln Master).
    expect(carried).toBe(89);
  });

  it("quotes cited rulebook sentences exactly", () => {
    const lines = SOURCE.split("\n");
    const mismatches: string[] = [];
    const adaptationsUsed = new Set<string>();
    for (const { key, item } of all) {
      const cited = clarificationTags(item.source).filter((tag) => /^L\d+$/.test(tag))
        .map((tag) => clean(lines[Number(tag.slice(1)) - 1] ?? "")).join(" ");
      if (cited === "") continue;
      const clauses = item.en.replace(/ \(L\d+\)/g, "").split(/(?<=\.) |; |: |, so /)
        .map((clause) => clause.trim().replace(/\.$/, "")).filter((clause) => clause.split(" ").length >= 6);
      for (const clause of clauses) {
        if (!cited.includes(clause.split(" ").slice(0, 6).join(" ")) || cited.includes(clause)) continue;
        const adaptation = QUOTE_ADAPTATIONS.find(([adaptedKey, start]) => adaptedKey === key && clause.startsWith(start));
        if (adaptation === undefined) mismatches.push(`${key} [${item.source}]: ${clause}`);
        else adaptationsUsed.add(`${adaptation[0]}:${adaptation[1]}`);
      }
    }
    expect(mismatches).toEqual([]);
    // Every recorded adaptation is still needed.
    expect(adaptationsUsed.size).toBe(QUOTE_ADAPTATIONS.length);
  });

  it("never repeats a component's own full rule text", () => {
    for (const id of TECH_IDS) for (const item of TECHS[id].clarifications) expect(item.en, id).not.toBe(TECHS[id].ability);
    for (const id of KILN_IDS) for (const item of KILNS[id].clarifications) expect(item.en, id).not.toBe(KILNS[id].ability);
  });
});
