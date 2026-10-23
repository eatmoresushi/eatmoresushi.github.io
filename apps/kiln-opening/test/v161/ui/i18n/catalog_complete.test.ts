import { describe, expect, it } from "vitest";
import { CATALOG } from "../../../../src/app/i18n/index.ts";
import { templatePlaceholders } from "../../../../src/app/i18n/richText.tsx";
import { catalogEntries } from "./catalog_support.ts";

/** §6.4 `catalog_complete`: every key has non-empty EN and ZH; placeholder sets match. */
describe("i18n catalogue completeness", () => {
  const entries = catalogEntries();

  it("has the A3 namespaces filled and every package namespace present", () => {
    expect(Object.keys(CATALOG).sort()).toEqual(
      ["boards", "common", "firing", "kiln", "lobby", "locationSummary", "mp", "orders", "playtest", "results", "rules", "shell", "table", "work"].sort(),
    );
    expect(entries.filter((entry) => entry.namespace === "common").length).toBeGreaterThan(50);
    expect(entries.filter((entry) => entry.namespace === "locationSummary")).toHaveLength(14);
  });

  it.each(entries.map((entry) => [entry.id, entry] as const))("%s has English and Chinese text", (_, entry) => {
    for (const en of entry.en) expect(en.trim(), entry.id).not.toBe("");
    expect(entry.zh.trim(), entry.id).not.toBe("");
  });

  it.each(entries.map((entry) => [entry.id, entry] as const))("%s uses the same placeholders in both languages", (_, entry) => {
    const en = new Set(entry.en.flatMap((form) => templatePlaceholders(form)));
    if (entry.plural) en.add("n");
    const zh = new Set(templatePlaceholders(entry.zh));
    // A Chinese plural entry still receives `n`; it may leave it out only if English does too.
    if (entry.plural && !zh.has("n") && !entry.en.some((form) => form.includes("{n}"))) zh.add("n");
    expect([...zh].sort(), entry.id).toEqual([...en].sort());
  });

  it("chooses plural forms on {n}", () => {
    for (const entry of entries.filter((candidate) => candidate.plural)) {
      expect(entry.en.every((form) => form.includes("{n}")), entry.id).toBe(true);
    }
  });
});
