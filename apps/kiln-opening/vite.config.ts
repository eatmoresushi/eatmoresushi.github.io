import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localBackendPlugin } from "./test/e2e/localBackend";

export default defineConfig({
  base: "/kiln-opening/",
  plugins: [
    react(),
    ...(process.env["VITE_E2E_LOCAL_BACKEND"] === "1" ? [localBackendPlugin()] : []),
  ],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
