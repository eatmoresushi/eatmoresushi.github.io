import type { ApplyResult, CreateGameResult, GameRuleError, GameRuleErrorCode } from "./types.ts";

export function ruleError(
  code: GameRuleErrorCode,
  message: string,
  details: Record<string, string | number | boolean> = {},
): GameRuleError {
  return { code, message, details };
}

export function applyFailure(error: GameRuleError): ApplyResult {
  return { ok: false, error };
}

export function createFailure(error: GameRuleError): CreateGameResult {
  return { ok: false, error };
}
