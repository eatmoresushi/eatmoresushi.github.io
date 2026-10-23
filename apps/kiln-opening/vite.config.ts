import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { localBackendV161Plugin } from "./tools/localBackendV161.ts";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const localBackend = process.env["VITE_E2E_LOCAL_BACKEND"] === "1";

/**
 * Cutover (UI plan §1.2, §10.4 C2.1): the V1.6.2 app is `index.html` → `src/app/main.tsx` at
 * `/kiln-opening/`, and its playtest form `playtest/index.html` → `src/app/playtest/main.tsx` at
 * `/kiln-opening/playtest/`. The V1.4 entry modules (`src/main.tsx`, `src/playtest-main.tsx`)
 * are no build input; their sources stay in the tree only until the deletion commit (C2.2).
 *
 * The phase 4 preview pages under `next/` are gone (owner instruction, 2026-10-24): the site has
 * no `/kiln-opening/next/` page and no redirect from it. Both pages are always inputs, so a
 * renamed or deleted page fails `npm run build` instead of silently dropping it (§10.1;
 * `tsconfig_includes.test.ts` checks this). The scenario gallery, `gallery/index.html`, is
 * dev-only and never a build input.
 */
const inputs = {
  app: `${projectRoot}index.html`,
  playtest: `${projectRoot}playtest/index.html`,
};

export default defineConfig({
  base: "/kiln-opening/",
  plugins: [
    react(),
    // The V1.6.2 local backend keeps its `/test-api-v161` path until the deletion commit moves it
    // to `/test-api` (§3.9). The V1.4 backend is no longer mounted: no page uses it.
    ...(localBackend ? [localBackendV161Plugin()] : []),
  ],
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: inputs,
    },
  },
});
