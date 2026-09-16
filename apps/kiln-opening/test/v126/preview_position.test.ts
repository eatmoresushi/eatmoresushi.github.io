import { describe, expect, it } from "vitest";
import { previewPosition } from "../../src/ui/previewPosition.ts";

describe("floating preview positioning", () => {
  const desktop = { width: 1_000, height: 800 };

  it("places a centred preview below its anchor when there is enough room", () => {
    expect(previewPosition({ left: 400, right: 500, top: 200, bottom: 240, width: 100 }, desktop)).toEqual({
      left: 450,
      top: 252,
      maxHeight: 536,
      placement: "below",
    });
  });

  it("flips above a low anchor and leaves the viewport gutter clear", () => {
    expect(previewPosition({ left: 400, right: 500, top: 700, bottom: 740, width: 100 }, desktop)).toEqual({
      left: 450,
      top: 688,
      maxHeight: 676,
      placement: "above",
    });
  });

  it("prefers below when 280px are available, even if there is more room above", () => {
    expect(previewPosition({ left: 400, right: 500, top: 430, bottom: 496, width: 100 }, desktop)).toMatchObject({
      top: 508,
      maxHeight: 280,
      placement: "below",
    });
  });

  it("chooses the larger side when neither side has 280px available", () => {
    expect(previewPosition({ left: 400, right: 500, top: 240, bottom: 280, width: 100 }, { width: 1_000, height: 500 })).toMatchObject({
      top: 228,
      maxHeight: 216,
      placement: "above",
    });
  });

  it("clamps a 320px preview inside both horizontal viewport edges", () => {
    expect(previewPosition({ left: 0, right: 60, top: 200, bottom: 240, width: 60 }, desktop)?.left).toBe(172);
    expect(previewPosition({ left: 940, right: 1_000, top: 200, bottom: 240, width: 60 }, desktop)?.left).toBe(828);
  });

  it("uses the available width on a narrow mobile viewport", () => {
    expect(previewPosition({ left: 0, right: 60, top: 50, bottom: 100, width: 60 }, { width: 240, height: 500 })).toEqual({
      left: 120,
      top: 112,
      maxHeight: 376,
      placement: "below",
    });
  });

  it("uses a scrollable viewport-sized fallback instead of hiding on short screens", () => {
    expect(previewPosition({ left: 150, right: 210, top: 120, bottom: 180, width: 60 }, { width: 390, height: 300 })).toEqual({
      left: 180,
      top: 12,
      maxHeight: 276,
      placement: "below",
    });
  });

  it("does not fall back when one side has exactly 180px available", () => {
    expect(previewPosition({ left: 150, right: 210, top: 204, bottom: 244, width: 60 }, { width: 390, height: 400 })).toMatchObject({
      top: 192,
      maxHeight: 180,
      placement: "above",
    });
  });

  it.each([
    { left: 100, right: 160, top: -50, bottom: 11, width: 60 },
    { left: 100, right: 160, top: 789, bottom: 850, width: 60 },
    { left: -50, right: 11, top: 200, bottom: 240, width: 61 },
    { left: 989, right: 1_050, top: 200, bottom: 240, width: 61 },
  ])("hides a preview whose anchor is outside the visible viewport: %o", (anchor) => {
    expect(previewPosition(anchor, desktop)).toBeNull();
  });

  it("keeps a partially visible anchor inspectable", () => {
    expect(previewPosition({ left: 970, right: 1_030, top: 700, bottom: 810, width: 60 }, desktop)).toEqual({
      left: 828,
      top: 688,
      maxHeight: 676,
      placement: "above",
    });
  });
});
