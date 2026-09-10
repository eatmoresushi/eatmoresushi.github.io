import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IMPERIAL_PROGRESS, KILN_SPACE_IDS, LOCATION_DEFINITIONS, LOCATION_IDS } from "../../src/game/index.ts";
import { TABLETOP_BOARD_LOCATIONS } from "../../src/ui/TabletopGameExperience.tsx";
import { term } from "../../src/ui/i18n.tsx";

/**
 * What the player reads must be what V1.2.6 calls it.
 *
 * V1.2.6 renamed three locations but kept their ids, and the ids are the only thing the
 * engine uses -- so `market_imperial_office` kept working while four separate hardcoded
 * label maps went on printing "Market & Imperial Office" and two `phaseName` switches
 * printed "Office - Orders". Nothing failed, because no test read a label. The rename is
 * invisible to every rule test the suite has.
 *
 * So this reads the labels: the term table and the board labels must equal the names in
 * `data/action_locations.json`, and no UI string may name a mechanic V1.2.6 dropped.
 */
const UI_DIR = join(import.meta.dirname, "../../src/ui");

/** Terms the V1.2.6 source uses zero times. Value is the name that replaced it. */
const RETIRED_VOCABULARY: Array<[RegExp, string]> = [
  [/Market & Imperial Office|Imperial Office/, "Commission Market"],
  [/\bOffice — /, "Commission Market — "],
  [/\b(?:Office action|Visit the Office|This Office|Office mode)\b/, "Commission Market"],
  [/Imperial Progress/, "Imperial Recognition"],
  [/Court Patronage/, "removed in V1.1.5"],
  [/Sagger Selection/, "removed; V1.2.6 has Protective Saggars"],
  [/Kiln Records/, "removed from the Tech list"],
  [/Refined Clay|Refining House/, "removed"],
  [/Clay Substitution/, "removed from the Tech list"],
  [/Connoisseur Network/, "removed from the Tech list"],
  [/Workshop Seconds/, "V1.2.6 calls it the 2-Coin discard of a still-Flawed ceramic"],
  [/Commission advance/, "Reservation advance"],
  [/Guan Decoration waiver|Guan's waiver/, "removed: Imperial Patronage pays 2 Coins and 1 VP"],
  [/Private Potter|Private Glaze/, "Potter\u2019s Wheel / Glaze & Decoration"],
];

function uiSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return uiSourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** A line that only documents history is evidence, not a label. */
const isComment = (line: string): boolean => /^\s*(\/\/|\/\*|\*)/.test(line);

describe("V1.2.6 user-facing labels", () => {
  it.each(LOCATION_IDS)("names %s exactly as the action-location data does, in both locales", (id) => {
    expect(term("en", id)).toBe(LOCATION_DEFINITIONS[id].name);
    expect(term("zh-CN", id)).toBe(LOCATION_DEFINITIONS[id].nameZh);
  });

  it("places every data-backed action location on the live tabletop", () => {
    expect(TABLETOP_BOARD_LOCATIONS.map(({ id }) => id).sort()).toEqual([...LOCATION_IDS].sort());
  });

  it("draws from the current seven kiln spaces and Recognition 0–4", () => {
    expect(KILN_SPACE_IDS).toHaveLength(7);
    expect(IMPERIAL_PROGRESS.track.map(({ space }) => space)).toEqual([0, 1, 2, 3, 4]);
  });

  it("carries the three V1.2.6 renames through to the player", () => {
    expect(LOCATION_DEFINITIONS.market_imperial_office.name).toBe("Commission Market");
    expect(LOCATION_DEFINITIONS.forming_studio.name).toBe("Potter\u2019s Wheel");
    expect(LOCATION_DEFINITIONS.glaze_workshop.name).toBe("Glaze & Decoration");
  });

  it("names no mechanic V1.2.6 dropped, in any UI string", () => {
    const offences: string[] = [];
    for (const file of uiSourceFiles(UI_DIR)) {
      readFileSync(file, "utf8").split("\n").forEach((line, index) => {
        if (isComment(line)) return;
        for (const [pattern, replacement] of RETIRED_VOCABULARY) {
          const hit = pattern.exec(line);
          if (hit !== null) {
            offences.push(`${file.slice(UI_DIR.length + 1)}:${index + 1} "${hit[0]}" -> ${replacement}`);
          }
        }
      });
    }
    expect(offences).toEqual([]);
  });
});
