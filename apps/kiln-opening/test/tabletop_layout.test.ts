import { describe, expect, it } from "vitest";
import { KILN_SPACE_IDS, LOCATION_IDS } from "../src/game";
import { orderSprite, techniqueSprite } from "../src/ui/tabletop/assetCatalog";
import { ACTION_ZONE_RECTS, IMPERIAL_TRACK_POINTS, KILN_SLOT_POINTS } from "../src/ui/tabletop/centralBoardLayout";

describe("tabletop presentation configuration", () => {
  it("provides normalized hotspots for every authoritative action location", () => {
    expect(Object.keys(ACTION_ZONE_RECTS).sort()).toEqual([...LOCATION_IDS].sort());
    for (const rect of Object.values(ACTION_ZONE_RECTS)) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(1);
      expect(rect.y + rect.height).toBeLessThanOrEqual(1);
    }
  });

  it("provides a visual slot for all eight kiln spaces and all six Imperial spaces", () => {
    expect(Object.keys(KILN_SLOT_POINTS)).toEqual(KILN_SPACE_IDS);
    expect(IMPERIAL_TRACK_POINTS).toHaveLength(6);
  });

  it("maps retained art to stable atlas cells and uses live-data fallbacks for V1 additions", () => {
    expect(orderSprite("M01")).toMatchObject({ columns: 4, rows: 5, column: 0, row: 0 });
    expect(orderSprite("M20")).toMatchObject({ columns: 4, rows: 5, column: 3, row: 4 });
    expect(orderSprite("I01")).toMatchObject({ columns: 5, rows: 2, column: 0, row: 0 });
    expect(orderSprite("I10")).toMatchObject({ columns: 5, rows: 2, column: 4, row: 1 });
    expect(techniqueSprite("T12")).toMatchObject({ columns: 4, rows: 3, column: 3, row: 2 });
    expect(orderSprite("M21")).toBeNull();
    expect(orderSprite("I13")).toBeNull();
    expect(techniqueSprite("T13")).toBeNull();
  });
});
