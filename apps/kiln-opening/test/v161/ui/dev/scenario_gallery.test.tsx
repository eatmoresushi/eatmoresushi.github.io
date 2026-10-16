/**
 * The scenario gallery's own chrome meets the §8.1 / §9.6 checks that `gallery.spec` runs at
 * phone sizes: the 中文 toggle is marked `lang="zh-Hans"` (so it takes the 13px Chinese floor),
 * and every index link and toolbar control is a 44px target at ≤899px.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScenarioGallery, galleryEntries, galleryHash, parseGalleryHash } from "../../../../src/app/dev/ScenarioGallery.tsx";
import { DECISION_WINDOW_KINDS, decisionWindow } from "../../../../src/app/state/decisionWindow.ts";
import type { GalleryPageModule } from "../../../../src/app/dev/ScenarioGallery.tsx";
import { ROOT } from "../../support/glossary.ts";

const PAGE: GalleryPageModule = { default: () => <p>page</p>, gallery: { id: "probe", title: "Probe page" } };

describe("scenario gallery chrome", () => {
  const html = renderToStaticMarkup(<ScenarioGallery pages={[PAGE]} loadFixtures={() => new Promise(() => undefined)} />);

  it("marks the Chinese language toggle as Chinese", () => {
    expect(html).toMatch(/<button type="button" lang="zh-Hans" aria-pressed="(?:true|false)">中文<\/button>/);
    expect(html).toMatch(/<button type="button" lang="en" aria-pressed="(?:true|false)">EN<\/button>/);
  });

  it("gives the toolbar buttons their own font size, and every control a 44px target at phone widths", () => {
    const css = readFileSync(join(ROOT, "src/app/dev/ScenarioGallery.css"), "utf8");
    expect(css).toMatch(/\.gallery-controls button \{[^}]*font-size: var\(--fs-meta\)/);
    const phone = css.slice(css.indexOf("@media (max-width: 899px)"));
    expect(phone).toMatch(/\.gallery-group a \{[^}]*min-height: var\(--target-min\)/);
    expect(phone).toMatch(/\.gallery-controls button,\s*\.gallery-controls select \{[^}]*min-height: var\(--target-min\)/);
  });
});

describe("scenario gallery entries (§9.5)", () => {
  const files = [JSON.parse(readFileSync(join(ROOT, "test/v161/ui/fixtures/scenarios.json"), "utf8")), JSON.parse(readFileSync(join(ROOT, "test/v161/ui/fixtures/moments.json"), "utf8"))] as const;
  const entries = galleryEntries([PAGE], files);

  it("lists every scripted scenario, every played moment, the shell states and every page", () => {
    const ids = new Set(entries.map((entry) => entry.id));
    for (const file of files) for (const entry of file.entries as { id: string }[]) expect(ids.has(entry.id), entry.id).toBe(true);
    for (const id of ["shell-home", "shell-home-saved", "shell-lobby-host", "shell-lobby-guest", "shell-reconnecting", "shell-offline", "shell-computer-failure", "shell-unsent", "shell-ended"]) {
      expect(ids.has(id), id).toBe(true);
    }
    expect(ids.has("probe")).toBe(true);
    expect(ids.size).toBe(entries.length);
  });

  it("covers every decision window kind, the windows the wireframe did not design included", () => {
    const kinds = new Set(
      entries.flatMap((entry) => {
        if (entry.group === "Pages") return [];
        const view = entry.makeSource().getServerSnapshot().view;
        return view === null ? [] : [decisionWindow(view).kind];
      }),
    );
    for (const kind of DECISION_WINDOW_KINDS) expect(kinds.has(kind), kind).toBe(true);
  });

  it("selects an entry, a language, a theme, a board and the bare view from the hash", () => {
    expect(parseGalleryHash("#m14_salvage?lang=zh-CN&theme=dark&board=p2&bare=1")).toEqual({ id: "m14_salvage", lang: "zh-CN", theme: "dark", board: "p2", bare: true });
    expect(parseGalleryHash("#w-salvage")).toEqual({ id: "w-salvage", lang: "en", theme: "light", board: null, bare: false });
    expect(galleryHash({ id: "w-salvage", lang: "zh-CN", theme: "light", board: null, bare: true })).toBe("#w-salvage?lang=zh-CN&bare=1");
  });
});
