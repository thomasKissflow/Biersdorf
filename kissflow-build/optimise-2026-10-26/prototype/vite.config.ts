import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { FINAL_PDF_DIRS, finalPdf } from "./vite.finalpdf";

export default defineConfig({
  plugins: [react(), tailwindcss(), finalPdf()],
  base: "",
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom"],
    alias: { "@": path.resolve(__dirname, "src") }
  },
  server: { port: 5310, host: "127.0.0.1", strictPort: true, fs: { allow: [__dirname, ...FINAL_PDF_DIRS] } },
  build: { target: "es2022", chunkSizeWarningLimit: 2500 },
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"] }
});
