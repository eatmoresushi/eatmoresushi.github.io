/**
 * Untrusted-input shape check (DESIGN §2.5). The service runs `parseCommand` on every
 * command, `SUBMIT_CONTRIBUTION` included, before it branches on the type, so validators
 * may assume well-typed input.
 *
 * - Every `AuthoritativeCommand` variant has a parser; the `PARSERS` table type makes a
 *   missing one a compile error.
 * - Enumerations (Kilns, spaces, Shapes, Glazes, Decorations, disciplines, Tech and Order
 *   IDs) are checked against `content.ts`; numeric unions against their type's values.
 * - Unknown keys are rejected. An optional key whose value is `undefined` (possible only
 *   for in-process callers) is treated as absent, so the result is always JSON-safe.
 * - The result is a fresh object: nothing of the input object is aliased.
 * - Rule legality (costs, counts, duplicates, ownership) is not checked here.
 *
 * Every failure is `MALFORMED_ACTION` with `details.field` naming the offending path.
 *
 * Layer 2 (imports only `content.ts` and `errors.ts`).
 */

import {
  CONTRIBUTION_CARD_IDS,
  DECORATIONS,
  DISCIPLINES,
  GLAZES,
  KILN_IDS,
  KILN_SPACE_IDS,
  ORDER_IDS,
  SHAPES,
  TECH_IDS,
} from "./content.ts";
import { ruleError } from "./errors.ts";
import type {
  AuthoritativeCommand,
  CommissionPick,
  CrackleDeclaration,
  FormVesselSpec,
  GameRuleError,
  HeatMarkerValue,
  ImperialModifier,
  KilnFurnitureModifier,
  LoadSpec,
  OrderCompletionSpec,
} from "./types.ts";

// ── Numeric unions: type vocabulary rather than content ──────────────────────────────

const IMPERIAL_MODIFIERS = [-1, 0, 1] as const satisfies readonly ImperialModifier[];
const KILN_FURNITURE_MODIFIERS = [-1, 0, 1] as const satisfies readonly KilnFurnitureModifier[];
const HEAT_MARKER_VALUES = [1, -1] as const satisfies readonly HeatMarkerValue[];
/** Second Firing's 2 revealed cards (v1.6.2 L639). */
const SECOND_FIRING_CARD_INDEXES = [0, 1] as const;

/** Compile-time proof that each literal list names every member of its union. */
type Covers<Union, List extends readonly unknown[]> = [Exclude<Union, List[number]>] extends [never] ? true : never;
const _covers: [
  Covers<ImperialModifier, typeof IMPERIAL_MODIFIERS>,
  Covers<KilnFurnitureModifier, typeof KILN_FURNITURE_MODIFIERS>,
  Covers<HeatMarkerValue, typeof HEAT_MARKER_VALUES>,
] = [true, true, true];
void _covers;

/** Generous bound on any array in a command; real commands are far smaller. */
const MAX_ARRAY_LENGTH = 64;
const MAX_STRING_LENGTH = 200;
const CERAMIC_ID = /^c[1-9][0-9]*$/;
const WORKER_ID = /^.+:(?:shifu|apprentice:[1-9][0-9]*)$/;

// ── Reader primitives ────────────────────────────────────────────────────────────────

class Malformed extends Error {
  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super(`${field} ${reason}`);
  }
}

type Fields = { readonly [key: string]: unknown };

function path(parent: string, key: string | number): string {
  if (typeof key === "number") {
    return `${parent}[${key}]`;
  }
  return parent === "" ? key : `${parent}.${key}`;
}

function objectAt(value: unknown, field: string): Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Malformed(field || "command", "must be an object");
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Malformed(field || "command", "must be a plain object");
  }
  return value as Fields;
}

/** Rejects unknown keys and missing required keys (`undefined` counts as missing; `null` is
 * present, for the nullable fields `spaceId`, `adjustment`, `ceramicId` and `jun`). */
function shape(o: Fields, field: string, required: readonly string[], optional: readonly string[] = []): void {
  for (const key of Object.keys(o)) {
    if (!required.includes(key) && !optional.includes(key)) {
      throw new Malformed(path(field, key), "is not allowed");
    }
  }
  for (const key of required) {
    if (o[key] === undefined) {
      throw new Malformed(path(field, key), "is required");
    }
  }
}

function get(o: Fields, key: string): unknown {
  return Object.hasOwn(o, key) ? o[key] : undefined;
}

function str(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_STRING_LENGTH) {
    throw new Malformed(field, "must be a non-empty string");
  }
  return value;
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Malformed(field, "must be a boolean");
  }
  return value;
}

function count(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Malformed(field, "must be a non-negative integer");
  }
  // `+ 0` turns -0 into +0, so a parsed command never carries -0 into state or events.
  return value + 0;
}

function oneOf<T>(value: unknown, allowed: readonly T[], field: string): T {
  const found = allowed.find((candidate) => candidate === value);
  if (found === undefined) {
    throw new Malformed(field, "is not an allowed value");
  }
  return found;
}

function list<T>(value: unknown, field: string, item: (value: unknown, field: string) => T): T[] {
  if (!Array.isArray(value)) {
    throw new Malformed(field, "must be an array");
  }
  if (value.length > MAX_ARRAY_LENGTH) {
    throw new Malformed(field, "is too long");
  }
  return value.map((entry, index) => item(entry, path(field, index)));
}

function optional<T>(o: Fields, key: string, field: string, read: (value: unknown, field: string) => T): T | undefined {
  const value = get(o, key);
  return value === undefined ? undefined : read(value, path(field, key));
}

/** Adds `key: value` only when `value` is defined (exactOptionalPropertyTypes). */
function maybe<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}

// ── Domain readers ───────────────────────────────────────────────────────────────────

const workerId = (value: unknown, field: string) => {
  const id = str(value, field);
  if (!WORKER_ID.test(id)) {
    throw new Malformed(field, "is not a worker ID");
  }
  return id;
};

const ceramicId = (value: unknown, field: string) => {
  const id = str(value, field);
  if (!CERAMIC_ID.test(id)) {
    throw new Malformed(field, "is not a ceramic ID");
  }
  return id;
};

const orderId = (value: unknown, field: string) => oneOf(value, ORDER_IDS, field);
const techId = (value: unknown, field: string) => oneOf(value, TECH_IDS, field);
const shapeOf = (value: unknown, field: string) => oneOf(value, SHAPES, field);
const glazeOf = (value: unknown, field: string) => oneOf(value, GLAZES, field);
const decorationOf = (value: unknown, field: string) => oneOf(value, DECORATIONS, field);
const heatMarkerValue = (value: unknown, field: string) => oneOf(value, HEAT_MARKER_VALUES, field);

function formVessel(value: unknown, field: string): FormVesselSpec {
  const o = objectAt(value, field);
  shape(o, field, ["shape", "decoration"]);
  return { shape: shapeOf(get(o, "shape"), path(field, "shape")), decoration: decorationOf(get(o, "decoration"), path(field, "decoration")) };
}

function loadSpec(value: unknown, field: string): LoadSpec {
  const o = objectAt(value, field);
  shape(o, field, ["ceramicId", "glaze", "destination"], ["reworkShape"]);
  const destinationField = path(field, "destination");
  const d = objectAt(get(o, "destination"), destinationField);
  const kiln = oneOf(get(d, "kiln"), ["shared", "imperial"] as const, path(destinationField, "kiln"));
  let destination: LoadSpec["destination"];
  if (kiln === "shared") {
    shape(d, destinationField, ["kiln", "spaceId"], ["invertedFiring", "kilnFurniture"]);
    destination = {
      kiln,
      spaceId: oneOf(get(d, "spaceId"), KILN_SPACE_IDS, path(destinationField, "spaceId")),
      ...maybe("invertedFiring", optional(d, "invertedFiring", destinationField, bool)),
      ...maybe(
        "kilnFurniture",
        optional(d, "kilnFurniture", destinationField, (v, f) => oneOf(v, KILN_FURNITURE_MODIFIERS, f)),
      ),
    };
  } else {
    shape(d, destinationField, ["kiln", "imperialModifier"]);
    destination = {
      kiln,
      imperialModifier: oneOf(get(d, "imperialModifier"), IMPERIAL_MODIFIERS, path(destinationField, "imperialModifier")),
    };
  }
  return {
    ceramicId: ceramicId(get(o, "ceramicId"), path(field, "ceramicId")),
    glaze: glazeOf(get(o, "glaze"), path(field, "glaze")),
    destination,
    ...maybe("reworkShape", optional(o, "reworkShape", field, shapeOf)),
  };
}

/** One Commission Market reservation. The count (0, or more than the effect allows) is a rule
 * error of the validator (`RESERVATION_REQUIRED`, `RESERVATION_LIMIT`), not a shape error. */
function commissionPick(value: unknown, field: string): CommissionPick {
  const o = objectAt(value, field);
  const kind = oneOf(get(o, "kind"), ["face_up", "looked"] as const, path(field, "kind"));
  if (kind === "face_up") {
    shape(o, field, ["kind", "slotIndex", "orderId"]);
    return {
      kind,
      slotIndex: count(get(o, "slotIndex"), path(field, "slotIndex")),
      orderId: orderId(get(o, "orderId"), path(field, "orderId")),
    };
  }
  shape(o, field, ["kind", "orderId"]);
  return { kind, orderId: orderId(get(o, "orderId"), path(field, "orderId")) };
}

function crackleDeclaration(value: unknown, field: string): CrackleDeclaration {
  const o = objectAt(value, field);
  shape(o, field, ["ceramicId", "decoration"]);
  return {
    ceramicId: ceramicId(get(o, "ceramicId"), path(field, "ceramicId")),
    decoration: decorationOf(get(o, "decoration"), path(field, "decoration")),
  };
}

const COMPLETION_OPTIONAL = ["crackleDeclarations", "declineKilnAbility", "declineTributeWare"] as const;

function completionSpec(o: Fields): OrderCompletionSpec {
  shape(o, "", ["type", "orderId", "ceramicIds"], COMPLETION_OPTIONAL);
  return {
    orderId: orderId(get(o, "orderId"), "orderId"),
    ceramicIds: list(get(o, "ceramicIds"), "ceramicIds", ceramicId),
    ...maybe("crackleDeclarations", optional(o, "crackleDeclarations", "", (v, f) => list(v, f, crackleDeclaration))),
    ...maybe("declineKilnAbility", optional(o, "declineKilnAbility", "", bool)),
    ...maybe("declineTributeWare", optional(o, "declineTributeWare", "", bool)),
  };
}

function onlyType(o: Fields): void {
  shape(o, "", ["type"]);
}

function ceramicOnly(o: Fields): string {
  shape(o, "", ["type", "ceramicId"]);
  return ceramicId(get(o, "ceramicId"), "ceramicId");
}

function workerOnly(o: Fields): string {
  shape(o, "", ["type", "workerId"]);
  return workerId(get(o, "workerId"), "workerId");
}

// ── One parser per command type ──────────────────────────────────────────────────────

type CommandType = AuthoritativeCommand["type"];
type Parsers = { readonly [K in CommandType]: (o: Fields) => Extract<AuthoritativeCommand, { type: K }> };

const PARSERS: Parsers = {
  SELECT_KILN: (o) => {
    shape(o, "", ["type", "kilnId"]);
    return { type: "SELECT_KILN", kilnId: oneOf(get(o, "kilnId"), KILN_IDS, "kilnId") };
  },
  PLACE_SETTERS_MARK: (o) => {
    shape(o, "", ["type", "spaceId"]);
    const spaceId = get(o, "spaceId");
    return { type: "PLACE_SETTERS_MARK", spaceId: spaceId === null ? null : oneOf(spaceId, KILN_SPACE_IDS, "spaceId") };
  },
  PLACE_MATERIALS_YARD: (o) => {
    shape(o, "", ["type", "workerId", "clay", "wood"], ["seniorApprentice", "preparedClay"]);
    return {
      type: "PLACE_MATERIALS_YARD",
      workerId: workerId(get(o, "workerId"), "workerId"),
      clay: count(get(o, "clay"), "clay"),
      wood: count(get(o, "wood"), "wood"),
      ...maybe("seniorApprentice", optional(o, "seniorApprentice", "", bool)),
      ...maybe(
        "preparedClay",
        optional(o, "preparedClay", "", (value, field) => {
          const p = objectAt(value, field);
          shape(p, field, ["shape", "decoration"], ["useDecoratorsKit"]);
          return {
            shape: shapeOf(get(p, "shape"), path(field, "shape")),
            decoration: decorationOf(get(p, "decoration"), path(field, "decoration")),
            ...maybe("useDecoratorsKit", optional(p, "useDecoratorsKit", field, bool)),
          };
        }),
      ),
    };
  },
  PLACE_FORM_DECORATE: (o) => {
    shape(o, "", ["type", "workerId", "vessels"], ["dingExtra", "useLargeThrowingWheel", "decoratorsKitVesselIndex"]);
    return {
      type: "PLACE_FORM_DECORATE",
      workerId: workerId(get(o, "workerId"), "workerId"),
      vessels: list(get(o, "vessels"), "vessels", formVessel),
      ...maybe(
        "dingExtra",
        optional(o, "dingExtra", "", (value, field) => {
          const d = objectAt(value, field);
          shape(d, field, ["copyOfVesselIndex", "decoration"]);
          return {
            copyOfVesselIndex: count(get(d, "copyOfVesselIndex"), path(field, "copyOfVesselIndex")),
            decoration: decorationOf(get(d, "decoration"), path(field, "decoration")),
          };
        }),
      ),
      ...maybe("useLargeThrowingWheel", optional(o, "useLargeThrowingWheel", "", bool)),
      ...maybe("decoratorsKitVesselIndex", optional(o, "decoratorsKitVesselIndex", "", count)),
    };
  },
  PLACE_GLAZE_LOAD: (o) => {
    shape(o, "", ["type", "workerId", "loads"], ["heatMarkerCeramicId"]);
    return {
      type: "PLACE_GLAZE_LOAD",
      workerId: workerId(get(o, "workerId"), "workerId"),
      loads: list(get(o, "loads"), "loads", loadSpec),
      ...maybe("heatMarkerCeramicId", optional(o, "heatMarkerCeramicId", "", ceramicId)),
    };
  },
  PLACE_COMMISSION_MARKET: (o) => {
    shape(o, "", ["type", "workerId"], ["seniorApprentice"]);
    return {
      type: "PLACE_COMMISSION_MARKET",
      workerId: workerId(get(o, "workerId"), "workerId"),
      ...maybe("seniorApprentice", optional(o, "seniorApprentice", "", bool)),
    };
  },
  PLACE_GUILD_HALL: (o) => {
    shape(o, "", ["type", "workerId", "choice"]);
    const c = objectAt(get(o, "choice"), "choice");
    const kind = oneOf(get(c, "kind"), ["buy_face_up", "inspect"] as const, "choice.kind");
    let choice: Extract<AuthoritativeCommand, { type: "PLACE_GUILD_HALL" }>["choice"];
    if (kind === "buy_face_up") {
      shape(c, "choice", ["kind", "techId"]);
      choice = { kind, techId: techId(get(c, "techId"), "choice.techId") };
    } else {
      shape(c, "choice", ["kind", "discipline"]);
      choice = { kind, discipline: oneOf(get(c, "discipline"), DISCIPLINES, "choice.discipline") };
    }
    return { type: "PLACE_GUILD_HALL", workerId: workerId(get(o, "workerId"), "workerId"), choice };
  },
  PLACE_CANAL_WHARF: (o) => ({ type: "PLACE_CANAL_WHARF", workerId: workerOnly(o) }),
  PLACE_MAGISTRATES_HALL: (o) => ({ type: "PLACE_MAGISTRATES_HALL", workerId: workerOnly(o) }),
  COMMISSION_CHOOSE: (o) => {
    shape(o, "", ["type", "reservations"]);
    return { type: "COMMISSION_CHOOSE", reservations: list(get(o, "reservations"), "reservations", commissionPick) };
  },
  GUILD_TAKE: (o) => {
    shape(o, "", ["type", "take"]);
    const t = objectAt(get(o, "take"), "take");
    shape(t, "take", ["kind", "techId"]);
    return {
      type: "GUILD_TAKE",
      take: {
        kind: oneOf(get(t, "kind"), ["face_up", "inspected"] as const, "take.kind"),
        techId: techId(get(t, "techId"), "take.techId"),
      },
    };
  },
  GUILD_FINISH: (o) => {
    shape(o, "", ["type", "bottomOrder"]);
    return { type: "GUILD_FINISH", bottomOrder: list(get(o, "bottomOrder"), "bottomOrder", techId) };
  },
  COLOUR_SAMPLES_CHOOSE: (o) => {
    shape(o, "", ["type", "orderId"]);
    return { type: "COLOUR_SAMPLES_CHOOSE", orderId: orderId(get(o, "orderId"), "orderId") };
  },
  COLOUR_SAMPLES_SWAP_CHOOSE: (o) => {
    shape(o, "", ["type", "orderId"]);
    return { type: "COLOUR_SAMPLES_SWAP_CHOOSE", orderId: orderId(get(o, "orderId"), "orderId") };
  },
  USE_COLOUR_SAMPLES_SWAP: (o) => {
    shape(o, "", ["type", "discardOrderId"]);
    return { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: orderId(get(o, "discardOrderId"), "discardOrderId") };
  },
  USE_IMPERIAL_PRIORITY: (o) => {
    shape(o, "", ["type", "ceramicId", "glaze", "imperialModifier"], ["reworkShape"]);
    return {
      type: "USE_IMPERIAL_PRIORITY",
      ceramicId: ceramicId(get(o, "ceramicId"), "ceramicId"),
      glaze: glazeOf(get(o, "glaze"), "glaze"),
      imperialModifier: oneOf(get(o, "imperialModifier"), IMPERIAL_MODIFIERS, "imperialModifier"),
      ...maybe("reworkShape", optional(o, "reworkShape", "", shapeOf)),
    };
  },
  END_TURN: (o) => {
    onlyType(o);
    return { type: "END_TURN" };
  },
  TEST_PIECES_DECIDE: (o) => {
    shape(o, "", ["type", "peek"]);
    return { type: "TEST_PIECES_DECIDE", peek: bool(get(o, "peek"), "peek") };
  },
  TEST_PIECES_BURY: (o) => {
    shape(o, "", ["type", "bury"]);
    return { type: "TEST_PIECES_BURY", bury: bool(get(o, "bury"), "bury") };
  },
  RESOLVE_HEAT_MARKERS: (o) => {
    shape(o, "", ["type"], ["ownMarker", "kilnMaster"]);
    return {
      type: "RESOLVE_HEAT_MARKERS",
      ...maybe(
        "ownMarker",
        optional(o, "ownMarker", "", (value, field) => oneOf(value, [...HEAT_MARKER_VALUES, "return"] as const, field)),
      ),
      ...maybe(
        "kilnMaster",
        optional(o, "kilnMaster", "", (value, field) => {
          const k = objectAt(value, field);
          shape(k, field, ["ceramicId", "value"]);
          return {
            ceramicId: ceramicId(get(k, "ceramicId"), path(field, "ceramicId")),
            value: heatMarkerValue(get(k, "value"), path(field, "value")),
          };
        }),
      ),
    };
  },
  RESOLVE_JUN: (o) => {
    shape(o, "", ["type", "adjustment"]);
    const value = get(o, "adjustment");
    if (value === null) {
      return { type: "RESOLVE_JUN", adjustment: null };
    }
    const a = objectAt(value, "adjustment");
    shape(a, "adjustment", ["ceramicId", "delta"]);
    return {
      type: "RESOLVE_JUN",
      adjustment: {
        ceramicId: ceramicId(get(a, "ceramicId"), "adjustment.ceramicId"),
        delta: heatMarkerValue(get(a, "delta"), "adjustment.delta"),
      },
    };
  },
  USE_PROTECTIVE_SAGGARS: (o) => ({ type: "USE_PROTECTIVE_SAGGARS", ceramicId: ceramicOnly(o) }),
  USE_SECOND_FIRING: (o) => ({ type: "USE_SECOND_FIRING", ceramicId: ceramicOnly(o) }),
  SECOND_FIRING_CHOOSE: (o) => {
    shape(o, "", ["type", "cardIndex", "jun"]);
    const value = get(o, "jun");
    let jun: { delta: HeatMarkerValue } | null = null;
    if (value !== null) {
      const j = objectAt(value, "jun");
      shape(j, "jun", ["delta"]);
      jun = { delta: heatMarkerValue(get(j, "delta"), "jun.delta") };
    }
    return { type: "SECOND_FIRING_CHOOSE", cardIndex: oneOf(get(o, "cardIndex"), SECOND_FIRING_CARD_INDEXES, "cardIndex"), jun };
  },
  USE_GE_CRACKLE: (o) => ({ type: "USE_GE_CRACKLE", ceramicId: ceramicOnly(o) }),
  END_AFTER_QUALITY: (o) => {
    onlyType(o);
    return { type: "END_AFTER_QUALITY" };
  },
  SALVAGE_FLAWED: (o) => {
    shape(o, "", ["type", "ceramicId"]);
    const value = get(o, "ceramicId");
    return { type: "SALVAGE_FLAWED", ceramicId: value === null ? null : ceramicId(value, "ceramicId") };
  },
  COMPLETE_ORDER: (o) => ({ type: "COMPLETE_ORDER", ...completionSpec(o) }),
  END_ORDER_TURN: (o) => {
    onlyType(o);
    return { type: "END_ORDER_TURN" };
  },
  DISCARD_TO_HAND_LIMIT: (o) => {
    shape(o, "", ["type", "orderIds"]);
    return { type: "DISCARD_TO_HAND_LIMIT", orderIds: list(get(o, "orderIds"), "orderIds", orderId) };
  },
  SUBMIT_CONTRIBUTION: (o) => {
    shape(o, "", ["type", "windowId", "card", "fuelLedger"]);
    return {
      type: "SUBMIT_CONTRIBUTION",
      windowId: str(get(o, "windowId"), "windowId"),
      card: oneOf(get(o, "card"), CONTRIBUTION_CARD_IDS, "card"),
      fuelLedger: bool(get(o, "fuelLedger"), "fuelLedger"),
    };
  },
};

/** Every command type `parseCommand` accepts, in `GameAction` declaration order. */
export const COMMAND_TYPES = Object.keys(PARSERS) as CommandType[];

/**
 * Shape-checks untrusted JSON. Returns a fresh, exactly typed command, or a
 * `MALFORMED_ACTION` error whose `details.field` names the offending path.
 */
export function parseCommand(input: unknown): AuthoritativeCommand | GameRuleError {
  try {
    const o = objectAt(input, "");
    const type = get(o, "type");
    if (typeof type !== "string" || !Object.hasOwn(PARSERS, type)) {
      throw new Malformed("type", "is not a known command type");
    }
    return PARSERS[type as CommandType](o);
  } catch (error) {
    if (error instanceof Malformed) {
      return ruleError("MALFORMED_ACTION", `Malformed command: ${error.field} ${error.reason}.`, { field: error.field });
    }
    throw error;
  }
}
