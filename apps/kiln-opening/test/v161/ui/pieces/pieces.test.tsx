import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { DECORATIONS, GLAZES, QUALITIES, SHAPES } from "../../../../src/game/index.ts";
import type { CeramicState, FireModifier, Quality } from "../../../../src/game/index.ts";
import { I18nProvider } from "../../../../src/app/i18n/I18nProvider.tsx";
import type { Locale } from "../../../../src/app/i18n/translator.ts";
import { CardBack } from "../../../../src/app/pieces/CardBack.tsx";
import { CeramicChip } from "../../../../src/app/pieces/CeramicChip.tsx";
import { CrownIcon } from "../../../../src/app/pieces/CrownIcon.tsx";
import { FireCard } from "../../../../src/app/pieces/FireCard.tsx";
import { KilnMasterMarker } from "../../../../src/app/pieces/KilnMasterMarker.tsx";
import { KilnDie } from "../../../../src/app/pieces/KilnDie.tsx";
import { QualityChip } from "../../../../src/app/pieces/QualityChip.tsx";
import { ResourceRow } from "../../../../src/app/pieces/ResourceRow.tsx";
import { WorkerPiece } from "../../../../src/app/pieces/WorkerPiece.tsx";
import { accessibleText, scannedText } from "./a11y_text.ts";

/**
 * §9.2 pieces: every piece has a non-empty accessible name in English and Chinese, the Quality
 * is never colour alone, and no internal ID (ceramic, worker, player) reaches text (D9).
 */
const LOCALES: readonly Locale[] = ["en", "zh-CN"];
const ID_PATTERN = /\bc\d+\b|\bp\d\b|:shifu|:apprentice/;

function render(element: ReactElement, locale: Locale): string {
  return renderToStaticMarkup(<I18nProvider locale={locale} strict>{element}</I18nProvider>);
}

const VIEW = {
  viewerId: "p1",
  game: {
    players: { p1: { displayName: "Lin" }, p2: { displayName: "Zhao" } },
    ceramics: {} as Record<string, CeramicState>,
  },
};

describe("ceramic chips", () => {
  const cases = SHAPES.flatMap((shape) => DECORATIONS.flatMap((decoration) =>
    [...GLAZES, null].map((glaze, index) => ({
      id: `c${index + 10}`,
      ownerId: index % 2 === 0 ? "p1" : "p2",
      shape,
      decoration,
      glaze,
      quality: glaze === null ? null : (QUALITIES[index % QUALITIES.length] ?? null) as Quality | null,
      crackle: glaze !== null && index === 1,
    }))));

  it.each(LOCALES)("every chip has a named, ID-free accessible text (%s)", (locale) => {
    expect(cases).toHaveLength(100);
    for (const ceramic of cases) {
      const markup = render(<CeramicChip ceramic={ceramic} seat={ceramic.ownerId === "p1" ? 0 : 1} view={VIEW} />, locale);
      const text = accessibleText(markup);
      expect(text.length, JSON.stringify(ceramic)).toBeGreaterThan(3);
      expect(scannedText(markup), JSON.stringify(ceramic)).not.toMatch(ID_PATTERN);
      if (ceramic.quality !== null) {
        expect(markup).toContain(`data-quality="${ceramic.quality}"`);
      }
    }
  });

  it("reads like the table: owner, Glaze, Shape, Decoration, Quality, Crackle, Kiln Master marker", () => {
    const ceramic = { id: "c12", ownerId: "p2", shape: "bowl", decoration: "carved", glaze: "celadon", quality: "fine", crackle: true } as const;
    const en = render(<CeramicChip ceramic={ceramic} seat={1} view={VIEW} marker={1} />, "en");
    expect(accessibleText(en)).toBe("Zhao’s Celadon Bowl, Carved · Fine · Crackle, Kiln Master marker +1");
    const zh = render(<CeramicChip ceramic={ceramic} seat={1} view={VIEW} marker={-1} />, "zh-CN");
    expect(accessibleText(zh)).toBe("Zhao的青釉碗 · 刻花 · 上品 · 开片，窑工标−1");
    // Rev. 4 has no Heat marker: without Kiln Master's marker the chip names none.
    expect(accessibleText(render(<CeramicChip ceramic={ceramic} seat={1} view={VIEW} marker={null} />, "en"))).toBe("Zhao’s Celadon Bowl, Carved · Fine · Crackle");
    expect(en).toContain('data-motion="ceramic"');
    expect(en).toContain("--pc:var(--seat-1)");
  });

  it("names a ceramic without a view by its attributes alone", () => {
    const markup = render(<CeramicChip ceramic={{ ownerId: "p9", shape: "censer", decoration: "painted", glaze: null }} seat={2} />, "en");
    expect(accessibleText(markup)).toBe("Censer, Painted");
  });
});

describe("Quality never relies on colour", () => {
  it.each(LOCALES)("shows the word, or the letter with the word kept for assistive technology (%s)", (locale) => {
    for (const quality of QUALITIES) {
      const word = render(<QualityChip quality={quality} />, locale);
      const compact = render(<QualityChip quality={quality} compact />, locale);
      expect(accessibleText(word).length).toBeGreaterThan(0);
      expect(accessibleText(compact)).toBe(accessibleText(word));
      expect(compact).toContain("qchip--compact");
    }
  });
});

describe("markers, cards, die, workers and resources", () => {
  it.each(LOCALES)("have words in %s", (locale) => {
    const texts = [
      render(<KilnMasterMarker value={1} />, locale),
      render(<KilnMasterMarker value={-1} />, locale),
      ...([-2, -1, 0, 1, 2] as FireModifier[]).map((value) => render(<FireCard value={value} />, locale)),
      render(<FireCard value={null} />, locale),
      render(<KilnDie value={2} />, locale),
      render(<KilnDie value={null} />, locale),
      render(<WorkerPiece kind="shifu" seat={0} own />, locale),
      render(<WorkerPiece kind="apprentice" seat={1} ownerName="Zhao" variant="full" />, locale),
      render(<WorkerPiece kind="apprentice" seat={1} ownerName="Zhao" senior />, locale),
      render(<CardBack count={3} />, locale),
      render(<CrownIcon count={2} />, locale),
      render(<ResourceRow resources={{ clay: 2, wood: 1, coins: 3 }} />, locale),
    ];
    for (const markup of texts) {
      expect(accessibleText(markup).length, markup).toBeGreaterThan(0);
      expect(scannedText(markup), markup).not.toMatch(ID_PATTERN);
    }
  });

  it("writes Fire cards and markers with a true minus sign", () => {
    expect(accessibleText(render(<FireCard value={-2} />, "en"))).toBe("Fire card −2");
    expect(accessibleText(render(<FireCard value={2} />, "zh-CN"))).toBe("窑火牌+2");
    expect(accessibleText(render(<KilnMasterMarker value={-1} />, "en"))).toBe("Kiln Master marker −1");
    expect(accessibleText(render(<KilnMasterMarker value={1} />, "zh-CN"))).toBe("窑工标+1");
  });

  it("labels workers in words, never by ID", () => {
    expect(accessibleText(render(<WorkerPiece kind="shifu" seat={0} own />, "en"))).toBe("Your Shifu");
    expect(accessibleText(render(<WorkerPiece kind="apprentice" seat={1} ownerName="Zhao" />, "zh-CN"))).toBe("Zhao的学徒");
    const dense = render(<WorkerPiece kind="shifu" seat={0} own />, "zh-CN");
    expect(dense).toContain(">师<");
  });

  it("shows resources as whole phrases", () => {
    expect(accessibleText(render(<ResourceRow resources={{ clay: 1, wood: 0, coins: 1 }} />, "en"))).toBe("Resources");
    const markup = render(<ResourceRow resources={{ clay: 1, wood: 0, coins: 1 }} />, "en");
    expect(markup).toContain("<strong>1</strong> Coin<");
    expect(render(<ResourceRow resources={{ clay: 2, wood: 0, coins: 3 }} />, "zh-CN")).toContain("<strong>3</strong>铜钱");
  });

  it("names Crowns and face-down cards with counts", () => {
    expect(accessibleText(render(<CrownIcon count={1} />, "en"))).toBe("1 Crown");
    expect(accessibleText(render(<CrownIcon count={2} />, "zh-CN"))).toBe("2个御令");
    expect(accessibleText(render(<CardBack count={3} />, "en"))).toBe("3 cards, face down");
  });
});

describe("motion hooks (§8.4)", () => {
  it("every data-motion element can carry a data-motion-key, as an attribute only", () => {
    const cases: Array<[ReactElement, string, string]> = [
      [<WorkerPiece kind="shifu" seat={0} own motionKey="p1:shifu" />, "worker", "p1:shifu"],
      [<WorkerPiece kind="apprentice" seat={0} own variant="full" motionKey="p1:apprentice:2" />, "worker", "p1:apprentice:2"],
      [<QualityChip quality="fine" motionKey="quality:c4" />, "quality", "quality:c4"],
      [<FireCard value={1} motionKey="fire:0" />, "fire", "fire:0"],
      [<KilnDie value={2} motionKey="die" />, "die", "die"],
      [<KilnMasterMarker value={1} motionKey="marker:c4" />, "marker", "marker:c4"],
    ];
    for (const [element, motion, key] of cases) {
      const markup = render(element, "en");
      expect(markup, markup).toContain(`data-motion="${motion}"`);
      expect(markup, markup).toContain(`data-motion-key="${key}"`);
      // D9: the key never reaches text or a name.
      expect(scannedText(markup).replace(/data-motion-key="[^"]*"/g, ""), markup).not.toContain(key);
      expect(accessibleText(markup)).not.toContain(key);
    }
  });

  it("the Kiln Die defaults to the key \"die\" (one die on the table)", () => {
    expect(render(<KilnDie value={null} />, "en")).toContain('data-motion-key="die"');
  });

  it("a ceramic chip keys its marker and Quality badges from its own key", () => {
    const ceramic = { id: "c12", ownerId: "p2", shape: "bowl", decoration: "carved", glaze: "celadon", quality: "fine", crackle: false } as const;
    const markup = render(<CeramicChip ceramic={ceramic} seat={1} view={VIEW} marker={1} />, "en");
    expect(markup).toContain('data-motion-key="c12"');
    expect(markup).toContain('data-motion-key="marker:c12"');
    expect(markup).toContain('data-motion-key="quality:c12"');
    expect(accessibleText(markup)).not.toMatch(ID_PATTERN);
  });
});
