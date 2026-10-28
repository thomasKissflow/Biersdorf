// The live suite (kissflow-build/ciq-digital/tests-2026-10-21/SPEC.md §3): live/**/*.live.ts only, never part of
// `npm test` (vite.config.ts includes src/**/*.test.* only). One file at a time, no concurrency, no retries, a long
// timeout (a live run is paced at 2.5 s per Kissflow call). LIVE=1 runs against the dev sandbox; otherwise offline.
//   npx vitest run --config vitest.live.config.ts [file]
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const TWENTY_MINUTES = 20 * 60 * 1000;

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom"],
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["live/**/*.live.ts"],
    fileParallelism: false,
    sequence: { concurrent: false },
    // a window (KF_WINDOW) leaves half of each hour idle; the suites set their own, longer timeouts from GAP_MS
    testTimeout: process.env.KF_WINDOW ? 8 * 60 * 60_000 : TWENTY_MINUTES,
    hookTimeout: TWENTY_MINUTES,
    retry: 0,
  },
});
