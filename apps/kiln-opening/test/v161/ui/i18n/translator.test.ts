import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createTranslator, msg, MissingTranslationError } from "../../../../src/app/i18n/translator.ts";

describe("translator", () => {
  const en = createTranslator("en", { strict: true });
  const zh = createTranslator("zh-CN", { strict: true });

  it("formats plain text from the same key in both languages", () => {
    expect(en("common.verb.confirm")).toBe("Confirm");
    expect(zh("common.verb.confirm")).toBe("确认");
    expect(en("common.status.waitingFor", { name: "Lin" })).toBe("Waiting for Lin…");
    expect(zh("common.status.waitingFor", { name: "林" })).toBe("等候林……");
  });

  it("chooses English plural forms with Intl.PluralRules and keeps Chinese as one string", () => {
    expect(en("common.amount.coins", { n: 1 })).toBe("1 Coin");
    expect(en("common.amount.coins", { n: 3 })).toBe("3 Coins");
    expect(en("common.amount.coins", { n: 0 })).toBe("0 Coins");
    expect(zh("common.amount.coins", { n: 1 })).toBe("1铜钱");
  });

  it("strips tag placeholders in plain text and renders them in rich text", () => {
    expect(en("common.roundN", { n: 2, total: 5 })).toBe("Round 2/5");
    const markup = renderToStaticMarkup(createElement("p", null, en.rich("common.roundN", { n: 2, total: 5 })));
    expect(markup).toBe("<p>Round <strong>2</strong>/5</p>");
    expect(renderToStaticMarkup(createElement("p", null, zh.rich("common.roundN", { n: 3, total: 5 })))).toBe("<p>第<strong>3</strong>轮／共5轮</p>");
  });

  it("inserts parameters as text, never as markup", () => {
    const markup = renderToStaticMarkup(createElement("p", null, en.rich("common.status.waitingFor", { name: "<b>Lin</b>" })));
    expect(markup).toBe("<p>Waiting for &lt;b&gt;Lin&lt;/b&gt;…</p>");
  });

  it("writes negative numbers with U+2212", () => {
    expect(en("common.piece.fireCard", { value: -2 })).toBe("Fire card −2");
  });

  it("formats stored messages, nested messages and deferred parameters in the current language", () => {
    const stored = msg("common.ceramic.withQuality", { ceramic: (t) => (t.locale === "en" ? "Celadon Vase, Carved" : "青釉瓶 · 刻花"), quality: msg("common.verb.confirm") });
    expect(en.message(stored)).toBe("Celadon Vase, Carved · Confirm");
    expect(zh.message(stored)).toBe("青釉瓶 · 刻花 · 确认");
  });

  it("throws in strict mode and falls back to English with a warning otherwise", () => {
    expect(() => en.dynamic("common.nope")).toThrow(MissingTranslationError);
    const warnings: string[] = [];
    const loose = createTranslator("zh-CN", {
      strict: false,
      warn: (m) => warnings.push(m),
      catalog: { demo: { en: { hello: "Hello {name}" }, zh: { hello: " " } } },
    });
    expect(loose.dynamic("demo.hello", { name: "Lin" })).toBe("Hello Lin");
    expect(loose.dynamic("demo.missing")).toBe("demo.missing");
    expect(warnings).toHaveLength(2);
  });

  it("types keys and parameters from the English templates", () => {
    // @ts-expect-error unknown key
    expect(() => en("common.nope")).toThrow(MissingTranslationError);
    // @ts-expect-error missing parameter
    expect(() => en("common.status.waitingFor")).toThrow(MissingTranslationError);
    // @ts-expect-error wrong parameter name
    expect(() => en("common.status.waitingFor", { who: "Lin" })).toThrow(MissingTranslationError);
    // @ts-expect-error a plural count must be a number
    expect(() => en("common.amount.coins", { n: "2" })).toThrow(MissingTranslationError);
    expect(en("common.verb.confirm")).toBe("Confirm");
  });
});
