// The app UI's environment check is the shared one (src/shell/env.ts), also used by the portal UI. The Kissflow page
// around the app's frame (hookHostOf) is the app's own: the hand-off URLs are built on it (write/handoff.ts webhooksOf),
// since production differs from the dev sandbox in both its domain and its account (Thomas, 21 Oct). No host is named
// here: the pattern below is all the bundle knows (scripts/workbench-deny.mjs DENY_HOSTS).
export { DEV_ACCOUNT, envOf, type AppEnv } from "@/shell/env";

/** A host under Kissflow's own domains (one or more labels, then the Kissflow domain of the EU or the global cloud). */
export const KISSFLOW_HOST = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+kissflow\.(?:eu|com)$/;

/** What hookHostOf reads of the page: the browser's window in the app, a stand-in in tests. */
export interface PageLike {
  location?: { ancestorOrigins?: ArrayLike<string> | null };
  document?: { referrer?: string };
}

/**
 * The host of the Kissflow page the app's frame runs in: the parent's origin (location.ancestorOrigins[0]), or, where
 * the browser has no ancestorOrigins (Firefox), the origin of document.referrer. Accepted only on https, without a port
 * or user info, under a Kissflow domain (KISSFLOW_HOST); otherwise undefined, and a hand-off goes by kf.api on a
 * relative path (kf/client.ts postWebhook). A parent that is known but not acceptable is not second-guessed from the
 * referrer.
 */
export function hookHostOf(page: PageLike | undefined = globalThis as PageLike): string | undefined {
  try {
    const ancestors = page?.location?.ancestorOrigins;
    const origin = ancestors && ancestors.length > 0 ? ancestors[0] : page?.document?.referrer ? new URL(page.document.referrer).origin : undefined;
    if (!origin) return undefined;
    const u = new URL(origin);
    return u.protocol === "https:" && !u.port && !u.username && !u.password && KISSFLOW_HOST.test(u.hostname) ? u.hostname : undefined;
  } catch {
    return undefined; // an opaque ("null") or unreadable origin: no host
  }
}
