/**
 * Pure Order matcher incl. Crackle wildcards (L406–423; rev. 4 L465, L480; DESIGN §6.6). It runs only in
 * the Order Phase, the one place Orders are completed (v1.6.2 L296, L484; R6 is obsolete).
 *
 * - A selection must hold exactly one ceramic per Order slot (L423 "exactly one Bowl and one
 *   Brush Washer"). Slots are filled by permutation; each slot's `shape`/`shapes`/`glaze`/
 *   `decoration`/`decorations` must match the ceramic assigned to it (`shapes` and
 *   `decorations` are "any one of", S05, S06, S07, O14, O15).
 * - Every ceramic must be Finished, never Flawed (L279), and at least `minQuality`.
 * - Relations are evaluated over the whole selection and are independent unless a pairing
 *   is printed (L423). `different_*` is pairwise (O45/O47 "3 different" = all different);
 *   `at_least_n_distinct_decorations` is "at least N different" (O48); `required_*` is
 *   multiset inclusion (O31 "at least one Plain"); `at_least_n_quality` counts ceramics of at
 *   least that Quality (≥N Masterpiece).
 * - **Crackle wildcard** (rev. 4 L465, INT: Ge Crackle). A Crackle ceramic may count as any one
 *   Decoration for this Order's Decoration requirements (slot `decoration`, slot
 *   `decorations` such as S07's "Carved, Impressed or Painted", and every Decoration
 *   relation). It never changes Glaze, Shape or Quality; a Crackle ceramic is Fine (rev. 4
 *   L463), so it fails a Masterpiece requirement like any Fine ceramic (change 29 dropped the
 *   separate "never a Masterpiece" clause). Its printed Decoration is unchanged (Ru, Exhibition).
 *   - `declared` absent: deterministic search. Crackle ceramics in ceramic-sequence order,
 *     Decorations in `DECORATIONS` order (the first Crackle ceramic varies slowest); the first
 *     combination that satisfies the Order is recorded, one declaration per selected Crackle
 *     ceramic. At most 4^3 × 3! evaluations.
 *   - `declared` present (possibly `[]`): used exactly, never searched or completed. An
 *     undeclared Crackle ceramic counts with its printed Decoration. A malformed declaration
 *     (not a selected Crackle ceramic, or a ceramic declared twice) never matches.
 *
 * Layer 2: imports only layer 0–1 (`types`, `content`, `errors`). Ceramic-sequence ordering is
 * therefore computed locally (same `c<n>` convention as `state.ceramicSequence`).
 */

import { DECORATIONS, KILNS, QUALITY_RANK } from "../content.ts";
import { invariant } from "../errors.ts";
import type {
  CeramicId,
  CrackleDeclaration,
  Decoration,
  FinishedCeramic,
  Glaze,
  OrderDefinition,
  OrderRelationDefinition,
  OrderSlotDefinition,
  Shape,
} from "../types.ts";

/** One way a set of ceramics satisfies an Order, with the Crackle declarations used. */
export interface OrderMatch {
  /** The selected ceramics, in the order they were given to `matchOrder`. */
  ceramicIds: CeramicId[];
  /** Search mode: one per selected Crackle ceramic, in sequence order. Declared mode: as given. */
  crackleDeclarations: CrackleDeclaration[];
}

/** Why a selection fails an Order; the codes are `REASON_TEXT` keys (`ruleErrorText.ts`). */
export type OrderMismatchReason =
  | "wrong_count"
  | "already_delivered"
  | "flawed"
  | "quality_too_low"
  | "masterpiece_required"
  | "shape_mismatch"
  | "glaze_mismatch"
  | "decoration_mismatch"
  | "relation_mismatch";

export interface OrderMismatch {
  reason: OrderMismatchReason;
  /** The ceramic at fault, when one ceramic alone explains the failure. */
  ceramicId: CeramicId | null;
  /** The slot at fault, for a single-slot Order. */
  slotIndex: number | null;
}

// ── Ordering ─────────────────────────────────────────────────────────────────────────

const CERAMIC_ID = /^c([1-9][0-9]*)$/;

/** `c12` → 12; anything else sorts after every well-formed ID. */
function sequenceOf(id: CeramicId): number {
  const match = CERAMIC_ID.exec(id);
  return match === null ? Number.MAX_SAFE_INTEGER : Number(match[1]);
}

function bySequence(a: { id: CeramicId }, b: { id: CeramicId }): number {
  const diff = sequenceOf(a.id) - sequenceOf(b.id);
  return diff !== 0 ? diff : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// ── Attributes ───────────────────────────────────────────────────────────────────────

const MASTERPIECE_RANK = QUALITY_RANK.masterpiece;

/**
 * Quality rank for Order purposes: the printed Quality. A Crackle ceramic is simply Fine (rev. 4
 * L39, L463; `FinishedQuality` types it so), so it never fills a Masterpiece requirement without
 * any separate rule (change 29 dropped "never a Masterpiece" as redundant).
 */
function orderRank(c: FinishedCeramic): number {
  return QUALITY_RANK[c.quality];
}

/** A ceramic can ever count for an Order: Finished, not Flawed, at least `minQuality`. */
function meetsQuality(order: OrderDefinition, c: FinishedCeramic): boolean {
  return c.stage === "finished" && c.quality !== "flawed" && orderRank(c) >= QUALITY_RANK[order.minQuality];
}

type Dimension = "shape" | "glaze" | "decoration" | "quality";
const ALL_DIMENSIONS: ReadonlySet<Dimension> = new Set<Dimension>(["shape", "glaze", "decoration", "quality"]);

function relationDimension(relation: OrderRelationDefinition): Dimension {
  switch (relation.type) {
    case "same_shape":
    case "different_shape":
    case "all_different_shape":
      return "shape";
    case "same_glaze":
    case "different_glaze":
    case "all_different_glaze":
    case "required_glazes":
      return "glaze";
    case "same_decoration":
    case "different_decoration":
    case "at_least_n_distinct_decorations":
    case "required_decorations":
      return "decoration";
    case "at_least_n_quality":
      return "quality";
  }
}

/** The Order has a Decoration requirement, so a Crackle declaration can matter (rev. 4 L465). */
function hasDecorationRequirement(order: OrderDefinition): boolean {
  return (
    order.ceramics.some((slot) => slot.decoration !== undefined || slot.decorations !== undefined) ||
    (order.relations ?? []).some((relation) => relationDimension(relation) === "decoration")
  );
}

/** One selected ceramic as the matcher sees it for one Decoration assignment. */
interface Candidate {
  ceramic: FinishedCeramic;
  shape: Shape;
  glaze: Glaze;
  /** Printed Decoration, or the Crackle declaration in force. */
  decoration: Decoration;
  rank: number;
}

function slotFits(slot: OrderSlotDefinition, c: Candidate, dims: ReadonlySet<Dimension>): boolean {
  if (dims.has("shape")) {
    if (slot.shape !== undefined && slot.shape !== c.shape) return false;
    if (slot.shapes !== undefined && !slot.shapes.includes(c.shape)) return false;
  }
  if (dims.has("glaze") && slot.glaze !== undefined && slot.glaze !== c.glaze) return false;
  if (dims.has("decoration")) {
    if (slot.decoration !== undefined && slot.decoration !== c.decoration) return false;
    if (slot.decorations !== undefined && !slot.decorations.includes(c.decoration)) return false;
  }
  return true;
}

function allSame<T>(values: readonly T[]): boolean {
  return values.every((value) => value === values[0]);
}

function pairwiseDifferent<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

/** Multiset inclusion: every required value is matched by a distinct selected value. */
function includesMultiset<T>(values: readonly T[], required: readonly T[]): boolean {
  const pool = [...values];
  for (const value of required) {
    const index = pool.indexOf(value);
    if (index < 0) return false;
    pool.splice(index, 1);
  }
  return true;
}

function relationHolds(relation: OrderRelationDefinition, slotted: readonly Candidate[]): boolean {
  const at = (indices: readonly number[]): Candidate[] =>
    indices.map((index) => {
      const candidate = slotted[index];
      invariant(candidate !== undefined, `Order relation index ${index} has no slot`);
      return candidate;
    });
  switch (relation.type) {
    case "same_shape":
      return allSame(at(relation.indices).map((c) => c.shape));
    case "different_shape":
    case "all_different_shape":
      return pairwiseDifferent(at(relation.indices).map((c) => c.shape));
    case "same_glaze":
      return allSame(at(relation.indices).map((c) => c.glaze));
    case "different_glaze":
    case "all_different_glaze":
      return pairwiseDifferent(at(relation.indices).map((c) => c.glaze));
    case "same_decoration":
      return allSame(at(relation.indices).map((c) => c.decoration));
    case "different_decoration":
      return pairwiseDifferent(at(relation.indices).map((c) => c.decoration));
    case "at_least_n_distinct_decorations":
      return new Set(at(relation.indices).map((c) => c.decoration)).size >= relation.count;
    case "required_glazes":
      return includesMultiset(slotted.map((c) => c.glaze), relation.values);
    case "required_decorations":
      return includesMultiset(slotted.map((c) => c.decoration), relation.values);
    case "at_least_n_quality": {
      const rank = QUALITY_RANK[relation.quality];
      return slotted.filter((c) => c.rank >= rank).length >= relation.count;
    }
  }
}

const PERMUTATIONS = new Map<number, number[][]>();

/** Every ordering of `0..n-1`, lexicographic; cached (Orders have at most 3 slots). */
function permutations(n: number): number[][] {
  const cached = PERMUTATIONS.get(n);
  if (cached !== undefined) return cached;
  const result: number[][] = [];
  const build = (prefix: number[], rest: number[]): void => {
    if (rest.length === 0) {
      result.push(prefix);
      return;
    }
    rest.forEach((value, index) => build([...prefix, value], [...rest.slice(0, index), ...rest.slice(index + 1)]));
  };
  build([], Array.from({ length: n }, (_, index) => index));
  PERMUTATIONS.set(n, result);
  return result;
}

/** Some assignment of candidates to slots satisfies every slot and relation of `dims`. */
function satisfiable(order: OrderDefinition, candidates: readonly Candidate[], dims: ReadonlySet<Dimension>): boolean {
  const relations = (order.relations ?? []).filter((relation) => dims.has(relationDimension(relation)));
  for (const permutation of permutations(candidates.length)) {
    const slotted = permutation.map((index) => candidates[index] as Candidate);
    const slotsFit = order.ceramics.every((slot, index) => slotFits(slot, slotted[index] as Candidate, dims));
    if (slotsFit && relations.every((relation) => relationHolds(relation, slotted))) {
      return true;
    }
  }
  return false;
}

function candidateOf(c: FinishedCeramic, decoration: Decoration): Candidate {
  return { ceramic: c, shape: c.shape, glaze: c.glaze, decoration, rank: orderRank(c) };
}

/**
 * Every Decoration assignment the matcher tries, as `Map<ceramicId, Decoration>` for the
 * selected Crackle ceramics. Declared mode: exactly one (the declarations). Search mode:
 * the Cartesian product in the fixed order, collapsed to its first entry when the Order has
 * no Decoration requirement (every entry is then equivalent).
 */
function* declarationAssignments(
  order: OrderDefinition,
  ceramics: readonly FinishedCeramic[],
  declared: readonly CrackleDeclaration[] | undefined,
): Generator<Map<CeramicId, Decoration>> {
  if (declared !== undefined) {
    yield new Map(declared.map((entry) => [entry.ceramicId, entry.decoration]));
    return;
  }
  const crackled = ceramics.filter((c) => c.crackle).sort(bySequence);
  if (crackled.length === 0) {
    yield new Map();
    return;
  }
  const values: readonly Decoration[] = hasDecorationRequirement(order) ? DECORATIONS : DECORATIONS.slice(0, 1);
  const total = values.length ** crackled.length;
  for (let n = 0; n < total; n += 1) {
    // The last Crackle ceramic is the least significant digit, so the first varies slowest.
    const digits: Decoration[] = [];
    let rest = n;
    for (let index = 0; index < crackled.length; index += 1) {
      digits.unshift(values[rest % values.length] as Decoration);
      rest = Math.floor(rest / values.length);
    }
    yield new Map(crackled.map((c, index) => [c.id, digits[index] as Decoration]));
  }
}

function candidatesFor(ceramics: readonly FinishedCeramic[], assignment: ReadonlyMap<CeramicId, Decoration>): Candidate[] {
  return ceramics.map((c) => candidateOf(c, assignment.get(c.id) ?? c.decoration));
}

/** Declared mode: each entry names a selected Crackle ceramic, each ceramic at most once. */
function declarationsWellFormed(ceramics: readonly FinishedCeramic[], declared: readonly CrackleDeclaration[]): boolean {
  const seen = new Set<CeramicId>();
  for (const entry of declared) {
    const target = ceramics.find((c) => c.id === entry.ceramicId);
    if (target === undefined || !target.crackle || seen.has(entry.ceramicId) || !DECORATIONS.includes(entry.decoration)) {
      return false;
    }
    seen.add(entry.ceramicId);
  }
  return true;
}

/** One distinct ceramic per slot (L423); shared by `matchOrder` and `explainOrderMismatch`. */
function selectionSizeOk(order: OrderDefinition, ceramics: readonly FinishedCeramic[]): boolean {
  return ceramics.length === order.ceramics.length && new Set(ceramics.map((c) => c.id)).size === ceramics.length;
}

// ── Public API ───────────────────────────────────────────────────────────────────────

/**
 * Does this exact selection complete `order`? Returns the match (with the Crackle
 * declarations that would be recorded) or null. See the module JSDoc for both declaration
 * modes. Pure: never mutates its inputs.
 */
export function matchOrder(
  order: OrderDefinition,
  ceramics: readonly FinishedCeramic[],
  declared?: readonly CrackleDeclaration[],
): OrderMatch | null {
  if (!selectionSizeOk(order, ceramics) || !ceramics.every((c) => meetsQuality(order, c))) {
    return null;
  }
  if (declared !== undefined && !declarationsWellFormed(ceramics, declared)) {
    return null;
  }
  for (const assignment of declarationAssignments(order, ceramics, declared)) {
    if (satisfiable(order, candidatesFor(ceramics, assignment), ALL_DIMENSIONS)) {
      const crackleDeclarations =
        declared !== undefined
          ? declared.map((entry) => ({ ceramicId: entry.ceramicId, decoration: entry.decoration }))
          : ceramics
              .filter((c) => c.crackle)
              .sort(bySequence)
              .map((c) => ({ ceramicId: c.id, decoration: assignment.get(c.id) as Decoration }));
      return { ceramicIds: ceramics.map((c) => c.id), crackleDeclarations };
    }
  }
  return null;
}

/** A ceramic could fill some slot of `order` on its own (Crackle: any Decoration). */
function couldFillASlot(order: OrderDefinition, c: FinishedCeramic): boolean {
  return order.ceramics.some(
    (slot) =>
      (slot.shape === undefined || slot.shape === c.shape) &&
      (slot.shapes === undefined || slot.shapes.includes(c.shape)) &&
      (slot.glaze === undefined || slot.glaze === c.glaze) &&
      (slot.decoration === undefined || c.crackle || slot.decoration === c.decoration) &&
      (slot.decorations === undefined || c.crackle || slot.decorations.includes(c.decoration)),
  );
}

/**
 * Every distinct ceramic group from `pool` that completes `order`, one match per group
 * (search mode), in a fixed order: groups are combinations of the eligible ceramics in
 * sequence order, enumerated lexicographically. `limit` stops early (default: all).
 * Non-Finished, Flawed and too-low ceramics in `pool` are ignored.
 */
export function findOrderMatches(order: OrderDefinition, pool: readonly FinishedCeramic[], limit?: number): OrderMatch[] {
  const max = limit ?? Number.POSITIVE_INFINITY;
  const matches: OrderMatch[] = [];
  if (max <= 0) return matches;
  const seen = new Set<CeramicId>();
  const eligible = [...pool]
    .sort(bySequence)
    .filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return meetsQuality(order, c) && couldFillASlot(order, c);
    });
  const size = order.ceramics.length;
  const chosen: FinishedCeramic[] = [];
  const walk = (start: number): boolean => {
    if (chosen.length === size) {
      const match = matchOrder(order, chosen);
      if (match !== null) {
        matches.push(match);
        if (matches.length >= max) return true;
      }
      return false;
    }
    for (let index = start; index <= eligible.length - (size - chosen.length); index += 1) {
      chosen.push(eligible[index] as FinishedCeramic);
      const done = walk(index + 1);
      chosen.pop();
      if (done) return true;
    }
    return false;
  };
  walk(0);
  return matches;
}

/**
 * Ru (L460): the delivered ceramics include an actual Masterpiece with Celadon Glaze and
 * Plain printed Decoration. A Crackle wildcard never counts (printed Decoration; and a
 * Crackle ceramic is Fine, rev. 4 L463).
 */
export function ruTriggers(ceramics: readonly FinishedCeramic[]): boolean {
  const ru = KILNS.RU.params;
  return ceramics.some((c) => !c.crackle && c.quality === ru.quality && c.glaze === ru.glaze && c.decoration === ru.decoration);
}

/**
 * Why a selection does not complete `order`, for `ORDER_REQUIREMENTS_NOT_MET` details and
 * the Order picker; null when `matchOrder` would succeed. Checks, in order: the ceramic
 * count; each ceramic's stage and Quality; then the Shape, Glaze, Decoration and Masterpiece
 * requirements one dimension at a time; a selection that passes each alone but not all
 * together is a `relation_mismatch`.
 */
export function explainOrderMismatch(
  order: OrderDefinition,
  ceramics: readonly FinishedCeramic[],
  declared?: readonly CrackleDeclaration[],
): OrderMismatch | null {
  if (matchOrder(order, ceramics, declared) !== null) return null;
  const single = order.ceramics.length === 1;
  const only = (c: FinishedCeramic | undefined): Pick<OrderMismatch, "ceramicId" | "slotIndex"> => ({
    ceramicId: single && c !== undefined ? c.id : null,
    slotIndex: single ? 0 : null,
  });
  if (!selectionSizeOk(order, ceramics)) {
    return { reason: "wrong_count", ceramicId: null, slotIndex: null };
  }
  for (const c of ceramics) {
    if ((c.stage as string) === "delivered") return { reason: "already_delivered", ceramicId: c.id, slotIndex: null };
    if (c.quality === "flawed") return { reason: "flawed", ceramicId: c.id, slotIndex: null };
    if (orderRank(c) < QUALITY_RANK[order.minQuality]) {
      const reason = order.minQuality !== "masterpiece" ? "quality_too_low" : "masterpiece_required";
      return { reason, ceramicId: c.id, slotIndex: null };
    }
  }
  const printed = ceramics.map((c) => candidateOf(c, c.decoration));
  if (!satisfiable(order, printed, new Set<Dimension>(["shape"]))) {
    return { reason: "shape_mismatch", ...only(ceramics[0]) };
  }
  if (!satisfiable(order, printed, new Set<Dimension>(["glaze"]))) {
    return { reason: "glaze_mismatch", ...only(ceramics[0]) };
  }
  const wellFormed = declared === undefined || declarationsWellFormed(ceramics, declared);
  const decorationOk =
    wellFormed &&
    [...declarationAssignments(order, ceramics, declared)].some((assignment) =>
      satisfiable(order, candidatesFor(ceramics, assignment), new Set<Dimension>(["decoration"])),
    );
  if (!decorationOk) {
    return { reason: "decoration_mismatch", ...only(ceramics[0]) };
  }
  const failing = (order.relations ?? []).find(
    (relation) => relation.type === "at_least_n_quality" && !relationHolds(relation, printed),
  );
  if (failing !== undefined && failing.type === "at_least_n_quality") {
    if (QUALITY_RANK[failing.quality] < MASTERPIECE_RANK) {
      return { reason: "quality_too_low", ceramicId: null, slotIndex: null };
    }
    return { reason: "masterpiece_required", ceramicId: null, slotIndex: null };
  }
  return { reason: "relation_mismatch", ceramicId: null, slotIndex: null };
}
