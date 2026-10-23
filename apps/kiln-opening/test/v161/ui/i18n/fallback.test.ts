import { describe, expect, it, vi } from "vitest";
import { createTranslator, MissingTranslationError } from "../../../../src/app/i18n/translator.ts";
import { mpErrorText } from "../../../../src/app/i18n/errors.ts";

/** §6.4 `fallback`: development and tests throw; production falls back to English with a warning. */
const CATALOG = {
  demo: {
    en: { hello: "Hello {name}", plain: "Plain", many: { one: "{n} cup", other: "{n} cups" } },
    zh: { hello: "", plain: "素", many: "{n}只杯" },
  },
};

describe("translator fallback", () => {
  it("throws in strict mode for a missing key, an empty Chinese string or a missing parameter", () => {
    const zh = createTranslator("zh-CN", { strict: true, catalog: CATALOG });
    expect(() => zh.dynamic("demo.nope")).toThrow(MissingTranslationError);
    expect(() => zh.dynamic("demo.hello", { name: "Lin" })).toThrow(MissingTranslationError);
    expect(() => zh.dynamic("demo.many")).toThrow(MissingTranslationError);
    const en = createTranslator("en", { strict: true, catalog: CATALOG });
    expect(() => en.dynamic("demo.hello")).toThrow(MissingTranslationError);
  });

  it("falls back to English (or the key) with a warning in production", () => {
    const warn = vi.fn();
    const zh = createTranslator("zh-CN", { strict: false, catalog: CATALOG, warn });
    expect(zh.dynamic("demo.hello", { name: "Lin" })).toBe("Hello Lin");
    expect(zh.dynamic("demo.plain")).toBe("素");
    expect(zh.dynamic("demo.nope")).toBe("demo.nope");
    expect(zh.dynamic("demo.many", { n: 2 })).toBe("2只杯");
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("is strict under vitest by default", () => {
    expect(() => createTranslator("en").dynamic("common.nope")).toThrow(MissingTranslationError);
  });

  it("throws for an unknown multiplayer error code in development", () => {
    expect(() => mpErrorText("NOT_A_CODE", undefined, "en")).toThrow(MissingTranslationError);
  });
});
