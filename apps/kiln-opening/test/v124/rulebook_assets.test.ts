import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../../src/game/index.ts";

/**
 * The site must not publish a rulebook for a superseded ruleset.
 *
 * The earlier version of this guard named two v1.0.4 PDFs explicitly, so it went on passing
 * through v1.0.9, v1.1.4, v1.1.6 and v1.2.4 without ever asking about the rulebooks those
 * versions could have left behind. A player who downloads the wrong PDF is playing a
 * different game from the server, and nothing in the build would say so. This asks the
 * general question instead: anything published here must name the shipped rules version.
 */
const RULEBOOK_DIR = "public/rulebooks";

describe("published rulebooks match the shipped ruleset", () => {
  it(`publishes no rulebook that is not V${GAME_CONFIG.rulesVersion}`, () => {
    let entries: string[];
    try {
      entries = readdirSync(RULEBOOK_DIR);
    } catch {
      return; // No directory at all is trivially correct.
    }
    const version = GAME_CONFIG.rulesVersion as string;
    const stale = entries
      .filter((name) => /\.pdf$/i.test(name))
      .filter((name) => !name.includes(version));
    expect(stale, `superseded rulebooks published: ${stale.join(", ")}`).toEqual([]);
  });
});
