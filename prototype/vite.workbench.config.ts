// Build of the CIQ Workbench custom UI (WORKBENCH-DESIGN.md §10): one self-contained HTML file (JS + CSS + fonts
// inlined), HashRouter, relative base. Output: dist-workbench/workbench.html → zipped as index.html by
// scripts/zip-workbench.mjs together with manifest.json. A copy of vite.portal.config.ts with its own input,
// outDir and build stamp.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { writeFileSync } from "node:fs";
import path from "node:path";

export const WORKBENCH_BUILD = new Date().toISOString();

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile({ removeViteModuleLoader: true }),
    // The stamp next to the bundle, so zip-workbench.mjs can assert the bundle carries it.
    { name: "wb-build-stamp", apply: "build", writeBundle: (o) => writeFileSync(path.join(o.dir ?? "dist-workbench", "build-stamp.txt"), WORKBENCH_BUILD) },
  ],
  base: "",
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom"],
    alias: { "@": path.resolve(__dirname, "src") },
  },
  define: { __WORKBENCH_BUILD__: JSON.stringify(WORKBENCH_BUILD) },
  server: { port: 5330, host: "127.0.0.1", strictPort: true },
  build: {
    target: "es2022",
    outDir: "dist-workbench",
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 5000,
    rollupOptions: { input: path.resolve(__dirname, "workbench.html") },
  },
});
