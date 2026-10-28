// Build stamp, injected by vite.portal.config.ts (define). Shown in Diagnostics so "which build is running?" is answerable.
declare const __PORTAL_BUILD__: string | undefined;
export const BUILD: string = typeof __PORTAL_BUILD__ === "string" ? __PORTAL_BUILD__ : "dev";
