import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RULE_ERROR_TEXT } from "../../../../src/game/index.ts";
import {
  MP_ERROR_KEYS,
  errorTextOptions,
  isNonRuleErrorCode,
  mpErrorText,
  ruleErrorText,
  storedErrorText,
} from "../../../../src/app/i18n/errors.ts";
import { kilnSpaceName } from "../../../../src/app/i18n/ceramicLabel.ts";
import { ROOT } from "../../support/glossary.ts";

/** §6.2: rule errors through `formatRuleError`, other multiplayer codes through the `mp` namespace. */
const TYPES = readFileSync(join(ROOT, "src/multiplayer/types.ts"), "utf8");
const MP_CODES = [...(TYPES.split("export type MultiplayerErrorCode =")[1]?.split("| GameRuleErrorCode")[0] ?? "").matchAll(/"([A-Z_]+)"/g)]
  .map((match) => match[1] ?? "");

const VIEW = {
  viewerId: "p1",
  game: {
    players: { p1: { displayName: "Lin" }, p2: { displayName: "Zhao" } },
    ceramics: {
      c4: { id: "c4", ownerId: "p2", vesselInstanceId: "vase-01", shape: "vase", decoration: "carved", formedInRound: 1, formedBy: "form_decorate", stage: "shaped" },
    },
  },
} as const;

describe("error text", () => {
  it("has one mp key per non-rule multiplayer code", () => {
    expect(MP_CODES.length).toBeGreaterThan(15);
    expect(Object.keys(MP_ERROR_KEYS).sort()).toEqual([...MP_CODES].sort());
    for (const code of MP_CODES) {
      expect(isNonRuleErrorCode(code)).toBe(true);
      for (const locale of ["en", "zh-CN"] as const) {
        const text = mpErrorText(code, undefined, locale);
        expect(text.trim(), code).not.toBe("");
        expect(text, code).not.toMatch(/[{}]/);
      }
    }
  });

  it("routes rule codes to formatRuleError in both languages", () => {
    for (const code of Object.keys(RULE_ERROR_TEXT) as Array<keyof typeof RULE_ERROR_TEXT>) {
      expect(mpErrorText(code, {}, "en").trim()).not.toBe("");
      expect(mpErrorText(code, {}, "zh-CN")).toBe(ruleErrorText({ code, details: {} }, "zh-CN"));
    }
    expect(ruleErrorText({ code: "LOCATION_FULL", details: { locationId: "guild_hall" } }, "zh-CN")).toBe("陶工行已满");
  });

  it("fills NOT_ENOUGH_PLAYERS from content, not from the catalogue", () => {
    expect(mpErrorText("NOT_ENOUGH_PLAYERS", undefined, "en")).toBe("At least 2 players are needed to start.");
    expect(mpErrorText("NOT_ENOUGH_PLAYERS", undefined, "zh-CN")).toBe("开局至少需要2名玩家");
  });

  it("never shows a ceramic or player ID (D9)", () => {
    const options = errorTextOptions(VIEW, "en");
    const text = ruleErrorText({ code: "NOT_YOUR_DECISION", details: { waitingFor: "p2", ceramicId: "c4" } }, "en", options);
    expect(text).toBe("It is not your turn yet; waiting for Zhao.");
    const names = options.ceramicName?.("c4");
    expect(names).toBe("Zhao’s Vase, Carved");
    const stored = storedErrorText({ kind: "rule", error: { code: "INVALID_TARGET", details: { ceramicId: "c4", reason: "not_this_firing" } } }, "zh-CN", errorTextOptions(VIEW, "zh-CN"));
    expect(stored).not.toMatch(/\bc\d+\b/);
    expect(stored).toBe("此目标不合法：器物不在本次烧成中");
  });

  it("re-renders a stored error in the current language", () => {
    const stored = { kind: "mp", code: "ROOM_FULL" } as const;
    expect(storedErrorText(stored, "en")).toBe("That room is full.");
    expect(storedErrorText(stored, "zh-CN")).toBe("房间已满");
  });
});

describe("StoredError compatibility", () => {
  it("accepts the session's StoredError shape", async () => {
    const { toStoredError } = await import("../../../../src/app/session/sessionStore.ts").catch(() => ({ toStoredError: undefined }));
    if (toStoredError === undefined) return;
    const stored = toStoredError({ code: "ROOM_NOT_FOUND", message: "x", details: {}, currentRevision: null });
    expect(storedErrorText(stored, "zh-CN")).toBe("找不到这个房间代码");
  });
});

describe("kiln space names (one name per space)", () => {
  it("names a space in a rule error exactly as the choices and ceramic labels do", () => {
    const error = { code: "KILN_SPACE_UNAVAILABLE", details: { spaceId: "high_2" } } as const;
    expect(ruleErrorText(error, "en")).toBe(`${kilnSpaceName("high_2", "en")} is not available: it is covered or already holds a ceramic.`);
    expect(ruleErrorText(error, "en")).toBe("High 2 is not available: it is covered or already holds a ceramic.");
    expect(ruleErrorText(error, "zh-CN")).toBe(`${kilnSpaceName("high_2", "zh-CN")}不可用：已被盖住或已有器物`);
    expect(ruleErrorText(error, "zh-CN")).not.toContain("号窑位");
    expect(ruleErrorText(error, "en")).not.toContain("space 2");
  });

  it("leaves other details and unknown space values alone", () => {
    expect(ruleErrorText({ code: "KILN_SPACE_UNAVAILABLE", details: { spaceId: "nowhere" } }, "en")).toContain("nowhere");
  });
});
