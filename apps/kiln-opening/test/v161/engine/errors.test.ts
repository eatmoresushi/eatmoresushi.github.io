import { describe, expect, it } from "vitest";
import {
  InvariantError,
  NotImplementedError,
  fail,
  firstError,
  invariant,
  isGameRuleError,
  ruleError,
} from "../../../src/game/errors.ts";

describe("errors (DESIGN §2.3)", () => {
  it("ruleError builds a typed, JSON-safe rule failure; fail wraps it", () => {
    const error = ruleError("LOCATION_FULL", "Every space at this location is occupied.", { locationId: "guild_hall", capacity: 2 });
    expect(error).toEqual({ code: "LOCATION_FULL", message: "Every space at this location is occupied.", details: { locationId: "guild_hall", capacity: 2 } });
    expect(ruleError("GAME_FINISHED", "The game is over.").details).toEqual({});
    expect(fail(error)).toEqual({ ok: false, error });
    expect(JSON.parse(JSON.stringify(error))).toEqual(error);
  });

  it("firstError returns the first failing check and stops there", () => {
    const calls: string[] = [];
    const result = firstError(
      () => (calls.push("a"), null),
      () => (calls.push("b"), ruleError("TECH_LIMIT", "b")),
      () => (calls.push("c"), ruleError("TECH_DISCIPLINE_OWNED", "c")),
    );
    expect(result?.code).toBe("TECH_LIMIT");
    expect(calls).toEqual(["a", "b"]);
    expect(firstError(() => null)).toBeNull();
  });

  it("invariant throws InvariantError; NotImplementedError is an InvariantError naming the export", () => {
    expect(() => invariant(false, "broken")).toThrow(InvariantError);
    expect(() => invariant(1, "fine")).not.toThrow();
    const notImplemented = new NotImplementedError("round.startRound");
    expect(notImplemented).toBeInstanceOf(InvariantError);
    expect(notImplemented.name).toBe("NotImplementedError");
    expect(notImplemented.what).toBe("round.startRound");
    expect(notImplemented.message).toContain("round.startRound");
  });

  it("isGameRuleError tells parseCommand's error from a command", () => {
    expect(isGameRuleError(ruleError("MALFORMED_ACTION", "x", { field: "type" }))).toBe(true);
    expect(isGameRuleError({ type: "END_TURN" })).toBe(false);
    expect(isGameRuleError(null)).toBe(false);
  });
});
