/**
 * Rule failures and engine-bug errors (DESIGN §2.3).
 *
 * A rule failure is a typed `GameRuleError` value returned from a validator. An engine bug
 * (something impossible after validation, a broken invariant, an unimplemented stub) is an
 * `InvariantError` exception and never a rule outcome.
 *
 * Layer 1: imports only types.
 */

import type { GameRuleError, GameRuleErrorCode } from "./types.ts";

export function ruleError(
  code: GameRuleErrorCode,
  message: string,
  details: GameRuleError["details"] = {},
): GameRuleError {
  return { code, message, details };
}

export function fail(error: GameRuleError): { ok: false; error: GameRuleError } {
  return { ok: false, error };
}

/** Distinguishes `parseCommand`'s error result from a parsed command (commands have no `code`). */
export function isGameRuleError(value: unknown): value is GameRuleError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

/** An engine bug, never a rule outcome. */
export class InvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Thrown only by P0's stub modules: `new NotImplementedError("<module>.<export>")`. */
export class NotImplementedError extends InvariantError {
  readonly what: string;

  constructor(what: string) {
    super(`Not implemented: ${what}`);
    this.what = what;
  }
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new InvariantError(message);
  }
}

/** Runs the checks in order and returns the first rule error, or null when all pass. */
export function firstError(...checks: Array<() => GameRuleError | null>): GameRuleError | null {
  for (const check of checks) {
    const error = check();
    if (error !== null) {
      return error;
    }
  }
  return null;
}
