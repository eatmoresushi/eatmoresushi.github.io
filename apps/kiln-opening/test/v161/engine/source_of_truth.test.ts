import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CENTRAL_LOCATION_IDS,
  FIRING,
  KILN_IDS,
  KILN_SPACE_IDS,
  MAIN_ORDER_IDS,
  STARTING_ORDER_IDS,
  TECH_IDS,
  zoneOf,
} from "../../../src/game/content.ts";
import type { TechId } from "../../../src/game/types.ts";

/**
 * Successor of the V1.2.7/V1.4 `source_of_truth` and `rulebook_assets` suites (DESIGN §8.2):
 * the checked-in V1.6.1 rulebook is the one the audit fingerprinted, AGENTS.md and GAME_RULES.md
 * point at it, and every data file — the asset contract included — uses only current IDs.
 */

const ROOT = join(import.meta.dirname, "../../..");
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const SOURCE_PATH = "docs/KILN_OPENING_v1.6.1_EN_SOURCE.md";
const AUDIT = read("docs/RULEBOOK_AUDIT_V1.6.1.md");
const AGENTS = read("AGENTS.md");
const GAME_RULES = read("docs/GAME_RULES.md");
const DATA_FILES = readdirSync(join(ROOT, "data")).filter((name) => name.endsWith(".json")).sort();

interface AssetSpecs {
  rulesVersion: string;
  policy: { rulesTextInRasters: boolean; approvedReferenceDirectory: string };
  centralBoard: { locations: string[] };
  sharedKilnBoard: { spaces: Record<"high" | "middle" | "low", number>; activeByPlayerCount: Record<"2" | "3" | "4", string> };
  kilnPlayerBoards: {
    boards: string[];
    eachBoardShows: {
      personalLocations: Array<{ id: string; spaces: number; lockedAtStart: number; unlockedBy: string }>;
      lockTokensPerBoard: number;
      techSlots: number;
      imperialKilnArea: boolean;
    };
  };
  orderCards: { total: number; starting: number; main: number };
  techTiles: {
    total: number;
    art: Record<string, { status: "REUSE" | "MISSING"; file?: string; subject: string; brief?: string }>;
    reusedArt: string[];
    missingArt: string[];
  };
  kilnDie: { faces: number[] };
  markers: Record<string, { qty?: number; faces?: number[] }>;
  fireCards: { distribution: Record<string, number>; totalCards: number };
  kilnContributionCards: { cardsPerSet: string[]; totalCards: number };
}

const ASSETS = JSON.parse(read("data/asset_specs.json")) as AssetSpecs;

describe("the V1.6.1 rulebook is the source of truth", () => {
  it("matches the checksum the audit records (owner amendments A1 and A2, owner wording edits of 2026-10-16)", () => {
    const recorded = /SHA-256: `([0-9a-f]{64})`/.exec(AUDIT)?.[1];
    expect(recorded).toBe("49bd80ced9cc194938e4b8bbd422a1c9e02439facfb477f6325a42f31c2d1372");
    const actual = createHash("sha256").update(readFileSync(join(ROOT, SOURCE_PATH))).digest("hex");
    expect(actual).toBe(recorded);
  });

  it("is named first in AGENTS.md, with the audit second", () => {
    const sources = AGENTS.split("## Sources of truth")[1]?.split("\n## ")[0] ?? "";
    const numbered = sources.split("\n").filter((line) => /^\d+\. /.test(line));
    expect(numbered[0]).toContain("`docs/KILN_OPENING_v1.6.1_EN_SOURCE.md`");
    expect(numbered[0]).toContain("**only** mechanical source of truth");
    expect(numbered[1]).toContain("`docs/RULEBOOK_AUDIT_V1.6.1.md`");
    expect(sources).toContain("`docs/GLOSSARY_ZH_V1.6.1.md`");
    expect(sources).not.toMatch(/^1\. .*v1\.4/m);
    expect(AGENTS).toContain("V1.6.1 is a rework of V1.2.7 and supersedes V1.4");
  });

  it("is the index entry of GAME_RULES.md", () => {
    expect(GAME_RULES.split("\n")[0]).toContain("V1.6.1");
    expect(GAME_RULES).toContain("(./KILN_OPENING_v1.6.1_EN_SOURCE.md) is the only mechanical authority");
    expect(GAME_RULES).toContain("(./RULEBOOK_AUDIT_V1.6.1.md)");
    expect(GAME_RULES).toContain("(./GLOSSARY_ZH_V1.6.1.md)");
  });

  it("has a checked-in Chinese edition, derived from it and deferring to it", () => {
    // Byte-identical copy of the owner's Chinese rulebook (as revised by the owner on 2026-10-16),
    // matching the English rulebook. It is the source of every Tech and Kiln `abilityZh`; the
    // English rulebook remains the only mechanical authority.
    const zh = readFileSync(join(ROOT, "docs/KILN_OPENING_v1.6.1_ZH.md"));
    expect(createHash("sha256").update(zh).digest("hex")).toBe("212cd84bc71e0bfe8d13d71dc2d5c0f13db745e11e9f9cf6604a3d0560c754e2");
    expect(zh.toString("utf8")).toContain("规则如有出入，以英文版规则书为准");
  });

  it("calls itself v1.6.1, the engine's rules version", () => {
    expect(read(SOURCE_PATH).split("\n")[0]).toContain("v1.6.1");
    expect(AUDIT).toContain("the engine uses the rules version string `1.6.1`");
  });
});

describe("every data file is V1.6.1 content with current IDs only", () => {
  it("has the ten data files, each stamped 1.6.1", () => {
    expect(DATA_FILES).toEqual([
      "action_locations.json", "asset_specs.json", "components.json", "firing.json", "game_config.json",
      "imperial_progress.json", "kilns.json", "orders.json", "round_structure.json", "techniques.json",
    ]);
    for (const file of DATA_FILES) {
      expect((JSON.parse(read(`data/${file}`)) as { rulesVersion?: string }).rulesVersion, file).toBe("1.6.1");
    }
  });

  /** Retired IDs and mechanics (audit "Stable IDs"; AGENTS "Explicitly obsolete mechanics"). */
  const RETIRED: ReadonlyArray<[RegExp, string]> = [
    [/\bT0[234]\b/, "retired Forming Tech ID"],
    [/\bT0[6-9]\b/, "retired Glazing Tech ID"],
    [/\bST0[1-4]\b/, "retired Starting Tech ID"],
    [/Kiln Yard|kiln_yard/, "Kiln Yard"],
    [/Glaze Palette/, "Glaze Palette"],
    [/Potter['’]s Wheel|forming_studio/, "Potter's Wheel"],
    [/Decoration Workshop|glaze_workshop/, "Decoration Workshop"],
    [/Craft Academy|guild_academy/, "Craft Academy (now Guild Hall)"],
    [/Paid Work|\blabour\b/, "Paid Work (now Canal Wharf)"],
    [/Imperial Court|court_patronage|Court Patronage/, "Imperial Court (now Magistrate's Hall)"],
    [/market_imperial_office|Imperial Office/, "Office"],
    [/Refined Clay|Refining House/, "Refined Clay"],
    [/Dipping Vats|Measuring Calipers|White Slip|Drying Frames|Standardised Moulds|Rapid Drying/, "retired V1.4 Tech"],
    [/Starting Tech/, "Starting Techs"],
    [/BANK_2|STOKE_2/, "Fuel Ledger cards"],
    [/"crackle"/, "Crackle as a Decoration value"],
    [/overfill(?! space is drawn)/i, "Shifu overfill"],
  ];

  it.each(DATA_FILES)("%s names no retired ID or mechanic", (file) => {
    // Legacy art file names under the approved directory are stable paths, not IDs.
    const text = read(`data/${file}`).replace(/assets\/current_v04\/[\w./-]+/g, "<asset>");
    const offences = RETIRED.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
    expect(offences).toEqual([]);
  });

  it("never mentions Crackle as an Order Decoration", () => {
    // The Order cards themselves; the D10 clarifications prose explains Crackle wildcards.
    const orders = JSON.parse(read("data/orders.json")) as { starting: unknown[]; main: unknown[] };
    expect(JSON.stringify([...orders.starting, ...orders.main])).not.toMatch(/Crackle|开片/);
  });
});

describe("the V1.6.1 asset contract (data/asset_specs.json)", () => {
  it("puts no rules text in rasters and uses only the approved reference directory", () => {
    expect(ASSETS.policy.rulesTextInRasters).toBe(false);
    expect(ASSETS.policy.approvedReferenceDirectory).toBe("assets/current_v04");
    const paths = [...read("data/asset_specs.json").matchAll(/"(assets\/[^"]+)"/g)].map((match) => match[1] ?? "");
    for (const path of paths) {
      expect(path.startsWith("assets/current_v04") || path === "assets/obsolete_v061", path).toBe(true);
      if (/\.(webp|png)$/.test(path)) expect(existsSync(join(ROOT, path)), path).toBe(true);
    }
  });

  it("draws the five central locations and the Imperial Recognition track", () => {
    expect(ASSETS.centralBoard.locations).toEqual([...CENTRAL_LOCATION_IDS]);
  });

  it("draws a 3/3/2 Shared Kiln covered 2-1-1 / 2-2-2 / 3-3-2", () => {
    const counts = { high: 0, middle: 0, low: 0 };
    for (const id of KILN_SPACE_IDS) counts[zoneOf(id)] += 1;
    expect(ASSETS.sharedKilnBoard.spaces).toEqual(counts);
    expect(ASSETS.sharedKilnBoard.activeByPlayerCount).toEqual({ 2: "2-1-1", 3: "2-2-2", 4: "3-3-2" });
  });

  it("draws five Kiln Player Boards with locked personal spaces, 3 Tech slots and an Imperial Kiln area", () => {
    expect(ASSETS.kilnPlayerBoards.boards).toEqual([...KILN_IDS]);
    const shows = ASSETS.kilnPlayerBoards.eachBoardShows;
    expect(shows.personalLocations).toEqual([
      { id: "form_decorate", spaces: 2, lockedAtStart: 1, unlockedBy: "workshop" },
      { id: "glaze_load", spaces: 2, lockedAtStart: 1, unlockedBy: "glazing_loading" },
    ]);
    expect(shows.lockTokensPerBoard).toBe(2);
    expect(shows.techSlots).toBe(3);
    expect(shows.imperialKilnArea).toBe(true);
  });

  it("specifies the Kiln Die, markers, Fire deck and Contribution cards from the firing data", () => {
    expect(ASSETS.kilnDie.faces).toEqual(FIRING.kilnDie.faces);
    expect(ASSETS.markers["heatMarkers"]).toMatchObject({ qty: 4, faces: [1, -1] });
    expect(ASSETS.markers["kilnMasterMarker"]).toMatchObject({ qty: 1, faces: [1, -1] });
    expect(ASSETS.markers["crackleMarkers"]).toMatchObject({ qty: 8 });
    expect(ASSETS.markers["lockTokens"]).toMatchObject({ qty: 8 });
    const distribution = Object.fromEntries([-2, -1, 0, 1, 2].map((m) => [String(m), FIRING.fireDeck.filter((card) => card === m).length]));
    expect(ASSETS.fireCards.distribution).toEqual(distribution);
    expect(ASSETS.fireCards.totalCards).toBe(FIRING.fireDeck.length);
    expect(ASSETS.kilnContributionCards.cardsPerSet).toEqual(FIRING.contributionCards.map((card) => card.id));
    expect(ASSETS.kilnContributionCards.totalCards).toBe(12);
  });

  it("covers all 64 Orders", () => {
    expect(ASSETS.orderCards).toMatchObject({
      starting: STARTING_ORDER_IDS.length,
      main: MAIN_ORDER_IDS.length,
      total: STARTING_ORDER_IDS.length + MAIN_ORDER_IDS.length,
    });
  });

  it("maps all 18 Tech tiles: existing art reused where it carries the same idea, the 8 missing listed", () => {
    const art = ASSETS.techTiles.art;
    expect(ASSETS.techTiles.total).toBe(18);
    expect(Object.keys(art).sort()).toEqual([...TECH_IDS].sort());
    const reused = TECH_IDS.filter((id) => art[id]?.status === "REUSE");
    const missing = TECH_IDS.filter((id) => art[id]?.status === "MISSING");
    expect(reused).toEqual(ASSETS.techTiles.reusedArt);
    expect(missing).toEqual(ASSETS.techTiles.missingArt);
    expect(missing).toEqual(["T16", "T18", "T19", "T21", "T22", "T23", "T24", "T25"] satisfies TechId[]);
    for (const id of reused) expect(existsSync(join(ROOT, art[id]?.file ?? "missing")), id).toBe(true);
    for (const id of missing) expect(art[id]?.brief?.length ?? 0, id).toBeGreaterThan(20);
  });
});
