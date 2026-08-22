import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GAME_CONFIG,
  GLAZES,
  IMPERIAL_ORDERS,
  MARKET_ORDERS,
  TECHNIQUES,
  KILN_SPACE_DEFINITIONS,
  ORDER_DEFINITIONS,
  TECHNIQUE_DEFINITIONS,
  preferredHeat,
} from "../src/game";
import { GAME_CONFIG_GLAZE_HEAT } from "../src/ai/selfplay.ts";

/**
 * Guard against re-declared game content.
 *
 * `src/ai/selfplay.ts` once carried a hand-typed copy of the Glaze table. It still held
 * the pre-V1.1.1 values (grey_green 2, moon_white 3) against the shipped 3 and 4, so every
 * pre-fire alignment figure for those two Glazes was measured a full step off. The engine
 * was never wrong -- it assigns Quality from its own preferredHeat() -- which is exactly
 * why the drift survived: the outputs that would have exposed it stayed correct.
 *
 * The rule these tests enforce is that authoritative content is declared once, in
 * `data/*.json`, reached through `content.ts`, and never re-typed anywhere else.
 */
describe("authoritative content has exactly one source", () => {
  it("derives the AI telemetry Glaze table from content rather than a literal", () => {
    for (const glaze of GLAZES) {
      expect(GAME_CONFIG_GLAZE_HEAT[glaze]).toBe(preferredHeat(glaze));
    }
    expect(Object.keys(GAME_CONFIG_GLAZE_HEAT).sort()).toEqual([...GLAZES].sort());
  });

  it("keeps preferredHeat() and the config file in agreement", () => {
    for (const glaze of GLAZES) {
      expect(preferredHeat(glaze)).toBe(GAME_CONFIG.glazes[glaze]);
    }
  });

  it("keeps kiln zone modifiers in agreement with the config file", () => {
    for (const [spaceId, definition] of Object.entries(KILN_SPACE_DEFINITIONS)) {
      const zone = definition.zone as "high" | "middle" | "low";
      expect(definition.modifier, spaceId).toBe(GAME_CONFIG.kiln.zoneModifier[zone]);
    }
  });

  /**
   * A literal like `moon_white: 4` or `"grey_green", 3` outside the content layer is the
   * signature of a second copy. Comments and test fixtures are allowed to name values --
   * a test asserting M08 is 8 VP is the point of the test -- so only non-comment source
   * lines in the shipped tree are scanned.
   */
  it("declares no Glaze heat literals outside the content layer", () => {
    const allowed = new Set(["src/game/content.ts"]);
    const offenders: string[] = [];
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
    for (const file of walk("src").filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))) {
      const relative = file.replace(/\\/g, "/");
      if (allowed.has(relative)) continue;
      readFileSync(file, "utf8").split("\n").forEach((line, index) => {
        const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
        if (code.trimStart().startsWith("*")) return;
        // `glaze: 3`, `"glaze", 3`, `glaze = 4` -- a Glaze name bound to a bare heat value.
        if (/\b(white|celadon|grey_green|moon_white)\b\s*["']?\s*[:,=]\s*[0-5]\b/.test(code)) {
          offenders.push(`${relative}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders, `re-declared Glaze heat:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("resolves every Order and Technique from the data files", () => {
    // The engine's lookup maps must contain exactly what the JSON declares, so an edit to
    // either side cannot drift without failing here.
    expect(Object.keys(ORDER_DEFINITIONS).length).toBe(MARKET_ORDERS.length + IMPERIAL_ORDERS.length);
    expect(Object.keys(TECHNIQUE_DEFINITIONS).length).toBe(TECHNIQUES.length);
    for (const order of [...MARKET_ORDERS, ...IMPERIAL_ORDERS]) {
      expect(ORDER_DEFINITIONS[order.id], order.id).toBe(order);
    }
    for (const technique of TECHNIQUES) {
      expect(TECHNIQUE_DEFINITIONS[technique.id], technique.id).toBe(technique);
    }
  });
});
