import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { localBackendPlugin } from "./tools/localBackend";
import { localBackendV161Plugin } from "./tools/localBackendV161.ts";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const localBackend = process.env["VITE_E2E_LOCAL_BACKEND"] === "1";

/**
 * The V1.6.1 app is built from `next/` during phase 4 (UI plan §1.2, K1). Both pages are always
 * inputs, so a renamed or deleted page fails `npm run build` instead of silently dropping the app
 * (§10.1; `tsconfig_includes.test.ts` checks this). `next/gallery.html` is dev-only and never a
 * build input.
 */
const nextInputs = {
  next: `${projectRoot}next/index.html`,
  "next-playtest": `${projectRoot}next/playtest.html`,
};

export default defineConfig({
  base: "/kiln-opening/",
  plugins: [
    react(),
    // V1.4 at /test-api and V1.6.1 at /test-api-v161, side by side until cutover (§3.9).
    ...(localBackend ? [localBackendPlugin(), localBackendV161Plugin()] : []),
  ],
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: {
        game: `${projectRoot}index.html`,
        playtest: `${projectRoot}playtest/index.html`,
        ...nextInputs,
      },
    },
  },
});
