import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DECORATIONS, GLAZES, SHAPES } from "../../../../src/game/index.ts";
import { CeramicArt } from "../../../../src/app/pieces/CeramicArt.tsx";
import { CERAMIC_CUTOUTS, CRACKLE_OVERLAY } from "../../../../src/app/pieces/art.ts";
import { ROOT } from "../../support/glossary.ts";

/**
 * Ported from test/v14 `ceramic_artwork` (§1.3): 80 glazed + 20 unglazed appearances; a distinct
 * treatment per Glaze in both themes; Crackle overlays the actual finish and never replaces it.
 */
const TOKENS = readFileSync(join(ROOT, "src/app/styles/tokens.css"), "utf8");

function themeBlock(selector: string): string {
  const start = TOKENS.indexOf(`${selector} {`);
  return TOKENS.slice(start, TOKENS.indexOf("}", start));
}

function token(block: string, name: string): string | undefined {
  return new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim();
}

describe("ceramic art", () => {
  it("covers all 80 glazed and 20 unglazed appearances with the right Shape and Decoration cutout", () => {
    const appearances = new Set<string>();
    const sources = new Set<string>();
    for (const shape of SHAPES) {
      for (const decoration of DECORATIONS) {
        const source = CERAMIC_CUTOUTS[shape][decoration];
        const filename = `ceramic-${shape}-${decoration}-v1.webp`;
        expect(source).toContain(filename);
        expect(existsSync(join(ROOT, "assets/current_v04/ceramics", filename)), filename).toBe(true);
        sources.add(source);
        for (const glaze of [...GLAZES, null]) {
          const markup = renderToStaticMarkup(<CeramicArt shape={shape} decoration={decoration} glaze={glaze} />);
          const identity = `${shape}/${glaze ?? "clay"}/${decoration}`;
          expect(markup, identity).toContain(`data-ceramic-art="${shape}-${decoration}"`);
          expect(markup, identity).toContain(`data-glaze="${glaze ?? "clay"}"`);
          expect(markup, identity).toContain(`data-decoration="${decoration}"`);
          expect(markup, identity).toContain(`--glz:var(--glz-${glaze ?? "clay"})`);
          expect(markup, identity).toContain(filename);
          expect(markup, identity).toContain('aria-hidden="true"');
          appearances.add(identity);
        }
      }
    }
    expect(sources.size).toBe(20);
    expect([...appearances].filter((appearance) => appearance.includes("/clay/"))).toHaveLength(20);
    expect([...appearances].filter((appearance) => !appearance.includes("/clay/"))).toHaveLength(80);
  });

  it("gives every Glaze and unglazed clay a distinct tint in each theme", () => {
    for (const selector of ['[data-theme="light"]', '[data-theme="dark"]']) {
      const block = themeBlock(selector);
      const tints = [...GLAZES, "clay"].map((glaze) => token(block, `--glz-${glaze}`));
      expect(tints.every((tint) => tint !== undefined), selector).toBe(true);
      expect(new Set(tints).size, selector).toBe(5);
    }
  });

  it("uses the same cutout whatever the Glaze", () => {
    const markups = [...GLAZES, null].map((glaze) => renderToStaticMarkup(<CeramicArt shape="washer" decoration="impressed" glaze={glaze} />));
    for (const markup of markups) expect(markup).toContain("ceramic-washer-impressed-v1.webp");
    expect(new Set(markups.map((markup) => /--glz:([^;"]+)/.exec(markup)?.[1])).size).toBe(5);
  });

  it("layers Crackle over every glazed appearance without replacing its Glaze or Decoration", () => {
    expect(existsSync(join(ROOT, "assets/current_v04/ceramics/ceramic-crackle-overlay-v1.webp"))).toBe(true);
    for (const shape of SHAPES) {
      for (const decoration of DECORATIONS) {
        for (const glaze of GLAZES) {
          const plain = renderToStaticMarkup(<CeramicArt shape={shape} decoration={decoration} glaze={glaze} />);
          const crackled = renderToStaticMarkup(<CeramicArt shape={shape} decoration={decoration} glaze={glaze} crackle />);
          const identity = `${shape}/${glaze}/${decoration}`;
          expect(crackled, identity).toContain('data-crackle="true"');
          expect(crackled, identity).toContain(`data-ceramic-art="${shape}-${decoration}"`);
          expect(crackled, identity).toContain(`data-glaze="${glaze}"`);
          expect(crackled, identity).toContain(`--glz:var(--glz-${glaze})`);
          expect(crackled, identity).toContain('class="cer-crackle"');
          expect(crackled, identity).toContain(CRACKLE_OVERLAY);
          expect(plain, identity).not.toContain("data-crackle");
          expect(plain, identity).not.toContain("ceramic-crackle-overlay-v1.webp");
        }
      }
    }
  });
});
