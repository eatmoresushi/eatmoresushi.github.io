import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTENT_SOURCES,
  PROSE_KEYS,
  PROSE_LIST_KEYS,
  RULES_BEHAVIOUR_REVISION,
  contentDigest,
  contentDigestOf,
  rulesFingerprint,
} from "../../../src/game/rulesFingerprint.ts";

/**
 * The V1.6.2 rules fingerprint (DESIGN §6.9, ENGINE_V1.6.2_DELTA.md §3.6): behaviour revision
 * 30, a content digest of the seven mechanical data files that ignores display prose, and the
 * `r30-<16 hex>` shape the V1.6.2 Supabase gate accepts (DESIGN §4.6). V1.6.1 rooms (`r29`)
 * are refused.
 */

const ROOT = join(import.meta.dirname, "../../..");

type Sources = Array<[string, unknown]>;

function copySources(): Sources {
  return CONTENT_SOURCES.map(([name, data]) => [name, structuredClone(data)] as [string, unknown]);
}

/** The mutable copy of one source file. */
function file(sources: Sources, name: string): Record<string, unknown> {
  const entry = sources.find(([candidate]) => candidate === name);
  if (entry === undefined) throw new Error(`No source ${name}`);
  return entry[1] as Record<string, unknown>;
}

function entries(sources: Sources, name: string, key: string): Array<Record<string, unknown>> {
  return file(sources, name)[key] as Array<Record<string, unknown>>;
}

describe("V1.6.2 rules fingerprint", () => {
  it("is behaviour revision 30", () => {
    expect(RULES_BEHAVIOUR_REVISION).toBe(30);
  });

  it("has the r30-<16 hex> shape the V1.6.2 room gate requires, never a V1.6.1 r29 one", () => {
    expect(rulesFingerprint()).toMatch(/^r30-[0-9a-f]{16}$/);
    expect(rulesFingerprint()).toBe(`r30-${contentDigest()}`);
    expect(rulesFingerprint()).not.toMatch(/^r29-/);
  });

  it("moves with the V1.6.2 location and cost changes (DELTA §3.6)", () => {
    const v161 = copySources();
    const locations = entries(v161, "action_locations", "locations");
    const commission = locations.find((location) => location["id"] === "commission_market")!;
    commission["effects"] = { apprentice: { maxReservations: 1, gainAfterEach: 1 }, shifu: { maxReservations: 2, gainAfterEach: 1, topThreeLooks: 1, lookSize: 3 } };
    expect(contentDigestOf(v161)).not.toBe(contentDigest());
    const costs = copySources();
    entries(costs, "techniques", "advanced").find((tech) => tech["id"] === "T12")!["cost"] = 3;
    expect(contentDigestOf(costs)).not.toBe(contentDigest());
    // The owner's Guild Hall revision (2026-10-17): the first-draft V1.6.2 Shifu discount of 2.
    const discount = copySources();
    entries(discount, "action_locations", "locations").find((location) => location["id"] === "guild_hall")!["effects"] = {
      apprentice: { discount: 0 },
      shifu: { inspectCount: 2, discount: 2 },
    };
    expect(contentDigestOf(discount)).not.toBe(contentDigest());
  });

  it("hashes exactly the seven mechanical data files, in a fixed order", () => {
    expect(CONTENT_SOURCES.map(([name]) => name)).toEqual([
      "action_locations",
      "firing",
      "game_config",
      "imperial_progress",
      "kilns",
      "orders",
      "techniques",
    ]);
    const dataFiles = readdirSync(join(ROOT, "data")).filter((name) => name.endsWith(".json")).map((name) => name.replace(".json", ""));
    const prose = ["asset_specs", "components", "round_structure"];
    expect([...CONTENT_SOURCES.map(([name]) => name), ...prose].sort()).toEqual(dataFiles.sort());
    for (const [name, data] of CONTENT_SOURCES) {
      const onDisk: unknown = JSON.parse(readFileSync(join(ROOT, "data", `${name}.json`), "utf8"));
      expect(data, name).toEqual(onDisk);
    }
  });

  it("is deterministic and independent of object key order", () => {
    expect(contentDigest()).toBe(contentDigest());
    expect(contentDigestOf(copySources())).toBe(contentDigest());
    const reordered = copySources().map(([name, data]) => {
      const reverse = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(reverse);
        if (value === null || typeof value !== "object") return value;
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([key, item]) => [key, reverse(item)]));
      };
      return [name, reverse(data)] as [string, unknown];
    });
    expect(contentDigestOf(reordered)).toBe(contentDigest());
  });

  it("lists the V1.6.1 prose keys, unchanged in V1.6.2", () => {
    for (const key of [
      "name", "nameZh", "ability", "abilityZh", "abilityName", "abilityNameZh",
      "shortText", "shortTextZh", "apprenticeText", "apprenticeTextZh", "shifuText", "shifuTextZh",
      "title", "titleZh", "rewardText", "rewardTextZh", "summary", "summaryZh", "notes", "notesZh",
    ]) {
      expect(PROSE_KEYS.has(key), key).toBe(true);
    }
    expect(PROSE_KEYS.has("requirements")).toBe(false);
    expect(PROSE_KEYS.has("requirementsZh")).toBe(false);
    // D10 clarifications are lists of { en, zh, source } prose records (owner decision D10).
    expect([...PROSE_LIST_KEYS]).toEqual(["clarifications"]);
  });

  it("leaves the D10 clarifications out of the digest", () => {
    const sources = copySources();
    const strip = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(strip);
      if (value === null || typeof value !== "object") return value;
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "clarifications").map(([key, item]) => [key, strip(item)]));
    };
    expect(contentDigestOf(sources.map(([name, data]) => [name, strip(data)] as [string, unknown]))).toBe(contentDigest());
  });

  const proseEdits: Array<[string, (sources: Sources) => void]> = [
    ["a Tech's Chinese name", (s) => { entries(s, "techniques", "advanced")[0]!["nameZh"] = "改名"; }],
    ["a Tech's reminder text", (s) => { entries(s, "techniques", "advanced")[3]!["shortText"] = "Reworded"; }],
    ["a Kiln's full ability", (s) => { entries(s, "kilns", "kilns")[2]!["abilityZh"] = "改写"; }],
    ["a location's Shifu text", (s) => { entries(s, "action_locations", "locations")[0]!["shifuTextZh"] = "改写"; }],
    ["a Recognition reward text", (s) => { entries(s, "imperial_progress", "track")[1]!["rewardText"] = "Reworded."; }],
    ["a Recognition title", (s) => { entries(s, "imperial_progress", "track")[4]!["titleZh"] = "改名"; }],
    ["a Contribution card name", (s) => {
      (file(s, "firing")["contributionCards"] as Array<Record<string, unknown>>)[0]!["nameZh"] = "改名";
    }],
    ["a Tech clarification", (s) => {
      (entries(s, "techniques", "advanced")[5]!["clarifications"] as Array<Record<string, unknown>>)[0]!["en"] = "Reworded.";
    }],
    ["a new Kiln clarification", (s) => {
      (entries(s, "kilns", "kilns")[0]!["clarifications"] as unknown[]).push({ en: "New.", zh: "新。", source: "R4" });
    }],
    ["a location's clarifications removed", (s) => { delete entries(s, "action_locations", "locations")[2]!["clarifications"]; }],
    ["an Order clarification source", (s) => {
      ((file(s, "orders")["clarifications"] as Record<string, Array<Record<string, unknown>>>)["main"]!)[0]!["source"] = "L298";
    }],
    ["a Recognition overflow clarification", (s) => {
      ((file(s, "imperial_progress")["clarifications"] as Record<string, unknown[]>)["imperial_overflow"]!).pop();
    }],
  ];

  it.each(proseEdits)("ignores %s", (_, edit) => {
    const sources = copySources();
    edit(sources);
    expect(contentDigestOf(sources)).toBe(contentDigest());
  });

  const mechanicalEdits: Array<[string, (sources: Sources) => void]> = [
    ["an Order's VP", (s) => { entries(s, "orders", "main")[31]!["vp"] = 13; }],
    ["an Order's requirement text", (s) => { entries(s, "orders", "starting")[12]!["requirementsZh"] = "任意器型 · 任意釉 · 开片"; }],
    ["an Order relation", (s) => {
      entries(s, "orders", "main")[44]!["relations"] = [{ type: "same_decoration", indices: [0, 1, 2] }];
    }],
    ["a Tech cost", (s) => { entries(s, "techniques", "advanced")[17]!["cost"] = 3; }],
    ["a Tech parameter", (s) => { (entries(s, "techniques", "advanced")[13]!["params"] as Record<string, unknown>)["heat"] = 2; }],
    ["a Tech's per-round limit", (s) => { entries(s, "techniques", "advanced")[0]!["oncePerRound"] = false; }],
    ["a location effect object (keyed like V1.4 prose)", (s) => {
      const effects = entries(s, "action_locations", "locations")[0]!["effects"] as Record<string, Record<string, unknown>>;
      effects["apprentice"]!["resources"] = 4;
    }],
    ["a capacity", (s) => {
      (entries(s, "action_locations", "locations")[6]!["capacity"] as Record<string, unknown>)["3"] = 2;
    }],
    ["a Kiln parameter", (s) => { (entries(s, "kilns", "kilns")[3]!["params"] as Record<string, unknown>)["coins"] = 0; }],
    ["the Kiln Die", (s) => { (file(s, "firing")["kilnDie"] as Record<string, unknown>)["faces"] = [2, 2, 2, 2, 2, 2]; }],
    ["the Fire deck", (s) => { (file(s, "firing")["fireDeck"] as number[])[0] = 0; }],
    ["the starting resources", (s) => { (file(s, "game_config")["startingResources"] as Record<string, unknown>)["coins"] = 2; }],
    ["the hand limit", (s) => { (file(s, "game_config")["handLimit"] as Record<string, unknown>)["base"] = 3; }],
    ["an Exhibition value", (s) => {
      ((file(s, "imperial_progress")["exhibition"] as Record<string, Record<string, unknown>>)["qualityVp"]!)["fine"] = 4;
    }],
    ["the Imperial Grant", (s) => {
      (entries(s, "imperial_progress", "track")[1]!["reward"] as Record<string, unknown>)["coins"] = 3;
    }],
    ["a source name", (s) => { s[0]![0] = "locations"; }],
    ["a non-prose value under the clarifications key", (s) => { entries(s, "techniques", "advanced")[0]!["clarifications"] = 3; }],
  ];

  it.each(mechanicalEdits)("changes with %s", (_, edit) => {
    const sources = copySources();
    edit(sources);
    expect(contentDigestOf(sources)).not.toBe(contentDigest());
  });
});
