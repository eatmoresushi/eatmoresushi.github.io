import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createTranslator } from "../../../../src/app/i18n/translator.ts";
import { parseTemplate, stripTags, templateProblems } from "../../../../src/app/i18n/richText.tsx";
import { allStrings } from "./catalog_support.ts";

/** §6.4 `rich_text`: only whitelisted tag placeholders, balanced; parameters render as text. */
describe("rich-text templates", () => {
  it.each(allStrings().map((entry) => [`${entry.id} (${entry.locale})`, entry.text] as const))("%s is well-formed", (_, text) => {
    expect(templateProblems(text)).toEqual([]);
  });

  it("finds raw angle brackets and unbalanced tags", () => {
    expect(templateProblems("a <i>b</i>")).not.toEqual([]);
    expect(templateProblems("a <b>b")).toEqual(["<b> is never closed"]);
    expect(templateProblems("a </b>")).not.toEqual([]);
    expect(templateProblems("<b><em>x</b></em>")).not.toEqual([]);
    expect(templateProblems("a { b")).not.toEqual([]);
    expect(templateProblems("Round <b>{n}</b>/{total}")).toEqual([]);
  });

  it("tokenises parameters and tags", () => {
    expect(parseTemplate("Round <b>{n}</b>/{total}").map((token) => token.kind)).toEqual(["text", "open", "param", "close", "text", "param"]);
    expect(stripTags("第<b>{n}</b>轮")).toBe("第{n}轮");
  });

  it("renders parameters as text and never parses them", () => {
    const t = createTranslator("en", { strict: true });
    const html = renderToStaticMarkup(createElement("p", null, t.rich("common.ceramic.owned", { owner: "<em>x</em>", ceramic: "<b>y</b>" })));
    expect(html).not.toContain("<em>x");
    expect(html).toContain("&lt;em&gt;x&lt;/em&gt;");
  });

  it("renders React element parameters (icons) in rich text", () => {
    const t = createTranslator("zh-CN", { strict: true });
    const html = renderToStaticMarkup(createElement("p", null, t.rich("common.piece.resourceAmount", { n: 2, res: createElement("i", null, "泥") })));
    expect(html).toBe("<p><strong>2</strong><i>泥</i></p>");
  });
});
