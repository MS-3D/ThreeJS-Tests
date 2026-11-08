import { defineConfig } from "vite";

// Pages project site is served at /ThreeJS-Tests/. Local dev and preview stay relative.
const base = process.env.GITHUB_PAGES === "true" ? "/ThreeJS-Tests/" : "./";

export default defineConfig({
  base,
  server: {
    host: "0.0.0.0",
    port: 47331,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 47331,
    strictPort: true,
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
