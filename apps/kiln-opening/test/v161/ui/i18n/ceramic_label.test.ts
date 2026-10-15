import { describe, expect, it } from "vitest";
import type { CeramicState } from "../../../../src/game/index.ts";
import { ceramicLabel, ceramicLabelParam, kilnSpaceName } from "../../../../src/app/i18n/ceramicLabel.ts";
import { createTranslator, msg } from "../../../../src/app/i18n/translator.ts";

/** Owner decision D9 / K14: ceramics in words, never by ID. */
const CERAMICS: Record<string, CeramicState> = {
  c4: { id: "c4", ownerId: "p2", vesselInstanceId: "vase-01", shape: "vase", decoration: "carved", formedInRound: 1, formedBy: "form_decorate",
    stage: "finished", glaze: "celadon", firedInRound: 1, crackle: false, quality: "fine" },
  c5: { id: "c5", ownerId: "p1", vesselInstanceId: "bowl-01", shape: "bowl", decoration: "plain", formedInRound: 2, formedBy: "form_decorate", stage: "shaped" },
  c6: { id: "c6", ownerId: "p1", vesselInstanceId: "plate-01", shape: "plate", decoration: "painted", formedInRound: 2, formedBy: "form_decorate",
    stage: "loaded", glaze: "white", loadedInRound: 2, loadedBy: "glaze_load", placement: { kiln: "shared", spaceId: "high_2", stacked: false }, heatMarker: null },
  c7: { id: "c7", ownerId: "p1", vesselInstanceId: "plate-02", shape: "plate", decoration: "painted", formedInRound: 2, formedBy: "form_decorate",
    stage: "loaded", glaze: "white", loadedInRound: 2, loadedBy: "glaze_load", placement: { kiln: "imperial", imperialModifier: 1 }, heatMarker: null },
  c8: { id: "c8", ownerId: "p2", vesselInstanceId: "washer-01", shape: "washer", decoration: "impressed", formedInRound: 1, formedBy: "form_decorate",
    stage: "finished", glaze: "grey_green", firedInRound: 1, crackle: true, quality: "fine" },
};
const VIEW = { viewerId: "p1", game: { players: { p1: { displayName: "Lin" }, p2: { displayName: "Zhao" } }, ceramics: CERAMICS } };

describe("ceramicLabel", () => {
  it("describes a ceramic as the table shows it", () => {
    expect(ceramicLabel("c4", VIEW, { locale: "en" })).toBe("Zhao’s Celadon Vase, Carved · Fine");
    expect(ceramicLabel("c4", VIEW, { locale: "zh-CN" })).toBe("Zhao的青釉瓶 · 刻花 · 上品");
    expect(ceramicLabel("c5", VIEW, { locale: "en" })).toBe("Your Bowl, Plain");
    expect(ceramicLabel("c5", VIEW, { locale: "zh-CN" })).toBe("你的碗 · 素面");
    expect(ceramicLabel("c8", VIEW, { locale: "en" })).toBe("Zhao’s Grey-Green Brush Washer, Impressed · Fine · Crackle");
    expect(ceramicLabel("c8", VIEW, { locale: "zh-CN" })).toBe("Zhao的灰青釉笔洗 · 印花 · 上品 · 开片");
  });

  it("adds the place only when two ceramics would read the same", () => {
    expect(ceramicLabel("c6", VIEW, { locale: "en" })).toBe("Your White Plate, Painted (in High 2)");
    expect(ceramicLabel("c7", VIEW, { locale: "en" })).toBe("Your White Plate, Painted (in the Imperial Kiln)");
    expect(ceramicLabel("c6", VIEW, { locale: "zh-CN" })).toBe("你的白釉盘 · 画花（高温区2）");
    expect(ceramicLabel("c6", VIEW, { locale: "en", withPlace: false })).toBe("Your White Plate, Painted");
    expect(ceramicLabel("c5", VIEW, { locale: "en", withPlace: true })).toBe("Your Bowl, Plain (in your workshop)");
    expect(ceramicLabel("c6", VIEW, { locale: "en", among: [CERAMICS["c6"]!] })).toBe("Your White Plate, Painted");
  });

  it("names the owner only when needed in auto mode", () => {
    expect(ceramicLabel("c4", VIEW, { locale: "en", withOwner: "auto" })).toBe("Celadon Vase, Carved · Fine");
    expect(ceramicLabel("c4", VIEW, { locale: "en", withOwner: false })).toBe("Celadon Vase, Carved · Fine");
  });

  it("never renders an internal ID", () => {
    for (const id of Object.keys(CERAMICS)) {
      for (const locale of ["en", "zh-CN"] as const) {
        expect(ceramicLabel(id, VIEW, { locale, withPlace: true })).not.toMatch(/\bc\d+\b|p\d/);
      }
    }
    expect(ceramicLabel("c99", VIEW, { locale: "en" })).toBe("a ceramic");
    expect(ceramicLabel("c99", VIEW, { locale: "zh-CN" })).toBe("一件器物");
  });

  it("re-renders a stored message in the current language", () => {
    const message = msg("common.ceramic.at", { ceramic: ceramicLabelParam("c4", VIEW, { withPlace: false }), place: "x" });
    expect(createTranslator("en").message(message)).toBe("Zhao’s Celadon Vase, Carved · Fine (x)");
    expect(createTranslator("zh-CN").message(message)).toBe("Zhao的青釉瓶 · 刻花 · 上品（x）");
  });

  it("names kiln spaces in words", () => {
    expect(kilnSpaceName("low_1", "en")).toBe("Low 1");
    expect(kilnSpaceName("middle_3", "zh-CN")).toBe("中温区3");
  });
});
