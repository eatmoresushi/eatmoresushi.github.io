/**
 * The UI fixture loader (UI_V1.6.1_ARCHITECTURE §9.1, §9.2). Created by A2; owned by B6 after
 * phase A.
 *
 * Reads A1's generated `test/v161/ui/fixtures/{scenarios,moments,secrets}.json` with
 * `readFileSync` (never imported by `src/app`), once per test process.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FixtureEntry, FixtureSourceOptions } from "../../../../src/app/session/fixtureSource.ts";
import { FixtureGameSource } from "../../../../src/app/session/fixtureSource.ts";

const DIR = join(import.meta.dirname, "../fixtures");

export interface UiFixture extends FixtureEntry {
  id: string;
  kind?: string;
  name?: string;
  title?: string;
  description?: string;
  viewerActs?: boolean;
  /** Which file it came from. */
  file: "scenarios" | "moments";
}

function load(file: "scenarios" | "moments"): UiFixture[] {
  const parsed = JSON.parse(readFileSync(join(DIR, `${file}.json`), "utf8")) as { entries: FixtureEntry[] };
  return parsed.entries.map((entry) => ({ ...entry, file }));
}

let cache: { scenarios: UiFixture[]; moments: UiFixture[] } | null = null;

function all(): { scenarios: UiFixture[]; moments: UiFixture[] } {
  cache ??= { scenarios: load("scenarios"), moments: load("moments") };
  return cache;
}

/** Every scripted scenario (`w-*` windows, `t-*` table states). */
export function scenarios(): readonly UiFixture[] {
  return all().scenarios;
}

/** Every played moment (`m1` … `m18`). */
export function moments(): readonly UiFixture[] {
  return all().moments;
}

/** Scenarios, then moments. */
export function allFixtures(): readonly UiFixture[] {
  return [...scenarios(), ...moments()];
}

export function fixture(id: string): UiFixture {
  const found = allFixtures().find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`No UI fixture "${id}"`);
  return found;
}

/** A read-only source over one fixture (a fresh copy, so tests never share state). */
export function fixtureSource(id: string, options: FixtureSourceOptions = {}): FixtureGameSource {
  return new FixtureGameSource(structuredClone(fixture(id)), options);
}

/** The Order and Tech IDs one fixture's viewer must never see (`secrets.json`). */
export function secretIds(id: string): readonly string[] {
  const parsed = JSON.parse(readFileSync(join(DIR, "secrets.json"), "utf8")) as Record<string, unknown>;
  const entries = (parsed["entries"] ?? parsed) as Record<string, unknown>;
  const value = entries[id];
  if (Array.isArray(value)) return value.map(String);
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((ids) => (Array.isArray(ids) ? ids.map(String) : []));
  }
  return [];
}
