// Build stamp of the live internal UI, injected by vite.applive.config.ts (define). Shown in Diagnostics so "which build
// is running?" is answerable; zip-applive.mjs refuses a bundle that doesn't carry it. "dev" under vite dev and vitest.
declare const __APPLIVE_BUILD__: string | undefined;
export const BUILD: string = typeof __APPLIVE_BUILD__ === "string" ? __APPLIVE_BUILD__ : "dev";
