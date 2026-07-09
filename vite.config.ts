import { defineConfig } from "vite";

// Rapier ships as WASM; Vite needs to treat it as an asset-friendly dep.
export default defineConfig({
  server: { port: 5173 },
  optimizeDeps: {
    exclude: ["@dimforge/rapier3d-compat"],
  },
  build: {
    target: "es2022",
  },
});
