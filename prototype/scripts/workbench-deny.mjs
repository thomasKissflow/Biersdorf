// The deny-list for what the CIQ Workbench ships to Beiersdorf testers (review fix F-09). Used by:
//   - scripts/zip-workbench.mjs: the build fails when the bundled index.html matches (library code included);
//   - src/workbench/guards.spec.ts: the source scan (string literals of the app, comments stripped).
// Kissflow hosts and auth headers must never be in the bundle; internal names, test ids and doc references must never
// be shown to a user. Reads nothing; no account id or credential is written here.

/** Hosts and auth headers (any case). */
export const DENY_HOSTS = /kissflow\.(eu|com)|dev-beiersdorf|\bauthorization\b|\bbearer\s/i;

/** Kissflow-internal names, test ids and doc references. "(D23)" and "(Q9)" count only after a space, as in prose:
 *  minified code calls functions with short names, e.g. `catch(Q4)`, which is not a reference. */
export const DENY_CONTENT = /\bThomas\b|\bK-(14|WB|19P)\b|\bWB-D\d|SPIKES|UI-LOG|SEC-HR\d|\bbrd:|\bdec:|\s\(D\d{2}\)|\s\(Q\d+\)|\(stub,/;

/**
 * Verified library hits that may stay (exact matched text + a fragment of the surrounding minified code). Empty: the
 * 2026-10-08 bundle had none. Add one only after reading the hit in the bundle.
 */
export const DENY_ALLOW = [];

/** Every deny-list hit in `text`, with 40 characters of context on each side. */
export function denyHits(text) {
  const hits = [];
  for (const [name, re] of [
    ["host/header", DENY_HOSTS],
    ["internal", DENY_CONTENT],
  ]) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    for (const m of text.matchAll(g)) {
      const at = m.index ?? 0;
      const context = text.slice(Math.max(0, at - 40), at + m[0].length + 40);
      if (DENY_ALLOW.some((a) => a.match === m[0] && context.includes(a.near))) continue;
      hits.push({ kind: name, match: m[0], at, context });
    }
  }
  return hits;
}
