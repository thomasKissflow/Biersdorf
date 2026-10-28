// Stand-alone build of the client call view (understanding-call.html → src/call/main.tsx): one self-contained
// HTML file (JS + CSS + fonts inlined) to publish as a shareable page. Output: dist-call/understanding-call.html.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true })],
  base: "",
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom"],
    // The call view reads no demo data: replace the seed so no demo names or cases ship in the shared page.
    alias: [
      { find: "@/domain/seed", replacement: path.resolve(__dirname, "src/call/seedStub.ts") },
      { find: "@", replacement: path.resolve(__dirname, "src") },
    ],
  },
  build: {
    target: "es2022",
    outDir: "dist-call",
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 5000,
    rollupOptions: { input: path.resolve(__dirname, "understanding-call.html") },
  },
});
