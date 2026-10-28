// CIQ Workbench unit tests (WORKBENCH-DESIGN.md §10.1): only src/workbench/**/*.spec.{ts,tsx}. The prototype's own
// vitest run (vite.config.ts) collects *.test.* files only, so the two runs never overlap.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom"],
    alias: { "@": path.resolve(__dirname, "src") },
  },
  define: { __WORKBENCH_BUILD__: JSON.stringify("test") },
  test: { environment: "node", include: ["src/workbench/**/*.spec.{ts,tsx}"] },
});
