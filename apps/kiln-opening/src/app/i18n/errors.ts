/**
 * Error text (UI_V1.6.1_ARCHITECTURE §6.1–6.2). Replaces V1.4 `localizeMultiplayerError`.
 *
 * Errors are stored as codes plus details (`StoredError`, §3.1) and formatted here at render
 * time, so a language switch re-renders them.
 *
 * - Rule errors go through the engine's `formatRuleError` (`RULE_ERROR_TEXT`).
 * - Every other `MultiplayerErrorCode` has one key in the `mp` namespace; `MP_ERROR_KEYS` is an
 *   exhaustive record, so a new code fails `typecheck`.
 * - No internal ID reaches the text (D9): player IDs go through `playerName`, ceramic IDs in
 *   `details` through `ceramicName` (default: "a ceramic"), before the engine formats them.
 * - A kiln space is named once, the UI's way: a `spaceId` detail is replaced by
 *   `kilnSpaceName` ("High 2" / 高温区2) before formatting, so a choice and its error name the
 *   same space identically. The engine prints a non-ID string as it is.
 * - An unknown code throws in development and tests; in production it shows the raw code.
 */
import { KILN_SPACE_IDS, RULE_ERROR_TEXT, formatRuleError } from "../../game/index.ts";
import type { CeramicId, GameRuleError, GameRuleErrorCode, KilnSpaceId, PlayerId } from "../../game/index.ts";
import type { MultiplayerErrorCode } from "../../multiplayer/types.ts";
import { ceramicLabel, kilnSpaceName, playerDisplayName } from "./ceramicLabel.ts";
import { RULE_NUMBERS } from "./content.ts";
import type { CeramicLabelView } from "./ceramicLabel.ts";
import { MissingTranslationError, defaultStrict, ruleLocale, translatorFor } from "./translator.ts";
import type { Locale, MessageKey, Translator } from "./translator.ts";

export type NonRuleErrorCode = Exclude<MultiplayerErrorCode, GameRuleErrorCode>;

/** One `mp` catalogue key per non-rule multiplayer code (exhaustive). */
export const MP_ERROR_KEYS: { readonly [C in NonRuleErrorCode]: MessageKey & `mp.${C}` } = {
  INVALID_REQUEST: "mp.INVALID_REQUEST",
  ROOM_NOT_FOUND: "mp.ROOM_NOT_FOUND",
  ROOM_CODE_CONFLICT: "mp.ROOM_CODE_CONFLICT",
  ROOM_FULL: "mp.ROOM_FULL",
  GAME_ALREADY_STARTED: "mp.GAME_ALREADY_STARTED",
  GAME_NOT_STARTED: "mp.GAME_NOT_STARTED",
  AUTHENTICATION_FAILED: "mp.AUTHENTICATION_FAILED",
  HOST_ONLY: "mp.HOST_ONLY",
  NOT_ENOUGH_PLAYERS: "mp.NOT_ENOUGH_PLAYERS",
  STALE_REVISION: "mp.STALE_REVISION",
  DUPLICATE_COMMAND: "mp.DUPLICATE_COMMAND",
  PERSISTENCE_CONFLICT: "mp.PERSISTENCE_CONFLICT",
  SESSION_ENDED: "mp.SESSION_ENDED",
  UNSUPPORTED_RULES_VERSION: "mp.UNSUPPORTED_RULES_VERSION",
  RULES_FINGERPRINT_MISMATCH: "mp.RULES_FINGERPRINT_MISMATCH",
  COMPUTER_TURN_FAILED: "mp.COMPUTER_TURN_FAILED",
  SERVER_CONFIGURATION_ERROR: "mp.SERVER_CONFIGURATION_ERROR",
  INTERNAL_SERVER_ERROR: "mp.INTERNAL_SERVER_ERROR",
  METHOD_NOT_ALLOWED: "mp.METHOD_NOT_ALLOWED",
  SERVICE_UNAVAILABLE: "mp.SERVICE_UNAVAILABLE",
};

export function isRuleErrorCode(code: string): code is GameRuleErrorCode {
  return Object.prototype.hasOwnProperty.call(RULE_ERROR_TEXT, code);
}

export function isNonRuleErrorCode(code: string): code is NonRuleErrorCode {
  return Object.prototype.hasOwnProperty.call(MP_ERROR_KEYS, code);
}

export interface ErrorTextOptions {
  /** Display name for a player ID. */
  playerName?: (playerId: PlayerId) => string;
  /** Words for a ceramic ID (D9); default "a ceramic" / "一件器物". */
  ceramicName?: (ceramicId: CeramicId) => string;
}

type Details = Readonly<Record<string, string | number | boolean>>;

/** Only the primitive details (a transport error may carry anything). */
function primitiveDetails(details: Readonly<Record<string, unknown>> | undefined): Details {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(details ?? {})) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") out[key] = value;
  }
  return out;
}

/** Kiln-space keys in rule-error `details`: replaced by the UI's space name. */
const SPACE_KEYS = ["spaceId"] as const;

function isKilnSpaceId(value: unknown): value is KilnSpaceId {
  return typeof value === "string" && (KILN_SPACE_IDS as readonly string[]).includes(value);
}

function withSpaceNames(details: Details, t: Translator): Details {
  let out: Record<string, string | number | boolean> | null = null;
  for (const key of SPACE_KEYS) {
    const value = details[key];
    if (isKilnSpaceId(value)) {
      out ??= { ...details };
      out[key] = kilnSpaceName(value, t);
    }
  }
  return out ?? details;
}

/** A rule error in the current language. */
export function ruleErrorText(
  error: Pick<GameRuleError, "code"> & { details?: Readonly<Record<string, unknown>> },
  locale: Locale | Translator,
  options: ErrorTextOptions = {},
): string {
  const t = translatorFor(locale);
  return formatRuleError({ code: error.code, details: withSpaceNames(primitiveDetails(error.details), t) }, ruleLocale(t.locale), {
    ...(options.playerName === undefined ? {} : { playerName: options.playerName }),
    // D9: a ceramic ID in `details` is always described in words, never printed.
    ceramicName: options.ceramicName ?? (() => t("common.ceramic.unknown")),
  });
}

/** Any multiplayer error code (rule codes included) in the current language. */
export function mpErrorText(
  code: MultiplayerErrorCode | string,
  details: Readonly<Record<string, unknown>> | undefined,
  locale: Locale | Translator,
  options: ErrorTextOptions = {},
): string {
  const t = translatorFor(locale);
  if (isRuleErrorCode(code)) return ruleErrorText({ code, details: details ?? {} }, t, options);
  if (isNonRuleErrorCode(code)) {
    const key = MP_ERROR_KEYS[code];
    return key === "mp.NOT_ENOUGH_PLAYERS" ? t(key, { min: minPlayers(details) }) : t.dynamic(key);
  }
  if (defaultStrict()) throw new MissingTranslationError(`unknown error code "${code}"`);
  console.warn(`[i18n] unknown error code "${code}"`);
  return t("mp.unknown", { code });
}

function minPlayers(details: Readonly<Record<string, unknown>> | undefined): number {
  const value = details?.["minPlayers"] ?? details?.["min"];
  return typeof value === "number" ? value : RULE_NUMBERS.playersMin;
}

/** The shape of `StoredError` (session/gameSource.ts, §3.1). */
export type StoredErrorLike =
  | { readonly kind: "rule"; readonly error: Pick<GameRuleError, "code"> & { readonly details?: Readonly<Record<string, unknown>> } }
  | { readonly kind: "mp"; readonly code: MultiplayerErrorCode; readonly details?: Readonly<Record<string, unknown>> };

/** A stored error in the current language. */
export function storedErrorText(stored: StoredErrorLike, locale: Locale | Translator, options: ErrorTextOptions = {}): string {
  return stored.kind === "rule"
    ? ruleErrorText(stored.error, locale, options)
    : mpErrorText(stored.code, stored.details, locale, options);
}

/** `playerName` and `ceramicName` resolvers from a view (D9: names and words, never IDs). */
export function errorTextOptions(view: CeramicLabelView, locale: Locale | Translator): ErrorTextOptions {
  return {
    playerName: (playerId) => playerDisplayName(playerId, view) || translatorFor(locale)("common.anotherPlayer"),
    ceramicName: (ceramicId) => ceramicLabel(ceramicId, view, { locale }),
  };
}
