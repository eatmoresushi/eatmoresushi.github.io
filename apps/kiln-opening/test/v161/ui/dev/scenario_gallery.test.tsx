/**
 * The scenario gallery's own chrome meets the §8.1 / §9.6 checks that `gallery.spec` runs at
 * phone sizes: the 中文 toggle is marked `lang="zh-Hans"` (so it takes the 13px Chinese floor),
 * and every index link and toolbar control is a 44px target at ≤899px.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScenarioGallery } from "../../../../src/app/dev/ScenarioGallery.tsx";
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
