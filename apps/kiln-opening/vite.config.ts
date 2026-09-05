import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { localBackendPlugin } from "./tools/localBackend";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "/kiln-opening/",
  plugins: [
    react(),
    ...(process.env["VITE_E2E_LOCAL_BACKEND"] === "1" ? [localBackendPlugin()] : []),
  ],
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: {
        game: `${projectRoot}index.html`,
        playtest: `${projectRoot}playtest/index.html`,
      },
    },
  },
});
