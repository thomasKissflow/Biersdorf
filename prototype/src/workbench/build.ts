// Build stamp, injected by vite.workbench.config.ts (define). Shown in Diagnostics and the nav footer, so "which build
// is running?" is answerable. zip-workbench.mjs refuses a bundle that does not carry it.
export const BUILD: string = typeof __WORKBENCH_BUILD__ === "string" ? __WORKBENCH_BUILD__ : "dev";
/** @kissflow/lowcode-client-sdk version bundled (package.json pins 1.0.49). */
export const SDK_VERSION = "1.0.49";
