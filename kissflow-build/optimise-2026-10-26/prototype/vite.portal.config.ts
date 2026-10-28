// Build of the CIQ Supplier Portal custom UI: one self-contained HTML file (JS + CSS + fonts inlined),
// HashRouter, relative base (master.md §6.12). Output: dist-portal/portal.html → zipped as index.html by
// scripts/zip-portal.mjs together with manifest.json.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

// 22 Oct (Thomas: the portal screens call the portal's "Mail Integration - Thomas"): only the token of .env
// MAIL_WEBHOOK_URL_PORTAL is built in, at build time (never in the source); host and account are the page's own at
// runtime (portal.ts mailHookFor), so the same build works in prod.
const envFile = path.resolve(__dirname, "../.env");
const mailToken = (existsSync(envFile) ? readFileSync(envFile, "utf8") : "").match(/^MAIL_WEBHOOK_URL_PORTAL=\s*["']?https:\/\/[^/\s]+\/integration\/2\/[A-Za-z0-9_-]+\/webhook\/([A-Za-z0-9_-]+)["']?\s*$/m)?.[1] ?? "";
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true })],
  base: "",
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom"],
    alias: { "@": path.resolve(__dirname, "src") },
  },
  define: { __PORTAL_BUILD__: JSON.stringify(new Date().toISOString()), __CIQ_MAIL_TOKEN__: JSON.stringify(mailToken) },
  build: {
    target: "es2022",
    outDir: "dist-portal",
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 5000,
    rollupOptions: { input: path.resolve(__dirname, "portal.html") },
  },
});
