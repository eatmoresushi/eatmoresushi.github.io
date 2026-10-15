/**
 * tsc silently skips an `include` entry that matches no file, so a renamed or deleted file
 * would quietly drop out of a typecheck gate (UI plan §3.9, §10.4 C2.2). This suite fails
 * instead:
 * - every `include` entry of every `tsconfig*.json` matches at least one file;
 * - every `files` entry exists;
 * - every `tools/` module that `vite.config.ts` imports exists and is type-checked by
 *   `tsconfig.platform.json` (the V1.4 backend, which imports `src/multiplayer-v14`, is
 *   exempt until cutover deletes it);
 * - `tsconfig.platform.json` lists the three V1.6.1 tools of §3.9 by name;
 * - `vite.config.ts` builds `next/index.html` and `next/playtest.html` unconditionally (§10.1),
 *   never `next/gallery.html`, and both pages exist.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "output"]);

/** Every file under ROOT (relative, `/`-separated), skipping build output and dependencies. */
function allFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(relative(ROOT, path).split("\\").join("/"));
    }
  };
  walk(ROOT);
  return files;
}

/** tsconfig glob semantics: `**` any directories, `*` within a segment, `?` one character. */
function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/^\.\//, "");
  let source = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index] ?? "";
    if (char === "*" && normalized[index + 1] === "*") {
      const slash = normalized[index + 2] === "/";
      source += slash ? "(?:.*/)?" : ".*";
      index += slash ? 2 : 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  // A bare directory include means everything under it.
  const isDirectory = !/[*?]/.test(normalized) && existsSync(join(ROOT, normalized)) && statSync(join(ROOT, normalized)).isDirectory();
  return new RegExp(isDirectory ? `^${source}/.+$` : `^${source}$`);
}

interface TsConfig {
  include?: string[];
  files?: string[];
}

const files = allFiles();
const tsconfigs = readdirSync(ROOT).filter((name) => /^tsconfig.*\.json$/.test(name));

function readConfig(name: string): TsConfig {
  return JSON.parse(readFileSync(join(ROOT, name), "utf8")) as TsConfig;
}

describe("tsconfig include entries", () => {
  it("finds the project's tsconfig files", () => {
    expect(tsconfigs).toEqual(expect.arrayContaining(["tsconfig.json", "tsconfig.platform.json", "tsconfig.engine.json"]));
  });

  for (const name of tsconfigs) {
    const config = readConfig(name);
    for (const pattern of config.include ?? []) {
      it(`${name}: "${pattern}" matches at least one file`, () => {
        const matcher = globToRegExp(pattern);
        expect(files.some((file) => matcher.test(file)), `${name} include "${pattern}" matches no file`).toBe(true);
      });
    }
    for (const file of config.files ?? []) {
      it(`${name}: file "${file}" exists`, () => {
        expect(existsSync(join(ROOT, file))).toBe(true);
      });
    }
  }

  it("matches globs the way tsc does", () => {
    expect(globToRegExp("src/**/*.ts").test("src/a.ts")).toBe(true);
    expect(globToRegExp("src/**/*.ts").test("src/a/b/c.ts")).toBe(true);
    expect(globToRegExp("src/**/*.ts").test("src/a.tsx")).toBe(false);
    expect(globToRegExp("tools/x.ts").test("tools/x.ts")).toBe(true);
    expect(globToRegExp("tools/x.ts").test("tools/x.tsx")).toBe(false);
    expect(globToRegExp("e2e/**/*.ts").test("e2e/support/localBackend.ts")).toBe(true);
  });
});

describe("vite.config.ts tool imports", () => {
  const vite = readFileSync(join(ROOT, "vite.config.ts"), "utf8");
  const imports = [...vite.matchAll(/from\s+["']\.\/(tools\/[^"']+)["']/g)].map((match) => match[1] ?? "");
  const platform = readConfig("tsconfig.platform.json").include ?? [];

  it("imports at least one local backend", () => {
    expect(imports.length).toBeGreaterThan(0);
  });

  for (const specifier of imports) {
    const file = specifier.endsWith(".ts") ? specifier : `${specifier}.ts`;
    it(`${file} exists and is type-checked by tsconfig.platform.json`, () => {
      expect(existsSync(join(ROOT, file)), `${file} is imported by vite.config.ts but missing`).toBe(true);
      const source = readFileSync(join(ROOT, file), "utf8");
      // The V1.4 backend serves the V1.4 app until cutover; it is not a V1.6.1 platform file.
      if (source.includes("multiplayer-v14")) return;
      expect(platform.some((pattern) => globToRegExp(pattern).test(file)), `${file} is not in tsconfig.platform.json`).toBe(true);
    });
  }
});

describe("V1.6.1 platform tools and build inputs (§3.9, §10.1)", () => {
  const platform = readConfig("tsconfig.platform.json").include ?? [];
  const vite = readFileSync(join(ROOT, "vite.config.ts"), "utf8");

  for (const tool of ["tools/localBackendV161.ts", "tools/uiFixtures.ts", "tools/fixturePrivacy.ts"]) {
    it(`tsconfig.platform.json lists ${tool}`, () => {
      expect(platform).toContain(tool);
      expect(existsSync(join(ROOT, tool))).toBe(true);
    });
  }

  for (const page of ["next/index.html", "next/playtest.html"]) {
    it(`the build always includes ${page}`, () => {
      expect(existsSync(join(ROOT, page)), `${page} is missing`).toBe(true);
      expect(vite).toContain(`\${projectRoot}${page}`);
    });
  }

  it("never makes a build input conditional on the file existing, and never builds the gallery", () => {
    expect(vite).not.toMatch(/existsSync/);
    expect(vite).not.toContain("${projectRoot}next/gallery");
  });
});
