// The stylesheet entry must be the first import (§7.2): it fixes the cascade-layer order.
import "../styles/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyTheme } from "../theme.ts";
import { ScenarioGallery, parseGalleryHash } from "./ScenarioGallery.tsx";
import type { FixtureFile, GalleryPageModule } from "./ScenarioGallery.tsx";

/**
 * The scenario gallery entry (UI_V1.6.1_ARCHITECTURE §9.5): `next/gallery.html`, dev only.
 *
 * - Pages: every `dev/*.gallery.tsx` (A3's kit gallery included), discovered here and loaded
 *   lazily: an eager glob is hoisted above the stylesheet import, which would declare the
 *   `components` layer before `styles/index.css` fixes the layer order (§7.2).
 * - Fixtures: `test/v161/ui/fixtures/{scenarios,moments}.json`, loaded lazily through
 *   `import.meta.glob`, so tsc never types them and they are never a build input (§2).
 */
const pageModules = import.meta.glob<GalleryPageModule>("./*.gallery.tsx");
const fixtureModules = import.meta.glob<{ default: FixtureFile }>("../../../test/v161/ui/fixtures/*.json");

async function loadPages(): Promise<GalleryPageModule[]> {
  const loaded = await Promise.all(Object.keys(pageModules).sort().map((path) => pageModules[path]?.()));
  return loaded.filter((module): module is GalleryPageModule => module !== undefined && typeof module.default === "function");
}

async function loadFixtures(): Promise<readonly FixtureFile[]> {
  const load = async (name: string): Promise<FixtureFile> => {
    const path = Object.keys(fixtureModules).find((candidate) => candidate.endsWith(`/${name}`));
    const loader = path === undefined ? undefined : fixtureModules[path];
    if (loader === undefined) throw new Error(`fixture file ${name} not found`);
    return (await loader()).default;
  };
  return Promise.all([load("scenarios.json"), load("moments.json")]);
}

applyTheme(parseGalleryHash(window.location.hash).theme);

const container = document.getElementById("root");
if (container === null) throw new Error("The page has no #root element.");

void loadPages().then((pages) => {
  createRoot(container).render(
    <StrictMode>
      <ScenarioGallery pages={pages} loadFixtures={loadFixtures} />
    </StrictMode>,
  );
});
