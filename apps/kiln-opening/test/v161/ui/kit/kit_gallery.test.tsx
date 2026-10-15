import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import KitGallery, { gallery } from "../../../../src/app/dev/kit.gallery.tsx";
import { I18nProvider } from "../../../../src/app/i18n/I18nProvider.tsx";
import { accessibleText, scannedText } from "../pieces/a11y_text.ts";

/** The kit gallery renders every control and piece in both themes and both languages (§10.2 A3). */
describe("kit gallery", () => {
  it.each(["en", "zh-CN"] as const)("renders in %s with both themes and no missing text", (locale) => {
    const html = renderToStaticMarkup(<I18nProvider locale={locale} strict><KitGallery /></I18nProvider>);
    expect(gallery.id).toBe("kit");
    expect(html).toContain('data-theme="light"');
    expect(html).toContain('data-theme="dark"');
    expect(html.match(/class="cer[ "]/g)?.length ?? 0).toBeGreaterThanOrEqual(2 * 100);
    for (const marker of ["kit-btn", "kit-optgroup", "kit-opt--pill", "kit-stepper", "kit-disclosure", "kit-chip", "kit-tablist", "kit-sheet", "kit-menu", "kit-reorder", "kit-detail", "kit-seg", "cchip", "qchip", "wk--full", "wk--dense", "hm", "firec", "die", "backs", "crown", "res"]) {
      expect(html, marker).toContain(marker);
    }
    expect(html).not.toMatch(/\{[A-Za-z]+\}/);
    expect(scannedText(html)).not.toMatch(/\bc\d+\b|\bg\d\b/);
    expect(accessibleText(html).length).toBeGreaterThan(500);
  });

  it("shows no English sample text in Chinese, except headings marked lang=\"en\", and no internal tab ID", () => {
    const html = renderToStaticMarkup(<I18nProvider locale="zh-CN" strict><KitGallery /></I18nProvider>);
    const withoutEnglishHeadings = html.replace(/<(h[1-3])[^>]*lang="en"[^>]*>[\s\S]*?<\/\1>/g, "");
    const text = scannedText(withoutEnglishHeadings);
    for (const english of ["Your workshop", "Shape", "Discard", "Choose exactly", "No Clay", "Decision form fields", "sub-editor", "Board:", "Copy room code", "Leave view", "End session", "Kiln Player Boards", "Return to the bottom", "Seat "]) {
      expect(text, english).not.toContain(english);
    }
    expect(text).not.toMatch(/\bhome\b/);
    expect(text).toContain("你的作坊");
  });

  it("names the selected board tab by its label, not its ID", () => {
    const html = renderToStaticMarkup(<I18nProvider locale="en" strict><KitGallery /></I18nProvider>);
    expect(html).toContain("Your workshop: board");
    expect(html).not.toContain("Board: home");
  });

  it("stands alone without a surrounding provider", () => {
    expect(() => renderToStaticMarkup(<KitGallery />)).not.toThrow();
  });
});
