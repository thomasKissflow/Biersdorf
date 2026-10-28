// Build of the live internal UI of CIQ_Digital_A00 (src/app-live/DESIGN.md §7): one self-contained HTML file (JS + CSS
// + fonts inlined), HashRouter, relative base (master.md §6.12). Output: dist-applive/app-live.html → zipped as
// index.html by scripts/zip-applive.mjs together with manifest.json. A copy of vite.portal.config.ts with its own
// input, outDir and build stamp (the stamp file as vite.workbench.config.ts writes it).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { FINAL_PDF_DIRS, finalPdf } from "./vite.finalpdf";

export const APPLIVE_BUILD = new Date().toISOString();

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    finalPdf(),
    viteSingleFile({ removeViteModuleLoader: true }),
    // The stamp next to the bundle, so zip-applive.mjs can assert the bundle carries it.
    { name: "applive-build-stamp", apply: "build", writeBundle: (o) => writeFileSync(path.join(o.dir ?? "dist-applive", "build-stamp.txt"), APPLIVE_BUILD) },
  ],
  base: "",
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom"],
    alias: { "@": path.resolve(__dirname, "src") },
  },
  define: { __APPLIVE_BUILD__: JSON.stringify(APPLIVE_BUILD) },
  server: { port: 5340, host: "127.0.0.1", strictPort: true, fs: { allow: [__dirname, ...FINAL_PDF_DIRS] } },
  build: {
    target: "es2022",
    outDir: "dist-applive",
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 5000,
    rollupOptions: { input: path.resolve(__dirname, "app-live.html") },
  },
});
