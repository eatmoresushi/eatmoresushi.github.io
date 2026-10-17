/**
 * Order card content for the printable sheets (tools/print/printOrderCards.ts).
 *
 * The printed text comes from the V1.6.2 rulebooks, the only mechanical source of truth:
 * - English: `docs/KILN_OPENING_v1.6.2_EN_SOURCE.md`, Appendix A (A0 Starting Orders,
 *   A1–A3 Main Orders);
 * - Chinese: `docs/KILN_OPENING_v1.6.2_ZH.md`, 附录A (same IDs).
 *
 * The expected IDs are read from the rulebooks themselves, not fixed here: the appendix heading
 * gives the two deck sizes ("8 Starting + 48 Main" / "8张起始委托 + 48张主委托") and each table's
 * heading its own count ("A0. Starting Order Deck — 8", "A2. Main Two-Ceramic Orders — 18"). The
 * tables must then list S01, S02, … and O01, O02, … in order, each table exactly as many rows
 * as its heading says, the table counts must add up to the deck sizes, both rulebooks must agree
 * and `data/orders.json` must hold exactly those IDs in that order. A Main table's heading also
 * names how many ceramics its Orders ask for (Single/Two/Three, 单件/两件/三件); every row must.
 *
 * Every row is cross-checked against `data/orders.json` (vp, coins, crowns, requirements,
 * requirementsZh, ceramics, relations, minQuality). Both requirement columns are also parsed
 * back into ceramics and relations, and the quality columns into minQuality and the
 * "at least n Masterpieces" relation, so a rulebook row and its data entry must say the same
 * thing in structure as well as in wording. Any difference throws `OrderSourceError` listing
 * every mismatch; nothing is printed from a source that disagrees with itself.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type Shape = "bowl" | "plate" | "washer" | "vase" | "censer";
export type Glaze = "white" | "celadon" | "grey_green" | "moon_white";
export type Decoration = "plain" | "carved" | "impressed" | "painted";
export type Quality = "standard" | "fine" | "masterpiece";
export type Lang = "en" | "zh";

export interface CeramicSlot {
  shape?: Shape;
  /** Any one of these Shapes ("Bowl, Plate or Brush Washer"). */
  shapes?: Shape[];
  glaze?: Glaze;
  decoration?: Decoration;
  /** Any one of these Decorations ("Carved, Impressed or Painted", S07). */
  decorations?: Decoration[];
}

export type Relation =
  | { type: "different_shape" | "all_different_shape" | "same_shape"; indices: number[] }
  | { type: "same_glaze" | "different_glaze" | "all_different_glaze"; indices: number[] }
  | { type: "same_decoration" | "different_decoration"; indices: number[] }
  | { type: "at_least_n_distinct_decorations"; indices: number[]; count: number }
  | { type: "required_glazes"; values: Glaze[] }
  | { type: "required_decorations"; values: Decoration[] }
  | { type: "at_least_n_quality"; quality: Quality; count: number };

export interface OrderData {
  id: string;
  deck: "starting" | "main";
  ceramics: CeramicSlot[];
  relations?: Relation[];
  minQuality: Quality;
  vp: number;
  coins: number;
  crowns: number;
  requirements: string;
  requirementsZh: string;
}

/** One printed card: the rulebook's strings for one language plus the checked data entry. */
export interface CardModel {
  id: string;
  kind: "starting" | "main";
  requirement: string;
  quality: string;
  vp: number;
  coins: number;
  crowns: number;
  data: OrderData;
}

/** Headings and labels for one language, read from the rulebook where it prints them. */
export interface SheetLabels {
  lang: Lang;
  requirement: string;
  quality: string;
  vp: string;
  startingKind: string;
}

export interface OrderSource {
  labels: Record<Lang, SheetLabels>;
  /** Print order: the Starting Orders, then the Main Orders, each in ID order. */
  cards: Record<Lang, CardModel[]>;
  /** Deck sizes as the rulebooks' Appendix A headings give them. */
  deckSizes: { starting: number; main: number };
  rulesVersionInData: string;
}

export class OrderSourceError extends Error {
  constructor(readonly problems: string[]) {
    super(`Order source check failed (${problems.length} problem${problems.length === 1 ? "" : "s"}):\n  - ${problems.join("\n  - ")}`);
    this.name = "OrderSourceError";
  }
}

export const APP_ROOT = resolve(import.meta.dirname, "../..");
export const EN_RULEBOOK = "docs/KILN_OPENING_v1.6.2_EN_SOURCE.md";
export const ZH_RULEBOOK = "docs/KILN_OPENING_v1.6.2_ZH.md";
export const ORDERS_JSON = "data/orders.json";

const SHAPES_EN: Record<string, Shape> = { Bowl: "bowl", Plate: "plate", "Brush Washer": "washer", Vase: "vase", Censer: "censer" };
const GLAZES_EN: Record<string, Glaze> = { White: "white", Celadon: "celadon", "Grey-Green": "grey_green", "Moon White": "moon_white" };
const DECORATIONS_EN: Record<string, Decoration> = { Plain: "plain", Carved: "carved", Impressed: "impressed", Painted: "painted" };
const SHAPES_ZH: Record<string, Shape> = { 碗: "bowl", 盘: "plate", 笔洗: "washer", 瓶: "vase", 香炉: "censer" };
const GLAZES_ZH: Record<string, Glaze> = { 白釉: "white", 青釉: "celadon", 灰青釉: "grey_green", 月白釉: "moon_white" };
const DECORATIONS_ZH: Record<string, Decoration> = { 素面: "plain", 刻花: "carved", 印花: "impressed", 画花: "painted" };

interface TableRow {
  id: string;
  requirement: string;
  quality: string;
  vp: number;
  coins: number;
  crowns: number;
  /** Header cells of the table the row came from. */
  header: string[];
  line: number;
}

/** A parse that records problems instead of stopping at the first one. */
class Problems {
  readonly list: string[] = [];
  add(message: string): void {
    this.list.push(message);
  }
}

function readText(relative: string): string {
  return readFileSync(resolve(APP_ROOT, relative), "utf8");
}

function cells(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  return trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
}

function parseCount(text: string, what: string, where: string, problems: Problems): number {
  if (text === "—") return 0;
  if (!/^\d+$/.test(text)) {
    problems.add(`${where}: ${what} "${text}" is not a whole number or "—"`);
    return Number.NaN;
  }
  return Number(text);
}

/** One Appendix A table: its heading and the Order rows under it. */
interface Section {
  heading: string;
  line: number;
  kind: "starting" | "main";
  /** The number of Orders the heading gives. */
  count: number;
  /** The number of ceramics each Order asks for, when the heading names it (Main tables). */
  ceramics: number | null;
  rows: TableRow[];
}

/** One rulebook's Appendix A: the deck sizes in its heading and its tables. */
interface Appendix {
  file: string;
  sizes: { starting: number; main: number } | null;
  sections: Section[];
}

/** How each rulebook titles Appendix A and its tables. */
interface AppendixGrammar {
  start: RegExp;
  end: RegExp;
  /** The appendix heading; groups: Starting count, Main count. */
  sizes: RegExp;
  /** A table heading; groups: table number, title, count. */
  section: RegExp;
  starting: RegExp;
  main: RegExp;
  /** Words in a Main table's title naming its ceramics per Order. */
  ceramics: Record<string, number>;
}

const EN_GRAMMAR: AppendixGrammar = {
  start: /^## Appendix A\b/,
  end: /^## Appendix B\b/,
  sizes: /^## Appendix A — Order Decks: (\d+) Starting \+ (\d+) Main$/,
  section: /^### A(\d+)\. (.+?) — (\d+)$/,
  starting: /^Starting Order Deck$/,
  main: /^Main (\w+)-Ceramic Orders$/,
  ceramics: { Single: 1, Two: 2, Three: 3 },
};

const ZH_GRAMMAR: AppendixGrammar = {
  start: /^## 附录A/,
  end: /^## 附录B/,
  sizes: /^## 附录A——委托牌堆：(\d+)张起始委托 \+ (\d+)张主委托$/,
  section: /^### A(\d+)\. (.+?)——(\d+)张$/,
  starting: /^起始委托牌堆$/,
  main: /^主委托：(.)件委托$/,
  ceramics: { 单: 1, 两: 2, 三: 3 },
};

/**
 * One rulebook's Appendix A, between its heading and the next appendix: the deck sizes from the
 * appendix heading and every table (an `### A<n>.` heading with its count) with its rows.
 * Starting tables have 5 columns (no Crowns); Main tables 6.
 */
function readAppendix(file: string, text: string, grammar: AppendixGrammar, problems: Problems): Appendix {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => grammar.start.test(line));
  if (start < 0) {
    problems.add(`${file}: Appendix A heading not found`);
    return { file, sizes: null, sections: [] };
  }
  const endOffset = lines.slice(start + 1).findIndex((line) => grammar.end.test(line));
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset;
  const sizesMatch = grammar.sizes.exec(lines[start] ?? "");
  if (sizesMatch === null) problems.add(`${file}:${start + 1}: Appendix A heading "${lines[start]}" does not give the two deck sizes`);
  const sizes = sizesMatch === null ? null : { starting: Number(sizesMatch[1]), main: Number(sizesMatch[2]) };

  const sections: Section[] = [];
  let section: Section | null = null;
  let header: string[] = [];
  for (let index = start + 1; index < end; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("### ")) {
      const match = grammar.section.exec(line);
      const title = match?.[2] ?? "";
      const main = grammar.main.exec(title);
      const kind = grammar.starting.test(title) ? "starting" : main !== null ? "main" : null;
      if (match === null || kind === null) {
        problems.add(`${file}:${index + 1}: Appendix A table heading "${line}" is not a Starting or Main Order table with a count`);
        section = null;
        continue;
      }
      const ceramics = main === null ? null : (grammar.ceramics[main[1] ?? ""] ?? null);
      if (main !== null && ceramics === null) problems.add(`${file}:${index + 1}: "${line}" names an unknown number of ceramics`);
      section = { heading: line.slice(4), line: index + 1, kind, count: Number(match[3]), ceramics, rows: [] };
      sections.push(section);
      header = [];
      continue;
    }
    const row = cells(line);
    if (row.length === 0) continue;
    if (row[0] === "ID") {
      header = row;
      continue;
    }
    if (!/^[A-Z]\d+$/.test(row[0] ?? "")) continue;
    const where = `${file}:${index + 1} (${row[0]})`;
    if (section === null) {
      problems.add(`${where}: an Order row outside any Appendix A table`);
      continue;
    }
    if (row.length !== header.length || (row.length !== 5 && row.length !== 6)) {
      problems.add(`${where}: ${row.length} cells, header has ${header.length}`);
      continue;
    }
    const [id, requirement, quality, vp, coins, crowns] = row as [string, string, string, string, string, string?];
    section.rows.push({
      id,
      requirement,
      quality,
      vp: parseCount(vp, "VP", where, problems),
      coins: parseCount(coins, "Coins", where, problems),
      crowns: crowns === undefined ? 0 : parseCount(crowns, "Crowns", where, problems),
      header,
      line: index + 1,
    });
  }
  return { file, sizes, sections };
}

/** "S01", "O17": the deck letter and a two-digit number. */
function orderId(kind: "starting" | "main", number: number): string {
  return `${kind === "starting" ? "S" : "O"}${String(number).padStart(2, "0")}`;
}

function idRange(kind: "starting" | "main", from: number, to: number): string {
  return to < from ? "none" : from === to ? orderId(kind, from) : `${orderId(kind, from)}–${orderId(kind, to)}`;
}

/**
 * The IDs the appendix's own headings call for, checked against its tables: the Starting
 * tables come first, then the Main tables; each table lists, in order, as many Orders as its
 * heading gives, numbered on from the table before it; the tables of each deck add up to the
 * deck size in the appendix heading. Returns the expected IDs (from the headings) and the rows.
 */
function expectedIds(appendix: Appendix, problems: Problems): { ids: string[]; rows: Array<{ row: TableRow; section: Section }> } {
  const ids: string[] = [];
  const rows: Array<{ row: TableRow; section: Section }> = [];
  const next = { starting: 1, main: 1 };
  let seenMain = false;
  for (const section of appendix.sections) {
    const where = `${appendix.file}:${section.line} ("${section.heading}")`;
    if (section.kind === "main") seenMain = true;
    else if (seenMain) problems.add(`${where}: a Starting Order table after a Main Order table`);
    const first = next[section.kind];
    const want = Array.from({ length: section.count }, (_, index) => orderId(section.kind, first + index));
    next[section.kind] += section.count;
    const got = section.rows.map((row) => row.id);
    if (canonical(got) !== canonical(want)) {
      problems.add(`${where}: the table lists [${got.join(", ")}], its heading calls for ${section.count} Orders, ${idRange(section.kind, first, first + section.count - 1)}`);
    }
    ids.push(...want);
    rows.push(...section.rows.map((row) => ({ row, section })));
  }
  const totals = { starting: next.starting - 1, main: next.main - 1 };
  if (appendix.sizes !== null) {
    for (const kind of ["starting", "main"] as const) {
      if (totals[kind] !== appendix.sizes[kind]) {
        problems.add(`${appendix.file}: the ${kind === "starting" ? "Starting" : "Main"} tables count ${totals[kind]} Orders, the Appendix A heading ${appendix.sizes[kind]}`);
      }
    }
  }
  if (totals.starting === 0) problems.add(`${appendix.file}: Appendix A has no Starting Order table`);
  if (totals.main === 0) problems.add(`${appendix.file}: Appendix A has no Main Order table`);
  return { ids, rows };
}

/** The IDs as runs in their order: "S01–S08 then O01–O48". */
function describeIds(ids: string[]): string {
  const runs: Array<{ first: string; last: string; letter: string; number: number }> = [];
  for (const id of ids) {
    const letter = id.slice(0, 1);
    const number = Number(id.slice(1));
    const run = runs.at(-1);
    if (run !== undefined && run.letter === letter && run.number + 1 === number) {
      run.last = id;
      run.number = number;
    } else runs.push({ first: id, last: id, letter, number });
  }
  return runs.length === 0 ? "no Orders" : runs.map((run) => (run.first === run.last ? run.first : `${run.first}–${run.last}`)).join(" then ");
}

// ---------------------------------------------------------------------------------------------
// Requirement and quality parsing (both languages) into the data model's ceramics and relations.

interface Parsed {
  ceramics: CeramicSlot[];
  relations: Relation[];
  minQuality: Quality | null;
}

function lookup<T>(table: Record<string, T>, key: string, what: string, where: string, problems: Problems): T | undefined {
  const value = table[key];
  if (value === undefined) problems.add(`${where}: unknown ${what} "${key}"`);
  return value;
}

function indices(n: number): number[] {
  return Array.from({ length: n }, (_, index) => index);
}

function parseEnglish(row: TableRow, where: string, problems: Problems): Parsed {
  const text = row.requirement;
  const relations: Relation[] = [];
  let ceramics: CeramicSlot[] = [];
  if (!text.includes("; ")) {
    const parts = text.split(" · ");
    if (parts.length !== 3) {
      problems.add(`${where}: single-ceramic requirement "${text}" does not have 3 parts`);
      return { ceramics, relations, minQuality: null };
    }
    const [shapePart, glazePart, decorationPart] = parts as [string, string, string];
    const slot: CeramicSlot = {};
    // "Bowl, Plate or Brush Washer", "Carved, Impressed or Painted": any one of these.
    const alternatives = <T>(part: string, table: Record<string, T>, what: string): T[] =>
      part
        .split(/, | or /)
        .map((name) => lookup(table, name, what, where, problems))
        .filter((value): value is T => value !== undefined);
    if (shapePart === "any Shape") {
      // no Shape requirement
    } else if (/ or /.test(shapePart)) {
      slot.shapes = alternatives(shapePart, SHAPES_EN, "Shape");
    } else {
      const shape = lookup(SHAPES_EN, shapePart, "Shape", where, problems);
      if (shape !== undefined) slot.shape = shape;
    }
    if (glazePart !== "any Glaze") {
      const glaze = lookup(GLAZES_EN, glazePart, "Glaze", where, problems);
      if (glaze !== undefined) slot.glaze = glaze;
    }
    if (decorationPart === "any Decoration") {
      // no Decoration requirement
    } else if (/ or /.test(decorationPart)) {
      slot.decorations = alternatives(decorationPart, DECORATIONS_EN, "Decoration");
    } else {
      const decoration = lookup(DECORATIONS_EN, decorationPart, "Decoration", where, problems);
      if (decoration !== undefined) slot.decoration = decoration;
    }
    ceramics = [slot];
  } else {
    const parts = text.split("; ");
    if (parts.length !== 3) {
      problems.add(`${where}: multi-ceramic requirement "${text}" does not have 3 parts`);
      return { ceramics, relations, minQuality: null };
    }
    const [shapePart, glazePart, decorationPart] = parts as [string, string, string];
    let match: RegExpExecArray | null;
    if ((match = /^(\d) different Shapes$/.exec(shapePart)) !== null) {
      const n = Number(match[1]);
      ceramics = indices(n).map(() => ({}));
      relations.push({ type: n === 2 ? "different_shape" : "all_different_shape", indices: indices(n) });
    } else if (shapePart === "2 ceramics of the same Shape") {
      ceramics = [{}, {}];
      relations.push({ type: "same_shape", indices: [0, 1] });
    } else {
      ceramics = shapePart.split(" + ").map((name) => {
        const shape = lookup(SHAPES_EN, name, "Shape", where, problems);
        return shape === undefined ? {} : { shape };
      });
    }
    const n = ceramics.length;
    const list = (body: string): string[] => body.split(", one ");
    if (glazePart === "any Glazes") {
      // no Glaze requirement
    } else if (glazePart === "same Glaze") {
      relations.push({ type: "same_glaze", indices: indices(n) });
    } else if (glazePart === "different Glazes") {
      relations.push({ type: "different_glaze", indices: indices(n) });
    } else if ((match = /^(\d) different Glazes$/.exec(glazePart)) !== null) {
      if (Number(match[1]) !== n) problems.add(`${where}: "${glazePart}" with ${n} ceramics`);
      relations.push({ type: "all_different_glaze", indices: indices(n) });
    } else if ((match = /^both (.+)$/.exec(glazePart)) !== null) {
      const glaze = lookup(GLAZES_EN, match[1] ?? "", "Glaze", where, problems);
      if (glaze !== undefined) relations.push({ type: "required_glazes", values: [glaze, glaze] });
    } else if ((match = /^one (.+)$/.exec(glazePart)) !== null) {
      const values = list(match[1] ?? "").map((name) => lookup(GLAZES_EN, name, "Glaze", where, problems));
      relations.push({ type: "required_glazes", values: values.filter((glaze): glaze is Glaze => glaze !== undefined) });
    } else {
      problems.add(`${where}: unrecognised Glaze part "${glazePart}"`);
    }
    if (decorationPart === "any Decorations") {
      // no Decoration requirement
    } else if (decorationPart === "same Decoration") {
      relations.push({ type: "same_decoration", indices: indices(n) });
    } else if (decorationPart === "different Decorations") {
      relations.push({ type: "different_decoration", indices: indices(n) });
    } else if ((match = /^(\d) different Decorations$/.exec(decorationPart)) !== null) {
      if (Number(match[1]) !== n) problems.add(`${where}: "${decorationPart}" with ${n} ceramics`);
      relations.push({ type: "different_decoration", indices: indices(n) });
    } else if ((match = /^at least (\d) different Decorations$/.exec(decorationPart)) !== null) {
      relations.push({ type: "at_least_n_distinct_decorations", indices: indices(n), count: Number(match[1]) });
    } else if ((match = /^at least one (\w+), other Decoration any$/.exec(decorationPart)) !== null) {
      const decoration = lookup(DECORATIONS_EN, match[1] ?? "", "Decoration", where, problems);
      if (decoration !== undefined) relations.push({ type: "required_decorations", values: [decoration] });
    } else if ((match = /^both (.+)$/.exec(decorationPart)) !== null) {
      const decoration = lookup(DECORATIONS_EN, match[1] ?? "", "Decoration", where, problems);
      if (decoration !== undefined) relations.push({ type: "required_decorations", values: [decoration, decoration] });
    } else if ((match = /^one (.+)$/.exec(decorationPart)) !== null) {
      const values = list(match[1] ?? "").map((name) => lookup(DECORATIONS_EN, name, "Decoration", where, problems));
      relations.push({ type: "required_decorations", values: values.filter((decoration): decoration is Decoration => decoration !== undefined) });
    } else {
      problems.add(`${where}: unrecognised Decoration part "${decorationPart}"`);
    }
  }
  const minQuality = parseEnglishQuality(row.quality, ceramics.length, relations, where, problems);
  return { ceramics, relations, minQuality };
}

function parseEnglishQuality(text: string, n: number, relations: Relation[], where: string, problems: Problems): Quality | null {
  if (text === "Masterpiece") {
    if (n !== 1) problems.add(`${where}: bare "Masterpiece" on a ${n}-ceramic Order`);
    return "masterpiece";
  }
  const match = /^(Standard|Fine)\+(?: (each|all))?(?:; ≥(\d) (Masterpieces?))?$/.exec(text);
  if (match === null) {
    problems.add(`${where}: unrecognised Quality "${text}"`);
    return null;
  }
  const scope = match[2];
  const expectedScope = n === 1 ? undefined : n === 2 ? "each" : "all";
  if (scope !== expectedScope) problems.add(`${where}: Quality "${text}" on a ${n}-ceramic Order (expected ${expectedScope ?? "no"} scope word)`);
  if (match[3] !== undefined) {
    const count = Number(match[3]);
    if ((count === 1) !== (match[4] === "Masterpiece")) problems.add(`${where}: Quality "${text}" plural mismatch`);
    relations.push({ type: "at_least_n_quality", quality: "masterpiece", count });
  }
  return match[1] === "Standard" ? "standard" : "fine";
}

function parseChinese(row: TableRow, where: string, problems: Problems): Parsed {
  const text = row.requirement;
  const relations: Relation[] = [];
  let ceramics: CeramicSlot[] = [];
  if (!text.includes("；")) {
    const parts = text.split(" · ");
    if (parts.length !== 3) {
      problems.add(`${where}: single-ceramic requirement "${text}" does not have 3 parts`);
      return { ceramics, relations, minQuality: null };
    }
    const [shapePart, glazePart, decorationPart] = parts as [string, string, string];
    const slot: CeramicSlot = {};
    if (shapePart === "任意器型") {
      // no Shape requirement
    } else if (shapePart.includes("或")) {
      slot.shapes = shapePart
        .split(/、|或/)
        .map((name) => lookup(SHAPES_ZH, name, "器型", where, problems))
        .filter((shape): shape is Shape => shape !== undefined);
    } else {
      const shape = lookup(SHAPES_ZH, shapePart, "器型", where, problems);
      if (shape !== undefined) slot.shape = shape;
    }
    if (glazePart !== "任意釉") {
      const glaze = lookup(GLAZES_ZH, glazePart, "釉", where, problems);
      if (glaze !== undefined) slot.glaze = glaze;
    }
    if (decorationPart === "任意纹饰") {
      // no Decoration requirement
    } else if (decorationPart.includes("或")) {
      // "刻花、印花或画花": any one of these.
      slot.decorations = decorationPart
        .split(/、|或/)
        .map((name) => lookup(DECORATIONS_ZH, name, "纹饰", where, problems))
        .filter((decoration): decoration is Decoration => decoration !== undefined);
    } else {
      const decoration = lookup(DECORATIONS_ZH, decorationPart, "纹饰", where, problems);
      if (decoration !== undefined) slot.decoration = decoration;
    }
    ceramics = [slot];
  } else {
    const parts = text.split("；");
    if (parts.length !== 3) {
      problems.add(`${where}: multi-ceramic requirement "${text}" does not have 3 parts`);
      return { ceramics, relations, minQuality: null };
    }
    const [shapePart, glazePart, decorationPart] = parts as [string, string, string];
    let match: RegExpExecArray | null;
    if ((match = /^(\d)种不同器型$/.exec(shapePart)) !== null) {
      const n = Number(match[1]);
      ceramics = indices(n).map(() => ({}));
      relations.push({ type: n === 2 ? "different_shape" : "all_different_shape", indices: indices(n) });
    } else if (shapePart === "2件同器型") {
      ceramics = [{}, {}];
      relations.push({ type: "same_shape", indices: [0, 1] });
    } else {
      ceramics = shapePart.split(" + ").map((name) => {
        const shape = lookup(SHAPES_ZH, name, "器型", where, problems);
        return shape === undefined ? {} : { shape };
      });
    }
    const n = ceramics.length;
    if (glazePart === "任意釉") {
      // no Glaze requirement
    } else if (glazePart === "釉相同") {
      relations.push({ type: "same_glaze", indices: indices(n) });
    } else if (glazePart === "釉不同") {
      relations.push({ type: "different_glaze", indices: indices(n) });
    } else if ((match = /^(\d)种不同釉$/.exec(glazePart)) !== null) {
      if (Number(match[1]) !== n) problems.add(`${where}: "${glazePart}" with ${n} ceramics`);
      relations.push({ type: "all_different_glaze", indices: indices(n) });
    } else if ((match = /^均为(.+)$/.exec(glazePart)) !== null) {
      const glaze = lookup(GLAZES_ZH, match[1] ?? "", "釉", where, problems);
      if (glaze !== undefined) relations.push({ type: "required_glazes", values: [glaze, glaze] });
    } else if ((match = /^(.+)各1件$/.exec(glazePart)) !== null) {
      const values = (match[1] ?? "").split("、").map((name) => lookup(GLAZES_ZH, name, "釉", where, problems));
      relations.push({ type: "required_glazes", values: values.filter((glaze): glaze is Glaze => glaze !== undefined) });
    } else {
      problems.add(`${where}: unrecognised 釉 part "${glazePart}"`);
    }
    if (decorationPart === "任意纹饰") {
      // no Decoration requirement
    } else if (decorationPart === "纹饰相同") {
      relations.push({ type: "same_decoration", indices: indices(n) });
    } else if (decorationPart === "纹饰不同") {
      relations.push({ type: "different_decoration", indices: indices(n) });
    } else if ((match = /^(\d)种不同纹饰$/.exec(decorationPart)) !== null) {
      if (Number(match[1]) !== n) problems.add(`${where}: "${decorationPart}" with ${n} ceramics`);
      relations.push({ type: "different_decoration", indices: indices(n) });
    } else if ((match = /^至少(\d)种不同纹饰$/.exec(decorationPart)) !== null) {
      relations.push({ type: "at_least_n_distinct_decorations", indices: indices(n), count: Number(match[1]) });
    } else if ((match = /^至少1件(.+)，另1件纹饰任意$/.exec(decorationPart)) !== null) {
      const decoration = lookup(DECORATIONS_ZH, match[1] ?? "", "纹饰", where, problems);
      if (decoration !== undefined) relations.push({ type: "required_decorations", values: [decoration] });
    } else if ((match = /^均为(.+)$/.exec(decorationPart)) !== null) {
      const decoration = lookup(DECORATIONS_ZH, match[1] ?? "", "纹饰", where, problems);
      if (decoration !== undefined) relations.push({ type: "required_decorations", values: [decoration, decoration] });
    } else if ((match = /^(.+)各1件$/.exec(decorationPart)) !== null) {
      const values = (match[1] ?? "").split("、").map((name) => lookup(DECORATIONS_ZH, name, "纹饰", where, problems));
      relations.push({ type: "required_decorations", values: values.filter((decoration): decoration is Decoration => decoration !== undefined) });
    } else {
      problems.add(`${where}: unrecognised 纹饰 part "${decorationPart}"`);
    }
  }
  const minQuality = parseChineseQuality(row.quality, ceramics.length, relations, where, problems);
  return { ceramics, relations, minQuality };
}

function parseChineseQuality(text: string, n: number, relations: Relation[], where: string, problems: Problems): Quality | null {
  if (text === "臻品") {
    if (n !== 1) problems.add(`${where}: bare "臻品" on a ${n}-ceramic Order`);
    return "masterpiece";
  }
  const match = /^(均)?(良品|上品)以上(?:，至少(\d)件臻品)?$/.exec(text);
  if (match === null) {
    problems.add(`${where}: unrecognised 品质 "${text}"`);
    return null;
  }
  if ((match[1] === "均") !== n > 1) problems.add(`${where}: 品质 "${text}" on a ${n}-ceramic Order`);
  if (match[3] !== undefined) relations.push({ type: "at_least_n_quality", quality: "masterpiece", count: Number(match[3]) });
  return match[2] === "良品" ? "standard" : "fine";
}

// ---------------------------------------------------------------------------------------------
// Comparison helpers.

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameRelations(a: Relation[], b: Relation[]): boolean {
  const sort = (list: Relation[]): string[] => list.map(canonical).sort();
  return canonical(sort(a)) === canonical(sort(b));
}

/** The data file's two decks, Starting then Main, checked against the rulebooks' deck sizes. */
function loadOrders(text: string, sizes: { starting: number; main: number } | null, problems: Problems): { orders: OrderData[]; rulesVersion: string } {
  const raw = JSON.parse(text) as { rulesVersion?: unknown; starting?: unknown; main?: unknown };
  const starting = Array.isArray(raw.starting) ? (raw.starting as OrderData[]) : [];
  const main = Array.isArray(raw.main) ? (raw.main as OrderData[]) : [];
  if (sizes !== null) {
    if (starting.length !== sizes.starting) problems.add(`${ORDERS_JSON}: ${starting.length} Starting Orders, the rulebooks ${sizes.starting}`);
    if (main.length !== sizes.main) problems.add(`${ORDERS_JSON}: ${main.length} Main Orders, the rulebooks ${sizes.main}`);
  }
  return { orders: [...starting, ...main], rulesVersion: typeof raw.rulesVersion === "string" ? raw.rulesVersion : "?" };
}

function checkHeader(file: string, row: TableRow, kind: "starting" | "main", expected: string[], problems: Problems): void {
  const want = kind === "starting" ? expected.slice(0, 5) : expected;
  if (canonical(row.header) !== canonical(want)) {
    problems.add(`${file}:${row.line} (${row.id}): table header [${row.header.join(" | ")}], expected [${want.join(" | ")}]`);
  }
}

/** The three source files' contents (see `loadOrderSource`). */
export interface SourceTexts {
  en: string;
  zh: string;
  orders: string;
}

/**
 * Reads both rulebooks and the data file, checks them against each other and returns the
 * cards in print order (the Starting Orders, then the Main Orders, as the rulebooks list them)
 * for each language. Throws `OrderSourceError`.
 */
export function loadOrderSource(): OrderSource {
  return buildOrderSource({ en: readText(EN_RULEBOOK), zh: readText(ZH_RULEBOOK), orders: readText(ORDERS_JSON) });
}

/** `loadOrderSource` on given file contents (used to prove the checks fail loudly). */
export function buildOrderSource(texts: SourceTexts): OrderSource {
  const problems = new Problems();
  const enAppendix = readAppendix(EN_RULEBOOK, texts.en, EN_GRAMMAR, problems);
  const zhAppendix = readAppendix(ZH_RULEBOOK, texts.zh, ZH_GRAMMAR, problems);
  const enExpected = expectedIds(enAppendix, problems);
  const zhExpected = expectedIds(zhAppendix, problems);
  const enHeader = ["ID", "Requirements", "Quality", "VP", "Coins", "Crowns"];
  const zhHeader = ["ID", "要求", "品质", "分", "铜钱", "御令"];

  // The two rulebooks must call for the same decks, table by table.
  if (canonical(enAppendix.sizes) !== canonical(zhAppendix.sizes)) {
    problems.add(`Appendix A deck sizes differ: ${EN_RULEBOOK} ${canonical(enAppendix.sizes)}, ${ZH_RULEBOOK} ${canonical(zhAppendix.sizes)}`);
  }
  const tables = (appendix: Appendix): string => canonical(appendix.sections.map((section) => [section.kind, section.count, section.ceramics]));
  if (tables(enAppendix) !== tables(zhAppendix)) {
    problems.add(`Appendix A tables differ: ${EN_RULEBOOK} ${tables(enAppendix)}, ${ZH_RULEBOOK} ${tables(zhAppendix)} ([deck, count, ceramics per Order])`);
  }
  const expected = enExpected.ids;
  if (canonical(zhExpected.ids) !== canonical(expected)) problems.add(`${ZH_RULEBOOK}: its headings call for ${describeIds(zhExpected.ids)}, ${EN_RULEBOOK} for ${describeIds(expected)}`);
  for (const [file, rows, header] of [[EN_RULEBOOK, enExpected.rows, enHeader], [ZH_RULEBOOK, zhExpected.rows, zhHeader]] as const) {
    for (const { row, section } of rows) checkHeader(file, row, section.kind, header, problems);
  }

  const { orders, rulesVersion } = loadOrders(texts.orders, enAppendix.sizes, problems);
  const dataIds = orders.map((order) => order.id);
  if (canonical(dataIds) !== canonical(expected)) problems.add(`${ORDERS_JSON}: IDs are [${dataIds.join(", ")}], the rulebooks call for ${describeIds(expected)}`);

  const byId = new Map(orders.map((order) => [order.id, order]));
  const zhById = new Map(zhExpected.rows.map(({ row }) => [row.id, row]));
  const cards: Record<Lang, CardModel[]> = { en: [], zh: [] };
  for (const { row: en, section } of enExpected.rows) {
    const data = byId.get(en.id);
    const zh = zhById.get(en.id);
    if (data === undefined || zh === undefined) {
      problems.add(`${en.id}: missing from ${data === undefined ? ORDERS_JSON : ZH_RULEBOOK}`);
      continue;
    }
    const kind = section.kind;
    if (data.deck !== kind) problems.add(`${en.id}: ${ORDERS_JSON} deck "${data.deck}", expected "${kind}"`);
    if (section.ceramics !== null && data.ceramics.length !== section.ceramics) {
      problems.add(`${en.id}: ${ORDERS_JSON} asks for ${data.ceramics.length} ceramics, its table "${section.heading}" ${section.ceramics}`);
    }
    for (const [label, row] of [["EN", en], ["ZH", zh]] as const) {
      for (const field of ["vp", "coins", "crowns"] as const) {
        if (row[field] !== data[field]) problems.add(`${en.id}: ${label} rulebook ${field} ${row[field]} ≠ ${ORDERS_JSON} ${field} ${data[field]}`);
      }
    }
    if (kind === "starting" && data.crowns !== 0) problems.add(`${en.id}: a Starting Order with ${data.crowns} Crowns`);
    if (en.requirement !== data.requirements) problems.add(`${en.id}: EN requirement "${en.requirement}" ≠ ${ORDERS_JSON} requirements "${data.requirements}"`);
    if (zh.requirement !== data.requirementsZh) problems.add(`${en.id}: ZH requirement "${zh.requirement}" ≠ ${ORDERS_JSON} requirementsZh "${data.requirementsZh}"`);

    const parsedEn = parseEnglish(en, `${EN_RULEBOOK}:${en.line} (${en.id})`, problems);
    const parsedZh = parseChinese(zh, `${ZH_RULEBOOK}:${zh.line} (${zh.id})`, problems);
    const dataRelations = data.relations ?? [];
    for (const [label, parsed] of [["EN", parsedEn], ["ZH", parsedZh]] as const) {
      if (canonical(parsed.ceramics) !== canonical(data.ceramics)) {
        problems.add(`${en.id}: ${label} requirement reads as ceramics ${canonical(parsed.ceramics)}, ${ORDERS_JSON} has ${canonical(data.ceramics)}`);
      }
      if (!sameRelations(parsed.relations, dataRelations)) {
        problems.add(`${en.id}: ${label} requirement/quality reads as relations ${canonical(parsed.relations)}, ${ORDERS_JSON} has ${canonical(dataRelations)}`);
      }
      if (parsed.minQuality !== data.minQuality) {
        problems.add(`${en.id}: ${label} quality reads as minQuality ${parsed.minQuality}, ${ORDERS_JSON} has ${data.minQuality}`);
      }
    }
    cards.en.push({ id: en.id, kind, requirement: en.requirement, quality: en.quality, vp: en.vp, coins: en.coins, crowns: en.crowns, data });
    cards.zh.push({ id: zh.id, kind, requirement: zh.requirement, quality: zh.quality, vp: zh.vp, coins: zh.coins, crowns: zh.crowns, data });
  }

  const zhKind = zhStartingTerm(texts.zh, problems);
  if (problems.list.length > 0 || enAppendix.sizes === null) throw new OrderSourceError(problems.list);
  return {
    labels: {
      en: { lang: "en", requirement: "Requirement", quality: "Quality", vp: "VP", startingKind: "Starting" },
      zh: { lang: "zh", requirement: zhHeader[1] ?? "", quality: zhHeader[2] ?? "", vp: zhHeader[3] ?? "", startingKind: zhKind },
    },
    cards,
    deckSizes: enAppendix.sizes,
    rulesVersionInData: rulesVersion,
  };
}

/** The Chinese rulebook's term for a Starting Order, as its A0 heading prints it. */
function zhStartingTerm(zh: string, problems: Problems): string {
  const term = "起始委托";
  if (!zh.includes(`### A0. ${term}牌堆`)) problems.add(`${ZH_RULEBOOK}: A0 heading does not name "${term}"`);
  return term;
}
