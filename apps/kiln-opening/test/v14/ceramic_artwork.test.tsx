import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DECORATIONS, GLAZES, SHAPES } from "../../src/game";
import { CERAMIC_ARTWORK, CeramicArtwork } from "../../src/ui/CeramicArtwork";

describe("generated ceramic artwork", () => {
  it("covers all 80 glazed and 20 unglazed appearances with the correct Shape and Decoration artwork", () => {
    const appearances = new Set<string>();
    const sources = new Set<string>();
    for (const shape of SHAPES) {
      for (const decoration of DECORATIONS) {
        const source = CERAMIC_ARTWORK[shape][decoration];
        const filename = `ceramic-${shape}-${decoration}-v1.webp`;
        expect(source).toContain(filename);
        expect(existsSync(new URL(`../../assets/current_v04/ceramics/${filename}`, import.meta.url)), filename).toBe(true);
        sources.add(source);
        for (const glaze of [...GLAZES, null]) {
          const markup = renderToStaticMarkup(createElement(CeramicArtwork, { shape, glaze, decoration }));
          const identity = `${shape}/${glaze ?? "raw"}/${decoration}`;
          expect(markup, identity).toContain(`data-ceramic-art="${shape}-${decoration}"`);
          expect(markup, identity).toContain(`data-glaze="${glaze ?? "raw"}"`);
          expect(markup, identity).toContain(`data-decoration="${decoration}"`);
          expect(markup, identity).toContain(`href="${source}"`);
          expect(markup, identity).toContain('aria-hidden="true"');
          appearances.add(identity);
        }
      }
    }
    expect(sources.size).toBe(20);
    expect([...appearances].filter((appearance) => appearance.includes("/raw/"))).toHaveLength(20);
    expect([...appearances].filter((appearance) => !appearance.includes("/raw/"))).toHaveLength(80);
  });

  it("keeps filter references independent when the same ceramic appears on the board and in an inspection", () => {
    const appearance = { shape: "bowl", glaze: "celadon", decoration: "carved" } as const;
    const markup = renderToStaticMarkup(createElement("div", null,
      createElement(CeramicArtwork, appearance),
      createElement(CeramicArtwork, appearance),
    ));
    const ids = [...markup.matchAll(/<filter\b[^>]*\bid="([^"]+)"/gu)].map((match) => match[1]!);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(markup).toContain(`filter="url(#${id})"`);
  });

  it("gives every Glaze and unglazed clay a distinct appearance without changing its Decoration artwork", () => {
    const treatments = new Set<string>();
    for (const glaze of [...GLAZES, null]) {
      const markup = renderToStaticMarkup(createElement(CeramicArtwork, {
        shape: "washer", glaze, decoration: "impressed",
      }));
      expect(markup).toContain(`href="${CERAMIC_ARTWORK.washer.impressed}"`);
      const treatment = markup.match(/<feColorMatrix\b[^>]*values="([^"]+)"/u)?.[1];
      expect(treatment).toBeDefined();
      treatments.add(treatment!);
    }
    expect(treatments.size).toBe(5);
  });

  it("renders missing historical decoration as Plain without inventing a glaze", () => {
    const markup = renderToStaticMarkup(createElement(CeramicArtwork, {
      shape: "vase", glaze: null, decoration: null,
    }));
    expect(markup).toContain('data-ceramic-art="vase-plain"');
    expect(markup).toContain('data-decoration="plain"');
    expect(markup).toContain('data-glaze="raw"');
    expect(markup).toContain(`href="${CERAMIC_ARTWORK.vase.plain}"`);
  });

  it("layers Ge Crackle over every glazed appearance without replacing its actual Glaze or Decoration", () => {
    expect(existsSync(new URL("../../assets/current_v04/ceramics/ceramic-crackle-overlay-v1.webp", import.meta.url))).toBe(true);
    for (const shape of SHAPES) {
      for (const decoration of DECORATIONS) {
        for (const glaze of GLAZES) {
          const appearance = { shape, glaze, decoration };
          const plain = renderToStaticMarkup(createElement(CeramicArtwork, appearance));
          const crackled = renderToStaticMarkup(createElement(CeramicArtwork, { ...appearance, crackle: true }));
          const identity = `${shape}/${glaze}/${decoration}`;
          expect(crackled, identity).toContain('data-crackle="true"');
          expect(crackled, identity).toContain(`data-ceramic-art="${shape}-${decoration}"`);
          expect(crackled, identity).toContain(`data-glaze="${glaze}"`);
          expect(crackled, identity).toContain(`data-decoration="${decoration}"`);
          expect(crackled.match(/<feColorMatrix\b[^>]*values="([^"]+)"/u)?.[1], identity)
            .toBe(plain.match(/<feColorMatrix\b[^>]*values="([^"]+)"/u)?.[1]);

          const mask = crackled.match(/<mask\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/mask>/u);
          expect(mask, identity).not.toBeNull();
          expect(mask![0], identity).toMatch(/mask-type[=:]"?alpha/u);
          expect(mask![2], identity).toContain(`href="${CERAMIC_ARTWORK[shape][decoration]}"`);
          const overlay = crackled.match(/<g\b[^>]*class="kiln-ceramic-crackle-overlay"[^>]*>[\s\S]*?<\/g>/u)?.[0];
          expect(overlay, identity).toBeDefined();
          expect(overlay, identity).toContain(`mask="url(#${mask![1]})"`);
          expect(overlay, identity).toMatch(/<image\b[^>]*href="[^"]*ceramic-crackle-overlay-v1\.webp"/u);
          expect(plain, identity).not.toContain('data-crackle="true"');
          expect(plain, identity).not.toContain("ceramic-crackle-overlay-v1.webp");
          expect(plain, identity).not.toContain("<mask");
        }
      }
    }
  });

  it("isolates Crackle alpha masks when a ceramic is shown more than once", () => {
    const appearance = { shape: "censer", glaze: "moon_white", decoration: "painted", crackle: true } as const;
    const markup = renderToStaticMarkup(createElement("div", null,
      createElement(CeramicArtwork, appearance),
      createElement(CeramicArtwork, appearance),
    ));
    const masks = [...markup.matchAll(/<mask\b[^>]*\bid="([^"]+)"/gu)].map((match) => match[1]!);
    expect(masks).toHaveLength(2);
    expect(new Set(masks).size).toBe(2);
    for (const id of masks) expect(markup.match(new RegExp(`mask="url\\(#${id}\\)"`, "gu"))).toHaveLength(1);
    expect([...markup.matchAll(/ceramic-crackle-overlay-v1\.webp/gu)]).toHaveLength(2);
  });
});
