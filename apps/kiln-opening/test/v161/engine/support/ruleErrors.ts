/**
 * Rule-error contract helper (DESIGN §6.10): every `details` key an emitter uses must be
 * documented in `RULE_ERROR_TEXT[code].detailKeys`, so the UI can localise it.
 */

import { expect } from "vitest";
import { RULE_ERROR_TEXT } from "../../../../src/game/ruleErrorText.ts";
import type { GameRuleError } from "../../../../src/game/types.ts";

export function expectDocumentedDetails(error: GameRuleError | null | undefined): void {
  expect(error, "expected a rule error").toBeTruthy();
  if (!error) {
    return;
  }
  const documented = RULE_ERROR_TEXT[error.code].detailKeys;
  for (const key of Object.keys(error.details)) {
    expect(documented, `${error.code} details.${key} is not in RULE_ERROR_TEXT.detailKeys`).toContain(key);
  }
}
