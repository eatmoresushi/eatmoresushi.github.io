import { describe, expect, it } from "vitest";
import * as engine from "../../../src/game/index.ts";

describe("public barrel (src/game/index.ts)", () => {
  it("exports the consumer API and loads without import cycles", () => {
    for (const name of [
      "createGame",
      "validateAction",
      "applyAction",
      "submitContribution",
      "parseCommand",
      "decisionPrompt",
      "projectPublicState",
      "projectPrivateView",
      "viewOf",
      "actorViewOf",
      "projectEvent",
      "eventForViewer",
      "SeededRandom",
      "legalActions",
      "legalCommands",
      "isGameRuleError",
      "rulesFingerprint",
      "formatRuleError",
    ] as const) {
      expect(typeof engine[name], name).toBe("function");
    }
    expect(engine.RULE_ERROR_TEXT.MALFORMED_ACTION.detailKeys).toContain("field");
    expect(engine.KILN_IDS).toEqual(["RU", "GU", "GE", "DI", "JU"]);
  });

  it("does not expose engine-internal helpers", () => {
    const exported = engine as Record<string, unknown>;
    for (const name of ["gain", "spend", "placeWorker", "grantTech", "HANDLERS", "FLOW", "cloneState"]) {
      expect(exported[name], name).toBeUndefined();
    }
  });
});
