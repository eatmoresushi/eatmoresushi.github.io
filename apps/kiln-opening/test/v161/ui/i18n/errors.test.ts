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

  it("names the Guild Hall's and Glaze & Load's own placement conditions for NO_MAIN_ACTION_POSSIBLE (v1.6.2 L242, L216), and the generic sentence elsewhere", () => {
    const guild = { code: "NO_MAIN_ACTION_POSSIBLE", details: { locationId: "guild_hall", workerId: "p1:shifu", effect: "shifu" } } as const;
    expect(ruleErrorText(guild, "en")).toBe("You can place a worker at the Guild Hall only if you can afford a face-up Tech from a discipline you do not own yet.");
    expect(ruleErrorText(guild, "zh-CN")).toBe("只有当你付得起一张公开技艺，且还没有该门类的技艺时，才可以派工到陶工行");
    expect(mpErrorText(guild.code, guild.details, "en")).toBe(ruleErrorText(guild, "en"));
    // Glaze & Load names the kiln fuel (L216, R24), from content.
    const glaze = { code: "NO_MAIN_ACTION_POSSIBLE", details: { locationId: "glaze_load" } } as const;
    expect(ruleErrorText(glaze, "en")).toBe("You can place a worker at Glaze & Load only if you have a Shaped vessel, an empty active Shared Kiln space or your own empty Imperial Kiln, and 1 Wood if you load into the Shared Kiln.");
    expect(ruleErrorText(glaze, "zh-CN")).toBe("只有当你有坯，有空的启用窑位或自己空着的御窑，并且（若装进共窑）有1柴时，才可以派工到施釉装窑。");
    // Another location, or no location detail: the engine's sentence.
    const other = { code: "NO_MAIN_ACTION_POSSIBLE", details: { locationId: "commission_market" } } as const;
    expect(ruleErrorText(other, "en")).toBe(ruleErrorText({ code: other.code, details: other.details }, "en"));
    expect(ruleErrorText(other, "en")).toContain("at least 1 instance of the main action");
    expect(ruleErrorText({ code: "NO_MAIN_ACTION_POSSIBLE", details: {} }, "en")).toContain("at least 1 instance of the main action");
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
    expect(storedErrorText(stored, "zh-CN")).toBe("找不到这个房间码");
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
